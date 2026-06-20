"use client";

import { useState, useMemo } from "react";
import { NSE500 } from "@/data/nse500";
import { 
  Activity, 
  Info, 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  SlidersHorizontal,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink
} from "lucide-react";

type FOMatch = {
  symbol: string;
  name: string;
  direction: "BULLISH" | "BEARISH";
  pct_change: number;
  first_15m_vol: number;
  prev_max_vol: number;
  volume_ratio: number;
  first_open: number;
  first_close: number;
  timestamp: string;
};

type SortField = "symbol" | "pct_change" | "volume_ratio" | "first_15m_vol" | "timestamp";
type SortOrder = "asc" | "desc";

export function FOMomentumScannerTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<FOMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter settings
  const [pctThreshold, setPctThreshold] = useState(2.0);
  const [minVolume, setMinVolume] = useState(100000);
  const [topN, setTopN] = useState(50);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("volume_ratio");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setMatches(null);

    try {
      const res = await fetch("/api/fo-momentum-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pct_change_threshold: pctThreshold,
          min_volume_threshold: minVolume,
          top_n: topN,
        }),
      });

      if (!res.ok) throw new Error("F&O scan failed to execute");
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during scanning");
    } finally {
      setLoading(false);
    }
  };

  // Sort helper
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Sorted matches
  const sortedMatches = useMemo(() => {
    if (!matches) return [];
    
    return [...matches].sort((a, b) => {
      let comparison = 0;
      if (sortField === "symbol") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "timestamp") {
        comparison = a.timestamp.localeCompare(b.timestamp);
      } else {
        comparison = a[sortField] - b[sortField];
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [matches, sortField, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Header and Info */}
      <div className="surface-card rounded-2xl p-6 border border-zinc-800/50 bg-zinc-900/10 backdrop-blur-md">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-400 animate-pulse" />
              Intraday F&O Momentum Scanner
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Finds F&O stocks with high relative volume and immediate direction in the first 15 minutes of the session.
            </p>
          </div>
          
          <button
            onClick={handleScan}
            disabled={loading}
            className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0 shadow-lg shadow-violet-600/10"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Scanning F&O Tickers...</>
            ) : (
              <><Activity className="w-4 h-4" /> Run Intraday Scan</>
            )}
          </button>
        </div>

        {/* Tip Box */}
        <div className="mt-4 p-4 rounded-xl border border-violet-500/10 bg-violet-500/5 flex items-start gap-3">
          <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-400 space-y-1">
            <span className="font-semibold text-zinc-300">Intraday Guide:</span> 
            <p>Run this scan after 9:45 AM IST once the first 15m candle closes. Higher Volume Ratio signifies strong institutional presence. Outside market hours or on weekends, this tool automatically scans the last active trading session.</p>
          </div>
        </div>
      </div>

      {/* Screener Parameters Control Grid */}
      <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/40 space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-2">
          <SlidersHorizontal className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs font-bold text-zinc-300 lowercase tracking-tighter">Screener Parameters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Min % Change Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-medium">Min Candle % Change</span>
              <span className="font-mono font-semibold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                {pctThreshold.toFixed(1)}%
              </span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={pctThreshold} 
              onChange={e => setPctThreshold(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
            />
          </div>

          {/* Min Volume Input */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Min Volume Threshold</label>
            <select 
              value={minVolume} 
              onChange={e => setMinVolume(parseInt(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none font-medium"
            >
              <option value={50000}>50,000</option>
              <option value={100000}>100,000</option>
              <option value={250000}>250,000</option>
              <option value={500000}>500,000</option>
              <option value={1000000}>1,000,000</option>
            </select>
          </div>

          {/* Top N Results */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 font-medium lowercase tracking-tighter">Top N Matches</label>
            <input 
              type="number" 
              value={topN} 
              onChange={e => setTopN(parseInt(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {/* Scan Results Table */}
      {matches !== null && (
        <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-zinc-850 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {matches.length} F&O Momentum Matches
            </h3>
            <span className="text-[10px] text-zinc-500 font-medium">Click headers to sort table</span>
          </div>

          {matches.length === 0 ? (
            <div className="text-center py-12 text-sm text-zinc-500 bg-zinc-900/30">
              No F&O stocks met the volume ratio and price change criteria.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950/40 border-b border-zinc-850 text-[10px] text-zinc-500 font-bold lowercase tracking-tighter">
                    <th 
                      onClick={() => handleSort("symbol")}
                      className="py-3 px-4 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        Symbol <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Signal</th>
                    <th 
                      onClick={() => handleSort("pct_change")}
                      className="py-3 px-4 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        Candle Chg % <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("volume_ratio")}
                      className="py-3 px-4 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        Volume Ratio <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort("first_15m_vol")}
                      className="py-3 px-4 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        15m Vol / Prev Max <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Range (Open / Close)</th>
                    <th 
                      onClick={() => handleSort("timestamp")}
                      className="py-3 px-4 cursor-pointer hover:text-zinc-300 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        Trigger Time <ArrowUpDown className="w-3 h-3 text-zinc-600" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/60 text-xs">
                  {sortedMatches.map((row) => {
                    const isBullish = row.direction === "BULLISH";
                    const isHighRatio = row.volume_ratio >= 2.0;

                    // Match sector from local client dataset
                    const stockInfo = NSE500.find(s => s.symbol === row.symbol || s.symbol.replace(".NS", "") === row.name);
                    const sector = stockInfo?.sector || "F&O Active";

                    return (
                      <tr 
                        key={row.symbol}
                        onClick={() => {
                          onSelect?.(row.symbol);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="hover:bg-zinc-900/40 cursor-pointer transition-colors group"
                      >
                        {/* Symbol */}
                        <td className="py-3.5 px-4 font-bold text-zinc-100 group-hover:text-violet-400 transition-colors">
                          <div className="flex items-center gap-1.5">
                            {row.name}
                            <ExternalLink className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="block text-[9px] text-zinc-500 font-medium truncate max-w-[120px] mt-0.5">
                            {sector}
                          </span>
                        </td>

                        {/* Signal Badge */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border inline-flex items-center gap-1 ${
                            isBullish 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" 
                              : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                          }`}>
                            {isBullish ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {row.direction}
                          </span>
                        </td>

                        {/* Candle % Change */}
                        <td className={`py-3.5 px-4 font-mono font-bold ${
                          isBullish ? "text-emerald-400" : "text-rose-400"
                        }`}>
                          {isBullish ? "+" : ""}{row.pct_change.toFixed(2)}%
                        </td>

                        {/* Volume Ratio */}
                        <td className="py-3.5 px-4 font-mono font-bold">
                          <span className={`px-1.5 py-0.5 rounded ${
                            isHighRatio 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-zinc-800 text-zinc-300"
                          }`}>
                            {row.volume_ratio.toFixed(2)}x
                          </span>
                        </td>

                        {/* Volumes */}
                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          <div>{row.first_15m_vol.toLocaleString("en-IN")}</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">
                            vs {row.prev_max_vol.toLocaleString("en-IN")} max
                          </div>
                        </td>

                        {/* Open / Close */}
                        <td className="py-3.5 px-4 font-mono text-zinc-400">
                          ₹{row.first_open.toFixed(2)} / <span className="text-zinc-200">₹{row.first_close.toFixed(2)}</span>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4 font-mono text-zinc-400">
                          {row.timestamp}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
