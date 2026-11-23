// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE RUN IS STARTED ON THE CASTING ROW ITS QUEUE KEPT, OR IT IS NOT STARTED.
 *
 * The queue reads the Casting row that a message run's selection or effort comes from, in the project its start reads.
 * It keeps that row on the queue's row with a sentence, or it keeps no row and says so. The start reads the kept row again
 * by its id. A row that was held, removed or changed after the queue read it refuses the start in words. So does a start
 * whose own reading would take another row, or a row where the queue read none. No row is rolled again and none is
 * swapped. A start given no kept row, as from an older office's queue, says that it reads the Casting table as it is now.
 * A start whose office cannot be asked says that the kept row was not read again. A start whose office is older than the
 * check of the kept row is refused, and that office is not asked again without the row.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, listening on a free port, and
 * every agent, Casting row and message is written through its doors as the person. One record is written straight into
 * the database, as made-up data: the session that holds an earlier Casting roll, because only the office writes a roll.
 * The programs started are stand-ins named codex and claude, in a folder of this file's own under the temporary
 * directory. Each adds the words it was given to a file and ends. No model runs. Every model name, native name and
 * effort is made up for each case, and each case checks that the compatibility list names none of them, except where
 * the case says it needs a model the list names. Two more stand-ins answer as an office: one is a port that nothing
 * listens on, and one is a server that answers every request with the 400 an older office gives to a key it does not
 * know.
 *
 * EACH RULE HAS A CASE AT THE QUEUE (Q) AND A CASE AT THE START (S). The queue case reads the row the message worker
 * reads from the queue's door. The start case starts the adapter the message worker makes for that row, with the row's
 * model and its kept row, as the worker does.
 *
 * THE QUEUE READS IN THE START'S PROJECT. With a row in every project and a row in the start's project, the queue's row
 * names the same runtime and model as it did before the queue kept a row, and the start starts on the project's row.
 *
 * THE QUEUE READS EVERY AGENT'S EARLIER ROLL ONCE PER PASS. Read for several agents at once, each agent's roll is the one
 * it has when it is asked alone. That holds for a run that names its agent by id, by handle only, by the handle of a
 * retired agent and by an alias, and for a roll kept on a supervisor's worker-run ask. An agent asked by an old id, as a
 * delivery row written before its alias was filed names it, has the roll of the agent the alias names. In one pass, two
 * agents' queue rows each keep the row of their own roll. A model ask given the roll its caller read takes that roll and
 * reads none itself.
 *
 * THE MUTATIONS, EACH AFTER A CONTROL RUN:
 *   - M1: the selection's row is the row in force alone, not the one row the name matches. Q3 and S3 go red.
 *   - M2: the start does not read the kept row again. The held, removed and changed kept-row cases go red.
 *   - M3: the start never finds another row than the kept one. The swapped and the none-then-a-row cases go red.
 *   - M4: answer() does not read the earlier roll. Q11 and S11 go red.
 *   - M5: the agents' runs are narrowed with no handle. 13a goes red for the handle-only and the retired agents.
 *   - M5b: the agents' runs are narrowed with no alias. 13a goes red for the aliased agent, and 13b for the old id.
 *   - M6: every agent asked at once is given the first agent's roll. 13b goes red.
 *   - M9: each id is read as it was asked, not as the canonical id its alias names. 13b goes red for the old id.
 *   - M7: the queue hands every recipient the first queued recipient's roll. Q14 goes red.
 *   - M8: answer() reads the roll itself when its caller gives one. 15 goes red.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import type { CastingSelection } from '../src/shared/casting.ts'
import { theCastingRoll } from '../src/shared/casting-roll.ts'
import { runtimeShownName, THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheRowAWorkerIsGiven } from '../src/shared/worker-runs.ts'
import { onePass, whatTheWorkerLastSaidAbout, type WorkerSettings } from '../src/worker/index.ts'
import { adapterFor } from '../src/worker/runtimes/index.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const as = (agent: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent, 'x-mole-office-workspace': WORKSPACE })
const LISTED = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }

/** The sentences the queue keeps with its row, and the ones a start is refused with. */
const gives = (id: number) => `Casting row ${String(id)} gives this run its selection.`
const wouldGive = (id: number) => `Casting row ${String(id)} would give this run its selection, and it is held.`
const givesTheEffort = (id: number) => `Casting row ${String(id)} gives this run its effort.`
const NO_ROW = 'No Casting row gives this run its selection or its effort.'
const NOT_SWAPPED = 'It is not swapped for another row and not rolled again.'
const aRowOrNone = (id: number | null) => (id === null ? 'no Casting row' : `Casting row ${String(id)}`)
const moved = (kept: number | null, now: number | null) =>
  `The queue read ${aRowOrNone(kept)} for this message run, and its start would read ${aRowOrNone(now)}. The run is not moved to the other row.`
const refusedBecause = (said: string) => `The office refused this run: ${said}${said.endsWith('.') ? '' : '.'} Nothing was started.`
const NOTHING_KEPT = 'No Casting row was kept for this start when it was asked, so it reads the Casting table as it is now.'
const notReadAgain = (id: number) =>
  `The office could not be asked, so Casting row ${String(id)}, which the queue read for this message run, was not read again, and the run starts on the owner's rule.`
const THE_OFFICE_IS_OLDER = "This run is not started: the office it asks is older than the check that reads the queue's Casting row again. Nothing was filed."

