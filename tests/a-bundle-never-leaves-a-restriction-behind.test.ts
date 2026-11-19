// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TEXT THAT LEAVES THE BUILDING NEVER LOSES THE LIMIT ON A VALUE IT CARRIES.
 *
 * ---------------------------------------------------------------------------------------
 * THE REQUIREMENT, IN THE OWNER'S OWN TERMS
 * ---------------------------------------------------------------------------------------
 *
 * G.8: a fresh or external agent must not be handed `fx = 600` while losing *"temporary
 * placeholder; not valid for geometry"*. K.2: verify active placeholder restrictions survive.
 *
 * A bundle is the only thing in this product whose purpose is that content leaves. It goes to an
 * agent that will never make a second request: it cannot ask a follow-up, cannot open a record and
 * cannot see a mark on a screen. Everything it will ever know is in the text.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR RULES, THROUGH DIRECT RESOLUTION AND THE EXPORT DOOR
 * ---------------------------------------------------------------------------------------
 *
 * 1. The restriction rides inside the entry of the record it reaches — not as a slot a budget can
 *    drop.
 * 2. It is carried whenever the record it reaches is carried, at every length.
 * 3. It is printed twice from one read: whole near the top, and inline beside the record.
 * 4. An export REFUSES rather than going out with restrictions it could not read.
 *
 * RULE 4 IS THE ONE THAT COULD HAVE BEEN FAKED, and the last two tests are why. The restriction
 * reader ALWAYS reports one thing it could not check — the implementation map has no read that
 * rolls the import graph up to records, which is true of every call this product will ever make. A
 * refusal keyed on `couldNotCheck.length > 0` would refuse every export for ever, pass a test
 * called "it refuses", and be an outage. So this file asserts the ordinary export SUCCEEDS, asserts
 * the standing gap is disclosed in the text rather than swallowed, and asserts the refusal fires on
 * a record the walk genuinely could not go through.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }

/** The words that must survive the door. */
const MUST_NOT_BE_LOST = 'geometric accuracy claims'

let t: TestDb
let app: FastifyInstance
let commonScope: { block: string; placeholder: string; problem: string }
let bundleReader: typeof import('../src/server/lib/bundle.ts')

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  bundleReader = await import('../src/server/lib/bundle.ts')
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'empty', title: 'An empty test project' } })
  expect(made.statusCode, made.body).toBe(201)
  commonScope = await seedScope()
  t.client.sqlite.exec('SAVEPOINT common_scope')
})

beforeEach(() => {
  t.client.sqlite.exec('ROLLBACK TO common_scope')
  PERSON['x-mole-office-workspace'] = WORKSPACE
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}

async function del(url: string, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'DELETE', url, headers })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}

/**
 * A pipeline whose one step stands on a camera calibration nobody ever ran, and a problem filed
 * against that step so the bundle has an open loop to carry.
 */
async function seedScope(): Promise<{ block: string; placeholder: string; problem: string }> {
  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Perception', data: {} })
  const madeBlock = await post(`/api/records/${pipeline.body.record.id}/blocks`, {
    name: 'Pixel segmentation',
    state: 'doing',
  })
  const block = madeBlock.body.record.id as string
  const placeholder = await post('/api/records', {
    kind: 'placeholder',
    title: 'Wrist camera intrinsics are not calibrated',
    data: {
      what: "The wrist camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
      resolved_when: 'A checkerboard calibration run on the wrist camera.',
      allowed_uses: ['pipeline plumbing', 'shape/interface testing'],
      disallowed_claims: [MUST_NOT_BE_LOST, 'production deployment validation'],
      severity: 'stops_final',
    },
  })
  expect(placeholder.status, JSON.stringify(placeholder.body)).toBe(201)
  expect((await post('/api/links', { fromId: placeholder.body.record.id, toId: block, type: 'about' })).status).toBe(201)
  const problem = await post('/api/records', {
    kind: 'problem',
    title: 'Segmentation drops the far edge',
    data: { symptom: 'The far edge of the tray is not segmented at 40 cm.', state: 'open' },
  })
  expect((await post('/api/links', { fromId: problem.body.record.id, toId: block, type: 'about' })).status).toBe(201)
  return { block, placeholder: placeholder.body.record.id, problem: problem.body.record.id }
}

