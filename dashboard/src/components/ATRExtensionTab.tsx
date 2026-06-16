"use client";

import { useEffect, useState } from "react";
import { NSE500 } from "@/data/nse500";
import { NIFTY50_SYMBOLS } from "@/data/nifty50";
import {
  Loader2,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  AlertCircle,
  HelpCircle,
  BarChart2,
  ChevronsUpDown,
} from "lucide-react";

type ATRExtensionMatch = {
  symbol: string;
  name: string;
  price: number;
  atr: number;
  ema10: number;
  ema21: number;
  sma50: number;
  sma200: number;
  ext_ema10: number;
  ext_ema21: number;
  ext_sma50: number;
  ext_sma200: number;
};

type SortField =
  | "symbol"
  | "price"
  | "atr"
  | "ext_ema10"
  | "ext_ema21"
  | "ext_sma50"
  | "ext_sma200";

export function ATRExtensionTab({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ATRExtensionMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [universe, setUniverse] = useState<
    "nifty50" | "nifty500" | "large" | "mid" | "small" | "micro" | "sectoral"
  >("nifty50");
  const [threshold, setThreshold] = useState<number>(0.0);
  const [topN, setTopN] = useState(50);
  const [sortField, setSortField] = useState<SortField>("ext_sma50");
  const [sortAsc, setSortAsc] = useState(false);

  const handleScan = async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
      setMatches(null);
    }

    try {
      let filteredStocks = NSE500;
      if (universe === "nifty50") {
        filteredStocks = NSE500.filter(
          (s) =>
            NIFTY50_SYMBOLS.includes(s.symbol) ||
            NIFTY50_SYMBOLS.includes(s.symbol.replace(".NS", ""))
        );
      } else if (universe === "nifty500") {
        filteredStocks = NSE500.filter(
          (s) => s.sector !== "Index" && s.sector !== "Commodity" && (s as any).cap !== "micro"
        );
      } else if (
        universe === "large" ||
        universe === "mid" ||
        universe === "small" ||
        universe === "micro"
      ) {
        filteredStocks = NSE500.filter(
          (s) => s.sector !== "Index" && s.sector !== "Commodity" && (s as any).cap === universe
        );
      } else {
        filteredStocks = NSE500.filter((s) => s.sector === "Index");
      }
      
      const symbols = filteredStocks.map((s) => s.symbol);

      const res = await fetch("/api/atr-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          ext_sma50_threshold: threshold,
          top_n: topN,
        }),
      });

      if (!res.ok) throw new Error("Scan failed to execute on backend sidecar");
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: unknown) {
      if (!silent) {
        if (err instanceof Error) {
          setError(err.message || "An error occurred");
        } else {
          setError("An error occurred during calculation");
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    handleScan();
  }, [universe, threshold, topN]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedMatches = matches
    ? [...matches].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        // Handle string vs number sorting
        if (typeof valA === "string" && typeof valB === "string") {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        // Handle extension absolute values if checking sma50 or sma200 for extreme extensions
        const numA = Number(valA || 0);
        const numB = Number(valB || 0);

        return sortAsc ? numA - numB : numB - numA;
      })
    : [];

  const getHeatBadgeClass = (ext: number) => {
    const absExt = Math.abs(ext);
    if (ext >= 5.0) {
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold";
    } else if (ext >= 2.0) {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold";
    } else if (ext <= -5.0) {
      return "bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold";
    } else if (ext <= -2.0) {
      return "bg-rose-500/10 text-rose-400 border-rose-500/20 font-semibold";
    } else {
      return "bg-zinc-800/50 text-zinc-400 border-zinc-700/30";
    }
  };

  return (
    <div className="surface-card rounded-2xl p-6 border border-zinc-800/50 space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800/60 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                ATR & Moving Average Extensions
              </h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                Scan stocks extended from their historical EMAs & SMAs measured in multiples of ATR (14).
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleScan(false)}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-50 flex items-center gap-2 shrink-0 self-end md:self-auto"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Activity className="w-3.5 h-3.5 text-violet-400" />
          )}
          Trigger Recalculation
        </button>
      </div>

      {/* Explainer note */}
      <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 text-xs text-zinc-400 leading-relaxed flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-zinc-200 font-medium">How to use this scanner:</span> Extensions represent the number of ATRs (Average True Ranges) a stock's price is currently trading above or below its respective moving average. Values above <span className="text-emerald-400 font-semibold">+2.0</span> indicate strong upward expansion (overbought momentum), while values below <span className="text-rose-400 font-semibold">-2.0</span> indicate severe downward expansion (oversold mean-reversion setups). Values exceeding <span className="text-emerald-300 font-bold">5.0</span> are rare extreme extensions.
        </div>
      </div>

      {/* Controls panel */}
      <div className="space-y-4 bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800/60 shadow-inner">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              Cap Universe
            </label>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value as any)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all font-medium cursor-pointer"
            >
              <option value="nifty50">Nifty 50 Constituents</option>
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
              Minimum 50 SMA Extension (ATRs)
            </label>
            <select
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all font-medium cursor-pointer"
            >
              <option value="0.0">Show All (No Filter)</option>
              <option value="1.5">Absolute ext_sma50 &gt; 1.5</option>
              <option value="3.0">Absolute ext_sma50 &gt; 3.0</option>
              <option value="5.0">Absolute ext_sma50 &gt; 5.0</option>
              <option value="7.5">Absolute ext_sma50 &gt; 7.5</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              Maximum Display Count
            </label>
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 10)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-zinc-200 p-2.5 focus:border-violet-500 outline-none transition-all font-mono"
            />
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <div className="text-zinc-500 text-xs py-2 font-mono">
              Currently calculated from 500 trading days of historical aggregate data.
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 p-4 rounded-2xl border border-red-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Results grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <span className="text-xs text-zinc-500 font-mono tracking-tighter">
            Calculating ATR, EMAs, SMAs and Extensions in Parallel...
          </span>
        </div>
      ) : matches !== null && sortedMatches.length === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/40">
          No stocks match the current threshold filter criteria.
        </div>
      ) : matches !== null ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-400" />
              Scanned Candidates: {sortedMatches.length} sorted by absolute {sortField}
            </h3>
          </div>

          <div className="overflow-x-auto border border-zinc-800/80 rounded-2xl shadow-xl bg-zinc-900/30">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-semibold text-xs tracking-wider uppercase">
                  <th
                    onClick={() => handleSort("symbol")}
                    className="py-4 px-4 cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center gap-1">
                      Ticker
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("price")}
                    className="py-4 px-4 text-right cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      LTP (₹)
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("atr")}
                    className="py-4 px-4 text-right cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-end gap-1">
                      ATR (14)
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("ext_ema10")}
                    className="py-4 px-4 text-center cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-center gap-1">
                      10 EMA Ext.
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("ext_ema21")}
                    className="py-4 px-4 text-center cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-center gap-1">
                      21 EMA Ext.
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("ext_sma50")}
                    className="py-4 px-4 text-center cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-center gap-1">
                      50 SMA Ext.
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("ext_sma200")}
                    className="py-4 px-4 text-center cursor-pointer hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="flex items-center justify-center gap-1">
                      200 SMA Ext.
                      <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </th>
                  <th className="py-4 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sortedMatches.map((m) => (
                  <tr
                    key={m.symbol}
                    className="hover:bg-zinc-800/30 transition-colors group"
                  >
                    <td className="py-4 px-4 font-bold text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-semibold text-zinc-200">
                      {m.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-zinc-400 text-xs">
                      {m.atr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4 text-center font-mono">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono border inline-flex items-center gap-0.5 shadow-sm ${getHeatBadgeClass(
                          m.ext_ema10
                        )}`}
                      >
                        {m.ext_ema10 > 0 ? "+" : ""}
                        {m.ext_ema10.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-mono">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono border inline-flex items-center gap-0.5 shadow-sm ${getHeatBadgeClass(
                          m.ext_ema21
                        )}`}
                      >
                        {m.ext_ema21 > 0 ? "+" : ""}
                        {m.ext_ema21.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-mono">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono border inline-flex items-center gap-0.5 shadow-sm ${getHeatBadgeClass(
                          m.ext_sma50
                        )}`}
                      >
                        {m.ext_sma50 > 0 ? "+" : ""}
                        {m.ext_sma50.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center font-mono">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono border inline-flex items-center gap-0.5 shadow-sm ${getHeatBadgeClass(
                          m.ext_sma200
                        )}`}
                      >
                        {m.ext_sma200 > 0 ? "+" : ""}
                        {m.ext_sma200.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => onSelect && onSelect(m.symbol)}
                        className="p-2 bg-zinc-800 hover:bg-violet-600 text-zinc-300 hover:text-white rounded-xl transition-all shadow-md group-hover:border-violet-500/50 border border-zinc-700 inline-flex items-center gap-1.5 text-xs font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Chart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
