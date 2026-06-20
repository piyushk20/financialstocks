"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, DollarSign, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type PriceSnapshot } from "@/lib/financialDatasets";
import { NSE500 } from "@/data/nse500";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PriceHeaderProps {
  symbol: string;
  snapshot: PriceSnapshot | null;
  loading: boolean;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatMarketCap(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return "—";
  const cr = n / 1e7;
  if (cr >= 100000) {
    return `₹${(cr / 100000).toFixed(2)} Lakh Cr`;
  }
  return `₹${cr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

export function PriceHeader({ symbol, snapshot, loading }: PriceHeaderProps) {
  const stock = NSE500.find((s) => s.symbol === symbol);
  const isUp = (snapshot?.change ?? 0) >= 0;
  const isGlobal = symbol.includes("=F");
  const currencySymbol = isGlobal ? "$" : "₹";

  // ── RS Rating: two-tier strategy ─────────────────────────────────────────
  // Tier 1: full percentile from localStorage (written by RSLeaderboardTab)
  const [cachedRating, setCachedRating] = useState<number | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("rs_ratings");
      if (stored) {
        const map: Record<string, number> = JSON.parse(stored);
        setCachedRating(map[symbol] ?? null);
      } else {
        setCachedRating(null);
      }
    } catch {
      setCachedRating(null);
    }
  }, [symbol]);

  // Tier 2: single-stock auto-fetch (always available, ~5-10s)
  // Only fetch for NSE equities, not futures/indices
  const skipFetch = isGlobal || symbol.startsWith("^");
  const { data: rsData, isLoading: rsLoading } = useSWR<{
    rs_rating: number;
    raw_score: number;
    p3: number; p6: number; p9: number; p12: number;
  }>(
    skipFetch ? null : `/api/rs-score/${encodeURIComponent(symbol)}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 300_000, // 5 min (matches backend cache TTL)
    }
  );

  // Use cached full-scan rating if available, otherwise fall back to single-stock estimate
  const rsRating: number | null = cachedRating ?? rsData?.rs_rating ?? null;
  const isFullScan = cachedRating != null; // true = percentile, false = sigmoid estimate

  function rsRatingStyle(r: number): string {
    if (r >= 90) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    if (r >= 80) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (r >= 70) return "bg-lime-500/10 text-lime-400 border-lime-500/30";
    if (r >= 50) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    return "bg-rose-500/10 text-rose-400 border-rose-500/30";
  }

  if (loading) {
    return (
      <div className="surface-card p-6 rounded-2xl space-y-3">
        <Skeleton className="h-6 w-48 bg-[var(--bg-elevated)]" />
        <Skeleton className="h-12 w-64 bg-[var(--bg-elevated)]" />
        <div className="flex gap-4">
          <Skeleton className="h-5 w-24 bg-[var(--bg-elevated)]" />
          <Skeleton className="h-5 w-24 bg-[var(--bg-elevated)]" />
          <Skeleton className="h-5 w-24 bg-[var(--bg-elevated)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card p-6 rounded-2xl">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold text-[var(--accent)] tracking-widest">
              {symbol.includes("=F") ? symbol : symbol.replace(".NS", "")}
            </span>
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
              {isGlobal ? "COMEX/NYMEX" : "NSE"}
            </span>
            {stock && (
              <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                {stock.sector}
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{stock?.name ?? symbol}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${isUp ? "bg-[var(--up)]/10 text-[var(--up)]" : "bg-[var(--down)]/10 text-[var(--down)]"}`}>
            {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {isUp ? "Bullish" : "Bearish"}
          </div>
          {/* RS Rating badge — auto-populated via single-stock fetch */}
          {!isGlobal && !symbol.startsWith("^") && (
            <div
              title={
                isFullScan
                  ? `IBD RS Rating ${rsRating}/99 — full percentile vs NSE 500 universe`
                  : rsRating != null
                  ? `RS Score ${rsRating}/99 — sigmoid estimate vs Nifty 50. Run RS Leaderboard tab for full percentile ranking`
                  : "Computing RS Score…"
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                rsLoading && rsRating == null
                  ? "bg-zinc-800/40 text-zinc-600 border-zinc-700/30 animate-pulse"
                  : rsRating != null
                  ? rsRatingStyle(rsRating)
                  : "bg-zinc-800/60 text-zinc-500 border-zinc-700/40"
              }`}
            >
              <Zap className="h-3 w-3" />
              {rsLoading && rsRating == null
                ? "RS …"
                : rsRating != null
                ? `RS ${rsRating}${!isFullScan ? "~" : ""}`
                : "RS N/A"}
            </div>
          )}
        </div>
      </div>

      {/* Price */}
      <AnimatePresence mode="wait">
        <motion.div
          key={snapshot?.price}
          initial={{ backgroundColor: isUp ? "oklch(65% 0.15 150 / 0.15)" : "oklch(60% 0.18 25 / 0.15)" }}
          animate={{ backgroundColor: "transparent" }}
          transition={{ duration: 1.2 }}
          className="rounded-xl px-2 -mx-2 flex items-baseline gap-3 mb-4"
        >
          <span className="text-5xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums">
            {currencySymbol}{fmt(snapshot?.price)}
          </span>
          <div className={`flex items-center gap-1 text-base font-semibold tabular-nums ${isUp ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
            <span>{isUp ? "+" : ""}{fmt(snapshot?.change)}</span>
            <span>({isUp ? "+" : ""}{fmt(snapshot?.change_percent)}%)</span>
          </div>
        </motion.div>
      </AnimatePresence>
 
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: `${currencySymbol}${fmt(snapshot?.open)}`, icon: <Activity className="h-3.5 w-3.5" /> },
          { label: "High", value: `${currencySymbol}${fmt(snapshot?.high)}`, icon: <TrendingUp className="h-3.5 w-3.5 text-[var(--up)]" /> },
          { label: "Low", value: `${currencySymbol}${fmt(snapshot?.low)}`, icon: <TrendingDown className="h-3.5 w-3.5 text-[var(--down)]" /> },
          { label: "Prev Close", value: `${currencySymbol}${fmt(snapshot?.previous_close)}`, icon: <DollarSign className="h-3.5 w-3.5" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3">
            <div className="flex items-center gap-1 text-[var(--text-muted)] text-[10px] font-medium uppercase tracking-widest mb-1">
              {icon}{label}
            </div>
            <div className="text-[var(--text-primary)] font-semibold text-sm tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {/* Volume */}
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>Volume:</span>
        <span className="text-[var(--text-secondary)] font-medium tabular-nums">{snapshot?.volume?.toLocaleString("en-IN") ?? "—"}</span>
      </div>

      {/* Valuation and Ratios Section (only show if it's not a global contract like futures) */}
      {!isGlobal && (snapshot?.market_cap || snapshot?.pe_ratio || snapshot?.screener_ratios) && (
        <>
          <div className="my-4 border-t border-[var(--border-subtle)]" />
          <div className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-violet-400 animate-pulse" /> Valuation & Key Ratios (via Screener)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Market Cap", value: formatMarketCap(snapshot?.market_cap) },
              { label: "PE Ratio", value: snapshot?.pe_ratio ? snapshot.pe_ratio.toFixed(1) : "—" },
              { label: "PB Ratio", value: snapshot?.pb_ratio ? snapshot.pb_ratio.toFixed(1) : "—" },
              { label: "Div Yield", value: snapshot?.dividend_yield != null ? `${(snapshot.dividend_yield * 100).toFixed(2)}%` : "—" },
              { label: "ROCE", value: snapshot?.screener_ratios?.["ROCE"] || "—" },
              { label: "ROE", value: snapshot?.screener_ratios?.["ROE"] || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 hover:border-violet-500/30 transition-all group">
                <div className="text-[var(--text-muted)] text-[9px] font-medium uppercase tracking-wider mb-1">
                  {label}
                </div>
                <div className="text-[var(--text-primary)] font-semibold text-sm tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
