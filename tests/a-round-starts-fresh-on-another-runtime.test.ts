// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND THAT CANNOT CONTINUE A CONVERSATION ON ITS RUNTIME STARTS A NEW ONE (13q round 54, NEW A of round 53's
 * handoff). Without --continues, `round` takes the agent's last run on its runtime. With --continues, which the
 * next-round door always passes (RoundAdapter.commandFor in src/worker/runtimes/round.ts), it takes the run named. It
 * starts a new conversation when there is no such run, when the run named ran on another runtime, when the run's
 * worktree is gone, or when the worktree holds no A_ROUNDS_RULES (src/shared/round-chapters/delivery.ts), the file the
 * round reads its chapters from.
 * When only the runtime of the run named differs, the new conversation works in that run's worktree and takes its title
 * and cut. Otherwise it works in the worktree of the agent's newest started run, on any runtime, whose worktree is there
 * and holds that file, and takes that run's title and cut. With no such run, the round is refused and nothing is filed.
 *
 * A NEW CONVERSATION IS LINKED TO THE RUN --continues NAMES, AND TO NO RUN WITHOUT --continues (round 54's refusal, item
 * 1). The office refuses a run that a next-round launcher files unless it is derived from the run whose next round it is
 * (theNextRoundThisRunStarts in src/server/lib/next-round.ts). A run's usage receipt subtracts the totals of the run it
 * is linked to only when its command resumes a conversation (theRunItContinues in tools/sandbox-start.mjs), so a linked
 * new conversation keeps its own totals.
 *
 * A FRESH REPAIR CONTINUES NOTHING (round 54's refusal, item 2). The door gives it a new worktree and its cut with
 * --worktree and --cut-from, and the run it follows with --continues. It starts a new conversation, so it says it
 * continues no run and follows that run, and it is linked to that run, as the door's check needs. When that run ran on
 * another runtime, the start sentence says the round works in its new worktree.
 *
 * The first part calls the launcher's own functions, compiled by name, with the host's list and the office made up. The
 * second part starts rounds in a made-up sandbox, with stand-in Codex and Claude Code programs that call no model.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { runInNewContext } from 'node:vm'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, startsOf, theFakeMachine, theFakeState } from './sandbox-stand-ins.ts'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { RoundAdapter } from '../src/worker/runtimes/round.ts'
import { A_ROUNDS_RULES } from '../src/shared/round-chapters/delivery.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'fresh-round-starter'
const AGENT = 'fresh-round-worker'
/** A second worker of the same starter, whose line the next-round door starts on a runtime it never used. */
const DOOR_AGENT = 'fresh-round-door-worker'
const NAME = 'fresh-rounds'
const CODEX_MODEL = 'openai/the-codex-model'
const CLAUDE_MODEL = 'anthropic/claude-opus-5-5'
/** The file a round reads its chapters from, as the delivery reads it, so the two cannot drift. */
const RULES = A_ROUNDS_RULES
const TITLE = 'The line of the made-up worker'
const DOOR_TITLE = 'The line the made-up door follows'

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let secrets = ''
let dir = ''
let starterSession = ''

/** Every process group a case started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

/** The first line of every stand-in program: it writes down its pid and its parent's, so afterAll finds both. */
const RECORDS_ITS_PARENT = String.raw`require('fs').appendFileSync(require('path').join(__dirname, '..', 'parents'), process.pid + ' ' + process.ppid + '\n')`
const ENDS_AT_ONCE = 'ends-at-once'

/** What the stand-in `claude` reports, as `claude -p --output-format json` does at its end, for a receipt to be read from. */
const CLAUDE_COST = 0.25

/**
 * A `claude` that runs no model: it writes down its arguments and its folder in the sandbox's out/, prints a made-up
 * envelope, and ends.
 */
const FAKE_CLAUDE = String.raw`#!/usr/bin/env node
${RECORDS_ITS_PARENT}
const fs = require('fs')
fs.readFileSync(0, 'utf8')
const record = process.env.SANDBOX_DIR + '/out/claude-' + process.env.MOLE_OFFICE_SESSION + '.json'
fs.writeFileSync(record + '.part', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }))
fs.renameSync(record + '.part', record)
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'a-made-up-conversation', total_cost_usd: ${CLAUDE_COST}, duration_ms: 1000, usage: { input_tokens: 11, cache_read_input_tokens: 5, cache_creation_input_tokens: 1, output_tokens: 4 } }) + '\n')
`

/** A `codex` that runs no model: synthetic events, a synthetic rollout in the sandbox's own Codex home, and an argv record. */
const FAKE_CODEX = String.raw`#!/usr/bin/env node
${RECORDS_ITS_PARENT}
const fs = require('fs')
const record = process.env.SANDBOX_DIR + '/out/codex-' + process.env.MOLE_OFFICE_SESSION + '.json'
fs.writeFileSync(record + '.part', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }))
fs.renameSync(record + '.part', record)
const thread = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const day = require('path').join(process.env.SANDBOX_DIR, 'home', '.codex', 'sessions', '2026', '11', '05')
fs.mkdirSync(day, { recursive: true })
fs.writeFileSync(day + '/rollout-2026-11-05T00-00-00-' + thread + '.jsonl', JSON.stringify({ type: 'session_meta', payload: { id: thread, synthetic: true } }) + '\n')
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: thread }) + '\n')
process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 } }) + '\n')
`

interface Ran { status: number; out: string; err: string }

/** The launcher's own declaration, compiled by name, with what it reads from outside given in `globals`. */
function launcherCheck(name: string, globals: Record<string, unknown>): (...args: any[]) => any {
  const source = readFileSync(TOOL, 'utf8')
  let start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (source.slice(start - 6, start) === 'async ') start -= 6
  if (start < 0 || end < 0) throw new Error(`The launcher check ${name} was not found`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: TOOL })
}
const checkRefusal = (sentence: string, status = 1): never => { throw Object.assign(new Error(sentence), { status }) }

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string } = { type: 'agent', id: STARTER }): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'agent' && starterSession !== '' ? { 'x-mole-office-session': starterSession } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/**
 * THE CASTING ROW A START WITH A MADE-UP MODEL NEEDS, as tests/a-second-round-waits-for-the-first.test.ts keeps it: the
 * office attaches the launcher's native selection only from a row whose program and model are the run's. A model the
 * compatibility list holds needs no row.
 */
