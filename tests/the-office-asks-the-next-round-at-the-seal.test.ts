// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS FOR THE NEXT ROUND AT THE SEAL, AND LIFTING THE HOLD DECIDES THE WAITING SEALS AGAIN (wave 13u round 94,
 * item 30 step 5). Nothing of it is live: the gate 'next-round-at-the-seal' is off by default, and a line is off until the
 * person or a secretary with its own key turns it on.
 *
 * WHAT THIS FILE PROVES:
 *   1. ASKED AT THE SEAL. With the gate 'next-round-at-the-seal' on and the line on, a run sealed with a briefs/NEXT.md in
 *      its sandbox folder has its next round asked for by the office, with that brief, and the run keeps a note saying so.
 *      The gate counts it. With the gate off, nothing is asked, no note is written, and the gate counts it all the same.
 *      With the line off, nothing is asked and nothing is counted. Only the office writes the note.
 *   2. NEVER A HELD BRIEF. A folder with no NEXT.md, or a NEXT.md that is a link to a NEXT-held-* file, is not asked: the
 *      note says so and no next round is written.
 *   3. NEVER THE ROUND'S OWN BRIEF. A NEXT.md with the same sha256 as the brief this round started with is not asked, and
 *      neither is a NEXT.md when no record names the brief this round started with.
 *   4. WAITS FOR THE SEALED RUN'S PROCESSES. While a process row of the sealed run is open and not gone, the worker's list
 *      leaves the ask out and the ask says it waits. Once the row is gone, the list holds it and the starting door takes it.
 *   5. FAILS AFTER THE LIMIT. An ask that has waited the office's limit is failed, with its reason naming the process row;
 *      one that has waited less still waits.
 *   6. ASKED ONCE. A next round already asked for this run, here by the run's own agent, is not asked again at the seal:
 *      the ask stands as it was and the note says one was asked already.
 *   7. THE HOLD LIFTED. A seal that waits for the hold is decided again as soon as the hold is lifted, at the settings door
 *      and when a choice with an end runs out, with nobody asking the office again. Both notes are kept in one field of
 *      the run, and deciding the seal again leaves the note about the next round as it was.
 *   8. NOT FOR A CHECK. A round whose last message to its starter has a line of its own saying not for a check, with the
 *      gates 'next-round-at-the-seal' and 'queue-at-the-seal' on, has its next round asked for. It is asked no check and
 *      is not put in the merge queue, and its account says the check was not asked.
 *
 * Every other round writes its starter a FEATURE READY: line before its seal, because the office asks for a sandbox
 * round's check, and so for its next round, only when a whole feature is done (src/server/lib/how-a-round-ended.ts).
 *
 * MUTATIONS, each after a green control run and each restored: listed by the Code commit that makes them possible.
 *
 * Every fixture here is synthetic and says so. The lane's repository, the runs' trees and the sandbox folders are made
 * under the temporary directory and removed after; the container rows are written as the sandbox launcher writes them;
 * the records are filed as fixtures, and the start of the round before is planted on its run as the office writes it;
 * nothing reaches the live server. The process row that stands for the sealed run's own process is this test's process,
 * and it is taken away by deleting the row, never by the release door, which would signal this process.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { FEATURE_READY, NOT_FOR_A_CHECK } from '../src/server/lib/how-a-round-ended-rules.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const A = 'work/a.txt'
