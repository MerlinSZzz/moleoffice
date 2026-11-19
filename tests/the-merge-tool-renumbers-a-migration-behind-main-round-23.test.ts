// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION BEHIND MAIN'S NEWEST IS RENUMBERED AT INTEGRATION (wave 13v round 23). On 11 October 2026 merge entry
 * 5U3bbCGGo29o carried 0214 (when 1791368770082) onto a main whose newest was 0227 (when 1791368770095). The journal join
 * put 0214's row after 0227's, nothing conflicted, and three test files went red. Real temporary git trees; the office and
 * the sandbox are stubs, as in tests/merge-migrations-round-12.test.ts.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, steps: [] as { name: string; facts: Record<string, any>; detail: any }[] }))
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
  stamp: () => '2026-10-11 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: Object.entries(entry.machine.judged).map(([path, hash]) => ({ path, hash })) } }),
  theSandbox: async () => { standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, facts } },
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
  },
}))
import { integrateGit as replayGitFixture } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })
import { theMigrationsBehind, theRenumbering, withTheNewNumbers } from '../tools/merge-tool/migrations.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
function standIn(...args: string[]) {
  const cut = args.indexOf('--') < 0 ? args.length : args.indexOf('--')
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, cut), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(cut)], { encoding: 'utf8', timeout: 60_000 })
}
function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')
const row = (idx: number, when: number, name: string) => ({ idx, version: '6', when, tag: `${String(idx).padStart(4, '0')}_${name}`, breakpoints: true })
const journal = (rows: any[]) => JSON.stringify({ version: '7', dialect: 'sqlite', entries: rows }, null, 2) + '\n'
const tagsOf = (root: string, at: string) => JSON.parse(git(root, 'show', `${at}:drizzle/meta/_journal.json`)).entries.map((one: any) => `${one.tag}@${one.when}`)
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }

/** Main at 0000 with a notes file that already names 0001 on a line of its own, which the renumbering must leave alone. */
function fixture() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.gitignore', 'node_modules\n')
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', 'process.exit(0)\n')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base')]))
  write(root, 'drizzle/0000_base.sql', 'CREATE TABLE base_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', "import {expect,it} from 'vitest'\n")
  write(root, 'notes.txt', 'main says 0001 was an old ticket\n')
  const base = commit(root, 'Synthetic main at 0000')
  return { root, base }
}
/** The entry's branch: one commit adds the migration, a later one names it in another file. */
function branchAdding(root: string, base: string, name: string, migrations: { idx: number, when: number, name: string, sql?: string }[], cases = true) {
  git(root, 'switch', '-qc', name, base)
  const rows = JSON.parse(read(root, 'drizzle/meta/_journal.json')).entries
  for (const one of migrations) {
    const tag = row(one.idx, one.when, one.name).tag
    rows.push(row(one.idx, one.when, one.name))
    write(root, `drizzle/${tag}.sql`, one.sql ?? `-- Migration ${tag.slice(0, 4)}: synthetic fixture\nCREATE TABLE ${one.name}_table (value TEXT);\n`)
    write(root, `tests/what-each-migration-adds/${tag}.json`, JSON.stringify({ migration: tag, adds: [`${one.name}_table`] }, null, 2) + '\n')
    if (cases) write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + `it('${one.name}_table, added by ${tag.slice(0, 4)}', () => expect(true).toBe(true))\n`)
  }
  write(root, 'drizzle/meta/_journal.json', journal(rows))
  const adds = commit(root, `Synthetic ${name} adds its migrations`)
  // TWO ENTRIES WRITE TWO FILES, so the second is not stopped on a conflict with the first's notes.
  const notes = name === 'entry' ? 'notes.txt' : `notes-${name}.txt`
  write(root, notes, (existsSync(join(root, notes)) ? read(root, notes) : '') + migrations.map((one) => `the entry's migration ${String(one.idx).padStart(4, '0')} is ${row(one.idx, one.when, one.name).tag}\n`).join(''))
  const tip = commit(root, `Synthetic ${name} names them`)
  git(root, 'switch', '-q', 'main')
  return { adds, tip }
}
function mainAdds(root: string, idx: number, when: number, name: string) {
  const rows = JSON.parse(read(root, 'drizzle/meta/_journal.json')).entries
  write(root, 'drizzle/meta/_journal.json', journal([...rows, row(idx, when, name)]))
  write(root, `drizzle/${row(idx, when, name).tag}.sql`, `CREATE TABLE ${name}_table (value TEXT);\n`)
  return commit(root, `Synthetic main adds ${row(idx, when, name).tag}`)
}
/** What a landing does in this fixture: main moves to the integrated result. */
function land(root: string, clone: string) {
  git(root, 'fetch', '-q', clone, 'HEAD')
  git(root, 'merge', '-q', '--ff-only', 'FETCH_HEAD')
}

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-renumber-behind-round-23-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

