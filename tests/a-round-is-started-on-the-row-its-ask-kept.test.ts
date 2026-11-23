// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEXT ROUND IS STARTED ON THE CASTING ROW ITS ASK KEPT (wave 13n round BT). The next-round door asked nothing about
 * the round's model, and the start read the Casting row in force when it started, so a row marked between the ask and
 * the start was taken, and a round the start would refuse was taken at the ask. The launcher refused a round's
 * --selection, so a native row reached a round only through the compiled list. Now the ask works out the row by the
 * rule the start reads, refuses in the same words where the start would fail, and keeps the row as it read it (its id,
 * its selection revision, its program, model and effort), or the model of the run it continues when no row is in
 * force. The start reads that row again by its id. A held, removed or changed row fails the start in words, and no
 * other row is taken. The cap of Claude supervisors reads the same kept row. The round launcher is given a native
 * row's selection with --selection, and its start rechecks that selection with the office.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folders and their container rows, the agents, every
 * Casting row and every model name and effort. No real round is started, and no model is run. The worker's launcher is
 * a script written below, named by MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which keeps its command line, files nothing and
 * starts nothing. The message worker is given the folder `aCheckoutForATestRun()` makes as its checkout, and its agent
 * runtime is a script that refuses, so a run it started would show. A row is held through the hold door, against a
 * session record this file files as the run started from the row; nothing ran. The real launcher is run only where it
 * refuses before it asks the office anything, with --api at a closed port. Its commandRound is run with stand-ins for
 * the sandbox, the helper and the filing, and asks only this file's office.
 *
 * WHAT IS PROVED, each rule once at the ask and once at the starting door:
 *   R1n. A native row: the ask keeps its selection revision, one message worker pass gives the launcher the row's
 *        selection as --selection, before --as, and the starting door answers that selection.
 *   R1.  A row with no native data: the ask keeps it with no revision and says so. Another row marked after the ask is
 *        not taken: the start starts the kept row's model, with its effort, and no selection.
 *   R2.  No row in force: the ask keeps the run's model and says so. A row added after the ask is not taken.
 *   R3.  A row that casts another runtime: the ask keeps the run. At the start, after
 *        the run's runtime changed, it fails in the kept row's words: its program, model and the run's other runtime.
 *   R4.  A model of the wrong shape or provider: a row's model under another provider, and a run's model a command line
 *        cannot carry, are refused at the ask. At the start, after the kept entry was changed in the database to match,
 *        each fails in the same words.
 *   R5.  A held row: refused at the ask in the hold's own words. A row held after the ask fails the start in them.
 *   R6.  A name two rows match: refused at the ask in the reader's words. A second row added after the ask fails the
 *        start in them.
 *   R7.  The kept row changed in its cells, changed in its native selection, or was removed after the ask: each fails
 *        the start in words, and no other row is taken.
 *   R8.  An ask made before an ask kept its row: asked again, the new ask keeps the row. Started, it starts on the row
 *        in force now, and says so.
 *   R9.  The cap of Claude supervisors reads the kept row: a round kept on a Claude Code row is left out while the cap is
 *        full, even when a Codex row was marked after the ask. An ask that keeps no row is read by the row in force.
 *   R10. The real launcher's round command takes --selection and refuses one that is not JSON, or is for another
 *        runtime, in theSelectionGiven's words. Its commandRound gives the selection to the office's start values and
 *        to the run it files. A selection whose recheck the office refuses is refused in the recheck's words, and the
 *        run before is not continued: nothing is filed and nothing is started.
 *
 * THE MUTATIONS, AFTER A CONTROL RUN, each alone, restored and checked with cmp:
 *   - theHoldOn answers null: R5 goes red at the ask and at the start;
 *   - the rule's check of another runtime is removed: R3 goes red at the start;
 *   - the rule's provider part is removed: R4's row cases go red at the ask and at the start;
 *   - the rule's effort catch throws again: R6 goes red at the ask and at the start;
 *   - the start reads the row in force instead of the kept row: R1's start and R9 go red;
 *   - the starting door answers no selection: R1n goes red;
 *   - the round command builder refuses --selection again: R1n goes red;
 *   - commandRound gives the start values no selection: R10's start goes red;
 *   - the start values skip the office's recheck of a given selection: R10's recheck goes red;
 *   - a round given no --title does not take the title of the run it continues: R10's start and recheck go red;
 *   - commandRound starts a new conversation for every run --continues names: R10's start and recheck go red.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { runInNewContext } from 'node:vm'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  aNameNamesTheSelection,
  readLauncherSelection,
  THE_PROGRAM_A_RUNTIME_RUNS,
  theRuntimeTheMapDoesNotHoldWords,
  theRuntimeWithNoCommandWords,
} from '../src/config/launcher-selection.mjs'
import { THE_PROVIDER_A_RUNTIME_RUNS } from '../src/config/runtime-native-providers.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { normaliseCastingOutUntil, type CastingSelection } from '../src/shared/casting.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theClockZone } from '../src/shared/time.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { A_ROUNDS_RULES } from '../src/shared/round-chapters/delivery.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { THE_LAUNCHER_ASKS_AS } from '../src/worker/runtimes/round.ts'
import { aCommandsStartFromTheOffice, aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** This worktree, read for the real launcher. */
const THIS_WORKTREE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const LAUNCHER = join(THIS_WORKTREE, 'tools', 'sandbox.mjs')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const WORKSPACE = 'default'
const SECRETARY = 'rk-secretary'
const THE_CAP = 'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE'
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/** A word made up for this run, so no model name of the office can match one made from it. */
const UNSEEN = randomUUID().slice(0, 8)
const aModel = (letter: string): string => `made-up-${UNSEEN}-${letter}`
const anEffort = (letter: string): string => `effort-made-up-${UNSEEN}-${letter}`
/** The model each made-up run before the round names. */
const A_PREVIOUS_MODEL = aModel('previous')
const CLAUDES_PROVIDER = THE_PROVIDER_A_RUNTIME_RUNS['claude-code']!
const CODEXS_PROVIDER = THE_PROVIDER_A_RUNTIME_RUNS['codex']!
/** A model under Codex's provider, which Claude Code cannot run. */
const underCodex = (letter: string): string => `${CODEXS_PROVIDER}/${aModel(letter)}`

/** What the ask says after its own sentence about the row it kept, and about the model it kept with none. */
const THE_KEPT_ROW = 'The start reads that row again by its id, and a changed, held or removed row fails the start.'
const THE_KEPT_MODEL = 'The start keeps that model, and a row added before the round starts is not taken.'
/** What the start adds when the ask kept no row because it was made before an ask kept one. */
const READ_NOW = 'The ask was made before an ask kept its row, so the start read the row in force now.'
/** What a refused start ends with, after the reason. */
const FAILED = ' The ask is now failed. Nothing was started.'
const NOT_SWAPPED = 'It is not swapped for another row and not rolled again.'

/** The Casting row's sentence for a round: at the ask, or at the start, which names when the row was read. */
const theRowSays = (row: number, cast: string, runtime: string, atTheStart: boolean): string =>
  `Casting row ${String(row)}, in force for ${THE_SUPERVISOR}${atTheStart ? ' when the round was asked for' : ''}, names ${cast} for ${runtime}, so the round starts ${cast}.`
/** A row in force that casts claude-code, for a round that continues a run on another runtime. */
const anotherRuntime = (row: number, model: string, run: string, runtime: string, atTheStart: boolean): string =>
  `Casting row ${String(row)}, in force for ${THE_SUPERVISOR}${atTheStart ? ' when the round was asked for' : ''}, casts claude-code with ${model}, ` +
  `and the round continues run ${run} on ${runtime}, so it cannot take its model from that row.`

/**
 * THE SYNTHETIC LAUNCHER. It keeps the command line it was given, without the key, files nothing and starts nothing,
 * so the next pass finds the round's launcher ended with no run filed.
 */
const FAKE_LAUNCHER = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const argv = process.argv.slice(2)
writeFileSync(join(process.env.ROW_KEPT_CAPTURES, argv[argv.indexOf('--session') + 1] + '.json'), JSON.stringify({ argv }))
process.stdout.write('The made-up launcher kept its command line and filed nothing.\\n')
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
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const AS_THE_WORKER = (): Record<string, string> => asAgent(THE_LAUNCHER_ASKS_AS, A_MADE_UP_OFFICE_KEY)

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const { 'content-type': _type, ...withoutAType } = headers
  const r = await app.inject({ method, url, headers: payload === undefined ? withoutAType : headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. */
async function started(handle: string, role: string | null, by: Record<string, string> = AS_THE_PERSON, runtime = 'claude-code'): Promise<void> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, ...(role === null ? {} : { role }), runtime })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id: (r.body['agent'] as { id: string }).id, key })
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

