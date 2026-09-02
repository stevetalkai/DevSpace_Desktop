import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export async function writeCoreConfiguration(
  directory: string,
  port: number,
  allowedRoots: string[],
  publicBaseUrl: string | null = null
): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)

  const legacyConfiguration: Record<string, unknown> = { host: '127.0.0.1', port, allowedRoots }
  if (publicBaseUrl) legacyConfiguration.publicBaseUrl = publicBaseUrl

  const modernConfiguration = {
    $schema: 'https://raw.githubusercontent.com/Waishnav/devspace/main/schema/v1/devspace.schema.json',
    configVersion: 1,
    server: {
      host: '127.0.0.1',
      port,
      ...(publicBaseUrl ? { publicBaseUrl } : {}),
      allowedHosts: [],
      trustProxy: false
    },
    workspaces: { allowedRoots, worktreeRoot: '~/.devspace/worktrees' },
    storage: { stateDir: '~/.local/share/devspace' },
    tools: { mode: 'codex' },
    ui: { enabled: true },
    artifacts: { enabled: false, maxFileBytes: 104_857_600 },
    skills: { enabled: true, paths: [], agentDir: '~/.codex' },
    subagents: { enabled: false, providers: [] },
    logging: {
      level: 'debug',
      format: 'json',
      requests: true,
      assets: false,
      toolCalls: true,
      shellCommands: true
    },
    oauth: {
      accessTokenTtlSeconds: 3_600,
      refreshTokenTtlSeconds: 2_592_000,
      scopes: ['devspace'],
      allowedRedirectHosts: ['chatgpt.com', 'localhost', '127.0.0.1']
    }
  }

  await writePrivateJson(directory, 'config.json', legacyConfiguration)
  await writePrivateJson(directory, 'config.jsonc', modernConfiguration)
}

async function writePrivateJson(directory: string, fileName: string, configuration: unknown): Promise<void> {
  const destination = join(directory, fileName)
  const temporaryPath = join(directory, `config.${process.pid}.${randomUUID()}.tmp`)
  const contents = `${JSON.stringify(configuration, null, 2)}\n`
  let temporaryFile

  try {
    temporaryFile = await open(temporaryPath, 'wx', 0o600)
    await temporaryFile.writeFile(contents, 'utf8')
    await temporaryFile.sync()
    await temporaryFile.close()
    temporaryFile = undefined
    await rename(temporaryPath, destination)
    await chmod(destination, 0o600)
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}
