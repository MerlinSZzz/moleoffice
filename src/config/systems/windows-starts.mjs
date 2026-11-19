// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE START IN A GROUP ON WINDOWS: A STARTER THAT MAKES A JOB OBJECT AND STARTS THE PROGRAM IN IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * On Linux and the Mac a program is started as the leader of a new process group, and a stop finds
 * the group by its number. Windows has no process groups. Its group is a Job Object, and a stop
 * finds the Job Object by its name (./windows-groups.mjs). So a start on Windows must make that Job
 * Object, under that name, before the program runs.
 *
 * Node cannot make a Job Object. So Node starts a starter instead of the program: the system's own
 * `powershell.exe`, by its whole path (`thePowerShellProgram` in ./windows-commands.mjs), with one
 * fixed script. The starter
 *   1. refuses when the Job Object it runs in does not let a program leave it;
 *   2. makes a Job Object named `Local\mole-office-group-<its own process number>`;
 *   3. starts the program suspended, outside the Job Object it runs in, with the same flags Node uses
 *      for a detached start, the same standard handles and the same command line;
 *   4. puts the program in the new Job Object, and only then lets it run, so the program is in it
 *      from its first instruction;
 *   5. waits for the program, and exits with the program's exit code.
 * Node's child is the starter, so the group number every caller records (the child's pid) is the
 * starter's number, and that is the number in the Job Object's name. Everything the program starts
 * is in the Job Object too, so ending the Job Object ends the program and all of it.
 *
 * WHY THE STARTER IS NOT DETACHED. A PowerShell that Node starts detached, with no console, exits 0
 * at once and runs nothing (Windows 11, round W8). So Node starts the starter hidden and not
 * detached. Every child Node starts that way is in a Job Object Node keeps, which ends them when
 * Node ends. That Job Object lets a program leave it, and the program leaves it at its start. So
 * the starter ends when its caller ends, and the program goes on in its own Job Object.
 *
 * WHAT TRAVELS WHERE. The script is the same for every start. The program and its command line
 * travel in two environment variables, which the starter reads and removes before the program
 * starts, so the program never sees them. They do not travel inside the encoded script, because
 * encoding them twice would make the command line seven times as long, and a prompt of a few
 * thousand characters would pass Windows's limit of 32,767. The command line is built here by the
 * rules Node's own start uses (libuv's `quote_cmd_arg`), so the program is handed the same words.
 *
 * THE PROGRAM IS HANDED ITS GROUP'S NUMBER in one more variable, which the starter sets to its own
 * process number before the program starts. Node cannot know that number before the start, and the
 * program cannot see it: its parent may be cmd.exe or tsx and not the starter. A program that
 * listens for a stop request on its group's pipe reads the variable and removes it
 * (./windows-groups.mjs). A start on Linux or the Mac adds no variable.
 *
 * A REFUSAL IS SAID IN WORDS. When the program could not leave the Job Object the starter runs in, or
 * the starter cannot make its Job Object, start the program, or put the program in its Job Object, it
 * writes one sentence to the program's error stream and exits 125. A program it cannot put there is
 * ended before it runs. A program may exit 125 itself, so the sentence, not the code, says it was the
 * starter. A program that cannot leave is never started without leaving: there is one start.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS DIFFERENT FROM A START ON LINUX
 * ---------------------------------------------------------------------------------------------
 *
 *   - The pid a caller records is the starter's, not the program's. The starter lives as long as
 *     the program while its caller runs, so "is it still running" reads the same there. Once the
 *     caller has ended, the starter has too, and only the Job Object's name finds the program.
 *   - A program ended with its Job Object exits with code 1, where Linux reports the signal.
 *   - The program is named by its whole path, or the start is refused in words. Node searches for
 *     a program itself; the starter does not.
 *   - The program's environment is the starter's, which changes in two places: PowerShell adds its
 *     own folders to PSModulePath, and the starter adds the group's number.
 *   - The Job Object's handle is inherited by the program, and by everything it starts with
 *     inherited handles, as Node does. That keeps the name while any of them runs after the
 *     starter has gone. A process started without inherited handles does not keep it, and once
 *     no process holds the name a stop finds no group, even if that process still runs.
 *   - A program left running by an earlier start keeps its Job Object's name. If Windows gives a
 *     later starter the same process number, that starter refuses, because the name is taken. A
 *     starter whose caller has ended has given its number back, so this can happen while the
 *     program runs.
 *   - The program leaves the Job Object the starter runs in, and each one above it that lets a
 *     program leave. One higher up that does not keeps it, inside its own, and ends it when it ends.
 *   - For a few microseconds, between its start and its putting in its Job Object, the program is
 *     suspended and in no Job Object of Mole Office's. A starter ended in that time leaves it so.
 *   - The starter compiles its C# each time it starts, which takes a second or two before the
 *     program starts. A stop in that time finds no Job Object yet; ./windows-groups.mjs reads the
 *     starter's command line for this file's mark, and ends the starter instead.
 *
 * THIS FORM RAN ON A WINDOWS 11 MACHINE in wave 13t, round W8. One second after the start returned,
 * the starter had ended, the server still ran, and its Job Object held it. It is read on Linux, in
 * tests/the-start-in-a-group-on-windows.test.ts.
 */

