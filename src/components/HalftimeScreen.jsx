import { useEffect } from 'react'
import { playWhistle } from '../sounds'
import { computePlaces } from '../utils/teamRanking'

export default function HalftimeScreen({ teams, onClose }) {
  useEffect(() => { playWhistle() }, [])
  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  const leader = sorted[0]
  const hasScores = leader.score > 0
  const places = computePlaces(sorted)
  const medals = ['🥇','🥈','🥉']
  const topTied = hasScores ? sorted.filter(t => t.score === leader.score) : []

  return (
    <div className="fullscreen-overlay">
      <div className="halftime-screen">
        <div className="halftime-tag">HALFTIME</div>
        <h1 className="halftime-heading">Scores So Far</h1>

        <div className="halftime-rows">
          {sorted.map((team, rank) => {
            const place = places[rank]
            const isLeading = place === 0 && hasScores
            return (
              <div
                key={team.originalIndex}
                className={`halftime-row color-${team.color}${isLeading ? ' leading' : ''}`}
              >
                <span className="halftime-rank">
                  {hasScores ? (medals[place] ?? ['4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'][place - 3] ?? '—') : '—'}
                </span>
                <span className="halftime-name">{team.name}</span>
                <span className="halftime-score">{team.score}</span>
              </div>
            )
          })}
        </div>

        {hasScores && (
          <div className="halftime-leader-note">
            {topTied.length > 1
              ? `${topTied.map(t => t.name).join(', ')} are tied!`
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
