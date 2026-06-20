"""
yfinance FastAPI sidecar for NSE 500 stock data.
Serves on port 8015. Called by the Next.js dashboard API routes.

Endpoints:
  GET  /snapshot?ticker=RELIANCE.NS
  GET  /history?ticker=RELIANCE.NS&period=1y&interval=1d
  GET  /financials?ticker=RELIANCE.NS
  GET  /news?ticker=RELIANCE.NS
  GET  /technicals?ticker=RELIANCE.NS
  GET  /forecast?ticker=RELIANCE.NS&horizon=30&capital=100000&risk=0.02
  GET  /health
  DELETE /cache  (requires X-Cache-Secret header)
"""

import asyncio
import logging
import os
import re
import time
import requests
from bs4 import BeautifulSoup
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from threading import Lock

import yfinance as yf
import pandas as pd
from pydantic import BaseModel
import pandas_ta as ta
from fastapi import FastAPI, Query, HTTPException, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from forecasting_engine import (
    run_forecast, compute_position_sizing, run_backtest,
    compute_indicators, is_timesfm_enabled,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NSE Stock Sidecar", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3020", "http://127.0.0.1:3020",
    ],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# Env-tunable config
_WORKER_THREADS = int(os.getenv("WORKER_THREADS", 4))
executor = ThreadPoolExecutor(max_workers=_WORKER_THREADS)

# Secret for the cache-clear endpoint (set CACHE_SECRET env var in production)
_CACHE_SECRET = os.getenv("CACHE_SECRET", "")  # empty = endpoint disabled unless secret set

# Maximum tickers per batch request
MAX_BATCH = 50

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache to avoid hammering Yahoo Finance
# ---------------------------------------------------------------------------
_cache: dict = {}
_cache_lock = Lock()

# Known-bad tickers that return 404 â€” skip them to avoid burning rate limits
KNOWN_BAD_TICKERS: set = {"TATAMOTORS.NS", "HDFC.NS", "TATAMOTORS-DVR.NS"}

# Ticker aliases â€” if a symbol maps to a different Yahoo ticker
TICKER_ALIASES: dict = {
    # TATAMOTORS delisted from Yahoo; use TATAMOTOR (no S) on BSE as fallback
    "TATAMOTORS.NS": "TATAMOTORS.BO",
}

# TTLs are env-overridable for easy tuning without code changes
SNAPSHOT_TTL   = int(os.getenv("SNAPSHOT_TTL",   300))   # 5 minutes
HISTORY_TTL    = int(os.getenv("HISTORY_TTL",    900))   # 15 minutes
FINANCIALS_TTL = int(os.getenv("FINANCIALS_TTL", 7200))  # 2 hours
FORECAST_TTL  = int(os.getenv("FORECAST_TTL",   900))   # 15 minutes
BAD_TICKER_TTL = int(os.getenv("BAD_TICKER_TTL", 3600))  # 1 hour


def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.monotonic() < entry["expires"]:
            return entry["data"]
    return None


def _cache_set(key: str, data, ttl: int):
    with _cache_lock:
        _cache[key] = {"data": data, "expires": time.monotonic() + ttl}


def _cache_clear_expired():
    """Prune stale entries to prevent unbounded growth."""
    now = time.monotonic()
    with _cache_lock:
        expired = [k for k, v in _cache.items() if now >= v["expires"]]
        for k in expired:
            del _cache[k]


def _resolve_ticker(sym: str) -> str:
    """Resolve ticker aliases."""
    return TICKER_ALIASES.get(sym, sym)


def _safe_float(v):
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        return float(v)
    except Exception:
        return None


def _clean_numeric(s: str) -> str:
    return s.replace("₹", "").replace("%", "").replace(",", "").strip()


def _parse_float_screener(s: str) -> float | None:
    try:
        val = _clean_numeric(s)
        if "Cr." in val:
            val = val.replace("Cr.", "").strip()
            return float(val) * 1e7
        return float(val)
    except Exception:
        return None


def _scrape_screener(symbol: str) -> dict:
    symbol_upper = symbol.upper()
    if symbol_upper.startswith("^") or symbol_upper.endswith("=F") or not ("." in symbol_upper):
        return {}

    base_sym = symbol_upper.split(".")[0]
    
    # Check cache first
    cache_key = f"screener:{base_sym}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = f"https://www.screener.in/company/{base_sym}/consolidated/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    raw_ratios = {}
    normalized = {}

    try:
        session = requests.Session()
        res = session.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            url = f"https://www.screener.in/company/{base_sym}/"
            res = session.get(url, headers=headers, timeout=10)
            
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")
            for li in soup.select("#top-ratios li"):
                name_el = li.select_one(".name")
                value_el = li.select_one(".value")
                if name_el and value_el:
                    name_text = name_el.text.strip()
                    val_text = " ".join(value_el.text.split())
                    raw_ratios[name_text] = val_text

            pe_str = raw_ratios.get("Stock P/E")
            if pe_str:
                normalized["pe_ratio"] = _parse_float_screener(pe_str)

            pb_str = raw_ratios.get("Price to book") or raw_ratios.get("Price to Book")
            if pb_str:
                normalized["pb_ratio"] = _parse_float_screener(pb_str)

            div_str = raw_ratios.get("Dividend Yield")
            if div_str:
                div_val = _parse_float_screener(div_str)
                if div_val is not None:
                    normalized["dividend_yield"] = div_val / 100.0

            mc_str = raw_ratios.get("Market Cap")
            if mc_str:
                normalized["market_cap"] = _parse_float_screener(mc_str)

            hl_str = raw_ratios.get("High / Low")
            if hl_str:
                parts = hl_str.split("/")
                normalized["fifty_two_week_high"] = _parse_float_screener(parts[0])
                if len(parts) > 1:
                    normalized["fifty_two_week_low"] = _parse_float_screener(parts[1])

            bv_str = raw_ratios.get("Book Value")
            if bv_str:
                normalized["book_value"] = _parse_float_screener(bv_str)

            normalized["screener_ratios"] = raw_ratios
            _cache_set(cache_key, normalized, FINANCIALS_TTL)
            return normalized
    except Exception as e:
        logger.error(f"Error scraping screener.in for {base_sym}: {e}")

    _cache_set(cache_key, {}, 300)
    return {}


def _get_snapshot(ticker_sym: str) -> dict:
    # Check cache first
    cache_key = f"snap:{ticker_sym}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Skip known-bad tickers quickly
    if ticker_sym in KNOWN_BAD_TICKERS:
        result = {"ticker": ticker_sym, "name": ticker_sym, "price": None, "change_percent": 0, "error": "delisted"}
        _cache_set(cache_key, result, BAD_TICKER_TTL)
        return result

    resolved = _resolve_ticker(ticker_sym)
    t = yf.Ticker(resolved)
    info = {}
    try:
        info = t.info or {}
    except Exception as e:
        print(f"Error fetching info for {ticker_sym}: {e}")
    
    price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
    prev_close = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
    
    # Fallback for indices where info is often empty
    if price is None or prev_close is None:
        try:
            hist = t.history(period="2d")
            if not hist.empty:
                if price is None:
                    price = _safe_float(hist["Close"].iloc[-1])
                if prev_close is None and len(hist) > 1:
                    prev_close = _safe_float(hist["Close"].iloc[-2])
                elif prev_close is None:
                    prev_close = _safe_float(hist["Open"].iloc[-1])
        except Exception:
            pass

    change = round(price - prev_close, 4) if price and prev_close else None
    pct_change = round((change / prev_close) * 100, 4) if change and prev_close else None

    # Fallback to screener values if yfinance returns None or NaN
    screener_data = {}
    if ticker_sym.upper().endswith(".NS") or ticker_sym.upper().endswith(".BO"):
        try:
            screener_data = _scrape_screener(ticker_sym) or {}
        except Exception as e:
            logger.error(f"Screener scraping error during snapshot: {e}")

    mc_val = info.get("marketCap")
    if mc_val is None or (isinstance(mc_val, float) and pd.isna(mc_val)) or mc_val == 0:
        mc_val = screener_data.get("market_cap")

    pe_val = _safe_float(info.get("trailingPE"))
    if pe_val is None or pe_val == 0:
        pe_val = screener_data.get("pe_ratio")

    pb_val = _safe_float(info.get("priceToBook"))
    if pb_val is None or pb_val == 0:
        pb_val = screener_data.get("pb_ratio")

    dy_val = _safe_float(info.get("dividendYield"))
    if dy_val is None or dy_val == 0:
        dy_val = screener_data.get("dividend_yield")

    high_val = _safe_float(info.get("fiftyTwoWeekHigh"))
    if high_val is None or high_val == 0:
        high_val = screener_data.get("fifty_two_week_high")

    low_val = _safe_float(info.get("fiftyTwoWeekLow"))
    if low_val is None or low_val == 0:
        low_val = screener_data.get("fifty_two_week_low")

    result = {
        "ticker": ticker_sym,
        "name": info.get("longName") or info.get("shortName") or ticker_sym,
        "price": price,
        "open": _safe_float(info.get("open") or info.get("regularMarketOpen")),
        "high": _safe_float(info.get("dayHigh") or info.get("regularMarketDayHigh")),
        "low": _safe_float(info.get("dayLow") or info.get("regularMarketDayLow")),
        "volume": info.get("volume") or info.get("regularMarketVolume"),
        "previous_close": prev_close,
        "change": change,
        "change_percent": pct_change,
        "market_cap": mc_val,
        "pe_ratio": pe_val,
        "pb_ratio": pb_val,
        "fifty_two_week_high": high_val,
        "fifty_two_week_low": low_val,
        "eps": _safe_float(info.get("trailingEps")),
        "dividend_yield": dy_val,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "currency": info.get("currency", "INR"),
        "exchange": info.get("exchange"),
        "screener_ratios": screener_data.get("screener_ratios"),
    }
    _cache_set(cache_key, result, SNAPSHOT_TTL)
    return result


