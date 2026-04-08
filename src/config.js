// In production (Railway), set VITE_ENDPOINT to your Railway public URL, e.g.:
//   VITE_ENDPOINT=https://sankofa-showdown.up.railway.app
//
// Locally with ngrok, you can set VITE_ENDPOINT in .env or leave blank to use localhost.
export const ENDPOINT = import.meta.env.VITE_ENDPOINT || ''
