// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHILE A SUBMISSION READS THE LANDINGS ON MAIN FOR THE FIRST TIME, THE OFFICE GOES ON ANSWERING OTHER REQUESTS.
 *
 * WHAT WENT WRONG. Before a submission is judged, the door reads the patches of every landing on main that are not kept
 * yet (src/server/lib/merge-queue-same-work.ts). After a restart none is kept, so the first submission reads them all.
 * It read them with git processes that held the server's thread while they ran, one landing at a time, so a request
 * that came in meanwhile waited for the read in front of it to end.
 *
 * WHAT IS PROVED HERE, against a real database, the real server listening on a port of its own, and a made-up
 * repository of LANDINGS landings: while the landings the first seal after the server started began reading are still
 * being read, a request sent from another thread is answered within ANOTHER_REQUEST_IS_ANSWERED_WITHIN_MS, every time.
 * The submission is still queued, and each slow landing is read once for each of the two kinds of patch.
 *
 * A MADE-UP SLOW GIT. Git reads this small made-up repository in a few milliseconds, so a read that held the thread
 * would hardly show. For the case, a script named git is put first on the PATH. When one of its arguments is the
 * replayed commit of one of the SLOW_LANDINGS landings, it notes the read and waits A_SLOW_READ_WAITS_MS; then it runs
 * the real git with the same arguments. It stands for a slow read of a large repository, and it makes no load.
 *
 * THE ASYNC GIT READ. The second case shows that `readGitAsync`, which the landings read uses, reads what `readGit` reads,
 * refuses a command outside `GIT_READS` with `readGit`'s words and starts no git, and fails as `readGit` fails.
 *
 * Every repository, commit, run and entry here is made up, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { delimiter, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { landingMessage } from '../src/shared/merge/landed-history.mjs'

/** The landings main keeps. */
const LANDINGS = 12
/** Which of them the made-up git reads slowly. */
const SLOW_LANDINGS = [3, 8]
/** How long the made-up git waits before each read of a slow landing's replay. */
const A_SLOW_READ_WAITS_MS = 1_000
/**
 * THE LONGEST A REQUEST MAY WAIT WHILE THE LANDINGS ARE READ: half of A_SLOW_READ_WAITS_MS. A slow read on the
 * server's thread holds it for the whole wait, so a request that arrives meanwhile waits for what is left of it. A
 * request that meets no read on the thread is answered here in a few milliseconds, and the judging of a submission,
 * which still reads git on the thread, held the office for 13 to 23 ms with nothing waiting in round 146's measures
 * (tests/a-submission-holds-the-office-briefly-whatever-the-landings.test.ts). Half the wait leaves room for a busy
 * machine above the one and stays clearly below the other.
 */
const ANOTHER_REQUEST_IS_ANSWERED_WITHIN_MS = 500
/** How long the other thread waits between one answer and its next request. */
const A_REQUEST_EVERY_MS = 50

let t: TestDb
let app: FastifyInstance
let address = ''
const made: string[] = []
const PATH = process.env['PATH'] ?? ''

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'cl-worker')
const asStarter = as('agent', 'cl-starter')
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)

/** The made-up commits' times: each one a second after the one before, so git's walks meet them in order. */
let stamp = Math.floor(Date.now() / 1000) - 100_000
const aMoment = (): string => {
  stamp += 1
  return `${String(stamp)} +0000`
}
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}
function gitWith(dir: string, input: string, ...args: string[]): string {
  const at = aMoment()
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', input, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } }).trim()
}
const data = (text: string): string => `data ${String(Buffer.byteLength(text))}\n${text}\n`

function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `cold-landings-${prefix}-`))
  made.push(dir)
  return dir
}

let repo = ''
let worktree = ''
/** Each landing's replayed commit, in the order they were made. */
const replayed: string[] = []

/** ONE LANDING ON MAIN, MADE AS THE MERGE TOOL MAKES ONE: a replay kept under refs/keep, and a commit on main with its tree and the landing footer. */
function aLanding(name: string, commits: Record<string, string>[]): void {
  const main = git(repo, 'rev-parse', 'main')
  const kept = `refs/keep/landed-replay/${name}`
  let stream = ''
  commits.forEach((files, n) => {
    stream += `commit ${kept}\ncommitter Synthetic replay <fixture@example.invalid> ${aMoment()}\n${data(`Synthetic ${name} ${String(n)}`)}${n === 0 ? `from ${main}\n` : ''}`
    for (const [path, text] of Object.entries(files)) stream += `M 100644 inline ${path}\n${data(text)}`
  })
  gitWith(repo, stream, 'fast-import', '--quiet')
  const tip = git(repo, 'rev-parse', kept)
  const provenance = { entry: `entry-${name}`, run: `run-${name}`, seal: `seal-${name}`, hash: createHash('sha256').update(name).digest('hex'), tip, replayed: tip }
  const landed = gitWith(repo, landingMessage(`Synthetic landing ${name}`, provenance), 'commit-tree', `${tip}^{tree}`, '-p', main)
  git(repo, 'update-ref', `refs/keep/landed/${name}`, tip)
  git(repo, 'update-ref', 'refs/heads/main', landed)
  replayed.push(tip)
}

