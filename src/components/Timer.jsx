import { useState, useEffect, useRef } from 'react'
import { playTimerMusic, playTick, stopTick, playTimeUp } from '../sounds'

export default function Timer({ seconds = 60 }) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  const stopMusicRef = useRef(null)

  useEffect(() => {
    if (!running || timeLeft === 0) return
    const id = setTimeout(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setRunning(false)
          stopTick()
          playTimeUp()
          return 0
        }
        if (t - 1 <= 10) playTick()
        return t - 1
      })
    }, 1000)
    return () => clearTimeout(id)
  }, [running, timeLeft])

  // Start/stop music when running changes
  useEffect(() => {
    if (running) {
      stopMusicRef.current = playTimerMusic()
    } else {
      stopMusicRef.current?.()
      stopMusicRef.current = null
      stopTick()
    }
  }, [running])

  // Stop music if component unmounts while running
  useEffect(() => {
    return () => stopMusicRef.current?.()
  }, [])

  function reset() {
    setTimeLeft(seconds)
    setRunning(false)
  }

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
