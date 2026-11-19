// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A SANDBOX POINTS NOWHERE INTO THE CHECKOUT IT WAS MADE FROM (item 2f of briefs/REQUIREMENTS.md). Before item 2f, `up`
 * made the instance's clone with `git clone --shared` from the checkout, so its origin was the checkout and its
 * alternates file named the checkout's objects, and it linked the clone's node_modules, and each worktree's, to the
 * checkout's own. Runs read packages that changed under them when a landing installed again, from a lockfile that was not
 * their branch's, and a plain `git fetch origin` in a sandbox read the checkout. Now the clone's origin is a bare mirror
 * of the checkout's main, which the launcher brings forward on the host and the container gets read-only, and the
 * sandbox installs its own node_modules with `npm ci`, in its container, from its own lockfile (ownPackagesAndOrigin in
 * tools/sandbox.mjs).
 *
 * The office is a real one on a port of its own (the whole API over a throwaway database). Docker, the devcontainer CLI
 * and npm are the stand-ins of tests/sandbox-stand-ins.ts: a `docker exec` runs its command on this machine, and npm
 * makes a made-up package and writes each call down. The checkout is a made-up one in this test's scratch folder, and
 * so are the sandboxes. What this pins:
 *
 *   1. a new sandbox gets its own copy: npm ci ran once, in the container, from the clone's own lockfile, into a folder of
 *      the instance, and the clone's node_modules links there; the container works out the lockfile's hash itself, and
 *      none the host worked out is passed in;
 *   2. an agent's start with the lockfile unchanged installs nothing again;
 *   3. a worktree links to its own sandbox's copy, through the clone's link;
 *   4. a lockfile main changed is installed again at the next start, the clone and its worktrees follow, the older copy
 *      is kept, and the mirror's main is brought forward;
 *   5. a fetch in a sandbox reaches the mirror and never the checkout;
 *   6. nothing in the instance points into the checkout: no link, no origin, no alternates, no worktree's git folder;
 *   7. an instance made before item 2f, with an origin, an alternates file and node_modules links into the checkout, is
 *      set right at its next start, and its clone still holds every object;
 *   8. an install that fails keeps the copy the clone had, says so, and the run still starts; the next start installs;
 *   9. a sandbox with no network installs nothing, and says so;
 *  10. up refuses a container whose mirror docker made writable.
 *
 * MUTATION PROOF, 24 October 2026, each alone after a green control (run I1N0szl5K8z6; its logs are
 * out/<the supervisor's folder>/rP/big-2.log and mutation-big-M1 to M10 there):
 *   - up links the clone's node_modules to the checkout's own again, and installs nothing: cases 1, 2 and 9 go red;
 *   - the host passes the lockfile hash it worked out into the container: case 1 goes red;
 *   - the host installs only when there is no link or one into the checkout, so a changed lockfile installs nothing:
 *     cases 4 and 8 go red;
 *   - an install runs at every start, its marker unread: case 2 goes red;
 *   - a new worktree links to the checkout's node_modules again: cases 3, 4, 6 and 7 go red;
 *   - up clones the checkout with --shared again, and no start sets the origin or the alternates: cases 5, 6, 7 and 9
 *     go red;
 *   - an old instance's origin is left as it is; its alternates file; its worktree's link (three mutations, each
 *     alone): case 7 goes red each time;
 *   - up does not read the mirror's mount back: case 10 goes red;
 *   - a failed npm ci is still marked installed: case 8 goes red;
 *   - a sandbox with no network installs: case 9 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, aMadeUpPackage, startsOf, theFakeMachine, theNpmCalls } from './sandbox-stand-ins.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'own-packages-starter'