def _get_history(ticker_sym: str, period: str, interval: str) -> list:
    cache_key = f"hist:{ticker_sym}:{period}:{interval}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    resolved = _resolve_ticker(ticker_sym)
    try:
        t = yf.Ticker(resolved)
        df = t.history(period=period, interval=interval, auto_adjust=True)
    except Exception as e:
        print(f"Error fetching history for {ticker_sym}: {e}")
        return []
    if df.empty:
        return []
    df = df.reset_index()
    rows = []
    for _, row in df.iterrows():
        dt = row["Date"]
        if hasattr(dt, "date"):
            dt = str(dt.date())
        else:
            dt = str(dt)[:10]
        rows.append({
            "time": dt,
            "open": _safe_float(row.get("Open")),
            "high": _safe_float(row.get("High")),
            "low": _safe_float(row.get("Low")),
            "close": _safe_float(row.get("Close")),
            "volume": int(row.get("Volume", 0) or 0),
        })
    _cache_set(cache_key, rows, HISTORY_TTL)
    return rows


def _get_financials(ticker_sym: str, period: str = "annual") -> dict:
    cache_key = f"fin:{ticker_sym}:{period}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    def first_valid(d, *keys):
        for k in keys:
            v = d.get(k)
            if v is not None:
                return v
        return None

    resolved = _resolve_ticker(ticker_sym)
    try:
        t = yf.Ticker(resolved)

        def stmt_to_list(df):
            if df is None or df.empty:
                return []
            
            rows = []
            for col in df.columns:
                row = {
                    "fiscal_year": int(str(col)[:4]), 
                    "period": str(col)[:10]
                }
                for idx in df.index:
                    val = df.at[idx, col]
                    key = str(idx).lower().replace(" ", "_").replace("/", "_").replace("-", "_")
                    row[key] = _safe_float(val)
                
                row["revenue"] = first_valid(row, "total_revenue", "operating_revenue", "gross_revenue", "revenue")
                row["eps_diluted"] = first_valid(row, "diluted_eps", "basic_eps") or 0
                row["total_liabilities"] = first_valid(row, "total_liabilities", "total_liabilities_net_minority_interest")
                row["total_equity"] = first_valid(row, "stockholders_equity", "total_equity_gross_minority_interest", "total_equity")
                row["cash_and_equivalents"] = first_valid(row, "cash_and_cash_equivalents", "cash_cash_equivalents_and_short_term_investments", "cash_cash_equivalents_and_federal_funds_sold", "cash_financial", "cash_and_equivalents")
                row["capital_expenditures"] = first_valid(row, "capital_expenditure", "capital_expenditure_reported", "purchase_of_ppe", "capital_expenditures")
                
                # Special mapping for insurance companies
                if "net_policyholder_benefits_and_claims" in row:
                    claims = row.get("net_policyholder_benefits_and_claims") or 0
                    row["gross_profit"] = row["revenue"] - claims if row["revenue"] is not None else None
                else:
                    row["gross_profit"] = first_valid(row, "gross_profit", "net_interest_income")
                    
                row["ebitda"] = first_valid(row, "ebitda", "normalized_ebitda", "pretax_income")
                row["net_income"] = first_valid(row, "net_income", "net_income_common_stockholders")
                row["operating_income"] = first_valid(row, "operating_income", "pretax_income", "normalized_income", "net_interest_income")
                row["total_assets"] = first_valid(row, "total_assets")
                row["total_debt"] = first_valid(row, "total_debt", "long_term_debt", "net_debt")
                row["operating_cash_flow"] = first_valid(row, "operating_cash_flow", "cash_flow_from_continuing_operating_activities", "cash_flowsfromusedin_operating_activities_direct", "cash_flows_from_used_in_operating_activities_direct")
                row["investing_cash_flow"] = first_valid(row, "investing_cash_flow", "cash_flow_from_continuing_investing_activities")
                row["financing_cash_flow"] = first_valid(row, "financing_cash_flow", "cash_flow_from_continuing_financing_activities")
                row["free_cash_flow"] = first_valid(row, "free_cash_flow")
                
                rows.append(row)
            return rows

        if period == "quarterly":
            income = stmt_to_list(t.quarterly_income_stmt)
            balance = stmt_to_list(t.quarterly_balance_sheet)
            cashflow = stmt_to_list(t.quarterly_cashflow)
        else:
            income = stmt_to_list(t.income_stmt)
            balance = stmt_to_list(t.balance_sheet)
            cashflow = stmt_to_list(t.cashflow)
            
        # Post-process list of dicts to fix/calculate fields and filter out empty data years
        # Re-use first_valid helper defined above (same logic)

        filtered_income = []
        for inc_r in income:
            rev = inc_r.get("revenue")
            net_inc = inc_r.get("net_income")
            # Skip if both revenue and net_income are missing or zero
            if (rev is None or rev == 0) and (net_inc is None or net_inc == 0):
                continue
                
            fy = inc_r.get("fiscal_year")
            bal_r = next((r for r in balance if r.get("fiscal_year") == fy), {})
            
            eps_val = inc_r.get("eps_diluted")
            if eps_val is None or eps_val == 0 or abs(eps_val) > 10000:
                if net_inc:
                    # Calculate EPS = Net Income / Shares Outstanding
                    shares = first_valid(bal_r, "ordinary_shares_number", "share_issued", "capital_stock")
                    if not shares:
                        for b in balance:
                            shares = first_valid(b, "ordinary_shares_number", "share_issued", "capital_stock")
                            if shares:
                                break
                    if not shares:
                        for i_r in income:
                            shares = first_valid(i_r, "diluted_average_shares", "basic_average_shares")
                            if shares:
                                break
                    if shares:
                        inc_r["eps_diluted"] = net_inc / shares
                    else:
                        inc_r["eps_diluted"] = 0.0
            
            filtered_income.append(inc_r)
            
        if filtered_income:
            valid_years = {r["fiscal_year"] for r in filtered_income}
            filtered_balance = [r for r in balance if r.get("fiscal_year") in valid_years]
            filtered_cashflow = [r for r in cashflow if r.get("fiscal_year") in valid_years]
        else:
            filtered_income = income
            filtered_balance = balance
            filtered_cashflow = cashflow

        result = {"income": filtered_income, "balance": filtered_balance, "cashflow": filtered_cashflow}
        _cache_set(cache_key, result, FINANCIALS_TTL)
        return result
    except Exception as e:
        print(f"Error fetching financials for {ticker_sym}: {e}")
        return {"income": [], "balance": [], "cashflow": []}


