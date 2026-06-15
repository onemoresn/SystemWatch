import fs from 'node:fs'
import path from 'node:path'

/** Resolve paths for monorepo dev, Docker, and desktop bundle (SITECOMMAND_ROOT). */
export function resolveProjectPath(...segments: string[]): string {
  const root = process.env.SITECOMMAND_ROOT
  const candidates = root
    ? [path.join(root, ...segments)]
    : [
        path.join(process.cwd(), ...segments),
        path.join(process.cwd(), '..', ...segments),
      ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[0]
}

export function getProjectRoot(): string {
  if (process.env.SITECOMMAND_ROOT) return process.env.SITECOMMAND_ROOT
  const sites = resolveProjectPath('sites', 'registry.json')
  if (fs.existsSync(sites)) return path.dirname(path.dirname(sites))
  return process.cwd()
}
