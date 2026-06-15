import dns from 'node:dns/promises'
import { db, getAllSites } from '../db.js'

export async function verifyDnsRecords() {
  for (const site of getAllSites()) {
    if (!site.dns_host || !site.dns_value) continue

    let verified = false
    try {
      const records = await dns.resolveTxt(site.dns_host)
      const flat = records.map((r) => r.join(''))
      verified = flat.some((v) => v.includes(site.dns_value!))
    } catch {
      verified = false
    }

    db.prepare('UPDATE sites SET dns_verified = ? WHERE id = ?').run(verified ? 1 : 0, site.id)
  }
}
