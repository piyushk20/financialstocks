const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console logs
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
  });

  console.log('Navigating to http://localhost:3020...');
  try {
    const response = await page.goto('http://localhost:3020', { 
      waitUntil: 'domcontentloaded',
      timeout: 15000 
    });

    console.log(`Navigation status: ${response.status()}`);
    
    // Wait for the UI component/charts to load and perform client-side fetches
    console.log('Waiting 5 seconds for page updates...');
    await page.waitForTimeout(5000);

    // Save screenshot in system temp folder outside the watched workspace to avoid watched reload
    const os = require('os');
    const screenshotPath = path.join(os.tmpdir(), 'dashboard_main.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

  } catch (err) {
    console.error('Error during browser verification:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
