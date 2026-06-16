import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SIDECAR = "http://127.0.0.1:8015";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  
  // Basic sanity check on the symbol format
  if (!/^[A-Z0-9.\-_\^=]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const horizon = searchParams.get("horizon") || "30";
  const capital = searchParams.get("capital") || "100000";
  const risk = searchParams.get("risk") || "0.02";

  try {
    const sidecarUrl = `${SIDECAR}/forecast?ticker=${encodeURIComponent(symbol)}&horizon=${horizon}&capital=${capital}&risk=${risk}`;
    
    const res = await fetch(sidecarUrl, {
      next: { revalidate: 30 } // Cache for 30s at Next.js level
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
