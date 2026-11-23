// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SIGNAL TO A GROUP ON WINDOWS, OVER THE JOB OBJECT THE GROUP RUNS IN, THROUGH POWERSHELL.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * Windows has no process groups and no signal that asks a whole group to stop. A Windows group is
 * the Job Object it was started in, and the only way to end the whole group is to end every process
 * in that Job Object at once. So a caller may ask whether the Job Object holds a process (signal 0)
 * or end the group with SIGKILL. Every other signal is refused in words before anything is run,
 * rather than doing nothing and returning.
 *
 * The Job Object is named after the group's number, `Local\mole-office-group-<number>`. One script
 * opens that name, asks Windows how many processes are active in it, and for SIGKILL ends them.
 * The script prints one JSON line, and the answer is read as one of a few plain words.
 *
 * A WINDOWS GROUP IS STARTED IN A JOB OBJECT OF THIS NAME, by the starter in ./windows-starts.mjs,
 * which names it after its own process number. So a missing Job Object, or one that holds nothing,
 * means the group has gone, except in the second or two before the starter has made it and put the
 * program in it. For that time, when the Job Object is missing or empty, the script reads the command
 * line of the process with the group's number. If it carries the starter's mark, the group is still
 * starting. Signal 0 then answers that the group is there. SIGKILL ends the starter, waits until it
 * has ended, and then ends the Job Object if the starter made one in the meantime, so nothing it
 * started is left.
 *
 * WHAT THIS CANNOT RULE OUT. Between the reading of the command line and the end, the starter could
 * end and Windows could give its number to another program, which would then be ended. Windows gives
 * a number again only once nothing holds the old process open, so the time for that is a few
 * milliseconds.
 *
 * A STOP REQUEST IN PLACE OF SIGTERM. A program with a clean stop (the server, the message worker
 * and the terminal holder) listens on a named pipe named after its own group,
 * `\\.\pipe\mole-office-stop-<number>`.
 * The starter hands it that number in one variable (./windows-starts.mjs). An ask connects to the
 * pipe, writes `stop`, and waits two seconds for the answer `stopping`. Nothing listening, another
 * answer, or no answer in time is refused in words, and a refusal never says the group has stopped.
 *
 * THE PIPE IS MADE BY A HELPER, NOT BY NODE. Node's pipe server cannot refuse remote clients or say who
 * may open the pipe. So the program starts a PowerShell helper, ./windows-stop-pipe.ps1, read from its
 * own file as it is. The helper makes the pipe as its first instance only, refuses remote clients, and
 * lets only this Windows user open it. It answers the exact request, and writes `stop` on its output for
 * the program. It ends when the program ends. A helper that cannot make the pipe, or ends, makes the
 * program say so in words, and the program runs on without a stop listener. Nothing falls back to a
 * pipe Node makes.
 *
 * WHICH GROUP A PROCESS IS IN. Windows's process table names no group, so `jobObjects.holds` asks
 * Windows whether a group's Job Object holds a process. A program learns its own group from the
 * starter's variable, but a variable can be carried on from anywhere. So `jobObjects.theOneThis-
 * ProgramWasStartedIn` believes it only when the process with that number carries the starter's mark
 * on its command line and that number's Job Object holds this program. So Windows is asked once, at
 * the program's start, while the starter still runs: it ends when its caller ends, and every caller
 * waits for its program's start. No process leaves a Job Object, so the answer stays true after the
 * starter has gone. That reading leaves the variable in place, for the stop listener to read and
 * remove. Another program's group is read from outside it by `readTheGroupItsParentNames`: its
 * parent's number, believed only when that number's Job Object holds it.
 *
 * WHAT A STARTER STARTED. The pid a caller records is the starter's, and the starter ends when its
 * caller ends. `jobObjects.programsOfAStarter` lists the starter's children that its Job Object
 * holds, with their starts, and `startedByThatStarter` says which of them it started. The server's
 * ledger asks it about a row whose starter has ended, and the worker asks it about a run it picks up.
 *
 * SOME OF THIS HAS RUN ON A WINDOWS 11 MACHINE, in wave 13t. The stop request through the pipe, and the
 * helper that makes the pipe, ran there in round W8. The readings of a Job Object, for a program's own
 * group and for what a starter started, ran there in rounds W9 and W10. The end of every process in a
 * Job Object has still not run there until a walk shows it. The server's release now ends a run's Job
 * Object this way, at once, when a run is paused or stopped (`releaseResource` in
 * src/server/lib/resources.ts). All of it is read on Linux, with stand-ins for PowerShell in
 * tests/the-windows-side-of-the-system-layer.test.ts, and with a socket file in place of the pipe and a
 * stand-in for the helper in tests/a-stop-request-on-windows-reaches-the-program-that-listens.test.ts.
 * What the helper itself does is proved only on Windows.
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'

import { theEncodedArguments, thePowerShellProgram, theRealWindowsCommands } from './windows-commands.mjs'
import { aGroupIsBeingEnded } from './windows-processes.mjs'
import {
  howToStartInAJobObject,
  JOB_OBJECT_NAMES_BEGIN,
  THE_GROUP_VARIABLE,
  THE_STARTERS_MARK,
  theProgramToStartInAJobObject,
} from './windows-starts.mjs'

/**
 * @typedef {import('./windows-commands.mjs').WindowsCommands} WindowsCommands
 * @typedef {import('./the-system.mjs').Groups} Groups
 */

/**
 * Why a signal no Job Object can carry is refused. It is exported so every caller refuses in the
 * same words.
 */
export const WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE =
  'Windows has no signal that asks a whole group to stop, so on Windows a group is only ever ended at once, with SIGKILL, which ends every process in its Job Object.'

/**
 * The words a signal that no Job Object can carry is refused in, naming the signal and the group.
 * @param {number | string} signal
 * @param {number} group
 * @returns {string}
 */
export function theSignalIsRefusedWords(signal, group) {
  return `${WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE} It was asked to send ${String(signal)} to group ${String(group)}.`
}

/**
 * The name of the Job Object of one group.
 * @param {number} group
 * @returns {string}
 */
export function theJobObjectOf(group) {
  return `${JOB_OBJECT_NAMES_BEGIN}${group}`
}

/** The start of every pipe a program listens on for a stop request. The group's number ends it. */
export const STOP_PIPES_BEGIN = '\\\\.\\pipe\\mole-office-stop-'

/**
 * The pipe the program of one group listens on for a stop request.
 * @param {number} group
 * @returns {string}
 */
export function theStopPipeOf(group) {
  return `${STOP_PIPES_BEGIN}${group}`
}

/** The one line an ask writes, and the one line that answers it. */
export const THE_STOP_REQUEST = 'stop'
export const THE_STOP_ANSWER = 'stopping'

/** How long an ask waits for its answer. */
export const A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS = 2_000

/**
 * THE WORDS A STOP REQUEST IS REFUSED WITH, each built here so that a caller or a test reads the sentence from the
 * code. A refusal of a group that was asked is its reason and then `notAsked(group)`, which begins with a space. The
 * reason is one of four: nothing answered in time, the program answered something else, it closed the pipe without an
 * answer, or the request could not reach the pipe. `couldNotReach` is only the opening of its reason, and the refusal
 * adds the error's own words after it. A group number that is not a whole number above 0 is refused with
 * `notAGroupNumber` alone.
 */
export const A_REFUSED_STOP_REQUEST = Object.freeze({
  /** @param {unknown} group */
  notAGroupNumber(group) {
    return `Group number ${String(group)} is not a whole number above 0, so nothing was asked to stop.`
  },
  /** @param {string} address */
  nothingAnswered(address) {
    return `Nothing answered the stop request on ${address} within ${String(A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS)} ms.`
  },
  /**
   * @param {string} address
   * @param {string} answer
   */
  answeredOtherwise(address, answer) {
    return `The program on ${address} answered ${JSON.stringify(answer)}, not ${JSON.stringify(THE_STOP_ANSWER)}.`
  },
  /** @param {string} address */
  closedThePipe(address) {
    return `The program on ${address} closed the pipe without answering the stop request.`
  },
  /** @param {string} address */
  couldNotReach(address) {
    return `The stop request could not reach ${address}`
  },
  /** @param {number} group */
  notAsked(group) {
    return ` So group ${String(group)} was not asked to stop, and it may still be running.`
  },
})

/**
 * THE WORDS THE STOP LISTENER SAYS, each built here so that a caller or a test reads the sentence from the code.
 * `notToldItsGroup` is what a program says when the starter did not tell it its group's number. `runsOnWithoutAListener`
 * is what a program says when it runs on without a stop listener, given the pipe's address, whether the helper had
 * listened, and how the helper ended. `couldNotBeStarted` is the ending that gives the helper's own reason.
 * `ended` is the ending that says whether the helper listened, its exit code or signal, and what it said.
 * `wroteAnOddLine` is the sentence about a helper line that is neither the listening line nor the stop request, given
 * the pipe's address and the line.
 */
export const THE_STOP_LISTENER_SAYS = Object.freeze({
  notToldItsGroup() {
    return (
      `This program was not started by Mole Office's starter, so it was not told its group's number (${THE_GROUP_VARIABLE}) ` +
      'and listens for no stop request. On Windows it can then be stopped only by ending its group at once.'
    )
  },
  /**
   * @param {string} address
   * @param {boolean} listening
   * @param {string} how
   */
  runsOnWithoutAListener(address, listening, how) {
    return `Nothing can ask this program to stop${listening ? ' now' : ''}, and it runs on without a stop listener. The helper for this program's stop pipe ${address} ${how}`
  },
  /** @param {string} why */
  couldNotBeStarted(why) {
    return `could not be started: ${why}.`
  },
  /**
   * @param {boolean} listening
   * @param {number | null} code
   * @param {NodeJS.Signals | null} signal
   * @param {string} said
   */
  ended(listening, code, signal, said) {
    return `ended ${listening ? 'after it listened' : 'before it listened'}, ${code === null ? `stopped by ${String(signal)}` : `with exit code ${String(code)}`}, ${said === '' ? 'and said nothing.' : `and said: ${said}`}`
  },
  /**
   * @param {string} address
   * @param {string} line
   */
  wroteAnOddLine(address, line) {
    return `The helper for this program's stop pipe ${address} wrote ${JSON.stringify(line)}, which is neither ${JSON.stringify(THE_HELPER_LISTENS)} nor ${JSON.stringify(THE_STOP_REQUEST)}, so nothing was done about it.`
  },
})

