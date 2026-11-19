// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION DOOR ANSWERS THE NARROW ROW WHEN NO SHAPE IS ASKED, AND THE WHOLE ONE WHEN IT IS.
 *
 * This follows a decision. project.attention answered 7.46 GB in 4,373 calls since
 * 27 August 2026, about 1.7 MB each, and every one carried whole rows, the reasons, every rank factor and every
 * second list. A caller that reads only which things need attention now asks no shape and gets the
 * narrow row: `key`, `recordId`, `recordKind`, `partId`, `itemId`, `title`, `state`, `group`,
 * `safety`, `displacedBy` and `origin`, with `total`, `counts`, `remainderByGroup`, `remainderNote`,
 * `at` and `read`. `?shape=full` asks for the whole reading, and `?shape=narrow` stays accepted.
 * `?machine=include` with no shape asks the whole answer, because only the whole answer carries the
 * machine list; `?machine=omit` with no shape is narrow.
 *
 * NO PROCESS AND NO BROWSER START HERE: this file builds the route in-process against a throwaway
 * database, so it can run in any part of the suite.
 *
 * MUTATION THAT MAKES THIS RED (control run first, then revert byte-identical): make the default
 * whole and the default case is red; make `shape=full` answer narrow and the whole case is red; put
 * `reason` back on a narrow row and its exact-fields case is red.
 */
import type { FastifyInstance } from 'fastify'
import type { AttentionFullReply } from '../src/server/lib/attention-shapes.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let overdueId = ''

interface AttentionRow {
  key: string
  recordId: string
  recordKind: string
  partId: string | null
  itemId: string | null
  title: string
  state: string | null
  group: string
  safety: boolean
  displacedBy: string | null
  origin: string | null
  progress?: unknown
  score?: number
  reason?: unknown
}

interface AttentionReply {
  visible: AttentionRow[]
  remainder: AttentionRow[]
  total: number
  counts: Record<string, number>
  remainderByGroup: { group: string; label: string; count: number }[]
  remainderNote: string | null
  at: string
  read: { records: number; links: number; changes: number; changesCapped: boolean }
  machineSweep?: { swept: boolean; searched: string[]; unchecked: string[]; note: string }
  machine?: unknown[]
  unclassified?: unknown[]
  noState?: unknown[]
  paused?: unknown[]
  directions?: unknown[]
  passedOver?: unknown[]
}

const NARROW_ROW_KEYS = ['displacedBy', 'group', 'itemId', 'key', 'origin', 'partId', 'recordId', 'recordKind', 'safety', 'state', 'title']
const NARROW_REPLY_KEYS = ['at', 'counts', 'read', 'remainder', 'remainderByGroup', 'remainderNote', 'total', 'visible']

async function attention(query = ''): Promise<AttentionReply> {
  const reply = await app.inject({ method: 'GET', url: `/api/attention${query}` })
  expect(reply.statusCode, `${query}: ${reply.body.slice(0, 300)}`).toBe(200)
  return reply.json() as AttentionReply
}


