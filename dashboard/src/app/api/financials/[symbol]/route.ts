import { NextResponse } from "next/server";

const SIDECAR = "http://127.0.0.1:8001";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Z0-9.\-_^]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "annual";

  try {
    const res = await fetch(
      `${SIDECAR}/financials?ticker=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
      { next: { revalidate: 30 } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({
      income: data.income ?? [],
      balance: data.balance ?? [],
      cashflow: data.cashflow ?? [],
      period,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
