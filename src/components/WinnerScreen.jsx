import { useEffect, useRef } from 'react'

export default function WinnerScreen({ teams, onClose, onDismiss }) {
  const canvasRef = useRef(null)

  const sorted = [...teams]
    .map((t, i) => ({ ...t, originalIndex: i }))
    .sort((a, b) => b.score - a.score)

  const topScore = sorted[0]?.score ?? 0
  const hasScores = topScore > 0
  const winners = hasScores ? sorted.filter(t => t.score === topScore) : []
  const isTie = winners.length > 1

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

        <div className="winner-podium">
          {sorted.slice(0, Math.min(3, sorted.length)).map((team, rank) => (
            <div key={team.originalIndex} className={`podium-entry rank-${rank} color-${team.color}`}>
              <div className="podium-medal">
                {['🥇','🥈','🥉'][rank]}
              </div>
              <div className="podium-name">{team.name}</div>
              <div className="podium-score">{team.score}</div>
            </div>
          ))}
        </div>

        <div className="winner-actions">
          <button className="winner-dismiss-btn" onClick={onDismiss}>✕ Close</button>
          <button className="winner-close-btn" onClick={onClose}>↺ Play Again</button>
        </div>
      </div>
    </div>
  )
}
