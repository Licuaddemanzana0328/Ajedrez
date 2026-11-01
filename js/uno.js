/**
 * Un0 EXTRA SUPREME
 * - Mazo infinito · 2 a 10 jugadores
 * - Cartas especiales: +10, +100, intercambio general, intercambio elegido
 * - Acumulación de castigos (+2, +4, +10, +100)
 * - Vista de mesa: tú abajo, oponentes arriba / izquierda / derecha
 * - Animaciones: repartir, robar, jugar, castigos, intercambios, selector de color
 */
'use strict';

/* ============================== UTILIDADES ============================== */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const mod = (n, m) => ((n % m) + m) % m;
const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX = { red: '#e23b3b', blue: '#1f72e8', green: '#2fa653', yellow: '#f6b90b' };
const COLOR_ES = { red: 'ROJO', blue: 'AZUL', green: 'VERDE', yellow: 'AMARILLO' };

const BOT_PROFILES = [
  { name: 'Luna', emoji: 'L', hue: 28 },
  { name: 'Max', emoji: 'M', hue: 200 },
  { name: 'Nova', emoji: 'N', hue: 290 },
  { name: 'Kiko', emoji: 'K', hue: 120 },
  { name: 'Zoe', emoji: 'Z', hue: 340 },
  { name: 'Rex', emoji: 'R', hue: 150 },
  { name: 'Mía', emoji: 'M', hue: 260 },
  { name: 'Toby', emoji: 'T', hue: 40 },
  { name: 'Lía', emoji: 'L', hue: 52 },
];
const ME_PROFILE = { emoji: 'T', hue: 210 };

/* ================================ SONIDO ================================ */
class SoundEffects {
  constructor() { this.ctx = null; }
  _c() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur = 0.1, { type = 'sine', vol = 0.1, delay = 0, slide = 0 } = {}) {
    const c = this._c(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  play()    { this.tone(520, 0.09, { type: 'triangle', slide: -220 }); this.tone(260, 0.12, { delay: 0.05 }); }
  draw()    { this.tone(680, 0.07, { type: 'triangle', slide: 260, vol: 0.07 }); }
  special() { this.tone(440, 0.1, { type: 'square', vol: 0.05 }); this.tone(660, 0.12, { type: 'square', vol: 0.05, delay: 0.09 }); }
  pick()    { this.tone(784, 0.12, { type: 'triangle' }); this.tone(1046, 0.18, { type: 'triangle', delay: 0.08 }); }
  penalty() { this.tone(220, 0.25, { type: 'sawtooth', vol: 0.06, slide: -120 }); }
  uno()     { this.tone(880, 0.1, { type: 'square', vol: 0.06 }); this.tone(1175, 0.2, { type: 'square', vol: 0.06, delay: 0.1 }); }
  win()     { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', delay: i * 0.12 })); }
}
const sfx = new SoundEffects();

/* ============================ ESTADO DE JUEGO ============================ */
let players = [];
let activePlayerIdx = 0;
let direction = 1;          // 1 = horario, -1 = antihorario
let discardCard = null;
let currentStack = 0;       // castigo acumulado (+2, +4, +10, +100)
let activeColor = 'red';
let gameFinished = false;
let busy = true;            // bloquea la entrada mientras hay animaciones / turno de bots
let humanDrew = false;
let config = { count: 4, name: 'Jugador 1', difficulty: 'normal' };
let seatEls = {};           // idx -> elementos DOM del asiento
let cardUid = 0;
let dealing = false;         // true mientras se reparten las cartas iniciales
let gameToken = 0;          // invalida partidas anteriores si se reinicia

/* ==================== BOTÓN Un0 ==================== */
// Al quedarte con 1 carta tienes UNO_WINDOW_MS para pulsar el botón (una sola vez por cada
// vez que te quedas con 1 carta). Si no lo haces y llega tu turno: robas UNO_PENALTY cartas y pierdes el turno.
const UNO_WINDOW_MS = 5000;
const UNO_PENALTY = 2;
const unoTrack = { active: false, declared: false, expired: false, deadline: 0, timer: null, tick: null };
let unoHold = false;         // true mientras una carta está volando al descarte (la ventana empieza al aterrizar)
let unoOnlineMode = false;

/* _rng: cuando se asigna una función, generateRandomCard la usa como fuente aleatoria (para partidas online sincronizadas) */
let _rng = null;
function seedRng(fn) { _rng = fn; }

/* ============================ MAZO INFINITO ============================ */
function generateRandomCard() {
  const r = _rng || Math.random.bind(Math);
  const rand100 = r() * 100;
  const color = COLORS[Math.floor(r() * COLORS.length)];
  const id = ++cardUid;

  if (rand100 < 0.2)  return { id, type: '+100', color: 'wild', label: '+100', val: 100 };
  if (rand100 < 2.0)  return { id, type: '+10', color: 'wild', label: '+10', val: 10 };
  if (rand100 < 5.0)  return { id, type: 'swap_all', color: 'wild', label: 'Todos' };
  if (rand100 < 8.0)  return { id, type: 'swap_target', color: 'wild', label: 'Elegir' };
  if (rand100 < 15.0) return { id, type: '+4', color: 'wild', label: '+4', val: 4 };
  if (rand100 < 22.0) return { id, type: 'wild', color: 'wild', label: 'Wild' };
  if (rand100 < 35.0) {
    const spec = ['skip', 'reverse', '+2'][Math.floor(r() * 3)];
    const labels = { skip: 'Salta', reverse: 'Reversa', '+2': '+2' };
    return { id, type: spec, color, label: labels[spec], val: spec === '+2' ? 2 : 0 };
  }
  const num = Math.floor(r() * 10);
  return { id, type: 'number', color, label: String(num), val: num };
}

/* ============================ DIBUJO DE CARTAS ============================ */
const ICONS = {
  skip: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="3.6"/><path d="M6.2 17.8L17.8 6.2" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>',
  reverse: '<svg viewBox="0 0 24 24" class="ico"><path d="M3.5 8h13.5M13.5 4l4 4-4 4M20.5 16H7M10.5 12l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap_all: '<svg viewBox="0 0 24 24" class="ico"><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12a7.5 7.5 0 0 1 12.8-5.3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M17.8 2.8v4.6h-4.6M6.2 21.2v-4.6h4.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap_target: '<svg viewBox="0 0 24 24" class="ico"><circle cx="4.5" cy="12" r="2.6" fill="currentColor"/><circle cx="19.5" cy="12" r="2.6" fill="currentColor"/><path d="M8.5 8c2.2-2.2 4.8-2.2 7 0M8.5 16c2.2 2.2 4.8 2.2 7 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15.5 4.8V8h-3.2M8.5 19.2V16h3.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wild: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.4 6.7L12 17.5l-6.1 3.4 1.4-6.7-5-4.7 6.8-.8z" fill="currentColor"/></svg>',
};

function symbolFor(card) {
  return ICONS[card.type] || card.label;
}

function createCardHTML(card) {
  const sym = symbolFor(card);
  const isIcon = sym.startsWith('<svg');
  const size = card.type === '+100' ? 'xl' : card.type === '+10' ? 'lg' : '';
  const mega = card.type === '+10' ? 'mega10' : card.type === '+100' ? 'mega100' : '';
  const sub = { wild: 'COMODÍN', swap_all: 'TODOS', swap_target: 'ELEGIR' }[card.type] || '';
  return `<div class="uno-card ${card.color} ${mega} ${size} ${isIcon ? 'icon' : ''}">
    <div class="face"><i class="oval"></i><b class="sym">${sym}</b>${sub ? `<em class="sub">${sub}</em>` : ''}
      <b class="corner tl">${sym}</b><b class="corner br">${sym}</b></div></div>`;
}

function createBackHTML(mini = false) {
  return `<div class="uno-card back ${mini ? 'mini' : ''}"><div class="face"><i class="oval"></i><b class="sym">Un0</b></div></div>`;
}

function htmlToEl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ============================ MEDIDAS / ANCLAS ============================ */
const cardW = () => $('probe').offsetWidth || 70;
const cardH = () => $('probe').offsetHeight || 102;
const miniW = () => $('probe-mini').offsetWidth || 30;
const rectOf = (el) => el.getBoundingClientRect();

function anchorOf(idx) {
  if (idx === 0) {
    const r = rectOf($('my-hand'));
    return { rect: new DOMRect(r.left, r.top + r.height * 0.55, r.width, 0), w: cardW() * 0.8, rot: 0 };
  }
  const s = seatEls[idx];
  return { rect: rectOf(s.fan), w: miniW(), rot: s.orient === 'left' ? 90 : s.orient === 'right' ? -90 : 0 };
}

/* ======================= MOTOR DE ANIMACIÓN (cartas voladoras) ======================= */
/**
 * Dibuja una carta que viaja de un punto a otro con arco y giro 3D.
 * from/to: DOMRect o función que lo devuelve (se evalúa al lanzar).
 * face: carta a mostrar al final (null = solo reverso). backStart: empieza boca abajo.
 */
async function flight(o) {
  const { face = null, backStart = false, from, to, fromW, toW, fromRot = 0, toRot = 0,
          duration = 520, delay = 0, arc = -60, onLand } = o;
  if (delay) await sleep(delay);
  if (REDUCE) { if (onLand) onLand(); return; }

  const f = typeof from === 'function' ? from() : from;
  const t = typeof to === 'function' ? to() : to;
  const cw = cardW(), ch = cardH();
  const fc = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
  const tc = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
  const s0 = (fromW || cw) / cw, s1 = (toW || cw) / cw;
  const dx = tc.x - fc.x, dy = tc.y - fc.y;

  const fl = document.createElement('div');
  fl.className = 'flyer';
  fl.innerHTML = `<div class="flip"><div class="f front">${face ? createCardHTML(face) : createBackHTML()}</div><div class="f rear">${createBackHTML()}</div></div>`;
  fl.style.left = `${fc.x - cw / 2}px`;
  fl.style.top = `${fc.y - ch / 2}px`;
  document.body.appendChild(fl);

  const flip = fl.firstElementChild;
  const a0 = face && backStart ? 180 : 0;
  if (a0 !== 0) {
    flip.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
      { duration: duration * 0.85, easing: 'ease-in-out', fill: 'both' });
  }

  const anim = fl.animate([
    { transform: `translate(0px,0px) rotate(${fromRot}deg) scale(${s0})` },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 + arc}px) rotate(${(fromRot + toRot) / 2}deg) scale(${((s0 + s1) / 2) * 1.14})`, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) rotate(${toRot}deg) scale(${s1})` },
  ], { duration, easing: 'cubic-bezier(.3,.7,.25,1)', fill: 'both' });

  try { await anim.finished; } catch (e) { /* cancelada */ }
  if (onLand) onLand();
  fl.remove();
}

