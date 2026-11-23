// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE RUNS FROM ITS BUNDLES, WITH ITS DATA IN THE PER-USER DATA FOLDER. Packaging step 1
 * (plan l1RSxzw-j4P7, rows 6 and 12; decision zjs1me8BC6UQ; wave 13t round 12).
 *
 * The test makes a bundle with `node scripts/bundle.mjs --out <its own folder>`, then starts the
 * bundled service with the bundle's own `mole-office.mjs start`, on a home and a port of its own and
 * with none of this shell's MOLE_OFFICE_ settings. Never the live office. The built page must exist
 * (`npm run build`), because a bundle carries it.
 *
 * It shows that the bundled server and its worker start and answer, that the build stamp names the
 * build, that the database, its keys, its lock and the worker's log are in the per-user data folder
 * (`<home>/.config/mole-office`), and that nothing was written into the bundle's folder or the
 * checkout's data folder.
 *
 * Every process group is recorded as it is found and stopped by that group if a case fails half way.
 *
 * Three-run proofs: node tools/run-named-tests.mjs tests/the-office-runs-from-a-bundle.test.ts
 * MUTATIONS:
 *   - src/config/settings.mjs keeps a bundle's data in the bundle's own folder: red, the database is
 *     not in the per-user data folder;
 *   - src/config/settings.mjs ignores the build stamp, so a bundle is read as a checkout: red, the
 *     service does not start;
 *   - src/config/settings.mjs starts a bundle's worker through tsx from source: red, the worker does
 *     not start;
 *   - (round 13) scripts/bundle.mjs copies public/ again: red, the bundle holds a public/;
 *   - (round 13) src/config/settings.mjs reads public/ from the install's root in a bundle too: red, the
 *     avatars on offer cannot be listed;
 *   - (round 13) src/config/the-self-check-words.mjs says "this checkout" from a bundle: red;
 *   - (round 14c) src/server/lib/check-worktrees.ts sweeps from an installation too: red, the start log
 *     does not say the sweep was skipped;
 *   - (round 15) scripts/bundle.mjs does not put the version in the stamp: red, case 1 (the start line
 *     says no version was recorded) and case 2;
 *   - (round 15) src/server/index.ts leaves theVersion() out of its start line: red, case 1;
 *   - (round 15) scripts/bundle.mjs does not copy LICENSE: red, case 2;
 *   - (round 15) scripts/bundle.mjs leaves the page's packages out of the notices: red, case 2 (react);
 *   - (round 15) scripts/third-party-notices.mjs leaves out the packages' licence texts: red, case 2.
 *   - (round 19) scripts/third-party-notices.mjs leaves out the texts added by hand: red, case 3, naming
 *     the five packages that carry no licence file of their own;
 *   - (round 19) the sentence before a text added by hand is left out: red, case 3.
 *   - (wave 13w round 24) src/server/lib/attention-thread.ts starts the attention thread through tsx from a
 *     bundle too, as it did before: red, case 1, GET /api/attention answers 500.
 *   - (wave 13q round 72) src/server/lib/backup.ts starts the backup thread through tsx from a bundle too: red,
 *     case 1, POST /api/office/backups answers 500. At round 71's tip, which looked for tsx as the doors were
 *     loaded, case 1 was red because the bundled server did not start.
 *   - (wave 13t round W2) src/worker/runtimes/common.ts imports the start values from tools/sandbox-common.mjs
 *     again: red, case 4, "Cannot find module '/tmp/tools/sandbox-common.mjs' imported from <bundle>/worker.mjs".
 *   - scripts/bundle.mjs builds with splitting off: red, case 5, thePerUserDataFolder is in every program's file.
 *   - isTheProgramRun in src/config/settings.mjs compares process.argv[1] with the module's own file in a bundle
 *     too: red, case 6, the bundle's command ends with 0 and says nothing.
 *   - the folder read in the wait reads every entry that is not a folder again: red, case 7, the read
 *     waits for a writer to close the named pipe.
 *   - the folder read decides with statSync in place of lstatSync: no red for a named pipe, which neither
 *     call reads as a file; a link to a regular file would be read and the case plants none, so no case
 *     sees it.
 *   - the wait reads the files itself again instead of calling the folder read: no case catches it every
 *     time, because case 7 calls the folder read itself and the wait meets the worker's pipe only in a
 *     race; a reader sees two places deciding what a read may open.
 *
 * THE SPLIT BUILD. scripts/bundle.mjs builds the programs, the threads, register-myself.mjs and the session hook in
 * one build with splitting on, so code two of them import is carried once, in a chunk beside them. Case 5 shows
 * that for thePerUserDataFolder, which the server, the worker and the command each load as they start, and that the
 * holder, the waiter's tool and the guard's two files are each one file that imports no chunk. The guard's two are
 * built alone because each must be its own program, as scripts/bundle.mjs says. Case 6 runs the command,
 * register-myself.mjs and the session hook from the bundle, each with words that make it say what it is and end, and
 * reads that each started its own program.
 *
 * ROUND 15: THE BETA'S BUNDLE (decision sKPFWjOuQVEe; the beta guide, question 7). The
 * stamp carries package.json's version and the server's start line shows it. The bundle carries
 * Mole Office's own LICENSE and NOTICE, and THIRD-PARTY-NOTICES.txt naming the packages the server,
 * the page and the native module were built from, each with its own licence text. It carries no
 * CLAUDE.md.
 *
 * ROUND 19: every package the notices name has a licence text in them (decisions vetfQhlMD5H0 and
 * HdH_r6mDqJ9u). Five packages carry none of their own; their texts are copied by hand, each after a
 * sentence naming where it came from (scripts/licence-texts-by-hand.mjs).
 *
 * WAVE 13T ROUND W2: AN INSTALLED OFFICE STARTS A RUN. Its worker imported the start values from
 * tools/sandbox-common.mjs, which a bundle does not carry, so an installed worker failed as it loaded and
 * no Codex, OpenCode or Kimi run could start. Case 4 starts an office of its own from the bundle, with
 * the stand-in tool (tests/fake-runtime.mjs) answering its runs, and sends one message. The run must
 * start in the install's root, the stand-in it started must answer, and the rules an installation writes
 * must be in the install's root. The run's finish is not checked: see the case. A worker that
 * fails to load ends the case at once, with its log. At the commit before the fix, case 4 was red with
 * "Cannot find module '<tmp>/tools/sandbox-common.mjs' imported from <bundle>/worker.mjs".
 *
 * ROUND 13: the bundle is trimmed. It holds no public/, because the built page already holds every file
 * of it and the server reads them there, and better-sqlite3 brings only the native file for this system.
 * The bundled command says what it checked as "this installation", which is what it is.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LICENCE_TEXTS_BY_HAND } from '../scripts/licence-texts-by-hand.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import {
  THE_BUNDLES,
  THE_COMMAND_ENTRY,
  THE_FOR_AGENTS_FOLDER,
  THE_GUARDS_BUILT_FILES,
  THE_HOLDER_BUNDLE,
  THE_SERVER_ENTRY,
  THE_SESSION_HOOK,
  THE_THREAD_BUNDLES,
  THE_WORKER_ENTRY,
} from '../src/config/settings.mjs'
import { theLineOfTheHookRunByHand } from '../src/config/the-hook-run-by-hand.mjs'
import { EXIT } from '../src/config/the-service-command.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { STARTER_FORCE_KILL_MS, STARTER_WATCH_PERIOD_MS } from '../src/server/lib/starter-watch.mjs'
import { customKey, keyFileFor } from '../src/server/lib/provider-key-setup.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { GENERATED_HEADER_IN_AN_INSTALLATION } from '../src/worker/rules.ts'
import { one, TEST_DATABASE_PREFIX } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const theVersion = (): string => (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }).version

