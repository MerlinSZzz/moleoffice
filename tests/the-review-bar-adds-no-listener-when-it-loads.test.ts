// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW BAR ADDS NOTHING TO THE WINDOW WHEN ITS FILE IS LOADED.
 *
 * Merge entry wF-4WYbAftoF bounced on 5 October 2026: src/web/components/agent/ReviewBar.tsx added the leave
 * question's hashchange listener at module level, so five test files that give the page a stand-in window with no
 * addEventListener (viz, module-page, module-condition, surface-fixes, vocab-lifecycle) failed to load with
 * "window.addEventListener is not a function". The listener is now added when the leave question mounts and taken
 * off when it unmounts. A page or a test that only imports the file must add nothing to the window.
 *
 * Both cases import the file under a stand-in window, the same shape those five files use, with nothing else of a
 * browser. The first has no addEventListener at all, as theirs has not. The second counts every listener added
 * while the file loads, so a listener added at load by some other path is caught even when the window could take it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as unknown as { window?: unknown }
const before = g.window

function aStandInWindow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const store = new Map<string, string>()
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    ...extra,
  }
}

afterEach(() => {
  g.window = before
  vi.resetModules()
})

describe('the review bar adds no listener when its file is loaded', () => {
  it('loads under a stand-in window that has no addEventListener', async () => {
    g.window = aStandInWindow()
    const bar = await import('../src/web/components/agent/ReviewBar.tsx')
    expect(typeof bar.ReviewFrame).toBe('function')
  })

  it('adds no listener to the window while it loads', async () => {
    const added: string[] = []
    g.window = aStandInWindow({
      addEventListener: (type: string) => void added.push(type),
      removeEventListener: () => undefined,
    })
    await import('../src/web/components/agent/ReviewBar.tsx')
    expect(added).toEqual([])
  })
})
