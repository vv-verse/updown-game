/**
 * server.js v2 — configurable per-room timer + chat
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const {
  createRoom, joinRoom, getRoom,
  getRoomByPlayerId, removePlayer, publicRoom,
} = require('./rooms');

const {
  evaluateGuess, getNextPickerIndex, initializeScores,
} = require('./gameLogic');

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
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: Date.now() }));

function broadcastRoom(roomCode, event, extra = {}) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit(event, { room: publicRoom(room), ...extra });
}

// Per-room timers
const roomTimers = new Map();

function startTurnTimer(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.timerSeconds) return;
  clearTurnTimer(roomCode);
  room.timerEnd = Date.now() + room.timerSeconds * 1000;
  const handle = setTimeout(() => {
    const r = getRoom(roomCode);
    if (!r || r.state !== 'guessing') return;
    r.state = 'roundEnd';
    r.roundWinnerId = null;
    io.to(roomCode).emit('timeUp', { room: publicRoom(r) });
  }, room.timerSeconds * 1000);
  roomTimers.set(roomCode, handle);
}

function clearTurnTimer(roomCode) {
  if (roomTimers.has(roomCode)) {
    clearTimeout(roomTimers.get(roomCode));
    roomTimers.delete(roomCode);
  }
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('createRoom', ({ playerName, range, timerSeconds }) => {
    try {
      if (!playerName?.trim()) return socket.emit('error', { message: 'Player name is required.' });
      const safeRange = {
        min: Math.max(1, Number(range?.min) || 1),
        max: Math.min(10000, Number(range?.max) || 1000),
      };
      if (safeRange.min >= safeRange.max)
        return socket.emit('error', { message: 'Invalid range: min must be less than max.' });
      const safeSecs = Math.min(600, Math.max(0, Number(timerSeconds) || 0));
      const room = createRoom(socket.id, playerName.trim(), safeRange, safeSecs);
      socket.join(room.code);
      socket.emit('roomCreated', { room: publicRoom(room) });
      console.log(`[createRoom] ${playerName} -> ${room.code} timer=${safeSecs}s`);
    } catch (err) {
      console.error('[createRoom]', err);
      socket.emit('error', { message: 'Failed to create room.' });
    }
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    try {
      if (!playerName?.trim()) return socket.emit('error', { message: 'Player name is required.' });
      if (!roomCode?.trim())   return socket.emit('error', { message: 'Room code is required.' });
      const { room, error } = joinRoom(roomCode.trim(), socket.id, playerName.trim());
      if (error) return socket.emit('error', { message: error });
      socket.join(room.code);
      socket.emit('roomJoined', { room: publicRoom(room) });
      socket.to(room.code).emit('playerJoined', { room: publicRoom(room) });
      console.log(`[joinRoom] ${playerName} -> ${room.code}`);
    } catch (err) {
      console.error('[joinRoom]', err);
      socket.emit('error', { message: 'Failed to join room.' });
    }
  });

  socket.on('startGame', ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                     return socket.emit('error', { message: 'Room not found.' });
      if (room.hostId !== socket.id) return socket.emit('error', { message: 'Only the host can start.' });
      if (room.players.length < 2)   return socket.emit('error', { message: 'Need at least 2 players.' });
      if (room.state !== 'lobby')    return socket.emit('error', { message: 'Game already started.' });
      room.state = 'picking';
      room.round = 1;
      room.pickerIndex = 0;
      room.scores = initializeScores(room.players.map(p => p.id));
      room.guessHistory = [];
      room.roundWinnerId = null;
      broadcastRoom(roomCode, 'gameStarted');
      broadcastRoom(roomCode, 'waitingForPick');
    } catch (err) {
      console.error('[startGame]', err);
      socket.emit('error', { message: 'Failed to start game.' });
    }
  });

  socket.on('pickNumber', ({ roomCode, number }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                    return socket.emit('error', { message: 'Room not found.' });
      if (room.state !== 'picking') return socket.emit('error', { message: 'Not the picking phase.' });
      const picker = room.players[room.pickerIndex];
      if (!picker || picker.id !== socket.id)
        return socket.emit('error', { message: 'You are not the picker this round.' });
      const num = Number(number);
      if (isNaN(num) || num < room.range.min || num > room.range.max)
        return socket.emit('error', { message: `Number must be between ${room.range.min} and ${room.range.max}.` });
      room.secretNumber = Math.round(num);
      room.state = 'guessing';
      room.guessHistory = [];
      room.roundWinnerId = null;
      startTurnTimer(roomCode);
      broadcastRoom(roomCode, 'numberPicked');
    } catch (err) {
      console.error('[pickNumber]', err);
      socket.emit('error', { message: 'Failed to set number.' });
    }
  });

  socket.on('guessNumber', ({ roomCode, guess }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                     return socket.emit('error', { message: 'Room not found.' });
      if (room.state !== 'guessing') return socket.emit('error', { message: 'Not the guessing phase.' });
      const picker = room.players[room.pickerIndex];
      if (picker.id === socket.id)   return socket.emit('error', { message: 'The picker cannot guess.' });
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return socket.emit('error', { message: 'Player not found.' });
      const num = Number(guess);
      if (isNaN(num) || num < room.range.min || num > room.range.max)
        return socket.emit('error', { message: `Guess must be between ${room.range.min} and ${room.range.max}.` });
      const hint = evaluateGuess(room.secretNumber, Math.round(num));
      const entry = { playerId: player.id, playerName: player.name, guess: Math.round(num), hint, timestamp: Date.now() };
      room.guessHistory.push(entry);
      if (hint === 'CORRECT') {
        clearTurnTimer(roomCode);
        room.state = 'roundEnd';
        room.roundWinnerId = player.id;
        room.scores[player.id] = (room.scores[player.id] || 0) + 1;
        io.to(roomCode).emit('hint', { ...entry, room: publicRoom(room) });
        io.to(roomCode).emit('roundWon', { winnerId: player.id, winnerName: player.name, secretNumber: room.secretNumber, room: publicRoom(room) });
      } else {
        io.to(roomCode).emit('hint', { ...entry, room: publicRoom(room) });
      }
    } catch (err) {
      console.error('[guessNumber]', err);
      socket.emit('error', { message: 'Failed to process guess.' });
    }
  });

  socket.on('nextRound', ({ roomCode }) => {
    try {
      const room = getRoom(roomCode);
      if (!room)                     return socket.emit('error', { message: 'Room not found.' });
      if (room.hostId !== socket.id) return socket.emit('error', { message: 'Only the host can advance.' });
      if (room.state !== 'roundEnd') return socket.emit('error', { message: 'Round is not over yet.' });
      room.round += 1;
      room.pickerIndex = getNextPickerIndex(room.pickerIndex, room.players.length);
      room.state = 'picking';
      room.secretNumber = null;
      room.guessHistory = [];
      room.roundWinnerId = null;
      room.timerEnd = null;
      broadcastRoom(roomCode, 'nextRound');
      broadcastRoom(roomCode, 'waitingForPick');
    } catch (err) {
      console.error('[nextRound]', err);
      socket.emit('error', { message: 'Failed to advance round.' });
    }
  });

  // Chat
  socket.on('sendChat', ({ roomCode, message }) => {
    try {
      const room = getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      const trimmed = String(message || '').trim().slice(0, 200);
      if (!trimmed) return;
      const chatMsg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        playerId: player.id,
        playerName: player.name,
        message: trimmed,
        timestamp: Date.now(),
      };
      room.chatMessages = room.chatMessages || [];
      room.chatMessages.push(chatMsg);
      if (room.chatMessages.length > 100) room.chatMessages.shift();
      io.to(roomCode).emit('chatMessage', chatMsg);
    } catch (err) {
      console.error('[sendChat]', err);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const room = getRoomByPlayerId(socket.id);
    if (!room) return;
    const roomCode = room.code;
    const updatedRoom = removePlayer(socket.id);
    if (!updatedRoom) { clearTurnTimer(roomCode); return; }
    if (updatedRoom.state === 'picking' || updatedRoom.state === 'guessing') {
      if (updatedRoom.pickerIndex >= updatedRoom.players.length) updatedRoom.pickerIndex = 0;
      if (updatedRoom.players.length < 2) { updatedRoom.state = 'lobby'; clearTurnTimer(roomCode); }
    }
    io.to(roomCode).emit('playerLeft', { room: publicRoom(updatedRoom) });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 UP DOWN Game Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
