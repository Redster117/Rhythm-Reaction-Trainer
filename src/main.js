// src/main.js
import { AudioScheduler } from './audio.js';
import { startBeatClick } from './modes/beatclick.js';
import startKeyPress from './modes/keypress.js';
import startPatternMemory from './modes/patternmemory.js';
import { initDevControls } from './developerControls.js';

const STORAGE_USERS = 'rtr-users-v1';
const STORAGE_KEYBINDS = 'rtr-keybinds-v1';
const DEFAULT_KEYBINDS = { A: 'KeyA', S: 'KeyS', D: 'KeyD', F: 'KeyF' };
const DEFAULT_DIFFICULTY = 'noob';
const difficultyPresets = {
  noob: { bpm: 40, perfect: 1.05, good: 1.12, leadTime: 1.8, patternStart: 4, patternBeats: 6, patternIncrease: false },
  ez: { bpm: 80, perfect: 1.045, good: 1.1, leadTime: 1.7, patternStart: 4, patternBeats: 6, patternIncrease: false },
  veteran: { bpm: 130, perfect: 0.05, good: 0.12, leadTime: 0.8, patternStart: 4, patternBeats: 8, patternIncrease: true },
  experienced: { bpm: 150, perfect: 0.035, good: 0.075, leadTime: 0.6, patternStart: 4, patternBeats: 8, patternIncrease: true },
  expert: { bpm: 170, perfect: 0.02, good: 0.05, leadTime: 0.5, patternStart: 5, patternBeats: 10, patternIncrease: true },
  pro: { bpm: 190, perfect: 0.015, good: 0.03, leadTime: 0.4, patternStart: 6, patternBeats: 12, patternIncrease: true }
};

const canvas = document.getElementById('game-canvas');
const startBtn = document.getElementById('start-btn');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const settingsBtn = document.getElementById('settings-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const difficultySelect = document.getElementById('difficulty');
const loginModal = document.getElementById('login-modal');
const settingsModal = document.getElementById('settings-modal');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginCancelBtn = document.getElementById('login-cancel-btn');
const signupCancelBtn = document.getElementById('signup-cancel-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const bindInputs = {
  A: document.getElementById('bind-a'),
  S: document.getElementById('bind-s'),
  D: document.getElementById('bind-d'),
  F: document.getElementById('bind-f')
};
const profileInfo = document.getElementById('profile-info');
const demoGif = document.getElementById('demo-gif');

const modeButtons = {
  beat: document.getElementById('btn-beat'),
  key: document.getElementById('btn-key'),
  pattern: document.getElementById('btn-pattern')
};

let spinningHeavyHoverActive = false;
let spinningHeavySequenceIndex = 0;
const spinningHeavyOpenSequence = ['KeyT', 'KeyW', 'KeyO', 'KeyF', 'KeyO', 'KeyR', 'KeyT'];
const spinningHeavyCloseSequence = ['KeyN', 'KeyE', 'KeyD', 'KeyA'];
let spinningHeavyOverlay = null;
let spinningHeavyAudio = null;
let demoGifUnlocked = false;
let demoGifUnlockReady = false;
const DEMOGIF_ACTIVATION_SEQUENCE = ['KeyN', 'KeyE', 'KeyD', 'KeyA'];
const DEMOGIF_BIND_ORDER = ['A', 'S', 'D', 'F'];


let audioScheduler = null;
let gameInstance = null;
let devControls = initDevControls();
let selectedMode = 'beat'; // default mode
let isGameRunning = false;
let currentUser = null;
let currentPasswordHash = null;
let currentKeybinds = { ...DEFAULT_KEYBINDS };
let currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
let statsDisplayed = false;

const signupModal = document.getElementById('signup-modal');
const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordInput = document.getElementById('signup-password');
const signupConfirmPasswordInput = document.getElementById('signup-confirm-password');
const signupSubmitBtn = document.getElementById('signup-submit-btn');
const signupError = document.getElementById('signup-error');
const accountPanel = document.getElementById('account-panel');
const logoutBtn = document.getElementById('logout-btn');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const resetBeatBtn = document.getElementById('reset-beat-btn');
const resetKeyBtn = document.getElementById('reset-key-btn');
const resetPatternBtn = document.getElementById('reset-pattern-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return arrayBufferToHex(digest);
}

function deriveXorKey(hash) {
  return new TextEncoder().encode(hash.slice(0, 64));
}

function xorData(data, key) {
  return data.map((byte, index) => byte ^ key[index % key.length]);
}

function encryptText(text, hash) {
  const key = deriveXorKey(hash);
  const data = new TextEncoder().encode(text);
  const encoded = xorData(Array.from(data), key);
  return btoa(String.fromCharCode(...encoded));
}

function decryptText(cipher, hash) {
  try {
    const key = deriveXorKey(hash);
    const bytes = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
    const decoded = xorData(Array.from(bytes), key);
    return new TextDecoder().decode(new Uint8Array(decoded));
  } catch {
    return null;
  }
}

function getStoredUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_USERS) || '{}');
}

