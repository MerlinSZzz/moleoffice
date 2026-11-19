// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CASTING ROLL FROM THE ASK TO THE START, AND THE EFFORT OF THE ROW IT CHOSE. Wave 13s round 46, items 1 and 2.
 * A supervisor's ask at `POST /api/agents/<worker>/worker-run` that names no runtime and no model rolls the worker
 * card's Casting table once, through the default router, and keeps the record of the roll on its entry. The start reads
 * that record and does not roll again, so the ask and the start give one row. A rolled dsh or OpenCode row starts
 * through the launcher's `exec` command in the worker's own worktree, as a chosen one does. And the effort the office
 * answers for the run is the rolled row's own, from the 'Casting roll', when the roll chose a row other than the marked
 * one. tests/a-supervisor-chooses-its-workers-model.test.ts proves the rest of the door, and this file copies its setup.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folder, its repository
 * (tests/a-made-up-sandbox-repo.ts) and its container row, the agents, the Casting rows, and the numbers the roll
 * draws, which this file gives `Math.random`. A row's model is a name the launcher's compatibility data knows, read
 * from that data, and no model is run. No real worker is started. The launcher is a script written
 * below, named by MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which keeps what it was given and files the worker's run through the
 * real tools/file-a-run.mjs, and starts nothing. The message worker's agent runtime is a script that refuses, so a run
 * it started would show.
 *
 * THE CASTING TABLE FOR THE WORKER CARD, in row order: a marked claude-code row with effort high and no probability;
 * a codex row with effort low at 20%; a dsh row at 40%; an OpenCode row at 40%. A draw below 0.2 takes the codex row,
 * a draw from 0.2 to below 0.6 takes the dsh row, and a draw from 0.6 takes the OpenCode row.
 *
 * WHAT IS PROVED
 *   1. An ask that names nothing keeps one roll on its entry and says which row it gave. An ask again for the same
 *      worker on the same run, before its run is filed, keeps that roll as it is, however the next draw would fall,
 *      and so does the ask after that.
 *   2. One message worker pass starts each worker on the row its ask rolled, while every draw would now take the
 *      OpenCode row: the codex row with the worker command and its model as openai/<model>, as a chosen codex model
 *      is given (wave 13n round AG); the dsh row and the OpenCode row with exec in their own worktrees,
 *      <sandbox>/worktrees/<worker>. Each starting entry keeps the ask's roll as it is.
 *   3. An ask that names a runtime and a model keeps no roll, and its start keeps none either, nor does its run.
 *   4. The codex row's start is answered effort low, from the 'Casting roll', and the office's run-model door answers
 *      the same. A run of the same worker on a model its roll did not choose is answered as before the roll.
 *   5. (Round 47.) An ask that names a runtime and a model, for a worker whose entry holds a roll that has not started,
 *      keeps that roll on the entry, unused, and an ask after it that names nothing takes it: one roll in all.
 *
 * MUTATION PROOF (after a green control, each alone, restored and checked with cmp, then green again): named in the
 * commit that adds this file, with its logs.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import type { TheWorkerRun } from '../src/shared/worker-runs.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/**
 * A model the launcher's compatibility data knows, read from that data, other than the ones named. No row casts Luna,
 * which a roll renames or skips (src/shared/casting-roll.ts), and the codex row is not gpt-6-astra, which section 3
 * uses as the model no roll chose.
 */
