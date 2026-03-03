"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface TechnicalPanelProps {
  dates: string[];
  rsi: (number | null)[];
  macd: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  ema20?: number[];
  ema50?: number[];
  ema200?: number[];
  loading: boolean;
}

function rsiSignal(val: number | null) {
  if (val == null) return null;
  if (val >= 70) return { label: "Overbought", class: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (val <= 30) return { label: "Oversold", class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  return { label: "Neutral", class: "bg-zinc-700/60 text-zinc-400 border-zinc-600/20" };
}

export function TechnicalPanel({
  dates,
  rsi,
  macd,
  macdSignal,
  macdHist,
  ema20,
  ema50,
  ema200,
  loading,
}: TechnicalPanelProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl bg-zinc-800" />
        <Skeleton className="h-40 w-full rounded-2xl bg-zinc-800" />
      </div>
    );
  }

  const n = Math.min(dates.length, rsi.length, macd.length);
  const displayCount = Math.min(n, 60); // last 60 data points
  const slicedDates = dates.slice(n - displayCount);

  const rsiData = slicedDates.map((date, i) => ({
    date: date.slice(5), // MM-DD
    rsi: rsi[n - displayCount + i] ?? null,
  }));

  const macdData = slicedDates.map((date, i) => ({
    date: date.slice(5),
    macd: macd[n - displayCount + i] ?? null,
    signal: macdSignal[n - displayCount + i] ?? null,
    hist: macdHist[n - displayCount + i] ?? null,
  }));

  const latestRsi = rsi.filter(Boolean).at(-1) as number | null;
  const signal = rsiSignal(latestRsi);
  const latestMacd = macd.filter(Boolean).at(-1) as number | null;
  const latestSignal = macdSignal.filter(Boolean).at(-1) as number | null;
  const macdBull = latestMacd != null && latestSignal != null && latestMacd > latestSignal;

  const currentEma20 = ema20?.filter((v) => !isNaN(v)).at(-1);
  const currentEma50 = ema50?.filter((v) => !isNaN(v)).at(-1);
  const currentEma200 = ema200?.filter((v) => !isNaN(v)).at(-1);

  return (
    <div className="space-y-4">
      {/* EMA Grid */}
      <div className="glass-card rounded-2xl p-4 grid grid-cols-3 gap-3">
        {[
          { label: "EMA 20", value: currentEma20, color: "text-blue-400" },
          { label: "EMA 50", value: currentEma50, color: "text-amber-400" },
          { label: "EMA 200", value: currentEma200, color: "text-violet-400" },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center justify-center p-2 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-tighter mb-1">{item.label}</span>
            <span className={cn("text-xs font-mono font-bold", item.color)}>
              {item.value ? item.value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}
            </span>
          </div>
        ))}
      </div>

      {/* RSI */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">RSI (14)</h3>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Current: <span className="text-zinc-100 font-mono">{latestRsi?.toFixed(1) ?? "—"}</span></span>
            {signal && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${signal.class}`}>{signal.label}</span>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={rsiData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} interval={Math.floor(displayCount / 6)} />
            <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a1a1aa" }} itemStyle={{ color: "#a78bfa" }} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "70", fill: "#ef4444", fontSize: 10 }} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 2" label={{ value: "30", fill: "#22c55e", fontSize: 10 }} />
            <Line type="monotone" dataKey="rsi" stroke="#a78bfa" dot={false} strokeWidth={1.5} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* MACD */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">MACD (12/26/9)</h3>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${macdBull ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
            {macdBull ? "Bullish Cross" : "Bearish Cross"}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={macdData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} interval={Math.floor(displayCount / 6)} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a1a1aa" }} />
            <ReferenceLine y={0} stroke="#3f3f46" />
            <Bar dataKey="hist" radius={[2, 2, 0, 0]}>
              {macdData.map((entry, i) => (
                <Cell key={i} fill={(entry.hist ?? 0) >= 0 ? "#22c55e60" : "#ef444460"} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="macd" stroke="#60a5fa" dot={false} strokeWidth={1.5} connectNulls />
            <Line type="monotone" dataKey="signal" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls />
            <Legend wrapperStyle={{ fontSize: 10, color: "#71717a" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
