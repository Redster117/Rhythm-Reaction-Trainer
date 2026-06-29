// src/developerControls.js
// Secret developer console with Konami code activation

export class DeveloperControls {
  constructor({ activationSequence } = {}) {
    this.isActive = false;
    const defaultActivationSequence = [
      'Digit1', 'Digit3', 'Digit4'
    ];
    // Original console sequence preserved for later:
    // [
    //   'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    //   'KeyR', 'KeyR', 'KeyT', 'Minus', 'Digit6', 'Period', 'Digit0'
    // ]
    this.activationSequence = this.normalizeActivationSequence(
      activationSequence || defaultActivationSequence
    );
    this.konamiIndex = 0;
    this.panel = null;
    this.gameInstance = null;
    this.patternConfig = Array(10).fill(0); // 0 means none
    this.isActive = localStorage.getItem('rtr-dev-console-open') === '1';
    this.forceMode = localStorage.getItem('rtr-dev-force-mode') || null;
    this.afkTimer = null;
    this.afkMode = localStorage.getItem('rtr-dev-afk-mode') === '1';

    this.init();
  }

  init() {
    // Listen for Konami code
    window.addEventListener('keydown', (e) => this.handleKonamiCode(e));

    // Create the developer panel (hidden initially)
    this.createPanel();
    if (this.isActive) {
      this.panel.style.display = 'block';
    }
  }