/** One row of the message worker's queue, as far as this file reads it. */
interface Queued {
  messageId: string
  runtime: string | null
  model: string | null
  variant: string | null
  kept?: { row: TheRowAWorkerIsGiven | null; says: string }
}

let t: TestDb
let app: FastifyInstance
let api = ''
/** This file's own folder: the stand-ins' bin, the runs' working folder and their output. */
let folder = ''
/** The file the whole pass's stand-ins add their words to. */
let wholePass = ''
/** The thread each stand-in program prints, the same in every folder of stand-ins. */
const THE_THREADS = { codex: randomUUID(), claude: randomUUID() }
let checkout: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
const groups = new Set<number>()
/** Every run-models question the office was asked over its port, in order. */
const asked: string[] = []
/** Done once, before the office answers the next run-models question about this agent over its port, when a case sets it. */
let beforeTheNextAnswer: { agent: string; then: () => Promise<void> } | null = null
/** Registry ids, by handle. */
const ids: Record<string, string> = {}

const CODEX = 'kept-codex'
const CLAUDE = 'kept-claude'
const ROLLED = 'kept-rolled'
const PASSED = 'kept-passed'
const MOVED = 'kept-moved'

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  // THE QUESTIONS A START ASKS reach the office over its port; a case may change the table just before one is answered.
  app.addHook('onRequest', async (request) => {
    if (request.method !== 'GET' || !request.url.startsWith('/api/office/run-models/for/')) return
    asked.push(request.url)
    const before = beforeTheNextAnswer
    if (before === null || !request.url.startsWith(`/api/office/run-models/for/${before.agent}?`)) return
    beforeTheNextAnswer = null
    await before.then()
  })
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await theseAgents([[CODEX, 'codex'], [CLAUDE, 'claude-code'], [ROLLED, 'codex'], [PASSED, 'codex'], [MOVED, 'codex']])
  folder = mkdtempSync(join(tmpdir(), 'a-message-run-on-its-kept-row-'))
  mkdirSync(join(folder, 'work'))
  mkdirSync(join(folder, 'outputs'))
  wholePass = join(folder, 'whole-pass.seen.json')
  theStandIns(join(folder, 'bin'), wholePass)
  checkout = aCheckoutForATestRun()
  settings = {
    api,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout,
    runs: 2,
    hops: 3,
    outputRoot: join(folder, 'outputs'),
    env: { ...withoutInheritedEffort(), PATH: `${join(folder, 'bin')}:${process.env['PATH'] ?? ''}`, HOME: folder },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) if (left.adapter.alive(left.handle)) left.adapter.stop(left.handle, 'the test is over')
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await app?.close()
  t?.close()
  rmSync(folder, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
})

/** A model, its native name and two efforts made up for this case, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}`, other: `other-effort-${key}` }
  for (const name of [made.model, made.native]) expect(LISTED.aliases[name] ?? LISTED.startValues[name]).toBeUndefined()
  return made
}

/** A model the compatibility list names for `runtime`, alone and with the provider the runtime runs in front. */
function aListedModelOf(runtime: 'codex' | 'claude-code'): string {
  const model = Object.keys(LISTED.aliases).find((name) => !name.includes('/') && Object.hasOwn(LISTED.aliases, `${String(THE_PROVIDER_A_RUNTIME_RUNS[runtime])}/${name}`))
  expect(model, `a ${runtime} model the compatibility list names`).toBeDefined()
  return model!
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: AS_THE_PERSON, ...(payload === undefined ? {} : { payload: payload as never }) })
}

/** EVERY ROW OF THE WORKER CARD, in every scope, removed as the person, so the card has no row anywhere. */
async function noRow(): Promise<void> {
  const table = (await call('GET', '/api/casting')).json() as { roles: { role: string; scopes: { castings: { id: number; marked: boolean }[] }[] }[] }
  for (const scope of table.roles.find((one) => one.role === THE_WORKER)?.scopes ?? []) {
    // The marked row last: the office refuses to remove it while another row of its scope is left.
    for (const row of [...scope.castings].sort((one, other) => Number(one.marked) - Number(other.marked))) {
      const removed = await call('DELETE', `/api/casting/rows/${String(row.id)}`)
      expect(removed.statusCode, removed.body).toBe(200)
    }
  }
}

/**
 * A ROW OF THE WORKER CARD, written as the person: `program` with `model` and `effort`, native data naming `native` unless
 * it is null, in every project unless `project` names one. The first row of a scope carries the mark. Its id.
 */
async function aRow(program: 'claude-code' | 'codex', model: string, effort: string | null, native: string | null, project: string | null = null): Promise<number> {
  const written = await call('POST', `/api/casting/${THE_WORKER}`, {
    program: { value: program }, model: { value: model }, effort: { value: effort },
    ...(native === null ? {} : { native: { model: native, provider: null, variant: null } }),
    ...(project === null ? {} : { project }),
  })
  expect(written.statusCode, written.body).toBe(201)
  return (written.json() as { casting: { id: number } }).casting.id
}

/** The agent's own model, set on its profile as the person sets it, or cleared with null. */
async function theAgentsOwnModel(handle: string, model: string | null): Promise<void> {
  const reply = await call('POST', `/api/office/run-models/agent/${handle}`, { model })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** What the row's own selection door answers. */
async function theRowsSelection(id: number): Promise<CastingSelection> {
  const reply = await call('GET', `/api/casting/rows/${String(id)}/selection`)
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: CastingSelection }).selection
}

