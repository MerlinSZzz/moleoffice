// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS A TERMINAL OPENS A COMMAND GIVEN BY ITS NAME. Wave 13t, round W43.
 *
 * A terminal opened on Windows with the command "ping" failed with "File not found: " and no name. node-pty looks for
 * a command that is not a full path in each folder of the holder's own Path, by the name exactly as written, and a
 * Windows program is a file with an ending, so "ping" is never found. npm installs claude and codex as .cmd scripts,
 * which only cmd.exe runs. Now the system layer finds the command first, in the terminal's own environment, and hands
 * node-pty what it can start. Measured with made-up Windows files, with no Windows machine:
 *   1. a bare name is found in each folder of the terminal's PATH, in order, with each ending PATHEXT names, and an
 *      .exe is handed on by its full path with its arguments unchanged;
 *   2. a .cmd, found by its name or given by its full path as a terminal agent gives it, runs through the terminal's
 *      %ComSpec% as one command line, with each word in double quotes;
 *   3. a full path to an .exe is handed on as it was, and nothing is looked for;
 *   4. a path that is not a full one is looked for in the terminal's folder, and not on the PATH;
 *   5. the environment's names are read in any case, as Windows reads them, and with no PATHEXT the endings are
 *      cmd.exe's own;
 *   6. a command nothing is found for is refused, and the refusal names the command and says to give its .exe or its
 *      full path; so is a file found with an ending that a terminal cannot start, which the refusal names;
 *   7. a word cmd.exe would change, in a .cmd's arguments, is refused, and nothing is started;
 *   8. the system layer gives Windows this, and gives Linux and the Mac the command and its arguments unchanged;
 *   9. the terminal holder starts what the layer answers, lists the terminal by the command it was asked for, and
 *      answers a refusal in its words with nothing started; on Linux it starts the command as it was asked, as before.
 *
 * WHAT ONLY A WINDOWS MACHINE CAN SHOW: that node-pty starts the full path and the cmd.exe line it is given, that
 * cmd.exe reads that line as one program and its words, and that ping and claude.cmd open in a pseudo console. Nothing
 * here runs node-pty's Windows side.
 *
 * MUTATIONS, in src/config/systems/a-named-command-on-windows.mjs unless another file is named, with the cases each
 * turned red when it was run:
 *   - a bare name is looked for with no ending: cases 1, 2, 5, 6, 7 and 9;
 *   - a .cmd is handed to node-pty as it is, not through cmd.exe: cases 2, 5, 7 and 9;
 *   - a full path to an .exe is looked for too: cases 3 and 8;
 *   - a path that is not a full one is looked for on the PATH: case 4;
 *   - the environment's names are read only as spelled: case 5;
 *   - the refusal does not name the command: cases 4, 6, 8 and 9;
 *   - a file found with any ending is started: case 6;
 *   - in src/config/systems/the-system.mjs, Windows is given the command unchanged: cases 8 and 9;
 *   - in src/holder/index.mjs, node-pty is handed the command as asked: case 9.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { howWindowsStartsACommand } from '../src/config/systems/a-named-command-on-windows.mjs'
import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import { aHolder } from '../src/holder/index.mjs'

afterEach(() => {
  vi.restoreAllMocks()
})

const SYSTEM32 = 'C:\\Windows\\System32'
const NPM = 'C:\\Users\\somebody\\AppData\\Roaming\\npm'
const TOOLS = 'C:\\Tools'
const WORK = 'C:\\Users\\somebody\\work'
const COMSPEC = 'C:\\Windows\\system32\\cmd.exe'

/**
 * THE FILES OF A MADE-UP WINDOWS MACHINE. npm puts three files for claude in its folder: claude.cmd, claude.ps1 and
 * claude, a script for a POSIX shell with no ending. Windows reads a file's name in any case.
 */
const FILES = [
  `${SYSTEM32}\\PING.EXE`,
  `${SYSTEM32}\\cmd.exe`,
  `${NPM}\\claude.cmd`,
  `${NPM}\\claude.ps1`,
  `${NPM}\\claude`,
  `${WORK}\\tools\\build.exe`,
  `${TOOLS}\\hello.vbs`,
]

/** Whether the made-up machine has a file, and every path it was asked about. */
function aMadeUpMachine() {
  const asked: string[] = []
  const there = new Set(FILES.map((file) => file.toLowerCase()))
  return {
    asked,
    isThere: (path: string) => {
      asked.push(path)
      return there.has(path.toLowerCase())
    },
  }
}

/** A terminal's environment on Windows, as the server gives it: PATH spelled as every reader here reads it. */
const ENV: Record<string, string> = {
  PATH: `${SYSTEM32};${NPM}`,
  PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC',
  ComSpec: COMSPEC,
}

