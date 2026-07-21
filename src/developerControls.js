// src/developerControls.js
import { AudioSchedulerPM } from './audioPatternMemory.js';
import PatternGuide from './patternGuide.js';
import { getPatternMemoryTimingTolerance } from './timingConfig.js';

export class DeveloperControls {
  constructor({ activationSequence } = {}) {
    this.isActive = false;
    const defaultActivationSequence = [
       'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
       'KeyR', 'KeyR', 'KeyT', 'Minus', 'Digit6', 'Period', 'Digit0'
    ];
    
    this.activationSequence = this.normalizeActivationSequence(
      activationSequence || defaultActivationSequence
    );
    this.konamiIndex = 0;
    this.panel = null;
    this.gameInstance = null;
    this.patternConfig = Array(10).fill(0);
    this.docsMediaAssets = [
      { key: 'Demoman.png', label: 'Demoman.png', src: 'docs/Demoman.png', type: 'image' },
      { key: 'demo.gif', label: 'demo.gif', src: 'docs/demo.gif', type: 'image' },
      { key: 'kazotsky kick demoman.gif', label: 'kazotsky kick demoman.gif', src: 'docs/kazotsky kick demoman.gif', type: 'image' },
      { key: 'spinning heavy.gif', label: 'spinning heavy.gif', src: 'docs/spinning heavy.gif', type: 'image' },
      { key: 'Caked up Heavy Beat.mp4', label: 'Caked up Heavy Beat.mp4', src: 'docs/Caked up Heavy Beat.mp4', type: 'video' },
      { key: 'Caked up Heavy Beat.mp3', label: 'Caked up Heavy Beat.mp3', src: 'docs/Caked up Heavy Beat.mp3', type: 'audio' },
      { key: 'Heavy Beats.mp4', label: 'Heavy Beats.mp4', src: 'docs/Heavy Beats.mp4', type: 'video' },
      { key: 'Heavy Beats.mp3', label: 'Heavy Beats.mp3', src: 'docs/Heavy Beats.mp3', type: 'audio' },
      { key: 'Eat My Ass Heavy.mp4', label: 'Eat My Ass Heavy.mp4', src: 'docs/Eat My Ass Heavy.mp4', type: 'video' },
      { key: 'Eat My Ass Heavy.mp3', label: 'Eat My Ass Heavy.mp3', src: 'docs/Eat My Ass Heavy.mp3', type: 'audio' },
      { key: 'thats racist.mp3', label: 'thats racist.mp3', src: 'docs/thats racist.mp3', type: 'audio' },
      { key: 'demo resound.mp3', label: 'demo resound.mp3', src: 'docs/demo resound.mp3', type: 'audio' },
      { key: 'demo old sound.mp3', label: 'demo old sound.mp3', src: 'docs/demo old sound.mp3', type: 'audio' },
      { key: 'spinning heavy audio.mp3', label: 'spinning heavy audio.mp3', src: 'docs/spinning heavy audio.mp3', type: 'audio' },
    ];

    this.isActive = false;
    this.statsOverrideOpen = false;
    this.scoreMultiplierEnabled = localStorage.getItem('rtr-dev-score-multiplier-enabled') === '1';
    this.scoreMultiplier = Number(localStorage.getItem('rtr-dev-score-multiplier') || '1');
    this.scoreMultiplier = Number.isFinite(this.scoreMultiplier) && this.scoreMultiplier > 0 ? this.scoreMultiplier : 1;
    this.statsEditEnabled = localStorage.getItem('rtr-dev-stats-edit-enabled') === '1';
    this.statsOverrideSnapshot = null;
    this.statsAccessors = {};
    this.keyPressSpeed = Number(localStorage.getItem('rtr-dev-keypress-speed') || '1');
    this.autoClickerEnabled = localStorage.getItem('rtr-dev-auto-clicker-enabled') === '1';
    this.autoClickerTarget = String(localStorage.getItem('rtr-dev-auto-clicker-target') || 'good').toLowerCase();
    this.autoClickerTarget = ['good', 'perfect'].includes(this.autoClickerTarget) ? this.autoClickerTarget : 'good';
    this.autoClickerTimer = null;
    this.autoClickAudioContext = null;

    this.init();
  }

