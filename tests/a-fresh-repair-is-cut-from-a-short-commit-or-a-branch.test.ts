// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH REPAIR'S --cut-from MAY BE A SHORT COMMIT OR A BRANCH. `round --worktree <new dir> --cut-from <value>` took
 * only a full 40-character commit, so whoever started a repair copied one by hand. Now git reads the value in the
 * checkout the sandbox was made from, the launcher says which commit it took, and the repair goes on with that full
 * commit: the proof on main, the new worktree and the run's recorded cut. A value git cannot read is refused in words,
 * and nothing is started.
 *
 * The first part calls the launcher's own function, compiled by name, on a made-up checkout. The second part starts
 * fresh repairs in a made-up sandbox, with stand-in container and Claude Code programs that call no model.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { runInNewContext } from 'node:vm'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { ROUND_START_RULES } from './round-chapters-fixture.ts'
import { RULE_FILES } from '../src/shared/round-chapters/manifest.ts'
import { guardedGitRun } from '../tools/sandbox-git.mjs'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'repair-cut-starter'
const WORKER = 'repair-cut-worker'
const NAME = 'repair-cuts'
/** A model of this test's own, put on the Casting row, so no default can match it. */
const MODEL = 'the-repair-workers-model'

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

/** Read only a named declaration, leaving the launcher's top-level program unexecuted. */
function launcherCheck(name: string, globals: Record<string, unknown>): (...args: any[]) => any {
  const source = readFileSync(TOOL, 'utf8')
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  if (start < 0 || end < 0) throw new Error(`The launcher check ${name} was not found`)
  return runInNewContext(`(${source.slice(start, end + 2)})`, globals, { filename: TOOL })
}

/** A made-up checkout: two commits on main, a branch at the first, and an annotated tag on it. */
function aMadeUpCheckout(at: string): { first: string; second: string } {
  mkdirSync(at)
  git(at, 'init', '-q', '-b', 'main')
  git(at, 'config', 'user.email', 'a-test@example.invalid')
  git(at, 'config', 'user.name', 'A test')
  git(at, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(at, 'one.txt'), 'the first commit\n')
  git(at, 'add', '-A'); git(at, 'commit', '-qm', 'The first commit')
  const first = git(at, 'rev-parse', 'HEAD')
  git(at, 'branch', 'side')
  git(at, 'tag', '-a', 'a-tag', '-m', 'An annotated tag')
  writeFileSync(join(at, 'two.txt'), 'the second commit\n')
  git(at, 'add', '-A'); git(at, 'commit', '-qm', 'The second commit')
  return { first, second: git(at, 'rev-parse', 'HEAD') }
}

describe("the launcher's reading of a fresh repair's cut", () => {
  let place = ''
  let checkout = ''
  let commits = { first: '', second: '' }
  beforeAll(() => {
    place = mkdtempSync(join(tmpdir(), 'mole-office-repair-cut-reading-'))
    checkout = join(place, 'checkout')
    commits = aMadeUpCheckout(checkout)
  })
  afterAll(() => { if (place !== '') rmSync(place, { recursive: true, force: true }) })

  /** The function with a refusal that throws its sentence and code, and every line it says kept. */
  function read(given: string, from: unknown = checkout): { commit?: string; refused?: { sentence: string; code: number }; said: string[] } {
    const said: string[] = []
    const refuse = (sentence: string, code = 1): never => { throw Object.assign(new Error(sentence), { code }) }
    const theCut = launcherCheck('theCommitARepairIsCutFrom', { guardedGitRun, isAbsolute, refuse, say: (line: string) => said.push(line) })
    try {
      return { commit: theCut({ instance: { from } }, given), said }
    } catch (error) {
      if (error instanceof Error && 'code' in error) return { refused: { sentence: error.message, code: Number(error.code) }, said }
      throw error
    }
  }

  // MUTATION: give back the value as it was given: red.
  it('reads a short commit as the full commit it names, and says which commit it took', () => {
    const short = commits.second.slice(0, 10)
    const got = read(short)
    expect(got.commit).toBe(commits.second)
    expect(got.said).toHaveLength(1)
    expect(got.said[0]).toContain(short)
    expect(got.said[0]).toContain(commits.second)
  })

  it('takes a full commit as it is, and still says which commit it took', () => {
    const got = read(commits.first)
    expect(got.commit).toBe(commits.first)
    expect(got.said.join('\n')).toContain(commits.first)
  })

  it('reads a branch as the commit it stands at', () => {
    expect(read('side').commit).toBe(commits.first)
    expect(read('main').commit).toBe(commits.second)
  })

  // MUTATION: leave out ^{commit}: the tag's own object is answered: red.
  it('reads an annotated tag as the commit it points to, not as the tag', () => {
    const tagObject = git(checkout, 'rev-parse', 'a-tag')
    expect(tagObject).not.toBe(commits.first)
    expect(read('a-tag').commit).toBe(commits.first)
  })

  // MUTATION: refuse with code 1, or say nothing of the value: red.
  it('refuses a value git cannot read in words that name it and the checkout, and says no commit', () => {
    const got = read('no-such-branch')
    expect(got.commit).toBeUndefined()
    expect(got.refused?.code).toBe(2)
    expect(got.refused?.sentence).toContain('"no-such-branch"')
    expect(got.refused?.sentence).toContain(checkout)
    expect(got.refused?.sentence).toMatch(/Nothing was started\.$/)
    expect(got.said).toEqual([])
  })

  it('refuses in words when the sandbox names no checkout it was made from', () => {
    const got = read('main', null)
    expect(got.refused?.code).toBe(2)
    expect(got.refused?.sentence).toContain('"main"')
    expect(got.said).toEqual([])
  })
})

