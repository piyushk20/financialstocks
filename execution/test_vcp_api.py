
import requests
import json

def test_vcp_scanner_api():
    url = "http://localhost:8001/vcp-scanner"
    # Test with a mix of symbols
    payload = {
        "symbols": ["RELIANCE.NS", "TCS.NS", "GC=F", "SI=F"],
        "index_symbol": "^NSEI",
        "top_n": 10
    }
    print(f"Testing VCP Scanner API: {url}")
    try:
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            matches = data.get("matches", [])
            print(f"Found {len(matches)} matches")
            for m in matches:
                print(f"- {m['symbol']}: RS={m['rs_score']}, Tight={m['is_tight']}")
            
            # Check if commodities are present
            commodity_matches = [m for m in matches if "=F" in m['symbol']]
            if len(commodity_matches) == 0:
                print("Note: No commodities found in results (expected if code filters them out).")
            else:
                print(f"Found {len(commodity_matches)} commodity matches.")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_vcp_scanner_api()
