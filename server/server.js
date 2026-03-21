/**
 * server.js
 * Express + Socket.io server for UP DOWN Number Guess Game.
 *
 * Socket events (client → server):
 *   createRoom   { playerName, range }         → roomCreated | error
 *   joinRoom     { roomCode, playerName }       → roomJoined | error
 *   startGame    { roomCode }                   → gameStarted | error
 *   pickNumber   { roomCode, number }           → numberPicked | error
 *   guessNumber  { roomCode, guess }            → hint | roundWon
 *   nextRound    { roomCode }                   → nextRound (host only)
 *   leaveRoom    (implicit on disconnect)
 *
 * Socket events (server → client):
 *   roomCreated    { room }
 *   roomJoined     { room }
 *   playerJoined   { room }
 *   playerLeft     { room }
 *   gameStarted    { room }
 *   waitingForPick { room }         → sent to all; picker sees input
 *   numberPicked   { room }         → broadcast (no number revealed)
 *   hint           { guess, hint, playerId, playerName, room }
 *   roundWon       { winnerId, winnerName, room }
 *   nextRound      { room }
 *   error          { message }
 */

const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const cors      = require('cors');

const {
  createRoom, joinRoom, getRoom,
  getRoomByPlayerId, removePlayer, publicRoom,
} = require('./rooms');

const {
  generateSecretNumber, evaluateGuess,
  getNextPickerIndex, initializeScores,
} = require('./gameLogic');

// ------------------------------------------------------------------
// Server Setup
// ------------------------------------------------------------------
const app    = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// ------------------------------------------------------------------
// Utility: emit room state to every socket in the room
// ------------------------------------------------------------------
function broadcastRoom(roomCode, event, extra = {}) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit(event, { room: publicRoom(room), ...extra });
}

// ------------------------------------------------------------------
// Timer helpers (optional per-turn countdown)
// ------------------------------------------------------------------
const roomTimers = new Map(); // roomCode → setTimeout handle

const TURN_SECONDS = 60; // seconds per turn; set 0 to disable

function startTurnTimer(roomCode) {
  if (!TURN_SECONDS) return;
  clearTurnTimer(roomCode);
  const room = getRoom(roomCode);
  if (!room) return;
  room.timerEnd = Date.now() + TURN_SECONDS * 1000;

  const handle = setTimeout(() => {
    const r = getRoom(roomCode);
    if (!r || r.state !== 'guessing') return;
    // Time's up — auto-advance round without a winner
    r.state = 'roundEnd';
    r.roundWinnerId = null;
    io.to(roomCode).emit('timeUp', { room: publicRoom(r) });
  }, TURN_SECONDS * 1000);

  roomTimers.set(roomCode, handle);
}

function clearTurnTimer(roomCode) {
  if (roomTimers.has(roomCode)) {
    clearTimeout(roomTimers.get(roomCode));
    roomTimers.delete(roomCode);
  }
}

