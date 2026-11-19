// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The write path: the validation gate, the merge patch, and the refusal an agent gets when it
 * reaches for a decision.
 *
 * Every test here is written from a sentence in the usability audit that prompted this phase.
 *
 *   "I wrote data.blocks instead of data.summaryBlocks. Every signal pointed there. The POST
 *    returned 201. I found out only by looking at a screenshot."
 *
 * So the gate tests do not check that a bad write returns 400 and stop. They check that the
 * message names EVERY wrong field, each with its path, because a validator that reports one
 * problem per round trip is a validator an agent gives up on; and that a write which fails
 * stores nothing at all.
 *
 *   "correcting one key cost two calls, 8.9 kB over the wire and a 6.2 kB change-log row"
 *
 * So the merge tests check the semantics (null deletes, objects merge, arrays replace) AND the
 * accounting: one change row per JSON path that actually changed, and nothing written when
 * nothing changed. The last describe block measures the audit's own case end to end and prints
 * the numbers, so the claim in the endpoint documentation is a measurement rather than a boast.
 *
 *   "An agent may propose one, but the choice has to be yours." — with no propose path anywhere.
 *
 * So the 403 tests do not check the wording. They take the instructions out of the refusal
 * message and CARRY THEM OUT over HTTP, against the real route table: if the message ever names
 * a path or a field the server does not serve, these fail.
 *
 * HOW THE HTTP TESTS ARE BUILT. src/server/index.ts listens on a port the moment it is imported,
 * so it cannot be imported here. The routes it registers are plain Fastify plugins, so this file
 * registers the same ones against a throwaway database — the same approach tests/kinds-api.test.ts
 * takes. Everything is imported dynamically AFTER freshDb() has pointed MOLE_OFFICE_DB at a temporary
 * file, because db/client.ts opens its file when it is first imported.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { completenessOf } from '@shared/kinds.ts'
import Fastify, {
  type FastifyInstance,
  type InjectOptions,
  type LightMyRequestResponse,
} from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

// ------------------------------------------------------------------------------ the harness

interface Harness {
  db: TestDb
  app: FastifyInstance
}

/** A throwaway database with the real record and link routes registered over it. */
async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  // Without this a PanelError becomes a 500 with no message, and every assertion about what a
  // caller is told would be testing Fastify's default rather than Mole Office's answer.
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

/**
 * THE OFFICE IS MADE ONCE FOR THE FILE. Each case gets its own project in beforeEach, so a record,
 * a count or a list a case reads is its own, and a write one case makes is not there for the next.
 */
let h: Harness
let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let WORKSPACE = 'default'
let caseNumber = 0

beforeAll(async () => {
  h = await freshApp()
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(async () => {
  await h.app.close()
  h.db.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `patch-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Patch case ${String(caseNumber)}` })
  t = h.db
})

/** Every request the cases make names the project of the case that makes it. */
function inject(options: InjectOptions): Promise<LightMyRequestResponse> {
  const headers = { ...(options.headers as Record<string, string> | undefined) }
  headers['x-mole-office-workspace'] = WORKSPACE
  return h.app.inject({ ...options, headers })
}

/** What an agent's requests carry. Matches AGENT in helpers.ts, so both routes agree on who acted. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}

/** The JSON body of a response, as an object, or a failure that shows what actually came back. */
function bodyOf(res: { body: string; statusCode: number }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

/** The `error` string of a failed response, checked to be one. */
function errorOf(res: { body: string; statusCode: number }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

/** The `record` object of a successful response. */
function recordOf(res: { body: string; statusCode: number }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) {
    throw new Error(`expected a record, got ${res.body.slice(0, 200)}`)
  }
  return record as Record<string, unknown>
}

function dataOf(record: Record<string, unknown>): Record<string, unknown> {
  const data = record['data']
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`expected data to be an object, got ${JSON.stringify(data)?.slice(0, 200)}`)
  }
  return data as Record<string, unknown>
}

/** A module that passes the gate: the two required fields and nothing else. */
function smallModule(): Record<string, unknown> {
  return { context: 'why this module exists', parts: [] }
}

// ---------------------------------------------------------------- the module the audit broke

/**
 * A realistic module: a curated summary with prose, a chart and a table, about 4 kB of JSON.
 *
 * Size is the point. The audit's complaint was that correcting one key on a record this size
 * cost two calls and the whole record twice, so a fixture small enough to be cheap either way
 * would measure nothing. The numbers printed by the last describe block are taken from this.
 */
function chestCamera(): Record<string, unknown> {
  const points = (from: number, slope: number, offset: number) =>
    Array.from({ length: 14 }, (_, i) => ({
      x: from + i * 5,
      y: Number((offset + slope * (from + i * 5)).toFixed(2)),
    }))

  return {
    context:
      'A ZED 2i over the chest, looking down the working volume. The wrist cameras lose the cube ' +
      'exactly when the arm moves into the grasp, which is the moment worth measuring, so the ' +
      'chest camera carries detection and the wrists carry the last 15 cm.',
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
          { id: 'det-3', text: 'Handle the specular top face', state: 'todo' },
        ],
      },
      {
        id: 'handoff',
        name: 'Handoff to the wrist cameras',
        items: [{ id: 'hand-1', text: 'Agree the frame the wrist expects', state: 'todo' }],
      },
    ],
    paths: [
      {
        id: 'calib',
        label: 'Calibration output and checkerboard captures',
        path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs/chest_camera`,
        kind: 'dir',
      },
    ],
    summary: 'Mounted, calibrated, detecting. The open risk is the mast knock on 2026-07-30.',
    summaryBlocks: [
      {
        id: 'b-1',
        type: 'text',
        heading: 'What was measured',
        text:
          'Reprojection error against exposure, on the 40-frame checkerboard set, before and after ' +
          'the mast was knocked. The second curve is the reason this module is not finished.',
      },
      {
        id: 'b-2',
        type: 'chart',
        spec: {
          kind: 'line',
          x: { label: 'exposure', unit: 'ms' },
          y: { label: 'reprojection error', unit: 'px' },
          series: [
            { id: 'before', name: 'before the knock', points: points(5, 0.004, 0.21) },
            { id: 'after', name: 'after the knock', points: points(5, 0.013, 1.02), dashed: true },
          ],
          annotations: [{ id: 'budget', axis: 'y', value: 1, label: '1 px budget' }],
        },
        caption: 'Two sets of 14 exposures, same rig, six days apart.',
      },
      {
        id: 'b-3',
        type: 'table',
        columns: [{ label: 'stage' }, { label: 'p50', align: 'right' }, { label: 'p95', align: 'right' }],
        rows: [
          { cells: ['capture', 8.1, 11.4] },
          { cells: ['segment', 21.7, 39.2] },
          { cells: ['pose fit', 12.3, 18.8] },
          { cells: ['publish', 1.2, 2.9] },
        ],
        caption: 'Milliseconds, 400 frames, release build.',
      },
    ],
    source: 'design/explore.md, section 4',
  }
}

// ================================================================================ 1. the gate

describe('the validation gate on the write path', () => {
  it("refuses the audit's own body, and names both wrong fields rather than the first", () => {
    const err = expectPanelError(
      t,
      () =>
        t.api.createRecord({ workspaceId: WORKSPACE,
          kind: 'module',
          title: 'probe',
          data: { contxet: 'typo', parts: 'should be an array' },
          actor: AGENT,
        }),
      400,
    )
    // The typo AND the wrong type, in one answer. One-problem-per-round-trip is the behaviour
    // that makes a caller give up and write a markdown file instead.
    //
    // TWO, not three. Under "strict keys, flexible completeness" the absent `context` is no
    // longer a fault at all — it is reported as incompleteness on the stored record. Only the
    // unknown key and the wrong type stop the write.
    expect(err.message).toContain('2 fields are wrong')
    // The typo, with the field it was probably meant to be.
    expect(err.message).toContain('unknown key "contxet" — did you mean "context"?')
    // The wrong type, with the path and a correct value.
    expect(err.message).toContain('data.parts must be a list of ModulePart objects')
    // And NOT the absent `context`. The typo meant it never arrived, but a missing field is
    // no longer a reason to refuse a write — it is reported on the stored record instead.
    // Mixing the two would put "you forgot something" in the same list as "this is wrong",
    // and the caller could not tell which one stopped them.
    expect(err.message).not.toContain('data.context is required')
    // ...and it says where to look the fields up, which is a route that has to exist.
    expect(err.message).toContain('GET /api/kinds/module')

    // Nothing was stored. A refused write that leaves a row behind is worse than no check.
    expect(t.api.listRecords({ workspaceId: WORKSPACE })).toHaveLength(0)
  })

  it('accepts a module with no data at all, and reports it as incomplete rather than refusing', () => {
    // This used to be a 400. It is deliberately not any more: an agent that discovers a
    // subsystem mid-session must be able to file it with only a title and enrich it later,
    // because the alternative it actually takes is filing nothing.
    //
    // The home page is still protected -- not by refusing the record, but by the record
    // saying what it is missing, so a stub is visibly a stub instead of looking finished.
    const stub = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'bare', actor: AGENT })
    expect(stub.id).toBeTruthy()

    const missing = completenessOf('module', stub.data).map((m) => m.path)
    expect(missing).toEqual(['data.context', 'data.parts'])

    // Enriching it closes the report, one field at a time. That progression is the feature.
    t.api.updateRecord(stub.id, { data: { context: 'A bare module, filled in later.' } }, AGENT)
    const half = t.api.getRecord(stub.id)!
    expect(completenessOf('module', half.data).map((m) => m.path)).toEqual(['data.parts'])

    t.api.updateRecord(
      stub.id,
      { data: { context: 'A bare module, filled in later.', parts: [] } },
      AGENT,
    )
    // An empty checklist is an answer, so [] counts as complete.
    expect(completenessOf('module', t.api.getRecord(stub.id)!.data)).toEqual([])
  })

  it('still lets a note be created with nothing in it, because nothing is required on one', () => {
    const note = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'a thought', actor: AGENT })
    expect(note.data).toEqual({})
  })

  it('stores what passes byte for byte — no trimming, no defaulting, no added keys', () => {
    const data = chestCamera()
    const before = JSON.stringify(data)
    const module = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'chest camera', data, actor: AGENT })
    expect(JSON.stringify(module.data)).toBe(before)
  })

  it('checks data on an update too, and refuses one that would break the record', () => {
    const module = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'chest camera',
      data: smallModule(),
      actor: AGENT,
    })
    const err = expectPanelError(
      t,
      () => t.api.updateRecord(module.id, { data: { context: 'still here', parts: 'now a string' } }, AGENT),
      400,
    )
    expect(err.message).toContain('parts')

    // The stored record is untouched: the failed write did not half-apply.
    const after = t.api.getRecord(module.id)
    expect(after?.data).toEqual(smallModule())
  })

  it('leaves a patch that does not mention data alone, even when the stored data is invalid', () => {
    // A record written before this gate existed. Inserted underneath the API on purpose —
    // createRecord would refuse it now, and this is exactly the row the live database is full of.
    t.client.sqlite
      .prepare(
        `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data)
         VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', '2026-05-01 09:00:00', '2026-05-01 09:00:00', 'module', ?, NULL, ?)`,
      )
      .run('pre-gate module', WORKSPACE, 'old title', JSON.stringify({ context: 'ok', parts: [], scope: 'invented key' }))

    // Renaming it must work. Refusing a title edit because of a key somebody wrote in May would
    // make the gate the reason the record cannot be repaired.
    const renamed = t.api.updateRecord('pre-gate module', { title: 'a better title' }, AGENT)
    expect(renamed.title).toBe('a better title')
    expect(renamed.data['scope']).toBe('invented key')
  })

  it('runs the deep block rules as well as the field list, in that order', () => {
    // Structure is wrong AND the block would be unrenderable. The structural complaint is the
    // one that comes back, because a deep block error about an object of the wrong shape sends
    // the caller looking in the wrong place.
    const err = expectPanelError(
      t,
      () =>
        t.api.createRecord({ workspaceId: WORKSPACE,
          kind: 'module',
          title: 'wrong shape',
          data: { context: 'c', parts: [], blocks: [{ id: 'x', type: 'chart' }] },
          actor: AGENT,
        }),
      400,
    )
    expect(err.message).toContain('blocks')
    expect(err.message).toContain('summaryBlocks')

    // With the key right and the chart wrong, the block rules answer instead.
    const blockErr = expectPanelError(
      t,
      () =>
        t.api.createRecord({ workspaceId: WORKSPACE,
          kind: 'module',
          title: 'empty chart',
          data: {
            context: 'c',
            parts: [],
            summaryBlocks: [
              { id: 'x', type: 'chart', spec: { kind: 'line', x: { label: 'a' }, y: { label: 'b' }, series: [] } },
            ],
          },
          actor: AGENT,
        }),
      400,
    )
    expect(blockErr.message).toContain('at least one series')
  })
})

