// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START IN A GROUP, ON EACH SYSTEM, READ ON LINUX. Wave 13t, round W5, item 6.
 *
 * Every start that makes a group asks the layer, src/config/systems/the-system.mjs, how to start the program:
 * `groups.howToStartInItsOwnGroup(way)`. On Linux and the Mac that is Node's own `detached: true`, and the way comes
 * back as it came. On Windows it is a starter, src/config/systems/windows-starts.mjs: `powershell.exe` with one fixed
 * script that makes a Job Object named after its own process number and starts the program in it. A stop then finds
 * the Job Object by that number (src/config/systems/windows-groups.mjs). This file checks:
 *
 *   1. on Linux and the Mac the way comes back unchanged, with `detached: true` and no `windowsHide`, and the gentle
 *      stop is SIGTERM;
 *   2. on Windows the start is the system's own PowerShell by its whole path, hidden and not detached, with the
 *      starter's script, encoded, with no UTF-8 line, and the program and its command line in two environment
 *      variables beside the environment the caller gave; there is no gentle stop;
 *   3. the command line is the one Node builds for the same words, by libuv's rules, or the words joined as they are
 *      when the caller asks Node not to quote them;
 *   4. a program not named by its whole path is refused in words;
 *   5. the script makes its Job Object under the name a stop opens, and refuses one that already exists. It removes
 *      both variables before the program starts. It starts the program suspended, outside the Job Object it runs in
 *      itself, with Node's flags and inherited handles, puts it in its own Job Object, and only then lets it run. A
 *      program it cannot put there is ended before it runs. It exits with the program's code, or with 125 after a
 *      sentence. Progress is silenced before PowerShell runs any command;
 *   6. every starter's encoded script begins with the mark a stop reads on its command line;
 *   7. the terminal holder is started as the layer says, with its database named after its own words, and what is read
 *      back is what the layer's program did. A Node that ends at once stands in for the holder, so none starts here.
 *      The message worker's start is checked in tests/the-message-workers-probe-on-windows.test.ts, case 11.
 *      The holder is given this process's environment and what the declaration says its start adds (`howToStart` in
 *      src/config/settings.mjs).
 *   8. the starter is the system's own PowerShell, by its whole path in the folder Windows names, and never a bare
 *      `powershell.exe`, which Windows would look for in the start's own folder first. The runner's is checked in
 *      tests/the-windows-side-of-the-system-layer.test.ts, case 15;
 *   9. the starter refuses in words, with 125, when the Job Object it runs in does not let a program leave it, and it
 *      has no start of the program that does not leave;
 *  10. a start that has not answered says how to end what it left: on Windows by the server's own number when the
 *      service lock names it, and otherwise that this command does not know it.
 *
 * It cannot check that the starter works on Windows. That is item 21, and the Windows 11 run of round W8.
 *
 * Mutations, in the commit message that added this file.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { theSystemFor, thisSystem } from '../src/config/systems/the-system.mjs'
import { THE_UTF8_LINE } from '../src/config/systems/windows-commands.mjs'
import { theJobObjectOf } from '../src/config/systems/windows-groups.mjs'
import {
  JOB_OBJECT_NAMES_BEGIN,
  THE_LINE_VARIABLE,
  THE_PROGRAM_VARIABLE,
  THE_STARTER_REFUSED,
  THE_STARTERS_MARK,
  theStarterScript,
  theWindowsCommandLine,
} from '../src/config/systems/windows-starts.mjs'
import { howToEndAStartThatDidNotAnswer } from '../src/config/the-service-command.mjs'
import { startATerminalHolder, theTerminalHolderLog } from '../src/config/the-terminal-holder.mjs'

const CLAUDE = 'C:\\Users\\someone\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.exe'

/** The script a start hands PowerShell, decoded. */
function theScriptIn(args: readonly string[]): string {
  expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
  return Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
}