function setStoredUsers(users) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function getStoredKeybinds() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYBINDS) || 'null') || null;
}

function setStoredKeybinds(keybinds) {
  localStorage.setItem(STORAGE_KEYBINDS, JSON.stringify(keybinds));
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_-]{3,16}$/.test(username);
}

function validatePassword(password) {
  return password.length >= 8 &&
         /[a-z]/.test(password) &&
         /[A-Z]/.test(password) &&
         /\d/.test(password) &&
         /[!@#$%^&*()_+\-={};':"\\|,.<>\/?]/.test(password);
}

function showMessage(message, isError = false) {
  profileInfo.textContent = message;
  profileInfo.style.color = isError ? '#ff6b6b' : '#9aa0a6';
}

function updateProfileInfo() {
  if (!currentUser) {
    profileInfo.textContent = 'Playing as guest. Log in to save progress.';
  } else {
    profileInfo.textContent = `Logged in as ${currentUser}. Press Backspace to stop.`;
  }
}

function toggleStatsDisplay() {
  if (statsDisplayed) {
    updateProfileInfo();
    statsDisplayed = false;
  } else {
    displayStats();
    statsDisplayed = true;
  }
}

function displayStats() {
  const totalPlays = currentProgress.totalPlays || 0;
  const mostPlayedMode = getMostPlayedMode();
  const modeHighScores = getModeHighScores();
  profileInfo.innerHTML = `
    <strong>Stats for ${currentUser}:</strong><br>
    Total Plays: ${totalPlays}<br>
    Most Played Mode: ${mostPlayedMode}<br>
    <strong>High Scores per Mode:</strong><br>
    Beat: ${modeHighScores.beat}<br>
    Key: ${modeHighScores.key}<br>
    Pattern: ${modeHighScores.pattern}<br>
    <button id="view-detailed-stats">View Detailed Stats</button>
  `;
  setTimeout(() => {
    document.getElementById('view-detailed-stats').onclick = showDetailedStats;
  }, 0);
}

function getMostPlayedMode() {
  let maxPlays = 0;
  let mode = 'None';
  for (const m in currentProgress.modeStats) {
    let total = 0;
    for (const diff in currentProgress.modeStats[m]) {
      total += currentProgress.modeStats[m][diff].plays || 0;
    }
    if (total > maxPlays) {
      maxPlays = total;
      mode = m.charAt(0).toUpperCase() + m.slice(1);
    }
  }
  return mode;
}

function getModeHighScores() {
  const result = { beat: 0, key: 0, pattern: 0 };
  for (const mode in result) {
    let max = 0;
    for (const diff in currentProgress.modeStats[mode] || {}) {
      max = Math.max(max, currentProgress.modeStats[mode][diff].bestScore || 0);
    }
    result[mode] = max;
  }
  return result;
}

function showDetailedStats() {
  profileInfo.innerHTML = `
    <strong>Detailed Stats for ${currentUser}:</strong><br>
    <select id="mode-select-stats"><option value="beat">Beat</option>
      <option value="key">Key</option>
      <option value="pattern">Pattern</option>
    </select>
    <select id="sort-select">
      <option value="accuracy">Accuracy</option>
      <option value="precision">Precision</option>
      <option value="combo">Combo</option>
    </select>
    <select id="order-select">
      <option value="desc">High to Low</option>
      <option value="asc">Low to High</option>
    </select>
    <button id="apply-sort">Apply</button>
    <div id="stats-details"></div>
    <button id="back-to-summary">Back to Summary</button>
  `;
  document.getElementById('apply-sort').onclick = updateDetailedStats;
  document.getElementById('back-to-summary').onclick = () => displayStats();
  updateDetailedStats();
}

function updateDetailedStats() {
  const mode = document.getElementById('mode-select-stats').value;
  const sortBy = document.getElementById('sort-select').value;
  const order = document.getElementById('order-select').value;
  const stats = [];
  for (const diff in currentProgress.modeStats[mode] || {}) {
    const s = currentProgress.modeStats[mode][diff];
    stats.push({
      difficulty: diff,
      accuracy: s.accuracy || 0,
      precision: s.bestPrecision || Infinity,
      combo: s.bestCombo || 0,
      plays: s.plays || 0
    });
  }
  stats.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    if (sortBy === 'precision') {
      valA = valA === Infinity ? -1 : valA;
      valB = valB === Infinity ? -1 : valB;
    }
    if (order === 'desc') {
      return valB - valA;
    } else {
      return valA - valB;
    }
  });
  let html = '<table><tr><th>Difficulty</th><th>Plays</th><th>Accuracy</th><th>Best Precision</th><th>Best Combo</th></tr>';
  stats.forEach(s => {
    html += `<tr><td>${s.difficulty}</td><td>${s.plays}</td><td>${s.accuracy}%</td><td>${s.precision === Infinity ? 'N/A' : s.precision + 'ms'}</td><td>${s.combo}</td></tr>`;
  });
  html += '</table>';
  document.getElementById('stats-details').innerHTML = html;
}

