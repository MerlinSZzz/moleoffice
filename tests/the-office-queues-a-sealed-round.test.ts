// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE OFFICE QUEUES A SEALED ROUND ITSELF, WAITS FOR THE LINE'S EARLIER ENTRY, AND HOLDS (wave 13u round 93, item 30
 * steps 1 to 4). Nothing of it is live: each of the three gates is off by default, and a line is off until the person or
 * a secretary with its own key turns it on in its agent record. With every gate off the office does what it did before.
 *
 * WHAT THIS FILE PROVES:
 *   1. QUEUED AT THE SEAL. With the gate 'queue-at-the-seal' on and the line on, a git seal is submitted by the office
 *      itself, as the office, and the run keeps a note naming the entry. The gate counts it. With the gate off, nothing
 *      is submitted, no note is written, and the gate counts it all the same. With the line off, nothing is submitted
 *      and nothing is counted. Only the person or a secretary with its own key turns a line on or off, always with a
 *      reason, and an ordinary write may not touch the line or the note.
 *   2. WAITS FOR THE LINE'S EARLIER ENTRY. With the gate 'queue-waits-for-the-line' on, a seal whose line has an earlier
 *      entry still under way is not submitted: its note says which entry it waits for, and the gate counts it. When
 *      that entry lands, the office submits the waiting seal. With the gate off, it is submitted at once.
 *   3. NOT QUEUED WHEN IT BOUNCES. When the entry a seal waits for bounces, the office submits nothing, and sends one
 *      message to the line's starter naming the bounced entry. Asking the office again changes nothing and sends no
 *      second message.
 *   4. THE HOLD. With the gate 'queue-held' on, set by a secretary with its own key, the queue says who held it, when
 *      and why. An entry already in its lane finishes. A judged entry does not take its lane: the step that would take
 *      it is refused, the merge tool is not handed it, and its reading says the queue is held. A seal made while held
 *      waits for the hold, and the gate counts both. Once the hold is lifted, the judged entry takes its lane and
 *      asking the office again submits the waiting seal.
 *   5. DONE ONCE. A seal that waits, and is then submitted by hand, is not submitted a second time when its earlier
 *      entry lands, nor when the office is asked again twice: its note names the hand-made entry.
 *
 * MUTATIONS, each after a green control run and each restored, in src/server/lib/merge-queue-at-the-seal.ts unless named:
 *   1. In `decideASealedRound`, read no line: `if (line === null) return null`. Case 1 fails: the seal of a line turned
 *      off gets a note. Asking only `line.repository` and not `line.on` leaves case 1 green, because a line turned off
 *      keeps no repository. Reading the gate's count and not its position fails cases 1, 2, 3 and 5.
 *   2. In `andTheWaitingSeals` (src/server/api/merge-queue.ts), decide no waiting seal when an entry ends. Cases 2, 3 and
 *      5 fail: nothing is submitted when the earlier entry lands, and nobody is told when it bounces.
 *   3. In `decideASealedRound`, take only a withdrawn entry as ended without landing. Case 3 fails: a bounce is not told.
 *   4. In the step to `integrating` (src/server/lib/merge-state-machine.ts), do not ask whether the queue is held. Case 4
 *      fails: the judged entry takes its lane while the queue is held.
 *   5. In `decideASealedRound`, do not read the entry already there for this seal. Case 5 fails: the office submits again
 *      and is refused, where the note should name the entry made by hand.
 *
 * Every fixture here is synthetic and says so. The lane's repository and the runs' trees are git trees made under the
 * temporary directory and removed after; the records are filed as fixtures; nothing reaches the live server. The merge
 * tool's steps are pressed at the step door as the office's message worker presses them, and a release is written by
 * the helper that writes a verdict as its door would.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { ABSENT } from '../src/shared/merge-queue.ts'

const A = 'work/a.txt'
const T = 'tests/synthetic-red.test.ts'
const LOG = '/synthetic/suite.log'
const REPOSITORY = 'queued-at-the-seal'
const STARTER = 'seal-line-starter'
const SECRETARY = 'seal-line-secretary'
const OTHER = 'seal-line-other'
const HAND = 'seal-line-by-hand'
const GATE_IDS = ['queue-at-the-seal', 'queue-waits-for-the-line', 'queue-held'] as const
type GateId = (typeof GATE_IDS)[number]
const modulePath = (relative: string): string => new URL(relative, import.meta.url).pathname

