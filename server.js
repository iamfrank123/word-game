const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(express.static(__dirname));

const rooms = {};
const MAX_PLAYERS = 2;
const WORD_LENGTH = 5; 

// Liste di parole per le lingue
const SECRET_WORDS_IT = ["AMORE","MONDO","CUORE","DONNA","TEMPO","LUOGO","FELPA","FORTE","VENTO","ACQUA","LATTE","PIANO","PESCE","AMICO","FIORI","PALLA","NOTTE","SEDIA","TRENO","BOSCO","LETTO","CUOCO","PIZZA","CIELO","FANGO","NUOVO","BAGNO","SOGNO","PIENO","VERDE","LENTO","PESCA","VESPA","TORRE","MENTE","VIGNA","PORTA","VISTO","NERVO","PESTO","SFERA","BANCA","LASSO","FETTA","CANTO","MORDE","GIOCO","RESTO","NOTTI","OLIVA","CUORI","TETTO","AEREO","SCALO","PESCI","LASER","SENSO","VINTO","DOLCE","FERRO","TASTO","MENSA","PUNTO","SCALA","MARMO","BOCCA","BRANO","DENTE","LETTA","BRAVO","AMICA","CARTA","PARCO","BANCO","PANCA","PERLA","MONTE","MAREA","GATTO","TENDA","FIUME","BRANO","PIGNA","BELLO","CIGNO","BORSA","ARENA","BRUCO","FORSE","CASCO","CALDO","CARNE","BECCO","STILE","RULLO","SPINA","RAGNO","BRUNO","CONTO","CREDO","CREMA","PARLO","PENTO","VOLTA"];
const SECRET_WORDS_EN = ["APPLE","HOUSE","HEART","WORLD","WATER","MONEY","LIGHT","SWEET","BREAD","PLANT","MUSIC","STONE","SMILE","RIVER","TABLE","CHAIR","SLEEP","GAMES","BRICK","BRAVE","PIZZA","HOUSE","FISHY","BERRY","ALIVE","FROST","SUGAR","BREAD","TRAIN","NIGHT","PLANE","SCOPE","GREEN","PEACE","FLOUR","TOWER","BEACH","SPINE","CANDY","LEMON","BRAVE","MONEY","LIGHT","NORTH","SOUTH","CUPPA","STONE","FENCE","BRICK","BRAVE","GHOST","CLEAN","WATER","PLANT","BEACH","MONEY","FRUIT","CLOUD","BREAD","SWEET","SUGAR","TABLE","RIVER","TRAIN","HOUSE","SMILE","STONE"];

function getWordList(language) {
    return language === "en" ? SECRET_WORDS_EN : SECRET_WORDS_IT;
}

function generateRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (rooms[code]); 
    return code;
}

function selectSecretWord(language = "it") {
    const list = getWordList(language);
    return list[Math.floor(Math.random() * list.length)];
}

function getFeedback(guess, secret) {
    const length = WORD_LENGTH; 
    const feedback = new Array(length).fill('not-in-word');
    let secretTemp = secret.split('');
    
    for (let i = 0; i < length; i++) {
        if (guess[i] === secret[i]) {
            feedback[i] = 'correct-position';
            secretTemp[i] = '#'; 
        }
    }

    for (let i = 0; i < length; i++) {
        if (feedback[i] === 'not-in-word') {
            const index = secretTemp.indexOf(guess[i]);
            if (index !== -1) {
                feedback[i] = 'wrong-position';
                secretTemp[index] = '#'; 
            }
        }
    }

    return feedback;
}

function initializeRoomState(roomCode, players, language = "it") {
    const newSecretWord = selectSecretWord(language);
    rooms[roomCode] = {
        secretWord: newSecretWord,
        players: players,
        currentPlayerIndex: 0,
        currentTurnSocket: players[0],
        grid: [],
        currentRow: 0,
        maxRows: 6,
        rematchRequests: 0,
        language: language
    };
    return rooms[roomCode];
}

