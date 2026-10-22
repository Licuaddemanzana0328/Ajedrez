let peer = null;
let conn = null;
let isHost = false;

// Código corto: 5 caracteres (letras y números)
const ID_PREFIX = 'ajedrez-online-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

// Servidores STUN de Google (+ TURN público de respaldo para redes estrictas)
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

function createPeer() {
    const code = randomCode();
    peer = new Peer(ID_PREFIX + code, { config: ICE_CONFIG });

    peer.on('open', () => {
        document.getElementById('my-peer-id').value = code;
    });

    peer.on('connection', (c) => {
        if (conn && conn.open) { c.close(); return; }
        conn = c;
        isHost = true;
        state.myColor = 'white';
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
        state.myColor = 'black';
        setupConnection();
    });
}