/* Vuela N reversos de un jugador a otro (para los intercambios) */
function flyBacks(fromIdx, toIdx, count = 3, delay = 0) {
  const a = anchorOf(fromIdx), b = anchorOf(toIdx);
  return Promise.all(Array.from({ length: count }, (_, i) => flight({
    from: a.rect, to: b.rect, fromW: a.w, toW: b.w, fromRot: a.rot, toRot: b.rot,
    duration: 650, delay: delay + i * 90, arc: -90,
  })));
}

/* ============================ RENDER ============================ */
function layoutCounts(nOpp) {
  if (nOpp === 1) return { top: 1, side: 0 };
  if (nOpp === 2) return { top: 2, side: 0 };
  const side = Math.floor(nOpp / 3);
  return { top: nOpp - 2 * side, side };
}

function buildSeats() {
  ['top', 'left', 'right'].forEach((g) => { $(`group-${g}`).firstElementChild.innerHTML = ''; });
  seatEls = {};

  const nOpp = players.length - 1;
  const { top, side } = layoutCounts(nOpp);
  // Sentido horario desde tu asiento: izquierda (de abajo hacia arriba) → arriba → derecha
  const leftIdx = [], topIdx = [], rightIdx = [];
  for (let i = 1; i <= nOpp; i++) {
    if (i <= side) leftIdx.push(i);
    else if (i <= side + top) topIdx.push(i);
    else rightIdx.push(i);
  }
  const place = (idxs, orient, group, reverse = false) => {
    (reverse ? [...idxs].reverse() : idxs).forEach((idx) => {
      const p = players[idx];
      const seat = document.createElement('div');
      seat.className = `seat ${orient}`;
      seat.innerHTML = `
        <div class="who">
          <div class="avatar" style="--h:${p.hue}"><span class="emoji">${p.emoji}</span><b class="count">0</b></div>
          <div class="name"></div>
        </div>
        <div class="fan ${orient === 'top' ? 'h' : 'v ' + orient}"></div>`;
      seat.querySelector('.name').textContent = p.name;
      if (orient === 'top') seat.insertBefore(seat.querySelector('.fan'), seat.firstChild);
      $(`group-${group}`).firstElementChild.appendChild(seat);
      seatEls[idx] = { root: seat, fan: seat.querySelector('.fan'), count: seat.querySelector('.count'), orient };
    });
  };
  place(leftIdx, 'left', 'left', true);   // el más cercano a ti queda abajo
  place(topIdx, 'top', 'top');
  place(rightIdx, 'right', 'right');

  const me = players[0];
  $('me-name').textContent = me.name;
  $('me-avatar').style.setProperty('--h', me.hue);
  $('me-avatar').querySelector('.emoji').textContent = me.emoji;
  requestAnimationFrame(fitGroups);
}

function fitGroups() {
  document.querySelectorAll('.seat-group').forEach((g) => {
    const inner = g.firstElementChild;
    if (!inner || !inner.children.length) return;
    inner.style.transform = 'none';
    const vertical = g.classList.contains('left') || g.classList.contains('right');
    const avail = vertical ? g.clientHeight : g.clientWidth;
    const need = vertical ? inner.scrollHeight : inner.scrollWidth;
    const k = need > 0 ? Math.min(1, avail / need) : 1;
    inner.style.transform = k < 1 ? `scale(${k})` : 'none';
  });
}

function updateSeat(idx) {
  const p = players[idx];
  const n = p.hand.length;
  if (n !== 1) { p.unoSaid = false; p.unoDecided = false; }     // el "Un0" solo vale mientras tienes 1 carta
  if (idx === 0) {
    const c = $('me-count');
    if (c.textContent !== String(n)) { c.textContent = n; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    syncUnoButton();
    return;
  }
  const s = seatEls[idx];
  if (!s) return;
  if (s.count.textContent !== String(n)) {
    s.count.textContent = n; s.count.classList.remove('bump'); void s.count.offsetWidth; s.count.classList.add('bump');
  }
  const shown = Math.min(n, 12);
  s.fan.innerHTML = '';
  for (let i = 0; i < shown; i++) {
    const slot = document.createElement('div');
    slot.className = 'mini-slot';
    slot.innerHTML = createBackHTML(true);
    s.fan.appendChild(slot);
  }
  s.root.classList.toggle('uno', n === 1 && !!p.unoSaid && !dealing);   // solo si el jugador lo dijo
}

function renderHand() {
  const hand = players[0].hand;
  const box = $('my-hand');
  box.innerHTML = '';
  const n = hand.length;
  if (!n) return;

  const cw = cardW();
  const avail = Math.max(120, box.clientWidth - 8);
  const step = n > 1 ? Math.min(cw * 0.64, (avail - cw) / (n - 1)) : 0;
  const mid = (n - 1) / 2;
  const spread = Math.min(3.4, 42 / n);
  const canAct = activePlayerIdx === 0 && !busy && !gameFinished;

  hand.forEach((card, i) => {
    const el = htmlToEl(createCardHTML(card));
    const norm = mid ? (i - mid) / mid : 0;
    el.style.setProperty('--rot', `${((i - mid) * spread).toFixed(2)}deg`);
    el.style.setProperty('--ty', `${(norm * norm * Math.min(16, 90 / n + 6)).toFixed(1)}px`);
    el.dataset.rot = ((i - mid) * spread).toFixed(2);
    if (i > 0) el.style.marginLeft = `${step - cw}px`;
    if (canAct) el.classList.add(canPlayCard(card) ? 'playable' : 'dim');
    if (card._hid) el.style.visibility = 'hidden';
    el.addEventListener('click', () => onHandClick(i, el));
    box.appendChild(el);
  });
}

function setRing() {
  const ring = $('color-ring');
  const prev = ring.style.getPropertyValue('--ring');
  const next = COLOR_HEX[activeColor];
  ring.style.setProperty('--ring', next);
  if (prev && prev !== next) { ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); }
}

function updateCenter() {
  setRing();

  const badge = $('stack-counter');
  if (currentStack > 0) {
    const mine = activePlayerIdx === 0 && !busy;
    const text = `+${currentStack} ACUMULADOS`;
    const html = text + (mine ? '<small>Responde con un + o toca el mazo para tomarlas</small>' : '');
    if (badge.classList.contains('hidden') || badge.dataset.v !== String(currentStack)) {
      badge.style.animation = 'none'; void badge.offsetWidth; badge.style.animation = '';
    }
    badge.dataset.v = currentStack;
    badge.innerHTML = html;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    badge.dataset.v = 0;
  }

  $('turn-indicator').textContent = activePlayerIdx === 0 ? '¡Tu turno!' : `Turno: ${players[activePlayerIdx].name}`;
  $('direction-indicator').textContent = direction === 1 ? '↻ Horario' : '↺ Antihorario';
  $('dir-ring').classList.toggle('ccw', direction === -1);
}