it('renumbers a migration behind main to main\'s next number, in the commit that first adds it, and names it old to new', async () => {
  const { root, base } = fixture()
  const { adds, tip } = branchAdding(root, base, 'entry', [{ idx: 1, when: 200, name: 'entry' }])
  const sql = git(root, 'show', `${tip}:drizzle/0001_entry.sql`)
  const main = mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip))
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_entry', to: '0006_entry' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual(['0000_base@100', '0005_later@500', '0006_entry@501'])
  // THE SQL IS WORD FOR WORD, AND THE OLD FILE IS GONE.
  expect(git(clone, 'show', 'HEAD:drizzle/0006_entry.sql')).toBe(sql)
  expect(existsSync(join(clone, 'drizzle/0001_entry.sql'))).toBe(false)
  expect(JSON.parse(read(clone, 'tests/what-each-migration-adds/0006_entry.json')).migration).toBe('0006_entry')
  expect(existsSync(join(clone, 'tests/what-each-migration-adds/0001_entry.json'))).toBe(false)
  expect(read(clone, 'tests/migration.test.ts')).toContain("it('entry_table, added by 0006'")
  // MAIN'S OWN LINE KEEPS ITS 0001; THE ENTRY'S LINE TAKES THE NEW NUMBER.
  expect(read(clone, 'notes.txt')).toBe("main says 0001 was an old ticket\nthe entry's migration 0006 is 0006_entry\n")
  // IN THE COMMIT THAT FIRST ADDS IT: the first replayed commit already holds 0006, and says so.
  const [first = '', second = ''] = git(clone, 'rev-list', '--reverse', `${main}..HEAD`).split('\n')
  expect(git(clone, 'ls-tree', '--name-only', first, 'drizzle/')).toContain('drizzle/0006_entry.sql')
  expect(git(clone, 'show', '-s', '--format=%B', first)).toContain("renumbered at integration, because main's newest migration was 0005: 0001_entry -> 0006_entry")
  expect(git(clone, 'show', '-s', '--format=%B', second)).not.toContain('renumbered')
  expect(git(clone, 'show', '-s', '--format=%an %ad', first)).toBe(git(root, 'show', '-s', '--format=%an %ad', adds))
  expect(boundary.logs.join('\n')).toContain('0001_entry -> 0006_entry (when 200 -> 501)')
  expect(git(root, 'rev-parse', 'main')).toBe(main)
}, 60_000)

it('moves only the when of a migration whose number is next but whose when is not after main\'s newest', async () => {
  const { root } = fixture()
  const main0 = mainAdds(root, 1, 500, 'first')
  const { tip } = branchAdding(root, main0, 'entry', [{ idx: 2, when: 300, name: 'entry' }])
  const result = await integrateGit(entry(root, main0, tip))
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0002_entry', to: '0002_entry' }])
  expect(tagsOf(boundary.state.integrated.clone, 'HEAD')).toEqual(['0000_base@100', '0001_first@500', '0002_entry@501'])
}, 60_000)