/** A native row as the queue reads it: by its selection revision. */
async function asTheQueueReadsIt(id: number): Promise<TheRowAWorkerIsGiven> {
  const selection = await theRowsSelection(id)
  return { id, revision: selection.casting!.revision, program: selection.runtime, model: selection.model, effort: selection.native.effort }
}

/**
 * HOLD THE ROW as a native refusal holds it: a session record names the row's selection as the one it was started with,
 * and the refusal is reported for that run as the person. Gives back the hold's sentence without its ending, as a start
 * that reads the row again names it.
 */
async function hold(id: number, servingAgent: string): Promise<string> {
  const selection = await theRowsSelection(id)
  const run = await call('POST', '/api/records', { kind: 'session', title: 'Synthetic: a run started from a held row', data: {
    runtime: selection.runtime, model: selection.model, servingAgent, state: 'running', extra: { launcherSelection: selection },
  } })
  expect(run.statusCode, run.body).toBe(201)
  const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' }
  const held = await call('POST', `/api/casting/rows/${String(id)}/hold`, { revision: selection.casting!.revision, run: (run.json() as { record: { id: string } }).record.id, refusal })
  expect(held.statusCode, held.body).toBe(200)
  const refused = await call('GET', `/api/casting/rows/${String(id)}/selection`)
  expect(refused.statusCode, refused.body).toBe(409)
  const says = (refused.json() as { error: string }).error
  expect(says).toMatch(/ Nothing was started\.$/)
  return says.replace(/ Nothing was started\.$/, '')
}

