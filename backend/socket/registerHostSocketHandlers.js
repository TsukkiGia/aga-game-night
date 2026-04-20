export function registerHostSocketHandlers(socket, ctx) {
  const {
    queryFn,
    io,
    sessions,
    pendingSoundResults,
    ensureState,
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
    removeFromMembers,
    broadcastMembers,
  } = ctx

  function clearHostAuthorization(targetSocket) {
    const code = String(targetSocket?.data?.sessionCode || '').trim().toUpperCase()
    if (code) {
      targetSocket.leave(hostRoom(code))
      targetSocket.leave(ctrlRoom(code))
    }
    targetSocket.data.isHost = false
    targetSocket.data.hostRole = null
    targetSocket.data.sessionCode = undefined
  }

  function clearMemberIdentity(targetSocket) {
    const code = String(targetSocket?.data?.sessionCode || '').trim().toUpperCase()
    if (!code) {
      targetSocket.data.teamIndex = undefined
      targetSocket.data.memberName = undefined
      return
    }

    const st = sessions.get(code)
    targetSocket.leave(`${code}:members`)
    const teamCount = Math.max(Number.parseInt(st?.teams?.length, 10) || 0, 8)
    for (let i = 0; i < teamCount; i += 1) {
      targetSocket.leave(`${code}:team-${i}`)
    }

    if (st) {
      const changed = removeFromMembers(targetSocket.id, st)
      if (changed) broadcastMembers(code, st)
    }

    targetSocket.data.teamIndex = undefined
    targetSocket.data.memberName = undefined
  }

  function emitStateSync(targetSocket, st) {
    targetSocket.emit('state:sync', serializeHostSyncState(st))
  }

  function broadcastAnswerState(code, st) {
    const answerState = serializeHostSyncState(st).answerState
    io.to(hostRoom(code)).emit('answer:state', answerState)
    io.to(`${code}:members`).emit('answer:state', answerState)
  }

  function lockAnswerStateForHostedMode(st) {
    const context = resolveHostlessQuestionContext(st)
    st.answerState = {
      questionId: context.cursorId,
      status: 'locked',
      winner: null,
      recentAttempts: [],
    }
  }

  function ensureAnswerStateForMode(st, { forceReset = false } = {}) {
    const currentQuestionId = String(st?.answerState?.questionId || '')
    const context = resolveHostlessQuestionContext(st)
    const nextQuestionId = String(context.cursorId || '')
    const questionChanged = currentQuestionId !== nextQuestionId
    if (isHostlessMode(st?.gameplayMode)) {
      if (forceReset || questionChanged) resetAnswerStateForCursor(st)
      return
    }
    if (forceReset || questionChanged || st?.answerState?.status !== 'locked') {
      lockAnswerStateForHostedMode(st)
    }
  }

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

      clearMemberIdentity(socket)
      clearHostAuthorization(socket)
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
  socket.on('host:setup', async (payload, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    const payloadObj = (payload && typeof payload === 'object' && !Array.isArray(payload))
      ? payload
      : null
    const rawTeams = payloadObj ? payloadObj.teams : payload
    const normalizedTeams = normalizeTeams(rawTeams)
    if (!normalizedTeams) {
      respond({ ok: false, error: 'invalid-teams' })
      return
    }
    const hasIncomingGamePlan = Boolean(payloadObj && Object.hasOwn(payloadObj, 'gamePlan'))
    const hasIncomingRoundCatalog = Boolean(payloadObj && Object.hasOwn(payloadObj, 'roundCatalog'))
    const hasIncomingGameplayMode = Boolean(payloadObj && Object.hasOwn(payloadObj, 'gameplayMode'))
    const incomingGamePlan = hasIncomingGamePlan
      ? normalizeGamePlan(payloadObj.gamePlan)
      : null
    const incomingRoundCatalog = hasIncomingRoundCatalog
      ? normalizeRoundCatalog(payloadObj.roundCatalog)
      : null
    const incomingGameplayMode = hasIncomingGameplayMode
      ? normalizeGameplayMode(payloadObj.gameplayMode)
      : null
    try {
      let st = await ensureState(code)
      if (!st) {
        respond({ ok: false, error: 'session-not-found' })
        return
      }
      const previousGameplayMode = normalizeGameplayMode(st.gameplayMode)

      const isNewGame = JSON.stringify(normalizedTeams.map(t => t.name)) !== JSON.stringify(st.teams.map(t => t.name))
      if (isNewGame) {
        st = {
          ...initialState(),
          teams: normalizedTeams.map((team) => ({ ...team, score: Number.isFinite(team.score) ? team.score : 0 })),
          streaks: normalizedTeams.map(() => 0),
          doneQuestions: [],
          doublePoints: false,
          gamePlan: hasIncomingGamePlan ? incomingGamePlan : normalizeGamePlan(st?.gamePlan),
          roundCatalog: hasIncomingRoundCatalog ? incomingRoundCatalog : normalizeRoundCatalog(st?.roundCatalog),
          reactionStats: {},
          gameplayMode: hasIncomingGameplayMode ? incomingGameplayMode : normalizeGameplayMode(st?.gameplayMode),
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
        st.gamePlan = hasIncomingGamePlan ? incomingGamePlan : normalizeGamePlan(st.gamePlan)
        st.roundCatalog = hasIncomingRoundCatalog ? incomingRoundCatalog : normalizeRoundCatalog(st.roundCatalog)
        st.reactionStats = normalizeReactionStats(st.reactionStats)
        st.gameplayMode = normalizeGameplayMode(st.gameplayMode)
      }
      const gameplayModeChanged = normalizeGameplayMode(st.gameplayMode) !== previousGameplayMode
      ensureAnswerStateForMode(st, { forceReset: isNewGame || gameplayModeChanged })
      if (isNewGame || gameplayModeChanged) hostlessSubmitGuards.delete(code)

      await persistTeams(code, st.teams)
      await persistRuntimeState(code, st)

      debugLog(`[host:setup] ${isNewGame ? 'new game' : 'reconnect'} — teams:`, normalizedTeams.map(t => t.name).join(', '))
      emitStateSync(socket, st)
      io.to(hostRoom(code)).emit('host:question', st.hostQuestionCursor)
      broadcastAnswerState(code, st)
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
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:runtime:update]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }

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
    const normalizedGamePlan = Array.isArray(payload.gamePlan)
      ? normalizeGamePlan(payload.gamePlan)
      : normalizeGamePlan(st.gamePlan)
    const normalizedRoundCatalog = Array.isArray(payload.roundCatalog)
      ? normalizeRoundCatalog(payload.roundCatalog)
      : normalizeRoundCatalog(st.roundCatalog)
    const normalizedReactionStats = normalizeReactionStats(payload.reactionStats ?? st.reactionStats)
    const normalizedGameplayMode = Object.hasOwn(payload, 'gameplayMode')
      ? normalizeGameplayMode(payload.gameplayMode, normalizeGameplayMode(st.gameplayMode))
      : normalizeGameplayMode(st.gameplayMode)

    st.teams = normalizedTeams.map((team, index) => ({
      ...team,
      score: Number.isFinite(team.score) ? team.score : (Number.isFinite(st.teams[index]?.score) ? st.teams[index].score : 0),
    }))
    st.doneQuestions = normalizedDoneQuestions
    st.streaks = normalizedStreaks
    st.doublePoints = Boolean(payload.doublePoints)
    st.gamePlan = normalizedGamePlan
    st.roundCatalog = normalizedRoundCatalog
    st.reactionStats = normalizedReactionStats
    st.gameplayMode = normalizedGameplayMode
    ensureAnswerStateForMode(st)

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
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:question:set]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
    st.hostQuestionCursor = cursor
    ensureAnswerStateForMode(st, { forceReset: true })
    hostlessSubmitGuards.delete(code)
    try {
      await persistRuntimeState(code, st)
      io.to(hostRoom(code)).emit('host:question', cursor)
      broadcastAnswerState(code, st)
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
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:question:get]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
    respond({
      ok: true,
      activeQuestion: st.hostQuestionCursor,
      gamePlan: normalizeGamePlan(st.gamePlan),
      roundCatalog: normalizeRoundCatalog(st.roundCatalog),
      gameplayMode: normalizeGameplayMode(st.gameplayMode),
      answerState: serializeHostSyncState(st).answerState,
    })
  })

  socket.on('host:end-session', async (callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    try {
      const result = await queryFn("UPDATE sessions SET status = 'ended' WHERE id = $1 AND status = 'active'", [code])
      if (result.rowCount === 0) {
        clearHostAuthorization(socket)
        respond({ ok: false, error: 'session-not-found' })
        return
      }
      hostlessSubmitGuards.delete(code)
      sessions.delete(code)
      const hostSockets = await io.in(hostRoom(code)).fetchSockets()
      io.to(hostRoom(code)).emit('game:reset')
      io.to(`${code}:members`).emit('game:reset')
      for (const hostSocket of hostSockets) clearHostAuthorization(hostSocket)
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
    let existing
    try {
      existing = await ensureState(code)
    } catch (err) {
      console.error('[host:new-game]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!existing) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
    const nextState = initialState()
    nextState.gameplayMode = normalizeGameplayMode(existing.gameplayMode)
    sessions.set(code, nextState)
    hostlessSubmitGuards.delete(code)
    const st = sessions.get(code)
    try {
      await persistTeams(code, st.teams)
      await persistRuntimeState(code, st)
      io.to(hostRoom(code)).except(socket.id).emit('game:reset')
      io.to(`${code}:members`).emit('game:reset')
      io.to(hostRoom(code)).emit('host:question', st.hostQuestionCursor)
      broadcastMembers(code, st)
      emitStateSync(socket, st)
      broadcastAnswerState(code, st)
      respond({ ok: true })
    } catch (err) {
      console.error('[host:new-game]', err)
      respond({ ok: false, error: 'server-error' })
    }
  })

  socket.on('host:streak', async (payload, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (!isHostController(socket)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:streak]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
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

  socket.on('host:timer:expired', async () => {
    if (!isHostController(socket)) return
    const code = socket.data.sessionCode
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:timer:expired]', err)
      return
    }
    if (!st) return
    if (isHostlessMode(st.gameplayMode)) return
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
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:arm]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
    if (isHostlessMode(st.gameplayMode)) {
      respond({ ok: false, error: 'unsupported-mode' })
      return
    }
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
    let st
    try {
      st = await ensureState(code)
    } catch (err) {
      console.error('[host:reset]', err)
      respond({ ok: false, error: 'server-error' })
      return
    }
    if (!st) {
      respond({ ok: false, error: 'session-not-found' })
      return
    }
    debugLog('[host:reset]')
    if (isHostlessMode(st.gameplayMode)) {
      ensureAnswerStateForMode(st, { forceReset: true })
      hostlessSubmitGuards.delete(code)
      broadcastAnswerState(code, st)
      try {
        await persistRuntimeState(code, st)
        respond({ ok: true })
      } catch (err) {
        console.error('[host:reset]', err)
        respond({ ok: false, error: 'server-error' })
      }
      return
    }
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
