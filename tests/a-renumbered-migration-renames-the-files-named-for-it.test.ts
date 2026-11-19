// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MIGRATION RENUMBERED AT INTEGRATION RENAMES THE FILES THE ENTRY ADDS THAT ARE NAMED FOR IT (wave 13u round 130). At
 * integration the merge tool renumbered one entry's handbook migration from 0306 to 0309. It rewrote a comment in the
 * schema that named the migration's own test file, but it did not rename that file, so the comment named a file that did
 * not exist and the lane check refused the entry. A file the entry adds is now renamed by the rule the lines follow
 * (withTheNewNumbers), on both renumbering paths: the commits written again behind main, and the queue commit after a
 * collision. A name that rule cannot read refuses the renumbering, as a line does. Real temporary git trees; the office
 * and the sandbox are stubs, as in the round 24 and round 27 tests of the wave before, whose fixtures this copies.
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
  MergerFailure: class MergerFailure extends Error {},
  fail: (words: string) => { throw Error(words) }, log: (words: string) => boundary.logs.push(words),
  stamp: () => '2026-10-30 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
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
const tagsOf = (root: string, at: string) => JSON.parse(git(root, 'show', `${at}:drizzle/meta/_journal.json`)).entries.map((one: any) => one.tag)
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }
const nothingQueued = { rows: [], read: [], unread: [], lane: null }

/** The made-up test file each entry adds for its migration, under the number it was written with and the one it lands with. */
const HANDOVER_TEST = { was: 'tests/migration-0001-a-handover.test.ts', is: 'tests/migration-0006-a-handover.test.ts' }
const ENTRY_TEST = { was: 'tests/migration-0001-entry.test.ts', is: 'tests/migration-0002-entry.test.ts' }
/** The schema's line naming that test, as the handbook migration's schema comment did. */
const naming = (path: string) => `/** The table above is checked by ${path}. */`

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
  write(root, 'src/schema.ts', 'export const base = 1\n')
  const base = commit(root, 'Synthetic main at 0000')
  return { root, base }
}

/** The entry: one commit adds migration 0001_a_handover, a later one adds `testPath` for it and, unless told not to, a schema line naming it. */
function anEntryWithItsOwnTest(root: string, base: string, testPath: string, schemaLine = true) {
  git(root, 'switch', '-qc', 'entry', base)
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 200, 'a_handover')]))
  write(root, 'drizzle/0001_a_handover.sql', 'CREATE TABLE handover_table (value TEXT);\n')
  commit(root, 'Synthetic entry adds its migration')
  write(root, testPath, "import {expect,it} from 'vitest'\nit('reads drizzle/0001_a_handover.sql', () => expect(true).toBe(true))\n")
  if (schemaLine) write(root, 'src/schema.ts', `${read(root, 'src/schema.ts')}${naming(testPath)}\n`)
  const tip = commit(root, 'Synthetic entry tests its migration')
  git(root, 'switch', '-q', 'main')
  return tip
}

function mainAdds(root: string, idx: number, when: number, name: string) {
  const rows = JSON.parse(read(root, 'drizzle/meta/_journal.json')).entries
  write(root, 'drizzle/meta/_journal.json', journal([...rows, row(idx, when, name)]))
  write(root, `drizzle/${row(idx, when, name).tag}.sql`, `CREATE TABLE ${name}_table (value TEXT);\n`)
  return commit(root, `Synthetic main adds ${row(idx, when, name).tag}`)
}

/** Main and the entry each add migration 0001 and a case for it, so the rebase stops and the collision path renumbers. */
function theCollision() {
  const { root, base } = fixture()
  git(root, 'switch', '-qc', 'entry')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 200, 'entry')]))
  write(root, 'drizzle/0001_entry.sql', 'CREATE TABLE entry_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + "it('0001_entry adds entry_table', () => expect(true).toBe(true))\n")
  write(root, ENTRY_TEST.was, "import {expect,it} from 'vitest'\nit('reads drizzle/0001_entry.sql', () => expect(true).toBe(true))\n")
  write(root, 'src/schema.ts', `${read(root, 'src/schema.ts')}${naming(ENTRY_TEST.was)}\n`)
  const tip = commit(root, 'Synthetic entry adds 0001_entry and its test')
  git(root, 'switch', '-q', 'main')
  write(root, 'drizzle/meta/_journal.json', journal([row(0, 100, 'base'), row(1, 300, 'main')]))
  write(root, 'drizzle/0001_main.sql', 'CREATE TABLE main_table (value TEXT);\n')
  write(root, 'tests/migration.test.ts', read(root, 'tests/migration.test.ts') + "it('0001_main adds main_table', () => expect(true).toBe(true))\n")
  commit(root, 'Synthetic main adds 0001_main')
  return { root, base, tip }
}

beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-renumber-renames-files-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))

// MUTATION PROOF (after a green control): in renumberMigrationsBehindMain, leave out the move of a renamed file's index
// entry. This case goes red: the clone still holds the test under 0001, and the schema line names a file it does not have.
it('behind main: the test file the entry adds under the old number is added under the new one, so the schema line that names it still names a file', async () => {
  const { root, base } = fixture()
  const tip = anEntryWithItsOwnTest(root, base, HANDOVER_TEST.was)
  const main = mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip), { queued: nothingQueued })
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_a_handover', to: '0006_a_handover' }])
  const clone = boundary.state.integrated.clone
  expect(tagsOf(clone, 'HEAD')).toEqual(['0000_base', '0005_later', '0006_a_handover'])
  expect(read(clone, 'src/schema.ts')).toBe(`export const base = 1\n${naming(HANDOVER_TEST.is)}\n`)
  expect(existsSync(join(clone, HANDOVER_TEST.is)), 'the file the schema line names').toBe(true)
  expect(existsSync(join(clone, HANDOVER_TEST.was))).toBe(false)
  expect(read(clone, HANDOVER_TEST.is)).toContain("it('reads drizzle/0006_a_handover.sql'")
  // THE COMMIT THAT ADDS THE FILE ADDS IT UNDER ITS NEW NAME, and no commit of the entry names the old one.
  const added = git(clone, 'log', '--format=', '--name-status', '--no-renames', `${main}..HEAD`)
  expect(added).toContain(`A\t${HANDOVER_TEST.is}`)
  expect(added).not.toContain(HANDOVER_TEST.was)
  expect(boundary.logs.join('\n')).toContain(`; the files named for them were renamed: ${HANDOVER_TEST.was} -> ${HANDOVER_TEST.is}`)
}, 60_000)

// MUTATION PROOF (after a green control): in followTheNewNumbers, leave out the rename of a file the entry adds. This case
// goes red: the queue commit leaves the test under 0001, and the schema line names a file the clone does not have.
it('after a collision: the queue commit renames the test file the entry adds, so the schema line that names it still names a file', async () => {
  const { root, base, tip } = theCollision()
  const result = await integrateGit(entry(root, base, tip), { queued: nothingQueued })
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  expect(result.facts.renumberedMigrations).toEqual([{ from: '0001_entry', to: '0002_entry' }])
  const clone = boundary.state.integrated.clone
  expect(read(clone, 'src/schema.ts')).toBe(`export const base = 1\n${naming(ENTRY_TEST.is)}\n`)
  expect(existsSync(join(clone, ENTRY_TEST.is)), 'the file the schema line names').toBe(true)
  expect(existsSync(join(clone, ENTRY_TEST.was))).toBe(false)
  expect(read(clone, ENTRY_TEST.is)).toContain("it('reads drizzle/0002_entry.sql'")
  expect(git(clone, 'status', '--porcelain')).toBe('')
  expect(boundary.logs.join('\n')).toContain(`; the files named for them were renamed: ${ENTRY_TEST.was} -> ${ENTRY_TEST.is}`)
}, 60_000)

// MUTATION PROOF (after a green control): in renumberMigrationsBehindMain, skip the refusal of a file name the rule cannot
// read. This case goes red: the entry integrates, with the file left under its old number.
it('behind main: an entry that adds a file whose name stops inside a word of its migration\'s tag is refused, with a sentence naming the file', async () => {
  const { root, base } = fixture()
  const tip = anEntryWithItsOwnTest(root, base, 'tests/0001_a_hand.test.ts', false)
  const main = mainAdds(root, 5, 500, 'later')
  const result = await integrateGit(entry(root, base, tip), { queued: nothingQueued })
  expect(result.step).toBe('guard-failed')
  expect(result.facts.guard).toBe('migration-order')
  expect(result.facts.detail).toBe('The name of tests/0001_a_hand.test.ts writes `0001_a_hand`, which stops inside a word of migration 0001_a_handover, so whether it names that migration cannot be told, and it was not renumbered.')
  expect(git(root, 'rev-parse', 'main')).toBe(main)
}, 60_000)
