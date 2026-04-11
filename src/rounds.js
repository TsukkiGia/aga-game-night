import charades        from './rounds/charades.js'
import guessTheLanguage from './rounds/guessTheLanguage.js'
import guessTheSong    from './rounds/guessTheSong.js'
import slangBee         from './rounds/slangBee.js'
import thesisTranslator from './rounds/thesisTranslator.js'

const rounds = [guessTheLanguage, charades, slangBee, thesisTranslator, guessTheSong]

export default rounds.map((r, i) => ({
  ...r,
  id: String(r.id || r.type || `round-${i + 1}`),
  label: `Round ${i + 1}`,
}))
