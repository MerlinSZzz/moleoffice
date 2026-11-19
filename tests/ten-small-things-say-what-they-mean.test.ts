// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeAll, expect, it } from 'vitest'
import { setWordLanguage, writtenMoment } from '../src/shared/i18n.ts'

type Panel = typeof import('../src/web/components/Governance.tsx')
let panel: Panel

beforeAll(async () => {
  // Governance.tsx reaches modules that touch `window` while they load; the usual stand-in.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  panel = await import('../src/web/components/Governance.tsx')
})

afterEach(() => setWordLanguage('en'))

it('writes a stored moment as the office writes days, with its time', () => {
  expect(writtenMoment('2026-10-04 05:37:12')).toBe('4 Oct 2026, 05:37')
  setWordLanguage('zh')
  expect(writtenMoment('2026-10-04 05:37:12')).toBe('2026 年 10 月 4 日 05:37')
  // A value that is not a stamp is handed back as it is.
  expect(writtenMoment('not a stamp')).toBe('not a stamp')
})