function updateTurnHighlights() {
  Object.entries(seatEls).forEach(([idx, s]) => s.root.classList.toggle('active', Number(idx) === activePlayerIdx));
  $('me-info').classList.toggle('active', activePlayerIdx === 0);

  const myTurn = activePlayerIdx === 0 && !busy && !gameFinished;
  $('draw-deck').classList.toggle('hint', myTurn && (!humanDrew && (!players[0].hand.some(canPlayCard) || currentStack > 0)));
  $('pass-btn').classList.toggle('hidden', !(myTurn && humanDrew && currentStack === 0));
  renderUnoButton();
}

function renderAll() {
  updateCenter();
  players.forEach((_, i) => updateSeat(i));
  renderHand();
  updateTurnHighlights();
  fitGroups();
  unoSyncPlayers();
}

/* Pila de descarte visual (últimas cartas apiladas con giros distintos) */
function showOnPile(card, rot, animateLand = false) {
  const spot = $('discard-deck');
  const el = htmlToEl(createCardHTML(card));
  el.classList.add('pile-card');
  el.style.setProperty('--t', `rotate(${rot}deg)`);
  if (animateLand) el.classList.add('land');
  [...spot.children].forEach((c) => c.classList.add('old'));
  spot.appendChild(el);
  while (spot.children.length > 4) spot.firstElementChild.remove();
}