const REPOSITORY = 'next-round-at-the-seal'
const STARTER = 'next-at-seal-starter'
const SECRETARY = 'next-at-seal-secretary'
const THE_WORKER_ID = 'mole-office/the-message-worker'
const A_MADE_UP_MODEL = 'claude-made-up-round-1'
const GATE_IDS = ['next-round-at-the-seal', 'queue-at-the-seal', 'queue-waits-for-the-line', 'queue-held'] as const
type GateId = (typeof GATE_IDS)[number]
const modulePath = (relative: string): string => new URL(relative, import.meta.url).pathname
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('the office asks for the next round at the seal', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let workerModeBefore: string | undefined
  const made: string[] = []
  const ids: Record<string, string> = {}
  const keys: Record<string, string> = {}
  let asPerson: Record<string, string>
  let asTheWorker: Record<string, string>
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
    const dir = mkdtempSync(join(tmpdir(), `next-round-at-the-seal-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic next-round-at-the-seal fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  /** The setting of a gate, read from the gates list, so nothing here pins a setting's name. */
  function settingOf(id: GateId): string {
    const gate = GATES.find((one) => one.id === id)
    expect(gate, `the gate ${id} is declared`).toBeDefined()
    return gate!.setting
  }
  /** Turn gates on or off through the settings door, as `headers`. Null removes the choice, which leaves the gate off. */
  async function setGates(chosen: Partial<Record<GateId, '1' | '0' | null>>, headers: Record<string, string> = asPerson, because = 'Synthetic: a case of the office asking at the seal.', until?: string) {
    const changes = Object.entries(chosen).map(([id, value]) => ({ name: settingOf(id as GateId), value, ...(until === undefined ? {} : { until }) }))
    const r = await call('POST', '/api/office/settings', headers, { changes, because })
    expect(r.status, r.raw).toBe(200)
    return r.body
  }
  /** How many times a gate was met, on every day. */
  const counted = (id: GateId) => (t.client.sqlite.prepare('SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = ?').get(id) as { n: number | null }).n ?? 0
  /** The merge entries of a run, oldest first. */
  const entriesOf = (run: string) =>
    (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'merge_entry' AND json_extract(data, '$.run') = ? AND deleted_at IS NULL ORDER BY created_at, rowid").all(run) as { id: string }[]).map((row) => row.id)
  /** The office's own id, as the next round's asker names it: the office as a participant. */
  const theOfficesId = async () => String((await import('../src/shared/participants.ts')).moleOffice().id)
  /** The office writes this as itself: the actor of a fixture planted the way the office plants it. */
  const asTheOfficeWritesIt = async () => ({ type: 'system', id: (await import('../src/shared/participants.ts')).moleOffice().id }) as const

  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await call('POST', '/api/agents/started', headers, { handle, name: `Synthetic ${handle}`, runtime: 'claude-code', ...payload })
    expect(r.status, r.raw).toBe(201)
    ids[handle] = String(r.body['agent'].id)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }
  /**
   * A LINE: a supervisor whose work is under work/, started by the starter, with its line turned on by the person unless
   * `on` is false. The office asks only for a supervisor's next round.
   */
  async function aLine(handle: string, on = true): Promise<string> {
    await register(handle, asAgent(STARTER), { workArea: ['work'], role: 'supervisor' })
    if (on) {
      const turned = await call('POST', '/api/merge-queue/lines', asPerson, { agent: handle, on: true, repository: REPOSITORY, because: 'Synthetic: this line goes on at the seal.' })
      expect(turned.status, turned.raw).toBe(200)
    }
    return handle
  }

  interface Sandbox { folder: string; container: string; next: string }
  /** A made-up sandbox folder, with the container row `tools/sandbox.mjs up` registers for it, so the office vouches for it. */
  function aSandbox(name: string): Sandbox {
    const folder = join(scratch('sandboxes'), name)
    mkdirSync(join(folder, 'briefs'), { recursive: true })
    const container = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-25 10:00:00', 'agent:fixture')")
      .run(container, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
    return { folder, container, next: join(folder, 'briefs', 'NEXT.md') }
  }
  const sandboxField = (sandbox: Sandbox) => ({ template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder })

  /**
   * THE ROUND BEFORE: a run of `handle` in the sandbox, filed earlier, whose next round the office started as the run
   * `fileTheRound` files, with the brief `startedWith`. The start is planted on it as the office writes it when the
   * round's run is filed, and the round's run is derived from it, as the launcher files it. Gives the round's run.
   */
  async function theRoundBefore(handle: string, sandbox: Sandbox, fileTheRound: () => string, startedWith: { sha256: string; bytes: number }): Promise<string> {
    const before = t.api.createRecord({
      kind: 'session', title: `Synthetic round before of ${handle}`, workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture',
      data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: A_MADE_UP_MODEL, workingDirectory: sandbox.folder, cutFrom: 'main', sandbox: sandboxField(sandbox) },
    }).id
    // FILED EARLIER THAN THE ROUND, as it was: the agent's last run in a sandbox is the round's run. It is filed first, so
    // it comes first in the order written, and its created_at is set earlier, so the time in words agrees with that order.
    t.client.sqlite.prepare("UPDATE records SET created_at = '2026-10-25 09:00:00' WHERE id = ?").run(before)
    const round = fileTheRound()
    t.api.writeTheNextRound(before, {
      state: 'started',
      askedAt: '2026-10-25 09:30:00',
      askedBy: { who: { kind: 'agent', id: ids[handle] }, as: 'the run’s agent' },
      brief: { path: sandbox.next, sha256: startedWith.sha256, bytes: startedWith.bytes },
      sandbox: { folder: sandbox.folder, instance: basename(sandbox.folder), container: sandbox.container },
      started: { at: '2026-10-25 09:40:00', run: round, runKeyId: 'synthetic-run-key-id' },
    }, await asTheOfficeWritesIt())
    t.api.createLink({ fromId: round, toId: before, type: 'derived_from', actor: { type: 'agent', id: ids[STARTER]! } })
    return round
  }

  interface Round { run: string; dir: string; sandbox: Sandbox }
  /**
   * A RUNNING ROUND OF `handle` in its own sandbox: a clone of the lane's repository at repo/ in the folder, where a
   * sandbox keeps its repository and the next-round door looks for it, whose `work` branch adds a file of its own under
   * work/. `startedWith` is the brief the round started with, planted on the round
   * before; null files no round before. `folder` names the sandbox folder, which is the handle's unless said.
   */
  async function aRound(handle: string, startedWith: string | null = `# Synthetic brief this round of ${handle} started with\n`, folder = handle): Promise<Round> {
    const sandbox = aSandbox(folder)
    const dir = join(sandbox.folder, 'repo')
    mkdirSync(dir)
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, 'work', `${handle}.txt`), `Synthetic work of ${handle}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work sealed at the end of a round')
    const fileTheRound = () => t.api.createRecord({
      kind: 'session', title: `Synthetic round of ${handle}`, workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture',
      data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: A_MADE_UP_MODEL, workingDirectory: dir, cutFrom: 'main', sandbox: sandboxField(sandbox) },
    }).id
    if (startedWith === null) return { run: fileTheRound(), dir, sandbox }
    const bytes = Buffer.from(startedWith)
    const run = await theRoundBefore(handle, sandbox, fileTheRound, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
    return { run, dir, sandbox }
  }
  /** The round's agent writes its starter in the round's own session, as the last word of a round before its seal. */
  function theRoundWritesItsStarter(round: Round, handle: string, said: string): string {
    return t.api.createRecord({
      kind: 'message', title: `Synthetic word of ${handle} to its starter`, workspaceId: 'default', actor: { type: 'agent', id: ids[handle]!, sessionId: round.run },
      data: { to: [{ kind: 'agent', id: ids[STARTER]! }], body: said },
    }).id
  }
  /** Seal the round at the record door as its agent, as a round ends, after its last word to its starter. */
  async function seal(round: Round, handle: string, said = `${FEATURE_READY} the synthetic work of ${handle} is done.\nI seal next.`) {
    theRoundWritesItsStarter(round, handle, said)
    const sealed = await call('PATCH', `/api/records/${round.run}`, asAgent(handle), { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
    expect(sealed.status, sealed.raw).toBe(200)
    return sealed.body
  }
  /** The worker's list of rounds to start, by the run each continues. */
  const theWorkersList = async () => {
    const listed = await call('GET', '/api/worker/rounds', asTheWorker)
    expect(listed.status, listed.raw).toBe(200)
    return listed.body['rounds'] as { run: string; agentId: string; handle: string; runtime: string | null }[]
  }
  /** A live process row of a run: this test's own process, registered at the ledger's door so it reads alive. */
  async function aLiveProcessRow(run: string): Promise<string> {
    const r = await call('POST', '/api/resources', asPerson, {
      sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'A synthetic process of this test',
      adopting: 'this test process stands for the sealed run’s own process, so the run reads as going',
    })
    expect(r.status, r.raw).toBe(201)
    return String(r.body['resource'].id)
  }
  const dropTheRow = (id: string): void => void t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(id)
  /** The worker's launcher run for one round, filed with the office's key as the worker files it. */
  async function aLauncherRun(round: string): Promise<string> {
    const r = await call('POST', '/api/records', asTheWorker, {
      kind: 'session', title: `Synthetic launcher run for the round after ${round}`,
      data: { state: 'running', runtime: 'round-launcher', doing: 'starting a synthetic next round; this run runs no model', workingDirectory: root, startedByMoleOffice: true, extra: { purpose: 'round', round } },
    })
    expect(r.status, r.raw).toBe(201)
    return String(r.body['record'].id)
  }

  beforeAll(async () => {
    // THE ASK DOOR ASKS WHETHER THE OFFICE'S WORKER TAKES THE QUEUE. Set here, so the answer does not depend on a .env.
    workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
    process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    t = await freshDb()
    app = (await apiApp()).app
    asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() }
    asTheWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_WORKER_ID, ...theOfficesKeyHeader() }
    root = scratch('main')
    git(root, 'init', '-q', '-b', 'main'); asTheFixture(root)
    mkdirSync(join(root, 'work')); writeFileSync(join(root, A), 'before\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic baseline')
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: 'default', name: REPOSITORY, root, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' } })
    await register(STARTER, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(SECRETARY, asPerson, { role: 'secretary' })
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE OR LEAVE A GATE ON FOR THE NEXT ONE.
  afterEach(async () => {
    const listed = await call('GET', `/api/merge-queue?lane=${encodeURIComponent(root)}`, asPerson)
    const holder = listed.body['lanes']?.[0]?.occupiedBy as { entry: string; state: string } | null | undefined
    if (holder !== null && holder !== undefined) await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over, so the lane is freed.' })
    const declared = GATE_IDS.flatMap((id) => GATES.filter((one) => one.id === id).map((one) => ({ name: one.setting, value: null })))
    if (declared.length > 0) await call('POST', '/api/office/settings', asPerson, { changes: declared, because: 'Synthetic: the case is over.' })
  })
  afterAll(async () => {
    if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
    else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
    await app?.close(); t?.close()
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  it('1. asks for the next round when the gate and the line are on, not when either is off, and only the office writes the note', async () => {
    // THE GATE OFF, THE LINE ON: nothing is asked, no note is written, and the gate counts it.
    const before = counted('next-round-at-the-seal')
    const gateOff = await aLine('next-at-seal-gate-off')
    const off = await aRound(gateOff)
    writeFileSync(off.sandbox.next, '# Synthetic brief of the next round\n')
    await seal(off, gateOff)
    expect(stored(off.run)['nextRound']).toBeUndefined()
    expect(stored(off.run)['atTheSeal']?.['nextRound']).toBeUndefined()
    expect(counted('next-round-at-the-seal')).toBe(before + 1)

    // THE GATE ON, THE LINE OFF: nothing is asked, no note is written, and nothing is counted.
    await setGates({ 'next-round-at-the-seal': '1' })
    const lineOff = await aLine('next-at-seal-line-off', false)
    const unlined = await aRound(lineOff)
    writeFileSync(unlined.sandbox.next, '# Synthetic brief of the next round\n')
    await seal(unlined, lineOff)
    expect(stored(unlined.run)['nextRound']).toBeUndefined()
    expect(stored(unlined.run)['atTheSeal']?.['nextRound']).toBeUndefined()
    expect(counted('next-round-at-the-seal')).toBe(before + 1)

    // BOTH ON: the office asks with the folder's briefs/NEXT.md, as itself, the run keeps a note, and the gate counts it.
    const both = await aLine('next-at-seal-both-on')
    const on = await aRound(both)
    writeFileSync(on.sandbox.next, '# Synthetic brief of the next round\n\nDo the synthetic next round.\n')
    const sealed = await seal(on, both)
    const asked = stored(on.run)['nextRound']
    expect(asked).toMatchObject({
      state: 'wanted',
      askedBy: { who: { id: await theOfficesId() }, as: 'the office' },
      brief: { path: on.sandbox.next, sha256: sha256(on.sandbox.next) },
      sandbox: { folder: on.sandbox.folder, container: on.sandbox.container },
    })
    const note = stored(on.run)['atTheSeal']?.['nextRound']
    expect(note).toMatchObject({ outcome: 'asked', brief: { path: on.sandbox.next, sha256: sha256(on.sandbox.next) }, at: expect.any(String) })
    expect(sealed['nextRoundAtTheSeal']).toEqual(note)
    expect(counted('next-round-at-the-seal')).toBe(before + 2)

    // AN ORDINARY WRITE MAY NOT TOUCH THE NOTE.
    const fields = await import(/* @vite-ignore */ modulePath('../src/server/lib/merge-queue-fields-the-office-writes.ts')).catch(() => ({}))
    const theNotesRefusal = Reflect.get(fields, 'ONLY_THE_OFFICE_WRITES_AT_THE_SEAL') as string | undefined
    expect(theNotesRefusal).toBeDefined()
    const written = await call('PATCH', `/api/records/${on.run}`, asPerson, { dataPatch: { atTheSeal: { nextRound: { outcome: 'not-asked', says: 'Synthetic: made up.', at: '2026-10-25 17:00:00' } } } })
    expect(written.status, written.raw).toBe(403)
    expect(written.body['error']).toBe(theNotesRefusal)
  })

  it('2. asks for no held brief: none with no NEXT.md, and none with a NEXT.md that is a NEXT-held file', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })

    // NO NEXT.md: only a held brief is in the folder.
    const none = await aLine('next-at-seal-no-next')
    const bare = await aRound(none)
    writeFileSync(join(bare.sandbox.folder, 'briefs', 'NEXT-held-until-a-synthetic-answer.md'), '# Synthetic held brief\n')
    await seal(bare, none)
    expect(stored(bare.run)['nextRound']).toBeUndefined()
    expect(stored(bare.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked', says: expect.stringContaining(bare.sandbox.next) })

    // NEXT.md IS A LINK TO A NEXT-held FILE.
    const linked = await aLine('next-at-seal-held-link')
    const held = await aRound(linked)
    const heldBrief = join(held.sandbox.folder, 'briefs', 'NEXT-held-until-a-synthetic-answer.md')
    writeFileSync(heldBrief, '# Synthetic held brief\n')
    symlinkSync(heldBrief, held.sandbox.next)
    await seal(held, linked)
    expect(stored(held.run)['nextRound']).toBeUndefined()
    expect(stored(held.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked', says: expect.stringContaining(basename(heldBrief)) })
  })

  it('3. asks for no brief the round started with, and none when no record names the brief it started with', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })

    // NEXT.md IS STILL THE BRIEF THIS ROUND STARTED WITH.
    const same = await aLine('next-at-seal-same-brief')
    const startedWith = '# Synthetic brief this round started with, never replaced\n'
    const unchanged = await aRound(same, startedWith)
    writeFileSync(unchanged.sandbox.next, startedWith)
    await seal(unchanged, same)
    expect(stored(unchanged.run)['nextRound']).toBeUndefined()
    expect(stored(unchanged.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked', says: expect.any(String) })

    // NO RECORD NAMES THE BRIEF THIS ROUND STARTED WITH: the round was not started by the office.
    const first = await aLine('next-at-seal-first-round')
    const unnamed = await aRound(first, null)
    writeFileSync(unnamed.sandbox.next, '# Synthetic brief of the next round\n')
    await seal(unnamed, first)
    expect(stored(unnamed.run)['nextRound']).toBeUndefined()
    expect(stored(unnamed.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked', says: expect.any(String) })
  })

  it('4. leaves the ask out of the worker\'s list while the sealed run\'s process runs, says it waits, and then starts it', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const waiter = await aLine('next-at-seal-waits')
    const model = await call('POST', `/api/office/run-models/agent/${ids[waiter]}`, asPerson, { model: A_MADE_UP_MODEL, variant: null })
    expect(model.status, model.raw).toBe(200)
    const round = await aRound(waiter)
    writeFileSync(round.sandbox.next, '# Synthetic brief of the next round\n')
    const row = await aLiveProcessRow(round.run)
    try {
      await seal(round, waiter)
      expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })

      // THE SEALED RUN'S OWN PROCESS STILL RUNS: the list leaves the ask out, and the ask says it waits, from when.
      expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
      const waits = stored(round.run)['nextRound']
      expect(waits).toMatchObject({ state: 'wanted', waits: { since: expect.any(String), says: expect.stringContaining(row) } })
      // ASKED AGAIN, the list says the same and the ask keeps when it began to wait.
      expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
      expect(stored(round.run)['nextRound']).toEqual(waits)
    } finally {
      dropTheRow(row)
    }

    // THE PROCESS IS GONE: the list holds the ask, and the starting door takes it.
    expect(await theWorkersList()).toContainEqual({ run: round.run, agentId: ids[waiter], handle: waiter, runtime: 'claude-code', workspaceId: 'default' })
    const launcher = await aLauncherRun(round.run)
    const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
    expect(starting.status, starting.raw).toBe(200)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'starting', starting: { wrapper: launcher } })
  })

  it('5. fails an ask that has waited the office\'s limit for the sealed run\'s process, with its reason, and not one that has waited less', async () => {
    const nextRound = await import(/* @vite-ignore */ modulePath('../src/server/lib/next-round.ts'))
    const limit = Reflect.get(nextRound, 'A_ROUND_WAITS_FOR_ITS_RUN_AT_MOST_MINUTES') as number | undefined
    expect(limit, 'the office names how long an ask waits for the sealed run').toEqual(expect.any(Number))
    await setGates({ 'next-round-at-the-seal': '1' })
    const failer = await aLine('next-at-seal-fails')
    const round = await aRound(failer)
    writeFileSync(round.sandbox.next, '# Synthetic brief of the next round\n')
    const row = await aLiveProcessRow(round.run)
    try {
      await seal(round, failer)
      await theWorkersList()
      const waits = stored(round.run)['nextRound']
      expect(waits).toMatchObject({ state: 'wanted', waits: { since: expect.any(String) } })
      const office = await asTheOfficeWritesIt()
      /** SYNTHETIC: the time the ask began to wait, moved back as if the worker had looked that many minutes ago. */
      const waitedFor = (minutes: number) =>
        t.api.writeTheNextRound(round.run, { ...waits, waits: { ...waits.waits, since: localStamp(new Date(Date.now() - minutes * 60_000)) } }, office)

      // A MINUTE SHORT OF THE LIMIT: it still waits.
      waitedFor(limit! - 1)
      expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
      expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted' })

      // A MINUTE PAST THE LIMIT: the ask is failed, with the reason naming the process row.
      waitedFor(limit! + 1)
      expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
      expect(stored(round.run)['nextRound']).toMatchObject({ state: 'failed', failed: { at: expect.any(String), says: expect.stringContaining(row) } })
    } finally {
      dropTheRow(row)
    }
    // ONCE FAILED, IT STAYS FAILED when the process is gone.
    expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'failed' })
  })

  it('6. asks no second time for a run whose next round is asked for already', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const asker = await aLine('next-at-seal-asked-already')
    const round = await aRound(asker)
    writeFileSync(round.sandbox.next, '# Synthetic brief of the next round\n')
    // THE RUN'S OWN AGENT ASKS FOR ITS NEXT ROUND BEFORE IT SEALS.
    const own = await call('POST', `/api/agents/${asker}/next-round`, asAgent(asker), { brief: round.sandbox.next })
    expect(own.status, own.raw).toBe(202)
    const kept = stored(round.run)['nextRound']
    expect(kept).toMatchObject({ state: 'wanted', askedBy: { as: 'the run’s agent' } })

    await seal(round, asker)
    expect(stored(round.run)['nextRound']).toEqual(kept)
    expect(stored(round.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'already', says: expect.any(String), at: expect.any(String) })
  })

  it('7. decides a seal that waits for the hold as soon as the hold is lifted, at the settings door and when a choice runs out', async () => {
    const lineSeven = await aLine('next-at-seal-hold')
    await setGates({ 'queue-at-the-seal': '1', 'next-round-at-the-seal': '1' })

    // LIFTED AT THE SETTINGS DOOR: the waiting seal is submitted by the office, and nobody asks it again.
    await setGates({ 'queue-held': '1' }, asAgent(SECRETARY), 'Synthetic: the queue is held while main is looked at.')
    const waiting = await aRound(lineSeven)
    await seal(waiting, lineSeven)
    expect(entriesOf(waiting.run)).toEqual([])
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', for: 'the-hold' })
    const nextNote = stored(waiting.run)['atTheSeal']?.['nextRound']
    expect(nextNote).toMatchObject({ outcome: 'not-asked', says: expect.stringContaining(waiting.sandbox.next) })
    const lifted = await setGates({ 'queue-held': null }, asAgent(SECRETARY), 'Synthetic: main is looked at.')
    const [queued, ...more] = entriesOf(waiting.run)
    expect(queued, 'the office submitted the seal when the hold was lifted').toBeDefined()
    expect(more).toEqual([])
    expect(stored(waiting.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'queued', entry: queued })
    // THE NOTE ABOUT THE NEXT ROUND IS KEPT BESIDE IT, as it was.
    expect(stored(waiting.run)['atTheSeal']?.['nextRound']).toEqual(nextNote)
    expect(lifted['sealsDecided']).toContainEqual(expect.objectContaining({ run: waiting.run }))

    // THE ENTRY IS TAKEN OUT OF THE WAY, so the next seal of the line does not wait for it.
    const withdrawn = await call('POST', `/api/merge-queue/${queued}/withdraw`, asPerson, { because: 'Synthetic: the first half of the case is over.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)

    // LIFTED WHEN A CHOICE WITH AN END RUNS OUT: the worker's run-out decides the waiting seal.
    const inTenMinutes = localStamp(new Date(Date.now() + 10 * 60_000)).slice(0, 16)
    await setGates({ 'queue-held': '1' }, asAgent(SECRETARY), 'Synthetic: the queue is held for ten minutes.', inTenMinutes)
    const second = await aRound(lineSeven, null, `${lineSeven}-second`)
    await seal(second, lineSeven)
    expect(entriesOf(second.run)).toEqual([])
    expect(stored(second.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', for: 'the-hold' })
    // SYNTHETIC: the choice's end is moved into the past, as if the ten minutes had gone by.
    const choice = t.client.sqlite.prepare('SELECT until FROM runtime_settings WHERE name = ?').get(settingOf('queue-held')) as { until: string }
    t.client.sqlite.prepare('UPDATE runtime_settings SET until = ? WHERE name = ?').run(localStamp(new Date(Date.now() - 2 * 60_000)).slice(0, choice.until.length), settingOf('queue-held'))
    const ranOut = await call('POST', '/api/worker/gates/run-out', asTheWorker)
    expect(ranOut.status, ranOut.raw).toBe(200)
    expect(ranOut.body['ranOut']).toContainEqual(expect.objectContaining({ gate: 'queue-held' }))
    const [queuedAfter] = entriesOf(second.run)
    expect(queuedAfter, 'the office submitted the seal when the hold ran out').toBeDefined()
    expect(stored(second.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'queued', entry: queuedAfter })
    expect(ranOut.body['sealsDecided']).toContainEqual(expect.objectContaining({ run: second.run }))
  })

  it('8. asks for the next round of a round that says not for a check, which is asked no check and is not queued', async () => {
    await setGates({ 'next-round-at-the-seal': '1', 'queue-at-the-seal': '1' })
    const lineEight = await aLine('next-at-seal-not-for-a-check')
    const round = await aRound(lineEight)
    writeFileSync(round.sandbox.next, '# Synthetic brief of the next round\n')
    const sealed = await seal(round, lineEight, `The synthetic work of ${lineEight} is committed.\n${NOT_FOR_A_CHECK}`)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })
    expect(sealed['howTheRoundEnded']).toMatchObject({ sealed: true, theCheck: 'not asked' })
    expect(sealed['theCheck']).toBeUndefined()
    expect(sealed['queuedAtTheSeal']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['queued']).toBeUndefined()
    expect(entriesOf(round.run)).toEqual([])
  })
})