/**
 * THE WORDS THAT SAY THE GROUP THIS PROGRAM WAS TOLD IS UNKNOWN, each built here so that a caller or a test reads the
 * sentence from the code. `notTold` is what a program says when the starter left its group variable unset.
 * `notAGroupNumber` is what it says when the variable holds something other than a group number, and it names the text
 * as it was written.
 */
export const THE_TOLD_GROUP_IS_UNKNOWN = Object.freeze({
  notTold() {
    return `This program was not started by Mole Office's starter: it was not told its group's number (${THE_GROUP_VARIABLE}).`
  },
  /** @param {string} written */
  notAGroupNumber(written) {
    return `${THE_GROUP_VARIABLE} is ${JSON.stringify(written)}, which is not a group number.`
  },
})

/**
 * THE WORDS AN ANSWER ABOUT A GROUP'S JOB OBJECT IS SAID WITH, each built here so that a caller or a test reads the
 * sentence from the code. `notAGroupNumber` and `notAProcessNumber` say that Windows was not asked, and name the number
 * as it was given. `unknownBecause` says that the Job Object could not be asked, and gives the reason. `notJson` and
 * `notOneObject` say that the command answered something other than one JSON object. `notHeld`, `noJobObject` and
 * `noProcess` are the three answers that say the Job Object does not hold the process, and each names what is missing.
 * `jobRefused` and `processRefused` say that Windows refused access to the Job Object or the process. `jobFailed` and
 * `processFailed` give Windows' own error. `notKnown` gives the answer that this reader does not know.
 */
export const THE_HOLDING_ANSWER_SAYS = Object.freeze({
  /** @param {unknown} group */
  notAGroupNumber(group) {
    return `Group number ${String(group)} is not a whole number above 0.`
  },
  /** @param {unknown} pid */
  notAProcessNumber(pid) {
    return `Process number ${String(pid)} is not a whole number above 0.`
  },
  /**
   * @param {string} job
   * @param {string} why
   */
  unknownBecause(job, why) {
    return `Whether the Job Object ${job} holds a process is unknown: ${why}`
  },
  /** @param {string} job */
  notJson(job) {
    return `The answer about the Job Object ${job} was not JSON.`
  },
  /** @param {string} job */
  notOneObject(job) {
    return `The answer about the Job Object ${job} was not one JSON object.`
  },
  /**
   * @param {string} job
   * @param {number} pid
   */
  notHeld(job, pid) {
    return `the Job Object ${job} does not hold process ${String(pid)}`
  },
  /** @param {string} job */
  noJobObject(job) {
    return `no Job Object named ${job} exists`
  },
  /** @param {number} pid */
  noProcess(pid) {
    return `no process ${String(pid)} is running`
  },
  /** @param {string} job */
  jobRefused(job) {
    return `Windows refused access to the Job Object ${job}.`
  },
  /** @param {number} pid */
  processRefused(pid) {
    return `Windows refused access to process ${String(pid)}.`
  },
  /**
   * @param {string} job
   * @param {unknown} error
   */
  jobFailed(job, error) {
    return `The Job Object ${job} could not be asked (Windows error ${String(error)}).`
  },
  /**
   * @param {number} pid
   * @param {unknown} error
   */
  processFailed(pid, error) {
    return `Process ${String(pid)} could not be opened (Windows error ${String(error)}).`
  },
  /**
   * @param {string} job
   * @param {unknown} said
   */
  notKnown(job, said) {
    return `The answer about the Job Object ${job} was ${JSON.stringify(said)}, which this reader does not know.`
  },
})

