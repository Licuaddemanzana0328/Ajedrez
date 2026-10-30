/**
 * ice-config.js — Configuración WebRTC compartida (Ajedrez + Un0)
 *
 * POR QUÉ HACE FALTA ESTO
 * Para conectar dos PCs que están en redes distintas, WebRTC intenta primero una
 * conexión directa usando servidores STUN (gratis, los de Google). Eso funciona solo
 * en ~70-80 % de los casos. Con datos móviles, redes de universidad/trabajo, algunos
 * proveedores de internet (CGNAT) o routers estrictos la conexión directa es imposible
 * y se necesita un servidor TURN que retransmita los datos.
 *
 * Ya no existen servidores TURN públicos sin registro (openrelay.metered.ca fue
 * dado de baja), así que hay que crear una cuenta GRATIS y poner tus credenciales aquí.
 *
 * CÓMO CONFIGURARLO (2 minutos, plan gratuito de Metered):
 *   1. Crea una cuenta en https://dashboard.metered.ca/signup
 *   2. Crea una "app". Te da un nombre, por ejemplo  "misjuegos"  (misjuegos.metered.live)
 *   3. En el panel, sección TURN Server → copia tu "API Key"
 *   4. Pega los dos valores abajo y vuelve a subir/abrir el juego.
 *
 * (Alternativa: llena "extraServers" con los datos de cualquier otro servidor TURN.)
 */
const TURN_SETTINGS = {
    meteredApp: '',      // ej: 'misjuegos'   (lo que va antes de .metered.live)
    meteredApiKey: '',   // ej: 'a1b2c3d4e5...'
    extraServers: []     // ej: [{ urls: 'turn:mi-servidor.com:3478', username: 'user', credential: 'pass' }]
};

const GOOGLE_STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
];

let _iceCache = null;
let _iceHasTurn = false;

function iceHasTurn() { return _iceHasTurn; }

/** Devuelve la config para `new Peer(id, { config })`. Pide credenciales TURN si están configuradas. */
async function getIceConfig() {
    if (_iceCache) return _iceCache;
    const servers = GOOGLE_STUN.slice();
    let turnFailed = false;

    const app = (TURN_SETTINGS.meteredApp || '').trim();
    const key = (TURN_SETTINGS.meteredApiKey || '').trim();
    if (app && key) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 7000);
            const res = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const list = await res.json();
            if (Array.isArray(list) && list.length) servers.push(...list);
            else throw new Error('respuesta vacía');
        } catch (e) {
            turnFailed = true;
            console.warn('[ice-config] No se pudieron obtener las credenciales TURN de Metered:', e);
        }
    }
    (TURN_SETTINGS.extraServers || []).forEach(s => { if (s && s.urls) servers.push(s); });

    _iceHasTurn = servers.some(s => [].concat(s.urls || s.url || []).some(u => /^turns?:/i.test(u)));
    const cfg = { iceServers: servers, iceCandidatePoolSize: 4 };
    if (!turnFailed) _iceCache = cfg;      // si falló el TURN, se reintenta la próxima vez
    return cfg;
}

/** Texto de ayuda cuando una conexión no se pudo establecer. */
function connectionHelp() {
    return _iceHasTurn
        ? 'No se pudo conectar. Revisa el código y tu conexión a internet e inténtalo de nuevo.'
        : 'No se pudo conectar: tu red (datos móviles, trabajo, universidad o algunos proveedores) bloquea la conexión directa. Hace falta configurar un servidor TURN en js/ice-config.js.';
}

/** Aviso permanente cuando no hay TURN (se muestra junto al código de sala). */
const TURN_WARNING = 'Sin servidor TURN configurado: la conexión entre redes distintas puede fallar. Mira js/ice-config.js.';

/**
 * Vigila una DataConnection de PeerJS: si no se abre en `timeoutMs` o el ICE falla,
 * llama a onFail(). Así el usuario ve un mensaje en vez de quedarse esperando.
 */
function watchConnection(conn, onFail, timeoutMs = 20000) {
    let finished = false;
    const done = () => { finished = true; clearTimeout(timer); };
    const fail = () => { if (finished || conn.open) return; done(); onFail(); };
    const timer = setTimeout(fail, timeoutMs);
    conn.on('open', done);
    conn.on('close', () => clearTimeout(timer));
    const pc = conn.peerConnection;
    if (pc && pc.addEventListener) {
        pc.addEventListener('iceconnectionstatechange', () => {
            if (pc.iceConnectionState === 'failed') fail();
        });
    }
}