describe('the office queues a sealed round', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let mainAt: string
  let theOffice: string
  const made: string[] = []
  const ids: Record<string, string> = {}
  const keys: Record<string, string> = {}
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
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
    const dir = mkdtempSync(join(tmpdir(), `queued-at-the-seal-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic queued-at-the-seal fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })
  async function entry(id: string): Promise<Record<string, any>> {
    const read = await call('GET', `/api/merge-queue/${id}`, asPerson)
    expect(read.status, read.raw).toBe(200)
    return read.body.entry
  }
  /** The setting of a gate, read from the gates list, so nothing here pins a setting's name. */
  function settingOf(id: GateId): string {
    const gate = GATES.find((one) => one.id === id)
    expect(gate, `the gate ${id} is declared`).toBeDefined()
    return gate!.setting
  }
  /** Turn gates on or off through the settings door, as `headers`. Null removes the choice, which leaves the gate off. */
  async function setGates(chosen: Partial<Record<GateId, '1' | '0' | null>>, headers: Record<string, string> = asPerson, because = 'Synthetic: a case of the office queueing at the seal.') {
    const changes = Object.entries(chosen).map(([id, value]) => ({ name: settingOf(id as GateId), value }))
    const r = await call('POST', '/api/office/settings', headers, { changes, because })
    expect(r.status, r.raw).toBe(200)
  }
  /** How many times a gate was met, on every day. */
  const counted = (id: GateId) => (t.client.sqlite.prepare('SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = ?').get(id) as { n: number | null }).n ?? 0
  /** The merge entries of a run, oldest first. */
  const entriesOf = (run: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'merge_entry' AND json_extract(data, '$.run') = ? AND deleted_at IS NULL ORDER BY created_at, rowid").all(run) as { id: string }[]).map((row) => row.id)
  /** The messages about a run sent to an agent, oldest first. */
  const messagesAbout = (run: string, to: string) =>
    (t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? ORDER BY created_at, rowid").all(run) as { id: string; data: string }[])
      .map((row) => ({ id: row.id, data: JSON.parse(row.data) as { to?: { kind: string; id: string }[]; body?: string } }))
      .filter((one) => (one.data.to ?? []).some((who) => who.id === to))
  /** The agent record the registry binds an agent to. */
  const recordOfAgent = (handle: string) => (t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ? ORDER BY rowid LIMIT 1').get(ids[handle]) as { id: string }).id

  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await call('POST', '/api/agents/started', headers, { handle, name: `Synthetic ${handle}`, ...payload })
    expect(r.status, r.raw).toBe(201)
    ids[handle] = String(r.body['agent'].id)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }
  /** Turn a line on or off at its door. */
  const line = (agent: string, body: Record<string, unknown>, headers: Record<string, string> = asPerson) => call('POST', '/api/merge-queue/lines', headers, { agent, ...body })
  /** A LINE: an agent whose work is under work/, started by the starter, with its line turned on by the person. */
  async function aLine(handle: string): Promise<string> {
    await register(handle, asAgent(STARTER), { workArea: ['work'] })
    const on = await line(handle, { on: true, repository: REPOSITORY, because: 'Synthetic: this line is queued at the seal.' })
    expect(on.status, on.raw).toBe(200)
    return handle
  }
  const again = (run: string, headers: Record<string, string> = asPerson) => call('POST', '/api/merge-queue/at-the-seal/again', headers, { run })

  interface Seal { id: string; hash: string; commit: string; files: { path: string; hash: string | null }[] }
  interface Sealed { run: string; dir: string; seal: Seal }
  const contentOf = (seal: Seal) => Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
  /**
   * A SEALED RUN OF `handle`: a clone of the lane's repository whose `work` branch adds a file of its own under work/,
   * filed as a running run of the agent and sealed by the agent at the record door, as a round ends.
   */
  async function aSealedRun(handle: string): Promise<Sealed & { sealed: Record<string, any> }> {
    const dir = scratch('tree')
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, 'work', `${basename(dir)}.txt`), `Synthetic work of ${handle}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work sealed at the end of a round')
    const run = t.api.createRecord({ kind: 'session', title: `Synthetic round of ${handle}`, workspaceId: 'default', actor: { type: 'agent', id: handle }, origin: 'fixture', data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], workingDirectory: dir, cutFrom: 'main' } }).id
    const sealed = await call('PATCH', `/api/records/${run}`, asAgent(handle), { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
    expect(sealed.status, sealed.raw).toBe(200)
    const sealId = stored(run)['sealedTip'] as string
    const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; files: Seal['files'] } }
    return { run, dir, seal: { id: sealId, hash: seal.hash, commit: seal.git.commit, files: seal.git.files }, sealed: sealed.body }
  }
  function release(one: Sealed) {
    writeAVerdictAsItsDoorWould(t, one.run, { released: { by: { kind: 'agent', id: 'synthetic-inspector' }, at: '2026-10-25 17:00:00', how: 'an inspector', check: 'synthetic-check', read: { sealId: one.seal.id, sealHash: one.seal.hash, worktree: one.dir, tip: one.seal.commit, ofItsOwn: true, says: 'Synthetic check fixture.' } } })
  }
  /** A sealed run of `handle`, released and submitted by the person by hand. */
  async function aHandEntry(handle: string): Promise<Sealed & { id: string }> {
    const one = await aSealedRun(handle)
    release(one)
    const queued = await call('POST', '/api/merge-queue', asPerson, { run: one.run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(queued.status, queued.raw).toBe(201)
    return { ...one, id: String(queued.body.entry.id) }
  }
  async function walk(id: string, steps: readonly (readonly [string, Record<string, unknown>])[]) {
    for (const [name, facts] of steps) {
      const r = await step(id, name, facts)
      expect(r.status, `${name}: ${r.raw}`).toBe(200)
    }
  }
  const toJudged = (one: Sealed & { id: string }) => walk(one.id, [['pinned', { files: contentOf(one.seal) }]])
  const toTesting = (one: Sealed & { id: string }) => walk(one.id, [
    ['pinned', { files: contentOf(one.seal) }],
    ['integrating', {}],
    ['integrated', { result: one.seal.commit, mainAt, files: contentOf(one.seal) }],
  ])
  const toMerged = (one: Sealed & { id: string }) => walk(one.id, [
    ['tested', { green: true, log: LOG, ran: 1, passed: 1 }],
    ['landing', { mainAt }],
    ['landed', { mainAfter: one.seal.commit }],
  ])

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
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root, actor: { ...person, provedBy: 'the-person-key' } })
    await register(STARTER, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(SECRETARY, asPerson, { role: 'secretary' })
    await register(OTHER, asPerson, { role: 'worker' })
    await register(HAND, asAgent(STARTER), { workArea: ['work'] })
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE OR LEAVE A GATE ON FOR THE NEXT ONE.
  afterEach(async () => {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder !== null && holder !== undefined) {
      if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
      await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
    }
    const declared = GATE_IDS.flatMap((id) => GATES.filter((one) => one.id === id).map((one) => ({ name: one.setting, value: null })))
    if (declared.length > 0) await call('POST', '/api/office/settings', asPerson, { changes: declared, because: 'Synthetic: the case is over.' })
  })
  afterAll(async () => { await app?.close(); t?.close(); for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

  it('1. submits a seal itself when the gate and the line are on, not when either is off, and only the office writes either field', async () => {
    const lineOne = await aLine('seal-line-one')

    // THE GATE OFF, THE LINE ON: nothing is submitted, no note is written, and the gate counts it.
    const before = counted('queue-at-the-seal')
    const off = await aSealedRun(lineOne)
    expect(entriesOf(off.run)).toEqual([])
    expect(stored(off.run)['atTheSeal']?.['queued']).toBeUndefined()
    expect(counted('queue-at-the-seal')).toBe(before + 1)

    // THE GATE ON, THE LINE OFF: nothing is submitted, no note is written, and nothing is counted.
    await setGates({ 'queue-at-the-seal': '1' })
    const offLine = await line(lineOne, { on: false, because: 'Synthetic: this line is queued by hand again.' })
    expect(offLine.status, offLine.raw).toBe(200)
    const lineOff = await aSealedRun(lineOne)
    expect(entriesOf(lineOff.run)).toEqual([])
    expect(stored(lineOff.run)['atTheSeal']?.['queued']).toBeUndefined()
    expect(counted('queue-at-the-seal')).toBe(before + 1)

    // BOTH ON: the office submits the seal as itself, the run's note names the entry, and the gate counts it.
    const onAgain = await line(lineOne, { on: true, repository: REPOSITORY, because: 'Synthetic: this line is queued at the seal again.' }, asAgent(SECRETARY))
    expect(onAgain.status, onAgain.raw).toBe(200)
    const on = await aSealedRun(lineOne)
    const [queued, ...more] = entriesOf(on.run)
    expect(queued, 'the office submitted the seal').toBeDefined()
    expect(more).toEqual([])
    expect(counted('queue-at-the-seal')).toBe(before + 2)
    const read = await entry(queued!)
    expect(read.submittedBy).toEqual({ kind: 'agent', id: theOffice })
    expect(read.seal.id).toBe(on.seal.id)
    expect(read.changeset).toMatchObject({ adapter: 'git', commit: on.seal.commit })
    expect(stored(on.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'queued', commit: on.seal.commit, entry: queued, at: expect.any(String) })
    expect(on.sealed['queuedAtTheSeal']).toMatchObject({ outcome: 'queued', entry: queued })

    // THE LINE'S DOOR: only the person or a secretary with its own key, always with a reason, and the change is kept.
    expect((await line(lineOne, { on: false, because: 'Synthetic: a worker may not.' }, asAgent(OTHER))).status).toBe(403)
    expect((await line(lineOne, { on: false })).status).toBe(400)
    expect((await line(lineOne, { on: true, because: 'Synthetic: a line names the repository its entries go to.' })).status).toBe(400)
    expect((await line('seal-line-nobody', { on: true, repository: REPOSITORY, because: 'Synthetic: nobody bears this handle.' })).status).toBe(404)
    expect(stored(recordOfAgent(lineOne))['queuesAtTheSeal']).toMatchObject({
      on: true,
      repository: REPOSITORY,
      because: 'Synthetic: this line is queued at the seal again.',
      by: { kind: 'agent', id: ids[SECRETARY] },
      at: expect.any(String),
    })

    // AN ORDINARY WRITE MAY NOT TOUCH THE LINE OR THE NOTE.
    const fields = await import(/* @vite-ignore */ modulePath('../src/server/lib/merge-queue-fields-the-office-writes.ts')).catch(() => ({}))
    const theLinesRefusal = Reflect.get(fields, 'ONLY_THE_OFFICE_WRITES_QUEUES_AT_THE_SEAL') as string | undefined
    const theNotesRefusal = Reflect.get(fields, 'ONLY_THE_OFFICE_WRITES_AT_THE_SEAL') as string | undefined
    expect(theLinesRefusal).toBeDefined()
    expect(theNotesRefusal).toBeDefined()
    const lineWritten = await call('PATCH', `/api/records/${recordOfAgent(lineOne)}`, asPerson, { dataPatch: { queuesAtTheSeal: null } })
    expect(lineWritten.status, lineWritten.raw).toBe(403)
    expect(lineWritten.body['error']).toBe(theLinesRefusal)
    const noteWritten = await call('PATCH', `/api/records/${on.run}`, asPerson, { dataPatch: { atTheSeal: { queued: { outcome: 'queued', commit: on.seal.commit, entry: 'made-up', at: '2026-10-25 17:00:00' } } } })
    expect(noteWritten.status, noteWritten.raw).toBe(403)
    expect(noteWritten.body['error']).toBe(theNotesRefusal)
  })

  it('2. waits for the line\'s earlier entry and submits when it lands, or submits at once with the gate off', async () => {
    const lineTwo = await aLine('seal-line-two')
    // THE EARLIER ENTRY IS SUBMITTED BY HAND BEFORE THE GATES ARE ON, or the office would have queued its seal itself.
    const earlier = await aHandEntry(lineTwo)
    await setGates({ 'queue-at-the-seal': '1', 'queue-waits-for-the-line': '1' })

    const before = counted('queue-waits-for-the-line')
    const waiting = await aSealedRun(lineTwo)
    expect(entriesOf(waiting.run)).toEqual([])
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', for: 'an-earlier-entry', entry: earlier.id, commit: waiting.seal.commit })
    expect(counted('queue-waits-for-the-line')).toBe(before + 1)

    // THE EARLIER ENTRY LANDS, and the office submits the waiting seal.
    await toTesting(earlier)
    await toMerged(earlier)
    expect(stored(earlier.id)['state']).toBe('merged')
    const [queued, ...more] = entriesOf(waiting.run)
    expect(queued, 'the office submitted the waiting seal when the earlier entry landed').toBeDefined()
    expect(more).toEqual([])
    expect(stored(queued!)['submittedBy']).toEqual({ kind: 'agent', id: theOffice })
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'queued', entry: queued, commit: waiting.seal.commit })

    // THE GATE OFF: the next seal is submitted at once, although the entry just submitted is still under way.
    await setGates({ 'queue-waits-for-the-line': '0' })
    const atOnce = await aSealedRun(lineTwo)
    const [now] = entriesOf(atOnce.run)
    expect(now, 'the office submitted the seal at once').toBeDefined()
    expect(stored(atOnce.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'queued', entry: now })
    expect(counted('queue-waits-for-the-line')).toBe(before + 2)
  })

  it('3. submits nothing when the earlier entry bounces, and sends the starter one message naming it', async () => {
    const lineThree = await aLine('seal-line-three')
    // THE EARLIER ENTRY IS SUBMITTED BY HAND BEFORE THE GATES ARE ON, or the office would have queued its seal itself.
    const earlier = await aHandEntry(lineThree)
    await setGates({ 'queue-at-the-seal': '1', 'queue-waits-for-the-line': '1' })
    const waiting = await aSealedRun(lineThree)
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', entry: earlier.id })

    await toTesting(earlier)
    const red = await step(earlier.id, 'tested', { green: false, log: LOG, redTests: [T], ran: 2, passed: 1 })
    expect(red.status, red.raw).toBe(200)
    expect(stored(earlier.id)['state']).toBe('bounced')
    expect(entriesOf(waiting.run)).toEqual([])
    // THE STARTER IS TOLD AT EVERY SEAL THAT THE RUN WAS SEALED, so only the messages naming the bounced entry are counted.
    const naming = () => messagesAbout(waiting.run, ids[STARTER]!).filter((one) => (one.data.body ?? '').includes(earlier.id))
    const told = naming()
    expect(told.map((one) => one.id)).toHaveLength(1)
    const note = stored(waiting.run)['atTheSeal']?.['queued']
    expect(note).toMatchObject({ outcome: 'not-queued', entry: earlier.id, ended: 'bounced', told: told[0]!.id, commit: waiting.seal.commit })

    // ASKED AGAIN, the office answers the same and sends nothing more.
    const asked = await again(waiting.run)
    expect(asked.status, asked.raw).toBe(200)
    expect(asked.body['queuedAtTheSeal']).toEqual(note)
    expect(entriesOf(waiting.run)).toEqual([])
    expect(naming()).toHaveLength(1)
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toEqual(note)
  })

  it('sends the unqueued seal notice to the owner chosen while it waited', async () => {
    const agent = await aLine('synthetic-owner-queue-line')
    const earlier = await aHandEntry(agent)
    await setGates({ 'queue-at-the-seal': '1', 'queue-waits-for-the-line': '1' })
    const waiting = await aSealedRun(agent)
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (columns.some((column) => column.name === 'owner_id')) {
      setFixtureOwner(t.client.sqlite, ids[SECRETARY]!, ids[agent]!, 'id')
    }
    await toTesting(earlier)
    const red = await step(earlier.id, 'tested', { green: false, log: LOG, redTests: [T], ran: 2, passed: 1 })
    expect(red.status, red.raw).toBe(200)
    const ownerNotices = messagesAbout(waiting.run, ids[SECRETARY]!).filter((one) => (one.data.body ?? '').includes(earlier.id))
    const starterNotices = messagesAbout(waiting.run, ids[STARTER]!).filter((one) => (one.data.body ?? '').includes(earlier.id))
    expect(ownerNotices).toHaveLength(1)
    expect(starterNotices).toHaveLength(0)
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'not-queued', told: ownerNotices[0]!.id })
  })

  it('4. holds: an entry in its lane finishes, nothing new takes a lane or is submitted, and the hold says who and why', async () => {
    const lineFour = await aLine('seal-line-four')
    await setGates({ 'queue-at-the-seal': '1' })
    const inTheLane = await aHandEntry(HAND)
    await toTesting(inTheLane)
    const judged = await aHandEntry(HAND)
    await toJudged(judged)
    expect(stored(judged.id)['state']).toBe('judged')

    const because = 'Synthetic: the queue is held while main is looked at.'
    await setGates({ 'queue-held': '1' }, asAgent(SECRETARY), because)
    const listed = await call('GET', '/api/merge-queue', asPerson)
    expect(listed.status, listed.raw).toBe(200)
    expect(listed.body['held']).toEqual({ by: { kind: 'agent', id: ids[SECRETARY] }, at: expect.any(String), because })

    // THE ENTRY ALREADY IN ITS LANE FINISHES.
    await toMerged(inTheLane)
    expect(stored(inTheLane.id)['state']).toBe('merged')

    // THE JUDGED ENTRY DOES NOT TAKE THE FREE LANE, and the gate counts the refusal.
    const heldBefore = counted('queue-held')
    const refused = await step(judged.id, 'integrating', {})
    expect(refused.status, refused.raw).toBe(409)
    expect(stored(judged.id)['state']).toBe('judged')
    expect(counted('queue-held')).toBe(heldBefore + 1)
    expect((await entry(judged.id)).toolWaits).toMatchObject({ because: 'the-queue-is-held' })
    const queue = await import('../src/server/lib/merge-queue.ts')
    expect(queue.theMergeToolWork('default').wanted.map((one) => one.id)).not.toContain(judged.id)

    // A SEAL MADE WHILE HELD WAITS FOR THE HOLD, and the gate counts it.
    const waiting = await aSealedRun(lineFour)
    expect(entriesOf(waiting.run)).toEqual([])
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', for: 'the-hold', commit: waiting.seal.commit })
    expect(counted('queue-held')).toBe(heldBefore + 2)

    // THE HOLD LIFTED: the judged entry is handed to the merge tool and takes its lane, and asking again submits the seal.
    await setGates({ 'queue-held': null }, asAgent(SECRETARY), 'Synthetic: main is looked at.')
    expect((await call('GET', '/api/merge-queue', asPerson)).body['held']).toBeNull()
    expect(queue.theMergeToolWork('default').wanted.map((one) => one.id)).toContain(judged.id)
    const taken = await step(judged.id, 'integrating', {})
    expect(taken.status, taken.raw).toBe(200)
    const asked = await again(waiting.run)
    expect(asked.status, asked.raw).toBe(200)
    const [queued] = entriesOf(waiting.run)
    expect(queued, 'the office submitted the seal once the hold was lifted').toBeDefined()
    expect(asked.body['queuedAtTheSeal']).toMatchObject({ outcome: 'queued', entry: queued })
  })

  it('5. does an act already done once: a seal submitted by hand while it waits is not submitted again', async () => {
    const lineFive = await aLine('seal-line-five')
    // THE EARLIER ENTRY IS SUBMITTED BY HAND BEFORE THE GATES ARE ON, or the office would have queued its seal itself.
    const earlier = await aHandEntry(lineFive)
    await setGates({ 'queue-at-the-seal': '1', 'queue-waits-for-the-line': '1' })
    const waiting = await aSealedRun(lineFive)
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', entry: earlier.id })

    const byHand = await call('POST', '/api/merge-queue', asPerson, { run: waiting.run, changeset: { adapter: 'git', repository: REPOSITORY } })
    expect(byHand.status, byHand.raw).toBe(201)
    const handMade = String(byHand.body.entry.id)

    await toTesting(earlier)
    await toMerged(earlier)
    expect(entriesOf(waiting.run)).toEqual([handMade])
    const note = stored(waiting.run)['atTheSeal']?.['queued']
    expect(note).toMatchObject({ outcome: 'already', entry: handMade, commit: waiting.seal.commit })

    for (const _ of [1, 2]) {
      const asked = await again(waiting.run)
      expect(asked.status, asked.raw).toBe(200)
      expect(asked.body['queuedAtTheSeal']).toEqual(note)
    }
    expect(entriesOf(waiting.run)).toEqual([handMade])
  })
})
