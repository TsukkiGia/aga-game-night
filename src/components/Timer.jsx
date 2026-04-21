import { useState, useEffect, useRef } from 'react'
import { playTimerMusic, playTick, stopTick, playTimeUp } from '../sounds'

let timerInstanceSeq = 0

function shouldLogTimerDebug() {
  if (typeof window === 'undefined') return false
  let forced = false
  try {
    forced = window.localStorage?.getItem('timerDebug') === '1'
  } catch {
    forced = false
  }
  return forced || Boolean(import.meta?.env?.DEV)
}

function logTimerDebug(instanceId, message, details = null) {
  if (!shouldLogTimerDebug()) return
  if (details === null) {
    console.info(`[timer][instance:${instanceId}] ${message}`)
    return
  }
  console.info(`[timer][instance:${instanceId}] ${message}`, details)
}

export default function Timer({
  seconds = 60,
  onExpire = null,
  autoStart = false,
  showControls = true,
  soundEnabled = true,
  forcePaused = false,
}) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(Boolean(autoStart))
  const stopMusicRef = useRef(null)
  const onExpireRef = useRef(onExpire)
  const runningRef = useRef(Boolean(autoStart))
  const pauseAppliedRef = useRef(false)
  const resumeAfterPauseRef = useRef(false)
  const instanceIdRef = useRef(0)
  if (instanceIdRef.current === 0) instanceIdRef.current = ++timerInstanceSeq
  const instanceId = instanceIdRef.current

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    logTimerDebug(instanceId, 'reset from props', { seconds, autoStart })
    setTimeLeft(seconds)
    setRunning(Boolean(autoStart))
    runningRef.current = Boolean(autoStart)
  }, [seconds, autoStart, instanceId])

  useEffect(() => {
    if (forcePaused) {
      if (pauseAppliedRef.current) return
      pauseAppliedRef.current = true
      const shouldResume = runningRef.current && timeLeft > 0
      resumeAfterPauseRef.current = shouldResume
      logTimerDebug(instanceId, 'force pause applied', { shouldResume, timeLeft })
      if (shouldResume) {
        runningRef.current = false
        setRunning(false)
      }
      stopMusicRef.current?.()
      stopMusicRef.current = null
      stopTick()
      return
    }

    if (!pauseAppliedRef.current) return
    pauseAppliedRef.current = false
    const shouldResume = resumeAfterPauseRef.current && timeLeft > 0
    resumeAfterPauseRef.current = false
    if (shouldResume) {
      logTimerDebug(instanceId, 'force pause released, resuming', { timeLeft })
      runningRef.current = true
      setRunning(true)
    } else {
      logTimerDebug(instanceId, 'force pause released, staying paused', { timeLeft })
    }
  }, [forcePaused, timeLeft, instanceId])

  useEffect(() => {
    if (!running || timeLeft === 0) return
    const id = setTimeout(() => {
      if (!runningRef.current) return
      const next = Math.max(0, timeLeft - 1)
      if (next <= 0) {
        logTimerDebug(instanceId, 'expired, invoking onExpire')
        setTimeLeft(0)
        setRunning(false)
        runningRef.current = false
        stopMusicRef.current?.()
        stopMusicRef.current = null
        stopTick()
        Promise.resolve(typeof onExpireRef.current === 'function' ? onExpireRef.current() : true)
          .then((result) => {
            const accepted = result === undefined
              ? true
              : (result === true || (typeof result === 'object' && result?.accepted !== false))
            logTimerDebug(instanceId, 'expire callback result', { accepted, result })
            if (soundEnabled && accepted) playTimeUp()
          })
          .catch(() => {})
        return
      }
      if (next <= 10) logTimerDebug(instanceId, 'countdown tick', { next, soundEnabled })
      if (soundEnabled && next <= 10) playTick()
      setTimeLeft((current) => {
        if (!runningRef.current) return current
        if (current <= 1) {
          return 0
        }
        return Math.min(current - 1, next)
      })
    }, 1000)
    return () => clearTimeout(id)
  }, [running, timeLeft, soundEnabled, instanceId])

  const shouldPlayMusic = running && soundEnabled

  // Start/stop looped timer music for the full countdown.
  useEffect(() => {
    if (!shouldPlayMusic) {
      logTimerDebug(instanceId, 'music effect stop branch', { running, soundEnabled, shouldPlayMusic })
      stopMusicRef.current?.()
      stopMusicRef.current = null
      stopTick()
      return
    }

    logTimerDebug(instanceId, 'music effect start branch', { running, soundEnabled, shouldPlayMusic })
    const stopMusic = playTimerMusic()
    stopMusicRef.current = stopMusic

    return () => {
      logTimerDebug(instanceId, 'music effect cleanup')
      stopMusic()
      if (stopMusicRef.current === stopMusic) stopMusicRef.current = null
      stopTick()
    }
  }, [shouldPlayMusic, running, soundEnabled, instanceId])

  // Stop music if component unmounts while running
  useEffect(() => {
    logTimerDebug(instanceId, 'mounted')
    return () => {
      logTimerDebug(instanceId, 'unmounted')
      stopMusicRef.current?.()
      stopTick()
    }
  }, [instanceId])

  function reset() {
    logTimerDebug(instanceId, 'manual reset', { seconds, autoStart })
    setTimeLeft(seconds)
    const nextRunning = Boolean(autoStart)
    runningRef.current = nextRunning
    setRunning(nextRunning)
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
      {showControls && (
        <div className="qv-timer-btns">
          {!running && timeLeft === seconds && (
            <button className="qv-timer-btn start" onClick={() => { runningRef.current = true; setRunning(true) }}>▶ Start</button>
          )}
          {running && (
            <button className="qv-timer-btn pause" onClick={() => { runningRef.current = false; setRunning(false) }}>⏸ Pause</button>
          )}
          {(!running && timeLeft !== seconds) && (
            <>
              {timeLeft > 0 && <button className="qv-timer-btn start" onClick={() => { runningRef.current = true; setRunning(true) }}>▶ Resume</button>}
              <button className="qv-timer-btn reset" onClick={reset}>↺ Reset</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
