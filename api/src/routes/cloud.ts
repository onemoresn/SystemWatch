import type { FastifyInstance } from 'fastify'
import { db } from '../db.js'
import { getCloudUrl, pullCloudOverview, pushEventsToCloud } from '../workers/cloud-sync.js'

export async function registerCloudRoutes(app: FastifyInstance) {
  app.get('/v1/cloud/status', async () => {
    const cloudUrl = getCloudUrl()
    const since24h = Math.floor(Date.now() / 1000) - 86400
    const localEvents24h = (db.prepare(
      'SELECT COUNT(*) as c FROM events WHERE ts >= ?',
    ).get(since24h) as { c: number }).c

    const pendingPush = (db.prepare(
      'SELECT COUNT(*) as c FROM events WHERE cloud_synced = 0',
    ).get() as { c: number }).c

    const lastSync = db.prepare(
      'SELECT value, updated_at FROM sync_meta WHERE key = ?',
    ).get('last_sync') as { value: string; updated_at: string } | undefined

    const lastError = db.prepare(
      'SELECT value, updated_at FROM sync_meta WHERE key = ?',
    ).get('last_sync_error') as { value: string; updated_at: string } | undefined

    let connected = false
    let cloudEvents24h = 0
    let cloudOverview = null

    if (cloudUrl) {
      try {
        cloudOverview = await pullCloudOverview()
        connected = true
        cloudEvents24h = cloudOverview?.totals?.events24h ?? 0
      } catch {
        connected = false
      }
    }

    return {
      enabled: Boolean(cloudUrl),
      cloudUrl,
      connected,
      localEvents24h,
      cloudEvents24h,
      pendingPush,
      lastSyncAt: lastSync?.updated_at ?? null,
      lastSyncSummary: lastSync ? JSON.parse(lastSync.value) : null,
      lastError: lastError?.value ?? null,
      cloudOverview,
    }
  })

  app.post('/v1/cloud/sync', async () => {
    const cloudUrl = getCloudUrl()
    if (!cloudUrl) {
      return { ok: false, error: 'Cloud sync not configured (set CLOUD_API_URL)' }
    }

    try {
      const pushed = await pushEventsToCloud()
      const cloudOverview = await pullCloudOverview()

      const summary = { pushed, cloudEvents24h: cloudOverview?.totals?.events24h ?? 0 }
      db.prepare(
        'INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      ).run('last_sync', JSON.stringify(summary))
      db.prepare('DELETE FROM sync_meta WHERE key = ?').run('last_sync_error')

      return { ok: true, ...summary, cloudOverview }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      db.prepare(
        'INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      ).run('last_sync_error', message)
      return { ok: false, error: message }
    }
  })
}
