# 📊 NSE 200 Stock Dashboard

> A professional, real-time Indian stock market dashboard — built with Next.js 15, yfinance, and AI-powered analysis.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Python](https://img.shields.io/badge/Python-3.9+-blue?logo=python)
![yfinance](https://img.shields.io/badge/Data-yfinance-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ What It Does

| Feature                 | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| 📈 Live Prices          | OHLC, volume, 52-week high/low — refreshes every 30s    |
| 🔥 Nifty 50 Heatmap     | Colour-coded grid showing % change; click to open stock |
| 🕯️ Candlestick Chart    | 2-year OHLCV with SMA 20/50/200 price overlays + volume |
| 🔬 Technical Indicators | RSI (14), MACD, EMA 20/50/200                           |
| 💰 Financials           | Annual & Quarterly Income, Balance Sheet, Cash Flow     |
| 🗞️ News                 | Latest 15 articles per stock via Yahoo Finance          |
| 🤖 AI Analysis          | Gemini → Groq fallback: buy/hold/sell commentary        |

---

## 🏗️ Project Structure

```
financialstock/
├── dashboard/               # Next.js 15 frontend
│   ├── src/app/api/         # Server-side API routes
│   └── src/components/      # UI components
└── mcp-server/
    └── yfinance_sidecar.py  # FastAPI data sidecar (port 8001)
```

---

## 🚀 Quick Start

### 1. Install frontend

```bash
cd dashboard
npm install
```

### 2. Set environment variables

Create `dashboard/.env.local`:

```env
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
NEXT_PUBLIC_POLL_INTERVAL_MS=30000
```

### 3. Start the Python sidecar

```bash
pip install yfinance fastapi uvicorn pandas
python mcp-server/yfinance_sidecar.py
```

### 4. Start the dashboard

```bash
cd dashboard
npm run dev
```

Open **http://localhost:3000**

---

## 📡 Sidecar API

| Endpoint                                                      | Description           |
| ------------------------------------------------------------- | --------------------- |
| `GET /snapshot?ticker=RELIANCE.NS`                            | Live price + metadata |
| `GET /history?ticker=RELIANCE.NS&period=2y&interval=1d`       | OHLCV history         |
| `GET /financials?ticker=RELIANCE.NS&period=annual\|quarterly` | Financial statements  |
| `GET /news?ticker=RELIANCE.NS`                                | Latest articles       |
| `GET /health`                                                 | Health check          |

---

## 🔒 Security

- Ticker symbols validated with strict regex on every API route
- API keys stored in `.env.local` — **never committed**
- Sidecar CORS restricted to `localhost:3000`
- Zero `npm audit` vulnerabilities

---

## 🛠️ Tech Stack

**Frontend:** Next.js 15 · Tailwind CSS · SWR · lightweight-charts v5 · Framer Motion  
**Backend:** FastAPI · yfinance · Python 3.9+  
**AI:** Google Gemini (primary) · Groq / Llama-3 (fallback)

---

## ⚠️ Disclaimer

Data sourced from Yahoo Finance via `yfinance`. For **informational purposes only** — not a trading platform. Market data may be delayed.
