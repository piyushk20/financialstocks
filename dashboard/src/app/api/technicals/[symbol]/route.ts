import { NextResponse } from "next/server";

const SIDECAR = "http://127.0.0.1:8001";

/* ── Technical indicator math ── */

function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function computeEMA(closes: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(...new Array(period - 1).fill(NaN), prev);
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Z0-9.\-_\^]{1,20}$/i.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${SIDECAR}/history?ticker=${encodeURIComponent(symbol)}&period=2y&interval=1d`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const { prices } = await res.json();
    if (!prices || prices.length === 0) {
      return NextResponse.json({ error: "No price history available" }, { status: 404 });
    }

    const closes = prices.map((p: { close: number }) => p.close);
    const dates = prices.map((p: { time: string }) => p.time);

    const rsi = computeRSI(closes, 14);
    const sma20 = computeSMA(closes, 20);
    const sma50 = computeSMA(closes, 50);
    const sma200 = computeSMA(closes, 200);

    const ema20 = computeEMA(closes, 20);
    const ema50 = computeEMA(closes, 50);
    const ema200 = computeEMA(closes, 200);

    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    const macdLine = ema12.map((v, i) => (isNaN(v) || isNaN(ema26[i]) ? null : v - ema26[i]));
    const validMacd = macdLine.filter((v): v is number => v !== null);
    const signalPeriod = 9;
    const k = 2 / (signalPeriod + 1);
    let signalPrev = validMacd.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
    const signalArr: (number | null)[] = [];
    let validIdx = 0;
    macdLine.forEach((v) => {
      if (v === null) {
        signalArr.push(null);
      } else {
        if (validIdx < signalPeriod - 1) {
          signalArr.push(null);
        } else if (validIdx === signalPeriod - 1) {
          signalArr.push(signalPrev);
        } else {
          signalPrev = v * k + signalPrev * (1 - k);
          signalArr.push(signalPrev);
        }
        validIdx++;
      }
    });

    const macdHist = macdLine.map((v, i) =>
      v !== null && signalArr[i] !== null ? v - signalArr[i]! : null
    );

    return NextResponse.json({
      dates,
      rsi,
      sma20,
      sma50,
      sma200,
      ema20,
      ema50,
      ema200,
      macd: macdLine,
      macdSignal: signalArr,
      macdHist,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
