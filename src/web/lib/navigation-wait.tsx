// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react'

type ReadStatus = 'loading' | 'ready' | 'error'

/** The reads belonging to the page selected from the phone drawer. */
export class NavigationReads {
  private reads = new Map<object, ReadStatus>()
  private active = false
  private queued = false
  private complete: ((answer: 'ready' | 'error') => void) | null = null

  set(key: object, status: ReadStatus): void { this.reads.set(key, status); this.check() }
  remove(key: object): void { this.reads.delete(key); this.check() }
  start(complete: (answer: 'ready' | 'error') => void): void { this.active = true; this.complete = complete; this.check() }
  stop(): void { this.active = false; this.complete = null }
  private check(): void {
    if (!this.active || this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      if (!this.active || [...this.reads.values()].includes('loading')) return
      this.active = false
      this.complete?.([...this.reads.values()].includes('error') ? 'error' : 'ready')
    })
  }
}

const NavigationReadContext = createContext<NavigationReads | null>(null)

export function PageNavigationReads({ reads, onAnswer, children }: { reads: NavigationReads | null; onAnswer: (answer:'ready'|'error') => void; children: ReactNode }) {
  const callback = useRef(onAnswer)
  callback.current = onAnswer
  useLayoutEffect(() => {
    if (reads === null) return
    reads.start(answer => callback.current(answer))
    return () => reads.stop()
  }, [reads])
  return <NavigationReadContext.Provider value={reads}>{children}</NavigationReadContext.Provider>
}

/** Called by a page's useAsync, so both skeletons and plain status lines count as reads. */
export function useNavigationRead(status: ReadStatus): void {
  const reads = useContext(NavigationReadContext)
  const key = useRef({})
  useLayoutEffect(() => { reads?.set(key.current, status) }, [reads, status])
  useLayoutEffect(() => () => { reads?.remove(key.current) }, [reads])
}