/** A made-up sandbox folder with a brief in it, and the container row `tools/sandbox.mjs up` registers for it. */
function aSandbox(name: string): { folder: string; brief: string; container: string } {
  const folder = join(realpathSync(scratch), 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for ${name}\n\nDo the made-up next round.\n`)
  const container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-31 10:00:00', 'agent:fixture')")
    .run(container, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return { folder, brief, container }
}

/**
 * A LINE: an agent the secretary registered (a supervisor unless `role` says otherwise), and its last run, started in
 * its own sandbox and filed by the secretary, as the launcher files one. `run` replaces fields of that run's data.
 */
async function aLine(handle: string, options: { role?: string | null; runtime?: string; run?: Record<string, unknown> } = {}): Promise<{ run: string; brief: string }> {
  await started(handle, options.role === undefined ? THE_SUPERVISOR : options.role, asOne(SECRETARY), options.runtime ?? 'claude-code')
  const sandbox = aSandbox(`${handle}-sandbox`)
  const run = t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: agents.get(SECRETARY)!.id },
    origin: 'fixture',
    data: {
      state: 'running', servingAgent: handle, servingAgentId: agents.get(handle)!.id, runtime: 'claude-code', model: A_PREVIOUS_MODEL,
      workingDirectory: THIS_WORKTREE, cutFrom: 'main', sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
      ...options.run,
    },
  }).id
  return { run, brief: sandbox.brief }
}

function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
const theEntryOf = (run: string): Record<string, any> | undefined => dataOf(run)['nextRound'] as Record<string, any> | undefined
/** Change the run's data in the database, as only the database can. */
const inTheDatabase = (run: string, words: string, ...values: unknown[]): void =>
  void t.client.sqlite.prepare(`UPDATE records SET data = ${words} WHERE id = ?`).run(...values, run)
const sessions = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n

/** What the office said in full to the person, in each line saying a next round after this run did not start. */
function linesToThePersonAbout(run: string): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aNextRoundDidNotStart'")
      .all(run) as { data: string }[]
  )
    .map((row) => JSON.parse(row.data) as { saidInFull: string; to: { kind: string }[] })
    .filter((line) => line.to.some((to) => to.kind === 'person'))
    .map((line) => line.saidInFull)
}

/** Ask for the next round of a line as the person. */
const ask = (handle: string, line: { brief: string }) => call('POST', `/api/agents/${handle}/next-round`, AS_THE_PERSON, { brief: line.brief })

/** The ask is taken, and its reply. */
async function theAskIsTaken(handle: string, line: { brief: string }): Promise<Record<string, any>> {
  const r = await ask(handle, line)
  expect(r.status, JSON.stringify(r.body)).toBe(202)
  return r.body
}

/** The ask is refused with these words, writes no ask and tells nobody. */
async function theAskIsRefused(handle: string, line: { run: string; brief: string }, says: string): Promise<void> {
  const r = await ask(handle, line)
  expect(r.status, JSON.stringify(r.body)).toBe(409)
  expect(r.body['error']).toBe(`${says} Nothing was written.`)
  expect(theEntryOf(line.run)).toBeUndefined()
  expect(linesToThePersonAbout(line.run)).toEqual([])
}

/** The worker's launcher run for one round, and its call at the starting door, as a pass makes them. */
async function atTheStartingDoor(run: string): Promise<{ status: number; body: Record<string, any> }> {
  const launcher = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for the round after ${run}`,
    data: {
      state: 'running', runtime: 'round-launcher', doing: 'starting a made-up next round; this run runs no model', workingDirectory: checkout,
      startedByMoleOffice: true, extra: { purpose: 'round', round: run },
    },
  })
  expect(launcher.status, JSON.stringify(launcher.body)).toBe(201)
  return call('POST', `/api/worker/rounds/${run}/starting`, AS_THE_WORKER(), { wrapper: String(launcher.body['record'].id) })
}

/** The start fails with these words, the ask keeps them as failed, the person is told, and no run is filed. */
async function theStartFails(run: string, says: string): Promise<void> {
  const before = sessions()
  const r = await atTheStartingDoor(run)
  expect(r.status, JSON.stringify(r.body)).toBe(409)
  expect(r.body['error']).toBe(`${says}${FAILED}`)
  expect(theEntryOf(run)).toMatchObject({ state: 'failed', failed: { says } })
  expect(theEntryOf(run)).not.toHaveProperty('starting')
  expect(linesToThePersonAbout(run)).toEqual([`The next round after run ${run} did not start. ${says}`])
  // THE LAUNCHER RUN THIS CALL FILED, and nothing more.
  expect(sessions()).toBe(before + 1)
}

