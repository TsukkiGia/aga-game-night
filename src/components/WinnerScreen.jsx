import { useEffect, useRef, useState } from 'react'
import { playWinner, playWinnerMusical, playApplause, stopWinnerSounds, playSuspenseSequence, stopSuspense } from '../sounds'

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

  const places     = sorted.map(team => sorted.filter(t => t.score > team.score).length)
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
          setTimeout(() => setStep(2), 800),
          setTimeout(() => setStep(3), 1600),
          setTimeout(() => setStep(4), 2400),
          setTimeout(() => setStep(5), 3600),
        ]
      : [
          setTimeout(() => setStep(1), 2000),  // name pops in
          setTimeout(() => setStep(2), 3200),  // 3rd place
          setTimeout(() => setStep(3), 4000),  // 2nd place
          setTimeout(() => setStep(4), 4800),  // 1st place
          setTimeout(() => setStep(5), 6200),  // actions
        ]
    return () => timers.forEach(clearTimeout)
  }, [isTie])

  useEffect(() => {
    if (!isTie || !onTiebreaker) return
    const t1 = setTimeout(() => { setShowSuddenDeath(true); stopWinnerSounds(); playSuspenseSequence() }, 10000)
    const t2 = setTimeout(() => setShowSdButton(true), 14000)
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
            <button className="winner-sd-close" onClick={() => { setShowSuddenDeath(false); stopSuspense() }}>✕</button>
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
