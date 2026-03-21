/**
 * rooms.js
 * In-memory room store and management utilities.
 * Each room holds all state needed to run a multiplayer game session.
 *
 * Room shape:
 * {
 *   code: string,           // 6-char alphanumeric join code
 *   hostId: string,         // socket.id of the room creator
 *   players: [              // ordered list of players
 *     { id, name, isReady }
 *   ],
 *   scores: { [id]: number }, // win counts
 *   state: 'lobby' | 'picking' | 'guessing' | 'roundEnd',
 *   round: number,
 *   pickerIndex: number,    // index into players[]
 *   secretNumber: number | null,
 *   range: { min, max },
 *   guessHistory: [         // log of all guesses this round
 *     { playerId, playerName, guess, hint, timestamp }
 *   ],
 *   roundWinnerId: string | null,
 *   timerEnd: number | null, // epoch ms when turn timer expires (optional)
 * }
 */

const rooms = new Map();

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Generates a random 6-character uppercase room code. */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Retry if collision (extremely unlikely)
  return rooms.has(code) ? generateRoomCode() : code;
}

// ------------------------------------------------------------------
// CRUD
// ------------------------------------------------------------------

/**
 * Creates a new room and returns it.
 * @param {string} hostId   - socket.id of creator
 * @param {string} hostName - display name of creator
 * @param {{ min: number, max: number }} range - guess range
 * @param {number} timerSeconds - 0 = no timer, otherwise seconds per turn
 */
function createRoom(hostId, hostName, range = { min: 1, max: 1000 }, timerSeconds = 60) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    players: [{ id: hostId, name: hostName, isReady: false }],
    scores: { [hostId]: 0 },
    state: 'lobby',
    round: 0,
    pickerIndex: 0,
    secretNumber: null,
    range,
    timerSeconds,   // stored so all clients know the setting
    guessHistory: [],
    chatMessages: [], // chat log
    roundWinnerId: null,
    timerEnd: null,
  };
  rooms.set(code, room);
  return room;
}

/**
 * Adds a player to an existing room.
 * Returns { room, error }.
 */
function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code.toUpperCase());
  if (!room)                         return { error: 'Room not found.' };
  if (room.state !== 'lobby')        return { error: 'Game already in progress.' };
  if (room.players.length >= 6)      return { error: 'Room is full (max 6 players).' };
  if (room.players.some(p => p.id === playerId)) return { room, error: null }; // reconnect

  room.players.push({ id: playerId, name: playerName, isReady: false });
  room.scores[playerId] = 0;
  return { room, error: null };
}

/** Returns a room by code, or undefined. */
function getRoom(code) {
  return rooms.get(code);
}

/** Returns the room a socket currently belongs to (linear scan). */
function getRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === playerId)) return room;
  }
  return null;
}

/**
 * Removes a player from their room.
 * Deletes the room if empty; promotes a new host if needed.
 * Returns the mutated room (or null if deleted).
 */
function removePlayer(playerId) {
  const room = getRoomByPlayerId(playerId);
  if (!room) return null;

  room.players = room.players.filter(p => p.id !== playerId);
  delete room.scores[playerId];

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return null;
  }

  // Promote new host if host left
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }

  // Adjust picker index if needed
  if (room.pickerIndex >= room.players.length) {
    room.pickerIndex = 0;
  }

  return room;
}

/** Returns a sanitized room view safe to send to clients (no secretNumber). */
function publicRoom(room) {
  const { secretNumber, ...safe } = room; // eslint-disable-line no-unused-vars
  return safe;
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  getRoomByPlayerId,
  removePlayer,
  publicRoom,
};
