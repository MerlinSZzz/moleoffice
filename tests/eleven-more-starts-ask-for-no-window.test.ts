// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ELEVEN MORE STARTS OF A CONSOLE PROGRAM ASK FOR NO WINDOW.
 *
 * On Windows the office's server and its message worker run with no console of their own, because the starter starts
 * them detached. The window runs with no console either. Windows gives a console program started from such a process
 * a console window of its own, unless the start asks for none. In Node a start asks for none with `windowsHide: true`.
 * tests/the-version-read-and-the-powershell-reads-start-with-no-window.test.ts holds the first starts that were hidden.
 * This file holds the next eleven, which can each run on Windows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Every start through node:child_process that a case makes is noted here and answered by a stand-in, which prints what
 * the case gives it and ends with status 0. So no case starts a real program. Each case checks every option of the start
 * it caused, so a start that loses `windowsHide: true`, or gains or loses another option, goes red.
 *
 *   1. The server's command runner that holds the thread (`runCommand`, src/server/lib/resources.ts) starts nvidia-smi
 *      hidden, when the Windows probe reads the GPU's list.
 *   2. The runner that waits (`runCommandWaiting`) starts nvidia-smi hidden, when the Windows probe reads the list by
 *      the way that waits.
 *   3. The runner that reads both outputs (`runCommandReadingBothStreams`) starts `codex login status` hidden, when the
 *      Windows probe asks Codex about its key. It starts the codex it found on this process's PATH, the way
 *      `theWayToStart` (src/config/runtimes.mjs) gives it. The PATH is a folder this file made, so the codex there is
 *      the one found.
 *   4. The tmux read (`tmuxPanes`) starts tmux hidden, when the Windows probe lists the terminal panes.
 *   5. The office's git reader that holds the thread (`readGit`) starts git hidden.
 *   6. The git reader that waits (`readGitAsync`) starts git hidden.
 *   7. The guarded git of src/config/guarded-git.mjs (`whatGuardedGitSays`) starts git hidden.
 *   8. The window's run of the mole-office command (`runTheCommand`, src/desktop/main.mjs) starts Node hidden. Electron
 *      is stood in, and its single-instance lock is refused, so importing the window's file opens no window.
 *   9. The worker's version read (`theProgramThatRan`, src/worker/runtimes/os.ts) starts the program it found hidden.
 *  10. The worker's read of what an OpenCode run was served (`theServedOfAnOpenCodeRun`, src/config/runtime-served.mjs)
 *      starts `opencode export` hidden, the way `theWayToStart` gives it.
 *  11. The run of a stable checkout's tool for a development checkout (`runInTheStableCheckout`,
 *      src/config/the-office-tool-environment.mjs) starts Node hidden. The settings are stood in for a development
 *      checkout that is not itself paired, and whose env file names a stable checkout made by this file.
 *
 * WHAT ONLY WINDOWS CAN SHOW. Node is trusted to start a program with no window when a start has `windowsHide: true`.
 * No case here runs on Windows, and no case can see a window.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, each run against this file alone
 * ---------------------------------------------------------------------------------------
 *
 *   (a) `windowsHide: true` taken off `runCommand` in src/server/lib/resources.ts: case 1 goes red.
 *   (b) taken off `runCommandWaiting`: case 2 goes red.
 *   (c) taken off `runCommandReadingBothStreams`: case 3 goes red.
 *   (d) taken off `tmuxPanes`: case 4 goes red.
 *   (e) taken off `readGit`: case 5 goes red.
 *   (f) taken off `readGitAsync`: case 6 goes red.
 *   (g) taken off `whatGuardedGitSays` in src/config/guarded-git.mjs: case 7 goes red.
 *   (h) taken off `runTheCommand` in src/desktop/main.mjs: case 8 goes red.
 *   (i) taken off `readTheVersion` in src/worker/runtimes/os.ts: case 9 goes red.
 *   (j) taken off `theServedOfAnOpenCodeRun` in src/config/runtime-served.mjs: case 10 goes red.
 *   (k) taken off `runInTheStableCheckout` in src/config/the-office-tool-environment.mjs: case 11 goes red.
 */

import type { ExecFileOptions, ExecFileSyncOptions, SpawnOptions, SpawnSyncOptions } from 'node:child_process'
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

