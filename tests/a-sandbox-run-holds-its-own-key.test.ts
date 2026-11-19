// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN STARTED IN A SANDBOX HOLDS A KEY OF ITS OWN AGENT, MINTED FOR THE RUN, AND NOBODY ELSE'S (P83 point 5;
 * acceptance finding 79, block f-79 of report EnJvvsDTF_Dx; the launcher side in the secretary's keys-wave brief, message
 * wQauRuWT8HCn, and wave 13m's answers, message jKNPTdCvc5zy).
 *
 * The tools run as their own processes against a real office on a port of its own (the whole API over a throwaway
 * database). Docker and the devcontainer CLI are the stand-ins of tests/sandbox-stand-ins.ts, and `claude` is a script
 * of this test's own that writes down what it was given. What this pins:
 *
 *   1. worker, started by an agent that holds its own key, files the run on the host with that key, and the office
 *      answers a key of the worker for the run. The command holds that key as MOLE_AGENT_KEY, with the run's name and
 *      session, and never the starter's key or SANDBOX_RUN_KEY. The helper's own calls about the run (its process row)
 *      go as the run: the worker's name, the run's session, a key. The key is on no command line and in no output or
 *      log; the env file that carried it was 0600 and is gone, and so is the folder the key file was in. The run's
 *      process row is marked as started by the product, so the office reads it as the run's own row.
 *   2. the run's key proves the worker and only the worker: a write with it under the worker's name is taken as keyed,
 *      and under the starter's name it is refused.
 *   3. a supervisor whose run in the sandbox holds its own key starts a worker it registered, from inside the sandbox:
 *      the helper files that run in there with the supervisor's run key, and the worker's command holds a key of its
 *      own. When that command fails, the helper marks the run crashed as the run, and the office revokes its key.
 *   4. a starter with no key gets a run with no key: the helper says so, and the command holds none.
 *   5. a run filed on the host that the helper then refuses to start is marked never started, not left running.
 *   6. when the first run's process is stopped, the helper crashes the run as the run, and the office revokes its key.
 *   7. a sandbox whose helper is from before --filed: the launcher on the host files nothing and passes no key, and the
 *      helper is asked to file the run itself, as before. Every sandbox made before this change is like that until its
 *      clone moves on, and without this its workers could not start at all.
 *   8. a run whose runtime the host knows holds the model logins that runtime reads and no other (the template's
 *      readBy; message GwN6LMI7YOVR): an opencode agent run holds OpenRouter's key and not the Claude login,
 *      and a claude-code worker the Claude login and not OpenRouter's key.
 *   9. an agent run with no --runtime is refused on the host, before any env file is written and before the helper
 *      is started (the inspector's note on run 2TJhUkWVWOnm).
 *
 * OnjK4TeOpcJA: both keep-running programs embed this test's pid and stop after its death.
 * Mutation: replace either program's owner watch with an endless interval; the case
 * "each keep-running stand-in ends after its owner's SIGKILL" fails and names that program.
 *
 * MUTATION PROOF, 26 September 2026, each alone after a green control, in the acc-assets sandbox (the logs are named in
 * the report of the run that added this file):
 *   - register-a-run.mjs sends the starter's name with no key: cases 1, 2, 3 and 6 go red (no key is minted, and 2 and
 *     6 use case 1's);
 *   - aboutTheRun in tools/sandbox-start.mjs ignores the run's key: cases 1, 3 and 6 go red;
 *   - the helper leaves SANDBOX_RUN_KEY in its environment: case 1 goes red;
 *   - fileARun leaves its key folder behind: case 1 goes red;
 *   - the helper drops the key it was answered for a run it files itself: case 3 goes red;
 *   - theFiledRunNeverStarted marks nothing: case 5 goes red;
 *   - the host passes the key on docker's command line (-e) and not in the env file: case 1 goes red;
 *   - the host files the run whatever helper the sandbox has: case 7 goes red;
 *   - the helper leaves the mark off a run's own process row: case 1 goes red;
 *   - (added with case 8) every declared secret passed whatever the runtime: case 8 goes red;
 *   - exec --agent passes no runtime to the start path: case 8 goes red;
 *   - worker passes no runtime to the start path: case 8 goes red;
 *   - (added with case 9) the host's refusal of an agent run with no --runtime taken out: case 9 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, keepRunningWhileOwnerLives, startsOf, theFakeMachine, theFakeState, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { THE_FACTS_VARIABLE } from '../tools/sandbox-common.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'key-supervisor'
const WORKER = 'key-worker'
const MID = 'key-mid-supervisor'
const LEAF = 'key-leaf-worker'
const OTHER = 'key-other-worker'
/** An opencode worker, for case 8. */
const OPEN = 'key-opencode-worker'
const MODEL = 'a-model-of-this-test'
const NAME = 'keyed'
/** A second sandbox, whose clone holds a helper from before --filed. */
const OLD = 'keyed-old-helper'
const A_KEY = /^[0-9a-f]{64}$/

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let handAskConnectionIsDown = false
let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let secrets = ''
let dir = ''
let starterKey = ''
let starterSession = ''
/** The worker's run of case 1, and the key its command was given. */
let firstRun = ''
let firstRunKey = ''
/** The first run's process row, from the start line. */
let firstRow = ''

/** Every process group a test started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

/** A `claude` that runs no model: it writes what it was given into the sandbox's out/, and keeps running when told. */
const fakeClaude = (ownerPid = process.pid): string => String.raw`#!/usr/bin/env node
const fs = require('fs')
const brief = fs.readFileSync(0, 'utf8')
// THE OFFICE TOOL'S CONFIGURATION, read while it is there: it is removed when the command ends (problem rgAmP45EklqO).
const flag = process.argv.slice(2).find((word) => word.startsWith('--mcp-config='))
const mcp = flag ? JSON.parse(fs.readFileSync(flag.slice('--mcp-config='.length), 'utf8')) : null
fs.writeFileSync(process.env.SANDBOX_DIR + '/out/claude-' + process.env.MOLE_OFFICE_SESSION + '.json', JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), brief, mcp }))
if (brief.includes('KEEP RUNNING')) { ${keepRunningWhileOwnerLives(ownerPid)} }
`

/** A command that writes its environment down and keeps running, for a run that must still hold its key. */
const writeTheEnvAndKeepRunning = (ownerPid = process.pid): string => String.raw`const fs = require('fs'); fs.writeFileSync(process.env.SANDBOX_DIR + '/out/env-' + process.env.MOLE_OFFICE_SESSION + '.json', JSON.stringify(process.env)); ${keepRunningWhileOwnerLives(ownerPid)}`

/** A command that writes its environment down and exits 3, for a run that must end crashed. */
const WRITE_THE_ENV_AND_FAIL = String.raw`const fs = require('fs'); fs.writeFileSync(process.env.SANDBOX_DIR + '/out/env-' + process.env.MOLE_OFFICE_SESSION + '.json', JSON.stringify(process.env)); process.exit(3)`

interface Ran {
  status: number
  out: string
  err: string
}

/**
 * THE CASTING ROW THE NEXT START NEEDS. This office attaches the launcher's native selection only from a row
 * whose program and model are the run's, so the model this test invented is now data on the row. A known model
 * keeps the compatibility data, and a start that names no model asks the office for its own.
 */
async function keepTheCastingRowFor(runtime: string, model: string): Promise<void> {
  if (Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, model)) return
  const native = { model: model.slice(model.lastIndexOf('/') + 1), provider: null, variant: null }
  const current = await ask('GET', `/api/casting/for/worker?project=${WORKSPACE}`, undefined, asTheStarter())
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  const row = current.body?.casting
  if (row === null || row === undefined) {
    const made = await ask('POST', '/api/casting/worker', { program: { value: runtime }, model: { value: model }, native }, asTheStarter())
    expect(made.status, JSON.stringify(made.body)).toBe(201)
  } else {
    const changed = await ask('PATCH', `/api/casting/rows/${String(row.id)}`, { program: { value: runtime }, model: { value: model }, native }, asTheStarter())
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
  }
}

