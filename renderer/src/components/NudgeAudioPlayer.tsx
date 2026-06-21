import { useEffect, useRef } from 'react'

/** Fallback audio output in the main window (macOS/Linux). Windows uses system MediaPlayer. */
export function NudgeAudioPlayer(): React.ReactElement | null {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!window.anchor?.onNudgeAudioPlay) return

    return window.anchor.onNudgeAudioPlay(({ audioPath }) => {
      if (!audioPath) return

      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.volume = 1
      audio.src = audioPath

      void audio.play().catch((err: unknown) => {
        console.warn('[nudge:audio] renderer playback failed:', err)
      })
    })
  }, [])

  return null
}
