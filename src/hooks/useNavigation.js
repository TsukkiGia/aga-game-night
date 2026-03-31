import { useEffect, useState } from 'react'
import { playTransition } from '../sounds'

const ACTIVE_QUESTION_KEY = 'scorekeeping_active_question'

function loadActiveQuestion() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_QUESTION_KEY) || 'null')
    if (parsed === null) return null
    if (!Array.isArray(parsed) || parsed.length !== 2) return null

    const [roundIndex, questionIndex] = parsed
    const validRound = Number.isInteger(roundIndex) && roundIndex >= 0
    const validQuestion = questionIndex === null || (Number.isInteger(questionIndex) && questionIndex >= 0)
    return validRound && validQuestion ? [roundIndex, questionIndex] : null
  } catch {
    return null
  }
}

export function useNavigation() {
  const [activeQuestion, setActiveQuestion] = useState(() => loadActiveQuestion())  // [rIdx, qIdx|null] | null
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [transition, setTransition] = useState(null)  // round object | null

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_QUESTION_KEY, JSON.stringify(activeQuestion))
    } catch {
      // Ignore storage failures; navigation still works in-memory.
    }
  }, [activeQuestion])

  // navigate(null)        → back to main scoreboard
  // navigate(rIdx, null)  → round intro (with transition)
  // navigate(rIdx, qIdx)  → specific question
  function navigate(rIdx, qIdx = null, rounds = null, silent = false) {
    setQuestionsOpen(false)
    if (rIdx === null) {
      setActiveQuestion(null)
    } else if (qIdx === null && rounds) {
      if (!silent) playTransition()
      setTransition(rounds[rIdx])
      setActiveQuestion([rIdx, null])
    } else {
      if (!silent) playTransition()
      setActiveQuestion([rIdx, qIdx])
    }
  }

  function dismissTransition() { setTransition(null) }

  return {
    activeQuestion,
    questionsOpen,
    transition,
    navigate,
    dismissTransition,
    openQuestions:  () => setQuestionsOpen(true),
    closeQuestions: () => setQuestionsOpen(false),
  }
}