import { win32 } from 'node:path'

import { theInstallsNode } from '../settings.mjs'
import { theEncodedArguments, thePowerShellProgram } from './windows-commands.mjs'

/** The start of every Job Object name a start makes. The stop uses it too (./windows-groups.mjs). */
export const JOB_OBJECT_NAMES_BEGIN = 'Local\\mole-office-group-'

/** The exit code of a starter that refused, with its sentence on the error stream. */
export const THE_STARTER_REFUSED = 125

/** The environment variable that carries the program's whole path to the starter. */
export const THE_PROGRAM_VARIABLE = 'MOLE_GROUP_STARTER_PROGRAM'

/** The environment variable that carries the program's command line to the starter. */
export const THE_LINE_VARIABLE = 'MOLE_GROUP_STARTER_LINE'

/**
 * The environment variable that carries the group's number from the starter to the program it starts. The program
 * that listens for a stop request reads it there (./windows-groups.mjs).
 */
export const THE_GROUP_VARIABLE = 'MOLE_GROUP_NUMBER'

/** The starter script's first line. Its encoding is the mark a stop looks for on a starter's command line. */
const THE_FIRST_LINE = "# Mole Office's starter: one program in its own Job Object.\n"

/**
 * THE MARK ON EVERY STARTER'S COMMAND LINE. The script is encoded from its first character, and base64
 * turns each three characters of UTF-16 (six bytes) into eight characters that do not depend on what
 * follows. So the encoding of the first line's whole groups of three is how every starter's encoded
 * script begins.
 */
export const THE_STARTERS_MARK = Buffer.from(
  THE_FIRST_LINE.slice(0, THE_FIRST_LINE.length - (THE_FIRST_LINE.length % 3)),
  'utf16le',
).toString('base64')

/**
 * One word as Node hands it to Windows: unchanged when it has no space, tab or double quote; in
 * double quotes when it has no double quote or backslash; otherwise in double quotes, with each
 * double quote and the backslashes before it escaped, and the backslashes at its end doubled.
 * These are libuv's rules, which the Microsoft C runtime reads back into the same word.
 * @param {string} word
 * @returns {string}
 */