import { guardedGitArguments, guardedGitEnvironment, whatGuardedGitSays } from '../src/config/guarded-git.mjs'
import { THE_LONGEST_AN_EXPORT_TAKES_MS, theServedOfAnOpenCodeRun } from '../src/config/runtime-served.mjs'
import { VERSION_MUST_ANSWER_WITHIN_MS } from '../src/config/runtimes.mjs'
import { REPO_ROOT, howToStart } from '../src/config/settings.mjs'
import { runInTheStableCheckout } from '../src/config/the-office-tool-environment.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

type How = 'spawn' | 'spawnSync' | 'execFile' | 'execFileSync'

/**
 * Each start made through node:child_process while a case runs, and what the stand-in prints. While `prints` is null,
 * as it is before the cases, a start goes to the real node:child_process and is not noted.
 */
const starts = vi.hoisted(() => ({
  seen: [] as { how: How; command: string; args: string[]; options: Record<string, unknown> }[],
  prints: null as string | null,
}))

/** The stable checkout the stood-in settings name, while case 11 runs. */
const stable = vi.hoisted(() => ({ folder: null as string | null }))

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  /** A child that prints `prints` and ends with status 0 once both of its outputs have been read to the end. */
  const aChildThatPrints = (prints: string) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout, stderr, pid: 0, kill: () => true })
    let ended = 0
    const oneEnded = (): void => {
      ended += 1
      if (ended === 2) child.emit('close', 0, null)
    }
    stdout.once('end', oneEnded)
    stderr.once('end', oneEnded)
    setImmediate(() => {
      stdout.end(prints)
      stderr.end()
    })
    return child
  }
  /** What the stand-in prints for this start, or null when the start goes to the real node:child_process. */
  const note = (how: How, command: string, args: readonly string[] | undefined, options: object | undefined): string | null => {
    if (starts.prints === null) return null
    starts.seen.push({ how, command, args: [...(args ?? [])], options: { ...(options ?? {}) } })
    return starts.prints
  }
  const spawn = (command: string, args?: readonly string[], options?: SpawnOptions) => {
    const prints = note('spawn', command, args, options)
    return prints === null ? real.spawn(command, args ?? [], options ?? {}) : aChildThatPrints(prints)
  }
  const spawnSync = (command: string, args?: readonly string[], options?: SpawnSyncOptions) => {
    const prints = note('spawnSync', command, args, options)
    return prints === null
      ? real.spawnSync(command, args ?? [], options ?? {})
      : { pid: 0, output: [null, prints, ''], stdout: prints, stderr: '', status: 0, signal: null }
  }
  type TheEnd = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void
  const execFile = (command: string, args: readonly string[], options: ExecFileOptions & { encoding?: string | null }, callback: TheEnd) => {
    const prints = note('execFile', command, args, options)
    if (prints === null) return (real.execFile as unknown as (...given: unknown[]) => unknown)(command, args, options, callback)
    const asBuffers = options.encoding === 'buffer'
    setImmediate(() => callback(null, asBuffers ? Buffer.from(prints) : prints, asBuffers ? Buffer.alloc(0) : ''))
    return Object.assign(new EventEmitter(), { stdin: new PassThrough(), pid: 0, kill: () => true })
  }
  const execFileSync = (command: string, args?: readonly string[], options?: ExecFileSyncOptions) => {
    const prints = note('execFileSync', command, args, options)
    if (prints === null) return real.execFileSync(command, args ?? [], options ?? {})
    return options?.encoding === undefined || options.encoding === 'buffer' ? Buffer.from(prints) : prints
  }
  const mocked = { ...real, spawn, spawnSync, execFile, execFileSync }
  return { ...mocked, default: mocked }
})

// The window's file imports Electron. Its stand-in refuses the single-instance lock, so the file does nothing more at
// import than set its name and folder, and a ready that never comes starts nothing.
vi.mock('electron', () => {
  const app = {
    commandLine: { hasSwitch: () => false, getSwitchValue: () => '' },
    userAgentFallback: 'Electron',
    getPreferredSystemLanguages: () => ['en-US'],
    setName: () => undefined,
    setPath: () => undefined,
    requestSingleInstanceLock: () => false,
    quit: () => undefined,
    exit: () => undefined,
    on: () => undefined,
    whenReady: () => new Promise<never>(() => undefined),
  }
  class NotUsedHere {}
  const electron = {
    app,
    BrowserWindow: NotUsedHere,
    Menu: {},
    Tray: NotUsedHere,
    WebContentsView: NotUsedHere,
    dialog: { showErrorBox: () => undefined },
    globalShortcut: { unregisterAll: () => undefined },
    ipcMain: { on: () => undefined, handle: () => undefined },
    nativeImage: {},
    nativeTheme: {},
  }
  return { ...electron, default: electron }
})

