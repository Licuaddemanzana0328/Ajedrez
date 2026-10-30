/**
 * network.js — Módulo de red PeerJS generalizado
 * Soporta Ajedrez y UNO online. Detecta el juego activo (state.game)
 * y enruta los mensajes entrantes al handler correcto.
 */

let peer = null;
let conn = null;
let isHost = false;

// Código corto: 5 caracteres (letras y números, sin 0/O/1/I para no confundirse)
const ID_PREFIX = 'juegos-online-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// La config WebRTC (STUN + TURN) vive en js/ice-config.js → getIceConfig()
let peerCreating = false;

function randomCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
}

async function createPeer() {
    if (peerCreating) return;
    peerCreating = true;
    const code = randomCode();
    let cfg;
    try { cfg = await getIceConfig(); } finally { /* si falla, getIceConfig ya devuelve al menos STUN */ }
    peer = new Peer(ID_PREFIX + code, { config: cfg });
    peerCreating = false;

    peer.on('open', () => {
        document.getElementById('my-peer-id').value = code;
        showTurnWarning();
    });

    peer.on('connection', (c) => {
        if (conn && conn.open) { c.close(); return; }
        conn = c;
        isHost = true;
        // Ajedrez: el host juega con blancas
        if (typeof state !== 'undefined') state.myColor = 'white';
        setupConnection();
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {      // el código ya existía: genera otro
            peer.destroy();
            createPeer();
        } else if (err.type === 'peer-unavailable') {
            updateStatus('No se encontró ese código. Revísalo e inténtalo de nuevo.');
        } else {
            updateStatus('Error de conexión: ' + err.type);
        }
    });
}

/** Aviso fijo bajo el panel de red cuando no hay servidor TURN configurado */
function showTurnWarning() {
    if (iceHasTurn() || document.getElementById('turn-warning')) return;
    const panel = document.getElementById('network-panel');
    if (!panel) return;
    const w = document.createElement('div');
    w.id = 'turn-warning';
    w.textContent = TURN_WARNING;
    w.style.cssText = 'font-size:.78rem;line-height:1.3;color:#f5c542;background:rgba(245,197,66,.1);border:1px solid rgba(245,197,66,.4);border-radius:8px;padding:6px 8px;margin-top:6px;';
    panel.appendChild(w);
}

function initNetwork() {
    if (typeof Peer === 'undefined') {
        updateStatus('No se pudo cargar la conexión online. Revisa tu internet y recarga la página.');
        return;
    }
    createPeer();

    document.getElementById('connect-btn').addEventListener('click', () => {
        const code = document.getElementById('remote-peer-id').value.trim().toUpperCase();
        if (code.length !== 5) { updateStatus('El código debe tener 5 caracteres.'); return; }
        if (!peer || peer.destroyed) return;
        conn = peer.connect(ID_PREFIX + code, { reliable: true });
        isHost = false;
        // Ajedrez: el invitado juega con negras
        if (typeof state !== 'undefined') state.myColor = 'black';
        updateStatus('Conectando con tu rival…');
        watchConnection(conn, () => updateStatus(connectionHelp()));
        setupConnection();
    });
}

function setupConnection() {
    conn.on('open', () => {
        const game = (typeof state !== 'undefined') ? state.game : 'chess';
        if (game === 'chess') {
            updateStatus(isHost ? 'Rival conectado. Juegas con las blancas.' : 'Conectado. Juegas con las negras.');
        } else {
            updateStatus(isHost ? 'Rival conectado. ¡Tú comienzas!' : 'Conectado. ¡Esperando inicio!');
        }
        conn.send({ type: 'handshake', name: state ? state.playerName : 'Jugador', game: game });
    });

    conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        const game = (typeof state !== 'undefined') ? state.game : 'chess';

        if (data.type === 'handshake') {
            if (typeof state !== 'undefined') {
                state.onlineRivalName = String(data.name || 'Rival Online').slice(0, 20);
            }
            if (game === 'chess') {
                refreshLabels();
                updateCapturedUI();
                updateHistoryUI();
                if (isHost) startGame();
            } else if (game === 'uno') {
                // Para UNO la señal de arranque se envía desde el handshake
                if (isHost && typeof unoNetworkStartGame === 'function') {
                    unoNetworkStartGame();
                }
            }
        } else if (data.type === 'restart') {
            if (game === 'chess') {
                startGame({ timer: parseInt(data.timer) || 0, remote: true });
            } else if (game === 'uno' && typeof unoNetworkRestart === 'function') {
                unoNetworkRestart(data);
            }
        } else if (data.type === 'move') {
            if (game === 'chess') {
                receiveRemoteMove(data);
            }
        } else if (data.type === 'uno_action') {
            // Mensaje específico de UNO
            if (typeof unoReceiveNetAction === 'function') {
                unoReceiveNetAction(data);
            }
        }
    });

    conn.on('close', () => {
        const rivalName = (typeof state !== 'undefined' && state.onlineRivalName) ? state.onlineRivalName : 'El rival';
        updateStatus(`${rivalName} se desconectó`);
    });
}

/* ====== AJEDREZ ====== */
function receiveRemoteMove(d) {
    if (typeof state === 'undefined') return;
    if (state.mode !== 'online' || state.over || state.turn === state.myColor) return;
    const ok = [d.from && d.from.r, d.from && d.from.c, d.to && d.to.r, d.to && d.to.c].every(v => Number.isInteger(v) && v >= 0 && v < 8);
    if (!ok) return;
    const piece = state.boardState[d.from.r][d.from.c];
    if (!piece || (piece === piece.toUpperCase()) !== (state.turn === 'white')) return;
    if (!getBasicChessMoves(d.from.r, d.from.c, state.boardState).some(m => m.r === d.to.r && m.c === d.to.c)) return;
    applyChessMove(d.from, d.to, 'Q');
}

function sendNetMove(payload) {
    if (conn && conn.open) conn.send({ type: 'move', from: payload.from, to: payload.to });
}

function sendNetRestart() {
    if (conn && conn.open) {
        const timer = (typeof state !== 'undefined') ? state.timerSeconds : 0;
        conn.send({ type: 'restart', timer });
    }
}

/* ====== UNO ONLINE — helpers invocados desde uno.js ====== */
/**
 * Envía una acción de UNO al rival.
 * @param {object} action - e.g. { action:'play', cardIdx, card, color } o { action:'draw' } o { action:'pass' }
 */
function sendUnoAction(action) {
    if (conn && conn.open) {
        conn.send({ type: 'uno_action', ...action });
    }
}

/**
 * Llamada desde uno.js cuando el host quiere arrancar la partida online.
 */
function sendUnoStart(config) {
    if (conn && conn.open) {
        conn.send({ type: 'restart', unoConfig: config });
    }
}