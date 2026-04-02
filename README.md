# Sankofa Showdown

An African- and diaspora-centric live game show with team buzzers, custom rounds, and a host-facing control panel. The host runs the scoreboard on a laptop/projector; players join from their phones to buzz in.

Built with **React + Vite** on the frontend and **Express + Socket.io** on the backend.

---

## Features

- **Live scoreboard** — track scores for up to 8 teams with +/- controls and color-coded strips.
- **Team buzzers on phones** — players select their team and enter their name; first buzz wins, others are locked out.
- **Round intro + question views** — per-round explainer pages with rules and scoring, then full-screen question views with answer reveals.
- **Flexible scoring presets** — host taps context-specific score buttons (correct, steals, bonuses) instead of doing math.
- **Double points** — toggle 2× multiplier on any question for drama.
- **Steal mechanic** — wrong answers open a steal opportunity for other teams, with the wrong team locked out server-side.
- **Halftime + winner screens** — one-click halftime view and animated game-over screen with confetti and podium; tie-aware medal placement.
- **Sudden death tiebreaker** — on a tie, a dramatic black-screen "...but is it really?" animation appears after 10 seconds with suspense music, then a glowing Sudden Death button; only tied teams can buzz in.
- **Question sidebar & progress** — collapsible sidebar with "mark done" tracking so you don't repeat questions.
- **Collapsible QR sidebar** — on the round intro screen, shows QR code, buzzer URL, and live team member roster.
- **Soundboard for vibes** — trigger sound effects via keyboard shortcuts (Shift + key):

  | Key | Sound |
  |-----|-------|
  | C | Crickets |
  | F | Faaah |
  | R | Correct answer |
  | N | Nani |
  | W | What the hell |
  | S | Shocked |
  | A | Airhorn |
  | B | Boo |
  | L | Laughter |
  | O | Okayy |
  | V | Very wrong |

- **Persistent buzzer sessions** — players' name and team are saved in `localStorage` so reconnecting after a dropped connection rejoins automatically.
- **Persistent host state** — teams, scores, and completed questions are stored in `localStorage` so a page refresh won't wipe the game.

---

## Getting Started

Prerequisite: Node 18+.

### Install dependencies

```bash
npm install
```

### Run in development

```bash
HOST_PIN=1234 npm run dev
```

Optional: enable detailed socket debugging logs.

```bash
HOST_PIN=1234 DEBUG_BUZZ=1 npm run dev
```

This starts:

- Vite dev server on **http://localhost:5173**
- Express + Socket.io server on **http://localhost:3001**

On first host connection, you'll be prompted for the same `HOST_PIN`.

Open `http://localhost:5173` for the host view.
Open `http://localhost:5173/host-mobile` on a phone for the answer + sound-bites companion view.

### Sharing with remote players (ngrok)

1. Run ngrok pointed at the Express server (not Vite):
   ```bash
   ngrok http 3001 --domain your-domain.ngrok-free.app
   ```
2. Update `src/config.js`:
   ```js
   export const ENDPOINT = "https://your-domain.ngrok-free.app"
   ```
3. Build the app so ngrok serves the latest version:
   ```bash
   npm run build
   ```
4. Share `<ngrok-url>/buzz` with players.

> **Note:** `npm run dev` does not update the built files. Run `npm run build` any time you want ngrok to reflect your latest changes.

### Production build

```bash
npm run build
HOST_PIN=1234 node server.js
```

The built assets go into `dist/`. `server.js` serves `dist/` as static files and handles all Socket.io traffic on port 3001 (or `$PORT`).

---

## Game Flow

### Host flow

1. Open the app and set up teams (name + color, up to 8).
2. Share the QR code or buzzer URL — players visit `<url>/buzz` on their phones.
3. As teams join, member names appear in the team roster on the home screen and round intro sidebars.
4. Click **▶ Start Game** to begin. Navigate rounds via the left sidebar or arrow buttons.
5. Before each question, click **🎯 Arm Buzzers**. First buzz wins; a modal shows the team/member name and a 10-second countdown.
6. Tap a **scoring preset** button in the modal to award points. Use **Open Steal** to let other teams attempt.
7. Toggle **2×** for double points on any question.
8. At any time:
   - **⏸ Halftime** → ranked scoreboard overlay.
   - **🏆 Winner** → confetti and podium; on a tie, waits 10 seconds then reveals a dramatic Sudden Death screen.