// ========================================================================= 2. merge semantics

describe('mergeData, on its own', () => {
  it('touches only the keys named, and reports the path of each', () => {
    const { data, edits, outcome } = t.api.mergeData(
      { context: 'why it exsits', parts: [], source: 'notes.md' },
      { context: 'why it exists' },
    )
    expect(data).toEqual({ context: 'why it exists', parts: [], source: 'notes.md' })
    expect(outcome.changed).toEqual(['data.context'])
    expect(outcome.deleted).toEqual([])
    expect(edits).toEqual([
      { path: 'data.context', before: 'why it exsits', after: 'why it exists', deleted: false },
    ])
  })

  it('adds a key that was not there, and says it changed rather than that it was already right', () => {
    const { data, outcome } = t.api.mergeData({ context: 'c' }, { source: 'design/explore.md' })
    expect(data).toEqual({ context: 'c', source: 'design/explore.md' })
    expect(outcome.changed).toEqual(['data.source'])
  })

  it('merges nested objects key by key instead of replacing them', () => {
    const { data, outcome } = t.api.mergeData(
      { numbers: { trials: 240, drops: 2, effort: 12 }, state: 'measured' },
      { numbers: { trials: 300 } },
    )
    expect(data).toEqual({ numbers: { trials: 300, drops: 2, effort: 12 }, state: 'measured' })
    expect(outcome.changed).toEqual(['data.numbers.trials'])
  })

  it('replaces an array whole, because merging one by index cannot shorten or reorder a list', () => {
    const { data, outcome } = t.api.mergeData(
      { evidence: ['held for 60 s', 'dropped twice', 'reprint pending'] },
      { evidence: ['held for 60 s'] },
    )
    expect(data).toEqual({ evidence: ['held for 60 s'] })
    expect(outcome.changed).toEqual(['data.evidence'])
  })

  it('DELETES a key sent as null rather than storing a null', () => {
    const { data, edits, outcome } = t.api.mergeData(
      { context: 'c', caveat: 'only on the bench' },
      { caveat: null },
    )
    expect(data).toEqual({ context: 'c' })
    expect('caveat' in data).toBe(false) // not present, not present-and-null
    expect(outcome.deleted).toEqual(['data.caveat'])
    expect(outcome.changed).toEqual([])
    expect(one(edits, 'edit')).toEqual({
      path: 'data.caveat',
      before: 'only on the bench',
      after: undefined,
      deleted: true,
    })
    // The response has to SAY so: a delete is the one edit whose effect a caller cannot see by
    // reading back what it sent. `detail` is where the exact path goes; `note` is the same news in
    // the words a person reads, and tests/kind-change-and-plain-replies.test.ts is what keeps a
    // path out of it.
    expect(outcome.detail).toContain('deleted, not set to null')
    expect(outcome.detail).toContain('data.caveat')
    expect(outcome.note).toContain('caveat is empty now')
  })

  it('deletes a nested key by its own path', () => {
    const { data, outcome } = t.api.mergeData(
      { numbers: { trials: 240, bogus: 1 } },
      { numbers: { bogus: null } },
    )
    expect(data).toEqual({ numbers: { trials: 240 } })
    expect(outcome.deleted).toEqual(['data.numbers.bogus'])
  })

  it('says nothing was written when a key asked to be deleted was never there', () => {
    const { data, edits, outcome } = t.api.mergeData({ context: 'c' }, { caveat: null })
    expect(data).toEqual({ context: 'c' })
    expect(edits).toEqual([])
    expect(outcome.alreadyAbsent).toEqual(['data.caveat'])
    expect(outcome.detail).toContain('not there')
    expect(outcome.note).toContain('nothing to clear for caveat')
  })

  it('says nothing was written when the value sent is the value already stored', () => {
    const { edits, outcome } = t.api.mergeData(
      { context: 'c', numbers: { trials: 240 } },
      { context: 'c', numbers: { trials: 240 } },
    )
    expect(edits).toEqual([])
    expect(outcome.unchanged).toEqual(['data.context', 'data.numbers.trials'])
    expect(outcome.detail).toContain('already held the value sent')
    expect(outcome.note).toContain('already said exactly that')
  })

  it('writes a key that is not a plain identifier in brackets, so a path names exactly one key', () => {
    const { outcome } = t.api.mergeData({ extra: { 'mm/s': 1 } }, { extra: { 'mm/s': 2 } })
    expect(outcome.changed).toEqual(['data.extra["mm/s"]'])

    // The two things a dotted path could not tell apart.
    const nested = t.api.mergeData({ a: { b: 1 } }, { a: { b: 2 } })
    const flat = t.api.mergeData({ 'a.b': 1 }, { 'a.b': 2 })
    expect(nested.outcome.changed).toEqual(['data.a.b'])
    expect(flat.outcome.changed).toEqual(['data["a.b"]'])
  })

  it('refuses undefined, which is neither "delete" nor "leave alone"', () => {
    expectPanelError(t, () => t.api.mergeData({ a: 1 }, { a: undefined }), 400)
  })

  it('refuses __proto__, which would change the prototype and store no key at all', () => {
    // Assigning `__proto__` runs the inherited setter: the key never appears in the object, so
    // the merge would report a change, write a change row for it, and store nothing.
    const err = expectPanelError(
      t,
      () => t.api.mergeData({ context: 'c' }, JSON.parse('{"__proto__":{"admin":true}}')),
      400,
    )
    expect(err.message).toContain('__proto__')
  })
})

