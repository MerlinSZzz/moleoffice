// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it, vi } from 'vitest'

vi.mock('../src/server/db/client.ts', async () => {
  const { default: Database } = await import('better-sqlite3')
  return { sqlite: new Database(':memory:') }
})

it('lets startup continue when the attention thread cannot start, and refuses the first reading', async () => {
  const thread = await import('../src/server/lib/attention-thread.ts')
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await expect(thread.startAttentionThreadEarly()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
    const input = {} as Parameters<typeof thread.attentionOnItsOwnThread>[0]
    await expect(thread.attentionOnItsOwnThread(input)).rejects.toThrow('database is in memory')
  } finally {
    log.mockRestore()
    await thread.endTheAttentionThread()
    const { sqlite } = await import('../src/server/db/client.ts')
    sqlite.close()
  }
})
