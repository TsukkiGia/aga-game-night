import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import rounds from '../../core/rounds'
import { socket } from '../../core/socket'
import { mapHostAuthError } from '../../core/auth'
import { normalizeQuestionCursor, readHostCredentials, writeHostCredentials, clearHostCredentials } from '../../core/storage'
import { buildPlanCatalog, defaultPlanIds, normalizeCursorId } from '../../core/gamePlan'
import { normalizeRoundCatalog } from '../../core/roundCatalog'

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

const DEFAULT_ROUND_CATALOG = normalizeRoundCatalog(rounds)

function normalizeCursor(rawCursor, planCatalog, planIds) {
  const normalized = normalizeQuestionCursor(rawCursor)
  return normalizeCursorId(normalized, planIds, planCatalog)
}

function extractAnswerView(activeQuestion, roundCatalog, planCatalog, planIds) {
  const cursorId = normalizeCursor(activeQuestion, planCatalog, planIds)
  if (cursorId === null) {
    return {
      status: 'waiting',
      heading: 'Waiting for question',
      roundLabel: '',
      rows: [],
    }
  }

  const item = planCatalog.byId.get(cursorId)
  if (!item) {
    return {
      status: 'invalid',
      heading: 'Invalid cursor',
      roundLabel: '',
      rows: [],
    }
  }

  const roundIndex = item.roundIndex
  const questionIndex = item.questionIndex
  const round = roundCatalog[roundIndex]
  if (!round) {
    return {
      status: 'invalid',
      heading: 'Invalid round',
      roundLabel: '',
      rows: [],
    }
  }

  const roundLabel = round.label || `Round ${roundIndex + 1}`

  if (item.type === 'round-intro') {
    return {
      status: 'intro',
      heading: `${roundLabel} — ${round.name}`,
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
      heading: `${roundLabel} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        { label: 'Answer', value: question.answer },
        ...(question.countries?.length ? [{ label: 'Countries', value: question.countries.join(', ') }] : []),
        ...(question.explanation ? [{ label: 'Explanation', value: question.explanation }] : []),
      ],
    }
  }

  if (round.type === 'slang') {
    return {
      status: 'ok',
      heading: `${roundLabel} • Q${questionIndex + 1}`,
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
      heading: `${roundLabel} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [{ label: 'Phrase', value: question.phrase }],
    }
  }

  if (round.type === 'thesis') {
    return {
      status: 'ok',
      heading: `${roundLabel} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        { label: 'Title', value: question.title },
        { label: 'Note', value: 'No fixed answer. Winner is decided by vote.' },
      ],
    }
  }

  if (round.type === 'custom-buzz') {
    return {
      status: 'ok',
      heading: `${roundLabel} • Q${questionIndex + 1}`,
      roundLabel: round.name,
      rows: [
        ...(question.promptType ? [{ label: 'Prompt', value: question.promptType }] : []),
        ...(question.promptText ? [{ label: 'Text', value: question.promptText }] : []),
        ...(question.mediaUrl ? [{ label: 'Media URL', value: question.mediaUrl }] : []),
        { label: 'Answer', value: question.answer },
        ...(question.explanation ? [{ label: 'Explanation', value: question.explanation }] : []),
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
  const savedHostCredentials = readHostCredentials()
  const querySessionCode = String(new URLSearchParams(window.location.search).get('s') || '').trim().toUpperCase()
  const [connected, setConnected] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [activeQuestionRaw, setActiveQuestionRaw] = useState(null)
  const [roundCatalog, setRoundCatalog] = useState(DEFAULT_ROUND_CATALOG)
  const [buzzActive, setBuzzActive] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authForm, setAuthForm] = useState({
    sessionCode: querySessionCode || savedHostCredentials?.sessionCode || '',
    pin: savedHostCredentials?.pin || '',
  })
  const [soundStatus, setSoundStatus] = useState('')
  const [streakStatus, setStreakStatus] = useState('')
  const planCatalog = useMemo(() => buildPlanCatalog(roundCatalog), [roundCatalog])
  const planIds = useMemo(() => defaultPlanIds(planCatalog), [planCatalog])
  const pendingSoundRequestIdRef = useRef('')
  const pendingSoundTimeoutRef = useRef(null)
  const soundStatusTimeoutRef = useRef(null)
  const streakStatusTimeoutRef = useRef(null)

  const clearPendingSoundTimeout = useCallback(() => {
    if (pendingSoundTimeoutRef.current) {
      clearTimeout(pendingSoundTimeoutRef.current)
      pendingSoundTimeoutRef.current = null
    }
  }, [])

  const clearSoundStatusTimeout = useCallback(() => {
    if (soundStatusTimeoutRef.current) {
      clearTimeout(soundStatusTimeoutRef.current)
      soundStatusTimeoutRef.current = null
    }
  }, [])

  const clearStreakStatusTimeout = useCallback(() => {
    if (streakStatusTimeoutRef.current) {
      clearTimeout(streakStatusTimeoutRef.current)
      streakStatusTimeoutRef.current = null
    }
  }, [])

  const setTransientSoundStatus = useCallback((message) => {
    if (!SHOW_SOUND_STATUS) return
    setSoundStatus(message)
    clearSoundStatusTimeout()
    soundStatusTimeoutRef.current = setTimeout(() => {
      setSoundStatus('')
      soundStatusTimeoutRef.current = null
    }, SOUND_STATUS_AUTO_CLEAR_MS)
  }, [clearSoundStatusTimeout])

  const setTransientStreakStatus = useCallback((message) => {
    setStreakStatus(message)
    clearStreakStatusTimeout()
    streakStatusTimeoutRef.current = setTimeout(() => {
      setStreakStatus('')
      streakStatusTimeoutRef.current = null
    }, STREAK_STATUS_AUTO_CLEAR_MS)
  }, [clearStreakStatusTimeout])

  const submitAuth = useCallback((sessionCodeInput, pinInput) => {
    const code = String(sessionCodeInput || '').trim().toUpperCase()
    const pin = String(pinInput || '').trim()
    if (!code || !pin) {
      setErrorMsg('Session code and host PIN are required.')
      setAuthorized(false)
      return Promise.resolve({ ok: false, error: 'missing-credentials' })
    }

    setAuthLoading(true)
    setErrorMsg('')
    return new Promise((resolve) => {
      socket.emit('host:auth', { sessionCode: code, pin, role: 'companion' }, (result) => {
        if (!result?.ok) {
          clearHostCredentials()
          setAuthorized(false)
          setErrorMsg(mapHostAuthError(result?.error))
          setAuthLoading(false)
          resolve({ ok: false, error: result?.error || 'unauthorized' })
          return
        }
        writeHostCredentials(code, pin)
        setAuthForm({ sessionCode: code, pin })
        setAuthorized(true)
        setErrorMsg('')
        socket.emit('host:question:get', (questionResult) => {
          if (questionResult?.ok) {
            const incomingRoundCatalog = normalizeRoundCatalog(questionResult.roundCatalog)
            const effectiveRoundCatalog = incomingRoundCatalog.length > 0 ? incomingRoundCatalog : DEFAULT_ROUND_CATALOG
            setRoundCatalog(effectiveRoundCatalog)
            setActiveQuestionRaw(questionResult.activeQuestion)
          }
          setAuthLoading(false)
          resolve({ ok: true })
        })
      })
    })
  }, [])

  useEffect(() => {
    function onConnect() {
      setConnected(true)
      const creds = readHostCredentials()
      const hasMismatchedQueryCode = Boolean(
        creds?.sessionCode &&
        querySessionCode &&
        creds.sessionCode !== querySessionCode
      )
      if (!creds || hasMismatchedQueryCode) {
        if (querySessionCode) {
          setAuthForm((prev) => ({ ...prev, sessionCode: querySessionCode }))
        }
        setAuthorized(false)
        setErrorMsg('Enter session code and host PIN.')
        return
      }
      setAuthForm({ sessionCode: creds.sessionCode, pin: creds.pin })
      void submitAuth(creds.sessionCode, creds.pin)
    }

    function onDisconnect() {
      setConnected(false)
      setAuthorized(false)
      setAuthLoading(false)
    }

    function onHostQuestion(cursor) {
      setActiveQuestionRaw(cursor)
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
  }, [clearPendingSoundTimeout, clearSoundStatusTimeout, clearStreakStatusTimeout, querySessionCode, setTransientSoundStatus, setTransientStreakStatus, submitAuth])

  const answerView = useMemo(
    () => extractAnswerView(activeQuestionRaw, roundCatalog, planCatalog, planIds),
    [activeQuestionRaw, roundCatalog, planCatalog, planIds]
  )

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
          <form
            className="host-mobile-auth-form"
            onSubmit={(e) => {
              e.preventDefault()
              void submitAuth(authForm.sessionCode, authForm.pin)
            }}
          >
            <p className="host-mobile-wait">
              {connected ? 'Sign in to control this session.' : 'Reconnecting…'}
            </p>
            <input
              className="host-mobile-auth-input"
              type="text"
              value={authForm.sessionCode}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, sessionCode: e.target.value.toUpperCase() }))}
              placeholder="Session code"
              maxLength={6}
              autoComplete="off"
              disabled={authLoading}
            />
            <input
              className="host-mobile-auth-input"
              type="password"
              inputMode="numeric"
              value={authForm.pin}
              onChange={(e) => setAuthForm((prev) => ({ ...prev, pin: e.target.value }))}
              placeholder="Host PIN"
              maxLength={8}
              disabled={authLoading}
            />
            <button className="host-mobile-auth-btn" type="submit" disabled={!connected || authLoading}>
              {authLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
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
