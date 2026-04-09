import { useState, useEffect, useCallback } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm, playSoundBiteByKey, unlockAudio } from '../sounds'
import { HOST_PIN_KEY, SESSION_CODE_KEY } from '../storage'

export function useGameSocket(initialTeams, options = {}) {
  const onBuzzWinner = typeof options.onBuzzWinner === 'function' ? options.onBuzzWinner : null
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [members, setMembers] = useState([])
  const [stealMode, setStealMode] = useState(false)
  const [hostReady, setHostReady] = useState(false)
  const [timerControlSignal, setTimerControlSignal] = useState({ sequence: 0, action: null })

  useEffect(() => {
    function getStored(key) {
      try { return sessionStorage.getItem(key) || '' } catch { return '' }
    }
    function setStored(key, val) {
      try { sessionStorage.setItem(key, val) } catch { /* ignore */ }
    }
    function clearStored(...keys) {
      try { keys.forEach(k => sessionStorage.removeItem(k)) } catch { /* ignore */ }
    }

    function authenticateAndSetup() {
      const sessionCode = getStored(SESSION_CODE_KEY)
      const pin = getStored(HOST_PIN_KEY)

      if (sessionCode && pin) {
        tryAuth(sessionCode, pin, /* canPrompt */ true)
        return
      }

      promptAndAuth()
    }

    function tryAuth(sessionCode, pin, canPrompt) {
      socket.emit('host:auth', { sessionCode, pin, role: 'controller' }, (authResult) => {
        if (!authResult?.ok) {
          setHostReady(false)
          clearStored(SESSION_CODE_KEY, HOST_PIN_KEY)
          if (!canPrompt) return
          if (authResult?.error === 'session-not-found') {
            window.alert('Session not found. Check the session code.')
          } else if (authResult?.error === 'rate-limited') {
            window.alert('Too many PIN attempts. Wait a minute and try again.')
          } else {
            window.alert('Incorrect PIN.')
          }
          promptAndAuth()
          return
        }
        setStored(SESSION_CODE_KEY, sessionCode)
        setStored(HOST_PIN_KEY, pin)
        socket.emit('host:setup', initialTeams, (setupResult) => {
          setHostReady(Boolean(setupResult?.ok))
        })
      })
    }

    function promptAndAuth() {
      const sessionCode = (window.prompt('Enter session code') || '').trim().toUpperCase()
      if (!sessionCode) return
      const pin = (window.prompt('Enter host PIN') || '').trim()
      if (!pin) return
      tryAuth(sessionCode, pin, /* canPrompt */ false)
    }

    function syncState(state) {
      setArmed(Boolean(state.armed))
      setBuzzWinner(
        state.buzzedBy === null
          ? null
          : {
              teamIndex: state.buzzedBy,
              team: state.teams[state.buzzedBy],
              memberName: state.buzzedMemberName,
            }
      )
    }

    function onDisconnect() {
      setHostReady(false)
    }

    function onRemoteSound(payload) {
      const packet = (payload && typeof payload === 'object')
        ? payload
        : { soundKey: payload, requestId: '', sourceSocketId: '' }
      const soundKey = String(packet.soundKey || '').trim()
      Promise.resolve(playSoundBiteByKey(soundKey))
        .then((ok) => {
          const requestId = String(packet.requestId || '').trim()
          const sourceSocketId = String(packet.sourceSocketId || '').trim()
          if (requestId && sourceSocketId) {
            socket.emit('host:sfx:result', {
              requestId,
              sourceSocketId,
              ok,
              error: ok ? null : 'audio-blocked',
            })
          }
          if (!ok) console.warn('[host:sfx:play] blocked by browser audio policy')
        })
        .catch(() => {
          const requestId = String(packet.requestId || '').trim()
          const sourceSocketId = String(packet.sourceSocketId || '').trim()
          if (requestId && sourceSocketId) {
            socket.emit('host:sfx:result', {
              requestId,
              sourceSocketId,
              ok: false,
              error: 'playback-failed',
            })
          }
        })
    }

    function primeAudio() {
      unlockAudio()
    }

    function onTimerStop() {
      setTimerControlSignal((prev) => ({ sequence: prev.sequence + 1, action: 'stop' }))
    }

    function onTimerRestart() {
      setTimerControlSignal((prev) => ({ sequence: prev.sequence + 1, action: 'restart' }))
    }

    socket.on('connect', authenticateAndSetup)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) authenticateAndSetup()
    socket.connect()

    socket.on('state:sync',   syncState)
    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => {
      if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
      setArmed(false)
      setBuzzWinner(data)
      playBuzzIn()
      onBuzzWinner?.(data)
    })
    socket.on('host:members', (data) => setMembers(data))
    socket.on('host:sfx:play', onRemoteSound)
    socket.on('host:timer:stop', onTimerStop)
    socket.on('host:timer:restart', onTimerRestart)
    window.addEventListener('pointerdown', primeAudio)
    window.addEventListener('keydown', primeAudio)

    return () => {
      socket.off('connect', authenticateAndSetup)
      socket.off('disconnect', onDisconnect)
      socket.off('state:sync', syncState)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('host:members')
      socket.off('host:sfx:play', onRemoteSound)
      socket.off('host:timer:stop', onTimerStop)
      socket.off('host:timer:restart', onTimerRestart)
      window.removeEventListener('pointerdown', primeAudio)
      window.removeEventListener('keydown', primeAudio)
    }
  }, [initialTeams, onBuzzWinner])

  function handleArm(options = {}) {
    const safeOptions = {}
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      if (Array.isArray(options.allowedTeamIndices)) safeOptions.allowedTeamIndices = options.allowedTeamIndices
    }
    socket.emit('host:arm', safeOptions, (result) => {
      if (result?.ok) playArm()
    })
  }

  function handleManualBuzz(teamIndex, teams) {
    setBuzzWinner({ team: teams[teamIndex], teamIndex, memberName: null, manual: true })
    setStealMode(false)
  }

  function handleDismiss() {
    socket.emit('host:reset', (result) => {
      if (result?.ok) setStealMode(false)
    })
  }

  function handleWrongAndSteal(config = null) {
    let allowedTeamIndices = null
    if (Array.isArray(config)) {
      allowedTeamIndices = config
    } else if (config && typeof config === 'object' && !Array.isArray(config)) {
      if (Array.isArray(config.allowedTeamIndices)) allowedTeamIndices = config.allowedTeamIndices
    }

    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      setStealMode(true)
      const armOptions = {}
      if (allowedTeamIndices) armOptions.allowedTeamIndices = allowedTeamIndices
      socket.emit('host:arm', armOptions, (armResult) => {
        if (armResult?.ok) playArm()
        else setStealMode(false)
      })
    })
  }

  function handleRearm(options = {}) {
    setBuzzWinner(null)
    setStealMode(false)
    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      socket.emit('host:arm', options, (armResult) => {
        if (armResult?.ok) playArm()
      })
    })
  }

  const syncHostQuestion = useCallback((activeQuestion) => {
    if (!hostReady) return
    socket.emit('host:question:set', activeQuestion)
  }, [hostReady])

  return {
    armed,
    buzzWinner,
    members,
    stealMode,
    hostReady,
    sessionCode: (() => { try { return sessionStorage.getItem(SESSION_CODE_KEY) || '' } catch { return '' } })(),
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleManualBuzz,
    handleRearm,
    syncHostQuestion,
    timerControlSignal,
  }
}
