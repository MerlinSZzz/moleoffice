// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE SWITCH, A LANDING CHANGES MAIN ONLY (wave 13q round 11, item 1; the secretary's 2jiiq4pQhQoy approved this rule).
 * Once the office runs from another checkout on the database the main checkout names, the main checkout serves nobody,
 * so a landing must not back up, migrate or prune the office's database from it. The rule is in
 * tools/merge-tool/the-stable-office.mjs and land.mjs applies it. It reads no worktree and no branch, so it holds for any
 * layout of the stable checkout.
 *
 * WHAT THIS FILE PROVES, with the real landGit on throwaway git repositories:
 *
 *   1. The office runs from another folder, an independent clone, on the database the main checkout's own settings
 *      name: main moves to the final commit, no npm script runs, and the landed step says why there was no backup and
 *      no migration. The settings are the real settings.mjs and the files it imports, copied into the main checkout,
 *      with a relative path in its .env, and the office names the file through a link.
 *   2. The office runs from the main checkout: the backup, the migration and the prune run as before, and the main
 *      checkout's settings are not asked.
 *   3. The office runs from another folder on another database, as a sandbox's office does: the landing is as before.
 *      Its folder is a worktree on branch stable, which the rule this one replaced would have read as the switch.
 *   4. The main checkout has no settings module, as the merger's own fixtures have none: the landing is as before.
 *   5. The database the main checkout names does not exist: the landing is as before.
 *   6. The office does not say where it runs, or which database it has open, or names a file that is not here: the
 *      landing stops before main moves, and nothing runs.
 *   7. The main checkout's own settings give no answer: the landing stops before main moves.
 *   8. A landing taken up again after main moved keeps what its first run decided, and does not ask again.
 *   9. The readers: a path is compared through links, and the settings' answer is found among their warnings.
 *
 * Every fixture is synthetic. The repositories and database files are made in the system's temporary folder and
 * removed after. The office doors and the npm scripts are stand-ins that record what they were asked, so no office,
 * database or server is reached. The question to the main checkout's settings is the one process that runs for real.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  folder: '',
  state: {} as Record<string, any>,
  logs: [] as string[],
  runs: [] as { name: string; args: string[]; cwd: string }[],
  steps: [] as { name: string; facts: any; detail: any }[],
  runtime: null as unknown,
  runtimeAsked: 0,
  healthFails: 0,
}))

const SYNTHETIC_GIT = vi.hoisted(() => (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
}))

