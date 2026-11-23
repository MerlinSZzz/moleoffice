// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT-ROUND DOOR, AND THE MESSAGE WORKER'S HALF OF IT. Wave 13j round loop-2, step 2 of "a supervisor runs its
 * own loop" (module HoSzb82KlTHJ; plan 4uSoJQ5RySTw, part "doors", D1). It replaces the secretary's start-after.sh. The
 * owner's answers: one run per round, and the next round starts on the supervisor's word
 * . src/server/lib/next-round.ts says what each door checks.
 *
 * EVERYTHING HERE IS MADE UP: the office, its keys, the sandbox folders and their container rows, the agents and the
 * model. No real round is started. The worker's launcher is a script written below, named by
 * MOLE_OFFICE_FAKE_ROUND_LAUNCHER, which files the round's run through the real tools/file-a-run.mjs and starts
 * nothing. It asks for the run's effort as the launcher does, through the real aCommandsStartFromTheOffice in
 * tools/sandbox-common.mjs, which every launcher path uses, and writes it on the run as the helper in a sandbox does.
 * The worker's agent runtime is a script that refuses, so a run it started would show.
 *
 * WHAT IS PROVED
 *   1. The ask is refused, in words, with nothing written: a retired agent, an asker who is none of the five, an agent
 *      with no sandbox run, a sandbox the ledger does not vouch for, a sandbox that is not the agent's, a missing brief,
 *      a brief outside the sandbox folder, a run already serving the agent, and a message worker that is off.
 *   2. Each of the four askers is taken: the run's agent with its own key, its starter, a secretary and the person.
 *      The ask keeps the brief as a path, a sha256 and a size, starts nothing, and only reminds of the count limits.
 *      Its reply says the worker tries to start the round, not that it will, and where to read how the ask went.
 *      Its reminder cites each record for what that record says: one decision for a supervisor's next round
 *      starting on its own word, and another for main-world count limits that remind and never
 *      refuse. It does not cite a third decision, which is about supervisors
 *      starting supervisors and says nothing about rounds. The ask is taken
 *      while the message worker is merges-only too (wave 13j round loop-3), because a worker in that mode starts the
 *      rounds asked through this door.
 *   3. Only the office writes `nextRound`, on a create and on a patch.
 *   4. The worker's list holds an ask while no run serves the agent, and not while one does.
 *   5. The starting door is the worker's alone, takes only a launcher run filed for that round, fails an ask whose
 *      brief changed and tells the asker, and, with no Casting row in force for the agent's card, continues the previous run's stored runtime and requested model. It records the effort the office
 *      answers the launcher's own question (a builder run of that agent, on that program, with that model), with where
 *      it came from and in words: here none, because the owner's rule has no effort for the made-up model.
 *   6. The round's run is minted a key by the office's key when it is derived from the run the round continues, and
 *      the ask becomes started in the same write. One derived from another run is refused and is not filed.
 *   7. The launcher's end keeps the round's open process row, and a launcher that ended badly is told to the asker.
 *   8. The launcher's command line is the sandbox launcher's round command, under the worker's name, with no --effort:
 *      the launcher asks the office for the effort itself. It names the run the round follows with --continues, so the
 *      launcher continues that run and never chooses one itself: the first round of a line follows a run started from
 *      inside the sandbox, which the host's list of the runs it filed there does not hold. A round without --continues,
 *      and a worker run with it, are refused before anything starts.
 *   9. A worker pass starts the launcher for a wanted round; the launcher files the round's run; the next pass closes
 *      the launcher run. The launcher is given --continues and the run the ask was made on, and the round's run it files
 *      is derived from the run --continues names: the synthetic launcher reads it from --continues, as the real one does.
 *      nr-looper's own model is one the owner's rule gives an effort, and the effort the launcher's
 *      reader is answered, and writes on the round's run, is the effort the starting entry records; the two
 *      disagreeing fails here (the inspector's refusal cI6RX4Ur8IiO). A launcher that files nothing leaves the ask
 *      failed and the asker told. A merges-only pass starts a wanted round and closes its launcher too, and starts no
 *      run for a message; MERGES_ONLY_SAYS says so.
 *  10. The setting that names the synthetic launcher is declared, off when absent, and never in the template.
 *  11. A run whose next round the office stored with no effort (it answers none) and no process row (none was open)
 *      still takes later writes of its data: its doing line, and its finish. The three fields that hold those nulls
 *      declare them (the scoped check's refusal iasdX1oUKtfh: the office stored a null its own declaration refused, so
 *      every later patch of the run was refused, the finish included).
 *  12. With no Casting row in force for its card, a Codex agent continues its requested model through the stand-in
 *      launcher despite a different native served model. Missing or unusable prior runtime/model values then fail the
 *      ask without starting a launcher.
 *  13. The round takes its model from the Casting row in force for the agent's card, the row the model reader reads for
 *      a builder, so a line changes its model in the Casting table: the row is changed, and the round starts what it
 *      names now, with its effort. With no row in force the round keeps the previous run's model and says so in one
 *      sentence. A row in force that casts another runtime, or one that is held, fails the ask in words, tells the
 *      asker and starts nothing.
 *  14. The agent's recorded leader, which is not its starter, asks its next round with its own key, and the ask is
 *      kept with the leader as the asker, as its leader. The leader's header claim with no key, and a stranger with
 *      its own key, are refused, and the refusal names the recorded leader among those who may.
 *
 * MUTATION PROOF (after a green control, each alone, restored with cp and checked with cmp, then green again)
 * ---------------------------------------------------------------------------------------
 *
 * In src/server/lib/next-round.ts:
 *   a. A retired agent is not refused: point 1 goes red.
 *   b. Any key that proves somebody is taken as a secretary: point 1's unproved asker goes red.
 *   c. A brief outside the sandbox folder is taken: point 1's brief case goes red.
 *   d. A run already serving the agent is not refused: point 1's serving case goes red.
 *   e. The ask is taken whatever the worker's mode: point 1's off case goes red, and point 2's first case after it.
 *   f. A sandbox named in the ask is not compared with the run's: point 1's sandbox case goes red.
 *   g. The run's sandbox folder is trusted without its container row: point 1's sandbox case goes red.
 *   h. The brief's sha256 is not compared at the start: point 5's changed brief goes red.
 *   i. Any launcher run filed for a round is taken, whichever round: point 5's first case goes red.
 *   j. A failed start tells nobody: points 5 and 9 go red.
 *   k. The mint does not check what the round's run is derived from: point 6 goes red.
 *   l. A launcher that ended badly tells nobody: point 7 goes red.
 *   m. The round's model is the previous run's again, and the role's Casting row in force is not read: point 13's
 *      first, third and fourth cases go red.
 *   n. The worker's list keeps an agent a run already serves: point 4 goes red.
 *   u. The reply says the worker starts the round on its next pass: point 2's reply goes red.
 *   v. The reminder cites the decision about supervisors starting supervisors for the number of rounds
 *      again: point 2's reminder goes red.
 *   w. The ask is refused in merges-only mode, as in round loop-2: point 2's merges-only case goes red.
 *   x. The starting entry's effort is the fixed "Not passed." sentence again: points 5 and 9 go red.
 *   y. The starting entry's effort is the office's variant, not its effort: point 9 goes red.
 *   af. The sentence of a round that keeps the previous run's model is left out: point 13's second case goes red.
 *   ag. The model reader's 409 is not caught: point 13's fourth case goes red, and its ask stays wanted.
 * In tools/sandbox-common.mjs:
 *   z. The launcher's reader takes every answer as one the office could not give: point 9 goes red.
 * In src/shared/kinds.ts, each alone:
 *   aa. NextRoundStarting.effort is declared `string` again: point 11 goes red.
 *   ab. NextRoundProcess.row is declared `string` again: point 11 goes red.
 * In src/server/lib/records.ts:
 *   o. A patch may write `nextRound`: point 3 goes red.
 *   p. A create may write `nextRound`: point 3 goes red.
 * In src/server/api/records.ts:
 *   q. The mint does not make the ask started: point 6 goes red.
 * In src/worker/index.ts:
 *   r. A merges-only pass does not tend rounds, as in round loop-2: point 9's merges-only case goes red, and the case
 *      after it, whose pass then finds that round still wanted.
 *   s. The launcher is given no key: point 9's start goes red.
 *   ac. A next round's launcher is given no --continues: points 9, 11 and 12 go red, the start refused by the command
 *       builder.
 * In src/worker/runtimes/round.ts:
 *   t. The launcher is not told it asks as the worker: point 8 goes red.
 *   ad. --continues left off the command line: points 8, 9, 11 and 12 go red, and point 9's launcher files no run.
 *   ae. A round without --continues taken: point 8 goes red.
 */

import { connect, type AddressInfo, type Socket } from 'node:net'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MERGES_ONLY_SAYS, settingNamed } from '../src/config/settings.mjs'
import { theOwnersEffort } from '../src/config/model-efforts.mjs'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_ROW_WITH_NO_ROLE_READS_AS } from '../src/shared/roles.ts'
import { ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND, type TheNextRound } from '../src/shared/next-round.ts'
import { onePass, type WatchingARound, type WorkerSettings } from '../src/worker/index.ts'
import { RoundAdapter, THE_LAUNCHER_ASKS_AS } from '../src/worker/runtimes/round.ts'
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
/**
 * THE COMMIT THIS CHECKOUT STANDS AT, the cut of a made-up run here that finishes with records. A records seal refuses a
 * run whose working directory holds commits past its cut (src/server/lib/sealed-tip.ts), and this checkout may hold
 * commits past main, so a run here cut from main could not finish.
 */
