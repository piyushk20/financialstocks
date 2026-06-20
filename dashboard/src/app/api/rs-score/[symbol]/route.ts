import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);
  try {
    const res = await fetch(
      `http://127.0.0.1:8015/rs-score?ticker=${encodeURIComponent(decoded)}&index=^NSEI`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("RS Score Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch RS score" }, { status: 500 });
  }
}
