const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__audioInstances = [];
    class MockAudio {
      constructor(src = '') {
        this._src = src;
        this.loop = false;
        this.volume = 1;
        this.paused = true;
        this.currentTime = 0;
        this.playCalls = 0;
        this.pauseCalls = 0;
        window.__audioInstances.push(this);
      }
      set src(value) {
        this._src = value;
      }
      get src() {
        return this._src;
      }
      play() {
        this.paused = false;
        this.playCalls += 1;
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
      }
    }
    window.Audio = MockAudio;
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    localStorage.clear();
    document.getElementById('settings-btn').click();
  });
  await page.waitForTimeout(300);

  const acceptValue = await page.locator('#bg-music-file').getAttribute('accept');
  if (acceptValue !== 'audio/*,video/*') {
    throw new Error(`Expected background music input to accept audio and video files, got ${acceptValue}`);
  }

  await page.locator('#bg-music-toggle').check();
  await page.setInputFiles('#bg-music-file', {
    name: 'song1.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('fake audio 1')
  });
  await page.waitForTimeout(200);

  await page.setInputFiles('#bg-music-file', {
    name: 'song2.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fake video 2')
  });
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => ({
    count: window.__audioInstances.length,
    firstPauseCalls: window.__audioInstances[0]?.pauseCalls || 0,
    firstWasPaused: window.__audioInstances[0]?.paused ?? null
  }));

  if (result.count < 2) {
    throw new Error(`Expected at least 2 Audio instances, got ${result.count}`);
  }
  if (result.firstPauseCalls < 1) {
    throw new Error(`Expected the first audio instance to be paused when a new file is selected, got ${result.firstPauseCalls}`);
  }
  if (result.firstWasPaused !== true) {
    throw new Error(`Expected the first audio instance to be paused after switching files, got ${result.firstWasPaused}`);
  }

  console.log('PASS background music switching stops the previous playback and accepts audio/video files.');
  await browser.close();
})();
