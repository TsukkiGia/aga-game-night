import { useEffect, useRef, useState } from 'react'
import { playWinner, playWinnerMusical, playApplause, stopWinnerSounds, playSuspenseSequence, stopSuspense } from '../sounds'
import { computePlaces } from '../utils/teamRanking'
import CloseIconButton from './CloseIconButton'

// Reveal sequence timing
const TIE_STEP_MS        = 800   // interval between podium slots in a tie
const WINNER_TEASER_MS   = 2000  // "And the winner is..." hold
const WINNER_3RD_MS      = 3200  // 3rd place slot appears
const WINNER_2ND_MS      = 4000  // 2nd place slot
const WINNER_1ST_MS      = 4800  // 1st place slot
const WINNER_ACTIONS_MS  = 6200  // action buttons appear
const SUDDEN_DEATH_MS    = 10000 // suspense kicks in for ties
const SD_BUTTON_MS       = 14000 // sudden death button appears

const COLOR_VARS = {
  ember:  'var(--terra)',
  gold:   'var(--amber)',
  forest: 'var(--teal)',
  earth:  'var(--brown)',
  indigo: 'var(--indigo)',
  rose:   'var(--rose)',
  slate:  'var(--slate)',
  sage:   'var(--sage)',
}

export default function WinnerScreen({ teams, onClose, onDismiss, onTiebreaker, onViewStats }) {
  const canvasRef = useRef(null)

  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  const topScore    = sorted[0]?.score ?? 0
  const hasScores   = topScore > 0
  const winners     = hasScores ? sorted.filter(t => t.score === topScore) : []
  const isTie       = winners.length > 1
  const winnerColor = !isTie && winners[0] ? COLOR_VARS[winners[0].color] : 'var(--amber)'

  const places     = computePlaces(sorted)
  const medals     = ['🥇', '🥈', '🥉']
  const showPodium = !sorted[3] || places[3] > places[2]

  // Reveal sequence steps:
  // 0 = teaser "And the winner is..." (skipped for ties)
  // 1 = name + score
  // 2 = 3rd place slot
  // 3 = 2nd place slot
  // 4 = 1st place slot
  // 5 = actions
  const [step, setStep] = useState(isTie ? 1 : 0)
  const [showSuddenDeath, setShowSuddenDeath] = useState(false)
  const [showSdButton,    setShowSdButton]    = useState(false)

  useEffect(() => {
    playWinner()
    playWinnerMusical()
    playApplause()
    return () => { stopWinnerSounds(); stopSuspense() }
  }, [])

  useEffect(() => {
    const timers = isTie
      ? [
          setTimeout(() => setStep(2), TIE_STEP_MS),
          setTimeout(() => setStep(3), TIE_STEP_MS * 2),
          setTimeout(() => setStep(4), TIE_STEP_MS * 3),
          setTimeout(() => setStep(5), TIE_STEP_MS * 4 + 400),
        ]
      : [
          setTimeout(() => setStep(1), WINNER_TEASER_MS),
          setTimeout(() => setStep(2), WINNER_3RD_MS),
          setTimeout(() => setStep(3), WINNER_2ND_MS),
          setTimeout(() => setStep(4), WINNER_1ST_MS),
          setTimeout(() => setStep(5), WINNER_ACTIONS_MS),
        ]
    return () => timers.forEach(clearTimeout)
  }, [isTie])

  useEffect(() => {
    if (!isTie || !onTiebreaker) return
    const t1 = setTimeout(() => { setShowSuddenDeath(true); stopWinnerSounds(); playSuspenseSequence() }, SUDDEN_DEATH_MS)
    const t2 = setTimeout(() => setShowSdButton(true), SD_BUTTON_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isTie, onTiebreaker])

  // Confetti
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const COLORS = ['#C94B2C','#E8A01E','#005548','#7B4F20','#3D4FAB','#B03060']
    const pieces = Array.from({ length: 140 }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * -canvas.height,
      w:     8  + Math.random() * 8,
      h:     5  + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speed: 2  + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.2,
    }))

    let raf
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pieces.forEach(p => {
        ctx.save()
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
        p.y     += p.speed
        p.angle += p.spin
        if (p.y > canvas.height) { p.y = -p.h; p.x = Math.random() * canvas.width }
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  // Podium order: 2nd (left), 1st (centre), 3rd (right) — classic podium layout
  const podiumOrder = [1, 0, 2]

  return (
    <div className="fullscreen-overlay">
      <canvas ref={canvasRef} className="confetti-canvas" />
      <div className="winner-screen">

        <div className="winner-tag">🏆 GAME OVER 🏆</div>

        {/* Teaser → then name */}
        <div className="winner-heading-wrap">
          {step === 0 && (
            <h1 className="winner-teaser">And the winner is...</h1>
          )}
          {step >= 1 && (
            <h1
              className="winner-heading winner-heading-pop"
              style={{ color: winnerColor }}
            >
              {!hasScores ? 'No scores yet!' : isTie ? "It's a Tie!" : `${winners[0].name} Wins!`}
            </h1>
          )}
        </div>

        {isTie && step >= 1 && (
          <div className="winner-tied-names">
            {winners.map(w => w.name).join(' & ')}
          </div>
        )}

        {hasScores && step >= 1 && (
          <div className="winner-score" style={{ color: winnerColor }}>
            {topScore} pts
          </div>
        )}

        {showPodium && (
          <div className="winner-podium">
            {podiumOrder.map(rank => {
              const team  = sorted[rank]
              const place = team ? places[rank] : rank
              // step 2 = 3rd, step 3 = 2nd, step 4 = 1st
              const visibleAt = place === 2 ? 2 : place === 1 ? 3 : 4
              const visible   = step >= visibleAt

              if (!team) return <div key={rank} className="podium-slot empty" />

              return (
                <div
                  key={team.originalIndex}
                  className={`podium-slot rank-${place} ${visible ? 'podium-visible' : 'podium-hidden'} ${place === 0 ? 'podium-first' : ''}`}
                >
                  <div className={`podium-card color-${team.color}`}>
                    <div className="podium-medal">{medals[place] ?? '🏅'}</div>
                    <div className="podium-name">{team.name}</div>
                    <div className="podium-score" style={{ color: COLOR_VARS[team.color] }}>
                      {team.score}
                    </div>
                  </div>
                  <div className="podium-block" />
                </div>
              )
            })}
          </div>
        )}

        {step >= 5 && (
          <div className="winner-actions winner-actions-reveal">
            <button className="winner-dismiss-btn" onClick={onDismiss}>✕ Close</button>
            {onViewStats && (
              <button className="winner-stats-btn" onClick={onViewStats}>⏱ View Stats</button>
            )}
            <button className="winner-close-btn"   onClick={onClose}>↺ Play Again</button>
          </div>
        )}

        {isTie && onTiebreaker && showSuddenDeath && (
          <div className="winner-sd-fullscreen">
            <CloseIconButton
              className="winner-sd-close"
              variant="ghost-light"
              onClick={() => { setShowSuddenDeath(false); stopSuspense() }}
            />
            <div className="winner-sd-but">...but is it really?</div>
            {showSdButton && (
              <button className="winner-sd-dramatic-btn" onClick={() => { stopSuspense(); onTiebreaker(winners) }}>
                ⚡ SUDDEN DEATH ⚡
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
