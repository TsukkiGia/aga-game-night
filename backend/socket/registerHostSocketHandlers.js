export function registerHostSocketHandlers(socket, ctx) {
  const {
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
    broadcastMembers,
  } = ctx

  // ── Host: authenticate ──────────────────────────────────────────────
  socket.on('host:auth', async (payload, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    const code = String(payload?.sessionCode || '').trim().toUpperCase()
    const pin = String(payload?.pin || '').trim()
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
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const normalizedTeams = normalizeTeams(teams)
    if (!normalizedTeams) {
      respond({ ok: false, error: 'invalid-teams' })
      return
    }
    try {
      let st = await ensureState(code)
      if (!st) {
        st = { ...initialState(), teams: normalizedTeams }
        sessions.set(code, st)
      }

      const isNewGame = JSON.stringify(normalizedTeams.map(t => t.name)) !== JSON.stringify(st.teams.map(t => t.name))
      if (isNewGame) {
        st = {
          ...initialState(),
          teams: normalizedTeams.map((team) => ({ ...team, score: Number.isFinite(team.score) ? team.score : 0 })),
          streaks: normalizedTeams.map(() => 0),
          doneQuestions: [],
          doublePoints: false,
        }
        sessions.set(code, st)
        io.to(hostRoom(code)).except(socket.id).emit('game:reset')
        io.to(`${code}:members`).emit('game:reset')
      } else {
        st.teams = normalizedTeams.map((team, index) => ({
          ...team,
          score: Number.isFinite(st.teams[index]?.score) ? st.teams[index].score : (Number.isFinite(team.score) ? team.score : 0),
        }))
        st.streaks = st.teams.map((_, index) => {
          const parsed = Number.parseInt(st.streaks?.[index], 10)
          return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
        })
        if (!Array.isArray(st.doneQuestions)) st.doneQuestions = []
        st.doublePoints = Boolean(st.doublePoints)
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

  socket.on('host:runtime:update', async (payload, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      respond({ ok: false, error: 'invalid-payload' })
      return
    }

    const code = socket.data.sessionCode
    const st = (await ensureState(code)) || getState(code)

    const normalizedTeams = normalizeTeams(payload.teams)
    if (!normalizedTeams || normalizedTeams.length !== st.teams.length) {
      respond({ ok: false, error: 'invalid-teams' })
      return
    }

    const normalizedDoneQuestions = Array.isArray(payload.doneQuestions)
      ? payload.doneQuestions
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .slice(0, 500)
      : []

    const normalizedStreaks = Array.isArray(payload.streaks)
      ? st.teams.map((_, index) => {
          const parsed = Number.parseInt(payload.streaks[index], 10)
          return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
        })
      : st.teams.map(() => 0)

    st.teams = normalizedTeams.map((team, index) => ({
      ...team,
      score: Number.isFinite(team.score) ? team.score : (Number.isFinite(st.teams[index]?.score) ? st.teams[index].score : 0),
    }))
    st.doneQuestions = normalizedDoneQuestions
    st.streaks = normalizedStreaks
    st.doublePoints = Boolean(payload.doublePoints)

    try {
      await persistTeams(code, st.teams)
      await persistRuntimeState(code, st)
      respond({ ok: true })
    } catch (err) {
      console.error('[host:runtime:update]', err)
      respond({ ok: false, error: 'server-error' })
    }
  })

  // ── Host: question cursor ───────────────────────────────────────────
  socket.on('host:question:set', async (rawCursor, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const cursor = normalizeQuestionCursor(rawCursor)
    if (cursor === null && rawCursor !== null) {
      respond({ ok: false, error: 'invalid-cursor' })
      return
    }
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
    if (!isHostAuthorized(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const st = (await ensureState(code)) || getState(code)
    respond({ ok: true, activeQuestion: st.hostQuestionCursor })
  })

  socket.on('host:end-session', async (callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
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
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
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
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const st = getState(code)
    const teamIndex = Number.parseInt(payload?.teamIndex, 10)
    const streakCount = Number.parseInt(payload?.streakCount, 10)
    if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= st.teams.length) {
      respond({ ok: false, error: 'invalid-team' })
      return
    }
    if (!Number.isInteger(streakCount) || streakCount < 1) {
      respond({ ok: false, error: 'invalid-streak' })
      return
    }
    io.to(hostRoom(code)).emit('host:streak', { teamIndex, teamName: st.teams[teamIndex]?.name || '', streakCount })
    respond({ ok: true })
  })

  // ── Sound ───────────────────────────────────────────────────────────
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
    const code = socket.data.sessionCode
    const ctrl = io.sockets.adapter.rooms.get(ctrlRoom(code))
    if (!ctrl || ctrl.size === 0) {
      respond({ ok: false, error: 'no-controller' })
      return
    }
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
    if (!isHostAuthorized(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    io.to(ctrlRoom(socket.data.sessionCode)).emit('host:timer:stop')
    respond({ ok: true })
  })

  socket.on('host:timer:restart', (callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostAuthorized(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
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
    st.lastArmAtMs = null
    st.attemptedSocketIds = new Set()
    io.to(hostRoom(code)).emit('host:timer:expired')
    persistRuntimeStateInBackground(code, st)
  })

  // ── Buzzers ─────────────────────────────────────────────────────────
  socket.on('host:arm', async (arg1, arg2) => {
    const options = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) ? arg1 : {}
    const respond = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : () => {})
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const st = (await ensureState(code)) || getState(code)
    const allowedIndices = normalizeAllowedTeamIndices(options.allowedTeamIndices, st.teams.length)
    debugLog(`[host:arm] armed=${st.armed} buzzedBy=${st.buzzedBy}`)
    if (st.buzzedBy !== null) {
      respond({ ok: false, error: 'buzz-locked' })
      return
    }
    st.armed = true
    st.armedAtMs = Date.now()
    st.lastArmAtMs = st.armedAtMs
    st.attemptedSocketIds = new Set()
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
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const st = (await ensureState(code)) || getState(code)
    debugLog('[host:reset]')
    st.armed = false
    st.armedAtMs = null
    st.lastArmAtMs = null
    st.attemptedSocketIds = new Set()
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
}
