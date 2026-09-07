import { describe, expect, it, vi } from 'vitest'
import { openExternalUrl } from './ExternalUrlLauncher'

describe('openExternalUrl', () => {
  it('records the URL and reason when the system cannot open it', async () => {
    const failure = new Error('No application is registered for HTTPS URLs')
    const recordFailure = vi.fn().mockResolvedValue(undefined)

    await expect(openExternalUrl('https://chatgpt.com/plugins', {
      openExternal: vi.fn().mockRejectedValue(failure),
      recordFailure
    })).rejects.toBe(failure)

    expect(recordFailure).toHaveBeenCalledWith(
      'https://chatgpt.com/plugins',
      'No application is registered for HTTPS URLs'
    )
  })

  it('does not write a failure record after opening succeeds', async () => {
    const recordFailure = vi.fn().mockResolvedValue(undefined)

    await openExternalUrl('https://chatgpt.com/plugins', {
      openExternal: vi.fn().mockResolvedValue(undefined),
      recordFailure
    })

    expect(recordFailure).not.toHaveBeenCalled()
  })
})
