# Score Keeper

An African-centric live game show scoreboard with team buzzers, question management, and four built-in rounds. Built with React + Vite on the frontend and Express + Socket.io on the backend.

---

## Features

- **Live scoreboard** — track scores for 2–4 teams with +/- controls
- **Team buzzers** — team members join on their own devices and buzz in; first buzz locks out others
- **Question view** — full-screen display for each round with a collapsible sidebar, scoring presets, and answer reveals
- **Round intro pages** — rules and scoring breakdown for each round
- **Member names** — players enter their name on join; shown live in the codes panel and buzz popup
- **Mark done** — track which questions have been played

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Run locally

```bash
npm run dev
```

This starts both the Vite frontend (port 5173) and the Express/Socket.io server (port 3001) concurrently.

Open `http://localhost:5173` on the host machine.

### Share with team members (ngrok)

1. In a separate terminal, run:
   ```bash
   ngrok http 5173
   ```
2. Copy the ngrok URL (e.g. `https://abc123.ngrok-free.app`)
3. Paste it into `src/config.js`:
   ```js
   export const ENDPOINT = "https://abc123.ngrok-free.app"
   ```
4. Share the URL with team members — they go to `<ngrok-url>/buzz`

> The `ENDPOINT` variable is only used to display the correct URL to team members in the codes panel. All socket connections always go through the local Vite proxy.

---

## Game Setup

1. Open the host view at `localhost:5173`
2. Choose the number of teams (2–4) and name them
3. Each team gets a unique 4-character code
4. Team members go to `<url>/buzz`, enter their code and name, and wait
5. Click **📋 Questions** to open the question picker, or click a round in the sidebar to see its intro page
6. Click **🎯 Arm Buzzers** before each question — the first member to tap their screen wins

---

## Rounds

| Round | Type | Format |
|-------|------|--------|
| Round 1 — Charades | `charades` | Round robin, act out a phrase |
| Round 2 — Guess the Language | `video` | Buzz in, identify the language from a video clip |
| Round 3 — Slang Bee | `slang` | Buzz in, define the term and use it in a sentence |
| Round 4 — Thesis Translator | `thesis` | Round robin, translate an academic thesis title |

### Editing round content

Each round lives in its own file under `src/rounds/`:

```
src/rounds/
  charades.js
  guessTheLanguage.js
  slangBee.js
  thesisTranslator.js
```

Edit the `questions` array in any file to update the content. `src/rounds.js` just imports and re-exports all four.

### Adding videos (Round 2)

Place `.mp4` files in `public/videos/` named `r1-01.mp4` through `r1-08.mp4`. Then fill in the `answer` and `explanation` fields in `src/rounds/guessTheLanguage.js`.

---

## Scoring

Preset score buttons appear in the mini scoreboard at the top of each question view, tailored to the current round:

| Round | Scoring |
|-------|---------|
| Charades | +1 / +2 / +3 |
| Guess the Language | +3 correct language / +1 correct region / -1 wrong |
| Slang Bee | +2 meaning / +2 sentence / +1 funny bonus |
| Thesis Translator | +1 / +2 / +3 |

---

## Architecture

```
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

**Key files:**

| File | Purpose |
|------|---------|
| `server.js` | Express + Socket.io server, game state, buzzer logic |
| `src/socket.js` | Socket.io client singleton |
| `src/config.js` | `ENDPOINT` for ngrok URL display |
| `src/App.jsx` | Routes between host view and `/buzz` |
| `src/components/Scoreboard.jsx` | Host view, score management, socket events |
| `src/components/BuzzerPage.jsx` | Team member buzzer interface |
| `src/components/QuestionView.jsx` | Full-screen question display |
| `src/components/RoundIntroView.jsx` | Round rules and scoring page |
| `src/rounds/` | Round and question data |

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend + backend in development mode |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
