/**
 * Thin typed wrapper around the Financial Datasets AI REST API.
 * Mirrors what the local mcp-server/server.py does — but called directly
 * from Next.js Route Handlers so the API key stays server-side only.
 *
 * Docs: https://docs.financialdatasets.ai/
 * NSE tickers use Yahoo Finance format, e.g.  RELIANCE.NS
 */

const BASE = "https://api.financialdatasets.ai";

const headers = (): HeadersInit => ({
  "X-API-KEY": process.env.FINANCIAL_DATASETS_API_KEY ?? "",
  "Content-Type": "application/json",
});

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 60 }, // ISR — 60s cache
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Financial Datasets API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/* ─────────────────────────── Types ─────────────────────────── */

export interface PriceSnapshot {
  ticker: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  previous_close: number;
  change: number;
  change_percent: number;
  time: string;
}

export interface OHLCV {
  time: string; // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IncomeStatement {
  fiscal_year: number;
  period: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  ebitda: number | null;
}

export interface BalanceSheet {
  fiscal_year: number;
  period: string;
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  cash_and_equivalents: number | null;
  total_debt: number | null;
}

export interface CashFlowStatement {
  fiscal_year: number;
  period: string;
  operating_cash_flow: number | null;
  investing_cash_flow: number | null;
  financing_cash_flow: number | null;
  free_cash_flow: number | null;
  capital_expenditures: number | null;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string | null;
}

/* ─────────────────────────── API calls ─────────────────────────── */

export async function getSnapshot(ticker: string): Promise<PriceSnapshot> {
  const data = await request<{ snapshot: PriceSnapshot }>(
    `/prices/snapshot?ticker=${ticker}`
  );
  return data.snapshot;
}

export async function getHistoricalPrices(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<OHLCV[]> {
  const data = await request<{ prices: OHLCV[] }>(
    `/prices?ticker=${ticker}&interval=day&interval_multiplier=1&start_date=${startDate}&end_date=${endDate}`
  );
  return data.prices ?? [];
}

export async function getIncomeStatements(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
  limit = 5
): Promise<IncomeStatement[]> {
  const data = await request<{ income_statements: IncomeStatement[] }>(
    `/financials/income-statements?ticker=${ticker}&period=${period}&limit=${limit}`
  );
  return data.income_statements ?? [];
}

export async function getBalanceSheets(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
  limit = 5
): Promise<BalanceSheet[]> {
  const data = await request<{ balance_sheets: BalanceSheet[] }>(
    `/financials/balance-sheets?ticker=${ticker}&period=${period}&limit=${limit}`
  );
  return data.balance_sheets ?? [];
}

export async function getCashFlowStatements(
  ticker: string,
  period: "annual" | "quarterly" = "annual",
  limit = 5
): Promise<CashFlowStatement[]> {
  const data = await request<{ cash_flow_statements: CashFlowStatement[] }>(
    `/financials/cash-flow-statements?ticker=${ticker}&period=${period}&limit=${limit}`
  );
  return data.cash_flow_statements ?? [];
}

export async function getCompanyNews(ticker: string): Promise<NewsItem[]> {
  const data = await request<{ news: NewsItem[] }>(`/news?ticker=${ticker}`);
  return data.news ?? [];
}
