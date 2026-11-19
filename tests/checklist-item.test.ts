// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Changing ONE line of a checklist, without sending the checklist.
 *
 * The gap this closes was written down by an audit of the merge patch:
 *
 *   "The merge is shallow. Checklists, chart blocks and pipeline steps are all arrays, so the
 *    cheap edit path does not reach the content most likely to need editing."
 *
 * `mergeData` replaces arrays whole, deliberately — an index-wise merge cannot shorten a list and
 * scrambles a reordered one. The consequence was that ticking off a checklist line, the commonest
 * edit in the product, still meant GET the record, rewrite the array client-side, PATCH the whole
 * of `data` back: the exact read-modify-write the merge patch was built to remove, with a change
 * row holding the entire checklist twice.
 *
 * So these tests are not "does the state change". They check the four things that make the edit
 * worth having and the six refusals that stop it being a guess:
 *
 *   - the caller never has to hold the record: no GET, no array, no part id
 *   - ONE change row, naming the item, not a blob — and an id in the path, never an index
 *   - an unknown item id is refused and APPENDS NOTHING, which is the failure mode a silent
 *     upsert would have; the checklist is asserted to be the same length afterwards
 *   - the whole record is still checked, so a bad state cannot be written one field at a time
 *   - and the alarm panel's "how long has this been doing?" clock, which reads the change log,
 *     still sees the edit. The old reader only understood rows whose field was exactly `data`;
 *     a per-path row would have dated every item to the record's creation and said nothing.
 *
 * HOW THE HTTP TESTS ARE BUILT: as in tests/patch.test.ts. src/server/index.ts listens the moment
 * it is imported, so the same plugins are registered against a throwaway database instead.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import type { ApiIndex } from '../src/server/api/kinds.ts'
import { lastTouchedItem } from '../src/web/lib/attention.ts'
import { type Change, type PanelRecord } from '../src/shared/types.ts'

// ------------------------------------------------------------------------------ the harness

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { discoveryRoutes, trackApiRoutes } = await import('../src/server/api/kinds.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  const listRoutes = trackApiRoutes(app)
  await app.register(discoveryRoutes, { prefix: '/api', listRoutes, currentWorkspace: () => ({ current: 'default', stated: false }) })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function errorOf(res: { body: string }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

function recordOf(res: { body: string }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) {
    throw new Error(`expected a record, got ${res.body.slice(0, 200)}`)
  }
  return record as Record<string, unknown>
}

/** The checklist of a stored module, as plain objects, for the "nothing was appended" assertions. */
function partsOf(record: Pick<PanelRecord, 'data'>): { id: string; items: { id: string; state: string }[] }[] {
  const parts = (record.data as Record<string, unknown>)['parts']
  return parts as { id: string; items: { id: string; state: string }[] }[]
}

function itemIn(record: Pick<PanelRecord, 'data'>, itemId: string): Record<string, unknown> | null {
  for (const part of partsOf(record)) {
    for (const item of part.items as unknown as Record<string, unknown>[]) {
      if (item['id'] === itemId) return item
    }
  }
  return null
}

/** A module with three parts and seven lines: big enough that resending it is the cost being cut. */
function chestCamera(): Record<string, unknown> {
  return {
    context:
      'A ZED 2i over the chest, looking down the working volume. The wrist cameras lose the cube exactly ' +
      'when the arm moves into the grasp, so the chest camera carries detection.',
    parts: [
      {
        id: 'mount',
        name: 'Mount and rigid transform',
        items: [
          { id: 'mount-1', text: 'Print the chest bracket in PETG', state: 'done', hours: 3 },
          { id: 'mount-2', text: 'Measure camera-to-base by hand, 12 poses', state: 'done', hours: 5 },
          { id: 'mount-3', text: 'Re-measure after the mast knock', state: 'doing' },
        ],
      },
      {
        id: 'detect',
        name: 'Cube detection',
        items: [
          { id: 'det-1', text: 'Colour segmentation baseline', state: 'done', hours: 4 },
          { id: 'det-2', text: 'Latency budget under 60 ms end to end', state: 'doing', hours: 6 },
          { id: 'det-3', text: 'Handle the specular top face', state: 'failed', note: 'the top face blows out' },
        ],
      },
      {
        id: 'handoff',
        name: 'Handoff to the wrist cameras',
        items: [{ id: 'hand-1', text: 'Agree the frame the wrist expects', state: 'todo' }],
      },
    ],
    summary: 'Mounted, calibrated, detecting.',
  }
}

function seedModule(h: Harness, title = 'chest camera'): PanelRecord {
  return h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title, data: chestCamera(), actor: AGENT })
}

