import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import bcrypt from 'bcryptjs'
import { runMigrations, query } from './src/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEBUG_BUZZ = /^(1|true|yes)$/i.test(process.env.DEBUG_BUZZ || '')

function debugLog(...args) {
  if (DEBUG_BUZZ) console.log(...args)
}

// Session code — 6 chars, unambiguous alphabet (no 0/O/1/I/L)
const SESSION_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generateSessionCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)]
  return code
}

function isHostAuthorized(socket) {
  return socket.data?.isHost === true
}

function isHostController(socket) {
  return socket.data?.isHost === true && socket.data?.hostRole === 'controller'
}

function normalizeHostRole(rawRole) {
  if (rawRole === 'companion') return 'companion'
  if (rawRole === 'controller') return 'controller'
  return null
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

function initialState() {
  return {
    teams: [],
    armed: false,
    armedAtMs: null,
    buzzedBy: null,
    buzzedMemberName: null,
    allowedTeamIndices: null,
    members: {},
    hostQuestionCursor: null,
  }
}

function serializeEligibilityState(st) {
  return { allowedTeamIndices: st.allowedTeamIndices ? [...st.allowedTeamIndices] : null }
}

function serializeMemberSyncState(st) {
  return {
    armed: st.armed,
    buzzedBy: st.buzzedBy,
    buzzedMemberName: st.buzzedMemberName,
    ...serializeEligibilityState(st),
  }
}

function normalizeQuestionCursor(rawCursor) {
  if (rawCursor === null) return null
  if (!Array.isArray(rawCursor) || rawCursor.length !== 2) return null
  const [roundIndex, questionIndex] = rawCursor
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex !== null && (!Number.isInteger(questionIndex) || questionIndex < 0)) return null
  return [roundIndex, questionIndex]
}

function normalizeTeams(rawTeams) {
  if (!Array.isArray(rawTeams)) return null
  if (rawTeams.length < 1 || rawTeams.length > 8) return null
  const normalized = rawTeams.map((team) => {
    if (!team || typeof team !== 'object') return null
    const name = String(team.name || '').trim()
    const color = String(team.color || '').trim()
    if (!name || !color) return null
    return { name, color }
  })
  if (normalized.some(t => t === null)) return null
  return normalized
}

