import { useCallback, useEffect, useState } from 'react'
import type { DesktopSnapshot } from '../../../shared/contracts'

const initialSnapshot: DesktopSnapshot = {
  core: { phase: 'stopped', port: 7676, startedAt: null, errorCode: null },
  tunnel: { phase: 'checking', publicUrl: null, mcpUrl: null, errorCode: null },
  chatgpt: { phase: 'not-connected' },
  projects: [],
  appVersion: '0.1.0'
}
export function useDesktopSnapshot(): {
  snapshot: DesktopSnapshot
  pending: boolean
  startCore: () => Promise<void>
  stopCore: () => Promise<void>
} {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    void window.devspace.getSnapshot().then((next) => {
      if (active) setSnapshot(next)
    })
    const unsubscribe = window.devspace.subscribe(setSnapshot)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (operation: () => Promise<unknown>): Promise<void> => {
    setPending(true)
    try {
      await operation()
    } finally {
      setPending(false)
    }
  }, [])

  return {
    snapshot,
    pending,
    startCore: () => run(() => window.devspace.startCore()),
    stopCore: () => run(() => window.devspace.stopCore())
  }
}
