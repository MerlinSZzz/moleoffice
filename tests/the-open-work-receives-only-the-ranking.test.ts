// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const NOW = Date.UTC(2026, 10, 18)
let office: TestDb

beforeAll(async () => {
  office = await freshDb()
  office.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  ).run('ranking-example', PROJECT, 'problem', 'A stopped task', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'A delay' } }))
}, 120_000)

afterAll(async () => {
  const { endTheAttentionThread } = await import('../src/server/lib/attention-thread.ts')
  await endTheAttentionThread()
  office.close()
})

it('sends only ranking fields from the attention thread while preserving ranked open work', async () => {
  const { attentionNow } = await import('../src/server/lib/records.ts')
  const { attentionAndItsLastChangeOnItsOwnThread } = await import('../src/server/lib/attention-thread.ts')
  const { openLoopsFor } = await import('../src/server/lib/openloops.ts')
  const { rankOpenWork } = await import('../src/server/lib/openwork.ts')
  const input = { workspaceId: PROJECT, resources: [], now: NOW }
  const whole = attentionNow(input)
  const actual = await attentionAndItsLastChangeOnItsOwnThread(input)
  const rankingRows = (rows: typeof whole.visible) => rows.map(({ recordId, score }) => ({ recordId, score }))

  expect(whole.visible.length + whole.remainder.length).toBeGreaterThan(0)
  expect(actual.reading).toEqual({ at: whole.at, visible: rankingRows(whole.visible), remainder: rankingRows(whole.remainder) })

  const loops = openLoopsFor({ workspaceId: PROJECT })
  expect(loops.loops.length).toBeGreaterThan(0)
  const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(hash(rankOpenWork(loops, actual))).toBe(hash(rankOpenWork(loops, { reading: whole, lastChange: actual.lastChange })))
}, 120_000)
