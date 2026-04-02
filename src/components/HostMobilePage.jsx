import { useEffect, useMemo, useState } from 'react'
import rounds from '../rounds'
import { socket } from '../socket'
import {
  playAirhorn,
  playBoo,
  playCorrectAnswer,
  playCrickets,
  playFaaah,
  playLaughter,
  playNani,
  playOkayy,
  playShocked,
  playVeryWrong,
  playWhatTheHell,
} from '../sounds'

const HOST_PIN_KEY = 'scorekeeping_host_pin'

const SOUND_BUTTONS = [
  { label: 'Crickets', action: playCrickets },
  { label: 'Faaah', action: playFaaah },
  { label: 'Correct', action: playCorrectAnswer },
  { label: 'Nani', action: playNani },
  { label: 'What the hell', action: playWhatTheHell },
  { label: 'Shocked', action: playShocked },
  { label: 'Airhorn', action: playAirhorn },
  { label: 'Boo', action: playBoo },
  { label: 'Laughter', action: playLaughter },
  { label: 'Okayy', action: playOkayy },
  { label: 'Very wrong', action: playVeryWrong },
]

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
      heading: `${round.label} intro`,
      roundLabel: round.name,
      rows: [{ label: 'Status', value: 'Round intro on base app (no answer yet)' }],
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

      socket.emit('host:auth', pin, (result) => {
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

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('host:question', onHostQuestion)
    if (socket.connected) onConnect()
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('host:question', onHostQuestion)
    }
  }, [])

  const answerView = useMemo(() => extractAnswerView(activeQuestion), [activeQuestion])

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

      <section className="host-mobile-sounds-card">
        <h2 className="host-mobile-sounds-title">Sound Bites</h2>
        <div className="host-mobile-sounds-grid">
          {SOUND_BUTTONS.map((sound) => (
            <button
              key={sound.label}
              className="host-mobile-sound-btn"
              onClick={sound.action}
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
