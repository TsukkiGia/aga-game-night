import { useState, useEffect, useRef } from 'react'
import { socket } from '../socket'
import { loadBuzzerIdentity, saveBuzzerIdentity, clearBuzzerIdentity } from '../storage'
import { normalizeGameplayMode, isHostlessMode } from '../gameplayMode'

// status: 'loading' | 'join' | 'waiting' | 'armed' | 'i-buzzed' | 'team-buzzed' | 'locked-out'

const sessionCode = new URLSearchParams(window.location.search).get('s')?.trim().toUpperCase() || ''
const HOSTLESS_TOAST_TTL_MS = 4500

function isEligibleDuringArmedState(sync, teamIndex) {
  if (!Number.isInteger(teamIndex)) return false
  if (Array.isArray(sync?.allowedTeamIndices)) return sync.allowedTeamIndices.includes(teamIndex)
  return true
}

function deriveStatusFromSync(sync, teamIndex, memberName) {
  if (sync?.buzzedBy !== null && sync?.buzzedBy !== undefined) {
    if (sync.buzzedBy !== teamIndex) return 'locked-out'
    return sync.buzzedMemberName === memberName ? 'i-buzzed' : 'team-buzzed'
  }
  if (sync?.armed) return isEligibleDuringArmedState(sync, teamIndex) ? 'armed' : 'locked-out'
  return 'waiting'
}

function mapSubmitError(code) {
  if (code === 'invalid-guess') return 'Enter an answer before submitting.'
  if (code === 'question-locked') return 'This question is locked. Wait for the next one.'
  if (code === 'stale-question') return 'Question changed. Wait for the latest prompt, then submit again.'
  if (code === 'unsupported-round') return 'This round does not support host-less submissions.'
  if (code === 'duplicate-guess') return 'Someone already guessed that and it was wrong. Try a different answer.'
  if (code === 'rate-limited') return 'Too fast. Wait a moment and try again.'
  if (code === 'unauthorized') return 'You need to rejoin your team first.'
  return 'Could not submit answer right now.'
}

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase()
}

function describeCorrectEvent(payload, currentTeamIndex, currentMemberName) {
  const answerText = String(payload?.answer || '').trim()
  if (!payload || typeof payload !== 'object') {
    return {
      title: 'Correct answer',
      body: 'A team got it right.',
      inline: 'A team got it right',
    }
  }
  const winnerName = String(payload.memberName || '').trim()
  const winnerTeamName = String(payload.team?.name || 'a team').trim()
  const winnerTeamIndex = Number.parseInt(payload.teamIndex, 10)
  const myName = normalizeIdentity(currentMemberName)
  const iAmWinner = winnerName && myName && normalizeIdentity(winnerName) === myName && winnerTeamIndex === currentTeamIndex
  const sameTeamWinner = winnerTeamIndex === currentTeamIndex

  if (iAmWinner) {
    return {
      title: 'Correct! You got it right',
      body: answerText ? `You guessed the right answer: ${answerText}.` : 'You were first with the correct answer.',
      inline: answerText ? `You guessed the right answer: ${answerText}` : 'You got it right',
    }
  }
  if (sameTeamWinner && winnerName) {
    return {
      title: `${winnerName} got it right`,
      body: answerText
        ? `${winnerName} guessed the right answer: ${answerText}.`
        : `${winnerName} answered correctly for ${winnerTeamName}.`,
      inline: answerText
        ? `${winnerName} guessed the right answer: ${answerText}`
        : `${winnerName} got it right for ${winnerTeamName}`,
    }
  }
  if (winnerName) {
    return {
      title: `${winnerName} got it right`,
      body: answerText
        ? `${winnerName} guessed the right answer: ${answerText}.`
        : `${winnerName} from ${winnerTeamName} answered correctly.`,
      inline: answerText
        ? `${winnerName} guessed the right answer: ${answerText}`
        : `${winnerName} from ${winnerTeamName} got it right`,
    }
  }
  return {
    title: `${winnerTeamName} got it right`,
    body: answerText
      ? `${winnerTeamName} guessed the right answer: ${answerText}.`
      : `${winnerTeamName} submitted the first correct answer.`,
    inline: answerText
      ? `${winnerTeamName} guessed the right answer: ${answerText}`
      : `${winnerTeamName} got it right`,
  }
}

