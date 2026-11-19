// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MERGE ENTRY FOLLOWS THE PROJECT'S REVIEW LEVEL. Below Full the office starts no inspector, so a merge entry of an
 * unreleased sealed run is judged on the level instead of waiting for a release that nothing will write.
 *
 * WHAT THIS FILE PROVES:
 *   1. NONE COVERS. At None, the pin judges the entry. Its verdict names the level and says no inspector read the run,
 *      and the queue's own steps take it to testing and then to merged. What the landing says it rested on is the level,
 *      not a release.
 *   2. FULL STILL WAITS. At Full, the entry stays pinned with no verdict. What it waits on names the inspector's release
 *      and, since no inspector was asked to check the run, the door that asks for that check.
 *   3. LIGHT WAITS FOR THE SECRETARY. At Light, the entry stays pinned and what it waits on names the secretary's
 *      confirmation and its door. The secretary's confirmation judges it, and the verdict names who confirmed and when.
 *   4. A REFUSAL STILL REFUSES. At None, a refusal nobody reworked bounces the entry as refused.
 *   5. BACK TO FULL. A run sealed at None, whose project is back at Full when the entry is pinned, waits for an
 *      inspector's release, and what it waits on names the door that asks for the check its seal never asked for.
 *      That door, pressed by the person, asks the inspector, and not the secretary as the seal at None did.
 *   6. NO CHECK AGAIN AT NONE. An entry judged at None that comes out of the integrate step with a changed path goes to
 *      testing. No check-again run is filed, and the words name the level, the path and that no inspector read it.
 *   7. NO CHECK AGAIN AT LIGHT. The same, for an entry the secretary's confirmation judged at Light.
 *
 * MUTATIONS, each after a green control run and each restored, in src/server/lib/merge-state-machine.ts unless named:
 *   a. The None branch of `theVerdictOnThePinnedContent` never covers. Cases 1 and 6 fail.
 *   b. The Light branch covers without a confirmation. Case 3 fails.
 *   c. The confirm door (src/server/api/inspection.ts) does not call `theMergeQueueHearsAVerdict`. Cases 3 and 7 fail.
 *   d. `noInspectorWasAskedToCheck` (src/server/lib/merge-queue.ts) always answers null. Cases 2 and 5 fail.
 *   g. `askForTheCheckAgain` (src/server/lib/inspection.ts) keeps the check the seal asked for. Case 5 fails.
 *   e. `whatTheVerdictCovered` says a release covered every verdict that is not a take-back or a secretary's. Case 1 fails.
 *   f. The integrated step reads the level as Full always. Cases 6 and 7 fail.
 *
 * Every fixture here is synthetic and says so. The lane's repository and the runs' trees are git trees made under the
 * temporary directory and removed after; the records are filed as fixtures; nothing reaches the live server. The merge
 * tool's steps are pressed at the step door as the office's message worker presses them, and the refusal is written by
 * the helper that writes a verdict as its door would.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { apiApp, freshDb, thePersonsKeyHeader, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { ABSENT, MERGE_STATE_SPECS } from '../src/shared/merge-queue.ts'
import { howARunStands } from '../src/shared/releasing.ts'
import { REVIEW_LEVEL_WORDS } from '../src/shared/workspaces.ts'

const A = 'work/a.txt'
const LOG = '/synthetic/suite.log'
const REPOSITORY = 'follows-the-review-level'
const STARTER = 'review-level-starter'
const SECRETARY = 'review-level-secretary'
const WORKER = 'review-level-worker'
const INSPECTOR = 'review-level-inspector'
type Level = keyof typeof REVIEW_LEVEL_WORDS

describe('a merge entry follows the review level', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let mainAt: string
  let theOffice: string
  const made: string[] = []
  const ids: Record<string, string> = {}
  const keys: Record<string, string> = {}
  let asPerson: Record<string, string>
  const asTheOffice = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
  const asAgent = (handle: string): Record<string, string> => ({
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keys[handle] === undefined ? {} : { 'x-mole-office-key': keys[handle] }),
  })
  async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, HOME: dir } }).trim() }
  function scratch(prefix: string) {
    const dir = mkdtempSync(join(tmpdir(), `follows-the-review-level-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic review-level fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await call('POST', '/api/agents/started', headers, { handle, name: `Synthetic ${handle}`, ...payload })
    expect(r.status, r.raw).toBe(201)
    ids[handle] = String(r.body['agent'].id)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }
  /** Set this project's review level as the person sets it. */
  async function setLevel(level: Level) {
    const r = await call('PATCH', '/api/workspaces/default', asPerson, { reviewLevel: level })
    expect(r.status, r.raw).toBe(200)
  }
  /** The check-again runs the office filed for a merge entry. */
  const checksAgainFor = (entryId: string) =>
    t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.extra.purpose') = 'reinspection' AND json_extract(data, '$.extra.mergeEntry') = ?").all(entryId)

  interface Seal { id: string; hash: string; commit: string; files: { path: string; hash: string | null }[] }
  interface Sealed { run: string; dir: string; seal: Seal; id: string }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
  /**
   * A SEALED RUN OF THE WORKER, SUBMITTED BY THE PERSON: a clone of the lane's repository whose `work` branch adds a
   * file of its own under work/, filed as a running run with the report the queue reads at the pin, sealed by the
   * worker at the record door, and submitted to the merge queue. Nobody released it.
   */
  async function aSubmittedRun(): Promise<Sealed> {
    const dir = scratch('tree')
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, 'work', `${basename(dir)}.txt`), 'Synthetic work sealed at the end of a round\n'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work sealed at the end of a round')
    const run = t.api.createRecord({ kind: 'session', title: 'Synthetic round of the review-level worker', workspaceId: 'default', actor: { type: 'agent', id: WORKER }, origin: 'fixture', data: { state: 'running', servingAgent: WORKER, servingAgentId: ids[WORKER], workingDirectory: dir, cutFrom: 'main' } }).id
    theRunReportsForTheQueue(t, run, { type: 'agent', id: WORKER })
    const sealed = await call('PATCH', `/api/records/${run}`, asAgent(WORKER), { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
    expect(sealed.status, sealed.raw).toBe(200)
    const sealId = stored(run)['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: Seal['files'] } }
    const queued = await call('POST', '/api/merge-queue', asPerson, { run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { run, dir, seal: { id: sealId, hash: seal.hash, commit: seal.git.commit, files: seal.git.files }, id: String(queued.body.entry.id) }
  }
  const pin = (one: Sealed) => step(one.id, 'pinned', { files: contentOf(one.seal) })
  const confirm = (one: Sealed) => call('POST', `/api/checks/${one.run}/confirm`, asAgent(SECRETARY), { because: 'Synthetic: the secretary confirms a fixture run.' })
  /** The address of the door that asks for a run's check again. */
  const askAgainOf = (run: string) => `POST /api/checks/${run}/ask-again`
  /**
   * THE INTEGRATE STEP ON A MOVED MAIN THAT CHANGED THE RUN'S OWN FILE: a clone of the run's tree where main moved, the
   * work put on top of it, and the work's file changed by that, as the existing check-again cases make it.
   */
  function integratedOnAMovedMain(one: Sealed): { facts: Record<string, unknown>; changed: string } {
    const changed = one.seal.files[0]!.path
    const clone = scratch('clone')
    execFileSync('git', ['clone', '-q', one.dir, clone]); asTheFixture(clone)
    git(clone, 'checkout', '-q', 'main')
    writeFileSync(join(clone, 'work', 'moved.txt'), 'Synthetic: main moved on.\n'); git(clone, 'add', '.'); git(clone, 'commit', '-q', '-m', 'Synthetic: main moved')
    git(clone, 'checkout', '-q', 'work')
    git(clone, 'rebase', '-q', 'main')
    writeFileSync(join(clone, changed), 'Synthetic work sealed at the end of a round\nSynthetic: merged with main.\n'); git(clone, 'add', '.'); git(clone, 'commit', '-q', '--amend', '--no-edit')
    const files = Object.fromEntries(one.seal.files.map((file) => [file.path, createHash('sha256').update(execFileSync('git', ['-C', clone, 'cat-file', 'blob', `HEAD:${file.path}`])).digest('hex')]))
    expect(files[changed], 'the integrate step changes the run\'s own file').not.toBe(contentOf(one.seal)[changed])
    return { facts: { result: git(clone, 'rev-parse', 'HEAD'), mainAt: git(clone, 'rev-parse', 'main'), clone, files }, changed }
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() }
    theOffice = String((await import('../src/server/lib/inspection.ts')).THE_OFFICE.id)
    root = scratch('main')
    git(root, 'init', '-q', '-b', 'main'); asTheFixture(root)
    mkdirSync(join(root, 'work')); writeFileSync(join(root, A), 'before\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic baseline')
    mainAt = git(root, 'rev-parse', 'HEAD')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } })
    await register(STARTER, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(SECRETARY, asPerson, { role: 'secretary' })
    await register(WORKER, asAgent(STARTER), { workArea: ['work'] })
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE, AND EVERY CASE STARTS AT FULL.
  afterEach(async () => {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder !== null && holder !== undefined) {
      if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
      await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
    }
    await setLevel('full')
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('1. at None, the pin judges the entry on the level, and the queue tests it and lands it', async () => {
    await setLevel('none')
    const one = await aSubmittedRun()
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('judged')
    const verdict = pinned.body.entry.machine.verdict as { run: string; by: { kind: string; id: string }; how: string }
    expect(verdict).toMatchObject({ run: one.run, by: { kind: 'agent', id: theOffice } })
    expect(verdict.how).toContain(REVIEW_LEVEL_WORDS.none)
    expect(verdict.how).toMatch(/\bno inspector\b/u)
    expect(howARunStands(stored(one.run)).released).toBeNull()

    const integrating = await step(one.id, 'integrating', {})
    expect(integrating.status, integrating.raw).toBe(200)
    expect(integrating.body.entry.state).toBe('integrating')
    const integrated = await step(one.id, 'integrated', { result: one.seal.commit, mainAt, files: contentOf(one.seal) })
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body.entry.state).toBe('testing')

    for (const [name, facts] of [['tested', { green: true, log: LOG, ran: 1, passed: 1 }], ['landing', { mainAt }], ['landed', { mainAfter: one.seal.commit }]] as const) {
      const r = await step(one.id, name, facts)
      expect(r.status, `${name}: ${r.raw}`).toBe(200)
    }
    const merged = await entry(one.id)
    expect(merged.state).toBe('merged')
    // WHAT THE LANDING SAYS IT RESTED ON is the level's verdict, which no release wrote.
    expect(merged.machine.integrated.carriedVerdict).toMatchObject({ run: one.run, how: verdict.how })
    expect(String(merged.machine.integrated.carriedVerdict.says)).toContain(verdict.how)
  })

  it('2. at Full, the entry waits for an inspector\'s release, and names the door that asks for the check', async () => {
    const one = await aSubmittedRun()
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('pinned')
    expect(pinned.body.entry.machine.verdict ?? null).toBeNull()
    expect(String(pinned.body.decided)).toContain(askAgainOf(one.run))
    const read = await entry(one.id)
    expect(read.waitsOn).toContain(MERGE_STATE_SPECS.pinned.waitsOn)
    expect(read.waitsOn).toContain(askAgainOf(one.run))
  })

  it('3. at Light, the entry waits for the secretary\'s confirmation, and the confirmation judges it', async () => {
    await setLevel('light')
    const one = await aSubmittedRun()
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('pinned')
    expect(pinned.body.entry.machine.verdict ?? null).toBeNull()
    const waiting = await entry(one.id)
    expect(waiting.waitsOn).toContain(`POST /api/checks/${one.run}/confirm`)
    expect(waiting.waitsOn).toContain(REVIEW_LEVEL_WORDS.light)

    const confirmed = await confirm(one)
    expect(confirmed.status, confirmed.raw).toBe(201)
    expect(confirmed.body['mergeQueue']?.moved).toEqual([{ entry: one.id, state: 'judged', says: expect.any(String) }])
    const judged = await entry(one.id)
    expect(judged.state).toBe('judged')
    const at = howARunStands(stored(one.run)).confirmed!.at
    const how = String(judged.machine.verdict.how)
    expect(how).toContain(REVIEW_LEVEL_WORDS.light)
    expect(how).toContain(ids[SECRETARY]!)
    expect(how).toContain(at)
  })

  it('4. at None, a refusal nobody reworked still bounces the entry as refused', async () => {
    await setLevel('none')
    const one = await aSubmittedRun()
    writeAVerdictAsItsDoorWould(t, one.run, { refused: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-11-12 12:00:00', missing: ['Synthetic: a made-up missing thing.'] } })
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('bounced')
    expect(pinned.body.entry.machine.bounced).toMatchObject({ reason: 'refused' })
  })

  it('5. a run sealed at None, pinned when the project is back at Full, waits for a release and names the door that asks for the check', async () => {
    await setLevel('none')
    const one = await aSubmittedRun()
    await setLevel('full')
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('pinned')
    expect(pinned.body.entry.machine.verdict ?? null).toBeNull()
    const read = await entry(one.id)
    expect(read.waitsOn).toContain(MERGE_STATE_SPECS.pinned.waitsOn)
    expect(read.waitsOn).toContain(askAgainOf(one.run))
    // THE DOOR IT NAMES ASKS AN INSPECTOR. The person appoints one here, the only case that needs one, so the seals of
    // the cases before this one asked nobody.
    await register(INSPECTOR, asPerson, { role: 'inspector' })
    const asked = await call('POST', `/api/checks/${one.run}/ask-again`, asPerson)
    expect(asked.status, asked.raw).toBe(200)
    expect(asked.body.theCheck.askedOf, asked.raw).toBe(INSPECTOR)
    expect(asked.body.theCheck.reviewLevel, asked.raw).toBeUndefined()
  })

  /** Integrate a judged entry on a moved main that changed its file, and read what the step decided. */
  async function integrateWithAChange(one: Sealed, level: Level) {
    const integrating = await step(one.id, 'integrating', {})
    expect(integrating.status, integrating.raw).toBe(200)
    const { facts, changed } = integratedOnAMovedMain(one)
    const integrated = await step(one.id, 'integrated', facts)
    expect(integrated.status, integrated.raw).toBe(200)
    expect(integrated.body.entry.state).toBe('testing')
    expect(integrated.body.entry.machine.reinspection ?? null).toBeNull()
    expect(checksAgainFor(one.id)).toEqual([])
    const decided = String(integrated.body.decided)
    expect(decided).toContain(REVIEW_LEVEL_WORDS[level])
    expect(decided).toContain(changed)
    expect(decided).toMatch(/\bno inspector\b/u)
  }

  it('6. at None, a path changed on top of main asks for no check again, and the entry is testing', async () => {
    await setLevel('none')
    const one = await aSubmittedRun()
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    expect(pinned.body.entry.state).toBe('judged')
    await integrateWithAChange(one, 'none')
  })

  it('7. at Light, a path changed on top of main asks for no check again, and the entry is testing', async () => {
    await setLevel('light')
    const one = await aSubmittedRun()
    const pinned = await pin(one)
    expect(pinned.status, pinned.raw).toBe(200)
    const confirmed = await confirm(one)
    expect(confirmed.status, confirmed.raw).toBe(201)
    expect((await entry(one.id)).state).toBe('judged')
    await integrateWithAChange(one, 'light')
  })
})