/**
 * The opening of every sentence that refuses the group this program was told, naming the group.
 * @param {number} group
 * @returns {string}
 */
function theToldGroupOpening(group) {
  return `${THE_GROUP_VARIABLE} says this program's group is ${String(group)}`
}

/**
 * THE WORDS THAT SAY WHY THE GROUP THIS PROGRAM WAS TOLD IS NOT BELIEVED, each built here so that a caller or a test
 * reads the sentence from the code. Every one begins with the same opening, which names the group. `cannotBeTold` gives
 * the reason the Job Object could not be read. `notStartedInIt` gives the holding's reason that this program is not in
 * the group. `notMarked` says that the process with the group's number does not carry the starter's mark. `markUnread`
 * says that the command line of that process could not be read, so whether it carries the mark cannot be told.
 */
export const THE_TOLD_GROUP_IS_NOT_BELIEVED = Object.freeze({
  /**
   * @param {number} group
   * @param {string} why
   */
  cannotBeTold(group, why) {
    return `${theToldGroupOpening(group)}, and whether that is so cannot be told: ${why}`
  },
  /**
   * @param {number} group
   * @param {string} why
   */
  notStartedInIt(group, why) {
    return `${theToldGroupOpening(group)}, but ${why}, so this program was not started in it.`
  },
  /** @param {number} group */
  notMarked(group) {
    return (
      `${theToldGroupOpening(group)}, but process ${String(group)} does not carry the starter's mark on its command line, ` +
      "so this program was not started by Mole Office's starter."
    )
  },
  /** @param {number} group */
  markUnread(group) {
    return (
      `${theToldGroupOpening(group)}, but the command line of process ${String(group)} could not be read: it is not running, or ` +
      "Windows did not show it. So whether Mole Office's starter started this program cannot be told."
    )
  },
})

/**
 * THE HELPER THAT OWNS THE PIPE, by its file's name. It is read beside the module that reads it: in a checkout that is
 * this file, and in a bundle it is the bundle, beside which scripts/bundle.mjs puts it.
 */
export const THE_STOP_HELPER = 'windows-stop-pipe.ps1'

/** The two values the helper is handed in its environment: the pipe's name, and the number of the program it serves. */
export const THE_HELPERS_PIPE_VARIABLE = 'MOLE_STOP_PIPE_NAME'
export const THE_HELPERS_PROGRAM_VARIABLE = 'MOLE_STOP_PIPE_PROGRAM'

/** The line the helper writes when its pipe is made. The line it writes for a stop request is THE_STOP_REQUEST. */
export const THE_HELPER_LISTENS = 'listening'

/**
 * HOW THE HELPER IS STARTED: the system's own PowerShell by its whole path, with the helper's file encoded as it is,
 * without the UTF-8 line, because the helper runs with no console. Its two values travel in its environment, so its
 * script is never written to.
 * @param {string} address the pipe
 * @param {number} program the number of the program the helper serves
 * @returns {AWayToStartTheHelper}
 */
