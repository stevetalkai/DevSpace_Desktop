export interface ExternalUrlLauncherOptions {
  openExternal: (url: string) => Promise<void>
  recordFailure: (url: string, reason: string) => Promise<void>
}

export async function openExternalUrl(url: string, options: ExternalUrlLauncherOptions): Promise<void> {
  try {
    await options.openExternal(url)
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    await options.recordFailure(url, reason).catch(() => undefined)
    throw error
  }
}
