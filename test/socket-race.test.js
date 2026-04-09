import test from 'node:test'
import assert from 'node:assert/strict'
import { io as createClient } from 'socket.io-client'
import { createBuzzServer } from '../server.js'

const TEAMS = [
  { name: 'Team A', color: 'ember' },
  { name: 'Team B', color: 'gold' },
]
const HOST_PIN = 'test-pin'

process.env.SFX_RESULT_TIMEOUT_MS = '300'

function createFakeQuery() {
  const sessions = new Map()
  const teamsBySession = new Map()
  const gameStateBySession = new Map()
  const buzzStateBySession = new Map()

  return async function fakeQuery(text, params = []) {
    if (text.includes('INSERT INTO sessions')) {
      const [id, pinHash] = params
      if (sessions.has(id)) {
        const err = new Error('duplicate key value violates unique constraint')
        err.code = '23505'
        throw err
      }
      sessions.set(id, { pin_hash: pinHash, status: 'active' })
      return { rows: [], rowCount: 1 }
    }

    if (text.includes("SELECT pin_hash FROM sessions WHERE id = $1 AND status = 'active'")) {
      const [id] = params
      const session = sessions.get(id)
      if (!session || session.status !== 'active') return { rows: [], rowCount: 0 }
      return { rows: [{ pin_hash: session.pin_hash }], rowCount: 1 }
    }

    if (text.includes('DELETE FROM teams WHERE session_id = $1')) {
      const [sessionId] = params
      teamsBySession.set(sessionId, [])
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('INSERT INTO teams (session_id, idx, name, color, score) VALUES')) {
      const [sessionId, idx, name, color, score] = params
      const current = teamsBySession.get(sessionId) || []
      current.push({ idx, name, color, score })
      current.sort((a, b) => a.idx - b.idx)
      teamsBySession.set(sessionId, current)
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('INSERT INTO game_state (session_id, armed, host_question_cursor)')) {
      const [sessionId, armed, hostQuestionCursorRaw] = params
      let hostQuestionCursor = hostQuestionCursorRaw
      if (typeof hostQuestionCursorRaw === 'string') {
        try { hostQuestionCursor = JSON.parse(hostQuestionCursorRaw) } catch { hostQuestionCursor = null }
      }
      gameStateBySession.set(sessionId, {
        armed: Boolean(armed),
        host_question_cursor: hostQuestionCursor,
      })
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('INSERT INTO buzz_state (session_id, winner_team_index, buzzed_member_name, allowed_team_indices)')) {
      const [sessionId, winnerTeamIndex, buzzedMemberName, allowedTeamIndices] = params
      buzzStateBySession.set(sessionId, {
        winner_team_index: winnerTeamIndex,
        buzzed_member_name: buzzedMemberName,
        allowed_team_indices: Array.isArray(allowedTeamIndices) ? [...allowedTeamIndices] : null,
      })
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('FROM sessions s') && text.includes('LEFT JOIN game_state gs') && text.includes('LEFT JOIN buzz_state bs') && text.includes('LEFT JOIN teams t')) {
      const [sessionId] = params
      const session = sessions.get(sessionId)
      if (!session || session.status !== 'active') return { rows: [], rowCount: 0 }

      const teams = teamsBySession.get(sessionId) || []
      const gs = gameStateBySession.get(sessionId) || { armed: false, host_question_cursor: null }
      const bs = buzzStateBySession.get(sessionId) || {
        winner_team_index: null,
        buzzed_member_name: null,
        allowed_team_indices: null,
      }

      if (teams.length === 0) {
        return {
          rows: [{
            session_id: sessionId,
            gs_armed: gs.armed,
            gs_host_question_cursor: gs.host_question_cursor,
            bs_winner_team_index: bs.winner_team_index,
            bs_buzzed_member_name: bs.buzzed_member_name,
            bs_allowed_team_indices: bs.allowed_team_indices,
            team_idx: null,
            team_name: null,
            team_color: null,
          }],
          rowCount: 1,
        }
      }

      return {
        rows: teams.map((team) => ({
          session_id: sessionId,
          gs_armed: gs.armed,
          gs_host_question_cursor: gs.host_question_cursor,
          bs_winner_team_index: bs.winner_team_index,
          bs_buzzed_member_name: bs.buzzed_member_name,
          bs_allowed_team_indices: bs.allowed_team_indices,
          team_idx: team.idx,
          team_name: team.name,
          team_color: team.color,
        })),
        rowCount: teams.length,
      }
    }

    if (text.includes("UPDATE sessions SET status = 'ended' WHERE id = $1")) {
      const [id] = params
      const session = sessions.get(id)
      if (!session) return { rows: [], rowCount: 0 }
      session.status = 'ended'
      return { rows: [], rowCount: 1 }
    }

    throw new Error(`Unsupported query in test fake: ${text}`)
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitFor(predicate, timeoutMs = 1000, intervalMs = 10) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function check() {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('Timed out waiting for condition'))
        return
      }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

function once(socket, event, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`Timed out waiting for "${event}"`))
    }, timeoutMs)

    function onEvent(payload) {
      clearTimeout(timer)
      resolve(payload)
    }

    socket.once(event, onEvent)
  })
}

