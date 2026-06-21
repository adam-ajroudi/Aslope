import { getAnthropicClient, getPrepModel } from './anthropic'

const MCP_BETA = 'mcp-client-2025-11-20'

export function isMidjourneyConfigured(): boolean {
  return Boolean(
    process.env.MIDJOURNEY_MCP_URL?.trim() && process.env.MIDJOURNEY_OAUTH_TOKEN?.trim()
  )
}

export function getMidjourneyPrepLimit(): number {
  const raw = Number(process.env.MIDJOURNEY_PREP_LIMIT ?? '4')
  if (!Number.isFinite(raw) || raw < 0) return 4
  return Math.min(Math.floor(raw), 8)
}

export async function generateImageFromPrompt(prompt: string): Promise<string | null> {
  const client = getAnthropicClient()
  const mcpUrl = process.env.MIDJOURNEY_MCP_URL?.trim()
  const token = process.env.MIDJOURNEY_OAUTH_TOKEN?.trim()

  if (!client || !mcpUrl || !token) {
    console.warn('[midjourney] not configured — skipping image generation')
    return null
  }

  try {
    const response = await client.beta.messages.create({
      model: getPrepModel(),
      max_tokens: 1024,
      betas: [MCP_BETA],
      system:
        'You generate images with Midjourney. Call generate_image exactly once with the user prompt. ' +
        'Do not reply with text unless the tool fails.',
      messages: [
        {
          role: 'user',
          content: `Generate this image with Midjourney generate_image:\n${prompt}`
        }
      ],
      mcp_servers: [
        {
          type: 'url',
          name: 'midjourney',
          url: mcpUrl,
          authorization_token: token
        }
      ],
      tools: [{ type: 'mcp_toolset', mcp_server_name: 'midjourney' }]
    })

    const cdnUrl = extractCdnUrl(response.content)
    if (cdnUrl) {
      console.log('[midjourney] generated', cdnUrl.slice(0, 80) + '…')
      return cdnUrl
    }

    console.warn('[midjourney] no cdn_url in response')
    return null
  } catch (err) {
    console.error('[midjourney] generate failed:', err)
    return null
  }
}

function extractCdnUrl(content: unknown): string | null {
  const text = JSON.stringify(content)
  const match = text.match(/https:\/\/cdn\.midjourney\.com\/[^"\\]+/)
  return match?.[0] ?? null
}
