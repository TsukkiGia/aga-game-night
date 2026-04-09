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
          gs.round_index AS gs_round_index,
          gs.question_index AS gs_question_index,
          gs.streaks AS gs_streaks,
          gs.done_questions AS gs_done_questions,
          gs.double_points AS gs_double_points,
          gs.host_question_cursor AS gs_host_question_cursor,
          bs.winner_team_index AS bs_winner_team_index,
          bs.buzzed_member_name AS bs_buzzed_member_name,
          bs.allowed_team_indices AS bs_allowed_team_indices,
          t.idx AS team_idx,
          t.name AS team_name,
          t.color AS team_color,
          t.score AS team_score
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
      .map((r) => ({
        name: String(r.team_name || ''),
        color: String(r.team_color || ''),
        score: Number.isFinite(Number(r.team_score)) ? Number(r.team_score) : 0,
      }))
      .filter((team) => team.name && team.color)

    next.doneQuestions = Array.isArray(first.gs_done_questions)
      ? first.gs_done_questions.map((k) => String(k || '').trim()).filter(Boolean)
      : []

    const rawStreaks = Array.isArray(first.gs_streaks) ? first.gs_streaks : []
    next.streaks = next.teams.map((_, i) => {
      const parsed = Number.parseInt(rawStreaks[i], 10)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
    })

    next.doublePoints = Boolean(first.gs_double_points)

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
    if (rawCursor === null || rawCursor === undefined) {
      const roundIndex = Number.parseInt(first.gs_round_index, 10)
      const questionIndex = first.gs_question_index === null ? null : Number.parseInt(first.gs_question_index, 10)
      if (Number.isInteger(roundIndex) && (questionIndex === null || Number.isInteger(questionIndex))) {
        rawCursor = [roundIndex, questionIndex]
      }
    }
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
        [code, i, team.name, team.color, Number.isFinite(team.score) ? team.score : 0]
      )
    }
    await queryFn('DELETE FROM teams WHERE session_id = $1 AND idx >= $2', [code, teams.length])
  }

  async function persistRuntimeState(code, st) {
    const hostQuestionCursor = st.hostQuestionCursor === null ? null : JSON.stringify(st.hostQuestionCursor)
    const roundIndex = Array.isArray(st.hostQuestionCursor) ? st.hostQuestionCursor[0] : 0
    const questionIndex = Array.isArray(st.hostQuestionCursor) ? st.hostQuestionCursor[1] : null
    const allowedTeamIndices = st.allowedTeamIndices ? [...st.allowedTeamIndices] : null
    const streaks = Array.isArray(st.streaks) ? st.streaks.map((v) => {
      const parsed = Number.parseInt(v, 10)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
    }) : []
    const doneQuestions = Array.isArray(st.doneQuestions)
      ? st.doneQuestions.map((k) => String(k || '').trim()).filter(Boolean)
      : []
    await queryFn(
      `
        INSERT INTO game_state (
          session_id,
          round_index,
          question_index,
          armed,
          streaks,
          done_questions,
          host_question_cursor,
          double_points
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (session_id)
        DO UPDATE SET
          round_index = EXCLUDED.round_index,
          question_index = EXCLUDED.question_index,
          armed = EXCLUDED.armed,
          streaks = EXCLUDED.streaks,
          done_questions = EXCLUDED.done_questions,
          host_question_cursor = EXCLUDED.host_question_cursor,
          double_points = EXCLUDED.double_points
      `,
      [code, roundIndex, questionIndex, st.armed, streaks, doneQuestions, hostQuestionCursor, Boolean(st.doublePoints)]
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
