import CodesPanel from './CodesPanel'
import { isHostlessMode } from '../gameplayMode'

export default function HomeLobbyView({
  teams,
  members,
  buzzerUrl,
  launching,
  onOpenHelp,
  onNewGame,
  newGamePending,
  newGameError,
  onEndSession,
  endingSession,
  onStart,
  startDisabled,
  armed,
  buzzWinner,
  onArm,
  onDismiss,
  gameplayMode = 'hosted',
}) {
  const hostlessModeActive = isHostlessMode(gameplayMode)
  return (
    <div className={`home-screen${launching ? ' launching' : ''}`}>
      <CodesPanel teams={teams} members={members} buzzerUrl={buzzerUrl} />

      <div className="home-actions-bar">
        <div className="home-actions-secondary">
          <button className="home-help-btn" onClick={onOpenHelp}>? Help</button>
          <button className="home-new-game-btn" onClick={onNewGame} disabled={newGamePending || endingSession}>
            {newGamePending ? 'Resetting…' : 'Restart Lobby'}
          </button>
          <button className="home-end-session-btn" onClick={onEndSession} disabled={endingSession}>
            {endingSession ? 'Ending…' : 'End Session'}
          </button>
        </div>
        {newGameError && <div className="host-auth-error">{newGameError}</div>}
        <div className="home-actions-primary">
          {hostlessModeActive ? (
            <div className="home-hostless-pill">Host-less mode active</div>
          ) : (
            <>
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
            </>
          )}
          <button className="home-start-game-btn" onClick={onStart} disabled={startDisabled}>▶ Start Game</button>
        </div>
      </div>
    </div>
  )
}
