/**
 * App.jsx v5 — voiceEnabled state lives here, passed to Home + GameRoom
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import socket from './socket';
import Home     from './Home.jsx';
import Lobby    from './Lobby.jsx';
import GameRoom from './GameRoom.jsx';
import { sounds } from './sounds.js';

export default function App() {
  const [view,         setView]         = useState('home');
  const [room,         setRoom]         = useState(null);
  const [myName,       setMyName]       = useState('');
  const [myId,         setMyId]         = useState('');
  const [error,        setError]        = useState('');
  const [connected,    setConnected]    = useState(socket.connected);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // user opt-in on home page

  const roomCodeRef = useRef('');

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setMyId(socket.id);
      if (roomCodeRef.current && myName) {
        socket.emit('joinRoom', { roomCode: roomCodeRef.current, playerName: myName });
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setMyId(socket.id);
    return () => {
      socket.off('connect',    onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [myName]);

  useEffect(() => {
    const onError = ({ message }) => {
      setError(message);
      sounds.error();
      setTimeout(() => setError(''), 4000);
    };
    const onRoomCreated = ({ room }) => {
      roomCodeRef.current = room.code;
      setRoom(room); setView('lobby'); sounds.join();
    };
    const onRoomJoined = ({ room }) => {
      roomCodeRef.current = room.code;
      setRoom(room);
      if (room.state !== 'lobby') setView('game');
      else setView('lobby');
      sounds.join();
    };
    const onPlayerJoined = ({ room }) => { setRoom(room); sounds.join(); };
    const onPlayerLeft   = ({ room }) => { setRoom(room); if (room.state === 'lobby') setView('lobby'); };
    const onGameStarted  = ({ room }) => { setRoom(room); setView('game'); sounds.start(); };

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

  const clearError  = useCallback(() => setError(''), []);
  const effectiveId = myId || socket.id;

  return (
    <div className="min-h-screen flex flex-col">
      {!connected && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-danger text-paper text-center py-2 font-mono text-sm tracking-widest">
          ⚠ RECONNECTING…
        </div>
      )}
      {error && (
        <div onClick={clearError}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-danger/90 text-paper
                     font-mono px-6 py-3 border border-danger animate-slide-up cursor-pointer
                     max-w-xs w-11/12 text-center text-sm tracking-wide">
          ⚡ {error}
        </div>
      )}

      {view === 'home' && (
        <Home
          myName={myName} setMyName={setMyName}
          voiceEnabled={voiceEnabled} setVoiceEnabled={setVoiceEnabled}
        />
      )}
      {view === 'lobby' && room && (
        <Lobby room={room} setRoom={setRoom} myId={effectiveId} roomCodeRef={roomCodeRef} />
      )}
      {view === 'game' && room && (
        <GameRoom
          room={room} setRoom={setRoom}
          myId={effectiveId} roomCodeRef={roomCodeRef}
          voiceEnabled={voiceEnabled}
        />
      )}
    </div>
  );
}