/** A message to the agent, filed and queued as the person files and queues one. Its id. */
async function aMessageTo(handle: string): Promise<string> {
  const filed = await call('POST', '/api/records', { kind: 'message', title: `Synthetic: something for ${handle}`, data: { body: 'Synthetic: please say something.', to: [{ kind: 'agent', id: ids[handle] }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.statusCode, filed.body).toBe(409)
  const id = (filed.json() as { record: { id: string } }).record.id
  const queued = await call('POST', `/api/messages/${id}/start-an-agent`, {})
  expect(queued.statusCode, queued.body).toBeLessThan(300)
  return id
}

/** THE QUEUE'S ROW for this message, read as the message worker reads it. */
async function theQueuedRow(messageId: string): Promise<Queued> {
  const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: as(THE_MESSAGE_WORKER_ID) })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  return one((reply.json() as { queue: Queued[] }).queue.filter((row) => row.messageId === messageId), `the queue's row for ${messageId}`)
}

/** The value after `flag`, where the command has it once. */
function theOne(command: string[], flag: string): string | undefined {
  expect(command.filter((word) => word === flag), `${flag} in ${JSON.stringify(command)}`).toHaveLength(1)
  return command[command.indexOf(flag) + 1]
}

/**
 * THE STAND-INS in `bin`: each adds the words it was given as one line of `seen`, and ends. The file is written into
 * each one's text, and is not read from its environment: a Codex is given only the names its list keeps
 * (src/config/the-environment-a-codex-gets.mjs). So each start that needs a file of its own has its own folder of them.
 */
function theStandIns(bin: string, seen: string) {
  mkdirSync(bin, { recursive: true })
  for (const program of ['codex', 'claude'] as const) {
    writeFileSync(join(bin, program), `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs')
const args = process.argv.slice(2)
if (args[0] === '--version') { console.log('${program} stand-in'); process.exit(0) }
fs.appendFileSync(${JSON.stringify(seen)}, JSON.stringify(args) + '\\n')
console.log(JSON.stringify({ type: 'thread.started', thread_id: '${THE_THREADS[program]}' }))
`, { mode: 0o755 })
  }
}

/** Every command line a stand-in was started with, in the file it adds its words to, in order. */
function theLinesIn(seen: string): string[][] {
  return existsSync(seen) ? readFileSync(seen, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as string[]) : []
}

/** Waits until a stand-in has added a line to the file for which `found` holds, and gives every line, for the case to check. */
async function theLinesOnce(seen: string, found: (lines: string[][]) => boolean): Promise<string[][]> {
  const until = Date.now() + 10_000
  while (!found(theLinesIn(seen)) && Date.now() < until) await new Promise((done) => setTimeout(done, 20))
  return theLinesIn(seen)
}

/**
 * START THE ADAPTER THE MESSAGE WORKER MAKES FOR THIS QUEUE ROW: the row's model and variant are the office's choice, and
 * its kept row goes to the start, as the worker passes them. `office` is the address the start asks, this office's
 * unless a case gives another.
 */
async function theStartOf(handle: string, runtime: 'codex' | 'claude-code', row: Pick<Queued, 'model' | 'variant' | 'kept'>, office = api) {
  const name = randomUUID()
  const seen = join(folder, `${name}.seen`)
  const bin = join(folder, `${name}-bin`)
  theStandIns(bin, seen)
  const adapter = adapterFor(runtime, { PATH: `${bin}:${process.env['PATH'] ?? ''}`, HOME: folder }, { model: row.model, variant: row.variant })!
  asked.length = 0
  let handled: Awaited<ReturnType<typeof adapter.start>>
  try {
    handled = await adapter.start({
      session: `synthetic-${name}`, agent: handle, prompt: 'Synthetic: a made-up message.', cwd: join(folder, 'work'), api: office, workspace: WORKSPACE,
      outputPath: join(folder, `${name}.out`),
      ...(row.kept === undefined ? {} : { kept: row.kept }),
    } as Parameters<typeof adapter.start>[0])
  } catch (error) {
    return { argv: null, refused: (error as Error).message, words: null, asked: [...asked], started: existsSync(seen) }
  }
  groups.add(handled.pgid)
  const lines = await theLinesOnce(seen, (all) => all.length > 0)
  return { argv: one(lines, 'the command line the stand-in was started with'), refused: null, words: handled.startWords ?? null, asked: [...asked], started: true }
}

/** The row the start's one question carried, read as JSON, as the office was asked it. */
function theRowItAsked(urls: string[]): unknown {
  const said = new URL(one(urls, "the start's one question"), 'http://office').searchParams.get('row')
  return said === null ? 'no row was asked' : JSON.parse(said)
}

/** The value after -m in each command line. */
const theModelsOf = (lines: string[][]) => lines.map((line) => line[line.indexOf('-m') + 1])

describe('the whole pass: the message worker gives its start the row the queue kept', () => {
  // E1.
  it("starts the run with one question that carries the queue's kept row, and on that row's native model", async () => {
    await noRow()
    await theAgentsOwnModel(PASSED, null)
    const made = unseen()
    const id = await aRow('codex', made.model, made.effort, made.native)
    const message = await aMessageTo(PASSED)
    const row = await theQueuedRow(message)
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
    asked.length = 0
    const started = one((await onePass(settings, watching)).started.filter((run) => run.messageId === message), 'the run started for this message')
    expect(started.agent).toBe(PASSED)
    expect(theRowItAsked(asked.filter((url) => url.startsWith(`/api/office/run-models/for/${PASSED}?`)))).toEqual(row.kept?.row)
    const lines = await theLinesOnce(wholePass, (all) => theModelsOf(all).includes(made.native))
    expect(theModelsOf(lines)).toContain(made.native)
  }, 60_000)

  // E2: WHAT HAPPENS TO THE MESSAGE after its start is refused because the start's own reading takes another row.
  it('keeps the message in the queue with the refusal as its held sentence, and the next pass starts it on the row it then reads', async () => {
    await noRow()
    await theAgentsOwnModel(MOVED, null)
    const made = unseen()
    const first = await aRow('codex', made.model, made.effort, made.native)
    const second = await aRow('codex', made.model, made.effort, `${made.native}-second`)
    const message = await aMessageTo(MOVED)
    expect((await theQueuedRow(message)).kept?.row?.id).toBe(first)
    // BETWEEN THE QUEUE'S READ AND THE START'S, the mark moves to the second row.
    beforeTheNextAnswer = { agent: MOVED, then: async () => {
      const marked = await call('POST', `/api/casting/rows/${String(second)}/mark`, {})
      expect(marked.statusCode, marked.body).toBe(200)
    } }
    const refused = await onePass(settings, watching)
    expect(beforeTheNextAnswer).toBeNull()
    expect(refused.started.filter((run) => run.messageId === message)).toEqual([])
    const because = one(refused.held.filter((held) => held.messageId === message), 'the held message').because
    expect(because).toBe(`The run could not be started: ${refusedBecause(moved(first, second))}`)
    expect(whatTheWorkerLastSaidAbout({ messageId: message, to: { kind: 'agent', id: ids[MOVED]! } })).toBe(because)
    expect((await theQueuedRow(message)).kept?.row?.id).toBe(second)

    const next = one((await onePass(settings, watching)).started.filter((run) => run.messageId === message), 'the run the next pass started')
    expect(next.agent).toBe(MOVED)
    const lines = await theLinesOnce(wholePass, (all) => theModelsOf(all).includes(`${made.native}-second`))
    expect(theModelsOf(lines)).toContain(`${made.native}-second`)
    expect(theModelsOf(lines)).not.toContain(made.native)
  }, 60_000)
})

describe("1. Codex's own card: the codex row in force", () => {
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await theAgentsOwnModel(CODEX, null)
    id = await aRow('codex', made.model, made.effort, made.native)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  it('Q1: the queue keeps the row its selection comes from', async () => {
    expect(row).toMatchObject({ runtime: 'codex', model: made.model })
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })
  it("S1: the start reads the kept row and starts on its native model and effort", async () => {
    const started = await theStartOf(CODEX, 'codex', row)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(made.native)
    expect(started.argv).toContain(`model_reasoning_effort=${JSON.stringify(made.effort)}`)
    expect(theRowItAsked(started.asked)).toEqual(row.kept?.row)
  })
})

describe("2. A setting: the agent's own model, which no row names", () => {
  const listed = aListedModelOf('codex')
  let row: Queued
  beforeAll(async () => {
    await noRow()
    const made = unseen()
    await aRow('codex', made.model, made.effort, made.native)
    await theAgentsOwnModel(CODEX, listed)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  afterAll(async () => { await theAgentsOwnModel(CODEX, null) })
  it('Q2: the queue keeps no row, and says so', () => {
    expect(row).toMatchObject({ runtime: 'codex', model: listed })
    expect(row.kept).toEqual({ row: null, says: NO_ROW })
  })
  it('S2: the start asks with no row, and starts on the profile\'s model', async () => {
    const started = await theStartOf(CODEX, 'codex', row)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(listed)
    expect(theRowItAsked(started.asked)).toBeNull()
  })
})

describe('3. A selection: the one row in force the name matches, which is not the marked row', () => {
  const marked = unseen()
  const named = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await aRow('claude-code', marked.model, marked.effort, marked.native)
    id = await aRow('claude-code', named.model, named.effort, named.native)
    await theAgentsOwnModel(CLAUDE, named.model)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q3: the queue keeps the named row', async () => {
    expect(row).toMatchObject({ runtime: 'claude-code', model: named.model })
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })
  it("S3: the start starts on the named row's native model and effort", async () => {
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '--model')).toBe(named.native)
    expect(theOne(started.argv!, '--effort')).toBe(named.effort)
  })
})