/** The common fixture is restored by the savepoint before every case. */
async function aScopeWithATemporaryValueInIt() { return commonScope }

/** Resolve wording directly; refusal and export cases still use their doors. */
async function previewOf(recordId?: string) {
  const body = await bundleReader.resolveBundle(bundleReader.specOf(recordId === undefined
    ? { scope: 'project', preset: 'recover_project' }
    : { scope: 'record', scopeRecordId: recordId, preset: 'continue' }), PERSON['x-mole-office-workspace'])
  return { body: { ...body, couldNotCheck: body.couldNotCheckInScope } }
}

/** A filed bundle over that scope. Filing is not exporting; this writes no export. */
async function aBundleOver(recordId: string): Promise<string> {
  const made = await post('/api/records', {
    kind: 'context_bundle',
    title: 'Hand the perception step to somebody else',
    data: { scope: 'record', scopeRecordId: recordId, preset: 'continue', reach: 2 },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

describe('a restriction survives into text that leaves the building', () => {
  it('prints the whole restriction near the top, with the words the author wrote', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const preview = await get(`/api/bundles/preview?scope=${block}&preset=continue`)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)
    expect(text).toContain('VALIDITY LIMITS')
    // The author's own strings, unchanged. Mole Office never re-words these.
    expect(text).toContain(MUST_NOT_BE_LOST)
    expect(text).toContain('pipeline plumbing')
    // The KIND is a printed word. A reader handed one heading and no word separating a placeholder
    // from a method that ran instead learns neither.
    expect(text).toContain('A PLACEHOLDER')
  })

  it('prints it a second time, inline, beside the record it reaches', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const text = String((await previewOf(block)).body.text)
    // A restriction that arrives as a footnote is not a restriction. Twice, from one read.
    const inline = text.split('\n').filter((l) => l.includes('LIMIT —'))
    expect(inline.length, 'the restriction must appear beside the record as well as at the top').toBeGreaterThan(0)
  })

  it('says it looked and found none, so an absence is never mistaken for nobody looking', async () => {
    const made = await post('/api/records', { kind: 'module', title: 'A module nothing restricts', data: { context: 'why' } })
    const text = String((await previewOf(made.body.record.id)).body.text)
    expect(text).toContain('That is a checked absence, not an unchecked one')
    // BOTH kinds were looked for. One sentence naming only placeholders would leave a reader who
    // knows this product wondering whether fallbacks were looked for at all.
    expect(text).toContain('ran a different method')
  })

  it('says what it left out and of what kind, never a bare count', async () => {
    await aScopeWithATemporaryValueInIt()
    // THE PROJECT SCOPE, because that is where a subtraction actually happens: this project holds
    // a pipeline, a step and a placeholder, and none of those is an open loop. A test that read a
    // scope with nothing subtracted would loop over an empty list and assert nothing, which is how
    // a "never a bare count" test passes against a bare count.
    const preview = await get('/api/bundles/preview?preset=recover_project')
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const leftOut = preview.body.leftOut as { count: number; says: string }[]
    expect(leftOut.length, 'this project must subtract something, or this test asserts nothing').toBeGreaterThan(0)
    for (const one of leftOut) {
      expect(one.count).toBeGreaterThan(0)
      expect(one.says, 'every bucket says what was dropped, not only how many').not.toBe('')
      expect(one.says.length).toBeGreaterThan(20)
    }
    expect(String(preview.body.text)).toContain('WHAT IS NOT IN THIS TEXT')
    // And the sentence is on the page a person reads, not only in the JSON.
    expect(String(preview.body.text)).toContain(String(leftOut[0]?.says ?? '\u0000'))
  })
})

