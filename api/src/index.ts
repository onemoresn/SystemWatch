import Fastify from 'fastify'
import cors from '@fastify/cors'
import fs from 'node:fs'
import path from 'node:path'
import { registerEventRoutes } from './routes/events.js'
import { runAllMonitors } from './workers/monitors.js'
import { verifyDnsRecords } from './workers/dns.js'
import { seedIfEmpty } from './bootstrap.js'
import { resolveProjectPath } from './paths.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? 60000)

async function main() {
  seedIfEmpty()

  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })

  await registerEventRoutes(app)

  const beaconPath = resolveProjectPath('beacon', 'sitecommand-beacon.js')
  app.get('/beacon.js', async (_req, reply) => {
    const js = fs.readFileSync(beaconPath, 'utf-8')
    return reply.type('application/javascript').send(js)
  })

  app.get('/health', async () => ({ ok: true, service: 'sitecommand-api' }))

  await app.listen({ port: PORT, host: HOST })
  console.log(`SiteCommand API listening on http://${HOST}:${PORT}`)

  await runAllMonitors()
  await verifyDnsRecords()
  setInterval(() => {
    runAllMonitors().catch((err) => console.error('Monitor error:', err))
    verifyDnsRecords().catch((err) => console.error('DNS verify error:', err))
  }, MONITOR_INTERVAL_MS)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
