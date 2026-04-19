import CodesPanel from './CodesPanel'

export default function HomeLobbyView({
  teams,
  members,
  buzzerUrl,
  launching,
  onOpenHelp,
  onOpenReactionLeaderboard,
  onNewGame,
  newGamePending,
  newGameError,
  endingSession,
  onStart,
  startDisabled,
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
          <button className="home-help-btn" onClick={onOpenReactionLeaderboard}>⏱ Question Race</button>
          <button className="home-new-game-btn" onClick={onNewGame} disabled={newGamePending || endingSession}>
            {newGamePending ? 'Resetting…' : 'Restart Lobby'}
          </button>
        </div>
        {newGameError && <div className="host-auth-error">{newGameError}</div>}
        <div className="home-actions-primary">
          <button
            className={`arm-btn ${armed ? 'armed' : ''}`}
            onClick={onArm}
            disabled={armed || buzzWinner !== null}
          >
            {armed ? '🔴 Listening…' : '🎯 Arm Buzzers'}
          </button>
          <button className="home-start-game-btn" onClick={onStart} disabled={startDisabled}>▶ Start Game</button>
          {armed && (
            <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}
