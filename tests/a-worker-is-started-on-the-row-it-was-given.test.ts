// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORKER IS STARTED ON THE CASTING ROW IT WAS GIVEN (wave 13n round BQ). The worker-run door judged a supervisor's
 * named choice, and the row a roll chose, against a list of runtimes and models compiled into the code. Now the Casting
 * rows are the one list. A choice is checked against the worker card's rows in force for the asking project, the rows a
 * roll chooses among, and the ask keeps the row it found, with the row's selection revision, on the worker's entry. The
 * start reads that row again and refuses, in words, a row that changed, was held or was removed. It never takes another
 * row and never rolls again. A row with native selection data reaches the launcher as that selection, `--selection`,
 * beside the name.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder, its repository
 * (tests/a-made-up-sandbox-repo.ts) and its container row, the agents, every Casting row and every model name. No real
 * worker is started, and no model is run. The launcher is a script written below, named by
 * MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which keeps what it was given and files the worker's run through the real
 * tools/file-a-run.mjs, and starts nothing. The message worker's agent runtime is a script that refuses, so a run it
 * started would show. The message worker is given the folder `aCheckoutForATestRun()` makes as its checkout. A row is
 * held through the hold door, against a session record this file files as the run started from the row; nothing ran.
 *
 * WHAT IS PROVED
 *   1. With no worker row, a choice is refused, and the words say no row was read.
 *   2. At the ask, with rows in every project: a choice no row casts, or a row's model under another runtime, is refused
 *      with the rows read named; so is a runtime named alone. A row whose program the launcher cannot start, a pair two
 *      rows cast, and a held row are each refused in words. A refused ask writes nothing. A choice a row casts, by its
 *      Office model or by its native provider and model, is kept with the row's id, its revision (null for a row with no
 *      native data) and its program, model and effort as read, and the answer names the row.
 *   3. At the start: a row whose model changed, a row that gained native data, a native row that changed, a held row, a
 *      removed row, and an entry that keeps no row each fail the start in words, with the supervisor told. A probability
 *      edit does not. A row with no native data is started with no selection.
 *   4. One message worker pass gives the launcher a native row's selection as --selection, as the row's own door reads
 *      it, and gives none for a row with no native data.
 *   5. In force: a project's own row replaces the every-project rows for a choice. A roll keeps its row the same way, and
 *      a change to that row fails the start, with the roll kept and not made again. A rolled row whose program the
 *      launcher cannot start is refused at the ask. A kept roll older than the row's last change starts on the row's
 *      cells as they are at the later ask, not on the cells the roll read when it was drawn. A kept roll whose row did
 *      not change keeps the roll's own start rule, so a marked OpenCode Luna row says codex with gpt-6-luna at the ask
 *      and gives the launcher codex with that model at the starting door.
 *   6. The launcher's command line takes --selection for worker and exec, and a round refuses it.
 *
 * THE MUTATIONS, AFTER A CONTROL RUN, each alone, restored and checked with cmp:
 *   - the start's check of the kept row compares no cells: 3's changed-model case goes red on a 200;
 *   - the message worker gives the launcher no --selection: 4 goes red on the missing option;
 *   - the start and the ask use the kept row's cells even when the row did not change: 5a goes red on the runtime;
 *   - the start and the ask use the kept roll's own start rule even when the row changed: 5b goes red on the old model.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { CASTING_PROGRAMS, type CastingSelection } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { RoundAdapter } from '../src/worker/runtimes/round.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** This worktree, read for the real tools/file-a-run.mjs and for the commit the made-up sandbox's `main` stands at. */
const THIS_WORKTREE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
const WORKSPACE = 'default'
const SUPERVISOR = 'wr-supervisor'
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/** A word made up for this run, so no model name of the office can match one made from it. */
const UNSEEN = randomUUID().slice(0, 8)
const aModel = (letter: string): string => `made-up-${UNSEEN}-${letter}`

/** The runtimes the launcher starts, in the door's words: "a, b, c or d". */
const THE_LAUNCHERS_RUNTIMES = ((names: string[]): string => `${names.slice(0, -1).join(', ')} or ${names.at(-1)!}`)(Object.keys(THE_PROGRAM_A_RUNTIME_RUNS))
/** A program a Casting row may name that the launcher has no command for. */
const A_PROGRAM_THE_LAUNCHER_CANNOT_START = CASTING_PROGRAMS.find((program) => !Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, program))
/** The provider a Claude Code row's native model is named under when no provider is stored. */
const CLAUDES_PROVIDER = THE_PROVIDER_A_RUNTIME_RUNS['claude-code']

