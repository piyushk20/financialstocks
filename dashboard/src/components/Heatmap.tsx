"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeatmapItem {
  symbol: string;
  change: number;
}

interface HeatmapProps {
  data: HeatmapItem[];
  title?: string;
  onSelect?: (symbol: string) => void;
}

export function Heatmap({ data, title = "Nifty 50 Heatmap", onSelect }: HeatmapProps) {
  const getColor = (change: number) => {
    if (change > 2) return "bg-green-600/80 border-green-400/50 text-white";
    if (change > 0) return "bg-green-900/40 border-green-700/30 text-green-300";
    if (change < -2) return "bg-red-600/80 border-red-400/50 text-white";
    if (change < 0) return "bg-red-900/40 border-red-700/30 text-red-300";
    return "bg-zinc-800/50 border-zinc-700/30 text-zinc-400";
  };

  const getFontSize = (change: number) => {
    const abs = Math.abs(change);
    if (abs > 3) return "text-sm font-bold";
    if (abs > 1.5) return "text-xs font-semibold";
    return "text-[10px] font-medium";
  };

  return (
    <div className="glass-card rounded-2xl p-6 transition-all border-violet-500/10 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
          {title}
        </h2>
        <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full border border-zinc-700/30 font-mono">
          Live Heatmap
        </span>
      </div>

      <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
        {data.map((stock, i) => (
          <motion.div
            key={stock.symbol}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.01 }}
            className={cn(
              "aspect-square flex flex-col items-center justify-center rounded-lg border transition-all cursor-pointer group hover:scale-[1.05] hover:z-10 hover:shadow-xl active:scale-95",
              getColor(stock.change)
            )}
            onClick={() => onSelect?.(stock.symbol)}
            title={`${stock.symbol}: ${stock.change.toFixed(2)}%`}
          >
            <span className={cn("tracking-tighter", getFontSize(stock.change))}>
              {stock.symbol.replace(".NS", "")}
            </span>
            <span className="text-[9px] font-mono font-bold leading-none mt-1 opacity-90">
              {stock.change > 0 ? "+" : ""}{stock.change.toFixed(2)}%
            </span>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-600 border border-green-400/50" />
          <span className="text-[10px] text-zinc-500 font-medium">Strong Bull</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-zinc-800 border border-zinc-700/30" />
          <span className="text-[10px] text-zinc-500 font-medium">Neutral</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-600 border border-red-400/50" />
          <span className="text-[10px] text-zinc-500 font-medium">Strong Bear</span>
        </div>
      </div>
    </div>
  );
}
