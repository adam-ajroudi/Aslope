const VIDEO_CONSTRAINTS: MediaStreamConstraints[] = [
  { video: true, audio: false },
  {
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  },
  {
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  }
]

const CAMERA_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new DOMException(message, 'TimeoutError'))
    }, ms)

    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((err: unknown) => {
        window.clearTimeout(timer)
        reject(err)
      })
  })
}

export async function openCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Camera API is not available.', 'NotSupportedError')
  }

  // Pre-flight: if there are no video input devices at all, fail fast instead of
  // letting getUserMedia hang indefinitely (notably on WSL2, where /dev/video*
  // is absent and the request never resolves nor rejects on its own).
  if (await countVideoInputs() === 0) {
    throw new DOMException('No camera device was found.', 'NotFoundError')
  }

  let lastError: unknown

  for (const constraints of VIDEO_CONSTRAINTS) {
    try {
      return await withTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        CAMERA_TIMEOUT_MS,
        'Camera permission timed out. Check Windows Settings → Privacy → Camera, then retry.'
      )
    } catch (err) {
      lastError = err
      const name = err instanceof DOMException ? err.name : ''
      // These are terminal: retrying with different constraints won't help, and
      // for a missing/denied device it only multiplies the time spent hanging.
      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        name === 'TimeoutError' ||
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError'
      ) {
        throw err
      }
    }
  }

  throw lastError ?? new DOMException('No camera device was found.', 'NotFoundError')
}

export async function countVideoInputs(): Promise<number> {
  if (!navigator.mediaDevices?.enumerateDevices) return 0

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'videoinput').length
  } catch {
    return 0
  }
}

export function cameraErrorMessage(
  err: unknown,
  options: { isWsl: boolean; videoInputCount: number }
): string {
  const name = err instanceof DOMException ? err.name : 'UnknownError'

  if (name === 'TimeoutError') {
    return (
      'Camera permission timed out. On Windows, open Settings → Privacy & security → Camera ' +
      'and allow desktop apps. Then click Retry camera, or use Demo feed.'
    )
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return (
      'Camera permission was denied. On Windows: Settings → Privacy & security → Camera → ' +
      'turn on camera access and allow desktop apps.'
    )
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    if (options.isWsl) {
      return (
        'WSL2 cannot see your webcam by default (no /dev/video* devices). ' +
        'Run the app from Windows PowerShell instead, or attach the camera to WSL with usbipd-win.'
      )
    }

    if (options.videoInputCount === 0) {
      return 'No camera devices are visible to the app. Close other apps using the camera and retry.'
    }

    return 'No camera device was found with the requested settings.'
  }

  return err instanceof Error ? err.message : 'Failed to start the camera.'
}
