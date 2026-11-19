// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ENTRY'S PRESS DOES NOT HOLD THE SERVER'S THREAD. Wave 13t, rounds W50 and W51.
 *
 * The person's press of `POST /api/office/install-the-entry` runs `installTheEntry` (src/config/install-the-entry.mjs)
 * on the server's one thread. Until this round every file call the press made was a Sync call of node:fs, and an
 * installed office's question to its installer ran dpkg-query or PowerShell with the thread held. While a call like
 * that runs, the server answers no other request. On Windows the PowerShell script alone takes about a second
 * (src/config/systems/windows-commands.mjs says so).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 *   1. While a press waits for the settings file to be read, the office answers another request. The settings file is
 *      a named pipe, and a read of it waits until something writes into it. A worker thread writes the file's text
 *      into it when this case says so. A press that holds the thread could not be told, so the worker also writes
 *      after four seconds, and the case ends instead of waiting for ever. The case is red when the text went in before
 *      the other request was answered. The order of the two answers alone does not show it: a press that held the
 *      thread for those four seconds can still answer after the other request, and until round W51 this case was
 *      green on such a press.
 *   2. On Windows, while an installed office's press waits for PowerShell's list of installed apps, the office
 *      answers another request. PowerShell is a stand-in that answers when this case says so. The press starts it
 *      the way that leaves the thread free (`startPowerShell`), and never the way that holds it (`powershell`).
 *   3. No press makes a Sync call of node:fs or node:child_process, in any of its shapes: an ordinary checkout's first
 *      and second press, a press refused at the settings file's write, an AppImage's press, an installed office's
 *      press on Linux (dpkg) and on Windows (PowerShell), and a linked worktree and a copy, each refused. Every Sync
 *      call made from the press's own files is noted with the path it names, so a red run says which call is left.
 *   4. Two presses at the same moment run one after the other, as they did while each held the thread. The first
 *      writes, and the second finds the entry in place and says nothing was written. A press that ends with an error
 *      does not stop the press after it.
 *
 * The same for Codex's and OpenCode's entry, whose two doors are `GET` and `POST /api/office/install-the-entry/other-
 * runtimes` (round W51). Until that round the plan and the press read and wrote each runtime's AGENTS.md by Sync calls.
 *
 *   5. While the plan door waits for Codex's AGENTS.md to be read, the office answers another request. AGENTS.md is a
 *      named pipe, written into as in case 1.
 *   6. While the press waits for Codex's AGENTS.md to be read, the office answers another request. The press names
 *      OpenCode too, whose directory is missing, so it is refused after that one read and writes nothing.
 *   7. Neither door makes a Sync call of node:fs or node:child_process: the plan, a press that creates the file and a
 *      second that finds it in place, a press that backs the file up and appends the block and one that replaces an
 *      older block, a press refused at the write, and presses refused by a plan.
 *   8. Two presses of the other runtimes at the same moment run one after the other. One backs the person's file up
 *      and writes the block, and the other says nothing would change. There is one backup and one block.
 *   9. A press of the other runtimes waits for a press of the Claude Code entry that is still at work, because both
 *      wait in one queue in their module.
 *
 * The other request is `GET /api/health`, answered by the product's own app in this process, which is the process
 * the press runs in. The Claude Code entry's press is driven through `installTheEntry`, the one function the door
 * awaits: in a worktree the door's own checkout is refused before any of this work
 * (tests/the-entry-follows-the-person.test.ts says why). The other runtimes' doors are driven through the app, as the
 * person.
 *
 * This file replaces node:fs and node:child_process for itself, to see each Sync call, so the guard on writes into the
 * owner's home does not wrap this file's node:fs. Every write here goes to a scratch folder it makes under the system
 * temporary folder, and HOME points into it (tests/no-test-writes-into-the-owners-home.test.ts names this file).
 */