async function fullAttention(query = '?shape=full'): Promise<AttentionFullReply & { machineSweep: { swept: boolean } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/attention${query}` })
  expect(reply.statusCode, `${query}: ${reply.body.slice(0, 300)}`).toBe(200)
  return reply.json() as AttentionFullReply & { machineSweep: { swept: boolean } }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A PROMISE SOMEBODY OUTSIDE IS STILL WAITING ON: it is selected by the rule, so the rows this
  // file cuts are rows the reading really produced and not an empty list.
  overdueId = t.api.createRecord({
    workspaceId: 'default',
    kind: 'obligation',
    title: 'A promise the narrow attention list still ranks',
    data: { due: '2020-03-01', owedTo: 'the narrow attention test', state: 'open' },
    actor: t.api.HUMAN,
  }).id
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('GET /api/attention with no shape', () => {
  it('answers the narrow row and the small reply, with every row selected by the same reading', async () => {
    const narrow = await attention()
    // THE REPLY HOOK ADDS `narrowedByPermission` TO EVERY ANSWER; it is not part of this route's shape.
    expect(Object.keys(narrow).filter((key) => key !== 'narrowedByPermission').sort()).toEqual(NARROW_REPLY_KEYS)
    expect(narrow).toHaveProperty('narrowedByPermission', null)
    expect(narrow.total).toBe(narrow.visible.length + narrow.remainder.length)
    expect(narrow.total, 'the narrow reply holds no row to cut, so its cut proves nothing').toBeGreaterThan(0)
    expect(narrow.counts['selected']).toBe(narrow.total)
    expect(narrow.read.records).toBeGreaterThan(0)
    expect(narrow.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    const mine = [...narrow.visible, ...narrow.remainder].find((one) => one.recordId === overdueId)
    expect(mine, 'the overdue promise is on neither the visible list nor the remainder').toBeDefined()
    for (const one of [...narrow.visible, ...narrow.remainder]) {
      expect(Object.keys(one).sort(), `${one.recordKind} ${one.recordId} on a narrow reply`).toEqual(NARROW_ROW_KEYS)
      expect(one, 'a narrow row carries the rule\'s reason or its rank').not.toHaveProperty('reason')
      expect(one).not.toHaveProperty('factors')
      expect(one).not.toHaveProperty('score')
      expect(one).not.toHaveProperty('progress')
    }
    // THE SECOND LISTS AND THE SWEEP ARE NOT IN THE NARROW REPLY AT ALL, not even empty.
    for (const absent of ['machineSweep', 'machine', 'unclassified', 'noState', 'paused', 'directions', 'passedOver']) {
      expect(narrow, `the narrow reply carries ${absent}`).not.toHaveProperty(absent)
    }
    expect(narrow.remainderByGroup.reduce((sum, one) => sum + one.count, 0)).toBe(narrow.remainder.length)
  })

  it('answers exactly the same narrow reply when shape=narrow is asked for', async () => {
    const plain = await attention()
    const asked = await attention('?shape=narrow')
    expect(asked.visible).toEqual(plain.visible)
    expect(asked.remainder).toEqual(plain.remainder)
    expect(asked.total).toBe(plain.total)
    expect(asked.counts).toEqual(plain.counts)
    expect(asked.remainderByGroup).toEqual(plain.remainderByGroup)
    expect(asked.remainderNote).toBe(plain.remainderNote)
    expect(asked.read).toEqual(plain.read)
  })

  it('is narrow with machine=omit, and the whole answer with machine=include', async () => {
    const omitted = await attention('?machine=omit')
    expect(omitted).not.toHaveProperty('machineSweep')
    expect(omitted.visible[0]).not.toHaveProperty('reason')

    const included = await fullAttention('?machine=include')
    expect(included.machineSweep, 'machine=include with no shape did not ask the whole answer').toBeDefined()
    expect(included.machineSweep?.swept).toBe(true)
    expect(Array.isArray(included.machine.rows)).toBe(true)
    expect(included.visible[0]).toHaveProperty('reason')
  })
})

describe('GET /api/attention?shape=full', () => {
  it('answers the reading in pages, with reasons and factors', async () => {
    const full = await fullAttention()
    for (const present of ['machineSweep', 'machine', 'unclassified', 'noState', 'paused', 'directions', 'passedOver']) {
      expect(full, `the whole answer does not carry ${present}`).toHaveProperty(present)
    }
    const row = full.visible.find((one) => one.recordId === overdueId) ?? full.remainder.rows.find((one) => one.recordId === overdueId)
    expect(row, 'the overdue promise is in neither list of the whole answer').toBeDefined()
    expect(row).toHaveProperty('reason')
    expect((row!.reason as { factors?: unknown[] }).factors, 'the rule\'s rank factors are not in `reason`').toBeDefined()
    expect(row).toHaveProperty('score')
    expect(row).toHaveProperty('progress')
    expect(full.machineSweep?.swept, 'the whole answer should say it did not look unless asked').toBe(false)
  })
})
