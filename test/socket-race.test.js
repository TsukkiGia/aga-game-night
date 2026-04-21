import test from 'node:test'
import assert from 'node:assert/strict'
import { io as createClient } from 'socket.io-client'
import { createBuzzServer } from '../server.js'

const TEAMS = [
  { name: 'Team A', color: 'ember' },
  { name: 'Team B', color: 'gold' },
]
const HOST_PIN = 'test-pin'
const HOSTLESS_CUSTOM_ROUND = {
  id: 'hostless-custom',
  type: 'custom-buzz',
  name: 'Host-less custom',
  intro: 'Answer by submitting',
  rules: ['First correct answer scores'],
  scoring: [{ label: 'Correct', points: 4, phase: 'normal' }],
  questions: [
    {
      id: 'hcq-1',
      promptType: 'text',
      promptText: 'Capital of Ghana?',
      answer: 'Accra',
      explanation: 'Accra is the capital.',
    },
  ],
}

const HOSTLESS_CHARADES_ROUND = {
  id: 'hostless-charades',
  type: 'charades',
  name: 'Host-less charades',
  intro: '',
  rules: ['Act it out'],
  scoring: [{ label: 'Correct', points: 3, phase: 'normal' }],
  questions: [{ id: 'hc-charades-1', phrase: 'Test phrase' }],
}

process.env.SFX_RESULT_TIMEOUT_MS = '300'