function updateHeaderControls() {
  if (currentUser) {
    loginBtn.textContent = currentUser;
    loginBtn.onclick = toggleStatsDisplay;
    signupBtn.style.display = 'none';
  } else {
    loginBtn.textContent = 'Log in';
    loginBtn.onclick = toggleLoginModal;
    signupBtn.style.display = 'inline-block';
  }
}

function toggleLoginModal() {
  loginModal.hidden = !loginModal.hidden;
  if (!loginModal.hidden) {
    settingsModal.hidden = true;
    signupModal.hidden = true;
    usernameInput.focus();
  } else {
    usernameInput.value = '';
    passwordInput.value = '';
  }
}

function toggleSettingsModal() {
  settingsModal.hidden = !settingsModal.hidden;
  if (!settingsModal.hidden) {
    loginModal.hidden = true;
    signupModal.hidden = true;
    loadKeybindInputs();
    accountPanel.hidden = !currentUser;
  }
}

function normalizeKeybindInput(value) {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
  if (/^[0-9]$/.test(upper)) return `Digit${upper}`;
  if (upper === '-') return 'Minus';
  if (upper === '.') return 'Period';
  if (/^ARROW(UP|DOWN|LEFT|RIGHT)$/.test(upper)) {
    return `Arrow${upper.slice(5)}`;
  }
  return trimmed;
}

function displayKeybindLabel(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Minus') return '-';
  if (code === 'Period') return '.';
  return code;
}

function loadKeybindInputs() {
  Object.keys(bindInputs).forEach((label) => {
    bindInputs[label].value = displayKeybindLabel(currentKeybinds[label] || DEFAULT_KEYBINDS[label]);
  });
}

function isDemoGifActivationSequence() {
  return DEMOGIF_BIND_ORDER.every((label, index) => {
    const inputValue = bindInputs[label].value.trim();
    const normalized = inputValue.length ? normalizeKeybindInput(inputValue) : DEFAULT_KEYBINDS[label];
    return normalized === DEMOGIF_ACTIVATION_SEQUENCE[index];
  });
}

function showDemoGifIfUnlocked() {
  if (!demoGifUnlocked || !demoGif) return;

  // Create temporary overlay for Demoman.png
  const tempOverlay = document.createElement('div');
  tempOverlay.id = 'temp-demo-overlay';
  tempOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  tempOverlay.innerHTML = `
    <img id="temp-demo-image" src="docs/Demoman.png" alt="Demoman" style="max-width: 80%; max-height: 80%; object-fit: contain;" />
  `;

  document.body.appendChild(tempOverlay);

  // Play thats-racist.mp3
  const racistAudio = new Audio('docs/thats-racist.mp3');
  racistAudio.volume = 1;
  racistAudio.play().catch(() => {
    console.log('Failed to play thats-racist.mp3');
  });

  // When racist audio ends, wait 0.5 seconds, then switch to demo.gif
  racistAudio.addEventListener('ended', () => {
    console.log('thats-racist.mp3 ended, starting 0.5s delay');
    setTimeout(() => {
      console.log('0.5s delay done, switching to demo.gif');
      const tempImage = document.getElementById('temp-demo-image');
      if (tempImage) {
        tempImage.src = 'docs/demo.gif';
      }

      // Delay kahbeewm start so it ends when demo.gif ends (demo.gif: 2.67s, kahbeewm: 1.23s)
      setTimeout(() => {
        console.log('Starting kahbeewm.mp3 after additional delay');
        const kahbeewmAudio = new Audio('docs/kahbeeewm.mp3');
        kahbeewmAudio.volume = 1;
        kahbeewmAudio.play().catch(() => {
          console.log('Failed to play kahbeeewm.mp3');
        });

        // After kahbeewm audio ends, remove overlay and show bottom right gif
        kahbeewmAudio.addEventListener('ended', () => {
          console.log('kahbeewm.mp3 ended, removing overlay');
          tempOverlay.remove();
          demoGif.src = 'docs/kazotsky-kick-demoman.gif';
          demoGif.style.display = '';
        });
      }, 600); // 1.44 seconds after demo.gif starts (2.67 - 1.23 = 1.44)
    }, 500); // 0.5 seconds after racist audio ends
  });
}

