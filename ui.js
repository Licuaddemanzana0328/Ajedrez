const PIECE_NAMES = {
    'P': 'Peón', 'R': 'Torre', 'N': 'Caballo', 'B': 'Alfil', 'Q': 'Dama', 'K': 'Rey',
    'p': 'Peón', 'r': 'Torre', 'n': 'Caballo', 'b': 'Alfil', 'q': 'Dama', 'k': 'Rey'
};

const PIECE_INFO = {
    'P': { name: 'Peón (♟ / ♙)', desc: 'Infantería principal. No puede retroceder.', move: 'Avanza 1 casilla hacia adelante (2 en su primer movimiento). Captura en diagonal.' },
    'R': { name: 'Torre (♜ / ♖)', desc: 'Pieza potente de largo alcance.', move: 'Se mueve en línea recta horizontal o verticalmente todas las casillas libres que desee.' },
    'N': { name: 'Caballo (♞ / ♘)', desc: 'Táctica de salto.', move: 'Se mueve en forma de "L" (2 casillas en una dirección y 1 perpendicular). Puede saltar piezas.' },
    'B': { name: 'Alfil (♝ / ♗)', desc: 'Control de diagonales.', move: 'Se mueve en diagonal todas las casillas libres que desee sin cambiar el color de casilla.' },
    'Q': { name: 'Dama / Reina (♛ / ♕)', desc: 'La pieza más poderosa.', move: 'Combina el poder de la Torre y el Alfil (se mueve en cualquier dirección).' },
    'K': { name: 'Rey (♚ / ♔)', desc: 'Pieza vital a proteger.', move: 'Se mueve 1 casilla en cualquier dirección.' },
};

const OBJECTIVES = {
    chess: {
        text: '<strong>Da jaque mate al Rey enemigo</strong> (♚ negro): atácalo sin dejarle escapatoria.',
        steps: [
            'Mueve tocando tu pieza y luego la casilla verde o roja destino.',
            'Si tu rey o dama están en jaque (casilla roja encendida), deben protegerse.',
            'Gana quien acorrale al Rey o agote el tiempo del rival.'
        ]
    }
};

function updateStatus(msg) {
    const el = document.getElementById('status-msg');
    el.classList.remove('win');
    if (state.game === 'chess' && state.inCheck && !state.over && msg.startsWith('Turno')) msg += ' - ¡Ataque / Jaque!';
    el.textContent = msg;
}

