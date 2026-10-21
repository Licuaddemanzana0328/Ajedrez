let peer = null;
let conn = null;
let isHost = false;

function initNetwork() {
    if (typeof Peer === 'undefined') {
        updateStatus('No se pudo cargar la conexión online. Revisa tu internet y recarga la página.');
        return;
    }
    peer = new Peer();

    peer.on('open', (id) => {
        document.getElementById('my-peer-id').value = id;
    });

    peer.on('connection', (c) => {
        if (conn && conn.open) { c.close(); return; }
        conn = c;
        isHost = true;
        state.myColor = 'white';
        setupConnection();
    });

    peer.on('error', (err) => updateStatus('Error de conexión: ' + err.type));

    document.getElementById('connect-btn').addEventListener('click', () => {
        const remoteId = document.getElementById('remote-peer-id').value.trim();
        if (!remoteId) return;
        conn = peer.connect(remoteId, { reliable: true });
        isHost = false;
        state.myColor = 'black';
        setupConnection();
    });
}

function setupConnection() {
    conn.on('open', () => {
        updateStatus(isHost ? 'Rival conectado. Juegas con las blancas.' : 'Conectado. Juegas con las negras.');
        conn.send({ type: 'handshake', name: state.playerName });
    });

    conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'handshake') {
            state.onlineRivalName = String(data.name || 'Rival Online').slice(0, 20);
            refreshLabels();
            updateCapturedUI();
            updateHistoryUI();
            if (isHost) startGame();
        } else if (data.type === 'restart') {
            startGame({ timer: parseInt(data.timer) || 0, remote: true });
        } else if (data.type === 'move') {
            receiveRemoteMove(data);
        }
    });

    conn.on('close', () => {
        updateStatus(`${state.onlineRivalName || 'El rival'} se desconectó`);
    });
}

function receiveRemoteMove(d) {
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
    if (conn && conn.open) conn.send({ type: 'restart', timer: state.timerSeconds });
}
 