// ------------------------------------------------------------------
// Socket.io connection handler
// ------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ----------------------------------------------------------------
  // CREATE ROOM
  // ----------------------------------------------------------------
  socket.on('createRoom', ({ playerName, range }) => {
    try {
      if (!playerName?.trim()) return socket.emit('error', { message: 'Player name is required.' });

      const safeRange = {
        min: Math.max(1,    Number(range?.min) || 1),
        max: Math.min(10000, Number(range?.max) || 1000),
      };
      if (safeRange.min >= safeRange.max) {
        return socket.emit('error', { message: 'Invalid range: min must be less than max.' });
      }

      const room = createRoom(socket.id, playerName.trim(), safeRange);
      socket.join(room.code);
      socket.emit('roomCreated', { room: publicRoom(room) });
      console.log(`[createRoom] ${playerName} created room ${room.code}`);
    } catch (err) {
      console.error('[createRoom error]', err);
      socket.emit('error', { message: 'Failed to create room.' });
    }
  });

  // ----------------------------------------------------------------
  // JOIN ROOM
  // ----------------------------------------------------------------
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    try {
      if (!playerName?.trim()) return socket.emit('error', { message: 'Player name is required.' });
      if (!roomCode?.trim())   return socket.emit('error', { message: 'Room code is required.' });

      const { room, error } = joinRoom(roomCode.trim(), socket.id, playerName.trim());
      if (error) return socket.emit('error', { message: error });

      socket.join(room.code);
      socket.emit('roomJoined', { room: publicRoom(room) });

      // Notify others in the room
      socket.to(room.code).emit('playerJoined', { room: publicRoom(room) });
      console.log(`[joinRoom] ${playerName} joined room ${room.code}`);
    } catch (err) {
      console.error('[joinRoom error]', err);
      socket.emit('error', { message: 'Failed to join room.' });
    }
  });

  // ----------------------------------------------------------------
  // START GAME (host only, min 2 players)
  // ----------------------------------------------------------------
  socket.on('startGame', ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                          return socket.emit('error', { message: 'Room not found.' });
      if (room.hostId !== socket.id)      return socket.emit('error', { message: 'Only the host can start the game.' });
      if (room.players.length < 2)        return socket.emit('error', { message: 'Need at least 2 players to start.' });
      if (room.state !== 'lobby')         return socket.emit('error', { message: 'Game already started.' });

      // Initialize game state
      room.state      = 'picking';
      room.round      = 1;
      room.pickerIndex = 0;
      room.scores     = initializeScores(room.players.map(p => p.id));
      room.guessHistory = [];
      room.roundWinnerId = null;

      broadcastRoom(roomCode, 'gameStarted');
      broadcastRoom(roomCode, 'waitingForPick');
      console.log(`[startGame] Room ${roomCode} — round 1, picker: ${room.players[0].name}`);
    } catch (err) {
      console.error('[startGame error]', err);
      socket.emit('error', { message: 'Failed to start game.' });
    }
  });

  // ----------------------------------------------------------------
  // PICK NUMBER (picker only)
  // ----------------------------------------------------------------
  socket.on('pickNumber', ({ roomCode, number }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)               return socket.emit('error', { message: 'Room not found.' });
      if (room.state !== 'picking') return socket.emit('error', { message: 'Not the picking phase.' });

      const picker = room.players[room.pickerIndex];
      if (!picker || picker.id !== socket.id)
        return socket.emit('error', { message: 'You are not the picker this round.' });

      const num = Number(number);
      if (isNaN(num) || num < room.range.min || num > room.range.max)
        return socket.emit('error', { message: `Number must be between ${room.range.min} and ${room.range.max}.` });

      // Store secret (server-side only — never sent to clients)
      room.secretNumber  = Math.round(num);
      room.state         = 'guessing';
      room.guessHistory  = [];
      room.roundWinnerId = null;

      startTurnTimer(roomCode);

      // Tell everyone that a number was picked (but not what it is)
      broadcastRoom(roomCode, 'numberPicked');
      console.log(`[pickNumber] Room ${roomCode} — secret set by ${picker.name}`);
    } catch (err) {
      console.error('[pickNumber error]', err);
      socket.emit('error', { message: 'Failed to set number.' });
    }
  });

  // ----------------------------------------------------------------
  // GUESS NUMBER (guessers only)
  // ----------------------------------------------------------------
  socket.on('guessNumber', ({ roomCode, guess }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                    return socket.emit('error', { message: 'Room not found.' });
      if (room.state !== 'guessing') return socket.emit('error', { message: 'Not the guessing phase.' });

      const picker = room.players[room.pickerIndex];
      if (picker.id === socket.id)  return socket.emit('error', { message: 'The picker cannot guess.' });

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return socket.emit('error', { message: 'Player not found in room.' });

      const num = Number(guess);
      if (isNaN(num) || num < room.range.min || num > room.range.max)
        return socket.emit('error', { message: `Guess must be between ${room.range.min} and ${room.range.max}.` });

      const hint = evaluateGuess(room.secretNumber, Math.round(num));

      // Log to guess history
      const entry = {
        playerId:   player.id,
        playerName: player.name,
        guess:      Math.round(num),
        hint,
        timestamp:  Date.now(),
      };
      room.guessHistory.push(entry);

      if (hint === 'CORRECT') {
        // Round won!
        clearTurnTimer(roomCode);
        room.state = 'roundEnd';
        room.roundWinnerId = player.id;
        room.scores[player.id] = (room.scores[player.id] || 0) + 1;

        io.to(roomCode).emit('hint', { ...entry, room: publicRoom(room) });
        io.to(roomCode).emit('roundWon', {
          winnerId:   player.id,
          winnerName: player.name,
          secretNumber: room.secretNumber, // reveal now that round is over
          room: publicRoom(room),
        });
        console.log(`[roundWon] ${player.name} guessed ${room.secretNumber} in room ${roomCode}`);
      } else {
        // Broadcast hint to everyone
        io.to(roomCode).emit('hint', { ...entry, room: publicRoom(room) });
      }
    } catch (err) {
      console.error('[guessNumber error]', err);
      socket.emit('error', { message: 'Failed to process guess.' });
    }
  });

  // ----------------------------------------------------------------
  // NEXT ROUND (host triggers)
  // ----------------------------------------------------------------
  socket.on('nextRound', ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                      return socket.emit('error', { message: 'Room not found.' });
      if (room.hostId !== socket.id)  return socket.emit('error', { message: 'Only the host can advance the round.' });
      if (room.state !== 'roundEnd')  return socket.emit('error', { message: 'Round is not over yet.' });

      room.round       += 1;
      room.pickerIndex  = getNextPickerIndex(room.pickerIndex, room.players.length);
      room.state        = 'picking';
      room.secretNumber = null;
      room.guessHistory = [];
      room.roundWinnerId = null;
      room.timerEnd     = null;

      broadcastRoom(roomCode, 'nextRound');
      broadcastRoom(roomCode, 'waitingForPick');
      console.log(`[nextRound] Room ${roomCode} — round ${room.round}, picker: ${room.players[room.pickerIndex].name}`);
    } catch (err) {
      console.error('[nextRound error]', err);
      socket.emit('error', { message: 'Failed to advance round.' });
    }
  });

  // ----------------------------------------------------------------
  // DISCONNECT — clean up player from room
  // ----------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const room = getRoomByPlayerId(socket.id);
    if (!room) return;

    const roomCode = room.code;
    const updatedRoom = removePlayer(socket.id);

    if (!updatedRoom) {
      // Room was deleted (last player left)
      clearTurnTimer(roomCode);
      return;
    }

    // If mid-game and picker left, auto-advance round
    if (updatedRoom.state === 'picking' || updatedRoom.state === 'guessing') {
      if (updatedRoom.pickerIndex >= updatedRoom.players.length) {
        updatedRoom.pickerIndex = 0;
      }
      // If only 1 player left, send back to lobby
      if (updatedRoom.players.length < 2) {
        updatedRoom.state = 'lobby';
        clearTurnTimer(roomCode);
      }
    }

    io.to(roomCode).emit('playerLeft', { room: publicRoom(updatedRoom) });
  });
});

// ------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 UP DOWN Game Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
