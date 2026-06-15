import { useCallback, useEffect, useState } from 'react'
import { fetchOverview, runHealthCheck, fetchCloudStatus, runCloudSync, API_BASE, type Overview, type CloudStatus, SiteStatus } from './api'

function StatusDot({ status }: { status: string }) {
  const color = status === 'online' ? 'var(--green)' : 'var(--red)'
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: status === 'online' ? `0 0 8px ${color}` : 'none',
      }}
    />
  )
}

function SiteCard({
  site,
  onHealthCheck,
  checking,
}: {
  site: SiteStatus
  onHealthCheck: (id: string) => void
  checking: string | null
}) {
  const sslWarning =
    site.ssl && (!site.ssl.valid || (site.ssl.daysRemaining != null && site.ssl.daysRemaining < 30))

  return (
    <article
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <StatusDot status={site.status} />
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{site.name}</h2>
      </div>
      <a href={site.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.9rem' }}>
        {site.domain}
      </a>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          <div style={{ color: 'var(--muted)' }}>Uptime (24h)</div>
          <div style={{ fontWeight: 700 }}>{site.uptimePercent24h}%</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)' }}>Response</div>
          <div style={{ fontWeight: 700 }}>{site.responseMs != null ? `${site.responseMs} ms` : '—'}</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)' }}>Events (24h)</div>
          <div style={{ fontWeight: 700 }}>{site.events24h}</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)' }}>SSL</div>
          <div style={{ fontWeight: 700, color: sslWarning ? 'var(--amber)' : 'var(--green)' }}>
            {site.ssl
              ? site.ssl.valid
                ? `${site.ssl.daysRemaining ?? '?'}d left`
                : 'Invalid'
              : '—'}
          </div>
        </div>
      </div>

      {site.lastDeploy && (
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Last deploy: {site.lastDeployEvent} · {new Date(site.lastDeploy).toLocaleString()}
        </div>
      )}

      {!site.dnsVerified && site.dnsHost && (
        <div
          style={{
            fontSize: '0.78rem',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid var(--amber)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            color: 'var(--muted)',
          }}
        >
          DNS TXT pending: <code>{site.dnsHost}</code>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#fff',
            textDecoration: 'none',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          Open site
        </a>
        {site.adminUrl && (
          <a
            href={site.adminUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              color: 'var(--text)',
              textDecoration: 'none',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            Admin
          </a>
        )}
        <button
          type="button"
          disabled={checking === site.id}
          onClick={() => onHealthCheck(site.id)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          {checking === site.id ? 'Checking…' : 'Health check'}
        </button>
      </div>
    </article>
  )
}

function CloudSyncPanel({
  cloud,
  syncing,
  onSync,
}: {
  cloud: CloudStatus | null
  syncing: boolean
  onSync: () => void
}) {
  if (!cloud?.enabled) return null

  const statusColor = cloud.connected ? 'var(--green)' : 'var(--red)'
  const statusLabel = cloud.connected ? 'Connected' : 'Unreachable'

  return (
    <section
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Cloud sync</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
          {' · '}
          {cloud.cloudUrl?.replace(/^https?:\/\//, '')}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
          Local events (24h): {cloud.localEvents24h} · Cloud: {cloud.cloudEvents24h}
          {cloud.pendingPush > 0 ? ` · ${cloud.pendingPush} pending push` : ''}
          {cloud.lastSyncAt ? ` · Last sync: ${new Date(cloud.lastSyncAt).toLocaleString()}` : ''}
        </div>
        {cloud.lastError && (
          <div style={{ fontSize: '0.8rem', color: 'var(--red)', marginTop: '0.35rem' }}>
            {cloud.lastError}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={syncing || !cloud.connected}
        onClick={onSync}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 8,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.85rem',
          opacity: syncing || !cloud.connected ? 0.6 : 1,
        }}
      >
        {syncing ? 'Syncing…' : 'Sync now'}
      </button>
    </section>
  )
}

export default function App() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [checking, setChecking] = useState<string | null>(null)
  const [cloud, setCloud] = useState<CloudStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await fetchOverview())
      try {
        setCloud(await fetchCloudStatus())
      } catch {
        setCloud(null)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleHealthCheck = async (id: string) => {
    setChecking(id)
    try {
      await runHealthCheck(id)
      await load()
    } finally {
      setChecking(null)
    }
  }

  const handleCloudSync = async () => {
    setSyncing(true)
    try {
      await runCloudSync()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cloud sync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'var(--navy)',
          color: '#fff',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>
            Site<span style={{ color: '#93c5fd' }}>Command</span>
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>
            Website command center · {API_BASE.replace(/^https?:\/\//, '')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#fff',
            padding: '0.4rem 0.75rem',
            borderRadius: 8,
            fontSize: '0.85rem',
          }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
        {error && (
          <div style={{ color: 'var(--red)', marginBottom: '1rem' }}>
            {error} — is the API running on port 3001?
          </div>
        )}

        {data && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              {[
                { label: 'Sites', value: data.totals.sites },
                { label: 'Online', value: data.totals.online },
                { label: 'Events (24h)', value: data.totals.events24h },
                { label: 'Alerts', value: data.totals.alerts },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '1rem',
                  }}
                >
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{kpi.label}</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            <CloudSyncPanel cloud={cloud} syncing={syncing} onSync={handleCloudSync} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1rem',
              }}
            >
              {data.sites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onHealthCheck={handleHealthCheck}
                  checking={checking}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