async function keepTheCastingRowFor(runtime: string, model: string): Promise<void> {
  if (Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, model)) return
  const native = { model: model.slice(model.lastIndexOf('/') + 1), provider: null, variant: null }
  const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  const current = await ask('GET', `/api/casting/for/worker?project=${WORKSPACE}`, undefined, asThePerson)
  expect(current.status, JSON.stringify(current.body)).toBeLessThan(300)
  const row = current.body?.casting as { id: number } | null
  const changed = row === null || row === undefined
    ? await ask('POST', '/api/casting/worker', { program: { value: runtime }, model: { value: model }, native }, asThePerson)
    : await ask('PATCH', `/api/casting/rows/${String(row.id)}`, { program: { value: runtime }, model: { value: model }, native }, asThePerson)
  expect(changed.status, JSON.stringify(changed.body)).toBeLessThan(300)
}

/** The tool as its own process, as the starter, with no key and with the stand-in programs first on the PATH. */
async function sandbox(args: string[]): Promise<Ran> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
  }
  delete env['MOLE_AGENT_KEY']
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, ...after], { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

/** A start that was made, waited for until its command ended, with its start.json. The tool's own flags go before a `--`. */
async function started(args: string[]): Promise<{ ran: Ran; start: any }> {
  const cut = args.includes('--') ? args.indexOf('--') : args.length
  const ran = await sandbox([...args.slice(0, cut), '--json', '--verbose', ...args.slice(cut)])
  expect(ran.status, ran.err).toBe(0)
  const display = JSON.parse(ran.out.trim())
  groups.add(display.hostPgid)
  await until('the stand-in command to end', () => {
    try { process.kill(display.hostPid, 0); return false } catch { return true }
  })
  return { ran, start: JSON.parse(readFileSync(join(dir, 'logs', display.run, 'start.json'), 'utf8')) }
}

/** What a stand-in program of one run wrote down, once it has. */
async function whatItWasGiven(program: string, run: string): Promise<{ argv: string[]; cwd: string }> {
  const file = join(dir, 'out', `${program}-${run}.json`)
  await until(`the stand-in ${program} of run ${run} to write what it was given`, () => existsSync(file))
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** The runs a run's record says it is derived from. */
async function theRunsItContinues(run: string): Promise<string[]> {
  const read = await ask('GET', `/api/records/${run}`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body.links as any[]).filter((link) => link.type === 'derived_from' && link.isBacklink === false).map((link) => String(link.other?.id ?? link.toId))
}

/** A run's usage receipt, once the helper that waited on its command has written it. */
async function theReceiptOf(run: string): Promise<Record<string, unknown>> {
  let receipt: Record<string, unknown> | undefined
  await until(`the usage receipt of run ${run}`, async () => {
    receipt = (await ask('GET', `/api/records/${run}`)).body?.record?.data?.usageReceipt ?? undefined
    return receipt !== undefined
  })
  return receipt!
}

/**
 * THE WORDS THE NEXT-ROUND DOOR GIVES THE LAUNCHER for a round (RoundAdapter.commandFor in src/worker/runtimes/round.ts),
 * less the launcher's own path and the words that say who asks and where the office is, which sandbox() gives. A case
 * asks as the starter, from the host: which run a round follows, and whether it starts a new conversation, do not depend
 * on who asks. The door always names the run the round follows with --continues.
 */
function theDoorsWords(round: { handle: string; brief: string; model: string; runtime: string; follows: string; worktree?: string; cutFrom?: string }): string[] {
  const { args } = new RoundAdapter({}).commandFor({
    ...round, instance: NAME, sandboxes, session: 'a-made-up-launcher-run', cwd: REPO, api, workspace: WORKSPACE, outputPath: join(scratch, 'the-door-out'), key: null,
  })
  expect(args.slice(1, 3)).toEqual(['round', NAME])
  expect(args.slice(args.indexOf('--continues'), args.indexOf('--continues') + 2)).toEqual(['--continues', round.follows])
  const theirs = ['--sandboxes', '--as', '--session', '--api', '--workspace']
  return args.slice(1).filter((word, at, words) => !theirs.includes(word) && !theirs.includes(words[at - 1] ?? ''))
}

/** The use lines a keyless starter could not send, from the run's launch details, where the tool prints them. */
function theUnsentUses(run: string): unknown[] {
  return readFileSync(join(dir, 'logs', run, 'launch.txt'), 'utf8').split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as unknown)
}

/** The office's runs, by id, so a refusal can be shown to have filed none. */
async function theRuns(): Promise<string[]> {
  const read = await ask('GET', '/api/records?kind=session&limit=1000')
  expect(read.status).toBe(200)
  return read.body.records.map((r: { id: string }) => r.id).sort()
}

/** How many times the fake docker was asked to exec something. Nothing is filed or started without one. */
const execCalls = (): number => theFakeState(fakes).calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').length

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

describe("the launcher's choice of a round's run, with the host's list and the office made up", () => {
  let folder = ''
  const anEntry = (run: string, runtime: string, more: Record<string, unknown> = {}) => ({ run, agent: AGENT, runtime, filedAt: '2026-11-05T10:00:00.000+00:00', started: '2026-11-05T10:00:01.000+00:00', neverStarted: null, containerSession: null, ...more })
  /** A worktree in the made-up folder, with the rules file or without it. */
  const aWorktree = (name: string, rules = true): string => {
    const at = join(folder, name)
    mkdirSync(join(at, dirname(RULES)), { recursive: true })
    if (rules) writeFileSync(join(at, RULES), '# Made-up rules\n')
    return at
  }
  const counted: string[] = []
  const sb = { name: NAME, workspace: WORKSPACE }
  const who = { agent: STARTER, session: 'a-made-up-session' }
  /**
   * The launcher's own functions, with `list` as the host's list, `records` as the data of the office's records, by run,
   * and `unreadable` as the runs whose record the office refuses to give.
   */
  function theLauncher(list: unknown[], records: Record<string, Record<string, unknown>> = {}, unreadable: string[] = []) {
    // Each is compiled when a case asks for it, so a case fails on the function it is about.
    const whyARoundCannotWorkIn = (folder: string) => launcherCheck('whyARoundCannotWorkIn', { existsSync, join, A_ROUNDS_RULES: RULES })(folder)
    const aRoundCanWorkInTheWorktreeOf = (data: unknown) => launcherCheck('aRoundCanWorkInTheWorktreeOf', { whyARoundCannotWorkIn })(data)
    const theRunARoundContinues = (...args: unknown[]) => launcherCheck('theRunARoundContinues', {
      theHostsList: () => list, refuse: checkRefusal, spoolAGateMet: (gate: string) => { counted.push(gate) }, api: 'http://127.0.0.1:9', officeHeaders: () => ({}),
      askTheOffice: async (_api: string, path: string) => {
        const run = decodeURIComponent(path.split('/').at(-1)!)
        if (unreadable.includes(run)) return { status: 403, body: { error: 'A made-up refusal.' } }
        return { status: 200, body: { record: { title: `The title of ${run}`, data: { servingAgent: AGENT, ...records[run] } } } }
      },
      theOfficeSaid: (read: { status: number }) => `a made-up answer ${read.status}`,
      theHostsRunsFolder: () => '/a-made-up/runs', NOT_ON_THE_HOSTS_LIST: 'A made-up sentence.',
    })(...args)
    return {
      continued: (runtime: string, continues?: string) => theRunARoundContinues(sb, who, AGENT, runtime, continues),
      why: (runtime: string, last: unknown, named = false) => launcherCheck('whyARoundStartsANewConversation', { whyARoundCannotWorkIn })(sb, AGENT, runtime, last, named),
      taken: (runtime: string, why: string, last: string | null) =>
        launcherCheck('theRunANewConversationTakes', { theHostsList: () => list, theRunARoundContinues, whyARoundCannotWorkIn, aRoundCanWorkInTheWorktreeOf, refuse: checkRefusal, spoolAGateMet: (gate: string) => { counted.push(gate) }, A_ROUNDS_RULES: RULES })(sb, who, AGENT, runtime, why, last),
    }
  }

  beforeAll(() => { folder = mkdtempSync(join(tmpdir(), 'mole-office-fresh-round-unit-')) })
  afterAll(() => { if (folder !== '') rmSync(folder, { recursive: true, force: true }) })

  // MUTATION: theRunARoundContinues refuses a runtime with no start again, as before round 54: red.
  it.each(['codex', 'claude-code', 'dsh', 'opencode'])("finds no run to continue on %s, a runtime the line never used, and refuses nothing, so a new conversation starts", async (runtime) => {
    counted.length = 0
    const other = runtime === 'codex' ? 'claude-code' : 'codex'
    const launcher = theLauncher([anEntry('older-run', other), anEntry('newer-run', other)])
    expect(await launcher.continued(runtime)).toBeNull()
    expect(counted).toEqual([])
    expect(launcher.why(runtime, null)).toBe(`${AGENT} has no start on runtime ${runtime} in sandbox ${NAME}`)
  })

  // MUTATION: whyARoundCannotWorkIn answers null for a folder that is not there: red. And: it looks only for the
  // folder, not for the rules file in it: red.
  it("starts a new conversation when the last run's worktree is gone, or holds no rules file, and not when it will do", () => {
    const { why } = theLauncher([])
    const gone = join(folder, 'gone-and-let-go'), bare = aWorktree('a-bare-worktree', false), usable = aWorktree('a-usable-worktree')
    const last = (workingDirectory: unknown) => ({ run: 'last-codex-run', data: { workingDirectory }, title: 'A title', entry: anEntry('last-codex-run', 'codex') })
    expect(why('codex', last(gone))).toBe(`run last-codex-run, the last run of ${AGENT} on runtime codex in sandbox ${NAME}, works in ${gone}, which is gone`)
    expect(why('codex', last(bare))).toBe(`run last-codex-run, the last run of ${AGENT} on runtime codex in sandbox ${NAME}, works in ${bare}, which holds no ${RULES}`)
    expect(why('codex', last(usable))).toBeNull()
    // A run that names no worktree is no reason for a new conversation: the round refuses it, as before.
    expect(why('codex', last(undefined))).toBeNull()
  })

  // THE RUN --continues NAMES, as the next-round door always names one: a round cannot continue it when it ran on another
  // runtime, or when its worktree is gone or holds no rules file. A run whose record names no runtime is no reason: the
  // round refuses it, as it did before. MUTATION: whyARoundStartsANewConversation reads the runtime only without
  // --continues: red.
  it('starts a new conversation when the run --continues names ran on another runtime, or its worktree will not do', () => {
    const { why } = theLauncher([])
    const gone = join(folder, 'named-gone'), bare = aWorktree('named-bare', false), usable = aWorktree('named-usable')
    const named = (runtime: unknown, workingDirectory: unknown) => ({ run: 'named-run', data: { runtime, workingDirectory }, title: 'A title', entry: anEntry('named-run', String(runtime)) })
    expect(why('claude-code', named('codex', usable), true)).toBe('run named-run, which --continues names, ran on runtime codex')
    expect(why('claude-code', named('codex', gone), true)).toBe(`run named-run, which --continues names, ran on runtime codex and works in ${gone}, which is gone`)
    expect(why('codex', named('codex', gone), true)).toBe(`run named-run, which --continues names, works in ${gone}, which is gone`)
    expect(why('codex', named('codex', bare), true)).toBe(`run named-run, which --continues names, works in ${bare}, which holds no ${RULES}`)
    expect(why('codex', named('codex', usable), true)).toBeNull()
    expect(why('codex', named(undefined, usable), true)).toBeNull()
  })

  // MUTATION: theRunANewConversationTakes takes the oldest usable run, not the newest: red.
  it('takes the newest started run whose worktree will do, on any runtime, and never the last run itself', async () => {
    const usable = aWorktree('taken-older'), newer = aWorktree('taken-newer'), gone = join(folder, 'taken-gone')
    const { taken } = theLauncher(
      [anEntry('older-run', 'codex', { filedAt: '2026-11-05T08:00:00.000+00:00' }), anEntry('newer-run', 'claude-code', { filedAt: '2026-11-05T09:00:00.000+00:00' }), anEntry('last-run', 'codex', { filedAt: '2026-11-05T11:00:00.000+00:00' })],
      { 'older-run': { workingDirectory: usable }, 'newer-run': { workingDirectory: newer, runtime: 'claude-code' }, 'last-run': { workingDirectory: gone } },
    )
    const chose = await taken('codex', 'a made-up reason', 'last-run')
    expect(chose).toMatchObject({ run: 'newer-run', data: { workingDirectory: newer }, title: 'The title of newer-run' })
  })

  // MUTATION: the new conversation takes the worktree of a run the host's list does not say started: red.
  it("takes no worktree from a run the host's list does not say started, nor from one a round cannot work in", async () => {
    const unstarted = aWorktree('unstarted'), bare = aWorktree('skipped-bare', false), usable = aWorktree('skipped-usable')
    const { taken } = theLauncher(
      [anEntry('usable-run', 'claude-code', { filedAt: '2026-11-05T08:00:00.000+00:00' }), anEntry('gone-run', 'claude-code', { filedAt: '2026-11-05T08:30:00.000+00:00' }), anEntry('bare-run', 'claude-code', { filedAt: '2026-11-05T09:00:00.000+00:00' }), anEntry('unstarted-run', 'claude-code', { started: null })],
      { 'usable-run': { workingDirectory: usable }, 'gone-run': { workingDirectory: join(folder, 'skipped-gone') }, 'bare-run': { workingDirectory: bare }, 'unstarted-run': { workingDirectory: unstarted } },
    )
    expect((await taken('codex', 'a made-up reason', null)).run).toBe('usable-run')
  })

  // MUTATION: the refusal is counted under the gate a-round-continues-only-this-agents-run: red.
  it('refuses when no run works in a worktree a round can work in, names a worker as the way to one, and counts nothing', async () => {
    counted.length = 0
    const gone = join(folder, 'all-gone'), bare = aWorktree('none-bare', false)
    const { taken } = theLauncher([anEntry('claude-run', 'claude-code'), anEntry('codex-run', 'codex', { filedAt: '2026-11-05T11:00:00.000+00:00' })], { 'claude-run': { workingDirectory: bare }, 'codex-run': { workingDirectory: gone } })
    const why = `run codex-run, the last run of ${AGENT} on runtime codex in sandbox ${NAME}, works in ${gone}, which is gone`
    await expect(taken('codex', why, 'codex-run')).rejects.toThrow(
      `A round of ${AGENT} on runtime codex has nowhere to work. It cannot continue a run, because ${why}. ` +
        `No started run of ${AGENT} in sandbox ${NAME} works in a worktree that is there and holds ${RULES}. Start a worker for ${AGENT} with node tools/sandbox.mjs worker, which makes its worktree. Nothing was started.`,
    )
    expect(counted).toEqual([])
  })

  // A RUN WHOSE RECORD CANNOT BE READ ends the search, with the read's own refusal, which names that run and is not
  // counted. An older run is not tried, so the round fails toward starting nothing (the infrastructure agent's first
  // note on round 54). MUTATION: theRunANewConversationTakes skips a run it cannot read and tries the next older one: red.
  it("refuses with the words of a read that failed, names that run, counts nothing and takes no older run", async () => {
    counted.length = 0
    const older = aWorktree('unread-older'), newer = aWorktree('unread-newer')
    const { taken } = theLauncher(
      [anEntry('older-run', 'codex', { filedAt: '2026-11-05T08:00:00.000+00:00' }), anEntry('unread-run', 'claude-code', { filedAt: '2026-11-05T09:00:00.000+00:00' }), anEntry('last-run', 'codex', { filedAt: '2026-11-05T11:00:00.000+00:00' })],
      { 'older-run': { workingDirectory: older }, 'unread-run': { workingDirectory: newer }, 'last-run': { workingDirectory: join(folder, 'unread-gone') } },
      ['unread-run'],
    )
    await expect(taken('codex', 'a made-up reason', 'last-run')).rejects.toThrow(
      `Run unread-run, a start of ${AGENT} in sandbox ${NAME}, could not be read (a made-up answer 403). Nothing was started.`,
    )
    expect(counted).toEqual([])
  })

  // THE LAST RUN IS CHECKED FIRST, even when its worktree is gone (commandRound): a refusal of it is counted, and its
  // words name the run that was refused. One whose container row could not be looked for is not counted, since then
  // nobody knows (the infrastructure agent's second note on round 54). MUTATIONS: theRoundsRunWasFiledHere counts that
  // one too: red. Its words leave out the run they refuse: red.
  it('names the last run it refuses, with a gone worktree, and counts that refusal unless the row could not be looked for', async () => {
    const seen: string[] = []
    const elsewhere = 'its record says it was filed in the sandbox folder "/a-made-up/elsewhere", not /a-made-up/here'
    const checks = (unread: boolean) => launcherCheck('theRoundsRunWasFiledHere', {
      refuse: checkRefusal, spoolAGateMet: (gate: string) => { seen.push(gate) }, whyARunWasNotFiledHere: async () => ({ why: elsewhere, unread }),
    })
    const here = { name: NAME, instance: { startedBy: { session: 'a-made-up-session' } } }
    const data = { servingAgent: AGENT, runtime: 'codex', workingDirectory: join(folder, 'checked-gone') }
    const refusal = `Run last-run of ${AGENT} is on the host's list of sandbox ${NAME}, but ${elsewhere}. Nothing was started.`
    await expect(checks(false)(here, who, AGENT, 'codex', 'last-run', data, anEntry('last-run', 'codex'))).rejects.toThrow(refusal)
    expect(seen).toEqual(['a-rounds-run-was-filed-here'])
    seen.length = 0
    await expect(checks(true)(here, who, AGENT, 'codex', 'last-run', data, anEntry('last-run', 'codex'))).rejects.toThrow(refusal)
    expect(seen).toEqual([])
  })

  // MUTATION: theRoundsRunWasFiledHere checks the runtime of the run a new conversation takes its worktree from: red.
  it("checks the agent of the run a new conversation takes its worktree from, and not that run's runtime", async () => {
    const checks = launcherCheck('theRoundsRunWasFiledHere', { refuse: checkRefusal, spoolAGateMet: () => {}, whyARunWasNotFiledHere: async () => null })
    const here = { name: NAME, instance: { startedBy: { session: 'a-made-up-session' } } }
    await expect(checks(here, who, AGENT, null, 'claude-run', { servingAgent: AGENT, runtime: 'claude-code' }, {})).resolves.toBeUndefined()
    await expect(checks(here, who, AGENT, 'codex', 'claude-run', { servingAgent: AGENT, runtime: 'claude-code' }, {})).rejects.toThrow('ran on runtime claude-code, and this round requires runtime codex')
    await expect(checks(here, who, AGENT, null, 'claude-run', { servingAgent: 'another-agent', runtime: 'claude-code' }, {})).rejects.toThrow('its record says it serves "another-agent"')
  })
})

describe('rounds in a made-up sandbox', () => {
  let first: any
  /** The first run of the second worker's line, a Codex worker, which the door's rounds follow. */
  let doorFirst: any
  /** The Codex round that works in the line's second worktree, once the first worktree is gone. */
  let inTheSecond: any
  const brief = (name: string, text: string): string => {
    const file = join(scratch, name)
    writeFileSync(file, text)
    return file
  }

  beforeAll(async () => {
    t = await freshDb()
    res = await import('../src/server/lib/resources.ts')
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

    scratch = mkdtempSync(join(tmpdir(), 'mole-office-fresh-round-'))
    sandboxes = join(scratch, 'sandboxes')
    fakes = join(scratch, 'fakes')
    secrets = join(scratch, 'sandbox-secrets.env')
    mkdirSync(join(fakes, 'bin'), { recursive: true })
    writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'claude'), FAKE_CLAUDE, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', 'codex'), FAKE_CODEX, { mode: 0o755 })
    writeFileSync(join(fakes, 'bin', ENDS_AT_ONCE), '#!/usr/bin/env node\n' + RECORDS_ITS_PARENT + '\n', { mode: 0o755 })
    writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

    // THE CHECKOUT THE SANDBOX IS MADE FROM: this checkout's tools/, a copy of its src/ with made-up rules, one commit.
    const main = join(scratch, 'main')
    mkdirSync(main)
    git(main, 'init', '-q', '-b', 'main')
    git(main, 'config', 'user.email', 'a-test@example.invalid')
    git(main, 'config', 'user.name', 'A test')
    git(main, 'config', 'commit.gpgsign', 'false')
    symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
    cpSync(join(REPO, 'src'), join(main, 'src'), { recursive: true })
    mkdirSync(join(main, dirname(RULES)), { recursive: true })
    writeFileSync(join(main, RULES), '# Made-up code rules\n\n## Chapter 5 — Made-up tests\nMade-up chapter text.\n')
    writeFileSync(join(main, 'README.md'), 'a checkout for the fresh-round test\n')
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'the checkout')
    mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(main, 'data'))

    const template = join(scratch, 'template')
    mkdirSync(template)
    const real = join(REPO, 'sandboxes', 'mole-office-dev')
    writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
    const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
    office.secrets.hostFile = secrets
    writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

    // THE PEOPLE: the secretary who starts the rounds from the host, and the worker it registered, whose own model is a
    // Codex one. The starter's run is filed with its own key, as its session hook files it.
    const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
    const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, asThePerson)
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const starterKey = String(made.body.whatToGiveIt?.key ?? '')
    expect(starterKey).not.toBe('')
    expect((await ask('POST', '/api/agents/started', { handle: AGENT, name: AGENT, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    expect((await ask('POST', `/api/office/run-models/agent/${AGENT}`, { model: CODEX_MODEL }, asThePerson)).status).toBeLessThan(300)
    expect((await ask('POST', '/api/agents/started', { handle: DOOR_AGENT, name: DOOR_AGENT, role: 'worker', runtime: 'codex', workArea: ['src'] })).status).toBe(201)
    expect((await ask('POST', `/api/office/run-models/agent/${DOOR_AGENT}`, { model: CODEX_MODEL }, asThePerson)).status).toBeLessThan(300)
    const mine = await fetch(`${api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
      body: JSON.stringify({ kind: 'session', title: 'the starter run', data: { state: 'running' } }),
    })
    expect(mine.status).toBe(201)
    starterSession = ((await mine.json()) as { record: { id: string } }).record.id
    // THE TOOL ENTRY A USE LINE NAMES. The use door refuses a slug no live tool in the project has.
    const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Developing the office', data: { says: 'Builders.' }, actor: { type: 'agent', id: STARTER } }).id
    t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool', title: 'Sandbox containers', data: { entry: 'tool', slug: 'sandbox', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor: { type: 'agent', id: STARTER } })
    await keepTheCastingRowFor('codex', CODEX_MODEL)

    const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    dir = JSON.parse(up.out.trim()).folder
    writeFileSync(join(dir, 'briefs/LINE-common.md'), '# Made-up common rules\n')
    writeFileSync(join(dir, 'briefs/TERRITORIES.md'), '# Made-up territories\n')
    // Made-up logins: no login is performed, and no stand-in program reads them.
    mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
    writeFileSync(join(dir, 'home', '.codex', 'auth.json'), '{}')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })

    first = (await started(['worker', NAME, '--agent', AGENT, '--runtime', 'codex', '--title', TITLE, '--brief', brief('first.md', '# A made-up first brief\n')])).start
    expect(first.cwd).toBe(join(dir, 'worktrees', AGENT))
    doorFirst = (await started(['worker', NAME, '--agent', DOOR_AGENT, '--runtime', 'codex', '--title', DOOR_TITLE, '--brief', brief('door-first.md', '# A made-up first brief of the second line\n')])).start
    expect(doorFirst.cwd).toBe(join(dir, 'worktrees', DOOR_AGENT))
  }, 180_000)

  afterAll(async () => {
    // Only what this file started is stopped: the tool's own groups, the command of every start.json in its sandboxes,
    // and the background copy that waits on each command, as the command wrote it down.
    const starts = (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : []).flatMap((one) => startsOf(join(sandboxes, one)))
    const parents = new Map((existsSync(join(fakes, 'parents')) ? readFileSync(join(fakes, 'parents'), 'utf8') : '').split('\n').filter((line) => line !== '').map((line) => line.split(' ').map(Number) as [number, number]))
    for (const start of starts) {
      groups.add(start.hostPgid)
      const parent = parents.get(start.hostPid)
      if (parent !== undefined) groups.add(parent)
    }
    for (const group of groups) {
      if (group <= 1 || group === process.pid) continue
      try {
        if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
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

  // A RUNTIME THE LINE NEVER USED HAS NO RUN TO TAKE A MODEL FROM, so the office is asked for that runtime, as for a
  // worker. The worker's own model is a Codex one and no casting names one for claude-code, so the office names none, the
  // round is refused with what the office said, and nothing is filed.
  // MUTATION: commandRound takes the model of a new conversation only from a run: red.
  it('asks the office for the model of a new conversation on a runtime the line never used', async () => {
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['round', NAME, '--agent', AGENT, '--runtime', 'claude-code', '--brief', brief('office-model.md', '# A made-up brief\n'), '--verbose'])
    expect(ran.status, ran.err).toBe(2)
    expect(ran.err).toContain(`no --model was given, and neither ${AGENT}'s own profile nor a casting marked for its role card in ${WORKSPACE} names a model for claude-code`)
    expect(ran.err).toContain(`This agent's own model, ${CODEX_MODEL}, is for codex, and this run is on claude-code, so it is not used.`)
    expect(execCalls()).toBe(before.calls)
    expect(startsOf(dir).length).toBe(before.starts)
    expect(await theRuns(), 'a refused round filed a run').toEqual(before.runs)
  }, 90_000)

  // MUTATION: commandRound passes continues: true to Claude Code for a new conversation: red.
  it('starts a Claude Code round on a line that only ran Codex, in its worktree, without --continue, and says why', async () => {
    const { ran, start } = await started(['round', NAME, '--agent', AGENT, '--runtime', 'claude-code', '--model', CLAUDE_MODEL, '--brief', brief('claude.md', '# A made-up Claude brief\n')])
    expect(start.cwd).toBe(first.cwd)
    expect((await whatItWasGiven('claude', start.run)).argv).not.toContain('--continue')
    expect(ran.err).toContain(
      `sandbox: this round starts a new conversation on runtime claude-code, because ${AGENT} has no start on runtime claude-code in sandbox ${NAME}; ` +
        `it works in ${first.cwd}, the worktree of run ${first.run}, and reads its chapters from ${join(first.cwd, RULES)}.`,
    )
    expect(ran.err).toContain(`— ${realpathSync(join(first.cwd, RULES))} — SHA-256`)
    const read = await ask('GET', `/api/records/${start.run}`)
    // The run keeps the name claude is given for the model, as a worker's run does.
    expect(read.body.record).toMatchObject({ title: TITLE, data: { runtime: 'claude-code', workingDirectory: first.cwd, model: CLAUDE_MODEL.slice('anthropic/'.length) } })
    expect(await theRunsItContinues(start.run)).toEqual([])
    expect(theUnsentUses(start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${start.run} was filed for ${AGENT} in sandbox ${NAME}; it continues no run.` })
  }, 90_000)

  // THE PROOF THE REFUSAL ASKS FOR FIRST (round 54's refusal, item 1). A round the next-round door starts names the run it
  // follows with --continues. When that run ran on another runtime, the round starts a new conversation in its worktree,
  // and its run is linked to the run it follows, as the door's check needs. Its receipt is its own: the cost the stand-in
  // claude reports is not less the totals of a Codex run, which has none.
  // MUTATION: commandRound refuses a run --continues names that ran on another runtime, as before round 54's refusal: red.
  // And: the receipt subtracts the run a new conversation follows: red.
  it('starts a Claude Code round the door starts after a Codex run as a new conversation, linked to the run it follows', async () => {
    const { ran, start } = await started(theDoorsWords({ handle: DOOR_AGENT, brief: brief('door-claude.md', '# A made-up brief the door gives\n'), model: CLAUDE_MODEL, runtime: 'claude-code', follows: doorFirst.run }))
    expect(start.cwd).toBe(doorFirst.cwd)
    expect((await whatItWasGiven('claude', start.run)).argv).not.toContain('--continue')
    expect(ran.err).toContain(
      `sandbox: this round starts a new conversation on runtime claude-code, because run ${doorFirst.run}, which --continues names, ran on runtime codex; ` +
        `it works in ${doorFirst.cwd}, the worktree of run ${doorFirst.run}, and reads its chapters from ${join(doorFirst.cwd, RULES)}.`,
    )
    expect(ran.err).toContain(`sandbox: round: run ${start.run} of ${DOOR_AGENT} is started in sandbox ${NAME}, following run ${doorFirst.run} in a new conversation. Model `)
    const read = await ask('GET', `/api/records/${start.run}`)
    expect(read.body.record).toMatchObject({ title: DOOR_TITLE, data: { runtime: 'claude-code', workingDirectory: doorFirst.cwd, model: CLAUDE_MODEL.slice('anthropic/'.length) } })
    expect(await theRunsItContinues(start.run)).toEqual([doorFirst.run])
    expect(theUnsentUses(start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${start.run} was filed for ${DOOR_AGENT} in sandbox ${NAME}; it continues no run, and follows run ${doorFirst.run} in a new conversation.` })
    const receipt = await theReceiptOf(start.run)
    expect(receipt).toMatchObject({ runtime: 'claude-code', costUsd: CLAUDE_COST, inputTokens: 11 })
    expect(String(receipt.says ?? '')).not.toContain(doorFirst.run)
  }, 90_000)

  /** A fresh repair's words from the door: a new folder under the sandbox's worktrees, and the checkout's main as its cut. */
  const aFreshRepair = (name: string, runtime: string, model: string) => {
    const worktree = join(realpathSync(join(dir, 'worktrees')), name)
    return { worktree, words: theDoorsWords({ handle: DOOR_AGENT, brief: brief(`${name}.md`, '# A made-up repair brief\n'), model, runtime, follows: doorFirst.run, worktree, cutFrom: git(join(scratch, 'main'), 'rev-parse', 'HEAD') }) }
  }

  // THE PROOF THE REFUSAL ASKS FOR, item 2. A fresh repair on the runtime of the run it follows needs no new conversation
  // for its runtime or its worktree, and still starts one, in its new worktree.
  // MUTATION: commandRound says a fresh repair continues the run it follows: red. And: the receipt subtracts it: red.
  it('starts a fresh repair the door starts as a new conversation that continues nothing, linked to the run it follows', async () => {
    const repair = aFreshRepair(`${DOOR_AGENT}-fresh-codex`, 'codex', CODEX_MODEL)
    const { ran, start } = await started(repair.words)
    expect(start.cwd).toBe(repair.worktree)
    expect(start.command).not.toContain('resume')
    expect(ran.err).toContain(`sandbox: round: run ${start.run} of ${DOOR_AGENT} is started in sandbox ${NAME}, following run ${doorFirst.run} in a new conversation. Model `)
    expect(await theRunsItContinues(start.run)).toEqual([doorFirst.run])
    expect(theUnsentUses(start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${start.run} was filed for ${DOOR_AGENT} in sandbox ${NAME}; it continues no run, and follows run ${doorFirst.run} in a new conversation.` })
    const receipt = await theReceiptOf(start.run)
    expect(receipt).toMatchObject({ runtime: 'codex', inputTokens: 7 })
    expect(String(receipt.source)).not.toContain('less the total')
  }, 90_000)

  // THE START SENTENCE'S FRESH BRANCH: a fresh repair after a run on another runtime works in its new worktree, and reads
  // its chapters from the run it follows. MUTATION: the sentence names the worktree of the run it follows: red.
  it('says a fresh repair after a run on another runtime works in its new worktree, and links it to that run', async () => {
    const repair = aFreshRepair(`${DOOR_AGENT}-fresh-claude`, 'claude-code', CLAUDE_MODEL)
    const { ran, start } = await started(repair.words)
    expect(ran.err).toContain(
      `sandbox: this round starts a new conversation on runtime claude-code, because run ${doorFirst.run}, which --continues names, ran on runtime codex; ` +
        `it works in ${repair.worktree}, a new worktree, and reads its chapters from ${join(doorFirst.cwd, RULES)}.`,
    )
    expect(start.cwd).toBe(repair.worktree)
    expect((await whatItWasGiven('claude', start.run)).argv).not.toContain('--continue')
    expect(await theRunsItContinues(start.run)).toEqual([doorFirst.run])
    expect(theUnsentUses(start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${start.run} was filed for ${DOOR_AGENT} in sandbox ${NAME}; it continues no run, and follows run ${doorFirst.run} in a new conversation.` })
  }, 90_000)

  // THE PROOF THE BRIEF ASKS FOR FIRST. MUTATION: commandRound resumes the Codex thread of a run whose worktree is gone: red.
  it("starts a new Codex round in the newest usable worktree when the last Codex run's worktree is gone, and says why", async () => {
    const second = join(dir, 'worktrees', `${AGENT}-second`)
    const other = (await started(['exec', NAME, '--agent', AGENT, '--runtime', 'claude-code', '--model', CLAUDE_MODEL, '--worktree', second, '--title', 'The second worktree of the line', '--', ENDS_AT_ONCE])).start
    expect(other.cwd).toBe(second)
    // The first worktree is let go, as a landed round's worktree is.
    rmSync(first.cwd, { recursive: true, force: true })

    const { ran, start } = await started(['round', NAME, '--agent', AGENT, '--runtime', 'codex', '--brief', brief('codex.md', '# A made-up Codex brief\n')])
    inTheSecond = start
    expect(ran.err).toContain(
      `sandbox: this round starts a new conversation on runtime codex, because run ${first.run}, the last run of ${AGENT} on runtime codex in sandbox ${NAME}, works in ${first.cwd}, which is gone; ` +
        `it works in ${second}, the worktree of run ${other.run}, and reads its chapters from ${join(second, RULES)}.`,
    )
    expect(ran.err).toContain(`— ${realpathSync(join(second, RULES))} — SHA-256`)
    expect(start.cwd).toBe(second)
    expect(start.command).not.toContain('resume')
    expect((await whatItWasGiven('codex', start.run)).cwd).toBe(second)
    const read = await ask('GET', `/api/records/${start.run}`)
    // The model is the last Codex run's, never the model of the Claude Code run whose worktree the round took.
    expect(read.body.record).toMatchObject({ title: 'The second worktree of the line', data: { runtime: 'codex', model: CODEX_MODEL, workingDirectory: second } })
    expect(await theRunsItContinues(start.run)).toEqual([])

    // A ROUND THE DOOR STARTS names the run it follows with --continues, and when that run's worktree is gone it starts a
    // new conversation too (round 54's refusal, item 1), in the newest worktree that will do, linked to the run named. Its
    // receipt is its own: the stand-in codex reports the same thread every time, so a receipt less the run it follows
    // would count no token.
    // MUTATION: commandRound refuses a run --continues names whose worktree is gone, as before round 54's refusal: red.
    const door = await started(theDoorsWords({ handle: AGENT, brief: brief('named.md', '# A made-up brief that names its run\n'), model: CODEX_MODEL, runtime: 'codex', follows: first.run }))
    expect(door.ran.err).toContain(
      `sandbox: this round starts a new conversation on runtime codex, because run ${first.run}, which --continues names, works in ${first.cwd}, which is gone; ` +
        `it works in ${second}, the worktree of run ${start.run}, and reads its chapters from ${join(second, RULES)}.`,
    )
    expect(door.start.cwd).toBe(second)
    expect(door.start.command).not.toContain('resume')
    expect(await theRunsItContinues(door.start.run)).toEqual([first.run])
    expect(theUnsentUses(door.start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${door.start.run} was filed for ${AGENT} in sandbox ${NAME}; it continues no run, and follows run ${first.run} in a new conversation.` })
    const receipt = await theReceiptOf(door.start.run)
    expect(receipt).toMatchObject({ runtime: 'codex', inputTokens: 7 })
    expect(String(receipt.source)).not.toContain('less the total')
  }, 120_000)

  // A RUN THE DOOR'S ROUND CAN CONTINUE, it continues: the same thread, linked, and its receipt less that run's totals.
  // MUTATION: commandRound starts a new conversation for every run --continues names: red.
  it('continues the run the door names when that run is on the runtime and its worktree will do', async () => {
    const { ran, start } = await started(theDoorsWords({ handle: AGENT, brief: brief('door-codex.md', '# A made-up brief the door gives\n'), model: CODEX_MODEL, runtime: 'codex', follows: inTheSecond.run }))
    expect(ran.err).not.toContain('starts a new conversation')
    expect(start.command.slice(start.command.indexOf('resume'), start.command.indexOf('resume') + 2)).toEqual(['resume', '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'])
    expect(start.cwd).toBe(inTheSecond.cwd)
    expect(ran.err).toContain(`sandbox: round: run ${start.run} of ${AGENT} is started in sandbox ${NAME}, continuing run ${inTheSecond.run}. Model `)
    expect(await theRunsItContinues(start.run)).toEqual([inTheSecond.run])
    expect(theUnsentUses(start.run)).toContainEqual({ tool: 'sandbox', said: `round: run ${start.run} was filed for ${AGENT} in sandbox ${NAME}; it continues run ${inTheSecond.run}.` })
    expect(String((await theReceiptOf(start.run)).source)).toContain(`less the total run ${inTheSecond.run} reported at its end`)
  }, 90_000)

  // MUTATION: the round takes a worktree that is not there: red.
  it('refuses a round when no run of the line works in a worktree that is there, and files nothing', async () => {
    const second = join(dir, 'worktrees', `${AGENT}-second`)
    rmSync(second, { recursive: true, force: true })
    const before = { calls: execCalls(), starts: startsOf(dir).length, runs: await theRuns() }
    const ran = await sandbox(['round', NAME, '--agent', AGENT, '--runtime', 'codex', '--brief', brief('nowhere.md', '# A made-up brief with nowhere to work\n'), '--verbose'])
    expect(ran.status, ran.err).toBe(1)
    expect(ran.err).toContain(`A round of ${AGENT} on runtime codex has nowhere to work. It cannot continue a run, because run `)
    expect(ran.err).toContain(
      `, the last run of ${AGENT} on runtime codex in sandbox ${NAME}, works in ${second}, which is gone. ` +
        `No started run of ${AGENT} in sandbox ${NAME} works in a worktree that is there and holds ${RULES}. ` +
        `Start a worker for ${AGENT} with node tools/sandbox.mjs worker, which makes its worktree. Nothing was started.`,
    )
    expect(execCalls()).toBe(before.calls)
    expect(startsOf(dir).length).toBe(before.starts)
    expect(await theRuns(), 'a refused round filed a run').toEqual(before.runs)
  }, 90_000)

  // A FRESH REPAIR NEEDS NO OTHER RUN'S WORKTREE (NWfZVDPq9OKB, 9 November 2026): 13n's next round was refused with
  // "nowhere to work" when a cleanup had taken the worktree of the run it followed, although the door gave it a new worktree
  // and its cut. Here every worktree of the line is gone, as in the case above. The repair works in its new worktree,
  // follows the run the door names, and reads its chapters from the sandbox's own repository, which its new worktree is cut
  // from, because that run's worktree is gone.
  // MUTATION: commandRound asks a fresh repair for another run's worktree, as before: red (refused, nowhere to work).
  // And: its chapters are read from the gone worktree: red.
  it("starts a fresh repair whose followed run's worktree is gone in its new worktree, reading its chapters from the sandbox's repository", async () => {
    // Every worktree of the line is let go here too, so the case stands alone: the first, and the second the cases above made.
    rmSync(first.cwd, { recursive: true, force: true })
    rmSync(join(dir, 'worktrees', `${AGENT}-second`), { recursive: true, force: true })
    const worktree = join(realpathSync(join(dir, 'worktrees')), `${AGENT}-fresh-after-gone`)
    const words = theDoorsWords({ handle: AGENT, brief: brief('fresh-after-gone.md', '# A made-up repair brief\n'), model: CODEX_MODEL, runtime: 'codex', follows: first.run, worktree, cutFrom: git(join(scratch, 'main'), 'rev-parse', 'HEAD') })
    const { ran, start } = await started(words)
    expect(start.cwd).toBe(worktree)
    expect(start.command).not.toContain('resume')
    const from = [join(dir, 'repo', RULES), join(realpathSync(dir), 'repo', RULES)]
    expect(from.some((one) => ran.err.includes(
      `sandbox: this round starts a new conversation on runtime codex, because run ${first.run}, which --continues names, works in ${first.cwd}, which is gone; ` +
        `it works in ${worktree}, a new worktree, and reads its chapters from ${one}.`)), ran.err).toBe(true)
    expect(from.some((one) => ran.err.includes(`— ${realpathSync(one)} — SHA-256`)), ran.err).toBe(true)
    expect(await theRunsItContinues(start.run)).toEqual([first.run])
    expect((await ask('GET', `/api/records/${start.run}`)).body.record).toMatchObject({ title: TITLE, data: { runtime: 'codex', workingDirectory: worktree } })
  }, 90_000)
})
