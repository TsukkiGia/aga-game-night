import { useEffect, useRef, useState } from 'react'
import { questionItemIdFor } from '../gamePlan'

const TYPE_LABEL = {
  video: 'Video',
  slang: 'Slang',
  charades: 'Charades',
  thesis: 'Thesis',
  'custom-buzz': 'Question',
}

function isQuestionDone(doneQuestions, roundIndex, questionIndex, planCatalog) {
  if (doneQuestions?.has(`${roundIndex}-${questionIndex}`)) return true
  if (!planCatalog) return false
  const itemId = questionItemIdFor(roundIndex, questionIndex, planCatalog)
  return Boolean(itemId && doneQuestions?.has(itemId))
}

export default function QuestionSidebar({
  planCatalog = null,
  rounds = [],
  roundIndex,
  activeQuestionIndex = null,
  doneQuestions,
  onNavigate,
  isRoundIncluded = () => true,
  isQuestionIncluded = () => true,
  getRoundDisplayLabel = (ri) => `Round ${ri + 1}`,
  getQuestionDisplayNumber = (_ri, qi) => qi + 1,
  savedScrollTop = 0,
  onRememberScroll = null,
  collapsible = false,
  defaultOpen = true,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const sidebarRef = useRef(null)

  useEffect(() => {
    const container = sidebarRef.current
    if (!container) return
    container.scrollTop = Number(savedScrollTop) || 0
  }, [savedScrollTop])

  function navigateFromSidebar(nextRoundIndex, nextQuestionIndex) {
    if (sidebarRef.current) {
      onRememberScroll?.(sidebarRef.current.scrollTop)
    }
    onNavigate(nextRoundIndex, nextQuestionIndex)
  }

  return (
    <div
      className={`qv-sidebar${collapsible && !isOpen ? ' collapsed' : ''}`}
      ref={sidebarRef}
      onScroll={() => {
        if (!sidebarRef.current) return
        onRememberScroll?.(sidebarRef.current.scrollTop)
      }}
    >
      {collapsible && (
        <button className="qv-sidebar-toggle" onClick={() => setIsOpen((open) => !open)}>
          {isOpen ? '‹' : '›'}
        </button>
      )}
      {isOpen && rounds.map((round, ri) => {
        if (!isRoundIncluded(ri)) return null
        return (
          <div key={ri} className="qv-sidebar-group">
            <button
              className={`qv-sidebar-round-label clickable${ri === roundIndex && activeQuestionIndex === null ? ' active-round' : ''}`}
              onClick={() => navigateFromSidebar(ri, null)}
            >
              {getRoundDisplayLabel(ri)}
            </button>
            {round.questions.map((_question, qi) => {
              if (!isQuestionIncluded(ri, qi)) return null
              const done = isQuestionDone(doneQuestions, ri, qi, planCatalog)
              const active = ri === roundIndex && qi === activeQuestionIndex
              const displayNumber = getQuestionDisplayNumber(ri, qi)
              return (
                <button
                  key={qi}
                  className={`qv-sidebar-item${active ? ' active' : ''}${done ? ' done' : ''}`}
                  onClick={() => navigateFromSidebar(ri, qi)}
                >
                  {done ? '✓ ' : ''}
                  {TYPE_LABEL[round.type] || 'Q'} {displayNumber}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
