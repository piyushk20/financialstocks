import { NextResponse } from "next/server";

const SIDECAR = "http://127.0.0.1:8001";

const POSITIVE_TERMS = ["surge", "profit", "beat", "growth", "record", "rise", "gain", "strong", "positive", "up"];
const NEGATIVE_TERMS = ["fall", "loss", "miss", "decline", "concern", "risk", "drop", "down", "weak", "cut"];

function tagSentiment(title: string): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  const t = title.toLowerCase();
  if (POSITIVE_TERMS.some((w) => t.includes(w))) return "POSITIVE";
  if (NEGATIVE_TERMS.some((w) => t.includes(w))) return "NEGATIVE";
  return "NEUTRAL";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Z0-9.\-_]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${SIDECAR}/news?ticker=${encodeURIComponent(symbol)}`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const { news } = await res.json();
    const tagged = (news ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      sentiment: tagSentiment(String(item.title ?? "")),
    }));

    return NextResponse.json({ news: tagged });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
