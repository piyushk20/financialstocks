
import sys
import os
import pandas as pd
import yfinance as yf

# Add the parent directory to sys.path to import yfinance_sidecar
sys.path.append(os.path.join(os.getcwd(), 'mcp-server'))

from yfinance_sidecar import _process_vcp_batch, _scan_vcp, VCPRequest

def test_vcp_batch():
    print("Testing _process_vcp_batch...")
    symbols = ["RELIANCE.NS", "TCS.NS"]
    index_symbol = "^NSEI"
    
    # Test with valid symbols
    results = _process_vcp_batch(symbols, index_symbol)
    print(f"Results type: {type(results)}")
    if isinstance(results, tuple):
        print(f"BUG CONFIRMED: _process_vcp_batch returned a tuple: {results}")
    else:
        print(f"Results count: {len(results)}")

def test_commodity_exclusion():
    print("\nTesting commodity exclusion in _scan_vcp...")
    params = VCPRequest(symbols=["GC=F", "SI=F"], index_symbol="^NSEI", top_n=50)
    results = _scan_vcp(params)
    print(f"Scan results for commodities: {len(results)}")
    if len(results) == 0:
        print("CONFIRMED: Commodities are excluded.")
    else:
        print("Commodities are NOT excluded (unexpected based on code review).")

if __name__ == "__main__":
    try:
        test_vcp_batch()
    except Exception as e:
        print(f"Error in test_vcp_batch: {e}")
        
    try:
        test_commodity_exclusion()
    except Exception as e:
        print(f"Error in test_commodity_exclusion: {e}")
