// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR CHOOSES ITS WORKER'S RUNTIME AND MODEL AT THE WORKER-RUN DOOR, FROM CASTING ROWS. Wave 13j round loop-6,
 * item 0', on the owner's decision and the secretary's answers X8LBo7MOvvMp and
 * H1p_xpVWnIG9. `POST /api/agents/<worker>/worker-run`
 * takes `runtime` and `model` beside `brief`, both or neither. Since wave 13n round BQ the Casting rows of the worker
 * card are where a list in the code was: one Casting row of the worker card in force for the project must cast the
 * choice. An ask that names neither is given the Casting row its roll chose for the worker card (round 46). Either way
 * the ask keeps the row as it read it. tests/a-supervisor-starts-its-own-worker.test.ts proves the rest of the door,
 * tests/a-worker-is-started-on-the-row-it-was-given.test.ts proves the row the ask keeps, and this file builds on both.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder, its repository
 * (tests/a-made-up-sandbox-repo.ts) and its container row, the agents, the Casting rows, and a model of this test's
 * own. No real worker is started, and no model is run. The launcher is a script written below, named by
 * MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which keeps what it was given and files the worker's run through the real
 * tools/file-a-run.mjs, and starts nothing. The message worker's agent runtime is a script that refuses, so a run it
 * started would show.
 *
 * THE ROWS. Before the first case the person casts five worker rows for every project: the marked row, claude-code with
 * claude-opus-5-5, and then codex with gpt-6.1-sol and with gpt-6-astra, dsh with deepseek-v4.1-flash, and opencode
 * with opencode-go/gpt-6-luna.
 *
 * WHAT IS PROVED
 *   1. A choice no row casts is refused in words that name the rows read, with nothing written: Sonnet, an OpenCode
 *      model without its provider, an OpenCode Go model no row casts, a model a row casts under another runtime, a Codex
 *      model with the provider in front that its row does not name, and a runtime or a model named alone.
 *   2. A choice a row casts is kept on the ask as chosen, with its runtime and who chose it, and with the row. The ask's
 *      answer names the row. The answer for a dsh worker names the exec command and says the worker runs in its own
 *      worktree, <sandbox>/worktrees/<worker>, and says nothing about reaching the office. So does the answer for an
 *      OpenCode worker, whose model is given as named, with its provider. An ask that names nothing keeps no choice,
 *      and says which Casting row it is given and that the start takes that row as the ask read it.
 *   3. One message worker pass starts each through the stand-in launcher: claude-code with the sandbox launcher's
 *      worker command and claude-opus-5-5; codex with the worker command and openai/gpt-6.1-sol; dsh with exec --agent,
 *      --runtime dsh, --brief and --worktree <sandbox>/worktrees/<worker>, and no command of its own; opencode the same
 *      way, with --runtime opencode and opencode-go/gpt-6-luna, and the command `opencode run --format json <the brief's
 *      text>` after --, the form the secretary started OpenCode Go workers with; each under --parent of the supervisor's run.
 *      The ask that named nothing is given the Casting row's program and model, and its starting entry names the row
 *      in the default router's sentence and keeps how the router chose (round 44). A chosen start names no Casting row
 *      and keeps no roll. Each is given --cut-from the commit the supervisor's run stands at, after --worktree for
 *      exec.
 *   4. The starting door reads the kept row again. An entry whose chosen row's model was changed through the Casting
 *      door fails, with the supervisor told, and nothing is started. So does an entry whose rolled row's model was.
 *   5. The launcher's exec command line, worked out and not run, and an exec command with no worktree is not built.
 *   6. A rolled Casting row for the worker card is judged at the ask by what the launcher can start. A row whose program
 *      the launcher has no command for is refused in words, with nothing written. A row with a model of this test's own,
 *      and a row with a Codex model under claude-code, are taken. The rule judges what the row starts, not its cells: a
 *      codex row named openai/gpt-6-luna and a marked OpenCode Luna row both start on codex with gpt-6-luna.
 *
 * MUTATION PROOF (after a green control, each alone, restored and checked with cmp, then green again): named in the
 * commit that builds the door's choice, with its logs, for 4's Casting roll and 6 in wave 13n round AF's criterion
 * commit, and for the rows in wave 13n round BQ's code commit.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PROGRAM_A_RUNTIME_RUNS } from '../src/config/launcher-selection.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { CASTING_PROGRAMS } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { RoundAdapter, THE_LAUNCHER_ASKS_AS } from '../src/worker/runtimes/round.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
