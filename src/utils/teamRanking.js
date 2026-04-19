/**
 * Given a score-sorted array of teams, returns a parallel array of 0-based place
 * indices (0 = 1st, 1 = 2nd, etc.) with ties handled correctly.
 * Both HalftimeScreen and WinnerScreen use this.
 */
export function computePlaces(sorted) {
  return sorted.map((team) => sorted.filter((t) => t.score > team.score).length)
}
