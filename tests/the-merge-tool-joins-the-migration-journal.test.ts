// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL JOINS THE MIGRATION JOURNAL BY ITSELF. Wave 13v round 17d, message HtPD0kOhxWms.
 *
 * Seven branches with migrations numbered in advance land one after another, and each appends its rows to the end of
 * drizzle/meta/_journal.json. The queue's rebase now joins that file through a merge driver set in the integration clone
 * (tools/merge-tool/journal-join.mjs), and the database applies what is missing (src/config/migration-look.mjs).
 *
 * WHAT THIS FILE PROVES, on real temporary git trees built from the real migrations up to 0211:
 * 1. Two branches that each append a migration, landed in either order: the journal joins, both are applied exactly
 *    once to a database that had the first, and a third run applies nothing. Since wave 13v round 23 the one that lands
 *    second is renumbered when it is behind the first: 0212 after 0213 becomes 0214, and 0213 after 0212 keeps its
 *    number while its `when`, equal to 0212's, moves one later.
 * 2. A conflict in another file still bounces the entry, though its journal joined.
 * 3. Two rows sharing an index are refused with a sentence naming both, and the entry bounces with that sentence.
 * 4. The join's refusals, one by one: one tag with another idx or when, a row removed on one side and changed on the
 *    other, and the journal's other fields differing.
 * 5. Wave 13v round 18: the joined journal is judged again by a program, and the integrated step carries that as a
 *    decided check, so the office does not hand the journal to the inspector.
 * 6. That check, refusal by refusal: a row of either side missing or changed, a row from neither side, a tag or an index
 *    twice, other fields unlike the journal it lands on; and two entries' journals that disagree.
 * 7. Problem Jvkr-TVDDI2A: after this tool renumbers the entry's migration, the journal still goes to the inspector, and
 *    the log gives the renumbering as the reason. On 16 October 2026 entry Sl6pL9GrRw03's 0218 became 0274, and the log
 *    said the joined journal lacked 0218, which it held as 0274.
 * 8. That reason, made from the renumbering: each row's old and new tag, index and `when`; or, when the renumbering is not
 *    the only difference, the difference left once it is read in.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, builds: [] as string[] }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  theOwnerContentPatterns: async () => (await import('./the-owners-content-patterns.ts')).THE_PATTERNS,
  withThePairing: (env: Record<string, string | undefined>) => ({ ...env }),
  get WORKDIR() { return join(boundary.folder, 'logs') },
  THIS_CHECKOUT: fileURLToPath(new URL('..', import.meta.url)),
  ABSENT: 'absent', API: '', WORKSPACE: 'synthetic', PINNED_REF_PREFIX: 'refs/synthetic/',
  SCRIPT_TIMEOUT_MS: 30_000, SUITE_TIMEOUT_MS: 30_000,
  GIT_IDENTITY: (await import('./the-test-commit-address.mjs')).aTestIdentity('Synthetic queue', 'fixture'),
  chosen: { entry: 'synthetic-entry', pinOnly: false, get sandboxes() { return join(boundary.folder, 'sandboxes') } },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-10 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: [] } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>) => ({ step: name, facts }),
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    boundary.builds.push(options.cwd)
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n') }
  },
}))
import Database from 'better-sqlite3'
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { joinTheJournals, theJournalDecided, whereTheJournalsDisagree, whetherTheJournalHoldsBothSides } from '../tools/merge-tool/journal-join.mjs'
import { migrateInPlace } from '../src/server/db/migrate.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(REPO, 'drizzle')