describe('4. A held row', () => {
  const made = unseen()
  let id = 0
  let held = ''
  let row: Queued
  beforeAll(async () => {
    await noRow()
    id = await aRow('claude-code', made.model, made.effort, made.native)
    await theAgentsOwnModel(CLAUDE, made.model)
    held = await hold(id, CLAUDE)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q4: the queue keeps the held row, and says it is held', async () => {
    expect(row.kept?.says).toBe(wouldGive(id))
    expect(row.kept?.row).toMatchObject({ id, program: 'claude-code', model: made.model, effort: made.effort })
  })
  it("S4: the start is refused in the hold's words", async () => {
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(held))
  })
})

describe('5. A name two rows match with different models', () => {
  const made = unseen()
  const aNameBothRowsGive = `${String(THE_PROVIDER_A_RUNTIME_RUNS['claude-code'])}/${made.native}`
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await aRow('claude-code', made.model, made.effort, made.native)
    await aRow('claude-code', `${made.model}-second`, made.effort, made.native)
    // THE NATIVE NAME WITH THE PROVIDER THE RUNTIME RUNS IN FRONT, which both rows' selections name.
    await theAgentsOwnModel(CLAUDE, aNameBothRowsGive)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q5: the queue keeps no row', () => {
    expect(row.kept).toEqual({ row: null, says: NO_ROW })
  })
  it("S5: the start is refused in the door's words for the name", async () => {
    const door = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${CLAUDE}?place=conversation&runtime=claude-code&model=${encodeURIComponent(aNameBothRowsGive)}`, headers: as(CLAUDE) })
    expect(door.statusCode, door.body).toBe(409)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause((door.json() as { error: string }).error))
  })
})

describe('6. A row of another program', () => {
  let row: Queued
  beforeAll(async () => {
    await noRow()
    const made = unseen()
    await aRow('claude-code', made.model, made.effort, made.native)
    await theAgentsOwnModel(CODEX, null)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  it('Q6: the queue keeps no row', () => {
    expect(row).toMatchObject({ runtime: 'codex', model: null })
    expect(row.kept).toEqual({ row: null, says: NO_ROW })
  })
  it('S6: the start is refused, and the words name the other program', async () => {
    const started = await theStartOf(CODEX, 'codex', row)
    expect(started.refused).toContain(`is for ${runtimeShownName('claude-code')}, not ${runtimeShownName('codex')}`)
    expect(started.argv).toBeNull()
  })
})

describe.each([
  ['no native data', { native: false, effort: true }, 'has no native model'],
  ['no effort', { native: true, effort: false }, 'has no effort'],
])('7. A Codex row with %s', (_, lacks, words) => {
  let row: Queued
  beforeAll(async () => {
    await noRow()
    const made = unseen()
    await aRow('codex', made.model, lacks.effort === false ? null : made.effort, lacks.native === false ? null : made.native)
    await theAgentsOwnModel(CODEX, null)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  it('Q7: the queue keeps no row', () => {
    expect(row.kept).toEqual({ row: null, says: NO_ROW })
  })
  it('S7: the start is refused in words that say what the row lacks', async () => {
    const started = await theStartOf(CODEX, 'codex', row)
    expect(started.refused).toContain(words)
    expect(started.argv).toBeNull()
  })
})

describe('8a. A row held after the queue read it', () => {
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    id = await aRow('claude-code', made.model, made.effort, made.native)
    await theAgentsOwnModel(CLAUDE, made.model)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q8a: the queue keeps the row', async () => {
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })
  it("S8a: the start reads the row again and is refused in the hold's words", async () => {
    const held = await hold(id, CLAUDE)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(held))
  })
})

describe('8b. A row removed after the queue read it', () => {
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    id = await aRow('claude-code', made.model, made.effort, made.native)
    await theAgentsOwnModel(CLAUDE, made.model)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q8b: the queue keeps the row', async () => {
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })
  it('S8b: the start reads the row again and is refused: the row is no longer in the table', async () => {
    const removed = await call('DELETE', `/api/casting/rows/${String(id)}`)
    expect(removed.statusCode, removed.body).toBe(200)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(`Casting row ${String(id)}, which the queue read for this message run, is no longer in the table.`))
  })
})

describe("8c. A native row's selection changed after the queue read it", () => {
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await theAgentsOwnModel(CODEX, null)
    id = await aRow('codex', made.model, made.effort, made.native)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  it('Q8c: the queue keeps the row at its selection revision', async () => {
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })
  it('S8c: the start reads the row again and is refused: its native selection is not the one the queue read', async () => {
    const changed = await call('PATCH', `/api/casting/rows/${String(id)}`, { native: { model: `${made.native}-changed`, provider: null, variant: null } })
    expect(changed.statusCode, changed.body).toBe(200)
    const started = await theStartOf(CODEX, 'codex', row)
    expect(started.refused).toBe(refusedBecause(`Casting row ${String(id)} changed after the queue read it: its native selection is not the one the queue read. ${NOT_SWAPPED}`))
  })
})

describe("8d. A row with no native data whose effort changed after the queue read it", () => {
  const listed = aListedModelOf('claude-code')
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    id = await aRow('claude-code', listed, made.effort, null)
    await theAgentsOwnModel(CLAUDE, listed)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q8d: the queue keeps the row by its cells', () => {
    expect(row.kept).toEqual({ row: { id, revision: null, program: 'claude-code', model: listed, effort: made.effort }, says: givesTheEffort(id) })
  })
  it('S8d: the start reads the row again and is refused: it casts another effort now', async () => {
    const changed = await call('PATCH', `/api/casting/rows/${String(id)}`, { effort: { value: made.other } })
    expect(changed.statusCode, changed.body).toBe(200)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(
      `Casting row ${String(id)} changed after the queue read it: the queue read claude-code with the model ${listed} and the effort ${made.effort}, ` +
      `and it now casts claude-code with the model ${listed} and the effort ${made.other}. ${NOT_SWAPPED}`,
    ))
  })
})

describe('8e. The mark moved to another row after the queue read the first', () => {
  const listed = aListedModelOf('claude-code')
  const made = unseen()
  let first = 0
  let second = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    first = await aRow('claude-code', listed, made.effort, null)
    second = await aRow('claude-code', listed, made.other, null)
    await theAgentsOwnModel(CLAUDE, listed)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q8e: the queue keeps the marked row', () => {
    expect(row.kept).toEqual({ row: { id: first, revision: null, program: 'claude-code', model: listed, effort: made.effort }, says: givesTheEffort(first) })
  })
  it('S8e: the start is refused, and the run is not moved to the other row', async () => {
    const marked = await call('POST', `/api/casting/rows/${String(second)}/mark`, {})
    expect(marked.statusCode, marked.body).toBe(200)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(moved(first, second)))
  })
})

describe('8f. No row when the queue read, and a row when the start reads', () => {
  const listed = aListedModelOf('claude-code')
  const made = unseen()
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await theAgentsOwnModel(CLAUDE, listed)
    row = await theQueuedRow(await aMessageTo(CLAUDE))
  })
  it('Q8f: the queue keeps no row', () => {
    expect(row.kept).toEqual({ row: null, says: NO_ROW })
  })
  it('S8f: the start is refused, and the run is not moved to the new row', async () => {
    const id = await aRow('claude-code', listed, made.effort, null)
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBe(refusedBecause(moved(null, id)))
  })
})

describe('9. A start given no kept row', () => {
  it('starts, and its words say it reads the Casting table as it is now', async () => {
    await noRow()
    await theAgentsOwnModel(CODEX, null)
    const made = unseen()
    await aRow('codex', made.model, made.effort, made.native)
    const queued = await theQueuedRow(await aMessageTo(CODEX))
    const started = await theStartOf(CODEX, 'codex', { model: queued.model, variant: queued.variant })
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(made.native)
    expect(`${String(started.words)}.`).toContain(NOTHING_KEPT)
  })
})

describe('10. A kept row and an office that cannot be asked or does not know the row', () => {
  const listed = aListedModelOf('codex')
  const made = unseen()
  let id = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    // A ROW THAT NAMES A LISTED MODEL, so that a start with no office can still start on it.
    id = await aRow('codex', listed, made.effort, made.native)
    await theAgentsOwnModel(CODEX, listed)
    row = await theQueuedRow(await aMessageTo(CODEX))
  })
  afterAll(async () => { await theAgentsOwnModel(CODEX, null) })

  it('Q10: the queue keeps the row', async () => {
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(id), says: gives(id) })
  })

  it('10a: an office that cannot be asked: the start goes on, and its words say the kept row was not read again', async () => {
    const gone = createServer()
    await new Promise<void>((done) => gone.listen(0, '127.0.0.1', done))
    const port = (gone.address() as AddressInfo).port
    await new Promise<void>((done) => gone.close(() => done()))
    const started = await theStartOf(CODEX, 'codex', row, `http://127.0.0.1:${String(port)}`)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(listed)
    expect(`${String(started.words)}.`).toContain(notReadAgain(id))
  })

  it.each([
    ['the row alone', 'Which run to answer for Unrecognized key: "row"'],
    ['the model and the row', 'Which run to answer for Unrecognized keys: "model", "row"'],
  ])('10b: an office that does not know %s: the start is refused, nothing is filed, and it is not asked again', async (_, error) => {
    const seen: string[] = []
    const older: Server = createServer((request, response) => {
      seen.push(`${String(request.method)} ${String(request.url)}`)
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error }))
    })
    await new Promise<void>((done) => older.listen(0, '127.0.0.1', done))
    try {
      const started = await theStartOf(CODEX, 'codex', row, `http://127.0.0.1:${String((older.address() as AddressInfo).port)}`)
      expect(started.refused).toBe(THE_OFFICE_IS_OLDER)
      expect(seen, JSON.stringify(seen)).toHaveLength(1)
      expect(seen[0]).toMatch(new RegExp(`^GET /api/office/run-models/for/${CODEX}\\?`))
      expect(theRowItAsked([seen[0]!.slice(4)])).toEqual(row.kept?.row)
    } finally {
      await new Promise<void>((done) => older.close(() => done()))
    }
  })
})