function normalizeAllowedTeamIndices(rawIndices, teamCount) {
  if (rawIndices === undefined || rawIndices === null) return null
  if (!Array.isArray(rawIndices)) return null
  const next = new Set()
  for (const value of rawIndices) {
    if (!Number.isInteger(value)) continue
    if (value < 0 || value >= teamCount) continue
    next.add(value)
  }
  return next
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

  function getState(code) {
    if (!sessions.has(code)) sessions.set(code, initialState())
    return sessions.get(code)
  }

  async function hydrateStateFromDb(code) {
    const { rows } = await queryFn(
      `
        SELECT
          s.id AS session_id,
          gs.armed AS gs_armed,
          gs.host_question_cursor AS gs_host_question_cursor,
          bs.winner_team_index AS bs_winner_team_index,
          bs.buzzed_member_name AS bs_buzzed_member_name,
          bs.allowed_team_indices AS bs_allowed_team_indices,
          t.idx AS team_idx,
          t.name AS team_name,
          t.color AS team_color
        FROM sessions s
        LEFT JOIN game_state gs ON gs.session_id = s.id
        LEFT JOIN buzz_state bs ON bs.session_id = s.id
        LEFT JOIN teams t ON t.session_id = s.id
        WHERE s.id = $1 AND s.status = 'active'
        ORDER BY t.idx ASC
      `,
      [code]
    )

    if (rows.length === 0) return null

    const first = rows[0] || {}
    const next = initialState()
    next.teams = rows
      .filter((r) => Number.isInteger(r.team_idx))
      .map((r) => ({ name: String(r.team_name || ''), color: String(r.team_color || '') }))
      .filter((team) => team.name && team.color)

    next.armed = Boolean(first.gs_armed)

    const winnerTeamIndex = Number.parseInt(first.bs_winner_team_index, 10)
    next.buzzedBy = Number.isInteger(winnerTeamIndex) ? winnerTeamIndex : null
    next.buzzedMemberName = first.bs_buzzed_member_name ? String(first.bs_buzzed_member_name) : null

    const rawAllowed = first.bs_allowed_team_indices
    if (Array.isArray(rawAllowed)) {
      const parsed = normalizeAllowedTeamIndices(rawAllowed, next.teams.length)
      next.allowedTeamIndices = parsed
    } else {
      next.allowedTeamIndices = null
    }

    let rawCursor = first.gs_host_question_cursor
    if (typeof rawCursor === 'string') {
      try { rawCursor = JSON.parse(rawCursor) } catch { rawCursor = null }
    }
    next.hostQuestionCursor = normalizeQuestionCursor(rawCursor)

    return next
  }

  async function ensureState(code) {
    if (sessions.has(code)) return sessions.get(code)
    const hydrated = await hydrateStateFromDb(code)
    if (!hydrated) return null
    sessions.set(code, hydrated)
    return hydrated
  }

  async function persistTeams(code, teams) {
    await queryFn('DELETE FROM teams WHERE session_id = $1', [code])
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i]
      await queryFn(
        'INSERT INTO teams (session_id, idx, name, color, score) VALUES ($1, $2, $3, $4, $5)',
        [code, i, team.name, team.color, 0]
      )
    }
  }

  async function persistRuntimeState(code, st) {
    const hostQuestionCursor = st.hostQuestionCursor === null ? null : JSON.stringify(st.hostQuestionCursor)
    const allowedTeamIndices = st.allowedTeamIndices ? [...st.allowedTeamIndices] : null
    await queryFn(
      `
        INSERT INTO game_state (session_id, armed, host_question_cursor)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (session_id)
        DO UPDATE SET
          armed = EXCLUDED.armed,
          host_question_cursor = EXCLUDED.host_question_cursor
      `,
      [code, st.armed, hostQuestionCursor]
    )
    await queryFn(
      `
        INSERT INTO buzz_state (session_id, winner_team_index, buzzed_member_name, allowed_team_indices)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (session_id)
        DO UPDATE SET
          winner_team_index = EXCLUDED.winner_team_index,
          buzzed_member_name = EXCLUDED.buzzed_member_name,
          allowed_team_indices = EXCLUDED.allowed_team_indices
      `,
      [code, st.buzzedBy, st.buzzedMemberName, allowedTeamIndices]
    )
  }

  function persistRuntimeStateInBackground(code, st) {
    persistRuntimeState(code, st).catch((err) => {
      console.error('[persistRuntimeState]', err)
    })
  }

  // Scoped Socket.io room names
  const hostRoom       = (code) => `host:${code}`
  const ctrlRoom       = (code) => `ctrl:${code}`
  const memberTeamRoom = (code, i) => `${code}:team-${i}`

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

  // ── Socket helpers ──────────────────────────────────────────────────────
  function removeFromMembers(socketId, st) {
    let changed = false
    for (const [teamKey, roster] of Object.entries(st.members)) {
      if (!roster || typeof roster !== 'object') continue
      if (!Object.prototype.hasOwnProperty.call(roster, socketId)) continue
      delete roster[socketId]
      changed = true
      if (Object.keys(roster).length === 0) delete st.members[teamKey]
    }
    return changed
  }

  function leaveTeamRooms(socket, code, teamCount) {
    for (let i = 0; i < teamCount; i++) socket.leave(memberTeamRoom(code, i))
  }

  function broadcastMembers(code, st) {
    const memberNames = st.teams.map((_, i) => Object.values(st.members[i] || {}))
    io.to(hostRoom(code)).emit('host:members', memberNames)
  }

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
      if (changed) broadcastMembers(code, st)
    })

    // ── Host: authenticate ──────────────────────────────────────────────
    socket.on('host:auth', async (payload, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const code = String(payload?.sessionCode || '').trim().toUpperCase()
      const pin  = String(payload?.pin || '').trim()
      const role = normalizeHostRole(payload?.role)

      if (isAuthRateLimited(socket)) {
        respond({ ok: false, error: 'rate-limited' })
        return
      }

      if (!code || !pin) {
        noteAuthAttempt(socket, false)
        respond({ ok: false, error: 'missing-credentials' })
        return
      }
      if (!role) {
        noteAuthAttempt(socket, false)
        respond({ ok: false, error: 'invalid-role' })
        return
      }
      try {
        const { rows } = await queryFn(
          "SELECT pin_hash FROM sessions WHERE id = $1 AND status = 'active'",
          [code]
        )
        if (rows.length === 0) {
          noteAuthAttempt(socket, false)
          respond({ ok: false, error: 'session-not-found' })
          return
        }
        const valid = await bcrypt.compare(pin, rows[0].pin_hash)
        if (!valid) {
          noteAuthAttempt(socket, false)
          respond({ ok: false, error: 'unauthorized' })
          return
        }

        socket.data.isHost = true
        socket.data.hostRole = role
        socket.data.sessionCode = code
        socket.join(hostRoom(code))
        socket.leave(ctrlRoom(code))
        if (role === 'controller') socket.join(ctrlRoom(code))
        noteAuthAttempt(socket, true)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:auth]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    // ── Host: register teams ────────────────────────────────────────────
    socket.on('host:setup', async (teams, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      const normalizedTeams = normalizeTeams(teams)
      if (!normalizedTeams) { respond({ ok: false, error: 'invalid-teams' }); return }
      try {
        let st = await ensureState(code)
        if (!st) {
          st = { ...initialState(), teams: normalizedTeams }
          sessions.set(code, st)
        }

        const isNewGame = JSON.stringify(normalizedTeams.map(t => t.name)) !== JSON.stringify(st.teams.map(t => t.name))
        if (isNewGame) {
          st = { ...initialState(), teams: normalizedTeams }
          sessions.set(code, st)
          io.to(hostRoom(code)).except(socket.id).emit('game:reset')
          io.to(`${code}:members`).emit('game:reset')
        } else {
          st.teams = normalizedTeams
        }

        await persistTeams(code, st.teams)
        await persistRuntimeState(code, st)

        debugLog(`[host:setup] ${isNewGame ? 'new game' : 'reconnect'} — teams:`, normalizedTeams.map(t => t.name).join(', '))
        socket.emit('state:sync', st)
        io.to(hostRoom(code)).emit('host:question', st.hostQuestionCursor)
        broadcastMembers(code, st)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:setup]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    // ── Host: question cursor ───────────────────────────────────────────
    socket.on('host:question:set', async (rawCursor, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const cursor = normalizeQuestionCursor(rawCursor)
      if (cursor === null && rawCursor !== null) { respond({ ok: false, error: 'invalid-cursor' }); return }
      const code = socket.data.sessionCode
      const st = (await ensureState(code)) || getState(code)
      st.hostQuestionCursor = cursor
      try {
        await persistRuntimeState(code, st)
        io.to(hostRoom(code)).emit('host:question', cursor)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:question:set]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    socket.on('host:question:get', async (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      const st = (await ensureState(code)) || getState(code)
      respond({ ok: true, activeQuestion: st.hostQuestionCursor })
    })

    socket.on('host:end-session', async (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      try {
        await queryFn("UPDATE sessions SET status = 'ended' WHERE id = $1", [code])
        sessions.delete(code)
        io.to(hostRoom(code)).emit('game:reset')
        io.to(`${code}:members`).emit('game:reset')
        respond({ ok: true })
      } catch (err) {
        console.error('[host:end-session]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    socket.on('host:new-game', async (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      sessions.set(code, initialState())
      const st = getState(code)
      try {
        await persistTeams(code, st.teams)
        await persistRuntimeState(code, st)
        io.to(hostRoom(code)).except(socket.id).emit('game:reset')
        io.to(`${code}:members`).emit('game:reset')
        io.to(hostRoom(code)).emit('host:question', st.hostQuestionCursor)
        broadcastMembers(code, st)
        socket.emit('state:sync', st)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:new-game]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    socket.on('host:streak', (payload, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      const st = getState(code)
      const teamIndex  = Number.parseInt(payload?.teamIndex, 10)
      const streakCount = Number.parseInt(payload?.streakCount, 10)
      if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= st.teams.length) {
        respond({ ok: false, error: 'invalid-team' }); return
      }
      if (!Number.isInteger(streakCount) || streakCount < 1) {
        respond({ ok: false, error: 'invalid-streak' }); return
      }
      io.to(hostRoom(code)).emit('host:streak', { teamIndex, teamName: st.teams[teamIndex]?.name || '', streakCount })
      respond({ ok: true })
    })

    // ── Sound ───────────────────────────────────────────────────────────
    socket.on('host:sfx:play', (soundKey, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const normalizedKey = String(soundKey || '').trim()
      if (!ALLOWED_SOUND_KEYS.has(normalizedKey)) { respond({ ok: false, error: 'invalid-sound' }); return }
      const code = socket.data.sessionCode
      const ctrl = io.sockets.adapter.rooms.get(ctrlRoom(code))
      if (!ctrl || ctrl.size === 0) { respond({ ok: false, error: 'no-controller' }); return }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const timeout = setTimeout(() => {
        const pending = pendingSoundResults.get(requestId)
        if (!pending) return
        pendingSoundResults.delete(requestId)
        io.to(pending.sourceSocketId).emit('host:sfx:result', { requestId, ok: false, error: 'playback-timeout' })
      }, getSoundResultTimeoutMs())
      pendingSoundResults.set(requestId, { sourceSocketId: socket.id, timeout })
      io.to(ctrlRoom(code)).emit('host:sfx:play', { soundKey: normalizedKey, requestId, sourceSocketId: socket.id })
      respond({ ok: true, requestId })
    })

    socket.on('host:sfx:result', (payload) => {
      if (!isHostController(socket)) return
      if (!payload || typeof payload !== 'object') return
      const requestId = String(payload.requestId || '').trim()
      if (!requestId) return
      const pending = pendingSoundResults.get(requestId)
      if (!pending) return
      clearTimeout(pending.timeout)
      pendingSoundResults.delete(requestId)
      const ok = payload.ok === true
      io.to(pending.sourceSocketId).emit('host:sfx:result', { requestId, ok, error: ok ? null : String(payload.error || 'playback-failed') })
    })

    // ── Timer controls ──────────────────────────────────────────────────
    socket.on('host:timer:stop', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      io.to(ctrlRoom(socket.data.sessionCode)).emit('host:timer:stop')
      respond({ ok: true })
    })

    socket.on('host:timer:restart', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      io.to(ctrlRoom(socket.data.sessionCode)).emit('host:timer:restart')
      respond({ ok: true })
    })

    socket.on('host:timer:expired', () => {
      if (!isHostController(socket)) return
      const code = socket.data.sessionCode
      const st = getState(code)
      // Timer expiry should stop countdown flow, but keep current buzz winner
      // visible until the host explicitly scores/resets.
      st.armed = false
      st.armedAtMs = null
      io.to(hostRoom(code)).emit('host:timer:expired')
      persistRuntimeStateInBackground(code, st)
    })

    // ── Buzzers ─────────────────────────────────────────────────────────
    socket.on('host:arm', async (arg1, arg2) => {
      const options = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) ? arg1 : {}
      const respond = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : () => {})
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      const st = (await ensureState(code)) || getState(code)
      const allowedIndices = normalizeAllowedTeamIndices(options.allowedTeamIndices, st.teams.length)
      debugLog(`[host:arm] armed=${st.armed} buzzedBy=${st.buzzedBy}`)
      if (st.buzzedBy !== null) { respond({ ok: false, error: 'buzz-locked' }); return }
      st.armed = true
      st.armedAtMs = Date.now()
      st.allowedTeamIndices = allowedIndices
      io.to(hostRoom(code)).emit('buzz:armed', serializeEligibilityState(st))
      io.to(`${code}:members`).emit('buzz:armed', serializeEligibilityState(st))
      try {
        await persistRuntimeState(code, st)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:arm]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    socket.on('host:reset', async (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) { respond({ ok: false, error: 'unauthorized' }); return }
      const code = socket.data.sessionCode
      const st = (await ensureState(code)) || getState(code)
      debugLog(`[host:reset]`)
      st.armed = false
      st.armedAtMs = null
      st.buzzedBy = null
      st.buzzedMemberName = null
      st.allowedTeamIndices = null
      io.to(hostRoom(code)).emit('buzz:reset')
      io.to(`${code}:members`).emit('buzz:reset')
      try {
        await persistRuntimeState(code, st)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:reset]', err)
        respond({ ok: false, error: 'server-error' })
      }
    })

    // ── Member: get teams ───────────────────────────────────────────────
    socket.on('member:get-teams', async (sessionCode, callback) => {
      // Support both (sessionCode, callback) and legacy (callback) signatures
      if (typeof sessionCode === 'function') { callback = sessionCode; sessionCode = null }
      const respond = typeof callback === 'function' ? callback : () => {}
      const code = String(sessionCode || '').trim().toUpperCase()
      if (!code) { respond({ error: 'session-code-required' }); return }
      const st = (await ensureState(code)) || sessions.get(code)
      if (!st) { respond({ error: 'session-not-found' }); return }
      respond({ teams: st.teams.map(({ name, color }) => ({ name, color })) })
    })

    // ── Member: join ────────────────────────────────────────────────────
    socket.on('member:join', async (sessionCode, teamIndex, memberName, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const code = String(sessionCode || '').trim().toUpperCase()
      const idx  = parseInt(teamIndex, 10)
      const name = (memberName || '').trim() || 'Anonymous'
      debugLog(`[member:join] socket=${socket.id} session=${code} teamIndex=${idx} name="${name}"`)

      if (!code) { respond({ error: 'session-code-required' }); return }
      const st = (await ensureState(code)) || sessions.get(code)
      if (!st) { respond({ error: 'session-not-found' }); return }
      if (isNaN(idx) || idx < 0 || idx >= st.teams.length) {
        debugLog(`[member:join] FAIL — invalid teamIndex`)
        respond({ error: 'Invalid team.' }); return
      }

      // Leave any previous session's team rooms
      const prevCode = socket.data.sessionCode
      if (prevCode && prevCode !== code) leaveTeamRooms(socket, prevCode, (sessions.get(prevCode)?.teams.length || 0))
      if (prevCode) removeFromMembers(socket.id, sessions.get(prevCode) || {})
      leaveTeamRooms(socket, code, st.teams.length)
      removeFromMembers(socket.id, st)

      socket.data.teamIndex = idx
      socket.data.memberName = name
      socket.data.sessionCode = code
      socket.join(memberTeamRoom(code, idx))
      socket.join(`${code}:members`)
      if (!st.members[idx]) st.members[idx] = {}
      st.members[idx][socket.id] = name
      debugLog(`[member:join] OK — joined team "${st.teams[idx].name}" as "${name}"`)
      respond({ team: st.teams[idx], teamIndex: idx, sync: serializeMemberSyncState(st) })
      broadcastMembers(code, st)

      if (st.armed)             socket.emit('buzz:armed',  serializeEligibilityState(st))
      if (st.buzzedBy !== null) socket.emit('buzz:winner', { teamIndex: st.buzzedBy, team: st.teams[st.buzzedBy], memberName: st.buzzedMemberName, reactionMs: null })
    })

    // ── Member: buzz ────────────────────────────────────────────────────
    socket.on('member:buzz', () => {
      const code = socket.data.sessionCode
      if (!code) return
      const st = sessions.get(code)
      if (!st) return
      debugLog(`[member:buzz] socket=${socket.id} armed=${st.armed} buzzedBy=${st.buzzedBy} teamIndex=${socket.data.teamIndex}`)
      if (!st.armed)              return
      if (st.buzzedBy !== null)   return
      const idx = socket.data.teamIndex
      if (idx === undefined || idx === null) return
      if (st.allowedTeamIndices !== null && !st.allowedTeamIndices.has(idx)) return

      const reactionMs = Number.isFinite(st.armedAtMs) ? Math.max(0, Date.now() - st.armedAtMs) : null
      st.armed = false
      st.armedAtMs = null
      st.buzzedBy = idx
      st.buzzedMemberName = socket.data.memberName
      debugLog(`[member:buzz] broadcasting buzz:winner for team "${st.teams[idx].name}" member "${socket.data.memberName}"`)
      io.to(hostRoom(code)).emit('buzz:winner', { teamIndex: idx, team: st.teams[idx], memberName: socket.data.memberName, reactionMs })
      io.to(`${code}:members`).emit('buzz:winner', { teamIndex: idx, team: st.teams[idx], memberName: socket.data.memberName, reactionMs })
      persistRuntimeStateInBackground(code, st)
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
