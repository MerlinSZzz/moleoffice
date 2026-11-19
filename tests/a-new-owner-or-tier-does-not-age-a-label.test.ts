// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE'S OWNER AND A BLOCK'S TIER DO NOT AGE ITS LABEL. Wave 13u round 221, package BV, point BV-9-1.
 *
 * A label says what a module does. Who owns the module, and which row of the big map a block is drawn in, are
 * bookkeeping that the map's dictionary and the big map read, and a label written before such a change still says
 * the same true thing. So `changedSince` in src/server/lib/zoom.ts leaves `owner` out of a module and `tier` out of a
 * block, on both sides of the comparison, and nothing changes for any other kind.
 *
 * WHAT IS PROVED, in a fresh test office, each state read through GET /api/records/:id/short-forms and every write sent
 * through the one write door:
 *   1. a module whose only change since its label is its owner reads current, and its sentence names the owner rather
 *      than saying nothing has changed, which a fresh label still says;
 *   2. a block whose only change since its label is its tier reads current, and its sentence names the tier;
 *   3. a module whose summary changed reads out of date, and changedSince names the summary;
 *   4. a module whose owner and summary changed reads out of date, and changedSince names the summary and not the owner;
 *   5. a block whose tier and summary changed reads out of date, and changedSince names the summary and not the tier;
 *   6. a goal whose only change is its owner still reads out of date: a goal's owner is what the goal says.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in zoom.ts, take tier out for a block: cases 2 and 5 go red, because case 5 changes the tier as well.
 *   2. in zoom.ts, leave the field out for every kind: case 6 goes red.
 *   3. in zoom.ts, leave `changed` unfiltered: cases 1, 2, 4 and 5 go red, because cases 1 and 2 hold that nothing is
 *      listed when only the owner or the tier moved.
 *
 * AT THE CUT, BEFORE THE CHANGE, cases 1, 2, 4 and 5 are red and cases 3 and 6 are green: the code then ages every
 * kind's label on any field, so the summary case and the goal case already hold, and only the second mutation can turn
 * the goal case red.
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

let t: TestDb
let app: FastifyInstance
let revisions: RevisionsLib
let pipeline: string

/** What an agent's requests carry, so the label is written by one, as it is in the office. */
const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'made-up-writer',
  'x-mole-office-session': 'made-up-session',
}

/**
 * EVERY FIXTURE'S TITLE IS LONGER THAN THE LABEL, because the write door refuses a label that would say more than the
 * record it is a shorter form of.
 */
const TITLE = 'Made-up record that sorts the parcels by weight'
const LABEL = 'Sorting made-up parcels'

const FIRST_LINE = { kind: 'agent', id: 'made-up-first-line' } as const
const SECOND_LINE = { kind: 'agent', id: 'made-up-second-line' } as const

function aModule(): string {
  return t.api.createRecord({
    kind: 'module',
    title: TITLE,
    summary: 'It sorts the made-up parcels.',
    workspaceId: 'default',
    origin: 'fixture',
    actor: t.api.HUMAN,
    data: { owner: FIRST_LINE },
  }).id
}

/**
 * A step with no tier, as the blocks were before their tiers were written. Each has its own name, because two live
 * blocks of one pipeline may not answer to one name.
 */
let blocksMade = 0
function aBlock(): string {
  blocksMade += 1
  return t.blocks.addBlock(pipeline, { name: `${TITLE}, step ${String(blocksMade)}`, state: 'done' }, t.api.HUMAN).block.id
}

function aGoal(): string {
  return t.api.createRecord({
    kind: 'goal',
    title: TITLE,
    workspaceId: 'default',
    origin: 'fixture',
    actor: t.api.HUMAN,
    data: { horizon: 'short', what: 'The made-up parcels are sorted.', owner: 'made-up-first-owner', state: 'open' },
  }).id
}

/** Writes a label from the record's newest revision, which is the pair a writer has to send. */
async function label(recordId: string): Promise<void> {
  const entry = revisions.listRevisions(recordId).revisions[0]
  if (entry === undefined) throw new Error(`record ${recordId} has no revisions`)
  const reply = await app.inject({
    method: 'POST',
    url: `/api/records/${recordId}/short-forms`,
    headers: AS_AGENT,
    payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms: { label: LABEL } },
  })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
}

