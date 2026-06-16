const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching browser for EMA Crossover verification...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[ERROR]: ${err.toString()}`));

  console.log('Opening Financial Stocks dashboard at http://localhost:3020...');
  try {
    await page.goto('http://localhost:3020', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Test EMA Crossover tab
    console.log('Navigating to EMA Crossover tab...');
    await page.click('text=EMA 10/20 Cross');
    await page.waitForTimeout(2000);

    // Verify select is present
    console.log('Checking Universe Select...');
    await page.selectOption('select', 'nifty50');
    await page.waitForTimeout(1000);

    // Run EMA Scan
    console.log('Running EMA Crossover Scan...');
    await page.click('button:has-text("Run EMA 10/20 Crossover Scan")');
    
    console.log('Waiting 15 seconds for calculations and rendering to complete...');
    await page.waitForTimeout(15000);

    // Take screenshot of scan results
    const os = require('os');
    const screenshotPath = path.join(os.tmpdir(), 'screenshot_ema_crossover.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved EMA Crossover screenshot to ${screenshotPath}`);

  } catch (err) {
    console.error('Error during EMA Crossover verification:', err);
  } finally {
    await browser.close();
    console.log('Done!');
  }
})();
