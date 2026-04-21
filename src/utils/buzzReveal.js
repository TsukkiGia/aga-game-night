const REVEALABLE_ROUND_TYPES = new Set(['slang', 'video', 'charades', 'custom-buzz'])

export function getRevealOutcome({ roundType, entryKind, bonus = null }) {
  const type = String(roundType || '').trim().toLowerCase()
  if (!REVEALABLE_ROUND_TYPES.has(type)) return { revealAnswer: false, revealCountry: false }

  if (entryKind === 'correct-steal' || entryKind === 'wrong-steal') {
    return { revealAnswer: true, revealCountry: false }
  }

  if (entryKind === 'correct') {
    return { revealAnswer: true, revealCountry: false }
  }

  if (entryKind === 'bonus' && bonus) {
    if (bonus.revealCountry) return { revealAnswer: false, revealCountry: true }
    if (bonus.noReveal) return { revealAnswer: false, revealCountry: false }
    if (bonus.points > 0) return { revealAnswer: true, revealCountry: false }
  }

  return { revealAnswer: false, revealCountry: false }
}
