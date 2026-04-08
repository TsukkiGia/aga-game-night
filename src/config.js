// In production (Railway), set VITE_ENDPOINT to your Railway public URL, e.g.:
//   VITE_ENDPOINT=https://sankofa-showdown.up.railway.app
//
// Locally with ngrok, you can set VITE_ENDPOINT in .env or leave blank to use localhost.
export const ENDPOINT = import.meta.env.VITE_ENDPOINT || ''

// Optional: base URL for dev-hosted question videos (e.g. Cloudflare R2 r2.dev URL).
// Example:
//   VITE_DEV_BUCKET_URL=https://pub-xxxxxxxx.r2.dev
export const DEV_BUCKET_URL = import.meta.env.VITE_DEV_BUCKET_URL || ''
