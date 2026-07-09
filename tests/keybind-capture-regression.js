const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('settings-btn').click();
  });
  await page.waitForTimeout(300);

  const bindInput = page.locator('#bind-a');
  await bindInput.click();
  await page.keyboard.press('KeyD');
  await page.waitForTimeout(100);

  const capturedValue = await bindInput.inputValue();
  const hasCaptureClass = await bindInput.evaluate((element) => element.classList.contains('capturing'));

  if (capturedValue !== 'D') {
    throw new Error(`Expected keybind input to update to D after pressing a key, got ${capturedValue}`);
  }
  if (hasCaptureClass) {
    throw new Error('Expected keybind capture mode to end after assigning a key.');
  }

  console.log('PASS keybind capture replaces the selected binding with a single keypress.');
  await browser.close();
})();