/** Add a row of a card as the person, marked when `marked` is not false. Its id. */
async function aRow(row: { program: string; model: string; effort?: string; probability?: string; outUntil?: string; native?: { model: string; provider: string | null; variant: string | null }; card?: string; marked?: boolean }): Promise<number> {
  const r = await call('POST', `/api/casting/${row.card ?? THE_SUPERVISOR}`, AS_THE_PERSON, {
    program: { value: row.program }, model: { value: row.model }, effort: { value: row.effort ?? null },
    ...(row.probability === undefined ? {} : { probability: { value: row.probability } }),
    ...(row.outUntil === undefined ? {} : { out_until: { value: row.outUntil } }),
    ...(row.native === undefined ? {} : { native: row.native }),
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = Number(r.body['casting'].id)
  if (row.marked !== false) await mark(id)
  return id
}
async function mark(id: number): Promise<void> {
  const r = await call('POST', `/api/casting/rows/${String(id)}/mark`, AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}
async function change(id: number, body: Record<string, unknown>): Promise<void> {
  const r = await call('PATCH', `/api/casting/rows/${String(id)}`, AS_THE_PERSON, body)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}
async function removeTheRow(id: number): Promise<void> {
  const r = await call('DELETE', `/api/casting/rows/${String(id)}`, AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}
/** Native data made up for a row, so the row has a selection of its own. */
const aNative = (letter: string) => ({ model: aModel(`native-${letter}`), provider: null, variant: null })

/** The selection a row's own door reads. */
async function theSelectionOf(id: number): Promise<CastingSelection> {
  const r = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return (r.body as { selection: CastingSelection }).selection
}

/**
 * HOLD THE ROW as a native refusal holds it: a session record names the row's selection as the one it was started with,
 * and the refusal is reported for that run as the person. Gives back the sentence the row's selection door now refuses
 * with, without its " Nothing was started.", which is the hold's sentence a round says.
 */
async function hold(id: number): Promise<string> {
  const selection = await theSelectionOf(id)
  const run = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'Synthetic: a run started from a held row', data: {
    runtime: selection.runtime, model: selection.model, servingAgent: 'rk-held-runner', state: 'running', extra: { launcherSelection: selection },
  } })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  const refusal = { kind: 'model', code: 'model_not_found', said: 'Synthetic: the native program refused the selected model.' }
  const held = await call('POST', `/api/casting/rows/${String(id)}/hold`, AS_THE_PERSON, { revision: selection.casting!.revision, run: String(run.body['record'].id), refusal })
  expect(held.status, JSON.stringify(held.body)).toBe(200)
  const refused = await call('GET', `/api/casting/rows/${String(id)}/selection`, AS_THE_PERSON)
  expect(refused.status, JSON.stringify(refused.body)).toBe(409)
  const says = String(refused.body['error'])
  expect(says).toMatch(/ Nothing was started\.$/)
  return says.replace(/ Nothing was started\.$/, '')
}

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
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
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-row-its-ask-kept-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })
  checkout = aCheckoutForATestRun()

  await started(SECRETARY, 'secretary')
  await started('rk-held-runner', null)

  const launcher = join(scratch, 'fake-round-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api, workspace: WORKSPACE, session: null, stopWithPid: null, checkout, runs: 2, hops: 3, outputRoot: join(scratch, 'runs'),
    env: { ...process.env, HOME: scratch, MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: noAgentRun, MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher, ROW_KEPT_CAPTURES: captures },
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

// THE CASES RUN IN ORDER. R1n comes first, because its pass starts every round that is wanted, and no other case has
// asked for one yet.

describe('R1n. a native row in force', () => {
  let row = 0
  const cast = aModel('1n')
  const effort = anEffort('1n')

  it('at the ask: keeps the row with its selection revision; one pass gives the launcher its selection before --as', async () => {
    row = await aRow({ program: 'claude-code', model: cast, effort, native: aNative('1n') })
    const selection = await theSelectionOf(row)
    const line = await aLine('rk-native')
    const reply = await theAskIsTaken('rk-native', line)
    expect(reply['says']).toContain(`Run ${line.run}'s nextRound field says where the ask is. ${theRowSays(row, cast, 'claude-code', false)} ${THE_KEPT_ROW}`)
    expect(theEntryOf(line.run)!['row']).toEqual({ id: row, revision: selection.casting!.revision, program: 'claude-code', model: cast, effort })
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run: line.run, wrapper }])
    await launchersEnded(rounds)
    await onePass(settings, [], noMerges(), rounds)
    const { argv } = JSON.parse(readFileSync(join(captures, `${wrapper}.json`), 'utf8')) as { argv: string[] }
    expect(argv[0]).toBe('round')
    expect(argv[argv.indexOf('--model') + 1]).toBe(cast)
    expect(argv).toContain('--selection')
    expect(JSON.parse(argv[argv.indexOf('--selection') + 1]!)).toEqual(selection)
    expect(argv.indexOf('--selection')).toBeLessThan(argv.indexOf('--as'))
  })

  it('at the start: the starting door answers the row’s selection as its own door reads it', async () => {
    const line = await aLine('rk-native-door')
    await theAskIsTaken('rk-native-door', line)
    const r = await atTheStartingDoor(line.run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: cast, modelSays: theRowSays(row, cast, 'claude-code', true) })
    expect(r.body['round']['selection']).toEqual(await theSelectionOf(row))
  })
})

describe('R1. a row in force with no native data', () => {
  it('at the ask: keeps the row with no revision and says the start reads it again; at the start: another row marked after the ask is not taken', async () => {
    const cast = aModel('1')
    const effort = anEffort('1')
    const row = await aRow({ program: 'claude-code', model: cast, effort })
    const line = await aLine('rk-plain')
    const reply = await theAskIsTaken('rk-plain', line)
    expect(reply['says']).toContain(`Run ${line.run}'s nextRound field says where the ask is. ${theRowSays(row, cast, 'claude-code', false)} ${THE_KEPT_ROW}`)
    expect(theEntryOf(line.run)!['row']).toEqual({ id: row, revision: null, program: 'claude-code', model: cast, effort })
    expect(theEntryOf(line.run)).not.toHaveProperty('model')
    // THE OWNER MARKS ANOTHER ROW of the same program after the ask.
    await aRow({ program: 'claude-code', model: aModel('1-later'), effort: anEffort('1-later') })
    const r = await atTheStartingDoor(line.run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: cast, modelSays: theRowSays(row, cast, 'claude-code', true), selection: null })
    expect(theEntryOf(line.run)).toMatchObject({ state: 'starting', starting: { model: cast, effort, effortFrom: 'Casting' } })
  })
})

describe('R2. no row in force for the card', () => {
  it('at the ask: keeps the run’s model and says so; at the start: a row added after the ask is not taken', async () => {
    // NO ROLE, SO THE WORKER CARD, which no case before this one gives a row.
    const line = await aLine('rk-uncast', { role: null })
    const reply = await theAskIsTaken('rk-uncast', line)
    expect(reply['says']).toContain(
      `Run ${line.run}'s nextRound field says where the ask is. No Casting row is in force for ${A_ROW_WITH_NO_ROLE_READS_AS} in ${WORKSPACE}, ` +
        `so the round keeps model ${A_PREVIOUS_MODEL} from run ${line.run}. ${THE_KEPT_MODEL}`,
    )
    expect(theEntryOf(line.run)).toMatchObject({ row: null, model: A_PREVIOUS_MODEL })
    const added = await aRow({ program: 'claude-code', model: aModel('2-later'), card: THE_WORKER })
    try {
      const r = await atTheStartingDoor(line.run)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body['round']).toMatchObject({
        runtime: 'claude-code', model: A_PREVIOUS_MODEL, selection: null,
        modelSays: `No Casting row was in force for rk-uncast in ${WORKSPACE} when the round was asked for, so the round keeps model ${A_PREVIOUS_MODEL} from run ${line.run}.`,
      })
    } finally {
      await removeTheRow(added)
    }
  })
})

