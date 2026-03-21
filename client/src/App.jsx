/**
 * App.jsx
 * Root component. Manages which "page" is shown and holds global socket state.
 * Views: 'home' → 'lobby' → 'game'
 */
import { useState, useEffect, useCallback } from 'react';
import socket from './socket';
import Home     from './Home.jsx';
import Lobby    from './Lobby.jsx';
import GameRoom from './GameRoom.jsx';
import { sounds } from './sounds.js';

export default function App() {
  const [view,      setView]      = useState('home');   // 'home' | 'lobby' | 'game'
  const [room,      setRoom]      = useState(null);     // current room state
  const [myName,    setMyName]    = useState('');
  const [error,     setError]     = useState('');
  const [connected, setConnected] = useState(socket.connected);

  // ── Connection status ───────────────────────────────────────────
  useEffect(() => {
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  // ── Global socket listeners ─────────────────────────────────────
  useEffect(() => {
    // Error from server
    const onError = ({ message }) => {
      setError(message);
      sounds.error();
      setTimeout(() => setError(''), 4000);
    };

    // Room created (I'm the host)
    const onRoomCreated = ({ room }) => {
      setRoom(room);
      setView('lobby');
      sounds.join();
    };

    // Joined an existing room
    const onRoomJoined = ({ room }) => {
      setRoom(room);
      setView('lobby');
      sounds.join();
    };

    // Someone else joined
    const onPlayerJoined = ({ room }) => {
      setRoom(room);
      sounds.join();
    };

    // Someone left
    const onPlayerLeft = ({ room }) => {
      setRoom(room);
      // If game is now back to lobby (< 2 players), return to lobby view
      if (room.state === 'lobby') setView('lobby');
    };

    // Game started
    const onGameStarted = ({ room }) => {
      setRoom(room);
      setView('game');
      sounds.start();
    };

    socket.on('error',        onError);
    socket.on('roomCreated',  onRoomCreated);
    socket.on('roomJoined',   onRoomJoined);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerLeft',   onPlayerLeft);
    socket.on('gameStarted',  onGameStarted);

    return () => {
      socket.off('error',        onError);
      socket.off('roomCreated',  onRoomCreated);
      socket.off('roomJoined',   onRoomJoined);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerLeft',   onPlayerLeft);
      socket.off('gameStarted',  onGameStarted);
    };
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Connection banner */}
      {!connected && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-danger text-paper text-center py-2 font-mono text-sm tracking-widest">
          ⚠ RECONNECTING TO SERVER…
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-danger/90 text-paper
                     font-mono px-6 py-3 border border-danger animate-slide-up cursor-pointer
                     max-w-sm text-center text-sm tracking-wide"
          onClick={clearError}
        >
          ⚡ {error}
        </div>
      )}

      {view === 'home' && (
        <Home
          myName={myName}
          setMyName={setMyName}
        />
      )}
      {view === 'lobby' && room && (
        <Lobby
          room={room}
          setRoom={setRoom}
          myId={socket.id}
          myName={myName}
        />
      )}
      {view === 'game' && room && (
        <GameRoom
          room={room}
          setRoom={setRoom}
          myId={socket.id}
          myName={myName}
          onBackToLobby={() => setView('lobby')}
        />
      )}
    </div>
  );
}
