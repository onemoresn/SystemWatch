import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { resolveProjectPath } from './paths.js'

const dataDir = path.join(resolveProjectPath('api', 'data'))
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DATABASE_PATH ?? path.join(dataDir, 'sitecommand.db')
export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    site_key TEXT NOT NULL UNIQUE,
    platform TEXT,
    hosting TEXT,
    ga4_property_id TEXT,
    admin_url TEXT,
    github_repo TEXT,
    dns_host TEXT,
    dns_value TEXT,
    dns_verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT,
    referrer TEXT,
    payload TEXT,
    ts INTEGER NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );

  CREATE TABLE IF NOT EXISTS uptime_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    status INTEGER NOT NULL,
    response_ms INTEGER,
    status_code INTEGER,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );

  CREATE TABLE IF NOT EXISTS ssl_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    valid INTEGER NOT NULL,
    expires_at TEXT,
    days_remaining INTEGER,
    checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (site_id) REFERENCES sites(id)
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT,
    event TEXT NOT NULL,
    repo TEXT,
    sha TEXT,
    payload TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_site_ts ON events(site_id, ts);
  CREATE INDEX IF NOT EXISTS idx_uptime_site ON uptime_checks(site_id, checked_at);
`)

export interface SiteRow {
  id: string
  name: string
  domain: string
  url: string
  site_key: string
  platform: string | null
  hosting: string | null
  ga4_property_id: string | null
  admin_url: string | null
  github_repo: string | null
  dns_host: string | null
  dns_value: string | null
  dns_verified: number
}

export function getSiteByKey(siteKey: string): SiteRow | undefined {
  return db.prepare('SELECT * FROM sites WHERE site_key = ?').get(siteKey) as SiteRow | undefined
}

export function getSiteById(id: string): SiteRow | undefined {
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
}

export function getAllSites(): SiteRow[] {
  return db.prepare('SELECT * FROM sites ORDER BY name').all() as SiteRow[]
}
