import { useEffect, useState } from 'react'
import { playTransition } from '../sounds'

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('in') // 'in' | 'hold' | 'out'

  useEffect(() => {
    playTransition()
    const holdTimer  = setTimeout(() => setPhase('out'),  5200)
    const doneTimer  = setTimeout(() => onDone(),         5500)
    return () => { clearTimeout(holdTimer); clearTimeout(doneTimer) }
  }, [onDone])

  return (
    <div className={`splash-screen splash-${phase}`}>
      <div className="splash-content">
        <div className="splash-adinkra">⬡</div>
        <h1 className="splash-title">Sankofa Showdown</h1>
        <div className="splash-divider" />
        <p className="splash-credit">A game by <strong>Gianna Torpey</strong> &amp; MIT AGA</p>
        <a
          className="splash-ig"
          href="https://instagram.com/gianna_boadi"
          target="_blank"
          rel="noreferrer"
        >
          @gianna_boadi
        </a>
      </div>
    </div>
  )
}
