const NIFTY50_SYMBOLS = [
  "ADANIENT.NS", "ADANIPORTS.NS", "APOLLOHOSP.NS", "ASIANPAINT.NS", "AXISBANK.NS",
  "BAJAJ-AUTO.NS", "BAJFINANCE.NS", "BAJAJFINSV.NS", "BPCL.NS", "BHARTIARTL.NS",
  "BRITANNIA.NS", "CIPLA.NS", "COALINDIA.NS", "DIVISLAB.NS", "DRREDDY.NS",
  "EICHERMOT.NS", "GRASIM.NS", "HCLTECH.NS", "HDFCBANK.NS", "HDFCLIFE.NS",
  "HEROMOTOCO.NS", "HINDALCO.NS", "HINDUNILVR.NS", "ICICIBANK.NS", "ITC.NS",
  "INDUSINDBK.NS", "INFY.NS", "JSWSTEEL.NS", "KOTAKBANK.NS", "LT.NS",
  "M&M.NS", "MARUTI.NS", "NTPC.NS", "NESTLEIND.NS", "ONGC.NS",
  "POWERGRID.NS", "RELIANCE.NS", "SBILIFE.NS", "SBIN.NS", "SUNPHARMA.NS",
  "TCS.NS", "TATACONSUM.NS", "TATAELXSI.NS", "TATASTEEL.NS", "TECHM.NS",
  "TITAN.NS", "UPL.NS", "ULTRACEMCO.NS", "WIPRO.NS"
];

(async () => {
  console.log('Sending bulk scan request for Nifty 50 with tolerance_pct: 10.0...');
  
  const payload = {
    symbols: NIFTY50_SYMBOLS,
    breakout: "1y",
    tf: "daily",
    tolerance_pct: 10.0, // 10% tolerance
    strict: false,
    no_fundamentals: false,
    top_n: 10
  };

  try {
    const res = await fetch('http://localhost:3020/api/breakout-scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`API response failed with status ${res.status}:`, await res.text());
      return;
    }

    const data = await res.json();
    console.log('\n--- API Output Success! ---');
    console.log(`Returned Candidates Count: ${data.results?.length ?? 0}`);
    console.log('Top Candidates:');
    data.results.forEach((cand, idx) => {
      console.log(`${idx + 1}. Symbol: ${cand.symbol}, Sector: ${cand.sector}, Close: ₹${cand.price}, Score: ${cand.score}, Dist Top: ${cand.dist_top}%`);
    });
  } catch (err) {
    console.error('Error fetching output:', err);
  }
})();
