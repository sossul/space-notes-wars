// ---------- Space Notes Wars ----------
// Canvas game world (stars, staff(s), enemies, player, lasers, explosions)
// + HTML overlay for HUD / piano keys / menus.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ===== Note theory =====
const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const FREQ = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50,
};

function parseNote(code) {
  return { letter: code[0], octave: parseInt(code[1], 10) };
}
function diatonicIndex(letter, octave) {
  return octave * 7 + LETTER_INDEX[letter];
}
// Indice absoluto (independiente de la clave): sirve para ordenar/comparar
// notas por tono real, sin importar en que pentagrama se dibujen.
function absIndex(code) {
  const { letter, octave } = parseNote(code);
  return diatonicIndex(letter, octave);
}

// Cada clave tiene su propio "ancla" (la nota de la linea inferior).
const CLEF_ANCHOR = {
  treble: diatonicIndex('E', 4), // linea inferior = Mi4
  bass: diatonicIndex('G', 2),   // linea inferior = Sol2
};
function stepOf(code, clef) {
  return absIndex(code) - CLEF_ANCHOR[clef];
}
// En modo "ambas claves", cada nota se dibuja en SU pentagrama natural:
// Do4 (central) para arriba -> clave de Sol; por debajo -> clave de Fa.
function clefForCode(code, clefMode) {
  if (clefMode !== 'both') return clefMode;
  return absIndex(code) >= diatonicIndex('C', 4) ? 'treble' : 'bass';
}

// Pasos (relativos a la linea inferior de CADA pentagrama) donde hace falta
// dibujar una linea adicional: fuera del pentagrama (step 0 a 8), cada 2 pasos.
function ledgerStepsFor(step) {
  const steps = [];
  if (step > 8) {
    for (let s = 10; s <= step; s += 2) steps.push(s);
  } else if (step < 0) {
    for (let s = -2; s >= step; s -= 2) steps.push(s);
  }
  return steps;
}

// ===== Progresion de notas: "de adentro hacia afuera", sumando de a poco =====
// Cada clave define grupos de notas nuevas por etapa (acumulativos). Se
// disenaron simetricos: clave de Sol crece desde Do4 hacia arriba, clave de
// Fa crece desde Do4 hacia abajo, y "ambas" crece en las dos direcciones a
// la vez desde el Do4 central (como una partitura de piano real).
const TREBLE_GROUPS = [
  ['C4', 'D4', 'E4'],
  ['F4', 'G4'],
  ['A4', 'B4'],
  ['C5', 'D5'],
  ['E5', 'F5'],
  ['G5', 'A5'],
  ['B3', 'A3'],
  ['B5', 'C6'],
];
const BASS_GROUPS = [
  ['C4', 'B3', 'A3'],
  ['G3', 'F3'],
  ['E3', 'D3'],
  ['C3', 'B2'],
  ['A2', 'G2'],
  ['F2', 'E2'],
  ['D4', 'E4'],
  ['D2', 'C2'],
];
const BOTH_GROUPS = [
  ['C4', 'D4', 'E4', 'B3', 'A3'],
  ['F4', 'G4', 'G3', 'F3'],
  ['A4', 'B4', 'E3', 'D3'],
  ['C5', 'D5', 'C3', 'B2'],
  ['E5', 'F5', 'A2', 'G2'],
  ['G5', 'A5', 'F2', 'E2'],
  ['B5', 'C6', 'D2', 'C2'],
];

function stageGroupsFor(clefMode) {
  if (clefMode === 'bass') return BASS_GROUPS;
  if (clefMode === 'both') return BOTH_GROUPS;
  return TREBLE_GROUPS;
}
function getMaxStageIdx(clefMode) { return stageGroupsFor(clefMode).length - 1; }
function cumulativeNotes(groups, uptoIdx) {
  let out = [];
  for (let i = 0; i <= uptoIdx; i++) out = out.concat(groups[i]);
  return out;
}
function getFullPool(clefMode) {
  const groups = stageGroupsFor(clefMode);
  return cumulativeNotes(groups, groups.length - 1);
}

// Afinacion de dificultad para el modo Clasico (una entrada por etapa).
const LEVEL_TUNING = [
  { spawnMs: 2200, speed: 55, hits: 8 },
  { spawnMs: 2000, speed: 62, hits: 9 },
  { spawnMs: 1850, speed: 70, hits: 10 },
  { spawnMs: 1700, speed: 78, hits: 11 },
  { spawnMs: 1600, speed: 85, hits: 12 },
  { spawnMs: 1500, speed: 92, hits: 13 },
  { spawnMs: 1400, speed: 100, hits: 14 },
  { spawnMs: 1300, speed: 108, hits: 16 },
];
function getClassicLevels(clefMode) {
  const groups = stageGroupsFor(clefMode);
  return groups.map((_, idx) => ({
    notes: cumulativeNotes(groups, idx),
    ...LEVEL_TUNING[idx],
  }));
}