vi.mock('../tools/merge-tool/arguments.mjs', async () => {
  const { theOfficeConfiguration } = await import('../tools/merge-tool/config.mjs')
  const { THE_MERGE_TOOLS_TEST_ADDRESS } = await import('./the-test-commit-address.mjs')
  return {
    THE_OFFICE_CONFIGURATION: theOfficeConfiguration({ repository: fileURLToPath(new URL('..', import.meta.url)), commitEmail: THE_MERGE_TOOLS_TEST_ADDRESS }),
    MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 30_000,
    get WORKDIR() { return join(boundary.folder, 'logs') },
    chosen: { entry: 'synthetic-entry' },
  }
})
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (why: string) => { throw new Error(why) },
  log: (line: string) => { boundary.logs.push(line) },
  stamp: () => '2026-10-18 18:00:00',
  readState: () => boundary.state,
  writeState: (patch: Record<string, any>) => { boundary.state = { ...boundary.state, ...patch }; return boundary.state },
}))
vi.mock('../tools/merge-tool/git.mjs', () => {
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: SYNTHETIC_GIT(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  return {
    git,
    tryGit: (cwd: string, args: string[]) => {
      const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: SYNTHETIC_GIT() })
      return { ok: r.status === 0, stdout: r.stdout.trim(), stderr: r.stderr.trim() }
    },
    changedBetween: (cwd: string, from: string, to: string) => git(cwd, ['diff', '--name-only', from, to]).split('\n').filter((path) => path !== ''),
    packageScripts: (cwd: string) => JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).scripts ?? {},
    // The runner's own MOLE_OFFICE_ settings are left out, so the main checkout's .env alone names its database.
    cleanEnvironment: (extra: Record<string, string> = {}) => ({
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && !name.startsWith('MOLE_OFFICE_'))),
      ...extra,
    }),
    // Each npm script is a stand-in that writes the answer its real script prints, so land.mjs reads a real log file.
    // The question to the main checkout's own settings runs for real, as land.mjs asks it.
    run: async (name: string, command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      boundary.runs.push({ name, args, cwd: options.cwd })
      const outFile = join(boundary.folder, 'logs', `${name}-${String(boundary.runs.length)}.log`)
      if (name === 'root-database') {
        const asked = spawnSync(command, args, { cwd: options.cwd, env: options.env, encoding: 'utf8', timeout: 30_000 })
        const said = `${asked.stdout}${asked.stderr}`
        writeFileSync(outFile, said)
        return { code: asked.status, outFile, tail: said.trim().split('\n').slice(-12).join('\n'), timedOut: false }
      }
      const said = name === 'db-backup' ? JSON.stringify({ from: join(boundary.folder, 'synthetic.db'), to: join(boundary.folder, 'synthetic-copy.db') }, null, 2)
        : name === 'db-prune-backups' ? JSON.stringify({ removed: [], kept: [], left: [] })
        : 'synthetic migration'
      writeFileSync(outFile, `${said}\n`)
      return { code: 0, outFile, tail: said, timedOut: false }
    },
  }
})
vi.mock('../tools/merge-tool/office-keeper.mjs', () => ({
  step: async (name: string, facts: any, detail: any) => { boundary.steps.push({ name, facts, detail }); return { state: name === 'landed' ? 'merged' : name } },
  theOfficesRuntime: async () => { boundary.runtimeAsked += 1; return boundary.runtime },
  waitForHealth: async () => {
    if (boundary.healthFails > 0) { boundary.healthFails -= 1; throw new Error('Synthetic: the office did not answer its health check') }
    return { says: 'synthetic health passed' }
  },
  conflictsAfterLanding: async () => [],
  runInSandbox: async () => { throw new Error('Unexpected sandbox run') },
  theSandbox: async () => { throw new Error('Unexpected sandbox') },
}))
vi.mock('../tools/merge-tool/red-files.mjs', () => ({
  whatTheRunSaid: () => { throw new Error('Unexpected red-files read') },
  whyARunGaveNoResult: () => { throw new Error('Unexpected red-files read') },
}))
vi.mock('../tools/merge-tool/documents.mjs', () => ({ carryPastDocuments: async () => null, theRecordCarriedForward: () => {}, untilNoOtherLandingOf: async () => {} }))
vi.mock('../tools/merge-tool/push.mjs', () => ({ pushLanded: async () => ({ ok: true, says: 'Synthetic push.' }) }))
vi.mock('../src/config/whole-suite-red.mjs', () => ({ wholeSuiteFixRoundIsOn: () => false }))

import * as officeKeeper from '../tools/merge-tool/office-keeper.mjs'
import { wholeSuiteFixRoundIsOn } from '../src/config/whole-suite-red.mjs'
import { pluginPagesPosition } from '../src/config/integration-guards.mjs'
import { landGit as landGitFixture } from '../tools/merge-tool/land.mjs'
const notReached = (name: string) => () => { throw new Error(`Synthetic: ${name} is not reached in this file`) }
const landGit = (entry: any) => landGitFixture(entry, {
  replayOnly: true,
  step: officeKeeper.step,
  theOfficesRuntime: officeKeeper.theOfficesRuntime,
  waitForHealth: officeKeeper.waitForHealth,
  conflictsAfterLanding: officeKeeper.conflictsAfterLanding,
  runInSandbox: officeKeeper.runInSandbox,
  theSandbox: officeKeeper.theSandbox,
  ask: notReached('ask'),
  countAGateMet: notReached('countAGateMet'),
  theLane: notReached('theLane'),
  sleep: notReached('sleep'),
  wholeSuiteFixRoundIsOn,
  pluginPagesPosition,
})
import { theDatabaseNamedIn, theOfficeRunsFrom } from '../tools/merge-tool/the-stable-office.mjs'
import { whatACopyOfSettingsCarries } from './what-a-copy-of-settings-carries.ts'

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: SYNTHETIC_GIT(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** This checkout, whose settings module and what it imports are copied into each main checkout. */
const THIS_REPOSITORY = fileURLToPath(new URL('..', import.meta.url))

/** A main checkout at M, a final commit Cfinal that adds a migration, and the integrated clone detached at Cfinal. */
function aLane() {
  const root = join(boundary.folder, 'main')
  mkdirSync(root)
  git(root, 'init', '-qb', 'main')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'db:backup': 'synthetic', 'db:migrate': 'synthetic', 'db:prune-backups': 'synthetic' } }))
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'Synthetic main')
  const M = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-qc', 'entry')
  mkdirSync(join(root, 'drizzle'))
  writeFileSync(join(root, 'drizzle', '0001_made_up.sql'), '-- synthetic migration\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'Synthetic entry with a migration')
  const Cfinal = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  const clone = join(boundary.folder, 'clone')
  execFileSync('git', ['clone', '-q', '--no-local', root, clone], { env: SYNTHETIC_GIT(), stdio: 'ignore' })
  git(clone, 'checkout', '-q', '--detach', Cfinal)
  boundary.state = { integrated: { M, Cfinal, clone } }
  return { root, M, Cfinal, clone, entry: { state: 'landing', changeset: { root } } }
}

