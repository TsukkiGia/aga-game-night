# Sankofa Showdown (Score Keeper)

An African- and diaspora-centric live game show scoreboard with team buzzers, custom rounds, and a host-facing control panel. The host runs the scoreboard on a laptop/projector; players join from their phones to buzz in.

Built with **React + Vite** on the frontend and **Express + Socket.io** on the backend.

---

## Features

- **Live scoreboard** — track scores for **2–8 teams** with +/- controls and color-coded strips.
- **Team buzzers on phones** — players join with a 4-character code and their name; first buzz wins, others are locked out.
- **Round intro + question views** — per-round explainer pages, then full-screen question views with built-in timers (Charades / Thesis) and answer reveals.
- **Flexible scoring presets** — host taps context-specific score buttons (correct, steals, bonuses, etc.) instead of doing math.
- **Halftime + winner screens** — one-click halftime view and animated game-over screen with confetti and podium.
- **Question picker & progress** — global questions sheet and “mark done” tracking so you don’t repeat prompts.
- **Soundboard for vibes** — host can trigger sound effects via keyboard shortcuts (Shift + C/F/R/N/W/S/A/B/L/O).
- **Persistent state** — teams, scores, and completed questions are stored in `localStorage` so a refresh won’t wipe the game.

---

## Getting Started

Prerequisite: Node 18+ recommended.

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run dev
```

This starts:

- Vite dev server on **http://localhost:5173**
- Express + Socket.io server on **http://localhost:3001** (via `nodemon`)

Open `http://localhost:5173` in a browser for the host view.

### Sharing with remote players (ngrok)

1. In a separate terminal, run:
   ```bash
   ngrok http 5173
   ```
2. Copy the ngrok URL (e.g. `https://abc123.ngrok-free.app`)
3. Update `src/config.js`:
   ```js
   export const ENDPOINT = "https://abc123.ngrok-free.app"
   ```
4. Share the URL with players — they visit `<ngrok-url>/buzz` on their phones.

> `ENDPOINT` is **only** used to display the URL and QR code in the host UI. Socket.io still connects to the same origin (Vite dev server or built app).

### Production build

```bash
npm run build
```

The built assets go into `dist/`. In production, `server.js` serves `dist/` and handles all `/socket.io` traffic.

You can then run the server with:

```bash
node server.js
```

and open `http://localhost:3001` as the host URL.

---

## Game Flow

### Host flow

1. Open the app at `localhost:5173` (or your ngrok URL).
2. Choose the number of teams (**2–8**) and optionally name them.
3. Each team gets:
   - a color theme
   - a unique 4-character join **code**
4. Share the buzzer URL shown in the “Team Buzzer Codes” panel (QR code + link).
5. As teams join, you’ll see their members appear under each team in the codes panel and question view sidebars.
6. Use the **Questions** overlay or round sidebar to jump to:
   - round intro pages (rules + scoring summary)
   - individual questions.
7. Before each question, click **🎯 Arm Buzzers**. First buzz wins; a modal appears showing the team and member name.
8. Tap a **scoring preset** button in the modal (e.g. “Correct answer”, “Correct steal”, “Wrong steal”) to adjust scores.
9. Use **Open Steal** when available to allow another team to buzz in for a steal; reset buzzers after scoring.
10. At any time:
    - **Halftime** → show a ranked scoreboard overlay.
    - **Winner** → show game-over confetti and podium; closing this also clears persisted state for a fresh game.

### Player / buzzer flow

1. On your phone, go to `<host-url>/buzz`.
2. Enter the 4-character **team code** given by the host and your **name**.
3. Wait on the “waiting for host” screen.
4. When the host arms the buzzers, your screen switches to **BUZZ NOW!** — tap the big button to buzz in.
5. Status states:
   - **Waiting** — buzzers not armed yet.
   - **BUZZ NOW!** — tap to buzz.
   - **YOU BUZZED IN!** — you were first.
   - **Locked Out** — someone else beat you.

---

## Rounds

Each round is defined as a data object under `src/rounds/` and assembled in `src/rounds.js`.

| Round | Type | File | Format |
|-------|------|------|--------|
| Round 1 — Guess the Language | `video` | `src/rounds/guessTheLanguage.js` | Watch a video, buzz in, and identify the language/region. |
| Round 2 — Charades | `charades` | `src/rounds/charades.js` | Act out a phrase; teams guess before the timer runs out. |
| Round 3 — Slang Bee | `slang` | `src/rounds/slangBee.js` | Guess the meaning of slang from African and diasporic communities. |
| Round 4 — Title Translator | `thesis` | `src/rounds/thesisTranslator.js` | Translate real thesis titles into playful registers (family-friendly, slang, or over-the-top academic). |

