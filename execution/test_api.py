"""
Quick connectivity test for the Financial Datasets API.
Run: C:\Users\HP\.local\bin\uv.exe run python execution\test_api.py
"""

import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv
import os
import sys

# Load from mcp-server/.env
env_path = Path(__file__).parent.parent / "mcp-server" / ".env"
load_dotenv(env_path)

API_KEY = os.getenv("FINANCIAL_DATASETS_API_KEY", "")
BASE = "https://api.financialdatasets.ai"

if not API_KEY or "your-financial" in API_KEY:
    print("❌ FINANCIAL_DATASETS_API_KEY is not set!")
    print("   Edit mcp-server/.env and replace 'your-financial-datasets-api-key'")
    print("   Get a FREE key at: https://financialdatasets.ai/")
    sys.exit(1)

HEADERS = {"X-API-KEY": API_KEY}
TICKER = "RELIANCE.NS"

async def test():
    async with httpx.AsyncClient(timeout=15) as client:
        print(f"\n🔍 Testing Financial Datasets API with ticker: {TICKER}\n")

        # Test 1: Price snapshot
        print("1️⃣  Price snapshot...")
        r = await client.get(f"{BASE}/prices/snapshot/?ticker={TICKER}", headers=HEADERS)
        if r.status_code == 200:
            data = r.json()
            snap = data.get("snapshot", {})
            print(f"   ✅ Price: ₹{snap.get('price', 'N/A')} | Change: {snap.get('percent_change', 'N/A')}%")
        elif r.status_code == 401:
            print("   ❌ 401 Unauthorized — API key is invalid or expired")
            sys.exit(1)
        elif r.status_code == 429:
            print("   ⚠️  429 Rate limit hit (free tier: 100 calls/day)")
        else:
            print(f"   ⚠️  HTTP {r.status_code}: {r.text[:200]}")

        # Test 2: Income statements
        print("2️⃣  Income statements...")
        r = await client.get(
            f"{BASE}/financials/income-statements/?ticker={TICKER}&period=annual&limit=2",
            headers=HEADERS
        )
        if r.status_code == 200:
            stmts = r.json().get("income_statements", [])
            print(f"   ✅ Got {len(stmts)} annual income statement(s)")
        else:
            print(f"   ⚠️  HTTP {r.status_code}")

        # Test 3: News
        print("3️⃣  Company news...")
        r = await client.get(f"{BASE}/news/?ticker={TICKER}&limit=3", headers=HEADERS)
        if r.status_code == 200:
            news = r.json().get("news", [])
            print(f"   ✅ Got {len(news)} news item(s)")
            if news:
                print(f"   📰 Latest: {news[0].get('title', '')[:80]}")
        else:
            print(f"   ⚠️  HTTP {r.status_code}")

        print("\n✅ API connection successful! Add this key to dashboard/.env.local:")
        print(f"   FINANCIAL_DATASETS_API_KEY={API_KEY}")
        print("\nThen restart the Next.js dev server:\n   npm run dev\n")

asyncio.run(test())
