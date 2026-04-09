export default function HomeBuzzOverlay({ buzzWinner, onDismiss }) {
  if (!buzzWinner?.team) return null

  return (
    <div className="buzz-overlay" onClick={onDismiss}>
      <div
        className={`buzz-popup color-${buzzWinner.team.color}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="buzz-popup-label">BUZZED IN!</div>
        <div className="buzz-popup-name">
          {buzzWinner.memberName
            ? `${buzzWinner.memberName} just buzzed in for ${buzzWinner.team.name}!`
            : `${buzzWinner.team.name} buzzed in!`}
        </div>
        <div className="buzz-popup-icon">🔔</div>
        <button className="buzz-dismiss-btn" onClick={onDismiss}>
          Reset Buzzers
        </button>
      </div>
    </div>
  )
}
