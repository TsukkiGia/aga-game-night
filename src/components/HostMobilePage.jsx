import { useEffect, useMemo, useRef, useState } from 'react'
import rounds from '../rounds'
import { socket } from '../socket'
import { HOST_PIN_KEY } from '../storage'

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
const SHOW_SOUND_STATUS = (() => {
  const envDebug = String(import.meta.env.VITE_DEBUG_BUZZ || '').trim()
  if (/^(1|true|yes)$/i.test(envDebug)) return true
  const queryDebug = new URLSearchParams(window.location.search).get('debug') || ''
  return /^(1|true|yes)$/i.test(queryDebug.trim())
})()

// Mirrors normalizeQuestionCursor() in server.js — keep in sync.
function normalizeCursor(rawCursor) {
  if (rawCursor === null) return null
  if (!Array.isArray(rawCursor) || rawCursor.length !== 2) return null
  const [roundIndex, questionIndex] = rawCursor
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex !== null && (!Number.isInteger(questionIndex) || questionIndex < 0)) return null
  return [roundIndex, questionIndex]
}

function getStoredPin() {
  try {
    return sessionStorage.getItem(HOST_PIN_KEY) || ''
  } catch {
    return ''
  }
}

function storePin(pin) {
  try {
    sessionStorage.setItem(HOST_PIN_KEY, pin)
  } catch {
    // ignore storage failures
  }
}

function clearPin() {
  try {
    sessionStorage.removeItem(HOST_PIN_KEY)
  } catch {
    // ignore storage failures
  }
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
  const [errorMsg, setErrorMsg] = useState('')
  const [soundStatus, setSoundStatus] = useState('')
  const pendingSoundRequestIdRef = useRef('')
  const pendingSoundTimeoutRef = useRef(null)
  const soundStatusTimeoutRef = useRef(null)

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

  function setTransientSoundStatus(message) {
    if (!SHOW_SOUND_STATUS) return
    setSoundStatus(message)
    clearSoundStatusTimeout()
    soundStatusTimeoutRef.current = setTimeout(() => {
      setSoundStatus('')
      soundStatusTimeoutRef.current = null
    }, SOUND_STATUS_AUTO_CLEAR_MS)
  }

  useEffect(() => {
    function requestPin() {
      const entered = window.prompt('Enter host PIN')
      return (entered || '').trim()
    }

    function afterAuth() {
      setAuthorized(true)
      setErrorMsg('')
      socket.emit('host:question:get', (result) => {
        if (result?.ok) setActiveQuestion(normalizeCursor(result.activeQuestion))
      })
    }

    function attemptAuth(pin, canRetry = true) {
      if (!pin) {
        setAuthorized(false)
        setErrorMsg('Host PIN is required')
        return
      }

      socket.emit('host:auth', { pin, role: 'companion' }, (result) => {
        if (!result?.ok) {
          clearPin()
          setAuthorized(false)
          if (result?.error === 'host-pin-not-configured') {
            setErrorMsg('HOST_PIN is not configured on the server')
            return
          }
          if (canRetry) {
            const retryPin = requestPin()
            if (retryPin) {
              attemptAuth(retryPin, false)
              return
            }
          }
          setErrorMsg('Invalid host PIN')
          return
        }
        storePin(pin)
        afterAuth()
      })
    }

    function onConnect() {
      setConnected(true)
      const stored = getStoredPin()
      if (stored) {
        attemptAuth(stored)
        return
      }
      const entered = requestPin()
      if (entered) attemptAuth(entered)
      else setErrorMsg('Host PIN is required')
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

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('host:question', onHostQuestion)
    socket.on('host:sfx:result', onSoundResult)
    if (socket.connected) onConnect()
    socket.connect()

    return () => {
      clearPendingSoundTimeout()
      clearSoundStatusTimeout()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('host:question', onHostQuestion)
      socket.off('host:sfx:result', onSoundResult)
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
            onClick={() => socket.emit('host:timer:stop')}
          >
            ⏹ Stop Timer
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