/** The model the marked Casting row casts for the worker card, with claude-code. */
const A_CAST_MODEL = 'claude-opus-5-5'
/** A model of this test's own, which no row casts until a case gives it to one. */
const A_MODEL_OF_THIS_TEST = 'claude-made-up-worker-2'
const THE_WORKER_ID = 'mole-office/the-message-worker'
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/** The worker rows the person casts before the first case, the marked row first: [program, model, effort]. */
const THE_ROWS: [string, string, string | null][] = [
  ['claude-code', A_CAST_MODEL, 'high'],
  ['codex', 'gpt-6.1-sol', null],
  ['codex', 'gpt-6-astra', null],
  ['dsh', 'deepseek-v4.1-flash', null],
  ['opencode', 'opencode-go/gpt-6-luna', null],
]
/** The runtimes the launcher starts a worker on, as the door names them: "a, b, c or d". */
const THE_LAUNCHERS_RUNTIMES = ((runtimes) => `${runtimes.slice(0, -1).join(', ')} or ${runtimes.at(-1)!}`)(Object.keys(THE_PROGRAM_A_RUNTIME_RUNS))

/**
 * THE SYNTHETIC LAUNCHER. It keeps what it was given, without the key, and files the worker's run through the real
 * tools/file-a-run.mjs under the launcher run, with the supervisor's run as its parent, with the runtime and the model
 * it was given. It takes the worker command and the exec command alike, and starts no container and no agent.
 */
const FAKE_LAUNCHER = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileARun } from ${JSON.stringify(join(CHECKOUT, 'tools/file-a-run.mjs'))}
import { anAgentsToolHeaders } from ${JSON.stringify(join(CHECKOUT, 'for-agents/agent-key.mjs'))}
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
let settings: WorkerSettings
let workerModeBefore: string | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent(THE_WORKER_ID, A_MADE_UP_OFFICE_KEY, session)

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
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
const theWorkerRunOf = (handle: string): TheWorkerRun | undefined => (dataOf(bossRun)['workerRuns'] as Record<string, TheWorkerRun> | undefined)?.[idOf(handle)]

/** What the office said in full to cw-boss, in each line saying a worker run asked on its run did not start. */
function linesToTheSupervisor(): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aWorkerDidNotStart'")
      .all(bossRun) as { data: string }[]
  ).map((row) => (JSON.parse(row.data) as { saidInFull: string }).saidInFull)
}

/** Ask for a worker run as cw-boss, from its own run, with its own run key. */
const ask = (handle: string, body: Record<string, unknown>) => call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent('cw-boss', bossRunKey, bossRun), body)

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
}

