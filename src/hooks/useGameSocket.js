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

    socket.on('connect', setup)
    if (socket.connected) setup()
    socket.connect()

    socket.on('state:sync',   syncState)
    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => { setArmed(false); setBuzzWinner(data); playBuzzIn() })
    socket.on('host:members', (data) => setMembers(data))

    return () => {
      socket.off('connect', setup)
      socket.off('state:sync', syncState)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('host:members')
    }
  }, [])

  function handleArm() {
    socket.emit('host:arm', (result) => {
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

  function handleWrongAndSteal() {
    const lockedOutTeamIndex = buzzWinner?.teamIndex ?? null
    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      setStealMode(true)
      socket.emit('host:arm', { lockedOutTeamIndex }, (armResult) => {
        if (armResult?.ok) playArm()
        else setStealMode(false)
      })
    })
  }

  return { armed, buzzWinner, members, stealMode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz }
}
