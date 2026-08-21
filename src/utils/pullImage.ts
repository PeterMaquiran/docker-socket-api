import type Docker from 'dockerode'
import { getRegistryAuth, isPrivateRegistry } from './registryAuth.js'

export type ImagePullErrorCode = 'REGISTRY_AUTH' | 'IMAGE_NOT_FOUND' | 'PULL_FAILED'

export class ImagePullError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: ImagePullErrorCode,
  ) {
    super(message)
    this.name = 'ImagePullError'
  }
}

function classifyPullError(err: unknown, image: string): ImagePullError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  const hasCreds = Boolean(process.env.REGISTRY_USERNAME && process.env.REGISTRY_PASSWORD)

  if (
    lower.includes('no basic auth credentials') ||
    lower.includes('authentication required') ||
    lower.includes('unauthorized') ||
    lower.includes('access denied') ||
    lower.includes('401')
  ) {
    const hint = hasCreds
      ? `Registry rejected credentials while pulling ${image}. Check REGISTRY_USERNAME and REGISTRY_PASSWORD.`
      : `Private registry requires login to pull ${image}. Set REGISTRY_USERNAME and REGISTRY_PASSWORD, or run docker login on the host.`

    return new ImagePullError(hint, 502, 'REGISTRY_AUTH')
  }

  if (
    lower.includes('manifest unknown') ||
    lower.includes('not found') ||
    lower.includes('no such image')
  ) {
    return new ImagePullError(`Image not found: ${image}`, 404, 'IMAGE_NOT_FOUND')
  }

  return new ImagePullError(`Failed to pull image ${image}: ${message}`, 502, 'PULL_FAILED')
}

export async function pullImage(docker: Docker, image: string): Promise<void> {
  console.log(`📥 Pulling image: ${image}`)

  const authconfig = getRegistryAuth(image)
  if (!authconfig && isPrivateRegistry(image)) {
    console.warn(
      '⚠️ REGISTRY_USERNAME / REGISTRY_PASSWORD are not set; private registry pulls may fail',
    )
  }

  try {
    await new Promise<unknown>((resolve, reject) => {
      docker.pull(image, { authconfig }, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error('Docker pull returned no stream'))
        docker.modem.followProgress(stream, (progressErr, output) => {
          if (progressErr) return reject(progressErr)
          console.log(`✅ Pulled image: ${image}`)
          resolve(output)
        })
      })
    })
  } catch (err) {
    console.error(`❌ Failed to pull ${image}:`, err)
    throw classifyPullError(err, image)
  }
}