export function theStopHelpersStart(address, program) {
  return {
    command: thePowerShellProgram(),
    args: theEncodedArguments(readFileSync(new URL(`./${THE_STOP_HELPER}`, import.meta.url), 'utf8')),
    options: {
      env: { ...process.env, [THE_HELPERS_PIPE_VARIABLE]: address, [THE_HELPERS_PROGRAM_VARIABLE]: String(program) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  }
}

/**
 * @typedef {{ command: string, args: string[], options: import('node:child_process').SpawnOptions }} AWayToStartTheHelper
 */

/**
 * ONE LISTENER IN A PROGRAM: the current onStop and say, the helper (or null), and the sentence that said why nothing
 * listens (or null).
 * @typedef {{
 *   onStop: () => void,
 *   say: (sentence: string) => void,
 *   helper: import('node:child_process').ChildProcess | null,
 *   whyNothingListens: string | null,
 * }} TheStopListener
 */

/** @param {AWayToStartTheHelper} way */
const startTheHelper = (way) => spawn(way.command, way.args, way.options)

/** JOB_OBJECT_QUERY: enough to ask how many processes the Job Object holds. */
const JOB_OBJECT_QUERY = 0x0004

/** JOB_OBJECT_TERMINATE: enough to end every process in the Job Object. */
const JOB_OBJECT_TERMINATE = 0x0008

/** PROCESS_QUERY_LIMITED_INFORMATION: enough to ask whether a Job Object holds the process, and nothing more. */
const ASK_ABOUT_A_PROCESS = 0x1000

/** PROCESS_TERMINATE and SYNCHRONIZE: enough to end a starter and wait until it has ended. */
const END_AND_WAIT_FOR_A_PROCESS = 0x0001 | 0x00100000

/** WAIT_TIMEOUT, which Windows also gives as an error number: the starter had not ended in ten seconds. */
const WAIT_TIMEOUT = 258

/** The two answers after which the script reads whether the group is still starting. */
const MISSING = '{"job":"missing"}'
const EMPTY = '{"job":"there","active":0}'

/**
 * The PowerShell script for one group. The terminate import and the terminate call are written
 * only for SIGKILL, so the script for signal 0 cannot end anything.
 *
 * The calls and the error readings are all in the C# methods. Reading the last error from
 * PowerShell between two calls would let the engine make another call in between, which could
 * replace the error before it is read.
 *
 * After a missing or empty Job Object, the script reads the command line of the process with the
 * group's number, for the starter's mark (./windows-starts.mjs). Only the SIGKILL script can end
 * that starter.
 *
 * @param {number} group
 * @param {boolean} stopping whether this is SIGKILL
 * @returns {string}
 */
function theGroupScript(group, stopping) {
  const access = stopping ? JOB_OBJECT_QUERY + JOB_OBJECT_TERMINATE : JOB_OBJECT_QUERY
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    'public static class MoleOfficeGroup {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct BasicAccountingInformation {',
    '    public long TotalUserTime;',
    '    public long TotalKernelTime;',
    '    public long ThisPeriodTotalUserTime;',
    '    public long ThisPeriodTotalKernelTime;',
    '    public uint TotalPageFaultCount;',
    '    public uint TotalProcesses;',
    '    public uint ActiveProcesses;',
    '    public uint TotalTerminatedProcesses;',
    '  }',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern IntPtr OpenJobObjectW(uint dwDesiredAccess, bool bInheritHandle, string lpName);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool QueryInformationJobObject(IntPtr hJob, int JobObjectInformationClass, out BasicAccountingInformation lpJobObjectInformation, uint cbJobObjectInformationLength, IntPtr lpReturnLength);',
    '',
    ...(stopping
      ? [
          '  [DllImport("kernel32.dll", SetLastError = true)]',
          '  public static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);',
          '',
          '  [DllImport("kernel32.dll", SetLastError = true)]',
          '  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);',
          '',
          '  [DllImport("kernel32.dll", SetLastError = true)]',
          '  public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);',
          '',
          '  [DllImport("kernel32.dll", SetLastError = true)]',
          '  public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);',
          '',
        ]
      : []),
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool CloseHandle(IntPtr hObject);',
    '',
    '  public static string Signal(string name, uint access) {',
    '    IntPtr handle = OpenJobObjectW(access, false, name);',
    '    if (handle == IntPtr.Zero) {',
    '      int error = Marshal.GetLastWin32Error();',
    '      if (error == 2) return "{\\"job\\":\\"missing\\"}";',
    '      if (error == 5) return "{\\"job\\":\\"refused\\"}";',
    '      return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
    '    }',
    '    try {',
    '      BasicAccountingInformation info = new BasicAccountingInformation();',
    '      uint size = (uint)Marshal.SizeOf(typeof(BasicAccountingInformation));',
    '      if (!QueryInformationJobObject(handle, 1, out info, size, IntPtr.Zero)) {',
    '        int error = Marshal.GetLastWin32Error();',
    '        if (error == 5) return "{\\"job\\":\\"refused\\"}";',
    '        return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
    '      }',
    '      if (info.ActiveProcesses == 0) return "{\\"job\\":\\"there\\",\\"active\\":0}";',
    ...(stopping
      ? [
          '      if (!TerminateJobObject(handle, 1)) {',
          '        int error = Marshal.GetLastWin32Error();',
          '        if (error == 5) return "{\\"job\\":\\"refused\\"}";',
          '        return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
          '      }',
          '      return "{\\"job\\":\\"ended\\"}";',
        ]
      : ['      return "{\\"job\\":\\"there\\",\\"active\\":" + info.ActiveProcesses + "}";']),
    '    }',
    '    finally {',
    '      CloseHandle(handle);',
    '    }',
    '  }',
    ...(stopping
      ? [
          '',
          '  public static string EndTheStarter(uint starter, string name, uint access) {',
          `    IntPtr process = OpenProcess(${String(END_AND_WAIT_FOR_A_PROCESS)}, false, starter);`,
          '    bool ended = false;',
          '    if (process == IntPtr.Zero) {',
          '      int error = Marshal.GetLastWin32Error();',
          '      if (error == 5) return "{\\"job\\":\\"refused\\"}";',
          // 87: no process has that number now, so the starter ended by itself after its command line was read.
          '      if (error != 87) return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
          '    }',
          '    else {',
          '      try {',
          '        if (!TerminateProcess(process, 1)) {',
          '          int error = Marshal.GetLastWin32Error();',
          // A starter that is already ending refuses to be ended, and is waited for like any other.
          '          if (WaitForSingleObject(process, 0) != 0) {',
          '            if (error == 5) return "{\\"job\\":\\"refused\\"}";',
          '            return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
          '          }',
          '        }',
          `        if (WaitForSingleObject(process, 10000) != 0) return "{\\"job\\":\\"failed\\",\\"error\\":${String(WAIT_TIMEOUT)}}";`,
          '        ended = true;',
          '      }',
          '      finally {',
          '        CloseHandle(process);',
          '      }',
          '    }',
          // The starter has ended, so no Job Object of this name can be made after this. One it made in the meantime ends now.
          '    string after = Signal(name, access);',
          `    if (ended && (after == ${JSON.stringify(MISSING)} || after == ${JSON.stringify(EMPTY)})) return "{\\"job\\":\\"ended\\"}";`,
          '    return after;',
          '  }',
        ]
      : []),
    '}',
    "'@",
    '',
    `$said = [MoleOfficeGroup]::Signal('${theJobObjectOf(group)}', ${String(access)})`,
    `if ($said -eq '${MISSING}' -or $said -eq '${EMPTY}') {`,
    `  $starter = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = ${String(group)}")`,
    `  if ($starter.Count -eq 1 -and $null -ne $starter[0].CommandLine -and $starter[0].CommandLine.Contains('${THE_STARTERS_MARK}')) {`,
    stopping
      ? `    $said = [MoleOfficeGroup]::EndTheStarter(${String(group)}, '${theJobObjectOf(group)}', ${String(access)})`
      : `    $said = '{"job":"starting"}'`,
    '  }',
    '}',
    'Write-Output $said',
  ].join('\n')
}

/**
 * THE POWERSHELL SCRIPT THAT ASKS WHETHER THE JOB OBJECT OF ONE GROUP HOLDS ONE PROCESS. It opens both
 * with the right to ask and no other, so it cannot end or change either. With `andTheStarter`, it also
 * reads whether the process with the group's number carries the starter's mark on its command line
 * (./windows-starts.mjs), and adds the answer as `marked`: true, false, or null when there is no such
 * process or Windows did not show its command line.
 *
 * @param {number} group
 * @param {number} pid
 * @param {boolean} andTheStarter
 * @returns {string}
 */
function theHoldingScript(group, pid, andTheStarter) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    'public static class MoleOfficeHolding {',
    '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern IntPtr OpenJobObjectW(uint dwDesiredAccess, bool bInheritHandle, string lpName);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool IsProcessInJob(IntPtr ProcessHandle, IntPtr JobHandle, out bool Result);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool CloseHandle(IntPtr hObject);',
    '',
    '  public static string Holds(string name, uint pid) {',
    `    IntPtr job = OpenJobObjectW(${String(JOB_OBJECT_QUERY)}, false, name);`,
    '    if (job == IntPtr.Zero) {',
    '      int error = Marshal.GetLastWin32Error();',
    '      if (error == 2) return "{\\"job\\":\\"missing\\"}";',
    '      if (error == 5) return "{\\"job\\":\\"refused\\"}";',
    '      return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
    '    }',
    '    try {',
    `      IntPtr process = OpenProcess(${String(ASK_ABOUT_A_PROCESS)}, false, pid);`,
    '      if (process == IntPtr.Zero) {',
    '        int error = Marshal.GetLastWin32Error();',
    // 87: no process has that number.
    '        if (error == 87) return "{\\"process\\":\\"missing\\"}";',
    '        if (error == 5) return "{\\"process\\":\\"refused\\"}";',
    '        return "{\\"process\\":\\"failed\\",\\"error\\":" + error + "}";',
    '      }',
    '      try {',
    '        bool holds;',
    '        if (!IsProcessInJob(process, job, out holds)) {',
    '          int error = Marshal.GetLastWin32Error();',
    '          return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
    '        }',
    '        return holds ? "{\\"holds\\":true}" : "{\\"holds\\":false}";',
    '      }',
    '      finally {',
    '        CloseHandle(process);',
    '      }',
    '    }',
    '    finally {',
    '      CloseHandle(job);',
    '    }',
    '  }',
    '}',
    "'@",
    '',
    `$said = [MoleOfficeHolding]::Holds('${theJobObjectOf(group)}', ${String(pid)})`,
    ...(andTheStarter
      ? [
          `$starter = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = ${String(group)}")`,
          // null: no such process, or a command line Windows did not show, which says neither yes nor no.
          `$marked = if ($starter.Count -ne 1 -or $null -eq $starter[0].CommandLine) { 'null' } elseif ($starter[0].CommandLine.Contains('${THE_STARTERS_MARK}')) { 'true' } else { 'false' }`,
          `$said = $said.Substring(0, $said.Length - 1) + ',"marked":' + $marked + '}'`,
        ]
      : []),
    'Write-Output $said',
  ].join('\n')
}

