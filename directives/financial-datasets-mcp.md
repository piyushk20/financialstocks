---
directive: financial-datasets-mcp-setup
---

# Financial Datasets MCP Server — Directive

## Purpose

Provides the AI agent (you) with live stock market data for Indian NSE stocks via the
Financial Datasets AI API (https://financialdatasets.ai/).

## Location

`mcp-server/server.py` — FastMCP server using `financial-datasets` as the server ID.

## Available Tools

| Tool                                                                  | NSE Usage                          |
| --------------------------------------------------------------------- | ---------------------------------- |
| `get_current_stock_price(ticker)`                                     | e.g. `ticker="RELIANCE.NS"`        |
| `get_historical_stock_prices(ticker, start_date, end_date, interval)` | `interval="day"`                   |
| `get_income_statements(ticker, period, limit)`                        | `period="annual"` or `"quarterly"` |
| `get_balance_sheets(ticker, period, limit)`                           | —                                  |
| `get_cash_flow_statements(ticker, period, limit)`                     | —                                  |
| `get_company_news(ticker)`                                            | —                                  |

## NSE Ticker Format

Append `.NS` for NSE India stocks — e.g.:

- `RELIANCE.NS`, `TCS.NS`, `HDFCBANK.NS`, `INFY.NS`, `TATAMOTORS.NS`

## Setup Steps

1. Get free API key at https://financialdatasets.ai/ (free tier: 100 calls/day)
2. Edit `mcp-server/.env` — replace `your-financial-datasets-api-key` with your key
3. Also add the key to `dashboard/.env.local` as `FINANCIAL_DATASETS_API_KEY=<key>`
4. Start the MCP server:

   ```powershell
   # Option A: using start script (recommended)
   cd mcp-server
   .\start-mcp.ps1

   # Option B: direct uv command
   cd mcp-server
   C:\Users\HP\.local\bin\uv.exe run server.py
   ```

## Environment

- **uv**: `C:\Users\HP\.local\bin\uv.exe`
- **Python**: 3.14.2 (managed by uv)
- **venv**: `mcp-server\.venv\`
- **dependencies**: mcp[cli], httpx, python-dotenv

## Dashboard Integration

The Next.js dashboard (`dashboard/`) calls the Financial Datasets API **directly**
via `src/lib/financialDatasets.ts` using the same key — bypassing the MCP stdio transport.
The MCP server is used by AI agents (Claude Desktop, Antigravity) via stdio.

Both need the same `FINANCIAL_DATASETS_API_KEY`.

## Common Errors

- `401 Unauthorized` → Key is wrong or missing
- `429 Too Many Requests` → Free tier limit hit (100/day). Upgrade or wait 24h.
- `404 Not Found` → Ticker not found on Financial Datasets. Try `.NS` suffix for NSE.
- `uv not found` → Re-run the uv installer: `irm https://astral.sh/uv/install.ps1 | iex`

## Verification Command

```powershell
# Quick test without API key (returns error, but confirms server starts)
C:\Users\HP\.local\bin\uv.exe run python -c "
import asyncio, sys
sys.path.insert(0, '.')
from server import make_request
result = asyncio.run(make_request('https://api.financialdatasets.ai/prices/snapshot/?ticker=RELIANCE.NS'))
print(result)
"
```
