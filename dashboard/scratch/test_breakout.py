import yfinance as yf
import pandas as pd

class BreakoutScannerRequest:
    def __init__(self):
        self.symbols = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS"]
        self.breakout = "1y"
        self.tf = "daily"
        self.vol_multiplier = 1.5
        self.tolerance_pct = 20.0  # Widen to 20%
        self.min_price = 20.0
        self.min_mcap = 500.0
        self.max_de = 1.5
        self.strict = False
        self.no_fundamentals = False
        self.top_n = 10

params = BreakoutScannerRequest()
period_map = {"1y": "2y", "3y": "5y", "5y": "7y"}
period_str = period_map.get(params.breakout, "2y")

print(f"Downloading tickers: {params.symbols} for period {period_str}")
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

print(f"Downloaded df columns multiindex: {isinstance(df.columns, pd.MultiIndex)}")
print(f"Columns levels: {df.columns.levels[0].tolist() if isinstance(df.columns, pd.MultiIndex) else df.columns.tolist()}")

stock_dfs = {}
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

print(f"Successfully populated stock_dfs for: {list(stock_dfs.keys())}")

for symbol, df_daily in stock_dfs.items():
    print(f"\n--- Processing {symbol} ---")
    df_daily.index = pd.to_datetime(df_daily.index)
    df_work = df_daily.copy()
    
    close_work = df_work["Close"]
    high_work = df_work["High"]
    low_work = df_work["Low"]
    volume_work = df_work["Volume"]
    
    # Check length
    breakout_bars = 252
    if len(df_work) < breakout_bars + 1:
        print(f"Skipping {symbol}: df length {len(df_work)} < {breakout_bars + 1}")
        continue
        
    ema50 = close_work.ewm(span=50, adjust=False).mean()
    vol_avg = volume_work.rolling(20).mean()
    high_ny = high_work.rolling(breakout_bars).max()
    
    latest_idx = -1
    close = close_work.iloc[latest_idx]
    high_ny_val = high_ny.iloc[latest_idx]
    vol_today = volume_work.iloc[latest_idx]
    vol_avg_val = vol_avg.iloc[latest_idx]
    
    print(f"Close: {close}")
    print(f"High NY: {high_ny_val}")
    print(f"Vol Today: {vol_today}, Vol Average: {vol_avg_val}")
    
    tol = 1 - params.tolerance_pct / 100.0
    near_high = close >= high_ny_val * tol
    print(f"Near high limit check: {close} >= {high_ny_val * tol} -> {near_high}")
    
    # Let's inspect fundamentals
    ticker_obj = yf.Ticker(symbol)
    info = ticker_obj.info or {}
    de_raw = info.get("debtToEquity")
    fund = {
        "market_cap_cr": (info.get("marketCap") or 0) / 1e7,
        "price": info.get("currentPrice") or info.get("regularMarketPrice") or 0,
        "de_ratio": (de_raw / 100.0) if de_raw is not None else None,
        "roe": (info.get("returnOnEquity") or 0) * 100,
        "sector": info.get("sector") or "—",
    }
    
    print(f"Fundamentals: Price={fund['price']}, MCap={fund['market_cap_cr']} Cr, D/E={fund['de_ratio']}, ROE={fund['roe']}%")