/**
 * THE SYNTHETIC LAUNCHER. It keeps what it was given, without the key, and files the worker's run through the real
 * tools/file-a-run.mjs under the launcher run, with the supervisor's run as its parent, with the runtime and the model
 * it was given. It takes the worker command and the exec command alike, and starts no container and no agent.
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
if (argv[0] !== 'worker' && argv[0] !== 'exec') { process.stderr.write('The made-up launcher starts workers only, and was asked for ' + argv[0] + '.\\n'); process.exit(4) }
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

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (): Record<string, string> => asAgent(THE_WORKER_ID, A_MADE_UP_OFFICE_KEY)

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const { 'content-type': _type, ...withoutAType } = headers
  const r = await app.inject({ method, url, headers: payload === undefined ? withoutAType : headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, by: Record<string, string> = AS_THE_PERSON, role?: string): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key })
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
const theWorkerRunOf = (handle: string): TheWorkerRun | undefined => (dataOf(supervisorRun)['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]

/** How many lines the office wrote to the supervisor saying a worker run asked on its run did not start. */
function linesToTheSupervisor(): number {
  return (t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aWorkerDidNotStart'")
    .get(supervisorRun) as { n: number }).n
}

/** Ask for a worker run as the supervisor, from its own run, with its own run key. */
const ask = (handle: string, body: Record<string, unknown>) => call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent(SUPERVISOR, supervisorRunKey, supervisorRun), { brief, ...body })

