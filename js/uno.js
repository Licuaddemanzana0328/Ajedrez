/**
 * UNO EXTRA SUPREME
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

/* ==================== ESTADO DE RED ONLINE ==================== */
let unoPeer = null;
let unoConn = null;
let unoIsHost = false;
let unoOnlineMode = false;
let unoMyIdx = 0;           // 0 = host, 1 = invitado
let unoRivalName = 'Rival';

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
  return `<div class="uno-card back ${mini ? 'mini' : ''}"><div class="face"><i class="oval"></i><b class="sym">UNO</b></div></div>`;
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
  if (idx === 0) {
    const c = $('me-count');
    if (c.textContent !== String(n)) { c.textContent = n; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
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
  s.root.classList.toggle('uno', n === 1 && !dealing);
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
  $('uno-btn').classList.toggle('ready', players[0].hand.length <= 2 && !gameFinished);
}

function renderAll() {
  updateCenter();
  players.forEach((_, i) => updateSeat(i));
  renderHand();
  updateTurnHighlights();
  fitGroups();
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
  const modeEl = $('uno-game-mode');
  const selectedMode = modeEl ? modeEl.value : 'bots';

  let count = parseInt($('player-count').value, 10);
  if (isNaN(count)) count = 4;
  count = Math.min(10, Math.max(2, count));
  if ($('player-count')) $('player-count').value = count;

  config = {
    count: selectedMode === 'online' ? 2 : count,
    name: ($('your-name').value || 'Jugador 1').trim().slice(0, 12) || 'Jugador 1',
    difficulty: $('bot-difficulty').value,
  };

  if (selectedMode === 'online') {
    // Inicializar red P2P si no está lista
    if (!unoPeer || unoPeer.destroyed) {
      initUnoNetwork();
    } else if ($('uno-net-panel')) {
      $('uno-net-panel').classList.remove('hidden');
    }
    // No arrancar partida aún — esperar conexión rival
    return;
  }

  startGame();
});

$('again-btn').addEventListener('click', () => { $('win-modal').classList.add('hidden'); startGame(); });
$('menu-btn').addEventListener('click', () => {
  gameToken++;
  $('win-modal').classList.add('hidden');
  $('game-app').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
});

async function startGame() {
  const token = ++gameToken;
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

  if (players[activePlayerIdx].isBot) {
    busy = true;
    renderAll();
    const wait = { easy: 1400, normal: 1000, hard: 700 }[config.difficulty] || 1000;
    await sleep(wait);
    if (token !== gameToken || gameFinished) return;
    await botPlay();
  } else {
    busy = (unoOnlineMode && activePlayerIdx !== 0);
    renderAll();
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

  if (p.hand.length === 1) {
    sfx.uno();
    toast(`¡UNO! ${p.name}`, { big: true });
    updateSeat(playerIdx);
  }

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
      // Sincronizar color elegido con el rival
      if (unoOnlineMode) unoSendAction({ action: 'choose_color', color: activeColor });
    } else if (!unoOnlineMode) {
      activeColor = botPickColor(p);
    }
    if (token !== gameToken) return;
    logAction(`${p.name} cambió el color a ${COLOR_ES[activeColor]}`);
    toast(`Color: ${COLOR_ES[activeColor]}`, { kind: activeColor });
    updateCenter();
    await sleep(350);

  } else if (card.type === 'swap_all') {
    sfx.special();
    await swapAllHands();
  } else if (card.type === 'swap_target') {
    sfx.special();
    let target;
    if (playerIdx === 0) {
      target = await chooseSwapTarget();
    } else {
      target = -1;
      players.forEach((pl, i) => {
        if (i === playerIdx) return;
        if (target === -1 || pl.hand.length < players[target].hand.length) target = i;
      });
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

$('uno-btn').addEventListener('click', () => {
  const b = $('uno-btn');
  b.classList.remove('shout'); void b.offsetWidth; b.classList.add('shout');
  if (players[0] && players[0].hand.length <= 2) { sfx.uno(); toast('¡UNO!', { big: true }); }
  else { toast('Todavía tienes muchas cartas'); }
});

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
    await playCard(idx, chooseBotCard(p, playable).i);
    return;
  }
  // Si habia castigo acumulado y el bot no tiene con que responder, se traga el castigo
  if (currentStack > 0) {
    await takePenalty(idx);
    if (token !== gameToken) return;
    activePlayerIdx = mod(activePlayerIdx + direction, players.length);
    startTurn();
    return;
  }
  const [drawn] = await giveCards(idx, 1);
  if (token !== gameToken) return;
  logAction(`${p.name} robó una carta.`);
  if (canPlayCard(drawn)) {
    await sleep(350);
    await playCard(idx, p.hand.length - 1);
  } else {
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

// Servidores STUN gratuitos de Google para conexion WebRTC
const UNO_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
};

function unoRandomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += UNO_ID_CHARS[Math.floor(Math.random() * UNO_ID_CHARS.length)];
  return s;
}

