// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S LANDING RUNS THE BACKUP AND MIGRATE COMMANDS ITS CONFIGURATION NAMES (wave 13u round 200).
 *
 * WHAT THIS FILE PROVES, with the real landGit on throwaway git repositories:
 *
 *   1. A landing that carries a migration runs the made-up backup command in the main checkout, without the age floor,
 *      and then the made-up migrate command. It never runs `db:backup` or `db:migrate`.
 *   2. A landing with no migration runs the made-up backup command followed by `--if-older-than` and
 *      BACKUP_FLOOR_MINUTES, and runs no migrate command.
 *   3. A configuration whose backup command is not `npm run <script>` stops the landing with the sentence, and main
 *      does not move.
 *   4. A configuration whose `land.after` holds two steps stops the landing with the sentence, and main does not move.
 *
 * Every fixture is synthetic. The repositories are made in the system's temporary folder and removed after. The office
 * doors, the npm commands and the push are stand-ins that record what they were asked, so no office, database or server
 * is reached. The commands and the age floor are read from the made-up configuration or from an export. Cases 3 and 4
 * read the two stop sentences from land.mjs's exported functions, so the words are written in one place.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  folder: '',
  state: {} as Record<string, any>,
  logs: [] as string[],
  runs: [] as { name: string; command: string; args: string[]; cwd: string }[],
  steps: [] as { name: string; facts: any; detail: any }[],
  runtime: null as unknown,
  configuration: null as any,
}))

const SYNTHETIC_GIT = vi.hoisted(() => (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
}))

vi.mock('../tools/merge-tool/arguments.mjs', () => ({
  MIGRATIONS_FOLDER: 'drizzle/', SCRIPT_TIMEOUT_MS: 30_000,
  get WORKDIR() { return join(boundary.folder, 'logs') },
  get THE_OFFICE_CONFIGURATION() { return boundary.configuration },
  chosen: { entry: 'synthetic-entry' },
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({
  fail: (why: string) => { throw new Error(why) },
  log: (line: string) => { boundary.logs.push(line) },
  stamp: () => '2026-11-11 00:00:00',
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
    cleanEnvironment: (extra: Record<string, string> = {}) => ({
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && !name.startsWith('MOLE_OFFICE_'))),
      ...extra,
    }),
    // Each command is a stand-in that writes the answer its real command prints, so land.mjs reads a real log file.
    run: async (name: string, command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      boundary.runs.push({ name, command, args, cwd: options.cwd })
      const outFile = join(boundary.folder, 'logs', `${name}-${String(boundary.runs.length)}.log`)
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
  theOfficesRuntime: async () => boundary.runtime,
  waitForHealth: async () => ({ says: 'synthetic health passed' }),
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
import * as theLanding from '../tools/merge-tool/land.mjs'
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
const BACKUP_FLOOR_MINUTES = (theLanding as unknown as { BACKUP_FLOOR_MINUTES: number }).BACKUP_FLOOR_MINUTES
import { theOfficeConfiguration } from '../tools/merge-tool/config.mjs'
import { aTestAddress } from './the-test-commit-address.mjs'

const notAnNpmRunScript = Reflect.get(theLanding, 'notAnNpmRunScript') as (which: 'backup' | 'migration', words: readonly string[]) => string
const aListHoldsAnotherCount = Reflect.get(theLanding, 'aListHoldsAnotherCount') as (list: 'land.before' | 'land.after', count: number) => string

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: SYNTHETIC_GIT(), stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** The made-up scripts the fixture's package.json holds, and the commands the made-up configuration names. */
const A_MADE_UP_BACKUP = ['npm', 'run', 'synthetic:copy', '--', '--json']
const A_MADE_UP_MIGRATE = ['npm', 'run', 'synthetic:schema']

/**
 * A made-up configuration built by the office's own builder, with the commands this file reads. The real builder would
 * not make the two cases 3 and 4 need, so a caller may name another `before` or another `after`.
 */
function aConfiguration({ repository = boundary.folder, before = [A_MADE_UP_BACKUP], after = [{ whenAPathIsUnder: 'drizzle/', run: A_MADE_UP_MIGRATE }] } = {}) {
  const office = theOfficeConfiguration({ repository, commitEmail: aTestAddress('merge-queue') })
  return { ...office, land: { ...office.land, before, after } }
}

/** A main checkout at M, a final commit Cfinal, and the integrated clone detached at Cfinal. */
function aLane({ migrations = true } = {}) {
  const root = join(boundary.folder, 'main')
  mkdirSync(root)
  git(root, 'init', '-qb', 'main')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'synthetic:copy': 'synthetic', 'synthetic:schema': 'synthetic', 'db:prune-backups': 'synthetic' } }))
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'Synthetic main')
  const M = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-qc', 'entry')
  if (migrations) mkdirSync(join(root, 'drizzle'))
  writeFileSync(join(root, migrations ? join('drizzle', '0001_made_up.sql') : 'entry.txt'), '-- synthetic entry\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'Synthetic entry')
  const Cfinal = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  const clone = join(boundary.folder, 'clone')
  execFileSync('git', ['clone', '-q', '--no-local', root, clone], { env: SYNTHETIC_GIT(), stdio: 'ignore' })
  git(clone, 'checkout', '-q', '--detach', Cfinal)
  boundary.state = { integrated: { M, Cfinal, clone } }
  return { root, M, Cfinal, clone, entry: { state: 'landing', changeset: { root } } }
}

