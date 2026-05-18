# FinancialStocks Dashboard — Last Stable State (2026-05-08)

- **Backend (Sidecar)**: `uv run python yfinance_sidecar.py` on port **8015** (from `mcp-server/`)
- **Frontend (Next.js)**: `npm run dev -- --port 3020` on port **3020** (from `dashboard/`)
- **Verified URLs**:
  - Frontend: `http://localhost:3020`
  - Backend Health: `http://127.0.0.1:8015/health`
- **Port Conflict Note**: Port `3015` was previously used but moved to `3020` per user request to avoid conflicts with other apps.
- **Dependency Note**: Uses `yfinance` and `FastAPI` for the backend sidecar.
