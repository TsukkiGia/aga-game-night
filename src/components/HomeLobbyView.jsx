import CodesPanel from './CodesPanel'

export default function HomeLobbyView({
  teams,
  members,
  buzzerUrl,
  launching,
  onOpenHelp,
  onOpenReactionLeaderboard,
  onNewGame,
  onEndSession,
  endingSession,
  onStart,
  armed,
  buzzWinner,
  onArm,
  onDismiss,
}) {
  return (
    <div className={`home-screen${launching ? ' launching' : ''}`}>
      <CodesPanel teams={teams} members={members} buzzerUrl={buzzerUrl} />

      <div className="home-actions-bar">
        <div className="home-actions-secondary">
          <button className="home-help-btn" onClick={onOpenHelp}>? Help</button>
          <button className="home-help-btn" onClick={onOpenReactionLeaderboard}>⏱ Reaction Times</button>
          <button className="home-new-game-btn" onClick={onNewGame}>↺ New Game</button>
          <button className="home-end-session-btn" onClick={onEndSession} disabled={endingSession}>
            {endingSession ? 'Ending…' : '✕ End Session'}
          </button>
        </div>
        <div className="home-actions-primary">
          <button className="home-start-game-btn" onClick={onStart}>▶ Start Game</button>
          <button
            className={`arm-btn ${armed ? 'armed' : ''}`}
            onClick={onArm}
            disabled={armed || buzzWinner !== null}
          >
            {armed ? '🔴 Listening…' : '🎯 Arm Buzzers'}
          </button>
          {armed && (
            <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}
