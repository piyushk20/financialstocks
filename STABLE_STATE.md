# FinancialStocks Dashboard — Last Stable State (2026-05-22)

- **Backend (Sidecar)**: `uv run python yfinance_sidecar.py` on port **8015** (from `mcp-server/`)
- **Frontend (Next.js)**: `npm run dev -- -p 3020` on port **3020** (from `dashboard/`)
- **Verified URLs**:
  - Frontend: `http://localhost:3020`
  - Backend Health: `http://127.0.0.1:8015/health`
  - Backend Financials for Banking: `http://127.0.0.1:8015/financials?ticker=HDFCBANK.NS`
- **Port Conflict Note**: Port `3015` was previously used but moved to `3020` per user request to avoid conflicts with other apps.
- **Dependency Note**: Uses `yfinance` and `FastAPI` for the backend sidecar.
- **Resilient Financial Mapping**: Updated the sidecar to support specialized bank/financial accounting formats by mapping indices like `gross_profit`, `ebitda`, `operating_income`, `cash_and_equivalents`, and `capital_expenditures` to their resilient bank-specific equivalents, preventing blank `—` values on the UI.