function hideDemoGif() {
  if (!demoGif) return;
  demoGif.style.display = 'none';
}

function saveUserData() {
  if (!currentUser || !currentPasswordHash) return;
  const users = getStoredUsers();
  const encryptedProgress = encryptText(JSON.stringify(currentProgress), currentPasswordHash);
  users[currentUser] = {
    passwordHash: currentPasswordHash,
    keybinds: currentKeybinds,
    progress: encryptedProgress
  };
  setStoredUsers(users);
}

function saveProgress(score, accuracy, combo, perfects, precision) {
  if (!currentUser) return;
  currentProgress.totalPlays += 1;
  currentProgress.bestScore = Math.max(currentProgress.bestScore || 0, score);
  
  const difficulty = difficultySelect.value;
  if (!currentProgress.modeStats[selectedMode]) {
    currentProgress.modeStats[selectedMode] = {};
  }
  if (!currentProgress.modeStats[selectedMode][difficulty]) {
    currentProgress.modeStats[selectedMode][difficulty] = { bestScore: 0, plays: 0, totalAccuracy: 0, accuracy: 0, bestCombo: 0, totalPerfects: 0, bestPrecision: Infinity };
  }
  const modeStats = currentProgress.modeStats[selectedMode][difficulty];
  modeStats.plays += 1;
  modeStats.bestScore = Math.max(modeStats.bestScore, score);
  modeStats.totalAccuracy += accuracy;
  modeStats.accuracy = Math.round(modeStats.totalAccuracy / modeStats.plays);
  modeStats.bestCombo = Math.max(modeStats.bestCombo, combo);
  modeStats.totalPerfects += perfects;
  modeStats.bestPrecision = Math.min(modeStats.bestPrecision, precision);
  
  saveUserData();
  updateProfileInfo();
}

async function loginUser() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!validateUsername(username)) {
    showMessage('Username must be 3-16 letters, numbers, - or _.', true);
    return;
  }
  if (!password) {
    showMessage('Password is required.', true);
    return;
  }

  const passwordHash = await hashPassword(password);
  const users = getStoredUsers();
  if (!users[username]) {
    showMessage('Username not found. Please sign up first.', true);
    return;
  } else if (users[username].passwordHash !== passwordHash) {
    showMessage('Incorrect password.', true);
    return;
  } else {
    const decrypted = decryptText(users[username].progress, passwordHash);
    currentProgress = decrypted ? JSON.parse(decrypted) : { bestScore: 0, totalPlays: 0, modeStats: {} };
    currentKeybinds = users[username].keybinds || { ...DEFAULT_KEYBINDS };
    showMessage(`Welcome back, ${username}.`);
  }
  currentUser = username;
  currentPasswordHash = passwordHash;
  updateHeaderControls();
  updateProfileInfo();
  toggleLoginModal();
}

