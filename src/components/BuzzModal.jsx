import { useState, useEffect, useRef, useCallback } from 'react'
import Timer from './Timer'
import { getRevealOutcome } from '../utils/buzzReveal'

// Round types that support in-modal answer reveal
const REVEAL_ANSWER_CONFIG = {
  slang:         { label: 'Meaning', getText: (q) => q.meaning },
  charades:      { label: 'Phrase',  getText: (q) => q.phrase },
  video:         { label: 'Answer',  getText: (q) => q.answer, showExplanation: true },
  'custom-buzz': { label: 'Answer',  getText: (q) => q.answer, showExplanation: true },
}

export default function BuzzModal({
  buzzWinner, teams, round, question,
  stealMode, doublePoints, stealAllowedTeamIndices = null,
  onAdjust, onDismiss, onWrongAndSteal, timerControlSignal, onTimerExpired,
}) {
  const isVideoQuestion = round?.type === 'video'
    || (round?.type === 'custom-buzz' && String(question?.promptType || '').trim().toLowerCase() === 'video')
  const timerSoundEnabled = !isVideoQuestion
  const [revealedInModal, setRevealedInModal] = useState(false)
  const [revealedCountry, setRevealedCountry] = useState(false)
  const [buzzCountdown, setBuzzCountdown] = useState(null)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownRunId, setCountdownRunId] = useState(0)
  const lastHandledTimerSignalRef = useRef(0)

  const stopCountdown = useCallback(() => {
    setCountdownActive(false)
    setBuzzCountdown(null)
  }, [])

  const startCountdown = useCallback(() => {
    setCountdownRunId((prev) => prev + 1)
    setCountdownActive(true)
    setBuzzCountdown(10)
  }, [])

  useEffect(() => {
    if (!buzzWinner || buzzWinner.manual) {
      const id = setTimeout(() => stopCountdown(), 0)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => startCountdown(), 0)
    return () => clearTimeout(id)
  }, [buzzWinner, startCountdown, stopCountdown])

  useEffect(() => {
    const sequence = Number(timerControlSignal?.sequence || 0)
    if (sequence <= 0) return
    if (sequence === lastHandledTimerSignalRef.current) return
    lastHandledTimerSignalRef.current = sequence

    if (timerControlSignal.action === 'stop') {
      setTimeout(() => stopCountdown(), 0)
      return
    }

    if (timerControlSignal.action === 'restart') {
      if (!buzzWinner || buzzWinner.manual) return
      setTimeout(() => startCountdown(), 0)
    }
  }, [timerControlSignal, buzzWinner, startCountdown, stopCountdown])

  function handleDismiss() {
    setRevealedInModal(false)
    setRevealedCountry(false)
    onDismiss()
  }

  if (!buzzWinner?.team) return null

  const scoring = round.scoring || {}
  const correctLabel = scoring.correctLabel || 'Correct answer'
  const wrongLabel = scoring.wrongLabel || 'Wrong answer'

  function handleScore(points, entryKind, bonus = null) {
    stopCountdown()
    onAdjust(buzzWinner.teamIndex, points)
    const outcome = getRevealOutcome({ roundType: round.type, entryKind, bonus })
    if (outcome.revealCountry) setRevealedCountry(true)
    if (outcome.revealAnswer) setRevealedInModal(true)
  }

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
            {countdownActive && (
              <Timer
                key={`buzz-countdown-${countdownRunId}`}
                seconds={10}
                autoStart
                showControls={false}
                showDisplay={false}
                showBar={false}
                renderVisual={false}
                soundEnabled={timerSoundEnabled}
                playMusic={false}
                tickThresholdSeconds={10}
                onTick={(next) => setBuzzCountdown(next)}
                onExpire={() => {
                  stopCountdown()
                  return onTimerExpired?.() ?? true
                }}
              />
            )}
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
          {stealMode ? (
            <>
              <ScoringButton
                label="Correct steal"
                points={scoring.correctStealPoints ?? 2}
                doublePoints={doublePoints}
                onClick={() => handleScore(scoring.correctStealPoints ?? 2, 'correct-steal')}
              />
              <ScoringButton
                label="Wrong steal"
                points={scoring.wrongStealPoints ?? 0}
                doublePoints={doublePoints}
                onClick={() => handleScore(scoring.wrongStealPoints ?? 0, 'wrong-steal')}
              />
            </>
          ) : (
            <>
              <ScoringButton
                label={correctLabel}
                points={scoring.correctPoints ?? 3}
                doublePoints={doublePoints}
                onClick={() => handleScore(scoring.correctPoints ?? 3, 'correct')}
              />
              {(scoring.bonuses || []).map((bonus) => (
                <ScoringButton
                  key={bonus.label}
                  label={bonus.label}
                  points={bonus.points}
                  doublePoints={doublePoints}
                  onClick={() => handleScore(bonus.points, 'bonus', bonus)}
                />
              ))}
              <ScoringButton
                label={wrongLabel}
                points={scoring.wrongPoints ?? -1}
                doublePoints={doublePoints}
                onClick={() => handleScore(scoring.wrongPoints ?? -1, 'wrong')}
              />
            </>
          )}
        </div>

        {!stealMode && scoring.stealEnabled !== false && (
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

        {revealedInModal && (() => {
          const cfg = REVEAL_ANSWER_CONFIG[round.type]
          if (!cfg) return null
          return (
            <div className="buzz-popup-answer">
              <div className="buzz-popup-answer-label">{cfg.label}</div>
              <div className="buzz-popup-answer-text">{cfg.getText(question)}</div>
              {cfg.showExplanation && question.explanation && (
                <div className="buzz-popup-answer-explanation">{question.explanation}</div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function ScoringButton({ label, points, doublePoints, onClick }) {
  const display = doublePoints ? points * 2 : points
  return (
    <button
      className={`buzz-pts-btn ${points > 0 ? 'pos' : 'neg'}`}
      onClick={onClick}
      title={label}
    >
      <span className="buzz-pts-label">{label}</span>
      <span className="buzz-pts-value">{display > 0 ? `+${display}` : display}</span>
    </button>
  )
}