describe('R3. a row in force that casts another runtime', () => {
  let row = 0
  const cast = aModel('3')

  it('at the ask: keeps the run when no row casts its runtime', async () => {
    row = await aRow({ program: 'claude-code', model: cast })
    const model = underCodex('3-run')
    const line = await aLine('rk-codex', { runtime: 'codex', run: { runtime: 'codex', model } })
    const reply = await theAskIsTaken('rk-codex', line)
    const says = `Casting row ${String(row)}, in force for ${THE_SUPERVISOR}, casts claude-code, and no row in force casts codex, the run's program, so the round keeps runtime codex and model ${model} from run ${line.run}.`
    expect(reply['says']).toContain(says)
    expect(theEntryOf(line.run)).toMatchObject({ row: null, model, unmatchedRow: { id: row, card: THE_SUPERVISOR, program: 'claude-code' } })
    const started = await atTheStartingDoor(line.run)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect(started.body['round']).toMatchObject({ runtime: 'codex', model })
  })

  it('at the start: a run whose runtime changed after the ask fails in the kept row’s words', async () => {
    const line = await aLine('rk-turned')
    await theAskIsTaken('rk-turned', line)
    inTheDatabase(line.run, "json_set(data, '$.runtime', 'codex')")
    await theStartFails(line.run, anotherRuntime(row, cast, line.run, 'codex', true))
  })
})

describe('R4. a model of the wrong shape or provider', () => {
  const cannot = (whose: string, model: string): string => `${whose} names model ${model}, which claude-code cannot use for continuation`
  const ofItsProvider = `: claude-code takes a model of provider ${CLAUDES_PROVIDER}.`

  it('at the ask: a row’s model under another provider, and a run’s model a command line cannot carry, are refused', async () => {
    const model = underCodex('4')
    const row = await aRow({ program: 'claude-code', model })
    const line = await aLine('rk-provider')
    await theAskIsRefused('rk-provider', line, `${cannot(`Casting row ${String(row)}`, model)}${ofItsProvider}`)
    const uncast = await aLine('rk-spaced', { role: null, run: { model: 'claude opus' } })
    await theAskIsRefused('rk-spaced', uncast, `${cannot(`Run ${uncast.run}`, 'claude opus')}.`)
  })

  it('at the start: a kept row’s model under another provider, and a kept model a command line cannot carry, fail', async () => {
    const row = await aRow({ program: 'claude-code', model: aModel('4-start') })
    const line = await aLine('rk-provider-late')
    await theAskIsTaken('rk-provider-late', line)
    // THE ROW AND THE KEPT ENTRY ARE CHANGED TO MATCH, so the start's check of the kept row passes and only the model's
    // provider can fail it. The entry is changed only where it keeps a row, and only where it keeps a model below.
    const late = underCodex('4-late')
    await change(row, { model: { value: late } })
    inTheDatabase(line.run, "CASE WHEN json_type(data, '$.nextRound.row') = 'object' THEN json_set(data, '$.nextRound.row.model', ?) ELSE data END", late)
    await theStartFails(line.run, `${cannot(`Casting row ${String(row)}`, late)}${ofItsProvider}`)

    const uncast = await aLine('rk-spaced-late', { role: null })
    await theAskIsTaken('rk-spaced-late', uncast)
    inTheDatabase(uncast.run, "CASE WHEN json_type(data, '$.nextRound.model') = 'text' THEN json_set(data, '$.nextRound.model', 'claude opus') ELSE data END")
    await theStartFails(uncast.run, `${cannot(`The ask after run ${uncast.run}`, 'claude opus')}.`)
  })
})

describe('R5. a held row', () => {
  it('at the ask: a held row in force is refused in the hold’s own words', async () => {
    const row = await aRow({ program: 'claude-code', model: aModel('5'), effort: anEffort('5'), native: aNative('5') })
    const said = await hold(row)
    const line = await aLine('rk-held')
    await theAskIsRefused('rk-held', line, said)
  })

  it('at the start: a row held after the ask fails the start in the hold’s own words', async () => {
    const row = await aRow({ program: 'claude-code', model: aModel('5-start'), effort: anEffort('5-start'), native: aNative('5-start') })
    const line = await aLine('rk-held-late')
    await theAskIsTaken('rk-held-late', line)
    await theStartFails(line.run, await hold(row))
  })
})

describe('R6. a name two rows match', () => {
  const name = underCodex('6')
  const other = aModel('6-other')
  /** A second Codex row whose native model, under Codex's provider, is the first row's Office model. */
  const aRowNamedAlike = () => aRow({ program: 'codex', model: other, native: { model: aModel('6'), provider: null, variant: null }, marked: false })
  const twoRows = (one: number, two: number): string =>
    `The model name ${name} matches Casting rows that name different models: ${String(one)} (${name}), ${String(two)} (${other}). No row gives it a selection or an effort.`
  let row = 0

  it('at the ask: is refused in the reader’s words', async () => {
    row = await aRow({ program: 'codex', model: name })
    const alike = await aRowNamedAlike()
    try {
      const line = await aLine('rk-twice', { runtime: 'codex', run: { runtime: 'codex', model: underCodex('6-run') } })
      await theAskIsRefused('rk-twice', line, twoRows(row, alike))
    } finally {
      await removeTheRow(alike)
    }
  })

  it('at the start: a second row added after the ask fails the start in the reader’s words', async () => {
    const line = await aLine('rk-twice-late', { runtime: 'codex', run: { runtime: 'codex', model: underCodex('6-run') } })
    await theAskIsTaken('rk-twice-late', line)
    const alike = await aRowNamedAlike()
    await theStartFails(line.run, twoRows(row, alike))
  })
})

describe('R7. the kept row changed or removed after the ask', () => {
  it('at the start: a row whose cells changed fails, and names what the ask read and what the row casts now', async () => {
    const cast = aModel('7')
    const row = await aRow({ program: 'claude-code', model: cast, effort: anEffort('7') })
    const line = await aLine('rk-changed')
    await theAskIsTaken('rk-changed', line)
    await change(row, { effort: { value: anEffort('7-later') } })
    await theStartFails(
      line.run,
      `Casting row ${String(row)} changed after the ask chose it: the ask read claude-code with the model ${cast} and the effort ${anEffort('7')}, ` +
        `and it now casts claude-code with the model ${cast} and the effort ${anEffort('7-later')}. ${NOT_SWAPPED}`,
    )
  })

  it('at the start: a native row whose selection changed fails', async () => {
    const row = await aRow({ program: 'claude-code', model: aModel('7n'), effort: anEffort('7n'), native: aNative('7n') })
    const line = await aLine('rk-revised')
    await theAskIsTaken('rk-revised', line)
    await change(row, { effort: { value: anEffort('7n-later') } })
    await theStartFails(line.run, `Casting row ${String(row)} changed after the ask chose it: its native selection is not the one the ask read. ${NOT_SWAPPED}`)
  })

  it('at the start: a removed row fails', async () => {
    const row = await aRow({ program: 'claude-code', model: aModel('7r') })
    const line = await aLine('rk-removed')
    await theAskIsTaken('rk-removed', line)
    await aRow({ program: 'claude-code', model: aModel('7r-later') })
    await removeTheRow(row)
    await theStartFails(line.run, `Casting row ${String(row)}, which the ask chose, is no longer in the table.`)
  })
})

