import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { symbols } = await req.json();
    if (!symbols || !Array.isArray(symbols)) {
      return NextResponse.json({ error: "Invalid symbols" }, { status: 400 });
    }

    const validSymbols = symbols.filter(sym => /^[A-Z0-9.\-_^]{1,20}$/i.test(sym));
    if (validSymbols.length === 0) {
      return NextResponse.json({ error: "No valid symbols provided" }, { status: 400 });
    }

    // Proxy to sidecar's batch price endpoint if exists, 
    // or fetch individually in parallel for now.
    // The sidecar has a snapshot endpoint that takes a ticker.
    const SIDECAR_URL = "http://127.0.0.1:8001";
    
    const results: Record<string, unknown> = {};
    const promises = symbols.map(async (sym) => {
      try {
        const res = await fetch(`${SIDECAR_URL}/snapshot?ticker=${encodeURIComponent(sym)}`, {
          next: { revalidate: 30 }
        });
        if (res.ok) {
          const data = await res.json();
          results[sym] = data.snapshot || { changePercent: 0 };
        }
      } catch {
        console.error(`Failed to fetch snapshot for ${sym}`);
      }
    });

    await Promise.all(promises);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
