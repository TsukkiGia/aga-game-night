function memberRoom(sessionCode) {
  return `${sessionCode}:members`
}

export function emitAnswerAttempt(io, hostRoom, sessionCode, payload) {
  io.to(hostRoom(sessionCode)).emit('answer:attempt', payload)
  io.to(memberRoom(sessionCode)).emit('answer:attempt', payload)
}

export function emitAnswerCorrect(io, hostRoom, sessionCode, payload) {
  io.to(hostRoom(sessionCode)).emit('answer:correct', payload)
  io.to(memberRoom(sessionCode)).emit('answer:correct', payload)
}

export function emitAnswerTimeout(io, hostRoom, sessionCode, payload) {
  io.to(hostRoom(sessionCode)).emit('answer:timeout', payload)
  io.to(memberRoom(sessionCode)).emit('answer:timeout', payload)
}

export function emitAnswerState(io, hostRoom, sessionCode, answerState) {
  io.to(hostRoom(sessionCode)).emit('answer:state', answerState)
  io.to(memberRoom(sessionCode)).emit('answer:state', answerState)
}