/** A launcher run of the message worker's own for the worker, and its call at the starting door, as a pass makes them. */
async function atTheStartingDoor(handle: string): Promise<{ status: number; body: Record<string, any> }> {
  const launcher = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for ${handle}`,
    data: {
      state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: checkout,
      startedByMoleOffice: true, extra: { purpose: 'worker', run: supervisorRun, worker: idOf(handle) },
    },
  })
  expect(launcher.status, JSON.stringify(launcher.body)).toBe(201)
  return call('POST', `/api/worker/worker-runs/${supervisorRun}/starting`, AS_THE_WORKER(), { agent: idOf(handle), wrapper: String(launcher.body['record'].id) })
}

/** The start fails with these words, the entry keeps them as failed and was never starting, and the supervisor is told. */
async function theStartFails(handle: string, says: string): Promise<void> {
  const toldBefore = linesToTheSupervisor()
  const r = await atTheStartingDoor(handle)
  expect(r.status, JSON.stringify(r.body)).toBe(409)
  expect(r.body['error']).toBe(`${says} The ask is now failed. Nothing was started.`)
  expect(theWorkerRunOf(handle)).toMatchObject({ state: 'failed', failed: { says } })
  expect(theWorkerRunOf(handle)).not.toHaveProperty('starting')
  expect(linesToTheSupervisor()).toBe(toldBefore + 1)
}

/** The Casting rows this file made, in the order it made them, and where. */
const made: { id: number; program: string; model: string; project: string | null }[] = []

/** Add a worker row as the person, and keep it in `made`. Its id. */
async function aRow(row: { program: string; model: string; effort?: string; native?: { model: string; provider: string | null; variant: string | null }; project?: string }): Promise<number> {
  const r = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
    ...(row.project === undefined ? {} : { project: row.project }),
    program: { value: row.program }, model: { value: row.model }, effort: { value: row.effort ?? null },
    ...(row.native === undefined ? {} : { native: row.native }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = Number(r.body['casting'].id)
  made.push({ id, program: row.program, model: row.model, project: row.project ?? null })
  return id
}

/** Change a row's cells or native data as the person. */
async function change(id: number, body: Record<string, unknown>): Promise<void> {
  const r = await call('PATCH', `/api/casting/rows/${String(id)}`, AS_THE_PERSON, body)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}

/** The selection a row's own door reads. */
async function theSelectionOf(id: number): Promise<CastingSelection> {
  const r = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body as { selection: CastingSelection }).selection
}

/**
 * HOLD THE ROW as a native refusal holds it: a session record names the row's selection as the one it was started with,
 * and the refusal is reported for that run as the person. Gives back the sentence the row's selection door now refuses
 * with, which is the sentence lib/casting.ts makes for the hold.
 */
async function hold(id: number): Promise<string> {
  const selection = await theSelectionOf(id)
  const run = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run started from a held row', data: {
    runtime: selection.runtime, model: selection.model, servingAgent: 'wr-held-runner', state: 'running', extra: { launcherSelection: selection },
  } })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' }
  const held = await call('POST', `/api/casting/rows/${String(id)}/hold`, AS_THE_PERSON, { revision: selection.casting!.revision, run: String(run.body['record'].id), refusal })
  expect(held.status, JSON.stringify(held.body)).toBe(200)
  const refused = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(refused.status, JSON.stringify(refused.body)).toBe(409)
  const says = String(refused.body['error'])
  expect(says).toMatch(/ Nothing was started\.$/)
  return says
}

/** The rows of one scope as the door names them: "The rows read were 3 (claude-code with m), …". */
function theRowsRead(project: string | null): string {
  const read = made.filter((row) => row.project === project).sort((one, two) => one.id - two.id).map((row) => `${String(row.id)} (${row.program} with ${row.model})`)
  return read.length === 1 ? `The row read was ${read[0]!}.` : `The rows read were ${read.slice(0, -1).join(', ')} and ${read.at(-1)!}.`
}

/** What every refusal of a named choice ends with. */
const WITH_NEITHER = 'With neither named, the worker is given the Casting row for the worker card. Nothing was written.'

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
let supervisorRun = ''
let supervisorRunKey = ''

/** The rows of section 2 to 4, by what each case does with them. */
const rows = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0, i: 0, k: 0, t1: 0, t2: 0 }
/** The sentence each held row's own selection door refuses with. */
let heldAtTheAsk = ''

const WORKERS = ['wr-none', 'wr-refused', 'wr-a', 'wr-b', 'wr-c', 'wr-d', 'wr-e', 'wr-f', 'wr-g', 'wr-h', 'wr-kept-none', 'wr-roll', 'wr-roll-refused', 'wr-roll-old', 'wr-luna', 'wr-out', 'wr-expired', 'wr-named-out', 'wr-limit', 'wr-limit-gone', 'wr-named-limit']

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
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-row-it-was-given-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })
  checkout = aCheckoutForATestRun()

  await started('wr-secretary', AS_THE_PERSON, 'secretary')
  await started(SUPERVISOR, asOne('wr-secretary'))
  await started('wr-held-runner')
  for (const handle of WORKERS) await started(handle, asOne(SUPERVISOR))

  // A MADE-UP SANDBOX FOLDER with a brief in it, and the container row `tools/sandbox.mjs up` registers for it.
  folder = join(realpathSync(scratch), 'sandboxes', 'wr-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  aMadeUpSandboxRepo(folder, THIS_WORKTREE)
  const container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-13 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-wr-sandbox', `Sandbox wr-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  // THE STARTER IS THE SECRETARY ON THE HOST, and it files the supervisor's run in the sandbox from its own terminal, so
  // the office mints the run its own key (tests/a-supervisor-chooses-its-workers-model.test.ts does the same).
  const terminal = await call('POST', '/api/records', asOne('wr-secretary'), { kind: 'session', title: 'The secretary in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  const run = await call('POST', '/api/records', asAgent('wr-secretary', agents.get('wr-secretary')!.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: 'A made-up supervisor run',
    data: {
      state: 'running', servingAgent: SUPERVISOR, servingAgentId: idOf(SUPERVISOR), runtime: 'claude-code', model: aModel('supervisor'),
      workingDirectory: THIS_WORKTREE, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  supervisorRun = String(run.body['record'].id)
  supervisorRunKey = String(run.body['runKey']?.key)

  const launcher = join(scratch, 'fake-worker-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api, workspace: WORKSPACE, session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(scratch, 'runs'),
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

describe('1. with no worker row', () => {
  it('refuses a choice and says no row was read', async () => {
    const r = await ask('wr-none', { runtime: 'claude-code', model: aModel('none') })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toBe(
      `No Casting row of the worker card in force for project ${WORKSPACE} casts "claude-code" with the model "${aModel('none')}", so a supervisor ` +
        `may not choose it for a worker. No row was read: the Casting table marks no worker row for project ${WORKSPACE} or for every project. ${WITH_NEITHER}`,
    )
    expect(theWorkerRunOf('wr-none')).toBeUndefined()
  })
})

describe('2. at the ask, against the rows in every project', () => {
  beforeAll(async () => {
    // EACH ROW CASTS ITS OWN PAIR, so a choice names one row, except the two `t` rows, which cast one pair together.
    rows.a = await aRow({ program: 'claude-code', model: aModel('a'), effort: 'high' })
    rows.b = await aRow({ program: 'codex', model: aModel('b'), effort: 'medium' })
    rows.c = await aRow({ program: 'claude-code', model: aModel('c') })
    rows.d = await aRow({ program: 'claude-code', model: aModel('d') })
    rows.e = await aRow({ program: 'claude-code', model: aModel('e') })
    rows.f = await aRow({ program: 'claude-code', model: aModel('f'), effort: 'low', native: { model: aModel('native-f'), provider: null, variant: null } })
    rows.g = await aRow({ program: 'claude-code', model: aModel('g'), native: { model: aModel('native-g'), provider: null, variant: null } })
    rows.h = await aRow({ program: 'claude-code', model: aModel('h'), native: { model: aModel('native-h'), provider: null, variant: null } })
    rows.i = await aRow({ program: 'claude-code', model: aModel('i'), native: { model: aModel('native-i'), provider: null, variant: null } })
    expect(A_PROGRAM_THE_LAUNCHER_CANNOT_START, 'the launcher starts every program a Casting row may name, so no row can be refused for it').toBeDefined()
    rows.k = await aRow({ program: A_PROGRAM_THE_LAUNCHER_CANNOT_START!, model: aModel('k') })
    rows.t1 = await aRow({ program: 'claude-code', model: aModel('t') })
    rows.t2 = await aRow({ program: 'claude-code', model: aModel('t') })
    heldAtTheAsk = await hold(rows.i)
  })

  it('refuses a choice no row casts, and a row’s model under another runtime, and names the rows read', async () => {
    const refused: [string, string][] = [['claude-code', aModel('cast-by-none')], ['codex', aModel('a')]]
    for (const [runtime, model] of refused) {
      const r = await ask('wr-refused', { runtime, model })
      expect(r.status, JSON.stringify(r.body)).toBe(400)
      expect(r.body['error']).toBe(
        `No Casting row of the worker card in force for project ${WORKSPACE} casts "${runtime}" with the model "${model}", so a supervisor may not ` +
          `choose it for a worker. ${theRowsRead(null)} ${WITH_NEITHER}`,
      )
    }
    expect(theWorkerRunOf('wr-refused')).toBeUndefined()
  })

  it('refuses a runtime named alone, and names the rows read', async () => {
    const r = await ask('wr-refused', { runtime: 'codex' })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toBe(
      `Name the runtime and the model together, or neither, and this ask named the runtime "codex" and no model. ${theRowsRead(null)} ${WITH_NEITHER}`,
    )
    expect(theWorkerRunOf('wr-refused')).toBeUndefined()
  })

  it('refuses a row whose program the launcher cannot start, a pair two rows cast, and a held row, and writes nothing', async () => {
    const program = A_PROGRAM_THE_LAUNCHER_CANNOT_START!
    const cannot = await ask('wr-refused', { runtime: program, model: aModel('k') })
    expect(cannot.status, JSON.stringify(cannot.body)).toBe(400)
    expect(cannot.body['error']).toBe(
      `Row ${String(rows.k)} casts "${program}" with the model "${aModel('k')}", and the launcher starts a worker only on ${THE_LAUNCHERS_RUNTIMES}. Nothing was written.`,
    )
    const twice = await ask('wr-refused', { runtime: 'claude-code', model: aModel('t') })
    expect(twice.status, JSON.stringify(twice.body)).toBe(400)
    expect(twice.body['error']).toBe(
      `Rows ${String(rows.t1)} and ${String(rows.t2)} of the worker card in force for project ${WORKSPACE} each cast "claude-code" with the model ` +
        `"${aModel('t')}", so the choice names no one row. Nothing was written.`,
    )
    const held = await ask('wr-refused', { runtime: 'claude-code', model: aModel('i') })
    expect(held.status, JSON.stringify(held.body)).toBe(409)
    expect(held.body['error']).toBe(`${heldAtTheAsk.replace(/ Nothing was started\.$/, '')} So no worker run of wr-refused could be started. Nothing was written.`)
    expect(theWorkerRunOf('wr-refused')).toBeUndefined()
  })

  it('keeps a choice a row casts with the row as read, and names the row', async () => {
    const legacy = await ask('wr-a', { runtime: 'claude-code', model: aModel('a') })
    expect(legacy.status, JSON.stringify(legacy.body)).toBe(202)
    expect(theWorkerRunOf('wr-a')).toMatchObject({
      state: 'wanted',
      chosen: { runtime: 'claude-code', model: aModel('a'), by: { kind: 'agent', id: idOf(SUPERVISOR) } },
      row: { id: rows.a, revision: null, program: 'claude-code', model: aModel('a'), effort: 'high' },
    })
    expect(legacy.body['says']).toContain(
      `${SUPERVISOR} chose claude-code with the model ${aModel('a')}, from row ${String(rows.a)} of the Casting table for the worker card. ` +
        'It starts on that row as the ask read it, and a changed or held row refuses the start.',
    )
    // A CODEX ROW'S MODEL reaches the launcher with the provider the data file names in front.
    const codex = await ask('wr-b', { runtime: 'codex', model: aModel('b') })
    expect(codex.status, JSON.stringify(codex.body)).toBe(202)
    expect(theWorkerRunOf('wr-b')?.row).toEqual({ id: rows.b, revision: null, program: 'codex', model: aModel('b'), effort: 'medium' })
    expect(codex.body['says']).toContain(
      `${SUPERVISOR} chose codex with the model ${aModel('b')}, which the launcher is given as ${THE_PROVIDER_A_RUNTIME_RUNS['codex']!}/${aModel('b')}, ` +
        `from row ${String(rows.b)} of the Casting table for the worker card.`,
    )
    // A NATIVE ROW NAMED BY ITS NATIVE PROVIDER AND MODEL keeps its revision, and the launcher is given its Office model.
    expect(CLAUDES_PROVIDER, 'the data file names no provider for Claude Code').toBeDefined()
    const native = await ask('wr-g', { runtime: 'claude-code', model: `${CLAUDES_PROVIDER!}/${aModel('native-g')}` })
    expect(native.status, JSON.stringify(native.body)).toBe(202)
    const revision = (await theSelectionOf(rows.g)).casting!.revision
    expect(theWorkerRunOf('wr-g')?.row).toEqual({ id: rows.g, revision, program: 'claude-code', model: aModel('g'), effort: null })
    expect(native.body['says']).toContain(
      `${SUPERVISOR} chose claude-code with the model ${CLAUDES_PROVIDER!}/${aModel('native-g')}, which the launcher is given as ${aModel('g')}, ` +
        `from row ${String(rows.g)} of the Casting table for the worker card.`,
    )
    for (const [handle, letter] of [['wr-c', 'c'], ['wr-d', 'd'], ['wr-e', 'e'], ['wr-f', 'f'], ['wr-h', 'h'], ['wr-kept-none', 'a']] as const) {
      const r = await ask(handle, { runtime: 'claude-code', model: aModel(letter) })
      expect(r.status, `${handle}: ${JSON.stringify(r.body)}`).toBe(202)
      expect(theWorkerRunOf(handle)?.row?.id, handle).toBe(rows[letter])
    }
  })
})

describe('3. at the start, the row the ask kept', () => {
  it('fails a start whose row’s model changed, and names both readings', async () => {
    await change(rows.b, { model: { value: aModel('b-again') } })
    await theStartFails(
      'wr-b',
      `Casting row ${String(rows.b)} changed after the ask chose it: the ask read codex with the model ${aModel('b')} and the effort medium, and it ` +
        `now casts codex with the model ${aModel('b-again')} and the effort medium. It is not swapped for another row and not rolled again.`,
    )
  })

  it('fails a start whose row gained native data, and a start whose native row changed', async () => {
    await change(rows.d, { native: { model: aModel('native-d'), provider: null, variant: null } })
    await theStartFails(
      'wr-d',
      `Casting row ${String(rows.d)} changed after the ask chose it: its native selection is not the one the ask read. It is not swapped for another row and not rolled again.`,
    )
    await change(rows.g, { effort: { value: 'high' } })
    await theStartFails(
      'wr-g',
      `Casting row ${String(rows.g)} changed after the ask chose it: its native selection is not the one the ask read. It is not swapped for another row and not rolled again.`,
    )
  })

  it('fails a start whose row was held after the ask, in the hold’s own words', async () => {
    const said = await hold(rows.h)
    await theStartFails('wr-h', said.replace(/ Nothing was started\.$/, ''))
  })

  it('fails a start whose row was removed', async () => {
    const removed = await call('DELETE', `/api/casting/rows/${String(rows.e)}`, AS_THE_PERSON)
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    made.splice(made.findIndex((row) => row.id === rows.e), 1)
    await theStartFails('wr-e', `Casting row ${String(rows.e)}, which the ask chose, is no longer in the table.`)
  })

  it('fails a start whose entry keeps no row', async () => {
    // AN ENTRY ASKED BEFORE AN ASK KEPT ITS ROW, made here by taking the row off a kept entry, as only the database can.
    t.client.sqlite.prepare(`UPDATE records SET data = json_remove(data, '$.workerRuns."${idOf('wr-kept-none')}".row') WHERE id = ?`).run(supervisorRun)
    await theStartFails('wr-kept-none', 'The ask keeps no Casting row, because it was made before an ask kept one. Ask again.')
  })

  it('starts on a row whose probability changed, with no selection for a row with no native data', async () => {
    await change(rows.c, { probability: { value: '0.5' } })
    const r = await atTheStartingDoor('wr-c')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['workerRun']).toMatchObject({ runtime: 'claude-code', model: aModel('c'), selection: null })
    expect(theWorkerRunOf('wr-c')).toMatchObject({ state: 'starting', row: { id: rows.c, revision: null } })
  })
})

describe('4. one pass gives the launcher a native row’s selection', () => {
  it('gives --selection for the native row, as its own door reads it, and none for a row with no native data', async () => {
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started, 'the pass started an agent run').toEqual([])
    const wrapperOf = new Map((first.workers?.started ?? []).map((one) => [one.agentId, one.wrapper]))
    expect([...wrapperOf.keys()].sort()).toEqual(['wr-a', 'wr-f'].map(idOf).sort())
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const argvOf = (handle: string): string[] => (JSON.parse(readFileSync(join(captures, `${wrapperOf.get(idOf(handle))!}.json`), 'utf8')) as { argv: string[] }).argv

    const native = argvOf('wr-f')
    expect(native.slice(0, 2)).toEqual(['worker', 'wr-sandbox'])
    expect(native).toEqual(expect.arrayContaining(['--runtime', 'claude-code', '--model', aModel('f')]))
    expect(native, 'the launcher was given no --selection').toContain('--selection')
    expect(JSON.parse(native[native.indexOf('--selection') + 1]!)).toEqual(await theSelectionOf(rows.f))

    const legacy = argvOf('wr-a')
    expect(legacy).toEqual(expect.arrayContaining(['--runtime', 'claude-code', '--model', aModel('a')]))
    expect(legacy).not.toContain('--selection')
  }, 120_000)
})

describe('5. the rows in force for the project, and a roll', () => {
  let p = 0
  beforeAll(async () => {
    // A PROJECT'S OWN ROW REPLACES THE EVERY-PROJECT ROWS as a whole, for a choice and a roll alike.
    p = await aRow({ program: 'claude-code', model: aModel('p'), effort: 'high', project: WORKSPACE })
    // A POSITIVE PROBABILITY makes the unnamed asks draw this row rather than take the marked fallback.
    await change(p, { probability: { value: '1' } })
  })

  it('refuses a choice only an every-project row casts, and names the project’s row alone', async () => {
    const r = await ask('wr-refused', { runtime: 'claude-code', model: aModel('a') })
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toBe(
      `No Casting row of the worker card in force for project ${WORKSPACE} casts "claude-code" with the model "${aModel('a')}", so a supervisor may not ` +
        `choose it for a worker. The row read was ${String(p)} (claude-code with ${aModel('p')}). ${WITH_NEITHER}`,
    )
  })

  it('rechecks a rolled row at start, while a named choice still overrides Out until', async () => {
    for (const handle of ['wr-out', 'wr-expired']) {
      const asked = await ask(handle, {})
      expect(asked.status, JSON.stringify(asked.body)).toBe(202)
      expect(theWorkerRunOf(handle)?.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: p } })
    }
    const named = await ask('wr-named-out', { runtime: 'claude-code', model: aModel('p') })
    expect(named.status, JSON.stringify(named.body)).toBe(202)
    const roll = theWorkerRunOf('wr-out')!.castingRoll
    await change(p, { out_until: { value: '2099-01-02 09:30' } })
    const refused = await atTheStartingDoor('wr-out')
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(String(refused.body['error'])).toContain('2099-01-02')
    expect(theWorkerRunOf('wr-out')).toMatchObject({ state: 'failed', castingRoll: roll })
    const namedStart = await atTheStartingDoor('wr-named-out')
    expect(namedStart.status, JSON.stringify(namedStart.body)).toBe(200)
    await change(p, { out_until: { value: '2020-01-02 09:30' } })
    const expired = await atTheStartingDoor('wr-expired')
    expect(expired.status, JSON.stringify(expired.body)).toBe(200)
    await change(p, { out_until: { value: null } })
  })

  it('rechecks a provider limit at start for a rolled row but preserves a named choice', async () => {
    for (const handle of ['wr-limit', 'wr-limit-gone']) {
      const asked = await ask(handle, {})
      expect(asked.status, JSON.stringify(asked.body)).toBe(202)
      expect(theWorkerRunOf(handle)?.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: p } })
    }
    const named = await ask('wr-named-limit', { runtime: 'claude-code', model: aModel('p') })
    expect(named.status, JSON.stringify(named.body)).toBe(202)
    const stopped = t.api.createRecord({ kind: 'session', title: 'Synthetic: limit after the worker ask', workspaceId: WORKSPACE,
      actor: { type: 'agent', id: idOf(SUPERVISOR) }, origin: 'fixture', data: {
        state: 'crashed', runtime: 'claude-code', model: aModel('p'), closedHow: 'provider-event', closedAt: '2026-11-10 06:00:00',
        stopCause: { kind: 'session-limit', said: 'Synthetic: worker limit.', at: new Date().toISOString(), resetsAt: new Date(Date.now() + 18_000_000).toISOString() },
      } }).id
    try {
      const refused = await atTheStartingDoor('wr-limit')
      expect(refused.status, JSON.stringify(refused.body)).toBe(409)
      expect(String(refused.body['error'])).toContain(`Run ${stopped} reports session limit`)
      expect(theWorkerRunOf('wr-limit')).toMatchObject({ state: 'failed' })
      const namedStart = await atTheStartingDoor('wr-named-limit')
      expect(namedStart.status, JSON.stringify(namedStart.body)).toBe(200)
    } finally {
      t.api.deleteRecord(stopped, { type: 'agent', id: idOf(SUPERVISOR) })
    }
    const available = await atTheStartingDoor('wr-limit-gone')
    expect(available.status, JSON.stringify(available.body)).toBe(200)
  })

  it('keeps the rolled row, and fails the start when that row changed, without rolling again', async () => {
    const asked = await ask('wr-roll', {})
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const kept = theWorkerRunOf('wr-roll')!
    expect(kept.row).toEqual({ id: p, revision: null, program: 'claude-code', model: aModel('p'), effort: 'high' })
    expect(kept.castingRoll).toMatchObject({ selected: { rowId: p } })
    expect(asked.body['says']).toContain(
      `No model was named, so it is given claude-code with the model ${aModel('p')}, from row ${String(p)} of the Casting table for the worker card.`,
    )
    expect(asked.body['says']).toContain('It starts on that row as the ask read it, and a changed or held row refuses the start. Nothing rolls again when it starts.')
    await change(p, { effort: { value: 'low' } })
    await theStartFails(
      'wr-roll',
      `Casting row ${String(p)} changed after the ask chose it: the ask read claude-code with the model ${aModel('p')} and the effort high, and it ` +
        `now casts claude-code with the model ${aModel('p')} and the effort low. It is not swapped for another row and not rolled again.`,
    )
    expect(theWorkerRunOf('wr-roll')?.castingRoll, 'the start rolled again').toEqual(kept.castingRoll)
  })

  it('refuses at the ask a rolled row whose program the launcher cannot start', async () => {
    const program = A_PROGRAM_THE_LAUNCHER_CANNOT_START!
    // Restore the marked fallback for this case and the marked Luna case that follows.
    await change(p, { probability: { value: null } })
    const k = await aRow({ program, model: aModel('k-project'), project: WORKSPACE })
    const marked = await call('POST', `/api/casting/rows/${String(k)}/mark`, AS_THE_PERSON)
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    const r = await ask('wr-roll-refused', {})
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(String(r.body['error'])).toMatch(new RegExp(`\\. Row ${String(k)} casts "${program}" with the model "${aModel('k-project')}", and the launcher starts a worker only on `))
    expect(String(r.body['error'])).toMatch(/So no worker run of wr-roll-refused could be started\. Nothing was written\.$/)
    expect(String(r.body['error'])).toContain(`the launcher starts a worker only on ${THE_LAUNCHERS_RUNTIMES}. So no worker run`)
    expect(theWorkerRunOf('wr-roll-refused')).toBeUndefined()
  })
})

