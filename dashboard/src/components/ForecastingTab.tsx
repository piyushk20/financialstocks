"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Cpu,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Table,
  Sliders,
  RefreshCw,
  Coins
} from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ForecastingTabProps {
  onSelect: (ticker: string) => void;
}

const PRESETS = [
  { symbol: "^NSEI", label: "Nifty 50" },
  { symbol: "^NSEBANK", label: "Bank Nifty" },
  { symbol: "RELIANCE.NS", label: "Reliance" },
  { symbol: "TCS.NS", label: "TCS" },
  { symbol: "HDFCBANK.NS", label: "HDFC Bank" },
  { symbol: "INFY.NS", label: "Infosys" },
];

export function ForecastingTab({ onSelect }: ForecastingTabProps) {
  const [selectedTicker, setSelectedTicker] = useState("^NSEI");
  const [horizon, setHorizon] = useState(30);
  const [capital, setCapital] = useState(100000);
  const [risk, setRisk] = useState(2.0); // as percentage (2%)

  // Load symbol from local storage on mount if available
  useEffect(() => {
    const savedSymbol = localStorage.getItem("dashboard_symbol");
    if (savedSymbol) {
      // Check if it is custom or preset
      setSelectedTicker(savedSymbol);
    }
  }, []);

  const riskFraction = risk / 100.0;
  const { data, error, isLoading, mutate } = useSWR(
    `/api/forecast/${encodeURIComponent(selectedTicker)}?horizon=${horizon}&capital=${capital}&risk=${riskFraction}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const handleTickerChange = (ticker: string) => {
    setSelectedTicker(ticker);
    onSelect(ticker);
  };

  // Compile data for Forecast Chart: Merge history and forecast dates
  const forecastChartData = (() => {
    if (!data || !data.history || !data.forecast) return [];

    const historyPoints = data.history.map((pt: any) => ({
      date: pt.time,
      price: pt.close,
      sma50: pt.sma50,
      vol: pt.volatility_ann_pct,
      isForecast: false,
    }));

    // Start forecast projection from the last historical close
    const lastHist = historyPoints[historyPoints.length - 1];
    
    const forecastPoints = data.forecast.dates.map((date: string, i: number) => ({
      date,
      forecastMean: data.forecast.mean[i],
      forecastLower: data.forecast.lower[i],
      forecastUpper: data.forecast.upper[i],
      isForecast: true,
    }));

    // Join them
    return [...historyPoints, ...forecastPoints];
  })();

  // Compile data for Backtest Chart
  const backtestChartData = (() => {
    if (!data || !data.backtest || !data.backtest.equity_curve) return [];

    return data.backtest.equity_curve.map((pt: any, i: number) => ({
      date: pt.date,
      strategy: pt.value,
      benchmark: data.backtest.benchmark_curve[i]?.value || null,
    }));
  })();

  const sizing = data?.position_sizing;
  const metrics = data?.backtest?.metrics;
  const trades = data?.backtest?.trades || [];

  return (
    <div className="space-y-6">
      {/* Sub-tabs for predefined assets */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/60 pb-4">
        <div className="flex flex-wrap gap-1.5 bg-zinc-950/40 p-1 rounded-xl border border-zinc-800/40">
          {PRESETS.map((preset) => (
            <button
              key={preset.symbol}
              onClick={() => handleTickerChange(preset.symbol)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                selectedTicker === preset.symbol
                  ? "bg-violet-600/90 text-white shadow-lg shadow-violet-500/10"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Dynamic Model Status Indicator */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="text-[10px] text-zinc-500 animate-pulse flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />
              Computing forecast...
            </span>
          ) : (
            <div
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-sm uppercase tracking-wider",
                data?.is_timesfm
                  ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}
            >
              <Cpu className="h-3 w-3" />
              {data?.is_timesfm ? "Google TimesFM Enabled" : "Statistical Fallback Mode"}
            </div>
          )}
        </div>
      </div>

      {/* Grid: Controls and Forecast Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Controls Column */}
        <div className="xl:col-span-1 surface-card rounded-2xl p-5 border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Sliders className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Simulation Inputs</h3>
          </div>

          {/* Capital Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
              <span>Simulated Capital</span>
              <span className="text-zinc-500">INR</span>
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-sm font-mono font-bold text-zinc-100 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Risk Sizing Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-400">Target Risk Volatility</span>
              <span className="text-violet-400 font-mono font-bold">{risk.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={risk}
              onChange={(e) => setRisk(Number(e.target.value))}
              className="w-full accent-violet-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
            />
            <p className="text-[10px] text-zinc-500 leading-tight">
              Maximum portfolio loss target per single standard deviation event.
            </p>
          </div>

          {/* Horizon Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-zinc-400">Forecast Horizon</span>
              <span className="text-violet-400 font-mono font-bold">{horizon} Days</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="w-full accent-violet-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
            />
            <p className="text-[10px] text-zinc-500 leading-tight">
              Number of future calendar days projected by the forecasting model.
            </p>
          </div>

          <button
            onClick={() => mutate()}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold py-2.5 rounded-xl border border-zinc-700/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recalculate Models
          </button>
        </div>

        {/* Forecast Chart Column */}
        <div className="xl:col-span-3 surface-card rounded-2xl p-5 border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-xl flex flex-col min-h-[400px]">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4 text-violet-400" />
                Price Forecast & Confidence Intervals
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Past performance merges with the model's future mean prediction and confidence bounds.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <Skeleton className="h-64 w-full rounded-xl bg-zinc-800/40" />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-red-400 text-xs font-semibold p-4">
              Failed to load forecasting metrics. Ensure the sidecar server is running.
            </div>
          ) : (
            <div className="flex-1 w-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    tickLine={false}
                    interval={Math.floor(forecastChartData.length / 8)}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: "#71717a", fontWeight: "bold" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, marginTop: 10 }} />
                  
                  {/* Confidence band upper fill */}
                  <Area
                    name="80% CI Upper"
                    type="monotone"
                    dataKey="forecastUpper"
                    stroke="#a78bfa"
                    strokeOpacity={0.2}
                    strokeWidth={1}
                    fill="#a78bfa"
                    fillOpacity={0.08}
                    connectNulls
                    legendType="none"
                  />
                  {/* Confidence band lower fill (overlaps to create enclosed region) */}
                  <Area
                    name="80% CI Lower"
                    type="monotone"
                    dataKey="forecastLower"
                    stroke="#a78bfa"
                    strokeOpacity={0.2}
                    strokeWidth={1}
                    fill="#09090b"
                    fillOpacity={1}
                    connectNulls
                    legendType="none"
                  />
                  
                  {/* Historical close */}
                  <Line
                    name="Historical Price"
                    type="monotone"
                    dataKey="price"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                  />
                  
                  {/* Forecast Mean (Dashed) */}
                  <Line
                    name="Forecasted Trend"
                    type="monotone"
                    dataKey="forecastMean"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Position Sizing and Sizing Recommendations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recommendation Cards */}
        <div className="xl:col-span-1 surface-card rounded-2xl p-5 border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-xl flex flex-col justify-between">
          <div className="border-b border-zinc-800 pb-3 mb-4">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Position Sizing Matrix
            </h3>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full bg-zinc-800/40" />
              <Skeleton className="h-10 w-full bg-zinc-800/40" />
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {/* Sizing Comparison Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 flex flex-col justify-between">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-tight">Kelly Sizing (Half)</span>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-lg font-mono font-black text-emerald-400">
                      {sizing ? `${(sizing.kelly_fraction * 50).toFixed(1)}%` : "0.0%"}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 leading-none">
                    Alloc: {sizing ? sizing.suggested_shares_kelly : 0} Shares
                  </span>
                </div>

                <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 flex flex-col justify-between">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-tight">Volatility Sizing</span>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-lg font-mono font-black text-violet-400">
                      {sizing ? `${(sizing.vol_sizing_leverage * 100).toFixed(0)}%` : "0%"}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 leading-none">
                    Alloc: {sizing ? sizing.suggested_shares_vol : 0} Shares
                  </span>
                </div>
              </div>

              {/* Forecast stats */}
              <div className="bg-zinc-950/30 border border-zinc-800/40 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Forecast Return</span>
                  <span className={cn("font-mono font-bold", (sizing?.expected_return_pct || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {sizing ? (sizing.expected_return_pct >= 0 ? "+" : "") : ""}{sizing?.expected_return_pct ?? "0"}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Upward Probability</span>
                  <span className="text-zinc-200 font-mono font-semibold">{sizing?.probability_up ?? 50}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Annualized Volatility</span>
                  <span className="text-zinc-200 font-mono font-semibold">{sizing?.volatility_ann_pct ?? 0}%</span>
                </div>
              </div>

              {/* Stop Loss & Targets */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] font-semibold text-red-400 uppercase tracking-tight flex items-center justify-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Stop Loss Price
                  </span>
                  <p className="text-xs font-mono font-bold text-red-300 mt-1">
                    {sizing?.stop_loss_price ? `₹${sizing.stop_loss_price.toLocaleString()}` : "—"}
                  </p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-tight flex items-center justify-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Take Profit Target
                  </span>
                  <p className="text-xs font-mono font-bold text-emerald-300 mt-1">
                    {sizing?.take_profit_price ? `₹${sizing.take_profit_price.toLocaleString()}` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Backtester simulated metrics */}
        <div className="xl:col-span-2 surface-card rounded-2xl p-5 border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-xl flex flex-col justify-between min-h-[300px]">
          <div className="border-b border-zinc-800 pb-3 mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              Backtest Performance Simulation
            </h3>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">Past 1 Year</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Skeleton className="h-16 w-full bg-zinc-800/40" />
              <Skeleton className="h-16 w-full bg-zinc-800/40" />
              <Skeleton className="h-16 w-full bg-zinc-800/40" />
              <Skeleton className="h-16 w-full bg-zinc-800/40" />
            </div>
          ) : (
            <div className="flex flex-col flex-1 gap-4">
              {/* Backtest metrics grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Strategy CAGR", value: `${metrics?.total_return_pct ?? 0}%`, color: (metrics?.total_return_pct || 0) >= 0 ? "text-emerald-400" : "text-red-400" },
                  { label: "Benchmark CAGR", value: `${metrics?.benchmark_return_pct ?? 0}%`, color: (metrics?.benchmark_return_pct || 0) >= 0 ? "text-emerald-400" : "text-red-400" },
                  { label: "Sharpe Ratio", value: metrics?.sharpe_ratio?.toFixed(2) || "0.00", color: "text-zinc-200" },
                  { label: "Max Drawdown", value: `-${metrics?.max_drawdown_pct ?? 0}%`, color: "text-red-400" }
                ].map((m, i) => (
                  <div key={i} className="bg-zinc-950/40 border border-zinc-800/60 rounded-xl p-2.5 text-center">
                    <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-tight block truncate">{m.label}</span>
                    <span className={cn("text-sm font-mono font-bold block mt-1", m.color)}>{m.value}</span>
                  </div>
                ))}
              </div>

              {/* Equity curve chart */}
              <div className="flex-1 w-full min-h-[140px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={backtestChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                    <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 9 }} tickLine={false} interval={Math.floor(backtestChartData.length / 6)} />
                    <YAxis tick={{ fill: "#52525b", fontSize: 9 }} tickLine={false} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 10 }} />
                    <Line name="Sizing Strategy" type="monotone" dataKey="strategy" stroke="#10b981" strokeWidth={1.5} dot={false} />
                    <Line name="Buy & Hold Bench" type="monotone" dataKey="benchmark" stroke="#52525b" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trades Log Table */}
      <div className="surface-card rounded-2xl p-5 border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-xl">
        <div className="border-b border-zinc-800 pb-3 mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <Table className="h-4 w-4 text-violet-400" />
            Simulated Trade Logs
          </h3>
          <span className="text-[10px] text-zinc-500 font-semibold">{trades.length} Rebalances</span>
        </div>

        {isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-8 w-full bg-zinc-800/40" />
            <Skeleton className="h-8 w-full bg-zinc-800/40" />
            <Skeleton className="h-8 w-full bg-zinc-800/40" />
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-500 italic">
            No trades executed. Sizing strategy held 100% cash throughout the period.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                  <th className="py-2.5 px-3 text-right">Shares</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-right">Fee</th>
                  <th className="py-2.5 px-3 text-right">Portfolio Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 font-mono">
                {trades.map((trade: any, idx: number) => (
                  <tr key={idx} className="hover:bg-zinc-800/20">
                    <td className="py-2 px-3 text-zinc-300 font-semibold">{trade.date}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          trade.type === "BUY"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                            : "bg-red-500/10 text-red-400 border border-red-500/10"
                        )}
                      >
                        {trade.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-200">{trade.shares}</td>
                    <td className="py-2 px-3 text-right text-zinc-200">₹{trade.price.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right text-zinc-500">₹{trade.fee.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-zinc-100 font-bold">₹{trade.portfolio_value.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
