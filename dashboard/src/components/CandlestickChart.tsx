"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
} from "lightweight-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { type OHLCV } from "@/lib/financialDatasets";

interface CandlestickChartProps {
  data: OHLCV[];
  sma20?: (number | null)[];
  sma50?: (number | null)[];
  sma200?: (number | null)[];
  techDates?: string[];
  loading: boolean;
}

export function CandlestickChart({
  data,
  sma20,
  sma50,
  sma200,
  techDates,
  loading,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#3f3f46" },
      timeScale: { borderColor: "#3f3f46", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 340,
    });

    chartRef.current = chart;

    // Candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const candles = data.map((d) => ({
      time: d.time as `${number}-${number}-${number}`,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candles);

    // SMA overlays (v5 API)
    const addSMA = (values: (number | null)[], dates: string[], color: string) => {
      if (!values || !dates || values.length === 0) return;
      
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      // Map technical dates to chart data via a lookup
      // candles[i].time is the source of truth for the x-axis
      const candleTimes = new Set(candles.map(c => c.time));
      
      const lineData = values
        .map((v, i) => {
          const date = dates[i];
          if (v == null || !date) return null;
          const formattedDate = date as `${number}-${number}-${number}`;
          if (!candleTimes.has(formattedDate)) return null;
          return { time: formattedDate, value: v };
        })
        .filter((item): item is { time: `${number}-${number}-${number}`; value: number } => 
          item !== null
        );
      
      lineData.sort((a, b) => (a.time > b.time ? 1 : -1));
      series.setData(lineData);
    };

    if (sma20 && techDates) addSMA(sma20, techDates, "#60a5fa");
    if (sma50 && techDates) addSMA(sma50, techDates, "#f59e0b");
    if (sma200 && techDates) addSMA(sma200, techDates, "#a78bfa");

    // Volume histogram (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#6366f120",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      data.map((d) => ({
        time: d.time as `${number}-${number}-${number}`,
        value: d.volume ?? 0,
        color: d.close >= d.open ? "#22c55e30" : "#ef444430",
      }))
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, sma20, sma50, sma200, techDates]);

  if (loading) {
    return <Skeleton className="w-full h-[340px] rounded-2xl bg-zinc-800" />;
  }

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-4 mb-3 text-[11px] font-medium">
        <span className="text-zinc-400">SMA:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#60a5fa] inline-block rounded" />
          <span className="text-zinc-300">20d:</span>
          <span className="text-blue-400 font-mono">
            {sma20?.filter(v => v != null).at(-1)?.toFixed(2) ?? "—"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#f59e0b] inline-block rounded" />
          <span className="text-zinc-300">50d:</span>
          <span className="text-amber-400 font-mono">
            {sma50?.filter(v => v != null).at(-1)?.toFixed(2) ?? "—"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#a78bfa] inline-block rounded" />
          <span className="text-zinc-300">200d:</span>
          <span className="text-violet-400 font-mono">
            {sma200?.filter(v => v != null).at(-1)?.toFixed(2) ?? "—"}
          </span>
        </span>
      </div>
      <div ref={containerRef} className="w-full overflow-hidden" />
    </div>
  );
}
