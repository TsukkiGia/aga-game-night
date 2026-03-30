import { useEffect } from 'react'

export default function RoundTransitionScreen({ round, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2800)
    return () => clearTimeout(id)
  }, [onDone])

  return (
    <div className="fullscreen-overlay transition-overlay" onClick={onDone}>
      <div className="round-transition">
        <div className="rt-label">Up Next</div>
        <div className="rt-round-tag">{round.label}</div>
        <div className="rt-round-name">{round.name}</div>
        <div className="rt-hint">tap to continue</div>
      </div>
    </div>
  )
}
