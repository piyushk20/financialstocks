import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Sidecar URL is env-overridable for staging/prod environments
const SIDECAR = process.env.SIDECAR_URL ?? "http://127.0.0.1:8015";

// Safe bounds for numeric parameters (mirrors sidecar-side clamping)
const HORIZON_MIN = 5,   HORIZON_MAX = 120;
const CAPITAL_MIN = 1000, CAPITAL_MAX = 1_000_000_000;
const RISK_MIN = 0.001,  RISK_MAX = 0.20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  // Validate symbol format before forwarding to sidecar
  if (!/^[A-Z0-9.\-_^=&]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);

  // Parse and clamp all numeric parameters — reject non-numeric inputs
  const rawHorizon = Number(searchParams.get("horizon") ?? 30);
  const rawCapital = Number(searchParams.get("capital") ?? 100000);
  const rawRisk    = Number(searchParams.get("risk")    ?? 0.02);

  if (!isFinite(rawHorizon) || !isFinite(rawCapital) || !isFinite(rawRisk)) {
    return NextResponse.json({ error: "horizon, capital, and risk must be finite numbers" }, { status: 400 });
  }

  const horizon = clamp(Math.round(rawHorizon), HORIZON_MIN, HORIZON_MAX);
  const capital = clamp(rawCapital, CAPITAL_MIN, CAPITAL_MAX);
  const risk    = clamp(rawRisk,    RISK_MIN,    RISK_MAX);

  try {
    const sidecarUrl =
      `${SIDECAR}/forecast` +
      `?ticker=${encodeURIComponent(symbol)}` +
      `&horizon=${horizon}&capital=${capital}&risk=${risk}`;

    const res = await fetch(sidecarUrl, {
      // Next.js: cache response for 30 s on the edge (sidecar already caches 900 s)
      next: { revalidate: 30 },
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
