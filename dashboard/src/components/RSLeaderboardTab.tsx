"use client";

import { useState, useEffect, useCallback } from "react";
import { NSE500 } from "@/data/nse500";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Trophy,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type RSEntry = {
  symbol: string;
  rs_rating: number; // 1–99 IBD percentile
  price: number;
  p3: number; // 3-month alpha %
  p6: number;
  p9: number;
  p12: number;
  raw_score: number;
};

type Universe = "nifty500" | "large" | "mid" | "small" | "micro";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rsColor(rating: number): string {
  if (rating >= 90) return "text-emerald-300 bg-emerald-500/20 border-emerald-500/40";
  if (rating >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (rating >= 70) return "text-lime-400 bg-lime-500/10 border-lime-500/30";
  if (rating >= 50) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-rose-400 bg-rose-500/10 border-rose-500/30";
}

function AlphaPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        positive ? "text-emerald-400" : "text-rose-400"
      }`}
    >
      {positive ? (
        <TrendingUp className="w-3 h-3 shrink-0" />
      ) : (
        <TrendingDown className="w-3 h-3 shrink-0" />
      )}
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function MiniBarChart({ p3, p6, p9, p12 }: { p3: number; p6: number; p9: number; p12: number }) {
  const vals = [p3, p6, p9, p12];
  const labels = ["3M", "6M", "9M", "12M"];
  const maxAbs = Math.max(...vals.map(Math.abs), 1);

  return (
    <div className="flex items-end gap-[3px] h-8">
      {vals.map((v, i) => {
        const pct = Math.abs(v) / maxAbs;
        const height = Math.max(4, Math.round(pct * 28));
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              style={{ height }}
              className={`w-3 rounded-sm ${v >= 0 ? "bg-emerald-500/60" : "bg-rose-500/60"}`}
            />
            <span className="text-[8px] text-zinc-600">{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border text-sm font-bold tabular-nums ${rsColor(
        rating
      )}`}
    >
      {rating}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RSLeaderboardTab({
  onSelect,
}: {
  onSelect?: (symbol: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<RSEntry[] | null>(null);
  const [universeSize, setUniverseSize] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [universe, setUniverse] = useState<Universe>("nifty500");
  const [minRating, setMinRating] = useState(70);
  const [topN, setTopN] = useState(100);
  const [benchmark, setBenchmark] = useState("^NSEI");

  // Sort state
  const [sortCol, setSortCol] = useState<"rs_rating" | "p3" | "p6" | "p9" | "p12">("rs_rating");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (col: typeof sortCol) => {
    if (col === sortCol) {
      setSortAsc((a) => !a);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortedEntries = entries
    ? [...entries].sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        return sortAsc ? va - vb : vb - va;
      })
    : null;

  const handleScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries(null);

    try {
      let filtered = NSE500.filter(
        (s) => s.sector !== "Index" && s.sector !== "Commodity"
      );
      if (universe !== "nifty500") {
        filtered = filtered.filter((s) => (s as { cap?: string }).cap === universe);
      }
      const symbols = filtered.map((s) => s.symbol);

      const res = await fetch("/api/rs-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          index_symbol: benchmark,
          top_n: topN,
          min_rating: minRating,
        }),
      });

      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data = await res.json();

      const ratings = data.ratings as Record<string, Omit<RSEntry, "symbol">>;
      const arr: RSEntry[] = Object.entries(ratings).map(([sym, d]) => ({
        symbol: sym,
        ...d,
      }));

      setEntries(arr);
      setUniverseSize(data.universe_size ?? arr.length);

      // ── Persist to localStorage so PriceHeader badge can read it ──────────
      const stored: Record<string, number> = {};
      // Write full universe (not just filtered) — we get all from data
      const allRatings = data.ratings as Record<string, { rs_rating: number }>;
      for (const [sym, d] of Object.entries(allRatings)) {
        stored[sym] = d.rs_rating;
      }
      try {
        localStorage.setItem("rs_ratings", JSON.stringify(stored));
      } catch {
        /* localStorage full — ignore */
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [universe, benchmark, topN, minRating]);

  // Load cached ratings from localStorage on mount
  useEffect(() => {
    // No-op on mount — let user trigger first scan
  }, []);

  // ─── Stats summary ──────────────────────────────────────────────────────────
  const above90 = sortedEntries?.filter((e) => e.rs_rating >= 90).length ?? 0;
  const above80 = sortedEntries?.filter((e) => e.rs_rating >= 80).length ?? 0;
  const above70 = sortedEntries?.filter((e) => e.rs_rating >= 70).length ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-violet-400" />
            IBD RS Leaderboard
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            IBD-style Relative Strength Rating (1–99 percentile) vs Nifty index.
            Formula: 40% × 3M alpha + 20% × 6M + 20% × 9M + 20% × 12M
          </p>
        </div>
        <button
          id="rs-scan-btn"
          onClick={handleScan}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Scanning Markets...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" /> Run RS Scan
            </>
          )}
        </button>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-end gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/40">
        {/* Universe */}
        <div className="space-y-1.5 flex-1 min-w-[140px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Universe
          </label>
          <select
            value={universe}
            onChange={(e) => setUniverse(e.target.value as Universe)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
          >
            <option value="nifty500">Nifty 500</option>
            <option value="large">Large Cap</option>
            <option value="mid">Mid Cap</option>
            <option value="small">Small Cap</option>
            <option value="micro">Micro Cap</option>
          </select>
        </div>

        {/* Benchmark */}
        <div className="space-y-1.5 flex-1 min-w-[140px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Benchmark
          </label>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
          >
            <option value="^NSEI">Nifty 50 (^NSEI)</option>
            <option value="^NSEMDCP50">Nifty Midcap 50</option>
          </select>
        </div>

        {/* Min RS Rating */}
        <div className="space-y-1.5 flex-1 min-w-[180px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Min RS Rating:{" "}
            <span className={`font-bold ${minRating >= 80 ? "text-emerald-400" : minRating >= 70 ? "text-lime-400" : "text-amber-400"}`}>
              {minRating}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={99}
            step={1}
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Top N */}
        <div className="space-y-1.5 min-w-[100px]">
          <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
            Top N
          </label>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-300 p-1.5 focus:border-violet-500 outline-none"
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          <div className="text-sm">
            Downloading 1 year of price data for all stocks in the universe...
          </div>
          <div className="text-xs text-zinc-600">
            This may take 30–90 seconds for the full Nifty 500
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {sortedEntries !== null && !loading && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="font-medium text-zinc-200">{sortedEntries.length}</span> stocks shown
              {universeSize > 0 && ` of ${universeSize} scanned`}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-emerald-400 font-medium">{above90} RS≥90</span>
            <span className="text-emerald-500 font-medium">{above80} RS≥80</span>
            <span className="text-lime-400 font-medium">{above70} RS≥70</span>
          </div>

          {sortedEntries.length === 0 ? (
            <div className="text-center py-10 text-sm text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800/40">
              No stocks meet the current RS Rating filter (≥{minRating}).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider w-16">
                      Rank
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th
                      onClick={() => handleSort("rs_rating")}
                      className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-violet-400 select-none"
                    >
                      RS Rating {sortCol === "rs_rating" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th
                      onClick={() => handleSort("p3")}
                      className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-violet-400 select-none hidden sm:table-cell"
                    >
                      3M α {sortCol === "p3" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th
                      onClick={() => handleSort("p6")}
                      className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-violet-400 select-none hidden md:table-cell"
                    >
                      6M α {sortCol === "p6" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th
                      onClick={() => handleSort("p9")}
                      className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-violet-400 select-none hidden lg:table-cell"
                    >
                      9M α {sortCol === "p9" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th
                      onClick={() => handleSort("p12")}
                      className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-violet-400 select-none hidden lg:table-cell"
                    >
                      12M α {sortCol === "p12" ? (sortAsc ? "↑" : "↓") : ""}
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden xl:table-cell">
                      Breakdown
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry, idx) => (
                    <tr
                      key={entry.symbol}
                      onClick={() => {
                        if (onSelect) {
                          onSelect(entry.symbol);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      className="border-b border-zinc-800/30 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-zinc-500 text-xs font-medium tabular-nums">
                        {idx + 1}
                      </td>

                      {/* Symbol */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-zinc-100 group-hover:text-violet-400 transition-colors">
                          {entry.symbol.replace(".NS", "")}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right text-zinc-300 font-medium tabular-nums">
                        ₹{entry.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      {/* RS Rating badge */}
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <RatingBadge rating={entry.rs_rating} />
                        </div>
                      </td>

                      {/* Alpha columns */}
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <AlphaPill value={entry.p3} />
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <AlphaPill value={entry.p6} />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <AlphaPill value={entry.p9} />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <AlphaPill value={entry.p12} />
                      </td>

                      {/* Mini bar chart */}
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex justify-center">
                          <MiniBarChart
                            p3={entry.p3}
                            p6={entry.p6}
                            p9={entry.p9}
                            p12={entry.p12}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state (before first scan) ── */}
      {entries === null && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-zinc-500">
          <Trophy className="w-12 h-12 text-zinc-700" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No scan run yet</p>
            <p className="text-xs mt-1">
              Click <strong className="text-violet-400">Run RS Scan</strong> to compute IBD-style RS
              Ratings for all stocks in the selected universe
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
