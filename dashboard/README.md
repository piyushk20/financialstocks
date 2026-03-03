# NSE 200 Stock Dashboard

A professional, real-time stock market dashboard for Indian equities — featuring live price data, interactive candlestick charts with technical indicators, AI-powered analysis, financial statements, and a Nifty 50 heatmap. Built with Next.js 15 and powered by a local yfinance sidecar.

---

## ✨ Features

### 📊 Real-Time Market Data

- **Live price polling** — prices, OHLC, volume, and 52-week high/low update every 30 seconds
- **Nifty 50 Heatmap** — full-market colour-coded grid showing % change from previous close; click any tile to open that stock
- **Stock Picker** — search across all 200 NSE constituents by name or ticker

### 📈 Interactive Candlestick Chart

- 2-year daily OHLCV candlestick chart powered by **lightweight-charts v5**
- **SMA overlays** — 20d (blue), 50d (amber), 200d (violet) with current price displayed in the legend
- **Volume histogram** as a sub-pane
- Time-based SMA alignment ensures levels are plotted on the correct dates
- Responsive, resizes with the browser window

### 🔬 Technical Indicators Panel

- RSI (14), MACD with Signal and Histogram
- EMA 20 / 50 / 200 with trend-direction colouring

### 💰 Financial Statements

- **Annual & Quarterly** toggle — fetches the correct period from yfinance on demand
- Income Statement: Revenue, Gross Profit, EBITDA, Net Income, EPS
- Balance Sheet: Total Assets, Liabilities, Equity, Cash, Debt
- Cash Flow: Operating, Investing, Financing, Free Cash Flow, CapEx
- All values formatted in Indian ₹ Crore notation

### 🗞️ News Feed

- Latest 15 news articles per stock, sourced from Yahoo Finance

### 🤖 AI Analysis (✦)

- One-click AI analysis using **Google Gemini** with automatic **Groq (Llama-3)** fallback
- Analyses price, technical indicators, and financial data to generate structured buy/hold/sell commentary

---

## 🏗️ Architecture

```
financialstock/
├── dashboard/               # Next.js 15 frontend (App Router)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Main dashboard page
│   │   │   └── api/
│   │   │       ├── stock/[symbol]      # Price + 2yr OHLCV history
│   │   │       ├── technicals/[symbol] # RSI, MACD, SMA, EMA
│   │   │       ├── financials/[symbol] # Income / Balance / Cash Flow
│   │   │       ├── snapshot/           # Batch price for heatmap
│   │   │       ├── news/[symbol]       # Latest articles
│   │   │       └── ai-analysis/        # Gemini → Groq AI
│   │   └── components/
│   │       ├── CandlestickChart.tsx   # Chart + SMA overlays
│   │       ├── TechnicalPanel.tsx     # RSI + MACD panels
│   │       ├── FinancialsGrid.tsx     # Annual/Quarterly tables
│   │       ├── Heatmap.tsx            # Nifty 50 grid
│   │       ├── PriceHeader.tsx        # Live price card
│   │       ├── NewsFeed.tsx           # Article list
│   │       └── AIAnalysisTab.tsx      # AI commentary
│   └── .env.local                     # API keys (not committed)
└── mcp-server/
    └── yfinance_sidecar.py  # FastAPI sidecar on :8001
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- npm / pnpm

### 1. Install dashboard dependencies

```bash
cd dashboard
npm install
```

### 2. Configure environment variables

Create `dashboard/.env.local`:

```env
GEMINI_API_KEY=your_google_gemini_api_key
GROQ_API_KEY=your_groq_api_key
NEXT_PUBLIC_POLL_INTERVAL_MS=30000
```

> **Note:** Get a free Gemini API key at [ai.google.dev](https://ai.google.dev). Groq key from [console.groq.com](https://console.groq.com).

### 3. Start the Python sidecar

```bash
cd mcp-server
pip install yfinance fastapi uvicorn pandas
python yfinance_sidecar.py
```

The sidecar starts on `http://127.0.0.1:8001`.

### 4. Start the dashboard

```bash
cd dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🔄 Restarting the Sidecar

If you need to restart the sidecar (e.g., after code changes):

```powershell
# Kill existing sidecar and restart
$pid = (netstat -ano | Select-String ":8001.*LISTENING").ToString().Split()[-1]
Stop-Process -Id $pid -Force
python mcp-server/yfinance_sidecar.py
```

---

## 🔒 Security

- **Input validation** — all ticker symbols validated with strict regex (`/^[A-Z0-9.\-_^]{1,20}$/i`) before being forwarded to the sidecar
- **API keys** stored in `.env.local` (excluded from git via `.gitignore`)
- **Zero npm vulnerabilities** (`npm audit` clean)
- Sidecar CORS restricted to `localhost:3000` only

---

## 📡 Sidecar API Reference

The sidecar runs at `http://127.0.0.1:8001` and is only called server-side by Next.js API routes.

| Endpoint                                            | Method | Description                    |
| --------------------------------------------------- | ------ | ------------------------------ |
| `/snapshot?ticker=RELIANCE.NS`                      | GET    | Live price + metadata          |
| `/history?ticker=RELIANCE.NS&period=2y&interval=1d` | GET    | OHLCV price history            |
| `/financials?ticker=RELIANCE.NS&period=annual`      | GET    | Annual or quarterly statements |
| `/technicals?ticker=RELIANCE.NS`                    | GET    | RSI, MACD, SMAs, EMAs          |
| `/news?ticker=RELIANCE.NS`                          | GET    | Latest articles                |
| `/health`                                           | GET    | Sidecar health check           |

---

## 🛠️ Tech Stack

| Layer              | Technology                              |
| ------------------ | --------------------------------------- |
| Frontend Framework | Next.js 15 (App Router)                 |
| Styling            | Tailwind CSS + custom glass morphism    |
| Charts             | lightweight-charts v5                   |
| Data Fetching      | SWR (with 30s polling)                  |
| Animations         | Framer Motion                           |
| Market Data        | yfinance (via FastAPI sidecar)          |
| AI Analysis        | Google Gemini + Groq (Llama-3) fallback |

---

## 📝 Notes

- Data is sourced from **Yahoo Finance** via `yfinance` and is for **informational purposes only**
- Market data may be delayed; this is not a trading platform
- NSE 200 constituent list is statically bundled in `src/data/nse200.ts`