/**
 * The answer about one group's Job Object, as the script printed it. A command that did not run, a
 * failed command and an answer that is not JSON all throw, because none of them says the group has
 * gone.
 * @param {import('../process-reader.mjs').WhatACommandDid} did
 * @param {string} job the Job Object's name, for the sentence
 * @returns {{ job?: unknown, active?: unknown, error?: unknown }}
 */
function theAnswer(did, job) {
  if (!did.ran) throw new Error(THE_HOLDING_ANSWER_SAYS.unknownBecause(job, did.reason))
  if (did.status !== 0) {
    const onTheErrorStream = did.stderr.trim()
    const why = onTheErrorStream === '' ? `powershell.exe exited ${String(did.status)}` : onTheErrorStream
    throw new Error(THE_HOLDING_ANSWER_SAYS.unknownBecause(job, why))
  }
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error(THE_HOLDING_ANSWER_SAYS.notJson(job))
  }
  if (said === null || typeof said !== 'object' || Array.isArray(said)) {
    throw new Error(THE_HOLDING_ANSWER_SAYS.notOneObject(job))
  }
  return said
}

/**
 * Whether the Job Object of a group holds a process, as the holding script answered. A Job Object that
 * is not there and a process that is not running are answers: neither holds the other. A refusal, a
 * failure and an answer this does not know say that it cannot be told.
 *
 * @param {WindowsCommands} commands
 * @param {number} group
 * @param {number} pid
 * @param {boolean} andTheStarter
 * @returns {{ holds: true, marked: unknown } | { holds: false, why: string } | { unknown: string }}
 */
function whetherTheJobObjectHolds(commands, group, pid, andTheStarter) {
  const unaskable = whyTheHoldingCannotBeAsked(group, pid)
  if (unaskable !== null) return unaskable
  const job = theJobObjectOf(group)
  /** @type {HoldingAnswer} */
  let said
  try {
    said = theAnswer(commands.powershell(theHoldingScript(group, pid, andTheStarter)), job)
  } catch (error) {
    return { unknown: error instanceof Error ? error.message : String(error) }
  }
  return whatTheHoldingAnswerSays(said, job, pid)
}

/**
 * The same question, asked by the way that waits for PowerShell without holding the thread.
 *
 * @param {WindowsCommands} commands
 * @param {number} group
 * @param {number} pid
 * @param {boolean} andTheStarter
 * @returns {Promise<{ holds: true, marked: unknown } | { holds: false, why: string } | { unknown: string }>}
 */
async function readWhetherTheJobObjectHolds(commands, group, pid, andTheStarter) {
  const unaskable = whyTheHoldingCannotBeAsked(group, pid)
  if (unaskable !== null) return unaskable
  const job = theJobObjectOf(group)
  /** @type {HoldingAnswer} */
  let said
  try {
    said = theAnswer(await commands.startPowerShell(theHoldingScript(group, pid, andTheStarter)), job)
  } catch (error) {
    return { unknown: error instanceof Error ? error.message : String(error) }
  }
  return whatTheHoldingAnswerSays(said, job, pid)
}

/**
 * What the holding script printed, read as JSON.
 * @typedef {{ job?: unknown, process?: unknown, holds?: unknown, error?: unknown, marked?: unknown }} HoldingAnswer
 */

/**
 * Why Windows is not asked at all: a group or a process number that is not one.
 *
 * @param {number} group
 * @param {number} pid
 * @returns {{ unknown: string } | null}
 */
function whyTheHoldingCannotBeAsked(group, pid) {
  if (!Number.isSafeInteger(group) || group <= 0) return { unknown: THE_HOLDING_ANSWER_SAYS.notAGroupNumber(group) }
  if (!Number.isSafeInteger(pid) || pid <= 0) return { unknown: THE_HOLDING_ANSWER_SAYS.notAProcessNumber(pid) }
  return null
}

/**
 * What the holding script's answer says, in the words both ways of asking give.
 *
 * @param {HoldingAnswer} said
 * @param {string} job
 * @param {number} pid
 * @returns {{ holds: true, marked: unknown } | { holds: false, why: string } | { unknown: string }}
 */
function whatTheHoldingAnswerSays(said, job, pid) {
  if (said.holds === true) return { holds: true, marked: said.marked }
  if (said.holds === false) return { holds: false, why: THE_HOLDING_ANSWER_SAYS.notHeld(job, pid) }
  if (said.job === 'missing') return { holds: false, why: THE_HOLDING_ANSWER_SAYS.noJobObject(job) }
  if (said.process === 'missing') return { holds: false, why: THE_HOLDING_ANSWER_SAYS.noProcess(pid) }
  if (said.job === 'refused') return { unknown: THE_HOLDING_ANSWER_SAYS.jobRefused(job) }
  if (said.process === 'refused') return { unknown: THE_HOLDING_ANSWER_SAYS.processRefused(pid) }
  if (said.job === 'failed') return { unknown: THE_HOLDING_ANSWER_SAYS.jobFailed(job, said.error) }
  if (said.process === 'failed') return { unknown: THE_HOLDING_ANSWER_SAYS.processFailed(pid, said.error) }
  return { unknown: THE_HOLDING_ANSWER_SAYS.notKnown(job, said) }
}

/**
 * THE SCRIPT THAT READS WHAT A STARTER LEFT IN ITS JOB OBJECT. Its first line is the Job Object's answer: missing,
 * refused, failed with Windows' error, or there with the pids it holds. When it is there, the second line is the
 * starter's children, in the row shape of ./windows-processes.mjs.
 *
 * @param {number} starter
 * @returns {string}
 */
