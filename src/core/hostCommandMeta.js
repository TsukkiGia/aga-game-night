let knownSessionVersion = 0
let requestSeq = 0

function normalizeSessionVersion(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export function setKnownHostSessionVersion(value) {
  const parsed = normalizeSessionVersion(value)
  if (parsed === null) return knownSessionVersion
  knownSessionVersion = parsed
  return knownSessionVersion
}

export function readKnownHostSessionVersion() {
  return knownSessionVersion
}

export function syncHostSessionVersionFromAck(ack) {
  if (!ack || typeof ack !== 'object') return knownSessionVersion
  return setKnownHostSessionVersion(ack.sessionVersion)
}

function nextRequestId() {
  requestSeq = (requestSeq + 1) % 1_000_000
  const rand = Math.random().toString(36).slice(2, 8)
  return `hostcmd-${Date.now().toString(36)}-${requestSeq.toString(36)}-${rand}`
}

export function withHostCommandMeta(payload = {}, options = {}) {
  const basePayload = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? payload
    : {}
  const questionId = String(options?.questionId || '').trim()
  const meta = {
    requestId: nextRequestId(),
    sessionVersion: readKnownHostSessionVersion(),
    ...(questionId ? { questionId } : {}),
  }
  return {
    ...basePayload,
    _meta: meta,
  }
}
