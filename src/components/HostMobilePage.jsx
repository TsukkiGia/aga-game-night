import { useEffect, useMemo, useRef, useState } from 'react'
import rounds from '../rounds'
import { socket } from '../socket'
import { HOST_PIN_KEY, SESSION_CODE_KEY, normalizeQuestionCursor } from '../storage'

const SOUND_BUTTONS = [
  { label: 'Crickets', key: 'crickets' },
  { label: 'Faaah', key: 'faaah' },
  { label: 'Correct', key: 'correct_answer' },
  { label: 'Nani', key: 'nani' },
  { label: 'What the hell', key: 'what_the_hell' },
  { label: 'Shocked', key: 'shocked' },
  { label: 'Airhorn', key: 'airhorn' },
  { label: 'Boo', key: 'boo' },
  { label: 'Laughter', key: 'laughter' },
  { label: 'Okayy', key: 'okayy' },
  { label: 'Very wrong',     key: 'very_wrong' },
  { label: 'Hello get down', key: 'hello_get_down' },
  { label: 'Oh no no',       key: 'oh_no_no' },
  { label: "Don't provoke me",    key: 'dont_provoke_me' },
  { label: 'Why are you running', key: 'why_are_you_running' },
]
const SOUND_RESULT_TIMEOUT_MS = 5500
const SOUND_STATUS_AUTO_CLEAR_MS = 2800
const STREAK_STATUS_AUTO_CLEAR_MS = 3500
const SHOW_SOUND_STATUS = (() => {
  const envDebug = String(import.meta.env.VITE_DEBUG_BUZZ || '').trim()
  if (/^(1|true|yes)$/i.test(envDebug)) return true
  const queryDebug = new URLSearchParams(window.location.search).get('debug') || ''
  return /^(1|true|yes)$/i.test(queryDebug.trim())
})()

const normalizeCursor = normalizeQuestionCursor

function getStored(key) {
  try { return sessionStorage.getItem(key) || '' } catch { return '' }
}
function setStored(key, val) {
  try { sessionStorage.setItem(key, val) } catch { /* ignore */ }
}
function clearStored(...keys) {
  try { keys.forEach(k => sessionStorage.removeItem(k)) } catch { /* ignore */ }
}

function extractAnswerView(activeQuestion) {
  const cursor = normalizeCursor(activeQuestion)
  if (cursor === null) {
    return {
      status: 'waiting',
      heading: 'Waiting for question',
      roundLabel: '',
      rows: [],
    }
  }

  const [roundIndex, questionIndex] = cursor
  const round = rounds[roundIndex]
  if (!round) {
    return {
      status: 'invalid',
      heading: 'Invalid round',
      roundLabel: '',
      rows: [],
    }
  }

  if (questionIndex === null) {
    return {
      status: 'intro',
      heading: `${round.label} — ${round.name}`,
      roundLabel: round.intro,
      rows: round.rules.map((rule, i) => ({ label: `${i + 1}.`, value: rule })),
    }
  }

  const question = round.questions[questionIndex]
  if (!question) {
    return {
      status: 'invalid',
      heading: 'Invalid question',
      roundLabel: round.name,
      rows: [],
    }
  }

  if (round.type === 'video') {
    return {
      status: 'ok',
      heading: `${round.label} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        { label: 'Language', value: question.answer },
        ...(question.countries?.length ? [{ label: 'Countries', value: question.countries.join(', ') }] : []),
        ...(question.explanation ? [{ label: 'Explanation', value: question.explanation }] : []),
      ],
    }
  }

  if (round.type === 'slang') {
    return {
      status: 'ok',
      heading: `${round.label} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        { label: 'Term', value: question.term },
        { label: 'Meaning', value: question.meaning },
      ],
    }
  }

  if (round.type === 'charades') {
    return {
      status: 'ok',
      heading: `${round.label} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [{ label: 'Phrase', value: question.phrase }],
    }
  }

  if (round.type === 'thesis') {
    return {
      status: 'ok',
      heading: `${round.label} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        { label: 'Title', value: question.title },
        { label: 'Note', value: 'No fixed answer. Winner is decided by vote.' },
      ],
    }
  }

  return {
    status: 'invalid',
    heading: 'Unsupported round type',
    roundLabel: round.name,
    rows: [],
  }
}

