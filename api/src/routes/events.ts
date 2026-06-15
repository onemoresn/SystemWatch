import type { FastifyInstance } from 'fastify'
import { db, getSiteByKey, getSiteById, getAllSites } from '../db.js'
import {
  getLatestSsl,
  getLatestUptime,
  getUptimePercent,
} from '../workers/monitors.js'

export async function registerEventRoutes(app: FastifyInstance) {
  app.post('/v1/events', async (req, reply) => {
    const body = req.body as { site_key?: string; events?: Array<Record<string, unknown>> }
    if (!body?.site_key || !Array.isArray(body.events)) {
      return reply.code(400).send({ error: 'site_key and events required' })
    }

    const site = getSiteByKey(body.site_key)
    if (!site) return reply.code(401).send({ error: 'invalid site_key' })

    const insert = db.prepare(
      'INSERT INTO events (site_id, type, path, referrer, payload, ts) VALUES (?, ?, ?, ?, ?, ?)',
    )

    const tx = db.transaction((events: Array<Record<string, unknown>>) => {
      for (const ev of events) {
        const { type, path, referrer, ts, ...rest } = ev
        if (!type || !ts) continue
        insert.run(
          site.id,
          String(type),
          path ? String(path) : null,
          referrer ? String(referrer) : null,
          Object.keys(rest).length ? JSON.stringify(rest) : null,
          Number(ts),
        )
      }
    })

    tx(body.events)
    return { ok: true, received: body.events.length }
  })

  app.post('/v1/integrations/github/webhook', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const event = String(body.event ?? 'unknown')
    const siteDomain = body.site ? String(body.site) : null
    const repo = body.repo ? String(body.repo) : null
    const sha = body.sha ? String(body.sha) : null

    let siteId: string | null = null
    if (siteDomain) {
      const site = getAllSites().find((s) => s.domain === siteDomain)
      siteId = site?.id ?? null
    }

    db.prepare(
      'INSERT INTO webhook_events (site_id, event, repo, sha, payload) VALUES (?, ?, ?, ?, ?)',
    ).run(siteId, event, repo, sha, JSON.stringify(body))

    return { ok: true }
  })

  app.get('/v1/websites', async () => {
    return getAllSites().map((site) => ({
      id: site.id,
      name: site.name,
      domain: site.domain,
      url: site.url,
      platform: site.platform,
      hosting: site.hosting,
      adminUrl: site.admin_url,
      dnsVerified: site.dns_verified === 1,
    }))
  })

  app.get('/v1/websites/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const site = getSiteById(id)
    if (!site) return reply.code(404).send({ error: 'not found' })
    return siteStatus(site)
  })

  app.get('/v1/dashboard/overview', async () => {
    const sites = getAllSites()
    const since24h = Math.floor(Date.now() / 1000) - 86400

    return {
      sites: sites.map((site) => siteStatus(site)),
      totals: {
        sites: sites.length,
        online: sites.filter((s) => getLatestUptime(s.id)?.status === 1).length,
        events24h: (db.prepare(
          'SELECT COUNT(*) as c FROM events WHERE ts >= ?',
        ).get(since24h) as { c: number }).c,
        alerts: sites.filter((s) => {
          const ssl = getLatestSsl(s.id)
          return ssl && ssl.valid === 0 || (ssl?.days_remaining != null && ssl.days_remaining < 30)
        }).length,
      },
    }
  })

  app.get('/v1/websites/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string }
    const site = getSiteById(id)
    if (!site) return reply.code(404).send({ error: 'not found' })

    const events = db.prepare(
      'SELECT type, path, referrer, payload, ts, received_at FROM events WHERE site_id = ? ORDER BY ts DESC LIMIT 100',
    ).all(id)

    return events
  })

  app.get('/v1/websites/:id/traffic', async (req, reply) => {
    const { id } = req.params as { id: string }
    const site = getSiteById(id)
    if (!site) return reply.code(404).send({ error: 'not found' })

    const since = Math.floor(Date.now() / 1000) - 7 * 86400
    const pageviews = (db.prepare(
      'SELECT COUNT(*) as c FROM events WHERE site_id = ? AND type = ? AND ts >= ?',
    ).get(id, 'pageview', since) as { c: number }).c

    const uniquePaths = (db.prepare(
      'SELECT COUNT(DISTINCT path) as c FROM events WHERE site_id = ? AND type = ? AND ts >= ?',
    ).get(id, 'pageview', since) as { c: number }).c

    const topPages = db.prepare(`
      SELECT path, COUNT(*) as views
      FROM events WHERE site_id = ? AND type = 'pageview' AND ts >= ?
      GROUP BY path ORDER BY views DESC LIMIT 10
    `).all(id, since)

    const customEvents = db.prepare(`
      SELECT type, COUNT(*) as count
      FROM events WHERE site_id = ? AND type NOT IN ('pageview', 'vitals') AND ts >= ?
      GROUP BY type ORDER BY count DESC
    `).all(id, since)

    return { pageviews, uniquePaths, topPages, customEvents }
  })

  app.post('/v1/websites/:id/health-check', async (req, reply) => {
    const { id } = req.params as { id: string }
    const site = getSiteById(id)
    if (!site) return reply.code(404).send({ error: 'not found' })

    const { checkUptime, checkSsl } = await import('../workers/monitors.js')
    const uptime = await checkUptime(site.id, site.url)
    const ssl = await checkSsl(site.id, site.domain)
    return { uptime, ssl }
  })
}

function siteStatus(site: ReturnType<typeof getAllSites>[0]) {
  const uptime = getLatestUptime(site.id)
  const ssl = getLatestSsl(site.id)
  const uptimePercent = getUptimePercent(site.id, 24)
  const since24h = Math.floor(Date.now() / 1000) - 86400
  const events24h = (db.prepare(
    'SELECT COUNT(*) as c FROM events WHERE site_id = ? AND ts >= ?',
  ).get(site.id, since24h) as { c: number }).c

  const lastWebhook = db.prepare(
    'SELECT event, received_at FROM webhook_events WHERE site_id = ? ORDER BY received_at DESC LIMIT 1',
  ).get(site.id) as { event: string; received_at: string } | undefined

  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    url: site.url,
    platform: site.platform,
    hosting: site.hosting,
    adminUrl: site.admin_url,
    ga4PropertyId: site.ga4_property_id,
    dnsVerified: site.dns_verified === 1,
    dnsHost: site.dns_host,
    status: uptime?.status === 1 ? 'online' : 'offline',
    responseMs: uptime?.response_ms ?? null,
    uptimePercent24h: uptimePercent,
    ssl: ssl
      ? {
          valid: ssl.valid === 1,
          expiresAt: ssl.expires_at,
          daysRemaining: ssl.days_remaining,
        }
      : null,
    events24h,
    lastDeploy: lastWebhook?.received_at ?? null,
    lastDeployEvent: lastWebhook?.event ?? null,
  }
}
