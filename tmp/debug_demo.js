const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (m) => console.log('PAGE LOG [' + m.type() + ']:', m.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.stack || err));

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => ({
    a: document.getElementById('bind-a')?.value,
    s: document.getElementById('bind-s')?.value,
    d: document.getElementById('bind-d')?.value,
    f: document.getElementById('bind-f')?.value
  }));
  console.log('BEFORE INPUTS:', before);

  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('settings-btn').click();
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    document.getElementById('bind-a').value = 'N';
    document.getElementById('bind-s').value = 'E';
    document.getElementById('bind-d').value = 'D';
    document.getElementById('bind-f').value = 'A';
    document.getElementById('save-settings-btn').click();
  });

  await page.waitForTimeout(1000);
  const overlayExists = await page.evaluate(() => !!document.getElementById('temp-demo-overlay'));
  console.log('OVERLAY EXISTS:', overlayExists);

  await browser.close();
})();