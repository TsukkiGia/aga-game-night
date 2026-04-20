export const GAMEPLAY_MODE_HOSTED = 'hosted'
export const GAMEPLAY_MODE_HOSTLESS = 'hostless'

const SUPPORTED_GAMEPLAY_MODES = new Set([
  GAMEPLAY_MODE_HOSTED,
  GAMEPLAY_MODE_HOSTLESS,
])

const HOSTLESS_UNSUPPORTED_ROUND_TYPES = new Set(['charades', 'thesis'])

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeGameplayMode(rawMode, fallback = GAMEPLAY_MODE_HOSTED) {
  const normalized = normalizeText(rawMode)
  if (SUPPORTED_GAMEPLAY_MODES.has(normalized)) return normalized
  return fallback
}

export function isHostlessMode(rawMode) {
  return normalizeGameplayMode(rawMode) === GAMEPLAY_MODE_HOSTLESS
}

export function isRoundSupportedInMode(roundType, gameplayMode) {
  const normalizedType = normalizeText(roundType)
  if (!normalizedType) return false
  if (!isHostlessMode(gameplayMode)) return true
  return !HOSTLESS_UNSUPPORTED_ROUND_TYPES.has(normalizedType)
}

export function gameplayModeLabel(rawMode) {
  return isHostlessMode(rawMode) ? 'Host-less' : 'Hosted'
}

export function hostlessUnsupportedRoundReason(roundName = 'This round') {
  return `${String(roundName || 'This round').trim()} requires live host moderation and is disabled in Host-less mode.`
}