/** The runtime and model a start names, or null when it names no model or files no run. */
function theStartItAsksFor(args: string[]): { runtime: string; model: string } | null {
  if (!args.includes('--agent') || !args.includes('--model')) return null
  const runtimeAt = args.indexOf('--runtime')
  return { runtime: runtimeAt === -1 ? 'claude-code' : args[runtimeAt + 1]!, model: args[args.indexOf('--model') + 1]! }
}

/** Run tools/sandbox.mjs as its own process, as the starter, with the starter's key when `key` is given. */
async function sandbox(args: string[], key: string | null = null): Promise<Ran> {
  const asked = theStartItAsksFor(args)
  if (asked !== null) await keepTheCastingRowFor(asked.runtime, asked.model)
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
    MOLE_OFFICE_AGENT: STARTER,
    MOLE_OFFICE_SESSION: starterSession,
    MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'),
  }
  delete env['MOLE_AGENT_KEY']
  if (key !== null) env['MOLE_AGENT_KEY'] = key
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

/** One request to the office, as `actor`, with its session and key when given. */
async function ask(
  method: string,
  path: string,
  body: unknown,
  actor: { type: string; id: string; session?: string; key?: string },
): Promise<{ status: number; body: any }> {
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

const asTheStarter = (): { type: string; id: string; session: string; key: string } => ({ type: 'agent', id: STARTER, session: starterSession, key: starterKey })

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

/** What a stand-in wrote down in the sandbox's out/, once it has. */
async function written<T>(file: string): Promise<T> {
  const path = join(dir, 'out', file)
  await until(`${file} to be written`, () => existsSync(path))
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** A run's record as the office holds it now. */
async function theRun(run: string): Promise<Record<string, any>> {
  const read = await ask('GET', `/api/records/${run}`, undefined, asTheStarter())
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body?.record ?? read.body) as Record<string, any>
}

/** The office's own log of the calls made with a session, as it read who made them. */
function callsOf(session: string): { route: string; method: string; actor_id: string; identity_source: string }[] {
  return t.client.sqlite
    .prepare('SELECT route, method, actor_id, identity_source FROM api_calls WHERE session_id = ? ORDER BY at_ms ASC')
    .all(session) as { route: string; method: string; actor_id: string; identity_source: string }[]
}

/** Whether the office holds a key as revoked: it keeps each key as its SHA-256 (src/server/lib/keys.ts, keyHash). */
function theKeyIsRevoked(key: string): boolean {
  const row = t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE key_hash = ?').get(createHash('sha256').update(key).digest('hex')) as
    | { revoked_at: string | null }
    | undefined
  expect(row, 'the office holds no such key at all').toBeDefined()
  return row?.revoked_at !== null && row?.revoked_at !== undefined
}

/** Every file under a folder, read as text, to search for a key. */
function everyFileUnder(folder: string): { path: string; text: string }[] {
  if (!existsSync(folder)) return []
  const found: { path: string; text: string }[] = []
  for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    found.push({ path, text: readFileSync(path, 'utf8') })
  }
  return found
}

