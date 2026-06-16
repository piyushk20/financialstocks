import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { type IncomeStatement } from "@/lib/financialDatasets";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

/**
 * Deterministic Intelligence Fallback
 * Generates a high-quality analysis locally when all AI providers are exhausted.
 */
function generateLocalAnalysis(
  symbol: string,
  price: number | undefined,
  rsi: number | undefined,
  sma50: number | undefined,
  wma44: number | undefined,
  pivots: { pivot?: number; r1?: number; r2?: number; s1?: number; s2?: number } | null,
  macd: number | undefined,
  metrics: Record<string, unknown> | null
) {
  const trend = price && sma50 ? (price > sma50 ? "BULLISH" : "BEARISH") : "NEUTRAL";
  const momentum = rsi ? (rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL") : "STABLE";
  const wmaTrend = price && wma44 ? (price > wma44 ? "BULLISH" : "BEARISH") : "N/A";

  return `### 🛡️ TRADER'S REPORT (Local Engine)
*Note: All AI providers quota exceeded. Generated via deterministic intelligence fallback.*

**Symbol:** ${symbol} | **Price:** ${price || "N/A"}
**Primary Trend (SMA50):** ${trend}
**WMA 44 Trend:** ${wmaTrend}
**Technical Sentiment:** ${momentum} (RSI: ${rsi || "N/A"})

### 🎯 PIVOT LEVELS
- **R2**: ${pivots?.r2?.toFixed(2) || "N/A"} | **R1**: ${pivots?.r1?.toFixed(2) || "N/A"}
- **Pivot**: ${pivots?.pivot?.toFixed(2) || "N/A"}
- **S1**: ${pivots?.s1?.toFixed(2) || "N/A"} | **S2**: ${pivots?.s2?.toFixed(2) || "N/A"}

### 🔬 QUANTITATIVE ANALYSIS
- **Trend Strength**: ${macd && macd > 0 ? "Positive Convergence" : "Negative Momentum"} detected.
- **Value Metric**: P/E Ratio is ${(metrics?.p_e_ratio as number | null) || "N/A"}. ${(metrics?.p_e_ratio as number) < 20 ? "Undervalued vs Peers." : "Premium valuation."}
- **Profitability**: Net Margin of ${metrics?.net_margin ? ((metrics.net_margin as number) * 100).toFixed(2) + "%" : "N/A"}.

### 🎯 FINAL VERDICT
- **Entry Zone**: ${pivots?.pivot ? pivots.pivot.toFixed(2) : price ? (price * 0.98).toFixed(2) : "N/A"}
- **Target**: ${pivots?.r2 ? pivots.r2.toFixed(2) : price ? (price * 1.15).toFixed(2) : "N/A"}
- **Stop Loss**: ${pivots?.s1 ? pivots.s1.toFixed(2) : price ? (price * 0.94).toFixed(2) : "N/A"}`;
}

export async function POST(req: Request) {
  try {
    const { snapshot, income, technicals, query } = await req.json();
    const symbol = snapshot?.ticker;
    if (!symbol || !/^[A-Z0-9.\-_^=]{1,20}$/i.test(symbol)) {
      return NextResponse.json({ error: "Invalid or missing symbol" }, { status: 400 });
    }

    console.log(`[AI-API] Analyzing ${symbol}`);

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // 1. EXTRACT TECHNICALS
    const latestRsi = (technicals?.rsi as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestSma50 = (technicals?.sma50 as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestWma44 = (technicals?.wma44 as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestMacd = (technicals?.macd as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const pivots = technicals?.pivots;

    // 2. Load Financial Datasets enrichment metrics
    let enrichedMetrics = null;
    const fdKey = process.env.FINANCIAL_DATASETS_API_KEY;
    if (fdKey && snapshot?.ticker) {
      try {
        const fdRes = await fetch(`https://api.financialdatasets.ai/financial-metrics?ticker=${snapshot.ticker}`, {
          headers: { "X-API-KEY": fdKey },
        });
        if (fdRes.ok) {
          const fdData = await fdRes.json();
          enrichedMetrics = fdData.financial_metrics?.[0];
        }
      } catch (err) {
        console.warn("[AI-API] Financial Datasets fetch failed:", err);
      }
    }

    // 3. CONTEXT TRUNCATION
    const incomeSummary = (income as IncomeStatement[])?.slice(0, 1);

    console.log(`[AI-API] RSI: ${latestRsi}, SMA50: ${latestSma50}, WMA44: ${latestWma44}, Pivots: ${!!pivots}`);

    const prompt = query
      ? `Quant Trader Prompt: "${query}" for ${symbol}. 
         Price: ${snapshot?.price}. RSI: ${latestRsi}. SMA50: ${latestSma50}. WMA44: ${latestWma44}. 
         Pivots: ${JSON.stringify(pivots)}. 
         Metrics: ${JSON.stringify(enrichedMetrics || "N/A")}`
      : `Provide a COMPREHENSIVE technical and fundamental intelligence report for ${symbol}.
         
         ### INPUT DATA:
         - Current Price: ${snapshot?.price}
         - RSI (14): ${latestRsi}
         - SMA 50: ${latestSma50}
         - WMA 44: ${latestWma44}
         - MACD Signal: ${latestMacd}
         - Pivot Points: Pivot=${pivots?.pivot}, R1=${pivots?.r1}, R2=${pivots?.r2}, S1=${pivots?.s1}, S2=${pivots?.s2}
         - Fundamentals: ${JSON.stringify(enrichedMetrics)}
         - Recent Financials: ${JSON.stringify(incomeSummary)}

         ### MANDATORY REPORT SECTIONS:
         
         ## 📈 TREND & MOMENTUM
         - Analyze Price vs SMA50 and WMA44 crossover status.
         - Interpret RSI (${latestRsi}) and MACD (${latestMacd}) for strength.
         
         ## 🎯 KEY LEVELS & PIVOTS
         - Discuss current price relative to Pivot (${pivots?.pivot}) and R1/S1 levels.
         
         ## 🔬 FUNDAMENTAL VIEW
         - Commentary on P/E and Margins.
         
         ## ⚡ EXECUTION STRATEGY
         - **ENTRY PRICE**: Suggest a specific entry level.
         - **TARGET PRICE**: Suggest a specific upside target.
         - **STOP-LOSS**: Suggest a specific downside protection level.

         Note: You are a quantitative assistant. Provide these levels as part of a technical analysis model.
         Format strictly using markdown headers (## and ###) for clarity.`;

    // 4. TRY GEMINI 2.0 FLASH (Primary)
    if (geminiKey) {
      try {
        console.log("[AI-API] Trying Gemini 2.0 Flash...");
        const google = createGoogleGenerativeAI({ apiKey: geminiKey });
        const result = await generateText({
          model: google("gemini-2.0-flash"),
          prompt,
          maxRetries: 0,
        });
        console.log("[AI-API] ✅ Gemini succeeded.");
        return new Response(result.text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      } catch (geminiErr: unknown) {
        const err = geminiErr as { statusCode?: number; message?: string };
        console.warn("[AI-API] Gemini failed:", err.message || geminiErr);
      }
    }

    // 5. TRY GROQ llama-3.3-70b-versatile (Secondary fallback)
    if (groqKey) {
      try {
        console.log("[AI-API] Trying Groq (llama-3.3-70b-versatile)...");
        const groq = createGroq({ apiKey: groqKey });
        const result = await generateText({
          model: groq("llama-3.3-70b-versatile"),
          prompt,
          maxRetries: 0,
        });
        console.log("[AI-API] ✅ Groq succeeded.");
        const groqPrefix = `### ⚡ TRADER'S REPORT (Powered by Groq / Llama 3.3 70B)\n\n`;
        return new Response(groqPrefix + result.text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      } catch (groqErr: unknown) {
        const err = groqErr as { message?: string };
        console.warn("[AI-API] Groq failed:", err.message || groqErr);
      }
    }

    // 6. FINAL FALLBACK: Local Deterministic Analysis
    console.log("[AI-API] All providers failed. Using local engine.");
    const finalFallback = generateLocalAnalysis(symbol, snapshot?.price, latestRsi, latestSma50, latestWma44, pivots, latestMacd, enrichedMetrics);
    return new Response(finalFallback, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

  } catch (err: unknown) {
    console.error("[AI-API] CRITICAL ERROR", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
