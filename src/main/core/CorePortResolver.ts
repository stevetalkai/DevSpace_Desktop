import { createServer } from 'node:net'

const CORE_HOST = '127.0.0.1'
const FIRST_CORE_PORT = 7676
const LAST_CORE_PORT = 7686

export const CORE_PORT_UNAVAILABLE_ERROR = 'core_port_unavailable' as const

export type CorePortAvailabilityCheck = (host: string, port: number) => Promise<boolean>

export class CorePortResolutionError extends Error {
  readonly code = CORE_PORT_UNAVAILABLE_ERROR

  constructor() {
    super(`No available Core port from ${FIRST_CORE_PORT} through ${LAST_CORE_PORT}.`)
    this.name = 'CorePortResolutionError'
  }
}

/**
 * Probes each candidate by briefly binding it, then releases the listener before returning.
 * The caller must start Core immediately because returning only a port number cannot reserve it.
 */
export async function resolveCorePort(
  isAvailable: CorePortAvailabilityCheck = canBindPort
): Promise<number> {
  for (let port = FIRST_CORE_PORT; port <= LAST_CORE_PORT; port += 1) {
    if (await isAvailable(CORE_HOST, port)) return port
  }

  throw new CorePortResolutionError()
}

async function canBindPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()

    server.once('error', () => resolve(false))
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => resolve(error === undefined))
    })
  })
}
