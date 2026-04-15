import { AudioScheduler } from './audio.js';
import { startBeatClick } from './modes/beatclick.js';
import startKeyPress from './modes/keypress.js';
import startPatternMemory from './modes/patternmemory.js';

const STORAGE_USERS = 'rtr-users-v1';
const DEFAULT_KEYBINDS = { A: 'KeyA', S: 'KeyS', D: 'KeyD', F: 'KeyF' };
const DEFAULT_DIFFICULTY = 'noob';
const difficultyPresets = {
  noob: { bpm: 30, perfect: 1.05, good: 1.12, leadTime: 1.8, patternStart: 4, patternBeats: 6, patternIncrease: false },
  ez: { bpm: 60, perfect: 1.045, good: 1.1, leadTime: 1.7, patternStart: 4, patternBeats: 6, patternIncrease: false },
  veteran: { bpm: 100, perfect: 0.05, good: 0.12, leadTime: 0.8, patternStart: 4, patternBeats: 8, patternIncrease: true },
  experienced: { bpm: 120, perfect: 0.035, good: 0.075, leadTime: 0.6, patternStart: 4, patternBeats: 8, patternIncrease: true },
  expert: { bpm: 140, perfect: 0.02, good: 0.05, leadTime: 0.5, patternStart: 5, patternBeats: 10, patternIncrease: true },
  pro: { bpm: 160, perfect: 0.015, good: 0.03, leadTime: 0.4, patternStart: 6, patternBeats: 12, patternIncrease: true }
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
const profileModal = document.getElementById('profile-modal');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginCancelBtn = document.getElementById('login-cancel-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileUsername = document.getElementById('profile-username');
const overallBest = document.getElementById('overall-best');
const totalPlays = document.getElementById('total-plays');
const modeStatsDiv = document.getElementById('mode-stats');
const bindInputs = {
  A: document.getElementById('bind-a'),
  S: document.getElementById('bind-s'),
  D: document.getElementById('bind-d'),
  F: document.getElementById('bind-f')
};
const profileInfo = document.getElementById('profile-info');

const modeButtons = {
  beat: document.getElementById('btn-beat'),
  key: document.getElementById('btn-key'),
  pattern: document.getElementById('btn-pattern')
};

let audioScheduler = null;
let gameInstance = null;
let selectedMode = 'beat'; // default mode
let isGameRunning = false;
let currentUser = null;
let currentPasswordHash = null;
let currentKeybinds = { ...DEFAULT_KEYBINDS };
let currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };

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

function validateUsername(username) {
  return /^[a-zA-Z0-9_-]{3,16}$/.test(username);
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

function updateHeaderControls() {
  if (currentUser) {
    loginBtn.textContent = currentUser;
    loginBtn.onclick = showProfileModal;
  } else {
    loginBtn.textContent = 'Log in';
    loginBtn.onclick = showLoginModal;
  }
}

function showLoginModal() {
  loginModal.hidden = false;
  usernameInput.focus();
}

function hideLoginModal() {
  loginModal.hidden = true;
  usernameInput.value = '';
  passwordInput.value = '';
}

function showSettingsModal() {
  loadKeybindInputs();
  settingsModal.hidden = false;
}

function hideSettingsModal() {
  settingsModal.hidden = true;
}

function hideProfileModal() {
  profileModal.hidden = true;
}

function showProfileModal() {
  if (!currentUser) return;
  profileUsername.textContent = currentUser;
  overallBest.textContent = currentProgress.bestScore || 0;
  totalPlays.textContent = currentProgress.totalPlays || 0;
  
  modeStatsDiv.innerHTML = '';
  const modes = ['beat', 'key', 'pattern'];
  modes.forEach(mode => {
    const stats = currentProgress.modeStats[mode] || { bestScore: 0, plays: 0, accuracy: 0 };
    const div = document.createElement('div');
    div.className = 'stat-item';
    div.innerHTML = `
      <strong>${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode:</strong><br>
      Best Score: ${stats.bestScore}, Plays: ${stats.plays}, Avg Accuracy: ${stats.accuracy}%
    `;
    modeStatsDiv.appendChild(div);
  });
  
  profileModal.hidden = false;
}

function loadKeybindInputs() {
  Object.keys(bindInputs).forEach((label) => {
    bindInputs[label].value = currentKeybinds[label] || DEFAULT_KEYBINDS[label];
  });
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

function saveProgress(score, accuracy) {
  if (!currentUser) return;
  currentProgress.totalPlays += 1;
  currentProgress.bestScore = Math.max(currentProgress.bestScore || 0, score);
  
  // Update mode stats
  if (!currentProgress.modeStats[selectedMode]) {
    currentProgress.modeStats[selectedMode] = { bestScore: 0, plays: 0, totalAccuracy: 0 };
  }
  const modeStats = currentProgress.modeStats[selectedMode];
  modeStats.plays += 1;
  modeStats.bestScore = Math.max(modeStats.bestScore, score);
  modeStats.totalAccuracy += accuracy;
  modeStats.accuracy = Math.round(modeStats.totalAccuracy / modeStats.plays);
  
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
    currentProgress = { bestScore: 0, totalPlays: 0, modeStats: {} };
    users[username] = {
      passwordHash,
      keybinds: { ...DEFAULT_KEYBINDS },
      progress: encryptText(JSON.stringify(currentProgress), passwordHash)
    };
    setStoredUsers(users);
    showMessage(`Profile created: ${username}.`);
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
  hideLoginModal();
}

function stopGame() {
  if (!isGameRunning) return;
  if (gameInstance && gameInstance.stop) {
    gameInstance.stop();
  }
  if (audioScheduler) {
    audioScheduler.stopScheduler();
  }
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

loginBtn.addEventListener('click', showLoginModal);
signupBtn.addEventListener('click', showLoginModal);
settingsBtn.addEventListener('click', showSettingsModal);
loginSubmitBtn.addEventListener('click', loginUser);
loginCancelBtn.addEventListener('click', hideLoginModal);
saveSettingsBtn.addEventListener('click', () => {
  Object.keys(bindInputs).forEach((label) => {
    const value = bindInputs[label].value.trim().toUpperCase();
    currentKeybinds[label] = value.startsWith('KEY') ? value : `Key${value}`;
  });
  saveUserData();
  hideSettingsModal();
  showMessage('Settings saved.');
});
cancelSettingsBtn.addEventListener('click', () => {
  if (currentUser) {
    loadKeybindInputs();
  }
  hideSettingsModal();
});
closeProfileBtn.addEventListener('click', hideProfileModal);

// Close modals on escape key and handle backspace
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    hideLoginModal();
    hideSettingsModal();
    hideProfileModal();
  }
  if (e.code === 'Backspace' && isGameRunning) {
    e.preventDefault();
    stopGame();
  }
});

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
  audioScheduler = new AudioScheduler();
  audioScheduler.setBPM(difficulty.bpm);
  await audioScheduler.init();

  switch (selectedMode) {
    case 'beat':
      gameInstance = startBeatClick(audioScheduler, canvas, {
        onUpdateHUD: updateHUD,
        difficulty: difficulty
      });
      break;
    case 'key':
      gameInstance = startKeyPress({
        canvas,
        audioScheduler,
        onUpdateHUD: updateHUD,
        difficulty,
        keybinds: currentKeybinds
      });
      break;
    case 'pattern':
      gameInstance = startPatternMemory({
        canvas,
        audioScheduler,
        onUpdateHUD: updateHUD,
        difficulty
      });
      break;
  }

  gameInstance.start();
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
  // Save progress on each update for mode stats
  if (currentUser && accuracy !== undefined) {
    saveProgress(score, accuracy);
  }
}

function initialiseUI() {
  updateHeaderControls();
  updateProfileInfo();
}

initialiseUI();