/** A run's own work: branch `name` off main, one commit inside work/. */
function aBranch(name: string): void {
  git(worktree, 'switch', '-q', '-C', name, 'main')
  mkdirSync(join(worktree, 'work', name), { recursive: true })
  writeFileSync(join(worktree, 'work', name, 'own.txt'), `made-up line of ${name}\n`.repeat(20))
  git(worktree, 'add', '.')
  git(worktree, 'commit', '-q', '-m', `Synthetic ${name}`)
}

/** A run of the worker in the worktree, finished so it is sealed on the worktree's HEAD as it stands now. */
async function aSealedRun(): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic cold-landings run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'cl-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'cl-worker', cutFrom: 'main', workingDirectory: worktree },
  }).id
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

const submit = (run: string, branch: string) =>
  app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository: 'cl-main', branch } } })

/** THE MADE-UP SLOW GIT, put first on the PATH. Returns the file it notes each slow read in. */
function theSlowGit(): string {
  const real = PATH.split(delimiter).map((dir) => join(dir, 'git')).find((file) => existsSync(file))
  if (real === undefined) throw new Error('No git was found on the PATH, so the made-up slow git has nothing to run.')
  const bin = scratch('bin')
  const noted = join(bin, 'slow-reads.txt')
  writeFileSync(noted, '')
  const slow = SLOW_LANDINGS.map((n) => replayed[n]!).join('|')
  writeFileSync(join(bin, 'git'), [
    '#!/bin/sh',
    '# A made-up slow git for one test: it waits before a read that names a slow landing\'s replay, then runs the real git.',
    'for arg in "$@"; do',
    `  case "$arg" in ${slow}) printf '%s\\n' "$*" >> '${noted}'; sleep ${String(A_SLOW_READ_WAITS_MS / 1000)}; break ;; esac`,
    'done',
    `exec '${real}' "$@"`,
    '',
  ].join('\n'))
  chmodSync(join(bin, 'git'), 0o755)
  process.env['PATH'] = `${bin}${delimiter}${PATH}`
  return noted
}

interface AnAnswer { sentAt: number; ms: number; status: number; error?: string }

