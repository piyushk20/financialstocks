# NSE 500 FinceptTerminal

> A professional, real-time Indian stock market intelligence dashboard — built with Next.js 16, FastAPI, and AI-powered quantitative analysis.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)
![yfinance](https://img.shields.io/badge/Data-yfinance-green)
![AI](https://img.shields.io/badge/AI-Gemini_|_Groq-violet)

---

## ✨ Features

| Feature                          | Description                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| ⚡ **VCP & RS Scanner**          | Minervini-style Volatility Contraction Pattern scanner with Relative Strength scoring across NSE 500. |
| 📈 **Momentum Burst Scanner**    | Detects explosive momentum breakouts with volume surge confirmation.        |
| 🎯 **15-Minute ORB Scanner**     | Opening Range Breakout strategy with VWAP, EMA9, volume confluence filters, and auto-calculated trade levels (Entry/SL/TP1/TP2/R:R). |
| 📊 **Intraday Chart Viewer**     | 15m candlestick charts with VWAP, EMA9, and ORB High/Low overlays via lightweight-charts. Dropdown stock selector from NSE 500. |
| 🔄 **WMA 44 + RSI Crossover**    | Detects stocks crossing above 44-period Weighted Moving Average with RSI > 50 confirmation. |
| 🚀 **EP (Earnings Power) Scanner** | Detects gap-up momentum events (≥8% gap, ≥2.5x RVOL) with Stage 2 trend and 52W high proximity scoring. |
| 📦 **Commodities**               | Native support for global commodities (GC=F, SI=F, CL=F).                  |
| 🎯 **Pivot Levels**              | Automated Standard Pivot Point calculation (P, R1, R2, S1, S2).            |
| 🔥 **NSE 500 Heatmap**           | Real-time relative performance of the top 500 Indian stocks.               |
| 📰 **Live News Feed**            | Instant, zero-cache news fetching via Google News RSS integration.          |
| 🤖 **AI Intelligence**           | Real-time analysis grounded in financials and technicals via Gemini/Groq.   |
| ✅ **Pre-Market Checklist**       | Interactive 8-step trading discipline gate with progress ring.              |

---

## 🏗️ Project Architecture

```
financialstock/
├── dashboard/                    # Next.js 16 + Tailwind CSS + Framer Motion
│   ├── src/app/api/              # API Proxy Routes (snapshot, technicals, scanners)
│   │   ├── orb-scanner/          # 15m ORB Scanner proxy
│   │   ├── intraday/             # Intraday chart data proxy
│   │   ├── wma44-crossover/      # WMA 44 + RSI crossover proxy
│   │   ├── ep-scanner/           # Earnings Power scanner proxy
│   │   ├── vcp-scanner/          # VCP scanner proxy
│   │   ├── momentum-burst/       # Momentum burst proxy
│   │   └── ai-analysis/          # AI analysis proxy
│   └── src/components/           # Strategy Tabs & UI Components
│       ├── ORBScannerTab.tsx      # ORB Scanner + Checklist + Intraday Chart
│       ├── WMACrossoverTab.tsx    # WMA 44 + RSI Scanner
│       ├── EPScannerTab.tsx       # Earnings Power Scanner
│       ├── MomentumBurstTab.tsx   # Momentum Burst Scanner
│       └── CandlestickChart.tsx   # Reusable candlestick chart component
├── mcp-server/                   # Data Sidecar (FastAPI on port 8015)
│   └── yfinance_sidecar.py       # Real-time data & Technical analysis engine
└── directives/                   # Agile SOPs and operating principles
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** 18+ and **npm**
- **Python** 3.10+ with [uv](https://astral.sh/uv/install.ps1) package manager

### 2. Start the Backend (FastAPI Sidecar)
```powershell
cd mcp-server
uv run python yfinance_sidecar.py
# Runs on http://127.0.0.1:8015
```

### 3. Start the Frontend (Next.js Dashboard)
```powershell
cd dashboard
npm run dev
# Runs on http://localhost:3020
```

### 4. Environment Variables
Create `dashboard/.env.local`:
```env
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
NEXT_PUBLIC_POLL_INTERVAL_MS=30000
```

---

## 📡 API Endpoints

### Data Endpoints
| Method | Endpoint                        | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | `/snapshot?ticker=RELIANCE.NS`  | Real-time quote & metadata               |
| GET    | `/history?ticker=RELIANCE.NS`   | OHLCV data for charts                    |
| GET    | `/technicals/{symbol}`          | RSI, MACD, Moving Averages, Pivots       |
| GET    | `/financials/{symbol}`          | Key financial ratios & earnings           |
| GET    | `/news/{symbol}`                | Stock-specific Google News RSS            |
| GET    | `/intraday?ticker=RELIANCE.NS`  | 15m intraday candles with VWAP & EMA9    |

### Scanner Endpoints
| Method | Endpoint              | Description                                          |
| ------ | --------------------- | ---------------------------------------------------- |
| POST   | `/vcp-scanner`        | Minervini VCP + RS scan across universe               |
| POST   | `/momentum-burst`     | Momentum burst detection with volume confirmation     |
| POST   | `/orb-scanner`        | 15-Minute Opening Range Breakout scanner              |
| POST   | `/wma44-crossover`    | WMA 44 crossover + RSI > 50 filter                   |
| POST   | `/ep-scanner`         | Earnings Power gap-up momentum scanner                |

---

## 🔒 Security & Reliability
- Strict regex validation for all ticker inputs
- Type-safe Pydantic models for backend data
- Local deterministic fallback for AI analysis if API quotas are met
- `suppressHydrationWarning` to handle browser extension DOM injection

---

## ⚠️ Disclaimer
Data via Yahoo Finance. For informational purposes only. Not financial advice. Market data may be delayed.
