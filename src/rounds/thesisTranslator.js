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
  ],
  scoring: [
    { label: 'Funny', points: 3 },
    { label: 'Not Funny',  points: 0 },
  ],
  questions: [
    {
      id: 'r4q1',
      title: 'Fantastic yeasts and where to find them: the hidden diversity of dimorphic fungal pathogens',
      options: OPTIONS,
    },
    {
      id: 'r4q2',
      title: 'Horizontal gene transfer of an entire metabolic pathway between a eukaryotic alga and its DNA virus',
      options: OPTIONS,
    },
    {
      id: 'r4q3',
      title: 'TensorFlow: Large-Scale Machine Learning on Heterogeneous Distributed Systems',
      options: OPTIONS,
    },
    {
      id: 'r4q4',
      title: 'You Only Look Once: Unified, Real-Time Object Detection',
      options: OPTIONS,
    },
    {
      id: 'r4q5',
      title: 'Designing passive stability in mountain goat-inspired robot hooves for traversing slopes',
      options: OPTIONS,
    },
    {
      id: 'r4q6',
      title: 'Taking Pop-Ups Seriously: The Jurisprudence of the Infield Fly Rule',
      options: OPTIONS,
    },
    {
      id: 'r4q7',
      title: 'Aggregation Analysis in Copyright Infringement Claims: The Fate of Fictional Facts',
      options: OPTIONS,
    },
    {
      id: 'r4q8',
      title: 'Innovation Killers: How Financial Tools Destroy Your Capacity to Do New Things',
      options: OPTIONS,
    },
  ],
}
