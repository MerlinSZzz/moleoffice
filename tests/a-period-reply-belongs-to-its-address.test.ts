// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll, expect, it } from 'vitest'
import type { PlanReply } from '../src/server/api/planning.ts'

let periodShown: typeof import('../src/web/pages/PlanPage.tsx').periodShown
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k:string) => store.get(k) ?? null, setItem: (k:string,v:string) => void store.set(k,v), removeItem: (k:string) => void store.delete(k) }
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
  ;({ periodShown } = await import('../src/web/pages/PlanPage.tsx'))
})
const reply = (period:string):PlanReply => ({ period }) as PlanReply
it('does not draw an old ready reply under a new period', () => {
  expect(periodShown({ status:'ready', value:reply('2026-W40'), refreshing:true }, null, '2026-W41')).toBeNull()
})
it('drops a kept reply when its reread fails', () => {
  expect(periodShown({ status:'ready', value:reply('2026-W40'), reReadError:{ message:'The read failed.', fault:null } }, null, '2026-W40')).toBeNull()
})