def _get_news(ticker_sym: str) -> list:
    # Clean the ticker symbol for search query
    clean_ticker = ticker_sym.replace(".NS", "").replace(".BO", "").replace("^", "")
    query = f"{clean_ticker}+stock+when:14d"
    url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req, timeout=5).read()
        root = ET.fromstring(res)
    except Exception as e:
        print(f"Error fetching news for {ticker_sym}: {e}")
        return []

    result = []
    for item in root.findall('.//item')[:25]:
        title_raw = item.find('title').text if item.find('title') is not None else ""
        link = item.find('link').text if item.find('link') is not None else ""
        pub_date_raw = item.find('pubDate').text if item.find('pubDate') is not None else ""
        
        if ' - ' in title_raw:
            title, source = title_raw.rsplit(' - ', 1)
        else:
            title, source = title_raw, 'Google News'
            
        try:
            dt = parsedate_to_datetime(pub_date_raw)
            published_at = dt.isoformat()
        except:
            published_at = ""
            
        result.append({
            "title": title,
            "url": link,
            "source": source,
            "published_at": published_at,
            "summary": ""
        })

    result.sort(key=lambda x: x["published_at"], reverse=True)
    return result[:15]


def _validate_ticker(ticker: str):
    """Validate ticker format. Raises 400 on invalid input."""
    if not ticker or not re.match(r"^[A-Z0-9.\-_^=&]{1,20}$", ticker, re.I):
        raise HTTPException(status_code=400, detail="Invalid ticker format")


