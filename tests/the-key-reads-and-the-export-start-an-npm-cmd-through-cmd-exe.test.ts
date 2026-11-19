// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY READS AND THE EXPORT READ START A .cmd THAT NPM INSTALLED THROUGH cmd.exe.
 *
 * On Windows npm installs Codex as codex.cmd and OpenCode as opencode.cmd. Node does not find a .cmd by its bare name,
 * because it tries only .com and .exe. And Node will not start a .cmd without a shell. So the read of whether Codex
 * holds a login said that codex is not installed on this machine, on a machine where it was. The read of what an
 * OpenCode run was served said that the export could not run. Each read now starts the program the way `theWayToStart`
 * (src/config/runtimes.mjs) gives it: cmd.exe, with the program and each word in double quotes, passed as written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Windows is stood in by the system that `whereIsThisTool` and `theWayToStart` take, so no case changes this process's
 * platform. The PATH is a folder this file makes, and the .cmd files in it are empty. Every spawnSync a case makes is
 * noted here and answered by a stand-in that prints what the case gives it, so no case starts a real program.
 *
 *   1. The Codex key read (`whatAnAgentToolSaysAboutItsKey`, src/server/lib/resources.ts) finds codex.cmd on the PATH
 *      and starts cmd.exe with `codex login status`, passed as written, hidden, with the limits it had before.
 *   2. The OpenCode key read finds opencode.cmd and starts cmd.exe with `opencode auth list` in the same way.
 *   3. The read of what an OpenCode run was served (`theServedOfAnOpenCodeRun`, src/config/runtime-served.mjs) starts
 *      the opencode.cmd it is handed through cmd.exe with `export <session>`, passed as written, hidden, with the
 *      options it had before.
 *   4. A tool that is not on the PATH is not installed on this machine, in the words the key read said before, and
 *      nothing is started.
 *   5. In a folder whose name holds a "%", `theWayToStart` refuses the .cmd. Each of the three reads says that refusal
 *      as a start that could not run. None of them throws, and nothing is started.
 *
 * WHAT ONLY WINDOWS CAN SHOW. No case runs on Windows. Nobody has seen cmd.exe run the .cmd files npm writes with these
 * words, or seen what Codex and OpenCode print there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT SHOULD TURN EACH CASE RED. Not run yet.
 * ---------------------------------------------------------------------------------------
 *
 *   (a) The key read's runner in src/server/lib/resources.ts starting `where` and `args` instead of `way`: cases 1
 *       and 2.
 *   (b) `windowsVerbatimArguments` left off that start: cases 1 and 2.
 *   (c) `theServedOfAnOpenCodeRun` starting `run.command` instead of `way`: case 3.
 *   (d) The key read starting the bare name again, with no finder: cases 1, 2 and 4.
 *   (e) The try around either `theWayToStart` taken out: case 5 throws.
 */

import type { SpawnSyncOptions } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

import { THE_LONGEST_AN_EXPORT_TAKES_MS, theServedOfAnOpenCodeRun } from '../src/config/runtime-served.mjs'
import { theWayToStart, type TheSystem, whereIsThisTool } from '../src/config/runtimes.mjs'
import { freshDb, type TestDb } from './helpers.ts'

/**
 * Each spawnSync made while a case runs, and what the stand-in prints. While `prints` is null, as it is before the
 * cases, a start goes to the real node:child_process and is not noted.
 */
const starts = vi.hoisted(() => ({
  seen: [] as { command: string; args: string[]; options: Record<string, unknown> }[],
  prints: null as string | null,
}))

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  const spawnSync = (command: string, args?: readonly string[], options?: SpawnSyncOptions) => {
    if (starts.prints === null) return real.spawnSync(command, args ?? [], options ?? {})
    starts.seen.push({ command, args: [...(args ?? [])], options: { ...(options ?? {}) } })
    return { pid: 0, output: [null, starts.prints, ''], stdout: starts.prints, stderr: '', status: 0, signal: null }
  }
  const mocked = { ...real, spawnSync }
  return { ...mocked, default: mocked }
})

const CMD_EXE = 'C:\\Windows\\system32\\cmd.exe'

/**
 * WINDOWS, AS THE FINDER AND THE STARTER READ IT. The finder joins a folder and a name the Windows way, which writes "\"
 * for each "/". So `isThere` looks for the file with each "\" turned back into "/". The file it finds is one this file
 * made, and nothing installed on this machine is looked at.
 */
const WINDOWS: TheSystem = {
  platform: 'win32',
  pathext: '.COM;.EXE;.BAT;.CMD',
  comspec: CMD_EXE,
  isThere: (path) => existsSync(path.replaceAll('\\', '/')),
}

/** The limits the key read gives its command. */
const THE_KEY_READS_LIMITS = { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }

let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let folder: string | undefined

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  folder = mkdtempSync(join(tmpdir(), 'the-key-reads-find-a-cmd-'))
}, 60_000)

afterAll(() => {
  starts.prints = null
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true })
  t?.close()
})

beforeEach(() => {
  starts.seen.length = 0
  starts.prints = ''
})

/** A folder of this file's own, named `name`, holding an empty file for each of `files`. */
function aFolderHolding(name: string, files: readonly string[]): string {
  const made = join(folder!, name)
  mkdirSync(made)
  for (const file of files) writeFileSync(join(made, file), '')
  return made
}