export default function HostMobilePage() {
  const [connected, setConnected] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [buzzActive, setBuzzActive] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [soundStatus, setSoundStatus] = useState('')
  const [streakStatus, setStreakStatus] = useState('')
  const pendingSoundRequestIdRef = useRef('')
  const pendingSoundTimeoutRef = useRef(null)
  const soundStatusTimeoutRef = useRef(null)
  const streakStatusTimeoutRef = useRef(null)

  function clearPendingSoundTimeout() {
    if (pendingSoundTimeoutRef.current) {
      clearTimeout(pendingSoundTimeoutRef.current)
      pendingSoundTimeoutRef.current = null
    }
  }

  function clearSoundStatusTimeout() {
    if (soundStatusTimeoutRef.current) {
      clearTimeout(soundStatusTimeoutRef.current)
      soundStatusTimeoutRef.current = null
    }
  }

  function clearStreakStatusTimeout() {
    if (streakStatusTimeoutRef.current) {
      clearTimeout(streakStatusTimeoutRef.current)
      streakStatusTimeoutRef.current = null
    }
  }

  function setTransientSoundStatus(message) {
    if (!SHOW_SOUND_STATUS) return
    setSoundStatus(message)
    clearSoundStatusTimeout()
    soundStatusTimeoutRef.current = setTimeout(() => {
      setSoundStatus('')
      soundStatusTimeoutRef.current = null
    }, SOUND_STATUS_AUTO_CLEAR_MS)
  }

  function setTransientStreakStatus(message) {
    setStreakStatus(message)
    clearStreakStatusTimeout()
    streakStatusTimeoutRef.current = setTimeout(() => {
      setStreakStatus('')
      streakStatusTimeoutRef.current = null
    }, STREAK_STATUS_AUTO_CLEAR_MS)
  }

  useEffect(() => {
    function afterAuth() {
      setAuthorized(true)
      setErrorMsg('')
      socket.emit('host:question:get', (result) => {
        if (result?.ok) setActiveQuestion(normalizeCursor(result.activeQuestion))
      })
    }

    function tryAuth(code, pin, canPrompt) {
      socket.emit('host:auth', { sessionCode: code, pin, role: 'companion' }, (result) => {
        if (!result?.ok) {
          clearStored(SESSION_CODE_KEY, HOST_PIN_KEY)
          setAuthorized(false)
          if (!canPrompt) { setErrorMsg('Invalid session code or PIN'); return }
          if (result?.error === 'session-not-found') {
            setErrorMsg('Session not found. Check the session code.')
          } else if (result?.error === 'rate-limited') {
            setErrorMsg('Too many PIN attempts. Wait a minute and try again.')
          } else {
            setErrorMsg('Incorrect PIN.')
          }
          promptAndAuth()
          return
        }
        setStored(SESSION_CODE_KEY, code)
        setStored(HOST_PIN_KEY, pin)
        afterAuth()
      })
    }

    function promptAndAuth() {
      const code = (window.prompt('Enter session code') || '').trim().toUpperCase()
      if (!code) { setErrorMsg('Session code is required'); return }
      const pin = (window.prompt('Enter host PIN') || '').trim()
      if (!pin) { setErrorMsg('Host PIN is required'); return }
      tryAuth(code, pin, false)
    }

    function onConnect() {
      setConnected(true)
      const code = getStored(SESSION_CODE_KEY)
      const pin  = getStored(HOST_PIN_KEY)
      if (code && pin) { tryAuth(code, pin, true); return }
      promptAndAuth()
    }

    function onDisconnect() {
      setConnected(false)
      setAuthorized(false)
    }

    function onHostQuestion(cursor) {
      setActiveQuestion(normalizeCursor(cursor))
    }

    function onSoundResult(result) {
      const requestId = String(result?.requestId || '').trim()
      if (requestId && pendingSoundRequestIdRef.current && requestId !== pendingSoundRequestIdRef.current) return
      clearPendingSoundTimeout()
      pendingSoundRequestIdRef.current = ''
      if (result?.ok) {
        setTransientSoundStatus('Played on base host.')
      } else if (result?.error === 'audio-blocked') {
        setTransientSoundStatus('Base host blocked audio. Tap once on the base host screen.')
      } else if (result?.error === 'playback-timeout') {
        setTransientSoundStatus('No playback confirmation. Refresh the base host tab and try again.')
      } else {
        setTransientSoundStatus('Sound failed on base host.')
      }
    }

    function onHostStreak(payload) {
      const streakCount = Number.parseInt(payload?.streakCount, 10)
      const teamName = String(payload?.teamName || '').trim() || 'A team'
      if (!Number.isInteger(streakCount) || streakCount < 1) return
      setTransientStreakStatus(`${teamName} is on a ${streakCount}-answer streak`)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('host:question', onHostQuestion)
    socket.on('host:sfx:result', onSoundResult)
    socket.on('host:streak', onHostStreak)
    socket.on('buzz:winner', () => { setBuzzActive(true); setTimerRunning(true) })
    socket.on('buzz:reset', () => { setBuzzActive(false); setTimerRunning(false) })
    socket.on('host:timer:expired', () => setTimerRunning(false))
    if (socket.connected) onConnect()
    socket.connect()

    return () => {
      clearPendingSoundTimeout()
      clearSoundStatusTimeout()
      clearStreakStatusTimeout()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('host:question', onHostQuestion)
      socket.off('host:sfx:result', onSoundResult)
      socket.off('host:streak', onHostStreak)
      socket.off('buzz:winner')
      socket.off('buzz:reset')
      socket.off('host:timer:expired')
    }
  }, [])

  const answerView = useMemo(() => extractAnswerView(activeQuestion), [activeQuestion])

  function triggerSound(soundKey) {
    if (!authorized) return
    clearPendingSoundTimeout()
    clearSoundStatusTimeout()
    if (SHOW_SOUND_STATUS) setSoundStatus('Sending to base host…')
    socket.emit('host:sfx:play', soundKey, (result) => {
      if (result?.ok) {
        pendingSoundRequestIdRef.current = String(result.requestId || '')
        pendingSoundTimeoutRef.current = setTimeout(() => {
          pendingSoundRequestIdRef.current = ''
          setTransientSoundStatus('No playback confirmation. Refresh the base host tab and try again.')
          pendingSoundTimeoutRef.current = null
        }, SOUND_RESULT_TIMEOUT_MS)
        return
      }
      if (result?.error === 'unauthorized') {
        setErrorMsg('Host authorization expired. Reconnect and re-enter PIN.')
        if (SHOW_SOUND_STATUS) setSoundStatus('')
        return
      }
      if (result?.error === 'no-controller') {
        setErrorMsg('Base host controller is not connected yet.')
        if (SHOW_SOUND_STATUS) setSoundStatus('')
      }
      if (result?.error === 'invalid-sound') {
        setTransientSoundStatus('Invalid sound key.')
      }
    })
  }

  return (
    <div className="host-mobile-page">
      <section className="host-mobile-answer-card">
        <div className="host-mobile-head">
          <h1 className="host-mobile-title">Host Answers</h1>
          <div className={`host-mobile-status${connected ? ' on' : ''}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        {errorMsg && <div className="host-mobile-error">{errorMsg}</div>}
        {streakStatus && <div className="host-mobile-streak-status">{streakStatus} 🔥</div>}
        {!authorized ? (
          <div className="host-mobile-wait">Waiting for host authorization…</div>
        ) : (
          <>
            <div className="host-mobile-heading">{answerView.heading}</div>
            {answerView.roundLabel && <div className="host-mobile-round">{answerView.roundLabel}</div>}
            <div className="host-mobile-rows">
              {answerView.rows.length === 0 ? (
                <div className="host-mobile-wait">No answer to show yet</div>
              ) : (
                answerView.rows.map((row) => (
                  <div key={row.label} className="host-mobile-row">
                    <div className="host-mobile-row-label">{row.label}</div>
                    <div className="host-mobile-row-value">{row.value}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {authorized && (
        <section className="host-mobile-timer-card">
          <button
            className="host-mobile-timer-stop-btn"
            type="button"
            disabled={!timerRunning}
            onClick={() => { socket.emit('host:timer:stop'); setTimerRunning(false) }}
          >
            ⏹ Stop Timer
          </button>
          <button
            className="host-mobile-timer-stop-btn"
            type="button"
            disabled={!buzzActive || timerRunning}
            onClick={() => { socket.emit('host:timer:restart'); setTimerRunning(true) }}
            style={{ marginTop: 8, background: '#1a7f4b' }}
          >
            ▶ Restart Timer
          </button>
        </section>
      )}

      <section className="host-mobile-sounds-card">
        <h2 className="host-mobile-sounds-title">Sound Bites</h2>
        {SHOW_SOUND_STATUS && soundStatus && <div className="host-mobile-sound-status">{soundStatus}</div>}
        <div className="host-mobile-sounds-grid">
          {SOUND_BUTTONS.map((sound) => (
            <button
              key={sound.label}
              className="host-mobile-sound-btn"
              onClick={() => triggerSound(sound.key)}
              type="button"
            >
              {sound.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
