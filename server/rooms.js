/**
 * rooms.js v6 — normal + duel modes
 */
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function createRoom(hostId, hostName, range, timerSeconds, mode) {
  range        = range        || { min:1, max:1000 };
  timerSeconds = timerSeconds || 60;
  mode         = mode         || 'normal';
  const code = generateRoomCode();
  const base = {
    code, hostId, mode,
    players:      [{ id: hostId, name: hostName }],
    scores:       { [hostId]: 0 },
    range, timerSeconds,
    chatMessages: [],
    timerEnd:     null,
    state:        'lobby',
  };
  const extra = mode === 'duel' ? {
    duelState: null, secrets: {}, pickedBy: {},
    duelGuessHistory: {}, duelTurnId: null, duelWinnerId: null, round: 0,
  } : {
    round: 0, pickerIndex: 0, secretNumber: null, guessHistory: [], roundWinnerId: null,
  };
  const room = Object.assign({}, base, extra);
  rooms.set(code, room);
  return room;
}

function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code.toUpperCase());
  if (!room)                                         return { error: 'Room not found.' };
  if (room.state !== 'lobby')                        return { error: 'Game already in progress.' };
  if (room.players.some(function(p){return p.id===playerId;})) return { room: room, error: null };
  const max = room.mode === 'duel' ? 2 : 6;
  if (room.players.length >= max)
    return { error: room.mode === 'duel' ? 'Duel room is full (max 2).' : 'Room is full (max 6).' };
  room.players.push({ id: playerId, name: playerName });
  room.scores[playerId] = 0;
  return { room: room, error: null };
}

function getRoom(code) { return rooms.get(code); }

function getRoomByPlayerId(pid) {
  for (const r of rooms.values()) {
    if (r.players.some(function(p){return p.id===pid;})) return r;
  }
  return null;
}

function removePlayer(playerId) {
  const room = getRoomByPlayerId(playerId);
  if (!room) return null;
  room.players = room.players.filter(function(p){return p.id!==playerId;});
  delete room.scores[playerId];
  if (room.players.length === 0) { rooms.delete(room.code); return null; }
  if (room.hostId === playerId)  room.hostId = room.players[0].id;
  if (room.pickerIndex !== undefined && room.pickerIndex >= room.players.length) room.pickerIndex = 0;
  return room;
}

function publicRoom(room) {
  const safe = Object.assign({}, room);
  delete safe.secretNumber;
  delete safe.secrets;
  return safe;
}

module.exports = { createRoom, joinRoom, getRoom, getRoomByPlayerId, removePlayer, publicRoom };