function toast(text, { kind = '', big = false } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${kind} ${big ? 'big' : ''}`;
  el.textContent = text;
  $('toast-layer').appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

/* ============================ REGLAS ============================ */
function isPlusCard(card) { return ['+2', '+4', '+10', '+100'].includes(card.type); }

function canPlayCard(card) {
  if (currentStack > 0) return isPlusCard(card);   // con castigo acumulado solo respondes con "+"
  if (card.color === 'wild') return true;
  return card.color === activeColor || (discardCard && card.label === discardCard.label);
}

/* ============================ ENTRAR / SALIR DE PARTIDA ============================ */
$('start-btn').addEventListener('click', () => {
  let count = parseInt($('player-count').value, 10);
  if (isNaN(count)) count = 4;
  count = Math.min(10, Math.max(2, count));
  if ($('player-count')) $('player-count').value = count;

  config = {
    count,
    name: ($('your-name').value || 'Jugador 1').trim().slice(0, 12) || 'Jugador 1',
    difficulty: $('bot-difficulty').value,
  };

  unoOnlineMode = false;
  if (typeof unoNet !== 'undefined') unoNet.role = 'solo';
  startGame();
});

$('again-btn').addEventListener('click', () => {
  $('win-modal').classList.add('hidden');
  if (unoOnlineMode) {
    if (unoNet.role === 'host') unoBeginOnlineTable();
    else toast('Espera a que el anfitrión abra otra partida', { kind: 'info' });
    return;
  }
  startGame();
});
$('menu-btn').addEventListener('click', () => {
  gameToken++;
  resetUnoTrack();
  if (unoOnlineMode && typeof leaveUnoGame === 'function') leaveUnoGame(false);
  $('win-modal').classList.add('hidden');
  $('game-app').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
});

async function startGame() {
  const token = ++gameToken;
  resetUnoTrack(); unoHold = false;
  busy = true; gameFinished = false; humanDrew = false;
  direction = 1; currentStack = 0; activePlayerIdx = 0; discardCard = null;
  $('log-list').innerHTML = '';
  $('discard-deck').innerHTML = '';
  $('toast-layer').innerHTML = '';
  $('stack-counter').classList.add('hidden');

  players = [{ name: config.name, isBot: false, hand: [], ...ME_PROFILE }];
  for (let i = 1; i < config.count; i++) {
    const prof = BOT_PROFILES[(i - 1) % BOT_PROFILES.length];
    players.push({ name: prof.name, isBot: true, hand: [], emoji: prof.emoji, hue: prof.hue });
  }

  // Carta inicial: siempre un número
  let first;
  do { first = generateRandomCard(); } while (first.type !== 'number');
  activeColor = first.color;

  $('setup-screen').classList.add('hidden');
  $('game-app').classList.remove('hidden');
  buildSeats();
  updateCenter();
  updateTurnHighlights();
  renderHand();
  await sleep(250);
  dealing = true;

  // Reparto animado (7 cartas a cada uno)
  const deals = [];
  let d = 0;
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < players.length; i++) {
      deals.push(dealOne(i, d++ * 32, token));
    }
  }
  await Promise.all(deals);
  if (token !== gameToken) return;
  dealing = false;
  players.forEach((_, i) => updateSeat(i));
  await sleep(150);

  // Voltea la primera carta
  discardCard = first;
  const rot = rand(-10, 10);
  await flight({
    face: first, backStart: true,
    from: () => rectOf($('draw-deck')), to: () => rectOf($('discard-deck')),
    toRot: rot, duration: 600, arc: -40,
    onLand: () => { showOnPile(first, rot, true); sfx.play(); },
  });
  if (token !== gameToken) return;
  logAction(`El juego comienza con ${COLOR_ES[first.color]} ${first.label}`);
  startTurn();
}

async function dealOne(idx, delay, token) {
  const card = generateRandomCard();
  const a = () => anchorOf(idx);
  await flight({
    face: idx === 0 ? card : null, backStart: true,
    from: () => rectOf($('draw-deck')), to: () => a().rect,
    fromW: cardW(), toW: a().w, toRot: a().rot, duration: 430, delay, arc: -30,
    onLand: () => {
      if (token !== gameToken) return;
      players[idx].hand.push(card);
      sfx.draw();
      if (idx === 0) renderHand();
      updateSeat(idx);
    },
  });
}

/* ============================ FLUJO DE TURNOS ============================ */
async function startTurn() {
  if (gameFinished) return;
  const token = gameToken;
  humanDrew = false;
  unoSyncPlayers();

  // Castigo por no haber dicho Un0: si llega tu turno con 1 carta y no lo dijiste a tiempo
  // robas cartas y pierdes el turno. (En online cada jugador aplica su propio castigo.)
  const cur = players[activePlayerIdx];
  if (cur && cur.hand.length === 1 && (!unoOnlineMode || activePlayerIdx === 0)) {
    const mustPay = activePlayerIdx === 0 ? (unoTrack.expired && !unoTrack.declared) : (cur.isBot && !cur.unoSaid);
    if (mustPay) { applyUnoPenalty(activePlayerIdx); return; }
  }

  if (players[activePlayerIdx].isBot) {
    if (unoOnlineMode && unoNet.role !== 'host') {
      busy = true;
      renderAll();
      return;
    }
    busy = true;
    renderAll();
    const wait = { easy: 1400, normal: 1000, hard: 700 }[config.difficulty] || 1000;
    await sleep(wait);
    if (token !== gameToken || gameFinished) return;
    await botPlay();
  } else {
    busy = (unoOnlineMode && activePlayerIdx !== 0);
    renderAll();
    if (!busy && unoOnlineMode) {
      toast('¡Tu turno! Juega una carta o roba.', { kind: 'info', big: true });
    }
  }
}

function onHandClick(idx, el) {
  if (activePlayerIdx !== 0 || busy || gameFinished) return;
  const card = players[0].hand[idx];
  if (!card) return;
  if (!canPlayCard(card)) {
    el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
    toast(currentStack > 0 ? 'Debes responder con un + (+2, +4, +10, +100) o tocar el mazo para tomarlas' : 'No coincide en color ni símbolo', { kind: 'warn' });
    return;
  }
  // Sincronizar con rival antes de ejecutar la animación local
  if (unoOnlineMode) unoSendAction({ action: 'play', card });
  playCard(0, idx);
}

async function playCard(playerIdx, cardIdx) {
  const token = gameToken;
  busy = true;
  const p = players[playerIdx];
  const card = p.hand[cardIdx];
  unoHold = true;                       // la ventana de Un0 empieza cuando la carta aterriza

  // Origen de la animación
  let from, fromW, fromRot = 0;
  if (playerIdx === 0) {
    const el = $('my-hand').children[cardIdx];
    from = rectOf(el); fromW = el.offsetWidth; fromRot = parseFloat(el.dataset.rot) || 0;
  } else {
    const a = anchorOf(playerIdx);
    from = a.rect; fromW = a.w; fromRot = a.rot;
  }

  p.hand.splice(cardIdx, 1);
  if (playerIdx === 0) renderHand();
  updateSeat(playerIdx);
  updateTurnHighlights();

  const rot = rand(-14, 14);
  await flight({
    face: card, backStart: playerIdx !== 0,
    from, to: () => rectOf($('discard-deck')),
    fromW, toW: cardW(), fromRot, toRot: rot, duration: 520,
    onLand: () => { showOnPile(card, rot, true); sfx.play(); },
  });
  if (token !== gameToken) return;

  discardCard = card;
  if (card.color !== 'wild') activeColor = card.color;
  logAction(`${p.name} jugó ${card.label}`);
  updateCenter();

  if (isPlusCard(card)) {
    currentStack += card.val;
    sfx.special();
    toast(`+${currentStack}`, { big: true });
    updateCenter();
  }

  // Ya no hay aviso automático de "Un0": si queda 1 carta, cada jugador debe decirlo él mismo
  unoHold = false;
  unoSyncPlayers();

  // Victoria
  if (p.hand.length === 0) {
    gameFinished = true;
    renderAll();
    await sleep(500);
    showWin(p, playerIdx === 0);
    return;
  }

  // Efectos
  if (['wild', '+4', '+10', '+100'].includes(card.type)) {
    if (playerIdx === 0) {
      activeColor = await chooseColor(card);
      // Sincronizar color elegido con los demás jugadores
      if (unoOnlineMode) unoSendAction({ action: 'choose_color', color: activeColor });
    } else if (!unoOnlineMode) {
      activeColor = botPickColor(p);
    } else if (unoOnlineMode && unoNet.role === 'host' && p.isBot) {
      activeColor = botPickColor(p);
      unoBroadcastAction({ action: 'choose_color', color: activeColor }, p.globalIdx);
    }
    if (token !== gameToken) return;
    logAction(`${p.name} cambió el color a ${COLOR_ES[activeColor]}`);
    toast(`Color: ${COLOR_ES[activeColor]}`, { kind: activeColor });
    updateCenter();
    await sleep(350);

  } else if (card.type === 'swap_all') {
    sfx.special();
    if (unoOnlineMode) {
      if (playerIdx === 0) unoSendAction({ action: 'swap_all' });
      else if (unoNet.role === 'host' && p.isBot) unoBroadcastAction({ action: 'swap_all' }, p.globalIdx);
    }
    await swapAllHands();
  } else if (card.type === 'swap_target') {
    sfx.special();
    let target;
    if (playerIdx === 0) {
      target = await chooseSwapTarget();
      if (unoOnlineMode) {
        const targetGlobal = players[target].globalIdx !== undefined ? players[target].globalIdx : target;
        unoSendAction({ action: 'swap_target', target: targetGlobal });
      }
    } else {
      if (unoOnlineMode && !p.isBot) return;
      target = -1;
      players.forEach((pl, i) => {
        if (i === playerIdx) return;
        if (target === -1 || pl.hand.length < players[target].hand.length) target = i;
      });
      if (unoOnlineMode && unoNet.role === 'host' && p.isBot) {
        const targetGlobal = players[target].globalIdx !== undefined ? players[target].globalIdx : target;
        unoBroadcastAction({ action: 'swap_target', target: targetGlobal }, p.globalIdx);
      }
    }
    if (token !== gameToken) return;
    await swapTwoHands(playerIdx, target);
  }

  if (token !== gameToken) return;
  advanceTurn(card);
}

async function advanceTurn(playedCard) {
  const token = gameToken;
  busy = true;
  const n = players.length;

  if (playedCard && playedCard.type === 'reverse') {
    direction *= -1;
    logAction('¡Dirección de juego invertida!');
    toast('¡Reversa!', { big: true });
    sfx.special();
    const ring = $('dir-ring');
    ring.classList.remove('flip'); void ring.offsetWidth; ring.classList.add('flip');
    updateCenter();
    await sleep(450);
  }

  let step = 1;
  if (playedCard && playedCard.type === 'skip') {
    step = 2;
    const skipped = mod(activePlayerIdx + direction, n);
    logAction(`${players[skipped].name} pierde su turno`);
    toast(`¡${players[skipped].name} pierde el turno!`, { big: true });
    sfx.special();
    const s = seatEls[skipped];
    if (s) { s.root.classList.remove('skipped'); void s.root.offsetWidth; s.root.classList.add('skipped'); }
    await sleep(550);
  }
  activePlayerIdx = mod(activePlayerIdx + direction * step, n);

  // En modo online, si le toca al rival remoto (índice 1), no ejecutamos nada automático:
  // esperamos a que el rival envíe su jugada o tome el castigo
  if (unoOnlineMode && activePlayerIdx !== 0) {
    if (token !== gameToken) return;
    startTurn();
    return;
  }

  // ¿El nuevo jugador debe tragarse el castigo acumulado? (Para bots en modo bot)
  if (currentStack > 0 && players[activePlayerIdx].isBot && !players[activePlayerIdx].hand.some(isPlusCard)) {
    renderAll();
    await takePenalty(activePlayerIdx);
    if (token !== gameToken) return;
    activePlayerIdx = mod(activePlayerIdx + direction, n);   // pierde su turno por castigo
  }
  if (token !== gameToken) return;
  startTurn();
}

async function takePenalty(idx) {
  const p = players[idx];
  const amount = currentStack;
  logAction(`¡${p.name} roba ${amount} cartas!`);
  toast(idx === 0 ? `Robas ${amount} cartas` : `${p.name} roba ${amount}`, { kind: 'warn', big: true });
  sfx.penalty();
  await sleep(400);
  currentStack = 0;
  updateCenter();
  if (unoOnlineMode && idx === 0) {
    unoSendAction({ action: 'penalty', count: amount });
  }
  await giveCards(idx, amount);
  await sleep(250);
}

/* Entrega N cartas del mazo infinito a un jugador, con animación */
async function giveCards(idx, count) {
  const token = gameToken;
  const p = players[idx];
  const cards = Array.from({ length: count }, generateRandomCard);
  const visible = Math.min(count, 12);
  const stagger = count > 6 ? 70 : 110;
  const deck = $('draw-deck');
  deck.classList.remove('wobble'); void deck.offsetWidth; deck.classList.add('wobble');

  if (idx === 0) {
    cards.forEach((c) => { c._hid = true; p.hand.push(c); });
    renderHand();
    const els = [...$('my-hand').children];
    const base = els.length - visible;
    await Promise.all(Array.from({ length: visible }, (_, i) => {
      const target = els[base + i];
      const card = cards[count - visible + i];
      return flight({
        face: card, backStart: true,
        from: () => rectOf(deck), to: () => rectOf(target),
        toW: target.offsetWidth, toRot: parseFloat(target.dataset.rot) || 0,
        duration: 560, delay: i * stagger, arc: -70,
        onLand: () => { sfx.draw(); },
      });
    }));
    if (token !== gameToken) return cards;
    cards.forEach((c) => { c._hid = false; });
    renderHand();
    updateSeat(0);
  } else {
    const a = anchorOf(idx);
    await Promise.all(Array.from({ length: visible }, (_, i) => flight({
      from: () => rectOf(deck), to: a.rect, fromW: cardW(), toW: a.w, toRot: a.rot,
      duration: 560, delay: i * stagger, arc: -60,
      onLand: () => { sfx.draw(); },
    })));
    if (token !== gameToken) return cards;
    cards.forEach((c) => p.hand.push(c));
    updateSeat(idx);
  }
  fitGroups();
  return cards;
}

/* ============================ ROBAR / PASAR (HUMANO) ============================ */
$('draw-deck').addEventListener('click', async () => {
  if (activePlayerIdx !== 0 || busy || gameFinished) return;

  // Con castigo acumulado: tocar el mazo = aceptar el castigo y tomar las cartas
  if (currentStack > 0) {
    busy = true;
    updateTurnHighlights();
    const amount = currentStack;
    if (unoOnlineMode) unoSendAction({ action: 'penalty', count: amount });
    await takePenalty(0);
    activePlayerIdx = mod(activePlayerIdx + direction, players.length);
    startTurn();
    return;
  }
  if (humanDrew) { toast('Ya robaste: juega esa carta o pasa', { kind: 'warn' }); return; }

  busy = true;
  updateTurnHighlights();
  renderHand();
  if (unoOnlineMode) unoSendAction({ action: 'draw', count: 1 });
  const [drawn] = await giveCards(0, 1);
  logAction('Has robado una carta.');
  humanDrew = true;

  if (!canPlayCard(drawn)) {
    toast('No se puede jugar, pasas turno');
    await sleep(700);
    if (unoOnlineMode) unoSendAction({ action: 'pass' });
    advanceTurn(null);
  } else {
    busy = false;
    renderAll();
  }
});

$('pass-btn').addEventListener('click', () => {
  if (activePlayerIdx !== 0 || busy || !humanDrew) return;
  if (unoOnlineMode) unoSendAction({ action: 'pass' });
  advanceTurn(null);
});

/* ============================ Un0: BOTÓN, VENTANA DE 5 s Y CASTIGO ============================ */
function clearUnoTimers() {
  clearInterval(unoTrack.tick); clearTimeout(unoTrack.timer);
  unoTrack.tick = null; unoTrack.timer = null;
}

function resetUnoTrack() {
  clearUnoTimers();
  unoTrack.active = false; unoTrack.declared = false; unoTrack.expired = false;
  renderUnoButton();
}

function startUnoWindow() {
  clearUnoTimers();
  const token = gameToken;
  unoTrack.active = true; unoTrack.declared = false; unoTrack.expired = false;
  unoTrack.deadline = Date.now() + UNO_WINDOW_MS;
  unoTrack.tick = setInterval(renderUnoButton, 100);
  unoTrack.timer = setTimeout(() => { if (token === gameToken) onUnoExpire(); }, UNO_WINDOW_MS);
  renderUnoButton();
}

function onUnoExpire() {
  clearInterval(unoTrack.tick); unoTrack.tick = null;
  unoTrack.expired = true;
  renderUnoButton();
  const me = players[0];
  if (!me || gameFinished || unoTrack.declared || me.hand.length !== 1) return;
  toast('¡Se acabó el tiempo para decir Un0!', { kind: 'warn' });
  // Si justo es tu turno, el castigo cae ahora; si no, caerá cuando te llegue el turno
  if (activePlayerIdx === 0 && !busy) applyUnoPenalty(0);
}

/* Mantiene la ventana de mi botón acorde a cuántas cartas tengo (empieza al quedar con exactamente 1) */
function syncUnoButton() {
  const me = players[0];
  if (!me) { renderUnoButton(); return; }
  if (gameFinished) { resetUnoTrack(); return; }
  if (dealing || unoHold) { renderUnoButton(); return; }
  const one = me.hand.length === 1;
  if (one && !unoTrack.active) startUnoWindow();
  else if (!one && unoTrack.active) resetUnoTrack();
  renderUnoButton();
}

/* Los bots deciden por su cuenta si dicen Un0 (según dificultad) en cuanto quedan con 1 carta */
function unoSyncPlayers() {
  if (gameFinished || dealing || !players.length) return;
  if (!unoHold) {
    players.forEach((p, i) => {
      if (p.hand.length !== 1) { p.unoSaid = false; p.unoDecided = false; return; }
      if (i !== 0 && p.isBot && !p.unoDecided) {
        if (unoOnlineMode && unoNet.role !== 'host') return;
        p.unoDecided = true;
        const chance = { easy: 0.55, normal: 0.8, hard: 0.97 }[config.difficulty] || 0.8;
        if (Math.random() < chance) {
          p.unoSaid = true;
          sfx.uno();
          toast(`¡${p.name} dijo Un0!`, { big: true });
          logAction(`${p.name} dijo Un0`);
          updateSeat(i);
          if (unoOnlineMode && unoNet.role === 'host') {
            unoBroadcastAction({ action: 'uno_say' }, p.globalIdx);
          }
        }
      }
    });
  }
  syncUnoButton();
}

function renderUnoButton() {
  const btn = $('uno-btn');
  if (!btn) return;
  const me = players[0];
  const one = !!me && me.hand.length === 1 && !gameFinished;
  const counting = one && unoTrack.active && !unoTrack.declared && !unoTrack.expired;
  const done = one && unoTrack.declared;
  const late = one && unoTrack.expired && !unoTrack.declared;
  const left = counting ? Math.max(0, unoTrack.deadline - Date.now()) : 0;

  btn.disabled = !counting;
  btn.classList.toggle('counting', counting);
  btn.classList.toggle('done', done);
  btn.classList.toggle('late', late);
  btn.style.setProperty('--left', counting ? `${(left / UNO_WINDOW_MS) * 100}%` : '0%');
  const label = btn.querySelector('.uno-label'), count = btn.querySelector('.uno-count');
  if (label) label.textContent = done ? '¡Dicho!' : late ? 'Tarde' : 'Un0';
  if (count) count.textContent = counting ? String(Math.ceil(left / 1000)) : '';
  const info = $('me-info');
  if (info) info.classList.toggle('uno', done);
}

function declareUno() {
  const me = players[0];
  if (!me || gameFinished || !unoTrack.active || unoTrack.declared || unoTrack.expired || me.hand.length !== 1) return;
  unoTrack.declared = true;               // una sola vez: el botón queda bloqueado
  clearUnoTimers();
  me.unoSaid = true;
  sfx.uno();
  toast('¡Un0!', { big: true });
  logAction(`${me.name} dijo Un0`);
  if (unoOnlineMode) unoSendAction({ action: 'uno_say' });
  const b = $('uno-btn');
  b.classList.remove('shout'); void b.offsetWidth; b.classList.add('shout');
  renderUnoButton();
}
$('uno-btn').addEventListener('click', declareUno);

/* Castigo: roba UNO_PENALTY cartas (más el castigo acumulado si lo había) y pierde el turno */
async function applyUnoPenalty(idx) {
  const token = gameToken;
  const p = players[idx];
  busy = true;
  const total = UNO_PENALTY + currentStack;
  currentStack = 0;
  updateCenter();
  updateTurnHighlights();
  logAction(`${p.name} no dijo Un0: roba ${total} cartas y pierde su turno`);
  toast(idx === 0 ? `¡No dijiste Un0! Robas ${total} cartas` : `¡${p.name} no dijo Un0! Roba ${total}`, { kind: 'warn', big: true });
  sfx.penalty();
  if (unoOnlineMode) {
    if (idx === 0) unoSendAction({ action: 'uno_penalty', count: total });
    else if (unoNet.role === 'host' && p.isBot) unoBroadcastAction({ action: 'uno_penalty', count: total }, p.globalIdx);
  }
  await sleep(500);
  await giveCards(idx, total);
  if (token !== gameToken) return;
  await sleep(250);
  activePlayerIdx = mod(activePlayerIdx + direction, players.length);   // pierde su turno
  startTurn();
}

/* ============================ BOTS ============================ */
function botPickColor(p) {
  if (config.difficulty === 'easy') return COLORS[Math.floor(Math.random() * 4)];
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  p.hand.forEach((c) => { if (c.color !== 'wild') counts[c.color]++; });
  const best = COLORS.slice().sort((a, b) => counts[b] - counts[a])[0];
  return counts[best] > 0 ? best : COLORS[Math.floor(Math.random() * 4)];
}

function chooseBotCard(p, playable) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (currentStack > 0) return playable.slice().sort((a, b) => a.c.val - b.c.val)[0];   // responde con el + más chico
  if (config.difficulty === 'easy') return pick(playable);

  const nonWild = playable.filter((x) => x.c.color !== 'wild');
  if (config.difficulty === 'hard') {
    const nextIdx = mod(activePlayerIdx + direction, players.length);
    if (players[nextIdx].hand.length <= 3) {
      const attack = playable.filter((x) => isPlusCard(x.c) || x.c.type === 'skip');
      if (attack.length) return pick(attack);
    }
  }
  return nonWild.length ? pick(nonWild) : pick(playable);
}

async function botPlay() {
  const token = gameToken;
  const idx = activePlayerIdx;
  const p = players[idx];
  const playable = p.hand.map((c, i) => ({ c, i })).filter((x) => canPlayCard(x.c));

  if (playable.length) {
    const chosen = chooseBotCard(p, playable);
    const card = chosen.c;
    if (unoOnlineMode && unoNet.role === 'host') {
      unoBroadcastAction({ action: 'play', card }, p.globalIdx);
    }
    await playCard(idx, chosen.i);
    return;
  }
  // Si habia castigo acumulado y el bot no tiene con que responder, se traga el castigo
  if (currentStack > 0) {
    if (unoOnlineMode && unoNet.role === 'host') {
      unoBroadcastAction({ action: 'penalty', count: currentStack }, p.globalIdx);
    }
    await takePenalty(idx);
    if (token !== gameToken) return;
    activePlayerIdx = mod(activePlayerIdx + direction, players.length);
    startTurn();
    return;
  }
  if (unoOnlineMode && unoNet.role === 'host') {
    unoBroadcastAction({ action: 'draw', count: 1 }, p.globalIdx);
  }
  const [drawn] = await giveCards(idx, 1);
  if (token !== gameToken) return;
  logAction(`${p.name} robó una carta.`);
  if (canPlayCard(drawn)) {
    await sleep(350);
    if (unoOnlineMode && unoNet.role === 'host') {
      unoBroadcastAction({ action: 'play', card: drawn }, p.globalIdx);
    }
    await playCard(idx, p.hand.length - 1);
  } else {
    if (unoOnlineMode && unoNet.role === 'host') {
      unoBroadcastAction({ action: 'pass' }, p.globalIdx);
    }
    advanceTurn(null);
  }
}

/* ============================ INTERCAMBIOS DE MAZO ============================ */
async function swapAllHands() {
  const n = players.length;
  logAction('¡TODOS INTERCAMBIAN SUS CARTAS EN LA DIRECCIÓN DEL JUEGO!');
  toast('¡Todos intercambian sus cartas!', { big: true });
  // La mano de i viaja a i + direction
  await Promise.all(players.map((_, i) => flyBacks(i, mod(i + direction, n), 3, i * 40)));

  const hands = players.map((p) => p.hand);
  players.forEach((p, i) => { p.hand = hands[mod(i - direction, n)]; });
  renderAll();
  await sleep(250);
}

async function swapTwoHands(a, b) {
  logAction(`${players[a].name} intercambió su mazo con ${players[b].name}`);
  toast(`${players[a].name} ⇄ ${players[b].name}`, { big: true });
  await Promise.all([flyBacks(a, b, 4), flyBacks(b, a, 4, 120)]);
  const tmp = players[a].hand;
  players[a].hand = players[b].hand;
  players[b].hand = tmp;
  renderAll();
  await sleep(250);
}

/* ============================ SELECTORES (MODALES) ============================ */
function chooseColor(card) {
  return new Promise((resolve) => {
    const modal = $('color-modal');
    const cardEl = $('color-card');
    const wedges = [...modal.querySelectorAll('.wedge')];
    $('cc-tl').innerHTML = symbolFor(card);
    $('cc-br').innerHTML = symbolFor(card);

    modal.classList.remove('hidden');
    cardEl.classList.remove('opening', 'closing');
    void cardEl.offsetWidth;
    cardEl.classList.add('opening');
    sfx.special();

    let chosen = false;
    const finish = async (color) => {
      if (chosen) return;
      chosen = true;
      wedges.forEach((w) => {
        w.classList.toggle('picked', w.dataset.color === color);
        w.classList.toggle('faded', w.dataset.color !== color);
      });
      sfx.pick();
      await sleep(420);
      cardEl.classList.add('closing');
      await sleep(300);
      modal.classList.add('hidden');
      cardEl.classList.remove('opening', 'closing');
      wedges.forEach((w) => { w.classList.remove('picked', 'faded'); w.onclick = null; w.onkeydown = null; });
      resolve(color);
    };
    wedges.forEach((w) => {
      w.onclick = () => finish(w.dataset.color);
      w.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(w.dataset.color); } };
    });
    setTimeout(() => wedges[0].focus({ preventScroll: true }), 700);
  });
}

function chooseSwapTarget() {
  return new Promise((resolve) => {
    const modal = $('swap-modal');
    const list = $('swap-players-list');
    list.innerHTML = '';
    players.forEach((p, idx) => {
      if (idx === 0) return;
      const btn = document.createElement('button');
      btn.className = 'swap-pick';
      btn.innerHTML = `<div class="avatar" style="--h:${p.hue}"><span class="emoji">${p.emoji}</span></div><b></b><small>${p.hand.length} cartas</small>`;
      btn.querySelector('b').textContent = p.name;
      btn.onclick = () => { modal.classList.add('hidden'); resolve(idx); };
      list.appendChild(btn);
    });
    modal.classList.remove('hidden');
  });
}

/* ============================ FIN DE PARTIDA ============================ */
function showWin(p, isHuman) {
  $('win-avatar').style.setProperty('--h', p.hue);
  $('win-avatar').querySelector('.emoji').textContent = p.emoji;
  $('win-title').textContent = isHuman ? '¡Ganaste!' : `¡${p.name} ha ganado!`;
  $('win-sub').textContent = isHuman ? 'Te quedaste sin cartas primero.' : 'Se quedó sin cartas. ¡La próxima será!';
  $('win-modal').classList.remove('hidden');
  sfx.win();
  logAction(`¡${p.name} HA GANADO LA PARTIDA!`);
  if (isHuman && typeof launchConfetti === 'function') launchConfetti();
  else if (!isHuman && typeof launchDefeat === 'function') launchDefeat();
}

/* ============================ HISTORIAL ============================ */
function logAction(msg) {
  const li = document.createElement('li');
  li.textContent = msg;
  $('log-list').prepend(li);
}
$('log-toggle-btn').addEventListener('click', () => $('log-drawer').classList.toggle('hidden'));
$('close-log-btn').addEventListener('click', () => $('log-drawer').classList.add('hidden'));

/* ============================ REDIMENSIONAR ============================ */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (players.length && !$('game-app').classList.contains('hidden')) { renderHand(); fitGroups(); }
  }, 120);
});

/* ================================================================
   UNO ONLINE — Red PeerJS integrada directamente en uno.js
   (funciona tanto en uno.html standalone como dentro del iframe de index.html)
   ================================================================ */

const UNO_ID_PREFIX = 'uno-online-';
const UNO_ID_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// La config WebRTC (STUN + TURN) está en js/ice-config.js → getIceConfig()

function unoRandomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += UNO_ID_CHARS[Math.floor(Math.random() * UNO_ID_CHARS.length)];
  return s;
}

const MAX_UNO_SEATS = 10;
const SEAT_HUES = [8, 205, 275, 145, 38, 330, 175, 295, 85, 25];
const BOT_NAMES = ['Luna', 'Max', 'Kiko', 'Zoe', 'Nico', 'Leo', 'Mía', 'Sam', 'Toby', 'Rex'];

const cleanName = (t) => String(t || '').replace(/[<>]/g, '').trim().slice(0, 12) || 'Jugador';
const myName = () => cleanName($('your-name') ? $('your-name').value : 'Jugador 1');

const unoNet = {
  role: 'solo',       // 'solo' | 'host' | 'guest'
  peer: null,
  conn: null,         // para invitado: conexión con el anfitrión
  members: [],        // para anfitrión: [{ name, local: true }, { name, conn }, ...]
  botsN: 0,
  started: false,
  code: '',
  myGlobalIdx: 0,
};

function unoNetStatus(msg, ok = false) {
  const el = $('net-status');
  if (el) {
    el.textContent = msg || '';
    el.classList.toggle('ok', !!ok);
  }
}

/* ---------- Pestañas de configuración ---------- */
function setUnoTab(tab) {
  $('tab-bots').classList.toggle('active', tab === 'bots');
  $('tab-online').classList.toggle('active', tab === 'online');
  $('pane-bots').classList.toggle('hidden', tab !== 'bots');
  $('pane-online').classList.toggle('hidden', tab !== 'online');
  const sel = $('uno-game-mode');
  if (sel) sel.value = tab;
}

$('tab-bots').addEventListener('click', () => { if (unoNet.role === 'solo') setUnoTab('bots'); });
$('tab-online').addEventListener('click', () => setUnoTab('online'));

function showUnoSetup() {
  $('game-app').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
}

/* ---------- Copiar texto ---------- */
function copyUnoText(text, okMsg) {
  const done = () => unoNetStatus(okMsg, true);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => unoNetStatus('No se pudo copiar'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { unoNetStatus('No se pudo copiar'); }
    ta.remove();
  }
}

$('copy-code').addEventListener('click', () => copyUnoText(unoNet.code, 'Código copiado'));
$('copy-link').addEventListener('click', () => {
  const url = new URL(location.href);
  url.search = ''; url.hash = '';
  url.searchParams.set('join', unoNet.code);
  url.searchParams.set('mode', 'online');
  copyUnoText(url.toString(), 'Enlace copiado: envíalo a tus amigos');
});

/* ---------- Lobby ---------- */
function renderUnoLobby(list, bots) {
  const ul = $('lobby-list');
  if (!ul) return;
  ul.innerHTML = '';
  list.forEach((name, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="emo"></span><span class="nm"></span>';
    li.querySelector('.emo').textContent = (name[0] || '?').toUpperCase();
    li.querySelector('.emo').style.setProperty('--h', SEAT_HUES[i % SEAT_HUES.length]);
    li.querySelector('.nm').textContent = name;
    if (i === 0) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = 'anfitrión';
      li.appendChild(t);
    }
    ul.appendChild(li);
  });
  if (bots > 0) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="emo bot">B</span><span class="nm">${bots} bot${bots > 1 ? 's' : ''}</span>`;
    ul.appendChild(li);
  }
  const info = document.createElement('div');
  info.className = 'lobby-total';
  info.textContent = `${list.length + bots} de ${MAX_UNO_SEATS} jugadores`;
  ul.appendChild(info);
}

