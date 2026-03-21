/**
 * useVoiceChat.js
 *
 * WebRTC peer-to-peer voice chat hook.
 *
 * How it works:
 *  1. When a player joins voice, they call getUserMedia to get their microphone.
 *  2. They tell the server "I'm in voice" (voice-joined event).
 *  3. The server tells all other players in the room.
 *  4. Each existing voice member creates a WebRTC PeerConnection and sends an offer.
 *  5. The new player answers each offer.
 *  6. ICE candidates are exchanged through the server as a relay.
 *  7. Once connected, audio flows directly peer-to-peer (server not involved).
 *
 * ICE server: uses Google's public STUN server (free, no config needed).
 * For production with players behind strict NAT you may want a TURN server,
 * but STUN works for 85–90% of consumer connections.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceChat(roomCodeRef, myId, players) {
  const [inVoice,    setInVoice]    = useState(false);  // am I in the voice call?
  const [muted,      setMuted]      = useState(false);  // is my mic muted?
  const [voicePeers, setVoicePeers] = useState({});     // { socketId: { name, speaking } }
  const [micError,   setMicError]   = useState('');     // e.g. "Permission denied"

  // Refs — never cause re-renders, safe to read in callbacks
  const localStreamRef = useRef(null);   // my microphone stream
  const peersRef       = useRef({});     // { socketId: RTCPeerConnection }
  const inVoiceRef     = useRef(false);  // mirror of inVoice for use in closures

  // Keep inVoiceRef in sync
  useEffect(() => { inVoiceRef.current = inVoice; }, [inVoice]);

  // ── Create a peer connection to another player ──────────────────
  const createPeer = useCallback((peerId, isInitiator) => {
    // Clean up any old connection to this peer
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add our local audio tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // When we receive the remote player's audio, play it
    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.srcObject = e.streams[0];
      audio.autoplay = true;
      // Store audio element on pc so we can clean it up later
      pc._remoteAudio = audio;
    };

    // Relay our ICE candidates through the server
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('signal-ice', { toId: peerId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(peerId);
      }
    };

    peersRef.current[peerId] = pc;

    // Initiator creates and sends the offer
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('signal-offer', {
            toId:  peerId,
            offer: pc.localDescription,
          });
        })
        .catch(console.error);
    }

    return pc;
  }, []);

  // ── Remove a peer connection cleanly ───────────────────────────
  const removePeer = useCallback((peerId) => {
    const pc = peersRef.current[peerId];
    if (pc) {
      if (pc._remoteAudio) {
        pc._remoteAudio.srcObject = null;
        pc._remoteAudio = null;
      }
      pc.close();
      delete peersRef.current[peerId];
    }
    setVoicePeers(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ── Socket signaling listeners ─────────────────────────────────
  useEffect(() => {
    // Someone else joined voice — we are the initiator, send them an offer
    const onVoiceJoined = ({ fromId, playerName }) => {
      if (!inVoiceRef.current) return;
      setVoicePeers(prev => ({ ...prev, [fromId]: { name: playerName } }));
      createPeer(fromId, true); // we initiate
    };

    // Someone left voice
    const onVoiceLeft = ({ fromId }) => {
      removePeer(fromId);
    };

    // We received an offer — answer it
    const onOffer = async ({ fromId, offer }) => {
      if (!inVoiceRef.current) return;
      const pc = createPeer(fromId, false); // we answer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal-answer', { toId: fromId, answer: pc.localDescription });
      } catch (err) {
        console.error('[voice] answer error', err);
      }
    };

    // We received an answer
    const onAnswer = async ({ fromId, answer }) => {
      const pc = peersRef.current[fromId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[voice] setRemoteDescription answer error', err);
      }
    };

    // ICE candidate from peer
    const onIce = async ({ fromId, candidate }) => {
      const pc = peersRef.current[fromId];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Non-fatal — can happen with timing
      }
    };

    socket.on('voice-joined',   onVoiceJoined);
    socket.on('voice-left',     onVoiceLeft);
    socket.on('signal-offer',   onOffer);
    socket.on('signal-answer',  onAnswer);
    socket.on('signal-ice',     onIce);

    return () => {
      socket.off('voice-joined',   onVoiceJoined);
      socket.off('voice-left',     onVoiceLeft);
      socket.off('signal-offer',   onOffer);
      socket.off('signal-answer',  onAnswer);
      socket.off('signal-ice',     onIce);
    };
  }, [createPeer, removePeer]);

  // ── Join voice chat ────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: false,
      });
      localStreamRef.current = stream;
      setInVoice(true);
      inVoiceRef.current = true;

      // Tell server (and via server, all other players in the room)
      socket.emit('voice-joined', { roomCode: roomCodeRef.current });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Please allow mic access in your browser.');
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found. Please connect a microphone and try again.');
      } else {
        setMicError('Could not access microphone: ' + err.message);
      }
    }
  }, [roomCodeRef]);

  // ── Leave voice chat ───────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    // Close all peer connections
    Object.keys(peersRef.current).forEach(peerId => removePeer(peerId));
    setInVoice(false);
    inVoiceRef.current = false;
    setVoicePeers({});
    setMuted(false);
    socket.emit('voice-left', { roomCode: roomCodeRef.current });
  }, [roomCodeRef, removePeer]);

  // ── Toggle mute ────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setMuted(m => !m);
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (inVoiceRef.current) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
        }
        Object.keys(peersRef.current).forEach(peerId => {
          const pc = peersRef.current[peerId];
          if (pc._remoteAudio) { pc._remoteAudio.srcObject = null; }
          pc.close();
        });
      }
    };
  }, []);

  return {
    inVoice,
    muted,
    voicePeers,   // { [socketId]: { name } }
    micError,
    joinVoice,
    leaveVoice,
    toggleMute,
  };
}
