import { randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const OWNER_TOKEN_BYTES = 32

export const OWNER_TOKEN_ENCRYPTION_UNAVAILABLE = 'Owner token encryption is unavailable.'
export const OWNER_TOKEN_INVALID_CIPHERTEXT = 'The stored owner token is invalid or cannot be decrypted.'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface OwnerTokenStoreOptions {
  randomBytes?: (size: number) => Buffer
}

export class OwnerTokenStore {
  private readonly tokenFilePath: string
  private readonly safeStorage: SafeStorageLike
  private readonly createRandomBytes: (size: number) => Buffer

  constructor(tokenFilePath: string, safeStorage: SafeStorageLike, options: OwnerTokenStoreOptions = {}) {
    this.tokenFilePath = resolve(tokenFilePath)
    this.safeStorage = safeStorage
    this.createRandomBytes = options.randomBytes ?? randomBytes
  }

  async getOrCreate(): Promise<string> {
    this.requireEncryption()

    try {
      const encodedCiphertext = await readFile(this.tokenFilePath, 'utf8')
      return this.decrypt(encodedCiphertext)
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    }

    return this.rotate()
  }

  async rotate(): Promise<string> {
    this.requireEncryption()

    const tokenBytes = this.createRandomBytes(OWNER_TOKEN_BYTES)
    if (tokenBytes.byteLength < OWNER_TOKEN_BYTES) {
      throw new Error('The owner token random source returned fewer than 32 bytes.')
    }

    const token = tokenBytes.toString('hex')
    const ciphertext = this.safeStorage.encryptString(token)
    if (ciphertext.byteLength === 0) throw new Error(OWNER_TOKEN_INVALID_CIPHERTEXT)

    await this.writeCiphertext(ciphertext.toString('base64'))
    return token
  }

  private requireEncryption(): void {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error(OWNER_TOKEN_ENCRYPTION_UNAVAILABLE)
    }
  }

  private decrypt(encodedCiphertext: string): string {
    const normalized = encodedCiphertext.trim()
    if (!isCanonicalBase64(normalized)) throw new Error(OWNER_TOKEN_INVALID_CIPHERTEXT)

    try {
      const token = this.safeStorage.decryptString(Buffer.from(normalized, 'base64'))
      if (!/^[0-9a-f]{64}$/u.test(token)) throw new Error(OWNER_TOKEN_INVALID_CIPHERTEXT)
      return token
    } catch {
      throw new Error(OWNER_TOKEN_INVALID_CIPHERTEXT)
    }
  }

  private async writeCiphertext(encodedCiphertext: string): Promise<void> {
    const tokenDirectory = dirname(this.tokenFilePath)
    await mkdir(tokenDirectory, { recursive: true, mode: 0o700 })
    await chmod(tokenDirectory, 0o700)

    const temporaryPath = `${this.tokenFilePath}.${process.pid}.${randomUUID()}.tmp`
    let temporaryFile

    try {
      temporaryFile = await open(temporaryPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      await temporaryFile.writeFile(`${encodedCiphertext}\n`, 'utf8')
      await temporaryFile.sync()
      await temporaryFile.close()
      temporaryFile = undefined
      await rename(temporaryPath, this.tokenFilePath)
      await chmod(this.tokenFilePath, 0o600)
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined)
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}

function isCanonicalBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false
  return Buffer.from(value, 'base64').toString('base64') === value
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error
}
