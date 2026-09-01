import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  OWNER_TOKEN_ENCRYPTION_UNAVAILABLE,
  OWNER_TOKEN_INVALID_CIPHERTEXT,
  OwnerTokenStore,
  type SafeStorageLike
} from './OwnerTokenStore'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devspace-owner-token-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('OwnerTokenStore', () => {
  it('creates and encrypts a 32-byte token with private permissions', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    const store = new OwnerTokenStore(tokenPath, createSafeStorage(), {
      randomBytes: (size) => Buffer.alloc(size, 0xab)
    })

    const token = await store.getOrCreate()
    const diskContents = await readFile(tokenPath, 'utf8')

    expect(token).toBe('ab'.repeat(32))
    expect(diskContents).not.toContain(token)
    expect(diskContents.trim()).toMatch(/^[A-Za-z0-9+/]+={0,2}$/u)
    expect((await stat(join(root, 'security'))).mode & 0o777).toBe(0o700)
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600)
  })

  it('returns the same token after reloading the store', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    const safeStorage = createSafeStorage()
    const original = new OwnerTokenStore(tokenPath, safeStorage, {
      randomBytes: (size) => Buffer.alloc(size, 0x11)
    })

    const firstToken = await original.getOrCreate()
    const reloaded = new OwnerTokenStore(tokenPath, safeStorage, {
      randomBytes: (size) => Buffer.alloc(size, 0x22)
    })

    expect(await reloaded.getOrCreate()).toBe(firstToken)
  })

  it('rotates and persists a new token', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    let fill = 1
    const safeStorage = createSafeStorage()
    const store = new OwnerTokenStore(tokenPath, safeStorage, {
      randomBytes: (size) => Buffer.alloc(size, fill++)
    })

    const original = await store.getOrCreate()
    const rotated = await store.rotate()

    expect(rotated).not.toBe(original)
    expect(await new OwnerTokenStore(tokenPath, safeStorage).getOrCreate()).toBe(rotated)
  })

  it('rejects damaged ciphertext', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    await mkdir(join(root, 'security'))
    await writeFile(tokenPath, 'not base64!', 'utf8')

    await expect(new OwnerTokenStore(tokenPath, createSafeStorage()).getOrCreate()).rejects.toThrow(
      OWNER_TOKEN_INVALID_CIPHERTEXT
    )
  })

  it('rejects ciphertext that cannot be decrypted', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    await mkdir(join(root, 'security'))
    await writeFile(tokenPath, Buffer.from('bad ciphertext').toString('base64'), 'utf8')

    await expect(new OwnerTokenStore(tokenPath, createSafeStorage()).getOrCreate()).rejects.toThrow(
      OWNER_TOKEN_INVALID_CIPHERTEXT
    )
  })

  it('fails with a stable error and never writes plaintext when encryption is unavailable', async () => {
    const root = await makeTemporaryDirectory()
    const tokenPath = join(root, 'security', 'owner-token')
    const unavailableStorage: SafeStorageLike = {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('must not be called')
      },
      decryptString: () => {
        throw new Error('must not be called')
      }
    }
    const store = new OwnerTokenStore(tokenPath, unavailableStorage)

    await expect(store.getOrCreate()).rejects.toThrow(OWNER_TOKEN_ENCRYPTION_UNAVAILABLE)
    await expect(store.rotate()).rejects.toThrow(OWNER_TOKEN_ENCRYPTION_UNAVAILABLE)
    await expect(readFile(tokenPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

function createSafeStorage(): SafeStorageLike {
  const prefix = Buffer.from('encrypted-owner-token:')

  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => Buffer.concat([prefix, Buffer.from(plainText).reverse()]),
    decryptString: (encrypted) => {
      if (!encrypted.subarray(0, prefix.length).equals(prefix)) throw new Error('Unable to decrypt ciphertext.')
      return encrypted.subarray(prefix.length).reverse().toString('utf8')
    }
  }
}
