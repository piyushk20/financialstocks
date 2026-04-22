import requests
import json

def test_wma_nifty50():
    url = "http://127.0.0.1:8001/wma44-crossover"
    # Just a few symbols from Nifty 50 that might have crossed
    symbols = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LT.NS", "AXISBANK.NS"]
    payload = {
        "symbols": symbols,
        "top_n": 10
    }
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Matches: {len(response.json().get('matches', []))}")
        if response.json().get('matches'):
            print(json.dumps(response.json()['matches'], indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_wma_nifty50()
