function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(3)} s`
}

export default function ReactionLeaderboardModal({ open, rows, onClose }) {
  if (!open) return null

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="reaction-popup" onClick={(e) => e.stopPropagation()}>
        <div className="help-popup-head">
          <div>
            <div className="help-popup-tag">Reaction Leaderboard</div>
            <h2 className="help-popup-title">Fastest Buzzers</h2>
          </div>
          <button className="help-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="reaction-sub">Most recent question only • Shortcut: <strong>Shift + T</strong></div>
        {rows.length === 0 ? (
          <div className="reaction-empty">No buzzes recorded for the current question yet.</div>
        ) : (
          <div className="reaction-table-wrap">
            <table className="reaction-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Best</th>
                  <th>Last</th>
                  <th>Avg</th>
                  <th>Buzzes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key}>
                    <td>{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.teamName || '—'}</td>
                    <td>{formatMs(row.bestMs)}</td>
                    <td>{formatMs(row.lastMs)}</td>
                    <td>{formatMs(Math.round(row.totalMs / row.attempts))}</td>
                    <td>{row.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
