// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL'S COMMAND LINE RUNS WITHOUT MOLE OFFICE.
 *
 * WHAT THIS FILE PROVES, one case per made-up repository, by starting
 * `node tools/merge-tool/cli.mjs ...` as a child process and reading only what it prints and what it
 * did to git:
 *
 * 1. A clean branch lands by fast-forward. The trunk's commit becomes the branch's commit, the
 *    changed file is in the trunk, and `list` says the entry is merged.
 * 2. A branch that changes the same line the trunk changed after the branch was cut bounces as a
 *    conflict. The trunk does not move and `list` names the reason conflict.
 * 3. A suite command that exits 1 bounces as red. The trunk does not move.
 * 4. A changed path under a folder the protected-paths file names bounces as a guard failure. The
 *    trunk does not move.
 * 5. The trunk moves while the suite runs, once per run, until the landing-attempts limit from
 *    gateNamed('landing-attempts').defaults.ordinary is passed. The entry bounces as churn, the
 *    output says churn, and the branch never reaches the trunk.
 * 6. A full clean landing runs with MOLE_OFFICE_API, MOLE_OFFICE_PORT and MOLE_OFFICE_WORKSPACE
 *    pointing at nothing, while a preload replaces globalThis.fetch and node:net's connect with
 *    functions that write a marker and throw, and a module loader records every resolved URL and
 *    throws on src/config/settings.mjs. The landing happens, no connection marker is written, and
 *    no settings module is loaded. The mutation for this case is an import of src/config/settings.mjs
 *    in cli.mjs: the loader then throws and this case goes red.
 * 7. A checkout on a branch other than the trunk is refused and nothing is landed. The trunk and
 *    that other branch stay where they were, the entry is not merged, and the run exits 1.
 * 8. A protected pattern with a `*` matches a changed path: `data/*.db*` covers `data/live.db`, and
 *    the entry bounces as a guard failure. The trunk does not move.
 * 9. A run refuses to carry anything while another run holds the suite seat. It exits 1 with the
 *    keeper's sentence, the entry stays submitted, and the trunk does not move.
 * 10. A configuration value the command line cannot act on is refused in every command, with one
 *     sentence naming the file and the key. Nothing is carried and the trunk does not move.
 * 11. A protected-paths file with a non-empty generated list is refused at run. Nothing is carried
 *     and the trunk does not move.
 * 12. The commands are served in reverse order to the child by a module loader, and each command
 *     still runs its own work: `submit` adds the entry, `run` lands it, and `list` says merged. The
 *     refusal for a command word the command line does not know lists the commands in that served
 *     order. The mutation for this case is a match of each command to its work by its position in
 *     the list: case 12 then goes red.
 *
 * Every fixture is a throwaway repository under the system temporary folder, with its own HOME
 * under it, and every folder is removed after the file. A child's environment starts from
 * process.env with MOLE_OFFICE_*, MOLE_AGENT_KEY, NODE_OPTIONS and GIT_* removed; it holds HOME,
 * GIT_CONFIG_NOSYSTEM=1 and a git identity. Nothing reaches an office.
 *
 * PROOF RUNS (chapter 5 rule 1), logs under the round's own `out/r197-cli/` folder:
 * - red before cli.mjs existed: red-before-the-command-line.log, exit 1, 6 failed at the missing
 *   tools/merge-tool/cli.mjs;
 * - control on the finished tree: control-green.log, exit 0, 6 passed;
 * - the settings mutation: mutation-red.log, exit 1, 1 failed and 5 passed, case 6 red;
 * - the restore: restore-green.log, exit 0, 6 passed.
 *
 * CASE 7'S PROOF RUNS (round 198, logs under .../out/r198-fix/):
 * - red before the checkout guard: cli-red-before-the-trunk-check.log, exit 1, 1 failed and 6
 *   passed, case 7 red;
 * - control on the finished tree: cli-control-green.log, exit 0, 7 passed;
 * - the guard mutation (the check returns for any branch): cli-mutation-red.log, exit 1, 1 failed
 *   and 6 passed, case 7 red;
 * - the restore: cli-restore-green.log, exit 0, 7 passed.
 *
 * CASE 12'S PROOF RUNS (round 200, logs under .../out/r200-fixes/):
 * - control on the finished tree: command-name-control-green.log, exit 0, 12 passed;
 * - the positional mutation: command-name-mutation-red.log, exit 1, 1 failed and 11 passed, case 12
 *   red;
 * - the restore: command-name-restore-green.log, exit 0, 12 passed.
 */

