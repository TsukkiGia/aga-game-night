import { useState, useEffect, useCallback } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm } from '../sounds'

const HOST_PIN_KEY = 'scorekeeping_host_pin'

export function useGameSocket(initialTeams) {
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [members, setMembers] = useState([])
  const [stealMode, setStealMode] = useState(false)
  const [hostReady, setHostReady] = useState(false)

  useEffect(() => {
    function getStoredHostPin() {
      try {
        return sessionStorage.getItem(HOST_PIN_KEY) || ''
      } catch {
        return ''
      }
    }

    function storeHostPin(pin) {
      try {
        sessionStorage.setItem(HOST_PIN_KEY, pin)
      } catch {
        // ignore storage failures
      }
    }

    function clearStoredHostPin() {
      try {
        sessionStorage.removeItem(HOST_PIN_KEY)
      } catch {
        // ignore storage failures
      }
    }

    function requestHostPin() {
      const entered = window.prompt('Enter host PIN')
      return (entered || '').trim()
    }

    function authenticateAndSetup() {
      const tryPin = (pin, canPromptAgain = true) => {
        if (!pin) return
        socket.emit('host:auth', pin, (authResult) => {
          if (!authResult?.ok) {
            setHostReady(false)
            clearStoredHostPin()
            if (authResult?.error === 'host-pin-not-configured') {
              window.alert('HOST_PIN is not configured on the server.')
              return
            }
            if (canPromptAgain) {
              const retryPin = requestHostPin()
              if (retryPin) tryPin(retryPin, false)
            }
            return
          }
          storeHostPin(pin)
          socket.emit('host:setup', initialTeams, (setupResult) => {
            setHostReady(Boolean(setupResult?.ok))
          })
        })
      }

      const storedPin = getStoredHostPin()
      if (storedPin) {
        tryPin(storedPin)
        return
      }

      const enteredPin = requestHostPin()
      if (enteredPin) tryPin(enteredPin)
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

    socket.on('connect', authenticateAndSetup)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) authenticateAndSetup()
    socket.connect()

    socket.on('state:sync',   syncState)
    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => { setArmed(false); setBuzzWinner(data); playBuzzIn() })
    socket.on('host:members', (data) => setMembers(data))

    return () => {
      socket.off('connect', authenticateAndSetup)
      socket.off('disconnect', onDisconnect)
      socket.off('state:sync', syncState)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('host:members')
    }
  }, [])

  function handleArm(options = {}) {
    const safeOptions = (options && typeof options === 'object' && !Array.isArray(options) && Array.isArray(options.allowedTeamIndices)) ? options : {}
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

  function handleWrongAndSteal(allowedTeamIndices = null) {
    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      setStealMode(true)
      const armOptions = allowedTeamIndices ? { allowedTeamIndices } : {}
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
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleManualBuzz,
    handleRearm,
    syncHostQuestion,
  }
}
