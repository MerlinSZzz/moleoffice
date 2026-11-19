// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER RUN ASKED IN ANOTHER PROJECT IS STARTED (wave 13n round BZ). The message worker read the worker runs wanted in
 * its own project only, the project its requests name, and the two run doors refused a run filed in any other. A
 * supervisor that filed its ask in another project waited for ever. Now the worker serves every project on the office's
 * list: it reads the worker runs wanted in each, and serves an ask in the project the asking run is filed in. The doors
 * read the run in its own project, whatever project the request names, after the office's key is checked. A run filed in
 * a project that is not on the list is refused in words.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the second project, the sandbox folder, its repository
 * (tests/a-made-up-sandbox-repo.ts) and its container row, the agents, every Casting row and every model name. No real
 * worker is started, and no model is run. The launcher is a script written below, named by
 * MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which keeps what it was given and files the worker's run through the real
 * tools/file-a-run.mjs, and starts nothing. The message worker's agent runtime is a script that refuses, so a run it
 * started would show. Two runs are put by SQL into places that are not on the office's list, a project nobody made and
 * the message centre, because no door files a run there; a process row of a worker's run is put in by SQL as well.
 *
 * WHAT IS PROVED
 *   1. A caller without the office's key gets one 403 at both doors, the same for a run in the other project, a run off
 *      the list and an id nothing holds, and nothing is written. A run filed off the list is not listed, and both doors
 *      refuse it to the message worker in words, writing nothing.
 *   2. One pass of a message worker whose own project is the default starts an ask filed in the other project. Its
 *      launcher run, the worker's run and the launcher's process row are filed in that project, the launcher is given
 *      that project, and the start reads that project's Casting row, which differs from the default's in its effort.
 *      An ask in the worker's own project is started as before: its row names its project, its launcher run is filed
 *      there under the worker's own run, and its start reads the default's row.
 *   3. Asked with the default project in the header, the starting door starts a run of the other project there, and
 *      the ending door finds that run's worker's process row there.
 *
 * THE MUTATIONS, AFTER A CONTROL RUN, each alone, restored and checked with cmp, are named in the round's report.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** This worktree, read for the real tools/file-a-run.mjs and for the commit the made-up sandbox's `main` stands at. */
const THIS_WORKTREE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
/** The message worker's own project. */
const OWN = 'default'
/** The other project on the office's list, made below. */
const FAR = 'xp-far-project'
/** A project nobody made, so it is not on the office's list. */
const OFF_THE_LIST = 'xp-a-project-nobody-made'
const MESSAGE_CENTRE = 'message-centre'
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/** A model name made up for this run, cast by a row in each project, with a different effort in each. */
const A_MODEL = `made-up-${randomUUID().slice(0, 8)}`
const THE_OWN_EFFORT = 'high'
const THE_FAR_EFFORT = 'medium'

/**
 * THE SYNTHETIC LAUNCHER. It keeps what it was given, without the key, and files the worker's run through the real
 * tools/file-a-run.mjs under the launcher run, with the supervisor's run as its parent, in the project it was given.
 * It starts no container and no agent.
 */
