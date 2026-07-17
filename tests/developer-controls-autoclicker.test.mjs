import assert from 'node:assert/strict';
import { DeveloperControls } from '../src/developerControls.js';

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

const documentStub = {
  body: new MockElement(),
  createElement: () => new MockElement(),
  getElementById: () => null,
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
  location: { reload() {} },
  setInterval: () => 1,
  clearInterval: () => { cleared += 1; },
  setTimeout: () => 1,
  clearTimeout: () => {}
};
global.document = documentStub;
global.localStorage = localStorageStub;

global.performance = { now: () => 0 };

global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.setTimeout = () => 1;
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
console.log('PASS developer controls auto-clicker state is persisted.');
