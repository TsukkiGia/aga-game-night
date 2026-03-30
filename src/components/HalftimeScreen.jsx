export default function HalftimeScreen({ teams, onClose }) {
  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  const leader = sorted[0]
  const hasScores = leader.score > 0

  return (
    <div className="fullscreen-overlay">
      <div className="halftime-screen">
        <div className="halftime-tag">HALFTIME</div>
        <h1 className="halftime-heading">Scores So Far</h1>

        <div className="halftime-rows">
          {sorted.map((team, rank) => {
            const isLeading = rank === 0 && hasScores
            return (
              <div
                key={team.originalIndex}
                className={`halftime-row color-${team.color}${isLeading ? ' leading' : ''}`}
              >
                <span className="halftime-rank">
                  {hasScores ? ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'][rank] : '—'}
                </span>
                <span className="halftime-name">{team.name}</span>
                <span className="halftime-score">{team.score}</span>
              </div>
            )
          })}
        </div>

        {hasScores && (
          <div className="halftime-leader-note">
            {sorted[0].score === sorted[1]?.score
              ? `${sorted[0].name} and ${sorted[1].name} are tied!`
              : `${sorted[0].name} leads by ${sorted[0].score - (sorted[1]?.score ?? 0)} pts`}
          </div>
        )}

        <button className="halftime-close-btn" onClick={onClose}>
          Resume Game →
        </button>
      </div>
    </div>
  )
}