// WITH CASES, BOTH ENTRIES ADD LINES AT THE END OF tests/migration.test.ts, the second rebase stops there, and the
// collision renumbering takes it, across main's gap from 0000 to 0005. WITHOUT, the second rebase goes through, and the
// renumbering of a migration behind main takes it.
it.each([['with migration cases, by the collision path', true], ['without, by the path for a migration behind main', false]])('renumbers two entries\' migrations both behind main, one after the other, and each keeps its order: %s', async (_label, cases) => {
  const { root, base } = fixture()
  const one = branchAdding(root, base, 'one', [{ idx: 1, when: 200, name: 'one' }])
  const two = branchAdding(root, base, 'two', [{ idx: 2, when: 300, name: 'two_a' }, { idx: 3, when: 300, name: 'two_b' }], cases)
  mainAdds(root, 5, 500, 'later')
  const first = await integrateGit(entry(root, base, one.tip))
  expect(first.step, JSON.stringify(first.facts)).toBe('integrated')
  expect(first.facts.renumberedMigrations).toEqual([{ from: '0001_one', to: '0006_one' }])
  land(root, boundary.state.integrated.clone)
  const second = await integrateGit(entry(root, base, two.tip))
  expect(second.step, JSON.stringify(second.facts)).toBe('integrated')
  expect(second.facts.renumberedMigrations).toEqual([{ from: '0002_two_a', to: '0007_two_a' }, { from: '0003_two_b', to: '0008_two_b' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual(['0000_base@100', '0005_later@500', '0006_one@501', '0007_two_a@502', '0008_two_b@503'])
  // ONE PASS: 0002 became 0007 and 0003 became 0008, and neither was changed twice.
  expect(read(clone, 'notes-one.txt')).toBe("the entry's migration 0006 is 0006_one\n")
  expect(existsSync(join(clone, 'tests/what-each-migration-adds/0007_two_a.json')) && !existsSync(join(clone, 'tests/what-each-migration-adds/0002_two_a.json'))).toBe(true)
  if (cases) expect(read(clone, 'tests/migration.test.ts')).toContain("it('two_b_table, added by 0008'")
  expect(read(clone, 'notes-two.txt')).toBe("the entry's migration 0007 is 0007_two_a\nthe entry's migration 0008 is 0008_two_b\n")
}, 90_000)

it('bounces, with a sentence saying why, a migration behind main whose SQL names its own number', async () => {
  const { root, base } = fixture()
  const { tip } = branchAdding(root, base, 'entry', [{ idx: 1, when: 200, name: 'entry', sql: 'CREATE TABLE entry_0001 (value TEXT);\n' }])
  mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip))
  expect(result.step).toBe('guard-failed')
  expect(result.facts.guard).toBe('migration-order')
  expect(result.facts.detail).toContain('SQL mentions its number')
  expect(result.facts.files).toContain('drizzle/0001_entry.sql')
}, 60_000)

it('names the migrations an entry adds behind a journal, which the bus keeps off and the integration renumbers', () => {
  const onto = { entries: [row(0, 100, 'base'), row(5, 500, 'later')] }
  expect(theMigrationsBehind(onto, { entries: [...onto.entries, row(6, 600, 'ahead')] })).toEqual([])
  expect(theMigrationsBehind(onto, { entries: [...onto.entries, row(1, 200, 'behind')] }).map((one) => one.tag)).toEqual(['0001_behind'])
  expect(theMigrationsBehind(onto, { entries: [...onto.entries, row(6, 400, 'early')] }).map((one) => one.tag)).toEqual(['0006_early'])
  expect(theRenumbering(onto, { entries: [...onto.entries, row(6, 600, 'ahead')] })).toEqual([])
  // A ROW ALREADY AHEAD STILL FOLLOWS ONE THAT MOVED, SO THE ORDER HOLDS.
  expect(theRenumbering(onto, { entries: [...onto.entries, row(1, 200, 'behind'), row(9, 900, 'ahead')] }).map((one) => `${one.from}->${one.to}@${one.when}`))
    .toEqual(['0001_behind->0006_behind@501', '0009_ahead->0007_ahead@900'])
  expect(withTheNewNumbers('0001 and 0001_x and x0001 and 0001_y', [{ from: '0001_x', to: '0006_x' } as any], null).text).toBe('0006 and 0006_x and x0001 and 0001_y')
})
