# UP DOWN — Multiplayer Number Guess Game

A real-time multiplayer web game built with **React**, **Node.js**, **Socket.io**, and **Tailwind CSS**.

Players join a room with a code, one player secretly picks a number, and the rest race to guess it. The server responds to every guess with **UP**, **DOWN**, or **CORRECT**.

---

## Features

- ✅ Create / join rooms with a 6-character code
- ✅ 2–6 players per room
- ✅ Configurable number range (default 1–1000, up to 10 000)
- ✅ Real-time guesses & hints via Socket.io
- ✅ Server-side secret — impossible to cheat
- ✅ Live scoreboard & guess history
- ✅ Round-robin picker rotation
- ✅ Narrowing window display (shows current valid range from hints)
- ✅ 60-second turn timer (auto-advances round on timeout)
- ✅ Procedural sound effects (Web Audio API — no files needed)
- ✅ Reconnection handling
- ✅ Deployment-ready (Vercel + Render)

---

## Project Structure

```
updown-game/
├── package.json          ← root convenience scripts
├── render.yaml           ← Render deployment config (backend)
├── .gitignore
│
├── server/
│   ├── package.json
│   ├── server.js         ← Express + Socket.io entrypoint
│   ├── rooms.js          ← In-memory room store & player management
│   ├── gameLogic.js      ← Secret number, guess evaluation, rotation
│   └── .env.example
│
└── client/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── vercel.json        ← Vercel deployment config (frontend)
    ├── index.html
    └── src/
        ├── main.jsx       ← React entry point
        ├── index.css      ← Tailwind + global styles
        ├── socket.js      ← Socket.io singleton
        ├── sounds.js      ← Web Audio procedural SFX
        ├── App.jsx        ← Root component, view routing, global listeners
        ├── Home.jsx       ← Create / Join room page
        ├── Lobby.jsx      ← Waiting room with player list
        └── GameRoom.jsx   ← Main game: picking, guessing, history, scores
```

---

## How It Works

### Socket.io Event Flow

```
CLIENT                          SERVER
──────                          ──────
createRoom ──────────────────►  creates room, emits roomCreated
joinRoom   ──────────────────►  adds player, emits roomJoined + playerJoined (broadcast)
startGame  ──────────────────►  sets state='picking', emits gameStarted + waitingForPick
pickNumber ──────────────────►  stores secret server-side, emits numberPicked
guessNumber ─────────────────►  evaluates guess, emits hint (UP/DOWN/CORRECT)
           ◄──────────────────  roundWon (if CORRECT) with secretNumber revealed
nextRound  ──────────────────►  rotates picker, emits nextRound + waitingForPick
disconnect ──────────────────►  removes player, emits playerLeft
```

### Game States (server-side)

```
lobby → picking → guessing → roundEnd → picking → ...
```

| State      | Who can act               |
|------------|---------------------------|
| `lobby`    | Host starts the game      |
| `picking`  | Current picker sets secret |
| `guessing` | All non-pickers guess      |
| `roundEnd` | Host triggers next round   |

### Anti-Cheat

The `secretNumber` field is **never sent to clients** during active play.
The `publicRoom()` function in `rooms.js` strips it before every broadcast.
It is only revealed in the `roundWon` event, after the round is over.

### Picker Rotation

Simple round-robin:
```js
nextPickerIndex = (currentIndex + 1) % players.length
```

---

## Local Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### 1. Clone the repo

```bash
git clone https://github.com/your-username/updown-game.git
cd updown-game
```

### 2. Install dependencies

```bash
# Install both server and client at once:
npm run install:all

# Or manually:
cd server && npm install
cd ../client && npm install
```

### 3. Configure environment

```bash
# Server
cp server/.env.example server/.env

# Client
cp client/.env.example client/.env
```

The defaults work for local dev — no changes needed.

### 4. Run the backend

```bash
# Terminal 1
cd server
npm run dev       # uses nodemon for auto-reload
# OR
npm start         # plain node
```

Server starts at **http://localhost:4000**
Health check: http://localhost:4000/health

### 5. Run the frontend

```bash
# Terminal 2
cd client
npm run dev
```

