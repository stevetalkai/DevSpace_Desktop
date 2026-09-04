import { describe, expect, it } from 'vitest'
import { deriveTailscaleChecks } from './TailscaleSetupWizard'

describe('deriveTailscaleChecks', () => {
  it('does not mistake a transient check for a running background service', () => {
    expect(deriveTailscaleChecks('checking')).toEqual({ installed: false, running: false, loggedIn: false })
  })

  it('accepts a Homebrew CLI even when its background service is stopped', () => {
    expect(deriveTailscaleChecks('daemon-unavailable')).toEqual({ installed: true, running: false, loggedIn: false })
  })

  it('accepts a logged-in command-line installation that is ready', () => {
    expect(deriveTailscaleChecks('ready')).toEqual({ installed: true, running: true, loggedIn: true })
  })

  it('keeps the installed client and running service visible during a network failure', () => {
    expect(deriveTailscaleChecks('coordination-unavailable')).toEqual({ installed: true, running: true, loggedIn: false })
  })
})