io.on('connection', (socket) => {
    console.log(`[SERVER] Nuovo utente connesso: ${socket.id}`);

    socket.on('createRoom', (language = "it") => {
        const roomCode = generateRoomCode();
        initializeRoomState(roomCode, [socket.id], language);

        socket.join(roomCode);
        socket.roomId = roomCode;
        console.log(`[SERVER] Stanza creata: ${roomCode} con parola: ${rooms[roomCode].secretWord} (${language})`);

        socket.emit('roomCreated', roomCode);
        socket.emit('lobbyMessage', `Stanza creata! Codice: ${roomCode}. In attesa del secondo giocatore...`);
    });

    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];

        if (!room) return socket.emit('lobbyError', 'Stanza non trovata.');
        if (room.players.length >= MAX_PLAYERS) return socket.emit('lobbyError', 'Stanza piena.');

        socket.join(roomCode);
        room.players.push(socket.id);
        socket.roomId = roomCode;
        console.log(`[SERVER] Utente ${socket.id} unito alla stanza ${roomCode}`);

        io.to(roomCode).emit('startGame', roomCode, room.players);

        room.players.forEach(playerId => {
            io.sockets.sockets.get(playerId)?.emit('updateTurnStatus', { 
                isTurn: playerId === room.currentTurnSocket, 
                message: playerId === room.currentTurnSocket ? "Tocca a te!" : "Tocca all'avversario." 
            });
        });
    });

    socket.on('submitWord', (word) => {
        const roomCode = socket.roomId;
        const room = rooms[roomCode];
        const upperWord = word.toUpperCase();

        if (!room || room.players.length !== MAX_PLAYERS) return socket.emit('gameError', 'Partita non valida.');
        if (socket.id !== room.currentTurnSocket) return socket.emit('gameError', "Non è il tuo turno!");
        if (upperWord.length !== WORD_LENGTH) return socket.emit('gameError', `La parola deve essere di ${WORD_LENGTH} lettere.`);

        const feedback = getFeedback(upperWord, room.secretWord);
        room.grid.push({ word: upperWord, feedback: feedback });
        const hasWon = feedback.every(f => f === 'correct-position');

        if (hasWon) {
            const winnerName = socket.id === room.players[0] ? "Giocatore 1" : "Giocatore 2";
            console.log(`[SERVER] VITTORIA nella stanza ${roomCode}. Vincitore: ${winnerName}`);

            io.to(roomCode).emit('updateGameState', { 
                grid: room.grid, 
                currentRow: room.currentRow,
                maxRows: room.maxRows,
                currentTurnSocket: room.currentTurnSocket 
            });

            io.to(roomCode).emit('gameOver', { 
                winner: socket.id, 
                winnerName: winnerName,
                secretWord: room.secretWord
            });
            return;
        }

        room.currentRow++;
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % MAX_PLAYERS;
        room.currentTurnSocket = room.players[room.currentPlayerIndex];

        if (room.currentRow >= room.maxRows) {
            room.maxRows += 5; 
        }

        io.to(roomCode).emit('updateGameState', { 
            grid: room.grid, 
            currentRow: room.currentRow,
            maxRows: room.maxRows,
            currentTurnSocket: room.currentTurnSocket 
        });
        
        const nextPlayerId = room.currentTurnSocket;
        const opponentPlayerId = room.players.find(id => id !== nextPlayerId);

        io.sockets.sockets.get(nextPlayerId)?.emit('updateTurnStatus', {
            isTurn: true,
            message: "Tocca a te!"
        });
        
        if (opponentPlayerId) {
            io.sockets.sockets.get(opponentPlayerId)?.emit('updateTurnStatus', {
                isTurn: false,
                message: "Tocca all'avversario."
            });
        }
    });

    socket.on('requestRematch', () => {
        const roomCode = socket.roomId;
        const room = rooms[roomCode];
        if (!room) return;
        
        room.rematchRequests++;
        if (room.rematchRequests === MAX_PLAYERS) {
            const playerIds = room.players;
            const newRoom = initializeRoomState(roomCode, playerIds, room.language);

            io.to(roomCode).emit('rematchStart', roomCode);

            room.players.forEach(playerId => {
                io.sockets.sockets.get(playerId)?.emit('updateTurnStatus', { 
                    isTurn: newRoom.currentTurnSocket === playerId, 
                    message: newRoom.currentTurnSocket === playerId ? "Tocca a te!" : "Tocca all'avversario." 
                });
            });

            console.log(`[SERVER] REMATCH accettato per stanza ${roomCode}. Nuova parola: ${newRoom.secretWord} (${room.language})`);
        } else {
            socket.to(roomCode).emit('rematchRequested', 'L\'avversario ha richiesto una rivincita!');
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SERVER] Utente disconnesso: ${socket.id}`);
        const roomCode = socket.roomId;
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            room.players = room.players.filter(id => id !== socket.id);

            if (room.players.length === 0) {
                delete rooms[roomCode];
            } else {
                const remainingPlayerId = room.players[0];
                io.to(remainingPlayerId).emit('opponentDisconnected', 'L\'avversario si è disconnesso. La partita è terminata.');
                delete rooms[roomCode];
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server Socket.io in ascolto sulla porta ${PORT}`);
    console.log(`Accessibile su http://localhost:${PORT}`);
});
