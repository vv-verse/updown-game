/**
 * server.js v6 — normal multiplayer + 1v1 duel mode + WebRTC voice
 */
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { createRoom, joinRoom, getRoom, getRoomByPlayerId, removePlayer, publicRoom } = require('./rooms');
const { evaluateGuess, getNextPickerIndex, initializeScores } = require('./gameLogic');

const app    = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(server, {
  cors: { origin:[FRONTEND_URL,'http://localhost:3000','http://localhost:5173'], methods:['GET','POST'] },
});
app.use(cors());
app.use(express.json());
app.get('/health', function(_, res){ res.json({ status:'ok', timestamp:Date.now() }); });

function broadcastRoom(roomCode, event, extra) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit(event, Object.assign({ room: publicRoom(room) }, extra || {}));
}

const roomTimers = new Map();

function startTurnTimer(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.timerSeconds) return;
  clearTurnTimer(roomCode);
  room.timerEnd = Date.now() + room.timerSeconds * 1000;
  const handle = setTimeout(function() {
    const r = getRoom(roomCode);
    if (!r) return;
    if (r.mode === 'normal' && r.state === 'guessing') {
      r.state = 'roundEnd'; r.roundWinnerId = null;
      io.to(roomCode).emit('timeUp', { room: publicRoom(r) });
    } else if (r.mode === 'duel' && r.duelState === 'guessing') {
      const other = r.players.find(function(p){ return p.id !== r.duelTurnId; });
      if (other) { r.duelTurnId = other.id; r.timerEnd = null; }
      broadcastRoom(roomCode, 'duelTurnSkipped');
      startTurnTimer(roomCode);
    }
  }, room.timerSeconds * 1000);
  roomTimers.set(roomCode, handle);
}

function clearTurnTimer(roomCode) {
  if (roomTimers.has(roomCode)) { clearTimeout(roomTimers.get(roomCode)); roomTimers.delete(roomCode); }
}