// Modo Arcade (estilo "piano tiles"): el set de notas de la dificultad
// elegida queda FIJO toda la partida (Facil = siempre Do Re Mi, nunca suma
// mas). Lo unico que cambia es la velocidad, que sube SOLA con el tiempo
// (y un poco mas rapido con cada acierto) sin fin, hasta que pierdas.
const ARCADE_DIFFICULTIES = [
  { key: 'facil', label: 'Fácil', startFrac: 0, hitsPerStage: 6, baseSpeed: 55, speedGrowthPerHit: 3.5, speedGrowthPerSec: 1.4, baseSpawnMs: 2100, spawnShrinkPerHit: 30, minSpawnMs: 650, shields: 3 },
  { key: 'medio', label: 'Medio', startFrac: 0.15, hitsPerStage: 5, baseSpeed: 70, speedGrowthPerHit: 4.5, speedGrowthPerSec: 1.9, baseSpawnMs: 1800, spawnShrinkPerHit: 34, minSpawnMs: 520, shields: 3 },
  { key: 'dificil', label: 'Difícil', startFrac: 0.3, hitsPerStage: 5, baseSpeed: 85, speedGrowthPerHit: 5.6, speedGrowthPerSec: 2.4, baseSpawnMs: 1550, spawnShrinkPerHit: 38, minSpawnMs: 430, shields: 3 },
  { key: 'avanzado', label: 'Avanzado', startFrac: 0.55, hitsPerStage: 4, baseSpeed: 100, speedGrowthPerHit: 6.8, speedGrowthPerSec: 3.0, baseSpawnMs: 1350, spawnShrinkPerHit: 42, minSpawnMs: 360, shields: 3 },
  { key: 'mortal', label: 'Mortal', startFrac: 1, hitsPerStage: 15, baseSpeed: 130, speedGrowthPerHit: 8.5, speedGrowthPerSec: 3.8, baseSpawnMs: 1100, spawnShrinkPerHit: 46, minSpawnMs: 300, shields: 3 },
];
const ARCADE_MAX_SPEED = 600;
function getArcadeDifficulty(key) { return ARCADE_DIFFICULTIES.find((d) => d.key === key); }
function getArcadeConfig(clefMode, key) {
  const diff = getArcadeDifficulty(key);
  const startStageIdx = Math.round(diff.startFrac * getMaxStageIdx(clefMode));
  return { ...diff, startStageIdx };
}

// ===== Teclado del piano (HTML) =====
// Se reconstruye para cada partida segun la clave elegida, asi cada nota
// SIEMPRE tiene la misma tecla fisica mientras se juega esa clave.
const KEY_CHAR_PRIORITY = 'zxcvbnmasdfghjklqwertyuiop1234567890'.split('');
let KEYBOARD_MAP = {}; // tecla fisica -> codigo de nota
let REVERSE_KEYS = {}; // codigo de nota -> tecla fisica (para mostrar en el boton)
function buildKeyMaps(clefMode) {
  KEYBOARD_MAP = {};
  REVERSE_KEYS = {};
  const pool = [...getFullPool(clefMode)].sort((a, b) => absIndex(a) - absIndex(b));
  pool.forEach((code, i) => {
    const ch = KEY_CHAR_PRIORITY[i];
    KEYBOARD_MAP[ch] = code;
    REVERSE_KEYS[code] = ch.toUpperCase();
  });
}

// ===== Audio (Web Audio API, synthesized — sin archivos externos) =====
let actx = null;
function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

// ===== Silenciar sonido (persistente) =====
const MUTE_KEY = 'spaceNotesWars_muted';
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* no disponible */ }
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* no disponible */ }
  updateMuteBtn();
}
function updateMuteBtn() {
  const btn = document.getElementById('muteBtn');
  btn.textContent = muted ? '🔇' : '🔊';
  btn.classList.toggle('isMuted', muted);
  btn.title = muted ? 'Activar sonido' : 'Silenciar sonido';
}

function pianoTone(freq) {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc2.type = 'sine';
  osc.frequency.value = freq;
  osc2.frequency.value = freq * 2;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  const gain2 = ac.createGain();
  gain2.gain.value = 0.08;
  osc.connect(gain); osc2.connect(gain2); gain2.connect(gain);
  gain.connect(ac.destination);
  osc.start(now); osc2.start(now);
  osc.stop(now + 0.95); osc2.stop(now + 0.95);
}
function laserSound() {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(now); osc.stop(now + 0.16);
}
function explosionSound() {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  const bufSize = ac.sampleRate * 0.3;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(120, now + 0.3);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
  src.start(now);
}
function missSound() {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = 140;
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(now); osc.stop(now + 0.1);
}
function damageSound() {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(now); osc.stop(now + 0.4);
}
function levelUpSound() {
  if (muted) return;
  const ac = audio();
  const now = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain); gain.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.36);
  });
}