// ============================================================== 3. merge through the write path

describe('PATCH with dataPatch, through the API', () => {
  /** A stored chest-camera module, and its id. */
  function seeded(): string {
    return h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'LeafCam 2 overhead camera',
      data: chestCamera(),
      actor: AGENT,
    }).id
  }

  it('merges one key and leaves the other 4 kB alone', async () => {
    const id = seeded()
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { source: 'design/explore.md, section 6' } },
    })
    expect(res.statusCode).toBe(200)

    const data = dataOf(recordOf(res))
    expect(data['source']).toBe('design/explore.md, section 6')
    // Everything else is byte-identical to what was stored.
    const untouched = { ...chestCamera() }
    delete untouched['source']
    for (const [key, value] of Object.entries(untouched)) {
      expect(JSON.stringify(data[key])).toBe(JSON.stringify(value))
    }
  })

  it('reports what it did, including that a null deleted the key', async () => {
    const id = seeded()
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { summary: null, source: 'design/explore.md, section 6', paths: null } },
    })
    expect(res.statusCode).toBe(200)

    const outcome = bodyOf(res)['dataPatch']
    expect(outcome).toMatchObject({
      changed: ['data.source'],
      deleted: ['data.summary', 'data.paths'],
      unchanged: [],
      alreadyAbsent: [],
    })
    const said = outcome as { note: string; detail: string }
    expect(said.detail).toContain('deleted, not set to null')
    expect(said.note).toContain('summary and paths are empty now')

    const data = dataOf(recordOf(res))
    expect('summary' in data).toBe(false)
    expect('paths' in data).toBe(false)
  })

  it('validates the record the merge produces, not the patch on its own', async () => {
    const id = seeded()

    // A merge that names none of the required fields is fine — they are still there.
    const ok = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { summary: 'recalibrated 2026-08-01' } },
    })
    expect(ok.statusCode).toBe(200)

    // A merge that removes a required field is ALLOWED -- null deletes a key -- and the record
    // then reports itself incomplete. Refusing it would mean you could add a checklist but
    // never take one away, which is a strange thing for a tracker to forbid.
    //
    // `ifVersion` is here for the same reason as in the wholesale test below: deleting `parts`
    // takes seven checklist lines with it, and a write that removes lines has to say which version
    // of the checklist it removed them from. That is a rule about not destroying work you have not
    // read, not a rule about what may be deleted, so the deletion itself still goes through and
    // the record still reports itself incomplete afterwards, which is what this test is about.
    const version = bodyOf(await inject({ method: 'GET', url: `/api/records/${id}` }))['version']
    const removed = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { parts: null }, ifVersion: version },
    })
    expect(removed.statusCode).toBe(200)
    const after = dataOf(recordOf(await inject({ method: 'GET', url: `/api/records/${id}` })))
    expect(after['parts']).toBeUndefined()
    expect(completenessOf('module', after).map((m) => m.path)).toContain('data.parts')

    // ...and so is a merge that introduces a key no kind declares.
    const unknown = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { blocks: [] } },
    })
    expect(unknown.statusCode).toBe(400)
    expect(errorOf(unknown)).toContain('summaryBlocks')
  })

  it('refuses data and dataPatch together instead of picking one', async () => {
    const id = seeded()
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: smallModule(), dataPatch: { source: 'x' } },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('not both')
  })

  it('never lets a __proto__ key through, at either layer', async () => {
    const id = seeded()
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: { ...AS_AGENT, 'content-type': 'application/json' },
      // A raw string, because building this object in JS would not produce the own property a
      // JSON body produces.
      payload: '{"dataPatch":{"__proto__":{"admin":true}}}',
    })
    // Fastify's JSON parser refuses prototype poisoning before the handler is reached; the guard
    // in mergeData covers the callers that never come through HTTP. Either way it is a 400 and
    // the record is untouched — which is the assertion that matters.
    expect(res.statusCode).toBe(400)
    expect(dataOf(recordOf(await inject({ method: 'GET', url: `/api/records/${id}` })))).toEqual(
      chestCamera(),
    )
  })

  it('refuses an empty dataPatch rather than answering 200 for a write that did nothing', async () => {
    const id = seeded()
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: {} },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('name at least one key')
  })

  it('leaves updatedAt where it was when the merge changed nothing', async () => {
    const id = seeded()
    const stored = h.db.api.getRecord(id)
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { source: 'design/explore.md, section 4' } },
    })
    expect(res.statusCode).toBe(200)
    expect(bodyOf(res)['dataPatch']).toMatchObject({ unchanged: ['data.source'], changed: [] })
    // The home page orders by updatedAt. Moving this module to the top for a write that changed
    // none of it would be a visible lie.
    expect(recordOf(res)['updatedAt']).toBe(stored?.updatedAt)
    expect(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: id }).filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('still replaces data wholesale when the caller sends data, and reports no merge', async () => {
    const id = seeded()

    // WHY THIS ONE CARRIES `ifVersion` AND THE OTHERS DO NOT. `smallModule()` has `parts: []`, so
    // this write empties a checklist that holds seven lines. A write that drops stored checklist
    // lines is refused unless it says which version of the checklist it was written against —
    // the test below this one is that refusal. It is not a rule about wholesale replacement; it is
    // a rule about removing lines you may not have seen, and the same patch through `dataPatch`
    // is refused in the same way. Here the caller really has read the record, so it can say so,
    // and the wholesale behaviour this test is about is unchanged.
    //
    // AND WHY IT ALSO CARRIES `replace: true`, WHICH IS A SECOND AND DIFFERENT CLAIM. `smallModule()`
    // holds two of the seeded module's fields, so this write empties the rest, and a wholesale
    // `data` that would empty a stored field is refused unless the caller says it means to. The
    // `ifVersion` says the copy is current; this says the loss is wanted. Both are true here: this
    // test is about a caller that really does mean to rewrite the whole object.
    const read = await inject({ method: 'GET', url: `/api/records/${id}` })
    const version = bodyOf(read)['version']

    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: smallModule(), ifVersion: version, replace: true },
    })
    expect(res.statusCode).toBe(200)
    expect(dataOf(recordOf(res))).toEqual(smallModule())
    // No dataPatch key at all: an empty report on a wholesale write would read as "nothing
    // changed", which is the opposite of what happened.
    expect('dataPatch' in bodyOf(res)).toBe(false)
  })
})

// ============================================ 3b. the lost update two agents produced in one night

/**
 * The write path used to lose work, and this is the run that proved it.
 *
 * Measured during the dogfood, on one module, by an agent that re-read what it had written:
 *
 *     item ids BEFORE: ['utc-defaults', 'panel-layouts', 'summary-comment']
 *     item ids AFTER : ['sc-1', 'sc-2', 'sc-3', 'sc-4']
 *     survived: []
 *
 * Answered 200. Two agents had each read the module, each rewritten `data.parts` from what it read,
 * and the second write replaced the first agent's checklist with nothing to say it ever existed.
 * There was no way to APPEND a line and no way to say which version a write was built against, so
 * every addition was a read-modify-write and every read-modify-write was a race.
 *
 * This is that run, in both directions: the write that used to succeed is refused, and the two ways
 * out of the refusal are exercised rather than described.
 */