// ================================================================================== fresh repairs in a sandbox

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let secrets = ''
let source = ''
let dir = ''
let starterSession = ''

/** Every process group a case started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

/**
 * THE FIRST LINE OF EVERY COMMAND A CASE STARTS: it writes down its own pid and its parent's in the fakes folder. The
 * parent is the background copy of tools/sandbox-start.mjs that waits on the command, which no file names, so afterAll
 * stops it by this line.
 */
const RECORDS_ITS_PARENT = String.raw`require('fs').appendFileSync(require('path').join(__dirname, '..', 'parents'), process.pid + ' ' + process.ppid + '\n')`
/** A `claude` that runs no model: it reads its brief and ends. */
const FAKE_CLAUDE = `#!/usr/bin/env node\n${RECORDS_ITS_PARENT}\nrequire('fs').readFileSync(0, 'utf8')\n`

interface Ran {
  status: number
  out: string
  err: string
}

/** Run the launcher as its own process, as the starter, as an agent at its terminal does. */
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
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...args, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE], { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

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

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

/** Wait for a start's command to end, so the next round of the same agent is not held. */
async function ended(start: { hostPid: number; hostPgid: number }): Promise<void> {
  groups.add(start.hostPgid)
  await until('the stand-in runtime to exit', () => { try { process.kill(start.hostPid, 0); return false } catch { return true } })
}

/** A new commit on the main of the checkout the sandbox was made from. */
function aCommitOnMain(word: string): string {
  writeFileSync(join(source, `${word}.txt`), `${word}\n`)
  git(source, 'add', '-A'); git(source, 'commit', '-qm', `A commit called ${word}`)
  return git(source, 'rev-parse', 'HEAD')
}

const sessions = (): number => (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-repair-cut-'))
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
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT THE SANDBOX IS MADE FROM: this checkout's own tools/, so the clone inside runs the helper under test,
  // and a copy of src/ with a made-up rules file, since a round reads its chapters from inside its checkout.
  source = join(scratch, 'main')
  mkdirSync(source)
  git(source, 'init', '-q', '-b', 'main')
  git(source, 'config', 'user.email', 'a-test@example.invalid')
  git(source, 'config', 'user.name', 'A test')
  git(source, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(source, 'tools'))
  cpSync(join(REPO, 'src'), join(source, 'src'), { recursive: true })
  writeFileSync(join(source, 'src/config/rules/CODE.md'), ROUND_START_RULES['CODE.md'])
  writeFileSync(join(source, 'README.md'), 'a checkout for the repair cut test\n')
  git(source, 'add', '-A')
  git(source, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(source, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(source, 'data'))

  // THE TEMPLATE: the real one's files, with the secrets file in this test's scratch.
  const template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = secrets
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  // THE PEOPLE: the secretary who starts the worker from the host, with its own key and run, and the worker.
  const asThePerson = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'secretary' }, asThePerson)
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const starterKey = String(made.body.whatToGiveIt?.key ?? '')
  expect(starterKey).not.toBe('')
  const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  const mine = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': STARTER, 'x-mole-office-key': starterKey },
    body: JSON.stringify({ kind: 'session', title: 'the supervisor run', data: { state: 'running' } }),
  })
  expect(mine.status).toBe(201)
  starterSession = ((await mine.json()) as { record: { id: string } }).record.id
  // THE CASTING ROW: the office attaches the launcher's native selection only from a row naming the run's program and
  // model, and this model is the test's own.
  const row = await ask('POST', '/api/casting/worker', { program: { value: 'claude-code' }, model: { value: MODEL }, native: { model: MODEL, provider: null, variant: null } }, asThePerson)
  expect(row.status, JSON.stringify(row.body)).toBe(201)
  // THE TOOL ENTRY A USE LINE NAMES. The use door refuses a slug no live tool in the project has.
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Developing the office', data: { says: 'Builders.' }, actor: { type: 'agent', id: STARTER } }).id
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'tool',
    title: 'Sandbox containers',
    data: { entry: 'tool', slug: 'sandbox', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: { type: 'agent', id: STARTER },
  })

  const up = await sandbox(['up', template, '--name', NAME, '--from', source, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
  for (const file of RULE_FILES.filter((one) => one !== 'CODE.md')) writeFileSync(join(dir, 'briefs', file), ROUND_START_RULES[file])
  writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\n', { mode: 0o600 })
}, 240_000)

