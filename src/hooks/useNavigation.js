import { useState } from 'react'

export function useNavigation() {
  const [activeQuestion, setActiveQuestion] = useState(null)  // [rIdx, qIdx|null] | null
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [transition, setTransition] = useState(null)  // round object | null

  // navigate(null)        → back to main scoreboard
  // navigate(rIdx, null)  → round intro (with transition)
  // navigate(rIdx, qIdx)  → specific question
  function navigate(rIdx, qIdx = null, rounds = null) {
    setQuestionsOpen(false)
    if (rIdx === null) {
      setActiveQuestion(null)
    } else if (qIdx === null && rounds) {
      // Show transition screen before round intro
      setTransition(rounds[rIdx])
      setActiveQuestion([rIdx, null])
    } else {
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
