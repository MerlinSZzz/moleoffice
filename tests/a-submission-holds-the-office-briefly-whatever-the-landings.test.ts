// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUBMISSION TO THE MERGE QUEUE HOLDS THE OFFICE BRIEFLY, HOWEVER MANY LANDINGS MAIN KEEPS, AND IT STILL FINDS THE
 * SAME WORK AND REFUSES WHAT IT REFUSED.
 *
 * WHAT WENT WRONG. A submission asks, of every entry still waiting in its lane, whether the new commit holds that
 * entry's commits. One way it can hold them is through a landing on main: each landing keeps the replay it was made
 * from, and that replay's patches are compared with the older entry's. Every landing's replay was read again for every
 * waiting entry, about nine git processes per landing, inside the request. With eight entries waiting and about a
 * hundred landings on main, one submission took more than two minutes, and the office answered nobody while it ran.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and a made-up repository of LANDINGS landings:
 *
 *   1. Each of WAITING + 1 submissions made in turn into one lane holds the office for less than
 *      A_SUBMISSION_HOLDS_THE_OFFICE_AT_MOST_MS, and each landing's replay is read at most once for each of the two
 *      kinds of patch the comparison makes, however many entries wait.
 *   2. An entry whose commit has since reached main through another entry's landing is still superseded by a newer
 *      submission, when that landing was read for an earlier submission.
 *   3. A run submitted again on the same seal is still refused as a repeat.
 *   4. The same work is still refused while the older entry is landing.
 *   5. A commit with an attribution line is still refused, naming the commit and the line, and nothing is written.
 *   6. When a kept tip of a landing can no longer be read, the submission still says, for each waiting entry, that it
 *      could not tell whether that entry is the same work, although the landing was read for earlier submissions.
 *
 * The cases run in order on one office and one repository, and the sixth spoils the repository, so it is last.
 * Every repository, commit, run and entry here is made up, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Every git process started while `on` is set, with its arguments, whether the server waits for it or not. Only the
 * submissions are watched.
 */
const seen = vi.hoisted(() => ({ on: false, git: [] as string[][] }))
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const execFileSync = ((file: string, args: readonly string[], options: unknown) => {
    if (seen.on && file === 'git') seen.git.push([...args])
    return (original.execFileSync as (...all: unknown[]) => unknown)(file, args, options)
  }) as typeof original.execFileSync
  const execFile = ((file: string, args: readonly string[], ...rest: unknown[]) => {
    if (seen.on && file === 'git') seen.git.push([...args])
    return (original.execFile as (...all: unknown[]) => unknown)(file, args, ...rest)
  }) as typeof original.execFile
  return { ...original, default: { ...original, execFileSync, execFile }, execFileSync, execFile }
})

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { landingMessage } from '../src/shared/merge/landed-history.mjs'
import { laneOf, MERGE_STATE_SPECS, type MergeState } from '../src/shared/merge-queue.ts'

/** The landings main keeps before the first submission. */
const LANDINGS = 60
/** The entries left waiting in the lane by the first case, one more submission than this being made. */
const WAITING = 4
/**
 * THE LONGEST ONE SUBMISSION MAY HOLD THE OFFICE. Before the change, in two runs on this repository, the five
 * submissions of the first case held it for 23, 1604, 2782, 4177 and 5623 ms, and for 13, 1671, 2871, 4461 and
 * 6508 ms. The hold grew by more than a second with each entry waiting, and only the first was under this bound.
 */
const A_SUBMISSION_HOLDS_THE_OFFICE_AT_MOST_MS = 1_000

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asWorker = as('agent', 'qs-worker')
const asStarter = as('agent', 'qs-starter')
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
  const dir = mkdtempSync(join(process.cwd(), '.logs', `quick-submission-${prefix}-`))
  made.push(dir)
  return dir
}

let repo = ''
let worktree = ''
/** Each landing's commit on main and the replay it keeps, in the order they were made. */
const landings: { name: string; landed: string; replayed: string }[] = []

/**
 * ONE LANDING ON MAIN, MADE AS THE MERGE TOOL MAKES ONE: a replay of `commits` on top of main, kept under refs/keep,
 * and one commit on main with the replay's tree and the landing footer.
 */
