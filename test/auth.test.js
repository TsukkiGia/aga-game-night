import test from 'node:test'
import assert from 'node:assert/strict'
import { mapHostAuthError } from '../src/auth.js'

test('mapHostAuthError returns user-facing auth messages', () => {
  assert.equal(
    mapHostAuthError('session-not-found'),
    'Session not found. Check the session code.'
  )
  assert.equal(
    mapHostAuthError('rate-limited'),
    'Too many PIN attempts. Wait a minute and try again.'
  )
  assert.equal(
    mapHostAuthError('anything-else'),
    'Incorrect PIN.'
  )
})