describe('5a. an unchanged marked OpenCode Luna row keeps the roll’s own start rule', () => {
  let luna = 0
  const THE_CODEX_NAME = `${THE_PROVIDER_A_RUNTIME_RUNS['codex']!}/gpt-6-luna`

  beforeAll(async () => {
    // THE FIRST ROW OF A SCOPE CARRIES THE MARK, so this row is the one the tools take, and no probability is set for it.
    luna = await aRow({ program: 'opencode', model: 'opencode-go/gpt-6-luna', project: WORKSPACE })
    const marked = await call('POST', `/api/casting/rows/${String(luna)}/mark`, AS_THE_PERSON)
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
  })

  it('says codex with gpt-6-luna at the ask, and gives the launcher codex with that model at the starting door', async () => {
    const asked = await ask('wr-luna', {})
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    expect(theWorkerRunOf('wr-luna')).toMatchObject({
      state: 'wanted',
      row: { id: luna, revision: null, program: 'opencode', model: 'opencode-go/gpt-6-luna' },
      castingRoll: { choice: 'marked', selected: { rowId: luna, program: 'opencode', model: 'opencode-go/gpt-6-luna' } },
    })
    expect(asked.body['says']).toContain(
      `No model was named, so it is given codex with the model gpt-6-luna, from row ${String(luna)} of the Casting table for the worker card.`,
    )
    const started = await atTheStartingDoor('wr-luna')
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    // THE LAUNCHER IS GIVEN CODEX'S NAME FOR THE SAME MODEL, not the OpenCode row's own cells.
    expect(started.body['workerRun']).toMatchObject({ runtime: 'codex', model: THE_CODEX_NAME })
  })
})