const startOnTheMadeUpMachine = (command: string, args: string[], env: Record<string, string> = ENV, folder = WORK) =>
  howWindowsStartsACommand(command, args, folder, env, aMadeUpMachine().isThere)

/** What cmd.exe is given for claude.cmd and two words. */
const CLAUDE_THROUGH_CMD = { command: COMSPEC, args: `/d /s /v:off /c ""${NPM}\\claude.cmd" "--resume" "abc""` }

describe('a command named in a terminal on Windows', () => {
  it('1: a bare name is found on the PATH with an ending PATHEXT names, and an .exe is handed on by its full path', () => {
    expect(startOnTheMadeUpMachine('ping', ['-n', '1', 'localhost'])).toEqual({ command: `${SYSTEM32}\\ping.exe`, args: ['-n', '1', 'localhost'] })
    expect(startOnTheMadeUpMachine('ping.exe', [])).toEqual({ command: `${SYSTEM32}\\ping.exe`, args: [] })
  })

  it('2: a .cmd runs through the terminal’s ComSpec, found by its name or given by its full path', () => {
    expect(startOnTheMadeUpMachine('claude', ['--resume', 'abc'])).toEqual(CLAUDE_THROUGH_CMD)
    expect(startOnTheMadeUpMachine(`${NPM}\\claude.cmd`, ['--resume', 'abc'])).toEqual(CLAUDE_THROUGH_CMD)
    expect(startOnTheMadeUpMachine('claude', [])).toEqual({ command: COMSPEC, args: `/d /s /v:off /c ""${NPM}\\claude.cmd""` })
  })

  it('3: a full path to an .exe is handed on as it was, and nothing is looked for', () => {
    const machine = aMadeUpMachine()
    const asked = 'D:\\Somewhere Else\\a program.EXE'
    expect(howWindowsStartsACommand(asked, ['x y'], WORK, ENV, machine.isThere)).toEqual({ command: asked, args: ['x y'] })
    expect(howWindowsStartsACommand(COMSPEC, [], WORK, ENV, machine.isThere)).toEqual({ command: COMSPEC, args: [] })
    expect(machine.asked).toEqual([])
  })

  it('4: a path that is not a full one is looked for in the terminal’s folder, and not on the PATH', () => {
    expect(startOnTheMadeUpMachine('tools\\build', ['--all'])).toEqual({ command: `${WORK}\\tools\\build.exe`, args: ['--all'] })
    expect(() => startOnTheMadeUpMachine('tools\\build', [], { ...ENV, PATH: `${WORK}\\tools` }, SYSTEM32)).toThrow(/tools\\build/u)
  })

  it('5: the environment’s names are read in any case, and with no PATHEXT the endings are cmd.exe’s own', () => {
    const spelledAsWindowsSpellsThem = { Path: ENV['PATH']!, PathExt: ENV['PATHEXT']!, COMSPEC }
    expect(startOnTheMadeUpMachine('ping', [], spelledAsWindowsSpellsThem)).toEqual({ command: `${SYSTEM32}\\ping.exe`, args: [] })
    expect(startOnTheMadeUpMachine('claude', ['--resume', 'abc'], spelledAsWindowsSpellsThem)).toEqual(CLAUDE_THROUGH_CMD)
    expect(startOnTheMadeUpMachine('claude', ['--resume', 'abc'], { PATH: ENV['PATH']!, ComSpec: COMSPEC })).toEqual(CLAUDE_THROUGH_CMD)
  })

  it('6: a command nothing is found for is refused by its name, and so is a file a terminal cannot start', () => {
    for (const [command, folder] of [
      ['nothere', WORK],
      ['tools\\nothere', WORK],
      ['C:\\Program Files\\nothere', WORK],
    ] as const) {
      let said = ''
      try {
        startOnTheMadeUpMachine(command, [], ENV, folder)
      } catch (err) {
        said = (err as Error).message
      }
      expect(said, command).toContain(`"${command}"`)
      expect(said, command).toMatch(/\.exe\b/u)
      expect(said, command).toMatch(/full path/u)
    }
    let said = ''
    try {
      startOnTheMadeUpMachine('hello', [], { ...ENV, PATH: `${TOOLS};${SYSTEM32}` })
    } catch (err) {
      said = (err as Error).message
    }
    expect(said).toContain('"hello"')
    expect(said).toContain(`${TOOLS}\\hello.vbs`)
    expect(said).toMatch(/\.exe\b/u)
  })

  it('7: a word cmd.exe would change, in a .cmd’s arguments, is refused', () => {
    expect(() => startOnTheMadeUpMachine('claude', ['%PATH%'])).toThrow(/%PATH%/u)
    expect(() => startOnTheMadeUpMachine('claude', ['say "this"'])).toThrow(/say "this"/u)
  })

  it('8: the system layer gives Windows this, and Linux and the Mac the command and its arguments unchanged', () => {
    // NOTHING AT C:\ IS ON THIS LINUX MACHINE, so Windows's own way of looking finds nothing and refuses.
    const windows = theSystemFor('win32')
    expect(() => windows.whatATerminalStarts('ping', [], WORK, ENV)).toThrow(/"ping"/u)
    expect(windows.whatATerminalStarts(COMSPEC, ['/k'], WORK, ENV)).toEqual({ command: COMSPEC, args: ['/k'] })
    for (const platform of ['linux', 'darwin']) {
      const system = theSystemFor(platform)
      for (const command of ['ping', 'claude.cmd', 'tools/build']) {
        expect(system.whatATerminalStarts(command, ['-c', '1'], '/srv/somebody', { PATH: '/nowhere' }), `${platform} ${command}`).toEqual({ command, args: ['-c', '1'] })
      }
    }
  })
})