const groups = new Set<number>()
let dir = ''
let bundle = ''
let home = ''
let dataFolder = ''
let api = ''
let env: NodeJS.ProcessEnv = {}

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/** Every file under a folder, by its path inside it. */
function everyFileIn(folder: string): string[] {
  if (!existsSync(folder)) return []
  const out: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(path.slice(folder.length))
    }
  }
  walk(folder)
  return out.sort()
}

/**
 * The text of every regular file under a folder, each file's text after the one before it. A named pipe with no
 * writer makes a read wait, on the test's own thread, where its time limits cannot fire, so pipes, sockets and every
 * other kind of special file are left out. The entry itself decides, by lstat, and a link is not followed.
 */
function theTextOfEveryRegularFileIn(folder: string): string {
  if (!existsSync(folder)) return ''
  const out: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const itself = lstatSync(path)
      if (itself.isDirectory()) walk(path)
      else if (itself.isFile()) out.push(readFileSync(path, 'utf8'))
    }
  }
  walk(folder)
  return out.join('\n')
}

/**
 * The chunks a file of the bundle loads as it starts: the ones it imports with an import statement, and the ones
 * those import, by their paths inside the bundle. esbuild writes such an import as `from "./chunk-X.mjs"` or
 * `import "./chunk-X.mjs"`, and from for-agents/ with ../ in front.
 */
