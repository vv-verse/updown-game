function evaluateGuess(secretNumber, guess) {
  if (guess === secretNumber) return 'CORRECT';
  if (secretNumber > guess)   return 'UP';
  return 'DOWN';
}
function getNextPickerIndex(currentIndex, totalPlayers) {
  return (currentIndex + 1) % totalPlayers;
}
function initializeScores(playerIds) {
  const scores = {};
  playerIds.forEach(id => { scores[id] = 0; });
  return scores;
}
module.exports = { evaluateGuess, getNextPickerIndex, initializeScores };