/**
 * The main checkout's own settings: this checkout's settings.mjs and every file it imports, copied in untracked, and a
 * .env that names the database by a path relative to the checkout, as the server reads it. The files are read from
 * settings.mjs's imports, so a module it starts to import is copied too, from src/config or from outside it.
 */
function itsOwnSettings(root: string): string {
  for (const file of whatACopyOfSettingsCarries(THIS_REPOSITORY)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    cpSync(join(THIS_REPOSITORY, file), join(root, file))
  }
  writeFileSync(join(root, '.env'), 'MOLE_OFFICE_DB=./data/synthetic.db\n')
  return join(root, 'data', 'synthetic.db')
}

/** A synthetic database file: a few bytes, never opened. */
function aDatabaseFile(path: string): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'synthetic database\n')
  return path
}

/** An independent clone of the main checkout at M, which shares nothing with it: the layout the rule must not depend on. */
function anIndependentClone(root: string, M: string, name: string): string {
  const folder = join(boundary.folder, name)
  execFileSync('git', ['clone', '-q', '--no-local', root, folder], { env: SYNTHETIC_GIT(), stdio: 'ignore' })
  git(folder, 'checkout', '-q', '--detach', M)
  return folder
}

const STOPPED = /Main is at [0-9a-f]{40}; this run backed up nothing and migrated nothing/

beforeEach(() => {
  boundary.folder = realpathSync(mkdtempSync(join(tmpdir(), 'landing-after-the-switch-')))
  mkdirSync(join(boundary.folder, 'logs'))
  Object.assign(boundary, { state: {}, logs: [], runs: [], steps: [], runtime: null, runtimeAsked: 0, healthFails: 0 })
})
afterEach(() => { rmSync(boundary.folder, { recursive: true, force: true }) })

it('changes main only when the office runs from another folder on the database the main checkout names', async () => {
  const lane = aLane()
  aDatabaseFile(itsOwnSettings(lane.root))
  const stable = anIndependentClone(lane.root, lane.M, 'stable')
  symlinkSync(lane.root, join(boundary.folder, 'main-by-a-link'))
  const named = join(boundary.folder, 'main-by-a-link', 'data', 'synthetic.db')
  boundary.runtime = { repository: { path: stable }, database: { path: named } }

  const landed = await landGit(lane.entry)

  expect(landed.state).toBe('merged')
  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(git(stable, 'rev-parse', 'HEAD')).toBe(lane.M)
  expect(boundary.runs.map((one) => [one.name, one.cwd])).toEqual([['root-database', lane.root]])
  expect(boundary.runtimeAsked).toBe(1)
  expect(boundary.state.landing.office.mainOnly).toBe(true)
  expect(boundary.state.landing.pruned).toBeNull()
  expect(boundary.logs).toContain(`the office runs from ${stable} on ${named}, the database ${lane.root} names, so this landing changes main only: no backup, no migration and no prune from ${lane.root}`)
  const says = boundary.steps.find((one) => one.name === 'landed')!.facts.says
  expect(says).toContain(`no backup: the office runs from ${stable} on the database ${lane.root} names, so the landing changes main only`)
  expect(says).toContain(`not migrated: the office runs from ${stable}, which changes only through an upgrade`)
}, 30_000)

