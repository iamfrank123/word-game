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
const languageSelect = document.getElementById('languageSelect'); 

// ------------------ SUONI ------------------
const soundWin = new Audio('audio/audio_win.mp3');
const soundTurn = new Audio('audio/audio_turn.mp3');
const soundGameOver = new Audio('audio/audio_gameover.mp3');
const soundTick = new Audio('audio/tick.mp3'); // il tuo suono "tick"
const soundMyTurn = new Audio('audio/myturn.mp3'); // suono "bell" soft


let gameStatusDiv = document.getElementById('game-status');
let rematchBtn = null;

let currentRoomCode = '';
let isMyTurn = false;
let currentGuess = '';
let currentRowIndex = 0;
const WORD_LENGTH = 5;
let totalRows = 6;
let keyStates = {};

// ------------------ TIMER ------------------
let turnTime = 45;
let turnTimerId = null;

function startTurnTimer() {
    clearInterval(turnTimerId);
    turnTime = 45;
    updateTimerDisplay();

    turnTimerId = setInterval(() => {
        turnTime--;
        updateTimerDisplay();

        // Suono a 8 secondi
        if (turnTime === 8) {
            soundTick.play();
        }

        if (turnTime <= 0) {
            clearInterval(turnTimerId);
            timeUp();
        }
    }, 1000);
}


function updateTimerDisplay() {
    const timerDiv = document.getElementById('turn-timer');
    if (timerDiv) timerDiv.textContent = `Time left: ${turnTime}s`;
}

function timeUp() {
    gameMessageP.textContent = "Time's up! Passing turn...";
    socket.emit('passTurn'); // server gestisce cambio turno
}

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
    if (playerTurnH3.textContent.includes("Waiting for the server...")) return;

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
        gameMessageP.textContent = 'Verifying...';
        playerTurnH3.textContent = "Waiting for the server...";
        socket.emit('submitWord', currentGuess);
    } else {
        gameMessageP.textContent = `The word should be ${WORD_LENGTH} letters!`;
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
            keyElement.classList.add('not-in-word');
        } else {
            keyElement.classList.remove('not-in-word');
            keyElement.classList.add('correct-position');
        }
    });
}

// ------------------ REMATCH ------------------

function createRematchButton() {
    if (rematchBtn) rematchBtn.remove();

    rematchBtn = document.createElement('button');
    rematchBtn.textContent = 'Play again (Rematch)';
    rematchBtn.style.padding = '10px 20px';
    rematchBtn.style.marginTop = '15px';
    rematchBtn.style.cursor = 'pointer';

    rematchBtn.addEventListener('click', () => {
        socket.emit('requestRematch');
        rematchBtn.textContent = 'Request sent... Please wait';
        rematchBtn.disabled = true;
    });

    gameStatusDiv.appendChild(rematchBtn);
}

function resetGameInterface() {
    if (rematchBtn) {
        rematchBtn.remove();
        rematchBtn = null;
    }

    clearInterval(turnTimerId);
    isMyTurn = false;
    currentGuess = '';
    currentRowIndex = 0;
    totalRows = 6;
    keyStates = {};

    playerTurnH3.textContent = 'Waiting for your opponent...';
    gameMessageP.textContent = 'New game started!';
    generateGrid(6);
    generateKeyboard();
}

// ------------------ SOCKET.IO ------------------

// CREA STANZA CON LINGUA
createRoomBtn.addEventListener('click', () => {
    const selectedLanguage = languageSelect.value; 
    socket.emit('createRoom', selectedLanguage);
    lobbyMessage.textContent = 'Creating a room...';
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
        lobbyMessage.textContent = 'Enter a valid 4-letter room code.';
    }
});

socket.on('roomCreated', (code) => {
    currentRoomCode = code;
    const langText = languageSelect.value === "en" ? "English" : "Italiano";
    lobbyMessage.textContent = `Room created! code: ${code} (${langText}). Waiting for your opponent...`;
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
    gameMessageP.textContent = 'Game started!';
    resetGameInterface();
});

socket.on('updateTurnStatus', (status) => {
    isMyTurn = status.isTurn;
    playerTurnH3.textContent = status.message;

    if (isMyTurn) {
        gameMessageP.textContent = "It's your turn! Insert your word.";
        soundMyTurn.play(); // suono solo sul tuo turno
        startTurnTimer(); 
    } else {
        clearInterval(turnTimerId);
        gameMessageP.textContent = "Waiting for your opponent's turn.";
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
        addNewRow();
    }

    updateGridState(state.grid);
    currentGuess = '';
    updateCurrentRowVisual();
});

socket.on('gameOver', (data) => {
    clearInterval(turnTimerId);
    isMyTurn = false;
    playerTurnH3.textContent = `Game ended! WINNER: ${data.winner === socket.id ? "TU" : "AVVERSARIO"}`;
    gameMessageP.textContent = `The secret word was: ${data.secretWord}`;
    currentGuess = '';

    if (data.winner === socket.id) {
        soundWin.play();
    } else {
        soundGameOver.play();
    }

    createRematchButton();
});

socket.on('rematchRequested', (msg) => {
    gameMessageP.textContent = msg;
    createRematchButton();
    rematchBtn.textContent = 'Accept rematch!';
});

socket.on('rematchStart', () => {
    resetGameInterface();
    gameMessageP.textContent = 'Rematch accepted! The game starts.';
});

socket.on('opponentDisconnected', (message) => {
    clearInterval(turnTimerId);
    isMyTurn = false;
    playerTurnH3.textContent = 'Game ended';
    gameMessageP.textContent = message;
    if (rematchBtn) rematchBtn.remove();
    alert(message + ' Refresh the page to restart.');
});

socket.on('gameError', (msg) => {
    gameMessageP.textContent = `ERRORE GIOCO: ${msg}`;
    if (isMyTurn) playerTurnH3.textContent = "Your turn!";
});
