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

const SECRET_WORDS = ["AMORE","MONDO","CUORE","DONNA","TEMPO","LUOGO","FELPA","FORTE","VENTO","ACQUA","LATTE","PIANO","PESCE","AMICO","FIORI","PALLA","NOTTE","SEDIA","TRENO","BOSCO","LETTO","CUOCO","PIZZA","CIELO","FANGO","NUOVO","BAGNO","SOGNO","PIENO","VERDE","LENTO","PESCA","VESPA","TORRE","MENTE","VIGNA","PORTA","VISTO","NERVO","PESTO","SFERA","BANCA","LASSO","FETTA","CANTO","MORDE","GIOCO","RESTO","NOTTI","OLIVA","CUORI","TETTO","AEREO","SCALO","PESCI","LASER","SENSO","VINTO","DOLCE","FERRO","TASTO","MENSA","PUNTO","SCALA","MARMO","BOCCA","BRANO","DENTE","LETTA","BRAVO","AMICA","CARTA","PARCO","BANCO","PANCA","PERLA","MONTE","MAREA","GATTO","TENDA","FIUME","BRANO","PIGNA","BELLO","CIGNO","BORSA","ARENA","BRUCO","FORSE","CASCO","CALDO","CARNE","BECCO","STILE","RULLO","SPINA","RAGNO","BRUNO","CONTO","CREDO","CREMA","PARLO","PENTO","VOLTA"];

const VALID_WORDS = new Set(SECRET_WORDS.map(w => w.toUpperCase())); 

function generateRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (rooms[code]); 
    return code;
}

function selectSecretWord() {
    return SECRET_WORDS[Math.floor(Math.random() * SECRET_WORDS.length)];
}

