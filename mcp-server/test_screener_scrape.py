import sys
import requests
from bs4 import BeautifulSoup

# Reconfigure stdout to use UTF-8
sys.stdout.reconfigure(encoding='utf-8')

def scrape_screener(symbol):
    # Strip suffix if any (.NS or .BO)
    symbol_clean = symbol.split(".")[0].upper()
    url = f"https://www.screener.in/company/{symbol_clean}/consolidated/"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
    
    print(f"Fetching: {url}")
    session = requests.Session()
    response = session.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    if response.status_code != 200:
        # Fallback to non-consolidated
        url = f"https://www.screener.in/company/{symbol_clean}/"
        print(f"Fetching fallback: {url}")
        response = session.get(url, headers=headers)
        print(f"Fallback Status Code: {response.status_code}")
        if response.status_code != 200:
            return None
            
    soup = BeautifulSoup(response.text, "html.parser")
    
    # Extract key ratios
    ratios = {}
    for li in soup.select("#top-ratios li"):
        name = li.select_one(".name")
        value = li.select_one(".value")
        if name and value:
            name_text = name.text.strip()
            # Clean value text (remove extra spaces and newlines)
            val_text = " ".join(value.text.split())
            ratios[name_text] = val_text
            
    return ratios

if __name__ == "__main__":
    data = scrape_screener("RELIANCE.NS")
    print("RELIANCE ratios:")
    print(repr(data))
    data_tcs = scrape_screener("TCS")
    print("\nTCS ratios:")
    print(repr(data_tcs))