it('backs up, migrates and prunes as before while the office runs from the main checkout, without asking its settings', async () => {
  const lane = aLane()
  const database = aDatabaseFile(itsOwnSettings(lane.root))
  boundary.runtime = { repository: { path: lane.root }, database: { path: database } }

  await landGit(lane.entry)

  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.map((one) => [one.name, one.cwd])).toEqual([['db-backup', lane.root], ['db-migrate', lane.clone], ['db-prune-backups', lane.root]])
  expect(boundary.state.landing.office.mainOnly).toBe(false)
  expect(boundary.state.landing.migrated.beforeTheMove).toBe(true)
  expect(boundary.logs).toContain(`the office runs from ${lane.root}, so the landing backs up and migrates as before`)
}, 30_000)

it('lands as before when the office runs from another folder on another database, as a sandbox’s office does', async () => {
  const lane = aLane()
  const named = aDatabaseFile(itsOwnSettings(lane.root))
  const sandbox = join(boundary.folder, 'sandbox')
  git(lane.root, 'worktree', 'add', '-q', '--lock', '-b', 'stable', sandbox, lane.M)
  const its = aDatabaseFile(join(sandbox, 'data', 'synthetic.db'))
  boundary.runtime = { repository: { path: sandbox }, database: { path: its } }

  await landGit(lane.entry)

  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.map((one) => [one.name, one.cwd])).toEqual([['root-database', lane.root], ['db-backup', lane.root], ['db-migrate', lane.clone], ['db-prune-backups', lane.root]])
  expect(boundary.state.landing.office.mainOnly).toBe(false)
  expect(boundary.logs).toContain(`the office runs from ${sandbox} on ${its}, not on ${named}, which ${lane.root} names, so the landing backs up and migrates as before`)
}, 30_000)

it('lands as before when the main checkout has no settings module, as the merger’s own fixtures have none', async () => {
  const lane = aLane()
  const elsewhere = anIndependentClone(lane.root, lane.M, 'elsewhere')
  boundary.runtime = { repository: { path: elsewhere }, database: { path: aDatabaseFile(join(elsewhere, 'data', 'synthetic.db')) } }

  await landGit(lane.entry)

  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.map((one) => one.name)).toEqual(['db-backup', 'db-migrate', 'db-prune-backups'])
  expect(boundary.logs).toContain(`the office runs from ${elsewhere}, and ${lane.root} has no src/config/settings.mjs to name a database, so the landing backs up and migrates as before`)
}, 30_000)

it('lands as before when the database the main checkout names does not exist', async () => {
  const lane = aLane()
  const named = itsOwnSettings(lane.root)
  const elsewhere = anIndependentClone(lane.root, lane.M, 'elsewhere')
  const its = aDatabaseFile(join(elsewhere, 'data', 'synthetic.db'))
  boundary.runtime = { repository: { path: elsewhere }, database: { path: its } }

  await landGit(lane.entry)

  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.map((one) => one.name)).toEqual(['root-database', 'db-backup', 'db-migrate', 'db-prune-backups'])
  expect(boundary.logs).toContain(`the office runs from ${elsewhere} on ${its}; ${lane.root} names ${named}, which does not exist, so the landing backs up and migrates as before`)
}, 30_000)

it('stops before main moves when the office does not say where it runs or which database it has open', async () => {
  // The system's temporary folder exists, and is not the main checkout.
  const nowhere = join(tmpdir(), 'no-such-synthetic-database.db')
  const cases: [unknown, (root: string) => string][] = [
    [null, (root) => `the office gave no runtime answer naming the folder it runs from, so the landing cannot tell whether it runs on the database ${root} names`],
    [{ repository: {} }, (root) => `the office gave no runtime answer naming the folder it runs from, so the landing cannot tell whether it runs on the database ${root} names`],
    [{ repository: { path: tmpdir() } }, (root) => `the office runs from ${tmpdir()} and names no database file it has open, so the landing cannot tell whether it runs on the database ${root} names`],
    [{ repository: { path: tmpdir() }, database: { path: nowhere } }, (root) => `the office runs from ${tmpdir()} on ${nowhere}, which is not a file here, so the landing cannot tell whether it is the database ${root} names`],
  ]
  for (const [runtime, said] of cases) {
    rmSync(boundary.folder, { recursive: true, force: true })
    mkdirSync(join(boundary.folder, 'logs'), { recursive: true })
    Object.assign(boundary, { logs: [], runs: [], steps: [], runtime })
    const lane = aLane()
    aDatabaseFile(itsOwnSettings(lane.root))

    const stopped = await landGit(lane.entry).then(() => null, (err: Error) => err.message)

    expect(stopped).toContain(`${said(lane.root)}. Main is at ${lane.M}; this run backed up nothing and migrated nothing.`)
    expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.M)
    expect(boundary.runs).toEqual([])
    expect(boundary.state.landing.backedUp).toBeNull()
    expect(boundary.state.landing.migrated).toBeNull()
    expect(boundary.steps).toEqual([])
  }
}, 60_000)

