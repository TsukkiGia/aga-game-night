import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEBUG_BUZZ = /^(1|true|yes)$/i.test(process.env.DEBUG_BUZZ || '')

function debugLog(...args) {
  if (DEBUG_BUZZ) console.log(...args)
}

function getHostPin() {
  return String(process.env.HOST_PIN || '').trim()
}

function isHostAuthorized(socket) {
  return socket.data?.isHost === true
}

function isHostController(socket) {
  return socket.data?.isHost === true && socket.data?.hostRole === 'controller'
}

function normalizeHostRole(rawRole) {
  return rawRole === 'companion' ? 'companion' : 'controller'
}

const ALLOWED_SOUND_KEYS = new Set([
  'crickets',
  'faaah',
  'correct_answer',
  'nani',
  'what_the_hell',
  'shocked',
  'airhorn',
  'boo',
  'laughter',
  'okayy',
  'very_wrong',
  'hello_get_down',
  'oh_no_no',
  'dont_provoke_me',
  'why_are_you_running',
])

function getSoundResultTimeoutMs() {
  const raw = Number.parseInt(process.env.SFX_RESULT_TIMEOUT_MS || '', 10)
  if (!Number.isInteger(raw) || raw < 250) return 4000
  return raw
}

function initialState() {
  return {
    teams: [],       // [{ name, color }]
    armed: false,
    buzzedBy: null,  // teamIndex | null
    buzzedMemberName: null,
    allowedTeamIndices: null,  // null = all allowed, Set = only these indices
    members: {},     // { [teamIndex]: { [socketId]: memberName } }
    hostQuestionCursor: null, // [roundIndex, questionIndex|null] | null
  }
}

function serializeEligibilityState(state) {
  return {
    allowedTeamIndices: state.allowedTeamIndices ? [...state.allowedTeamIndices] : null,
  }
}

