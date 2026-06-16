import csv
import json
import os

DOWNLOADS = r"C:\Users\HP\Downloads"
NIFTY500_CSV = os.path.join(DOWNLOADS, "ind_nifty500list.csv")
MIDCAP150_CSV = os.path.join(DOWNLOADS, "ind_niftymidcap150list.csv")
SMALLCAP250_CSV = os.path.join(DOWNLOADS, "ind_niftysmallcap250list.csv")
MICROCAP250_CSV = os.path.join(DOWNLOADS, "ind_niftymicrocap250_list.csv")

def read_csv_symbols(filepath):
    symbols = set()
    rows = []
    if not os.path.exists(filepath):
        print(f"WARNING: File not found: {filepath}")
        return symbols, rows
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            sym = r.get("Symbol", "").strip()
            if sym:
                symbols.add(sym)
                rows.append(r)
    return symbols, rows

# Read all 4 files
n500_syms, n500_rows = read_csv_symbols(NIFTY500_CSV)
mid_syms, mid_rows = read_csv_symbols(MIDCAP150_CSV)
small_syms, small_rows = read_csv_symbols(SMALLCAP250_CSV)
micro_syms, micro_rows = read_csv_symbols(MICROCAP250_CSV)

print(f"Nifty 500 symbols: {len(n500_syms)}")
print(f"Midcap 150 symbols: {len(mid_syms)}")
print(f"Smallcap 250 symbols: {len(small_syms)}")
print(f"Microcap 250 symbols: {len(micro_syms)}")

# Determine market cap category
def get_cap(sym):
    if sym in micro_syms:
        return "micro"
    if sym in small_syms:
        return "small"
    if sym in mid_syms:
        return "mid"
    if sym in n500_syms:
        return "large" # Nifty 500 has large (100) + mid (150) + small (250)
    return "small"

def normalize_industry(ind):
    if not ind:
        return "Diversified"
    ind = ind.strip()
    mapping = {
        "Automobiles & Ancillaries": "Automobile and Auto Components",
        "Auto": "Automobile and Auto Components",
        "Automobile and Auto Components": "Automobile and Auto Components",
        "FMCG": "Fast Moving Consumer Goods",
        "Fast Moving Consumer Goods": "Fast Moving Consumer Goods",
        "IT": "Information Technology",
        "Information Technology": "Information Technology",
        "Pharma": "Healthcare",
        "Healthcare": "Healthcare",
        "Chemicals & Petrochemicals": "Chemicals",
        "Chemicals": "Chemicals",
        "Oil & Gas": "Oil Gas & Consumable Fuels",
        "Oil Gas & Consumable Fuels": "Oil Gas & Consumable Fuels",
        "Realty": "Realty",
        "Construction Materials": "Construction Materials",
        "Construction": "Construction",
        "Power": "Power",
        "Metals & Mining": "Metals & Mining",
        "Telecommunication": "Telecommunication",
        "Services": "Services",
        "Capital Goods": "Capital Goods",
        "Consumer Durables": "Consumer Durables",
        "Textiles": "Textiles",
        "Financial Services": "Financial Services",
    }
    return mapping.get(ind, ind)

# Merge all rows into a unified dictionary by Symbol to prevent duplicates
merged_stocks = {}

for row_list, category in [
    (n500_rows, "nifty500"),
    (mid_rows, "mid"),
    (small_rows, "small"),
    (micro_rows, "micro")
]:
    for r in row_list:
        sym = r.get("Symbol", "").strip()
        if not sym:
            continue
        
        # Determine cap
        cap = get_cap(sym)
        if category == "micro":
            cap = "micro"  # Force microcap
            
        if sym not in merged_stocks:
            merged_stocks[sym] = {
                "symbol": sym + ".NS",
                "symbol_bare": sym,
                "name": r.get("Company Name", "").strip(),
                "sector": normalize_industry(r.get("Industry", "").strip()),
                "industry": normalize_industry(r.get("Industry", "").strip()),
                "series": r.get("Series", "EQ").strip(),
                "isin_code": r.get("ISIN Code", "").strip(),
                "cap": cap
            }

stock_list = sorted(list(merged_stocks.values()), key=lambda x: x["symbol_bare"])
print(f"Total merged unique stocks: {len(stock_list)}")
print(f"Large Cap: {sum(1 for s in stock_list if s['cap'] == 'large')}")
print(f"Mid Cap: {sum(1 for s in stock_list if s['cap'] == 'mid')}")
print(f"Small Cap: {sum(1 for s in stock_list if s['cap'] == 'small')}")
print(f"Micro Cap: {sum(1 for s in stock_list if s['cap'] == 'micro')}")