/** A holder in this process for one system, with node-pty's spawn stood in and every start it is handed recorded. */
async function aHolderThatRecordsItsStarts(system: ReturnType<typeof theSystemFor>, home: string) {
  const pty = (await import('node-pty')).default
  const started: { command: string; args: string[] | string }[] = []
  vi.spyOn(pty, 'spawn').mockImplementation((command: string, args: string[] | string) => {
    started.push({ command, args })
    return { pid: 876_540 + started.length, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: vi.fn(), onExit: vi.fn() } as never
  })
  const holder = aHolder({ database: join(home, 'office.db'), env: { HOME: home, XDG_CONFIG_HOME: join(home, 'c') }, system } as Parameters<typeof aHolder>[0])
  mkdirSync(dirname(holder.socketPath), { recursive: true, mode: 0o700 })
  expect(await holder.listen()).toBe('listening')
  const open = async (command: string, args: string[]) =>
    (await askTheHolder(holder.socketPath, { op: 'open', command, args, folder: home, project: 'made-up-project', cols: 80, rows: 24, env: ENV, keeping: false })) as {
      ok: boolean
      error?: string
      terminal?: { command: string; args: string[] }
    }
  const end = async () => {
    for (const terminal of holder.terminals.values()) terminal.exit ??= { code: 0, signal: null }
    await holder.stop()
    rmSync(home, { recursive: true, force: true })
  }
  return { open, started, end }
}

describe('the terminal holder starts what the system layer answers', () => {
  it('9: on Windows it starts the found program, lists the command as asked, and answers a refusal with nothing started; on Linux as before', async () => {
    const quiet = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const windows = theSystemFor('win32')
    const onTheMadeUpMachine = { ...windows, whatATerminalStarts: (command: string, args: readonly string[], folder: string, env: Readonly<Record<string, string>>) => howWindowsStartsACommand(command, args, folder, env, aMadeUpMachine().isThere) }
    const onWindows = await aHolderThatRecordsItsStarts(onTheMadeUpMachine, mkdtempSync(join(tmpdir(), 'a-named-command-windows-')))
    try {
      const opened = await onWindows.open('claude', ['--resume', 'abc'])
      expect(opened.ok, JSON.stringify(opened)).toBe(true)
      expect(onWindows.started).toEqual([CLAUDE_THROUGH_CMD])
      expect(opened.terminal).toMatchObject({ command: 'claude', args: ['--resume', 'abc'] })
      const refused = await onWindows.open('nothere', [])
      expect(refused.ok).toBe(false)
      expect(refused.error).toContain('"nothere"')
      expect(onWindows.started).toHaveLength(1)
    } finally {
      await onWindows.end()
    }
    // THE WINDOWS LAYER ITSELF, as the holder is given it on Windows: nothing at C:\ is on this machine.
    const onRealWindowsLayer = await aHolderThatRecordsItsStarts(windows, mkdtempSync(join(tmpdir(), 'a-named-command-layer-')))
    try {
      const refused = await onRealWindowsLayer.open('ping', [])
      expect(refused.ok).toBe(false)
      expect(refused.error).toContain('"ping"')
      expect(onRealWindowsLayer.started).toEqual([])
    } finally {
      await onRealWindowsLayer.end()
    }
    const onLinux = await aHolderThatRecordsItsStarts(theSystemFor('linux'), mkdtempSync(join(tmpdir(), 'a-named-command-linux-')))
    try {
      const opened = await onLinux.open('ping', ['-c', '1'])
      expect(opened.ok, JSON.stringify(opened)).toBe(true)
      expect(onLinux.started).toEqual([{ command: 'ping', args: ['-c', '1'] }])
    } finally {
      await onLinux.end()
      quiet.mockRestore()
    }
  }, 30_000)
})
