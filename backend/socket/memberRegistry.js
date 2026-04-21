export function removeFromMembers(socketId, st) {
  if (!st || typeof st !== 'object') return false
  if (!st.members || typeof st.members !== 'object') return false
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
  const memberNames = st.teams.map((_, i) => {
    const roster = st.members[i]
    if (!roster || typeof roster !== 'object') return []
    const seenNames = new Set()
    const dedupedNames = []
    for (const rawName of Object.values(roster)) {
      const displayName = String(rawName || '').trim()
      if (!displayName) continue
      const key = displayName.toLowerCase()
      if (seenNames.has(key)) continue
      seenNames.add(key)
      dedupedNames.push(displayName)
    }
    return dedupedNames
  })
  io.to(hostRoom(code)).emit('host:members', memberNames)
}
