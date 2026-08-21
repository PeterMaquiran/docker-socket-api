export type RegistryAuthConfig = {
  username: string
  password: string
  serveraddress: string
}

export function registryHostFromImage(image: string): string {
  const slash = image.indexOf('/')
  if (slash === -1) return 'https://index.docker.io/v1/'

  const host = image.slice(0, slash)
  if (host.includes('.') || host.includes(':') || host === 'localhost') {
    return host
  }

  return 'https://index.docker.io/v1/'
}

export function isPrivateRegistry(image: string): boolean {
  return registryHostFromImage(image) !== 'https://index.docker.io/v1/'
}

export function getRegistryAuth(image: string): RegistryAuthConfig | undefined {
  const username = process.env.REGISTRY_USERNAME
  const password = process.env.REGISTRY_PASSWORD
  if (!username || !password) return undefined

  return {
    username,
    password,
    serveraddress: registryHostFromImage(image),
  }
}
