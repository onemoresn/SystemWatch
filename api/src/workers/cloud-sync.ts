import { db, getAllSites } from '../db.js'

const DEFAULT_CLOUD_URL = 'https://systemwatch.onrender.com'

export function getCloudUrl(): string | null {
  const url = process.env.CLOUD_API_URL?.trim()
  if (!url) return null
  return url.replace(/\/$/, '')
}

export async function pullCloudOverview() {
  const base = getCloudUrl()
  if (!base) throw new Error('CLOUD_API_URL not set')

  const res = await fetch(`${base}/v1/dashboard/overview`, {
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Cloud API returned ${res.status}`)
  return res.json()
}

export async function pushEventsToCloud(): Promise<number> {
  const base = getCloudUrl()
  if (!base) throw new Error('CLOUD_API_URL not set')

  const sites = getAllSites()
  const siteKeyById = Object.fromEntries(sites.map((s) => [s.id, s.site_key]))

  const rows = db.prepare(
    'SELECT id, site_id, type, path, referrer, payload, ts FROM events WHERE cloud_synced = 0 ORDER BY id LIMIT 500',
  ).all() as Array<{
    id: number
    site_id: string
    type: string
    path: string | null
    referrer: string | null
    payload: string | null
    ts: number
  }>

  if (!rows.length) return 0

  const bySite = new Map<string, Array<Record<string, unknown>>>()
  for (const row of rows) {
    const siteKey = siteKeyById[row.site_id]
    if (!siteKey) continue
    const ev: Record<string, unknown> = {
      type: row.type,
      path: row.path ?? '',
      referrer: row.referrer ?? '',
      ts: row.ts,
    }
    if (row.payload) {
      try {
        const extra = JSON.parse(row.payload)
        Object.assign(ev, extra)
      } catch {
        /* ignore */
      }
    }
    if (!bySite.has(siteKey)) bySite.set(siteKey, [])
    bySite.get(siteKey)!.push(ev)
  }

  const markSynced = db.prepare('UPDATE events SET cloud_synced = 1 WHERE id = ?')
  let pushed = 0

  for (const [siteKey, events] of bySite) {
    const res = await fetch(`${base}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_key: siteKey, events }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`Push failed for ${siteKey}: ${res.status}`)

    const ids = rows.filter((r) => siteKeyById[r.site_id] === siteKey).map((r) => r.id)
    const tx = db.transaction((eventIds: number[]) => {
      for (const id of eventIds) markSynced.run(id)
    })
    tx(ids)
    pushed += events.length
  }

  return pushed
}

export async function runCloudSyncIfEnabled() {
  if (!getCloudUrl()) return
  try {
    const pushed = await pushEventsToCloud()
    const cloudOverview = await pullCloudOverview()
    db.prepare(
      'INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    ).run(
      'last_sync',
      JSON.stringify({ pushed, cloudEvents24h: cloudOverview?.totals?.events24h ?? 0, auto: true }),
    )
    db.prepare('DELETE FROM sync_meta WHERE key = ?').run('last_sync_error')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(
      'INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    ).run('last_sync_error', message)
  }
}
