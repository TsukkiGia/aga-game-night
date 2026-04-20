# Sankofa Showdown

Live team game show app for host + players:
- Host controls gameplay on the main screen (`/`)
- Optional host companion controls on phone (`/host-mobile`)
- Players join from phones (`/buzz?s=<SESSION_CODE>`) to buzz (`Hosted`) or submit answers (`Host-less`)

Tech stack: React 19 + Vite 6 frontend, Express + Socket.IO backend, Postgres persistence.

## Current Capabilities

- Team setup (1-8 teams), live score controls, round/question navigation
- Gameplay mode selector in Session Gate: `Hosted` (classic buzzer) or `Host-less` (answer submission)
- Round configuration supports base rounds plus optional community rounds
- Session + host PIN auth
- Buzzer join with required player name + team selection
- First-buzz wins, lockout, steal flow, reaction-time tracking
- Host-less answer flow:
  - Players submit guesses instead of buzzing
  - Wrong guesses broadcast as live toasts
  - First correct submission auto-locks the question and auto-awards points
  - Host screen shows a correct-answer modal (with sound + next-question action)
  - `charades` and `thesis` (Title Translator) are disabled in host-less game config, with tooltips
  - Buzz race leaderboard/stats UI is hidden in host-less mode
- Runtime state persistence in Postgres (scores, question cursor, buzz state, done questions, streaks, double points)
- Custom round template library:
  - Create/edit user-defined rounds in the host setup flow
  - Browse/search saved community rounds by name, intro, or question content
  - Add/remove community rounds from the current run of show without deleting the template
  - Preview community rounds in a shared preview modal with infinite scroll + lazy media loading
- Base round content is read-only; question editing/deleting is for custom rounds/templates
- Host companion tools (timer stop/restart, SFX trigger, answer view)
- End session fully kills the session code (cannot be reused)

## Prerequisites

- Node `>=20.19.0 <23` (repo pins `22.12.0` in `.nvmrc`)
- Postgres 16+ (local Docker setup included)

## Environment

Copy `.env.example` to `.env` and set values:

```bash
cp .env.example .env
```

Minimum required locally:

```env
DATABASE_URL=postgresql://sankofa:sankofa@localhost:5432/sankofa_showdown
VITE_ENDPOINT=
```

Notes:
- `VITE_ENDPOINT` should be your public app URL in production/ngrok (used for QR/buzzer links).
- Leave `VITE_ENDPOINT` blank for localhost.

## Local Development

Start Postgres:

```bash
docker compose up -d
```

Install deps + run app:

```bash
npm install
npm run dev
```

This runs:
- Frontend: `http://localhost:5173`
- Backend API/Socket server: `http://localhost:3001`

### First-time host flow

1. Open `http://localhost:5173`
2. Choose gameplay mode (`Hosted` or `Host-less`) in Session Gate
3. Create session or resume session
4. Enter teams and configure game plan
5. Preview selected questions/rounds, then start game
6. (Hosted only) Complete optional Companion setup step
7. Share `/buzz?s=<SESSION_CODE>` URL/QR with players

### Gameplay modes

- `Hosted`
  - Classic buzzer race
  - Host-controlled judging/scoring flow
  - Includes buzz race leaderboard and companion setup step
- `Host-less`
  - Players submit answers directly from `/buzz`
  - First correct answer wins points and locks that question
  - Host manually advances questions
  - Companion setup step is skipped in setup flow
  - Unsupported rounds (`charades`, `thesis`) are disabled in setup

Mode is persisted with the session and included in reconnect/state sync.

### Custom round setup flow

1. In game setup, click `+ New Custom Round` to create a template.
2. Click `Browse Community Rounds` to open the template library modal.
3. Search templates and choose `Add to Run of Show` for the rounds you want in this game.
4. Use `Remove` in the library to remove a community round from the current setup (template stays saved).

Notes:
- Rounds bundled in local JSON under `src/rounds/*` are base rounds, not community templates.
- Community preview uses scrolling auto-pagination and lazy media rendering for faster load on large rounds.

## Production / Railway

This repo is configured for Railway via `railway.toml`:
- Build: `npm run build`
- Start: `node server.js`
- Healthcheck: `GET /api/health`

Required Railway variables:
- `DATABASE_URL`
- `VITE_ENDPOINT=https://<your-service-domain>`

Railway provides `PORT`; server binds to it automatically.

## Auth and Session Model

- Host auth is socket-based via `host:auth` with role:
  - `controller` (main host screen)
  - `companion` (host mobile page)
- Credentials are localStorage-backed for reconnect UX.
- Player join requires:
  - valid session code
  - valid team index
  - non-empty name

### End Session behavior

- `host:end-session` marks DB session as `ended`
- In-memory state is dropped
- Host/companion auth is revoked for sockets in that session
- Session code is dead (subsequent host auth/member join returns `session-not-found`)

## Persistence Model

Persisted in Postgres:
- `sessions`: session code + PIN hash + status + gameplay mode
- `teams`: team metadata + score
- `game_state`: cursor + armed flag + streaks + done questions + double points + host-less answer state
- `buzz_state`: winner + winner member + steal eligibility indices

Persisted in browser localStorage:
- Host credentials (session + pin)
- Session-scoped UI convenience state (teams/scores/done cursor for host UX)
- Player buzzer identity for reconnect

## Testing

Run tests:

```bash
npm test
```

Current suite includes socket race/auth/reconnect/runtime persistence coverage.

Build check:

```bash
npm run build
```

## Project Structure

- `server.js` - server bootstrap, routes, socket wiring
- `backend/socket/*` - host/member socket handlers and room/member utilities
- `backend/state/*` - runtime state shape and DB hydration/persistence
- `src/components/*` - host, companion, buzzer, and gameplay UI
- `src/components/game-config/*` - round setup UI, template editor/preview, and user round library modal
- `src/hooks/*` - host socket/game state/navigation hooks
- `src/rounds/*` - round/question content (Guess the Language now uses YouTube URLs)
- `migrations/*` - schema and runtime persistence migrations

## Credits

- Country outline map icons by [djaiss/mapsicon](https://github.com/djaiss/mapsicon), served via jsDelivr CDN.
- Flag images by [flagcdn.com](https://flagcdn.com).
- Dish and city photos from [Wikimedia Commons](https://commons.wikimedia.org), used under Creative Commons licenses.

## Helpful URLs

- Host: `http://localhost:5173/`
- Host companion: `http://localhost:5173/host-mobile`
- Buzzer page: `http://localhost:5173/buzz?s=<SESSION_CODE>`