function theStartersJobObjectScript(starter) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    'public static class MoleOfficeJobList {',
    '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern IntPtr OpenJobObjectW(uint dwDesiredAccess, bool bInheritHandle, string lpName);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool QueryInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength, IntPtr lpReturnLength);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool CloseHandle(IntPtr hObject);',
    '',
    '  public static string Pids(string name) {',
    `    IntPtr job = OpenJobObjectW(${String(JOB_OBJECT_QUERY)}, false, name);`,
    '    if (job == IntPtr.Zero) {',
    '      int error = Marshal.GetLastWin32Error();',
    '      if (error == 2) return "{\\"job\\":\\"missing\\"}";',
    '      if (error == 5) return "{\\"job\\":\\"refused\\"}";',
    '      return "{\\"job\\":\\"failed\\",\\"error\\":" + error + "}";',
    '    }',
    // JOBOBJECT_BASIC_PROCESS_ID_LIST (class 3): two counts of four bytes, then one pid in each pointer-sized slot.
    '    int size = 8 + 4096 * IntPtr.Size;',
    '    IntPtr list = Marshal.AllocHGlobal(size);',
    '    try {',
    '      if (!QueryInformationJobObject(job, 3, list, (uint)size, IntPtr.Zero)) {',
    '        return "{\\"job\\":\\"failed\\",\\"error\\":" + Marshal.GetLastWin32Error() + "}";',
    '      }',
    '      int count = Marshal.ReadInt32(list, 4);',
    '      string pids = "";',
    '      for (int i = 0; i < count; i++) {',
    '        pids += (i == 0 ? "" : ",") + Marshal.ReadIntPtr(list, 8 + i * IntPtr.Size).ToInt64();',
    '      }',
    '      return "{\\"job\\":\\"there\\",\\"pids\\":[" + pids + "]}";',
    '    }',
    '    finally {',
    '      Marshal.FreeHGlobal(list);',
    '      CloseHandle(job);',
    '    }',
    '  }',
    '}',
    "'@",
    '',
    `$job = [MoleOfficeJobList]::Pids('${theJobObjectOf(starter)}')`,
    'Write-Output $job',
    `if ($job.StartsWith('{"job":"there"')) {`,
    `  $rows = @(Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = ${String(starter)}" | ForEach-Object {`,
    '    [pscustomobject]@{',
    '      ProcessId = [int64]$_.ProcessId',
    '      ParentProcessId = [int64]$_.ParentProcessId',
    '      CreationDate = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }',
    '      Name = $_.Name',
    '      CommandLine = $_.CommandLine',
    '    }',
    '  })',
    '  Write-Output (ConvertTo-Json -InputObject $rows -Compress -Depth 2)',
    '}',
  ].join('\n')
}

/**
 * A message that ends as a sentence, so that a second sentence can follow it.
 * @param {string} message
 * @returns {string}
 */
function asASentence(message) {
  return /[.!?]$/u.test(message) ? message : `${message}.`
}

/**
 * The starter's children that its Job Object holds, as the script answered. Throws on every answer that does not say
 * so, in a sentence the caller hands on as the reason.
 *
 * @param {import('../process-reader.mjs').WhatACommandDid} did
 * @param {number} starter
 * @returns {import('./the-system.mjs').AProgramAStarterLeft[]}
 */
function theChildrenInTheJobObject(did, starter) {
  if (!did.ran) throw new Error(asASentence(did.reason))
  if (did.status !== 0) {
    const onTheErrorStream = did.stderr.trim()
    throw new Error(asASentence(onTheErrorStream === '' ? `powershell.exe exited ${String(did.status)}` : onTheErrorStream))
  }
  const [first, second] = did.stdout.split(/\r?\n/u).filter((line) => line.trim() !== '')
  /** @type {{ job?: unknown, pids?: unknown, error?: unknown }} */
  let job
  /** @type {unknown} */
  let children = undefined
  try {
    job = JSON.parse(first ?? '')
    if (second !== undefined) children = JSON.parse(second)
  } catch {
    throw new Error('The answer was not JSON.')
  }
  if (job.job === 'missing') return []
  if (job.job === 'refused') throw new Error('Windows refused access to it.')
  if (job.job === 'failed') throw new Error(`It could not be read (Windows error ${String(job.error)}).`)
  if (job.job !== 'there' || !Array.isArray(job.pids)) throw new Error(`The answer was ${JSON.stringify(job)}, which this reader does not know.`)
  if (!Array.isArray(children)) throw new Error("The answer held no list of the starter's children, so it is not a list of rows.")
  const held = new Set(job.pids)
  /** @type {import('./the-system.mjs').AProgramAStarterLeft[]} */
  const programs = []
  for (const child of /** @type {{ ProcessId?: unknown, ParentProcessId?: unknown, CreationDate?: unknown, Name?: unknown, CommandLine?: unknown }[]} */ (children)) {
    if (child.ParentProcessId !== starter) {
      throw new Error(`The answer held process ${String(child.ProcessId)}, whose parent is ${String(child.ParentProcessId)}, not ${String(starter)}.`)
    }
    if (!held.has(child.ProcessId)) continue
    if (typeof child.CreationDate !== 'number' || !Number.isFinite(child.CreationDate)) {
      throw new Error(`Process ${String(child.ProcessId)} is in it with no start, so it cannot be told from a program started later.`)
    }
    const command = typeof child.CommandLine === 'string' ? child.CommandLine : `[${typeof child.Name === 'string' ? child.Name : ''}]`
    programs.push({ pid: /** @type {number} */ (child.ProcessId), ppid: starter, command, startedAt: new Date(child.CreationDate) })
  }
  return programs
}

/**
 * WHETHER A PROGRAM IN A STARTER'S JOB OBJECT IS THE ONE THAT STARTER STARTED, by when each started: the program started
 * no more than a second before the starter's recorded start. A starter's start is recorded in whole seconds, so a
 * program it started in the same second may read up to a second before it. A child that started earlier still is not
 * the one the starter started. The ledger and the worker both ask this.
 *
 * @param {number} programStartedMs
 * @param {number} starterStartedMs the starter's recorded start, read from its stamp
 * @returns {boolean}
 */
export function startedByThatStarter(programStartedMs, starterStartedMs) {
  return programStartedMs >= starterStartedMs - 1000
}

/**
 * The group number the starter wrote into the variable, or null when the text is not one.
 * @param {string} written
 * @returns {number | null}
 */
function theGroupNumberIn(written) {
  const group = Number(written)
  return /^[1-9][0-9]*$/u.test(written) && Number.isSafeInteger(group) ? group : null
}

/**
 * The group this program was told by the starter's variable, before Windows is asked whether it is so.
 * READ, NOT REMOVED: the stop listener removes it when it reads it.
 * @returns {{ group: number } | { unknown: string }}
 */
function theGroupThisProgramWasTold() {
  const written = process.env[THE_GROUP_VARIABLE]
  if (written === undefined) return { unknown: THE_TOLD_GROUP_IS_UNKNOWN.notTold() }
  const group = theGroupNumberIn(written)
  if (group === null) return { unknown: THE_TOLD_GROUP_IS_UNKNOWN.notAGroupNumber(written) }
  return { group }
}

/**
 * Whether this program was started in the group it was told, from what Windows said of that group's Job Object.
 * @param {number} group
 * @param {{ holds: true, marked: unknown } | { holds: false, why: string } | { unknown: string }} holding
 * @returns {{ group: number } | { unknown: string }}
 */
