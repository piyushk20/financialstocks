/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:4000...');
  try {
    await page.goto('http://localhost:4000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000); // Wait for boot
    
    // Check for Lemon Tree
    console.log('Checking for Lemon Tree Hotels...');
    await page.click('button[role="combobox"]');
    await page.fill('input[placeholder*="Search"]', 'Lemon Tree');
    await page.waitForTimeout(2000);
    await page.click('[role="option"]:has-text("Lemon Tree Hotels")');
    await page.waitForTimeout(3000); 
    await page.screenshot({ path: path.join(__dirname, 'lemon_tree_verify.png') });
    
    // Check for Nifty FMCG
    console.log('Checking for Nifty FMCG...');
    await page.click('button[role="combobox"]');
    await page.fill('input[placeholder*="Search"]', 'Nifty FMCG');
    await page.waitForTimeout(2000);
    await page.click('[role="option"]:has-text("Nifty FMCG")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(__dirname, 'nifty_fmcg_verify.png') });

    const logs = await page.evaluate(() => {
        return window.performance.getEntriesByType('resource').map(r => r.name);
    });
    console.log('Resource logs captured.');

  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    await browser.close();
  }
})();