/**
 * One checklist edit over HTTP. `inject` hands back a chainable object rather than a plain
 * promise, so it is awaited here — the same reason tests/patch.test.ts awaits inside its helpers.
 */
const tick = async (h: Harness, id: string, itemId: string, payload: Record<string, unknown>) =>
  await h.app.inject({
    method: 'PATCH',
    url: `/api/records/${id}/checklist/${itemId}`,
    headers: AS_AGENT,
    payload,
  })

// ============================================================ 1. the edit the audit asked for

describe('PATCH /api/records/:id/checklist/:itemId', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  it('changes one item from a body that names only that item, with no GET first', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', { state: 'done', hours: 2 })

    expect(res.statusCode).toBe(200)
    // The caller sent 30-odd bytes and never held the checklist. That is the whole point: the
    // request can be built by an agent that has only the module id and the item id.
    expect(itemIn(recordOf(res) as unknown as PanelRecord, 'mount-3')).toEqual({
      id: 'mount-3',
      text: 'Re-measure after the mast knock',
      state: 'done',
      hours: 2,
    })

    // Everything else is untouched, including the other item in the same part.
    const stored = h.db.api.getRecord(module.id) as PanelRecord
    expect(itemIn(stored, 'mount-2')).toEqual({
      id: 'mount-2',
      text: 'Measure camera-to-base by hand, 12 poses',
      state: 'done',
      hours: 5,
    })
    expect((stored.data as Record<string, unknown>)['summary']).toBe('Mounted, calibrated, detecting.')
  })

  it('finds the item without being told which part it is in, and says which part that was', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'hand-1', { state: 'doing' })
    expect(res.statusCode).toBe(200)
    // A caller that had to know the part id would have to read the record to find it, which is
    // the round trip this endpoint exists to remove. It is REPORTED, not required.
    expect(bodyOf(res)['partId']).toBe('handoff')
  })

  it('deletes an optional key with null, exactly as a merge patch does', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'det-3', { state: 'doing', note: null })
    expect(res.statusCode).toBe(200)
    expect(itemIn(recordOf(res) as unknown as PanelRecord, 'det-3')).toEqual({
      id: 'det-3',
      text: 'Handle the specular top face',
      state: 'doing',
    })
    const outcome = bodyOf(res)['itemPatch'] as Record<string, unknown>
    // A delete is the one edit whose effect cannot be seen by reading back what was sent, so it
    // is named in the response rather than left to be inferred.
    expect(outcome['deleted']).toEqual(['data.parts[#detect].items[#det-3].note'])
  })

  it('reports a key that already held the value sent, and writes nothing at all for it', async () => {
    const module = seedModule(h)
    const before = h.db.api.getRecord(module.id) as PanelRecord
    const res = await tick(h, module.id, 'mount-1', { state: 'done' })

    expect(res.statusCode).toBe(200)
    const outcome = bodyOf(res)['itemPatch'] as Record<string, unknown>
    expect(outcome['unchanged']).toEqual(['data.parts[#mount].items[#mount-1].state'])
    expect(outcome['changed']).toEqual([])

    // Not even updatedAt moves. It is the order the home page lists modules in, and lifting a
    // module to the top of the page for a write that changed none of it is a visible lie.
    const after = h.db.api.getRecord(module.id) as PanelRecord
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update')).toEqual([])
  })

  it('reports what the record still wants, like every other write that carries a record', async () => {
    const bare = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'bare module',
      data: { parts: [{ id: 'p', name: 'Part', items: [{ id: 'p-1', text: 'a line', state: 'todo' }] }] },
      actor: AGENT,
    })
    const res = await tick(h, bare.id, 'p-1', { state: 'doing' })
    expect(res.statusCode).toBe(200)
    // `context` is still missing, and the response says so — a 200 that said nothing would be
    // the same silence every other write path was fixed for.
    expect(JSON.stringify(bodyOf(res)['incomplete'])).toContain('data.context')
    expect(String(bodyOf(res)['incompleteNote'])).toContain('incomplete')
  })
})

