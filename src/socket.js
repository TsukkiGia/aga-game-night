import { io } from 'socket.io-client'

// Always connect to same origin (Vite proxies /socket.io → :3001 in dev).
// ENDPOINT in config.js is only used to display the URL for team members to visit.
export const socket = io({ autoConnect: false })
