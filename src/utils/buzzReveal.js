const REVEALABLE_ROUND_TYPES = new Set(['slang', 'video', 'charades', 'custom-buzz'])

export function getRevealOutcome({ roundType, label, points, stealMode }) {
  const type = String(roundType || '').trim().toLowerCase()
  const entryLabel = String(label || '').trim()
  const normalizedLabel = entryLabel.toLowerCase()
  const numericPoints = Number(points)
  const canReveal = REVEALABLE_ROUND_TYPES.has(type)

  if (!canReveal) return { revealAnswer: false, revealCountry: false }

  if (stealMode) {
    // Any steal scoring action reveals the answer, regardless of points.
    return { revealAnswer: true, revealCountry: false }
  }

  if (type === 'video' && entryLabel === 'Correct country') {
    return { revealAnswer: false, revealCountry: true }
  }

  const isFunnyBonus = normalizedLabel === 'funny bonus'
  if (numericPoints > 0 && !isFunnyBonus) {
    return { revealAnswer: true, revealCountry: false }
  }

  return { revealAnswer: false, revealCountry: false }
}

