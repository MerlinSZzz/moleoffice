// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A LANDING THAT STALLED CAN BE ASKED AGAIN, WHEREVER MAIN STANDS. The secretary's decision 28Jy1SqzzZut as revised at 04:35 on
 * 26 September 2026, wave 13k rounds 3 and 3b. The tool's landing step is the compare-and-swap, so the door compares nothing.
 *
 * On 26 September 2026 at 03:06 the documents entry evSmBAPmYXu4 stalled in landing after three merge tool runs,
 * because every db:backup failed. Main had not moved. The entry held its lane for good: the withdraw door refuses a
 * landing entry, and the office had stopped asking for its tool. The door POST /api/merge-queue/<id>/land-again lets
 * the person or whoever holds the secretary card ask again, with a reason.
 *
 * WHAT IS PROVED, against the real app and a throwaway database, on a real git lane whose HEAD the office reads:
 *
 *   1. A stalled landing whose lane is still at the entry's `integration.mainAt`, asked again by the secretary: the
 *      count is cleared, `stalls.asked` says who asked, when and why, the newest revision is the secretary's, and
 *      the merge tool is wanted again. It can stall again and be asked again by the person.
 *   2. A stalled landing whose main moved is asked again all the same (the secretary's revision of 28Jy1SqzzZut, 04:35 on
 *      26 September): the office does not compare main itself. The reply says main moved and what the tool will do,
 *      and when the tool's landing step reports main-moved, the entry goes back to be integrated again.
 *   3. An agent without the secretary card is refused with 403; a landing not yet stalled and an entry in another
 *      state with 409; an empty reason with 400. Nothing is written by any of them.
 *   4. The notice of a stalled landing, on the entry and in the secretary's one line, names the exact request.
 *   5. THE WAY OUT OF THE LANE (round 17c). A landing that fails the same way while main stands still stalls again
 *      after every ask, as aKWEE_-0OCN2 did on 10 October 2026, and a landing entry cannot be withdrawn. Asked with
 *      "integrateAgain":true while main is still at `integration.mainAt`, the entry goes back to judged, lets its lane
 *      go, keeps who asked and why, and can be withdrawn. With main anywhere else that ask is refused with 409 and
 *      nothing is written, because main may hold the entry's final commit and only the tool's landing step can tell.
 *
 * Every fixture here is synthetic and says so: the git repositories are made under `.logs/` in this checkout and
 * removed after, and the records are filed as fixtures. Nothing reaches the live server, and no process is started
 * but git, by the test itself and by the office's own git reader.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

import { gateNamed } from '../src/config/gates.mjs'
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_WORKER = 'mole-office/the-message-worker'
const WORKSPACE = 'default'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asSecretary = as('agent', 'again-secretary')
const asWorker = as('agent', 'again-worker')
const asInspector = as('agent', 'again-inspector')
const asTheOffice = as('agent', THE_WORKER)