function getFeedback(guess, secret) {
    const length = 5; 
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

// NUOVA FUNZIONE: Inizializza o Reset dello stato di una stanza
function initializeRoomState(roomCode, players) {
    const newSecretWord = selectSecretWord();
    rooms[roomCode] = {
        secretWord: newSecretWord,
        players: players, // Mantiene i giocatori attuali
        currentPlayerIndex: 0, 
        currentTurnSocket: players[0], // Inizia sempre il Giocatore 1
        grid: [],
        currentRow: 0,
        maxRows: 6,
        rematchRequests: 0 // NUOVO: Conta le richieste di rematch
    };
    return rooms[roomCode];
}


io.on('connection', (socket) => {
    console.log(`[SERVER] Nuovo utente connesso: ${socket.id}`);

    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        
        initializeRoomState(roomCode, [socket.id]);

        socket.join(roomCode);
        socket.roomId = roomCode;
        console.log(`[SERVER] Stanza creata: ${roomCode} con parola: ${rooms[roomCode].secretWord}`);

        socket.emit('roomCreated', roomCode);
        socket.emit('lobbyMessage', `Stanza creata! Codice: ${roomCode}. In attesa del secondo giocatore...`);
    });

    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];

        if (!room) {
            return socket.emit('lobbyError', 'Stanza non trovata.');
        }
        if (room.players.length >= MAX_PLAYERS) {
            return socket.emit('lobbyError', 'Stanza piena.');
        }

        socket.join(roomCode);
        room.players.push(socket.id);
        socket.roomId = roomCode;
        console.log(`[SERVER] Utente ${socket.id} unito alla stanza ${roomCode}`);

        io.to(roomCode).emit('startGame', roomCode, room.players);
        
        const firstPlayerId = room.players[0];
        const secondPlayerId = room.players[1];
        
        io.sockets.sockets.get(firstPlayerId)?.emit('updateTurnStatus', { 
            isTurn: firstPlayerId === room.currentTurnSocket, 
            message: firstPlayerId === room.currentTurnSocket ? "Tocca a te!" : "Tocca all'avversario." 
        });

        io.sockets.sockets.get(secondPlayerId)?.emit('updateTurnStatus', { 
            isTurn: secondPlayerId === room.currentTurnSocket, 
            message: secondPlayerId === room.currentTurnSocket ? "Tocca a te!" : "Tocca all'avversario." 
        });
    });

    socket.on('submitWord', (word) => {
        const roomCode = socket.roomId;
        const room = rooms[roomCode];
        const upperWord = word.toUpperCase();

        if (!room || room.players.length !== MAX_PLAYERS) {
            return socket.emit('gameError', 'Partita non valida.');
        }
        
        if (socket.id !== room.currentTurnSocket) {
            return socket.emit('gameError', "Non è il tuo turno!");
        }

        if (upperWord.length !== WORD_LENGTH) {
            return socket.emit('gameError', `La parola deve essere di ${WORD_LENGTH} lettere per avanzare.`);
        }
        
        if (room.currentRow >= room.maxRows) {
            console.error(`[SERVER] ERRORE CRITICO: Limite righe raggiunto nella stanza ${roomCode}.`);
            return socket.emit('gameError', 'Limite righe raggiunto. Impossibile inviare la parola.');
        }
        
        const feedback = getFeedback(upperWord, room.secretWord);

        // Aggiungi il tentativo prima di controllare la vittoria
        room.grid.push({ word: upperWord, feedback: feedback });
        
        const hasWon = feedback.every(f => f === 'correct-position');
        
        if (hasWon) {
            const winnerName = socket.id === room.players[0] ? "Giocatore 1" : "Giocatore 2";
            console.log(`[SERVER] VITTORIA nella stanza ${roomCode}. Vincitore: ${winnerName}`);
            
            // Aggiorna lo stato una volta finale (cruciale per mostrare la riga verde all'avversario)
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
            // NON eliminiamo la stanza qui, la teniamo per il rematch
            return;
        }

        room.currentRow++;
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % MAX_PLAYERS;
        room.currentTurnSocket = room.players[room.currentPlayerIndex];

        if (room.currentRow >= room.maxRows) {
            room.maxRows += 5; 
            console.log(`[SERVER] Stanza ${roomCode}: Griglia estesa a ${room.maxRows} righe.`);
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

    // NUOVO EVENTO: Gestione richiesta Rematch
    socket.on('requestRematch', () => {
        const roomCode = socket.roomId;
        const room = rooms[roomCode];

        if (!room) return;
        
        room.rematchRequests++;

        if (room.rematchRequests === MAX_PLAYERS) {
            // Entrambi i giocatori hanno richiesto il rematch
            const playerIds = room.players;
            const newRoom = initializeRoomState(roomCode, playerIds);

            // Invia l'evento di riavvio a entrambi i giocatori
            io.to(roomCode).emit('rematchStart', roomCode);
            
            // Reimposta i messaggi di turno per la nuova partita
            io.sockets.sockets.get(newRoom.players[0])?.emit('updateTurnStatus', { 
                isTurn: newRoom.currentTurnSocket === newRoom.players[0], 
                message: "Tocca a te!" 
            });
            io.sockets.sockets.get(newRoom.players[1])?.emit('updateTurnStatus', { 
                isTurn: newRoom.currentTurnSocket === newRoom.players[1], 
                message: "Tocca all'avversario." 
            });

            console.log(`[SERVER] REMATCH accettato per stanza ${roomCode}. Nuova parola: ${newRoom.secretWord}`);

        } else {
            // Notifica l'avversario che l'altro giocatore ha richiesto il rematch
            socket.to(roomCode).emit('rematchRequested', 'L\'avversario ha richiesto una rivincita!');
        }
    });
    
    // Gestione della disconnessione
    socket.on('disconnect', () => {
        console.log(`[SERVER] Utente disconnesso: ${socket.id}`);
        const roomCode = socket.roomId;
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            
            room.players = room.players.filter(id => id !== socket.id);

            if (room.players.length === 0) {
                delete rooms[roomCode];
                console.log(`[SERVER] Stanza ${roomCode} eliminata (vuota).`);
            } else {
                const remainingPlayerId = room.players[0];
                io.to(remainingPlayerId).emit('opponentDisconnected', 'L\'avversario si è disconnesso. La partita è terminata.');
                delete rooms[roomCode];
                console.log(`[SERVER] Stanza ${roomCode} eliminata (avversario disconnesso).`);
            }
        }
    });

}); 


server.listen(PORT, () => {
    console.log(`Server Socket.io in ascolto sulla porta ${PORT}`);
    console.log(`Accessibile su http://localhost:${PORT}`);
});