"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

interface IncomeRow { fiscal_year: number; period: string; revenue: number | null; gross_profit: number | null; operating_income: number | null; net_income: number | null; eps_diluted: number | null; ebitda: number | null }
interface BalanceRow { fiscal_year: number; period: string; total_assets: number | null; total_liabilities: number | null; total_equity: number | null; cash_and_equivalents: number | null; total_debt: number | null }
interface CFRow { fiscal_year: number; period: string; operating_cash_flow: number | null; investing_cash_flow: number | null; financing_cash_flow: number | null; free_cash_flow: number | null; capital_expenditures: number | null }

interface FinancialsGridProps {
  income: IncomeRow[];
  balance: BalanceRow[];
  cashflow: CFRow[];
  loading: boolean;
  period: "annual" | "quarterly";
  onPeriodChange: (p: "annual" | "quarterly") => void;
}

function crore(n: number | null): string {
  if (n == null) return "—";
  const cr = n / 1e7;
  return `₹${Math.abs(cr) >= 1000 ? (cr / 1000).toFixed(1) + "K Cr" : cr.toFixed(0) + " Cr"}`;
}

function TableSkeleton() {
  return (
    <div className="space-y-2 mt-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg bg-zinc-800" />
      ))}
    </div>
  );
}

function IncomeTable({ rows }: { rows: IncomeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left py-2 pr-4 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Revenue</th>
            <th className="text-right py-2 px-2 font-medium">Gross Profit</th>
            <th className="text-right py-2 px-2 font-medium">EBITDA</th>
            <th className="text-right py-2 px-2 font-medium">Net Income</th>
            <th className="text-right py-2 px-2 font-medium">EPS (Dil.)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors group">
              <td className="py-3 pr-4 text-zinc-300 font-medium">
                {r.fiscal_year} <span className="text-zinc-500 text-xs">{r.period}</span>
              </td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.revenue)}</td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.gross_profit)}</td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.ebitda)}</td>
              <td className={`py-3 px-2 text-right font-medium ${(r.net_income ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{crore(r.net_income)}</td>
              <td className="py-3 px-2 text-right text-zinc-300">{r.eps_diluted?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceTable({ rows }: { rows: BalanceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left py-2 pr-4 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Total Assets</th>
            <th className="text-right py-2 px-2 font-medium">Total Liabilities</th>
            <th className="text-right py-2 px-2 font-medium">Equity</th>
            <th className="text-right py-2 px-2 font-medium">Cash</th>
            <th className="text-right py-2 px-2 font-medium">Total Debt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
              <td className="py-3 pr-4 text-zinc-300 font-medium">{r.fiscal_year} <span className="text-zinc-500 text-xs">{r.period}</span></td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.total_assets)}</td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.total_liabilities)}</td>
              <td className="py-3 px-2 text-right text-emerald-400 font-medium">{crore(r.total_equity)}</td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.cash_and_equivalents)}</td>
              <td className="py-3 px-2 text-right text-red-400">{crore(r.total_debt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CFTable({ rows }: { rows: CFRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-wider">
            <th className="text-left py-2 pr-4 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Operating CF</th>
            <th className="text-right py-2 px-2 font-medium">Investing CF</th>
            <th className="text-right py-2 px-2 font-medium">Financing CF</th>
            <th className="text-right py-2 px-2 font-medium">Free CF</th>
            <th className="text-right py-2 px-2 font-medium">CapEx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors">
              <td className="py-3 pr-4 text-zinc-300 font-medium">{r.fiscal_year} <span className="text-zinc-500 text-xs">{r.period}</span></td>
              <td className={`py-3 px-2 text-right font-medium ${(r.operating_cash_flow ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{crore(r.operating_cash_flow)}</td>
              <td className={`py-3 px-2 text-right ${(r.investing_cash_flow ?? 0) >= 0 ? "text-emerald-400" : "text-zinc-400"}`}>{crore(r.investing_cash_flow)}</td>
              <td className="py-3 px-2 text-right text-zinc-200">{crore(r.financing_cash_flow)}</td>
              <td className={`py-3 px-2 text-right font-medium ${(r.free_cash_flow ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{crore(r.free_cash_flow)}</td>
              <td className="py-3 px-2 text-right text-red-400">{crore(r.capital_expenditures)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialsGrid({ income, balance, cashflow, loading, period, onPeriodChange }: FinancialsGridProps) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Financials</h2>
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          {(["annual", "quarterly"] as const).map((p) => (
            <button key={p} onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${period === p ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {p === "annual" ? "Annual" : "Quarterly"}
            </button>
          ))}
        </div>
      </div>
      <Tabs defaultValue="income">
        <TabsList className="bg-zinc-900 border border-zinc-800 mb-4">
          <TabsTrigger value="income" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 text-xs">Income Stmt</TabsTrigger>
          <TabsTrigger value="balance" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 text-xs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cashflow" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400 text-xs">Cash Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className="mt-0">
          {loading ? (
            <TableSkeleton />
          ) : income && income.length > 0 ? (
            <IncomeTable rows={income} />
          ) : (
            <div className="py-12 text-center text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
              No Income Statement data available for this selection.
            </div>
          )}
        </TabsContent>
        <TabsContent value="balance" className="mt-0">
          {loading ? (
            <TableSkeleton />
          ) : balance && balance.length > 0 ? (
            <BalanceTable rows={balance} />
          ) : (
            <div className="py-12 text-center text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
              No Balance Sheet data available for this selection.
            </div>
          )}
        </TabsContent>
        <TabsContent value="cashflow" className="mt-0">
          {loading ? (
            <TableSkeleton />
          ) : cashflow && cashflow.length > 0 ? (
            <CFTable rows={cashflow} />
          ) : (
            <div className="py-12 text-center text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
              No Cash Flow data available for this selection.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
