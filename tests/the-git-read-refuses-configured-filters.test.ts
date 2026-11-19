// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { requireReadOnlyGitConfig } from '../tools/read-only-git-config.mjs'

const MARKER_NAMES = ['clean', 'process', 'hook', 'alias', 'fsmonitor', 'submodule'] as const
type MarkerName = (typeof MARKER_NAMES)[number]

type Fixture = {
  folder: string
  repository: string
  home: string
  gitDirectory: string
  markers: Record<MarkerName, string>
}

function setupGit(home: string, repository: string, args: string[], input?: string) {
  const result = spawnSync('git', [
    '--no-pager',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'gc.auto=0',
    '-c', 'maintenance.auto=false',
    '-c', 'commit.gpgsign=false',
    '-C', repository,
    ...args,
  ], {
    env: {
      PATH: process.env.PATH ?? '',
      HOME: home,
      LANG: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Synthetic Git filter fixture',
      GIT_AUTHOR_EMAIL: 'git-filter-fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Synthetic Git filter fixture',
      GIT_COMMITTER_EMAIL: 'git-filter-fixture@example.invalid',
    },
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  })
  if (result.error || result.signal || result.status !== 0 || result.stderr !== '') {
    const outcome = result.error ? 'spawn error' : result.signal ?? result.status
    throw new Error(`Synthetic Git fixture setup failed (${outcome}).`)
  }
  return result.stdout
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function filterCommand(fixture: Fixture, name: MarkerName) {
  const program = join(fixture.folder, 'marker-filter.mjs')
  return [process.execPath, program, fixture.markers[name]].map(shellQuote).join(' ')
}

function addExecutionMarkers(fixture: Fixture) {
  const program = join(fixture.folder, 'marker-filter.mjs')
  writeFileSync(program, [
    "import { writeFileSync } from 'node:fs'",
    "writeFileSync(process.argv[2], 'command ran\\n')",
    'process.stdin.pipe(process.stdout)',
    '',
  ].join('\n'))

  const hooks = join(fixture.folder, 'hooks')
  mkdirSync(hooks)
  const preCommit = join(hooks, 'pre-commit')
  writeFileSync(preCommit, `#!/bin/sh\nexec ${filterCommand(fixture, 'hook')}\n`)
  chmodSync(preCommit, 0o700)

  setupGit(fixture.home, fixture.repository, ['config', '--local', 'core.hooksPath', hooks])
  setupGit(fixture.home, fixture.repository, ['config', '--local', 'core.fsmonitor', filterCommand(fixture, 'fsmonitor')])
  setupGit(fixture.home, fixture.repository, ['config', '--local', 'alias.config', `!${filterCommand(fixture, 'alias')}`])
}

function makeFixture(): Fixture {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-read-only-git-config-'))
  const repository = join(folder, 'repo')
  const home = join(folder, 'home')
  mkdirSync(repository)
  mkdirSync(home)
  const markers = Object.fromEntries(MARKER_NAMES.map((name) => [name, join(folder, `${name}.marker`)])) as Record<MarkerName, string>
  const fixture: Fixture = { folder, repository, home, gitDirectory: '', markers }

  setupGit(home, repository, ['init', '--quiet', '--initial-branch=main'])
  setupGit(home, repository, ['config', '--local', 'user.name', 'Synthetic Git filter fixture'])
  setupGit(home, repository, ['config', '--local', 'user.email', 'git-filter-fixture@example.invalid'])
  writeFileSync(join(repository, 'tracked.txt'), 'Synthetic tracked content.\n')
  setupGit(home, repository, ['add', '--', 'tracked.txt'])
  setupGit(home, repository, ['commit', '--quiet', '-m', 'synthetic Git filter baseline'])
  fixture.gitDirectory = setupGit(home, repository, ['rev-parse', '--absolute-git-dir']).trim()
  writeFileSync(join(repository, '.gitattributes'), 'tracked.txt filter=probe\n')
  addExecutionMarkers(fixture)
  return fixture
}

function makeSubmoduleFixture(): Fixture {
  const fixture = makeFixture()
  const attributes = join(fixture.folder, 'submodule-attributes')
  const childSource = join(fixture.folder, 'child-source')
  const child = join(fixture.repository, 'dependency')
  rmSync(join(fixture.repository, '.gitattributes'))
  mkdirSync(childSource)

  setupGit(fixture.home, childSource, ['init', '--quiet', '--initial-branch=main'])
  setupGit(fixture.home, childSource, ['config', '--local', 'user.name', 'Synthetic Git filter fixture'])
  setupGit(fixture.home, childSource, ['config', '--local', 'user.email', 'git-filter-fixture@example.invalid'])
  writeFileSync(join(childSource, 'tracked.txt'), 'Synthetic tracked submodule content.\n')
  setupGit(fixture.home, childSource, ['add', '--', 'tracked.txt'])
  setupGit(fixture.home, childSource, ['commit', '--quiet', '-m', 'synthetic submodule baseline'])
  setupGit(fixture.home, fixture.repository, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '--quiet', childSource, 'dependency'])
  setupGit(fixture.home, fixture.repository, ['commit', '--quiet', '-am', 'synthetic tracked submodule'])

  writeFileSync(attributes, 'tracked.txt filter=probe\n')
  setupGit(fixture.home, child, ['config', '--local', 'core.attributesFile', attributes])
  setupGit(fixture.home, child, ['config', '--local', 'filter.probe.clean', filterCommand(fixture, 'submodule')])
  const tracked = join(child, 'tracked.txt')
  const times = statSync(tracked)
  utimesSync(tracked, times.atime, new Date(times.mtimeMs + 2_000))
  return fixture
}

