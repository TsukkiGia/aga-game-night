import { useState, useEffect, useRef } from 'react'
import { playTimerMusic, playTick, stopTick, playTimeUp } from '../../core/sounds'
import { logTimerDebug } from '../../utils/timerDebug'

let timerInstanceSeq = 0

export default function Timer({
  seconds = 60,
  onExpire = null,
  onTick = null,
  autoStart = false,
  showControls = true,
  showDisplay = true,
  showBar = true,
  renderVisual = true,
  soundEnabled = true,
  playMusic = true,
  tickThresholdSeconds = 10,
  forcePaused = false,
}) {
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [running, setRunning] = useState(Boolean(autoStart))
  const stopMusicRef = useRef(null)
  const onExpireRef = useRef(onExpire)
  const onTickRef = useRef(onTick)
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
    onTickRef.current = onTick
  }, [onTick])

  useEffect(() => {
    if (typeof onTickRef.current === 'function') onTickRef.current(timeLeft)
  }, [timeLeft])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    logTimerDebug('reset from props', { seconds, autoStart }, { instanceId })
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
      logTimerDebug('force pause applied', { shouldResume, timeLeft }, { instanceId })
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
      logTimerDebug('force pause released, resuming', { timeLeft }, { instanceId })
      runningRef.current = true
      setRunning(true)
    } else {
      logTimerDebug('force pause released, staying paused', { timeLeft }, { instanceId })
    }
  }, [forcePaused, timeLeft, instanceId])

  useEffect(() => {
    if (!running || timeLeft === 0) return
    const id = setTimeout(() => {
      if (!runningRef.current) return
      const next = Math.max(0, timeLeft - 1)
      if (next <= 0) {
        logTimerDebug('expired, invoking onExpire', null, { instanceId })
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
            logTimerDebug('expire callback result', { accepted, result }, { instanceId })
            if (soundEnabled && accepted) playTimeUp()
          })
          .catch(() => {})
        return
      }
      const shouldPlayTick = Number.isFinite(Number(tickThresholdSeconds))
        ? (Number(tickThresholdSeconds) > 0 && next <= Number(tickThresholdSeconds))
        : (next <= 10)
      if (shouldPlayTick) logTimerDebug('countdown tick', { next, soundEnabled }, { instanceId })
      if (soundEnabled && shouldPlayTick) playTick()
      setTimeLeft((current) => {
        if (!runningRef.current) return current
        if (current <= 1) {
          return 0
        }
        return Math.min(current - 1, next)
      })
    }, 1000)
    return () => clearTimeout(id)
  }, [running, timeLeft, soundEnabled, instanceId, tickThresholdSeconds])

  const shouldPlayMusic = running && soundEnabled && playMusic

  // Start/stop looped timer music for the full countdown.
  useEffect(() => {
    if (!shouldPlayMusic) {
      logTimerDebug('music effect stop branch', { running, soundEnabled, shouldPlayMusic }, { instanceId })
      stopMusicRef.current?.()
      stopMusicRef.current = null
      stopTick()
      return
    }

    logTimerDebug('music effect start branch', { running, soundEnabled, shouldPlayMusic }, { instanceId })
    const stopMusic = playTimerMusic()
    stopMusicRef.current = stopMusic

    return () => {
      logTimerDebug('music effect cleanup', null, { instanceId })
      stopMusic()
      if (stopMusicRef.current === stopMusic) stopMusicRef.current = null
      stopTick()
    }
  }, [shouldPlayMusic, running, soundEnabled, instanceId])

  // Stop music if component unmounts while running
  useEffect(() => {
    logTimerDebug('mounted', null, { instanceId })
    return () => {
      logTimerDebug('unmounted', null, { instanceId })
      stopMusicRef.current?.()
      stopTick()
    }
  }, [instanceId])

  function reset() {
    logTimerDebug('manual reset', { seconds, autoStart }, { instanceId })
    setTimeLeft(seconds)
    const nextRunning = Boolean(autoStart)
    runningRef.current = nextRunning
    setRunning(nextRunning)
  }

  const pct = (timeLeft / seconds) * 100
  const urgent = timeLeft <= 10

  if (!renderVisual) return null

  return (
    <div className="qv-timer">
      {showDisplay && (
        <div className={`qv-timer-display${urgent ? ' urgent' : ''}${timeLeft === 0 ? ' done' : ''}`}>
          {timeLeft === 0 ? "Time's up!" : `${timeLeft}s`}
        </div>
      )}
      {showBar && (
        <div className="qv-timer-bar-track">
          <div className="qv-timer-bar-fill" style={{ width: `${pct}%`, background: urgent ? 'var(--terra)' : 'var(--teal)' }} />
        </div>
      )}
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
