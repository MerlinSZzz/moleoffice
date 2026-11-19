// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOWS SIDE OF THE SYSTEM LAYER, READ ON LINUX WITH STAND-INS FOR POWERSHELL. Wave 13t, round W1, item 2.
 *
 * src/config/systems/the-system.mjs gives Windows two pieces that run PowerShell:
 *   - the reader of processes (src/config/systems/windows-processes.mjs), over Get-CimInstance Win32_Process;
 *   - the signal to a group (src/config/systems/windows-groups.mjs), over the Job Object the group runs in.
 * Both run PowerShell through src/config/systems/windows-commands.mjs, and both take a stand-in for it. Each script
 * prints JSON, and the cases below hand back what a script would print. So this file checks how the answers are read
 * and how a failure is said. It cannot check that the scripts work on Windows: nothing has been run on Windows yet.
 *
 *   1-7: the reader. One row is the process; an empty list is no process; a missing start time is unreadable; a command
 *        that did not run, failed or printed something other than a list of rows about that process throws; a number
 *        that is not a process number runs nothing.
 *   8-13: the group signal. 0 asks whether the group's Job Object holds a process, and SIGKILL ends every process in
 *        it. No such Job Object, or one that holds nothing, is ESRCH, and a refusal is EPERM, so each caller's own
 *        handling reads them as it reads process.kill's. A failure to look carries neither code. Any other signal is
 *        refused in words, and nothing is run.
 *   14-15: the runner. It hands PowerShell the script encoded, after the line that makes PowerShell write UTF-8. It
 *        runs the system's own powershell.exe by its whole path, and one that is not there is a command that did not
 *        run, in Node's own words, which name the file it was asked to start.
 *   15b (round W11, item 2): the runner also has a way that starts PowerShell and waits for its answer without
 *        holding the thread. It runs the same program with the same arguments, and a program that is not there is a
 *        command that did not run, in the same words as case 15 but for Node's name of the call.
 *   16-17 (round W5, item 6): a group whose starter has not made its Job Object yet. After a missing or empty Job
 *        Object, the script reads the command line of the process with the group's number for the starter's mark.
 *        Signal 0 then answers that the group is there, and only the SIGKILL script can end the starter, after which it
 *        looks for the Job Object again. "Still starting" is never an answer SIGKILL accepts.
 *   18-21 (round W8, item 22): what is asked of a Job Object. `jobObjects.holds` asks Windows whether a group's Job
 *        Object holds a process, with only the rights to ask, and says unknown in words where Windows does not answer.
 *        `jobObjects.theOneThisProgramWasStartedIn` believes the starter's variable only when that Job Object holds this
 *        program and the process with the group's number carries the starter's mark. A mark that cannot be read is
 *        unknown, not no. Windows is asked once, and the variable is left for the stop listener. Linux and the Mac have
 *        no Job Objects to ask.
 *   22-24 (round W10, item 2): one reading of a process. `processWithItsCommandLine` reads a process, its start, its
 *        command line and its name with one script. This process itself is read once: every later question about it
 *        is answered from its first row with a start, and a failed look or a row with no start is not kept. Every other
 *        process is read once in one run of the thread, and again in a later run (round W45).
 *   25-26 (round W45): what one run of the thread keeps. A row about another process answers the later questions
 *        about it in the same run, because each question is a script of about a second that holds the thread, and the
 *        look at a conversation's process asks four. After a group is ended, every process is asked about again, even
 *        in the same run, so a process that was ended is not answered as running. An answer that no process has the
 *        number is not kept, nor is a look that failed.
 *   27-33: the PowerShell that stays (`aPowerShellThatStays`). Here a Node program stands in for PowerShell and
 *        answers each script as the loop that stays does, with its own process number in what it prints. So:
 *        27 one program runs every script, one at a time and in the order given, and each answer is its own script's,
 *           with the time it waited, the time it ran and the time the program measured;
 *        28 the thread goes on while a script runs;
 *        29 a script that runs past its limit is a command that did not run, in words; the program is stopped, a script
 *           that was waiting behind it is answered in words too, and the next script starts a new program;
 *        30 a line that is not the answer to the script now running is not taken as an answer, and stops the program:
 *           an answer numbered for another script, a line that is not JSON, and a second answer to a script that was
 *           answered already, which comes while the next script runs;
 *        31 a program that ends before it answers is a command that did not run, with its exit code;
 *        32 a program that cannot be started, one that prints something else where it says it is ready, and one that
 *           never says it is ready are each a command that did not run, in words;
 *        33 the real runner has the way that stays, which runs the system's own powershell.exe by its whole path, and
 *           says one that is not on this Linux machine did not run, in Node's own words.
 *        None of this ran on Windows. Whether powershell.exe runs the loop as the stand-in does needs a Windows machine.
 *
 * Mutations, in the commit message that added the code:
 *   - the reader answers an empty list as unreadable instead of absent: red, case 2;
 *   - the reader takes the first of two rows: red, case 4;
 *   - the reader puts a pid that is not a whole number into its script: red, case 5;
 *   - the group signal reads a failed look as ESRCH: red, case 12;
 *   - the group signal sends SIGKILL for SIGTERM: red, case 13.
 * Mutations for cases 16 and 17, in the commit message that added them. For cases 18 to 21, in the commit message of
 * round W8 that let a server take the lock on Windows. For cases 22 to 24, in the commit message of round W10 that
 * added the reading. For case 15b, in the commit message of round W11 that added the way that waits. For cases 23, 25
 * and 26 as round W45 has them, in the commit message of round W45 that keeps a row for one run.
 * For cases 27 to 33, in the commit message that added the PowerShell that stays.
 */