const THE_CHECKOUTS_HEAD = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: CHECKOUT, encoding: 'utf8' }).trim()
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_MODEL = 'claude-made-up-round-1'
const A_PREVIOUS_MODEL = 'claude-made-up-round-0'
/** A real model the owner's rule gives an effort, for nr-looper, so the effort the launcher passes is not none. */
const A_RULED_MODEL = 'claude-sonnet-5'
const THE_RULES_EFFORT = theOwnersEffort(A_RULED_MODEL)
const THE_WORKER_ID = 'mole-office/the-message-worker'
/** The merge tool runs a pass watches. None is started here. */
const noMerges = (): NonNullable<Parameters<typeof onePass>[2]> => []

/**
 * THE SYNTHETIC LAUNCHER. It does what tools/sandbox.mjs round does on the office's side and nothing else: it reads
 * the run the round continues, files the round's run through the real tools/file-a-run.mjs under the launcher run, and
 * exits. It starts no container and no agent. What it was given is kept in a capture, without the key.
 */
const FAKE_LAUNCHER = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileARun } from ${JSON.stringify(join(CHECKOUT, 'tools/file-a-run.mjs'))}
import { aCommandsStartFromTheOffice, officeHeaders } from ${JSON.stringify(join(CHECKOUT, 'tools/sandbox-common.mjs'))}
import { anAgentsToolHeaders } from ${JSON.stringify(join(CHECKOUT, 'for-agents/agent-key.mjs'))}
const argv = process.argv.slice(2)
const flag = (name) => { const at = argv.indexOf(name); return at === -1 ? null : argv[at + 1] }
const mode = process.env.NEXT_ROUND_FAKE_MODE ?? 'file'
const capture = {
  argv, mode,
  keyGiven: /^[0-9a-f]{64}$/.test(process.env.MOLE_AGENT_KEY ?? ''),
  officeSettings: Object.keys(process.env).filter((name) => name.startsWith('MOLE_OFFICE_')).sort(),
}
const keep = () => writeFileSync(join(process.env.NEXT_ROUND_CAPTURES, flag('--session') + '.json'), JSON.stringify(capture))
keep()
if (mode === 'fail') { process.stderr.write('A made-up launcher failure: no run was filed.\\n'); process.exit(3) }
const api = flag('--api'), workspace = flag('--workspace'), as = flag('--as'), session = flag('--session')
const headers = { 'x-mole-office-workspace': workspace, ...anAgentsToolHeaders({ self: as, withoutAKey: as }) }
const read = async (id) => (await (await fetch(api + '/api/records/' + id, { headers })).json()).record
// THE RUN THE ROUND CONTINUES is the one --continues names, as the real launcher takes it.
const last = await read(flag('--continues'))
const filed = fileARun({
  api, workspace, as, session, handle: flag('--agent'), worktree: last.data.workingDirectory, cutFrom: last.data.cutFrom,
  runtime: flag('--runtime'), model: flag('--model'), title: 'A made-up next round of ' + flag('--agent'),
  sandbox: last.data.sandbox, continues: last.id,
})
capture.filed = filed.ok ? { ok: true, id: filed.id, keyAnswered: filed.key !== null } : { ok: false, exited: filed.exited, says: filed.says }
keep()
if (!filed.ok) { process.stderr.write('The made-up launcher could not file the run: ' + filed.says + '\\n'); process.exit(1) }
// THE EFFORT, ASKED AS THE LAUNCHER ASKS IT: the reader every launcher path uses, given the command the launcher gives
// a helper that takes --stdin, the model and runtime it was given, and the filed run's own key, as the helper in the
// sandbox asks with it. The effort it is answered is written on the run, as the helper writes it, when there is one.
const runtime = flag('--runtime'), model = flag('--model'), agent = flag('--agent')
const nativeModel = runtime === 'codex' ? model.slice('openai/'.length) : model.startsWith('anthropic/') ? model.slice('anthropic/'.length) : model
const command = runtime === 'codex' ? ['codex', 'exec', '--json', '-m', nativeModel, '--', 'a made-up brief'] : ['claude', '-p', '--model', nativeModel, '--output-format', 'json']
capture.command = command
const asTheRun = officeHeaders({ workspace, agent, session: filed.id, key: filed.key })
const selection = ${JSON.stringify([A_MADE_UP_MODEL,A_PREVIOUS_MODEL])}.includes(nativeModel) ? {runtime,model,native:{model:nativeModel,provider:null,variant:null,effort:null},casting:null} : undefined
const given = await aCommandsStartFromTheOffice(command, { api, agent, workspace, headers: asTheRun, runtime, model, env: {}, selection })
capture.start = given.start === null ? null : { effort: given.start.effort, effortFrom: given.start.effortFrom, officeUnavailable: given.start.officeUnavailable }
keep()
if (given.start !== null && given.start.effort !== null) {
  const wrote = await fetch(api + '/api/records/' + filed.id, { method: 'PATCH', headers: asTheRun, body: JSON.stringify({ dataPatch: { effort: given.start.effort } }) })
  if (wrote.status !== 200) { process.stderr.write('The made-up launcher could not write the effort: ' + (await wrote.text()) + '\\n'); process.exit(1) }
}
process.stdout.write('The made-up launcher filed run ' + filed.id + '.\\n')
`

/** The worker's agent runtime. No agent run is due in this file, so one that starts fails loudly and shows. */
const NO_AGENT_RUN = `process.stderr.write('A made-up agent runtime: no agent run was due in this test.\\n'); process.exit(9)\n`

let t: TestDb
let app: FastifyInstance
let closeApp: (() => Promise<void>) | undefined

/** Stop this fixture's office, including connections accepted before an HTTP request arrives. */
function closingThisTestOffice(office: FastifyInstance): () => Promise<void> {
  const connections = new Set<Socket>()
  let closing = false
  office.server.on('connection', (socket) => {
    if (closing) { socket.destroy(); return }
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
  })
  return async () => {
    closing = true
    const ended = office.close()
    for (const socket of connections) socket.destroy()
    await ended
  }
}
let api: string
let checkout: string
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

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door, by the person or by a starter's key, and keep its id and key. A starter's own agents take no card. */
async function started(handle: string, role: string | null, by: Record<string, string> = AS_THE_PERSON, runtime = 'claude-code', workArea?: string[]): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, ...(role === null ? {} : { role }), runtime, ...(workArea === undefined ? {} : { workArea }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = (r.body['agent'] as { id: string }).id
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string, name = folder.split('/').at(-1)!): string {
  const id = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

/**
 * A live process row for a run: this test's own process, registered at the ledger's door so its start time is kept and
 * it reads alive. It is taken away by deleting the row and never by the release door, which would signal this process.
 */
async function aLiveProcessRow(run: string): Promise<string> {
  const r = await call('POST', '/api/resources', AS_THE_PERSON, {
    sessionRecordId: run, type: 'process', key: String(process.pid), detail: 'A made-up process of this test',
    adopting: 'this test process stands for the run’s own process, so the run reads as going',
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['resource'].id)
}
const dropTheRow = (id: string): void => void t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(id)

/**
 * A made-up sandbox folder with a brief in it, and the container row that vouches for it. `rowFor` names another folder
 * for the row, so the ledger does not vouch for this one.
 */
function aSandbox(name: string, rowFor?: string): { folder: string; brief: string; container: string } {
  const folder = join(realpathSync(scratch), 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for ${name}\n\nDo the made-up next round.\n`)
  return { folder, brief, container: rowFor === undefined ? aContainerRow(folder) : aContainerRow(rowFor, name) }
}

/** The agent's last run, started in a sandbox and filed by its starter, as the launcher files one. It has ended. */
function aSandboxRun(handle: string, sandbox: { folder: string; container: string }, starter = 'nr-starter', continuation: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: 'default',
    actor: { type: 'agent', id: agents.get(starter)!.id },
    origin: 'fixture',
    data: {
      state: 'running',
      servingAgent: handle,
      servingAgentId: agents.get(handle)!.id,
      runtime: 'claude-code',
      model: A_PREVIOUS_MODEL,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
      ...continuation,
    },
  }).id
}

function theNextRoundOf(run: string): TheNextRound | undefined {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  return (JSON.parse(row.data) as { nextRound?: TheNextRound }).nextRound
}
function dataOf(run: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, any>
}
/** What the office said in full to the person, in each line saying a next round after this run did not start. */
function linesToThePersonAbout(run: string): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aNextRoundDidNotStart'")
      .all(run) as { data: string }[]
  )
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull: string; to: { kind: string; id: string }[] })
    .filter((line) => line.to.some((to) => to.kind === 'person'))
    .map((line) => line.saidInFull)
}
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Ask for the next round of an agent. */
const ask = (agent: string, headers: Record<string, string>, body: Record<string, unknown>) => call('POST', `/api/agents/${agent}/next-round`, headers, body)

