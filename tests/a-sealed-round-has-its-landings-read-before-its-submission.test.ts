// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEALED ROUND STARTS THE READ OF ITS LANDINGS, AND A SUBMISSION WAITS ONLY FOR WHAT IS STILL NOT READ.
 *
 * WHAT WENT WRONG. Before a submission is judged, the door reads the patches of every landing on main that are not kept
 * yet (src/server/lib/merge-queue-same-work.ts). After a restart none is kept, so the first submission reads them all,
 * one landing and kind at a time, and the submit waits for the whole read. The run's seal already named the repository
 * and the commit that read is below.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and made-up repositories of LANDINGS landings:
 *
 *   a. A SEAL STARTS THE READ. A run is sealed through the record door and no submission is sent. Within
 *      THE_SEAL_HAS_READ_THE_SLOW_LANDINGS_WITHIN_MS the made-up git has read each slow landing's replayed commit once
 *      for each of the two kinds of patch. The submission sent after that is queued, and the made-up git reads no slow
 *      landing's replay again while it runs.
 *   b. ONE READ AT A TIME. A run is sealed and its submission is sent straight after, while the seal's read is still
 *      under way. The submission is queued, and over the seal and the submission together the made-up git read each
 *      slow landing's replay exactly once for each kind of patch.
 *   c. ONE READ WHILE SEVERAL ASKS WAIT. A run is sealed and two submissions of it are sent at once while the seal's
 *      read is under way. The made-up git fails the seal's first read of the later slow landing once, so the seal's read
 *      stops there and the rest is left to the two submissions. At least one submission is queued, and the other is
 *      queued or refused as a repeat. Over the seal and both submissions, each slow landing's replay is read exactly
 *      once for each kind of patch.
 *
 * A MADE-UP SLOW GIT. Git reads these small made-up repositories in a few milliseconds, so a read would hardly show.
 * A script named git is put first on the PATH. When one of its arguments is the replayed commit of one of the slow
 * landings, it notes the read in a file and waits A_SLOW_READ_WAITS_MS; then it runs the real git with the same
 * arguments. Each kind of patch starts one such read per slow landing, so a landing read for both kinds is noted twice.
 * In case c one read fails once, and that failed read is not noted.
 *
 * EACH CASE HAS ITS OWN REPOSITORY, so a landing read for one case is not already kept when the next begins. The
 * waiting entry every submission finds is in a repository of its own, so its seal reads no landing of a case.
 *
 * Every repository, commit, run and entry here is made up, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { landingMessage } from '../src/shared/merge/landed-history.mjs'

/** The landings each case's repository keeps. */
const LANDINGS = 12
/** Which of them the made-up git reads slowly; one is early in the read and one is late. */
const SLOW_LANDINGS = [3, 8]
/** How long the made-up git waits before each read of a slow landing's replay. */
const A_SLOW_READ_WAITS_MS = 1_000
/**
 * HOW LONG CASE a WAITS FOR THE SEAL TO HAVE READ EACH SLOW LANDING'S REPLAY FOR BOTH KINDS OF PATCH, in milliseconds.
 * Four slow reads of 1,000 ms are four seconds on their own. The rest of a twelve-landing cold read is 75 git processes
 * (3 for the list and 6 for each landing), which the measure on this sandbox saw start 2,247 of in 32,973 ms for 374
 * landings. A minute leaves room for a busier machine, and a case where nothing reads at the seal still fails well
 * inside its own limit.
 */
export const THE_SEAL_HAS_READ_THE_SLOW_LANDINGS_WITHIN_MS = 60_000

let t: TestDb
let app: FastifyInstance
const made: string[] = []
const PATH = process.env['PATH'] ?? ''

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'sl-worker')
const asStarter = as('agent', 'sl-starter')
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
  const dir = mkdtempSync(join(process.cwd(), '.logs', `sealed-landings-${prefix}-`))
  made.push(dir)
  return dir
}

/** ONE LANDING ON MAIN, MADE AS THE MERGE TOOL MAKES ONE: a replay kept under refs/keep, and a commit on main with its tree and the landing footer. */
function aLanding(repo: string, name: string, commits: Record<string, string>[]): string {
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
  return tip
}