function aLanding(name: string, commits: Record<string, string>[]): { landed: string; replayed: string } {
  const main = git(repo, 'rev-parse', 'main')
  const kept = `refs/keep/landed-replay/${name}`
  let stream = ''
  commits.forEach((files, n) => {
    stream += `commit ${kept}\ncommitter Synthetic replay <fixture@example.invalid> ${aMoment()}\n${data(`Synthetic ${name} ${String(n)}`)}${n === 0 ? `from ${main}\n` : ''}`
    for (const [path, text] of Object.entries(files)) stream += `M 100644 inline ${path}\n${data(text)}`
  })
  gitWith(repo, stream, 'fast-import', '--quiet')
  const replayed = git(repo, 'rev-parse', kept)
  const provenance = { entry: `entry-${name}`, run: `run-${name}`, seal: `seal-${name}`, hash: createHash('sha256').update(name).digest('hex'), tip: replayed, replayed }
  const landed = gitWith(repo, landingMessage(`Synthetic landing ${name}`, provenance), 'commit-tree', `${replayed}^{tree}`, '-p', main)
  git(repo, 'update-ref', `refs/keep/landed/${name}`, replayed)
  git(repo, 'update-ref', 'refs/heads/main', landed)
  landings.push({ name, landed, replayed })
  return { landed, replayed }
}

/** A made-up repository: one baseline commit, then LANDINGS landings of three small commits each. */
function buildTheRepository(): void {
  repo = scratch('repo')
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'fixture@example.invalid')
  git(repo, 'config', 'user.name', 'Synthetic quick-submission fixture')
  gitWith(repo, `commit refs/heads/main\ncommitter Synthetic baseline <fixture@example.invalid> ${aMoment()}\n${data('Synthetic baseline')}M 100644 inline base.txt\n${data('baseline\n')}`, 'fast-import', '--quiet')
  for (let j = 0; j < LANDINGS; j += 1) {
    aLanding(`made-up-${String(j)}`, [0, 1, 2].map((c) => ({ [`landed/${String(j)}/file-${String(c)}.txt`]: `made-up landed line ${String(j)}.${String(c)}\n`.repeat(40) })))
  }
  git(repo, 'commit-graph', 'write', '--reachable')
  worktree = join(scratch('worktree'), 'w')
  git(repo, 'worktree', 'add', '-q', '--detach', worktree, 'main')
}

/** A run's own work: branch `name` off main as it stands now, one commit per item of `commits`, inside work/. */
function aBranch(name: string, commits: Record<string, string>[], message = (n: number) => `Synthetic ${name} ${String(n)}`): string {
  git(worktree, 'switch', '-q', '-C', name, 'main')
  commits.forEach((files, n) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(worktree, path, '..'), { recursive: true })
      writeFileSync(join(worktree, path), text)
    }
    git(worktree, 'add', '.')
    git(worktree, 'commit', '-q', '-m', message(n))
  })
  return git(worktree, 'rev-parse', 'HEAD')
}

/** Its own made-up file, inside the worker's work area. */
const itsOwn = (name: string): Record<string, string> => ({ [`work/${name}/own.txt`]: `made-up line of ${name}\n`.repeat(20) })

/** A run of the worker in the worktree, finished so it is sealed on the worktree's HEAD as it stands now. */
async function aSealedRun(): Promise<string> {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic quick-submission run',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'qs-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'qs-worker', cutFrom: 'main', workingDirectory: worktree },
  }).id
  const r = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asWorker, payload: { dataPatch: { state: 'finished' } } })
  expect(r.statusCode, r.body).toBe(200)
  return run
}

interface Submitted { status: number; body: Record<string, any>; holdMs: number; tookMs: number; git: string[][] }

/**
 * SUBMIT A RUN, AND MEASURE THE LONGEST TIME THE OFFICE WAS HELD WHILE IT WAS ANSWERED: a timer asks to run every
 * five milliseconds, and the longest gap between two of its turns is the longest time nothing else could run.
 *
 * WHEN `run` IS A FUNCTION, it is called inside the watched window, so the git processes of its seal's read and of the
 * submission are recorded together. The hold is still measured from the submission alone, after the run is sealed.
 */