describe('the text a stranger reads is written in words, not in stored values', () => {
  it('never prints an object, and never prints a stored word raw', async () => {
    // THIS TEST EXISTS BECAUSE THE FIRST VERSION OF THIS FILE FAILED IT ON THE OWNER'S OWN CORPUS.
    // `readerWord` hands back a `Word` object, not a string, and the header of an 8,806-byte export
    // read `About: PanelX — work-state rules ([object Object])`. The machine-word gate scans
    // `src/web`; this text is composed on the server and goes to a stranger who cannot ask what a
    // word meant, so it needs its own guard.
    const { block } = await aScopeWithATemporaryValueInIt()
    const text = String((await previewOf(block)).body.text)
    expect(text).not.toContain('[object Object]')
    expect(text).not.toContain('undefined')
    // An underscore in a printed word is the shape of a stored value that never went through the
    // reading table: `stops_final`, `ran_instead`, `not_an_open_loop`.
    const bare = text
      .split('\n')
      .filter((line) => /\b[a-z]+_[a-z_]+\b/.test(line))
      // A stored id and a path are allowed to be themselves; a WORD is not.
      .filter((line) => !line.includes('/api/') && !line.startsWith('  id '))
    expect(bare, 'every printed word goes through the reading table').toEqual([])
  })
})

describe('the export, and the refusal that is not a blanket one', () => {
  it('exports, and records what left with the version each record held', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    const done = await post('/api/bundles/export', { bundleId: bundle })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.export.n).toBe(1)
    expect(String(done.body.text)).toContain(MUST_NOT_BE_LOST)
    // WHAT LEFT, exactly: record ids with the version each held at that moment.
    const carried = done.body.export.carried as { recordId: string; contentHash: string }[]
    expect(carried.length).toBeGreaterThan(0)
    for (const one of carried) expect(one.contentHash).toMatch(/^[0-9a-f]{16}$/)
    // And the restriction that went with them.
    expect((done.body.export.restrictions as unknown[]).length).toBeGreaterThan(0)
  })

  it('numbers exports 1, 2, 3, so an answer coming back can quote which context it was based on', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    const { getRecord } = await import('../src/server/lib/records.ts')
    const resolved = (await previewOf(block)).body
    const next = () => bundleReader.recordAnExport({ bundle: getRecord(bundle)!, resolved, text: resolved.text,
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    expect(next().n).toBe(1)
    expect(next().n).toBe(2)
    const listed = await get('/api/bundles')
    expect(listed.body.bundles[0].exports).toHaveLength(2)
  })

  it('discloses the gap it could NOT look at, rather than refusing over it or swallowing it', async () => {
    // THE MEASUREMENT THIS WHOLE REFUSAL RESTS ON. `restrictionsInScope` always reports that code
    // dependencies between records were not walked. If the refusal were keyed on that list being
    // empty, every export in this product would 409 for ever.
    const { block } = await aScopeWithATemporaryValueInIt()
    const preview = await previewOf(block)
    expect((preview.body.standingGaps as unknown[]).length).toBeGreaterThan(0)
    expect(preview.body.couldNotCheck).toEqual([])
    expect(String(preview.body.text)).toContain('WHAT WAS NOT LOOKED AT')
    // And the ordinary export goes through, which is the other direction of the same claim.
    expect((await post('/api/bundles/export', { bundleId: await aBundleOver(block) })).status).toBe(200)
  })

  it('REFUSES the export when a record in scope could not be checked, and writes nothing', async () => {
    const { block, problem } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    // Delete a record the bundle would carry. The restriction walk cannot go through a deleted
    // record, so Mole Office cannot say whether the text carries a value without its limit.
    expect((await del(`/api/records/${problem}`)).status).toBeLessThan(300)
    const refused = await post('/api/bundles/export', { bundleId: bundle })
    expect(refused.status).toBe(409)
    expect(refused.body.refused).toBe(true)
    expect(String(refused.body.note)).toContain('Nothing was exported')
    // NOTHING WAS WRITTEN. The bundle has no export on it.
    const listed = await get('/api/bundles')
    expect(listed.body.bundles[0].exports).toEqual([])
  })
})

