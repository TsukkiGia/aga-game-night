// Videos: place .mp4 files in public/videos/ named r1-01.mp4 through r1-08.mp4
// Fill in the answer and explanation fields below.

export default {
  label: 'Round 2',
  name: 'Guess the Language',
  type: 'video',
  scoring: [
    { label: 'Correct language', points: 3 },
    { label: 'Correct region',   points: 1 },
    { label: 'Wrong',            points: -1 },
  ],
  questions: [
    { id: 'r1q1', video: 'r1-01.mp4', answer: '', explanation: '' },
    { id: 'r1q2', video: 'r1-02.mp4', answer: '', explanation: '' },
    { id: 'r1q3', video: 'r1-03.mp4', answer: '', explanation: '' },
    { id: 'r1q4', video: 'r1-04.mp4', answer: '', explanation: '' },
    { id: 'r1q5', video: 'r1-05.mp4', answer: '', explanation: '' },
    { id: 'r1q6', video: 'r1-06.mp4', answer: '', explanation: '' },
    { id: 'r1q7', video: 'r1-07.mp4', answer: '', explanation: '' },
    { id: 'r1q8', video: 'r1-08.mp4', answer: '', explanation: '' },
  ],
}
