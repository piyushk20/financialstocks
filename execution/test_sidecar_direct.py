import requests

def test_sidecar_commodity():
    symbol = "GC=F" # Gold Futures
    url = f"http://localhost:8001/history?ticker={symbol}"
    print(f"Requesting Sidecar: {url}")
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if "prices" in data and len(data["prices"]) > 0:
                print(f"Success! Found {len(data['prices'])} bars for {symbol}")
                print(f"Latest Price: {data['prices'][-1].get('close')}")
            else:
                print("No data in response")
        else:
            print(f"Error Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_sidecar_commodity()
