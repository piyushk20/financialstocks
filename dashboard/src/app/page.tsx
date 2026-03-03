"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StockPicker } from "@/components/StockPicker";
import { PriceHeader } from "@/components/PriceHeader";
import { CandlestickChart } from "@/components/CandlestickChart";
import { FinancialsGrid } from "@/components/FinancialsGrid";
import { NewsFeed } from "@/components/NewsFeed";
import { TechnicalPanel } from "@/components/TechnicalPanel";
import { AIAnalysisTab } from "@/components/AIAnalysisTab";
import { Heatmap } from "@/components/Heatmap";
import { NSE200 } from "@/data/nse200";
import { BarChart3 } from "lucide-react";
import { useEffect } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const POLL = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS ?? 30000);

export default function Dashboard() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [finPeriod, setFinPeriod] = useState<"annual" | "quarterly">("annual");
  const [heatmapData, setHeatmapData] = useState<{ symbol: string; change: number }[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Price + history — polls every POLL ms
  const { data: stockData, isLoading: stockLoading } = useSWR(
    `/api/stock/${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: POLL }
  );

  // Financials — fetched once per symbol change
  const { data: finData, isLoading: finLoading } = useSWR(
    `/api/financials/${encodeURIComponent(symbol)}?period=${finPeriod}`,
    fetcher
  );

  // News
  const { data: newsData, isLoading: newsLoading } = useSWR(
    `/api/news/${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  // Technicals
  const { data: techData, isLoading: techLoading } = useSWR(
    `/api/technicals/${encodeURIComponent(symbol)}`,
    fetcher
  );

  // Fetch heatmap data on mount
  useEffect(() => {
    if (!mounted) return;
    async function fetchHeatmap() {
      try {
        const nifty50 = NSE200.slice(0, 50).map(s => s.symbol);
        const res = await fetch("/api/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: nifty50 }),
        });
        if (res.ok) {
          const data = await res.json();
          setHeatmapData(Object.entries(data).map(([sym, snap]) => ({
            symbol: sym,
            change: (snap as { change_percent: number }).change_percent || 0
          })));
        }
      } catch (e) {
        console.error("Heatmap fetch failed", e);
      }
    }
    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, POLL);
    return () => clearInterval(interval);
  }, [mounted]);

  return (
    <div className="relative min-h-screen z-10">
      {/* Top nav bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#0a0a0f]/90 backdrop-blur-xl px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-zinc-100">NSE 200</span>
              <span className="ml-1.5 text-xs text-zinc-500">Dashboard</span>
            </div>
          </div>

          {/* Stock Picker */}
          <div className="flex-1 flex justify-center">
            <StockPicker value={symbol} onChange={setSymbol} />
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live · {Math.round(POLL / 1000)}s
          </div>
        </div>
      </header>

      {/* Main grid */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Heatmap Section */}
        {mounted ? (
          heatmapData.length > 0 ? (
            <Heatmap data={heatmapData} onSelect={setSymbol} />
          ) : (
            <div className="glass-card rounded-2xl p-6 h-32 animate-pulse flex items-center justify-center text-zinc-500 font-medium lowercase tracking-tighter">
              Synchronizing Nifty 50 Heatmap...
            </div>
          )
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={symbol}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Row 1: Price header */}
            <PriceHeader
              symbol={symbol}
              snapshot={stockData?.snapshot ?? null}
              loading={stockLoading}
            />

            {/* Row 2: Chart + Technicals mini */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              <div className="xl:col-span-2">
                <CandlestickChart
                  data={stockData?.history ?? []}
                  sma20={techData?.sma20}
                  sma50={techData?.sma50}
                  sma200={techData?.sma200}
                  techDates={techData?.dates}
                  loading={stockLoading}
                />
              </div>
              <div className="xl:col-span-1">
                <TechnicalPanel
                  dates={techData?.dates ?? []}
                  rsi={techData?.rsi ?? []}
                  macd={techData?.macd ?? []}
                  macdSignal={techData?.macdSignal ?? []}
                  macdHist={techData?.macdHist ?? []}
                  ema20={techData?.ema20}
                  ema50={techData?.ema50}
                  ema200={techData?.ema200}
                  loading={techLoading}
                />
              </div>
            </div>

            {/* Row 3: Tabbed bottom section */}
            <Tabs defaultValue="financials">
              <TabsList className="bg-zinc-900/60 border border-zinc-800 px-1 py-1 h-auto mb-4 gap-1">
                {[
                  { value: "financials", label: "Financials" },
                  { value: "news", label: "News" },
                  { value: "ai", label: "✦ AI Analysis" },
                ].map(({ value, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-xs font-medium data-[state=active]:bg-violet-600 data-[state=active]:text-white text-zinc-400 rounded-md px-4 py-1.5 transition-all"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="financials">
                <FinancialsGrid
                  income={finData?.income ?? []}
                  balance={finData?.balance ?? []}
                  cashflow={finData?.cashflow ?? []}
                  loading={finLoading}
                  period={finPeriod}
                  onPeriodChange={setFinPeriod}
                />
              </TabsContent>

              <TabsContent value="news">
                <NewsFeed
                  news={newsData?.news ?? []}
                  loading={newsLoading}
                />
              </TabsContent>

              <TabsContent value="ai">
                <AIAnalysisTab
                  symbol={symbol}
                  snapshot={stockData?.snapshot}
                  income={finData?.income ?? []}
                  balance={finData?.balance ?? []}
                  cashflow={finData?.cashflow ?? []}
                  technicals={techData}
                />
              </TabsContent>
            </Tabs>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[10px] text-zinc-600 border-t border-zinc-800/40">
        Data via Financial Datasets AI · NSE 200 constituents · For informational purposes only
      </footer>
    </div>
  );
}
