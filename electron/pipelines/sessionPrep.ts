import { PREP_JSON_SCHEMA, parsePrepJson, type SessionPrepResult } from '@shared/prepSchema'
import type { Profile } from '@shared/types'
import { getAnthropicClient, getPrepModel } from '../services/anthropic'
import { getMemoryContextForPrep } from '../services/agentMemory'
import { getHardcodedPrep } from './prepFallback'

const PREP_SYSTEM_PROMPT = `You are the voice coach for Anchor Vision, a camera-driven focus app that nudges people when they slouch or reach for their phone.

Given the user's task intent and interests, produce personalized coaching lines for a focus session.

Output JSON only — no markdown fences, no preamble, no commentary.

Schema:
${PREP_JSON_SCHEMA}

Rules:
- Produce 4–6 coaching lines per trigger (slouch, phone) and 2 image prompts per trigger.
- Each coaching line must be EXACTLY 2 sentences. Spoken-aloud friendly for text-to-speech.
- Tone: wildly creative, weird, funny, slightly unhinged — but never cruel or shaming.
- Slouch themes: aging spine, looking old from hunching, ADHD bodies melting into laptops, laptop-sitting is commendable but slouching compounds, vertebrae filing complaints, entropy winning.
- Phone themes: dopamine baseline inflation, phone as slot machine, scrolling is not rest, ADHD brain needing louder hits, wasting focus tokens, commendable laptop work vs phone escape.
- Randomize energy — each line should feel distinct, not templated.
- Image prompts: surreal cinematic Midjourney stills themed to interests and task intent.
  Slouch = posture/spine/desk melt. Phone = distraction/glow/dopamine pull.`

export type RunSessionPrepInput = {
  profile: Profile
  taskIntent: string
}

export type RunSessionPrepOutput = {
  prep: SessionPrepResult
  source: 'claude' | 'fallback'
}

export async function runSessionPrep(input: RunSessionPrepInput): Promise<RunSessionPrepOutput> {
  const client = getAnthropicClient()

  if (!client) {
    console.warn('[prep] no API key — using fallback')
    return { prep: getHardcodedPrep(input.taskIntent), source: 'fallback' }
  }

  const memoryContext = await getMemoryContextForPrep(input.profile.userId)

  const userMessage = [
    `Task intent: ${input.taskIntent}`,
    `Interests: ${input.profile.interests.length > 0 ? input.profile.interests.join(', ') : 'ADHD, desk work, posture, dopamine, focus'}`,
    `Prior agent memory:\n${memoryContext}`
  ].join('\n\n')

  try {
    const response = await client.messages.create({
      model: getPrepModel(),
      max_tokens: 2500,
      system: PREP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const parsed = parsePrepJson(text)
    if (!parsed) {
      console.warn('[prep] failed to parse Claude JSON — using fallback')
      return { prep: getHardcodedPrep(input.taskIntent), source: 'fallback' }
    }

    console.log('[prep:claude] ok', {
      slouchQuotes: parsed.quotes.slouch.length,
      phoneQuotes: parsed.quotes.phone.length
    })

    return { prep: parsed, source: 'claude' }
  } catch (err) {
    console.error('[prep:claude] failed:', err)
    return { prep: getHardcodedPrep(input.taskIntent), source: 'fallback' }
  }
}