function aKnownModel(names: readonly string[], ...not: string[]): string {
  const model = names.find((one) => !one.endsWith('gpt-6-luna') && !not.includes(one))
  if (model === undefined) throw new Error(`The launcher's compatibility data holds no model of ${names.join(', ')} this file can cast a row with.`)
  return model
}
const THE_ALIASES = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases)
/** The models a runtime's own provider runs, each named as the data file names it without that provider. */
const theModelsOf = (runtime: string): string[] =>
  THE_ALIASES.filter((name) => !name.includes('/') && Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])}/${name}`))

/** The models of the four Casting rows. */
const MARKED_MODEL = aKnownModel(theModelsOf('claude-code'))
const CODEX_MODEL = aKnownModel(theModelsOf('codex'), 'gpt-6-astra')
const DSH_MODEL = aKnownModel(LAUNCHER_MODEL_COMPATIBILITY.dsh.models.filter((name) => !name.includes('/')))
const OPENCODE_MODEL = aKnownModel(THE_ALIASES.filter((name) => name.startsWith('opencode-go/')))

/**
 * THE SYNTHETIC LAUNCHER, as in tests/a-supervisor-chooses-its-workers-model.test.ts. It keeps what it was given,
 * without the key, and files the worker's run through the real tools/file-a-run.mjs under the launcher run, with the
 * supervisor's run as its parent, with the runtime and the model it was given. It starts no container and no agent.
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
let random: MockInstance<() => number>

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

/** Ask for a worker run as or-boss, from its own run, with its own run key, while the roll would draw `draw`. */
async function ask(handle: string, body: Record<string, unknown>, draw: number): Promise<{ status: number; body: Record<string, any> }> {
  random.mockReturnValue(draw)
  return await call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent('or-boss', bossRunKey, bossRun), body)
}

/** What the office answers for a builder run of one worker on a runtime and a model, at its run-model door. */
async function theEffortFor(handle: string, runtime: string, model: string): Promise<Pick<TheModelARunGets, 'effort' | 'effortFrom' | 'says'>> {
  const r = await call('GET', `/api/office/run-models/for/${idOf(handle)}?place=builder&runtime=${runtime}&model=${encodeURIComponent(model)}`, AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  const answered = r.body as TheModelARunGets
  return { effort: answered.effort, effortFrom: answered.effortFrom, says: answered.says }
}

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
}

/** Cast one row of the worker card, by the person, and answer its id. */
async function aCastingRow(program: string, model: string, effort: string | null, probability: string | null): Promise<number> {
  const r = await call('POST', '/api/casting/worker', AS_THE_PERSON, {
    program: { value: program }, model: { value: model },
    ...(effort === null ? {} : { effort: { value: effort } }),
    ...(probability === null ? {} : { probability: { value: probability } }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return Number(r.body['casting'].id)
}

let folder = ''
let brief = ''
let bossRun = ''
let bossRunKey = ''
const row = { marked: 0, codex: 0, dsh: 0, opencode: 0 }
/** What the office answered or-codex for a run on codex gpt-6-astra before any roll, which no roll chose. */
let beforeTheRoll: Awaited<ReturnType<typeof theEffortFor>>

beforeAll(async () => {
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  random = vi.spyOn(Math, 'random')
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
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-one-roll-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })

  await started('or-quill', AS_THE_PERSON, 'secretary')
  await started('or-boss', asOne('or-quill'))
  // THE WORKERS ARE GIVEN NO ROLE, and an agent with none holds the worker card.
  for (const handle of ['or-codex', 'or-dsh', 'or-oc', 'or-named']) await started(handle, asOne('or-boss'))

  // THE WORKER CARD'S CASTING TABLE. The first row cast is the marked one.
  row.marked = await aCastingRow('claude-code', MARKED_MODEL, 'high', null)
  row.codex = await aCastingRow('codex', CODEX_MODEL, 'low', '20%')
  row.dsh = await aCastingRow('dsh', DSH_MODEL, null, '40%')
  row.opencode = await aCastingRow('opencode', OPENCODE_MODEL, null, '40%')
  beforeTheRoll = await theEffortFor('or-codex', 'codex', 'gpt-6-astra')

  // A MADE-UP SANDBOX FOLDER with a brief in it, and the container row `tools/sandbox.mjs up` registers for it.
  folder = join(realpathSync(scratch), 'sandboxes', 'or-boss-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  aMadeUpSandboxRepo(folder, CHECKOUT)
  const container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-14 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-or-boss-sandbox', `Sandbox or-boss-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  // THE STARTER IS THE SECRETARY ON THE HOST, as the one who runs tools/sandbox.mjs is, and it files a run in a sandbox
  // from its own terminal: a run filed from outside every sandbox names one only then
  // (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts).
  const terminal = await call('POST', '/api/records', asOne('or-quill'), { kind: 'session', title: 'or-quill in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  // A RUN OF or-boss IN THE SANDBOX, filed by its starter's key, so the office mints the run its own key.
  const run = await call('POST', '/api/records', asAgent('or-quill', agents.get('or-quill')!.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: 'A made-up supervisor run of or-boss',
    data: {
      state: 'running', servingAgent: 'or-boss', servingAgentId: idOf('or-boss'), runtime: 'claude-code', model: 'claude-made-up-boss-0',
      workingDirectory: CHECKOUT, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  bossRun = String(run.body['record'].id)
  bossRunKey = String(run.body['runKey']?.key)

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
  random?.mockRestore()
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

/** The roll each ask kept, read after the asks, so the start can be held to it. */
const kept = new Map<string, unknown>()

describe('1. an ask that names nothing keeps one roll', () => {
  it('keeps the roll on its entry and says which row it gave', async () => {
    const r = await ask('or-codex', { brief }, 0.1)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    const entry = theWorkerRunOf('or-codex')!
    expect(entry).not.toHaveProperty('chosen')
    expect(entry.castingRoll).toMatchObject({
      choice: 'rolled', group: 'every row', keptFrom: null,
      selected: { rowId: row.codex, program: 'codex', model: CODEX_MODEL, effort: 'low', probability: 0.2, number: 0.1 },
    })
    expect(entry.castingRoll?.skipped).toEqual([expect.objectContaining({ rowId: row.marked, reasons: ['no probability is set'] })])
    expect(r.body['says']).toContain(`with node tools/sandbox.mjs worker --parent ${bossRun}.`)
    expect(r.body['says']).toContain(
      `No model was named, so it is given codex with the model ${CODEX_MODEL}, from row ${String(row.codex)} of the Casting table for the worker card. ` +
        `The every row Casting roll 0.1 chose row ${String(row.codex)} (codex ${CODEX_MODEL}). ` +
        'It starts on that row as the ask read it, and a changed or held row refuses the start. Nothing rolls again when it starts.',
    )
    kept.set('or-codex', entry.castingRoll)
  })

  it('keeps that roll as it is when the same worker is asked for again, twice, however the next draw falls', async () => {
    // EACH LATER DRAW WOULD TAKE THE OPENCODE ROW, so a second roll would show.
    for (const again of [1, 2]) {
      const r = await ask('or-codex', { brief }, 0.7)
      expect(r.status, `ask ${String(again + 1)}: ${JSON.stringify(r.body)}`).toBe(202)
      expect(theWorkerRunOf('or-codex')?.castingRoll, `ask ${String(again + 1)}`).toEqual(kept.get('or-codex'))
      expect(r.body['says'], `ask ${String(again + 1)}`).toContain(`it is given codex with the model ${CODEX_MODEL}, from row ${String(row.codex)}`)
    }
  })

  it('rolls a dsh row and an OpenCode row, and says each runs in its own worktree', async () => {
    const dsh = await ask('or-dsh', { brief }, 0.3)
    expect(dsh.status, JSON.stringify(dsh.body)).toBe(202)
    expect(theWorkerRunOf('or-dsh')?.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: row.dsh, program: 'dsh', model: DSH_MODEL, number: 0.3 } })
    expect(dsh.body['says']).toContain(`with node tools/sandbox.mjs exec --agent or-dsh --runtime dsh --parent ${bossRun}.`)
    expect(dsh.body['says']).toContain(`It runs in its own worktree, ${join(folder, 'worktrees', 'or-dsh')}.`)
    kept.set('or-dsh', theWorkerRunOf('or-dsh')!.castingRoll)

    const oc = await ask('or-oc', { brief }, 0.7)
    expect(oc.status, JSON.stringify(oc.body)).toBe(202)
    expect(theWorkerRunOf('or-oc')?.castingRoll).toMatchObject({ choice: 'rolled', selected: { rowId: row.opencode, program: 'opencode', model: OPENCODE_MODEL, number: 0.7 } })
    expect(oc.body['says']).toContain(`with node tools/sandbox.mjs exec --agent or-oc --runtime opencode --parent ${bossRun}.`)
    expect(oc.body['says']).toContain(`It runs in its own worktree, ${join(folder, 'worktrees', 'or-oc')}.`)
    kept.set('or-oc', theWorkerRunOf('or-oc')!.castingRoll)
  })

  it('keeps no roll on an ask that names a runtime and a model', async () => {
    // THE NAMED MODEL IS THE CODEX ROW'S OWN, because a choice no row of the worker card casts is refused.
    const r = await ask('or-named', { brief, runtime: 'codex', model: CODEX_MODEL }, 0.3)
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf('or-named')).toMatchObject({ chosen: { runtime: 'codex', model: CODEX_MODEL } })
    expect(theWorkerRunOf('or-named')).not.toHaveProperty('castingRoll')
  })
})

describe('2. one pass starts each worker on the row its ask rolled', () => {
  let wrapperOf = new Map<string, string>()
  const captured = (handle: string): { argv: string[]; filed: { ok: boolean; id: string } } =>
    JSON.parse(readFileSync(join(captures, `${wrapperOf.get(idOf(handle))!}.json`), 'utf8')) as { argv: string[]; filed: { ok: boolean; id: string } }
  const under = (handle: string): string[] => ['--agent', handle, '--as', THE_WORKER_ID, '--session', wrapperOf.get(idOf(handle))!, '--parent', bossRun]

  beforeAll(async () => {
    // EVERY DRAW WOULD NOW TAKE THE OPENCODE ROW, so a start that rolled again would show.
    random.mockReturnValue(0.95)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started, 'the pass started an agent run').toEqual([])
    expect(first.workers?.held).toEqual([])
    wrapperOf = new Map((first.workers?.started ?? []).map((one) => [one.agentId, one.wrapper]))
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    expect(rounds).toEqual([])
  }, 120_000)

  it('starts every worker that was asked for', () => {
    expect([...wrapperOf.keys()].sort()).toEqual(['or-codex', 'or-dsh', 'or-oc', 'or-named'].map(idOf).sort())
  })

  it('starts the rolled codex row with the worker command, and keeps the ask’s roll on the start and the run', () => {
    const codex = captured('or-codex')
    expect(codex.argv.slice(0, 2)).toEqual(['worker', 'or-boss-sandbox'])
    // THE LAUNCHER IS GIVEN THE ROW'S MODEL AS openai/<model>, as it is given a chosen codex model (wave 13n round AG),
    // because the real launcher refuses a codex model without openai/ (theNameCodexTakes in tools/sandbox.mjs).
    expect(codex.argv).toEqual(expect.arrayContaining([...under('or-codex'), '--runtime', 'codex', '--model', `openai/${CODEX_MODEL}`]))
    expect(codex.argv).not.toContain('--worktree')
    const entry = theWorkerRunOf('or-codex')!
    expect(entry).toMatchObject({ state: 'started', started: { run: codex.filed.id }, starting: { runtime: 'codex', model: `openai/${CODEX_MODEL}`, casting: row.codex } })
    expect(entry.starting?.castingRoll).toEqual(kept.get('or-codex'))
    expect(dataOf(codex.filed.id)['castingRoll']).toEqual(kept.get('or-codex'))
  })

  it('starts the rolled dsh row through exec in its own worktree', () => {
    const dsh = captured('or-dsh')
    expect(dsh.argv.slice(0, 2)).toEqual(['exec', 'or-boss-sandbox'])
    expect(dsh.argv).toEqual(expect.arrayContaining([...under('or-dsh'), '--runtime', 'dsh', '--model', DSH_MODEL, '--brief', brief]))
    expect(dsh.argv[dsh.argv.indexOf('--worktree') + 1]).toBe(join(folder, 'worktrees', 'or-dsh'))
    expect(dsh.argv).not.toContain('--')
    const entry = theWorkerRunOf('or-dsh')!
    expect(entry).toMatchObject({ state: 'started', started: { run: dsh.filed.id }, starting: { runtime: 'dsh', model: DSH_MODEL, casting: row.dsh } })
    expect(entry.starting?.castingRoll).toEqual(kept.get('or-dsh'))
  })

  it('starts the rolled OpenCode row through exec in its own worktree, with its command after --', () => {
    const oc = captured('or-oc')
    expect(oc.argv.slice(0, 2)).toEqual(['exec', 'or-boss-sandbox'])
    expect(oc.argv).toEqual(expect.arrayContaining([...under('or-oc'), '--runtime', 'opencode', '--model', OPENCODE_MODEL, '--brief', brief]))
    expect(oc.argv[oc.argv.indexOf('--worktree') + 1]).toBe(join(folder, 'worktrees', 'or-oc'))
    expect(oc.argv.slice(oc.argv.indexOf('--'))).toEqual(['--', 'opencode', 'run', '--format', 'json', readFileSync(brief, 'utf8')])
    const entry = theWorkerRunOf('or-oc')!
    expect(entry).toMatchObject({ state: 'started', started: { run: oc.filed.id }, starting: { runtime: 'opencode', model: OPENCODE_MODEL, casting: row.opencode } })
    expect(entry.starting?.castingRoll).toEqual(kept.get('or-oc'))
  })

  it('keeps no roll on the start of an ask that named a runtime and a model, nor on its run', () => {
    const named = captured('or-named')
    expect(named.argv).toEqual(expect.arrayContaining([...under('or-named'), '--runtime', 'codex', '--model', `openai/${CODEX_MODEL}`]))
    const entry = theWorkerRunOf('or-named')!
    expect(entry).toMatchObject({ state: 'started', starting: { runtime: 'codex', model: `openai/${CODEX_MODEL}` } })
    expect(entry).not.toHaveProperty('castingRoll')
    expect(entry.starting).not.toHaveProperty('casting')
    expect(entry.starting).not.toHaveProperty('castingRoll')
    expect(dataOf(named.filed.id)).not.toHaveProperty('castingRoll')
  })
})

describe('3. the effort of the rolled row', () => {
  it('answers the rolled codex row’s start effort low, from the Casting roll, and the run-model door answers the same', async () => {
    const said = `The run gets effort low from Casting row ${String(row.codex)}, which the agent's Casting roll chose.`
    expect(theWorkerRunOf('or-codex')?.starting).toMatchObject({ effort: 'low', effortFrom: 'Casting roll' })
    expect(theWorkerRunOf('or-codex')?.starting?.effortSays).toContain(said)
    const door = await theEffortFor('or-codex', 'codex', CODEX_MODEL)
    expect(door).toMatchObject({ effort: 'low', effortFrom: 'Casting roll' })
    expect(door.says).toContain(said)
  })

  it('answers a run of the same worker on a model its roll did not choose as it did before the roll', async () => {
    expect(beforeTheRoll.effortFrom).not.toBe('Casting roll')
    expect(await theEffortFor('or-codex', 'codex', 'gpt-6-astra')).toEqual(beforeTheRoll)
  })
})

describe('4. a named ask keeps an unstarted roll (round 47)', () => {
  // Mutation: the named ask replaces the entry and drops the roll. Red: the named ask's entry holds no roll.
  it('keeps the roll on the entry, unused, through a named ask, and the unnamed ask after it takes that roll, so one roll in all', async () => {
    await started('or-again', asOne('or-boss'))
    random.mockClear()
    const first = await ask('or-again', { brief }, 0.1)
    expect(first.status, JSON.stringify(first.body)).toBe(202)
    const roll = theWorkerRunOf('or-again')!.castingRoll
    expect(roll).toMatchObject({ choice: 'rolled', keptFrom: null, selected: { rowId: row.codex, model: CODEX_MODEL, number: 0.1 } })

    // EVERY LATER DRAW WOULD TAKE THE OPENCODE ROW, so a second roll would show.
    const named = await ask('or-again', { brief, runtime: 'codex', model: CODEX_MODEL }, 0.7)
    expect(named.status, JSON.stringify(named.body)).toBe(202)
    expect(theWorkerRunOf('or-again')).toMatchObject({ state: 'wanted', chosen: { runtime: 'codex', model: CODEX_MODEL } })
    expect(theWorkerRunOf('or-again')?.castingRoll).toEqual(roll)
    expect(named.body['says']).toContain(`or-boss chose codex with the model ${CODEX_MODEL}`)
    expect(named.body['says']).toContain('The Casting roll an earlier ask made is kept on the entry, unused, so a later ask that names no model takes it.')

    const unnamed = await ask('or-again', { brief }, 0.7)
    expect(unnamed.status, JSON.stringify(unnamed.body)).toBe(202)
    expect(theWorkerRunOf('or-again')).not.toHaveProperty('chosen')
    expect(theWorkerRunOf('or-again')?.castingRoll).toEqual(roll)
    expect(unnamed.body['says']).toContain(`it is given codex with the model ${CODEX_MODEL}, from row ${String(row.codex)}`)
    expect(random).toHaveBeenCalledTimes(1)
  })
})
