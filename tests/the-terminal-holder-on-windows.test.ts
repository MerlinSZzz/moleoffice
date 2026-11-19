// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL HOLDER ON WINDOWS, AS FAR AS LINUX CAN SHOW IT. Wave 13t, round W14, item 8.
 *
 * Round W13's label installed the office on Windows 11. It started, answered and uninstalled cleanly, but it could not
 * open a terminal: the holder ended with exit code 1 at its start. On Windows the holder listens on a named pipe,
 * `\\.\pipe\mole-office-terminals-<name>`, and a pipe is not a file. Its "folder" cannot be made or given a mode, and
 * the pipe cannot be given one either. A terminal there runs in a pseudo console (ConPTY), which has no process group,
 * and node-pty refuses a signal there. The shell is named by %ComSpec%, not $SHELL. And the process a start makes is
 * the system layer's starter, so the holder's pid is never the start's child's.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. With the Windows system, the holder makes no folder for its address, sets no mode on the folder or on what it
 *      listens on, and does not look every two seconds for a file there. With Linux's it does all four, as before.
 *      Here the holder still listens on a socket file, because Linux cannot listen on a pipe, so a pass here proves
 *      nothing about how the holder listens on Windows.
 *   2. With the Windows system, closing a running terminal and stopping the holder tell node-pty to end the terminal,
 *      with no signal named, and signal no process group. With Linux's, each sends SIGHUP to the terminal's group. The
 *      log says which: "its pseudo console was told to end" or, as before, "its process group was sent SIGHUP"; and a
 *      stop's last line says "seconds after their pseudo consoles were told to end" or, as before, "seconds after
 *      SIGHUP".
 *   3. A terminal opens %ComSpec% on Windows and $SHELL elsewhere. On Windows it is given the names a shell needs there,
 *      whatever their case, spelled as the system layer's list spells them: PATH as every reader here reads it, HOME,
 *      USERNAME and USERPROFILE, and not COMPUTERNAME or USERDOMAIN. The variable the layer names its shell by is in
 *      that list. On Linux a name is matched exactly, as before. No key from the server's own environment goes
 *      through, on either system. With no shell to open, the open door says so by that variable: on Linux "has no
 *      SHELL", as before.
 *   4. A bundle made for win32-x64 carries node-pty's Windows files: its JavaScript for a pseudo console, conpty.node,
 *      conpty_console_list.node, conpty.dll and OpenConsole.exe. It carries no debugging symbols and no Linux pty.node.
 *   5. The start's check that the holder which answered is the one it made. When the pids are the same, it is (Linux and
 *      the Mac). When they differ, it is only when the Job Object of the start's group holds the holder, which is asked
 *      without holding the thread. A holding that cannot be read is answered as unknown, with Windows's reason. A pid
 *      that is not a whole number above 0 is never the one, and nothing is asked about it.
 *   6. The start itself, with a stand-in starter that starts a stand-in holder: the holder answers with its own pid. It
 *      is 'started' when the stand-in Job Object holds it, with the holder's pid and the starter's group. It is not
 *      started when the Job Object does not hold it, or when its hello names no pid. When the Job Object cannot be
 *      read, the start is 'unknown', with the holder's pid, the starter's group, the reason and the holder's log.
 *   7. The service command's start and the person's start press each say an unknown start in words, with the reason,
 *      and the press refuses it. Neither throws, and neither says that a holder started or did not.
 *   8. A terminal whose pty learns its pid only after the open, as node-pty does on Windows once the pseudo console
 *      connects, is listed by the pid the pty knows when the list is asked. A stop names that pid for a terminal that
 *      has not ended. The open's line in the log does not give 0 as its process: it says the process is not known yet.
 *      What the open's own answer says is not checked here: on Windows it is still 0.
 *   9. A stop names a terminal that had not ended, and whose pty never learned its pid, by no pid, and its last line
 *      says that terminal's process is "not known yet", not 0. A terminal beside it whose pty did learn its pid is
 *      still named by that pid.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT ONLY A WINDOWS MACHINE CAN SHOW
 * ---------------------------------------------------------------------------------------
 *
 * That the holder listens on the pipe at all, that node-pty loads and opens cmd.exe in a pseudo console, that its kill
 * ends cmd.exe and the console host, and that Windows answers the Job Object's holding: round W14's label for a
 * Windows 11 machine. Nothing here runs node-pty's Windows side, the starter or PowerShell. A holder given the
 * Windows system here still listens on a socket file, so no case here proves anything about the pipe. The restart
 * press's words for an unknown start are not run here: a restart needs a holder recorded in the ledger to stop.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit message that added the code)
 * ---------------------------------------------------------------------------------------
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildTheTerminalInto } from '../scripts/the-terminal-in-a-bundle.mjs'
import { THE_HOLDER_BUNDLE } from '../src/config/settings.mjs'
import { settings } from '../src/config/settings.mjs'
import { theSystemFor, thisSystem, type JobObjects } from '../src/config/systems/the-system.mjs'
import { startTheHolder } from '../src/config/the-service-command.mjs'
import * as theHolderStart from '../src/config/the-terminal-holder.mjs'
import { askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import * as theHolderProgram from '../src/holder/index.mjs'
import { aHolder } from '../src/holder/index.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader } from './helpers.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Holds; Linux's address is a file. */
const LINUX = theSystemFor('linux')
const WINDOWS = theSystemFor('win32')

/**
 * A holder in this process, with the pty library stood in, for one system. With `pidLearnedLater` a pty's pid reads 0
 * until its `connect()` is called, as node-pty's does on Windows until the pseudo console connects.
 */
async function aHolderWithAStandInPty(system: typeof LINUX, home: string, options: { pidLearnedLater?: boolean } = {}) {
  const pty = (await import('node-pty')).default
  let nextPid = 876_540
  const ptys: { pid: number; connected: boolean; connect: () => void; kill: ReturnType<typeof vi.fn>; ends: ((e: { exitCode: number; signal?: number }) => void)[] }[] = []
  vi.spyOn(pty, 'spawn').mockImplementation(() => {
    const one = {
      pid: nextPid++,
      connected: options.pidLearnedLater !== true,
      connect: () => {
        one.connected = true
      },
      kill: vi.fn(),
      ends: [] as ((e: { exitCode: number; signal?: number }) => void)[],
    }
    ptys.push(one)
    return {
      get pid() {
        return one.connected ? one.pid : 0
      },
      write: vi.fn(),
      resize: vi.fn(),
      kill: one.kill,
      onData: vi.fn(),
      onExit: vi.fn((ended: (e: { exitCode: number; signal?: number }) => void) => one.ends.push(ended)),
    } as never
  })
  const holder = aHolder({ database: join(home, 'office.db'), env: { HOME: home, XDG_CONFIG_HOME: join(home, 'c') }, system } as Parameters<typeof aHolder>[0])
  return { holder, ptys }
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A START AS THE SYSTEM LAYER'S STARTER MAKES ONE ON WINDOWS, stood in: a stand-in starter writes its pid and starts a
 * stand-in holder in its own group, and the Job Objects answer by `readHolds`. `run` is whatever starts the holder.
 * Every starter's group is recorded, and `end` stops each and puts the Job Objects back. `system` is the system layer
 * of the modules `run` reaches: freshDb() loads the server's modules again, so the server's start reaches another.
 */
function aStandInStart(scratch: string, database: string, system: ReturnType<typeof thisSystem> = thisSystem()) {
  const socket = theTerminalHolderSocket(database)
  const groups = system.groups as { jobObjects: JobObjects | null }
  const before = groups.jobObjects
  /** Every group a stand-in starter recorded, each stopped by that number at the end. */
  const recorded: number[] = []
  // THE STAND-IN STARTER writes its pid, and starts the stand-in holder in its own group, as the layer's starter does.
  const STARTER =
    "const [holder, ...rest] = process.argv.slice(1); require('node:fs').writeFileSync(rest[2], String(process.pid)); " +
    "require('node:child_process').spawn(process.execPath, ['-e', holder, ...rest], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 1))"
  // THE STAND-IN HOLDER answers every request with its own pid, unless told to name none, and ends by itself.
  const HOLDER =
    "const [socket, database, , mode] = process.argv.slice(1); const net = require('node:net'); " +
    "const server = net.createServer((c) => { let got = ''; c.setEncoding('utf8'); c.on('data', (d) => { got += d; const at = got.indexOf('\\n'); if (at < 0) return; " +
    "const asked = JSON.parse(got.slice(0, at)); got = ''; c.write(JSON.stringify({ id: asked.id, ok: true, database, ...(mode === 'no-pid' ? {} : { pid: process.pid }) }) + '\\n') }) }); " +
    "server.listen(socket); setTimeout(() => { server.close(); process.exit(0) }, 8000)"
  const stopTheGroup = (group: number): void => {
    try {
      process.kill(-group, 'SIGTERM')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
    }
  }
  const start = async <T>(mode: string, readHolds: JobObjects['readHolds'], run: () => Promise<T>): Promise<T> => {
    const pidFile = join(scratch, `${mode}.pid`)
    groups.jobObjects = {
      theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
      readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
      holds: () => {
        throw new Error('a start asks without holding the thread')
      },
      readHolds,
      programsOfAStarter: () => {
        throw new Error('no case here asks what a starter started')
      },
      readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
    }
    vi.spyOn(system.groups, 'howToStartInItsOwnGroup').mockReturnValue({
      command: process.execPath,
      args: ['-e', STARTER, HOLDER, socket, database, pidFile, mode],
      windowsVerbatimArguments: false,
      env: undefined,
      detached: true,
    })
    try {
      return await run()
    } finally {
      const usedTheStandIn = existsSync(pidFile)
      if (usedTheStandIn) recorded.push(Number(readFileSync(pidFile, 'utf8')))
      // The recorded group is stopped, holder and starter, before the next start listens on the same socket.
      const group = recorded.at(-1)
      if (group !== undefined) stopTheGroup(group)
      for (let waited = 0; existsSync(socket) && waited < 3_000; waited += 50) await new Promise((done) => setTimeout(done, 50))
      if (existsSync(socket)) unlinkSync(socket)
      vi.mocked(system.groups.howToStartInItsOwnGroup).mockRestore()
      if (!usedTheStandIn) throw new Error(`The start "${mode}" did not start the stand-in starter, so what it started is not known here and was not stopped.`)
    }
  }
  const end = (): void => {
    groups.jobObjects = before
    for (const group of recorded) stopTheGroup(group)
  }
  return { start, recorded, end }
}

describe('the terminal holder on Windows', () => {
  it('1: with the Windows system makes no folder, sets no mode and looks for no file; with Linux it does all four', async () => {
    for (const [system, isAFile] of [
      [LINUX, true],
      [WINDOWS, false],
    ] as const) {
      const home = mkdtempSync(join(tmpdir(), 'holder-on-windows-1-'))
      const interval = vi.spyOn(globalThis, 'setInterval')
      const holder = aHolder({ database: join(home, 'office.db'), env: { HOME: home, XDG_CONFIG_HOME: join(home, 'c') }, system } as Parameters<typeof aHolder>[0])
      try {
        expect(system.holderAddressIsAFile, system.platform).toBe(isAFile)
        const folder = dirname(holder.socketPath)
        // The folder is made here, open to others, so that a holder which makes it or sets its mode is seen to.
        mkdirSync(folder, { recursive: true })
        const { chmodSync } = await import('node:fs')
        chmodSync(folder, 0o755)
        expect(await holder.listen(), system.platform).toBe('listening')
        const modeOf = (path: string) => statSync(path).mode & 0o777
        const looked = interval.mock.calls.filter(([, ms]) => ms === 2_000).length
        if (isAFile) {
          expect(modeOf(folder), 'linux: the folder').toBe(0o700)
          expect(modeOf(holder.socketPath), 'linux: the socket').toBe(0o600)
          expect(looked, 'linux: the look every two seconds').toBe(1)
        } else {
          expect(modeOf(folder), 'win32: the folder is as it was').toBe(0o755)
          expect(modeOf(holder.socketPath), 'win32: what it listens on was given no mode').not.toBe(0o600)
          expect(looked, 'win32: no look every two seconds').toBe(0)
        }
        // A FOLDER THAT IS NOT THERE is not made with the Windows system: its listen fails, it does not make it.
        if (!isAFile) {
          await holder.stop()
          rmSync(folder, { recursive: true, force: true })
          const again = aHolder({ database: join(home, 'office.db'), env: { HOME: home, XDG_CONFIG_HOME: join(home, 'c') }, system } as Parameters<typeof aHolder>[0])
          await expect(again.listen()).rejects.toThrow()
          expect(existsSync(folder), 'win32: no folder was made').toBe(false)
          await again.stop()
        }
      } finally {
        interval.mockRestore()
        await holder.stop().catch(() => undefined)
        rmSync(home, { recursive: true, force: true })
      }
    }
  }, 30_000)

  it('2: with the Windows system ends a terminal through node-pty with no signal, and signals no group', async () => {
    for (const system of [LINUX, WINDOWS]) {
      const onWindows = system === WINDOWS
      expect(system.aTerminalIsEndedBy, system.platform).toBe(onWindows ? 'its-pty' : 'its-group')
      const home = mkdtempSync(join(tmpdir(), 'holder-on-windows-2-'))
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
      const { holder, ptys } = await aHolderWithAStandInPty(system, home)
      let said = ''
      const wrote = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        said += String(chunk)
        return true
      })
      let stopped = false
      try {
        // Windows's pipes need no folder, and the Windows system makes none; the socket file that stands in here does.
        mkdirSync(dirname(holder.socketPath), { recursive: true, mode: 0o700 })
        expect(await holder.listen()).toBe('listening')
        const open = async (): Promise<string> => {
          const opened = (await askTheHolder(holder.socketPath, {
            op: 'open',
            command: onWindows ? 'C:\\Windows\\System32\\cmd.exe' : '/made-up/shell',
            args: [],
            folder: home,
            project: 'made-up-project',
            cols: 80,
            rows: 24,
            env: {},
            keeping: false,
          })) as { ok: boolean; terminal: { id: string } }
          expect(opened.ok, JSON.stringify(opened)).toBe(true)
          return opened.terminal.id
        }
        const closed = (await askTheHolder(holder.socketPath, { op: 'close', terminal: await open() })) as { ok: boolean; wasRunning?: boolean }
        expect(closed.ok, JSON.stringify(closed)).toBe(true)
        expect(closed.wasRunning).toBe(true)
        if (onWindows) {
          expect(ptys[0]!.kill.mock.calls, 'win32: the close ends it through node-pty, naming no signal').toEqual([[]])
          expect(kill.mock.calls, 'win32: the close signals nothing').toEqual([])
        } else {
          expect(ptys[0]!.kill.mock.calls, 'linux: the close leaves node-pty alone').toEqual([])
          expect(kill.mock.calls, 'linux: the close sends SIGHUP to the group').toEqual([[-ptys[0]!.pid, 'SIGHUP']])
        }
        expect(said, 'the log says how the close ended it').toContain(
          `closed, and ${onWindows ? 'its pseudo console was told to end' : 'its process group was sent SIGHUP'}\n`,
        )

        await open()
        kill.mockClear()
        const stopping = holder.stop()
        stopped = true
        if (onWindows) {
          expect(ptys[1]!.kill.mock.calls, 'win32: the stop ends it through node-pty, naming no signal').toEqual([[]])
          expect(kill.mock.calls, 'win32: the stop signals nothing').toEqual([])
        } else {
          expect(ptys[1]!.kill.mock.calls, 'linux: the stop leaves node-pty alone').toEqual([])
          expect(kill.mock.calls, 'linux: the stop sends SIGHUP to the group').toEqual([[-ptys[1]!.pid, 'SIGHUP']])
        }
        ptys[1]!.ends[0]!({ exitCode: 0 })
        expect((await stopping).stillRunning).toEqual([])
        // A STOP'S LAST LINE says after what the terminals that had not ended were waited for.
        expect(theHolderProgram.theStopsLastLine([4242, 4243], system)).toBe(
          `stopped; these terminal processes had not ended 3 seconds after ${onWindows ? 'their pseudo consoles were told to end' : 'SIGHUP'}: 4242, 4243`,
        )
        expect(theHolderProgram.theStopsLastLine([], system)).toBe('stopped; every terminal had ended')
      } finally {
        wrote.mockRestore()
        if (!stopped) {
          for (const terminal of holder.terminals.values()) terminal.exit ??= { code: 0, signal: null }
          await holder.stop()
        }
        kill.mockRestore()
        rmSync(home, { recursive: true, force: true })
      }
    }
  }, 30_000)

  it('3: a terminal opens %ComSpec% on Windows and $SHELL elsewhere, with the names a shell needs there and no key', async () => {
    const db = await freshDb()
    try {
      const { theEnvironmentATerminalGets, theShellOf } = await import('../src/server/lib/terminals.ts')
      expect(theSystemFor('linux').theShellVariable).toBe('SHELL')
      expect(theSystemFor('darwin').theShellVariable).toBe('SHELL')
      expect(WINDOWS.theShellVariable).toBe('ComSpec')

      // THE LIST IS THE LAYER'S, and it holds the variable the layer names its shell by, spelled as theShellOf reads it.
      expect(WINDOWS.aTerminalIsGiven.names).toContain(WINDOWS.theShellVariable)
      expect(LINUX.aTerminalIsGiven.names).toContain(LINUX.theShellVariable)
      expect(WINDOWS.aTerminalIsGiven.names).toContain('PATH')
      expect(WINDOWS.aTerminalIsGiven.names).not.toContain('Path')

      const keys = { MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_KEY: 'a-key', ANTHROPIC_API_KEY: 'a-login' }
      // Windows spells these as it likes: COMSPEC is how some machines have it, and Path is how Node lists it there.
      const onWindows = theEnvironmentATerminalGets(
        {
          ...keys,
          COMSPEC: 'C:\\Windows\\system32\\cmd.exe',
          Path: 'C:\\Windows\\system32',
          SystemRoot: 'C:\\Windows',
          windir: 'C:\\Windows',
          PATHEXT: '.COM;.EXE;.BAT;.CMD',
          TEMP: 'C:\\t',
          USERPROFILE: 'C:\\Users\\someone',
          USERNAME: 'someone',
          HOME: 'C:\\Users\\someone',
          COMPUTERNAME: 'A-MACHINE',
          USERDOMAIN: 'A-DOMAIN',
          SHELL: '/bin/bash',
        },
        WINDOWS,
      )
      expect(onWindows).toEqual({
        ComSpec: 'C:\\Windows\\system32\\cmd.exe',
        PATH: 'C:\\Windows\\system32',
        USERNAME: 'someone',
        HOME: 'C:\\Users\\someone',
        SystemRoot: 'C:\\Windows',
        windir: 'C:\\Windows',
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        TEMP: 'C:\\t',
        USERPROFILE: 'C:\\Users\\someone',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      })
      expect(theShellOf(onWindows, WINDOWS)).toEqual({ variable: 'ComSpec', command: 'C:\\Windows\\system32\\cmd.exe' })
      expect(theShellOf(theEnvironmentATerminalGets(keys, WINDOWS), WINDOWS)).toEqual({ variable: 'ComSpec', command: undefined })

      // ON LINUX A NAME IS MATCHED EXACTLY: Path and shell are not PATH and SHELL there.
      const onLinux = theEnvironmentATerminalGets({ ...keys, SHELL: '/bin/bash', PATH: '/usr/bin', Path: '/x', shell: '/x', ComSpec: 'C:\\x.exe', LC_ALL: 'C' }, LINUX)
      expect(onLinux).toEqual({ SHELL: '/bin/bash', PATH: '/usr/bin', LC_ALL: 'C', TERM: 'xterm-256color', COLORTERM: 'truecolor' })
      expect(theShellOf(onLinux, LINUX)).toEqual({ variable: 'SHELL', command: '/bin/bash' })

      // WITH NO SHELL TO OPEN, the open door names the variable it looked for, here Linux's, as before.
      vi.stubEnv('SHELL', undefined)
      const app = await apiApp()
      try {
        const opened = await app.app.inject({ method: 'POST', url: '/api/terminals', headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, payload: { folder: tmpdir() } })
        expect(opened.statusCode, opened.body).toBe(400)
        expect((opened.json() as { error?: unknown }).error).toBe('No command was named, and this server has no SHELL to open instead. Name a command. Nothing was opened.')
      } finally {
        await app.app.close()
      }
    } finally {
      db.close()
    }
  }, 30_000)

  it('4: a bundle made for win32-x64 carries node-pty and its four Windows files, and no symbols or Linux file', async () => {
    const office = mkdtempSync(join(tmpdir(), 'holder-on-windows-4-'))
    try {
      await buildTheTerminalInto(office, 'win32', 'x64')
      const pty = join(office, 'node_modules', 'node-pty')
      const every = (folder: string): string[] =>
        readdirSync(folder, { withFileTypes: true }).flatMap((one) => (one.isDirectory() ? every(join(folder, one.name)) : [relative(pty, join(folder, one.name))]))
      const files = every(pty)
      expect(existsSync(join(office, THE_HOLDER_BUNDLE)), 'the holder').toBe(true)
      expect(readFileSync(join(office, THE_HOLDER_BUNDLE), 'utf8'), 'node-pty is loaded from beside it').toMatch(/from ["']node-pty["']/u)
      for (const file of [
        'package.json',
        'LICENSE',
        'lib/index.js',
        'lib/windowsTerminal.js',
        'lib/windowsPtyAgent.js',
        'lib/windowsConoutConnection.js',
        'lib/worker/conoutSocketWorker.js',
        'lib/shared/conout.js',
        'lib/conpty_console_list_agent.js',
        'lib/utils.js',
        'prebuilds/win32-x64/conpty.node',
        'prebuilds/win32-x64/conpty_console_list.node',
        'prebuilds/win32-x64/conpty/conpty.dll',
        'prebuilds/win32-x64/conpty/OpenConsole.exe',
      ]) {
        expect(files, file).toContain(join(...file.split('/')))
      }
      const prebuilt = files.filter((file) => file.startsWith(`prebuilds${'/'}`))
      expect(prebuilt.filter((file) => !file.startsWith(join('prebuilds', 'win32-x64'))), 'no other system').toEqual([])
      expect(prebuilt.filter((file) => file.endsWith('.pdb')), 'no debugging symbols').toEqual([])
      expect(prebuilt.sort()).toEqual(
        ['conpty.node', 'conpty_console_list.node', join('conpty', 'conpty.dll'), join('conpty', 'OpenConsole.exe')].map((file) => join('prebuilds', 'win32-x64', file)).sort(),
      )
    } finally {
      rmSync(office, { recursive: true, force: true })
    }
  }, 60_000)

  it('5: the start takes a holder whose pid differs only when the Job Object of its group holds it, and says an unread one', async () => {
    const asked: [number, number][] = []
    const aJobObject = (answer: Awaited<ReturnType<JobObjects['readHolds']>>): JobObjects => ({
      theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
      readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
      holds: () => {
        throw new Error('a start asks without holding the thread')
      },
      readHolds: (group, pid) => {
        asked.push([group, pid])
        return Promise.resolve(answer)
      },
      programsOfAStarter: () => {
        throw new Error('no case here asks what a starter started')
      },
      readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
    })
    const made = theHolderStart.theHolderThisStartMade
    expect(typeof made, 'theHolderThisStartMade is exported').toBe('function')

    // THE SAME PID: Linux and the Mac, with no Job Object to ask, and Windows, which is not asked either.
    expect(await made(500, 500, null)).toBe(true)
    expect(await made(500, 500, aJobObject({ holds: false, why: 'never asked' }))).toBe(true)
    expect(asked).toEqual([])
    // A DIFFERENT PID with no Job Objects is not the one (Linux and the Mac, as before).
    expect(await made(500, 501, null)).toBe(false)
    // ON WINDOWS the Job Object of the start's group is asked about the holder that answered.
    expect(await made(500, 501, aJobObject({ holds: true }))).toBe(true)
    expect(asked).toEqual([[500, 501]])
    expect(await made(500, 502, aJobObject({ holds: false, why: 'Job Object Local\\mole-office-group-500 does not hold process 502.' }))).toBe(false)
    // A HOLDING THAT CANNOT BE READ is answered as unknown, with Windows's reason, and is neither a yes nor a no.
    expect(await made(500, 503, aJobObject({ unknown: 'PowerShell said nothing (a stand-in answer).' }))).toEqual({ unknown: 'PowerShell said nothing (a stand-in answer).' })
    expect(asked.at(-1)).toEqual([500, 503])
    // A PID THAT IS NOT A WHOLE NUMBER ABOVE 0 is never the one, and nothing is asked about it.
    asked.length = 0
    for (const pid of [undefined, null, '500', 1.5, 0, -3, Number.NaN]) {
      expect(await made(500, pid, aJobObject({ holds: true })), String(pid)).toBe(false)
    }
    expect(await made(-3, -3, null), 'a group and pid of -3').toBe(false)
    expect(asked).toEqual([])
  })

  it('6: the start of a holder inside a stand-in Job Object is started, with the holder pid and the starter group', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'holder-on-windows-6-'))
    vi.stubEnv('XDG_CONFIG_HOME', join(scratch, 'c'))
    vi.stubEnv('HOME', scratch)
    const database = join(scratch, 'office.db')
    const stand = aStandInStart(scratch, database)
    const theStart = () => theHolderStart.startATerminalHolder({ databasePath: database, how: { command: process.execPath, args: [] }, cwd: scratch, waitMs: 2_500 })
    try {
      const asked: [number, number][] = []
      const held = await stand.start(
        'held',
        (group, pid) => {
          asked.push([group, pid])
          return Promise.resolve({ holds: true })
        },
        theStart,
      )
      const starter = stand.recorded[0]!
      expect(held.outcome, JSON.stringify(held)).toBe('started')
      const started = held as { outcome: 'started'; pid: number; group: number }
      expect(started.group, 'the group is the starter').toBe(starter)
      expect(started.pid, "the pid is the holder's own").not.toBe(starter)
      expect(asked.at(-1)).toEqual([starter, started.pid])

      const notHeld = await stand.start('not-held', () => Promise.resolve({ holds: false, why: 'a stand-in Job Object that holds nothing' }), theStart)
      expect(notHeld.outcome, JSON.stringify(notHeld)).toBe('silent')

      const noPid = await stand.start('no-pid', () => Promise.resolve({ holds: true }), theStart)
      expect(noPid.outcome, JSON.stringify(noPid)).toBe('silent')

      // A JOB OBJECT THAT CANNOT BE READ: the start is unknown, said with the reason, and the holder is left running.
      const unread = await stand.start('unread', () => Promise.resolve({ unknown: 'A stand-in Job Object that cannot be read.' }), theStart)
      const unreadStarter = stand.recorded.at(-1)!
      expect(unread, JSON.stringify(unread)).toEqual({
        outcome: 'unknown',
        pid: expect.any(Number) as number,
        group: unreadStarter,
        why: 'A stand-in Job Object that cannot be read.',
        logPath: theTerminalHolderLog(database),
      })
      expect((unread as { pid: number }).pid, "the pid is the holder's own").not.toBe(unreadStarter)
    } finally {
      stand.end()
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 60_000)

  it('7: the service command and the start press each say an unknown start, and the press refuses it', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'holder-on-windows-7-'))
    vi.stubEnv('XDG_CONFIG_HOME', join(scratch, 'c'))
    vi.stubEnv('HOME', scratch)
    vi.stubEnv('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
    const db = await freshDb()
    const app = await apiApp()
    const database = settings().databasePath
    const stand = aStandInStart(scratch, database)
    const theServersSystem = (await import('../src/config/systems/the-system.mjs')).thisSystem()
    expect(theServersSystem, "the server's modules were loaded again").not.toBe(thisSystem())
    const theServersStand = aStandInStart(scratch, database, theServersSystem)
    const unread = () => Promise.resolve({ unknown: 'A stand-in Job Object that cannot be read.' })
    try {
      // THE SERVICE COMMAND'S START says it, and does not throw.
      let said = ''
      const wrote = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        said += String(chunk)
        return true
      })
      try {
        await stand.start('service', unread, () =>
          startTheHolder({ databasePath: database, port: 0, lockPath: join(scratch, 'service.lock'), logPath: join(scratch, 'service.log') } as Parameters<typeof startTheHolder>[0]),
        )
      } finally {
        wrote.mockRestore()
      }
      const starter = stand.recorded.at(-1)!
      expect(said).toMatch(
        new RegExp(
          `A terminal holder, process \\d+, answers for this database, and Windows could not say whether the Job Object of group ${String(starter)}, ` +
            'which this start made, holds it: A stand-in Job Object that cannot be read\\. It was left running; its log is ',
          'u',
        ),
      )
      expect(said, 'the service command does not say a holder started').not.toContain('The terminal holder is process')
      expect(said, 'the service command does not say the holder was silent').not.toContain('did not answer within')

      // THE PERSON'S START PRESS refuses it, in words.
      const pressed = await theServersStand.start('press', unread, () =>
        app.app.inject({ method: 'POST', url: '/api/terminals/holder/start', headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, payload: {} }),
      )
      const pressStarter = theServersStand.recorded.at(-1)!
      expect(pressed.statusCode, pressed.body).toBe(502)
      expect(String((pressed.json() as { error?: unknown }).error)).toMatch(
        new RegExp(
          `^A terminal holder, process \\d+, answers for this office, and Windows could not say whether the Job Object of group ${String(pressStarter)}, ` +
            'which this press started, holds it: A stand-in Job Object that cannot be read\\. It was left running\\.$',
          'u',
        ),
      )
    } finally {
      stand.end()
      theServersStand.end()
      await app.app.close()
      db.close()
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 60_000)

  it('8: a terminal whose pty learns its pid after the open, as on Windows, is listed and stopped by that pid', async () => {
    const home = mkdtempSync(join(tmpdir(), 'holder-on-windows-8-'))
    const { holder, ptys } = await aHolderWithAStandInPty(WINDOWS, home, { pidLearnedLater: true })
    let said = ''
    const wrote = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      said += String(chunk)
      return true
    })
    let stopped = false
    try {
      mkdirSync(dirname(holder.socketPath), { recursive: true, mode: 0o700 })
      expect(await holder.listen()).toBe('listening')
      const opened = (await askTheHolder(holder.socketPath, {
        op: 'open',
        command: 'C:\\Windows\\System32\\cmd.exe',
        args: [],
        folder: home,
        project: 'made-up-project',
        cols: 80,
        rows: 24,
        env: {},
        keeping: false,
      })) as { ok: boolean; terminal: { id: string } }
      expect(opened.ok, JSON.stringify(opened)).toBe(true)
      expect(said, 'the log does not give 0 as the process').toContain(`terminal ${opened.terminal.id} opened: process not known yet, command `)
      // THE PSEUDO CONSOLE CONNECTS, and only now does the pty know its process.
      ptys[0]!.connect()
      const listed = (await askTheHolder(holder.socketPath, { op: 'list' })) as { ok: boolean; terminals: { id: string; pid: number }[] }
      expect(listed.ok, JSON.stringify(listed)).toBe(true)
      expect(listed.terminals.find((one) => one.id === opened.terminal.id)?.pid, 'the list gives the pid the pty knows now').toBe(ptys[0]!.pid)
      const stopping = holder.stop()
      stopped = true
      expect((await stopping).stillRunning, 'a terminal that had not ended is named by the pid the pty knows').toEqual([ptys[0]!.pid])
    } finally {
      wrote.mockRestore()
      if (!stopped) {
        for (const terminal of holder.terminals.values()) terminal.exit ??= { code: 0, signal: null }
        await holder.stop()
      }
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)

  it('9: a stop names a terminal whose pty never learned its pid as not known yet, and not as process 0', async () => {
    const home = mkdtempSync(join(tmpdir(), 'holder-on-windows-9-'))
    const { holder, ptys } = await aHolderWithAStandInPty(WINDOWS, home, { pidLearnedLater: true })
    const wrote = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    let stopped = false
    try {
      mkdirSync(dirname(holder.socketPath), { recursive: true, mode: 0o700 })
      expect(await holder.listen()).toBe('listening')
      for (const _ of [1, 2]) {
        const opened = (await askTheHolder(holder.socketPath, {
          op: 'open',
          command: 'C:\\Windows\\System32\\cmd.exe',
          args: [],
          folder: home,
          project: 'made-up-project',
          cols: 80,
          rows: 24,
          env: {},
          keeping: false,
        })) as { ok: boolean }
        expect(opened.ok, JSON.stringify(opened)).toBe(true)
      }
      // THE FIRST PSEUDO CONSOLE CONNECTS, AND THE SECOND NEVER DOES, so its pty still reads 0.
      ptys[0]!.connect()
      const stopping = holder.stop()
      stopped = true
      const { stillRunning } = await stopping
      expect(stillRunning, 'the terminal whose pty never learned its pid is named by no pid').toEqual([ptys[0]!.pid, null])
      const line = theHolderProgram.theStopsLastLine(stillRunning, WINDOWS)
      expect(line.endsWith(`were told to end: ${String(ptys[0]!.pid)}, not known yet`), line).toBe(true)
    } finally {
      wrote.mockRestore()
      if (!stopped) {
        for (const terminal of holder.terminals.values()) terminal.exit ??= { code: 0, signal: null }
        await holder.stop()
      }
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)
})
