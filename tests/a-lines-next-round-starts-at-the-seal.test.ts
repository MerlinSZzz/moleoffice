// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/** Prove automatic next rounds in made-up offices and repositories so no live work is touched. */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GATES } from '../src/config/gates.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'

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
  const fakeEntries: string[] = []
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
  function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim() }
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
  function giveOwnership(handle: string, owner = SECRETARY): void {
    setFixtureOwner(t.client.sqlite, ids[owner]!, ids[handle]!, 'id')
  }
  async function ownerFailureReason(handle: string): Promise<string> {
    const { readParticipant } = await import('../src/server/db/read-participant.ts')
    const { whoIsToldOfTheRun } = await import('../src/server/lib/who-is-told-of-a-seal.ts')
    const agent = readParticipant({ kind: 'agent', id: ids[handle]! })
    if (agent === null || !('startedBy' in agent)) throw new Error('The test agent is missing.')
    const result = whoIsToldOfTheRun(agent)
    if (!('because' in result)) throw new Error('The test agent unexpectedly has an owner.')
    return result.because
  }
  /** A supervisor retains its starter; duties cases leave its owner empty when the field exists. */
  async function aLine(handle: string, on = true, owned = false): Promise<string> {
    await register(handle, asAgent(STARTER), { workArea: ['work'], role: 'supervisor' })
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (!owned && columns.some((column) => column.name === 'owner_id')) {
      setFixtureOwner(t.client.sqlite, null, ids[handle]!, 'id')
    }
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
  /**
   * The round's agent writes its starter in the round's own session that its feature is ready, as the last word of a
   * round before its seal: the office asks for a sandbox round's check, and so for its next round, only when a whole
   * feature is done.
   */
  function theRoundSaysItsFeatureIsReady(round: Round, handle: string): string {
    return t.api.createRecord({
      kind: 'message', title: `Synthetic word of ${handle} to its starter`, workspaceId: 'default', actor: { type: 'agent', id: ids[handle]!, sessionId: round.run },
      data: { to: [{ kind: 'agent', id: ids[STARTER]! }], body: `${FEATURE_READY} the synthetic work of ${handle} is done.\nI seal next.` },
    }).id
  }
  /** Seal the round at the record door as its agent, as a round ends, after its last word to its starter. */
  async function seal(round: Round, handle: string) {
    theRoundSaysItsFeatureIsReady(round, handle)
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
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    copyTheDefaultRegulationsOnce()
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
    await register('synthetic-inspector', asPerson, { role: 'inspector' })
  }, 60_000)
  // A CASE THAT FAILED HALF WAY DOES NOT HOLD THE LANE OR LEAVE A GATE ON FOR THE NEXT ONE.
  afterEach(async () => {
    for (const id of fakeEntries.splice(0)) t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run('2026-10-25 10:00:00', id)
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

  /** A synthetic duties record in this test office. */
  function duties(lines: string[], secretary = SECRETARY, workspaceId = 'default'): string {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic duties record', workspaceId, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' })
    t.client.sqlite.prepare('UPDATE records SET kind = ?, data = ? WHERE id = ?').run('secretary_duties', JSON.stringify({ secretary: { kind: 'agent', id: ids[secretary] }, area: 'Synthetic area', lines, restsOn: [] }), record.id)
    return record.id
  }

  /** The synthetic notices for one run, in filing order. */
  function messagesAbout(run: string): { body?: string; to?: { kind: string; id: string }[] }[] {
    const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid").all(run) as { data: string }[]
    return rows.map((row) => JSON.parse(row.data))
  }

  it('starts a git-sealed next round at main and tells its secretary once', async () => {
    await import('../src/server/lib/the-line-next-round.ts')
    await setGates({ 'next-round-at-the-seal': '1', 'queue-at-the-seal': '1', 'queue-waits-for-the-line': '1' })
    const row = await call('POST', '/api/casting/supervisor', asPerson, { program: { value: 'claude-code' }, model: { value: A_MADE_UP_MODEL }, effort: { value: null } })
    expect(row.status, row.raw).toBe(201)
    const casting = Number(row.body['casting'].id)
    const marked = await call('POST', `/api/casting/rows/${casting}/mark`, asPerson)
    expect(marked.status, marked.raw).toBe(200)
    const handle = await aLine('wave-synthetic-supervisor')
    giveOwnership(handle)
    duties(['synthetic'])
    const prior = await aRound(handle, null, 'synthetic-prior')
    const entry = t.api.createRecord({ kind: 'note', title: 'Synthetic waiting entry', workspaceId: 'default', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' }).id
    fakeEntries.push(entry)
    t.client.sqlite.prepare('UPDATE records SET kind = ?, data = ? WHERE id = ?').run('merge_entry', JSON.stringify({ run: prior.run, state: 'submitted' }), entry)
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, '# Synthetic next round\n')
    await seal(round, handle)
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'the office' }, row: { id: casting }, brief: { path: round.sandbox.next, sha256: sha256(round.sandbox.next) } })
    expect(stored(round.run)['atTheSeal']?.['queued']).toMatchObject({ outcome: 'waits', for: 'an-earlier-entry', entry })
    writeFileSync(join(root, 'work', 'main-after.txt'), 'Synthetic main advance\n')
    git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main advance')
    const main = git(root, 'rev-parse', 'refs/heads/main')
    const tip = git(round.dir, 'rev-parse', 'HEAD')
    expect(main).not.toBe(tip)
    const launcher = await aLauncherRun(round.run)
    const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
    expect(starting.status, starting.raw).toBe(200)
    expect(starting.body['round']).toMatchObject({ cutFrom: main, worktree: expect.any(String) })
    expect(starting.body['round']['tip']).toBeUndefined()
    const worktree = starting.body['round']['worktree'] as string
    mkdirSync(join(round.dir, '.git', 'objects', 'info'), { recursive: true })
    writeFileSync(join(round.dir, '.git', 'objects', 'info', 'alternates'), join(root, '.git', 'objects') + '\n')
    mkdirSync(join(round.sandbox.folder, 'worktrees'), { recursive: true })
    git(round.dir, 'worktree', 'add', '--detach', worktree, main)
    const file = (workingDirectory: string, cutFrom: string) => call('POST', '/api/records', { ...asTheWorker, 'x-mole-office-session': launcher }, {
      kind: 'session', title: 'Synthetic next round',
      data: { state: 'running', runtime: 'claude-code', model: A_MADE_UP_MODEL, servingAgent: handle, servingAgentId: ids[handle], workingDirectory, cutFrom, parentAttachment: launcher, sandbox: sandboxField(round.sandbox) },
      links: [{ type: 'derived_from', toId: round.run }],
    })
    expect((await file(round.dir, main)).status).toBe(409)
    expect((await file(worktree, tip)).status).toBe(409)
    git(worktree, 'checkout', '--detach', tip)
    expect((await file(worktree, main)).status).toBe(409)
    git(worktree, 'checkout', '--detach', main)
    const filed = await file(worktree, main)
    expect(filed.status, filed.raw).toBe(201)
    const next = String(filed.body['record'].id)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Run ${next} started after run ${round.run} with brief ${round.sandbox.next}.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[SECRETARY] }])
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(main)
  })

  it('does not ask for a records-only seal and says why', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-records-supervisor')
    const round = await aRound(handle)
    // A RECORDS-ONLY ROUND HOLDS NO COMMIT PAST ITS CUT: a records seal over one is refused and told to declare mixed, so
    // this round's working directory goes back to main before it finishes.
    git(round.dir, 'switch', '-q', 'main')
    writeFileSync(round.sandbox.next, '# Synthetic next round\n')
    const note = await call('POST', '/api/records', asPerson, { kind: 'note', title: 'Synthetic submitted note' })
    expect(note.status, note.raw).toBe(201)
    theRoundSaysItsFeatureIsReady(round, handle)
    const finished = await call('PATCH', `/api/records/${round.run}`, asAgent(handle), { dataPatch: { state: 'finished', submission: { kind: 'records', records: [String(note.body['record'].id)] } } })
    expect(finished.status, finished.raw).toBe(200)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked', says: `Run ${round.run} was sealed with records only. The office asked for no next round.` })
  })

  it('keeps an ask-first brief for the secretary and shows the first physical line', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-askfirst-supervisor')
    giveOwnership(handle)
    duties(['askfirst'])
    const round = await aRound(handle)
    const line = '# **Ask the secretary first** about this synthetic brief'
    writeFileSync(round.sandbox.next, line + '\r\nSecond line.\n')
    await seal(round, handle)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['nextRound']).toMatchObject({ outcome: 'not-asked' })
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain(JSON.stringify(line))
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[SECRETARY] }])
  })

  it('reads only the first line and accepts its leading BOM', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    for (const [name, text, blocked] of [
      ['bom', '\uFEFF  Ask the secretary first about this brief.\n', true],
      ['later', '# Synthetic opening\nAsk the secretary first after that.\n', false],
      ['blank', '\nAsk the secretary first after that.\n', false],
    ] as const) {
      const handle = await aLine(`wave-${name}-supervisor`)
      duties([name])
      const round = await aRound(handle)
      writeFileSync(round.sandbox.next, text)
      await seal(round, handle)
      expect(stored(round.run)['atTheSeal']?.['nextRound']?.outcome).toBe(blocked ? 'not-asked' : 'asked')
      expect(stored(round.run)['nextRound'] === undefined).toBe(blocked)
    }
  })

  it('does not tell the secretary for an ask-first brief outside the sandbox', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-outside-supervisor')
    duties(['outside'])
    const round = await aRound(handle)
    const outside = join(scratch('outside'), 'brief.md')
    writeFileSync(outside, 'Ask the secretary first about this synthetic brief.\n')
    symlinkSync(outside, round.sandbox.next)
    await seal(round, handle)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain('is not inside the sandbox folder')
    expect(messagesAbout(round.run).filter((message) => message.body?.startsWith(`Brief ${round.sandbox.next} asks`))).toHaveLength(0)
  })

  it('keeps a final carriage return when there is no line feed', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-finalcr-supervisor')
    duties(['finalcr'])
    const round = await aRound(handle)
    const first = 'Ask the secretary first\r'
    writeFileSync(round.sandbox.next, first)
    await seal(round, handle)
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain(`is ${JSON.stringify(first)}.`)
  })

  it('leaves a held line and pause file alone, and a secretary can ask by hand', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const off = await aLine('wave-held-supervisor', false)
    const hold = await call('POST', '/api/merge-queue/lines', asAgent(SECRETARY), { agent: off, on: false, because: 'Synthetic hold.' })
    expect(hold.status, hold.raw).toBe(200)
    const offRound = await aRound(off)
    writeFileSync(offRound.sandbox.next, '# Synthetic next round\n')
    await seal(offRound, off)
    expect(stored(offRound.run)['nextRound']).toBeUndefined()
    const hand = await call('POST', `/api/agents/${off}/next-round`, asAgent(SECRETARY), { brief: offRound.sandbox.next })
    expect(hand.status, hand.raw).toBe(202)
    expect(stored(offRound.run)['nextRound']).toMatchObject({ state: 'wanted', askedBy: { as: 'a secretary' } })
    const resting = await aLine('wave-resting-supervisor')
    const restRound = await aRound(resting)
    writeFileSync(restRound.sandbox.next, '# Synthetic next round\n')
    writeFileSync(join(restRound.sandbox.folder, 'briefs', 'NEXT-held-the-line-rests.md'), 'Synthetic pause.\n')
    await seal(restRound, resting)
    expect(stored(restRound.run)['nextRound']).toBeUndefined()
    expect(stored(restRound.run)['atTheSeal']?.['nextRound']?.says).toContain('NEXT-held-the-line-rests.md')
  })

  it('says no owner was told when no owner is recorded', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-unmatched-supervisor')
    duties(['unmatched-extra'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain(await ownerFailureReason(handle))
    expect(messagesAbout(round.run).filter((message) => message.body?.startsWith(`Brief ${round.sandbox.next} asks`))).toHaveLength(0)
  })

  it('tells the owner when two duties records name the line', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-duplicate-supervisor')
    giveOwnership(handle, STARTER)
    duties(['duplicate']); duties(['duplicate'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])
  })

  it('tells the owner when a duties reference is missing', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-unavailable-supervisor')
    giveOwnership(handle)
    const duty = duties(['unavailable'])
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.secretary.id', ?) WHERE id = ?").run('synthetic-missing-secretary', duty)
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[SECRETARY] }])
  })

  it('tells the owner when duties name a retired secretary', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    await register('synthetic-retired-secretary', asPerson, { role: 'secretary' })
    const handle = await aLine('wave-retiredsecretary-supervisor')
    giveOwnership(handle)
    duties(['retiredsecretary'], 'synthetic-retired-secretary')
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(ids['synthetic-retired-secretary'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[SECRETARY] }])
  })

  it('tells the owner despite a bracketed duties name', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('synthetic-map-lead')
    giveOwnership(handle, STARTER)
    duties(['Synthetic map (synthetic-map-lead)'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])
  })

  it('does not infer an owner from a near duties name', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-odd-anything')
    duties(['odd', 'Synthetic map (wave-odd-anything-more)'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain(await ownerFailureReason(handle))
    expect(messagesAbout(round.run).filter((message) => message.body?.startsWith(`Brief ${round.sandbox.next} asks`))).toHaveLength(0)
  })

  /** Assemble and write a synthetic verdict without starting an inspector. */
  async function verdict(round: Round, handle: string, result: 'released' | 'refused') {
    const inspector = asAgent('synthetic-inspector')
    const read = await call('GET', `/api/checks/${round.run}`, inspector)
    expect(read.status, read.raw).toBe(200)
    const submission = read.body['submission'] as { id: string; seal: { hash: string; git: { commit: string; forkBase: string } } }
    const changed = [`work/${handle}.txt`]
    const changes = changed.map((path) => ({ path, changes: 'Synthetic change.' }))
    const base = { ref: submission.seal.git.forkBase, how: 'fork point', says: 'Synthetic fork point.' }
    const whatWasRead = { sealKind: 'git', worktree: round.dir, tip: submission.seal.git.commit, ofItsOwn: true, sealId: submission.id, sealHash: submission.seal.hash, says: 'Read the synthetic seal.' }
    const prompt = await call('POST', `/api/checks/${round.run}/prompt`, inspector, { changes, base })
    expect(prompt.status, prompt.raw).toBe(200)
    const assembled = await call('POST', `/api/checks/${round.run}/assembled`, inspector, { changes, base, read: whatWasRead })
    expect(assembled.status, assembled.raw).toBe(201)
    const checked = await call('POST', `/api/checks/${round.run}`, inspector, {
      verdict: result, traced: syntheticTrace(t, changed), check: 'Synthetic check.', missing: result === 'refused' ? ['A synthetic missing condition.'] : [], ...(result === 'refused' ? { says: { chapter: 5 } } : {}), chaptersRead: [], read: whatWasRead,
    })
    expect(checked.status, checked.raw).toBe(201)
    return checked.body
  }

  it('asks nothing on a refused seal and preserves the ask after a later refusal', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-verdict-supervisor')
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, '# Synthetic next round\n')
    const changed = join(round.dir, 'work', `${handle}.txt`)
    writeFileSync(changed, 'Synthetic dirty edit.\n')
    const denied = await call('PATCH', `/api/records/${round.run}`, asAgent(handle), { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
    expect(denied.status).not.toBe(200)
    expect(stored(round.run)['nextRound']).toBeUndefined()
    expect(stored(round.run)['atTheSeal']?.['nextRound']).toBeUndefined()
    writeFileSync(changed, `Synthetic work of ${handle}\n`)
    await seal(round, handle)
    const before = stored(round.run)['nextRound']
    expect(before).toMatchObject({ state: 'wanted' })
    await verdict(round, handle, 'refused')
    expect(stored(round.run)['nextRound']).toEqual(before)
    expect(messagesAbout(round.run).some((message) => message.to?.some((to) => to.id === ids[handle]) && message.body?.includes('A synthetic missing condition.'))).toBe(true)
  })

  it('tells the secretary once when the same ask-first run seals and later releases', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const gate = GATES.find((one) => one.id === 'next-round-at-the-release')!
    const setting = await call('POST', '/api/office/settings', asPerson, { changes: [{ name: gate.setting, value: '1' }], because: 'Synthetic release case.' })
    expect(setting.status, setting.raw).toBe(200)
    const handle = await aLine('wave-once-supervisor')
    giveOwnership(handle)
    duties(['once'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    try {
      await seal(round, handle)
      await verdict(round, handle, 'released')
      expect(stored(round.run)['nextRound']).toBeUndefined()
      expect(messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)).toHaveLength(1)
    } finally {
      await call('POST', '/api/office/settings', asPerson, { changes: [{ name: gate.setting, value: null }], because: 'Synthetic case is over.' })
    }
  })

  /** Start a synthetic round at current main without launching a model. */
  async function fileSyntheticNextRound(round: Round, handle: string): Promise<string> {
    const main = git(root, 'rev-parse', 'refs/heads/main')
    const launcher = await aLauncherRun(round.run)
    const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
    expect(starting.status, starting.raw).toBe(200)
    expect(starting.body['round']['cutFrom']).toBe(main)
    const worktree = starting.body['round']['worktree'] as string
    mkdirSync(join(round.dir, '.git', 'objects', 'info'), { recursive: true })
    writeFileSync(join(round.dir, '.git', 'objects', 'info', 'alternates'), join(root, '.git', 'objects') + '\n')
    mkdirSync(join(round.sandbox.folder, 'worktrees'), { recursive: true })
    git(round.dir, 'worktree', 'add', '--detach', worktree, main)
    const filed = await call('POST', '/api/records', { ...asTheWorker, 'x-mole-office-session': launcher }, {
      kind: 'session', title: 'Synthetic next round',
      data: { state: 'running', runtime: 'claude-code', model: A_MADE_UP_MODEL, servingAgent: handle, servingAgentId: ids[handle], workingDirectory: worktree, cutFrom: main, parentAttachment: launcher, sandbox: sandboxField(round.sandbox) },
      links: [{ type: 'derived_from', toId: round.run }],
    })
    expect(filed.status, filed.raw).toBe(201)
    return String(filed.body['record'].id)
  }

  it('tells the owner when the duties name a different secretary', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-owner-route-supervisor', true, true)
    duties(['owner-route'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])
    expect(String(stored(round.run)['atTheSeal']?.['nextRound']?.says ?? '').split('. ').at(-2)).toMatch(/owner/i)
  })

  it('sends the next round notice to the owner chosen before it starts', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const other = 'synthetic-new-owner'
    await register(other, asPerson, { role: 'secretary' })
    const handle = await aLine('wave-owner-change-supervisor', true, true)
    duties(['owner-change'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, '# Synthetic next brief\n')
    await seal(round, handle)
    const moved = await call('POST', `/api/agents/${ids[handle]}/owner`, asPerson, { owner: { kind: 'agent', id: ids[other] }, because: 'The responsibility moves for this test.' })
    expect(moved.status, moved.raw).toBe(200)
    const next = await fileSyntheticNextRound(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Run ${next} started after run ${round.run} with brief ${round.sandbox.next}.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[other] }])
  })

  it('tells the recorded person owner about the next round', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-person-owned-supervisor')
    t.client.sqlite.prepare("UPDATE agents SET owner_kind = 'person', owner_id = ? WHERE id = ?").run(THE_TEST_OFFICES_OWNER.id, ids[handle])
    duties(['person-owned'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }])
  })

  it('does not invent a recipient for an incomplete owner', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-incomplete-owner-supervisor')
    t.client.sqlite.prepare("UPDATE agents SET owner_kind = 'agent', owner_id = NULL WHERE id = ?").run(ids[handle])
    duties(['incomplete-owner'])
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    expect(stored(round.run)['atTheSeal']?.['nextRound']?.says).toContain(await ownerFailureReason(handle))
    expect(messagesAbout(round.run).filter((message) => message.body?.startsWith(`Brief ${round.sandbox.next} asks`))).toHaveLength(0)
  })

  it('explains an unresolved owner without blaming the duties record', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-owner-missing-supervisor', true, true)
    setFixtureOwner(t.client.sqlite, 'synthetic-missing-owner', ids[handle]!, 'id')
    duties(['owner-missing'])
    const { readParticipant } = await import('../src/server/db/read-participant.ts')
    const { whoIsToldOfTheRun } = await import('../src/server/lib/who-is-told-of-a-seal.ts')
    const { whyNoSecretaryWasTold } = await import('../src/server/lib/the-line-next-round.ts')
    const agent = readParticipant({ kind: 'agent', id: ids[handle]! })
    if (agent === null || !('startedBy' in agent)) throw new Error('The synthetic agent was not found.')
    const expected = whoIsToldOfTheRun(agent)
    if (!('because' in expected)) throw new Error('The synthetic owner unexpectedly resolved.')
    expect(whyNoSecretaryWasTold(agent, 'default')).toBe(expected.because)
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const note = String(stored(round.run)['atTheSeal']?.['nextRound']?.says ?? '')
    expect(note).toMatch(/owner/i)
    expect(note).not.toMatch(/duties/i)
    expect(messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)).toHaveLength(0)
  })

  it('keeps the owner recipient when duties are added or removed before start', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const addedHandle = await aLine('wave-added-supervisor')
    giveOwnership(addedHandle, STARTER)
    const added = await aRound(addedHandle)
    writeFileSync(added.sandbox.next, '# Synthetic next brief\n')
    await seal(added, addedHandle)
    duties(['added'])
    const newRun = await fileSyntheticNextRound(added, addedHandle)
    expect(stored(added.run)['atTheSeal']?.['nextRound']).not.toHaveProperty('says')
    const addedNotices = messagesAbout(added.run).filter((message) => message.body === `Run ${newRun} started after run ${added.run} with brief ${added.sandbox.next}.`)
    expect(addedNotices).toHaveLength(1)
    expect(addedNotices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])

    const removedHandle = await aLine('wave-removed-supervisor')
    giveOwnership(removedHandle, STARTER)
    const duty = duties(['removed'])
    const removed = await aRound(removedHandle)
    writeFileSync(removed.sandbox.next, '# Synthetic next brief\n')
    await seal(removed, removedHandle)
    t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run('2026-10-25 10:00:00', duty)
    const otherRun = await fileSyntheticNextRound(removed, removedHandle)
    expect(stored(removed.run)['atTheSeal']?.['nextRound']).not.toHaveProperty('says')
    const removedNotices = messagesAbout(removed.run).filter((message) => message.body === `Run ${otherRun} started after run ${removed.run} with brief ${removed.sandbox.next}.`)
    expect(removedNotices).toHaveLength(1)
    expect(removedNotices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])
  })

  it('does not take another project’s duties as the owner', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const created = await call('POST', '/api/workspaces', asPerson, { id: 'synthetic-other-project', title: 'Synthetic other project' })
    expect(created.status, created.raw).toBe(201)
    const handle = await aLine('wave-crossproject-supervisor')
    giveOwnership(handle, STARTER)
    duties(['crossproject'], SECRETARY, 'synthetic-other-project')
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, 'Ask the secretary first about this synthetic brief.\n')
    await seal(round, handle)
    const notices = messagesAbout(round.run).filter((message) => message.body === `Brief ${round.sandbox.next} asks the secretary first.`)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.to).toEqual([{ kind: 'agent', id: ids[STARTER] }])
  })

  it('keeps the existing reasons in their exact words', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const suffix = ' The office asked for no next round.'
    const note = (round: Round) => stored(round.run)['atTheSeal']?.['nextRound']?.says

    const alreadyHandle = await aLine('wave-already-supervisor')
    const already = await aRound(alreadyHandle)
    writeFileSync(already.sandbox.next, '# Synthetic next brief\n')
    const own = await call('POST', `/api/agents/${alreadyHandle}/next-round`, asAgent(alreadyHandle), { brief: already.sandbox.next })
    expect(own.status, own.raw).toBe(202)
    const askedAt = stored(already.run)['nextRound'].askedAt
    await seal(already, alreadyHandle)
    expect(note(already)).toBe(`The next round after run ${already.run} was asked for already, at ${askedAt}, by Synthetic ${alreadyHandle} as the run’s agent, so the office asked for none.`)

    const workerHandle = 'wave-not-supervisor'
    await register(workerHandle, asAgent(STARTER), { workArea: ['work'], role: 'worker' })
    const switched = await call('POST', '/api/merge-queue/lines', asPerson, { agent: workerHandle, on: true, repository: REPOSITORY, because: 'Synthetic case.' })
    expect(switched.status, switched.raw).toBe(200)
    const worker = await aRound(workerHandle)
    writeFileSync(worker.sandbox.next, '# Synthetic next brief\n')
    await seal(worker, workerHandle)
    expect(note(worker)).toBe(`${workerHandle} holds the worker card, and the office asks only for a supervisor's next round.${suffix}`)

    const noSandboxHandle = await aLine('wave-nosandbox-supervisor')
    const noSandbox = await aRound(noSandboxHandle)
    writeFileSync(noSandbox.sandbox.next, '# Synthetic next brief\n')
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.sandbox') WHERE id = ?").run(noSandbox.run)
    await seal(noSandbox, noSandboxHandle)
    expect(note(noSandbox)).toBe(`Run ${noSandbox.run} names no sandbox the office can vouch for, so the office cannot tell which file is the line's NEXT.md.${suffix}`)

    const restHandle = await aLine('wave-pause-supervisor')
    const rest = await aRound(restHandle)
    const restPath = join(rest.sandbox.folder, 'briefs', 'NEXT-held-the-line-rests.md')
    writeFileSync(restPath, 'Synthetic pause.\n')
    await seal(rest, restHandle)
    expect(note(rest)).toBe(`The line rests: ${restPath} is there.${suffix}`)

    const missingHandle = await aLine('wave-missing-supervisor')
    const missing = await aRound(missingHandle)
    await seal(missing, missingHandle)
    expect(note(missing)).toBe(`There is no brief at ${missing.sandbox.next}.${suffix}`)

    const linkedHandle = await aLine('wave-linked-supervisor')
    const linked = await aRound(linkedHandle)
    const heldPath = join(linked.sandbox.folder, 'briefs', 'NEXT-held-synthetic.md')
    writeFileSync(heldPath, 'Synthetic held brief.\n')
    symlinkSync(heldPath, linked.sandbox.next)
    await seal(linked, linkedHandle)
    expect(note(linked)).toBe(`${linked.sandbox.next} is the held brief NEXT-held-synthetic.md, which waits for an answer.${suffix}`)

    const directoryHandle = await aLine('wave-directory-supervisor')
    const directory = await aRound(directoryHandle)
    mkdirSync(directory.sandbox.next)
    await seal(directory, directoryHandle)
    expect(note(directory)).toBe(`${directory.sandbox.next} is not a plain file.${suffix}`)

    const unreadableHandle = await aLine('wave-unreadable-supervisor')
    const unreadable = await aRound(unreadableHandle)
    writeFileSync(unreadable.sandbox.next, '# Synthetic next brief\n')
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run('synthetic unreadable time', unreadable.run)
    await seal(unreadable, unreadableHandle)
    expect(note(unreadable)).toBe(`The time run ${unreadable.run} was filed, "synthetic unreadable time", cannot be read, so nobody can say whether ${unreadable.sandbox.next} is newer.${suffix}`)

    const oldHandle = await aLine('wave-old-supervisor')
    const old = await aRound(oldHandle)
    writeFileSync(old.sandbox.next, '# Synthetic next brief\n')
    const before = new Date(Date.now() - 60 * 60_000)
    utimesSync(old.sandbox.next, before, before)
    const filedAt = t.api.getRecord(old.run)!.createdAt
    await seal(old, oldHandle)
    expect(note(old)).toBe(`${old.sandbox.next} was written before run ${old.run} was filed, at ${filedAt}, so it is not the brief of the round after it.${suffix}`)

    const noPreviousHandle = await aLine('wave-first-supervisor')
    const noPrevious = await aRound(noPreviousHandle, null)
    writeFileSync(noPrevious.sandbox.next, '# Synthetic next brief\n')
    await seal(noPrevious, noPreviousHandle)
    expect(note(noPrevious)).toBe(`No record names the brief run ${noPrevious.run} started with, so the office cannot tell whether ${noPrevious.sandbox.next} is a new one.${suffix}`)

    const sameHandle = await aLine('wave-same-supervisor')
    const firstBrief = '# Synthetic unchanged brief\n'
    const same = await aRound(sameHandle, firstBrief)
    writeFileSync(same.sandbox.next, firstBrief)
    await seal(same, sameHandle)
    expect(note(same)).toBe(`${same.sandbox.next} is still the brief run ${same.run} started with.${suffix}`)

    const newerHandle = await aLine('wave-newer-supervisor')
    const older = await aRound(newerHandle)
    writeFileSync(older.sandbox.next, '# Synthetic next brief\n')
    const newer = t.api.createRecord({ kind: 'session', title: 'Synthetic newer run', workspaceId: 'default', actor: { type: 'agent', id: ids[STARTER]! }, origin: 'fixture', data: { state: 'running', servingAgent: newerHandle, servingAgentId: ids[newerHandle], runtime: 'claude-code', doing: 'Synthetic newer run.' } }).id
    await seal(older, newerHandle)
    expect(note(older)).toBe(`Run ${older.run} is not the newest run of ${newerHandle}: run ${newer} is, so its next round has begun or is somebody else's to ask.${suffix}`)

    const deniedHandle = await aLine('wave-doorrefusal-supervisor')
    const denied = await aRound(deniedHandle)
    writeFileSync(denied.sandbox.next, '# Synthetic next brief\n')
    process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'off'
    try {
      await seal(denied, deniedHandle)
      expect(note(denied)).toBe(`The next-round door refused: The office starts no message worker (MOLE_OFFICE_MESSAGE_WORKER=off), so nothing would start this round. Nothing was written.${suffix}`)
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
  })

  it('fails in words if the line no longer names a repository before the start', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-norepository-supervisor')
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, '# Synthetic next brief\n')
    await seal(round, handle)
    const held = await call('POST', '/api/merge-queue/lines', asAgent(SECRETARY), { agent: handle, on: false, because: 'Synthetic hold.' })
    expect(held.status, held.raw).toBe(200)
    const launcher = await aLauncherRun(round.run)
    const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
    expect(starting.status, starting.raw).toBe(409)
    expect(starting.body['error']).toBe('The next round cannot be cut from current main: the line names no repository. The ask is now failed. Nothing was started.')
    expect(stored(round.run)['nextRound']).toMatchObject({ state: 'failed' })
  })

  it('fails the ask in words when source main cannot be read', async () => {
    await setGates({ 'next-round-at-the-seal': '1' })
    const handle = await aLine('wave-nomain-supervisor')
    const round = await aRound(handle)
    writeFileSync(round.sandbox.next, '# Synthetic next brief\n')
    await seal(round, handle)
    const change = t.client.sqlite.prepare('UPDATE repositories SET root = ? WHERE name = ?')
    change.run(null, REPOSITORY)
    try {
      const launcher = await aLauncherRun(round.run)
      const starting = await call('POST', `/api/worker/rounds/${round.run}/starting`, asTheWorker, { wrapper: launcher })
      expect(starting.status, starting.raw).toBe(409)
      expect(starting.body['error']).toBe('The next round cannot be cut from current main: the repository names no checkout. The ask is now failed. Nothing was started.')
      expect(stored(round.run)['nextRound']).toMatchObject({ state: 'failed' })
    } finally {
      change.run(root, REPOSITORY)
    }
  })
})
