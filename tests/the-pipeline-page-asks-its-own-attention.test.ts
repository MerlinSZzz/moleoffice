// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE GRAPH ASKS ITS OWN READING OF GET /api/attention.
 *
 * This change follows a decision. Measured since 27 August 2026: project.attention
 * answered 7.46 GB in 4,373 calls, about 1.7 MB each. `getGraphData` in src/web/pages/PipelinePage.tsx reads `visible`
 * and `remainder` off that reply and nothing else, so it now asks `?shape=flow`, which keeps those
 * two lists in whole rows — the graph draws each failed block's whole reason — keeps
 * `counts`, `total`, `remainderNote` and the two stamps, and answers nothing more. The whole
 * reading is still what a plain call answers, and `home` is still home's own shape.
 *
 * MUTATION THAT MAKES THIS RED (control run first, then revert byte-identical): make
 * `flowAttention` in src/server/api/queries.ts return the reading whole, and the key assertion
 * below is red — with it every stale list comes back until a caller asks not to.
 */
import type { FastifyInstance } from 'fastify'
import { BLOCK_KIND } from '../src/shared/blocks.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Mole Office' })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** File a record through the product's own write path, as an agent. */
async function fileReal(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return ((res.json() as { record: { id: string } }).record).id
}

/** Ask the door, shaped or whole. */
async function attention(query = ''): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: `/api/attention${query}` })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

const THE_STAMPS_AND_ARITHMETIC = ['visible', 'remainder', 'total', 'remainderNote', 'counts', 'at', 'read', 'narrowedByPermission']

describe('GET /api/attention?shape=flow', () => {
  it('keeps whole block rows and the facts the graph reads from other rows', async () => {
    await fileReal('obligation', 'An obligation the graph sees on the list', { state: 'open', owedTo: 'the test review', due: '2020-01-01' })
    const pipeline = await fileReal('pipeline', 'A pipeline with a stopped block', { blockIds: [] })
    const made = await app.inject({ method: 'POST', url: `/api/records/${pipeline}/blocks`, payload: { name: 'A block stopped short', state: 'failed' } })
    expect(made.statusCode, made.body).toBe(201)
    const read = await attention('?shape=flow')
    expect(read.status).toBe(200)
    expect(Object.keys(read.body).sort()).toEqual([...THE_STAMPS_AND_ARITHMETIC].sort())
    const visible = read.body['visible'] as Record<string, unknown>[]
    const remainder = read.body['remainder'] as Record<string, unknown>[]
    let blocks = 0
    let other = 0
    for (const row of [...visible, ...remainder]) {
      // BLOCK ROWS STAY WHOLE: PipelineFlow draws their full reason. Other rows keep the fields the
      // graph reads: whole rows were 598,849 bytes on the made-up office of the live size.
      expect(row['score'], `row ${String(row['recordId'])} of ${String(row['recordKind'])}`).toBeTypeOf('number')
      const reason = row['reason'] as Record<string, unknown>
      if (row['recordKind'] === BLOCK_KIND) {
        blocks++
        expect(Array.isArray(reason['factors']), `row ${String(row['recordId'])} lost its factors`).toBe(true)
        expect('selectedBy' in reason, `row ${String(row['recordId'])} lost its selectedBy`).toBe(true)
      } else {
        other++
        expect(Object.keys(row).sort()).toEqual(['recordId', 'recordKind', 'score', 'safety', 'reason'].sort())
        expect(Object.keys(reason).sort()).toEqual(['coded', 'owed', 'consequence', 'stoppedShort'].sort())
      }
    }
    expect(blocks).toBeGreaterThan(0)
    expect(other).toBeGreaterThan(0)
    const counts = read.body['counts'] as Record<string, unknown>
    expect(Number(counts['visible'])).toBe(visible.length)
    expect(Number(counts['remainder'])).toBe(remainder.length)
  })

  it('answers the same lives when the whole answer is asked for — nothing a caller reads today disappears', async () => {
    await fileReal('obligation', 'An obligation the whole reply carries', { state: 'open', owedTo: 'the test review', due: '2020-01-01' })
    // THE WHOLE ANSWER IS ASKED FOR BY NAME since the door's default is the narrow reading.
    const whole = await attention('?shape=full')
    expect(whole.status).toBe(200)
    for (const key of [...THE_STAMPS_AND_ARITHMETIC, 'unclassified', 'noState', 'directions', 'paused', 'machine', 'passedOver', 'remainderByGroup', 'machineSweep']) {
      expect(key in whole.body, `the whole answer lost ${key}`).toBe(true)
    }
  })

  it('still answers home and refuses a shape it does not have', async () => {
    expect((await attention('?shape=home')).status).toBe(200)
    expect((await attention('?shape=steps')).status).toBe(400)
  })
})
