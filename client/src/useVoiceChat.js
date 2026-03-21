/**
 * useVoiceChat.js v2
 *
 * Adds speaker mute (deafen) on top of mic mute.
 *
 *  toggleMute()    — mutes/unmutes YOUR microphone (others can't hear you)
 *  toggleSpeaker() — mutes/unmutes incoming audio  (you can't hear others)
 *
 * Speaker mute works by setting audio.muted = true on every remote Audio
 * element. The WebRTC stream itself keeps flowing so unmuting is instant.
 *
 * All remote Audio elements are tracked in remoteAudiosRef so we can
 * apply/remove speaker mute to connections that arrive after deafening.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceChat(roomCodeRef, myId, players) {
  const [inVoice,       setInVoice]       = useState(false);
  const [micMuted,      setMicMuted]      = useState(false); // my mic off
  const [speakerMuted,  setSpeakerMuted]  = useState(false); // incoming audio off
  const [voicePeers,    setVoicePeers]    = useState({});    // { socketId: { name } }
  const [micError,      setMicError]      = useState('');

  const localStreamRef   = useRef(null);  // my microphone MediaStream
  const peersRef         = useRef({});    // { socketId: RTCPeerConnection }
  const remoteAudiosRef  = useRef({});    // { socketId: HTMLAudioElement }
  const inVoiceRef       = useRef(false);
  const speakerMutedRef  = useRef(false); // mirror for use inside callbacks

  useEffect(() => { inVoiceRef.current = inVoice; },             [inVoice]);
  useEffect(() => { speakerMutedRef.current = speakerMuted; },   [speakerMuted]);

  // ── Remove one peer cleanly ───────────────────────────────────────
  const removePeer = useCallback((peerId) => {
    // Stop remote audio
    if (remoteAudiosRef.current[peerId]) {
      remoteAudiosRef.current[peerId].srcObject = null;
      delete remoteAudiosRef.current[peerId];
    }
    // Close peer connection
    const pc = peersRef.current[peerId];
    if (pc) {
      pc.close();
      delete peersRef.current[peerId];
    }
    setVoicePeers(prev => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ── Create a WebRTC peer connection ───────────────────────────────
  const createPeer = useCallback((peerId, isInitiator) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Send our mic audio to this peer
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Receive incoming audio from this peer
    pc.ontrack = (e) => {
      const audio = new Audio();
      audio.srcObject  = e.streams[0];
      audio.autoplay   = true;
      // Respect current speaker mute state when a new peer connects
      audio.muted = speakerMutedRef.current;
      remoteAudiosRef.current[peerId] = audio;
    };

    // Relay ICE candidates through the server
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

    // Initiator creates and sends offer
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => socket.emit('signal-offer', { toId: peerId, offer: pc.localDescription }))
        .catch(console.error);
    }

    return pc;
  }, [removePeer]);

  // ── Socket signaling listeners ────────────────────────────────────
  useEffect(() => {
    // Someone else joined voice — we initiate the offer
    const onVoiceJoined = ({ fromId, playerName }) => {
      if (!inVoiceRef.current) return;
      setVoicePeers(prev => ({ ...prev, [fromId]: { name: playerName } }));
      createPeer(fromId, true);
    };

    // Someone left voice
    const onVoiceLeft = ({ fromId }) => {
      removePeer(fromId);
    };

    // We received an offer — send back an answer
    const onOffer = async ({ fromId, offer }) => {
      if (!inVoiceRef.current) return;
      const pc = createPeer(fromId, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal-answer', { toId: fromId, answer: pc.localDescription });
      } catch (err) {
        console.error('[voice] answer error', err);
      }
    };

    // We received an answer to our offer
    const onAnswer = async ({ fromId, answer }) => {
      const pc = peersRef.current[fromId];
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[voice] setRemoteDescription answer', err);
      }
    };

    // ICE candidate from peer
    const onIce = async ({ fromId, candidate }) => {
      const pc = peersRef.current[fromId];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) { /* non-fatal timing issue */ }
    };

    socket.on('voice-joined',  onVoiceJoined);
    socket.on('voice-left',    onVoiceLeft);
    socket.on('signal-offer',  onOffer);
    socket.on('signal-answer', onAnswer);
    socket.on('signal-ice',    onIce);

    return () => {
      socket.off('voice-joined',  onVoiceJoined);
      socket.off('voice-left',    onVoiceLeft);
      socket.off('signal-offer',  onOffer);
      socket.off('signal-answer', onAnswer);
      socket.off('signal-ice',    onIce);
    };
  }, [createPeer, removePeer]);

  // ── Join voice ────────────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
        video: false,
      });
      localStreamRef.current = stream;
      setInVoice(true);
      inVoiceRef.current = true;
      socket.emit('voice-joined', { roomCode: roomCodeRef.current });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Mic permission denied — please allow mic in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found. Connect one and try again.');
      } else {
        setMicError('Could not access microphone: ' + err.message);
      }
    }
  }, [roomCodeRef]);

  // ── Leave voice ───────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    Object.keys(peersRef.current).forEach(id => removePeer(id));
    setInVoice(false);
    inVoiceRef.current = false;
    setVoicePeers({});
    setMicMuted(false);
    setSpeakerMuted(false);
    speakerMutedRef.current = false;
    socket.emit('voice-left', { roomCode: roomCodeRef.current });
  }, [roomCodeRef, removePeer]);

  // ── Toggle mic (mute/unmute your own microphone) ──────────────────
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setMicMuted(m => !m);
  }, []);

  // ── Toggle speaker (mute/unmute all incoming audio) ───────────────
  const toggleSpeaker = useCallback(() => {
    const nowMuted = !speakerMutedRef.current;
    speakerMutedRef.current = nowMuted;
    // Apply to every existing remote audio element
    Object.values(remoteAudiosRef.current).forEach(audio => {
      audio.muted = nowMuted;
    });
    setSpeakerMuted(nowMuted);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(remoteAudiosRef.current).forEach(a => { a.srcObject = null; });
      Object.values(peersRef.current).forEach(pc => pc.close());
    };
  }, []);

  return {
    inVoice,
    micMuted,
    speakerMuted,
    voicePeers,
    micError,
    joinVoice,
    leaveVoice,
    toggleMic,
    toggleSpeaker,
  };
}
