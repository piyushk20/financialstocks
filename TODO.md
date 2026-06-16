# TODO — NSE 500 FinceptTerminal

> Tracks completed work and planned improvements. Last updated: 2026-06-16.

---

## ✅ Completed

### Core Dashboard
- [x] Next.js 16 dashboard with FastAPI sidecar (port 8015)
- [x] Real-time stock snapshot (price, change, volume, market cap)
- [x] 2-year OHLCV history with candlestick charts (lightweight-charts)
- [x] 15m intraday chart with VWAP, EMA9, ORB overlays
- [x] Live news feed via Google News RSS (zero-cache)
- [x] NSE 500 heatmap (relative performance)
- [x] Pre-market discipline checklist (8-step gate)
- [x] AI analysis tab (Gemini / Groq with financial + technical grounding)
- [x] Financials grid (revenue, EPS, P/E, book value)
- [x] Pivot levels tab (Standard: P, R1, R2, S1, S2)
- [x] Commodities support (GC=F, SI=F, CL=F)
- [x] Strict ticker validation + Pydantic models

### Scanners
- [x] **VCP Scanner** — Minervini-style Volatility Contraction + RS scoring
- [x] **Momentum Burst** — explosive breakout + volume surge detection
- [x] **ORB Scanner** — 15m Opening Range Breakout with R:R auto-calculation
- [x] **WMA 44 + RSI Crossover** — trend-following crossover with RSI > 50 filter
- [x] **EP Scanner** — gap-up / earnings power momentum (≥3.5% move, RVOL ≥1.2x)
- [x] **ATR Extension Scanner** — mean-reversion signal via ATR distance from MA
- [x] **EMA Crossover Scanner** — multi-timeframe EMA cross with volume confirmation
- [x] **Breakout Scanner** — Bollinger Band squeeze + price breakout detection

### Forecasting Pipeline (Added 2026-06-16)
- [x] `mcp-server/forecasting_engine.py` — full quant forecasting engine
  - [x] Technical indicator computation: RSI, MACD, SMA 20/50/200, Annualized Volatility
  - [x] TimesFM (Google foundation model) integration with auto-detect GPU/CPU
  - [x] Statistical AR + Monte Carlo fallback (500 simulated paths, 80% CI)
  - [x] Kelly Criterion (half-Kelly) position sizing
  - [x] Volatility targeting position sizing
  - [x] Stop-loss (−1.5×ATR) and take-profit (2× expected return) levels
  - [x] Monthly rebalancing backtest (1 year, 0.05% fee)
  - [x] Equity curve + Buy-and-Hold benchmark comparison
  - [x] Trade log (date, BUY/SELL, shares, price, fee, portfolio value)
- [x] `mcp-server/yfinance_sidecar.py` — `/forecast` endpoint with 900s TTL cache
- [x] `dashboard/src/app/api/forecast/[symbol]/route.ts` — Next.js API proxy
- [x] `dashboard/src/components/ForecastingTab.tsx` — full forecasting UI
  - [x] Preset ticker tabs: Nifty 50, Bank Nifty, Reliance, TCS, HDFC Bank, Infosys
  - [x] Interactive controls: capital, target volatility %, forecast horizon (days)
  - [x] Price forecast chart (historical + mean projection + 80% confidence band)
  - [x] TimesFM vs Statistical fallback badge indicator
  - [x] Position Sizing Matrix panel (Kelly %, Vol %, stop-loss, take-profit)
  - [x] Backtest equity curve chart vs benchmark
  - [x] Backtest metrics cards (Total Return, Benchmark CAGR, Sharpe, Max Drawdown)
  - [x] Simulated trade log table (scrollable)

---

## 🚧 In Progress / Next Steps

### Forecasting Improvements
- [ ] Add **TimesFM full install guide** to README for users who want GPU-accelerated inference
- [ ] Support **custom ticker input** in the ForecastingTab preset bar (free-form text)
- [ ] Extend backtest to **2-year window** with annual statistics breakdown
- [ ] Add **drawdown chart** below equity curve
- [ ] Add **correlation matrix** across Nifty 50 / sectors

### Scanner Enhancements
- [ ] Add **sector-level heatmap** (banking, IT, pharma, auto, FMCG)
- [ ] **ORB scanner**: alert / notification when a live breakout is detected
- [ ] **EP scanner**: link to earnings calendar to cross-reference event dates
- [ ] **VCP scanner**: add RS Line chart overlay per result row

### Dashboard UX
- [ ] **Saved watchlist** — persist user-selected tickers across sessions (localStorage)
- [ ] **Dark/Light theme toggle**
- [ ] **Mobile-responsive layout** for tablet use
- [ ] **Export to CSV** for scanner results

### Infrastructure
- [ ] Add `docker-compose.yml` for one-command local setup
- [ ] Add GitHub Actions CI for TypeScript type-check + Python lint
- [ ] Add rate-limiting middleware to sidecar for public deployment
- [ ] Investigate **Redis** as a production cache backend (replace in-memory TTL)
