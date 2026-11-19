// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROUTES THE REVIEW PANE IS BUILT AGAINST, DRIVEN OVER HTTP.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS BESIDE tests/review-collection.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * That file drives the library and proves what a review MEANS. This one drives the server and
 * proves the doors are open: the status codes, the reply shapes, and the two facts a caller cannot
 * see from inside the process — that starting again in the same scope answers 200 rather than 201,
 * and that a whole list of remarks can be asked about in one request.
 *
 * ROUND EIGHT'S OWN LESSON IS THE REASON. Phase 3 built an annotation kind that every test was green
 * about and that no screen wrote, and the only thing that found it was somebody opening the product
 * and trying. A library test says the code does what its author meant. It says nothing about
 * whether the thing the next agent builds against is reachable.
 *
 * The browser half is not built yet, so the strongest thing available here is the request a pane
 * will make, made exactly.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHY_A_DRAFT_IS_NOT_ON_THE_SERVER } from '../src/shared/targets.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'

/**
 * A PROJECT OF ITS OWN FOR EACH CASE. One case says the list of reviews is empty, and another says
 * the run table is empty; a fresh project per case keeps those readings true in one office shared
 * by the file.
 */
let WORKSPACE = 'default'
let caseNumber = 0
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const HEADERS = { ...HUMAN, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  HEADERS['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: 'A made-up project for one case' },
  })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A module with one curated summary block, so a block of it can be pointed at too. */
async function module(title: string): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HEADERS,
    payload: {
      kind: 'module',
      title,
      data: { context: 'x', summaryBlocks: [{ id: 'b-1', type: 'text', text: 'What this module is for.' }] },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

async function remark(title: string, context: unknown): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HEADERS,
    payload: { kind: 'annotation', title, data: { body: `words about ${title}`, context } },
  })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { record: { id: string } }).record.id
}

// ============================================================================ starting and coming back

describe('POST /api/reviews', () => {
  it('starts one with 201, and says what it will collect in words', async () => {
    const gripper = await module('The gripper')
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      payload: { entry: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } } },
    })

    expect(started.statusCode, started.body).toBe(201)
    const body = started.json() as { started: boolean; review: { id: string; state: string }; rule: { kind: string } }
    expect(body.started).toBe(true)
    expect(body.review.state).toBe('collecting')
    expect(body.rule.kind).toBe('record')
  })

  it('answers 200 with the same review when somebody comes back to the same scope', async () => {
    const gripper = await module('The gripper')
    const entry = { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } }
    const first = await app.inject({ method: 'POST', url: '/api/reviews', headers: HEADERS, payload: { entry } })
    const again = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      // A DIFFERENT ENTRY IN THE SAME SCOPE, which is what walking to another part of the same
      // module and pressing the same control looks like.
      payload: { entry: { target: { kind: 'reportBlock', recordId: gripper, blockId: 'b-1' } } },
    })

    expect(again.statusCode, again.body).toBe(200)
    const body = again.json() as { started: boolean; review: { id: string } }
    expect(body.started).toBe(false)
    expect(body.review.id).toBe((first.json() as { review: { id: string } }).review.id)
  })

  it('refuses an entry pointing at something Mole Office cannot look up, and writes nothing', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      payload: { entry: { target: { kind: 'draft', draftId: 'd1' } } },
    })

    expect(refused.statusCode).toBe(400)
    // The shared sentence, not a phrase copied out of it. See the note in review-collection.test.ts.
    expect(refused.body).toContain(WHY_A_DRAFT_IS_NOT_ON_THE_SERVER)
    const list = await app.inject({ method: 'GET', url: '/api/reviews', headers: HEADERS })
    expect((list.json() as { total: number }).total).toBe(0)
  })
})

// ============================================================================ the list

describe('GET /api/reviews', () => {
  it('narrows to the reviews collecting one particular thing', async () => {
    const gripper = await module('The gripper')
    const camera = await module('The wrist camera')
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      payload: { entry: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } } },
    })
    const id = (started.json() as { review: { id: string } }).review.id

    const here = await app.inject({
      method: 'GET',
      url: `/api/reviews?covers=${encodeURIComponent(`record/${gripper}/${WORKSPACE}`)}`,
      headers: HEADERS,
    })
    expect((here.json() as { reviews: { id: string }[] }).reviews.map((r) => r.id)).toEqual([id])

    const elsewhere = await app.inject({
      method: 'GET',
      url: `/api/reviews?covers=${encodeURIComponent(`record/${camera}/${WORKSPACE}`)}`,
      headers: HEADERS,
    })
    expect((elsewhere.json() as { reviews: unknown[] }).reviews).toEqual([])
  })

  it('refuses a `covers` that is not a thing anybody can point at, saying why', async () => {
    const refused = await app.inject({ method: 'GET', url: '/api/reviews?covers=nonsense', headers: HEADERS })
    expect(refused.statusCode).toBe(400)
    expect(refused.body).toContain('is not a thing anybody can point at')
  })
})

// ============================================================================ the boundary

