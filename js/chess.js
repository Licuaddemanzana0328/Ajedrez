const UNICODE_PIECES = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
};

const pawnEval = [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0],
    [1.0, 1.0, 2.0, 3.0, 3.0, 2.0, 1.0, 1.0],
    [0.5, 0.5, 1.0, 2.7, 2.7, 1.0, 0.5, 0.5],
    [0.0, 0.0, 0.0, 2.5, 2.5, 0.0, 0.0, 0.0],
    [0.5, -0.5, -1.0, 0.0, 0.0, -1.0, -0.5, 0.5],
    [0.5, 1.0, 1.0, -2.0, -2.0, 1.0, 1.0, 0.5],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
];

const knightEval = [
    [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0],
    [-4.0, -2.0, 0.0, 0.0, 0.0, 0.0, -2.0, -4.0],
    [-3.0, 0.0, 1.0, 1.5, 1.5, 1.0, 0.0, -3.0],
    [-3.0, 0.5, 1.5, 2.0, 2.0, 1.5, 0.5, -3.0],
    [-3.0, 0.0, 1.5, 2.0, 2.0, 1.5, 0.0, -3.0],
    [-3.0, 0.5, 1.0, 1.5, 1.5, 1.0, 0.5, -3.0],
    [-4.0, -2.0, 0.0, 0.5, 0.5, 0.0, -2.0, -4.0],
    [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0]
];

const bishopEval = [
    [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0],
    [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0],
    [-1.0, 0.0, 0.5, 1.0, 1.0, 0.5, 0.0, -1.0],
    [-1.0, 0.5, 0.5, 1.0, 1.0, 0.5, 0.5, -1.0],
    [-1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, -1.0],
    [-1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0],
    [-1.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, -1.0],
    [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0]
];

const rookEval = [[0,0,0,0,0,0,0,0],[0.5,1,1,1,1,1,1,0.5],...Array(5).fill([-0.5,0,0,0,0,0,0,-0.5]),[0,0,0,0.5,0.5,0,0,0]];
const queenEval = [
    [-2,-1,-1,-0.5,-0.5,-1,-1,-2],[-1,0,0,0,0,0,0,-1],[-1,0,0.5,0.5,0.5,0.5,0,-1],[-0.5,0,0.5,0.5,0.5,0.5,0,-0.5],
    [0,0,0.5,0.5,0.5,0.5,0,-0.5],[-1,0.5,0.5,0.5,0.5,0.5,0,-1],[-1,0,0.5,0,0,0,0,-1],[-2,-1,-1,-0.5,-0.5,-1,-1,-2]
];
const kingEval = [
    ...Array(4).fill([-3,-4,-4,-5,-5,-4,-4,-3]), [-2,-3,-3,-4,-4,-3,-3,-2], [-1,-2,-2,-2,-2,-2,-2,-1], [2,2,0,0,0,0,2,2], [2,3,1,0,0,1,3,2]
];
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
// Tablas orientadas para las blancas; para las negras se espejan verticalmente
const PST = { p: pawnEval, n: knightEval, b: bishopEval, r: rookEval, q: queenEval, k: kingEval };
const MATE = 100000;

function initialBoard() {
    return [
        ['r','n','b','q','k','b','n','r'],
        ['p','p','p','p','p','p','p','p'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['P','P','P','P','P','P','P','P'],
        ['R','N','B','Q','K','B','N','R']
    ];
}

function initChess() {
    state.boardState = initialBoard();
    state.castle = { K: true, Q: true, k: true, q: true };
    state.inCheck = false;
    renderChessBoard();
}

function checkAttackedKeyPieces() {
    const b = state.boardState;
    const isWhiteTurn = state.turn === 'white';
    const threatened = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (p && (p === p.toUpperCase()) === isWhiteTurn) {
                const type = p.toLowerCase();
                if ((type === 'k' || type === 'q') && isSquareAttacked(b, r, c, !isWhiteTurn)) {
                    threatened.push({ r, c });
                }
            }
        }
    }
    return threatened;
}

