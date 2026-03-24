export default function TeamCard({ team, index, maxScore, isLeading, flashing, onAdjust }) {
  const flashUp = flashing === `${index}-up`
  const flashDown = flashing === `${index}-down`
  const barPct = maxScore > 0 ? (team.score / maxScore) * 100 : 0

  return (
    <div className={`team-card color-${team.color} ${isLeading ? 'leading' : ''} ${flashUp ? 'flash-up' : ''} ${flashDown ? 'flash-down' : ''}`}>
      {isLeading && team.score > 0 && (
        <div className="leading-badge">★ LEADING</div>
      )}

      <div className="team-card-header">
        <div className="team-number">#{index + 1}</div>
        <h2 className="team-name">{team.name}</h2>
      </div>

      <div className="score-display">
        <span className="score-value">{team.score}</span>
        <span className="score-label">pts</span>
      </div>

      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${barPct}%` }}
        />
      </div>

      <div className="team-controls">
        <button
          className="score-btn minus"
          onClick={() => onAdjust(-1)}
          disabled={team.score === 0}
          aria-label="Subtract 1"
        >
          −
        </button>
        <button
          className="score-btn minus-5"
          onClick={() => onAdjust(-5)}
          disabled={team.score === 0}
          aria-label="Subtract 5"
        >
          −5
        </button>
        <button
          className="score-btn plus-5"
          onClick={() => onAdjust(5)}
          aria-label="Add 5"
        >
          +5
        </button>
        <button
          className="score-btn plus"
          onClick={() => onAdjust(1)}
          aria-label="Add 1"
        >
          +
        </button>
      </div>
    </div>
  )
}
