/**
 * BLACKJACK — mesa de casino recreativa (fichas virtuales, sin dinero real)
 *
 * Arquitectura (igual que el modo online del Un0 pero para 1-5 jugadores):
 *  - El ANFITRIÓN (o la partida en solitario) ejecuta el motor: baraja 6 mazos, reparte,
 *    valida jugadas y paga. Es la única fuente de verdad.
 *  - Tras cada cambio manda una "foto" (snapshot) del estado a todos. La carta oculta del
 *    crupier NO viaja por la red hasta que se revela, así que nadie puede hacer trampa.
 *  - Cada jugador (incluido el anfitrión) dibuja la mesa a partir de esa foto y anima
 *    lo que cambió (cartas que salen del zapato, fichas, volteo de la carta del crupier...).
 */
'use strict';

/* ============================ UTILIDADES ============================ */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (n, m) => ((n % m) + m) % m;
const clone = (o) => JSON.parse(JSON.stringify(o));
const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function randInt(n) {                       // entero aleatorio criptográfico en [0, n)
  const a = new Uint32Array(1);
  const max = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= max);
  return a[0] % n;
}

/* ============================ CONSTANTES ============================ */
const MIN_BET = 10;
const MAX_BET = 500;
const START_CHIPS = 1000;
const REBUY = 1000;
const DECKS = 6;
const MAX_SEATS = 5;
const RESHUFFLE_AT = 78;                    // se baraja cuando quedan menos de ~1,5 mazos

const BET_MS = 30000;                       // online: tiempo para apostar
const TURN_MS = 25000;                      // online: tiempo por decisión
const INS_MS = 15000;                       // online: tiempo para el seguro
const DEAL_MS = 420;                        // pausa entre cartas repartidas
const PAYOUT_MS = 5200;                     // cuánto se ve el resultado

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];         // picas, corazones, diamantes, tréboles

// Fichas (paleta de la foto: blanca, roja, azul, verde). Todas múltiplos de 10 para que el 3:2 y el seguro sean enteros.
const CHIPS = [
  { v: 10,  cls: 'white' },
  { v: 50,  cls: 'red' },
  { v: 100, cls: 'blue' },
  { v: 500, cls: 'green' },
];

const BOT_NAMES = ['Luna', 'Max', 'Nova', 'Kiko', 'Zoe'];
const SEAT_HUES = [8, 205, 275, 145, 38];

/* ============================ REGLAS (compartidas por motor y vista) ============================ */
function cardPoints(c) {
  if (c.r === 'A') return 11;
  if (c.r === 'K' || c.r === 'Q' || c.r === 'J') return 10;
  return parseInt(c.r, 10);
}

