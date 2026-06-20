import yfinance as yf
import sys
sys.path.insert(0, '.')
from yfinance_sidecar import _get_financials

res = _get_financials('RELIANCE.NS', 'annual')
print("Income length:", len(res['income']))
print("Balance length:", len(res['balance']))
print("Cashflow length:", len(res['cashflow']))

if res['balance']:
    print("\nFirst balance sheet record keys and values:")
    for k, v in res['balance'][0].items():
        if v is not None:
            print(f"  {k}: {v}")
else:
    print("\nBalance records empty!")

if res['cashflow']:
    print("\nFirst cash flow record keys and values:")
    for k, v in res['cashflow'][0].items():
        if v is not None:
            print(f"  {k}: {v}")
else:
    print("\nCashflow records empty!")