describe("11. An earlier Casting roll chose a row that is not the row in force, for the same Office model", () => {
  const made = unseen()
  let inForce = 0
  let rolled = 0
  let row: Queued
  beforeAll(async () => {
    await noRow()
    await theAgentsOwnModel(ROLLED, null)
    inForce = await aRow('codex', made.model, made.effort, made.native)
    rolled = await aRow('codex', made.model, made.other, `${made.native}-rolled`)
    // THE ROLL, as an earlier run of this agent holds it.
    aMadeUpRun({ servingAgentId: ids[ROLLED], state: 'finished', castingRoll: aRollOf(rolled, made.model, made.other) }, '2026-10-13 10:00:00')
    row = await theQueuedRow(await aMessageTo(ROLLED))
  })
  it('Q11: the queue keeps the rolled row, as the start reads it', async () => {
    expect(row).toMatchObject({ runtime: 'codex', model: made.model })
    expect(row.kept).toEqual({ row: await asTheQueueReadsIt(rolled), says: gives(rolled) })
    expect(rolled).not.toBe(inForce)
  })
  it("S11: the start starts on the rolled row's native model", async () => {
    const started = await theStartOf(ROLLED, 'codex', row)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(`${made.native}-rolled`)
  })
  it("Q11b: with the rolled row removed, the queue keeps no row and the table's words for it", async () => {
    const removed = await call('DELETE', `/api/casting/rows/${String(rolled)}`)
    expect(removed.statusCode, removed.body).toBe(200)
    row = await theQueuedRow(await aMessageTo(ROLLED))
    expect(row.kept).toEqual({ row: null, says: `There is no casting with the id ${String(rolled)}. Nothing was written.` })
  })
  it('S11b: with the rolled row removed, the start fails in the same words', async () => {
    const started = await theStartOf(ROLLED, 'codex', row)
    expect(started.refused).toMatch(/^The office could not answer the run's effort \(404/)
    expect(started.refused).toContain(`There is no casting with the id ${String(rolled)}. Nothing was written.`)
    expect(started.argv).toBeNull()
  })
})

describe("12. A run whose model the queue reads, with a row in every project and a row in the start's project", () => {
  // THE SAME BEFORE AND AFTER THE QUEUE READS THE START'S PROJECT: the queue's row names the same runtime and model, and
  // the start starts on the project's row. If the queue read every project's row alone, the start would be refused.
  const listed = aListedModelOf('claude-code')
  const made = unseen()
  it("names the same runtime and model on the queue's row, and starts on the project's row", async () => {
    await noRow()
    await aRow('claude-code', listed, made.effort, null)
    await aRow('claude-code', listed, made.other, null, WORKSPACE)
    await theAgentsOwnModel(CLAUDE, listed)
    const row = await theQueuedRow(await aMessageTo(CLAUDE))
    expect(row).toMatchObject({ runtime: 'claude-code', model: listed })
    const started = await theStartOf(CLAUDE, 'claude-code', row)
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '--model')).toBe(listed)
    expect(theOne(started.argv!, '--effort')).toBe(made.other)
  })
})