/**
 * MORE TRACKED FILES THAN THE CONFIG QUERY'S 64 KiB HOLDS AS INDEX MODES. The index query prints a 6-digit mode and a
 * newline, 7 bytes, for each tracked file, so 64 KiB holds 9,362 of them. On 1 Nov 2026 main tracked 9,366 files, and
 * receipt firing 428 refused with "Git index metadata query could not be started (ENOBUFS)".
 */
const MORE_FILES_THAN_THE_CONFIG_BOUND_HOLDS = 10_000

/**
 * The plain fixture with that many more files in its index, each the baseline's blob under its own path, and, when asked,
 * a tracked submodule (mode 160000) whose path sorts after all of them, so the guard finds it only by reading to the end.
 * The files are index entries only; no working-tree file is written for them.
 */
function makeLargeIndexFixture(withSubmoduleLast: boolean): Fixture {
  const fixture = makeFixture()
  const blob = setupGit(fixture.home, fixture.repository, ['rev-parse', 'HEAD:tracked.txt']).trim()
  const commit = setupGit(fixture.home, fixture.repository, ['rev-parse', 'HEAD']).trim()
  const entries = Array.from({ length: MORE_FILES_THAN_THE_CONFIG_BOUND_HOLDS }, (_, at) => `100644 ${blob}\tmany/file-${String(at).padStart(5, '0')}.txt\n`)
  if (withSubmoduleLast) entries.push(`160000 ${commit}\tzz-dependency\n`)
  setupGit(fixture.home, fixture.repository, ['update-index', '--add', '--index-info'], entries.join(''))
  return fixture
}

type PartialCloneFixture = Fixture & { targetCommit: string }

