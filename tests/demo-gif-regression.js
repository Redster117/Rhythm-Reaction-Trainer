const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const src = await page.locator('#demo-gif').evaluate((img) => img.getAttribute('src'));
  if (!src || !src.includes('demo.gif')) {
    throw new Error(`Expected the demo gif to use docs/demo.gif, got ${src}`);
  }

  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('settings-btn').click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.getElementById('bind-a').value = 'N';
    document.getElementById('bind-s').value = 'E';
    document.getElementById('bind-d').value = 'D';
    document.getElementById('bind-f').value = 'A';
    document.getElementById('save-settings-btn').click();
  });
  await page.waitForTimeout(1000);

  const overlayExists = await page.evaluate(() => !!document.getElementById('temp-demo-overlay'));
  if (!overlayExists) {
    throw new Error('Expected the easter egg overlay to appear after saving the activation keybind sequence.');
  }

  console.log('PASS demo gif uses the expected demo.gif asset and unlocks the easter egg overlay.');
  await browser.close();
})();