/** A session written straight into the database, as made-up data, at `at`: only the office writes a Casting roll. Its id. */
function aMadeUpRun(data: Record<string, unknown>, at: string): string {
  const id = `synthetic-run-${randomUUID()}`
  t.client.sqlite.prepare('INSERT INTO records (owner_id, id, workspace_id, kind, title, summary, data, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(THE_TEST_OFFICES_OWNER.id, id, WORKSPACE, 'session', 'Synthetic: an earlier run', 'Fixture only.', JSON.stringify(data), at, at, 'fixture')
  return id
}

/**
 * A ROLL THAT DREW `row`, a codex row with `model` and `effort`, as the office records one. It is a roll across every row,
 * since a made-up model is in no difficulty's group.
 */
function aRollOf(row: number, model: string, effort: string) {
  return theCastingRoll({
    role: THE_WORKER, project: 'default', rows: [{ id: row, program: 'codex', model, effort, probability: 1, marked: false, labels: [], outUntil: null }],
    difficulty: null, named: null, earlier: null, builderModel: null, limits: { limited: [], unreadableStops: [], week: 'The week was not read.' }, random: () => 0.25,
  }).record
}

/** WORKERS REGISTERED AS THE PERSON, each with its runtime, and their registry ids kept in `ids` by handle. */
async function theseAgents(agents: readonly (readonly [string, 'codex' | 'claude-code'])[]): Promise<void> {
  for (const [handle, runtime] of agents) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: THE_WORKER, runtime, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  for (const [handle] of agents) ids[handle] = one(listed.agents.filter((agent) => agent.handle === handle), `the registry row of ${handle}`).id
}

describe("13. Every agent's earlier roll read at once is the roll it has alone", () => {
  const BY_ID = 'kept-roll-by-id'
  const BY_HANDLE = 'kept-roll-by-handle'
  const RETIRED = 'kept-roll-retired'
  const ALIASED = 'kept-roll-aliased'
  const ASKED = 'kept-roll-asked'
  const NONE = 'kept-roll-none'
  const OLD_ID = `synthetic-old-id-${randomUUID()}`
  const runs: Record<string, string> = {}
  beforeAll(async () => {
    await theseAgents([BY_ID, BY_HANDLE, RETIRED, ALIASED, ASKED, NONE].map((handle) => [handle, 'codex'] as const))
    const retired = await call('POST', `/api/participants/agent/${RETIRED}/retire`, { because: 'Synthetic: a retired agent for this case.' })
    expect(retired.statusCode, retired.body).toBe(200)
    const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
    fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: OLD_ID, canonicalId: ids[ALIASED]! }])
    const made = unseen()
    const roll = aRollOf(9001, made.model, made.effort)
    // TWO ROLLS OF ONE AGENT with another agent's run between them: the newer of its own is its roll.
    aMadeUpRun({ servingAgentId: ids[BY_ID], state: 'finished', castingRoll: aRollOf(9002, made.model, made.other) }, '2026-10-10 10:00:00')
    runs[BY_ID] = aMadeUpRun({ servingAgentId: ids[BY_ID], state: 'finished', castingRoll: roll }, '2026-10-12 10:00:00')
    runs[BY_HANDLE] = aMadeUpRun({ servingAgent: BY_HANDLE, state: 'finished', castingRoll: roll }, '2026-10-11 10:00:00')
    runs[RETIRED] = aMadeUpRun({ servingAgent: RETIRED, state: 'finished', castingRoll: roll }, '2026-10-11 11:00:00')
    runs[ALIASED] = aMadeUpRun({ servingAgentId: OLD_ID, state: 'finished', castingRoll: roll }, '2026-10-11 12:00:00')
    // A ROLL KEPT ON A SUPERVISOR'S WORKER-RUN ASK, for an agent none of whose own runs holds one.
    runs[ASKED] = aMadeUpRun({ servingAgentId: ids[BY_ID], state: 'running', workerRuns: { [ids[ASKED]!]: { castingRoll: roll } } }, '2026-10-09 10:00:00')
  })
  it("13a: each agent's roll is found when it is asked alone", async () => {
    const reader = await import('../src/server/lib/casting-roll.ts')
    // EACH AGENT IS CHECKED ON ITS OWN, so a mutation that loses several of them names every one it loses.
    for (const handle of [BY_ID, BY_HANDLE, RETIRED, ALIASED, ASKED]) expect.soft(reader.theEarlierCastingRoll(WORKSPACE, ids[handle]!)?.run, handle).toBe(runs[handle])
    expect(reader.theEarlierCastingRoll(WORKSPACE, ids[NONE]!)).toBeNull()
  })
  it('13b: read for all of them at once, each agent has the roll it has alone, an old id has its agent\'s roll, and no other agent is in the answer', async () => {
    const reader = await import('../src/server/lib/casting-roll.ts')
    const every = [BY_ID, BY_HANDLE, RETIRED, ALIASED, ASKED, NONE].map((handle) => ids[handle]!)
    const all = reader.theEarlierCastingRolls(WORKSPACE, [...every, OLD_ID])
    expect([...all.keys()].sort()).toEqual([...every, OLD_ID].sort())
    for (const id of every) expect(all.get(id), id).toEqual(reader.theEarlierCastingRoll(WORKSPACE, id))
    expect(all.get(ids[NONE]!)).toBeNull()
    // THE OLD ID IS ANSWERED WITH THE ROLL OF THE AGENT ITS ALIAS NAMES, which is the agent the start's door reads it for.
    expect(all.get(OLD_ID)?.run, OLD_ID).toBe(runs[ALIASED])
  })
})

