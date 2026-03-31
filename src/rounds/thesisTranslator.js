const OPTIONS = ['Family-friendly English', 'Slang register', 'Exaggerated academic jargon']

export default {
  label: 'Round 4',
  name: 'Title Translator',
  type: 'thesis',
  intro: 'Teams translate a real thesis title into a chosen register. Crowd votes on the best translation.',
  rules: [
    'Round robin — each team translates the title in their chosen register',
    'Choose from: Family-friendly English, Slang, or Exaggerated academic jargon',
    '90 seconds — timer starts when the title is revealed',
    'Crowd votes on the best translation — winning team gets +3 pts',
    'One steal is open after — buzz in to attempt',
    'Correct steal: +2 pts — wrong steal: −1 pt',
  ],
  scoring: [
    { label: 'Majority vote', points: 3 },
    { label: 'Correct steal', points: 2 },
    { label: 'Wrong steal',   points: -1 },
  ],
  questions: [
    {
      id: 'r3q1',
      title: 'Eukaryotic Algal Gene Transfers Improve Dating Resolution for Prochlorococcus',
      options: OPTIONS,
    },
    {
      id: 'r3q2',
      title: 'The Resilient Factory — Enterprise Asset Management, Cybersecurity, and IT/OT Convergence',
      options: OPTIONS,
    },
    {
      id: 'r3q3',
      title: 'Learning What to Ask For: Active Learning for Accurate, Cost-Efficient Interactive Medical Image Segmentation',
      options: OPTIONS,
    },
    {
      id: 'r3q4',
      title: 'Mixed Convective Heat Transfer in a Three-Dimensional Corrugated Duct',
      options: OPTIONS,
    },
    {
      id: 'r3q5',
      title: 'Impact of Lesion Preparation-Induced Calcified Plaque Defects in Vascular Intervention for Atherosclerotic Disease: In Silico Assessment',
      options: OPTIONS,
    },
    {
      id: 'r3q6',
      title: 'A Diffusion Model for Simulation Ready Coronary Anatomy with Morpho-skeletal Control',
      options: OPTIONS,
    },
  ],
}
