// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS A LINE'S NEXT ROUND AT ITS RELEASE, AND STARTS NO MORE CLAUDE SUPERVISORS AT ONCE THAN ITS CAP (wave 13r
 * round AX, item 24). Nothing of it is live: the gate 'next-round-at-the-release' is off by default.
 *
 * WHAT THIS FILE PROVES:
 *   1. ASKED AT THE RELEASE. With the gate on, a supervisor's run released by its check, with a briefs/NEXT.md in its
 *      sandbox written after the run was filed, has its next round asked for by the office, with that brief. No merge line
 *      needs to be on. The run keeps a note saying so, which says it was written at the release, and the verdict's reply
 *      carries it. The gate counts it. With the gate off, nothing is asked, no note is written, and the gate counts it.
 *   2. THE LINE RESTS. With the pause file the office names in the sandbox's briefs folder, nothing is asked, and the note
 *      names the file.
 *   3. A NEWER RUN. With a run of the agent filed after the released one, even one with no sandbox, nothing is asked,
 *      and the note names the newer run.
 *   4. ONLY A SUPERVISOR. A released run of an agent that holds another card is not asked.
 *   5. ONLY A NEWER BRIEF. A NEXT.md whose file time is before the run was filed is not asked.
 *   6. THE CAP. With as many supervisor runs in claude-code going as the cap's default, each with a live process row,
 *      one of them in another project and one naming no model, the ask is kept and the worker's list leaves it out: it
 *      neither waits on its run nor fails. With one of them gone, the list holds it and the starting door takes it. None
 *      of these counts: a claude-code supervisor run in the running state with no open process row, one whose row is
 *      closed, three dsh supervisors, and a claude-code worker. The count is by runtime, not by the model's name.
 *   7. THE RELEASE STANDS WHEN THE ASK THROWS. With a NEXT.md nobody may read, the run is released, the verdict door
 *      answers 201, and its reply says why nothing was kept. Nothing is asked.
 *   8. AN UNREADABLE CAP IS SAID. While the cap is a word, a number below 0 or a fraction, the worker's list is refused,
 *      naming the setting and its value. At 0 it starts no round in claude-code. With the cap unset, the list holds the round.
 *   9. THE RUN'S PAGE SAYS THE MOMENT. The block on the run page heads a note written at the release with the release's
 *      heading, and a note written at the seal, or written before a note named its moment, with the seal's. Both
 *      headings are read from the words table.
 *
 * MUTATIONS, each after a green control run and each restored: listed by the Code commit that makes them possible.
 *
 * Every fixture here is synthetic and says so. The lane's repository, the runs' trees and the sandbox folders are made
 * under the temporary directory and removed after; the container rows are written as the sandbox launcher writes them;
 * the records are filed as fixtures, and the start of the round before is planted on its run as the office writes it;
 * nothing reaches the live server. Each live process row stands for a run's own process and is this test's process; it
 * is taken away by deleting or closing the row, never by the release door, which would signal this process.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { readSetting } from '../src/config/settings.mjs'
import { RELEASED } from '../src/shared/releasing.ts'
import { parseStoredStamp } from '../src/shared/time.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { sectionsOf } from '../src/web/components/sections.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'