Frontend starts at **http://localhost:5173**

### 6. Test multiplayer locally

Open **two or more browser tabs** (or different browsers) at `http://localhost:5173`.

**Tab 1 — Host:**
1. Enter your name
2. Click **Create Room**
3. Note the 6-character room code

**Tab 2+ — Players:**
1. Enter a different name
2. Click **Join Room**
3. Enter the room code from Tab 1

**Back in Tab 1:**
- Click **Start Game** (need ≥ 2 players)

The first player (Tab 1) is the picker. Enter a secret number and lock it in.
Other tabs will see the guessing input. Race to find the number!

---

## Deployment

### Backend → Render (free tier)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repository
4. Set **Root Directory** to `server`
5. Build command: `npm install`
6. Start command: `npm start`
7. Add environment variable:
   - `FRONTEND_URL` = your Vercel URL (fill in after step below)
8. Deploy — note your Render URL (e.g. `https://updown-game-server.onrender.com`)

> **Tip:** Render free-tier services sleep after 15 min of inactivity. The first connection may take ~30 seconds to wake up. Upgrade to a paid plan to avoid this.

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your repository
3. Set **Root Directory** to `client`
4. Add environment variable:
   - `VITE_SERVER_URL` = your Render URL from above
5. Deploy

**After both are deployed:**
- Go back to Render → your service → Environment
- Update `FRONTEND_URL` to your Vercel URL
- Trigger a redeploy on Render

### Environment Variables Summary

| Location | Variable        | Value                          |
|----------|-----------------|--------------------------------|
| Server   | `PORT`          | `4000` (Render sets this auto) |
| Server   | `FRONTEND_URL`  | `https://your-app.vercel.app`  |
| Client   | `VITE_SERVER_URL` | `https://your-app.onrender.com` |

---

## Customisation

### Change the turn timer

In `server/server.js`, line ~55:
```js
const TURN_SECONDS = 60; // set to 0 to disable timer entirely
```

### Change default range

In `client/src/Home.jsx`, the default state:
```js
const [rangeMin, setRangeMin] = useState(1);
const [rangeMax, setRangeMax] = useState(1000);
```

### Add persistent scores (MongoDB)

Replace `rooms.js` with a MongoDB-backed version using Mongoose.
The room schema matches the object shape documented at the top of `rooms.js`.

---

## Socket Event Reference

### Client → Server

| Event         | Payload                              | Description                        |
|---------------|--------------------------------------|------------------------------------|
| `createRoom`  | `{ playerName, range }`              | Create a new room                  |
| `joinRoom`    | `{ roomCode, playerName }`           | Join existing room                 |
| `startGame`   | `{ roomCode }`                       | Host starts the game               |
| `pickNumber`  | `{ roomCode, number }`               | Picker locks in secret             |
| `guessNumber` | `{ roomCode, guess }`                | Guesser submits a number           |
| `nextRound`   | `{ roomCode }`                       | Host advances to next round        |

### Server → Client

| Event           | Payload                                        | Description                        |
|-----------------|------------------------------------------------|------------------------------------|
| `roomCreated`   | `{ room }`                                     | You created a room                 |
| `roomJoined`    | `{ room }`                                     | You joined a room                  |
| `playerJoined`  | `{ room }`                                     | Someone else joined                |
| `playerLeft`    | `{ room }`                                     | Someone disconnected               |
| `gameStarted`   | `{ room }`                                     | Game is starting                   |
| `waitingForPick`| `{ room }`                                     | Picker's turn to set secret        |
| `numberPicked`  | `{ room }`                                     | Secret locked; guessing begins     |
| `hint`          | `{ guess, hint, playerId, playerName, room }`  | Hint for a guess (UP/DOWN/CORRECT) |
| `roundWon`      | `{ winnerId, winnerName, secretNumber, room }` | Someone guessed correctly          |
| `timeUp`        | `{ room }`                                     | Turn timer expired                 |
| `nextRound`     | `{ room }`                                     | New round started                  |
| `error`         | `{ message }`                                  | Something went wrong               |

---

## License

MIT — use freely, modify, deploy, have fun.
