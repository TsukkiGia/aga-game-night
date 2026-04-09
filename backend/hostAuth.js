export function isHostAuthorized(socket) {
  return socket.data?.isHost === true
}

export function isHostController(socket) {
  return socket.data?.isHost === true && socket.data?.hostRole === 'controller'
}

export function normalizeHostRole(rawRole) {
  if (rawRole === 'companion') return 'companion'
  if (rawRole === 'controller') return 'controller'
  return null
}