// ===== Geometria de pentagrama(s) =====
const STAFF_LEFT = 230;
const STAFF_RIGHT = W - 40;
let LAYOUT = {};
function setClefLayout(clefMode) {
  if (clefMode === 'both') {
    LAYOUT = {
      treble: { bottomY: 215, halfStep: 7 },
      bass: { bottomY: 375, halfStep: 7 },
      playerY: 267,
      dangerTop: 110,
      dangerBottom: 470,
    };
  } else {
    const shared = { bottomY: 300, halfStep: 11 };
    LAYOUT = {
      treble: shared,
      bass: shared,
      playerY: 260,
      dangerTop: 60,
      dangerBottom: H - 120,
    };
  }
}
function noteY(code, clef) {
  const Lo = LAYOUT[clef];
  return Lo.bottomY - stepOf(code, clef) * Lo.halfStep;
}

const PLAYER_X = 60;
const PLAYER_Y = () => LAYOUT.playerY;

// ===== Game state =====
const state = {
  mode: 'classic',       // 'classic' | 'arcade'
  clefMode: 'treble',    // 'treble' | 'bass' | 'both'
  levelIdx: 0,           // clasico
  difficultyKey: 'facil',// arcade
  stageIdx: 0,           // arcade (etapa de notas activa)
  running: false,
  paused: false,
  score: 0,
  shields: 3,
  maxShields: 3,
  hits: 0,               // aciertos desde la ultima subida de etapa/nivel
  totalHits: 0,          // aciertos totales en la partida (arcade)
  speed: 60,
  spawnMs: 2000,
  distance: 0,
  enemies: [],
  lasers: [],
  particles: [],
  spawnTimer: 0,
  stars: [],
  nebulae: [],
  time: 0,
  elapsedTime: 0,
};

// ===== Records personales (localStorage) =====
const RECORDS_KEY = 'spaceNotesWars_records_v2';
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {}; } catch (e) { return {}; }
}
function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* almacenamiento no disponible */ }
}
function recordKey() {
  return state.mode === 'classic'
    ? `classic_${state.clefMode}_${state.levelIdx}`
    : `arcade_${state.clefMode}_${state.difficultyKey}`;
}
function getRecordFor(key) {
  const records = loadRecords();
  return records[key] || { score: 0, time: 0 };
}
function updateRecord(key, score, time) {
  const records = loadRecords();
  const current = records[key] || { score: 0, time: 0 };
  const improvedScore = score > current.score;
  const improvedTime = time > current.time;
  records[key] = { score: Math.max(score, current.score), time: Math.max(time, current.time) };
  saveRecords(records);
  return { improvedScore, improvedTime };
}
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ===== Niveles superados (modo Clasico, persistente) =====
const COMPLETED_KEY = 'spaceNotesWars_completed_v1';
function loadCompleted() {
  try { return JSON.parse(localStorage.getItem(COMPLETED_KEY)) || {}; } catch (e) { return {}; }
}
function saveCompleted(map) {
  try { localStorage.setItem(COMPLETED_KEY, JSON.stringify(map)); } catch (e) { /* no disponible */ }
}
function isLevelCompleted(clefMode, idx) {
  return !!loadCompleted()[`classic_${clefMode}_${idx}`];
}
function markLevelCompleted(clefMode, idx) {
  const map = loadCompleted();
  const key = `classic_${clefMode}_${idx}`;
  if (map[key]) return false; // ya estaba marcado
  map[key] = true;
  saveCompleted(map);
  return true; // recien superado por primera vez
}

// ===== Preferencia de clave (persistente) =====
const CLEF_PREF_KEY = 'spaceNotesWars_clef_pref';
function loadClefPref() {
  try { return localStorage.getItem(CLEF_PREF_KEY) || 'treble'; } catch (e) { return 'treble'; }
}
function saveClefPref(clefMode) {
  try { localStorage.setItem(CLEF_PREF_KEY, clefMode); } catch (e) { /* no disponible */ }
}
state.clefMode = loadClefPref();

function initBackground() {
  state.stars = [];
  for (let i = 0; i < 140; i++) {
    state.stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.3,
      speed: Math.random() * 40 + 20,
      tw: Math.random() * Math.PI * 2,
    });
  }
  state.nebulae = [];
  for (let i = 0; i < 4; i++) {
    state.nebulae.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 160 + 120,
      hue: Math.random() < 0.5 ? '120,255,180' : '160,120,255',
      speed: Math.random() * 10 + 4,
    });
  }
}

function commonReset() {
  state.running = true;
  state.paused = false;
  state.score = 0;
  state.maxShields = state.mode === 'arcade' ? getArcadeDifficulty(state.difficultyKey).shields : 3;
  state.shields = state.maxShields;
  state.hits = 0;
  state.totalHits = 0;
  state.distance = 0;
  state.elapsedTime = 0;
  state.enemies = [];
  state.lasers = [];
  state.particles = [];
  state.spawnTimer = 0;
  setClefLayout(state.clefMode);
  buildKeyMaps(state.clefMode);
  initBackground();
}

function startClassicLevel(idx) {
  audio();
  state.mode = 'classic';
  state.levelIdx = idx;
  commonReset();
  applyClassicLevel();
  goToGameScreen();
}

