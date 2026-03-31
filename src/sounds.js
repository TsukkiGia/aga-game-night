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
export function playWinner()    { play('winner', 'mp3') }
export function playTick()   { play('tick-tock') }
export function stopTick()   { const a = load('tick-tock'); a.pause(); a.currentTime = 0 }
export function playTimeUp() { play('buzz') }
export function playTransition() { play('transition') }

// Timer music — looping, returns a stop function
export function playTimerMusic() {
  const audio = load('timer', 'mp3')
  audio.currentTime = 0
  audio.loop = true
  audio.play().catch(() => {})
  return () => { audio.pause(); audio.currentTime = 0 }
}
