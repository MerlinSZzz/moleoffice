// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISH'S GIT READ ON THE SEAL-READ THREAD IS THE SYNCHRONOUS READ (src/server/lib/the-seal-read-apart-thread.ts).
 *
 *   1. The seal the thread reads is the one `theGitOfASeal` reads on the request thread, byte for byte.
 *   2. For each kind of tree a seal refuses, the thread carries the same refusal, with every field, and the facts the
 *      reminder reads are the synchronous ones: a tracked file edited, a file not tracked, a file under a filter, and a
 *      folder git cannot read.
 *   3. A reading of the facts from one start answers another start only when the run's first own commit is the same,
 *      and then it is the synchronous reading of the other start.
 *   4. The stamp never throws: a path that went, a folder that cannot be read, a folder that became a file and a file
 *      that became a broken symlink each change it, and a stamp of a folder git cannot read says why it was not made.
 *   5. A thread stopped during a read refuses with 503, and nothing is read on the request thread instead.
 *
 * Every repository is made here in the system's temporary folder.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { aGitThatWaits, aRepository, git, type AGitThatWaits } from './a-seal-read-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let scratch = ''
let directory = ''
let held: AGitThatWaits
let t: TestDb
let app: FastifyInstance
let apart: typeof import('../src/server/lib/the-seal-read-apart.ts')
let seal: typeof import('../src/server/lib/sealed-tip.ts')
let facts: typeof import('../src/server/lib/before-the-seal.ts')
let stamps: typeof import('../src/server/lib/a-worktree-stamp.ts')
let trees = 0

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'finish-capture-'))
  held = aGitThatWaits(scratch)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  apart = await import('../src/server/lib/the-seal-read-apart.ts')
  seal = await import('../src/server/lib/sealed-tip.ts')
  facts = await import('../src/server/lib/before-the-seal.ts')
  stamps = await import('../src/server/lib/a-worktree-stamp.ts')
  directory = aWorkTree()
}, 60_000)

afterEach(() => {
  // EACH CASE LEAVES THE TREE AS ITS COMMIT HOLDS IT.
  chmodSync(join(directory, 'work'), 0o755)
  rmSync(join(directory, '.git', 'info', 'attributes'), { force: true })
  git(directory, 'reset', '-q', '--hard')
  git(directory, 'clean', '-qfd')
})

afterAll(async () => {
  held?.letGo()
  await app?.close()
  t?.close()
  held?.remove()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
}, 30_000)

