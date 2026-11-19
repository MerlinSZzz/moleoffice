// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RENUMBERED MIGRATION'S JOURNAL ROW GOES LAST, AND ITS NUMBER IS ONE NO OTHER QUEUED ENTRY CARRIES (wave 13v round 26).
 * On 11 October 2026 entry T3pwIZzVrDF3 carried 0215 onto a main whose newest was 0231 (when 1791368770099). The round 23
 * renumbering made it 0232 but left its journal row where 0215 sat, between 0213 and 0227, so tests/migration-numbering.test.ts
 * failed (0227 dated before the row above it) and tests/migration.test.ts failed twice (its probe took index 232, which 0232
 * held). And 0232 was already carried by entry OxvNQdAtwq6y, ahead in the queue. Real temporary git trees; the office and
 * the sandbox are stubs, as in the round 23 test, whose fixture this copies. What the other queued entries carry is
 * given to integrateGit as theMigrationsQueued would read it; that reading is tested on its own in
 * the round 26 test of the queue's migrations.
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
import { theRenumbering } from '../tools/merge-tool/migrations.mjs'

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
function branchAdding(root: string, base: string, name: string, migrations: { idx: number, when: number, name: string, sql?: string }[], cases = true, inIndexOrder = false) {
  git(root, 'switch', '-qc', name, base)
  const rows = JSON.parse(read(root, 'drizzle/meta/_journal.json')).entries
  for (const one of migrations) {
    const tag = row(one.idx, one.when, one.name).tag
    rows.push(row(one.idx, one.when, one.name))
    write(root, `drizzle/${tag}.sql`, one.sql ?? `-- Migration ${tag.slice(0, 4)}: synthetic fixture\nCREATE TABLE ${one.name}_table (value TEXT);\n`)
    write(root, `tests/what-each-migration-adds/${tag}.json`, JSON.stringify({ migration: tag, adds: [`${one.name}_table`] }, null, 2) + '\n')
    if (cases) write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + `it('${one.name}_table, added by ${tag.slice(0, 4)}', () => expect(true).toBe(true))\n`)
  }
  write(root, 'drizzle/meta/_journal.json', journal(inIndexOrder ? rows.sort((a: any, b: any) => a.idx - b.idx) : rows))
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
beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-renumber-last-round-26-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

const WHEN = 1791368770000
/**
 * The shape entry T3pwIZzVrDF3 met: main holds 0213 and 0227..0231, and the entry's own journal holds 0215 between 0213
 * and 0227, in index order. A branch that brought main's rows in by itself and kept the journal in index order has it so.
 * A branch forked at 0213 does not: the join puts its row after main's, and round 23 already numbered that one right.
 */
function theT3pwShape() {
  const { root } = fixture()
  mainAdds(root, 213, WHEN + 80, 'before')
  let main = ''
  for (const idx of [227, 228, 229, 230, 231]) main = mainAdds(root, idx, WHEN + idx - 132, `main_${String(idx)}`)
  const { tip } = branchAdding(root, main, 'entry', [{ idx: 215, when: WHEN + 82, name: 'entry' }], true, true)
  expect(tagsOf(root, tip).slice(1, 4)).toEqual([`0213_before@${WHEN + 80}`, `0215_entry@${WHEN + 82}`, `0227_main_227@${WHEN + 95}`])
  return { root, base: main, tip }
}
const mainsRows = [[0, 100, 'base'], [213, WHEN + 80, 'before'], ...[227, 228, 229, 230, 231].map((idx) => [idx, WHEN + idx - 132, `main_${String(idx)}`])].map(([idx, when, name]) => `${row(idx as number, when as number, name as string).tag}@${String(when)}`)
const nothingQueued = { rows: [], read: [], unread: [], lane: null }

/** tests/migration-numbering.test.ts itself, run on the integrated tree: it reads only drizzle/ beside it. */
function theNumberingTestOn(clone: string) {
  write(clone, 'tests/migration-numbering.test.ts', read(REPO, 'tests/migration-numbering.test.ts'))
  return spawnSync(process.execPath, [join(REPO, 'node_modules/vitest/vitest.mjs'), 'run', '--root', clone, 'tests/migration-numbering.test.ts'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, CI: '1' } })
}
/** The probe of tests/migration.test.ts (migrationsPlusOne): one more row after the journal's last, at its index plus one. */
function theProbeIndexIsFree(clone: string) {
  const entries = JSON.parse(read(clone, 'drizzle/meta/_journal.json')).entries
  const last = entries[entries.length - 1]
  return entries.every((one: any) => one.idx !== last.idx + 1) && entries.every((one: any) => one.when < last.when + 1000)
}

