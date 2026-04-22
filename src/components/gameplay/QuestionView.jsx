import { useEffect, useState } from 'react'
import { playPower } from '../../core/sounds'
import BuzzModal from './BuzzModal'
import VideoBody from '../question-bodies/VideoBody'
import SlangBody from '../question-bodies/SlangBody'
import CharadesBody from '../question-bodies/CharadesBody'
import ThesisBody from '../question-bodies/ThesisBody'
import CustomBuzzBody from '../question-bodies/CustomBuzzBody'
import JoinQrModal from './JoinQrModal'
import QuestionSidebar from './QuestionSidebar'
import ModalShell from '../ui/ModalShell'
import Timer from './Timer'
import { isHostlessMode } from '../../core/gameplayMode'
import { resolvePrimaryPositivePoints } from '../../utils/scoring'

export default function QuestionView({
  planCatalog = null,
  rounds, roundIndex, questionIndex, doneQuestions,
  teams, streaks, buzzWinner, armed,
  onAdjust, onArm, onDismiss,
  stealMode, onWrongAndSteal,
  onMarkDone, onNavigate, onBack, onNext, onPrev,
  onHalftime, onWinner, onShowReactionLeaderboard, doublePoints, onToggleDouble, timerControlSignal, onTimerExpired,
  pauseTimers = false,
  gameplayMode = 'hosted',
  answerState = null,
  hostlessAttemptFeed = [],
  hostlessCorrectEvent = null,
  hostlessTimeoutEvent = null,
  onDismissHostlessCorrect = () => {},
  onDismissHostlessTimeout = () => {},
  buzzerUrl = '',
  isRoundIncluded = () => true,
  isQuestionIncluded = () => true,
  getRoundDisplayLabel = (ri) => `Round ${ri + 1}`,
  getQuestionDisplayNumber = (_ri, qi) => qi + 1,
  getQuestionTotal = (ri) => rounds[ri]?.questions?.length || 0,
  savedSidebarScrollTop = 0,
  onRememberSidebarScroll = null,
}) {
  const round = rounds[roundIndex]
  const question = round?.questions?.[questionIndex]
  const total = getQuestionTotal(roundIndex)
  const displayQuestionNumber = getQuestionDisplayNumber(roundIndex, questionIndex)
  const isCharades = round?.type === 'charades'
  const isThesis   = round?.type === 'thesis'
  const isVideoRound = round?.type === 'video'
    || (round?.type === 'custom-buzz' && String(question?.promptType || '').trim().toLowerCase() === 'video')
  const hostlessModeActive = isHostlessMode(gameplayMode)
  const showHostlessWinnerModal = Boolean(hostlessCorrectEvent)
  const showHostlessTimeoutModal = Boolean(hostlessTimeoutEvent)
  const shouldPauseMedia = Boolean(buzzWinner || showHostlessWinnerModal || showHostlessTimeoutModal)
  const hostlessTimerQuestionId = String(answerState?.questionId || question?.id || '').trim()
  const hostlessOpenQuestion = hostlessModeActive
    && answerState?.status === 'open'
    && !answerState?.winner
    && !showHostlessWinnerModal
    && !showHostlessTimeoutModal
    && Boolean(hostlessTimerQuestionId)
  const selectedTurnIndex = Math.max(0, (Number(displayQuestionNumber) || (questionIndex + 1)) - 1)

  const hostlessAnswerLabel = round?.type === 'slang' ? 'Meaning' : 'Answer'
  const hostlessAnswerText = round?.type === 'slang'
    ? String(question?.meaning || '').trim()
    : String(question?.answer || '').trim()
  const hostlessAnswerExplanation = String(question?.explanation || '').trim()

  const activePair = isCharades
    ? new Set([(selectedTurnIndex * 2) % teams.length, (selectedTurnIndex * 2 + 1) % teams.length])
    : isThesis
    ? new Set([selectedTurnIndex % teams.length])
    : null

  function defaultStealSelection() {
    const allTeams = new Set(teams.map((_, i) => i))
    if (!isCharades) return allTeams
    const firstActive = (selectedTurnIndex * 2) % teams.length
    const secondActive = (selectedTurnIndex * 2 + 1) % teams.length
    allTeams.delete(firstActive)
    allTeams.delete(secondActive)
    return allTeams
  }
  const [stealPickerOpen, setStealPickerOpen] = useState(false)
  const [stealSelected, setStealSelected] = useState(() => defaultStealSelection())
  const [correctGiven, setCorrectGiven] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [showJoinQr, setShowJoinQr] = useState(false)
  const [hostlessPreCountdown, setHostlessPreCountdown] = useState(null)
  const [hostlessCountdownReadyQuestionId, setHostlessCountdownReadyQuestionId] = useState('')
  const [hostlessAutoplayTrigger, setHostlessAutoplayTrigger] = useState(0)

  const showHostlessCountdownScreen = hostlessOpenQuestion
    && hostlessCountdownReadyQuestionId !== hostlessTimerQuestionId
  const showHostlessTimer = hostlessOpenQuestion && !showHostlessCountdownScreen

  useEffect(() => {
    function onKeyDown(e) {
      if (!e.shiftKey) return
      const key = String(e.key || '').toUpperCase()
      if (key !== 'J') return
      e.preventDefault()
      setShowJoinQr(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!hostlessModeActive) {
      setHostlessPreCountdown(null)
      setHostlessCountdownReadyQuestionId('')
      return
    }
    if (!hostlessOpenQuestion || !hostlessTimerQuestionId) {
      setHostlessPreCountdown(null)
      return
    }
    if (hostlessCountdownReadyQuestionId === hostlessTimerQuestionId) return
    setHostlessPreCountdown(3)
  }, [hostlessModeActive, hostlessOpenQuestion, hostlessTimerQuestionId, hostlessCountdownReadyQuestionId])

  useEffect(() => {
    if (!showHostlessCountdownScreen) return
    if (pauseTimers) return
    const value = Number.isInteger(hostlessPreCountdown) ? hostlessPreCountdown : 3
    const id = setTimeout(() => {
      if (value <= 1) {
        setHostlessPreCountdown(null)
        setHostlessCountdownReadyQuestionId(hostlessTimerQuestionId)
        if (isVideoRound) setHostlessAutoplayTrigger((prev) => prev + 1)
        return
      }
      setHostlessPreCountdown(value - 1)
    }, 1000)
    return () => clearTimeout(id)
  }, [showHostlessCountdownScreen, pauseTimers, hostlessPreCountdown, hostlessTimerQuestionId, isVideoRound])

  if (!round || !question) {
    return (
      <div className="question-view">
        <div className="qv-nav">
          <button className="qv-back" onClick={onBack}>← Back</button>
          <div className="qv-heading">
            <span className="qv-round-tag">Question</span>
            <span className="qv-round-name">Unavailable</span>
          </div>
          <div />
        </div>
        <div className="qv-body">
          <div className="qv-empty-state">
            <div className="qv-empty-title">That question no longer exists.</div>
            <button className="qv-back" onClick={onBack}>Return to Home</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="question-view">

      {/* ── Nav bar ─────────────────────────────────── */}
      <div className="qv-nav">
        <button className="qv-back" onClick={onBack}>← Back</button>
        <div className="qv-heading">
          <span className="qv-round-tag">{getRoundDisplayLabel(roundIndex)}</span>
          <span className="qv-round-name">{round.name}</span>
        </div>
        <div className="qv-pagination">
          <span className="qv-counter">Q {displayQuestionNumber} / {total}</span>
          <button className="qv-arrow" onClick={onPrev} disabled={questionIndex === 0}>‹</button>
          <button className="qv-arrow" onClick={() => { onMarkDone(); onNext() }}>›</button>
          {!hostlessModeActive && (
            <button className="qv-reaction-btn" onClick={onShowReactionLeaderboard}>⏱ Question Race</button>
          )}
          <button className="qv-join-btn" onClick={() => setShowJoinQr(true)}>📱 Join</button>
          <button className="halftime-btn" onClick={onHalftime}>⏸ Halftime</button>
          {confirmFinish
            ? <>
                <button className="qv-finish-btn qv-finish-confirm" onClick={() => { setConfirmFinish(false); onWinner() }}>Finish?</button>
                <button className="qv-finish-btn qv-finish-cancel" onClick={() => setConfirmFinish(false)}>✕</button>
              </>
            : <button className="qv-finish-btn" onClick={() => setConfirmFinish(true)}>⏹ Finish</button>
          }
        </div>
      </div>

      {/* ── Mini scoreboard ──────────────────────────── */}
      <div className="qv-scores">
        {teams.map((team, i) => (
          <div
            key={i}
            className={`qv-team-strip color-${team.color}${buzzWinner?.teamIndex === i ? ' qv-buzzed' : ''}${activePair?.has(i) ? ' qv-active' : ''}`}
            style={{ cursor: buzzWinner ? 'default' : 'pointer' }}
          >
            <div className="qv-strip-info">
              <span className="qv-strip-name">
                {team.name}
                {streaks?.[i] >= 3 && <span className="qv-streak">🔥</span>}
              </span>
              <span className="qv-strip-score">{team.score}</span>
            </div>
            <div className="qv-strip-btns">
              <button className="qv-pts-btn neg" onClick={e => { e.stopPropagation(); onAdjust(i, -1) }}>−1</button>
              <button className="qv-pts-btn pos" onClick={e => { e.stopPropagation(); onAdjust(i, +1) }}>+1</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Buzz modal ───────────────────────────────── */}
      {!hostlessModeActive && (
        <BuzzModal
          buzzWinner={buzzWinner}
          teams={teams}
          round={round}
          question={question}
          stealMode={stealMode}
          doublePoints={doublePoints}
          stealAllowedTeamIndices={isCharades ? [...defaultStealSelection()] : null}
          onAdjust={onAdjust}
          onDismiss={onDismiss}
          onWrongAndSteal={onWrongAndSteal}
          timerControlSignal={timerControlSignal}
          onTimerExpired={onTimerExpired}
        />
      )}

      {/* ── Main area: sidebar + body ───────────────── */}
      <div className="qv-main">

        {/* Left sidebar */}
        <QuestionSidebar
          planCatalog={planCatalog}
          rounds={rounds}
          roundIndex={roundIndex}
          activeQuestionIndex={questionIndex}
          doneQuestions={doneQuestions}
          onNavigate={onNavigate}
          isRoundIncluded={isRoundIncluded}
          isQuestionIncluded={isQuestionIncluded}
          getRoundDisplayLabel={getRoundDisplayLabel}
          getQuestionDisplayNumber={getQuestionDisplayNumber}
          savedScrollTop={savedSidebarScrollTop}
          onRememberScroll={onRememberSidebarScroll}
          collapsible
        />

        {/* ── Question body ── */}
        <div className="qv-body">
          <div className={`qv-body-stack${hostlessModeActive ? ' hostless' : ''}`}>
            {showHostlessCountdownScreen ? (
              <div className="qv-hostless-countdown-screen" role="status" aria-live="polite">
                <div className="qv-hostless-countdown-label">Get ready</div>
                <div className="qv-hostless-countdown-value">
                  {Number.isInteger(hostlessPreCountdown) ? hostlessPreCountdown : 3}
                </div>
              </div>
            ) : (
              <>
                {round.type === 'video'    && (
                  <VideoBody
                    key={question.id}
                    question={question}
                    paused={shouldPauseMedia}
                    allowReveal={!hostlessModeActive}
                    autoplayTrigger={hostlessModeActive ? hostlessAutoplayTrigger : 0}
                  />
                )}
                {round.type === 'slang'    && <SlangBody    key={question.id} question={question} allowReveal={!hostlessModeActive} />}
                {round.type === 'custom-buzz' && (
                  <CustomBuzzBody
                    key={question.id}
                    question={question}
                    paused={shouldPauseMedia}
                    allowReveal={!hostlessModeActive}
                    autoplayTrigger={hostlessModeActive ? hostlessAutoplayTrigger : 0}
                  />
                )}
                {round.type === 'charades' && (
                  <div className="charades-wrap">
                    <div className="charades-active-teams">
                      {[...activePair].map(i => (
                        <button
                          key={i}
                          className={`charades-active-chip color-${teams[i].color}`}
                          onClick={() => {
                            const pts = resolvePrimaryPositivePoints(round.scoring, { allowSteal: false, fallback: 3 })
                            onAdjust(i, pts)
                          }}
                          title={`Award ${teams[i].name} correct answer points`}
                        >
                          {teams[i].name}
                        </button>
                      ))}
                      <span className="charades-active-label">are up</span>
                    </div>
                    <CharadesBody key={question.id} question={question} timerPaused={pauseTimers} />
                  </div>
                )}
                {isThesis && (
                  <div className="qv-thesis-shell">
                    <div className="charades-active-teams">
                      {[...activePair].map(i => (
                        <button
                          key={i}
                          className={`charades-active-chip color-${teams[i].color}`}
                          onClick={() => {
                            const pts = resolvePrimaryPositivePoints(round.scoring, { allowSteal: true, fallback: 3 })
                            onAdjust(i, pts)
                            setCorrectGiven(true)
                          }}
                          title={`Award ${teams[i].name} majority vote points`}
                        >
                          {teams[i].name}
                        </button>
                      ))}
                      <span className="charades-active-label">is up</span>
                    </div>
                    <ThesisBody key={question.id} question={question} timerPaused={pauseTimers} />
                  </div>
                )}
                {hostlessModeActive && (
                  <div className="qv-hostless-under-media">
                    <div className="qv-hostless-state">
                      {answerState?.status === 'open' ? 'Answer submissions are open.' : 'Question locked.'}
                    </div>
                    {showHostlessTimer && (
                      <Timer
                        key={`hostless-${hostlessTimerQuestionId}`}
                        seconds={30}
                        autoStart
                        showControls={false}
                        soundEnabled={!isVideoRound}
                        forcePaused={pauseTimers}
                        onExpire={() => {
                          if (!showHostlessTimer) return
                          return onTimerExpired?.(hostlessTimerQuestionId) ?? false
                        }}
                      />
                    )}
                    {hostlessAttemptFeed.length > 0 && (
                      <div className="qv-hostless-feed" aria-live="polite">
                        {hostlessAttemptFeed.slice(-4).map((attempt, index) => (
                          <div key={`${attempt.timestamp || 0}-${index}`} className="qv-hostless-attempt">
                            <strong>{attempt.team?.name || 'Team'}</strong>
                            {attempt.memberName ? ` · ${attempt.memberName}` : ''}
                            {` guessed "${attempt.guess}"`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {/* ── Arm row ──────────────────────────────────── */}
      <div className="qv-arm-row arm-row" style={hostlessModeActive ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
          <button
            className={`double-pts-btn${doublePoints ? ' active' : ''}`}
            onClick={() => { if (!doublePoints) playPower(); onToggleDouble() }}
            title="Double points for this question"
          >
            {doublePoints ? '2× ON' : '2×'}
          </button>
          <button
            className={`arm-btn ${armed ? 'armed' : ''}`}
            onClick={onArm}
            disabled={armed || buzzWinner !== null}
          >
            {armed ? `🔴 Listening…${doublePoints ? ' (2×)' : ''}` : '🎯 Arm Buzzers'}
          </button>
          {armed && (
            <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
          )}
          {!armed && !buzzWinner && !correctGiven && isCharades && (
            <button
              className={`steal-open-btn${stealPickerOpen ? ' active' : ''}`}
              onClick={() => setStealPickerOpen((open) => !open)}
            >
              🔀 Open Steal
            </button>
          )}
      </div>

      <JoinQrModal
        open={showJoinQr}
        buzzerUrl={buzzerUrl}
        onClose={() => setShowJoinQr(false)}
      />
      {showHostlessWinnerModal && (
        <ModalShell onClose={onDismissHostlessCorrect} dialogClassName="hostless-correct-modal">
          <div className="help-popup-tag">Correct Answer</div>
          <h2 className="hostless-correct-title">
            {hostlessCorrectEvent.memberName
              ? `${hostlessCorrectEvent.memberName} got it right`
              : `${hostlessCorrectEvent.team?.name || 'A team'} got it right`}
          </h2>
          <p className="hostless-correct-sub">
            {hostlessCorrectEvent.memberName && hostlessCorrectEvent.team?.name
              ? `${hostlessCorrectEvent.memberName} answered correctly for ${hostlessCorrectEvent.team.name}.`
              : 'A correct answer has been submitted.'}
          </p>
          <div className="buzz-popup-answer">
            <div className="buzz-popup-answer-label">{hostlessAnswerLabel}</div>
            <div className="buzz-popup-answer-text">{hostlessCorrectEvent.answer || hostlessAnswerText || 'No answer available.'}</div>
            {hostlessAnswerExplanation && (
              <div className="buzz-popup-answer-explanation">{hostlessAnswerExplanation}</div>
            )}
          </div>
          <div className="hostless-correct-actions">
            <button type="button" className="back-btn" onClick={onDismissHostlessCorrect}>
              Close
            </button>
            <button
              type="button"
              className="start-btn hostless-correct-cta"
              onClick={() => {
                onDismissHostlessCorrect()
                onMarkDone()
                onNext()
              }}
            >
              Next Question →
            </button>
          </div>
        </ModalShell>
      )}
      {showHostlessTimeoutModal && (
        <ModalShell onClose={onDismissHostlessTimeout} dialogClassName="hostless-correct-modal">
          <div className="help-popup-tag">Time's Up</div>
          <h2 className="hostless-correct-title">No one got it in 30 seconds</h2>
          <p className="hostless-correct-sub">The correct answer is shown below.</p>
          <div className="buzz-popup-answer">
            <div className="buzz-popup-answer-label">{hostlessAnswerLabel}</div>
            <div className="buzz-popup-answer-text">{hostlessTimeoutEvent.answer || hostlessAnswerText || 'No answer available.'}</div>
            {hostlessAnswerExplanation && (
              <div className="buzz-popup-answer-explanation">{hostlessAnswerExplanation}</div>
            )}
          </div>
          <div className="hostless-correct-actions">
            <button type="button" className="back-btn" onClick={onDismissHostlessTimeout}>
              Close
            </button>
            <button
              type="button"
              className="start-btn hostless-correct-cta"
              onClick={() => {
                onDismissHostlessTimeout()
                onMarkDone()
                onNext()
              }}
            >
              Next Question →
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── Steal picker ─────────────────────────────── */}
      {stealPickerOpen && !hostlessModeActive && !armed && !buzzWinner && (
        <div className="steal-picker">
          <div className="steal-picker-label">Teams eligible to steal:</div>
          <div className="steal-picker-teams">
            {teams.map((t, i) => (
              <label key={i} className={`steal-picker-chip color-${t.color}${stealSelected.has(i) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={stealSelected.has(i)}
                  onChange={() => {
                    setStealSelected((prev) => {
                      const next = new Set(prev)
                      next.has(i) ? next.delete(i) : next.add(i)
                      return next
                    })
                  }}
                />
                {t.name}
              </label>
            ))}
          </div>
          <button
            className="steal-arm-btn"
            disabled={stealSelected.size === 0}
            onClick={() => {
              const allowedTeamIndices = [...stealSelected]
              setStealPickerOpen(false)
              onWrongAndSteal(allowedTeamIndices)
            }}
          >
            Arm Steal →
          </button>
        </div>
      )}
    </div>
  )
}