// ============================================================ 2. one change row, naming the item

describe('the change log a checklist edit writes', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  it('writes ONE row per key that moved, named for the item, with the old and new value', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'mount-3', { state: 'done' })

    const rows = h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update')
    const row = one(rows, 'change row')
    expect(row.field).toBe('data.parts[#mount].items[#mount-3].state')
    expect(row.oldValue).toBe('doing')
    expect(row.newValue).toBe('done')

    // The row is the size of the edit, not the size of the record. This is the accounting the
    // audit complained about: 6.2 kB of change log for a one-word fix.
    expect((row.oldValue ?? '').length + (row.newValue ?? '').length).toBeLessThan(20)
  })

  it('names the item by ID and never by index, because an index moves when a list is reordered', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'det-2', { state: 'done' })
    const row = one(
      h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update'),
      'change row',
    )
    expect(row.field).toBe('data.parts[#detect].items[#det-2].state')
    // Not `parts[1].items[1]`. If it were, reordering the parts tomorrow would make this row
    // describe a different line, silently, and the history would be worse than absent.
    expect(row.field).not.toMatch(/\[\d+\]/)
  })

  it('writes two rows for two keys, and no row for a key that did not move', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'det-2', { state: 'failed', note: 'p95 is 88 ms', hours: 6 })

    const fields = h.db.api
      .listChanges({ workspaceId: 'default', recordId: module.id })
      .filter((c) => c.op === 'update')
      .map((c) => c.field)
      .sort()
    expect(fields).toEqual([
      'data.parts[#detect].items[#det-2].note',
      'data.parts[#detect].items[#det-2].state',
    ])
    // `hours` was already 6. A row saying 6 -> 6 is a row that makes the history longer and less
    // true at the same time.
  })

  it('records who made the edit and in which session', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'hand-1', { state: 'doing' })
    const row = one(
      h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update'),
      'change row',
    )
    expect(row.actorType).toBe('agent')
    expect(row.actorId).toBe('claude-code')
    expect(row.sessionId).toBe('sess-test')
  })
})

// ============================================================ 3. what it refuses, and why

// ================================================== 2b. adding one, which used to mean the array

/**
 * The counterpart that was missing, and the reason the refusal beside it is livable.
 *
 * `PATCH .../checklist/:itemId` could change a line and deliberately refused to invent one, so
 * ADDING a line meant GET the record, splice `data.parts` in the client, PATCH the whole array
 * back — a read-modify-write on the one array two agents are both likely to be editing. Four agents
 * did exactly that in one night; two of them collided and a whole checklist was replaced behind a
 * 200. That collision is reproduced in tests/patch.test.ts. This is the write that has nothing to
 * lose, because it carries the line rather than the list.
 */
