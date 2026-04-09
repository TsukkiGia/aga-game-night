import { initialState, normalizeAllowedTeamIndices, normalizeQuestionCursor } from './sessionState.js'

export function createRuntimeStore({ queryFn, sessions }) {
  function getState(code) {
    if (!sessions.has(code)) sessions.set(code, initialState())
    return sessions.get(code)
  }

  async function hydrateStateFromDb(code) {
    const { rows } = await queryFn(
      `
        SELECT
          s.id AS session_id,
          gs.armed AS gs_armed,
          gs.host_question_cursor AS gs_host_question_cursor,
          bs.winner_team_index AS bs_winner_team_index,
          bs.buzzed_member_name AS bs_buzzed_member_name,
          bs.allowed_team_indices AS bs_allowed_team_indices,
          t.idx AS team_idx,
          t.name AS team_name,
          t.color AS team_color
        FROM sessions s
        LEFT JOIN game_state gs ON gs.session_id = s.id
        LEFT JOIN buzz_state bs ON bs.session_id = s.id
        LEFT JOIN teams t ON t.session_id = s.id
        WHERE s.id = $1 AND s.status = 'active'
        ORDER BY t.idx ASC
      `,
      [code]
    )

    if (rows.length === 0) return null

    const first = rows[0] || {}
    const next = initialState()
    next.teams = rows
      .filter((r) => Number.isInteger(r.team_idx))
      .map((r) => ({ name: String(r.team_name || ''), color: String(r.team_color || '') }))
      .filter((team) => team.name && team.color)

    next.armed = Boolean(first.gs_armed)

    const winnerTeamIndex = Number.parseInt(first.bs_winner_team_index, 10)
    next.buzzedBy = Number.isInteger(winnerTeamIndex) ? winnerTeamIndex : null
    next.buzzedMemberName = first.bs_buzzed_member_name ? String(first.bs_buzzed_member_name) : null

    const rawAllowed = first.bs_allowed_team_indices
    if (Array.isArray(rawAllowed)) {
      const parsed = normalizeAllowedTeamIndices(rawAllowed, next.teams.length)
      next.allowedTeamIndices = parsed
    } else {
      next.allowedTeamIndices = null
    }

    let rawCursor = first.gs_host_question_cursor
    if (typeof rawCursor === 'string') {
      try { rawCursor = JSON.parse(rawCursor) } catch { rawCursor = null }
    }
    next.hostQuestionCursor = normalizeQuestionCursor(rawCursor)

    return next
  }

  async function ensureState(code) {
    if (sessions.has(code)) return sessions.get(code)
    const hydrated = await hydrateStateFromDb(code)
    if (!hydrated) return null
    sessions.set(code, hydrated)
    return hydrated
  }

  async function persistTeams(code, teams) {
    await queryFn('DELETE FROM teams WHERE session_id = $1', [code])
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i]
      await queryFn(
        `
          INSERT INTO teams (session_id, idx, name, color, score)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (session_id, idx)
          DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            score = EXCLUDED.score
        `,
        [code, i, team.name, team.color, 0]
      )
    }
  }

  async function persistRuntimeState(code, st) {
    const hostQuestionCursor = st.hostQuestionCursor === null ? null : JSON.stringify(st.hostQuestionCursor)
    const allowedTeamIndices = st.allowedTeamIndices ? [...st.allowedTeamIndices] : null
    await queryFn(
      `
        INSERT INTO game_state (session_id, armed, host_question_cursor)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (session_id)
        DO UPDATE SET
          armed = EXCLUDED.armed,
          host_question_cursor = EXCLUDED.host_question_cursor
      `,
      [code, st.armed, hostQuestionCursor]
    )
    await queryFn(
      `
        INSERT INTO buzz_state (session_id, winner_team_index, buzzed_member_name, allowed_team_indices)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (session_id)
        DO UPDATE SET
          winner_team_index = EXCLUDED.winner_team_index,
          buzzed_member_name = EXCLUDED.buzzed_member_name,
          allowed_team_indices = EXCLUDED.allowed_team_indices
      `,
      [code, st.buzzedBy, st.buzzedMemberName, allowedTeamIndices]
    )
  }

  function persistRuntimeStateInBackground(code, st) {
    persistRuntimeState(code, st).catch((err) => {
      console.error('[persistRuntimeState]', err)
    })
  }

  return {
    getState,
    ensureState,
    persistTeams,
    persistRuntimeState,
    persistRuntimeStateInBackground,
  }
}