# Write to nifty500.csv in comprehensive stock dash board / data
output_csv = r"c:\Users\HP\comprehnsive stock dash board\data\nifty500.csv"
with open(output_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["Company Name", "Industry", "Symbol", "Series", "ISIN Code", "Cap"])
    writer.writeheader()
    for s in stock_list:
        writer.writerow({
            "Company Name": s["name"],
            "Industry": s["industry"],
            "Symbol": s["symbol_bare"],
            "Series": s["series"],
            "ISIN Code": s["isin_code"],
            "Cap": s["cap"]
        })
print(f"Wrote {output_csv}")

# Write to nse_all.ts in financialstock dashboard src data
preamble = """/**
 * NSE Stock Universe — NSE 500 + Midcap 150 + Smallcap 250 + Microcap 250
 * Auto-generated from local CSVs.
 */

export interface StockEntry {
  symbol: string;
  name: string;
  sector: string;
  cap: "large" | "mid" | "small" | "micro";
}

export const CAP_CATEGORIES = ["large", "mid", "small", "micro"] as const;

// Commodity Futures
const COMMODITIES: StockEntry[] = [
  { symbol: "GC=F",          name: "Gold Futures",            sector: "Commodity", cap: "large" },
  { symbol: "SI=F",          name: "Silver Futures",           sector: "Commodity", cap: "large" },
  { symbol: "CL=F",          name: "Crude Oil Futures",        sector: "Commodity", cap: "large" },
  { symbol: "NG=F",          name: "Natural Gas Futures",      sector: "Commodity", cap: "large" },
  { symbol: "HG=F",          name: "Copper Futures",           sector: "Commodity", cap: "large" },
  { symbol: "GOLDBEES.NS",   name: "Gold BeES ETF",            sector: "Commodity", cap: "large" },
  { symbol: "SILVERBEES.NS", name: "Silver BeES ETF",          sector: "Commodity", cap: "large" },
];

// NSE Indices
const INDICES: StockEntry[] = [
  { symbol: "^NSEI",      name: "Nifty 50",          sector: "Index", cap: "large" },
  { symbol: "^NSEBANK",   name: "Bank Nifty",         sector: "Index", cap: "large" },
  { symbol: "^CNXIT",     name: "Nifty IT",           sector: "Index", cap: "large" },
  { symbol: "^CNXPHARMA", name: "Nifty Pharma",       sector: "Index", cap: "large" },
  { symbol: "^CNXFMCG",   name: "Nifty FMCG",         sector: "Index", cap: "large" },
  { symbol: "^CNXINFRA",  name: "Nifty Infra",        sector: "Index", cap: "large" },
  { symbol: "^CNXENERGY", name: "Nifty Energy",       sector: "Index", cap: "large" },
  { symbol: "^CNXAUTO",   name: "Nifty Auto",         sector: "Index", cap: "large" },
  { symbol: "^CNXMETAL",  name: "Nifty Metal",        sector: "Index", cap: "large" },
  { symbol: "^CNXREALTY", name: "Nifty Realty",       sector: "Index", cap: "large" },
  { symbol: "^CNXPSUBANK",name: "Nifty PSU Bank",     sector: "Index", cap: "large" },
  { symbol: "^CNXSERVICE",name: "Nifty Serv Sector",  sector: "Index", cap: "large" },
  { symbol: "DEFANCE.NS", name: "Nifty Defence (ETF)",sector: "Defence", cap: "large" },
];

export const NSE_EQUITIES: StockEntry[] = [
"""

ts_lines = [preamble]
for s in stock_list:
    name_escaped = s["name"].replace('"', '\\"')
    ts_lines.append(f'  {{ symbol: "{s["symbol"]}", name: "{name_escaped}", sector: "{s["sector"]}", cap: "{s["cap"]}" }},\n')

ts_lines.append("];\n\n")
ts_lines.append("export const NSE_ALL: StockEntry[] = [...COMMODITIES, ...INDICES, ...NSE_EQUITIES];\n\n")
ts_lines.append("export const NSE500 = NSE_ALL;\n\n")
ts_lines.append("export const SECTORS = [...new Set(NSE_ALL.map(s => s.sector))].sort();\n")

output_ts = r"c:\Users\HP\financialstock\dashboard\src\data\nse_all.ts"
with open(output_ts, "w", encoding="utf-8") as f:
    f.writelines(ts_lines)
print(f"Wrote {output_ts}")
