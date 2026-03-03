import asyncio
import httpx
import os

KEY = os.getenv("FINANCIAL_DATASETS_API_KEY", "your-api-key")
HEADERS = {"X-API-KEY": KEY}
BASE = "https://api.financialdatasets.ai"

async def main():
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
        tickers = ["RELIANCE.NS", "RELIANCE.BO", "TCS.NS", "NVDA", "AAPL"]
        for t in tickers:
            r = await c.get(f"{BASE}/prices/snapshot?ticker={t}", headers=HEADERS)
            if r.status_code == 200:
                data = r.json().get("snapshot", {})
                print(f"OK   {t}: price={data.get('price')}")
            else:
                print(f"FAIL {t}: HTTP {r.status_code} - {r.text[:100]}")

asyncio.run(main())
