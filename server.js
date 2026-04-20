import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { runMigrations, query } from './src/db.js'
import { generateSessionCode } from './backend/sessionCode.js'
import { isHostAuthorized, isHostController, normalizeHostRole } from './backend/hostAuth.js'
import { registerHostSocketHandlers } from './backend/socket/registerHostSocketHandlers.js'
import { registerMemberSocketHandlers } from './backend/socket/registerMemberSocketHandlers.js'
import {
  initialState,
  serializeEligibilityState,
  serializeMemberSyncState,
  serializeHostSyncState,
  normalizeQuestionCursor,
  normalizeTeams,
  normalizeAllowedTeamIndices,
  normalizeGamePlan,
  normalizeRoundCatalog,
  normalizeReactionStats,
  normalizeGameplayMode,
} from './backend/state/sessionState.js'
import { createRuntimeStore } from './backend/state/runtimeStore.js'
import { hostRoom, ctrlRoom, memberTeamRoom } from './backend/socket/rooms.js'
import { removeFromMembers, leaveTeamRooms, broadcastMembers } from './backend/socket/memberRegistry.js'
import { normalizeRoundTemplatePayload, roundFromTemplateRow } from './backend/state/roundCatalog.js'
import {
  resetAnswerStateForCursor,
  resolveHostlessQuestionContext,
  recordWrongAttempt,
  lockAnswerState,
  resolveHostlessPoints,
  isGuessCorrect,
  normalizeGuessForMatch,
  isHostlessMode,
  isHostlessRoundSupported,
} from './backend/state/hostlessMode.js'

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
  const hostlessSubmitGuards = new Map()

  async function authenticateHostRequest(sessionCodeRaw, pinRaw) {
    const sessionCode = String(sessionCodeRaw || '').trim().toUpperCase()
    const pin = String(pinRaw || '').trim()
    if (!sessionCode || !pin) return { ok: false, error: 'missing-credentials' }
    const { rows } = await queryFn(
      "SELECT id, pin_hash FROM sessions WHERE id = $1 AND status = 'active'",
      [sessionCode]
    )
    if (rows.length === 0) return { ok: false, error: 'session-not-found' }
    const valid = await bcrypt.compare(pin, rows[0].pin_hash)
    if (!valid) return { ok: false, error: 'unauthorized' }
    return { ok: true, sessionCode }
  }

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
      const gameplayMode = normalizeGameplayMode(req.body?.gameplayMode)
      if (!pin || pin.length < 4 || pin.length > 8) {
        return res.status(400).json({ error: 'invalid-pin' })
      }
      let code, inserted = false
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateSessionCode()
        try {
          await queryFn('INSERT INTO sessions (id, pin_hash, gameplay_mode) VALUES ($1, $2, $3)', [
            code, await bcrypt.hash(pin, 10), gameplayMode,
          ])
          inserted = true
          break
        } catch (err) {
          if (err.code !== '23505') throw err
        }
      }
      if (!inserted) return res.status(500).json({ error: 'could-not-generate-code' })
      res.json({ sessionCode: code, gameplayMode })
    } catch (err) {
      console.error('[POST /api/sessions]', err)
      res.status(500).json({ error: 'server-error' })
    }
  })

  app.get('/api/round-templates', async (req, res) => {
    try {
      const auth = await authenticateHostRequest(
        req.header('x-session-code') || req.query?.sessionCode,
        req.header('x-host-pin') || req.query?.pin
      )
      if (!auth.ok) return res.status(401).json({ error: auth.error })

      const { rows } = await queryFn(
        `
          SELECT id, name, type, intro, rules, scoring, questions, created_at
          FROM round_templates
          WHERE type = 'custom-buzz'
          ORDER BY created_at DESC
          LIMIT 250
        `
      )

      const templates = rows
        .map((row) => roundFromTemplateRow(row))
        .filter(Boolean)

      res.json({ templates })
    } catch (err) {
      console.error('[GET /api/round-templates]', err)
      res.status(500).json({ error: 'server-error' })
    }
  })

  app.post('/api/round-templates', async (req, res) => {
    try {
      const auth = await authenticateHostRequest(
        req.header('x-session-code') || req.body?.sessionCode,
        req.header('x-host-pin') || req.body?.pin
      )
      if (!auth.ok) return res.status(401).json({ error: auth.error })

      const normalizedTemplate = normalizeRoundTemplatePayload(req.body)
      if (!normalizedTemplate) {
        return res.status(400).json({ error: 'invalid-template' })
      }

      const templateId = randomUUID()
      const { rows } = await queryFn(
        `
          INSERT INTO round_templates (
            id,
            name,
            type,
            intro,
            rules,
            scoring,
            questions,
            created_by_session_id
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
          RETURNING id, name, type, intro, rules, scoring, questions, created_at
        `,
        [
          templateId,
          normalizedTemplate.name,
          normalizedTemplate.type,
          normalizedTemplate.intro,
          JSON.stringify(normalizedTemplate.rules),
          JSON.stringify(normalizedTemplate.scoring),
          JSON.stringify(normalizedTemplate.questions),
          auth.sessionCode,
        ]
      )
      const template = roundFromTemplateRow(rows[0] || null)
      if (!template) return res.status(500).json({ error: 'invalid-template-saved' })
      res.status(201).json({ template })
    } catch (err) {
      console.error('[POST /api/round-templates]', err)
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
      normalizeRoundCatalog,
      normalizeReactionStats,
      normalizeGameplayMode,
      serializeHostSyncState,
      resetAnswerStateForCursor,
      resolveHostlessQuestionContext,
      isHostlessMode,
      hostlessSubmitGuards,
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
      persistTeams,
      hostRoom,
      memberTeamRoom,
      serializeHostSyncState,
      serializeMemberSyncState,
      serializeEligibilityState,
      resolveHostlessQuestionContext,
      recordWrongAttempt,
      lockAnswerState,
      resolveHostlessPoints,
      isGuessCorrect,
      normalizeGuessForMatch,
      isHostlessMode,
      isHostlessRoundSupported,
      hostlessSubmitGuards,
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
