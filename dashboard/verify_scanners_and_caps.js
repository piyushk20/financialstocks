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

  // Define screenshot directory in the system temp folder completely outside the watched workspace to prevent Hot Module Reloads during tests
  const os = require('os');
  const screenshotDir = os.tmpdir();

  // Take screenshot of main page with StockPicker
  const mainScreenshot = path.join(screenshotDir, 'screenshot_main_picker.png');
  await page.screenshot({ path: mainScreenshot, fullPage: false });
  console.log(`Saved main page screenshot to ${mainScreenshot}`);

  // Test EP Scanner tab and cap choices
  console.log('Navigating to EP Scanner tab...');
  await page.click('text=EP Scanner');
  await page.waitForTimeout(2000);

  // Select "Mid Cap Stocks" in Universe dropdown
  console.log('Selecting Mid Cap Universe in EP Scanner...');
  await page.selectOption('select', 'mid');
  await page.waitForTimeout(1000);

  // Run EP Scan
  console.log('Running EP Scan...');
  await page.click('button:has-text("Run EP Scan")');
  await page.waitForTimeout(10000); // wait for EP scan results

  const epScreenshot = path.join(screenshotDir, 'screenshot_ep_scan.png');
  await page.screenshot({ path: epScreenshot, fullPage: false });
  console.log(`Saved EP scan screenshot to ${epScreenshot}`);

  // Test VCP Scanner tab and cap choices
  console.log('Navigating to VCP Scanner tab...');
  await page.click('text=VCP & RS Scan');
  await page.waitForTimeout(2000);

  // Select "Small Cap Stocks" in Universe dropdown
  console.log('Selecting Small Cap Universe in VCP Scanner...');
  const vcpDropdown = await page.$('select');
  if (vcpDropdown) {
    await vcpDropdown.selectOption('small');
  }
  await page.waitForTimeout(1000);

  // Run VCP Scan
  console.log('Running VCP Scan...');
  await page.click('button:has-text("Run VCP Scan")');
  await page.waitForTimeout(10000); // wait for scan results

  const vcpScreenshot = path.join(screenshotDir, 'screenshot_vcp_scan.png');
  await page.screenshot({ path: vcpScreenshot, fullPage: false });
  console.log(`Saved VCP scan screenshot to ${vcpScreenshot}`);

  // Test ORB Scanner tab and cap choices
  console.log('Navigating to ORB Scanner tab...');
  await page.click('text=15m ORB');
  await page.waitForTimeout(2000);

  // Wait for initial scan to complete so button becomes active and text changes back to "Run ORB Scanner"
  console.log('Waiting for initial ORB scan to complete...');
  await page.waitForSelector('button:has-text("Run ORB Scanner")', { timeout: 60000 });

  // Select "Micro Cap Stocks" in Universe dropdown
  console.log('Selecting Micro Cap Universe in ORB Scanner...');
  const orbDropdowns = await page.$$('select');
  if (orbDropdowns.length > 0) {
    // The first select is typically the universe dropdown
    await orbDropdowns[0].selectOption('micro');
  }
  await page.waitForTimeout(1000);

  // Run ORB Scan
  console.log('Running ORB Scan...');
  await page.click('button:has-text("Run ORB Scanner")');
  await page.waitForTimeout(15000); // wait for scan results

  const orbScreenshot = path.join(screenshotDir, 'screenshot_orb_scan.png');
  await page.screenshot({ path: orbScreenshot, fullPage: false });
  console.log(`Saved ORB scan screenshot to ${orbScreenshot}`);

  // Test WMA Scanner tab and cap choices
  console.log('Navigating to WMA Scanner tab...');
  await page.click('text=WMA 44');
  await page.waitForTimeout(2000);

  // Wait for initial scan to complete so button becomes active and text changes back to "Run WMA + RSI Scan"
  console.log('Waiting for initial WMA scan to complete...');
  await page.waitForSelector('button:has-text("Run WMA + RSI Scan")', { timeout: 60000 });

  // Select "Large Cap Stocks" in Universe dropdown
  console.log('Selecting Large Cap Universe in WMA Scanner...');
  const wmaDropdown = await page.$('select');
  if (wmaDropdown) {
    await wmaDropdown.selectOption('large');
  }
  await page.waitForTimeout(1000);

  // Run WMA Scan
  console.log('Running WMA Scan...');
  await page.click('button:has-text("Run WMA + RSI Scan")');
  await page.waitForTimeout(15000); // wait for scan results

  const wmaScreenshot = path.join(screenshotDir, 'screenshot_wma_scan.png');
  await page.screenshot({ path: wmaScreenshot, fullPage: false });
  console.log(`Saved WMA scan screenshot to ${wmaScreenshot}`);

  await browser.close();
  console.log('Done!');
})();
