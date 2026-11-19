// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VERSION READ AND THE POWERSHELL READS START WITH NO WINDOW.
 *
 * On Windows the office's server runs with no console of its own, because the starter starts it detached. Windows
 * gives a console program started from such a process a console window of its own, unless the start asks for none. In
 * Node a start asks for none with `windowsHide: true`.
 *
 * When the page that lists the agents' terminals opens, the browser asks GET /api/harnesses. Its answer asks each agent
 * tool found on the PATH for its version, all at the same time. npm installs an agent tool on Windows as a .cmd file,
 * and a .cmd file starts through cmd.exe. On a Windows 11 machine, many console windows opened and closed as that page
 * opened. The version read now starts hidden.
 *
 * The other programs that the page's requests can start are PowerShell scripts, and these were hidden already. One
 * reads who sent a request. The other reads a terminal holder that this server has not recorded yet. The PowerShell
 * runner in src/config/systems/windows-commands.mjs starts every one of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Every start through node:child_process is noted here. A start of a program that does not exist on this machine is
 * answered by a stand-in, which prints a line and ends, so nothing of that name is started.
 *
 *   1. The Windows probe's version read starts the program it found with `windowsHide: true`, and with the options it
 *      had before: no shell, standard input ignored, both outputs read, the time limit, only the caller's environment,
 *      and the arguments quoted by Node. The answer is the version that the program printed. The program is this
 *      machine's node.
 *   2. With this process standing in for Windows, the version read of a .cmd tool starts cmd.exe with the line that
 *      theWayToStart gives. The arguments are passed as written, and the start has `windowsHide: true`.
 *   3. The PowerShell runner's start that waits for the script (spawnSync) has `windowsHide: true`.
 *   4. The PowerShell runner's start that does not wait for the script (spawn) has `windowsHide: true`.
 *
 * WHAT ONLY WINDOWS CAN SHOW. Node is trusted to start a program with no window when a start has `windowsHide: true`.
 * No case here runs on Windows, and no case can see a window.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, each run against this file alone
 * ---------------------------------------------------------------------------------------
 *
 *   (a) `windowsHide: true` taken off the version read in src/server/lib/resources.ts: cases 1 and 2 go red.
 *   (b) `windowsHide: true` taken off the start that waits in src/config/systems/windows-commands.mjs: case 3 goes red.
 *   (c) `windowsHide: true` taken off the start that does not wait, in the same file: case 4 goes red.
 */

import type { SpawnOptions, SpawnSyncOptions } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

import { VERSION_MUST_ANSWER_WITHIN_MS } from '../src/config/runtimes.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** Each start made through node:child_process while this file runs, and the program a stand-in answers for. */
const starts = vi.hoisted(() => ({
  seen: [] as { how: 'spawn' | 'spawnSync'; command: string; args: string[]; options: Record<string, unknown> }[],
  standIn: null as { command: string; prints: string } | null,
}))

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  /** A child that prints one line and ends with status 0 once both of its outputs have been read to the end. */
  const aChildThatPrints = (prints: string) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdout, stderr, pid: 0, kill: () => true })
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
  const note = (how: 'spawn' | 'spawnSync', command: string, args: readonly string[] | undefined, options: SpawnOptions | SpawnSyncOptions | undefined): boolean => {
    starts.seen.push({ how, command, args: [...(args ?? [])], options: { ...(options ?? {}) } })
    return starts.standIn !== null && starts.standIn.command === command
  }
  const spawn = (command: string, args?: readonly string[], options?: SpawnOptions) =>
    note('spawn', command, args, options) ? aChildThatPrints(starts.standIn!.prints) : real.spawn(command, args ?? [], options ?? {})
  const spawnSync = (command: string, args?: readonly string[], options?: SpawnSyncOptions) =>
    note('spawnSync', command, args, options)
      ? { pid: 0, output: [null, starts.standIn!.prints, ''], stdout: starts.standIn!.prints, stderr: '', status: 0, signal: null }
      : real.spawnSync(command, args ?? [], options ?? {})
  const mocked = { ...real, spawn, spawnSync }
  return { ...mocked, default: mocked }
})

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let commands: typeof import('../src/config/systems/windows-commands.mjs')
let folder: string

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  commands = await import('../src/config/systems/windows-commands.mjs')
  folder = aTestDatabaseFolder('version-read-hidden')
}, 60_000)