describe('POST /api/records/:id/checklist', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  const add = async (id: string, payload: Record<string, unknown>) =>
    await h.app.inject({ method: 'POST', url: `/api/records/${id}/checklist`, headers: AS_AGENT, payload })

  it('adds one line to the part it names, leaves every other line exactly as it was, and refuses to guess', async () => {
    const module = seedModule(h)
    const before = h.db.api.getRecord(module.id) as PanelRecord

    const res = await add(module.id, {
      partId: 'detect',
      id: 'det-4',
      text: 'Reject the specular frame instead of fitting it',
      state: 'todo',
      note: 'the top face blows out at 30 cm',
    })
    expect(res.statusCode).toBe(201)
    expect(bodyOf(res)['partId']).toBe('detect')

    // AT THE END OF THE PART IT NAMED, and nowhere else. Every other line is byte-identical, which
    // is the property the whole-array rewrite could not offer.
    const stored = h.db.api.getRecord(module.id) as PanelRecord
    expect(partsOf(stored).map((p) => p.items.map((i) => i.id))).toEqual([
      ['mount-1', 'mount-2', 'mount-3'],
      ['det-1', 'det-2', 'det-3', 'det-4'],
      ['hand-1'],
    ])
    for (const id of ['mount-1', 'mount-2', 'mount-3', 'det-1', 'det-2', 'det-3', 'hand-1']) {
      expect(JSON.stringify(itemIn(stored, id))).toBe(JSON.stringify(itemIn(before, id)))
    }
    expect(itemIn(stored, 'det-4')).toEqual({
      id: 'det-4',
      text: 'Reject the specular frame instead of fitting it',
      state: 'todo',
      note: 'the top face blows out at 30 cm',
    })

    // ONE change row, naming the item by its id, holding the new line and nothing else — not the
    // whole checklist twice, which is what the array rewrite wrote.
    const rows = h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.field).toBe('data.parts[#detect].items[#det-4]')
    expect(rows[0]?.oldValue).toBeNull()
    expect(JSON.parse(String(rows[0]?.newValue)) as unknown).toEqual(itemIn(stored, 'det-4'))

    // NO PART IS PICKED FOR YOU. A line filed under a heading nobody chose reads afterwards as
    // somebody else's work, so an unknown part is refused with the parts that do exist.
    const nowhere = await add(module.id, { partId: 'detekt', id: 'det-5', text: 'x', state: 'todo' })
    expect(nowhere.statusCode).toBe(404)
    expect(errorOf(nowhere)).toContain('mount, detect, handoff')

    // AN ID ALREADY IN USE IS REFUSED rather than duplicated: a second line with one id is the
    // state that makes `PATCH .../checklist/:itemId` unable to answer at all.
    const taken = await add(module.id, { partId: 'mount', id: 'det-1', text: 'x', state: 'todo' })
    expect(taken.statusCode).toBe(400)
    expect(errorOf(taken)).toContain('"detect"')

    // A LINE WITH NO TEXT is refused by the same whole-record gate every other write goes through.
    const halfWritten = await add(module.id, { partId: 'mount', id: 'mount-4', state: 'todo' })
    expect(halfWritten.statusCode).toBe(400)
    expect(errorOf(halfWritten)).toContain('text')

    // Every one of those three wrote nothing at all.
    expect(JSON.stringify(h.db.api.getRecord(module.id)?.data)).toBe(JSON.stringify(stored.data))

    // AND A PART ID USED TWICE IS REFUSED rather than written to both. The write matches parts by
    // id, so without this the one line would land in two places at once and the caller would be
    // told it landed in one — the same shape of damage the duplicate ITEM id refusal exists for,
    // one level up. A hand-written checklist really can be in this state.
    const twinned = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'two parts, one id',
      data: { context: 'why', parts: [{ id: 'one', name: 'One', items: [] }, { id: 'two', name: 'Two', items: [] }] },
      actor: AGENT,
    })
    // Round the gate, for the same reason as the duplicate ITEM id below: `validateData` refuses
    // two ModuleParts in one record sharing an id, and this refusal is the reader's.
    writeDataBypassingTheGate(h.db, twinned.id, {
      context: 'why',
      parts: [{ id: 'p', name: 'One', items: [] }, { id: 'p', name: 'Two', items: [] }],
    })
    const ambiguous = await add(twinned.id, { partId: 'p', id: 'p-1', text: 'x', state: 'todo' })
    expect(ambiguous.statusCode).toBe(400)
    expect(errorOf(ambiguous)).toContain('2 parts with id "p"')
    const parts = partsOf(h.db.api.getRecord(twinned.id) as PanelRecord)
    expect(parts.map((p) => p.items.length)).toEqual([0, 0])
  })
})