function refreshUnoLobby() {
  const list = unoNet.members.map((m) => m.name);
  renderUnoLobby(list, unoNet.botsN);
  unoNet.members.forEach((m) => {
    if (m.conn && m.conn.open) m.conn.send({ t: 'lobby', list, bots: unoNet.botsN });
  });
  const total = unoNet.members.length + unoNet.botsN;
  $('bot-n').textContent = unoNet.botsN;
  $('bots-minus').disabled = unoNet.botsN <= 0;
  $('bots-plus').disabled = total >= MAX_UNO_SEATS;
  $('host-start').disabled = total < 2;
  $('host-start').textContent = `Abrir la sala (${total} ${total === 1 ? 'jugador' : 'jugadores'})`;
}

/* ---------- Anfitrión ---------- */
async function openUnoRoom() {
  if (typeof Peer === 'undefined') {
    unoNetStatus('No se pudo cargar la conexión online. Revisa tu internet y recarga.');
    return;
  }
  unoNetStatus('Creando sala…', true);
  unoNet.role = 'host';
  unoNet.members = [{ name: myName(), local: true }];
  unoNet.botsN = 0;
  unoNet.started = false;
  unoNet.code = unoRandomCode();

  const cfg = await getIceConfig();
  unoNet.peer = new Peer(UNO_ID_PREFIX + unoNet.code, { config: cfg });

  unoNet.peer.on('open', () => {
    $('online-choose').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('room-code').textContent = unoNet.code;
    $('host-opts').classList.remove('hidden');
    $('guest-wait').classList.add('hidden');
    $('leave-lobby').textContent = 'Cerrar sala';
    unoNetStatus(iceHasTurn() ? '' : TURN_WARNING);
    refreshUnoLobby();
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'UNO_MY_CODE', code: unoNet.code }, '*');
    }
  });

  unoNet.peer.on('connection', onUnoGuestConnection);
  unoNet.peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      unoNet.peer.destroy();
      unoNet.peer = null;
      openUnoRoom();
    } else {
      unoNetStatus('Error de conexión: ' + err.type);
    }
  });
}