describe('POST /api/reviews/:id/finish-collecting', () => {
  it('writes the membership down, sends nothing, and refuses a second time', async () => {
    const gripper = await module('The gripper')
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      payload: { entry: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } } },
    })
    const id = (started.json() as { review: { id: string } }).review.id
    const written = await remark('the number', { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } })

    const finished = await app.inject({
      method: 'POST',
      url: `/api/reviews/${id}/finish-collecting`,
      headers: HEADERS,
    })
    expect(finished.statusCode, finished.body).toBe(200)
    const body = finished.json() as {
      review: { state: string; membershipFrozen: boolean }
      members: { id: string }[]
      organised: null
    }
    expect(body.review.state).toBe('collected')
    expect(body.review.membershipFrozen).toBe(true)
    expect(body.members.map((m) => m.id)).toEqual([written])
    // WHERE THE ORGANISED READING WOULD GO. Nothing organises a review yet, and nothing stands in
    // for it.
    expect(body.organised).toBeNull()

    // NOTHING WAS SENT. A run is the only thing that means an agent was asked for anything.
    const runs = await app.inject({ method: 'GET', url: '/api/agent/runs', headers: HUMAN })
    expect((runs.json() as { runs: unknown[] }).runs).toEqual([])

    const twice = await app.inject({ method: 'POST', url: `/api/reviews/${id}/finish-collecting`, headers: HEADERS })
    expect(twice.statusCode).toBe(409)
  })
})

// ============================================================================ the refusing route

describe('PATCH /api/reviews/:id', () => {
  it('refuses "sent" with 409 and names the route that does send it', async () => {
    const gripper = await module('The gripper')
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HEADERS,
      payload: { entry: { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } } },
    })
    const id = (started.json() as { review: { id: string } }).review.id

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/reviews/${id}`,
      headers: HEADERS,
      payload: { state: 'sent' },
    })
    expect(refused.statusCode).toBe(409)
    // IT USED TO SAY SENDING WAS NOT BUILT, AND IT IS. A review is sent by sending it, and a
    // refusal that still said otherwise would send somebody looking for a route they had missed.
    expect(refused.body).toContain(`POST /api/reviews/${id}/send`)
    expect(refused.body).not.toContain('not built')
  })
})

// ============================================================================ the remarks

describe('the annotation routes', () => {
  it('answers a whole list of remarks in one request, in the order asked', async () => {
    const gripper = await module('The gripper')
    const first = await remark('one', { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } })
    const second = await remark('two', { target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE } })

    const answered = await app.inject({
      method: 'POST',
      url: '/api/annotations/readings',
      headers: HEADERS,
      payload: { ids: [second, 'nOsUcHrEcOrD', first] },
    })
    expect(answered.statusCode, answered.body).toBe(200)
    const body = answered.json() as { readings: { id: string; found: boolean }[]; read: number; unread: number }
    expect(body.readings.map((r) => r.id)).toEqual([second, 'nOsUcHrEcOrD', first])
    expect(body.read).toBe(2)
    expect(body.unread).toBe(1)
  })

  it('finds one remark from its own id, with where it is and what it quoted', async () => {
    const gripper = await module('The gripper')
    const written = await remark('the block', {
      target: { kind: 'reportBlock', recordId: gripper, blockId: 'b-1' },
      span: { quote: 'What this module', from: 0, to: 16, field: 'data.summaryBlocks[#b-1].text' },
    })

    const read = await app.inject({ method: 'GET', url: `/api/annotations/${written}`, headers: HEADERS })
    expect(read.statusCode, read.body).toBe(200)
    const body = read.json() as {
      where: { key: string; record: { id: string } | null; blockId: string | null; quote: { words: string } | null }
      reading: { state: string }
    }
    // A MODULE KEEPS ITS BLOCKS IN `summaryBlocks`, and the key names the part of the record the
    // block is: the comment was written as a `reportBlock` and the door spells it the one way a
    // part of a record is stored — see `theRegionItNames` in src/server/lib/targets.ts. Each value
    // in a key is percent-encoded, which is why the id goes through `encodeURIComponent` here.
    expect(body.where.key).toBe(`region/${gripper}/${encodeURIComponent('data.summaryBlocks[#b-1]')}`)
    expect(body.where.record?.id).toBe(gripper)
    // `blockId` is read off the stored target's own identifiers and a region has none: the block is
    // named inside the path above. Null is the honest answer rather than a value worked out here.
    expect(body.where.blockId).toBeNull()
    expect(body.where.quote?.words).toBe('What this module')
    expect(body.reading.state).toBe('there')
  })
})

// ============================================================================ the pair to stamp

describe('GET /api/records/:id', () => {
  it('hands back the number of the revision holding what it just handed back', async () => {
    const gripper = await module('The gripper')
    const read = await app.inject({ method: 'GET', url: `/api/records/${gripper}`, headers: HEADERS })
    const body = read.json() as { version: string; revisionSeq: number | null }

    expect(body.revisionSeq).toBe(1)

    // AND THE PAIR IS ACCEPTED, which is the whole point of handing the number back: a remark can
    // say which version was on screen without a second request first.
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HEADERS,
      payload: {
        kind: 'annotation',
        title: 'against what was on screen',
        data: {
          body: 'This is about the version I was looking at.',
          context: {
            target: { kind: 'record', recordId: gripper, workspaceId: WORKSPACE },
            revision: { seq: body.revisionSeq, contentHash: body.version },
          },
        },
      },
    })
    expect(written.statusCode, written.body).toBe(201)
  })
})