import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { gateNamed } from '../src/config/gates.mjs'
import { THE_ONLY_LANDING } from '../tools/merge-tool/config.mjs'
import { openTheLocalKeeper } from '../tools/merge-tool/local-keeper.mjs'
import { THE_COMMANDS, theWordsOf } from '../tools/merge-tool/the-command-words.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(ROOT, 'tools', 'merge-tool', 'cli.mjs')
const LANDING_ATTEMPTS = Number(gateNamed('landing-attempts').defaults.ordinary)
const GIT_NAME = 'Synthetic merge tool test'
const GIT_EMAIL = 'merge-tool-fixture@example.invalid'

interface Fixture {
  root: string
  home: string
  repository: string
  config: string
}

interface FoundEntry {
  id: string
  state: string
  branch?: string
  commit?: string
  title?: string
  bounced?: { reason: string }
}

interface WrittenConfiguration {
  repository: string
  trunk: string
  test: { build: string[]; suite: string[]; report: string; runIn: string }
  land: { how: string; before: string[][]; after: { whenAPathIsUnder: string; run: string[] }[]; healthy: unknown }
  gates: { areas: string; markers: string[] | null; tests: boolean }
  commitAs: { name: string; email: string }
}

interface ConfigurationOptions {
  build?: string[]
  suite?: string[]
  after?: { whenAPathIsUnder: string; run: string[] }[]
}

const made: string[] = []
afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true })
})

/** A child's environment: no office names, no inherited git or node options, and its own home. */
function anEnvironment(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY' || name === 'NODE_OPTIONS' || name.startsWith('GIT_')) delete env[name]
  }
  return {
    ...env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: GIT_NAME,
    GIT_AUTHOR_EMAIL: GIT_EMAIL,
    GIT_COMMITTER_NAME: GIT_NAME,
    GIT_COMMITTER_EMAIL: GIT_EMAIL,
    ...extra,
  }
}

/** One made-up repository, its own HOME, and the configuration file that names it. */
function aFixture(protectedPaths: string[] = []): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'merge-tool-cli-')))
  made.push(root)
  const home = join(root, 'home')
  mkdirSync(home, { recursive: true })
  const repository = join(root, 'project')
  mkdirSync(join(repository, '.mole-office'), { recursive: true })
  writeFileSync(join(repository, '.mole-office', 'protected.json'), `${JSON.stringify({ protected: protectedPaths }, null, 2)}\n`)
  writeFileSync(join(repository, 'app.txt'), 'one\n')
  const fixture: Fixture = { root, home, repository, config: join(root, 'merge-tool.json') }
  const env = anEnvironment(home)
  execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { env, encoding: 'utf8' })
  execFileSync('git', ['-C', repository, 'add', '-A'], { env, encoding: 'utf8' })
  execFileSync('git', ['-C', repository, 'commit', '-q', '-m', 'The base'], { env, encoding: 'utf8' })
  return fixture
}

/** The configuration reader's own valid words, one project's commands, and no office doors. */
function aConfiguration(
  fixture: Fixture,
  {
    build = [process.execPath, '-e', '0'],
    suite = [process.execPath, '-e', '0'],
    after = [] as { whenAPathIsUnder: string; run: string[] }[],
  }: ConfigurationOptions = {},
): WrittenConfiguration {
  return {
    repository: fixture.repository,
    trunk: 'main',
    test: { build, suite, report: 'exit-code-only', runIn: 'host' },
    land: { how: THE_ONLY_LANDING, before: [[process.execPath, '-e', '0']], after, healthy: null },
    gates: { areas: '.mole-office/protected.json', markers: null, tests: false },
    commitAs: { name: GIT_NAME, email: GIT_EMAIL },
  }
}

function writeConfiguration(
  fixture: Fixture,
  options: ConfigurationOptions = {},
  change: (configuration: WrittenConfiguration) => void = () => {},
): void {
  const configuration = aConfiguration(fixture, options)
  change(configuration)
  writeFileSync(fixture.config, `${JSON.stringify(configuration, null, 2)}\n`)
}