describe('what a checklist edit refuses', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  it('refuses an unknown item id, appends nothing, and lists the ids that do exist', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-9', { state: 'done' })

    expect(res.statusCode).toBe(404)
    const message = errorOf(res)
    expect(message).toContain('mount-9')
    // The alternatives are in the message. A 404 with no alternatives is what sends a caller to
    // read the source, which is the failure this whole surface exists to end.
    expect(message).toContain('mount-3')
    expect(message).toContain('det-2')
    expect(message).toContain('Nothing was appended')

    // THE ASSERTION THAT MATTERS: the checklist is untouched. A silent upsert would have put the
    // tick somewhere, and the writer would have believed it.
    const stored = h.db.api.getRecord(module.id) as PanelRecord
    expect(partsOf(stored).flatMap((p) => p.items.map((i) => i.id))).toEqual([
      'mount-1',
      'mount-2',
      'mount-3',
      'det-1',
      'det-2',
      'det-3',
      'hand-1',
    ])
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update')).toEqual([])
  })

  it('says so plainly when the checklist has no items at all', async () => {
    const empty = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'nothing on it yet',
      data: { context: 'why', parts: [] },
      actor: AGENT,
    })
    const res = await tick(h, empty.id, 'mount-1', { state: 'done' })
    expect(res.statusCode).toBe(404)
    expect(errorOf(res)).toContain('no items at all')
  })

  it('refuses an id used twice rather than picking one, and names both parts', async () => {
    const data = chestCamera()
    const parts = data['parts'] as { id: string; items: Record<string, unknown>[] }[]
    // A checklist written before the rule below existed really can be in this state, and it is
    // exactly the state where guessing does invisible damage.
    parts[2]?.items.push({ id: 'mount-3', text: 'a duplicate id', state: 'todo' })
    // WRITTEN ROUND THE GATE ON PURPOSE. `validateData` now refuses two ProgressItems in one record
    // sharing an id, so this module cannot be created through any write path. The refusal under
    // test is the reader's, and the reader still meets rows written before that rule and rows an
    // import puts back, so the state has to be buildable here. See writeDataBypassingTheGate.
    const module = h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'duplicated', data: chestCamera(), actor: AGENT })
    writeDataBypassingTheGate(h.db, module.id, data)

    const res = await tick(h, module.id, 'mount-3', { state: 'done' })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('"mount"')
    expect(errorOf(res)).toContain('"handoff"')
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: module.id }).filter((c) => c.op === 'update')).toEqual([])
  })

  it('refuses a key a checklist item does not have, and names the keys it does', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', { stat: 'done' })
    expect(res.statusCode).toBe(400)
    const message = errorOf(res)
    expect(message).toContain('did you mean "state"?')
    expect(message).toContain('id, text, state, note, hours')
    expect(message).toContain('GET /api/kinds/module')
  })

  it('refuses to rewrite the item id, because the id is what dates the item', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', { id: 'mount-4' })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('may not be changed here')
    expect(itemIn(h.db.api.getRecord(module.id) as PanelRecord, 'mount-3')).not.toBeNull()
  })

  it('refuses an empty body rather than answering 200 for a change nobody made', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', {})
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('Nothing to change')
  })

  it('refuses a value outside the item vocabulary, and stores nothing', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', { state: 'nearly done' })
    expect(res.statusCode).toBe(400)
    // The merged item is checked as part of the WHOLE record, which is why this reads like every
    // other refusal in the product rather than like a second, weaker gate.
    expect(errorOf(res)).toContain('todo')
    expect(errorOf(res)).toContain('blocked')
    expect(itemIn(h.db.api.getRecord(module.id) as PanelRecord, 'mount-3')?.['state']).toBe('doing')
  })

  it('refuses to null a key the item needs, so a line cannot be half-emptied', async () => {
    const module = seedModule(h)
    const res = await tick(h, module.id, 'mount-3', { state: null })
    expect(res.statusCode).toBe(400)
    expect(itemIn(h.db.api.getRecord(module.id) as PanelRecord, 'mount-3')?.['state']).toBe('doing')
  })

  it('refuses a record that is not a module, and says what to use instead', async () => {
    const note = h.db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'a note', data: { body: 'x' }, actor: AGENT })
    const res = await tick(h, note.id, 'anything', { state: 'done' })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('Only a module has a checklist')
    expect(errorOf(res)).toContain('dataPatch')
  })

  it('refuses a module with no parts array, and says how to write one', async () => {
    const stub = h.db.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'stub', actor: AGENT })
    const res = await tick(h, stub.id, 'mount-1', { state: 'done' })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('no `parts` array')
  })

  it('404s on a record that does not exist, rather than creating one', async () => {
    const res = await tick(h, 'nosuchrecord', 'mount-1', { state: 'done' })
    expect(res.statusCode).toBe(404)
    expect(h.db.api.listRecords({ workspaceId: 'default' })).toHaveLength(0)
  })
})