/** The worker's launcher run for one round, filed with the office's key as the worker files it. */
async function aLauncherRun(round: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for the round after ${round}`,
    data: {
      state: 'running',
      runtime: 'round-launcher',
      doing: 'starting a made-up next round; this run runs no model',
      workingDirectory: CHECKOUT,
      startedByMoleOffice: true,
      extra: { purpose: 'round', round, ...extra },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

/** The round's run, filed with the office's key under a launcher run, as tools/register-a-run.mjs files it. */
async function theRoundsRun(handle: string, launcher: string, derivedFrom: string, sandbox: { folder: string; container: string }, title: string) {
  return call('POST', '/api/records', AS_THE_WORKER(launcher), {
    kind: 'session',
    title,
    data: {
      state: 'running',
      runtime: 'claude-code',
      model: A_MADE_UP_MODEL,
      servingAgent: handle,
      servingAgentId: agents.get(handle)!.id,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      parentAttachment: launcher,
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
    links: [{ type: 'derived_from', toId: derivedFrom }],
  })
}

const sessionsTitled = (title: string): number =>
  (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session' AND title = ?").get(title) as { n: number }).n

/** Wait until every launcher this file's worker started has ended. */
async function launchersEnded(rounds: WatchingARound[]): Promise<void> {
  const deadline = Date.now() + 60_000
  while (rounds.some((round) => round.adapter.alive(round.handle))) {
    if (Date.now() > deadline) throw new Error('a made-up launcher was still running after a minute')
    await new Promise((go) => setTimeout(go, 100))
  }
}

let worker: { id: string; key: string }
let main: { folder: string; brief: string; container: string }
let last = ''

beforeAll(async () => {
  checkout = CHECKOUT
  // THE DOOR ASKS WHETHER THE OFFICE'S WORKER TAKES THE QUEUE. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  closeApp = closingThisTestOffice(app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-next-round-'))
  captures = join(scratch, 'captures')
  mkdirSync(captures, { recursive: true })

  await started('nr-starter', null)
  worker = await started('nr-worker', null, asOne('nr-starter'))
  await started('nr-gone', null, asOne('nr-starter'))
  await started('nr-unvouched', null, asOne('nr-starter'))
  await started('nr-stranger', null)
  await started('nr-secretary', 'secretary')
  await started('nr-looper', null, asOne('nr-starter'))
  await started('nr-failer', null, asOne('nr-starter'))
  await started('nr-quiet', null, asOne('nr-starter'))
  await started('nr-sealer', null, asOne('nr-starter'))
  for (const handle of ['nr-worker', 'nr-gone', 'nr-looper', 'nr-failer', 'nr-quiet', 'nr-sealer']) {
    const model = handle === 'nr-looper' ? A_RULED_MODEL : A_MADE_UP_MODEL
    const set = await call('POST', `/api/office/run-models/agent/${agents.get(handle)!.id}`, AS_THE_PERSON, { model, variant: null })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
  }

  main = aSandbox('nr-made-up-sandbox')
  last = aSandboxRun('nr-worker', main)
  // A RETIRED AGENT WITH A SANDBOX RUN, so only the retirement stands between it and an ask.
  aSandboxRun('nr-gone', aSandbox('nr-gone-sandbox'))
  const retired = await call('POST', `/api/participants/agent/${agents.get('nr-gone')!.id}/retire`, AS_THE_PERSON, { because: 'a made-up agent retired for this test' })
  expect(retired.status, JSON.stringify(retired.body)).toBe(200)
  // A RUN WHOSE CONTAINER ROW NAMES ANOTHER FOLDER, so the ledger does not vouch for its sandbox.
  aSandboxRun('nr-unvouched', aSandbox('nr-unvouched-sandbox', join(scratch, 'elsewhere', 'nr-unvouched-sandbox')))

  const launcher = join(scratch, 'fake-round-launcher.mjs')
  writeFileSync(launcher, FAKE_LAUNCHER, 'utf8')
  const noAgentRun = join(scratch, 'no-agent-run.mjs')
  writeFileSync(noAgentRun, NO_AGENT_RUN, 'utf8')
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: join(scratch, 'runs'),
    env: {
      ...process.env,
      HOME: scratch,
      MOLE_OFFICE_DB: t.file,
      MOLE_OFFICE_FAKE_RUNTIME: noAgentRun,
      MOLE_OFFICE_FAKE_ROUND_LAUNCHER: launcher,
      NEXT_ROUND_CAPTURES: captures,
    },
  }
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await closeApp?.()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1. the ask is refused, in words, and nothing is written', () => {
  it('refuses a retired agent', async () => {
    const r = await ask(agents.get('nr-gone')!.id, AS_THE_PERSON, { brief: join(scratch, 'sandboxes', 'nr-gone-sandbox', 'brief.md') })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain('is retired, so no next round of it is started. Nothing was written.')
  })

  it('refuses an asker who is none of the five: a header claim with no key, and another agent with its own key', async () => {
    for (const headers of [asAgent('nr-starter'), asOne('nr-stranger')]) {
      const r = await ask('nr-worker', headers, { brief: main.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(403)
      expect(r.body['error']).toContain('is asked for by the agent with its own key, its registered starter, its recorded leader, a secretary proved by its own key, or the person')
    }
    expect(theNextRoundOf(last)).toBeUndefined()
  })

  it('refuses an agent with no sandbox run, a sandbox the ledger does not vouch for, and a sandbox that is not the agent’s', async () => {
    const none = await ask('nr-stranger', asOne('nr-stranger'), { brief: main.brief })
    expect(none.status, JSON.stringify(none.body)).toBe(409)
    expect(none.body['error']).toContain('has no run in this project that was started in a sandbox')
    const unvouched = await ask('nr-unvouched', AS_THE_PERSON, { brief: join(scratch, 'sandboxes', 'nr-unvouched-sandbox', 'brief.md') })
    expect(unvouched.status, JSON.stringify(unvouched.body)).toBe(409)
    expect(unvouched.body['error']).toContain('names a sandbox the office cannot vouch for')
    const foreign = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief, sandbox: 'nr-gone-sandbox' })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(409)
    expect(foreign.body['error']).toContain(`The sandbox "nr-gone-sandbox" is not nr-worker's: its last run, ${last}, was started in ${main.folder}.`)
    expect(theNextRoundOf(last)).toBeUndefined()
  })

  it('refuses a missing brief and a brief outside the sandbox folder', async () => {
    const missing = await ask('nr-worker', AS_THE_PERSON, { brief: join(main.folder, 'no-such-brief.md') })
    expect(missing.status, JSON.stringify(missing.body)).toBe(409)
    expect(missing.body['error']).toContain('There is no brief at')
    const outside = join(scratch, 'a-brief-outside.md')
    writeFileSync(outside, '# A made-up brief outside the sandbox\n')
    const r = await ask('nr-worker', AS_THE_PERSON, { brief: outside })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain(`is not inside the sandbox folder ${main.folder}`)
    expect(theNextRoundOf(last)).toBeUndefined()
  })

  it('refuses while a run already serves the agent', async () => {
    const going = t.api.createRecord({
      kind: 'session', title: 'A made-up run of nr-worker still going', workspaceId: 'default', actor: { type: 'agent', id: agents.get('nr-starter')!.id }, origin: 'fixture',
      data: { state: 'running', servingAgent: 'nr-worker', servingAgentId: worker.id, runtime: 'claude-code' },
    }).id
    const row = await aLiveProcessRow(going)
    try {
      const r = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body['error']).toContain(`Run ${going} is already serving nr-worker, so a next round would be a second run of it.`)
    } finally {
      dropTheRow(row)
    }
    expect(theNextRoundOf(last)).toBeUndefined()
  })

  it('refuses while the office’s message worker is off, because nothing would start the round', async () => {
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'off'
      const off = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })
      expect(off.status, JSON.stringify(off.body)).toBe(409)
      expect(off.body['error']).toContain('The office starts no message worker (MOLE_OFFICE_MESSAGE_WORKER=off)')
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    expect(theNextRoundOf(last)).toBeUndefined()
  })
})

