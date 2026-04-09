import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import bcrypt from 'bcryptjs'
import { runMigrations, query } from './src/db.js'
import { generateSessionCode } from './backend/sessionCode.js'
import { isHostAuthorized, isHostController, normalizeHostRole } from './backend/hostAuth.js'
import { registerHostSocketHandlers } from './backend/socket/registerHostSocketHandlers.js'
import { registerMemberSocketHandlers } from './backend/socket/registerMemberSocketHandlers.js'
import {
  initialState,
  serializeEligibilityState,
  serializeMemberSyncState,
  normalizeQuestionCursor,
  normalizeTeams,
  normalizeAllowedTeamIndices,
  normalizeGamePlan,
} from './backend/state/sessionState.js'
import { createRuntimeStore } from './backend/state/runtimeStore.js'
import { hostRoom, ctrlRoom, memberTeamRoom } from './backend/socket/rooms.js'
import { removeFromMembers, leaveTeamRooms, broadcastMembers } from './backend/socket/memberRegistry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEBUG_BUZZ = /^(1|true|yes)$/i.test(process.env.DEBUG_BUZZ || '')

function debugLog(...args) {
  if (DEBUG_BUZZ) console.log(...args)
}

const ALLOWED_SOUND_KEYS = new Set([
  'crickets', 'faaah', 'correct_answer', 'nani', 'what_the_hell', 'shocked',
  'airhorn', 'boo', 'laughter', 'okayy', 'very_wrong',
  'hello_get_down', 'oh_no_no', 'dont_provoke_me', 'why_are_you_running',
])

function getSoundResultTimeoutMs() {
  const raw = Number.parseInt(process.env.SFX_RESULT_TIMEOUT_MS || '', 10)
  if (!Number.isInteger(raw) || raw < 250) return 4000
  return raw
}

function getAuthWindowMs() {
  const raw = Number.parseInt(process.env.HOST_AUTH_WINDOW_MS || '', 10)
  if (!Number.isInteger(raw) || raw < 1000) return 60_000
  return raw
}

function getAuthMaxAttempts() {
  const raw = Number.parseInt(process.env.HOST_AUTH_MAX_ATTEMPTS || '', 10)
  if (!Number.isInteger(raw) || raw < 1) return 8
  return raw
}

export function createBuzzServer({ queryFn = query } = {}) {
  const app = express()
  app.use(express.json())
  const httpServer = createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  // Per-session in-memory state — keyed by sessionCode
  const sessions = new Map()
  const pendingSoundResults = new Map()
  const authAttempts = new Map()

  function authAttemptKey(socket) {
    return String(socket.handshake.address || socket.id || 'unknown')
  }

  function isAuthRateLimited(socket) {
    const key = authAttemptKey(socket)
    const rec = authAttempts.get(key)
    if (!rec) return false
    if ((Date.now() - rec.windowStart) > getAuthWindowMs()) {
      authAttempts.delete(key)
      return false
    }
    return rec.count >= getAuthMaxAttempts()
  }

  function noteAuthAttempt(socket, ok) {
    const key = authAttemptKey(socket)
    if (ok) {
      authAttempts.delete(key)
      return
    }
    const now = Date.now()
    const rec = authAttempts.get(key)
    if (!rec || (now - rec.windowStart) > getAuthWindowMs()) {
      authAttempts.set(key, { windowStart: now, count: 1 })
      return
    }
    rec.count += 1
  }

  const { getState, ensureState, persistTeams, persistRuntimeState, persistRuntimeStateInBackground } = createRuntimeStore({
    queryFn,
    sessions,
  })
  const leaveMemberTeamRooms = (socket, code, teamCount) => leaveTeamRooms(socket, code, teamCount, memberTeamRoom)
  const broadcastSessionMembers = (code, st) => broadcastMembers(io, hostRoom, code, st)

  // ── REST: health check ───────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // ── REST: create session ────────────────────────────────────────────────
  app.post('/api/sessions', async (req, res) => {
    try {
      const pin = String(req.body?.pin || '').trim()
      if (!pin || pin.length < 4 || pin.length > 8) {
        return res.status(400).json({ error: 'invalid-pin' })
      }
      let code, inserted = false
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateSessionCode()
        try {
          await queryFn('INSERT INTO sessions (id, pin_hash) VALUES ($1, $2)', [
            code, await bcrypt.hash(pin, 10),
          ])
          inserted = true
          break
        } catch (err) {
          if (err.code !== '23505') throw err
        }
      }
      if (!inserted) return res.status(500).json({ error: 'could-not-generate-code' })
      res.json({ sessionCode: code })
    } catch (err) {
      console.error('[POST /api/sessions]', err)
      res.status(500).json({ error: 'server-error' })
    }
  })

  // ── Socket connection ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    debugLog(`[connect] socket=${socket.id}`)

    socket.on('disconnect', () => {
      debugLog(`[disconnect] socket=${socket.id}`)
      const code = socket.data.sessionCode
      if (!code) return
      const st = sessions.get(code)
      if (!st) return
      const changed = removeFromMembers(socket.id, st)
      if (changed) broadcastSessionMembers(code, st)
    })

    registerHostSocketHandlers(socket, {
      queryFn,
      io,
      sessions,
      pendingSoundResults,
      ensureState,
      getState,
      initialState,
      persistTeams,
      persistRuntimeState,
      persistRuntimeStateInBackground,
      hostRoom,
      ctrlRoom,
      normalizeTeams,
      normalizeQuestionCursor,
      normalizeAllowedTeamIndices,
      normalizeGamePlan,
      serializeEligibilityState,
      isHostAuthorized,
      isHostController,
      normalizeHostRole,
      isAuthRateLimited,
      noteAuthAttempt,
      debugLog,
      ALLOWED_SOUND_KEYS,
      getSoundResultTimeoutMs,
      bcrypt,
      broadcastMembers: broadcastSessionMembers,
    })

    registerMemberSocketHandlers(socket, {
      io,
      sessions,
      ensureState,
      hostRoom,
      memberTeamRoom,
      serializeMemberSyncState,
      serializeEligibilityState,
      removeFromMembers,
      leaveTeamRooms: leaveMemberTeamRooms,
      broadcastMembers: broadcastSessionMembers,
      persistRuntimeStateInBackground,
      debugLog,
    })
  })

  // Serve built frontend in production
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))

  function start(port = 3001, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const onError    = (err) => { httpServer.off('listening', onListening); reject(err) }
      const onListening = () => { httpServer.off('error', onError); resolve(httpServer.address()) }
      httpServer.once('error', onError)
      httpServer.once('listening', onListening)
      httpServer.listen(port, host)
    })
  }

  function stop() {
    return new Promise((resolve, reject) => {
      io.close()
      httpServer.close((err) => { if (err) reject(err); else resolve() })
    })
  }

  return {
    app,
    io,
    httpServer,
    start,
    stop,
    getSessions: () => sessions,
    getState: (code) => sessions.get(code),
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const PORT = process.env.PORT || 3001
  runMigrations()
    .then(() => createBuzzServer().start(PORT, '0.0.0.0'))
    .then(() => console.log(`\n  Buzz server ->  http://localhost:${PORT}\n`))
    .catch((err) => { console.error(err); process.exit(1) })
}
