import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'

export function isDeepgramConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY?.trim())
}

export function getDeepgramVoiceModel(): string {
  return process.env.DEEPGRAM_VOICE_MODEL?.trim() || 'aura-2-thalia-en'
}

export async function synthesizeSpeechToFile(text: string, destPath: string): Promise<void> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not set')
  }

  const model = getDeepgramVoiceModel()
  const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Deepgram TTS failed (${response.status}): ${body}`)
  }

  await mkdir(dirname(destPath), { recursive: true })
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(destPath, buffer)
}
