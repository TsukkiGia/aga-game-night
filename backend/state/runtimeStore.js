import {
  initialState,
  normalizeAllowedTeamIndices,
  normalizeQuestionCursor,
  normalizeGamePlan,
  normalizeRoundCatalog,
  normalizeReactionStats,
  normalizeGameplayMode,
  normalizeAnswerState,
} from './sessionState.js'

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
          s.gameplay_mode AS s_gameplay_mode,
          gs.armed AS gs_armed,
          gs.round_index AS gs_round_index,
          gs.question_index AS gs_question_index,
          gs.streaks AS gs_streaks,
          gs.done_questions AS gs_done_questions,
          gs.double_points AS gs_double_points,
          gs.game_plan AS gs_game_plan,
          gs.round_catalog AS gs_round_catalog,
          gs.reaction_stats AS gs_reaction_stats,
          gs.host_question_cursor AS gs_host_question_cursor,
          gs.answer_state AS gs_answer_state,
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
    next.gameplayMode = normalizeGameplayMode(first.s_gameplay_mode)
    next.gamePlan = normalizeGamePlan(first.gs_game_plan)
    next.roundCatalog = normalizeRoundCatalog(first.gs_round_catalog)
    next.reactionStats = normalizeReactionStats(first.gs_reaction_stats)

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
      const trimmed = rawCursor.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
        try { rawCursor = JSON.parse(trimmed) } catch { rawCursor = trimmed }
      } else {
        rawCursor = trimmed
      }
    }
    next.hostQuestionCursor = normalizeQuestionCursor(rawCursor)
    next.answerState = normalizeAnswerState(first.gs_answer_state, typeof next.hostQuestionCursor === 'string' ? next.hostQuestionCursor : null)

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
    const gamePlan = normalizeGamePlan(st.gamePlan)
    const roundCatalog = normalizeRoundCatalog(st.roundCatalog)
    const reactionStats = normalizeReactionStats(st.reactionStats)
    const gameplayMode = normalizeGameplayMode(st.gameplayMode)
    const answerState = normalizeAnswerState(st.answerState, typeof st.hostQuestionCursor === 'string' ? st.hostQuestionCursor : null)
    st.gameplayMode = gameplayMode
    st.answerState = answerState
    await queryFn(
      `
        UPDATE sessions
        SET gameplay_mode = $2
        WHERE id = $1 AND status = 'active'
      `,
      [code, gameplayMode]
    )
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
          double_points,
          game_plan,
          round_catalog,
          reaction_stats,
          answer_state
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
        ON CONFLICT (session_id)
        DO UPDATE SET
          round_index = EXCLUDED.round_index,
          question_index = EXCLUDED.question_index,
          armed = EXCLUDED.armed,
          streaks = EXCLUDED.streaks,
          done_questions = EXCLUDED.done_questions,
          host_question_cursor = EXCLUDED.host_question_cursor,
          double_points = EXCLUDED.double_points,
          game_plan = EXCLUDED.game_plan,
          round_catalog = EXCLUDED.round_catalog,
          reaction_stats = EXCLUDED.reaction_stats,
          answer_state = EXCLUDED.answer_state
      `,
      [code, roundIndex, questionIndex, st.armed, streaks, doneQuestions, hostQuestionCursor, Boolean(st.doublePoints), gamePlan, JSON.stringify(roundCatalog), JSON.stringify(reactionStats), JSON.stringify(answerState)]
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
