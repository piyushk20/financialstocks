import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8001"

def test_endpoint(name, path, params=None, data=None):
    try:
        print(f"Testing {name}...", end=" ", flush=True)
        url = f"{BASE_URL}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        
        req = urllib.request.Request(url)
        if data:
            req.add_header('Content-Type', 'application/json')
            js_data = json.dumps(data).encode('utf-8')
            req.data = js_data
            req.method = 'POST'
            
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status == 200:
                print("OK")
                return True
            else:
                print(f"FAILED (Status {response.status})")
                return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def main():
    print("--- FinceptTerminal Sidecar Verification ---")
    
    # 1. Health
    h = test_endpoint("Sidecar Health", "/health")
    
    # 2. Snapshot (Reliance)
    s = test_endpoint("Reliance Snapshot", "/snapshot", {"ticker": "RELIANCE.NS"})
    
    # 3. History (Reliance)
    hi = test_endpoint("History", "/history", {"ticker": "RELIANCE.NS", "period": "1mo"})
    
    # 4. Financials (Reliance)
    f = test_endpoint("Financials", "/financials", {"ticker": "RELIANCE.NS"})

    # 5. VCP Scanner (POST)
    vcp = test_endpoint("VCP Scanner", "/vcp-scanner", data={"symbols": ["RELIANCE.NS", "TCS.NS"]})
    
    # 6. Momentum Burst (POST)
    mom = test_endpoint("Momentum Burst", "/momentum-burst", data={"symbols": ["RELIANCE.NS", "TCS.NS"]})

    if all([h, s, hi, f, vcp, mom]):
        print("\nALL SIDECAR CORE FUNCTIONS VERIFIED.")
    else:
        print("\nSOME SIDECAR FUNCTIONS FAILED. CHECK SIDECAR LOGS.")
        sys.exit(1)

if __name__ == "__main__":
    main()
