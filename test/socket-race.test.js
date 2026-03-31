import test from 'node:test'
import assert from 'node:assert/strict'
import { io as createClient } from 'socket.io-client'
import { createBuzzServer } from '../server.js'

const TEAMS = [
  { name: 'Team A', color: 'ember', code: 'A1A1' },
  { name: 'Team B', color: 'gold', code: 'B2B2' },
]

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

function connectSocket(baseUrl) {
  const socket = createClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  })
  return once(socket, 'connect').then(() => socket)
}

async function createHarness() {
  const server = createBuzzServer()
  const address = await server.start(0, '127.0.0.1')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const sockets = []

  async function connect() {
    const socket = await connectSocket(baseUrl)
    sockets.push(socket)
    return socket
  }

  async function close() {
    for (const socket of sockets) socket.disconnect()
    await server.stop()
  }

  return { connect, close }
}

test('first buzz wins under near-simultaneous buzzes', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()

    const setupResult = await emitAck(host, 'host:setup', TEAMS)
    assert.equal(setupResult.ok, true)

    const joinA = await emitAck(memberA, 'member:join', TEAMS[0].code, 'Alice')
    const joinB = await emitAck(memberB, 'member:join', TEAMS[1].code, 'Bob')
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

    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', TEAMS[0].code, 'Alice')
    await emitAck(memberB, 'member:join', TEAMS[1].code, 'Bob')

    await emitAck(host, 'host:arm')
    const firstWinnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    const firstWinner = await firstWinnerPromise
    assert.equal(firstWinner.teamIndex, 0)

    await emitAck(host, 'host:reset')
    await emitAck(host, 'host:arm', { lockedOutTeamIndex: firstWinner.teamIndex })

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

test('late joiners receive the original winner member name', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const winnerSocket = await harness.connect()
    const lateJoiner = await harness.connect()

    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(winnerSocket, 'member:join', TEAMS[0].code, 'Alice')
    await emitAck(host, 'host:arm')

    const winnerBroadcast = once(host, 'buzz:winner')
    winnerSocket.emit('member:buzz')
    await winnerBroadcast

    const syncWinnerPromise = once(lateJoiner, 'buzz:winner')
    const joinLate = await emitAck(lateJoiner, 'member:join', TEAMS[0].code, 'Bob')
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

    await emitAck(host1, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', TEAMS[0].code, 'Alice')
    await emitAck(host1, 'host:arm')
    const winnerPromise = once(host1, 'buzz:winner')
    memberA.emit('member:buzz')
    await winnerPromise

    host1.disconnect()

    const host2 = await harness.connect()
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

test('reconnected members still obey steal lockout while armed', async () => {
  const harness = await createHarness()
  try {
    const host = await harness.connect()
    const memberA = await harness.connect()
    const memberB = await harness.connect()

    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', TEAMS[0].code, 'Alice')
    await emitAck(memberB, 'member:join', TEAMS[1].code, 'Bob')

    await emitAck(host, 'host:arm')
    const firstWinnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    const firstWinner = await firstWinnerPromise
    assert.equal(firstWinner.teamIndex, 0)

    await emitAck(host, 'host:reset')
    await emitAck(host, 'host:arm', { lockedOutTeamIndex: firstWinner.teamIndex })

    memberA.disconnect()
    memberB.disconnect()

    const memberARejoined = await harness.connect()
    const memberBRejoined = await harness.connect()

    const armedA = once(memberARejoined, 'buzz:armed')
    const armedB = once(memberBRejoined, 'buzz:armed')
    await emitAck(memberARejoined, 'member:join', TEAMS[0].code, 'Alice2')
    await emitAck(memberBRejoined, 'member:join', TEAMS[1].code, 'Bob2')
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

    await emitAck(host, 'host:setup', TEAMS)
    await emitAck(memberA, 'member:join', TEAMS[0].code, 'Alice')

    await emitAck(host, 'host:arm')
    const armedJoin = await emitAck(memberB, 'member:join', TEAMS[1].code, 'Bob')
    assert.equal(armedJoin.sync.armed, true)
    assert.equal(armedJoin.sync.buzzedBy, null)

    const winnerPromise = once(host, 'buzz:winner')
    memberA.emit('member:buzz')
    await winnerPromise

    const postBuzzJoin = await emitAck(memberC, 'member:join', TEAMS[1].code, 'Cara')
    assert.equal(postBuzzJoin.sync.armed, false)
    assert.equal(postBuzzJoin.sync.buzzedBy, 0)
    assert.equal(postBuzzJoin.sync.buzzedMemberName, 'Alice')
  } finally {
    await harness.close()
  }
})
