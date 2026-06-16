"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Search, 
  AlertCircle, 
  Calendar,
  TrendingUp,
  Info,
  Sliders,
  Award,
  Zap,
  Check,
  X,
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";

interface Match {
  symbol: string;
  sector: string;
  price: number;
  high_ny: number;
  dist_top: number;
  week52_chg?: number;
  rsi?: number;
  macd_bull: boolean;
  macd_cross: boolean;
  vol_surge: boolean;
  above_200: boolean;
  mcap_cr?: number;
  de_ratio?: number;
  roe?: number;
  score: number;
}

export function BreakoutScannerTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Settings state
  const [universe, setUniverse] = useState<"nifty50" | "nifty500" | "large" | "mid" | "small" | "micro" | "sectoral">("nifty50");
  const [breakout, setBreakout] = useState<"1y" | "3y" | "5y">("1y");
  const [tf, setTf] = useState<"daily" | "weekly" | "monthly">("daily");
  const [strict, setStrict] = useState(false);
  const [noFundamentals, setNoFundamentals] = useState(false);
  const [topN, setTopN] = useState(50);
  const [tolerancePct, setTolerancePct] = useState(3.0); // 3.0% default for rich results out of the box

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

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

      const res = await fetch("/api/breakout-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          breakout,
          tf,
          strict,
          no_fundamentals: noFundamentals,
          top_n: topN,
          tolerance_pct: tolerancePct
        }),
      });

      if (!res.ok) throw new Error("Breakout scan failed to execute");
      const data = await res.json();
      setResults(data.results || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during scanning");
    } finally {
      setLoading(false);
    }
  };

  // Group candidates into Tiers based on Score
  const tierA = results ? results.filter(r => r.score >= 100) : [];
  const tierB = results ? results.filter(r => r.score >= 75 && r.score < 100) : [];
  const tierC = results ? results.filter(r => r.score < 75) : [];
  const freshMacd = results ? results.filter(r => r.macd_cross) : [];
  const rsiSweet = results ? results.filter(r => r.rsi && r.rsi >= 60 && r.rsi <= 80) : [];

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/40 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-2">
          <Sliders className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-bold text-zinc-300 lowercase tracking-tighter">Screener Parameters</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="space-y-1.5 col-span-2 md:col-span-1">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Universe</label>
            <select 
              value={universe} 
              onChange={e => setUniverse(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none font-medium"
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
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Breakout Window</label>
            <select 
              value={breakout} 
              onChange={e => setBreakout(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none font-medium"
            >
              <option value="1y">1-Year High Breakout</option>
              <option value="3y">3-Year High Breakout</option>
              <option value="5y">5-Year High Breakout</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Timeframe</label>
            <select 
              value={tf} 
              onChange={e => setTf(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none font-medium"
            >
              <option value="daily">Daily Charts</option>
              <option value="weekly">Weekly Charts</option>
              <option value="monthly">Monthly Charts</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Tolerance %</label>
            <input 
              type="number" 
              step="0.5"
              min="0.1"
              max="50"
              value={tolerancePct} 
              onChange={e => setTolerancePct(parseFloat(e.target.value) || 3.0)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Top N Results</label>
            <input 
              type="number" 
              value={topN} 
              onChange={e => setTopN(parseInt(e.target.value) || 50)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>

          <div className="flex flex-col justify-end space-y-2 py-0.5 col-span-2 md:col-span-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={strict} 
                onChange={e => setStrict(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-violet-600 focus:ring-violet-500" 
              />
              <span className="text-xs text-zinc-400 font-medium lowercase tracking-tighter">Strict Quality Gate</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={noFundamentals} 
                onChange={e => setNoFundamentals(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-violet-600 focus:ring-violet-500" 
              />
              <span className="text-xs text-zinc-400 font-medium lowercase tracking-tighter">Bypass Fundamentals</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleScan}
            disabled={loading}
            className="w-full md:w-auto px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-900/20"
          >
            {loading ? (
              <><Activity className="w-4 h-4 animate-spin" /> Scanning Multi-Year Breakouts...</>
            ) : (
              <><Search className="w-4 h-4" /> Run Multi-Year Breakout Scan</>
            )}
          </button>
        </div>
      </div>

      {/* Results Container */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-6"
            >
              <AlertCircle className="w-5 h-5" />
              {error}
            </motion.div>
          )}

          {results && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Highlights & Tiers Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Tier A */}
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-emerald-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Award className="w-16 h-16 text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 lowercase tracking-tight mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Tier A (Score ≥ 100) · High Conviction
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono font-bold text-zinc-100">{tierA.length}</span>
                    <span className="text-xs text-zinc-500 font-medium">stocks</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate mt-2 font-medium">
                    {tierA.length > 0 ? tierA.map(t => t.symbol.replace(".NS", "")).join(", ") : "None detected"}
                  </p>
                </div>

                {/* Tier B */}
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-yellow-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Award className="w-16 h-16 text-yellow-400" />
                  </div>
                  <h4 className="text-xs font-bold text-yellow-400 flex items-center gap-1.5 lowercase tracking-tight mb-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    Tier B (Score 75–99) · Watch List
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono font-bold text-zinc-100">{tierB.length}</span>
                    <span className="text-xs text-zinc-500 font-medium">stocks</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate mt-2 font-medium">
                    {tierB.length > 0 ? tierB.map(t => t.symbol.replace(".NS", "")).join(", ") : "None detected"}
                  </p>
                </div>

                {/* Tier C */}
                <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Award className="w-16 h-16 text-zinc-600" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 lowercase tracking-tight mb-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-600" />
                    Tier C (Score &lt; 75) · On Radar
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono font-bold text-zinc-100">{tierC.length}</span>
                    <span className="text-xs text-zinc-500 font-medium">stocks</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate mt-2 font-medium">
                    {tierC.length > 0 ? tierC.map(t => t.symbol.replace(".NS", "")).join(", ") : "None detected"}
                  </p>
                </div>
              </div>

              {/* Technical Alerts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* MACD Crossovers */}
                <div className="bg-zinc-950/20 border border-zinc-850 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-violet-400 flex items-center gap-1.5 lowercase tracking-tight mb-3 border-b border-zinc-850 pb-2">
                    <Zap className="w-3.5 h-3.5" />
                    ⚡ Fresh MACD Bullish Crossovers (Act Fast)
                  </h4>
                  {freshMacd.length === 0 ? (
                    <p className="text-xs text-zinc-500 font-medium py-4 text-center">No fresh bullish MACD crossovers detected</p>
                  ) : (
                    <div className="max-h-[140px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {freshMacd.map(stock => (
                        <div 
                          key={stock.symbol}
                          onClick={() => {
                            onSelect?.(stock.symbol);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="flex items-center justify-between text-xs p-2 bg-zinc-900/30 border border-zinc-850 hover:border-violet-500/40 rounded-lg cursor-pointer transition-all"
                        >
                          <span className="font-bold text-zinc-100">{stock.symbol.replace(".NS", "")}</span>
                          <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">{stock.sector}</span>
                          <span className="font-mono font-semibold text-zinc-300">₹{stock.price}</span>
                          {stock.rsi && (
                            <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">RSI {stock.rsi.toFixed(0)}</span>
                          )}
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full text-[10px]">+{stock.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RSI Sweet Zone */}
                <div className="bg-zinc-950/20 border border-zinc-850 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-yellow-400 flex items-center gap-1.5 lowercase tracking-tight mb-3 border-b border-zinc-850 pb-2">
                      <TrendingUp className="w-3.5 h-3.5" />
                      ◈ RSI Sweet Zone (60–80) — Momentum Without Extremes
                    </h4>
                    {rsiSweet.length === 0 ? (
                      <p className="text-xs text-zinc-500 font-medium py-4 text-center">No stocks in the RSI momentum sweet zone</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-2 custom-scrollbar">
                        {rsiSweet.map(stock => (
                          <span 
                            key={stock.symbol}
                            onClick={() => {
                              onSelect?.(stock.symbol);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-[10px] font-bold bg-zinc-900 border border-zinc-800 hover:border-yellow-500/40 px-2.5 py-1 rounded-md text-zinc-300 hover:text-yellow-400 cursor-pointer transition-all"
                          >
                            {stock.symbol.replace(".NS", "")} ({stock.rsi?.toFixed(0)})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-3 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    <span>Scored candidates are sorted by technical + fundamental strength</span>
                  </div>
                </div>
              </div>

              {/* Full Candidates Grid */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-950/40 border-b border-zinc-850 text-[10px] text-zinc-500 font-bold lowercase tracking-tighter">
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Close</th>
                        <th className="py-3 px-4">NY High</th>
                        <th className="py-3 px-4">Dist Top %</th>
                        <th className="py-3 px-4">52W Chg</th>
                        <th className="py-3 px-4">RSI</th>
                        <th className="py-3 px-4 text-center">MACD ↑</th>
                        <th className="py-3 px-4 text-center">MACD Cross</th>
                        <th className="py-3 px-4 text-center">Vol Surge</th>
                        <th className="py-3 px-4 text-center">200 SMA</th>
                        <th className="py-3 px-4">MCap (Cr)</th>
                        <th className="py-3 px-4">D/E</th>
                        <th className="py-3 px-4">ROE %</th>
                        <th className="py-3 px-4 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60 text-xs">
                      {results.map((row) => (
                        <tr 
                          key={row.symbol}
                          onClick={() => {
                            onSelect?.(row.symbol);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="hover:bg-zinc-900/40 cursor-pointer transition-colors group"
                        >
                          {/* Symbol */}
                          <td className="py-3 px-4 font-bold text-zinc-100 group-hover:text-violet-400 transition-colors">
                            {row.symbol.replace(".NS", "")}
                            <span className="block text-[9px] text-zinc-500 font-medium truncate max-w-[80px] mt-0.5">{row.sector}</span>
                          </td>
                          {/* Close */}
                          <td className="py-3 px-4 font-mono font-medium text-zinc-200">₹{row.price.toLocaleString("en-IN")}</td>
                          {/* NY High */}
                          <td className="py-3 px-4 font-mono text-zinc-400">₹{row.high_ny.toLocaleString("en-IN")}</td>
                          {/* Dist Top % */}
                          <td className={`py-3 px-4 font-mono font-semibold ${row.dist_top >= 0 ? "text-emerald-400" : "text-yellow-400"}`}>
                            {row.dist_top.toFixed(2)}%
                          </td>
                          {/* 52W Chg */}
                          <td className="py-3 px-4 font-mono text-zinc-400">
                            {row.week52_chg ? `${row.week52_chg >= 0 ? "+" : ""}${row.week52_chg.toFixed(0)}%` : "—"}
                          </td>
                          {/* RSI */}
                          <td className={`py-3 px-4 font-mono font-bold ${
                            row.rsi && row.rsi >= 60 && row.rsi <= 80 ? "text-yellow-400" : "text-zinc-400"
                          }`}>
                            {row.rsi ? row.rsi.toFixed(1) : "—"}
                          </td>
                          {/* MACD bull */}
                          <td className="py-3 px-4 text-center">
                            {row.macd_bull ? (
                              <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-zinc-700 mx-auto" />
                            )}
                          </td>
                          {/* MACD cross */}
                          <td className="py-3 px-4 text-center">
                            {row.macd_cross ? (
                              <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded font-bold text-[9px]">CROSS</span>
                            ) : (
                              <X className="w-4 h-4 text-zinc-700 mx-auto" />
                            )}
                          </td>
                          {/* Vol surge */}
                          <td className="py-3 px-4 text-center">
                            {row.vol_surge ? (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold text-[9px]">SURGE</span>
                            ) : (
                              <X className="w-4 h-4 text-zinc-700 mx-auto" />
                            )}
                          </td>
                          {/* 200 SMA */}
                          <td className="py-3 px-4 text-center">
                            {row.above_200 ? (
                              <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-zinc-700 mx-auto" />
                            )}
                          </td>
                          {/* MCap */}
                          <td className="py-3 px-4 font-mono text-zinc-400">{row.mcap_cr ? `₹${row.mcap_cr.toLocaleString("en-IN")}Cr` : "—"}</td>
                          {/* D/E */}
                          <td className="py-3 px-4 font-mono text-zinc-400">{row.de_ratio !== null ? row.de_ratio.toFixed(2) : "—"}</td>
                          {/* ROE */}
                          <td className="py-3 px-4 font-mono text-zinc-400">{row.roe !== null ? `${row.roe.toFixed(1)}%` : "—"}</td>
                          {/* Score */}
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded-full font-bold font-mono text-[10px] ${
                              row.score >= 100 
                                ? "bg-emerald-500/15 text-emerald-400" 
                                : row.score >= 75 
                                  ? "bg-yellow-500/15 text-yellow-400" 
                                  : "bg-zinc-800 text-zinc-400"
                            }`}>
                              {row.score}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {!results && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 bg-zinc-950/10 border border-zinc-900/50 rounded-2xl">
              <Zap className="w-12 h-12 mb-4 opacity-10 text-violet-500" />
              <p className="text-sm font-medium lowercase tracking-tighter">Adjust filters and run scan to find breakout setup stocks</p>
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-zinc-600 bg-zinc-900/30 px-3 py-1 rounded-full font-medium">
                <Info className="w-3.5 h-3.5" />
                <span>Runs multi-year breakout parameters: High NY bounds, MACD bullish crossovers, and RSI momentum metrics</span>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
