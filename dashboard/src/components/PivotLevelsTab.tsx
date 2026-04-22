"use client";

import React from "react";
import { ArrowUpCircle, ArrowDownCircle, Target, Info } from "lucide-react";

interface PivotsData {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
  prevHigh: number;
  prevLow: number;
  prevClose: number;
  date: string;
}

interface PivotLevelsTabProps {
  pivots: PivotsData | null;
  loading: boolean;
}

export default function PivotLevelsTab({ pivots, loading }: PivotLevelsTabProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!pivots) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400">
        <Info className="w-8 h-8 mb-2 opacity-20" />
        <p>No pivot data available for this symbol.</p>
      </div>
    );
  }

  const levels = [
    { label: "Resistance 2", value: pivots.r2, type: "resistance", icon: <ArrowUpCircle className="w-4 h-4 text-rose-500" /> },
    { label: "Resistance 1", value: pivots.r1, type: "resistance", icon: <ArrowUpCircle className="w-4 h-4 text-rose-400" /> },
    { label: "Pivot Point", value: pivots.pivot, type: "pivot", icon: <Target className="w-4 h-4 text-amber-500" /> },
    { label: "Support 1", value: pivots.s1, type: "support", icon: <ArrowDownCircle className="w-4 h-4 text-emerald-400" /> },
    { label: "Support 2", value: pivots.s2, type: "support", icon: <ArrowDownCircle className="w-4 h-4 text-emerald-500" /> },
  ];

  return (
    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            Standard Pivot Levels
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Calculated based on previous trading session: {pivots.date}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
          <span className="block opacity-70">Method</span>
          <span className="font-medium text-slate-300 uppercase">Classic</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Table View */}
        <div className="space-y-1">
          {levels.map((level) => (
            <div 
              key={level.label}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 group hover:scale-[1.01] ${
                level.type === 'pivot' 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' 
                  : level.type === 'resistance'
                  ? 'bg-rose-500/5 border-rose-500/20 text-rose-100 hover:bg-rose-500/10'
                  : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100 hover:bg-emerald-500/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-md bg-slate-800 group-hover:bg-slate-700 transition-colors">
                  {level.icon}
                </span>
                <span className="font-medium">{level.label}</span>
              </div>
              <div className="text-lg font-mono font-bold tracking-tight">
                ₹{level.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="flex flex-col justify-between">
          <div className="bg-indigo-500/5 border border-indigo-500/20 p-5 rounded-xl">
            <h4 className="text-sm font-semibold text-indigo-300 mb-3 uppercase tracking-wider">Calculation Inputs</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Prev High</span>
                <span className="text-sm font-mono text-slate-200 block">₹{pivots.prevHigh.toFixed(2)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Prev Low</span>
                <span className="text-sm font-mono text-slate-200 block">₹{pivots.prevLow.toFixed(2)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Prev Close</span>
                <span className="text-sm font-mono text-slate-200 block">₹{pivots.prevClose.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-indigo-500/10">
              <p className="text-xs text-slate-400 leading-relaxed italic">
                &quot;Standard Pivot Points are used by traders to determine overall market trend over different time frames. 
                The pivot point itself is simply the average of the high, low and closing prices from the previous trading period.&quot;
              </p>
            </div>
          </div>
          
          <div className="mt-4 flex items-center gap-2 p-3 bg-slate-800/30 rounded-lg text-xs text-slate-500">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Pivots are leading indicators used to identify potential support and resistance zones.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
