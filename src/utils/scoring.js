export const DEFAULT_SCORING = {
  correctPoints: 3,
  wrongPoints: -1,
  correctLabel: null,
  wrongLabel: null,
  stealEnabled: true,
  correctStealPoints: 2,
  wrongStealPoints: 0,
  bonuses: [],
}

function cleanText(value, max = 120) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.slice(0, max)
}

function cleanInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

function normalizeBonusEntry(rawBonus) {
  if (!rawBonus || typeof rawBonus !== 'object' || Array.isArray(rawBonus)) return null
  const label = cleanText(rawBonus.label, 120)
  if (!label) return null
  return {
    label,
    points: cleanInt(rawBonus.points, 0),
    ...(rawBonus.revealCountry ? { revealCountry: true } : {}),
    ...(rawBonus.noReveal ? { noReveal: true } : {}),
  }
}

function normalizeLegacyScoringRows(rawRows) {
  if (!Array.isArray(rawRows)) return []
  return rawRows
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const label = cleanText(entry.label) || 'Score'
      return {
        label,
        points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : 0,
      }
    })
    .filter(Boolean)
}

export function normalizeScoringConfig(rawScoring) {
  const scoring = (rawScoring && typeof rawScoring === 'object' && !Array.isArray(rawScoring))
    ? rawScoring
    : {}
  return {
    correctPoints: cleanInt(scoring.correctPoints, DEFAULT_SCORING.correctPoints),
    wrongPoints: cleanInt(scoring.wrongPoints, DEFAULT_SCORING.wrongPoints),
    correctLabel: cleanText(scoring.correctLabel) || null,
    wrongLabel: cleanText(scoring.wrongLabel) || null,
    stealEnabled: scoring.stealEnabled !== false,
    correctStealPoints: cleanInt(scoring.correctStealPoints, DEFAULT_SCORING.correctStealPoints),
    wrongStealPoints: cleanInt(scoring.wrongStealPoints, DEFAULT_SCORING.wrongStealPoints),
    bonuses: Array.isArray(scoring.bonuses)
      ? scoring.bonuses.map((bonus) => normalizeBonusEntry(bonus)).filter(Boolean).slice(0, 10)
      : [],
  }
}

export function scoringToDisplayRows(rawScoring) {
  if (!rawScoring) return []
  if (Array.isArray(rawScoring)) return normalizeLegacyScoringRows(rawScoring)
  if (typeof rawScoring !== 'object') return []
  const scoring = normalizeScoringConfig(rawScoring)
  const rows = []
  rows.push({ label: scoring.correctLabel || 'Correct answer', points: scoring.correctPoints })
  for (const bonus of scoring.bonuses) {
    rows.push({ label: bonus.label, points: bonus.points })
  }
  rows.push({ label: scoring.wrongLabel || 'Wrong answer', points: scoring.wrongPoints })
  if (scoring.stealEnabled !== false) {
    rows.push({ label: 'Correct steal', points: scoring.correctStealPoints })
    rows.push({ label: 'Wrong steal', points: scoring.wrongStealPoints })
  }
  return rows
}

export function resolvePrimaryPositivePoints(rawScoring, { allowSteal = false, fallback = DEFAULT_SCORING.correctPoints } = {}) {
  if (Array.isArray(rawScoring)) {
    const entry = normalizeLegacyScoringRows(rawScoring).find((row) => {
      const points = Number.parseInt(row?.points, 10)
      if (!Number.isInteger(points) || points <= 0) return false
      if (allowSteal) return true
      return !String(row?.label || '').toLowerCase().includes('steal')
    })
    if (!entry) return fallback
    const points = Number.parseInt(entry.points, 10)
    return Number.isInteger(points) && points > 0 ? points : fallback
  }
  const scoring = normalizeScoringConfig(rawScoring)
  const points = Number.parseInt(scoring.correctPoints, 10)
  return Number.isInteger(points) && points > 0 ? points : fallback
}
