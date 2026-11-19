// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real temporary git trees and real npm builds. Office and sandbox boundaries below are explicit stubs. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { aTestAddress } from './the-test-commit-address.mjs'
import { theMoveAStepMakes } from '../src/shared/merge-queue.ts'

const boundary = vi.hoisted(() => ({ folder: '', logs: [] as string[], state: {} as Record<string, any>, steps: [] as { name: string; facts: Record<string, any>; detail: any }[], builds: [] as string[], sandboxes: 0 }))
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
  stamp: () => '2026-10-08 00:00:00', writeState: (patch: Record<string, any>) => { boundary.state = patch },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ theRecordOfMain: () => ({ record: null }), theDocumentsOf: () => ({ none: 'Synthetic code entry' }) }))
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  theSeal: async (entry: any) => ({ git: { commit: entry.changeset.commit, files: Object.entries(entry.machine.judged).map(([path, hash]) => ({ path, hash })) } }),
  theSandbox: async () => { boundary.sandboxes++; standIn('up', 'merge', '--name', 'synthetic-sandbox', '--from', boundary.folder); return { name: 'synthetic-sandbox', folder: join(boundary.folder, 'sandboxes', 'synthetic-sandbox') } },
  step: async (name: string, facts: Record<string, any>, detail: any) => { boundary.steps.push({ name, facts, detail }); return { step: name, facts } },
  keepTheReport: () => { throw Error('No report copying in these fixtures') },
  runInSandbox: async (_sandbox: any, label: string, command: string, args: string[], options: any) => {
    // The boundary is stubbed, not the build: execute the fixture's actual npm script in its joined clone.
    boundary.builds.push(options.cwd)
    const result = standIn('exec', 'synthetic-sandbox', '--cwd', options.cwd, '--wait', '--plain-env', '--timeout', '30', '--', command, ...args)
    const outFile = join(boundary.folder, 'logs', label + '.log')
    writeFileSync(outFile, result.stdout + result.stderr)
    return { code: result.status, signal: result.signal, timedOut: false, outFile, tail: (result.stdout + result.stderr).split('\n').slice(-12).join('\n'), ...(result.error ? { error: result.error.message } : {}) }
  },
}))
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { integrateGit as replayGitFixture, pinGit } from '../tools/merge-tool/integrate.mjs'
// This fixture measures the replay before it becomes a landing commit.
import { THE_INTEGRATION_A_TEST_GIVES } from './the-integration-reads-a-test-gives.ts'
const integrateGit = (entry: any, options: any = {}) => replayGitFixture(entry, { ...THE_INTEGRATION_A_TEST_GIVES, ...options, landing: false })

