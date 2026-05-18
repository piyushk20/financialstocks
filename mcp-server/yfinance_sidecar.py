"""
yfinance FastAPI sidecar for NSE 200 stock data.
Serves on port 8001. Called by the Next.js dashboard API routes.

Endpoints:
  GET /snapshot?ticker=RELIANCE.NS
  GET /history?ticker=RELIANCE.NS&period=1y&interval=1d
  GET /financials?ticker=RELIANCE.NS
  GET /news?ticker=RELIANCE.NS
  GET /technicals?ticker=RELIANCE.NS
"""

import asyncio
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf
import pandas as pd
from pydantic import BaseModel
import pandas_ta as ta
from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NSE Stock Sidecar", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=4)


def _safe_float(v):
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        return float(v)
    except Exception:
        return None


def _get_snapshot(ticker_sym: str) -> dict:
    t = yf.Ticker(ticker_sym)
    info = t.info or {}
    
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

    return {
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
        "market_cap": info.get("marketCap"),
        "pe_ratio": _safe_float(info.get("trailingPE")),
        "pb_ratio": _safe_float(info.get("priceToBook")),
        "fifty_two_week_high": _safe_float(info.get("fiftyTwoWeekHigh")),
        "fifty_two_week_low": _safe_float(info.get("fiftyTwoWeekLow")),
        "eps": _safe_float(info.get("trailingEps")),
        "dividend_yield": _safe_float(info.get("dividendYield")),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "currency": info.get("currency", "INR"),
        "exchange": info.get("exchange"),
    }


def _get_history(ticker_sym: str, period: str, interval: str) -> list:
    t = yf.Ticker(ticker_sym)
    df = t.history(period=period, interval=interval, auto_adjust=True)
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
    return rows


def _get_financials(ticker_sym: str, period: str = "annual") -> dict:
    t = yf.Ticker(ticker_sym)

    def stmt_to_list(df):
        if df is None or df.empty:
            return []
        
        def first_valid(d, *keys):
            for k in keys:
                v = d.get(k)
                if v is not None:
                    return v
            return None

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
            
            # Mappings for frontend compatibility
            row["revenue"] = first_valid(row, "total_revenue", "operating_revenue", "gross_revenue", "revenue")
            row["eps_diluted"] = first_valid(row, "diluted_eps", "basic_eps", "diluted_ni_avail_to_com_ten") or 0
            row["total_liabilities"] = first_valid(row, "total_liabilities_net_minority_interest", "total_liabilities")
            row["total_equity"] = first_valid(row, "stockholders_equity", "total_equity_gross_minority_interest")
            row["cash_and_equivalents"] = first_valid(row, "cash_and_cash_equivalents", "cash_cash_equivalents_and_short_term_investments")
            row["capital_expenditures"] = first_valid(row, "capital_expenditure")
            row["gross_profit"] = first_valid(row, "gross_profit")
            row["ebitda"] = first_valid(row, "ebitda", "normalized_ebitda")
            row["net_income"] = first_valid(row, "net_income")
            
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
    return {"income": income, "balance": balance, "cashflow": cashflow}


def _get_news(ticker_sym: str) -> list:
    import urllib.request
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime
    
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


import re

def _validate_ticker(ticker: str):
    if not ticker or not re.match(r"^[A-Z0-9.\-_^=&]{1,20}$", ticker, re.I):
        raise HTTPException(status_code=400, detail="Invalid ticker format")


@app.get("/snapshot")
async def snapshot(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _get_snapshot, ticker)
        return {"snapshot": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/snapshot/batch")
async def snapshot_batch(req: list[str] = Body(...)):
    loop = asyncio.get_event_loop()
    try:
        # Use existing _get_snapshot in parallel via executor
        def _get_all(tickers):
            res = {}
            for t in tickers:
                try:
                    res[t] = _get_snapshot(t)
                except:
                    res[t] = {"change_percent": 0}
            return res
            
        data = await loop.run_in_executor(executor, _get_all, req)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/history")
async def history(
    ticker: str = Query(...),
    period: str = Query("1y"),
    interval: str = Query("1d"),
):
    _validate_ticker(ticker)
    loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _get_financials, ticker, period)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/news")
async def news(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_ep, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/wma44-crossover")

async def wma44_crossover(req: WMARequest = Body(...)):
    loop = asyncio.get_event_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_wma_crossover, req)
        return {"matches": matches}
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
    
    loop = asyncio.get_event_loop()
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
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _process_orb_single, ticker, True, 1.5)
        if data.get("error"):
            raise HTTPException(status_code=400, detail=data["error"])
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8015, log_level="info")
