"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Search, 
  AlertCircle, 
  Calendar,
  TrendingUp
} from "lucide-react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";

interface Match {
  symbol: string;
  price: number;
  crossover_price: number;
  wma_value: number;
  rsi_value?: number;
  burst_date: string;
  days_ago: number;
}

export function WMACrossoverTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [universe, setUniverse] = useState<"nifty50" | "nifty500" | "large" | "mid" | "small" | "micro" | "sectoral">("nifty50");
  const [topN, setTopN] = useState(50);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);

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

      const res = await fetch("/api/wma44-crossover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          top_n: topN
        }),
      });

      if (!res.ok) throw new Error("Scan failed to execute");
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
                onChange={e => setTopN(parseInt(e.target.value))}
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
            <><Search className="w-4 h-4" /> Run WMA + RSI Scan</>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5" />
              {error}
            </motion.div>
          )}

          {matches && matches.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-zinc-500"
            >
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm lowercase tracking-tighter">No WMA 44 + RSI &gt; 50 crossovers detected in selected universe</p>
            </motion.div>
          )}

          {matches && matches.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {matches.map((match) => (
                <div 
                  key={match.symbol}
                  onClick={() => {
                    onSelect?.(match.symbol);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group relative bg-zinc-900/40 hover:bg-zinc-800/60 border border-zinc-800/50 hover:border-violet-500/50 p-4 rounded-2xl transition-all cursor-pointer overflow-hidden"
                >
                  {/* Badge */}
                  <div className="absolute top-0 right-0 p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight ${
                      match.days_ago === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                    }`}>
                      {match.days_ago === 0 ? "TODAY" : `${match.days_ago}D AGO`}
                    </span>
                  </div>

                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-100 group-hover:text-violet-400 transition-colors">
                        {match.symbol.replace(".NS", "")}
                      </h3>
                      <p className="text-xs text-zinc-500 font-medium truncate max-w-[120px]">
                        {NSE500.find(s => s.symbol === match.symbol)?.name}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <span className="text-xs text-zinc-500 lowercase tracking-tighter">Price</span>
                      <span className="text-sm font-mono font-bold text-zinc-100">
                        ₹{match.price.toLocaleString()}
                      </span>
                    </div>

                    <div className="h-px bg-zinc-800/50" />

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 lowercase tracking-tighter">WMA 44</p>
                        <p className="text-xs font-mono font-bold text-pink-400">
                          {match.wma_value.toFixed(2)}
                        </p>
                      </div>
                      <div className="space-y-1 text-center">
                        <p className="text-[10px] text-zinc-500 lowercase tracking-tighter">RSI</p>
                        <p className="text-xs font-mono font-bold text-violet-400">
                          {match.rsi_value ? match.rsi_value.toFixed(1) : "—"}
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] text-zinc-500 lowercase tracking-tighter">Crossover</p>
                        <p className="text-xs font-mono font-bold text-emerald-400">
                          {match.crossover_price.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 text-[10px] text-zinc-500 lowercase tracking-tighter">
                      <Calendar className="w-3 h-3" />
                      <span>{match.burst_date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {!matches && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <TrendingUp className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-sm lowercase tracking-tighter">Select universe and click scan to find WMA 44 crossovers</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
