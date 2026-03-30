import { useState, useEffect } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm } from '../sounds'

export function useGameSocket(initialTeams) {
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [members, setMembers] = useState([])

  useEffect(() => {
    function setup() { socket.emit('host:setup', initialTeams) }

    socket.on('connect', setup)
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
      // do NOT disconnect — socket is shared; host reconnects automatically
    }
  }, [])

  function handleArm() {
    setArmed(true)
    socket.emit('host:arm')
    playArm()
  }

  function handleDismiss() {
    setBuzzWinner(null)
    setArmed(false)
    socket.emit('host:reset')
  }

  return { armed, buzzWinner, members, handleArm, handleDismiss }
}
