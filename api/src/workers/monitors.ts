import tls from 'node:tls'
import { db, getAllSites } from '../db.js'

export async function checkUptime(siteId: string, url: string) {
  const start = Date.now()
  let status = 0
  let statusCode: number | null = null

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    statusCode = res.status
    status = res.ok ? 1 : 0
  } catch {
    status = 0
  }

  const responseMs = Date.now() - start
  db.prepare(
    'INSERT INTO uptime_checks (site_id, status, response_ms, status_code) VALUES (?, ?, ?, ?)',
  ).run(siteId, status, responseMs, statusCode)

  return { status, responseMs, statusCode }
}

export async function checkSsl(siteId: string, domain: string) {
  return new Promise<{ valid: boolean; expiresAt: string | null; daysRemaining: number | null }>((resolve) => {
    const socket = tls.connect({ host: domain, port: 443, servername: domain, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()

      if (!cert?.valid_to) {
        db.prepare('INSERT INTO ssl_checks (site_id, valid, expires_at, days_remaining) VALUES (?, 0, NULL, NULL)').run(siteId)
        resolve({ valid: false, expiresAt: null, daysRemaining: null })
        return
      }

      const expiresAt = new Date(cert.valid_to)
      const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
      const valid = daysRemaining > 0

      db.prepare(
        'INSERT INTO ssl_checks (site_id, valid, expires_at, days_remaining) VALUES (?, ?, ?, ?)',
      ).run(siteId, valid ? 1 : 0, expiresAt.toISOString(), daysRemaining)

      resolve({ valid, expiresAt: expiresAt.toISOString(), daysRemaining })
    })

    socket.on('error', () => {
      db.prepare('INSERT INTO ssl_checks (site_id, valid, expires_at, days_remaining) VALUES (?, 0, NULL, NULL)').run(siteId)
      resolve({ valid: false, expiresAt: null, daysRemaining: null })
    })
  })
}

export async function runAllMonitors() {
  const sites = getAllSites()
  for (const site of sites) {
    await checkUptime(site.id, site.url)
    await checkSsl(site.id, site.domain)
  }
}

export function getUptimePercent(siteId: string, hours = 24): number {
  const row = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as up
    FROM uptime_checks
    WHERE site_id = ? AND checked_at >= datetime('now', '-' || ? || ' hours')
  `).get(siteId, hours) as { total: number; up: number | null }

  if (!row.total) return 100
  return Math.round(((row.up ?? 0) / row.total) * 1000) / 10
}

export function getLatestUptime(siteId: string) {
  return db.prepare(
    'SELECT * FROM uptime_checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
  ).get(siteId) as { status: number; response_ms: number; status_code: number | null; checked_at: string } | undefined
}

export function getLatestSsl(siteId: string) {
  return db.prepare(
    'SELECT * FROM ssl_checks WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1',
  ).get(siteId) as { valid: number; expires_at: string | null; days_remaining: number | null; checked_at: string } | undefined
}