// ============================================================ 4. discoverable without the source

describe('an agent can find this without reading the source', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  it('is listed at GET /api with a sentence saying what it is for', async () => {
    const index = bodyOf(await h.app.inject({ method: 'GET', url: '/api' })) as unknown as ApiIndex
    const entry = index.endpoints.find(
      (e) => e.method === 'PATCH' && e.path === '/api/records/:id/checklist/:itemId',
    )
    expect(entry, 'the endpoint is not in GET /api, so nobody can find it').toBeDefined()
    expect(entry?.description ?? '').toContain('ONE line')
    // The sentence has to carry the body shape, because that is what a caller needs next.
    expect(entry?.description ?? '').toContain('{"state":"done"}')
  })

  it('is named by GET /api/kinds/module, on the field it is an alternative to', async () => {
    const body = bodyOf(await h.app.inject({ method: 'GET', url: '/api/kinds/module' }))
    const text = JSON.stringify(body)
    // Somebody reading about `parts` in order to edit a checklist is exactly the person who must
    // be told not to send `parts` for a one-line change.
    expect(text).toContain('/checklist/')
    expect(text).toContain('TO CHANGE ONE LINE, DO NOT SEND THIS FIELD')
  })

  it('answers a wrong spelling of the path with the endpoint list, as every /api path does', async () => {
    const res = await h.app.inject({ method: 'PATCH', url: '/api/records/x/checklists/y', payload: {} })
    expect(res.statusCode).toBe(404)
  })
})

// ============================================================ 5. the clock on the alarm panel

describe('the "how long has this been doing?" clock still sees the edit', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  /** The change log as the browser receives it: newest first, plain objects. */
  function log(id: string): Change[] {
    return h.db.api.listChanges({ workspaceId: 'default', recordId: id }).map(
      (c) =>
        ({
          id: c.id,
          recordId: c.recordId,
          op: c.op,
          actorType: c.actorType,
          actorId: c.actorId,
          sessionId: c.sessionId,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          at: c.at,
        }) as Change,
    )
  }

  it('dates an item from the per-path row this endpoint writes', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'mount-3', { state: 'blocked', note: 'waiting on the reprint' })
    const after = h.db.api.getRecord(module.id) as PanelRecord

    const rows = log(module.id)
    const stateRow = one(
      rows.filter((c) => c.field === 'data.parts[#mount].items[#mount-3].state'),
      'state row',
    )
    const touch = lastTouchedItem(rows, after, 'mount-3', { complete: true, oldestSeen: null })
    expect(touch.at).toBe(stateRow.at)
    expect(touch.exact).toBe(true)

    // ...and the proof that the per-path row is what carried it. Before this endpoint existed,
    // lastTouchedItem understood only rows whose field was exactly `data`; hide the new rows and
    // the answer falls back to "unchanged since the record was created" — a stale-doing item
    // silently ageing from the wrong date, with nothing on the page looking wrong. That is the
    // failure this test exists for, and this is the line that would catch it coming back.
    const blind = rows.filter((c) => c.field === 'data')
    expect(lastTouchedItem(blind, after, 'mount-3', { complete: true, oldestSeen: null }).at).toBe(
      after.createdAt,
    )
  })

  it('does not date an item from an edit to another item', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'det-2', { state: 'done' })
    const after = h.db.api.getRecord(module.id) as PanelRecord
    const touch = lastTouchedItem(log(module.id), after, 'mount-3', { complete: true, oldestSeen: null })
    expect(touch.at).toBe(after.createdAt)
  })

  it('ignores an hours-only edit, exactly as the whole-bag reader always has', async () => {
    const module = seedModule(h)
    await tick(h, module.id, 'mount-3', { hours: 9 })
    const after = h.db.api.getRecord(module.id) as PanelRecord
    const touch = lastTouchedItem(log(module.id), after, 'mount-3', { complete: true, oldestSeen: null })
    // If this counted, the SAME edit would date differently depending on which endpoint made it,
    // and nothing on the page would look wrong. Consistency beats completeness here.
    expect(touch.at).toBe(after.createdAt)
  })

  it('also sees a checklist rewritten through dataPatch, which it never used to', async () => {
    const module = seedModule(h)
    const parts = JSON.parse(JSON.stringify(chestCamera()['parts'])) as {
      items: { id: string; state: string }[]
    }[]
    const first = parts[0]?.items[2]
    if (first) first.state = 'blocked'
    // `ifVersion` BECAUSE THIS REWRITES A LINE. A write that hands back the whole array and changes
    // a line inside it is refused unless it says which version it was built against — see
    // tests/patch.test.ts, "refuses a stale copy that REWRITES a line". This test is about the
    // change log seeing the edit, not about concurrency, so it says what it read and moves on.
    const before = await h.app.inject({ method: 'GET', url: `/api/records/${module.id}` })
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { parts }, ifVersion: bodyOf(before)['version'] },
    })
    expect(res.statusCode).toBe(200)

    const after = h.db.api.getRecord(module.id) as PanelRecord
    const rows = log(module.id)
    const partsRow = one(rows.filter((c) => c.field === 'data.parts'), 'parts row')
    const touch = lastTouchedItem(rows, after, 'mount-3', { complete: true, oldestSeen: null })
    // The row's field is `data.parts`, not `data`. That was the other half of the same blind
    // spot, and it was already reachable before this endpoint was written.
    expect(touch.at).toBe(partsRow.at)
    expect(touch.exact).toBe(true)
    const blind = rows.filter((c) => c.field === 'data')
    expect(lastTouchedItem(blind, after, 'mount-3', { complete: true, oldestSeen: null }).at).toBe(
      after.createdAt,
    )
  })
})

