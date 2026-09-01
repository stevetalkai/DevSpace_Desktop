import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const [userDataPath, projectPath] = process.argv.slice(2)
if (!userDataPath || !projectPath) throw new Error('Usage: node scripts/seed-project-store.mjs <user-data-path> <project-path>')

const canonicalPath = realpathSync(projectPath)
if (!statSync(canonicalPath).isDirectory()) throw new Error('The project path must be a directory')

const configDirectory = join(userDataPath, 'config')
mkdirSync(configDirectory, { recursive: true, mode: 0o700 })
chmodSync(configDirectory, 0o700)
writeFileSync(join(configDirectory, 'projects.json'), `${JSON.stringify({
  version: 1,
  projects: [{
    id: randomUUID(),
    name: basename(canonicalPath),
    path: canonicalPath,
    addedAt: new Date().toISOString(),
    highRisk: false
  }]
}, null, 2)}\n`, { mode: 0o600 })
