// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VERDICT COMES WITH A KEY: THE DOOR THAT RELEASES OR REFUSES A RUN TAKES NO NAME ALONE.
 *
 * Acceptance finding 79 (report EnJvvsDTF_Dx, block f-79); the secretary's go of 25 September 2026, message YWieW_DDgUE8.
 * `POST /api/checks/:run` ends a run's check and lets its work go on towards main: it is the merge queue's review
 * gate. It asks whether the caller holds the inspector card or is the run's starter, and it reads both off the
 * headers, while an agent's name sent with no key is still taken as that agent (the key window covers only a claim
 * to be the person). So any process that could reach the office could send the inspector's name and release a run.
 * In the seven days before this, all 107 verdicts the door took came with a key, so asking for one takes nothing
 * from anybody.
 *
 * WHAT IS PROVED, through a real listener, because the rule is about a request a listener carried and an injected
 * request is on no socket (tests/the-press-closes-the-window.test.ts says the same for the key window):
 *   - the inspector's name with no key is refused with 403 and the sentence that says what is missing, and the run
 *     holds no verdict afterwards;
 *   - the same release with the office's key, which is what the check tool sends under the inspector's name, is
 *     taken;
 *   - a starter releasing its own agent's run with its own agent key is taken.
 * And, with `app.inject()`, which IS the in-process caller: a name alone from inside the office is still taken,
 * because a request no listener carried is the office itself.
 *
 * MUTATION PROOF, 25 September 2026, each alone in src/server/api/inspection.ts, after a green control:
 *   - refuseAVerdictWithNoKey never throws: the first case goes red, because the keyless release is taken;
 *   - refuseAVerdictWithNoKey forgets that an absent `from` is the office: the in-process case goes red.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readRelease, type WhatWasRead } from '../src/shared/releasing.ts'
import { settings } from '../src/config/settings.mjs'
import { theVerdictDoorRecordedIt } from '../src/shared/flow-run.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})
const A_RELEASE = { verdict: 'released', check: 'Read the brief and the changes; nothing is missing.', chaptersRead: [] }

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
/** The key the registration door answered for the secretary that starts this file's second worker. */
let theStartersKey = ''

/** Register through the real door, and hand back what it answered. */
async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<{ whatToGiveIt?: { key?: string } }> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as { whatToGiveIt?: { key?: string } }
}

/** A finished run the named worker filed for itself, assembled for a check by the inspector. */
async function aFinishedRun(handle: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd(), doing: 'the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const run = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  return run
}

/** The office's own key, read from the file the office made beside the database. Never printed or asserted on. */
function theOfficesKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office?: unknown }
  if (typeof held.office !== 'string') throw new Error('the office made no key of its own beside the database')
  return held.office
}