describe('5b. a kept roll older than the row’s last change', () => {
  let p = 0
  const OLD = aModel('roll-old')
  const NEW = aModel('roll-new')

  beforeAll(async () => {
    // A PROJECT ROW WITH A PROBABILITY, so the first ask draws a real roll rather than taking a marked row.
    p = await aRow({ program: 'claude-code', model: OLD, effort: 'high', project: WORKSPACE })
    await change(p, { probability: { value: '1' } })
  })

  it('starts on the row the later ask reads, not on the model the roll kept', async () => {
    const first = await ask('wr-roll-old', {})
    expect(first.status, JSON.stringify(first.body)).toBe(202)
    expect(theWorkerRunOf('wr-roll-old')?.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: p, model: OLD } })
    // A CHOICE KEEPS THE DRAW UNUSED, so the later ask that names nothing takes it.
    const carried = await ask('wr-roll-old', { runtime: 'claude-code', model: OLD })
    expect(carried.status, JSON.stringify(carried.body)).toBe(202)
    expect(theWorkerRunOf('wr-roll-old')).toMatchObject({ row: { id: p, model: OLD }, castingRoll: { selected: { rowId: p, model: OLD } } })
    await change(p, { model: { value: NEW } })
    const later = await ask('wr-roll-old', {})
    expect(later.status, JSON.stringify(later.body)).toBe(202)
    expect(theWorkerRunOf('wr-roll-old')).toMatchObject({ row: { id: p, model: NEW }, castingRoll: { selected: { rowId: p, model: OLD } } })
    const started = await atTheStartingDoor('wr-roll-old')
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect(started.body['workerRun']).toMatchObject({ runtime: 'claude-code', model: NEW })
    expect(later.body['says']).toContain(`No model was named, so it is given claude-code with the model ${NEW}, from row ${String(p)} of the Casting table for the worker card.`)
  })
})

