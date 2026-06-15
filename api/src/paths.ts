import fs from 'node:fs'
import path from 'node:path'

/** Resolve paths for monorepo dev (cwd=api/) and Docker production (cwd=/app). */
export function resolveProjectPath(...segments: string[]): string {
  const candidates = [
    path.join(process.cwd(), ...segments),
    path.join(process.cwd(), '..', ...segments),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[0]
}
