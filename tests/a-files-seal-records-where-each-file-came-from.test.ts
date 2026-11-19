// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A FILES SEAL RECORDS WHERE EACH FILE CAME FROM, AND A RELEASE OF IT JUDGES WHAT IT WAS HANDED.
 *
 * A2 of a decision, of 23 September 2026, agreed that morning with the two secretaries
 * by messages 6FEYWKFvTByI and TUD14-5BmQOc, then MH95FET523lL, My3RC2YMM_WP
 * and f8wmvHC3QvZr. A1 let a run
 * whose work is a folder of files be sealed, checked and landed. A2 adds two things:
 *   - "the origin is sealed, not guessed": the original of each file is recorded at finish, and it counts
 *     only where the run could not have written it;
 *   - "named must mean judged": a file the files checker hands on is covered only by a release that
 *     gives a line of the model's own on it.
 *
 * WHAT IS PROVED
 *   1. A run that names an original for a staged file gets it on its seal: the real path, its sha256
 *      at finish, the named repair, and `couldWrite` null when the office recorded no sandbox for it.
 *   2. A named original that is not on this machine, one named for a path the folder does not hold, and
 *      a repair office code cannot recompute each refuse the finish by name, and nothing is stored.
 *   3. With a sandbox folder the office recorded and the host's ledger vouches for, an original inside
 *      that folder is `couldWrite` true, and one outside it false. A folder the ledger does not vouch for
 *      counts as no folder: null.
 *   4. A run's `sandbox` is never written by the run's own agent, on either door, and once set it is not
 *      changed by anybody but the person.
 *   5. A release of a files seal that leaves a path it was handed to judge without its own line is
 *      refused, and nothing is written. One with a line for every path is stored, and the line comes
 *      back through the reader the queue uses.
 *
 * MUTATION PROOF, each run alone on 23 September 2026, with what it turned red:
 *   - the named originals not sealed (src/server/lib/sealed-tip.ts): case 1 red;
 *   - a missing original not refused: case 2 red, the finish answered 200;
 *   - the sandbox folder never read: case 3 red, `couldWrite` null where true was due;
 *   - the folder not held against the words of its ledger row: case 3 red on the lookalike folder, whose
 *     originals then read as `false`, outside the run's reach — the exact failure the rule exists for;
 *   - the container's name not held against the folder: case 3 red on the forged one;
 *   - a run naming its own sandbox allowed (src/server/lib/records.ts): case 4 red;
 *   - a set sandbox changed by the starter: case 5 red;
 *   - a release of a files seal accepted without a line per handed path (src/server/lib/inspection.ts):
 *     case 6 red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theRowNamesTheFolder, theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const agentHeaders = (id: string, session?: string) => ({
  'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const asWorker = agentHeaders('origin-worker')
const asStarter = agentHeaders('origin-starter')
const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const folders: string[] = []
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

function aFolder(prefix: string, files: Record<string, string> = {}): string {
  mkdirSync('.logs', { recursive: true })
  const dir = realpathSync(mkdtempSync(join(process.cwd(), '.logs', prefix)))
  folders.push(dir)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

const RECORDING = '{"t":1}\n'

/** A running files run filed by its starter, as the launcher files one. */
function aRun(submission: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session', title: 'Synthetic files run with originals', workspaceId: 'default', actor: { type: 'agent', id: 'origin-starter' }, origin: 'fixture',
    data: { state: 'running', servingAgent: 'origin-worker', submission: { kind: 'files', ...submission }, ...extra },
  }).id
}

async function finish(id: string) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
}

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string, name = folder.split('/').at(-1)!): string {
  const id = `row-${Math.random().toString(36).slice(2, 10)}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-09-23 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; seals = await import('../src/server/lib/sealed-tip.ts')
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle: 'origin-starter', name: 'Synthetic starter' } })
  expect(started.statusCode, started.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asStarter, payload: { handle: 'origin-worker', name: 'Synthetic files worker', workArea: ['runs'] } })
  expect(worker.statusCode, worker.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close(); for (const dir of folders) rmSync(dir, { recursive: true, force: true }) })

describe('the origin of each file is sealed at finish', () => {
  it('records the real path, its sha256 then and the named repair, and says it cannot tell where the run could write', async () => {
    const stagedAt = aFolder('origin-staged-', { 'runs/E1/ticks.jsonl': RECORDING, 'runs/RECOVERY.md': '# note\n' })
    const originals = aFolder('origin-originals-', { 'ticks.jsonl': `${RECORDING}\0\0\0` })
    const id = aRun({ stagedAt, root: aFolder('origin-root-'), sources: { 'runs/E1/ticks.jsonl': { path: join(originals, 'ticks.jsonl'), transform: 'trailing-nul-trim' } } })
    const r = await finish(id)
    expect(r.statusCode, r.body).toBe(200)
    const files = seals.readRunSeal(id)!.seal.files!.files
    expect(files.find((one) => one.path === 'runs/E1/ticks.jsonl')?.origin).toEqual({ path: join(originals, 'ticks.jsonl'), sha256: sha256(`${RECORDING}\0\0\0`), transform: 'trailing-nul-trim', couldWrite: null })
    // A FILE THE RUN NAMED NO ORIGINAL FOR CARRIES NONE, so a seal that names none hashes as it did before A2.
    expect(files.find((one) => one.path === 'runs/RECOVERY.md')).not.toHaveProperty('origin')
  })

  it('refuses the finish, by name, for an original that is not here, a path the folder does not hold, and a repair it cannot recompute', async () => {
    const stagedAt = aFolder('origin-staged-', { 'runs/a.jsonl': RECORDING })
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ 'runs/a.jsonl': '/nowhere/at/all/a.jsonl' }, /The original named for runs\/a\.jsonl, \/nowhere\/at\/all\/a\.jsonl, is not on this machine/],
      [{ 'runs/b.jsonl': join(stagedAt, 'runs', 'a.jsonl') }, /names runs\/b\.jsonl, which is not a file in the staged folder/],
      [{ 'runs/a.jsonl': { path: join(stagedAt, 'runs', 'a.jsonl'), transform: 'gzip' } }, /the one office code can recompute is trailing-nul-trim/],
    ]
    for (const [sources, says] of cases) {
      const id = aRun({ stagedAt, root: aFolder('origin-root-'), sources })
      const r = await finish(id)
      expect(r.statusCode, r.body).toBe(409)
      expect(r.body).toMatch(says)
      expect(t.api.getRecord(id)?.data['state']).toBe('running')
      expect(seals.readRunSeal(id)).toBeNull()
    }
  })

  it('knows where the run could write only from a sandbox folder the host ledger vouches for', async () => {
    const instance = aFolder('origin-instance-', { 'out/copy.jsonl': RECORDING })
    const stagedAt = aFolder('origin-staged-', { 'runs/in.jsonl': RECORDING, 'runs/out.jsonl': RECORDING })
    const originals = aFolder('origin-originals-', { 'out.jsonl': RECORDING })
    const sources = { 'runs/in.jsonl': join(instance, 'out', 'copy.jsonl'), 'runs/out.jsonl': join(originals, 'out.jsonl') }
    const row = aContainerRow(instance)
    const vouched = aRun({ stagedAt, root: aFolder('origin-root-'), sources }, { sandbox: { template: 'mole-office-dev', container: row, folder: instance } })
    expect((await finish(vouched)).statusCode).toBe(200)
    const files = seals.readRunSeal(vouched)!.seal.files!.files
    expect(files.find((one) => one.path === 'runs/in.jsonl')?.origin?.couldWrite).toBe(true)
    expect(files.find((one) => one.path === 'runs/out.jsonl')?.origin?.couldWrite).toBe(false)

    // A FOLDER THE LEDGER DOES NOT VOUCH FOR is no folder: a container named for another instance.
    const forged = aRun({ stagedAt, root: aFolder('origin-root-'), sources }, { sandbox: { template: 'mole-office-dev', container: aContainerRow(instance, 'some-other-instance'), folder: instance } })
    expect((await finish(forged)).statusCode).toBe(200)
    expect(seals.readRunSeal(forged)!.seal.files!.files.map((one) => one.origin?.couldWrite)).toEqual([null, null])

    // NOR IS ONE WHOSE NAME MATCHES A REAL CONTAINER BUT WHICH THE LEDGER'S OWN WORDS DO NOT NAME: a folder of
    // the same name somewhere else, pointed at the real instance's row.
    const elsewhere = join(aFolder('origin-elsewhere-'), instance.split('/').at(-1)!)
    mkdirSync(elsewhere)
    const lookalike = aRun({ stagedAt, root: aFolder('origin-root-'), sources }, { sandbox: { template: 'mole-office-dev', container: row, folder: elsewhere } })
    expect((await finish(lookalike)).statusCode).toBe(200)
    expect(seals.readRunSeal(lookalike)!.seal.files!.files.map((one) => one.origin?.couldWrite)).toEqual([null, null])
  })
})

describe("a run's sandbox", () => {
  const sandbox = (folder: string) => ({ template: 'mole-office-dev', container: 'a-row', folder })

  it('is never written by the run itself, on either door', async () => {
    const id = aRun({ stagedAt: aFolder('origin-staged-', { 'runs/a.jsonl': RECORDING }), root: aFolder('origin-root-') })
    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: agentHeaders('origin-worker', id), payload: { dataPatch: { sandbox: sandbox('/anywhere') } } })
    expect(patched.statusCode, patched.body).toBe(403)
    expect(patched.body).toContain('A run does not name its own sandbox')
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asWorker, payload: { kind: 'session', title: 'A run naming its own sandbox', data: { state: 'running', servingAgent: 'origin-worker', sandbox: sandbox('/anywhere') } } })
    expect(filed.statusCode, filed.body).toBe(403)
    expect(filed.body).toContain('A run does not name its own sandbox')
  })

  it('is written once by its starter, and after that changed by the person only', async () => {
    const id = aRun({ stagedAt: aFolder('origin-staged-', { 'runs/a.jsonl': RECORDING }), root: aFolder('origin-root-') })
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asStarter, payload: { dataPatch: { sandbox: sandbox('/the/first') } } })
    expect(first.statusCode, first.body).toBe(200)
    const again = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asStarter, payload: { dataPatch: { sandbox: sandbox('/the/second') } } })
    expect(again.statusCode, again.body).toBe(403)
    expect(again.body).toContain("A run's sandbox is written once")
    const same = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asStarter, payload: { dataPatch: { sandbox: sandbox('/the/first') } } })
    expect(same.statusCode, same.body).toBe(200)
    const person = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asPerson, payload: { dataPatch: { sandbox: sandbox('/the/person') } } })
    expect(person.statusCode, person.body).toBe(200)
  })
})

describe('a release of a files seal', () => {
  it('gives a line of its own for every path it was handed to judge, or is refused and writes nothing', async () => {
    const stagedAt = aFolder('origin-staged-', { 'runs/RECOVERY.md': '# note\n' })
    const id = aRun({ stagedAt, root: aFolder('origin-root-') })
    expect((await finish(id)).statusCode).toBe(200)
    const held = seals.readRunSeal(id)!
    const lib = await import('../src/server/lib/inspection.ts')
    const read = { sealId: held.id, sealHash: held.seal.hash, worktree: '/a/copy', ofItsOwn: true, says: 'Synthetic read of a verified copy.', staged: stagedAt, needsJudgment: [{ path: 'runs/RECOVERY.md', why: 'No content check exists for .md files.' }] }
    const traced = syntheticTrace(t, ['runs/RECOVERY.md'])
    const release = (judged: { path: string; concluded: string }[] | undefined) =>
      lib.releaseOrRefuse({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'origin-starter' }, how: 'its starter', inspector: null, actor: { type: 'agent', id: 'origin-starter' },
        check: { verdict: 'released', traced, check: 'Synthetic check of a verified copy.', missing: [], says: null, chaptersRead: [], read, ...(judged === undefined ? {} : { judged }) } })
    expect(() => release(undefined)).toThrow(/gives none for runs\/RECOVERY\.md/)
    expect(() => release([{ path: 'runs/RECOVERY.md', concluded: '   ' }])).toThrow(/gives none for runs\/RECOVERY\.md/)
    expect(t.api.getRecord(id)?.data['released']).toBeUndefined()
    release([{ path: 'runs/RECOVERY.md', concluded: 'It is the provenance note, and it says what landed.' }])
    const { howARunStands } = await import('../src/shared/releasing.ts')
    expect(howARunStands(t.api.getRecord(id)!.data).released?.judged).toEqual([{ path: 'runs/RECOVERY.md', concluded: 'It is the provenance note, and it says what landed.' }])
  })
})

// THE ONE READING OF A ROW'S WORDS (problem 1aDRTmegLfhy). MUTATION PROOF, 23 September 2026: the reading
// made a plain `includes` again, and the /x/b.c case goes red.
describe('the words a container row names its folder in', () => {
  it('name exactly that folder, and not one whose name is the start of another', () => {
    const says = (folder: string): string => `Sandbox b, from the template t; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`
    expect(theRowNamesTheFolder(says('/x/b'), '/x/b')).toBe(true)
    expect(theRowNamesTheFolder(`ends here; ${theWordsNamingTheFolder('/x/b')}`, '/x/b')).toBe(true)
    expect(theRowNamesTheFolder(says('/x/b.c'), '/x/b')).toBe(false)
    expect(theRowNamesTheFolder(says('/x/b'), '/x/bb')).toBe(false)
    expect(theRowNamesTheFolder(undefined, '/x/b')).toBe(false)
  })
})
