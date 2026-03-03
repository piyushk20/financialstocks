"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, RefreshCw } from "lucide-react";

interface AIAnalysisTabProps {
  symbol: string;
  snapshot: unknown;
  income: unknown[];
  balance: unknown[];
  cashflow: unknown[];
  technicals: unknown;
}

export function AIAnalysisTab({
  symbol,
  snapshot,
  income,
  balance,
  cashflow,
  technicals,
}: AIAnalysisTabProps) {
  const [hasRun, setHasRun] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [completion, setCompletion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when symbol changes
  useEffect(() => {
    setHasRun(false);
    setCompletion("");
    setError(null);
  }, [symbol]);

  // Auto-scroll as text streams
  useEffect(() => {
    if (scrollRef.current && isLoading) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [completion, isLoading]);

  const handleAnalyze = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setHasRun(true);
    setIsLoading(true);
    setCompletion("");
    setError(null);

    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, income, balance, cashflow, technicals }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setCompletion((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Simple markdown → HTML
  function renderMarkdown(text: string): string {
    if (!text) return "";
    return text
      .replace(/^[\s]*### (.+)$/gm, '<h3 class="text-violet-300 font-semibold text-sm mt-4 mb-2">$1</h3>')
      .replace(/^[\s]*## (.+)$/gm, '<h2 class="text-zinc-100 font-bold mt-6 mb-3">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-zinc-100 font-semibold">$1</strong>')
      .replace(/^[\s]*[-*] (.+)$/gm, '<div class="flex gap-2 ml-2 my-1"><span class="text-violet-500 mt-1">•</span><span class="text-zinc-300 text-sm">$1</span></div>')
      .replace(/\n\n/g, '<div class="h-3"></div>')
      .replace(/\n/g, "<br/>");
  }

  return (
    <div ref={scrollRef} className="glass-card rounded-2xl p-5 min-h-[400px] max-h-[600px] overflow-y-auto custom-scrollbar transition-all">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            AI Analysis
          </h2>
          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
            Gemini 1.5 Flash
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleAnalyze}
          disabled={isLoading}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs"
        >
          {isLoading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isLoading
            ? "Analyzing…"
            : hasRun
            ? "Re-Analyze"
            : `Analyze ${symbol.replace(".NS", "")}`}
        </Button>
      </div>

      {!hasRun && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Sparkles className="h-10 w-10 text-violet-400/40" />
          <p className="text-zinc-500 text-sm max-w-xs">
            Click{" "}
            <strong className="text-violet-400">Analyze</strong> to get a
            Gemini-powered Fundamental vs. Technical report for this stock.
          </p>
          <p className="text-zinc-600 text-xs">
            Requires GEMINI_API_KEY in .env.local
          </p>
        </div>
      )}

      {isLoading && !completion && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton
              key={i}
              className="h-4 rounded bg-zinc-800"
              style={{ width: `${85 - i * 5}%` }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          Failed to generate analysis: {error}. Make sure GEMINI_API_KEY is
          set in .env.local.
        </div>
      )}

      {completion && (
        <div
          className="prose prose-invert prose-sm max-w-none text-zinc-200 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(completion) }}
        />
      )}
    </div>
  );
}