async function signupUser() {
  const username = signupUsernameInput.value.trim();
  const password = signupPasswordInput.value;
  const confirmPassword = signupConfirmPasswordInput.value;
  if (!validateUsername(username)) {
    showMessage('Username must be 3-16 letters, numbers, - or _.',  true);
    return;
  }
  if (!validatePassword(password)) {
    showMessage('Password must be at least 8 characters with upper, lower, number, and special character.', true);
    return;
  }
  if (password !== confirmPassword) {
    showMessage('Passwords do not match.', true);
    return;
  }

  const passwordHash = await hashPassword(password);
  const users = getStoredUsers();
  if (users[username]) {
    showMessage('Username already exists.', true);
    return;
  }

  currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
  users[username] = {
    passwordHash,
    keybinds: { ...currentKeybinds },
    progress: encryptText(JSON.stringify(currentProgress), passwordHash)
  };
  setStoredUsers(users);
  currentUser = username;
  currentPasswordHash = passwordHash;
  updateHeaderControls();
  updateProfileInfo();
  toggleSignupModal();
  showMessage(`Account created: ${username}.`);
}

function toggleSignupModal() {
  signupModal.hidden = !signupModal.hidden;
  if (!signupModal.hidden) {
    loginModal.hidden = true;
    settingsModal.hidden = true;
    signupUsernameInput.focus();
  } else {
    signupUsernameInput.value = '';
    signupPasswordInput.value = '';
    signupConfirmPasswordInput.value = '';
  }
}

function stopGame() {
  if (!isGameRunning) return;

  // Attempt to persist final stats from the running game instance before stopping
  try {
    if (gameInstance && typeof gameInstance.getState === 'function') {
      const st = gameInstance.getState();
      if (st) {
        const score = st.score || 0;
        const combo = st.combo || 0;
        const totals = st.totals || {};
        const perfects = totals.perfectCount || 0;
        const totalJudgements = totals.totalJudgements || 0;
        const totalOffset = totals.totalOffset || 0;
        const accuracy = totalJudgements ? Math.round(((totals.perfectCount || 0) + (totals.goodCount || 0)) / totalJudgements * 100) : 0;
        const precision = totalJudgements ? Math.round((totalOffset / totalJudgements) * 1000) : 0;
        // Save progress for this run
        saveProgress(score, accuracy, combo, perfects, precision);
      }
    }
  } catch (err) {
    // ignore errors while trying to persist
  }

  if (gameInstance && gameInstance.stop) {
    gameInstance.stop();
  }
  if (audioScheduler) {
    audioScheduler.stopScheduler && audioScheduler.stopScheduler();
  }
  devControls.setGameInstance(null);
  isGameRunning = false;
  Object.values(modeButtons).forEach((btn) => {
    btn.style.pointerEvents = 'auto';
    btn.style.opacity = '1';
  });
  startBtn.style.pointerEvents = 'auto';
  startBtn.style.opacity = '1';
  showMessage('Game stopped. You can choose a different mode.');
}

Object.keys(modeButtons).forEach((mode) => {
  modeButtons[mode].addEventListener('click', () => {
    if (isGameRunning) return;
    Object.values(modeButtons).forEach((btn) => btn.classList.remove('active'));
    modeButtons[mode].classList.add('active');
    selectedMode = mode;
  });
});

signupBtn.onclick = toggleSignupModal;
settingsBtn.onclick = toggleSettingsModal;
loginSubmitBtn.addEventListener('click', loginUser);
loginCancelBtn.addEventListener('click', () => { toggleLoginModal(); });

saveSettingsBtn.addEventListener('click', () => {
  Object.keys(bindInputs).forEach((label) => {
    const value = bindInputs[label].value.trim();
    currentKeybinds[label] = value.length ? normalizeKeybindInput(value) : DEFAULT_KEYBINDS[label];
  });
  setStoredKeybinds(currentKeybinds);
  saveUserData();
  demoGifUnlockReady = isDemoGifActivationSequence();
  if (demoGifUnlockReady) {
    } else {
    showMessage('Keybinds saved.');
  }
});

cancelSettingsBtn.addEventListener('click', () => {
  if (demoGifUnlockReady) {
    demoGifUnlocked = true;
    showDemoGifIfUnlocked();
    demoGifUnlockReady = false;
  }
  if (currentUser) {
    loadKeybindInputs();
  }
  toggleSettingsModal();
});

signupSubmitBtn.addEventListener('click', signupUser);
signupCancelBtn.addEventListener('click', () => { toggleSignupModal(); });

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  currentPasswordHash = null;
  currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
  currentKeybinds = getStoredKeybinds() || { ...DEFAULT_KEYBINDS };
  updateHeaderControls();
  updateProfileInfo();
  toggleSettingsModal();
  showMessage('Logged out.');
});

resetStatsBtn.addEventListener('click', () => {
  if (!confirm('Are you sure you want to reset all stats?')) return;
  currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
  saveUserData();
  updateProfileInfo();
  showMessage('All stats reset.');
});

