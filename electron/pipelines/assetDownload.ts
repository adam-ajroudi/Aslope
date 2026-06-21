import { mkdir, writeFile } from 'fs/promises'
import { dirname, extname } from 'path'

export async function downloadImageToFile(cdnUrl: string, destPath: string): Promise<void> {
  const response = await fetch(cdnUrl)
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status}): ${cdnUrl}`)
  }

  const ext = extname(new URL(cdnUrl).pathname) || '.jpeg'
  const finalPath = extname(destPath) ? destPath : `${destPath}${ext}`

  await mkdir(dirname(finalPath), { recursive: true })
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(finalPath, buffer)
}

export function cacheImagePath(
  cacheRoot: string,
  userId: string,
  trigger: string,
  index: number
): string {
  return `${cacheRoot}/${userId}/${trigger}/${index}.jpeg`
}
