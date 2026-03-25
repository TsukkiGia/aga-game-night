import { useState, useEffect } from 'react'
import { SCORES_KEY, DONE_KEY, loadScores, loadDone, clearAll } from '../storage'
import { playCorrect, playWrong } from '../sounds'

export function useGameState(initialTeams) {
  const [teams, setTeams] = useState(() => loadScores(initialTeams))
  const [doneQuestions, setDoneQuestions] = useState(() => loadDone())
  const [flashing, setFlashing] = useState(null)

  useEffect(() => {
    const s = {}
    teams.forEach(t => { s[t.code] = t.score })
    localStorage.setItem(SCORES_KEY, JSON.stringify(s))
  }, [teams])

  useEffect(() => {
    localStorage.setItem(DONE_KEY, JSON.stringify([...doneQuestions]))
  }, [doneQuestions])

  function adjust(index, delta) {
    setTeams(prev => prev.map((t, i) => i === index ? { ...t, score: t.score + delta } : t))
    setFlashing(`${index}-${delta > 0 ? 'up' : 'down'}`)
    setTimeout(() => setFlashing(null), 400)
    if (delta > 0) playCorrect()
    else playWrong()
  }

  function resetScores() {
    clearAll()
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })))
    setDoneQuestions(new Set())
  }

  function toggleDone(rIdx, qIdx) {
    const key = `${rIdx}-${qIdx}`
    setDoneQuestions(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return { teams, doneQuestions, flashing, adjust, resetScores, toggleDone }
}