function onUnoGuestConnection(c) {
  watchConnection(c, () => unoNetStatus(connectionHelp()));
  c.on('data', (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      if (unoNet.members.some((m) => m.conn === c)) return;
      if (unoNet.started) {
        c.send({ t: 'reject', reason: 'La partida ya está en juego. Espera a que termine.' });
        setTimeout(() => c.close(), 400);
        return;
      }
      if (unoNet.members.length >= MAX_UNO_SEATS) {
        c.send({ t: 'reject', reason: `La sala está llena (${MAX_UNO_SEATS} jugadores máx).` });
        setTimeout(() => c.close(), 400);
        return;
      }
      unoNet.members.push({ name: cleanName(d.name), conn: c });
      unoNet.botsN = Math.min(unoNet.botsN, MAX_UNO_SEATS - unoNet.members.length);
      c.send({ t: 'welcome' });
      refreshUnoLobby();
      return;
    }
    if (d.t === 'uno_action') {
      const idx = unoNet.members.findIndex((m) => m.conn === c);
      if (idx >= 0) {
        unoReceiveNetAction({ ...d, sender: idx });
        // Reenviar a los demás invitados
        unoNet.members.forEach((m) => {
          if (!m.local && m.conn && m.conn !== c && m.conn.open) {
            m.conn.send({ ...d, sender: idx });
          }
        });
      }
    }
  });

  const gone = () => unoMemberLeft(c);
  c.on('close', gone);
  c.on('error', gone);
}

