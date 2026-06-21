import type { SessionPrepResult } from '@shared/prepSchema'

export function getHardcodedPrep(taskIntent: string): SessionPrepResult {
  const task = taskIntent.trim() || 'your focus session'

  return {
    quotes: {
      slouch: [
        `Your spine is aging in dog years while you hunch over ${task} — commendable dedication, but your vertebrae are writing a Yelp review. Sit up before your posture becomes a personality trait.`,
        'ADHD brains love the laptop lean like it is a weighted blanket for your nervous system. That is valid, but slouching is not self-care — it is your skeleton slowly becoming a question mark.',
        'You are not old yet, but your shoulders are cosplaying as a retired librarian. Straighten up — the screen will still be there when your neck stops filing complaints.',
        'The laptop hunch is the modern meditation pose, except instead of enlightenment you get a compressed disc. Roll those shoulders back like you are rejecting entropy itself.'
      ],
      phone: [
        `The phone is a dopamine IV drip and you just bumped the dose — ${task} can wait thirty seconds, but your baseline cannot. Put it down before your brain needs a louder hit to feel anything.`,
        'Scrolling is not a break — it is a baseline-raising machine disguised as rest. Your ADHD brain will thank you for one boring minute of focus over ten exciting seconds of nothing.',
        'You opened the phone like it owed you money. It does not — it owes you your attention back. Close the tab, close the app, close the loop.',
        'Every glance at the phone raises the floor on what counts as interesting. That is not rest, that is inflation — and you are the economy.'
      ]
    },
    imagePrompts: {
      slouch: [
        `surreal cinematic portrait of a person hunched over laptop aging rapidly, spine curving like a question mark, moody blue ADHD brain fog aesthetic, ${task} theme --ar 16:9`,
        'whimsical illustration of vertebrae protesting with tiny picket signs, desk worker slouching, dark comedy wellness art --ar 16:9'
      ],
      phone: [
        `phone screen glowing like a dopamine slot machine pulling attention from ${task}, cinematic split focus, neon distraction aesthetic --ar 16:9`,
        'surreal art of brain baseline rising like a stock chart while phone glows, ADHD distraction metaphor, moody cinematic --ar 16:9'
      ]
    }
  }
}

export function countQuotes(prep: SessionPrepResult): number {
  return prep.quotes.slouch.length + prep.quotes.phone.length
}
