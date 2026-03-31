const cache = {}

function load(name, ext = 'wav') {
  if (!cache[name]) cache[name] = new Audio(`/sounds/${name}.${ext}`)
  return cache[name]
}

function play(name, ext = 'wav') {
  const audio = load(name, ext)
  audio.currentTime = 0
  audio.play().catch(() => {})
}

export function playBuzzIn()    { play('buzz_in') }
export function playCorrect()   { play('correct') }
export function playWrong()     { play('wrong') }
export function playArm()       { play('arm') }
export function playGameStart() { play('game_start') }
export function playWinner()        { play('winner', 'mp3') }
export function playWinnerMusical() { play('winner_musical', 'mp3') }
export function playApplause()       { play('applause') }
export function playWhistle()        { play('referee-whistle', 'mp3') }
export function playTick()   { play('tick-tock') }
export function stopTick()   { const a = load('tick-tock'); a.pause(); a.currentTime = 0 }
export function playTimeUp() { play('buzz') }
export function playTransition() { play('transition') }
export function playCrickets()      { play('crickets') }
export function playFaaah()         { play('faaah', 'mp3') }
export function playCorrectAnswer() { play('correct_answer', 'mp3') }
export function playNani()          { play('nani', 'mp3') }
export function playWhatTheHell()   { play('what-the-hell', 'mp3') }
export function playShocked()       { play('shocked', 'mp3') }
export function playAirhorn()       { play('airhorn', 'mp3') }
export function playBoo()           { play('boo', 'mp3') }
export function playLaughter()      { play('laughter-short', 'mp3') }
export function playOkayy()         { play('okay', 'mp3') }

// Timer music — looping, returns a stop function
export function playTimerMusic() {
  const audio = load('timer', 'mp3')
  audio.currentTime = 0
  audio.loop = true
  audio.play().catch(() => {})
  return () => { audio.pause(); audio.currentTime = 0 }
}