/** The sandbox the cases follow from its making on. */
const NAME = 'own-packages'
/** A sandbox set back as one made before item 2f was (case 7). */
const OLD = 'own-packages-old'
/** A sandbox with no network (case 9). */
const OFFLINE = 'own-packages-offline'
/** A sandbox whose mirror docker makes writable (case 10). */
const LEAKY = 'own-packages-leaky'
/** The workers the starter registered: one for each agent's start, so each start files a run of its own. */
const WORKERS = ['own-packages-unchanged', 'own-packages-changed', 'own-packages-old-start', 'own-packages-fails', 'own-packages-after']
/** A model name the office knows nothing of: a start given it never asks the office for one. */
const MODEL = 'a-model-of-this-test'

let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let main = ''
let template = ''
let dir = ''
let starterSession = ''
const groups = new Set<number>()

interface Ran {
  status: number
  out: string
  err: string
}

/** Run tools/sandbox.mjs as its own process, as the starter, with `more` in its env. */
function sandbox(args: string[], more: NodeJS.ProcessEnv = {}): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes, MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), ...more }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, '--as', STARTER, '--session', starterSession, ...after],
      { env, detached: true },
    )
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

/** An agent's run in the sandbox `name`, as the worker `agent`, whose command is `true`. */
async function anAgentsStart(name: string, agent: string): Promise<Ran> {
  const ran = await sandbox(['exec', name, '--agent', agent, '--runtime', 'claude-code', '--model', MODEL, '--worktree', join(sandboxes, name, 'worktrees', agent), '--cut-from', 'main', '--json', '--', 'true'])
  if (ran.status === 0) groups.add((JSON.parse(ran.out.trim()) as { hostPgid: number }).hostPgid)
  return ran
}

async function ask(method: string, path: string, body?: unknown, actor: { type: string; id: string; key?: string } = { type: 'agent', id: STARTER }): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.type === 'agent' && starterSession !== '' ? { 'x-mole-office-session': starterSession } : {}),
      ...(actor.key === undefined ? {} : { 'x-mole-office-key': actor.key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

/** Whether `path` is `folder` or inside it, as written. */
function inside(folder: string, path: string): boolean {
  const way = relative(folder, path)
  return way === '' || (!way.startsWith('..') && !isAbsolute(way))
}

/** Where a link goes, as written and resolved from its own folder, or null when `path` is no link. */
function whereItLinks(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : null
  } catch {
    return null
  }
}

/** The fake docker's state. */
function state(): { calls: { tool: string; argv: string[] }[]; bugs: Record<string, boolean>; containers: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

function setBug(name: string, on: boolean): void {
  const now = state()
  now.bugs[name] = on
  writeFileSync(join(fakes, 'state.json'), JSON.stringify(now))
}

/** The npm calls the stand-in wrote down in the instance folder `folder`. */
function installsIn(folder: string): ReturnType<typeof theNpmCalls> {
  return theNpmCalls(fakes).filter((call) => inside(folder, call.cwd))
}

/** A new commit on the checkout's main holding the made-up package at `version`; answers its hash. */
function aLockfileOnMain(version: string): string {
  for (const [file, text] of Object.entries(aMadeUpPackage(version))) writeFileSync(join(main, file), text)
  git(main, 'commit', '-q', '-am', `the made-up package at ${version}`)
  return git(main, 'rev-parse', 'HEAD')
}

/** The copy folder of an instance whose package-lock.json is `lockfile`, or null. */
function theCopyOf(folder: string, lockfile: string): string | null {
  const copies = join(folder, 'node-modules')
  for (const name of existsSync(copies) ? readdirSync(copies) : []) {
    const copy = join(copies, name)
    if (existsSync(join(copy, 'package-lock.json')) && readFileSync(join(copy, 'package-lock.json'), 'utf8') === lockfile) return copy
  }
  return null
}

/** Every link under `folder`, not followed, with where it goes. */
function everyLink(folder: string): { link: string; to: string }[] {
  const found: { link: string; to: string }[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isSymbolicLink()) found.push({ link: path, to: whereItLinks(path)! })
      else if (entry.isDirectory()) walk(path)
    }
  }
  walk(folder)
  return found
}

