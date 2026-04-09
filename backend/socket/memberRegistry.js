export function removeFromMembers(socketId, st) {
  let changed = false
  for (const [teamKey, roster] of Object.entries(st.members)) {
    if (!roster || typeof roster !== 'object') continue
    if (!Object.prototype.hasOwnProperty.call(roster, socketId)) continue
    delete roster[socketId]
    changed = true
    if (Object.keys(roster).length === 0) delete st.members[teamKey]
  }
  return changed
}

export function leaveTeamRooms(socket, code, teamCount, memberTeamRoom) {
  for (let i = 0; i < teamCount; i++) socket.leave(memberTeamRoom(code, i))
}

export function broadcastMembers(io, hostRoom, code, st) {
  const memberNames = st.teams.map((_, i) => Object.values(st.members[i] || {}))
  io.to(hostRoom(code)).emit('host:members', memberNames)
}
