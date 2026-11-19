// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD OF WHAT LEFT THE BUILDING IS NOT EVIDENCE THE SUSPECT KEEPS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A bundle's `exports` list is the only record Mole Office has of what was handed to an agent it does
 * not run — which records, at which versions, with which validity limits, on which day. The text
 * itself was pasted into somebody else's window and is gone.
 *
 * Wave 12 put a lock on ONE door: `assertMayRemoveAnExportedBundle` refuses an agent DELETING a
 * bundle whose list is not empty. That held. `design/round-ten/verification/wave-12.json` then
 * measured four ways round it on a copy of the owner's own corpus, every one of them answered 200:
 *
 *   1. PATCH {"dataPatch":{"exports":[]}}    then DELETE → 200, 200
 *   2. PATCH {"dataPatch":{"exports":null}}  then DELETE → 200, 200   (a merge null DELETES the key)
 *   3. PATCH {"data":{…no exports…}}         then DELETE → 200, 200   (wholesale replaces the bag)
 *   4. PATCH {"kind":"note"}                 then DELETE → 200, 200   (values set aside in `extra`,
 *                                                                      and the delete guard reads
 *                                                                      `kind !== 'context_bundle'`)
 *
 * And a create carrying a FABRICATED entry was answered 201, after which `#/bundles` drew the row
 * as *handed over once, 2026-08-26 20:54:49*.
 *
 * The rule was published the whole time. `GET /api/kinds/context_bundle` tells every agent *"AN
 * EXPORT IS WRITTEN BY THE SERVER. A create or a patch carrying `exports` is refused"*. Nothing
 * refused it. This file is that sentence made true, and it drives the REAL ROUTES rather than the
 * guard function, because a guard that is exported, registered and called from nowhere passes every
 * registry sweep in this repository.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PATCH PROOFS USE `dataPatch` AND NOT `data`
 * ---------------------------------------------------------------------------------------
 *
 * Three sessions in this campaign have proved a write-path refusal with `data`, which REPLACES the
 * whole object. Against a rule about one key that is a 200 proving nothing. `dataPatch` merges key
 * by key and is the narrowest thing that touches the field, so it is what a refusal about that
 * field has to survive. Both doors are asserted below, and the wholesale one is asserted for a
 * SECOND reason: it is bypass 3, where nothing names `exports` at all and the list goes anyway.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE OTHER DIRECTION, WHICH IS THE HALF THAT COULD HAVE BEEN FAKED
 * ---------------------------------------------------------------------------------------
 *
 * A guard written as "refuse any write that mentions exports" would pass every refusal below and
 * would also break the export route, whose own write goes through the ordinary patch door and names
 * `exports`. That is not a hypothetical: it is what the first draft of this guard did. So this file
 * asserts that the server still writes real exports, that it writes a SECOND one on top of the
 * first, that an ordinary edit to a bundle still goes through, and that the delete guard the whole
 * rule stands on still fires afterwards.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
let sharedT: TestDb
let sharedApp: FastifyInstance
let sharedBundleId: string

/**
 * ONE EXPORTED BUNDLE FOR THE FIVE REFUSALS THAT CHANGE NOTHING.
 *
 * Each of them used to file a bundle and export it afresh even though every one of them leaves the
 * record exactly as it found it, so one bundle serves all five. Every other case still makes its
 * own office. Both databases are separate, so a case that wants a clean count of what was filed
 * still gets one.
 */
beforeAll(async () => {
  sharedT = await freshDb()
  sharedApp = (await apiApp()).app
  await sharedApp.ready()
  sharedBundleId = await aBundleThatHasExported(sharedApp)
})

