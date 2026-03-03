import { NextResponse } from "next/server";

const SIDECAR = "http://127.0.0.1:8001";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Z0-9.\-_\^]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  try {
    // Fetch snapshot and 1yr daily history in parallel from yfinance sidecar
    const [snapRes, histRes] = await Promise.all([
      fetch(`${SIDECAR}/snapshot?ticker=${encodeURIComponent(symbol)}`, {
        next: { revalidate: 30 },
      }),
      fetch(
        `${SIDECAR}/history?ticker=${encodeURIComponent(symbol)}&period=2y&interval=1d`,
        { next: { revalidate: 30 } }
      ),
    ]);

    if (!snapRes.ok) {
      const text = await snapRes.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const { snapshot } = await snapRes.json();
    const { prices: history } = histRes.ok ? await histRes.json() : { prices: [] };

    return NextResponse.json({ snapshot, history });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
