const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[ERROR]: ${err.toString()}`));

  console.log('Opening Financial Stocks dashboard at http://localhost:3020...');
  await page.goto('http://localhost:3020', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const os = require('os');
  const screenshotDir = os.tmpdir();

  console.log('Navigating to Multi-Year Breakout tab...');
  // Use text match or locator to find our tab trigger
  await page.click('text=Multi-Year Breakout');
  await page.waitForTimeout(2000);

  // Take screenshot before scanning
  const initialScreenshot = path.join(screenshotDir, 'screenshot_breakout_initial.png');
  await page.screenshot({ path: initialScreenshot, fullPage: false });
  console.log(`Saved initial tab screenshot to ${initialScreenshot}`);

  // Run Breakout Scan
  console.log('Running Multi-Year Breakout Scan...');
  await page.click('button:has-text("Run Multi-Year Breakout Scan")');
  
  // Wait up to 45 seconds for results to load (since bulk downloading and calculation takes some time)
  console.log('Waiting for scan results...');
  await page.waitForTimeout(20000); 

  const resultsScreenshot = path.join(screenshotDir, 'screenshot_breakout_results.png');
  await page.screenshot({ path: resultsScreenshot, fullPage: false });
  console.log(`Saved results screenshot to ${resultsScreenshot}`);

  await browser.close();
  console.log('E2E validation finished successfully!');
})();
