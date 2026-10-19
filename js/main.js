import * as THREE from '../vendor/three.module.min.js';
import { Sky } from './sky.js';
import { Plane } from './plane.js';
import { World } from './world.js';
import { Particles } from './particles.js';
import { Sound } from './audio.js';

// --- piccole utilità -------------------------------------------------------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage non disponibile: pazienza */ }
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ?t=21 forza l'ora, ?ciclo fa scorrere la giornata in un paio di minuti
const params = new URLSearchParams(location.search);
const forcedHour = params.has('t') ? parseFloat(params.get('t')) : NaN;
const cycle = params.has('ciclo');
function currentHour(elapsed) {
  if (cycle) return (elapsed * 0.2 + 6) % 24;
  if (!Number.isNaN(forcedHour)) return ((forcedHour % 24) + 24) % 24;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// --- scena -----------------------------------------------------------------

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 45, 240);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
camera.position.set(0, 2.5, 7.5);

const sky = new Sky(scene);
const world = new World(scene);
const plane = new Plane(scene);
const particles = new Particles(scene);
const sound = new Sound(store.get('aeroplanino.muted', false));

// --- stato di gioco --------------------------------------------------------

let state = 'intro'; // intro | playing | paused
let elapsed = 0;
let playTime = 0;
let speed = 16;
let score = 0;
let best = store.get('aeroplanino.best', 0);
const startBest = best;
let recordShown = false;
let combo = 0;
let comboTimer = 0;
let trailTimer = 0;
let wasInCloud = false;
let boundX = 8;
const Y_MID = 0.5;
const Y_HALF = 4.5;

const MILESTONES = {
  10: 'bel volo',
  25: 'che leggerezza',
  50: 'sopra le nuvole',
  100: 'wow! che volo',
  200: 'il cielo è tuo',
  350: 'stai dominando',
  500: 'leggendario ✦',
  1000: 'stai splendendo ✦✦',
};

// una frase diversa a ogni visita
const TITLES = [
  'pronti al decollo',
  'ora di volare',
  'vento in coda',
  'cielo libero',
  'si parte',
  'rotta verso le nuvole',
  'piega, lancia, vola',
  'pista libera',
];

const input = { x: 0, y: 0, keys: new Set() };
const caught = [];
const tipL = new THREE.Vector3();
const tipR = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const WARM = new THREE.Color(0xfff0b8);
const GOLD = new THREE.Color(0xffc23d);

// --- interfaccia -----------------------------------------------------------

const ui = {
  intro: $('intro'),
  pause: $('pause'),
  hud: $('hud'),
  score: $('score'),
  best: $('best'),
  mute: $('mute'),
  toast: $('toast'),
  veil: $('veil'),
};
ui.best.textContent = `record ${best}`;
$('title').textContent = TITLES[Math.floor(Math.random() * TITLES.length)];

function syncMuteButton() {
  ui.mute.classList.toggle('off', sound.muted);
  ui.mute.setAttribute('aria-label', sound.muted ? 'Attiva suoni' : 'Disattiva suoni');
}
syncMuteButton();

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800);
}

let bumpTimer = 0;
function setScore(v) {
  const before = score;
  score = v;
  ui.score.textContent = score;
  if (!reducedMotion) {
    ui.score.classList.add('bump');
    clearTimeout(bumpTimer);
    bumpTimer = setTimeout(() => ui.score.classList.remove('bump'), 120);
  }
  for (const m of Object.keys(MILESTONES)) {
    if (before < m && score >= m) toast(MILESTONES[m]);
  }
  if (score > best) {
    best = score;
    ui.best.textContent = `record ${best}`;
    store.set('aeroplanino.best', best);
    if (!recordShown && startBest > 0) {
      recordShown = true;
      toast('nuovo record ✦');
    }
  }
}

function start(withGesture = true) {
  if (state !== 'intro') return;
  if (withGesture) sound.init();
  state = 'playing';
  ui.intro.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  input.x = clamp(plane.position.x / boundX, -1, 1);
  input.y = clamp((plane.position.y - Y_MID) / Y_HALF, -1, 1);
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  ui.pause.classList.remove('hidden');
  sound.suspend();
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  ui.pause.classList.add('hidden');
  sound.init();
  clock.getDelta();
}

function toggleMute() {
  sound.setMuted(!sound.muted);
  store.set('aeroplanino.muted', sound.muted);
  syncMuteButton();
}

ui.intro.addEventListener('click', () => start());
ui.pause.addEventListener('click', resume);
ui.mute.addEventListener('click', e => {
  e.stopPropagation();
  toggleMute();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// --- controlli -------------------------------------------------------------

let dragging = null;
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', e => {
  if (state !== 'playing') return;
  if (e.pointerType === 'mouse') {
    // il mouse indica direttamente dove andare
    input.x = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
    input.y = clamp(-((e.clientY / innerHeight) * 2 - 1) * 1.15, -1, 1);
  } else if (dragging && dragging.id === e.pointerId) {
    // col dito si trascina in modo relativo, così il dito non copre l'aereo
    input.x = clamp(input.x + (e.clientX - dragging.x) / (innerWidth * 0.4), -1, 1);
    input.y = clamp(input.y - (e.clientY - dragging.y) / (innerHeight * 0.35), -1, 1);
    dragging.x = e.clientX;
    dragging.y = e.clientY;
  }
});
const endDrag = e => {
  if (dragging && dragging.id === e.pointerId) dragging = null;
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') toggleMute();
  else if ((k === ' ' || k === 'enter') && state === 'intro') start();
  else if ((k === ' ' || k === 'enter') && state === 'paused') resume();
  else if (k === 'p' || k === 'escape') state === 'paused' ? resume() : pause();
  else input.keys.add(k);
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
});
window.addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => input.keys.clear());

