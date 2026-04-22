import requests

def test_wma():
    url = "http://127.0.0.1:8001/wma44-crossover"
    payload = {
        "symbols": ["RELIANCE.NS", "TCS.NS", "INFY.NS"],
        "top_n": 5
    }
    try:
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_wma()
