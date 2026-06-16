"""
Generate updated stock lists for Financial Stocks dashboard.
Downloads NSE 500, Midcap 150, Smallcap 250, Microcap 250 from NSE India.
Outputs:
  - updated nse500.ts  (existing NSE500 + midcap/smallcap/microcap tagged)
  - updated nifty500.csv (for InvestorsWay backend)
  - midcap.ts, smallcap.ts, microcap.ts
"""

import requests
import csv
import json
import io
import os
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://www.nseindia.com/",
}

# NSE index CSV download URLs
NSE_INDICES = {
    "nifty500":   "https://nseindia.com/api/equity-stockIndices?index=NIFTY%20500",
    "midcap150":  "https://nseindia.com/api/equity-stockIndices?index=NIFTY%20MIDCAP%20150",
    "smallcap250":"https://nseindia.com/api/equity-stockIndices?index=NIFTY%20SMALLCAP%20250",
    "microcap250":"https://nseindia.com/api/equity-stockIndices?index=NIFTY%20MICROCAP%20250",
}

# CSV download links from NSE for index constituents
NSE_CSV_URLS = {
    "nifty500":    "https://nseindia.com/content/indices/ind_nifty500list.csv",
    "midcap150":   "https://nseindia.com/content/indices/ind_niftymidcap150list.csv",
    "smallcap250": "https://nseindia.com/content/indices/ind_niftysmallcap250list.csv",
    "microcap250": "https://nseindia.com/content/indices/ind_niftymicrocap250list.csv",
}

session = requests.Session()

def fetch_nse_csv(name, url):
    """Fetch NSE index constituent CSV, return list of dicts."""
    print(f"Fetching {name} from {url} ...")
    try:
        # First get homepage to set cookies
        session.get("https://www.nseindia.com", headers=HEADERS, timeout=10)
        time.sleep(1)
        resp = session.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  ERROR: HTTP {resp.status_code} for {name}")
            return []
        text = resp.text
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        print(f"  Got {len(rows)} rows")
        return rows
    except Exception as e:
        print(f"  FAILED: {e}")
        return []

def symbol_ns(sym):
    """Append .NS if not already suffixed."""
    sym = sym.strip()
    if sym and not sym.endswith(".NS") and not sym.endswith(".BO"):
        return sym + ".NS"
    return sym

def normalize_industry(ind):
    """Normalize industry/sector name."""
    mapping = {
        "IT": "Information Technology",
        "FMCG": "Fast Moving Consumer Goods",
        "Financial Services": "Financial Services",
        "Auto": "Automobile and Auto Components",
        "Automobiles & Ancillaries": "Automobile and Auto Components",
        "Pharma": "Healthcare",
        "Chemicals & Petrochemicals": "Chemicals",
        "Oil & Gas": "Oil Gas & Consumable Fuels",
        "Oil Gas & Consumable Fuels": "Oil Gas & Consumable Fuels",
        "Realty": "Realty",
        "Construction": "Construction",
        "Construction Materials": "Construction Materials",
        "Power": "Power",
        "Metals & Mining": "Metals & Mining",
        "Telecommunication": "Telecommunication",
        "Services": "Services",
        "Capital Goods": "Capital Goods",
        "Consumer Durables": "Consumer Durables",
        "Textiles": "Textiles",
    }
    return mapping.get(ind.strip(), ind.strip())

def build_entry(row, cap_category):
    """Build a StockEntry dict from an NSE CSV row."""
    # NSE CSV columns: Company Name, Industry, Symbol, Series, ISIN Code
    sym_raw = row.get("Symbol", "").strip()
    name = row.get("Company Name", "").strip()
    industry = normalize_industry(row.get("Industry", "").strip())
    series = row.get("Series", "EQ").strip()
    isin = row.get("ISIN Code", "").strip()
    if not sym_raw:
        return None
    return {
        "symbol": symbol_ns(sym_raw),
        "symbol_bare": sym_raw,
        "name": name,
        "sector": industry,
        "industry": industry,
        "series": series,
        "isin_code": isin,
        "cap": cap_category,  # "large", "mid", "small", "micro"
    }

# --- FETCH ALL LISTS ---
nse500_rows    = fetch_nse_csv("Nifty 500",        NSE_CSV_URLS["nifty500"])
midcap_rows    = fetch_nse_csv("Nifty Midcap 150",  NSE_CSV_URLS["midcap150"])
smallcap_rows  = fetch_nse_csv("Nifty Smallcap 250",NSE_CSV_URLS["smallcap250"])
microcap_rows  = fetch_nse_csv("Nifty Microcap 250",NSE_CSV_URLS["microcap250"])

# --- BUILD SYMBOL SETS ---
mid_symbols    = {r.get("Symbol","").strip() for r in midcap_rows}
small_symbols  = {r.get("Symbol","").strip() for r in smallcap_rows}
micro_symbols  = {r.get("Symbol","").strip() for r in microcap_rows}

