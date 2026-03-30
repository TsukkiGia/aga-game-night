const MEDALS = ['🥇', '🥈', '🥉', '4️⃣']
const RANK_LABELS = ['1ST', '2ND', '3RD', '4TH']

export default function Leaderboard({ teams }) {
  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  if (sorted.length === 0) return null
  const hasAnyScore = sorted[0].score > 0

  return (
    <aside className="leaderboard">
      <div className="leaderboard-header">
        <span className="leaderboard-icon">◈</span>
        <h3 className="leaderboard-title">Rankings</h3>
        <span className="leaderboard-icon">◈</span>
      </div>

      <div className="leaderboard-kente" />

      <ol className="leaderboard-list">
        {sorted.map((team, rank) => {
          // display rank = index of first team with this score (handles ties correctly)
          const displayRank = sorted.findIndex(t => t.score === team.score)

          return (
            <li
              key={team.originalIndex}
              className={`leaderboard-row color-${team.color} ${rank === 0 && hasAnyScore ? 'top-rank' : ''}`}
            >
              <div className="rank-medal">
                {hasAnyScore ? MEDALS[displayRank] : <span className="rank-dash">—</span>}
              </div>
              <div className="rank-info">
                <span className="rank-name">{team.name}</span>
                {hasAnyScore && (
                  <span className="rank-label">{RANK_LABELS[displayRank]}</span>
                )}
              </div>
              <div className="rank-score">{team.score}</div>
            </li>
          )
        })}
      </ol>

      <div className="leaderboard-kente" />

      {hasAnyScore && sorted[0].score > sorted[1]?.score && (
        <div className="leaderboard-leader-note">
          <span>{sorted[0].name}</span> leads by {sorted[0].score - (sorted[1]?.score ?? 0)} pts
        </div>
      )}
    </aside>
  )
}