function applyClassicLevel() {
  const lvl = getClassicLevels(state.clefMode)[state.levelIdx];
  state.speed = lvl.speed;
  state.spawnMs = lvl.spawnMs;
  buildPianoKeys();
  updateHUD();
}

function startArcadeRun(diffKey) {
  audio();
  state.mode = 'arcade';
  state.difficultyKey = diffKey;
  const cfg = getArcadeConfig(state.clefMode, diffKey);
  state.stageIdx = cfg.startStageIdx;
  commonReset();
  state.speed = cfg.baseSpeed;
  state.spawnMs = cfg.baseSpawnMs;
  buildPianoKeys();
  updateHUD();
  goToGameScreen();
}

function goToGameScreen() {
  document.getElementById('modeScreen').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('arcadeScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
}

function getActiveNotes() {
  const groups = stageGroupsFor(state.clefMode);
  const idx = state.mode === 'classic' ? state.levelIdx : state.stageIdx;
  return cumulativeNotes(groups, idx);
}

function computeArcadeSpeed() {
  // Sin techo: en Arcade la velocidad sube para siempre, sin limite.
  const cfg = getArcadeConfig(state.clefMode, state.difficultyKey);
  return cfg.baseSpeed + cfg.speedGrowthPerHit * state.totalHits + cfg.speedGrowthPerSec * state.elapsedTime;
}
function computeArcadeSpawnMs() {
  const cfg = getArcadeConfig(state.clefMode, state.difficultyKey);
  const ms = cfg.baseSpawnMs - cfg.spawnShrinkPerHit * state.totalHits - 8 * state.elapsedTime;
  return Math.max(cfg.minSpawnMs, ms);
}

// ===== Enemy spawning =====
let enemySeq = 0;
function spawnEnemy() {
  const notes = getActiveNotes();
  const code = notes[Math.floor(Math.random() * notes.length)];
  const clef = clefForCode(code, state.clefMode);
  state.enemies.push({
    id: enemySeq++,
    code,
    clef,
    x: STAFF_RIGHT + 30,
    y: noteY(code, clef),
    hue: Math.floor(Math.random() * 60) + 190,
  });
}

// ===== Piano keys (HTML) =====
// Solo se muestran las teclas de las notas ya desbloqueadas (ordenadas de
// grave a aguda, como un piano real). La octava no se indica en la etiqueta:
// dos teclas "Do" distintas se distinguen por su posicion, igual que en un
// piano de verdad.
const pianoBar = document.getElementById('pianoBar');

function buildPianoKeys() {
  pianoBar.innerHTML = '';
  const notes = [...getActiveNotes()].sort((a, b) => absIndex(a) - absIndex(b));
  notes.forEach((code) => {
    const btn = document.createElement('div');
    btn.className = 'pianoKey';
    btn.dataset.code = code;
    const { letter } = parseNote(code);
    btn.innerHTML = `${SOLFEGE[letter]}<small>${REVERSE_KEYS[code]}</small>`;
    btn.addEventListener('pointerdown', () => tryFire(code));
    pianoBar.appendChild(btn);
  });
}

function flashKey(code, cls) {
  const el = pianoBar.querySelector(`[data-code="${code}"]`);
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 160);
}

// ===== Firing logic =====
function tryFire(code) {
  if (!state.running || state.paused) return;
  const unlocked = getActiveNotes().includes(code);
  if (!unlocked) return;
  flashKey(code, 'pressed');

  // Solo se puede disparar al enemigo mas cercano a la base (el primero en
  // llegar). No se puede "saltarse" ese enemigo para atacar a otro de atras.
  let closest = null;
  for (const e of state.enemies) {
    if (!closest || e.x < closest.x) closest = e;
  }
  if (!closest) {
    missSound();
    return;
  }
  if (closest.code === code) {
    hitEnemy(closest, code);
  } else {
    missSound();
    flashKey(code, 'wrong');
    if (state.mode === 'arcade') {
      loseShield(); // en Arcade fallar cuesta vida directamente (no empuja)
    } else {
      punishWrongGuess(); // en Clasico, empuja a los enemigos hacia la base
    }
  }
}

// Castigo por fallar en Clasico: todas las naves enemigas avanzan de golpe.
const WRONG_PENALTY_PX = 42;
function punishWrongGuess() {
  for (const e of state.enemies) e.x -= WRONG_PENALTY_PX;
  shakeScreen(5);
}

// Castigo por fallar en Arcade: pierde un escudo directo (nada de empujar,
// asi que spamear teclas al azar es arriesgado en vez de gratis).
function loseShield() {
  state.shields -= 1;
  damageSound();
  shakeScreen();
  updateHUD();
  if (state.shields <= 0) gameOver();
}

function hitEnemy(enemy, code) {
  state.lasers.push({ x0: PLAYER_X, y0: PLAYER_Y(), x1: enemy.x, y1: enemy.y, life: 0.12 });
  spawnExplosion(enemy.x, enemy.y, enemy.hue);
  laserSound();
  setTimeout(() => pianoTone(FREQ[code]), 60);
  setTimeout(explosionSound, 60);

  const points = state.mode === 'arcade' ? Math.round(10 * (1 + state.totalHits * 0.03)) : 10;
  state.score += points;
  state.hits += 1;
  if (state.mode === 'arcade') state.totalHits += 1;
  state.distance += 12;
  state.enemies = state.enemies.filter((e) => e !== enemy);
  advanceProgress();
  updateHUD();
}