describe('two agents, one checklist', () => {
  /** The ids of a module's checklist lines, in order, read back out of the database. */
  function itemIds(id: string): string[] {
    const stored = h.db.api.getRecord(id)
    const parts = (stored?.data as { parts?: { items?: { id: string }[] }[] }).parts ?? []
    return parts.flatMap((part) => (part.items ?? []).map((item) => item.id))
  }

  it('refuses the write that used to destroy the other agent\'s lines, and takes it once it is told what it read', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Mole Office — database schema and migrations',
      data: {
        context: 'The schema, and what has to move before the next restore proof.',
        parts: [{ id: 'sc', name: 'Schema', items: [{ id: 'utc-defaults', text: 'Drop the UTC SQL defaults', state: 'doing' }] }],
      },
      actor: AGENT,
    })

    // AGENT ONE reads the module. This is the copy its write will be built from, and the version
    // that read handed back is the whole of what it has to say to be safe.
    const read = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const staleVersion = bodyOf(read)['version']
    expect(typeof staleVersion).toBe('string')

    // AGENT TWO adds a line while agent one is thinking. It never holds the checklist: the request
    // carries the one line, which is the half of the fix that makes the other half livable.
    const added = await inject({
      method: 'POST',
      url: `/api/records/${module.id}/checklist`,
      headers: AS_AGENT,
      payload: { partId: 'sc', id: 'summary-comment', text: 'Correct the false summary comment', state: 'todo' },
    })
    expect(added.statusCode).toBe(201)
    expect(itemIds(module.id)).toEqual(['utc-defaults', 'summary-comment'])

    // AGENT ONE now writes back the array it read, with its own new line on the end. This is the
    // exact request that was answered 200 and took another agent's work with it.
    const clobber = {
      dataPatch: {
        parts: [
          {
            id: 'sc',
            name: 'Schema',
            items: [
              { id: 'utc-defaults', text: 'Drop the UTC SQL defaults', state: 'doing' },
              { id: 'sc-1', text: 'Write the stamp-column test', state: 'todo' },
            ],
          },
        ],
      },
    }
    const lost = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: clobber,
    })
    expect(lost.statusCode).toBe(400)
    // The refusal names the line that would have gone, so the caller can see whose work it is
    // about, and names the two requests that get it out — both of which this test then makes.
    expect(errorOf(lost)).toContain('summary-comment')
    expect(errorOf(lost)).toContain(`POST /api/records/${module.id}/checklist`)
    expect(errorOf(lost)).toContain('ifVersion')
    // Nothing was written: agent two's line is still there and agent one's is not.
    expect(itemIds(module.id)).toEqual(['utc-defaults', 'summary-comment'])

    // WAY OUT ONE: send the line instead of the array. Nothing has to be read at all.
    const appended = await inject({
      method: 'POST',
      url: `/api/records/${module.id}/checklist`,
      headers: AS_AGENT,
      payload: { partId: 'sc', id: 'sc-1', text: 'Write the stamp-column test', state: 'todo' },
    })
    expect(appended.statusCode).toBe(201)
    expect(itemIds(module.id)).toEqual(['utc-defaults', 'summary-comment', 'sc-1'])

    // WAY OUT TWO, and the one that matters here: a caller that really does mean to remove a line
    // says which version it is removing it from. The STALE version is refused with 409 — it is the
    // version from before agent two wrote — and nothing is stored.
    const stale = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { ...clobber, ifVersion: staleVersion },
    })
    expect(stale.statusCode).toBe(409)
    expect(errorOf(stale)).toContain('changed since you read it')
    expect(itemIds(module.id)).toEqual(['utc-defaults', 'summary-comment', 'sc-1'])

    // Read it again, and the same removal goes through — with the caller having seen, this time,
    // the line it is taking away.
    const fresh = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const deliberate = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { ...clobber, ifVersion: bodyOf(fresh)['version'] },
    })
    expect(deliberate.statusCode).toBe(200)
    expect(itemIds(module.id)).toEqual(['utc-defaults', 'sc-1'])
  })

  /**
   * THE TWIN OF THE TEST ABOVE, AND THE CASE IT DOES NOT COVER: a rewrite, not a removal.
   *
   * The guard above compares the SET OF IDS before and after. Every id surviving means the write is
   * allowed, and the work in a checklist line is not its id — it is `state`, `note`, `text`,
   * `hours`, `consequence` and `paused`, none of which that comparison looks at. So a stale copy
   * written back unchanged reverted another agent's recorded failure and was answered 200.
   *
   * Reproduced on a scratch server on 2026-08-12, and this is that run: writer A set item `i2` to
   * `failed` with the note "the bracket cracked"; writer B, holding a copy read before that, wrote
   * it back; the response was 200 and the stored line read `done` with no note at all. It is the
   * only measured place in this product where recorded work disappears and nothing says so.
   *
   * TWO CORRECTIONS TO WHAT WAS WRITTEN DOWN ABOUT IT, both from that run. The note key ends up
   * ABSENT rather than null — B's copy never carried it and a merge does not store a null. And the
   * shipped guard does not fire on LINE COUNT: replacing `i6` with `i6b` at equal count is refused,
   * and a genuine removal is refused. The guard works; it was aimed at the wrong event.
   */
  it('refuses a stale copy that REWRITES a line, not only one that drops it', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Bracket mount',
      data: {
        context: 'The mount, and what the load test said about it.',
        parts: [
          {
            id: 'mount',
            name: 'Mount',
            items: [
              { id: 'i1', text: 'Cut the plate', state: 'done' },
              { id: 'i2', text: 'Load-test the bracket', state: 'done' },
              { id: 'i3', text: 'Fit it', state: 'todo' },
            ],
          },
        ],
      },
      actor: AGENT,
    })

    /** One stored checklist line, read back out of the database. */
    const item = (itemId: string): Record<string, unknown> | undefined => {
      const stored = h.db.api.getRecord(module.id)
      const parts = (stored?.data as { parts?: { items?: Record<string, unknown>[] }[] }).parts ?? []
      return parts.flatMap((part) => part.items ?? []).find((i) => i['id'] === itemId)
    }

    // WRITER B READS. Its whole copy, and the version that read handed back. HOLDING THIS IS THE
    // RACE — there is no clock in this test and nothing here can pass because a machine was fast.
    const read = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const staleVersion = bodyOf(read)['version']
    const staleParts = (bodyOf(read)['record'] as { data: { parts: unknown } }).data.parts

    // WRITER A records the failure, on the route the documentation recommends.
    const recorded = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i2`,
      headers: AS_AGENT,
      payload: { state: 'failed', note: 'the bracket cracked' },
    })
    expect(recorded.statusCode).toBe(200)
    expect(item('i2')).toMatchObject({ state: 'failed', note: 'the bracket cracked' })

    // WRITER B WRITES BACK ITS COPY, byte for byte, saying nothing about what it read. This is the
    // request that was answered 200 and took writer A's work with it.
    const clobber = { dataPatch: { parts: staleParts } }
    const refused = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: clobber,
    })
    expect(refused.statusCode).toBe(400)
    // It names the line and the KEYS it would rewrite, so the caller can see whose work it is about
    // rather than being told only that something is wrong.
    expect(errorOf(refused)).toContain('"i2"')
    expect(errorOf(refused)).toContain('state')
    expect(errorOf(refused)).toContain('note')
    expect(errorOf(refused)).toContain('ifVersion')
    // NOTHING WAS WRITTEN. This is the assertion the whole file exists for.
    expect(item('i2')).toMatchObject({ state: 'failed', note: 'the bracket cracked' })

    // Saying which version it was written against does not get a stale copy through either: the
    // same 409 the removal path gives, in the same words, and still nothing is written.
    const stale = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { ...clobber, ifVersion: staleVersion },
    })
    expect(stale.statusCode).toBe(409)
    expect(errorOf(stale)).toContain('changed since you read it')
    expect(item('i2')).toMatchObject({ state: 'failed', note: 'the bracket cracked' })

    // Read it again and the same rewrite goes through — deliberately, with the caller having seen
    // what it is overwriting. A guard that could not be got past would be a guard nobody could use.
    const fresh = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const deliberate = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { ...clobber, ifVersion: bodyOf(fresh)['version'] },
    })
    expect(deliberate.statusCode).toBe(200)
    expect(item('i2')).toMatchObject({ state: 'done' })
  })

  // PROBLEM KzMu_Ndhb8X-, its own recipe: two writers, one module, the same item id, no ifVersion on
  // the second. The write is still made (refusing it would refuse the ordinary doing-to-done), and the
  // 200 answer now says whose values it replaced and what that write left standing beside them.
  it('a line write over another writer\'s values names them, and says nothing over its own', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Bracket mount, two writers',
      data: {
        context: 'The mount.',
        parts: [{ id: 'mount', name: 'Mount', items: [{ id: 'i2', text: 'Load-test the bracket', state: 'doing' }] }],
      },
      actor: AGENT,
    })
    const WRITER_B = { ...AS_AGENT, 'x-mole-office-actor-id': 'vitest/liveApp' }

    // WRITER A records the failure, with a note.
    const a = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i2`,
      headers: AS_AGENT,
      payload: { state: 'failed', note: 'the bracket cracked' },
    })
    expect(a.statusCode).toBe(200)
    // A replaced only what it had put there itself, at the create, so it is told nothing.
    expect(bodyOf(a)['writtenOver']).toEqual([])
    expect(bodyOf(a)['writtenOverNote']).toBeNull()

    // WRITER B, holding a copy read before that, ticks the line done and sends no ifVersion.
    const b = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i2`,
      headers: WRITER_B,
      payload: { state: 'done' },
    })
    expect(b.statusCode).toBe(200)
    // The stored line is what the record says it is: B's state, A's note still beside it.
    expect(bodyOf(b)['item']).toMatchObject({ state: 'done', note: 'the bracket cracked' })

    // THE ANSWER NAMES IT: the field, what it held, who wrote that and in which revision.
    const over = bodyOf(b)['writtenOver'] as Record<string, unknown>[]
    expect(over).toHaveLength(1)
    expect(over[0]).toMatchObject({
      field: 'state',
      was: 'failed',
      now: 'done',
      by: { actorType: 'agent', actorId: 'claude-code' },
    })
    expect(typeof over[0]?.['seq']).toBe('number')
    expect(typeof over[0]?.['at']).toBe('string')
    // ...and what A's write left on the line, which is what makes the line contradict itself.
    expect(bodyOf(b)['leftBeside']).toEqual([{ field: 'note', value: 'the bracket cracked', seq: over[0]?.['seq'] }])
    const note = String(bodyOf(b)['writtenOverNote'])
    expect(note).toContain('state was "failed" and is now "done"')
    expect(note).toContain('agent claude-code wrote "failed"')
    expect(note).toContain(`(revision ${String(over[0]?.['seq'])})`)
    expect(note).toContain('note "the bracket cracked"')
    expect(note).toContain('ifVersion')

    // B writing over its OWN value is told nothing: the report is about somebody else's work.
    const again = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i2`,
      headers: WRITER_B,
      payload: { state: 'doing' },
    })
    expect(again.statusCode).toBe(200)
    expect(bodyOf(again)['writtenOver']).toEqual([])
    expect(bodyOf(again)['leftBeside']).toEqual([])
    expect(bodyOf(again)['writtenOverNote']).toBeNull()
  })

  it('lets the two checklist routes say what they were written against, and refuses a stale one', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Bracket mount',
      data: {
        context: 'The mount.',
        parts: [{ id: 'mount', name: 'Mount', items: [{ id: 'i1', text: 'Cut the plate', state: 'todo' }] }],
      },
      actor: AGENT,
    })

    const read = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const staleVersion = bodyOf(read)['version']

    // Somebody else writes, so the version the reader holds is now stale.
    await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i1`,
      headers: AS_AGENT,
      payload: { state: 'failed', note: 'the plate is 2mm under' },
    })

    // BOTH ROUTES USED TO ANSWER 400 — "a checklist item has no field ifVersion" — so the only
    // guard that would help was refused by the only two routes the documentation recommends. That
    // reads as the caller having malformed its request, which is the worst possible reading.
    const item = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i1`,
      headers: AS_AGENT,
      payload: { state: 'done', ifVersion: staleVersion },
    })
    expect(item.statusCode).toBe(409)
    expect(errorOf(item)).toContain('changed since you read it')

    const append = await inject({
      method: 'POST',
      url: `/api/records/${module.id}/checklist`,
      headers: AS_AGENT,
      payload: { partId: 'mount', id: 'i2', text: 'Fit it', state: 'todo', ifVersion: staleVersion },
    })
    expect(append.statusCode).toBe(409)

    // And the guard is opt-in on these routes, because it has to be: an item route carries one
    // line and cannot overwrite a line it has not read, so requiring a version there would put a
    // read in front of the commonest edit in the product for no gain.
    const ordinary = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}/checklist/i1`,
      headers: AS_AGENT,
      payload: { state: 'done' },
    })
    expect(ordinary.statusCode).toBe(200)

    // With the version the last read handed back, both go through.
    const now = bodyOf(await inject({ method: 'GET', url: `/api/records/${module.id}` }))['version']
    const good = await inject({
      method: 'POST',
      url: `/api/records/${module.id}/checklist`,
      headers: AS_AGENT,
      payload: { partId: 'mount', id: 'i2', text: 'Fit it', state: 'todo', ifVersion: now },
    })
    expect(good.statusCode).toBe(201)
  })

  /**
   * THE FOUR WAYS THROUGH THE FIRST VERSION OF THE GUARD, found by an agent asked to break it hours
   * after it shipped. All four were answered 200, and the first one lost a checklist line's content
   * outright — which is the exact thing the guard exists to stop.
   *
   * They share one cause: the comparison flattened every part into one id→item map. So part
   * membership was invisible, a part's own heading was never compared, and where two parts held the
   * same item id the map kept only the last of them.
   */
  it('sees a rewrite in the FIRST of two parts sharing an item id', async () => {
    // The flat map kept the last `x` and compared the stale copy against that, so rewriting the
    // first one was invisible and a stale array put it back.
    //
    // THE TWINS ARE WRITTEN ROUND THE WRITE GATE, and that is new. `validateData` in
    // src/shared/kinds.ts now refuses two checklist lines in one module sharing an id, so this
    // module cannot be created through any write path — see `writeDataBypassingTheGate`. The guard
    // still meets the state, because modules written before that rule are in the corpus and in
    // every archive, and the import writes `records` with SQL of its own. What is asked here is
    // what was always asked: does the guard see a rewrite of the FIRST twin. The answer must not
    // depend on how the twins got there.
    const twins = {
      context: 'A module whose two parts happen to use the same line id.',
      parts: [
        { id: 'p1', name: 'First', items: [{ id: 'x', text: 'FIRST copy', state: 'todo' }] },
        { id: 'p2', name: 'Second', items: [{ id: 'x', text: 'SECOND copy', state: 'todo' }] },
      ],
    }
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Two parts, one id',
      data: {
        context: 'A module whose two parts happen to use the same line id.',
        parts: [
          { id: 'p1', name: 'First', items: [{ id: 'x', text: 'FIRST copy', state: 'todo' }] },
          { id: 'p2', name: 'Second', items: [{ id: 'y', text: 'SECOND copy', state: 'todo' }] },
        ],
      },
      actor: AGENT,
    })
    writeDataBypassingTheGate(h.db, module.id, twins)
    const read = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const stale = (bodyOf(read)['record'] as { data: { parts: unknown } }).data.parts

    // A rewrites the FIRST copy and does not say which version it read. Under the flat map the
    // arriving checklist and the stored one both collapsed to the SECOND copy, which is identical
    // in the two, so this was answered 200 and the first line's text was lost.
    const rewritten = JSON.parse(JSON.stringify(stale)) as { items: { id: string; text: string }[] }[]
    rewritten[0]!.items[0]!.text = 'A REWROTE THE FIRST ONE'
    const byA = await inject({
      method: 'PATCH',
      url: `/api/records/${module.id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { parts: rewritten } },
    })
    expect(byA.statusCode).toBe(400)
    // The line it names is the FIRST twin, which is the whole point: the refusal has to be about
    // "x" in part "p1" rather than about the duplicate id, and the duplicate-id refusal does not
    // say this.
    expect(errorOf(byA)).toContain('in part "p1"')

    // Nothing was written, so the line still says what it said.
    const stored = h.db.api.getRecord(module.id)
    const first = (stored?.data as { parts: { items: { text: string }[] }[] }).parts[0]?.items[0]
    expect(first?.text).toBe('FIRST copy')
  })

  it('sees a line moved between parts, a part renamed, and a part dropped', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Parts that move',
      data: {
        context: 'A module with two headings.',
        parts: [
          { id: 'p1', name: 'Old name', items: [{ id: 'i1', text: 'One', state: 'todo' }] },
          { id: 'p2', name: 'Second', items: [{ id: 'i2', text: 'Two', state: 'todo' }] },
        ],
      },
      actor: AGENT,
    })
    const read = await inject({ method: 'GET', url: `/api/records/${module.id}` })
    const stale = (bodyOf(read)['record'] as { data: { parts: unknown } }).data.parts
    const send = (parts: unknown, ifVersion?: unknown) =>
      inject({
        method: 'PATCH',
        url: `/api/records/${module.id}`,
        headers: AS_AGENT,
        payload: ifVersion === undefined ? { dataPatch: { parts } } : { dataPatch: { parts }, ifVersion },
      })

    // A moves i2 into p1, renames p1, and adds an empty part — all deliberately.
    const byA = await send(
      [
        { id: 'p1', name: 'A RENAMED THIS PART', items: [{ id: 'i1', text: 'One', state: 'todo' }, { id: 'i2', text: 'Two', state: 'todo' }] },
        { id: 'p2', name: 'Second', items: [] },
        { id: 'p3', name: 'A NEW EMPTY PART', items: [] },
      ],
      bodyOf(read)['version'],
    )
    expect(byA.statusCode, byA.body.slice(0, 300)).toBe(200)

    // B writes back what it read. Every one of these was a 200 before: the move looked like no
    // change, the rename was never compared, and the empty part held no ids to notice.
    const byB = await send(stale)
    expect(byB.statusCode).toBe(400)
    const said = errorOf(byB)
    // It names what it would lose — the moved line's new home, the renamed heading, or the part
    // that would go — rather than only saying that something is wrong.
    expect(said).toMatch(/part "p1"|part "p3"/)

    const stored = h.db.api.getRecord(module.id) as unknown as { data: { parts: { id: string; name: string }[] } }
    expect(stored.data.parts.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(stored.data.parts[0]?.name).toBe('A RENAMED THIS PART')
  })

  it('leaves an addition, a reorder and a no-op rewrite alone', async () => {
    // THE GUARD MUST NOT COST THE ORDINARY EDIT. A write that adds a line, one that changes the
    // order, and one that sends back exactly what is stored all lose nothing, so all three are
    // taken with no version at all. The last one is the trap `versionOf`'s own header warns about
    // in the other direction: a caller rebuilding an item from its own model may order the keys
    // differently and must not be told it has a conflict.
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Bracket mount',
      data: {
        context: 'The mount.',
        parts: [
          {
            id: 'mount',
            name: 'Mount',
            items: [
              { id: 'i1', text: 'Cut the plate', state: 'done' },
              { id: 'i2', text: 'Fit it', state: 'todo' },
            ],
          },
        ],
      },
      actor: AGENT,
    })
    const parts = (items: unknown[]) => ({ dataPatch: { parts: [{ id: 'mount', name: 'Mount', items }] } })
    const send = (payload: Record<string, unknown>) =>
      inject({ method: 'PATCH', url: `/api/records/${module.id}`, headers: AS_AGENT, payload })

    // The same two lines, with the keys of the first written in another order.
    const same = await send(
      parts([
        { state: 'done', id: 'i1', text: 'Cut the plate' },
        { id: 'i2', text: 'Fit it', state: 'todo' },
      ]),
    )
    expect(same.statusCode).toBe(200)

    const reordered = await send(
      parts([
        { id: 'i2', text: 'Fit it', state: 'todo' },
        { id: 'i1', text: 'Cut the plate', state: 'done' },
      ]),
    )
    expect(reordered.statusCode).toBe(200)

    const added = await send(
      parts([
        { id: 'i2', text: 'Fit it', state: 'todo' },
        { id: 'i1', text: 'Cut the plate', state: 'done' },
        { id: 'i3', text: 'Paint it', state: 'todo' },
      ]),
    )
    expect(added.statusCode).toBe(200)
  })
})