  init() {
    window.addEventListener('keydown', (e) => {
      try {
        if (typeof this.handleKonamiCode === 'function') this.handleKonamiCode(e);
      } catch (err) {
        console.error('DevControls: Konami handler error', err);
      }
    });

    // Create the developer panel (hidden initially)
    const panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      top: 20px;
      width: 350px;
      max-height: 95vh;
      overflow-y: auto;
      padding: 16px;
      background: #071226;
      color: #ff0000;
      font-family: monospace;
      zIndex: 10000;
      border-radius: 8px;
      border: 2px solid #ff0000;
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
      display: none;
    `;

    // Build pattern config HTML
    let patternHtml = '<div style="margin-bottom:12px"><label style="display:block;margin-bottom:4px">Pattern Memory Configuration:</label><div id="pattern-config-list" style="max-height:200px;overflow-y:auto;">';
    for (let i = 0; i < 10; i++) {
      patternHtml += `<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="width:30px;font-size:11px">${i+1}:</span><select class="dev-pattern-select" data-pos="${i}" style="flex:1;padding:2px;font-size:11px;"><option value="0">None</option><option value="1">R1</option><option value="2">O2</option><option value="3">Y3</option><option value="4">G4</option><option value="5">B5</option><option value="6">Pu6</option><option value="7">Pi7</option></select></div>`;
    }
    patternHtml += '</div><button id="dev-clear-pattern" style="width:100%;padding:4px;margin-top:4px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Clear Pattern</button></div>';

    // Tile previews
    const tileButtons = [1,2,3,4,5,6,7].map(i => `<button class="dev-preview-tile" data-tile="${i}" style="flex:1 0 30%; padding:6px; background:#223344; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px; margin:2px">${['R1','O2','Y3','G4','B5','Pu6','Pi7'][i-1]}</button>`).join('');

    // Media options
    const mediaOptions = this.docsMediaAssets.map(a => `<option value="${a.key}">${a.label}</option>`).join('');
    const keyPressSpeedOptions = ['0.5', '0.75', '1', '1.25', '1.5', '2']
      .map((value) => {
        const numericValue = Number(value);
        const isSelected = Number(this.keyPressSpeed) === numericValue ? ' selected' : '';
        return `<option value="${value}"${isSelected}>${value}x</option>`;
      })
      .join('');
    const autoClickerChecked = this.autoClickerEnabled ? ' checked' : '';
    const autoClickerTargetValue = this.autoClickerTarget === 'perfect' ? 'perfect' : 'good';

    panel.innerHTML = `
      <div style="margin-bottom: 16px; border-bottom: 1px solid #ff0000; padding-bottom: 8px;">
        <h3 style="margin: 0; color: #ff0000; font-size: 14px;">🔧 DEVELOPER CONSOLE</h3>
      </div>
      ${patternHtml}
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px">Key Press Speed:</label>
        <select id="dev-keypress-speed" style="width:100%;padding:6px;margin-bottom:8px;border-radius:4px;border:1px solid #333;background:#071226;color:#fff;font-size:11px;">
          ${keyPressSpeedOptions}
        </select>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px">Quick Actions:</label>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><label style="font-size:11px;min-width:84px;">Auto Clicker</label><input type="checkbox" id="dev-enable-auto-clicker"${autoClickerChecked}><select id="dev-auto-clicker-target" style="flex:1;padding:6px;border-radius:4px;border:1px solid #333;background:#071226;color:#fff;font-size:11px;"><option value="good"${autoClickerTargetValue === 'good' ? ' selected' : ''}>Good</option><option value="perfect"${autoClickerTargetValue === 'perfect' ? ' selected' : ''}>Perfect</option></select></div>
        <div id="dev-stats-override-panel" style="margin-top:8px;padding:8px;border:1px solid #333;border-radius:6px;background:#0b1a2d;">
          <button id="dev-open-stats-override" style="width:100%;padding:6px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Stats Override</button>
          <div id="dev-stats-override-controls" style="display:none;margin-top:8px;">
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;"><input type="checkbox" id="dev-score-multiplier-enabled"> Enable Score Multiplier</label>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><label style="font-size:11px;min-width:84px;">Multiplier</label><input id="dev-score-multiplier" type="number" min="1" step="0.1" value="1" style="flex:1;padding:6px;border-radius:4px;border:1px solid #333;background:#071226;color:#fff;font-size:11px;" /></div>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;"><input type="checkbox" id="dev-stats-edit-enabled"> Enable Stats Editing</label>
            <p style="margin:0;font-size:10px;color:#aaa;">When enabled, double-click any summary or detailed stat entry to edit plays, accuracy, best precision, or best combo.</p>
            <button id="dev-revert-stats" style="width:100%;padding:6px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;margin-top:8px;display:none;">Revert Stats</button>
          </div>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px">Tile Previews:</label>
        <div id="dev-tile-previews" style="display:flex;flex-wrap:wrap;gap:6px;">${tileButtons}</div>
        <div id="dev-tile-preview-times" style="margin-top:8px;font-size:11px;color:#ccc;min-height:18px;">No preview yet.</div>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px">Docs media preview:</label>
        <select id="dev-media-select" style="width:100%;padding:6px;margin-bottom:8px;border-radius:4px;border:1px solid #333;background:#071226;color:#fff;font-size:11px;"><option value="">Select docs media</option>${mediaOptions}</select>
        <div id="dev-media-preview" style="background: rgba(0,0,0,0.12); border:1px solid rgba(255,255,255,0.10); border-radius:6px; min-height:120px; display:flex; align-items:center; justify-content:center; padding:10px; color:#ccc; font-size:11px;">No media selected.</div>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;margin-bottom:4px">Game Controls:</label>
        <button id="dev-reset-game" style="width:100%;padding:6px;margin-bottom:4px;background:#ffaa00;color:#071226;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Refresh Page</button>
      </div>
      <div style="border-top:1px solid #333;padding-top:8px;"><p id="dev-activation-sequence" style="margin:0;color:#aa0000;font-size:10px;">Sequence: ${this.formatActivationSequence()} to activate</p></div>
    `;

    document.body.appendChild(panel);
    this.panel = panel;

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
      if (e.target.id === 'dev-keypress-speed') {
        this.setKeyPressSpeed(e.target.value);
      }
      if (e.target.id === 'dev-media-select') {
        this.renderMediaPreview(e.target.value);
      }
    });

    // Clear pattern button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'dev-clear-pattern') {
        this.clearPatternConfig();
      }
    });

    // Tile preview buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList && e.target.classList.contains('dev-preview-tile')) {
        const tile = Number(e.target.dataset.tile);
        if (!this.gameInstance || typeof this.gameInstance.previewTile !== 'function') {
          // Fallback to local preview using AudioSchedulerPM + PatternGuide
          if (typeof this.localPreviewTile === 'function') {
            this.localPreviewTile(tile);
          } else {
            console.log('%c❌ Local preview unavailable', 'color: #ff4444;');
          }
          return;
        }
        const scheduled = this.gameInstance.previewTile(tile);
        console.log(`%c🔊 Previewing tile ${tile}`, 'color: #22c55e;');
        const timesEl = document.getElementById('dev-tile-preview-times');
        if (timesEl) {
          if (Array.isArray(scheduled) && scheduled.length) {
            timesEl.textContent = 'Scheduled (ms): ' + scheduled.join(', ');
          } else {
            timesEl.textContent = 'No scheduled beats.';
          }
        }
      }
    });

    // Quick action buttons
    const autoToggle = document.getElementById('dev-enable-auto-clicker');
    const autoTarget = document.getElementById('dev-auto-clicker-target');
    const updateAutoClickerState = () => {
      if (autoTarget) {
        autoTarget.disabled = !autoToggle?.checked;
      }
    };
    autoToggle?.addEventListener('change', (e) => {
      this.setAutoClickerEnabled(Boolean(e.target.checked));
      updateAutoClickerState();
    });
    document.getElementById('dev-auto-clicker-target')?.addEventListener('change', (e) => this.setAutoClickerTarget(e.target.value));

    document.getElementById('dev-open-stats-override')?.addEventListener('click', () => {
      this.statsOverrideOpen = !this.statsOverrideOpen;
      const panel = document.getElementById('dev-stats-override-controls');
      if (panel) {
        panel.style.display = this.statsOverrideOpen ? 'block' : 'none';
      }
      if (this.statsOverrideOpen && typeof this.statsOverrideOpenCallback === 'function') {
        this.statsOverrideOpenCallback();
      }
    });
    document.getElementById('dev-score-multiplier-enabled')?.addEventListener('change', (e) => {
      this.setScoreMultiplierEnabled(Boolean(e.target.checked));
    });
    document.getElementById('dev-score-multiplier')?.addEventListener('input', (e) => {
      this.setScoreMultiplier(e.target.value);
    });
    document.getElementById('dev-stats-edit-enabled')?.addEventListener('change', (e) => {
      this.setStatsEditEnabled(Boolean(e.target.checked));
    });
    document.getElementById('dev-revert-stats')?.addEventListener('click', () => {
      if (!this.statsOverrideSnapshot) return;
      this.restoreStatsOverrideSnapshot();
      this.updateRevertButtonState();
    });
    document.getElementById('dev-reset-game')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  handleKonamiCode(e) {
    // Ignore typing into form controls
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    const code = e.code;
    const expected = this.activationSequence[this.konamiIndex];
    if (code === expected) {
      this.konamiIndex += 1;
      if (this.konamiIndex >= this.activationSequence.length) {
        this.konamiIndex = 0;
        this.togglePanel();
      }
    } else {
      // If this key could be the start of the sequence, set index accordingly
      if (code === this.activationSequence[0]) this.konamiIndex = 1;
      else this.konamiIndex = 0;
    }
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
      this.updateActionButtonStates();
      // Do not persist open state to localStorage so a refresh always starts closed.
      if (this.isActive) {
        console.log('%c🔧 DEV PANEL ACTIVE', 'color: #ff0000; font-size: 14px; font-weight: bold;');
      }
    }
  }

  updateActionButtonStates() {
    const autoToggle = document.getElementById('dev-enable-auto-clicker');
    const autoTarget = document.getElementById('dev-auto-clicker-target');
    if (autoTarget) {
      autoTarget.disabled = !autoToggle?.checked;
    }
    this.updateRevertButtonState();
  }

  setStatsEditChangeCallback(callback) {
    this.statsEditChangeCallback = typeof callback === 'function' ? callback : null;
  }

  setStatsOverrideOpenCallback(callback) {
    this.statsOverrideOpenCallback = typeof callback === 'function' ? callback : null;
  }

  updateRevertButtonState() {
    const button = document.getElementById('dev-revert-stats');
    if (!button) return;
    if (this.statsOverrideSnapshot) {
      button.style.display = 'block';
    } else {
      button.style.display = 'none';
    }
  }

  restoreStatsOverrideSnapshot() {
    if (!this.statsOverrideSnapshot) return;
    if (typeof this.statsOverrideRestoreCallback === 'function') {
      this.statsOverrideRestoreCallback(this.statsOverrideSnapshot);
    }
  }

  setStatsOverrideRestoreCallback(callback) {
    this.statsOverrideRestoreCallback = typeof callback === 'function' ? callback : null;
  }

  createStatsOverrideSnapshot(snapshot) {
    this.statsOverrideSnapshot = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    this.updateRevertButtonState();
  }

  clearStatsOverrideSnapshot() {
    this.statsOverrideSnapshot = null;
    this.updateRevertButtonState();
  }

  setScoreMultiplierEnabled(enabled = false) {
    this.scoreMultiplierEnabled = Boolean(enabled);
    try {
      localStorage.setItem('rtr-dev-score-multiplier-enabled', this.scoreMultiplierEnabled ? '1' : '0');
    } catch (err) {
      console.warn('DeveloperControls: could not persist score multiplier state', err);
    }
    const toggle = document.getElementById('dev-score-multiplier-enabled');
    if (toggle) toggle.checked = this.scoreMultiplierEnabled;
    this.updateActionButtonStates?.();
  }

  setScoreMultiplier(multiplier = 1) {
    const value = Number(multiplier);
    this.scoreMultiplier = Number.isFinite(value) && value > 0 ? value : 1;
    try {
      localStorage.setItem('rtr-dev-score-multiplier', String(this.scoreMultiplier));
    } catch (err) {
      console.warn('DeveloperControls: could not persist score multiplier', err);
    }
    const input = document.getElementById('dev-score-multiplier');
    if (input) input.value = String(this.scoreMultiplier);
  }

  isScoreMultiplierEnabled() {
    return Boolean(this.scoreMultiplierEnabled);
  }

  getScoreMultiplier() {
    return Number.isFinite(this.scoreMultiplier) && this.scoreMultiplier > 0 ? this.scoreMultiplier : 1;
  }

  setStatsEditEnabled(enabled = false) {
    this.statsEditEnabled = Boolean(enabled);
    try {
      localStorage.setItem('rtr-dev-stats-edit-enabled', this.statsEditEnabled ? '1' : '0');
    } catch (err) {
      console.warn('DeveloperControls: could not persist stats editing state', err);
    }
    const toggle = document.getElementById('dev-stats-edit-enabled');
    if (toggle) toggle.checked = this.statsEditEnabled;
    if (typeof this.statsEditChangeCallback === 'function') {
      this.statsEditChangeCallback(this.statsEditEnabled);
    }
    this.updateRevertButtonState?.();
  }

  isStatsEditEnabled() {
    return Boolean(this.statsEditEnabled);
  }

  resetGame() {
    if (this.gameInstance && typeof this.gameInstance.reset === 'function') {
      this.gameInstance.reset();
      console.log('%c🔄 Game reset', 'color: #00ff00; font-size: 12px;');
    } else {
      console.log('%c❌ Cannot reset game', 'color: #ff4444; font-size: 12px;');
    }
  }

  syncKeyPressSpeedControl() {
    const select = document.getElementById('dev-keypress-speed');
    if (!select) return;
    const value = String(this.keyPressSpeed);
    const matchingOption = Array.from(select.options).find((option) => option.value === value);
    if (matchingOption) {
      select.value = value;
    } else {
      select.value = '1';
    }
  }

  setKeyPressSpeed(speedMultiplier = 1) {
    const safeSpeed = Number.isFinite(Number(speedMultiplier)) ? Math.max(0.1, Number(speedMultiplier)) : 1;
    this.keyPressSpeed = safeSpeed;
    this.syncKeyPressSpeedControl();
    try {
      localStorage.setItem('rtr-dev-keypress-speed', String(safeSpeed));
    } catch (err) {
      console.warn('DeveloperControls: could not persist key press speed', err);
    }

    if (this.gameInstance && this.gameInstance.isKeyPressMode && typeof this.gameInstance.setPlaybackSpeed === 'function') {
      this.gameInstance.setPlaybackSpeed(safeSpeed);
    }
  }

  isAutoClickerEnabled() {
    return Boolean(this.autoClickerEnabled);
  }

  getAutoClickerTarget() {
    return this.autoClickerTarget;
  }

  setAutoClickerEnabled(enabled = false, target = null) {
    this.autoClickerEnabled = Boolean(enabled);
    if (target) {
      this.autoClickerTarget = ['good', 'perfect'].includes(String(target).toLowerCase()) ? String(target).toLowerCase() : this.autoClickerTarget;
    }
    try {
      localStorage.setItem('rtr-dev-auto-clicker-enabled', this.autoClickerEnabled ? '1' : '0');
      localStorage.setItem('rtr-dev-auto-clicker-target', this.autoClickerTarget);
    } catch (err) {
      console.warn('DeveloperControls: could not persist auto-clicker settings', err);
    }
    const toggle = document.getElementById('dev-enable-auto-clicker');
    if (toggle) toggle.checked = this.autoClickerEnabled;
    const targetSelect = document.getElementById('dev-auto-clicker-target');
    if (targetSelect && ['good', 'perfect'].includes(this.autoClickerTarget)) {
      targetSelect.value = this.autoClickerTarget;
    }
    this.updateActionButtonStates?.();
    if (this.autoClickerEnabled) {
      this.startAutoClickerLoop();
    } else {
      this.stopAutoClickerLoop();
    }
  }

  setAutoClickerTarget(target = 'good') {
    const normalizedTarget = ['good', 'perfect'].includes(String(target).toLowerCase()) ? String(target).toLowerCase() : 'good';
    this.autoClickerTarget = normalizedTarget;
    try {
      localStorage.setItem('rtr-dev-auto-clicker-target', this.autoClickerTarget);
    } catch (err) {
      console.warn('DeveloperControls: could not persist auto-clicker target', err);
    }
    const targetSelect = document.getElementById('dev-auto-clicker-target');
    if (targetSelect) targetSelect.value = this.autoClickerTarget;
    if (this.gameInstance && this.autoClickerEnabled) {
      this.startAutoClickerLoop();
    }
  }

  playAutoClickSound() {
    if (typeof window === 'undefined') return;
    try {
      if (!this.autoClickAudioContext) {
        this.autoClickAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.autoClickAudioContext.state === 'suspended') {
        this.autoClickAudioContext.resume().catch(() => {});
      }
      const now = this.autoClickAudioContext.currentTime;
      const osc = this.autoClickAudioContext.createOscillator();
      const gain = this.autoClickAudioContext.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.autoClickAudioContext.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {
      console.warn('DeveloperControls: could not play auto-click sound', err);
    }
  }

  runAutoClickerTick() {
    if (!this.autoClickerEnabled || !this.gameInstance) return false;

    const judgement = this.autoClickerTarget === 'perfect' ? 'Perfect' : 'Good';
    const timingHint = typeof this.gameInstance.getNextAutoClickTiming === 'function'
      ? this.gameInstance.getNextAutoClickTiming()
      : null;

    if (timingHint && typeof timingHint.canClickNow === 'boolean' && !timingHint.canClickNow) {
      return false;
    }

    let didClick = false;
    if (typeof this.gameInstance.devAutoClickFunc === 'function') {
      didClick = Boolean(this.gameInstance.devAutoClickFunc(judgement));
    } else if (typeof this.gameInstance.devInjectJudgementFunc === 'function') {
      this.gameInstance.devInjectJudgementFunc(judgement, { persistent: true });
      didClick = true;
    }

    if (didClick && !(this.gameInstance && this.gameInstance.isEasterEgg)) {
      this.playAutoClickSound();
    }

    return didClick;
  }

  startAutoClickerLoop() {
    if (!this.autoClickerEnabled || this.autoClickerTimer) return;
    this.runAutoClickerTick();
    this.autoClickerTimer = window.setInterval(() => {
      if (!this.autoClickerEnabled) {
        this.stopAutoClickerLoop();
        return;
      }
      this.runAutoClickerTick();
    }, 80);
  }

  stopAutoClickerLoop() {
    if (this.autoClickerTimer) {
      window.clearInterval(this.autoClickerTimer);
    }
    this.autoClickerTimer = null;
  }

  setGameInstance(instance) {
    this.gameInstance = instance;
    this.updateActionButtonStates?.();

    if (instance && instance.isKeyPressMode && typeof instance.setPlaybackSpeed === 'function') {
      instance.setPlaybackSpeed(this.keyPressSpeed);
    }
    if (this.autoClickerEnabled) {
      this.startAutoClickerLoop();
    } else {
      this.stopAutoClickerLoop();
    }
  }

  async localPreviewTile(tile) {
    const guideCanvas = document.getElementById('pattern-guide-canvas');
    if (!guideCanvas) {
      console.log('%c❌ No guide canvas found for local preview', 'color: #ff4444;');
      return;
    }

    const guideCtx = guideCanvas.getContext('2d');
    const pm = new AudioSchedulerPM();
    try {
      await pm.init();
    } catch (err) {
      console.log('%c❌ Audio init failed for preview', 'color: #ff4444;');
    }
    const bpm = 120;
    pm.setBPM(bpm);

    const patternDelays = pm.getBeatPattern(tile);
    const now = pm.getCurrentTime();
    const leadTime = 0.8;
    const preBuffer = Math.min(Math.max(leadTime * 1.0, 0.2), 1.2);
    const guideStart = now;
    const beatStart = guideStart + preBuffer;

    // Schedule audio
    pm.playTileBeat(tile, beatStart);

    // Draw guide
    const guide = new PatternGuide(guideCtx, guideCanvas, { xPct: 0.5, y: 12, minWidth: 320, height: 96 });
    const scheduledTimeline = patternDelays.map(d => beatStart + d);
    try {
      guideCanvas.hidden = false;
      guide.update({ timelineTimes: scheduledTimeline, userPresses: [], rollingOffset: 0, renderOffset: 0, leadTime, tolerance: getPatternMemoryTimingTolerance('noob'), visible: true });

      // animate the guide using requestAnimationFrame and sync ghost presses
      let rafId = null;
      const startNow = now;
      const scheduledTimeouts = [];

      const frame = () => {
        try {
          guideCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
          guide.draw(pm.getCurrentTime());
        } catch (err) {
          // ignore draw errors during preview
        }
        rafId = window.requestAnimationFrame(frame);
      };
      frame();

      // ghost presses removed: do not inject synthetic presses during preview

      // cleanup after pattern finishes
      const lastDelay = (patternDelays.length ? patternDelays[patternDelays.length - 1] : 0);
      const totalMs = Math.round((preBuffer + lastDelay + 0.6) * 1000);
      const stopId = setTimeout(() => {
        if (rafId) window.cancelAnimationFrame(rafId);
        scheduledTimeouts.forEach((id) => clearTimeout(id));
        guideCanvas.hidden = true;
        try { pm.stop(); } catch (e) {}
      }, totalMs);
      scheduledTimeouts.push(stopId);

    } catch (err) {
      console.log('%c❌ Guide draw failed for preview', 'color: #ff4444;');
    }

    const scheduledMs = patternDelays.map(d => Math.round((beatStart + d - now) * 1000));
    const timesEl = document.getElementById('dev-tile-preview-times');
    if (timesEl) timesEl.textContent = 'Scheduled (ms): ' + scheduledMs.join(', ');

    // hide canvas after pattern finishes
    const duration = (patternDelays.length ? patternDelays[patternDelays.length - 1] : 0) + 0.4;
    setTimeout(() => {
      guideCanvas.hidden = true;
      try { pm.stop(); } catch (e) {}
    }, Math.round(duration * 1000 + preBuffer * 1000));
  }

  setActivationSequence(sequence) {
    if (Array.isArray(sequence) && sequence.length > 0) {
      this.activationSequence = this.normalizeActivationSequence(sequence);
      this.konamiIndex = 0;
      this.updateActivationInstructions();
    }
  }

  renderMediaPreview(assetKey) {
    const previewContainer = document.getElementById('dev-media-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';
    if (!assetKey) {
      previewContainer.textContent = 'No media selected.';
      return;
    }

    const asset = this.docsMediaAssets.find((item) => item.key === assetKey);
    if (!asset) {
      previewContainer.textContent = 'Media asset not found.';
      return;
    }

    if (asset.type === 'image') {
      const img = document.createElement('img');
      img.src = asset.src;
      img.alt = asset.label;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '180px';
      img.style.objectFit = 'contain';
      previewContainer.appendChild(img);
    } else if (asset.type === 'video') {
      const video = document.createElement('video');
      video.src = asset.src;
      video.controls = true;
      video.autoplay = false;
      video.style.maxWidth = '100%';
      video.style.maxHeight = '180px';
      previewContainer.appendChild(video);
    } else if (asset.type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = asset.src;
      audio.controls = true;
      audio.style.width = '100%';
      previewContainer.appendChild(audio);
      const label = document.createElement('div');
      label.textContent = asset.label;
      label.style.marginTop = '6px';
      label.style.fontSize = '10px';
      label.style.color = '#ccc';
      previewContainer.appendChild(label);
    } else {
      previewContainer.textContent = 'Unsupported media type.';
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
