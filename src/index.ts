import express, { type Request, type Response } from 'express';
import Docker from 'dockerode';

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

app.listen(3000, () => console.log('API running on 3000'));