function whatTheHoldingSaysOfThisProgram(group, holding) {
  if ('unknown' in holding) return { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.cannotBeTold(group, holding.unknown) }
  if (!holding.holds) return { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.notStartedInIt(group, holding.why) }
  if (holding.marked === false) return { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.notMarked(group) }
  if (holding.marked !== true) return { unknown: THE_TOLD_GROUP_IS_NOT_BELIEVED.markUnread(group) }
  return { group }
}

/**
 * THE GROUP OF A PROGRAM READ FROM OUTSIDE IT: its parent's number, believed only when Windows answers that the Job
 * Object of that number holds it. The starter names its Job Object after its own number and starts the program as its
 * child, and Windows keeps a process's parent number after the parent has ended. A parent's number alone proves
 * nothing, because another program may have started this one. So Windows is asked, by the way that waits for
 * PowerShell without holding the thread. A parent number that is not a whole number above 0 names no group, and
 * Windows is not asked.
 *
 * `mole-office stop` reads the terminal holder's group this way before it ends that group.
 *
 * @param {import('./the-system.mjs').JobObjects} jobObjects
 * @param {number} pid the program
 * @param {number} parent its parent's number, as the process reader read it
 * @returns {Promise<{ noParent: true } | { group: number, holds: true } | { group: number, holds: false, why: string } | { group: number, unknown: string }>}
 */
export async function readTheGroupItsParentNames(jobObjects, pid, parent) {
  if (!Number.isSafeInteger(parent) || parent <= 0) return { noParent: true }
  const holding = await jobObjects.readHolds(parent, pid)
  if ('unknown' in holding) return { group: parent, unknown: holding.unknown }
  return holding.holds ? { group: parent, holds: true } : { group: parent, holds: false, why: holding.why }
}

/**
 * Throws when a starter's number is not a process number, so its Job Object is not asked about.
 * @param {number} starter
 */
function theStarterCanBeAsked(starter) {
  if (!Number.isSafeInteger(starter) || starter <= 0) throw new Error(`Process number ${String(starter)} is not a whole number above 0.`)
}

/**
 * Why a starter's Job Object was not read, in a sentence.
 * @param {number} starter
 * @param {unknown} err
 * @returns {{ read: false, reason: string }}
 */
function theJobObjectWasNotRead(starter, err) {
  return { read: false, reason: `The Job Object ${theJobObjectOf(starter)} was not read. ${asASentence(err instanceof Error ? err.message : String(err))}` }
}

/**
 * What a program says when its group variable is not a group number, so it listens for no stop request.
 *
 * @param {string} written the variable's value as it was written
 */
export function theGroupVariableIsNotAGroupNumber(written) {
  return `${THE_GROUP_VARIABLE} is ${JSON.stringify(written)}, which is not a group number, so this program listens for no stop request.`
}

/**
 * THE WINDOWS GROUP SIGNAL.
 *
 * `signal(group, 0)` asks whether the Job Object holds a process, and `signal(group, 'SIGKILL')`
 * ends every process in it. No such Job Object, or one holding nothing, throws ESRCH unless the
 * group's starter is still running; a refusal throws EPERM, as `process.kill` does for a process
 * group. A failure to look carries no code at all, so no caller reads it as the group being gone.
 *
 * There is no gentle stop (`gentleStop` is null), and a start goes through the starter. A clean
 * stop is a stop request on the group's pipe: `askToStop` writes it, and `listenForAStopRequest`
 * hears it.
 *
 * @param {WindowsCommands} [commands] the real PowerShell unless a test hands in its own
 * @param {(group: number) => string} [theStopAddressOf] the group's pipe unless a test on Linux hands in a socket file
 * @param {(way: AWayToStartTheHelper) => import('node:child_process').ChildProcess} [start] how the pipe's helper is
 *   started, unless a test on Linux hands in a stand-in
 * @returns {Groups}
 */