### Player / buzzer flow

1. On your phone, go to `<host-url>/buzz`.
2. Select your **team** and enter your **name**.
3. When the host arms the buzzers, the screen switches to **BUZZ NOW!** — tap to buzz in.
4. Your session is saved — if you disconnect, returning to the page will rejoin your team automatically.

---

## Rounds

| Round | Type | Description |
|-------|------|-------------|
| Round 1 — Guess the Language | `video` | Watch a video clip and identify the language being spoken. |
| Round 2 — Charades | `charades` | Act out an African/diasporic cultural phrase; team guesses before the timer runs out. |
| Round 3 — Slang Bee | `slang` | Guess the meaning of slang from African and diasporic communities. |
| Round 4 — Title Translator | `thesis` | Translate a real academic paper title into a chosen register (family-friendly, slang, or exaggerated academic). |

Round content lives in `src/rounds/`. Each file exports `{ label, name, type, intro, rules, scoring, questions }`.

### Videos (Guess the Language)

Place `.mp4` files in `public/videos/`. Reference them by filename in `src/rounds/guessTheLanguage.js`. Videos are gitignored — they must be added manually to the server running the app.

---

## Scoring

Each round's `scoring` array drives the buzz modal buttons:

- **Guess the Language**: Correct language +3, Correct country +1, Correct steal +2, Wrong steal −1
- **Charades**: Correct answer +3, Correct steal +2, Wrong steal −1
- **Slang Bee**: Correct meaning +3, Funny bonus +1, Correct steal +2, Wrong steal −1
- **Title Translator**: Majority vote +3, Correct steal +2, Wrong steal −1

Manual +1/−1 buttons are always available per team in the question view.

---

## Architecture

```text
browser (host)          browser (player)
     │                          │
     └──────────┬───────────────┘
                │
         ngrok / LAN
                │
       Express + Socket.io :3001
          serves dist/ (built React app)
```

**Key files**

| File | Purpose |
|------|---------|
| `server.js` | Express + Socket.io; holds game state (teams, armed/buzzed, allowed buzzers) and handles all buzzer events. |
| `src/config.js` | `ENDPOINT` — the public-facing URL shown in QR code and buzzer link. |
| `src/App.jsx` | App shell; routes between host view and `/buzz`; keyboard soundboard shortcuts. |
| `src/components/Scoreboard.jsx` | Main host orchestrator — navigation, scoring, sudden death, halftime, winner. |
| `src/components/QuestionView.jsx` | Full-screen question UI with scoring controls, buzzer modal, and collapsible question sidebar. |
| `src/components/RoundIntroView.jsx` | Per-round intro with rules, scoring summary, and collapsible QR/team sidebar. |
| `src/components/BuzzerPage.jsx` | Player buzzer client with team selection and localStorage session persistence. |
| `src/components/WinnerScreen.jsx` | Game-over overlay with confetti, tie-aware podium, and sudden death reveal animation. |
| `src/components/SuddenDeathOverlay.jsx` | Sudden death screen — shows tied teams, buzz result, correct/wrong actions. |
| `src/components/HalftimeScreen.jsx` | Halftime overlay with tie-aware ranked scores. |
| `src/hooks/useGameSocket.js` | Host-side socket wiring for buzzers, member lists, arm/reset/rearm. |
| `src/hooks/useGameState.js` | Score, done-questions, and double-points state (persisted to `localStorage`). |
| `src/hooks/useNavigation.js` | Round/question navigation with transition animations. |
| `src/rounds/*.js` | Round metadata and question content. |
| `src/sounds.js` | Audio helpers, soundboard functions, suspense sequence. |
| `src/storage.js` | `localStorage` helpers for teams, scores, and done questions. |

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite (frontend) and Express (backend) concurrently in development mode. |
| `npm run build` | Build the React app into `dist/` for production/ngrok. |
| `npm start` | Build and start the production server. |
| `npm run preview` | Preview the production build locally. |