import { describe, expect, it, vi } from 'vitest'

import { theSystemFor } from '../src/config/systems/the-system.mjs'
import {
  THE_HOLDING_ANSWER_SAYS,
  THE_TOLD_GROUP_IS_NOT_BELIEVED,
  THE_TOLD_GROUP_IS_UNKNOWN,
  theJobObjectOf,
  windowsGroups,
  WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE,
} from '../src/config/systems/windows-groups.mjs'
import { THE_GROUP_VARIABLE, THE_STARTERS_MARK } from '../src/config/systems/windows-starts.mjs'
import {
  aPowerShellThatStays,
  thePowerShellArguments,
  theProgramCouldNotBeRunWords,
  theRealWindowsCommands,
  THE_UTF8_LINE,
} from '../src/config/systems/windows-commands.mjs'
import { theStartWasNotSaidWords, whetherItRunsIsUnknownWords, windowsProcessReader } from '../src/config/systems/windows-processes.mjs'

type Did =
  | { command: string; ran: true; status: number; stdout: string; stderr: string }
  | { command: string; ran: false; reason: string }

/** A stand-in for PowerShell: it notes each script and hands back the next answer, or the answer `answer` makes. */
function aStandIn(answer: Did | ((script: string) => Did)) {
  const scripts: string[] = []
  const powershell = (script: string): Did => {
    scripts.push(script)
    return typeof answer === 'function' ? answer(script) : answer
  }
  // The way that waits for PowerShell answers as the way that holds the thread does.
  const commands = { powershell, startPowerShell: async (script: string): Promise<Did> => powershell(script) }
  return { commands, scripts }
}

const printed = (stdout: string): Did => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })
const rows = (...list: object[]): Did => printed(`${JSON.stringify(list)}\r\n`)

const STARTED = 1_793_350_000_000
const NODE = {
  ProcessId: 1234,
  ParentProcessId: 4,
  CreationDate: STARTED,
  Name: 'node.exe',
  ExecutablePath: 'C:\\Program Files\\nodejs\\node.exe',
  CommandLine: '"C:\\Program Files\\nodejs\\node.exe" server.js 你好',
}

/** What a function threw, or null. */
function thrownBy(run: () => unknown): (Error & { code?: string }) | null {
  try {
    run()
  } catch (err) {
    return err as Error & { code?: string }
  }
  return null
}

