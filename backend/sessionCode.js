// Session code — 6 chars, unambiguous alphabet (no 0/O/1/I/L)
const SESSION_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateSessionCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)]
  return code
}