function serializeMemberSyncState(state) {
  return {
    armed: state.armed,
    buzzedBy: state.buzzedBy,
    buzzedMemberName: state.buzzedMemberName,
    ...serializeEligibilityState(state),
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

  if (normalized.some((team) => team === null)) return null
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

export function createBuzzServer() {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  })

  // Game state (one game at a time)
  let state = initialState()
  const pendingSoundResults = new Map()

  function removeSocketFromAllTeamMembers(socketId) {
    let changed = false
    for (const [teamKey, roster] of Object.entries(state.members)) {
      if (!roster || typeof roster !== 'object') continue
      if (!Object.prototype.hasOwnProperty.call(roster, socketId)) continue
      delete roster[socketId]
      changed = true
      if (Object.keys(roster).length === 0) delete state.members[teamKey]
    }
    return changed
  }

  function leaveAllTeamRooms(socket) {
    for (let i = 0; i < state.teams.length; i++) socket.leave(`team-${i}`)
  }

  function broadcastMembers() {
    // Send host a simple array-of-arrays: index = teamIndex, value = [name, ...]
    const memberNames = state.teams.map((_, i) => Object.values(state.members[i] || {}))
    io.to('host').emit('host:members', memberNames)
  }

  io.on('connection', (socket) => {
    debugLog(`[connect] socket=${socket.id}`)

    socket.on('disconnect', () => {
      debugLog(`[disconnect] socket=${socket.id}`)
      const removed = removeSocketFromAllTeamMembers(socket.id)
      if (removed) broadcastMembers()
    })

    // ── Host: authenticate ────────────────────────────────────
    socket.on('host:auth', (payload, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const configuredPin = getHostPin()
      if (!configuredPin) {
        respond({ ok: false, error: 'host-pin-not-configured' })
        return
      }

      const providedPin = String(typeof payload === 'object' && payload !== null ? payload.pin : payload || '').trim()
      if (!providedPin || providedPin !== configuredPin) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }

      const role = normalizeHostRole(typeof payload === 'object' && payload !== null ? payload.role : 'controller')
      socket.data.isHost = true
      socket.data.hostRole = role
      socket.join('host')
      socket.leave('host-controller')
      if (role === 'controller') socket.join('host-controller')
      respond({ ok: true })
    })

    // ── Host: register teams ──────────────────────────────────
    socket.on('host:setup', (teams, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }

      const normalizedTeams = normalizeTeams(teams)
      if (!normalizedTeams) {
        respond({ ok: false, error: 'invalid-teams' })
        return
      }

      const isNewGame = JSON.stringify(normalizedTeams.map(t => t.name)) !== JSON.stringify(state.teams.map(t => t.name))
      if (isNewGame) {
        state = { ...initialState(), teams: normalizedTeams }
        io.except(socket.id).emit('game:reset')
      } else {
        state.teams = normalizedTeams  // names/colors may have changed, preserve buzzer state
      }
      debugLog(`[host:setup] ${isNewGame ? 'new game' : 'reconnect'} — teams:`, normalizedTeams.map(t => t.name).join(', '))
      socket.emit('state:sync', state)
      io.to('host').emit('host:question', state.hostQuestionCursor)
      broadcastMembers()
      respond({ ok: true })
    })

    // ── Host: current question sync for companion view ─────────
    socket.on('host:question:set', (rawCursor, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      const cursor = normalizeQuestionCursor(rawCursor)
      if (cursor === null && rawCursor !== null) {
        respond({ ok: false, error: 'invalid-cursor' })
        return
      }
      state.hostQuestionCursor = cursor
      io.to('host').emit('host:question', state.hostQuestionCursor)
      respond({ ok: true })
    })

    socket.on('host:question:get', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      respond({ ok: true, activeQuestion: state.hostQuestionCursor })
    })

    socket.on('host:new-game', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      state = initialState()
      io.except(socket.id).emit('game:reset')
      io.to('host').emit('host:question', state.hostQuestionCursor)
      broadcastMembers()
      socket.emit('state:sync', state)
      respond({ ok: true })
    })

    socket.on('host:streak', (payload, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostController(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      const teamIndex = Number.parseInt(payload?.teamIndex, 10)
      const streakCount = Number.parseInt(payload?.streakCount, 10)
      if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= state.teams.length) {
        respond({ ok: false, error: 'invalid-team' })
        return
      }
      if (!Number.isInteger(streakCount) || streakCount < 1) {
        respond({ ok: false, error: 'invalid-streak' })
        return
      }
      io.to('host').emit('host:streak', {
        teamIndex,
        teamName: state.teams[teamIndex]?.name || '',
        streakCount,
      })
      respond({ ok: true })
    })

    socket.on('host:sfx:play', (soundKey, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      const normalizedKey = String(soundKey || '').trim()
      if (!ALLOWED_SOUND_KEYS.has(normalizedKey)) {
        respond({ ok: false, error: 'invalid-sound' })
        return
      }
      const controllerRoom = io.sockets.adapter.rooms.get('host-controller')
      if (!controllerRoom || controllerRoom.size === 0) {
        respond({ ok: false, error: 'no-controller' })
        return
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const timeout = setTimeout(() => {
        const pending = pendingSoundResults.get(requestId)
        if (!pending) return
        pendingSoundResults.delete(requestId)
        io.to(pending.sourceSocketId).emit('host:sfx:result', {
          requestId,
          ok: false,
          error: 'playback-timeout',
        })
      }, getSoundResultTimeoutMs())
      pendingSoundResults.set(requestId, { sourceSocketId: socket.id, timeout })
      io.to('host-controller').emit('host:sfx:play', {
        soundKey: normalizedKey,
        requestId,
        sourceSocketId: socket.id,
      })
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
      const error = ok ? null : String(payload.error || 'playback-failed')
      io.to(pending.sourceSocketId).emit('host:sfx:result', { requestId, ok, error })
    })

    // ── Host: stop countdown timer (from companion) ───────────
    socket.on('host:timer:stop', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      io.to('host-controller').emit('host:timer:stop')
      respond({ ok: true })
    })

    socket.on('host:timer:restart', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      io.to('host-controller').emit('host:timer:restart')
      respond({ ok: true })
    })

    // Controller notifies companions when countdown naturally expires
    socket.on('host:timer:expired', () => {
      if (!isHostController(socket)) return
      io.to('host').emit('host:timer:expired')
    })

    // ── Host: arm the buzzers ──────────────────────────────────
    socket.on('host:arm', (arg1, arg2) => {
      const options = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) ? arg1 : {}
      const respond = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : () => {})
      const allowedIndices = normalizeAllowedTeamIndices(options.allowedTeamIndices, state.teams.length)

      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      debugLog(`[host:arm] armed=${state.armed} buzzedBy=${state.buzzedBy}`)
      if (state.buzzedBy !== null) {
        respond({ ok: false, error: 'buzz-locked' })
        return
      }
      state.armed = true
      state.allowedTeamIndices = allowedIndices
      io.emit('buzz:armed', serializeEligibilityState(state))
      respond({ ok: true })
    })

    // ── Host: reset after a buzz ───────────────────────────────
    socket.on('host:reset', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!isHostAuthorized(socket)) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      debugLog(`[host:reset]`)
      state.armed = false
      state.buzzedBy = null
      state.buzzedMemberName = null
      state.allowedTeamIndices = null
      io.emit('buzz:reset')
      respond({ ok: true })
    })

    // ── Member: get teams list ────────────────────────────────
    socket.on('member:get-teams', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      respond({ teams: state.teams.map(({ name, color }) => ({ name, color })) })
    })

    // ── Member: join with teamIndex + name ────────────────────
    socket.on('member:join', (teamIndex, memberName, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const idx = parseInt(teamIndex, 10)
      const name = (memberName || '').trim() || 'Anonymous'
      debugLog(`[member:join] socket=${socket.id} teamIndex=${idx} name="${name}"`)
      if (isNaN(idx) || idx < 0 || idx >= state.teams.length) {
        debugLog(`[member:join] FAIL — invalid teamIndex`)
        respond({ error: 'Invalid team.' })
        return
      }
      removeSocketFromAllTeamMembers(socket.id)
      leaveAllTeamRooms(socket)
      socket.data.teamIndex = idx
      socket.data.memberName = name
      socket.join(`team-${idx}`)
      if (!state.members[idx]) state.members[idx] = {}
      state.members[idx][socket.id] = name
      debugLog(`[member:join] OK — joined team "${state.teams[idx].name}" as "${name}"`)
      respond({
        team: state.teams[idx],
        teamIndex: idx,
        sync: serializeMemberSyncState(state),
      })
      broadcastMembers()

      // Sync state for late joiners
      if (state.armed)             socket.emit('buzz:armed', serializeEligibilityState(state))
      if (state.buzzedBy !== null) socket.emit('buzz:winner', {
        teamIndex: state.buzzedBy,
        team: state.teams[state.buzzedBy],
        memberName: state.buzzedMemberName,
      })
    })

    // ── Member: buzz ───────────────────────────────────────────
    socket.on('member:buzz', () => {
      debugLog(`[member:buzz] socket=${socket.id} armed=${state.armed} buzzedBy=${state.buzzedBy} teamIndex=${socket.data.teamIndex}`)
      if (!state.armed)                  return
      if (state.buzzedBy !== null)       return
      const idx = socket.data.teamIndex
      if (idx === undefined || idx === null) return
      if (state.allowedTeamIndices !== null && !state.allowedTeamIndices.has(idx)) return

      state.armed = false
      state.buzzedBy = idx
      state.buzzedMemberName = socket.data.memberName
      debugLog(`[member:buzz] broadcasting buzz:winner for team "${state.teams[idx].name}" member "${socket.data.memberName}"`)
      io.emit('buzz:winner', { teamIndex: idx, team: state.teams[idx], memberName: socket.data.memberName })
    })
  })

  // Serve built frontend in production
  app.use(express.static(join(__dirname, 'dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))

  function start(port = 3001, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        httpServer.off('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        httpServer.off('error', onError)
        resolve(httpServer.address())
      }
      httpServer.once('error', onError)
      httpServer.once('listening', onListening)
      httpServer.listen(port, host)
    })
  }

  function stop() {
    return new Promise((resolve, reject) => {
      io.close()
      httpServer.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return { app, io, httpServer, start, stop, getState: () => state }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const PORT = process.env.PORT || 3001
  const server = createBuzzServer()
  server.start(PORT, '0.0.0.0').then(() => {
    console.log(`\n  Buzz server ->  http://localhost:${PORT}\n`)
  }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