describe('R8. an ask made before an ask kept its row', () => {
  it('at the ask: asked again, the new ask keeps the row in force and replaces the old one', async () => {
    const cast = aModel('8')
    const row = await aRow({ program: 'claude-code', model: cast })
    const line = await aLine('rk-older')
    await theAskIsTaken('rk-older', line)
    // AN ASK OF AN OLDER OFFICE, made here by taking the row off a kept entry, as only the database can.
    inTheDatabase(line.run, "json_remove(data, '$.nextRound.row')")
    await theAskIsTaken('rk-older', line)
    expect(theEntryOf(line.run)!['row']).toEqual({ id: row, revision: null, program: 'claude-code', model: cast, effort: null })
    expect(theEntryOf(line.run)).toHaveProperty('replaced')
  })

  it('at the start: starts on the row in force now, and says the ask kept none', async () => {
    await aRow({ program: 'claude-code', model: aModel('8-asked') })
    const line = await aLine('rk-older-start')
    await theAskIsTaken('rk-older-start', line)
    inTheDatabase(line.run, "json_remove(data, '$.nextRound.row')")
    const cast = aModel('8-now')
    const now = await aRow({ program: 'claude-code', model: cast })
    const r = await atTheStartingDoor(line.run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: cast, modelSays: `${theRowSays(now, cast, 'claude-code', false)} ${READ_NOW}` })
  })
})

describe('R9. the cap of Claude supervisors reads the kept row', () => {
  it('leaves out a round kept on a Claude Code row while the cap is full, though a Codex row was marked after the ask', async () => {
    const before = process.env[THE_CAP]
    let processRow = ''
    try {
      await aRow({ program: 'claude-code', model: aModel('9') })
      const capped = await aLine('rk-capped')
      await theAskIsTaken('rk-capped', capped)
      const older = await aLine('rk-capped-older')
      await theAskIsTaken('rk-capped-older', older)
      inTheDatabase(older.run, "json_remove(data, '$.nextRound.row')")
      await aRow({ program: 'codex', model: underCodex('9-later') })
      // ONE CLAUDE SUPERVISOR GOING, with a live process row of this test's own process: the cap of one is full.
      process.env[THE_CAP] = '1'
      const going = await aLine('rk-going')
      const resource = await call('POST', '/api/resources', AS_THE_PERSON, {
        sessionRecordId: going.run, type: 'process', key: String(process.pid), detail: 'A made-up process of this test',
        adopting: 'this test process stands for the run’s own process, so the run reads as going',
      })
      expect(resource.status, JSON.stringify(resource.body)).toBe(201)
      processRow = String(resource.body['resource'].id)
      const listed = await call('GET', '/api/worker/rounds', AS_THE_WORKER())
      expect(listed.status, JSON.stringify(listed.body)).toBe(200)
      const runs = (listed.body['rounds'] as { run: string }[]).map((one) => one.run)
      expect(runs).not.toContain(capped.run)
      // AN ASK THAT KEPT NO ROW is read by the row in force, which casts Codex, so its start would fail and it is listed.
      expect(runs).toContain(older.run)
    } finally {
      if (processRow !== '') t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(processRow)
      if (before === undefined) delete process.env[THE_CAP]
      else process.env[THE_CAP] = before
    }
  })
})