resetBeatBtn.addEventListener('click', () => {
  if (!confirm('Are you sure you want to reset beat mode stats?')) return;
  if (currentProgress.modeStats.beat) {
    currentProgress.modeStats.beat = {};
  }
  saveUserData();
  updateProfileInfo();
  showMessage('Beat mode stats reset.');
});

resetKeyBtn.addEventListener('click', () => {
  if (!confirm('Are you sure you want to reset key mode stats?')) return;
  if (currentProgress.modeStats.key) {
    currentProgress.modeStats.key = {};
  }
  saveUserData();
  updateProfileInfo();
  showMessage('Key mode stats reset.');
});

resetPatternBtn.addEventListener('click', () => {
  if (!confirm('Are you sure you want to reset pattern mode stats?')) return;
  if (currentProgress.modeStats.pattern) {
    currentProgress.modeStats.pattern = {};
  }
  saveUserData();
  updateProfileInfo();
  showMessage('Pattern mode stats reset.');
});

deleteAccountBtn.addEventListener('click', () => {
  if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
  const users = getStoredUsers();
  delete users[currentUser];
  setStoredUsers(users);
  currentUser = null;
  currentPasswordHash = null;
  currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
  currentKeybinds = { ...DEFAULT_KEYBINDS };
  updateHeaderControls();
  updateProfileInfo();
  toggleSettingsModal();
  showMessage('Account deleted.');
});

// Close modals on escape and handle backspace to stop
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    loginModal.hidden = true;
    settingsModal.hidden = true;
    signupModal.hidden = true;
    closeSpinningHeavyOverlay();
  }
  if (e.code === 'Backspace' && isGameRunning) {
    e.preventDefault();
    stopGame();
  }

  if (!spinningHeavyOverlay && spinningHeavyHoverActive) {
    if (e.code === spinningHeavyOpenSequence[spinningHeavySequenceIndex]) {
      spinningHeavySequenceIndex += 1;
      if (spinningHeavySequenceIndex === spinningHeavyOpenSequence.length) {
        spinningHeavySequenceIndex = 0;
        showSpinningHeavyOverlay();
      }
    } else {
      spinningHeavySequenceIndex = e.code === spinningHeavyOpenSequence[0] ? 1 : 0;
    }
  } else if (spinningHeavyOverlay) {
    if (e.code === spinningHeavyCloseSequence[spinningHeavySequenceIndex]) {
      spinningHeavySequenceIndex += 1;
      if (spinningHeavySequenceIndex === spinningHeavyCloseSequence.length) {
        spinningHeavySequenceIndex = 0;
        closeSpinningHeavyOverlay();
      }
    } else {
      spinningHeavySequenceIndex = e.code === spinningHeavyCloseSequence[0] ? 1 : 0;
    }
  }
});

if (demoGif) {
  demoGif.addEventListener('mouseenter', () => {
    spinningHeavyHoverActive = true;
    spinningHeavySequenceIndex = 0;
  });
  demoGif.addEventListener('mouseleave', () => {
    spinningHeavyHoverActive = false;
    spinningHeavySequenceIndex = 0;
  });
}

function showSpinningHeavyOverlay() {
  if (spinningHeavyOverlay) return;

  spinningHeavyOverlay = document.createElement('div');
  spinningHeavyOverlay.id = 'spinning-heavy-overlay';
  spinningHeavyOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  spinningHeavyOverlay.innerHTML = `
    <img id="spinning-heavy-media" src="docs/spinning-heavy.gif" alt="Spinning heavy surprise" style="max-width: 95%; max-height: 95%; object-fit: contain;height: 700px;" />
  `;

  document.body.appendChild(spinningHeavyOverlay);
  if (demoGif) {
    demoGif.style.display = 'none';
  }
  document.getElementById('spinning-heavy-close')?.addEventListener('click', closeSpinningHeavyOverlay);
  spinningHeavyOverlay.addEventListener('click', (event) => {
    if (event.target === spinningHeavyOverlay) {
      closeSpinningHeavyOverlay();
    }
  });

  const spinningHeavyMedia = document.getElementById('spinning-heavy-media');
  if (spinningHeavyMedia) {
    spinningHeavyMedia.addEventListener('error', () => {
      spinningHeavyMedia.src = 'docs/demo.gif';
    });
  }

  playSpinningHeavyAudio();
}