let folder = ''
/** The commit this checkout stands at, which the made-up sandbox's `main` stands at too. */
let head = ''
let brief = ''
let container = ''
let bossRun = ''
let bossRunKey = ''
let castingId = 0
/** The id of the row cast for each [program, model] of THE_ROWS. */
const rowOf = new Map<string, number>()
/** The rows read, as the door names them in a refusal of a choice. */
let theRowsRead = ''

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
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-worker-model-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })

  await started('cw-quill', AS_THE_PERSON, 'secretary')
  await started('cw-boss', asOne('cw-quill'))
  for (const handle of ['cw-claude', 'cw-codex', 'cw-dsh', 'cw-oc', 'cw-cast', 'cw-refused', 'cw-changed', 'cw-row-changed', 'cw-row']) await started(handle, asOne('cw-boss'))

  // A MADE-UP SANDBOX FOLDER with a brief in it, and the container row `tools/sandbox.mjs up` registers for it.
  folder = join(realpathSync(scratch), 'sandboxes', 'cw-boss-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  head = aMadeUpSandboxRepo(folder, CHECKOUT).head
  container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-13 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-cw-boss-sandbox', `Sandbox cw-boss-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  // THE STARTER IS THE SECRETARY ON THE HOST, as the one who runs tools/sandbox.mjs is, and it files a run in a sandbox
  // from its own terminal: a run filed from outside every sandbox names one only then
  // (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts).
  const terminal = await call('POST', '/api/records', asOne('cw-quill'), { kind: 'session', title: 'cw-quill in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  // A RUN OF cw-boss IN THE SANDBOX, filed by its starter's key, so the office mints the run its own key.
  const run = await call('POST', '/api/records', asAgent('cw-quill', agents.get('cw-quill')!.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: 'A made-up supervisor run of cw-boss',
    data: {
      state: 'running', servingAgent: 'cw-boss', servingAgentId: idOf('cw-boss'), runtime: 'claude-code', model: 'claude-made-up-boss-0',
      workingDirectory: CHECKOUT, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  bossRun = String(run.body['record'].id)
  bossRunKey = String(run.body['runKey']?.key)

  // THE ROWS, cast by the person under a decision of this test's own. The first carries the mark.
  const decided = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'The test casts the worker card', data: { replaces: [] } })
  expect(decided.status, JSON.stringify(decided.body)).toBe(201)
  const decision = String(decided.body['record'].id)
  for (const [program, model, effort] of THE_ROWS) {
    const cast = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
      program: { value: program, decision }, model: { value: model, decision }, effort: effort === null ? { value: null } : { value: effort, decision },
    })
    expect(cast.status, JSON.stringify(cast.body)).toBe(201)
    rowOf.set(`${program} ${model}`, Number(cast.body['casting'].id))
  }
  castingId = rowOf.get(`claude-code ${A_CAST_MODEL}`)!
  const read = THE_ROWS.map(([program, model]) => `${String(rowOf.get(`${program} ${model}`))} (${program} with ${model})`)
  theRowsRead = `The rows read were ${read.slice(0, -1).join(', ')} and ${read.at(-1)!}.`

  const launcher = join(scratch, 'fake-worker-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api, workspace: 'default', session: null, stopWithPid: null, checkout: CHECKOUT, runs: 2, hops: 3, outputRoot: join(scratch, 'runs'),
    env: { ...process.env, HOME: scratch, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: noAgentRun, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher, WORKER_RUN_CAPTURES: captures },
  }
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1. a choice no Casting row casts is refused in words, and nothing is written', () => {
  it('refuses Sonnet, an OpenCode model no row casts or without its provider, and a cast model under another runtime, and names the rows read', async () => {
    const uncast: [string, string][] = [
      ['claude-code', 'claude-sonnet-5'],
      // THE PROVIDER IS PART OF AN OPENCODE MODEL'S NAME, so the bare name is not the row's.
      ['opencode', 'gpt-6-luna'],
      ['opencode', 'opencode-go/gpt-6.1-sol'],
      ['dsh', 'opencode-go/deepseek-v4.1-flash'],
      ['dsh', 'gpt-6-luna'],
      // A ROW WITH NO NATIVE DATA IS NAMED BY ITS MODEL CELL, and the codex row's cell has no provider in front.
      ['codex', 'openai/gpt-6.1-sol'],
    ]
    for (const [runtime, model] of uncast) {
      const r = await ask('cw-refused', { brief, runtime, model })
      expect(r.status, JSON.stringify(r.body)).toBe(400)
      expect(r.body['error']).toBe(
        `No Casting row of the worker card in force for project default casts "${runtime}" with the model "${model}", so a supervisor may not ` +
          `choose it for a worker. ${theRowsRead} With neither named, the worker is given the Casting row for the worker card. Nothing was written.`,
      )
    }
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })

  it('refuses a runtime named alone and a model named alone', async () => {
    const alone = await ask('cw-refused', { brief, runtime: 'codex' })
    expect(alone.status, JSON.stringify(alone.body)).toBe(400)
    expect(alone.body['error']).toBe(
      `Name the runtime and the model together, or neither, and this ask named the runtime "codex" and no model. ${theRowsRead} ` +
        'With neither named, the worker is given the Casting row for the worker card. Nothing was written.',
    )
    const model = await ask('cw-refused', { brief, model: 'gpt-6-luna' })
    expect(model.status, JSON.stringify(model.body)).toBe(400)
    expect(model.body['error']).toContain('this ask named the model "gpt-6-luna" and no runtime.')
    expect(dataOf(bossRun)['workerRuns']).toBeUndefined()
  })
})