/** Valor de una mano: el As vale 11 u 1 según evite pasarse de 21 */
function handValue(cards) {
  let total = 0, aces = 0;
  cards.forEach((c) => {
    if (c.back) return;
    total += cardPoints(c);
    if (c.r === 'A') aces++;
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

const isBJ = (cards) => cards.length === 2 && handValue(cards).total === 21;

function legalActs(seat, hand) {
  if (!hand || hand.done) return { hit: false, stand: false, double: false, split: false };
  const two = hand.cards.length === 2;
  return {
    hit: true,
    stand: true,
    double: two && seat.chips >= hand.bet,
    split: two && seat.hands.length === 1 && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]) && seat.chips >= hand.bet,
  };
}

/** Descompone una cantidad en fichas (de mayor a menor valor) */
function chipBreakdown(amount) {
  const out = [];
  let left = amount;
  for (let i = CHIPS.length - 1; i >= 0; i--) {
    const n = Math.floor(left / CHIPS[i].v);
    if (n > 0) { out.push({ chip: CHIPS[i], n }); left -= n * CHIPS[i].v; }
  }
  return out;
}

/* ============================ SONIDO ============================ */
class Sfx {
  constructor() { this.ctx = null; }
  _c() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(f, d = 0.1, { type = 'sine', vol = 0.08, delay = 0, slide = 0 } = {}) {
    const c = this._c(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  }
  noise(d = 0.05, vol = 0.05, hp = 2500) {
    const c = this._c(); if (!c) return;
    const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  card() { this.noise(0.07, 0.06, 1800); }
  chip() { this.tone(1800, 0.04, { type: 'triangle', vol: 0.05 }); this.tone(1200, 0.05, { type: 'triangle', vol: 0.04, delay: 0.03 }); }
  win()  { [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', delay: i * 0.1 })); }
  bj()   { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.09 })); }
  lose() { this.tone(300, 0.3, { type: 'sawtooth', vol: 0.05, slide: -150 }); }
  push() { this.tone(440, 0.18, { type: 'triangle' }); }
  turn() { this.tone(880, 0.08, { type: 'square', vol: 0.04 }); this.tone(1175, 0.1, { type: 'square', vol: 0.04, delay: 0.08 }); }
}
const sfx = new Sfx();

/* =====================================================================
   MOTOR (solo corre en el anfitrión / partida en solitario)
   ===================================================================== */
const G = {
  token: 0, running: false,
  seats: [], dealer: [], shoe: [], cardId: 0, v: 0,
  phase: 'idle', round: 0, msg: '', turn: null, revealed: false,
  deadline: 0, deadlineTotal: 0, cfg: { hit17: false }, accept: false,   // accept: el motor está esperando la jugada de un humano
};

function newShoe() {
  const cards = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
  for (let i = cards.length - 1; i > 0; i--) {         // Fisher-Yates con aleatoriedad criptográfica
    const j = randInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function drawCard() {
  if (!G.shoe.length) G.shoe = newShoe();
  const c = G.shoe.pop();
  return { id: ++G.cardId, r: c.r, s: c.s };           // el id sigue el orden de reparto, no revela el valor
}

function snapshot() {
  const hideHole = !G.revealed && G.dealer.length >= 2;
  const timeLeft = G.deadline ? Math.max(0, G.deadline - Date.now()) : 0;
  return {
    v: ++G.v, phase: G.phase, round: G.round, msg: G.msg, turn: G.turn ? { ...G.turn, wait: G.accept } : null,
    timeLeft, timeTotal: G.deadlineTotal, shoeLeft: G.shoe.length, hit17: G.cfg.hit17,
    dealer: {
      cards: G.dealer.map((c, i) => (hideHole && i === 1 ? { id: c.id, back: true } : c)),
      revealed: G.revealed,
    },
    seats: G.seats.map((s) => ({
      i: s.i, name: s.name, hue: s.hue, isBot: s.isBot, connected: s.connected,
      chips: s.chips, bet: s.bet, lastBet: s.lastBet, ready: s.ready, sitOut: s.sitOut,
      insurance: s.insurance, insAnswered: s.insAnswered, delta: s.delta,
      hands: s.hands.map((h) => ({
        cards: h.cards, bet: h.bet, done: h.done, doubled: h.doubled,
        bj: h.bj, bust: h.bust, result: h.result, delta: h.delta,
      })),
    })),
  };
}

function broadcast() {
  const s = snapshot();
  G.seats.forEach((seat) => {
    if (seat.local) onState(clone(s));
    else if (seat.conn && seat.conn.open) seat.conn.send({ t: 'state', s });
  });
}

function toastAll(text, kind = '') {
  G.seats.forEach((seat) => {
    if (seat.local) showToast(text, kind);
    else if (seat.conn && seat.conn.open) seat.conn.send({ t: 'toast', text, kind });
  });
}

function setTimer(ms) {
  G.deadlineTotal = ms || 0;
  G.deadline = ms ? Date.now() + ms : 0;
}

const hasRemoteHumans = () => G.seats.some((s) => !s.isBot && !s.local && s.connected);

function makeSeat(i, m) {
  return {
    i, name: m.name, hue: SEAT_HUES[i % SEAT_HUES.length], isBot: !!m.isBot, local: !!m.local, conn: m.conn || null,
    connected: true, chips: START_CHIPS, bet: 0, lastBet: 0, ready: false, sitOut: false,
    insurance: 0, insAnswered: false, delta: 0, hands: [], queued: null, _sched: false,
  };
}

function newHand(bet, fromSplit = false) {
  return { cards: [], bet, done: false, doubled: false, bj: false, bust: false, fromSplit, result: null, delta: 0 };
}

function resetRound() {
  G.dealer = []; G.revealed = false; G.turn = null; G.msg = '';
  G.seats.forEach((s) => {
    s.hands = []; s.bet = 0; s.ready = false; s.insurance = 0; s.insAnswered = false; s.delta = 0;
    s.queued = null; s._sched = false;
    if (s.isBot && s.chips < MIN_BET) s.chips += REBUY;         // los bots se recargan solos
    s.sitOut = s.chips < MIN_BET;
  });
}

/* ---------- Acciones que llegan de los jugadores ---------- */
function engineAct(idx, a) {
  const s = G.seats[idx];
  if (!s || !a || s.isBot) return;
  switch (a.type) {
    case 'chip':
      if (G.phase !== 'betting' || s.ready || s.sitOut) return;
      if (!CHIPS.some((c) => c.v === a.v)) return;
      if (s.bet + a.v > MAX_BET || a.v > s.chips) return;
      s.chips -= a.v; s.bet += a.v;
      break;
    case 'clear':
      if (G.phase !== 'betting' || s.ready) return;
      s.chips += s.bet; s.bet = 0;
      break;
    case 'rebet': {
      if (G.phase !== 'betting' || s.ready || s.sitOut) return;
      s.chips += s.bet; s.bet = 0;
      const amt = Math.min(s.lastBet, MAX_BET, s.chips);
      const v = amt - (amt % 10);
      if (v >= MIN_BET) { s.chips -= v; s.bet = v; }
      break;
    }
    case 'ready':
      if (G.phase !== 'betting' || s.ready || s.bet < MIN_BET) return;
      s.ready = true;
      break;
    case 'rebuy':
      if (G.phase !== 'betting' || s.ready || s.chips + s.bet >= MIN_BET) return;
      s.chips += REBUY; s.sitOut = false;
      break;
    case 'insurance':
      if (G.phase !== 'insurance' || s.insAnswered || !s.ready || !s.hands.length) return;
      s.insAnswered = true;
      if (a.take && s.chips >= s.bet / 2) { s.insurance = s.bet / 2; s.chips -= s.insurance; }
      break;
    case 'hit': case 'stand': case 'double': case 'split':
      if (G.phase !== 'playing' || !G.turn || G.turn.seat !== idx || !G.accept) return;     // solo se acepta cuando el motor espera
      s.queued = a;
      return;                                                  // lo recoge el bucle de turnos
    default: return;
  }
  broadcast();
}

function engineSeatLeft(idx) {
  const s = G.seats[idx];
  if (!s || s.isBot) return;
  s.isBot = true; s.local = false; s.conn = null;               // lo sustituye un bot con sus mismas fichas
  s.name = `${s.name} (bot)`;
  toastAll(`${s.name} reemplaza a un jugador desconectado`, 'warn');
  broadcast();
}

function engineStop() { G.token++; G.running = false; G.phase = 'idle'; }

/* ---------- Bots ---------- */
function botBetAmount(s) {
  const opts = [10, 20, 50, 50, 100, 100, 150, 200];
  let a = opts[randInt(opts.length)];
  a = Math.min(a, s.chips, MAX_BET);
  a -= a % 10;
  return Math.max(a, MIN_BET);
}

function scheduleBotBets(tk) {
  G.seats.forEach((s) => {
    if (!s.isBot || s._sched || s.ready || s.sitOut) return;
    s._sched = true;
    setTimeout(() => {
      if (tk !== G.token || G.phase !== 'betting' || s.ready) { s._sched = false; return; }
      s.bet = botBetAmount(s); s.chips -= s.bet; s.ready = true;
      broadcast();
    }, 700 + randInt(1800));
  });
}

/** Estrategia básica simplificada para los bots */
function botDecide(seat, hand) {
  const acts = legalActs(seat, hand);
  const { total, soft } = handValue(hand.cards);
  const up = cardPoints(G.dealer[0]);
  const pair = hand.cards.length === 2 && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]);
  if (acts.split && pair && (hand.cards[0].r === 'A' || cardPoints(hand.cards[0]) === 8)) return { type: 'split' };
  if (soft) {
    if (acts.double && total >= 15 && total <= 17 && up >= 4 && up <= 6) return { type: 'double' };
    if (total <= 17) return { type: 'hit' };
    if (total === 18 && (up >= 9)) return { type: 'hit' };
    return { type: 'stand' };
  }
  if (total <= 8) return { type: 'hit' };
  if (total === 9) return acts.double && up >= 3 && up <= 6 ? { type: 'double' } : { type: 'hit' };
  if (total === 10 || total === 11) return acts.double && up < 10 ? { type: 'double' } : { type: 'hit' };
  if (total === 12) return up >= 4 && up <= 6 ? { type: 'stand' } : { type: 'hit' };
  if (total <= 16) return up <= 6 ? { type: 'stand' } : { type: 'hit' };
  return { type: 'stand' };
}

/* ---------- Turno de un asiento ---------- */
async function waitHuman(seat, tk, ms) {
  seat.queued = null;
  setTimer(ms);
  G.accept = true;
  broadcast();
  const start = Date.now();
  const done = (r) => { G.accept = false; return r; };
  while (tk === G.token) {
    if (seat.isBot) return done(null);                 // se desconectó: que decida la IA
    if (seat.queued) { const a = seat.queued; seat.queued = null; return done(a); }
    if (ms && Date.now() - start > ms) return done({ type: 'stand' });
    await sleep(100);
  }
  return done({ type: 'stand' });
}

async function playSeat(seat, tk) {
  for (let hi = 0; hi < seat.hands.length; hi++) {
    G.turn = { seat: seat.i, hand: hi };
    while (tk === G.token) {
      const hand = seat.hands[hi];
      if (hand.done) break;
      const t = handValue(hand.cards).total;
      if (t >= 21) { hand.done = true; if (t > 21) hand.bust = true; break; }

      let act;
      if (seat.isBot) { G.accept = false; setTimer(0); broadcast(); await sleep(900 + randInt(500)); act = botDecide(seat, hand); }
      else {
        act = await waitHuman(seat, tk, hasRemoteHumans() ? TURN_MS : 0);
        if (!act) act = botDecide(seat, hand);
      }
      if (tk !== G.token) return;

      const acts = legalActs(seat, hand);
      if (act.type === 'stand') {
        hand.done = true;
      } else if (act.type === 'hit' && acts.hit) {
        hand.cards.push(drawCard());
        broadcast(); await sleep(DEAL_MS);
        const v = handValue(hand.cards).total;
        if (v > 21) { hand.bust = true; hand.done = true; }
      } else if (act.type === 'double' && acts.double) {
        seat.chips -= hand.bet; hand.bet *= 2; hand.doubled = true;
        broadcast(); await sleep(350);
        hand.cards.push(drawCard());
        hand.done = true;
        if (handValue(hand.cards).total > 21) hand.bust = true;
        broadcast(); await sleep(DEAL_MS);
      } else if (act.type === 'split' && acts.split) {
        seat.chips -= hand.bet;
        const [c0, c1] = hand.cards;
        const h0 = newHand(hand.bet, true), h1 = newHand(hand.bet, true);
        h0.cards = [c0]; h1.cards = [c1];
        seat.hands = [h0, h1];
        broadcast(); await sleep(450);
        h0.cards.push(drawCard()); broadcast(); await sleep(DEAL_MS);
        h1.cards.push(drawCard()); broadcast(); await sleep(DEAL_MS);
      }
      // cualquier otra acción no válida se ignora y se vuelve a esperar
    }
    if (tk !== G.token) return;
  }
}

/* ---------- Una ronda completa ---------- */
async function playRound(tk) {
  const alive = () => tk === G.token;

  G.round++;
  resetRound();
  if (G.shoe.length < RESHUFFLE_AT) {
    G.shoe = newShoe(); G.phase = 'shuffle'; G.msg = 'Barajando las 6 barajas…';
    broadcast(); await sleep(1500);
    if (!alive()) return;
  }

  /* --- 1. APUESTAS --- */
  G.phase = 'betting'; G.msg = 'Hagan sus apuestas';
  setTimer(hasRemoteHumans() ? BET_MS : 0);
  broadcast();
  while (alive()) {
    scheduleBotBets(tk);
    const waiting = G.seats.filter((s) => s.connected && !s.sitOut && !s.ready);
    const expired = G.deadline && Date.now() >= G.deadline;
    if (!waiting.length || expired) break;
    await sleep(150);
  }
  if (!alive()) return;
  G.seats.forEach((s) => {                                 // cierra las apuestas
    if (s.bet >= MIN_BET) { s.ready = true; s.lastBet = s.bet; }
    else { s.chips += s.bet; s.bet = 0; s.ready = false; s.sitOut = true; }
  });
  const inRound = G.seats.filter((s) => s.ready);
  setTimer(0);
  if (!inRound.length) {
    G.msg = 'Nadie apostó'; broadcast(); await sleep(1600);
    G.round--; return;
  }

  /* --- 2. REPARTO (de derecha a izquierda; cartas del crupier: una arriba, otra oculta) --- */
  G.phase = 'dealing'; G.msg = 'Repartiendo…'; broadcast(); await sleep(500);
  inRound.forEach((s) => { s.hands = [newHand(s.bet)]; });
  for (let pass = 0; pass < 2; pass++) {
    for (const s of inRound) {
      if (!alive()) return;
      s.hands[0].cards.push(drawCard()); broadcast(); await sleep(DEAL_MS);
    }
    G.dealer.push(drawCard()); broadcast(); await sleep(DEAL_MS);
  }
  inRound.forEach((s) => { const h = s.hands[0]; if (isBJ(h.cards)) { h.bj = true; h.done = true; } });
  G.msg = ''; broadcast();

  /* --- 3. SEGURO Y COMPROBACIÓN DEL CRUPIER --- */
  const up = G.dealer[0];
  let dealerBJ = false;
  if (up.r === 'A') {
    G.phase = 'insurance'; G.msg = 'Seguro: apuesta extra de la mitad, paga 2 a 1';
    inRound.forEach((s) => { if (s.isBot) s.insAnswered = true; });
    setTimer(hasRemoteHumans() ? INS_MS : 0);
    broadcast();
    while (alive()) {
      const pending = inRound.filter((s) => !s.insAnswered && !s.isBot);
      const expired = G.deadline && Date.now() >= G.deadline;
      if (!pending.length || expired) break;
      await sleep(150);
    }
    if (!alive()) return;
    inRound.forEach((s) => { s.insAnswered = true; });
    setTimer(0);
  }
  if (up.r === 'A' || cardPoints(up) === 10) {
    G.phase = 'peek'; G.msg = 'El crupier mira su carta…'; broadcast(); await sleep(1100);
    dealerBJ = isBJ(G.dealer);
    if (dealerBJ) { G.revealed = true; G.msg = 'El crupier tiene Blackjack'; broadcast(); await sleep(1500); }
    else if (up.r === 'A') { G.msg = 'Sin Blackjack: los seguros se pierden'; broadcast(); await sleep(1200); }
  }
  if (!alive()) return;

  /* --- 4. TURNO DE LOS JUGADORES --- */
  if (!dealerBJ) {
    G.phase = 'playing'; G.msg = '';
    for (const s of inRound) {
      if (!alive()) return;
      if (s.hands.every((h) => h.done)) continue;
      await playSeat(s, tk);
    }
    G.turn = null; G.accept = false; setTimer(0);
    if (!alive()) return;

    /* --- 5. JUEGA EL CRUPIER --- */
    G.phase = 'dealer'; G.revealed = true; G.msg = 'Juega el crupier'; broadcast(); await sleep(900);
    const live = inRound.some((s) => s.hands.some((h) => !h.bust && !h.bj));
    if (live) {
      for (;;) {
        const { total, soft } = handValue(G.dealer);
        const mustHit = total < 17 || (total === 17 && soft && G.cfg.hit17);
        if (!mustHit || !alive()) break;
        G.dealer.push(drawCard()); broadcast(); await sleep(750);
      }
    }
  }
  if (!alive()) return;

  /* --- 6. PAGOS --- */
  settle(inRound);
  G.phase = 'payout'; G.turn = null;
  const dv = handValue(G.dealer).total;
  G.msg = dealerBJ ? 'Blackjack del crupier' : dv > 21 ? `El crupier se pasa con ${dv}` : `El crupier se planta con ${dv}`;
  broadcast();
  await sleep(PAYOUT_MS);
}

function settle(inRound) {
  const dv = handValue(G.dealer).total;
  const dBJ = isBJ(G.dealer);
  const dBust = dv > 21;
  inRound.forEach((s) => {
    s.delta = 0;
    s.hands.forEach((h) => {
      const p = handValue(h.cards).total;
      let res, credit, delta;
      if (h.bust) { res = 'bust'; credit = 0; delta = -h.bet; }
      else if (h.bj) {
        if (dBJ) { res = 'push'; credit = h.bet; delta = 0; }
        else { res = 'blackjack'; credit = h.bet * 2.5; delta = h.bet * 1.5; }       // 3:2
      }
      else if (dBJ) { res = 'lose'; credit = 0; delta = -h.bet; }
      else if (dBust || p > dv) { res = 'win'; credit = h.bet * 2; delta = h.bet; }    // 1:1
      else if (p === dv) { res = 'push'; credit = h.bet; delta = 0; }
      else { res = 'lose'; credit = 0; delta = -h.bet; }
      s.chips += credit; h.result = res; h.delta = delta; s.delta += delta;
    });
    if (s.insurance) {                                                                // seguro 2:1
      if (dBJ) { s.chips += s.insurance * 3; s.delta += s.insurance * 2; }
      else { s.delta -= s.insurance; }
    }
  });
}

async function roundLoop(tk) {
  while (tk === G.token) {
    try { await playRound(tk); } catch (e) { console.error('Error en la ronda', e); await sleep(1000); }
  }
}

function startEngine(meta, cfg) {
  G.token++;
  const tk = G.token;
  G.running = true;
  G.cfg = { hit17: !!cfg.hit17 };
  G.seats = meta.map((m, i) => makeSeat(i, m));
  G.dealer = []; G.shoe = newShoe(); G.round = 0; G.cardId = 0; G.v = 0; G.revealed = false; G.turn = null;
  roundLoop(tk);
}

/* =====================================================================
   VISTA (cada jugador dibuja la mesa a partir de las fotos del estado)
   ===================================================================== */
let S = null;                 // última foto del estado
let me = 0;                   // mi asiento
let seatEls = [];
let seatMeta = [];
const cardEls = new Map();    // id de carta -> elemento DOM
let pendingFlights = [];
let timerEnd = 0;
let tickHandle = null;
let lastPhaseRendered = '';

/* ---------- Cartas ---------- */
const PIPS = {
  '2': [[50, 18], [50, 82]],
  '3': [[50, 18], [50, 50], [50, 82]],
  '4': [[30, 18], [70, 18], [30, 82], [70, 82]],
  '5': [[30, 18], [70, 18], [50, 50], [30, 82], [70, 82]],
  '6': [[30, 18], [70, 18], [30, 50], [70, 50], [30, 82], [70, 82]],
  '7': [[30, 18], [70, 18], [50, 34], [30, 50], [70, 50], [30, 82], [70, 82]],
  '8': [[30, 18], [70, 18], [50, 34], [30, 50], [70, 50], [50, 66], [30, 82], [70, 82]],
  '9': [[30, 18], [70, 18], [30, 39], [70, 39], [50, 50], [30, 61], [70, 61], [30, 82], [70, 82]],
  '10': [[30, 18], [70, 18], [50, 29], [30, 39], [70, 39], [30, 61], [70, 61], [50, 71], [30, 82], [70, 82]],
};

const suitSvg = (s, cls = 'sv') => `<svg class="${cls}" viewBox="0 0 100 100"><use href="#s-${s}"/></svg>`;

function courtFigure(r) {
  const skin = '#f5c9a0', gold = '#f2b632';
  const body = '<path d="M4 40Q4 27 20 26Q36 27 36 40Z" fill="var(--rc)"/><path d="M15 26L20 33L25 26Z" fill="#fff"/>';
  const head = `<circle cx="20" cy="17" r="7" fill="${skin}"/>`;
  if (r === 'K') return `<svg viewBox="0 0 40 40">${body}${head}<path d="M13.5 19Q20 33 26.5 19Q20 24 13.5 19Z" fill="#d6d6d6"/><path d="M12 12L13.5 4L17.5 9L20 3L22.5 9L26.5 4L28 12Z" fill="${gold}"/></svg>`;
  if (r === 'Q') return `<svg viewBox="0 0 40 40">${body}<path d="M11.5 14Q9 30 14 31L14.5 17Z M28.5 14Q31 30 26 31L25.5 17Z" fill="#7a4a2a"/>${head}<path d="M13 12L14.5 5L18 9L20 3.5L22 9L25.5 5L27 12Z" fill="${gold}"/><circle cx="20" cy="9" r="1.1" fill="#d63b3b"/></svg>`;
  return `<svg viewBox="0 0 40 40">${body}${head}<path d="M12 14Q20 2 28 14Z" fill="var(--rc)"/><path d="M27 9Q36 3 34 15" stroke="${gold}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

function faceHTML(c) {
  const idx = `<b>${c.r}</b>${suitSvg(c.s)}`;
  let center;
  if (c.r === 'A') center = `<div class="ace">${suitSvg(c.s)}</div>`;
  else if (PIPS[c.r]) center = PIPS[c.r].map(([x, y]) => `<span class="pip${y > 50 ? ' inv' : ''}" style="left:${x}%;top:${y}%">${suitSvg(c.s)}</span>`).join('');
  else center = `<div class="court"><div class="half">${courtFigure(c.r)}</div><div class="half inv">${courtFigure(c.r)}</div><span class="cs a">${suitSvg(c.s)}</span><span class="cs b">${suitSvg(c.s)}</span></div>`;
  return `<div class="idx tl">${idx}</div><div class="center">${center}</div><div class="idx br">${idx}</div>`;
}

const cardColor = (c) => (c.s === 'H' || c.s === 'D' ? 'red' : 'black');

function makeCardEl(c) {
  const el = document.createElement('div');
  el.className = 'card' + (c.back ? ' down' : '');
  el.dataset.id = c.id;
  el.innerHTML = `<div class="inner"><div class="face front ${c.back ? '' : cardColor(c)}">${c.back ? '' : faceHTML(c)}</div><div class="face rear"></div></div>`;
  el._known = !c.back;
  return el;
}

function updateCardEl(el, c) {
  if (!el._known && !c.back) {                                   // la carta oculta del crupier se revela: se voltea
    const f = el.querySelector('.front');
    f.className = `face front ${cardColor(c)}`;
    f.innerHTML = faceHTML(c);
    el._known = true;
    setTimeout(() => { el.classList.remove('down'); sfx.card(); }, 60);
  }
}

/* ---------- Fichas ---------- */
function makeChipEl(def, sizeCss) {
  const el = document.createElement('div');
  el.className = `chip ${def.cls}`;
  if (sizeCss) el.style.setProperty('--cs', sizeCss);
  el.innerHTML = `<i></i><span>${def.v}</span>`;
  return el;
}

function setStack(el, amount) {
  if (el.dataset.amt === String(amount)) return;
  const prev = parseInt(el.dataset.amt || '0', 10);
  el.dataset.amt = amount;
  el.innerHTML = '';
  chipBreakdown(amount).forEach(({ chip, n }) => {
    const col = document.createElement('div');
    col.className = 'col';
    const shown = Math.min(n, 9);
    for (let k = 0; k < shown; k++) {
      const c = makeChipEl(chip);
      c.style.setProperty('--k', k);
      col.appendChild(c);
    }
    el.appendChild(col);
  });
  if (amount > prev && !REDUCE) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}

/* ---------- Animación genérica de objetos que vuelan ---------- */
async function fly({ make, from, to, delay = 0, duration = 520, arc = -50, flipAt = 0, onLand }) {
  if (delay) await sleep(delay);
  if (REDUCE) { if (onLand) onLand(); return; }
  const f = typeof from === 'function' ? from() : from;
  const t = typeof to === 'function' ? to() : to;
  const el = make();
  el.classList.add('flyer');
  $('table').appendChild(el);
  const nw = el.offsetWidth || 1;
  const fc = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
  const tc = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
  el.style.left = `${fc.x - nw / 2}px`;
  el.style.top = `${fc.y - (el.offsetHeight || nw) / 2}px`;
  const s0 = f.width / nw, s1 = t.width / nw;
  const dx = tc.x - fc.x, dy = tc.y - fc.y;
  if (flipAt) setTimeout(() => el.classList.remove('down'), duration * flipAt);
  const anim = el.animate([
    { transform: `translate(0,0) scale(${s0})` },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 + arc}px) scale(${((s0 + s1) / 2) * 1.12})`, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) scale(${s1})` },
  ], { duration, easing: 'cubic-bezier(.3,.7,.25,1)', fill: 'both' });
  try { await anim.finished; } catch (e) { /* cancelada */ }
  if (onLand) onLand();
  el.remove();
}

function launchFlights() {
  const list = pendingFlights;
  pendingFlights = [];
  list.forEach((el, k) => {
    const hole = el.classList.contains('down');
    fly({
      make: () => { const c = el.cloneNode(true); c.style.visibility = ''; if (!hole) c.classList.add('down'); return c; },
      from: () => $('shoe').getBoundingClientRect(),
      to: () => el.getBoundingClientRect(),
      delay: k * 130, duration: 480, arc: -30, flipAt: hole ? 0 : 0.4,
      onLand: () => { el.style.visibility = ''; sfx.card(); },
    });
  });
}

function reconcileCards(container, cards) {
  cards.forEach((c, idx) => {
    let el = cardEls.get(c.id);
    if (!el) {
      el = makeCardEl(c);
      cardEls.set(c.id, el);
      el.style.visibility = 'hidden';
      pendingFlights.push(el);
    } else updateCardEl(el, c);
    if (container.children[idx] !== el) container.insertBefore(el, container.children[idx] || null);
  });
  while (container.children.length > cards.length) container.lastElementChild.remove();
}

/* ---------- Construcción de la mesa ---------- */
function seatAngles(n) {
  if (n === 1) return [90];
  return Array.from({ length: n }, (_, i) => 24 + (132 * i) / (n - 1));    // asiento 0 = derecha, juega primero
}

function buildSeats(n) {
  const box = $('seats');
  box.innerHTML = '';
  seatEls = [];
  const angles = seatAngles(n);
  for (let i = 0; i < n; i++) {
    const th = (angles[i] * Math.PI) / 180;
    const x = 50 + 38 * Math.cos(th);
    const y = 7 + 39 * Math.sin(th);
    const el = document.createElement('div');
    el.className = 'seat';
    el.dataset.i = i;
    el.style.left = `${x}%`;
    el.style.top = `${(y / 58) * 100}%`;
    el.innerHTML = `
      <div class="hands"></div>
      <div class="bet-spot"><div class="circle"></div><div class="bet-stacks"></div><div class="bet-amt"></div><div class="ins-chip hidden"></div></div>
      <div class="plate"><div class="ring"></div><div class="av"></div><div class="who"><div class="nm"></div><div class="bal"></div></div></div>`;
    box.appendChild(el);
    seatEls.push({
      root: el, hands: el.querySelector('.hands'), stacks: el.querySelector('.bet-stacks'),
      amt: el.querySelector('.bet-amt'), ins: el.querySelector('.ins-chip'),
      av: el.querySelector('.av'), nm: el.querySelector('.nm'), bal: el.querySelector('.bal'), ring: el.querySelector('.ring'),
    });
  }
  box.style.setProperty('--k', n >= 4 ? 0.88 : 1);
}

function fitTable() {
  const wrap = $('table-wrap');
  if (!wrap) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const u = Math.max(4, Math.min(w / 112, (h - 8) / 70.5));
  $('table').style.setProperty('--u', `${u}px`);
}
window.addEventListener('resize', fitTable);

function buildRack() {
  const rack = $('chip-rack');
  rack.innerHTML = '';
  CHIPS.forEach((def) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-btn';
    b.dataset.v = def.v;
    b.setAttribute('aria-label', `Ficha de ${def.v}`);
    b.appendChild(makeChipEl(def, '56px'));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      sendAct({ type: 'chip', v: def.v });
      sfx.chip();
      const spot = seatEls[me] && seatEls[me].root.querySelector('.circle');
      if (spot) {
        fly({
          make: () => makeChipEl(def, '56px'),
          from: b.getBoundingClientRect(), to: () => spot.getBoundingClientRect(),
          duration: 380, arc: -60,
        });
      }
    });
    rack.appendChild(b);
  });
}

/* ---------- Dibujo de cada foto ---------- */
function fmtTotal(cards) {
  if (!cards.length) return '';
  const { total, soft } = handValue(cards);
  return soft && total < 21 ? `${total - 10}/${total}` : `${total}`;
}

const RES_TEXT = {
  blackjack: (d) => `BLACKJACK +${d}`, win: (d) => `GANA +${d}`, lose: (d) => `PIERDE −${-d}`,
  bust: (d) => `SE PASA −${-d}`, push: () => 'EMPATE',
};

function onState(s) {
  if (S && s.v <= S.v) return;                       // foto vieja
  const prev = S;
  S = s;
  render(prev);
}

function clearTable() {
  cardEls.forEach((el) => el.remove());
  cardEls.clear();
  pendingFlights = [];
  seatEls.forEach((se) => {
    se.hands.innerHTML = '';
    se.stacks.innerHTML = '';
    se.stacks.removeAttribute('data-amt');
  });
  $('dealer-cards').innerHTML = '';
  $('dealer-total').textContent = '';
  $('dealer-total').className = 'total';
}

function render(prev) {
  const newRound = !prev || S.round !== prev.round;
  if (newRound && prev) clearTable();

  $('round-pill').textContent = `Ronda ${Math.max(1, S.round)}`;
  $('shoe-pill').textContent = `Zapato: ${S.shoeLeft}`;
  const rule = S.hit17 ? 'DEALER MUST HIT SOFT 17' : 'DEALER STANDS ON ALL 17s';
  $('rule-text').textContent = rule; $('rule-text2').textContent = rule;

  S.seats.forEach((sd, i) => updateSeat(sd, seatEls[i], i));
  updateDealer();

  if (S.phase === 'payout' && (!prev || prev.phase !== 'payout')) onPayout();
  if (S.phase === 'playing' && S.turn && S.turn.seat === me && (!prev || !prev.turn || prev.turn.seat !== me || prev.turn.hand !== S.turn.hand)) sfx.turn();

  timerEnd = S.timeLeft > 0 ? Date.now() + S.timeLeft : 0;
  const cm = $('center-msg');
  cm.textContent = S.msg || '';
  cm.classList.toggle('show', !!S.msg);

  updateHUD();
  requestAnimationFrame(launchFlights);
  lastPhaseRendered = S.phase;
}

function updateSeat(sd, se, i) {
  const root = se.root;
  root.classList.toggle('me', i === me);
  root.classList.toggle('bot', sd.isBot);
  root.classList.toggle('sit', sd.sitOut && !sd.hands.length);
  root.classList.toggle('active', S.phase === 'playing' && !!S.turn && S.turn.seat === i);
  root.classList.toggle('ready', S.phase === 'betting' && sd.ready);

  se.nm.textContent = sd.name + (i === me ? ' (tú)' : '');
  se.bal.textContent = sd.chips;
  se.av.textContent = (sd.name.trim()[0] || '?').toUpperCase();
  se.av.style.setProperty('--h', sd.hue);

  // fichas apostadas
  const bets = sd.hands.length ? sd.hands.map((h) => h.bet) : [sd.bet];
  while (se.stacks.children.length < bets.length) { const d = document.createElement('div'); d.className = 'bet-stack'; se.stacks.appendChild(d); }
  while (se.stacks.children.length > bets.length) se.stacks.lastElementChild.remove();
  bets.forEach((b, k) => setStack(se.stacks.children[k], b));
  const total = bets.reduce((a, b) => a + b, 0);
  se.amt.textContent = total ? total : '';
  se.ins.textContent = sd.insurance ? `Seguro ${sd.insurance}` : '';
  se.ins.classList.toggle('hidden', !sd.insurance);

  // manos
  while (se.hands.children.length < sd.hands.length) {
    const h = document.createElement('div');
    h.className = 'hand';
    h.innerHTML = '<div class="cards"></div><div class="total"></div><div class="res"></div>';
    se.hands.appendChild(h);
  }
  while (se.hands.children.length > sd.hands.length) se.hands.lastElementChild.remove();
  sd.hands.forEach((hd, k) => {
    const he = se.hands.children[k];
    reconcileCards(he.querySelector('.cards'), hd.cards);
    const tot = he.querySelector('.total');
    tot.textContent = hd.bj ? 'Blackjack' : fmtTotal(hd.cards);
    tot.className = 'total' + (hd.bust ? ' bust' : '') + (hd.bj ? ' bj' : '');
    he.classList.toggle('active', S.phase === 'playing' && !!S.turn && S.turn.seat === i && S.turn.hand === k && !hd.done);
    const res = he.querySelector('.res');
    if (hd.result) {
      res.textContent = RES_TEXT[hd.result](hd.delta);
      res.className = `res show ${hd.result}`;
    } else { res.textContent = ''; res.className = 'res'; }
  });
}

function updateDealer() {
  reconcileCards($('dealer-cards'), S.dealer.cards);
  const tot = $('dealer-total');
  const cards = S.dealer.cards;
  if (!cards.length) { tot.textContent = ''; tot.className = 'total'; return; }
  const { total } = handValue(cards);
  if (S.dealer.revealed) {
    const bj = isBJ(cards);
    tot.textContent = bj ? 'Blackjack' : total > 21 ? `${total} · se pasa` : fmtTotal(cards);
    tot.className = 'total' + (total > 21 ? ' bust' : '') + (bj ? ' bj' : '');
  } else {
    tot.textContent = fmtTotal(cards.filter((c) => !c.back));
    tot.className = 'total';
  }
}

/* ---------- Pagos: las fichas se recogen / se pagan ---------- */
function onPayout() {
  let mine = null;
  S.seats.forEach((sd, i) => {
    const se = seatEls[i];
    sd.hands.forEach((hd, k) => {
      const st = se.stacks.children[k];
      if (!st) return;
      const he = se.hands.children[k];
      if (hd.delta > 0) {                                           // gana: la casa paga el mismo importe (o 3:2)
        const extra = st.cloneNode(true);
        extra.classList.add('payout');
        setStack(extra, hd.delta); extra.dataset.amt = hd.delta;
        st.parentNode.appendChild(extra);
        setTimeout(() => { st.classList.add('to-plate'); extra.classList.add('to-plate'); }, 1900);
      } else if (hd.delta < 0) setTimeout(() => st.classList.add('to-dealer'), 1900);
      else setTimeout(() => st.classList.add('to-plate'), 1900);
      if (he && hd.delta !== 0) {
        const fl = document.createElement('div');
        fl.className = `float ${hd.delta > 0 ? 'up' : 'down'}`;
        fl.textContent = `${hd.delta > 0 ? '+' : '−'}${Math.abs(hd.delta)}`;
        he.appendChild(fl);
        setTimeout(() => fl.remove(), 2400);
      }
    });
    if (i === me && sd.hands.length) mine = sd;
  });
  if (mine) {
    const bj = mine.hands.some((h) => h.result === 'blackjack');
    if (bj) { sfx.bj(); if (typeof launchConfetti === 'function') launchConfetti(); }
    else if (mine.delta > 0) sfx.win();
    else if (mine.delta < 0) sfx.lose();
    else sfx.push();
  }
}

/* ---------- Panel del jugador (HUD) ---------- */
function show(id, on) { $(id).classList.toggle('hidden', !on); }

function updateHUD() {
  const sd = S.seats[me];
  if (!sd) return;
  const inRound = sd.ready && sd.hands.length > 0;
  const totalBet = sd.hands.length ? sd.hands.reduce((a, h) => a + h.bet, 0) : sd.bet;
  $('me-chips').textContent = sd.chips;
  $('me-bet').textContent = totalBet;

  const betting = S.phase === 'betting' && !sd.ready && !sd.sitOut;
  const broke = S.phase === 'betting' && !sd.ready && sd.chips + sd.bet < MIN_BET;
  show('bet-controls', S.phase === 'betting' || S.phase === 'shuffle' || (!inRound && S.phase !== 'insurance' && S.phase !== 'playing'));
  document.querySelectorAll('.chip-btn').forEach((b) => {
    const v = parseInt(b.dataset.v, 10);
    b.disabled = !betting || sd.bet + v > MAX_BET || v > sd.chips;
  });
  $('btn-clear').disabled = !betting || sd.bet === 0;
  $('btn-rebet').disabled = !betting || !sd.lastBet || sd.bet === sd.lastBet || sd.lastBet > sd.chips + sd.bet;
  $('btn-deal').disabled = !betting || sd.bet < MIN_BET;
  $('btn-deal').textContent = S.phase === 'betting' && sd.ready ? 'Apuesta lista' : 'Repartir';
  show('btn-rebuy', broke);
  show('btn-deal', !broke);

  // seguro
  const askIns = S.phase === 'insurance' && inRound && !sd.insAnswered;
  show('ins-box', askIns);
  if (askIns) { $('ins-text').textContent = `¿Seguro por ${sd.bet / 2}? Paga 2 a 1 si el crupier tiene Blackjack`; $('btn-ins-yes').disabled = sd.chips < sd.bet / 2; }

  // jugar mano
  const myTurn = S.phase === 'playing' && S.turn && S.turn.seat === me;
  show('play-actions', !!myTurn);
  if (myTurn) {
    const hand = sd.hands[S.turn.hand];
    const a = legalActs(sd, hand);
    const w = !!S.turn.wait;                                   // los botones solo se activan cuando el motor espera mi jugada
    $('btn-hit').disabled = !w || !a.hit; $('btn-stand').disabled = !w || !a.stand;
    $('btn-double').disabled = !w || !a.double; $('btn-split').disabled = !w || !a.split;
  }

  // mensaje
  let m = '';
  if (S.phase === 'betting') m = broke ? 'Te quedaste sin fichas: recarga para seguir' : sd.sitOut ? 'Esta ronda solo miras' : sd.ready ? 'Apuesta lista. Esperando a los demás…' : 'Elige tus fichas y pulsa Repartir';
  else if (S.phase === 'insurance') m = askIns ? '' : inRound ? 'Esperando decisiones de seguro…' : 'Seguro en curso';
  else if (S.phase === 'playing') {
    if (myTurn) m = 'Es tu turno';
    else if (S.turn) m = `Turno de ${S.seats[S.turn.seat].name}`;
  } else if (S.phase === 'payout') {
    if (inRound) m = sd.delta > 0 ? `Ganaste ${sd.delta} fichas` : sd.delta < 0 ? `Perdiste ${-sd.delta} fichas` : 'Empate: recuperas tu apuesta';
    else m = 'Fin de la ronda';
  } else if (S.phase === 'dealer') m = 'Juega el crupier';
  else if (S.phase === 'dealing') m = 'Repartiendo…';
  $('hud-msg').textContent = m;
}

function startTick() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    if (!S) return;
    const left = timerEnd ? Math.max(0, timerEnd - Date.now()) : 0;
    const el = $('hud-timer');
    const total = S.timeTotal || 0;
    const mineActive = (S.phase === 'playing' && S.turn && S.turn.seat === me) || S.phase === 'betting' || S.phase === 'insurance';
    el.textContent = left > 0 && mineActive ? `${Math.ceil(left / 1000)} s` : '';
    seatEls.forEach((se, i) => {
      const active = S.phase === 'playing' && S.turn && S.turn.seat === i;
      se.ring.style.setProperty('--p', active && total && left ? `${(left / total) * 360}deg` : '0deg');
    });
  }, 100);
}

/* ---------- Acciones del jugador local ---------- */
function sendAct(a) {
  if (net.role === 'guest') { if (net.conn && net.conn.open) net.conn.send({ t: 'act', a }); }
  else engineAct(me, a);
}

$('btn-clear').addEventListener('click', () => sendAct({ type: 'clear' }));
$('btn-rebet').addEventListener('click', () => { sendAct({ type: 'rebet' }); sfx.chip(); });
$('btn-deal').addEventListener('click', () => sendAct({ type: 'ready' }));
$('btn-rebuy').addEventListener('click', () => sendAct({ type: 'rebuy' }));
$('btn-ins-yes').addEventListener('click', () => sendAct({ type: 'insurance', take: true }));
$('btn-ins-no').addEventListener('click', () => sendAct({ type: 'insurance', take: false }));
['hit', 'stand', 'double', 'split'].forEach((t) => $(`btn-${t}`).addEventListener('click', () => {
  document.querySelectorAll('.act').forEach((b) => { b.disabled = true; });      // evita doble clic mientras llega la respuesta
  sendAct({ type: t });
}));

/* ---------- Avisos ---------- */
function showToast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('toast-layer').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* Portavasos del borde de cuero (decoración, como en la foto) */
function buildCups() {
  const t = $('table');
  t.querySelectorAll('.cup').forEach((c) => c.remove());
  [10, 36, 62, 118, 144, 170].forEach((deg) => {
    const th = (deg * Math.PI) / 180;
    const c = document.createElement('i');
    c.className = 'cup';
    c.style.left = `${50 + 52.6 * Math.cos(th)}%`;
    c.style.top = `${((58 + 2.6) * Math.sin(th) / 58) * 100}%`;
    t.appendChild(c);
  });
}

/* ---------- Preparar la mesa en pantalla ---------- */
function startTable(meta, you) {
  S = null; me = you; seatMeta = meta;
  cardEls.clear(); pendingFlights = [];
  $('setup-screen').classList.add('hidden');
  $('game-app').classList.remove('hidden');
  $('dealer-cards').innerHTML = ''; $('dealer-total').textContent = '';
  $('center-msg').textContent = ''; $('center-msg').classList.remove('show');
  $('toast-layer').innerHTML = '';
  buildSeats(meta.length);
  buildCups();
  buildRack();
  $('me-name').textContent = meta[you].name;
  $('limits-pill').textContent = `Mín ${MIN_BET} · Máx ${MAX_BET}`;
  fitTable();
  startTick();
  requestAnimationFrame(fitTable);
}

/* =====================================================================
   RED (PeerJS): el anfitrión crea una mesa con código de 5 letras y los
   demás se conectan a ese código desde cualquier red (necesita TURN para
   algunas redes: ver js/ice-config.js).
   ===================================================================== */
const PEER_PREFIX = 'bj-online-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const net = { role: 'solo', peer: null, conn: null, members: [], botsN: 0, started: false, code: '' };

const randomCode = () => Array.from({ length: 5 }, () => ID_CHARS[randInt(ID_CHARS.length)]).join('');
const cleanName = (t) => String(t || '').replace(/[<>]/g, '').trim().slice(0, 12) || 'Jugador';
const myName = () => cleanName($('bj-name').value);

function setNetStatus(msg, ok = false) {
  const el = $('net-status');
  el.textContent = msg || '';
  el.classList.toggle('ok', !!ok);
}

function setTab(tab) {
  $('tab-solo').classList.toggle('active', tab === 'solo');
  $('tab-online').classList.toggle('active', tab === 'online');
  $('pane-solo').classList.toggle('hidden', tab !== 'solo');
  $('pane-online').classList.toggle('hidden', tab !== 'online');
}
$('tab-solo').addEventListener('click', () => { if (net.role === 'solo') setTab('solo'); });
$('tab-online').addEventListener('click', () => setTab('online'));

function showSetup() {
  $('game-app').classList.add('hidden');
  $('setup-screen').classList.remove('hidden');
}

/* ---------- Asientos: los humanos se sientan cerca del centro, los bots en los extremos ---------- */
function buildMetas(humans, botsN) {
  const n = humans.length + botsN;
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
  const seats = new Array(n);
  humans.forEach((h, k) => { seats[order[k]] = { name: h.name, isBot: false, local: !!h.local, conn: h.conn || null }; });
  const used = new Set(humans.map((h) => h.name));
  for (let b = 0; b < botsN; b++) {
    let name = BOT_NAMES[b % BOT_NAMES.length];
    while (used.has(name)) name += '·';
    used.add(name);
    seats[order[humans.length + b]] = { name, isBot: true };
  }
  return seats;
}

function beginTable(humans, botsN, hit17) {
  const metas = buildMetas(humans, botsN);
  const pub = metas.map((m) => ({ name: m.name, isBot: m.isBot }));
  const myIdx = metas.findIndex((m) => m.local);
  metas.forEach((m, i) => { if (m.conn && m.conn.open) m.conn.send({ t: 'start', you: i, meta: pub, cfg: { hit17 } }); });
  net.started = true;
  startTable(pub, myIdx);
  startEngine(metas, { hit17 });
}

/* ---------- Solo ---------- */
$('solo-start').addEventListener('click', () => {
  let bots = parseInt($('solo-bots').value, 10);
  if (isNaN(bots)) bots = 2;
  bots = Math.min(MAX_SEATS - 1, Math.max(0, bots));
  $('solo-bots').value = bots;
  net.role = 'solo';
  beginTable([{ name: myName(), local: true }], bots, $('rule-solo').value === 'hit');
});

/* ---------- Anfitrión ---------- */
async function openRoom() {
  if (typeof Peer === 'undefined') { setNetStatus('No se pudo cargar la conexión online. Revisa tu internet y recarga la página.'); return; }
  setNetStatus('Creando mesa…', true);
  net.role = 'host';
  net.members = [{ name: myName(), local: true }];
  net.botsN = 0; net.started = false;
  net.code = randomCode();
  const cfg = await getIceConfig();
  net.peer = new Peer(PEER_PREFIX + net.code, { config: cfg });

  net.peer.on('open', () => {
    $('online-choose').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('room-code').textContent = net.code;
    $('host-opts').classList.remove('hidden');
    $('guest-wait').classList.add('hidden');
    $('leave-lobby').textContent = 'Cerrar mesa';
    setNetStatus(iceHasTurn() ? '' : TURN_WARNING);
    refreshLobby();
  });
  net.peer.on('connection', onGuestConnection);
  net.peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { net.peer.destroy(); net.peer = null; openRoom(); }
    else setNetStatus('Error de conexión: ' + err.type);
  });
}

function onGuestConnection(c) {
  watchConnection(c, () => setNetStatus(connectionHelp()));
  c.on('data', (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      if (net.members.some((m) => m.conn === c)) return;
      if (net.started) { c.send({ t: 'reject', reason: 'La mesa ya está en juego. Espera a que el anfitrión abra otra.' }); setTimeout(() => c.close(), 400); return; }
      if (net.members.length >= MAX_SEATS) { c.send({ t: 'reject', reason: `La mesa está llena (${MAX_SEATS} jugadores).` }); setTimeout(() => c.close(), 400); return; }
      net.members.push({ name: cleanName(d.name), conn: c });
      net.botsN = Math.min(net.botsN, MAX_SEATS - net.members.length);
      c.send({ t: 'welcome' });
      refreshLobby();
      return;
    }
    if (d.t === 'act' && net.started) {
      const idx = G.seats.findIndex((s) => s.conn === c);
      if (idx >= 0) engineAct(idx, d.a);
    }
  });
  const gone = () => memberLeft(c);
  c.on('close', gone);
  c.on('error', gone);
}

function memberLeft(c) {
  if (net.started) {
    const idx = G.seats.findIndex((s) => s.conn === c);
    if (idx >= 0) engineSeatLeft(idx);
    return;
  }
  const g = net.members.findIndex((m) => m.conn === c);
  if (g >= 0) { net.members.splice(g, 1); refreshLobby(); }
}

function refreshLobby() {
  const list = net.members.map((m) => m.name);
  renderLobby(list, net.botsN);
  net.members.forEach((m) => { if (m.conn && m.conn.open) m.conn.send({ t: 'lobby', list, bots: net.botsN }); });
  const total = net.members.length + net.botsN;
  $('bot-n').textContent = net.botsN;
  $('bots-minus').disabled = net.botsN <= 0;
  $('bots-plus').disabled = total >= MAX_SEATS;
  $('host-start').textContent = `Abrir la mesa (${total} ${total === 1 ? 'asiento' : 'asientos'})`;
}

function renderLobby(list, bots) {
  const ul = $('lobby-list');
  ul.innerHTML = '';
  list.forEach((name, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="emo"></span><span class="nm"></span>';
    li.querySelector('.emo').textContent = (name[0] || '?').toUpperCase();
    li.querySelector('.emo').style.setProperty('--h', SEAT_HUES[i % SEAT_HUES.length]);
    li.querySelector('.nm').textContent = name;
    if (i === 0) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'anfitrión'; li.appendChild(t); }
    ul.appendChild(li);
  });
  if (bots > 0) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="emo bot">B</span><span class="nm">${bots} bot${bots > 1 ? 's' : ''}</span>`;
    ul.appendChild(li);
  }
  const info = document.createElement('div');
  info.className = 'lobby-total';
  info.textContent = `${list.length + bots} de ${MAX_SEATS} asientos`;
  ul.appendChild(info);
}

