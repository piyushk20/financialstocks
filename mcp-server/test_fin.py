import yfinance as yf
import pandas as pd
import sys
sys.path.insert(0, '.')
from yfinance_sidecar import _get_financials

t = yf.Ticker('RELIANCE.NS')
print("income_stmt is empty?", t.income_stmt.empty)
print("columns:", list(t.income_stmt.columns))
print("index:", list(t.income_stmt.index))

res = _get_financials('RELIANCE.NS', 'annual')
print("Result contains keys:", res.keys())
if res['income']:
    print("First income record:", res['income'][0])
else:
    print("Income records are empty!")