export function windowsGroups(commands = theRealWindowsCommands(), theStopAddressOf = theStopPipeOf, start = startTheHelper) {
  /** @type {{ group: number } | { unknown: string } | undefined} */
  let startedIn
  /**
   * ONE LISTENER IN A PROGRAM. The first listen reads the starter's variable and removes it, so a later listen cannot
   * read it, and takes the stop over instead. It holds the current onStop and say, the helper or null, and the sentence
   * that said why nothing listens, or null.
   * @type {TheStopListener | null}
   */
  let theListener = null
  return {
    gentleStop: null,
    howToStartInItsOwnGroup: howToStartInAJobObject,
    theProgramToStart: theProgramToStartInAJobObject,
    askToStop(group) {
      if (!Number.isSafeInteger(group) || group <= 0) {
        return Promise.reject(new Error(A_REFUSED_STOP_REQUEST.notAGroupNumber(group)))
      }
      const address = theStopAddressOf(group)
      return new Promise((asked, refused) => {
        const pipe = createConnection(address)
        let heard = ''
        let over = false
        /**
         * @param {string | null} why null when the program answered that it is stopping
         * @param {boolean} [notThere] whether nothing was at the address: the office makes its pipe last in its start
         */
        const end = (why, notThere = false) => {
          if (over) return
          over = true
          clearTimeout(clock)
          pipe.destroy()
          // No code goes with the refusal, so no caller reads it as ESRCH, the group being gone. A pipe that is not
          // there yet is marked, so that `mole-office stop` can ask again while the office is still starting.
          if (why === null) asked()
          else {
            const refusal = new Error(`${why}${A_REFUSED_STOP_REQUEST.notAsked(group)}`)
            refused(notThere ? Object.assign(refusal, { thePipeIsNotThere: true }) : refusal)
          }
        }
        const clock = setTimeout(
          () => end(A_REFUSED_STOP_REQUEST.nothingAnswered(address)),
          A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS,
        )
        pipe.setEncoding('utf8')
        pipe.on('connect', () => pipe.write(`${THE_STOP_REQUEST}\n`))
        pipe.on('data', (part) => {
          heard += part
          const at = heard.indexOf('\n')
          if (at === -1) return
          const answer = heard.slice(0, at)
          end(answer === THE_STOP_ANSWER ? null : A_REFUSED_STOP_REQUEST.answeredOtherwise(address, answer))
        })
        pipe.on('end', () => end(A_REFUSED_STOP_REQUEST.closedThePipe(address)))
        pipe.on('error', (error) =>
          end(`${A_REFUSED_STOP_REQUEST.couldNotReach(address)}: ${error.message}.`, /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'),
        )
      })
    },
    listenForAStopRequest(onStop, say) {
      // A LATER LISTEN IN THE SAME PROGRAM takes the stop over, and reads nothing from the environment.
      if (theListener !== null) {
        theListener.onStop = onStop
        theListener.say = say
        if (theListener.whyNothingListens !== null) {
          say(theListener.whyNothingListens)
          return null
        }
        return theListener.helper
      }
      // READ AND REMOVED AT ONCE, so nothing this program starts is handed its number.
      // A LATER LISTEN READS NOTHING: this one removes the variable, and the listener takes the stop over instead.
      /** @type {TheStopListener} */
      const listener = { onStop, say, helper: null, whyNothingListens: null }
      theListener = listener
      const written = process.env[THE_GROUP_VARIABLE]
      delete process.env[THE_GROUP_VARIABLE]
      if (written === undefined) {
        listener.whyNothingListens = THE_STOP_LISTENER_SAYS.notToldItsGroup()
        listener.say(listener.whyNothingListens)
        return null
      }
      const group = theGroupNumberIn(written)
      if (group === null) {
        listener.whyNothingListens = theGroupVariableIsNotAGroupNumber(written)
        listener.say(listener.whyNothingListens)
        return null
      }
      const address = theStopAddressOf(group)
      let listening = false
      let stopping = false
      let ended = false
      let errors = ''
      let heard = ''
      // Said once, however the helper ends: the program runs on, and this sentence is what its log says of it.
      const sayItEnded = (/** @type {string} */ how) => {
        if (ended) return
        ended = true
        const sentence = THE_STOP_LISTENER_SAYS.runsOnWithoutAListener(address, listening, how)
        listener.whyNothingListens = sentence
        listener.say(sentence)
      }
      /** @type {import('node:child_process').ChildProcess} */
      let helper
      try {
        helper = start(theStopHelpersStart(address, process.pid))
      } catch (error) {
        sayItEnded(THE_STOP_LISTENER_SAYS.couldNotBeStarted(error instanceof Error ? error.message : String(error)))
        return null
      }
      listener.helper = helper
      helper.on('error', (error) => sayItEnded(THE_STOP_LISTENER_SAYS.couldNotBeStarted(error.message)))
      helper.on('close', (code, signal) => {
        const said = errors.trim().replace(/\s+/gu, ' ')
        sayItEnded(THE_STOP_LISTENER_SAYS.ended(listening, code, signal, said))
      })
      helper.stderr?.setEncoding('utf8')
      helper.stderr?.on('data', (/** @type {string} */ part) => {
        errors += part
      })
      helper.stdout?.setEncoding('utf8')
      helper.stdout?.on('data', (/** @type {string} */ part) => {
        heard += part
        for (let at = heard.indexOf('\n'); at !== -1; at = heard.indexOf('\n')) {
          const line = heard.slice(0, at)
          heard = heard.slice(at + 1)
          if (line === THE_HELPER_LISTENS) listening = true
          else if (line !== THE_STOP_REQUEST) {
            listener.say(THE_STOP_LISTENER_SAYS.wroteAnOddLine(address, line))
          } else if (!stopping) {
            // The helper writes every stop request it answers, and the stop is begun once.
            stopping = true
            listener.onStop()
          }
        }
      })
      // The helper alone never keeps this program running: it ends when the program ends.
      helper.unref()
      for (const stream of [helper.stdout, helper.stderr]) /** @type {import('node:net').Socket | null} */ (stream)?.unref()
      return helper
    },
    jobObjects: {
      theOneThisProgramWasStartedIn() {
        if (startedIn !== undefined) return startedIn
        const written = theGroupThisProgramWasTold()
        startedIn = 'unknown' in written ? written : whatTheHoldingSaysOfThisProgram(written.group, whetherTheJobObjectHolds(commands, written.group, process.pid, true))
        return startedIn
      },
      async readTheOneThisProgramWasStartedIn() {
        if (startedIn !== undefined) return startedIn
        const written = theGroupThisProgramWasTold()
        const answer = 'unknown' in written ? written : whatTheHoldingSaysOfThisProgram(written.group, await readWhetherTheJobObjectHolds(commands, written.group, process.pid, true))
        // Windows is asked once: an answer that came while this one was asked is the one kept.
        startedIn ??= answer
        return startedIn
      },
      holds(group, pid) {
        const holding = whetherTheJobObjectHolds(commands, group, pid, false)
        return 'holds' in holding && holding.holds ? { holds: true } : holding
      },
      async readHolds(group, pid) {
        const holding = await readWhetherTheJobObjectHolds(commands, group, pid, false)
        return 'holds' in holding && holding.holds ? { holds: true } : holding
      },
      programsOfAStarter(starter) {
        try {
          theStarterCanBeAsked(starter)
          return { read: true, programs: theChildrenInTheJobObject(commands.powershell(theStartersJobObjectScript(starter)), starter) }
        } catch (err) {
          return theJobObjectWasNotRead(starter, err)
        }
      },
      async readProgramsOfAStarter(starter) {
        try {
          theStarterCanBeAsked(starter)
          return { read: true, programs: theChildrenInTheJobObject(await commands.startPowerShell(theStartersJobObjectScript(starter)), starter) }
        } catch (err) {
          return theJobObjectWasNotRead(starter, err)
        }
      },
    },
    signal(group, signal) {
      if (!Number.isSafeInteger(group) || group <= 0) {
        throw new Error(`Group number ${String(group)} is not a whole number above 0.`)
      }
      if (signal !== 0 && signal !== 'SIGKILL') {
        throw new Error(theSignalIsRefusedWords(signal, group))
      }

      const job = theJobObjectOf(group)
      // A row the reader kept for this run of the thread may be about a process this ends (./windows-processes.mjs).
      if (signal === 'SIGKILL') aGroupIsBeingEnded()
      const said = theAnswer(commands.powershell(theGroupScript(group, signal === 'SIGKILL')), job)
      const word = said.job

      if (word === 'missing') {
        throw Object.assign(new Error(`No Job Object named ${job} exists.`), { code: 'ESRCH' })
      }
      if (word === 'refused') {
        throw Object.assign(new Error(`Windows refused access to the Job Object ${job}.`), { code: 'EPERM' })
      }
      if (word === 'there') {
        const active = said.active
        if (typeof active !== 'number' || !Number.isFinite(active)) {
          throw new Error(`The answer about the Job Object ${job} did not say how many processes it holds.`)
        }
        if (active === 0) {
          throw Object.assign(new Error(`The Job Object ${job} holds no process.`), { code: 'ESRCH' })
        }
        if (signal === 0) return
        throw new Error(
          `The answer about the Job Object ${job} said it holds ${String(active)} processes, and not that they were ended.`,
        )
      }
      if (word === 'starting') {
        if (signal === 0) return
        throw new Error(`The answer about the Job Object ${job} said its group is still starting, which SIGKILL never answers.`)
      }
      if (word === 'ended') {
        if (signal === 'SIGKILL') return
        throw new Error(`The answer about the Job Object ${job} said it ended, which signal 0 never asks for.`)
      }
      if (word === 'failed') {
        throw new Error(`The Job Object ${job} could not be used (Windows error ${String(said.error)}).`)
      }
      throw new Error(`The answer about the Job Object ${job} said ${String(word)}, which this reader does not know.`)
    },
  }
}
