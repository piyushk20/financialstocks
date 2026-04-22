import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch("http://127.0.0.1:8001/momentum-burst", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Momentum Burst Proxy Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch from sidecar" },
      { status: 500 }
    );
  }
}
