const state = {
    game: 'chess',
    mode: 'ai',
    difficulty: 'normal',
    playerName: 'Jugador 1',
    player2Name: 'Jugador 2',
    scores: { p1: 0, p2: 0 },
    turn: 'white',
    myColor: 'white',
    selectedSquare: null,
    validMoves: [],
    boardState: null,
    over: false,
    history: [],
    viewIndex: null,
    captured: { white: [], black: [] },
    timerSeconds: 0,
    p1Time: 0, p2Time: 0,
    timerInterval: null,
    inCheck: false,
    onlineRivalName: null
};

function inputBlocked() {
    if (state.over) return true;
    if (state.mode === 'ai') return state.turn === 'black';
    if (state.mode === 'online') return !(conn && conn.open) || state.turn !== state.myColor;
    return false;
}

function readTimerSeconds() {
    const v = document.getElementById('timer-select').value;
    if (v === 'custom') {
        const m = parseInt(document.getElementById('timer-custom-min').value) || 0;
        const sec = parseInt(document.getElementById('timer-custom-sec').value) || 0;
        return Math.min(5999, Math.max(10, m * 60 + sec));
    }
    return parseInt(v) || 0;
}

function refreshPanels() {
    const mode = document.getElementById('mode-select').value;
    const show = (id, on) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };
    show('network-panel', mode === 'online');
    show('player2-group', mode === 'local');
    show('difficulty-group', mode === 'ai');
    show('timer-config-group', document.getElementById('game-select').value === 'chess');
    show('timer-custom-group', document.getElementById('timer-select').value === 'custom');
    if (mode === 'online' && !peer) initNetwork();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', () => startGame());
    document.getElementById('quick-restart-btn').addEventListener('click', quickRestart);
    document.getElementById('win-close-btn').addEventListener('click', hideWinCard);
    ['game-select', 'mode-select', 'timer-select'].forEach(id => document.getElementById(id).addEventListener('change', refreshPanels));
    document.getElementById('game-select').addEventListener('change', (e) => updateObjective(e.target.value));
    refreshPanels();
    startGame();
});

function startGame(opts = {}) {
    state.playerName = document.getElementById('player-name').value.trim() || 'Jugador 1';
    state.player2Name = document.getElementById('player2-name').value.trim() || 'Jugador 2';
    state.game = document.getElementById('game-select').value;
    state.mode = document.getElementById('mode-select').value;
    state.difficulty = document.getElementById('difficulty-select').value;
    state.timerSeconds = opts.timer !== undefined ? opts.timer : readTimerSeconds();
    if (state.mode !== 'online') state.myColor = 'white';
    state.turn = 'white';
    state.selectedSquare = null;
    state.validMoves = [];
    state.over = false;
    state.history = [];
    state.viewIndex = null;
    state.captured = { white: [], black: [] };
    state.inCheck = false;

    hideWinCard();
    hideTutorialCard();
    updateObjective(state.game);
    refreshLabels();
    initTimers();

    if (state.mode === 'online' && !(conn && conn.open)) updateStatus('Conéctate con tu rival para comenzar la partida');
    else updateStatus(`Turno de ${playerLabel(state.turn)}`);

    initChess();
    updateHistoryUI();
    updateCapturedUI();

    if (state.mode === 'online' && !opts.remote) sendNetRestart();
}
