import requests

def test_commodity_data():
    symbol = "GC=F" # Gold Futures
    url = f"http://localhost:3000/api/technicals/{symbol}"
    print(f"Requesting: {url}")
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if "dates" in data and len(data["dates"]) > 0:
                print(f"Success! Found {len(data['dates'])} bars for {symbol}")
                print(f"Latest Price: {data.get('pivots', {}).get('prevClose')}")
            else:
                print("No data in response")
        else:
            print(f"Error Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_commodity_data()