// MUTATION PROOF (after a green control): in renumberMigrationsBehindMain, keep each journal row where it sits instead of
// putting the entry's rows last. This case and the next go red, with 0232 between 0213 and 0227. With the row-order
// assertions taken out as well, this case is still red twice: on the probe, and in tests/migration-numbering.test.ts,
// which says "0227_main_227 (1791368770095) is not after 0232_entry (1791368770100)".
it('puts the renumbered row of the T3pwIZzVrDF3 shape last, after main\'s 0231, and the numbering test and the migration probe hold on the result', async () => {
  const { root, base, tip } = theT3pwShape()
  const result = await integrateGit(entry(root, base, tip), { queued: nothingQueued })
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0215_entry', to: '0232_entry' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual([...mainsRows, `0232_entry@${WHEN + 100}`])
  // EVERY REPLAYED COMMIT that holds the row holds it last.
  for (const commit of git(clone, 'rev-list', `${git(root, 'rev-parse', 'main')}..HEAD`).split('\n')) expect(tagsOf(clone, commit).at(-1)).toBe(`0232_entry@${WHEN + 100}`)
  const numbering = theNumberingTestOn(clone)
  expect(numbering.status, numbering.stdout + numbering.stderr).toBe(0)
  expect(theProbeIndexIsFree(clone)).toBe(true)
  expect(boundary.logs.join('\n')).toContain("because main's newest migration was 0231, and their journal rows put last: 0215_entry -> 0232_entry")
  expect(boundary.logs.join('\n')).toContain('no other queued git entry is in the lane; numbers handed out for branches not yet in the queue cannot be seen')
}, 120_000)

// MUTATION PROOF (after a green control): in theRenumbering, do not start above theNewestQueued. This case and the last
// go red: 0215 becomes 0232, the number OxvNQdAtwq6y carries.
it('takes a number above the one entry OxvNQdAtwq6y carries, and above each number another queued entry carries, and says which entries it read', async () => {
  const { root, base, tip } = theT3pwShape()
  const queued = {
    rows: [
      { idx: 231, when: WHEN + 99, tag: '0231_main_231', entry: 'OxvNQdAtwq6y' },
      { idx: 232, when: WHEN + 100, tag: '0232_another_branch', entry: 'OxvNQdAtwq6y' },
      { idx: 215, when: WHEN + 82, tag: '0215_entry', entry: 'an-older-copy-of-this-entry' },
    ],
    read: ['OxvNQdAtwq6y', 'an-older-copy-of-this-entry'], unread: [{ entry: 'gone-entry', why: 'run gone-run has no worktree from which to read its commit' }], lane: null,
  }
  const result = await integrateGit(entry(root, base, tip), { queued })
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  // 0232 IS TAKEN, SO 0233; main's own 0231 and this entry's own 0215 do not raise it.
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0215_entry', to: '0233_entry' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual([...mainsRows, `0233_entry@${WHEN + 101}`])
  const numbering = theNumberingTestOn(clone)
  expect(numbering.status, numbering.stdout + numbering.stderr).toBe(0)
  expect(theProbeIndexIsFree(clone)).toBe(true)
  const said = boundary.logs.join('\n')
  expect(said).toContain("because main's newest migration was 0231 and the other queued entries carry up to 0232 (when 1791368770100)")
  expect(said).toContain('read the journals of OxvNQdAtwq6y, an-older-copy-of-this-entry; could not read gone-entry (run gone-run has no worktree from which to read its commit), whose numbers are not known')
  expect(git(clone, 'log', '-1', '--format=%B', 'HEAD~1')).toContain('and the other queued entries carry up to 0232 (when 1791368770100): 0215_entry -> 0233_entry')
}, 120_000)

it('says so in the log when the lane could not be read, and numbers above main\'s newest only', async () => {
  const { root, base, tip } = theT3pwShape()
  const result = await integrateGit(entry(root, base, tip), { queued: { rows: [], read: [], unread: [], lane: 'the office would not give the lane (500): synthetic' } })
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0215_entry', to: '0232_entry' }])
  expect(boundary.logs.join('\n')).toContain("the lane could not be read (the office would not give the lane (500): synthetic), so the new numbers are above main's only")
}, 120_000)

it('numbers above the newest a queued entry carries, by index and by when, apart', () => {
  const onto = { entries: [row(0, 100, 'base'), row(5, 500, 'later')] }
  const result = { entries: [...onto.entries, row(1, 200, 'entry')] }
  expect(theRenumbering(onto, result, []).map((one) => `${one.to}@${one.when}`)).toEqual(['0006_entry@501'])
  expect(theRenumbering(onto, result, [{ ...row(9, 400, 'queued'), entry: 'x' }]).map((one) => `${one.to}@${one.when}`)).toEqual(['0010_entry@501'])
  expect(theRenumbering(onto, result, [{ ...row(6, 900, 'queued'), entry: 'x' }]).map((one) => `${one.to}@${one.when}`)).toEqual(['0007_entry@901'])
})
