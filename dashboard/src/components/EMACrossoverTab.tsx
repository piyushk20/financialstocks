"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Search, 
  AlertCircle, 
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Info
} from "lucide-react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";

interface Match {
  symbol: string;
  price: number;
  crossover_price: number;
  ema10_val: number;
  ema20_val: number;
  cross_date: string;
  days_ago: number;
}

interface ScanResults {
  bullish: Match[];
  bearish: Match[];
}

export function EMACrossoverTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [universe, setUniverse] = useState<"nifty50" | "nifty500" | "large" | "mid" | "small" | "micro" | "sectoral">("nifty50");
  const [topN, setTopN] = useState(50);

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

      const res = await fetch("/api/ema-crossover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          top_n: topN
        }),
      });

      if (!res.ok) throw new Error("Crossover scan failed to execute");
      const data = await res.json();
      setResults({
        bullish: data.bullish || [],
        bearish: data.bearish || []
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during scanning");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row items-end gap-4">
        <div className="flex-1 w-full space-y-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/40">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
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
              <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Top N Results</label>
              <input 
                type="number" 
                value={topN} 
                onChange={e => setTopN(parseInt(e.target.value) || 50)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={loading}
          className="w-full md:w-auto px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-900/20"
        >
          {loading ? (
            <><Activity className="w-4 h-4 animate-spin" /> Scanning...</>
          ) : (
            <><Search className="w-4 h-4" /> Run EMA 10/20 Crossover Scan</>
          )}
        </button>
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
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              {/* Bullish Crossovers (EMA 10 crosses above EMA 20) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-3">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Bullish Crossovers</h2>
                    <p className="text-xs text-zinc-500 font-medium">EMA 10 crossed above EMA 20 (Bullish Momentum)</p>
                  </div>
                  <span className="ml-auto bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {results.bullish.length} matches
                  </span>
                </div>

                {results.bullish.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 bg-zinc-950/20 border border-zinc-900 rounded-2xl text-zinc-500">
                    <TrendingUp className="w-10 h-10 mb-3 opacity-20 text-emerald-400" />
                    <p className="text-xs lowercase tracking-tighter font-medium">No bullish EMA crossovers detected</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.bullish.map((match) => (
                      <CrossoverCard key={match.symbol} match={match} type="bullish" onSelect={onSelect} />
                    ))}
                  </div>
                )}
              </div>

              {/* Bearish Crossovers (EMA 10 crosses below EMA 20) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-red-500/20 pb-3">
                  <div className="p-1.5 bg-red-500/10 rounded-lg text-red-400">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Bearish Crossovers</h2>
                    <p className="text-xs text-zinc-500 font-medium">EMA 10 crossed below EMA 20 (Bearish Momentum)</p>
                  </div>
                  <span className="ml-auto bg-red-500/10 text-red-400 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {results.bearish.length} matches
                  </span>
                </div>

                {results.bearish.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 bg-zinc-950/20 border border-zinc-900 rounded-2xl text-zinc-500">
                    <TrendingDown className="w-10 h-10 mb-3 opacity-20 text-red-400" />
                    <p className="text-xs lowercase tracking-tighter font-medium">No bearish EMA crossovers detected</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.bearish.map((match) => (
                      <CrossoverCard key={match.symbol} match={match} type="bearish" onSelect={onSelect} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {!results && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 bg-zinc-950/10 border border-zinc-900/50 rounded-2xl">
              <TrendingUp className="w-12 h-12 mb-4 opacity-10 text-violet-500" />
              <p className="text-sm font-medium lowercase tracking-tighter">Select universe and click scan to find EMA 10/20 crossover stocks</p>
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-zinc-600 bg-zinc-900/30 px-3 py-1 rounded-full font-medium">
                <Info className="w-3.5 h-3.5" />
                <span>Checks daily chart exponential moving averages (EMA) for recent crossovers</span>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CrossoverCard({ 
  match, 
  type, 
  onSelect 
}: { 
  match: Match; 
  type: "bullish" | "bearish"; 
  onSelect?: (symbol: string) => void 
}) {
  const cap = NSE500.find(s => s.symbol === match.symbol)?.cap || "—";
  const sector = NSE500.find(s => s.symbol === match.symbol)?.sector || "—";

  return (
    <div 
      onClick={() => {
        onSelect?.(match.symbol);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className={`group relative bg-zinc-900/40 hover:bg-zinc-800/60 border ${
        type === "bullish" 
          ? "border-zinc-800/60 hover:border-emerald-500/40" 
          : "border-zinc-800/60 hover:border-red-500/40"
      } p-4 rounded-xl transition-all cursor-pointer overflow-hidden flex flex-col justify-between h-[175px] shadow-sm`}
    >
      {/* Badge / Timeline */}
      <div className="absolute top-3 right-3">
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-tight ${
          match.days_ago === 0 
            ? type === "bullish" 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "bg-red-500/20 text-red-400" 
            : "bg-zinc-800 text-zinc-400"
        }`}>
          {match.days_ago === 0 ? "TODAY" : `${match.days_ago}D AGO`}
        </span>
      </div>

      <div>
        {/* Header */}
        <div className="mb-2">
          <h3 className={`text-base font-bold text-zinc-100 transition-colors flex items-center gap-1.5 ${
            type === "bullish" ? "group-hover:text-emerald-400" : "group-hover:text-red-400"
          }`}>
            {match.symbol.replace(".NS", "")}
            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-4px] group-hover:translate-x-0" />
          </h3>
          <p className="text-[10px] text-zinc-500 font-medium truncate max-w-[150px]">
            {NSE500.find(s => s.symbol === match.symbol)?.name || match.symbol}
          </p>
        </div>

        {/* Sector and Cap Tags */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="px-1.5 py-0.5 bg-zinc-800/40 text-zinc-400 rounded text-[9px] font-bold lowercase tracking-tight">
            {cap}
          </span>
          <span className="px-1.5 py-0.5 bg-zinc-800/40 text-zinc-400 rounded text-[9px] font-medium lowercase tracking-tight max-w-[80px] truncate">
            {sector}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {/* Price Row */}
        <div className="flex items-end justify-between">
          <span className="text-[10px] text-zinc-500 lowercase tracking-tighter">Current Price</span>
          <span className="text-xs font-mono font-bold text-zinc-100">
            ₹{match.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="h-[1px] bg-zinc-850" />

        {/* EMA Row */}
        <div className="grid grid-cols-3 gap-1">
          <div className="space-y-0.5">
            <p className="text-[9px] text-zinc-500 lowercase tracking-tighter">EMA 10</p>
            <p className={`text-xs font-mono font-bold ${type === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
              {match.ema10_val.toFixed(2)}
            </p>
          </div>
          <div className="space-y-0.5 text-center">
            <p className="text-[9px] text-zinc-500 lowercase tracking-tighter">EMA 20</p>
            <p className="text-xs font-mono font-bold text-zinc-300">
              {match.ema20_val.toFixed(2)}
            </p>
          </div>
          <div className="space-y-0.5 text-right">
            <p className="text-[9px] text-zinc-500 lowercase tracking-tighter">Cross Price</p>
            <p className="text-xs font-mono font-bold text-zinc-100">
              {match.crossover_price.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 lowercase tracking-tighter pt-0.5 border-t border-zinc-900/50">
          <Calendar className="w-2.5 h-2.5 text-zinc-600" />
          <span>Crossed on {match.cross_date}</span>
        </div>
      </div>
    </div>
  );
}
