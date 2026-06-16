"use client";

import { useState } from "react";
import { NSE500 } from "@/data/nse500";
import { Loader2, Flame, BarChart2, Zap, CheckCircle2, TrendingUp } from "lucide-react";

type EPMatch = {
  symbol: string;
  price: number;
  gap_pct: number;
  rvol: number;
  is_stage2: boolean;
  dist_52w: number;
  score: number;
  burst_date: string;
  days_ago: number;
};

export function EPScannerTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<EPMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [universe, setUniverse] = useState<"nifty500" | "large" | "mid" | "small" | "micro" | "all">("nifty500");
  const [topN, setTopN] = useState(50);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);

    try {
      let filteredStocks = NSE500.filter(s => s.sector !== "Index" && s.sector !== "Commodity");
      if (universe === "nifty500") {
        filteredStocks = filteredStocks.filter(s => (s as any).cap !== "micro");
      } else if (universe === "large" || universe === "mid" || universe === "small" || universe === "micro") {
        filteredStocks = filteredStocks.filter(s => (s as any).cap === universe);
      }
      const symbols = filteredStocks.map(s => s.symbol);

      const res = await fetch("/api/ep-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          top_n: topN
        }),
      });

      if (!res.ok) throw new Error("EP Scan failed to execute");
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface-card rounded-2xl p-6 border border-zinc-800/50 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Episodic Pivot (EP) Scanner
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Identifying high-probability momentum bursts based on Gap-ups / Surges (≥3.5%), high relative volume (≥1.2x - 1.7x), and Stage 2 uptrends.
          </p>
        </div>
        
        <button
          onClick={handleScan}
          disabled={loading}
          className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Gaps...</>
          ) : (
            <><Zap className="w-4 h-4" /> Run EP Scan</>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/40">
        <div className="space-y-1.5 flex-1 min-w-[150px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Universe</label>
          <select 
            value={universe} 
            onChange={e => setUniverse(e.target.value as any)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-orange-500 outline-none font-medium"
          >
            <option value="nifty500">Nifty 500 Universe</option>
            <option value="large">Large Cap Stocks</option>
            <option value="mid">Mid Cap Stocks</option>
            <option value="small">Small Cap Stocks</option>
            <option value="micro">Micro Cap Stocks</option>
            <option value="all">All Watchlist Stocks</option>
          </select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-[150px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Top N Results</label>
          <input 
            type="number" 
            value={topN} 
            onChange={e => setTopN(parseInt(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-orange-500 outline-none"
          />
        </div>
        <div className="flex-2 flex items-center gap-4 self-end h-10">
           <div className="flex items-center gap-2 text-xs text-zinc-400">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Stage 2 Trend
           </div>
           <div className="flex items-center gap-2 text-xs text-zinc-400">
             <div className="w-2 h-2 rounded-full bg-orange-500"></div> RVOL Surge
           </div>
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
            {matches.length} EP candidates identified
          </h3>
          
          {matches.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/40">
              No episodic pivots detected in the last 3 trading days.
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
                  className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 hover:border-orange-500/30 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-zinc-100 group-hover:text-orange-400 transition-colors">
                        {match.symbol.replace(".NS", "")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${match.days_ago === 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                          {match.days_ago === 0 ? "Today" : `${match.days_ago}d ago`}
                        </span>
                        {match.is_stage2 && (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                            Stage 2
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xs text-zinc-500 mb-0.5">EP Score</div>
                       <div className={`text-sm font-bold ${match.score >= 70 ? "text-orange-400" : "text-zinc-400"}`}>
                         {match.score}
                       </div>
                    </div>
                  </div>
                  
                  <div className="text-2xl font-bold text-zinc-100 my-2">
                    ₹{match.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] mt-4 pt-3 border-t border-zinc-800/40">
                    <div className="flex flex-col">
                      <span className="text-zinc-500">Gap Percent</span>
                      <span className="text-emerald-400 font-bold">+{match.gap_pct}%</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-zinc-500">Rel Volume</span>
                      <span className="text-orange-400 font-bold">{match.rvol}x</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500">52W High Dist</span>
                      <span className="text-zinc-200 font-medium">-{match.dist_52w}%</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-zinc-500">Burst Date</span>
                      <span className="text-zinc-300 font-medium">{match.burst_date}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-1 h-3 rounded-full ${i < Math.floor(match.score / 20) ? "bg-orange-500" : "bg-zinc-800"}`}
                        ></div>
                      ))}
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Momentum Build
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
