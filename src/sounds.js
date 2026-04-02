const cache = {}
let audioUnlocked = false

function load(name, ext = 'wav') {
  if (!cache[name]) cache[name] = new Audio(`/sounds/${name}.${ext}`)
  return cache[name]
}

function play(name, ext = 'wav') {
  const audio = load(name, ext)
  audio.currentTime = 0
  audio.play().catch(() => {})
}

async function playChecked(name, ext = 'wav') {
  const audio = load(name, ext)
  audio.currentTime = 0
  try {
    await audio.play()
    return true
  } catch {
    return false
  }
}

export async function unlockAudio() {
  if (audioUnlocked) return true
  const audio = load('arm')
  const originalMuted = audio.muted
  audio.muted = true
  const ok = await playChecked('arm')
  audio.pause()
  audio.currentTime = 0
  audio.muted = originalMuted
  audioUnlocked = ok
  return ok
}

export function playBuzzIn()    { play('buzz_in') }
export function playCorrect()   { play('correct') }
export function playWrong()     { play('wrong') }
export function playVeryWrong() { play('very-wrong', 'mp3') }
export function playArm()       { play('arm') }
export function playGameStart() { play('game_start') }
export function playWinner()        { play('winner', 'mp3') }
export function playWinnerMusical() { play('winner_musical', 'mp3') }
export function playApplause()       { play('applause') }
export function stopWinnerSounds() {
  for (const name of ['winner', 'winner_musical', 'applause']) {
    const ext = name === 'applause' ? 'wav' : 'mp3'
    const a = load(name, ext)
    a.pause()
    a.currentTime = 0
  }
}

export function playSuspenseSequence() {
  const s1 = load('suspense_1')
  const s2 = load('suspense_2')
  s2.loop = true
  s1.currentTime = 0
  s1.play().catch(() => {})
  s1.onended = () => { s2.currentTime = 0; s2.play().catch(() => {}) }
}

export function stopSuspense() {
  for (const name of ['suspense_1', 'suspense_2']) {
    const a = load(name)
    a.pause()
    a.currentTime = 0
  }
}
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
export function playPower()         { play('power', 'mp3') }

const SOUND_BITE_ASSETS = {
  crickets: ['crickets', 'wav'],
  faaah: ['faaah', 'mp3'],
  correct_answer: ['correct_answer', 'mp3'],
  nani: ['nani', 'mp3'],
  what_the_hell: ['what-the-hell', 'mp3'],
  shocked: ['shocked', 'mp3'],
  airhorn: ['airhorn', 'mp3'],
  boo: ['boo', 'mp3'],
  laughter: ['laughter-short', 'mp3'],
  okayy: ['okay', 'mp3'],
  very_wrong: ['very-wrong', 'mp3'],
}

export function playSoundBiteByKey(key) {
  const soundKey = String(key || '').trim()
  const asset = SOUND_BITE_ASSETS[soundKey]
  if (!asset) return Promise.resolve(false)
  const [name, ext] = asset
  return playChecked(name, ext)
}

// Timer music — looping, returns a stop function
export function playTimerMusic() {
  const audio = load('timer', 'mp3')
  audio.currentTime = 0
  audio.loop = true
  audio.play().catch(() => {})
  return () => { audio.pause(); audio.currentTime = 0 }
}
