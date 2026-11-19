// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RENUMBERING ALSO RENAMES A MIGRATION NAMED BY ITS NUMBER AND AN UNDERSCORE (wave 13v round 24). Wave 13k ran
 * renumberMigrationsBehindMain in a throwaway clone (message qzPlazCWKq9R): 0216 became 0228 and 0217 became 0229, and
 * tests/migration.test.ts then failed at `migrationsBefore('0216_')`, because the rule renamed a whole tag or a number
 * standing alone and `0216_` is neither. Real temporary git trees; the office and the sandbox are stubs, as in
 * tests/the-merge-tool-renumbers-a-migration-behind-main-round-23.test.ts, whose fixture this copies.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
import { withTheNewNumbers } from '../tools/merge-tool/migrations.mjs'

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
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }

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
  const base = commit(root, 'Synthetic main at 0000')
  return { root, base }
}
/** The entry's branch: one commit adds migration 0001_a_handover, a later one writes `lines` into the fixture's own naming test, a file only the fixture has. */
function branchNaming(root: string, base: string, lines: string[]) {
  git(root, 'switch', '-qc', 'entry', base)
  const tag = row(1, 200, 'a_handover').tag
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 200, 'a_handover')]))
  write(root, `drizzle/${tag}.sql`, 'CREATE TABLE handover_table (value TEXT);\n')
  commit(root, 'Synthetic entry adds its migration')
  write(root, 'tests/naming.test.ts', lines.join('\n') + '\n')
  const tip = commit(root, 'Synthetic entry names it')
  git(root, 'switch', '-q', 'main')
  return tip
}
function mainAdds(root: string, idx: number, when: number, name: string) {
  const rows = JSON.parse(read(root, 'drizzle/meta/_journal.json')).entries
  write(root, 'drizzle/meta/_journal.json', journal([...rows, row(idx, when, name)]))
  write(root, `drizzle/${row(idx, when, name).tag}.sql`, `CREATE TABLE ${name}_table (value TEXT);\n`)
  return commit(root, `Synthetic main adds ${row(idx, when, name).tag}`)
}

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-renumber-underscore-round-24-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

const HANDOVER = [{ from: '0216_a_handover_for_every_agent', to: '0228_a_handover_for_every_agent' }, { from: '0217_a_resident_sleeps_and_is_named', to: '0229_a_resident_sleeps_and_is_named' }] as any

// MUTATION PROOF (after a green control): in whatFollows, drop `|| after === '_'`, so a lone `_` is not its tag; this
// case goes red on `'0216_'`, and so does the integration case below.
it('renames the number followed by an underscore, and by the start of its own tag, as it does the whole tag and the bare number', () => {
  const said = withTheNewNumbers([
    "migrateInPlace(s.db, partialMigrations(migrationsBefore('0216_')))",
    'const tag = "0217_',
    'one.tag.startsWith(`0216_a_handover`) && 0217',
    'drizzle/0216_a_handover_for_every_agent.sql and /^0217_/ and 0216*',
  ].join('\n'), HANDOVER, null)
  expect(said.text.split('\n')).toEqual([
    "migrateInPlace(s.db, partialMigrations(migrationsBefore('0228_')))",
    'const tag = "0229_',
    'one.tag.startsWith(`0228_a_handover`) && 0229',
    'drizzle/0228_a_handover_for_every_agent.sql and /^0229_/ and 0228*',
  ])
  expect(said.changed).toBe(7)
  expect(said.cannot).toEqual([])
})

// MUTATION PROOF (after a green control): in whatFollows, answer 'its tag' where it answers 'not its tag', so any word
// may follow the `_`; this case goes red on `0216_branch_a` and `0216_30`.
it('leaves alone a number that only looks like one: a date, a port, a count, another name with the same digits', () => {
  const lines = [
    'on 20260216 at port 39017, 216 rows, v0216 and 0216a',
    "fixture tags '0216_branch_a' and '0217_gone', a time 0216_30, a name x0216_",
  ]
  const said = withTheNewNumbers(lines.join('\n'), HANDOVER, null)
  expect(said.text).toBe(lines.join('\n'))
  expect(said.changed).toBe(0)
  expect(said.cannot).toEqual([])
})