const FAKE_LAUNCHER = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileARun } from ${JSON.stringify(join(THIS_WORKTREE, 'tools/file-a-run.mjs'))}
import { anAgentsToolHeaders } from ${JSON.stringify(join(THIS_WORKTREE, 'for-agents/agent-key.mjs'))}
const argv = process.argv.slice(2)
const flag = (name) => { const at = argv.indexOf(name); return at === -1 ? null : argv[at + 1] }
const capture = { argv }
const keep = () => writeFileSync(join(process.env.WORKER_RUN_CAPTURES, flag('--session') + '.json'), JSON.stringify(capture))
keep()
if (argv[0] !== 'worker') { process.stderr.write('The made-up launcher starts workers only, and was asked for ' + argv[0] + '.\\n'); process.exit(4) }
const api = flag('--api'), workspace = flag('--workspace'), as = flag('--as'), session = flag('--session'), parent = flag('--parent')
const headers = { 'x-mole-office-workspace': workspace, ...anAgentsToolHeaders({ self: as, withoutAKey: as }) }
const supervisors = (await (await fetch(api + '/api/records/' + parent, { headers })).json()).record
const filed = fileARun({
  api, workspace, as, session, parent, handle: flag('--agent'), worktree: supervisors.data.workingDirectory,
  cutFrom: supervisors.data.cutFrom, runtime: flag('--runtime'), model: flag('--model'),
  title: 'A made-up worker run of ' + flag('--agent'), sandbox: supervisors.data.sandbox,
})
capture.filed = filed.ok ? { ok: true, id: filed.id } : { ok: false, says: filed.says }
keep()
if (!filed.ok) { process.stderr.write('The made-up launcher could not file the run: ' + filed.says + '\\n'); process.exit(1) }
process.stdout.write('The made-up launcher filed run ' + filed.id + '.\\n')
`

/** The message worker's agent runtime. No agent run is due in this file, so one that starts fails loudly and shows. */
const NO_AGENT_RUN = `process.stderr.write('A made-up agent runtime: no agent run was due in this test.\\n'); process.exit(9)\n`

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let captures: string
let checkout: string
let settings: WorkerSettings
let workerModeBefore: string | undefined

const asThePerson = (workspace = OWN): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
})
const asAgent = (handle: string, workspace: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const asTheWorker = (workspace = OWN): Record<string, string> => asAgent(THE_WORKER_ID, workspace, A_MADE_UP_OFFICE_KEY)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const { 'content-type': _type, ...withoutAType } = headers
  const r = await app.inject({ method, url, headers: payload === undefined ? withoutAType : headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, by: Record<string, string> = asThePerson(), role?: string): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key })
}
const asOne = (handle: string, workspace = OWN): Record<string, string> => asAgent(handle, workspace, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

/** A record's row as stored: its project and its data. */
function rowOf(id: string): { workspaceId: string; data: Record<string, any>; updatedAt: string } {
  const row = t.client.sqlite.prepare('SELECT workspace_id, data, updated_at FROM records WHERE id = ?').get(id) as { workspace_id: string; data: string; updated_at: string }
  return { workspaceId: row.workspace_id, data: JSON.parse(row.data) as Record<string, any>, updatedAt: row.updated_at }
}
const theWorkerRunOf = (run: string, handle: string): TheWorkerRun | undefined => (rowOf(run).data['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]
const howManyRecords = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
}

let folder = ''
let brief = ''
let container = ''
/** The message worker's own run, in its own project. */
let workersOwnRun = ''
/** Each supervisor's running run, with its run key. */
const supervisors = { own: { run: '', key: '' }, far: { run: '', key: '' } }
/** A run in the other project, a run off the list and a run in the message centre, each holding a wanted ask. */
let offTheList = ''
let inTheMessageCentre = ''

/** The supervisor's run, filed by the secretary from a terminal of its own in the same project, so the office mints its key. */
async function aSupervisorsRun(handle: string, workspace: string): Promise<{ run: string; key: string }> {
  const secretary = agents.get('xp-secretary')!
  const terminal = await call('POST', '/api/records', asOne('xp-secretary', workspace), { kind: 'session', title: 'The secretary in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  const run = await call('POST', '/api/records', asAgent('xp-secretary', workspace, secretary.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: `A made-up supervisor run of ${handle}`,
    data: {
      state: 'running', servingAgent: handle, servingAgentId: idOf(handle), runtime: 'claude-code', model: `${A_MODEL}-supervisor`,
      workingDirectory: THIS_WORKTREE, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  return { run: String(run.body['record'].id), key: String(run.body['runKey']?.key) }
}

/** Ask for a worker run as the supervisor, from its own run, with its own run key, in its run's project. */
async function anAsk(supervisor: string, of: { run: string; key: string }, workspace: string, worker: string): Promise<void> {
  const r = await call('POST', `/api/agents/${idOf(worker)}/worker-run`, asAgent(supervisor, workspace, of.key, of.run), { brief, runtime: 'claude-code', model: A_MODEL })
  expect(r.status, JSON.stringify(r.body)).toBe(202)
  expect(theWorkerRunOf(of.run, worker)?.state).toBe('wanted')
}

/** A run put by SQL into a place that is not on the office's list, holding a wanted ask for a worker. */
function aRunPutIn(workspace: string, worker: string): string {
  const run = t.api.createRecord({ kind: 'session', workspaceId: OWN, title: 'A made-up supervisor run, moved off the list', origin: 'fixture', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
  const entry = {
    state: 'wanted', askedAt: '2026-11-01 01:00:00', askedBy: { who: { kind: 'agent', id: 'made-up-asker' }, session: run }, handle: worker,
    brief: { path: '/made/up/brief.md', sha256: 'a'.repeat(64), bytes: 1 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' },
  }
  t.client.sqlite.prepare('UPDATE records SET workspace_id = ?, data = ? WHERE id = ?').run(workspace, JSON.stringify({ ...rowOf(run).data, workerRuns: { [idOf(worker)]: entry } }), run)
  return run
}

/** A launcher run of the message worker's own for a worker run, filed in the project given, as a pass makes one there. */
async function aLauncherRun(run: string, worker: string, workspace: string): Promise<string> {
  const filed = await call('POST', '/api/records', asTheWorker(workspace), {
    kind: 'session',
    title: `A made-up launcher run for ${worker}`,
    data: {
      state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: checkout,
      startedByMoleOffice: true, extra: { purpose: 'worker', run, worker: idOf(worker) },
    },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String(filed.body['record'].id)
}

/** A Casting row of the worker card for one project, as the person adds it. */
async function aRow(project: string, effort: string): Promise<void> {
  const r = await call('POST', '/api/casting/worker', asThePerson(), { project, program: { value: 'claude-code' }, model: { value: A_MODEL }, effort: { value: effort } })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
}

beforeAll(async () => {
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-asked-in-another-project-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })
  checkout = aCheckoutForATestRun()

  const project = await call('POST', '/api/workspaces', asThePerson(), { id: FAR, title: 'A made-up second project' })
  expect(project.status, JSON.stringify(project.body)).toBe(201)
  // A ROW OF THE WORKER CARD IN EACH PROJECT, casting the same program and model with a different effort, so a start
  // that reads the wrong project's row shows.
  await aRow(OWN, THE_OWN_EFFORT)
  await aRow(FAR, THE_FAR_EFFORT)

  await started('xp-secretary', asThePerson(), 'secretary')
  await started('xp-boss-own', asOne('xp-secretary'))
  // A SUPERVISOR AND ITS WORKERS ARE REGISTERED IN THE PROJECT THEY WORK IN, so the worker's run can be bound to its record there.
  await started('xp-boss-far', asOne('xp-secretary', FAR))
  for (const handle of ['xp-near', 'xp-off', 'xp-centre']) await started(handle, asOne('xp-boss-own'))
  for (const handle of ['xp-far', 'xp-door']) await started(handle, asOne('xp-boss-far', FAR))

  // A MADE-UP SANDBOX FOLDER with a brief in it, and the container row `tools/sandbox.mjs up` registers for it.
  folder = join(realpathSync(scratch), 'sandboxes', 'xp-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  aMadeUpSandboxRepo(folder, THIS_WORKTREE)
  container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-11-01 01:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-xp-sandbox', `Sandbox xp-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  supervisors.own = await aSupervisorsRun('xp-boss-own', OWN)
  supervisors.far = await aSupervisorsRun('xp-boss-far', FAR)
  offTheList = aRunPutIn(OFF_THE_LIST, 'xp-off')
  inTheMessageCentre = aRunPutIn(MESSAGE_CENTRE, 'xp-centre')

  // THE MESSAGE WORKER'S OWN RUN, which the server files for it in its own project.
  const own = await call('POST', '/api/records', asTheWorker(), {
    kind: 'session', title: 'The made-up message worker',
    data: { state: 'running', runtime: 'mole-office', doing: 'watching a made-up office', workingDirectory: checkout, startedByMoleOffice: true },
  })
  expect(own.status, JSON.stringify(own.body)).toBe(201)
  workersOwnRun = String(own.body['record'].id)

  const launcher = join(scratch, 'fake-worker-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api, workspace: OWN, session: workersOwnRun, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(scratch, 'runs'),
    env: { ...process.env, HOME: scratch, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: noAgentRun, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher, WORKER_RUN_CAPTURES: captures },
  }
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
  if (checkout !== undefined) rmSync(checkout, { recursive: true, force: true })
})

