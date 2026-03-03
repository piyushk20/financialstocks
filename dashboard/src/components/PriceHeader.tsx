"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { type PriceSnapshot } from "@/lib/financialDatasets";
import { NSE200 } from "@/data/nse200";

interface PriceHeaderProps {
  symbol: string;
  snapshot: PriceSnapshot | null;
  loading: boolean;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function PriceHeader({ symbol, snapshot, loading }: PriceHeaderProps) {
  const stock = NSE200.find((s) => s.symbol === symbol);
  const isUp = (snapshot?.change ?? 0) >= 0;

  if (loading) {
    return (
      <div className="glass-card p-6 rounded-2xl space-y-3">
        <Skeleton className="h-6 w-48 bg-zinc-800" />
        <Skeleton className="h-12 w-64 bg-zinc-800" />
        <div className="flex gap-4">
          <Skeleton className="h-5 w-24 bg-zinc-800" />
          <Skeleton className="h-5 w-24 bg-zinc-800" />
          <Skeleton className="h-5 w-24 bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-2xl">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-bold text-violet-400 tracking-widest">
              {symbol.replace(".NS", "")}
            </span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">NSE</span>
            {stock && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                {stock.sector}
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold text-zinc-100">{stock?.name ?? symbol}</h1>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
          {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {isUp ? "Bullish" : "Bearish"}
        </div>
      </div>

      {/* Price */}
      <AnimatePresence mode="wait">
        <motion.div
          key={snapshot?.price}
          initial={{ backgroundColor: isUp ? "#22c55e22" : "#ef444422" }}
          animate={{ backgroundColor: "transparent" }}
          transition={{ duration: 1.2 }}
          className="rounded-xl px-2 -mx-2 flex items-baseline gap-3 mb-4"
        >
          <span className="text-5xl font-bold text-zinc-100 tracking-tight">
            ₹{fmt(snapshot?.price)}
          </span>
          <div className={`flex items-center gap-1 text-base font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            <span>{isUp ? "+" : ""}{fmt(snapshot?.change)}</span>
            <span>({isUp ? "+" : ""}{fmt(snapshot?.change_percent)}%)</span>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: `₹${fmt(snapshot?.open)}`, icon: <Activity className="h-3.5 w-3.5" /> },
          { label: "High", value: `₹${fmt(snapshot?.high)}`, icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> },
          { label: "Low", value: `₹${fmt(snapshot?.low)}`, icon: <TrendingDown className="h-3.5 w-3.5 text-red-400" /> },
          { label: "Prev Close", value: `₹${fmt(snapshot?.previous_close)}`, icon: <DollarSign className="h-3.5 w-3.5" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-zinc-900/60 rounded-xl p-3">
            <div className="flex items-center gap-1 text-zinc-500 text-[10px] font-medium uppercase tracking-widest mb-1">
              {icon}{label}
            </div>
            <div className="text-zinc-200 font-semibold text-sm">{value}</div>
          </div>
        ))}
      </div>

      {/* Volume */}
      <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <span>Volume:</span>
        <span className="text-zinc-300 font-medium">{snapshot?.volume?.toLocaleString("en-IN") ?? "—"}</span>
      </div>
    </div>
  );
}