// ============================================================ 6. the saving, measured

describe('the gap the audit named, measured', () => {
  let h: Harness
  beforeEach(async () => {
    h = await freshApp()
  })
  afterEach(async () => {
    await h.app.close()
    h.db.close()
  })

  const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

  function changeBytes(id: string): number {
    return h.db.api
      .listChanges({ workspaceId: 'default', recordId: id })
      .filter((c) => c.op === 'update')
      .reduce((n, c) => n + bytes(c.oldValue ?? '') + bytes(c.newValue ?? ''), 0)
  }

  it('ticks one line for a fraction of the bytes, and one row instead of the whole checklist twice', async () => {
    const wholesale = seedModule(h, 'chest camera, ticked wholesale')
    const item = seedModule(h, 'chest camera, ticked by id')

    // ---- today: read the record, rewrite the array, send all of `data` back
    const read = await h.app.inject({ method: 'GET', url: `/api/records/${wholesale.id}` })
    const current = (recordOf(read)['data'] ?? {}) as Record<string, unknown>
    const rewritten = JSON.parse(JSON.stringify(current)) as {
      parts: { items: { id: string; state: string }[] }[]
    }
    for (const part of rewritten.parts) {
      for (const line of part.items) if (line.id === 'mount-3') line.state = 'done'
    }
    // The version that read handed back, because the wholesale path now has to say what it read
    // before it may rewrite a line. It is counted in the bytes below like everything else — it is
    // 16 hex characters, and the comparison this test makes is unaffected by it.
    const wholeBody = JSON.stringify({ data: rewritten, ifVersion: bodyOf(read)['version'] })
    const wholeWrite = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${wholesale.id}`,
      headers: AS_AGENT,
      payload: JSON.parse(wholeBody),
    })
    expect(wholeWrite.statusCode).toBe(200)
    const oldWire = bytes(read.body) + bytes(wholeBody) + bytes(wholeWrite.body)
    const oldRows = changeBytes(wholesale.id)

    // ---- now: one call naming one item and one key
    const itemBody = JSON.stringify({ state: 'done' })
    const itemWrite = await tick(h, item.id, 'mount-3', JSON.parse(itemBody))
    expect(itemWrite.statusCode).toBe(200)
    const newWire = bytes(itemBody) + bytes(itemWrite.body)
    const newRows = changeBytes(item.id)

    // Both routes produced the same checklist. The saving is in what it cost, not what it did.
    expect(partsOf(h.db.api.getRecord(item.id) as PanelRecord)).toEqual(
      partsOf(h.db.api.getRecord(wholesale.id) as PanelRecord),
    )

    // The request an agent has to BUILD is the number that decides whether it uses this at all.
    expect(bytes(itemBody)).toBeLessThan(bytes(wholeBody) / 50)
    expect(newRows).toBeLessThan(oldRows / 50)
    expect(newWire).toBeLessThan(oldWire / 2)

    /* eslint-disable no-console -- the measurement is the point of this test */
    console.log(
      [
        '',
        '  ticking one checklist line on a 7-line module',
        '                        requests   request bytes   response bytes   total wire   change rows',
        `    rewrite the array          2   ${String(bytes(wholeBody)).padStart(13)}   ${String(
          bytes(read.body) + bytes(wholeWrite.body),
        ).padStart(14)}   ${String(oldWire).padStart(10)}   ${String(oldRows).padStart(11)}`,
        `    /checklist/<itemId>        1   ${String(bytes(itemBody)).padStart(13)}   ${String(
          bytes(itemWrite.body),
        ).padStart(14)}   ${String(newWire).padStart(10)}   ${String(newRows).padStart(11)}`,
        '',
        `  the row it wrote: ${h.db.api
          .listChanges({ workspaceId: 'default', recordId: item.id })
          .filter((c) => c.op === 'update')
          .map((c) => `${c.field} | ${c.oldValue ?? '(absent)'} -> ${c.newValue ?? '(removed)'}`)
          .join(' ; ')}`,
        '',
      ].join('\n'),
    )
  })
})

// ============================================================ the decision not to promote them

/**
 * A CHECKLIST ITEM STAYS NESTED, ON PURPOSE.
 *
 * Decided 2026-08-11. A pipeline step used to be a nested object too and became the `block` record
 * kind, because nothing could link to one — a problem or an obligation about a step had nowhere to
 * attach. That precedent is real and it is the wrong reason to move a checklist item: nothing has
 * yet needed to attach an independent record, link or history to ONE checklist line, and promoting
 * them because the nearest shape was promoted is speculative abstraction.
 *
 * WHY THIS IS A TEST AND NOT ONLY A COMMENT. "Leave them in `data`" needs no code, so a decided
 * non-feature and an unanswered question look identical from the tree — which is exactly what an
 * audit found on 2026-08-11, when no answer to this was recorded anywhere in the repository. The
 * assertion below is what makes the decision visible from the outside: the next person to consider
 * promoting checklist items meets it and has to argue with it, rather than finding what looks like
 * a half-finished migration and finishing it.
 *
 * WHAT WOULD REOPEN IT: real use showing a recurring need to attach records, links or history to a
 * single checklist item. Not the block precedent, and not tidiness. If that day comes, delete this
 * describe block in the same commit that adds the kind — a decision reversed on purpose, not a test
 * worked around.
 */
describe('a checklist item is deliberately not a record', () => {

  it('keeps the per-item semantics that made promoting it unnecessary', async () => {
    // A stable id, edited on its own, with a change row that names the item. This is the whole of
    // what promoting the item would have bought, minus the links nobody has asked for — so it is
    // asserted here, beside the decision, rather than left implied by the tests further up.
    const h = await freshApp()
    try {
      const module = seedModule(h)
      const res = await tick(h, module.id, 'mount-3', { state: 'done' })
      expect(res.statusCode, res.body).toBe(200)

      const rows = h.db.api
        .listChanges({ workspaceId: 'default', recordId: module.id })
        .filter((c) => (c.field ?? '').includes('mount-3'))
      expect(rows.length, 'the item edit wrote no change row naming the item').toBeGreaterThan(0)
    } finally {
      await h.app.close()
      h.db.close()
    }
  })
})