/** The words a run off the office's list is refused with, at either door. */
const notServed = (run: string, workspace: string): string =>
  `Run ${run} is filed in "${workspace}", which is not on the office's list of projects, so the message worker does not serve it. Nothing was written.`

describe('1. who is answered, and a run off the list', () => {
  beforeAll(async () => {
    await anAsk('xp-boss-far', supervisors.far, FAR, 'xp-far')
  })

  it('answers a caller without the office key with one 403 at both doors, whatever the run, and writes nothing', async () => {
    const before = { records: howManyRecords(), far: rowOf(supervisors.far.run).updatedAt }
    for (const [door, body, does] of [
      ['starting', { agent: idOf('xp-far'), wrapper: 'made-up-launcher' }, 'starts a worker run'],
      ['ended', { agent: idOf('xp-far'), wrapper: 'made-up-launcher', ok: false, says: 'A made-up ending.' }, "says how a worker run's launcher ended"],
    ] as const) {
      const words = `Only the office's message worker, with the office's key, ${does}. Nothing was written.`
      for (const [who, caller] of [['the person', asThePerson()], ['an agent with its own key', asOne('xp-boss-own')], ["the worker's name with no key", asAgent(THE_WORKER_ID, OWN)]] as const) {
        for (const run of [supervisors.far.run, offTheList, inTheMessageCentre, 'xp-no-record-holds-this-id']) {
          const r = await call('POST', `/api/worker/worker-runs/${run}/${door}`, caller, body)
          expect({ status: r.status, error: r.body['error'] }, `${door}, run ${run}, asked by ${who}`).toEqual({ status: 403, error: words })
        }
      }
    }
    expect(howManyRecords()).toBe(before.records)
    expect(rowOf(supervisors.far.run).updatedAt).toBe(before.far)
    expect(theWorkerRunOf(supervisors.far.run, 'xp-far')?.state).toBe('wanted')
  })

  it('does not list a run filed off the office list', async () => {
    const listed = await call('GET', '/api/worker/worker-runs', asTheWorker())
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const runs = (listed.body['workerRuns'] as { run: string }[]).map((row) => row.run)
    expect(runs).not.toContain(offTheList)
    expect(runs).not.toContain(inTheMessageCentre)
  })

  it('refuses a run filed off the office list at both doors, in words, and an id nothing holds, to the message worker, writing nothing', async () => {
    const before = howManyRecords()
    for (const [run, workspace, worker] of [[offTheList, OFF_THE_LIST, 'xp-off'], [inTheMessageCentre, MESSAGE_CENTRE, 'xp-centre']] as const) {
      const stored = rowOf(run)
      for (const [door, body] of [
        ['starting', { agent: idOf(worker), wrapper: 'made-up-launcher' }],
        ['ended', { agent: idOf(worker), wrapper: 'made-up-launcher', ok: false, says: 'A made-up ending.' }],
      ] as const) {
        const r = await call('POST', `/api/worker/worker-runs/${run}/${door}`, asTheWorker(), body)
        expect({ status: r.status, error: r.body['error'] }, `${door} for a run in ${workspace}`).toEqual({ status: 409, error: notServed(run, workspace) })
      }
      expect(rowOf(run)).toEqual(stored)
    }
    for (const door of ['starting', 'ended']) {
      const r = await call('POST', `/api/worker/worker-runs/xp-no-record-holds-this-id/${door}`, asTheWorker(), { agent: idOf('xp-far'), wrapper: 'made-up-launcher', ok: false, says: 'A made-up ending.' })
      expect(r.status, `${door} for an id nothing holds: ${JSON.stringify(r.body)}`).toBe(404)
    }
    expect(howManyRecords()).toBe(before)
  })
})