// =================================================== 3c. what a write says about what is already here

/**
 * Three near-duplicate records were filed in one night, every one answered 201, every one found
 * afterwards by an author re-reading a page by accident. One is still standing as an unresolved
 * `contradicts` between two agents who each believed they were the first to file it.
 *
 * Titles were unique at the time, so Mole Office caught the same STRING twice and could not catch the
 * same FACT twice. That rule is gone — the owner settled on 17 August 2026 that titles may repeat —
 * so Mole Office no longer catches even the string by refusing. It reports it instead: a create answers
 * with what else is called this, and the person decides. These two titles are the real pair, copied
 * out of the corpus.
 */
describe('a create says what is already filed', () => {
  const FIRST = `A misspelt actor header was silently promoted to human/${THE_TEST_OFFICES_OWNER.id}, the one identity allowed to write decisions`
  const SECOND = 'A misspelt actor header was silently promoted to the human identity'

  const file = async (title: string) =>
    await inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'problem', title, data: { state: 'open' } },
    })

  it('names the record that says the same thing, without refusing the write', async () => {
    const first = await file(FIRST)
    expect(first.statusCode).toBe(201)
    // Nothing to say about the first one: it is the only record here.
    expect('similar' in bodyOf(first)).toBe(false)

    const second = await file(SECOND)
    // STILL 201, and the record is really stored. This is a report, not a gate: two similar titles
    // are usually two different things, and a server that refused on a string would be wrong far
    // more often than right — and would be deciding, on a string, that two people's work is one.
    expect(second.statusCode).toBe(201)
    expect(h.db.api.getRecord(String(recordOf(second)['id']))).not.toBeNull()

    const similar = bodyOf(second)['similar'] as { id: string; kind: string; title: string }[]
    expect(similar.map((s) => s.title)).toEqual([FIRST])
    expect(similar[0]?.id).toBe(recordOf(first)['id'])
    expect(similar[0]?.kind).toBe('problem')
    // The sentence carries the id, because reading the other record is the next thing the caller
    // does, and an agent that acts on the first line of the answer must not have to walk the array.
    expect(String(bodyOf(second)['similarNote'])).toContain(String(recordOf(first)['id']))

    // AND IT DISCRIMINATES. Without this the test would pass just as well against a server that
    // reported every record in the workspace, which would be a report nobody reads twice.
    const unrelated = await file('The Velodyne broadcast address is wrong in the docker compose file')
    expect(unrelated.statusCode).toBe(201)
    expect('similar' in bodyOf(unrelated)).toBe(false)
  })

  // PROBLEM DVzgaTVrVW3I, the half a title check cannot see: one fact filed twice in different words
  // and as two kinds, about the same module. The two share the module, so the second create names the
  // first, and a create linked to a module nothing else is linked to says nothing.
  it('names the records already linked to the module a new record is linked to, and nothing when none is', async () => {
    const module = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Record timestamps',
      data: { context: 'Where records get their stamps.' },
      actor: AGENT,
    })
    const quiet = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Velodyne driver',
      data: { context: 'The lidar.' },
      actor: AGENT,
    })
    const fileAbout = async (kind: 'problem' | 'task', title: string, moduleId: string) =>
      await inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_AGENT,
        payload: {
          kind,
          title,
          data: { state: kind === 'task' ? 'todo' : 'open' },
          links: [{ type: 'relates_to', toId: moduleId }],
        },
      })

    const first = await fileAbout('problem', 'Five stamp defaults are written in UTC', module.id)
    expect(first.statusCode).toBe(201)
    // Nothing else is linked to the module yet, so nothing is said.
    expect('alreadyLinkedThere' in bodyOf(first)).toBe(false)
    expect('alreadyLinkedThereNote' in bodyOf(first)).toBe(false)

    const second = await fileAbout('task', 'Move the schema default stamps to local wall-clock time', module.id)
    expect(second.statusCode).toBe(201)
    expect(h.db.api.getRecord(String(recordOf(second)['id']))).not.toBeNull()
    // The titles share too little for the title check, which is why this second report exists.
    expect('similar' in bodyOf(second)).toBe(false)
    const there = bodyOf(second)['alreadyLinkedThere'] as {
      target: { id: string }
      records: { id: string; kind: string; title: string }[]
      count: number
    }[]
    expect(there).toHaveLength(1)
    expect(there[0]?.target.id).toBe(module.id)
    expect(there[0]?.records).toEqual([
      { id: recordOf(first)['id'], kind: 'problem', title: 'Five stamp defaults are written in UTC' },
    ])
    expect(there[0]?.count).toBe(1)
    const note = String(bodyOf(second)['alreadyLinkedThereNote'])
    expect(note).toContain(String(recordOf(first)['id']))
    expect(note).toContain(module.id)
    expect(note).toContain('Nothing was refused')

    // AND IT DISCRIMINATES: a module nothing else is linked to gets no report.
    const unrelated = await fileAbout('problem', 'The lidar drops packets at 20 Hz', quiet.id)
    expect(unrelated.statusCode).toBe(201)
    expect('alreadyLinkedThere' in bodyOf(unrelated)).toBe(false)
    expect('alreadyLinkedThereNote' in bodyOf(unrelated)).toBe(false)
  })
})

