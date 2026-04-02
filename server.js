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

function initialState() {
  return {
    teams: [],       // [{ name, color }]
    armed: false,
    buzzedBy: null,  // teamIndex | null
    buzzedMemberName: null,
    stealLockedOutTeamIndex: null,
    allowedTeamIndices: null,  // null = all allowed, Set = only these indices
    members: {},     // { [teamIndex]: { [socketId]: memberName } }
    hostQuestionCursor: null, // [roundIndex, questionIndex|null] | null
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

export function createBuzzServer() {
  const app = express()
  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  })

  // Game state (one game at a time)
  let state = initialState()

  function broadcastMembers() {
    // Send host a simple array-of-arrays: index = teamIndex, value = [name, ...]
    const memberNames = state.teams.map((_, i) => Object.values(state.members[i] || {}))
    io.to('host').emit('host:members', memberNames)
  }

  io.on('connection', (socket) => {
    debugLog(`[connect] socket=${socket.id}`)

    socket.on('disconnect', () => {
      debugLog(`[disconnect] socket=${socket.id}`)
      const idx = socket.data.teamIndex
      if (idx !== undefined && state.members[idx]) {
        delete state.members[idx][socket.id]
        broadcastMembers()
      }
    })

    // ── Host: authenticate ────────────────────────────────────
    socket.on('host:auth', (pin, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const configuredPin = getHostPin()
      if (!configuredPin) {
        respond({ ok: false, error: 'host-pin-not-configured' })
        return
      }

      const providedPin = String(pin || '').trim()
      if (!providedPin || providedPin !== configuredPin) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }

      socket.data.isHost = true
      socket.join('host')
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

    // ── Host: arm the buzzers ──────────────────────────────────
    socket.on('host:arm', (arg1, arg2) => {
      const options = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) ? arg1 : {}
      const respond = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : () => {})
      const requestedLockout = Number.isInteger(options.lockedOutTeamIndex) ? options.lockedOutTeamIndex : null
      const allowedIndices = Array.isArray(options.allowedTeamIndices) ? new Set(options.allowedTeamIndices) : null

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
      state.stealLockedOutTeamIndex = requestedLockout
      state.allowedTeamIndices = allowedIndices
      io.emit('buzz:armed')
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
      state.stealLockedOutTeamIndex = null
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
      socket.data.teamIndex = idx
      socket.data.memberName = name
      socket.join(`team-${idx}`)
      if (!state.members[idx]) state.members[idx] = {}
      state.members[idx][socket.id] = name
      debugLog(`[member:join] OK — joined team "${state.teams[idx].name}" as "${name}"`)
      respond({
        team: state.teams[idx],
        teamIndex: idx,
        sync: {
          armed: state.armed,
          buzzedBy: state.buzzedBy,
          buzzedMemberName: state.buzzedMemberName,
        },
      })
      broadcastMembers()

      // Sync state for late joiners
      if (state.armed)             socket.emit('buzz:armed')
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
      if (idx === state.stealLockedOutTeamIndex) return
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
