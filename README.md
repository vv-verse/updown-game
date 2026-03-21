# UP DOWN — Multiplayer Number Guess Game

A real-time multiplayer number guessing game with voice chat, built with **React**, **Node.js**, **Socket.io**, **WebRTC**, and **Tailwind CSS**.

Players join a room with a code, one player secretly picks a number, and everyone else races to guess it. The server responds to every guess with **▲ UP**, **▼ DOWN**, or **✓ CORRECT**.

---

## Features

| Feature | Details |
|---|---|
| 🎮 Real-time multiplayer | 2–6 players per room via Socket.io |
| 🔢 Configurable range | 1–10,000, set by host when creating room |
| ⏱ Turn timer | Off / 30s / 1m / 2m / 3m / custom — set by host |
| 🎤 Voice chat | Peer-to-peer WebRTC audio, no extra server needed |
| 🔇 Mic + Speaker mute | Each player controls their own mic and speaker independently |
| 💬 Text chat | Real-time chat with emoji reactions in every room |
| 🏆 Scoreboard | Live win counts, round-robin picker rotation |
| 📱 Mobile-first | Bottom tab bar on phones, 3-column layout on desktop |
| 🔔 Exit confirmation | Popup before leaving or refreshing mid-game |
| 🔄 Auto-reconnect | Rejoins room automatically if connection drops |
| 🔒 Anti-cheat | Secret number never sent to clients — server only |

---

## Project Structure

```
updown-game/
├── package.json              ← root convenience scripts
├── render.yaml               ← Render one-click deploy config
├── README.md
│
├── server/
│   ├── server.js             ← Express + Socket.io + WebRTC signaling
│   ├── rooms.js              ← In-memory room store & player management
│   ├── gameLogic.js          ← Secret number, guess evaluation, rotation
│   └── package.json
│
└── client/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── vercel.json           ← Vercel deploy config
    └── src/
        ├── main.jsx          ← React entry point
        ├── index.css         ← Tailwind + global styles
        ├── socket.js         ← Socket.io singleton
        ├── sounds.js         ← Procedural sound effects (Web Audio API)
        ├── useVoiceChat.js   ← WebRTC voice chat hook
        ├── App.jsx           ← Root component, view routing, global listeners
        ├── Home.jsx          ← Create / Join room + voice toggle
        ├── Lobby.jsx         ← Waiting room with player list
        └── GameRoom.jsx      ← Main game: picking, guessing, chat, voice
```

---

## How the Game Works

### Game Flow

```
Home page → Create / Join room → Lobby → Game starts
    ↓
Round 1: Picker chooses secret number
    ↓
Guessers submit numbers → Server responds: UP / DOWN / CORRECT
    ↓
First correct guess wins the round → Scores updated
    ↓
Host clicks "Next Round" → Picker rotates to next player
    ↓
Repeat
```

### Game States (server-side)

| State | Who can act |
|---|---|
| `lobby` | Host starts the game |
| `picking` | Current picker sets secret number |
| `guessing` | All non-pickers submit guesses |
| `roundEnd` | Host advances to next round |

### Picker Rotation

Simple round-robin: `nextPickerIndex = (currentIndex + 1) % players.length`

### Anti-Cheat

The `secretNumber` field is **never sent to clients** during active play. The `publicRoom()` function in `rooms.js` strips it before every broadcast. It is only revealed in the `roundWon` event after the round ends.

---

## Voice Chat (WebRTC)

Voice chat is **peer-to-peer** — the server only relays connection setup signals, never the audio itself.

### How it works

```
Player A joins voice
    ↓
Server tells Player B: "A is in voice"
    ↓
Player B creates RTCPeerConnection, sends offer to A via server
    ↓
Player A answers → ICE candidates exchanged via server
    ↓
Direct audio connection established between A and B
    ↓
Audio flows peer-to-peer (server not involved)
```

### Controls

| Control | What it does |
|---|---|
| **Join Voice** | Requests mic permission, connects to all voice peers |
| **Mic button** | Mutes / unmutes your microphone |
| **Speaker button** | Mutes / unmutes all incoming audio (deafen) |
| **End** | Leaves the voice call |