/** Release a process row as its starter: force, because its run is running, and the sentence sent back. */
async function releaseRow(id: string): Promise<{ status: number; body: any }> {
  const first = await ask('POST', `/api/resources/${id}/release`, { force: true }, asTheStarter())
  if (first.status !== 400) return first
  const phrase = /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(first.body.error))?.[1]
  return ask('POST', `/api/resources/${id}/release`, { force: true, expect: phrase }, asTheStarter())
}

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  app.addHook('onRequest', async (req) => {
    if (handAskConnectionIsDown && req.url.endsWith('/hand-run')) req.raw.socket.destroy()
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-run-keys-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  secrets = join(scratch, 'sandbox-secrets.env')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'claude'), fakeClaude(), { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, so the clone inside runs the helper under
  // test, and the two folders the template covers.
  const main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the run-key test\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE PEOPLE. The person starts the starter, which is handed its own key; the starter, proving itself with that key,
  // registers two workers, so it is their registered starter. It starts runs from the host, as the secretary does: only
  // the secretary names a sandbox on a run filed from the host (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts).
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  starterKey = String(made.body?.whatToGiveIt?.key ?? '')
  expect(starterKey, 'the person\'s start of the supervisor answered no key').toMatch(A_KEY)
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the supervisor run', data: { state: 'running' } }, { type: 'agent', id: STARTER, key: starterKey })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id
  for (const handle of [WORKER, OTHER]) {
    const worker = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] }, asTheStarter())
    expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  }
  // AND A SUPERVISOR OF ITS OWN, which case 3 starts in the sandbox and which starts a worker from in there.
  const mid = await ask('POST', '/api/agents/started', { handle: MID, name: MID, role: 'supervisor', runtime: 'claude-code' }, asTheStarter())
  expect(mid.status, JSON.stringify(mid.body)).toBe(201)

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'], starterKey)
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
}, 180_000)

