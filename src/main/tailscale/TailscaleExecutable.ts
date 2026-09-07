import { accessSync, constants, realpathSync } from 'node:fs'
import { delimiter, join, win32 } from 'node:path'

/** Never execute a macOS GUI bundle, including a CLI symlink pointing into one. */
export function findTailscaleExecutable(platform = process.platform, path = process.env.PATH ?? ''): string {
  const name = platform === 'win32' ? 'tailscale.exe' : 'tailscale'
  const directories = platform === 'win32'
    ? [...new Set([process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter((value): value is string => Boolean(value)))].map((directory) => win32.join(directory, 'Tailscale'))
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
  for (const directory of [...directories, ...path.split(platform === 'win32' ? ';' : delimiter).filter(Boolean)]) {
    const candidate = platform === 'win32' ? win32.join(directory, name) : join(directory, name)
    try {
      const resolved = realpathSync(candidate)
      if (platform === 'darwin' && /\.app\//i.test(resolved)) continue
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* Try the next installation location. */ }
  }
  // Do not fall back to PATH: it may contain a symlink to the GUI executable.
  throw Object.assign(new Error('Tailscale command-line client not installed'), { code: 'ENOENT' })
}
