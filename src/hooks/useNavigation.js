import { useEffect, useState } from 'react'
import { playTransition } from '../sounds'
import { ACTIVE_QUESTION_KEY, normalizeQuestionCursor, getStorageItem, setStorageItem } from '../storage'

function loadActiveQuestion() {
  try {
    return normalizeQuestionCursor(JSON.parse(getStorageItem(ACTIVE_QUESTION_KEY) || 'null'))
  } catch {
    return null
  }
}

export function useNavigation() {
  const [activeQuestion, setActiveQuestion] = useState(() => loadActiveQuestion())  // cursor id | null
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [transition, setTransition] = useState(null)  // round object | null

  useEffect(() => {
    setStorageItem(ACTIVE_QUESTION_KEY, JSON.stringify(activeQuestion))
  }, [activeQuestion])

  // navigate(null) -> back to main scoreboard
  // navigate(itemId, { transitionRound, silent })
  function navigate(nextCursor, options = {}) {
    const { transitionRound = null, silent = false } = options
    setQuestionsOpen(false)
    if (!silent && nextCursor !== null) playTransition()
    if (transitionRound) setTransition(transitionRound)
    setActiveQuestion(nextCursor)
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
