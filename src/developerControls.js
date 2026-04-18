// src/developerControls.js
// Secret developer console with Konami code activation

export class DeveloperControls {
  constructor() {
    this.isActive = false;
    this.konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
    this.konamiIndex = 0;
    this.panel = null;
    this.gameInstance = null;
    this.selectedTile = null;

    this.init();
  }

  init() {
    // Listen for Konami code
    window.addEventListener('keydown', (e) => this.handleKonamiCode(e));

    // Create the developer panel (hidden initially)
    this.createPanel();
  }

  handleKonamiCode(e) {
    const key = e.code;

    // Check if this key matches the next in the sequence
    if (key === this.konami[this.konamiIndex]) {
      this.konamiIndex++;

      // If sequence is complete, wait for 'D' key
      if (this.konamiIndex === this.konami.length) {
        this.konamiIndex = 0; // Reset for next attempt
        // Listen for next keydown
        const onKeyDown = (event) => {
          if (event.key.toUpperCase() === 'D') {
            this.togglePanel();
            window.removeEventListener('keydown', onKeyDown);
          } else {
            this.konamiIndex = 0;
            window.removeEventListener('keydown', onKeyDown);
          }
        };
        window.addEventListener('keydown', onKeyDown);
      }
    } else {
      this.konamiIndex = 0;
    }
  }

  createPanel() {
    const panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      max-height: 600px;
      background: rgba(20, 30, 48, 0.95);
      border: 2px solid #ff0000;
      border-radius: 8px;
      padding: 16px;
      color: #ff0000;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      overflow-y: auto;
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
      display: none;
    `;

    panel.innerHTML = `
      <div style="margin-bottom: 16px; border-bottom: 1px solid #ff0000; padding-bottom: 8px;">
        <h3 style="margin: 0; color: #ff0000; font-size: 14px;">🔧 DEVELOPER CONSOLE</h3>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px;">Pattern Memory - Select Tile:</label>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
          <button class="dev-tile-btn" data-tile="1" style="padding: 6px; background: #ff3b30; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">R1</button>
          <button class="dev-tile-btn" data-tile="2" style="padding: 6px; background: #ff9500; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">O2</button>
          <button class="dev-tile-btn" data-tile="3" style="padding: 6px; background: #ffcc00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Y3</button>
          <button class="dev-tile-btn" data-tile="4" style="padding: 6px; background: #34c759; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">G4</button>
          <button class="dev-tile-btn" data-tile="5" style="padding: 6px; background: #007aff; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">B5</button>
          <button class="dev-tile-btn" data-tile="6" style="padding: 6px; background: #5856d6; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Pu6</button>
          <button class="dev-tile-btn" data-tile="7" style="padding: 6px; background: #af52de; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Pi7</button>
        </div>
        <p style="margin: 6px 0 0 0; color: #aa0000; font-size: 11px;">Selected: <span id="dev-selected-tile">None</span></p>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px;">Quick Actions:</label>
        <button id="dev-force-perfect" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #00ff00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Perfect</button>
        <button id="dev-force-good" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #00cc00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Good</button>
        <button id="dev-force-miss" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #ff4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Miss</button>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px;">Game Controls:</label>
        <button id="dev-reset-game" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #ffaa00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Reset Game</button>
        <button id="dev-add-score" style="width: 100%; padding: 6px; background: #00ffff; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Add 1000 Score</button>
      </div>

      <div style="border-top: 1px solid #ff0000; padding-top: 8px;">
        <p style="margin: 0; color: #aa0000; font-size: 10px;">Sequence: ↑↑↓↓←→←→D to activate</p>
      </div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;

    // Attach event listeners
    this.attachEventListeners();
  }

  attachEventListeners() {
    // Tile selection buttons
    document.querySelectorAll('.dev-tile-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tile = e.target.dataset.tile;
        this.selectTile(tile);
      });
    });

    // Quick action buttons
    document.getElementById('dev-force-perfect')?.addEventListener('click', () => this.forceJudgement('Perfect'));
    document.getElementById('dev-force-good')?.addEventListener('click', () => this.forceJudgement('Good'));
    document.getElementById('dev-force-miss')?.addEventListener('click', () => this.forceJudgement('Miss'));
    document.getElementById('dev-reset-game')?.addEventListener('click', () => this.resetGame());
    document.getElementById('dev-add-score')?.addEventListener('click', () => this.addScore(1000));
  }

  togglePanel() {
    this.isActive = !this.isActive;
    if (this.panel) {
      this.panel.style.display = this.isActive ? 'block' : 'none';
      if (this.isActive) {
        console.log('%c🔧 DEV PANEL ACTIVE', 'color: #ff0000; font-size: 14px; font-weight: bold;');
      }
    }
  }

  selectTile(tileNumber) {
    this.selectedTile = parseInt(tileNumber);
    document.getElementById('dev-selected-tile').textContent = `Tile ${this.selectedTile}`;

    // Highlight selected button
    document.querySelectorAll('.dev-tile-btn').forEach((btn) => {
      if (btn.dataset.tile === tileNumber) {
        btn.style.border = '3px solid #ff0000';
      } else {
        btn.style.border = 'none';
      }
    });

    // Force this tile in the game if devForceTile method exists
    if (this.gameInstance && typeof this.gameInstance.devForceTile === 'function') {
      this.gameInstance.devForceTile(this.selectedTile);
    }

    console.log(`%c📍 Tile ${tileNumber} forced`, 'color: #ff0000; font-size: 12px;');
  }

  forceJudgement(judgement) {
    // Force a judgement by calling the game instance method
    if (!this.gameInstance) {
      console.log('%c❌ No game instance', 'color: #ff4444; font-size: 12px;');
      return;
    }

    if (typeof this.gameInstance.devInjectJudgementFunc === 'function') {
      this.gameInstance.devInjectJudgementFunc(judgement);
    }
    
    console.log(`%c💫 Forced ${judgement}`, 'color: #ffff00; font-size: 12px;');
  }

  resetGame() {
    if (this.gameInstance && typeof this.gameInstance.reset === 'function') {
      this.gameInstance.reset();
      console.log('%c🔄 Game reset', 'color: #00ff00; font-size: 12px;');
    } else {
      console.log('%c❌ Cannot reset game', 'color: #ff4444; font-size: 12px;');
    }
  }

  addScore(amount) {
    if (this.gameInstance && typeof this.gameInstance.devAddScoreFunc === 'function') {
      this.gameInstance.devAddScoreFunc(amount);
      console.log(`%c➕ Added ${amount} score`, 'color: #00ff00; font-size: 12px;');
    } else {
      console.log('%c❌ Cannot add score', 'color: #ff4444; font-size: 12px;');
    }
  }

  setGameInstance(instance) {
    this.gameInstance = instance;
  }
}

// Initialize on load
export function initDevControls() {
  return new DeveloperControls();
}
