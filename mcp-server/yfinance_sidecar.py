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
from datetime import datetime
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
    allow_methods=["GET"],
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
    t = yf.Ticker(ticker_sym)
    raw_news = t.news or []
    result = []
    for item in raw_news[:15]:
        ct = item.get("content", {})
        title = ct.get("title") or item.get("title", "")
        url = ct.get("canonicalUrl", {}).get("url") or item.get("link", "")
        published = ct.get("pubDate") or item.get("providerPublishTime", "")
        provider = ct.get("provider", {}).get("displayName") or item.get("publisher", "")
        result.append({
            "title": title,
            "url": url,
            "source": provider,
            "published_at": str(published)[:10],
            "summary": ct.get("summary"),
        })
    return result


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
            
            if wma44 is None or wma44.empty: continue
                
            # Check current day + past 3 days (4 total)
            for i in range(-1, -5, -1):
                day_close = _safe_float(close.iloc[i])
                yday_close = _safe_float(close.iloc[i-1])
                day_wma = _safe_float(wma44.iloc[i])
                yday_wma = _safe_float(wma44.iloc[i-1])
                
                # Crossover logic: Yesterday below WMA, Today above WMA
                if yday_close <= yday_wma and day_close > day_wma:
                    burst_date = str(ticker_df.index[i])[:10]
                    days_ago = abs(i + 1)
                    
                    results.append({
                        "symbol": symbol,
                        "price": _safe_float(close.iloc[-1]),
                        "crossover_price": day_close,
                        "wma_value": day_wma,
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


@app.post("/wma44-crossover")

async def wma44_crossover(req: WMARequest = Body(...)):
    loop = asyncio.get_event_loop()
    try:
        matches = await loop.run_in_executor(executor, _scan_wma_crossover, req)
        return {"matches": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
