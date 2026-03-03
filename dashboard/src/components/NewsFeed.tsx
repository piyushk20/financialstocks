"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, Newspaper } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface NewsItemTagged {
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string | null;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
}

interface NewsFeedProps {
  news: NewsItemTagged[];
  loading: boolean;
}

const sentimentConfig = {
  POSITIVE: { label: "Bullish", class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  NEGATIVE: { label: "Bearish", class: "bg-red-500/10 text-red-400 border-red-500/20" },
  NEUTRAL:  { label: "Neutral", class: "bg-zinc-700/60 text-zinc-400 border-zinc-600/20" },
};

export function NewsFeed({ news, loading }: NewsFeedProps) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="h-4 w-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Latest News</h2>
        <span className="ml-auto text-[10px] text-zinc-500">Auto-tagged sentiment</span>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-zinc-800" />)}
        </div>
      ) : (
        <ScrollArea className="h-[420px] pr-2">
          <div className="space-y-3">
            {news.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-8">No news found for this stock.</p>
            )}
            {news.map((item, i) => {
              const cfg = sentimentConfig[item.sentiment];
              let timeAgo = "";
              try { timeAgo = formatDistanceToNow(new Date(item.published_at), { addSuffix: true }); } catch { timeAgo = ""; }
              return (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-zinc-900/60 border border-zinc-800 p-3.5 hover:border-zinc-600 hover:bg-zinc-800/60 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.class}`}>
                      {cfg.label}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span>{item.source}</span>
                      <span>·</span>
                      <span suppressHydrationWarning>{timeAgo}</span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className="text-sm text-zinc-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
                    {item.title}
                  </p>
                  {item.summary && (
                    <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{item.summary}</p>
                  )}
                </a>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
