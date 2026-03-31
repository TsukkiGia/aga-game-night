import { useState, useEffect } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm } from '../sounds'

export function useGameSocket(initialTeams) {
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [members, setMembers] = useState([])
  const [stealMode, setStealMode] = useState(false)

  useEffect(() => {
    function setup() { socket.emit('host:setup', initialTeams) }

    socket.on('connect', setup)
    if (socket.connected) setup()
    socket.connect()

    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => { setArmed(false); setBuzzWinner(data); playBuzzIn() })
    socket.on('host:members', (data) => setMembers(data))

    return () => {
      socket.off('connect', setup)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('host:members')
    }
  }, [])

  function handleArm() {
    setArmed(true)
    socket.emit('host:arm')
    playArm()
  }

  function handleManualBuzz(teamIndex, teams) {
    setBuzzWinner({ team: teams[teamIndex], teamIndex, memberName: null })
    setStealMode(false)
  }

  function handleDismiss() {
    setBuzzWinner(null)
    setArmed(false)
    setStealMode(false)
    socket.emit('host:reset')
  }

  function handleWrongAndSteal() {
    setBuzzWinner(null)
    setStealMode(true)
    setArmed(true)
    socket.emit('host:reset')
    socket.emit('host:arm')
    playArm()
  }

  return { armed, buzzWinner, members, stealMode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz }
}