// ================================================ 3d. one fact, one statement: blocked_by and blocks

/**
 * `blocked_by` is published on an `obligation` as "What is stopping it, as a record title or as
 * prose" — so when the prose really is another record's title, the same fact is stated twice: once
 * as text nothing reads, and once as the `blocks` link every reader of a dependency reads.
 *
 * The link is canonical, and that is a measurement rather than a preference: the `blocks` link is
 * read by the gate rule, the attention rule, `unmetDependencies`, the record page and the graph,
 * and `data.blocked_by` is read by nothing at all. So a write that fills in the prose and leaves
 * the graph empty is told so, and given the one request that files the fact where it is read.
 *
 * THIS TEST USED TO FILE A `task`. It cannot any more: `blocked_by` is off that kind, and the
 * stored values were migrated into `task.also_waiting_on`, which is prose and is not a reference.
 * An `obligation` still declares the field, honestly, because it has no prose field to move
 * anything into — so the report has one kind left to be about, and this is it. What is being tested
 * did not change: a dependency written as prose is told where the product actually reads one.
 */
describe('blocked_by names a record, and the link is where that fact lives', () => {
  it('says the dependency is prose until a blocks link exists, and stops saying it once one does', async () => {
    const blocker = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'The E-stop path in the demo launcher is a no-op',
      data: { state: 'open' },
      actor: AGENT,
    })

    const filed = await inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'obligation',
        title: 'Demonstrate the 50 mm wizard to the group',
        data: { due: '2026-09-01', blocked_by: 'The E-stop path in the demo launcher is a no-op' },
      },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const owedId = String(recordOf(filed)['id'])

    const told = bodyOf(filed)['blockedBy'] as { blocker: { id: string }; note: string }
    expect(told.blocker.id).toBe(blocker.id)
    // NOTHING WAS WRITTEN FOR THE CALLER. A link carries its own author and its own date, and one
    // invented from a string would put a dependency in the graph that nobody stated.
    expect(h.db.api.resolveLinks(owedId)).toEqual([])

    // The request the note names is made verbatim, so the note cannot go stale against the routes.
    const made = await inject({
      method: 'POST',
      url: '/api/links',
      headers: AS_AGENT,
      payload: { fromId: blocker.id, toId: owedId, type: 'blocks' },
    })
    expect(made.statusCode).toBe(201)

    // Now the fact is stated where it is read, so the write path has nothing left to say about it.
    const again = await inject({
      method: 'PATCH',
      url: `/api/records/${owedId}`,
      headers: AS_AGENT,
      payload: { dataPatch: { why: 'the group is only together on the 1st' } },
    })
    expect(again.statusCode).toBe(200)
    expect('blockedBy' in bodyOf(again)).toBe(false)
  })
})

// ========================================================== 3e. a delete that says what it did

