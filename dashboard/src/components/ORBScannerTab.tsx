"use client";

import { useEffect, useRef, useState } from "react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";
import {
  Loader2,
  TrendingUp,
  BarChart2,
  Activity,
  CheckSquare,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  RefreshCw,
  Search,
  AlertCircle,
  Sliders,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

type ORBMatch = {
  symbol: string;
  name: string;
  ltp: number;
  direction: "LONG" | "SHORT" | "NONE";
  signal_strength: number;
  orb: { high: number; low: number; size: number; midpoint: number; avg_volume: number };
  filters: { vwap_ok: boolean; volume_ok: boolean; ema9_ok: boolean; range_width_ok: boolean };
  vwap: number;
  ema9: number;
  atr: number;
  entry_method: string;
  levels?: { entry: number; sl: number; tp1: number; tp2: number; rr_ratio: number; sl_pts: number; sl_pct: number; direction?: "LONG" | "SHORT" | "NONE" };
  error: string | null;
};

type IntradayCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  ema9: number;
};

export function ORBScannerTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [activeTab, setActiveTab] = useState<"scanner" | "checklist" | "chart">("scanner");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ORBMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [universe, setUniverse] = useState<"nifty50" | "nifty500" | "large" | "mid" | "small" | "micro" | "sectoral">("nifty50");
  const [volMult, setVolMult] = useState(1.5);
  const [maxRangeAtr, setMaxRangeAtr] = useState(2.0);
  const [minRr, setMinRr] = useState(1.0);
  const [topN, setTopN] = useState(50);

  // Selected symbol for Intraday Chart
  const [selectedTicker, setSelectedTicker] = useState<string>("RELIANCE.NS");
  const [intradayData, setIntradayData] = useState<{ orb: ORBMatch["orb"]; levels: ORBMatch["levels"]; history: IntradayCandle[] } | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Checklist state
  const [checklist, setChecklist] = useState({
    globalSentiment: false,
    sectorTrend: false,
    premarketGap: false,
    orbMarked: false,
    vwapConfluence: false,
    volumeSurge: false,
    ema9Trend: false,
    rrVerified: false,
  });

  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const handleScan = async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
      setMatches(null);
    }

    try {
      let filteredStocks = NSE500;
      if (universe === "nifty50") {
        filteredStocks = NSE500.filter(s => NIFTY50_SYMBOLS.includes(s.symbol) || NIFTY50_SYMBOLS.includes(s.symbol.replace(".NS", "")));
      } else if (universe === "nifty500") {
        filteredStocks = NSE500.filter(s => s.sector !== "Index" && s.sector !== "Commodity" && (s as any).cap !== "micro");
      } else if (universe === "large" || universe === "mid" || universe === "small" || universe === "micro") {
        filteredStocks = NSE500.filter(s => s.sector !== "Index" && s.sector !== "Commodity" && (s as any).cap === universe);
      } else {
        filteredStocks = NSE500.filter(s => s.sector === "Index");
      }
      const symbols = filteredStocks.map(s => s.symbol);

      const res = await fetch("/api/orb-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          volume_multiplier: volMult,
          max_range_atr_ratio: maxRangeAtr,
          min_rr: minRr,
          top_n: topN,
        }),
      });

      if (!res.ok) throw new Error("Scan failed to execute");
      const data = await res.json();
      const filteredMatches = (data.matches || []).filter((m: ORBMatch) => !m.levels || m.levels.rr_ratio >= minRr);
      setMatches(filteredMatches);
      if (data.is_market_open !== undefined) setIsMarketOpen(data.is_market_open);
      if (data.timestamp) setLastUpdated(data.timestamp);
    } catch (err: unknown) {
      if (!silent) {
        if (err instanceof Error) {
          setError(err.message || "An error occurred");
        } else {
          setError("An error occurred");
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleViewChart = (ticker: string) => {
    setSelectedTicker(ticker);
    setActiveTab("chart");
  };

  useEffect(() => {
    if (activeTab === "chart") {
      fetchIntradayChart(selectedTicker);
    }
  }, [activeTab, selectedTicker]);

  useEffect(() => {
    // Initial scan on mount
    handleScan();
  }, []);

  useEffect(() => {
    if (!autoRefresh || !isMarketOpen) return;
    const timer = setInterval(() => {
      handleScan(true);
    }, 60000);
    return () => clearInterval(timer);
  }, [autoRefresh, isMarketOpen, universe, volMult, maxRangeAtr, minRr, topN]);

  const fetchIntradayChart = async (ticker: string) => {
    if (!ticker) return;
    setChartLoading(true);
    setChartError(null);

    try {
      const res = await fetch(`/api/intraday?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) throw new Error("Failed to fetch intraday data");
      const data = await res.json();
      setIntradayData(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setChartError(err.message || "An error occurred while loading chart");
      } else {
        setChartError("An error occurred while loading chart");
      }
    } finally {
      setChartLoading(false);
    }
  };

  const checklistCompletedCount = Object.values(checklist).filter(Boolean).length;
  const checklistTotalCount = Object.keys(checklist).length;
  const checklistPercent = Math.round((checklistCompletedCount / checklistTotalCount) * 100);

  return (
    <div className="surface-card rounded-2xl p-6 border border-zinc-800/50 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                15-Minute ORB Strategy Scanner
              </h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                Opening Range Breakout screener with volume, VWAP, and EMA9 confluences.
              </p>
              {matches !== null && (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {isMarketOpen ? (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      🔴 LIVE MARKET SESSION (Auto-updating)
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                      ⏸️ MARKET CLOSED (Showing Breakouts Only)
                    </div>
                  )}
                  {lastUpdated && (
                    <span className="text-xs text-zinc-500 font-mono">
                      Updated: {lastUpdated}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 shrink-0 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("scanner")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === "scanner"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Scanner
          </button>
          <button
            onClick={() => setActiveTab("checklist")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === "checklist"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Checklist
          </button>
          <button
            onClick={() => setActiveTab("chart")}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === "chart"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Eye className="w-4 h-4" />
            Intraday Chart
          </button>
        </div>
      </div>

      {/* SCANNER VIEW */}
      {activeTab === "scanner" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="space-y-4 bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/60 shadow-inner">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  Universe
                </label>
                <select
                  value={universe}
                  onChange={(e) => setUniverse(e.target.value as any)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all font-medium"
                >
                  <option value="nifty50">Nifty 50</option>
                  <option value="nifty500">Nifty 500 Universe</option>
                  <option value="large">Large Cap Stocks</option>
                  <option value="mid">Mid Cap Stocks</option>
                  <option value="small">Small Cap Stocks</option>
                  <option value="micro">Micro Cap Stocks</option>
                  <option value="sectoral">Sectoral Indices</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  Volume Surge (x avg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={volMult}
                  onChange={(e) => setVolMult(parseFloat(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  Max Range / ATR Ratio
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={maxRangeAtr}
                  onChange={(e) => setMaxRangeAtr(parseFloat(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  Min Risk:Reward
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={minRr}
                  onChange={(e) => setMinRr(parseFloat(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
                  Top N Results
                </label>
                <input
                  type="number"
                  value={topN}
                  onChange={(e) => setTopN(parseInt(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-3 border-t border-zinc-800/60">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-400 cursor-pointer hover:text-zinc-300">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-700 text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
                />
                Auto-Refresh every 60s (Live Market)
              </label>

              <button
                onClick={() => handleScan(false)}
                disabled={loading}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Scanning 15m ORB...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" /> Run ORB Scanner
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 p-4 rounded-2xl border border-red-500/20 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {matches !== null && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-violet-400" />
                  Found {matches.length} ORB Candidates
                </h3>
              </div>

              {matches.length === 0 ? (
                <div className="text-center py-12 text-sm text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/40">
                  No stocks match the current ORB filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto border border-zinc-800/80 rounded-2xl shadow-xl bg-zinc-900/30">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                        <th className="py-4 px-4">Symbol</th>
                        <th className="py-4 px-4 text-right">LTP (₹)</th>
                        <th className="py-4 px-4 text-center">Breakout</th>
                        <th className="py-4 px-4 text-center">Strength</th>
                        <th className="py-4 px-4 text-right">OR High/Low</th>
                        <th className="py-4 px-4 text-right">VWAP</th>
                        <th className="py-4 px-4 text-right">Entry / SL</th>
                        <th className="py-4 px-4 text-right">TP1 / TP2</th>
                        <th className="py-4 px-4 text-right">R:R Ratio</th>
                        <th className="py-4 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {matches.map((m) => (
                        <tr
                          key={m.symbol}
                          className="hover:bg-zinc-800/30 transition-colors group"
                        >
                          <td className="py-4 px-4 font-bold text-zinc-100">
                            <div className="flex items-center gap-2">
                              <span>{m.name}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">15m</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-semibold text-zinc-200">
                            {m.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-4 text-center">
                            {m.direction === "LONG" ? (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 shadow-sm">
                                <ArrowUpRight className="w-3.5 h-3.5" /> LONG
                              </span>
                            ) : m.direction === "SHORT" ? (
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1 shadow-sm">
                                <ArrowDownRight className="w-3.5 h-3.5" /> SHORT
                              </span>
                            ) : (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700 inline-flex items-center">
                                NONE
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-1 text-amber-400">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < m.signal_strength ? "fill-amber-400" : "text-zinc-700"
                                  }`}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-xs">
                            <div className="text-zinc-200">{m.orb.high.toFixed(2)}</div>
                            <div className="text-zinc-500">{m.orb.low.toFixed(2)}</div>
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-xs">
                            <span
                              className={
                                m.direction === "LONG"
                                  ? m.ltp > m.vwap
                                    ? "text-emerald-400 font-semibold"
                                    : "text-rose-400"
                                  : m.direction === "SHORT"
                                  ? m.ltp < m.vwap
                                    ? "text-emerald-400 font-semibold"
                                    : "text-rose-400"
                                  : "text-zinc-400"
                              }
                            >
                              {m.vwap.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-xs">
                            {m.levels ? (
                              <>
                                <div className="text-emerald-400 font-bold">
                                  {m.levels.entry.toFixed(2)}
                                </div>
                                <div className="text-rose-400">
                                  {m.levels.sl.toFixed(2)} (-{m.levels.sl_pct}%)
                                </div>
                              </>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right font-mono text-xs">
                            {m.levels ? (
                              <>
                                <div className="text-violet-400 font-semibold">
                                  {m.levels.tp1.toFixed(2)}
                                </div>
                                <div className="text-indigo-400 font-semibold">
                                  {m.levels.tp2.toFixed(2)}
                                </div>
                              </>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-bold">
                            {m.levels ? (
                              <span
                                className={
                                  m.levels.rr_ratio >= 2.0
                                    ? "text-emerald-400"
                                    : m.levels.rr_ratio >= 1.5
                                    ? "text-violet-400"
                                    : "text-amber-400"
                                }
                              >
                                {m.levels.rr_ratio}:1
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => handleViewChart(m.symbol)}
                              className="p-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white rounded-xl transition-all shadow-md group-hover:border-violet-500/50 border border-zinc-700 inline-flex items-center gap-1.5 text-xs font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" /> Chart
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CHECKLIST VIEW */}
      {activeTab === "checklist" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/30 p-6 rounded-2xl border border-violet-500/20 shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-1 text-center md:text-left">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center justify-center md:justify-start gap-2">
                <CheckSquare className="w-5 h-5 text-violet-400" /> Pre-Market & Execution Checklist
              </h3>
              <p className="text-sm text-zinc-400">
                Ensure high probability trades by verifying global confluences before entering ORB breakouts.
              </p>
            </div>
            <div className="flex items-center gap-4 bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800/80 shadow-inner">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    className="stroke-zinc-800"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    className="stroke-violet-500 transition-all duration-500"
                    strokeWidth="6"
                    strokeDasharray={163.36}
                    strokeDashoffset={163.36 - (163.36 * checklistPercent) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute text-sm font-bold text-zinc-100">{checklistPercent}%</span>
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-100">
                  {checklistCompletedCount} of {checklistTotalCount} Done
                </div>
                <div className="text-xs text-zinc-400">Trading Discipline Gate</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                id: "globalSentiment",
                title: "Global & Asian Market Sentiment Check",
                desc: "Check GIFT Nifty, US Futures, and Asian indices for strong positive/negative bias.",
              },
              {
                id: "sectorTrend",
                title: "Sector Rotation & Nifty Alignment",
                desc: "Verify that the stock's sector is in the top 3 momentum sectors for the day.",
              },
              {
                id: "premarketGap",
                title: "Pre-market Gap Evaluation",
                desc: "Avoid stocks with > 2% gap up/down as range expansion may already be exhausted.",
              },
              {
                id: "orbMarked",
                title: "First 15m OR Range Marked",
                desc: "Let the 9:15 - 9:30 AM candle fully close. Note the precise High and Low levels.",
              },
              {
                id: "vwapConfluence",
                title: "VWAP Confluence Verified",
                desc: "For LONG breakouts, price must hold above VWAP. For SHORTs, price must be below VWAP.",
              },
              {
                id: "volumeSurge",
                title: "Breakout Volume Confirmation",
                desc: "The breakout candle volume should be >= 1.5x the 20-period average volume.",
              },
              {
                id: "ema9Trend",
                title: "EMA9 Trend Alignment",
                desc: "Ensure price is riding the 9 EMA in the direction of the intended breakout.",
              },
              {
                id: "rrVerified",
                title: "Risk-to-Reward Ratio Check",
                desc: "Verify that TP1 offers at least 1.5:1 reward relative to the stop loss risk.",
              },
            ].map((item) => (
              <div
                key={item.id}
                onClick={() =>
                  setChecklist((prev) => ({
                    ...prev,
                    [item.id]: !prev[item.id as keyof typeof prev],
                  }))
                }
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                  checklist[item.id as keyof typeof checklist]
                    ? "bg-violet-500/10 border-violet-500/40 shadow-lg shadow-violet-500/5"
                    : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 border transition-all mt-0.5 ${
                    checklist[item.id as keyof typeof checklist]
                      ? "bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-500/30"
                      : "bg-zinc-800 border-zinc-700 text-transparent"
                  }`}
                >
                  <CheckSquare className="w-4 h-4 stroke-[3]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    {item.title}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {checklistPercent === 100 && (
            <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-600/20 via-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-center space-y-2 shadow-2xl">
              <div className="inline-flex p-3 rounded-full bg-emerald-500/20 text-emerald-400 mb-1">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-emerald-300">All Systems Go for Trading!</h3>
              <p className="text-sm text-emerald-400/90 max-w-lg mx-auto">
                Checklist is 100% verified. You have satisfied all risk management and confluence checks. Maintain strict position sizing and follow stop loss levels.
              </p>
            </div>
          )}
        </div>
      )}

      {/* INTRADAY CHART VIEW */}
      {activeTab === "chart" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Search className="w-5 h-5 text-zinc-400 shrink-0" />
              <select
                value={selectedTicker}
                onChange={(e) => {
                  setSelectedTicker(e.target.value);
                  fetchIntradayChart(e.target.value);
                }}
                className="bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 font-mono outline-none w-full md:w-80 transition-all cursor-pointer"
              >
                {NSE500.filter(s => s.sector !== "Index").map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol.replace(".NS", "")} ({s.name})
                  </option>
                ))}
              </select>
              <button
                onClick={() => fetchIntradayChart(selectedTicker)}
                disabled={chartLoading}
                className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md shrink-0 flex items-center gap-2"
              >
                {chartLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh Chart
              </button>
            </div>

            {intradayData?.orb && (
              <div className="flex flex-wrap items-center gap-6 text-xs bg-zinc-900/80 px-5 py-3 rounded-xl border border-zinc-800 font-mono w-full md:w-auto">
                <div className="flex flex-col">
                  <span className="text-zinc-500">ORB HIGH</span>
                  <span className="text-emerald-400 font-bold">{intradayData.orb.high.toFixed(2)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-500">ORB LOW</span>
                  <span className="text-rose-400 font-bold">{intradayData.orb.low.toFixed(2)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-500">RANGE</span>
                  <span className="text-violet-400 font-bold">{intradayData.orb.size.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {chartError && (
            <div className="text-sm text-rose-400 bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {chartError}
            </div>
          )}

          <div className="surface-card rounded-2xl p-5 border border-zinc-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-bold font-mono text-zinc-100">
                  {selectedTicker.replace(".NS", "")}
                </h3>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-400 font-mono">
                  15m Intraday
                </span>
                {intradayData?.levels && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
                      intradayData.levels.direction === "LONG"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {intradayData.levels.direction === "LONG" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {intradayData.levels.direction} BREAKOUT
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#38bdf8] inline-block rounded" />
                  <span className="text-zinc-400">VWAP</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#c084fc] inline-block rounded" />
                  <span className="text-zinc-400">EMA9</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#22c55e] inline-block rounded border border-dashed border-emerald-400" />
                  <span className="text-zinc-400">OR High</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#ef4444] inline-block rounded border border-dashed border-rose-400" />
                  <span className="text-zinc-400">OR Low</span>
                </span>
              </div>
            </div>

            <IntradayLightweightChart
              data={intradayData?.history || []}
              orbHigh={intradayData?.orb?.high}
              orbLow={intradayData?.orb?.low}
              loading={chartLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IntradayLightweightChart({
  data,
  orbHigh,
  orbLow,
  loading,
}: {
  data: IntradayCandle[];
  orbHigh?: number;
  orbLow?: number;
  loading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46", timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const formattedCandles = data.map((d) => {
      const timestamp = Math.floor(new Date(d.time).getTime() / 1000);
      return {
        time: (isNaN(timestamp) ? 0 : timestamp) as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      };
    }).filter((c) => (c.time as number) > 0 && c.open != null && c.high != null && c.low != null && c.close != null);

    formattedCandles.sort((a, b) => (a.time as number) - (b.time as number));
    candleSeries.setData(formattedCandles);

    // VWAP Line
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: false,
    });
    const vwapData = data.map((d) => {
      const timestamp = Math.floor(new Date(d.time).getTime() / 1000);
      return { time: timestamp as UTCTimestamp, value: d.vwap };
    }).filter((c) => !isNaN(c.time as number) && (c.time as number) > 0 && c.value > 0);
    vwapData.sort((a, b) => (a.time as number) - (b.time as number));
    vwapSeries.setData(vwapData);

    // EMA9 Line
    const emaSeries = chart.addSeries(LineSeries, {
      color: "#c084fc",
      lineWidth: 2,
      priceLineVisible: false,
    });
    const emaData = data.map((d) => {
      const timestamp = Math.floor(new Date(d.time).getTime() / 1000);
      return { time: timestamp as UTCTimestamp, value: d.ema9 };
    }).filter((c) => !isNaN(c.time as number) && (c.time as number) > 0 && c.value > 0);
    emaData.sort((a, b) => (a.time as number) - (b.time as number));
    emaSeries.setData(emaData);

    // ORB High / Low horizontal price lines
    if (orbHigh && formattedCandles.length > 0) {
      candleSeries.createPriceLine({
        price: orbHigh,
        color: "#22c55e",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "ORB High",
      });
    }

    if (orbLow && formattedCandles.length > 0) {
      candleSeries.createPriceLine({
        price: orbLow,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "ORB Low",
      });
    }

    // Volume histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#6366f120",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      data.map((d) => {
        const timestamp = Math.floor(new Date(d.time).getTime() / 1000);
        return {
          time: timestamp as UTCTimestamp,
          value: d.volume ?? 0,
          color: d.close >= d.open ? "#22c55e30" : "#ef444430",
        };
      }).filter((c) => !isNaN(c.time as number) && (c.time as number) > 0)
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, orbHigh, orbLow]);

  if (loading) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-zinc-900/40 rounded-2xl border border-zinc-800">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-zinc-500 text-sm">
        No intraday chart data available. Enter a symbol to load.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full overflow-hidden" />;
}