function theChunksLoadedAtStart(file: string): string[] {
  const seen = new Set<string>()
  const next = [join(bundle, file)]
  for (let at = next.pop(); at !== undefined; at = next.pop()) {
    for (const found of readFileSync(at, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*)"(\.{1,2}\/chunk-[A-Z0-9]+\.mjs)"/g)) {
      const chunk = join(at, '..', String(found[1]))
      if (!seen.has(chunk)) next.push(chunk)
      seen.add(chunk)
    }
  }
  return [...seen].map((chunk) => chunk.slice(bundle.length)).sort()
}

/** Run the bundle's own `mole-office` command, in the environment of the office it is about. */
function theCommand(what: string, world: NodeJS.ProcessEnv = env): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(bundle, 'mole-office.mjs'), what], { cwd: dir, env: world, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => done({ code, out }))
  })
}

async function ask(path: string, init: { method?: string; body?: unknown; at?: string } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const got = await fetch(`${init.at ?? api}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await got.text()
  return { status: got.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) }
}

beforeAll(async () => {
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}bundle-`)
  bundle = join(dir, 'bundle')
  home = join(dir, 'home')
  mkdirSync(home)
  dataFolder = join(home, '.config', 'mole-office')
  const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
  expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
  const port = await aFreePort()
  api = `http://127.0.0.1:${String(port)}`
  // NONE OF THIS SHELL'S SETTINGS: a home of its own, a port of its own, and the PATH to find programs.
  // AND THE SUITE'S MARK, so the bundled server knows a test started it on a Mac as well; on Linux a
  // server a test started without it refuses to start (src/config/the-test-mark.mjs).
  env = {
    PATH: process.env['PATH'],
    HOME: home,
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
    [THE_TEST_MARK]: process.env[THE_TEST_MARK],
  }
}, 360_000)

