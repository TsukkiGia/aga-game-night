import ModalShell from '../ui/ModalShell'
import ModalHeader from '../ui/ModalHeader'

function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(3)} s`
}

export default function ReactionLeaderboardModal({ open, rows, onClose }) {
  if (!open) return null

  return (
    <ModalShell onClose={onClose} dialogClassName="reaction-popup">
      <ModalHeader
        kicker="Question Race"
        title="Current Question Times"
        onClose={onClose}
      />
      <div className="reaction-sub">Sorted by fastest current-question buzz • Shortcut: <strong>Shift + T</strong></div>
      {rows.length === 0 ? (
        <div className="reaction-empty">No buzzes recorded for this question yet.</div>
      ) : (
        <div className="reaction-table-wrap">
          <table className="reaction-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Team</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.key}>
                  <td>{idx + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.teamName || '—'}</td>
                  <td>{formatMs(row.questionLastMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  )
}
