const cache = {}

function load(name) {
  if (!cache[name]) cache[name] = new Audio(`/sounds/${name}.wav`)
  return cache[name]
}

export function playBuzzIn()  { play('buzz_in') }
export function playCorrect() { play('correct') }
export function playWrong()   { play('wrong')   }

function play(name) {
  const audio = load(name)
  audio.currentTime = 0
  audio.play().catch(() => {})
}
