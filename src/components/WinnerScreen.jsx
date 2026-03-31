import { useEffect, useRef } from 'react'
import { playWinner, playWinnerMusical, playApplause } from '../sounds'

export default function WinnerScreen({ teams, onClose, onDismiss, onTiebreaker }) {
  const canvasRef = useRef(null)

  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  const topScore = sorted[0]?.score ?? 0
  const hasScores = topScore > 0
  const winners = hasScores ? sorted.filter(t => t.score === topScore) : []
  const isTie = winners.length > 1

  // Place = number of teams with a strictly higher score (ties share the same place)
  const places = sorted.map(team => sorted.filter(t => t.score > team.score).length)
  const medals = ['🥇', '🥈', '🥉']

  // Hide podium if a 4th team was cut off with the same place as the 3rd slot
  // (e.g. 4 tied for 1st, 3 tied for 2nd, 4 tied for 3rd)
  const showPodium = !sorted[3] || places[3] > places[2]

  useEffect(() => { playWinner(); playWinnerMusical(); playApplause() }, [])

  // Simple confetti
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const COLORS = ['#C94B2C','#E8A01E','#005548','#7B4F20','#3D4FAB','#B03060']
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speed: 2 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
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
        p.y += p.speed
        p.angle += p.spin
        if (p.y > canvas.height) { p.y = -p.h; p.x = Math.random() * canvas.width }
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="fullscreen-overlay">
      <canvas ref={canvasRef} className="confetti-canvas" />
      <div className="winner-screen">
        <div className="winner-tag">🏆 GAME OVER 🏆</div>
        <h1 className="winner-heading">
          {!hasScores ? 'No scores yet!' : isTie ? "It's a Tie!" : `${winners[0].name} Wins!`}
        </h1>

        {isTie && (
          <div className="winner-tied-names">
            {winners.map(w => w.name).join(' & ')}
          </div>
        )}

        {hasScores && <div className="winner-score">{topScore} pts</div>}

        {showPodium && <div className="winner-podium">
          {[1, 0, 2].map(rank => {
            const team = sorted[rank]
            if (!team) return <div key={rank} className="podium-slot empty" />
            const place = places[rank]
            return (
              <div key={team.originalIndex} className={`podium-slot rank-${place}`}>
                <div className={`podium-card color-${team.color}`}>
                  <div className="podium-medal">{medals[place] ?? '🏅'}</div>
                  <div className="podium-name">{team.name}</div>
                  <div className={`podium-score color-${team.color}`}>{team.score}</div>
                </div>
                <div className="podium-block" />
              </div>
            )
          })}
        </div>}

        <div className="winner-actions">
          <button className="winner-dismiss-btn" onClick={onDismiss}>✕ Close</button>
          {isTie && onTiebreaker && (
            <button className="winner-tiebreaker-btn" onClick={() => onTiebreaker(winners)}>
              ⚡ Sudden Death
            </button>
          )}
          <button className="winner-close-btn" onClick={onClose}>↺ Play Again</button>
        </div>
      </div>
    </div>
  )
}
