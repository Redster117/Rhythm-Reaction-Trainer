const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const demoGif = document.getElementById('demo-gif');
    demoGif.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    ['KeyT', 'KeyW', 'KeyO', 'KeyF', 'KeyO', 'KeyR', 'KeyT'].forEach((code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    });
  });
  await page.waitForTimeout(1000);

  const overlayState = await page.evaluate(() => {
    const img = document.getElementById('spinning-heavy-media');
    const closeButton = document.querySelector('#spinning-heavy-overlay .easter-close');
    return {
      overlayExists: !!document.getElementById('spinning-heavy-overlay'),
      src: img ? img.getAttribute('src') : null,
      hasCloseButton: !!closeButton
    };
  });

  if (!overlayState.overlayExists) {
    throw new Error('Expected the spinning-heavy overlay to appear.');
  }
  if (overlayState.src !== 'docs/kazotsky-kick-demoman.gif') {
    throw new Error(`Expected the overlay to use docs/kazotsky-kick-demoman.gif, got ${overlayState.src}`);
  }
  if (!overlayState.hasCloseButton) {
    throw new Error('Expected the spinning-heavy overlay to include a visible close button.');
  }

  console.log('PASS spinning-heavy overlay uses the Demoman asset and shows a close button.');
  await browser.close();
})();