/** A release of this run, through the listener, with these headers. */
async function releaseThroughTheListener(run: string, headers: Record<string, string>): Promise<{ status: number; error: string }> {
  const res = await fetch(`${thisMachine}/api/checks/${run}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(A_RELEASE),
  })
  const body = (await res.json()) as { error?: string }
  return { status: res.status, error: body.error ?? '' }
}

/** Whether the run holds a verdict, read off its row. */
function theVerdictOn(run: string): { released: unknown; refused: unknown } {
  return t.client.sqlite
    .prepare("SELECT json_extract(data, '$.released') AS released, json_extract(data, '$.refused') AS refused FROM records WHERE id = ?")
    .get(run) as { released: unknown; refused: unknown }
}

/**
 * EXPLICIT LIMITS, AS THE NEIGHBOURING FILES THAT START A SERVER HAVE (the-check-is-drawn-on-the-runs-page,
 * the-office-runs-the-check-tool-itself). The setup makes a fresh database, a server on a real listener and four
 * registrations, and each case files and assembles a run and posts through the listener. The inspector's check of run
 * EREUe46VK-yU (message 0pGWNRYqzXVw, 25 September 2026) ran this file three times, and twice the setup passed
 * vitest's default 10-second hook limit at machine loads of 42 and 59, so its cases never ran.
 */
const SETUP_LIMIT_MS = 180_000
const CASE_LIMIT_MS = 60_000

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const secretary = await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  theStartersKey = secretary.whatToGiveIt?.key ?? ''
  expect(theStartersKey, 'the registration answered no key for the secretary').not.toBe('')
  // ONLY THE PERSON APPOINTS AN INSPECTOR.
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-one', name: 'Worker One', role: 'worker', workArea: ['src'] })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-two', name: 'Worker Two', role: 'worker', workArea: ['src'] })
}, SETUP_LIMIT_MS)

afterAll(async () => {
  await app.close()
  t.close()
}, CASE_LIMIT_MS)

describe('the verdict door, reached through a listener', () => {
  let run = ''

  it("refuses a release that sends the inspector's name and no key, and writes nothing", async () => {
    run = await aFinishedRun('worker-one', 'A run somebody tries to release with a name alone')
    const said = await releaseThroughTheListener(run, asAgent('inspector-one'))
    expect(said.status, said.error).toBe(403)
    expect(said.error).toContain('came with no key')
    expect(said.error).toContain('Nothing was written')
    expect(said.error).toContain('sends its own agent key')
    expect(theVerdictOn(run)).toEqual({ released: null, refused: null })
  }, CASE_LIMIT_MS)

  it('takes the same release with the key the check tool sends under the inspector name', async () => {
    const said = await releaseThroughTheListener(run, { ...asAgent('inspector-one'), 'x-mole-office-key': theOfficesKey() })
    expect(said.status, said.error).toBe(201)
    expect(theVerdictOn(run).released).not.toBeNull()
  }, CASE_LIMIT_MS)

  it("takes a starter's release of its own agent's run with its own agent key", async () => {
    const own = await aFinishedRun('worker-two', 'A run its starter releases itself')
    const said = await releaseThroughTheListener(own, { ...asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'x-mole-office-key': theStartersKey })
    expect(said.status, said.error).toBe(201)
    expect(theVerdictOn(own).released).not.toBeNull()
  }, CASE_LIMIT_MS)
})

describe('the verdict door, asked from inside the office', () => {
  it('still takes a name alone, because a request no listener carried is the office itself', async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-three', name: 'Worker Three', role: 'worker', workArea: ['src'] })
    const run = await aFinishedRun('worker-three', 'A run released from inside the office')
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: A_RELEASE })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(theVerdictOn(run).released).not.toBeNull()
  }, CASE_LIMIT_MS)
})

/** adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5. */
describe('the seal kind travels through the verdict door and release reader', () => {
  /** MUTATIONS: drop sealKind in asTheReleaseSpellsIt, or in readWhatWasRead.
   * Each of the git, records and files cases goes red at the stored or read-back assertion. */
  it.each(['git', 'records', 'files'] as const)('keeps %s without inventing a tip', async (sealKind) => {
    const run = await aFinishedRun('worker-one', `A synthetic ${sealKind} reading`)
    const read: WhatWasRead = { sealId: 'synthetic-seal', sealHash: 'a'.repeat(64), sealKind, worktree: 'synthetic sealed work', ofItsOwn: true, says: 'Synthetic: read sealed work, with no tip recorded.' }
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: { ...A_RELEASE, read } })
    expect(reply.statusCode, reply.body).toBe(201)
    const stored = JSON.parse(String(theVerdictOn(run).released)) as { read: WhatWasRead }
    expect(stored.read.sealKind).toBe(sealKind)
    expect(stored.read).not.toHaveProperty('tip')
    expect(readRelease(stored)?.read?.sealKind).toBe(sealKind)
  }, CASE_LIMIT_MS)

  /** MUTATION: infer a kind from tip or sealId in readWhatWasRead. Absence remains absence. */
  it('reads older sealed releases without guessing their kind', () => {
    for (const tip of [undefined, 'synthetic-tip']) {
      const released = readRelease({ by: { kind: 'agent', id: 'inspector-one' }, at: '2026-09-30 10:00:00', how: 'an inspector', read: { sealId: 'synthetic-seal', worktree: 'record manifest synthetic-seal', ofItsOwn: true, says: 'Synthetic old reading.', ...(tip === undefined ? {} : { tip }) } })
      expect(released?.read).not.toBeNull()
      expect(released?.read).not.toHaveProperty('sealKind')
    }
  })
})

/** 8Rqdy6PXQnG2, inspector ab2Bj-DkFm7S on adTmco_wIzln; invariants 2, 8 and 9.
 * Unlike the legacy readings above, these readings name a real seal made by the finish door. */
describe('the reading names the seal\'s own kind at both doors', () => {
  async function aSealedRecordsRun(): Promise<{ run: string; read: WhatWasRead }> {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic sealed record', workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'worker-one' }, origin: 'fixture', data: {} })
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('worker-one'),
      payload: { kind: 'session', title: 'Synthetic records run', data: { state: 'running', servingAgent: 'worker-one',
        submission: { kind: 'records', records: [record.id] } } } })
    expect(made.statusCode, made.body).toBe(201)
    const run = (made.json() as { record: { id: string } }).record.id
    const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent('worker-one'),
      payload: { dataPatch: { state: 'finished' } } })
    expect(finished.statusCode, finished.body).toBe(200)
    const { readRunSeal } = await import('../src/server/lib/sealed-tip.ts')
    const seal = readRunSeal(run)!
    expect(seal.seal.kind).toBe('records')
    return { run, read: { sealId: seal.id, sealHash: seal.seal.hash, sealKind: 'records',
      worktree: `record manifest ${seal.id}`, ofItsOwn: true, says: 'Synthetic reading of sealed record revisions.' } }
  }

  // LEAVING OUT THE RUN'S FLOW RUN, the one record a refused verdict does change since wave 1 of the office flow:
  // the refusal is recorded there as a step (tests/the-office-writes-a-runs-steps.test.ts measures it).
  function whatIsStored(run: string) {
    return {
      data: t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run),
      records: t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind != 'flow_run'").get(),
      revisions: t.client.sqlite.prepare("SELECT count(*) AS n FROM revisions WHERE record_id NOT IN (SELECT id FROM records WHERE kind = 'flow_run')").get(),
    }
  }
  const theFlowRunOf = (run: string): string =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }).id

  for (const verdict of ['released', 'refused'] as const) {
    /** MUTATION: remove the sealKind comparison in releaseOrRefuse.
     * Both wrong-kind cases accept the verdict and store it instead of refusing it. */
    it.each(['git', 'files'] as const)(`refuses a ${verdict} verdict naming %s for a records seal and stores nothing`, async (sealKind) => {
      const { run, read } = await aSealedRecordsRun()
      const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'),
        payload: { changes: [], base: null, read } })
      expect(assembled.statusCode, assembled.body).toBe(201)
      const before = whatIsStored(run)
      const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'),
        payload: { ...A_RELEASE, verdict, read: { ...read, sealKind }, missing: ['Synthetic missing work'], says: { invariant: 2 } } })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(reply.json().error).toBe(`The reading names seal kind ${sealKind}, but the seal's own kind is records.`)
      expect(reply.json().recorded).toBe(theVerdictDoorRecordedIt(theFlowRunOf(run)))
      expect(whatIsStored(run)).toEqual(before)
      expect(theVerdictOn(run)).toEqual({ released: null, refused: null })
    }, CASE_LIMIT_MS)
  }

  /** MUTATION: remove the sealKind comparison in rememberWhatTheCheckWouldRead.
   * Both wrong-kind cases accept and store the assembly instead of refusing it. */
  it.each(['git', 'files'] as const)('refuses an assembly naming %s for a records seal and stores nothing', async (sealKind) => {
    const { run, read } = await aSealedRecordsRun()
    const before = whatIsStored(run)
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'),
      payload: { changes: [], base: null, read: { ...read, sealKind } } })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toBe(`The reading names seal kind ${sealKind}, but the seal's own kind is records.`)
    expect(whatIsStored(run)).toEqual(before)
  }, CASE_LIMIT_MS)

  /** MUTATION: remove the kind comparison at either door; these acceptance controls stay green.
   * Matching and absent kinds still pass through assembly, storage and the release reader. */
  it.each(['matching', 'absent'] as const)('stores an assembly and verdict with kind %s', async (kind) => {
    const { run, read } = await aSealedRecordsRun()
    if (kind === 'absent') delete read.sealKind
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'),
      payload: { changes: [], base: null, read } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    expect(t.api.getRecord(run)?.data['whatTheCheckWouldRead']).toMatchObject({ read })
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent('inspector-one'), payload: { ...A_RELEASE, read } })
    expect(reply.statusCode, reply.body).toBe(201)
    const stored = JSON.parse(String(theVerdictOn(run).released)) as { read: WhatWasRead }
    expect(stored.read).toEqual(read)
    // The shared reader represents a missing tip as null; storage keeps the tip absent.
    expect(readRelease(stored)?.read).toEqual({ ...read, tip: null })
    if (kind === 'absent') {
      expect(stored.read).not.toHaveProperty('sealKind')
      const assembly = t.api.getRecord(run)?.data['whatTheCheckWouldRead'] as { read: WhatWasRead }
      expect(assembly.read).not.toHaveProperty('sealKind')
    }
  }, CASE_LIMIT_MS)
})
