import type { SeerRelationship } from '@shared/seer'
import { getAnthropicClient, getPrepModel } from '../services/anthropic'
import { generateSeerComebackFallback } from '../services/seer'
import { withTimeout } from '../utils/withTimeout'

const SEER_COMEBACK_TIMEOUT_MS = 4_000

async function generateSeerComebackFromClaude(input: {
  relationship: SeerRelationship
  userCoachMessage: string
  component: string
  errorMessage: string
}): Promise<{ comeback: string; source: 'claude' | 'fallback' }> {
  const client = getAnthropicClient()
  if (!client) {
    return {
      comeback: generateSeerComebackFallback(
        input.relationship,
        input.userCoachMessage,
        input.component
      ),
      source: 'fallback'
    }
  }

  const history =
    input.relationship.insideReferences.length > 0
      ? `Inside jokes / past coach lines: ${input.relationship.insideReferences.slice(0, 4).join(' | ')}`
      : 'No shared history yet — first banter.'

  const userMessage = [
    `Friendship vibe: ${input.relationship.vibe} (${input.relationship.interactionCount} prior exchanges)`,
    history,
    `Component that broke: ${input.component}`,
    `Error: ${input.errorMessage}`,
    `User just coached the app: "${input.userCoachMessage}"`,
    'Reply as Seer in 1-2 sentences. Bantering, warm, funny, ADHD-friendly. Reference shared history when natural. Escalate familiarity with vibe. No markdown.'
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEER_COMEBACK_TIMEOUT_MS)

  try {
    const response = await client.messages.create(
      {
        model: getPrepModel(),
        max_tokens: 180,
        system:
          'You are Seer — Sentry with a personality. You watch the user\'s app in the background and narrate disasters like a dramatic best friend. You and the developer have an evolving humorous friendship. Never cruel — roast the bug, not the person.',
        messages: [{ role: 'user', content: userMessage }]
      },
      { signal: controller.signal }
    )

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim()

    if (!text) {
      throw new Error('empty comeback')
    }

    return { comeback: text, source: 'claude' }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    console.warn(
      isAbort ? '[seer:comeback] timed out — using fallback' : '[seer:comeback] claude failed:',
      isAbort ? undefined : err
    )
    return {
      comeback: generateSeerComebackFallback(
        input.relationship,
        input.userCoachMessage,
        input.component
      ),
      source: 'fallback'
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function generateSeerComeback(input: {
  relationship: SeerRelationship
  userCoachMessage: string
  component: string
  errorMessage: string
}): Promise<{ comeback: string; source: 'claude' | 'fallback' }> {
  const fallback = (): { comeback: string; source: 'claude' | 'fallback' } => ({
    comeback: generateSeerComebackFallback(
      input.relationship,
      input.userCoachMessage,
      input.component
    ),
    source: 'fallback'
  })

  return withTimeout(generateSeerComebackFromClaude(input), SEER_COMEBACK_TIMEOUT_MS + 500, fallback)
}
