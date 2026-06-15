import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'
import { registerEventRoutes } from './routes/events.js'
import { registerCloudRoutes } from './routes/cloud.js'
import { runAllMonitors } from './workers/monitors.js'
import { verifyDnsRecords } from './workers/dns.js'
import { runCloudSyncIfEnabled } from './workers/cloud-sync.js'
import { seedIfEmpty } from './bootstrap.js'
import { resolveProjectPath } from './paths.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? 60000)
const CLOUD_SYNC_INTERVAL_MS = Number(process.env.CLOUD_SYNC_INTERVAL_MS ?? 300000)

async function main() {
  seedIfEmpty()

  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })

  await registerEventRoutes(app)
  await registerCloudRoutes(app)

  const beaconPath = resolveProjectPath('beacon', 'sitecommand-beacon.js')
  app.get('/beacon.js', async (_req, reply) => {
    const js = fs.readFileSync(beaconPath, 'utf-8')
    return reply.type('application/javascript').send(js)
  })

  app.get('/health', async () => ({ ok: true, service: 'sitecommand-api' }))

  const webDist = resolveProjectPath('web', 'dist')
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist })
    app.get('/', async (_req, reply) => {
      return reply.sendFile('index.html', webDist)
    })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/v1') || req.url.startsWith('/beacon')) {
        return reply.code(404).send({ error: 'not found' })
      }
      const ext = path.extname(req.url.split('?')[0])
      if (ext && ext !== '.html') {
        return reply.code(404).send({ error: 'not found' })
      }
      return reply.sendFile('index.html', webDist)
    })
  } else {
    console.warn(`Dashboard not found at ${webDist}`)
  }

  await app.listen({ port: PORT, host: HOST })
  console.log(`SiteCommand API listening on http://${HOST}:${PORT}`)

  await runAllMonitors()
  await verifyDnsRecords()
  setInterval(() => {
    runAllMonitors().catch((err) => console.error('Monitor error:', err))
    verifyDnsRecords().catch((err) => console.error('DNS verify error:', err))
  }, MONITOR_INTERVAL_MS)

  if (process.env.CLOUD_API_URL) {
    runCloudSyncIfEnabled().catch((err) => console.error('Cloud sync error:', err))
    setInterval(() => {
      runCloudSyncIfEnabled().catch((err) => console.error('Cloud sync error:', err))
    }, CLOUD_SYNC_INTERVAL_MS)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