describe('14 and 15. Two agents queued in one pass, each with an earlier roll of its own row', () => {
  const ONE = 'kept-pass-one'
  const TWO = 'kept-pass-two'
  const made = unseen()
  let inForce = 0
  const rolled: Record<string, number> = {}
  let rows: Record<string, Queued> = {}
  beforeAll(async () => {
    await theseAgents([[ONE, 'codex'], [TWO, 'codex']])
    await noRow()
    inForce = await aRow('codex', made.model, made.effort, made.native)
    for (const handle of [ONE, TWO]) {
      rolled[handle] = await aRow('codex', made.model, `${made.other}-${handle}`, `${made.native}-${handle}`)
      aMadeUpRun({ servingAgentId: ids[handle], state: 'finished', castingRoll: aRollOf(rolled[handle]!, made.model, `${made.other}-${handle}`) }, '2026-10-14 10:00:00')
    }
    const messages: Record<string, string> = { [ONE]: await aMessageTo(ONE), [TWO]: await aMessageTo(TWO) }
    // ONE READING OF THE QUEUE, so both rows come from one pass.
    const reply = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: as(THE_MESSAGE_WORKER_ID) })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
    const queue = (reply.json() as { queue: Queued[] }).queue
    rows = Object.fromEntries([ONE, TWO].map((handle) => [handle, one(queue.filter((row) => row.messageId === messages[handle]), `the queue's row for ${handle}`)]))
  })
  it("Q14: each agent's queue row keeps the row its own roll chose", async () => {
    for (const handle of [ONE, TWO]) expect(rows[handle]!.kept, handle).toEqual({ row: await asTheQueueReadsIt(rolled[handle]!), says: gives(rolled[handle]!) })
    expect(new Set([inForce, rolled[ONE], rolled[TWO]]).size).toBe(3)
  })
  it('15: a model ask given the roll its caller read takes that roll, and given none it reads none', async () => {
    const { theModelARunGets } = await import('../src/server/lib/run-models.ts')
    const { theEarlierCastingRoll } = await import('../src/server/lib/casting-roll.ts')
    const ask = (roll?: ReturnType<typeof theEarlierCastingRoll>) =>
      theModelARunGets({ place: 'conversation', agentId: ids[ONE]!, runtime: 'codex', project: WORKSPACE, ...(roll === undefined ? {} : { roll }) }, {})
    expect(ask().selection?.native.model).toBe(`${made.native}-${ONE}`)
    expect(ask(theEarlierCastingRoll(WORKSPACE, ids[ONE]!)).selection?.native.model).toBe(`${made.native}-${ONE}`)
    expect(ask(null).selection?.native.model).toBe(made.native)
  })
})