describe('2. one pass of a worker whose own project is the default', () => {
  const rounds: WatchingARound[] = []
  /** The rows the worker reads on its pass, read just before it. */
  let rows: unknown[] = []
  let first: Awaited<ReturnType<typeof onePass>>
  const wrapperOf = new Map<string, string>()
  const argvOf = (handle: string): string[] => (JSON.parse(readFileSync(join(captures, `${wrapperOf.get(idOf(handle))!}.json`), 'utf8')) as { argv: string[] }).argv
  const flagOf = (argv: string[], name: string): string | undefined => argv[argv.indexOf(name) + 1]

  beforeAll(async () => {
    await anAsk('xp-boss-own', supervisors.own, OWN, 'xp-near')
    // THE ROWS, as the worker reads them on its pass. Each case below asks of them what it needs.
    rows = ((await call('GET', '/api/worker/worker-runs', asTheWorker())).body['workerRuns'] ?? []) as unknown[]
    first = await onePass(settings, [], noMerges(), rounds)
    for (const one of first.workers?.started ?? []) wrapperOf.set(one.agentId, one.wrapper)
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
  }, 120_000)

  it('starts the ask filed in the other project, in that project, on that project’s row', () => {
    expect([...wrapperOf.keys()].sort(), 'the asks the pass started').toEqual([idOf('xp-far'), idOf('xp-near')].sort())
    expect(first.started, 'the pass started an agent run').toEqual([])
    expect(first.workers?.held, 'the pass held an ask').toEqual([])
    // THE LIST GOES PROJECT BY PROJECT, in the order of the office's list, and each row names its run's project.
    expect(rows).toEqual([
      { run: supervisors.own.run, agentId: idOf('xp-near'), handle: 'xp-near', workspaceId: OWN },
      { run: supervisors.far.run, agentId: idOf('xp-far'), handle: 'xp-far', workspaceId: FAR },
    ])
    const wrapper = rowOf(wrapperOf.get(idOf('xp-far'))!)
    expect(wrapper.workspaceId).toBe(FAR)
    expect(wrapper.data['parentAttachment'], 'the launcher run in the other project names a parent').toBeUndefined()
    expect(wrapper.data['state']).toBe('finished')
    const argv = argvOf('xp-far')
    expect(flagOf(argv, '--workspace')).toBe(FAR)
    expect(flagOf(argv, '--parent')).toBe(supervisors.far.run)
    const entry = theWorkerRunOf(supervisors.far.run, 'xp-far')!
    expect(entry.state).toBe('started')
    expect(entry.starting).toMatchObject({ runtime: 'claude-code', model: A_MODEL, effort: THE_FAR_EFFORT })
    const workers = rowOf(entry.started!.run)
    expect(workers.workspaceId).toBe(FAR)
    expect(workers.data['parentAttachment']).toBe(supervisors.far.run)
    const processRows = t.client.sqlite.prepare("SELECT workspace_id FROM session_resources WHERE session_record_id = ? AND type = 'process'").all(wrapperOf.get(idOf('xp-far'))!) as { workspace_id: string }[]
    expect(processRows.map((row) => row.workspace_id)).toEqual([FAR])
  })

  it('starts an ask in its own project as before, under its own run, on the default’s row', () => {
    expect(rows, 'the row of the ask in the worker’s own project').toContainEqual({ run: supervisors.own.run, agentId: idOf('xp-near'), handle: 'xp-near', workspaceId: OWN })
    const wrapper = rowOf(wrapperOf.get(idOf('xp-near'))!)
    expect(wrapper.workspaceId).toBe(OWN)
    expect(wrapper.data['parentAttachment']).toBe(workersOwnRun)
    expect(wrapper.data['state']).toBe('finished')
    const argv = argvOf('xp-near')
    expect(flagOf(argv, '--workspace')).toBe(OWN)
    expect(flagOf(argv, '--parent')).toBe(supervisors.own.run)
    const entry = theWorkerRunOf(supervisors.own.run, 'xp-near')!
    expect(entry.state).toBe('started')
    expect(entry.starting).toMatchObject({ runtime: 'claude-code', model: A_MODEL, effort: THE_OWN_EFFORT })
    const workers = rowOf(entry.started!.run)
    expect(workers.workspaceId).toBe(OWN)
    expect(workers.data['parentAttachment']).toBe(supervisors.own.run)
  })
})