// MUTATION PROOF (after a green control): in withTheNewNumbers, never test a line against `patterned`; this case and
// the bounce below go red.
it('names each line that names a migration by a pattern, and rewrites none of them', () => {
  const lines = ["glob('drizzle/021[67]_*.sql')", 'const both = /^02\\d\\d_/', "'021?_'", 'drizzle/021*']
  const said = withTheNewNumbers(lines.join('\n'), HANDOVER, null)
  expect(said.cannot.map((one) => one.line)).toEqual([1, 2, 3, 4])
  expect(said.text).toBe(lines.join('\n'))
  // NOT PATTERNS: markdown bold, a version, a question with another number.
  expect(withTheNewNumbers('**02** and 0.21* and is it 03?', HANDOVER, null).cannot).toEqual([])
})

// MUTATION PROOF (after a green control): in whatFollows, answer 'its tag' where it answers 'inside a word', which is
// round 24's rule (any characters from the start of the tag); this case goes red, and so does the bounce of
// `0001_a_hand` below.
it('stops only where a word of the tag ends: a form that stops inside a word is listed, and its line is not rewritten', () => {
  const whole = withTheNewNumbers(['0216_a and 0216_a_ and `0217_a_resident_`', 'see 0216_a_handover_for_every_agent_'].join('\n'), HANDOVER, null)
  expect(whole.text.split('\n')).toEqual(['0228_a and 0228_a_ and `0229_a_resident_`', 'see 0228_a_handover_for_every_agent_'])
  expect(whole.cannot).toEqual([])
  const lines = ["migrationsBefore('0216_a_hand')", 'and 0216 beside 0217_a_res', 'and 0216_a_h']
  const said = withTheNewNumbers(lines.join('\n'), HANDOVER, null)
  expect(said.text).toBe(lines.join('\n'))
  expect(said.changed).toBe(0)
  expect(said.cannot.map((one: any) => [one.line, one.found])).toEqual([[1, '0216_a_hand'], [2, '0217_a_res'], [3, '0216_a_h']])
})

// MUTATION PROOF (after a green control): in renumberMigrationsBehindMain, choose the files to rewrite with the old
// `git grep -w` on the whole tag and the bare number; a file that names its migration only as `'0001_'` is not chosen,
// and this case goes red.
it('renames an entry\'s migrationsBefore(\'0001_\') at integration, in the line the entry wrote, and leaves its look-alikes', async () => {
  const { root, base } = fixture()
  const tip = branchNaming(root, base, ["migrationsBefore('0001_')", "the fixture '0001_branch_a' at 20010001"])
  mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip))
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_a_handover', to: '0006_a_handover' }])
  expect(read(boundary.state.integrated.clone, 'tests/naming.test.ts')).toBe("migrationsBefore('0006_')\nthe fixture '0001_branch_a' at 20010001\n")
}, 60_000)

// MUTATION PROOF (after a green control): in renumberMigrationsBehindMain, skip the refusal of a pattern line; this
// case goes red, integrated with the pattern left as it was.
it('bounces, with a sentence naming the line, an entry that names its migration by a pattern', async () => {
  const { root, base } = fixture()
  const tip = branchNaming(root, base, ['// the migrations this entry adds', "const mine = /^000[12]_/"])
  const main = mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip))
  expect(result.step).toBe('guard-failed')
  expect(result.facts.guard).toBe('migration-order')
  expect(result.facts.detail).toBe('Line 2 of tests/naming.test.ts names a migration by a pattern, `const mine = /^000[12]_/`, and which of 0001_a_handover it means cannot be told, so it was not renumbered.')
  expect(git(root, 'rev-parse', 'main')).toBe(main)
}, 60_000)

// MUTATION PROOF: the one written above the case that stops only where a word ends; this case goes red, integrated with
// `0001_a_hand` renamed to `0006_a_hand`.
it('bounces, with a sentence naming the line, an entry whose line stops inside a word of its migration\'s name', async () => {
  const { root, base } = fixture()
  const tip = branchNaming(root, base, ["migrationsBefore('0001_a_hand')"])
  const main = mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip))
  expect(result.step).toBe('guard-failed')
  expect(result.facts.guard).toBe('migration-order')
  expect(result.facts.detail).toBe('Line 1 of tests/naming.test.ts writes `0001_a_hand`, which stops inside a word of migration 0001_a_handover, so whether it names that migration cannot be told, and it was not renumbered.')
  expect(git(root, 'rev-parse', 'main')).toBe(main)
}, 60_000)
