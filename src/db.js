import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway injects DATABASE_URL. Locally, set it in .env or pass via shell.
  // ssl is required on Railway but not locally — auto-detect.
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.DB_SSL === '1'
    ? { rejectUnauthorized: false }
    : false,
})

export async function query(text, params) {
  const client = await pool.connect()
  try {
    return await client.query(text, params)
  } finally {
    client.release()
  }
}

/**
 * Run all pending migrations.
 * In production, call this once on server start.
 */
export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      run_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const { readdir, readFile } = await import('fs/promises')
  const { resolve, dirname } = await import('path')
  const { fileURLToPath } = await import('url')

  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

  const { rows: ran } = await query('SELECT filename FROM _migrations')
  const ranSet = new Set(ran.map(r => r.filename))

  for (const file of files) {
    if (ranSet.has(file)) continue
    const sql = await readFile(resolve(dir, file), 'utf8')
    await query(sql)
    await query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
    console.log(`[db] migration applied: ${file}`)
  }
}
