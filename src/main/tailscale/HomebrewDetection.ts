import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'

export function findHomebrew(platform = process.platform, path = process.env.PATH ?? ''): string | null {
  if (platform !== 'darwin') return null
  for (const directory of ['/opt/homebrew/bin', '/usr/local/bin', ...path.split(':').filter(Boolean)]) {
    const candidate = join(directory, 'brew')
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* Not installed at this location. */ }
  }
  return null
}