afterAll(() => {
  removeThisTestFolder(folder)
  t?.close()
})

beforeEach(() => {
  starts.seen.length = 0
  starts.standIn = null
})

/** Runs `fn` while this process says it runs on Windows, with the variables Windows sets, and puts all back. */
function onWindows<T>(fn: () => T): T {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  if (platform === undefined) throw new Error('process.platform has no descriptor to put back')
  const before = { PATHEXT: process.env['PATHEXT'], ComSpec: process.env['ComSpec'] }
  Object.defineProperty(process, 'platform', { value: 'win32' })
  process.env['PATHEXT'] = '.COM;.EXE;.BAT;.CMD'
  process.env['ComSpec'] = 'C:\\Windows\\system32\\cmd.exe'
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', platform)
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

it('1. the version read starts the program it found hidden, with the options it had before', async () => {
  const env = { PATH: '' }
  const read = await res.theProbeForThisPlatform('win32').theVersionOfAProgram!(process.execPath, env)

  expect(starts.seen).toEqual([
    {
      how: 'spawn',
      command: process.execPath,
      args: ['--version'],
      options: {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: VERSION_MUST_ANSWER_WITHIN_MS,
        env,
        windowsVerbatimArguments: false,
        windowsHide: true,
      },
    },
  ])
  expect(read).toEqual({ path: process.execPath, version: process.version, versionWasRead: true })
})

it('2. standing in for Windows, the version read of a .cmd tool starts cmd.exe hidden', async () => {
  writeFileSync(join(folder, 'claude.cmd'), '')
  const program = join(folder, 'claude')
  starts.standIn = { command: 'C:\\Windows\\system32\\cmd.exe', prints: '2.0.0 (Claude Code)\n' }
  const probe = res.theProbeForThisPlatform('win32')
  const env = { PATH: '' }

  const pending = onWindows(() => probe.theVersionOfAProgram!(program, env))
  const read = await pending

  const where = `${program}.cmd`
  expect(starts.seen).toEqual([
    {
      how: 'spawn',
      command: 'C:\\Windows\\system32\\cmd.exe',
      args: ['/d', '/s', '/v:off', '/c', `""${where}" "--version""`],
      options: {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: VERSION_MUST_ANSWER_WITHIN_MS,
        env,
        windowsVerbatimArguments: true,
        windowsHide: true,
      },
    },
  ])
  expect(read).toEqual({ path: where, version: '2.0.0 (Claude Code)', versionWasRead: true })
})

it('3. the PowerShell runner starts a script it waits for hidden', () => {
  const program = commands.thePowerShellProgram()
  starts.standIn = { command: program, prints: 'one\n' }

  const did = commands.theRealWindowsCommands().powershell('Write-Output one')

  expect(did).toEqual({ command: program, ran: true, status: 0, stdout: 'one\n', stderr: '' })
  expect(starts.seen.map(({ how, command, args }) => ({ how, command, args }))).toEqual([
    { how: 'spawnSync', command: program, args: commands.thePowerShellArguments('Write-Output one') },
  ])
  expect(starts.seen[0]!.options['windowsHide']).toBe(true)
})

it('4. the PowerShell runner starts a script it does not wait for hidden', async () => {
  const program = commands.thePowerShellProgram()
  starts.standIn = { command: program, prints: 'one\n' }

  const did = await commands.theRealWindowsCommands().startPowerShell('Write-Output one')

  expect(did).toEqual({ command: program, ran: true, status: 0, stdout: 'one\n', stderr: '' })
  expect(starts.seen.map(({ how, command, args }) => ({ how, command, args }))).toEqual([
    { how: 'spawn', command: program, args: commands.thePowerShellArguments('Write-Output one') },
  ])
  expect(starts.seen[0]!.options['windowsHide']).toBe(true)
})