function spawnExplosion(x, y, hue) {
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = Math.random() * 140 + 40;
    state.particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.5 + Math.random() * 0.3,
      age: 0,
      hue,
    });
  }
}

function advanceProgress() {
  if (state.mode === 'classic') {
    const lvl = getClassicLevels(state.clefMode)[state.levelIdx];
    if (state.hits >= lvl.hits) {
      state.hits = 0;
      markLevelCompleted(state.clefMode, state.levelIdx);
      const maxIdx = getMaxStageIdx(state.clefMode);
      if (state.levelIdx < maxIdx) {
        state.levelIdx++;
        applyClassicLevel();
        showLevelUpToast('¡Nivel superado!');
      } else {
        state.speed = Math.min(ARCADE_MAX_SPEED, state.speed * 1.06);
        state.spawnMs = Math.max(650, state.spawnMs * 0.94);
        showLevelUpToast('¡Velocidad aumentada!');
      }
      levelUpSound();
    }
  }
  // Arcade: el set de notas de la dificultad NUNCA cambia durante la partida
  // (por eso "Facil" es siempre Do Re Mi) y no hay avisos de progreso: solo
  // la velocidad sube sola, sin fin, sin interrupciones.
}

function showLevelUpToast(text) {
  const toast = document.getElementById('levelUpToast');
  toast.textContent = text || '¡Nivel superado!';
  toast.classList.remove('hidden');
  void toast.offsetWidth;
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
  setTimeout(() => toast.classList.add('hidden'), 1400);
}

function enemyEscaped(enemy) {
  state.shields -= 1;
  damageSound();
  shakeScreen();
  state.enemies = state.enemies.filter((e) => e !== enemy);
  updateHUD();
  if (state.shields <= 0) {
    gameOver();
  }
}

let shakeAmt = 0;
function shakeScreen(amount) { shakeAmt = amount || 10; }

function gameOver() {
  state.running = false;
  const key = recordKey();
  const { improvedScore, improvedTime } = updateRecord(key, state.score, state.elapsedTime);
  const record = getRecordFor(key);
  let recordMsg = '';
  if (improvedScore || improvedTime) recordMsg = '<br><b class="recordMsg">🏆 ¡Nuevo récord personal!</b>';

  const progressLine = state.mode === 'classic'
    ? `Nivel alcanzado: ${state.levelIdx + 1} / ${getMaxStageIdx(state.clefMode) + 1}`
    : `Dificultad: ${getArcadeDifficulty(state.difficultyKey).label} · Velocidad final: ${Math.round(state.speed)} px/s`;

  document.getElementById('finalScore').innerHTML =
    `Puntaje: ${state.score} · Tiempo: ${formatTime(state.elapsedTime)}<br>${progressLine}` +
    `<br><span class="recordLine">Mejor aquí: ${record.score} pts · ${formatTime(record.time)}</span>` +
    recordMsg;
  document.getElementById('gameOverScreen').classList.remove('hidden');
  buildClassicLevelMenu();
  buildArcadeMenu();
}

// ===== HUD =====
function clefLabel(clefMode) {
  return clefMode === 'treble' ? 'Clave de Sol' : clefMode === 'bass' ? 'Clave de Fa' : 'Ambas claves';
}

