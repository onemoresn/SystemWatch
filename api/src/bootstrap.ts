import fs from 'node:fs'
import path from 'node:path'
import { db, getAllSites } from './db.js'

export function seedIfEmpty() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM sites').get() as { c: number }).c
  if (count > 0) return

  const registryPath = path.join(process.cwd(), '..', 'sites', 'registry.json')
  if (!fs.existsSync(registryPath)) {
    console.warn('No registry.json found; skipping seed.')
    return
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))
  const insert = db.prepare(`
    INSERT INTO sites (id, name, domain, url, site_key, platform, hosting, ga4_property_id, admin_url, github_repo, dns_host, dns_value)
    VALUES (@id, @name, @domain, @url, @site_key, @platform, @hosting, @ga4_property_id, @admin_url, @github_repo, @dns_host, @dns_value)
  `)

  for (const site of registry.sites) {
    insert.run({
      id: site.id,
      name: site.name,
      domain: site.domain,
      url: site.url,
      site_key: site.siteKey,
      platform: site.platform ?? null,
      hosting: site.hosting ?? null,
      ga4_property_id: site.ga4PropertyId ?? null,
      admin_url: site.adminUrl ?? null,
      github_repo: site.githubRepo ?? null,
      dns_host: site.dnsVerification?.host ?? null,
      dns_value: site.dnsVerification?.value ?? null,
    })
  }

  console.log(`Bootstrapped ${registry.sites.length} sites from registry.`)
}
