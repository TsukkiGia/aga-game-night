import { useEffect, useRef } from 'react'

const AUTO_AWARD_DELAY_MS = 2800

export default function SuddenDeathOverlay({ tiedTeams, buzzWinner, hostlessCorrectEvent, isHostlessMode, suddenDeathQuestion, onAward, onWrong, onShuffle, onCancel }) {
  const winner = isHostlessMode ? hostlessCorrectEvent : buzzWinner
  const awardedRef = useRef(false)
  const onAwardRef = useRef(onAward)
  useEffect(() => { onAwardRef.current = onAward })

  useEffect(() => {
    if (!isHostlessMode || !winner || awardedRef.current) return
    awardedRef.current = true
    const teamIndex = winner.teamIndex
    const timer = window.setTimeout(() => onAwardRef.current(teamIndex), AUTO_AWARD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isHostlessMode, winner])

  const winnerLabel = winner
    ? (winner.memberName
      ? `${winner.memberName} for ${winner.team?.name || 'their team'}`
      : (winner.team?.name || 'A team'))
    : null

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

        {suddenDeathQuestion && (
          <div className="sd-question">{suddenDeathQuestion.text}</div>
        )}

        {!winner ? (
          <div className="sd-waiting-row">
            <div className="sd-waiting">
              {isHostlessMode ? 'Waiting for a correct answer…' : 'Buzzers armed — waiting for buzz…'}
            </div>
            {onShuffle && (
              <button className="sd-shuffle-btn" onClick={onShuffle} title="Pick a different question">
                🔀 New question
              </button>
            )}
          </div>
        ) : (
          <div className="sd-buzz-result sd-buzz-result--celebrate">
            <div className="sd-winner-flash">🏆</div>
            <div className="sd-buzzed-label">{winnerLabel}</div>
            <div className="sd-buzz-sublabel">{isHostlessMode ? 'got it right!' : 'buzzed in!'}</div>
            {!isHostlessMode && (
              <div className="sd-buzz-actions">
                <button className="sd-correct-btn" onClick={() => onAward(winner.teamIndex)}>
                  ✓ Correct — Wins!
                </button>
                <button className="sd-wrong-btn" onClick={onWrong}>
                  ✗ Wrong — Re-arm
                </button>
              </div>
            )}
          </div>
        )}

        <button className="sd-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