@app.get("/snapshot")
async def snapshot(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(executor, _get_snapshot, ticker)
        return {"snapshot": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/snapshot/batch")
async def snapshot_batch(req: list[str] = Body(...)):
    # Security: cap batch size to prevent resource exhaustion
    if len(req) > MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size {len(req)} exceeds maximum of {MAX_BATCH}",
        )
    # Validate every ticker before touching Yahoo Finance
    for sym in req:
        _validate_ticker(sym)

    loop = asyncio.get_running_loop()
    try:
        _cache_clear_expired()

        def _get_all(tickers: list[str]) -> dict:
            result: dict = {}
            uncached: list[str] = []
            for t in tickers:
                cached = _cache_get(f"snap:{t}")
                if cached is not None:
                    result[t] = cached
                elif t in KNOWN_BAD_TICKERS:
                    result[t] = {"change_percent": 0, "error": "delisted"}
                else:
                    uncached.append(t)

            for sym in uncached:
                try:
                    result[sym] = _get_snapshot(sym)
                    time.sleep(0.15)  # 150 ms between requests to avoid rate limits
                except Exception:
                    result[sym] = {"change_percent": 0}
            return result

        data = await loop.run_in_executor(executor, _get_all, req)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/history")
async def history(
    ticker: str = Query(...),
    period: str = Query("1y"),
    interval: str = Query("1d"),
):
    _validate_ticker(ticker)
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(executor, _get_history, ticker, period, interval)
        return {"prices": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/financials")
async def financials(ticker: str = Query(...), period: str = Query("annual")):
    _validate_ticker(ticker)
    if period not in ("annual", "quarterly"):
        raise HTTPException(status_code=400, detail="period must be 'annual' or 'quarterly'")
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(executor, _get_financials, ticker, period)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/news")
async def news(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(executor, _get_news, ticker)
        return {"news": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MomentumRequest(BaseModel):
    symbols: list[str]
    min_gain: float = 3.5
    check_consolidation: bool = True
    rsi_min: float = 45.0
    rsi_max: float = 70.0
    vol_surge: float = 1.5
    check_sma50: bool = False
    check_macd: bool = False
    top_n: int = 50

class WMARequest(BaseModel):
    symbols: list[str]
    top_n: int = 50

class EMACrossoverRequest(BaseModel):
    symbols: list[str]
    top_n: int = 50

class BreakoutScannerRequest(BaseModel):
    symbols: list[str]
    breakout: str = "1y"
    tf: str = "daily"
    vol_multiplier: float = 1.5
    tolerance_pct: float = 1.0
    min_price: float = 20.0
    min_mcap: float = 500.0
    max_de: float = 1.5
    strict: bool = False
    no_fundamentals: bool = False
    top_n: int = 50

class VCPRequest(BaseModel):
    symbols: list[str]
    index_symbol: str = "^NSEI"
    top_n: int = 50

class EPRequest(BaseModel):
    symbols: list[str]
    top_n: int = 50

class ORBRequest(BaseModel):
    symbols: list[str]
    volume_multiplier: float = 1.5
    max_range_atr_ratio: float = 2.0
    min_rr: float = 1.5
    top_n: int = 50

def _scan_momentum(params: MomentumRequest) -> list:
    if not params.symbols:
        return []
    
    # Bulk download 3 months of data to ensure we have enough for 20-day MA and RSI
    df = yf.download(
        params.symbols, 
        period="3mo", 
        interval="1d", 
        group_by="ticker", 
        threads=True, 
        auto_adjust=True,
        progress=False
    )
    
    results = []
    
    # If only one symbol is passed, yfinance returns a flat column structure instead of MultiIndex
    is_multi = isinstance(df.columns, pd.MultiIndex)
    
    for symbol in params.symbols:
        try:
            if is_multi:
                if symbol not in df.columns.levels[0]:
                    continue
                ticker_df = df[symbol].dropna(how="all")
            else:
                ticker_df = df.dropna(how="all")
            
            if len(ticker_df) < 30:
                continue
                
            close = ticker_df["Close"]
            high = ticker_df["High"]
            low = ticker_df["Low"]
            volume = ticker_df["Volume"]
            
            # Calculate technicals
            rsi = ta.rsi(close, length=14)
            sma20_vol = ta.sma(volume, length=20)
            
            sma50 = ta.sma(close, length=50) if params.check_sma50 else None
            macd_df = ta.macd(close) if params.check_macd else None
            
            if rsi is None or rsi.empty or sma20_vol is None or sma20_vol.empty:
                continue
                
            burst_found = False
            match_data = None
            
            # Check for a burst on the current day or the previous 2 trading days
            # We iterate backwards from -1 (today) to -3
            for i in range(-1, -4, -1):
                try:
                    day_close = _safe_float(close.iloc[i])
                    yday_close = _safe_float(close.iloc[i-1])
                    day_vol = _safe_float(volume.iloc[i])
                    avg_vol = _safe_float(sma20_vol.iloc[i-1])
                    prev_rsi = _safe_float(rsi.iloc[i-1])
                    
                    if not all([day_close, yday_close, day_vol, avg_vol, prev_rsi]) or avg_vol == 0:
                        continue
                        
                    gain_pct = ((day_close - yday_close) / yday_close) * 100
                    
                    if gain_pct < params.min_gain:
                        continue
                        
                    if day_vol < (params.vol_surge * avg_vol):
                        continue
                        
                    if not (params.rsi_min <= prev_rsi <= params.rsi_max):
                        continue
                        
                    if params.check_sma50 and sma50 is not None:
                        if day_close < _safe_float(sma50.iloc[i]):
                            continue
                            
                    if params.check_macd and macd_df is not None:
                        # Assuming default MACD columns: MACD_12_26_9, MACDh_12_26_9, MACDs_12_26_9
                        # Check if MACD histogram is positive (bullish)
                        macd_hist_col = [c for c in macd_df.columns if c.startswith('MACDh')][0]
                        if _safe_float(macd_df[macd_hist_col].iloc[i]) <= 0:
                            continue
                        
                    if params.check_consolidation:
                        past_20_high = high.iloc[i-21:i-1].max()
                        past_20_low = low.iloc[i-21:i-1].min()
                        if past_20_low == 0:
                            continue
                        consolidation_range = ((past_20_high - past_20_low) / past_20_low) * 100
                        if consolidation_range > 15.0:
                            continue
                            
                    # Match found!
                    # Get the date of the burst
                    burst_date = str(ticker_df.index[i].date()) if hasattr(ticker_df.index[i], 'date') else str(ticker_df.index[i])
                    
                    # Store current price but metrics from the day of the burst
                    match_data = {
                        "symbol": symbol,
                        "price": _safe_float(close.iloc[-1]), # Current price
                        "change_percent": round(gain_pct, 2), # Gain on the day of burst
                        "volume_surge": round(day_vol / avg_vol, 2), # Surge on day of burst
                        "prev_rsi": round(prev_rsi, 2), # RSI prior to burst
                        "burst_date": burst_date,
                        "days_ago": abs(i) - 1 # 0 = today, 1 = yesterday, etc.
                    }
                    burst_found = True
                    break # We found the most recent burst within the window, no need to check older ones
                    
                except IndexError:
                    # If we don't have enough history for index `i`, just skip
                    continue
            
            if burst_found and match_data:
                results.append(match_data)
            
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            continue
            
    # Sort by highest gain
    results.sort(key=lambda x: x["change_percent"], reverse=True)
    return results[:params.top_n]

@app.post("/momentum-burst")
async def momentum_burst(req: MomentumRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_momentum, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _scan_wma_crossover(params: WMARequest) -> list:
    if not params.symbols:
        return []
    
    df = yf.download(
        params.symbols, 
        period="4mo", 
        interval="1d", 
        group_by="ticker", 
        threads=True, 
        auto_adjust=True,
        progress=False
    )
    
    results = []
    is_multi = isinstance(df.columns, pd.MultiIndex)
    
    for symbol in params.symbols:
        try:
            if is_multi:
                if symbol not in df.columns.levels[0]: continue
                ticker_df = df[symbol].dropna(how="all")
            else:
                ticker_df = df.dropna(how="all")
            
            if len(ticker_df) < 46: continue
                
            close = ticker_df["Close"]
            wma44 = ta.wma(close, length=44)
            rsi14 = ta.rsi(close, length=14)
            
            if wma44 is None or wma44.empty or rsi14 is None or rsi14.empty: continue
                
            # Check current day + past 3 days (4 total)
            for i in range(-1, -5, -1):
                day_close = _safe_float(close.iloc[i])
                yday_close = _safe_float(close.iloc[i-1])
                day_wma = _safe_float(wma44.iloc[i])
                yday_wma = _safe_float(wma44.iloc[i-1])
                day_rsi = _safe_float(rsi14.iloc[i])
                
                # Crossover logic: Yesterday below WMA, Today above WMA, and Today RSI > 50
                if yday_close <= yday_wma and day_close > day_wma and day_rsi > 50:
                    burst_date = str(ticker_df.index[i])[:10]
                    days_ago = abs(i + 1)
                    
                    results.append({
                        "symbol": symbol,
                        "price": _safe_float(close.iloc[-1]),
                        "crossover_price": day_close,
                        "wma_value": day_wma,
                        "rsi_value": round(day_rsi, 2),
                        "burst_date": burst_date,
                        "days_ago": days_ago
                    })
                    break
        except:
            continue
            
    results.sort(key=lambda x: x["days_ago"])
    return results[:params.top_n]

def _scan_ema_crossover(params: EMACrossoverRequest) -> dict:
    if not params.symbols:
        return {"bullish": [], "bearish": []}
    
    # Bulk download 4 months of data
    df = yf.download(
        params.symbols, 
        period="4mo", 
        interval="1d", 
        group_by="ticker", 
        threads=True, 
        auto_adjust=True,
        progress=False
    )
    
    bullish_matches = []
    bearish_matches = []
    is_multi = isinstance(df.columns, pd.MultiIndex)
    
    for symbol in params.symbols:
        try:
            if is_multi:
                if symbol not in df.columns.levels[0]: continue
                ticker_df = df[symbol].dropna(how="all")
            else:
                ticker_df = df.dropna(how="all")
            
            if len(ticker_df) < 30: continue
                
            close = ticker_df["Close"]
            ema10 = close.ewm(span=10, adjust=False).mean()
            ema20 = close.ewm(span=20, adjust=False).mean()
            
            if ema10 is None or ema10.empty or ema20 is None or ema20.empty: continue
                
            # Check current day + past 3 days (4 total)
            for i in range(-1, -5, -1):
                day_close = _safe_float(close.iloc[i])
                yday_close = _safe_float(close.iloc[i-1])
                day_ema10 = _safe_float(ema10.iloc[i])
                yday_ema10 = _safe_float(ema10.iloc[i-1])
                day_ema20 = _safe_float(ema20.iloc[i])
                yday_ema20 = _safe_float(ema20.iloc[i-1])
                
                if None in (day_close, yday_close, day_ema10, yday_ema10, day_ema20, yday_ema20):
                    continue
                
                cross_date = str(ticker_df.index[i])[:10]
                days_ago = abs(i + 1)
                
                # Check Bullish: EMA 10 crosses above EMA 20
                if yday_ema10 <= yday_ema20 and day_ema10 > day_ema20:
                    bullish_matches.append({
                        "symbol": symbol,
                        "price": _safe_float(close.iloc[-1]),
                        "crossover_price": day_close,
                        "ema10_val": round(day_ema10, 2),
                        "ema20_val": round(day_ema20, 2),
                        "cross_date": cross_date,
                        "days_ago": days_ago
                    })
                    break
                
                # Check Bearish: EMA 10 crosses below EMA 20
                elif yday_ema10 >= yday_ema20 and day_ema10 < day_ema20:
                    bearish_matches.append({
                        "symbol": symbol,
                        "price": _safe_float(close.iloc[-1]),
                        "crossover_price": day_close,
                        "ema10_val": round(day_ema10, 2),
                        "ema20_val": round(day_ema20, 2),
                        "cross_date": cross_date,
                        "days_ago": days_ago
                    })
                    break
        except Exception as e:
            print(f"Error scanning EMA for {symbol}: {e}")
            continue
            
    # Sort matches by days_ago (recency)
    bullish_matches.sort(key=lambda x: x["days_ago"])
    bearish_matches.sort(key=lambda x: x["days_ago"])
    
    return {
        "bullish": bullish_matches[:params.top_n],
        "bearish": bearish_matches[:params.top_n]
    }

def _scan_multi_year_breakout(params: BreakoutScannerRequest) -> dict:
    if not params.symbols:
        return {"results": []}
        
    # Helper functions nested inside to maintain clean scope and zero dependencies
    def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
        delta  = series.diff()
        gain   = delta.clip(lower=0).rolling(period).mean()
        loss   = (-delta.clip(upper=0)).rolling(period).mean()
        rs     = gain / loss.replace(0, float("nan"))
        return 100 - (100 / (1 + rs))

    def compute_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal_p: int = 9):
        ema_fast    = series.ewm(span=fast,     adjust=False).mean()
        ema_slow    = series.ewm(span=slow,     adjust=False).mean()
        macd_line   = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal_p, adjust=False).mean()
        histogram   = macd_line - signal_line
        return macd_line, signal_line, histogram

    def resample_ohlcv(df: pd.DataFrame, tf: str) -> pd.DataFrame:
        rule = "W" if tf == "weekly" else "ME"
        agg  = {"Open": "first", "High": "max",
                 "Low":  "min",  "Close": "last", "Volume": "sum"}
        return df.resample(rule).agg(agg).dropna()

    def quality_gate(fund:          dict,
                     min_price_inr: float = 20.0,
                     min_mcap_cr:   float = 500.0,
                     max_de:        float = 1.5,
                     strict:        bool  = False) -> tuple[bool, list[str]]:
        fails = []
        price = fund.get("price", 0)
        mcap  = fund.get("market_cap_cr", 0)
        de    = fund.get("de_ratio")
        roe   = fund.get("roe")
        eps   = fund.get("eps")

        min_p = 50.0   if strict else min_price_inr
        min_m = 1000.0 if strict else min_mcap_cr
        max_d = 1.0    if strict else max_de

        if price < min_p:
            fails.append(f"Price {price} < {min_p}")
        if mcap < min_m:
            fails.append(f"MCap {mcap} < {min_m}")
        if de is not None and de > max_d:
            fails.append(f"D/E {de} > {max_d}")
        if strict:
            if roe is not None and roe <= 0:
                fails.append(f"ROE {roe} <= 0")
            if eps is not None and eps <= 0:
                fails.append(f"EPS {eps} <= 0")
        return (len(fails) == 0), fails

    # 1. Determine period dynamically based on breakout lookback
    period_map = {"1y": "2y", "3y": "5y", "5y": "7y"}
    period_str = period_map.get(params.breakout, "2y")
    
    breakout_days = 252
    if params.breakout == "3y":
        breakout_days = 756
    elif params.breakout == "5y":
        breakout_days = 1260
        
    # 2. Bulk download daily data
    stock_dfs = {}
    print(f"Fetching breakout data using yfinance bulk download (period={period_str})...")
    try:
        df = yf.download(
            params.symbols,
            period=period_str,
            interval="1d",
            group_by="ticker",
            threads=True,
            auto_adjust=True,
            progress=False,
            timeout=40
        )
        is_multi = isinstance(df.columns, pd.MultiIndex)
        for symbol in params.symbols:
            if is_multi:
                if symbol in df.columns.levels[0]:
                    ticker_df = df[symbol].dropna(how="all")
                    if not ticker_df.empty:
                        stock_dfs[symbol] = ticker_df
            else:
                if not df.empty:
                    ticker_df = df.dropna(how="all")
                    if not ticker_df.empty:
                        stock_dfs[symbol] = ticker_df
    except Exception as e:
        print(f"yfinance breakout bulk download error: {e}")
        
    results_list = []
    
    # 3. Process each stock
    for symbol, df_daily in stock_dfs.items():
        try:
            # Re-index index to datetime
            df_daily.index = pd.to_datetime(df_daily.index)
            
            # Select working timeframe
            if params.tf in ("weekly", "monthly"):
                df_work = resample_ohlcv(df_daily, params.tf)
                bars_per_year = 52 if params.tf == "weekly" else 12
                breakout_bars = max(4, int(breakout_days / 252 * bars_per_year))
            else:
                df_work = df_daily.copy()
                breakout_bars = breakout_days
                
            if len(df_work) < breakout_bars + 1:
                continue
                
            close_work = df_work["Close"]
            high_work = df_work["High"]
            low_work = df_work["Low"]
            volume_work = df_work["Volume"]
            
            # Compute technical indicators on chosen TF
            ema50 = close_work.ewm(span=50, adjust=False).mean()
            vol_avg = volume_work.rolling(20).mean()
            high_ny = high_work.rolling(breakout_bars).max()
            
            # MACD on chosen TF Close
            macd_line, signal_line, histogram = compute_macd(close_work)
            
            # RSI on chosen TF Close
            rsi_series = compute_rsi(close_work, period=14)
            
            # Daily stats (always on daily)
            sma200_daily = df_daily["Close"].rolling(200).mean()
            high_1y_daily = df_daily["High"].rolling(252).max()
            low_1y_daily = df_daily["Low"].rolling(252).min()
            
            latest_idx = -1
            prev_idx = -2 if len(df_work) > 1 else latest_idx
            
            close = _safe_float(close_work.iloc[latest_idx])
            high_ny_val = _safe_float(high_ny.iloc[latest_idx])
            ema50_val = _safe_float(ema50.iloc[latest_idx])
            vol_today = _safe_float(volume_work.iloc[latest_idx])
            vol_avg_val = _safe_float(vol_avg.iloc[latest_idx])
            
            macd_now = _safe_float(macd_line.iloc[latest_idx])
            sig_now = _safe_float(signal_line.iloc[latest_idx])
            hist_now = _safe_float(histogram.iloc[latest_idx])
            hist_prev = _safe_float(histogram.iloc[prev_idx])
            rsi_now = _safe_float(rsi_series.iloc[latest_idx])
            
            sma200_daily_val = _safe_float(sma200_daily.iloc[-1]) if not sma200_daily.dropna().empty else None
            high_1y = _safe_float(high_1y_daily.iloc[-1]) if not high_1y_daily.dropna().empty else None
            low_1y = _safe_float(low_1y_daily.iloc[-1]) if not low_1y_daily.dropna().empty else None
            
            if close is None or high_ny_val is None:
                continue
                
            # Technical conditions
            tol = 1 - params.tolerance_pct / 100.0
            near_high = bool(close >= high_ny_val * tol)
            vol_surge = bool(vol_avg_val and vol_avg_val > 0 and vol_today >= vol_avg_val * params.vol_multiplier)
            above_200 = bool(sma200_daily_val and close > sma200_daily_val)
            above_50 = bool(ema50_val and close > ema50_val)
            
            macd_bull = bool(macd_now and sig_now and macd_now > sig_now)
            macd_cross_fresh = bool(hist_now and hist_prev is not None and hist_now > 0 and hist_prev <= 0)
            
            rsi_sweet = bool(rsi_now and 60 <= rsi_now <= 80)
            rsi_ok = bool(rsi_now and rsi_now > 50)
            rsi_overbought = bool(rsi_now and rsi_now > 85)
            
            # Minimum breakout filter gate
            if not near_high or rsi_overbought:
                continue
                
            range_pct = None
            if high_1y and low_1y and high_1y != low_1y:
                range_pct = (close - low_1y) / (high_1y - low_1y) * 100
                
            dist_from_top = ((close / high_ny_val) - 1) * 100
            week52_chg = ((close / low_1y) - 1) * 100 if low_1y else None
            
            # Scoring (technical max 125)
            score = 0
            score += 30 if near_high else 0
            score += 20 if above_200 else 0
            score += 10 if above_50 else 0
            score += 20 if vol_surge else 0
            score += 15 if macd_bull else 0
            score += 10 if macd_cross_fresh else 0
            score += 15 if rsi_sweet else (5 if rsi_ok else 0)
            score += 10 if (range_pct and range_pct >= 85) else 0
            
            # 4. Fundamental checks if not bypassed
            fund = {}
            if not params.no_fundamentals:
                try:
                    ticker_obj = yf.Ticker(symbol)
                    info = ticker_obj.info or {}
                    de_raw = info.get("debtToEquity")
                    fund = {
                        "market_cap_cr": (info.get("marketCap") or 0) / 1e7,
                        "price": info.get("currentPrice") or info.get("regularMarketPrice") or 0,
                        "de_ratio": (de_raw / 100.0) if de_raw is not None else None,
                        "roe": (info.get("returnOnEquity") or 0) * 100,
                        "roa": (info.get("returnOnAssets") or 0) * 100,
                        "eps": info.get("trailingEps"),
                        "pe": info.get("trailingPE"),
                        "sector": info.get("sector") or "â€”",
                    }
                except Exception as fe:
                    print(f"Error fetching fundamentals for {symbol}: {fe}")
                    
                if fund:
                    passed, _ = quality_gate(fund, params.min_price, params.min_mcap, params.max_de, params.strict)
                    if not passed:
                        continue
                        
                de = fund.get("de_ratio")
                roe = fund.get("roe")
                eps = fund.get("eps")
                
                # Fundamental bonus scoring (max 25)
                fscore = 0
                fscore += 10 if (roe and roe > 15) else 0
                fscore += 5 if (roe and roe > 25) else 0
                fscore += 5 if (de is not None and de < 0.5) else 0
                fscore += 5 if (eps and eps > 0) else 0
                score += fscore
                
            results_list.append({
                "symbol": symbol,
                "sector": fund.get("sector", "â€”") if fund else "â€”",
                "price": round(close, 2),
                "high_ny": round(high_ny_val, 2),
                "dist_top": round(dist_from_top, 2),
                "week52_chg": round(week52_chg, 1) if week52_chg else None,
                "rsi": round(rsi_now, 1) if rsi_now else None,
                "macd_bull": macd_bull,
                "macd_cross": macd_cross_fresh,
                "vol_surge": vol_surge,
                "above_200": above_200,
                "mcap_cr": round(fund.get("market_cap_cr", 0)) if fund and fund.get("market_cap_cr") else None,
                "de_ratio": round(fund.get("de_ratio"), 2) if fund and fund.get("de_ratio") is not None else None,
                "roe": round(fund.get("roe"), 1) if fund and fund.get("roe") is not None else None,
                "score": score,
            })
        except Exception as ex:
            print(f"Error processing breakout scan for {symbol}: {ex}")
            continue
            
    # Sort results by score descending
    results_list.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results_list[:params.top_n]}

def _vcp_get_perf(ser, days):
    """Calculate percentage performance over N days."""
    if len(ser) < days:
        return 0.0
    end = float(ser.iloc[-1])
    start = float(ser.iloc[-days])
    return (end - start) / start if start != 0 else 0.0

def _vcp_range_pct(h, l, price, start_i, end_i):
    """Get H-L range as percent of price over a slice."""
    h_slice = h.iloc[start_i:end_i]
    l_slice = l.iloc[start_i:end_i]
    if h_slice.empty:
        return 0.0
    return ((float(h_slice.max()) - float(l_slice.min())) / price) * 100

def _process_vcp_batch(symbols_batch, index_symbol):
    """Download and process a batch of symbols for VCP criteria."""
    all_tickers = list(set(symbols_batch + [index_symbol]))
    try:
        df = yf.download(
            all_tickers,
            period="14mo",
            interval="1d",
            group_by="ticker",
            threads=True,
            auto_adjust=True,
            progress=False,
        )
    except Exception as e:
        print(f"VCP Batch Error: {e}")
        return []

    is_multi = isinstance(df.columns, pd.MultiIndex)
    
    # Get index
    index_close = None
    try:

        if is_multi:
            if index_symbol in df.columns.levels[0]:
                idx_df = df[index_symbol].dropna(how="all")
                if not idx_df.empty:
                    index_close = idx_df["Close"]
        else:
            # Single ticker downloaded
            if not df.empty:
                index_close = df["Close"]
    except Exception as e:
        print(f"Index Processing Error for {index_symbol}: {e}")
        pass
    
    i_perf = 0.0
    if index_close is not None and len(index_close) >= 252:
        i_perf = (
            _vcp_get_perf(index_close, 63) * 2
            + _vcp_get_perf(index_close, 126)
            + _vcp_get_perf(index_close, 189)
            + _vcp_get_perf(index_close, 252)
        )

    results = []
    for symbol in symbols_batch:
        if symbol == index_symbol:
            continue
        try:
            if is_multi:
                if symbol not in df.columns.levels[0]:
                    continue
                ticker_df = df[symbol].dropna(how="all")
            else:
                ticker_df = df.dropna(how="all")

            if len(ticker_df) < 252:
                continue

            close = ticker_df["Close"]
            high = ticker_df["High"]
            low = ticker_df["Low"]

            p = _safe_float(close.iloc[-1])
            if not p:
                continue

            sma50 = ta.sma(close, length=50)
            sma150 = ta.sma(close, length=150)
            sma200 = ta.sma(close, length=200)
            if sma50 is None or sma150 is None or sma200 is None:
                continue

            s50 = _safe_float(sma50.iloc[-1]) or 0
            s150 = _safe_float(sma150.iloc[-1]) or 0
            s200 = _safe_float(sma200.iloc[-1]) or 0
            s200_1mo = _safe_float(sma200.iloc[-22]) if len(sma200) > 22 else s200

            low_52w = float(close.iloc[-252:].min())
            high_52w = float(close.iloc[-252:].max())

            # Minervini Trend Template (7 criteria)
            c1 = bool(p > s150 and p > s200)
            c2 = bool(s150 > s200)
            c3 = bool(s200 > s200_1mo)
            c4 = bool(s50 > s150 and s50 > s200)
            c5 = bool(p > s50)
            c6 = bool(p > low_52w * 1.3)
            c7 = bool(p > high_52w * 0.75)
            template_score = sum([c1, c2, c3, c4, c5, c6, c7])
            is_uptrend = template_score >= 5

            # Relative Strength Score
            rs_score = 0.0
            if index_close is not None and len(index_close) >= 252:
                s_perf = (
                    _vcp_get_perf(close, 63) * 2
                    + _vcp_get_perf(close, 126)
                    + _vcp_get_perf(close, 189)
                    + _vcp_get_perf(close, 252)
                )
                if i_perf != 0:
                    rs_score = round((s_perf / abs(i_perf)) * 10, 2)
                else:
                    rs_score = round(s_perf * 100, 2)

            # VCP Tightness
            range_now = _vcp_range_pct(high, low, p, -5, None)
            range_prev = _vcp_range_pct(high, low, p, -20, -5)
            is_tight = bool(range_now < 8.0 and range_now < range_prev * 0.8)

            # Past week check
            met_past_week = any(
                (_safe_float(close.iloc[d]) or 0) > (_safe_float(sma150.iloc[d]) or 0)
                for d in range(-5, 0)
            )

            if is_uptrend or rs_score > 10:
                results.append({
                    "symbol": symbol,
                    "price": round(p, 2),
                    "rs_score": rs_score,
                    "template_score": f"{template_score}/7",
                    "is_tight": is_tight,
                    "range_5d": round(range_now, 2),
                    "met_past_week": met_past_week,
                    "high_52w_dist": round(((high_52w - p) / p) * 100, 2),
                })
        except Exception as e:
            print(f"Error processing VCP for {symbol}: {e}")
            continue

    return results

def _scan_vcp(params: VCPRequest) -> list:
    if not params.symbols:
        return []

    # Allow commodities if requested, VCP criteria will still apply
    equity_symbols = params.symbols
    if not equity_symbols:
        return []

    # Process in batches of 50 to avoid timeout + memory issues
    BATCH_SIZE = 50
    all_results = []
    
    for i in range(0, len(equity_symbols), BATCH_SIZE):
        batch = equity_symbols[i:i + BATCH_SIZE]
        batch_results = _process_vcp_batch(batch, params.index_symbol)
        all_results.extend(batch_results)

    # Sort by RS Score descending
    all_results.sort(key=lambda x: x["rs_score"], reverse=True)
    return all_results[:params.top_n]

@app.post("/vcp-scanner")
async def vcp_scanner(req: VCPRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_vcp, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _scan_ep(params: EPRequest) -> list:
    if not params.symbols:
        return []
    
    # Download 1 year of data for SMAs and 52W High
    try:
        df = yf.download(
            params.symbols,
            period="1y",
            interval="1d",
            group_by="ticker",
            threads=True,
            auto_adjust=True,
            progress=False,
            timeout=30
        )
    except Exception as e:
        print(f"EP Scan Download Error: {e}")
        return []

    results = []
    is_multi = isinstance(df.columns, pd.MultiIndex)
    
    for symbol in params.symbols:
        try:
            if is_multi:
                if symbol not in df.columns.levels[0]: continue
                ticker_df = df[symbol].dropna(how="all")
            else:
                ticker_df = df.dropna(how="all")
            
            if len(ticker_df) < 150: continue
                
            close = ticker_df["Close"]
            high = ticker_df["High"]
            low = ticker_df["Low"]
            open_ = ticker_df["Open"]
            volume = ticker_df["Volume"]
            
            # Indicators
            sma50 = ta.sma(close, length=50)
            sma150 = ta.sma(close, length=150)
            sma200 = ta.sma(close, length=200)
            vol_avg20 = ta.sma(volume, length=20)
            
            p = _safe_float(close.iloc[-1])
            if not p: continue
            
            s50 = _safe_float(sma50.iloc[-1]) if sma50 is not None else None
            s150 = _safe_float(sma150.iloc[-1]) if sma150 is not None else None
            s200 = _safe_float(sma200.iloc[-1]) if sma200 is not None else None
            
            # Stage 2 check
            is_stage2 = False
            if s150 and s200:
                is_stage2 = bool(p > s150 > s200)
            
            # EP burst check (last 5 days)
            burst_found = False
            match_data = None
            
            for i in range(-1, -6, -1):
                try:
                    d_close = _safe_float(close.iloc[i])
                    y_close = _safe_float(close.iloc[i-1])
                    d_open = _safe_float(open_.iloc[i])
                    d_vol = _safe_float(volume.iloc[i])
                    avg_vol = _safe_float(vol_avg20.iloc[i-1])
                    
                    if not all([d_close, y_close, d_open, d_vol, avg_vol]) or avg_vol == 0:
                        continue
                        
                    gap_open_pct = ((d_open - y_close) / y_close) * 100
                    day_gain_pct = ((d_close - y_close) / y_close) * 100
                    ep_move = max(gap_open_pct, day_gain_pct)
                    rvol = round(d_vol / avg_vol, 2)
                    
                    # If i == -1 (today live), volume is still accumulating, so relax rvol threshold
                    min_rvol = 1.2 if i == -1 else 1.7
                    
                    if ep_move >= 3.5 and rvol >= min_rvol:
                        # 52W high proximity
                        high_52w = float(high.iloc[-252:].max())
                        dist_52w = ((high_52w - p) / p) * 100
                        
                        # Scoring (0-100)
                        score = 40.0 # Base
                        score += min(30.0, (ep_move - 3.5) * 4.0)
                        score += min(30.0, (rvol - min_rvol) * 10.0)
                        if is_stage2: score += 15.0
                        if dist_52w < 15.0: score += 15.0
                        
                        match_data = {
                            "symbol": symbol,
                            "price": round(p, 2),
                            "gap_pct": round(ep_move, 2),
                            "rvol": rvol,
                            "is_stage2": is_stage2,
                            "dist_52w": round(dist_52w, 2),
                            "score": round(min(100.0, score), 1),
                            "burst_date": str(ticker_df.index[i].date()) if hasattr(ticker_df.index[i], 'date') else str(ticker_df.index[i])[:10],
                            "days_ago": abs(i) - 1
                        }
                        burst_found = True
                        break
                except:
                    continue
            
            if burst_found and match_data:
                results.append(match_data)
        except:
            continue
            
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:params.top_n]

@app.post("/ep-scanner")
async def ep_scanner(req: EPRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_ep, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/wma44-crossover")

async def wma44_crossover(req: WMARequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_wma_crossover, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ema-crossover")
async def ema_crossover(req: EMACrossoverRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        results = await loop.run_in_executor(executor, _scan_ema_crossover, req)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/breakout-scanner")
async def breakout_scanner(req: BreakoutScannerRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        results = await loop.run_in_executor(executor, _scan_multi_year_breakout, req)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _process_orb_single(symbol: str, include_history: bool = False, vol_mult: float = 1.5) -> dict:
    t = yf.Ticker(symbol)
    df = t.history(period="5d", interval="15m", auto_adjust=True)
    if df.empty:
        return {"symbol": symbol, "error": "No data available"}
    
    df = df.sort_index()
    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    volume = df["Volume"]
    
    atr_series = ta.atr(high, low, close, length=14)
    ema9_series = ta.ema(close, length=9)
    vol_sma_series = ta.sma(volume, length=20)
    
    tp = (high + low + close) / 3
    dates = df.index.map(lambda x: x.date() if hasattr(x, 'date') else str(x)[:10])
    df["typical_vol"] = tp * volume
    vwap_series = df.groupby(dates, group_keys=False).apply(
        lambda g: g["typical_vol"].cumsum() / (g["Volume"].cumsum() + 1e-9)
    )
    
    today_str = dates[-1]
    today_df = df[dates == today_str]
    if today_df.empty or len(today_df) < 1:
        return {"symbol": symbol, "error": "No today data"}
        
    first_candle = today_df.iloc[0]
    orb_high = _safe_float(first_candle["High"]) or 0
    orb_low = _safe_float(first_candle["Low"]) or 0
    orb_size = round(orb_high - orb_low, 2)
    orb_mid = round((orb_high + orb_low) / 2, 2)
    
    ltp = _safe_float(close.iloc[-1]) or 0
    cur_vol = _safe_float(volume.iloc[-1]) or 0
    cur_vwap = _safe_float(vwap_series.iloc[-1]) or 0
    cur_ema9 = _safe_float(ema9_series.iloc[-1]) or 0 if ema9_series is not None else 0
    cur_atr = _safe_float(atr_series.iloc[-1]) or 0 if atr_series is not None else 0
    cur_vol_avg = _safe_float(vol_sma_series.iloc[-1]) or 0 if vol_sma_series is not None else 0
    
    if ltp > orb_high:
        direction = "LONG"
    elif ltp < orb_low:
        direction = "SHORT"
    else:
        direction = "NONE"
        
    vwap_ok = bool((direction == "LONG" and ltp > cur_vwap) or (direction == "SHORT" and ltp < cur_vwap))
    volume_ok = bool(cur_vol >= (cur_vol_avg * vol_mult))
    ema9_ok = bool((direction == "LONG" and ltp > cur_ema9) or (direction == "SHORT" and ltp < cur_ema9))
    range_width_ok = bool(cur_atr > 0 and (orb_size / (cur_atr + 1e-5)) <= 2.5)
    
    levels = None
    if direction == "LONG":
        entry = orb_high
        sl = orb_low
        tp1 = round(entry + orb_size, 2)
        tp2 = round(entry + (2 * orb_size), 2)
        rr = round((tp2 - entry) / (entry - sl + 1e-5), 2)
        levels = {"entry": entry, "sl": sl, "tp1": tp1, "tp2": tp2, "rr_ratio": rr, "sl_pts": orb_size, "sl_pct": round((orb_size/(entry+1e-5))*100, 2), "direction": direction}
    elif direction == "SHORT":
        entry = orb_low
        sl = orb_high
        tp1 = round(entry - orb_size, 2)
        tp2 = round(entry - (2 * orb_size), 2)
        rr = round((entry - tp2) / (sl - entry + 1e-5), 2)
        levels = {"entry": entry, "sl": sl, "tp1": tp1, "tp2": tp2, "rr_ratio": rr, "sl_pts": orb_size, "sl_pct": round((orb_size/(entry+1e-5))*100, 2), "direction": direction}
        
    strength = (1 if direction != "NONE" else 0) + (1 if vwap_ok else 0) + (1 if volume_ok else 0) + (1 if ema9_ok else 0) + (1 if range_width_ok else 0)
    
    res = {
        "symbol": symbol,
        "name": symbol.replace(".NS", ""),
        "ltp": ltp,
        "direction": direction,
        "signal_strength": strength,
        "orb": {
            "high": orb_high,
            "low": orb_low,
            "size": orb_size,
            "midpoint": orb_mid,
            "avg_volume": round(cur_vol_avg, 0)
        },
        "filters": {
            "vwap_ok": vwap_ok,
            "volume_ok": volume_ok,
            "ema9_ok": ema9_ok,
            "range_width_ok": range_width_ok
        },
        "vwap": round(cur_vwap, 2),
        "ema9": round(cur_ema9, 2),
        "atr": round(cur_atr, 2),
        "entry_method": "breakout",
        "levels": levels,
        "error": None
    }
    
    if include_history:
        history = []
        for idx in df.index:
            history.append({
                "time": str(idx)[:19],
                "open": _safe_float(df.loc[idx, "Open"]),
                "high": _safe_float(df.loc[idx, "High"]),
                "low": _safe_float(df.loc[idx, "Low"]),
                "close": _safe_float(df.loc[idx, "Close"]),
                "volume": int(df.loc[idx, "Volume"]),
                "vwap": round(_safe_float(vwap_series.loc[idx]) or 0, 2),
                "ema9": round(_safe_float(ema9_series.loc[idx]) or 0 if ema9_series is not None else 0, 2)
            })
        res["history"] = history
        
    return res

def _scan_orb(params: ORBRequest, is_market_open: bool = True) -> list:
    if not params.symbols:
        return []
        
    results = []
    futures = [executor.submit(_process_orb_single, sym, False, params.volume_multiplier) for sym in params.symbols]
    for f in futures:
        try:
            r = f.result(timeout=10)
            if not r.get("error"):
                if not is_market_open:
                    if r["direction"] != "NONE":
                        results.append(r)
                else:
                    results.append(r)
        except Exception:
            continue
            
    results.sort(key=lambda x: (x["signal_strength"], 1 if x["direction"] != "NONE" else 0), reverse=True)
    return results[:params.top_n]

@app.post("/orb-scanner")
async def orb_scanner(req: ORBRequest = Body(...)):
    now_utc = datetime.utcnow()
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = now_utc + ist_offset
    
    # IST Market Hours: Mon-Fri (weekday < 5), 9:15 AM to 3:30 PM
    is_market_open = (now_ist.weekday() < 5) and (
        (now_ist.hour == 9 and now_ist.minute >= 15) or 
        (9 < now_ist.hour < 15) or 
        (now_ist.hour == 15 and now_ist.minute <= 30)
    )
    
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_orb, req, is_market_open)
        return {
            "matches": matches,
            "is_market_open": is_market_open,
            "timestamp": now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/intraday")
async def intraday(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(executor, _process_orb_single, ticker, True, 1.5)
        if data.get("error"):
            raise HTTPException(status_code=400, detail=data["error"])
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ATRExtensionRequest(BaseModel):
    symbols: list[str]
    ext_sma50_threshold: float = 0.0
    top_n: int = 50


def _scan_atr_extension(params: ATRExtensionRequest) -> list:
    if not params.symbols:
        return []

    # Check if Polygon API key is provided
    import os
    polygon_key = os.environ.get("POLYGON_API_KEY")
    use_polygon = False
    stock_dfs = {}

    if polygon_key:
        import httpx
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=500)
        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = end_dt.strftime("%Y-%m-%d")
        
        print(f"Using Polygon API to fetch data for {len(params.symbols)} symbols...")
        use_polygon = True
        
        for symbol in params.symbols:
            # Format ticker for Polygon if necessary (e.g. remove suffixes for standard US or keep .NS if supported)
            poly_sym = symbol
            url = f"https://api.polygon.io/v2/aggs/ticker/{poly_sym}/range/1/day/{start_str}/{end_str}?adjusted=true&apiKey={polygon_key}"
            try:
                r = httpx.get(url, timeout=10.0)
                if r.status_code == 200:
                    res_data = r.json()
                    results = res_data.get("results", [])
                    if results:
                        rows = []
                        for bar in results:
                            rows.append({
                                "Date": pd.to_datetime(bar["t"], unit="ms"),
                                "Open": bar["o"],
                                "High": bar["h"],
                                "Low": bar["l"],
                                "Close": bar["c"],
                                "Volume": bar["v"]
                            })
                        ticker_df = pd.DataFrame(rows).set_index("Date")
                        stock_dfs[symbol] = ticker_df
                elif r.status_code == 429:
                    print(f"Polygon rate limit (429) hit for {symbol}. Falling back to yfinance.")
                    use_polygon = False
                    break
            except Exception as e:
                print(f"Polygon fetch error for {symbol}: {e}. Falling back to yfinance.")
                use_polygon = False
                break

    if not stock_dfs or not use_polygon:
        # Fallback to Yahoo Finance bulk downloader
        print("Fetching data using yfinance bulk download...")
        try:
            df = yf.download(
                params.symbols,
                period="2y",
                interval="1d",
                group_by="ticker",
                threads=True,
                auto_adjust=True,
                progress=False,
                timeout=30
            )
            is_multi = isinstance(df.columns, pd.MultiIndex)
            for symbol in params.symbols:
                if is_multi:
                    if symbol in df.columns.levels[0]:
                        ticker_df = df[symbol].dropna(how="all")
                        if not ticker_df.empty:
                            stock_dfs[symbol] = ticker_df
                else:
                    if not df.empty:
                        stock_dfs[symbol] = df.dropna(how="all")
        except Exception as e:
            print(f"yfinance bulk download error: {e}")

    results_list = []

    for symbol, ticker_df in stock_dfs.items():
        try:
            if len(ticker_df) < 50:
                continue

            close = ticker_df["Close"]
            high = ticker_df["High"]
            low = ticker_df["Low"]

            # Compute technical indicators manually
            high_low = high - low
            high_close = (high - close.shift()).abs()
            low_close = (low - close.shift()).abs()
            tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
            atr = tr.rolling(14).mean()

            ema10 = close.ewm(span=10, adjust=False).mean()
            ema21 = close.ewm(span=21, adjust=False).mean()
            sma50 = close.rolling(50).mean()
            sma200 = close.rolling(200).mean()

            ext_ema10 = (close - ema10) / atr
            ext_ema21 = (close - ema21) / atr
            ext_sma50 = (close - sma50) / atr
            ext_sma200 = (close - sma200) / atr

            latest_idx = -1
            p = _safe_float(close.iloc[latest_idx])
            val_atr = _safe_float(atr.iloc[latest_idx])

            if not p or not val_atr or val_atr == 0:
                continue

            val_ema10 = _safe_float(ema10.iloc[latest_idx])
            val_ema21 = _safe_float(ema21.iloc[latest_idx])
            val_sma50 = _safe_float(sma50.iloc[latest_idx])
            val_sma200 = _safe_float(sma200.iloc[latest_idx])

            val_ext_ema10 = _safe_float(ext_ema10.iloc[latest_idx])
            val_ext_ema21 = _safe_float(ext_ema21.iloc[latest_idx])
            val_ext_sma50 = _safe_float(ext_sma50.iloc[latest_idx])
            val_ext_sma200 = _safe_float(ext_sma200.iloc[latest_idx])

            # Apply absolute threshold filter if specified
            if params.ext_sma50_threshold > 0:
                if abs(val_ext_sma50 or 0) <= params.ext_sma50_threshold:
                    continue

            results_list.append({
                "symbol": symbol,
                "name": symbol.replace(".NS", ""),
                "price": round(p, 2),
                "atr": round(val_atr, 2),
                "ema10": round(val_ema10, 2) if val_ema10 else None,
                "ema21": round(val_ema21, 2) if val_ema21 else None,
                "sma50": round(val_sma50, 2) if val_sma50 else None,
                "sma200": round(val_sma200, 2) if val_sma200 else None,
                "ext_ema10": round(val_ext_ema10, 2) if val_ext_ema10 is not None else 0.0,
                "ext_ema21": round(val_ext_ema21, 2) if val_ext_ema21 is not None else 0.0,
                "ext_sma50": round(val_ext_sma50, 2) if val_ext_sma50 is not None else 0.0,
                "ext_sma200": round(val_ext_sma200, 2) if val_ext_sma200 is not None else 0.0,
            })
        except Exception as e:
            print(f"Error computing ATR/MA extensions for {symbol}: {e}")
            continue

    # Sort descending by absolute value of ext_sma50 (standard extension check)
    results_list.sort(key=lambda x: abs(x["ext_sma50"]), reverse=True)
    return results_list[:params.top_n]


@app.post("/atr-extension")
async def atr_extension(req: ATRExtensionRequest = Body(...)):
    loop = asyncio.get_running_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_atr_extension, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/forecast")
async def forecast_endpoint(
    ticker: str = Query(...),
    horizon: int = Query(30),
    capital: float = Query(100000.0),
    risk: float = Query(0.02)
):
    _validate_ticker(ticker)
    # Clamp parameters to safe ranges (defence-in-depth after proxy validation)
    horizon = max(5, min(horizon, 120))
    capital = max(1_000, min(capital, 1_000_000_000))
    risk = max(0.001, min(risk, 0.20))
    cache_key = f"forecast:{ticker}:{horizon}:{capital}:{risk}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    loop = asyncio.get_running_loop()
    try:
        def _process_forecast():
            prices_rows = _get_history(ticker, period="2y", interval="1d")
            if not prices_rows:
                raise HTTPException(status_code=404, detail="No price history available")
            
            df = pd.DataFrame(prices_rows)
            df["Close"] = df["close"]
            df = compute_indicators(df)
            
            close_list = df["Close"].tolist()
            date_list = df["time"].tolist()
            vol_list = df["Volatility"].tolist()
            
            context_len = min(252, len(close_list))
            forecast_input = close_list[-context_len:]
            forecast_dates = date_list[-context_len:]
            
            fc_result = run_forecast(forecast_input, forecast_dates, horizon)
            
            current_price = close_list[-1]
            current_vol = vol_list[-1]
            
            sizing_result = compute_position_sizing(
                current_price,
                fc_result["mean"][-1],
                fc_result["lower"][-1],
                fc_result["upper"][-1],
                current_vol,
                capital,
                risk
            )
            
            backtest_result = run_backtest(df, capital, risk)
            
            last_n = min(150, len(df))
            df_sliced = df.iloc[-last_n:]
            
            chart_history = []
            for _, row in df_sliced.iterrows():
                chart_history.append({
                    "time": row["time"],
                    "close": row["Close"],
                    "sma20": _safe_float(row["SMA_20"]),
                    "sma50": _safe_float(row["SMA_50"]),
                    "sma200": _safe_float(row["SMA_200"]),
                    "rsi": _safe_float(row["RSI"]),
                    "volatility_ann_pct": round(row["Volatility"] * 100, 1)
                })
                
            return {
                "ticker": ticker,
                "is_timesfm": fc_result["is_timesfm"],
                "timesfm_supported": is_timesfm_enabled(),
                "history": chart_history,
                "forecast": {
                    "dates": fc_result["future_dates"],
                    "mean": [round(v, 2) for v in fc_result["mean"]],
                    "lower": [round(v, 2) for v in fc_result["lower"]],
                    "upper": [round(v, 2) for v in fc_result["upper"]],
                },
                "position_sizing": sizing_result,
                "backtest": backtest_result
            }
            
        data = await loop.run_in_executor(executor, _process_forecast)
        _cache_set(cache_key, data, FORECAST_TTL)
        return data
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    cache_size = len(_cache)
    return {"status": "ok", "time": datetime.now().isoformat(), "cache_entries": cache_size}


@app.delete("/cache")
async def clear_cache(x_cache_secret: str = Header(default="")):
    """
    Clear all cached data. Requires the X-Cache-Secret header to match
    the CACHE_SECRET environment variable. Disabled if CACHE_SECRET is empty.
    """
    if not _CACHE_SECRET or x_cache_secret != _CACHE_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden â€” valid X-Cache-Secret header required")
    with _cache_lock:
        count = len(_cache)
        _cache.clear()
    logger.info("Cache cleared: %d entries removed", count)
    return {"cleared": count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015, log_level="info")
