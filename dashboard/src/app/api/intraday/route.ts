import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker");
    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker parameter" }, { status: 400 });
    }

    const res = await fetch(`http://127.0.0.1:8015/intraday?ticker=${encodeURIComponent(ticker)}`);
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Backend returned ${res.status}: ${err}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Intraday Proxy Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch from sidecar" },
      { status: 500 }
    );
  }
}
