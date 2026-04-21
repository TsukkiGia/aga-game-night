import { useMemo } from 'react'
import { normalizeReactionStats } from '../../core/reactionStats'
import ModalShell from '../ui/ModalShell'
import ModalHeader from '../ui/ModalHeader'

function fmt(ms) {
  if (!Number.isFinite(ms) || ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function StatsModal({ reactionStats, onClose }) {
  const rows = useMemo(() => {
    const stats = normalizeReactionStats(reactionStats)
    return Object.values(stats)
      .filter((s) => Number.isInteger(s.bestMs))
      .sort((a, b) => a.bestMs - b.bestMs)
      .map((s) => ({
        ...s,
        avgMs: s.attempts > 0 ? Math.round(s.totalMs / s.attempts) : null,
      }))
  }, [reactionStats])

  return (
    <ModalShell onClose={onClose} dialogClassName="stats-modal">
      <ModalHeader
        className="stats-modal-head"
        kicker="Session Stats"
        title="Buzz Leaderboard"
        titleClassName="stats-modal-title"
        subtitle="Ranked by best reaction time across all questions"
        subtitleClassName="stats-modal-sub"
        onClose={onClose}
      />

      {rows.length === 0 ? (
        <div className="stats-modal-empty">No buzz data recorded this session.</div>
      ) : (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Team</th>
                <th className="stats-col-best">Best</th>
                <th className="stats-col-question">Question</th>
                <th className="stats-col-avg">Avg</th>
                <th className="stats-col-buzzes">Buzzes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.key} className={idx === 0 ? 'stats-row-gold' : idx === 1 ? 'stats-row-silver' : idx === 2 ? 'stats-row-bronze' : ''}>
                  <td className="stats-rank">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </td>
                  <td className="stats-name">{row.name}</td>
                  <td className="stats-team">{row.teamName || '—'}</td>
                  <td className="stats-best">{fmt(row.bestMs)}</td>
                  <td className="stats-question">
                    {row.bestQuestionLabel && (
                      <span className="stats-q-label">{row.bestQuestionLabel}</span>
                    )}
                    {row.bestQuestionHeadline && (
                      <span className="stats-q-headline">{row.bestQuestionHeadline}</span>
                    )}
                    {!row.bestQuestionLabel && !row.bestQuestionHeadline && '—'}
                  </td>
                  <td className="stats-avg">{fmt(row.avgMs)}</td>
                  <td className="stats-buzzes">{row.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  )
}
