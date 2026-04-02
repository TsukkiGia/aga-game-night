export const TEAMS_KEY    = 'scorekeeping_teams'
export const SCORES_KEY   = 'scorekeeping_scores'
export const DONE_KEY     = 'scorekeeping_done'
export const HOST_PIN_KEY = 'scorekeeping_host_pin'

export function loadScores(initialTeams) {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORES_KEY) || '{}')
    return initialTeams.map((t, i) => ({ ...t, score: saved[i] ?? t.score }))
  } catch {
    return initialTeams
  }
}

export function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function clearAll() {
  localStorage.removeItem(TEAMS_KEY)
  localStorage.removeItem(SCORES_KEY)
  localStorage.removeItem(DONE_KEY)
}
