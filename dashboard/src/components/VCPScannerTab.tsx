"use client";

import { useState } from "react";
import { NSE500 } from "@/data/nse500";
import { Loader2, Zap, BarChart2, Activity, CheckCircle2 } from "lucide-react";

type VCPMatch = {
  symbol: string;
  price: number;
  rs_score: number;
  template_score: string;
  is_tight: boolean;
  range_5d: number;
  met_past_week: boolean;
  high_52w_dist: number;
};

export function VCPScannerTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<VCPMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [universe, setUniverse] = useState<"nifty500" | "commodities">("nifty500");
  const [topN, setTopN] = useState(50);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);

    try {
      const symbols = universe === "nifty500"
        ? NSE500.filter(s => s.sector !== "Index" && s.sector !== "Commodity").map(s => s.symbol)
        : NSE500.filter(s => s.sector === "Commodity").map(s => s.symbol);

      const res = await fetch("/api/vcp-scanner", {
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
    <div className="glass-card rounded-2xl p-6 border border-zinc-800/50 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            VCP & Relative Strength Scanner
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Minervini Style Volatility Contraction Pattern (VCP) and Relative Strength (RS) scoring for NSE 500.
          </p>
        </div>
        
        <button
          onClick={handleScan}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Markets...</>
          ) : (
            <><Activity className="w-4 h-4" /> Run VCP Scan</>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/40">
        <div className="space-y-1.5 flex-1 min-w-[150px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Universe</label>
          <select 
            value={universe} 
            onChange={e => setUniverse(e.target.value as "nifty500" | "commodities")}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-amber-500 outline-none"
          >
            <option value="nifty500">Nifty 500 Stocks</option>
            <option value="commodities">Commodities</option>
          </select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-[150px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Top N Results</label>
          <input 
            type="number" 
            value={topN} 
            onChange={e => setTopN(parseInt(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-amber-500 outline-none"
          />
        </div>
        <div className="flex-2 flex items-center gap-4 self-end h-10">
           <div className="flex items-center gap-2 text-xs text-zinc-400">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Trend Template
           </div>
           <div className="flex items-center gap-2 text-xs text-zinc-400">
             <div className="w-2 h-2 rounded-full bg-amber-500"></div> Tightness Check
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
            {matches.length} candidates identified
          </h3>
          
          {matches.length === 0 ? (
            <div className="text-center py-8 text-sm text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/40">
              No stocks currently meet the strict VCP criteria.
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
                  className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 hover:border-amber-500/30 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors">
                        {match.symbol.replace(".NS", "")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${match.met_past_week ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>
                          {match.met_past_week ? "Matches Week" : "Current Match"}
                        </span>
                        {match.is_tight && (
                          <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            Tightness
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xs text-zinc-500 mb-0.5">RS Score</div>
                       <div className={`text-sm font-bold ${match.rs_score > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                         {match.rs_score}
                       </div>
                    </div>
                  </div>
                  
                  <div className="text-2xl font-bold text-zinc-100 my-2">
                    {match.symbol.includes("=F") ? "$" : "₹"}{match.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] mt-4 pt-3 border-t border-zinc-800/40">
                    <div className="flex flex-col">
                      <span className="text-zinc-500">Trend Template</span>
                      <span className="text-zinc-200 font-medium">{match.template_score} Criteria</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-zinc-500">Range (5D)</span>
                      <span className="text-zinc-200 font-medium">{match.range_5d}%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500">From 52W High</span>
                      <span className="text-zinc-200 font-medium">-{match.high_52w_dist}%</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-zinc-500">Status</span>
                      <span className="text-emerald-400 font-medium flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
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