$('host-btn').addEventListener('click', openRoom);
$('bots-minus').addEventListener('click', () => { if (net.botsN > 0) { net.botsN--; refreshLobby(); } });
$('bots-plus').addEventListener('click', () => { if (net.members.length + net.botsN < MAX_SEATS) { net.botsN++; refreshLobby(); } });
$('host-start').addEventListener('click', () => beginTable(net.members, net.botsN, $('rule-online').value === 'hit'));

function copyText(text, okMsg) {
  const done = () => setNetStatus(okMsg, true);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => setNetStatus('No se pudo copiar'));
  else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { setNetStatus('No se pudo copiar'); }
    ta.remove();
  }
}
$('copy-code').addEventListener('click', () => copyText(net.code, 'Código copiado'));
$('copy-link').addEventListener('click', () => {
  const url = new URL(location.href);
  url.search = ''; url.hash = '';
  url.searchParams.set('join', net.code);
  copyText(url.toString(), 'Enlace copiado: envíalo a tus amigos');
});

/* ---------- Invitado ---------- */
async function joinRoom() {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length !== 5) { setNetStatus('El código debe tener 5 caracteres.'); return; }
  if (typeof Peer === 'undefined') { setNetStatus('No se pudo cargar la conexión online. Revisa tu internet y recarga la página.'); return; }
  setNetStatus('Conectando…', true);
  net.role = 'guest';
  const cfg = await getIceConfig();
  net.peer = new Peer(undefined, { config: cfg });

  net.peer.on('open', () => {
    const c = net.peer.connect(PEER_PREFIX + code, { reliable: true });
    net.conn = c;
    watchConnection(c, () => { setNetStatus(connectionHelp()); resetNet(); });
    c.on('open', () => c.send({ t: 'hello', name: myName() }));
    c.on('data', onHostMessage);
    c.on('close', onHostGone);
    c.on('error', onHostGone);
  });
  net.peer.on('error', (err) => {
    setNetStatus(err.type === 'peer-unavailable' ? 'No se encontró esa mesa. Revisa el código.' : 'Error de conexión: ' + err.type);
    if (!net.conn || !net.conn.open) resetNet();
  });
}
$('join-btn').addEventListener('click', joinRoom);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