function git(fixture: Fixture, ...args: string[]): string {
  return execFileSync('git', ['-C', fixture.repository, ...args], { env: anEnvironment(fixture.home), encoding: 'utf8' }).trim()
}

function runCli(fixture: Fixture, args: string[], extra: Record<string, string> = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: fixture.root,
    env: anEnvironment(fixture.home, extra),
    encoding: 'utf8',
    timeout: 180_000,
  })
}

/** A branch off the trunk, with one made-up change, named as the submitter's branch is. */
function aBranch(fixture: Fixture, name: string, change: (repository: string) => void): string {
  git(fixture, 'switch', '-q', '-c', name, 'main')
  change(fixture.repository)
  git(fixture, 'add', '-A')
  git(fixture, 'commit', '-q', '-m', `Synthetic ${name}`)
  const commit = git(fixture, 'rev-parse', name)
  git(fixture, 'switch', '-q', 'main')
  return commit
}

function submit(fixture: Fixture, branch: string, extra: Record<string, string> = {}): { id: string; branch: string; commit: string } {
  const ran = runCli(fixture, theWordsOf('submit', { config: fixture.config, branch, title: 'Synthetic work' }), extra)
  expect(ran.status, ran.stderr).toBe(0)
  const found = /^submitted ([0-9a-f]{12}) (\S+) ([0-9a-f]{40})$/mu.exec(ran.stdout.trim())
  expect(found, ran.stdout).not.toBeNull()
  return { id: found![1]!, branch: found![2]!, commit: found![3]! }
}

function theEntries(fixture: Fixture, extra: Record<string, string> = {}): FoundEntry[] {
  const ran = runCli(fixture, theWordsOf('list', { config: fixture.config, json: true }), extra)
  expect(ran.status, ran.stderr).toBe(0)
  return JSON.parse(ran.stdout) as FoundEntry[]
}

/** A configuration value the command line cannot act on, so every command refuses it after reading the file. */
const THE_VALUES_THE_COMMAND_LINE_CANNOT_ACT_ON: {
  name: string
  key: string
  change: (configuration: WrittenConfiguration) => void
}[] = [
  {
    name: 'a report other than exit-code-only',
    key: 'test.report',
    change: (configuration) => {
      configuration.test.report = 'vitest-json'
    },
  },
  {
    name: 'a health check after a landing',
    key: 'land.healthy',
    change: (configuration) => {
      configuration.land.healthy = { doors: ['/api/health'] }
    },
  },
  {
    name: 'mutation markers',
    key: 'gates.markers',
    change: (configuration) => {
      configuration.gates.markers = ['src/']
    },
  },
  {
    name: 'the gate that wants a test with each code change',
    key: 'gates.tests',
    change: (configuration) => {
      configuration.gates.tests = true
    },
  },
]