afterAll(async () => {
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('the office from its bundles', () => {
  it('ends a bundled server when its starter goes away', async () => {
    const ownHome = join(dir, 'home-for-starter-watch')
    mkdirSync(ownHome)
    const port = await aFreePort()
    const at = `http://127.0.0.1:${port}`
    const starter = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    const starterExit = new Promise<void>((resolve, reject) => {
      starter.once('error', reject)
      starter.once('exit', () => resolve())
    })
    if (starter.pid === undefined) throw new Error('Starter did not spawn')
    const starterGroup = starter.pid
    groups.add(starterGroup)
    const server = spawn(process.execPath, [join(bundle, 'server.mjs'), `--stop-with-pid=${starterGroup}`], {
      cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, HOME: ownHome, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_PIXEL_OFFICE: 'off' },
    })
    let result: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let output = ''
    const serverExit = new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.once('exit', (code, signal) => { result = { code, signal }; resolve() })
    })
    server.stdout.on('data', (chunk) => { output += String(chunk) })
    server.stderr.on('data', (chunk) => { output += String(chunk) })
    const serverGroup = server.pid
    if (serverGroup !== undefined) groups.add(serverGroup)
    const signalGroup = (group: number, signal: NodeJS.Signals): void => {
      try { process.kill(-group, signal) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    try {
      if (serverGroup === undefined) throw new Error('Bundled server did not spawn')
      const readyBy = Date.now() + 90_000
      let ready = false
      while (!ready && Date.now() < readyBy) {
        if (result !== undefined) throw new Error(`Bundled server exited before readiness: ${output}`)
        try { ready = (await fetch(`${at}/api/health`)).ok } catch (error) {
          if (!(error instanceof TypeError && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED')) throw error
        }
        if (!ready) await sleep(100)
      }
      expect(ready, output).toBe(true)
      await sleep(STARTER_WATCH_PERIOD_MS * 2)
      expect(result).toBeUndefined()
      signalGroup(starterGroup, 'SIGKILL')
      await starterExit
      // One watch period, the worker's last resort and a scheduling/reaping margin.
      const margin = STARTER_WATCH_PERIOD_MS + 2_000
      const bound = STARTER_WATCH_PERIOD_MS + STARTER_FORCE_KILL_MS + margin
      const deadline = Date.now() + bound
      while (result === undefined && Date.now() < deadline) await sleep(50)
      expect(result, output).toEqual({ code: 0, signal: null })
    } finally {
      if (serverGroup !== undefined) signalGroup(serverGroup, 'SIGKILL')
      signalGroup(starterGroup, 'SIGKILL')
      await Promise.all([serverExit, starterExit])
      if (serverGroup !== undefined) groups.delete(serverGroup)
      groups.delete(starterGroup)
    }
  }, 120_000)

  it('starts, answers, names its build from the stamp, and keeps its data in the per-user data folder', async () => {
    const bundleBefore = everyFileIn(bundle)
    const checkoutDataBefore = everyFileIn(join(REPO, 'data'))
    const stamp = JSON.parse(readFileSync(join(bundle, 'build-stamp.json'), 'utf8')) as { commit: string | null }

    const started = await theCommand('start')
    // THE GROUP THE COMMAND NAMES IS RECORDED FIRST, wherever its lock went, so a case that fails stops it.
    const named = /in process group (\d+)/.exec(started.out)?.[1]
    if (named !== undefined) groups.add(Number(named))
    const database = join(dataFolder, 'data', 'mole-office.db')
    const lock = readTheServiceLock(`${database}.service.json`)
    if (lock.state === 'read') groups.add(lock.lock.pgid)
    expect(started.code, started.out).toBe(0)
    expect(lock.state, started.out).toBe('read')
    // ROUND 13: what the bundled command checked is "this installation", not a checkout.
    expect(started.out).toContain('The office this installation declares answers at')
    expect(started.out).not.toContain('checkout declares')

    // ROUND 13: THE TRIMMED BUNDLE. No public/ of its own, and one native file for this system.
    expect(existsSync(join(bundle, 'public'))).toBe(false)
    expect(readdirSync(join(bundle, 'node_modules', 'better-sqlite3', 'prebuilds'))).toEqual([`${process.platform}-${process.arch}.node`])

    // IT ANSWERS, and its worker started from its bundle too.
    const health = await ask('/api/health')
    expect(health.status, JSON.stringify(health.body)).toBe(200)
    expect(health.body['ok']).toBe(true)
    const worker = health.body['messageWorker'] as { started: boolean; says: string }
    const workerGroup = /in group (\d+)/.exec(worker.says)?.[1]
    if (workerGroup !== undefined) groups.add(Number(workerGroup))
    expect(worker.started, worker.says).toBe(true)
    expect(worker.says).toContain(join(dataFolder, '.logs'))

    const example = 'demo_' + ['FAKE', 'ONLY', 648291].join('_')
    const choices = await ask('/api/settings/provider-keys')
    expect(choices.status).toBe(200)
    const added = await ask('/api/settings/provider-keys', { method: 'POST', body: { provider: 'custom', customName: 'example', prefix: 'demo_', min: 8, value: example } })
    expect(added.status).toBe(200)
    expect(JSON.stringify(added.body).includes(example)).toBe(false)
    expect(readFileSync(keyFileFor(home, customKey('example')), 'utf8') === example).toBe(true)
    expect(existsSync(join(bundle, 'tools'))).toBe(false)

    // THE STAMP NAMES THE BUILD, and the install is the bundle's folder.
    const runtime = await ask('/api/runtime')
    const repository = runtime.body['repository'] as { path: string; head: { full: string } | null; branch: string | null }
    expect(repository.path).toBe(bundle)
    expect(repository.head?.full ?? null).toBe(stamp.commit)
    expect(repository.branch).toBeNull()
    expect((runtime.body['database'] as { path: string }).path).toBe(database)

    // A FEW DOORS. The avatars on offer are files of public/, which a bundle reads from its built page.
    const offered = await ask('/api/avatars')
    expect(offered.status, JSON.stringify(offered.body).slice(0, 300)).toBe(200)
    expect((offered.body['avatars'] as unknown[]).length).toBeGreaterThan(0)
    expect((await ask('/api/kinds')).status).toBe(200)
    const interrupted = await ask('/api/office/interrupted-runs')
    expect(interrupted.status, JSON.stringify(interrupted.body)).toBe(200)
    expect(interrupted.body['runs']).toEqual([])
    // WAVE 13w ROUND 24: THE ATTENTION READ ANSWERS. Its thread is started from the bundle's own
    // attention-thread.mjs. The installed Mac office of 10 October 2026 started it through tsx, which a
    // bundle does not carry, and every attention read there answered 500. Nothing beside this bundle
    // gives it tsx, which is checked here, not assumed.
    expect(() => createRequire(join(bundle, 'server.mjs')).resolve('tsx')).toThrow(/Cannot find module 'tsx'/)
    for (const shape of ['home', 'other-projects']) {
      const attention = await ask(`/api/attention?machine=omit&shape=${shape}`)
      expect(attention.status, `${shape}: ${JSON.stringify(attention.body).slice(0, 500)}`).toBe(200)
    }
    // WAVE 13q ROUND 72: A BACKUP IS TAKEN AT THE DOOR, on a thread started from the bundle's own file.
    const backup = await ask('/api/office/backups', { method: 'POST', body: {} })
    expect(backup.status, JSON.stringify(backup.body).slice(0, 500)).toBe(201)
    expect(backup.body['taken']).toMatchObject({ taken: true })
    const searchWord = 'quillwort'
    const filed = await ask('/api/records', { method: 'POST', body: { kind: 'note', title: 'Synthetic note filed in a bundled office', data: { body: `Synthetic ${searchWord}.` } } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const id = (filed.body['record'] as { id: string }).id
    const read = await ask(`/api/records/${id}`)
    expect((read.body['record'] as { title: string }).title).toBe('Synthetic note filed in a bundled office')
    const search = await ask(`/api/search?q=${encodeURIComponent(searchWord)}`)
    expect(search.status, JSON.stringify(search.body).slice(0, 500)).toBe(200)
    expect(search.body['results']).toEqual(expect.arrayContaining([expect.objectContaining({ record: expect.objectContaining({ id }) })]))

    // THE DATA IS IN THE PER-USER DATA FOLDER, and nothing was written beside the code or into the checkout.
    expect(existsSync(database)).toBe(true)
    expect(existsSync(join(dataFolder, 'data', 'keys.json'))).toBe(true)
    expect(existsSync(`${database}.service.log`)).toBe(true)
    // ROUND 14C: AN INSTALLED OFFICE DOES NOT SWEEP CHECK WORKTREES, AND SAYS SO at start, because it
    // carries no check tools and so never makes one (answer IGu5sdvh7JB-).
    // ROUND 15: THE START LINE NAMES THE VERSION.
    expect(readFileSync(`${database}.service.log`, 'utf8')).toContain(`Mole Office ${theVersion()} API on http://`)
    expect(readFileSync(`${database}.service.log`, 'utf8')).toContain(
      'Check worktrees were not swept: this office runs from an installation, which carries no check tools and so never makes a check worktree.',
    )
    expect(everyFileIn(bundle)).toEqual(bundleBefore)
    expect(everyFileIn(join(REPO, 'data'))).toEqual(checkoutDataBefore)

    // AND THE BUNDLE'S COMMAND STOPS IT.
    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.out).toBe(0)
    expect(lock.state === 'read' && theProcessAt(lock.lock.pid).here).toBe(false)
    for (const file of Object.values(THE_THREAD_BUNDLES)) expect(existsSync(join(bundle, file)), file).toBe(true)
  }, 240_000)

  it('carries the version in its stamp, its own licence, the third-party notices, and no CLAUDE.md', () => {
    const stamp = JSON.parse(readFileSync(join(bundle, 'build-stamp.json'), 'utf8')) as { version?: unknown }
    expect(stamp.version).toBe(theVersion())
    expect(readFileSync(join(bundle, 'LICENSE'), 'utf8')).toBe(readFileSync(join(REPO, 'LICENSE'), 'utf8'))
    expect(readFileSync(join(bundle, 'NOTICE'), 'utf8')).toBe(readFileSync(join(REPO, 'NOTICE'), 'utf8'))
    expect(existsSync(join(bundle, 'CLAUDE.md'))).toBe(false)

    const notices = readFileSync(join(bundle, 'THIRD-PARTY-NOTICES.txt'), 'utf8')
    // One package from the server's bundle, one from the page's build, and the copied native module,
    // each named with its version and followed by its own licence text.
    for (const name of ['fastify', 'react', 'better-sqlite3']) {
      const own = JSON.parse(readFileSync(join(REPO, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }
      const licence = readFileSync(join(REPO, 'node_modules', name, 'LICENSE'), 'utf8').trimEnd()
      const at = notices.indexOf(`\n${name}@${own.version}\n`)
      expect(at, name).toBeGreaterThan(-1)
      const next = notices.indexOf('='.repeat(78), at)
      expect(notices.slice(at, next === -1 ? undefined : next)).toContain(`--- LICENSE ---\n${licence}`)
    }
    // Development-only packages are not named: vitest is never built in.
    expect(notices).not.toMatch(/\nvitest@/)
    expect(notices).toContain('LICENSE.electron.txt and LICENSES.chromium.html')
  })

  it('carries a licence text for every package its notices name, and says where each text added by hand came from', () => {
    const notices = readFileSync(join(bundle, 'THIRD-PARTY-NOTICES.txt'), 'utf8')
    // The first part is the file's heading; each part after it is one package.
    const packages = notices.split(`${'='.repeat(78)}\n`).slice(1)
    expect(packages.length).toBeGreaterThan(100)
    const withoutAText = packages.filter((one) => !one.includes('\n--- ')).map((one) => one.split('\n')[0])
    expect(withoutAText, 'these packages are in the bundle with no licence text: copy each from where it was made into scripts/licence-texts-by-hand/').toEqual([])
    // A text added by hand is carried after the sentence that says where it was copied from.
    for (const [name, byHand] of LICENCE_TEXTS_BY_HAND) {
      const one = packages.find((part) => part.startsWith(`${name}\n`))
      if (one !== undefined) expect(one, name).toContain(`\n${byHand.says}\n`)
    }
  })

  it('starts a run from its bundled worker, with no tools folder beside it', async () => {
    // AN INSTALLED OFFICE COULD NOT START A CODEX, OPENCODE OR KIMI RUN. The bundled worker imported
    // the start values from ../../../tools/sandbox-common.mjs, which scripts/bundle.mjs leaves out of
    // the bundle, so the worker failed as it loaded. That path, from the bundle's worker.mjs, names
    // nothing here, which is checked and not assumed.
    expect(existsSync(join(bundle, '..', '..', '..', 'tools'))).toBe(false)

    // AN OFFICE OF ITS OWN, whose runs are served by the stand-in, which starts no model. Its owner is
    // set the way an installer sets it, so the person can write a message.
    const ownHome = join(dir, 'home-for-a-run')
    mkdirSync(ownHome)
    const ownData = join(ownHome, '.config', 'mole-office')
    const at = `http://127.0.0.1:${String(await aFreePort())}`
    const world: NodeJS.ProcessEnv = {
      ...env,
      HOME: ownHome,
      MOLE_OFFICE_PORT: new URL(at).port,
      MOLE_OFFICE_OWNER_ID: THE_PERSON,
      MOLE_OFFICE_OWNER_NAME: 'Synthetic owner',
      MOLE_OFFICE_FAKE_RUNTIME: FAKE,
      MOLE_OFFICE_AGENT_MODEL: 'haiku',
    }
    const started = await theCommand('start', world)
    const named = /in process group (\d+)/.exec(started.out)?.[1]
    if (named !== undefined) groups.add(Number(named))
    const lock = readTheServiceLock(join(ownData, 'data', 'mole-office.db.service.json'))
    if (lock.state === 'read') groups.add(lock.lock.pgid)
    expect(started.code, started.out).toBe(0)
    const worker = (await ask('/api/health', { at })).body['messageWorker'] as { started: boolean; says: string }
    const workerGroup = /in group (\d+)/.exec(worker.says)?.[1]
    if (workerGroup !== undefined) groups.add(Number(workerGroup))
    expect(worker.started, worker.says).toBe(true)

    // A MESSAGE TO A FRESH AGENT, and the person's press that lets it start (criterion M78).
    await ask('/api/records', { method: 'POST', at, body: { kind: 'agent', title: 'run-from-a-bundle', data: { handle: 'run-from-a-bundle', state: 'active', runtime: 'claude-code' } } })
    const agents = ((await ask('/api/participants', { at })).body['agents'] ?? []) as { id: string; handle: string }[]
    const agentId = one(agents.filter((a) => a.handle === 'run-from-a-bundle'), 'the registry row for run-from-a-bundle').id
    const filed = await ask('/api/records', { method: 'POST', at, body: { kind: 'message', title: 'Synthetic message to a bundled worker', data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] } } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, JSON.stringify(filed.body)).toBe(409)
    const messageId = (filed.body['record'] as { id: string }).id
    const pressed = await ask(`/api/messages/${messageId}/start-an-agent`, { method: 'POST', at, body: {} })
    expect(pressed.status, JSON.stringify(pressed.body)).toBeLessThan(300)

    // THE RUN STARTS, AND THE STAND-IN IT STARTED ANSWERS. A worker that failed to load says so in its log,
    // and the case ends there with that log rather than waiting out the time.
    //
    // THE RUN'S FINISH IS NOT CHECKED HERE. A run that declares no submission, of an agent with no work
    // area, is refused its finish (src/server/lib/sealed-tip.ts). The checkout's delivery test hands its runs
    // a submission inside its own server, which an office in a process of its own does not allow.
    const theWorkersLog = (): string => theTextOfEveryRegularFileIn(join(ownData, '.logs'))
    const theStandInSaid = (session: string): string => {
      const said = join(ownData, '.logs', 'runs', session, 'said.txt')
      return existsSync(said) ? readFileSync(said, 'utf8') : ''
    }
    const deadline = Date.now() + 120_000
    let run: { id: string; data: Record<string, unknown> } | undefined
    while (Date.now() < deadline) {
      const log = theWorkersLog()
      if (/ERR_MODULE_NOT_FOUND|Cannot find module/.test(log)) throw new Error(`The bundled worker did not load:\n${log}`)
      const sessions = ((await ask('/api/records?kind=session&limit=1000&shape=full', { at })).body['records'] ?? []) as { id: string; data: Record<string, unknown> }[]
      run = sessions.find((row) => row.data['deliveringMessage'] === messageId)
      if (run !== undefined && theStandInSaid(run.id).includes('"reply"')) break
      await sleep(500)
    }
    expect(run, `no run was started for the message. The worker's log:\n${theWorkersLog()}`).toBeDefined()
    expect(run?.data, JSON.stringify(run?.data)).toMatchObject({ runtime: 'fake', workingDirectory: bundle, startedByMoleOffice: true })
    expect(theStandInSaid(String(run?.id)), `the stand-in did not answer. The worker's log:\n${theWorkersLog()}`).toContain('"reply"')
    // THE RUN READ THE RULES AN INSTALLATION WRITES, in the folder it ran in, the install's root.
    expect(readFileSync(join(bundle, 'AGENTS.md'), 'utf8').startsWith(GENERATED_HEADER_IN_AN_INSTALLATION)).toBe(true)

    const stopped = await theCommand('stop', world)
    expect(stopped.code, stopped.out).toBe(0)
  }, 240_000)

  it('carries a module the server, the worker and the command share once, in a chunk each of them loads', () => {
    const holder = `/${THE_HOLDER_BUNDLE}`
    const waiter = `/${THE_FOR_AGENTS_FOLDER}/hold-the-handle.mjs`
    const guards = THE_GUARDS_BUILT_FILES.map((file) => `/${THE_FOR_AGENTS_FOLDER}/${file}`)
    const programs = everyFileIn(bundle).filter((file) => file.endsWith('.mjs') && !file.startsWith('/node_modules/'))
    const holding = programs.filter((file) => readFileSync(join(bundle, file), 'utf8').includes('function thePerUserDataFolder('))
    // THE HOLDER, THE WAITER'S TOOL AND THE GUARD'S TWO FILES ARE BUILT ALONE, each into one file that imports no chunk
    // (scripts/bundle.mjs). The guard's two are built alone because each must be its own program. What they import is
    // the guard's business and may change, so they are not asked to hold thePerUserDataFolder.
    for (const alone of [holder, waiter]) {
      expect(holding, `${alone} does not hold thePerUserDataFolder, though it is built alone`).toContain(alone)
      expect(theChunksLoadedAtStart(alone), `${alone} imports chunks, though it is built alone to run with nothing beside it`).toEqual([])
    }
    for (const alone of guards) {
      expect(theChunksLoadedAtStart(alone), `${alone} imports chunks, though it is built alone to be its own program`).toEqual([])
    }
    const builtAlone = [holder, waiter, ...guards]
    const inTheSplit = holding.filter((file) => !builtAlone.includes(file))
    expect(inTheSplit, `thePerUserDataFolder is in ${String(inTheSplit.length)} files of the split build, not in one chunk`).toHaveLength(1)
    const [chunk] = inTheSplit
    expect(chunk, `thePerUserDataFolder is in ${String(chunk)}, which is not a chunk`).toMatch(/^\/chunk-[A-Z0-9]+\.mjs$/)
    for (const entry of [THE_SERVER_ENTRY, THE_WORKER_ENTRY, THE_COMMAND_ENTRY] as const) {
      const file = THE_BUNDLES[entry]
      expect(theChunksLoadedAtStart(file), `${file} does not load ${String(chunk)} as it starts`).toContain(chunk)
    }
  })

  it('starts, from each file the split build writes for a program, the program that file is for', () => {
    // THE COMMAND, whose code is in a chunk, because the window imports it too. With no word it says how it is used
    // (main in src/config/the-service-command.mjs).
    const command = spawnSync(process.execPath, [join(bundle, THE_BUNDLES[THE_COMMAND_ENTRY])], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 })
    expect(command.status, `the bundle's command ended with ${String(command.status)}, not with its usage code: ${command.stdout}${command.stderr}`).toBe(EXIT.USAGE)
    expect(command.stderr, "the bundle's command did not say how it is used").toContain('Usage: npm run mole-office <start')

    // THE AGENTS' TOOLS, in for-agents/, which import the chunks one folder up. register-myself.mjs says how it is used
    // and ends with 2; the session hook, handed no payload, says it wrote nothing (src/config/the-hook-run-by-hand.mjs).
    const register = spawnSync(process.execPath, [join(bundle, THE_FOR_AGENTS_FOLDER, 'register-myself.mjs'), '--help'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000 })
    expect(register.status, `the bundle's register-myself.mjs ended with ${String(register.status)}, not 2: ${register.stdout}${register.stderr}`).toBe(2)
    expect(register.stderr, "the bundle's register-myself.mjs did not say how it is used").toContain('node for-agents/register-myself.mjs --handle <handle>')
    const hook = spawnSync(process.execPath, [join(bundle, THE_FOR_AGENTS_FOLDER, THE_SESSION_HOOK)], { cwd: dir, env, encoding: 'utf8', input: '', timeout: 60_000 })
    expect(hook.status, `the bundle's session hook ended with ${String(hook.status)}: ${hook.stdout}${hook.stderr}`).toBe(0)
    expect(hook.stdout.trim(), "the bundle's session hook, handed no payload, did not say it wrote nothing").toBe(theLineOfTheHookRunByHand())
  }, 120_000)

  it('reads the text in a folder while a named pipe beside the files is never opened', () => {
    const folder = join(dir, 'a-folder-with-a-pipe')
    mkdirSync(folder)
    const line = 'this line is in the regular file'
    writeFileSync(join(folder, 'said.txt'), `${line}\n`)
    const pipe = join(folder, 'gate')
    const made = spawnSync('/usr/bin/mkfifo', [pipe])
    expect(made.status, `a named pipe could not be made, so this case cannot show what it needs: ${String(made.error ?? made.stderr)}`).toBe(0)
    // A CHILD KEEPS THE PIPE OPEN FOR WRITING FOR A FEW SECONDS, so a read that opens the pipe returns and the case
    // fails on the time it took rather than waiting for ever. When nothing opens the pipe for reading, its own bound
    // ends it. It is stopped here by the group it was started in, never by name.
    const writer = spawn('/usr/bin/timeout', ['10', '/bin/sh', '-c', 'exec 3>"$1"; sleep 4', 'gate', pipe], { detached: true, stdio: 'ignore' })
    let writerError: Error | undefined
    writer.on('error', (error) => (writerError = error))
    const writerGroup = writer.pid
    if (writerGroup === undefined) throw new Error(`the child that holds the pipe open did not start: ${String(writerError)}`)
    groups.add(writerGroup)
    try {
      const before = Date.now()
      const text = theTextOfEveryRegularFileIn(folder)
      const took = Date.now() - before
      expect(text).toContain(line)
      expect(took, `reading the folder took ${String(took)} ms, so a special file was read`).toBeLessThan(1000)
    } finally {
      try {
        process.kill(-writerGroup, 'SIGKILL')
      } catch (error) {
        // Only a group that is already gone is let pass, because it ended at its own bound.
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
      groups.delete(writerGroup)
    }
  }, 30_000)
})
