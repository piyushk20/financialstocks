const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[ERROR] ${msg.text()}`);
  });

  // Test Financial Stocks (port 3020) - Cash Flow tab  
  console.log('=== Financial Stocks (port 3020) ===');
  await page.goto('http://localhost:3020', { waitUntil: 'domcontentloaded', timeout: 20000 });
  
  // Wait for hydration and data load
  await page.waitForTimeout(8000);

  // Click Cash Flow sub-tab (Financials is default)
  try {
    await page.click('text=Cash Flow');
    await page.waitForTimeout(3000);
    console.log('Clicked Cash Flow tab');
  } catch(e) {
    console.log('Cash Flow click failed:', e.message);
  }

  const os = require('os');
  const screenshotPath = path.join(os.tmpdir(), 'screenshot_fs_cf_final.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
})();