describe('R10. the round launcher takes the kept row’s selection', () => {
  /** The real launcher, asked for a round with --selection, with --api at a closed port. What it refused with. */
  function theLauncherRefuses(runtime: string, model: string, selection: string): string {
    const temporary = mkdtempSync(join(scratch, 'launch-'))
    const brief = join(temporary, 'brief.md')
    writeFileSync(brief, '# A made-up brief\n')
    const ran = spawnSync(
      process.execPath,
      [LAUNCHER, 'round', 'rk-made-up', '--agent', 'rk-made-up-line', '--brief', brief, '--model', model, '--runtime', runtime, '--selection', selection,
        '--api', 'http://127.0.0.1:1', '--sandboxes', join(temporary, 'none')],
      { cwd: THIS_WORKTREE, env: { PATH: process.env['PATH'] ?? '', HOME: temporary, TMPDIR: temporary }, encoding: 'utf8', timeout: 60_000 },
    )
    expect(ran.status, ran.stderr).toBe(2)
    expect(ran.stderr).not.toContain('round does not take --selection')
    const details = /Details: (\S+)/.exec(ran.stderr)?.[1]
    expect(details, ran.stderr).toBeDefined()
    return readFileSync(details!, 'utf8')
  }

  it('the real launcher refuses a selection that is not JSON, or is for another runtime, in the reader’s words', async () => {
    expect(theLauncherRefuses('claude-code', aModel('10-plain'), 'not json')).toContain('sandbox: --selection is not JSON. Nothing was started.\n')
    const row = await aRow({ program: 'claude-code', model: aModel('10-other'), effort: anEffort('10-other'), native: aNative('10-other'), marked: false })
    const selection = await theSelectionOf(row)
    expect(theLauncherRefuses('codex', selection.model, JSON.stringify(selection))).toContain(
      'sandbox: --selection is for claude-code, and this start is for codex. Nothing was started.\n',
    )
  })

  /** A launcher declaration, read from the launcher and evaluated with the globals given. */
  function actual(name: string, globals: Record<string, unknown>) {
    const source = readFileSync(LAUNCHER, 'utf8')
    let start = source.indexOf(`function ${name}(`)
    const end = source.indexOf('\n}\n', start)
    if (source.slice(start - 6, start) === 'async ') start -= 6
    if (start < 0 || end < 0) throw new Error(`Missing launcher declaration ${name}`)
    return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: LAUNCHER }) as (...args: any[]) => any
  }

  /** What the stand-in for filing the round's run throws, so nothing after it runs. */
  const FILED_HERE = 'The made-up launcher would file the round’s run here.'
  const LINE = 'rk-launcher'
  let line: { run: string; brief: string }
  let cast = ''
  let row = 0

  /**
   * THE REAL commandRound, with stand-ins for the sandbox, the helper and the filing, given --selection. The real
   * theSelectionGiven and theStartValues read it, and the real aCommandsStartFromTheOffice asks this file's office,
   * through a stand-in that keeps what it was given. The stand-in for filing keeps its arguments and throws.
   */
  async function theRoundStarts(selection: string) {
    const events: string[] = []
    const given: Record<string, any>[] = []
    let filed: Record<string, any> | null = null
    const { 'content-type': _type, ...asTheWorker } = AS_THE_WORKER()
    const globals: Record<string, any> = {
      chosen: { verb: 'round', targets: [`${LINE}-sandbox`], agent: LINE, brief: line.brief, model: cast, runtime: 'claude-code', continues: line.run, selection },
      api, A_WORKERS_RUNTIME: 'claude-code', A_ROUNDS_RULES, THE_PROGRAM_A_RUNTIME_RUNS, theRuntimeTheMapDoesNotHoldWords, theRuntimeWithNoCommandWords,
      // THIS FILE'S Error, so the launcher's `why instanceof Error` knows an error the imported start values throw.
      readLauncherSelection, aNameNamesTheSelection, Buffer, Error, statSync, existsSync, isAbsolute, resolve, join, sep, realpathSync,
      aWorkersWords: () => `${LINE}-sandbox`, theAddressARunCommitsAt: () => {}, whoIsAsking: () => ({ agent: THE_LAUNCHER_ASKS_AS, session: null }),
      // THE COMPACTION WINDOW, which the real one reads from the office's settings, is made up: no Claude Code is started here.
      theClaudeCodeVariablesInASandbox: () => ({ variables: [], window: { tokens: '200000', from: 'a made-up setting' } }),
      aSandboxToStartIn: async () => ({ dir: dirname(line.brief), name: `${LINE}-sandbox`, workspace: WORKSPACE, instance: {} }),
      theAgentIsRegistered: async () => {}, theSandboxHasTheRuntimeLogin: () => {}, nothingOfItStillRuns: async () => {},
      // THE RUN BEFORE, read from its record with its title, which a round given no --title takes, as the real one reads it.
      theRunARoundContinues: async () => ({ run: line.run, data: dataOf(line.run), title: t.api.getRecord(line.run)!.title, entry: null }), theRoundsRunWasFiledHere: async () => {},
      aRunWithNoTitleARoundCanTakeWords, theAgentsOwnWorktree, whyARunMayNotWorkIn,
      theClaudeCodeEnvironment: () => ({ env: {}, from: {} }), theSecretsFor: () => ({ lines: [] }), theCallerNamed: () => asTheWorker,
      theNameClaudeTakes: (name: string) => name, theNameCodexTakes: (name: string) => name,
      readTheRoundsBacklog: async () => null, readTheRoundsDelegations: async () => null, readTheRoundsRules: async () => null, theStandingStagesFor: async () => null,
      prepareRoundChapters: ({ brief }: { brief: string }) => ({ manifest: {}, brief, workArea: null }), roundChaptersList: () => 'No chapters are delivered to this made-up round.',
      theCodexThreadOf: () => null, theOpenCodeSessionOf: () => null, refreshMainBeforeRun: () => {}, theHelperTakesStdin: () => false,
      theBriefWithTheStartingWords: (_sb: unknown, _runtime: string, brief: string) => brief,
      theClaudeCodeCommand: () => ['claude', '-p'],
      aCommandsStartFromTheOffice: async (command: string[], options: Record<string, any>) => {
        given.push(options)
        return aCommandsStartFromTheOffice(command, options as Parameters<typeof aCommandsStartFromTheOffice>[1])
      },
      anAgentsRunFiledHere: async (_sb: unknown, _who: unknown, args: Record<string, any>) => { events.push('filed'); filed = args; throw new Error(FILED_HERE) },
      startThroughTheHelper: async () => { events.push('started'); return {} },
      say: () => {}, refuse: (said: string) => { throw new Error(said) }, usage: (said: string) => { throw new Error(said) },
    }
    globals['theSelectionGiven'] = actual('theSelectionGiven', globals)
    globals['theStartValues'] = actual('theStartValues', globals)
    // A ROUND CONTINUES THE RUN --continues NAMES when that run ran on the round's runtime and its worktree, this one,
    // holds the rules file. The launcher's own declarations decide it, as they do in a real round.
    for (const name of ['whyARoundCannotWorkIn', 'whyARoundStartsANewConversation']) globals[name] = actual(name, globals)
    globals['theAreaTheDoorSetIsTheDeclaredOne'] = actual('theAreaTheDoorSetIsTheDeclaredOne', globals)
    let failed: string | null = null
    try {
      await actual('commandRound', globals)()
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
    }
    return { failed, events, given, filed: filed as Record<string, any> | null }
  }

  it('commandRound gives the selection to the start values, and the run it would file carries it', async () => {
    cast = aModel('10')
    row = await aRow({ program: 'claude-code', model: cast, effort: anEffort('10'), native: aNative('10') })
    line = await aLine(LINE)
    const selection = await theSelectionOf(row)
    const round = await theRoundStarts(JSON.stringify(selection))
    expect(round.failed).toBe(FILED_HERE)
    expect(round.events).toEqual(['filed'])
    expect(round.given.map((options) => options['selection'])).toEqual([selection])
    expect(round.filed!['model']).toBe(cast)
    expect(round.filed!['startup'].start.selection).toEqual(selection)
  })

  it('a selection whose recheck the office refuses is refused in the recheck’s words, and the run before is not continued', async () => {
    const selection = await theSelectionOf(row)
    const another = { ...selection, casting: { id: row, revision: `another-${UNSEEN}` } }
    const { 'content-type': _type, ...asTheWorker } = AS_THE_WORKER()
    const recheck = await call('GET', `/api/casting/rows/${String(row)}/selection?revision=${encodeURIComponent(another.casting.revision)}`, asTheWorker)
    expect(recheck.status, JSON.stringify(recheck.body)).not.toBe(200)
    const dataBefore = dataOf(line.run)
    const sessionsBefore = sessions()
    const round = await theRoundStarts(JSON.stringify(another))
    expect(round.failed).toBe(`The selected Casting row could not be rechecked (${String(recheck.status)}: ${String(recheck.body['error'])}). Nothing was started.`)
    expect(round.given.map((options) => options['selection'])).toEqual([another])
    expect(round.events).toEqual([])
    expect(round.filed).toBeNull()
    expect(dataOf(line.run)).toEqual(dataBefore)
    expect(sessions()).toBe(sessionsBefore)
  })

})

/**
 * R11. THE PREVIOUS RUN'S PROGRAM IS SPENT (9 Nov 21:3x; REQUIREMENTS.md, the next-round door switches program).
 * When its row is out until a time still to come, or the provider reports its limit, the door draws the line's row of
 * another program and the round starts a new conversation there, from the brief, and says so. A row of another program
 * that is out is not drawn. With no other program to draw it refuses, writes no ask and tells nobody, so no round is
 * started that would fail at once. A row's Out until says it is spent, and a probability of 0
 * only means a row is not drawn: a round whose own row is at 0 continues on it. The door's words are read from
 * src/server/lib/next-round.ts.
 */