// The settings of a development checkout that is not itself paired, and whose env file names `stable.folder` while
// case 11 runs. Everything else is the real settings.
vi.mock('../src/config/settings.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/settings.mjs')>()
  return {
    ...real,
    THE_DEVELOPMENT_CHECKOUT: null,
    theStableCheckoutNamedIn: (file: string) => stable.folder ?? real.theStableCheckoutNamedIn(file),
  }
})

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let os: typeof import('../src/worker/runtimes/os.ts')
let desktop: typeof import('../src/desktop/main.mjs')
let folder: string

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  os = await import('../src/worker/runtimes/os.ts')
  desktop = await import('../src/desktop/main.mjs')
  folder = aTestDatabaseFolder('more-starts-hidden')
}, 60_000)

afterAll(() => {
  starts.prints = null
  removeThisTestFolder(folder)
  t?.close()
})

beforeEach(() => {
  starts.seen.length = 0
  starts.prints = ''
  stable.folder = null
})

/** Runs `fn` with this process's PATH set to `folder` alone, and puts the PATH back. */
function withThePath<T>(folder: string, fn: () => T): T {
  const before = process.env['PATH']
  process.env['PATH'] = folder
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env['PATH']
    else process.env['PATH'] = before
  }
}

/** The limits `runCommand` and `runCommandWaiting` give every command. */
const A_COMMANDS_LIMITS = { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }
const THE_GPUS_LIST = ['--query-compute-apps=pid,used_gpu_memory,process_name', '--format=csv,noheader,nounits']

it('1. the runner that holds the thread starts nvidia-smi hidden', () => {
  starts.prints = '123, 400, python\n'

  const gpu = res.theProbeForThisPlatform('win32').gpu()

  expect(starts.seen).toEqual([
    { how: 'spawnSync', command: 'nvidia-smi', args: THE_GPUS_LIST, options: { encoding: 'utf8', ...A_COMMANDS_LIMITS, windowsHide: true } },
  ])
  expect(gpu).toEqual({ available: true, processes: [{ pid: 123, usedMib: 400, name: 'python' }] })
})

it('2. the runner that waits starts nvidia-smi hidden', async () => {
  starts.prints = '123, 400, python\n'

  const gpu = await res.theProbeForThisPlatform('win32').readGpu!()

  expect(starts.seen).toEqual([
    { how: 'execFile', command: 'nvidia-smi', args: THE_GPUS_LIST, options: { encoding: 'utf8', ...A_COMMANDS_LIMITS, windowsHide: true } },
  ])
  expect(gpu).toEqual({ available: true, processes: [{ pid: 123, usedMib: 400, name: 'python' }] })
})

it('3. the runner that reads both outputs starts codex login status hidden', () => {
  const program = join(folder, 'codex')
  writeFileSync(program, '')
  chmodSync(program, 0o755)
  starts.prints = 'Logged in using ChatGPT\n'

  const said = withThePath(folder, () => res.theProbeForThisPlatform('win32').whatAnAgentToolSaysAboutItsKey!('codex'))

  expect(starts.seen).toEqual([
    {
      how: 'spawnSync',
      command: program,
      args: ['login', 'status'],
      options: { encoding: 'utf8', ...A_COMMANDS_LIMITS, windowsVerbatimArguments: false, windowsHide: true },
    },
  ])
  expect(said.state).toBe('set')
})

it('4. the tmux read starts tmux hidden', async () => {
  starts.prints = '100\n'

  const panes = await res.theProbeForThisPlatform('win32').tmuxPanes!('#{pane_pid}')

  expect(starts.seen).toEqual([
    {
      how: 'execFile',
      command: 'tmux',
      args: ['list-panes', '-a', '-F', '#{pane_pid}'],
      options: { timeout: 3_000, encoding: 'utf8', windowsHide: true },
    },
  ])
  expect(panes).toEqual({ ok: true, out: '100\n' })
})

/** The arguments and the options the office's git reader gives every read, as `aGitRead` makes them. */
const theGitRead = (directory: string, args: string[]) => ({
  args: guardedGitArguments(directory, args, { before: ['--literal-pathspecs'] }),
  options: { env: guardedGitEnvironment(), maxBuffer: 64 * 1024 * 1024, timeout: 30_000 },
})

