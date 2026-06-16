const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching browser for ATR Extensions verification...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
  });

  console.log('Navigating to http://localhost:3020...');
  try {
    await page.goto('http://localhost:3020', { 
      waitUntil: 'domcontentloaded',
      timeout: 20000 
    });

    console.log('Waiting for hydration...');
    await page.waitForTimeout(5000);

    console.log('Clicking "ATR Extensions" tab trigger...');
    await page.click('text=ATR Extensions');
    
    console.log('Waiting 8 seconds for calculations and rendering to complete...');
    await page.waitForTimeout(8000);

    const os = require('os');
    const screenshotPath = path.join(os.tmpdir(), 'screenshot_atr_extensions.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to ${screenshotPath}`);

  } catch (err) {
    console.error('Error during browser verification:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