interface Entry { idx: number; version: string; when: number; tag: string; breakpoints: boolean }
const THE_BASE: Entry[] = (JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: Entry[] }).entries.filter((entry) => entry.idx <= 211)
const BRANCH_A: Entry = { idx: 212, version: '6', when: 1791368770081, tag: '0212_branch_a', breakpoints: true }
const BRANCH_B: Entry = { idx: 213, version: '6', when: 1791368770081, tag: '0213_branch_b', breakpoints: true }
const BRANCH_C: Entry = { ...BRANCH_A, tag: '0212_branch_c' }
const SQL_OF: Record<string, string> = {
  [BRANCH_A.tag]: 'CREATE TABLE `branch_a_mark` (`id` integer PRIMARY KEY);',
  [BRANCH_B.tag]: 'CREATE TABLE `branch_b_mark` (`id` integer PRIMARY KEY);',
  [BRANCH_C.tag]: 'CREATE TABLE `branch_c_mark` (`id` integer PRIMARY KEY);',
}
const journal = (rows: Entry[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'

function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
function append(root: string, row: Entry) {
  const rows = (JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')) as { entries: Entry[] }).entries
  write(root, 'drizzle/meta/_journal.json', journal([...rows, row]))
  write(root, `drizzle/${row.tag}.sql`, SQL_OF[row.tag]!)
}

/** A repository whose main has `landed` on top of the real migrations up to 0211, and an entry that appends `entry`. */
function twoBranches(landed: Entry, entry: Entry, alsoConflicting = false) {
  const root = join(boundary.folder, 'repo')
  mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', 'process.exit(0)\n')
  write(root, 'src/shared.txt', 'original\n')
  for (const row of THE_BASE) write(root, `drizzle/${row.tag}.sql`, readFileSync(join(MIGRATIONS, `${row.tag}.sql`), 'utf8'))
  write(root, 'drizzle/meta/_journal.json', journal(THE_BASE))
  const base = commit(root, 'Synthetic migrations up to 0211')
  git(root, 'switch', '-qc', 'entry')
  append(root, entry)
  if (alsoConflicting) write(root, 'src/shared.txt', 'entry code\n')
  const tip = commit(root, `Synthetic entry adds ${entry.tag}`)
  git(root, 'switch', '-q', 'main')
  append(root, landed)
  if (alsoConflicting) write(root, 'src/shared.txt', 'main code\n')
  const main = commit(root, `Synthetic landing of ${landed.tag}`)
  return { root, base, tip, main }
}

/** A database at the base, then given main's landing, the way every office would be before this entry lands. */
function anOfficeAtMain(root: string): Database.Database {
  const folder = join(boundary.folder, 'base-drizzle')
  mkdirSync(join(folder, 'meta'), { recursive: true })
  for (const row of THE_BASE) copyFileSync(join(MIGRATIONS, `${row.tag}.sql`), join(folder, `${row.tag}.sql`))
  writeFileSync(join(folder, 'meta', '_journal.json'), journal(THE_BASE))
  const db = new Database(join(boundary.folder, 'office.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateInPlace(db, folder)
  expect(migrateInPlace(db, join(root, 'drizzle')).newlyApplied).toBe(1)
  return db
}

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'the-merge-tool-joins-the-journal-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.state = {}; boundary.builds = []
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

describe('the merge tool joins the migration journal by itself', () => {
  for (const [landed, entry] of [[BRANCH_A, BRANCH_B], [BRANCH_B, BRANCH_A]] as const) {
    it(`1. ${landed.tag} landed, then ${entry.tag}: the journal joins, the second is put after the first, and both apply exactly once`, async () => {
      const { root, base, tip, main } = twoBranches(landed, entry)
      const result = await integrateGit({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } })
      expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
      const after = entry.idx > landed.idx ? entry.tag : `0214${entry.tag.slice(4)}`
      expect(result.facts.renumberedMigrations).toEqual([{ from: entry.tag, to: after }])
      expect(boundary.logs.join('\n')).toContain(`the migration journal was joined by itself: joined the migration journal, adding ${entry.tag}`)
      const clone = boundary.state.integrated.clone
      const tags = (JSON.parse(readFileSync(join(clone, 'drizzle/meta/_journal.json'), 'utf8')) as { entries: Entry[] }).entries.map((row) => row.tag)
      expect(tags, "main's rows keep their order and the entry's follow them").toEqual([...THE_BASE.map((row) => row.tag), landed.tag, after])
      expect(git(clone, 'log', '--format=%s', `${main}..HEAD`)).toBe(`Synthetic entry adds ${entry.tag}`)

      const db = anOfficeAtMain(root)
      try {
        expect(migrateInPlace(db, join(clone, 'drizzle')).newlyApplied, `${entry.tag} was not applied`).toBe(1)
        expect(migrateInPlace(db, join(clone, 'drizzle')).newlyApplied).toBe(0)
        const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name)
        expect(tables).toEqual(expect.arrayContaining(['branch_a_mark', 'branch_b_mark']))
      } finally {
        db.close()
      }
      expect(git(root, 'rev-parse', 'HEAD')).toBe(main)
    }, 120_000)
  }

  it('2. a conflict in another file still bounces the entry, though its journal joined', async () => {
    const { root, base, tip, main } = twoBranches(BRANCH_A, BRANCH_B, true)
    const result = await integrateGit({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } })
    expect(result.step).toBe('conflict')
    expect(result.facts.files).toEqual(['src/shared.txt'])
    expect(boundary.builds).toEqual([])
    expect(git(root, 'rev-parse', 'HEAD')).toBe(main)
  }, 120_000)

  it('3. two rows sharing an index are refused naming both, and the entry bounces with that sentence', async () => {
    const { root, base, tip, main } = twoBranches(BRANCH_A, BRANCH_C)
    const result = await integrateGit({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } })
    expect(result.step).toBe('conflict')
    expect(result.facts.files).toContain('drizzle/meta/_journal.json')
    expect(result.facts.says).toContain('The migration journal was not joined: The joined migration journal would give one index to two migrations: 0212_branch_a and 0212_branch_c are both index 212')
    expect(git(root, 'rev-parse', 'HEAD')).toBe(main)
  }, 120_000)

  it('4. the join refuses one tag with another idx or when, a removed row changed on the other side, and other fields differing', () => {
    const doc = (rows: Entry[], version = '7') => JSON.stringify({ version, dialect: 'sqlite', entries: rows }, null, 2) + '\n'
    const base = doc(THE_BASE.slice(0, 2))
    expect(joinTheJournals(base, doc([...THE_BASE.slice(0, 2), BRANCH_A]), doc([...THE_BASE.slice(0, 2), { ...BRANCH_A, when: BRANCH_A.when + 1 }]))).toEqual({
      refused: `Both sides of the migration journal hold 0212_branch_a, one as index 212 with when ${BRANCH_A.when} and the other as index 212 with when ${BRANCH_A.when + 1}, so it was not joined.`,
    })
    expect(joinTheJournals(base, doc([...THE_BASE.slice(0, 2), BRANCH_A]), doc([...THE_BASE.slice(0, 2), { ...BRANCH_A, idx: 214 }]))).toEqual({
      refused: `Both sides of the migration journal hold 0212_branch_a, one as index 212 with when ${BRANCH_A.when} and the other as index 214 with when ${BRANCH_A.when}, so it was not joined.`,
    })
    const first = THE_BASE[1]!
    expect(joinTheJournals(base, doc([THE_BASE[0]!]), doc([THE_BASE[0]!, { ...first, when: first.when + 1 }]))).toEqual({
      refused: `One side of the migration journal removed ${first.tag} and the other changed it, so it was not joined.`,
    })
    expect(joinTheJournals(base, doc(THE_BASE.slice(0, 2), '8'), doc(THE_BASE.slice(0, 2)))).toEqual({
      refused: 'The two sides of the migration journal differ outside its entries, so it was not joined.',
    })
  })

  it('5. the joined journal is checked again by a program, and the integrated step reports it decided', async () => {
    // THE ENTRY'S `when` IS AFTER MAIN'S, so nothing is renumbered (wave 13v round 23) and the journal is the join alone.
    const { root, base, tip } = twoBranches(BRANCH_A, { ...BRANCH_B, when: BRANCH_A.when + 1 })
    const judged = { 'drizzle/meta/_journal.json': 'the hash its release read', [`drizzle/${BRANCH_B.tag}.sql`]: 'not read here' }
    const result = await integrateGit({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged } })
    expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
    const says = `The joined journal holds all ${THE_BASE.length + 1} rows it lands on and all ${THE_BASE.length + 1} of the entry's, adding ${BRANCH_B.tag}, with no row changed, no row from neither side, and no tag or index twice.`
    expect(result.facts.checker.decided.filter((one: { path: string }) => one.path === 'drizzle/meta/_journal.json')).toEqual([{ path: 'drizzle/meta/_journal.json', check: 'joins', ok: true, detail: says }])
    expect(boundary.logs).toContain(`the joined migration journal is decided by its check: ${says}`)
  }, 120_000)

  it('6. the check refuses a joined journal that lacks, changes or invents a row, repeats one, or differs outside its rows', () => {
    const doc = (rows: Entry[], version = '7') => JSON.stringify({ version, dialect: 'sqlite', entries: rows }, null, 2) + '\n'
    const start = THE_BASE.slice(0, 2)
    const entry = doc([...start, BRANCH_A])
    const onto = doc([...start, BRANCH_B])
    const holds = (joined: string) => whetherTheJournalHoldsBothSides({ entry, onto, joined })
    expect(holds(doc([...start, BRANCH_B, BRANCH_A]))).toMatchObject({ holds: true })
    expect(holds(doc([...start, BRANCH_B]))).toEqual({ holds: false, why: `the joined journal lacks ${BRANCH_A.tag}, which the entry holds` })
    expect(holds(doc([...start, BRANCH_A]))).toEqual({ holds: false, why: `the joined journal lacks ${BRANCH_B.tag}, which the journal it lands on holds` })
    expect(holds(doc([...start, BRANCH_B, { ...BRANCH_A, when: BRANCH_A.when + 1 }]))).toEqual({ holds: false, why: `the joined journal holds ${BRANCH_A.tag} otherwise than the entry does` })
    expect(holds(doc([...start, BRANCH_B, BRANCH_A, { ...BRANCH_A, idx: 300, tag: '0300_from_nowhere' }]))).toEqual({ holds: false, why: 'the joined journal holds 0300_from_nowhere, which neither side holds' })
    expect(holds(doc([...start, BRANCH_B, BRANCH_A, BRANCH_A]))).toEqual({ holds: false, why: `the joined journal holds ${BRANCH_A.tag} twice` })
    expect(holds(doc([...start, BRANCH_B, BRANCH_A, BRANCH_C]))).toEqual({ holds: false, why: 'the joined journal gives index 212 to two migrations' })
    expect(holds(doc([...start, BRANCH_B, BRANCH_A], '8'))).toEqual({ holds: false, why: 'the joined journal differs outside its entries from the journal it lands on' })
    expect(whereTheJournalsDisagree(entry, onto)).toBeNull()
    expect(whereTheJournalsDisagree(entry, doc([...start, BRANCH_C]))).toBe(`both give index 212 to a migration, ${BRANCH_A.tag} and ${BRANCH_C.tag}`)
    expect(whereTheJournalsDisagree(entry, doc([...start, { ...BRANCH_A, when: 1 }]))).toBe(`both hold ${BRANCH_A.tag}, as index 212 with when ${BRANCH_A.when} and as index 212 with when 1`)
  })

  it("7. after this tool renumbers the entry's migration, the journal still goes to the inspector, and the log gives the renumbering as the reason", async () => {
    const { root, base, tip } = twoBranches(BRANCH_B, BRANCH_A)
    const result = await integrateGit({ changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } })
    expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
    expect(result.facts.renumberedMigrations).toEqual([{ from: BRANCH_A.tag, to: '0214_branch_a' }])
    expect(result.facts.checker.decided.filter((one: { path: string }) => one.path === 'drizzle/meta/_journal.json')).toEqual([])
    expect(boundary.logs).toContain(
      'the joined migration journal is not decided by its check, so the inspector reads it: this tool renumbered the entry\'s migrations, '
      + `from ${BRANCH_A.tag} to 0214_branch_a (index 212 to 214, when ${BRANCH_A.when} to ${BRANCH_A.when + 1}), and that is the only difference from the two sides.`,
    )
    expect(boundary.logs.join('\n')).not.toContain(`lacks ${BRANCH_A.tag}`)
  }, 120_000)

  it('8. the reason names each renumbered row, or the difference left once the renumbering is read in', () => {
    const doc = (rows: Entry[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'
    const start = THE_BASE.slice(0, 2)
    const W = BRANCH_A.when
    const branchE: Entry = { ...BRANCH_A, idx: 215, tag: '0215_branch_e', when: W + 1 }
    const renumbered = [
      { from: BRANCH_A.tag, to: '0214_branch_a', idx: 214, when: W + 1 },
      { from: branchE.tag, to: branchE.tag, idx: 215, when: W + 2 },
    ]
    const movedA: Entry = { ...BRANCH_A, idx: 214, tag: '0214_branch_a', when: W + 1 }
    const movedE: Entry = { ...branchE, when: W + 2 }
    const decide = (joined: Entry[], mappings = renumbered) => {
      const texts: Record<string, string> = { entry: doc([...start, BRANCH_A, branchE]), onto: doc([...start, BRANCH_B]), result: doc(joined) }
      const sides = { entry: 'entry', onto: 'onto', result: 'result', renumbered: mappings }
      return theJournalDecided((at: string) => texts[at] ?? null, sides)
    }
    const said = `from ${BRANCH_A.tag} to 0214_branch_a (index 212 to 214, when ${W} to ${W + 1}), from ${branchE.tag} to ${branchE.tag} (index 215 to 215, when ${W + 1} to ${W + 2})`
    expect(decide([...start, BRANCH_B, movedA, movedE])).toEqual({ decided: null, why: `this tool renumbered the entry's migrations, ${said}, and that is the only difference from the two sides` })
    expect(decide([...start, BRANCH_B, { ...movedA, when: W + 5 }, movedE])).toEqual({
      decided: null, why: `the joined journal holds 0214_branch_a otherwise than the entry does, reading the entry's journal with this tool's renumbering, ${said}`,
    })
    expect(decide([...start, BRANCH_B, movedE])).toEqual({
      decided: null, why: `the joined journal lacks 0214_branch_a, which the entry holds, reading the entry's journal with this tool's renumbering, ${said}`,
    })
    // A renumbering that moved none of the entry's rows changes nothing: the journal that holds both sides is decided.
    expect(decide([...start, BRANCH_B, BRANCH_A, branchE], [{ from: '0299_elsewhere', to: '0300_elsewhere', idx: 300, when: 1 }]).decided).toMatchObject({ path: 'drizzle/meta/_journal.json', check: 'joins', ok: true })
    expect(decide([...start, BRANCH_B, movedE], [])).toEqual({ decided: null, why: `the joined journal lacks ${BRANCH_A.tag}, which the entry holds` })
  })
})
