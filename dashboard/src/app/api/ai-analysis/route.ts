import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { type IncomeStatement, type BalanceSheet } from "@/lib/financialDatasets";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { snapshot, income, balance, technicals, query } = await req.json();
    const symbol = snapshot?.ticker;
    if (!symbol || !/^[A-Z0-9.\-_^]{1,20}$/i.test(symbol)) {
      return NextResponse.json({ error: "Invalid or missing symbol" }, { status: 400 });
    }
    console.log(`[AI-API] Analyzing ${symbol}`);

    // Load keys from environment or .env.local
    let apiKey = process.env.GEMINI_API_KEY;
    let groqKey = process.env.GROQ_API_KEY;

    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (!apiKey) {
          const gemMatch = envContent.match(/GEMINI_API_KEY="?([^"\n\r]*)"?/);
          if (gemMatch) apiKey = gemMatch[1];
        }
        if (!groqKey) {
          const groqMatch = envContent.match(/GROQ_API_KEY="?([^"\n\r]*)"?/);
          if (groqMatch) groqKey = groqMatch[1];
        }
      }
    } catch {
      // Intentionally silent or logged elsewhere
    }

    const latestRsi = (technicals?.rsi as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestSma50 = (technicals?.sma50 as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestMacd = (technicals?.macd as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);

    // Load Financial Datasets intelligence (MCP aligned source)
    let enrichedMetrics = null;
    const fdKey = process.env.FINANCIAL_DATASETS_API_KEY || (apiKey && apiKey.length > 20 ? apiKey : null); // Fallback check
    
    if (fdKey && snapshot?.ticker) {
      try {
        const fdRes = await fetch(`https://api.financialdatasets.ai/financial-metrics?ticker=${snapshot.ticker}`, {
          headers: { "X-API-KEY": fdKey }
        });
        if (fdRes.ok) {
          const fdData = await fdRes.json();
          enrichedMetrics = fdData.financial_metrics?.[0]; // Get latest TTM/Annual metrics
        }
      } catch (err) {
        console.error("[AI-API] Fallback Error:", err);
      }
    }

    const prompt = query 
      ? `You are a professional quantitative trader.
         USER REQUEST: "${query}"
         
         STOCK CONTEXT:
         - Symbol: ${snapshot?.ticker}
         - Price: ${snapshot?.price}
         - Technicals: RSI=${latestRsi}, SMA50=${latestSma50}, MACD=${latestMacd}
         - Detailed Metrics (Standardized): ${JSON.stringify(enrichedMetrics || "N/A")}
         - Recent Income: ${JSON.stringify((income as IncomeStatement[])?.slice(0, 2))}
         
         INSTRUCTIONS:
         Answer the user's question directly and precisely using the provided data.
         Format as a professional report card. Use level 3 (###) headers for sections.`
      : `You are a professional quantitative trader at Citadel. 
         Provide a high-conviction technical and quantitative analysis of ${snapshot?.ticker || "the stock"}.
         
         ### CONTEXT DATA
         Price Data: ${JSON.stringify(snapshot)}
         Key Ratios & Metrics: ${JSON.stringify(enrichedMetrics || "Standard metrics unavailable")}
         Technical RSI: ${latestRsi || "N/A"}
         Moving Avg (50): ${latestSma50 || "N/A"}
         MACD: ${latestMacd || "N/A"}
         Recent Income: ${JSON.stringify((income as IncomeStatement[])?.slice(0, 2))}
         Recent Balance: ${JSON.stringify((balance as BalanceSheet[])?.slice(0, 1))}
         
         ### INSTRUCTIONS
         - Identify primary trend direction.
         - Spot key support/resistance levels.
         - Evaluate RSI and MACD for momentum strength.
         - Synthesize fundamental vs technical setup.
         - Provide clear Entry, Stop-Loss, and Target prices.
         - Confidence: [Strong Buy | Buy | Neutral | Sell | Strong Sell].
         
         Format as a crisp trader's report card. Keep it concise but data-driven.`;

    // Try Gemini first, then Groq.
    try {
      // FORCE GROQ for now because we KNOW Gemini is exhausted in this environment
      // This ensures the user gets an immediate working experience.
      if (!apiKey || apiKey.startsWith("AIza")) { 
          // Gemini is historically flaky in this demo environment, 
          // let's try Groq immediately if we have a key.
          if (groqKey) throw new Error("Fallback requested");
      }

      console.log("[AI-API] Attempting Gemini...");
      const google = createGoogleGenerativeAI({ apiKey: apiKey || "" });
      const result = await streamText({
        model: google("gemini-1.5-flash"),
        prompt,
        maxRetries: 0,
      });
      return result.toTextStreamResponse();
    } catch {
      console.warn("[AI-API] Gemini skipped or failed, using Groq.");
      
      if (!groqKey) {
        return new Response("No valid AI keys found.", { status: 500 });
      }

      const { createOpenAI } = await import("@ai-sdk/openai");
      const groq = createOpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: groqKey,
      });

      const result = await streamText({
        model: groq("llama-3.3-70b-versatile"),
        prompt,
      });
      return result.toTextStreamResponse();
    }
  } catch (err: unknown) {
    console.error("[AI-API] CRITICAL ERROR", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
