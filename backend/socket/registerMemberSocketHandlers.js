export function registerMemberSocketHandlers(socket, ctx) {
  const {
    io,
    sessions,
    ensureState,
    hostRoom,
    memberTeamRoom,
    serializeMemberSyncState,
    serializeEligibilityState,
    removeFromMembers,
    leaveTeamRooms,
    broadcastMembers,
    persistRuntimeStateInBackground,
    debugLog,
  } = ctx

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
    const st = (await ensureState(code)) || sessions.get(code)
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
    const st = (await ensureState(code)) || sessions.get(code)
    if (!st) {
      respond({ error: 'session-not-found' })
      return
    }
    if (isNaN(idx) || idx < 0 || idx >= st.teams.length) {
      debugLog('[member:join] FAIL — invalid teamIndex')
      respond({ error: 'Invalid team.' })
      return
    }

    // Leave any previous session's team rooms
    const prevCode = socket.data.sessionCode
    if (prevCode && prevCode !== code) leaveTeamRooms(socket, prevCode, (sessions.get(prevCode)?.teams.length || 0))
    if (prevCode) {
      const prevState = sessions.get(prevCode)
      if (prevState) removeFromMembers(socket.id, prevState)
    }
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

    if (st.armed) socket.emit('buzz:armed', serializeEligibilityState(st))
    if (st.buzzedBy !== null) socket.emit('buzz:winner', { teamIndex: st.buzzedBy, team: st.teams[st.buzzedBy], memberName: st.buzzedMemberName, reactionMs: null })
  })

  // ── Member: buzz ────────────────────────────────────────────────────
  socket.on('member:buzz', () => {
    const REACTION_CAPTURE_WINDOW_MS = 15_000
    const code = socket.data.sessionCode
    if (!code) return
    const st = sessions.get(code)
    if (!st) return
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
}
