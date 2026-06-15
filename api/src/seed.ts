import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { resolveProjectPath } from './paths.js'

const registryPath = resolveProjectPath('sites', 'registry.json')
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))

const insert = db.prepare(`
  INSERT INTO sites (id, name, domain, url, site_key, platform, hosting, ga4_property_id, admin_url, github_repo, dns_host, dns_value)
  VALUES (@id, @name, @domain, @url, @site_key, @platform, @hosting, @ga4_property_id, @admin_url, @github_repo, @dns_host, @dns_value)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    domain = excluded.domain,
    url = excluded.url,
    site_key = excluded.site_key,
    platform = excluded.platform,
    hosting = excluded.hosting,
    ga4_property_id = excluded.ga4_property_id,
    admin_url = excluded.admin_url,
    github_repo = excluded.github_repo,
    dns_host = excluded.dns_host,
    dns_value = excluded.dns_value
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

console.log(`Seeded ${registry.sites.length} sites from registry.`)