function unoMemberLeft(c) {
  const g = unoNet.members.findIndex((m) => m.conn === c);
  if (g >= 0) {
    const leftName = unoNet.members[g].name;
    if (unoNet.started) {
      toast(`${leftName} se desconectó`, { kind: 'warn' });
      logAction(`${leftName} se desconectó.`);
      const globalIdx = g;
      const N = players.length;
      const localIdx = mod(globalIdx - unoNet.myGlobalIdx, N);
      if (players[localIdx]) {
        players[localIdx].isBot = true;
        players[localIdx].name += ' (bot)';
        updateSeat(localIdx);
        if (activePlayerIdx === localIdx && !busy && !gameFinished) {
          startTurn();
        }
      }
      return;
    }
    unoNet.members.splice(g, 1);
    refreshUnoLobby();
  }
}

$('host-btn').addEventListener('click', openUnoRoom);
$('bots-minus').addEventListener('click', () => {
  if (unoNet.botsN > 0) { unoNet.botsN--; refreshUnoLobby(); }
});
$('bots-plus').addEventListener('click', () => {
  if (unoNet.members.length + unoNet.botsN < MAX_UNO_SEATS) { unoNet.botsN++; refreshUnoLobby(); }
});
$('host-start').addEventListener('click', unoBeginOnlineTable);

/* ---------- Invitado ---------- */
async function joinUnoRoom() {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 5) { unoNetStatus('El código debe tener 5 caracteres.'); return; }
  if (typeof Peer === 'undefined') { unoNetStatus('No se pudo cargar la conexión online. Revisa tu internet.'); return; }
  unoNetStatus('Conectando a la sala…', true);
  unoNet.role = 'guest';

  const cfg = await getIceConfig();
  unoNet.peer = new Peer(undefined, { config: cfg });

  unoNet.peer.on('open', () => {
    const c = unoNet.peer.connect(UNO_ID_PREFIX + code, { reliable: true });
    unoNet.conn = c;
    watchConnection(c, () => { unoNetStatus(connectionHelp()); resetUnoNet(); });
    c.on('open', () => c.send({ t: 'hello', name: myName() }));
    c.on('data', onUnoHostMessage);
    c.on('close', onUnoHostGone);
    c.on('error', onUnoHostGone);
  });

  unoNet.peer.on('error', (err) => {
    unoNetStatus(err.type === 'peer-unavailable' ? 'No se encontró esa sala. Revisa el código.' : 'Error de conexión: ' + err.type);
    if (!unoNet.conn || !unoNet.conn.open) resetUnoNet();
  });
}

$('join-btn').addEventListener('click', joinUnoRoom);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinUnoRoom(); });

function onUnoHostMessage(d) {
  if (!d || typeof d !== 'object') return;
  switch (d.t) {
    case 'welcome':
      $('online-choose').classList.add('hidden');
      $('lobby').classList.remove('hidden');
      $('room-code').textContent = $('join-code').value.trim().toUpperCase();
      $('host-opts').classList.add('hidden');
      $('guest-wait').classList.remove('hidden');
      $('leave-lobby').textContent = 'Salir de la sala';
      unoNetStatus('');
      break;
    case 'lobby':
      renderUnoLobby(d.list, d.bots);
      break;
    case 'start':
      unoStartGameWithConfig(d);
      break;
    case 'uno_action':
      unoReceiveNetAction(d);
      break;
    case 'reject':
      unoNetStatus(d.reason || 'No se pudo entrar a la sala.');
      resetUnoNet();
      break;
  }
}

function onUnoHostGone() {
  if (unoNet.role !== 'guest') return;
  const inGame = !$('game-app').classList.contains('hidden');
  resetUnoNet();
  showUnoSetup();
  setUnoTab('online');
  unoNetStatus(inGame ? 'El anfitrión cerró la sala o perdió la conexión.' : 'Se perdió la conexión con la sala.');
}

/* ---------- Salir / Reiniciar Red ---------- */
function resetUnoNet() {
  try { if (unoNet.conn) unoNet.conn.close(); } catch (e) { /* nada */ }
  try { if (unoNet.peer) unoNet.peer.destroy(); } catch (e) { /* nada */ }
  unoNet.conn = null;
  unoNet.peer = null;
  unoNet.members = [];
  unoNet.botsN = 0;
  unoNet.started = false;
  unoNet.role = 'solo';
  unoNet.code = '';
  unoOnlineMode = false;
  $('lobby').classList.add('hidden');
  $('online-choose').classList.remove('hidden');
}

function leaveUnoGame(askConfirm = true) {
  if (askConfirm) {
    const msg = unoNet.role === 'host' ? '¿Cerrar la sala? La partida terminará para todos.' : '¿Salir de la partida?';
    if (!confirm(msg)) return;
  }
  gameToken++;
  resetUnoTrack();
  resetUnoNet();
  showUnoSetup();
  setUnoTab('bots');
  unoNetStatus('');
}

