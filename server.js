import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// Game state (one game at a time)
let state = {
  teams: [],       // [{ name, color, code }]
  armed: false,
  buzzedBy: null,  // teamIndex | null
  members: {},     // { [teamIndex]: { [socketId]: memberName } }
}

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
  socket.on('host:setup', (teams) => {
    const isNewGame = JSON.stringify(teams.map(t => t.code)) !== JSON.stringify(state.teams.map(t => t.code))
    socket.join('host')
    if (isNewGame) {
      state = { teams, armed: false, buzzedBy: null, members: {} }
    } else {
      state.teams = teams  // names/colors may have changed, preserve buzzer state
    }
    console.log(`[host:setup] ${isNewGame ? 'new game' : 'reconnect'} — teams:`, teams.map(t => `${t.name}=${t.code}`).join(', '))
    socket.emit('state:sync', state)
    broadcastMembers()
  })

  // ── Host: arm the buzzers ──────────────────────────────────
  socket.on('host:arm', () => {
    if (!socket.rooms.has('host')) return  // only host can arm
    console.log(`[host:arm] armed=${state.armed} buzzedBy=${state.buzzedBy}`)
    if (state.buzzedBy !== null) return
    state.armed = true
    io.emit('buzz:armed')
  })

  // ── Host: reset after a buzz ───────────────────────────────
  socket.on('host:reset', () => {
    if (!socket.rooms.has('host')) return  // only host can reset
    console.log(`[host:reset]`)
    state.armed = false
    state.buzzedBy = null
    io.emit('buzz:reset')
  })

  // ── Member: join with code + name ─────────────────────────
  socket.on('member:join', (code, memberName, callback) => {
    const normalised = code.trim().toUpperCase()
    const name = (memberName || '').trim() || 'Anonymous'
    console.log(`[member:join] socket=${socket.id} code="${normalised}" name="${name}" | registered teams: [${state.teams.map(t => t.code).join(', ')}]`)
    const idx = state.teams.findIndex(t => t.code === normalised)
    if (idx === -1) {
      console.log(`[member:join] FAIL — no match`)
      callback({ error: 'Invalid code. Check with your host.' })
      return
    }
    socket.data.teamIndex = idx
    socket.data.memberName = name
    socket.join(`team-${idx}`)
    if (!state.members[idx]) state.members[idx] = {}
    state.members[idx][socket.id] = name
    console.log(`[member:join] OK — joined team "${state.teams[idx].name}" as "${name}"`)
    callback({ team: state.teams[idx], teamIndex: idx })
    broadcastMembers()

    // Sync state for late joiners
    if (state.armed)             socket.emit('buzz:armed')
    if (state.buzzedBy !== null) socket.emit('buzz:winner', {
      teamIndex: state.buzzedBy,
      team: state.teams[state.buzzedBy],
      memberName: socket.data.memberName,
    })
  })

  // ── Member: buzz ───────────────────────────────────────────
  socket.on('member:buzz', () => {
    console.log(`[member:buzz] socket=${socket.id} armed=${state.armed} buzzedBy=${state.buzzedBy} teamIndex=${socket.data.teamIndex}`)
    if (!state.armed)                  return
    if (state.buzzedBy !== null)       return
    const idx = socket.data.teamIndex
    if (idx === undefined || idx === null) return

    state.armed = false
    state.buzzedBy = idx
    console.log(`[member:buzz] broadcasting buzz:winner for team "${state.teams[idx].name}" member "${socket.data.memberName}"`)
    io.emit('buzz:winner', { teamIndex: idx, team: state.teams[idx], memberName: socket.data.memberName })
  })
})

// Serve built frontend in production
app.use(express.static(join(__dirname, 'dist')))
app.get('/{*path}', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Buzz server →  http://localhost:${PORT}\n`)
})