import { Worker } from 'node:worker_threads'
import { closeSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { installTheEntry, OTHER_RUNTIME_BLOCK_START } from '../src/config/install-the-entry.mjs'
import { theShippedNodeIn } from '../src/config/settings.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER, windowsInstallerQuestion } from '../src/config/systems/the-installer-of-a-folder.mjs'

type WhatACommandDid = import('../src/config/process-reader.mjs').WhatACommandDid
type WindowsCommands = import('../src/config/systems/windows-commands.mjs').WindowsCommands

/**
 * EVERY SYNC CALL THE PRESS MAKES, noted while `on` is true. A call is the press's when one of the press's own files is
 * on its stack, so a call the office makes for itself in the same moment, from a timer of its own, is not counted.
 *
 * ONE READ IS NOT COUNTED: the office's settings reading their `.env` file. The other runtimes' block names the office's
 * address, which it asks `settings()` in src/config/settings.mjs for. That function reads `.env` afresh by Sync calls
 * every time it is asked, on purpose (its own note says why), and every door that reads a setting makes the same read.
 * So the press does make it, and it is the office's reading of its own settings, not the press's work on the files it
 * writes. Only a call whose caller is settings.mjs and whose path is a `.env` file is left out.
 */
const thread = vi.hoisted(() => {
  const state = { on: false, calls: [] as string[] }
  const thePressesFiles = /install-the-entry\.mjs|the-installer-of-a-folder\.mjs|a-backup-under-a-free-name\.mjs|worker\/rules\.ts/u
  // The stack's first line is the error's, the second this file's wrapper, and the third the caller.
  const theSettingsReadOfTheirEnvFile = (stack: string, path: unknown): boolean =>
    /src\/config\/settings\.mjs/u.test(stack.split('\n')[2] ?? '') && String(path).endsWith('/.env')
  const noted = (module: string, name: string, real: (...args: unknown[]) => unknown) =>
    function (this: unknown, ...args: unknown[]) {
      const stack = new Error().stack ?? ''
      if (state.on && thePressesFiles.test(stack) && !theSettingsReadOfTheirEnvFile(stack, args[0])) {
        state.calls.push(`${module} ${name} ${String(args[0])}`)
      }
      return real.apply(this, args)
    }
  const everySyncCallOf = (module: string, real: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...real }
    for (const [name, value] of Object.entries(real)) {
      if (name.endsWith('Sync') && typeof value === 'function') out[name] = noted(module, name, value as (...args: unknown[]) => unknown)
    }
    return out
  }
  return { state, everySyncCallOf }
})

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const noted = thread.everySyncCallOf('node:fs', real)
  return { ...noted, default: noted }
})

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const noted = thread.everySyncCallOf('node:child_process', real)
  return { ...noted, default: noted }
})

/** The Sync calls the press made while `press` ran, with what the press answered. */
async function theSyncCallsOf<T>(press: () => T | Promise<T>): Promise<{ answer: T; calls: string[] }> {
  thread.state.calls = []
  thread.state.on = true
  try {
    const answer = await press()
    return { answer, calls: [...thread.state.calls] }
  } finally {
    thread.state.on = false
  }
}

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
/**
 * `installTheEntry` as the app holds it. `freshDb` resets the module registry, so the app's copy of the press's module,
 * and its queue, is not the one this file imports above.
 */
let theAppsInstallTheEntry: typeof installTheEntry
let scratch: string
let home: string

const settingsPath = (): string => join(home, '.claude', 'settings.json')
const skillLink = (): string => join(home, '.claude', 'skills', 'mole-office')
const skillOf = (office: string): string => join(office, '.claude', 'skills', 'mole-office')
const stampOf = (office: string): string => join(office, 'build-stamp.json')