describe('2. a choice a Casting row casts is kept on the ask', () => {
  it('keeps the runtime and the model as chosen and who chose them, with the row that casts them', async () => {
    const r = await ask('cw-codex', { brief, runtime: 'codex', model: 'gpt-6.1-sol' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('cw-codex')).toMatchObject({ state: 'wanted', chosen: { runtime: 'codex', model: 'gpt-6.1-sol', by: { kind: 'agent', id: idOf('cw-boss') } } })
    expect(r.body['workerRun'].chosen).toEqual({ runtime: 'codex', model: 'gpt-6.1-sol', by: { kind: 'agent', id: idOf('cw-boss') } })
    expect(r.body['says']).toContain(`The message worker tries to start it on a later pass, with node tools/sandbox.mjs worker --parent ${bossRun}.`)
    const codexRow = rowOf.get('codex gpt-6.1-sol')!
    expect(theWorkerRunOf('cw-codex')?.row).toEqual({ id: codexRow, revision: null, program: 'codex', model: 'gpt-6.1-sol', effort: null })
    expect(r.body['says']).toContain(
      `cw-boss chose codex with the model gpt-6.1-sol, which the launcher is given as openai/gpt-6.1-sol, from row ${String(codexRow)} of the Casting table for the worker card.`,
    )
    const claude = await ask('cw-claude', { brief, runtime: 'claude-code', model: 'claude-opus-5-5' })
    expect(claude.status, JSON.stringify(claude.body)).toBe(202)
    expect(claude.body['says']).toContain(`cw-boss chose claude-code with the model claude-opus-5-5, from row ${String(castingId)} of the Casting table for the worker card.`)
  })

  it('answers a dsh ask with the exec command and the worker’s own worktree, and says nothing about reaching the office', async () => {
    const r = await ask('cw-dsh', { brief, runtime: 'dsh', model: 'deepseek-v4.1-flash' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('cw-dsh')?.chosen).toEqual({ runtime: 'dsh', model: 'deepseek-v4.1-flash', by: { kind: 'agent', id: idOf('cw-boss') } })
    expect(r.body['says']).toContain(`The message worker tries to start it on a later pass, with node tools/sandbox.mjs exec --agent cw-dsh --runtime dsh --parent ${bossRun}.`)
    expect(r.body['says']).toContain(`cw-boss chose dsh with the model deepseek-v4.1-flash, from row ${String(rowOf.get('dsh deepseek-v4.1-flash'))} of the Casting table for the worker card.`)
    expect(r.body['says']).toContain(`It runs in its own worktree, ${join(folder, 'worktrees', 'cw-dsh')}.`)
    expect(r.body['says']).not.toContain('tools/sandbox.mjs worker')
    // NOTHING ABOUT REACHING THE OFFICE (X8LBo7MOvvMp): a dsh worker in a sandbox reaches it now.
    expect(JSON.stringify(r.body)).not.toMatch(/reach/i)
  })

  it('answers an OpenCode ask with the exec command and the worker’s own worktree, and gives the model as named', async () => {
    const r = await ask('cw-oc', { brief, runtime: 'opencode', model: 'opencode-go/gpt-6-luna' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('cw-oc')?.chosen).toEqual({ runtime: 'opencode', model: 'opencode-go/gpt-6-luna', by: { kind: 'agent', id: idOf('cw-boss') } })
    expect(r.body['says']).toContain(`The message worker tries to start it on a later pass, with node tools/sandbox.mjs exec --agent cw-oc --runtime opencode --parent ${bossRun}.`)
    expect(r.body['says']).toContain(
      `cw-boss chose opencode with the model opencode-go/gpt-6-luna, from row ${String(rowOf.get('opencode opencode-go/gpt-6-luna'))} of the Casting table for the worker card.`,
    )
    expect(r.body['says']).toContain(`It runs in its own worktree, ${join(folder, 'worktrees', 'cw-oc')}.`)
    expect(r.body['says']).not.toContain('tools/sandbox.mjs worker')
    expect(r.body['says']).not.toContain('which the launcher is given as')
  })

  it('keeps no choice on an ask that names none, and says the Casting row is given', async () => {
    const r = await ask('cw-cast', { brief })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('cw-cast')).not.toHaveProperty('chosen')
    expect(r.body['says']).toContain(`with node tools/sandbox.mjs worker --parent ${bossRun}.`)
    // THE ASK ROLLS ONCE (round 46) and says which row it gave, which the start then takes.
    expect(r.body['says']).toContain(
      `No model was named, so it is given claude-code with the model ${A_CAST_MODEL}, from row ${String(castingId)} of the Casting table for the worker card. ` +
        `The tools take marked row ${String(castingId)} because no probability is set for worker in every row. It starts on that row as the ask read it, ` +
        'and a changed or held row refuses the start. Nothing rolls again when it starts.',
    )
  })
})

describe('3. one pass starts each through the stand-in launcher', () => {
  it('starts claude-code and codex with the worker command, dsh and opencode with exec in their own worktrees, and the Casting row when none was named', async () => {
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started, 'the pass started an agent run').toEqual([])
    expect(first.workers?.held).toEqual([])
    const wrapperOf = new Map((first.workers?.started ?? []).map((one) => [one.agentId, one.wrapper]))
    expect([...wrapperOf.keys()].sort()).toEqual(['cw-cast', 'cw-claude', 'cw-codex', 'cw-dsh', 'cw-oc'].map(idOf).sort())
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.workers?.ended.length).toBe(5)
    expect(rounds).toEqual([])

    const captured = (handle: string): { argv: string[]; filed: { ok: boolean; id: string } } =>
      JSON.parse(readFileSync(join(captures, `${wrapperOf.get(idOf(handle))!}.json`), 'utf8')) as { argv: string[]; filed: { ok: boolean; id: string } }
    const under = (handle: string): string[] => ['--agent', handle, '--as', THE_WORKER_ID, '--session', wrapperOf.get(idOf(handle))!, '--parent', bossRun]

    const claude = captured('cw-claude')
    expect(claude.argv.slice(0, 2)).toEqual(['worker', 'cw-boss-sandbox'])
    expect(claude.argv).toEqual(expect.arrayContaining([...under('cw-claude'), '--runtime', 'claude-code', '--model', 'claude-opus-5-5', '--brief', brief]))
    expect(claude.argv).not.toContain('--worktree')
    expect(claude.argv[claude.argv.indexOf('--cut-from') + 1]).toBe(head)

    const codex = captured('cw-codex')
    expect(codex.argv.slice(0, 2)).toEqual(['worker', 'cw-boss-sandbox'])
    expect(codex.argv).toEqual(expect.arrayContaining([...under('cw-codex'), '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol']))
    expect(codex.argv).not.toContain('--worktree')

    const dsh = captured('cw-dsh')
    expect(dsh.argv.slice(0, 2)).toEqual(['exec', 'cw-boss-sandbox'])
    expect(dsh.argv).toEqual(expect.arrayContaining([...under('cw-dsh'), '--runtime', 'dsh', '--model', 'deepseek-v4.1-flash', '--brief', brief]))
    expect(dsh.argv.slice(dsh.argv.indexOf('--worktree'), dsh.argv.indexOf('--worktree') + 4)).toEqual(['--worktree', join(folder, 'worktrees', 'cw-dsh'), '--cut-from', head])
    // A DSH WORKER HAS A COMMAND OF ITS OWN in the sandbox, so the launcher is given none.
    expect(dsh.argv).not.toContain('--')

    // AN OPENCODE WORKER IS GIVEN ITS COMMAND, after --, with the brief's text as one word. The launcher adds the model
    // and the effort to it itself (tools/sandbox-common.mjs), so the line names neither twice.
    const oc = captured('cw-oc')
    expect(oc.argv.slice(0, 2)).toEqual(['exec', 'cw-boss-sandbox'])
    expect(oc.argv).toEqual(expect.arrayContaining([...under('cw-oc'), '--runtime', 'opencode', '--model', 'opencode-go/gpt-6-luna', '--brief', brief]))
    expect(oc.argv[oc.argv.indexOf('--worktree') + 1]).toBe(join(folder, 'worktrees', 'cw-oc'))
    expect(oc.argv.slice(oc.argv.indexOf('--'))).toEqual(['--', 'opencode', 'run', '--format', 'json', readFileSync(brief, 'utf8')])

    const cast = captured('cw-cast')
    expect(cast.argv.slice(0, 2)).toEqual(['worker', 'cw-boss-sandbox'])
    expect(cast.argv).toEqual(expect.arrayContaining([...under('cw-cast'), '--runtime', 'claude-code', '--model', A_CAST_MODEL]))

    // WHAT EACH STARTING ENTRY KEEPS: what the launcher was given, and the Casting row only when it came from one.
    const given: [string, string, string][] = [
      ['cw-claude', 'claude-code', 'claude-opus-5-5'], ['cw-codex', 'codex', 'openai/gpt-6.1-sol'], ['cw-dsh', 'dsh', 'deepseek-v4.1-flash'],
      ['cw-oc', 'opencode', 'opencode-go/gpt-6-luna'],
    ]
    for (const [handle, runtime, model] of given) {
      const kept = theWorkerRunOf(handle)!
      expect(kept, handle).toMatchObject({ state: 'started', started: { run: captured(handle).filed.id }, starting: { runtime, model } })
      expect(kept.starting, handle).not.toHaveProperty('casting')
      expect(kept.starting, handle).not.toHaveProperty('castingSays')
      // A start the ask chose is not rolled, so neither its entry nor its run keeps a roll.
      expect(kept.starting, handle).not.toHaveProperty('castingRoll')
      expect(dataOf(captured(handle).filed.id), handle).not.toHaveProperty('castingRoll')
      expect(dataOf(captured(handle).filed.id), handle).toMatchObject({ servingAgent: handle, runtime, model, parentAttachment: bossRun })
    }
    const fromTheRow = theWorkerRunOf('cw-cast')!
    expect(fromTheRow).toMatchObject({ state: 'started', starting: { runtime: 'claude-code', model: A_CAST_MODEL, casting: castingId } })
    // THE DEFAULT ROUTER (round 44) answers a start whose ask chose nothing. While no Casting row has a probability it
    // takes the marked row and says so, and the starting entry and the worker's run keep the record of how it chose.
    expect(fromTheRow.starting?.castingSays).toBe(`The tools take marked row ${String(castingId)} because no probability is set for worker in every row.`)
    expect(fromTheRow.starting?.castingRoll).toMatchObject({ choice: 'marked', selected: { rowId: castingId, program: 'claude-code', model: A_CAST_MODEL } })
    expect(dataOf(captured('cw-cast').filed.id)['castingRoll']).toEqual(fromTheRow.starting!.castingRoll)
  }, 120_000)
})

