export function mapHostAuthError(errorCode) {
  if (errorCode === 'session-not-found') return 'Session not found. Check the session code.'
  if (errorCode === 'rate-limited') return 'Too many PIN attempts. Wait a minute and try again.'
  return 'Incorrect PIN.'
}