function makePartialCloneFixture(): PartialCloneFixture {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-partial-clone-read-'))
  const home = join(folder, 'home')
  const source = join(folder, 'source')
  const remote = join(folder, 'remote.git')
  const repository = join(folder, 'clone')
  mkdirSync(home)
  mkdirSync(source)
  const markers = Object.fromEntries(MARKER_NAMES.map((name) => [name, join(folder, `${name}.marker`)])) as Record<MarkerName, string>
  const fixture: PartialCloneFixture = { folder, repository, home, gitDirectory: '', markers, targetCommit: '' }

  setupGit(home, source, ['init', '--quiet', '--initial-branch=main'])
  setupGit(home, source, ['config', '--local', 'user.name', 'Synthetic Git filter fixture'])
  setupGit(home, source, ['config', '--local', 'user.email', 'git-filter-fixture@example.invalid'])
  const commits: string[] = []
  for (const name of ['baseline', 'target', 'latest']) {
    writeFileSync(join(source, 'tracked.txt'), `Synthetic ${name} content.\n`)
    setupGit(home, source, ['add', '--', 'tracked.txt'])
    setupGit(home, source, ['commit', '--quiet', '-m', `synthetic ${name}`])
    commits.push(setupGit(home, source, ['rev-parse', 'HEAD']).trim())
  }
  const targetCommit = commits[1]
  const latestCommit = commits[2]
  if (!targetCommit || !latestCommit) throw new Error('The synthetic partial clone needs all three commits.')
  setupGit(home, folder, ['clone', '--quiet', '--bare', source, remote])
  setupGit(home, remote, ['config', '--local', 'uploadpack.allowFilter', 'true'])
  setupGit(home, folder, ['clone', '--quiet', '--filter=tree:0', '--no-checkout', pathToFileURL(remote).href, repository])
  setupGit(home, repository, ['checkout', '--quiet', '--detach', latestCommit])
  fixture.gitDirectory = setupGit(home, repository, ['rev-parse', '--absolute-git-dir']).trim()
  fixture.targetCommit = targetCommit
  return fixture
}

function fileTree(root: string): unknown[][] {
  const rows: unknown[][] = []
  function visit(path: string) {
    const info = lstatSync(path)
    const name = relative(root, path) || '.'
    if (info.isSymbolicLink()) {
      rows.push([name, 'link', readlinkSync(path)])
    } else if (info.isDirectory()) {
      rows.push([name, 'directory', info.mode & 0o777])
      for (const child of readdirSync(path).sort()) visit(join(path, child))
    } else if (info.isFile()) {
      rows.push([name, 'file', info.mode & 0o777, readFileSync(path).toString('base64')])
    } else {
      throw new Error(`Unexpected file type in the synthetic fixture: ${name}`)
    }
  }
  visit(root)
  return rows
}

function snapshot(fixture: Fixture) {
  const markers: Record<string, string | null> = {}
  for (const [name, path] of Object.entries(fixture.markers)) {
    markers[name] = existsSync(path) ? readFileSync(path).toString('base64') : null
  }
  return {
    files: fileTree(fixture.folder),
    refs: fileTree(join(fixture.gitDirectory, 'refs')),
    head: readFileSync(join(fixture.gitDirectory, 'HEAD')).toString('base64'),
    index: readFileSync(join(fixture.gitDirectory, 'index')).toString('base64'),
    markers,
  }
}