describe('4. the starting door reads the kept row again', () => {
  /** A launcher run of the message worker's own for the worker, and its call at the starting door, as a pass makes them. */
  async function atTheStartingDoor(handle: string): Promise<{ status: number; body: Record<string, any> }> {
    const launcher = await call('POST', '/api/records', AS_THE_WORKER(), {
      kind: 'session',
      title: `A made-up launcher run for ${handle}`,
      data: {
        state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: CHECKOUT,
        startedByMoleOffice: true, extra: { purpose: 'worker', run: bossRun, worker: idOf(handle) },
      },
    })
    expect(launcher.status, JSON.stringify(launcher.body)).toBe(201)
    return call('POST', `/api/worker/worker-runs/${bossRun}/starting`, AS_THE_WORKER(), { agent: idOf(handle), wrapper: String(launcher.body['record'].id) })
  }

  it('fails an entry whose chosen row’s model changed, tells the supervisor, and starts nothing', async () => {
    expect((await ask('cw-changed', { brief, runtime: 'codex', model: 'gpt-6-astra' })).status).toBe(202)
    // THE CHOSEN ROW IS CHANGED THROUGH THE CASTING DOOR, by the person, after the ask read it.
    const astra = rowOf.get('codex gpt-6-astra')!
    const changed = await call('PATCH', `/api/casting/rows/${String(astra)}`, AS_THE_PERSON, { model: { value: 'gpt-made-up-9' } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const toldBefore = linesToTheSupervisor().length
    const r = await atTheStartingDoor('cw-changed')
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const says =
      `Casting row ${String(astra)} changed after the ask chose it: the ask read codex with the model gpt-6-astra and no effort, and it now casts ` +
      'codex with the model gpt-made-up-9 and no effort. It is not swapped for another row and not rolled again.'
    expect(r.body['error']).toBe(`${says} The ask is now failed. Nothing was started.`)
    expect(theWorkerRunOf('cw-changed')).toMatchObject({ state: 'failed', failed: { says } })
    expect(theWorkerRunOf('cw-changed')).not.toHaveProperty('starting')
    expect(linesToTheSupervisor().length).toBe(toldBefore + 1)
  })

  it('fails an entry whose rolled row’s model changed, tells the supervisor, and starts nothing', async () => {
    const asked = await ask('cw-row-changed', { brief })
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    expect(theWorkerRunOf('cw-row-changed')?.castingRoll).toMatchObject({ choice: 'marked', selected: { rowId: castingId, program: 'claude-code', model: A_CAST_MODEL } })
    // THE ROLLED ROW IS CHANGED THROUGH THE CASTING DOOR, by the person, after the ask read it. The start reads the row
    // the ask kept and does not roll again (round 46), so no other row is taken.
    const changed = await call('PATCH', `/api/casting/rows/${String(castingId)}`, AS_THE_PERSON, { model: { value: A_MODEL_OF_THIS_TEST } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const toldBefore = linesToTheSupervisor().length
    const r = await atTheStartingDoor('cw-row-changed')
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const row = String(castingId)
    const says =
      `Casting row ${row} changed after the ask chose it: the ask read claude-code with the model ${A_CAST_MODEL} and the effort high, and it now ` +
      `casts claude-code with the model ${A_MODEL_OF_THIS_TEST} and the effort high. It is not swapped for another row and not rolled again.`
    expect(r.body['error']).toBe(`${says} The ask is now failed. Nothing was started.`)
    expect(theWorkerRunOf('cw-row-changed')).toMatchObject({ state: 'failed', failed: { says } })
    expect(theWorkerRunOf('cw-row-changed')).not.toHaveProperty('starting')
    expect(linesToTheSupervisor().length).toBe(toldBefore + 1)
  })
})

describe('5. the launcher’s exec command line', () => {
  const asked = {
    verb: 'exec' as const, parent: 'Rs-made-up',
    session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: '/nowhere/out', key: null,
    instance: 'cw-boss-sandbox', sandboxes: '/nowhere/sandboxes', handle: 'cw-dsh', brief: '/nowhere/sandboxes/cw-boss-sandbox/brief.md',
    model: 'deepseek-v4.1-flash', runtime: 'dsh',
  }

  it('is exec --agent with --runtime dsh, --brief and --worktree, under the message worker’s name, with --parent', () => {
    const line = new RoundAdapter({ PATH: process.env['PATH'] }).commandFor({ ...asked, worktree: '/nowhere/sandboxes/cw-boss-sandbox/worktrees/cw-dsh' })
    expect(line).toEqual({
      command: 'node',
      args: [
        join(CHECKOUT, 'tools/sandbox.mjs'), 'exec', 'cw-boss-sandbox',
        '--sandboxes', '/nowhere/sandboxes', '--agent', 'cw-dsh', '--brief', '/nowhere/sandboxes/cw-boss-sandbox/brief.md',
        '--model', 'deepseek-v4.1-flash', '--runtime', 'dsh', '--worktree', '/nowhere/sandboxes/cw-boss-sandbox/worktrees/cw-dsh',
        '--as', THE_LAUNCHER_ASKS_AS, '--session', 'launcher-run', '--parent', 'Rs-made-up', '--api', 'http://127.0.0.1:1', '--workspace', 'default',
      ],
    })
  })

  it('is not built with no worktree, because a dsh worker would then run in the sandbox’s repo/', () => {
    expect(() => new RoundAdapter({ PATH: process.env['PATH'] }).commandFor(asked)).toThrow("The sandbox launcher's exec command for a worker needs --worktree.")
  })
})

describe('6. a rolled Casting row is judged by what the launcher can start', () => {
  /** Recast the marked row by the person. */
  async function recast(program: string, model: string): Promise<void> {
    const r = await call('PATCH', `/api/casting/rows/${String(castingId)}`, AS_THE_PERSON, { program: { value: program }, model: { value: model } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
  }

  it('refuses at the ask a row whose program the launcher cannot start, and writes nothing', async () => {
    // A PROGRAM A ROW MAY NAME that the launcher has no command for, read from the Casting table's own list of programs.
    const aProgramTheLauncherCannotStart = CASTING_PROGRAMS.find((program) => !Object.hasOwn(THE_PROGRAM_A_RUNTIME_RUNS, program))
    expect(aProgramTheLauncherCannotStart, 'the launcher starts every program a Casting row may name, so this case has none to cast').toBeDefined()
    await recast(aProgramTheLauncherCannotStart!, A_MODEL_OF_THIS_TEST)
    const r = await ask('cw-row', { brief })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toBe(
      `The tools take marked row ${String(castingId)} because no probability is set for worker in every row. Row ${String(castingId)} casts ` +
        `"${aProgramTheLauncherCannotStart!}" with the model "${A_MODEL_OF_THIS_TEST}", and the launcher starts a worker only on ${THE_LAUNCHERS_RUNTIMES}. ` +
        'So no worker run of cw-row could be started. Nothing was written.',
    )
    expect(theWorkerRunOf('cw-row')).toBeUndefined()
  })

  it('takes a row with a model of this test’s own, and a row with a Codex model under claude-code', async () => {
    // NO LIST IN THE CODE JUDGES THE MODEL (wave 13n round BQ): the Casting rows are the one list, so a row is started on what it casts.
    const taken: [string, string][] = [['claude-code', A_MODEL_OF_THIS_TEST], ['claude-code', 'gpt-6.1-sol']]
    for (const [program, model] of taken) {
      await recast(program, model)
      const r = await ask('cw-row', { brief })
      expect(r.status, `${program} ${model}: ${JSON.stringify(r.body)}`).toBe(202)
      expect(r.body['says']).toContain(`No model was named, so it is given ${program} with the model ${model}, from row ${String(castingId)} of the Casting table for the worker card.`)
      expect(theWorkerRunOf('cw-row')).toMatchObject({ state: 'wanted', row: { id: castingId, program, model } })
    }
  })

  it('judges what the row starts: a codex row named openai/gpt-6-luna and a marked OpenCode Luna row each start on codex with gpt-6-luna, and are taken', async () => {
    // A ROLL GIVES CODEX LUNA WITHOUT ITS PROVIDER, and the marked OpenCode Luna row starts on Codex (src/shared/casting-roll.ts).
    const startOnCodexLuna: [string, string][] = [['codex', 'openai/gpt-6-luna'], ['opencode', 'opencode-go/gpt-6-luna']]
    for (const [program, model] of startOnCodexLuna) {
      await recast(program, model)
      const r = await ask('cw-row', { brief })
      expect(r.status, `${program} ${model}: ${JSON.stringify(r.body)}`).toBe(202)
      expect(r.body['says']).toContain(`No model was named, so it is given codex with the model gpt-6-luna, from row ${String(castingId)} of the Casting table for the worker card.`)
      expect(theWorkerRunOf('cw-row')).toMatchObject({ state: 'wanted', castingRoll: { choice: 'marked', selected: { program, model } } })
    }
  })
})
