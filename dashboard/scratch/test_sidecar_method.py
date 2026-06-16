import sys
sys.path.append(r'c:\Users\HP\financialstock\mcp-server')

from yfinance_sidecar import _scan_multi_year_breakout, BreakoutScannerRequest

params = BreakoutScannerRequest(
    symbols=["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS"],
    breakout="1y",
    tf="daily",
    vol_multiplier=1.5,
    tolerance_pct=20.0,
    min_price=20.0,
    min_mcap=500.0,
    max_de=1.5,
    strict=False,
    no_fundamentals=False,
    top_n=10
)

print("Calling _scan_multi_year_breakout from sidecar backend...")
result = _scan_multi_year_breakout(params)
print("\n--- Output ---")
print(result)