afterAll(async () => {
  await sharedApp.close()
  sharedT.close()
})

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown, headers = AGENT, on = app): Promise<{ status: number; body: any }> {
  const res = await on.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function patch(url: string, payload: unknown, headers = AGENT, on = app): Promise<{ status: number; body: any }> {
  const res = await on.inject({ method: 'PATCH', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string, headers = AGENT, on = app): Promise<{ status: number; body: any }> {
  const res = await on.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}

async function del(url: string, headers = AGENT, on = app): Promise<{ status: number; body: any }> {
  const res = await on.inject({ method: 'DELETE', url, headers })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}

/** The words of a refusal, whichever field the error envelope put them in. */
function said(body: any): string {
  return String(body?.error ?? body?.message ?? JSON.stringify(body))
}

/**
 * SOMETHING FOR THE PROJECT SCOPE TO CARRY: an OPEN LOOP, which is the only thing it carries.
 *
 * A project scope's carried set is `openLoopsFor` and nothing else — no anchor, no neighbours — so
 * a module on its own leaves it empty. That mattered while this file was being written: an empty
 * carried set asked `restrictionsInScope` a question with no subject, which refuses rather than
 * answering "nothing is restricted", and the refusal arrived as a 500 reading `internal error`.
 * That is fixed in its own commit with its own test; this helper is a problem rather than a module
 * because a project somebody would really export from has something open in it.
 */
async function aProjectWithSomethingInIt(on = app): Promise<string> {
  const made = await post('/api/records', {
    kind: 'problem',
    title: 'The far edge of the tray is not segmented at 40 cm',
    data: { symptom: 'Segmentation drops the far edge.', state: 'open' },
  }, AGENT, on)
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** A bundle over the whole project. Filing one is not exporting one; this writes no export. */
async function aFiledBundle(title = 'Hand this project to somebody else', on = app): Promise<string> {
  await aProjectWithSomethingInIt(on)
  const made = await post('/api/records', {
    kind: 'context_bundle',
    title,
    data: { scope: 'project', preset: 'recover_project' },
  }, AGENT, on)
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** A bundle that has really handed something over, through the route that does it. */
async function aBundleThatHasExported(on = app): Promise<string> {
  const id = await aFiledBundle(undefined, on)
  const done = await post('/api/bundles/export', { bundleId: id }, AGENT, on)
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return id
}

/** The `exports` list as the record actually holds it, read back off the record. */
async function storedExports(id: string, on = app): Promise<unknown[]> {
  const read = await get(`/api/records/${id}`, AGENT, on)
  const data = read.body?.record?.data as Record<string, unknown> | undefined
  const list = data?.['exports']
  return Array.isArray(list) ? list : []
}

/** An entry shaped exactly like the server's own, which is what makes it a forgery worth refusing. */
function aFabricatedEntry() {
  return {
    n: 1,
    at: '2026-08-26 20:54:49',
    by: { actorType: 'agent', actorId: 'claude-code' },
    characters: 10964,
    bytes: 10980,
    textHash: 'deadbeefdeadbeef',
    carried: [],
    restrictions: [],
    leftOut: [],
    fits: true,
  }
}

// ================================================================= the rule as it is published

describe('the rule an agent is told, at the address it is told at', () => {
  it('is served on the kind, so an agent learns it instead of meeting it as a 403', async () => {
    const served = await get('/api/kinds/context_bundle')
    expect(served.status).toBe(200)
    const rules = (served.body.kind.rules ?? []) as string[]
    const rule = rules.find((r) => r.includes('AN EXPORT IS WRITTEN BY THE SERVER'))
    expect(rule, 'the kind must still publish the rule this file enforces').toBeDefined()
    expect(String(rule)).toContain('carrying `exports` is refused')
  })

  it('publishes an example that carries no exports key, because filing is not exporting', async () => {
    const served = await get('/api/kinds/context_bundle')
    const example = served.body.kind.example as Record<string, unknown>
    expect(Object.keys(example)).not.toContain('exports')
  })
})

// ================================================================= forging one

describe('a caller may not claim a handover that never happened', () => {
  it('refuses a create carrying a fabricated export entry, where wave 12 measured a 201', async () => {
    // `data` IS THE ONLY DOOR A CREATE HAS — there is no `dataPatch` on a create — so this is the
    // narrowest thing that can carry the key here, and it is the exact request the verification
    // filed and got a 201 for.
    const refused = await post('/api/records', {
      kind: 'context_bundle',
      title: 'FORGED — claims it already went out',
      data: { scope: 'project', preset: 'recover_project', exports: [aFabricatedEntry()] },
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(said(refused.body)).toContain('written by the server')
    expect(said(refused.body)).toContain('POST /api/bundles/export')
    // AND NOTHING WAS FILED. A refusal that stored the record anyway would be the failure with a
    // 403 painted on it, and the bundles page would still draw the row as handed over.
    const listed = await get('/api/bundles')
    expect((listed.body.bundles as unknown[]).length).toBe(0)
  })

  it('refuses a person filing one too, because there is no honest way to type an export by hand', async () => {
    // THE DELETE GUARD LETS A PERSON THROUGH AND THIS ONE DOES NOT, and the difference is the
    // point. Deciding a record has served its purpose is a judgement a person may make. An entry
    // saying text of this size and this hash went to somebody on this day is either something the
    // server did, or it is a claim about an event with nothing behind it.
    const refused = await post(
      '/api/records',
      {
        kind: 'context_bundle',
        title: 'The owner types one themselves',
        data: { scope: 'project', preset: 'recover_project', exports: [aFabricatedEntry()] },
      },
      PERSON,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
  })

  it('refuses an agent PATCHING an entry on with dataPatch, which is the narrowest door there is', async () => {
    const id = await aFiledBundle()
    const refused = await patch(`/api/records/${id}`, { dataPatch: { exports: [aFabricatedEntry()] } })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(said(refused.body)).toContain('written by the server')
    expect(await storedExports(id)).toEqual([])
  })

  it('refuses it through a wholesale data as well, so the rule is not one door wide', async () => {
    const id = await aFiledBundle()
    const refused = await patch(`/api/records/${id}`, {
      data: { scope: 'project', preset: 'recover_project', exports: [aFabricatedEntry()] },
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(await storedExports(id)).toEqual([])
  })
})

// ================================================================= erasing one

describe('a caller may not erase a handover that did happen', () => {
  it('BYPASS 1 — refuses dataPatch {"exports":[]}, and the delete stays refused behind it', async () => {
    const id = sharedBundleId
    // This is the measured bypass, character for character.
    const emptied = await patch(`/api/records/${id}`, { dataPatch: { exports: [] } }, AGENT, sharedApp)
    expect(emptied.status, JSON.stringify(emptied.body)).toBe(403)
    expect(await storedExports(id, sharedApp)).toHaveLength(1)
    // AND THE DOOR IT WAS OPENING IS STILL SHUT. The refusal above is only worth having because of
    // this line: the delete guard was standing on a list anybody could empty.
    const deleted = await del(`/api/records/${id}`, AGENT, sharedApp)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(403)
    expect(said(deleted.body)).toContain('only record Mole Office has')
  })

  it('BYPASS 2 — refuses dataPatch {"exports":null}, which in a merge DELETES the key', async () => {
    const id = sharedBundleId
    const refused = await patch(`/api/records/${id}`, { dataPatch: { exports: null } }, AGENT, sharedApp)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(await storedExports(id, sharedApp)).toHaveLength(1)
    expect((await del(`/api/records/${id}`, AGENT, sharedApp)).status).toBe(403)
  })

  it('BYPASS 3 — refuses a wholesale data that simply omits the list, which drops it', async () => {
    const id = sharedBundleId
    // NOTHING IN THIS REQUEST SAYS `exports`. That is why the rule as published — "a create or a
    // patch CARRYING exports is refused" — would not have caught it, and why the guard asks a
    // second question about the body that would land rather than only the one that arrived.
    const refused = await patch(`/api/records/${id}`, { data: { scope: 'project', preset: 'continue' } }, AGENT, sharedApp)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(said(refused.body)).toContain('not a caller')
    expect(await storedExports(id, sharedApp)).toHaveLength(1)
    expect((await del(`/api/records/${id}`, AGENT, sharedApp)).status).toBe(403)
  })

  it('BYPASS 4 — refuses changing the kind away, which set the list aside and freed the delete', async () => {
    const id = sharedBundleId
    // Changing a kind keeps every value the new kind has no place for under `extra` — so this took
    // the exports off the bundle AND took the record out of the delete guard's reach, which reads
    // `kind !== 'context_bundle'` and stands down.
    const refused = await patch(`/api/records/${id}`, { kind: 'note' }, AGENT, sharedApp)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(said(refused.body)).toContain('Leave it as a context bundle')
    const read = await get(`/api/records/${id}`, AGENT, sharedApp)
    expect(read.body.record.kind).toBe('context_bundle')
    expect(await storedExports(id, sharedApp)).toHaveLength(1)
    expect((await del(`/api/records/${id}`, AGENT, sharedApp)).status).toBe(403)
  })

  it('refuses the way BACK too — a note whose extra holds an exports key may not become a bundle', async () => {
    // THE SAME HOLE READ FROM THE OTHER END. `extra` takes anything, and a kind change brings the
    // values it set aside back up when the record returns to the kind that has a place for them. So
    // a caller that could not write `exports` on a bundle could write it on a note and then rename
    // the record's kind into a handover it never made.
    const made = await post('/api/records', {
      kind: 'note',
      title: 'Innocent looking note',
      data: { body: 'nothing to see', extra: { exports: [aFabricatedEntry()] } },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const refused = await patch(`/api/records/${made.body.record.id}`, { kind: 'context_bundle' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(await storedExports(made.body.record.id as string)).toEqual([])
  })
})

// ================================================================= the other direction

describe('and the server still writes a real one, which is the half a blanket refusal would break', () => {
  it('exports, records the entry, and hands the text back', async () => {
    const id = await aFiledBundle()
    const done = await post('/api/bundles/export', { bundleId: id })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.export.n).toBe(1)
    expect(String(done.body.text).length).toBeGreaterThan(100)
    // The entry is really ON the record, not only in the reply.
    expect(await storedExports(id)).toHaveLength(1)
  })

  it('writes a SECOND entry on top of the first, so the guard is not a one-shot lock', async () => {
    // A GUARD THAT COMPARED THE LISTS AND REFUSED EVERY DIFFERENCE WOULD PASS EVERY TEST ABOVE and
    // would make the second export impossible. This is the line that tells the two apart.
    const id = await aBundleThatHasExported()
    const second = await post('/api/bundles/export', { bundleId: id })
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    expect(second.body.export.n).toBe(2)
    expect(await storedExports(id)).toHaveLength(2)
    const listed = await get('/api/bundles')
    expect(listed.body.bundles[0].exports).toHaveLength(2)
  })

  it('an AGENT may still export, because handing context over is the work agents do here', async () => {
    const id = await aFiledBundle()
    expect((await post('/api/bundles/export', { bundleId: id }, AGENT)).status).toBe(200)
  })

  it('leaves every ordinary edit to a bundle alone — the preset, the title, the summary', async () => {
    const id = await aBundleThatHasExported()
    expect((await patch(`/api/records/${id}`, { dataPatch: { preset: 'continue' } })).status).toBe(200)
    expect((await patch(`/api/records/${id}`, { title: 'A better name for it' })).status).toBe(200)
    expect((await patch(`/api/records/${id}`, { summary: 'What this was for.' })).status).toBe(200)
    // And none of those touched the record of what left.
    expect(await storedExports(id)).toHaveLength(1)
    const read = await get(`/api/records/${id}`)
    expect(read.body.record.data.preset).toBe('continue')
  })

  it('leaves a bundle that has never exported free to be edited wholesale, and deleted', async () => {
    // FILING ONE IS NOT AN ACT PANELX REFUSES. A bundle with no exports is a recipe nobody has
    // used: a wholesale rewrite of it drops nothing, and the delete guard already said so.
    const id = await aFiledBundle()
    expect((await patch(`/api/records/${id}`, { data: { scope: 'project', preset: 'continue' } })).status).toBe(200)
    expect((await patch(`/api/records/${id}`, { kind: 'note' })).status).toBe(200)
    const other = await aFiledBundle('Another recipe nobody used')
    expect((await del(`/api/records/${other}`)).status).toBeLessThan(300)
  })

  it('still lets the PERSON delete an exported bundle, so this guard did not widen that one', async () => {
    const id = await aBundleThatHasExported()
    expect((await del(`/api/records/${id}`, PERSON)).status).toBeLessThan(300)
  })
})

// ================================================================= the door it cannot come through

describe('the key that says "the server wrote this" cannot arrive over the wire', () => {
  it('refuses a body that spells the symbol out as a string, because a symbol is not a string', async () => {
    const id = sharedBundleId
    for (const spelling of ['an export is written by the server', 'AN_EXPORT_IS_WRITTEN_BY_THE_SERVER']) {
      const refused = await patch(`/api/records/${id}`, {
        dataPatch: { exports: [] },
        [spelling]: true,
      }, AGENT, sharedApp)
      // The route's own body schema is strict, so the unknown key is refused before the guard even
      // runs — 400 rather than 403. Either number is a refusal; what matters is that it is not 200
      // and that the list did not move.
      expect(refused.status, JSON.stringify(refused.body)).toBeGreaterThanOrEqual(400)
      expect(await storedExports(id, sharedApp)).toHaveLength(1)
    }
  })
})