def cap_for(sym_bare):
    if sym_bare in micro_symbols:  return "micro"
    if sym_bare in small_symbols:  return "small"
    if sym_bare in mid_symbols:    return "mid"
    return "large"

# --- Build nse500 entries ---
nse500_entries = []
for row in nse500_rows:
    sym_bare = row.get("Symbol","").strip()
    cap = cap_for(sym_bare)
    e = build_entry(row, cap)
    if e:
        nse500_entries.append(e)

# --- Build additional entries for mid/small/micro NOT in nse500 ---
nse500_bare = {e["symbol_bare"] for e in nse500_entries}

midcap_extra, smallcap_extra, microcap_extra = [], [], []
for row in midcap_rows:
    sym = row.get("Symbol","").strip()
    if sym not in nse500_bare:
        e = build_entry(row, "mid")
        if e:
            midcap_extra.append(e)

for row in smallcap_rows:
    sym = row.get("Symbol","").strip()
    if sym not in nse500_bare and sym not in {e["symbol_bare"] for e in midcap_extra}:
        e = build_entry(row, "small")
        if e:
            smallcap_extra.append(e)

for row in microcap_rows:
    sym = row.get("Symbol","").strip()
    existing = nse500_bare | {e["symbol_bare"] for e in midcap_extra} | {e["symbol_bare"] for e in smallcap_extra}
    if sym not in existing:
        e = build_entry(row, "micro")
        if e:
            microcap_extra.append(e)

all_entries = nse500_entries + midcap_extra + smallcap_extra + microcap_extra

print(f"\nTotal unique stocks: {len(all_entries)}")
print(f"  NSE500: {len(nse500_entries)}")
print(f"  Midcap extra: {len(midcap_extra)}")
print(f"  Smallcap extra: {len(smallcap_extra)}")
print(f"  Microcap extra: {len(microcap_extra)}")

# --- WRITE nse500.ts ---
preamble = """/**
 * NSE Stock Universe — NSE 500 + Midcap 150 + Smallcap 250 + Microcap 250
 * Auto-generated. Includes cap category: "large" | "mid" | "small" | "micro"
 */

export interface StockEntry {
  symbol: string;
  name: string;
  sector: string;
  cap: "large" | "mid" | "small" | "micro";
}

export const SECTORS = [...new Set(NSE_ALL.map(s => s.sector))].sort();
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

"""

if not all_entries:
    print("\nWARNING: No NSE data fetched from web. Writing fallback note.")
    with open("generate_stock_lists_FAILED.txt", "w") as f:
        f.write("NSE CSV fetch failed. Please manually download the CSV files.\n")
else:
    # Write nse_all.ts
    ts_lines = [preamble]
    ts_lines.append("export const NSE_EQUITIES: StockEntry[] = [\n")
    for e in all_entries:
        ts_lines.append(f'  {{ symbol: "{e["symbol"]}", name: "{e["name"].replace(chr(34), chr(39))}", sector: "{e["sector"]}", cap: "{e["cap"]}" }},\n')
    ts_lines.append("];\n\n")
    ts_lines.append("// Main export — all stocks including commodities, indices, and equities\n")
    ts_lines.append("export const NSE_ALL: StockEntry[] = [...COMMODITIES, ...INDICES, ...NSE_EQUITIES];\n\n")
    ts_lines.append("// Backward compat alias\n")
    ts_lines.append("export const NSE500 = NSE_ALL;\n")

    out_path = os.path.join(os.path.dirname(__file__), "dashboard", "src", "data", "nse_all.ts")
    with open(out_path, "w", encoding="utf-8") as f:
        f.writelines(ts_lines)
    print(f"\nWrote {out_path}")

    # Write updated CSV for InvestorsWay
    csv_out = os.path.join(os.path.dirname(__file__), "..", "comprehnsive stock dash board", "data", "nifty_all.csv")
    with open(csv_out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Company Name", "Industry", "Symbol", "Series", "ISIN Code", "Cap"])
        writer.writeheader()
        for e in all_entries:
            writer.writerow({
                "Company Name": e["name"],
                "Industry": e["industry"],
                "Symbol": e["symbol_bare"],
                "Series": e["series"],
                "ISIN Code": e["isin_code"],
                "Cap": e["cap"],
            })
    print(f"Wrote {csv_out} ({len(all_entries)} rows)")

    # Print summary JSON for verification
    summary = {
        "total": len(all_entries),
        "large": sum(1 for e in all_entries if e["cap"] == "large"),
        "mid": sum(1 for e in all_entries if e["cap"] == "mid"),
        "small": sum(1 for e in all_entries if e["cap"] == "small"),
        "micro": sum(1 for e in all_entries if e["cap"] == "micro"),
    }
    print(f"\nSummary: {json.dumps(summary, indent=2)}")