beforeEach(() => {
  boundary.folder = realpathSync(mkdtempSync(join(tmpdir(), 'the-office-landing-')))
  mkdirSync(join(boundary.folder, 'logs'))
  Object.assign(boundary, { state: {}, logs: [], runs: [], steps: [], runtime: null, configuration: aConfiguration() })
})
afterEach(() => { rmSync(boundary.folder, { recursive: true, force: true }) })

it('runs the configured backup and migrate commands when a migration came along', async () => {
  const lane = aLane({ migrations: true })
  const configuration = aConfiguration({ repository: lane.root })
  boundary.configuration = configuration
  boundary.runtime = { repository: { path: lane.root } }
  const backupCommand = configuration.land.before[0]!
  const migrateCommand = configuration.land.after[0]!.run

  const landed = await landGit(lane.entry)

  expect(landed.state).toBe('merged')
  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.slice(0, 2).map((one) => [one.name, one.command, one.cwd])).toEqual([
    ['db-backup', backupCommand[0], lane.root],
    ['db-migrate', migrateCommand[0], lane.clone],
  ])
  expect(boundary.runs[0]!.args).toEqual(backupCommand.slice(1))
  expect(boundary.runs[1]!.args).toEqual(migrateCommand.slice(1))
  for (const one of boundary.runs) {
    const words = [one.command, ...one.args].join(' ')
    expect(words).not.toContain('db:backup')
    expect(words).not.toContain('db:migrate')
  }
}, 30_000)

it('runs the configured backup command with the age floor when no migration came along', async () => {
  const lane = aLane({ migrations: false })
  const configuration = aConfiguration({ repository: lane.root })
  boundary.configuration = configuration
  boundary.runtime = { repository: { path: lane.root } }
  const backupCommand = configuration.land.before[0]!

  await landGit(lane.entry)

  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.Cfinal)
  expect(boundary.runs.map((one) => one.name)).toEqual(['db-backup', 'db-prune-backups'])
  expect(boundary.runs[0]!.command).toBe(backupCommand[0])
  expect(boundary.runs[0]!.args).toEqual([...backupCommand.slice(1), '--if-older-than', String(BACKUP_FLOOR_MINUTES)])
  expect(boundary.runs.some((one) => one.name === 'db-migrate')).toBe(false)
  expect(boundary.state.landing.migrated).toBeNull()
}, 30_000)

it('stops the landing when the configured backup command is not an npm run script', async () => {
  const lane = aLane({ migrations: true })
  const configuration = aConfiguration({ repository: lane.root, before: [['node', 'tools/backup.mjs']] })
  boundary.configuration = configuration
  boundary.runtime = { repository: { path: lane.root } }
  const command = configuration.land.before[0]!

  const stopped = await landGit(lane.entry).then(() => null, (err: Error) => err.message)

  expect(stopped).toBe(notAnNpmRunScript('backup', command))
  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.M)
  expect(boundary.runs).toEqual([])
  expect(boundary.steps).toEqual([])
}, 30_000)

it('stops the landing when land.after holds more than one step', async () => {
  const lane = aLane({ migrations: true })
  const configuration = aConfiguration({
    repository: lane.root,
    after: [
      { whenAPathIsUnder: 'drizzle/', run: A_MADE_UP_MIGRATE },
      { whenAPathIsUnder: 'drizzle/', run: A_MADE_UP_MIGRATE },
    ],
  })
  boundary.configuration = configuration
  boundary.runtime = { repository: { path: lane.root } }

  const stopped = await landGit(lane.entry).then(() => null, (err: Error) => err.message)

  expect(stopped).toBe(aListHoldsAnotherCount('land.after', configuration.land.after.length))
  expect(git(lane.root, 'rev-parse', 'HEAD')).toBe(lane.M)
  expect(boundary.runs).toEqual([])
  expect(boundary.steps).toEqual([])
}, 30_000)
