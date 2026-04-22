"use client";

import { useState } from "react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";
import { Loader2, TrendingUp, BarChart2, Activity } from "lucide-react";

type Match = {
  symbol: string;
  price: number;
  change_percent: number;
  volume_surge: number;
  prev_rsi: number;
  burst_date: string;
  days_ago: number;
};

export function MomentumBurstTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [universe, setUniverse] = useState<"nifty50" | "nifty500" | "sectoral">("nifty50");
  const [minGain, setMinGain] = useState(3.5);
  const [rsiMin, setRsiMin] = useState(45);
  const [rsiMax, setRsiMax] = useState(70);
  const [volSurge, setVolSurge] = useState(1.5);
  const [topN, setTopN] = useState(50);
  
  const [checkConsolidation, setCheckConsolidation] = useState(true);
  const [checkSma50, setCheckSma50] = useState(false);
  const [checkMacd, setCheckMacd] = useState(false);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);

    try {
      const symbols = universe === "nifty50" 
        ? NIFTY50_SYMBOLS
        : universe === "nifty500"
        ? NSE500.filter(s => s.sector !== "Index").map(s => s.symbol)
        : NSE500.filter(s => s.sector === "Index").map(s => s.symbol);

      const res = await fetch("/api/momentum-burst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          min_gain: minGain,
          check_consolidation: checkConsolidation,
          rsi_min: rsiMin,
          rsi_max: rsiMax,
          vol_surge: volSurge,
          check_sma50: checkSma50,
          check_macd: checkMacd,
          top_n: topN
        }),
      });

      if (!res.ok) throw new Error("Scan failed to execute");
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "An error occurred");
      } else {
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-zinc-800/50 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Momentum Burst Scanner
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Identifies stocks breaking out of consolidation with high volume and strong momentum.
          </p>
        </div>
        
        <button
          onClick={handleScan}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Market...</>
          ) : (
            <><Activity className="w-4 h-4" /> Run Scan</>
          )}
        </button>
      </div>

      <div className="space-y-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/40">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Universe</label>
            <select 
              value={universe} 
              onChange={e => setUniverse(e.target.value as "nifty50" | "nifty500")}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            >
              <option value="nifty50">Nifty 50</option>
              <option value="nifty500">Nifty 500</option>
              <option value="sectoral">Sectoral Indices</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Min Gain %</label>
            <input 
              type="number" 
              step="0.1" 
              value={minGain} 
              onChange={e => setMinGain(parseFloat(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Vol Surge (x)</label>
            <input 
              type="number" 
              step="0.1" 
              value={volSurge} 
              onChange={e => setVolSurge(parseFloat(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Min RSI</label>
            <input 
              type="number" 
              value={rsiMin} 
              onChange={e => setRsiMin(parseInt(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Max RSI</label>
            <input 
              type="number" 
              value={rsiMax} 
              onChange={e => setRsiMax(parseInt(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium">Top N Results</label>
            <input 
              type="number" 
              value={topN} 
              onChange={e => setTopN(parseInt(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-zinc-800/50">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={checkConsolidation} 
              onChange={e => setCheckConsolidation(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-violet-500 focus:ring-violet-500"
            />
            Consolidation Filter (15% Range)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={checkSma50} 
              onChange={e => setCheckSma50(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-violet-500 focus:ring-violet-500"
            />
            Above 50-Day SMA
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={checkMacd} 
              onChange={e => setCheckMacd(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-violet-500 focus:ring-violet-500"
            />
            MACD Bullish
          </label>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {matches !== null && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> 
            {matches.length} matches found
          </h3>
          
          {matches.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/40">
              No stocks matched the current criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map((match) => (
                <div 
                  key={match.symbol} 
                  onClick={() => {
                    if (onSelect) {
                      onSelect(match.symbol);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 hover:border-violet-500/30 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-zinc-100">{match.symbol.replace(".NS", "")}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 w-fit">
                        {match.days_ago === 0 ? "Today" : `${match.days_ago}d Ago`}
                      </span>
                    </div>
                    <span className="text-emerald-400 font-medium">+{match.change_percent}%</span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 mb-4">
                    ₹{match.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="flex justify-between text-xs">
                    <div className="flex flex-col gap-1">
                      <span className="text-zinc-500">Volume Surge</span>
                      <span className="text-zinc-300 font-medium">{match.volume_surge}x</span>
                    </div>
                    <div className="flex flex-col gap-1 text-right">
                      <span className="text-zinc-500">Prior RSI</span>
                      <span className="text-zinc-300 font-medium">{match.prev_rsi}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