/** Runs `fn` with this process's PATH set to `path` alone, and puts the PATH back. */
function withThePath<T>(path: string, fn: () => T): T {
  const before = process.env['PATH']
  process.env['PATH'] = path
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env['PATH']
    else process.env['PATH'] = before
  }
}

/** What `theWayToStart` says when it refuses to start `program` with `args` on Windows. */
function theRefusalOf(program: string, args: readonly string[]): string {
  try {
    theWayToStart(program, args, WINDOWS)
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(`theWayToStart started ${program} on Windows, and this case needs it refused.`)
}

it('1. the Codex key read finds codex.cmd and starts it through cmd.exe, hidden', () => {
  const path = aFolderHolding('codex', ['codex.cmd'])
  starts.prints = 'Logged in using ChatGPT\n'

  const said = withThePath(path, () => res.theProbeForThisPlatform('win32').whatAnAgentToolSaysAboutItsKey!('codex', WINDOWS))

  const where = win32.join(path, 'codex.cmd')
  expect(starts.seen).toEqual([
    {
      command: CMD_EXE,
      args: ['/d', '/s', '/v:off', '/c', `""${where}" "login" "status""`],
      options: { encoding: 'utf8', ...THE_KEY_READS_LIMITS, windowsVerbatimArguments: true, windowsHide: true },
    },
  ])
  expect(said.state).toBe('set')
})

it('2. the OpenCode key read finds opencode.cmd and starts it through cmd.exe, hidden', () => {
  const path = aFolderHolding('opencode', ['opencode.cmd'])
  starts.prints = 'zhipuai  api\n'

  const said = withThePath(path, () => res.theProbeForThisPlatform('win32').whatAnAgentToolSaysAboutItsKey!('opencode', WINDOWS))

  const where = win32.join(path, 'opencode.cmd')
  expect(starts.seen).toEqual([
    {
      command: CMD_EXE,
      args: ['/d', '/s', '/v:off', '/c', `""${where}" "auth" "list""`],
      options: { encoding: 'utf8', ...THE_KEY_READS_LIMITS, windowsVerbatimArguments: true, windowsHide: true },
    },
  ])
  expect(said.state).toBe('set')
})

it('3. the read of what an OpenCode run was served starts the opencode.cmd it is handed through cmd.exe, hidden', () => {
  const path = aFolderHolding('opencode-export', ['opencode.cmd'])
  // What the OpenCode adapter hands the read is the program it found.
  const where = whereIsThisTool('opencode', path, WINDOWS)
  expect(where).toBe(win32.join(path, 'opencode.cmd'))
  starts.prints = JSON.stringify({ info: {}, messages: [{ info: { role: 'assistant', providerID: 'zhipuai', modelID: 'glm-5' } }] })
  const env = { PATH: path }

  const read = theServedOfAnOpenCodeRun({ session: 'ses_one', command: where!, env }, WINDOWS)

  expect(starts.seen).toEqual([
    {
      command: CMD_EXE,
      args: ['/d', '/s', '/v:off', '/c', `""${where}" "export" "ses_one""`],
      options: {
        env,
        encoding: 'utf8',
        timeout: THE_LONGEST_AN_EXPORT_TAKES_MS,
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsVerbatimArguments: true,
        windowsHide: true,
      },
    },
  ])
  expect(read.served.model).toBe('zhipuai/glm-5')
})

it('4. a tool that is not on the PATH is not installed on this machine, and nothing is started', () => {
  const path = aFolderHolding('nothing-installed', [])
  const probe = res.theProbeForThisPlatform('win32')

  const said = withThePath(path, () => (['codex', 'opencode'] as const).map((which) => probe.whatAnAgentToolSaysAboutItsKey!(which, WINDOWS)))

  expect(starts.seen).toEqual([])
  expect(said).toEqual([
    { state: 'nobody-has-looked', says: 'Not looked at: codex is not installed on this machine.', asked: 'codex login status' },
    { state: 'nobody-has-looked', says: 'Not looked at: opencode is not installed on this machine.', asked: 'opencode auth list' },
  ])
})

it('5. a .cmd that theWayToStart refuses is said as a start that could not run, and nothing is started', () => {
  const path = aFolderHolding('100%', ['codex.cmd', 'opencode.cmd'])
  const codex = win32.join(path, 'codex.cmd')
  const opencode = win32.join(path, 'opencode.cmd')
  const probe = res.theProbeForThisPlatform('win32')

  const said = withThePath(path, () => (['codex', 'opencode'] as const).map((which) => probe.whatAnAgentToolSaysAboutItsKey!(which, WINDOWS)))
  const read = theServedOfAnOpenCodeRun({ session: 'ses_one', command: opencode, env: { PATH: path } }, WINDOWS)

  expect(starts.seen).toEqual([])
  expect(said).toEqual([
    {
      state: 'nobody-has-looked',
      says: `Not looked at: codex could not be run: ${theRefusalOf(codex, ['login', 'status'])}`,
      asked: 'codex login status',
    },
    {
      state: 'nobody-has-looked',
      says: `Not looked at: opencode could not be run: ${theRefusalOf(opencode, ['auth', 'list'])}`,
      asked: 'opencode auth list',
    },
  ])
  expect(read.said).toBe(`opencode export ses_one could not run: ${theRefusalOf(opencode, ['export', 'ses_one'])}`)
})
