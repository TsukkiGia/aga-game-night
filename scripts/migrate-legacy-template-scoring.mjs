import process from 'node:process'
import { withTransaction } from '../backend/db.js'
import { normalizeRoundTemplatePayload } from '../backend/state/roundCatalog.js'

function hasFlag(flag) {
  return process.argv.includes(flag)
}

const dryRun = hasFlag('--dry-run')

async function main() {
  let result = null
  try {
    result = await withTransaction(async (query) => {
      const { rows } = await query(`
        SELECT id, name, type, intro, rules, scoring, questions
        FROM round_templates
        WHERE scoring IS NULL OR jsonb_typeof(scoring) <> 'object'
        ORDER BY created_at ASC
        FOR UPDATE
      `)

      let migratedCount = 0
      const failures = []

      for (const row of rows) {
        const normalized = normalizeRoundTemplatePayload({
          name: row.name,
          type: row.type,
          intro: row.intro,
          rules: row.rules,
          scoring: row.scoring,
          questions: row.questions,
        })

        if (!normalized) {
          failures.push({ id: row.id, name: row.name })
          continue
        }

        if (!dryRun) {
          await query(
            `
              UPDATE round_templates
              SET
                name = $2,
                type = $3,
                intro = $4,
                rules = $5::jsonb,
                scoring = $6::jsonb,
                questions = $7::jsonb
              WHERE id = $1
            `,
            [
              row.id,
              normalized.name,
              normalized.type,
              normalized.intro,
              JSON.stringify(normalized.rules),
              JSON.stringify(normalized.scoring),
              JSON.stringify(normalized.questions),
            ]
          )
        }

        migratedCount += 1
      }

      if (failures.length > 0) {
        const error = new Error(`Could not normalize ${failures.length} template(s)`)
        error.failures = failures
        error.totalCandidates = rows.length
        error.migratedCount = migratedCount
        throw error
      }

      return {
        totalCandidates: rows.length,
        migratedCount,
      }
    })
  } catch (err) {
    console.log(`[migrate-legacy-template-scoring] mode=${dryRun ? 'dry-run' : 'write'}`)
    console.log(`[migrate-legacy-template-scoring] candidates=${err.totalCandidates ?? 'unknown'}`)
    console.log(`[migrate-legacy-template-scoring] migrated-before-rollback=${err.migratedCount ?? 0}`)
    if (Array.isArray(err.failures) && err.failures.length > 0) {
      console.log('[migrate-legacy-template-scoring] failures:')
      for (const failure of err.failures) {
        console.log(`- id=${failure.id} name=${failure.name || '(unnamed)'}`)
      }
    }
    throw err
  }

  console.log(`[migrate-legacy-template-scoring] mode=${dryRun ? 'dry-run' : 'write'}`)
  console.log(`[migrate-legacy-template-scoring] candidates=${result.totalCandidates}`)
  console.log(`[migrate-legacy-template-scoring] migrated=${result.migratedCount}`)
}

main().catch((err) => {
  console.error('[migrate-legacy-template-scoring] fatal', err)
  process.exitCode = 1
})
