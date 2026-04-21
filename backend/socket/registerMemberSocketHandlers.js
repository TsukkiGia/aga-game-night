import { emitAnswerAttempt, emitAnswerCorrect, emitAnswerState } from './answerEvents.js'

export function registerMemberSocketHandlers(socket, ctx) {
  const {
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
    leaveTeamRooms,
    broadcastMembers,
    persistRuntimeStateInBackground,
    debugLog,
  } = ctx

  const HOSTLESS_SUBMIT_COOLDOWN_MS = 700
  const HOSTLESS_MAX_GUESS_LENGTH = 180
  const HOSTLESS_MAX_TRACKED_GUESSES = 400
  const MAX_TEAMS_PER_SESSION = 8

  function ensureHostlessSubmitGuard(code, questionId) {
    const normalizedQuestionId = String(questionId || '').trim()
    const existing = hostlessSubmitGuards.get(code)
    if (existing && existing.questionId === normalizedQuestionId) return existing
    const next = {
      questionId: normalizedQuestionId,
      lastSubmitAtBySocket: new Map(),
      normalizedGuesses: new Set(),
      guessQueue: [],
    }
    hostlessSubmitGuards.set(code, next)
    return next
  }

  function trackNormalizedGuess(guard, guessNorm) {
    guard.normalizedGuesses.add(guessNorm)
    guard.guessQueue.push(guessNorm)
    if (guard.guessQueue.length <= HOSTLESS_MAX_TRACKED_GUESSES) return
    const evicted = guard.guessQueue.shift()
    if (evicted) guard.normalizedGuesses.delete(evicted)
  }

  // ── Member: get teams ───────────────────────────────────────────────
  socket.on('member:get-teams', async (sessionCode, callback) => {
    // Support both (sessionCode, callback) and legacy (callback) signatures
    if (typeof sessionCode === 'function') {
      callback = sessionCode
      sessionCode = null
    }
    const respond = typeof callback === 'function' ? callback : () => {}
    const code = String(sessionCode || '').trim().toUpperCase()
    if (!code) {
      respond({ error: 'session-code-required' })
      return
    }
    let st = sessions.get(code)
    if (!st) {
      try {
        st = await ensureState(code)
      } catch (err) {
        console.error('[member:get-teams]', err)
        respond({ error: 'server-error' })
        return
      }
    }
    if (!st) {
      respond({ error: 'session-not-found' })
      return
    }
    respond({ teams: st.teams.map(({ name, color }) => ({ name, color })) })
  })

  // ── Member: join ────────────────────────────────────────────────────
  socket.on('member:join', async (sessionCode, teamIndex, memberName, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    const code = String(sessionCode || '').trim().toUpperCase()
    const idx = parseInt(teamIndex, 10)
    const name = String(memberName || '').trim()
    debugLog(`[member:join] socket=${socket.id} session=${code} teamIndex=${idx} name="${name}"`)

    if (!code) {
      respond({ error: 'session-code-required' })
      return
    }
    if (!name) {
      respond({ error: 'name-required' })
      return
    }
    if (socket.data?.isHost === true) {
      respond({ error: 'unauthorized' })
      return
    }
    let st = sessions.get(code)
    if (!st) {
      try {
        st = await ensureState(code)
      } catch (err) {
        console.error('[member:join]', err)
        respond({ error: 'server-error' })
        return
      }
    }
    if (!st) {
      respond({ error: 'session-not-found' })
      return
    }
    if (isNaN(idx) || idx < 0 || idx >= st.teams.length) {
      debugLog('[member:join] FAIL — invalid teamIndex')
      respond({ error: 'Invalid team.' })
      return
    }

    // Leave any previous session's rooms.
    const prevCode = socket.data.sessionCode
    if (prevCode && prevCode !== code) {
      const previousTeamCount = Math.max(
        Number.parseInt(sessions.get(prevCode)?.teams?.length, 10) || 0,
        MAX_TEAMS_PER_SESSION
      )
      leaveTeamRooms(socket, prevCode, previousTeamCount)
      socket.leave(`${prevCode}:members`)
    }
    if (prevCode) {
      const prevState = sessions.get(prevCode)
      if (prevState) {
        const changed = removeFromMembers(socket.id, prevState)
        if (changed && prevCode !== code) broadcastMembers(prevCode, prevState)
      }
    }
    leaveTeamRooms(socket, code, st.teams.length)
    socket.leave(`${code}:members`)
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

    if (st.armed) socket.emit('buzz:armed', serializeEligibilityState(st))
    if (st.buzzedBy !== null) socket.emit('buzz:winner', { teamIndex: st.buzzedBy, team: st.teams[st.buzzedBy], memberName: st.buzzedMemberName, reactionMs: null })
    if (isHostlessMode(st.gameplayMode)) socket.emit('answer:state', serializeMemberSyncState(st).answerState)
  })

  // ── Member: buzz ────────────────────────────────────────────────────
  socket.on('member:buzz', () => {
    const REACTION_CAPTURE_WINDOW_MS = 15_000
    if (socket.data?.isHost === true) return
    const code = socket.data.sessionCode
    if (!code) return
    const st = sessions.get(code)
    if (!st) return
    if (isHostlessMode(st.gameplayMode)) return
    debugLog(`[member:buzz] socket=${socket.id} armed=${st.armed} buzzedBy=${st.buzzedBy} teamIndex=${socket.data.teamIndex}`)
    if (!(st.attemptedSocketIds instanceof Set)) st.attemptedSocketIds = new Set()
    if (st.attemptedSocketIds.has(socket.id)) return
    const idx = socket.data.teamIndex
    if (idx === undefined || idx === null) return
    if (!Number.isInteger(idx) || !st.teams[idx]) return
    if (st.allowedTeamIndices !== null && !st.allowedTeamIndices.has(idx)) return

    const memberName = socket.data.memberName ? String(socket.data.memberName) : null
    const reactionStartMs = Number.isFinite(st.armedAtMs)
      ? st.armedAtMs
      : (Number.isFinite(st.lastArmAtMs) ? st.lastArmAtMs : null)
    const reactionMs = Number.isFinite(reactionStartMs)
      ? Math.max(0, Date.now() - reactionStartMs)
      : null

    if (!st.armed) {
      if (st.buzzedBy === null) return
      if (reactionMs === null || reactionMs > REACTION_CAPTURE_WINDOW_MS) return
      io.to(hostRoom(code)).emit('buzz:attempt', {
        teamIndex: idx,
        team: st.teams[idx],
        memberName,
        reactionMs,
        accepted: false,
        outcome: 'locked-out',
        winnerTeamIndex: st.buzzedBy,
      })
      st.attemptedSocketIds.add(socket.id)
      return
    }
    if (st.buzzedBy !== null) return

    st.armed = false
    st.armedAtMs = null
    st.buzzedBy = idx
    st.buzzedMemberName = memberName
    debugLog(`[member:buzz] broadcasting buzz:winner for team "${st.teams[idx].name}" member "${memberName}"`)
    io.to(hostRoom(code)).emit('buzz:attempt', {
      teamIndex: idx,
      team: st.teams[idx],
      memberName,
      reactionMs,
      accepted: true,
      outcome: 'winner',
    })
    st.attemptedSocketIds.add(socket.id)
    io.to(hostRoom(code)).emit('buzz:winner', { teamIndex: idx, team: st.teams[idx], memberName, reactionMs })
    io.to(`${code}:members`).emit('buzz:winner', { teamIndex: idx, team: st.teams[idx], memberName, reactionMs })
    persistRuntimeStateInBackground(code, st)
  })

  // ── Member: host-less answer submit ──────────────────────────────────
  socket.on('member:answer:submit', async (payload, callback) => {
    const respond = typeof callback === 'function' ? callback : () => {}
    if (socket.data?.isHost === true) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const code = socket.data.sessionCode
    if (!code) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    let st = sessions.get(code)
    if (!st) {
      try {
        st = await ensureState(code)
      } catch (err) {
        console.error('[member:answer:submit]', err)
        respond({ ok: false, error: 'server-error' })
        return
      }
    }
    if (!st) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    const idx = socket.data.teamIndex
    if (!Number.isInteger(idx) || idx < 0 || !st.teams[idx]) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }
    if (!isHostlessMode(st.gameplayMode)) {
      respond({ ok: false, error: 'unauthorized' })
      return
    }

    const payloadObj = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {}
    const guess = String(payloadObj.guess || '').trim().slice(0, HOSTLESS_MAX_GUESS_LENGTH)
    const submittedQuestionId = String(payloadObj.questionId || '').trim()
    if (!guess) {
      respond({ ok: false, error: 'invalid-guess' })
      return
    }

    const context = resolveHostlessQuestionContext(st)
    if (context.itemType !== 'question' || !context.cursorId) {
      respond({ ok: false, error: 'question-locked' })
      return
    }
    if (submittedQuestionId && submittedQuestionId !== context.cursorId) {
      respond({ ok: false, error: 'stale-question' })
      return
    }
    if (!isHostlessRoundSupported(context.roundType) || !Array.isArray(context.expectedAnswers) || context.expectedAnswers.length === 0) {
      respond({ ok: false, error: 'unsupported-round' })
      return
    }

    if (String(st?.answerState?.questionId || '') !== context.cursorId) {
      st.answerState = {
        questionId: context.cursorId,
        status: context.canAcceptAnswers ? 'open' : 'locked',
        winner: null,
        recentAttempts: [],
      }
    }
    if (st.answerState?.status !== 'open') {
      respond({ ok: false, error: 'question-locked' })
      return
    }

    const guard = ensureHostlessSubmitGuard(code, context.cursorId)
    const now = Date.now()
    const guessNorm = normalizeGuessForMatch(guess)
    if (!guessNorm) {
      respond({ ok: false, error: 'invalid-guess' })
      return
    }
    if (guard.normalizedGuesses.has(guessNorm)) {
      respond({ ok: false, error: 'duplicate-guess' })
      return
    }
    const lastSubmitAt = Number(guard.lastSubmitAtBySocket.get(socket.id) || 0)
    if (now - lastSubmitAt < HOSTLESS_SUBMIT_COOLDOWN_MS) {
      respond({ ok: false, error: 'rate-limited' })
      return
    }

    guard.lastSubmitAtBySocket.set(socket.id, now)
    trackNormalizedGuess(guard, guessNorm)

    const memberName = socket.data.memberName ? String(socket.data.memberName) : null
    const team = st.teams[idx]
    const basePayload = {
      teamIndex: idx,
      team: { name: String(team.name || ''), color: String(team.color || '') },
      memberName,
      guess,
      timestamp: now,
      questionId: context.cursorId,
    }

    if (isGuessCorrect(guess, context.expectedAnswer, context.expectedAnswers)) {
      const points = resolveHostlessPoints(context.round)
      st.teams[idx].score = Number(st.teams[idx].score || 0) + points
      lockAnswerState(st, {
        teamIndex: idx,
        memberName,
        guess,
        answer: context.expectedAnswer,
        points,
        questionId: context.cursorId,
        timestamp: now,
      })
      const correctPayload = { ...basePayload, points, answer: context.expectedAnswer }
      io.to(hostRoom(code)).emit('state:sync', serializeHostSyncState(st))
      emitAnswerCorrect(io, hostRoom, code, correctPayload)
      const answerState = serializeMemberSyncState(st).answerState
      emitAnswerState(io, hostRoom, code, answerState)
      persistTeams(code, st.teams).catch((err) => {
        console.error('[persistTeams/member:answer:submit]', err)
      })
      persistRuntimeStateInBackground(code, st)
      respond({ ok: true, correct: true, points })
      return
    }

    recordWrongAttempt(st, {
      teamIndex: idx,
      memberName,
      guess,
      questionId: context.cursorId,
      timestamp: now,
    })
    emitAnswerAttempt(io, hostRoom, code, basePayload)
    const answerState = serializeMemberSyncState(st).answerState
    emitAnswerState(io, hostRoom, code, answerState)
    persistRuntimeStateInBackground(code, st)
    respond({ ok: true, correct: false })
  })

  socket.on('disconnect', () => {
    const code = socket.data.sessionCode
    if (!code) return
    const guard = hostlessSubmitGuards.get(code)
    if (!guard) return
    guard.lastSubmitAtBySocket.delete(socket.id)
  })
}