describe('2. the four who may ask are taken, and the ask starts nothing', () => {
  it('takes the run’s agent, its starter, a secretary and the person, each replacing the ask before', async () => {
    // THE ASKER IS KEPT AS A PARTICIPANT, `who: {kind, id}`, the only way a participant is named in a shape
    // (src/shared/participants.ts). A bare required `id` beside `as` would publish an id nothing holds to one
    // thing, which tests/an-id-names-one-thing.test.ts refuses; loop-2b was bounced on it (FdbaBonnHB3c).
    const askers: [Record<string, string>, string, 'agent' | 'person', string][] = [
      [asOne('nr-worker'), 'the run’s agent', 'agent', worker.id],
      [asOne('nr-starter'), 'its starter', 'agent', agents.get('nr-starter')!.id],
      [asOne('nr-secretary'), 'a secretary', 'agent', agents.get('nr-secretary')!.id],
      [AS_THE_PERSON, 'the person', 'person', THE_PERSON],
    ]
    let before: string | null = null
    for (const [headers, as, kind, id] of askers) {
      const r = await ask('nr-worker', headers, { brief: main.brief, sandbox: 'nr-made-up-sandbox' })
      expect(r.status, JSON.stringify(r.body)).toBe(202)
      expect(r.body['run']).toBe(last)
      const kept = theNextRoundOf(last)!
      expect(kept.state).toBe('wanted')
      expect(kept.askedBy).toMatchObject({ as, who: { kind, id } })
      expect(kept.askedBy).not.toHaveProperty('id')
      expect(kept.replaced?.askedBy ?? null).toBe(before)
      before = id
    }
    const kept = theNextRoundOf(last)!
    expect(kept.brief).toEqual({ path: main.brief, sha256: sha256(main.brief), bytes: readFileSync(main.brief).length })
    expect(kept.sandbox).toEqual({ folder: main.folder, instance: 'nr-made-up-sandbox', container: main.container })
    expect(kept.starting).toBeUndefined()
  })

  it('takes the ask while the message worker is merges-only, because a worker in that mode starts asked rounds', async () => {
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'merges-only'
      const r = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(202)
      expect(r.body['run']).toBe(last)
      expect(r.body['says']).toContain('Nothing has started yet.')
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    expect(theNextRoundOf(last)).toMatchObject({ state: 'wanted', askedBy: { as: 'the person', who: { kind: 'person', id: THE_PERSON } } })
  })

  it('says nothing has started, says the worker only tries, and only reminds of the count limits', async () => {
    const r = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['says']).toContain('Nothing has started yet.')
    expect(r.body['says']).toContain('The message worker tries to start it on a later pass, with node tools/sandbox.mjs round.')
    expect(r.body['says']).toContain(`Run ${last}'s nextRound field says where the ask is.`)
    expect(r.body['limits'].says).toEqual(expect.arrayContaining([
      "A supervisor's next round starts on the supervisor's own word.",
      'This door does not count rounds.',
      'The count limits on runs in the main world remind and never refuse.',
      'Nothing here is refused for a count.',
    ]))
    expect(r.body['limits'].says.join(' ')).not.toContain('madeUprpgzgt')
    expect(sessionsTitled('A made-up next round of nr-worker')).toBe(0)
  })
})

describe('3. only the office writes nextRound', () => {
  it('refuses it on a patch and on a create, from the person and from the run’s starter', async () => {
    const kept = theNextRoundOf(last)!
    for (const headers of [AS_THE_PERSON, asOne('nr-starter')]) {
      const patched = await call('PATCH', `/api/records/${last}`, headers, { dataPatch: { nextRound: { ...kept, state: 'started' } } })
      expect(patched.status, JSON.stringify(patched.body)).toBe(403)
      expect(patched.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND)
    }
    const created = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'A made-up run with a next round', data: { state: 'running', nextRound: kept } })
    expect(created.status, JSON.stringify(created.body)).toBe(403)
    expect(created.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND)
    expect(theNextRoundOf(last)).toEqual(kept)
  })
})

describe('4. the worker’s list', () => {
  it('holds a wanted round while no run serves the agent, and not while one does', async () => {
    const listed = await call('GET', '/api/worker/rounds', AS_THE_WORKER())
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body['rounds']).toEqual([{ run: last, agentId: worker.id, handle: 'nr-worker', runtime: 'claude-code', workspaceId: 'default' }])
    const row = await aLiveProcessRow(last)
    try {
      expect((await call('GET', '/api/worker/rounds', AS_THE_WORKER())).body['rounds']).toEqual([])
    } finally {
      dropTheRow(row)
    }
  })
})

describe('5. the starting door', () => {
  it('is the message worker’s alone, and takes only a launcher run filed for that round', async () => {
    const launcher = await aLauncherRun(last)
    const asPerson = await call('POST', `/api/worker/rounds/${last}/starting`, AS_THE_PERSON, { wrapper: launcher })
    expect(asPerson.status, JSON.stringify(asPerson.body)).toBe(403)
    const another = await aLauncherRun('some-other-run')
    const wrong = await call('POST', `/api/worker/rounds/${last}/starting`, AS_THE_WORKER(), { wrapper: another })
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(409)
    expect(wrong.body['error']).toBe(`Run ${another} is not a launcher run the office started for the next round of run ${last}. Nothing was written.`)
    expect(theNextRoundOf(last)?.state).toBe('wanted')
  })

  it('fails an ask whose brief changed since, and tells the asker', async () => {
    const launcher = await aLauncherRun(last)
    const was = readFileSync(main.brief, 'utf8')
    writeFileSync(main.brief, `${was}\nA line added after the ask.\n`)
    try {
      const r = await call('POST', `/api/worker/rounds/${last}/starting`, AS_THE_WORKER(), { wrapper: launcher })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body['error']).toContain('changed after it was asked for. The ask is now failed. Nothing was started.')
      expect(theNextRoundOf(last)).toMatchObject({ state: 'failed', failed: { says: `The brief ${main.brief} changed after it was asked for.` } })
      expect(linesToThePersonAbout(last)).toEqual([`The next round after run ${last} did not start. The brief ${main.brief} changed after it was asked for.`])
    } finally {
      writeFileSync(main.brief, was)
    }
  })

  it('continues the stored Claude model over the profile model, records the office effort, and makes the ask starting', async () => {
    expect((await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })).status).toBe(202)
    const launcher = await aLauncherRun(last)
    const r = await call('POST', `/api/worker/rounds/${last}/starting`, AS_THE_WORKER(), { wrapper: launcher })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({
      run: last, handle: 'nr-worker', runtime: 'claude-code', model: A_PREVIOUS_MODEL,
      instance: 'nr-made-up-sandbox', sandboxes: dirname(main.folder), brief: main.brief,
    })
    const kept = theNextRoundOf(last)!
    expect(kept.state).toBe('starting')
    expect(kept.starting).toMatchObject({ wrapper: launcher, model: A_PREVIOUS_MODEL })
    // THE EFFORT IS THE OFFICE'S ANSWER TO THE LAUNCHER'S OWN QUESTION (a builder run of nr-worker on claude-code, with
    // the previous run's model): none, because the owner's rule has no effort for the made-up model and nothing else sets one.
    expect(kept.starting).toMatchObject({ effort: null, effortFrom: 'none' })
    expect(kept.starting?.effortSays).toContain(`The caller names model ${A_PREVIOUS_MODEL}. The owner has set no effort for ${A_PREVIOUS_MODEL}.`)
    expect(kept.starting?.effortSays).not.toContain('Not passed')
    // AN ASK WHILE ITS LAUNCHER RUN IS GOING IS REFUSED, so two launchers never start one round.
    const again = await ask('nr-worker', AS_THE_PERSON, { brief: main.brief })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body['error']).toContain(`is being started now, by the launcher run ${launcher}`)
  })
})

describe('6. the round’s run is minted its key by the office', () => {
  it('refuses a run filed under the launcher run but derived from another run, and files nothing', async () => {
    const launcher = theNextRoundOf(last)!.starting!.wrapper
    // NOT A RUN OF nr-looper. Case 9 files nr-looper's last run, often in the same second as this one, and the door
    // reads "the last" by its creation stamp, which counts whole seconds. Two runs of one agent in one second were told
    // apart by their random ids, and case 9 went red about one run in two. nr-unvouched is asked for only in case 1.
    const another = aSandboxRun('nr-unvouched', aSandbox('nr-another-sandbox'))
    const title = 'A made-up round derived from the wrong run'
    const r = await theRoundsRun('nr-worker', launcher, another, main, title)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toContain(`which starts the next round of run ${last}, but it is derived from ${another}`)
    expect(sessionsTitled(title)).toBe(0)
    expect(theNextRoundOf(last)?.state).toBe('starting')
  })

  it('mints the round’s run a key when it is derived from the run the round continues, and the ask is started', async () => {
    const launcher = theNextRoundOf(last)!.starting!.wrapper
    const r = await theRoundsRun('nr-worker', launcher, last, main, 'A made-up next round of nr-worker, filed by hand')
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body['runKey']?.key).toMatch(/^[0-9a-f]{64}$/)
    const round = String(r.body['record'].id)
    const kept = theNextRoundOf(last)!
    expect(kept.state).toBe('started')
    expect(kept.started).toMatchObject({ run: round, runKeyId: dataOf(round)['extra'].runKeyId })
  })
})

describe('7. how the launcher ended', () => {
  it('keeps the round’s open process row, and tells the asker of a launcher that ended badly', async () => {
    const kept = theNextRoundOf(last)!
    const round = kept.started!.run
    const row = await aLiveProcessRow(round)
    try {
      const ok = await call('POST', `/api/worker/rounds/${last}/ended`, AS_THE_WORKER(), { wrapper: kept.starting!.wrapper, ok: true, says: 'The made-up launcher exited with code 0.' })
      expect(ok.status, JSON.stringify(ok.body)).toBe(200)
      expect(theNextRoundOf(last)).toMatchObject({ state: 'started', launcher: { ok: true }, process: { row } })
      const toldBefore = linesToThePersonAbout(last).length
      const bad = await call('POST', `/api/worker/rounds/${last}/ended`, AS_THE_WORKER(), { wrapper: kept.starting!.wrapper, ok: false, says: 'The made-up launcher exited with code 2.' })
      expect(bad.status, JSON.stringify(bad.body)).toBe(200)
      expect(linesToThePersonAbout(last).length).toBe(toldBefore + 1)
      expect(linesToThePersonAbout(last).at(-1)).toContain(`The launcher filed run ${round} and then ended badly: The made-up launcher exited with code 2.`)
    } finally {
      dropTheRow(row)
    }
  })
})

