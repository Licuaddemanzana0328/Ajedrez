let peer = null;
let conn = null;
let isHost = false;

// Código corto: 5 caracteres
const ID_PREFIX = 'ajedrez-online-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Servidores STUN y TURN de Google/OpenRelay para atravesar cortafuegos y routers
const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

function randomCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
}

// DEFINICIÓN DE CONFIGURACIÓN DE CONEXIÓN
function setupConnection() {
    if (!conn) return;

    conn.on('open', () => {
        updateStatus(isHost ? 'Rival conectado. Juegas con las blancas.' : 'Conectado. Juegas con las negras.');
        conn.send({ type: 'handshake', name: state.playerName });
    });

    conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'handshake') {
            state.onlineRivalName = String(data.name || 'Rival Online').slice(0, 20);
            if (typeof refreshLabels === 'function') refreshLabels();
            if (typeof updateCapturedUI === 'function') updateCapturedUI();
            if (typeof updateHistoryUI === 'function') updateHistoryUI();
            if (isHost && typeof startGame === 'function') startGame();
        } else if (data.type === 'restart') {
            if (typeof startGame === 'function') startGame({ timer: parseInt(data.timer) || 0, remote: true });
        } else if (data.type === 'move') {
            receiveRemoteMove(data);
        }
    });

    conn.on('close', () => {
        updateStatus(`${state.onlineRivalName || 'El rival'} se desconectó`);
    });
}

function createPeer() {
    const code = randomCode();
    peer = new Peer(ID_PREFIX + code, { config: ICE_CONFIG });

    peer.on('open', () => {
        const inputEl = document.getElementById('my-peer-id');
        if (inputEl) inputEl.value = code;
    });

    peer.on('connection', (c) => {
        if (conn && conn.open) { c.close(); return; }
        conn = c;
        isHost = true;
        state.myColor = 'white';
        setupConnection();
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            peer.destroy();
            createPeer();
        } else if (err.type === 'peer-unavailable') {
            updateStatus('No se encontró ese código. Revísalo e inténtalo de nuevo.');
        } else {
            updateStatus('Error de conexión: ' + err.type);
        }
    });
}

function initNetwork() {
    if (typeof Peer === 'undefined') {
        updateStatus('No se pudo cargar la librería de red. Revisa tu conexión.');
        return;
    }

    createPeer();

    const btnConnect = document.getElementById('connect-btn');
    if (btnConnect) {
        btnConnect.replaceWith(btnConnect.cloneNode(true)); // Limpia eventos viejos acumulados
        document.getElementById('connect-btn').addEventListener('click', () => {
            const codeInput = document.getElementById('remote-peer-id');
            const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
            if (code.length !== 5) { updateStatus('El código debe tener 5 caracteres.'); return; }
            if (!peer || peer.destroyed) return;

            conn = peer.connect(ID_PREFIX + code, { reliable: true });
            isHost = false;
            state.myColor = 'black';
            setupConnection();
        });
    }
}

function receiveRemoteMove(d) {
    if (state.mode !== 'online' || state.over || state.turn === state.myColor) return;
    const ok = [d.from && d.from.r, d.from && d.from.c, d.to && d.to.r, d.to && d.to.c].every(v => Number.isInteger(v) && v >= 0 && v < 8);
    if (!ok) return;
    const piece = state.boardState[d.from.r][d.from.c];
    if (!piece || (piece === piece.toUpperCase()) !== (state.turn === 'white')) return;
    if (typeof getBasicChessMoves === 'function' && !getBasicChessMoves(d.from.r, d.from.c, state.boardState).some(m => m.r === d.to.r && m.c === d.to.c)) return;

    if (typeof applyChessMove === 'function') {
        applyChessMove(d.from, d.to, 'Q');
    } else if (typeof executeChessMove === 'function') {
        executeChessMove(d.from, d.to, 'Q');
    }
}

function sendNetMove(payload) {
    if (conn && conn.open) conn.send({ type: 'move', from: payload.from, to: payload.to });
}

function sendNetRestart() {
    if (conn && conn.open) conn.send({ type: 'restart', timer: state.timerSeconds });
}