### Editing round content

```text
src/rounds/
  charades.js
  guessTheLanguage.js
  slangBee.js
  thesisTranslator.js
```

- Each file exports a single object: `{ name, type, intro, rules, scoring, questions }`.
- Edit the `questions` array to change content (charades phrases, video filenames, slang entries, thesis titles).
- `src/rounds.js` imports the four rounds, sets their labels (`Round 1`–`Round 4`), and exports a single `rounds` array used throughout the UI.

### Adding videos (Guess the Language)

- Place `.mp4` files in `public/videos/` named:
  - `r1-01.mp4`, `r1-02.mp4`, … up to `r1-08.mp4`.
- Then update `src/rounds/guessTheLanguage.js`:
  - Set `answer` (e.g. language / country).
  - Optionally set `explanation` (short context or joke).

---

## Scoring Presets (from code)

Actual presets come from each round’s `scoring` array and drive the buzz modal buttons:

- **Charades** (`src/rounds/charades.js`)
  - `Correct answer` → **+3**
  - `Correct steal` → **+2**
  - `Wrong steal` → **-1**

- **Guess the Language** (`src/rounds/guessTheLanguage.js`)
  - `Correct language` → **+3**
  - `Correct country` → **+1**
  - `Correct steal` → **+2**
  - `Wrong steal` → **-1**

- **Slang Bee** (`src/rounds/slangBee.js`)
  - `Correct meaning` → **+3**
  - `Funny bonus` → **+1**
  - `Correct steal` → **+2**
  - `Wrong steal` → **-1**

- **Title Translator** (`src/rounds/thesisTranslator.js`)
  - `Majority vote` (crowd’s favorite translation) → **+3**
  - `Correct steal` → **+2**
  - `Wrong steal` → **-1**

On any question, you can also:

- Manually adjust scores with `+1` / `-1` buttons per team.
- Toggle **2×** for double points on that question.

---

## Architecture

```text
browser (host)          browser (team member)
     │                          │
     └──────────┬───────────────┘
                │
          ngrok / LAN
                │
        Vite dev server :5173
          │         │
          │    /socket.io proxy
          │         │
     React SPA   Express + Socket.io :3001
```

**Key files**

| File | Purpose |
|------|---------|
| `server.js` | Express + Socket.io server; holds game state (teams, members, armed/buzzed) and handles buzzer events. |
| `src/socket.js` | Socket.io client singleton used by host and buzzer UIs. |
| `src/config.js` | `ENDPOINT` used to display the public host URL (for QR / instructions). |
| `src/App.jsx` | App shell; routes between host view and `/buzz` based on `window.location.pathname`. |
| `src/components/Scoreboard.jsx` | Main host screen (codes panel, arm/reset buzzers, start game, halftime, winner). |
| `src/components/BuzzerPage.jsx` | Player buzzer client. |
| `src/components/QuestionView.jsx` | Full-screen question UI with scoring controls and buzzer modal. |
| `src/components/RoundIntroView.jsx` | Per-round intro: rules + scoring summary. |
| `src/components/QuestionsPicker.jsx` | Global question picker / navigator overlay. |
| `src/components/HalftimeScreen.jsx` | Halftime overlay with ranked scores. |
| `src/components/WinnerScreen.jsx` | Game-over overlay with confetti and podium. |
| `src/hooks/useGameSocket.js` | Host-side socket wiring for buzzers and member lists. |
| `src/hooks/useGameState.js` | Score, done-questions, and double-points state (persisted to `localStorage`). |
| `src/hooks/useNavigation.js` | Round/question navigation + transition animations. |
| `src/rounds/*.js` | Round metadata and question content. |
| `src/storage.js` | Helpers for `localStorage` keys (`TEAMS_KEY`, `SCORES_KEY`, `DONE_KEY`). |
| `src/sounds.js` | Audio helpers and soundboard functions. |

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend (Vite) and backend (Express + Socket.io) in development mode. |
| `npm run build` | Build the React app into `dist/` for production. |
| `npm run preview` | Preview the production build with Vite’s preview server. |

If you’d like, you can add a separate `"server"` script (already present) to run only the Express server via `nodemon` while testing different deployment setups.