  handleKonamiCode(e) {
    const key = e.code;
    const expected = this.activationSequence[this.konamiIndex];

    if (key === expected) {
      this.konamiIndex += 1;
      if (this.konamiIndex === this.activationSequence.length) {
        this.konamiIndex = 0;
        this.togglePanel();
      }
      return;
    }

    this.konamiIndex = 0;
    if (key === this.activationSequence[0]) {
      this.konamiIndex = 1;
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
        <label style="display: block; margin-bottom: 4px;">Pattern Memory Configuration:</label>
        <div id="pattern-config-list" style="max-height: 200px; overflow-y: auto;">
          ${Array.from({ length: 10 }, (_, i) => `
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <span style="width: 30px; font-size: 11px;">${i + 1}:</span>
              <select class="dev-pattern-select" data-pos="${i}" style="flex: 1; padding: 2px; font-size: 11px;">
                <option value="0">None</option>
                <option value="1">R1</option>
                <option value="2">O2</option>
                <option value="3">Y3</option>
                <option value="4">G4</option>
                <option value="5">B5</option>
                <option value="6">Pu6</option>
                <option value="7">Pi7</option>
              </select>
            </div>
          `).join('')}
        </div>
        <button id="dev-clear-pattern" style="width: 100%; padding: 4px; margin-top: 4px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Clear Pattern</button>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px;">Quick Actions:</label>
        <label style="display: block; margin-bottom: 4px; font-size: 11px;">
          <input type="checkbox" id="dev-force-enabled" checked> Enable Force Buttons
        </label>
        <label style="display: block; margin-bottom: 4px; font-size: 11px;">
          <input type="checkbox" id="dev-afk-mode" ${this.afkMode ? 'checked' : ''}> AFK Force Mode
        </label>
        <button id="dev-force-perfect" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #00ff00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Perfect</button>
        <button id="dev-force-good" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #00cc00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Good</button>
        <button id="dev-force-miss" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #ff4444; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Force Miss</button>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px;">Game Controls:</label>
        <button id="dev-reset-game" style="width: 100%; padding: 6px; margin-bottom: 4px; background: #ffaa00; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Refresh Page</button>
        <label style="display: block; margin-bottom: 4px; font-size: 11px;">Score injection amount:</label>
        <input id="dev-score-amount" type="number" min="0" step="100" value="1000" style="width: 100%; padding: 6px; margin-bottom: 4px; border-radius: 4px; border: 1px solid #ff0000; background: #071226; color: #fff; box-sizing: border-box;" />
        <button id="dev-add-score" style="width: 100%; padding: 6px; background: #00ffff; color: #071226; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Inject Score</button>
      </div>

      <div style="border-top: 1px solid #ff0000; padding-top: 8px;">
        <p id="dev-activation-sequence" style="margin: 0; color: #aa0000; font-size: 10px;">Sequence: ${this.formatActivationSequence()} to activate</p>
      </div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;

    // Attach event listeners
    this.attachEventListeners();
    this.updateActivationInstructions();
  }

  attachEventListeners() {
    // Pattern configuration selects
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('dev-pattern-select')) {
        const pos = parseInt(e.target.dataset.pos);
        const value = parseInt(e.target.value);
        this.updatePatternConfig(pos, value);
      }
    });

    // Clear pattern button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'dev-clear-pattern') {
        this.clearPatternConfig();
      }
    });

    // Quick action buttons
    const forceEnabledCheckbox = document.getElementById('dev-force-enabled');
    const updateForceButtons = () => {
      const enabled = forceEnabledCheckbox.checked;
      document.getElementById('dev-force-perfect').disabled = !enabled;
      document.getElementById('dev-force-good').disabled = !enabled;
      document.getElementById('dev-force-miss').disabled = !enabled;
      document.querySelectorAll('.dev-tile-btn').forEach(btn => btn.disabled = !enabled);
    };
    forceEnabledCheckbox.addEventListener('change', updateForceButtons);
    updateForceButtons(); // Initial state

    document.getElementById('dev-force-perfect')?.addEventListener('click', () => this.forceJudgement('Perfect'));
    document.getElementById('dev-force-good')?.addEventListener('click', () => this.forceJudgement('Good'));
    document.getElementById('dev-force-miss')?.addEventListener('click', () => this.forceJudgement('Miss'));
    document.getElementById('dev-reset-game')?.addEventListener('click', () => {
      localStorage.setItem('rtr-dev-console-open', '1');
      window.location.reload();
    });
    document.getElementById('dev-afk-mode')?.addEventListener('change', (e) => this.setAFKMode(Boolean(e.target.checked)));
    document.getElementById('dev-add-score')?.addEventListener('click', () => this.addScore(this.getInjectionAmount()));
    document.getElementById('dev-score-amount')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addScore(this.getInjectionAmount());
      }
    });
  }

  updatePatternConfig(pos, value) {
    this.patternConfig[pos] = value;
  }

  clearPatternConfig() {
    this.patternConfig.fill(0);
    // Update the selects to reflect the cleared config
    for (let i = 0; i < 10; i++) {
      const select = document.querySelector(`.dev-pattern-select[data-pos="${i}"]`);
      if (select) select.value = '0';
    }
  }

  getConfiguredPattern() {
    return this.patternConfig.slice(); // Return a copy
  }

  getInjectionAmount() {
    const input = document.getElementById('dev-score-amount');
    const parsed = Number.parseInt(input?.value ?? '1000', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }

  formatActivationSequence() {
    return this.activationSequence.map((code) => this.displayActivationKey(code)).join(' ');
  }

  displayActivationKey(code) {
    if (code === 'ArrowUp') return '↑';
    if (code === 'ArrowDown') return '↓';
    if (code === 'ArrowLeft') return '←';
    if (code === 'ArrowRight') return '→';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Minus') return '-';
    if (code === 'Period') return '.';
    return code;
  }

  updateActivationInstructions() {
    const sequenceEl = document.getElementById('dev-activation-sequence');
    if (sequenceEl) {
      sequenceEl.textContent = `Sequence: ${this.formatActivationSequence()} to activate`;
    }
  }

  togglePanel() {
    this.isActive = !this.isActive;
    if (this.panel) {
      this.panel.style.display = this.isActive ? 'block' : 'none';
      this.updateForceButtonStyles();
      localStorage.setItem('rtr-dev-console-open', this.isActive ? '1' : '0');
      if (this.isActive) {
        console.log('%c🔧 DEV PANEL ACTIVE', 'color: #ff0000; font-size: 14px; font-weight: bold;');
      }
    }
  }

  forceJudgement(judgement) {
    const enabled = document.getElementById('dev-force-enabled')?.checked;
    if (!enabled) return;
    if (!this.gameInstance) {
      console.log('%c❌ No game instance', 'color: #ff4444; font-size: 12px;');
      return;
    }

    this.forceMode = judgement;
    localStorage.setItem('rtr-dev-force-mode', judgement);
    this.updateForceButtonStyles();

    if (typeof this.gameInstance.devInjectJudgementFunc === 'function') {
      this.gameInstance.devInjectJudgementFunc(judgement, { persistent: true });
    }

    console.log(`%c💫 Forced ${judgement}`, 'color: #ffff00; font-size: 12px;');
  }

  updateForceButtonStyles() {
    const modes = ['Perfect', 'Good', 'Miss'];
    modes.forEach((mode) => {
      const button = document.getElementById(`dev-force-${mode.toLowerCase()}`);
      if (!button) return;
      const active = this.forceMode === mode;
      button.style.outline = active ? '2px solid #fff' : 'none';
      button.style.boxShadow = active ? '0 0 0 2px rgba(255,255,255,0.25)' : 'none';
    });
  }

  setAFKMode(enabled) {
    this.afkMode = Boolean(enabled);
    localStorage.setItem('rtr-dev-afk-mode', this.afkMode ? '1' : '0');
    if (this.afkTimer) {
      clearInterval(this.afkTimer);
      this.afkTimer = null;
    }
    if (!this.afkMode) return;
    if (!this.gameInstance || typeof this.gameInstance.devInjectJudgementFunc !== 'function') return;

    this.afkTimer = setInterval(() => {
      if (!this.gameInstance || typeof this.gameInstance.devInjectJudgementFunc !== 'function') return;
      const options = this.forceMode ? [this.forceMode] : ['Perfect', 'Good', 'Miss'];
      const next = options[Math.floor(Math.random() * options.length)];
      this.gameInstance.devInjectJudgementFunc(next, { persistent: true });
    }, 600);
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
    const safeAmount = Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 1000;
    if (this.gameInstance && typeof this.gameInstance.devAddScoreFunc === 'function') {
      this.gameInstance.devAddScoreFunc(safeAmount);
      console.log(`%c➕ Added ${safeAmount} score`, 'color: #00ff00; font-size: 12px;');
    } else {
      console.log('%c❌ Cannot add score', 'color: #ff4444; font-size: 12px;');
    }
  }

  setGameInstance(instance) {
    this.gameInstance = instance;
    this.updateForceButtonStyles();

    if (instance && this.forceMode) {
      this.gameInstance.devInjectJudgementFunc?.(this.forceMode, { persistent: true });
    }
    if (instance && this.afkMode) {
      this.setAFKMode(true);
    }
    if (!instance) {
      if (this.afkTimer) {
        clearInterval(this.afkTimer);
        this.afkTimer = null;
      }
      // Disable force buttons when no game instance
      const forceEnabledCheckbox = document.getElementById('dev-force-enabled');
      if (forceEnabledCheckbox) {
        forceEnabledCheckbox.checked = false;
        forceEnabledCheckbox.dispatchEvent(new Event('change'));
      }
    }
  }

  setActivationSequence(sequence) {
    if (Array.isArray(sequence) && sequence.length > 0) {
      this.activationSequence = this.normalizeActivationSequence(sequence);
      this.konamiIndex = 0;
      this.updateActivationInstructions();
    }
  }

  normalizeActivationSequence(sequence) {
    return sequence.map((item) => this.normalizeActivationKey(item));
  }

  normalizeActivationKey(item) {
    const key = item.toString().trim();
    const upper = key.toUpperCase();
    const map = {
      'ARROWUP': 'ArrowUp',
      'ARROWDOWN': 'ArrowDown',
      'ARROWLEFT': 'ArrowLeft',
      'ARROWRIGHT': 'ArrowRight',
      'KEY-': 'Minus',
      'KEY.': 'Period',
      'KEY0': 'Digit0',
      'KEY1': 'Digit1',
      'KEY2': 'Digit2',
      'KEY3': 'Digit3',
      'KEY4': 'Digit4',
      'KEY5': 'Digit5',
      'KEY6': 'Digit6',
      'KEY7': 'Digit7',
      'KEY8': 'Digit8',
      'KEY9': 'Digit9'
    };
    if (map[upper]) return map[upper];
    if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
    if (/^[0-9]$/.test(upper)) return `Digit${upper}`;
    if (upper === '-') return 'Minus';
    if (upper === '.') return 'Period';
    return key;
  }
}

// Initialize on load
export function initDevControls(options = {}) {
  return new DeveloperControls(options);
}
