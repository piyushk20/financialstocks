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
from fastapi import FastAPI, Query, HTTPException
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
    change = round(price - prev_close, 4) if price and prev_close else None
    pct_change = round((change / prev_close) * 100, 4) if change and prev_close else None

    return {
        "ticker": ticker_sym,
        "name": info.get("longName") or info.get("shortName", ticker_sym),
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


def _get_financials(ticker_sym: str) -> dict:
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
    if not ticker or not re.match(r"^[A-Z0-9.\-_]{1,20}$", ticker, re.I):
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
async def financials(ticker: str = Query(...)):
    _validate_ticker(ticker)
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _get_financials, ticker)
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


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