describe('a bundle that has exported is not an agent\'s to delete', () => {
  it('lets an agent delete a bundle that has never exported, because filing one is not an act Mole Office refuses', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    expect((await del(`/api/records/${bundle}`, AGENT)).status).toBeLessThan(300)
  })

  it('refuses an agent deleting one that HAS exported, because the export is the only evidence of what left', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    expect((await post('/api/bundles/export', { bundleId: bundle })).status).toBe(200)
    const refused = await del(`/api/records/${bundle}`, AGENT)
    expect(refused.status).toBe(403)
    expect(String(refused.body.error ?? refused.body.message)).toContain('only record Mole Office has')
  })

  it('lets the person delete it, because the rule is about an agent tidying away what left', async () => {
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    expect((await post('/api/bundles/export', { bundleId: bundle })).status).toBe(200)
    expect((await del(`/api/records/${bundle}`, PERSON)).status).toBeLessThan(300)
  })
})

describe('a project with nothing open in it is answered in words, not with an internal error', () => {
  beforeEach(() => { PERSON['x-mole-office-workspace'] = 'empty' })
  /**
   * FOUND WHILE BUILDING THE BUTTON THAT SITS ON TOP OF IT, 26 August 2026.
   *
   * A project scope carries its OPEN LOOPS and nothing else, so a project with none — every
   * project on the day it is started — handed `restrictionsInScope` a question with no subject.
   * That function refuses one, correctly: *"an empty answer to an empty question would read as
   * `nothing is restricted`"*. But it throws a plain Error, so the refusal reached the caller as
   * HTTP 500 reading `internal error`, on both doors. `#/bundles`'s own *Read what it would say*
   * is the first thing a new person presses, and this is what it answered.
   */
  it('previews a project that has no open loops, instead of answering 500', async () => {
    // Deliberately NOT empty: one module, which is a record and is not an open loop. An empty
    // database would also pass this test and would not be the case that was broken.
    const made = await post('/api/records', { kind: 'module', title: 'Nothing is open here', data: { context: 'why' } })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const preview = await get('/api/bundles/preview?preset=recover_project')
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body.carried).toEqual([])
    expect(String(preview.body.text).length).toBeGreaterThan(0)
  })

  it('says NOBODY LOOKED rather than NOTHING IS LIMITED, which is the distinction the refusal protects', async () => {
    await post('/api/records', { kind: 'module', title: 'Nothing is open here', data: { context: 'why' } })
    const preview = await previewOf()
    // The standing gap every other resolution discloses is disclosed here too. An empty scope that
    // printed a clean bill of health would be the exact sentence `restrictionsInScope` refuses to
    // say, arriving by another route.
    expect((preview.body.standingGaps as unknown[]).length).toBeGreaterThan(0)
    expect(String(preview.body.text)).toContain('WHAT WAS NOT LOOKED AT')
  })

  it('exports it too, and records what left — which was nothing, said as nothing', async () => {
    await post('/api/records', { kind: 'module', title: 'Nothing is open here', data: { context: 'why' } })
    const bundle = await post('/api/records', {
      kind: 'context_bundle',
      title: 'A copy of a project that has not started',
      data: { scope: 'project', preset: 'recover_project' },
    })
    const done = await post('/api/bundles/export', { bundleId: bundle.body.record.id })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.export.carried).toEqual([])
    expect(done.body.export.n).toBe(1)
  })
})

describe('a bundle adds no table', () => {
  it('stores everything it knows in a record, so the schema is exactly as it was', async () => {
    const before = t.client.db.all("select name from sqlite_master where type='table'") as { name: string }[]
    const { block } = await aScopeWithATemporaryValueInIt()
    const bundle = await aBundleOver(block)
    expect((await post('/api/bundles/export', { bundleId: bundle })).status).toBe(200)
    const after = t.client.db.all("select name from sqlite_master where type='table'") as { name: string }[]
    expect(after.map((r) => r.name).sort()).toEqual(before.map((r) => r.name).sort())
  })
})