function esc(t) {
    return String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function playerLabel(turn) {
    if (state.mode === 'online') return turn === state.myColor ? state.playerName : (state.onlineRivalName || 'Rival Online');
    if (turn === 'white') return state.playerName;
    return state.mode === 'ai' ? 'El Bot' : state.player2Name;
}

function isBoardFlipped() { return state.mode === 'online' && state.myColor === 'black'; }

function refreshLabels() {
    document.getElementById('p1-label').textContent = playerLabel('white');
    document.getElementById('p2-label').textContent = playerLabel('black');
    const n1 = document.getElementById('p1-timer-name'), n2 = document.getElementById('p2-timer-name');
    if (n1) n1.textContent = playerLabel('white');
    if (n2) n2.textContent = playerLabel('black');
}

function switchTurn(nextTurn) {
    state.turn = nextTurn;
    playTurnSound();
}

function showWinExplanation(title, explanation) {
    const winCard = document.getElementById('win-card');
    document.getElementById('win-title').innerHTML = title;
    document.getElementById('win-reason').innerHTML = explanation;
    winCard.style.display = 'flex';
}

function hideWinCard() { document.getElementById('win-card').style.display = 'none'; }

function finishGame(winner, reason = '') {
    state.over = true;
    clearInterval(state.timerInterval);
    state.scores[winner] += 50;
    updateScores();

    const winnerName = playerLabel(winner === 'p1' ? 'white' : 'black');
    const defaultReason = `<strong>Motivo:</strong> ${esc(winnerName)} acorraló al rey rival.`;

    updateStatus(`${winnerName} ha ganado la partida`);
    document.getElementById('status-msg').classList.add('win');
    showWinExplanation(`Victoria para ${esc(winnerName)}`, reason || defaultReason);
    launchConfetti();
}

function quickRestart() {
    hideWinCard();
    startGame();
}

function updateObjective(game = state.game) {
    const o = OBJECTIVES[game];
    document.getElementById('objective-text').innerHTML = o.text;
    document.getElementById('objective-steps').innerHTML = o.steps.map(t => `<li>${t}</li>`).join('');
}

function showTutorialCard(pieceKey) {
    if (!document.getElementById('tutorial-switch').checked) {
        hideTutorialCard();
        return;
    }
    const info = PIECE_INFO[pieceKey];
    if (!info) return;

    document.getElementById('piece-info-title').textContent = info.name;
    document.getElementById('piece-info-desc').textContent = info.desc;
    document.getElementById('piece-info-movement').textContent = info.move;
    document.getElementById('tutorial-card').style.display = 'flex';
}

function hideTutorialCard() { document.getElementById('tutorial-card').style.display = 'none'; }

function initTimers() {
    clearInterval(state.timerInterval);
    const timerDisplay = document.getElementById('timer-display');
    if (state.timerSeconds > 0 && state.game === 'chess') {
        state.p1Time = state.timerSeconds;
        state.p2Time = state.timerSeconds;
        timerDisplay.style.display = 'flex';
        updateTimerUI();
        state.timerInterval = setInterval(handleTimerTick, 1000);
    } else {
        timerDisplay.style.display = 'none';
    }
}

function handleTimerTick() {
    if (state.over) return;
    if (state.mode === 'online' && !(conn && conn.open)) return;
    if (state.turn === 'white') {
        state.p1Time--;
        if (state.p1Time <= 0) finishGame('p2', `${esc(playerLabel('white'))} agotó todo el tiempo de su reloj.`);
    } else {
        state.p2Time--;
        if (state.p2Time <= 0) finishGame('p1', `${esc(playerLabel('black'))} agotó todo el tiempo de su reloj.`);
    }
    updateTimerUI();
}

function updateTimerUI() {
    const fmt = sec => `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
    const set = (id, sec, active) => {
        const el = document.getElementById(id);
        el.textContent = fmt(Math.max(0, sec));
        el.parentElement.classList.toggle('active', active);
        el.parentElement.classList.toggle('low', sec <= 10);
    };
    set('p1-timer', state.p1Time, state.turn === 'white');
    set('p2-timer', state.p2Time, state.turn === 'black');
}

function addHistoryMove(player, desc, from, to) {
    state.history.push({ player, desc, from, to, board: state.boardState.map(r => r.slice()) });
    state.viewIndex = null;
    updateHistoryUI();
}

function selectHistory(i) {
    state.viewIndex = i === state.history.length - 1 ? null : i;
    updateHistoryUI();
}

function miniStep(d) {
    const n = state.history.length;
    if (!n) return;
    const idx = Math.max(0, Math.min(n - 1, (state.viewIndex === null ? n - 1 : state.viewIndex) + d));
    selectHistory(idx);
}

function updateHistoryUI() {
    const grid = document.getElementById('history-grid');
    const n = state.history.length;
    const sel = state.viewIndex === null ? n - 1 : state.viewIndex;
    grid.innerHTML = n === 0
        ? '<div class="history-empty">Sin movimientos aún.</div>'
        : state.history.map((h, i) => `
            <div class="history-card${i === sel ? ' selected' : ''}" onclick="selectHistory(${i})">
                <span class="step-num">#${i + 1} ${esc(h.player)}</span>
                <span class="step-move">${h.desc}</span>
            </div>`).reverse().join('');
    renderMiniBoard();
}

function renderMiniBoard() {
    const el = document.getElementById('mini-board');
    const n = state.history.length;
    const idx = state.viewIndex === null ? n - 1 : state.viewIndex;
    const h = state.history[idx];
    const board = h ? h.board : initialBoard();
    const flipped = isBoardFlipped();
    let html = '';
    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const r = flipped ? 7 - dr : dr, c = flipped ? 7 - dc : dc, p = board[r][c];
            let cls = (r + c) % 2 === 0 ? 'light' : 'dark';
            if (h && h.from.r === r && h.from.c === c) cls += ' mini-from';
            else if (h && h.to.r === r && h.to.c === c) cls += ' mini-to';
            if (p) cls += p === p.toUpperCase() ? ' white-piece' : ' black-piece';
            html += `<div class="mini-sq ${cls}">${p ? UNICODE_PIECES[p.toLowerCase()] + '\uFE0E' : ''}</div>`;
        }
    }
    el.innerHTML = html;
    document.getElementById('mini-caption').textContent = h ? `Movimiento ${idx + 1} de ${n}: ${h.desc}` : 'Posición inicial';
}

function updateCapturedUI() {
    const order = state.myColor === 'black' && state.mode === 'online' ? ['black', 'white'] : ['white', 'black'];
    document.getElementById('captured-box').innerHTML = order.map(color => {
        const list = state.captured[color].slice().sort((a, b) => PIECE_VALUES[b.toLowerCase()] - PIECE_VALUES[a.toLowerCase()]);
        const glyphs = list.map(p => `<span class="cap-piece ${color}-piece">${UNICODE_PIECES[p.toLowerCase()]}\uFE0E</span>`).join('');
        return `<div class="captured-row"><span class="captured-label">Piezas perdidas de ${esc(playerLabel(color))}</span><div class="captured-list">${glyphs || '<span class="captured-none">Ninguna</span>'}</div></div>`;
    }).join('');
}

function updateScores() {
    document.getElementById('p1-score').textContent = state.scores.p1;
    document.getElementById('p2-score').textContent = state.scores.p2;
}