function isSquareAttacked(b, r, c, byWhite) {
    const pr = byWhite ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
        if (r >= 0 && r < 8 && c + dc >= 0 && c + dc < 8 && b[pr] && b[pr][c + dc] === (byWhite ? 'P' : 'p')) return true;
    }
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === (byWhite ? 'N' : 'n')) return true;
    }
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr || dc) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === (byWhite ? 'K' : 'k')) return true;
            }
        }
    }
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        const diag = dr !== 0 && dc !== 0;
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const ch = b[nr][nc];
            if (ch) {
                const l = ch.toLowerCase();
                if ((ch === ch.toUpperCase()) === byWhite && (l === 'q' || l === (diag ? 'b' : 'r'))) return true;
                break;
            }
            nr += dr; nc += dc;
        }
    }
    return false;
}

function renderChessBoard() {
    const container = document.getElementById('board-container');
    container.innerHTML = '';
    const flipped = isBoardFlipped();
    const wrapper = document.createElement('div');
    wrapper.className = 'chess-wrapper';
    const cols = flipped ? ['H','G','F','E','D','C','B','A'] : ['A','B','C','D','E','F','G','H'];
    const addLabel = (text, col, row) => {
        const d = document.createElement('div');
        d.textContent = text; d.style.gridColumn = col; d.style.gridRow = row;
        wrapper.appendChild(d);
    };

    for (let i = 0; i < 8; i++) {
        const rank = flipped ? i + 1 : 8 - i;
        addLabel(cols[i], i + 2, 1); addLabel(cols[i], i + 2, 10);
        addLabel(rank, 1, i + 2); addLabel(rank, 10, i + 2);
    }

    const boardEl = document.createElement('div');
    boardEl.className = 'chess-board';
    const attackedKeys = checkAttackedKeyPieces();
    state.inCheck = attackedKeys.some(k => state.boardState[k.r][k.c].toLowerCase() === 'k');

    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const r = flipped ? 7 - dr : dr, c = flipped ? 7 - dc : dc;
            const square = document.createElement('div');
            square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            const piece = state.boardState[r][c];

            if (piece) {
                square.textContent = UNICODE_PIECES[piece.toLowerCase()] + '\uFE0E';
                square.classList.add(piece === piece.toUpperCase() ? 'white-piece' : 'black-piece');
                if (attackedKeys.some(k => k.r === r && k.c === c)) square.classList.add('in-check');
            }

            if (state.selectedSquare && state.selectedSquare.r === r && state.selectedSquare.c === c) square.classList.add('selected');

            if (state.validMoves.some(m => m.r === r && m.c === c)) {
                square.classList.add('valid-move');
                if (piece) square.classList.add('capture');
            }

            square.addEventListener('click', () => handleChessClick(r, c));
            boardEl.appendChild(square);
        }
    }

    wrapper.appendChild(boardEl);
    container.appendChild(wrapper);
}

function handleChessClick(r, c) {
    try {
        processChessClick(r, c);
    } catch (err) {
        state.selectedSquare = null;
        state.validMoves = [];
        renderChessBoard();
        throw err;
    }
}

function processChessClick(r, c) {
    if (inputBlocked()) return;

    const piece = state.boardState[r][c];
    const own = piece && ((piece === piece.toUpperCase()) === (state.turn === 'white'));
    const move = state.selectedSquare && state.validMoves.find(m => m.r === r && m.c === c);

    if (move) {
        const from = state.selectedSquare;
        if (state.mode === 'online') sendNetMove({ from, to: { r, c } });
        applyChessMove(from, { r, c });
        return;
    }

    if (own) {
        state.selectedSquare = { r, c };
        state.validMoves = getBasicChessMoves(r, c, state.boardState);
        showTutorialCard(piece.toUpperCase());
    } else {
        state.selectedSquare = null;
        state.validMoves = [];
        hideTutorialCard();
    }
    renderChessBoard();
}

const sqName = p => ['A','B','C','D','E','F','G','H'][p.c] + (8 - p.r);

