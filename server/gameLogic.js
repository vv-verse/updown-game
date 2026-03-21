/**
 * gameLogic.js
 * Core game logic: secret number management, guess evaluation, winner detection.
 * The server is the single source of truth — clients never see the secret number.
 */

/**
 * Generates a random integer between min and max (inclusive).
 */
function generateSecretNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Evaluates a player's guess against the secret number.
 * Returns: 'UP' | 'DOWN' | 'CORRECT'
 *   UP   → secret is greater than guess (player should guess higher)
 *   DOWN → secret is less than guess    (player should guess lower)
 */
function evaluateGuess(secretNumber, guess) {
  if (guess === secretNumber) return 'CORRECT';
  if (secretNumber > guess)   return 'UP';
  return 'DOWN';
}

/**
 * Determines the next picker index using round-robin rotation.
 * Wraps around when reaching the end of the player list.
 */
function getNextPickerIndex(currentIndex, totalPlayers) {
  return (currentIndex + 1) % totalPlayers;
}

/**
 * Builds the initial scoreboard from a list of player IDs.
 * Each player starts with 0 wins.
 */
function initializeScores(playerIds) {
  const scores = {};
  playerIds.forEach(id => { scores[id] = 0; });
  return scores;
}

module.exports = {
  generateSecretNumber,
  evaluateGuess,
  getNextPickerIndex,
  initializeScores,
};
