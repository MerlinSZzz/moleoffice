// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO RUN IN A SANDBOX IS FILED IN THE SANDBOX'S SHARED CHECKOUT OF MAIN.
 *
 * `<sandbox>/repo` is the clone every start in a sandbox shares. Each agent start moves its main to the main of the
 * checkout the sandbox was made from, and a run's work is read as the commits from its recorded cut to the HEAD of the
 * folder it works in. So a run that works in `<sandbox>/repo` is handed every commit main gains while it runs.
 *
 *   1. `exec --agent` given no --worktree works in the agent's own worktree. After a later start has moved the shared
 *      checkout's main, the run's work is still exactly the one commit it made.
 *   2. `exec --agent --worktree <sandbox>/repo` is refused before the hand-run ask, before anything is filed, before
 *      main is moved and before any docker call.
 *   3. A round that would continue a run filed in `<sandbox>/repo` is refused, and files nothing.
 *   4. The helper inside the sandbox, filing a run itself with no --worktree, files it in the agent's own worktree.
 *   5. The same helper given --worktree `<sandbox>/repo` refuses before it files anything.
 *   6. The helper given a run the host filed (--filed) in `<sandbox>/repo` starts it as before.
 *
 * The world is the one tests/sandbox-launcher.test.ts builds: the launcher and its helper run as their own processes,
 * against a real office on a port of its own, with docker and the devcontainer CLI replaced by the stand-ins in
 * tests/sandbox-stand-ins.ts. No model runs: dsh and claude are stand-ins that write down what they were given.
 */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { linkSourceWithLocalRoundRules, writeRoundStartRules } from './round-chapters-fixture.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, aMadeUpPackage, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'
import { THE_FACTS_VARIABLE, theFactsAStartIsGiven, theSandboxField, theAgentsOwnWorktree, whyARunMayNotWorkIn } from '../tools/sandbox-common.mjs'
import { theRecordedBaseOfRun } from '../src/shared/next-round.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const HELPER = join(REPO, 'tools', 'sandbox-start.mjs')
const WORKSPACE = 'default'
const NAME = 'shared'
const STARTER = 'shared-checkout-starter'
/** The two agents of case 1: the run under test, and the later start that moves the shared checkout's main. */
const FIRST = 'own-worktree-first'
const SECOND = 'own-worktree-second'
/** The agent the host is asked to start in the shared checkout (cases 2 and 3). */
const HOSTED = 'shared-checkout-hosted'
/** The agent the helper inside the sandbox starts (cases 4, 5 and 6). */
const INSIDE = 'shared-checkout-inside'
const DSH_MODEL = 'deepseek/deepseek-v4.1-flash'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let main = '' // the checkout the sandbox is made from
let template = ''
let dsh = ''
let folder = '' // the sandbox's own folder, which `up` made
let starterSession = ''
const theKeyOf = new Map<string, string>()
const theIdOf = new Map<string, string>()
/** Every request the office was sent, in order: what says whether a start asked the hand-run door. */
const asked: { method: string; url: string }[] = []
/** Every process group a case started, stopped at the end if its leader still works in the scratch. */
const groups = new Set<number>()

interface Ran {
  status: number
  out: string
  err: string
}

function state(): { calls: { tool: string; argv: string[] }[] } {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** A commit of a new file in `dir`, made under a test identity, and its hash. */
function aCommitIn(dir: string, file: string): string {
  writeFileSync(join(dir, file), `${file}\n`)
  git(dir, 'add', file)
  git(dir, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', `Add ${file}`)
  return git(dir, 'rev-parse', 'HEAD')
}

function theToolsEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes, MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_SANDBOX_MEMORY_TEST_ROOT: join(fakes, 'memory-files') }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  return env
}

/** The sandbox's facts as the launcher hands them to its helper, from the host's own copy. */
function theHostsFacts(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(sandboxes, '.run', basename(folder), 'instance.json'), 'utf8'))
}

/** A program run as its own process group, without blocking the office this test's own process answers with. */
function runIt(args: string[], env: NodeJS.ProcessEnv): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { env, detached: true })
    if (child.pid !== undefined) groups.add(child.pid)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('close', (code) => done({ status: code ?? 1, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }))
  })
}

