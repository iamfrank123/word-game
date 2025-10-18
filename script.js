const socket = io();

const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const lobbyMessage = document.getElementById('lobby-message');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const gridContainer = document.getElementById('grid-container');
const playerTurnH3 = document.getElementById('player-turn');
const gameMessageP = document.getElementById('game-message');
const keyboardContainer = document.getElementById('keyboard-container');

// ------------------ SUONI ------------------
const soundWin = new Audio('audio/audio_win.mp3');
const soundTurn = new Audio('audio/audio_turn.mp3');
const soundGameOver = new Audio('audio/audio_gameover.mp3');

let gameStatusDiv = document.getElementById('game-status');
let rematchBtn = null;

let currentRoomCode = '';
let isMyTurn = false;
let currentGuess = '';
let currentRowIndex = 0;
const WORD_LENGTH = 5;
let totalRows = 6;
let keyStates = {};

// ------------------ GRID ------------------

function generateGrid(rows) {
    gridContainer.innerHTML = '';
    totalRows = rows;
    for (let r = 0; r < totalRows; r++) {
        addNewRow();
    }
    updateCurrentRowVisual();
}

function addNewRow() {
    const r = gridContainer.children.length;
    const rowDiv = document.createElement('div');
    rowDiv.className = 'grid-row';
    rowDiv.id = `row-${r}`;

    for (let c = 0; c < WORD_LENGTH; c++) {
        const boxDiv = document.createElement('div');
        boxDiv.className = 'box';
        boxDiv.id = `box-${r}-${c}`;
        rowDiv.appendChild(boxDiv);
    }

    gridContainer.appendChild(rowDiv);
    totalRows = gridContainer.children.length;
    updateCurrentRowVisual();
}

function updateCurrentRowVisual() {
    document.querySelectorAll('.grid-row').forEach(row => row.classList.remove('current-row'));
    const currentRowElement = document.getElementById(`row-${currentRowIndex}`);
    if (currentRowIndex < totalRows && currentRowElement) {
        currentRowElement.classList.add('current-row');
    }
}

function updateGridState(gridData) {
    gridData.forEach((attempt, r) => {
        const rowElement = document.getElementById(`row-${r}`);
        if (rowElement) {
            const boxes = rowElement.querySelectorAll('.box');

            attempt.word.split('').forEach((letter, c) => {
                boxes[c].textContent = letter;
            });

            setTimeout(() => {
                attempt.feedback.forEach((feedbackClass, c) => {
                    boxes[c].classList.add(feedbackClass);
                });
            }, 50 * r);

            updateKeyboardFeedback(attempt.word, attempt.feedback);
        }
    });
}

// ------------------ INPUT ------------------

function handleKeyInput(key) {
    if (!isMyTurn || currentRowIndex >= totalRows) return;
    if (playerTurnH3.textContent.includes("Attendendo il server...")) return;

    const char = key.toUpperCase();

    if (char === 'ENTER') {
        submitCurrentGuess();
    } else if (char === 'BACKSPACE' || char === 'DELETE') {
        currentGuess = currentGuess.slice(0, -1);
        gameMessageP.textContent = '';
    } else if (char.length === 1 && /^[A-Z]$/.test(char) && currentGuess.length < WORD_LENGTH) {
        currentGuess += char;
        gameMessageP.textContent = '';
    }

    const rowBoxes = document.getElementById(`row-${currentRowIndex}`)?.querySelectorAll('.box');
    if (rowBoxes) {
        for (let i = 0; i < WORD_LENGTH; i++) {
            rowBoxes[i].textContent = currentGuess[i] || '';
        }
    }
}

document.addEventListener('keyup', (e) => {
    handleKeyInput(e.key);
});

// ------------------ KEYBOARD ------------------

function generateKeyboard() {
    const rows = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
    ];

    keyboardContainer.innerHTML = '';

    rows.forEach(rowKeys => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';

        rowKeys.forEach(keyText => {
            const key = document.createElement('div');
            key.className = 'key';
            key.textContent = keyText;
            key.id = `key-${keyText}`;

            if (keyText === 'ENTER' || keyText === 'BACKSPACE') key.classList.add('wide-key');
            if (keyStates[keyText]) key.classList.add(keyStates[keyText]);

            key.addEventListener('click', () => handleKeyInput(keyText));
            rowDiv.appendChild(key);

            keyStates[keyText] = keyStates[keyText] || '';
        });

        keyboardContainer.appendChild(rowDiv);
    });
}

generateKeyboard();

function submitCurrentGuess() {
    if (currentGuess.length === WORD_LENGTH) {
        gameMessageP.textContent = 'Verifica in corso...';
        playerTurnH3.textContent = "Attendendo il server...";
        socket.emit('submitWord', currentGuess);
    } else {
        gameMessageP.textContent = 'La parola deve avere 5 lettere!';
    }
}

