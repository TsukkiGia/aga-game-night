import { useState, useEffect, useRef, useCallback } from 'react'
import { playTick, stopTick, playTimeUp } from '../sounds'

export default function BuzzModal({
  buzzWinner, teams, round, question,
  stealMode, doublePoints, stealAllowedTeamIndices = null,
  onAdjust, onDismiss, onWrongAndSteal, timerControlSignal, onTimerExpired,
}) {
  const [revealedInModal, setRevealedInModal] = useState(false)
  const [revealedCountry, setRevealedCountry] = useState(false)
  const [buzzCountdown, setBuzzCountdown] = useState(null)
  const buzzCountdownRef = useRef(null)
  const lastHandledTimerSignalRef = useRef(0)
  const onTimerExpiredRef = useRef(onTimerExpired)
  onTimerExpiredRef.current = onTimerExpired

  const stopCountdown = useCallback(() => {
    clearInterval(buzzCountdownRef.current)
    stopTick()
    setBuzzCountdown(null)
  }, [])

  const startCountdown = useCallback(() => {
    clearInterval(buzzCountdownRef.current)
    stopTick()
    setBuzzCountdown(10)
    let count = 10
    buzzCountdownRef.current = setInterval(() => {
      count--
      setBuzzCountdown(count)
      if (count > 0) {
        playTick()
      } else {
        stopTick()
        playTimeUp()
        clearInterval(buzzCountdownRef.current)
        onTimerExpiredRef.current?.()
      }
    }, 1000)
  }, [])

  useEffect(() => {
    if (!buzzWinner || buzzWinner.manual) { setBuzzCountdown(null); return }
    startCountdown()
    return () => { clearInterval(buzzCountdownRef.current); stopTick(); setBuzzCountdown(null) }
  }, [buzzWinner, startCountdown])

  useEffect(() => {
    const sequence = Number(timerControlSignal?.sequence || 0)
    if (sequence <= 0) return
    if (sequence === lastHandledTimerSignalRef.current) return
    lastHandledTimerSignalRef.current = sequence

    if (timerControlSignal.action === 'stop') {
      stopCountdown()
      return
    }

    if (timerControlSignal.action === 'restart') {
      if (!buzzWinner || buzzWinner.manual) return
      startCountdown()
    }
  }, [timerControlSignal, buzzWinner, stopCountdown, startCountdown])

  function handleDismiss() {
    setRevealedInModal(false)
    setRevealedCountry(false)
    onDismiss()
  }

  if (!buzzWinner?.team) return null

  return (
    <div className="buzz-overlay" onClick={handleDismiss}>
      <div
        className={`buzz-popup color-${buzzWinner.team.color}`}
        onClick={e => e.stopPropagation()}
      >
        {buzzCountdown !== null && (
          <div className="buzz-countdown-wrap">
            <div className={`buzz-countdown${buzzCountdown <= 3 ? ' urgent' : ''}`}>{buzzCountdown}</div>
            <div className="buzz-countdown-caption">seconds to answer</div>
          </div>
        )}
        <div className="buzz-popup-label">{stealMode ? '🔀 STEAL!' : 'BUZZED IN!'}</div>
        <div className="buzz-popup-name">
          {buzzWinner.memberName
            ? `${buzzWinner.memberName} just buzzed in for ${buzzWinner.team.name}!`
            : `${buzzWinner.team.name} buzzed in!`}
        </div>
        <div className="buzz-popup-score">Current Score: {teams[buzzWinner.teamIndex]?.score ?? 0} pts</div>
        <div className="buzz-popup-scoring">
          {round.scoring
            .filter(({ label }) => {
              const isStealEntry = label.toLowerCase().includes('steal')
              return stealMode ? isStealEntry : !isStealEntry
            })
            .map(({ label, points }) => {
              const displayPoints = doublePoints ? points * 2 : points
              return (
                <button
                  key={label}
                  className={`buzz-pts-btn ${points > 0 ? 'pos' : 'neg'}`}
                  onClick={() => {
                    stopCountdown()
                    onAdjust(buzzWinner.teamIndex, points)
                    const canReveal = round.type === 'slang' || round.type === 'video' || round.type === 'charades'
                    if (stealMode) {
                      if (canReveal) setRevealedInModal(true)
                    } else if (round.type === 'video' && label === 'Correct country') {
                      setRevealedCountry(true)
                    } else if (points >= 3 && canReveal) {
                      setRevealedInModal(true)
                    }
                  }}
                  title={label}
                >
                  <span className="buzz-pts-label">{label}</span>
                  <span className="buzz-pts-value">{displayPoints > 0 ? `+${displayPoints}` : displayPoints}</span>
                </button>
              )
            })}
        </div>

        {!stealMode && round.scoring.some(({ label }) => label.toLowerCase().includes('steal')) && (
          <button
            className="buzz-steal-btn"
            onClick={() => {
              setRevealedInModal(false)
              setRevealedCountry(false)
              const explicit = Array.isArray(stealAllowedTeamIndices)
                ? stealAllowedTeamIndices
                : teams.map((_, i) => i)
              const filtered = explicit.filter((i) => i !== buzzWinner.teamIndex)
              onWrongAndSteal(filtered)
            }}
          >
            Open Steal
          </button>
        )}

        <button className="buzz-dismiss-btn" onClick={handleDismiss}>Reset Buzzers</button>

        {revealedCountry && !revealedInModal && round.type === 'video' && question.countries?.length > 0 && (
          <div className="buzz-popup-answer">
            <div className="buzz-popup-answer-label">Countries</div>
            <div className="buzz-popup-answer-text">{question.countries.join(', ')}</div>
          </div>
        )}

        {revealedInModal && (
          <div className="buzz-popup-answer">
            {round.type === 'slang' && (
              <>
                <div className="buzz-popup-answer-label">Meaning</div>
                <div className="buzz-popup-answer-text">{question.meaning}</div>
              </>
            )}
            {round.type === 'charades' && (
              <>
                <div className="buzz-popup-answer-label">Phrase</div>
                <div className="buzz-popup-answer-text">{question.phrase}</div>
              </>
            )}
            {round.type === 'video' && (
              <>
                <div className="buzz-popup-answer-label">Answer</div>
                <div className="buzz-popup-answer-text">{question.answer}</div>
                {question.explanation && (
                  <div className="buzz-popup-answer-explanation">{question.explanation}</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
