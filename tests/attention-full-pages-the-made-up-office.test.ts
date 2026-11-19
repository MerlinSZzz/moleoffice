// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ATTENTION_PART_ROWS } from '../src/shared/attention-first-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

/** Each full list is visibly a page, with a continuation rather than a short array. */
type Row = { key: string; recordId?: string; title?: string; bucket?: string }
type Page = { rows: Row[]; total: number; next: string | null }
type Full = Record<string, unknown> & { passedOver: Page & { groups: { bucket: string; count: number }[] } }

let folder = ''
let app: FastifyInstance | undefined
let reading: Awaited<ReturnType<typeof import('../src/server/lib/records/attention.ts')['attentionNow']>>

beforeAll(async () => {
  folder = aTestDatabaseFolder('attention-full-pages')
  const file = join(folder, 'office.db')
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY') delete env[name]
  const built = spawnSync(process.execPath, ['--import', 'tsx', 'tools/build-a-made-up-office.ts', '--scale', '4-november', '--one-in', '10', file], {
    env, encoding: 'utf8', timeout: 240_000,
  })
  expect(built.status, built.stderr).toBe(0)
  process.env.MOLE_OFFICE_DB = file
  const { apiApp } = await import('./helpers.ts')
  app = (await apiApp()).app
  await app.ready()
  const { attentionNow } = await import('../src/server/lib/records/attention.ts')
  const { theMessageReader } = await import('../src/server/lib/messages.ts')
  reading = attentionNow({ workspaceId: 'default', resources: [], reader: theMessageReader({ type: 'human', id: THE_PERSON }) })
}, 300_000)

afterAll(async () => {
  await app?.close()
  const { sqlite } = await import('../src/server/db/client.ts')
  if (sqlite.open) sqlite.close()
  removeThisTestFolder(folder)
})

it('bounds the full reply and pages every derived list without losing or repeating a row', async () => {
  const reply = await app!.inject({ method: 'GET', url: '/api/attention?machine=omit&shape=full' })
  expect(reply.statusCode, reply.body).toBe(200)
  // One megabyte is a decimal unit; the bound is the criterion, not a copied page size.
  expect(Buffer.byteLength(reply.body)).toBeLessThanOrEqual(10 ** 6)
  const full = reply.json() as Full
  const lists = ['remainder', 'unclassified', 'noState', 'directions', 'reports', 'paused', 'machine'] as const
  const whole: Record<string, Row[]> = Object.fromEntries(lists.map((name) => [name, reading[name] as Row[]]))
  whole['passedOver'] = reading.passedOver.flatMap((group) => group.keys.map((key) => ({ bucket: group.bucket, key })))
  expect(full.passedOver.groups.map(({ bucket, count }) => ({ bucket, count }))).toEqual(reading.passedOver.map(({ bucket, count }) => ({ bucket, count })))
  let cutLists = 0
  for (const name of [...lists, 'passedOver'] as const) {
    const page = full[name] as Page
    const expected = whole[name]!
    expect(Array.isArray(page), name).toBe(false)
    expect(page.total, name).toBe(expected.length)
    expect(page.rows.length, name).toBe(Math.min(ATTENTION_PART_ROWS, expected.length))
    if (page.next !== null) cutLists++
    const all = [...page.rows]
    let next = page.next
    while (next !== null) {
      const more = await app!.inject({ method: 'GET', url: next })
      expect(more.statusCode, more.body).toBe(200)
      expect(Buffer.byteLength(more.body)).toBeLessThanOrEqual(10 ** 6)
      const part = more.json() as Page
      expect(part.total, name).toBe(expected.length)
      all.push(...part.rows)
      next = part.next
    }
    const identity = (row: Row) => `${row.bucket ?? ''}:${row.key}`
    expect(all.map(identity).sort(), name).toEqual(expected.map(identity).sort())
    expect(new Set(all.map(identity)).size, name).toBe(all.length)
    const titles = new Map(expected.filter((row) => row.title !== undefined).map((row) => [identity(row), row.title]))
    for (const row of all) if (titles.has(identity(row))) expect(row.title, name).toBe(titles.get(identity(row)))
  }
  expect(cutLists).toBeGreaterThan(0)
}, 300_000)
