import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export async function writeCoreConfiguration(directory: string, port: number, allowedRoots: string[]): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)

  const destination = join(directory, 'config.json')
  const temporaryPath = join(directory, `config.${process.pid}.${randomUUID()}.tmp`)
  const contents = `${JSON.stringify({ host: '127.0.0.1', port, allowedRoots }, null, 2)}\n`
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