describe('6. the launcher’s command line takes the selection', () => {
  const selection: CastingSelection = {
    runtime: 'claude-code', model: aModel('line'), native: { model: aModel('native-line'), provider: null, variant: null, effort: null }, casting: { id: 1, revision: `revision-${UNSEEN}` },
  }
  const asked = {
    session: 'launcher-run', cwd: '/nowhere/checkout', api: 'http://127.0.0.1:1', workspace: WORKSPACE, outputPath: '/nowhere/out', key: null,
    instance: 'wr-sandbox', sandboxes: '/nowhere/sandboxes', handle: 'wr-a', brief: '/nowhere/sandboxes/wr-sandbox/brief.md',
    model: aModel('line'), runtime: 'claude-code',
  }
  const adapter = new RoundAdapter({ PATH: process.env['PATH'] })
  /** The two words from --selection on, or what the line holds when it has none. */
  const theOption = (args: string[]): string[] => args.includes('--selection') ? args.slice(args.indexOf('--selection'), args.indexOf('--selection') + 2) : []

  it('gives --selection to the worker command, before --as', () => {
    const line = adapter.commandFor({ ...asked, verb: 'worker', parent: 'Rs-made-up', cutFrom: 'a-made-up-commit', selection } as Parameters<RoundAdapter['commandFor']>[0])
    expect(theOption(line.args)).toEqual(['--selection', JSON.stringify(selection)])
    expect(line.args.indexOf('--selection')).toBeLessThan(line.args.indexOf('--as'))
    expect(theOption(adapter.commandFor({ ...asked, verb: 'worker', parent: 'Rs-made-up' }).args)).toEqual([])
  })

  it('gives --selection to the exec command, before the command after --', () => {
    const line = adapter.commandFor({
      ...asked, verb: 'exec', parent: 'Rs-made-up', worktree: '/nowhere/sandboxes/wr-sandbox/worktrees/wr-a', command: ['a-made-up-program', 'run'], selection,
    } as Parameters<RoundAdapter['commandFor']>[0])
    expect(theOption(line.args)).toEqual(['--selection', JSON.stringify(selection)])
    expect(line.args.indexOf('--selection')).toBeLessThan(line.args.indexOf('--'))
  })

  it('gives --selection to the round command, before --as', () => {
    const line = adapter.commandFor({ ...asked, follows: 'Rs-before', selection } as Parameters<RoundAdapter['commandFor']>[0])
    expect(theOption(line.args)).toEqual(['--selection', JSON.stringify(selection)])
    expect(line.args.indexOf('--selection')).toBeLessThan(line.args.indexOf('--as'))
    expect(theOption(adapter.commandFor({ ...asked, follows: 'Rs-before' }).args)).toEqual([])
  })
})