describe('8. the launcher’s command line', () => {
  it('is the sandbox launcher’s round command, under the worker’s name, with the office’s model and no effort', () => {
    const real = new RoundAdapter({ PATH: process.env['PATH'] })
    const asked = {
      session: 'launcher-run', cwd: CHECKOUT, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'out'), key: null,
      instance: 'nr-made-up-sandbox', sandboxes: dirname(main.folder), handle: 'nr-worker', brief: main.brief, model: A_MADE_UP_MODEL, runtime: 'claude-code',
    }
    const line = real.commandFor({ ...asked, follows: 'the-run-before' })
    expect(line).toEqual({
      command: 'node',
      args: [
        join(CHECKOUT, 'tools/sandbox.mjs'), 'round', 'nr-made-up-sandbox',
        '--sandboxes', dirname(main.folder), '--agent', 'nr-worker', '--brief', main.brief, '--model', A_MADE_UP_MODEL, '--runtime', 'claude-code',
        '--continues', 'the-run-before',
        '--as', THE_LAUNCHER_ASKS_AS, '--session', 'launcher-run', '--api', 'http://127.0.0.1:1', '--workspace', 'default',
      ],
    })
    expect(() => real.commandFor(asked)).toThrow("The sandbox launcher's round command needs --continues, the run the round follows.")
    expect(() => real.commandFor({ ...asked, verb: 'worker', parent: 'a-supervisor-run', follows: 'the-run-before' })).toThrow("The sandbox launcher's worker command takes no --continues.")
    expect(THE_LAUNCHER_ASKS_AS).toBe(THE_WORKER_ID)
    const missing = new RoundAdapter({ PATH: process.env['PATH'], MOLE_OFFICE_FAKE_ROUND_LAUNCHER: join(scratch, 'no-such-launcher.mjs') })
    expect(missing.whyItCannotStart(CHECKOUT)).toBe(`The sandbox launcher ${join(scratch, 'no-such-launcher.mjs')} is not in this checkout, so no round was started.`)
  })
})