describe('the start in a group', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('1: on Linux and the Mac hands the way back as it came, detached, and stops a group gently with SIGTERM', () => {
    const env = { PATH: '/usr/bin', HOME: '/srv/someone' }
    for (const platform of ['linux', 'darwin']) {
      const { groups } = theSystemFor(platform)
      const way = { command: '/usr/bin/node', args: ['a b', '"c"'], windowsVerbatimArguments: false, env }
      const how = groups.howToStartInItsOwnGroup(way)
      expect(how, platform).toEqual({ ...way, detached: true })
      expect(how, platform).not.toHaveProperty('windowsHide')
      expect(how.env, platform).toBe(env)
      expect(how.args, platform).toBe(way.args)
      expect(groups.howToStartInItsOwnGroup({ ...way, env: undefined }).env, platform).toBeUndefined()
      expect(groups.gentleStop, platform).toBe('SIGTERM')
    }
  })

  it('2: on Windows starts the starter, with the program and its line beside the environment it was given', () => {
    const { groups } = theSystemFor('win32')
    const env = { Path: 'C:\\Windows', USERPROFILE: 'C:\\Users\\someone' }
    vi.stubEnv('SystemRoot', 'C:\\Windows')
    const how = groups.howToStartInItsOwnGroup({ command: CLAUDE, args: ['-p', 'say "hi"'], windowsVerbatimArguments: false, env })
    expect(how.command).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(how.windowsVerbatimArguments).toBe(false)
    // A PowerShell that Node starts detached, with no console, ends at once and runs nothing (Windows 11, round W8).
    expect(how.detached).toBe(false)
    expect(how.windowsHide).toBe(true)
    const script = theScriptIn(how.args)
    expect(script).toBe(theStarterScript())
    expect(script).not.toContain(THE_UTF8_LINE)
    expect(how.env).toEqual({
      ...env,
      [THE_PROGRAM_VARIABLE]: CLAUDE,
      [THE_LINE_VARIABLE]: `${CLAUDE} -p "say \\"hi\\""`,
    })
    expect(env).not.toHaveProperty(THE_PROGRAM_VARIABLE)
    // No environment is this process's own, with the two added.
    const own = groups.howToStartInItsOwnGroup({ command: CLAUDE, args: [], windowsVerbatimArguments: false, env: undefined })
    expect(own.env).toEqual({ ...process.env, [THE_PROGRAM_VARIABLE]: CLAUDE, [THE_LINE_VARIABLE]: CLAUDE })
    expect(groups.gentleStop).toBeNull()
  })

  it("3: builds the command line Node builds for the same words, and joins them as they are when asked to", () => {
    // libuv's own examples, in quote_cmd_arg, and the empty word.
    const cases: [string, string][] = [
      ['hello"world', '"hello\\"world"'],
      ['hello""world', '"hello\\"\\"world"'],
      ['hello\\world', 'hello\\world'],
      ['hello\\\\world', 'hello\\\\world'],
      ['hello\\"world', '"hello\\\\\\"world"'],
      ['hello\\\\"world', '"hello\\\\\\\\\\"world"'],
      ['hello world\\', '"hello world\\\\"'],
      ['hello world', '"hello world"'],
      ['tab\there', '"tab\there"'],
      ['', '""'],
      ['你好 世界', '"你好 世界"'],
    ]
    for (const [word, line] of cases) {
      expect(theWindowsCommandLine(['C:\\x.exe', word], false), word).toBe(`C:\\x.exe ${line}`)
    }
    expect(theWindowsCommandLine(['C:\\Program Files\\x.exe'], false)).toBe('"C:\\Program Files\\x.exe"')
    const cmd = ['C:\\WINDOWS\\system32\\cmd.exe', '/d', '/s', '/v:off', '/c', '""C:\\a b\\claude.cmd" "-p""']
    expect(theWindowsCommandLine(cmd, true)).toBe('C:\\WINDOWS\\system32\\cmd.exe /d /s /v:off /c ""C:\\a b\\claude.cmd" "-p""')
    const how = theSystemFor('win32').groups.howToStartInItsOwnGroup({
      command: cmd[0]!,
      args: cmd.slice(1),
      windowsVerbatimArguments: true,
      env: {},
    })
    expect(how.windowsVerbatimArguments).toBe(false)
    expect(how.env?.[THE_LINE_VARIABLE]).toBe(cmd.join(' '))
  })

  it('4: refuses in words a program that is not named by its whole path', () => {
    const { groups } = theSystemFor('win32')
    for (const command of ['cmd.exe', 'claude', '.\\tools\\x.exe']) {
      expect(() => groups.howToStartInItsOwnGroup({ command, args: [], windowsVerbatimArguments: false, env: {} }), command).toThrow(
        `${command} is not named by its whole path, and on Windows a program is started in its own Job Object only by its whole path. Nothing was started.`,
      )
    }
  })

  it('5: makes the Job Object a stop opens, starts the program suspended outside its own, and puts it there before it runs', () => {
    const script = theStarterScript()
    expect(theJobObjectOf(4321)).toBe(`${JOB_OBJECT_NAMES_BEGIN}4321`)
    expect(script).toContain(`string name = ${JSON.stringify(JOB_OBJECT_NAMES_BEGIN)} + GetCurrentProcessId();`)
    expect(script).toContain('inherited.bInheritHandle = 1;')
    expect(script).toContain('if (error == 183) return Refuse(')
    // Progress is silenced on the line after the mark, before any command. Hidden, PowerShell writes its progress to the
    // error stream it hands the program, which is the server's log.
    expect(script.split('\n').slice(1, 3)).toEqual(["$ProgressPreference = 'SilentlyContinue'", "$ErrorActionPreference = 'Stop'"])
    // The variables are read, then removed, and only then is anything made or started.
    const at = (text: string) => {
      const found = script.indexOf(text)
      expect(found, text).toBeGreaterThan(-1)
      expect(script.indexOf(text, found + 1), `${text} appears once`).toBe(-1)
      return found
    }
    const read = at(`Environment.GetEnvironmentVariable(${JSON.stringify(THE_LINE_VARIABLE)})`)
    const removed = [THE_PROGRAM_VARIABLE, THE_LINE_VARIABLE].map((name) => at(`Environment.SetEnvironmentVariable(${JSON.stringify(name)}, null);`))
    const made = at('IntPtr job = CreateJobObjectW(ref inherited, name);')
    // CREATE_SUSPENDED and CREATE_BREAKAWAY_FROM_JOB, beside DETACHED_PROCESS and CREATE_NEW_PROCESS_GROUP, Node's flags.
    expect(0x00000004 | 0x01000000 | 0x00000008 | 0x00000200).toBe(16777740)
    const started = at('CreateProcessW(program, new StringBuilder(line), IntPtr.Zero, IntPtr.Zero, true, 16777740, IntPtr.Zero, null, ref startup, out started)')
    const put = at('if (!AssignProcessToJobObject(job, started.hProcess)) return EndBeforeItRuns(')
    const runs = at('if (ResumeThread(started.hThread) == 0xFFFFFFFF) return EndBeforeItRuns(')
    const waited = at('if (WaitForSingleObject(started.hProcess, 0xFFFFFFFF) != 0) return Refuse(')
    for (const each of removed) expect(each).toBeGreaterThan(read)
    expect(made).toBeGreaterThan(Math.max(...removed))
    expect(started).toBeGreaterThan(made)
    expect(put).toBeGreaterThan(started)
    expect(runs).toBeGreaterThan(put)
    expect(waited).toBeGreaterThan(runs)
    // The starter does not join its Job Object: it ends when its caller ends, and the program goes on.
    expect(script.match(/AssignProcessToJobObject\(/gu)).toHaveLength(2)
    expect(script).not.toContain('AssignProcessToJobObject(job, GetCurrentProcess())')
    // A program it cannot put in its Job Object, or let run, is ended before it runs, and the sentence says which.
    expect(script).toContain('bool ended = TerminateProcess(started.hProcess, 125);')
    expect(script).toContain('", so it was ended before it ran."')
    expect(script).toContain('" is left, suspended."')
    expect(script).toContain('startup.dwFlags = 256;')
    expect(script).toContain('return unchecked((int)code);')
    expect(script).toContain('exit ([MoleOfficeStarter]::Start())')
    expect(script).toContain(`    return ${THE_STARTER_REFUSED};`)
    expect(script).toContain(`  exit ${THE_STARTER_REFUSED}`)
    expect(THE_STARTER_REFUSED).toBe(125)
  })

  it("6: begins every starter's encoded script with the mark a stop reads on its command line", () => {
    const how = theSystemFor('win32').groups.howToStartInItsOwnGroup({ command: CLAUDE, args: ['-p', 'x'], windowsVerbatimArguments: false, env: {} })
    expect(THE_STARTERS_MARK.length).toBeGreaterThan(40)
    expect(how.args.at(-1)!.startsWith(THE_STARTERS_MARK)).toBe(true)
    expect(theStarterScript().startsWith(Buffer.from(THE_STARTERS_MARK, 'base64').toString('utf16le'))).toBe(true)
  })

  it("7: starts the terminal holder as the layer says, and reads back what the layer's program did", async () => {
    // THE HOLDER IS STOOD IN BY A NODE THAT ENDS AT ONCE, so no holder starts here, even under a mutation that skips the
    // layer: the layer's program ends with code 3, and the program it was handed with code 4.
    const scratch = mkdtempSync(join(tmpdir(), 'the-holders-start-in-a-group-'))
    vi.stubEnv('XDG_CONFIG_HOME', scratch)
    try {
      const ends = (code: number) => ['-e', `process.exit(${String(code)})`]
      const database = join(scratch, 'made-up.db')
      const start = vi
        .spyOn(thisSystem().groups, 'howToStartInItsOwnGroup')
        .mockReturnValue({ command: process.execPath, args: ends(3), windowsVerbatimArguments: false, env: undefined, detached: true })
      // The holder is given this process's environment and what the declaration says its start adds.
      const how = { command: process.execPath, args: ends(4), environment: { MADE_UP_NEED: 'the holder' } }
      const started = await startATerminalHolder({ databasePath: database, how, cwd: scratch, waitMs: 5_000 })
      expect(start.mock.calls, 'the holder is not started as the layer says, with this environment and what its start adds').toEqual([
        [{ command: process.execPath, args: [...ends(4), '--database', database], windowsVerbatimArguments: false, env: { ...process.env, MADE_UP_NEED: 'the holder' } }],
      ])
      expect(started).toEqual({ outcome: 'ended', why: 'it ended with exit code 3', logPath: theTerminalHolderLog(database) })
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("8: starts the system's own PowerShell by its whole path, in the folder Windows names, and never by its bare name", () => {
    const { groups } = theSystemFor('win32')
    const way = { command: CLAUDE, args: [], windowsVerbatimArguments: false, env: {} }
    vi.stubEnv('SystemRoot', 'D:\\Win')
    expect(groups.howToStartInItsOwnGroup(way).command).toBe('D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    vi.stubEnv('SystemRoot', undefined)
    const how = groups.howToStartInItsOwnGroup(way)
    expect(how.command).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(win32.isAbsolute(how.command)).toBe(true)
  })

  it('9: refuses in words, with 125, when the Job Object it runs in does not let a program leave it, and never starts it there', () => {
    const script = theStarterScript()
    const at = (text: string) => {
      const found = script.indexOf(text)
      expect(found, text).toBeGreaterThan(-1)
      expect(script.indexOf(text, found + 1), `${text} appears once`).toBe(-1)
      return found
    }
    // Asked before the Job Object is made, so a refusal leaves nothing behind. 2048 is JOB_OBJECT_LIMIT_BREAKAWAY_OK.
    const asked = at('if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out inAJob)) return Refuse(')
    const read = at('if (!QueryInformationJobObject(IntPtr.Zero, 2, out limits, (uint)Marshal.SizeOf(typeof(BasicLimitInformation)), IntPtr.Zero)) return Refuse(')
    const refused = at(
      'if ((limits.LimitFlags & 2048) == 0) return Refuse("The starter runs in a Job Object that does not let a program leave it, so " + ' +
        'program + " was not started. Started there, it would end whenever that Job Object is ended. Start it from a program that does not run ' +
        'in such a Job Object.");',
    )
    expect(read).toBeGreaterThan(asked)
    expect(refused).toBeGreaterThan(read)
    expect(at('IntPtr job = CreateJobObjectW(ref inherited, name);')).toBeGreaterThan(refused)
    // ONE START OF THE PROGRAM, AND IT LEAVES: no second start, without CREATE_BREAKAWAY_FROM_JOB, after a refusal.
    const starts = [...script.matchAll(/CreateProcessW\(program, new StringBuilder\(line\), IntPtr\.Zero, IntPtr\.Zero, true, (\d+),/gu)]
    expect(starts).toHaveLength(1)
    expect(Number(starts[0]![1]) & 0x01000000).toBe(0x01000000)
    expect(script.match(/CreateProcess/gu)).toHaveLength(2)
    expect(script).not.toMatch(/Start-Process|Process\.Start|ShellExecute|CreateProcessAsUser|CreateProcessWithToken|Invoke-Expression/u)
  })

  it('10: says how to end a start that has not answered: its group, or on Windows the server its service lock names', () => {
    type TheLock = Parameters<typeof howToEndAStartThatDidNotAnswer>[2]
    const lock = (pid: number, pgid: number) => ({ state: 'read', lock: { pid, pgid } }) as TheLock
    expect(howToEndAStartThatDidNotAnswer(4321, false, { state: 'absent' })).toBe('If it should not be running, stop its group: kill -TERM -4321')
    // ON WINDOWS THE NUMBER STARTED IS THE STARTER'S, which ends when this command ends. The server's own is the lock's.
    expect(howToEndAStartThatDidNotAnswer(4321, true, lock(5150, 4321))).toBe(
      'If it should not be running, end it and every process it started: taskkill /PID 5150 /T /F',
    )
    const notOurs: TheLock[] = [{ state: 'absent' }, { state: 'unreadable', why: 'it is not JSON' }, lock(5150, 999)]
    for (const each of notOurs) {
      expect(howToEndAStartThatDidNotAnswer(4321, true, each), each.state).toBe(
        "This command does not know the server's own number, because the server has not taken its service lock. " +
          'Process 4321, the starter, ends when this command ends.',
      )
    }
  })
})