/** The launcher on the host, as the starter, with the starter's own key. */
function sandbox(args: string[]): Promise<Ran> {
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return runIt(
    [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, '--as', STARTER, '--session', starterSession, ...after],
    { ...theToolsEnvironment(), MOLE_AGENT_KEY: theKeyOf.get(STARTER)!, MOLE_OFFICE_API: api },
  )
}

/** The helper, started as an agent inside the sandbox starts it, with the facts a command in the sandbox holds. */
function theHelper(args: string[]): Promise<Ran> {
  return runIt(
    [HELPER, '--instance', folder, '--as', STARTER, '--session', starterSession, '--workspace', WORKSPACE, '--api', api, ...args],
    { ...theToolsEnvironment(), [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(theHostsFacts()) },
  )
}

/** The refusal line, and the rest of its explanation from the details file that line names. */
function theRefusalExplanation(ran: Ran): string {
  const files = [...ran.err.matchAll(/Details: ([^\n]+)/g)].map((match) => match[1]!)
  return ran.err + files.map((file) => readFileSync(file, 'utf8')).join('\n')
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

const AS_STARTER = (): { type: string; id: string; session: string } => ({ type: 'agent', id: STARTER, session: starterSession })

/** The ids of the session records the office holds, sorted: what says whether anything was filed. */
async function theSessionIds(): Promise<string[]> {
  return (((await ask('GET', '/api/records?kind=session&shape=full', AS_STARTER())).body.records ?? []) as { id: string }[]).map((one) => one.id).sort()
}

async function theRun(id: string): Promise<{ title: string; data: Record<string, any> }> {
  const read = await ask('GET', `/api/records/${id}`, AS_STARTER())
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body.record
}

/** A run of `agent`, filed in the shared checkout as a run was before the launcher refused it there. */
async function aRunFiledInTheSharedCheckout(agent: string, runtime: string, model: string): Promise<string> {
  const repo = join(folder, 'repo')
  const filed = await ask('POST', '/api/records', AS_STARTER(), {
    kind: 'session', title: `A synthetic run of ${agent} in the shared checkout`,
    data: {
      state: 'running', servingAgent: agent, servingAgentId: theIdOf.get(agent), runtime, model, workingDirectory: repo,
      cutFrom: 'main', cutFromCommit: { named: 'main', commit: git(repo, 'rev-parse', 'refs/heads/main') },
      sandbox: theSandboxField(theHostsFacts(), realpathSync(folder)), submission: { kind: 'git' },
    },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String(filed.body.record.id)
}

async function until(what: string, check: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

/** The start line a launcher or helper printed, and its group kept for the end. */
function theStart(ran: Ran): { run: string; hostPgid: number } {
  const start = JSON.parse(ran.out.trim().split('\n')[0] ?? '{}') as { run: string; hostPgid: number }
  groups.add(start.hostPgid)
  return start
}

const itHasEnded = (run: string) => () => existsSync(join(folder, 'logs', run, 'finish.log'))

// ---------------------------------------------------------------------------- the world

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  app.addHook('onRequest', async (request) => { asked.push({ method: request.method, url: request.url }) })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-shared-checkout-'))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  // A GUARD: run-agent.sh is let run only with a dsh folder inside this test's scratch, never the owner's own.
  writeFileSync(
    join(fakes, 'bin', 'bash'),
    `#!/bin/sh\ncase "$1" in */run-agent.sh) case "$MOLE_OFFICE_DSH_DIR" in ${scratch}/*) ;; *) echo "test guard: run-agent.sh without this test's dsh folder" >&2; exit 97 ;; esac ;; esac\nexec /bin/bash "$@"\n`,
    { mode: 0o755 },
  )
  writeFileSync(join(fakes, 'bin', 'dsh'), `#!/usr/bin/env node\nrequire('fs').writeFileSync(process.env.SANDBOX_DIR + '/out/fake-dsh.json', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }))\n`, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'claude'), '#!/bin/sh\nprintf synthetic-claude\n', { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT THE SANDBOX IS MADE FROM, whose tools/ and src/ are this checkout's own.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  linkSourceWithLocalRoundRules(REPO, main)
  writeFileSync(join(main, 'README.md'), 'a checkout for the shared-checkout test\n')
  for (const [file, text] of Object.entries(aMadeUpPackage())) writeFileSync(join(main, file), text)
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's two files, with the secrets file in the scratch.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  dsh = join(scratch, 'dsh')
  mkdirSync(join(dsh, 'home', 'profiles', 'office'), { recursive: true })
  writeFileSync(join(dsh, 'env'), 'DEEPSEEK_API_KEY=not-a-real-key\n', { mode: 0o600 })
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'cordis.patch.yml'), `configPath: "${main}/tools/dsh-hooks/hooks.json"\npluginRoot: "${main}"\n`)
  writeFileSync(join(dsh, 'home', 'profiles', 'office', 'office-tool.mjs'), `import { officeToolPlugin } from "${main}/tools/dsh-hooks/office-tool.mjs"\n`)

  // THE PEOPLE: the office's secretary, which starts runs, and the workers it registers.
  const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id }
  for (const [handle, role, by] of [
    [STARTER, 'secretary', person],
    [FIRST, 'worker', { type: 'agent', id: STARTER }],
    [SECOND, 'worker', { type: 'agent', id: STARTER }],
    [HOSTED, 'worker', { type: 'agent', id: STARTER }],
    [INSIDE, 'worker', { type: 'agent', id: STARTER }],
  ] as const) {
    const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, role, ...(role === 'worker' ? { workArea: ['src'] } : {}) })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    theKeyOf.set(handle, made.body.whatToGiveIt.key)
    theIdOf.set(handle, made.body.agent.id)
  }
  const filed = await ask('POST', '/api/records', { type: 'agent', id: STARTER, key: theKeyOf.get(STARTER)! }, { kind: 'session', title: 'the starter run', data: { state: 'running', servingAgent: STARTER } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  starterSession = String(filed.body.record.id)

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--dsh', dsh, '--json'])
  expect(up.status, up.err).toBe(0)
  folder = (JSON.parse(up.out.trim()) as { folder: string }).folder
  writeRoundStartRules(folder, join(folder, 'repo'))
}, 120_000)

afterAll(async () => {
  if (folder !== '') for (const start of startsOf(folder)) groups.add(start.hostPgid)
  for (const group of groups) {
    // Only a group whose leader still works in this test's scratch; a number read earlier may belong to another program.
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

// ---------------------------------------------------------------------------- the cases

describe('no run in a sandbox is filed in its shared checkout of main', () => {
  it('runs exec --agent given no --worktree in its own worktree, whose work stays its own commit after main moves', async () => {
    const repo = join(folder, 'repo')
    const first = await sandbox(['exec', NAME, '--agent', FIRST, '--runtime', 'dsh', '--model', DSH_MODEL, '--json', '--', 'true'])
    expect(first.status, first.err).toBe(0)
    const run = theStart(first).run
    await until('the first run to end', itHasEnded(run))

    // MAIN GAINS A COMMIT, and the next start in the sandbox moves the shared checkout's main to it.
    const mains = aCommitIn(main, 'gained-while-the-first-run-worked.txt')
    const second = await sandbox(['exec', NAME, '--agent', SECOND, '--runtime', 'dsh', '--model', DSH_MODEL, '--json', '--', 'true'])
    expect(second.status, second.err).toBe(0)
    await until('the second run to end', itHasEnded(theStart(second).run))
    expect(git(repo, 'rev-parse', 'refs/heads/main')).toBe(mains)

    // THE FIRST RUN'S WORK, read as the finish reads it: from its recorded cut to the HEAD of the folder it works in.
    const { data } = await theRun(run)
    const where = String(data['workingDirectory'])
    const own = aCommitIn(where, 'the-first-runs-own-work.txt')
    const recorded = theRecordedBaseOfRun(data)
    if ('fails' in recorded) throw new Error(recorded.fails)
    const base = git(where, 'rev-parse', '--verify', `${String(recorded.base)}^{commit}`)
    expect(git(where, 'rev-list', `${base}..HEAD`).split('\n'), `the first run's work holds ${mains}, main's commit`).toEqual([own])
    expect(where).toBe(theAgentsOwnWorktree(folder, FIRST))
  }, 90_000)

  it('refuses exec --agent --worktree of the shared checkout before it asks, files, moves main or calls docker', async () => {
    const repo = join(folder, 'repo')
    aCommitIn(main, 'gained-before-the-refused-start.txt')
    const mainBefore = git(repo, 'rev-parse', 'refs/heads/main')
    const sessions = await theSessionIds()
    const calls = state().calls.length
    const requests = asked.length
    const ran = await sandbox(['exec', NAME, '--agent', HOSTED, '--runtime', 'dsh', '--model', DSH_MODEL, '--worktree', repo, '--json', '--', 'true'])
    if (ran.status === 0) theStart(ran)
    expect(ran.status, ran.err).not.toBe(0)
    expect(await theSessionIds()).toEqual(sessions)
    expect(asked.slice(requests).filter((one) => one.url.includes('/hand-run'))).toEqual([])
    expect(state().calls.slice(calls).filter((one) => one.tool === 'docker')).toEqual([])
    expect(git(repo, 'rev-parse', 'refs/heads/main')).toBe(mainBefore)
    expect(theRefusalExplanation(ran)).toContain(whyARunMayNotWorkIn(folder, repo, { agent: HOSTED }))
  }, 60_000)

  it('refuses a round that would continue a run filed in the shared checkout, and files nothing', async () => {
    const repo = join(folder, 'repo')
    const run = await aRunFiledInTheSharedCheckout(HOSTED, 'claude-code', 'claude-opus-5-5')
    const brief = join(folder, 'briefs', `${HOSTED}.md`)
    mkdirSync(join(folder, 'briefs'), { recursive: true })
    writeFileSync(brief, '# A synthetic round\n')
    const secrets = join(scratch, 'sandbox-secrets.env')
    writeFileSync(secrets, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
    try {
      const sessions = await theSessionIds()
      const ran = await sandbox(['round', NAME, '--agent', HOSTED, '--model', 'claude-opus-5-5', '--runtime', 'claude-code', '--brief', brief, '--continues', run, '--json'])
      if (ran.status === 0) theStart(ran)
      expect(ran.status, ran.err).not.toBe(0)
      expect(await theSessionIds()).toEqual(sessions)
      expect(theRefusalExplanation(ran)).toContain(whyARunMayNotWorkIn(folder, repo, { run }))
    } finally {
      rmSync(secrets, { force: true })
    }
  }, 60_000)

  it('has the helper file a run it is given no --worktree for in the agent\'s own worktree', async () => {
    const ran = await theHelper(['--agent', INSIDE, '--runtime', 'dsh', '--model', DSH_MODEL, '--cut-from', 'main', '--', 'true'])
    expect(ran.status, ran.err).toBe(0)
    const { run } = theStart(ran)
    await until('the helper\'s run to end', itHasEnded(run))
    const { data } = await theRun(run)
    expect(data['workingDirectory']).not.toBe(join(folder, 'repo'))
    expect(data['workingDirectory']).toBe(theAgentsOwnWorktree(folder, INSIDE))
  }, 60_000)

  it('has the helper refuse to file a run in the shared checkout', async () => {
    const repo = join(folder, 'repo')
    const sessions = await theSessionIds()
    const ran = await theHelper(['--agent', INSIDE, '--runtime', 'dsh', '--model', DSH_MODEL, '--worktree', repo, '--cut-from', 'main', '--', 'true'])
    if (ran.status === 0) theStart(ran)
    expect(ran.status, ran.err).not.toBe(0)
    expect(await theSessionIds()).toEqual(sessions)
    expect(theRefusalExplanation(ran)).toContain(whyARunMayNotWorkIn(folder, repo, { agent: INSIDE }))
  }, 60_000)

  it('has the helper start a run the host filed in the shared checkout, as before', async () => {
    const repo = join(folder, 'repo')
    const run = await aRunFiledInTheSharedCheckout(INSIDE, 'dsh', DSH_MODEL)
    const ran = await theHelper(['--agent', INSIDE, '--runtime', 'dsh', '--model', DSH_MODEL, '--worktree', repo, '--cut-from', 'main', '--filed', run, '--', 'true'])
    expect(ran.status, ran.err).toBe(0)
    expect(theStart(ran).run).toBe(run)
    await until('the filed run to end', itHasEnded(run))
  }, 60_000)
})