function applyKeys(dt) {
  const k = input.keys;
  const r = 1.6 * dt;
  if (k.has('arrowleft') || k.has('a')) input.x = clamp(input.x - r, -1, 1);
  if (k.has('arrowright') || k.has('d')) input.x = clamp(input.x + r, -1, 1);
  if (k.has('arrowup') || k.has('w')) input.y = clamp(input.y + r, -1, 1);
  if (k.has('arrowdown') || k.has('s')) input.y = clamp(input.y - r, -1, 1);
}

// --- dimensioni ------------------------------------------------------------

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 72 : 60;
  camera.updateProjectionMatrix();
  boundX = clamp(camera.aspect * 5.5, 3.2, 9);
  world.setBounds(boundX);
  particles.setScale(h * pr * 0.5);
}
window.addEventListener('resize', resize);
resize();

// --- ciclo principale ------------------------------------------------------

const clock = new THREE.Clock();

function update(dt) {
  elapsed += dt;
  const playing = state === 'playing';

  // cielo e luci secondo l'ora
  sky.setHour(currentHour(elapsed));
  scene.fog.color.copy(sky.fogColor);
  scene.background = sky.fogColor;
  world.setLook(sky.horizon, sky.night);
  plane.setLook(sky.horizon, sky.night);
  document.body.classList.toggle('day', sky.night < 0.35);
  ui.veil.style.setProperty('--veil', `#${sky.fogColor.getHexString(THREE.SRGBColorSpace)}`);

  // dove vuole andare l'aereo
  let tx;
  let ty;
  if (playing) {
    applyKeys(dt);
    tx = input.x * boundX;
    ty = Y_MID + input.y * Y_HALF;
  } else {
    // in attesa: l'aereo plana da solo
    tx = Math.sin(elapsed * 0.35) * boundX * 0.5;
    ty = Y_MID + Math.sin(elapsed * 0.6) * 1.8;
  }

  const cloud = world.cloudAt(plane.position);
  if (cloud > 0.15 && !wasInCloud) {
    wasInCloud = true;
    if (playing) sound.whoosh();
  } else if (cloud < 0.05) {
    wasInCloud = false;
  }

  if (playing) playTime += dt;
  const cruise = 20 + Math.min(playTime * 0.04, 8);
  const targetSpeed = (playing ? cruise : 16) * (1 - cloud * 0.35);
  speed += (targetSpeed - speed) * (1 - Math.exp(-dt * 2));

  plane.update(dt, tx, ty, elapsed, reducedMotion ? 0 : cloud * 0.06);
  world.update(dt, speed, elapsed, true);

  // raccolta delle lucine
  if (playing) {
    comboTimer -= dt;
    for (const o of world.collect(plane.position, caught)) {
      combo = comboTimer > 0 ? combo + 1 : 0;
      comboTimer = 2.2;
      sound.chime(combo, o.golden);
      particles.burst(o.x, o.y, o.z, o.golden ? GOLD : WARM, o.golden ? 46 : 16, o.golden ? 7 : 4);
      if (o.golden) trailTimer = 5;
      setScore(score + (o.golden ? 5 : 1));
    }
  }

  // scie
  plane.wingtips(tipL, tipR);
  if (!reducedMotion) {
    particles.emit(tipL.x, tipL.y, tipL.z, 0, 0, 0, WHITE, 0.16, 0.6, 0.22);
    particles.emit(tipR.x, tipR.y, tipR.z, 0, 0, 0, WHITE, 0.16, 0.6, 0.22);
  }
  if (trailTimer > 0) {
    trailTimer -= dt;
    const n = reducedMotion ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const tip = i % 2 ? tipL : tipR;
      particles.emit(
        tip.x, tip.y, tip.z,
        (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0,
        GOLD, 0.22 + Math.random() * 0.2, 1.2, 0.9,
      );
    }
  }
  particles.update(dt, speed);

  // camera che segue l'aereo
  const p = plane.position;
  camTarget.set(p.x * 0.75, p.y * 0.75 + 1.9, 7.5);
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 4));
  if (!reducedMotion && cloud > 0) {
    camera.position.x += (Math.random() - 0.5) * 0.05 * cloud;
    camera.position.y += (Math.random() - 0.5) * 0.05 * cloud;
  }
  lookTarget.set(p.x * 0.85, p.y * 0.85 + 0.6, -12);
  camera.lookAt(lookTarget);
  camera.rotation.z += plane.roll * 0.22;
  sky.follow(camera, elapsed);

  ui.veil.style.opacity = (cloud * 0.6).toFixed(3);
  sound.update(speed, cloud, playing);
}

// ?vola salta la schermata iniziale; l'audio si sblocca al primo tocco
if (params.has('vola')) start(false);
const unlockAudio = () => {
  if (state === 'playing') sound.init();
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state !== 'paused') update(dt);
  renderer.render(scene, camera);
});