async function submit(run: string | (() => Promise<string>), branch: string): Promise<Submitted> {
  seen.git = []
  seen.on = true
  try {
    const runId = typeof run === 'function' ? await run() : run
    let last = performance.now()
    let longest = 0
    const tick = setInterval(() => {
      const now = performance.now()
      longest = Math.max(longest, now - last)
      last = now
    }, 5)
    const started = performance.now()
    try {
      const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: asWorker, payload: { run: runId, changeset: { adapter: 'git', repository: 'qs-main', branch } } })
      const ended = performance.now()
      longest = Math.max(longest, ended - last)
      return { status: r.statusCode, body: r.json() as Record<string, any>, holdMs: Math.round(longest), tookMs: Math.round(ended - started), git: seen.git }
    } finally {
      clearInterval(tick)
    }
  } finally {
    seen.on = false
  }
}

function theEntries(): { id: string; state: MergeState }[] {
  const ids = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'merge_entry' AND deleted_at IS NULL").all() as { id: string }[]
  return ids.map(({ id }) => ({ id, state: t.api.getRecord(id)!.data['state'] as MergeState }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = async (by: Record<string, string>, handle: string, workArea?: string[]) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: `Synthetic ${handle}`, ...(workArea === undefined ? {} : { workArea }) } })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, 'qs-starter')
  await started(asStarter, 'qs-worker', ['work'])
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: 'default', name: 'qs-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
  buildTheRepository()
}, 240_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('a submission against a long history of landings', () => {
  it('1: holds the office briefly at each submission, and reads each landing once, while entries wait', async () => {
    const measured: { waiting: number; holdMs: number; tookMs: number; gitRuns: number }[] = []
    const reads = new Map<string, number>()
    const replayed = new Set(landings.map((one) => one.replayed))
    for (let n = 0; n <= WAITING; n += 1) {
      const branch = `made-up-waiting-${String(n)}`
      aBranch(branch, [itsOwn(branch), { [`work/${branch}/more.txt`]: `another made-up line of ${branch}\n`.repeat(20) }])
      const submitted = await submit(() => aSealedRun(), branch)
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(201)
      expect(submitted.body['superseded']).toEqual([])
      measured.push({ waiting: n, holdMs: submitted.holdMs, tookMs: submitted.tookMs, gitRuns: submitted.git.length })
      // EACH READ OF A LANDING'S REPLAY starts with the point where the replay left main: merge-base <parent> <replayed>.
      for (const args of submitted.git) {
        const at = args.indexOf('merge-base')
        const tip = at < 0 || args[at + 1] === '--is-ancestor' ? undefined : args[at + 2]
        if (tip !== undefined && replayed.has(tip)) reads.set(tip, (reads.get(tip) ?? 0) + 1)
      }
    }
    const said = JSON.stringify(measured)
    expect(reads.size, `no landing was compared, so nothing here was proved: ${said}`).toBe(LANDINGS)
    for (const one of measured) expect(one.holdMs, said).toBeLessThan(A_SUBMISSION_HOLDS_THE_OFFICE_AT_MOST_MS)
    expect(Math.max(...reads.values()), `each landing is read once for each kind of patch: ${said}`).toBeLessThanOrEqual(2)
  }, 240_000)

  let newer = { run: '', entry: '' }

  it('2: still supersedes an entry whose commit reached main through a landing that was read before', async () => {
    const own = itsOwn('made-up-earlier')
    aBranch('made-up-earlier', [own])
    const earlierRun = await aSealedRun()
    // THE SAME CHANGE REACHES MAIN through another entry's landing, after the earlier run was sealed.
    const carried = aLanding('made-up-carried', [own])
    // A SUBMISSION CUT AFTER THAT LANDING, while entries wait, has the landing read now.
    aBranch('made-up-reader', [itsOwn('made-up-reader')])
    const reader = await submit(await aSealedRun(), 'made-up-reader')
    expect(reader.status, JSON.stringify(reader.body)).toBe(201)
    expect(reader.body['superseded']).toEqual([])
    expect(reader.git.some((args) => args.includes(carried.replayed)), 'the landing was not read before the earlier entry was submitted').toBe(true)
    const earlier = await submit(earlierRun, 'made-up-earlier')
    expect(earlier.status, JSON.stringify(earlier.body)).toBe(201)
    expect(earlier.body['superseded']).toEqual([])
    // A NEWER SUBMISSION CUT AFTER THE LANDING holds the earlier commit as the landing's replay holds it.
    aBranch('made-up-newer', [itsOwn('made-up-newer')])
    const newerRun = await aSealedRun()
    const submitted = await submit(newerRun, 'made-up-newer')
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201)
    const earlierEntry = String(earlier.body['entry']['id'])
    expect(submitted.body['superseded']).toEqual([earlierEntry])
    const superseded = t.api.getRecord(earlierEntry)!.data
    expect(superseded['state']).toBe('superseded')
    expect(String((superseded['superseded'] as { because: string }).because)).toContain('each commit of the older entry is in it as a commit with the same patch')
    newer = { run: newerRun, entry: String(submitted.body['entry']['id']) }
  }, 120_000)

  it('3: still refuses a run submitted again on the same seal', async () => {
    const before = theEntries().length
    const again = await submit(newer.run, 'made-up-newer')
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(String(again.body['error'])).toMatch(new RegExp(`^Merge entry ${newer.entry} already carries exactly this, and it is .+\\. Nothing was written\\.$`, 'u'))
    expect(theEntries().length).toBe(before)
  }, 60_000)

  it('4: still refuses the same work while the older entry is landing', async () => {
    const door = await import('../src/server/lib/merge-entry-door.ts')
    // A LANDING ENTRY HOLDS ITS LANE, as the queue's state writer leaves it.
    const held = t.api.getRecord(newer.entry)!.data
    const occupies = laneOf(held['changeset'] as { root: string }, held['documents'])
    door.asTheMergeQueue(() => t.api.patchRecord(newer.entry, { dataPatch: { state: 'landing', occupies } }, { type: 'agent', id: 'mole-office/the-merge-tool' }))
    expect(t.api.getRecord(newer.entry)!.data['state']).toBe('landing')
    git(worktree, 'switch', '-q', 'made-up-newer')
    writeFileSync(join(worktree, 'work', 'made-up-newer', 'later.txt'), 'a later made-up line\n')
    git(worktree, 'add', '.')
    git(worktree, 'commit', '-q', '-m', 'Synthetic later commit on the newer branch')
    const before = theEntries().length
    const refused = await submit(await aSealedRun(), 'made-up-newer')
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(String(refused.body['error'])).toMatch(
      new RegExp(`^Merge entry ${newer.entry} is the same work and it is .+, so it can no longer be superseded\\. Submit again once it has landed or bounced\\. Nothing was written\\.$`, 'u'),
    )
    expect(theEntries().length).toBe(before)
  }, 60_000)

  it('5: still refuses a commit with an attribution line, naming the commit and the line', async () => {
    const line = 'Co-Authored-By: A made-up helper <helper@example.invalid>'
    const credited = aBranch('made-up-credited', [itsOwn('made-up-credited')], () => `Synthetic credited commit\n\n${line}`)
    const before = theEntries().length
    const refused = await submit(await aSealedRun(), 'made-up-credited')
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    const says = String(refused.body['error'])
    expect(says).toContain(`Commit ${credited.slice(0, 12)} ("Synthetic credited commit") has the line "${line}".`)
    expect(says).toMatch(/^A commit of this work carries an attribution line, and no commit that reaches main may carry one\. /u)
    expect(says.endsWith('Nothing was written.')).toBe(true)
    expect(theEntries().length).toBe(before)
  }, 60_000)

  it('6: still says it could not tell, for each waiting entry, when a kept tip of a landing that was read before is gone', async () => {
    const lost = landings[7]!
    git(repo, 'update-ref', '-d', `refs/keep/landed-replay/${lost.name}`)
    git(repo, 'update-ref', '-d', `refs/keep/landed/${lost.name}`)
    git(repo, 'gc', '--quiet', '--prune=now')
    expect(() => git(repo, 'cat-file', '-e', `${lost.replayed}^{commit}`), 'the kept tip is still there, so nothing here was proved').toThrow()
    const waiting = theEntries().filter((one) => !MERGE_STATE_SPECS[one.state].final)
    expect(waiting.length).toBeGreaterThan(WAITING)
    aBranch('made-up-after-the-loss', [itsOwn('made-up-after-the-loss')])
    const submitted = await submit(await aSealedRun(), 'made-up-after-the-loss')
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201)
    expect(submitted.body['superseded']).toEqual([])
    const couldNotTell = (submitted.body['interpreted'] as string[]).filter((one) => one.startsWith('Mole Office could not tell whether merge entry '))
    expect(couldNotTell.map((one) => /^Mole Office could not tell whether merge entry (\S+) is the same work/u.exec(one)?.[1]).sort()).toEqual(waiting.map((one) => one.id).sort())
    for (const one of couldNotTell) expect(one).toContain(`Landing ${lost.landed} cannot read its retained tip ${lost.replayed}`)
  }, 120_000)
})
