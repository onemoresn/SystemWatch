export interface SiteStatus {
  id: string
  name: string
  domain: string
  url: string
  platform: string | null
  hosting: string | null
  adminUrl: string | null
  ga4PropertyId: string | null
  dnsVerified: boolean
  dnsHost: string | null
  status: 'online' | 'offline'
  responseMs: number | null
  uptimePercent24h: number
  ssl: { valid: boolean; expiresAt: string | null; daysRemaining: number | null } | null
  events24h: number
  lastDeploy: string | null
  lastDeployEvent: string | null
}

export interface Overview {
  sites: SiteStatus[]
  totals: {
    sites: number
    online: number
    events24h: number
    alerts: number
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? (
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'
)

export async function fetchOverview(): Promise<Overview> {
  const res = await fetch(`${API_BASE}/v1/dashboard/overview`)
  if (!res.ok) throw new Error('Failed to load dashboard')
  return res.json()
}

export { API_BASE }

export interface CloudStatus {
  enabled: boolean
  cloudUrl: string | null
  connected: boolean
  localEvents24h: number
  cloudEvents24h: number
  pendingPush: number
  lastSyncAt: string | null
  lastSyncSummary: { pushed?: number; cloudEvents24h?: number } | null
  lastError: string | null
}

export async function fetchCloudStatus(): Promise<CloudStatus> {
  const res = await fetch(`${API_BASE}/v1/cloud/status`)
  if (!res.ok) throw new Error('Failed to load cloud status')
  return res.json()
}

export async function runHealthCheck(id: string) {
  const res = await fetch(`${API_BASE}/v1/websites/${id}/health-check`, { method: 'POST' })
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function runCloudSync() {
  const res = await fetch(`${API_BASE}/v1/cloud/sync`, { method: 'POST' })
  const data = await res.json()
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'Cloud sync failed')
  return data
}