/** What in the instance folder `folder` points into the checkout, one line each; empty when nothing does. */
function whatPointsIntoTheCheckout(folder: string): string[] {
  const found: string[] = []
  for (const { link, to } of everyLink(folder)) {
    let real = to
    try { real = realpathSync(to) } catch { /* a link to nothing is judged as written */ }
    if (inside(main, to) || inside(realpathSync(main), real)) found.push(`the link ${link} goes to ${to}`)
  }
  const repo = join(folder, 'repo')
  if (existsSync(join(repo, '.git', 'objects', 'info', 'alternates'))) found.push(`${repo} has an alternates file: ${readFileSync(join(repo, '.git', 'objects', 'info', 'alternates'), 'utf8').trim()}`)
  for (const line of git(repo, 'config', '--get-regexp', '^remote\\..*\\.url$').split('\n').filter(Boolean)) {
    const url = line.slice(line.indexOf(' ') + 1)
    if (inside(main, url) || inside(realpathSync(main), url)) found.push(`${repo} has the remote ${line}`)
  }
  for (const line of git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree '))) {
    const tree = line.slice('worktree '.length)
    if (!inside(folder, tree)) found.push(`${repo} has the worktree ${tree}, outside the instance`)
    if (tree !== repo) {
      const gitdir = readFileSync(join(tree, '.git'), 'utf8').trim().replace(/^gitdir: /, '')
      if (!inside(folder, resolve(tree, gitdir))) found.push(`the worktree ${tree} keeps its git folder at ${gitdir}`)
    }
  }
  return found
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-own-packages-')))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  // A WORKER START RUNS A COMMAND, and `claude` here runs no model: it reads its brief and exits.
  writeFileSync(join(fakes, 'bin', 'claude'), "#!/usr/bin/env node\nrequire('fs').readFileSync(0, 'utf8')\n", { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, so the clone inside runs the helper under
  // test; a committed made-up package; a .gitignore that leaves node_modules out, as the real one does, so a clone with
  // a node_modules link still counts as clean when main is brought forward; its own node_modules, which no sandbox may
  // use; and the two folders the template covers.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the own-packages test\n')
  writeFileSync(join(main, '.gitignore'), 'node_modules\n')
  for (const [file, text] of Object.entries(aMadeUpPackage('1.0.0'))) writeFileSync(join(main, file), text)
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  writeFileSync(join(main, 'node_modules', 'the-checkouts-own'), 'no sandbox reads this\n')
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file of this test's own.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(office.secrets.hostFile, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'supervisor' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const starterKey = String(made.body?.whatToGiveIt?.key ?? '')
  expect(starterKey, "the person's start of the starter answered no key").toMatch(/\S/)
  // FILED WITH THE STARTER'S OWN KEY, as its session hook files it, and the workers registered with that key.
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running' } }, { type: 'agent', id: STARTER, key: starterKey })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id
  for (const handle of WORKERS) {
    const worker = await ask('POST', '/api/agents/started', { handle, name: handle, role: 'worker', runtime: 'claude-code', workArea: ['src'] }, { type: 'agent', id: STARTER, key: starterKey })
    expect(worker.status, JSON.stringify(worker.body)).toBe(201)
  }

  const up = await sandbox(['up', template, '--name', NAME, '--from', main, '--no-dsh', '--json'])
  expect(up.status, up.err).toBe(0)
  dir = JSON.parse(up.out.trim()).folder
}, 180_000)

afterAll(async () => {
  for (const name of [NAME, OLD, OFFLINE]) {
    if (scratch !== '' && existsSync(join(sandboxes, name))) for (const start of startsOf(join(sandboxes, name))) groups.add(start.hostPgid)
  }
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

describe('a sandbox has node_modules of its own, and an origin that is not the checkout', () => {
  it('1: a new sandbox gets its own copy, installed in its container from its own lockfile', () => {
    const repo = join(dir, 'repo')
    const to = whereItLinks(join(repo, 'node_modules'))
    expect(to, `${repo}/node_modules is no link`).not.toBeNull()
    expect(inside(join(dir, 'node-modules'), to!), `${repo}/node_modules goes to ${String(to)}`).toBe(true)
    expect(existsSync(join(to!, 'a-made-up-package', 'index.js')), 'the copy holds nothing npm installed').toBe(true)
    expect(existsSync(join(repo, 'node_modules', 'the-checkouts-own')), "the clone reads the checkout's node_modules").toBe(false)
    const copy = dirname(to!)
    expect(readFileSync(join(copy, 'package-lock.json'), 'utf8')).toBe(readFileSync(join(repo, 'package-lock.json'), 'utf8'))
    expect(existsSync(join(copy, 'installed')), 'the copy is not marked installed').toBe(true)
    const installs = installsIn(dir)
    expect(installs.map((call) => call.argv[0])).toEqual(['ci'])
    expect(installs[0]).toMatchObject({ cwd: copy, home: join(dir, 'home'), lockfile: readFileSync(join(repo, 'package-lock.json'), 'utf8') })
    // IN THE CONTAINER, through docker exec, and never as a command of the host.
    const execs = state().calls.filter((c) => c.tool === 'docker' && c.argv[0] === 'exec' && c.argv.includes('sh') && c.argv.some((a) => a.includes('npm ci')))
    expect(execs.length, 'npm ci was not run through docker exec').toBe(1)
    expect(execs[0]!.argv).toContain(`mole-office-sandbox-${NAME}`)
    // NO HASH THE HOST WORKED OUT: the host's read of the lockfile can be pointed at a host file (ownPackagesAndOrigin).
    expect(execs[0]!.argv.filter((a) => /^[0-9a-f]{16}$/.test(a)), 'the host passed a hash into the container').toEqual([])
  })

  it('2: an agent\'s start with the lockfile unchanged installs nothing again', async () => {
    const before = installsIn(dir).length
    const link = readlinkSync(join(dir, 'repo', 'node_modules'))
    const ran = await anAgentsStart(NAME, WORKERS[0]!)
    expect(ran.status, ran.err).toBe(0)
    expect(installsIn(dir).length, ran.err).toBe(before)
    expect(readlinkSync(join(dir, 'repo', 'node_modules'))).toBe(link)
  }, 90_000)

  it('3: a worktree links to its own sandbox\'s copy, through the clone\'s link', () => {
    const tree = join(dir, 'worktrees', WORKERS[0]!)
    expect(readlinkSync(join(tree, 'node_modules'))).toBe(join(dir, 'repo', 'node_modules'))
    expect(inside(join(dir, 'node-modules'), realpathSync(join(tree, 'node_modules')))).toBe(true)
    expect(existsSync(join(tree, 'node_modules', 'a-made-up-package', 'index.js'))).toBe(true)
  })

  it('4: a lockfile main changed is installed again at the next start, and the clone and its worktrees follow', async () => {
    const repo = join(dir, 'repo')
    const mirror = git(repo, 'config', '--get', 'remote.origin.url')
    const older = dirname(realpathSync(join(repo, 'node_modules')))
    const before = installsIn(dir).length
    const next = aLockfileOnMain('2.0.0')
    const lockfile = aMadeUpPackage('2.0.0')['package-lock.json']
    const ran = await anAgentsStart(NAME, WORKERS[1]!)
    expect(ran.status, ran.err).toBe(0)
    expect(git(mirror, 'rev-parse', 'refs/heads/main'), "the mirror's main was not brought forward").toBe(next)
    expect(readFileSync(join(repo, 'package-lock.json'), 'utf8'), "the clone's main was not brought forward").toBe(lockfile)
    const installs = installsIn(dir).slice(before)
    expect(installs.map((call) => call.lockfile), ran.err).toEqual([lockfile])
    const copy = theCopyOf(dir, lockfile)
    expect(copy, 'no copy holds the new lockfile').not.toBeNull()
    expect(realpathSync(join(repo, 'node_modules'))).toBe(realpathSync(join(copy!, 'node_modules')))
    expect(realpathSync(join(dir, 'worktrees', WORKERS[0]!, 'node_modules')), 'the older worktree did not follow').toBe(realpathSync(join(copy!, 'node_modules')))
    expect(realpathSync(join(dir, 'worktrees', WORKERS[1]!, 'node_modules'))).toBe(realpathSync(join(copy!, 'node_modules')))
    expect(existsSync(join(older, 'installed')), 'the older copy was not kept').toBe(true)
    expect(ran.err).toContain(`npm ci installed ${repo}/package-lock.json into ${copy}`)
  }, 90_000)

  it('5: a fetch in a sandbox reaches the mirror and never the checkout', () => {
    const repo = join(dir, 'repo')
    const mirror = git(repo, 'config', '--get', 'remote.origin.url')
    expect(inside(main, mirror)).toBe(false)
    expect(inside(dir, mirror), 'the mirror is in the instance folder, which the sandbox can write').toBe(false)
    expect(git(repo, 'ls-remote', '--get-url', 'origin')).toBe(mirror)
    // THE CHECKOUT MOVES ON, AND NO START BRINGS THE MIRROR FORWARD: a fetch of origin brings what the mirror holds.
    const atTheMirror = git(mirror, 'rev-parse', 'refs/heads/main')
    aCommit(main, 'a commit only the checkout holds')
    const onlyInTheCheckout = git(main, 'rev-parse', 'HEAD')
    git(repo, 'update-ref', '-d', 'refs/remotes/origin/main')
    git(repo, 'fetch', '-q', 'origin')
    expect(git(repo, 'rev-parse', 'refs/remotes/origin/main')).toBe(atTheMirror)
    expect(() => git(repo, 'cat-file', '-e', `${onlyInTheCheckout}^{commit}`), 'the fetch reached the checkout').toThrow()
  })

  it('6: nothing in the instance points into the checkout', () => {
    expect(whatPointsIntoTheCheckout(dir)).toEqual([])
  })

  it('7: an instance made before item 2f is set right at its next start, and its clone still holds every object', async () => {
    const up = await sandbox(['up', template, '--name', OLD, '--from', main, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const old = join(sandboxes, OLD)
    const repo = join(old, 'repo')
    const mirror = git(repo, 'config', '--get', 'remote.origin.url')
    // SET BACK AS up MADE IT BEFORE item 2f: a --shared clone of the checkout, and links into its node_modules from the
    // clone and from a worktree of it.
    rmSync(repo, { recursive: true, force: true })
    git(old, 'clone', '-q', '--shared', '--branch', 'main', main, repo)
    symlinkSync(join(main, 'node_modules'), join(repo, 'node_modules'))
    const tree = join(old, 'worktrees', 'an-older-worktree')
    git(repo, 'worktree', 'add', '-q', '-b', 'an-older-worktree', tree, 'main')
    symlinkSync(join(main, 'node_modules'), join(tree, 'node_modules'))
    expect(whatPointsIntoTheCheckout(old).length, 'the instance was not set back').toBe(4)

    const ran = await anAgentsStart(OLD, WORKERS[2]!)
    expect(ran.status, ran.err).toBe(0)
    expect(whatPointsIntoTheCheckout(old), ran.err).toEqual([])
    expect(git(repo, 'config', '--get', 'remote.origin.url')).toBe(mirror)
    expect(ran.err).toContain(`the origin of ${repo} is now ${mirror}`)
    expect(ran.err).toContain(`${repo} borrows no objects from ${main} any more`)
    // EVERY OBJECT IS ITS OWN NOW: the whole history reads with the checkout's objects out of reach.
    expect(() => git(repo, 'fsck', '--connectivity-only', '--no-dangling', '--no-progress')).not.toThrow()
    expect(git(repo, 'rev-list', '--count', 'main')).toBe(git(main, 'rev-list', '--count', 'main'))
    expect(inside(join(old, 'node-modules'), realpathSync(join(repo, 'node_modules')))).toBe(true)
    expect(readlinkSync(join(tree, 'node_modules'))).toBe(join(repo, 'node_modules'))
    expect(readlinkSync(join(old, 'worktrees', WORKERS[2]!, 'node_modules'))).toBe(join(repo, 'node_modules'))
  }, 180_000)

  it('8: an install that fails keeps the copy the clone had, and the run starts; the next start installs', async () => {
    const repo = join(dir, 'repo')
    const had = readlinkSync(join(repo, 'node_modules'))
    const lockfile = aMadeUpPackage('3.0.0')['package-lock.json']
    aLockfileOnMain('3.0.0')
    writeFileSync(join(fakes, 'npm-fails'), '')
    try {
      const ran = await anAgentsStart(NAME, WORKERS[3]!)
      expect(ran.status, ran.err).toBe(0)
      expect(ran.err).toContain('npm ci failed in ')
      expect(ran.err).toContain(`no packages were installed for ${repo}; its node_modules is ${had} as before.`)
      expect(readlinkSync(join(repo, 'node_modules'))).toBe(had)
      const copy = theCopyOf(dir, lockfile)
      expect(copy, 'the failed install left no copy folder to look at').not.toBeNull()
      expect(existsSync(join(copy!, 'installed')), 'a failed install was marked installed').toBe(false)
    } finally {
      rmSync(join(fakes, 'npm-fails'), { force: true })
    }
    const before = installsIn(dir).length
    const ran = await anAgentsStart(NAME, WORKERS[4]!)
    expect(ran.status, ran.err).toBe(0)
    expect(installsIn(dir).slice(before).map((call) => call.lockfile)).toEqual([lockfile])
    const copy = theCopyOf(dir, lockfile)!
    expect(existsSync(join(copy, 'installed'))).toBe(true)
    expect(realpathSync(join(repo, 'node_modules'))).toBe(realpathSync(join(copy, 'node_modules')))
  }, 180_000)

  it('9: a sandbox with no network installs nothing, and says so', async () => {
    const up = await sandbox(['up', template, '--name', OFFLINE, '--from', main, '--no-dsh', '--network', 'none', '--json'])
    expect(up.status, up.err).toBe(0)
    const offline = join(sandboxes, OFFLINE)
    expect(installsIn(offline)).toEqual([])
    expect(() => lstatSync(join(offline, 'repo', 'node_modules'))).toThrow()
    expect(up.err).toContain(`${join(offline, 'repo')} has a package-lock.json and no node_modules: a sandbox with no network installs none.`)
    expect(whatPointsIntoTheCheckout(offline)).toEqual([])
  }, 120_000)

  it('10: up refuses a container whose mirror docker made writable', async () => {
    const mirror = git(join(dir, 'repo'), 'config', '--get', 'remote.origin.url')
    setBug('writableRo', true)
    try {
      const up = await sandbox(['up', template, '--name', LEAKY, '--from', main, '--no-dsh'])
      expect(up.status, up.err).toBe(1)
      expect(up.err).toContain(`${mirror} is mounted writable`)
      expect(state().containers[`mole-office-sandbox-${LEAKY}`]).toBeUndefined()
    } finally {
      setBug('writableRo', false)
    }
  }, 120_000)
})

/** One more commit on `at`'s main, touching the README alone. */
function aCommit(at: string, words: string): void {
  writeFileSync(join(at, 'README.md'), `${words}\n`)
  git(at, 'commit', '-q', '-am', words)
}