function closeSpinningHeavyOverlay() {
  if (!spinningHeavyOverlay) return;
  spinningHeavyOverlay.remove();
  spinningHeavyOverlay = null;
  spinningHeavySequenceIndex = 0;
  stopSpinningHeavyAudio();
  // Hide demo.gif to require restarting the unlock cycle
  if (demoGif) {
    demoGif.style.display = 'none';
  }
  demoGifUnlocked = false;
  demoGifUnlockReady = false;
}

function playSpinningHeavyAudio() {
  if (spinningHeavyAudio) {
    stopSpinningHeavyAudio();
  }

  spinningHeavyAudio = new Audio('docs/spinning_heavy_audio.mp3');
  spinningHeavyAudio.loop = true;
  spinningHeavyAudio.volume = 0.65;
  spinningHeavyAudio.play().catch(() => {
    // Autoplay may be blocked; keep the audio object ready for user interaction.
  });
}

function stopSpinningHeavyAudio() {
  if (!spinningHeavyAudio) return;
  spinningHeavyAudio.pause();
  spinningHeavyAudio.currentTime = 0;
  spinningHeavyAudio = null;
}


startBtn.addEventListener('click', async () => {
  if (isGameRunning) return;
  
  isGameRunning = true;
  Object.values(modeButtons).forEach((btn) => {
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.5';
  });
  startBtn.style.pointerEvents = 'none';
  startBtn.style.opacity = '0.5';

  const difficulty = difficultyPresets[difficultySelect.value] || difficultyPresets[DEFAULT_DIFFICULTY];
  
  const difficultyWithLevel = { ...difficulty, level: difficultySelect.value };

  if (selectedMode !== 'pattern') {
    audioScheduler = new AudioScheduler();
    if (selectedMode === 'key') {
      audioScheduler.setSoundProfile('keypress');
    } else {
      audioScheduler.setSoundProfile('default');
    }
    audioScheduler.setBPM(difficulty.bpm);
    await audioScheduler.init();
  } else {
    audioScheduler = null; // Pattern mode uses its own audio
  }

switch (selectedMode) {
  case 'beat':
    gameInstance = startBeatClick(audioScheduler, canvas, {
      onUpdateHUD: updateHUD,
      difficulty: difficultyWithLevel,
      onGameEnd: stopGame
    });
    break;
  case 'key':
    gameInstance = startKeyPress({
      canvas,
      audioScheduler,
      onUpdateHUD: updateHUD,
      difficulty: difficultyWithLevel,
      keybinds: currentKeybinds,
      onGameEnd: stopGame
    });
    break;
  case 'pattern':
    const customPattern = devControls.isActive ? devControls.getConfiguredPattern() : null;
    gameInstance = startPatternMemory({
      canvas,
      audioScheduler,
      onUpdateHUD: updateHUD,
      difficulty: difficultyWithLevel,
      onGameEnd: stopGame,
      customPattern
    });
    break;
}

  // start the game instance
  if (gameInstance && typeof gameInstance.start === 'function') {
    // Set AudioScheduler BPM to match difficulty
    if (audioScheduler && typeof audioScheduler.setBPM === 'function') {
      audioScheduler.setBPM(difficultyWithLevel.bpm);
    }
    devControls.setGameInstance(gameInstance);
    gameInstance.start();
  }
});

function updateHUD({ score, combo, lastJudgement, accuracy, precision }) {
  document.getElementById('score').textContent = `Score: ${score}`;
  document.getElementById('combo').textContent = `Combo: ${combo}`;
  document.getElementById('last-judgement').textContent = `Last: ${lastJudgement}`;
  document.getElementById('accuracy').textContent = `Accuracy: ${accuracy ?? 100}%`;
  document.getElementById('precision').textContent = `Precision: ${precision ?? 0} ms`;
  if (score > (currentProgress.bestScore || 0)) {
    currentProgress.bestScore = score;
    saveUserData();
  }
  // Do not persist progress on every HUD update to avoid excessive writes.
  // Final progress is saved when the game stops (stopGame).
}

function loadStoredKeybinds() {
  const binds = getStoredKeybinds();
  if (binds && typeof binds === 'object') {
    currentKeybinds = { ...DEFAULT_KEYBINDS, ...binds };
  }
}

function initialiseUI() {
  loadStoredKeybinds();
  updateHeaderControls();
  updateProfileInfo();
  hideDemoGif();
}

initialiseUI();