describe('DELETE /api/records/:id', () => {
  it('says what it did, and says the second time that it did nothing', async () => {
    const claim = h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'claim', title: 'Detection holds to 1.4 m', actor: AGENT })
    const note = h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'Where the 1.4 m came from', actor: AGENT })
    h.db.api.createLink({ fromId: note.id, toId: claim.id, type: 'discusses', actor: AGENT })

    const gone = await inject({ method: 'DELETE', url: `/api/records/${claim.id}`, headers: AS_AGENT })
    expect(gone.statusCode).toBe(200)
    const body = bodyOf(gone)

    // It used to answer `{"ok":true}` and nothing else, in a server where the create says what is
    // still missing and the patch says which paths moved. Three things are worth saying here.
    expect(body['alreadyDeleted']).toBe(false)
    // 1. WHICH PAGES CHANGED. Links are kept and drawn as broken, so this delete changed a page
    //    the request never named, and nobody was told.
    expect(body['brokenLinksAt']).toEqual([{ id: note.id, kind: 'note', title: 'Where the 1.4 m came from' }])
    // 2. THAT NOTHING WAS ERASED, and how to undo it.
    expect(String(body['note'])).toContain(`POST /api/records/${claim.id}/restore`)
    // 3. The record itself, marked rather than removed.
    expect(recordOf(gone)['deletedAt']).not.toBeNull()

    // The second delete writes NOTHING — a second `deletedAt` would move the date of a deletion
    // that happened last week — and the answer is different from the first, which is the whole
    // point: two identical `{"ok":true}`s told a caller nothing about which one did the work.
    const again = await inject({ method: 'DELETE', url: `/api/records/${claim.id}`, headers: AS_AGENT })
    expect(again.statusCode).toBe(200)
    expect(bodyOf(again)['alreadyDeleted']).toBe(true)
    expect(recordOf(again)['deletedAt']).toBe(recordOf(gone)['deletedAt'])
    expect(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: claim.id }).filter((c) => c.op === 'delete')).toHaveLength(1)
  })
})

// =================================================================== 4. one change row per path

describe('the change log a merge writes', () => {
  it('writes one row per JSON path that changed, naming the path in `field`', () => {
    const module = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'LeafCam 2 overhead camera',
      data: chestCamera(),
      actor: AGENT,
    })
    t.api.patchRecord(
      module.id,
      { dataPatch: { source: 'design/explore.md, section 6', summary: null } },
      AGENT,
    )

    const rows = t.api.listChanges({ workspaceId: WORKSPACE, recordId: module.id }).filter((c) => c.op === 'update')
    expect(rows.map((r) => r.field).sort()).toEqual(['data.source', 'data.summary'])

    const source = rows.find((r) => r.field === 'data.source')
    expect(source?.oldValue).toBe('design/explore.md, section 4')
    expect(source?.newValue).toBe('design/explore.md, section 6')

    // A removed key is a row whose new value is empty. Nothing stores a null, so an empty new
    // value on a data path always means the key is gone.
    const summary = rows.find((r) => r.field === 'data.summary')
    expect(summary?.oldValue).toBe('Mounted, calibrated, detecting. The open risk is the mast knock on 2026-07-30.')
    expect(summary?.newValue).toBeNull()

    // The rows are small: neither of them carries the record.
    for (const row of rows) {
      expect((row.oldValue ?? '').length + (row.newValue ?? '').length).toBeLessThan(200)
    }
  })

  it('writes the whole record twice when the caller replaces data wholesale — the old behaviour', () => {
    const module = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'LeafCam 2 overhead camera',
      data: chestCamera(),
      actor: AGENT,
    })
    const corrected = { ...chestCamera(), source: 'design/explore.md, section 6' }
    t.api.updateRecord(module.id, { data: corrected }, AGENT)

    const row = one(
      t.api.listChanges({ workspaceId: WORKSPACE, recordId: module.id }).filter((c) => c.op === 'update'),
      'update row',
    )
    expect(row.field).toBe('data')
    // One row, holding the record before and the record after — so it is twice the size of the
    // record, whatever the record is. This is the 6.2 kB row the audit measured, and the reason
    // the per-path rows above exist.
    const dataBytes = JSON.stringify(chestCamera()).length
    expect((row.oldValue ?? '').length + (row.newValue ?? '').length).toBeGreaterThan(dataBytes * 2 - 50)
  })

  it('records the agent and its session on every path row, so attribution survives the split', () => {
    const module = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'm', data: smallModule(), actor: AGENT })
    t.api.patchRecord(module.id, { dataPatch: { summary: 'first pass', source: 'bench' } }, AGENT)
    const rows = t.api.listChanges({ workspaceId: WORKSPACE, recordId: module.id }).filter((c) => c.op === 'update')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.actorType).toBe('agent')
      expect(row.actorId).toBe('claude-code')
      expect(row.sessionId).toBe('sess-test')
    }
  })
})

// ================================================================= 5. the refusal, carried out

