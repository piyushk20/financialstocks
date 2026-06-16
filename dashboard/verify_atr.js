(async () => {
  console.log("Testing ATR & MA Extensions scan via Next.js proxy route...");
  try {
    const res = await fetch("http://localhost:3020/api/atr-extension", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "TATAMOTORS.BO"],
        ext_sma50_threshold: 0.0,
        top_n: 5
      })
    });

    console.log("Response status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("Scan successful!");
      console.log("Matches returned:", data.matches ? data.matches.length : 0);
      console.dir(data.matches, { depth: null });
    } else {
      const text = await res.text();
      console.error("Scan failed:", text);
    }
  } catch (err) {
    console.error("Error during API verification:", err);
  }
})();