Both mic and speaker can be toggled independently. You can hear others while muted, or talk while deafened. Mute states apply instantly without any reconnection.

### Technical notes

- Uses Google's public STUN servers (free, no config needed)
- Works on ~85–90% of consumer internet connections
- For users behind very strict corporate NAT, a TURN server would improve reliability
- Enabled via toggle on the Home page — off by default

---

## Socket Event Reference

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `createRoom` | `{ playerName, range, timerSeconds }` | Create a new room |
| `joinRoom` | `{ roomCode, playerName }` | Join existing room |
| `startGame` | `{ roomCode }` | Host starts the game |
| `pickNumber` | `{ roomCode, number }` | Picker locks in secret |
| `guessNumber` | `{ roomCode, guess }` | Guesser submits a number |
| `nextRound` | `{ roomCode }` | Host advances to next round |
| `sendChat` | `{ roomCode, message }` | Send a chat message |
| `voice-joined` | `{ roomCode }` | Announce joining voice chat |
| `voice-left` | `{ roomCode }` | Announce leaving voice chat |
| `signal-offer` | `{ toId, offer }` | WebRTC offer relay |
| `signal-answer` | `{ toId, answer }` | WebRTC answer relay |
| `signal-ice` | `{ toId, candidate }` | ICE candidate relay |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `roomCreated` | `{ room }` | You created a room |
| `roomJoined` | `{ room }` | You joined a room |
| `playerJoined` | `{ room }` | Someone else joined |
| `playerLeft` | `{ room }` | Someone disconnected |
| `gameStarted` | `{ room }` | Game is starting |
| `waitingForPick` | `{ room }` | Picker's turn to set secret |
| `numberPicked` | `{ room }` | Secret locked; guessing begins |
| `hint` | `{ guess, hint, playerId, playerName, room }` | UP / DOWN / CORRECT |
| `roundWon` | `{ winnerId, winnerName, secretNumber, room }` | Someone guessed correctly |
| `timeUp` | `{ room }` | Turn timer expired |
| `nextRound` | `{ room }` | New round started |
| `chatMessage` | `{ id, playerId, playerName, message, timestamp }` | Chat message |
| `voice-joined` | `{ fromId, playerName }` | A peer joined voice |
| `voice-left` | `{ fromId }` | A peer left voice |
| `signal-offer` | `{ fromId, offer }` | Relayed WebRTC offer |
| `signal-answer` | `{ fromId, answer }` | Relayed WebRTC answer |
| `signal-ice` | `{ fromId, candidate }` | Relayed ICE candidate |
| `error` | `{ message }` | Something went wrong |

---

## Local Setup

### Prerequisites