// Punto único por donde pasa toda jugada: local, Bot o rival online
function applyChessMove(from, to, promo = 'Q') {
    const mover = state.turn;
    const piece = state.boardState[from.r][from.c];
    executeChessMove(from, to, promo);
    addHistoryMove(playerLabel(mover), `${PIECE_NAMES[piece]} ${sqName(from)} ➜ ${sqName(to)}`, from, to);

    state.selectedSquare = null;
    state.validMoves = [];
    hideTutorialCard();
    switchTurn(mover === 'white' ? 'black' : 'white');
    renderChessBoard();

    if (checkChessWin()) return;

    if (state.mode === 'ai' && state.turn === 'black') {
        updateStatus('El Bot está pensando...');
        setTimeout(makeAIMoveChess, 500);
    } else {
        updateStatus(`Turno de ${playerLabel(state.turn)}`);
    }
}

function executeChessMove(from, to, promo = 'Q') {
    const b = state.boardState;
    const piece = b[from.r][from.c];
    const type = piece.toLowerCase();
    const white = piece === piece.toUpperCase();
    let target = b[to.r][to.c];

    if (target) {
        state.captured[target === target.toUpperCase() ? 'white' : 'black'].push(target);
        state.scores[state.turn === 'white' ? 'p1' : 'p2'] += 10;
        updateScores();
        updateCapturedUI();
    }

    b[to.r][to.c] = piece;
    b[from.r][from.c] = '';

    if (type === 'p' && (to.r === 0 || to.r === 7)) {
        b[to.r][to.c] = white ? promo.toUpperCase() : promo.toLowerCase();
    }
}

function getBasicChessMoves(r, c, board) {
    const piece = board[r][c];
    if (!piece) return [];
    const isWhite = piece === piece.toUpperCase();
    const dir = isWhite ? -1 : 1;
    const type = piece.toLowerCase();
    const moves = [];

    if (type === 'p') {
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
            moves.push({ r: r + dir, c });
            if ((isWhite && r === 6) || (!isWhite && r === 1)) {
                if (!board[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
            }
        }
        for (let dc of [-1, 1]) {
            if (r + dir >= 0 && r + dir < 8 && c + dc >= 0 && c + dc < 8) {
                const target = board[r + dir][c + dc];
                if (target && (isWhite ? target === target.toLowerCase() : target === target.toUpperCase())) {
                    moves.push({ r: r + dir, c: c + dc });
                }
            }
        }
    }

    const directions = [];
    if (type === 'r' || type === 'q') directions.push([-1,0], [1,0], [0,-1], [0,1]);
    if (type === 'b' || type === 'q') directions.push([-1,-1], [-1,1], [1,-1], [1,1]);

    for (let [dr, dc] of directions) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const target = board[nr][nc];
            if (!target) moves.push({ r: nr, c: nc });
            else {
                if (isWhite ? target === target.toLowerCase() : target === target.toUpperCase()) moves.push({ r: nr, c: nc });
                break;
            }
            nr += dr; nc += dc;
        }
    }

    if (type === 'n') {
        for (let [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const target = board[nr][nc];
                if (!target || (isWhite ? target === target.toLowerCase() : target === target.toUpperCase())) moves.push({ r: nr, c: nc });
            }
        }
    }

    if (type === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                let nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = board[nr][nc];
                    if (!target || (isWhite ? target === target.toLowerCase() : target === target.toUpperCase())) moves.push({ r: nr, c: nc });
                }
            }
        }
    }

    return moves;
}

// Positivo = ventaja de las negras (el Bot)
function evaluateChessBoard(board) {
    let total = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) continue;
            const isBlack = piece === piece.toLowerCase();
            const type = piece.toLowerCase();
            const v = PIECE_VALUES[type] + PST[type][isBlack ? 7 - r : r][c] * 10;
            total += isBlack ? v : -v;
        }
    }
    return total;
}

function generateMoves(board, isBlack, capsOnly = false) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const pc = board[r][c];
            if (!pc || (pc === pc.toLowerCase()) !== isBlack) continue;
            for (const m of getBasicChessMoves(r, c, board)) {
                const cap = board[m.r][m.c];
                if (capsOnly && !cap) continue;
                moves.push({ fr: r, fc: c, tr: m.r, tc: m.c, pc, cap, key: cap ? 10 * PIECE_VALUES[cap.toLowerCase()] - PIECE_VALUES[pc.toLowerCase()] : 0 });
            }
        }
    }
    return moves.sort((a, b) => b.key - a.key);
}