function refusalOf(action: () => unknown): string {
  try {
    action()
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function withPath(path: string, action: () => string) {
  const before = process.env.PATH
  process.env.PATH = path
  try {
    return action()
  } finally {
    if (before === undefined) delete process.env.PATH
    else process.env.PATH = before
  }
}

function fakeGit(folder: string, repository: string, behavior: 'exit' | 'signal') {
  const bin = join(folder, `fake-git-${behavior}`)
  mkdirSync(bin)
  const executable = join(bin, 'git')
  const queryBehavior = behavior === 'exit'
    ? 'process.exit(23)'
    : 'process.kill(process.pid, "SIGTERM")'
  writeFileSync(executable, [
    `#!${process.execPath}`,
    'const args = process.argv.slice(2)',
    `if (args.includes("rev-parse")) { process.stdout.write(${JSON.stringify(`${repository}\n`)}) }`,
    `else if (args.includes("config")) { ${queryBehavior} }`,
    'else process.exit(97)',
    '',
  ].join('\n'))
  chmodSync(executable, 0o700)
  return bin
}

function closeFixture(fixture: Fixture) {
  rmSync(fixture.folder, { recursive: true, force: true })
}

describe('the read-only Git config guard', () => {
  it('allows no matching filters and leaves repository bytes, refs, index, and markers unchanged', () => {
    const fixture = makeFixture()
    try {
      const before = snapshot(fixture)
      expect(requireReadOnlyGitConfig(fixture.repository)).toBeUndefined()
      expect(snapshot(fixture)).toEqual(before)
      expect(before.markers).toEqual({ clean: null, process: null, hook: null, alias: null, fsmonitor: null, submodule: null })
    } finally {
      closeFixture(fixture)
    }
  })

  it('refuses a local clean filter without printing its command or running it', () => {
    const fixture = makeFixture()
    try {
      const command = filterCommand(fixture, 'clean')
      setupGit(fixture.home, fixture.repository, ['config', '--local', 'filter.probe.clean', command])
      const before = snapshot(fixture)
      const refusal = refusalOf(() => requireReadOnlyGitConfig(fixture.repository))
      expect(refusal).toContain('filter.probe.clean')
      expect(refusal.includes(command)).toBe(false)
      expect(refusal).not.toContain(fixture.markers.clean)
      expect(snapshot(fixture)).toEqual(before)
      expect(before.markers.clean).toBeNull()
      expect(before.markers.hook).toBeNull()
      expect(before.markers.alias).toBeNull()
      expect(before.markers.fsmonitor).toBeNull()

      setupGit(fixture.home, fixture.repository, ['config', '--local', 'filter.probe.clean', ''])
      const emptyCommandBefore = snapshot(fixture)
      const emptyCommandRefusal = refusalOf(() => requireReadOnlyGitConfig(fixture.repository))
      expect(emptyCommandRefusal).toContain('filter.probe.clean')
      expect(snapshot(fixture)).toEqual(emptyCommandBefore)
      expect(emptyCommandBefore.markers.clean).toBeNull()
    } finally {
      closeFixture(fixture)
    }
  })

  it('refuses a process filter from an included config without running it', () => {
    const fixture = makeFixture()
    try {
      const command = filterCommand(fixture, 'process')
      const include = join(fixture.folder, 'included-git-config')
      writeFileSync(include, `[filter "probe"]\n\tprocess = ${command}\n`)
      setupGit(fixture.home, fixture.repository, ['config', '--local', 'include.path', include])
      const before = snapshot(fixture)
      const refusal = refusalOf(() => requireReadOnlyGitConfig(fixture.repository))
      expect(refusal).toContain('filter.probe.process')
      expect(refusal.includes(command)).toBe(false)
      expect(refusal).not.toContain(fixture.markers.process)
      expect(snapshot(fixture)).toEqual(before)
      expect(before.markers.process).toBeNull()
      expect(before.markers.hook).toBeNull()
      expect(before.markers.alias).toBeNull()
      expect(before.markers.fsmonitor).toBeNull()
    } finally {
      closeFixture(fixture)
    }
  })

  it('refuses tracked submodules before status can run a child clean filter', () => {
    const fixture = makeSubmoduleFixture()
    try {
      const before = snapshot(fixture)
      const refusal = refusalOf(() => {
        requireReadOnlyGitConfig(fixture.repository)
        setupGit(fixture.home, fixture.repository, ['status', '--porcelain=v1', '--untracked-files=all'])
      })
      expect(snapshot(fixture)).toEqual(before)
      expect(refusal).toContain('tracked Git submodules')
      expect(before.markers.submodule).toBeNull()
      expect(before.markers.hook).toBeNull()
      expect(before.markers.alias).toBeNull()
      expect(before.markers.fsmonitor).toBeNull()
    } finally {
      closeFixture(fixture)
    }
  })

  it('refuses a partial clone before an object read can fetch missing objects', () => {
    const fixture = makePartialCloneFixture()
    try {
      const before = snapshot(fixture)
      const refusal = refusalOf(() => {
        requireReadOnlyGitConfig(fixture.repository)
        setupGit(fixture.home, fixture.repository, ['ls-tree', '-r', '--name-only', fixture.targetCommit])
      })
      expect(snapshot(fixture)).toEqual(before)
      expect(refusal.toLowerCase()).toContain('partial-clone lazy fetching')
      expect(refusal.toLowerCase()).toContain('remote.origin.promisor')
      expect(before.markers).toEqual({ clean: null, process: null, hook: null, alias: null, fsmonitor: null, submodule: null })
    } finally {
      closeFixture(fixture)
    }
  })

  it('reads the index modes of a tree whose list is larger than the config query\'s 64 KiB, and changes nothing', () => {
    const fixture = makeLargeIndexFixture(false)
    try {
      const before = snapshot(fixture)
      expect(refusalOf(() => requireReadOnlyGitConfig(fixture.repository))).toBe('')
      expect(snapshot(fixture)).toEqual(before)
      expect(before.markers).toEqual({ clean: null, process: null, hook: null, alias: null, fsmonitor: null, submodule: null })
    } finally {
      closeFixture(fixture)
    }
  })

  it('still refuses a tracked submodule listed after more files than the config query\'s 64 KiB holds', () => {
    const fixture = makeLargeIndexFixture(true)
    try {
      const before = snapshot(fixture)
      expect(refusalOf(() => requireReadOnlyGitConfig(fixture.repository))).toContain('tracked Git submodules')
      expect(snapshot(fixture)).toEqual(before)
    } finally {
      closeFixture(fixture)
    }
  })

  it('refuses noncanonical roots, malformed config, missing Git, unexpected exits, and signals as unknown', () => {
    const fixture = makeFixture()
    try {
      const subdirectory = join(fixture.repository, 'nested')
      mkdirSync(subdirectory)
      const repositoryLink = join(fixture.folder, 'repository-link')
      symlinkSync(fixture.repository, repositoryLink)
      const canonicalBefore = snapshot(fixture)
      expect(refusalOf(() => requireReadOnlyGitConfig('.'))).toContain('absolute canonical')
      expect(refusalOf(() => requireReadOnlyGitConfig(subdirectory))).toContain('canonical repository root')
      expect(refusalOf(() => requireReadOnlyGitConfig(repositoryLink))).toContain('canonical repository root')
      expect(snapshot(fixture)).toEqual(canonicalBefore)

      const configFile = join(fixture.gitDirectory, 'config')
      const originalConfig = readFileSync(configFile)
      writeFileSync(configFile, Buffer.concat([originalConfig, Buffer.from('\n[broken\n')]))
      let before = snapshot(fixture)
      expect(refusalOf(() => requireReadOnlyGitConfig(fixture.repository))).toMatch(/refused/i)
      expect(snapshot(fixture)).toEqual(before)

      writeFileSync(configFile, originalConfig)
      const emptyBin = join(fixture.folder, 'empty-bin')
      mkdirSync(emptyBin)
      before = snapshot(fixture)
      expect(withPath(emptyBin, () => refusalOf(() => requireReadOnlyGitConfig(fixture.repository)))).toMatch(/refused/i)
      expect(snapshot(fixture)).toEqual(before)

      const exitBin = fakeGit(fixture.folder, fixture.repository, 'exit')
      before = snapshot(fixture)
      expect(withPath(exitBin, () => refusalOf(() => requireReadOnlyGitConfig(fixture.repository))).toLowerCase()).toContain('23')
      expect(snapshot(fixture)).toEqual(before)

      const signalBin = fakeGit(fixture.folder, fixture.repository, 'signal')
      before = snapshot(fixture)
      expect(withPath(signalBin, () => refusalOf(() => requireReadOnlyGitConfig(fixture.repository))).toLowerCase()).toContain('sigterm')
      expect(snapshot(fixture)).toEqual(before)
    } finally {
      closeFixture(fixture)
    }
  })
})