it('5. the git reader that holds the thread starts git hidden', () => {
  starts.prints = 'abc\n'

  const read = res.readGit(folder, ['rev-parse', 'HEAD'])

  const expected = theGitRead(folder, ['rev-parse', 'HEAD'])
  expect(starts.seen).toEqual([
    {
      how: 'execFileSync',
      command: 'git',
      args: expected.args,
      options: { ...expected.options, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    },
  ])
  expect(read.toString('utf8')).toBe('abc\n')
})

it('6. the git reader that waits starts git hidden', async () => {
  starts.prints = 'abc\n'

  const read = await res.readGitAsync(folder, ['rev-parse', 'HEAD'])

  const expected = theGitRead(folder, ['rev-parse', 'HEAD'])
  expect(starts.seen).toEqual([
    { how: 'execFile', command: 'git', args: expected.args, options: { ...expected.options, encoding: 'buffer', windowsHide: true } },
  ])
  expect(read.toString('utf8')).toBe('abc\n')
})

it('7. the guarded git starts git hidden', () => {
  starts.prints = 'README.md\n'

  const said = whatGuardedGitSays(folder, ['ls-files', '--', 'README.md'], 5_000)

  expect(starts.seen).toEqual([
    {
      how: 'spawnSync',
      command: 'git',
      args: guardedGitArguments(folder, ['ls-files', '--', 'README.md']),
      options: { env: guardedGitEnvironment({ LC_ALL: 'C' }), encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    },
  ])
  expect(said).toEqual({ status: 0, stdout: 'README.md\n', stderr: '' })
})

it("8. the window's run of the mole-office command starts Node hidden", async () => {
  starts.prints = 'started\n'

  const ran = await desktop.runTheCommand('start')

  expect(starts.seen).toEqual([
    {
      how: 'spawn',
      command: process.execPath,
      args: [...howToStart('command').args, 'start'],
      options: { cwd: REPO_ROOT, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    },
  ])
  expect(ran).toEqual({ ok: true, code: 0, said: 'started' })
})

it("9. the worker's version read starts the program it found hidden", () => {
  const program = join(folder, 'a-tool-with-a-version')
  writeFileSync(program, '')
  chmodSync(program, 0o755)
  starts.prints = '1.2.3\n'

  const ran = os.theProgramThatRan('a-tool-with-a-version', folder)

  expect(starts.seen).toEqual([
    {
      how: 'spawnSync',
      command: program,
      args: ['--version'],
      options: { encoding: 'utf8', timeout: VERSION_MUST_ANSWER_WITHIN_MS, shell: false, windowsVerbatimArguments: false, windowsHide: true },
    },
  ])
  expect(ran).toEqual({ path: program, version: '1.2.3', versionWasRead: true })
})

it('10. the read of what an OpenCode run was served starts opencode export hidden', () => {
  const env = { PATH: '' }

  const read = theServedOfAnOpenCodeRun({ session: 'ses_one', command: 'opencode', env })

  expect(starts.seen).toEqual([
    {
      how: 'spawnSync',
      command: 'opencode',
      args: ['export', 'ses_one'],
      options: {
        env,
        encoding: 'utf8',
        timeout: THE_LONGEST_AN_EXPORT_TAKES_MS,
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: false,
        windowsHide: true,
      },
    },
  ])
  expect(read.said).toBe('opencode export ses_one printed no session export.')
})

it("11. the run of a stable checkout's tool starts Node hidden", () => {
  const made = aTestDatabaseFolder('a-stable-checkout')
  const checkout = realpathSync(made)
  mkdirSync(join(checkout, 'tools'))
  writeFileSync(join(checkout, 'tools', 'a-tool.mjs'), '')
  stable.folder = checkout
  // The tool refuses to run while this process names a database of its own, and the test database is named here.
  const database = process.env['MOLE_OFFICE_DB']
  delete process.env['MOLE_OFFICE_DB']
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let code: number
  try {
    code = runInTheStableCheckout('tools/a-tool.mjs', ['--a-switch'], 'a-test')
  } finally {
    said.mockRestore()
    if (database !== undefined) process.env['MOLE_OFFICE_DB'] = database
    removeThisTestFolder(made)
  }

  expect(starts.seen).toEqual([
    {
      how: 'spawnSync',
      command: process.execPath,
      args: [join(checkout, 'tools', 'a-tool.mjs'), '--a-switch'],
      options: {
        cwd: checkout,
        stdio: 'inherit',
        env: expect.objectContaining({ MOLE_OFFICE_DEVELOPMENT_CHECKOUT: expect.any(String) }),
        windowsHide: true,
      },
    },
  ])
  expect(code).toBe(0)
})