/** A made-up repository with `landings` landings on main, and a worktree of it where a run's work is made. */
function aRepository(name: string, landings: number): { name: string; repo: string; worktree: string; slow: string[] } {
  const repo = scratch(`${name}-repo`)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'fixture@example.invalid')
  git(repo, 'config', 'user.name', 'Synthetic landings-at-the-seal fixture')
  gitWith(repo, `commit refs/heads/main\ncommitter Synthetic baseline <fixture@example.invalid> ${aMoment()}\n${data('Synthetic baseline')}M 100644 inline base.txt\n${data('baseline\n')}`, 'fast-import', '--quiet')
  const slow: string[] = []
  for (let j = 0; j < landings; j += 1) {
    const replayed = aLanding(repo, `made-up-${name}-${String(j)}`, [0, 1, 2].map((c) => ({ [`landed/${String(j)}/file-${String(c)}.txt`]: `made-up landed line ${String(j)}.${String(c)}\n`.repeat(40) })))
    if (SLOW_LANDINGS.includes(j)) slow.push(replayed)
  }
  const worktree = join(scratch(`${name}-worktree`), 'w')
  git(repo, 'worktree', 'add', '-q', '--detach', worktree, 'main')
  return { name, repo, worktree, slow }
}

/** A run's own work: branch `name` off main as it stands now, one commit inside work/. */
function aBranch(worktree: string, name: string): void {
  git(worktree, 'switch', '-q', '-C', name, 'main')
  mkdirSync(join(worktree, 'work', name), { recursive: true })
  writeFileSync(join(worktree, 'work', name, 'own.txt'), `made-up line of ${name}\n`.repeat(20))
  git(worktree, 'add', '.')
  git(worktree, 'commit', '-q', '-m', `Synthetic ${name}`)
}

/** A run of the worker in `worktree`, finished so it is sealed on that worktree's HEAD as it stands now. */
async function aSealedRun(worktree: string): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic sealed-landings run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'sl-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'sl-worker', cutFrom: 'main', workingDirectory: worktree },
  }).id
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

const submit = (repository: string, run: string, branch: string) =>
  app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run, changeset: { adapter: 'git', repository, branch } } })

/**
 * THE MADE-UP SLOW GIT, put first on the PATH. Returns the file it notes each slow read in. A read of `failsOnceOn`
 * fails instead, without being noted, while the marker file `failOnce` is there; the first such read removes it, so the
 * failure happens once.
 */
function theSlowGit(slow: string[], failsOnceOn: string): string {
  const real = PATH.split(delimiter).map((dir) => join(dir, 'git')).find((file) => existsSync(file))
  if (real === undefined) throw new Error('No git was found on the PATH, so the made-up slow git has nothing to run.')
  const bin = scratch('bin')
  const noted = join(bin, 'slow-reads.txt')
  failOnce = join(bin, 'fail-once')
  writeFileSync(noted, '')
  const names = slow.join('|')
  writeFileSync(join(bin, 'git'), [
    '#!/bin/sh',
    '# A made-up slow git for one test: it notes and waits before a read that names a slow landing\'s replay, then runs the real git.',
    'for arg in "$@"; do',
    '  case "$arg" in',
    `    ${failsOnceOn})`,
    `      if [ -f '${failOnce}' ]; then rm -f '${failOnce}'; exit 1; fi`,
    `      printf '%s\\n' "$*" >> '${noted}'; sleep ${String(A_SLOW_READ_WAITS_MS / 1000)}; break ;;`,
    `    ${names})`,
    `      printf '%s\\n' "$*" >> '${noted}'; sleep ${String(A_SLOW_READ_WAITS_MS / 1000)}; break ;;`,
    '  esac',
    'done',
    `exec '${real}' "$@"`,
    '',
  ].join('\n'))
  chmodSync(join(bin, 'git'), 0o755)
  process.env['PATH'] = `${bin}${delimiter}${PATH}`
  return noted
}

let noted = ''
/** The marker the made-up git removes to fail one read of the later slow landing. */
let failOnce = ''
/** How many times the made-up git noted a read of each replay, in the order of `slow`. */
function slowReads(slow: string[]): number[] {
  const lines = readFileSync(noted, 'utf8').split('\n').filter(Boolean)
  return slow.map((replayed) => lines.filter((line) => line.includes(replayed)).length)
}

/** Wait until `yes`, or until `withinMs` has passed. Returns whether `yes` held at the end. */
async function until(yes: () => boolean, withinMs: number): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (!yes() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25))
  return yes()
}

