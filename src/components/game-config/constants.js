export const DEFAULT_SCORING = [
  { label: 'Correct answer', points: 3, phase: 'normal' },
  { label: 'Wrong answer', points: -1, phase: 'normal' },
  { label: 'Correct steal', points: 2, phase: 'steal' },
  { label: 'Wrong steal', points: 0, phase: 'steal' },
]

export const DEFAULT_QUESTION = {
  promptType: 'text',
  promptText: '',
  mediaUrl: '',
  answer: '',
  explanation: '',
}

export const DRAG_SCROLL_EDGE_PX = 120
export const DRAG_SCROLL_MAX_STEP_PX = 16