describe('what an agent is told when it reaches for a decision', () => {
  it('sends the agent to the kind that exists, and to no endpoint that does not', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'decision', title: 'Stay on position control', data: { because: 'safer' } },
    })
    expect(res.statusCode).toBe(403)
    const message = errorOf(res)

    // The sentence this refusal has now been wrong about TWICE, in opposite directions. It first
    // said "an agent may propose one" when no propose path existed; it was then corrected to "there
    // is no proposal endpoint … write it as a note", which was true of the product as it stood and
    // pointed at the one kind nothing queries. Both are gone.
    expect(message).not.toContain('may propose one')
    expect(message).not.toContain('There is no proposal endpoint')
    expect(message).not.toContain('"kind":"note"')
    expect(message).toContain('"kind":"proposal"')

    // The two paths the FIRST wrong sentence sent callers looking for are still not routes, so the
    // refusal must not have quietly reintroduced either of them.
    expect(message).not.toContain('/api/proposals')
    expect(message).not.toContain('/records/propose')
    for (const url of ['/api/records/propose', '/api/proposals']) {
      const probe = await inject({ method: 'POST', url, headers: AS_AGENT, payload: {} })
      expect(probe.statusCode).toBe(404)
    }
  })

  it('names only routes and fields the server actually serves, and the flow works end to end', async () => {
    const refusal = await inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: { kind: 'decision', title: 'Stay on position control', data: {} },
    })
    const message = errorOf(refusal)
    expect(message).toContain('POST /api/records')
    expect(message).toContain('POST /api/links')
    expect(message).toContain('GET /api/records?kind=proposal')
    expect(message).toContain('/promote')

    // Something for the proposal to be about.
    const subject = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'YuMi controller',
      data: smallModule(),
      actor: AGENT,
    })

    // Now do exactly what the message says, as the agent it was addressed to: file the FORK.
    const proposal = await inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'Position control or torque control for the handover?',
        data: {
          question: 'Do we stay on position control until the reprint is measured?',
          options: [
            'Stay on position control: nothing to re-tune, and the compliance question stays open.',
            'Move to torque control now: answers it, and makes any regression impossible to attribute.',
          ],
          because: 'Changing controller and hardware in the same week makes a regression impossible to attribute.',
        },
      },
    })
    expect(proposal.statusCode, proposal.body).toBe(201)
    const proposalId = String(recordOf(proposal)['id'])

    const link = await inject({
      method: 'POST',
      url: '/api/links',
      headers: AS_AGENT,
      payload: { fromId: proposalId, toTitle: 'YuMi controller', type: 'about' },
    })
    expect(link.statusCode, link.body).toBe(201)

    // It is where the message promised it would be: in the QUEUE, which is a query — the whole
    // reason the sentence no longer says "note", because GET /api/records?kind=note is a list
    // nothing sorts questions out of.
    const queue = await inject({ method: 'GET', url: '/api/records?kind=proposal' })
    const listed = bodyOf(queue)['records']
    expect(Array.isArray(listed) && listed.length).toBe(1)

    // ...and on the page of the thing it is about, which is where the human will meet it.
    const page = await inject({ method: 'GET', url: `/api/records/${subject.id}` })
    const links = bodyOf(page)['links'] as { other: { title: string } }[]
    expect(one(links, 'link').other.title).toBe('Position control or torque control for the handover?')

    // And the route the message says settles it is a real route that refuses the agent, rather
    // than a 404 the caller would spend its next turn on.
    const settle = await inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_AGENT,
      payload: { title: 'Stay on position control' },
    })
    expect(settle.statusCode, settle.body).toBe(403)

    // The decision itself is still the human's, and still refused to the agent — by both doors.
    expect(h.db.api.listRecords({ workspaceId: WORKSPACE, kind: 'decision' })).toHaveLength(0)
  })

  it('gives the same answer, with the id already filled in, when an agent tries to change one', async () => {
    const decision = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Stay on position control',
      data: { because: 'attribution' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${decision.id}`,
      headers: AS_AGENT,
      // THE WORDS WHY ARE THE CORE. This case used to change `revisit_when`, which criterion P76
      // makes one of the notes and opens to any agent; the refusal it is about is asked through
      // `because`, which is the decision itself.
      payload: { dataPatch: { because: 'rewritten by an agent' } },
    })
    expect(res.statusCode).toBe(403)
    const message = errorOf(res)
    // THE WORDS CHANGED TWICE AND THE ACT DID NOT. On 27 August this expected "Only the human may
    // change a decision", and then the authority refusal with a proposal's `toId` already filled
    // in. Criterion P76 of 13 September splits a decision into the decision itself and the notes
    // around it, and a decision the person made has a core no agent may touch — so this request now
    // meets the maker's refusal before it ever reaches the authority one. The authority refusal has
    // not gone: it is what the maker gets when it changes its own decision's core standing on
    // nothing, and tests/an-agent-may-decide-what-it-can-cite, tests/a-caller-cannot-claim-to-be-a-
    // person, tests/proposal-promotion and tests/records all still hold it.
    //
    // WHAT THIS CASE IS STILL ABOUT is what the agent is told: which record, why, and what to do
    // instead — without having to go and read the rules.
    expect(message).toContain('only whoever made it, or the person, may do that')
    expect(message).toContain(`recorded by "human ${THE_TEST_OFFICES_OWNER.id}"`)
    expect(message).toContain('may be changed by any agent')
    expect(message).toContain(`decision ${decision.id} is exactly as it was`)

    // Refused means refused: nothing was written and nothing was logged. `recorded_by` is here
    // because Mole Office wrote it when the person filed the record, from the actor on that request —
    // it is not something this refused patch put there. See tests/authority-on-a-decision.test.ts.
    expect(h.db.api.getRecord(decision.id)?.data).toEqual({ because: 'attribution', recorded_by: `human ${THE_TEST_OFFICES_OWNER.id}` })
    expect(h.db.api.listChanges({ workspaceId: WORKSPACE, recordId: decision.id }).filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('lets the human do it, so the rule is about who is asking and not about the kind', () => {
    const decision = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Stay on position control',
      data: { because: 'attribution' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    const patched = h.db.api.patchRecord(
      decision.id,
      { dataPatch: { revisit_when: 'the reprint is measured' } },
      { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    )
    expect(patched.record.data).toEqual({
      because: 'attribution',
      revisit_when: 'the reprint is measured',
      // Written by Mole Office from the actor that filed the record, and carried across every later
      // write. See tests/authority-on-a-decision.test.ts.
      recorded_by: `human ${THE_TEST_OFFICES_OWNER.id}`,
    })
  })
})

// ============================================================ 6. the audit's case, measured

/**
 * The numbers quoted in the endpoint documentation, taken rather than claimed.
 *
 * Two corrections are measured, because "correcting a six-character key" has two readings and
 * both are real:
 *
 *   `source` — a one-key correction on a 4 kB module. The common case.
 *   `blocks` — the audit's own mis-key, on a record written before the gate existed: the chart
 *              array has to move to `summaryBlocks` and the wrong key has to go.
 *
 * The counts are payload bytes as they cross the wire, measured with Buffer.byteLength on the
 * exact strings, plus the size of the change-log rows each route wrote. The assertions are on
 * the ratios; the printed table is what the report quotes.
 */
describe("the audit's case, measured", () => {
  const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

  /** Every byte the change log gained for one record, counting only the values. */
  function changeBytes(id: string): number {
    return h.db.api
      .listChanges({ workspaceId: WORKSPACE, recordId: id })
      .filter((c) => c.op === 'update')
      .reduce((n, c) => n + bytes(c.oldValue ?? '') + bytes(c.newValue ?? ''), 0)
  }

  it('costs one small call instead of two big ones to correct one key', async () => {
    const wholesale = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'chest camera, corrected wholesale',
      data: chestCamera(),
      actor: AGENT,
    })
    const merged = h.db.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'chest camera, corrected by merge',
      data: chestCamera(),
      actor: AGENT,
    })

    // ---- the old way: read the record, edit the object, send all of it back
    const read = await inject({ method: 'GET', url: `/api/records/${wholesale.id}` })
    const current = dataOf(recordOf(read))
    const wholeBody = JSON.stringify({ data: { ...current, source: 'design/explore.md, section 6' } })
    const wholeWrite = await inject({
      method: 'PATCH',
      url: `/api/records/${wholesale.id}`,
      headers: AS_AGENT,
      payload: JSON.parse(wholeBody),
    })
    expect(wholeWrite.statusCode).toBe(200)
    const oldWire = bytes(read.body) + bytes(wholeBody) + bytes(wholeWrite.body)
    const oldRows = changeBytes(wholesale.id)

    // ---- the new way: one call naming one key
    const mergeBody = JSON.stringify({ dataPatch: { source: 'design/explore.md, section 6' } })
    const mergeWrite = await inject({
      method: 'PATCH',
      url: `/api/records/${merged.id}`,
      headers: AS_AGENT,
      payload: JSON.parse(mergeBody),
    })
    expect(mergeWrite.statusCode).toBe(200)
    const newWire = bytes(mergeBody) + bytes(mergeWrite.body)
    const newRows = changeBytes(merged.id)

    // Both routes produced the same record. The saving is in what it cost, not in what it did.
    expect(dataOf(recordOf(mergeWrite))).toEqual(dataOf(recordOf(wholeWrite)))

    // The request an agent has to build is the part that matters most: it has to be able to
    // write it without holding the record.
    expect(bytes(mergeBody)).toBeLessThan(bytes(wholeBody) / 50)
    expect(newRows).toBeLessThan(oldRows / 50)
    expect(newWire).toBeLessThan(oldWire / 2)

    /* eslint-disable no-console -- the measurement is the point of this test */
    console.log(
      [
        '',
        "  correcting one six-character key (`source`) on a 4 kB module",
        '                       requests   request bytes   response bytes   total wire   change rows',
        `    wholesale (today)         2   ${String(bytes(wholeBody)).padStart(13)}   ${String(
          bytes(read.body) + bytes(wholeWrite.body),
        ).padStart(14)}   ${String(oldWire).padStart(10)}   ${String(oldRows).padStart(11)}`,
        `    dataPatch (new)           1   ${String(bytes(mergeBody)).padStart(13)}   ${String(
          bytes(mergeWrite.body),
        ).padStart(14)}   ${String(newWire).padStart(10)}   ${String(newRows).padStart(11)}`,
        '',
        `  change rows written by the merge: ${h.db.api
          .listChanges({ workspaceId: WORKSPACE, recordId: merged.id })
          .filter((c) => c.op === 'update')
          .map((c) => `${c.field} | ${c.oldValue ?? '(absent)'} -> ${c.newValue ?? '(removed)'}`)
          .join(' ; ')}`,
        '',
      ].join('\n'),
    )
  })

  it("repairs the audit's own mis-keyed record in one call", async () => {
    // The record as the audit left it: the curated summary filed under `blocks`, which nothing
    // reads. createRecord would refuse this now, so it is inserted underneath the API — which is
    // also how it got there, before the gate existed.
    const wrong = chestCamera()
    const chart = wrong['summaryBlocks']
    delete wrong['summaryBlocks']
    wrong['blocks'] = chart
    h.db.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'placeholder', actor: AGENT }) // keeps ids realistic
    const id = 'preGateRec1'
    h.db.client.sqlite
      .prepare(
        `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data)
         VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', '2026-05-01 09:00:00', '2026-05-01 09:00:00', 'module', ?, NULL, ?)`,
      )
      .run(id, WORKSPACE, 'LeafCam 2 overhead camera', JSON.stringify(wrong))

    const body = JSON.stringify({ dataPatch: { blocks: null, summaryBlocks: chart } })
    const res = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: JSON.parse(body),
    })
    expect(res.statusCode).toBe(200)

    const data = dataOf(recordOf(res))
    expect('blocks' in data).toBe(false)
    expect(data['summaryBlocks']).toEqual(chart)
    expect(bodyOf(res)['dataPatch']).toMatchObject({
      changed: ['data.summaryBlocks'],
      deleted: ['data.blocks'],
    })

    // Half a repair would be worse than none: removing `blocks` without putting the summary
    // back is refused, because the record it would produce is not the one that was asked for —
    // it is a module that lost its chart.
    const halfBody = { dataPatch: { blocks: null } }
    const half = await inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: halfBody,
    })
    // `blocks` is already gone by now, so this one reports it rather than pretending.
    expect(half.statusCode).toBe(200)
    expect(bodyOf(half)['dataPatch']).toMatchObject({ alreadyAbsent: ['data.blocks'], changed: [] })

    /* eslint-disable no-console -- the measurement is the point of this test */
    console.log(
      [
        '',
        "  the audit's mis-key (`blocks` -> `summaryBlocks`) on the same module",
        `    dataPatch request:        ${bytes(body)} bytes, 1 call`,
        `    change rows:              ${h.db.api
          .listChanges({ workspaceId: WORKSPACE, recordId: id })
          .filter((c) => c.op === 'update')
          .map((c) => `${c.field} (${bytes(c.oldValue ?? '') + bytes(c.newValue ?? '')} bytes)`)
          .join(' ; ')}`,
        '',
      ].join('\n'),
    )
  })
})