/** A repository with a branch `work` cut from main, whose one commit adds `work/added`, dated `at` when given. */
function aWorkTree(at?: number): string {
  trees += 1
  const dir = aRepository(join(scratch, `repository-${String(trees)}`))
  git(dir, 'switch', '-qc', 'work')
  writeFileSync(join(dir, 'work', 'added'), 'work\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'Work', ...(at === undefined ? [] : ['--date', `@${String(at)} +0000`]))
  return dir
}

const aSealAsk = (dir = directory) => ({ directory: dir, prior: null, named: 'main', area: ['work'] })
const aFactsAsk = (dir = directory, startedMs: number | null = null) => ({ directory: dir, cutFrom: 'main', startedMs, look: null, kind: null, copied: false })

/** What the request thread's seal does with `dir`: the seal, or the refusal with every field. */
function theSynchronousSealOf(dir = directory): unknown {
  try {
    return { captured: seal.theGitOfASeal(dir, null, 'main', ['work']) }
  } catch (err) {
    return err instanceof t.api.PanelError ? { refused: { ...err, message: err.message } } : { failed: (err as Error).message }
  }
}

/** What the thread's seal did, as the request thread makes it again. */
function asTheRequestThreadMakesIt(outcome: { captured: unknown } | { refused: Parameters<typeof apart.theRefusalAgain>[0] } | { failed: string }): unknown {
  if (!('refused' in outcome)) return outcome
  const again = apart.theRefusalAgain(outcome.refused)
  return { refused: { ...again, message: again.message } }
}

it('reads the same Git seal, including its fork base and changed files, byte for byte', async () => {
  const reading = await apart.readTheFinishApart({ facts: [], seals: [aSealAsk()] })
  expect(reading.held).toBe(true)
  const outcome = reading.seals[0]?.outcome
  expect(outcome !== undefined && 'captured' in outcome, JSON.stringify(outcome)).toBe(true)
  expect(JSON.stringify(outcome)).toBe(JSON.stringify(theSynchronousSealOf()))
})

const OUTSIDE_THE_COMMIT: [string, (dir: string) => void][] = [
  ['a tracked file edited', (dir) => writeFileSync(join(dir, 'work', 'added'), 'edited\n')],
  ['a file not tracked', (dir) => writeFileSync(join(dir, 'work', 'new.txt'), 'new\n')],
  ['a file under a filter', (dir) => {
    mkdirSync(join(dir, '.git', 'info'), { recursive: true })
    writeFileSync(join(dir, '.git', 'info', 'attributes'), 'work/added filter=a-made-up-filter\n')
    writeFileSync(join(dir, 'work', 'added'), 'filtered\n')
  }],
  ['a folder git cannot read', (dir) => chmodSync(join(dir, 'work'), 0o000)],
]

it.each(OUTSIDE_THE_COMMIT)('carries the same refusal and the same facts for %s', async (_what, change) => {
  change(directory)
  const expectedSeal = theSynchronousSealOf()
  const expectedFacts = JSON.stringify(facts.theGitFactsReadNow(aFactsAsk()))
  const reading = await apart.readTheFinishApart({ facts: [aFactsAsk()], seals: [aSealAsk()] })
  const outcome = reading.seals[0]?.outcome
  if (outcome === undefined) throw new Error('The thread answered no seal.')
  expect(asTheRequestThreadMakesIt(outcome)).toEqual(expectedSeal)
  expect(JSON.stringify(asTheRequestThreadMakesIt(outcome))).toBe(JSON.stringify(expectedSeal))
  expect('captured' in outcome, 'a seal of this tree is refused').toBe(false)
  expect(JSON.stringify(reading.facts[0]?.read)).toBe(expectedFacts)
})

it('answers another start with one reading only when the run\'s first own commit is the same, as the synchronous read does', async () => {
  const at = 1_700_000_000
  const dir = aWorkTree(at)
  const read = async (startedMs: number | null) => {
    const reading = await apart.readTheFinishApart({ facts: [aFactsAsk(dir, startedMs)], seals: [] })
    const one = reading.facts[0]?.read
    if (one === undefined || 'failed' in one) throw new Error(`The thread did not read the facts: ${JSON.stringify(one)}`)
    return one
  }
  // THE SAME FIRST OWN COMMIT: both starts after the commit, and both before it.
  for (const [had, want] of [[(at + 10) * 1000, (at + 11) * 1000 + 500], [(at - 20) * 1000, (at - 10) * 1000 + 999]] as const) {
    const answered = facts.aGitReadingFor(aFactsAsk(dir, had), await read(had), aFactsAsk(dir, want))
    expect(JSON.stringify(answered), `a reading from ${String(had)} for ${String(want)}`).toBe(JSON.stringify(facts.theGitFactsReadNow(aFactsAsk(dir, want))))
  }
  // A START IN THE COMMIT'S SECOND HAS IT AS THE RUN'S OWN, and the next second's start does not.
  const inIt = at * 1000 + 200
  const after = (at + 1) * 1000 + 200
  expect(facts.aGitReadingFor(aFactsAsk(dir, inIt), await read(inIt), aFactsAsk(dir, after))).toBeNull()
  expect(JSON.stringify(facts.theGitFactsReadNow(aFactsAsk(dir, after)))).not.toBe(JSON.stringify(facts.theGitFactsReadNow(aFactsAsk(dir, inIt))))
  // NO START, AND A START, are never the same question.
  expect(facts.aGitReadingFor(aFactsAsk(dir, null), await read(null), aFactsAsk(dir, after))).toBeNull()
})

it('changes the stamp and never throws when a path goes, cannot be read, or is turned into what it was not', () => {
  const changes: [string, () => void][] = [
    ['a tracked file deleted', () => unlinkSync(join(directory, 'work', 'added'))],
    ['a folder that cannot be read', () => chmodSync(join(directory, 'work'), 0o000)],
    ['a folder turned into a file', () => {
      rmSync(join(directory, 'work'), { recursive: true })
      writeFileSync(join(directory, 'work'), 'a file now\n')
    }],
    ['a file turned into a broken symlink', () => {
      unlinkSync(join(directory, 'work', 'added'))
      symlinkSync('nothing-is-here', join(directory, 'work', 'added'))
    }],
  ]
  for (const [what, change] of changes) {
    // A STAMP OF ITS OWN FOR EACH CHANGE: putting the tree back rewrites the index, which a stamp also holds.
    const made = stamps.aWorktreeStampOf(directory)
    if ('notMade' in made) throw new Error(`The stamp was not made: ${made.notMade}`)
    expect(stamps.theStampHolds(made), `${what}, before it`).toBe(true)
    expect(stamps.theGitFilesHold(made), `${what}, before it`).toBe(true)
    change()
    expect(() => stamps.theStampHolds(made), what).not.toThrow()
    expect(stamps.theStampHolds(made), what).toBe(false)
    expect(stamps.theGitFilesHold(made), `${what} leaves git's own files as they were`).toBe(true)
    chmodSync(join(directory, 'work'), 0o755)
    rmSync(join(directory, 'work'), { recursive: true, force: true })
    git(directory, 'checkout', '-q', '--', '.')
    expect(stamps.theStampHolds(made), `${what}, put back`).toBe(false)
  }
  const notAGitFolder = mkdtempSync(join(scratch, 'not-a-repository-'))
  const notMade = stamps.aWorktreeStampOf(notAGitFolder)
  expect('notMade' in notMade && notMade.notMade, 'a folder git cannot read has no stamp, and says why').toMatch(/not a git repository/)
})

it('refuses a stopped thread with 503 and reads nothing on the request thread instead', async () => {
  held.holdAt('--others')
  const waiting = apart.readTheFinishApart({ facts: [aFactsAsk()], seals: [aSealAsk()] }).catch((error: unknown) => error)
  await held.reached()
  await apart.endTheSealReadThread()
  held.letGo()
  const result = await waiting
  expect(result).toBeInstanceOf(t.api.PanelError)
  expect((result as InstanceType<typeof t.api.PanelError>).status).toBe(503)
  expect((result as Error).message).toMatch(/^The office could not read the Git seal on its own thread: .*Nothing was written\. Ask again\.$/s)
}, 30_000)