function updateHUD() {
  document.getElementById('score').textContent = state.score;
  if (state.mode === 'classic') {
    document.getElementById('levelLabel').textContent = `Nivel ${state.levelIdx + 1} / ${getMaxStageIdx(state.clefMode) + 1}`;
  } else {
    document.getElementById('levelLabel').textContent = `${getArcadeDifficulty(state.difficultyKey).label} · ${Math.round(state.speed)} px/s`;
  }

  // La barra de progreso solo tiene sentido en Clasico (cuanto falta para el
  // siguiente nivel). En Arcade no hay "siguiente nivel", asi que se oculta.
  const progressBarEl = document.getElementById('progressBar');
  if (state.mode === 'classic') {
    progressBarEl.style.display = '';
    const hitsNeeded = getClassicLevels(state.clefMode)[state.levelIdx].hits;
    const pct = Math.min(100, (state.hits / hitsNeeded) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
  } else {
    progressBarEl.style.display = 'none';
  }
  document.getElementById('distanceLabel').textContent = `🚀 ${state.distance} km`;
  document.getElementById('timeLabel').textContent = `⏱ ${formatTime(state.elapsedTime)}`;

  const shieldsEl = document.getElementById('shields');
  shieldsEl.innerHTML = '';
  for (let i = 0; i < state.maxShields; i++) {
    const s = document.createElement('div');
    s.className = 'shieldIcon' + (i < state.shields ? '' : ' lost');
    shieldsEl.appendChild(s);
  }
}

// ===== Drawing =====
function drawBackground(dt) {
  ctx.fillStyle = '#04050a';
  ctx.fillRect(0, 0, W, H);

  for (const n of state.nebulae) {
    n.x -= n.speed * dt;
    if (n.x < -n.r) n.x = W + n.r;
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(${n.hue},0.10)`);
    g.addColorStop(1, `rgba(${n.hue},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of state.stars) {
    s.x -= s.speed * dt;
    if (s.x < 0) s.x = W;
    s.tw += dt * 4;
    const a = 0.5 + Math.sin(s.tw) * 0.4;
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, a)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOneStaff(clef) {
  const Lo = LAYOUT[clef];
  const ratio = Lo.halfStep / 11;

  ctx.save();
  ctx.strokeStyle = 'rgba(100,220,255,0.55)';
  ctx.shadowColor = 'rgba(100,220,255,0.8)';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = Lo.bottomY - i * Lo.halfStep * 2;
    ctx.beginPath();
    ctx.moveTo(STAFF_LEFT, y);
    ctx.lineTo(STAFF_RIGHT, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#8fd1ff';
  ctx.font = `bold ${Math.round(74 * ratio)}px Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(100,220,255,0.7)';
  ctx.shadowBlur = 10;
  const glyph = clef === 'treble' ? '\u{1D11E}' : '\u{1D122}';
  const gx = STAFF_LEFT - 90 * ratio;
  const gy = clef === 'treble' ? Lo.bottomY - Lo.halfStep * 4 + 6 * ratio : Lo.bottomY - Lo.halfStep * 3;
  ctx.fillText(glyph, gx, gy);
  ctx.restore();
}

function drawStaff() {
  const clefs = state.clefMode === 'both' ? ['treble', 'bass'] : [state.clefMode];
  for (const clef of clefs) drawOneStaff(clef);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,80,80,0.4)';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(PLAYER_X + 34, LAYOUT.dangerTop);
  ctx.lineTo(PLAYER_X + 34, LAYOUT.dangerBottom);
  ctx.stroke();
  ctx.restore();
}

function drawLedger(x, y) {
  ctx.strokeStyle = 'rgba(220,240,255,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x + 16, y);
  ctx.stroke();
}

// Cada nota enemiga ES un invader (imagen real, sin fondo) + un "palito"
// dibujado como el stem de una nota musical real (notaHead + stem, como en
// una partitura de verdad). Se dibuja centrado exactamente en la posicion
// de altura (x,y) de su pentagrama, asi que su lugar en las lineas/espacios
// queda tan claro como sea posible (nada de ambiguedad entre, por ejemplo,
// Do y Re).
const invaderImg = new Image();
invaderImg.src = 'invader.png';
// La imagen completa es el invader (cuerpo, con su brazo derecho) + el
// "palito" (stem) que sube desde ese brazo hasta arriba del todo, como el
// stem de una nota musical real. Se ancla por el CENTRO DEL CUERPO (no por
// el centro de toda la imagen, que es mucho mas alta por el palito), para
// que la posicion de altura en el pentagrama siga siendo exacta.
const INVADER_NATURAL_W = 331;
const INVADER_NATURAL_H = 605;
const INVADER_BODY_W = 269;       // ancho del cuerpo dentro de la imagen
const INVADER_BODY_CENTER_X = 135; // centro del cuerpo, en px de la imagen original
const INVADER_BODY_CENTER_Y = 484;
const INVADER_TARGET_BODY_W = 22; // ancho final en pantalla (chico, a pedido)
const INVADER_SCALE = INVADER_TARGET_BODY_W / INVADER_BODY_W;
const INVADER_DRAW_W = INVADER_NATURAL_W * INVADER_SCALE;
const INVADER_DRAW_H = INVADER_NATURAL_H * INVADER_SCALE;
const INVADER_ANCHOR_X = INVADER_BODY_CENTER_X * INVADER_SCALE;
const INVADER_ANCHOR_Y = INVADER_BODY_CENTER_Y * INVADER_SCALE;

function drawEnemy(e) {
  const { x, y } = e;
  const Lo = LAYOUT[e.clef];
  // lineas adicionales si la nota cae fuera de SU pentagrama (arriba o abajo)
  for (const s of ledgerStepsFor(stepOf(e.code, e.clef))) {
    drawLedger(x, Lo.bottomY - s * Lo.halfStep);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = `hsla(${e.hue}, 90%, 70%, 0.85)`;
  ctx.shadowBlur = 6;

  if (invaderImg.complete && invaderImg.naturalWidth > 0) {
    ctx.drawImage(invaderImg, -INVADER_ANCHOR_X, -INVADER_ANCHOR_Y, INVADER_DRAW_W, INVADER_DRAW_H);
  }

  ctx.restore();
}

function drawPlayer() {
  const x = PLAYER_X, y = PLAYER_Y();
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createLinearGradient(-20, -20, 20, 20);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#a8c4ff');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#4a7fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(-16, -16);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-16, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // engine glow
  const flick = 6 + Math.sin(state.time * 20) * 3;
  const eg = ctx.createRadialGradient(-14, 0, 0, -14, 0, flick);
  eg.addColorStop(0, 'rgba(120,200,255,0.9)');
  eg.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(-14, 0, flick, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLasers(dt) {
  ctx.save();
  ctx.strokeStyle = '#7fe0ff';
  ctx.shadowColor = '#7fe0ff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  for (const l of state.lasers) {
    ctx.globalAlpha = Math.max(0, l.life / 0.12);
    ctx.beginPath();
    ctx.moveTo(l.x0, l.y0);
    ctx.lineTo(l.x1, l.y1);
    ctx.stroke();
    l.life -= dt;
  }
  ctx.restore();
  state.lasers = state.lasers.filter((l) => l.life > 0);
}

function drawParticles(dt) {
  for (const p of state.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
  }
  state.particles = state.particles.filter((p) => p.age < p.life);
  for (const p of state.particles) {
    const a = 1 - p.age / p.life;
    ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * a + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== Main loop =====
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  requestAnimationFrame(loop);

  ctx.save();
  if (shakeAmt > 0) {
    const dx = (Math.random() - 0.5) * shakeAmt;
    const dy = (Math.random() - 0.5) * shakeAmt;
    ctx.translate(dx, dy);
    shakeAmt *= 0.85;
    if (shakeAmt < 0.5) shakeAmt = 0;
  }

  drawBackground(dt);

  if (state.running && !state.paused) {
    state.time += dt;
    state.elapsedTime += dt;
    state.distance += Math.round(dt * 8);

    if (state.mode === 'arcade') {
      state.speed = computeArcadeSpeed();
      state.spawnMs = computeArcadeSpawnMs();
    }

    state.spawnTimer -= dt * 1000;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnTimer = state.spawnMs;
    }

    // Una sola velocidad compartida por TODOS los enemigos a la vez: nunca
    // se adelantan entre si, aunque la velocidad este subiendo con el tiempo.
    for (const e of state.enemies) e.x -= state.speed * dt;

    const escaping = state.enemies.filter((e) => e.x < PLAYER_X + 34);
    for (const e of escaping) enemyEscaped(e);

    if (state.time % 0.5 < dt) updateHUD();
  }

  drawStaff();
  for (const e of state.enemies) drawEnemy(e);
  drawPlayer();
  drawLasers(dt);
  drawParticles(dt);

  ctx.restore();
}
requestAnimationFrame(loop);

// ===== Input =====
window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (KEYBOARD_MAP[k]) tryFire(KEYBOARD_MAP[k]);
  if (k === 'escape') togglePause();
});

// ===== Menus: modo -> clave -> nivel/dificultad =====
function describeLevel(clefMode, idx) {
  const groups = stageGroupsFor(clefMode);
  const prevNotes = idx === 0 ? [] : cumulativeNotes(groups, idx - 1);
  const notes = cumulativeNotes(groups, idx);
  const sorted = [...notes].sort((a, b) => absIndex(a) - absIndex(b));
  const newOnes = sorted.filter((c) => !prevNotes.includes(c));
  const newNames = [...new Set(newOnes.map((c) => SOLFEGE[parseNote(c).letter]))].join(' ');

  let tag = null;
  if (idx === groups.length - 1) {
    tag = 'rango completo · modo experto';
  } else if (clefMode !== 'both') {
    const steps = sorted.map((c) => stepOf(c, clefMode));
    const prevSteps = prevNotes.map((c) => stepOf(c, clefMode));
    const prevMax = prevSteps.length ? Math.max(...prevSteps) : null;
    const prevMin = prevSteps.length ? Math.min(...prevSteps) : null;
    const maxStep = Math.max(...steps), minStep = Math.min(...steps);
    if (prevMax !== null && maxStep > 8 && prevMax <= 8) tag = 'sale por ARRIBA del pentagrama';
    else if (prevMin !== null && minStep < -2 && prevMin >= -2) tag = 'baja por DEBAJO del pentagrama';
  } else {
    const needsLedger = (c) => ledgerStepsFor(stepOf(c, clefForCode(c, clefMode))).length > 0;
    const ledgerNow = notes.some(needsLedger);
    const ledgerBefore = prevNotes.some(needsLedger);
    if (ledgerNow && !ledgerBefore) tag = 'usa líneas adicionales';
  }

  return {
    title: idx === 0 ? sorted.map((c) => SOLFEGE[parseNote(c).letter]).join(' ') : `+ ${newNames}`,
    tag,
  };
}

function buildClassicLevelMenu() {
  const grid = document.getElementById('levelGrid');
  grid.innerHTML = '';
  const levels = getClassicLevels(state.clefMode);
  levels.forEach((lvl, idx) => {
    const { title, tag } = describeLevel(state.clefMode, idx);
    const key = `classic_${state.clefMode}_${idx}`;
    const record = getRecordFor(key);
    const recordHtml = record.score > 0
      ? `<div class="lvlRecord">🏆 ${record.score} pts · ${formatTime(record.time)}</div>` : '';
    const completed = isLevelCompleted(state.clefMode, idx);
    const card = document.createElement('button');
    card.className = 'levelCard' + (completed ? ' completed' : '');
    card.innerHTML = `
      <div class="lvlNum">Nivel ${idx + 1} ${completed ? '<span class="doneCheck">✅ Superado</span>' : ''}</div>
      <div class="lvlNotes">${title}</div>
      ${tag ? `<div class="lvlTag">${tag}</div>` : ''}
      ${recordHtml}
    `;
    card.addEventListener('click', () => startClassicLevel(idx));
    grid.appendChild(card);
  });
}

function buildArcadeMenu() {
  const grid = document.getElementById('arcadeGrid');
  grid.innerHTML = '';
  ARCADE_DIFFICULTIES.forEach((diff) => {
    const cfg = getArcadeConfig(state.clefMode, diff.key);
    const startNotes = cumulativeNotes(stageGroupsFor(state.clefMode), cfg.startStageIdx)
      .sort((a, b) => absIndex(a) - absIndex(b));
    const startNames = [...new Set(startNotes.map((c) => SOLFEGE[parseNote(c).letter]))].join(' ');
    const key = `arcade_${state.clefMode}_${diff.key}`;
    const record = getRecordFor(key);
    const recordHtml = record.score > 0
      ? `<div class="lvlRecord">🏆 ${record.score} pts · ${formatTime(record.time)}</div>` : '';
    const hearts = '❤'.repeat(diff.shields) + '🖤'.repeat(3 - diff.shields);
    const card = document.createElement('button');
    card.className = 'levelCard arcadeCard arcade-' + diff.key;
    card.innerHTML = `
      <div class="lvlNum">${diff.label}</div>
      <div class="lvlNotes">Notas fijas: ${startNames}</div>
      <div class="lvlTag hearts">${hearts}</div>
      ${recordHtml}
    `;
    card.addEventListener('click', () => startArcadeRun(diff.key));
    grid.appendChild(card);
  });
}

function buildClefSelector(containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  const options = [
    { key: 'treble', label: '𝄞 Clave de Sol' },
    { key: 'bass', label: '𝄢 Clave de Fa' },
    { key: 'both', label: '𝄞𝄢 Ambas' },
  ];
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'clefBtn' + (state.clefMode === opt.key ? ' active' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      state.clefMode = opt.key;
      saveClefPref(opt.key);
      buildClefSelector('clefSelectClassic');
      buildClefSelector('clefSelectArcade');
      buildClassicLevelMenu();
      buildArcadeMenu();
    });
    el.appendChild(btn);
  });
}

function showModeScreen() {
  state.running = false;
  state.paused = false;
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('arcadeScreen').classList.add('hidden');
  document.getElementById('modeScreen').classList.remove('hidden');
}

function showClassicMenu() {
  document.getElementById('modeScreen').classList.add('hidden');
  document.getElementById('arcadeScreen').classList.add('hidden');
  buildClefSelector('clefSelectClassic');
  buildClassicLevelMenu();
  document.getElementById('overlay').classList.remove('hidden');
}

function showArcadeMenu() {
  document.getElementById('modeScreen').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  buildClefSelector('clefSelectArcade');
  buildArcadeMenu();
  document.getElementById('arcadeScreen').classList.remove('hidden');
}

function backToModeMenu() {
  state.running = false;
  state.paused = false;
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  showModeScreen();
}

// vuelve a la pantalla de seleccion que corresponda al modo que se jugo
function backToSelectMenu() {
  state.running = false;
  state.paused = false;
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  if (state.mode === 'classic') showClassicMenu(); else showArcadeMenu();
}

function retrySame() {
  if (state.mode === 'classic') startClassicLevel(state.levelIdx);
  else startArcadeRun(state.difficultyKey);
}

// ===== Menu wiring =====
document.getElementById('modeClassicBtn').addEventListener('click', showClassicMenu);
document.getElementById('modeArcadeBtn').addEventListener('click', showArcadeMenu);
document.getElementById('backFromClassicBtn').addEventListener('click', backToModeMenu);
document.getElementById('backFromArcadeBtn').addEventListener('click', backToModeMenu);
document.getElementById('retryBtn').addEventListener('click', retrySame);
document.getElementById('menuFromGameOverBtn').addEventListener('click', backToSelectMenu);
document.getElementById('menuFromPauseBtn').addEventListener('click', backToSelectMenu);
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('restartBtn').addEventListener('click', () => {
  if (!state.running) return;
  document.getElementById('pauseScreen').classList.add('hidden');
  retrySame(); // vuelve a arrancar el mismo nivel/dificultad desde cero
});
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('muteBtn').addEventListener('click', toggleMute);
updateMuteBtn();

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  document.getElementById('pauseScreen').classList.toggle('hidden', !state.paused);
}

setClefLayout(state.clefMode);
buildKeyMaps(state.clefMode);
buildPianoKeys();
updateHUD();
initBackground();
showModeScreen();