describe('3. the doors, asked with the default project in the header, for a run of the other project', () => {
  it('starts it at the starting door, in its own project, on that project’s row', async () => {
    await anAsk('xp-boss-far', supervisors.far, FAR, 'xp-door')
    const launcher = await aLauncherRun(supervisors.far.run, 'xp-door', FAR)
    const r = await call('POST', `/api/worker/worker-runs/${supervisors.far.run}/starting`, asTheWorker(OWN), { agent: idOf('xp-door'), wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['workerRun']).toMatchObject({ run: supervisors.far.run, parent: supervisors.far.run, model: A_MODEL, workspaceId: FAR })
    expect(theWorkerRunOf(supervisors.far.run, 'xp-door')).toMatchObject({ state: 'starting', starting: { wrapper: launcher, effort: THE_FAR_EFFORT } })
  })

  it("finds the worker's process row in the run's own project at the ending door", async () => {
    const entry = theWorkerRunOf(supervisors.far.run, 'xp-far')!
    expect(entry.state).toBe('started')
    // THE WORKER'S PROCESS ROW, as the launcher would register it in the worker's project. Put in by SQL: made up.
    const row = `row-${randomBytes(5).toString('hex')}`
    t.client.sqlite
      .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, ?, ?, 'process', '4242', 'A made-up process of a worker run', '2026-11-01 01:00:00', 'agent:fixture')")
      .run(row, FAR, entry.started!.run)
    const r = await call('POST', `/api/worker/worker-runs/${supervisors.far.run}/ended`, asTheWorker(OWN), {
      agent: idOf('xp-far'), wrapper: entry.starting!.wrapper, ok: true, says: 'The made-up launcher exited with code 0.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['workerRun']['process']).toEqual({ row, says: `Process row ${row} of run ${entry.started!.run} was open when the launcher ended.` })
    expect(theWorkerRunOf(supervisors.far.run, 'xp-far')?.process?.row).toBe(row)
  })
})