function updateKeyboardFeedback(word, feedback) {
    const letters = word.split('');
    letters.forEach((letter, index) => {
        const keyElement = document.getElementById(`key-${letter}`);
        if (!keyElement) return;

        const newClass = feedback[index]; // "correct-position", "wrong-position", "not-in-word"

        if (newClass === 'not-in-word') {
            keyElement.classList.remove('correct-position', 'wrong-position');
            keyElement.classList.add('not-in-word'); // lettere non presenti → nero
        } else {
            // lettere presenti → gialle, sia corrette che fuori posizione
            keyElement.classList.remove('not-in-word');
            keyElement.classList.add('correct-position'); // usa correct-position per giallo
        }
    });
}


// ------------------ REMATCH ------------------

function createRematchButton() {
    if (rematchBtn) rematchBtn.remove();

    rematchBtn = document.createElement('button');
    rematchBtn.textContent = 'Gioca Ancora (Rematch)';
    rematchBtn.style.padding = '10px 20px';
    rematchBtn.style.marginTop = '15px';
    rematchBtn.style.cursor = 'pointer';

    rematchBtn.addEventListener('click', () => {
        socket.emit('requestRematch');
        rematchBtn.textContent = 'Richiesta inviata... Attendere';
        rematchBtn.disabled = true;
    });

    gameStatusDiv.appendChild(rematchBtn);
}

function resetGameInterface() {
    if (rematchBtn) {
        rematchBtn.remove();
        rematchBtn = null;
    }

    isMyTurn = false;
    currentGuess = '';
    currentRowIndex = 0;
    totalRows = 6;
    keyStates = {};

    playerTurnH3.textContent = 'Attendendo il tuo avversario...';
    gameMessageP.textContent = 'Nuova partita iniziata!';
    generateGrid(6);
    generateKeyboard();
}

// ------------------ SOCKET.IO ------------------

createRoomBtn.addEventListener('click', () => {
    socket.emit('createRoom');
    lobbyMessage.textContent = 'Creazione stanza...';
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 4) {
        socket.emit('joinRoom', code);
        lobbyMessage.textContent = `Tentativo di unione alla stanza ${code}...`;
        createRoomBtn.disabled = true;
        joinRoomBtn.disabled = true;
    } else {
        lobbyMessage.textContent = 'Inserisci un codice stanza valido di 4 lettere.';
    }
});

socket.on('roomCreated', (code) => {
    currentRoomCode = code;
    lobbyMessage.textContent = `Stanza creata! Codice: ${code}. Condividi questo codice. In attesa dell'avversario...`;
});

socket.on('lobbyMessage', (msg) => {
    lobbyMessage.textContent = msg;
    if (!currentRoomCode) {
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
    }
});

socket.on('lobbyError', (msg) => {
    lobbyMessage.textContent = `ERRORE: ${msg}`;
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
});

socket.on('startGame', (roomCode, players) => {
    currentRoomCode = roomCode;
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'flex';
    gameMessageP.textContent = 'Partita iniziata!';
    resetGameInterface();
});

socket.on('updateTurnStatus', (status) => {
    isMyTurn = status.isTurn;
    playerTurnH3.textContent = status.message;

    if (isMyTurn) {
        gameMessageP.textContent = "Tocca a te! Digita la tua parola e premi INVIO.";
    } else {
        gameMessageP.textContent = "Attendendo il turno dell'avversario.";
        currentGuess = '';
        const rowBoxes = document.getElementById(`row-${currentRowIndex}`)?.querySelectorAll('.box');
        if (rowBoxes) rowBoxes.forEach(box => box.textContent = '');
    }

    updateCurrentRowVisual();
});

socket.on('updateGameState', (state) => {
    updateGridState(state.grid);
    currentRowIndex = state.currentRow;
    totalRows = state.maxRows;

    while (gridContainer.children.length < totalRows) {
        addNewRow(); // aggiunge una riga alla volta
    }

    updateGridState(state.grid);
    currentGuess = '';
    updateCurrentRowVisual();
});

socket.on('gameOver', (data) => {
    isMyTurn = false;
    playerTurnH3.textContent = `Partita Terminata! VINCITORE: ${data.winner === socket.id ? "TU" : "AVVERSARIO"}`;
    gameMessageP.textContent = `La parola segreta era: ${data.secretWord}`;
    currentGuess = '';

    // Suoni
    if (data.winner === socket.id) {
        soundWin.play();        // se ho vinto
    } else {
        soundGameOver.play();   // se ho perso
    }

    createRematchButton();
});


socket.on('rematchRequested', (msg) => {
    gameMessageP.textContent = msg;
    createRematchButton();
    rematchBtn.textContent = 'Accetta Rivincita!';
});

socket.on('rematchStart', () => {
    resetGameInterface();
    gameMessageP.textContent = 'Rivincita accettata! Il gioco riparte.';
});

socket.on('opponentDisconnected', (message) => {
    isMyTurn = false;
    playerTurnH3.textContent = 'Partita Terminata';
    gameMessageP.textContent = message;
    if (rematchBtn) rematchBtn.remove();
    alert(message + ' Ricarica la pagina per ricominciare.');
});

socket.on('gameError', (msg) => {
    gameMessageP.textContent = `ERRORE GIOCO: ${msg}`;
    if (isMyTurn) playerTurnH3.textContent = "Tocca a te!";
});