describe('R11. the previous run’s program is spent', () => {
  const CODEX_MODEL = underCodex('11')
  const LIMITED_MODEL = underCodex('11-limited')
  const CLAUDE_MODEL = aModel('11-claude')
  /** A time on the office's clock long after this test, and the instant the row stores for it. */
  const LATER = '2099-01-02 09:30'
  const LATER_INSTANT = normaliseCastingOutUntil(LATER, theClockZone())!
  let rounds: typeof import('../src/server/lib/next-round.ts')
  let codexRow = 0
  let claudeRow = 0
  let line: { run: string; brief: string }
  let limitedLine: { run: string; brief: string }

  it('at the ask: with no other program to draw, refuses in words, writes nothing and tells nobody', async () => {
    rounds = await import('../src/server/lib/next-round.ts')
    codexRow = await aRow({ program: 'codex', model: CODEX_MODEL, probability: '1', outUntil: LATER })
    // A ROW OF ANOTHER PROGRAM THAT IS OUT TOO is not drawn.
    await aRow({ program: 'claude-code', model: aModel('11-claude-out'), probability: '1', outUntil: LATER, marked: false })
    line = await aLine('rk-spent-none', { runtime: 'codex', run: { runtime: 'codex', model: CODEX_MODEL } })
    await theAskIsRefused(
      'rk-spent-none',
      line,
      rounds.noOtherProgramToDraw('codex', rounds.theRowIsOutUntil(codexRow, THE_SUPERVISOR, LATER_INSTANT), THE_SUPERVISOR),
    )
  })

  it('at the ask: draws the Claude row, keeps it with the switch, and says why', async () => {
    claudeRow = await aRow({ program: 'claude-code', model: CLAUDE_MODEL, probability: '1', marked: false })
    const reply = await theAskIsTaken('rk-spent-none', line)
    expect(theEntryOf(line.run)!['row']).toEqual({ id: claudeRow, revision: null, program: 'claude-code', model: CLAUDE_MODEL, effort: null })
    expect(theEntryOf(line.run)!['switched']).toEqual({ from: 'codex', says: rounds.theRowIsOutUntil(codexRow, THE_SUPERVISOR, LATER_INSTANT) })
    expect(reply['says']).toContain(
      `Casting row ${String(claudeRow)}, in force for ${THE_SUPERVISOR}, names ${CLAUDE_MODEL} for claude-code, so the round starts ${CLAUDE_MODEL}. ` +
        `The run it continues ran on codex, and that program is out: ${rounds.theRowIsOutUntil(codexRow, THE_SUPERVISOR, LATER_INSTANT)} ` +
        'The round starts on claude-code in a new conversation from the brief.',
    )
  })

  it('at the start: reads the drawn row again and starts the round on its program and model', async () => {
    const r = await atTheStartingDoor(line.run)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const started = r.body['round'] as Record<string, any>
    expect(started['runtime']).toBe('claude-code')
    expect(started['model']).toBe(CLAUDE_MODEL)
    expect(String(started['modelSays'])).toContain('The round starts on claude-code in a new conversation from the brief.')
    expect(theEntryOf(line.run)!['starting']).toMatchObject({ model: CLAUDE_MODEL, modelSays: expect.stringContaining('new conversation from the brief') })
  })

  it('at the ask: a provider limit on the run’s own program draws another program too', async () => {
    const stopped = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic: the codex program at its session limit',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: agents.get(SECRETARY)!.id },
      origin: 'fixture',
      data: {
        state: 'crashed', runtime: 'codex', model: LIMITED_MODEL, closedHow: 'provider-event',
        closedAt: '2026-11-10 06:00:00',
        stopCause: { kind: 'session-limit', said: 'Synthetic: the codex session limit.', at: new Date().toISOString(), resetsAt: new Date(Date.now() + 18_000_000).toISOString() },
      },
    }).id
    await aRow({ program: 'codex', model: LIMITED_MODEL, probability: '1' })
    limitedLine = await aLine('rk-spent-limited', { runtime: 'codex', run: { runtime: 'codex', model: LIMITED_MODEL } })
    const reply = await theAskIsTaken('rk-spent-limited', limitedLine)
    expect(theEntryOf(limitedLine.run)!['row']).toEqual({ id: claudeRow, revision: null, program: 'claude-code', model: CLAUDE_MODEL, effort: null })
    expect(String(theEntryOf(limitedLine.run)!['switched'].says)).toContain(`Run ${stopped} reports session limit`)
    expect(reply['says']).toContain('and that program is out:')
    t.api.deleteRecord(stopped, { type: 'agent', id: agents.get(SECRETARY)!.id })
  })

  it('the ordinary path is unchanged: a program at a probability above zero is the one the round continues', async () => {
    const row = await aRow({ program: 'codex', model: underCodex('11-ordinary'), probability: '1' })
    const ordinary = await aLine('rk-spent-ordinary', { runtime: 'codex', run: { runtime: 'codex', model: underCodex('11-ordinary') } })
    await theAskIsTaken('rk-spent-ordinary', ordinary)
    expect(theEntryOf(ordinary.run)!['row']).toEqual({ id: row, revision: null, program: 'codex', model: underCodex('11-ordinary'), effort: null })
    expect(theEntryOf(ordinary.run)).not.toHaveProperty('switched')
  })

  it('at the start: refuses a kept row made unavailable after the ask', async () => {
    const cast = underCodex('11-out-after-ask')
    const row = await aRow({ program: 'codex', model: cast, probability: '1' })
    const kept = await aLine('rk-out-after-ask', { runtime: 'codex', run: { runtime: 'codex', model: cast } })
    await theAskIsTaken('rk-out-after-ask', kept)
    await change(row, { out_until: { value: LATER } })
    await theStartFails(kept.run, rounds.theRowIsOutUntil(row, THE_SUPERVISOR, LATER_INSTANT))
  })

  it('at the start: keeps an available row when its out-until time has passed', async () => {
    const cast = underCodex('11-back-after-ask')
    const row = await aRow({ program: 'codex', model: cast, probability: '1' })
    const kept = await aLine('rk-back-after-ask', { runtime: 'codex', run: { runtime: 'codex', model: cast } })
    await theAskIsTaken('rk-back-after-ask', kept)
    await change(row, { out_until: { value: '2020-01-02 09:30' } })
    const started = await atTheStartingDoor(kept.run)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect(started.body['round']).toMatchObject({ runtime: 'codex', model: cast })
  })

  it('at the start: refuses a provider limit recorded after the ask, and starts when the limit is gone', async () => {
    const cast = underCodex('11-limited-after-ask')
    const row = await aRow({ program: 'codex', model: cast, probability: '1' })
    const blocked = await aLine('rk-limit-after-ask', { runtime: 'codex', run: { runtime: 'codex', model: cast } })
    const available = await aLine('rk-limit-gone-at-start', { runtime: 'codex', run: { runtime: 'codex', model: cast } })
    await theAskIsTaken('rk-limit-after-ask', blocked)
    await theAskIsTaken('rk-limit-gone-at-start', available)
    expect(theEntryOf(blocked.run)!['row'].id).toBe(row)
    const stopped = t.api.createRecord({ kind: 'session', title: 'Synthetic: limit after the ask', workspaceId: WORKSPACE,
      actor: { type: 'agent', id: agents.get(SECRETARY)!.id }, origin: 'fixture', data: {
        state: 'crashed', runtime: 'codex', model: cast, closedHow: 'provider-event', closedAt: '2026-11-10 06:00:00',
        stopCause: { kind: 'session-limit', said: 'Synthetic: limit after the ask.', at: new Date().toISOString(), resetsAt: new Date(Date.now() + 18_000_000).toISOString() },
      } }).id
    try {
      const refused = await atTheStartingDoor(blocked.run)
      expect(refused.status, JSON.stringify(refused.body)).toBe(409)
      expect(String(refused.body['error'])).toContain(`Run ${stopped} reports session limit`)
      expect(theEntryOf(blocked.run)).toMatchObject({ state: 'failed' })
      expect(theEntryOf(blocked.run)).not.toHaveProperty('starting')
    } finally {
      t.api.deleteRecord(stopped, { type: 'agent', id: agents.get(SECRETARY)!.id })
    }
    const started = await atTheStartingDoor(available.run)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect(started.body['round']).toMatchObject({ runtime: 'codex', model: cast })
  })

  it('a row at the probability 0 is not spent: the round continues on it, and so does a row whose Out until has passed', async () => {
    for (const [handle, row] of [
      ['rk-spent-zero', { program: 'codex', model: underCodex('11-zero'), probability: '0' }],
      ['rk-spent-back', { program: 'codex', model: underCodex('11-back'), probability: '1', outUntil: '2020-01-02 09:30' }],
    ] as const) {
      const id = await aRow(row)
      const kept = await aLine(handle, { runtime: 'codex', run: { runtime: 'codex', model: row.model } })
      await theAskIsTaken(handle, kept)
      expect(theEntryOf(kept.run)!['row'], handle).toEqual({ id, revision: null, program: 'codex', model: row.model, effort: null })
      expect(theEntryOf(kept.run), handle).not.toHaveProperty('switched')
    }
  })

  it('at the ask: a Claude limit recorded with no model covers every Claude model and draws another program', async () => {
    // Claude's session stops and its week limit are recorded with no model, because every Claude model shares one login.
    // The shared limit reader already reads that as covering every model of the runtime
    // (src/shared/casting-roll.ts, theLimitsOn), so the door must read it the same way.
    const stopped = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic: the claude-code program at its session limit',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: agents.get(SECRETARY)!.id },
      origin: 'fixture',
      data: {
        state: 'crashed', runtime: 'claude-code', model: CLAUDE_MODEL, closedHow: 'provider-event',
        closedAt: '2026-11-10 06:00:00',
        stopCause: { kind: 'session-limit', said: 'Synthetic: the claude-code session limit.', at: new Date().toISOString(), resetsAt: new Date(Date.now() + 18_000_000).toISOString() },
      },
    }).id
    try {
      // THE CLAUDE ROW CARRIES THE MARK, so the ask reads that row for the run's own program before it looks at the
      // limit. Earlier cases leave many claude-code rows in force; without the mark the ask would refuse to choose
      // between them before it ever reached the limit.
      await mark(claudeRow)
      const claude = await aLine('rk-spent-claude', { runtime: 'claude-code', run: { runtime: 'claude-code', model: CLAUDE_MODEL } })
      const reply = await theAskIsTaken('rk-spent-claude', claude)
      const kept = theEntryOf(claude.run)!
      expect(kept['row'].program).toBe('codex')
      expect(kept['switched']).toEqual({ from: 'claude-code', says: expect.stringContaining(`Run ${stopped} reports session limit`) })
      expect(reply['says']).toContain('The round starts on codex in a new conversation from the brief.')
    } finally {
      t.api.deleteRecord(stopped, { type: 'agent', id: agents.get(SECRETARY)!.id })
    }
  })
})

