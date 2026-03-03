import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import fs from "fs";
import path from "path";
import { type IncomeStatement, type BalanceSheet } from "@/lib/financialDatasets";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { snapshot, income, balance, technicals } = body;
    console.log(`[AI-API] Analyzing ${snapshot?.ticker || "unknown"}`);

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/GEMINI_API_KEY="?([^"\n\r]*)"?/);
          if (match) apiKey = match[1];
        }
      } catch (e) {
        console.error("[AI-API] Could not read .env.local for Gemini", e);
      }
    }

    let groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/GROQ_API_KEY="?([^"\n\r]*)"?/);
          if (match) groqKey = match[1];
        }
      } catch (e) {
        console.error("[AI-API] Could not read .env.local for Groq", e);
      }
    }

    const latestRsi = (technicals?.rsi as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestSma50 = (technicals?.sma50 as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);
    const latestMacd = (technicals?.macd as (number | null)[] | undefined)?.filter((v): v is number => v != null).at(-1);

    const prompt = `You are a professional quantitative trader at Citadel. 
Provide a high-conviction technical and quantitative analysis of ${snapshot?.ticker || "the stock"}.

### CONTEXT DATA
Price Data: ${JSON.stringify(snapshot)}
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

    try {
      if (apiKey) {
        console.log("[AI-API] Attempting analysis with Gemini...");
        const google = createGoogleGenerativeAI({ apiKey });
        const result = await streamText({
          model: google("gemini-1.5-flash"),
          prompt,
        });
        return result.toTextStreamResponse();
      } else {
        console.warn("[AI-API] Gemini key missing, attempting Groq...");
        throw new Error("Gemini key missing");
      }
    } catch (geminiErr: any) {
      console.error("[AI-API] Gemini unavailable/failed, attempting Groq fallback...", geminiErr.message);
      
      if (!groqKey) {
        return new Response("Both Gemini and Groq API keys are missing or failed. Check .env.local", { status: 500 });
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
    const error = err as Error;
    console.error("[AI-API] CRITICAL ERROR", error);
    // Ensure we return a 500 if something fails before the stream starts
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