function quoted(word) {
  if (word === '') return '""'
  if (!/[ \t"]/u.test(word)) return word
  if (!/["\\]/u.test(word)) return `"${word}"`
  let line = '"'
  let backslashes = 0
  for (const character of word) {
    if (character === '\\') {
      backslashes += 1
      continue
    }
    line += character === '"' ? `${'\\'.repeat(backslashes * 2 + 1)}"` : `${'\\'.repeat(backslashes)}${character}`
    backslashes = 0
  }
  return `${line}${'\\'.repeat(backslashes * 2)}"`
}

/**
 * The command line Node would hand Windows for these words. With `verbatim`, as Node does for
 * `windowsVerbatimArguments`, the words are joined by spaces and nothing is quoted.
 * @param {readonly string[]} words the program first, then its arguments
 * @param {boolean} verbatim
 * @returns {string}
 */
export function theWindowsCommandLine(words, verbatim) {
  return verbatim ? words.join(' ') : words.map(quoted).join(' ')
}

/** DETACHED_PROCESS and CREATE_NEW_PROCESS_GROUP: the flags Node gives a detached start. */
const NODES_DETACHED_FLAGS = 0x00000008 | 0x00000200

/**
 * CREATE_SUSPENDED, so the program runs nothing before it is in its Job Object, and CREATE_BREAKAWAY_FROM_JOB, so it
 * leaves the Job Object the starter runs in.
 */
const SUSPENDED_AND_LEAVING = 0x00000004 | 0x01000000

/** JOB_OBJECT_LIMIT_BREAKAWAY_OK: a Job Object with it lets a program started in it leave it. */
const LETS_A_PROGRAM_LEAVE = 0x00000800

/** JobObjectBasicLimitInformation, the class QueryInformationJobObject answers the limits in. */
const THE_LIMITS = 2

/** STARTF_USESTDHANDLES: the program is handed the starter's three standard handles. */
const STARTF_USESTDHANDLES = 0x00000100

/**
 * THE STARTER'S SCRIPT. Every call, and every Windows error, is in the C#, so no PowerShell call can come
 * between a call and the reading of its error.
 * @returns {string}
 */
export function theStarterScript() {
  return [
    THE_FIRST_LINE.trimEnd(),
    // HIDDEN, POWERSHELL WRITES ITS PROGRESS to the error stream it hands the program, which is the server's log.
    "$ProgressPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Stop'",
    'try {',
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.IO;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    '',
    'public static class MoleOfficeStarter {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct SecurityAttributes {',
    '    public int nLength;',
    '    public IntPtr lpSecurityDescriptor;',
    '    public int bInheritHandle;',
    '  }',
    '',
    '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    '  public struct StartupInfo {',
    '    public int cb;',
    '    public string lpReserved;',
    '    public string lpDesktop;',
    '    public string lpTitle;',
    '    public int dwX;',
    '    public int dwY;',
    '    public int dwXSize;',
    '    public int dwYSize;',
    '    public int dwXCountChars;',
    '    public int dwYCountChars;',
    '    public int dwFillAttribute;',
    '    public int dwFlags;',
    '    public short wShowWindow;',
    '    public short cbReserved2;',
    '    public IntPtr lpReserved2;',
    '    public IntPtr hStdInput;',
    '    public IntPtr hStdOutput;',
    '    public IntPtr hStdError;',
    '  }',
    '',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct BasicLimitInformation {',
    '    public long PerProcessUserTimeLimit;',
    '    public long PerJobUserTimeLimit;',
    '    public uint LimitFlags;',
    '    public UIntPtr MinimumWorkingSetSize;',
    '    public UIntPtr MaximumWorkingSetSize;',
    '    public uint ActiveProcessLimit;',
    '    public UIntPtr Affinity;',
    '    public uint PriorityClass;',
    '    public uint SchedulingClass;',
    '  }',
    '',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct ProcessInformation {',
    '    public IntPtr hProcess;',
    '    public IntPtr hThread;',
    '    public int dwProcessId;',
    '    public int dwThreadId;',
    '  }',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern IntPtr CreateJobObjectW(ref SecurityAttributes lpJobAttributes, string lpName);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool IsProcessInJob(IntPtr ProcessHandle, IntPtr JobHandle, out bool Result);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool QueryInformationJobObject(IntPtr hJob, int JobObjectInformationClass, out BasicLimitInformation lpJobObjectInformation, uint cbJobObjectInformationLength, IntPtr lpReturnLength);',
    '',
    '  [DllImport("kernel32.dll")]',
    '  public static extern IntPtr GetCurrentProcess();',
    '',
    '  [DllImport("kernel32.dll")]',
    '  public static extern uint GetCurrentProcessId();',
    '',
    '  [DllImport("kernel32.dll")]',
    '  public static extern IntPtr GetStdHandle(int nStdHandle);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
    '  public static extern bool CreateProcessW(string lpApplicationName, StringBuilder lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref StartupInfo lpStartupInfo, out ProcessInformation lpProcessInformation);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern uint ResumeThread(IntPtr hThread);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);',
    '',
    '  [DllImport("kernel32.dll", SetLastError = true)]',
    '  public static extern bool CloseHandle(IntPtr hObject);',
    '',
    // One sentence on the error stream, as UTF-8 bytes written straight to it: the starter has no console whose
    // encoding could be set.
    '  static int Refuse(string words) {',
    '    byte[] bytes = Encoding.UTF8.GetBytes(words + "\\n");',
    '    using (Stream errors = Console.OpenStandardError()) { errors.Write(bytes, 0, bytes.Length); }',
    `    return ${String(THE_STARTER_REFUSED)};`,
    '  }',
    '',
    // The Windows error is read before the program is ended, which would replace it.
    '  static int EndBeforeItRuns(ProcessInformation started, string words, int error) {',
    `    bool ended = TerminateProcess(started.hProcess, ${String(THE_STARTER_REFUSED)});`,
    '    string after = ended ? ", so it was ended before it ran." : ", and it could not be ended (Windows error " + Marshal.GetLastWin32Error() + "): process " + started.dwProcessId + " is left, suspended.";',
    '    CloseHandle(started.hThread);',
    '    CloseHandle(started.hProcess);',
    '    return Refuse(words + " (Windows error " + error + ")" + after);',
    '  }',
    '',
    '  public static int Start() {',
    `    string program = Environment.GetEnvironmentVariable(${JSON.stringify(THE_PROGRAM_VARIABLE)});`,
    `    string line = Environment.GetEnvironmentVariable(${JSON.stringify(THE_LINE_VARIABLE)});`,
    `    Environment.SetEnvironmentVariable(${JSON.stringify(THE_PROGRAM_VARIABLE)}, null);`,
    `    Environment.SetEnvironmentVariable(${JSON.stringify(THE_LINE_VARIABLE)}, null);`,
    '    if (program == null || line == null) return Refuse("The starter was not given a program to start, so nothing was started.");',
    // ASKED BEFORE ANYTHING IS MADE, so a refusal leaves nothing behind. The program is never started without leaving.
    '    bool inAJob;',
    '    if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out inAJob)) return Refuse("Whether the starter runs in a Job Object could not be read (Windows error " + Marshal.GetLastWin32Error() + "), so " + program + " was not started.");',
    '    if (inAJob) {',
    '      BasicLimitInformation limits;',
    `      if (!QueryInformationJobObject(IntPtr.Zero, ${String(THE_LIMITS)}, out limits, (uint)Marshal.SizeOf(typeof(BasicLimitInformation)), IntPtr.Zero)) return Refuse("Whether the Job Object the starter runs in lets a program leave it could not be read (Windows error " + Marshal.GetLastWin32Error() + "), so " + program + " was not started.");`,
    `      if ((limits.LimitFlags & ${String(LETS_A_PROGRAM_LEAVE)}) == 0) return Refuse("The starter runs in a Job Object that does not let a program leave it, so " + program + " was not started. Started there, it would end whenever that Job Object is ended. Start it from a program that does not run in such a Job Object.");`,
    '    }',
    `    string name = ${JSON.stringify(JOB_OBJECT_NAMES_BEGIN)} + GetCurrentProcessId();`,
    '',
    '    SecurityAttributes inherited = new SecurityAttributes();',
    '    inherited.nLength = Marshal.SizeOf(typeof(SecurityAttributes));',
    '    inherited.bInheritHandle = 1;',
    '    IntPtr job = CreateJobObjectW(ref inherited, name);',
    '    int error = Marshal.GetLastWin32Error();',
    '    if (job == IntPtr.Zero) return Refuse("Windows did not make the Job Object " + name + " (Windows error " + error + "), so " + program + " was not started.");',
    '    if (error == 183) return Refuse("A Job Object named " + name + " already exists, kept by a program an earlier start of this number left running, so " + program + " was not started.");',
    `    Environment.SetEnvironmentVariable(${JSON.stringify(THE_GROUP_VARIABLE)}, GetCurrentProcessId().ToString());`,
    '',
    '    StartupInfo startup = new StartupInfo();',
    '    startup.cb = Marshal.SizeOf(typeof(StartupInfo));',
    `    startup.dwFlags = ${String(STARTF_USESTDHANDLES)};`,
    '    startup.hStdInput = GetStdHandle(-10);',
    '    startup.hStdOutput = GetStdHandle(-11);',
    '    startup.hStdError = GetStdHandle(-12);',
    '    ProcessInformation started;',
    `    if (!CreateProcessW(program, new StringBuilder(line), IntPtr.Zero, IntPtr.Zero, true, ${String(SUSPENDED_AND_LEAVING | NODES_DETACHED_FLAGS)}, IntPtr.Zero, null, ref startup, out started)) return Refuse(program + " could not be started (Windows error " + Marshal.GetLastWin32Error() + ").");`,
    '    if (!AssignProcessToJobObject(job, started.hProcess)) return EndBeforeItRuns(started, program + " could not be put in the Job Object " + name, Marshal.GetLastWin32Error());',
    '    if (ResumeThread(started.hThread) == 0xFFFFFFFF) return EndBeforeItRuns(started, program + " was put in the Job Object " + name + " and could not be let run", Marshal.GetLastWin32Error());',
    '    CloseHandle(started.hThread);',
    '    if (WaitForSingleObject(started.hProcess, 0xFFFFFFFF) != 0) return Refuse(program + " was started in the Job Object " + name + ", and the starter could not wait for it (Windows error " + Marshal.GetLastWin32Error() + ").");',
    '    uint code;',
    '    if (!GetExitCodeProcess(started.hProcess, out code)) return Refuse(program + " ended in the Job Object " + name + ", and its exit code could not be read (Windows error " + Marshal.GetLastWin32Error() + ").");',
    '    return unchecked((int)code);',
    '  }',
    '}',
    "'@",
    '} catch {',
    '  $bytes = [System.Text.Encoding]::UTF8.GetBytes("The starter that puts a program in its own Job Object could not be compiled, so nothing was started: " + $_.Exception.Message + "`n")',
    '  $errors = [Console]::OpenStandardError()',
    '  $errors.Write($bytes, 0, $bytes.Length)',
    '  $errors.Dispose()',
    `  exit ${String(THE_STARTER_REFUSED)}`,
    '}',
    'exit ([MoleOfficeStarter]::Start())',
  ].join('\n')
}

/**
 * THE PROGRAM A START IN A JOB OBJECT NAMES, for a command its caller declares. The starter starts a program only by
 * its whole path, so the bare word `node` is the install's own Node (`theInstallsNode` in ../settings.mjs). Any other command is handed back as it
 * came, and the start refuses it in words when it is not a whole path.
 * On Windows that Node needs nothing set, so the program is all of the answer this start needs.
 *
 * @param {string} command
 * @returns {string}
 */
export function theProgramToStartInAJobObject(command) {
  return command === 'node' ? theInstallsNode().program : command
}

/**
 * HOW TO START A PROGRAM IN ITS OWN JOB OBJECT: the starter, with the program and its command line in
 * the starter's environment. A program not named by its whole path is refused in words.
 *
 * @param {import('./the-system.mjs').AWayToStart} way
 * @returns {import('./the-system.mjs').AStartInAGroup}
 */
export function howToStartInAJobObject(way) {
  if (!win32.isAbsolute(way.command)) {
    throw new Error(
      `${way.command} is not named by its whole path, and on Windows a program is started in its own Job Object only by ` +
        'its whole path. Nothing was started.',
    )
  }
  return {
    command: thePowerShellProgram(),
    args: theEncodedArguments(theStarterScript()),
    windowsVerbatimArguments: false,
    env: {
      ...(way.env ?? process.env),
      [THE_PROGRAM_VARIABLE]: way.command,
      [THE_LINE_VARIABLE]: theWindowsCommandLine([way.command, ...way.args], way.windowsVerbatimArguments),
    },
    // NOT DETACHED, AND HIDDEN: a detached PowerShell runs nothing. The program leaves the Job Object Node puts the
    // starter in, so it goes on after its caller ends.
    detached: false,
    windowsHide: true,
  }
}