afterAll(async () => {
  // ONLY WHAT THIS FILE STARTED IS STOPPED, by the groups it recorded: the launcher's own, each start's command, and the
  // background copy that waits on each command, as the command wrote it down (RECORDS_ITS_PARENT).
  const starts = (sandboxes !== '' && existsSync(sandboxes) ? readdirSync(sandboxes) : []).flatMap((one) => startsOf(join(sandboxes, one)))
  const parents = new Map((existsSync(join(fakes, 'parents')) ? readFileSync(join(fakes, 'parents'), 'utf8') : '').split('\n').filter((line) => line !== '')
    .map((line) => line.split(' ').map(Number) as [number, number]))
  for (const start of starts) {
    groups.add(start.hostPgid)
    const parent = parents.get(start.hostPid)
    if (parent !== undefined) groups.add(parent)
  }
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
    // Only a group whose leader still works in this test's scratch; a number read earlier may be another program's now.
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

describe('a fresh repair started with a short commit or a branch', () => {
  let previous = ''
  const brief = (): string => {
    const at = join(scratch, 'repair.md')
    writeFileSync(at, 'A made-up repair.\n')
    return at
  }

  /** Start a fresh repair in a new directory, cut from what --cut-from is given, following the run before. */
  async function aFreshRepair(folder: string, given: string): Promise<Ran> {
    return sandbox(['round', NAME, '--agent', WORKER, '--model', MODEL, '--brief', brief(), '--continues', previous, '--worktree', join(dir, 'worktrees', folder), '--cut-from', given, '--json'])
  }

  beforeAll(async () => {
    const first = await sandbox(['worker', NAME, '--agent', WORKER, '--model', MODEL, '--brief', brief(), '--json'])
    expect(first.status, first.err).toBe(0)
    const start = JSON.parse(first.out.trim())
    await ended(start)
    previous = start.run
  }, 120_000)

  // MUTATION: record the value as it was given (cutFrom = chosen['cut-from']), or refresh main with it: red.
  it('reads a short commit in the checkout, says which commit it took, and is cut from and records that commit', async () => {
    const landed = aCommitOnMain('short')
    const short = landed.slice(0, 10)
    const started = await aFreshRepair('repair-from-a-short-commit', short)
    expect(started.status, started.err).toBe(0)
    const round = JSON.parse(started.out.trim())
    await ended(round)
    const data = (await ask('GET', `/api/records/${round.run}`)).body.record.data
    expect(data.workingDirectory).toBe(join(dir, 'worktrees', 'repair-from-a-short-commit'))
    expect(data.cutFrom).toBe(landed)
    expect(git(data.workingDirectory, 'rev-parse', 'HEAD')).toBe(landed)
    const said = readFileSync(join(dir, 'logs', round.run, 'launch.txt'), 'utf8').split('\n').find((line) => line.includes(`"${short}"`))
    expect(said, 'the launcher did not say which commit it took').toContain(landed)
    previous = round.run
  }, 120_000)

  it('refuses a value git cannot read in the checkout in words, and files and makes nothing', async () => {
    const before = sessions()
    const started = await aFreshRepair('repair-from-nothing', 'no-such-branch')
    expect(started.status).toBe(2)
    expect(started.err).toContain('"no-such-branch"')
    expect(started.err).toContain(source)
    expect(existsSync(join(dir, 'worktrees', 'repair-from-nothing'))).toBe(false)
    expect(sessions()).toBe(before)
  }, 60_000)
})
