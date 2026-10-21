let peer = null;
let conn = null;

// Genera un código aleatorio fácil de compartir (ej: 6VKJ4)
function generateShortCode(length = 5) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Se excluyen caracteres confusos como O, 0, I, 1
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function initNetwork() {
    const customId = generateShortCode(5);

    // Configuración con ID corto de 5 caracteres + Servidores STUN para internet
    peer = new Peer(customId, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        document.getElementById('my-peer-id').value = id;
    });

    peer.on('connection', (c) => {
        conn = c;
        setupConnection();
    });

    peer.on('error', (err) => {
        console.error("Error en PeerJS:", err.type);
        if (err.type === 'unavailable-id') {
            // Si por casualidad el código de 5 dígitos ya está ocupado, genera otro automáticamente
            initNetwork();
        } else {
            updateStatus("⚠️ Error de conexión. Revisa que el código sea correcto.");
        }
    });

    document.getElementById('connect-btn').addEventListener('click', () => {
        const remoteId = document.getElementById('remote-peer-id').value.trim().toUpperCase();
        if (remoteId) {
            updateStatus(`Conectando con la sala ${remoteId}...`);
            conn = peer.connect(remoteId);
            setupConnection();
        }
    });
}

function setupConnection() {
    conn.on('open', () => {
        updateStatus("¡Conectado con el rival online!");
        conn.send({ type: 'handshake', name: state.playerName });
    });

    conn.on('data', (data) => {
        if (data.type === 'handshake') {
            state.onlineRivalName = data.name;
            document.getElementById('p2-label').textContent = data.name;
        } else if (data.type === 'move') {
            if (state.game === 'chess') {
                executeChessMove(data.from, data.to, data.promo);
                switchTurn('white');
                renderChessBoard();
            } else if (state.game === 'checkers') {
                data.to.piece = data.from.piece;
                data.from.piece = null;
                switchTurn('white');
                renderCheckersBoard();
            }
            addHistoryMove(playerLabel(state.turn), 'Movimiento Remoto');
        }
    });
}

function sendNetMove(payload) {
    if (conn && conn.open) {
        conn.send({ type: 'move', ...payload });
    }
}