/** The label's row of the record's short forms, read through the door a page reads. */
async function labelRow(recordId: string): Promise<{ state: unknown; changedSince: unknown; says: unknown }> {
  const reply: LightMyRequestResponse = await app.inject({ method: 'GET', url: `/api/records/${recordId}/short-forms` })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  const levels = (reply.json() as { levels: Array<Record<string, unknown>> }).levels
  const row = levels.find((one) => one['level'] === 'label')
  if (row === undefined) throw new Error('the reading has no label row')
  return { state: row['state'], changedSince: row['changedSince'], says: row['says'] }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  revisions = await import('../src/server/lib/revisions.ts')
  pipeline = t.api.createRecord({
    kind: 'pipeline',
    title: 'Made-up pipeline',
    workspaceId: 'default',
    origin: 'fixture',
    actor: t.api.HUMAN,
    data: { blockIds: [] },
  }).id
  // THE FIRST REQUEST LOADS THE ROUTES, which can take longer than a case is given, so it is made here.
  const warm = aModule()
  await label(warm)
  await labelRow(warm)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a label after a change of owner or tier', () => {
  it('1. a module whose only change is its owner reads current', async () => {
    const id = aModule()
    await label(id)
    const fresh = await labelRow(id)
    expect(fresh.state).toBe('current')
    expect(String(fresh.says)).toContain('and nothing in the record has changed since.')
    t.api.patchRecord(id, { dataPatch: { owner: SECOND_LINE } }, t.api.HUMAN)
    expect(t.api.getRecord(id)?.data['owner'], 'the owner really moved').toEqual(SECOND_LINE)
    const row = await labelRow(id)
    expect(row.state).toBe('current')
    expect(row.changedSince).toEqual([])
    // THE OWNER DID CHANGE, so a sentence saying nothing had would be untrue.
    expect(String(row.says)).toContain('Since then only its owner has changed, and a label does not describe its owner.')
    expect(String(row.says)).not.toContain('nothing in the record has changed')
  })

  it('2. a block whose only change is its tier reads current', async () => {
    const id = aBlock()
    await label(id)
    t.api.patchRecord(id, { dataPatch: { tier: 'services' } }, t.api.HUMAN)
    expect(t.api.getRecord(id)?.data['tier'], 'the tier really was written').toBe('services')
    const row = await labelRow(id)
    expect(row.state).toBe('current')
    expect(row.changedSince).toEqual([])
    expect(String(row.says)).toContain('Since then only its tier has changed, and a label does not describe its tier.')
  })
})

describe('a label after a change to what the record says', () => {
  it('3. a module whose summary changed reads out of date, and names the summary', async () => {
    const id = aModule()
    await label(id)
    t.api.patchRecord(id, { summary: 'It sorts and weighs the made-up parcels.' }, t.api.HUMAN)
    const row = await labelRow(id)
    expect(row.state).toBe('out_of_date')
    expect(row.changedSince).toEqual(['summary'])
  })

  it('4. a module whose owner and summary changed reads out of date, and names the summary and not the owner', async () => {
    const id = aModule()
    await label(id)
    t.api.patchRecord(id, { summary: 'It sorts and weighs the made-up parcels.', dataPatch: { owner: SECOND_LINE } }, t.api.HUMAN)
    expect(t.api.getRecord(id)?.data['owner'], 'the owner really moved').toEqual(SECOND_LINE)
    const row = await labelRow(id)
    expect(row.state).toBe('out_of_date')
    expect(row.changedSince).toEqual(['summary'])
  })

  it('5. a block whose tier and summary changed reads out of date, and names the summary and not the tier', async () => {
    const id = aBlock()
    await label(id)
    t.api.patchRecord(id, { summary: 'It weighs the made-up parcels.', dataPatch: { tier: 'services' } }, t.api.HUMAN)
    expect(t.api.getRecord(id)?.data['tier'], 'the tier really was written').toBe('services')
    const row = await labelRow(id)
    expect(row.state).toBe('out_of_date')
    expect(row.changedSince).toEqual(['summary'])
  })

  it('6. a goal whose only change is its owner still reads out of date', async () => {
    const id = aGoal()
    await label(id)
    t.api.patchRecord(id, { dataPatch: { owner: 'made-up-second-owner' } }, t.api.HUMAN)
    const row = await labelRow(id)
    expect(row.state).toBe('out_of_date')
    expect(row.changedSince).toEqual(['data.owner'])
  })
})