$('leave-lobby').addEventListener('click', () => { resetUnoNet(); unoNetStatus(''); });
const leaveGameBtn = $('leave-game-btn');
if (leaveGameBtn) leaveGameBtn.addEventListener('click', () => leaveUnoGame(true));
window.addEventListener('beforeunload', () => { try { if (unoNet.peer) unoNet.peer.destroy(); } catch (e) { /* nada */ } });

/* ---------- Iniciar partida online sincronizada (Host) ---------- */
function unoBeginOnlineTable() {
  const humans = unoNet.members;
  const botsN = unoNet.botsN;
  const total = humans.length + botsN;
  if (total < 2 || total > MAX_UNO_SEATS) return;

  const seats = [];
  humans.forEach((h, i) => {
    seats.push({ name: h.name, isBot: false, local: !!h.local, conn: h.conn || null });
  });
  for (let b = 0; b < botsN; b++) {
    seats.push({ name: BOT_NAMES[b % BOT_NAMES.length] + ' (bot)', isBot: true });
  }

  // Generar carta inicial: siempre un número
  let firstCard;
  do { firstCard = generateRandomCard(); } while (firstCard.type !== 'number');

  // Generar 7 cartas para cada asiento
  const hands = seats.map(() => Array.from({ length: 7 }, generateRandomCard));
  const pubMembers = seats.map((s) => ({ name: s.name, isBot: s.isBot }));

  seats.forEach((s, idx) => {
    if (s.conn && s.conn.open) {
      s.conn.send({
        t: 'start',
        you: idx,
        members: pubMembers,
        firstCard,
        hands,
      });
    }
  });

  unoNet.started = true;
  unoStartGameWithConfig({
    members: pubMembers,
    firstCard,
    hands,
    you: 0,
  });
}

/* ---------- Arranque de partida para cada cliente ---------- */
function unoStartGameWithConfig(data) {
  unoOnlineMode = true;
  unoNet.myGlobalIdx = data.you;
  const N = data.members.length;

  const token = ++gameToken;
  resetUnoTrack(); unoHold = false; dealing = false;
  busy = true; gameFinished = false; humanDrew = false;
  direction = 1; currentStack = 0;
  discardCard = data.firstCard;
  activeColor = data.firstCard.color;

  $('log-list').innerHTML = '';
  $('discard-deck').innerHTML = '';
  $('toast-layer').innerHTML = '';
  $('stack-counter').classList.add('hidden');

  // Construir array de players donde el jugador local está en players[0],
  // y los demás rotan en orden horario
  players = [];
  for (let l = 0; l < N; l++) {
    const g = mod(l + data.you, N);
    const m = data.members[g];
    players.push({
      name: m.name,
      isBot: m.isBot,
      hand: data.hands[g],
      emoji: (m.name.trim()[0] || '?').toUpperCase(),
      hue: SEAT_HUES[g % SEAT_HUES.length],
      globalIdx: g,
    });
  }

  config.name = players[0].name;
  config.count = N;

  $('setup-screen').classList.add('hidden');
  $('game-app').classList.remove('hidden');
  buildSeats();
  updateCenter();
  showOnPile(data.firstCard, 0, false);
  renderAll();

  // El anfitrión (asiento global 0) juega primero
  activePlayerIdx = mod(0 - data.you, N);
  updateTurnHighlights();

  if (activePlayerIdx === 0) {
    busy = false;
    renderAll();
    toast('¡Tu turno! Juega una carta o roba.', { kind: 'info', big: true });
    logAction('Partida iniciada. Es tu turno.');
  } else {
    busy = true;
    renderAll();
    toast(`Turno de ${players[activePlayerIdx].name}`, { kind: 'info' });
    logAction(`Partida iniciada. Turno de ${players[activePlayerIdx].name}.`);
  }
}

/* ---------- Transmisión de acciones online ---------- */
function unoSendAction(action) {
  if (!unoOnlineMode) return;
  if (unoNet.role === 'host') {
    unoNet.members.forEach((m) => {
      if (!m.local && m.conn && m.conn.open) {
        m.conn.send({ t: 'uno_action', sender: 0, action });
      }
    });
  } else if (unoNet.role === 'guest') {
    if (unoNet.conn && unoNet.conn.open) {
      unoNet.conn.send({ t: 'uno_action', sender: unoNet.myGlobalIdx, action });
    }
  }
}

function unoBroadcastAction(action, senderGlobalIdx) {
  if (!unoOnlineMode || unoNet.role !== 'host') return;
  unoNet.members.forEach((m) => {
    if (!m.local && m.conn && m.conn.open) {
      m.conn.send({ t: 'uno_action', sender: senderGlobalIdx, action });
    }
  });
}

/* ---------- Aplicación de acciones recibidas ---------- */
async function unoReceiveNetAction(data) {
  if (!unoOnlineMode) return;
  const act = data.action || data;
  const senderGlobal = (data.sender !== undefined) ? data.sender : (act.sender !== undefined ? act.sender : 1);
  const N = players.length;
  const localIdx = mod(senderGlobal - unoNet.myGlobalIdx, N);
  if (localIdx === 0) return; // ya ejecutado localmente

  const p = players[localIdx];
  if (!p) return;

  switch (act.action) {
    case 'play':
      await _netApplyPlay(localIdx, act.card);
      break;
    case 'draw':
      await giveCards(localIdx, act.count || 1);
      break;
    case 'penalty':
      currentStack = 0;
      updateCenter();
      await giveCards(localIdx, act.count || 1);
      advanceTurn(null);
      break;
    case 'pass':
      advanceTurn(null);
      break;
    case 'choose_color':
      activeColor = act.color;
      updateCenter();
      toast(`Color: ${COLOR_ES[activeColor]}`, { kind: activeColor });
      break;
    case 'uno_say':
      p.unoSaid = true;
      sfx.uno();
      toast(`¡${p.name} dijo Un0!`, { big: true });
      logAction(`${p.name} dijo Un0`);
      updateSeat(localIdx);
      break;
    case 'uno_penalty': {
      const total = act.count || UNO_PENALTY;
      currentStack = 0;
      updateCenter();
      logAction(`${p.name} no dijo Un0: roba ${total} cartas y pierde su turno`);
      toast(`¡${p.name} no dijo Un0! Roba ${total}`, { kind: 'warn', big: true });
      sfx.penalty();
      await giveCards(localIdx, total);
      advanceTurn(null);
      break;
    }
    case 'swap_all':
      await swapAllHands();
      break;
    case 'swap_target': {
      const targetLocal = mod(act.target - unoNet.myGlobalIdx, N);
      await swapTwoHands(localIdx, targetLocal);
      break;
    }
  }
}

/* Aplica la carta jugada por un jugador remoto o bot */
async function _netApplyPlay(idx, card) {
  const p = players[idx];
  if (!p || !card) return;

  let ci = p.hand.findIndex(c => c.id === card.id);
  if (ci === -1) {
    p.hand.push(card);
    ci = p.hand.length - 1;
  } else {
    p.hand[ci] = card;
  }
  await playCard(idx, ci);
}

/* ---------- Integración con index.html (iframe bridge) ---------- */
(function setupPostMessageBridge() {
  window.addEventListener('load', () => {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'UNO_READY' }, '*'); } catch (e) { /* nada */ }
    }
  });

  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const { type } = e.data;

    if (type === 'UNO_CONFIG') {
      const { name, mode, count, difficulty } = e.data;
      if (name && $('your-name')) $('your-name').value = cleanName(name);
      if (count && $('player-count')) $('player-count').value = count;
      if (difficulty && $('bot-difficulty')) $('bot-difficulty').value = difficulty;
      if (unoNet.role === 'solo' && !unoNet.started) {
        setUnoTab(mode === 'online' ? 'online' : 'bots');
      }
    }

    if (type === 'UNO_START' && !unoNet.started) {
      if (!$('pane-bots').classList.contains('hidden')) {
        $('start-btn') && $('start-btn').click();
      } else if (unoNet.role === 'solo') {
        $('host-btn') && $('host-btn').click();
      }
    }
  });
}());

/* ---------- Parámetros de URL iniciales (?join=XXXXX&mode=online) ---------- */
(function initFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('name') && $('your-name')) $('your-name').value = cleanName(q.get('name'));
  if (q.get('join') && $('join-code')) $('join-code').value = q.get('join').toUpperCase().slice(0, 5);
  setUnoTab(q.get('mode') === 'online' || q.get('join') ? 'online' : 'bots');
})();
