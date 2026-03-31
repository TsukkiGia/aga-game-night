export default function SuddenDeathOverlay({ tiedTeams, buzzWinner, onAward, onWrong, onCancel }) {
  return (
    <div className="fullscreen-overlay sd-overlay">
      <div className="sudden-death-screen">
        <div className="sd-tag">⚡ SUDDEN DEATH ⚡</div>
        <h2 className="sd-heading">First correct answer wins!</h2>

        <div className="sd-teams">
          {tiedTeams.map((t, i) => (
            <div key={i} className={`sd-team-chip color-${t.color}`}>{t.name}</div>
          ))}
        </div>

        {!buzzWinner ? (
          <div className="sd-waiting">Buzzers armed — waiting for buzz…</div>
        ) : (
          <div className="sd-buzz-result">
            <div className="sd-buzzed-label">
              {buzzWinner.memberName
                ? `${buzzWinner.memberName} for ${buzzWinner.team.name}`
                : buzzWinner.team.name}
            </div>
            <div className="sd-buzz-sublabel">buzzed in!</div>
            <div className="sd-buzz-actions">
              <button className="sd-correct-btn" onClick={() => onAward(buzzWinner.teamIndex)}>
                ✓ Correct — Wins!
              </button>
              <button className="sd-wrong-btn" onClick={onWrong}>
                ✗ Wrong — Re-arm
              </button>
            </div>
          </div>
        )}

        <button className="sd-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