let waiting: { name: string; repo: string; worktree: string; slow: string[] }
let first: { name: string; repo: string; worktree: string; slow: string[] }
let second: { name: string; repo: string; worktree: string; slow: string[] }
let third: { name: string; repo: string; worktree: string; slow: string[] }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'sl-starter')
  await started(asStarter, 'sl-worker', ['work'])
  // THE WAITING ENTRY'S REPOSITORY KEEPS NO LANDING, so its seal starts no read of either case's landings.
  waiting = aRepository('waiting', 0)
  first = aRepository('first', LANDINGS)
  second = aRepository('second', LANDINGS)
  third = aRepository('third', LANDINGS)
  const repositories = await import('../src/server/lib/repositories.ts')
  for (const one of [waiting, first, second, third]) {
    repositories.registerRepository({ workspaceId: 'default', name: one.name, root: realpathSync(one.repo), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  }
  // AN ENTRY WAITS, so a later submission compares the landings and the door reads them.
  aBranch(waiting.worktree, 'made-up-waiting')
  const entry = await submit(waiting.name, await aSealedRun(waiting.worktree), 'made-up-waiting')
  expect(entry.statusCode, entry.body).toBe(201)
  noted = theSlowGit([...first.slow, ...second.slow, ...third.slow], third.slow[0]!)
}, 240_000)

afterAll(async () => {
  process.env['PATH'] = PATH
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('a sealed round and the landings it reads', () => {
  it('a: the seal has read each slow landing before a submission is sent, and the submission reads none again', async () => {
    aBranch(first.worktree, 'made-up-first')
    const run = await aSealedRun(first.worktree)
    const read = await until(() => slowReads(first.slow).every((count) => count >= 2), THE_SEAL_HAS_READ_THE_SLOW_LANDINGS_WITHIN_MS)
    expect(read, `the seal did not read both kinds of each slow landing: ${JSON.stringify(slowReads(first.slow))}`).toBe(true)
    expect(slowReads(first.slow), 'each slow landing is read once for each kind of patch').toEqual(first.slow.map(() => 2))

    const beforeSubmission = readFileSync(noted, 'utf8').split('\n').filter(Boolean).length
    const submitted = await submit(first.name, run, 'made-up-first')
    expect(submitted.statusCode, submitted.body).toBe(201)
    expect(readFileSync(noted, 'utf8').split('\n').filter(Boolean).length, 'the submission read a slow landing again').toBe(beforeSubmission)
  }, 180_000)

  it('b: a submission sent while the seal reads waits for that read, and no slow landing is read twice', async () => {
    aBranch(second.worktree, 'made-up-second')
    const run = await aSealedRun(second.worktree)
    const submitted = await submit(second.name, run, 'made-up-second')
    expect(submitted.statusCode, submitted.body).toBe(201)
    expect(slowReads(second.slow), 'each slow landing is read exactly once for each kind of patch, over the seal and the submission').toEqual(second.slow.map(() => 2))
  }, 120_000)

  it('c: two submissions sent at once while the seal reads wait for one read, not one each', async () => {
    aBranch(third.worktree, 'made-up-third')
    // THE SEAL'S READ FAILS ONCE at the later slow landing, so it stops there and leaves the rest to the submissions.
    writeFileSync(failOnce, 'fail the next read of the later slow landing once\n')
    const run = await aSealedRun(third.worktree)
    const [one, two] = await Promise.all([submit(third.name, run, 'made-up-third'), submit(third.name, run, 'made-up-third')])
    // EACH SUBMISSION IS ANSWERED: at least one queues, and the other either queues too or is refused as a repeat.
    const statuses = [one.statusCode, two.statusCode]
    expect(statuses.filter((status) => status === 201).length, `at least one submission is queued: ${JSON.stringify(statuses)}`).toBeGreaterThanOrEqual(1)
    for (const status of statuses) expect([201, 409], `each submission is answered as queued or refused as a repeat: ${JSON.stringify(statuses)}`).toContain(status)
    // ONE READ AT A TIME: the first slow landing is read for both kinds, then the seal's read fails on the later one
    // before either kind, which the first submission that reads the rest reads for both kinds; the other waits for it.
    expect(slowReads(third.slow), `one read at a time leaves each slow landing read once for each kind: ${JSON.stringify(slowReads(third.slow))}`).toEqual(third.slow.map(() => 2))
  }, 120_000)
})
