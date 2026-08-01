import express, { type Request, type Response } from 'express';
import Docker from 'dockerode';
import { UpdateComposeBody } from './type.js';
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();
app.use(express.json());

interface UpdateServiceBody {
  service?: string;
  image?: string;
}

app.post('/update-service', async (req: Request<object, object, UpdateServiceBody>, res: Response) => {
  const { service, image } = req.body;
  if (!service || !image) return res.status(400).json({ error: 'Missing params' });

  try {
    console.log(`📥 Pulling image: ${image}`);
    await new Promise<unknown>((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err: Error | null, output: unknown) => {
          if (err) return reject(err);
          console.log(`✅ Pulled image: ${image}`);
          resolve(output);
        });
      });
    });

    console.log(`🔍 Inspecting service: ${service}`);
    const svc = docker.getService(service);
    const info = await svc.inspect();

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
    };

    console.log('📦 New service spec (diffs applied):');
    console.dir(spec, { depth: 5 });

    console.log(`🚀 Updating service with version index: ${info.Version.Index}`);
    const response = await svc.update({
      ...spec,
      version: info.Version.Index,
    });

    console.log('🔧 Docker API response:');
    console.dir(response, { depth: 5 });

    res.json({ message: `✅ Service ${service} updated and redeployed with ${image}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error updating service:', err);
    res.status(500).json({ error: message });
  }
});

app.post('/update-compose-service', async (
  req: Request<object, object, UpdateComposeBody>,
  res: Response
) => {

  const { service, image } = req.body;

  if (!service || !image) {
    return res.status(400).json({
      error: 'Missing params'
    });
  }

  try {

    // Pull new image
    console.log(`📥 Pulling ${image}`);

    await new Promise((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {

        if (err) return reject(err);

        docker.modem.followProgress(
          stream,
          (err) => {
            if (err) reject(err);
            else resolve(true);
          }
        );

      });
    });

    // Find compose container
    const containers = await docker.listContainers({
      all: true,
      filters: {
        label: [
          `com.docker.compose.service=${service}`
        ]
      }
    });

    if (!containers.length) {
      return res.status(404).json({
        error: `Compose service ${service} not found`
      });
    }

    const oldContainer = docker.getContainer(
      containers[0].Id
    );

    const inspect = await oldContainer.inspect();

    console.log(
      `♻️ Recreating ${inspect.Name}`
    );

    // Stop old container
    await oldContainer.stop()
      .catch(() => {});

    await oldContainer.remove();


    // Create new container
    const newContainer = await docker.createContainer({
      name: inspect.Name.replace('/', ''),
      Image: image,
      Env: inspect.Config.Env,
      Cmd: inspect.Config.Cmd,
      Entrypoint: inspect.Config.Entrypoint,
      HostConfig: inspect.HostConfig,
      Labels: inspect.Config.Labels,
    });

    await newContainer.start();

    res.json({
      message:
        `✅ ${service} updated to ${image}`
    });

  } catch(err) {

    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(err);

    res.status(500).json({
      error: message
    });
  }

});

app.listen(3000, () =>
  console.log('API running on 3000')
);

app.listen(3000, () => console.log('API running on 3000'));