io.on('connection', function(socket) {
  console.log('[connect]', socket.id);

  // CREATE ROOM
  socket.on('createRoom', function(data) {
    try {
      var playerName   = data.playerName;
      var range        = data.range;
      var timerSeconds = data.timerSeconds;
      var mode         = data.mode;
      if (!playerName || !playerName.trim()) return socket.emit('error', { message:'Player name is required.' });
      var safeRange = {
        min: Math.max(1, Number(range && range.min) || 1),
        max: Math.min(10000, Number(range && range.max) || 1000),
      };
      if (safeRange.min >= safeRange.max) return socket.emit('error', { message:'Invalid range.' });
      var safeSecs = Math.min(600, Math.max(0, Number(timerSeconds) || 0));
      var safeMode = mode === 'duel' ? 'duel' : 'normal';
      var room = createRoom(socket.id, playerName.trim(), safeRange, safeSecs, safeMode);
      socket.join(room.code);
      socket.emit('roomCreated', { room: publicRoom(room) });
      console.log('[createRoom]', playerName, '->', room.code, 'mode='+safeMode);
    } catch(e) { console.error('[createRoom]',e); socket.emit('error',{message:'Failed to create room.'}); }
  });

  // JOIN ROOM
  socket.on('joinRoom', function(data) {
    try {
      var roomCode = data.roomCode; var playerName = data.playerName;
      if (!playerName || !playerName.trim()) return socket.emit('error',{message:'Player name is required.'});
      if (!roomCode   || !roomCode.trim())   return socket.emit('error',{message:'Room code is required.'});
      var result = joinRoom(roomCode.trim(), socket.id, playerName.trim());
      if (result.error) return socket.emit('error',{message:result.error});
      socket.join(result.room.code);
      socket.emit('roomJoined',  { room: publicRoom(result.room) });
      socket.to(result.room.code).emit('playerJoined', { room: publicRoom(result.room) });
    } catch(e) { console.error('[joinRoom]',e); socket.emit('error',{message:'Failed to join room.'}); }
  });

  // START GAME
  socket.on('startGame', function(data) {
    try {
      var roomCode = data.roomCode;
      var room = getRoom(roomCode);
      if (!room)                     return socket.emit('error',{message:'Room not found.'});
      if (room.hostId !== socket.id) return socket.emit('error',{message:'Only the host can start.'});
      if (room.state !== 'lobby')    return socket.emit('error',{message:'Game already started.'});

      if (room.mode === 'duel') {
        if (room.players.length !== 2) return socket.emit('error',{message:'Duel requires exactly 2 players.'});
        room.state = 'game'; room.duelState = 'picking'; room.round = 1;
        room.scores = initializeScores(room.players.map(function(p){return p.id;}));
        room.secrets = {}; room.pickedBy = {};
        room.duelGuessHistory = {};
        room.players.forEach(function(p){ room.duelGuessHistory[p.id] = []; });
        room.duelTurnId = null; room.duelWinnerId = null;
        broadcastRoom(roomCode, 'duelStarted');
        broadcastRoom(roomCode, 'duelWaitingPick');
      } else {
        if (room.players.length < 2) return socket.emit('error',{message:'Need at least 2 players.'});
        room.state = 'picking'; room.round = 1; room.pickerIndex = 0;
        room.scores = initializeScores(room.players.map(function(p){return p.id;}));
        room.guessHistory = []; room.roundWinnerId = null;
        broadcastRoom(roomCode, 'gameStarted');
        broadcastRoom(roomCode, 'waitingForPick');
      }
    } catch(e) { console.error('[startGame]',e); socket.emit('error',{message:'Failed to start game.'}); }
  });

  // NORMAL: PICK NUMBER
  socket.on('pickNumber', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room || room.mode !== 'normal') return socket.emit('error',{message:'Room not found.'});
      if (room.state !== 'picking')         return socket.emit('error',{message:'Not the picking phase.'});
      var picker = room.players[room.pickerIndex];
      if (!picker || picker.id !== socket.id) return socket.emit('error',{message:'Not your turn to pick.'});
      var num = Number(data.number);
      if (isNaN(num)||num<room.range.min||num>room.range.max)
        return socket.emit('error',{message:'Number out of range.'});
      room.secretNumber = Math.round(num); room.state = 'guessing';
      room.guessHistory = []; room.roundWinnerId = null;
      startTurnTimer(data.roomCode);
      broadcastRoom(data.roomCode, 'numberPicked');
    } catch(e) { console.error('[pickNumber]',e); socket.emit('error',{message:'Failed.'}); }
  });

  // NORMAL: GUESS NUMBER
  socket.on('guessNumber', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room || room.mode !== 'normal') return socket.emit('error',{message:'Room not found.'});
      if (room.state !== 'guessing')        return socket.emit('error',{message:'Not guessing phase.'});
      var picker = room.players[room.pickerIndex];
      if (picker.id === socket.id) return socket.emit('error',{message:'Picker cannot guess.'});
      var player = room.players.find(function(p){return p.id===socket.id;});
      if (!player) return socket.emit('error',{message:'Player not found.'});
      var num = Number(data.guess);
      if (isNaN(num)||num<room.range.min||num>room.range.max)
        return socket.emit('error',{message:'Guess out of range.'});
      var hint = evaluateGuess(room.secretNumber, Math.round(num));
      var entry = { playerId:player.id, playerName:player.name, guess:Math.round(num), hint:hint, timestamp:Date.now() };
      room.guessHistory.push(entry);
      if (hint === 'CORRECT') {
        clearTurnTimer(data.roomCode);
        room.state = 'roundEnd'; room.roundWinnerId = player.id;
        room.scores[player.id] = (room.scores[player.id]||0) + 1;
        io.to(data.roomCode).emit('hint',     Object.assign({}, entry, { room: publicRoom(room) }));
        io.to(data.roomCode).emit('roundWon', { winnerId:player.id, winnerName:player.name, secretNumber:room.secretNumber, room:publicRoom(room) });
      } else {
        io.to(data.roomCode).emit('hint', Object.assign({}, entry, { room: publicRoom(room) }));
      }
    } catch(e) { console.error('[guessNumber]',e); socket.emit('error',{message:'Failed.'}); }
  });

  // NEXT ROUND (normal + duel)
  socket.on('nextRound', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room)                     return socket.emit('error',{message:'Room not found.'});
      if (room.hostId !== socket.id) return socket.emit('error',{message:'Only host can advance.'});
      if (room.mode === 'normal') {
        if (room.state !== 'roundEnd') return socket.emit('error',{message:'Round not over.'});
        room.round += 1;
        room.pickerIndex = getNextPickerIndex(room.pickerIndex, room.players.length);
        room.state = 'picking'; room.secretNumber = null;
        room.guessHistory = []; room.roundWinnerId = null; room.timerEnd = null;
        broadcastRoom(data.roomCode, 'nextRound');
        broadcastRoom(data.roomCode, 'waitingForPick');
      } else {
        if (room.duelState !== 'end') return socket.emit('error',{message:'Round not over.'});
        room.round += 1; room.duelState = 'picking';
        room.secrets = {}; room.pickedBy = {};
        room.duelGuessHistory = {};
        room.players.forEach(function(p){ room.duelGuessHistory[p.id] = []; });
        room.duelTurnId = null; room.duelWinnerId = null; room.timerEnd = null;
        broadcastRoom(data.roomCode, 'nextRound');
        broadcastRoom(data.roomCode, 'duelWaitingPick');
      }
    } catch(e) { console.error('[nextRound]',e); socket.emit('error',{message:'Failed.'}); }
  });

  // DUEL: PICK NUMBER
  socket.on('duelPick', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room || room.mode !== 'duel') return socket.emit('error',{message:'Not a duel room.'});
      if (room.duelState !== 'picking')   return socket.emit('error',{message:'Not picking phase.'});
      if (room.pickedBy[socket.id])       return socket.emit('error',{message:'Already picked.'});
      var num = Math.round(Number(data.number));
      if (isNaN(num)||num<room.range.min||num>room.range.max)
        return socket.emit('error',{message:'Number out of range.'});
      room.secrets[socket.id]  = num;
      room.pickedBy[socket.id] = true;
      socket.emit('duelPickConfirmed', { room: publicRoom(room) });
      var p0 = room.players[0]; var p1 = room.players[1];
      if (room.pickedBy[p0.id] && room.pickedBy[p1.id]) {
        room.duelState = 'guessing';
        // Alternate who goes first each round — odd round = p0, even round = p1
        room.duelTurnId = (room.round % 2 === 1) ? p0.id : p1.id;
        startTurnTimer(data.roomCode);
        broadcastRoom(data.roomCode, 'duelBothPicked');
      } else {
        broadcastRoom(data.roomCode, 'duelOnePicked');
      }
    } catch(e) { console.error('[duelPick]',e); socket.emit('error',{message:'Failed.'}); }
  });

  // DUEL: GUESS NUMBER
  socket.on('duelGuess', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room || room.mode !== 'duel')  return socket.emit('error',{message:'Not a duel room.'});
      if (room.duelState !== 'guessing')   return socket.emit('error',{message:'Not guessing phase.'});
      if (room.duelTurnId !== socket.id)   return socket.emit('error',{message:"Not your turn."});
      var player   = room.players.find(function(p){return p.id===socket.id;});
      var opponent = room.players.find(function(p){return p.id!==socket.id;});
      if (!player||!opponent) return socket.emit('error',{message:'Player error.'});
      var num = Math.round(Number(data.guess));
      if (isNaN(num)||num<room.range.min||num>room.range.max)
        return socket.emit('error',{message:'Guess out of range.'});
      var hint = evaluateGuess(room.secrets[opponent.id], num);
      var entry = { guess:num, hint:hint, timestamp:Date.now() };
      room.duelGuessHistory[socket.id].push(entry);

      if (hint === 'CORRECT') {
        clearTurnTimer(data.roomCode);
        room.duelState    = 'end';
        room.duelWinnerId = socket.id;
        room.scores[socket.id] = (room.scores[socket.id]||0) + 1;
        socket.emit('duelHint', { guess:num, hint:hint, myHistory:room.duelGuessHistory[socket.id], room:publicRoom(room) });
        io.to(data.roomCode).emit('duelWon', {
          winnerId:   socket.id,
          winnerName: player.name,
          secrets:    Object.assign({}, room.secrets),
          room:       publicRoom(room),
        });
      } else {
        socket.emit('duelHint', { guess:num, hint:hint, myHistory:room.duelGuessHistory[socket.id], room:publicRoom(room) });
        io.to(opponent.id).emit('duelOpponentGuessed', {
          opponentGuessCount: room.duelGuessHistory[socket.id].length,
          room: publicRoom(room),
        });
        clearTurnTimer(data.roomCode);
        room.duelTurnId = opponent.id; room.timerEnd = null;
        startTurnTimer(data.roomCode);
        broadcastRoom(data.roomCode, 'duelTurnChange');
      }
    } catch(e) { console.error('[duelGuess]',e); socket.emit('error',{message:'Failed.'}); }
  });

  // CHAT
  socket.on('sendChat', function(data) {
    try {
      var room = getRoom(data.roomCode);
      if (!room) return;
      var player = room.players.find(function(p){return p.id===socket.id;});
      if (!player) return;
      var msg = String(data.message||'').trim().slice(0,200);
      if (!msg) return;
      var chatMsg = { id:Date.now()+'-'+Math.random().toString(36).slice(2,7), playerId:player.id, playerName:player.name, message:msg, timestamp:Date.now() };
      room.chatMessages = room.chatMessages||[];
      room.chatMessages.push(chatMsg);
      if (room.chatMessages.length>100) room.chatMessages.shift();
      io.to(data.roomCode).emit('chatMessage', chatMsg);
    } catch(e) { console.error('[sendChat]',e); }
  });

  // WEBRTC SIGNALING
  socket.on('voice-joined',  function(d){ var r=getRoom(d.roomCode); if(!r)return; var p=r.players.find(function(x){return x.id===socket.id;}); if(!p)return; socket.to(d.roomCode).emit('voice-joined',{fromId:socket.id,playerName:p.name}); });
  socket.on('voice-left',    function(d){ socket.to(d.roomCode).emit('voice-left',   {fromId:socket.id}); });
  socket.on('signal-offer',  function(d){ io.to(d.toId).emit('signal-offer',  {fromId:socket.id,offer:d.offer}); });
  socket.on('signal-answer', function(d){ io.to(d.toId).emit('signal-answer', {fromId:socket.id,answer:d.answer}); });
  socket.on('signal-ice',    function(d){ io.to(d.toId).emit('signal-ice',    {fromId:socket.id,candidate:d.candidate}); });

  // DISCONNECT
  socket.on('disconnect', function() {
    var room = getRoomByPlayerId(socket.id);
    if (!room) return;
    var code = room.code;
    socket.to(code).emit('voice-left', {fromId:socket.id});
    var updated = removePlayer(socket.id);
    if (!updated) { clearTurnTimer(code); return; }
    if (updated.players.length < 2 && updated.state !== 'lobby') {
      updated.state = 'lobby'; clearTurnTimer(code);
    }
    io.to(code).emit('playerLeft', { room: publicRoom(updated) });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, function() {
  console.log('\n🚀 UP DOWN Game Server running on port', PORT);
  console.log('   Health: http://localhost:'+PORT+'/health\n');
});