/* ---- Panel de conexión online (minimizable y sin emojis) ---- */
function buildOnlinePanel() {
  if ($('uno-net-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'uno-net-panel';
  panel.className = 'uno-net-panel';
  panel.innerHTML = `
    <div class="uno-net-inner">
      <div class="uno-net-header">
        <span class="uno-net-title">Modo Online</span>
        <div class="uno-net-header-actions">
          <button id="uno-min-btn" class="uno-icon-btn" title="Minimizar" type="button">_</button>
          <button id="uno-close-btn" class="uno-icon-btn" title="Cerrar" type="button">&times;</button>
        </div>
      </div>
      <div class="net-row">
        <label>Tu código (compártelo con tu rival):</label>
        <div class="net-code-wrap">
          <input id="uno-my-code" readonly placeholder="Generando…">
          <button id="uno-copy-btn" title="Copiar código" type="button">Copiar</button>
        </div>
      </div>
      <div class="net-row">
        <label>Código del rival:</label>
        <input id="uno-remote-code" placeholder="Pega aquí el código" maxlength="5">
      </div>
      <button id="uno-connect-btn" type="button">Conectar con rival</button>
      <div id="uno-net-status" class="net-status">Esperando conexión…</div>
    </div>`;

  const miniBar = document.createElement('div');
  miniBar.id = 'uno-minibar';
  miniBar.className = 'uno-minibar hidden';
  miniBar.innerHTML = `
    <span id="uno-minibar-text">Online: Sala activa</span>
    <button id="uno-restore-btn" class="uno-minibar-btn" type="button">Ver sala</button>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(miniBar);

  const minimize = () => {
    panel.classList.add('hidden');
    miniBar.classList.remove('hidden');
    const c = $('uno-my-code') ? $('uno-my-code').value : '';
    $('uno-minibar-text').textContent = c ? `Sala: ${c}` : 'Modo Online';
  };

  const restore = () => {
    miniBar.classList.add('hidden');
    panel.classList.remove('hidden');
  };

  $('uno-min-btn').addEventListener('click', minimize);
  $('uno-close-btn').addEventListener('click', minimize);
  $('uno-restore-btn').addEventListener('click', restore);

  $('uno-copy-btn').addEventListener('click', () => {
    const code = $('uno-my-code').value;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        $('uno-copy-btn').textContent = 'Copiado';
        toast('¡Código copiado!');
        setTimeout(() => { if ($('uno-copy-btn')) $('uno-copy-btn').textContent = 'Copiar'; }, 2000);
      });
    }
  });

  $('uno-connect-btn').addEventListener('click', () => {
    const code = $('uno-remote-code').value.trim().toUpperCase();
    if (code.length !== 5) { unoNetStatus('El código debe tener 5 caracteres.'); return; }
    if (!unoPeer || unoPeer.destroyed) { unoNetStatus('Error: peer no inicializado.'); return; }
    unoConn = unoPeer.connect(UNO_ID_PREFIX + code, { reliable: true });
    unoIsHost = false;
    unoMyIdx  = 1;
    unoSetupConn();
  });
}

function unoNetStatus(msg) {
  const el = $('uno-net-status');
  if (el) el.textContent = msg;
  toast(msg, { kind: 'warn' });
}

function initUnoNetwork() {
  if (typeof Peer === 'undefined') {
    unoNetStatus('PeerJS no disponible. Verifica tu conexión y recarga.');
    return;
  }
  buildOnlinePanel();
  if ($('uno-net-panel')) $('uno-net-panel').classList.remove('hidden');
  if ($('uno-minibar')) $('uno-minibar').classList.add('hidden');

  const code = unoRandomCode();
  unoPeer = new Peer(UNO_ID_PREFIX + code, { config: UNO_ICE });

  unoPeer.on('open', () => {
    if ($('uno-my-code')) $('uno-my-code').value = code;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'UNO_MY_CODE', code }, '*');
    }
    unoNetStatus('Esperando rival…');
  });

  unoPeer.on('connection', (c) => {
    if (unoConn && unoConn.open) { c.close(); return; }
    unoConn   = c;
    unoIsHost = true;
    unoMyIdx  = 0;
    unoSetupConn();
  });

  unoPeer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      unoPeer.destroy();
      initUnoNetwork();
    } else if (err.type === 'peer-unavailable') {
      unoNetStatus('No se encontró ese código. Revísalo.');
    } else {
      unoNetStatus('Error de red: ' + err.type);
    }
  });
}

function unoSetupConn() {
  unoConn.on('open', () => {
    unoNetStatus(unoIsHost ? 'Rival conectado. Iniciando partida…' : 'Conectado. Esperando que el anfitrión inicie…');
    unoConn.send({ type: 'handshake', name: config.name });

    // Minimizar automáticamente el modal para que no estorbe en pantalla
    setTimeout(() => {
      const p = $('uno-net-panel');
      const mb = $('uno-minibar');
      if (p) p.classList.add('hidden');
      if (mb) {
        mb.classList.remove('hidden');
        $('uno-minibar-text').textContent = `Online vs ${unoRivalName}`;
      }
    }, 1200);

    if (unoIsHost) {
      setTimeout(() => unoNetworkStartGame(), 900);
    }
  });

  unoConn.on('data', (data) => {
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'handshake':
        unoRivalName = String(data.name || 'Rival').slice(0, 12);
        unoNetStatus(`Conectado con ${unoRivalName}`);
        if ($('uno-minibar-text')) $('uno-minibar-text').textContent = `Online vs ${unoRivalName}`;
        if (unoIsHost && (!players || players.length < 2)) {
          setTimeout(() => unoNetworkStartGame(), 500);
        }
        break;
      case 'uno_sync_start':
        unoNetReceiveStart(data);
        break;
      case 'uno_action':
        unoReceiveNetAction(data);
        break;
      case 'restart':
        if (data.initData && !unoIsHost) {
          unoNetReceiveStart(data.initData);
        }
        break;
    }
  });

  unoConn.on('close', () => {
    unoNetStatus(`${unoRivalName} se desconectó.`);
    toast(`${unoRivalName} se desconectó`, { kind: 'warn', big: true });
  });
}

/* ---- Inicio sincronizado de partida ---- */
function unoNetworkStartGame() {
  if (!unoConn || !unoConn.open) {
    unoNetStatus('No hay conexión con el rival.');
    return;
  }
  let firstCard;
  do { firstCard = generateRandomCard(); } while (firstCard.type !== 'number');

  const hostHand = Array.from({ length: 7 }, generateRandomCard);
  const guestHand = Array.from({ length: 7 }, generateRandomCard);

  const initData = {
    type: 'uno_sync_start',
    firstCard,
    hostHand,
    guestHand,
    hostName: config.name || 'Jugador 1',
    guestName: unoRivalName || 'Rival'
  };

  unoConn.send(initData);
  unoStartOnlineGame(initData, true);
}

function unoNetReceiveStart(data) {
  unoStartOnlineGame(data, false);
}

/**
 * Arranca la partida de 2 jugadores en modo online:
 * - players[0] = Jugador local (mano abajo, isBot: false)
 * - players[1] = Rival remoto (arriba, isBot: false)
 * No se llama a botPlay() para el rival remoto.
 */
function unoStartOnlineGame(data, isHost) {
  unoOnlineMode = true;
  unoIsHost = isHost;
  unoMyIdx  = isHost ? 0 : 1;

  // Asegurar que el modal de código se oculte y muestre el minibar
  const panel = $('uno-net-panel');
  if (panel) panel.classList.add('hidden');
  const miniBar = $('uno-minibar');
  if (miniBar) {
    miniBar.classList.remove('hidden');
    $('uno-minibar-text').textContent = `Online vs ${unoRivalName}`;
  }

  const token = ++gameToken;
  busy = true;
  gameFinished = false;
  humanDrew = false;
  direction = 1;
  currentStack = 0;
  discardCard = data.firstCard;
  activeColor = data.firstCard.color;

  $('log-list').innerHTML = '';
  $('discard-deck').innerHTML = '';
  $('toast-layer').innerHTML = '';
  $('stack-counter').classList.add('hidden');

  const myName    = isHost ? (data.hostName || config.name) : (data.guestName || config.name);
  const otherName = isHost ? (data.guestName || unoRivalName) : (data.hostName || unoRivalName);
  config.name = myName;
  config.count = 2;

  const myHand    = isHost ? data.hostHand : data.guestHand;
  const otherHand = isHost ? data.guestHand : data.hostHand;

  players = [
    { name: myName,    isBot: false, hand: myHand,    emoji: myName[0].toUpperCase(),    hue: 210 },
    { name: otherName, isBot: false, hand: otherHand, emoji: otherName[0].toUpperCase(), hue: 340 }
  ];

  $('setup-screen').classList.add('hidden');
  $('game-app').classList.remove('hidden');
  buildSeats();
  updateCenter();
  showOnPile(data.firstCard, 0, false);
  renderAll();

  // El Host juega primero:
  // En pantalla del Host: activePlayerIdx = 0 (su turno)
  // En pantalla del Invitado: activePlayerIdx = 1 (espera jugada del Host)
  activePlayerIdx = isHost ? 0 : 1;
  updateTurnHighlights();

  if (isHost) {
    busy = false;
    renderAll();
    toast('¡Tu turno! Juega una carta o roba.', { kind: 'info', big: true });
    logAction(`Partida Online vs ${otherName}. Tu turno.`);
  } else {
    busy = true;
    renderAll();
    toast(`Turno de ${otherName}`, { kind: 'info' });
    logAction(`Partida Online vs ${otherName}. Turno de ${otherName}.`);
  }
}

/* ---- Enviar y recibir acciones de juego ---- */
function unoSendAction(action) {
  if (!unoOnlineMode || !unoConn || !unoConn.open) return;
  unoConn.send({ type: 'uno_action', ...action });
}

async function unoReceiveNetAction(data) {
  if (!unoOnlineMode) return;
  switch (data.action) {
    case 'play':
      await _netApplyPlay(data);
      break;
    case 'draw':
      await giveCards(1, data.count || 1);
      if (data.penalty) {
        currentStack = 0;
        updateCenter();
        activePlayerIdx = 0;
        busy = false;
        renderAll();
        toast('¡Tu turno!', { kind: 'info' });
      }
      break;
    case 'penalty':
      currentStack = 0;
      updateCenter();
      await giveCards(1, data.count || 1);
      // El rival aceptó el castigo y pierde su turno: le toca al jugador local
      activePlayerIdx = 0;
      busy = false;
      renderAll();
      toast('¡Tu turno!', { kind: 'info' });
      break;
    case 'pass':
      advanceTurn(null);
      break;
    case 'choose_color':
      activeColor = data.color;
      updateCenter();
      toast(`Color: ${COLOR_ES[activeColor]}`, { kind: activeColor });
      break;
    case 'swap':
      if (players.length >= 2) {
        const tmp = players[0].hand;
        players[0].hand = players[1].hand;
        players[1].hand = tmp;
        renderHand();
        updateSeat(0);
        updateSeat(1);
        toast('¡Intercambio de cartas!', { big: true });
      }
      break;
  }
}

/* Aplica la jugada del rival (jugador 1 en la pantalla local) */
async function _netApplyPlay(data) {
  const rivalIdx = 1;
  const p = players[rivalIdx];
  if (!p) return;

  const card = data.card;
  if (!card) return;

  let ci = p.hand.findIndex(c => c.id === card.id);
  if (ci === -1) {
    p.hand.push(card);
    ci = p.hand.length - 1;
  } else {
    p.hand[ci] = card;
  }
  await playCard(rivalIdx, ci);
}

function unoNetworkRestart(data) {
  if (data && data.unoConfig) {
    unoNetReceiveStart(data.unoConfig);
  }
}

/* ---- Nota sobre sincronización de acciones ----
   La sincronización de red se realiza llamando a unoSendAction() directamente
   desde los event listeners de clicks del jugador local (draw-deck, pass-btn)
   y desde onHandClick. No se sobreescriben las funciones internas (incompatible
   con 'use strict' y el scope local del módulo).
   ------------------------------------------- */

/* ---- CSS del panel online y minibar (se inyecta dinámicamente) ---- */
(function injectOnlineStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .uno-net-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      background: linear-gradient(135deg, #1a1a3e, #0d1b2a);
      border: 2px solid #7b61ff;
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 8px 40px rgba(0,0,0,0.7);
      font-family: 'Fredoka', 'Segoe UI', sans-serif;
      min-width: 310px;
      max-width: 400px;
      width: 90vw;
    }
    .uno-net-panel.hidden { display: none !important; }
    .uno-net-inner { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .uno-net-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(123,97,255,0.3);
    }
    .uno-net-header .uno-net-title { color: #f1c40f; font-size: 1.25rem; font-weight: bold; }
    .uno-net-header-actions { display: flex; gap: 8px; }
    .uno-icon-btn {
      background: #232348;
      color: #fff;
      border: 1px solid #7b61ff;
      border-radius: 6px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .uno-icon-btn:hover { background: #7b61ff; }
    .net-row { display: flex; flex-direction: column; gap: 4px; }
    .net-row label { font-size: 0.85rem; color: #aaa; font-weight: 600; }
    .net-code-wrap { display: flex; gap: 8px; }
    .net-code-wrap input { flex: 1; }
    #uno-my-code, #uno-remote-code {
      background: #0d1b2a;
      color: #fff;
      border: 1px solid #7b61ff;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 1.1rem;
      letter-spacing: 3px;
      font-weight: bold;
      text-transform: uppercase;
      font-family: 'Fredoka', monospace;
    }
    #uno-copy-btn {
      background: #7b61ff;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    #uno-copy-btn:hover { background: #9b81ff; }
    #uno-connect-btn {
      background: linear-gradient(90deg, #e94560, #ff6b35);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      font-family: 'Fredoka', sans-serif;
    }
    #uno-connect-btn:hover { opacity: 0.88; }
    #uno-connect-btn:active { transform: scale(0.97); }
    .net-status {
      text-align: center;
      font-size: 0.9rem;
      color: #7b61ff;
      padding: 4px 0 0;
      min-height: 20px;
    }
    .uno-minibar {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 10000;
      background: rgba(13, 27, 42, 0.95);
      border: 1.5px solid #7b61ff;
      border-radius: 30px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fff;
      font-size: 0.85rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      backdrop-filter: blur(4px);
    }
    .uno-minibar.hidden { display: none !important; }
    .uno-minibar-btn {
      background: #7b61ff;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 3px 10px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .uno-minibar-btn:hover { background: #9b81ff; }
  `;
  document.head.appendChild(style);
})();

/* ---- Integración con la página padre (index.html) via postMessage ---- */
(function setupPostMessageBridge() {
  // Avisar al padre que estamos listos
  window.addEventListener('load', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'UNO_READY' }, '*');
    }
  });

  // Recibir mensajes del padre
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    const { type } = e.data;

    if (type === 'UNO_CONFIG') {
      // Aplicar configuración enviada desde index.html
      const { name, count, difficulty, mode } = e.data;
      config.name       = name || config.name;
      config.count      = count || config.count;
      config.difficulty = difficulty || config.difficulty;

      // Si el modo es online, inicializar la red UNO
      if (mode === 'online') {
        if (!unoPeer || unoPeer.destroyed) {
          initUnoNetwork();
        }
      } else {
        // Ocultar panel online si existe
        const panel = $('uno-net-panel');
        if (panel) panel.classList.add('hidden');
        unoOnlineMode = false;
      }

      // Actualizar los campos del setup-screen con los valores del padre
      const nameEl  = $('your-name');
      const countEl = $('player-count');
      const diffEl  = $('bot-difficulty');
      if (nameEl  && name)       nameEl.value  = name;
      if (countEl && count)      countEl.value = count;
      if (diffEl  && difficulty) diffEl.value  = difficulty;
    }

    if (type === 'UNO_START') {
      // El padre pulsó "Iniciar Juego"
      if (unoOnlineMode) {
        // En modo online el arranque lo gestiona la red
        if (unoIsHost && unoConn && unoConn.open) {
          unoNetworkStartGame();
        } else if (!unoPeer) {
          unoNetStatus('Conecta primero con tu rival.');
        }
      } else {
        // Lanzar partida normal
        $('start-btn') && $('start-btn').click();
      }
    }

    if (type === 'UNO_PEER_CODE') {
      // El padre nos pasa su código peer (para mostrarlo si queremos)
      if ($('uno-my-code') && e.data.code) {
        $('uno-my-code').value = e.data.code;
      }
    }
  });
}());