- Node.js ≥ 18 — download from [nodejs.org](https://nodejs.org) (click the LTS button)
- npm ≥ 9 (comes with Node.js)

### Step 1 — Install dependencies

```bash
# Backend
cd server
npm install

# Frontend (open a second terminal)
cd client
npm install
```

### Step 2 — Start the backend

```bash
cd server
npm run dev
# Server starts at http://localhost:4000
# Health check: http://localhost:4000/health
```

### Step 3 — Start the frontend

```bash
cd client
npm run dev
# Opens at http://localhost:5173
```

### Step 4 — Test multiplayer

Open **two or more browser tabs** at `http://localhost:5173`.

- **Tab 1:** Enter a name → Create Room → note the 6-letter code
- **Tab 2:** Enter a different name → Join Room → type the code
- **Back in Tab 1:** Click **Start Game**

The first player is the picker — enter a secret number and lock it in. Other tabs guess. The game runs in real time.

---

## Deployment

### Backend → Render (free)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repository
4. Set these values:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free |

5. Add environment variable:

| Key | Value |
|---|---|
| `FRONTEND_URL` | `*` (update after Vercel deploy) |

6. Deploy — copy your Render URL (e.g. `https://updown-game.onrender.com`)

### Frontend → Vercel (free)

1. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
2. Set Root Directory to `client`
3. Add environment variable:

| Key | Value |
|---|---|
| `VITE_SERVER_URL` | your Render URL from above |

4. Deploy — copy your Vercel URL (e.g. `https://updown-game.vercel.app`)

### Connect them together

Go back to Render → your service → Environment → update:

| Key | Value |
|---|---|
| `FRONTEND_URL` | your Vercel URL |

Then: Render → Manual Deploy → Deploy latest commit.

### Environment Variables Summary

| Where | Variable | Value |
|---|---|---|
| Server (Render) | `PORT` | Set automatically by Render |
| Server (Render) | `FRONTEND_URL` | `https://your-app.vercel.app` |
| Client (Vercel) | `VITE_SERVER_URL` | `https://your-app.onrender.com` |

---

## Custom Domain (Hostinger or any registrar)

You can point your own domain to the game without moving away from Vercel + Render.

### Point your domain to Vercel (frontend)

1. Go to your domain registrar (Hostinger, GoDaddy, etc.) → DNS settings
2. Add a CNAME record:

| Type | Name | Value |
|---|---|---|
| CNAME | `@` or `www` | `cname.vercel-dns.com` |

3. In Vercel → your project → Settings → Domains → add your domain
4. Vercel provides free SSL automatically

### Subdomain setup (keep blog + game on same domain)

| Subdomain | Points to | Purpose |
|---|---|---|
| `yourdomain.com` | WordPress / Hostinger | Your blog |
| `game.yourdomain.com` | Vercel (CNAME) | This game |
| `api.yourdomain.com` | Render (optional) | Backend API |

---

## Common Issues

**"Reconnecting to server" banner appears**
- Make sure `VITE_SERVER_URL` in Vercel matches your exact Render URL
- No trailing slash, must use `https://`

**"Room not found" error**
- This is handled automatically via `roomCodeRef` — the room code never goes stale even after reconnects

**Render free tier is slow to start**
- Free tier services sleep after 15 minutes of inactivity
- First connection after sleeping takes ~30 seconds to wake up
- Fix: use [UptimeRobot](https://uptimerobot.com) to ping `/health` every 10 minutes for free, or upgrade to Render's $7/month paid plan

**Voice chat not working**
- Browser must be on HTTPS (works on Vercel/Render, not on plain `http://localhost`)
- For local testing, use `http://localhost:5173` — browsers allow mic on localhost
- User must click "Allow" when browser asks for microphone permission
- If behind a corporate VPN or strict firewall, STUN may fail — a TURN server would help

**Microphone permission denied**
- Chrome/Firefox: click the lock icon in the address bar → allow microphone
- iOS Safari: Settings → Safari → Microphone → allow

**Deployment fails on Vercel with dependency error**
- Make sure Root Directory is set to `client` in Vercel project settings
- Vite version in `client/package.json` must be `^5.0.0` or higher

---

## Customisation

### Change turn timer default

In `client/src/Home.jsx`, change the default selected timer:
```js
const [timerChoice, setTimerChoice] = useState(60); // change 60 to any preset value
```

### Change number range default

```js
const [rangeMin, setRangeMin] = useState(1);
const [rangeMax, setRangeMax] = useState(1000); // change to any value up to 10000
```

### Disable voice chat entirely

In `client/src/Home.jsx`, change the default:
```js
const [voiceEnabled, setVoiceEnabled] = useState(false); // already off by default
```

Or remove the voice toggle UI entirely and never pass `voiceEnabled={true}`.

### Add TURN server for better voice reliability

In `client/src/useVoiceChat.js`:
```js
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls:       'turn:your-turn-server.com:3478',
    username:   'your-username',
    credential: 'your-password',
  },
];
```

Free TURN servers: [Open Relay](https://www.metered.ca/tools/openrelay/) or self-host [coturn](https://github.com/coturn/coturn).

### Add persistent scores (MongoDB)

Replace the in-memory `rooms.js` with a Mongoose-backed version. The room schema matches the object shape documented at the top of `rooms.js`. Use MongoDB Atlas free tier.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 |
| Styling | Tailwind CSS v3 |
| Build tool | Vite |
| Real-time communication | Socket.io v4 |
| Voice chat | WebRTC (native browser API) |
| Backend runtime | Node.js + Express |
| Data storage | In-memory (no database) |
| Frontend hosting | Vercel (free) |
| Backend hosting | Render (free) |

---

## License

MIT — use freely, modify, deploy, have fun.