describe('9. a worker pass starts the launcher, and the next pass closes it', () => {
  it('starts a wanted round on a merges-only pass too, closes its launcher on the next one, and starts no run for a message', async () => {
    const quiet = aSandbox('nr-quiet-sandbox')
    const run = aSandboxRun('nr-quiet', quiet)
    try {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'merges-only'
      expect((await ask('nr-quiet', AS_THE_PERSON, { brief: quiet.brief })).status).toBe(202)
    } finally {
      process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
    }
    const mergesOnly = { ...settings, mergesOnly: true }
    const rounds: WatchingARound[] = []
    const first = await onePass(mergesOnly, [], noMerges(), rounds)
    expect(first.started, 'the merges-only pass started an agent run for a message').toEqual([])
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run, wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(mergesOnly, [], noMerges(), rounds)
    expect(second.started).toEqual([])
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    expect(rounds).toEqual([])
    expect(theNextRoundOf(run),JSON.stringify(dataOf(wrapper))).toMatchObject({ state: 'started', starting: { wrapper }, launcher: { ok: true } })
    expect(dataOf(wrapper)).toMatchObject({ state: 'finished', runtime: 'round-launcher' })
    expect(MERGES_ONLY_SAYS).toContain('it starts no agent run for a message, so every message to an agent stays queued.')
    expect(MERGES_ONLY_SAYS).toContain(
      'It does start the rounds asked for through the next-round door (POST /api/agents/<agent>/next-round) and the worker runs ' +
        'asked for through the worker-run door (POST /api/agents/<agent>/worker-run), and no other agent run.',
    )
  })

  it('starts the launcher, which files the round’s run with the office’s key, and closes the launcher run', async () => {
    const looper = aSandbox('nr-looper-sandbox')
    const run = aSandboxRun('nr-looper', looper, 'nr-starter', { model: A_RULED_MODEL })
    const changedProfile = await call('POST', `/api/office/run-models/agent/${agents.get('nr-looper')!.id}`, AS_THE_PERSON, { model: A_MADE_UP_MODEL, variant: null })
    expect(changedProfile.status, JSON.stringify(changedProfile.body)).toBe(200)
    expect((await ask('nr-looper', AS_THE_PERSON, { brief: looper.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started, 'the pass started an agent run').toEqual([])
    expect(first.rounds?.held).toEqual([])
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run, wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    expect(rounds).toEqual([])

    const capture = JSON.parse(readFileSync(join(captures, `${wrapper}.json`), 'utf8')) as {
      argv: string[]; keyGiven: boolean; officeSettings: string[]; filed: { ok: boolean; id: string; keyAnswered: boolean }
      start: { effort: string | null; effortFrom: string; officeUnavailable: boolean } | null
    }
    expect(capture.argv).toEqual(expect.arrayContaining(['round', 'nr-looper-sandbox', '--agent', 'nr-looper', '--model', A_RULED_MODEL, '--as', THE_WORKER_ID, '--session', wrapper]))
    expect(capture.argv.slice(capture.argv.indexOf('--continues'), capture.argv.indexOf('--continues') + 2)).toEqual(['--continues', run])
    expect(capture.argv).not.toContain('--effort')
    expect(capture.keyGiven).toBe(true)
    expect(capture.officeSettings).toEqual(['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE'])
    expect(capture.filed, JSON.stringify(capture.filed)).toMatchObject({ ok: true, keyAnswered: true })

    const kept = theNextRoundOf(run)!
    expect(kept).toMatchObject({ state: 'started', started: { run: capture.filed.id }, launcher: { ok: true }, starting: { wrapper } })
    const round = dataOf(capture.filed.id)
    expect(round).toMatchObject({ servingAgent: 'nr-looper', model: A_RULED_MODEL, parentAttachment: wrapper, state: 'running' })
    // THE STARTING ENTRY AND THE LAUNCHER AGREE ON THE EFFORT (the inspector's refusal cI6RX4Ur8IiO, invariant 9): what the
    // launcher's reader was answered, asked with the round run's own key, and wrote on that run, is what the entry records.
    expect(THE_RULES_EFFORT, `the owner's rule gives ${A_RULED_MODEL} no effort, so this case proves nothing`).not.toBeNull()
    expect(capture.start).toEqual({ effort: kept.starting!.effort, effortFrom: kept.starting!.effortFrom, officeUnavailable: false })
    expect(capture.start).toMatchObject({ effort: THE_RULES_EFFORT, effortFrom: "the owner's rule" })
    expect(round['effort']).toBe(kept.starting!.effort)
    const derived = t.client.sqlite.prepare("SELECT to_id AS toId FROM links WHERE from_id = ? AND type = 'derived_from'").all(capture.filed.id) as { toId: string }[]
    expect(derived).toEqual([{ toId: run }])
    const launcherRun = dataOf(wrapper)
    expect(launcherRun).toMatchObject({ state: 'finished', runtime: 'round-launcher', startedByMoleOffice: true, usageReceipt: { runtime: 'round-launcher' } })
    expect(launcherRun['servingAgent']).toBeUndefined()
  })

  it('leaves the ask failed and tells the asker when the launcher files nothing', async () => {
    const failer = aSandbox('nr-failer-sandbox')
    const run = aSandboxRun('nr-failer', failer)
    expect((await ask('nr-failer', AS_THE_PERSON, { brief: failer.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const failing = { ...settings, env: { ...settings.env, NEXT_ROUND_FAKE_MODE: 'fail' } }
    const first = await onePass(failing, [], noMerges(), rounds)
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run, wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(failing, [], noMerges(), rounds)
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    const kept = theNextRoundOf(run)!
    expect(kept.state).toBe('failed')
    expect(kept.failed?.says).toContain('The launcher ended before it filed a run: The sandbox launcher exited with code 3.')
    expect(kept.failed?.says).toContain('A made-up launcher failure: no run was filed.')
    expect(linesToThePersonAbout(run)).toHaveLength(1)
    expect(dataOf(wrapper)).toMatchObject({ state: 'crashed', runtime: 'round-launcher' })
  })
})

describe('12. with no Casting row in force, continuation settings belong to the previous run', () => {
  // NO ROLE, SO THE WORKER CARD, and this file adds no row for it: no Casting row is in force for these agents.
  it('launches a Codex agent with its stored model when no Casting row is in force, despite a different native served model', async () => {
    const handle = 'nr-codex-agent'
    await started(handle, null, asOne('nr-secretary'), 'codex')
    const sandbox = aSandbox('nr-codex-agent-sandbox')
    const model = 'openai/gpt-6.1-sol'
    const run = aSandboxRun(handle, sandbox, 'nr-secretary', {
      runtime: 'codex', model, effort: 'medium',
      served: { model: 'gpt-6-luna', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } },
    })
    expect((await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.started).toEqual([])
    expect(first.rounds?.held).toEqual([])
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run, wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    expect(rounds).toEqual([])
    const capture = JSON.parse(readFileSync(join(captures, `${wrapper}.json`), 'utf8'))
    expect(capture.argv).toEqual(expect.arrayContaining(['--runtime', 'codex', '--model', model]))
    expect(capture.command).toEqual(['codex', 'exec', '--json', '-m', 'gpt-6.1-sol', '--', 'a made-up brief'])
    expect(capture.filed, JSON.stringify(capture.filed)).toMatchObject({ ok: true, keyAnswered: true })
    expect(theNextRoundOf(run)).toMatchObject({
      state: 'started', starting: { model, effort: theOwnersEffort(model), effortFrom: "the owner's rule" },
      started: { run: capture.filed.id }, launcher: { ok: true },
    })
    expect(dataOf(capture.filed.id)).toMatchObject({ runtime: 'codex', model, effort: theOwnersEffort(model), parentAttachment: wrapper })
    expect(dataOf(capture.filed.id)['served']).toBeUndefined()
    expect(capture.start.effort).toBe(theNextRoundOf(run)!.starting!.effort)
  })

  const BAD_CONTINUATIONS = [
    ['missing runtime', { runtime: undefined }, 'names no runtime'],
    ['blank runtime', { runtime: ' ' }, 'names no runtime'],
    ['invalid runtime', { runtime: 'not-a-runtime' }, 'runtime'],
    ['missing model', { model: undefined }, 'names no model'],
    ['blank model', { model: ' ' }, 'names no model'],
    ['invalid model', { model: 'claude opus' }, 'model'],
    ['Claude with an OpenAI model', { model: 'openai/gpt-6.1-sol' }, 'model'],
    ['Codex with an Anthropic model', { runtime: 'codex', model: 'anthropic/claude-opus-5-5' }, 'model'],
    ['Codex without its provider', { runtime: 'codex', model: 'gpt-6.1-sol' }, 'model'],
  ] as const
  /** An agent with no role, so the worker card, which this file gives no row, and its run in its own sandbox. */
  async function anUncastLine(handle: string): Promise<{ run: string; brief: string }> {
    await started(handle, null, asOne('nr-secretary'))
    const sandbox = aSandbox(handle)
    const run = aSandboxRun(handle, sandbox, 'nr-secretary', { served: { model: 'claude-opus-5-5', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } } })
    return { run, brief: sandbox.brief }
  }
  const aHandleFor = (name: string, door: 'ask' | 'start'): string => `nr-${door}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`

  it.each(BAD_CONTINUATIONS)('refuses %s at the ask when no Casting row is in force, and writes no ask', async (name, continuation, reason) => {
    const { run, brief } = await anUncastLine(aHandleFor(name, 'ask'))
    // Stored legacy state can be incomplete or invalid even when today's create door refuses those values.
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...dataOf(run), ...continuation }), run)
    const answer = await ask(aHandleFor(name, 'ask'), AS_THE_PERSON, { brief })
    expect(answer.status, JSON.stringify(answer.body)).toBe(409)
    expect(answer.body['error']).toContain(`Run ${run}`)
    expect(answer.body['error']).toContain(reason)
    expect(answer.body['error']).toMatch(/ Nothing was written\.$/)
    expect(theNextRoundOf(run)).toBeUndefined()
    expect(linesToThePersonAbout(run)).toEqual([])
  })

  it.each(BAD_CONTINUATIONS)('refuses %s at the start when it was changed after the ask', async (name, continuation, reason) => {
    const { run, brief } = await anUncastLine(aHandleFor(name, 'start'))
    expect((await ask(aHandleFor(name, 'start'), AS_THE_PERSON, { brief })).status).toBe(202)
    // THE RUN'S RUNTIME IS READ AGAIN AT THE START, and the model is the one the ask kept, so each is changed where the
    // start reads it.
    const data = dataOf(run)
    const changed = {
      ...data,
      ...('runtime' in continuation ? { runtime: continuation.runtime } : {}),
      ...('model' in continuation ? { nextRound: { ...data['nextRound'], model: continuation.model } } : {}),
    }
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(changed), run)
    const wrapper = await aLauncherRun(run)
    const before = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }
    const answer = await call('POST', `/api/worker/rounds/${run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(answer.status, JSON.stringify(answer.body)).toBe(409)
    expect(answer.body['error']).toContain('model' in continuation ? `The ask after run ${run}` : `Run ${run}`)
    expect(answer.body['error']).toContain(reason)
    expect(answer.body['error']).toContain('Nothing was started.')
    expect(theNextRoundOf(run)?.state).toBe('failed')
    expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get()).toEqual(before)
    expect(() => readFileSync(join(captures, `${wrapper}.json`))).toThrow()
  })
})

describe('13. the round takes its model from the role’s Casting row in force', () => {
  // MADE-UP ROWS FOR THE SUPERVISOR CARD, which no case before this one gives a row, with made-up models and effort.
  const A_CAST_MODEL_BEFORE = 'claude-made-up-cast-1'
  const A_CAST_MODEL = 'claude-made-up-cast-2'
  const A_HELD_CAST_MODEL = 'claude-made-up-cast-3'
  const A_CAST_EFFORT = `effort-made-up-${randomBytes(4).toString('hex')}`
  /** The supervisor row the first case adds and changes; in force until the last case marks another. */
  let row = 0
  const sessions = (): unknown => t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get()

  it('starts the model of the row in force as the row reads after it is changed, with the row’s effort', async () => {
    const handle = 'nr-cast-supervisor'
    await started(handle, 'supervisor', asOne('nr-secretary'))
    // THE ROW HAS NATIVE FIELDS, because a launcher starts a model its compatibility list does not name only through the
    // row's native selection, and these models are made up.
    const added = await call('POST', '/api/casting/supervisor', AS_THE_PERSON, {
      program: { value: 'claude-code' }, model: { value: A_CAST_MODEL_BEFORE }, effort: { value: A_CAST_EFFORT },
      native: { model: `native-made-up-${randomBytes(4).toString('hex')}`, provider: null, variant: null },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    row = Number(added.body['casting'].id)
    expect((await call('POST', `/api/casting/rows/${String(row)}/mark`, AS_THE_PERSON)).status).toBe(200)
    // THE ROLE'S ROW IS CHANGED before the round is asked for, and the round starts what it names now.
    const changed = await call('PATCH', `/api/casting/rows/${String(row)}`, AS_THE_PERSON, { model: { value: A_CAST_MODEL } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const sandbox = aSandbox('nr-cast-supervisor-sandbox')
    const run = aSandboxRun(handle, sandbox, 'nr-secretary')
    expect(dataOf(run)['model']).toBe(A_PREVIOUS_MODEL)
    expect((await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    const wrapper = first.rounds?.started[0]?.wrapper ?? ''
    expect(first.rounds?.started).toEqual([{ run, wrapper }])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    const capture = JSON.parse(readFileSync(join(captures, `${wrapper}.json`), 'utf8'))
    expect(capture.argv.slice(capture.argv.indexOf('--runtime'), capture.argv.indexOf('--runtime') + 2)).toEqual(['--runtime', 'claude-code'])
    expect(capture.argv.slice(capture.argv.indexOf('--model'), capture.argv.indexOf('--model') + 2)).toEqual(['--model', A_CAST_MODEL])
    expect(capture.filed, JSON.stringify(capture.filed)).toMatchObject({ ok: true, keyAnswered: true })
    const kept = theNextRoundOf(run)!
    expect(kept).toMatchObject({ state: 'started', starting: { wrapper, model: A_CAST_MODEL, effort: A_CAST_EFFORT, effortFrom: 'Casting' }, launcher: { ok: true } })
    expect(kept.starting!.modelSays).toBe(`Casting row ${String(row)}, in force for supervisor when the round was asked for, names ${A_CAST_MODEL} for claude-code, so the round starts ${A_CAST_MODEL}.`)
    expect(capture.start).toMatchObject({ effort: A_CAST_EFFORT, effortFrom: 'Casting' })
    expect(dataOf(capture.filed.id)).toMatchObject({ runtime: 'claude-code', model: A_CAST_MODEL, effort: A_CAST_EFFORT, parentAttachment: wrapper })
  })

  it('keeps the previous run’s model when no row is in force for the card, and says so in one sentence', async () => {
    // NO ROLE, SO THE WORKER CARD, which this file gives no row.
    const handle = 'nr-uncast'
    await started(handle, null, asOne('nr-secretary'))
    const sandbox = aSandbox('nr-uncast-sandbox')
    const run = aSandboxRun(handle, sandbox, 'nr-secretary')
    const asked = await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const wrapper = await aLauncherRun(run)
    const r = await call('POST', `/api/worker/rounds/${run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    // READ AFTER THE START, so a wrong sentence leaves no wanted ask for section 11's pass to find.
    expect(asked.body['says']).toContain(
      `No Casting row is in force for ${A_ROW_WITH_NO_ROLE_READS_AS} in default, so the round keeps model ${A_PREVIOUS_MODEL} from run ${run}. ` +
        'The start keeps that model, and a row added before the round starts is not taken.',
    )
    const says = `No Casting row was in force for ${handle} in default when the round was asked for, so the round keeps model ${A_PREVIOUS_MODEL} from run ${run}.`
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: A_PREVIOUS_MODEL, modelSays: says })
    expect(theNextRoundOf(run)).toMatchObject({ state: 'starting', starting: { wrapper, model: A_PREVIOUS_MODEL, modelSays: says } })
  })

  it('keeps the run when the row in force casts another runtime', async () => {
    const handle = 'nr-cast-codex'
    const model = 'openai/gpt-made-up-round-0'
    await started(handle, 'supervisor', asOne('nr-secretary'), 'codex')
    const sandbox = aSandbox('nr-cast-codex-sandbox')
    const run = aSandboxRun(handle, sandbox, 'nr-secretary', { runtime: 'codex', model })
    const r = await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })
    const says = `Casting row ${String(row)}, in force for supervisor, casts claude-code, and no row in force casts codex, the run's program, so the round keeps runtime codex and model ${model} from run ${run}.`
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['says']).toContain(says)
    expect(theNextRoundOf(run)).toMatchObject({ row: null, model, unmatchedRow: { id: row, card: 'supervisor', program: 'claude-code' } })
    const wrapper = await aLauncherRun(run)
    const startedRound = await call('POST', `/api/worker/rounds/${run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(startedRound.status, JSON.stringify(startedRound.body)).toBe(200)
    expect(startedRound.body['round']).toMatchObject({ runtime: 'codex', model })
  })

  it('refuses at the ask, in words, a round whose row in force is held, writes no ask and tells nobody', async () => {
    const handle = 'nr-cast-held'
    await started(handle, 'supervisor', asOne('nr-secretary'))
    const added = await call('POST', '/api/casting/supervisor', AS_THE_PERSON, {
      program: { value: 'claude-code' }, model: { value: A_HELD_CAST_MODEL }, effort: { value: A_CAST_EFFORT },
      native: { model: `native-made-up-${randomBytes(4).toString('hex')}`, provider: null, variant: null },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const held = String(added.body['casting'].id)
    expect((await call('POST', `/api/casting/rows/${held}/mark`, AS_THE_PERSON)).status).toBe(200)
    // HELD AS A NATIVE REFUSAL HOLDS IT (tests/a-held-casting-row-stops-a-start-and-never-a-read.test.ts): a run names the
    // row's selection as the one it was started with, and the refusal is reported for that run as the person. The run
    // serves an agent no case asks a round for, so it serves nobody this case reads.
    const read = await call('GET', `/api/casting/rows/${held}/selection`, AS_THE_PERSON)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const selection = read.body['selection']
    const holder = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title: 'A made-up run started from a held row', data: {
      runtime: selection.runtime, model: selection.model, servingAgent: 'nr-stranger', state: 'running', extra: { launcherSelection: selection },
    } })
    expect(holder.status, JSON.stringify(holder.body)).toBe(201)
    const refusal = { kind: 'model', code: 'model_not_found', said: 'A made-up native refusal of the selected model.' }
    const hold = await call('POST', `/api/casting/rows/${held}/hold`, AS_THE_PERSON, { revision: selection.casting.revision, run: holder.body['record'].id, refusal })
    expect(hold.status, JSON.stringify(hold.body)).toBe(200)
    const refused = await call('GET', `/api/casting/rows/${held}/selection`, AS_THE_PERSON)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    const says = String(refused.body['error'])
    expect(says).not.toBe('')

    expect(says).toMatch(/ Nothing was started\.$/)

    const sandbox = aSandbox('nr-cast-held-sandbox')
    const run = aSandboxRun(handle, sandbox, 'nr-secretary')
    const before = sessions()
    const r = await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toBe(`${says.replace(/ Nothing was started\.$/, '')} Nothing was written.`)
    expect(theNextRoundOf(run)).toBeUndefined()
    expect(linesToThePersonAbout(run)).toEqual([])
    expect(sessions()).toEqual(before)
  })
})

describe('10. the setting that names the synthetic launcher', () => {
  it('is declared, off when absent, and not in the template', () => {
    const declared = settingNamed('MOLE_OFFICE_FAKE_ROUND_LAUNCHER')
    expect(declared.fallback).toBeNull()
    expect(declared.absentMeans).toMatch(/^off: /)
    expect(declared.inTemplate).toBe(false)
  })
})

describe('11. a run whose next round holds the office’s nulls takes later writes', () => {
  it('keeps a round with no effort and no process row, and the run then takes its doing line and its finish', async () => {
    const sealer = aSandbox('nr-sealer-sandbox')
    const run = aSandboxRun('nr-sealer', sealer, 'nr-starter', { cutFrom: THE_CHECKOUTS_HEAD })
    expect((await ask('nr-sealer', AS_THE_PERSON, { brief: sealer.brief })).status).toBe(202)
    const rounds: WatchingARound[] = []
    const first = await onePass(settings, [], noMerges(), rounds)
    expect(first.rounds?.started.map((one) => one.run)).toEqual([run])
    await launchersEnded(rounds)
    const second = await onePass(settings, [], noMerges(), rounds)
    expect(second.rounds?.ended.map((one) => one.run)).toEqual([run])
    // WHAT THE OFFICE STORED, through its own doors: no effort, because the owner's rule has none for the made-up model,
    // and no process row, because the made-up launcher started no process for the round's run.
    expect(dataOf(run)['nextRound']).toMatchObject({ state: 'started', starting: { effort: null, effortFrom: 'none' }, process: { row: null } })
    // THE RUN'S LATER WRITES, each checked against the whole data as it would be stored, the office's nulls included.
    const doing = await call('PATCH', `/api/records/${run}`, AS_THE_PERSON, { dataPatch: { doing: 'reading what the made-up next round did' } })
    expect(doing.status, JSON.stringify(doing.body)).toBe(200)
    const note = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: `A made-up note that run ${run} submits` })
    expect(note.status, JSON.stringify(note.body)).toBe(201)
    const finished = await call('PATCH', `/api/records/${run}`, AS_THE_PERSON, {
      dataPatch: { state: 'finished', submission: { kind: 'records', records: [String(note.body['record'].id)] } },
    })
    expect(finished.status, JSON.stringify(finished.body)).toBe(200)
    expect(dataOf(run)).toMatchObject({ state: 'finished', doing: 'reading what the made-up next round did', nextRound: { starting: { effort: null }, process: { row: null } } })
  })
})


describe('the test office owns its connections through shutdown', () => {
  it.each(['before shutdown', 'during shutdown'] as const)('closes a connection accepted %s before it sends HTTP', async (when) => {
    const office = fastify({ logger: false })
    const stop = closingThisTestOffice(office)
    let closingBegan!: () => void
    const began = new Promise<void>((resolve) => { closingBegan = resolve })
    let letCloseContinue!: () => void
    const held = new Promise<void>((resolve) => { letCloseContinue = resolve })
    office.addHook('preClose', async () => { closingBegan(); await held })
    await office.listen({ host: '127.0.0.1', port: 0 })
    const port = (office.server.address() as AddressInfo).port
    let connected: { client: Socket; peer: Socket } | undefined
    let ended: Promise<void> | undefined
    const accept = async () => {
      const accepted = new Promise<Socket>((resolve) => office.server.once('connection', resolve))
      const client = connect({ host: '127.0.0.1', port })
      client.on('error', () => {})
      connected = { client, peer: await accepted }
    }
    try {
      if (when === 'before shutdown') await accept()
      ended = stop()
      await began
      if (when === 'during shutdown') await accept()
      expect(connected!.peer.destroyed, 'the fixture must not wait for this peer to send a request or close itself').toBe(true)
    } finally {
      letCloseContinue()
      connected?.client.destroy()
      connected?.peer.destroy()
      await (ended ?? stop())
    }
  })
})

 it('passes a repair worktree and exact cut together while ordinary rounds keep their command', () => {
  const adapter = new RoundAdapter(process.env)
  const base = { cwd: CHECKOUT, session: 'synthetic-wrapper', instance: 'synthetic', sandboxes: '/tmp/synthetic-rounds', handle: 'synthetic-line', brief: '/tmp/synthetic-brief.md', model: A_MADE_UP_MODEL, runtime: 'claude-code', follows: 'synthetic-sealed-run', api: 'http://127.0.0.1:1', workspace: 'default', outputPath: '/tmp/synthetic-round-output' }
  const plain = adapter.commandFor(base)
  expect(plain.args).not.toContain('--worktree')
  expect(plain.args).not.toContain('--cut-from')
  const worktree = '/tmp/synthetic-rounds/synthetic/worktrees/fresh', cutFrom = 'a'.repeat(40)
  const fresh = adapter.commandFor({ ...base, worktree, cutFrom })
  expect(fresh.args[fresh.args.indexOf('--worktree') + 1]).toBe(worktree)
  expect(fresh.args[fresh.args.indexOf('--cut-from') + 1]).toBe(cutFrom)
  expect(() => adapter.commandFor({ ...base, worktree })).toThrow()
  expect(() => adapter.commandFor({ ...base, cutFrom })).toThrow()
 })

describe('a next round after a sealed run', () => {
  const git = (dir: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

  async function sealedRound(foreign = false): Promise<{ handle: string; run: string; sandbox: ReturnType<typeof aSandbox>; repo: string; base: string; tip: string }> {
    const handle = `sealed-${randomBytes(5).toString('hex')}`
    await started(handle, null, asOne('nr-starter'), 'claude-code', ['tests'])
    const sandbox = aSandbox(handle)
    const repo = join(sandbox.folder, foreign ? 'other-repo' : 'repo')
    mkdirSync(join(repo, 'tests'), { recursive: true })
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.name', 'Synthetic fixture')
    git(repo, 'config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(repo, 'tests', 'example.txt'), 'base\n')
    git(repo, 'add', 'tests/example.txt')
    git(repo, 'commit', '-qm', 'Base')
    const base = git(repo, 'rev-parse', 'HEAD')
    writeFileSync(join(repo, 'tests', 'example.txt'), 'released\n')
    git(repo, 'commit', '-qam', 'Released work')
    const tip = git(repo, 'rev-parse', 'HEAD')
    if (foreign) {
      const sandboxRepo = join(sandbox.folder, 'repo')
      mkdirSync(sandboxRepo)
      git(sandboxRepo, 'init', '-q', '-b', 'main')
    }
    const run = aSandboxRun(handle, sandbox, 'nr-starter', { workingDirectory: repo, cutFrom: base, submission: { kind: 'git' } })
    t.api.patchRecord(run, { dataPatch: { state: 'finished' } }, { type: 'human', id: THE_PERSON })
    expect(dataOf(run)['sealedTip']).toEqual(expect.any(String))
    expect((await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })).status).toBe(202)
    return { handle, run, sandbox, repo, base, tip }
  }

  it('passes the released tip and the previous cut to a new worktree', async () => {
    const f = await sealedRound()
    const wrapper = await aLauncherRun(f.run)
    const result = await call('POST', `/api/worker/rounds/${f.run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
    const worktree = join(f.sandbox.folder, 'worktrees', `${f.handle}-${wrapper}`)
    expect(result.body['round']).toMatchObject({ worktree, cutFrom: f.base, tip: f.tip })
    expect(theNextRoundOf(f.run)?.starting).toMatchObject({ worktree, cutFrom: f.base, tip: f.tip })
    const adapter = new RoundAdapter(process.env)
    const args = adapter.commandFor({ cwd: CHECKOUT, session: wrapper, instance: f.handle, sandboxes: dirname(f.sandbox.folder), handle: f.handle, brief: f.sandbox.brief, model: A_MADE_UP_MODEL, runtime: 'claude-code', follows: f.run, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'round-output'), worktree, cutFrom: f.base, tip: f.tip }).args
    expect(args[args.indexOf('--at') + 1]).toBe(f.tip)
    expect(() => adapter.commandFor({ cwd: CHECKOUT, session: wrapper, instance: f.handle, sandboxes: dirname(f.sandbox.folder), handle: f.handle, brief: f.sandbox.brief, model: A_MADE_UP_MODEL, runtime: 'claude-code', follows: f.run, api: 'http://127.0.0.1:1', workspace: 'default', outputPath: join(scratch, 'round-output'), tip: f.tip })).toThrow()
  })

  it('gives the worker launcher the prepared directory, cut, and released tip', async () => {
    const f = await sealedRound()
    const rounds: WatchingARound[] = []
    const failing = { ...settings, checkout, env: { ...settings.env, NEXT_ROUND_FAKE_MODE: 'fail' } }
    const pass = await onePass(failing, [], noMerges(), rounds)
    const started = pass.rounds?.started.find((one) => one.run === f.run)
    expect(started).toBeDefined()
    await launchersEnded(rounds)
    const capture = JSON.parse(readFileSync(join(captures, `${started!.wrapper}.json`), 'utf8')) as { argv: string[] }
    const worktree = join(f.sandbox.folder, 'worktrees', `${f.handle}-${started!.wrapper}`)
    expect(capture.argv.slice(capture.argv.indexOf('--worktree'), capture.argv.indexOf('--worktree') + 2)).toEqual(['--worktree', worktree])
    expect(capture.argv.slice(capture.argv.indexOf('--cut-from'), capture.argv.indexOf('--cut-from') + 2)).toEqual(['--cut-from', f.base])
    expect(capture.argv.slice(capture.argv.indexOf('--at'), capture.argv.indexOf('--at') + 2)).toEqual(['--at', f.tip])
    await onePass(failing, [], noMerges(), rounds)
  })

  it('fails and tells the asker when the new directory already exists', async () => {
    const f = await sealedRound()
    const wrapper = await aLauncherRun(f.run)
    mkdirSync(join(f.sandbox.folder, 'worktrees', `${f.handle}-${wrapper}`), { recursive: true })
    const result = await call('POST', `/api/worker/rounds/${f.run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(result.status).toBe(409)
    const failed = theNextRoundOf(f.run)?.failed?.says
    expect(failed).toEqual(expect.any(String))
    expect(result.body['error']).toContain(failed)
    expect(linesToThePersonAbout(f.run).at(-1)).toContain(failed)
  })

  it.each(['another repository', 'no cut'] as const)('fails and tells the asker when the previous run has %s', async (reason) => {
    const f = await sealedRound(reason === 'another repository')
    if (reason === 'no cut') t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.cutFrom') WHERE id = ?").run(f.run)
    const wrapper = await aLauncherRun(f.run)
    const result = await call('POST', `/api/worker/rounds/${f.run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(result.status).toBe(409)
    const failed = theNextRoundOf(f.run)?.failed?.says
    expect(failed).toEqual(expect.any(String))
    expect(result.body['error']).toContain(failed)
    expect(linesToThePersonAbout(f.run).at(-1)).toContain(failed)
  })

  it.each(['no seal', 'records seal'] as const)('explains the previous directory when there is %s', async (kind) => {
    const handle = `records-${randomBytes(5).toString('hex')}`
    await started(handle, null, asOne('nr-starter'))
    const sandbox = aSandbox(handle)
    const run = aSandboxRun(handle, sandbox, 'nr-starter', kind === 'records seal' ? { cutFrom: THE_CHECKOUTS_HEAD } : {})
    if (kind === 'records seal') {
      const note = await call('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'A synthetic submitted note' })
      expect(note.status).toBe(201)
      const finished = await call('PATCH', `/api/records/${run}`, AS_THE_PERSON, { dataPatch: { state: 'finished', submission: { kind: 'records', records: [String(note.body['record'].id)] } } })
      expect(finished.status).toBe(200)
      expect(dataOf(run)['sealedTip']).toEqual(expect.any(String))
    }
    expect((await ask(handle, AS_THE_PERSON, { brief: sandbox.brief })).status).toBe(202)
    const wrapper = await aLauncherRun(run)
    const result = await call('POST', `/api/worker/rounds/${run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(result.status).toBe(200)
    expect(result.body['round'].worktree).toBeUndefined()
    const says = (theNextRoundOf(run)?.starting as Record<string, unknown> | undefined)?.['worktreeSays']
    expect(says).toEqual(expect.any(String))
    expect(says).toContain(run)
    expect(says).toContain(CHECKOUT)
    expect(says).toMatch(/git seal/)
  })

  it('refuses the old directory, a different cut, and a different HEAD at filing', async () => {
    const f = await sealedRound()
    const wrapper = await aLauncherRun(f.run)
    const result = await call('POST', `/api/worker/rounds/${f.run}/starting`, AS_THE_WORKER(), { wrapper })
    expect(result.status).toBe(200)
    const worktree = join(f.sandbox.folder, 'worktrees', `${f.handle}-${wrapper}`)
    git(f.repo, 'worktree', 'add', '--detach', worktree, f.tip)
    const file = (directory: string, cutFrom: string, title: string) => call('POST', '/api/records', AS_THE_WORKER(wrapper), {
      kind: 'session', title,
      data: { state: 'running', runtime: 'claude-code', model: A_MADE_UP_MODEL, servingAgent: f.handle, servingAgentId: agents.get(f.handle)!.id, workingDirectory: directory, cutFrom, parentAttachment: wrapper, sandbox: { template: 'mole-office-dev', container: f.sandbox.container, folder: f.sandbox.folder } },
      links: [{ type: 'derived_from', toId: f.run }],
    })
    expect((await file(f.repo, f.base, 'Old directory')).status).toBe(409)
    expect((await file(worktree, f.tip, 'Another cut')).status).toBe(409)
    git(worktree, 'checkout', '--detach', f.base)
    expect((await file(worktree, f.base, 'Another head')).status).toBe(409)
    git(worktree, 'checkout', '--detach', f.tip)
    expect((await file(worktree, f.base, 'Prepared round')).status).toBe(201)
  })
})

describe('14. the agent’s recorded leader, proved by its own key, asks its next round', () => {
  let led = ''
  let sandbox: { folder: string; brief: string; container: string }

  beforeAll(async () => {
    await started('nr-leader', null)
    await started('nr-led', null, asOne('nr-starter'))
    // THE LEADER IS NOT THE STARTER. A registration records the starter as the owner, so the owner is set apart here.
    setFixtureOwner(t.client.sqlite, agents.get('nr-leader')!.id, agents.get('nr-led')!.id, 'id')
    sandbox = aSandbox('nr-led-sandbox')
    led = aSandboxRun('nr-led', sandbox)
  })

  it('refuses the leader’s header claim with no key and a stranger with its own key, naming the recorded leader', async () => {
    for (const headers of [asAgent('nr-leader'), asOne('nr-stranger')]) {
      const r = await ask('nr-led', headers, { brief: sandbox.brief })
      expect(r.status, JSON.stringify(r.body)).toBe(403)
      expect(r.body['error']).toContain('is asked for by the agent with its own key, its registered starter, its recorded leader, a secretary proved by its own key, or the person')
    }
    expect(theNextRoundOf(led)).toBeUndefined()
  })

  it('takes the leader with its own key, and keeps it as the asker, as its leader', async () => {
    const r = await ask('nr-led', asOne('nr-leader'), { brief: sandbox.brief })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(r.body['run']).toBe(led)
    const kept = theNextRoundOf(led)!
    expect(kept.state).toBe('wanted')
    expect(kept.askedBy).toMatchObject({ as: 'its leader', who: { kind: 'agent', id: agents.get('nr-leader')!.id } })
  })
})
