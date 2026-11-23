// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SESSION_STATES } from '../src/shared/types.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE SANDBOX LAUNCHER, END TO END, WITH DOCKER AND THE DEVCONTAINER CLI REPLACED BY FAKES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * Disk, memory and GPU edge readings and simple model and receipt variants call their readers directly.
 * One launcher path per reader and every secrets, key, stop and scratch sweep case still run as processes.
 * `node tools/sandbox.mjs` (up / exec / status / down) and `tools/sandbox-start.mjs`, the helper it
 * runs inside the container, are run here as separate processes, the way an agent runs them,
 * against a real office on a port of its own (the product's whole API over a throwaway database).
 * Only the two programs that need a docker daemon are fakes:
 *
 *   - `devcontainer up` reads the instance copy of devcontainer.json the launcher wrote, and makes a
 *     "container" in a state file with the mounts that file asks for. It also asks the office, at
 *     the moment it is started, whether the container's ledger row is already there.
 *   - `docker exec` runs the command on this machine, with only the environment docker would give
 *     it (the env file and the -e values), and records its own command line and the env file.
 *   - `docker inspect`, `rm`, `top` and `stop` read and change the same state file.
 *
 * The office's machine probe is the real Linux one, except that it lists the fake containers and
 * says every process is in the sandbox's pid namespace with the pid this machine gives it. So the
 * registration door, the release door and the process-group kill are the real ones, against real
 * processes. The real-container version of the same path is tests/sandbox-real-container.test.ts,
 * which is opt-in because it needs a docker daemon and an image.
 *
 *   1. up REGISTERS the container before the devcontainer CLI starts it, with the --ro folder
 *      read-only, and makes the instance folder (a clone that borrows no objects, home, and of dsh's folder
 *      its profiles alone: not its env file and none of the host's own runs, which every run in the sandbox
 *      could read: problem epOLxauSbzd9).
 *   2. up refuses a writable extra folder, the home directory and the live data folder, and writes
 *      nothing; and a container that docker made writable where read-only was asked for is stopped
 *      through the ledger and removed. It starts from a checkout that has no key file, and refuses
 *      a template that mounts anything back inside a folder it covers (acceptance finding 13).
 *      It refuses a template that would let the sandbox write the gate-count spool, and a container that docker made
 *      so, and takes a read-only bind that holds the spool (wave 13n round Y, item 2l).
 *   3. exec refuses a container that has something mounted inside a folder it covers, which is
 *      what a sandbox started before the key file left the template looks like, and one that can write the spool.
 *      It files the run with its `sandbox` field, starts the command as the leader of its own
 *      process group, and the ledger holds that HOST group: releasing the row ends every process in
 *      it (T2 of the spec).
 *      A run filed elsewhere gets its `sandbox` field written, and one naming another sandbox is refused.
 *      The start line of exec --json is read as bytes and decoded whole, by the helper's front and by the launcher,
 *      so a line longer than one piece of 64 KiB keeps every letter (item 2ab). So does the start line of exec --wait,
 *      which the launcher writes again for an OpenCode command (item 2ad).
 *   4. A secret reaches the command through an env file of mode 600 outside the instance folder,
 *      deleted afterwards, and never through a command line (T4 of the spec).
 *      Plain exec's repeated --secret flags select only declared names set in the host file.
 *      Without --secret, plain exec passes none, with or without --wait.
 *      MUTATIONS: --secret ignored, so every name passes (the A-only case goes red); an undeclared
 *      name accepted (the undeclared-name refusal case goes red). Proved alone after a control run.
 *      The empty-name check taken out: the empty and blank --secret refusal cases go red because
 *      the old sentences return ("takes a value" for empty, "names undeclared secrets" for blank).
 *   5. `--slot` holds the command at its gate until the office gives a seat.
 *      A command over 131,071 bytes is given its seat: the detail sent for the seat and the process row is capped at
 *      a few kilobytes, never inside a letter, with a marker saying how many bytes were left out, and the command runs
 *      whole (item 2z). With --wait the launcher takes the seat on the host, and caps its detail the same way. A refusal
 *      for want of a seat names the error Linux gave, as E2BIG, and not only "exited null" (item 2aa).
 *   6. status names the container, its row and each process with its host group and cwd.
 *   7. down refuses another session's sandbox, and for its own session stops the container only
 *      through the ledger's release door, removes it by its exact id, closes the rows of the
 *      processes that were inside, and keeps every file.
 *   8. up clones each other repository the template declares beside repo/, and --clone cuts an agent's
 *      worktree from one of them, from that clone's own branch (the ai-news studio's news-tools).
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { expectRoundRulesSaved, linkSourceWithLocalRoundRules, writeRoundStartRules } from './round-chapters-fixture.ts'
import { deliveredRoundBrief, savedRoundChapters, THE_CHAPTERS_DOOR } from '../src/shared/round-chapters/manifest.ts'
import { runInNewContext } from 'node:vm'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { homedir, hostname, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, theOfficesOwnId, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { NO_FLOW_NAMED } from '../src/shared/flow-run.ts'
import { settingNamed } from '../src/config/settings.mjs'
import { theModelThatAnsweredSentence } from '../src/shared/session-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_CUT_FROM_COMMIT_IS, A_CUT_FROM_MAY_NOT_START_WITH_A_DASH } from '../src/shared/kind-fields/session-wave-13n.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import * as theFinishWords from '../src/config/finished.mjs'
import { REQUEST_TIMEOUT_MS } from '../src/config/sandbox-start-values.mjs'
import { THE_LONGEST_FINISH_WAIT_MS as THE_OFFICE_TOOLS_FINISH_WAIT } from '../tools/office-request.mjs'
import { theServedOfAClaudeCodeRun } from '../src/config/claude-code-served.mjs'
import { theReceiptOfAnEndedCommand, theReceiptOfAnEndedCodexCommand, A_LATER_READING_FOUND_NO_NUMBERS } from '../src/config/usage.mjs'
import { CODEX_SHELL_SNAPSHOT_OFF, FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF, THE_STARTING_WORDS } from '../tools/harness-features-off.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, aMadeUpPackage, startsOf, theFakeContainersProcesses, theFakeMachine, theNpmCalls, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { noRoomInMemory, theCgroupMemoryPath, THE_FACTS_VARIABLE, theFactsAStartIsGiven, aStreamReadWhole, whyTheSlotToolGaveNoSeat, prepareOpenCodeHome, THE_OPENCODE_OFFICE_WAIT_MARGIN_MS } from '../tools/sandbox-common.mjs'
import { spoolAGateMet, THE_GATE_COUNT_SPOOL_FOLDER } from '../src/config/gate-count-spool.mjs'
import { theRealSpools } from './the-gate-count-spool-under-a-home.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { aLabelFor, EVERY_CHAPTER } from './a-run-in-form.ts'
import { FEATURE_READY } from '../src/server/lib/how-a-round-ended-rules.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

// THE OFFICE TOOL'S FLAG (problem rgAmP45EklqO): the configuration lies in a folder made for it alone in the helper's
// temporary directory, so its name is new on every start, and it is never under logs/.
const AN_MCP_FLAG = expect.stringMatching(/^--mcp-config=\/.+\/office-mcp-[^/]+\/office-mcp\.json$/)
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'sandbox-starter'
const STRANGER = 'sandbox-stranger'
const WORKER = 'sandbox-worker'
const NAME = 'alpha'
const CONTAINER = `mole-office-sandbox-${NAME}`

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let main = '' // the checkout a sandbox is made from
let template = '' // a copy of sandboxes/mole-office-dev with its secrets file pointed here
let sandboxes = ''
let fakes = ''
let dsh = ''
let originals = '' // the extra read-only folder
let side = '' // another repository the template declares, as the ai-news studio declares news-tools
let starterSession = ''
/** The registry id the starter was given when it was registered. It is not its handle. */
let starterId = ''
let strangerSession = ''
/** The key each stand-in agent was answered when it was registered, which the tool is given as that agent's own. */
const theKeyOf = new Map<string, string>()
let upAnswer: { container: string; resource: string; folder: string } | null = null

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

// ---------------------------------------------------------------------------- the fakes

// FAKE_DEVCONTAINER, FAKE_DOCKER and theFakeMachine are in tests/sandbox-stand-ins.ts, shared with
// tests/a-second-round-waits-for-the-first.test.ts.

function state(): {
  containers: Record<string, { Id: string; State: { Running: boolean; Pid?: number }; Config?: { Hostname?: string }; Mounts: { Destination: string; RW: boolean }[] }>
  calls: {
    tool: string
    argv: string[]
    rowSeen?: boolean
    env?: Record<string, string>
    config?: string
    runArgs?: string[]
    mounts?: string[]
    envFile?: string | null
    envFileMode?: number | null
  }[]
  freeBytes?: number
  memoryAvailable?: number
  freeError?: string
  dfError?: string
  bugs: Record<string, boolean>
  api: string
  workspace: string
} {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

function setBug(name: string, on: boolean): void {
  const now = state()
  now.bugs[name] = on
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}

/** The refusal line remains visible. Its remaining explanation is in the file that line names. */
function theRefusalExplanation(ran: Ran): string {
  const files = [...ran.err.matchAll(/Details: ([^\n]+)/g)].map(match => match[1]!)
  return ran.err + files.map(file => readFileSync(file, 'utf8')).join('\n')
}

// ---------------------------------------------------------------------------- helpers

/** A native-named synthetic Codex executable; it runs only this test's original stand-in command. */
function syntheticCodexCommand(name: string, command: string[]): string[] {
  const folder = join(scratch, 'synthetic-codex', name)
  mkdirSync(folder, { recursive: true })
  const program = join(folder, 'codex')
  writeFileSync(program, `#!${process.execPath}\nconst command = ${JSON.stringify(command)};\nconst ran = require('node:child_process').spawnSync(command[0], command.slice(1), { stdio: 'inherit' });\nprocess.exit(ran.status ?? 1);\n`, { mode: 0o755 })
  return [program, ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task']
}

/** An older selected helper is a private copy lacking the permission-contract declaration. */
async function withLegacyCodexHelper(action: () => Promise<void>, version: number | null = null): Promise<void> {
  const tools = join(upAnswer!.folder, 'repo', 'tools')
  const target = readlinkSync(tools)
  const current = readFileSync(join(REPO, 'tools', 'sandbox-start.mjs'), 'utf8')
  const source = current.replace(/^export const PERMISSIONS_CONTRACT = \d+;?$/mu, version === null ? '' : `export const PERMISSIONS_CONTRACT = ${version}`)
  unlinkSync(tools); mkdirSync(tools)
  for (const entry of readdirSync(join(REPO, 'tools'))) {
    if (entry !== 'sandbox-start.mjs') symlinkSync(join(REPO, 'tools', entry), join(tools, entry))
  }
  writeFileSync(join(tools, 'sandbox-start.mjs'), source)
  try { await action() } finally {
    rmSync(tools, { recursive: true })
    symlinkSync(target, tools)
  }
}

interface Ran {
  status: number
  out: string
  err: string
}

/**
 * The tool's arguments with the test's own placed before any `--`, so they never become part of the
 * command, and an environment with the fakes first on PATH and no identity of this session's own.
 */
function theToolsArguments(args: string[], as: { agent: string; session: string } | null): string[] {
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return [
    TOOL,
    ...before,
    '--sandboxes', sandboxes,
    '--api', api,
    '--workspace', WORKSPACE,
    ...(as === null ? [] : ['--as', as.agent, '--session', as.session]),
    ...after,
  ]
}

/**
 * THE SWEEP'S PAUSE IS 0.25 S IN THIS FILE, not the 2 s a real start keeps (SWEEP_PAUSE_MS_FOR_A_TEST, read in
 * tools/sweep-run-scratch.mjs). Every fake container here shares one /tmp, so each waited exec paid 2 s for every run
 * folder earlier cases left there. The two cases that need the 2 s pause take the variable off.
 */
function theToolsEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes, MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_SANDBOX_MEMORY_TEST_ROOT: join(fakes, 'memory-files'), SWEEP_PAUSE_MS_FOR_A_TEST: '250' }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  return env
}

let helpersStartedByHand = 0

/**
 * THE ENVIRONMENT A FAKE CONTAINER GIVES A HELPER THIS FILE STARTS BY HAND: a folder of its own under the test's scratch,
 * the loader that binds the sweep's /tmp to that folder's tmp, and that tmp as the helper's TMPDIR when the case sets
 * none of its own, which the session's inherited TMPDIR is not. A helper given neither swept this machine's real /tmp,
 * and made its run's scratch folder in this session's temporary folder; each call gets a folder of its own, so no two
 * helpers share a fake /tmp.
 */
function withAFakeContainersTmp(env: NodeJS.ProcessEnv, name: string): NodeJS.ProcessEnv {
  helpersStartedByHand += 1
  const folder = join(scratch, `a-hand-started-helper-${String(helpersStartedByHand)}-${name}`)
  const theCasesOwn = 'TMPDIR' in env && env['TMPDIR'] !== process.env['TMPDIR']
  return withAPrivateTmpToSweep(theCasesOwn ? env : { ...env, TMPDIR: join(folder, 'tmp') }, folder)
}

/**
 * THE SANDBOX'S FACTS AS A COMMAND IN IT HOLDS THEM: the launcher gives them to the helper from its own copy, and the
 * helper passes them on to the command. A helper started from inside the sandbox reads them there, and never from the
 * copy in the sandbox's folder.
 */
function theFactsACommandIn(folder: string): NodeJS.ProcessEnv {
  const own = JSON.parse(readFileSync(join(sandboxes, '.run', basename(folder), 'instance.json'), 'utf8'))
  return { [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(own) }
}

/**
 * RUN THE TOOL AS ITS OWN PROCESS, WITHOUT BLOCKING. The office answering it lives in this test's
 * own process, so a synchronous spawn would stop the office from answering until it timed out.
 * Its output is kept as bytes and decoded once it has ended: a piece decoded by itself turns a letter cut between two
 * pieces into U+FFFD (item 2ab). The test keeps its own bytes rather than reading through aStreamReadWhole, which it judges.
 * The agent `as` names is given its own key, as MOLE_AGENT_KEY with MOLE_OFFICE_API beside it; a call that must carry
 * none takes it off in `more`.
 */
function sandbox(args: string[], as: { agent: string; session: string } | null = { agent: STARTER, session: starterSession }, more: NodeJS.ProcessEnv = {}): Promise<Ran> {
  const itsKey = as === null ? undefined : theKeyOf.get(as.agent)
  return new Promise((done) => {
    const child = spawn(process.execPath, theToolsArguments(args, as), { env: { ...theToolsEnvironment(), ...(itsKey === undefined ? {} : { MOLE_AGENT_KEY: itsKey, MOLE_OFFICE_API: api }), ...more }, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

/** A report filed and linked to a run, as a worker files one before it finishes. */
/** The ids of the session records the office holds, sorted: what says whether anything was filed. */
async function theSessionIds(): Promise<string[]> {
  return (((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records ?? []) as { id: string }[]).map((one) => one.id).sort()
}

let reportsFiled = 0

/** A report's title, its own in this file: a report whose title copies another's is a fault of form at the seal. */
function aFreshReportTitle(): string {
  reportsFiled += 1
  return `Synthetic report number ${String(reportsFiled)} of a run the launcher finishes`
}

/**
 * A CRASHED RUN MADE OLD: its record last changed, and its command ended, long ago. The sweep counts a crashed run's wait
 * from the end of its command, and from the record's last change only when no end is recorded.
 */
function theCrashIsOld(run: string): void {
  t.client.sqlite.prepare("UPDATE records SET updated_at = '2020-01-01 00:00:00', data = json_set(data, '$.commandEnded.at', '2020-01-01 00:00:00') WHERE id = ?").run(run)
}

/** A report in form, filed and linked to a run, as a worker files one before it finishes. */
async function aReportOf(run: string): Promise<string> {
  const filed = await ask('POST', '/api/records', AS_STARTER(), { kind: 'report', title: aFreshReportTitle(), data: { for: 'its starter', date: '2026-09-23', chaptersRead: EVERY_CHAPTER, blocks: [{ id: 'b-1', type: 'text', text: 'It made made.txt and committed it. The audit table is left for the merge queue.' }] } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const linked = await ask('POST', '/api/links', AS_STARTER(), { fromId: filed.body.record.id, toId: run, type: 'about' })
  expect(linked.status, JSON.stringify(linked.body)).toBe(201)
  await aLabelFor(filed.body.record.id, WORKSPACE)
  return filed.body.record.id
}

/**
 * THE RUN'S WORD TO ITS STARTER that it seals, as a round's last message says it (tools/a-run-says-it-seals.mjs): the launcher
 * seals a run on its command's clean exit only when its last message to its starter says so (WzlhElg3MepN, 9 Nov 2026).
 */
async function aWordOf(run: string, words: string): Promise<string> {
  const sent = await ask('POST', '/api/records', AS_THE_WORKER(run), { kind: 'message', title: 'The run ends', data: { to: [{ kind: 'agent', id: starterId }], body: words } })
  // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the word, routes it and answers 409. The word is
  // stored all the same, and the launcher reads it as the run's last message to its starter.
  expect(sent.status, JSON.stringify(sent.body)).toBe(409)
  return sent.body.record.id
}

/** The run's doing line, written with the worker's own key as a round writes its own. A seal sent by its key wants one. */
async function itsDoingLine(run: string): Promise<void> {
  const said = await ask('PATCH', `/api/records/${run}`, AS_THE_WORKER(run), { dataPatch: { doing: 'A made-up round that waits for its go file and ends.' } })
  expect(said.status, JSON.stringify(said.body)).toBe(200)
}

async function ask(method: string, path: string, actor: { type: string; id: string; session?: string; key?: string }, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.session === undefined ? {} : { 'x-mole-office-session': actor.session }),
      ...(actor.key === undefined ? {} : { 'x-mole-office-key': actor.key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/** The starter, as the agent it is, for the test's own reads and releases. */
const AS_STARTER = (): { type: string; id: string; session: string } => ({ type: 'agent', id: STARTER, session: starterSession })
/**
 * The worker, writing on a run of its own as that run does, with the worker's own key: a run's facts are changed only on
 * a key, and a name alone does not answer for a run.
 */
const AS_THE_WORKER = (run: string): { type: string; id: string; session: string; key: string } => ({ type: 'agent', id: WORKER, session: run, key: theKeyOf.get(WORKER)! })
/**
 * WHAT THE END OF A ROUND ADDS TO A RUN THE LAUNCHER LEAVES AS IT IS (wave 13j round loop-1): the launcher's reason, how
 * its command ended, and the office's account of why there is no seal. Nothing else on the run changes.
 */
const THE_END_WRITTEN = { detail: expect.any(String), commandEnded: expect.any(Object), howTheRoundEnded: expect.any(Object) }
/**
 * THE COMMIT THE OFFICE READS IN A RUN'S WORKING DIRECTORY WHEN ITS ROUND ENDS, as the run stores it: the directory, the
 * commit or why git could not read it, and when.
 */
const theEndHeadOf = (directory: string, read: { commit: string } | { notRead: unknown }) => ({ endHead: { ...read, directory, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) } })

async function ledger(): Promise<any[]> {
  const r = await ask('GET', '/api/resources?includeReleased=true', AS_STARTER())
  return r.body.resources
}

/** B18 compares the full ledger projection except age, which is calculated anew on every read. */
async function ledgerState(): Promise<any[]> {
  return (await ledger()).map(({ age: _age, ...row }) => row)
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * WHETHER ANY PROCESS OF THE GROUP `pgid` IS STILL THERE, asked of the group itself with signal 0. This file looks only at
 * the processes it started, never through a list of every process on this machine.
 */
function theGroupLives(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

/** `pid` and the processes it started, read from its own /proc/<pid>/task/<tid>/children. */
function itAndItsChildren(pid: number): number[] {
  const children = readdirSync(`/proc/${pid}/task`).flatMap((thread) => readFileSync(`/proc/${pid}/task/${thread}/children`, 'utf8').split(' '))
  return [pid, ...children.filter((child) => child.trim() !== '').map(Number)]
}

/**
 * Waits for check to pass, or throws after ms with what was waited for and, when given, what said answers. It looks every
 * 50 ms: every check here only reads, and a wait ends on average 25 ms after what it waits for, not 100.
 */
async function until(what: string, check: () => boolean | Promise<boolean>, ms = 20_000, said?: () => string): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`waited ${ms} ms for ${what}${said === undefined ? '' : `. ${said()}`}`)
}

/** A round account is complete when its Git reading has finished. */
function theRoundAccountIsComplete(account: { reasons?: { why?: string }[] } | undefined): boolean {
  return account !== undefined && !account.reasons?.some((reason) => reason.why === 'git-being-read')
}

/** The old run's finish.log for a failure message: its lines, or that there is no file there. Never throws when it is missing. */
function whatTheLogSays(log: string): string {
  if (!existsSync(log)) return `There is no finish.log at ${log}.`
  return `The old run's finish.log (${log}) says:\n${readFileSync(log, 'utf8')}`
}

/** Whether `log` is there and holds `words`. The file can be there before the line a case reads: a sweep writes into it too. */
function theLogHolds(log: string, words: string): boolean {
  return existsSync(log) && readFileSync(log, 'utf8').includes(words)
}

/** Release a process row as its starter: force, because its run is running, and the sentence sent back. */
async function releaseRow(id: string): Promise<{ status: number; body: any }> {
  const who = AS_STARTER()
  const first = await ask('POST', `/api/resources/${id}/release`, who, { force: true })
  if (first.status !== 400) return first
  const phrase = /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(first.body.error))?.[1]
  return ask('POST', `/api/resources/${id}/release`, who, { force: true, expect: phrase })
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/**
 * The gate-count spool the launcher this file starts writes, under this file's own home, which it inherits, with the
 * folder that holds it made. It is never a real spool.
 */
function theTestsOwnSpool(): string {
  for (const real of theRealSpools()) expect(THE_GATE_COUNT_SPOOL_FOLDER, real).not.toBe(real)
  mkdirSync(dirname(THE_GATE_COUNT_SPOOL_FOLDER), { recursive: true })
  return THE_GATE_COUNT_SPOOL_FOLDER
}

/** A copy of the template with one more mount, a read-only bind of the folder that holds the spool. */
function aTemplateThatReadsTheSpool(): string {
  const reads = join(scratch, 'template-reading-the-spool')
  if (existsSync(reads)) return reads
  mkdirSync(reads)
  const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
  config.mounts.push(`type=bind,source=${dirname(theTestsOwnSpool())},target=/a-made-up-sandboxes-folder,readonly`)
  writeFileSync(join(reads, 'devcontainer.json'), JSON.stringify(config, null, 2))
  writeFileSync(join(reads, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
  return reads
}

/** Whether `path` is `folder` or inside it, both by their real paths. */
function inside(folder: string, path: string): boolean {
  const way = relative(realpathSync(folder), realpathSync(path))
  return way === '' || (!way.startsWith('..') && !isAbsolute(way))
}

// ---------------------------------------------------------------------------- the world

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-sandbox-launcher-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  // Refusal mutations can reach the native command; this stand-in never reads a login or starts a model.
  writeFileSync(join(fakes, 'bin', 'codex'), '#!/bin/sh\nprintf synthetic-codex-stand-in\n', { mode: 0o755 })
  // A GUARD, NOT A FAKE: run-agent.sh falls back to the owner's own dsh folder when it is not told
  // another, so it is let run only with a dsh folder inside this test's scratch. And a dsh that runs
  // no model: it writes down what it was given, in the sandbox's out/.
  writeFileSync(
    join(fakes, 'bin', 'bash'),
    `#!/bin/sh\ncase "$1" in */run-agent.sh) case "$MOLE_OFFICE_DSH_DIR" in ${scratch}/*) ;; *) echo "test guard: run-agent.sh without this test's dsh folder" >&2; exit 97 ;; esac ;; esac\nexec /bin/bash "$@"\n`,
    { mode: 0o755 },
  )
  writeFileSync(
    join(fakes, 'bin', 'dsh'),
    `#!/usr/bin/env node\nrequire('fs').writeFileSync(process.env.SANDBOX_DIR + '/out/fake-dsh.json', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }))\n`,
    { mode: 0o755 },
  )
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: a repository whose tools/ and src/ are this checkout's own,
  // so the clone inside the instance runs the helper under test, and the two paths the template
  // mounts over (data/ and node_modules/.vite-temp) exist as they do on the host. There is NO KEY
  // FILE in data/: nothing of data/ goes into a sandbox, so `up` must not need one (finding 13).
  // A committed package-lock.json, from which a sandbox installs its own node_modules (item 2f).
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the sandbox launcher test\n')
  for (const [file, text] of Object.entries(aMadeUpPackage())) writeFileSync(join(main, file), text)
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's devcontainer.json and sandbox.json, with the secrets file here.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  // ANOTHER REPOSITORY THE TEMPLATE DECLARES, as the ai-news studio declares news-tools: on a branch of another name
  // (trunk, not main), so a worktree cut from it can be told from one cut from the office's own clone.
  side = join(scratch, 'side')
  mkdirSync(side)
  git(side, 'init', '-q', '-b', 'trunk')
  git(side, 'config', 'user.email', 'a-test@example.invalid')
  git(side, 'config', 'user.name', 'A test')
  git(side, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(side, 'SIDE.md'), 'another repository\n')
  git(side, 'add', '-A')
  git(side, 'commit', '-q', '-m', 'the side repository')
  office.clones = [{ name: 'side-repo', from: side }]
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles'), { recursive: true })
  writeFileSync(join(dsh, 'env'), 'DEEPSEEK_API_KEY=not-a-real-key\n', { mode: 0o600 })
  mkdirSync(join(dsh, 'home', 'profiles', 'office'))
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)
  // THE HOST'S OWN RUNS, none of which a sandbox is given (problem epOLxauSbzd9): each part the host's dsh home held
  // besides its profiles on 28 September 2026, with a made-up file in it. The logs of its sessions, what they were
  // given, dsh's cache of each session, the index of the images uploaded for them, and the host dsh's own id.
  for (const [part, words] of [
    ['sessions/--a-host-project--/session-of-the-host/session.v3.jsonl.zstd', 'a host session log\n'],
    ['attachments/v1/an-attachment-of-the-host', 'a host attachment\n'],
    ['storages/session_projcache/sessions/session-of-the-host.json', '{"a":"host session"}\n'],
    ['llm-deepseek/files-v3.json', '{"formatVersion":3,"records":[]}\n'],
    ['.anonymous-user-id', 'the-host-dsh-id\n'],
  ] as const) {
    mkdirSync(dirname(join(dsh, 'home', part)), { recursive: true })
    writeFileSync(join(dsh, 'home', part), words)
  }
  originals = join(scratch, 'originals')
  mkdirSync(originals)

  // THE PEOPLE: the office's secretary, who starts sandboxes; a worker it registers; and a stranger, a supervisor that is
  // not the secretary. Each keeps the key it was answered, and its own run is filed with that key and serves it. A run the
  // host files names its sandbox only when the secretary files it (a host filing), so the starter here is the secretary,
  // as on the live office; the block "a supervisor that is not the secretary" puts back the starter that is not.
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  for (const [handle, role, by, area] of [
    [STARTER, 'secretary', person, undefined],
    [STRANGER, 'supervisor', person, undefined],
    [WORKER, 'worker', { type: 'agent', id: STARTER }, ['src']],
  ] as const) {
    const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, role, ...(area ? { workArea: area } : {}) })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    if (handle === STARTER) starterId = made.body.agent.id
    expect(made.body.whatToGiveIt.key, `${handle} was answered no key`).toEqual(expect.any(String))
    theKeyOf.set(handle, made.body.whatToGiveIt.key)
  }
  const aRunOf = async (handle: string, title: string): Promise<string> => {
    const filed = await ask('POST', '/api/records', { type: 'agent', id: handle, key: theKeyOf.get(handle)! }, { kind: 'session', title, data: { state: 'running', servingAgent: handle } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    return String(filed.body.record.id)
  }
  starterSession = await aRunOf(STARTER, 'the supervisor run')
  strangerSession = await aRunOf(STRANGER, 'another run')
}, 120_000)

afterAll(async () => {
  // ONLY THE GROUPS THIS FILE STARTED: each case adds the group its start answered, and the helper's start.json names the
  // rest. No list of every process on this machine is read for more.
  for (const start of startsOf(join(sandboxes, NAME))) groups.add(start.hostPgid)
  for (const group of groups) {
    // Only a group whose leader still works in this test's scratch; a number read earlier may
    // belong to somebody else's program by now, and that is never signalled.
    try {
      if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
      process.stderr.write(`stopping test group ${group}\n`)
      process.kill(-group, 'SIGKILL')
    } catch {
      // gone
    }
  }
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- the tests

describe('up', () => {
  it('refuses a writable extra folder, the home directory and the live data folder, and writes nothing', async () => {
    const before = (await ledger()).length
    const common = ['up', template, '--name', 'refused', '--from', main, '--dsh', dsh]
    const rw = await sandbox([...common, '--rw', originals])
    expect(rw.status, rw.err).toBe(2)
    expect(rw.err).toContain('read-only, never read-write')
    const home = await sandbox([...common, '--ro', homedir()])
    expect(home.status, home.err).toBe(2)
    expect(home.err).toContain('whole home directory')
    const data = await sandbox([...common, '--ro', join(main, 'data')])
    expect(data.status, data.err).toBe(2)
    expect(data.err).toContain('overlaps')
    const relativePath = await sandbox([...common, '--ro', 'originals'])
    expect(relativePath.status, relativePath.err).toBe(2)
    const nobody = await sandbox(common, null)
    expect(nobody.status, nobody.err).toBe(2)
    expect(nobody.err).toContain("never writes in the person's name")
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer')).toEqual([])
    expect(existsSync(join(sandboxes, 'refused'))).toBe(false)
  })

  it('refuses a --from or --ro that is the stable checkout, is inside it or holds it, through a link too, and writes nothing', async () => {
    // A HOME OF THE TEST'S OWN, so the stable checkout the launcher protects is a synthetic folder in the scratch.
    const home = join(scratch, 'synthetic-home')
    const stable = theStableCheckoutFolder(home)
    const beside = join(dirname(stable), 'beside-the-stable-checkout')
    for (const folder of [join(stable, 'data'), beside]) mkdirSync(folder, { recursive: true })
    writeFileSync(join(stable, 'data', 'keys.json'), '{"synthetic":"not a key"}\n')
    const aLink = join(scratch, 'a-link-to-the-stable-checkout')
    symlinkSync(stable, aLink)
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length
    const asked: [string, string[], string][] = [
      ['--from is', ['--from', stable], 'is the stable checkout'],
      ['--from inside', ['--from', join(stable, 'data')], 'is inside the stable checkout'],
      ['--from holding', ['--from', dirname(stable)], 'holds the stable checkout'],
      ['--from through a link', ['--from', aLink], 'is the stable checkout'],
      ['--ro is', ['--from', main, '--ro', stable], 'is the stable checkout'],
      ['--ro inside', ['--from', main, '--ro', join(stable, 'data')], 'is inside the stable checkout'],
      ['--ro holding', ['--from', main, '--ro', dirname(stable)], 'holds the stable checkout'],
    ]
    for (const [what, words, said] of asked) {
      const ran = await sandbox(['up', template, '--name', 'stable-refused', '--dsh', dsh, ...words], undefined, { HOME: home })
      expect(ran.status, `${what}: ${ran.err}`).toBe(2)
      expect(ran.err, what).toContain(said)
      expect(ran.err, what).toContain(stable)
    }
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'stable-refused'))).toBe(false)
    // A folder beside the stable checkout is not refused for that, so the refusal is not of everything under the home.
    // The --ro after it is refused for being relative, so nothing is brought up.
    const besideIt = await sandbox(['up', template, '--name', 'stable-refused', '--from', main, '--dsh', dsh, '--ro', beside, '--ro', 'originals'], undefined, { HOME: home })
    expect(besideIt.status, besideIt.err).toBe(2)
    expect(besideIt.err).toContain('"originals" is not one')
    expect(besideIt.err).not.toContain('the stable checkout')
  })

  it("refuses a --ro that is the office's data folder, is inside it or holds it, from the stable checkout's .env and from the launcher's own settings", async () => {
    // THE DATA FOLDER AFTER 13Q'S MOVE (round 12; the owner's place): the database, the files beside it and the
    // office's key file in a folder outside every checkout, which no tmpfs covers. The
    // switch procedure's item 3 (fPbGHEXq5OfR point 3): the launcher refuses it. A home of the test's own, whose
    // stable checkout's .env names that folder by an absolute path, as the move writes it.
    const home = join(scratch, 'synthetic-home-data-folder')
    const data = join(home, '.local', 'share', 'mole-office')
    const beside = join(dirname(data), 'beside-the-data-folder')
    for (const folder of [join(data, 'report-files'), beside]) mkdirSync(folder, { recursive: true })
    writeFileSync(join(data, 'keys.json'), '{"synthetic":"not a key"}\n')
    writeFileSync(join(data, 'panelx.db'), '')
    const stable = theStableCheckoutFolder(home)
    mkdirSync(stable, { recursive: true })
    writeFileSync(join(stable, '.env'), `MOLE_OFFICE_DB=${join(data, 'panelx.db')}\n`)
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length
    const asked: [string, string[], string][] = [
      ['--ro is', ['--ro', data], `${data} is the office's data folder`],
      ['--ro inside', ['--ro', join(data, 'report-files')], "is inside the office's data folder"],
      ['--ro holding', ['--ro', dirname(data)], "holds the office's data folder"],
    ]
    for (const [what, words, said] of asked) {
      const ran = await sandbox(['up', template, '--name', 'data-refused', '--from', main, '--dsh', dsh, ...words], undefined, { HOME: home })
      expect(ran.status, `${what}: ${ran.err}`).toBe(2)
      expect(ran.err, what).toContain(said)
      expect(ran.err, what).toContain(`the office's data folder, ${data},`)
    }
    // THE LAUNCHER'S OWN SETTINGS NAME IT TOO: no stable checkout, and MOLE_OFFICE_DB in the launcher's environment.
    const ownHome = join(scratch, 'synthetic-home-data-folder-from-the-environment')
    mkdirSync(ownHome, { recursive: true })
    const fromItsSettings = await sandbox(['up', template, '--name', 'data-refused', '--from', main, '--dsh', dsh, '--ro', data], undefined,
      { HOME: ownHome, MOLE_OFFICE_DB: join(data, 'panelx.db') })
    expect(fromItsSettings.status, fromItsSettings.err).toBe(2)
    expect(fromItsSettings.err).toContain(`${data} is the office's data folder`)
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'data-refused'))).toBe(false)
    // A folder beside the data folder is not refused for that, so the refusal is not of everything under the home.
    // The --ro after it is refused for being relative, so nothing is brought up.
    const besideIt = await sandbox(['up', template, '--name', 'data-refused', '--from', main, '--dsh', dsh, '--ro', beside, '--ro', 'originals'], undefined, { HOME: home })
    expect(besideIt.status, besideIt.err).toBe(2)
    expect(besideIt.err).toContain('"originals" is not one')
    expect(besideIt.err).not.toContain("the office's data folder")
  })

  it('refuses an up without --from when the launcher itself is in the stable checkout, and takes one that names the checkout', async () => {
    // A HOME OF THE TEST'S OWN, whose stable checkout is a link to the checkout this launcher is in. The launcher is then in
    // the stable checkout as far as it can tell, and in a worktree its main checkout is another folder, as the bootstrap
    // leaves the stable office: only this refusal stops it.
    const home = join(scratch, 'synthetic-home-launcher-in-stable')
    const stable = theStableCheckoutFolder(home)
    mkdirSync(dirname(stable), { recursive: true })
    symlinkSync(REPO, stable)
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length
    const bare = await sandbox(['up', template, '--name', 'stable-launcher', '--dsh', dsh], undefined, { HOME: home })
    expect(bare.status, bare.err).toBe(2)
    expect(bare.err).toContain('This launcher is in the stable checkout, and --from names no checkout')
    expect(bare.err).toContain(stable)
    // Named, the launch goes past this refusal. The --ro after it is refused for being relative, so nothing is brought up.
    const named = await sandbox(['up', template, '--name', 'stable-launcher', '--from', main, '--dsh', dsh, '--ro', 'originals'], undefined, { HOME: home })
    expect(named.status, named.err).toBe(2)
    expect(named.err).toContain('"originals" is not one')
    expect(named.err).not.toContain('the stable checkout')
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'stable-launcher'))).toBe(false)
  })

  it('refuses a template that mounts something back inside a folder it covers, as the key file was, and writes nothing', async () => {
    // THE TEMPLATE AS IT WAS UNTIL ACCEPTANCE FINDING 13: the office's key file, which holds the
    // person's key, bound back into the data folder the template covers with a tmpfs.
    const keyed = join(scratch, 'template-as-it-was')
    mkdirSync(keyed)
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
    config.mounts.push(
      'type=bind,source=${localEnv:SANDBOX_MAIN_CHECKOUT}/data/keys.json,target=${localEnv:SANDBOX_MAIN_CHECKOUT}/data/keys.json,readonly',
    )
    writeFileSync(join(keyed, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(keyed, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length

    const up = await sandbox(['up', keyed, '--name', 'keyed', '--from', main, '--dsh', dsh])
    expect(up.status, up.err).toBe(1)
    expect(up.err).toContain(`${join(main, 'data', 'keys.json')} is mounted (bind) inside ${join(main, 'data')}`)
    expect(theRefusalExplanation(up)).toContain('Nothing was done.')
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'keyed'))).toBe(false)
  })

  // THE GATE-COUNT SPOOL IS NEVER WRITABLE IN A SANDBOX (wave 13n round Y, item 2l, as agreed). The office counts
  // each line there as a gate a sandbox tool met on the host, so a container that could write there could make counts
  // up. A bind that is not read-only is refused when its source is the spool, is inside it or holds it, before anything
  // is written, and the refusal names each such mount and the fix.
  it('refuses a template that mounts the gate-count spool writable, a file in it or a folder that holds it, and writes nothing', async () => {
    const spool = theTestsOwnSpool()
    const writes = join(scratch, 'template-writing-the-spool')
    mkdirSync(writes)
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
    const dayFile = join(spool, '2026-10-26.jsonl')
    config.mounts.push(
      `type=bind,source=${spool},target=/a-made-up-spool`,
      `type=bind,source=${dayFile},target=/a-made-up-day-file`,
      `type=bind,source=${dirname(spool)},target=/a-made-up-sandboxes-folder`,
    )
    writeFileSync(join(writes, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(writes, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length

    const up = await sandbox(['up', writes, '--name', 'writes-the-spool', '--from', main, '--dsh', dsh])
    expect(up.status, up.err).toBe(1)
    const said = theRefusalExplanation(up)
    for (const [source, how, target] of [[spool, 'is', '/a-made-up-spool'], [dayFile, 'is inside', '/a-made-up-day-file'], [dirname(spool), 'holds', '/a-made-up-sandboxes-folder']]) {
      expect(said, source).toContain(`the bind of ${source} at ${target}, which ${how} the gate-count spool ${spool}, is not read-only`)
    }
    expect(said).toContain(`Make each such mount read-only, or take it out of ${join(writes, 'devcontainer.json')}. Nothing was done.`)
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'writes-the-spool'))).toBe(false)
  })

  it('registers the container before it starts it, read-only where asked, and makes the instance folder', async () => {
    const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--dsh', dsh, '--ro', originals, '--label', 'mole-office.sv1=launcher', '--json'])
    expect(up.status, up.err).toBe(0)
    upAnswer = JSON.parse(up.out.trim())
    const answer = upAnswer as { container: string; resource: string; folder: string }
    writeRoundStartRules(answer.folder, join(answer.folder, 'repo'))
    expect(answer.container).toMatch(/^[0-9a-f]{64}$/)
    expect(answer.folder).toBe(join(sandboxes, NAME))

    // REGISTERED FIRST: the devcontainer CLI, when it was started, could already read the row.
    const started = state().calls.filter((c) => c.tool === 'devcontainer')
    expect(started).toHaveLength(1)
    expect(started[0]?.rowSeen, 'the container row was not in the ledger when the container was started').toBe(true)
    const row = (await ledger()).find((r) => r.id === answer.resource)
    expect(row).toMatchObject({ type: 'container', key: CONTAINER, sessionRecordId: starterSession, releasedAt: null })
    // THE FOLDER IN THE WORDS A FILES SEAL READS BACK: the row the real writer registered, read by the real
    // reader (problem 1aDRTmegLfhy). MUTATION PROOF, 23 September 2026: the writer typing words of its own,
    // and this goes red, where before it would have made every sandbox's folder count as none. How the folder
    // is resolved is not reached here: this test's folder is no link, so resolving it changes nothing.
    const { theSandboxFolderOf } = await import('../src/server/lib/sealed-tip.ts')
    expect(theSandboxFolderOf({ sandbox: { folder: realpathSync(answer.folder), container: answer.resource } })).toBe(realpathSync(answer.folder))

    // STARTED AS THE TEMPLATE SAYS, with the instance's own inputs and the extra folder read-only.
    expect(started[0]?.env).toEqual({ SANDBOX_DIR: answer.folder, SANDBOX_MAIN_CHECKOUT: main })
    expect(started[0]?.argv).toEqual(expect.arrayContaining(['--id-label', `mole-office.sandbox=${NAME}`]))
    expect(started[0]?.runArgs).toContain(`--name=${CONTAINER}`)
    // WITHOUT --network THE TEMPLATE'S OWN STANDS: the real template's host network (acceptance finding 77), and the
    // host's own /etc/hosts with it.
    expect(started[0]?.runArgs).toContain('--network=host')
    expect(started[0]?.mounts?.some((m) => m.includes('target=/etc/hosts'))).toBe(false)
    // ITS OWN HOST NAME ON THE HOST'S NETWORK TOO, where docker would give it the host's, and that name resolving to this
    // machine without asking DNS. A test office in a sandbox stamps its messages with the name it is given. Mutation
    // HOST_NETWORK_NAME: neither argument passed on the host's network, and this goes red. The test reads the container's
    // name and never the host's, so a red run prints no machine name.
    expect(started[0]?.runArgs).toEqual(expect.arrayContaining([`--hostname=${CONTAINER}`, `--add-host=${CONTAINER}:127.0.1.1`]))
    expect(state().containers[CONTAINER]?.Config?.Hostname === CONTAINER, 'the container does not carry its own host name').toBe(true)
    // IN THE HOST'S TIME ZONE, the launcher's own, set on the container (acceptance finding 62): the image's clock is UTC.
    // MUTATION PROOF, 24 September 2026, alone in tools/sandbox.mjs: the zone not passed, and this goes red.
    expect(started[0]?.runArgs).toContain(`--env=TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
    // HELD TO THE SANDBOX DEFAULTS, the owner's (problem TotXlPFHFduz: on 3 October 2026 a runaway in one sandbox took
    // 75 GB and froze the machine). Mutation UP_LIMITS: the five arguments not passed, and this
    // goes red; so does each default changed alone (MEMORY_DEFAULT, SWAP_DEFAULT, CPUS_DEFAULT,
    // PRIORITY_DEFAULT, PIDS_DEFAULT).
    expect(started[0]?.runArgs).toEqual(expect.arrayContaining(['--memory=16g', '--memory-swap=16g', '--cpus=8', '--cpu-shares=256', '--pids-limit=2000']))
    // ROOM FOR PICTURES (problem TKH0KMph-bMR): the real template names no /dev/shm size, so it gets 1 GB, once.
    // Mutation UP_SHM: theRoomForPictures not called by up, and this goes red.
    expect(started[0]?.runArgs?.filter((a) => a.startsWith('--shm-size'))).toEqual(['--shm-size=1g'])
    expect(started[0]?.mounts).toContain(`type=bind,source=${originals},target=${originals},readonly`)
    expect(started[0]?.config?.startsWith(answer.folder), 'the instance copy of devcontainer.json is inside the sandbox').toBe(false)

    // THE FOLDER: a clone of the mirror of main with node_modules of its own, home, and dsh's home without its env or sessions.
    // NOTHING IN THE CLONE POINTS INTO THE CHECKOUT (item 2f). It borrows no objects from it. Its origin is a bare mirror of
    // the checkout's main, outside every instance folder, which the container is given read-only. Its node_modules was
    // installed in the container, from the clone's own package-lock.json, into the instance folder.
    const dir = answer.folder
    const repo = join(dir, 'repo')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(existsSync(join(repo, '.git', 'objects', 'info', 'alternates')), "the clone borrows the checkout's objects").toBe(false)
    const mirror = git(repo, 'config', '--get', 'remote.origin.url')
    expect(inside(main, mirror), `origin ${mirror} is in the checkout`).toBe(false)
    expect(inside(sandboxes, mirror), `origin ${mirror} is not in the sandboxes folder`).toBe(true)
    expect(inside(dir, mirror), `origin ${mirror} is in the instance folder, which the sandbox can write`).toBe(false)
    expect(git(mirror, 'rev-parse', '--is-bare-repository')).toBe('true')
    expect(git(mirror, 'rev-parse', 'refs/heads/main')).toBe(git(main, 'rev-parse', 'refs/heads/main'))
    expect(started[0]?.mounts).toContain(`type=bind,source=${mirror},target=${mirror},readonly`)
    expect(lstatSync(join(repo, 'node_modules')).isSymbolicLink()).toBe(true)
    const packages = realpathSync(join(repo, 'node_modules'))
    expect(inside(dir, packages), `node_modules is ${packages}, outside the instance folder`).toBe(true)
    expect(existsSync(join(packages, 'a-made-up-package'))).toBe(true)
    const installs = theNpmCalls(fakes).filter((call) => inside(dir, call.cwd))
    expect(installs.map((call) => call.argv[0])).toEqual(['ci'])
    expect(installs[0]?.lockfile).toBe(readFileSync(join(repo, 'package-lock.json'), 'utf8'))
    expect(installs[0]?.home, "npm ran with the host's environment, not the container's").toBe(join(dir, 'home'))
    expect(statSync(join(dir, 'home')).isDirectory()).toBe(true)
    // NO AI ATTRIBUTION IN A COMMIT MADE IN HERE: Claude Code in the sandbox reads its settings from this home.
    expect(JSON.parse(readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8'))).toMatchObject({
      attribution: { commit: '', pr: '', sessionUrl: false },
      includeCoAuthoredBy: false,
    })
    // AND ANY CLAUDE STARTED IN HERE KEEPS ITS BACKGROUND WORKERS, from the instance's own settings (Wmh9FIxtcUTw),
    // AND COMPACTS ITS CONVERSATION AT 200,000 TOKENS, hzskk7OFphee.
    // Mutation BG_SETTINGS: up writes no env block, and this goes red; COMPACT_SETTINGS: up leaves the window out.
    expect(JSON.parse(readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8')).env).toEqual({
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000',
    })
    // THE OFFICE'S RUN HOOKS, FROM THE INSTANCE'S OWN CLONE, once each (problems w3nrNqmxWStv and UbG6k-7jGLa5): a Claude
    // Code run in here is told how many messages wait after each step, and its stop is held while its run is unfinished.
    // MUTATION PROOF (the report of the run that added it): theOfficesRunHooks not called at up, and this goes red.
    const hooks = (JSON.parse(readFileSync(join(dir, 'home', '.claude', 'settings.json'), 'utf8')) as { hooks?: Record<string, { hooks: { command: string }[] }[]> }).hooks ?? {}
    const commandsOf = (event: string): string[] => (hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command))
    expect(commandsOf('PostToolUse')).toEqual([`node "${join(dir, 'repo', 'tools', 'dsh-hooks', 'claude-code-step.mjs')}"`])
    expect(commandsOf('Stop')).toEqual([`node "${join(dir, 'repo', 'tools', 'dsh-hooks', 'claude-code-stop.mjs')}"`, `node "${join(dir, 'repo', 'tools', 'session-hook.mjs')}" stop`])
    // NO COPY OF dsh's env FILE, which holds the DeepSeek key, and of dsh's home the profiles alone, none of the host's
    // own runs (problem epOLxauSbzd9): a dsh run gets the key from the launcher, which passes it to that runtime alone.
    expect(existsSync(join(dir, 'dsh', 'env')), 'the instance holds a copy of dsh\'s env file').toBe(false)
    expect(readdirSync(join(dir, 'dsh', 'home')).sort(), 'the instance holds more of the host\'s dsh home than its profiles').toEqual(['profiles'])
    const profile = join(dir, 'dsh', 'home', 'profiles', 'office')
    const patch = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain(`configPath: "${join(dir, 'repo', 'tools/dsh-hooks/hooks.json')}"`)
    expect(patch).toContain(`pluginRoot: "${join(dir, 'repo')}"`)
    expect(readFileSync(join(profile, 'office-tool.mjs'), 'utf8')).toContain(join(dir, 'repo', 'tools/dsh-hooks/office-tool.mjs'))
    expect(statSync(join(dir, 'dsh', 'npm', 'node_modules', '.bin', 'dsh')).mode & 0o111).not.toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'instance.json'), 'utf8'))).toMatchObject({
      instance: NAME,
      template: 'mole-office-dev',
      containerRow: answer.resource,
      container: { name: CONTAINER, id: answer.container },
      readOnly: [originals],
      ref: 'main',
    })
    // THE TEMPLATE'S OTHER CLONE, beside repo/: a full clone, borrowing no objects from its source (only the office's own
    // checkout is mounted), on its source's own branch, and written on the instance with that branch. MUTATION PROOF (the
    // report of the run that added it): theTemplatesClones not called at up, and this goes red.
    expect(git(join(dir, 'side-repo'), 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('trunk')
    expect(git(join(dir, 'side-repo'), 'rev-parse', 'HEAD')).toBe(git(side, 'rev-parse', 'trunk'))
    expect(existsSync(join(dir, 'side-repo', '.git', 'objects', 'info', 'alternates')), 'the clone borrows its source\'s objects').toBe(false)
    expect(JSON.parse(readFileSync(join(dir, 'instance.json'), 'utf8')).clones).toEqual([{ name: 'side-repo', from: side, ref: 'trunk' }])
  })

  // bQVD4FzEZj4N. Mutation OPENCODE_NOT_WRITTEN: skip the OpenCode config write; this goes red.
  it('a prepared sandbox home lets OpenCode use external directories, and its launch says so once', async () => {
    const args = ['up', template, '--name', 'opencode-prepared', '--from', main, '--no-dsh']
    for (let attempt = 0; attempt < 2; attempt++) {
      const ran = await sandbox(args)
      expect(ran.status, ran.err).toBe(0)
      const file = join(sandboxes, 'opencode-prepared', 'home', '.config', 'opencode', 'opencode.json')
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ permission: { external_directory: 'allow' }, mcp: { mole_office: { type: 'local', command: ['node', join(sandboxes, 'opencode-prepared', 'repo/tools/office-mcp.mjs')], enabled: true, timeout: THE_OFFICE_TOOLS_FINISH_WAIT + THE_OPENCODE_OFFICE_WAIT_MARGIN_MS } } })
      expect(ran.err.match(/OpenCode in this sandbox is set not to wait for external-directory permission/g)).toHaveLength(1)
      expect((await sandbox(['down', 'opencode-prepared'])).status).toBe(0)
      rmSync(file)
    }
  })

  // Mutation OPENCODE_OVERWRITE: replace the existing file instead of merging it; this goes red.
  it('OpenCode home preparation keeps existing config and permission keys, including on the next start', async () => {
    const file = join(sandboxes, 'opencode-merge', 'home', '.config', 'opencode', 'opencode.json')
    mkdirSync(dirname(file), { recursive: true })
    const held = { theme: 'synthetic-theme', model: 'synthetic/model', permission: { bash: 'deny', edit: 'ask', external_directory: 'ask' } }
    writeFileSync(file, JSON.stringify(held))
    for (let attempt = 0; attempt < 2; attempt++) {
      const ran = await sandbox(['up', template, '--name', 'opencode-merge', '--from', main, '--no-dsh'])
      expect(ran.status, ran.err).toBe(0)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ...held, permission: { ...held.permission, external_directory: 'allow' }, mcp: { mole_office: { type: 'local', command: ['node', join(sandboxes, 'opencode-merge', 'repo/tools/office-mcp.mjs')], enabled: true, timeout: THE_OFFICE_TOOLS_FINISH_WAIT + THE_OPENCODE_OFFICE_WAIT_MARGIN_MS } } })
      expect((await sandbox(['down', 'opencode-merge'])).status).toBe(0)
    }
  })

  // An office server written with no `timeout` has each OpenCode tool call ended at the MCP SDK's 60 s, so a run's
  // finish, which the office tool waits for longer, was cut before the office's answer came.
  it('a prepared OpenCode home waits for an office call as long as the office tool waits for a finish, and a home without the tool has no office server', () => {
    const home = join(mkdtempSync(join(scratch, 'opencode-wait-')), 'home')
    const file = join(home, '.config', 'opencode', 'opencode.json')
    expect(prepareOpenCodeHome(home)).toBe(file)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(THE_OPENCODE_OFFICE_WAIT_MARGIN_MS).toBeGreaterThan(0)
    expect(written.mcp.mole_office.timeout).toBe(THE_OFFICE_TOOLS_FINISH_WAIT + THE_OPENCODE_OFFICE_WAIT_MARGIN_MS)
    const other = { type: 'local', command: ['node', 'synthetic-server.mjs'], enabled: true }
    writeFileSync(file, JSON.stringify({ ...written, mcp: { ...written.mcp, synthetic: other } }))
    expect(prepareOpenCodeHome(home, false)).toBe(file)
    expect(JSON.parse(readFileSync(file, 'utf8')).mcp).toEqual({ synthetic: other })
  })

  it('gives the clone a local main tracking origin/main, even when --ref names a different branch', async () => {
    // A second branch on the fake checkout, off main, never checked out there — so every other
    // test's assumption that HEAD in `main` resolves to `main` itself is left exactly as it was.
    git(main, 'branch', 'feature', 'main')
    const mainTip = git(main, 'rev-parse', 'main')

    const up = await sandbox(['up', template, '--name', 'feature-ref', '--from', main, '--dsh', dsh, '--ref', 'feature'])
    expect(up.status, up.err).toBe(0)
    const repo = join(sandboxes, 'feature-ref', 'repo')

    // THE CLONE IS ON THE BRANCH ASKED FOR...
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature')
    // ...AND CAN STILL NAME `main` BY THAT BARE WORD, at the commit the checkout's own main is at.
    // Plain `git clone --branch feature` on its own leaves no local `main` at all — only the fix
    // under test adds one, tracking `origin/main`.
    expect(git(repo, 'rev-parse', '--verify', 'main')).toBe(mainTip)
  })

  it('stops through the ledger, and removes, a container docker made writable where read-only was asked', async () => {
    setBug('writableRo', true)
    try {
      const up = await sandbox(['up', template, '--name', 'leaky', '--from', main, '--dsh', dsh, '--ro', originals])
      expect(up.status, up.err).toBe(1)
      expect(up.err).toContain(`${originals} is mounted writable`)
      // The fix for a mount that can write the gate-count spool is said only when such a mount is named (wave 13n round Z).
      expect(theRefusalExplanation(up)).not.toContain('Remake the container without that mount')
      const calls = state().calls
      expect(calls.some((c) => c.tool === 'ledger-stop' && c.argv[0] === 'mole-office-sandbox-leaky')).toBe(true)
      expect(calls.some((c) => c.tool === 'docker' && c.argv[0] === 'rm')).toBe(true)
      expect(state().containers['mole-office-sandbox-leaky']).toBeUndefined()
      const row = (await ledger()).find((r) => r.key === 'mole-office-sandbox-leaky')
      expect(row?.releasedAt).not.toBeNull()
    } finally {
      setBug('writableRo', false)
    }
  })

  // WHAT THE SPOOL'S RULE LETS THROUGH (wave 13n round Y, item 2l): a read-only bind that holds the spool, since a line
  // read is not a line written, and an instance folder and a mirror beside the spool, which hold none of it. Here the
  // sandboxes folder is the one that holds this file's own spool, as the default is on a machine.
  it('brings up a sandbox beside the spool, with a read-only bind that holds it, its own folder writable and its mirror read-only', async () => {
    const spool = theTestsOwnSpool()
    const reads = aTemplateThatReadsTheSpool()
    const was = sandboxes
    sandboxes = dirname(spool)
    try {
      const up = await sandbox(['up', reads, '--name', 'beside-the-spool', '--from', main, '--dsh', dsh])
      expect(up.status, up.err).toBe(0)
      const dir = join(sandboxes, 'beside-the-spool')
      const mirror = git(join(dir, 'repo'), 'config', '--get', 'remote.origin.url')
      expect(inside(sandboxes, mirror), mirror).toBe(true)
      const mounts = (state().containers['mole-office-sandbox-beside-the-spool'] as unknown as { Mounts: { Type: string; Source: string; Destination: string; RW: boolean }[] }).Mounts
      expect(mounts).toContainEqual({ Type: 'bind', Source: dirname(spool), Destination: '/a-made-up-sandboxes-folder', RW: false })
      expect(mounts).toContainEqual({ Type: 'bind', Source: dir, Destination: dir, RW: true })
      expect(mounts).toContainEqual({ Type: 'bind', Source: mirror, Destination: mirror, RW: false })
      const down = await sandbox(['down', 'beside-the-spool'])
      expect(down.status, down.err).toBe(0)
    } finally {
      sandboxes = was
    }
  })

  // A CONTAINER DOCKER MADE ABLE TO WRITE THE SPOOL is read back like the other mounts, and stopped and removed. The
  // refusal names the mount and the fix, the words given on 26 October 2026 (wave 13n round Z).
  it('stops through the ledger, and removes, a container docker made able to write the folder that holds the spool', async () => {
    const spool = theTestsOwnSpool()
    setBug('writableRo', true)
    try {
      const up = await sandbox(['up', aTemplateThatReadsTheSpool(), '--name', 'spool-made-writable', '--from', main, '--dsh', dsh])
      expect(up.status, up.err).toBe(1)
      const said = theRefusalExplanation(up)
      expect(said).toContain(`the bind of ${dirname(spool)} at /a-made-up-sandboxes-folder, which holds the gate-count spool ${spool}, is not read-only`)
      expect(said).toContain('Remake the container without that mount, or mount it read-only.')
      const calls = state().calls
      expect(calls.some((c) => c.tool === 'ledger-stop' && c.argv[0] === 'mole-office-sandbox-spool-made-writable')).toBe(true)
      expect(state().containers['mole-office-sandbox-spool-made-writable']).toBeUndefined()
      const row = (await ledger()).find((r) => r.key === 'mole-office-sandbox-spool-made-writable')
      expect(row?.releasedAt).not.toBeNull()
    } finally {
      setBug('writableRo', false)
    }
  })

  // THE ZONE IT ASKED FOR IS READ BACK, as the name, the label and the mounts are (acceptance finding 62, the inspector's
  // third note, carried by finding 64's entry): a container docker made without it is stopped and removed.
  // MUTATION PROOF, 24 September 2026, alone in tools/sandbox.mjs: the zone not read back, and this goes red.
  it('stops through the ledger, and removes, a container docker made without the time zone it was asked for', async () => {
    setBug('zoneDropped', true)
    try {
      const up = await sandbox(['up', template, '--name', 'zoneless', '--from', main, '--dsh', dsh])
      expect(up.status, up.err).toBe(1)
      expect(up.err).toContain(`its clock is not set to ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
      const calls = state().calls
      expect(calls.some((c) => c.tool === 'ledger-stop' && c.argv[0] === 'mole-office-sandbox-zoneless')).toBe(true)
      expect(state().containers['mole-office-sandbox-zoneless']).toBeUndefined()
      const row = (await ledger()).find((r) => r.key === 'mole-office-sandbox-zoneless')
      expect(row?.releasedAt).not.toBeNull()
    } finally {
      setBug('zoneDropped', false)
    }
  })

  // A NETWORK OF ITS OWN, WHEN ASKED (acceptance finding 77; message GokDO5Yt4sEZ, 25 September 2026). The template
  // puts the container on the host's network, so a merge sandbox's tests could reach the live office on the host's
  // loopback. `--network none` replaces the template's setting in this instance's copy, and a name docker does not use
  // is refused before anything is written. MUTATION PROOFS, that day, each alone in tools/sandbox.mjs: the option read
  // and not applied, and this goes red on the run arguments; the refusal taken out, and it goes red on the refusal.
  it('gives the container the network asked for in place of the template\'s, and refuses a network it does not know', async () => {
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length
    const odd = await sandbox(['up', template, '--name', 'sideways', '--from', main, '--dsh', dsh, '--network', 'sideways'])
    expect(odd.status, odd.err).toBe(2)
    expect(odd.err).toContain('--network takes none, bridge or host, and "sideways" is none of them. Nothing was done.')
    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'sideways'))).toBe(false)

    const up = await sandbox(['up', template, '--name', 'own-network', '--from', main, '--dsh', dsh, '--network', 'none', '--json'])
    expect(up.status, up.err).toBe(0)
    const runArgs = state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []
    expect(runArgs).toContain('--network=none')
    expect(runArgs.filter((a) => /^--net(work)?=/.test(a))).toEqual(['--network=none'])
    expect(JSON.parse(up.out.trim())).toMatchObject({ network: 'none' })
    expect(state().containers['mole-office-sandbox-own-network']).toMatchObject({ HostConfig: { NetworkMode: 'none' } })
    // LOCALHOST MEANS 127.0.0.1 THERE TOO, as on the host: docker's own file for such a container also maps it to ::1,
    // and four files were red on network none for that alone (measured 25 September 2026). MUTATION PROOF, that day,
    // alone in tools/sandbox.mjs: the hosts file not mounted, and this goes red.
    const hostsMount = (state().calls.filter((c) => c.tool === 'devcontainer').pop()?.mounts ?? []).find((m) => m.includes('target=/etc/hosts'))
    expect(hostsMount).toMatch(/,readonly$/)
    const hostsLines = readFileSync(/source=([^,]+)/.exec(hostsMount!)![1]!, 'utf8').split('\n')
    expect(hostsLines).toContain('127.0.0.1\tlocalhost')
    expect(hostsLines.filter((line) => line.startsWith('::1'))).toEqual(['::1\tip6-localhost ip6-loopback'])
    // AND ITS OWN NAME RESOLVES, as the host's does: two files listen on this computer's name, which was the container's
    // id and resolved to nothing (measured 25 September 2026). MUTATION PROOF, that day, alone in tools/sandbox.mjs: no
    // --hostname given, and this goes red.
    const lastRunArgs = state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []
    expect(lastRunArgs).toContain('--hostname=mole-office-sandbox-own-network')
    expect(hostsLines).toContain('127.0.1.1\tmole-office-sandbox-own-network')
    // OFF THE HOST'S NETWORK THE ARGUMENTS ARE TODAY'S: the hosts file names it, so it is given no --add-host.
    expect(lastRunArgs.filter((a) => /^--(hostname|add-host)(=|$)/.test(a))).toEqual(['--hostname=mole-office-sandbox-own-network'])
    const down = await sandbox(['down', 'own-network', '--json'])
    expect(down.status, down.err).toBe(0)
  })

  // ON THE HOST'S NETWORK BY --network host, as by the template, IT HAS A HOST NAME OF ITS OWN, and the host's /etc/hosts.
  // Mutation HOST_NETWORK_NAME (see the first up above) turns this red too.
  it('gives a container put on the host\'s network by --network host its own host name, resolving to this machine', async () => {
    const up = await sandbox(['up', template, '--name', 'host-named', '--from', main, '--dsh', dsh, '--network', 'host', '--json'])
    expect(up.status, up.err).toBe(0)
    const made = state().calls.filter((c) => c.tool === 'devcontainer').pop()
    const runArgs = made?.runArgs ?? []
    expect(runArgs.filter((a) => /^--net(work)?=/.test(a))).toEqual(['--network=host'])
    expect(runArgs.filter((a) => /^--(hostname|add-host)(=|$)/.test(a))).toEqual(['--hostname=mole-office-sandbox-host-named', '--add-host=mole-office-sandbox-host-named:127.0.1.1'])
    expect(made?.mounts?.some((m) => m.includes('target=/etc/hosts'))).toBe(false)
    expect(state().containers['mole-office-sandbox-host-named']?.Config?.Hostname === 'mole-office-sandbox-host-named', 'the container does not carry its own host name').toBe(true)
    const down = await sandbox(['down', 'host-named', '--json'])
    expect(down.status, down.err).toBe(0)
  })

  // A CONTAINER THAT CARRIES THE HOST'S OWN HOST NAME IS NOT KEPT, as one on another network is not, and the words name
  // neither name: a refusal goes into logs, and the host's name must not. The check compares the names and prints
  // neither, so a red run prints no machine name. Mutation HOST_NAME_READ_BACK: the host's own name not looked for, and
  // this goes red.
  it('stops through the ledger, and removes, a container docker made with the host\'s own host name, naming neither name', async () => {
    setBug('hostNameIgnored', true)
    try {
      const up = await sandbox(['up', template, '--name', 'named-as-the-host', '--from', main, '--dsh', dsh])
      const told = up.err.split(hostname()).join('<the host name>')
      expect(up.status, told).toBe(1)
      expect(up.err.includes(hostname()), 'the launcher\'s words name the host').toBe(false)
      const problems = /The container docker made is not what was asked for: (.*?)\. It was stopped/.exec(up.err)?.[1]
      expect(problems === "its host name is the host's own", 'the problems were not that one sentence').toBe(true)
      expect(state().calls.some((c) => c.tool === 'ledger-stop' && c.argv[0] === 'mole-office-sandbox-named-as-the-host')).toBe(true)
      expect(state().containers['mole-office-sandbox-named-as-the-host']).toBeUndefined()
      const row = (await ledger()).find((r) => r.key === 'mole-office-sandbox-named-as-the-host')
      expect(row?.releasedAt).not.toBeNull()
    } finally {
      setBug('hostNameIgnored', false)
    }
  })

  // THE NETWORK IT ASKED FOR IS READ BACK, as the zone is: a container docker put on the host's network after
  // --network none would reach the live office while the launcher said it could not. MUTATION PROOF, 25 September 2026,
  // alone in tools/sandbox.mjs: the network not read back, and this goes red.
  it('stops through the ledger, and removes, a container docker made on another network than the one asked for', async () => {
    setBug('networkIgnored', true)
    try {
      const up = await sandbox(['up', template, '--name', 'on-the-host', '--from', main, '--dsh', dsh, '--network', 'none'])
      expect(up.status, up.err).toBe(1)
      expect(up.err).toContain('its network is host, not none')
      expect(state().calls.some((c) => c.tool === 'ledger-stop' && c.argv[0] === 'mole-office-sandbox-on-the-host')).toBe(true)
      expect(state().containers['mole-office-sandbox-on-the-host']).toBeUndefined()
      const row = (await ledger()).find((r) => r.key === 'mole-office-sandbox-on-the-host')
      expect(row?.releasedAt).not.toBeNull()
    } finally {
      setBug('networkIgnored', false)
    }
  })

  // A RAISE REACHES ITS CONTAINER, and only the raised figures change (rule 7 of a decision: a template may ask for
  // more, with its reason written in it; problem TotXlPFHFduz). Mutation UP_RAISE_UNREAD:
  // up passes the defaults whatever the template declares, and this goes red.
  it("gives a container its template's declared raise, the other defaults beside it, and says why", async () => {
    const raised = join(scratch, 'template-with-a-raise')
    mkdirSync(raised)
    writeFileSync(join(raised, 'devcontainer.json'), readFileSync(join(template, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8'))
    office.raises = { memory: '48g', pidsLimit: '4000', because: 'This test template needs more memory and more processes than the defaults give.' }
    writeFileSync(join(raised, 'sandbox.json'), JSON.stringify(office, null, 2))
    const up = await sandbox(['up', raised, '--name', 'raised', '--from', main, '--dsh', dsh])
    expect(up.status, up.err).toBe(0)
    const runArgs = state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []
    expect(runArgs.filter((a) => /^--(memory|memory-swap|cpus|cpu-shares|pids-limit)=/.test(a)))
      .toEqual(['--memory=48g', '--memory-swap=48g', '--cpus=8', '--cpu-shares=256', '--pids-limit=4000'])
    expect(up.err).toContain("its template's raised limits: 48g of memory with swap counted in it, 8 cores at a priority below the desktop's, 4000 processes, because This test template needs more memory")
    const down = await sandbox(['down', 'raised', '--json'])
    expect(down.status, down.err).toBe(0)
  })

  // A MERGE SANDBOX TAKES ITS TEMPLATE'S MERGE RAISE, 24 GiB for mole-office-dev (decision JNAgZOdcw5xK;
  // MMYiBgR1p7gr), when up is given both the label mole-office.merge-entry and the name the merge queue makes. A line's
  // sandbox given the label alone stays at 16g. The memory admission reads the same figure: with 28 GiB available, a merge
  // sandbox, which may take 24 GiB and needs 8 beside it, is refused, and the labelled line sandbox starts. Mutations
  // UP_MERGE_RAISE_UNREAD (up reads "raises" alone: the merge sandbox is held to 16g, red) and UP_MERGE_ADMISSION_AT_16
  // (the admission reads the defaults: the merge start at 28 GiB is let through, red).
  it("gives a merge sandbox its template's 24g merge raise and says why, and a line sandbox with the label alone 16g", async () => {
    const label = 'mole-office.merge-entry=MooeUtxYuoYP'
    const memory = () => (state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []).filter((a) => /^--memory(-swap)?=/.test(a))
    const up = (name: string) => sandbox(['up', template, '--name', name, '--from', main, '--no-dsh', '--label', label])
    const merge = await up('merge-mooeutxyuoyp-3f9a1c')
    expect(merge.status, merge.err).toBe(0)
    expect(memory()).toEqual(['--memory=24g', '--memory-swap=24g'])
    expect(merge.err).toContain("the container is held to its template's limits for a merge sandbox: 24g of memory with swap counted in it")
    expect(merge.err).toContain('JNAgZOdcw5xK')
    expect((await sandbox(['down', 'merge-mooeutxyuoyp-3f9a1c', '--json'])).status).toBe(0)
    const line = await up('labelled-line')
    expect(line.status, line.err).toBe(0)
    expect(memory()).toEqual(['--memory=16g', '--memory-swap=16g'])
    expect(line.err).toContain('the container is held to the sandbox defaults: 16g of memory')
    expect((await sandbox(['down', 'labelled-line', '--json'])).status).toBe(0)
    memoryFigure(28 * 2 ** 30)
    try {
      const short = await up('merge-mooeutxyuoyp-4e5d6f')
      expect(short.status, short.err).toBe(75)
      expect(short.err).toContain('the machine has 28 GiB of memory available, under the 32 GiB this start needs')
      expect(existsSync(join(sandboxes, 'merge-mooeutxyuoyp-4e5d6f'))).toBe(false)
      const room = await up('labelled-line-again')
      expect(room.status, room.err).toBe(0)
      expect((await sandbox(['down', 'labelled-line-again', '--json'])).status).toBe(0)
    } finally { memoryFigure(64 * 2 ** 30) }
  })

  // A TEMPLATE'S OWN /dev/shm SIZE STANDS (problem TKH0KMph-bMR): docker takes the last --shm-size it is given, so the
  // launcher's 1 GB after cfc-gpu's 16 GB would cut Isaac Sim's. Mutation UP_SHM_OVER_THE_TEMPLATE: up adds 1 GB whatever
  // the template names, and this goes red.
  it("keeps a template's own /dev/shm size and adds none of its own", async () => {
    const own = join(scratch, 'template-with-its-own-shm')
    mkdirSync(own)
    const container = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
    container.runArgs = [...(container.runArgs ?? []), '--shm-size=16g']
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(container, null, 2))
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const up = await sandbox(['up', own, '--name', 'own-shm', '--from', main, '--dsh', dsh])
    expect(up.status, up.err).toBe(0)
    const runArgs = state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []
    expect(runArgs.filter((a) => a.startsWith('--shm-size'))).toEqual(['--shm-size=16g'])
    const down = await sandbox(['down', 'own-shm', '--json'])
    expect(down.status, down.err).toBe(0)
  })

  // ONLY THE LAUNCHER SETS THE LIMITS: a template whose runArgs set one itself is refused, and so is a raise with no
  // reason, both before anything is written, problem TotXlPFHFduz. Mutations UP_OWN_LIMIT and
  // UP_RAISE_UNCHECKED: either refusal taken out, and this goes red.
  it('refuses a template whose runArgs set a limit, or whose raise gives no reason, and writes nothing', async () => {
    const before = (await ledger()).length
    const started = state().calls.filter((c) => c.tool === 'devcontainer').length
    const own = join(scratch, 'template-with-its-own-limit')
    mkdirSync(own)
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
    config.runArgs = [...(config.runArgs ?? []), '--memory=64g']
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const limited = await sandbox(['up', own, '--name', 'own-limit', '--from', main, '--dsh', dsh])
    expect(limited.status, limited.err).toBe(1)
    expect(limited.err).toContain(`${join(own, 'devcontainer.json')} sets a memory, CPU or process limit in its runArgs.`)
    expect(theRefusalExplanation(limited)).toContain('Nothing was done.')

    const unreasoned = join(scratch, 'template-raising-without-a-reason')
    mkdirSync(unreasoned)
    writeFileSync(join(unreasoned, 'devcontainer.json'), readFileSync(join(template, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8'))
    office.raises = { memory: '48g' }
    writeFileSync(join(unreasoned, 'sandbox.json'), JSON.stringify(office, null, 2))
    const bare = await sandbox(['up', unreasoned, '--name', 'no-reason', '--from', main, '--dsh', dsh])
    expect(bare.status, bare.err).toBe(1)
    expect(bare.err).toContain(`${join(unreasoned, 'sandbox.json')} raises memory without its reason`)
    expect(theRefusalExplanation(bare)).toContain('Nothing was done.')

    expect((await ledger()).length).toBe(before)
    expect(state().calls.filter((c) => c.tool === 'devcontainer').length).toBe(started)
    expect(existsSync(join(sandboxes, 'own-limit'))).toBe(false)
    expect(existsSync(join(sandboxes, 'no-reason'))).toBe(false)
  })
})

describe('worker and round start Claude directly through the helper', () => {
  it.each(['worker', 'round'] as const)('%s uses direct claude with MCP and permissions, passing the copied brief through --stdin', async verb => {
    const answer = upAnswer as { folder: string }
    const handle = `direct-${verb}-command`
    const registered = await ask('POST', '/api/agents/started', AS_STARTER(), { handle, name: handle, role: 'worker', workArea: ['src'] })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const brief = join(scratch, `direct-${verb}.md`)
    const text = `# Synthetic ${verb} brief\nExact standard input.\n`
    writeFileSync(brief, text)
    const seen = join(answer.folder, 'out', `direct-${verb}.json`)
    const binary = join(fakes, 'bin', 'claude')
    const previous = existsSync(binary) ? readFileSync(binary) : null
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    writeFileSync(binary, `#!${process.execPath}\nconst fs = require('fs'); fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ argv: process.argv.slice(2), stdin: fs.readFileSync(0, 'utf8') }))\n`, { mode: 0o755 })
    try {
      if (verb === 'round') {
        const first = await sandbox(['worker', NAME, '--agent', handle, '--model', 'claude-opus-5-5', '--brief', brief, '--json'])
        expect(first.status, first.err).toBe(0)
        const start = JSON.parse(first.out.trim())
        groups.add(start.hostPgid)
        await until('the first direct worker to end', () => existsSync(join(answer.folder, 'logs', start.run, 'finish.log')))
        rmSync(seen, { force: true })
      }
      const ran = await sandbox([verb, NAME, '--agent', handle, '--model', 'claude-opus-5-5', '--brief', brief, '--json'])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      await until('the direct Claude command to end', () => existsSync(join(answer.folder, 'logs', start.run, 'finish.log')))
      expect(start.command).toEqual(['claude', AN_MCP_FLAG, ...CLAUDE_CODE_FEATURES_OFF,
        '--permission-mode', 'bypassPermissions', '-p', ...(verb === 'round' ? ['--continue'] : []), '--model', 'claude-opus-5-5', '--output-format', 'json', '--effort', 'xhigh'])
      expect(realpathSync(start.stdin).startsWith(realpathSync(answer.folder) + sep)).toBe(true)
      if (verb === 'worker') expect(start.stdin.startsWith(join(answer.folder, 'briefs'))).toBe(true)
      const input = readFileSync(start.stdin, 'utf8')
      expect(input).toContain(text)
      if (verb === 'round') {
        const saved = await ask('GET', `/api/records/${start.run}`, AS_STARTER())
        // THE TEST OFFICE HOLDS NO CHAPTER AND NO REGULATION, and its chapters door's answer is what CODE.md was made from.
        const chapters = await ask('GET', THE_CHAPTERS_DOOR, AS_STARTER())
        expect(chapters.status, JSON.stringify(chapters.body)).toBe(200)
        expectRoundRulesSaved(saved.body.record.data, chapters.body)
        expect(input).toBe(`${THE_STARTING_WORDS}\n\n---\n\n${deliveredRoundBrief(savedRoundChapters(saved.body.record.data)!)}`)
      } else expect(input).toBe(`${THE_STARTING_WORDS}\n\n---\n\n${text}`)
      expect(JSON.parse(readFileSync(seen, 'utf8'))).toEqual({ argv: start.command.slice(1), stdin: input })
    } finally {
      rmSync(secrets, { force: true })
      if (previous === null) rmSync(binary, { force: true })
      else writeFileSync(binary, previous, { mode: 0o755 })
    }
  }, 60_000)
})

describe('a next round in its own worktree', () => {
  const gitHere = (dir: string, ...args: string[]): string =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const removeWorktree = (repo: string, path: string): void => {
    spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', path], { stdio: 'ignore' })
    rmSync(path, { recursive: true, force: true })
    spawnSync('git', ['-C', repo, 'worktree', 'prune'], { stdio: 'ignore' })
  }

  async function aSealedPreviousRound() {
    const folder = upAnswer!.folder
    const repo = join(folder, 'repo')
    const handle = `round-own-${randomBytes(5).toString('hex')}`
    const registered = await ask('POST', '/api/agents/started', AS_STARTER(), { handle, name: handle, role: 'worker', workArea: ['made.txt'] })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const base = gitHere(repo, 'rev-parse', 'main')
    let checkout: string
    checkout = join(folder, 'worktrees', `${handle}-previous`)
    gitHere(repo, 'worktree', 'add', '-b', `${handle}-previous`, checkout, base)
    writeFileSync(join(checkout, 'made.txt'), 'released\n')
    gitHere(checkout, 'add', 'made.txt')
    gitHere(checkout, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Released work')
    const tip = gitHere(checkout, 'rev-parse', 'HEAD')
    const before = await ask('POST', '/api/records', AS_STARTER(), {
      kind: 'session', title: 'A synthetic released round',
      data: { state: 'running', servingAgent: handle, servingAgentId: registered.body.agent.id, runtime: 'claude-code', model: 'claude-opus-5-5', workingDirectory: checkout, cutFrom: 'main', cutFromCommit: { named: 'main', commit: base }, sandbox: { template: 'mole-office-dev', container: upAnswer!.resource, folder }, submission: { kind: 'git' } },
    })
    expect(before.status, JSON.stringify(before.body)).toBe(201)
    const run = String(before.body.record.id)
    await aReportOf(run)
    const finished = await ask('PATCH', `/api/records/${run}`, AS_STARTER(), { dataPatch: { state: 'finished' } })
    expect(finished.status, JSON.stringify(finished.body)).toBe(200)
    expect(finished.body.record.data.sealedTip).toEqual(expect.any(String))
    const brief = join(folder, 'briefs', `${handle}.md`)
    writeFileSync(brief, '# A synthetic next round\n')
    return { folder, repo, handle, checkout, base, tip, run, brief }
  }

  it.each(['moved', 'unmoved'] as const)('starts a new conversation at the released tip, preserves the recorded cut and the old branch, and links packages when the cut is %s', async (cutState) => {
    const f = await aSealedPreviousRound()
    const directory = join(f.folder, 'worktrees', `${f.handle}-next`)
    const oldBranch = gitHere(f.checkout, 'branch', '--show-current')
    const binary = join(fakes, 'bin', 'claude')
    const previous = existsSync(binary) ? readFileSync(binary) : null
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    writeFileSync(binary, '#!/bin/sh\nprintf synthetic-claude\n', { mode: 0o755 })
    try {
      if (cutState === 'moved') gitHere(f.repo, 'update-ref', 'refs/heads/main', f.tip)
      const ran = await sandbox(['round', NAME, '--agent', f.handle, '--model', 'claude-opus-5-5', '--runtime', 'claude-code', '--brief', f.brief, '--continues', f.run, '--worktree', directory, '--cut-from', 'main', '--at', f.tip, '--json'])
      expect(ran.status, ran.err).toBe(0)
      const started = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number; command: string[] }
      groups.add(started.hostPgid)
      expect(started.command).not.toContain('--continue')
      const record = (await ask('GET', `/api/records/${started.run}`, AS_STARTER())).body.record
      expect(record.data).toMatchObject({ workingDirectory: directory, cutFrom: 'main', cutFromCommit: { named: 'main', commit: f.base } })
      expect(gitHere(directory, 'rev-parse', 'HEAD')).toBe(f.tip)
      expect(gitHere(directory, 'branch', '--show-current')).toBe(`${f.handle}-${started.run}`)
      expect(lstatSync(join(directory, 'node_modules')).isSymbolicLink()).toBe(true)
      expect(realpathSync(join(directory, 'node_modules'))).toBe(realpathSync(join(f.repo, 'node_modules')))
      expect(gitHere(f.checkout, 'rev-parse', 'HEAD')).toBe(f.tip)
      expect(gitHere(f.checkout, 'branch', '--show-current')).toBe(oldBranch)
      await until('the synthetic next round to end', () => existsSync(join(f.folder, 'logs', started.run, 'finish.log')))
    } finally {
      gitHere(f.repo, 'update-ref', 'refs/heads/main', f.base)
      removeWorktree(f.repo, directory)
      removeWorktree(f.repo, f.checkout)
      rmSync(secrets, { force: true })
      if (previous === null) rmSync(binary, { force: true })
      else writeFileSync(binary, previous, { mode: 0o755 })
    }
  }, 90_000)

  it('files the current cut name when the recorded commit belongs to an older name', async () => {
    const f = await aSealedPreviousRound()
    const directory = join(f.folder, 'worktrees', `${f.handle}-next`)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.cutFromCommit', json(?)) WHERE id = ?")
      .run(JSON.stringify({ named: 'master', commit: f.base }), f.run)
    const binary = join(fakes, 'bin', 'claude')
    const previous = existsSync(binary) ? readFileSync(binary) : null
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    writeFileSync(binary, '#!/bin/sh\nprintf synthetic-claude\n', { mode: 0o755 })
    try {
      gitHere(f.repo, 'update-ref', 'refs/heads/main', f.tip)
      const ran = await sandbox(['round', NAME, '--agent', f.handle, '--model', 'claude-opus-5-5', '--runtime', 'claude-code', '--brief', f.brief, '--continues', f.run, '--worktree', directory, '--cut-from', 'main', '--at', f.tip, '--json'])
      expect(ran.status, ran.err).toBe(0)
      expect(ran.err).toMatch(/older.*name/i)
      const started = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
      groups.add(started.hostPgid)
      const record = (await ask('GET', `/api/records/${started.run}`, AS_STARTER())).body.record
      expect(record.data).toMatchObject({ cutFrom: 'main', cutFromCommit: { named: 'main', commit: f.tip } })
      await until('the changed-name round to end', () => existsSync(join(f.folder, 'logs', started.run, 'finish.log')))
    } finally {
      gitHere(f.repo, 'update-ref', 'refs/heads/main', f.base)
      removeWorktree(f.repo, directory)
      removeWorktree(f.repo, f.checkout)
      rmSync(secrets, { force: true })
      if (previous === null) rmSync(binary, { force: true })
      else writeFileSync(binary, previous, { mode: 0o755 })
    }
  }, 90_000)

  it.each(['existing', 'outside', 'symlink', 'invalid tip', 'missing tip', 'different seal', 'different cut', 'unrelated cut', 'unsafe cut', 'unknown cut', 'unknown recorded cut', 'no previous run', 'missing worktree', 'missing cut'] as const)('refuses %s before starting a round', async (reason) => {
    const f = await aSealedPreviousRound()
    let directory = join(f.folder, 'worktrees', `${f.handle}-next`)
    let link: string | undefined
    let outsideParent: string | undefined
    let tip = f.tip
    let cut = 'main'
    try {
      if (reason === 'existing') mkdirSync(directory, { recursive: true })
      if (reason === 'outside') directory = join(scratch, `${f.handle}-outside`)
      if (reason === 'symlink') {
        link = join(f.folder, 'worktrees', `${f.handle}-link`)
        outsideParent = join(scratch, `${f.handle}-outside-parent`)
        mkdirSync(outsideParent)
        symlinkSync(outsideParent, link)
        directory = join(link, 'outside')
      }
      if (reason === 'invalid tip') tip = 'not-a-full-commit'
      if (reason === 'missing tip') tip = 'f'.repeat(40)
      if (reason === 'different seal') tip = f.base
      if (reason === 'different cut') cut = f.base
      if (reason === 'unrelated cut') {
        cut = gitHere(f.repo, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit-tree', `${f.base}^{tree}`, '-m', 'Independent history')
        t.client.sqlite.prepare("UPDATE records SET data = json_remove(json_set(data, '$.cutFrom', ?), '$.cutFromCommit') WHERE id = ?").run(cut, f.run)
      }
      if (reason === 'unsafe cut' || reason === 'unknown cut') {
        cut = reason === 'unsafe cut' ? '-unsafe' : 'a-removed-branch'
        t.client.sqlite.prepare("UPDATE records SET data = json_remove(json_set(data, '$.cutFrom', ?), '$.cutFromCommit') WHERE id = ?").run(cut, f.run)
      }
      if (reason === 'unknown recorded cut') {
        t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.cutFromCommit', json(?)) WHERE id = ?").run(JSON.stringify({ named: cut, commit: 'e'.repeat(40) }), f.run)
      }
      const before = await theSessionIds()
      const ran = await sandbox(['round', NAME, '--agent', f.handle, '--model', 'claude-opus-5-5', '--runtime', 'claude-code', '--brief', f.brief, ...(reason === 'no previous run' ? [] : ['--continues', f.run]), ...(reason === 'missing worktree' ? [] : ['--worktree', directory]), ...(reason === 'missing cut' ? [] : ['--cut-from', cut]), '--at', tip, '--json'])
      expect(ran.status).not.toBe(0)
      const refusal = theRefusalExplanation(ran)
      expect(refusal).toMatch(/nothing.*started/i)
      const named = ['existing', 'outside', 'symlink'].includes(reason) ? directory
        : ['invalid tip', 'missing tip', 'different seal'].includes(reason) ? tip
        : reason === 'no previous run' ? '--continues' : reason === 'missing worktree' ? '--worktree' : reason === 'missing cut' ? '--cut-from' : cut
      expect(refusal).toContain(named)
      if (reason === 'unsafe cut') expect(refusal).toContain(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH)
      if (reason === 'unknown cut') expect(refusal).toContain(`The round's cutFrom ${cut} names no commit in this sandbox's repository.`)
      if (reason === 'unknown recorded cut') expect(refusal).toContain(`The commit ${'e'.repeat(40)} recorded for the round's cutFrom ${cut} is not in this sandbox's repository.`)
      expect(await theSessionIds()).toEqual(before)
      if (reason === 'existing') expect(existsSync(directory)).toBe(true)
      if (reason !== 'existing') expect(existsSync(directory)).toBe(false)
      expect(gitHere(f.checkout, 'rev-parse', 'HEAD')).toBe(f.tip)
    } finally {
      if (outsideParent !== undefined) removeWorktree(f.repo, join(outsideParent, 'outside'))
      if (link !== undefined && existsSync(link)) unlinkSync(link)
      if (outsideParent !== undefined) rmSync(outsideParent, { recursive: true, force: true })
      if (link === undefined) removeWorktree(f.repo, directory)
      removeWorktree(f.repo, f.checkout)
    }
  }, 90_000)
})

/** Owner's disk and GPU rules use the same end-to-end stand-ins as every launcher case above. */
function diskFigure(bytes: number, error?: string): void {
  const now = state(); now.freeBytes = bytes
  if (error === undefined) delete now.dfError; else now.dfError = error
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}
function memoryFigure(bytes: number, error?: string): void {
  const now = state(); now.memoryAvailable = bytes
  if (error === undefined) delete now.freeError; else now.freeError = error
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}
function gpuContainer(other: boolean, self: boolean): void {
  const now = JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
  now.containers[CONTAINER].HostConfig.DeviceRequests = self ? [{ Capabilities: [['compute', 'gpu']] }] : []
  if (other) now.containers['synthetic-other-gpu'] = {
    Id: 'synthetic-other-gpu-id', Name: '/synthetic-other-gpu', State: { Running: true }, Mounts: [],
    Config: { Labels: { 'mole-office.sandbox': 'other-gpu' } }, HostConfig: { DeviceRequests: [{ Capabilities: [['gpu']] }] },
  }
  else delete now.containers['synthetic-other-gpu']
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}

/** Compile one named reader without running the launcher's top-level program. */
function launcherReader(name: string, globals: Record<string, unknown>): (...args: any[]) => any {
  const source = readFileSync(TOOL, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`The launcher reader ${name} was not found`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: TOOL })
}

/** A refusal is captured at the reader's boundary; no command or office write is substituted. */
function readerResult(read: () => unknown): Ran {
  try { read(); return { status: 0, out: '', err: '' } }
  catch (error) {
    if (error instanceof Error && 'status' in error) return { status: Number(error.status), out: '', err: error.message }
    throw error
  }
}
const readerRefusal = (sentence: string, status = 1): never => { throw Object.assign(new Error(sentence), { status }) }

function diskGate(bytes: number, error?: string): Ran {
  const read = launcherReader('roomForABuildOrTest', {
    sandboxes,
    SANDBOX_DISK_FLOOR: { bytes: 80_000_000_000, gb: 80 },
    SANDBOX_RUN_PEAK: { bytes: 5_000_000_000, gb: 5 },
    inGB: (bytes: number) => `${bytes / 1_000_000_000} GB`,
    refuse: readerRefusal,
    run: (program: string, argv: string[]) => {
      expect([program, argv]).toEqual(['df', ['-B1', '--output=avail', sandboxes]])
      const now = state(); now.calls.push({ tool: program, argv }); writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
      return { status: error ? 1 : 0, stdout: `Avail\n${bytes}\n`, stderr: error ?? '' }
    },
  })
  return readerResult(() => read())
}

function memoryGate(available: number, pid?: number, error?: string): Ran {
  const held = launcherReader('theMemoryAContainerHolds', {
    readFileSync, join, theCgroupMemoryPath,
    carriesTheTestMark: () => true,
    process: { env: { MOLE_SANDBOX_MEMORY_TEST_ROOT: join(fakes, 'memory-files') } },
  })
  const free = launcherReader('theMemoryAvailable', {
    refuse: readerRefusal,
    run: (program: string, argv: string[]) => {
      expect([program, argv]).toEqual(['free', ['-b']])
      return { status: error ? 1 : 0, stdout: `Mem: 100 20 20 0 60 ${available}\n`, stderr: error ?? '' }
    },
  })
  const read = launcherReader('roomInMemory', { theMemoryAvailable: free, noRoomInMemory, refuse: readerRefusal })
  return readerResult(() => read(16 * 2 ** 30, held(pid), 'the synthetic build'))
}

/** GPU readings use synthetic docker replies and the fixture office's actual bookings. */
async function gpuReminder(): Promise<Ran> {
  const lines: string[] = []
  const read = launcherReader('remindOfOtherGpuSandboxes', {
    api, ID_LABEL: 'mole-office.sandbox', asksForAGpu: launcherReader('asksForAGpu', {}), spoolAGateMet,
    say: (line: string) => lines.push(line), theCallerNamed: () => ({}),
    theOfficeSaid: () => { throw new Error('The fixture booking door must answer') },
    askTheOffice: (address: string, path: string) => {
      expect(address).toBe(api); expect(path).toBe('/api/resources/gpu?secondLevel=show')
      return ask('GET', path, AS_STARTER())
    },
    spawnSync: (program: string, argv: string[]) => {
      expect(program).toBe('docker')
      const now = state(), containers = Object.values(now.containers)
      if (argv[0] === 'ps') return now.bugs.gpuListFails
        ? { status: 1, stderr: 'synthetic GPU list failure' }
        : { status: 0, stdout: containers.filter(one => one.State.Running).map(one => one.Id).join('\n') }
      if (argv[0] !== 'inspect') throw new Error(`Unexpected GPU reader command ${argv[0]}`)
      const container = containers.find(one => one.Id === argv.at(-1))
      if (container === undefined) throw new Error('The synthetic GPU container was not found')
      return { status: 0, stdout: JSON.stringify([container]) }
    },
  })
  await read(NAME, WORKSPACE, AS_STARTER())
  return { status: 0, out: '', err: lines.join('\n') }
}

// The disk gates come from a decision.
// The GPU reminders come from a decision.
describe('disk gates and GPU reminders', () => {
  for (const [road, flags] of [
    ['MERGE', ['--wait', '--plain-env']], ['SEAT', ['--slot', 'full-suite']], ['CHECK', ['--no-office-variables']],
  ] as const) it(`mutation DISK_${road}: under 85 GB, the floor plus a test run's peak, refuses with 75 before any filing, row, seat or command`, async () => {
    // ABOVE THE FLOOR AND STILL REFUSED (decision tZ-rQXJD-Trh, 9 November 2026, replaced that night by evvHm--b4Ngu, which
    // keeps 85 GB for a test run, so the refusal cites it): a run that starts at 80.1 GB writes
    // several GB of its own and goes under, as three did on the night of 8 to 9 November.
    diskFigure(84_900_000_000)
    try {
      const beforeRows = (await ledger()).map((row) => row.id)
      const beforeRuns = (await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records.map((row: any) => row.id)
      const beforeCalls = state().calls.length
      const handshakes = join(upAnswer!.folder, 'handshakes')
      const beforeFiles = existsSync(handshakes) ? readdirSync(handshakes) : []
      const ran = road === 'MERGE' ? await sandbox(['exec', NAME, ...flags, '--', 'true']) : diskGate(84_900_000_000)
      expect(ran.status, ran.err).toBe(75)
      expect(ran.err).toContain("84.9 GB free where the sandboxes are, under the 85 GB a new build or test run needs: the 80 GB floor (the free disk never goes under it) plus a test run's own peak of 5 GB")
      expect(ran.err).not.toMatch(/\(decision [A-Za-z0-9_-]+\)/)
      expect(theRefusalExplanation(ran)).toContain('Nothing was started')
      expect((await ledger()).map((row) => row.id)).toEqual(beforeRows)
      expect((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records.map((row: any) => row.id)).toEqual(beforeRuns)
      expect(existsSync(handshakes) ? readdirSync(handshakes) : []).toEqual(beforeFiles)
      expect(state().calls.slice(beforeCalls)).toEqual([{ tool: 'df', argv: ['-B1', '--output=avail', sandboxes] }])
    } finally { diskFigure(100_000_000_000) }
  })
  it('mutation DISK_BOUNDARY: at 85 GB and above each road starts its command, and at the floor itself it does not', async () => {
    try {
      diskFigure(85_000_000_000)
      const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', 'echo synthetic-started'])
      expect(ran.status, ran.err).toBe(0); expect(ran.out).toBe('synthetic-started\n')
      for (const bytes of [85_000_000_000, 86_000_000_000]) expect(diskGate(bytes).status).toBe(0)
      // THE FLOOR IS NOT THE START LINE (evvHm--b4Ngu): 80 GB and a byte under 85 GB are both refused.
      for (const bytes of [80_000_000_000, 84_999_999_999]) expect(diskGate(bytes).status).toBe(75)
    } finally { diskFigure(100_000_000_000) }
  })
  it('mutation DF_UNKNOWN: a failed or invalid df reading is never accepted as enough space', () => {
    for (const error of ['synthetic df failure', undefined]) {
      const ran = diskGate(error ? 100_000_000_000 : -1, error)
      expect(ran.status).toBe(75); expect(ran.err).toContain('unknown'); expect(ran.err).toContain('80 GB'); expect(ran.err).toContain('Nothing was started')
      if (error) expect(ran.err).toContain(error)
    }
    const read = launcherReader('roomForABuildOrTest', {
      sandboxes, SANDBOX_DISK_FLOOR: { bytes: 80_000_000_000, gb: 80 }, SANDBOX_RUN_PEAK: { bytes: 5_000_000_000, gb: 5 }, refuse: readerRefusal,
      inGB: () => { throw new Error('An unread disk must not be formatted') },
      run: () => ({ status: null, stdout: '', stderr: '', error: new Error('ENOENT') }),
    })
    const missing = readerResult(() => read())
    expect(missing.status).toBe(75); expect(missing.err).toContain('ENOENT'); expect(missing.err).toContain('Nothing was started')
  })
  it('mutation DISK_UP: up is allowed even under 80 GB and never asks df', async () => {
    diskFigure(1)
    try {
      const calls = state().calls.length
      const ran = await sandbox(['up', template, '--name', 'disk-up', '--from', main, '--no-dsh', '--json'])
      expect(ran.status, ran.err).toBe(0); expect(state().calls.slice(calls).some((call) => call.tool === 'df')).toBe(false)
      expect((await sandbox(['down', 'disk-up'])).status).toBe(0)
    } finally { diskFigure(100_000_000_000) }
  })
  // MEMORY ADMISSION (message 1R4wqZ70yUA0): the same three roads, and every up, refuse with 75 while free -b says
  // the machine has under what the container may still take plus 8 GiB. The stand-in container names no limit, so it is
  // read at the default 16 GiB, and it holds nothing the launcher can read: 24 GiB is needed.
  for (const [road, flags] of [
    ['MERGE', ['--wait', '--plain-env']], ['SEAT', ['--slot', 'full-suite']], ['CHECK', ['--no-office-variables']],
  ] as const) it(`mutation MEMORY_${road}: under 24 GiB available refuses with 75 before any filing, row, seat or command`, async () => {
    memoryFigure(20 * 2 ** 30)
    try {
      const beforeRows = (await ledger()).map((row) => row.id)
      const beforeRuns = (await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records.map((row: any) => row.id)
      const beforeCalls = state().calls.length
      const ran = road === 'MERGE' ? await sandbox(['exec', NAME, ...flags, '--', 'true']) : memoryGate(20 * 2 ** 30)
      expect(ran.status, ran.err).toBe(75)
      expect(ran.err).toContain('the machine has 20 GiB of memory available, under the 24 GiB this start needs')
      expect(ran.err).toContain('8 GiB kept for the desktop and the office'); expect(theRefusalExplanation(ran)).toContain('Nothing was started')
      expect((await ledger()).map((row) => row.id)).toEqual(beforeRows)
      expect((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records.map((row: any) => row.id)).toEqual(beforeRuns)
      expect(state().calls.slice(beforeCalls).some((call) => call.tool === 'docker' && ['exec', 'create', 'start'].includes(call.argv[0]!))).toBe(false)
    } finally { memoryFigure(64 * 2 ** 30) }
  })
  it('mutation MEMORY_BOUNDARY: at 24 GiB available a build starts its command', async () => {
    memoryFigure(24 * 2 ** 30)
    try {
      const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'])
      expect(ran.status, ran.err).toBe(0)
    } finally { memoryFigure(64 * 2 ** 30) }
  })
  // Synthetic process and cgroup files only. The stand-in docker reports this process as the container's main one.
  it('mutation MEMORY_CGROUP: a running build needs the remaining cap plus the margin, wherever its cgroup is', async () => {
    const now = state(), container = now.containers[`mole-office-sandbox-${NAME}`]!
    const original = container.State.Pid
    container.State.Pid = 999999
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    const root = join(fakes, 'memory-files')
    const proc = join(root, 'proc', '999999')
    const cgroup = join(root, 'sys/fs/cgroup/system.slice/system-molesandboxes.slice', `docker-${container.Id}.scope`)
    mkdirSync(proc, { recursive: true }); mkdirSync(cgroup, { recursive: true })
    writeFileSync(join(proc, 'cgroup'), `0::/system.slice/system-molesandboxes.slice/docker-${container.Id}.scope\n`)
    writeFileSync(join(cgroup, 'memory.current'), String(12 * 2 ** 30))
    try {
      memoryFigure(12 * 2 ** 30)
      const allowed = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'])
      expect(allowed.status, allowed.err).toBe(0)
      memoryFigure(12 * 2 ** 30 - 1)
      const refused = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'])
      expect(refused.status, refused.err).toBe(75)
      expect(theRefusalExplanation(refused)).toContain('the 4 GiB the sandbox may still take')
    } finally {
      memoryFigure(64 * 2 ** 30); rmSync(root, { recursive: true, force: true })
      const restored = state(); restored.containers[`mole-office-sandbox-${NAME}`]!.State.Pid = original
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(restored))
    }
  })
  it('mutation MEMORY_TEST_MARK: an unmarked build ignores the synthetic memory root and asks for the whole cap', async () => {
    const now = state(), container = now.containers[CONTAINER]!
    const original = container.State.Pid
    // Linux's largest pid_max is 2^22, and that ceiling is itself never a process id.
    const pid = 4194304
    container.State.Pid = pid
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    const root = join(fakes, 'memory-files'), proc = join(root, 'proc', String(pid))
    const cgroup = join(root, 'sys/fs/cgroup/synthetic')
    mkdirSync(proc, { recursive: true }); mkdirSync(cgroup, { recursive: true })
    writeFileSync(join(proc, 'cgroup'), '0::/synthetic\n')
    writeFileSync(join(cgroup, 'memory.current'), String(12 * 2 ** 30))
    try {
      memoryFigure(12 * 2 ** 30)
      const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'], undefined, { [THE_TEST_MARK]: undefined })
      expect(ran.status, ran.err).toBe(75)
      expect(theRefusalExplanation(ran)).toContain('the 16 GiB the sandbox may still take')
    } finally {
      memoryFigure(64 * 2 ** 30); rmSync(root, { recursive: true, force: true })
      const restored = state(); restored.containers[CONTAINER]!.State.Pid = original
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(restored))
    }
  })
  it.each(['missing memory', 'missing process', 'non-numeric', 'no v2', 'zero pid', 'no pid'])('mutation MEMORY_UNKNOWN_USED: %s asks for the whole cap', async (reading) => {
    const key = `mole-office-sandbox-${NAME}`, original = state().containers[key]!.State.Pid
    const root = join(fakes, 'memory-files'), proc = join(root, 'proc', '999998')
    const cgroup = join(root, 'sys/fs/cgroup/synthetic')
    mkdirSync(proc, { recursive: true }); mkdirSync(cgroup, { recursive: true })
    try {
      memoryFigure(24 * 2 ** 30 - 1)
      const now = state(); now.containers[key]!.State.Pid = reading === 'zero pid' ? 0 : reading === 'no pid' ? undefined : reading === 'missing process' ? 999997 : 999998
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
      writeFileSync(join(proc, 'cgroup'), reading === 'no v2' ? '1:memory:/synthetic\n' : '0::/synthetic\n')
      rmSync(join(cgroup, 'memory.current'), { force: true })
      if (reading === 'non-numeric') writeFileSync(join(cgroup, 'memory.current'), 'unknown')
      const ran = memoryGate(24 * 2 ** 30 - 1, now.containers[key]!.State.Pid)
      expect(ran.status, `${reading}: ${ran.err}`).toBe(75)
      expect(theRefusalExplanation(ran), reading).toContain('the 16 GiB the sandbox may still take')
    } finally {
      memoryFigure(64 * 2 ** 30); rmSync(root, { recursive: true, force: true })
      const restored = state(); restored.containers[key]!.State.Pid = original
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(restored))
    }
  })
  it('mutation MEMORY_UP: up refuses with 75 under its limit plus 8 GiB, before any folder or ledger write', async () => {
    memoryFigure(23 * 2 ** 30)
    try {
      const rows = (await ledger()).length
      const ran = await sandbox(['up', template, '--name', 'memory-up', '--from', main, '--no-dsh', '--json'])
      expect(ran.status, ran.err).toBe(75)
      expect(ran.err).toContain('the 16 GiB the sandbox may still take under its 16 GiB limit'); expect(ran.err).toContain('sandbox memory-up can start once')
      expect(existsSync(join(sandboxes, 'memory-up'))).toBe(false); expect((await ledger()).length).toBe(rows)
    } finally { memoryFigure(64 * 2 ** 30) }
  })
  it('mutation FREE_UNKNOWN: a failed or invalid free reading is never taken as enough memory', async () => {
    try {
      for (const error of ['synthetic free failure', undefined]) {
        memoryFigure(error ? 64 * 2 ** 30 : -1, error)
        const ran = memoryGate(error ? 64 * 2 ** 30 : -1, undefined, error)
        expect(ran.status).toBe(75); expect(ran.err).toContain('memory this machine has available is unknown'); expect(theRefusalExplanation(ran)).toContain('Nothing was started')
        if (error) expect(ran.err).toContain(error)
      }
    } finally { memoryFigure(64 * 2 ** 30) }
  })
  it('mutation GPU_UP: both gpus spellings start with a reminder naming the other running GPU sandbox', async () => {
    const gpuTemplate = join(scratch, 'gpu-template'); mkdirSync(gpuTemplate)
    writeFileSync(join(gpuTemplate, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    gpuContainer(true, false)
    try {
      for (const runArgs of [['--gpus=all'], ['--gpus', 'all']]) {
        const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')); config.runArgs.push(...runArgs)
        writeFileSync(join(gpuTemplate, 'devcontainer.json'), JSON.stringify(config))
        const rows = (await ledger()).length
        const ran = await sandbox(['up', gpuTemplate, '--name', 'gpu-overlap', '--from', main, '--no-dsh'])
        expect(ran.status, ran.err).toBe(0)
        expect(ran.err).toContain('GPU reminder: sandbox other-gpu is already running with a GPU')
        expect(ran.err).toContain('a GPU overlap is a reminder, never a refusal')
        expect(existsSync(join(sandboxes, 'gpu-overlap'))).toBe(true); expect((await ledger()).length).toBeGreaterThan(rows)
        expect((await sandbox(['down', 'gpu-overlap'])).status).toBe(0)
      }
    } finally { gpuContainer(false, false) }
    const allowed = await sandbox(['up', gpuTemplate, '--name', 'gpu-alone', '--from', main, '--no-dsh', '--json'])
    expect(allowed.status, allowed.err).toBe(0)
    expect((await sandbox(['exec', 'gpu-alone', '--wait', '--', 'true'])).status).toBe(0)
    expect((await sandbox(['down', 'gpu-alone'])).status).toBe(0)
  })
  it('mutation GPU_COMMAND: a plain exec, an isolated exec, worker and round start with a reminder naming the other GPU sandbox', async () => {
    gpuContainer(true, true)
    try {
      const isolated = await ask('POST', '/api/records', AS_STARTER(), {
        kind: 'session', title: 'Synthetic isolated GPU command run', data: { state: 'running', servingAgent: WORKER },
      })
      expect(isolated.status, JSON.stringify(isolated.body)).toBe(201)
      for (const args of [
        ['exec', NAME, '--wait', '--plain-env', '--', 'true'],
        ['exec', NAME, '--isolated', '--run', isolated.body.record.id, '--runtime', 'dsh', '--cwd', upAnswer!.folder, '--', 'true'],
      ]) {
        const ran = await sandbox(args); expect(ran.status, ran.err).toBe(0)
        expect(ran.err).toContain('GPU reminder: sandbox other-gpu is already running with a GPU')
      }
      const handle = 'gpu-command-worker'
      const registered = await ask('POST', '/api/agents/started', AS_STARTER(), { handle, name: handle, role: 'worker', workArea: ['src'] })
      expect(registered.status, JSON.stringify(registered.body)).toBe(201)
      const brief = join(scratch, 'gpu-command-brief.md'); writeFileSync(brief, 'Synthetic GPU command brief.\n')
      const binary = join(fakes, 'bin', 'claude'), previous = existsSync(binary) ? readFileSync(binary) : null
      const secrets = join(scratch, 'sandbox-secrets.env')
      writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
      writeFileSync(binary, `#!${process.execPath}\nrequire('fs').readFileSync(0, 'utf8')\n`, { mode: 0o755 })
      try {
        for (const verb of ['worker', 'round']) {
          const ran = await sandbox([verb, NAME, '--agent', handle, '--model', 'claude-opus-5-5', '--brief', brief, '--json'])
          expect(ran.status, ran.err).toBe(0)
          expect(ran.err).toContain('GPU reminder: sandbox other-gpu is already running with a GPU')
          const start = JSON.parse(ran.out.trim()); groups.add(start.hostPgid)
          await until('the GPU worker command to end', () => existsSync(join(upAnswer!.folder, 'logs', start.run, 'finish.log')))
        }
      } finally {
        rmSync(secrets, { force: true })
        if (previous === null) rmSync(binary, { force: true }); else writeFileSync(binary, previous, { mode: 0o755 })
      }
    } finally { gpuContainer(false, false) }
  }, 60_000)
  it('mutation GPU_NON_GPU: a sandbox without a GPU starts a command while another GPU sandbox runs', async () => {
    gpuContainer(true, false)
    try {
      const ran = await sandbox(['exec', NAME, '--wait', '--', 'true']); expect(ran.status, ran.err).toBe(0)
      const up = await sandbox(['up', template, '--name', 'non-gpu', '--from', main, '--no-dsh', '--json'])
      expect(up.status, up.err).toBe(0); expect((await sandbox(['down', 'non-gpu'])).status).toBe(0)
    }
    finally { gpuContainer(false, false) }
  })

  // Mutation GPU_NO_REMINDER: omit the overlap reminder function's body; each advisory case goes red.
  it('GPU overlap reminders name the other sandbox and its current booking, and an unchecked overlap still starts', async () => {
    gpuContainer(true, true)
    try {
      const unbooked = await gpuReminder()
      expect(unbooked.status, unbooked.err).toBe(0)
      expect(unbooked.err).toContain('GPU reminder: sandbox other-gpu is already running with a GPU')
      expect(unbooked.err).toContain('No current booking is recorded for it')

      const made = await ask('POST', '/api/bookings', AS_STARTER(), {
        resource: 'gpu', gib: 3, minutes: 60, purpose: 'Synthetic other GPU job', start: 'now',
      })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      const id = made.body.booking.id
      const program = await ask('POST', `/api/bookings/${id}/program`, AS_STARTER(), { resource: upAnswer!.resource, sandbox: 'other-gpu' })
      expect(program.status, JSON.stringify(program.body)).toBe(200)
      try {
        const booked = await gpuReminder()
        expect(booked.status, booked.err).toBe(0)
        expect(booked.err).toContain(`Current booking ${id}: Synthetic other GPU job, 3 GiB`)
        expect(booked.err).toContain('sandbox other-gpu')
        expect(booked.err).toContain('a GPU overlap is a reminder, never a refusal')
      } finally {
        expect((await ask('POST', `/api/bookings/${id}/cancel`, AS_STARTER())).status).toBe(200)
      }

      setBug('gpuListFails', true)
      try {
        const unchecked = await gpuReminder()
        expect(unchecked.status, unchecked.err).toBe(0)
        expect(unchecked.err).toContain('GPU overlap could not be checked')
        expect(unchecked.err).toContain('synthetic GPU list failure')
        const up = await sandbox(['up', aGpuTemplate('gpu-unchecked'), '--name', 'gpu-unchecked', '--from', main, '--no-dsh'])
        expect(up.status, up.err).toBe(0)
        expect(up.err).toContain('GPU overlap could not be checked')
        expect((await sandbox(['down', 'gpu-unchecked'])).status).toBe(0)
      } finally { setBug('gpuListFails', false) }
    } finally { gpuContainer(false, false) }
  })

  // UP --NO-GPU: a GPU template's container comes up without the GPU, for work that needs no CUDA, so a second GPU template
  // can come up while another sandbox holds the GPU. With the GPU it starts with a reminder.
  const THE_OTHER_ARGS = ['--network=host', '--cap-add=SYS_PTRACE', '--ipc=host']
  /** A copy of the template whose runArgs ask for the GPU in both spellings, between other run arguments. */
  function aGpuTemplate(folder: string): string {
    const own = join(scratch, folder); mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8'))
    config.runArgs = ['--network=host', '--gpus=all', '--cap-add=SYS_PTRACE', '--gpus', 'all', '--ipc=host']
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config))
    return own
  }
  const lastRunArgs = (): string[] => state().calls.filter((c) => c.tool === 'devcontainer').pop()?.runArgs ?? []
  const lastLine = (err: string): string => err.trim().split('\n').pop() ?? ''
  it('mutation NO_GPU_FILTER: up --no-gpu takes every --gpus argument out and keeps every other run argument', async () => {
    const own = aGpuTemplate('no-gpu-filter')
    const ran = await sandbox(['up', own, '--name', 'no-gpu-filter', '--from', main, '--no-dsh', '--no-gpu'])
    expect(ran.status, ran.err).toBe(0)
    const runArgs = lastRunArgs()
    expect(runArgs.filter((a) => a.startsWith('--gpus'))).toEqual([])
    expect(runArgs.slice(0, THE_OTHER_ARGS.length)).toEqual(THE_OTHER_ARGS)
    expect(runArgs).not.toContain('all')
    expect(state().containers['mole-office-sandbox-no-gpu-filter']).toMatchObject({ HostConfig: { DeviceRequests: [] } })
    expect((await sandbox(['down', 'no-gpu-filter'])).status).toBe(0)
  })
  it('mutation NO_GPU_RULE: both GPU starts proceed during an overlap; only the start with a GPU gets the reminder', async () => {
    const own = aGpuTemplate('no-gpu-rule')
    gpuContainer(true, false)
    try {
      const withGpu = await sandbox(['up', own, '--name', 'with-gpu-rule', '--from', main, '--no-dsh'])
      expect(withGpu.status, withGpu.err).toBe(0)
      expect(withGpu.err).toContain('GPU reminder: sandbox other-gpu is already running with a GPU')
      expect((await sandbox(['down', 'with-gpu-rule'])).status).toBe(0)
      const allowed = await sandbox(['up', own, '--name', 'no-gpu-rule', '--from', main, '--no-dsh', '--no-gpu'])
      expect(allowed.status, allowed.err).toBe(0)
      expect(allowed.err).not.toContain('GPU reminder:')
      expect((await sandbox(['exec', 'no-gpu-rule', '--wait', '--', 'true'])).status).toBe(0)
      expect((await sandbox(['down', 'no-gpu-rule'])).status).toBe(0)
    } finally { gpuContainer(false, false) }
  })
  it('mutation NO_GPU_RECORD: instance.json records the GPU left out, and the last line says so', async () => {
    const own = aGpuTemplate('no-gpu-record')
    const ran = await sandbox(['up', own, '--name', 'no-gpu-record', '--from', main, '--no-dsh', '--no-gpu', '--json'])
    expect(ran.status, ran.err).toBe(0)
    const said = 'left out by --no-gpu: the template asks for the GPU, and this container was brought up without it'
    expect(JSON.parse(readFileSync(join(sandboxes, 'no-gpu-record', 'instance.json'), 'utf8')).gpu).toBe(said)
    expect(JSON.parse(ran.out).gpu).toBe(said)
    expect(lastLine(ran.err)).toContain('The template asks for the GPU, and this container was brought up without it (--no-gpu).')
    expect((await sandbox(['down', 'no-gpu-record'])).status).toBe(0)
  })
  it('mutation NO_GPU_NONE_ASKED: --no-gpu on a template that asks for no GPU changes nothing and says so in one line', async () => {
    const ran = await sandbox(['up', template, '--name', 'no-gpu-none', '--from', main, '--no-dsh', '--no-gpu'])
    expect(ran.status, ran.err).toBe(0)
    const own = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')).runArgs as string[]
    expect(lastRunArgs().slice(0, own.length)).toEqual(own)
    expect(JSON.parse(readFileSync(join(sandboxes, 'no-gpu-none', 'instance.json'), 'utf8'))).not.toHaveProperty('gpu')
    expect(ran.err.split('\n').filter((line) => line.includes('--no-gpu'))).toEqual([`sandbox: --no-gpu: the template ${JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8')).template} asks for no GPU, so nothing was left out.`])
    expect(lastLine(ran.err)).not.toContain('GPU')
    expect((await sandbox(['down', 'no-gpu-none'])).status).toBe(0)
  })
  it('mutation NO_GPU_OTHER_VERB: a command other than up given --no-gpu refuses with a sentence before anything runs', async () => {
    const rows = (await ledger()).length, calls = state().calls.length, runs = await theSessionIds()
    for (const args of [
      ['exec', NAME, '--wait', '--', 'true'], ['down', NAME],
    ]) {
      // BEFORE ANY --, where the launcher reads its own options; after it the word would be the command's.
      const at = args.indexOf('--')
      const ran = await sandbox(at === -1 ? [...args, '--no-gpu'] : [...args.slice(0, at), '--no-gpu', ...args.slice(at)])
      expect(ran.status, ran.err).toBe(2)
      expect(ran.err).toContain(`--no-gpu is only for up, which makes the container; ${args[0]} was given it, and nothing was done.`)
    }
    expect((await ledger()).length).toBe(rows); expect(state().calls.length).toBe(calls); expect(await theSessionIds()).toEqual(runs)
    expect(state().containers[CONTAINER]!.State.Running).toBe(true)
  })
})

describe('exec', () => {
  it.each([false, true])('B18 plain starts refresh only an older helper, initially old %s', async older => {
    const action = async (): Promise<void> => {
      const repo = join(upAnswer!.folder, 'repo'), trace = join(scratch, `plain-refresh-${older}.jsonl`)
      const bin = join(scratch, `plain-refresh-${older}-bin`); mkdirSync(bin)
      writeFileSync(join(bin, 'git'), `#!${process.execPath}
const fs=require('node:fs'),{spawnSync}=require('node:child_process'),args=process.argv.slice(2);
const at=args.indexOf('-C'), tail=at!==-1&&args[at+1]===${JSON.stringify(repo)}?args.slice(at+2):[];
const command=tail.find(w=>!w.startsWith('-')), operands=tail.filter(w=>w!==command&&!w.startsWith('-'));
if(command==='fetch' && operands[0]===${JSON.stringify(main)} && operands[1]?.endsWith(':refs/remotes/origin/main')) {
 fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify(args)+'\\n');
 if (${older}) fs.copyFileSync(${JSON.stringify(join(REPO, 'tools', 'sandbox-start.mjs'))},${JSON.stringify(join(repo, 'tools', 'sandbox-start.mjs'))});
 process.exit(0);
}
const ran=spawnSync('/usr/bin/git',args,{stdio:'inherit'});process.exit(ran.status??1);
`, { mode: 0o755 })
      const ran = await sandbox(['exec', NAME, '--wait', '--', 'true'], undefined, { PATH: `${bin}:${theToolsEnvironment()['PATH']}` })
      expect(ran.status, ran.err).toBe(0)
      const calls = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n') : []
      expect(calls).toHaveLength(older ? 1 : 0)
    }
    if (older) await withLegacyCodexHelper(action); else await action()
  })

  const theContractRefusal = (reason: string): string =>
    `This sandbox's helper is older than the launcher's permissions contract (its repo's main could not be moved: ${reason}). Refresh its repo, or recreate the sandbox, then start again.`
  it.each([
    ['fetch failed', (from: string) => theContractRefusal(`the fetch of main from ${from} failed`)],
    ['diverged', (from: string) => theContractRefusal(`main and main in ${from} have diverged`)],
    // A CHECKED-OUT MAIN THAT ITS WORKING TREE STOPS is refused in words of its own, before the contract is read.
    ['dirty main', (from: string, repo: string) => `local main in ${repo} cannot be moved to main of ${from}: `],
  ])('B18 refuses an older helper before side effects and retains refresh reason %s', async (kind, reason) => {
    await withLegacyCodexHelper(async () => {
      const repo = join(upAnswer!.folder, 'repo')
      const bin = join(scratch, `legacy-refresh-${kind.replaceAll(' ', '-')}`); mkdirSync(bin)
      writeFileSync(join(bin, 'git'), `#!${process.execPath}
const {spawnSync}=require('node:child_process'); const args=process.argv.slice(2);
const at=args.indexOf('-C'), tail=at!==-1&&args[at+1]===${JSON.stringify(repo)}?args.slice(at+2):[];
const command=tail.find(w=>!w.startsWith('-')), operands=tail.filter(w=>w!==command&&!w.startsWith('-'));
const kind=${JSON.stringify(kind)};
// THE CHECKOUT'S MAIN IS A COMMIT THE CLONE HAS NOT GOT, so the refresh goes on to its fetch, which fails or is taken as done.
if(at!==-1&&args[at+1]===${JSON.stringify(main)}&&args.slice(at+2).join(' ')==='rev-parse --verify --quiet refs/heads/main^{commit}') { console.log('b'.repeat(40)); process.exit(0); }
if(command==='fetch' && operands.join(' ')===${JSON.stringify(main)}+' +'+'b'.repeat(40)+':refs/remotes/origin/main') process.exit(kind==='fetch failed'?1:0);
// MAIN IS THIS CLONE'S OWN COMMIT, so the dirty case is read from its objects and the clone's files.
if(command==='rev-parse' && operands.join(' ')==='refs/heads/main') {
 const real=spawnSync('/usr/bin/git',['-C',${JSON.stringify(repo)},'rev-parse','--verify','--quiet','refs/heads/main'],{encoding:'utf8'});
 process.stdout.write(real.stdout||''); process.exit(real.status??1);
}
if(command==='merge-base' && tail.includes('--is-ancestor')) process.exit(kind==='diverged'?1:0);
if(command==='symbolic-ref' && operands.join(' ')==='HEAD') { console.log('refs/heads/main'); process.exit(0); }
const ran=spawnSync('/usr/bin/git',args,{stdio:'inherit'});process.exit(ran.status??1);
`, { mode: 0o755 })
      for (const agent of [false, true]) {
        const before = await theSessionIds(), rows = await ledgerState(), callsBefore = state().calls.length
        const ran = await sandbox(['exec', NAME, ...(agent
          ? ['--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--worktree', join(upAnswer!.folder, 'worktrees', WORKER), '--cut-from', 'main'] : []),
          '--', 'codex', 'exec', '--', 'synthetic task'], undefined, { PATH: `${bin}:${theToolsEnvironment()['PATH']}` })
        expect(ran.status).not.toBe(0)
        expect(theRefusalExplanation(ran)).toContain(reason(main, repo))
        if (kind === 'dirty main') expect(theRefusalExplanation(ran)).toContain('so nothing was started or filed')
        expect(await theSessionIds()).toEqual(before)
        expect(await ledgerState()).toEqual(rows)
        expect(state().calls.slice(callsBefore).filter(c => ['exec', 'run', 'create'].includes(c.argv[0]!))).toEqual([])
      }
    })
  })

  it('B18 refuses an explicitly older helper contract before a plain command', async () => {
    await withLegacyCodexHelper(async () => {
      const before = await theSessionIds(), rows = await ledgerState(), callsBefore = state().calls.length
      const ran = await sandbox(['exec', NAME, '--', 'true'])
      expect(ran.status).not.toBe(0)
      expect(theRefusalExplanation(ran)).toContain("This sandbox's helper is older than the launcher's permissions contract")
      expect(await theSessionIds()).toEqual(before); expect(await ledgerState()).toEqual(rows)
      expect(state().calls.slice(callsBefore).filter(c => ['exec', 'run', 'create'].includes(c.argv[0]!))).toEqual([])
    }, 1)
  })

  it.each(['agent', 'run'])('B18 sends checked env Codex argv to the current helper for %s', async mode => {
    await (async () => {
      const seen = join(scratch, `legacy-env-${mode}.json`)
      const native = syntheticCodexCommand(`legacy-env-${mode}`, ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(1)))`, '--'])
      // Replace the generic stand-in with a recorder of its own native arguments.
      writeFileSync(native[0]!, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 })
      const run = mode === 'run' ? (await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'synthetic older-helper run', data: { state: 'running', runtime: 'codex', servingAgent: WORKER, workingDirectory: join(upAnswer!.folder, 'repo') } })).body.record.id : null
      const callsBefore = state().calls.length
      const ran = await sandbox(['exec', NAME, '--json', ...(mode === 'agent'
        ? ['--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--worktree', join(upAnswer!.folder, 'worktrees', WORKER), '--cut-from', 'main']
        : ['--run', run]), '--', 'env', 'SYNTHETIC=value', native[0]!, 'exec', '--', 'synthetic task'])
      expect(ran.status, ran.err).toBe(0)
      groups.add(JSON.parse(ran.out.trim()).hostPgid)
      // The helper's exec, and not a git command that made the run's worktree first.
      const sent = state().calls.slice(callsBefore).find(c => c.tool === 'docker' && c.argv[0] === 'exec' && c.argv.some(word => word.endsWith('/sandbox-start.mjs')))!.argv
      const at = sent.indexOf('--')
      expect(sent.slice(at + 1)).toEqual(['env', 'SYNTHETIC=value', native[0]!, ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task'])
      await until('the older helper native recorder', () => existsSync(seen))
      const theStart = [...CODEX_FEATURES_OFF, ...CODEX_SHELL_SNAPSHOT_OFF, ...FULL_PERMISSIONS.codex!.args, 'exec']
      expect(JSON.parse(readFileSync(seen, 'utf8')).slice(0, theStart.length)).toEqual(theStart)
    })()
  })

  it.each(['worker', 'round'])('B18 sends the checked command to the current helper on %s', async verb => {
    await (async () => {
      const handle = `legacy-codex-${verb}`
      expect((await ask('POST', '/api/agents/started', AS_STARTER(), { handle, name: handle, runtime: 'codex', role: 'worker', workArea: ['src'] })).status).toBe(201)
      const auth = join(upAnswer!.folder, 'home', '.codex', 'auth.json')
      const saved = existsSync(auth) ? readFileSync(auth) : null
      mkdirSync(dirname(auth), { recursive: true }); writeFileSync(auth, '{}\n')
      const bin = join(scratch, `legacy-${verb}-bin`); mkdirSync(bin)
      writeFileSync(join(bin, 'codex'), `#!${process.execPath}\nconsole.log(JSON.stringify({type:'thread.started',thread_id:'12345678-1234-4234-8234-123456789012'}));\n`, { mode: 0o755 })
      const brief = join(scratch, `legacy-${verb}-brief.md`); writeFileSync(brief, 'Synthetic task.\n')
      const start = async (which: string): Promise<any> => {
        const ran = await sandbox([which, NAME, '--agent', handle, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--brief', brief, '--json'], undefined, { PATH: `${bin}:${theToolsEnvironment()['PATH']}` })
        expect(ran.status, ran.err).toBe(0)
        const value = JSON.parse(ran.out.trim()); groups.add(value.hostPgid)
        await until('the synthetic worker to end', () => existsSync(join(dirname(value.out), 'finish.log')) && readFileSync(join(dirname(value.out), 'finish.log'), 'utf8').includes('exited 0'))
        return value
      }
      // THE ROLLOUT CODEX WOULD LEAVE for the thread, in the sandbox's own Codex home, where a round looks for the
      // conversation it continues. The stand-in codex above keeps nothing, so the test writes it; it is synthetic.
      const rollout = join(upAnswer!.folder, 'home', '.codex', 'sessions', '2026', '10', '17', 'rollout-2026-10-17T00-00-00-12345678-1234-4234-8234-123456789012.jsonl')
      try {
        const callsBefore = state().calls.length
        await start('worker')
        if (verb === 'round') {
          mkdirSync(dirname(rollout), { recursive: true })
          writeFileSync(rollout, JSON.stringify({ type: 'session_meta', payload: { id: '12345678-1234-4234-8234-123456789012', synthetic: true } }) + '\n')
          await start('round')
        }
        const exec = state().calls.slice(callsBefore).filter(c => c.tool === 'docker' && c.argv[0] === 'exec').at(-1)!
        const delimiter = exec.argv.indexOf('--')
        expect(exec.argv.slice(delimiter + 1, delimiter + 7)).toEqual(['codex', ...FULL_PERMISSIONS.codex!.args, 'exec'])
      } finally {
        rmSync(rollout, { force: true })
        if (saved === null) rmSync(auth); else writeFileSync(auth, saved)
      }
    })()
  }, 60_000)

  it.each([
    ['sandbox', ['codex', '-s', 'read-only', '-a', 'never', 'exec']],
    ['approval', ['codex', '-s', 'danger-full-access', '-a', 'on-request', 'exec']],
    ['alias', ['codex', '--sandbox', 'danger-full-access', '-a', 'never', 'exec']],
    ['env', ['env', 'SYNTHETIC=value', 'codex', '-s', 'workspace-write', '-a', 'never', 'exec']],
    ['opaque', ['sh', '-c', 'exec codex -s danger-full-access -a never exec']],
  ])('B18 refuses agent %s before hand-run, filing or helper launch', async (_kind, command) => {
    const before = await theSessionIds(), rows = await ledgerState(), callsBefore = state().calls.length
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol',
      '--worktree', join(upAnswer!.folder, 'worktrees', WORKER), '--cut-from', 'main', '--', ...command], undefined, { HOME: join(scratch, 'synthetic-home') })
    expect(ran.status).not.toBe(0)
    expect(ran.err).toMatch(/Codex.*-s danger-full-access -a never.*before exec/)
    expect(await theSessionIds()).toEqual(before)
    expect(await ledgerState()).toEqual(rows)
    expect(state().calls.slice(callsBefore).filter(c => ['exec', 'run', 'create'].includes(c.argv[0]!))).toEqual([])
  })

  it.each([false, true])('B18 refuses plain wrong flags before helper launch, plain-env %s', async plain => {
    for (const command of [
      ['codex', '-s', 'read-only', '-a', 'never', 'exec'],
      ['env', 'SYNTHETIC=value', 'codex', '-s', 'danger-full-access', '-a', 'on-request', 'exec'],
    ]) {
      const before = await theSessionIds(), rows = await ledgerState(), callsBefore = state().calls.length
      const ran = await sandbox(['exec', NAME, '--wait', ...(plain ? ['--plain-env'] : []), '--', ...command], undefined, { HOME: join(scratch, 'synthetic-home') })
      expect(ran.status).not.toBe(0)
      expect(ran.err).toMatch(/Codex.*-s danger-full-access -a never.*before exec/)
      expect(await theSessionIds()).toEqual(before)
      expect(await ledgerState()).toEqual(rows)
      expect(state().calls.slice(callsBefore).filter(c => ['exec', 'run', 'create'].includes(c.argv[0]!))).toEqual([])
    }
  })

  it.each([false, true])('B18 runs opaque plain argv and says it is unverifiable, plain-env %s', async plain => {
    const ran = await sandbox(['exec', NAME, '--wait', '--verbose', ...(plain ? ['--plain-env'] : []), '--', 'sh', '-c', 'printf synthetic-opaque-output'], undefined, { HOME: join(scratch, 'synthetic-home') })
    expect(ran.status, ran.err).toBe(0)
    expect(ran.out).toBe('synthetic-opaque-output')
    expect(ran.err).toContain('Codex container argv is unverifiable')
  })

  it.each([
    ['approval', ['codex', '-s', 'danger-full-access', '-a', 'on-request', 'exec']],
    ['opaque', ['sh', '-c', 'exec codex -s danger-full-access -a never exec']],
  ])('B18 refuses isolated %s before registration or env file', async (_kind, command) => {
    const before = await ledgerState(), callsBefore = state().calls.length
    const ran = await sandbox(['exec', NAME, '--isolated', '--runtime', 'codex', '--run', starterSession, '--cwd', upAnswer!.folder, '--', ...command], undefined, { HOME: join(scratch, 'synthetic-home') })
    expect(ran.status).not.toBe(0)
    expect(ran.err).toMatch(/Codex.*-s danger-full-access -a never.*before exec/)
    expect(await ledgerState()).toEqual(before)
    expect(state().calls.slice(callsBefore).filter(c => ['exec', 'run', 'create'].includes(c.argv[0]!))).toEqual([])
    expect(existsSync(join(upAnswer!.folder, 'out', 'isolated', starterSession, 'home'))).toBe(false)
  })

  it.each(['no-such-box', 'not_a_sandbox'])('a refused exec for %s leaves the instance folders unchanged', async (name) => {
    const before = readdirSync(sandboxes, { recursive: true }).sort()
    const ran = await sandbox(['exec', name, '--', 'true'])
    expect(ran.status).not.toBe(0)
    const details = ran.err.match(/Details: ([^\n]+)/)?.[1]
    expect(details, ran.err).toBeDefined()
    try {
      expect(existsSync(details!)).toBe(true)
      expect(readdirSync(sandboxes, { recursive: true }).sort()).toEqual(before)
      expect(dirname(details!)).toMatch(new RegExp(`^${tmpdir()}/mole-office-launch-`))
      expect(readFileSync(details!, 'utf8')).toContain('sandbox:')
    } finally {
      if (details !== undefined && dirname(details).startsWith(join(tmpdir(), 'mole-office-launch-'))) rmSync(dirname(details), { recursive: true, force: true })
    }
  })

  async function outputOfAPlainStart(flags: string[]) {
    const folder = (upAnswer as { folder: string }).folder
    const before = new Set(readdirSync(join(folder, 'logs')))
    const templatePath = join(template, 'sandbox.json')
    const original = readFileSync(templatePath, 'utf8')
    const office = JSON.parse(original)
    office.secrets.names = []
    writeFileSync(templatePath, JSON.stringify(office))
    let ran: Ran
    try {
      ran = await sandbox(['exec', NAME, ...flags, '--', 'true'])
    } finally {
      writeFileSync(templatePath, original)
    }
    expect(ran.status, ran.err).toBe(0)
    const made = readdirSync(join(folder, 'logs')).find(name => !before.has(name) && existsSync(join(folder, 'logs', name, 'start.json')))
    expect(made, 'the command wrote no folder for its output').toBeDefined()
    const logFolder = join(folder, 'logs', made as string)
    const start = JSON.parse(readFileSync(join(logFolder, 'start.json'), 'utf8'))
    groups.add(start.hostPgid)
    return { ...ran, start, details: join(logFolder, 'launch.txt') }
  }

  it('keeps designed template secret omissions in details when a plain command requests none', async () => {
    const office = JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8'))
    const names = office.secrets.names.map((one: { name: string }) => one.name)
    expect(names.length).toBeGreaterThan(0)
    for (const flags of [[], ['--plain-env']]) {
      const ran = await sandbox(['exec', NAME, ...flags, '--', 'true'])
      expect(ran.status, ran.err).toBe(0)
      expect(ran.err).not.toContain('Secrets named but not passed:')
      const details = ran.out.match(/details (.+)/)?.[1]
      expect(details, 'the launch named no details file').toBeDefined()
      for (const name of names) expect(readFileSync(details!, 'utf8')).toContain(name)
    }
  })

  it('prints one line for a successful launch and keeps its explanations beside its output', async () => {
    const ran = await outputOfAPlainStart([])
    const lines = (ran.out + ran.err).trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(String(ran.start.hostPid))
    expect(lines[0]).toContain(NAME)
    expect(lines[0]).toContain(ran.start.out)
    expect(lines[0]).toContain(ran.details)
    expect(readFileSync(ran.details, 'utf8')).toContain('no secret was passed: a plain command gets only the secrets named with --secret.')
  })

  it('prints the full launch explanations when verbose is requested', async () => {
    const ran = await outputOfAPlainStart(['--verbose'])
    expect(ran.err).toContain('no secret was passed: a plain command gets only the secrets named with --secret.')
    expect(readFileSync(ran.details, 'utf8')).toContain('no secret was passed: a plain command gets only the secrets named with --secret.')
  })

  // A new OpenCode setting may add its notice to this same line. Other waited starts keep these fields.
  it('prints one line for a waited command without a new OpenCode setting, and keeps its started object in details', async () => {
    const ran = await outputOfAPlainStart(['--wait'])
    expect((ran.out + ran.err).trim().split('\n')).toHaveLength(1)
    expect(ran.out + ran.err).toContain(ran.details)
    const prefix = 'sandbox-start: started '
    const lines = (ran.out + ran.err).trim().split('\n')
    expect(lines[0]).toMatch(/^sandbox-start: started \{/u)
    expect(JSON.parse(lines[0]!.slice(prefix.length))).toEqual({
      run: ran.start.run,
      hostPid: ran.start.hostPid,
      hostPgid: ran.start.hostPgid,
      processRow: ran.start.processRow,
      details: ran.details,
    })
    const details = readFileSync(ran.details, 'utf8')
    expect(details).toContain(`started ${JSON.stringify(ran.start)}`)
  })

  it('prints the waited command started object with verbose', async () => {
    const ran = await outputOfAPlainStart(['--wait', '--verbose'])
    expect(ran.err).toContain(`started ${JSON.stringify(ran.start)}`)
  })

  async function mergeClassifiers() {
    const argv = process.argv
    process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-entry', '--session', starterSession,
      '--workdir', join(scratch, 'merge-classifier'), '--api', api]
    try {
      return {
        ...(await import('../tools/merge-tool/red-files.mjs')),
        ...(await import('../tools/merge-tool/office-keeper.mjs')),
      }
    } finally {
      process.argv = argv
    }
  }

  it.each([1, 75])('keeps a waited command exiting %i distinguishable from a launcher refusal', async code => {
    const ran = await sandbox(['exec', NAME, '--wait', '--', 'sh', '-c', `exit ${code}`])
    expect(ran.status, ran.err).toBe(code)
    const outFile = join(scratch, `waited-exit-${code}.out`)
    writeFileSync(outFile, ran.out + ran.err)
    const classifiers = await mergeClassifiers()
    expect.soft(classifiers.whyARunGaveNoResult({ code: ran.status, outFile })).toBeNull()
    expect.soft(classifiers.theLauncherHadNoRoom({ code: ran.status, outFile })).toBeNull()
  })

  it('keeps a stopped sandbox refusal distinguishable from a started waited command', async () => {
    const before = state()
    const stopped = state()
    stopped.containers[CONTAINER]!.State.Running = false
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(stopped))
    try {
      const ran = await sandbox(['exec', NAME, '--wait', '--', 'true'])
      expect(ran.status).not.toBe(0)
      const outFile = join(scratch, 'waited-refusal.out')
      writeFileSync(outFile, ran.out + ran.err)
      const classifiers = await mergeClassifiers()
      expect(classifiers.whyARunGaveNoResult({ code: ran.status, outFile })).toBe('the launcher never started the command')
    } finally {
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(before))
    }
  })

  it('keeps a warning about an option that changes nothing visible by default', async () => {
    const ran = await outputOfAPlainStart(['--agent', WORKER, '--runtime', 'opencode', '--model', 'deepseek/deepseek-v4.1-flash', '--starts-runs'])
    expect(ran.err).toContain('--starts-runs changes nothing for a true command: only Codex and Claude Code commands have their key taken out of their shell.')
    expect(readFileSync(ran.details, 'utf8')).toContain('--starts-runs changes nothing')
  })

  // RATbb8xNemOW / IcgsA-OGvbzL. Mutations, each alone: starts-runs removed from exec's helper switches; the snapshot switch taken out.
  it('passes --starts-runs to the helper for a Codex agent run, which keeps the key in its commands and writes no shell snapshot', async () => {
    const answer = upAnswer as { folder: string }
    const bin = join(scratch, 'a-codex-stand-in')
    const seen = join(answer.folder, 'out', 'codex-starts-runs.json')
    mkdirSync(bin)
    writeFileSync(join(bin, 'codex'), `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(2))); setInterval(() => {}, 1000)\n`)
    chmodSync(join(bin, 'codex'), 0o755)
    const before = state().calls.length
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--starts-runs', '--verbose', '--json',
      '--', 'codex', 'exec', 'synthetic prompt',
    ], undefined, { PATH: `${bin}:${theToolsEnvironment()['PATH']}` })
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { hostPgid: number; processRow: string }
    groups.add(start.hostPgid)
    const exec = state().calls.slice(before).find((c) => c.tool === 'docker' && c.argv[0] === 'exec')!
    const helperAt = exec.argv.findIndex((word) => word.endsWith('/sandbox-start.mjs'))
    expect(exec.argv.slice(helperAt + 1, exec.argv.indexOf('--'))).toContain('--starts-runs')
    expect(ran.err).toContain("--starts-runs: Codex's commands keep MOLE_AGENT_KEY, because this run starts runs.")
    await until('the Codex stand-in to run', () => existsSync(seen))
    expect(readFileSync(seen, 'utf8')).not.toContain('shell_environment_policy')
    expect(readFileSync(seen, 'utf8')).toContain('mcp_servers.mole_office.env_vars=')
    // f_hnh472ssVM: the commands keep the key here, so no shell snapshot may write it to disk.
    expect(readFileSync(seen, 'utf8')).toContain('features.shell_snapshot=false')
    expect((await releaseRow(start.processRow)).status).toBe(200)
  }, 60_000)

  // Mutation: exec's starts-runs/plain-env refusal removed; the helper may refuse but docker must not start.
  it('refuses --starts-runs with --plain-env before filing a run or calling docker exec', async () => {
    const before = state().calls.length
    const sessions = await theSessionIds()
    const ran = await sandbox(['exec', NAME, '--starts-runs', '--plain-env', '--', 'true'])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('--starts-runs cannot be used with --plain-env: such a command holds no key.')
    expect(state().calls.slice(before).some((c) => c.tool === 'docker' && c.argv[0] === 'exec')).toBe(false)
    expect(await theSessionIds()).toEqual(sessions)
  })

  // Mutation: exec's starts-runs/isolated refusal removed; the filed run reaches docker create and start.
  it('refuses --starts-runs with --isolated before filing a run or starting a container', async () => {
    const answer = upAnswer as { folder: string }
    const before = state().calls.length
    const sessions = await theSessionIds()
    // Age advances between reads; every other field and the row order must stay unchanged.
    const rows = (await ledger()).map(({ age, ...row }) => row)
    const ran = await sandbox([
      'exec', NAME, '--starts-runs', '--isolated', '--runtime', 'dsh', '--run', starterSession,
      '--cwd', join(answer.folder, 'repo'), '--', 'true',
    ])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('--starts-runs cannot be used with --isolated: an isolated run holds no office variable and no key, so there is nothing to keep.')
    expect(state().calls.slice(before).some((c) => c.tool === 'docker' && ['exec', 'create', 'start'].includes(c.argv[0]!))).toBe(false)
    expect(await theSessionIds()).toEqual(sessions)
    expect((await ledger()).map(({ age, ...row }) => row)).toStrictEqual(rows)
  })

  // Mutation: exec's starts-runs/own-command refusal removed; the helper may refuse but docker must not start.
  it('refuses --starts-runs without --agent or --run before filing a run or calling docker exec', async () => {
    const before = state().calls.length
    const sessions = await theSessionIds()
    // Age advances between reads; every other field and the row order must stay unchanged.
    const rows = (await ledger()).map(({ age, ...row }) => row)
    const ran = await sandbox(['exec', NAME, '--starts-runs', '--', 'true'])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain("--starts-runs needs an agent's run (--agent or --run): a plain command holds no run key, so there is nothing to keep.")
    expect(state().calls.slice(before).some((c) => c.tool === 'docker' && c.argv[0] === 'exec')).toBe(false)
    expect(await theSessionIds()).toEqual(sessions)
    expect((await ledger()).map(({ age, ...row }) => row)).toStrictEqual(rows)
  })

  it('starts nothing in a container that still has something mounted inside a folder it covers', async () => {
    // WHAT A SANDBOX STARTED BEFORE FINDING 13 LOOKS LIKE TO DOCKER: its container keeps the key
    // file mounted inside the covered data folder, whatever the template says now.
    const withTheKeyFile = (on: boolean): void => {
      const now = state()
      const c = now.containers[CONTAINER] as unknown as { Mounts: { Type: string; Source: string; Destination: string; RW: boolean }[] }
      const file = join(main, 'data', 'keys.json')
      c.Mounts = c.Mounts.filter((m) => m.Destination !== file)
      if (on) c.Mounts.push({ Type: 'bind', Source: file, Destination: file, RW: false })
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    }
    withTheKeyFile(true)
    try {
      const rows = (await ledger()).length
      const execs = state().calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length
      const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--', 'true'])
      expect(ran.status, ran.err).toBe(1)
      expect(ran.err).toContain(`${join(main, 'data', 'keys.json')} is mounted (bind) inside ${join(main, 'data')}`)
      expect(theRefusalExplanation(ran)).toContain(`node tools/sandbox.mjs down ${NAME}`)
      expect(state().calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length, 'docker exec was run').toBe(execs)
      expect((await ledger()).length, 'something was registered').toBe(rows)
    } finally {
      withTheKeyFile(false)
    }
  })

  // A CONTAINER THAT CAN WRITE THE SPOOL (wave 13n round Y, item 2l): docker's own account of its mounts is asked, as it is
  // for a covered folder, so a sandbox started before the rule is found too.
  it('starts nothing in a container that can write the gate-count spool', async () => {
    const spool = theTestsOwnSpool()
    const withTheSpool = (on: boolean): void => {
      const now = state()
      const c = now.containers[CONTAINER] as unknown as { Mounts: { Type: string; Source: string; Destination: string; RW: boolean }[] }
      c.Mounts = c.Mounts.filter((m) => m.Destination !== '/a-made-up-spool')
      if (on) c.Mounts.push({ Type: 'bind', Source: spool, Destination: '/a-made-up-spool', RW: true })
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    }
    withTheSpool(true)
    try {
      const rows = (await ledger()).length
      const execs = state().calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length
      const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--', 'true'])
      expect(ran.status, ran.err).toBe(1)
      const said = theRefusalExplanation(ran)
      expect(said).toContain(`the bind of ${spool} at /a-made-up-spool, which is the gate-count spool ${spool}, is not read-only`)
      expect(said).toContain(`node tools/sandbox.mjs down ${NAME}`)
      expect(state().calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length, 'docker exec was run').toBe(execs)
      expect((await ledger()).length, 'something was registered').toBe(rows)
    } finally {
      withTheSpool(false)
    }
  })

  // MUTATION: default parentAttachment no longer --session → the run's parent assertion red.
  it('files the run with its sandbox field and starts the command as its own process group, which the ledger holds', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const worktree = join(answer.folder, 'worktrees', WORKER)
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', worktree, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', 'sleep 300 & sleep 300; wait',
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)

    // THE COMMAND LEADS ITS OWN GROUP, and that host group is what the ledger holds.
    expect(start.hostPgid, 'the command is not the leader of its own process group').toBe(start.hostPid)
    expect(alive(start.hostPid)).toBe(true)
    const row = (await ledger()).find((r) => r.id === start.processRow)
    expect(row).toMatchObject({ type: 'process', key: String(start.hostPid), pgid: start.hostPgid, sessionRecordId: start.run })
    expect(row.detail).toContain(`pid ${start.innerPid} inside container ${CONTAINER}`)

    // THE RUN: filed as the starter's child, serving the worker, with the sandbox it happens in.
    const record = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(record.kind).toBe('session')
    expect(record.data).toMatchObject({
      state: 'running',
      servingAgent: WORKER,
      parentAttachment: starterSession,
      workingDirectory: worktree,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: answer.resource },
    })

    // WHAT THE COMMAND WAS GIVEN, and where its facts were written.
    await until('the command to be past its gate', () => !readFileSync(`/proc/${start.hostPid}/cmdline`, 'utf8').includes('sandbox-gate'))
    const environ = readFileSync(`/proc/${start.hostPid}/environ`, 'utf8').split('\0')
    expect(environ).toContain(`MOLE_OFFICE_SESSION=${start.run}`)
    expect(environ).toContain(`MOLE_OFFICE_AGENT=${WORKER}`)
    expect(environ).toContain(`SANDBOX_PROCESS_ROW=${start.processRow}`)
    expect(environ).toContain(`SANDBOX_DIR=${answer.folder}`)
    // THE OFFICE'S ADDRESS IS FOR THIS SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC): the helper names the folder beside
    // it. Mutation HELPER_GIVES_NO_ROOT: the helper sets no MOLE_OFFICE_API_ROOT, and this goes red.
    expect(environ).toContain(`MOLE_OFFICE_API_ROOT=${answer.folder}`)
    // THE GIT IDENTITY: the worker's own name, and the office's one commit address. The owner's own
    // address is in their .env (a decision of 22 September 2026); the product's default reaches
    // nobody (FLO-03 of a decision, 30 September 2026). It was
    // `<handle>@mole-office.local` before, which outranked the address an agent set in git config. Here it is
    // the test address this file gives the tool.
    expect(settingNamed('MOLE_OFFICE_COMMIT_EMAIL')?.fallback, 'an address that reaches nobody, FLO-03').toBe('mole-office@example.invalid')
    const address = theToolsEnvironment()['MOLE_OFFICE_COMMIT_EMAIL']
    for (const line of [`GIT_AUTHOR_NAME=${WORKER}`, `GIT_AUTHOR_EMAIL=${address}`, `GIT_COMMITTER_NAME=${WORKER}`, `GIT_COMMITTER_EMAIL=${address}`]) {
      expect(environ).toContain(line)
    }
    expect(readlinkSync(`/proc/${start.hostPid}/cwd`)).toBe(worktree)
    expect(JSON.parse(readFileSync(join(answer.folder, 'logs', start.run, 'start.json'), 'utf8'))).toMatchObject({
      processRow: start.processRow,
      hostPgid: start.hostPgid,
      cwd: worktree,
    })

    // RELEASING THE ROW ENDS EVERY PROCESS IN THE GROUP, the one inside and its child alike.
    const members = itAndItsChildren(start.hostPid)
    expect(members.length, 'the command and its child').toBeGreaterThanOrEqual(2)
    const released = await releaseRow(start.processRow)
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    await until('the whole group to be gone', () => !theGroupLives(start.hostPgid))
    for (const pid of members) expect(alive(pid), `pid ${pid} of the released group`).toBe(false)
  })

  // c3p75p8aALd2. MUTATIONS: exec or fileARun drops --parent, or --parent ignored in register-a-run
  // → parent assertion red; request header written from --parent → attribution assertion red.
  it('exec --parent passes through fileARun and leaves the create attributed to the filer session', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const parent = await ask('POST', '/api/records', AS_STARTER(), {
      kind: 'session', title: 'the supervisor run apart from the filer', data: { state: 'running' },
    })
    expect(parent.status, JSON.stringify(parent.body)).toBe(201)
    const parentId = parent.body.record.id
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--parent', parentId, '--worktree', join(answer.folder, 'worktrees', WORKER), '--cut-from', 'main', '--json',
      '--', 'sleep', '300',
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    const record = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(record.data.parentAttachment).toBe(parentId)
    expect(t.client.sqlite.prepare("SELECT session_id FROM changes WHERE record_id = ? AND op = 'create'").get(start.run)).toEqual({ session_id: starterSession })
    const released = await releaseRow(start.processRow)
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    await until('the parented command to end', () => !theGroupLives(start.hostPgid))
  })

  // MUTATION: remove --parent refusals → a command with no run is started, or the specific refusal disappears.
  it.each([
    { kind: 'plain command', flags: [] },
    { kind: 'already filed run', flags: ['--run', 'already-filed'] },
    { kind: 'isolated run', flags: ['--isolated', '--run', 'already-filed', '--runtime', 'dsh'] },
    { kind: 'waited agent', flags: ['--agent', WORKER, '--runtime', 'dsh', '--wait'] },
    { kind: 'plain-env agent', flags: ['--agent', WORKER, '--runtime', 'dsh', '--plain-env'] },
    { kind: 'agent with an existing run', flags: ['--agent', WORKER, '--runtime', 'dsh', '--run', 'already-filed'] },
    { kind: 'agent with no command', flags: ['--agent', WORKER, '--runtime', 'opencode'], noCommand: true },
  ])('exec refuses --parent for a $kind where no run is filed', async ({ flags, noCommand }) => {
    const callsBefore = state().calls.length
    const before = await theSessionIds()
    const ran = await sandbox(['exec', NAME, '--parent', starterSession, ...flags, ...(noCommand ? [] : ['--', 'true'])])
    expect(ran.status).toBe(2)
    expect(ran.err).toContain('--parent needs')
    expect(ran.err).toContain('file')
    expect(await theSessionIds()).toEqual(before)
    expect(state().calls.slice(callsBefore).filter((c) => c.argv[0] === 'exec' || c.argv[0] === 'run')).toEqual([])
  })

  it('starts a dsh agent through run-agent.sh, with the instance\'s own dsh folder and a brief copied in', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const brief = join(scratch, 'the-brief.md')
    writeFileSync(brief, '# The brief\nFind the files.\n')
    // THE KEY, IN THE SANDBOXES' SECRETS FILE, which the launcher passes to a dsh run alone (problem epOLxauSbzd9): no
    // copy of dsh's env file is in the instance any more.
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'DEEPSEEK_API_KEY=not-a-real-key-from-the-secrets-file\n', { mode: 0o600 })
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--brief', brief, '--json'])
    rmSync(secrets)
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    const seen = join(answer.folder, 'out', 'fake-dsh.json')
    await until('dsh to be started', () => existsSync(seen)).catch((why) => {
      const logs = join(answer.folder, 'logs', start.run)
      const read = (f: string): string => (existsSync(join(logs, f)) ? readFileSync(join(logs, f), 'utf8') : '(none)')
      throw new Error(`${String(why)}\n--- out:\n${read('out')}\n--- dsh.log:\n${read('dsh.log')}`)
    })
    const dshRan = JSON.parse(readFileSync(seen, 'utf8'))
    rmSync(seen)

    // THE BRIEF is read from inside the sandbox, where the one given could not be. The helper writes it again in the
    // run's own log folder with the starting words first, because this checkout's run-agent.sh gives dsh the switch.
    const inside = dshRan.argv[dshRan.argv.length - 1]
    expect(inside.startsWith(join(answer.folder, 'logs', start.run))).toBe(true)
    expect(readFileSync(inside, 'utf8')).toBe(`${THE_STARTING_WORDS}\n\n---\n\n# The brief\nFind the files.\n`)
    expect(dshRan.argv.slice(0, 2)).toEqual(['--profile', 'office'])
    // THE INSTANCE'S OWN dsh HOME, and the key the launcher passed to this dsh run, not one read from a file.
    expect(dshRan.env.DSH_HOME).toBe(join(answer.folder, 'dsh', 'home'))
    expect(dshRan.env.DEEPSEEK_API_KEY).toBe('not-a-real-key-from-the-secrets-file')
    // THE RUN'S IDENTITY, as run-agent.sh exports it for the dsh hooks.
    expect(dshRan.env).toMatchObject({ MOLE_OFFICE_AGENT: WORKER, MOLE_OFFICE_SESSION: start.run, MOLE_OFFICE_WORKSPACE: WORKSPACE })
    // A run given no --worktree works in its agent's own worktree.
    expect(dshRan.cwd).toBe(join(answer.folder, 'worktrees', WORKER))
    // FULL PERMISSIONS, BECAUSE IT IS IN A SANDBOX: dsh's own, and
    // OpenCode's for anything the agent starts in turn.
    expect(dshRan.env.DSH_PERMISSION_MODE).toBe('danger-full-access')
    expect(dshRan.env.OPENCODE_PERMISSION).toBe('{"bash":"allow","edit":"allow","webfetch":"allow"}')
    expect(existsSync(join(answer.folder, 'logs', start.run, 'dsh.log'))).toBe(true)
    // The clone's own run-agent.sh. (Here the clone's tools/ is a link to this checkout's, which is
    // why the two are compared as the files they are.)
    expect(start.command[0]).toBe('bash')
    expect(realpathSync(start.command[1])).toBe(realpathSync(join(answer.folder, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh')))
    // ITS SCRATCH FOLDER GOES ONCE THE HELPER HAS DECIDED ABOUT IT: every fake container shares one /tmp, and each later
    // waited start would sweep it, two seconds an ask.
    const finished = join(answer.folder, 'logs', start.run, 'finish.log')
    await until('the helper to decide about the scratch folder', () => existsSync(finished) && readFileSync(finished, 'utf8').includes(`scratch folder ${start.scratch} `))
    rmSync(start.scratch, { recursive: true, force: true })
  })

  it('gives a claude somebody starts in a sandbox its full-permission flag after the office MCP flag', async () => {
    // A DECISION: every tool in a sandbox runs with its full permissions, and the helper is the launcher that knows a
    // command is in one. A program called `claude` that is not Claude Code: it writes down
    // what it was given, in the sandbox's out/, and stops.
    const answer = upAnswer as { container: string; resource: string; folder: string }
    writeFileSync(
      join(fakes, 'bin', 'claude'),
      `#!/usr/bin/env node\nrequire('fs').writeFileSync(process.env.SANDBOX_DIR + '/out/fake-claude.json', JSON.stringify({ argv: process.argv.slice(2), env: process.env }))\n`,
      { mode: 0o755 },
    )
    // A LOGIN, since a Claude Code command with none is refused before it starts (acceptance finding 47).
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const ran = await sandbox(['exec', NAME, '--verbose', '--json', '--secret', 'CLAUDE_CODE_OAUTH_TOKEN', '--', 'claude', '-p', 'hello', '--model', 'claude-opus-5-5'])
    rmSync(secrets)
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    const seen = join(answer.folder, 'out', 'fake-claude.json')
    await until('claude to be started', () => existsSync(seen))
    const claudeRan = JSON.parse(readFileSync(seen, 'utf8'))
    rmSync(seen)
    const mcpFlag = AN_MCP_FLAG
    expect(claudeRan.argv).toEqual([mcpFlag, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', 'hello', '--model', 'claude-opus-5-5', '--effort', 'xhigh'])
    expect(claudeRan.env.DSH_PERMISSION_MODE).toBe('danger-full-access')
    // AND IT KEEPS ITS BACKGROUND WORKERS past its last turn (Wmh9FIxtcUTw: Claude Code 2.1.281 killed round 34's at
    // 600 s). Mutation BG_ENV: the -e not passed, and this goes red.
    expect(claudeRan.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS).toBe('0')
    // AND IT COMPACTS AT 200,000 TOKENS (hzskk7OFphee). Mutation COMPACT_ENV: the -e not passed, and this goes red.
    expect(claudeRan.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000')
    // THE COMMAND AS IT RAN, where a person reads it afterwards, and the sentence that says why.
    expect(start.command).toEqual(['claude', mcpFlag, ...CLAUDE_CODE_FEATURES_OFF, '--permission-mode', 'bypassPermissions', '-p', 'hello', '--model', 'claude-opus-5-5', '--effort', 'xhigh'])
    expect(ran.err).toContain('--permission-mode bypassPermissions was put after claude')
  })

  it('writes the sandbox field of a run filed elsewhere, and refuses a run that names another sandbox', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const filed = await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'a run filed before its sandbox', data: { state: 'running' } })
    const run = filed.body.record.id
    const ran = await sandbox(['exec', NAME, '--run', run, '--json', '--', 'sleep', '300'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(start.run).toBe(run)
    expect((await ledger()).find((r) => r.id === start.processRow)?.sessionRecordId).toBe(run)
    // AND ITS FOLDER, as the launcher was given it and resolved, never the `dir` written inside instance.json:
    // a files seal reads it to say where the run could not have written (A2 of a decision).
    expect((await ask('GET', `/api/records/${run}`, AS_STARTER())).body.record.data.sandbox).toEqual({ template: 'mole-office-dev', container: answer.resource, folder: realpathSync(answer.folder) })
    expect((await releaseRow(start.processRow)).status).toBe(200)

    // A RUN IS IN ONE SANDBOX: one that already names another is refused, and nothing is started.
    const elsewhere = await ask('POST', '/api/records', AS_STARTER(), {
      kind: 'session',
      title: 'a run in another sandbox',
      data: { state: 'running', sandbox: { template: 'mole-office-dev', container: 'another-row' } },
    })
    const before = (await ledger()).length
    const refused = await sandbox(['exec', NAME, '--run', elsewhere.body.record.id, '--', 'sleep', '300'])
    expect(refused.status, refused.err).toBe(1)
    expect(theRefusalExplanation(refused)).toContain('A run is in one sandbox')
    expect((await ledger()).length).toBe(before)
  })

  // ACCEPTANCE FINDING 53 (report EnJvvsDTF_Dx, block f-53): with --run, the command is the run's own agent, whatever
  // the caller's shell says, and a run that names no agent gets none, never the caller's.
  // MUTATION PROOF, 23 September 2026, each alone: the caller's identity given to a --run command again, and this goes
  // red on MOLE_OFFICE_AGENT; the caller's identity left in for a run that names none, and it goes red on the second run.
  it("gives a --run command the run's own agent and session, not the caller's", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const envOf = (file: string): Record<string, string> =>
      Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    const served = (await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'a run its agent serves', data: { state: 'running', servingAgent: WORKER } })).body.record.id
    const seen = join(answer.folder, 'out', 'run-identity.txt')
    const ran = await sandbox(['exec', NAME, '--run', served, '--json', '--', 'sh', '-c', `env > ${seen}`])
    expect(ran.status, ran.err).toBe(0)
    groups.add(JSON.parse(ran.out.trim()).hostPgid)
    await until('the command to write its environment', () => existsSync(seen) && readFileSync(seen, 'utf8').includes('MOLE_OFFICE_SESSION='))
    const env = envOf(seen)
    expect(env['MOLE_OFFICE_AGENT']).toBe(WORKER)
    expect(env['MOLE_OFFICE_SESSION']).toBe(served)
    expect(env['GIT_AUTHOR_NAME']).toBe(WORKER)
    // AND THE INSTANCE'S OWN dsh FOLDER, which a second round of a dsh agent started with --run needs (acceptance finding
    // 68): without it, run-agent.sh fell back to the host's folder and ended at once with exit 127.
    expect(env['MOLE_OFFICE_DSH_DIR']).toBe(join(answer.folder, 'dsh'))

    // A RUN THAT NAMES NO AGENT: its command gets none, and never the caller's.
    const nobody = (await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'a run nobody serves', data: { state: 'running' } })).body.record.id
    const seen2 = join(answer.folder, 'out', 'run-identity-2.txt')
    const ran2 = await sandbox(['exec', NAME, '--run', nobody, '--json', '--', 'sh', '-c', `env > ${seen2}`])
    expect(ran2.status, ran2.err).toBe(0)
    groups.add(JSON.parse(ran2.out.trim()).hostPgid)
    await until('the second command to write its environment', () => existsSync(seen2) && readFileSync(seen2, 'utf8').includes('MOLE_OFFICE_SESSION='))
    expect(Object.keys(envOf(seen2))).not.toContain('MOLE_OFFICE_AGENT')
    expect(envOf(seen2)['MOLE_OFFICE_SESSION']).toBe(nobody)
    expect(ran2.err).toContain('names no agent that serves it')
  }, 60_000)

  // PROBLEM _ELVBQk9HWLA: every worker of one sandbox runs in the same container, so /tmp was one folder for all of
  // them, and on 24 September one worker read another's report where it had written its own.
  it("gives each run's command a scratch folder of its own as its TMPDIR, and takes it back when it is left empty", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const envOf = (file: string): Record<string, string> =>
      Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    // THE CONTAINER'S OWN TEMPORARY FOLDER, which the stand-in keeps in this test's fakes folder; a real one's is /tmp.
    const containers = join(fakes, 'tmp')
    const runs: { id: string; scratch: string }[] = []
    for (const leaves of [false, true]) {
      const id = String((await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: `a run in a sandbox, ${leaves ? 'leaving' : 'not leaving'} a file`, data: { state: 'running', servingAgent: WORKER } })).body.record.id)
      const seen = join(answer.folder, 'out', `scratch-${id}.txt`)
      // THE COMMAND SAYS WHETHER ITS FOLDER WAS THERE, and the second leaves a file in it.
      const script = `env > ${seen}.part; test -d "$TMPDIR" && echo THERE=yes >> ${seen}.part; ${leaves ? 'echo kept > "$TMPDIR/left.txt"; ' : ''}mv ${seen}.part ${seen}`
      const ran = await sandbox(['exec', NAME, '--run', id, '--json', '--', 'sh', '-c', script])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim()) as { hostPgid: number; scratch?: string | null }
      groups.add(start.hostPgid)
      await until('the command to write its environment', () => existsSync(seen))
      const env = envOf(seen)
      expect(env['THERE'], 'the command was given no scratch folder, or it was not there while it ran').toBe('yes')
      const scratch = env['TMPDIR'] as string
      expect(start.scratch, 'start.json does not name the folder the command was given').toBe(scratch)
      // IN THE CONTAINER'S TEMPORARY FOLDER ITSELF, UNDER A SHORT NAME: a browser makes its socket in it, and a Unix
      // socket's path may not pass 107 bytes, which the instance's long log folder would.
      expect(dirname(scratch), `${scratch} is not in the container's temporary folder`).toBe(containers)
      expect(basename(scratch).startsWith(`${id}-`), `${scratch} is not named after its run`).toBe(true)
      expect(Buffer.byteLength(basename(scratch))).toBeLessThanOrEqual(20)
      runs.push({ id, scratch })
    }
    expect(runs[0]!.scratch, 'two runs were given the same scratch folder').not.toBe(runs[1]!.scratch)
    // TAKEN BACK WHEN THE COMMAND LEFT IT EMPTY, and kept with what the other left in it once that run has ended.
    await until('the empty scratch folder to be taken back', () => !existsSync(runs[0]!.scratch))
    // THE HELPER HAS DECIDED ABOUT THE SECOND FOLDER when the run's finish.log names it; the run is orphaned, so it stays.
    const secondLog = join(answer.folder, 'logs', runs[1]!.id, 'finish.log')
    await until("the helper to decide about the second run's folder", () => existsSync(secondLog) && readFileSync(secondLog, 'utf8').includes(`scratch folder ${runs[1]!.scratch} `))
    expect(readFileSync(join(runs[1]!.scratch, 'left.txt'), 'utf8')).toBe('kept\n')
    // READ, SO IT GOES: each later waited start in any fake container would sweep it, two seconds an ask.
    rmSync(runs[1]!.scratch, { recursive: true })
    // A COMMAND WITH NO RUN keeps the container's temporary folder, and start.json names no scratch folder.
    const own = await sandbox(['exec', NAME, '--json', '--', 'true'])
    expect(own.status, own.err).toBe(0)
    const ownStart = JSON.parse(own.out.trim()) as { hostPgid: number; scratch?: string | null }
    groups.add(ownStart.hostPgid)
    expect(ownStart.scratch).toBeNull()
  }, 60_000)



// PROBLEM D2xgnX8nFixv, 27 SEPTEMBER 2026: once the key window is closed the office refuses every write with no key,
  // and the helper inside holds none for a command that is no run, so the inspector's check stopped at its first command.
  // The row of every command a caller runs as its own is now written here, on the host, waited for or not (the case at
  // the end of this file shows it with the window closed). MUTATION PROOF (the report of the run that added this case):
  // --handshake passed only for --wait --plain-env again, in tools/sandbox.mjs, and this goes red on the handshake folder.
  it("writes the row of the caller's own command that does not wait from the host, as the inspector's commands run", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const seen = join(answer.folder, 'out', 'own-and-not-waited-for.txt')
    const ran = await sandbox(['exec', NAME, '--json', '--no-office-variables', '--', 'sh', '-c', `echo ran > ${seen}`])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { run: string | null; processRow: string; innerPid: number; hostPgid: number }
    groups.add(start.hostPgid)
    expect(start.run).toBeNull()
    await until('the command to run', () => existsSync(seen))
    const handshakes = join(answer.folder, 'handshakes')
    const shook = (existsSync(handshakes) ? readdirSync(handshakes) : [])
      .map((one) => join(handshakes, one))
      .find((one) => existsSync(join(one, 'row.json')) && JSON.parse(readFileSync(join(one, 'row.json'), 'utf8')).id === start.processRow)
    expect(shook, "no handshake folder holds this command's row, so the helper filed it itself, with no key").toBeDefined()
    expect(JSON.parse(readFileSync(join(shook!, 'pid.json'), 'utf8'))).toMatchObject({ pidInContainer: start.innerPid })
  }, 60_000)

  // AN ERROR NOBODY EXPECTED, AFTER THE SCRATCH FOLDER IS MADE AND BEFORE THE COMMAND IS TOLD TO GO (the inspector's note
  // on run jOa3eApRYoo-): a refusal took the folder back, and a throw left it. The helper's test switch
  // (SANDBOX_THROW_AFTER_THE_SCRATCH_FOLDER) throws right after making it, in a temporary folder of this case's own, so
  // nothing another case starts is counted. MUTATION PROOF, 27 September 2026 (the report of the run that added this
  // case): the exit listener taken out of aScratchFolder, and this goes red on the folder left behind.
  it("takes a run's scratch folder back when its helper ends on an error nobody expected before the command goes", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const own = join(scratch, 'tmp-of-a-throw')
    mkdirSync(own, { recursive: true })
    const id = String((await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'a run whose helper throws after making its scratch folder', data: { state: 'running', servingAgent: WORKER } })).body.record.id)
    const helper = await new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession,
          '--workspace', WORKSPACE, '--api', api, '--run', id, '--', 'true',
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder), TMPDIR: own, SANDBOX_THROW_AFTER_THE_SCRATCH_FOLDER: '1' }, 'the-throw-after-the-scratch-folder'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    // A HELPER THAT HOLDS NO KEY SAYS SO before its first call (problem Py6fLYLg4e_n): this one has no MOLE_AGENT_KEY, no
    // run key from the host and no handshake. MUTATION PROOF (the report of the run that added it): the sentence taken
    // out of tools/sandbox-start.mjs, and this goes red.
    expect(helper.err).toContain('sandbox-start: this helper holds no key: no MOLE_AGENT_KEY of its starter')
    const warning = helper.err.split('\n').find((line) => line.includes('this helper holds no key'))!
    const details = warning.match(/Details: (.+)/)?.[1]
    expect(details, 'the no-key warning did not name its details').toBeDefined()
    expect(readFileSync(details!, 'utf8')).toContain('this helper holds no key')
    // THE FOLDER WAS MADE, which the error names, and the helper ended on the error rather than starting anything.
    expect(helper.status, helper.err).not.toBe(0)
    expect(helper.err).toContain(`after the scratch folder ${join(own, `${id}-`)}`)
    expect(helper.out.trim(), 'the helper printed a start line, so the command was told to go').toBe('')
    expect(readdirSync(own), 'the scratch folder was left behind').toEqual([])
  }, 60_000)

  // PROBLEM 9CulCZNdUgiu. The helper runs in the container, whose clone has no .env, and its environment is what
  // `docker exec` gives it (the stand-in builds it the same way, from nothing), so it read the built-in default
  // whatever this machine's setting said, while an isolated run and the merge tool read this machine's. The launcher
  // now reads the address here, before anything is filed, and hands it in. MUTATION PROOF, 26 September 2026, each
  // alone (the report of run QXU_itRRCsjE): the address not handed in, and the first case goes red on the built-in
  // default; the host's early read taken out, and the second goes red on the run the host filed; the helper's early
  // read taken out, and it goes red on the run the helper filed.
  it("gives a run's command this machine's commit address, which the helper in the container cannot read for itself", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const envOf = (file: string): Record<string, string> =>
      Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    const served = (await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: "a run that commits at this machine's address", data: { state: 'running', servingAgent: WORKER } })).body.record.id
    const seen = join(answer.folder, 'out', 'run-commit-address.txt')
    // A DOCUMENTATION ADDRESS, never a real one, as this machine's setting.
    const ran = await sandbox(['exec', NAME, '--run', served, '--json', '--', 'sh', '-c', `env > ${seen}`], undefined, { MOLE_OFFICE_COMMIT_EMAIL: 'agents@example.test' })
    expect(ran.status, ran.err).toBe(0)
    groups.add(JSON.parse(ran.out.trim()).hostPgid)
    await until('the command to write its environment', () => existsSync(seen) && readFileSync(seen, 'utf8').includes('MOLE_OFFICE_SESSION='))
    const env = envOf(seen)
    expect(env['GIT_AUTHOR_NAME']).toBe(WORKER)
    expect(env['GIT_AUTHOR_EMAIL']).toBe('agents@example.test')
    expect(env['GIT_COMMITTER_EMAIL']).toBe('agents@example.test')
    // KEPT FOR A RUN THE COMMAND STARTS IN TURN, through the helper, which then commits at the same address.
    expect(env['MOLE_OFFICE_COMMIT_EMAIL']).toBe('agents@example.test')
  }, 60_000)

  it('refuses an empty commit address before anything is filed, on the host and in a helper that files its own run', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // NOTHING FILED IS READ BY THE IDS OF THE SESSIONS: a run an earlier case started may still be written orphaned while
    // this runs, now that a run which ended with nothing and no report is (problem VS7qJcpmjbYZ).
    const before = await theSessionIds()
    const rows = (await ledger()).length
    // ON THE HOST: exec --agent files the run here, before it starts the helper.
    const host = await sandbox(
      ['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--title', 'never filed: an empty commit address, on the host', '--', 'true'],
      undefined,
      { MOLE_OFFICE_COMMIT_EMAIL: '' },
    )
    expect(host.status, host.err).not.toBe(0)
    expect(host.err).toContain('MOLE_OFFICE_COMMIT_EMAIL is set to an empty value')
    // IN THE HELPER, as an agent in a sandbox starts a run: the helper files that run itself.
    const helper = await new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession,
          '--workspace', WORKSPACE, '--api', api, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--cut-from', 'main',
          '--title', 'never filed: an empty commit address, in the helper', '--', 'true',
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder), MOLE_OFFICE_COMMIT_EMAIL: '' }, 'the-empty-commit-address'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(helper.status, helper.err).not.toBe(0)
    expect(helper.err).toContain('MOLE_OFFICE_COMMIT_EMAIL is set to an empty value')
    // NOTHING WAS FILED AND NOTHING IS HELD.
    expect(await theSessionIds()).toEqual(before)
    expect((await ledger()).length).toBe(rows)
  }, 60_000)

  it('passes a secret through an env file of mode 600 outside the sandbox, never on a command line', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const secret = `sk-test-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, `# the owner's file\nDEEPSEEK_API_KEY=${secret}\nNOT_DECLARED=left-out\n`, { mode: 0o600 })
    chmodSync(secrets, 0o600)
    const callsBefore = state().calls.length
    const ran = await sandbox(['exec', NAME, '--json', '--secret', 'DEEPSEEK_API_KEY', '--', 'sleep', '300'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await until('the command to be past its gate', () => readFileSync(`/proc/${start.hostPid}/cmdline`, 'utf8').startsWith('sleep'))

    // IT REACHED THE COMMAND, and only the declared name did.
    const environ = readFileSync(`/proc/${start.hostPid}/environ`, 'utf8').split('\0')
    expect(environ).toContain(`DEEPSEEK_API_KEY=${secret}`)
    expect(environ.some((e) => e.startsWith('NOT_DECLARED='))).toBe(false)
    // THE CALLER'S OWN COMMAND: its row is the caller's session's, and no run was filed.
    expect(start.run).toBeNull()
    expect((await ledger()).find((r) => r.id === start.processRow)?.sessionRecordId).toBe(starterSession)

    // NEVER ON A COMMAND LINE: not docker's, not the helper's that holds the command, not the command's and not a process it
    // started. Only the processes this case started are read, never every process on this machine.
    const exec = state().calls.slice(callsBefore).find((c) => c.tool === 'docker' && c.argv[0] === 'exec')
    expect(exec, 'docker exec was not called').toBeDefined()
    expect(exec?.argv.join(' ')).not.toContain(secret)
    const stat = readFileSync(`/proc/${start.hostPid}/stat`, 'utf8')
    const helper = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    for (const pid of [helper, ...itAndItsChildren(start.hostPid)]) {
      expect(readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(secret), `the secret is on the command line of pid ${pid}`).toBe(false)
    }
    // THE FILE: mode 600, outside the instance folder, and gone once docker had read it.
    expect(exec?.envFileMode).toBe(0o600)
    expect(exec?.envFile?.startsWith(answer.folder)).toBe(false)
    expect(existsSync(exec?.envFile as string)).toBe(false)

    // A SECRETS FILE OTHERS CAN READ is refused before anything starts.
    chmodSync(secrets, 0o644)
    const loose = await sandbox(['exec', NAME, '--secret', 'DEEPSEEK_API_KEY', '--', 'sleep', '1'])
    expect(loose.status).toBe(1)
    expect(loose.err).toContain('can be read by others')
    rmSync(secrets)
    expect((await releaseRow(start.processRow)).status).toBe(200)
  })

  it('holds a command at its gate until the office gives it a seat', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // SOMEBODY ELSE HOLDS THE ONE FULL-SUITE SEAT: a process group of this test's own.
    const holder = spawn('sleep', ['300'], { detached: true, stdio: 'ignore', cwd: scratch })
    groups.add(holder.pid as number)
    const held = await ask('POST', '/api/slots/acquire', { type: 'agent', id: STRANGER, session: strangerSession }, { pool: 'full-suite', pid: holder.pid })
    expect(held.status, JSON.stringify(held.body)).toBe(200)
    expect(held.body.slot.state).toBe('granted')

    const marker = join(answer.folder, 'out', 'the-suite-ran')
    // THE HELPER ASKS AGAIN EVERY 1 S, not every 10 s (SLOT_ASK_EVERY_S_FOR_A_TEST, read in tools/slot.mjs).
    const waiting = sandbox(['exec', NAME, '--slot', 'full-suite', '--json', '--', 'sh', '-c', `touch ${marker}; sleep 300`], undefined, { SLOT_ASK_EVERY_S_FOR_A_TEST: '1' })
    // IN LINE, and not running: its process row is written, and nothing it would do has happened.
    await until('the command to be in line', async () => (await ask('GET', '/api/slots', AS_STARTER())).body.pools.find((p: any) => p.name === 'full-suite').waiting.length === 1)
    await new Promise((r) => setTimeout(r, 1500))
    expect(existsSync(marker), 'the command ran without a seat').toBe(false)

    // THE SEAT IS GIVEN BACK, and the command runs in it.
    expect((await ask('POST', `/api/slots/${held.body.slot.id}/release`, { type: 'agent', id: STRANGER, session: strangerSession }, {})).status).toBe(200)
    const ran = await waiting
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop() as string)
    groups.add(start.hostPgid)
    expect(start.slot).toMatch(/\S/)
    await until('the command to have run', () => existsSync(marker))
    expect((await releaseRow(start.processRow)).status).toBe(200)
    process.kill(-(holder.pid as number), 'SIGKILL')
  }, 60_000)

  it('gives a seat to a command longer than one argument may be, with the detail capped and the command whole (item 2z)', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // OVER 131,071 BYTES JOINED, the most Linux takes in one argument (MAX_ARG_STRLEN), though every word is short. Each
    // word has two-byte letters, so a cap counted in characters says the wrong number of bytes left out.
    const words = Array.from({ length: 2_600 }, (_, n) => `word-${String(n).padStart(4, '0')}-${'ü'.repeat(25)}`)
    // WHERE THE CUT FALLS, a first word of four-byte letters, from before 1,024 bytes to past 8,192 in both details. The
    // process row's detail starts 2 more than a multiple of 4 bytes later than the seat's, so wherever the cut falls in
    // this word, it falls inside a letter in at least one of the two, whatever the length of the folder's path.
    const acrossTheCut = '𝄞'.repeat(2_100)
    const marker = join(answer.folder, 'out', 'the-long-command-ran.json')
    const command = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(1))); setTimeout(() => {}, 300_000)`, acrossTheCut, ...words]
    expect(Buffer.byteLength(command.join(' '))).toBeGreaterThan(131_071)
    const ran = await sandbox(['exec', NAME, '--slot', 'full-suite', '--json', '--', ...command])
    expect(ran.status, ran.err.slice(0, 2_000)).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop() as string)
    groups.add(start.hostPgid)
    expect(start.slot).toMatch(/\S/)

    // THE COMMAND IS WHOLE: it ran with every word it was given, and the start line names every word (item 2ab).
    await until('the long command to have run', () => existsSync(marker))
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual([acrossTheCut, ...words])
    expect(start.command).toEqual(command)

    // THE DETAIL IS CAPPED, in the seat and in the process row alike. The office follows it with ' — ' and what it read
    // itself. Its marker says how many bytes were left out, and those and the bytes kept are the whole detail.
    const seat = (await ask('GET', '/api/slots', AS_STARTER())).body.pools.find((p: any) => p.name === 'full-suite').held.find((s: any) => s.id === start.slot)
    const row = (await ledger()).find((r) => r.id === start.processRow)
    const details: [string, unknown, string][] = [
      ['the seat', seat?.detail, `sandbox ${NAME}: ${command.join(' ')}`],
      ['the process row', row?.detail, `sandbox ${NAME}: ${STARTER}'s command — ${command.join(' ')}`],
    ]
    const at = details.map(([, , whole]) => Buffer.byteLength(whole.slice(0, whole.indexOf(acrossTheCut))))
    expect((at[1]! - at[0]!) % 4, 'the two details start 2 more than a multiple of 4 bytes apart').toBe(2)
    for (const bytes of at) expect(bytes <= 1_024 && bytes + Buffer.byteLength(acrossTheCut) > 8_192, `the four-byte letters at ${bytes}`).toBe(true)
    for (const [where, stored, whole] of details) {
      const capped = String(stored).match(/^([^]*?)… and ([\d,]+) more bytes — /)
      expect(capped, `${where}: ${String(stored).slice(0, 300)}`).not.toBeNull()
      const kept = capped![1]!
      expect(whole.startsWith(kept), `${where} keeps the start of the detail`).toBe(true)
      expect(Buffer.byteLength(kept) + Number(capped![2]!.replaceAll(',', '')), `${where}: bytes kept and left out`).toBe(Buffer.byteLength(whole))
      expect(Buffer.byteLength(kept), `${where} keeps a few kilobytes`).toBeGreaterThanOrEqual(1_024)
      expect(Buffer.byteLength(kept), `${where} keeps a few kilobytes`).toBeLessThanOrEqual(8_192)
    }
    expect((await releaseRow(start.processRow)).status).toBe(200)
  }, 60_000)

  it('gives a seat to a waiting command longer than one argument may be, taken on the host with its detail capped (item 2aa)', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // WITH --wait THE LAUNCHER TAKES THE SEAT ITSELF, on the host, for its own process group, and tools/slot.mjs is given
    // the detail as one argument. The command is over 131,071 bytes joined, as in item 2z's case.
    const words = Array.from({ length: 2_600 }, (_, n) => `word-${String(n).padStart(4, '0')}-${'ü'.repeat(25)}`)
    const marker = join(answer.folder, 'out', 'the-long-waiting-command-ran.json')
    const mayEnd = join(answer.folder, 'out', 'the-long-waiting-command-may-end')
    const command = ['node', '-e', `const fs = require('fs'); fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(1))); setInterval(() => { if (fs.existsSync(${JSON.stringify(mayEnd)})) process.exit(0) }, 100)`, ...words]
    expect(Buffer.byteLength(command.join(' '))).toBeGreaterThan(131_071)
    const ended: { ran?: Ran } = {}
    const waiting = sandbox(['exec', NAME, '--wait', '--slot', 'full-suite', '--', ...command]).then((ran) => (ended.ran = ran))
    await until('the long command to run, or the launcher to end', () => existsSync(marker) || ended.ran !== undefined, 30_000)
    expect(existsSync(marker), `the launcher ended before the command ran: ${String(ended.ran?.err).slice(0, 2_000)}`).toBe(true)
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual(words)

    // THE SEAT'S DETAIL IS CAPPED as the helper caps its own: the bytes kept and the bytes its marker says it left out
    // are the whole detail.
    const whole = `sandbox ${NAME}: ${command.join(' ')}`
    const seat = (await ask('GET', '/api/slots', AS_STARTER())).body.pools.find((p: any) => p.name === 'full-suite').held.find((s: any) => String(s.detail).startsWith(`sandbox ${NAME}: node -e `))
    expect(seat, 'no full-suite seat is held for the long command').toBeDefined()
    const capped = String(seat.detail).match(/^([^]*?)… and ([\d,]+) more bytes(?: — |$)/)
    expect(capped, String(seat.detail).slice(0, 300)).not.toBeNull()
    const kept = capped![1]!
    expect(whole.startsWith(kept), 'the seat keeps the start of the detail').toBe(true)
    expect(Buffer.byteLength(kept) + Number(capped![2]!.replaceAll(',', '')), 'the seat: bytes kept and left out').toBe(Buffer.byteLength(whole))
    expect(Buffer.byteLength(kept), 'the seat keeps a few kilobytes').toBeGreaterThanOrEqual(1_024)
    expect(Buffer.byteLength(kept), 'the seat keeps a few kilobytes').toBeLessThanOrEqual(8_192)

    // THE COMMAND ENDS, and the launcher ends with its code.
    writeFileSync(mayEnd, '')
    await waiting
    expect(ended.ran?.status, ended.ran?.err.slice(0, 2_000)).toBe(0)
  }, 60_000)

  it('says E2BIG and what it means when tools/slot.mjs cannot be started for a seat, and the exit code when it ends without one (item 2aa)', () => {
    // LINUX'S OWN REFUSAL, made here with one argument of 131,072 bytes. A seat's detail is capped now, so no start of the
    // launcher or its helper reaches this refusal; both say why no seat was given in these words.
    const tooLong = spawnSync(process.execPath, ['-e', '0', 'x'.repeat(131_072)])
    expect((tooLong.error as NodeJS.ErrnoException | undefined)?.code).toBe('E2BIG')
    expect(whyTheSlotToolGaveNoSeat(tooLong)).toBe('tools/slot.mjs could not be started: E2BIG, the error Linux gives for arguments that are too long; one argument may hold at most 131,071 bytes')
    expect(whyTheSlotToolGaveNoSeat(spawnSync(process.execPath, ['-e', 'process.exit(3)']))).toBe('tools/slot.mjs exited 3')
  })

  it('keeps a letter cut between two pieces whole, and gives the first line as soon as its newline has come (item 2ab)', async () => {
    const line = `${JSON.stringify({ command: ['€'.repeat(50_000)] })}\n`
    const bytes = Buffer.from(`${line}after the line`)
    const pieces = Array.from({ length: Math.ceil(bytes.length / 65_536) }, (_, n) => bytes.subarray(n * 65_536, (n + 1) * 65_536))
    // THE CONTROL: each piece decoded by itself, as the tools read the start line before item 2ab, cuts a letter.
    expect(pieces.map((piece) => piece.toString('utf8')).join('')).toContain('\uFFFD')
    const stream = Readable.from(pieces)
    const ended = new Promise((done) => stream.on('end', done))
    const firstLines: string[] = []
    const read = aStreamReadWhole(stream, (first: Buffer) => firstLines.push(first.toString('utf8')))
    await ended
    expect(firstLines).toEqual([line])
    expect(read.text()).toBe(`${line}after the line`)
  })

  it('reads a start line longer than one piece of 64 KiB whole, with every letter as the command gave it (item 2ab)', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // THREE-BYTE LETTERS ACROSS SEVERAL PIECES. A pipe hands bytes over in pieces of up to 64 KiB. 65,536 is 1 more than a
    // multiple of 3, so where the pieces are full, two cuts in every three fall inside a letter. Each word stays under the
    // 131,071 bytes one argument may hold.
    const words = Array.from({ length: 3 }, (_, n) => `${String(n)}-${'€'.repeat(40_000)}`)
    const marker = join(answer.folder, 'out', 'the-wide-start-line-ran.json')
    const command = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '[]'); setTimeout(() => {}, 300_000)`, ...words]
    const ran = await sandbox(['exec', NAME, '--json', '--', ...command])
    expect(ran.status, ran.err.slice(0, 2_000)).toBe(0)
    const line = ran.out.trim().split('\n').pop() as string
    expect(Buffer.byteLength(line)).toBeGreaterThan(5 * 65_536)
    expect(line.includes('\uFFFD'), 'a letter of the start line was read in two pieces').toBe(false)
    const start = JSON.parse(line)
    groups.add(start.hostPgid)
    expect(start.command).toEqual(command)
    await until('the command with the wide start line to have run', () => existsSync(marker))
    expect((await releaseRow(start.processRow)).status).toBe(200)
  }, 60_000)

  // THE SAME LINE WHEN THE LAUNCHER WAITS (item 2ad). With --wait the helper prints its start line on the error stream.
  // For an OpenCode command the launcher writes that line again from what it read, with the OpenCode notice in it, on
  // its own error stream and in launch.txt. The launcher writes the line again only when it has just given OpenCode the
  // external-directory permission, so the case first takes that permission out of the sandbox's opencode.json.
  it('writes the start line of a waited OpenCode command again with every letter as the command gave it (item 2ad)', async () => {
    const answer = upAnswer as { folder: string }
    const bin = join(scratch, 'an-opencode-stand-in')
    const marker = join(answer.folder, 'out', 'the-wide-waited-start-line-ran.json')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'opencode'), `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(marker)}, '[]')\n`, { mode: 0o755 })
    const config = join(answer.folder, 'home', '.config', 'opencode', 'opencode.json')
    const held = existsSync(config) ? readFileSync(config, 'utf8') : null
    mkdirSync(dirname(config), { recursive: true })
    writeFileSync(config, '{}\n')
    const words = Array.from({ length: 3 }, (_, n) => `${String(n)}-${'€'.repeat(40_000)}`)
    let ran: Ran
    try {
      ran = await sandbox(['exec', NAME, '--wait', '--verbose', '--', 'opencode', ...words], undefined, { PATH: `${bin}:${theToolsEnvironment()['PATH']}` })
    } finally {
      if (held === null) rmSync(config, { force: true })
      else writeFileSync(config, held)
    }
    expect(ran.status, ran.err.slice(0, 2_000)).toBe(0)
    expect(existsSync(marker)).toBe(true)
    const prefix = 'sandbox-start: started '
    const line = ran.err.split('\n').find((one) => one.includes(`${prefix}{`))
    expect(line, ran.err.slice(0, 2_000)).toBeDefined()
    expect(Buffer.byteLength(line!)).toBeGreaterThan(5 * 65_536)
    expect(line!.includes('�'), 'a letter of the start line was read in two pieces').toBe(false)
    const start = JSON.parse(line!.slice(line!.indexOf(prefix) + prefix.length))
    expect(start.opencode).toBe('OpenCode config now allows external-directory permission.')
    expect(start.command.slice(0, 4)).toEqual(['opencode', ...words])
    const details = readFileSync(start.details, 'utf8')
    expect(details.includes('�'), 'launch.txt holds a letter read in two pieces').toBe(false)
    const written = details.split('\n').filter((one) => one.startsWith('started {')).map((one) => JSON.parse(one.slice('started '.length)))
    expect(written.map((one) => one.command.slice(0, 4))).toEqual([['opencode', ...words]])
  }, 60_000)
})

describe('plain exec --secret selects the secrets its command asks for', () => {
  const instance = 'selected-secrets'
  let folder = ''

  beforeAll(async () => {
    const own = join(scratch, 'selected-secrets-template')
    mkdirSync(own)
    writeFileSync(join(own, 'devcontainer.json'), readFileSync(join(template, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8'))
    const hostFile = join(own, 'secrets.env')
    office.secrets.hostFile = hostFile
    office.secrets.names = ['A', 'B', 'C', 'D'].map((name) => ({ name, readBy: [name === 'B' ? 'claude' : 'opencode'] }))
    writeFileSync(hostFile, 'A=test-a\nB=test-b\nC=test-c\nUNDECLARED=test-undeclared\n', { mode: 0o600 })
    writeFileSync(join(own, 'sandbox.json'), JSON.stringify(office))
    const up = await sandbox(['up', own, '--name', instance, '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    folder = (JSON.parse(up.out.trim()) as { folder: string }).folder
  }, 60_000)

  afterAll(async () => {
    if (folder === '') return
    const down = await sandbox(['down', instance, '--json'])
    expect(down.status, down.err).toBe(0)
  })

  async function secretsSeen(flags: string[], waits = true, verbose = true): Promise<{ names: string[]; err: string; details: string }> {
    const seen = join(folder, 'out', 'selected-env.txt')
    rmSync(seen, { force: true })
    const callsBefore = state().calls.length
    const script = `require('fs').writeFileSync(${JSON.stringify(seen)}, Object.entries(process.env).map(([key, value]) => key + '=' + value).join(String.fromCharCode(10)))`
    const ran = await sandbox(['exec', instance, ...(waits ? ['--wait'] : ['--json']), ...(verbose ? ['--verbose'] : []), ...flags, '--', 'node', '-e', script])
    expect(ran.status, ran.err).toBe(0)
    if (!waits) groups.add(JSON.parse(ran.out.trim()).hostPgid)
    await until('the command to write its environment', () => existsSync(seen) && readFileSync(seen, 'utf8').includes('PATH='))
    const names = readFileSync(seen, 'utf8').split('\n').filter((line) => /^(A|B|C|D|UNDECLARED)=/.test(line)).sort()
    // The exec that ran the command, and not a git command that made an agent run's worktree first.
    const exec = state().calls.slice(callsBefore).find((c) => c.tool === 'docker' && c.argv[0] === 'exec' && c.argv.includes(script))
    expect(exec, 'docker never read the command environment').toBeDefined()
    // AN AGENT'S RUN GETS ITS RUN KEY THROUGH THE SAME FILE (SANDBOX_RUN_KEY in tools/sandbox.mjs), so the file is made
    // for it with no secret in it, and kept as closely as one that holds secrets.
    if (names.length > 0 || flags.includes('--agent')) {
      expect(exec?.envFileMode).toBe(0o600)
      expect(exec?.envFile?.startsWith(folder)).toBe(false)
      expect(existsSync(exec?.envFile as string)).toBe(false)
    } else expect(exec?.envFile).toBeNull()
    expect(ran.out + ran.err).not.toMatch(/test-(a|b|c|undeclared)/)
    const detailPath = (ran.out + ran.err).match(/(?:Details: |details )([^\n]+launch\.txt)/)?.[1]
    const started = ran.err.match(/started (\{[^\n]+\})/)?.[1]
    const start = waits ? (started === undefined ? null : JSON.parse(started)) : JSON.parse(ran.out.trim())
    return { names, err: ran.err, details: readFileSync(start?.details ?? detailPath!, 'utf8') }
  }

  it('passes A and no other declared secret with --secret A, even when B and C are set', async () => {
    const ran = await secretsSeen(['--secret', 'A'])
    expect(ran.names).toEqual(['A=test-a'])
    expect(ran.err).toContain('passing A into the sandbox through an env file, because --secret asked for them')
  })

  it('passes both names requested by two --secret flags with --no-office-variables', async () => {
    const ran = await secretsSeen(['--no-office-variables', '--secret', 'A', '--secret', 'C'])
    expect(ran.names).toEqual(['A=test-a', 'C=test-c'])
    expect(ran.err).toContain('passing A, C into the sandbox through an env file, because --secret asked for them')
  })

  it('passes no value for a requested declared name the host file does not set', async () => {
    const ran = await secretsSeen(['--secret', 'D'], true, false)
    expect(ran.names).toEqual([])
    expect(ran.err).toContain('Secrets named but not passed: D.')
    expect(ran.err).toMatch(/Details: .+launch\.txt/)
  })

  // A decision, the owner's message, proposal rMV50JMPXgww,
  // problem PK6HVtZxTHcs.
  // MUTATION: restore commandExec's old null selection without --secret, letting startThroughTheHelper
  // fall back to every declared secret. Both the waited and detached cases go red on the command's environment.
  it.each([true, false])('passes no host secret without --secret and explains why (waits: %s)', async (waits) => {
    const ran = await secretsSeen([], waits)
    expect(ran.names).toEqual([])
    expect(ran.err).toContain('no secret was passed: a plain command gets only the secrets named with --secret.')
  })

  // MUTATION: omit runtime from startThroughTheHelper's theSecretsFor call. This case goes red because B,
  // which only Claude reads, reaches the opencode run. The agent path must retain its runtime selection.
  it('still gives an agent run only the secrets its runtime reads without --secret', async () => {
    const ran = await secretsSeen(['--agent', WORKER, '--runtime', 'opencode', '--model', 'deepseek/deepseek-v4.1-flash'], false, false)
    expect(ran.names).toEqual(['A=test-a', 'C=test-c'])
    expect(ran.details).toContain('Left out, because opencode does not read them: B.')
    expect(ran.err).not.toMatch(/Secrets named but not passed|Left out|sets none of the names/)
    expect(ran.err).not.toContain('a plain command gets only the secrets named with --secret')
  })

  it('names the runtime alternatives when none is passed and no login file exists', async () => {
    const hostFile = join(scratch, 'selected-secrets-template', 'secrets.env')
    const original = readFileSync(hostFile, 'utf8')
    writeFileSync(hostFile, 'B=test-b\n')
    try {
      const ran = await secretsSeen(['--agent', WORKER, '--runtime', 'opencode', '--model', 'deepseek/deepseek-v4.1-flash'], false, false)
      expect(ran.names).toEqual([])
      const warnings = ran.err.split('\n').filter(line => line.includes('Secrets named but not passed:'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('A, C, D')
      expect(warnings[0]).toContain('Any one of these names would provide a runtime login.')
      expect(ran.details).toContain('Secrets named but not passed:')
    } finally {
      writeFileSync(hostFile, original)
    }
  })

  async function refused(flags: string[], message: string): Promise<Ran> {
    const marker = join(mkdtempSync(join(folder, 'out', 'refused-secret-')), 'ran')
    const callsBefore = state().calls.length
    const rowsBefore = (await ledger()).length
    const ran = await sandbox(['exec', instance, ...flags, '--', 'touch', marker])
    expect(ran.status).not.toBe(0)
    expect(ran.err).toContain(message)
    expect(state().calls.slice(callsBefore).filter((c) => c.argv[0] === 'exec' || c.argv[0] === 'run')).toEqual([])
    expect((await ledger()).length).toBe(rowsBefore)
    expect(existsSync(marker)).toBe(false)
    expect(ran.out + ran.err).not.toMatch(/test-(a|b|c|undeclared)/)
    return ran
  }

  it('refuses an undeclared name and starts nothing, even when the host file sets it', async () => {
    const ran = await refused(['--verbose', '--secret', 'A', '--secret', 'UNDECLARED'], '--secret names undeclared secrets: UNDECLARED')
    expect(ran.err).toContain('The template declares: A, B, C, D.')
  })

  it.each([
    { kind: 'empty', value: '' },
    { kind: 'blank', value: ' \t\n ' },
  ])('refuses an $kind --secret with its own sentence and starts nothing', async ({ value }) => {
    const callsBefore = state().calls.length
    const ran = await refused(['--wait', '--secret', value], '--secret needs a name.')
    expect(ran.err.split('\n')[0]).toBe('--secret needs a name.')
    expect(state().calls.slice(callsBefore)).toEqual([])
  })

  it('refuses --secret with --plain-env and starts nothing', async () => {
    await refused(['--secret', 'A', '--plain-env'], '--secret cannot be used with --plain-env')
  })

  it('refuses --secret with an agent run and starts nothing', async () => {
    await refused(['--secret', 'A', '--agent', STARTER, '--runtime', 'opencode'], '--secret cannot be used with an agent run or --isolated')
  })

  it('refuses --secret with an isolated run and starts nothing', async () => {
    await refused(['--secret', 'A', '--isolated', '--runtime', 'opencode', '--run', 'not-filed', '--cwd', folder], '--secret cannot be used with an agent run or --isolated')
  })
})

describe("exec --wait, --timeout and --plain-env: the caller's own command, run to its end (acceptance finding 17)", () => {
  it("relays the output, exits with the command's code, gives it only the container's environment and no secret, and closes its row", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'DEEPSEEK_API_KEY=sk-test-not-for-a-suite\n', { mode: 0o600 })
    const callsBefore = state().calls.length
    const seen = join(answer.folder, 'out', 'plain-env.txt')
    const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `env > ${seen}; echo to-stdout; echo to-stderr >&2; exit 3`])
    rmSync(secrets)
    // THE COMMAND'S OWN CODE AND OUTPUT, after it ended.
    expect(ran.status, ran.err).toBe(3)
    expect(ran.out).toBe('to-stdout\n')
    expect(ran.err).toContain('to-stderr')
    expect(ran.err).toContain('the command ended: it exited 3')
    // NOTHING OF THE LAUNCHER'S, NO TOOL'S PERMISSIONS, AND NO SECRET: no env file was even written.
    const env = readFileSync(seen, 'utf8').split('\n').map((line) => line.slice(0, line.indexOf('=')))
    for (const name of ['SANDBOX_DIR', 'SANDBOX_PROCESS_ROW', 'MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_COMMIT_EMAIL', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_EMAIL', 'OPENCODE_PERMISSION', 'DSH_PERMISSION_MODE', 'DEEPSEEK_API_KEY']) {
      expect(env, `${name} reached a --plain-env command`).not.toContain(name)
    }
    const exec = state().calls.slice(callsBefore).find((c) => c.tool === 'docker' && c.argv[0] === 'exec')
    expect(exec?.envFile).toBeNull()
    // THE START AND THE END ARE WRITTEN DOWN, and the row is closed by the launcher on the host, which wrote it.
    const start = startsOf(answer.folder).find((one: any) => one.waits === true && Array.isArray((one as any).command) && (one as any).command.join(' ').includes('exit 3')) as any
    expect(start, 'no start.json for the command').toBeDefined()
    expect(start).toMatchObject({ run: null, out: null, waits: true, plainEnv: true, timeoutSeconds: null, scratch: null })
    const logFolder = readdirSync(join(answer.folder, 'logs')).map((l) => join(answer.folder, 'logs', l)).find((d) => existsSync(join(d, 'start.json')) && JSON.parse(readFileSync(join(d, 'start.json'), 'utf8')).processRow === start.processRow)!
    expect(JSON.parse(readFileSync(join(logFolder, 'end.json'), 'utf8'))).toMatchObject({ code: 3, signal: null, timedOut: false, exit: 3 })
    const row = (await ledger()).find((r) => r.id === start.processRow)
    expect(row?.releasedAt).toEqual(expect.any(String))
    expect(String(row?.releaseNote)).toContain('The command ended: it exited 3')
    // THE ROW WAS WRITTEN FROM HERE, ON THE HOST, and the helper only read it (acceptance finding 77): a handshake folder
    // in the instance holds the gate's pid, the row the launcher wrote, and the helper's end. MUTATION PROOF, 25 September
    // 2026, alone in tools/sandbox.mjs: no --handshake passed, so the helper writes the row itself, and this goes red.
    const handshakes = join(answer.folder, 'handshakes')
    const shook = (existsSync(handshakes) ? readdirSync(handshakes) : [])
      .map((one) => join(handshakes, one))
      .find((one) => existsSync(join(one, 'row.json')) && JSON.parse(readFileSync(join(one, 'row.json'), 'utf8')).id === start.processRow)
    expect(shook, "no handshake folder holds this command's row").toBeDefined()
    expect(JSON.parse(readFileSync(join(shook!, 'pid.json'), 'utf8'))).toMatchObject({ pidInContainer: start.innerPid })
    expect(JSON.parse(readFileSync(join(shook!, 'end.json'), 'utf8'))).toMatchObject({ exit: 3 })
  }, 60_000)

  // ACCEPTANCE FINDING 44, 23 SEPTEMBER 2026: browser tests a check's model ran in the inspector sandbox took
  // the live office's address from this environment, and 65 of their records are in the live office. The
  // model needs its login, so --plain-env will not do; --no-office-variables keeps the login and nothing of
  // the office, nor the git identity an agent is given (a plain machine but for its secrets).
  // MUTATION PROOF, that day: the office's variables left in, and this goes red on MOLE_OFFICE_API; the
  // git identity left in, and it goes red on GIT_AUTHOR_NAME; the secrets dropped as --plain-env drops
  // them, and it goes red on the key.
  // MUTATION (wPqnA92Ta8Kb, second pass): MOLE_AGENT_KEY taken off THE_OFFICES_VARIABLES again,
  // and this case goes red on the launcher's sentence. The helper also removes a starter's key
  // before applying this flag, so removing the shared name alone does not leak that key.
  it('gives a command its secrets and everything else, but none of the office\'s own variables, with --no-office-variables', async () => {
    const own = join(scratch, 'a-template-with-an-agent-key')
    mkdirSync(own, { recursive: true })
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')) as { containerEnv?: Record<string, string> }
    config.containerEnv = { ...(config.containerEnv ?? {}), MOLE_AGENT_KEY: 'synthetic-agent-key-not-a-real-one' }
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const up = await sandbox(['up', own, '--name', 'agent-key-names', '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const answer = JSON.parse(up.out.trim()) as { container: string; resource: string; folder: string }
    // Docker gives the helper this key. Read the stand-in container directly because the helper
    // removes a starter's key even without --no-office-variables.
    const containerEnv = execFileSync(join(fakes, 'bin', 'docker'), ['exec', answer.container, 'env'], { env: theToolsEnvironment(), encoding: 'utf8' })
    expect(containerEnv).toContain('MOLE_AGENT_KEY=synthetic-agent-key-not-a-real-one\n')
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'DEEPSEEK_API_KEY=sk-test-not-for-a-suite\n', { mode: 0o600 })
    const callsBefore = state().calls.length
    const seen = join(answer.folder, 'out', 'no-office-variables.txt')
    const ran = await sandbox(['exec', 'agent-key-names', '--wait', '--verbose', '--no-office-variables', '--secret', 'DEEPSEEK_API_KEY', '--', 'sh', '-c', `env > ${seen}`])
    rmSync(secrets)
    expect(ran.status, ran.err).toBe(0)
    const env = readFileSync(seen, 'utf8').split('\n').map((line) => line.slice(0, line.indexOf('=')))
    for (const name of ['MOLE_AGENT_KEY', 'MOLE_OFFICE_API', 'MOLE_OFFICE_PORT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_COMMIT_EMAIL', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
      expect(env, `${name} reached a --no-office-variables command`).not.toContain(name)
    }
    for (const name of ['SANDBOX_DIR', 'DEEPSEEK_API_KEY']) expect(env, `${name} did not reach the command`).toContain(name)
    const exec = state().calls.slice(callsBefore).find((c) => c.tool === 'docker' && c.argv[0] === 'exec')
    expect(exec?.envFile, 'no env file was written, so the login could not have reached the command').not.toBeNull()
    expect(ran.err).toContain('--no-office-variables: the command gets no MOLE_AGENT_KEY, MOLE_OFFICE_API')
    const down = await sandbox(['down', 'agent-key-names', '--json'])
    expect(down.status, down.err).toBe(0)
  }, 60_000)

  // PROBLEM k73Ug7ZyKVBy (message F1B013viL1rd, 30 September 2026): --no-office-variables took out a fixed list,
  // so a MOLE_OFFICE_ name it did not know went on to the command. In every run of the merge queue that day, the queue's
  // read recorder gave a check's stand-in model its two MOLE_OFFICE_READ_ variables. A template's containerEnv is a way a
  // real container gets such a name, so this case takes it. MUTATION PROOF (the report of the run that added this case):
  // the other names left in, and this goes red on the name the template set.
  it('takes every other MOLE_OFFICE_ name out of a --no-office-variables command too, not only the office\'s own list', async () => {
    const own = join(scratch, 'a-template-with-an-office-name')
    mkdirSync(own, { recursive: true })
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')) as { containerEnv?: Record<string, string> }
    config.containerEnv = { ...(config.containerEnv ?? {}), MOLE_OFFICE_NOT_ON_THE_LIST: 'set by the template' }
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const up = await sandbox(['up', own, '--name', 'office-names', '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const folder = (JSON.parse(up.out.trim()) as { folder: string }).folder
    const namesSeen = async (flags: string[], file: string): Promise<string[]> => {
      const seen = join(folder, 'out', file)
      const ran = await sandbox(['exec', 'office-names', '--wait', ...flags, '--', 'sh', '-c', `env > ${seen}`])
      expect(ran.status, ran.err).toBe(0)
      return readFileSync(seen, 'utf8').split('\n').map((line) => line.slice(0, line.indexOf('=')))
    }
    // THE NAME REACHES THE HELPER, so an ordinary command gets it, and it is the flag that takes it out.
    expect(await namesSeen([], 'an-ordinary-command.txt')).toContain('MOLE_OFFICE_NOT_ON_THE_LIST')
    const kept = await namesSeen(['--no-office-variables'], 'no-office-variables-and-no-other.txt')
    expect(kept, 'MOLE_OFFICE_NOT_ON_THE_LIST reached a --no-office-variables command').not.toContain('MOLE_OFFICE_NOT_ON_THE_LIST')
    expect(kept.filter((name) => name.startsWith('MOLE_OFFICE_'))).toEqual([])
    expect(kept).toContain('SANDBOX_DIR')
    const down = await sandbox(['down', 'office-names', '--json'])
    expect(down.status, down.err).toBe(0)
  }, 60_000)

  // A STARTER'S KEY FILE IS ITS KEY. Every agent's tool reads its key from the file MOLE_AGENT_KEY_FILE names, or else
  // from MOLE_AGENT_KEY (for-agents/agent-key.mjs), and the helper gives a command neither of its starter's: a command
  // holds its run's own key or none. Nothing on the host passes either name in; a template's containerEnv is a way a real
  // container gets one, so this case takes it, with a file the helper itself can read as its key.
  // MUTATION PROOF (the report of the run that added this case): the file's name left in, and the first expect goes red;
  // the file's key handed on as MOLE_AGENT_KEY, and it goes red on that name; SANDBOX_DIR not passed, and the second.
  it("gives an ordinary command neither its starter's MOLE_AGENT_KEY nor the MOLE_AGENT_KEY_FILE that names its key", async () => {
    const keyFile = join(scratch, 'a-starters-key-file')
    writeFileSync(keyFile, `${'5a'.repeat(32)}\n`, { mode: 0o600 })
    const own = join(scratch, 'a-template-with-a-key-file')
    mkdirSync(own, { recursive: true })
    const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')) as { containerEnv?: Record<string, string> }
    config.containerEnv = { ...(config.containerEnv ?? {}), MOLE_AGENT_KEY_FILE: keyFile }
    writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config, null, 2))
    writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
    const up = await sandbox(['up', own, '--name', 'a-key-file', '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const seen = join((JSON.parse(up.out.trim()) as { folder: string }).folder, 'out', 'a-key-file.txt')
    const ran = await sandbox(['exec', 'a-key-file', '--wait', '--', 'sh', '-c', `env > ${seen}`])
    rmSync(keyFile)
    expect(ran.status, ran.err).toBe(0)
    const names = readFileSync(seen, 'utf8').split('\n').map((line) => line.slice(0, line.indexOf('=')))
    expect(names.filter((name) => name === 'MOLE_AGENT_KEY' || name === 'MOLE_AGENT_KEY_FILE'), 'a key of the starter reached the command').toEqual([])
    expect(names, 'the command wrote no environment, so the first expect read nothing').toContain('SANDBOX_DIR')
    const down = await sandbox(['down', 'a-key-file', '--json'])
    expect(down.status, down.err).toBe(0)
  }, 60_000)

  // ACCEPTANCE FINDING 47 (report EnJvvsDTF_Dx, block f-47; the decision in message Pjv4iDbW1PpZ): Claude
  // Code takes its own login out of every command its Bash tool runs, so a Claude Code worker started from
  // inside a Claude Code session starts logged out, prints "Not logged in" and is marked crashed. The launcher
  // refuses one before it starts, and says to start it from the host, where the login comes from the secrets file.
  // MUTATION PROOF, 23 September 2026, each alone: the refusal left out, and both cases go red, the first on
  // the command having run with no login; the run's runtime left out of what counts as Claude Code, and only
  // the second goes red, because its command is a shell.
  it('refuses to start Claude Code with no login, and starts it once the login is there', async () => {
    const secrets = join(scratch, 'sandbox-secrets.env')
    const bin = join(scratch, 'a-claude-stand-in')
    mkdirSync(bin, { recursive: true })
    const claude = join(bin, 'claude')
    const marker = join(scratch, 'the-claude-stand-in-ran')
    writeFileSync(claude, `#!/bin/sh\necho ran > '${marker}'\n`, { mode: 0o755 })
    rmSync(marker, { force: true })
    writeFileSync(secrets, 'DEEPSEEK_API_KEY=sk-test-not-for-a-suite\n', { mode: 0o600 })
    const refused = await sandbox(['exec', NAME, '--wait', '--', claude, '-p', 'hello', '--model', 'claude-opus-5-5'])
    expect(refused.status, refused.err).toBe(1)
    expect(refused.err).toContain('A Claude Code worker cannot be started from inside a Claude Code session')
    expect(theRefusalExplanation(refused)).toContain('The command never ran.')
    expect(existsSync(marker), 'the command ran with no login').toBe(false)
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const started = await sandbox(['exec', NAME, '--wait', '--secret', 'CLAUDE_CODE_OAUTH_TOKEN', '--', claude, '-p', 'hello', '--model', 'claude-opus-5-5'])
    rmSync(secrets)
    expect(started.err).not.toContain('cannot be started from inside a Claude Code session')
    expect(started.status, started.err).toBe(0)
    expect(existsSync(marker), 'the command did not run with its login').toBe(true)
  }, 60_000)

  it('refuses a claude-code run with no login even when its command is a shell, and marks the run as never started', async () => {
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'DEEPSEEK_API_KEY=sk-test-not-for-a-suite\n', { mode: 0o600 })
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', 'anthropic/claude-opus-5-5', '--', 'sh', '-c', 'exec claude -p hello'])
    rmSync(secrets)
    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain('A Claude Code worker cannot be started from inside a Claude Code session')
    const named = /Run (\S+) is marked as never started\./.exec(theRefusalExplanation(ran))
    expect(named, ran.err).not.toBeNull()
    const record = (await ask('GET', `/api/records/${named![1]}`, AS_STARTER())).body.record
    expect(record.data).toMatchObject({ state: 'crashed', servingAgent: WORKER })
    expect(String(record.data.detail)).toContain('cannot be started from inside a Claude Code session')
    // AND THE SCRATCH FOLDER MADE FOR IT IS TAKEN BACK, since nothing ran in it (problem _ELVBQk9HWLA): a run's folder is
    // named after the run.
    const containers = join(fakes, 'tmp')
    const left = (existsSync(containers) ? readdirSync(containers) : []).filter((one) => one.startsWith(`${named![1]}-`))
    expect(left, 'a refused run left its scratch folder').toEqual([])
  }, 60_000)

  it("stops the command's whole group at its limit, inside, and exits 124", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const started = Date.now()
    const ran = await sandbox(['exec', NAME, '--wait', '--timeout', '2', '--', 'sh', '-c', 'sleep 300 & sleep 300'])
    expect(ran.status, ran.err).toBe(124)
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(ran.err).toContain('reached its limit of 2 s')
    const start = startsOf(answer.folder).filter((one: any) => one.timeoutSeconds === 2).pop() as any
    await until('the whole group to be gone', () => !theGroupLives(start.hostPgid))
  }, 60_000)

  it("passes a SIGTERM sent to exec on to the command's group, which docker exec would not", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const marker = join(answer.folder, 'out', 'waited-for-sigterm')
    const child = spawn(process.execPath, theToolsArguments(['exec', NAME, '--wait', '--', 'sh', '-c', `touch ${marker}; sleep 300`], { agent: STARTER, session: starterSession }), {
      env: theToolsEnvironment(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    groups.add(child.pid as number)
    let err = ''
    child.stderr!.on('data', (c) => (err += c))
    await until('the command to be running', () => existsSync(marker) && startsOf(answer.folder).some((one: any) => one.command?.includes(`touch ${marker}; sleep 300`)))
    const start = startsOf(answer.folder).find((one: any) => one.command?.includes(`touch ${marker}; sleep 300`)) as any
    groups.add(start.hostPgid)
    const code = await new Promise<number | null>((done) => {
      child.on('close', (c) => done(c))
      process.kill(child.pid as number, 'SIGTERM')
    })
    expect(code, err).toBe(128 + 15)
    await until('the group to be gone', () => !theGroupLives(start.hostPgid))
  }, 60_000)

  // THE HOST CLOSES THE ROW IT WROTE ON EVERY PATH IT CAN SEE (acceptance finding 77; message fSAfBU307yk7): at
  // the helper's limit, and when exec itself is ended by a signal, so a merge sandbox leaves no open row behind.
  // MUTATION PROOF, 25 September 2026, alone in tools/sandbox.mjs: the host's release taken out, and this goes red on the
  // open row.
  it("closes a build's row from the host when the command meets its limit, and when exec itself is sent SIGTERM", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const limited = await sandbox(['exec', NAME, '--wait', '--plain-env', '--timeout', '2', '--', 'sh', '-c', 'sleep 300 & sleep 300'])
    expect(limited.status, limited.err).toBe(124)
    const atLimit = startsOf(answer.folder).filter((one: any) => one.timeoutSeconds === 2 && one.plainEnv === true).pop() as any
    const limitedRow = (await ledger()).find((r) => r.id === atLimit.processRow)
    expect(limitedRow?.releasedAt, limited.err).toEqual(expect.any(String))
    expect(String(limitedRow?.releaseNote)).toContain('it was stopped at its limit of 2 s')
    await until('the limited group to be gone', () => !theGroupLives(atLimit.hostPgid))

    const marker = join(answer.folder, 'out', 'a-build-waited-for-sigterm')
    const child = spawn(process.execPath, theToolsArguments(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `touch ${marker}; sleep 300`], { agent: STARTER, session: starterSession }), {
      env: theToolsEnvironment(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    groups.add(child.pid as number)
    let err = ''
    child.stderr!.on('data', (c) => (err += c))
    await until('the build to be running', () => existsSync(marker) && startsOf(answer.folder).some((one: any) => one.command?.includes(`touch ${marker}; sleep 300`)))
    const start = startsOf(answer.folder).find((one: any) => one.command?.includes(`touch ${marker}; sleep 300`)) as any
    groups.add(start.hostPgid)
    const code = await new Promise<number | null>((done) => {
      child.on('close', (c) => done(c))
      process.kill(child.pid as number, 'SIGTERM')
    })
    expect(code, err).toBe(128 + 15)
    const row = (await ledger()).find((r) => r.id === start.processRow)
    expect(row?.releasedAt, err).toEqual(expect.any(String))
    await until('the group to be gone', () => !theGroupLives(start.hostPgid))
  }, 90_000)

  // THE HELPER'S WAIT FOR THE HOST HAS A LIMIT, and giving up names the folder (message fSAfBU307yk7): a launcher
  // that died before it wrote the row leaves the command unstarted, not waiting for ever. MUTATION PROOF, 25 September
  // 2026, alone in tools/sandbox-start.mjs: the limit taken out, and this goes red on its own time.
  it('starts nothing, and names the folder it waited on, when no row comes from the host within the limit', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const handshake = join(answer.folder, 'handshakes', 'nobody-writes-the-row')
    mkdirSync(handshake, { recursive: true })
    const marker = join(answer.folder, 'out', 'ran-without-a-row')
    const helperRan = await new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession,
          '--workspace', WORKSPACE, '--api', api, '--wait', '--plain-env', '--handshake', handshake, '--', 'sh', '-c', `touch ${marker}`,
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder), SANDBOX_HANDSHAKE_LIMIT_MS: '1000' }, 'the-handshake-limit'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(helperRan.status, helperRan.err).toBe(1)
    // A HELPER WITH A HANDSHAKE HAS ITS ROW WRITTEN BY THE HOST, so it does not say it holds no key (problem Py6fLYLg4e_n).
    expect(helperRan.err).not.toContain('this helper holds no key')
    expect(theRefusalExplanation(helperRan)).toContain(`No process row came from the launcher on the host within 1 s. It writes row.json into ${handshake}, in the instance folder ${answer.folder}`)
    expect(existsSync(join(handshake, 'pid.json'))).toBe(true)
    expect(existsSync(marker)).toBe(false)
  }, 30_000)

  it('refuses --wait for an agent run, and --timeout without --wait, before anything starts', async () => {
    const agent = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--wait', '--', 'true'])
    expect(agent.status).toBe(2)
    expect(agent.err).toContain("--wait is for the caller's own command")
    const lone = await sandbox(['exec', NAME, '--timeout', '5', '--', 'true'])
    expect(lone.status).toBe(2)
    expect(lone.err).toContain('--timeout goes with --wait')
  }, 30_000)
})

// --FLOW ON THE LAUNCHERS, wave 13p round 26, by a decision: record first, no gates. A run
// started with --flow <flow id> names that flow, and the flow run the office files beside it names the flow and the
// revision it was at. A run started without --flow starts as before, and its flow run says it named none: nothing is
// refused for leaving the flag out. Every record here is synthetic.
// MUTATIONS (wave 13p round 26), each alone and put back:
//   1. tools/register-a-run.mjs leaves `flow` out of the record it files → the host case and the helper case red.
//   2. tools/sandbox.mjs's words for filing a run leave --flow out (anAgentsRunFiledHere drops it) → the host case red.
//   3. tools/sandbox-start.mjs's fileTheRun leaves `flow` out → the helper case red.
//   4. tools/register-a-run.mjs refuses a run with no --flow → the no-flag case red.
describe('--flow names the flow a run follows, and a run without it starts as before', () => {
  const A_FLOW_DATA = {
    declared_in: 'a synthetic flow of this test',
    runs: 'a synthetic worker',
    trigger: 'A synthetic piece of work is asked for.',
    stages: [{ n: 1, does: 'The synthetic worker does the work.', evidence: 'a synthetic commit' }],
    leaves_behind: 'a synthetic commit',
    governed_by: 'this test file',
    reviewed_at: '2026-10-05',
  }
  let flowId = ''
  let atStart = { seq: 0, contentHash: '' }

  async function theFlowRunOf(run: string): Promise<Record<string, unknown>> {
    const read = await ask('GET', `/api/sessions/${run}/flow-run`, AS_STARTER())
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.flowRun, JSON.stringify(read.body)).not.toBeNull()
    return read.body.flowRun.data as Record<string, unknown>
  }

  beforeAll(async () => {
    // A STEP SAYS WHY IT IS THERE AND NAMES A RECORD AS ITS SOURCE, so the source is filed first.
    const source = await ask('POST', '/api/records', AS_STARTER(), { kind: 'report', title: 'A synthetic reason for the step', data: { blocks: [] } })
    expect(source.status, JSON.stringify(source.body)).toBe(201)
    const stages = A_FLOW_DATA.stages.map((step) => ({ ...step, why: 'Without it the synthetic work is not done.', sources: [source.body.record.id as string] }))
    const flow = await ask('POST', '/api/records', AS_STARTER(), { kind: 'flow', title: 'A synthetic flow the launcher names', data: { ...A_FLOW_DATA, stages } })
    expect(flow.status, JSON.stringify(flow.body)).toBe(201)
    flowId = flow.body.record.id as string
    atStart = t.client.sqlite.prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(flowId) as { seq: number; contentHash: string }
  })

  it('exec --agent --flow on the host files a run that names the flow, and its flow run names the flow and its revision', async () => {
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--flow', flowId, '--json', '--', 'true'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const record = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(record.data.flow, 'the run filed on the host does not name the flow').toBe(flowId)
    const flowRun = await theFlowRunOf(start.run)
    expect(flowRun['flow']).toBe(flowId)
    expect(flowRun['flowRevision']).toEqual(atStart)
    expect(flowRun['noFlow']).toBeUndefined()
  }, 60_000)

  it('a run an agent in the sandbox starts with --flow, filed by the helper, names the flow too', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const helper = await new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession,
          '--workspace', WORKSPACE, '--api', api, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--cut-from', 'main',
          '--flow', flowId, '--', 'true',
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder) }, 'the-flow-in-the-helper'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(helper.status, helper.err).toBe(0)
    const start = JSON.parse(helper.out.trim().split('\n')[0] ?? '{}') as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    expect((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.flow, 'the run the helper filed does not name the flow').toBe(flowId)
    expect((await theFlowRunOf(start.run))['flowRevision']).toEqual(atStart)
  }, 60_000)

  it('a run started without --flow is started and filed as before, and its flow run says it named no flow', async () => {
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--json', '--', 'true'])
    expect(ran.status, `a run without --flow was refused: ${ran.err}`).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    expect((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.flow).toBeUndefined()
    const flowRun = await theFlowRunOf(start.run)
    expect(flowRun['noFlow']).toBe(NO_FLOW_NAMED)
    expect(flowRun['flow']).toBeUndefined()
  }, 60_000)
})

describe('a run finishes or crashes itself once its command ends (acceptance finding 2)', () => {
  it('finishes and seals a run whose command exits 0 with a new commit and a report; writes one exited 0 with nothing and no report orphaned, and the office tells its starter', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')

    // THE COMMAND WAITS FOR ITS REPORT, so the report is linked before it ends (acceptance finding 48): the
    // launcher finishes a run only when a report is linked to it.
    const okDir = join(scratch, 'finish-ok')
    const go = join(scratch, 'finish-ok.go')
    git(repo, 'worktree', 'add', '-b', 'finish-ok', okDir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', okDir, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done; echo made > made.txt && git add made.txt && git commit -q -m "made it"`,
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await aReportOf(start.run)
    await aWordOf(start.run, 'Done. I seal next.')
    await itsDoingLine(start.run)
    writeFileSync(go, '')
    await until('the command to have committed', () => git(okDir, 'rev-list', '--count', 'main..HEAD') === '1')
    const tip = git(okDir, 'rev-parse', 'HEAD')
    await until('the run to finish once its command ends', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'finished')
    const finished = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(finished.data.tip).toBe(tip)
    expect(typeof finished.data.sealedTip).toBe('string')
    // THE FINISH SAYS WHOSE READING IT IS: the launcher's, of a clean exit, not the agent's own word.
    expect(finished.data.detail).toContain('Finished by the launcher')

    // A CLEAN EXIT WITH NOTHING NEW COMMITTED AND NO REPORT (problem VS7qJcpmjbYZ): nothing to seal, and it never said. It
    // used to be left saying running while nobody was told; it is written orphaned now, a state that ends a run, so its key
    // goes with it, and the office tells its starter why (wave 13j round loop-1). MUTATION PROOF (the report of the run
    // that changed this): the branch taken back to leaving it as it was, and this goes red on the state and on the message.
    const idleDir = join(scratch, 'finish-idle')
    git(repo, 'worktree', 'add', '-b', 'finish-idle', idleDir, 'main')
    const idle = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', idleDir, '--cut-from', 'main', '--json',
      '--', 'true',
    ])
    expect(idle.status, idle.err).toBe(0)
    const idleStart = JSON.parse(idle.out.trim())
    groups.add(idleStart.hostPgid)
    await until('the idle command to have ended', () => !alive(idleStart.hostPid))
    await until('the idle run to be written orphaned', async () => (await ask('GET', `/api/records/${idleStart.run}`, AS_STARTER())).body.record.data.state === 'orphaned')
    const idleRecord = (await ask('GET', `/api/records/${idleStart.run}`, AS_STARTER())).body.record
    expect(idleRecord.data.detail).toContain('with no commits beyond main, and no report is linked to it')
    // register-a-run.mjs itself wrote `tip` at filing, off the worktree as it was then (main's own
    // tip): nothing here moved it on, because nothing was committed for it to move on to.
    expect(idleRecord.data.tip).toBe(git(repo, 'rev-parse', 'main'))
    expect(idleRecord.data.sealedTip).toBeUndefined()
    expect(await theOfficeToldTheStarterOnce(idleStart.run)).toEqual(['no-commits', 'no-report'])
  })

  const DSH_SHELL_SELECTION_EXPLANATION = "The DSH model and effort selection was not applied because a shell command cannot carry it; DSH's saved settings decide."

  /** A command held until its case has filed reports or finished the run itself. */
  async function aWaitingRecordsRun(name: string): Promise<{ run: string; dir: string; go: string; log: string }> {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    let checkout: string
    checkout = join(scratch, name)
    const dir = checkout
    const go = join(scratch, `${name}.go`)
    git(repo, 'worktree', 'add', '-b', name, dir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done`,
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    // IT SAYS IT SEALS, as a run that is done does: a seal on its exit, of commits or of records, is made only then (
    // WzlhElg3MepN; the inspector's refusal YZmwr7HsAvBh). A case about a run that does not say so says its own word after.
    await aWordOf(start.run, 'I seal next.')
    return { run: start.run, dir, go, log: join(answer.folder, 'logs', start.run, 'finish.log') }
  }

  /**
   * THE OFFICE TELLS THE STARTER HOW A ROUND ENDED WITHOUT A SEAL (wave 13j round loop-1, task "every round ends sealed or
   * says why"). The launcher writes how the command ended (`commandEnded`, a stored date and the exit code); the office then
   * records on the run why there is no seal (`howTheRoundEnded`) and tells the starter once, in its own line. The launcher
   * sends no message of its own for these ends any more. Answers the reasons the office found, in its order.
   * MUTATION, RUN ON 12 OCTOBER 2026: a control run first, 171 green. Then `commandEnded` in finishOrCrashTheRun was set to
   * undefined, so the launcher no longer says how the command ended. The nine cases that call this went red, and nothing
   * else did. Restored, and the control run again: 171 green.
   */
  async function theOfficeToldTheStarterOnce(runId: string): Promise<string[]> {
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${runId}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const run = (await ask('GET', `/api/records/${runId}`, AS_STARTER())).body.record
    expect(run.data.commandEnded).toEqual({ at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/), code: 0 })
    const ended = run.data.howTheRoundEnded
    expect(ended, 'the office recorded no end').toMatchObject({ sealed: false, state: run.data.state })
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { id: string; title: string; data: Record<string, any> }[]
    const told = messages.filter((one) => one.data['aboutRun'] === runId)
    expect(told, 'the starter was not told once').toHaveLength(1)
    expect(told[0]!.title).toBe('Mole Office')
    expect(told[0]!.data['body']).toBe('A round ended without a seal')
    expect(told[0]!.data['to']).toEqual([{ kind: 'agent', id: starterId }])
    expect(told[0]!.data['saidInFull']).toBe(`${String(ended.says)} ${String(ended.whatToDo)}`)
    expect(ended.starterTold).toBe(told[0]!.id)
    return (ended.reasons as { why: string }[]).map((one) => one.why)
  }

  // The proxy is a stand-in office: it records what the launcher sends and supplies its process reading.
  async function withARefusedFinish(reading: 'ended' | 'alive' | 'unreadable' | 'missing' | 'actual', action: (writes: any[], refusal: string, endRefusal: string) => Promise<void>, refuseEnd = false): Promise<void> {
    const office = api
    const writes: any[] = []
    const refusal = 'Synthetic finish refusal from the test office.'
    const endRefusal = 'Synthetic refusal to record the command end.'
    const proxy = createServer(async (req, reply) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks).toString()
      if (reading !== 'actual' && req.method === 'GET' && req.url?.endsWith('/process-ended')) {
        if (reading === 'unreadable' || reading === 'missing') reply.writeHead(reading === 'missing' ? 404 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Synthetic process reading unavailable.' }))
        else reply.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ended: reading === 'ended', says: `Synthetic process reading: ${reading}.` }))
        return
      }
      if (req.method === 'PATCH' && req.url?.startsWith('/api/records/')) {
        const sent = JSON.parse(body)
        if (sent?.dataPatch?.state === SESSION_STATES[2]) {
          reply.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: refusal }))
          return
        }
        if (sent?.dataPatch?.commandEnded !== undefined) {
          writes.push(sent.dataPatch)
          if (refuseEnd) { reply.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: endRefusal })); return }
        }
      }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>
      const response = await fetch(`${office}${req.url}`, { method: req.method, headers, ...(body ? { body } : {}) })
      reply.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }).end(await response.text())
    })
    await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
    api = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    try { await action(writes, refusal, endRefusal) } finally { api = office; await new Promise<void>((done) => proxy.close(() => done())) }
  }

  it('leaves unsealed a run whose command exits 0 with commits and a report but whose last word to its starter says it is not done', async () => {
    // A TERRA MAP ROUND WROTE IN ITS REPORT THAT IT WAS NOT DONE, AND THE LAUNCHER SEALED IT (WzlhElg3MepN, 9 Nov
    // 2026). The run's last message to its starter is read now: one that does not say it seals leaves the run as it was.
    // MUTATION PROOF: the check of the run's word taken out of the finish, and this goes red on the state and the seal.
    const start = await aWaitingRecordsRun('not-done-word')
    await aReportOf(start.run)
    await aWordOf(start.run, 'I seal next.')
    await aWordOf(start.run, 'Not done: two of five items are built; the rest is in NEXT.md.')
    writeFileSync(join(start.dir, 'not-done.txt'), 'A synthetic change.\n')
    git(start.dir, 'add', 'not-done.txt')
    git(start.dir, '-c', 'user.name=Synthetic tester', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'A synthetic change')
    writeFileSync(start.go, '')
    await until('the finish log to say the run was left as it was', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('does not say it seals'))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data.state).toBe(SESSION_STATES[0])
    expect(after.data.sealedTip).toBeUndefined()
    expect(after.data.detail).toContain('a run is sealed on its exit only when it says it seals')
    await theOfficeToldTheStarterOnce(start.run)
  })

  /** One synthetic commit of a new file in a checkout. */
  function aSyntheticCommitIn(dir: string, file: string): void {
    writeFileSync(join(dir, file), 'A synthetic change.\n')
    git(dir, 'add', file)
    git(dir, '-c', 'user.name=Synthetic tester', '-c', 'user.email=test@example.invalid', 'commit', '-qm', `A synthetic ${file}`)
  }

  it('seals a run that moved to a new worktree at the HEAD of the folder its record names now, not the one it started in', async () => {
    // A CONTINUED ROUND MOVED TO A NEW WORKTREE, AS IT WAS TOLD, AND ITS FINISH SUBMITTED THE OLD TIP (85gCDpbPamKS,
    // 9 Nov 2026): run StXrGxV5eMPt's record named the new worktree, the launcher read the old one, where it started and where the
    // earlier run's sealed tip was, and the office refused the finish with 409. The finish reads the folder the record
    // names now, inside the sandbox's own folder. MUTATION PROOF: the finish taken back to the folder it started in, and
    // this goes red on the state.
    const start = await aWaitingRecordsRun('moved-worktree-old')
    const repo = join(upAnswer!.folder, 'repo')
    const moved = join(upAnswer!.folder, 'worktrees', `moved-worktree-new-${randomBytes(4).toString('hex')}`)
    aSyntheticCommitIn(start.dir, 'earlier.txt')
    git(repo, 'worktree', 'add', '-b', basename(moved), moved, 'main')
    try {
      aSyntheticCommitIn(moved, 'moved.txt')
      const named = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), { dataPatch: { workingDirectory: moved } })
      expect(named.status, JSON.stringify(named.body)).toBe(200)
      await aReportOf(start.run)
      await itsDoingLine(start.run)
      await aWordOf(start.run, 'Round moved is done. I seal next.')
      writeFileSync(start.go, '')
      await until('the moved run to finish once its command ends', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'finished')
      const finished = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(finished.data.tip).toBe(git(moved, 'rev-parse', 'HEAD'))
      expect(typeof finished.data.sealedTip).toBe('string')
    } finally {
      spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', moved], { stdio: 'ignore' })
      rmSync(moved, { recursive: true, force: true })
    }
  })

  it('reads the folder it started in when its record names one outside the sandbox, and says so', async () => {
    // THE RECORD'S FOLDER IS READ ONLY INSIDE THE SANDBOX'S OWN FOLDER, where the launcher already reads git: a run writes
    // its own record, and a folder it names elsewhere on the host is not one the launcher reads. The finish then submits the
    // HEAD of the folder it started in, which the office refuses, so nothing is sealed. MUTATION PROOF: the bound taken
    // out, and this goes red on the finish log.
    const start = await aWaitingRecordsRun('named-outside-old')
    const repo = join(upAnswer!.folder, 'repo')
    const outside = join(scratch, `named-outside-new-${randomBytes(4).toString('hex')}`)
    aSyntheticCommitIn(start.dir, 'earlier.txt')
    git(repo, 'worktree', 'add', '-b', basename(outside), outside, 'main')
    try {
      aSyntheticCommitIn(outside, 'outside.txt')
      const named = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), { dataPatch: { workingDirectory: outside } })
      expect(named.status, JSON.stringify(named.body)).toBe(200)
      await aReportOf(start.run)
      await aWordOf(start.run, 'I seal next.')
      writeFileSync(start.go, '')
      await until("the finish log to say the record's folder was not read", () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes("which is not inside this sandbox's folder"))
      await until('the finish to have been refused', () => readFileSync(start.log, 'utf8').includes('could not be finished'))
      expect(readFileSync(start.log, 'utf8')).toContain(`so its finish reads ${start.dir}, where it started`)
      const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(after.data.state).not.toBe('finished')
      expect(after.data.sealedTip).toBeUndefined()
    } finally {
      spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', outside], { stdio: 'ignore' })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('leaves unsealed a run whose clean exit has no commits but a report, when its last word to its starter says it is not done', async () => {
    // THE RECORDS FINISH IS A SEAL TOO (the inspector's refusal of run Kb0saPpYKYty, YZmwr7HsAvBh): a run that ends with a
    // report and nothing committed was finished and sealed with its records whatever its last word said. It is read now as
    // the git seal's is. MUTATION PROOF: the word check taken out of the records finish, and this goes red on the state.
    const start = await aWaitingRecordsRun('not-done-records')
    await aReportOf(start.run)
    await aWordOf(start.run, 'Not done: two of five items are read; the rest is in NEXT.md.')
    writeFileSync(start.go, '')
    await until('the finish log to say the records run was left as it was', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('does not say it seals'))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data.state).toBe(SESSION_STATES[0])
    expect(after.data.sealedTip).toBeUndefined()
    expect(after.data.submission?.kind).not.toBe('records')
    expect(after.data.detail).toContain('a run is sealed on its exit only when it says it seals')
    expect(readFileSync(start.log, 'utf8')).toContain('with no commits beyond main, with a report')
    await theOfficeToldTheStarterOnce(start.run)
  })

  it.each(['git', 'records'] as const)('writes one crash after the office refuses a clean %s finish', async (kind) => {
    await withARefusedFinish('ended', async (writes, refusal) => {
      const start = await aWaitingRecordsRun(`refused-finish-${kind}`)
      await aReportOf(start.run)
      if (kind === 'git') {
        await aWordOf(start.run, 'I seal next.')
        writeFileSync(join(start.dir, 'refused-finish.txt'), 'A synthetic change.\n')
        git(start.dir, 'add', 'refused-finish.txt')
        git(start.dir, '-c', 'user.name=Synthetic tester', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'A synthetic change')
      }
      writeFileSync(start.go, '')
      await until('the refused finish to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('could not be finished'))
      await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
      const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(after.data.state).toBe(SESSION_STATES[3])
      expect(after.data.detail).toContain(refusal)
      expect(writes).toHaveLength(1)
      expect(writes[0]).toMatchObject({ state: SESSION_STATES[3], detail: expect.stringContaining(refusal), commandEnded: expect.objectContaining({ code: 0 }) })
      await theOfficeToldTheStarterOnce(start.run)
      expect(after.data.howTheRoundEnded.says).toContain(refusal)
    })
  }, 60_000)

  it.each(['alive', 'unreadable', 'missing'] as const)('keeps the run running if its process is %s', async (reading) => {
    await withARefusedFinish(reading, async (writes, refusal) => {
      const start = await aWaitingRecordsRun(`refused-finish-${reading}`)
      await aReportOf(start.run)
      writeFileSync(start.go, '')
      await until('the refused finish to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('could not be finished'))
      const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(after.data.state).toBe(SESSION_STATES[0])
      expect(after.data.detail).toContain(refusal)
      expect(writes).toHaveLength(1)
      expect(writes[0].state).toBeUndefined()
      expect(writes[0].commandEnded).toEqual(expect.objectContaining({ code: 0 }))
      expect(readFileSync(start.log, 'utf8')).toContain(reading === 'missing' ? 'older office' : reading === 'alive' ? 'alive' : 'unreadable')
    })
  }, 60_000)

  it('leaves the run running when the leader ended but its group still has a member', async () => {
    await withARefusedFinish('actual', async (writes, refusal) => {
      const start = await aWaitingRecordsRun('refused-finish-surviving-group')
      await aReportOf(start.run)
      const row = t.client.sqlite.prepare("SELECT key, pgid FROM session_resources WHERE session_record_id = ? AND type = 'process' ORDER BY rowid DESC LIMIT 1").get(start.run) as { key: string; pgid: number }
      const leader = Number(row.key)
      expect(row.pgid).toBe(leader)
      const oldProbe = res.osProbe()
      const process = oldProbe.processById(leader)
      expect(process).not.toBeNull()
      const member = { ...process!, pid: leader + 1_000_000, pgid: leader, command: 'synthetic surviving member' }
      res.useOsProbe({ ...oldProbe, processById: (pid) => pid === leader ? null : oldProbe.processById(pid), processesInGroup: (pgid) => pgid === leader ? [member] : oldProbe.processesInGroup(pgid) })
      try {
        writeFileSync(start.go, '')
        await until('the refused finish to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('could not be finished'))
        const reading = await ask('GET', `/api/runs/${start.run}/process-ended`, AS_STARTER())
        expect(reading.status).toBe(200)
        expect(reading.body.ended).toBe(false)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.state).toBe(SESSION_STATES[0])
        expect(after.data.detail).toContain(refusal)
        expect(writes).toHaveLength(1)
        expect(writes[0].state).toBeUndefined()
        expect(readFileSync(start.log, 'utf8')).toContain(reading.body.says)
      } finally { res.useOsProbe(oldProbe) }
    })
  }, 60_000)

  it('tells the starter both refusals when the end write is refused too', async () => {
    await withARefusedFinish('ended', async (_writes, refusal, endRefusal) => {
      const start = await aWaitingRecordsRun('refused-finish-and-end')
      await aReportOf(start.run)
      writeFileSync(start.go, '')
      await until('the failed end write to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes(endRefusal))
      const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(after.data.state).toBe(SESSION_STATES[0])
      const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { data: Record<string, any> }[]
      const told = messages.filter((message) => message.data['aboutRun'] === start.run)
      expect(told).toHaveLength(1)
      expect(told[0]!.data['body']).toContain(refusal)
      expect(told[0]!.data['body']).toContain(endRefusal)
    }, true)
  }, 60_000)

  // A REPORTED RECORDS RUN FINISHES (JF9q5cqiOPCS, o8rBHt9RtUUJ; report 0f8hOroH6MZP; u6uDyhZcnoLy).
  // MUTATIONS, each alone: restore the old leave-it-for-the-starter branch (state goes red); submit no records
  // (state goes red on the office's real refusal); add a report not linked to this run (the exact submission goes red).
  // Refuse a declared records submission (finish-records-declared goes red on state).
  // KEEP THE DECLARATION (JF9q5cqiOPCS; inspector 0kyoiWtk47Gs; secretary 2zJymt0vq1aU; USER.md invariant 2).
  // MUTATION: replace the declared list with linked reports, as the second pass did (the exact union goes red).
  // MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs; problem Grbb87VX3pND). A control run first: all green. Then the
  // finishing write sent without `tellTheStarter: 'ended-with-its-report'`: the three cases went red, because the office
  // then told nobody. Restored, and the control run again: green. The record sources are in the office's line now
  // (src/server/lib/launcher-notices.ts), so the old mutation that left them out of the launcher's message is gone.
  // The second report has a link out of the run, and the first also has a second link: both directions, each ID once.
  it.each([
    { name: 'finish-records-one', count: 1, declared: false },
    { name: 'finish-records-two', count: 2, declared: false },
    { name: 'finish-records-declared', count: 2, declared: true },
  ])('finishes $name with its declared records followed by its $count linked reports once, and tells its starter', async ({ name, count, declared }) => {
    const start = await aWaitingRecordsRun(name)
    // ITS LAST WORD SAYS ITS WHOLE FEATURE IS READY, so its seal asks for a check and is not held (src/server/lib/how-a-round-ended.ts).
    await aWordOf(start.run, `${FEATURE_READY} the made-up round ${name} is done.\nI seal next.`)
    const reports = [await aReportOf(start.run)]
    await itsDoingLine(start.run)
    const extraLink = await ask('POST', '/api/links', AS_STARTER(), { fromId: start.run, toId: reports[0], type: 'relates_to' })
    expect(extraLink.status, JSON.stringify(extraLink.body)).toBe(201)
    if (count === 2) {
      const second = await ask('POST', '/api/records', AS_STARTER(), { kind: 'report', title: aFreshReportTitle(), data: { for: 'its starter', date: '2026-09-23', chaptersRead: EVERY_CHAPTER, blocks: [{ id: 'b-1', type: 'text', text: 'More of what it did. The audit table is left for the merge queue.' }] } })
      expect(second.status, JSON.stringify(second.body)).toBe(201)
      reports.push(second.body.record.id)
      await aLabelFor(second.body.record.id, WORKSPACE)
      const linked = await ask('POST', '/api/links', AS_STARTER(), { fromId: start.run, toId: second.body.record.id, type: 'about' })
      expect(linked.status, JSON.stringify(linked.body)).toBe(201)
    }
    const unrelated = await ask('POST', '/api/records', AS_STARTER(), { kind: 'report', title: 'Synthetic report unrelated to this run', data: {} })
    expect(unrelated.status, JSON.stringify(unrelated.body)).toBe(201)
    const declaredRecords: string[] = []
    if (declared) {
      const problem = await ask('POST', '/api/records', AS_THE_WORKER(start.run), {
        kind: 'problem', title: 'Synthetic problem filed by this run', data: {},
      })
      expect(problem.status, JSON.stringify(problem.body)).toBe(201)
      await aLabelFor(problem.body.record.id, WORKSPACE)
      declaredRecords.push(problem.body.record.id, reports[0]!)
      const said = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), {
        dataPatch: { submission: { kind: 'records', records: declaredRecords } },
      })
      expect(said.status, JSON.stringify(said.body)).toBe(200)
      expect(said.body.record.data.state).toBe('running')
    }
    writeFileSync(start.go, '')
    await until('the launcher to record its finish attempt', () => theLogHolds(start.log, 'finished with a records submission'))
    const finished = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(finished.data.state).toBe('finished')
    expect(finished.data.submission).toEqual({ kind: 'records', records: expect.any(Array) })
    const records = declared ? [declaredRecords[0]!, reports[0]!, reports[1]!] : reports
    expect(finished.data.submission.records).toEqual(records)
    const seal = (await ask('GET', `/api/records/${finished.data.sealedTip}`, AS_STARTER())).body.record
    expect(seal.data.seal.records.records.map((one: { id: string }) => one.id).sort()).toEqual([...records].sort())
    expect(finished.data.submission.records).not.toContain(unrelated.body.record.id)
    expect(finished.data.detail).toContain('Finished by the launcher')
    expect(finished.data.detail).toContain('clean exit')
    expect(finished.data.detail).toContain('a report linked to it; the agent did not say finished itself')
    expect(finished.data.detail).toContain('no commits beyond main')
    expect(readFileSync(start.log, 'utf8')).toContain('finished with a records submission')
    // THE OFFICE TELLS THE STARTER, NOT THE LAUNCHER UNDER THE RUN'S KEY (problem Grbb87VX3pND, way (c)): the
    // finishing write carries the notice kind, and the office writes its own line from the seal, the run's earlier
    // declaration and the reports linked to it. So the round is not held on the launcher's words.
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { title: string; data: Record<string, any> }[]
    expect(messages.filter((one) => one.data['aboutRun'] === start.run && one.title === `Run ${start.run} ended with its report`), 'the launcher still sent its own message').toEqual([])
    const told = messages.filter((one) => one.data['aboutRun'] === start.run && one.data['notice'] === 'aRunEndedWithItsReport')
    expect(told, 'the office did not tell the starter').toHaveLength(1)
    expect(told[0]!.data['sentBy']).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    expect(told[0]!.data['to']).toEqual([{ kind: 'agent', id: starterId }])
    const sources = declared ? ` The run had declared ${declaredRecords.join(', ')} itself.` : ''
    expect(told[0]!.data['saidInFull']).toBe(`Run ${start.run} ended with its report. The write that finished it says the launcher read its command's clean exit; the agent did not say finished itself. It was finished with a records submission naming ${records.join(', ')}, and sealed as ${String(finished.data.sealedTip)}.${sources} Reports linked to it: ${reports.join(', ')}.`)
    expect(finished.data.howTheRoundEnded).toMatchObject({ sealed: true })
    expect(finished.data.howTheRoundEnded.theCheck).not.toBe('held')
  })

  // UNKNOWN COMMITS ARE NOT NO COMMITS (JF9q5cqiOPCS; grXLjepB1ocT; AS8_ujW50e_Y; USER.md invariant 2).
  // MUTATION: read has === null as no commits, as the first pass did (unchanged data goes red).
  // Both a lost worktree and a lost cut leave all run data unchanged and tell the starter once. A lost cut is a run
  // filed with no recorded commit whose branch is renamed in a clone with no trunk, so neither the launcher nor the
  // office can read it, and both say whether it holds commits is not known. The case after reads a renamed cut by the
  // commit the run was filed with. A run filed with no recorded commit is one filed before register-a-run recorded it,
  // so the field is taken out of the stored run in the test office's database, and no write in the worker's name is
  // asked for it.
  it.each([
    { name: 'finish-records-unreadable', lost: 'worktree', told: 'commits-not-known' },
    { name: 'finish-records-cut-unreadable', lost: 'cut', told: 'commits-not-known' },
  ])('leaves $name unchanged and tells its starter $told', async ({ name, lost, told }) => {
    const start = await aWaitingRecordsRun(name)
    await aReportOf(start.run)
    let remoteHead: string | null = null
    if (lost === 'cut') {
      const unrecorded = t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.cutFromCommit') WHERE id = ?").run(start.run)
      expect(unrecorded.changes).toBe(1)
    }
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    if (lost === 'cut') expect(before.data.cutFromCommit).toBeUndefined()
    if (lost === 'worktree') rmSync(join(start.dir, '.git'))
    else {
      git(start.dir, 'branch', '-m', 'main', 'synthetic-lost-cut')
      try { remoteHead = git(start.dir, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD') } catch { remoteHead = null }
      if (remoteHead !== null) git(start.dir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD')
    }
    try {
      writeFileSync(start.go, '')
      await until('the launcher to record the unreadable work', () => theLogHolds(start.log, 'left as running because whether it holds commits is not known'))
      await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
      const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      const read = lost === 'worktree' ? { notRead: expect.stringContaining(`git could not read a commit at HEAD in ${start.dir} (`) } : { commit: git(start.dir, 'rev-parse', 'HEAD') }
      expect(after.data).toEqual({ ...before.data, ...THE_END_WRITTEN, ...theEndHeadOf(start.dir, read) })
      expect(after.data.state).toBe('running')
      expect(after.data.sealedTip).toBeUndefined()
      expect(readFileSync(start.log, 'utf8')).toContain('left as running because whether it holds commits is not known')
      expect(after.data.detail).toBe("Its command exited 0, and its worktree or the branch it was cut from could not be read, and a report is linked to it. Whether it holds commits is not known, so the launcher did not finish it. The run's agent or its starter finishes it once its work can be read." + '\n' + DSH_SHELL_SELECTION_EXPLANATION)
      expect(await theOfficeToldTheStarterOnce(start.run)).toEqual([told])
    } finally {
      if (lost === 'cut') git(start.dir, 'branch', '-m', 'synthetic-lost-cut', 'main')
      if (remoteHead !== null) git(start.dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', remoteHead)
    }
  })

  // A RECORDED COMMIT OF NO SHAPE THE OFFICE READS MEETS THE DOOR'S REFUSAL, NOT AN ACCOUNT OF THE ROUND. The record
  // door refuses such a cutFromCommit when it is written, so a run holds one only from before that refusal, and the case
  // writes it straight into the test office's database. The launcher reads the cut as not known, and the office refuses
  // its write of how the command ended in the door's words, so the run is left as it was and the launcher tells the
  // starter that refusal itself.
  // MUTATION: take the session's entry out of CROSS_CHECKS in src/shared/kinds.ts (the end is written, red).
  it('leaves a run with a malformed recorded commit as it was, and tells its starter the door refused its end', async () => {
    const start = await aWaitingRecordsRun('finish-records-cut-malformed')
    await aReportOf(start.run)
    const malformed = t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.cutFromCommit', json(?)) WHERE id = ?")
      .run(JSON.stringify({ named: 'main', commit: 'not-a-commit' }), start.run)
    expect(malformed.changes).toBe(1)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(before.data.cutFromCommit).toEqual({ named: 'main', commit: 'not-a-commit' })
    writeFileSync(start.go, '')
    await until('the launcher to record the refused end', () => theLogHolds(start.log, 'left as running because whether it holds commits is not known; its end could not be written (400: '))
    const shape = A_CUT_FROM_COMMIT_IS
    const log = readFileSync(start.log, 'utf8')
    expect(log).toContain('left as running because whether it holds commits is not known; its end could not be written (400: ')
    expect(log).toContain(shape)
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data).toEqual(before.data)
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { title: string; data: Record<string, any> }[]
    const told = messages.filter((one) => one.data['aboutRun'] === start.run)
    expect(told.map((one) => one.title)).toEqual([`Run ${start.run}'s end could not be written`])
    expect(told[0]!.data['body']).toContain(shape)
  })

  // A CUT NAMED AGAIN AFTER THE FILING IS READ BY ITS NEW NAME, as the office reads it (theBaseARunNames in
  // src/server/lib/sealed-tip.ts), so the launcher and the office give one answer. The run is filed cut from main, its
  // worktree then holds a commit beyond main, and its record's cutFrom is changed to a branch at that commit, in the
  // test office's database so that no write in the worker's name is asked for it.
  // MUTATION: read the cut by the name the launcher was given, as it did before (commits beyond main, the run is left
  // running, red).
  it('finishes a run whose cutFrom was changed after filing, by the name its record gives', async () => {
    const start = await aWaitingRecordsRun('finish-records-cut-changed')
    await aReportOf(start.run)
    await itsDoingLine(start.run)
    writeFileSync(join(start.dir, 'later.txt'), 'Synthetic later work.\n')
    git(start.dir, 'add', 'later.txt')
    git(start.dir, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Synthetic later work')
    git(start.dir, 'branch', 'synthetic-later-base', 'HEAD')
    try {
      expect(git(start.dir, 'rev-list', '--count', 'main..HEAD')).toBe('1')
      const changed = t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.cutFrom', ?) WHERE id = ?").run('synthetic-later-base', start.run)
      expect(changed.changes).toBe(1)
      const filed = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(filed.data.cutFromCommit).toEqual({ named: 'main', commit: git(start.dir, 'rev-parse', 'main') })
      writeFileSync(start.go, '')
      await until('the launcher to record its finish attempt', () => theLogHolds(start.log, 'finished with a records submission'))
      const finished = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(finished.data.state, finished.data.detail).toBe('finished')
      expect(finished.data.detail).toContain('no commits beyond synthetic-later-base')
      expect(readFileSync(start.log, 'utf8')).toContain('finished with a records submission')
    } finally {
      git(start.dir, 'branch', '-D', 'synthetic-later-base')
    }
  })

  // A CUT NAMED AS AN OPTION IS NOT KNOWN, AND GIT NEVER READS IT. The record's cutFrom is the name the launcher reads.
  // Handed to git rev-list, a cutFrom of --output=<file> is read as an option, and rev-list opens that file for writing.
  // The record door refuses a cutFrom that starts with - when it is written, so a run holds one only from before that
  // refusal, and the case writes it straight into the test office's database. The launcher reads the cut as not known,
  // and the office refuses its write of how the command ended in the door's words, so the run is left as it was and the
  // launcher tells the starter that refusal itself.
  // MUTATION: take out the guard at the top of hasCommitsBeyondTheCut in tools/sandbox-start.mjs (the file is written,
  // red).
  it('leaves a run whose cutFrom starts with - as it was, writes no file it names, and tells its starter the door refused its end', async () => {
    const start = await aWaitingRecordsRun('finish-records-cut-option')
    await aReportOf(start.run)
    const target = mkdtempSync(join(scratch, 'cut-as-an-option-'))
    const changed = t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.cutFrom', ?) WHERE id = ?").run(`--output=${join(target, 'x')}`, start.run)
    expect(changed.changes).toBe(1)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    writeFileSync(start.go, '')
    await until('the launcher to record the refused end', () => theLogHolds(start.log, 'left as running because whether it holds commits is not known; its end could not be written (400: '))
    expect(readdirSync(target)).toEqual([])
    const log = readFileSync(start.log, 'utf8')
    expect(log).toContain('left as running because whether it holds commits is not known; its end could not be written (400: ')
    expect(log).toContain(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH)
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data).toEqual(before.data)
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { title: string; data: Record<string, any> }[]
    const told = messages.filter((one) => one.data['aboutRun'] === start.run)
    expect(told.map((one) => one.title)).toEqual([`Run ${start.run}'s end could not be written`])
    expect(told[0]!.data['body']).toContain(A_CUT_FROM_MAY_NOT_START_WITH_A_DASH)
  })

  // A RENAMED CUT IS READ BY THE COMMIT THE RUN WAS FILED WITH, while the run's cutFrom is still the name that commit was
  // recorded under, as the office reads it (theBaseARunNames in src/server/lib/sealed-tip.ts). So the launcher and the
  // office give one answer, and the launcher's words keep the name.
  // MUTATION: read the cut by its name only, as the launcher did before (the run is left running, red).
  it('finishes a run whose cut branch was renamed, by the commit it was filed with', async () => {
    const start = await aWaitingRecordsRun('finish-records-cut-renamed')
    await aReportOf(start.run)
    await itsDoingLine(start.run)
    const filed = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(filed.data.cutFromCommit).toEqual({ named: 'main', commit: git(start.dir, 'rev-parse', 'main') })
    git(start.dir, 'branch', '-m', 'main', 'synthetic-renamed-cut')
    try {
      writeFileSync(start.go, '')
      await until('the launcher to record its finish attempt', () => theLogHolds(start.log, 'finished with a records submission'))
      const finished = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
      expect(finished.data.state, finished.data.detail).toBe('finished')
      expect(finished.data.detail).toContain('no commits beyond main')
      expect(readFileSync(start.log, 'utf8')).toContain('finished with a records submission')
    } finally {
      git(start.dir, 'branch', '-m', 'synthetic-renamed-cut', 'main')
    }
  })

  // A REPORT DOES NOT REPLACE DECLARED FILES, GIT OR MIXED WORK (JF9q5cqiOPCS; grXLjepB1ocT;
  // AS8_ujW50e_Y; USER.md invariant 2). MUTATION: ignore the declared submission, as the first pass did
  // (unchanged data and submission go red). The files case names the staged folder and landing root.
  it.each(['files', 'git', 'mixed'])('leaves a declared %s submission unchanged with a linked report, and tells its starter the kind', async (kind) => {
    const start = await aWaitingRecordsRun(`finish-declared-${kind}`)
    const report = await aReportOf(start.run)
    const stagedAt = join(scratch, `declared-${kind}-staged`)
    const root = join(scratch, `declared-${kind}-root`)
    mkdirSync(stagedAt)
    mkdirSync(root)
    writeFileSync(join(stagedAt, 'synthetic.txt'), 'Synthetic staged work.\n')
    const submission = kind === 'files' ? { kind, stagedAt, root } : kind === 'mixed' ? { kind, records: [report] } : { kind }
    const said = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), {
      dataPatch: { submission },
    })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    writeFileSync(start.go, '')
    await until('the launcher to record the declared submission', () => theLogHolds(start.log, `left as running because it declared a ${kind} submission`))
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data).toEqual({ ...before.data, ...THE_END_WRITTEN, ...theEndHeadOf(start.dir, { commit: git(start.dir, 'rev-parse', 'HEAD') }) })
    expect(after.data.state).toBe('running')
    expect(after.data.submission).toEqual(submission)
    expect(after.data.sealedTip).toBeUndefined()
    expect(readFileSync(start.log, 'utf8')).toContain(`left as running because it declared a ${kind} submission`)
    expect(after.data.detail).toBe(`Its command exited 0 with no commits beyond main, and a report is linked to it. It declared a ${kind} submission. The launcher does not replace a declared submission. The run's agent or its starter finishes it with the work it declared.` + '\n' + DSH_SHELL_SELECTION_EXPLANATION)
    expect(await theOfficeToldTheStarterOnce(start.run)).toEqual(['no-commits'])
  })

  // 6Paftos39g9R / inspector's 23C-VqzZcPAQ. MUTATION: put String(submission?.kind) back
  // in the starter's sentence, so the absent kind is called undefined instead of read as git.
  it('leaves a submission with no kind unfinished with a linked report, and tells its starter it is read as git', async () => {
    const start = await aWaitingRecordsRun('finish-declared-no-kind')
    await aReportOf(start.run)
    const said = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), {
      dataPatch: { submission: {} },
    })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    writeFileSync(start.go, '')
    await until('the launcher to record the submission with no kind', () => theLogHolds(start.log, 'declared a submission with no kind, which the office reads as git'))
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data).toEqual({ ...before.data, ...THE_END_WRITTEN, ...theEndHeadOf(start.dir, { commit: git(start.dir, 'rev-parse', 'HEAD') }) })
    expect(after.data.state).toBe('running')
    expect(after.data.submission).toEqual({})
    expect(after.data.detail).toBe("Its command exited 0 with no commits beyond main, and a report is linked to it. It declared a submission with no kind, which the office reads as git. The launcher does not replace a declared submission. The run's agent or its starter finishes it with the work it declared." + '\n' + DSH_SHELL_SELECTION_EXPLANATION)
    expect(await theOfficeToldTheStarterOnce(start.run)).toEqual(['no-commits'])
    const told = (((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { data: Record<string, any> }[]).filter((one) => one.data['aboutRun'] === start.run)
    expect(JSON.stringify(told) + JSON.stringify(after.data) + readFileSync(start.log, 'utf8')).not.toContain('undefined')
  })

  // AN UNREADABLE RUN WITH NO REPORT STILL ENDS ORPHANED (JF9q5cqiOPCS; grXLjepB1ocT; AS8_ujW50e_Y;
  // USER.md invariant 2): no successful work is claimed, and the failed git read is stated in its message.
  // MUTATION: return without orphaning when has === null and no report is linked (state goes red).
  it('writes an unreadable run with no report orphaned, and tells its starter that the work could not be read', async () => {
    const start = await aWaitingRecordsRun('finish-unreadable-no-report')
    rmSync(join(start.dir, '.git'))
    writeFileSync(start.go, '')
    await until('the launcher to record the orphaned unreadable run', () => theLogHolds(start.log, 'orphaned'))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data.state).toBe('orphaned')
    expect(after.data.submission).toBeUndefined()
    expect(after.data.sealedTip).toBeUndefined()
    expect(after.data.detail).toBe('Its command exited 0, and its worktree or the branch it was cut from could not be read, and no report is linked to it. Nothing runs for it any more, and it never said whether it did its work.' + '\n' + DSH_SHELL_SELECTION_EXPLANATION)
    expect(await theOfficeToldTheStarterOnce(start.run)).toEqual(['commits-not-known', 'no-report'])
  })

  // A REAL OFFICE REFUSAL: move the report's row to another project, keeping the stale link in this test database.
  // captureRecords refuses a report outside the run's project; no proxy invents the answer. MUTATIONS, each alone:
  // restore the old leave-the-run-unchanged branch (state goes red); submit no records (the detail goes red);
  // omit the notice (the message count goes red); omit the refusal detail (the notice goes red).
  it('records the refused records finish and tells the starter once', async () => {
    const start = await aWaitingRecordsRun('finish-records-refused')
    const report = await aReportOf(start.run)
    await itsDoingLine(start.run)
    const project = await ask('POST', '/api/workspaces', AS_STARTER(), { id: 'records-elsewhere', title: 'Synthetic other project' })
    expect(project.status, JSON.stringify(project.body)).toBe(201)
    t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run('records-elsewhere', report)
    const linked = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.links
    expect(linked.map((one: { other: { id: string } }) => one.other.id)).toContain(report)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    writeFileSync(start.go, '')
    await until('the launcher to record the refused finish', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('could not be finished'))
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data.state).toBe(SESSION_STATES[3])
    expect(after.data.submission).toEqual(before.data.submission)
    expect(after.data.sealedTip).toBeUndefined()
    expect(after.data.detail).toContain(report)
    expect(after.data.detail).toContain(WORKSPACE)
    // ONLY THE REFUSAL: a finish the office refused is not said to have ended with its report (problem Grbb87VX3pND).
    await theOfficeToldTheStarterOnce(start.run)
    expect(after.data.howTheRoundEnded.says).toContain(after.data.detail)
  })

  // A DECLARED RECORD MUST REACH captureRecords (JF9q5cqiOPCS; inspector 0kyoiWtk47Gs;
  // secretary 2zJymt0vq1aU; USER.md invariant 2). This other-project problem has no report link.
  // MUTATION: drop the declared record before the finish (the refusal detail goes red when the finish succeeds).
  it('records the refusal to capture a declared record and tells the starter once', async () => {
    const start = await aWaitingRecordsRun('finish-declared-record-refused')
    await aReportOf(start.run)
    await itsDoingLine(start.run)
    const project = await ask('POST', '/api/workspaces', AS_STARTER(), { id: 'declared-record-elsewhere', title: 'Synthetic other project for a declared record' })
    expect(project.status, JSON.stringify(project.body)).toBe(201)
    const problem = await ask('POST', '/api/records', AS_THE_WORKER(start.run), {
      kind: 'problem', title: 'Synthetic declared problem in another project', data: {},
    })
    expect(problem.status, JSON.stringify(problem.body)).toBe(201)
    const declared = problem.body.record.id as string
    await aLabelFor(declared, WORKSPACE)
    t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run('declared-record-elsewhere', declared)
    const said = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), {
      dataPatch: { submission: { kind: 'records', records: [declared] } },
    })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    writeFileSync(start.go, '')
    await until('the launcher to record the refused declared record', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes('could not be finished'))
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(after.data.state).toBe(SESSION_STATES[3])
    expect(after.data.submission).toEqual(before.data.submission)
    expect(after.data.sealedTip).toBeUndefined()
    expect(after.data.detail).toContain(declared)
    expect(after.data.detail).toContain(WORKSPACE)
    // ONLY THE REFUSAL: a finish the office refused is not said to have ended with its report (problem Grbb87VX3pND).
    await theOfficeToldTheStarterOnce(start.run)
    expect(after.data.howTheRoundEnded.says).toContain(after.data.detail)
  })

  // THE AGENT'S OWN FINISH IS ALREADY RIGHT. MUTATION: remove the RUN_ALREADY_OVER return (its data goes red).
  it('leaves a run that finished itself with a records submission unchanged when its command exits', async () => {
    const start = await aWaitingRecordsRun('finish-records-already-over')
    const report = await aReportOf(start.run)
    const said = await ask('PATCH', `/api/records/${start.run}`, AS_THE_WORKER(start.run), {
      dataPatch: { state: 'finished', submission: { kind: 'records', records: [report] }, detail: 'The synthetic worker says it finished itself.' },
    })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
    const before = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    const messagesBefore = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { id: string; data: Record<string, any> }[]
    const aboutBefore = messagesBefore.filter((one) => one.data['aboutRun'] === start.run).map((one) => one.id).sort()
    writeFileSync(start.go, '')
    await until('the launcher to observe the run is already over', () => theLogHolds(start.log, 'already says finished'))
    expect(readFileSync(start.log, 'utf8')).toContain('already says finished')
    expect((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data).toEqual(before.data)
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { id: string; data: Record<string, any> }[]
    expect(messages.filter((one) => one.data['aboutRun'] === start.run).map((one) => one.id).sort()).toEqual(aboutBefore)
  })

  // THE BACKGROUND COPY OUTLIVES ITS CLOSED PIPES (problem L4eF2QCY-XxU, found by a worker; message
  // MvwFTjLvpjsa, 25 September 2026). The front destroys both pipes once it has passed the start line on, and a loaded
  // machine can stop the background copy between the start line and the "is running" line long enough that that line
  // meets the closed pipe; the EPIPE then ended the copy, and the run was never finished or crashed. The test's pause
  // (SANDBOX_PAUSE_AFTER_THE_START_LINE_MS) makes the closed pipe certain. MUTATION PROOF, 25 September 2026, alone in
  // tools/sandbox-start.mjs: nobodyReadsThisCopyAnyMore no longer ignoring write errors, and this goes red on the run
  // never being marked crashed.
  it('crashes a run whose command exits 3 even when its "is running" line meets pipes the front has closed, and keeps the line in helper.log', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const dir = join(scratch, 'pipes-gone')
    const go = join(scratch, 'pipes-gone.go')
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', 'pipes-gone', dir, 'main')
    const front = await new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession,
          '--workspace', WORKSPACE, '--api', api, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
          '--worktree', dir, '--cut-from', 'main', '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done; exit 3`,
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder), SANDBOX_PAUSE_AFTER_THE_START_LINE_MS: '800' }, 'the-pipes-gone'), detached: true },
      )
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(front.status, front.err).toBe(0)
    const start = JSON.parse(front.out.trim().split('\n')[0] ?? '{}') as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    await until('the "is running" line to be in helper.log', () => theLogHolds(join(answer.folder, 'logs', start.run, 'helper.log'), `run ${start.run} of ${WORKER} is running`))
    writeFileSync(go, '')
    await until('the run to be marked crashed once its command exits 3', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'crashed')
    const helperLog = join(answer.folder, 'logs', start.run, 'helper.log')
    expect(existsSync(helperLog)).toBe(true)
    expect(readFileSync(helperLog, 'utf8')).toContain(`run ${start.run} of ${WORKER} is running`)
  }, 60_000)

  // ACCEPTANCE FINDING 48 (report EnJvvsDTF_Dx, block f-48): a supervisor under `claude -p` exits whenever it
  // ends a turn, and a clean exit with commits was read as done, which sealed wave 3 in the middle. A run with no
  // report linked to it is left as it was, its detail says why, and its starter is told in one message.
  // MUTATION PROOF, 23 September 2026, each alone: the report left unasked, and this goes red on the run being
  // finished; the starter left untold, and it goes red on the message; the finish's detail left off, and the
  // case above goes red.
  it('leaves a run whose command exits 0 with a commit but no report as it was, and tells its starter', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    const dir = join(scratch, 'finish-no-report')
    git(repo, 'worktree', 'add', '-b', 'finish-no-report', dir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', 'echo made > made.txt && git add made.txt && git commit -q -m "made it"',
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await until('the launcher to say why it left the run', async () => String((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.detail ?? '').includes('no report is linked to it'))
    const left = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(left.data.state).toBe('running')
    expect(left.data.sealedTip).toBeUndefined()
    expect(left.data.detail).toContain('so the launcher left it as it was rather than finish it')
    await until('the office to record how the round ended', async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    expect(await theOfficeToldTheStarterOnce(start.run)).toEqual(['no-report'])
  })

  // A READ OF THE RUN THAT FAILED IS NOT A RUN WITH NOTHING IN IT (the inspector's refusal of run EbxcKTrBw7vQ, check
  // 0NieBpY989OO; invariant 5). The run's record is moved to another project while its command waits, so the helper's read
  // when the command ends is refused: nothing may then be guessed about its report or its state. Its starter is told the
  // record could not be read, and the run is not written orphaned. MUTATION PROOF (the report of the run that added it):
  // the guard taken out, and this goes red on the message and the state.
  it('tells the starter of a run whose record cannot be read when its command ends, and guesses nothing', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    const dir = join(scratch, 'finish-unreadable')
    const go = join(scratch, 'finish-unreadable.go')
    git(repo, 'worktree', 'add', '-b', 'finish-unreadable', dir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done`,
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    const project = await ask('POST', '/api/workspaces', AS_STARTER(), { id: 'elsewhere', title: 'Another project' })
    expect([201, 409], JSON.stringify(project.body)).toContain(project.status)
    const moved = await ask('POST', `/api/records/${start.run}/workspace`, AS_STARTER(), { to: 'elsewhere' })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    writeFileSync(go, '')
    // jsmVnlj5rm6U: finish.log appears before the helper appends the line this case checks.
    const finishLog = join(answer.folder, 'logs', start.run, 'finish.log')
    const theFinishLog = (): string => existsSync(finishLog) ? readFileSync(finishLog, 'utf8') : '(none)'
    await until('the finish log to say "but its record could not be read"', () => theFinishLog().includes('but its record could not be read')).catch((why) => {
      throw new Error(`${String(why)}\n--- finish.log:\n${theFinishLog()}`)
    })
    expect(theFinishLog()).toContain('but its record could not be read')
    const about = async () =>
      (((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { title: string; data: Record<string, any> }[]).filter((one) => one.data['aboutRun'] === start.run)
    expect((await about()).filter((one) => one.title === 'Mole Office' || one.title.includes('no commits and no report'))).toEqual([])
    // AND IT WAS NOT ENDED: read where it now is, it still says running, and no end of the round is recorded on it.
    const where = await fetch(`${api}/api/records/${start.run}`, { headers: { 'x-mole-office-workspace': 'elsewhere', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER } })
    const read = ((await where.json()) as { record: { data: { state: string; commandEnded?: unknown; howTheRoundEnded?: unknown } } }).record.data
    expect(read.state).toBe('running')
    expect(read.commandEnded).toBeUndefined()
    expect(read.howTheRoundEnded).toBeUndefined()
  })

  // A WRITE ANNOUNCED IS NOT A WRITE DONE (problem a23nbyIF9AI_, the inspector's note on run EbxcKTrBw7vQ; invariant 1). The
  // starter of a run that ended with nothing and no report is told by the office, from the write that orphans it (wave 13j
  // round loop-1). A proxy in front of the office refuses that one write here, so the office records nothing and says
  // nothing: the launcher's one message tells the starter why the run ended and that the write was refused, while the key
  // still works. MUTATION PROOF (the report of the run that added it): the message taken out, and this goes red on it.
  it('tells the starter again when the office refuses to write a run orphaned, and the run still runs', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    const dir = join(scratch, 'finish-refused')
    const go = join(scratch, 'finish-refused.go')
    git(repo, 'worktree', 'add', '-b', 'finish-refused', dir, 'main')
    const office = api
    let refused = 0
    const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'])
    const proxy = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        void (async () => {
          const body = Buffer.concat(chunks)
          if (req.method === 'PATCH' && (req.url ?? '').startsWith('/api/records/') && body.toString().includes('"orphaned"')) {
            refused += 1
            res.writeHead(409, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'This test office refuses to write this run orphaned.' }))
            return
          }
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([k, v]) => !HOP_BY_HOP.has(k) && typeof v === 'string')) as Record<string, string>
          const answered = await fetch(`${office}${req.url ?? ''}`, { method: req.method, headers, ...(body.length > 0 ? { body } : {}) })
          res.writeHead(answered.status, { 'content-type': answered.headers.get('content-type') ?? 'application/json' })
          res.end(await answered.text())
        })()
      })
    })
    await new Promise<void>((ready) => proxy.listen(0, '127.0.0.1', ready))
    // THE RUN IS STARTED THROUGH THE PROXY, and its helper keeps that address for the run's whole life.
    api = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
    let ran: Ran
    try {
      ran = await sandbox([
        'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
        '--worktree', dir, '--cut-from', 'main', '--json',
        '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done`,
      ])
    } finally {
      api = office
    }
    try {
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      writeFileSync(go, '')
      await until('the helper to write its finish log line', () => theLogHolds(join(answer.folder, 'logs', start.run, 'finish.log'), 'but it could not be written orphaned'))
      expect(readFileSync(join(answer.folder, 'logs', start.run, 'finish.log'), 'utf8')).toContain('but it could not be written orphaned')
      expect(refused, 'the orphaned write did not reach the proxy').toBe(1)
      const told = (((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { title: string; data: Record<string, any> }[]).filter((one) => one.data['aboutRun'] === start.run)
      expect(told.map((one) => one.title)).toEqual([`Run ${start.run} could not be written orphaned`])
      expect(String(told[0]!.data['body'])).toContain('and no report is linked to it. Nothing runs for it any more')
      expect(String(told[0]!.data['body'])).toContain('so it still says running and its key still works')
      // AND IT STILL RUNS: the write was refused, so nothing ended it.
      expect((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state).toBe('running')
    } finally {
      proxy.close()
    }
  })

  it('crashes a run whose command exits non-zero, naming the exit code, and never seals it even if it committed something', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    const badDir = join(scratch, 'finish-bad')
    git(repo, 'worktree', 'add', '-b', 'finish-bad', badDir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', badDir, '--cut-from', 'main', '--json',
      '--', 'sh', '-c', 'echo made > made.txt && git add made.txt && git commit -q -m "made it too" && exit 7',
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await until('the run to be marked crashed once its command ends', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'crashed')
    const crashed = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(crashed.data.detail).toContain('exited 7')
    // The commit it made before exiting 7 is never sealed: `tip` stays what register-a-run.mjs
    // filed it as (main's tip at filing), and no sealed_tip record is made.
    expect(crashed.data.tip).toBe(git(repo, 'rev-parse', 'main'))
    expect(crashed.data.sealedTip).toBeUndefined()
  })

  /**
   * A FINISH IS WAITED FOR PAST THE ORDINARY REQUEST BOUND, AND A FINISH THAT GETS NO ANSWER IS READ BACK BEFORE IT IS
   * CALLED REFUSED. On 18 November 2026 the office took up to 45.5 s to answer record PATCHes: four clean rounds were
   * written as refused finishes with no seal, and a fifth was finished and sealed 4 s after the launcher had given up.
   * These cases use a sandbox whose template shortens the launcher's waits, so no case waits 30 s or more in real time.
   * The test office answers in milliseconds, so 2 s is ample for every launcher request; the finish gets 6 s, and the
   * stand-in answers it at 3 s, after the ordinary bound and before the finish bound; the read-back searches for 1.5 s
   * in five short tries. The constants the launcher really waits on are read in the last case.
   */
  describe('a finish that waits longer, and is read back before it is called refused', () => {
    const SLOW = 'slow-finish'
    let slow: { container: string; resource: string; folder: string }

    beforeAll(async () => {
      const own = join(scratch, 'a-template-that-shortens-the-launchers-waits')
      mkdirSync(own, { recursive: true })
      const config = JSON.parse(readFileSync(join(template, 'devcontainer.json'), 'utf8')) as { containerEnv?: Record<string, string> }
      config.containerEnv = {
        ...(config.containerEnv ?? {}),
        [THE_TEST_MARK]: String(process.pid),
        SANDBOX_REQUEST_TIMEOUT_MS: '2000',
        SANDBOX_FINISH_WAIT_MS: '6000',
        SANDBOX_FINISH_READ_BACK_MS: '1500',
      }
      writeFileSync(join(own, 'devcontainer.json'), JSON.stringify(config, null, 2))
      writeFileSync(join(own, 'sandbox.json'), readFileSync(join(template, 'sandbox.json')))
      const up = await sandbox(['up', own, '--name', SLOW, '--from', main, '--dsh', dsh, '--json'])
      expect(up.status, up.err).toBe(0)
      slow = JSON.parse(up.out.trim()) as typeof slow
      writeRoundStartRules(slow.folder, join(slow.folder, 'repo'))
    }, 120_000)

    /** A command in a worktree of this sandbox, held until its case writes its go file. */
    async function aHeldRun(name: string): Promise<{ run: string; dir: string; go: string; log: string }> {
      const repo = join(slow.folder, 'repo')
      const dir = join(scratch, name)
      const go = join(scratch, `${name}.go`)
      git(repo, 'worktree', 'add', '-b', name, dir, 'main')
      const ran = await sandbox([
        'exec', SLOW, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
        '--worktree', dir, '--cut-from', 'main', '--json',
        '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done`,
      ])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      await aWordOf(start.run, 'I seal next.')
      return { run: start.run, dir, go, log: join(slow.folder, 'logs', start.run, 'finish.log') }
    }

    type TheStandInsAnswer = { store: boolean; answer: { afterMs: number } | 'never' | 'refuse'; theFirstReadBackGetsNoAnswer?: boolean }

    /**
     * A STAND-IN OFFICE IN FRONT OF THE TEST OFFICE THAT CAN STORE A FINISHING WRITE AND ANSWER LATE, STORE IT AND NEVER
     * ANSWER, HOLD IT WITHOUT STORING IT, OR REFUSE IT. It counts the finishing writes, the refused finishes and the
     * launcher's read-backs of the run: a read of the run whose session header is the run itself, so the test's own reads
     * as the starter are not counted. The process reading is the stand-in's, so a refused finish is written at once.
     */
    async function withASlowFinish(
      options: TheStandInsAnswer,
      action: (seen: { finishes: any[]; refusals: any[]; readsOfTheRun: () => number }, refusal: string) => Promise<void>,
    ): Promise<void> {
      const office = api
      const finishes: any[] = []
      const refusals: any[] = []
      const refusal = 'Synthetic refusal of the finishing write from the test office.'
      let theFinishWasSent = false
      let reads = 0
      const proxy = createServer(async (req, reply) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks).toString()
        const url = req.url ?? ''
        const runPath = /^\/api\/records\/([^/?]+)\/?$/.exec(url)
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>
        if (runPath !== null && req.method === 'GET' && theFinishWasSent && headers['x-mole-office-session'] === runPath[1]) {
          reads += 1
          if (options.theFirstReadBackGetsNoAnswer === true && reads === 1) return
        }
        if (runPath !== null && req.method === 'PATCH') {
          const sent = JSON.parse(body)
          if (sent?.dataPatch?.state === SESSION_STATES[2]) {
            theFinishWasSent = true
            finishes.push(sent.dataPatch)
            if (options.answer === 'refuse') {
              reply.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: refusal }))
              return
            }
            if (!options.store) return
            const response = await fetch(`${office}${url}`, { method: req.method, headers, body })
            if (options.answer !== 'never') {
              const text = await response.text()
              setTimeout(() => {
                if (reply.destroyed) return
                reply.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }).end(text)
              }, options.answer.afterMs)
            }
            return
          }
          if (sent?.dataPatch?.state === SESSION_STATES[3]) refusals.push(sent.dataPatch)
        }
        if (req.method === 'GET' && url.endsWith('/process-ended')) {
          reply.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ended: true, says: 'Synthetic process reading: ended.' }))
          return
        }
        const response = await fetch(`${office}${url}`, { method: req.method, headers, ...(body ? { body } : {}) })
        reply.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }).end(await response.text())
      })
      await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
      api = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
      try { await action({ finishes, refusals, readsOfTheRun: () => reads }, refusal) } finally { api = office; await new Promise<void>((done) => proxy.close(() => done())) }
    }

    it('finishes and seals a git run whose finishing answer comes after the ordinary request bound', async () => {
      await withASlowFinish({ store: true, answer: { afterMs: 3000 } }, async (seen) => {
        const start = await aHeldRun('slow-finish-git-answered-late')
        await aReportOf(start.run)
        await itsDoingLine(start.run)
        aSyntheticCommitIn(start.dir, 'slow-finish-answered.txt')
        const tip = git(start.dir, 'rev-parse', 'HEAD')
        writeFileSync(start.go, '')
        await until('the slow finish to be read as finished', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === SESSION_STATES[2], 30_000)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.tip).toBe(tip)
        expect(typeof after.data.sealedTip).toBe('string')
        expect(seen.finishes).toHaveLength(1)
        expect(seen.refusals).toEqual([])
        await until('the answered finish to reach the finish log', () => theLogHolds(start.log, tip))
        expect(readFileSync(start.log, 'utf8')).not.toContain('could not be finished')
        expect(readFileSync(start.log, 'utf8')).not.toContain(theFinishWords.THE_FINISH_ANSWER_WAS_LATE)
      })
    }, 60_000)

    it('finishes and seals a records run whose finishing write was taken but never answered, by reading the run back', async () => {
      await withASlowFinish({ store: true, answer: 'never' }, async (seen) => {
        const start = await aHeldRun('slow-finish-records-taken')
        await aReportOf(start.run)
        await itsDoingLine(start.run)
        writeFileSync(start.go, '')
        await until('the taken finish to be read back as finished', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === SESSION_STATES[2], 30_000)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.submission).toMatchObject({ kind: 'records' })
        expect(typeof after.data.sealedTip).toBe('string')
        expect(seen.finishes).toHaveLength(1)
        await until('the late answer to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes(theFinishWords.THE_FINISH_ANSWER_WAS_LATE))
        expect(seen.readsOfTheRun()).toBeGreaterThan(0)
        expect(seen.refusals).toEqual([])
        expect(readFileSync(start.log, 'utf8')).not.toContain('could not be finished')
      })
    }, 60_000)

    it('writes the refused finish when the finishing write was not taken and the read-back finds the run unfinished', async () => {
      await withASlowFinish({ store: false, answer: 'never' }, async (seen, refusal) => {
        const start = await aHeldRun('slow-finish-git-not-taken')
        await aReportOf(start.run)
        await itsDoingLine(start.run)
        aSyntheticCommitIn(start.dir, 'slow-finish-not-taken.txt')
        writeFileSync(start.go, '')
        await until('the lost finish to be written refused', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === SESSION_STATES[3], 30_000)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.state).toBe(SESSION_STATES[3])
        expect(after.data.sealedTip).toBeUndefined()
        expect(String(after.data.detail)).not.toContain(refusal)
        expect(seen.finishes).toHaveLength(1)
        expect(seen.refusals).toHaveLength(1)
        expect(seen.refusals[0]).toMatchObject({ state: SESSION_STATES[3], commandEnded: expect.objectContaining({ code: 0 }) })
        expect(seen.readsOfTheRun()).toBeGreaterThan(0)
      })
    }, 60_000)

    it('reads the run again when the first read-back gets no answer, and finds it finished', async () => {
      await withASlowFinish({ store: true, answer: 'never', theFirstReadBackGetsNoAnswer: true }, async (seen) => {
        const start = await aHeldRun('slow-finish-first-read-lost')
        await aReportOf(start.run)
        await itsDoingLine(start.run)
        writeFileSync(start.go, '')
        await until('the retried read-back to find the run finished', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === SESSION_STATES[2], 30_000)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.submission).toMatchObject({ kind: 'records' })
        expect(typeof after.data.sealedTip).toBe('string')
        await until('the retried read-back to reach the finish log', () => existsSync(start.log) && readFileSync(start.log, 'utf8').includes(theFinishWords.THE_FINISH_ANSWER_WAS_LATE))
        expect(seen.refusals).toEqual([])
        expect(seen.readsOfTheRun()).toBeGreaterThanOrEqual(2)
      })
    }, 60_000)

    it('writes a real refusal at once and reads the run back not at all', async () => {
      await withASlowFinish({ store: false, answer: 'refuse' }, async (seen, refusal) => {
        const start = await aHeldRun('slow-finish-refused')
        await aReportOf(start.run)
        await itsDoingLine(start.run)
        writeFileSync(start.go, '')
        await until('the real refusal to be written', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === SESSION_STATES[3], 30_000)
        const after = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
        expect(after.data.state).toBe(SESSION_STATES[3])
        expect(String(after.data.detail)).toContain(refusal)
        expect(seen.finishes).toHaveLength(1)
        expect(seen.refusals).toHaveLength(1)
        expect(seen.readsOfTheRun()).toBe(0)
      })
    }, 60_000)

    it('waits at least 120 s for a finish, and never less than the office tool waits for a seal', () => {
      const launchersFinishWait = (theFinishWords as { THE_LONGEST_FINISH_WAIT_MS?: number }).THE_LONGEST_FINISH_WAIT_MS
      expect(launchersFinishWait).toEqual(expect.any(Number))
      expect(launchersFinishWait!).toBeGreaterThanOrEqual(120_000)
      expect(launchersFinishWait!).toBeGreaterThanOrEqual(THE_OFFICE_TOOLS_FINISH_WAIT)
      expect(REQUEST_TIMEOUT_MS).toBeLessThan(launchersFinishWait!)
    })
  })
})

// A FINISHED RUN'S SCRATCH FOLDER IS REMOVED BY THE HELPER, AFTER THE SAME CHECKS A PERSON MADE BY HAND (the coordinator's
// agreement, message R2bM8BIhYPkZ). On 6 October 2026 the secretary removed 129 finished runs' folders, 26.46 GB, by hand,
// having checked the exact path, that no process worked in one or held a file open in it, and that no record named a file
// in it. The helper does it now, in that order, only for a run the office says is finished, and writes one line in the
// run's finish.log for each folder. Every folder here is in the stand-in container's temporary folder, inside this test's
// scratch. MUTATION PROOFS, each alone after a control run (the report of the run that added these cases): the rmSync in
// theScratchFolderAfterTheRun taken out (the first case goes red on the folder still there); the state check taken out
// (the second goes red on both folders removed); the process check taken out (the third goes red on the folder removed);
// notTheFolderMade made to answer null (the fourth goes red on the link and the other folder removed); the record check
// taken out (the fifth goes red on the folder removed).
// The next start repairs copied host paths and leaves checker sandboxes without the agent tool.
describe('sandbox tools are refreshed for their own repo', () => {
  it('a dsh start refreshes all three host paths in an existing office profile', async () => {
    const dir = upAnswer!.folder
    const profile = join(dir, 'dsh/home/profiles/office')
    writeFileSync(join(profile, 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
    writeFileSync(join(profile, 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)
    const ran = await sandbox(['exec', NAME, '--wait', '--', 'dsh', '--profile', 'office'])
    expect(ran.status, ran.err).toBe(0)
    const patch = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain(`configPath: "${join(dir, 'repo/tools/dsh-hooks/hooks.json')}"`)
    expect(patch).toContain(`pluginRoot: "${join(dir, 'repo')}"`)
    expect(readFileSync(join(profile, 'office-tool.mjs'), 'utf8')).toContain(join(dir, 'repo/tools/dsh-hooks/office-tool.mjs'))
  })
  it.each(['merge-synthetic-tools', 'inspector-inspector', 'timing'])('up keeps the office MCP tool out of %s', async name => {
    const file = join(sandboxes, name, 'home/.config/opencode/opencode.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ theme: 'synthetic', mcp: { other: { enabled: true }, mole_office: { enabled: true } } }))
    const ran = await sandbox(['up', template, '--name', name, '--from', main, '--no-dsh'])
    expect(ran.status, ran.err).toBe(0)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ theme: 'synthetic', mcp: { other: { enabled: true } }, permission: { external_directory: 'allow' } })
    expect((await sandbox(['down', name])).status).toBe(0)
  })
  it('a Claude start refreshes session events and keeps the two dsh hooks and unrelated settings', async () => {
    const dir = upAnswer!.folder, file = join(dir, 'home/.claude/settings.json')
    writeFileSync(file, JSON.stringify({ synthetic: 'kept', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo synthetic-user-hook' }] }] } }))
    // A synthetic runtime and login, independent of older cases that remove their secrets file.
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-refresh-token\n', { mode: 0o600 })
    writeFileSync(join(fakes, 'bin/claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    let ran: Awaited<ReturnType<typeof sandbox>>
    try { ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', 'claude-opus-5-5', '--worktree', join(dir, 'worktrees', WORKER), '--json', '--', 'claude', '-p', 'Synthetic hook refresh']) }
    finally { rmSync(secrets) }
    expect(ran.status, ran.err).toBe(0)
    groups.add(JSON.parse(ran.out).hostPgid)
    const settings = JSON.parse(readFileSync(file, 'utf8'))
    expect(settings.synthetic).toBe('kept')
    const commands = (event: string): string[] => settings.hooks[event].flatMap((group: { hooks: { command: string }[] }) => group.hooks.map(hook => hook.command))
    expect(commands('SessionStart')).toEqual([`node "${join(dir, 'repo/tools/session-hook.mjs')}" start`])
    expect(commands('SessionEnd')).toEqual([`node "${join(dir, 'repo/tools/session-hook.mjs')}" end`])
    expect(commands('PostToolUse')).toEqual([`node "${join(dir, 'repo/tools/dsh-hooks/claude-code-step.mjs')}"`])
    expect(commands('Stop')).toEqual(['echo synthetic-user-hook', `node "${join(dir, 'repo/tools/dsh-hooks/claude-code-stop.mjs')}"`, `node "${join(dir, 'repo/tools/session-hook.mjs')}" stop`])
  })
})

describe("a finished run's scratch folder is removed, after the same checks a person made by hand (message R2bM8BIhYPkZ)", () => {
  /**
   * THE FOLDERS THESE CASES KEEP GO WHEN THE LAST CASE HERE HAS READ THEM, with the folders two cases move aside. Every fake
   * container shares one /tmp, and each later waited start would sweep them, two seconds an ask.
   */
  const made: string[] = []
  afterAll(() => {
    for (const folder of made) for (const path of [folder, `${folder}.moved`]) rmSync(path, { recursive: true, force: true })
  })

  /** A run whose command does `before`, waits for its go file, then does `after`. */
  async function aHeldRun(name: string, before: string, after = 'true'): Promise<{ run: string; dir: string; go: string; folder: string; log: string }> {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const dir = join(scratch, name)
    const go = join(scratch, `${name}.go`)
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', name, dir, 'main')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', dir, '--cut-from', 'main', '--json',
      // ONE PART A LINE, so a part that ends with & is still a whole command.
      '--', 'sh', '-c', `${before}\nwhile [ ! -e '${go}' ]; do sleep 0.1; done\n${after}`,
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number; scratch: string }
    groups.add(start.hostPgid)
    expect(typeof start.scratch).toBe('string')
    made.push(start.scratch)
    return { run: start.run, dir, go, folder: start.scratch, log: join(answer.folder, 'logs', start.run, 'finish.log') }
  }

  /** The agent finishes its run itself, with a records submission naming `report` (one is filed when none is given). */
  async function itFinishesItself(run: string, report?: string): Promise<void> {
    const records = [report ?? (await aReportOf(run))]
    const said = await ask('PATCH', `/api/records/${run}`, AS_THE_WORKER(run), {
      dataPatch: { state: 'finished', submission: { kind: 'records', records }, detail: 'The synthetic worker says it finished itself.' },
    })
    expect(said.status, JSON.stringify(said.body)).toBe(200)
  }

  /** The one line finish.log holds about the run's scratch folder, once the helper has written it. */
  async function theFolderLine(held: { folder: string; log: string }, ms = 20_000): Promise<string> {
    const lines = (): string[] => (existsSync(held.log) ? readFileSync(held.log, 'utf8').split('\n') : []).filter((line) => line.includes(`scratch folder ${held.folder} `))
    await until("the helper to write the scratch folder's line", () => lines().length > 0, ms)
    expect(lines()).toHaveLength(1)
    return lines()[0]!
  }

  /**
   * THESE TWO CASES FAILED WHEN A PROCESS THAT NOBODY CAN READ RAN ON THIS MACHINE AT THE SAME TIME
   * (round 55 of wave 13y), and no longer depend on it (wave 13n, round AC).
   *
   * Both expect the sweep in tools/sweep-run-scratch.mjs to remove an old run's scratch folder. The sweep
   * keeps a folder when it cannot tell whether a process uses it. A process whose open files it cannot
   * read is such a case ("Unknown checks keep it"). In a real container the sweep sees only the
   * container's processes. Here the fake docker runs the start on this machine, and until round AC the
   * sweep saw every process on it: a process another test file made not dumpable on purpose (the merge
   * queue was red on this file in 20 of 93 runs), or a process that had ended and was not yet reaped.
   * Now the stand-in's loader shows the sweep only the fake container's processes
   * (theFakeContainersProcesses in tests/sandbox-stand-ins.ts), and the sweep's rule is unchanged.
   */
  it('the next sandbox start sweeps an old crashed run folder and writes its finish log', async () => {
    const held = await aHeldRun('scratch-old-crash', 'echo synthetic > "$TMPDIR/left.txt"', 'exit 3')
    writeFileSync(held.go, '')
    expect(await theFolderLine(held)).toContain('is kept')
    theCrashIsOld(held.run)
    const next = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'])
    expect(next.status, next.err).toBe(0)
    expect(existsSync(held.folder)).toBe(false)
    expect(readFileSync(held.log, 'utf8')).toContain(`run ${held.run}: scratch folder ${held.folder}`)
    expect(readFileSync(held.log, 'utf8')).toContain('is removed. Rule:')
  })

  it('a nested start sweeps the container tmp root while its parent run stays', async () => {
    const parent = await aHeldRun('scratch-live-parent', 'echo synthetic > "$TMPDIR/parent.txt"')
    await until('the parent scratch to be written', () => existsSync(join(parent.folder, 'parent.txt')))
    const previous = state().containers[CONTAINER] as { Config?: { Env: string[] } }
    try {
      const old = await aHeldRun('scratch-nested-old', 'echo synthetic > "$TMPDIR/left.txt"', 'exit 3')
      writeFileSync(old.go, '')
      expect(await theFolderLine(old)).toContain('is kept')
      theCrashIsOld(old.run)
      const nextState = state(), container = nextState.containers[CONTAINER] as { Config?: { Env: string[] } }
      container.Config = { ...container.Config, Env: [...(container.Config?.Env ?? []).filter(line => !line.startsWith('TMPDIR=')), `TMPDIR=${parent.folder}`] }
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(nextState))
      const nested = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'true'])
      expect(nested.status, nested.err).toBe(0)
      expect(existsSync(old.folder), `the inherited parent TMPDIR must not replace the container tmp root\n${whatTheLogSays(old.log)}`).toBe(false)
      expect(readFileSync(join(parent.folder, 'parent.txt'), 'utf8')).toBe('synthetic\n')
      expect(JSON.parse(readFileSync(join(upAnswer!.folder, 'logs', parent.run, 'start.json'), 'utf8')).scratch).toBe(parent.folder)
    } finally {
      const restored = state(), container = restored.containers[CONTAINER] as { Config?: { Env: string[] } }
      container.Config = previous.Config
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(restored))
      writeFileSync(parent.go, '')
      await theFolderLine(parent)
    }
  })

  /**
   * THE COMMAND GOES FIRST, AND THE SWEEP AFTER IT (wave 13s round 76). On 22 October 2026 the sweep held the live office
   * at every start, and each run's command waited for it, once for about 10 minutes. Now the sweep starts after the
   * command's go and keeps 2 s between its office asks, so an old folder it removes is still there when the command looks
   * at once. The helper waits for the sweep before it exits, so the folder is gone by then. A sweep that fails changes
   * nothing about the command's exit, and says so in finish.log.
   *
   * RED BEFORE THIS ROUND, when the sweep ran before the command: the first two, on "gone". MUTATION PROOF (the report
   * of the run that added these cases): the helper's exit not waiting for the sweep, and the first goes red on the folder;
   * the sweep's failure no longer caught, and the third goes red on the exit.
   *
   * ON 23 OCTOBER 2026 THE WAITS IN THE TWO CASES BELOW WERE MADE GENEROUS. Each waits for the event itself: the helper
   * exits only after its sweep has ended, and the sweep's line about the folder comes when it has decided. The sweep pauses
   * two seconds between its office asks and asks about every folder in the container's tmp root, so under load the sweep
   * alone can pass the 30-second budget a test that starts something gets, and the old 20-second waits are 90 seconds now.
   *
   * THE TWO CASES BELOW KEEP THE 2 S PAUSE: their command looks for the old folder at once, and finds it there only because
   * the sweep keeps that pause. So their start takes SWEEP_PAUSE_MS_FOR_A_TEST off, which every other start in this file
   * sets (theToolsEnvironment).
   */
  const theRealPause: NodeJS.ProcessEnv = { SWEEP_PAUSE_MS_FOR_A_TEST: undefined }
  async function anOldFolder(name: string): Promise<{ run: string; folder: string; log: string }> {
    const held = await aHeldRun(name, 'echo synthetic > "$TMPDIR/left.txt"', 'exit 3')
    writeFileSync(held.go, '')
    expect(await theFolderLine(held, 90_000)).toContain('is kept')
    theCrashIsOld(held.run)
    return held
  }
  const looksFor = (folder: string, seen: string): string => `if [ -d '${folder}' ]; then echo there; else echo gone; fi > '${seen}.part' && mv '${seen}.part' '${seen}'`

  it('starts a waited command before the sweep, and exits only when the sweep has ended', async () => {
    const old = await anOldFolder('scratch-after-the-go')
    const seen = join(scratch, 'scratch-after-the-go.seen')
    const next = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', looksFor(old.folder, seen)], undefined, theRealPause)
    expect(next.status, next.err).toBe(0)
    expect(readFileSync(seen, 'utf8'), 'the command started only after the sweep').toBe('there\n')
    expect(existsSync(old.folder), `the helper exited before its sweep ended\n${whatTheLogSays(old.log)}`).toBe(false)
    expect(readFileSync(old.log, 'utf8')).toContain('is removed. Rule:')
  }, 210_000)

  it('starts a command that is not waited for before the sweep, and the helper sweeps after it', async () => {
    const old = await anOldFolder('scratch-after-a-background-go')
    const seen = join(scratch, 'scratch-after-a-background-go.seen')
    const next = await sandbox(['exec', NAME, '--json', '--', 'sh', '-c', looksFor(old.folder, seen)], undefined, theRealPause)
    expect(next.status, next.err).toBe(0)
    groups.add((JSON.parse(next.out.trim()) as { hostPgid: number }).hostPgid)
    await until('the command to look for the old folder', () => existsSync(seen), 90_000)
    expect(readFileSync(seen, 'utf8'), 'the command started only after the sweep').toBe('there\n')
    await until('the helper to sweep the old folder', () => theLogHolds(old.log, 'is removed. Rule:'), 90_000, () => whatTheLogSays(old.log))
    expect(existsSync(old.folder), `the old folder is still there\n${whatTheLogSays(old.log)}`).toBe(false)
    expect(readFileSync(old.log, 'utf8')).toContain('is removed. Rule:')
  }, 300_000)

  it("keeps a waited command's exit when the sweep fails, and says so in finish.log", async () => {
    const answer = upAnswer as { folder: string }
    const broken = 'sweepbroken1', folder = join(fakes, 'tmp', `${broken}-ABC123`), logged = join(answer.folder, 'logs', broken)
    const before = new Set(readdirSync(join(answer.folder, 'logs')))
    mkdirSync(folder, { recursive: true }); mkdirSync(logged, { recursive: true })
    // A START RECORD THAT IS NOT JSON stops the sweep with an error.
    writeFileSync(join(logged, 'start.json'), '{ synthetic')
    try {
      const next = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', 'exit 7'])
      expect(next.status, next.err).toBe(7)
      const said = readdirSync(join(answer.folder, 'logs')).filter(name => !before.has(name) && name !== broken)
        .map(name => join(answer.folder, 'logs', name, 'finish.log')).filter(log => existsSync(log)).map(log => readFileSync(log, 'utf8'))
      expect(said.join('')).toContain('Scratch sweep could not finish: ')
      expect(existsSync(folder), 'a folder the sweep could not check went').toBe(true)
    } finally {
      rmSync(folder, { recursive: true, force: true }); rmSync(logged, { recursive: true, force: true })
    }
  })

  it('removes the folder of a run that finished, with what is in it, and says so with its path and size', async () => {
    const held = await aHeldRun('scratch-finished', 'head -c 20000 /dev/zero > "$TMPDIR/left.bin"; mkdir "$TMPDIR/inner"; echo kept > "$TMPDIR/inner/left.txt"')
    await until('the command to have written into its folder', () => existsSync(join(held.folder, 'inner', 'left.txt')))
    await itFinishesItself(held.run)
    writeFileSync(held.go, '')
    const line = await theFolderLine(held)
    expect(line).toMatch(new RegExp(`the run's scratch folder ${held.folder} \\((\\d+) bytes\\) is removed: run ${held.run} is finished, no process works in it or holds a file in it`))
    expect(Number(/\((\d+) bytes\)/.exec(line)![1])).toBeGreaterThanOrEqual(20000)
    expect(existsSync(held.folder), `${held.folder} is still there`).toBe(false)
  })

  it('keeps the folders of a crashed run and of a run left running, and says why', async () => {
    const crashed = await aHeldRun('scratch-crashed', 'echo kept > "$TMPDIR/left.txt"', 'exit 3')
    // EXITED 0 WITH A COMMIT AND NO REPORT: the launcher leaves it running (acceptance finding 48).
    const running = await aHeldRun('scratch-running', 'echo kept > "$TMPDIR/left.txt"', 'echo made > made.txt && git add made.txt && git commit -q -m made')
    writeFileSync(crashed.go, '')
    writeFileSync(running.go, '')
    expect(await theFolderLine(crashed)).toMatch(new RegExp(`scratch folder ${crashed.folder} \\(\\d+ bytes\\) is kept: run ${crashed.run} says "crashed", not finished\\.$`))
    expect(await theFolderLine(running)).toMatch(new RegExp(`scratch folder ${running.folder} \\(\\d+ bytes\\) is kept: run ${running.run} says "running", not finished\\.$`))
    expect((await ask('GET', `/api/records/${running.run}`, AS_STARTER())).body.record.data.state).toBe('running')
    for (const held of [crashed, running]) expect(readFileSync(join(held.folder, 'left.txt'), 'utf8')).toBe('kept\n')
  })

  it('keeps the folder of a finished run while a process the command left still works in it', async () => {
    const pidFile = join(scratch, 'scratch-busy.pid')
    // ITS OWN SESSION, so nothing that ends the command's group ends it too. IT WRITES ITSELF INTO THE FAKE CONTAINER'S LIST
    // of its processes (theFakeContainersProcesses): in its own session it is no child of anything there once the command
    // has ended, and a real container would still hold it.
    const held = await aHeldRun('scratch-busy', `setsid sh -c 'echo $$ >> "${theFakeContainersProcesses(fakes)}"; echo $$ > "${pidFile}"; cd "$TMPDIR" && exec sleep 120' </dev/null >/dev/null 2>&1 &`)
    await until('the sleeping child to be there', () => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() !== '')
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    try {
      await until('the child to work in the folder', () => { try { return readlinkSync(`/proc/${pid}/cwd`) === realpathSync(held.folder) } catch { return false } })
      await itFinishesItself(held.run)
      writeFileSync(held.go, '')
      expect(await theFolderLine(held)).toMatch(new RegExp(`scratch folder ${held.folder} \\(\\d+ bytes\\) is kept: process ${pid} works in it\\.$`))
      expect(existsSync(held.folder)).toBe(true)
    } finally {
      try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
    }
  })

  /**
   * THE FAKE CONTAINER'S SCRATCH CHECKS READ ONLY ITS OWN PROCESSES, and a start without the stand-in's view reads every
   * process on this machine, as a real start does (theFakeContainersProcesses in tests/sandbox-stand-ins.ts). This case
   * starts a process outside the fake container, working in a finished run's folder. With the view, the helper does not
   * see it, and the folder goes. With the seesTheHostsProcesses bug, the command's loader binds the private /tmp alone, the
   * list stays beside it, and tools/sandbox-start.mjs keeps the folder for that process. So nothing in tools/ reads the
   * list, and a real start cannot hide a process through it.
   */
  it.each([
    { does: 'removes', when: "its scratch checks read only the fake container's processes", seesTheHost: false, says: (run: string) => new RegExp(`is removed: run ${run} is finished, no process works in it or holds a file in it(\\.|;)`), stays: false },
    { does: 'keeps', when: 'its loader binds only the private /tmp, and it reads every process as a real start does', seesTheHost: true, says: (_run: string, pid: number) => new RegExp(`is kept: process ${pid} works in it\\.$`), stays: true },
  ])("$does a finished run's folder that a process outside the fake container works in, when $when", async ({ seesTheHost, says, stays }) => {
    let pid = 0
    setBug('seesTheHostsProcesses', seesTheHost)
    try {
      const held = await aHeldRun(`scratch-outside-${seesTheHost ? 'seen' : 'unseen'}`, 'echo synthetic > "$TMPDIR/left.txt"')
      await until('the command to write its file', () => existsSync(join(held.folder, 'left.txt')))
      pid = spawn('sleep', ['120'], { cwd: held.folder, detached: true, stdio: 'ignore' }).pid as number
      groups.add(pid)
      await until('the process outside to work in the folder', () => { try { return readlinkSync(`/proc/${pid}/cwd`) === realpathSync(held.folder) } catch { return false } })
      expect(readFileSync(theFakeContainersProcesses(fakes), 'utf8').split('\n'), 'the process outside is on the list').not.toContain(String(pid))
      await itFinishesItself(held.run)
      writeFileSync(held.go, '')
      expect(await theFolderLine(held)).toMatch(says(held.run, pid))
      expect(existsSync(held.folder)).toBe(stays)
    } finally {
      setBug('seesTheHostsProcesses', false)
      if (pid !== 0) try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
    }
  })

  it.each([
    { name: 'scratch-link', how: 'a link', makes: (victim: string) => `mv "$TMPDIR" "$TMPDIR.moved" && ln -s '${victim}' "$TMPDIR"`, says: (victim: string) => `a link to ${victim} stands at its path, not the folder this helper made` },
    { name: 'scratch-other', how: 'another folder', makes: () => `mv "$TMPDIR" "$TMPDIR.moved" && mkdir "$TMPDIR" && echo theirs > "$TMPDIR/theirs.txt"`, says: () => 'another folder stands at its path, not the one this helper made' },
  ])('never touches $how standing where the run\'s own folder was', async ({ name, makes, says }) => {
    const victim = join(scratch, `${name}-not-the-runs-own`)
    mkdirSync(victim)
    writeFileSync(join(victim, 'theirs.txt'), 'theirs\n')
    const held = await aHeldRun(name, makes(victim))
    await until('the command to have put something else at the path', () => existsSync(join(held.folder, 'theirs.txt')))
    await itFinishesItself(held.run)
    writeFileSync(held.go, '')
    const line = await theFolderLine(held)
    expect(line).toContain(`is kept: ${says(victim)}.`)
    expect(readFileSync(join(held.folder, 'theirs.txt'), 'utf8')).toBe('theirs\n')
    expect(readFileSync(join(victim, 'theirs.txt'), 'utf8')).toBe('theirs\n')
    expect(existsSync(`${held.folder}.moved`), "the run's own folder, moved aside, is gone").toBe(true)
  })

  /**
   * A RECORD THAT NAMES A FINISHED RUN'S FOLDER DOES NOT KEEP IT. The first case is a run that finished itself before its
   * command ended; the second, a run the launcher finishes as records when its command ends. A search for the folder still
   * finds the record, so the folder went with a record naming it.
   */
  it('removes the folder of a run that finished itself, though a record names a file in it', async () => {
    const held = await aHeldRun('scratch-named', 'echo "| a | b |" > "$TMPDIR/table.md"')
    const filed = await ask('POST', '/api/records', AS_STARTER(), {
      kind: 'report', title: 'What the run left',
      data: { for: 'its starter', date: '2026-10-06', blocks: [{ id: 'b-1', type: 'text', text: `The table is in ${held.folder}/table.md.` }] },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const report = String(filed.body.record.id)
    expect((await ask('POST', '/api/links', AS_STARTER(), { fromId: report, toId: held.run, type: 'about' })).status).toBe(201)
    await itFinishesItself(held.run, report)
    writeFileSync(held.go, '')
    expect(await theFolderLine(held)).toContain('is removed')
    expect(existsSync(held.folder), `${held.folder} is still there`).toBe(false)
    expect((await ask('GET', `/api/search?q=${encodeURIComponent(held.folder)}&limit=5`, AS_STARTER())).body.counts.matched).toBeGreaterThan(0)
  })

  it('removes the folder of a run the launcher finishes as records, though its report names a file in it', async () => {
    const held = await aHeldRun('scratch-named-at-the-end', 'echo "| a | b |" > "$TMPDIR/table.md"')
    await until('the command to have written into its folder', () => existsSync(join(held.folder, 'table.md')))
    const filed = await ask('POST', '/api/records', AS_STARTER(), { kind: 'report', title: aFreshReportTitle(), data: { for: 'its starter', date: '2026-11-16', chaptersRead: EVERY_CHAPTER, blocks: [{ id: 'b-1', type: 'text', text: `The table is in ${held.folder}/table.md. The audit table is left for the merge queue.` }] } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const report = String(filed.body.record.id)
    expect((await ask('POST', '/api/links', AS_STARTER(), { fromId: report, toId: held.run, type: 'about' })).status).toBe(201)
    await aLabelFor(report, WORKSPACE)
    await aWordOf(held.run, 'I seal next.')
    await itsDoingLine(held.run)
    writeFileSync(held.go, '')
    expect(await theFolderLine(held)).toContain('is removed')
    expect(existsSync(held.folder), `${held.folder} is still there`).toBe(false)
    expect((await ask('GET', `/api/records/${held.run}`, AS_STARTER())).body.record.data.state).toBe('finished')
    expect((await ask('GET', `/api/search?q=${encodeURIComponent(held.folder)}&limit=5`, AS_STARTER())).body.counts.matched).toBeGreaterThan(0)
  })
})

// PROBLEM VBtbw0hSO1E2. On 24 September 2026 every Claude Code run in the sandboxes was registered for
// anthropic/claude-opus-5-5, and their transcripts show claude-opus-5 answered. When a claude-code run's
// command ends, the launcher now records the model that answered as the run's `served`, read from a
// --output-format json result in its out file or from its own transcripts, and the run's page says when the
// two differ (theModelThatAnsweredSentence). The stand-in below writes what Claude Code writes, under the
// sandbox's HOME: a transcript whose assistant lines carry a model, one "<synthetic>" line a usage limit
// leaves, and a subagent's transcript in a folder below, which is not the run's own.
describe('a Claude Code run records the model that answered when its command ends (problem VBtbw0hSO1E2)', () => {
  const REGISTERED = 'anthropic/claude-opus-5-5'

  /** The stand-in, written once: `node <it> transcript <model>`, `node <it> json <model>`, or `node <it> nothing`. */
  function theStandIn(): string {
    const path = join(scratch, 'a-claude-code-transcript-stand-in.mjs')
    writeFileSync(
      path,
      String.raw`import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
const [how, model, after, marker] = process.argv.slice(2)
if (how === 'envelope') {
  process.stdout.write('a warning Claude Code printed first\n')
  process.stdout.write(readFileSync(model, 'utf8').trim() + '\n')
} else if (how === 'json') {
  process.stdout.write('a warning Claude Code printed first\n')
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done', modelUsage: { [model]: { inputTokens: 5 } } }) + '\n')
} else if (how === 'transcript') {
  const folder = join(process.env.HOME, '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'))
  const id = 'aaaaaaaa-0000-4000-8000-000000000001'
  mkdirSync(join(folder, id, 'subagents'), { recursive: true })
  const now = () => new Date().toISOString()
  const line = (m, messageId, usage) => JSON.stringify({ type: 'assistant', timestamp: now(), isSidechain: false, message: { id: messageId, model: m, usage } })
  writeFileSync(join(folder, id + '.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: now(), message: { role: 'user', content: 'hello' } }),
    line(model, 'msg_1', { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 }),
    line(model, 'msg_1', { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 }),
    line(model, 'msg_2', { input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 103 }),
    line('<synthetic>', 'msg_3', { input_tokens: 0 }),
  ].join('\n') + '\n')
  writeFileSync(join(folder, id, 'subagents', 'agent-1.jsonl'), line('claude-haiku-4-5', 'msg_9', { input_tokens: 7 }) + '\n')
}
if (after === 'commit-and-wait') {
  writeFileSync('made.txt', 'made\n')
  execFileSync('git', ['add', 'made.txt'])
  execFileSync('git', ['commit', '-q', '-m', 'made'])
  while (!existsSync(marker)) await new Promise(resolve => setTimeout(resolve, 100))
}
if (after === 'exit') process.exit(Number(marker))
`,
    )
    return path
  }

  /** Start a claude-code run registered for REGISTERED whose command is the stand-in, with a login in the secrets file. */
  async function aClaudeCodeRun(dirName: string, how: string, model: string, after: { waitFor?: string; exit?: number } = {}): Promise<{ run: string; dir: string; start: { hostPid: number; hostPgid: number } }> {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const dir = join(scratch, dirName)
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', dirName, dir, 'main')
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'claude-code', '--model', REGISTERED,
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', 'node', theStandIn(), how, model,
      ...(after.waitFor === undefined ? [] : ['commit-and-wait', after.waitFor]),
      ...(after.exit === undefined ? [] : ['exit', String(after.exit)]),
    ])
    rmSync(secrets)
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    return { run: start.run, dir, start }
  }

  const theRecord = async (run: string): Promise<any> => (await ask('GET', `/api/records/${run}`, AS_STARTER())).body.record
  /** A run's finish log; `folder` is the log folder's own name when it is not the run's id (a second command for one run gets `<run>-2`). */
  const theFinishLog = (run: string, folder = run): string => {
    const path = join((upAnswer as { folder: string }).folder, 'logs', folder, 'finish.log')
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }

  it("reads claude-opus-5 off the run's transcript, not its subagent's or the synthetic line, and the page's sentence names both models", async () => {
    const { run } = await aClaudeCodeRun('served-transcript', 'transcript', 'claude-opus-5')
    await until('the run to hold what served it', async () => (await theRecord(run)).data.served !== undefined)
    const record = await theRecord(run)
    expect(record.data.model).toBe(REGISTERED)
    expect(record.data.served).toEqual({
      model: 'claude-opus-5',
      temperature: 'not reported',
      briefBytes: 'not reported',
      contextTokens: { largestTurn: 115, total: 218 },
    })
    const sentence = theModelThatAnsweredSentence(record.data.model, record.data.served, true)
    expect(sentence).toEqual({ differs: true, text: `This run was registered for Claude Opus 5.5 (${REGISTERED}), and the model that answered was a model this office has no name for (claude-opus-5).` })
    expect(theFinishLog(run)).toContain('the transcripts named claude-opus-5.')
  })

  it('reads the models off a --output-format json result in the out file', () => {
    const dir = join(scratch, 'served-json'), outPath = join(scratch, 'served-json.out')
    writeFileSync(outPath, 'a warning Claude Code printed first\n' + JSON.stringify({ type: 'result', modelUsage: { 'claude-opus-5': { inputTokens: 5 } } }) + '\n')
    const { served, said } = theServedOfAClaudeCodeRun({ outPath, env: { HOME: join(scratch, 'reader-home') }, cwd: dir, startedAt: new Date().toISOString(), briefPath: null })
    expect(served.model).toBe('claude-opus-5')
    expect(served.contextTokens).toEqual({ largestTurn: 'not reported', total: 'not reported' })
    expect(said).toContain('holds a --output-format json result')
  })

  it('records "not reported" when there is no transcript and no json result, and the finish log says where it looked', () => {
    const dir = join(scratch, 'served-nothing'), home = join(scratch, 'reader-home'), outPath = join(scratch, 'served-nothing.out')
    writeFileSync(outPath, '')
    const { served, said } = theServedOfAClaudeCodeRun({ outPath, env: { HOME: home }, cwd: dir, startedAt: new Date().toISOString(), briefPath: null })
    expect(served.model).toBe('not reported')
    expect(theModelThatAnsweredSentence(REGISTERED, served, true)?.text).toBe(
      `This run was registered for Claude Opus 5.5 (${REGISTERED}), and which model answered was not reported.`,
    )
    expect(said).toContain('holds no --output-format json result')
    expect(said).toContain(`there is no transcript folder ${join(home, '.claude', 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'))}`)
    expect(said).toContain('the transcripts named no model that answered.')
  })

  it('still records it for a run that finished itself before its command ended, and never writes over one already there', async () => {
    const go = join(scratch, 'served-over.go')
    const { run, dir } = await aClaudeCodeRun('served-over', 'transcript', 'claude-opus-5', { waitFor: go })
    await until('the command to have committed', () => git(dir, 'rev-list', '--count', 'main..HEAD') === '1')
    await aReportOf(run)
    const finished = await ask('PATCH', `/api/records/${run}`, AS_THE_WORKER(run), { dataPatch: { state: 'finished', tip: git(dir, 'rev-parse', 'HEAD') } })
    expect(finished.status, JSON.stringify(finished.body)).toBe(200)
    writeFileSync(go, '')
    await until('the run to hold what served it', async () => (await theRecord(run)).data.served !== undefined)
    const record = await theRecord(run)
    expect(record.data.state).toBe('finished')
    expect(record.data.served.model).toBe('claude-opus-5')
    expect(theFinishLog(run)).toContain(`run ${run} already says finished`)

    // A SECOND END OF A COMMAND FOR THE SAME RUN, through --run, leaves the served that is there as it was.
    const again = await sandbox(['exec', NAME, '--run', run, '--json', '--', 'node', theStandIn(), 'transcript', 'claude-sonnet-5'])
    expect(again.status, again.err).toBe(0)
    groups.add(JSON.parse(again.out.trim()).hostPgid)
    await until('the second finish log line', () => theFinishLog(run, `${run}-2`).includes('already holds what served it'))
    expect(theFinishLog(run, `${run}-2`)).toContain(`run ${run} already holds what served it (model "claude-opus-5"), so the launcher left it as it was.`)
    expect((await theRecord(run)).data.served.model).toBe('claude-opus-5')
  })

  // MILESTONE M8 (report 4IoRUKizcZXb): the launcher writes the run's usage receipt from the envelope its command
  // printed last, whatever the exit, with which login paid and which sandbox ran it. The envelope is the real capture
  // in tests/fixtures/usage-receipts. MUTATIONS, each after a control run (the report of wave 13p's round 26):
  //   - the call to theReceiptIsWritten taken out of finishOrCrashTheRun: all three cases go red;
  //   - the receipt written only for a command that exited 0: the crashed case goes red;
  //   - a receipt with no envelope written with a cost of 0: the no-envelope case goes red.
  const THE_ENVELOPE = fileURLToPath(new URL('./fixtures/usage-receipts/claude-code.json', import.meta.url))

  it('writes the usage receipt from the envelope, with the login that paid and the sandbox it ran in, and finishes the run as before', async () => {
    const { run } = await aClaudeCodeRun('receipt-envelope', 'envelope', THE_ENVELOPE)
    await until('the run to hold its usage receipt', async () => (await theRecord(run)).data.usageReceipt !== undefined)
    const receipt = (await theRecord(run)).data.usageReceipt
    expect(receipt).toMatchObject({
      runtime: 'claude-code', inputTokens: 2, cachedInputTokens: 9978, cacheCreationInputTokens: 10511, outputTokens: 4,
      costUsd: 0.110209, model: 'claude-opus-5', durationMs: 1544,
      paidBy: 'the Claude Code login in CLAUDE_CODE_OAUTH_TOKEN',
      ranIn: `in the sandbox ${basename((upAnswer as { folder: string }).folder)}`,
    })
    expect(theFinishLog(run)).toContain(`run ${run}'s usage receipt is recorded`)
  })

  it('still writes the receipt of a run whose command failed, and the run is recorded crashed as before: nothing stops it', async () => {
    const { run } = await aClaudeCodeRun('receipt-crashed', 'envelope', THE_ENVELOPE, { exit: 7 })
    await until('the run to be marked crashed', async () => (await theRecord(run)).data.state === 'crashed')
    const record = await theRecord(run)
    expect(record.data.detail).toContain('exited 7')
    expect(record.data.usageReceipt).toMatchObject({ inputTokens: 2, outputTokens: 4, costUsd: 0.110209 })
  })

  it('writes a receipt that says nothing was reported when there is no envelope, with no number in it and no 0', () => {
    const receipt = theReceiptOfAnEndedCommand({ text: '', noEnvelope: "The run's output holds no --output-format json envelope, so nothing was reported.", previous: null, stored: undefined, paidBy: 'not reported', ranIn: 'in the synthetic sandbox' })
    for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd', 'durationMs']) expect(receipt).not.toHaveProperty(key)
    expect(receipt.says).toContain('holds no --output-format json envelope, so nothing was reported')
  })

  // ONE WRITER (wave 13s round 42, answer k0eknvS08jLE, 2). Run 2WL9TfhVa3u6 sealed itself with a receipt in
  // words, "No numbers were read at the seal", and the launcher's numbers were then merged into it key by key, so the
  // record held both. Here a run seals itself the same way before its command ends, through the fifteen minutes its key
  // still has (agreement 0upwNAzS4yqT). The seal-first order is this file's; the launcher-first order is
  // tests/a-seal-carries-its-runs-own-receipt.test.ts. MUTATIONS, each after a control run:
  //   - the launcher sends its receipt as it is, not through theReceiptWrittenOver: the first case goes red;
  //   - theReceiptWrittenOver without its guard: the second case goes red.
  /** A run that seals itself, as tools/office-request.mjs does, with this receipt, while its command still runs. */
  async function itSealsItselfWith(how: string, model: string, name: string, usageReceipt: Record<string, unknown>): Promise<string> {
    const go = join(scratch, `${name}.go`)
    const { run, dir } = await aClaudeCodeRun(name, how, model, { waitFor: go })
    await until('the command to have committed', () => git(dir, 'rev-list', '--count', 'main..HEAD') === '1')
    await aReportOf(run)
    const sealed = await ask('PATCH', `/api/records/${run}`, AS_THE_WORKER(run), { dataPatch: { state: 'finished', tip: git(dir, 'rev-parse', 'HEAD'), usageReceipt } })
    expect(sealed.status, JSON.stringify(sealed.body)).toBe(200)
    expect((await theRecord(run)).data.usageReceipt).toEqual(usageReceipt)
    writeFileSync(go, '')
    return run
  }
  const AT_THE_SEAL = { runtime: 'claude-code', paidBy: 'not reported', ranIn: 'in the sandbox of the seal', readAt: '2026-10-13 09:00:00' }

  it('writes its numbers over a seal’s receipt in words whole, so no "No numbers" or readAt of the seal is left beside them', async () => {
    const run = await itSealsItselfWith('envelope', THE_ENVELOPE, 'receipt-over-words', {
      ...AT_THE_SEAL,
      source: "self-reported at the seal by the run's own office tool",
      says: 'No numbers were read at the seal: a stand-in seal with no log to read.',
    })
    await until('the launcher to write its receipt', async () => (await theRecord(run)).data.usageReceipt?.costUsd !== undefined)
    const receipt = (await theRecord(run)).data.usageReceipt
    expect(receipt).toMatchObject({
      runtime: 'claude-code', inputTokens: 2, cachedInputTokens: 9978, cacheCreationInputTokens: 10511, outputTokens: 4, costUsd: 0.110209,
      paidBy: 'the Claude Code login in CLAUDE_CODE_OAUTH_TOKEN',
      ranIn: `in the sandbox ${basename((upAnswer as { folder: string }).folder)}`,
    })
    expect(receipt).not.toHaveProperty('readAt')
    expect(JSON.stringify(receipt)).not.toContain('No numbers were read at the seal')
    expect(receipt.source).not.toContain('self-reported at the seal')
  })

  it('leaves a seal’s receipt that holds numbers as it was when its own reading has none, and only adds why', async () => {
    const SEALED = {
      ...AT_THE_SEAL,
      inputTokens: 11, outputTokens: 13, costUsd: 0.25,
      source: "self-reported at the seal by the run's own office tool, from a stand-in transcript",
      says: 'Self-reported: a stand-in seal.',
    }
    const run = await itSealsItselfWith('nothing', 'none', 'receipt-kept', SEALED)
    await until('the launcher to add its words', async () => String((await theRecord(run)).data.usageReceipt?.says).includes(A_LATER_READING_FOUND_NO_NUMBERS))
    const out = join((upAnswer as { folder: string }).folder, 'logs', run, 'out')
    expect((await theRecord(run)).data.usageReceipt).toEqual({
      ...SEALED,
      says: `Self-reported: a stand-in seal. ${A_LATER_READING_FOUND_NO_NUMBERS}The run's output file ${out} holds no --output-format json envelope, so nothing was reported.`,
    })
  })

  // A ROUND THAT CONTINUES ANOTHER (wave 13s round 42, fault 1). `claude -p --continue` reports its conversation's cost
  // so far and `codex exec resume` its thread's totals so far, so a round with a derived_from link to the run it
  // continues is given that less what that run printed at its end, read from logs/<that run>/out in the same sandbox.
  // `sandbox.mjs round` files that link with the run (tests/a-second-round-waits-for-the-first.test.ts pins it), and
  // exec takes no --continues, so here the starter links the run while its command waits. The two costs are run
  // 2WL9TfhVa3u6's and qRQgEx30PmY1's own; the Codex totals are stand-ins. MUTATION, after a control run:
  // theRunItContinues in tools/sandbox-start.mjs answers null, so every round is read as its thread's first: both
  // cases go red.
  it('gives each of three Codex rounds of one thread, each continuing the last, only its own part of the thread’s totals', () => {
    const thread = '01a106ba-1b44-7371-868f-903c4d3866e6'
    const totals = [[100, 60, 10, 4], [250, 180, 25, 9], [400, 330, 45, 15]]
    const receipts: any[] = []
    let previous: { run: string; text: string } | null = null
    for (const [i, [input, cached, output, reasoning]] of totals.entries()) {
      const text = [
        { type: 'thread.started', thread_id: thread }, { type: 'turn.started' },
        { type: 'turn.completed', usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning } },
      ].map(event => JSON.stringify(event)).join('\n') + '\n'
      receipts.push(theReceiptOfAnEndedCodexCommand({ text, unread: null, stopped: null, previous, stored: undefined, ranIn: 'in the synthetic sandbox' }))
      previous = { run: `synthetic-round-${i}`, text }
    }
    const numbers = (receipt: any) => ({ inputTokens: receipt.inputTokens, cachedInputTokens: receipt.cachedInputTokens, outputTokens: receipt.outputTokens, reasoningTokens: receipt.reasoningTokens })
    expect(receipts.map(numbers)).toEqual([
      { inputTokens: 100, cachedInputTokens: 60, outputTokens: 10, reasoningTokens: 4 },
      { inputTokens: 150, cachedInputTokens: 120, outputTokens: 15, reasoningTokens: 5 },
      { inputTokens: 150, cachedInputTokens: 150, outputTokens: 20, reasoningTokens: 6 },
    ])
    expect(receipts[2].source).toContain('less the total run')
  })

  it('gives a continued Claude Code round its own cost, 2WL9TfhVa3u6’s 767.70 USD less the 759.81 its earlier round printed', () => {
    const envelope = JSON.parse(readFileSync(THE_ENVELOPE, 'utf8'))
    const text = (cost: number) => JSON.stringify({ ...envelope, total_cost_usd: cost }) + '\n'
    const at = { noEnvelope: 'No envelope', stored: undefined, paidBy: 'not reported', ranIn: 'in the synthetic sandbox' }
    const first = theReceiptOfAnEndedCommand({ ...at, text: text(759.8058742000014), previous: null })
    expect(first.costUsd).toBe(759.8058742000014)
    const second = theReceiptOfAnEndedCommand({ ...at, text: text(767.7004848000017), previous: { run: 'synthetic-earlier-round', text: text(759.8058742000014) } })
    expect(second.costUsd).toBeCloseTo(7.8946106, 7)
    expect(second.source).toContain('the cost is total_cost_usd less the 759.8058742000014 USD run synthetic-earlier-round reported at its end')
  })

  // A CODEX RUN gets its receipt from the turn.completed events `codex exec --json` printed, the real capture in
  // tests/fixtures/usage-receipts (wave 13p round 27). MUTATION, after a control run: the launcher writing a receipt for
  // claude-code runs only, as before; this case goes red waiting for the receipt.
  it('writes a Codex run\u2019s receipt from its turn.completed events, with no cost and the login not reported', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const dir = join(scratch, 'receipt-codex')
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', 'receipt-codex', dir, 'main')
    const events = fileURLToPath(new URL('./fixtures/usage-receipts/codex.jsonl', import.meta.url))
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol',
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', ...syntheticCodexCommand('receipt-codex', ['cat', events]),
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await until('the run to hold its usage receipt', async () => (await theRecord(start.run)).data.usageReceipt !== undefined)
    const receipt = (await theRecord(start.run)).data.usageReceipt
    expect(receipt).toMatchObject({
      runtime: 'codex', inputTokens: 15262, cachedInputTokens: 12160, outputTokens: 5, inputIncludesCached: true,
      paidBy: 'not reported', ranIn: `in the sandbox ${basename(answer.folder)}`,
    })
    expect(receipt).not.toHaveProperty('costUsd')
    expect(theFinishLog(start.run)).toContain(`run ${start.run}'s usage receipt is recorded`)
  })

  // AN OPENCODE RUN (wave 13s round 42, message SAmHNCUlzQNN). A sandbox-started OpenCode run got no receipt
  // from the launcher, only its seal's words. `opencode run --format json` prints a step_finish event after each step,
  // with that step's own tokens and cost, shaped as the stub in tests/opencode-is-given-a-model-and-a-variant.test.ts
  // and the capture in tests/fixtures/usage-receipts/opencode.jsonl; the counts here are stand-ins, the first step's
  // the capture's own. MUTATIONS, each after a control run:
  //   - the launcher writing a receipt for claude-code and Codex runs only, as before: this case goes red waiting;
  //   - the launcher's OpenCode receipt read from the last step_finish only: this case goes red at the sums.
  it('writes an OpenCode run’s receipt as the sum of its step_finish events, and says so in words when it printed none', async () => {
    const answer = upAnswer as { folder: string }
    const step = (id: string, input: number, output: number, read: number, write: number, cost: number): string =>
      JSON.stringify({ type: 'step_finish', part: { id, type: 'step-finish', tokens: { input, output, reasoning: 0, cache: { read, write } }, cost } })
    const printed = join(scratch, 'an-opencode-run.jsonl')
    writeFileSync(printed, [
      JSON.stringify({ type: 'step_start', part: { id: 'prt_1', type: 'step-start' } }),
      step('prt_2', 8517, 2, 1920, 0, 0.003713595),
      JSON.stringify({ type: 'text', part: { id: 'prt_3', type: 'text', text: 'ok' } }),
      step('prt_4', 120, 30, 10000, 400, 0.0021),
    ].join('\n') + '\n')
    const plain = join(scratch, 'an-opencode-run-in-plain-text.txt')
    writeFileSync(plain, 'ok\n')
    const receipts: any[] = []
    const runs: [string, string][] = [['receipt-opencode', printed], ['receipt-opencode-plain', plain]]
    for (const [name, file] of runs) {
      const dir = join(scratch, name)
      git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', name, dir, 'main')
      const ran = await sandbox([
        'exec', NAME, '--agent', WORKER, '--runtime', 'opencode', '--model', 'deepseek/deepseek-v4.1-flash',
        '--worktree', dir, '--cut-from', 'main', '--json',
        '--', 'cat', file,
      ])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      await until(`run ${start.run}'s usage receipt`, async () => (await theRecord(start.run)).data.usageReceipt !== undefined)
      receipts.push((await theRecord(start.run)).data.usageReceipt)
    }
    expect(receipts[0]).toMatchObject({
      runtime: 'opencode', inputTokens: 8637, cachedInputTokens: 11920, cacheCreationInputTokens: 400, outputTokens: 32, reasoningTokens: 0,
      inputIncludesCached: false, paidBy: 'not reported', ranIn: `in the sandbox ${basename(answer.folder)}`,
    })
    expect(receipts[0].costUsd).toBeCloseTo(0.005813595, 9)
    for (const key of ['inputTokens', 'outputTokens', 'costUsd']) expect(receipts[1]).not.toHaveProperty(key)
    expect(receipts[1].says).toBe("The run's output holds no step_finish event, so OpenCode reported no usage. It prints one after each step only when it is run with --format json.")
  })

  // HB1 (wave 13s round 36): A CODEX RUN records the model its own rollout names, read through the thread its events
  // name. The stand-in prints the captured events and writes a rollout where Codex writes one, under the command's
  // CODEX_HOME or HOME, with a turn_context stamped after the start. MUTATION, after a control run: the launcher
  // writing `served` for claude-code runs only, as before; this case goes red waiting for it.
  it('records the model a Codex run’s rollout names as the run’s served model', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const dir = join(scratch, 'served-codex')
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', 'served-codex', dir, 'main')
    const events = fileURLToPath(new URL('./fixtures/usage-receipts/codex.jsonl', import.meta.url))
    const thread = '01a081b5-bdca-78f3-9392-471d7caf54c3'
    const standIn = join(scratch, 'a-codex-rollout-stand-in.mjs')
    writeFileSync(standIn, String.raw`import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const home = process.env.CODEX_HOME || join(process.env.HOME, '.codex')
const day = join(home, 'sessions', '2026', '10', '11')
mkdirSync(day, { recursive: true })
writeFileSync(join(day, 'rollout-2026-10-11T10-00-00-${thread}.jsonl'), JSON.stringify({ timestamp: new Date().toISOString(), type: 'turn_context', payload: { model: 'gpt-6-luna' } }) + '\n')
process.stdout.write(readFileSync(${JSON.stringify(events)}, 'utf8'))
`)
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol',
      '--worktree', dir, '--cut-from', 'main', '--json',
      '--', ...syntheticCodexCommand('served-codex', ['node', standIn]),
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    await until('the run to hold what served it', async () => (await theRecord(start.run)).data.served !== undefined)
    expect((await theRecord(start.run)).data.served).toEqual({
      model: 'gpt-6-luna',
      temperature: 'not reported',
      briefBytes: 'not reported',
      contextTokens: { largestTurn: 'not reported', total: 'not reported' },
    })
    expect(theFinishLog(start.run)).toContain('1 turn since the run began named gpt-6-luna')
  })
})

describe('--worktree makes the worktree it names when it does not exist yet (acceptance finding 4)', () => {
  // AN AGENT OF ITS OWN, whose branch no worktree holds yet: WORKER's own worktree, which a run given no --worktree works
  // in, already holds WORKER's branch.
  const MAKER = 'worktree-maker'
  beforeAll(async () => {
    const registered = await ask('POST', '/api/agents/started', AS_STARTER(), { handle: MAKER, name: MAKER, role: 'worker', workArea: ['src'] })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  })

  it("creates it from the instance clone, on a branch named after the agent, with the clone's own node_modules linked", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    const newDir = join(scratch, 'made-worktree')
    expect(existsSync(newDir)).toBe(false)
    const ran = await sandbox([
      'exec', NAME, '--agent', MAKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', newDir, '--cut-from', 'main', '--json',
      '--', 'true',
    ])
    expect(ran.status, ran.err).toBe(0)
    expect(readFileSync(join(dirname(JSON.parse(ran.out).out), 'launch.txt'), 'utf8')).toContain(`--worktree ${newDir} did not exist, so it was made`)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(start.cwd).toBe(newDir)

    expect(existsSync(newDir)).toBe(true)
    expect(git(newDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(MAKER)
    expect(git(newDir, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'main'))
    expect(git(repo, 'worktree', 'list')).toContain(newDir)

    // THE NODE_MODULES LINK, to the instance clone's own (item 2f), never into the checkout the sandbox was made from. It
    // names the clone's link, so the worktree follows when a changed package-lock.json installs the clone's again.
    expect(readlinkSync(join(newDir, 'node_modules'))).toBe(join(repo, 'node_modules'))
    expect(inside(answer.folder, join(newDir, 'node_modules')), "the worktree's node_modules is outside the instance folder").toBe(true)
    expect(inside(main, join(newDir, 'node_modules')), "the worktree's node_modules is in the checkout").toBe(false)

    // Release the worktree (not the branch) so the next test can prove the branch is reused, not refused.
    git(repo, 'worktree', 'remove', '--force', newDir)
  })

  it("reuses the agent's own branch, made by the test above, instead of refusing it as taken", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const repo = join(answer.folder, 'repo')
    expect(git(repo, 'branch', '--list', MAKER)).toContain(MAKER) // left by the test above; not checked out anywhere now
    const secondDir = join(scratch, 'made-worktree-again')
    const ran = await sandbox([
      'exec', NAME, '--agent', MAKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', secondDir, '--cut-from', 'main', '--json',
      '--', 'true',
    ])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(existsSync(secondDir)).toBe(true)
    expect(git(secondDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(MAKER)
    expect(lstatSync(join(secondDir, 'node_modules')).isSymbolicLink()).toBe(true)
  })

  it('still refuses a --worktree that is there but is not a directory', async () => {
    const notADir = join(scratch, 'made-worktree-file')
    writeFileSync(notADir, 'not a directory\n')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', notADir, '--cut-from', 'main',
      '--', 'true',
    ])
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('is not a directory')
  })
})

describe("--clone cuts an agent's worktree from another of the template's clones (the ai-news studio's news-tools)", () => {
  /** The helper, run on its own as an agent in the sandbox runs it, for a run it files itself. */
  function theHelper(args: string[]): Promise<Ran> {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    return new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', answer.folder, '--as', STARTER, '--session', starterSession, '--workspace', WORKSPACE, '--api', api, ...args],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(answer.folder) }, 'the-clone-the-instance-does-not-have'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
  }

  it("cuts it from the clone it names, from that clone's own branch, and the run works there", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const clone = join(answer.folder, 'side-repo')
    const newDir = join(scratch, 'made-from-the-side-clone')
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', newDir, '--clone', 'side-repo', '--json',
      '--', 'true',
    ])
    expect(ran.status, ran.err).toBe(0)
    expect(readFileSync(join(dirname(JSON.parse(ran.out).out), 'launch.txt'), 'utf8')).toContain(`--worktree ${newDir} did not exist, so it was made: git worktree add from ${clone}, cut from trunk, on branch ${WORKER}.`)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(start.cwd).toBe(newDir)
    expect(git(newDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(WORKER)
    expect(git(newDir, 'rev-parse', 'HEAD')).toBe(git(clone, 'rev-parse', 'trunk'))
    expect(git(clone, 'worktree', 'list')).toContain(newDir)
    expect(git(join(answer.folder, 'repo'), 'worktree', 'list')).not.toContain(newDir)
    // THE RUN SAYS WHERE IT WORKS AND WHAT IT WAS CUT FROM: the clone's branch, not the office's.
    const run = await ask('GET', `/api/records/${String(start.run)}`, AS_STARTER())
    expect(run.body.record.data).toMatchObject({ workingDirectory: newDir, cutFrom: 'trunk' })
  })

  it('refuses a clone the instance does not have, naming the one it has, on the host and in the helper, and files nothing', async () => {
    const before = await theSessionIds()
    const host = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--clone', 'no-such-clone', '--', 'true'])
    expect(host.status, host.err).toBe(2)
    expect(host.err).toContain('This sandbox has no clone named "no-such-clone"; it has side-repo.')
    const helper = await theHelper(['--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--clone', 'no-such-clone', '--', 'true'])
    expect(helper.status, helper.err).toBe(2)
    expect(helper.err).toContain('This sandbox has no clone named "no-such-clone"; it has side-repo.')
    expect(await theSessionIds()).toEqual(before)
  }, 60_000)

  it("refuses, with --clone, a worktree already there that is not one of that clone's", async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const officesOwn = join(scratch, 'a-worktree-of-the-offices-clone')
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-q', '-b', 'an-office-branch', officesOwn, 'main')
    const before = await theSessionIds()
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--worktree', officesOwn, '--clone', 'side-repo', '--', 'true'])
    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain(`--worktree "${officesOwn}" is already there and is not a worktree of ${join(answer.folder, 'side-repo')}, the clone --clone side-repo names.`)
    expect(await theSessionIds()).toEqual(before)
  })

  it("links no node_modules from a clone's source, which the container does not have, and says so", async () => {
    // PROBLEM aZDeCAYLQlHS, the inspector's note on run Ue5I2kP0P-u7: the office's own clone links node_modules from the
    // checkout every sandbox mounts; another clone's source is on the host only, so a link to it would dangle inside.
    // MUTATION PROOF (the report of the run that added it): the link made for every clone again, and this goes red.
    const answer = upAnswer as { container: string; resource: string; folder: string }
    // THE WORKER'S BRANCH IN THE CLONE is checked out by the first case's worktree: release that worktree, not the branch.
    git(join(answer.folder, 'side-repo'), 'worktree', 'remove', '--force', join(scratch, 'made-from-the-side-clone'))
    mkdirSync(join(side, 'node_modules'), { recursive: true })
    try {
      const newDir = join(scratch, 'made-from-the-side-clone-with-packages')
      const ran = await sandbox([
        'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
        '--worktree', newDir, '--clone', 'side-repo', '--cut-from', 'trunk', '--json',
        '--', 'true',
      ])
      expect(ran.status, ran.err).toBe(0)
      groups.add(JSON.parse(ran.out.trim()).hostPgid)
      expect(readFileSync(join(dirname(JSON.parse(ran.out).out), 'launch.txt'), 'utf8')).toContain(`--worktree ${newDir} did not exist, so it was made: git worktree add from ${join(answer.folder, 'side-repo')}, cut from trunk, on branch ${WORKER}, with no node_modules linked: ${side} is not in the sandbox.`)
      expect(existsSync(join(newDir, 'node_modules')), 'a node_modules link to a folder the container does not have').toBe(false)
    } finally {
      rmSync(join(side, 'node_modules'), { recursive: true, force: true })
    }
  })

  it('is not taken by round, which works in the worktree of the run before', async () => {
    const ran = await sandbox(['round', NAME, '--agent', WORKER, '--brief', join(scratch, 'a-brief.md'), '--clone', 'side-repo'])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('round does not take --clone')
  })
})

// The reminders come from a decision.
describe('the reminders', () => {
  // THE 8-HOUR REMINDER IS THE OFFICE'S NOW (problem Grbb87VX3pND; way (c), XFbDHl9vZzu6): the office writes it
  // from its own clock (src/server/lib/launcher-notices.ts, tested in tests/the-office-writes-the-launchers-notices.test.ts),
  // so the launcher sends none under the run's key, however short SANDBOX_RUN_REMINDER_MS is. Until 18 October 2026 this
  // describe proved the launcher's own timer: one reminder, a refused one logged, a short command bringing none, and a
  // caller's own command bringing none. The timer is gone, and so are the cases that proved only the timer. The refused
  // one, REMINDER_SEND_FAILURE, proved a branch the launcher keeps as well: when the office answers its message with a
  // 5xx, finish.log says so and no second message is sent (theStarterIsTold, tools/sandbox-start.mjs). Removing that case
  // left the branch untested (the merge queue's check sEYtWikmmhIM, message z0hEGYDt53t-). NOT_TAKING_MESSAGES below
  // tests it now, through "could not be written orphaned".
  function reminderClock(ms: number | null): void {
    const now = JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
    now.containers[CONTAINER].Config.Env = (now.containers[CONTAINER].Config.Env ?? []).filter((line: string) => !line.startsWith('SANDBOX_RUN_REMINDER_MS='))
    if (ms !== null) now.containers[CONTAINER].Config.Env.push(`SANDBOX_RUN_REMINDER_MS=${ms}`)
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
  }
  const aboutTheRun = async (run: string, title: (title: string) => boolean) => ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? [])
    .filter((one: any) => one.data.aboutRun === run && typeof one.title === 'string' && title(one.title))
  async function remindedRun(name: string, command: string): Promise<any> {
    const worktree = join(upAnswer!.folder, 'work', name)
    git(join(upAnswer!.folder, 'repo'), 'worktree', 'add', '-b', name, worktree, 'main')
    const ran = await sandbox(['exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
      '--worktree', worktree, '--cut-from', 'main', '--json', '--', 'sh', '-c', command])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out); groups.add(start.hostPgid); return start
  }
  // MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs): this is red on the launcher before (c), whose own timer sent "Run X
  // has run past 8 hours" 100 ms after the start.
  it('sends no reminder of its own, however short its clock; the command runs to its own exit 7; agent runs are never disk-gated', async () => {
    reminderClock(100); diskFigure(1)
    const go = join(upAnswer!.folder, 'out', 'reminder-go')
    try {
      const calls = state().calls.length
      const start = await remindedRun('reminder-long', `while [ ! -e '${go}' ]; do sleep 0.1; done; exit 7`)
      expect(state().calls.slice(calls).some((call) => call.tool === 'df')).toBe(false)
      await new Promise((done) => setTimeout(done, 600))
      expect(await aboutTheRun(start.run, (title) => title.includes('has run past'))).toEqual([])
      expect(alive(start.hostPid)).toBe(true)
      writeFileSync(go, '')
      await until('its own exit 7', async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'crashed')
      expect(readFileSync(join(dirname(start.out), 'finish.log'), 'utf8')).toContain('exited 7')
      expect(await aboutTheRun(start.run, (title) => title.includes('has run past'))).toEqual([])
    } finally { writeFileSync(go, ''); reminderClock(null); diskFigure(100_000_000_000) }
  })
  // A REFUSAL OF A MESSAGE BY THE OFFICE (problem __4iR4FkFAGS; message I84gBy7a4FKg). Until wave 13w round 10 a
  // proxy in front of the test office put a key-shaped piece into the words of each message it picked, and the real door
  // refused it. Since round 10 the door stores such a message and reminds, and no
  // words the launcher writes are refused, so the proxy answers each message it picks itself, in the shape every refusal
  // of the door has: 400, `error`, `reason`, `code` and `values`. The message never reaches the office. It can refuse a
  // PATCH of the run too, in the shape of the office's 409, so the launcher has a refused write to tell the starter of.
  // Given 503, it answers each message it picks with a 503 and an error instead: the office not taking messages at all.
  // Until 18 October 2026 these cases went through the launcher's 8-hour reminder; that is the office's now, so they go
  // through "could not be written orphaned", a notice the launcher keeps (XFbDHl9vZzu6).
  const shortOnes = async (run: string) => aboutTheRun(run, (title) => title === `A message about run ${run} was refused`)
  async function throughARefusingDoor(picks: (title: string) => boolean, refusesAWrite: (sent: any) => boolean, action: () => Promise<void>, messageStatus: 400 | 503 = 400): Promise<void> {
    const originalApi = api
    const proxy = createServer(async (req, reply) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks).toString()
      if (req.method === 'POST' && req.url === '/api/records') {
        const sent = JSON.parse(body)
        if (sent.kind === 'message' && typeof sent.title === 'string' && picks(sent.title)) {
          const answer = messageStatus === 503
            ? { error: 'Test: the office is not taking messages.' }
            : { error: 'Test: the office refused this message.', reason: 'Test: refused.', code: 'recordNotFound', values: {} }
          reply.writeHead(messageStatus, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
          return
        }
      }
      if (req.method === 'PATCH' && req.url?.startsWith('/api/records/') && refusesAWrite(JSON.parse(body))) {
        reply.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Test: the office refused this write.' }))
        return
      }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>
      const response = await fetch(`${originalApi}${req.url}`, { method: req.method, headers, ...(body ? { body } : {}) })
      reply.writeHead(response.status, { 'content-type': 'application/json' }).end(await response.text())
    })
    await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done))
    api = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    try { await action() } finally {
      api = originalApi
      await new Promise<void>((done) => proxy.close(() => done()))
    }
  }
  const theOrphaningWrite = (sent: any) => sent?.dataPatch?.state === 'orphaned'
  it('mutation REFUSED_NOTICE_SAID_SHORTLY: a notice the office refuses is said in a short message, and its words go to finish.log', async () => {
    await throughARefusingDoor((title) => title.endsWith('could not be written orphaned'), theOrphaningWrite, async () => {
      const start = await remindedRun('refused-notice', 'exit 0')
      const log = join(dirname(start.out), 'finish.log')
      await until('the short message in the finish log', () => existsSync(log) && readFileSync(log, 'utf8').includes('A second, short message told it so'), 3000)
      expect(await aboutTheRun(start.run, (title) => title.endsWith('could not be written orphaned'))).toEqual([])
      const [short, ...more] = await shortOnes(start.run)
      expect(more).toEqual([])
      expect(short.data.to).toEqual([{ kind: 'agent', id: starterId }])
      expect(short.data.body).toContain(`Run ${start.run}: the office refused the launcher's message to you about how its command ended (400, recordNotFound)`)
      expect(short.data.body).toContain(log)
      // THE REFUSED WORDS ARE NOT CARRIED ON: the office's answer to the write is in the refused message, not in the short one.
      expect(short.data.body).not.toContain('Test: the office refused this write.')
      const logged = readFileSync(log, 'utf8')
      expect(logged).toContain(`its title was "Run ${start.run} could not be written orphaned"`)
      expect(logged).toContain('Test: the office refused this write.')
      expect(logged).toContain('could not be told (')
    })
  })
  it('mutation SHORT_ONE_REFUSED_TOO: when the short message is refused as well, finish.log says so and nothing is sent', async () => {
    await throughARefusingDoor((title) => title.endsWith('could not be written orphaned') || title.endsWith('was refused'), theOrphaningWrite, async () => {
      const start = await remindedRun('refused-notice-both', 'exit 0')
      const log = join(dirname(start.out), 'finish.log')
      await until('the second refusal in the finish log', () => existsSync(log) && readFileSync(log, 'utf8').includes('The second, short message was refused too'), 3000)
      expect(await aboutTheRun(start.run, (title) => title.endsWith('could not be written orphaned'))).toEqual([])
      expect(await shortOnes(start.run)).toEqual([])
      expect(readFileSync(log, 'utf8')).toContain(`its title was "Run ${start.run} could not be written orphaned"`)
    })
  })
  // MUTATION, RUN ON 18 OCTOBER 2026 (run R29x7PMJscBJ): red when theStarterIsTold sends the short message for a 5xx as it
  // does for a 4xx.
  it('mutation NOT_TAKING_MESSAGES: a notice the office answers with 503 is a line in finish.log, and no short message is sent', async () => {
    await throughARefusingDoor((title) => title.endsWith('could not be written orphaned'), theOrphaningWrite, async () => {
      const start = await remindedRun('unanswered-notice', 'exit 0')
      const log = join(dirname(start.out), 'finish.log')
      await until('the 503 in the finish log', () => existsSync(log) && readFileSync(log, 'utf8').includes('could not be told (503'), 3000)
      expect(await aboutTheRun(start.run, (title) => title.endsWith('could not be written orphaned'))).toEqual([])
      // A 5XX IS THE OFFICE NOT TAKING MESSAGES, which a second message would meet too: none is sent.
      expect(await shortOnes(start.run)).toEqual([])
      const logged = readFileSync(log, 'utf8')
      expect(logged).toContain(`could not be written orphaned (409: Test: the office refused this write.); its starter ${STARTER} could not be told (503: Test: the office is not taking messages.).`)
      expect(logged).not.toContain("the office refused the launcher's message")
    }, 503)
  })
})

describe('status and down', () => {
  // JbKNJHO-snYV / GPit2aAWDwkn: down already removes a stopped container after closing
  // its row. MUTATION: take out commandDown's removeStoppedContainer call; the next up refuses again.
  it('down removes its stopped container, closes its row and says so, leaving another sandbox untouched', async () => {
    const name = 'stopped-down'
    const container = `mole-office-sandbox-${name}`
    const other = 'mole-office-sandbox-another'
    const up = await sandbox(['up', template, '--name', name, '--from', main, '--json'])
    expect(up.status, up.err).toBe(0)
    const answer = JSON.parse(up.out.trim()) as { container: string; resource: string }
    const now = state()
    const mine = now.containers[container]!
    mine.State.Running = false
    now.containers[other] = { ...mine, Id: 'synthetic-other-container', Name: `/${other}`, Config: { Labels: { 'mole-office.sandbox': 'another' } } } as typeof mine
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    const callsBefore = now.calls.length
    try {
      const down = await sandbox(['down', name])
      expect(down.status, down.err).toBe(0)
      const row = (await ledger()).find((r) => r.id === answer.resource)
      expect(row.releasedAt).not.toBeNull()
      const next = await sandbox(['up', template, '--name', name, '--from', main, '--json'])
      expect(next.status, next.err).toBe(0)
      expect(down.out).toContain(`the ledger released row ${answer.resource}:`)
      expect(down.out).toContain(`container ${container}: removed (${answer.container.slice(0, 12)})`)
      const calls = state().calls.slice(callsBefore)
      expect(calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'rm')).toEqual([
        expect.objectContaining({ argv: ['rm', answer.container] }),
      ])
      expect(calls.some((c) => c.tool === 'ledger-stop' || (c.tool === 'docker' && c.argv[0] === 'stop'))).toBe(false)
      expect(state().containers[other]).toEqual(now.containers[other])
      expect((await sandbox(['down', name])).status).toBe(0)
    } finally {
      const final = state()
      delete final.containers[other]
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(final))
    }
  })

  it('status names the container, its row, and each process with its host group and cwd', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const ran = await sandbox(['exec', NAME, '--json', '--cwd', join(answer.folder, 'out'), '--', 'sleep', '300'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    // STATUS ONLY READS, AND A PERSON MAY RUN IT WITH NO AGENT SET: asked by nobody in particular, it still answers.
    // The case below is the one that names the caller (acceptance finding 67).
    const status = await sandbox(['status', NAME, '--json'], null)
    expect(status.status, status.err).toBe(0)
    const [report] = JSON.parse(status.out).reports
    expect(report.container).toMatchObject({ name: CONTAINER, id: answer.container, docker: 'running' })
    expect(report.containerRow.id).toBe(answer.resource)
    expect(report.containerRow.ledger).toMatch(/^open, alive, owned by session /)
    const mine = report.processes.find((p: any) => p.processRow === start.processRow)
    expect(mine).toMatchObject({ hostPid: start.hostPid, hostPgid: start.hostPgid, cwd: join(answer.folder, 'out'), liveness: 'alive' })
    // THE TEMPLATE ASKS FOR NO DOCKER INIT, so the container's first process is the command its image starts.
    expect(report.notInTheLedger).toEqual([expect.objectContaining({ pid: 999999, what: "the container's first process, the command it was started with, which keeps it running" })])
    expect(report.notComparedBecause).toBeNull()
  })

  it('down refuses another session\'s sandbox, and for its own stops it only through the ledger, removes it and keeps the files', async () => {
    const answer = upAnswer as { container: string; resource: string; folder: string }
    const running = startsOf(answer.folder).filter((s) => alive(s.hostPid))
    expect(running.length, 'a process still runs inside before down').toBeGreaterThan(0)

    // ANOTHER SESSION'S SANDBOX is not stopped without --force.
    const theirs = await sandbox(['down', NAME], { agent: STRANGER, session: strangerSession })
    expect(theirs.status, theirs.err).toBe(1)
    expect(theirs.err).toContain('--force')
    expect(state().containers[CONTAINER]?.State.Running).toBe(true)

    // THE OFFICE SILENT, AS IT IS WHILE IT RESTARTS AFTER A LANDING OR ANSWERS SLOWLY UNDER A SUITE (acceptance finding
    // 64): a proxy in front of it drops the first two readings of the ledger, and loses the answer to the release the
    // ledger confirms. The down waits for the ledger, and reads it again to see the row released.
    // MUTATION PROOF, 24 September 2026, each alone in tools/sandbox.mjs: the ledger read once, and this goes red on the
    // first silence; the lost answer taken as a refusal, and it goes red on the release.
    const office = api
    let dropped = 0
    let lostRelease = false
    const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'])
    const proxy = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        void (async () => {
          const body = Buffer.concat(chunks)
          if (req.method === 'GET' && (req.url ?? '').startsWith('/api/resources') && dropped < 2) {
            dropped += 1
            req.socket.destroy()
            return
          }
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([k, v]) => !HOP_BY_HOP.has(k) && typeof v === 'string')) as Record<string, string>
          const answer = await fetch(`${office}${req.url ?? ''}`, { method: req.method, headers, ...(body.length > 0 ? { body } : {}) })
          const text = await answer.text()
          if (!lostRelease && req.method === 'POST' && /\/release$/u.test(req.url ?? '') && body.toString().includes('"expect"')) {
            lostRelease = true
            req.socket.destroy()
            return
          }
          res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' })
          res.end(text)
        })()
      })
    })
    await new Promise<void>((go) => proxy.listen(0, '127.0.0.1', go))
    api = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
    let down: Ran
    try {
      down = await sandbox(['down', NAME, '--json'])
    } finally {
      api = office
      proxy.close()
    }
    expect(down.status, down.err).toBe(0)
    expect(dropped, 'the ledger was read through the silence').toBe(2)
    expect(down.err).toContain('the ledger did not answer')
    expect(lostRelease, 'the confirmed release was sent').toBe(true)
    expect((JSON.parse(down.out.trim()) as { stopped: string[] }).stopped.join('\n')).toContain('though its answer was lost')
    const calls = state().calls
    expect(calls.filter((c) => c.tool === 'ledger-stop').map((c) => c.argv[0])).toContain(CONTAINER)
    expect(calls.some((c) => c.tool === 'docker' && c.argv[0] === 'stop'), 'the launcher stopped a container itself').toBe(false)
    expect(calls.some((c) => c.tool === 'docker' && c.argv[0] === 'rm' && c.argv[1] === answer.container)).toBe(true)
    expect(state().containers[CONTAINER]).toBeUndefined()

    const rows = await ledger()
    expect(rows.find((r) => r.id === answer.resource)?.releasedAt).not.toBeNull()
    for (const s of running) {
      expect(alive(s.hostPid)).toBe(false)
      expect(rows.find((r) => r.id === s.processRow)?.releasedAt, `process row ${s.processRow}`).not.toBeNull()
    }
    // THE FILES ARE KEPT.
    for (const kept of ['repo', 'home', 'logs', 'out', 'dsh', 'instance.json']) expect(existsSync(join(answer.folder, kept)), kept).toBe(true)
    expect(lstatSync(join(answer.folder, 'repo', 'node_modules')).isSymbolicLink()).toBe(true)
  })

  // THE LAUNCHER READS ONLY THE OPEN ROWS, AND IT NAMES THE CALLER (acceptance finding 67). On 24
  // September 2026 `status` and `down` asked for `/api/resources?includeReleased=true`, which built a
  // report for every row the ledger had ever held: a median of 21.4 seconds and at most 47 seconds,
  // while the open rows took a median of 0.4 seconds, and the office answered nothing else meantime.
  // The slow reads carried no caller, so nobody could say whose loop was asking.
  // MUTATION PROOFS, 24 September 2026, each alone in tools/sandbox.mjs: the launcher asking for the
  // released rows again, and this goes red; the ledger read sent without the caller's agent and
  // session, and this goes red.
  it('reads only the open rows, names the caller, and calls a row that is not open not open', async () => {
    const SECOND = 'recorded'
    const SECOND_CONTAINER = `mole-office-sandbox-${SECOND}`
    const up = await sandbox(['up', template, '--name', SECOND, '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const ran = await sandbox(['exec', SECOND, '--json', '--', 'sleep', '300'])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    // THE ROW IS RELEASED, so it is no longer among the ledger's open rows.
    expect((await releaseRow(start.processRow)).status).toBe(200)

    // EVERY REQUEST FROM HERE IS RECORDED AND FORWARDED to the test's own office.
    const office = api
    const seen: { method: string; url: string; headers: Record<string, string | string[] | undefined> }[] = []
    let theLedgerIsDown = false
    const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'])
    const proxy = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        void (async () => {
          const body = Buffer.concat(chunks)
          seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers })
          if (theLedgerIsDown && req.method === 'GET' && (req.url ?? '').startsWith('/api/resources')) {
            res.writeHead(503, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'the ledger is not answering (this test refuses it)' }))
            return
          }
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([k, v]) => !HOP_BY_HOP.has(k) && typeof v === 'string')) as Record<string, string>
          const reply = await fetch(`${office}${req.url ?? ''}`, { method: req.method, headers, ...(body.length > 0 ? { body } : {}) })
          const text = await reply.text()
          res.writeHead(reply.status, { 'content-type': reply.headers.get('content-type') ?? 'application/json' })
          res.end(text)
        })()
      })
    })
    await new Promise<void>((go) => proxy.listen(0, '127.0.0.1', go))
    api = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
    try {
      const status = await sandbox(['status', SECOND, '--json'])
      expect(status.status, status.err).toBe(0)

      // A LEDGER THAT CANNOT BE READ SAYS NOTHING ABOUT A ROW: the ledger field says why, and liveness is null, as it
      // was before this change, never 'not open', which would be a claim about the ledger from a read that never
      // happened (USER.md invariant 5; the inspector's refusal of this change, check session 5Nps0OdfRBVK).
      theLedgerIsDown = true
      const unread = await sandbox(['status', SECOND, '--json'])
      theLedgerIsDown = false
      expect(unread.status, unread.err).toBe(0)
      const unreadReport = JSON.parse(unread.out).reports[0]
      const unreadMine = unreadReport.processes.find((p: any) => p.processRow === start.processRow)
      expect(unreadMine).toBeDefined()
      expect(unreadMine.ledger).toMatch(/^the ledger could not be read \(503: /)
      expect(unreadMine.liveness).toBeNull()
      expect(unreadReport.containerRow.ledger).toMatch(/^the ledger could not be read \(503: /)
      // AND NOTHING INSIDE IS CALLED ESCAPED: an unread ledger names no group, so nothing is compared with it, and the
      // report says why (acceptance finding 70).
      expect(unreadReport.notInTheLedger).toBeNull()
      expect(unreadReport.notComparedBecause).toMatch(/^the ledger could not be read \(503: /)


      const down = await sandbox(['down', SECOND, '--json'])
      expect(down.status, down.err).toBe(0)
      // A SECOND DOWN FINDS THE CONTAINER'S ROW CLOSED, and says it is not open, which is true, rather than that the
      // ledger holds no such row, which is not (a review of this change).
      const again = await sandbox(['down', SECOND, '--json'])
      expect(again.status, again.err).toBe(0)
      const rowId = JSON.parse(up.out).resource as string
      expect(JSON.parse(again.out).stopped).toContain(
        `row ${rowId} is not open in the ledger of ${WORKSPACE}: closed, or never written. The launcher reads only the open ` +
          'rows; the history is GET /api/resources?includeReleased=true, which holds the office for 20 seconds or more (acceptance finding 67).',
      )

      // A PROCESS ROW THAT IS NOT OPEN IS NOT OPEN: the launcher cannot tell a closed row from one
      // that was never written, so it says both, and it does not call the row released.
      const report = JSON.parse(status.out).reports[0]
      const mine = report.processes.find((p: any) => p.processRow === start.processRow)
      expect(mine).toBeDefined()
      expect(mine.ledger).toBe(
        `not open in the ledger of ${WORKSPACE}: closed, or never written. The launcher reads only the open rows; ` +
          'the history is GET /api/resources?includeReleased=true, which holds the office for 20 seconds or more (acceptance finding 67).',
      )
      expect(mine.liveness).toBe('not open')

      // NO REQUEST ASKED FOR THE RELEASED ROWS, and every read of the ledger named the caller.
      expect(seen.some((r) => r.url.includes('includeReleased=true')), 'a request asked for the released rows').toBe(false)
      const reads = seen.filter((r) => r.method === 'GET' && r.url === '/api/resources')
      expect(reads.length, 'status and down both read the ledger').toBeGreaterThanOrEqual(2)
      for (const r of reads) {
        expect(r.headers['x-mole-office-actor-id']).toBe(STARTER)
        expect(r.headers['x-mole-office-session']).toBe(starterSession)
      }

      // AN AGENT THAT NAMES NO SESSION IS STILL THAT AGENT: its read carries its name and no session header, where it
      // went out nameless and was filed as the person (acceptance finding 70).
      const beforeTheAgentAlone = seen.length
      const agentAlone = await sandbox(['status', SECOND, '--json', '--as', STARTER], null)
      expect(agentAlone.status, agentAlone.err).toBe(0)
      const itsReads = seen.slice(beforeTheAgentAlone).filter((r) => r.method === 'GET' && r.url === '/api/resources')
      expect(itsReads.length, 'the status of an agent alone read the ledger').toBeGreaterThanOrEqual(1)
      for (const r of itsReads) {
        expect(r.headers['x-mole-office-actor-type']).toBe('agent')
        expect(r.headers['x-mole-office-actor-id']).toBe(STARTER)
        expect(r.headers['x-mole-office-session']).toBeUndefined()
      }
    } finally {
      api = office
      proxy.close()
    }
    expect(state().containers[SECOND_CONTAINER]).toBeUndefined()
  })
})

describe('tools/register-a-run.mjs', () => {
  it('refuses half a sandbox and writes nothing', async () => {
    const before = (await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body
    const ran = await new Promise<Ran>((done) => {
      const child = spawn(process.execPath, [
        join(REPO, 'tools', 'register-a-run.mjs'),
        '--handle', WORKER, '--worktree', main, '--cut-from', 'main', '--runtime', 'dsh', '--model', 'm',
        '--as', STARTER, '--session', starterSession, '--api', api, '--workspace', WORKSPACE,
        '--sandbox-template', 'mole-office-dev',
      ])
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain('--sandbox-template and --sandbox-container go together')
    expect((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body).toEqual(before)
  })

  // A FILES SEAL READS THE FOLDER to say where the run could not have written (A2 of a decision), so a folder is
  // never dropped without a word when no sandbox is named, nor written when it is relative, which the seal would
  // then read as no folder at all.
  // MUTATION PROOF, 23 September 2026, each alone: the halves left out of the folder's check, and this goes red
  // on the folder alone; the absolute check left out, and it goes red on the relative folder. Each time the tool
  // filed the run (exit 0) where it should have refused.
  it('refuses a sandbox folder with no sandbox, or one that is not absolute, and writes nothing', async () => {
    const before = (await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body
    const register = (extra: string[]): Promise<Ran> =>
      new Promise<Ran>((done) => {
        const child = spawn(process.execPath, [
          join(REPO, 'tools', 'register-a-run.mjs'),
          '--handle', WORKER, '--worktree', main, '--cut-from', 'main', '--runtime', 'dsh', '--model', 'm',
          '--as', STARTER, '--session', starterSession, '--api', api, '--workspace', WORKSPACE,
          ...extra,
        ])
        let out = ''
        let err = ''
        child.stdout.on('data', (c) => (out += c))
        child.stderr.on('data', (c) => (err += c))
        child.on('close', (code) => done({ status: code ?? 1, out, err }))
      })
    const alone = await register(['--sandbox-folder', `${THE_TEST_FIXTURE_ROOT}/sandboxes/one`])
    expect(alone.status, alone.err).toBe(2)
    expect(alone.err).toContain('--sandbox-folder names the instance folder')
    const relative = await register(['--sandbox-template', 'mole-office-dev', '--sandbox-container', 'V1StGXR8_Z5j', '--sandbox-folder', 'sandboxes/one'])
    expect(relative.status, relative.err).toBe(2)
    expect(relative.err).toContain('--sandbox-folder names the instance folder')
    expect((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body).toEqual(before)
  })
})

// ============================================================================ merge cleanup (decision KTy-tBdinBQe)

describe('merge sandbox cleanup', () => {
  async function mergeSandbox(name: string, down = true): Promise<string> {
    const up = await sandbox(['up', template, '--name', name, '--from', main, '--no-dsh', '--label', 'mole-office.merge-entry=synthetic-entry', '--label', 'mole-office.synthetic=a=b', '--json'])
    expect(up.status, up.err).toBe(0)
    const folder = (JSON.parse(up.out) as { folder: string }).folder
    if (down) expect((await sandbox(['down', name])).status).toBe(0)
    return folder
  }

  function cloneParts(folder: string): void {
    rmSync(join(folder, 'repo'), { recursive: true, force: true })
    for (const part of ['repo', 'work/clone', 'work/pair', 'work/reports', 'logs', 'out', 'home']) {
      mkdirSync(join(folder, part), { recursive: true })
      writeFileSync(join(folder, part, 'synthetic.txt'), 'synthetic\n')
    }
  }

  // A proxy drops the first release before forwarding, or refuses it. It never reaches the live office.
  async function releaseProxy(mode: 'lost' | 'refused' | 'pass', action: () => Promise<Ran>, onRelease: () => void = () => {}): Promise<{ ran: Ran; releases: number }> {
    const office = api
    let releases = 0
    const proxy = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks)
      if (req.method === 'POST' && /\/release$/u.test(req.url ?? '')) {
        releases += 1
        if (releases === 1) onRelease()
        if (mode === 'lost' && releases === 1) { req.socket.destroy(); return }
        if (mode === 'refused' && releases === 1) { res.writeHead(403, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Synthetic refusal.' })); return }
      }
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) => !['host', 'connection', 'content-length', 'transfer-encoding'].includes(key) && typeof value === 'string')) as Record<string, string>
      const upstream = await fetch(`${office}${req.url ?? ''}`, { method: req.method, headers, ...(body.length > 0 ? { body } : {}) })
      res.writeHead(upstream.status, { 'content-type': 'application/json' })
      res.end(await upstream.text())
    })
    await new Promise<void>((go) => proxy.listen(0, '127.0.0.1', go))
    api = `http://127.0.0.1:${String((proxy.address() as AddressInfo).port)}`
    try { return { ran: await action(), releases } }
    finally { api = office; await new Promise<void>((go) => proxy.close(() => go())) }
  }

  // Mutation: send the release once only.
  it('sends a lost release again when the ledger still holds the row open, and says it waited', async () => {
    await mergeSandbox('lost-release', false)
    const { ran, releases } = await releaseProxy('lost', () => sandbox(['down', 'lost-release', '--json']))
    expect(ran.status, ran.err).toBe(0)
    // One lost request, then the real door's confirmation request and its confirmed release.
    expect(releases).toBe(3)
    expect(ran.err).toContain('the ledger did not answer')
    expect(ran.err).toContain('asking again in 2 seconds')
    expect(state().containers['mole-office-sandbox-lost-release']).toBeUndefined()
  })

  // Mutation: send again after a 403 too.
  it('says a 403 at once and does not send its release again', async () => {
    await mergeSandbox('answered-release', false)
    const { ran, releases } = await releaseProxy('refused', () => sandbox(['down', 'answered-release']))
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('403: Synthetic refusal.')
    expect(ran.err).not.toContain('asking again')
    expect(releases).toBe(1)
    expect((await sandbox(['down', 'answered-release'])).status).toBe(0)
  })

  // Mutation: drop labels from instance.json.
  it('up keeps every label pair in instance.json', async () => {
    const folder = await mergeSandbox('kept-labels')
    expect(JSON.parse(readFileSync(join(folder, 'instance.json'), 'utf8')).labels).toEqual({ 'mole-office.merge-entry': 'synthetic-entry', 'mole-office.synthetic': 'a=b' })
  })

  // The merge tool's other trees (tools/sandbox-common.mjs theReCreatableMergeParts), each a file of 10 bytes.
  const THE_OTHER_TREES = ['work/main', 'work/bus-1', 'work/bus-2', 'work/without', 'work/second']
  function otherTrees(folder: string): void {
    for (const part of [...THE_OTHER_TREES, 'work/bus-notes']) {
      mkdirSync(join(folder, part), { recursive: true })
      writeFileSync(join(folder, part, 'synthetic.txt'), 'synthetic\n')
    }
  }

  // Mutations, each alone: also remove logs/; skip repo/; skip work/pair; skip work/main; skip a bus tree; take any
  // name that starts with bus-; report 0 bytes.
  it('clear removes exactly the trees the merge tool makes again, reports paths and bytes, and records an idempotent clearing', async () => {
    const folder = await mergeSandbox('exact-clear')
    cloneParts(folder)
    otherTrees(folder)
    const ran = await sandbox(['clear', 'exact-clear', '--json'])
    expect(ran.status, ran.err).toBe(0)
    const answer = JSON.parse(ran.out)
    expect(answer.removed).toEqual(['work/clone', 'work/pair', ...THE_OTHER_TREES, 'repo'].map((part) => ({ path: join(folder, part), bytes: 10 })))
    expect(answer.bytesFreed).toBe(80)
    expect(answer.clearedAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u)
    expect(JSON.parse(readFileSync(join(folder, 'instance.json'), 'utf8')).clearedAt).toBe(answer.clearedAt)
    for (const gone of ['work/clone', 'work/pair', ...THE_OTHER_TREES, 'repo']) expect(existsSync(join(folder, gone)), gone).toBe(false)
    for (const kept of ['work/reports', 'work/bus-notes', 'logs', 'out', 'home', 'instance.json']) expect(existsSync(join(folder, kept)), kept).toBe(true)
    const again = await sandbox(['clear', 'exact-clear', '--json'])
    expect(again.status, again.err).toBe(0)
    expect(JSON.parse(again.out)).toMatchObject({ alreadyCleared: true, bytesFreed: 0, removed: [], clearedAt: answer.clearedAt })
    expect((await sandbox(['clear', 'exact-clear'])).out).toContain('was already cleared; freed 0 bytes')
  })

  // Mutation: answer an already cleared folder with nothing removed, as the clear did until 5 October 2026.
  it('a second clear removes the trees an older clear left, and keeps the first clearing\'s time', async () => {
    const folder = await mergeSandbox('older-clear')
    cloneParts(folder)
    for (const part of ['repo', 'work/clone', 'work/pair']) rmSync(join(folder, part), { recursive: true, force: true })
    otherTrees(folder)
    // The host's copy of the facts, which the launcher reads; the copy in the folder is the sandbox's own.
    const file = join(sandboxes, '.run', 'older-clear', 'instance.json')
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), clearedAt: '2026-10-03 12:00:00' }))
    const ran = await sandbox(['clear', 'older-clear', '--json'])
    expect(ran.status, ran.err).toBe(0)
    expect(JSON.parse(ran.out)).toEqual({
      instance: 'older-clear', clearedAt: '2026-10-03 12:00:00', alreadyCleared: true,
      removed: THE_OTHER_TREES.map((part) => ({ path: join(folder, part), bytes: 10 })), bytesFreed: 50,
    })
    for (const gone of THE_OTHER_TREES) expect(existsSync(join(folder, gone)), gone).toBe(false)
    for (const kept of ['work/reports', 'work/bus-notes', 'logs', 'out', 'home']) expect(existsSync(join(folder, kept)), kept).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')).clearedAt).toBe('2026-10-03 12:00:00')
  })

  // Mutation: accept the unlabelled one.
  it('clear refuses an unlabelled sandbox and removes nothing', async () => {
    const folder = await mergeSandbox('unlabelled-clear')
    cloneParts(folder)
    // The host's copy of the facts, which the launcher reads; the copy in the folder is the sandbox's own.
    const file = join(sandboxes, '.run', 'unlabelled-clear', 'instance.json')
    const before = JSON.parse(readFileSync(file, 'utf8'))
    delete before.labels
    writeFileSync(file, JSON.stringify(before))
    const ran = await sandbox(['clear', 'unlabelled-clear'])
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('Sandbox unlabelled-clear has no mole-office.merge-entry label, so nothing was removed.')
    for (const kept of ['repo', 'work/clone']) expect(existsSync(join(folder, kept))).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8')).clearedAt).toBeUndefined()
  })

  // Mutation: accept a worktrees entry.
  it('clear refuses a worktrees entry and removes nothing', async () => {
    const folder = await mergeSandbox('worktree-clear')
    cloneParts(folder)
    writeFileSync(join(folder, 'worktrees', 'synthetic'), 'retained')
    const ran = await sandbox(['clear', 'worktree-clear'])
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('Sandbox worktree-clear has a worktrees/ entry, so nothing was removed.')
    for (const kept of ['repo', 'work/clone']) expect(existsSync(join(folder, kept))).toBe(true)
  })

  // Mutation: remove after a failed down.
  it('clear refuses when its down fails and removes nothing', async () => {
    const folder = await mergeSandbox('failed-down-clear', false)
    cloneParts(folder)
    const { ran } = await releaseProxy('refused', () => sandbox(['clear', 'failed-down-clear', '--json']))
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('403: Synthetic refusal.')
    for (const kept of ['repo', 'work/clone']) expect(existsSync(join(folder, kept))).toBe(true)
    expect(JSON.parse(readFileSync(join(folder, 'instance.json'), 'utf8')).clearedAt).toBeUndefined()
    expect((await sandbox(['down', 'failed-down-clear'])).status).toBe(0)
  })

  // Mutation: remove without the down.
  it('clear brings an open sandbox down through the ledger before removing the clone parts', async () => {
    const folder = await mergeSandbox('open-clear', false)
    cloneParts(folder)
    let partsWerePresentAtDown = false
    const { ran } = await releaseProxy('pass', () => sandbox(['clear', 'open-clear', '--json']), () => { partsWerePresentAtDown = ['work/clone', 'work/pair', 'repo'].every((part) => existsSync(join(folder, part))) })
    expect(partsWerePresentAtDown, 'clone parts must still exist when the down reaches the ledger').toBe(true)
    expect(ran.status, ran.err).toBe(0)
    expect(state().calls.filter((call) => call.tool === 'ledger-stop').map((call) => call.argv[0])).toContain('mole-office-sandbox-open-clear')
    expect(state().containers['mole-office-sandbox-open-clear']).toBeUndefined()
    expect(existsSync(join(folder, 'work/clone'))).toBe(false)
    expect(JSON.parse(ran.out).bytesFreed).toBe(30)
  })

  // Mutation: ignore the open process row.
  it('clear refuses an open process row even without a start in logs', async () => {
    const folder = await mergeSandbox('open-process-clear', false)
    cloneParts(folder)
    const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
    groups.add(child.pid!)
    try {
      const registered = await ask('POST', '/api/resources', AS_STARTER(), { type: 'process', container: 'mole-office-sandbox-open-process-clear', pidInContainer: child.pid, sessionRecordId: starterSession, detail: 'Synthetic unlogged process' })
      expect(registered.status, JSON.stringify(registered.body)).toBe(201)
      expect((await sandbox(['down', 'open-process-clear'])).status).toBe(0)
      const ran = await sandbox(['clear', 'open-process-clear'])
      expect(ran.status).toBe(1)
      expect(ran.err).toContain(`Sandbox open-process-clear still has open ledger row ${registered.body.resource.id}, so nothing was removed.`)
      for (const kept of ['repo', 'work/clone']) expect(existsSync(join(folder, kept))).toBe(true)
    } finally {
      process.kill(-child.pid!, 'SIGKILL')
      await new Promise<void>((go) => child.once('close', () => go()))
      groups.delete(child.pid!)
    }
  })

  // Mutation: ignore Docker's running container.
  it('clear refuses when docker still says its container is running', async () => {
    const folder = await mergeSandbox('running-clear', false)
    cloneParts(folder)
    const container = state().containers['mole-office-sandbox-running-clear']!
    expect((await sandbox(['down', 'running-clear'])).status).toBe(0)
    const now = state()
    now.containers['mole-office-sandbox-running-clear'] = container
    writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
    try {
      const ran = await sandbox(['clear', 'running-clear'])
      expect(ran.status).toBe(1)
      expect(ran.err).toContain('Docker still says sandbox running-clear is running, so nothing was removed.')
      for (const kept of ['repo', 'work/clone']) expect(existsSync(join(folder, kept))).toBe(true)
    } finally {
      const after = state()
      delete after.containers['mole-office-sandbox-running-clear']
      writeFileSync(join(fakes, 'state.json'), JSON.stringify(after))
    }
  })

  // Mutation: follow a linked parent outside the instance.
  it('clear keeps clone parts reached through a linked parent outside the instance', async () => {
    const folder = await mergeSandbox('linked-clear')
    cloneParts(folder)
    const outside = join(scratch, 'synthetic-linked-work')
    mkdirSync(join(outside, 'clone'), { recursive: true })
    writeFileSync(join(outside, 'clone', 'kept.txt'), 'kept')
    rmSync(join(folder, 'work'), { recursive: true })
    symlinkSync(outside, join(folder, 'work'))
    const ran = await sandbox(['clear', 'linked-clear'])
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('Sandbox linked-clear has a linked parent of work/clone, so nothing was removed.')
    expect(readFileSync(join(outside, 'clone', 'kept.txt'), 'utf8')).toBe('kept')
    expect(existsSync(join(folder, 'repo'))).toBe(true)
  })

  // Mutation: restart a cleared folder.
  it('up refuses a cleared folder in plain words', async () => {
    const folder = await mergeSandbox('restart-cleared')
    expect((await sandbox(['clear', 'restart-cleared'])).status).toBe(0)
    const ran = await sandbox(['up', template, '--name', 'restart-cleared', '--from', main, '--no-dsh'])
    expect(ran.status).toBe(1)
    expect(ran.err).toContain('The sandbox restart-cleared was cleared, so its folder cannot be started again; choose another --name. Nothing was started.')
    expect(existsSync(join(folder, 'repo'))).toBe(false)
  })
})

// These files belong to this test's made-up checkout. No host checkout's env files are read.
describe('up covers the main checkout env files', () => {
  function mountsOf(name: string): { Type: string; Source: string; Destination: string; RW: boolean }[] {
    return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8')).containers[`mole-office-sandbox-${name}`].Mounts
  }

  async function up(name: string): Promise<Ran> {
    return sandbox(['up', template, '--name', name, '--from', main, '--no-dsh', '--json'])
  }

  // Mutation: append no env cover mounts.
  it('covers .env and .env.local with an empty read-only host file and leaves .env.example and the other mounts alone', async () => {
    const name = 'env-covers'
    for (const file of ['.env', '.env.local', '.env.example']) writeFileSync(join(main, file), 'MADE_UP_CONFIGURATION=fixture\n', { mode: 0o600 })
    try {
      const ran = await up(name)
      expect(ran.status, ran.err).toBe(0)
      const mounts = mountsOf(name)
      const covers = mounts.filter(m => [join(main, '.env'), join(main, '.env.local')].includes(m.Destination))
      expect(covers.map(m => m.Destination).sort()).toEqual([join(main, '.env'), join(main, '.env.local')].sort())
      expect(new Set(covers.map(m => m.Source)).size).toBe(1)
      for (const cover of covers) {
        expect(cover).toMatchObject({ Type: 'bind', RW: false })
        expect(dirname(cover.Source)).toBe(join(sandboxes, '.run', name))
        expect(lstatSync(cover.Source).isFile()).toBe(true)
        expect(statSync(cover.Source).mode & 0o777).toBe(0o444)
        expect(readFileSync(cover.Source)).toHaveLength(0)
      }
      expect(mounts.some(m => m.Destination === join(main, '.env.example'))).toBe(false)
      // THE MIRROR OF MAIN, the clone's origin, read-only (item 2f).
      const mirror = git(join(sandboxes, name, 'repo'), 'config', '--get', 'remote.origin.url')
      expect(mounts.filter(m => !covers.includes(m))).toEqual([
        { Type: 'bind', Source: join(sandboxes, name), Destination: join(sandboxes, name), RW: true },
        { Type: 'bind', Source: main, Destination: main, RW: false },
        { Type: 'tmpfs', Source: '', Destination: join(main, 'data'), RW: false },
        { Type: 'tmpfs', Source: '', Destination: join(main, 'node_modules', '.vite-temp'), RW: true },
        { Type: 'bind', Source: mirror, Destination: mirror, RW: false },
      ])
    } finally {
      if (state().containers[`mole-office-sandbox-${name}`]) expect((await sandbox(['down', name])).status).toBe(0)
      for (const file of ['.env', '.env.local', '.env.example']) rmSync(join(main, file), { force: true })
    }
  })

  // Mutation: scan only a fixed list of .env and .env.local.
  it('covers a new .env.x added before a later up of the same sandbox', async () => {
    const name = 'env-added'
    try {
      const first = await up(name)
      expect(first.status, first.err).toBe(0)
      expect(mountsOf(name).some(m => m.Destination === join(main, '.env.x'))).toBe(false)
      expect((await sandbox(['down', name])).status).toBe(0)
      writeFileSync(join(main, '.env.x'), 'MADE_UP_CONFIGURATION=added-before-up\n', { mode: 0o600 })
      const later = await up(name)
      expect(later.status, later.err).toBe(0)
      const cover = mountsOf(name).find(m => m.Destination === join(main, '.env.x'))
      expect(cover).toMatchObject({ Type: 'bind', RW: false })
      expect(readFileSync(cover!.Source)).toHaveLength(0)
    } finally {
      if (state().containers[`mole-office-sandbox-${name}`]) expect((await sandbox(['down', name])).status).toBe(0)
      rmSync(join(main, '.env.x'), { force: true })
    }
  })

  // Mutation: skip a non-regular env path instead of refusing.
  it('refuses a symlinked .env with a sentence naming it before filing or starting anything', async () => {
    const name = 'env-linked'
    symlinkSync('README.md', join(main, '.env'))
    const before = (await ledger()).length
    const starts = state().calls.filter(c => c.tool === 'devcontainer').length
    try {
      const ran = await up(name)
      expect(ran.status).toBe(1)
      expect(ran.err).toContain(`The checkout env file ${join(main, '.env')} cannot be covered because it is not a regular file. Nothing was started.`)
      expect(state().calls.filter(c => c.tool === 'devcontainer')).toHaveLength(starts)
      expect((await ledger()).length).toBe(before)
      expect(existsSync(join(sandboxes, name))).toBe(false)
    } finally {
      if (state().containers[`mole-office-sandbox-${name}`]) expect((await sandbox(['down', name])).status).toBe(0)
      rmSync(join(main, '.env'), { force: true })
    }
  })
})

// THE HOST TAKES NO DECISION FROM A FILE THE SANDBOX CAN WRITE. The instance folder is mounted into the sandbox
// read-write, so a run in it can rewrite the copy of the facts kept there. The launcher reads its own copy, in its
// folder that is not mounted, and takes the folder's copy of a sandbox made before it kept one only after checking it.
describe("the host's copy of a sandbox's facts, which a run in the sandbox cannot write", () => {
  const KEPT = 'kept-facts'
  const OTHER = 'kept-facts-other'
  const OLD = 'old-facts'
  const containerOf = (name: string): string => `mole-office-sandbox-${name}`
  const folderCopy = (name: string): string => join(sandboxes, name, 'instance.json')
  const hostCopy = (name: string): string => join(sandboxes, '.run', name, 'instance.json')
  const theLaunchersOwn = join(REPO, 'sandboxes', 'mole-office-dev')
  let decoy = ''

  /**
   * THE MACHINE AS IT IS FOR A HELPER STARTED INSIDE A SANDBOX: every program that sends to the office runs in a
   * container, and is in the pid namespace every process here is in, which `base` gives the sandboxes' containers. The
   * container called `other` has a namespace of its own, with a process for every pid here, as a busy container would
   * have. Its processes have pids past the highest pid Linux gives, so none is a real one.
   */
  function aMachineWhereEverySenderIsInside(base: ResourcesLib['LINUX_PROBE'], other: string): ResourcesLib['LINUX_PROBE'] {
    const PAST = 4_194_304
    const THEIRS = 'pid:[4026530002]'
    const probe = Object.create(base) as ResourcesLib['LINUX_PROBE']
    Object.assign(probe, {
      senderOfAConnection: (peer: { address: string; port: number }, ours: { address: string; port: number }) => {
        const sender = base.senderOfAConnection!.call(base, peer, ours)
        return sender === null || sender.pid === null ? sender : { ...sender, inAnotherContainer: true }
      },
      containerFirstProcess: (id: string) => {
        const seen = base.containers.call(base)
        const named = seen.available ? seen.containers.find((one) => one.id === id)?.name : undefined
        return named === other ? { ok: true, pid: 2 * PAST } : base.containerFirstProcess!.call(base, id)
      },
      pidNamespaceOf: (pid: number) =>
        pid === 2 * PAST ? { namespace: THEIRS, nspid: [pid, 1] } : pid > PAST ? { namespace: THEIRS, nspid: [pid, pid - PAST] } : base.pidNamespaceOf!.call(base, pid),
      processTable: () => {
        const table = base.processTable!.call(base)
        return table.ok ? { ...table, processes: [...table.processes, ...table.processes.map((one) => ({ ...one, pid: one.pid + PAST }))] } : table
      },
      processById: (pid: number) => {
        if (pid <= PAST) return base.processById.call(base, pid)
        const twin = base.processById.call(base, pid - PAST)
        return twin === null ? null : { ...twin, pid }
      },
    })
    return probe
  }
  /** The old sandbox's copy as one made from the launcher's own template folder holds it, which the host can check. */
  let anOldCopy: Record<string, any> = {}

  beforeAll(async () => {
    // A TEMPLATE THE REWRITTEN COPY POINTS TO, which declares one more secret than the sandbox's own and sets it.
    decoy = join(scratch, 'a-decoy-template')
    mkdirSync(decoy)
    writeFileSync(join(decoy, 'devcontainer.json'), readFileSync(join(template, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(template, 'sandbox.json'), 'utf8'))
    office.secrets.hostFile = join(decoy, 'secrets.env')
    office.secrets.names = [...office.secrets.names, { name: 'DECOY_ONLY', readBy: ['opencode'] }]
    writeFileSync(office.secrets.hostFile, 'DECOY_ONLY=test-decoy\n', { mode: 0o600 })
    writeFileSync(join(decoy, 'sandbox.json'), JSON.stringify(office))
    for (const [name, more] of [[KEPT, ['--ro', originals]], [OTHER, []], [OLD, []]] as const) {
      const up = await sandbox(['up', template, '--name', name, '--from', main, ...more, '--json'])
      expect(up.status, up.err).toBe(0)
    }
    // MADE BEFORE THE HOST KEPT A COPY: only the folder's copy is there.
    anOldCopy = { ...JSON.parse(readFileSync(hostCopy(OLD), 'utf8')), templateDir: theLaunchersOwn, clones: [] }
    rmSync(hostCopy(OLD))
  }, 120_000)

  afterAll(async () => {
    for (const name of [KEPT, OTHER, OLD]) await sandbox(['down', name, '--from', main])
  })

  /**
   * The helper, started by hand as a command in the sandbox `name` starts it, with `env` over the tools' environment. It
   * starts on this machine, so its scratch sweep is given an empty /tmp of its own, and asks the office nothing.
   */
  function theHelperIn(name: string, args: string[], env: NodeJS.ProcessEnv): Promise<Ran> {
    return new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', join(sandboxes, name), '--as', STARTER, '--session', starterSession, '--workspace', WORKSPACE, '--api', api, ...args],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...env }, 'the-handshake'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
  }

  /** The ledger's rows that `before` did not hold. */
  async function theRowsSince(before: Set<string>): Promise<any[]> {
    return (await ledger()).filter((row) => !before.has(row.id))
  }

  // THE HANDSHAKE TAKES ONLY THE PID AND THE DETAIL FROM pid.json. The helper writes that file in the sandbox's folder,
  // which a run in the sandbox can write as well, and the host registers the row with its caller's key. So the host takes
  // the container from its own copy and the session from its own caller, and refuses a pid.json that names another,
  // naming the field. A run that rewrites the file is played by a helper whose pid.json says another: the host cannot
  // tell who wrote it. MUTATIONS, each alone in tools/sandbox.mjs: theRowForTheHelper registers the container pid.json
  // names, and the first case goes red; it registers the session pid.json names, and the second goes red.
  describe('the handshake takes only the pid from the sandbox', () => {
    const SAID = 'container: instance.container?.name ?? instance.container?.id, sessionRecordId: owner, detail }'

    /** Run `action` while KEPT's clone holds a helper whose pid.json says `instead` where the real one says SAID. */
    async function withAHelperWhosePidFileSays(instead: string, action: () => Promise<void>): Promise<void> {
      const tools = join(sandboxes, KEPT, 'repo', 'tools')
      const target = readlinkSync(tools)
      const current = readFileSync(join(REPO, 'tools', 'sandbox-start.mjs'), 'utf8')
      expect(current, "the helper no longer writes pid.json as this case changes it").toContain(SAID)
      unlinkSync(tools)
      mkdirSync(tools)
      for (const entry of readdirSync(join(REPO, 'tools'))) {
        if (entry !== 'sandbox-start.mjs') symlinkSync(join(REPO, 'tools', entry), join(tools, entry))
      }
      writeFileSync(join(tools, 'sandbox-start.mjs'), current.replace(SAID, `${instead}, detail }`))
      try {
        await action()
      } finally {
        rmSync(tools, { recursive: true })
        symlinkSync(target, tools)
      }
    }

    it('refuses a pid.json that names another container, naming the field, and registers nothing', async () => {
      const before = new Set((await ledger()).map((row) => row.id))
      const marker = join(sandboxes, KEPT, 'out', 'a-pid-file-naming-another-container')
      await withAHelperWhosePidFileSays(`container: ${JSON.stringify(containerOf(OTHER))}, sessionRecordId: owner`, async () => {
        const ran = await sandbox(['exec', KEPT, '--wait', '--plain-env', '--', 'sh', '-c', `touch ${marker}`])
        expect(ran.status, ran.err).not.toBe(0)
        expect(ran.err).toContain(`names the container "${containerOf(OTHER)}", not ${containerOf(KEPT)}`)
        expect(ran.err).toContain('no process was registered')
      })
      expect(await theRowsSince(before)).toEqual([])
      expect(existsSync(marker)).toBe(false)
    }, 60_000)

    it('refuses a pid.json that names another session, naming the field, and registers nothing', async () => {
      const filed = await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'another session, which a pid.json names', data: { state: 'running' } })
      expect(filed.status, JSON.stringify(filed.body)).toBe(201)
      const another = String(filed.body.record.id)
      const before = new Set((await ledger()).map((row) => row.id))
      const marker = join(sandboxes, KEPT, 'out', 'a-pid-file-naming-another-session')
      await withAHelperWhosePidFileSays(`container: instance.container?.name ?? instance.container?.id, sessionRecordId: ${JSON.stringify(another)}`, async () => {
        const ran = await sandbox(['exec', KEPT, '--wait', '--plain-env', '--', 'sh', '-c', `touch ${marker}`])
        expect(ran.status, ran.err).not.toBe(0)
        expect(ran.err).toContain(`names the sessionRecordId "${another}", not ${starterSession}`)
        expect(ran.err).toContain('no process was registered')
      })
      expect(await theRowsSince(before)).toEqual([])
      expect(existsSync(marker)).toBe(false)
    }, 60_000)
  })

  // A RUN REWRITES THE COPY IN ITS SANDBOX'S FOLDER: another sandbox's container, a template folder that declares one
  // more secret, another checkout and no read-only folder. Each case reads one thing the host does after that, so a
  // mutation shows each apart. MUTATION, alone in tools/sandbox-common.mjs: readHostInstance reads the copy in the
  // instance folder. The four cases of the launcher go red. The cases of the helper name their own mutations.
  describe("after a run rewrites the copy in the sandbox's folder", () => {
    let own = ''
    beforeAll(() => {
      own = readFileSync(hostCopy(KEPT), 'utf8')
      const facts = JSON.parse(readFileSync(folderCopy(KEPT), 'utf8'))
      expect(facts).toMatchObject({ container: { name: containerOf(KEPT) }, templateDir: template, from: main, readOnly: [originals] })
      const other = JSON.parse(readFileSync(hostCopy(OTHER), 'utf8'))
      writeFileSync(folderCopy(KEPT), JSON.stringify({
        ...facts,
        instance: OTHER,
        template: 'a-decoy-template',
        containerRow: other.containerRow,
        container: { ...facts.container, name: containerOf(OTHER) },
        templateDir: decoy,
        from: side,
        readOnly: [],
      }))
    })

    it("status names the sandbox's own container, checkout and read-only folders", async () => {
      const status = await sandbox(['status', KEPT, '--json'])
      expect(status.status, status.err).toBe(0)
      const [report] = JSON.parse(status.out).reports
      expect(report).toMatchObject({ container: { name: containerOf(KEPT), docker: 'running' }, from: main, readOnly: [originals] })
    }, 60_000)

    it("exec runs in the sandbox's own container and in no other", async () => {
      const before = state().calls.length
      const ran = await sandbox(['exec', KEPT, '--wait', '--plain-env', '--', 'true'])
      expect(ran.status, ran.err).toBe(0)
      const execs = state().calls.slice(before).filter((c) => c.tool === 'docker' && c.argv[0] === 'exec')
      expect(execs.length).toBeGreaterThan(0)
      for (const exec of execs) {
        expect(exec.argv).toContain(containerOf(KEPT))
        expect(exec.argv).not.toContain(containerOf(OTHER))
      }
    }, 60_000)

    // THE SECRETS ARE THE SANDBOX'S OWN TEMPLATE'S, which declares no DECOY_ONLY.
    it("exec gives only the secrets the sandbox's own template declares", async () => {
      const before = state().calls.length
      const secret = await sandbox(['exec', KEPT, '--wait', '--secret', 'DECOY_ONLY', '--', 'true'])
      expect(secret.status).not.toBe(0)
      expect(secret.err).toContain('--secret names undeclared secrets: DECOY_ONLY')
      expect(secret.out + secret.err).not.toContain('test-decoy')
      expect(state().calls.slice(before).filter((c) => c.tool === 'docker' && c.argv[0] === 'exec')).toEqual([])
    }, 60_000)

    // WHAT THE HELPER REGISTERS COMES FROM THE FACTS THE HOST GAVE IT, never from the copy in the sandbox's folder: the
    // process row's container, the run's sandbox field and the start line's container are the sandbox's own. MUTATION,
    // alone in tools/sandbox-start.mjs: the helper reads the copy in the sandbox's folder. Both cases go red: the first
    // names the other sandbox's container and the decoy template, and in the second the host refuses the pid.json.
    it("a run's command is registered in the sandbox's own container, and its run names the sandbox's own template and container row", async () => {
      const own = JSON.parse(readFileSync(hostCopy(KEPT), 'utf8'))
      const filed = await ask('POST', '/api/records', AS_STARTER(), { kind: 'session', title: 'a run in a sandbox whose folder copy was rewritten', data: { state: 'running' } })
      expect(filed.status, JSON.stringify(filed.body)).toBe(201)
      const run = String(filed.body.record.id)
      const ran = await sandbox(['exec', KEPT, '--run', run, '--json', '--', 'sleep', '300'])
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      groups.add(start.hostPgid)
      try {
        const row = (await ledger()).find((one) => one.id === start.processRow)
        expect(row?.detail).toContain(`inside container ${containerOf(KEPT)} `)
        expect(row?.detail).toContain(`sandbox ${KEPT}: `)
        expect((await ask('GET', `/api/records/${run}`, AS_STARTER())).body.record.data.sandbox).toEqual({ template: own.template, container: own.containerRow, folder: realpathSync(join(sandboxes, KEPT)) })
        expect(start.instance).toBe(KEPT)
        expect(start.container).toEqual({ name: containerOf(KEPT), id: own.container.id })
      } finally {
        expect((await releaseRow(start.processRow)).status).toBe(200)
        await until("the run's command to end", () => !alive(start.hostPid))
      }
    }, 60_000)

    it("an own command the launcher waits for is registered in the sandbox's own container", async () => {
      const before = new Set((await ledger()).map((row) => row.id))
      const ran = await sandbox(['exec', KEPT, '--wait', '--plain-env', '--', 'true'])
      expect(ran.status, ran.err).toBe(0)
      const rows = (await theRowsSince(before)).filter((row) => row.type === 'process')
      expect(rows).toHaveLength(1)
      expect(rows[0].detail).toContain(`inside container ${containerOf(KEPT)} `)
    }, 60_000)

    // THE COMMAND HOLDS THE FACTS EXACTLY AS THE HELPER WAS GIVEN THEM, under the same name, so a helper it starts from
    // inside is given the same; a build or a suite holds none. MUTATION, alone in tools/sandbox-start.mjs: the command's
    // environment leaves them out, and this goes red.
    it('the command holds the facts the helper was given, under the same name, and a build holds none', async () => {
      const seen = join(sandboxes, KEPT, 'out', 'the-facts-the-command-holds')
      const plain = join(sandboxes, KEPT, 'out', 'the-facts-a-build-holds')
      const write = (file: string): string => `printf '%s' "\${${THE_FACTS_VARIABLE}-none}" > ${file}`
      const ran = await sandbox(['exec', KEPT, '--wait', '--', 'sh', '-c', write(seen)])
      expect(ran.status, ran.err).toBe(0)
      expect(readFileSync(seen, 'utf8')).toBe(theFactsACommandIn(join(sandboxes, KEPT))[THE_FACTS_VARIABLE])
      const build = await sandbox(['exec', KEPT, '--wait', '--plain-env', '--', 'sh', '-c', write(plain)])
      expect(build.status, build.err).toBe(0)
      expect(readFileSync(plain, 'utf8')).toBe('none')
    }, 60_000)

    // A START GIVEN NO FACTS IS REFUSED, and the copy in the sandbox's folder is never taken in their place. MUTATION,
    // alone in tools/sandbox-start.mjs: the helper reads the copy in the sandbox's folder when it was given no facts, and
    // this goes red.
    it('a start given no facts is refused, naming them, and nothing is registered or run', async () => {
      const before = new Set((await ledger()).map((row) => row.id))
      const marker = join(sandboxes, KEPT, 'out', 'a-start-given-no-facts')
      const ran = await theHelperIn(KEPT, ['--wait', '--', 'sh', '-c', `touch ${marker}`], {})
      expect(ran.status, ran.err).not.toBe(0)
      expect(ran.err).toContain(`This start was given no ${THE_FACTS_VARIABLE}`)
      expect(existsSync(marker)).toBe(false)
      expect(await theRowsSince(before)).toEqual([])
    }, 60_000)

    // A START FROM INSIDE WHOSE FACTS THE RUN ALTERED. A command in the sandbox holds the facts, and can change them before
    // it starts the helper itself. What that helper registers goes to the ledger, which takes a container from a program
    // in a container only when it is that program's own, and the host acts on none of it. The office sees every sender as
    // a program in KEPT's container. In the stand-in machine the other sandbox's container has a pid namespace of its own,
    // with a process for every pid here, so a ledger that took the container named would find one. MUTATION, alone in
    // src/server/lib/resources.ts: the named container's namespace not compared with the sender's. The altered start is
    // registered in the other sandbox's container and its command runs, and this goes red.
    it('a start from inside whose facts the run altered is refused by the ledger, and nothing of it is registered', async () => {
      const given = JSON.parse(theFactsACommandIn(join(sandboxes, KEPT))[THE_FACTS_VARIABLE]!)
      const other = JSON.parse(readFileSync(hostCopy(OTHER), 'utf8'))
      const was = res.osProbe()
      res.useOsProbe(aMachineWhereEverySenderIsInside(was, containerOf(OTHER)))
      try {
        // AS GIVEN, the start is registered in the sandbox's own container and its command runs.
        const asGiven = join(sandboxes, KEPT, 'out', 'a-start-from-inside-as-given')
        const ok = await theHelperIn(KEPT, ['--wait', '--', 'sh', '-c', `touch ${asGiven}`], { [THE_FACTS_VARIABLE]: JSON.stringify(given) })
        expect(ok.status, ok.err).toBe(0)
        expect(existsSync(asGiven)).toBe(true)

        // ALTERED to name the other sandbox's container, it is refused, and nothing of it is registered or run.
        const before = new Set((await ledger()).map((row) => row.id))
        const altered = join(sandboxes, KEPT, 'out', 'a-start-from-inside-altered')
        const refused = await theHelperIn(KEPT, ['--wait', '--', 'sh', '-c', `touch ${altered}`], { [THE_FACTS_VARIABLE]: JSON.stringify({ ...given, container: other.container }) })
        expect(refused.status, refused.err).not.toBe(0)
        expect(refused.err).toContain(`The ledger refused to register pid`)
        expect(refused.err).toContain('A program in a container may name only its own container')
        expect(existsSync(altered)).toBe(false)
        expect(await theRowsSince(before)).toEqual([])
      } finally {
        res.useOsProbe(was)
      }
    }, 60_000)

    it("down stops the sandbox's own container and no other, and leaves the host's copy as it was", async () => {
      const before = state().calls.length
      const down = await sandbox(['down', KEPT, '--json'])
      expect(down.status, down.err).toBe(0)
      expect(state().calls.slice(before).filter((c) => c.tool === 'ledger-stop').map((c) => c.argv[0])).toEqual([containerOf(KEPT)])
      expect(state().containers[containerOf(OTHER)]?.State.Running).toBe(true)
      expect(readFileSync(hostCopy(KEPT), 'utf8')).toBe(own)
    }, 60_000)
  })

  // EACH CASE STARTS WITH NO HOST COPY, as a sandbox made before the host kept one, so no case leans on another's.
  // THE TEMPLATE ROW READS NO TEMPLATE FOLDER BUT THE LAUNCHER'S OWN: the copy keeps the template mole-office-dev, and
  // before status the case makes OLD's container row in the test's own office name a made-up other template, then puts
  // the detail back in a finally, so the adopting case below sees the row as it was.
  // MUTATION, alone in tools/sandbox.mjs: whyTheFolderCopyIsNotTaken answers null at once, so every copy is adopted.
  // All nine cases go red at status, which takes the copy and says nothing.
  it.each([
    { field: 'container.name', bad: () => ({ container: { ...anOldCopy['container'], name: containerOf(OTHER) } }) },
    { field: 'dir', bad: () => ({ dir: join(sandboxes, OTHER) }) },
    { field: 'templateDir', bad: () => ({ templateDir: template }) },
    {
      // THE COPY KEEPS THE LAUNCHER'S OWN TEMPLATE: what the host cannot agree with is the container's ledger row, which
      // this case changes before status and puts back after.
      field: 'template',
      bad: () => ({ template: anOldCopy['template'], templateDir: anOldCopy['templateDir'], clones: anOldCopy['clones'] }),
    },
    { field: 'from', bad: () => ({ from: side }) },
    { field: 'clones', bad: () => ({ clones: [{ name: 'side-repo', from: main, ref: 'main' }] }) },
    { field: 'api', bad: () => ({ api: 'http://127.0.0.1:9' }) },
    { field: 'containerRow', bad: () => ({ containerRow: JSON.parse(readFileSync(hostCopy(OTHER), 'utf8')).containerRow }) },
    { field: 'readOnly', bad: () => ({ readOnly: [originals] }) },
  ])('refuses an old sandbox whose only copy has a $field the host cannot check, and names it', async ({ field, bad }) => {
    rmSync(hostCopy(OLD), { force: true })
    writeFileSync(folderCopy(OLD), JSON.stringify({ ...anOldCopy, ...bad() }))
    const before = state().calls.length
    // THE TEST'S OFFICE KEEPS THE CONTAINER ROW IN session_resources, and none of its doors changes a row's detail, so
    // this case writes the office's own database, as this file already does elsewhere for its office, and puts the
    // detail back below.
    let theDetailAsItWas: string | undefined
    try {
      if (field === 'template') {
        const row = t.client.sqlite.prepare('SELECT detail FROM session_resources WHERE id = ?').get(anOldCopy['containerRow']) as { detail: string }
        theDetailAsItWas = row.detail
        const disagrees = theDetailAsItWas.replace(`from the template ${anOldCopy['template']};`, 'from the template made-up-other-template;')
        expect(disagrees, 'the container row does not name the template the copy holds').not.toBe(theDetailAsItWas)
        expect(t.client.sqlite.prepare('UPDATE session_resources SET detail = ? WHERE id = ?').run(disagrees, anOldCopy['containerRow']).changes).toBe(1)
      }
      const words = field === 'template' ? `its template is ${anOldCopy['template']}, and the container's ledger row` : `its ${field} `
      const status = await sandbox(['status', OLD, '--json', '--from', main])
      expect(status.status, status.err).toBe(1)
      const [report] = JSON.parse(status.out).reports
      expect(report.says).toContain(`The sandbox ${OLD} has no host copy of its facts, and the copy in its folder, ${folderCopy(OLD)}, was not taken: `)
      expect(report.says).toContain(words)
      for (const verb of [['exec', OLD, '--wait', '--plain-env', '--from', main, '--', 'true'], ['down', OLD, '--from', main]]) {
        const ran = await sandbox(verb)
        expect(ran.status, ran.err).not.toBe(0)
        expect(ran.err).toContain(words)
      }
      expect(state().calls.slice(before).filter((c) => c.tool === 'ledger-stop' || (c.tool === 'docker' && ['exec', 'stop', 'rm'].includes(c.argv[0]!)))).toEqual([])
      expect(state().containers[containerOf(OLD)]?.State.Running).toBe(true)
      expect(existsSync(hostCopy(OLD))).toBe(false)
    } finally {
      if (theDetailAsItWas !== undefined) {
        t.client.sqlite.prepare('UPDATE session_resources SET detail = ? WHERE id = ?').run(theDetailAsItWas, anOldCopy['containerRow'])
        expect(t.client.sqlite.prepare('SELECT detail FROM session_resources WHERE id = ?').get(anOldCopy['containerRow'])).toEqual({ detail: theDetailAsItWas })
      }
    }
  }, 60_000)

  it('adopts an old sandbox whose only copy agrees with what the host holds, and reads the folder copy no more', async () => {
    rmSync(hostCopy(OLD), { force: true })
    writeFileSync(folderCopy(OLD), JSON.stringify(anOldCopy))
    const status = await sandbox(['status', OLD, '--json', '--from', main])
    expect(status.status, status.err).toBe(0)
    expect(status.err).toContain(`the sandbox ${OLD} had no host copy of its facts; the copy in its folder agreed with what the host holds, and is now the host's copy, ${hostCopy(OLD)}.`)
    expect(JSON.parse(status.out).reports[0]).toMatchObject({ container: { name: containerOf(OLD), docker: 'running' }, from: main, readOnly: [] })
    expect(JSON.parse(readFileSync(hostCopy(OLD), 'utf8'))).toEqual(anOldCopy)
    expect(statSync(dirname(hostCopy(OLD))).mode & 0o777).toBe(0o700)

    writeFileSync(folderCopy(OLD), JSON.stringify({ ...anOldCopy, from: side }))
    const again = await sandbox(['status', OLD, '--json'])
    expect(again.status, again.err).toBe(0)
    expect(again.err).not.toContain('had no host copy')
    expect(JSON.parse(again.out).reports[0]).toMatchObject({ container: { name: containerOf(OLD) }, from: main })
  }, 60_000)
})

// A SUPERVISOR THAT IS NOT THE SECRETARY, STARTING ITS WORKER FROM INSIDE A SANDBOX (decision gWvjrnjgOuH8). This
// file's starter is the office's secretary, because a run the host files names its sandbox only on the secretary's own
// key (a host filing). The secretary may change any run, so no case above shows that an agent that is not the secretary
// answers for a run it filed. This block does, as a line's supervisor starts its workers: the secretary starts the
// supervisor's run in a sandbox, the supervisor's helper in there files its worker's run in the same sandbox with the
// supervisor's own key, and the supervisor changes that run and is told how it ended. Filed from a run of the
// supervisor's in no sandbox, the same run is refused. MUTATIONS, one at a time after a control run, in
// src/server/lib/records.ts: the host filing's refusal skipped, and the refusal goes red; a run filed inside a sandbox
// refused unless the secretary files it, and the filing goes red; the run's starter and its filer taken out of the
// agents that answer for a run, and the supervisor's change goes red.
describe('a supervisor that is not the secretary starts its worker from inside a sandbox', () => {
  const SUPERVISOR = 'sandbox-line-supervisor'
  const ITS_WORKER = 'sandbox-line-worker'
  const SANDBOX = 'line'

  /** The helper as an agent in the sandbox runs it: as the supervisor, with the supervisor's own key, filing a run of its worker. */
  function theSupervisorsHelper(folder: string, session: string, key: string, rest: string[]): Promise<Ran> {
    return new Promise<Ran>((done) => {
      const child = spawn(
        process.execPath,
        [
          join(REPO, 'tools', 'sandbox-start.mjs'), '--instance', folder, '--as', SUPERVISOR, '--session', session,
          '--workspace', WORKSPACE, '--api', api, '--agent', ITS_WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
          ...rest,
        ],
        { env: withAFakeContainersTmp({ ...theToolsEnvironment(), ...theFactsACommandIn(folder), MOLE_AGENT_KEY: key, MOLE_OFFICE_API: api }, 'the-supervisors-worker'), detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
  }

  it("files the worker's run in the supervisor's sandbox on the supervisor's own key, takes its change and tells it the end, and refuses the run filed from a run in no sandbox", async () => {
    const up = await sandbox(['up', template, '--name', SANDBOX, '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const answer = JSON.parse(up.out.trim()) as { container: string; resource: string; folder: string }

    // THE SUPERVISOR, registered by the secretary as a line's supervisor is, so the secretary may file its run; and its
    // worker, registered by the supervisor on its own key.
    const made = await ask('POST', '/api/agents/started', { type: 'agent', id: STARTER, key: theKeyOf.get(STARTER)! }, { handle: SUPERVISOR, name: SUPERVISOR, role: 'supervisor' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const supervisorId = String(made.body.agent.id)
    const key = String(made.body.whatToGiveIt.key)
    const itsWorker = await ask('POST', '/api/agents/started', { type: 'agent', id: SUPERVISOR, key }, { handle: ITS_WORKER, name: ITS_WORKER, role: 'worker', workArea: ['src'] })
    expect(itsWorker.status, JSON.stringify(itsWorker.body)).toBe(201)

    // THE SECRETARY STARTS THE SUPERVISOR'S RUN IN THE SANDBOX, so the launcher writes the run's sandbox field.
    const supervisorGo = join(scratch, 'line-supervisor.go')
    const ran = await sandbox([
      'exec', SANDBOX, '--agent', SUPERVISOR, '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash', '--json',
      '--', 'sh', '-c', `while [ ! -e '${supervisorGo}' ]; do sleep 0.1; done`,
    ])
    expect(ran.status, ran.err).toBe(0)
    const supervisorsRun = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number }
    groups.add(supervisorsRun.hostPgid)
    const itsSandbox = (await ask('GET', `/api/records/${supervisorsRun.run}`, AS_STARTER())).body.record.data.sandbox
    expect(itsSandbox?.folder, "the launcher wrote no sandbox on the supervisor's run").toBe(answer.folder)

    // FROM INSIDE THE SANDBOX, on the supervisor's own key and from its run there: the worker's run is filed in it.
    const dir = join(scratch, 'line-worker')
    const go = join(scratch, 'line-worker.go')
    git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', 'line-worker', dir, 'main')
    const helper = await theSupervisorsHelper(answer.folder, supervisorsRun.run, key, [
      '--worktree', dir, '--cut-from', 'main', '--', 'sh', '-c', `while [ ! -e '${go}' ]; do sleep 0.1; done`,
    ])
    expect(helper.status, helper.err).toBe(0)
    const start = JSON.parse(helper.out.trim().split('\n')[0] ?? '{}') as { run: string; hostPgid: number }
    groups.add(start.hostPgid)
    const filed = (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record
    expect(filed.data.sandbox, "the worker's run is not in its supervisor's sandbox").toEqual(itsSandbox)

    // THE SUPERVISOR ANSWERS FOR THE RUN: it started the run's agent and filed the run, and its key proves it, though it
    // is not the secretary. It changes what the run says it is doing, which is the run's data.
    const doing = "what the worker's supervisor says it is doing"
    const changed = await ask('PATCH', `/api/records/${start.run}`, { type: 'agent', id: SUPERVISOR, session: supervisorsRun.run, key }, { dataPatch: { doing } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.doing).toBe(doing)

    // THE SUPERVISOR IS TOLD HOW IT ENDED: the command exits 0 with nothing committed and no report.
    writeFileSync(go, '')
    await until("the worker's run to be written orphaned", async () => (await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.state === 'orphaned')
    await until("the account of the worker's round", async () => theRoundAccountIsComplete((await ask('GET', `/api/records/${start.run}`, AS_STARTER())).body.record.data.howTheRoundEnded))
    const messages = ((await ask('GET', '/api/records?kind=message&shape=full', AS_STARTER())).body.records ?? []) as { data: Record<string, any> }[]
    const told = messages.filter((one) => one.data['aboutRun'] === start.run)
    expect(told, 'the supervisor was not told once').toHaveLength(1)
    expect(told[0]!.data['to']).toEqual([{ kind: 'agent', id: supervisorId }])

    // FROM A RUN OF THE SUPERVISOR'S IN NO SANDBOX, the same filing is a host filing, which only the secretary makes.
    const onTheHost = await ask('POST', '/api/records', { type: 'agent', id: SUPERVISOR, key }, { kind: 'session', title: "the supervisor's run on the host", data: { state: 'running', servingAgent: SUPERVISOR } })
    expect(onTheHost.status, JSON.stringify(onTheHost.body)).toBe(201)
    const before = await theSessionIds()
    const refused = await theSupervisorsHelper(answer.folder, String(onTheHost.body.record.id), key, ['--', 'true'])
    expect(refused.status, refused.err).not.toBe(0)
    // The helper prints the office's answer as JSON, so the quotes around the handle are escaped.
    expect(refused.err, refused.err).toContain('(403)')
    expect(refused.err, refused.err).toContain(JSON.stringify(`"${SUPERVISOR}" is not the secretary of this office.`).slice(1, -1))
    expect(await theSessionIds(), 'a run was filed').toEqual(before)

    writeFileSync(supervisorGo, '')
    const down = await sandbox(['down', SANDBOX, '--json'])
    expect(down.status, down.err).toBe(0)
  }, 120_000)
})

// PROBLEM D2xgnX8nFixv, 27 SEPTEMBER 2026, AS IT HAPPENED: the owner closed the key window at 11:11:39, and the next
// check in the inspector's sandbox could not have started a command, because the helper filed each command's row with
// no key. The inspector now hands the office's own key to the launchers it starts on the host, as MOLE_AGENT_KEY, and the
// launcher writes the row with it. LAST IN THIS FILE ON PURPOSE: a closed window stays closed, and the cases above
// make keyless calls of their own beside the keyed ones. MUTATION PROOF (the report of the run that added this case):
// --handshake passed only for --wait --plain-env again, in tools/sandbox.mjs, and the keyed command goes red on its
// exit, the helper's keyless row refused.
describe('after the key window is closed (problem D2xgnX8nFixv)', () => {
  it("starts the caller's own command with the row written on the host with the key it holds, which never goes into the container, and stops the sandbox with it", async () => {
    // A SANDBOX OF THIS CASE'S OWN, started while the window is still open: the cases above have stopped theirs.
    const up = await sandbox(['up', template, '--name', 'closed', '--from', main, '--dsh', dsh, '--json'])
    expect(up.status, up.err).toBe(0)
    const answer = JSON.parse(up.out.trim()) as { container: string; resource: string; folder: string }

    // THE WINDOW IS CLOSED ON THE INSTALLATION ROW, as the person's press closes it. The press also waits until no live agent is
    // left without a proved key, which this file does not arrange; this case is about the launcher after the close, and
    // tests/after-the-close-a-claim-with-no-key-is-nobody.test.ts is about the press.
    t.client.sqlite
      .prepare("UPDATE installation SET window_closed_at = '2026-09-27 11:11:39', window_closed_by_kind = 'person', window_closed_by_id = ? WHERE only_row = 1")
      .run(THE_PERSON)
    ;(await import('../src/server/lib/keywindow.ts')).forgetTheKeyWindowThisProcessRead()

    // WITH NO KEY, NOTHING STARTS: the row the host asks for is refused, so the window really is closed here. The starter's
    // own key, which `sandbox` gives the tool, is taken off again for this call.
    const keyless = await sandbox(['exec', 'closed', '--json', '--no-office-variables', '--', 'true'], undefined, { MOLE_AGENT_KEY: undefined })
    expect(keyless.status, keyless.out).not.toBe(0)
    expect(keyless.err).toContain('carried no key')

    // WITH THE OFFICE'S KEY IN THE LAUNCHER'S ENVIRONMENT, as the inspector now starts it, the command runs.
    const key = theOfficesKeyHeader()['x-mole-office-key'] as string
    const seen = join(answer.folder, 'out', 'after-the-close.txt')
    const ran = await sandbox(['exec', 'closed', '--json', '--no-office-variables', '--', 'sh', '-c', `env > ${seen}.part; mv ${seen}.part ${seen}`], undefined, { MOLE_AGENT_KEY: key })
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim()) as { processRow: string; hostPgid: number }
    groups.add(start.hostPgid)
    await until('the command to write its environment', () => existsSync(seen))
    const row = (await ledger()).find((one) => one.id === start.processRow)
    expect(row, 'the ledger holds no row for the command').toBeDefined()
    // THE KEY STAYED ON THE HOST: not its name, and not its value under any name. Compared here, never printed.
    const env = readFileSync(seen, 'utf8')
    expect(env.split('\n').some((line) => line.startsWith('MOLE_AGENT_KEY=')), 'MOLE_AGENT_KEY reached the command in the container').toBe(false)
    expect(env.includes(key), "the office's key reached the command in the container under another name").toBe(false)

    // AND THE SANDBOX STOPS WITH THE SAME KEY, as the inspector's check leaves it: its row is released, not left held.
    const down = await sandbox(['down', 'closed', '--json'], undefined, { MOLE_AGENT_KEY: key })
    expect(down.status, down.err).toBe(0)
    const container = (await ledger()).find((one) => one.id === answer.resource)
    expect(container?.releasedAt, "the container's row is still held").toEqual(expect.any(String))
  }, 90_000)

  // A RUN'S SCRATCH FOLDER IS DECIDED BY THE STATE ITS END ALREADY KNOWS (21 October 2026). After the close, the helper in
  // a container holds the run's own key and no key of its starter: the host keeps that one. The helper ended its run with
  // the run's key, and then read the run once more as its starter to decide the scratch folder. That read carried no key,
  // the office refused it (403), and the folder of every finished worker-door run was kept: two of wave 13q's on 21 October.
  // Now the clean-up takes the state the end wrote or read, and reads nothing again. A run that did not finish still keeps
  // its folder, as before.
  it("removes a finished run's scratch folder though its helper holds no key of its starter, and keeps a crashed run's until the next start's sweep", async () => {
    const key = theOfficesKeyHeader()['x-mole-office-key'] as string
    const call = async (method: string, path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; body: any }> => {
      const r = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, ...headers }, body: JSON.stringify(body) })
      return { status: r.status, body: await r.json().catch(() => null) }
    }
    // A STARTER WITH A KEY OF ITS OWN, registered by the person, and its worker, registered by it: the host files the
    // worker's run with the starter's key, so the office mints the run its key, and the starter's key stays on the host.
    const register = async (handle: string, by: Record<string, string>, role?: string): Promise<string> => {
      const made = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      return String(made.body.whatToGiveIt?.key)
    }
    const starterKey = await register('scratch-starter', { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }, 'secretary')
    const asTheStarter = (session?: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'scratch-starter', 'x-mole-office-key': starterKey, ...(session === undefined ? {} : { 'x-mole-office-session': session }) })
    const workerKey = await register('scratch-worker', asTheStarter())
    const own = await call('POST', '/api/records', asTheStarter(), { kind: 'session', title: "the starter's own run", data: { state: 'running', servingAgent: 'scratch-starter' } })
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    const THE_STARTER = { agent: 'scratch-starter', session: own.body.record.id as string }
    const up = await sandbox(['up', template, '--name', 'closed-scratch', '--from', main, '--dsh', dsh, '--json'], undefined, { MOLE_AGENT_KEY: key })
    expect(up.status, up.err).toBe(0)
    const answer = JSON.parse(up.out.trim()) as { container: string; resource: string; folder: string }
    /** A run of the worker's that leaves a file in its scratch folder, waits for its go file, then does `after`. */
    const aHeldRun = async (name: string, after: string): Promise<{ run: string; go: string; folder: string; log: string }> => {
      const dir = join(scratch, name)
      const go = join(scratch, `${name}.go`)
      git(join(answer.folder, 'repo'), 'worktree', 'add', '-b', name, dir, 'main')
      const ran = await sandbox([
        'exec', 'closed-scratch', '--agent', 'scratch-worker', '--runtime', 'dsh', '--model', 'deepseek/deepseek-v4.1-flash',
        '--worktree', dir, '--cut-from', 'main', '--json',
        '--', 'sh', '-c', `echo synthetic > "$TMPDIR/left.txt"\nwhile [ ! -e '${go}' ]; do sleep 0.1; done\n${after}`,
      ], THE_STARTER, { MOLE_AGENT_KEY: starterKey, MOLE_OFFICE_API: api })
      expect(ran.status, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim()) as { run: string; hostPgid: number; scratch: string }
      groups.add(start.hostPgid)
      return { run: start.run, go, folder: start.scratch, log: join(answer.folder, 'logs', start.run, 'finish.log') }
    }
    const theFolderLine = async (held: { folder: string; log: string }): Promise<string> => {
      const lines = (): string[] => (existsSync(held.log) ? readFileSync(held.log, 'utf8').split('\n') : []).filter((line) => line.includes(`scratch folder ${held.folder} `))
      await until("the helper to write the scratch folder's line", () => lines().length > 0)
      expect(lines()).toHaveLength(1)
      return lines()[0]!
    }

    // FINISHED: a report is linked, the command exits 0 with no commit, and the helper finishes the run as records.
    const finished = await aHeldRun('scratch-closed-finished', 'true')
    await until('the command to write its file', () => existsSync(join(finished.folder, 'left.txt')))
    const report = await call('POST', '/api/records', asTheStarter(THE_STARTER.session), { kind: 'report', title: aFreshReportTitle(), data: { for: 'its starter', date: '2026-10-21', chaptersRead: EVERY_CHAPTER, blocks: [{ id: 'b-1', type: 'text', text: 'A synthetic report. The audit table is left for the merge queue.' }] } })
    expect(report.status, JSON.stringify(report.body)).toBe(201)
    await aLabelFor(report.body.record.id, WORKSPACE)
    const doing = await call('PATCH', `/api/records/${finished.run}`, { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'scratch-worker', 'x-mole-office-key': workerKey, 'x-mole-office-session': finished.run }, { dataPatch: { doing: 'A made-up round that leaves a file and ends.' } })
    expect(doing.status, JSON.stringify(doing.body)).toBe(200)
    const linked = await call('POST', '/api/links', asTheStarter(THE_STARTER.session), { fromId: report.body.record.id, toId: finished.run, type: 'about' })
    expect(linked.status, JSON.stringify(linked.body)).toBe(201)
    // THE RUN SAYS IT SEALS, as a round's last message to its starter does: the helper finishes a clean exit as records only
    // on that word (tools/a-run-says-it-seals.mjs; WzlhElg3MepN). The worker says it with its own key.
    const word = await call('POST', '/api/records', { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'scratch-worker', 'x-mole-office-key': workerKey }, { kind: 'message', title: 'The run ends', data: { to: [{ kind: 'agent', id: 'scratch-starter' }], body: 'I seal next.' } })
    // NOTHING HOLDS THE STARTER IN THE TEST OFFICE, so the office stores the word, routes it and answers 409. The word is
    // stored all the same, and the helper reads it.
    expect(word.status, JSON.stringify(word.body)).toBe(409)
    writeFileSync(finished.go, '')
    const gone = await theFolderLine(finished)
    expect(gone, 'the finished run kept its scratch folder').toContain('is removed')
    // THE REFUSAL THIS CASE GUARDS AGAINST, BY ITS OWN WORDS: the starter's read refused ("record could not be read"). A removal
    // line may also say that some processes could not be read by this helper's user; the folder still went, so that line is
    // not this fault (seen in a whole-suite run on 22 October 2026, when the helper still read every process on this machine).
    expect(gone).not.toContain('record could not be read')
    expect(existsSync(finished.folder)).toBe(false)
    expect(readFileSync(finished.log, 'utf8')).toContain('finished with a records submission')

    // CRASHED: the command exits 3, the run is written crashed, and its folder is kept for whoever looks, as before.
    const crashed = await aHeldRun('scratch-closed-crashed', 'exit 3')
    await until('the command to write its file', () => existsSync(join(crashed.folder, 'left.txt')))
    writeFileSync(crashed.go, '')
    const kept = await theFolderLine(crashed)
    expect(kept).toContain('is kept')
    expect(kept).toContain('"crashed"')
    expect(readFileSync(join(crashed.folder, 'left.txt'), 'utf8')).toBe('synthetic\n')

    // AND THE NEXT START'S SWEEP TAKES IT once the crashed run's record is old, asking with the new run's own key: the
    // starter's key is not in the container, and a keyless read as the starter is refused after the close, so the sweep
    // kept every folder. The run the agent ended itself is the common case it leaves to the sweep. THIS PART FAILED FOR THE
    // CAUSE WRITTEN ABOVE THE TWO SWEEP CASES of the scratch-folder block, until round AC of wave 13n: a process on this
    // machine that the sweep could not read made it keep the folder. In the box's suite it was red alone from round AA on,
    // when that process was one that had ended and was not yet reaped. The sweep now sees only the fake container's processes.
    theCrashIsOld(crashed.run)
    // THE SWEEP GOES AFTER THE NEXT COMMAND'S GO, beside it, and pauses between its asks, so it is waited for here. The
    // next run is held until then: its finish revokes the key the sweep asks with.
    const next = await aHeldRun('scratch-closed-next', 'true')
    await until("the next start's sweep to take the old crashed run's folder", () => theLogHolds(crashed.log, 'is removed. Rule:'), 90_000, () => whatTheLogSays(crashed.log))
    expect(existsSync(crashed.folder), `the old crashed run's folder is still there\n${whatTheLogSays(crashed.log)}`).toBe(false)
    expect(readFileSync(crashed.log, 'utf8')).toContain('is removed. Rule:')
    writeFileSync(next.go, '')
    await theFolderLine(next)

    const down = await sandbox(['down', 'closed-scratch', '--json'], undefined, { MOLE_AGENT_KEY: key })
    expect(down.status, down.err).toBe(0)
  }, 210_000)
})

// A HELPER THIS FILE STARTS BY HAND USED TO SWEEP THIS MACHINE'S REAL /tmp, because it was given neither the private /tmp
// nor the TMPDIR a fake container gives one, and it made its run's scratch folder in this session's temporary folder.
// This case reads every finish.log the file's sandboxes left and fails on a line naming a folder directly under the real
// /tmp, or on a run's scratch folder outside the test's own scratch folder. Paths are compared as written and through
// their real paths, because the scratch folder may be reached through a link.
it('names no folder under the real /tmp in a finish.log, and no scratch folder outside the test scratch', () => {
  const logs = existsSync(sandboxes)
    ? readdirSync(sandboxes, { recursive: true }).map(String).filter((one) => basename(one) === 'finish.log').sort().map((one) => join(sandboxes, one))
    : []
  const theRealScratch = realpathSync(scratch)
  const within = (root: string, path: string): boolean => {
    const way = relative(root, path)
    return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way))
  }
  // A FOLDER THE LOG NAMES MAY BE GONE, a finished run's own among them: the closest part still there is made real.
  const itsRealPath = (path: string): string => {
    const missing: string[] = []
    let here = path
    while (!existsSync(here)) {
      const up = dirname(here)
      if (up === here) return path
      missing.unshift(basename(here))
      here = up
    }
    return join(realpathSync(here), ...missing)
  }
  const insideTheScratch = (path: string): boolean =>
    within(scratch, path) || within(theRealScratch, itsRealPath(path))
  // A PATH DIRECTLY UNDER THE REAL /tmp: /tmp/<one name>, never a deeper path that only starts there.
  const underTheRealTmp = (line: string): string | null => {
    for (const match of line.matchAll(/(?:^|[\s("'=:,\[])\/tmp\/([^\s/()\[\]]+)/g)) {
      if (line[(match.index ?? 0) + match[0].length] === '/') continue
      const name = match[1]!.replace(/[,.;:!?"']+$/, '')
      if (name !== '') return `/tmp/${name}`
    }
    return null
  }
  const aScratchFolderOutside = (line: string): string | null => {
    for (const match of line.matchAll(/scratch folder (\S+)/g)) {
      const path = match[1]!.replace(/[,.;:]+$/, '')
      if (path.startsWith('/') && !insideTheScratch(path)) return path
    }
    return null
  }
  const faults: string[] = []
  for (const file of logs) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const lineNumber = String(index + 1)
      const under = underTheRealTmp(line)
      if (under !== null) faults.push(`${file}:${lineNumber} names ${under} directly under the real /tmp: ${line.trim()}`)
      const outside = aScratchFolderOutside(line)
      if (outside !== null) faults.push(`${file}:${lineNumber} names the scratch folder ${outside}, outside ${scratch}: ${line.trim()}`)
    })
  }
  expect(faults, 'a finish.log names a folder under the real /tmp, or a run scratch folder outside the test scratch').toEqual([])
})