/** ANOTHER THREAD THAT ASKS THE OFFICE FOR `url` OVER ITS PORT, one request at a time, until it is told to stop. */
function anotherAsker(url: string, headers: Record<string, string>): { stop: () => Promise<AnAnswer[]> } {
  const worker = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads')
    let stopping = false
    const answered = []
    parentPort.once('message', () => { stopping = true })
    ;(async () => {
      while (!stopping) {
        const sentAt = performance.timeOrigin + performance.now()
        try {
          const r = await fetch(workerData.url, { headers: workerData.headers })
          await r.arrayBuffer()
          answered.push({ sentAt, ms: performance.timeOrigin + performance.now() - sentAt, status: r.status })
        } catch (error) {
          answered.push({ sentAt, ms: performance.timeOrigin + performance.now() - sentAt, status: 0, error: String(error) })
        }
        await new Promise((resolve) => setTimeout(resolve, workerData.everyMs))
      }
      parentPort.postMessage(answered)
    })()
    `,
    { eval: true, workerData: { url, headers, everyMs: A_REQUEST_EVERY_MS } },
  )
  return {
    stop: async () => {
      worker.postMessage('stop')
      const [answered] = (await once(worker, 'message')) as [AnAnswer[]]
      await worker.terminate()
      return answered
    },
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'cl-starter')
  await started(asStarter, 'cl-worker', ['work'])
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'cl-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  repo = scratch('repo')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'fixture@example.invalid')
  git(repo, 'config', 'user.name', 'Synthetic cold-landings fixture')
  gitWith(repo, `commit refs/heads/main\ncommitter Synthetic baseline <fixture@example.invalid> ${aMoment()}\n${data('Synthetic baseline')}M 100644 inline base.txt\n${data('baseline\n')}`, 'fast-import', '--quiet')
  for (let j = 0; j < LANDINGS; j += 1) {
    aLanding(`made-up-${String(j)}`, [0, 1, 2].map((c) => ({ [`landed/${String(j)}/file-${String(c)}.txt`]: `made-up landed line ${String(j)}.${String(c)}\n`.repeat(40) })))
  }
  worktree = join(scratch('worktree'), 'w')
  git(repo, 'worktree', 'add', '-q', '--detach', worktree, 'main')
  await app.listen({ host: '127.0.0.1', port: 0 })
  address = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 240_000)

afterAll(async () => {
  process.env['PATH'] = PATH
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('a cold read of the landings', () => {
  it('leaves the office answering another request within the bound, every time', async () => {
    // THE SLOW GIT GOES FIRST: the first seal after the server started is the one whose read is cold, so the slow git
    // has to be on the PATH when that seal starts the read, or the case never sees a slow read at all.
    const noted = theSlowGit()
    // AN ENTRY WAITS, so the next submission compares the landings. This one compares none, so it reads and keeps none.
    aBranch('made-up-waiting')
    const waiting = await submit(await aSealedRun(), 'made-up-waiting')
    expect(waiting.statusCode, waiting.body).toBe(201)
    aBranch('made-up-cold')
    const run = await aSealedRun()

    const asker = anotherAsker(`${address}/api/records/${run}`, asPerson)
    const startedAt = performance.timeOrigin + performance.now()
    let submitted: Awaited<ReturnType<typeof submit>>
    let endedAt: number
    let answered: AnAnswer[]
    try {
      submitted = await submit(run, 'made-up-cold')
      endedAt = performance.timeOrigin + performance.now()
    } finally {
      answered = await asker.stop()
      process.env['PATH'] = PATH
    }
    expect(submitted.statusCode, submitted.body).toBe(201)

    const slowReads = readFileSync(noted, 'utf8').split('\n').filter(Boolean)
    expect(slowReads.length, `each slow landing is read once for each kind of patch, and nothing here was proved otherwise: ${JSON.stringify(slowReads)}`).toBe(SLOW_LANDINGS.length * 2)
    const meanwhile = answered.filter((one) => one.sentAt >= startedAt && one.sentAt <= endedAt)
    const said = JSON.stringify({ tookMs: Math.round(endedAt - startedAt), answers: answered.map((one) => ({ ...one, sentAt: Math.round(one.sentAt - startedAt), ms: Math.round(one.ms) })) })
    expect(meanwhile.length, `too few requests were sent while the landings were read: ${said}`).toBeGreaterThanOrEqual(3)
    for (const one of answered) {
      expect(one.status, said).toBe(200)
      expect(one.ms, said).toBeLessThan(ANOTHER_REQUEST_IS_ANSWERED_WITHIN_MS)
    }
  }, 120_000)
})

/** `readGitAsync` in src/server/lib/resources.ts, as the landings read calls it. */
type AnAsyncGitRead = (directory: string, args: string[], options?: { input?: string }) => Promise<Buffer>

describe('the git read the landings read uses', () => {
  it("reads what readGit reads, refuses a command outside the list with readGit's words, and fails as readGit fails", async () => {
    const resources = await import('../src/server/lib/resources.ts')
    const { GIT_READS, readGit, whyGitDidNotAnswer } = resources
    const readGitAsync = Reflect.get(resources, 'readGitAsync') as AnAsyncGitRead
    // THE SAME READ, with and without input.
    expect((await readGitAsync(repo, ['rev-parse', 'main'])).toString('utf8')).toBe(readGit(repo, ['rev-parse', 'main']).toString('utf8'))
    const asked = `${replayed.join('\n')}\n`
    expect((await readGitAsync(repo, ['cat-file', '--batch-check'], { input: asked })).toString('utf8')).toBe(readGit(repo, ['cat-file', '--batch-check'], { input: asked }).toString('utf8'))
    // A COMMAND OUTSIDE THE LIST. `git config` would write to the made-up repository, so the proof that no git started is
    // that the setting is not there afterwards.
    expect(GIT_READS).not.toContain('config')
    const writes = ['config', '--local', 'made-up.written', 'yes']
    let bySync = 'not refused'
    try {
      readGit(repo, writes)
    } catch (error) {
      bySync = String(error)
    }
    const byAsync = await readGitAsync(repo, writes).then(() => 'not refused', (error: unknown) => String(error))
    expect(bySync).toMatch(/^Error: git "config" was not started, because the office's git reader runs only /u)
    expect(byAsync).toBe(bySync)
    expect(() => git(repo, 'config', '--local', '--get', 'made-up.written'), 'git ran and wrote the setting').toThrow()
    // A READ THAT FAILS is said the same way.
    const missing = ['rev-parse', '--verify', '--quiet', 'refs/heads/made-up-missing']
    let failedSync = 'answered'
    try {
      readGit(repo, missing)
    } catch (error) {
      failedSync = whyGitDidNotAnswer(error)
    }
    const failedAsync = await readGitAsync(repo, missing).then(() => 'answered', (error: unknown) => whyGitDidNotAnswer(error))
    expect(failedSync).toMatch(/^git exited 1/u)
    expect(failedAsync).toBe(failedSync)
  }, 60_000)
})