it('stops before main moves when the main checkout’s own settings give no answer', async () => {
  const modules: [string, RegExp][] = [
    ["throw new Error('synthetic: these settings cannot be read')\n", /\(exit 1\)/],
    ['export function settings() { return {} }\n', /\(exit 0\)/],
  ]
  for (const [module, exit] of modules) {
    rmSync(boundary.folder, { recursive: true, force: true })
    mkdirSync(join(boundary.folder, 'logs'), { recursive: true })
    Object.assign(boundary, { logs: [], runs: [], steps: [] })
    const lane = aLane()
    mkdirSync(join(lane.root, 'src', 'config'), { recursive: true })
    writeFileSync(join(lane.root, 'src', 'config', 'settings.mjs'), module)
    const elsewhere = anIndependentClone(lane.root, lane.M, 'elsewhere')
    boundary.runtime = { repository: { path: elsewhere }, database: { path: aDatabaseFile(join(elsewhere, 'data', 'synthetic.db')) } }

    const stopped = await landGit(lane.entry).then(() => null, (err: Error) => err.message)

    expect(stopped).toContain(`${lane.root}'s own src/config/settings.mjs did not say which database it names`)
    expect(stopped).toMatch(exit)
    expect(stopped).toMatch(STOPPED)
    expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.M)
    expect(boundary.runs.map((one) => one.name)).toEqual(['root-database'])
    expect(boundary.steps).toEqual([])
  }
}, 60_000)

it('keeps what its first run decided when a landing is taken up again after main moved', async () => {
  const lane = aLane()
  const named = aDatabaseFile(itsOwnSettings(lane.root))
  const stable = anIndependentClone(lane.root, lane.M, 'stable')
  boundary.runtime = { repository: { path: stable }, database: { path: named } }
  boundary.healthFails = 1

  await expect(landGit(lane.entry)).rejects.toThrow('Synthetic: the office did not answer its health check')
  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.state.landing.office.mainOnly).toBe(true)

  // An office that now gives no runtime answer would stop a landing that asked again.
  boundary.runtime = null
  const landed = await landGit(lane.entry)

  expect(landed.state).toBe('merged')
  expect(boundary.runtimeAsked).toBe(1)
  expect(boundary.runs.map((one) => one.name)).toEqual(['root-database'])
  expect(boundary.steps.find((one) => one.name === 'landed')!.facts.says).toContain(`no backup: the office runs from ${stable}`)
}, 30_000)

it('compares the office’s folder through links, and finds the settings’ answer among their warnings', () => {
  const real = join(boundary.folder, 'real')
  mkdirSync(real)
  symlinkSync(real, join(boundary.folder, 'link'))
  expect(theOfficeRunsFrom({ repository: { path: join(boundary.folder, 'link') } }, real)).toBe(true)
  expect(theOfficeRunsFrom({ repository: { path: join(boundary.folder, 'missing') } }, real)).toBe(false)
  expect(theOfficeRunsFrom({ repository: {} }, real)).toBe(false)
  expect(theOfficeRunsFrom(null, real)).toBe(false)

  expect(theDatabaseNamedIn('no .env file; using built-in defaults\n{"databasePath":"/synthetic/data/x.db"}\n')).toBe('/synthetic/data/x.db')
  expect(theDatabaseNamedIn('{"databasePath":""}\n{"databasePath":\n')).toBeNull()
  expect(theDatabaseNamedIn('synthetic: these settings cannot be read\n')).toBeNull()
})
