export function shouldLogTimerDebug() {
  if (typeof window === 'undefined') return false
  let forced = false
  try {
    forced = window.localStorage?.getItem('timerDebug') === '1'
  } catch {
    forced = false
  }
  return forced || Boolean(import.meta?.env?.DEV)
}

export function logTimerDebug(message, details = null, options = {}) {
  if (!shouldLogTimerDebug()) return
  const instanceId = options?.instanceId
  const prefix = instanceId ? `[timer][instance:${instanceId}]` : '[timer]'
  if (details === null) {
    console.info(`${prefix} ${message}`)
    return
  }
  console.info(`${prefix} ${message}`, details)
}
