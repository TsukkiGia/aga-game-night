import { useState, useEffect } from 'react'

export default function Timer({ seconds = 60 }) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running || timeLeft === 0) return
    const id = setTimeout(() => {
      setTimeLeft(t => {
        if (t <= 1) { setRunning(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearTimeout(id)
  }, [running, timeLeft])

  function reset() { setTimeLeft(seconds); setRunning(false) }

  const pct = (timeLeft / seconds) * 100
  const urgent = timeLeft <= 10

  return (
    <div className="qv-timer">
      <div className={`qv-timer-display${urgent ? ' urgent' : ''}${timeLeft === 0 ? ' done' : ''}`}>
        {timeLeft === 0 ? "Time's up!" : `${timeLeft}s`}
      </div>
      <div className="qv-timer-bar-track">
        <div className="qv-timer-bar-fill" style={{ width: `${pct}%`, background: urgent ? 'var(--terra)' : 'var(--teal)' }} />
      </div>
      <div className="qv-timer-btns">
        {!running && timeLeft === seconds && (
          <button className="qv-timer-btn start" onClick={() => setRunning(true)}>▶ Start</button>
        )}
        {running && (
          <button className="qv-timer-btn pause" onClick={() => setRunning(false)}>⏸ Pause</button>
        )}
        {(!running && timeLeft !== seconds) && (
          <>
            {timeLeft > 0 && <button className="qv-timer-btn start" onClick={() => setRunning(true)}>▶ Resume</button>}
            <button className="qv-timer-btn reset" onClick={reset}>↺ Reset</button>
          </>
        )}
      </div>
    </div>
  )
}
