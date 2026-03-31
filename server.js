import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
function initialState() {
  return {
    teams: [],       // [{ name, color, code }]
    armed: false,
    buzzedBy: null,  // teamIndex | null
    buzzedMemberName: null,
    stealLockedOutTeamIndex: null,
    members: {},     // { [teamIndex]: { [socketId]: memberName } }
  }
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
    console.log(`[connect] socket=${socket.id}`)

    socket.on('disconnect', () => {
      console.log(`[disconnect] socket=${socket.id}`)
      const idx = socket.data.teamIndex
      if (idx !== undefined && state.members[idx]) {
        delete state.members[idx][socket.id]
        broadcastMembers()
      }
    })

    // ── Host: register teams + codes ──────────────────────────
    socket.on('host:setup', (teams, callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      const isNewGame = JSON.stringify(teams.map(t => t.name)) !== JSON.stringify(state.teams.map(t => t.name))
      socket.join('host')
      if (isNewGame) {
        state = { ...initialState(), teams }
        io.except(socket.id).emit('game:reset')
      } else {
        state.teams = teams  // names/colors may have changed, preserve buzzer state
      }
      console.log(`[host:setup] ${isNewGame ? 'new game' : 'reconnect'} — teams:`, teams.map(t => t.name).join(', '))
      socket.emit('state:sync', state)
      broadcastMembers()
      respond({ ok: true })
    })

    // ── Host: arm the buzzers ──────────────────────────────────
    socket.on('host:arm', (arg1, arg2) => {
      const options = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) ? arg1 : {}
      const respond = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : () => {})
      const requestedLockout = Number.isInteger(options.lockedOutTeamIndex) ? options.lockedOutTeamIndex : null

      if (!socket.rooms.has('host')) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      console.log(`[host:arm] armed=${state.armed} buzzedBy=${state.buzzedBy}`)
      if (state.buzzedBy !== null) {
        respond({ ok: false, error: 'buzz-locked' })
        return
      }
      state.armed = true
      state.stealLockedOutTeamIndex = requestedLockout
      io.emit('buzz:armed')
      respond({ ok: true })
    })

    // ── Host: reset after a buzz ───────────────────────────────
    socket.on('host:reset', (callback) => {
      const respond = typeof callback === 'function' ? callback : () => {}
      if (!socket.rooms.has('host')) {
        respond({ ok: false, error: 'unauthorized' })
        return
      }
      console.log(`[host:reset]`)
      state.armed = false
      state.buzzedBy = null
      state.buzzedMemberName = null
      state.stealLockedOutTeamIndex = null
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
      console.log(`[member:join] socket=${socket.id} teamIndex=${idx} name="${name}"`)
      if (isNaN(idx) || idx < 0 || idx >= state.teams.length) {
        console.log(`[member:join] FAIL — invalid teamIndex`)
        respond({ error: 'Invalid team.' })
        return
      }
      socket.data.teamIndex = idx
      socket.data.memberName = name
      socket.join(`team-${idx}`)
      if (!state.members[idx]) state.members[idx] = {}
      state.members[idx][socket.id] = name
      console.log(`[member:join] OK — joined team "${state.teams[idx].name}" as "${name}"`)
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
      console.log(`[member:buzz] socket=${socket.id} armed=${state.armed} buzzedBy=${state.buzzedBy} teamIndex=${socket.data.teamIndex}`)
      if (!state.armed)                  return
      if (state.buzzedBy !== null)       return
      const idx = socket.data.teamIndex
      if (idx === undefined || idx === null) return
      if (idx === state.stealLockedOutTeamIndex) return

      state.armed = false
      state.buzzedBy = idx
      state.buzzedMemberName = socket.data.memberName
      console.log(`[member:buzz] broadcasting buzz:winner for team "${state.teams[idx].name}" member "${socket.data.memberName}"`)
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