export default function BuzzerPage() {
  const [availableTeams, setAvailableTeams] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [name, setName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [team, setTeam] = useState(null)
  const [teamIndex, setTeamIndex] = useState(null)
  const [status, setStatus] = useState(() => loadBuzzerIdentity(sessionCode) ? 'loading' : 'join')
  const [connected, setConnected] = useState(true)
  const [gameplayMode, setGameplayMode] = useState('hosted')
  const [answerState, setAnswerState] = useState(null)
  const [guess, setGuess] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [attemptToasts, setAttemptToasts] = useState([])
  const [correctEvent, setCorrectEvent] = useState(null)
  const [timeoutEvent, setTimeoutEvent] = useState(null)
  const teamIndexRef = useRef(teamIndex)
  const nameRef = useRef(name)
  const gameplayModeRef = useRef(gameplayMode)
  const answerQuestionIdRef = useRef('')
  const guessInputRef = useRef(null)

  const hostlessModeActive = isHostlessMode(gameplayMode)

  useEffect(() => {
    teamIndexRef.current = teamIndex
  }, [teamIndex])

  useEffect(() => {
    nameRef.current = name
  }, [name])

  useEffect(() => {
    gameplayModeRef.current = gameplayMode
  }, [gameplayMode])

  useEffect(() => {
    const pruneTimer = setInterval(() => {
      const cutoff = Date.now() - HOSTLESS_TOAST_TTL_MS
      setAttemptToasts((prev) => prev.filter((item) => item.createdAt >= cutoff))
    }, 500)
    return () => clearInterval(pruneTimer)
  }, [])

  function applySync(sync, fallbackTeamIndex, fallbackName) {
    const nextMode = normalizeGameplayMode(sync?.gameplayMode)
    setGameplayMode(nextMode)
    if (sync?.answerState) {
      const nextQuestionId = String(sync.answerState.questionId || '')
      if (answerQuestionIdRef.current && answerQuestionIdRef.current !== nextQuestionId) {
        setAttemptToasts([])
        setCorrectEvent(null)
        setTimeoutEvent(null)
        setSubmitError('')
        setGuess('')
      }
      answerQuestionIdRef.current = nextQuestionId
      setAnswerState(sync.answerState)
      if (sync.answerState.status === 'open') {
        setCorrectEvent(null)
        setTimeoutEvent(null)
      }
    }

    if (isHostlessMode(nextMode)) return 'waiting'
    return deriveStatusFromSync(sync, fallbackTeamIndex, fallbackName)
  }

  // Effect 1: socket lifecycle
  useEffect(() => {
    socket.connect()

    function refreshAvailableTeams() {
      socket.emit('member:get-teams', sessionCode, (res) => {
        if (Array.isArray(res?.teams)) {
          setAvailableTeams(res.teams)
          return
        }
        setAvailableTeams([])
      })
    }

    function onConnect() {
      setConnected(true)
      refreshAvailableTeams()

      const saved = loadBuzzerIdentity(sessionCode)
      if (saved && teamIndexRef.current === null) {
        const savedName = String(saved.name || '').trim()
        if (!savedName) {
          clearBuzzerIdentity(sessionCode)
          setStatus('join')
          return
        }
        socket.emit('member:join', sessionCode, saved.teamIndex, savedName, (res) => {
          if (res?.error) {
            clearBuzzerIdentity(sessionCode)
            setStatus('join')
            refreshAvailableTeams()
            return
          }
          setTeam(res.team)
          setTeamIndex(res.teamIndex)
          setName(savedName)
          setStatus(applySync(res.sync, res.teamIndex, savedName))
        })
      }
    }

    function onDisconnect() {
      setConnected(false)
      setSubmittingGuess(false)
    }

    function onGameReset() {
      clearBuzzerIdentity(sessionCode)
      setTeam(null)
      setTeamIndex(null)
      setSelectedIndex(null)
      setAvailableTeams([])
      setStatus('join')
      setGameplayMode('hosted')
      setAnswerState(null)
      setGuess('')
      setSubmitError('')
      setAttemptToasts([])
      setCorrectEvent(null)
      setTimeoutEvent(null)
      answerQuestionIdRef.current = ''
      refreshAvailableTeams()
    }

    function onBuzzArmed(payload) {
      if (gameplayModeRef.current === 'hostless') return
      const sync = (payload && typeof payload === 'object')
        ? { ...payload, armed: true, buzzedBy: null, buzzedMemberName: null }
        : { armed: true, buzzedBy: null, buzzedMemberName: null }
      setStatus((prev) => {
        if (prev === 'join' || prev === 'loading') return prev
        return deriveStatusFromSync(sync, teamIndexRef.current, nameRef.current)
      })
    }

    function onBuzzReset() {
      if (gameplayModeRef.current === 'hostless') return
      setStatus((prev) => (prev === 'join' || prev === 'loading' ? prev : 'waiting'))
    }

    function onBuzzWinner(data) {
      if (gameplayModeRef.current === 'hostless') return
      setStatus((prev) => {
        if (prev === 'armed' || prev === 'waiting') {
          if (data.teamIndex !== teamIndexRef.current) return 'locked-out'
          return data.memberName === nameRef.current ? 'i-buzzed' : 'team-buzzed'
        }
        return prev
      })
    }

    function onAnswerAttempt(payload) {
      if (!payload || typeof payload !== 'object') return
      setAttemptToasts((prev) => [...prev, { ...payload, createdAt: Date.now() }].slice(-8))
    }

    function onAnswerCorrect(payload) {
      if (!payload || typeof payload !== 'object') return
      setTimeoutEvent(null)
      setCorrectEvent(payload)
    }

    function onAnswerTimeout(payload) {
      if (!payload || typeof payload !== 'object') return
      setCorrectEvent(null)
      setTimeoutEvent(payload)
    }

    function onAnswerState(payload) {
      if (!payload || typeof payload !== 'object') return
      const nextQuestionId = String(payload.questionId || '')
      if (answerQuestionIdRef.current && answerQuestionIdRef.current !== nextQuestionId) {
        setAttemptToasts([])
        setCorrectEvent(null)
        setTimeoutEvent(null)
        setSubmitError('')
        setGuess('')
      }
      answerQuestionIdRef.current = nextQuestionId
      setAnswerState(payload)
      if (payload.status === 'open') {
        setCorrectEvent(null)
        setTimeoutEvent(null)
        return
      }
      const revealedAnswer = String(payload?.revealedAnswer || '').trim()
      if (payload.status === 'locked' && !payload?.winner && revealedAnswer) {
        setCorrectEvent(null)
        setTimeoutEvent((prev) => (
          prev?.questionId === payload.questionId && String(prev?.answer || '').trim() === revealedAnswer
            ? prev
            : { questionId: payload.questionId, answer: revealedAnswer }
        ))
      }
    }

    function onMemberSync(sync) {
      if (!sync || typeof sync !== 'object') return
      setStatus((prev) => {
        if (prev === 'join' || prev === 'loading') return prev
        return applySync(sync, teamIndexRef.current, nameRef.current)
      })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('game:reset', onGameReset)
    socket.on('member:sync', onMemberSync)
    socket.on('buzz:armed', onBuzzArmed)
    socket.on('buzz:reset', onBuzzReset)
    socket.on('buzz:winner', onBuzzWinner)
    socket.on('answer:attempt', onAnswerAttempt)
    socket.on('answer:correct', onAnswerCorrect)
    socket.on('answer:timeout', onAnswerTimeout)
    socket.on('answer:state', onAnswerState)

    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('game:reset', onGameReset)
      socket.off('member:sync', onMemberSync)
      socket.off('buzz:armed', onBuzzArmed)
      socket.off('buzz:reset', onBuzzReset)
      socket.off('buzz:winner', onBuzzWinner)
      socket.off('answer:attempt', onAnswerAttempt)
      socket.off('answer:correct', onAnswerCorrect)
      socket.off('answer:timeout', onAnswerTimeout)
      socket.off('answer:state', onAnswerState)
      socket.disconnect()
    }
  }, [])

  // Effect 2: rejoin on reconnect once team is known
  useEffect(() => {
    if (teamIndex === null) return
    function rejoin() {
      const saved = loadBuzzerIdentity(sessionCode)
      if (!saved || Number.parseInt(saved.teamIndex, 10) !== teamIndex) {
        setStatus('join')
        return
      }
      const memberName = String(nameRef.current || '').trim()
      if (!memberName) {
        clearBuzzerIdentity(sessionCode)
        setStatus('join')
        return
      }
      socket.emit('member:join', sessionCode, teamIndex, memberName, (res) => {
        if (res?.error) {
          clearBuzzerIdentity(sessionCode)
          setStatus('join')
          return
        }
        if (res?.team) setTeam(res.team)
        if (res?.teamIndex !== undefined) {
          setStatus(applySync(res.sync, res.teamIndex, memberName))
        }
      })
    }
    socket.on('connect', rejoin)
    return () => socket.off('connect', rejoin)
  }, [teamIndex])

  function handleJoin(e) {
    e.preventDefault()
    const memberName = name.trim()
    if (!memberName) {
      setJoinError('Name is required')
      return
    }
    if (selectedIndex === null) return
    setJoinError('')
    socket.emit('member:join', sessionCode, selectedIndex, memberName, (res) => {
      if (res?.error) {
        if (res?.error === 'session-not-found') {
          setAvailableTeams([])
          setJoinError('Session not found. Ask the host for a valid code.')
          return
        }
        if (res?.error === 'name-required') {
          setJoinError('Name is required')
          return
        }
        if (res?.error === 'Invalid team.') {
          setJoinError('Pick a valid team')
          return
        }
        setJoinError('Could not join right now. Try again.')
        return
      }
      saveBuzzerIdentity(res.teamIndex, memberName, sessionCode)
      setTeam(res.team)
      setTeamIndex(res.teamIndex)
      setStatus(applySync(res.sync, res.teamIndex, memberName))
    })
  }

  function handleBuzz() {
    if (status !== 'armed' && status !== 'locked-out' && status !== 'team-buzzed') return
    socket.emit('member:buzz')
  }

  function handleSubmitGuess(e) {
    e.preventDefault()
    if (!hostlessModeActive) return
    const trimmedGuess = guess.trim()
    const questionId = String(answerState?.questionId || '').trim()
    if (!trimmedGuess) {
      setSubmitError('Enter an answer before submitting.')
      return
    }
    if (!questionId) {
      setSubmitError('Question is syncing. Try again in a moment.')
      return
    }
    if (answerState?.status !== 'open') {
      setSubmitError('This question is locked. Wait for the next one.')
      return
    }

    setSubmittingGuess(true)
    setSubmitError('')
    socket.emit('member:answer:submit', { guess: trimmedGuess, questionId }, (result) => {
      setSubmittingGuess(false)
      if (!result?.ok) {
        setSubmitError(mapSubmitError(result?.error))
        if (answerState?.status === 'open') {
          requestAnimationFrame(() => guessInputRef.current?.focus())
        }
        return
      }
      setGuess('')
      if (answerState?.status === 'open') {
        requestAnimationFrame(() => guessInputRef.current?.focus())
      }
    })
  }

  function handleSwitchTeam() {
    clearBuzzerIdentity(sessionCode)
    setTeam(null)
    setTeamIndex(null)
    teamIndexRef.current = null
    setJoinError('')
    setSelectedIndex(null)
    setStatus('join')
    setGameplayMode('hosted')
    setAnswerState(null)
    setGuess('')
    setSubmitError('')
    setAttemptToasts([])
    setCorrectEvent(null)
    setTimeoutEvent(null)
    answerQuestionIdRef.current = ''
  }

  if (status === 'loading') {
    return (
      <div className="buzzer-page">
        <div className="buzzer-join-card">
          <div className="buzzer-logo">⏳</div>
          <h1 className="buzzer-title">Reconnecting…</h1>
          <p className="buzzer-sub">Picking up where you left off</p>
        </div>
      </div>
    )
  }

  if (status === 'join') {
    return (
      <div className="buzzer-page">
        <div className="buzzer-join-card">
          <div className="buzzer-logo">🥁</div>
          <h1 className="buzzer-title">JOIN GAME</h1>
          <p className="buzzer-sub">Pick your team and enter your name</p>
          <form className="buzzer-form" onSubmit={handleJoin}>
            <div className="buzzer-team-select">
              {availableTeams.length === 0 ? (
                <p className="buzzer-no-teams">Waiting for host to start the game…</p>
              ) : (
                availableTeams.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`buzzer-team-option color-${t.color}${selectedIndex === i ? ' selected' : ''}`}
                    onClick={() => {
                      setJoinError('')
                      setSelectedIndex(i)
                    }}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
            <input
              className="buzzer-name-input"
              value={name}
              onChange={e => {
                if (joinError) setJoinError('')
                setName(e.target.value)
              }}
              placeholder="Your name (required)"
              maxLength={24}
              autoComplete="off"
            />
            {joinError && <p className="session-gate-error">{joinError}</p>}
            <button className="buzzer-join-btn" type="submit" disabled={selectedIndex === null || !name.trim()}>
              Join Team →
            </button>
          </form>
        </div>
      </div>
    )
  }

  const statusConfig = {
    waiting:      { label: 'Waiting for host…',      sub: 'Hold tight — the host will arm the buzzers', pulse: false },
    armed:        { label: 'BUZZ NOW!',               sub: 'Be the first to buzz in!',                   pulse: true  },
    'i-buzzed':   { label: 'YOU BUZZED IN!',          sub: 'The host will call on you',                  pulse: false },
    'team-buzzed':{ label: 'YOUR TEAM BUZZED IN!',    sub: 'Your teammate got there first',              pulse: false },
    'locked-out': { label: 'Locked Out',              sub: 'Another team buzzed first',                  pulse: false },
  }
  const cfg = statusConfig[status] || statusConfig.waiting

  if (hostlessModeActive) {
    const isAnswerOpen = answerState?.status === 'open'
    const correctCopy = describeCorrectEvent(correctEvent, teamIndex, name)
    return (
      <div className={`buzzer-page buzzer-active color-${team.color}`}>
        {!connected && (
          <div className="buzzer-reconnect-banner">Reconnecting…</div>
        )}
        <div className="buzzer-team-header">
          <div className={`buzzer-team-dot color-${team.color}`} />
          <div className="buzzer-team-info">
            <span className="buzzer-team-label">{team.name}</span>
            {name && <span className="buzzer-member-name">{name}</span>}
          </div>
        </div>

        <div className="buzzer-status-label">{isAnswerOpen ? 'Submit Answer' : 'Waiting for Next Question'}</div>
        <div className="buzzer-status-sub">
          {isAnswerOpen ? 'First correct answer scores. Wrong guesses are visible to everyone.' : 'Question is currently locked.'}
        </div>

        <form className="buzzer-hostless-form" onSubmit={handleSubmitGuess}>
          <input
            ref={guessInputRef}
            className="buzzer-answer-input"
            type="text"
            value={guess}
            onChange={(e) => {
              if (submitError) setSubmitError('')
              setGuess(e.target.value)
            }}
            maxLength={180}
            placeholder={isAnswerOpen ? 'Type your answer' : 'Wait for the host to advance'}
            disabled={!isAnswerOpen}
            autoComplete="off"
          />
          <button
            type="submit"
            className="buzzer-answer-submit"
            disabled={!isAnswerOpen || submittingGuess || !guess.trim()}
          >
            {submittingGuess ? 'Submitting…' : 'Submit'}
          </button>
        </form>

        {submitError && <p className="session-gate-error">{submitError}</p>}

        {correctEvent && (
          <div className="buzzer-hostless-correct" role="status" aria-live="polite">
            <strong>{correctCopy.inline}</strong>
          </div>
        )}

        {timeoutEvent && (
          <div className="buzzer-hostless-correct" role="status" aria-live="polite">
            <strong>{`Time's up. Correct answer: ${String(timeoutEvent.answer || '').trim() || 'Not available'}`}</strong>
          </div>
        )}

        <div className="buzzer-hostless-toast-stack" aria-live="polite">
          {attemptToasts.slice(-4).map((attempt, index) => (
            <div key={`${attempt.createdAt || 0}-${index}`} className="buzzer-hostless-toast">
              <strong>{attempt.team?.name || 'Team'}</strong>
              {attempt.memberName ? ` · ${attempt.memberName}` : ''}
              {` guessed "${attempt.guess}"`}
            </div>
          ))}
        </div>

        <button
          className="buzzer-switch-team-btn"
          type="button"
          onClick={handleSwitchTeam}
        >
          Switch Team
        </button>
      </div>
    )
  }

  return (
    <div className={`buzzer-page buzzer-active color-${team.color}`}>
      {!connected && (
        <div className="buzzer-reconnect-banner">Reconnecting…</div>
      )}
      <div className="buzzer-team-header">
        <div className={`buzzer-team-dot color-${team.color}`} />
        <div className="buzzer-team-info">
          <span className="buzzer-team-label">{team.name}</span>
          {name && <span className="buzzer-member-name">{name}</span>}
        </div>
      </div>

      <div className="buzzer-status-label">{cfg.label}</div>
      <div className="buzzer-status-sub">{cfg.sub}</div>

      <button
        className={`buzzer-btn color-${team.color}
          ${status === 'armed'       ? 'buzzer-btn-ready'  : ''}
          ${status === 'i-buzzed'    ? 'buzzer-btn-winner' : ''}
          ${status === 'team-buzzed' ? 'buzzer-btn-winner' : ''}
          ${status === 'locked-out'  ? 'buzzer-btn-locked' : ''}
          ${cfg.pulse                ? 'buzzer-pulse'      : ''}
        `}
        onClick={handleBuzz}
        disabled={status !== 'armed' && status !== 'locked-out' && status !== 'team-buzzed'}
      >
        {status === 'waiting'     && '⏳'}
        {status === 'armed'       && '🔔'}
        {status === 'i-buzzed'    && '🏆'}
        {status === 'team-buzzed' && '👥'}
        {status === 'locked-out'  && '🔒'}
      </button>
      <button
        className="buzzer-switch-team-btn"
        type="button"
        onClick={handleSwitchTeam}
      >
        Switch Team
      </button>
    </div>
  )
}