let t: TestDb
let app: FastifyInstance
let base: string
let main: string
let repository: string
let queue: typeof import('../src/server/lib/merge-queue.ts')
let names = 0

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const SYNTHETIC_AUTHOR = { GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
const commit = (dir: string, message: string): void => {
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', message], { stdio: 'ignore', env: { ...process.env, ...SYNTHETIC_AUTHOR } })
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
const askAgain = (id: string, by: Record<string, string>, because: unknown = 'Synthetic: the backup is mended, and main has not moved.') =>
  call('POST', `/api/merge-queue/${id}/land-again`, by, { because })
const sendBack = (id: string, by: Record<string, string>, because = 'Synthetic: the landing fails the same way each time; integrate it again.') =>
  call('POST', `/api/merge-queue/${id}/land-again`, by, { because, integrateAgain: true })

/** A worker's clone of main with one commit on `work`, sealed as a finished run, submitted, and released by the inspector. */
async function aReleasedEntry(): Promise<{ id: string; run: string; commit: string; content: Record<string, string> }> {
  names += 1
  const name = `entry-${String(names)}`
  const dir = join(base, name)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', `${name}.txt`), `Synthetic change ${name}.\n`)
  git(dir, 'add', '-A')
  commit(dir, `Synthetic submission ${name}`)
  const run = t.api.createRecord({
    kind: 'session',
    title: `Synthetic run ${name}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'again-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'again-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  expect((await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })).status).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: name } })
  expect(submitted.status, submitted.raw).toBe(201)
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string; hash: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: realpathSync(dir), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
  return { id: String(submitted.body['entry'].id), run, commit: seal.git.commit, content: Object.fromEntries(seal.git.files.map((one) => [one.path, one.hash])) }
}

/** Take a released entry to landing on main as it stands now, through the step door as the merge tool would. */
async function aLandingEntry(): Promise<{ id: string; run: string; mainAt: string }> {
  const one = await aReleasedEntry()
  const mainAt = git(main, 'rev-parse', 'HEAD')
  expect((await step(one.id, 'pinned', { files: one.content })).body['entry'].state).toBe('judged')
  expect((await step(one.id, 'integrating', {})).body['entry'].state).toBe('integrating')
  expect((await step(one.id, 'integrated', { result: one.commit, mainAt, files: one.content })).body['entry'].state).toBe('testing')
  expect((await step(one.id, 'tested', { green: true, log: '/synthetic/suite.log', ran: 1, passed: 1 })).status).toBe(200)
  const landing = await step(one.id, 'landing', { mainAt })
  expect(landing.status, landing.raw).toBe(200)
  expect(landing.body['entry'].state).toBe('landing')
  return { id: one.id, run: one.run, mainAt }
}

/** One merge tool run through the tool doors that ends without moving the entry, as the worker records it. */
async function aRunThatEnds(id: string, reason: string): Promise<Record<string, any>> {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const started = await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })
  expect(started.status, started.raw).toBe(200)
  const ended = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason })
  expect(ended.status, ended.raw).toBe(200)
  // AND THE RUN'S SESSION ENDS, as the worker's next pass ends it (closeAMergeToolRun). While a run of the tool still
  // says running, the office offers its entry to no second run (problem JdaAnCvmgy-P).
  t.api.patchRecord(session, { dataPatch: { state: 'crashed' } }, { type: 'agent', id: THE_WORKER })
  return ended.body['entry']
}

/** Stall a landing entry: MAX_TOOL_RUNS_IN_ONE_PLACE runs end without landing it. Answers the entry after the last. */
async function stall(id: string): Promise<Record<string, any>> {
  let entry: Record<string, any> = {}
  for (let run = 1; run <= MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) entry = await aRunThatEnds(id, `Synthetic: npm run db:backup exited 1, run ${String(run)}; main was not moved.`)
  expect(entry['state']).toBe('landing')
  expect(entry['machine'].stalls).toMatchObject({ runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
  expect(entry['toolWanted']).toBeNull()
  return entry
}

const stored = (id: string): string => JSON.stringify(t.api.getRecord(id)!.data)
const revisionsOf = (id: string): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
const newestRevision = (id: string) => t.client.sqlite.prepare('SELECT actor_type AS type, actor_id AS actor, data FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { type: string; actor: string; data: string }
const wanted = (): string[] => queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)

/** The one line the secretary was sent about this run's entry, newest first. */
function linesToTheSecretary(run: string): string[] {
  const rows = t.client.sqlite.prepare("SELECT title FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid DESC").all(run) as { title: string }[]
  return rows.map((row) => row.title).filter((title) => title.startsWith('landing stalled '))
}

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'land-again-')))
  app = (await apiApp()).app
  queue = await import('../src/server/lib/merge-queue.ts')
  for (const [handle, role, payload] of [
    ['again-secretary', 'secretary', {}],
    ['again-inspector', 'inspector', {}],
    ['again-worker', undefined, { workArea: ['src'] }],
  ] as const) {
    const r = await call('POST', '/api/agents/started', asPerson, { handle, name: `Synthetic ${handle}`, ...(role === undefined ? {} : { role }), ...payload })
    expect(r.status, r.raw).toBe(201)
  }
  main = join(base, 'main')
  mkdirSync(join(main, 'src'), { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'src', 'a.txt'), 'Synthetic baseline.\n')
  git(main, 'add', '-A')
  commit(main, 'Synthetic baseline')
  main = realpathSync(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-land-again', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
}, 60_000)

/** FREE THE LANE AFTER EACH CASE. A landing entry cannot be withdrawn, so main moving sends it back to judged first. */
afterEach(async () => {
  const holder = queue.whoOccupies(main)
  if (holder === null) return
  if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
  await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over; the lane is freed for the next one.' })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (base !== undefined) rmSync(base, { recursive: true, force: true })
})

describe('asking the office to try a stalled landing again', () => {
  it('clears the count and asks for the tool again when main is still where the entry lands, and says who asked and why', async () => {
    const one = await aLandingEntry()
    await stall(one.id)
    expect(wanted()).not.toContain(one.id)

    const asked = await askAgain(one.id, asSecretary)
    expect(asked.status, asked.raw).toBe(200)
    const entry = asked.body['entry']
    expect(entry.state).toBe('landing')
    expect(entry.occupies).toBe(main)
    expect(entry.toolWanted).toEqual({ since: expect.any(String) })
    expect(entry.machine.stalls).toMatchObject({
      runs: 0,
      asked: { by: { kind: 'agent', id: expect.any(String) }, at: expect.any(String), because: 'Synthetic: the backup is mended, and main has not moved.', mainAt: one.mainAt },
    })
    expect(entry.machine.stalls.says).toContain('The agent again-secretary asked the office')
    expect(entry.machine.stalls.says).toContain(`is still at ${one.mainAt}`)
    expect(asked.body['says']).toBe(entry.machine.stalls.says)
    // THE REVISION SAYS IT: the newest version of the entry is the secretary's, and holds the reason.
    const newest = newestRevision(one.id)
    expect(newest).toMatchObject({ type: 'agent', actor: 'again-secretary' })
    expect(newest.data).toContain('Synthetic: the backup is mended, and main has not moved.')
    expect(wanted()).toContain(one.id)

    // AS A FRESH ARRIVAL: it can stall again, and the person can ask again.
    await stall(one.id)
    const byThePerson = await askAgain(one.id, asPerson, 'Synthetic: I looked, and main holds none of it')
    expect(byThePerson.status, byThePerson.raw).toBe(200)
    expect(byThePerson.body['entry'].machine.stalls).toMatchObject({ runs: 0, asked: { by: { kind: 'person' }, because: 'Synthetic: I looked, and main holds none of it' } })
    expect(byThePerson.body['says']).toContain('Synthetic: I looked, and main holds none of it. Main in')
  }, 60_000)

  it('asks for the tool again when main has moved too, and the tool finding main moved sends the entry back to be integrated', async () => {
    const one = await aLandingEntry()
    await stall(one.id)
    commit(main, 'Synthetic: somebody else moved main')
    const now = git(main, 'rev-parse', 'HEAD')
    const asked = await askAgain(one.id, asSecretary, 'Synthetic: the backup is mended; main was moved by hand meanwhile.')
    expect(asked.status, asked.raw).toBe(200)
    const entry = asked.body['entry']
    expect(entry.state).toBe('landing')
    expect(entry.toolWanted).toEqual({ since: expect.any(String) })
    expect(entry.machine.stalls).toMatchObject({ runs: 0, asked: { by: { kind: 'agent', id: expect.any(String) }, mainAt: now } })
    // THE REPLY SAYS WHAT THE TOOL WILL DO, not what the office decided about main: the tool's landing step compares.
    expect(asked.body['says']).toContain(`Main in ${main} is at ${now}, not at ${one.mainAt}, where the entry was integrated`)
    expect(asked.body['says']).toContain('sends the entry back to be integrated again')
    // "IS AT", NOT "HOLDS": landGit finishes only when main is exactly the final commit; a main past it is main-moved.
    expect(asked.body['says']).toContain("finishes the landing if main is already at the entry's final commit")
    expect(wanted()).toContain(one.id)

    // THE TOOL'S LANDING STEP, played here as the round-3 tests play the tool: resuming, it finds main neither M nor the
    // entry's final commit, and reports main-moved (landGit in tools/merge-tool/land.mjs). The office sends it back.
    const moved = await step(one.id, 'main-moved', { mainAt: now })
    expect(moved.status, moved.raw).toBe(200)
    expect(moved.body['entry'].state).toBe('judged')
    expect(moved.body['entry'].occupies).toBeNull()
  }, 60_000)

  it('refuses a caller without the secretary card, an entry not stalled, one in another state and an empty reason, writing nothing', async () => {
    const one = await aLandingEntry()
    await aRunThatEnds(one.id, 'Synthetic: the backup failed once.')
    const notYet = stored(one.id)
    const once = await askAgain(one.id, asSecretary)
    expect(once.status, once.raw).toBe(409)
    expect(once.body['error']).toContain(`is landing, and 1 of ${String(MAX_TOOL_RUNS_IN_ONE_PLACE)} merge tool runs have ended without landing it`)
    expect(stored(one.id)).toBe(notYet)

    await aRunThatEnds(one.id, 'Synthetic: the backup failed twice.')
    await aRunThatEnds(one.id, 'Synthetic: the backup failed three times.')
    const stalled = stored(one.id)
    const revisions = revisionsOf(one.id)
    const byAWorker = await askAgain(one.id, asWorker)
    expect(byAWorker.status, byAWorker.raw).toBe(403)
    expect(byAWorker.body['error']).toContain('Only whoever holds the secretary card, or the person')
    for (const because of ['', '   ']) {
      const empty = await askAgain(one.id, asSecretary, because)
      expect(empty.status, empty.raw).toBe(400)
    }
    expect(stored(one.id)).toBe(stalled)
    expect(revisionsOf(one.id)).toBe(revisions)

    const judged = await aReleasedEntry()
    expect((await step(judged.id, 'pinned', { files: judged.content })).body['entry'].state).toBe('judged')
    const wrongState = await askAgain(judged.id, asSecretary)
    expect(wrongState.status, wrongState.raw).toBe(409)
    expect(wrongState.body['error']).toContain('is judged, not landing')
  }, 60_000)

  it('names the exact request in the notice on the entry and in the secretary\'s one line', async () => {
    const one = await aLandingEntry()
    const entry = await stall(one.id)
    const request = `POST /api/merge-queue/${one.id}/land-again with the body {"because":"<one sentence>"}`
    expect(entry['machine'].stalls.says).toContain(request)
    const lines = linesToTheSecretary(one.run)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(new RegExp(`→ a person must look, then ${request.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u'))
  }, 60_000)

  it('sends a stalled landing back to be integrated when asked to, while main is still where it was integrated, and it can then be withdrawn', async () => {
    const one = await aLandingEntry()
    await stall(one.id)
    expect(t.api.getRecord(one.id)!.data).toHaveProperty('tested')
    const sent = await sendBack(one.id, asSecretary)
    expect(sent.status, sent.raw).toBe(200)
    const entry = sent.body['entry']
    expect(entry.state).toBe('judged')
    expect(entry.occupies).toBeNull()
    // THE TEST RUN IS TAKEN OFF, as a main-moved step takes it: it was of a tree that will not land.
    expect(t.api.getRecord(one.id)!.data).not.toHaveProperty('tested')
    expect(entry.machine.stalls).toMatchObject({
      runs: 0,
      asked: { by: { kind: 'agent', id: expect.any(String) }, because: 'Synthetic: the landing fails the same way each time; integrate it again.', mainAt: one.mainAt },
    })
    expect(sent.body['says']).toContain('asked the office at')
    expect(sent.body['says']).toContain(`is still at ${one.mainAt}, where the entry was integrated, so main holds none of it`)
    expect(sent.body['says']).toBe(entry.machine.stalls.says)
    expect(newestRevision(one.id)).toMatchObject({ type: 'agent', actor: 'again-secretary' })
    expect(queue.whoOccupies(main)).toBeNull()

    // OUT OF THE QUEUE WITHOUT A PERSON EDITING ANYTHING: judged may be withdrawn, and landing may not.
    const withdrawn = await call('POST', `/api/merge-queue/${one.id}/withdraw`, asPerson, { because: 'Synthetic: it is to be submitted again on the new main.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body['entry'].state).toBe('withdrawn')
  }, 60_000)

  it('refuses to send a stalled landing back when main has moved, writing nothing, and the ask without the flag still works', async () => {
    const one = await aLandingEntry()
    await stall(one.id)
    commit(main, 'Synthetic: somebody else moved main before the entry was sent back')
    const now = git(main, 'rev-parse', 'HEAD')
    const before = stored(one.id)
    const revisions = revisionsOf(one.id)
    const refused = await sendBack(one.id, asPerson)
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['error']).toContain(`Main in ${main} is at ${now}, not at ${one.mainAt}`)
    expect(refused.body['error']).toContain('Ask again without "integrateAgain"')
    expect(stored(one.id)).toBe(before)
    expect(revisionsOf(one.id)).toBe(revisions)

    const asked = await askAgain(one.id, asPerson, 'Synthetic: then the landing step decides.')
    expect(asked.status, asked.raw).toBe(200)
    expect(asked.body['entry'].state).toBe('landing')
  }, 60_000)

  it('sends back only a stalled landing, and only for the secretary card or the person', async () => {
    const one = await aLandingEntry()
    await aRunThatEnds(one.id, 'Synthetic: the migration failed once.')
    const notYet = stored(one.id)
    const once = await sendBack(one.id, asPerson)
    expect(once.status, once.raw).toBe(409)
    expect(stored(one.id)).toBe(notYet)
    await aRunThatEnds(one.id, 'Synthetic: the migration failed twice.')
    await aRunThatEnds(one.id, 'Synthetic: the migration failed three times.')
    const stalled = stored(one.id)
    const byAWorker = await sendBack(one.id, asWorker)
    expect(byAWorker.status, byAWorker.raw).toBe(403)
    const notABoolean = await call('POST', `/api/merge-queue/${one.id}/land-again`, asPerson, { because: 'Synthetic.', integrateAgain: 'yes' })
    expect(notABoolean.status, notABoolean.raw).toBe(400)
    expect(stored(one.id)).toBe(stalled)
  }, 60_000)

  it('says how to send it back in the notice on a stalled landing', async () => {
    const one = await aLandingEntry()
    const entry = await stall(one.id)
    expect(entry['machine'].stalls.says).toContain('Adding "integrateAgain":true to that body sends it back to be integrated again at once')
  }, 60_000)
})