function git(root: string, ...args: string[]) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function write(root: string, path: string, text: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
function commit(root: string, message: string) { git(root, 'add', '-A'); git(root, 'commit', '-qm', message); return git(root, 'rev-parse', 'HEAD') }
function fixture() {
  const root = join(boundary.folder, 'repo'); mkdirSync(root)
  git(root, 'init', '-qb', 'main'); git(root, 'config', 'user.name', 'Synthetic fixture'); git(root, 'config', 'user.email', aTestAddress('fixture'))
  write(root, '.mole-office/protected.json', JSON.stringify({ protected: [], generated: [] }))
  write(root, 'package.json', JSON.stringify({ private: true, scripts: { build: 'node build.cjs' } }))
  write(root, 'build.cjs', "process.exit(0)\n")
  write(root, 'src/shared.txt', 'original\n')
  const base = commit(root, 'Synthetic original main')
  return { root, base }
}
function entry(root: string, base: string, tip: string) { return { changeset: { root, base, commit: tip }, seal: { id: 'synthetic-seal' }, machine: { judged: {} } } }
beforeEach(() => {
  boundary.folder = mkdtempSync(join(tmpdir(), 'merge-migrations-round-12-'))
  mkdirSync(join(boundary.folder, 'logs')); boundary.logs = []; boundary.steps = []; boundary.state = {}; boundary.builds = []; boundary.sandboxes = 0
})
afterEach(() => rmSync(boundary.folder, { recursive: true, force: true }))


const REPO = fileURLToPath(new URL('..', import.meta.url))
function standIn(...args: string[]) {
  return spawnSync(process.execPath, [join(REPO, 'tests/stand-in-sandbox-tool.mjs'), ...args.slice(0, args.indexOf('--') < 0 ? args.length : args.indexOf('--')), '--sandboxes', join(boundary.folder, 'sandboxes'), ...args.slice(args.indexOf('--') < 0 ? args.length : args.indexOf('--'))], {encoding: 'utf8', timeout: 60_000})
}
const zero = {idx:0,version:'6',when:100,tag:'0000_base',breakpoints:true}
const journal = (rows: any[]) => JSON.stringify({version:'7',dialect:'sqlite',entries:rows},null,2)+'\n'
function migrationsFixture(codeConflict = false) {
  const {root} = fixture()
  write(root, '.gitignore', 'node_modules\n')
  symlinkSync(join(REPO,'node_modules'),join(root,'node_modules'))
  write(root,'drizzle/meta/_journal.json',journal([zero]))
  write(root,'drizzle/0000_base.sql','CREATE TABLE base_table (value TEXT);\n')
  write(root,'tests/migration.test.ts', "import {expect,it} from 'vitest'\n")
  const test = `it('0001_entry is applied after main', async () => { const Database = (await import('better-sqlite3')).default; const {drizzle} = await import('drizzle-orm/better-sqlite3'); const {migrate} = await import('drizzle-orm/better-sqlite3/migrator'); const db = new Database(${JSON.stringify(join(boundary.folder,'database.sqlite'))}); try { migrate(drizzle(db),{migrationsFolder:'drizzle'}); expect(db.prepare("SELECT name FROM sqlite_master WHERE name='entry_table'").get()).toBeDefined() } finally {db.close()} })\n`
  const base = commit(root,'Synthetic migration baseline')
  git(root,'switch','-qc','entry')
  write(root,'drizzle/meta/_journal.json',journal([zero,{...zero,idx:1,when:200,tag:'0001_entry'}]))
  write(root,'drizzle/0001_entry.sql','-- Migration 0001: synthetic fixture\nCREATE TABLE entry_table (value TEXT);\n')
  write(root,'tests/migration.test.ts',readFileSync(join(root,'tests/migration.test.ts'),'utf8')+test)
  const tip = commit(root,'Synthetic entry migration')
  if(codeConflict) { write(root,'src/shared.txt','later entry code\n'); commit(root,'Synthetic later entry conflict') }
  const finalTip = git(root,'rev-parse','HEAD')
  git(root,'switch','-q','main')
  write(root,'drizzle/meta/_journal.json',journal([zero,{...zero,idx:1,when:300,tag:'0001_main'}]))
  write(root,'drizzle/0001_main.sql','CREATE TABLE main_table (value TEXT);\n')
  write(root,'tests/migration.test.ts',readFileSync(join(root,'tests/migration.test.ts'),'utf8')+"it('0001_main exists', () => expect(true).toBe(true))\n")
  if(codeConflict) write(root,'src/shared.txt','main code\n')
  const main = commit(root,'Synthetic first migration landed')
  const db = new Database(join(boundary.folder,'database.sqlite'))
  migrate(drizzle(db),{migrationsFolder:join(root,'drizzle')}); db.close()
  return {root,base,tip:finalTip,main,firstTip:tip}
}

it('renumbers the second migration in one queue commit, advances when, preserves SQL and passes the real migration case through the stand-in suite', async () => {
  const {root,base,tip,main} = migrationsFixture()
  const result = await integrateGit(entry(root,base,tip))
  expect(result.step, JSON.stringify(result.facts)).toBe('integrated')
  const clone = boundary.state.integrated.clone
  const joined = JSON.parse(readFileSync(join(clone,'drizzle/meta/_journal.json'),'utf8')).entries
  expect(joined.map((one:any)=>one.tag)).toEqual(['0000_base','0001_main','0002_entry'])
  expect(joined[2].idx).toBe(2)
  expect(readFileSync(join(clone,'drizzle/0002_entry.sql'),'utf8')).toBe(git(root,'show',`${tip}:drizzle/0001_entry.sql`)+'\n')
  expect(git(clone,'log','--format=%s',`${main}..HEAD`)).toContain('Synthetic entry migration')
  expect(git(clone,'log','--format=%s',`${main}..HEAD`).split('\n').filter((one:string)=>one.startsWith('Renumber migrations'))).toEqual(['Renumber migrations at integration: 0001_entry -> 0002_entry'])
  expect(result.facts.renumberedMigrations).toEqual([{from:'0001_entry',to:'0002_entry'}])
  expect(readFileSync(join(clone,'tests/migration.test.ts'),'utf8')).toContain("it('0002_entry")
  const suite = standIn('exec','synthetic-sandbox','--cwd',clone,'--wait','--plain-env','--timeout','30','--',process.execPath,join(REPO,'node_modules/vitest/vitest.mjs'),'run','--no-file-parallelism','tests/migration.test.ts')
  expect(suite.status, suite.stdout+suite.stderr).toBe(0)
  expect(joined[2].when).toBeGreaterThan(joined[1].when)
  const db = new Database(join(boundary.folder,'database.sqlite')); try {expect(db.prepare("SELECT name FROM sqlite_master WHERE name='entry_table'").get()).toBeDefined()} finally {db.close()}
  expect(git(root,'rev-parse','HEAD')).toBe(main)
  expect(git(root,'rev-parse','entry')).toBe(tip)
},60_000)

it('bounces a real conflict besides migration additions, including a later commit hidden behind the first journal conflict', async () => {
  const {root,base,tip,main} = migrationsFixture(true)
  const result = await integrateGit(entry(root,base,tip))
  expect(result.step).toBe('conflict'); expect(result.facts.files).toContain('src/shared.txt')
  expect(boundary.state.integrated).toBeUndefined(); expect(boundary.builds).toEqual([])
  expect(git(root,'rev-parse','HEAD')).toBe(main)
},60_000)

it.each([
 ['quoted number', "CREATE TABLE entry_table (value TEXT);\nINSERT INTO entry_table VALUES ('0001');\n"],
 ['number in an identifier', "CREATE TABLE entry_0001 (value TEXT);\n"],
 ['embedded migration tag', "CREATE TABLE entry_table (value TEXT);\nINSERT INTO entry_table VALUES ('prefix_0001_entry_suffix');\n"],
 ['embedded unpadded number', "CREATE TABLE entry_table (value TEXT);\nINSERT INTO entry_table VALUES ('prefix_1_suffix');\n"],
])('refuses executable SQL that names its old migration number instead of silently changing its meaning: %s', async (_label, sql) => {
 const {root,base,main}=migrationsFixture()
 git(root,'switch','-q','entry')
 write(root,'drizzle/0001_entry.sql',sql)
 const tip=commit(root,'Synthetic SQL number dependency');git(root,'switch','-q','main')
 const result=await integrateGit(entry(root,base,tip))
 expect(result.step).toBe('conflict');expect(result.facts.says).toContain('SQL mentions its number')
 expect(boundary.builds).toEqual([]);expect(git(root,'rev-parse','HEAD')).toBe(main)
},60_000)

// WAVE 13v ROUND 15, ITEM 1: the pin replays the entry onto main. A conflict only in migration additions is left to the
// rebase, which may renumber it; any other conflict is reported as `cannotJoin`, and the office sends the entry back.
it('pins an entry that conflicts with main only in migration additions, and leaves the renumbering to the rebase', async () => {
  const {root,base,tip,main} = migrationsFixture()
  const result = await pinGit(entry(root,base,tip), THE_INTEGRATION_A_TEST_GIVES)
  expect(result.step).toBe('pinned'); expect(result.facts.cannotJoin).toBeUndefined()
  expect(boundary.logs.join('\n')).toContain(`the entry conflicts with main ${main} only in migration files`)
},60_000)

it('reports at the pin an entry whose commits cannot join main, with the commit that stops, its paths and its lines', async () => {
  const {root,base} = fixture()
  git(root,'switch','-qc','entry'); write(root,'src/shared.txt','entry code\n'); const tip = commit(root,'Synthetic entry code')
  git(root,'switch','-q','main'); write(root,'src/shared.txt','main code\n'); const main = commit(root,'Synthetic main code')
  const result = await pinGit(entry(root,base,tip), THE_INTEGRATION_A_TEST_GIVES)
  expect(result.step).toBe('pinned')
  expect(result.facts.cannotJoin).toEqual({mainAt:main,commit:tip,files:['src/shared.txt'],lines:[{path:'src/shared.txt',ranges:'1-5'}]})
},60_000)
