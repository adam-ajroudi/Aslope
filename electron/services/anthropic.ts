import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[anthropic] ANTHROPIC_API_KEY not set')
    return null
  }

  if (!client) {
    client = new Anthropic({ apiKey })
  }

  return client
}

export function getPrepModel(): string {
  return process.env.ANTHROPIC_PREP_MODEL?.trim() || 'claude-haiku-4-5'
}