describe('the Windows reader of processes', () => {
  it('1: reads one process from its row, with no group and no state, which Windows does not have', () => {
    const { commands, scripts } = aStandIn(rows(NODE))
    const reader = windowsProcessReader(commands)
    expect(reader.platform).toBe('win32')
    expect(reader.processAt(1234)).toEqual({ here: true, pid: 1234, ppid: 4, pgid: 0, state: '', startedAt: new Date(STARTED) })
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain('Win32_Process')
    expect(scripts[0]).toContain('1234')
    expect(reader.commandLineOf(1234)).toBe(NODE.CommandLine)
    expect(reader.nameOf(1234)).toBe('node.exe')
    expect(reader.executableOf(1234)).toBe(NODE.ExecutablePath)
    expect(reader.parentOf(1234)).toBe(4)
    expect(reader.startTimeOf(1234)).toEqual(new Date(STARTED))
  })

  it('2: answers an empty list as no process with that number', () => {
    const reader = windowsProcessReader(aStandIn(printed('[]')).commands)
    expect(reader.processAt(1234)).toEqual({ here: false })
    expect(reader.commandLineOf(1234)).toBeNull()
    expect(reader.nameOf(1234)).toBeNull()
    expect(reader.executableOf(1234)).toBeNull()
    expect(reader.parentOf(1234)).toBeNull()
    expect(reader.startTimeOf(1234)).toBeNull()
  })

  it('3: answers a field Windows did not give as unreadable or null, and never as a made-up value', () => {
    const reader = windowsProcessReader(
      aStandIn(rows({ ...NODE, CreationDate: null, CommandLine: null, ExecutablePath: null, Name: null })).commands,
    )
    const at = reader.processAt(1234)
    expect(at).toEqual({ here: true, unreadable: expect.stringContaining('1234') })
    expect(reader.startTimeOf(1234)).toBeNull()
    expect(reader.commandLineOf(1234)).toBeNull()
    expect(reader.executableOf(1234)).toBeNull()
    expect(reader.nameOf(1234)).toBeNull()
    expect(reader.parentOf(1234)).toBe(4)
  })

  it('4: throws when PowerShell did not run, failed, or printed anything but rows about that one process', () => {
    const cases: [string, Did, string | null][] = [
      ['did not run', { command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run: spawn ENOENT' }, 'spawn ENOENT'],
      ['failed', { command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Get-CimInstance : Access is denied.\r\n' }, 'Access is denied'],
      ['printed no JSON', printed('WARNING: something\r\n'), null],
      ['printed one row, not a list', printed(JSON.stringify(NODE)), null],
      ['printed a row about another process', rows({ ...NODE, ProcessId: 99 }), null],
      ['printed two rows', rows(NODE, NODE), null],
    ]
    for (const [what, did, words] of cases) {
      const reader = windowsProcessReader(aStandIn(did).commands)
      for (const ask of [() => reader.processAt(1234), () => reader.commandLineOf(1234), () => reader.startTimeOf(1234)]) {
        const err = thrownBy(ask)
        expect(err, what).not.toBeNull()
        expect(err!.message, what).toContain('1234')
        if (words !== null) expect(err!.message, what).toContain(words)
      }
    }
  })

  it('5: runs nothing for a number that is not a process number', () => {
    const { commands, scripts } = aStandIn(rows(NODE))
    const reader = windowsProcessReader(commands)
    for (const pid of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => reader.processAt(pid), String(pid)).toThrow()
      expect(() => reader.commandLineOf(pid), String(pid)).toThrow()
    }
    expect(scripts).toEqual([])
  })

  it('6: lists every command line it can read, and leaves out the ones Windows did not give', () => {
    const { commands, scripts } = aStandIn(rows(NODE, { ...NODE, ProcessId: 4, ParentProcessId: 0, CommandLine: null }, { ...NODE, ProcessId: 77, CommandLine: 'cmd.exe /c dir' }))
    expect(windowsProcessReader(commands).everyCommandLine()).toEqual([
      { pid: 1234, command: NODE.CommandLine },
      { pid: 77, command: 'cmd.exe /c dir' },
    ])
    expect(scripts[0]).toContain('Win32_Process')
    const failed = windowsProcessReader(aStandIn({ command: 'powershell.exe', ran: false, reason: 'timed out' }).commands)
    expect(() => failed.everyCommandLine()).toThrow('timed out')
  })

  it('7: runs nothing until it is asked', () => {
    const { commands, scripts } = aStandIn(rows(NODE))
    windowsProcessReader(commands)
    expect(scripts).toEqual([])
  })
})

describe('the Windows signal to a group', () => {
  it('8: asks with signal 0 whether the Job Object of the group holds a process', () => {
    const { commands, scripts } = aStandIn(printed('{"job":"there","active":3}\r\n'))
    expect(windowsGroups(commands).signal(4321, 0)).toBeUndefined()
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain(theJobObjectOf(4321))
    expect(scripts[0]).toContain('QueryInformationJobObject')
    expect(scripts[0]).not.toContain('TerminateJobObject')
  })

  it('9: ends every process in the Job Object of the group with SIGKILL', () => {
    const { commands, scripts } = aStandIn(printed('{"job":"ended"}\r\n'))
    expect(windowsGroups(commands).signal(4321, 'SIGKILL')).toBeUndefined()
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain(theJobObjectOf(4321))
    expect(scripts[0]).toContain('TerminateJobObject')
  })

  it('10: throws ESRCH when no Job Object has that name, or it holds no process', () => {
    for (const [signal, said] of [
      [0, '{"job":"missing"}'],
      ['SIGKILL', '{"job":"missing"}'],
      [0, '{"job":"there","active":0}'],
    ] as const) {
      const err = thrownBy(() => windowsGroups(aStandIn(printed(said)).commands).signal(4321, signal))
      expect(err?.code, `${String(signal)} ${said}`).toBe('ESRCH')
      expect(err!.message).toContain(theJobObjectOf(4321))
    }
  })

  it('11: throws EPERM when Windows refused to open the Job Object', () => {
    for (const signal of [0, 'SIGKILL'] as const) {
      const err = thrownBy(() => windowsGroups(aStandIn(printed('{"job":"refused"}')).commands).signal(4321, signal))
      expect(err?.code, String(signal)).toBe('EPERM')
      expect(err!.message).toContain(theJobObjectOf(4321))
    }
  })

  it('12: throws with neither code when it could not look, so no caller reads it as gone', () => {
    const cases: [string, Did][] = [
      ['did not run', { command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run: spawn ENOENT' }],
      ['failed', { command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Add-Type : failed\r\n' }],
      ['printed no JSON', printed('nothing\r\n')],
      ['said it failed', printed('{"job":"failed","error":6}')],
      ['said something else', printed('{"job":"perhaps"}')],
    ]
    for (const [what, did] of cases) {
      for (const signal of [0, 'SIGKILL'] as const) {
        const err = thrownBy(() => windowsGroups(aStandIn(did).commands).signal(4321, signal))
        expect(err, `${what}, ${String(signal)}`).not.toBeNull()
        expect(err!.code, `${what}, ${String(signal)}`).toBeUndefined()
        expect(err!.message, what).toContain('4321')
      }
    }
  })

  it('13: refuses in words every other signal, and a group that is not a process number, and runs nothing', () => {
    const { commands, scripts } = aStandIn(printed('{"job":"ended"}'))
    const groups = windowsGroups(commands)
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT', 'SIGQUIT'] as const) {
      const err = thrownBy(() => groups.signal(4321, signal))
      expect(err?.message, signal).toContain(WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE)
      expect(err!.message).toContain(signal)
      expect(err!.code).toBeUndefined()
    }
    for (const group of [0, -4321, 1.5, Number.NaN]) {
      expect(() => groups.signal(group, 'SIGKILL'), String(group)).toThrow()
    }
    expect(scripts).toEqual([])
    expect(theJobObjectOf(4321)).toBe('Local\\mole-office-group-4321')
  })

  it('16: answers signal 0 for a group whose starter has not made its Job Object yet as there', () => {
    const { commands, scripts } = aStandIn(printed('{"job":"starting"}\r\n'))
    expect(windowsGroups(commands).signal(4321, 0)).toBeUndefined()
    const script = scripts[0]!
    const looked = script.indexOf("$said = [MoleOfficeGroup]::Signal('Local\\mole-office-group-4321', 4)")
    const read = script.indexOf(`if ($said -eq '{"job":"missing"}' -or $said -eq '{"job":"there","active":0}') {`)
    expect(looked).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(looked)
    expect(script).toContain('Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = 4321"')
    expect(script).toContain(`.CommandLine.Contains('${THE_STARTERS_MARK}')`)
    expect(script).toContain(`$said = '{"job":"starting"}'`)
    expect(script).not.toContain('TerminateProcess')
    expect(script).not.toContain('EndTheStarter')
  })

  it('17: with SIGKILL ends a starter that has not made its Job Object yet, then looks again, and never accepts "starting"', () => {
    const { commands, scripts } = aStandIn(printed('{"job":"ended"}\r\n'))
    expect(windowsGroups(commands).signal(4321, 'SIGKILL')).toBeUndefined()
    const script = scripts[0]!
    const read = script.indexOf(`if ($said -eq '{"job":"missing"}' -or $said -eq '{"job":"there","active":0}') {`)
    const ended = script.indexOf("$said = [MoleOfficeGroup]::EndTheStarter(4321, 'Local\\mole-office-group-4321', 12)")
    expect(read).toBeGreaterThan(-1)
    expect(ended).toBeGreaterThan(read)
    expect(script).toContain(`.CommandLine.Contains('${THE_STARTERS_MARK}')`)
    // It ends the starter, waits until it has ended, and only then looks for a Job Object the starter made meanwhile.
    const terminated = script.indexOf('if (!TerminateProcess(process, 1)) {')
    const waited = script.indexOf('if (WaitForSingleObject(process, 10000) != 0)')
    const again = script.indexOf('string after = Signal(name, access);')
    expect(terminated).toBeGreaterThan(-1)
    expect(waited).toBeGreaterThan(terminated)
    expect(again).toBeGreaterThan(waited)
    const err = thrownBy(() => windowsGroups(aStandIn(printed('{"job":"starting"}')).commands).signal(4321, 'SIGKILL'))
    expect(err?.message).toContain(theJobObjectOf(4321))
    expect(err!.code).toBeUndefined()
  })
})

describe('the PowerShell runner', () => {
  it('14: hands PowerShell the script encoded, after the line that makes it write UTF-8', () => {
    const script = "Write-Output '你好'"
    const args = thePowerShellArguments(script)
    expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const decoded = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
    expect(THE_UTF8_LINE).toBe('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8')
    expect(decoded.startsWith(`${THE_UTF8_LINE}\n`)).toBe(true)
    expect(decoded.endsWith(script)).toBe(true)
  })

  it("15: runs the system's own powershell.exe by its whole path, and says one that is not on this Linux machine did not run", () => {
    vi.stubEnv('SystemRoot', 'D:\\Win')
    try {
      const program = 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      const did = theRealWindowsCommands().powershell('Write-Output 1')
      // Node's own refusal names the file it was asked to start, so this is the file that was not there.
      expect(did).toEqual({ command: program, ran: false, reason: theProgramCouldNotBeRunWords(program, `spawnSync ${program} ENOENT`) })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('15b: the way that waits for PowerShell runs the same program, and says the same of one that is not there', async () => {
    vi.stubEnv('SystemRoot', 'D:\\Win')
    try {
      const program = 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      const did = await theRealWindowsCommands().startPowerShell('Write-Output 1')
      expect(did).toEqual({ command: program, ran: false, reason: theProgramCouldNotBeRunWords(program, `spawn ${program} ENOENT`) })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('what is asked of a Job Object', () => {
  const JOB = 'Local\\mole-office-group-4321'
  const didNotRun: Did = { command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run: spawnSync powershell.exe ENOENT' }

  it("18: asks whether a group's Job Object holds a process, and says unknown in words where Windows does not answer", () => {
    const answers: [Did, ReturnType<NonNullable<ReturnType<typeof windowsGroups>['jobObjects']>['holds']>][] = [
      [printed('{"holds":true}\r\n'), { holds: true }],
      [printed('{"holds":false}'), { holds: false, why: THE_HOLDING_ANSWER_SAYS.notHeld(JOB, 777) }],
      [printed('{"job":"missing"}'), { holds: false, why: THE_HOLDING_ANSWER_SAYS.noJobObject(JOB) }],
      [printed('{"process":"missing"}'), { holds: false, why: THE_HOLDING_ANSWER_SAYS.noProcess(777) }],
      [printed('{"job":"refused"}'), { unknown: THE_HOLDING_ANSWER_SAYS.jobRefused(JOB) }],
      [printed('{"process":"refused"}'), { unknown: THE_HOLDING_ANSWER_SAYS.processRefused(777) }],
      [printed('{"job":"failed","error":6}'), { unknown: THE_HOLDING_ANSWER_SAYS.jobFailed(JOB, 6) }],
      [printed('{"process":"failed","error":31}'), { unknown: THE_HOLDING_ANSWER_SAYS.processFailed(777, 31) }],
      [printed('{"job":"there"}'), { unknown: THE_HOLDING_ANSWER_SAYS.notKnown(JOB, { job: 'there' }) }],
      [printed('not json'), { unknown: THE_HOLDING_ANSWER_SAYS.notJson(JOB) }],
      [didNotRun, { unknown: THE_HOLDING_ANSWER_SAYS.unknownBecause(JOB, didNotRun.reason) }],
    ]
    for (const [did, answer] of answers) {
      const { commands, scripts } = aStandIn(did)
      expect(windowsGroups(commands).jobObjects!.holds(4321, 777), JSON.stringify(did)).toEqual(answer)
      expect(scripts).toHaveLength(1)
      expect(scripts[0]).toContain(`$said = [MoleOfficeHolding]::Holds('${JOB}', 777)`)
      // Whether a group holds a process says nothing of the starter, so its command line is not read.
      expect(scripts[0]).not.toContain('Get-CimInstance')
    }
    // A number that is not a group or a process runs nothing.
    const { commands, scripts } = aStandIn(printed('{"holds":true}'))
    for (const bad of [0, -4321, 1.5, Number.NaN]) {
      expect(windowsGroups(commands).jobObjects!.holds(bad, 777), String(bad)).toEqual({ unknown: THE_HOLDING_ANSWER_SAYS.notAGroupNumber(bad) })
      expect(windowsGroups(commands).jobObjects!.holds(4321, bad), String(bad)).toEqual({ unknown: THE_HOLDING_ANSWER_SAYS.notAProcessNumber(bad) })
    }
    expect(scripts).toEqual([])
  })

  it('19: opens the Job Object and the process with only the rights to ask, and ends nothing', () => {
    const { commands, scripts } = aStandIn(printed('{"holds":true}'))
    windowsGroups(commands).jobObjects!.holds(4321, 777)
    const script = scripts[0]!
    // JOB_OBJECT_QUERY, and PROCESS_QUERY_LIMITED_INFORMATION.
    expect(script.match(/OpenJobObjectW\(\d+,/gu)).toEqual(['OpenJobObjectW(4,'])
    expect(script.match(/OpenProcess\(\d+,/gu)).toEqual(['OpenProcess(4096,'])
    // IsProcessInJob is the name kernel32.dll exports. A name it does not export fails only when the script runs.
    expect(script).toContain('public static extern bool IsProcessInJob(IntPtr ProcessHandle, IntPtr JobHandle, out bool Result);')
    expect(script).toContain('if (!IsProcessInJob(process, job, out holds)) {')
    expect(script).not.toContain('IsProcessInJobObject')
    expect(script).not.toMatch(/Terminate/u)
  })

  it('20: believes the group this program was started in only from a Job Object that holds it and a marked starter, and asks once', () => {
    const pid = process.pid
    try {
      vi.stubEnv(THE_GROUP_VARIABLE, '4321')
      const cases: [string, ReturnType<NonNullable<ReturnType<typeof windowsGroups>['jobObjects']>['theOneThisProgramWasStartedIn']>][] = [
        ['{"holds":true,"marked":true}', { group: 4321 }],
        ['{"holds":true,"marked":false}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.notMarked(4321) }],
        ['{"holds":true,"marked":null}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.markUnread(4321) }],
        ['{"holds":true}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.markUnread(4321) }],
        ['{"holds":false,"marked":true}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.notStartedInIt(4321, THE_HOLDING_ANSWER_SAYS.notHeld(JOB, pid)) }],
        ['{"job":"missing","marked":true}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.notStartedInIt(4321, THE_HOLDING_ANSWER_SAYS.noJobObject(JOB)) }],
        ['{"job":"refused","marked":true}', { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.cannotBeTold(4321, THE_HOLDING_ANSWER_SAYS.jobRefused(JOB)) }],
      ]
      for (const [stdout, answer] of cases) {
        const { commands, scripts } = aStandIn(printed(stdout))
        const jobObjects = windowsGroups(commands).jobObjects!
        const first = jobObjects.theOneThisProgramWasStartedIn()
        expect(first, stdout).toEqual(answer)
        // Asked once: the answer cannot change while this program runs.
        expect(jobObjects.theOneThisProgramWasStartedIn(), stdout).toBe(first)
        expect(scripts, stdout).toHaveLength(1)
        const script = scripts[0]!
        expect(script).toContain(`$said = [MoleOfficeHolding]::Holds('${JOB}', ${String(pid)})`)
        expect(script).toContain('$starter = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = 4321")')
        expect(script).toContain(
          `$marked = if ($starter.Count -ne 1 -or $null -eq $starter[0].CommandLine) { 'null' } elseif ($starter[0].CommandLine.Contains('${THE_STARTERS_MARK}')) { 'true' } else { 'false' }`,
        )
        // Left in place for the stop listener, which reads it and removes it.
        expect(process.env[THE_GROUP_VARIABLE], stdout).toBe('4321')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('20: without the variable, or with one that is not a group number, says so and asks Windows nothing (a second case)', () => {
    try {
      const { commands, scripts } = aStandIn(printed('{"holds":true,"marked":true}'))
      vi.stubEnv(THE_GROUP_VARIABLE, undefined)
      expect(windowsGroups(commands).jobObjects!.theOneThisProgramWasStartedIn()).toEqual({
        unknown: THE_TOLD_GROUP_IS_UNKNOWN.notTold(),
      })
      for (const written of ['0', '12a', '-3', '', '4321 ']) {
        vi.stubEnv(THE_GROUP_VARIABLE, written)
        expect(windowsGroups(commands).jobObjects!.theOneThisProgramWasStartedIn(), written).toEqual({
          unknown: THE_TOLD_GROUP_IS_UNKNOWN.notAGroupNumber(written),
        })
        expect(process.env[THE_GROUP_VARIABLE], written).toBe(written)
      }
      expect(scripts).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('21: is not asked on Linux and the Mac, where the process table says which group a process is in', () => {
    expect(theSystemFor('linux').groups.jobObjects).toBeNull()
    expect(theSystemFor('darwin').groups.jobObjects).toBeNull()
    expect(theSystemFor('win32').groups.jobObjects).not.toBeNull()
  })
})

describe('one reading of a process (round W10, item 2)', () => {
  /** A row about this process itself, the one the test runs in. */
  const ME = { ...NODE, ProcessId: process.pid }

  it('22: reads a process, its start, its command line and its name with one script', () => {
    const { commands, scripts } = aStandIn(rows(NODE))
    expect(windowsProcessReader(commands).processWithItsCommandLine(1234)).toEqual({
      here: true,
      pid: 1234,
      ppid: 4,
      pgid: 0,
      state: '',
      startedAt: new Date(STARTED),
      commandLine: NODE.CommandLine,
      name: 'node.exe',
    })
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain('ProcessId = 1234')
    const noLine = aStandIn(rows({ ...NODE, CommandLine: null }))
    expect(windowsProcessReader(noLine.commands).processWithItsCommandLine(1234)).toMatchObject({ here: true, commandLine: null, name: 'node.exe' })
    expect(noLine.scripts).toHaveLength(1)
    expect(windowsProcessReader(aStandIn(printed('[]')).commands).processWithItsCommandLine(1234)).toEqual({ here: false })
    expect(windowsProcessReader(aStandIn(rows({ ...NODE, CreationDate: null })).commands).processWithItsCommandLine(1234)).toEqual({
      here: true,
      unreadable: theStartWasNotSaidWords(1234),
    })
    const failed = windowsProcessReader(aStandIn({ command: 'powershell.exe', ran: false, reason: 'timed out' }).commands)
    expect(() => failed.processWithItsCommandLine(1234)).toThrow(whetherItRunsIsUnknownWords(1234, 'timed out'))
  })

  it('23: reads this process once, and every other process once in one run of the thread and again in a later run', async () => {
    const { commands, scripts } = aStandIn((script) => (script.includes(`ProcessId = ${String(process.pid)}`) ? rows(ME) : rows(NODE)))
    const reader = windowsProcessReader(commands)
    expect(reader.processAt(process.pid)).toEqual({ here: true, pid: process.pid, ppid: 4, pgid: 0, state: '', startedAt: new Date(STARTED) })
    expect(reader.processWithItsCommandLine(process.pid)).toMatchObject({ here: true, pid: process.pid, commandLine: NODE.CommandLine, name: 'node.exe' })
    expect(reader.commandLineOf(process.pid)).toBe(NODE.CommandLine)
    expect(reader.nameOf(process.pid)).toBe('node.exe')
    expect(reader.executableOf(process.pid)).toBe(NODE.ExecutablePath)
    expect(reader.parentOf(process.pid)).toBe(4)
    expect(reader.startTimeOf(process.pid)).toEqual(new Date(STARTED))
    expect(scripts).toHaveLength(1)
    reader.processAt(1234)
    reader.processAt(1234)
    reader.commandLineOf(1234)
    reader.nameOf(1234)
    expect(scripts).toHaveLength(2)
    await new Promise((later) => setImmediate(later))
    reader.processAt(1234)
    expect(scripts).toHaveLength(3)
    // Another reader keeps its own reading.
    const another = aStandIn(rows(ME))
    windowsProcessReader(another.commands).processAt(process.pid)
    expect(another.scripts).toHaveLength(1)
  })

  it('24: keeps neither a failed look at this process nor a row about it with no start', () => {
    const answers: Did[] = [
      { command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Access is denied.\r\n' },
      rows({ ...ME, CreationDate: null }),
      rows(ME),
    ]
    const { commands, scripts } = aStandIn(() => answers[Math.min(scripts.length - 1, answers.length - 1)]!)
    const reader = windowsProcessReader(commands)
    expect(() => reader.processAt(process.pid)).toThrow('Access is denied.')
    expect(reader.processAt(process.pid)).toEqual({ here: true, unreadable: theStartWasNotSaidWords(process.pid) })
    expect(reader.processAt(process.pid)).toMatchObject({ here: true, startedAt: new Date(STARTED) })
    expect(reader.processAt(process.pid)).toMatchObject({ here: true, startedAt: new Date(STARTED) })
    expect(scripts).toHaveLength(3)
  })
})

describe('what one run of the thread keeps (round W45)', () => {
  it('25: after a group is ended, asks about a process again, even in the same run', () => {
    const { commands, scripts } = aStandIn((script) => (script.includes('TerminateJobObject') ? printed('{"job":"ended"}\r\n') : rows(NODE)))
    const reader = windowsProcessReader(commands)
    reader.processAt(1234)
    reader.commandLineOf(1234)
    expect(scripts).toHaveLength(1)
    windowsGroups(commands).signal(4321, 'SIGKILL')
    expect(scripts).toHaveLength(2)
    expect(reader.processAt(1234)).toMatchObject({ here: true, pid: 1234 })
    expect(scripts, 'the process was not asked about again after its group could have been ended').toHaveLength(3)
  })

  it('26: asks again in the same run about a process it found was not running, and after a look that failed', () => {
    const gone = aStandIn(printed('[]'))
    const reader = windowsProcessReader(gone.commands)
    expect(reader.processAt(1234)).toEqual({ here: false })
    expect(reader.commandLineOf(1234)).toBeNull()
    expect(gone.scripts).toHaveLength(2)
    const failed = aStandIn({ command: 'powershell.exe', ran: false, reason: 'timed out' })
    const unsure = windowsProcessReader(failed.commands)
    expect(() => unsure.processAt(1234)).toThrow('timed out')
    expect(() => unsure.nameOf(1234)).toThrow('timed out')
    expect(failed.scripts).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------- the PowerShell that stays

/**
 * A STAND-IN FOR THE POWERSHELL THAT STAYS: a Node program that says `ready` (or what its one argument says in its
 * place, or nothing for `silent`), then answers each line `<n> <base64 script>` as the loop does. The script is JSON:
 * what to print, how long to wait first, and what to do wrong. What it prints begins with its own process number, so a
 * case can tell one program from the next.
 */
const THE_STAND_IN = String.raw`
const first = process.argv[1] ?? 'ready'
if (first === 'silent') {
  setInterval(() => {}, 1000)
} else {
  process.stdout.write(first === 'ready' ? 'ready\r\n' : first + '\r\n')
  let heard = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    heard += chunk
    for (let at = heard.indexOf('\n'); at >= 0; at = heard.indexOf('\n')) {
      const line = heard.slice(0, at)
      heard = heard.slice(at + 1)
      const space = line.indexOf(' ')
      const n = Number(line.slice(0, space))
      const asked = JSON.parse(Buffer.from(line.slice(space + 1), 'base64').toString('utf8'))
      setTimeout(() => {
        if (asked.then === 'exit') process.exit(3)
        if (asked.then === 'not-json') return void process.stdout.write('this is not an answer\r\n')
        const answer = JSON.stringify({ n: asked.then === 'another-number' ? n + 1 : n, status: 0, stdout: process.pid + ' ' + asked.say, stderr: '', ms: 7 })
        process.stdout.write(asked.then === 'twice' ? answer + '\r\n' + answer + '\r\n' : answer + '\r\n')
      }, asked.waitMs ?? 0)
    }
  })
}
`

/** A script for the stand-in. */
const aScript = (say: string, more: { waitMs?: number; then?: 'exit' | 'not-json' | 'another-number' | 'twice' } = {}): string =>
  JSON.stringify({ say, ...more })

/** The PowerShell that stays, over the stand-in, with `first` where it says it is ready. */
function theOneThatStays(longest = 10_000, first = 'ready') {
  return aPowerShellThatStays(process.execPath, ['-e', THE_STAND_IN, first], longest)
}

/** The process number at the start of what the stand-in printed. */
const theProgramOf = (did: { ran: boolean; stdout?: string }): number => Number(did.ran ? did.stdout?.split(' ')[0] : Number.NaN)

/** Whether a process is gone, asked until it is or two seconds pass. */
async function isGone(pid: number): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((later) => setTimeout(later, 20))
  }
  return false
}

// Each case starts the stand-in, a Node program, once or more. On a loaded machine each start may take a second.
const STARTS_A_PROGRAM = 20_000

describe('the PowerShell that stays', () => {
  it('27: one program runs every script, one at a time and in the order given, and each answer is its own script\'s', async () => {
    const stays = theOneThatStays()
    try {
      const answers = await Promise.all(['first', 'second', 'third'].map((say) => stays.ask(aScript(say, { waitMs: 50 }))))
      expect(answers.map((did) => (did.ran ? did.stdout.split(' ')[1] : did.reason))).toEqual(['first', 'second', 'third'])
      const programs = new Set(answers.map(theProgramOf))
      expect(programs.size, `the scripts ran in ${String(programs.size)} programs`).toBe(1)
      expect(Number.isSafeInteger([...programs][0]), 'the stand-in printed no process number').toBe(true)
      for (const did of answers) {
        expect(did).toMatchObject({ command: process.execPath, ran: true, status: 0, stderr: '' })
        expect(did.took.scriptMs, 'the time the program measured').toBe(7)
        for (const part of [did.took.queuedMs, did.took.startingMs, did.took.ranMs]) expect(part).toBeGreaterThanOrEqual(0)
      }
      // ONE AT A TIME: the third waited while the first two ran, each for at least the 50 ms it waits.
      expect(answers[2]!.took.queuedMs, 'the third script did not wait for the two before it').toBeGreaterThanOrEqual(90)
      const later = await stays.ask(aScript('later'))
      expect(theProgramOf(later), 'a script given later ran in another program').toBe([...programs][0])
    } finally {
      stays.stop()
    }
  }, STARTS_A_PROGRAM)

  it('28: the thread goes on while a script runs', async () => {
    const stays = theOneThatStays()
    try {
      await stays.ask(aScript('started'))
      let ticks = 0
      const tick = setInterval(() => (ticks += 1), 20)
      const did = await stays.ask(aScript('slow', { waitMs: 400 }))
      clearInterval(tick)
      expect(did.ran).toBe(true)
      expect(ticks, `the thread ticked ${String(ticks)} times in a script of 400 ms`).toBeGreaterThanOrEqual(5)
    } finally {
      stays.stop()
    }
  }, STARTS_A_PROGRAM)

  it('29: a script that runs past its limit is refused in words, stops the program, and the next starts a new one', async () => {
    const stays = theOneThatStays(2_000)
    try {
      const first = theProgramOf(await stays.ask(aScript('first')))
      const [late, behind] = await Promise.all([stays.ask(aScript('late', { waitMs: 10_000 })), stays.ask(aScript('behind'))])
      const why = `${process.execPath} did not finish (stopped, because it ran longer than 2000 ms)`
      expect(late).toMatchObject({ command: process.execPath, ran: false, reason: why })
      expect(late.took.scriptMs, 'a script that was not answered has a time the program measured').toBeNull()
      expect(late.took.ranMs).toBeGreaterThanOrEqual(1_950)
      expect(behind).toMatchObject({
        ran: false,
        reason: `${process.execPath} did not run this script, because it was stopped before its turn: ${why}`,
      })
      expect(await isGone(first), 'the program that ran past its limit was not stopped').toBe(true)
      const next = await stays.ask(aScript('next'))
      expect(next.ran, JSON.stringify(next)).toBe(true)
      expect(theProgramOf(next), 'the next script ran in the program that was stopped').not.toBe(first)
    } finally {
      stays.stop()
    }
  }, STARTS_A_PROGRAM)

  it('30: a line that is not the answer to the script now running is not taken as an answer, and stops the program', async () => {
    const notTheAnswer = (line: string) =>
      `${process.execPath} did not finish (stopped, because it printed ${JSON.stringify(line)}, which is not the answer to the script it was running)`
    const stays = theOneThatStays()
    try {
      // AN ANSWER NUMBERED FOR ANOTHER SCRIPT. The first script given is number 1, and the stand-in answers it as 2.
      const numbered = await stays.ask(aScript('numbered', { then: 'another-number' }))
      expect(numbered.ran, JSON.stringify(numbered)).toBe(false)
      const why = numbered.ran ? '' : numbered.reason
      const itsProgram = /\\"stdout\\":\\"(\d+) numbered\\"/u.exec(why)?.[1]
      expect(why).toBe(notTheAnswer(JSON.stringify({ n: 2, status: 0, stdout: `${String(itsProgram)} numbered`, stderr: '', ms: 7 })))
      // A LINE THAT IS NOT JSON.
      expect(await stays.ask(aScript('not json', { then: 'not-json' }))).toMatchObject({ ran: false, reason: notTheAnswer('this is not an answer') })
      // A SECOND ANSWER TO A SCRIPT ANSWERED ALREADY, which comes while the next script runs. The next script is not
      // answered with it.
      const [once, next] = await Promise.all([stays.ask(aScript('once', { then: 'twice' })), stays.ask(aScript('next', { waitMs: 2_000 }))])
      expect(once.ran ? once.stdout.split(' ')[1] : once.reason).toBe('once')
      expect(next.ran, `the next script was answered with ${JSON.stringify(next)}`).toBe(false)
      // Script 3 is answered twice, and the second answer comes while script 4 runs.
      expect(next.ran ? '' : next.reason).toBe(notTheAnswer(JSON.stringify({ n: 3, status: 0, stdout: `${String(theProgramOf(once))} once`, stderr: '', ms: 7 })))
      expect(await isGone(theProgramOf(once)), 'the program that printed a second answer was not stopped').toBe(true)
    } finally {
      stays.stop()
    }
  }, STARTS_A_PROGRAM)

  it('31: a program that ends before it answers is a command that did not run, with its exit code', async () => {
    const stays = theOneThatStays()
    try {
      const ended = await stays.ask(aScript('ends', { then: 'exit' }))
      expect(ended).toMatchObject({ ran: false, reason: `${process.execPath} ended (exit code 3) before it answered` })
      const next = await stays.ask(aScript('next'))
      expect(next.ran, JSON.stringify(next)).toBe(true)
    } finally {
      stays.stop()
    }
  }, STARTS_A_PROGRAM)

  it('32: a program that cannot start, prints something else where it says it is ready, or never says it is ready', async () => {
    const missing = '/a/made-up/powershell.exe'
    const none = aPowerShellThatStays(missing, [], 10_000)
    const wrong = theOneThatStays(10_000, 'Windows PowerShell')
    const silent = theOneThatStays(500, 'silent')
    try {
      expect(await none.ask(aScript('x'))).toMatchObject({ ran: false, reason: theProgramCouldNotBeRunWords(missing, `spawn ${missing} ENOENT`) })
      expect(await wrong.ask(aScript('x'))).toMatchObject({
        ran: false,
        reason: `${process.execPath} did not start: it printed "Windows PowerShell" where it says it is ready`,
      })
      const quiet = await silent.ask(aScript('x'))
      expect(quiet).toMatchObject({ ran: false, reason: `${process.execPath} did not finish (stopped, because it did not say it was ready within 500 ms)` })
      expect(quiet.took.startingMs).toBeGreaterThanOrEqual(450)
    } finally {
      for (const one of [none, wrong, silent]) one.stop()
    }
  }, STARTS_A_PROGRAM)

  it("33: the real runner's way that stays runs the system's own powershell.exe, and says one that is not there did not run", async () => {
    vi.stubEnv('SystemRoot', 'D:\\Win')
    try {
      const program = 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      const ask = theRealWindowsCommands().askThePowerShellThatStays
      expect(typeof ask, 'the real runner has no way that stays').toBe('function')
      expect(await ask!('Write-Output 1')).toMatchObject({ command: program, ran: false, reason: theProgramCouldNotBeRunWords(program, `spawn ${program} ENOENT`) })
    } finally {
      vi.unstubAllEnvs()
    }
  }, STARTS_A_PROGRAM)
})
