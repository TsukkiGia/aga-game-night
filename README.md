# Sankofa Showdown

Live team game show app for host + players:
- Host controls gameplay on the main screen (`/`)
- Optional host companion controls on phone (`/host-mobile`)
- Players join and buzz from phones (`/buzz?s=<SESSION_CODE>`)

Tech stack: React 19 + Vite 6 frontend, Express + Socket.IO backend, Postgres persistence.

## Current Capabilities

- Team setup (1-8 teams), live score controls, round/question navigation
- Gameplay mode selector: `Hosted` (classic buzzer) or `Host-less` (answer submission)
- Round configuration supports base rounds plus optional community rounds
- Session + host PIN auth
- Buzzer join with required player name + team selection
- First-buzz wins, lockout, steal flow, reaction-time tracking
- Host-less answer flow:
  - Players submit guesses instead of buzzing
  - Wrong guesses broadcast as live toasts
  - First correct submission locks the question and awards points
  - `charades` and `thesis` are disabled in host-less game config
- Runtime state persistence in Postgres (scores, question cursor, buzz state, done questions, streaks, double points)
- Custom round template library:
  - Create/edit user-defined rounds in the host setup flow
  - Browse/search saved community rounds by name, intro, or question content
  - Add/remove community rounds from the current run of show without deleting the template
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
2. Create session or resume session in Session Gate
3. Enter teams and start game
4. Share `/buzz?s=<SESSION_CODE>` URL/QR with players

### Custom round setup flow

1. In game setup, click `+ New Custom Round` to create a template.
2. Click `Browse Community Rounds` to open the template library modal.
3. Search templates and choose `Add to Run of Show` for the rounds you want in this game.
4. Use `Remove` in the library to remove a community round from the current setup (template stays saved).

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
