export const SCORES_KEY = 'scorekeeping_scores'
export const DONE_KEY   = 'scorekeeping_done'

export function loadScores(initialTeams) {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORES_KEY) || '{}')
    return initialTeams.map(t => ({ ...t, score: saved[t.code] ?? t.score }))
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
  localStorage.removeItem(SCORES_KEY)
  localStorage.removeItem(DONE_KEY)
}
