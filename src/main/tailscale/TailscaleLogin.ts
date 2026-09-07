import { spawn, type ChildProcess } from 'node:child_process'

export function authenticationUrl(output: string): string | null {
  // Require a delimiter so a URL split across chunks is never opened partially.
  return /https:\/\/login\.tailscale\.com\/a\/[a-zA-Z0-9]+(?=\s)/.exec(output)?.[0] ?? null
}

export class TailscaleLogin {
  private pending: Promise<void> | null = null
  private cancel: (() => void) | null = null

  constructor(
    private readonly openBrowser: (url: string) => Promise<void>,
    private readonly start: (executable: string, args: string[]) => ChildProcess = (executable, args) =>
      spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  ) {}

  login(executable: string): Promise<void> {
    if (this.pending) return this.pending
    this.pending = this.run(executable).finally(() => { this.pending = null })
    return this.pending
  }

  stop(): void { this.cancel?.() }

  private run(executable: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.start(executable, ['login', '--timeout=120s'])
      let output = ''
      let opened = false
      let opening: Promise<void> = Promise.resolve()
      let finished = false
      const finish = (error?: Error): void => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        this.cancel = null
        if (error) { child.kill('SIGKILL'); reject(error) } else resolve()
      }
      const timer = setTimeout(() => finish(new Error('Tailscale login timed out')), 125_000)
      this.cancel = () => finish(new Error('Tailscale login cancelled'))
      const receive = (chunk: Buffer): void => {
        output = (output + chunk.toString()).slice(-8192)
        const url = authenticationUrl(output)
        if (url && !opened) {
          opened = true
          opening = this.openBrowser(url)
          void opening.catch(() => finish(new Error('Could not open login browser')))
        }
      }
      child.stdout?.on('data', receive)
      child.stderr?.on('data', receive)
      child.once('error', () => finish(new Error('Could not start Tailscale login')))
      child.once('close', (code) => {
        if (code !== 0) { finish(new Error('Tailscale login failed')); return }
        void opening.then(() => finish(), () => finish(new Error('Could not open login browser')))
      })
    })
  }
}