/**
 * R12. TWO ROWS CAST THE RUN'S PROGRAM, AND THE RUN'S MODEL NAMES ONE OF THEM. A worker card's marked row cast
 * claude-code and two codex rows at the probability 0 cast different models, so
 * every next round of a Codex worker was refused: the round could not choose between the two rows. Now the round
 * continues, with no draw, on the one row of its program whose model is the run's, compared by castingModelName and
 * nothing wider: the rule that one Go limit covers every opencode-go model is about limits, and it picks no row. The
 * start reads that row. When no such row casts the run's model, or more than one does, the refusal stays as it was.
 * Its words are read from src/server/lib/next-round.ts.
 * The mutations: the rows are not narrowed by the run's model (R12a goes red); with no row of the run's model the first
 * row of the program is taken (R12b goes red); with two rows of the run's model the first is taken (R12c goes red).
 */
describe('R12. two rows cast the run’s program, and the run’s model names one of them', () => {
  const THE_MARKED_MODEL = aModel('12-claude')
  const ONE = underCodex('12-one')
  const TWO = underCodex('12-two')
  let rounds: typeof import('../src/server/lib/next-round.ts')
  let marked = 0
  let one = 0
  let two = 0
  /** A Codex worker's line, its last run on codex with this model. The worker card has no row before this section. */
  const aCodexWorker = (handle: string, model: string) => aLine(handle, { role: THE_WORKER, runtime: 'codex', run: { runtime: 'codex', model } })

  it('at the ask: keeps the one row that casts the run’s model, with no draw; at the start: starts that row', async () => {
    rounds = await import('../src/server/lib/next-round.ts')
    marked = await aRow({ program: 'claude-code', model: THE_MARKED_MODEL, card: THE_WORKER })
    one = await aRow({ program: 'codex', model: ONE, probability: '0', card: THE_WORKER, marked: false })
    two = await aRow({ program: 'codex', model: TWO, probability: '0', card: THE_WORKER, marked: false })
    // EACH OF THE TWO MODELS, so the row is chosen by the run's model and not by its place in the table.
    for (const [handle, model, row] of [['rk-codex-one', ONE, one], ['rk-codex-two', TWO, two]] as const) {
      const line = await aCodexWorker(handle, model)
      await theAskIsTaken(handle, line)
      expect(theEntryOf(line.run)!['row'], handle).toEqual({ id: row, revision: null, program: 'codex', model, effort: null })
      expect(theEntryOf(line.run), handle).not.toHaveProperty('switched')
      const r = await atTheStartingDoor(line.run)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body['round'], handle).toMatchObject({ runtime: 'codex', model, selection: null })
      expect(theEntryOf(line.run), handle).toMatchObject({ state: 'starting', starting: { model } })
    }
  })

  it('at the ask: a run’s model neither row casts is refused as before, with nothing written and nobody told', async () => {
    const line = await aCodexWorker('rk-codex-neither', underCodex('12-neither'))
    await theAskIsRefused('rk-codex-neither', line, rounds.noOneRowCastsTheRunsModel([one, two], THE_WORKER, 'codex', line.run, marked, 'claude-code'))
  })

  it('at the ask: a run’s model two rows cast is refused as before, and names every row of the program', async () => {
    const again = await aRow({ program: 'codex', model: ONE, probability: '0', card: THE_WORKER, marked: false })
    try {
      const line = await aCodexWorker('rk-codex-twice', ONE)
      await theAskIsRefused('rk-codex-twice', line, rounds.noOneRowCastsTheRunsModel([one, two, again], THE_WORKER, 'codex', line.run, marked, 'claude-code'))
    } finally {
      await removeTheRow(again)
    }
  })
})