function createFakeQuery() {
  const sessions = new Map()
  const teamsBySession = new Map()
  const gameStateBySession = new Map()
  const buzzStateBySession = new Map()
  const roundTemplates = new Map()

  return async function fakeQuery(text, params = []) {
    if (text.includes('INSERT INTO sessions')) {
      const [id, pinHash, gameplayMode] = params
      if (sessions.has(id)) {
        const err = new Error('duplicate key value violates unique constraint')
        err.code = '23505'
        throw err
      }
      sessions.set(id, {
        pin_hash: pinHash,
        gameplay_mode: String(gameplayMode || 'hosted'),
        status: 'active',
      })
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('UPDATE sessions') && text.includes('SET gameplay_mode = $2')) {
      const [id, gameplayMode] = params
      const session = sessions.get(id)
      if (!session || session.status !== 'active') return { rows: [], rowCount: 0 }
      session.gameplay_mode = String(gameplayMode || 'hosted')
      return { rows: [], rowCount: 1 }
    }

    if (text.includes("SELECT pin_hash FROM sessions WHERE id = $1 AND status = 'active'")) {
      const [id] = params
      const session = sessions.get(id)
      if (!session || session.status !== 'active') return { rows: [], rowCount: 0 }
      return { rows: [{ pin_hash: session.pin_hash }], rowCount: 1 }
    }

    if (text.includes("SELECT id, pin_hash FROM sessions WHERE id = $1 AND status = 'active'")) {
      const [id] = params
      const session = sessions.get(id)
      if (!session || session.status !== 'active') return { rows: [], rowCount: 0 }
      return { rows: [{ id, pin_hash: session.pin_hash }], rowCount: 1 }
    }

    if (text.includes('DELETE FROM teams WHERE session_id = $1 AND idx >= $2')) {
      const [sessionId, minIdx] = params
      const current = teamsBySession.get(sessionId) || []
      teamsBySession.set(
        sessionId,
        current.filter((team) => team.idx < Number(minIdx))
      )
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('DELETE FROM teams WHERE session_id = $1')) {
      const [sessionId] = params
      teamsBySession.set(sessionId, [])
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('INSERT INTO teams (session_id, idx, name, color, score)')) {
      const [sessionId, ...rest] = params
      const current = teamsBySession.get(sessionId) || []
      for (let i = 0; i < rest.length; i += 4) {
        const [idx, name, color, score] = rest.slice(i, i + 4)
        const existingIndex = current.findIndex((team) => team.idx === idx)
        if (existingIndex >= 0) {
          current[existingIndex] = { idx, name, color, score }
        } else {
          current.push({ idx, name, color, score })
        }
      }
      current.sort((a, b) => a.idx - b.idx)
      teamsBySession.set(sessionId, current)
      return { rows: [], rowCount: 1 }
    }

    if (text.includes('INSERT INTO game_state')) {
      const [sessionId, roundIndex, questionIndex, armed, streaksRaw, doneQuestionsRaw, hostQuestionCursorRaw, doublePoints, gamePlanRaw, roundCatalogRaw, reactionStatsRaw, answerStateRaw] = params
      let hostQuestionCursor = hostQuestionCursorRaw
      if (typeof hostQuestionCursorRaw === 'string') {
        try { hostQuestionCursor = JSON.parse(hostQuestionCursorRaw) } catch { hostQuestionCursor = null }
      }
      let roundCatalog = roundCatalogRaw
      if (typeof roundCatalogRaw === 'string') {
        try { roundCatalog = JSON.parse(roundCatalogRaw) } catch { roundCatalog = [] }
      }
      let reactionStats = reactionStatsRaw
      if (typeof reactionStatsRaw === 'string') {
        try { reactionStats = JSON.parse(reactionStatsRaw) } catch { reactionStats = {} }
      }
      let answerState = answerStateRaw
      if (typeof answerStateRaw === 'string') {
        try { answerState = JSON.parse(answerStateRaw) } catch { answerState = null }
      }
      gameStateBySession.set(sessionId, {
        round_index: Number.parseInt(roundIndex, 10) || 0,
        question_index: questionIndex === null ? null : Number.parseInt(questionIndex, 10),
        armed: Boolean(armed),
        streaks: Array.isArray(streaksRaw) ? [...streaksRaw] : [],
        done_questions: Array.isArray(doneQuestionsRaw) ? [...doneQuestionsRaw] : [],
        host_question_cursor: hostQuestionCursor,
        double_points: Boolean(doublePoints),
        game_plan: Array.isArray(gamePlanRaw) ? [...gamePlanRaw] : [],
        round_catalog: Array.isArray(roundCatalog) ? [...roundCatalog] : [],
        reaction_stats: reactionStats && typeof reactionStats === 'object' && !Array.isArray(reactionStats) ? { ...reactionStats } : {},
        answer_state: answerState && typeof answerState === 'object' && !Array.isArray(answerState)
          ? { ...answerState }
          : { questionId: null, status: 'locked', winner: null, recentAttempts: [] },
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
      const gs = gameStateBySession.get(sessionId) || {
        round_index: 0,
        question_index: null,
        armed: false,
        streaks: [],
        done_questions: [],
        host_question_cursor: null,
        double_points: false,
        game_plan: [],
        round_catalog: [],
        reaction_stats: {},
        answer_state: { questionId: null, status: 'locked', winner: null, recentAttempts: [] },
      }
      const bs = buzzStateBySession.get(sessionId) || {
        winner_team_index: null,
        buzzed_member_name: null,
        allowed_team_indices: null,
      }

      if (teams.length === 0) {
        return {
          rows: [{
            session_id: sessionId,
            s_gameplay_mode: session.gameplay_mode || 'hosted',
            gs_armed: gs.armed,
            gs_round_index: gs.round_index,
            gs_question_index: gs.question_index,
            gs_streaks: gs.streaks,
            gs_done_questions: gs.done_questions,
            gs_double_points: gs.double_points,
            gs_game_plan: gs.game_plan,
            gs_round_catalog: gs.round_catalog,
            gs_reaction_stats: gs.reaction_stats,
            gs_host_question_cursor: gs.host_question_cursor,
            gs_answer_state: gs.answer_state,
            bs_winner_team_index: bs.winner_team_index,
            bs_buzzed_member_name: bs.buzzed_member_name,
            bs_allowed_team_indices: bs.allowed_team_indices,
            team_idx: null,
            team_name: null,
            team_color: null,
            team_score: null,
          }],
          rowCount: 1,
        }
      }

      return {
        rows: teams.map((team) => ({
          session_id: sessionId,
          s_gameplay_mode: session.gameplay_mode || 'hosted',
          gs_armed: gs.armed,
          gs_round_index: gs.round_index,
          gs_question_index: gs.question_index,
          gs_streaks: gs.streaks,
          gs_done_questions: gs.done_questions,
          gs_double_points: gs.double_points,
          gs_game_plan: gs.game_plan,
          gs_round_catalog: gs.round_catalog,
          gs_reaction_stats: gs.reaction_stats,
          gs_host_question_cursor: gs.host_question_cursor,
          gs_answer_state: gs.answer_state,
          bs_winner_team_index: bs.winner_team_index,
          bs_buzzed_member_name: bs.buzzed_member_name,
          bs_allowed_team_indices: bs.allowed_team_indices,
          team_idx: team.idx,
          team_name: team.name,
          team_color: team.color,
          team_score: team.score,
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

    if (text.includes('INSERT INTO round_templates')) {
      const [id, name, type, intro, rulesRaw, scoringRaw, questionsRaw, createdBySessionId] = params
      const row = {
        id,
        name,
        type,
        intro,
        rules: typeof rulesRaw === 'string' ? JSON.parse(rulesRaw) : rulesRaw,
        scoring: typeof scoringRaw === 'string' ? JSON.parse(scoringRaw) : scoringRaw,
        questions: typeof questionsRaw === 'string' ? JSON.parse(questionsRaw) : questionsRaw,
        created_by_session_id: createdBySessionId,
        created_at: new Date().toISOString(),
      }
      roundTemplates.set(id, row)
      return { rows: [row], rowCount: 1 }
    }

    if (text.includes('FROM round_templates')) {
      const rows = [...roundTemplates.values()]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      return { rows, rowCount: rows.length }
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

function waitNoEvent(socket, event, timeoutMs = 250) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent)
      resolve()
    }, timeoutMs)

    function onEvent(payload) {
      clearTimeout(timer)
      socket.off(event, onEvent)
      reject(new Error(`Unexpected "${event}" event: ${JSON.stringify(payload)}`))
    }

    socket.on(event, onEvent)
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

async function createHarness({ queryFn } = {}) {
  const effectiveQueryFn = typeof queryFn === 'function' ? queryFn : createFakeQuery()
  const server = createBuzzServer({
    queryFn: effectiveQueryFn,
    withTransactionFn: async (fn) => fn(effectiveQueryFn),
  })
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

  return { connect, close, createSession, baseUrl, getState: server.getState, getSessions: server.getSessions }
}

test('template endpoints require host credentials and return created templates', async () => {
  const harness = await createHarness()
  try {
    const { sessionCode, pin } = await harness.createSession()
    const payload = {
      name: 'Custom Music Snippets',
      intro: 'Name the song',
      type: 'custom-buzz',
      rules: ['Buzz in quickly'],
      scoring: [
        { label: 'Correct answer', points: 3, phase: 'normal' },
        { label: 'Correct steal', points: 2, phase: 'steal' },
      ],
      questions: [
        {
          promptType: 'text',
          promptText: 'Name this song',
          answer: 'Answer A',
        },
      ],
    }

    const unauthenticated = await fetch(`${harness.baseUrl}/api/round-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    assert.equal(unauthenticated.status, 401)

    const invalidPayloadRes = await fetch(`${harness.baseUrl}/api/round-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-code': sessionCode,
        'x-host-pin': pin,
      },
      body: JSON.stringify({ name: 'Bad', scoring: [], questions: [] }),
    })
    assert.equal(invalidPayloadRes.status, 400)

    const createdRes = await fetch(`${harness.baseUrl}/api/round-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-code': sessionCode,
        'x-host-pin': pin,
      },
      body: JSON.stringify(payload),
    })
    assert.equal(createdRes.status, 201)
    const created = await createdRes.json()
    assert.equal(created.template.type, 'custom-buzz')
    assert.equal(created.template.name, payload.name)
    assert.ok(Array.isArray(created.template.questions))

    const listRes = await fetch(`${harness.baseUrl}/api/round-templates`, {
      headers: {
        'x-session-code': sessionCode,
        'x-host-pin': pin,
      },
    })
    assert.equal(listRes.status, 200)
    const listed = await listRes.json()
    assert.ok(Array.isArray(listed.templates))
    assert.ok(listed.templates.some((template) => template.id === created.template.id))

    const leakedQueryCreds = await fetch(
      `${harness.baseUrl}/api/round-templates?sessionCode=${sessionCode}&pin=${pin}`
    )
    assert.equal(leakedQueryCreds.status, 401)

    const wrongPinRes = await fetch(`${harness.baseUrl}/api/round-templates`, {
      headers: {
        'x-session-code': sessionCode,
        'x-host-pin': 'wrong-pin',
      },
    })
    assert.equal(wrongPinRes.status, 401)
  } finally {
    await harness.close()
  }
})

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

test('host:setup treats same-count team identity changes as a new game reset', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)

    const seeded = await emitAck(host, 'host:runtime:update', {
      teams: [
        { name: 'Team A', color: 'ember', score: 12 },
        { name: 'Team B', color: 'gold', score: 8 },
      ],
      doneQuestions: ['q:seed:question'],
      streaks: [3, 2],
      doublePoints: true,
      reactionStats: {
        '0:alice': {
          key: '0:alice',
          name: 'Alice',
          teamName: 'Team A',
          teamIndex: 0,
          bestMs: 420,
          lastMs: 520,
          totalMs: 940,
          attempts: 2,
        },
      },
    })
    assert.equal(seeded.ok, true)

    const renamedSetup = await emitAck(host, 'host:setup', [
      { name: 'Renamed A', color: 'ember' },
      { name: 'Team B', color: 'gold' },
    ])
    assert.equal(renamedSetup.ok, true)

    const state = harness.getState(sessionCode)
    assert.equal(state.teams[0].name, 'Renamed A')
    assert.equal(state.teams[1].name, 'Team B')
    assert.equal(state.teams[0].score, 0)
    assert.equal(state.teams[1].score, 0)
    assert.deepEqual(state.streaks, [0, 0])
    assert.deepEqual(state.doneQuestions, [])
    assert.equal(state.doublePoints, false)
    assert.deepEqual(state.reactionStats, {})
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

test('runtime scoreboard state persists and rehydrates after reconnect', async () => {
  const harness = await createHarness()
  try {
    const host1 = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host1, sessionCode, pin)
    await emitAck(host1, 'host:setup', TEAMS)

    const runtimeUpdate = await emitAck(host1, 'host:runtime:update', {
      teams: [
        { name: 'Team A', color: 'ember', score: 15 },
        { name: 'Team B', color: 'gold', score: 7 },
      ],
      doneQuestions: ['0-0', '0-1'],
      streaks: [2, 1],
      doublePoints: true,
      roundCatalog: [
        {
          id: 'custom-template-test',
          templateId: 'test',
          type: 'custom-buzz',
          name: 'Custom Round',
          intro: 'Test intro',
          rules: ['Rule 1'],
          scoring: [{ label: 'Correct', points: 3, phase: 'normal' }],
          questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
        },
      ],
      reactionStats: {
        '0:alice': {
          key: '0:alice',
          name: 'Alice',
          teamName: 'Team A',
          teamIndex: 0,
          bestMs: 512,
          lastMs: 644,
          totalMs: 1156,
          attempts: 2,
          bestQuestionLabel: 'Q4',
          bestQuestionHeadline: 'Flag of Benin',
        },
      },
    })
    assert.equal(runtimeUpdate.ok, true)

    harness.getSessions().delete(sessionCode)

    const host2 = await harness.connect()
    await authHost(host2, sessionCode, pin)
    const syncPromise = once(host2, 'state:sync')
    const setup = await emitAck(host2, 'host:setup', TEAMS)
    assert.equal(setup.ok, true)
    const sync = await syncPromise

    assert.equal(sync.teams[0].score, 15)
    assert.equal(sync.teams[1].score, 7)
    assert.deepEqual(sync.doneQuestions, ['0-0', '0-1'])
    assert.deepEqual(sync.streaks, [2, 1])
    assert.equal(sync.doublePoints, true)
    assert.equal(Array.isArray(sync.roundCatalog), true)
    assert.equal(sync.roundCatalog[0]?.id, 'custom-template-test')
    assert.equal(sync.roundCatalog[0]?.templateId, 'test')
    assert.equal(sync.reactionStats?.['0:alice']?.bestMs, 512)
    assert.equal(sync.reactionStats?.['0:alice']?.lastMs, 644)
    assert.equal(sync.reactionStats?.['0:alice']?.attempts, 2)
    assert.equal(sync.reactionStats?.['0:alice']?.bestQuestionLabel, 'Q4')
    assert.equal(sync.reactionStats?.['0:alice']?.bestQuestionHeadline, 'Flag of Benin')
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

test('member:join requires a non-empty name', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)

    const emptyName = await emitAck(member, 'member:join', sessionCode, 0, '')
    assert.equal(emptyName.error, 'name-required')

    const whitespaceName = await emitAck(member, 'member:join', sessionCode, 0, '   ')
    assert.equal(whitespaceName.error, 'name-required')

    const state = harness.getState(sessionCode)
    assert.deepEqual(state.members, {})
  } finally {
    await harness.close()
  }
})

test('authenticated host socket cannot pivot sessions through member:join', async () => {
  const harness = await createHarness()
  try {
    const hostA = await harness.connect()
    const hostB = await harness.connect()
    const sessionA = await harness.createSession('pin-a')
    const sessionB = await harness.createSession('pin-b')

    await authHost(hostA, sessionA.sessionCode, sessionA.pin)
    await emitAck(hostA, 'host:setup', TEAMS)
    await authHost(hostB, sessionB.sessionCode, sessionB.pin)
    await emitAck(hostB, 'host:setup', [
      { name: 'Blue', color: 'navy' },
      { name: 'Green', color: 'lime' },
    ])

    const joinAttempt = await emitAck(hostA, 'member:join', sessionB.sessionCode, 0, 'Mallory')
    assert.equal(joinAttempt.error, 'unauthorized')

    const newGame = await emitAck(hostA, 'host:new-game')
    assert.equal(newGame.ok, true)

    const stateA = harness.getState(sessionA.sessionCode)
    const stateB = harness.getState(sessionB.sessionCode)
    assert.deepEqual(stateA.teams, [])
    assert.equal(stateB.teams.length, 2)
    assert.equal(stateB.teams[0].name, 'Blue')
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

test('member can switch sessions even if previous in-memory state is missing', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const first = await harness.createSession('pin-one')
    const second = await harness.createSession('pin-two')

    await authHost(host, first.sessionCode, first.pin)
    await emitAck(host, 'host:setup', TEAMS)
    const firstJoin = await emitAck(member, 'member:join', first.sessionCode, 0, 'Alice')
    assert.equal(firstJoin.teamIndex, 0)

    harness.getSessions().delete(first.sessionCode)

    await authHost(host, second.sessionCode, second.pin)
    await emitAck(host, 'host:setup', TEAMS)
    const secondJoin = await emitAck(member, 'member:join', second.sessionCode, 1, 'Alice')
    assert.equal(secondJoin.teamIndex, 1)
    assert.equal(secondJoin.team?.name, TEAMS[1].name)
  } finally {
    await harness.close()
  }
})

test('session switch removes old member-room subscription and broadcasts previous roster update', async () => {
  const harness = await createHarness()
  try {
    const hostA = await harness.connect()
    const hostB = await harness.connect()
    const switcher = await harness.connect()
    const memberA = await harness.connect()
    const first = await harness.createSession('pin-a')
    const second = await harness.createSession('pin-b')

    await authHost(hostA, first.sessionCode, first.pin)
    await emitAck(hostA, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    await emitAck(hostA, 'host:question:set', 'q:hostless-custom:hcq-1')

    await authHost(hostB, second.sessionCode, second.pin)
    await emitAck(hostB, 'host:setup', TEAMS)

    const initialRoster = once(hostA, 'host:members')
    const joinedFirst = await emitAck(switcher, 'member:join', first.sessionCode, 0, 'Alice')
    assert.equal(joinedFirst.teamIndex, 0)
    await initialRoster

    const oldRosterUpdate = once(hostA, 'host:members')
    const joinedSecond = await emitAck(switcher, 'member:join', second.sessionCode, 1, 'Alice')
    assert.equal(joinedSecond.teamIndex, 1)
    const rosterAfterSwitch = await oldRosterUpdate
    assert.equal(Array.isArray(rosterAfterSwitch), true)
    const oldSessionNames = rosterAfterSwitch.flat()
    assert.equal(oldSessionNames.includes('Alice'), false)

    await emitAck(memberA, 'member:join', first.sessionCode, 1, 'Bob')
    const noLeakPromise = waitNoEvent(switcher, 'answer:attempt', 300)
    const wrongGuess = await emitAck(memberA, 'member:answer:submit', { guess: 'Tema' })
    assert.equal(wrongGuess.ok, true)
    assert.equal(wrongGuess.correct, false)
    await noLeakPromise
  } finally {
    await harness.close()
  }
})

test('session switch leaves old member room even when previous session cache is evicted', async () => {
  const harness = await createHarness()
  try {
    const hostA = await harness.connect()
    const hostB = await harness.connect()
    const switcher = await harness.connect()
    const memberA = await harness.connect()
    const first = await harness.createSession('pin-a')
    const second = await harness.createSession('pin-b')

    await authHost(hostA, first.sessionCode, first.pin)
    await emitAck(hostA, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    await emitAck(hostA, 'host:question:set', 'q:hostless-custom:hcq-1')
    await emitAck(switcher, 'member:join', first.sessionCode, 0, 'Alice')

    harness.getSessions().delete(first.sessionCode)

    await authHost(hostB, second.sessionCode, second.pin)
    await emitAck(hostB, 'host:setup', TEAMS)
    const joinedSecond = await emitAck(switcher, 'member:join', second.sessionCode, 1, 'Alice')
    assert.equal(joinedSecond.teamIndex, 1)

    await emitAck(memberA, 'member:join', first.sessionCode, 1, 'Bob')
    const noLeakPromise = waitNoEvent(switcher, 'answer:attempt', 300)
    const wrongGuess = await emitAck(memberA, 'member:answer:submit', { guess: 'Tema' })
    assert.equal(wrongGuess.ok, true)
    assert.equal(wrongGuess.correct, false)
    await noLeakPromise
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

test('switching gameplay mode resets live buzz state and syncs members', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', {
      teams: TEAMS,
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
      gameplayMode: 'hosted',
    })
    await emitAck(host, 'host:question:set', 'q:hostless-custom:hcq-1')
    await emitAck(member, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(host, 'host:arm')

    const winnerPromise = once(host, 'buzz:winner')
    member.emit('member:buzz')
    await winnerPromise

    const memberBuzzReset = once(member, 'buzz:reset')
    const memberSync = once(member, 'member:sync')
    const switched = await emitAck(host, 'host:runtime:update', {
      teams: TEAMS,
      doneQuestions: [],
      gameplayMode: 'hostless',
      streaks: [0, 0],
      doublePoints: true,
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      reactionStats: {},
    })
    assert.equal(switched.ok, true)

    await memberBuzzReset
    const memberSyncPayload = await memberSync
    assert.equal(memberSyncPayload.gameplayMode, 'hostless')
    assert.equal(memberSyncPayload.answerState?.status, 'open')

    const state = harness.getState(sessionCode)
    assert.equal(state.gameplayMode, 'hostless')
    assert.equal(state.armed, false)
    assert.equal(state.buzzedBy, null)
    assert.equal(state.allowedTeamIndices, null)
    assert.equal(state.doublePoints, false)
  } finally {
    await harness.close()
  }
})

test('state hydration errors return server-error acks instead of throwing', async () => {
  const baseQuery = createFakeQuery()
  const queryFn = async (text, params = []) => {
    if (text.includes('FROM sessions s') && text.includes('LEFT JOIN game_state gs')) {
      throw new Error('db-read-failed')
    }
    return baseQuery(text, params)
  }
  const harness = await createHarness({ queryFn })
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)

    const hostGet = await emitAck(host, 'host:question:get')
    assert.equal(hostGet.ok, false)
    assert.equal(hostGet.error, 'server-error')

    const hostArm = await emitAck(host, 'host:arm')
    assert.equal(hostArm.ok, false)
    assert.equal(hostArm.error, 'server-error')

    const memberTeams = await emitAck(member, 'member:get-teams', sessionCode)
    assert.equal(memberTeams.error, 'server-error')
  } finally {
    await harness.close()
  }
})

test('host:question:get returns round catalog for companion answer view', async () => {
  const harness = await createHarness()
  try {
    const controller = await harness.connect()
    const companion = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(controller, sessionCode, pin)
    await emitAck(controller, 'host:setup', {
      teams: TEAMS,
      roundCatalog: [
        {
          id: 'custom-template-mobile',
          templateId: 'mobile-template',
          type: 'custom-buzz',
          name: 'Custom Mobile Round',
          intro: '',
          rules: ['Rule'],
          scoring: [{ label: 'Correct', points: 3, phase: 'normal' }],
          questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
        },
      ],
    })

    await authCompanion(companion, sessionCode, pin)
    const result = await emitAck(companion, 'host:question:get')
    assert.equal(result.ok, true)
    assert.ok(Array.isArray(result.roundCatalog))
    assert.equal(result.roundCatalog[0]?.id, 'custom-template-mobile')
    assert.equal(result.roundCatalog[0]?.templateId, 'mobile-template')
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

test('host:end-session revokes host auth and keeps the session code dead', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const companion = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await authCompanion(companion, sessionCode, pin)
    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(member, 'member:join', sessionCode, 0, 'Alice')

    const memberReset = once(member, 'game:reset')
    const companionReset = once(companion, 'game:reset')
    const endResult = await emitAck(host, 'host:end-session')
    assert.equal(endResult.ok, true)
    await memberReset
    await companionReset

    assert.equal(harness.getState(sessionCode), undefined)

    const teamsAfterEnd = await emitAck(member, 'member:get-teams', sessionCode)
    assert.equal(teamsAfterEnd.error, 'session-not-found')

    const hostNewGame = await emitAck(host, 'host:new-game')
    assert.equal(hostNewGame.ok, false)
    assert.equal(hostNewGame.error, 'unauthorized')

    const companionQuestion = await emitAck(companion, 'host:question:get')
    assert.equal(companionQuestion.ok, false)
    assert.equal(companionQuestion.error, 'unauthorized')

    const reauth = await emitAck(host, 'host:auth', { sessionCode, pin, role: 'controller' })
    assert.equal(reauth.ok, false)
    assert.equal(reauth.error, 'session-not-found')
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

test('host-less mode accepts wrong attempts, scores first correct answer, and locks question', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    const setupResult = await emitAck(host, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    assert.equal(setupResult.ok, true)
    await emitAck(host, 'host:question:set', 'q:hostless-custom:hcq-1')

    const joinA = await emitAck(memberA, 'member:join', sessionCode, 0, 'Alice')
    const joinB = await emitAck(memberB, 'member:join', sessionCode, 1, 'Bob')
    assert.equal(joinA.sync.gameplayMode, 'hostless')
    assert.equal(joinA.sync.answerState.status, 'open')
    assert.equal(joinB.sync.gameplayMode, 'hostless')

    const wrongAttemptPromise = once(host, 'answer:attempt')
    const wrongResult = await emitAck(memberA, 'member:answer:submit', { guess: 'Kumasi' })
    assert.equal(wrongResult.ok, true)
    assert.equal(wrongResult.correct, false)
    const wrongAttempt = await wrongAttemptPromise
    assert.equal(wrongAttempt.teamIndex, 0)
    assert.equal(wrongAttempt.memberName, 'Alice')
    assert.equal(wrongAttempt.guess, 'Kumasi')

    await wait(750)
    const correctPromise = once(host, 'answer:correct')
    const correctResult = await emitAck(memberA, 'member:answer:submit', { guess: 'Accra' })
    assert.equal(correctResult.ok, true)
    assert.equal(correctResult.correct, true)
    assert.equal(correctResult.points, 4)
    const correctPayload = await correctPromise
    assert.equal(correctPayload.teamIndex, 0)
    assert.equal(correctPayload.memberName, 'Alice')
    assert.equal(correctPayload.points, 4)
    assert.equal(correctPayload.answer, 'Accra')

    const stateAfterCorrect = harness.getState(sessionCode)
    assert.equal(stateAfterCorrect.teams[0].score, 4)
    assert.equal(stateAfterCorrect.teams[1].score, 0)
    assert.equal(stateAfterCorrect.answerState.status, 'locked')
    assert.equal(stateAfterCorrect.answerState.winner.memberName, 'Alice')
    assert.equal(stateAfterCorrect.answerState.winner.answer, 'Accra')
    assert.equal(stateAfterCorrect.answerState.revealedAnswer, 'Accra')

    const postLockResult = await emitAck(memberB, 'member:answer:submit', { guess: 'Accra' })
    assert.equal(postLockResult.ok, false)
    assert.equal(postLockResult.error, 'question-locked')
  } finally {
    await harness.close()
  }
})

test('host-less timer expiry locks question and reveals answer when nobody is correct', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    await emitAck(host, 'host:question:set', 'q:hostless-custom:hcq-1')
    await emitAck(member, 'member:join', sessionCode, 0, 'Alice')

    const wrongResult = await emitAck(member, 'member:answer:submit', { guess: 'Kumasi' })
    assert.equal(wrongResult.ok, true)
    assert.equal(wrongResult.correct, false)

    const hostTimeout = once(host, 'answer:timeout')
    const memberTimeout = once(member, 'answer:timeout')
    host.emit('host:timer:expired')
    const hostPayload = await hostTimeout
    const memberPayload = await memberTimeout
    assert.equal(hostPayload.answer, 'Accra')
    assert.equal(memberPayload.answer, 'Accra')

    const state = harness.getState(sessionCode)
    assert.equal(state.answerState.status, 'locked')
    assert.equal(state.answerState.winner, null)
    assert.equal(state.answerState.revealedAnswer, 'Accra')

    const postTimeoutResult = await emitAck(member, 'member:answer:submit', { guess: 'Accra' })
    assert.equal(postTimeoutResult.ok, false)
    assert.equal(postTimeoutResult.error, 'question-locked')
  } finally {
    await harness.close()
  }
})

test('host-less mode rejects answer submissions for unsupported rounds', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    const setupResult = await emitAck(host, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CHARADES_ROUND],
      gamePlan: ['intro:hostless-charades', 'q:hostless-charades:hc-charades-1'],
    })
    assert.equal(setupResult.ok, true)
    await emitAck(host, 'host:question:set', 'q:hostless-charades:hc-charades-1')

    const join = await emitAck(member, 'member:join', sessionCode, 0, 'Alice')
    assert.equal(join.sync.gameplayMode, 'hostless')

    const submitResult = await emitAck(member, 'member:answer:submit', { guess: 'Any guess' })
    assert.equal(submitResult.ok, false)
    assert.equal(submitResult.error, 'unsupported-round')
  } finally {
    await harness.close()
  }
})

test('host-less mode rate-limits duplicate spam guesses per question', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const member = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    await emitAck(host, 'host:question:set', 'q:hostless-custom:hcq-1')
    await emitAck(member, 'member:join', sessionCode, 0, 'Alice')

    const first = await emitAck(member, 'member:answer:submit', { guess: 'Tema' })
    assert.equal(first.ok, true)
    assert.equal(first.correct, false)

    const duplicate = await emitAck(member, 'member:answer:submit', { guess: 'Tema' })
    assert.equal(duplicate.ok, false)
    assert.equal(duplicate.error, 'rate-limited')
  } finally {
    await harness.close()
  }
})

test('host-less answer state is included in late-join member sync', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const winner = await harness.connect()
    const lateJoiner = await harness.connect()
    const { sessionCode, pin } = await harness.createSession()

    await authHost(host, sessionCode, pin)
    await emitAck(host, 'host:setup', {
      teams: TEAMS,
      gameplayMode: 'hostless',
      roundCatalog: [HOSTLESS_CUSTOM_ROUND],
      gamePlan: ['intro:hostless-custom', 'q:hostless-custom:hcq-1'],
    })
    await emitAck(host, 'host:question:set', 'q:hostless-custom:hcq-1')
    await emitAck(winner, 'member:join', sessionCode, 0, 'Alice')
    await emitAck(winner, 'member:answer:submit', { guess: 'Accra' })

    const lateJoin = await emitAck(lateJoiner, 'member:join', sessionCode, 1, 'Bob')
    assert.equal(lateJoin.sync.gameplayMode, 'hostless')
    assert.equal(lateJoin.sync.answerState.status, 'locked')
    assert.equal(lateJoin.sync.answerState.winner.memberName, 'Alice')
    assert.equal(lateJoin.sync.answerState.winner.teamIndex, 0)
  } finally {
    await harness.close()
  }
})
