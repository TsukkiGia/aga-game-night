import { useState } from 'react'
import { socket } from '../core/socket'
import { clearAll, clearHostCredentials } from '../core/storage'

export function useSessionActions({ invalidateAuth, clearDoublePoints, handleDismiss, resetStats, onReset, onEndSession }) {
  const [startingNewGame, setStartingNewGame] = useState(false)
  const [newGameError, setNewGameError] = useState('')
  const [endingSession, setEndingSession] = useState(false)
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false)
  const [endSessionError, setEndSessionError] = useState('')

  function handleNewGame() {
    if (startingNewGame || endingSession) return
    if (!socket.connected) {
      setNewGameError('Not connected to server. Reconnect and try again.')
      return
    }
    setNewGameError('')
    setStartingNewGame(true)
    socket.timeout(4000).emit('host:new-game', (err, result) => {
      setStartingNewGame(false)
      if (err) {
        setNewGameError('Timed out starting a new game. Check your connection and try again.')
        return
      }
      if (!result?.ok) {
        if (result?.error === 'unauthorized') {
          invalidateAuth('Host authorization expired. Sign in again.')
          return
        }
        if (result?.error === 'session-not-found') {
          invalidateAuth('Session is no longer active. Sign in again.')
          return
        }
        setNewGameError('Could not start a new game. Please try again.')
        return
      }
      clearDoublePoints()
      handleDismiss()
      resetStats()
      clearAll()
      onReset()
    })
  }

  function handleEndSession() {
    if (endingSession) return
    setEndSessionError('')
    setShowEndSessionConfirm(true)
  }

  function confirmEndSession() {
    if (endingSession) return
    if (!socket.connected) {
      setEndSessionError('Not connected to server. Reconnect and try again.')
      return
    }
    setEndingSession(true)
    socket.timeout(4000).emit('host:end-session', (err, result) => {
      if (err) {
        setEndingSession(false)
        setEndSessionError('Timed out ending session. Check your connection and try again.')
        return
      }
      if (!result?.ok) {
        setEndingSession(false)
        if (result?.error === 'unauthorized') {
          setShowEndSessionConfirm(false)
          setEndSessionError('')
          invalidateAuth('Host authorization expired. Sign in again.')
        } else {
          setEndSessionError('Could not end session. Please try again.')
        }
        return
      }
      clearAll()
      clearHostCredentials()
      resetStats()
      setShowEndSessionConfirm(false)
      setEndSessionError('')
      onEndSession?.()
    })
  }

  return {
    startingNewGame,
    newGameError,
    endingSession,
    showEndSessionConfirm,
    setShowEndSessionConfirm,
    endSessionError,
    handleNewGame,
    handleEndSession,
    confirmEndSession,
  }
}
