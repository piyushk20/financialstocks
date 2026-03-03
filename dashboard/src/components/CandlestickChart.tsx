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
  loading: boolean;
}

export function CandlestickChart({
  data,
  sma20,
  sma50,
  sma200,
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
    const addSMA = (values: (number | null)[], color: string) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
      });
      const lineData = values
        .map((v, i) =>
          v != null && candles[i]
            ? { time: candles[i].time, value: v }
            : null
        )
        .filter(Boolean) as { time: `${number}-${number}-${number}`; value: number }[];
      series.setData(lineData);
    };

    if (sma20) addSMA(sma20, "#60a5fa");
    if (sma50) addSMA(sma50, "#f59e0b");
    if (sma200) addSMA(sma200, "#a78bfa");

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
  }, [data, sma20, sma50, sma200]);

  if (loading) {
    return <Skeleton className="w-full h-[340px] rounded-2xl bg-zinc-800" />;
  }

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-4 mb-3 text-[11px] font-medium">
        <span className="text-zinc-400">SMA:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-blue-400 inline-block rounded" />
          20d
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />
          50d
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-violet-400 inline-block rounded" />
          200d
        </span>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