function makeMove(board, m) {
    board[m.tr][m.tc] = (m.pc.toLowerCase() === 'p' && (m.tr === 0 || m.tr === 7)) ? (m.pc === 'P' ? 'Q' : 'q') : m.pc;
    board[m.fr][m.fc] = '';
}

function unmakeMove(board, m) {
    board[m.fr][m.fc] = m.pc;
    board[m.tr][m.tc] = m.cap;
}

// Búsqueda de capturas para no equivocarse al final del horizonte
function quiesce(board, alpha, beta, isBlack, qd) {
    const e = evaluateChessBoard(board);
    const stand = isBlack ? e : -e;
    if (qd >= 6 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of generateMoves(board, isBlack, true)) {
        if (m.cap.toLowerCase() === 'k') return MATE;
        makeMove(board, m);
        const score = -quiesce(board, -beta, -alpha, !isBlack, qd + 1);
        unmakeMove(board, m);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

function negamax(board, depth, alpha, beta, isBlack, ctx) {
    if (++ctx.nodes % 512 === 0 && Date.now() > ctx.deadline) ctx.timeUp = true;
    if (ctx.timeUp) return 0;
    if (depth === 0) return quiesce(board, alpha, beta, isBlack, 0);
    const moves = generateMoves(board, isBlack);
    if (!moves.length) return 0;
    let best = -Infinity;
    for (const m of moves) {
        if (m.cap && m.cap.toLowerCase() === 'k') return MATE + depth;
        makeMove(board, m);
        const score = -negamax(board, depth - 1, -beta, -alpha, !isBlack, ctx);
        unmakeMove(board, m);
        if (ctx.timeUp) return 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

// Profundización iterativa: siempre devuelve la mejor jugada de la última profundidad completada
function searchBestMove(board, isBlack, maxDepth, timeMs) {
    const work = board.map(row => row.slice());
    const ctx = { deadline: Date.now() + timeMs, timeUp: false, nodes: 0 };
    let moves = generateMoves(work, isBlack);
    let best = moves[0];
    for (let d = 1; d <= maxDepth; d++) {
        let alpha = -Infinity, iterBest = null;
        const scored = [];
        for (const m of moves) {
            makeMove(work, m);
            const sc = -negamax(work, d - 1, -Infinity, -alpha, !isBlack, ctx) + Math.random() * 2;
            unmakeMove(work, m);
            if (ctx.timeUp) break;
            scored.push({ m, sc });
            if (!iterBest || sc > iterBest.sc) iterBest = { m, sc };
            if (sc > alpha) alpha = sc;
        }
        if (ctx.timeUp || !iterBest) break;
        best = iterBest.m;
        moves = scored.sort((a, b) => b.sc - a.sc).map(x => x.m);
        if (iterBest.sc > MATE / 2) break;
    }
    return best;
}

const AI_LEVELS = {
    easy:   { depth: 1, time: 300,  blunder: 0.35 },
    normal: { depth: 2, time: 800,  blunder: 0 },
    hard:   { depth: 3, time: 1500, blunder: 0 },
    champ:  { depth: 5, time: 3000, blunder: 0 }
};

function makeAIMoveChess() {
    if (state.over || state.turn !== 'black') return;
    const lvl = AI_LEVELS[state.difficulty];
    let chosen;
    if (!lvl || Math.random() < lvl.blunder) {
        const all = generateMoves(state.boardState, true);
        chosen = all[Math.floor(Math.random() * all.length)];
    } else {
        chosen = searchBestMove(state.boardState, true, lvl.depth, lvl.time);
    }
    if (!chosen) return;
    applyChessMove({ r: chosen.fr, c: chosen.fc }, { r: chosen.tr, c: chosen.tc });
}

function checkChessWin() {
    let whiteKing = false, blackKing = false;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (state.boardState[r][c] === 'K') whiteKing = true;
            if (state.boardState[r][c] === 'k') blackKing = true;
        }
    }

    if (!whiteKing) { finishGame('p2', 'El Rey Blanco fue capturado.'); return true; }
    if (!blackKing) { finishGame('p1', 'El Rey Negro fue capturado.'); return true; }
    return false;
}