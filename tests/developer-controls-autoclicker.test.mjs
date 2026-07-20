import assert from 'node:assert/strict';
import { DeveloperControls } from '../src/developerControls.js';
import { startBeatClick } from '../src/modes/beatclick.js';
import startKeyPress from '../src/modes/keypress.js';

class MockElement {
  constructor() {
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.id = '';
    this.className = '';
    this.classList = {
      contains: () => false,
      add: () => {},
      remove: () => {}
    };
    this.textContent = '';
    this.hidden = false;
    this.width = 800;
    this.height = 500;
    this.clientWidth = 800;
    this.clientHeight = 500;
    this.complete = true;
    this.naturalWidth = 1;
  }
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  setAttribute() {}
  removeAttribute() {}
  getContext() {
    return {
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      fillText() {},
      measureText() { return { width: 10 }; }
    };
  }
}

const countdownElement = new MockElement();
const guideCanvasElement = new MockElement();
const patternCanvasElement = new MockElement();
patternCanvasElement.getContext = () => ({
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  beginPath() {},
  arc() {},
  fill() {},
  stroke() {},
  moveTo() {},
  lineTo() {},
  fillText() {},
  measureText() { return { width: 10 }; }
});
patternCanvasElement.getBoundingClientRect = () => ({ left: 0, width: 400, height: 400 });
patternCanvasElement.animate = () => ({}) ;
patternCanvasElement.addEventListener = () => {};
patternCanvasElement.removeEventListener = () => {};

const documentStub = {
  body: new MockElement(),
  createElement: () => new MockElement(),
  getElementById: (id) => {
    if (id === 'countdown') return countdownElement;
    if (id === 'pattern-guide-canvas') return guideCanvasElement;
    if (id === 'game-canvas') return patternCanvasElement;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  activeElement: null
};

const localStorageStub = {
  store: {},
  getItem(key) { return this.store[key] ?? null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; }
};

let cleared = 0;
global.window = {
  addEventListener() {},
  removeEventListener() {},
  location: { reload() {} },
  setInterval: () => 1,
  clearInterval: () => { cleared += 1; },
  setTimeout: (callback) => {
    callback();
    return 1;
  },
  clearTimeout: () => {},
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {}
};
global.document = documentStub;
global.localStorage = localStorageStub;

global.performance = { now: () => 0 };

global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.setTimeout = (callback) => {
  callback();
  return 1;
};
global.clearTimeout = () => {};
global.setInterval = () => 1;
global.clearInterval = () => {};

const controls = new DeveloperControls();
controls.setAutoClickerEnabled(true, 'good');
assert.equal(controls.isAutoClickerEnabled(), true);
assert.equal(controls.getAutoClickerTarget(), 'good');
controls.setGameInstance(null);
assert.equal(cleared, 0, 'disabling the game instance should not stop an enabled auto-clicker loop');
controls.setAutoClickerEnabled(false, 'perfect');
assert.equal(controls.isAutoClickerEnabled(), false);
assert.equal(controls.getAutoClickerTarget(), 'perfect');
controls.setScoreMultiplierEnabled(true);
controls.setScoreMultiplier(2.5);
assert.equal(controls.isScoreMultiplierEnabled(), true);
assert.equal(controls.getScoreMultiplier(), 2.5);
controls.setStatsEditEnabled(true);
assert.equal(controls.isStatsEditEnabled(), true);

let beatScheduledCalls = 0;
const beatScheduledGame = {
  devAutoClickFunc() {
    beatScheduledCalls += 1;
    return true;
  },
  getNextAutoClickTiming() {
    return { timeUntilBeat: 0 };
  }
};
const beatScheduledControls = new DeveloperControls();
beatScheduledControls.setGameInstance(beatScheduledGame);
beatScheduledControls.setAutoClickerEnabled(true, 'good');
assert.equal(beatScheduledCalls, 1, 'auto-clicker should trigger immediately when the game exposes a beat-aligned timing hint');

const beatScheduler = {
  listeners: [],
  now: 0,
  onBeat(handler) {
    this.listeners.push(handler);
  },
  getCurrentTime() {
    return this.now;
  }
};
const beatCanvas = new MockElement();
const beatGame = startBeatClick(beatScheduler, beatCanvas, {
  onUpdateHUD: () => {},
  difficulty: { level: 'veteran' },
  onGameEnd: () => {}
});
beatGame.start();
beatScheduler.listeners.forEach((listener) => listener(1));
beatScheduler.now = 0.2;
assert.equal(beatGame.devAutoClickFunc('Good'), false, 'beat-click auto-clicker should wait until the cue is close to the beat');
beatScheduler.now = 1.0;
assert.equal(beatGame.devAutoClickFunc('Good'), true, 'beat-click auto-clicker should click once the cue is in the valid timing window');

const { default: startPatternMemory } = await import('../src/modes/patternmemoryv3.js');
const game = startPatternMemory({
  canvas: patternCanvasElement,
  audioScheduler: null,
  onUpdateHUD: () => {},
  difficulty: { level: 'noob', bpm: 120 },
  onGameEnd: () => {}
});

game.start();
game.devAutoClickFunc('Perfect');
const stateAfterAutoClick = game.getState();
assert.notEqual(stateAfterAutoClick.state, 'gameover', 'auto-clicker should not end pattern memory immediately after a simulated press');

const keyboardScheduler = {
  audioCtx: null,
  getCurrentTime() {
    return 0;
  }
};
const keyboardCanvas = new MockElement();
const keyboardGame = startKeyPress({
  canvas: keyboardCanvas,
  audioScheduler: keyboardScheduler,
  onUpdateHUD: () => {},
  difficulty: { level: 'noob', leadTime: 0.6, patternBeats: 4 },
  keybinds: { A: 'KeyA', S: 'KeyS', D: 'KeyD', F: 'KeyF' },
  soundEnabled: false
});
keyboardGame.start();
assert.equal(keyboardGame.devAutoClickFunc('Good'), false, 'keypress auto-clicker should wait until the cue is close to the beat');
const keyboardTiming = keyboardGame.getNextAutoClickTiming();
if (keyboardTiming) {
  assert.equal(typeof keyboardTiming.beatTime, 'number', 'keypress should expose beat timing');
}

console.log('PASS developer controls auto-clicker state is persisted.');