const STARTER = 'next-at-release-starter'
const INSPECTOR = 'next-at-release-inspector'
const THE_WORKER_ID = 'mole-office/the-message-worker'
const A_MADE_UP_CLAUDE_MODEL = 'claude-made-up-round-1'
const A_MADE_UP_DEEPSEEK_MODEL = 'deepseek-made-up-round-1'
const ELSEWHERE = 'next-at-release-elsewhere'
const THE_GATE = 'next-round-at-the-release'
/** The setting that says how many Claude supervisor runs may go at once. Its default is read from its declaration. */
const THE_CAP = 'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE'
const modulePath = (relative: string): string => new URL(relative, import.meta.url).pathname
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('the office asks a line\'s next round at its release', () => {
  let t: TestDb
  let app: FastifyInstance
  let root: string
  let workerModeBefore: string | undefined
  const made: string[] = []
  const ids: Record<string, string> = {}
  const keys: Record<string, string> = {}
  let asPerson: Record<string, string>
  let asTheWorker: Record<string, string>
  const asAgent = (handle: string, workspace = 'default'): Record<string, string> => ({
    'x-mole-office-workspace': workspace,
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
    const dir = mkdtempSync(join(tmpdir(), `next-round-at-the-release-${prefix}-`))
    made.push(dir)
    return realpathSync(dir)
  }
  function asTheFixture(dir: string) { git(dir, 'config', 'user.email', 'fixture@example.invalid'); git(dir, 'config', 'user.name', 'Synthetic next-round-at-the-release fixture') }
  const stored = (id: string) => t.api.getRecord(id)!.data as Record<string, any>
  /** The setting of the gate, read from the gates list, so nothing here pins a setting's name. */
  function settingOf(id: string): string {
    const gate = GATES.find((one) => one.id === id)
    expect(gate, `the gate ${id} is declared`).toBeDefined()
    return gate!.setting
  }
  async function setTheGate(value: '1' | '0' | null) {
    const r = await call('POST', '/api/office/settings', asPerson, { changes: [{ name: settingOf(THE_GATE), value }], because: 'Synthetic: a case of the office asking at the release.' })
    expect(r.status, r.raw).toBe(200)
  }
  /** How many times the gate was met, on every day. */
  const counted = () => (t.client.sqlite.prepare('SELECT sum(would_stop) AS n FROM gate_counts WHERE gate = ?').get(THE_GATE) as { n: number | null }).n ?? 0
  /** The office's own id, as the next round's asker names it. */
  const theOfficesId = async () => String((await import('../src/shared/participants.ts')).moleOffice().id)
  const asTheOfficeWritesIt = async () => ({ type: 'system', id: (await import('../src/shared/participants.ts')).moleOffice().id }) as const
  /** What the seal module exports, read as it is once the code is there. */
  const theSealModule = async () => import(/* @vite-ignore */ modulePath('../src/server/lib/next-round-at-the-seal.ts')).catch(() => ({}))

  async function register(handle: string, headers: Record<string, string>, payload: Record<string, unknown>) {
    const r = await call('POST', '/api/agents/started', headers, { handle, name: `Synthetic ${handle}`, runtime: 'claude-code', ...payload })
    expect(r.status, r.raw).toBe(201)
    ids[handle] = String(r.body['agent'].id)
    const key = r.body['whatToGiveIt']?.key
    if (typeof key === 'string' && key !== '') keys[handle] = key
  }
  /** A LINE: an agent the starter registers, whose work is under work/, holding the card `role`. No merge line is turned on for it. */
  async function aLine(handle: string, role = 'supervisor'): Promise<string> {
    await register(handle, asAgent(STARTER), { workArea: ['work'], role })
    return handle
  }

  interface Sandbox { folder: string; container: string; briefs: string; next: string }
  /** A made-up sandbox folder, with the container row `tools/sandbox.mjs up` registers for it, so the office vouches for it. */
  function aSandbox(name: string): Sandbox {
    const folder = join(scratch('sandboxes'), name)
    const briefs = join(folder, 'briefs')
    mkdirSync(briefs, { recursive: true })
    const container = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-25 10:00:00', 'agent:fixture')")
      .run(container, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
    return { folder, container, briefs, next: join(briefs, 'NEXT.md') }
  }
  const sandboxField = (sandbox: Sandbox) => ({ template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder })

  interface Round { run: string; dir: string; sandbox: Sandbox }
  /**
   * A RUNNING ROUND OF `handle` in its own sandbox, started by the office from the round before with the brief it
   * started with: a clone of the lane's repository at repo/ in the folder, where a sandbox keeps its repository and the
   * next-round door looks for it, whose `work` branch adds a file under work/. The round before is filed first and
   * planted with the start as the office writes it, and the round's run is derived from it.
   */
  async function aRound(handle: string): Promise<Round> {
    const sandbox = aSandbox(handle)
    const dir = join(sandbox.folder, 'repo')
    mkdirSync(dir)
    git(dir, 'clone', '-q', root, '.'); asTheFixture(dir)
    git(dir, 'switch', '-q', '-c', 'work')
    writeFileSync(join(dir, 'work', `${handle}.txt`), `Synthetic work of ${handle}\n`); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'Synthetic work released at the end of a round')
    const theRun = (workingDirectory: string) => ({ state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime: 'claude-code', model: A_MADE_UP_CLAUDE_MODEL, workingDirectory, cutFrom: 'main', sandbox: sandboxField(sandbox) })
    const before = t.api.createRecord({ kind: 'session', title: `Synthetic round before of ${handle}`, workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture', data: theRun(sandbox.folder) }).id
    t.client.sqlite.prepare("UPDATE records SET created_at = '2026-10-25 09:00:00' WHERE id = ?").run(before)
    const run = t.api.createRecord({ kind: 'session', title: `Synthetic round of ${handle}`, workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture', data: theRun(dir) }).id
    const startedWith = Buffer.from(`# Synthetic brief this round of ${handle} started with\n`)
    t.api.writeTheNextRound(before, {
      state: 'started',
      askedAt: '2026-10-25 09:30:00',
      askedBy: { who: { kind: 'agent', id: ids[handle] }, as: 'the run’s agent' },
      brief: { path: sandbox.next, sha256: createHash('sha256').update(startedWith).digest('hex'), bytes: startedWith.length },
      sandbox: { folder: sandbox.folder, instance: basename(sandbox.folder), container: sandbox.container },
      started: { at: '2026-10-25 09:40:00', run, runKeyId: 'synthetic-run-key-id' },
    }, await asTheOfficeWritesIt())
    t.api.createLink({ fromId: run, toId: before, type: 'derived_from', actor: { type: 'agent', id: ids[STARTER]! } })
    return { run, dir, sandbox }
  }
  /** The line's next brief, written now, after the round's run was filed. */
  const aNewBrief = (round: Round) => writeFileSync(round.sandbox.next, `# Synthetic brief of the round after ${round.run}\n`)
  /** Seal the round at the record door as its agent, as a round ends. */
  async function seal(round: Round, handle: string) {
    const sealed = await call('PATCH', `/api/records/${round.run}`, asAgent(handle), { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
    expect(sealed.status, sealed.raw).toBe(200)
  }
  /**
   * The inspector reads the sealed run, assembles its check of the one file the round changed, and releases it at the
   * verdict door, as the inspector's tool sends them. Gives the verdict door's reply.
   */
  async function release(round: Round, handle: string) {
    const read = await call('GET', `/api/checks/${round.run}`, asAgent(INSPECTOR))
    expect(read.status, read.raw.slice(0, 400)).toBe(200)
    const submission = read.body['submission'] as { id: string; seal: { hash: string; git: { commit: string; forkBase: string } } }
    const changed = [`work/${handle}.txt`]
    const changes = changed.map((path) => ({ path, changes: `Synthetic work of ${handle}.` }))
    const base = { ref: submission.seal.git.forkBase, how: 'fork point', says: 'The sealed fork base.' }
    const whatWasRead = { sealKind: 'git', worktree: round.dir, tip: submission.seal.git.commit, ofItsOwn: true, sealId: submission.id, sealHash: submission.seal.hash, says: 'Read the exact seal.' }
    const prompt = await call('POST', `/api/checks/${round.run}/prompt`, asAgent(INSPECTOR), { changes, base })
    expect(prompt.status, prompt.raw.slice(0, 400)).toBe(200)
    const assembled = await call('POST', `/api/checks/${round.run}/assembled`, asAgent(INSPECTOR), { changes, base, read: whatWasRead })
    expect(assembled.status, assembled.raw.slice(0, 400)).toBe(201)
    const released = await call('POST', `/api/checks/${round.run}`, asAgent(INSPECTOR), {
      verdict: 'released', traced: syntheticTrace(t, changed), check: 'Synthetic: a check of a made-up round; no model judged work.', missing: [], chaptersRead: [], read: whatWasRead,
    })
    expect(released.status, released.raw.slice(0, 600)).toBe(201)
    return released.body
  }
  /** A round sealed and released, with a new brief written before the seal. */
  async function aReleasedRound(handle: string, beforeTheRelease: (round: Round) => void | Promise<void> = aNewBrief) {
    const round = await aRound(handle)
    await beforeTheRelease(round)
    await seal(round, handle)
    const reply = await release(round, handle)
    return { round, reply }
  }
  const theNote = (run: string) => stored(run)['atTheSeal']?.['nextRound']
  /** The worker's list of rounds to start, by the run each continues. */
  const theWorkersList = async () => {
    const listed = await call('GET', '/api/worker/rounds', asTheWorker)
    expect(listed.status, listed.raw).toBe(200)
    return listed.body['rounds'] as { run: string; agentId: string; handle: string; runtime: string | null }[]
  }
  /** A live process row of a run: this test's own process, registered at the ledger's door so it reads alive. */
  async function aLiveProcessRow(run: string, workspace = 'default'): Promise<string> {
    const r = await call('POST', '/api/resources', { ...asPerson, 'x-mole-office-workspace': workspace }, {
      sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'A synthetic process of this test',
      adopting: 'this test process stands for the made-up run’s own process, so the run reads as going',
    })
    expect(r.status, r.raw).toBe(201)
    return String(r.body['resource'].id)
  }
  const dropTheRow = (id: string): void => void t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(id)
  /** A run of `handle` going now, filed as a fixture, with the program it runs in and the model it names, if any. */
  function aRunGoing(handle: string, runtime: string, model: string | null, workspaceId = 'default'): string {
    return t.api.createRecord({
      kind: 'session', title: `Synthetic run of ${handle} in ${runtime}`, workspaceId, actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture',
      data: { state: 'running', servingAgent: handle, servingAgentId: ids[handle], runtime, ...(model === null ? {} : { model }), doing: 'a made-up run that stands for one going now; no model runs' },
    }).id
  }
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
    // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the verdict's chapters line is read against it.
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
    app = (await apiApp()).app
    asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, ...thePersonsKeyHeader() }
    asTheWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_WORKER_ID, ...theOfficesKeyHeader() }
    root = scratch('main')
    git(root, 'init', '-q', '-b', 'main'); asTheFixture(root)
    mkdirSync(join(root, 'work')); writeFileSync(join(root, 'work', 'a.txt'), 'before\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic baseline')
    await register(STARTER, asPerson, { workArea: ['work'], role: 'supervisor' })
    await register(INSPECTOR, asPerson, { role: 'inspector' })
    const elsewhere = await call('POST', '/api/workspaces', asPerson, { id: ELSEWHERE, title: 'A made-up second project' })
    expect(elsewhere.status, elsewhere.raw).toBe(201)
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT LEAVE THE GATE ON FOR THE NEXT ONE.
  afterEach(async () => {
    if (GATES.some((one) => one.id === THE_GATE)) await setTheGate(null)
  })
  afterAll(async () => {
    if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
    else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
    await app?.close(); t?.close()
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  it('1. asks for the next round at the release when the gate is on, with no merge line on, and not when it is off', async () => {
    // THE GATE OFF: nothing is asked, no note is written, and the gate counts it.
    const before = counted()
    const off = await aReleasedRound(await aLine('next-at-release-gate-off'))
    expect(stored(off.round.run)['nextRound']).toBeUndefined()
    expect(theNote(off.round.run)).toBeUndefined()
    expect(counted()).toBe(before + 1)

    // THE GATE ON: the office asks with the folder's briefs/NEXT.md, as itself, and the run keeps a note written at the
    // release, which the verdict's reply carries. The gate counts it. The seal, whose own gate is off, wrote nothing.
    await setTheGate('1')
    const { round, reply } = await aReleasedRound(await aLine('next-at-release-asked'))
    expect(stored(round.run)['nextRound']).toMatchObject({
      state: 'wanted',
      askedBy: { who: { id: await theOfficesId() }, as: 'the office' },
      brief: { path: round.sandbox.next, sha256: sha256(round.sandbox.next) },
      sandbox: { folder: round.sandbox.folder, container: round.sandbox.container },
    })
    const note = theNote(round.run)
    expect(note).toMatchObject({ outcome: 'asked', moment: 'release', brief: { path: round.sandbox.next, sha256: sha256(round.sandbox.next) }, at: expect.any(String) })
    expect(reply['nextRoundAtTheRelease']).toEqual(note)
    expect(counted()).toBe(before + 2)
    // THE ASK ENDS WITH THE CASE, written as the office writes a failed start, so it takes no place under the cap later.
    t.api.writeTheNextRound(round.run, { ...stored(round.run)['nextRound'], state: 'failed', failed: { at: '2026-10-30 10:00:00', says: 'Synthetic: the case is over.' } }, await asTheOfficeWritesIt())
  })

  it('2. asks for nothing while the line rests: the pause file is in the sandbox\'s briefs', async () => {
    const theLineRests = Reflect.get(await theSealModule(), 'THE_LINE_RESTS') as string | undefined
    expect(theLineRests, 'the office names the pause file in one place').toEqual(expect.any(String))
    await setTheGate('1')
    const { round } = await aReleasedRound(await aLine('next-at-release-rests'), (it) => {
      aNewBrief(it)
      writeFileSync(join(it.sandbox.briefs, theLineRests!), '# Synthetic: this line rests\n')
    })
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(theNote(round.run)).toMatchObject({ outcome: 'not-asked', moment: 'release', says: expect.stringContaining(theLineRests!) })
  })

  it('3. asks for nothing when a run of the agent was filed after the released one, even one with no sandbox', async () => {
    await setTheGate('1')
    const handle = await aLine('next-at-release-newer')
    let newer = ''
    const { round } = await aReleasedRound(handle, (it) => {
      aNewBrief(it)
      newer = aRunGoing(handle, 'claude-code', A_MADE_UP_CLAUDE_MODEL)
    })
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(theNote(round.run)).toMatchObject({ outcome: 'not-asked', moment: 'release', says: expect.stringContaining(newer) })
  })

  it('4. asks for nothing for an agent that holds no supervisor card', async () => {
    await setTheGate('1')
    const { round } = await aReleasedRound(await aLine('next-at-release-worker', 'worker'))
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(theNote(round.run)).toMatchObject({ outcome: 'not-asked', moment: 'release', says: expect.any(String) })
  })

  it('5. asks for nothing when NEXT.md was written before the run was filed', async () => {
    await setTheGate('1')
    const { round } = await aReleasedRound(await aLine('next-at-release-old-brief'), (it) => {
      aNewBrief(it)
      const filed = parseStoredStamp(t.api.getRecord(it.run)!.createdAt)
      expect(filed, 'the run was filed at a time that can be read').not.toBeNull()
      const anHourBefore = new Date(filed! - 60 * 60_000)
      utimesSync(it.sandbox.next, anHourBefore, anHourBefore)
    })
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(theNote(round.run)).toMatchObject({ outcome: 'not-asked', moment: 'release', says: expect.stringContaining(round.sandbox.next) })
  })

  it('6. keeps the ask while the cap of claude-code supervisors runs, counting only runs with a live process row, then starts it', async () => {
    const cap = Number(readSetting(THE_CAP, {}).value)
    expect(Number.isInteger(cap) && cap > 1, `${THE_CAP} declares a whole number above one`).toBe(true)
    await setTheGate('1')
    const asker = await aLine('next-at-release-cap')
    const model = await call('POST', `/api/office/run-models/agent/${ids[asker]}`, asPerson, { model: A_MADE_UP_CLAUDE_MODEL, variant: null })
    expect(model.status, model.raw).toBe(200)
    const { round } = await aReleasedRound(asker)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })

    // AS MANY SUPERVISORS IN CLAUDE-CODE AS THE CAP, each with a live process row. The last is in another project, and
    // the one before it names no model: the runtime is what uses the Claude login, whatever the model is called.
    const rows: string[] = []
    for (let i = 0; i < cap; i++) {
      const handle = await aLine(`next-at-release-claude-${i}`)
      const workspace = i === cap - 1 ? ELSEWHERE : 'default'
      rows.push(await aLiveProcessRow(aRunGoing(handle, 'claude-code', i === cap - 2 ? null : A_MADE_UP_CLAUDE_MODEL, workspace), workspace))
    }
    // NONE OF THESE COUNTS. A claude-code supervisor run that reads running with no open process row, as a run whose
    // program died in an outage does; one whose only row is closed; three dsh supervisors, which are Claude Code against
    // DeepSeek and do not use the Claude login; and a claude-code worker.
    aRunGoing(await aLine('next-at-release-no-row'), 'claude-code', A_MADE_UP_CLAUDE_MODEL)
    const closed = await aLiveProcessRow(aRunGoing(await aLine('next-at-release-closed-row'), 'claude-code', A_MADE_UP_CLAUDE_MODEL))
    t.client.sqlite.prepare("UPDATE session_resources SET released_at = '2026-10-30 09:00:00' WHERE id = ?").run(closed)
    for (let i = 0; i < 3; i++) await aLiveProcessRow(aRunGoing(await aLine(`next-at-release-dsh-${i}`), 'dsh', A_MADE_UP_DEEPSEEK_MODEL))
    await aLiveProcessRow(aRunGoing(await aLine('next-at-release-claude-worker', 'worker'), 'claude-code', A_MADE_UP_CLAUDE_MODEL))

    // THE CAP IS MET: the list leaves the ask out and records the hold without a process wait.
    const kept = stored(round.run)['nextRound']
    expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
    const afterHold = stored(round.run)['nextRound']
    const { NEXT_ROUND_HELD_BY, theClaudeSupervisorCapSays } = await import('../src/shared/next-round.ts')
    expect(afterHold).toEqual({ ...kept, held: { since: expect.any(String), says: theClaudeSupervisorCapSays(cap, cap), by: NEXT_ROUND_HELD_BY.office } })
    expect(parseStoredStamp(afterHold.held.since)).not.toBeNull()
    expect(kept['waits']).toBeUndefined()

    // ONE SUPERVISOR IN CLAUDE-CODE IS GONE: the list holds the ask, and the starting door takes it.
    dropTheRow(rows[0]!)
    expect(await theWorkersList()).toContainEqual({ run: round.run, agentId: ids[asker], handle: asker, runtime: 'claude-code', workspaceId: 'default' })
    const launcher = await aLauncherRun(round.run)
    const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
    expect(starting.status, starting.raw).toBe(200)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'starting', starting: { wrapper: launcher } })
    for (const row of rows.slice(1)) dropTheRow(row)
  })

  it('7. releases the run when the ask throws, and the verdict door says why nothing was kept', async () => {
    await setTheGate('1')
    const { round, reply } = await aReleasedRound(await aLine('next-at-release-throws'), (it) => {
      aNewBrief(it)
      chmodSync(it.sandbox.next, 0o000)
      // THE FILE REALLY CANNOT BE READ HERE. A process that may read every file (root) would pass this case without
      // proving anything, so it fails instead.
      expect(() => readFileSync(it.sandbox.next), 'this test process may not read the brief either').toThrow(/EACCES/u)
    })
    chmodSync(round.sandbox.next, 0o600)
    // THE RELEASE STANDS: the door answered 201 (`release` checks it), and the run carries the release.
    expect(stored(round.run)[RELEASED]).toMatchObject({ by: expect.anything(), at: expect.any(String) })
    expect(reply['nextRoundAtTheRelease']).toEqual({ notKept: expect.stringContaining('EACCES') })
    expect(stored(round.run)['nextRound']).toBeUndefined()
  })

  it('8. refuses the worker\'s list in words while the cap is not a whole number 0 or above, and starts none at 0', async () => {
    await setTheGate('1')
    const { round } = await aReleasedRound(await aLine('next-at-release-cap-unread'))
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' } })
    const before = process.env[THE_CAP]
    try {
      for (const said of ['six', '-1', '2.5']) {
        process.env[THE_CAP] = said
        const refused = await call('GET', '/api/worker/rounds', asTheWorker)
        expect(refused.status, refused.raw).toBe(500)
        expect(refused.raw, `the refusal of ${JSON.stringify(said)} names the setting and its value`).toContain(`${THE_CAP} is ${JSON.stringify(said).replaceAll('"', '\\"')}`)
      }
      process.env[THE_CAP] = '0'
      expect((await theWorkersList()).map((one) => one.run)).not.toContain(round.run)
    } finally {
      if (before === undefined) delete process.env[THE_CAP]
      else process.env[THE_CAP] = before
    }
    // UNSET, THE CAP IS ITS DEFAULT AGAIN, and no supervisor in claude-code is left going from case 6.
    expect((await theWorkersList()).map((one) => one.run)).toContain(round.run)
  })
})

describe("the run's page says at which moment the office looked at the next round", () => {
  const AT = '2026-10-30 12:00:00'
  /** A made-up run whose note says the office asked nothing, with the moment given, or with none. */
  const aRun = (moment: string | undefined): PanelRecord => ({
    id: 'made-up-run',
    workspaceId: 'default',
    kind: 'session',
    title: 'A made-up run',
    summary: null,
    data: { state: 'finished', atTheSeal: { nextRound: { outcome: 'not-asked', ...(moment === undefined ? {} : { moment }), says: 'Made-up: the line rests.', at: AT } } },
    origin: 'fixture',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  })
  /** A heading read from the words table, failing by name when the table holds no string at the key. */
  function theHeading(key: string): string {
    const word = (englishWords() as unknown as Record<string, unknown>)[key]
    if (typeof word !== 'string' || word === '') throw new Error(`The words table holds no string at ${key}.`)
    return word
  }

  it('9. heads a note written at the release with the release, and every other note with the seal', async () => {
    // A WINDOW, so the page's modules that read a setting when they are imported can be imported here, and taken away after.
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    const windowBefore = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = { localStorage: storage, sessionStorage: storage, location: { hash: '', search: '' }, addEventListener: () => {}, removeEventListener: () => {} }
    try {
      vi.resetModules()
      const block = (await import('../src/web/components/MergeQueueAtTheSeal.tsx')) as typeof import('../src/web/components/MergeQueueAtTheSeal.tsx')
      const drawn = (moment: string | undefined) => {
        const run = aRun(moment)
        return renderToStaticMarkup(h(block.TheSealInTheQueue, { record: run, sections: sectionsOf({ ...run, relations: [] }) }))
      }
      const atTheRelease = theHeading('nextAtTheRelease.heading')
      const atTheSeal = theHeading('nextAtTheSeal.heading')
      expect(atTheRelease).not.toBe(atTheSeal)
      for (const [moment, heading, not] of [['release', atTheRelease, atTheSeal], ['seal', atTheSeal, atTheRelease], [undefined, atTheSeal, atTheRelease]] as const) {
        const html = drawn(moment)
        expect(html, `the note written at ${moment ?? 'no named moment'} was not drawn`).toContain('data-next-at-the-seal="not-asked"')
        expect(html, `the note written at ${moment ?? 'no named moment'}`).toContain(`>${heading}</h3>`)
        expect(html, `the note written at ${moment ?? 'no named moment'}`).not.toContain(`>${not}</h3>`)
      }
    } finally {
      if (windowBefore === undefined) delete (globalThis as { window?: unknown }).window
      else (globalThis as { window?: unknown }).window = windowBefore
    }
  })
})
