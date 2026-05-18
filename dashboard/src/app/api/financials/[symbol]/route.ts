import { NextResponse } from "next/server";

const SIDECAR = "http://127.0.0.1:8015";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Z0-9.\-_^=]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "annual";

  // Commodities/futures don't have financial statements
  if (symbol.includes("=F")) {
    return NextResponse.json({
      income: [],
      balance: [],
      cashflow: [],
      period,
      isCommodity: true,
    });
  }


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