function onHostMessage(d) {
  if (!d || typeof d !== 'object') return;
  switch (d.t) {
    case 'welcome':
      $('online-choose').classList.add('hidden');
      $('lobby').classList.remove('hidden');
      $('room-code').textContent = $('join-code').value.trim().toUpperCase();
      $('host-opts').classList.add('hidden');
      $('guest-wait').classList.remove('hidden');
      $('leave-lobby').textContent = 'Salir de la mesa';
      setNetStatus('');
      break;
    case 'lobby': renderLobby(d.list, d.bots); break;
    case 'start': S = null; startTable(d.meta, d.you); break;
    case 'state': onState(d.s); break;
    case 'toast': showToast(d.text, d.kind); break;
    case 'reject': setNetStatus(d.reason || 'No se pudo entrar a la mesa.'); resetNet(); break;
  }
}

function onHostGone() {
  if (net.role !== 'guest') return;
  const inGame = !$('game-app').classList.contains('hidden');
  resetNet();
  showSetup();
  setTab('online');
  setNetStatus(inGame ? 'El anfitrión cerró la mesa o perdió la conexión.' : 'Se perdió la conexión con la mesa.');
}

/* ---------- Salir ---------- */
function resetNet() {
  try { if (net.conn) net.conn.close(); } catch (e) { /* nada */ }
  try { if (net.peer) net.peer.destroy(); } catch (e) { /* nada */ }
  net.conn = null; net.peer = null; net.members = []; net.botsN = 0; net.started = false; net.role = 'solo'; net.code = '';
  $('lobby').classList.add('hidden');
  $('online-choose').classList.remove('hidden');
}