describe('the merge tool command line without the office', () => {
  it('lands a clean branch by fast-forward, and lists the entry as merged', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    const empty = runCli(fixture, theWordsOf('list', { config: fixture.config }))
    expect(empty.status, empty.stderr).toBe(0)
    expect(empty.stdout).toBe('')

    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const entry = submit(fixture, 'feature')
    expect(entry.commit).toBe(feature)
    expect(entry.id).toMatch(/^[0-9a-f]{12}$/u)

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`landed ${feature}`)

    expect(git(fixture, 'rev-parse', 'main')).toBe(feature)
    expect(git(fixture, 'show', 'main:app.txt')).toBe('one\nfeature')
    expect(readFileSync(join(fixture.repository, 'app.txt'), 'utf8')).toBe('one\nfeature\n')

    const listed = runCli(fixture, theWordsOf('list', { config: fixture.config }))
    expect(listed.status, listed.stderr).toBe(0)
    expect(listed.stdout.trim().split('\n')).toEqual([`${entry.id} merged feature ${feature} Synthetic work`])
    expect(theEntries(fixture)).toMatchObject([{ id: entry.id, state: 'merged', branch: 'feature', commit: feature, title: 'Synthetic work' }])
  })

  it('refuses a checkout on another branch and leaves the trunk and that branch where they were', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const entry = submit(fixture, 'feature')
    const trunk = git(fixture, 'rev-parse', 'main')
    git(fixture, 'switch', '-q', '-c', 'elsewhere', 'main')

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(1)
    expect(ran.stderr).toContain('not on the trunk')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
    expect(git(fixture, 'rev-parse', 'elsewhere')).toBe(trunk)
    expect(theEntries(fixture)[0]).not.toMatchObject({ state: 'merged' })
  })

  it('bounces a conflict and leaves the trunk where it was', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'feature\n'))
    writeFileSync(join(fixture.repository, 'app.txt'), 'trunk\n')
    git(fixture, 'add', 'app.txt')
    git(fixture, 'commit', '-q', '-m', 'The trunk changes the same line')
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')
    expect(entry.commit).toBe(feature)

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('bounced conflict')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)

    const listed = runCli(fixture, theWordsOf('list', { config: fixture.config }))
    expect(listed.status, listed.stderr).toBe(0)
    expect(listed.stdout).toContain(`${entry.id} bounced`)
    expect(listed.stdout).toContain('bounced: conflict')
    expect(theEntries(fixture)[0]).toMatchObject({ id: entry.id, state: 'bounced', bounced: { reason: 'conflict' } })
  })

  it('bounces a red suite and leaves the trunk where it was', () => {
    const fixture = aFixture()
    writeConfiguration(fixture, { suite: [process.execPath, '-e', 'process.exit(1)'] })
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('bounced red')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
    expect(git(fixture, 'show', 'main:app.txt')).toBe('one')

    const listed = runCli(fixture, theWordsOf('list', { config: fixture.config }))
    expect(listed.stdout).toContain('bounced: red')
    expect(theEntries(fixture)[0]).toMatchObject({ id: entry.id, state: 'bounced', commit: feature, bounced: { reason: 'red' } })
  })

  it('bounces a branch that changes a protected path and leaves the trunk where it was', () => {
    const fixture = aFixture(['secret/'])
    writeConfiguration(fixture)
    const feature = aBranch(fixture, 'feature', (repository) => {
      mkdirSync(join(repository, 'secret'), { recursive: true })
      writeFileSync(join(repository, 'secret', 'key.txt'), 'a key\n')
    })
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('bounced guard')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
    expect(() => git(fixture, 'show', 'main:secret/key.txt')).toThrow()

    const listed = runCli(fixture, theWordsOf('list', { config: fixture.config }))
    expect(listed.stdout).toContain('bounced: guard')
    expect(theEntries(fixture)[0]).toMatchObject({ id: entry.id, state: 'bounced', commit: feature, bounced: { reason: 'guard' } })
  })

  it('reports churn after the trunk moves under the entry more often than the landing limit allows', () => {
    const fixture = aFixture()
    const mover = join(fixture.root, 'move-the-trunk.mjs')
    writeFileSync(
      mover,
      [
        "import { execFileSync } from 'node:child_process'",
        "import { appendFileSync } from 'node:fs'",
        "import { join } from 'node:path'",
        'const repository = process.argv[2]',
        "appendFileSync(join(repository, 'moves.txt'), 'a move\\n')",
        "execFileSync('git', ['-C', repository, 'add', 'moves.txt'])",
        "execFileSync('git', ['-C', repository, 'commit', '-q', '-m', 'Move the trunk under the entry'])",
      ].join('\n'),
    )
    writeConfiguration(fixture, { suite: [process.execPath, mover, fixture.repository] })
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'feature.txt'), 'feature\n'))
    const entry = submit(fixture, 'feature')

    let last: SpawnSyncReturns<string> | null = null
    let runs = 0
    while (runs <= LANDING_ATTEMPTS) {
      last = runCli(fixture, theWordsOf('run', { config: fixture.config }))
      runs += 1
      if (theEntries(fixture)[0]?.state === 'bounced') break
    }

    expect(runs).toBe(LANDING_ATTEMPTS + 1)
    expect(last?.stdout ?? '').toContain('churn')
    expect(theEntries(fixture)[0]).toMatchObject({ id: entry.id, state: 'bounced', bounced: { reason: 'churn' } })
    expect(git(fixture, 'rev-parse', 'main')).not.toBe(feature)
    expect(() => git(fixture, 'show', 'main:feature.txt')).toThrow()
  })

  it('lands with no office connection and never loads the office settings', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    const connectionMarker = join(fixture.root, 'connection-marker.txt')
    const modulesMarker = join(fixture.root, 'modules-marker.txt')
    const settingsMarker = join(fixture.root, 'settings-marker.txt')
    const loader = join(fixture.root, 'the-loader.mjs')
    const preload = join(fixture.root, 'the-preload.mjs')
    writeFileSync(
      loader,
      [
        "import { appendFileSync } from 'node:fs'",
        'const modules = process.env.THE_MODULES_MARKER',
        'const settings = process.env.THE_SETTINGS_MARKER',
        'export async function resolve(specifier, context, nextResolve) {',
        '  const resolved = await nextResolve(specifier, context)',
        '  appendFileSync(modules, `${resolved.url}\\n`)',
        "  if (resolved.url.endsWith('src/config/settings.mjs')) {",
        '    appendFileSync(settings, `${resolved.url}\\n`)',
        "    throw new Error('the command line must not load the office settings')",
        '  }',
        '  return resolved',
        '}',
      ].join('\n'),
    )
    writeFileSync(
      preload,
      [
        "import { appendFileSync } from 'node:fs'",
        "import { register } from 'node:module'",
        "import net from 'node:net'",
        'const connection = process.env.THE_CONNECTION_MARKER',
        'globalThis.fetch = async (...args) => {',
        '  appendFileSync(connection, `fetch ${String(args[0])}\\n`)',
        "  throw new Error('the command line tried to reach the office')",
        '}',
        'net.connect = (...args) => {',
        '  appendFileSync(connection, `connect ${String(args[0])}\\n`)',
        "  throw new Error('the command line tried to open a connection')",
        '}',
        "register('./the-loader.mjs', import.meta.url)",
      ].join('\n'),
    )
    const extra = {
      MOLE_OFFICE_API: 'http://127.0.0.1:1',
      MOLE_OFFICE_PORT: '1',
      MOLE_OFFICE_WORKSPACE: 'panelx',
      NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      THE_CONNECTION_MARKER: connectionMarker,
      THE_MODULES_MARKER: modulesMarker,
      THE_SETTINGS_MARKER: settingsMarker,
    }
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const entry = submit(fixture, 'feature', extra)

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }), extra)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`landed ${feature}`)
    expect(git(fixture, 'rev-parse', 'main')).toBe(feature)
    expect(theEntries(fixture, extra)[0]).toMatchObject({ id: entry.id, state: 'merged' })
    expect(existsSync(connectionMarker)).toBe(false)
    expect(existsSync(settingsMarker)).toBe(false)
    const modules = existsSync(modulesMarker) ? readFileSync(modulesMarker, 'utf8') : ''
    expect(modules).toContain('tools/merge-tool/cli.mjs')
    expect(modules).not.toContain('src/config/settings.mjs')
  })

  it('bounces a branch that changes a path matched by a protected glob, and leaves the trunk where it was', () => {
    const fixture = aFixture(['data/*.db*'])
    writeConfiguration(fixture)
    const feature = aBranch(fixture, 'feature', (repository) => {
      mkdirSync(join(repository, 'data'), { recursive: true })
      writeFileSync(join(repository, 'data', 'live.db'), 'a database\n')
    })
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('bounced guard')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
    expect(() => git(fixture, 'show', 'main:data/live.db')).toThrow()
    expect(theEntries(fixture)[0]).toMatchObject({ id: entry.id, state: 'bounced', commit: feature, bounced: { reason: 'guard' } })
  })

  it('refuses run while another run holds the suite seat, and carries nothing', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')
    const keeper = openTheLocalKeeper({ repository: fixture.repository, home: fixture.home })
    const taken = keeper.takeTheSeat({ session: 'the test that holds the seat' })
    expect(taken.seat, taken.seat ? '' : taken.says).toBe(true)
    const refused = keeper.takeTheSeat({ session: 'the test that asks again' })
    expect(refused.seat).toBe(false)
    try {
      const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
      expect(ran.status, ran.stderr).toBe(1)
      expect(ran.stderr.trim()).toBe(refused.says)
      expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
      expect(keeper.readEntry(entry.id).state).toBe('submitted')
    } finally {
      keeper.releaseTheSeat()
    }
  })

  it('refuses the configuration values it cannot act on, in every command, with nothing carried', () => {
    for (const value of THE_VALUES_THE_COMMAND_LINE_CANNOT_ACT_ON) {
      const fixture = aFixture()
      writeConfiguration(fixture)
      aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
      const trunk = git(fixture, 'rev-parse', 'main')
      const entry = submit(fixture, 'feature')
      writeConfiguration(fixture, {}, value.change)

      for (const words of [
        theWordsOf('list', { config: fixture.config }),
        theWordsOf('submit', { config: fixture.config, branch: 'feature' }),
        theWordsOf('run', { config: fixture.config }),
      ]) {
        const ran = runCli(fixture, words)
        expect(ran.status, `${value.name}: ${ran.stderr}`).toBe(1)
        expect(ran.stderr, value.name).toContain(fixture.config)
        expect(ran.stderr, value.name).toContain(value.key)
      }

      expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
      expect(openTheLocalKeeper({ repository: fixture.repository, home: fixture.home }).readEntry(entry.id).state).toBe('submitted')
    }
  })

  it('refuses a protected-paths file with a non-empty generated list, and carries nothing', () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    writeFileSync(
      join(fixture.repository, '.mole-office', 'protected.json'),
      `${JSON.stringify(
        { protected: [], generated: [{ paths: ['design/table.md'], command: [process.execPath, '-e', '0'] }] },
        null,
        2,
      )}\n`,
    )
    git(fixture, 'add', '.mole-office/protected.json')
    git(fixture, 'commit', '-q', '-m', 'Declare a generated file')
    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const trunk = git(fixture, 'rev-parse', 'main')
    const entry = submit(fixture, 'feature')

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }))
    expect(ran.status, ran.stderr).toBe(1)
    expect(ran.stderr).toContain('generated')
    expect(ran.stderr).toContain('does not regenerate or check generated files')
    expect(git(fixture, 'rev-parse', 'main')).toBe(trunk)
    expect(openTheLocalKeeper({ repository: fixture.repository, home: fixture.home }).readEntry(entry.id).state).toBe('submitted')
  })

  it("runs each command's own work when the commands are served in another order", () => {
    const fixture = aFixture()
    writeConfiguration(fixture)
    const loader = join(fixture.root, 'the-loader.mjs')
    const preload = join(fixture.root, 'the-preload.mjs')
    writeFileSync(
      loader,
      [
        "const declaration = 'export const THE_COMMANDS = Object.freeze(['",
        "const placed = 'export const THE_OPTION_WORDS'",
        'export async function load(url, context, nextLoad) {',
        '  const loaded = await nextLoad(url, context)',
        "  if (!url.endsWith('tools/merge-tool/the-command-words.mjs')) return loaded",
        '  const source = `${loaded.source}`',
        '  if (!source.includes(declaration) || !source.includes(placed)) {',
        "    throw new Error('the command words are not written as the loader expects')",
        '  }',
        "  const renamed = source.replace(declaration, 'const theCommandsInTheirOrder = Object.freeze([')",
        '  const reversed = renamed.replace(placed, `export const THE_COMMANDS = Object.freeze([...theCommandsInTheirOrder].reverse())\\n${placed}`)',
        '  return { ...loaded, source: reversed }',
        '}',
      ].join('\n'),
    )
    writeFileSync(
      preload,
      ["import { register } from 'node:module'", "register('./the-loader.mjs', import.meta.url)"].join('\n'),
    )
    const extra = { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }

    const unknown = runCli(fixture, ['not-a-command'], extra)
    expect(unknown.status, unknown.stderr).toBe(1)
    expect(unknown.stderr).toContain(THE_COMMANDS.map((command) => command.name).reverse().join(', '))

    const feature = aBranch(fixture, 'feature', (repository) => writeFileSync(join(repository, 'app.txt'), 'one\nfeature\n'))
    const entry = submit(fixture, 'feature', extra)
    expect(entry.commit).toBe(feature)

    const ran = runCli(fixture, theWordsOf('run', { config: fixture.config }), extra)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`landed ${feature}`)
    expect(git(fixture, 'rev-parse', 'main')).toBe(feature)
    expect(theEntries(fixture, extra)[0]).toMatchObject({ id: entry.id, state: 'merged' })
  })
})
