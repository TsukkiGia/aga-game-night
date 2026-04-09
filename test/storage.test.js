import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUZZER_PLAYER_KEY,
  HOST_PIN_KEY,
  SESSION_CODE_KEY,
  clearBuzzerIdentity,
  clearHostCredentials,
  loadBuzzerIdentity,
  readHostCredentials,
  saveBuzzerIdentity,
  writeHostCredentials,
} from '../src/storage.js'

function createLocalStorageMock() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(String(key))
    },
    clear() {
      store.clear()
    },
    dump() {
      return new Map(store)
    },
  }
}

test('host credentials helpers read, write, and clear scoped values', () => {
  const originalLocalStorage = globalThis.localStorage
  const storageMock = createLocalStorageMock()
  globalThis.localStorage = storageMock
  try {
    assert.equal(readHostCredentials(), null)

    writeHostCredentials('ab12cd', '1234')
    const saved = readHostCredentials()
    assert.deepEqual(saved, { sessionCode: 'AB12CD', pin: '1234' })

    const raw = storageMock.dump()
    assert.equal(raw.get(SESSION_CODE_KEY), 'AB12CD')
    assert.equal(raw.get(`${HOST_PIN_KEY}:AB12CD`), '1234')

    clearHostCredentials()
    assert.equal(readHostCredentials(), null)
    const afterClear = storageMock.dump()
    assert.equal(afterClear.has(SESSION_CODE_KEY), false)
    assert.equal(afterClear.has(`${HOST_PIN_KEY}:AB12CD`), false)
  } finally {
    globalThis.localStorage = originalLocalStorage
  }
})

test('buzzer identity helpers persist and clear player identity', () => {
  const originalLocalStorage = globalThis.localStorage
  const storageMock = createLocalStorageMock()
  globalThis.localStorage = storageMock
  try {
    assert.equal(loadBuzzerIdentity(), null)

    saveBuzzerIdentity(2, 'Amina')
    assert.deepEqual(loadBuzzerIdentity(), { teamIndex: 2, name: 'Amina' })

    clearBuzzerIdentity()
    assert.equal(loadBuzzerIdentity(), null)
    assert.equal(storageMock.dump().has(BUZZER_PLAYER_KEY), false)
  } finally {
    globalThis.localStorage = originalLocalStorage
  }
})
