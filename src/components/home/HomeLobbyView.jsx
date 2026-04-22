import CodesPanel from './CodesPanel'
import { isHostlessMode } from '../../core/gameplayMode'

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
  onGameplayModeChange = () => {},
  gameplayModeSwitching = false,
  gameplayModeError = '',
}) {
  const hostlessModeActive = isHostlessMode(gameplayMode)
  return (
    <div className={`home-screen${launching ? ' launching' : ''}`}>
      <CodesPanel
        teams={teams}
        members={members}
        buzzerUrl={buzzerUrl}
        gameplayMode={gameplayMode}
        onGameplayModeChange={onGameplayModeChange}
        gameplayModeSwitching={gameplayModeSwitching}
      />

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
          <div className="home-arm-row" style={hostlessModeActive ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>
            <button
              className={`arm-btn ${armed ? 'armed' : ''}`}
              onClick={onArm}
              disabled={armed || buzzWinner !== null || gameplayModeSwitching}
            >
              {armed ? '🔴 Listening…' : '🎯 Arm Buzzers'}
            </button>
            {armed && (
              <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
            )}
          </div>
          <button className="home-start-game-btn" onClick={onStart} disabled={startDisabled || gameplayModeSwitching}>▶ Start Game</button>
        </div>
      </div>
      {gameplayModeError && <div className="host-auth-error">{gameplayModeError}</div>}
    </div>
  )
}