/** Whether anything is at `path`, a link to nothing included. */
function somethingIsAt(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** A made-up settings file the person already has, with one key of their own. */
const THE_PERSONS_SETTINGS = `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`

/** A checkout git keeps, as the office's own is: a `.git` folder, the skill and the session hook. */
function aCheckout(): string {
  const checkout = join(scratch, 'checkout')
  mkdirSync(join(checkout, '.git'), { recursive: true })
  mkdirSync(skillOf(checkout), { recursive: true })
  writeFileSync(join(skillOf(checkout), 'SKILL.md'), '# the skill, made up for this test\n', 'utf8')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  writeFileSync(join(checkout, 'tools', 'session-hook.mjs'), '// the hook, made up for this test\n', 'utf8')
  return checkout
}

/** A made-up installed office in `root`: the skill, the build stamp, the built hook and the Node file, and no `.git`. */
function anInstalledOffice(root: string, platform: 'linux' | 'win32'): string {
  const office = join(root, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)
  mkdirSync(join(skillOf(office), 'notes'), { recursive: true })
  writeFileSync(join(skillOf(office), 'SKILL.md'), '# the skill, made up for this test\n', 'utf8')
  writeFileSync(join(skillOf(office), 'notes', 'a-note.md'), '# a note, made up for this test\n', 'utf8')
  writeFileSync(stampOf(office), `${JSON.stringify({ version: '0.0.0-made-up', builtAt: '2026-11-08T00:00:00.000Z' })}\n`, 'utf8')
  mkdirSync(join(office, 'for-agents'), { recursive: true })
  writeFileSync(join(office, 'for-agents', 'session-hook.mjs'), '// the built hook, made up for this test\n', 'utf8')
  const node = join(office, ...theShippedNodeIn(platform))
  mkdirSync(dirname(node), { recursive: true })
  writeFileSync(node, '', 'utf8')
  return office
}

/** What the Windows script prints when Installed apps holds `root` as the entry `entry`. */
const theListHolding = (entry: string, root: string): WhatACommandDid => ({
  command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ran: true,
  status: 0,
  stdout: `entry\t${entry}\t${root}\r\nlisted\r\n`,
  stderr: '',
})

/** A promise this file settles itself, when a case says so. */
function aPromiseHeldOpen<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

/** Wait, without holding the thread, until `ready` says yes. A press that holds the thread is past it by then. */
async function until(ready: () => boolean, what: string): Promise<void> {
  const by = Date.now() + 10_000
  while (!ready()) {
    if (Date.now() > by) throw new Error(`waited ten seconds for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/**
 * THE WRITER OF THE NAMED PIPE, on a thread of its own. It opens the pipe to write, which waits until the press opens
 * it to read, and then says so in `signals[0]`. It writes the text and closes the pipe when `signals[1]` is set, or
 * after `longest` milliseconds. It says in `signals[2]` that it is about to write.
 */
const THE_PIPES_WRITER = `
const { workerData } = require('node:worker_threads')
const { openSync, writeSync, closeSync } = require('node:fs')
const signals = new Int32Array(workerData.signals)
const fd = openSync(workerData.pipe, 'w')
Atomics.store(signals, 0, 1)
Atomics.wait(signals, 1, 0, workerData.longest)
Atomics.store(signals, 2, 1)
writeSync(fd, workerData.text)
closeSync(fd)
`

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  theAppsInstallTheEntry = (await import('../src/config/install-the-entry.mjs')).installTheEntry
  // The first answer of a new app is slower than the rest; it is had here, before any case times one.
  expect((await app.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
}, 60_000)

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'w50-entry-thread-'))
  home = join(scratch, 'home')
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(settingsPath(), THE_PERSONS_SETTINGS, 'utf8')
  vi.stubEnv('HOME', home)
  vi.stubEnv('XDG_CONFIG_HOME', join(scratch, 'config'))
  vi.stubEnv('APPIMAGE', '')
  vi.stubEnv('APPDIR', '')
  vi.stubEnv('CODEX_HOME', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the office answers while a press waits', () => {
  it('1: while a press waits for the settings file to be read, another request is answered', async () => {
    const checkout = aCheckout()
    const first = await installTheEntry({ home, checkout })
    expect(first.ok, first.says).toBe(true)
    const text = readFileSync(settingsPath(), 'utf8')
    unlinkSync(settingsPath())
    const made = spawnSync('mkfifo', [settingsPath()], { encoding: 'utf8' })
    expect(made.status, `mkfifo could not make the pipe: ${made.stderr}`).toBe(0)

    const signals = new Int32Array(new SharedArrayBuffer(12))
    const writer = new Worker(THE_PIPES_WRITER, { eval: true, workerData: { pipe: settingsPath(), text, longest: 4000, signals: signals.buffer } })
    const writerEnded = new Promise((resolve) => writer.once('exit', resolve))
    try {
      const order: string[] = []
      const pressed = Promise.resolve(installTheEntry({ home, checkout })).then((answer) => {
        order.push('the press')
        return answer
      })
      await until(() => Atomics.load(signals, 0) === 1, 'the press to open the settings file')
      const other = await app.app.inject({ method: 'GET', url: '/api/health' })
      order.push('another request')
      const writtenFirst = Atomics.load(signals, 2) === 1
      Atomics.store(signals, 1, 1)
      Atomics.notify(signals, 1)
      const answer = await pressed

      expect(writtenFirst, 'the press held the thread until the writer gave up waiting and wrote the settings file').toBe(false)
      expect(order, 'the press held the thread until the settings file was read').toEqual(['another request', 'the press'])
      expect(other.statusCode).toBe(200)
      expect(answer).toMatchObject({ ok: true, changed: false })
    } finally {
      // A writer still waiting for a reader is given one, so its thread can end.
      if (Atomics.load(signals, 0) === 0) {
        const reader = openSync(settingsPath(), constants.O_RDONLY | constants.O_NONBLOCK)
        Atomics.store(signals, 1, 1)
        Atomics.notify(signals, 1)
        await writerEnded
        closeSync(reader)
      }
      Atomics.store(signals, 1, 1)
      Atomics.notify(signals, 1)
      await writerEnded
    }
  })

  it("2: on Windows, while an installed office's press waits for PowerShell's list of installed apps, another request is answered", async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const asked: string[] = []
    const listed = aPromiseHeldOpen<WhatACommandDid>()
    const commands: WindowsCommands = {
      powershell: () => {
        asked.push('powershell, which holds the thread')
        return theListHolding('a1b2c3-mole-office', root)
      },
      startPowerShell: () => {
        asked.push('startPowerShell')
        return listed.promise
      },
    }
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(commands) } as const

    const order: string[] = []
    const pressed = Promise.resolve(installTheEntry({ home, checkout: office, system })).then((answer) => {
      order.push('the press')
      return answer
    })
    await until(() => asked.length > 0, 'the press to ask PowerShell')
    const other = await app.app.inject({ method: 'GET', url: '/api/health' })
    order.push('another request')
    listed.settle(theListHolding('a1b2c3-mole-office', root))
    const answer = await pressed

    expect(asked).toEqual(['startPowerShell'])
    expect(order, 'the press held the thread while PowerShell ran').toEqual(['another request', 'the press'])
    expect(other.statusCode).toBe(200)
    expect(answer.ok, answer.says).toBe(true)
    expect(answer).toMatchObject({ changed: true, createdSkillLink: true, addedSessionStart: true, addedStop: true, addedSessionEnd: true })
    expect(answer.says).toContain('which Windows lists in Installed apps as a1b2c3-mole-office')
    expect(readlinkSync(skillLink())).toBe(skillOf(office))
  })
})

describe('no press makes a Sync call', () => {
  it("3a: an ordinary checkout's first press, which writes the link, the copy and the settings file, and its second", async () => {
    const checkout = aCheckout()
    const first = await theSyncCallsOf(() => installTheEntry({ home, checkout }))
    expect(first.answer).toMatchObject({ ok: true, changed: true, createdSkillLink: true, addedSessionStart: true })
    expect(first.answer.ok && first.answer.backupPath, 'the first press made no copy of the settings file').toBeTruthy()
    expect(first.calls).toEqual([])

    const second = await theSyncCallsOf(() => installTheEntry({ home, checkout }))
    expect(second.answer).toMatchObject({ ok: true, changed: false })
    expect(second.calls).toEqual([])
  })

  it("3b: a press refused at the settings file's write, which takes its copy away and puts the link back", async () => {
    const checkout = aCheckout()
    mkdirSync(`${settingsPath()}.mole-office-${String(process.pid)}`)
    const refused = await theSyncCallsOf(() => installTheEntry({ home, checkout }))
    expect(refused.answer.ok).toBe(false)
    expect(refused.answer.says).toContain('The settings file could not be written')
    expect(existsSync(`${settingsPath()}.mole-office-backup`), 'the refused press left its copy').toBe(false)
    expect(somethingIsAt(skillLink()), 'the refused press left its link').toBe(false)
    expect(readFileSync(settingsPath(), 'utf8')).toBe(THE_PERSONS_SETTINGS)
    expect(refused.calls).toEqual([])
  })

  it("3c: an AppImage's press, which writes the copy of the skill, the launcher, the link and the lines", async () => {
    const mount = join(scratch, 'tmp', '.mount_MoleOfW50')
    const office = anInstalledOffice(mount, 'linux')
    vi.stubEnv('APPIMAGE', join(scratch, 'Downloads', 'Mole-Office.AppImage'))
    vi.stubEnv('APPDIR', mount)
    const pressed = await theSyncCallsOf(() => installTheEntry({ home, checkout: office, system: theSystemFor('linux') }))
    expect(pressed.answer.ok, pressed.answer.says).toBe(true)
    expect(pressed.answer.says).toContain('This office runs from an AppImage')
    const copy = join(scratch, 'config', 'mole-office', 'skills', 'mole-office')
    expect(readFileSync(join(copy, 'notes', 'a-note.md'), 'utf8')).toBe('# a note, made up for this test\n')
    expect(readlinkSync(skillLink())).toBe(copy)
    expect(existsSync(join(scratch, 'config', 'mole-office', 'session-hook', 'run')), 'the launcher was not written').toBe(true)
    expect(pressed.calls).toEqual([])
  })

  it("3d: an installed office's press on Linux, which asks dpkg", async () => {
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'), 'linux')
    const standIns = join(scratch, 'stand-ins')
    mkdirSync(standIns)
    writeFileSync(
      join(standIns, 'dpkg-query'),
      ['#!/bin/sh', `if [ "$2" = '${stampOf(office)}' ]; then printf '%s\\n' 'mole-office: ${stampOf(office)}'; exit 0; fi`, 'exit 1', ''].join('\n'),
      { encoding: 'utf8', mode: 0o755 },
    )
    vi.stubEnv('PATH', standIns)
    const pressed = await theSyncCallsOf(() => installTheEntry({ home, checkout: office, system: theSystemFor('linux') }))
    expect(pressed.answer.ok, pressed.answer.says).toBe(true)
    expect(pressed.answer.says).toContain('the one the package mole-office installed')
    expect(pressed.calls).toEqual([])
  })

  it("3e: an installed office's press on Windows, which asks PowerShell", async () => {
    const root = join(scratch, 'Programs', 'Mole Office')
    const office = anInstalledOffice(root, 'win32')
    const commands: WindowsCommands = {
      powershell: () => {
        thread.state.calls.push('the stand-in PowerShell, started the way that holds the thread')
        return theListHolding('a1b2c3-mole-office', root)
      },
      startPowerShell: async () => theListHolding('a1b2c3-mole-office', root),
    }
    const system = { platform: 'win32', aFolderIsLinkedBy: 'a-junction', anInstallerMade: windowsInstallerQuestion(commands) } as const
    const pressed = await theSyncCallsOf(() => installTheEntry({ home, checkout: office, system }))
    expect(pressed.answer.ok, pressed.answer.says).toBe(true)
    expect(pressed.calls).toEqual([])
  })

  it('3f: a linked worktree and a copy, each refused before anything is written', async () => {
    const worktree = join(scratch, 'worktree')
    mkdirSync(worktree)
    writeFileSync(join(worktree, '.git'), 'gitdir: /somewhere/else\n', 'utf8')
    const refusedWorktree = await theSyncCallsOf(() => installTheEntry({ home, checkout: worktree }))
    expect(refusedWorktree.answer.says).toContain('This checkout is a linked git worktree')
    expect(refusedWorktree.calls).toEqual([])

    const copy = join(scratch, 'copy')
    mkdirSync(copy)
    const refusedCopy = await theSyncCallsOf(() => installTheEntry({ home, checkout: copy }))
    expect(refusedCopy.answer.says).toContain('This folder is not a checkout git keeps')
    expect(refusedCopy.calls).toEqual([])
  })
})

describe('two presses at the same moment', () => {
  it('4: run one after the other: the first writes, the second says nothing was written, and a press that throws does not stop the next', async () => {
    const checkout = aCheckout()
    const [first, second] = await Promise.all([installTheEntry({ home, checkout }), installTheEntry({ home, checkout })])
    expect(first, first.says).toMatchObject({ ok: true, changed: true, createdSkillLink: true, addedSessionStart: true })
    expect(second, second.says).toMatchObject({ ok: true, changed: false })
    expect(readlinkSync(skillLink())).toBe(skillOf(checkout))
    const settings = JSON.parse(readFileSync(settingsPath(), 'utf8')) as { hooks: Record<string, unknown[]> }
    expect(Object.fromEntries(Object.entries(settings.hooks).map(([name, lines]) => [name, lines.length]))).toEqual({ SessionStart: 1, Stop: 1, SessionEnd: 1 })

    // A system that cannot be asked which installer made an installed office makes the press throw.
    const office = anInstalledOffice(join(scratch, 'opt', 'mole-office'), 'linux')
    const thrown = installTheEntry({ home, checkout: office, system: { platform: 'linux', aFolderIsLinkedBy: 'a-symbolic-link' } })
    const after = installTheEntry({ home, checkout })
    await expect(thrown).rejects.toThrow('cannot be asked which installer made')
    expect(await after).toMatchObject({ ok: true, changed: false })
  })
})

// ============================================================================================
// CODEX'S AND OPENCODE'S ENTRY, THROUGH ITS TWO DOORS (round W51)
// ============================================================================================

/** The person, as tests/the-other-runtimes-entry.test.ts presses these doors. */
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
} as const

const codexHome = (): string => join(home, '.codex')
const codexAgents = (): string => join(codexHome(), 'AGENTS.md')
const opencodeHome = (): string => join(home, '.config', 'opencode')
const opencodeAgents = (): string => join(opencodeHome(), 'AGENTS.md')
const firstBackup = (): string => `${codexAgents()}.mole-office-backup`
/** The press's temporary file, AGENTS.md written whole before it is renamed into place. */
const theTemporaryFile = (): string => `${codexAgents()}.mole-office-${String(process.pid)}`

/** A made-up AGENTS.md the person already has, with a line of their own and no Mole Office block. */
const THE_PERSONS_RULES = '# My own rules\n\nAnswer in short sentences.\n'

type Applied = { ok: boolean; changed?: boolean; backupPath?: string | null; path: string; says: string }

const plan = () => app.app.inject({ method: 'GET', url: '/api/office/install-the-entry/other-runtimes' })
const press = (runtimes: string[]) =>
  app.app.inject({ method: 'POST', url: '/api/office/install-the-entry/other-runtimes', headers: PERSON, payload: { runtimes } })
const codexSaid = (pressed: Awaited<ReturnType<typeof press>>): Applied => (pressed.json() as { codex: Applied }).codex

/**
 * A named pipe at `path`, written into by THE_PIPES_WRITER above: `text` goes in when `release` is called, or after four
 * seconds. `opened` says whether a reader has opened it, and `written` whether the text has gone in. `end` waits for the
 * writer's thread, and gives a reader to a writer still waiting for one.
 */
function aPipeAt(path: string, text: string) {
  const made = spawnSync('mkfifo', [path], { encoding: 'utf8' })
  expect(made.status, `mkfifo could not make the pipe: ${made.stderr}`).toBe(0)
  const signals = new Int32Array(new SharedArrayBuffer(12))
  const writer = new Worker(THE_PIPES_WRITER, { eval: true, workerData: { pipe: path, text, longest: 4000, signals: signals.buffer } })
  const writerEnded = new Promise((resolve) => writer.once('exit', resolve))
  const release = (): void => {
    Atomics.store(signals, 1, 1)
    Atomics.notify(signals, 1)
  }
  return {
    opened: (): boolean => Atomics.load(signals, 0) === 1,
    written: (): boolean => Atomics.load(signals, 2) === 1,
    release,
    end: async (): Promise<void> => {
      if (Atomics.load(signals, 0) === 0) {
        const reader = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
        release()
        await writerEnded
        closeSync(reader)
      }
      release()
      await writerEnded
    },
  }
}

describe("the office answers while a door of the other runtimes' entry waits", () => {
  it("5: while the plan door waits for Codex's AGENTS.md to be read, another request is answered", async () => {
    mkdirSync(codexHome(), { recursive: true })
    const pipe = aPipeAt(codexAgents(), THE_PERSONS_RULES)
    try {
      const order: string[] = []
      const planned = plan().then((answer) => {
        order.push('the plan')
        return answer
      })
      await until(pipe.opened, 'the plan to open AGENTS.md')
      const other = await app.app.inject({ method: 'GET', url: '/api/health' })
      order.push('another request')
      const writtenFirst = pipe.written()
      pipe.release()
      const answer = await planned

      expect(writtenFirst, 'the plan held the thread until the writer gave up waiting and wrote AGENTS.md').toBe(false)
      expect(order, 'the plan held the thread until AGENTS.md was read').toEqual(['another request', 'the plan'])
      expect(other.statusCode).toBe(200)
      expect(answer.statusCode).toBe(200)
      expect(answer.json()).toMatchObject({
        codex: { ok: true, changed: true, path: codexAgents() },
        opencode: { ok: false, refused: true, path: opencodeHome() },
      })
    } finally {
      await pipe.end()
    }
  })

  it("6: while the press waits for Codex's AGENTS.md to be read, another request is answered", async () => {
    mkdirSync(codexHome(), { recursive: true })
    const pipe = aPipeAt(codexAgents(), THE_PERSONS_RULES)
    try {
      const order: string[] = []
      const pressed = press(['codex', 'opencode']).then((answer) => {
        order.push('the press')
        return answer
      })
      await until(pipe.opened, 'the press to open AGENTS.md')
      const other = await app.app.inject({ method: 'GET', url: '/api/health' })
      order.push('another request')
      const writtenFirst = pipe.written()
      pipe.release()
      const answer = await pressed

      expect(writtenFirst, 'the press held the thread until the writer gave up waiting and wrote AGENTS.md').toBe(false)
      expect(order, 'the press held the thread until AGENTS.md was read').toEqual(['another request', 'the press'])
      expect(other.statusCode).toBe(200)
      expect(answer.statusCode).toBe(409)
      expect(answer.body).toContain("OpenCode's own directory is not on this machine")
      expect(existsSync(firstBackup()), 'the refused press made a copy').toBe(false)
    } finally {
      await pipe.end()
    }
  })
})

describe("no door of the other runtimes' entry makes a Sync call", () => {
  it("7a: the plan, which reads Codex's file and finds OpenCode's directory missing", async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(codexAgents(), THE_PERSONS_RULES, 'utf8')
    const planned = await theSyncCallsOf(() => plan())
    expect(planned.answer.statusCode).toBe(200)
    expect(planned.answer.json()).toMatchObject({ codex: { ok: true, changed: true }, opencode: { ok: false, refused: true } })
    expect(planned.calls).toEqual([])
  })

  it('7b: a first press that creates both files, and a second that finds them in place', async () => {
    mkdirSync(codexHome(), { recursive: true })
    mkdirSync(opencodeHome(), { recursive: true })
    const first = await theSyncCallsOf(() => press(['codex', 'opencode']))
    expect(first.answer.statusCode, first.answer.body).toBe(200)
    expect(first.answer.json()).toMatchObject({ codex: { ok: true, changed: true, backupPath: null }, opencode: { ok: true, changed: true } })
    expect(readFileSync(opencodeAgents(), 'utf8')).toContain(OTHER_RUNTIME_BLOCK_START)
    expect(first.calls).toEqual([])

    const second = await theSyncCallsOf(() => press(['codex', 'opencode']))
    expect(second.answer.json()).toMatchObject({ codex: { ok: true, changed: false }, opencode: { ok: true, changed: false } })
    expect(second.calls).toEqual([])
  })

  it("7c: a press that backs the person's file up and appends the block, and one that replaces an older block", async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(codexAgents(), THE_PERSONS_RULES, 'utf8')
    const appended = await theSyncCallsOf(() => press(['codex']))
    expect(codexSaid(appended.answer)).toMatchObject({ ok: true, changed: true, backupPath: firstBackup() })
    expect(readFileSync(firstBackup(), 'utf8')).toBe(THE_PERSONS_RULES)
    expect(appended.calls).toEqual([])

    const written = readFileSync(codexAgents(), 'utf8')
    writeFileSync(codexAgents(), written.replace('## Mole Office', '## Mole Office, an older block'), 'utf8')
    const replaced = await theSyncCallsOf(() => press(['codex']))
    expect(codexSaid(replaced.answer)).toMatchObject({ ok: true, changed: true, backupPath: `${firstBackup()}-2` })
    expect(readFileSync(codexAgents(), 'utf8')).toBe(written)
    expect(replaced.calls).toEqual([])
  })

  it('7d: a press refused at the write, which takes its copy away', async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(codexAgents(), THE_PERSONS_RULES, 'utf8')
    mkdirSync(theTemporaryFile())
    const refused = await theSyncCallsOf(() => press(['codex']))
    expect(codexSaid(refused.answer)).toMatchObject({ ok: false, refused: true })
    expect(codexSaid(refused.answer).says).toContain('could not be written, so nothing changed')
    expect(existsSync(firstBackup()), 'the refused press left its copy').toBe(false)
    expect(readFileSync(codexAgents(), 'utf8')).toBe(THE_PERSONS_RULES)
    expect(refused.calls).toEqual([])
  })

  it("7e: presses refused by a plan: Codex's override file, and OpenCode's missing directory beside a Codex that would be written", async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(join(codexHome(), 'AGENTS.override.md'), THE_PERSONS_RULES, 'utf8')
    const overridden = await theSyncCallsOf(() => press(['codex']))
    expect(overridden.answer.statusCode).toBe(409)
    expect(overridden.answer.body).toContain('AGENTS.override.md exists')
    expect(overridden.calls).toEqual([])

    rmSync(join(codexHome(), 'AGENTS.override.md'))
    const neither = await theSyncCallsOf(() => press(['codex', 'opencode']))
    expect(neither.answer.statusCode).toBe(409)
    expect(existsSync(codexAgents()), 'a press refused for OpenCode wrote Codex').toBe(false)
    expect(neither.calls).toEqual([])
  })
})

describe("two presses of the other runtimes' entry", () => {
  it('8: at the same moment run one after the other: one backs the file up and writes the block, the other writes nothing', async () => {
    mkdirSync(codexHome(), { recursive: true })
    writeFileSync(codexAgents(), THE_PERSONS_RULES, 'utf8')
    const answers = (await Promise.all([press(['codex']), press(['codex'])])).map(codexSaid)

    // Either may be the one that writes; the other must find the block in place.
    const wrote = answers.filter((one) => one.changed === true)
    expect(answers.map((one) => one.ok), answers.map((one) => one.says).join('\n')).toEqual([true, true])
    expect(wrote, answers.map((one) => one.says).join('\n')).toHaveLength(1)
    expect(wrote[0]).toMatchObject({ backupPath: firstBackup() })
    expect(existsSync(`${firstBackup()}-2`), 'the second press made a second copy').toBe(false)
    expect(readFileSync(firstBackup(), 'utf8')).toBe(THE_PERSONS_RULES)
    expect(readFileSync(codexAgents(), 'utf8').split(OTHER_RUNTIME_BLOCK_START)).toHaveLength(2)
    expect(existsSync(theTemporaryFile()), 'a temporary file was left').toBe(false)
  })

  it("9: a press of the other runtimes waits for a press of the Claude Code entry that is still at work", async () => {
    const checkout = aCheckout()
    const first = await theAppsInstallTheEntry({ home, checkout })
    expect(first.ok, first.says).toBe(true)
    const text = readFileSync(settingsPath(), 'utf8')
    unlinkSync(settingsPath())
    mkdirSync(codexHome(), { recursive: true })
    const pipe = aPipeAt(settingsPath(), text)
    try {
      const order: string[] = []
      const entry = Promise.resolve(theAppsInstallTheEntry({ home, checkout })).then((answer) => {
        order.push("the Claude Code entry's press")
        return answer
      })
      await until(pipe.opened, "the Claude Code entry's press to open the settings file")
      const other = press(['codex']).then((answer) => {
        order.push("the other runtimes' press")
        return answer
      })
      // A press of the other runtimes alone answers in a few milliseconds. It is given two seconds to answer while the
      // entry's press waits for the settings file, and must not.
      await Promise.race([other, new Promise((resolve) => setTimeout(resolve, 2000))])
      pipe.release()
      const [entryAnswer, otherAnswer] = await Promise.all([entry, other])

      expect(order, "the other runtimes' press did not wait for the Claude Code entry's").toEqual([
        "the Claude Code entry's press",
        "the other runtimes' press",
      ])
      expect(entryAnswer).toMatchObject({ ok: true, changed: false })
      expect(otherAnswer.statusCode, otherAnswer.body).toBe(200)
      expect(codexSaid(otherAnswer)).toMatchObject({ ok: true, changed: true, backupPath: null })
    } finally {
      await pipe.end()
    }
  })
})