function leaveAll() {
  engineStop();
  resetNet();
  S = null;
  showSetup();
  setTab('solo');
  setNetStatus('');
}

$('leave-lobby').addEventListener('click', () => { resetNet(); setNetStatus(''); });
$('leave-btn').addEventListener('click', () => {
  const msg = net.role === 'host' ? '¿Cerrar la mesa? La partida terminará para todos.' : '¿Salir de la mesa?';
  if (confirm(msg)) leaveAll();
});
window.addEventListener('beforeunload', () => { try { if (net.peer) net.peer.destroy(); } catch (e) { /* nada */ } });

/* ---------- Conexión con el index (iframe) y parámetros de la URL ---------- */
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'BJ_CONFIG') {
    if (d.name) $('bj-name').value = cleanName(d.name);
    if (net.role === 'solo' && !net.started) setTab(d.mode === 'online' ? 'online' : 'solo');
  }
  if (d.type === 'BJ_START' && !net.started) {
    if (!$('pane-solo').classList.contains('hidden')) $('solo-start').click();
    else if (net.role === 'solo') $('host-btn').click();
  }
});
if (window.parent && window.parent !== window) {
  try { window.parent.postMessage({ type: 'BJ_READY' }, '*'); } catch (e) { /* nada */ }
}

(function initFromUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('name')) $('bj-name').value = cleanName(q.get('name'));
  if (q.get('join')) $('join-code').value = q.get('join').toUpperCase().slice(0, 5);
  setTab(q.get('mode') === 'online' || q.get('join') ? 'online' : 'solo');
})();
