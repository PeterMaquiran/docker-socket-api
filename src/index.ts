//import 'dotenv/config' // 👈 Place as the FIRST import
import express, { type Request, type Response } from 'express'
import Docker from 'dockerode'
import { UpdateImageBody } from './type.js'
import { ImagePullError, pullImage } from './utils/pullImage.js'
import { getRegistryAuth } from './utils/registryAuth.js'
import { authenticateApiKey } from './middleware/auth.js'

const docker = new Docker({ socketPath: '/var/run/docker.sock' })
const app = express()
app.use(express.json())
app.use(authenticateApiKey)

type ServiceParams = { service: string }

app.post(
  '/swarm/services/:service',
  async (req: Request<ServiceParams, object, UpdateImageBody>, res: Response) => {
    const { service } = req.params
    const { image } = req.body
    if (!image) return res.status(400).json({ error: 'Missing image' })

    if (!image.startsWith('registry.tvone.ao/')) {
      return res.status(400).json({ error: 'invalid image' })
    }

    try {
      await pullImage(docker, image)

      console.log(`🔍 Inspecting service: ${service}`)
      const svc = docker.getService(service)
      const info = await svc.inspect()

      const spec = {
        ...info.Spec,
        TaskTemplate: {
          ...info.Spec.TaskTemplate,
          ContainerSpec: {
            ...info.Spec.TaskTemplate.ContainerSpec,
            Image: image,
          },
          ForceUpdate: (info.Spec.TaskTemplate.ForceUpdate || 0) + 1,
        },
      }

      console.log('📦 New service spec (diffs applied):')
      console.dir(spec, { depth: 5 })

      console.log(`🚀 Updating service with version index: ${info.Version.Index}`)
      const authconfig = getRegistryAuth(image)
      const response = await svc.update({
        ...spec,
        version: info.Version.Index,
        ...(authconfig ? { authconfig } : {}),
      })

      console.log('🔧 Docker API response:')
      console.dir(response, { depth: 5 })

      res.json({ message: `✅ Service ${service} updated and redeployed with ${image}` })
    } catch (err) {
      respondError(res, err, 'Error updating service')
    }
  },
)

app.post(
  '/compose/services/:service',
  async (req: Request<ServiceParams, object, UpdateImageBody>, res: Response) => {
    const { service } = req.params
    const { image } = req.body

    if (!image) {
      return res.status(400).json({
        error: 'Missing image',
      })
    }

    try {
      await pullImage(docker, image)

      const containers = await docker.listContainers({
        all: true,
        filters: {
          label: [`com.docker.compose.service=${service}`],
        },
      })

      if (!containers.length) {
        return res.status(404).json({
          error: `Compose service ${service} not found`,
        })
      }

      const oldContainer = docker.getContainer(containers[0].Id)
      const inspect = await oldContainer.inspect()

      console.log(`♻️ Recreating ${inspect.Name}`)

      await oldContainer.stop().catch(() => {})
      await oldContainer.remove()

      const newContainer = await docker.createContainer({
        name: inspect.Name.replace('/', ''),
        Image: image,
        Env: inspect.Config.Env,
        Cmd: inspect.Config.Cmd,
        Entrypoint: inspect.Config.Entrypoint,
        HostConfig: inspect.HostConfig,
        Labels: inspect.Config.Labels,
      })

      await newContainer.start()

      res.json({
        message: `✅ ${service} updated to ${image}`,
      })
    } catch (err) {
      respondError(res, err, 'Error updating compose service')
    }
  },
)

function respondError(res: Response, err: unknown, logLabel: string) {
  if (err instanceof ImagePullError) {
    console.error(`❌ ${logLabel}:`, err.message)
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    })
  }

  const message = err instanceof Error ? err.message : String(err)
  console.error(`❌ ${logLabel}:`, err)
  return res.status(500).json({ error: message })
}

app.listen(3000, () => console.log('API running on 3000'))