afterAll(async () => {
  // ONLY THE GROUPS THIS FILE STARTED: each case adds the group it started or its start answered, and the helper's
  // start.json names the rest. No list of every process on this machine is read for more (the owner, 26 October 2026).
  if (dir !== '') for (const start of startsOf(dir)) groups.add(start.hostPgid)
  for (const group of groups) {
    // Only a group whose leader still works in this test's scratch; a number read earlier may belong to somebody
    // else's program by now, and that is never signalled.
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

it.each([
  { name: 'FAKE_CLAUDE', program: fakeClaude },
  { name: 'WRITE_THE_ENV_AND_KEEP_RUNNING', program: writeTheEnvAndKeepRunning },
])("each keep-running stand-in ends after its owner's SIGKILL: $name", async ({ name, program }) => {
  const folder = mkdtempSync(join(scratch, 'owner-death-'))
  mkdirSync(join(folder, 'out'))
  const owner = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], { detached: true, stdio: 'ignore' })
  const ownerEnded = once(owner, 'exit')
  let child: ReturnType<typeof spawn> | undefined
  let childEnded: Promise<unknown> | undefined
  let ended = false
  let output = ''
  try {
    expect(owner.pid, name).toBeDefined()
    child = spawn(process.execPath, ['-e', program(owner.pid)], {
      detached: true,
      env: { ...withoutInheritedEffort(), SANDBOX_DIR: folder, MOLE_OFFICE_SESSION: 'owner-death' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    childEnded = once(child, 'exit')
    child.once('exit', () => { ended = true })
    child.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stdin!.end('KEEP RUNNING')
    const writtenFile = join(folder, 'out', name === 'FAKE_CLAUDE' ? 'claude-owner-death.json' : 'env-owner-death.json')
    await until(`${name} to write its environment`, () => existsSync(writtenFile), 10_000)
    expect(ended, `${name} ended while its owner was alive: ${output}`).toBe(false)
    process.kill(-owner.pid!, 'SIGKILL')
    expect((await ownerEnded)[1]).toBe('SIGKILL')
    await until(`${name} to end within ten seconds of its owner's SIGKILL`, () => ended, 10_000)
    expect(await childEnded, `${name}: ${output}`).toEqual([0, null])
  } finally {
    // Mutations still stop only the groups returned by these starts, then reap them.
    for (const processStarted of [owner, child]) {
      if (processStarted?.pid === undefined) continue
      try { process.kill(-processStarted.pid, 'SIGKILL') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
    await ownerEnded
    if (childEnded !== undefined) await childEnded
    rmSync(folder, { recursive: true, force: true })
  }
}, 30_000)

describe("a run in a sandbox holds its own agent's key", () => {
  it('1: worker, started with the starter\'s key, gives the run a key of the worker, and the key goes nowhere else', async () => {
    const brief = join(scratch, 'first.md')
    writeFileSync(brief, '# The first round\nKEEP RUNNING until you are stopped.\n')
    const ran = await sandbox(['worker', NAME, '--agent', WORKER, '--brief', brief, '--model', MODEL, '--verbose', '--json'], starterKey)
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    firstRun = start.run
    firstRow = start.processRow
    expect(firstRun).toMatch(/\S/)
    expect(ran.err).toContain(`run ${firstRun} of ${WORKER} is filed here with ${STARTER}'s key, and holds a key of ${WORKER} of its own`)

    // THE RUN HOLDS ITS OWN KEY, under the run's name and session, and nothing else of a key. Since 3 October 2026
    // (problem rgAmP45EklqO) a Claude Code worker's key is given to its office tool, through the configuration named on
    // its command line, and not to Claude Code itself, so that its Bash commands do not inherit it (RATbb8xNemOW).
    const given = await written<{ env: Record<string, string>; mcp: { mcpServers: { mole_office: { env: Record<string, string> } } } | null }>(`claude-${firstRun}.json`)
    expect(given.env, 'Claude Code itself holds the key, so its commands would too').not.toHaveProperty('MOLE_AGENT_KEY')
    firstRunKey = String(given.mcp?.mcpServers.mole_office.env['MOLE_AGENT_KEY'] ?? '')
    expect(firstRunKey, 'the run holds no key of its own').toMatch(A_KEY)
    expect(firstRunKey).not.toBe(starterKey)
    expect(given.env['MOLE_OFFICE_AGENT']).toBe(WORKER)
    expect(given.env['MOLE_OFFICE_SESSION']).toBe(firstRun)
    expect(given.mcp?.mcpServers.mole_office.env['MOLE_OFFICE_SESSION']).toBe(firstRun)
    expect(given.env).not.toHaveProperty('SANDBOX_RUN_KEY')

    // THE HELPER'S OWN CALLS ABOUT THE RUN GO AS THE RUN: its process row was registered under the worker's name, with
    // the run's session, and the office read a key on it.
    await until('the run to have its process row', () => callsOf(firstRun).some((c) => c.route === '/api/resources' && c.method === 'POST'))
    const row = callsOf(firstRun).filter((c) => c.route === '/api/resources' && c.method === 'POST')
    expect(row.map((c) => `${c.actor_id} ${c.identity_source}`)).toEqual([`${WORKER} key`])
    // AND THE ROW IS THE RUN'S OWN, marked as the product's start (message Uyy-0VL7YkfX).
    const theRow = ((await ask('GET', '/api/resources', undefined, asTheStarter())).body.resources as { id: string; startedByTheProduct: boolean | null }[]).find((r) => r.id === firstRow)
    expect(theRow?.startedByTheProduct, 'the run\'s process row is not marked as the product\'s start').toBe(true)

    // THE KEY IS ON NO COMMAND LINE, IN NO OUTPUT AND IN NO LOG. The stand-in docker records every command line; the env
    // file that carried the key was 0600 and is gone, and so is the folder the key file was in.
    const calls = theFakeState(fakes).calls as { tool: string; argv: string[]; envFile?: string | null; envFileMode?: number | null }[]
    expect(JSON.stringify(calls).includes(firstRunKey), 'the run key is on a command line').toBe(false)
    expect(`${ran.out}${ran.err}`.includes(firstRunKey), 'the run key is in the launcher\'s output').toBe(false)
    const leaked = everyFileUnder(join(dir, 'logs')).filter((f) => f.text.includes(firstRunKey)).map((f) => f.path)
    expect(leaked, 'the run key is in a log').toEqual([])
    const theExec = calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec').pop()
    expect(theExec?.envFileMode).toBe(0o600)
    expect(existsSync(String(theExec?.envFile)), 'the env file is still there').toBe(false)
    // THE FOLDER THE SANDBOX CANNOT SEE, where the env file and the key folder were made (tools/sandbox.mjs, HOST_ONLY).
    const hostOnly = join(sandboxes, '.run', NAME)
    const left = existsSync(hostOnly) ? readdirSync(hostOnly) : []
    expect(left.filter((name) => name.startsWith('run-key-') || name.endsWith('.env')), 'a key file or an env file was left behind').toEqual([])
  }, 90_000)

  it("2: the run's key proves the worker, and only the worker", async () => {
    const asTheWorker = await ask('POST', '/api/records', { kind: 'note', title: 'Written by the run itself', data: { body: 'a note' } }, { type: 'agent', id: WORKER, session: firstRun, key: firstRunKey })
    expect(asTheWorker.status, JSON.stringify(asTheWorker.body)).toBe(201)
    const last = callsOf(firstRun).filter((c) => c.route === '/api/records' && c.method === 'POST').pop()
    expect(last?.identity_source).toBe('key')
    const underAnotherName = await ask('POST', '/api/records', { kind: 'note', title: 'Written under another name', data: { body: 'a note' } }, { type: 'agent', id: STARTER, session: firstRun, key: firstRunKey })
    expect(underAnotherName.status, JSON.stringify(underAnotherName.body)).toBe(403)
  }, 30_000)

  it('3: a supervisor in the sandbox starts a worker it registered, and that run holds its own key', async () => {
    // THE SUPERVISOR'S RUN, started from the host with the starter's key, so it holds a key of the supervisor.
    const up = await sandbox(
      ['exec', NAME, '--agent', MID, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(dir, 'worktrees', MID), '--cut-from', 'main', '--json', '--', process.execPath, '-e', writeTheEnvAndKeepRunning()],
      starterKey,
    )
    expect(up.status, up.err).toBe(0)
    const midStart = JSON.parse(up.out.trim())
    groups.add(midStart.hostPgid)
    const midRun = String(midStart.run)
    const midEnv = await written<Record<string, string>>(`env-${midRun}.json`)
    const midKey = String(midEnv['MOLE_AGENT_KEY'] ?? '')
    expect(midKey, 'the supervisor\'s run holds no key of its own').toMatch(A_KEY)

    // IT REGISTERS A WORKER, proving itself with its run's key, so it is that worker's registered starter. The worker
    // runs on OpenCode: a Claude Code worker cannot be started from inside a Claude Code session, which removes its login
    // from the commands it runs, and the helper refuses one for that reason.
    const leaf = await ask('POST', '/api/agents/started', { handle: LEAF, name: LEAF, role: 'worker', runtime: 'opencode', workArea: ['src'] }, { type: 'agent', id: MID, session: midRun, key: midKey })
    expect(leaf.status, JSON.stringify(leaf.body)).toBe(201)

    // THE HELPER, AS THE SUPERVISOR'S COMMAND RUNS IT IN THE CONTAINER: the environment its command holds, the
    // supervisor's name, its run and its run's key, and the sandbox's facts as its helper was given them.
    const helper = join(dir, 'repo', 'tools', 'sandbox-start.mjs')
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      SANDBOX_DIR: dir,
      [THE_FACTS_VARIABLE]: midEnv[THE_FACTS_VARIABLE],
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_WORKSPACE: WORKSPACE,
      MOLE_OFFICE_AGENT: MID,
      MOLE_OFFICE_SESSION: midRun,
      MOLE_AGENT_KEY: midKey,
    }
    // THE LEAF IS AN OPENCODE RUN, so the marked row names opencode and this model while its helper starts.
    await keepTheCastingRowFor('opencode', MODEL)
    // THE FAKE CONTAINER'S /tmp, as its docker exec gives a command (withAPrivateTmpToSweep): the helper's sweep stays in
    // this test's folder, so its background copy, in a group of its own that no start.json names, ends soon after the
    // command does instead of sweeping this machine's /tmp.
    const ran: Ran = await new Promise((done) => {
      const child = spawn(
        process.execPath,
        [helper, '--verbose', '--agent', LEAF, '--runtime', 'opencode', '--model', MODEL, '--worktree', join(dir, 'worktrees', LEAF), '--cut-from', 'main', '--', process.execPath, '-e', WRITE_THE_ENV_AND_FAIL],
        { env: withAPrivateTmpToSweep(env, fakes), cwd: dir, detached: true },
      )
      if (child.pid !== undefined) groups.add(child.pid)
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c))
      child.stderr.on('data', (c) => (err += c))
      child.on('close', (code) => done({ status: code ?? 1, out, err }))
    })
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim().split('\n').pop() ?? '{}')
    groups.add(start.hostPgid)
    const leafRun = String(start.run)
    expect(ran.err).toContain(`run ${leafRun} holds a key of ${LEAF} of its own`)
    expect(`${ran.out}${ran.err}`.includes(midKey), 'the supervisor\'s key is in the helper\'s output').toBe(false)

    const leafEnv = await written<Record<string, string>>(`env-${leafRun}.json`)
    const leafKey = String(leafEnv['MOLE_AGENT_KEY'] ?? '')
    expect(leafKey, 'the worker\'s command holds no key of its own').toMatch(A_KEY)
    expect(leafKey).not.toBe(midKey)
    expect(leafEnv['MOLE_OFFICE_AGENT']).toBe(LEAF)
    expect(leafEnv['MOLE_OFFICE_SESSION']).toBe(leafRun)

    // ITS COMMAND FAILED, SO THE HELPER CRASHED THE RUN, AS THE RUN, AND THE OFFICE REVOKED ITS KEY.
    await until('the worker run to be crashed', async () => (await theRun(leafRun)).data.state === 'crashed')
    const crash = callsOf(leafRun).filter((c) => c.method === 'PATCH').pop()
    expect(`${crash?.actor_id} ${crash?.identity_source}`).toBe(`${LEAF} key`)
    expect(theKeyIsRevoked(leafKey), 'the worker run\'s key was not revoked when its run crashed').toBe(true)
    expect(theKeyIsRevoked(midKey), 'the supervisor\'s run key was revoked while its run still runs').toBe(false)
  }, 120_000)

  it('4: a starter with no key gets a run with no key, and the helper says so', async () => {
    const ran = await sandbox(['exec', NAME, '--agent', OTHER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(dir, 'worktrees', OTHER), '--cut-from', 'main', '--json', '--', process.execPath, '-e', WRITE_THE_ENV_AND_FAIL])
    expect(ran.status, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    groups.add(start.hostPgid)
    expect(ran.err).toContain(`run ${start.run} holds no key of its own`)
    const env = await written<Record<string, string>>(`env-${start.run}.json`)
    expect(env).not.toHaveProperty('MOLE_AGENT_KEY')
    expect(env).not.toHaveProperty('SANDBOX_RUN_KEY')
  }, 90_000)

  it('5: a run filed on the host that the helper will not start is marked never started', async () => {
    const before = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }
    const ran = await sandbox(
      ['exec', NAME, '--agent', OTHER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(dir, 'worktrees', OTHER), '--cut-from', 'main', '--cwd', join(scratch, 'no-such-folder'), '--json', '--', 'true'],
      starterKey,
    )
    expect(ran.status, ran.err).not.toBe(0)
    const filed = t.client.sqlite
      .prepare("SELECT id FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgent') = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(OTHER) as { id: string }
    const after = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }
    expect(after.n, 'no run was filed').toBe(before.n + 1)
    const run = await theRun(filed.id)
    expect(run.data.state).toBe('crashed')
    expect(String(run.data.detail)).toContain(`It never started in sandbox ${NAME}`)
  }, 90_000)

  it('7: a sandbox whose helper is from before --filed files the run itself, as before, and the host files nothing', async () => {
    // A CHECKOUT WHOSE HELPER IS AN OLD ONE: every tool is this checkout's own, except tools/sandbox-start.mjs, which is a
    // stand-in that knows nothing of --filed. It writes down what it was asked and prints a start line.
    const oldMain = join(scratch, 'old-main')
    mkdirSync(join(oldMain, 'tools'), { recursive: true })
    git(oldMain, 'init', '-q', '-b', 'main')
    git(oldMain, 'config', 'user.email', 'a-test@example.invalid')
    git(oldMain, 'config', 'user.name', 'A test')
    git(oldMain, 'config', 'commit.gpgsign', 'false')
    for (const name of readdirSync(join(REPO, 'tools'))) {
      if (name !== 'sandbox-start.mjs') symlinkSync(join(REPO, 'tools', name), join(oldMain, 'tools', name))
    }
    writeFileSync(
      join(oldMain, 'tools', 'sandbox-start.mjs'),
      "export const PERMISSIONS_CONTRACT = 2\n" +
        "import { writeFileSync } from 'node:fs'\n" +
        "writeFileSync(process.env.SANDBOX_DIR + '/out/old-helper.json', JSON.stringify({ argv: process.argv.slice(2), env: process.env }))\n" +
        "process.stdout.write(JSON.stringify({ run: null, instance: 'old', processRow: null, hostPid: 0, hostPgid: 0, out: null, command: [] }) + '\\n')\n",
    )
    symlinkSync(join(REPO, 'src'), join(oldMain, 'src'))
    writeFileSync(join(oldMain, 'README.md'), 'a checkout whose helper is an old one\n')
    git(oldMain, 'add', '-A')
    git(oldMain, 'commit', '-q', '-m', 'the checkout')
    mkdirSync(join(oldMain, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(oldMain, 'data'))
    const up = await sandbox(['up', join(scratch, 'template'), '--name', OLD, '--from', oldMain, '--no-dsh', '--json'], starterKey)
    expect(up.status, up.err).toBe(0)
    const oldDir = JSON.parse(up.out.trim()).folder

    const count = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
    const before = count()
    const ran = await sandbox(
      ['exec', OLD, '--agent', OTHER, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(oldDir, 'worktrees', OTHER), '--cut-from', 'main', '--json', '--', 'true'],
      starterKey,
    )
    expect(ran.status, ran.err).toBe(0)
    expect(ran.err).toContain('is from before a run was filed on the host, so it files the run itself, with no key, as before')
    const given = JSON.parse(readFileSync(join(oldDir, 'out', 'old-helper.json'), 'utf8')) as { argv: string[]; env: Record<string, string> }
    expect(given.argv.slice(0, 2)).toEqual(['--agent', OTHER])
    expect(given.argv).not.toContain('--filed')
    expect(given.env).not.toHaveProperty('SANDBOX_RUN_KEY')
    expect(count(), 'the host filed a run for a helper that files its own').toBe(before)
  }, 120_000)

  it('6: when the first run is stopped, the helper crashes it as the run, and the office revokes its key', async () => {
    expect(firstRow, 'the first run\'s start line named no process row').toMatch(/\S/)
    const released = await releaseRow(firstRow)
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    await until('the first run to be crashed', async () => (await theRun(firstRun)).data.state === 'crashed', 30_000)
    const crash = callsOf(firstRun).filter((c) => c.method === 'PATCH').pop()
    expect(`${crash?.actor_id} ${crash?.identity_source}`).toBe(`${WORKER} key`)
    expect(theKeyIsRevoked(firstRunKey), 'the run\'s key was not revoked when its run crashed').toBe(true)
  }, 90_000)

  it('8: a run whose runtime the host knows holds only the model logins that runtime reads', async () => {
    // A LOGIN OF EACH KIND, for this case: the Claude login, which only claude reads, and OpenRouter's key, which only
    // opencode reads (the template's readBy).
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\nOPENROUTER_API_KEY=not-a-real-key\n')
    try {
      const made = await ask('POST', '/api/agents/started', { handle: OPEN, name: OPEN, role: 'worker', runtime: 'opencode', workArea: ['src'] }, asTheStarter())
      expect(made.status, JSON.stringify(made.body)).toBe(201)
      const open = await sandbox(
        ['exec', NAME, '--agent', OPEN, '--runtime', 'opencode', '--model', MODEL, '--worktree', join(dir, 'worktrees', OPEN), '--cut-from', 'main', '--json', '--', process.execPath, '-e', WRITE_THE_ENV_AND_FAIL],
        starterKey,
      )
      expect(open.status, open.err).toBe(0)
      const openStart = JSON.parse(open.out.trim())
      groups.add(openStart.hostPgid)
      const openEnv = await written<Record<string, string>>(`env-${openStart.run}.json`)
      expect(openEnv).toHaveProperty('OPENROUTER_API_KEY')
      expect(openEnv, 'an opencode run holds the Claude login').not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
      // AND THE LAUNCHER SAYS WHAT IT LEFT OUT.
      expect(readFileSync(join(dir, 'logs', openStart.run, 'launch.txt'), 'utf8')).toContain('Left out, because opencode does not read them: CLAUDE_CODE_OAUTH_TOKEN')
      expect(open.err).not.toMatch(/Left out|Secrets named but not passed|no secret was passed|sets none of the names/)

      const brief = join(scratch, 'eighth.md')
      writeFileSync(brief, '# A worker of case 8\n')
      const worker = await sandbox(['worker', NAME, '--agent', OTHER, '--brief', brief, '--model', MODEL, '--json'], starterKey)
      expect(worker.status, worker.err).toBe(0)
      const workerStart = JSON.parse(worker.out.trim())
      groups.add(workerStart.hostPgid)
      const given = await written<{ env: Record<string, string> }>(`claude-${workerStart.run}.json`)
      expect(given.env).toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN')
      expect(given.env, "a claude-code worker holds OpenRouter's key").not.toHaveProperty('OPENROUTER_API_KEY')
    } finally {
      writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n')
    }
  }, 120_000)

  it('9: an agent run with no --runtime is refused on the host, before any env file is written', async () => {
    const calls = (): { tool: string; argv: string[] }[] => theFakeState(fakes).calls as { tool: string; argv: string[] }[]
    const before = calls().length
    const ran = await sandbox(['exec', NAME, '--agent', OTHER, '--model', MODEL, '--worktree', join(dir, 'worktrees', OTHER), '--cut-from', 'main', '--', 'true'], starterKey)
    expect(ran.status).toBe(2)
    expect(ran.err).toContain('An agent run needs --runtime')
    const execs = calls().slice(before).filter((c) => c.tool === 'docker' && c.argv[0] === 'exec')
    expect(execs, 'the helper was started, with an env file of logins, for a run that is refused').toEqual([])
  }, 60_000)
})


it('a refused noKey hand start prints the office sentence and makes no worktree, run or process', async () => {
  const handle = 'key-hand-refused'
  const registered = await ask('POST', '/api/agents/started', { handle, name: handle, noKey: true }, asTheStarter())
  expect(registered.status).toBe(201)
  const sentence = 'This worker has no key of its own, so start it with --asked-by (askedBy) naming a live run of its registered starter and --brief (brief) naming its brief, or use the worker-run door; nothing was started.'
  const brief = join(dir, 'brief-hand.md')
  writeFileSync(brief, 'A made-up brief.\n')
  const count = () => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
  for (const verb of ['worker', 'exec']) {
    const before = count()
    const rows = startsOf(dir).length
    const worktree = join(dir, 'worktrees', handle)
    const args = verb === 'worker'
      ? ['worker', NAME, '--agent', handle, '--brief', brief, '--model', MODEL, '--json']
      : ['exec', NAME, '--agent', handle, '--runtime', 'claude-code', '--model', MODEL, '--worktree', worktree, '--brief', brief, '--json', '--', 'true']
    const ran = await sandbox(args, starterKey)
    expect(ran.status).not.toBe(0)
    expect(ran.err).toContain(sentence)
    expect(existsSync(worktree), 'a refused hand start left a worktree').toBe(false)
    expect(count()).toBe(before)
    expect(startsOf(dir).length).toBe(rows)
  }
}, 120_000)


it('an unanswered office preflight stops an unmarked hand start before its worktree', async () => {
  const handle = 'key-hand-unanswered'
  const registered = await ask('POST', '/api/agents/started', { handle, name: handle }, asTheStarter())
  expect(registered.status).toBe(201)
  const brief = join(dir, 'brief-unanswered.md')
  writeFileSync(brief, 'A made-up brief.\n')
  const worktree = join(dir, 'worktrees', handle)
  handAskConnectionIsDown = true
  try {
    const ran = await sandbox(['worker', NAME, '--agent', handle, '--brief', brief, '--model', MODEL, '--json'], starterKey)
    expect(ran.status).not.toBe(0)
    expect(ran.err).toContain('Mole Office could not answer the hand-start check, so nothing was started.')
    expect(existsSync(worktree)).toBe(false)
  } finally {
    handAskConnectionIsDown = false
  }
}, 120_000)
