import type Docker from 'dockerode'

export async function pullImage(docker: Docker, image: string): Promise<void> {
  console.log(`📥 Pulling image: ${image}`)
  await new Promise<unknown>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err)
      docker.modem.followProgress(stream, (err: Error | null, output: unknown) => {
        if (err) return reject(err)
        console.log(`✅ Pulled image: ${image}`)
        resolve(output)
      })
    })
  })
}
