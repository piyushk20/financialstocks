import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SIDECAR = "http://127.0.0.1:8015";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${SIDECAR}/wma44-crossover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
