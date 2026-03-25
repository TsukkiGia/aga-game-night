import { useState } from 'react'

export function useNavigation() {
  const [activeQuestion, setActiveQuestion] = useState(null)  // [rIdx, qIdx|null] | null
  const [questionsOpen, setQuestionsOpen] = useState(false)

  // navigate(null)        → back to main scoreboard
  // navigate(rIdx, null)  → round intro
  // navigate(rIdx, qIdx)  → specific question
  function navigate(rIdx, qIdx = null) {
    setActiveQuestion(rIdx === null ? null : [rIdx, qIdx])
    setQuestionsOpen(false)
  }

  return {
    activeQuestion,
    questionsOpen,
    navigate,
    openQuestions:  () => setQuestionsOpen(true),
    closeQuestions: () => setQuestionsOpen(false),
  }
}