function emitAck(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ack timeout for "${event}"`)), 1000)
    socket.emit(event, ...args, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

async function authHost(socket, sessionCode, pin) {
  const result = await emitAck(socket, 'host:auth', { sessionCode, pin, role: 'controller' })
  assert.equal(result.ok, true)
}

async function authCompanion(socket, sessionCode, pin) {
  const result = await emitAck(socket, 'host:auth', { sessionCode, pin, role: 'companion' })
  assert.equal(result.ok, true)
}

function connectSocket(baseUrl) {
  const socket = createClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  })
  return once(socket, 'connect').then(() => socket)
}

async function createHarness() {
  const fakeQuery = createFakeQuery()
  const server = createBuzzServer({ queryFn: fakeQuery })
  const address = await server.start(0, '127.0.0.1')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const sockets = []

  async function connect() {
    const socket = await connectSocket(baseUrl)
    sockets.push(socket)
    return socket
  }

  async function createSession(pin = HOST_PIN) {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const data = await res.json()
    assert.equal(res.ok, true)
    assert.ok(typeof data.sessionCode === 'string' && data.sessionCode.length === 6)
    return { sessionCode: data.sessionCode, pin }
  }

  async function close() {
    for (const socket of sockets) socket.disconnect()
    await server.stop()
  }

  return { connect, close, createSession, getState: server.getState, getSessions: server.getSessions }
}

test('first buzz wins under near-simultaneous buzzes', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    const setupResult = await emitAck(host, 'host:setup', TEAMS)
    assert.equal(setupResult.ok, true)

    const joinA = await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    const joinB = await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')
    assert.equal(joinA.teamIndex, 0)
    assert.equal(joinB.teamIndex, 1)

    const armResult = await emitAck(host, 'host:arm')
    assert.equal(armResult.ok, true)

    const allWinners = []
    const collectWinner = (payload) => allWinners.push(payload)
    host.on('buzz:winner', collectWinner)

    const winnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    memberB.emit('member:buzz')
    const winner = await winnerPromise

    await wait(100)
    host.off('buzz:winner', collectWinner)

    assert.ok(winner.teamIndex === 0 || winner.teamIndex === 1)
    assert.equal(allWinners.length, 1)

    const lockResult = await emitAck(host, 'host:arm')
    assert.equal(lockResult.ok, false)
    assert.equal(lockResult.error, 'buzz-locked')
  } finally {
    await harness.close()
  }
})

test('steal lockout rejects buzzes from the failed team', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')

    await emitAck(host, 'host:arm')
    const firstWinnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    const firstWinner = await firstWinnerPromise
    assert.equal(firstWinner.teamIndex, 0)

    await emitAck(host, 'host:reset')
    const stealEligible = TEAMS.map((_, i) => i).filter((i) => i !== firstWinner.teamIndex)
    await emitAck(host, 'host:arm', { allowedTeamIndices: stealEligible })

    const winners = []
    const collectWinner = (payload) => winners.push(payload)
    host.on('buzz:winner', collectWinner)

    memberA.emit('member:buzz')
    await wait(100)
    assert.equal(winners.length, 0)

    memberB.emit('member:buzz')
    await waitFor(() => winners.length === 1)
    assert.equal(winners[0].teamIndex, 1)

    host.off('buzz:winner', collectWinner)
  } finally {
    await harness.close()
  }
})

test('host receives reaction attempts from locked-out players', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')
    await emitAck(host, 'host:arm')

    const attempts = []
    const collectAttempt = (payload) => attempts.push(payload)
    host.on('buzz:attempt', collectAttempt)

    const winnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    await winnerPromise

    memberB.emit('member:buzz')
    await waitFor(() => attempts.some((a) => a.memberName === 'Bob' && a.accepted === false && a.outcome === 'locked-out'))

    const winnerAttempt = attempts.find((a) => a.memberName === 'Alice')
    assert.equal(Boolean(winnerAttempt), true)
    assert.equal(winnerAttempt.accepted, true)
    assert.equal(winnerAttempt.outcome, 'winner')
    assert.ok(Number.isFinite(winnerAttempt.reactionMs))

    const lockedAttempt = attempts.find((a) => a.memberName === 'Bob' && a.accepted === false)
    assert.equal(Boolean(lockedAttempt), true)
    assert.equal(lockedAttempt.outcome, 'locked-out')
    assert.ok(Number.isFinite(lockedAttempt.reactionMs))

    host.off('buzz:attempt', collectAttempt)
  } finally {
    await harness.close()
  }
})

test('late joiners receive the original winner member name', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const winnerSocket = await harness.connect()
    const lateJoiner = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(winnerSocket, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(host, 'host:arm')

    const winnerBroadcast = once(host, 'buzz:winner')
    winnerSocket.emit('member:buzz')
    await winnerBroadcast

    const syncWinnerPromise = once(lateJoiner, 'buzz:winner')
    const joinLate = await emitAck(lateJoiner, 'member:join', sessionCode, 0, 'Bob')
    assert.equal(joinLate.teamIndex, 0)
    const syncWinner = await syncWinnerPromise

    assert.equal(syncWinner.teamIndex, 0)
    assert.equal(syncWinner.memberName, 'Alice')
  } finally {
    await harness.close()
  }
})

test('reconnected host receives authoritative state via state:sync', async () => {
  const harness = await createHarness()
  try {
    const host1 = await harness.connect()
    const memberA = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host1, sessionCode, pin)
    await emitAck(host1, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(host1, 'host:arm')
    const winnerPromise = once(host1, 'buzz:winner')
    memberA.emit('member:buzz')
    await winnerPromise

    host1.disconnect()

    const host2 = await harness.connect()
    await authHost(host2, sessionCode, pin)
    const stateSyncPromise = once(host2, 'state:sync')
    await emitAck(host2, 'host:setup', TEAMS)
    const stateSync = await stateSyncPromise

    assert.equal(stateSync.armed, false)
    assert.equal(stateSync.buzzedBy, 0)
    assert.equal(stateSync.buzzedMemberName, 'Alice')
  } finally {
    await harness.close()
  }
})

test('state hydrates from database after in-memory cache is cleared', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(host, 'host:question:set', [1, 2])
    await emitAck(host, 'host:arm')

    harness.getSessions().clear()

    const hostAfterClear = await harness.connect()
    await authHost(hostAfterClear, sessionCode, pin)
    const stateSyncPromise = once(hostAfterClear, 'state:sync')
    await emitAck(hostAfterClear, 'host:setup', TEAMS)
    const stateSync = await stateSyncPromise

    assert.equal(stateSync.armed, true)
    assert.deepEqual(stateSync.hostQuestionCursor, [1, 2])
    assert.equal(stateSync.buzzedBy, null)
  } finally {
    await harness.close()
  }
})

test('reconnected members still obey steal lockout while armed', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')

    await emitAck(host, 'host:arm')
    const firstWinnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    const firstWinner = await firstWinnerPromise
    assert.equal(firstWinner.teamIndex, 0)

    await emitAck(host, 'host:reset')
    const stealEligible = TEAMS.map((_, i) => i).filter((i) => i !== firstWinner.teamIndex)
    await emitAck(host, 'host:arm', { allowedTeamIndices: stealEligible })

    memberA.disconnect()
    memberB.disconnect()

    const memberARejoined = await harness.connect()
    const memberBRejoined = await harness.connect()

    const armedA = once(memberARejoined, 'buzz:armed')
    const armedB = once(memberBRejoined, 'buzz:armed')
    await emitAck(memberARejoined, 'member:join', sessionCode, 0, 'Alice2')
    await emitAck(memberBRejoined, 'member:join', sessionCode, 1, 'Bob2')
    await armedA
    await armedB

    const winners = []
    const collectWinner = (payload) => winners.push(payload)
    host.on('buzz:winner', collectWinner)

    memberARejoined.emit('member:buzz')
    await wait(100)
    assert.equal(winners.length, 0)

    memberBRejoined.emit('member:buzz')
    await waitFor(() => winners.length === 1)
    assert.equal(winners[0].teamIndex, 1)

    host.off('buzz:winner', collectWinner)
  } finally {
    await harness.close()
  }
})

test('member:join ack includes authoritative sync state', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const memberC = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')

    await emitAck(host, 'host:arm')
    const armedJoin = await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')
    assert.equal(armedJoin.sync.armed, true)
    assert.equal(armedJoin.sync.buzzedBy, null)
    assert.equal(armedJoin.sync.allowedTeamIndices, null)

    const winnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    await winnerPromise

    const postBuzzJoin = await emitAck(memberC, 'member:join', sessionCode, 1, 'Cara')
    assert.equal(postBuzzJoin.sync.armed, false)
    assert.equal(postBuzzJoin.sync.buzzedBy, 0)
    assert.equal(postBuzzJoin.sync.buzzedMemberName, 'Alice')
    assert.equal(postBuzzJoin.sync.allowedTeamIndices, null)
  } finally {
    await harness.close()
  }
})

test('late join sync carries eligibility metadata', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const lockedOutLateJoiner = await harness.connect()
    const eligibleLateJoiner = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(host, 'host:arm', { allowedTeamIndices: [1] })

    const lockedOutArmed = once(lockedOutLateJoiner, 'buzz:armed')
    const lockedOutJoin = await emitAck(lockedOutLateJoiner, 'member:join', sessionCode, 0, 'Alice')
    const lockedOutPayload = await lockedOutArmed
    assert.equal(lockedOutJoin.sync.armed, true)
    assert.deepEqual(lockedOutJoin.sync.allowedTeamIndices, [1])
    assert.deepEqual(lockedOutPayload.allowedTeamIndices, [1])

    const eligibleArmed = once(eligibleLateJoiner, 'buzz:armed')
    const eligibleJoin = await emitAck(eligibleLateJoiner, 'member:join', sessionCode, 1, 'Bob')
    const eligiblePayload = await eligibleArmed
    assert.equal(eligibleJoin.sync.armed, true)
    assert.deepEqual(eligibleJoin.sync.allowedTeamIndices, [1])
    assert.deepEqual(eligiblePayload.allowedTeamIndices, [1])
  } finally {
    await harness.close()
  }
})

test('member switching teams does not leave ghost roster entries', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)

    const firstJoin = await emitAck(member, 'member:join', sessionCode, 0, 'Alice')
    assert.equal(firstJoin.teamIndex, 0)

    const secondJoin = await emitAck(member, 'member:join', sessionCode, 1, 'Alice')
    assert.equal(secondJoin.teamIndex, 1)

    const state = harness.getState(sessionCode)
    assert.equal(state.members[0]?.[member.id], undefined)
    assert.equal(state.members[1]?.[member.id], 'Alice')
  } finally {
    await harness.close()
  }
})

test('host question cursor sync requires auth and broadcasts updates', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const other = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)

    const unauthorizedSet = await emitAck(other, 'host:question:set', [1, 2])
    assert.equal(unauthorizedSet.ok, false)
    assert.equal(unauthorizedSet.error, 'unauthorized')

    await authHost(other, sessionCode, pin)

    const cursorPromise = once(other, 'host:question')
    const setResult = await emitAck(host, 'host:question:set', [1, 2])
    assert.equal(setResult.ok, true)
    const pushedCursor = await cursorPromise
    assert.deepEqual(pushedCursor, [1, 2])

    const getResult = await emitAck(other, 'host:question:get')
    assert.equal(getResult.ok, true)
    assert.deepEqual(getResult.activeQuestion, [1, 2])
  } finally {
    await harness.close()
  }
})

test('companion cannot run controller-only gameplay mutations', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)
    await emitAck(controller, 'host:setup', TEAMS)

    const setup = await emitAck(companion, 'host:setup', TEAMS)
    assert.equal(setup.ok, false)
    assert.equal(setup.error, 'unauthorized')

    const setQuestion = await emitAck(companion, 'host:question:set', [0, 0])
    assert.equal(setQuestion.ok, false)
    assert.equal(setQuestion.error, 'unauthorized')

    const arm = await emitAck(companion, 'host:arm')
    assert.equal(arm.ok, false)
    assert.equal(arm.error, 'unauthorized')

    const reset = await emitAck(companion, 'host:reset')
    assert.equal(reset.ok, false)
    assert.equal(reset.error, 'unauthorized')

    const newGame = await emitAck(companion, 'host:new-game')
    assert.equal(newGame.ok, false)
    assert.equal(newGame.error, 'unauthorized')

    const endSession = await emitAck(companion, 'host:end-session')
    assert.equal(endSession.ok, false)
    assert.equal(endSession.error, 'unauthorized')
  } finally {
    await harness.close()
  }
})

test('controller can broadcast streak status to host companions', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)
    await emitAck(controller, 'host:setup', TEAMS)

    const streakEvent = once(companion, 'host:streak')
    const streakResult = await emitAck(controller, 'host:streak', { teamIndex: 1, streakCount: 3 })
    assert.equal(streakResult.ok, true)
    const payload = await streakEvent
    assert.equal(payload.teamIndex, 1)
    assert.equal(payload.teamName, TEAMS[1].name)
    assert.equal(payload.streakCount, 3)

    const unauthorized = await emitAck(companion, 'host:streak', { teamIndex: 1, streakCount: 3 })
    assert.equal(unauthorized.ok, false)
    assert.equal(unauthorized.error, 'unauthorized')
  } finally {
    await harness.close()
  }
})

test('host:new-game clears server state and broadcasts game reset', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(member, 'member:join', sessionCode, 0, 'Alice')

    const memberReset = once(member, 'game:reset')
    const resetResult = await emitAck(host, 'host:new-game')
    assert.equal(resetResult.ok, true)
    await memberReset

    const state = harness.getState(sessionCode)
    assert.deepEqual(state.teams, [])
    assert.equal(state.armed, false)
    assert.equal(state.buzzedBy, null)
    assert.equal(state.hostQuestionCursor, null)
    assert.deepEqual(state.members, {})

    const unauthorized = await emitAck(member, 'host:new-game')
    assert.equal(unauthorized.ok, false)
    assert.equal(unauthorized.error, 'unauthorized')
  } finally {
    await harness.close()
  }
})

test('companion can trigger timer stop and restart on host controller only', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)

    const stopEvent = once(controller, 'host:timer:stop')
    const stopResult = await emitAck(companion, 'host:timer:stop')
    assert.equal(stopResult.ok, true)
    await stopEvent

    const restartEvent = once(controller, 'host:timer:restart')
    const restartResult = await emitAck(companion, 'host:timer:restart')
    assert.equal(restartResult.ok, true)
    await restartEvent

    const unauthorizedStop = await emitAck(member, 'host:timer:stop')
    assert.equal(unauthorizedStop.ok, false)
    assert.equal(unauthorizedStop.error, 'unauthorized')
  } finally {
    await harness.close()
  }
})

test('companion can trigger sound playback on host controller only', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)

    const controllerSound = once(controller, 'host:sfx:play')
    const triggerResult = await emitAck(companion, 'host:sfx:play', 'nani')
    assert.equal(triggerResult.ok, true)
    const payload = await controllerSound
    assert.equal(payload.soundKey, 'nani')
    assert.ok(typeof payload.requestId === 'string' && payload.requestId.length > 0)

    const companionResultPromise = once(companion, 'host:sfx:result')
    controller.emit('host:sfx:result', {
      requestId: payload.requestId,
      sourceSocketId: payload.sourceSocketId,
      ok: true,
    })
    const companionResult = await companionResultPromise
    assert.equal(companionResult.requestId, payload.requestId)
    assert.equal(companionResult.ok, true)

    const unauthorized = await emitAck(member, 'host:sfx:play', 'nani')
    assert.equal(unauthorized.ok, false)
    assert.equal(unauthorized.error, 'unauthorized')
  } finally {
    await harness.close()
  }
})

test('companion receives timeout when controller does not confirm playback', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)

    const triggerResult = await emitAck(companion, 'host:sfx:play', 'nani')
    assert.equal(triggerResult.ok, true)
    const timedOut = await once(companion, 'host:sfx:result', 1000)
    assert.equal(timedOut.requestId, triggerResult.requestId)
    assert.equal(timedOut.ok, false)
    assert.equal(timedOut.error, 'playback-timeout')
  } finally {
    await harness.close()
  }
})
