// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE PROCESS READER FOR THIS PLATFORM: ONE PROCESS BY ITS NUMBER, READ THE WAY THIS SYSTEM ALLOWS.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------------
 *
 * Several parts of Mole Office ask about one process by its number: is it running, when did it
 * begin, which process group is it in, who is its parent, what is it running. The service lock asks
 * before the server opens its database. The worker asks whether a run it started is still that run.
 * The session hook and the office ask whether a session's process is still the one that was
 * recorded. OsProbe in src/server/lib/resources.ts asks when it reports and releases processes.
 *
 * Linux answers from /proc. macOS has no /proc, and answers from `ps` and `lsof`. Until wave 13p
 * round 18 only OsProbe knew that. src/config/session-process.mjs read /proc for every other
 * caller, so on a Mac the server stopped at its start with "This system has no /proc" (plan
 * l1RSxzw-j4P7, block b-5, row 1).
 *
 * ---------------------------------------------------------------------------------------------
 * ONE CHOICE, IN ONE PLACE
 * ---------------------------------------------------------------------------------------------
 *
 * `theProcessReaderFor(platform)` is the one place a reader is chosen. `theProcessReader()` is that
 * choice for the platform this process runs on. src/config/session-process.mjs reads through it, and
 * so do the service lock, the worker and the hook, which all read through session-process.mjs.
 * `theProbeForThisPlatform` in src/server/lib/resources.ts builds its probe on the same choice, so
 * OsProbe and these callers cannot read processes in two different ways on one machine.
 *
 * Windows gets its own reader, over PowerShell's Get-CimInstance Win32_Process, in
 * src/config/systems/windows-processes.mjs. It ran on a Windows 11 machine in wave 13t, round W9. Every other platform
 * but macOS gets the Linux reader. On a system with no /proc its reads throw and say so.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A `.mjs` FILE IN `src/config`, INSIDE THE OPERATING-SYSTEM LAYER
 * ---------------------------------------------------------------------------------------------
 *
 * The session hook runs under the plain Node on the PATH, which cannot read a `.ts` file, and the
 * service lock is taken before the database opens, so neither can import lib/resources.ts. So the
 * reader is plain JavaScript that imports nothing of Mole Office but the Windows reader, which is
 * plain JavaScript too and imports nothing of this file at run time. This file is part of the
 * operating-system layer, beside lib/resources.ts: it may read /proc,
 * start `ps`, `lsof` and `getconf`, and branch on the platform.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT EACH READING ANSWERS
 * ---------------------------------------------------------------------------------------------
 *
 * Each reader of one process answers null when no process has that number, which is an absence
 * and not an error. When the reader cannot look at all (no /proc on a Linux reader, or `ps` that
 * cannot be run on a Mac), it throws. A null then would call every live process gone with nothing
 * failing.
 *
 * `processAt` answers in three ways, kept apart:
 *   - `{ here: false }`: no process has this number;
 *   - `{ here: true, unreadable }`: a process has it, and what it is could not be read;
 *   - `{ here: true, pid, ppid, pgid, state, startedAt }`: read.
 * `state` is the system's own letter (`Z` is a process that has ended and waits for its parent, on
 * both systems). The caller decides what a state means for its question.
 */

import { execFile, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'

import { windowsProcessReader } from './systems/windows-processes.mjs'

/** What a port writes, named in every refusal of a reader that cannot look. */
export const THE_PORT_OF_THIS_MODULE = 'a process reader for this system'

/**
 * WHAT WINDOWS NEEDS BEFORE MOLE OFFICE CAN READ ITS PROCESSES, said wherever a reading refuses there. The
 * reader of one Windows process is written, and it ran on a Windows 11 machine in wave 13t, round W9.
 * The Windows probe (src/server/lib/windows-probe.ts) reads one process through that reader. The rest of the
 * "Running on this machine" list does not, and a Linux probe would refuse there in these words.
 */
export const WHAT_WINDOWS_NEEDS_TO_READ_PROCESSES =
  "Windows has no /proc. Mole Office has a reader of Windows processes over PowerShell's Get-CimInstance " +
  'Win32_Process, but this list does not read through it yet.'

/**
 * WHAT A GROUP IS ON WINDOWS, said wherever a reading of one refuses there (items 3 and 6). On Linux and the Mac a
 * negative pid signals a whole process group. Windows has no process groups. The system layer starts a program there
 * in a Job Object named after the process it started (src/config/systems/windows-starts.mjs), and can ask whether
 * one still holds a process or end it at once (windows-groups.mjs). Nothing lists the processes in one yet.
 */
export const WINDOWS_HAS_NO_PROCESS_GROUPS =
  'Windows has no process groups. Mole Office starts some programs there in a Job Object instead, named after the ' +
  'process it started, and can end everything in one at once. It cannot yet list the processes in a Job Object, or ' +
  'ask them to stop.'

/**
 * Whether that system has process groups to signal: Linux and the Mac do, and Windows does not.
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {boolean}
 */
export function thereAreProcessGroups(platform = process.platform) {
  return platform !== 'win32'
}

/**
 * One process as `processAt` reads it.
 * @typedef {{ here: false }
 *   | { here: true, unreadable: string }
 *   | { here: true, unreadable?: undefined, pid: number, ppid: number, pgid: number, state: string,
 *       startedAt: Date }} ProcessAt
 */

/**
 * One process with its command line, as the walk over every process reads it.
 * @typedef {{ pid: number, command: string }} ProcessCommand
 */

/**
 * A reader of this system's processes.
 *
 * `readProcessAt` answers what `processAt` answers without holding the thread while it reads. Only the
 * Windows reader has it, because only there one reading runs another program for about a second. Where
 * it is absent, `processAt` is the reading.
 * @typedef {{
 *   platform: string,
 *   processAt: (pid: number) => ProcessAt,
 *   readProcessAt?: (pid: number) => Promise<ProcessAt>,
 *   commandLineOf: (pid: number) => string | null,
 *   nameOf: (pid: number) => string | null,
 *   executableOf: (pid: number) => string | null,
 *   parentOf: (pid: number) => number | null,
 *   startTimeOf: (pid: number) => Date | null,
 *   everyCommandLine: () => ProcessCommand[] | null,
 * }} ProcessReader
 */

// ============================================================================ Linux: /proc

/**
 * The tick rate `/proc/<pid>/stat` counts start times in, asked of `getconf CLK_TCK` once per
 * process. Node does not expose `sysconf(_SC_CLK_TCK)`. It is asked rather than written as 100,
 * because a wrong number here names the wrong process.
 * @type {number | null}
 */
let ticksPerSecond = null

/**
 * When the machine booted, from `btime` in `<table>/stat`, read once per process and table. The
 * kernel works `btime` out from the wall clock, so it moves when the clock is stepped. Reading it
 * once means two readings of one process taken by this process cannot disagree.
 * @type {Map<string, number>}
 */
const bootedAtByTable = new Map()

/** Forget the tick rate and the boot time, so the next reading asks again. For a test only. */
export function forgetTheMachineClock() {
  ticksPerSecond = null
  bootedAtByTable.clear()
}

/**
 * The tick rate, or a thrown sentence saying why there is none.
 * @returns {number}
 */
function theTickRate() {
  if (ticksPerSecond !== null) return ticksPerSecond
  const ran = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 10_000 })
  const said = (ran.stdout ?? '').trim()
  const ticks = Number(said)
  if (ran.error !== undefined || ran.status !== 0 || !Number.isInteger(ticks) || ticks < 1) {
    const why = ran.error !== undefined ? ran.error.message : ran.status !== 0 ? `it exited ${String(ran.status)}` : `it answered "${said}"`
    throw new Error(
      `the machine's clock tick could not be read from getconf CLK_TCK (${why}). /proc/<pid>/stat counts a start ` +
        'time in clock ticks, so without the tick rate there is no start time.',
    )
  }
  ticksPerSecond = ticks
  return ticks
}

/**
 * When the machine booted, in seconds, or a thrown sentence saying why that is unknown.
 * @param {string} table
 * @returns {number}
 */
function theBootTime(table) {
  const known = bootedAtByTable.get(table)
  if (known !== undefined) return known
  const line = readFileSync(`${table}/stat`, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('btime '))
  const seconds = line === undefined ? Number.NaN : Number(line.slice('btime '.length).trim())
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${table}/stat carries no readable btime line, so there is nothing to count a start time from`)
  }
  bootedAtByTable.set(table, seconds)
  return seconds
}

/**
 * THE MOMENT A PROCESS BEGAN, from field 22 of its stat line: ticks since the boot, turned into a
 * clock time with the boot time and the tick rate. This is the sum `ps -o lstart=` makes on Linux.
 * It is the only place Mole Office makes it; LinuxProbe in lib/resources.ts calls it too.
 *
 * @param {string} startTicks field 22 of `/proc/<pid>/stat`, as text
 * @param {string} [table] the process table folder, `/proc` unless a test names another
 * @returns {Date}
 */
export function whenALinuxProcessBegan(startTicks, table = '/proc') {
  return new Date((theBootTime(table) + Number(startTicks) / theTickRate()) * 1000)
}

/**
 * The fields of a stat line after the command name, which may hold spaces and brackets. So the
 * fields are counted from the last `)`. `fields[0]` is field 3, the state.
 * @param {string} stat
 * @returns {string[] | null}
 */
function statFields(stat) {
  const close = stat.lastIndexOf(')')
  if (close < 0) return null
  return stat.slice(close + 2).trim().split(/\s+/)
}

/**
 * THE LINUX READER, over `/proc` or a folder a test names.
 *
 * A read of one pid that fails answers null while the folder is there: that process has ended. When
 * the folder itself is missing, every read throws, naming the folder and the port to write.
 *
 * @param {string} [table] the process table folder, `/proc` unless a test names another
 * @returns {ProcessReader}
 */
export function linuxProcessReader(table = '/proc') {
  /** @returns {null} */
  const goneUnlessTheTableIsMissing = () => {
    if (existsSync(table)) return null
    throw new Error(
      `This system has no ${table}. ` +
        'src/config/process-reader.mjs reads each process from the process table there, which is /proc on Linux. ' +
        'Without it, Mole Office cannot tell a live process from one that has ended. ' +
        `A port writes ${THE_PORT_OF_THIS_MODULE} in src/config/process-reader.mjs.`,
    )
  }

  /** @param {number} pid */
  const commandLineOf = (pid) => {
    try {
      const text = readFileSync(`${table}/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ').trim()
      return text === '' ? null : text
    } catch {
      return goneUnlessTheTableIsMissing()
    }
  }

  /** @param {number} pid */
  const startTimeOf = (pid) => {
    try {
      const fields = statFields(readFileSync(`${table}/${String(pid)}/stat`, 'utf8'))
      // Field 3 is fields[0], so field 22 is fields[19].
      const ticks = fields?.[19]
      if (ticks === undefined || !/^\d+$/.test(ticks)) return null
      return whenALinuxProcessBegan(ticks, table)
    } catch {
      return goneUnlessTheTableIsMissing()
    }
  }

  return {
    platform: 'linux',

    processAt(pid) {
      let stat
      try {
        stat = readFileSync(`${table}/${String(pid)}/stat`, 'utf8')
      } catch (err) {
        goneUnlessTheTableIsMissing()
        const code = /** @type {NodeJS.ErrnoException} */ (err).code
        if (code === 'ENOENT' || code === 'ESRCH') return { here: false }
        // The process exists and may not be inspected: a hidepid mount, or another user's process
        // under a hardened kernel. It is not gone.
        return { here: true, unreadable: `${table}/${String(pid)}/stat could not be read (${String(code)})` }
      }
      const fields = statFields(stat)
      // After the command name: state, ppid, pgrp, ... and field 22, the start, is fields[19].
      const [state, ppid, pgid] = fields ?? []
      const ticks = fields?.[19]
      if (state === undefined || !/^\d+$/.test(ppid ?? '') || !/^\d+$/.test(pgid ?? '') || !/^\d+$/.test(ticks ?? '')) {
        return { here: true, unreadable: `${table}/${String(pid)}/stat is not in the format this reader reads` }
      }
      let startedAt
      try {
        startedAt = whenALinuxProcessBegan(/** @type {string} */ (ticks), table)
      } catch (err) {
        return { here: true, unreadable: `when it began is unknown: ${err instanceof Error ? err.message : String(err)}` }
      }
      return { here: true, pid, ppid: Number(ppid), pgid: Number(pgid), state, startedAt }
    },

    commandLineOf,

    // The name the kernel gives a process: the base name of the file it was started from, cut to 15
    // characters.
    nameOf(pid) {
      try {
        const text = readFileSync(`${table}/${String(pid)}/comm`, 'utf8').trim()
        return text === '' ? null : text
      } catch {
        return goneUnlessTheTableIsMissing()
      }
    },

    // The kernel refuses this link for another user's process, and that is an absence here too.
    executableOf(pid) {
      try {
        const path = readlinkSync(`${table}/${String(pid)}/exe`)
        return path === '' ? null : path
      } catch {
        return goneUnlessTheTableIsMissing()
      }
    },

    // Field 4. Pid 1's parent is 0, which is no process, and this answers 0 rather than inventing one.
    parentOf(pid) {
      try {
        const parent = Number(statFields(readFileSync(`${table}/${String(pid)}/stat`, 'utf8'))?.[1])
        return Number.isInteger(parent) && parent >= 0 ? parent : null
      } catch {
        return goneUnlessTheTableIsMissing()
      }
    },

    startTimeOf,

    // A process that ends during the walk is skipped. A folder that is there and cannot be listed
    // answers null, which a caller says rather than guessing.
    everyCommandLine() {
      let entries
      try {
        entries = readdirSync(table)
      } catch {
        return goneUnlessTheTableIsMissing()
      }
      /** @type {ProcessCommand[]} */
      const out = []
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue
        const command = commandLineOf(Number(entry))
        if (command !== null) out.push({ pid: Number(entry), command })
      }
      return out
    },
  }
}

// ============================================================================ macOS: ps and lsof

/**
 * What one command did, as it is: its exit status and both streams, or why it could not be run.
 * The status is handed back rather than judged, because `ps` and `lsof` both exit 1 when they found
 * nothing they were asked about.
 * @typedef {{ command: string, ran: true, status: number, stdout: string, stderr: string }
 *   | { command: string, ran: false, reason: string }} WhatACommandDid
 */

/**
 * The two commands the macOS reader runs. The real pair starts them; a test hands in its own.
 * @typedef {{ ps: (args: readonly string[]) => WhatACommandDid, lsof: (args: readonly string[]) => WhatACommandDid }} MacCommands
 */

/**
 * The real `ps` and `lsof`, found on the PATH. LC_ALL=C, so `ps` writes its start times in English
 * whatever language the Mac is set to.
 * @returns {MacCommands}
 */
export function theRealMacCommands() {
  /** @type {(command: string, args: readonly string[]) => WhatACommandDid} */
  const run = (command, args) => {
    const r = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    })
    if (r.error) return { command, ran: false, reason: `${command} could not be run: ${r.error.message}` }
    if (r.status === null) return { command, ran: false, reason: `${command} did not finish (killed by ${String(r.signal)})` }
    return { command, ran: true, status: r.status, stdout: r.stdout, stderr: r.stderr }
  }
  return { ps: (args) => run('ps', args), lsof: (args) => run('lsof', args) }
}

/**
 * The columns every `ps` call of one or every process asks for. Each ends in `=`, so ps prints no
 * header line. `stat` is the state, whose first letter is `Z` for a process that has ended.
 */
export const PS_COLUMNS = 'pid=,ppid=,pgid=,stat=,lstart=,command='

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One process as a `ps -o pid=,ppid=,pgid=,stat=,lstart=,command=` line says it.
 * @typedef {{ pid: number, ppid: number, pgid: number, state: string, startedAt: Date, command: string }} PsProcess
 */

/**
 * ONE LINE OF `ps -o pid=,ppid=,pgid=,stat=,lstart=,command=`, or null when it is not in that format.
 *
 * `lstart` is written by `strftime` with `%c` in the C locale, like `Tue Sep  2 09:14:07 2026`, in
 * this machine's own time zone, to the second. The command is everything after the date and may hold
 * spaces and brackets.
 *
 * @param {string} line
 * @returns {PsProcess | null}
 */
export function aProcessFromAPsLine(line) {
  const m =
    /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s+(.*)$/.exec(
      line,
    )
  if (m === null) return null
  const [, pid, ppid, pgid, state, monthName, day, hour, minute, second, year, command] = m
  const month = MONTHS.indexOf(monthName ?? '')
  if (month === -1 || command === undefined || state === undefined) return null
  const startedAt = new Date(Number(year), month, Number(day), Number(hour), Number(minute), Number(second))
  // A date such as 31 Sep would roll over to 1 Oct without a word. A date that does not read back
  // as itself is a line this reader does not understand.
  if (startedAt.getMonth() !== month || startedAt.getDate() !== Number(day)) return null
  return { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), state, startedAt, command: command.trimEnd() }
}

/**
 * Every line of a `ps` answer read with `aProcessFromAPsLine`. It throws, naming the first line it
 * cannot read, because a table missing rows it could not read would say those processes are gone.
 * @param {string} text
 * @returns {PsProcess[]}
 */
export function processesFromPs(text) {
  /** @type {PsProcess[]} */
  const out = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const one = aProcessFromAPsLine(line)
    if (one === null) throw new Error(`ps answered a line this reader cannot read: ${JSON.stringify(line.slice(0, 200))}`)
    out.push(one)
  }
  return out
}

/**
 * "NOTHING MATCHED", as `ps` and `lsof` say it: exit 1 with nothing on either stream. Exit 1 with
 * words on the error stream is a failure, and is not read as this.
 * @param {WhatACommandDid} did
 * @returns {boolean}
 */
export function nothingMatched(did) {
  return did.ran && did.status === 1 && did.stdout.trim() === '' && did.stderr.trim() === ''
}

/**
 * Why a command gave no answer, in one clause, from what it did.
 * @param {WhatACommandDid} did
 * @returns {string}
 */
export function whyItDidNotAnswer(did) {
  if (!did.ran) return did.reason
  const said = did.stderr.trim().split('\n')[0] ?? ''
  return `${did.command} exited ${String(did.status)}${said === '' ? '' : `: ${said}`}`
}

/**
 * One process in `lsof -F` output, and the files it lists for it, each with the fields asked for.
 * @typedef {{ pid: number, files: { fd?: string, type?: string, name?: string }[] }} LsofProcess
 */

/**
 * THE FIELDS OF `lsof -F` OUTPUT. Each line is one field: its first character says which, the rest
 * is its value. `p` starts a process; `f` starts one of its files; `t` (the type) and `n` (the name)
 * belong to the file before them. A `t` or `n` that would overwrite one already set starts a new file,
 * for the case where lsof was not asked for `f`. Other fields are not read.
 * @param {string} text
 * @returns {LsofProcess[]}
 */
export function lsofFields(text) {
  /** @type {LsofProcess[]} */
  const out = []
  /** @type {LsofProcess | null} */
  let proc = null
  /** @type {{ fd?: string, type?: string, name?: string } | null} */
  let file = null
  for (const line of text.split('\n')) {
    if (line === '') continue
    const field = line[0]
    const value = line.slice(1)
    if (field === 'p') {
      if (!/^\d+$/.test(value)) throw new Error(`lsof named a process that is not a number: ${JSON.stringify(line)}`)
      proc = { pid: Number(value), files: [] }
      file = null
      out.push(proc)
      continue
    }
    if (proc === null) continue
    if (field === 'f') {
      file = { fd: value }
      proc.files.push(file)
    } else if (field === 't' || field === 'n') {
      const key = field === 't' ? 'type' : 'name'
      if (file === null || file[key] !== undefined) {
        file = {}
        proc.files.push(file)
      }
      file[key] = value
    }
  }
  return out
}

/**
 * The names an answer of lsof gives for each process, in the order lsof gave them.
 * @param {string} text
 * @returns {Map<number, string[]>}
 */
export function namesByProcess(text) {
  /** @type {Map<number, string[]>} */
  const out = new Map()
  for (const proc of lsofFields(text)) {
    out.set(proc.pid, proc.files.flatMap((f) => (f.name === undefined ? [] : [f.name])))
  }
  return out
}

/**
 * A COMMAND `ps` COULD NOT READ THE ARGUMENTS OF, written as its name in brackets. Apple's ps source
 * (adv_cmds, ps/print.c) prints `(name)`; Apple's ps manual says square brackets. Both are read as a
 * command line that could not be read, until a Mac says which it prints.
 */
const THE_ARGUMENTS_COULD_NOT_BE_READ = /^(?:\(.*\)|\[.*\])$/

/**
 * THE macOS READER, over `ps` and `lsof`.
 *
 * Every question about one process is one `ps` call for that pid. `ps -p` exits 1 with nothing
 * printed when no process has the number, and that is the one answer read as gone. Any other failure
 * throws: the reader could not look.
 *
 * Two readings differ from Linux, and say so:
 *   - the executable is the first file `lsof` lists with the descriptor `txt`, which is how lsof
 *     names a program's own file. macOS has no link like `/proc/<pid>/exe`;
 *   - a command line `ps` could not read is written as its name in brackets, and it is answered as
 *     null, as Linux answers a command line it may not read.
 *
 * @param {MacCommands} [commands] the real `ps` and `lsof` unless a test hands in its own
 * @returns {ProcessReader & { commands: MacCommands, psRow: (pid: number) => PsProcess | null, everyProcess: () => PsProcess[] }}
 */
export function darwinProcessReader(commands = theRealMacCommands()) {
  /**
   * One process from `ps`, or null when no process has the number.
   * @param {number} pid
   * @returns {PsProcess | null}
   */
  const one = (pid) => {
    const did = commands.ps(['-o', PS_COLUMNS, '-p', String(pid)])
    if (nothingMatched(did)) return null
    if (!did.ran || did.status !== 0) {
      throw new Error(`Whether process ${String(pid)} is running is unknown: ${whyItDidNotAnswer(did)}`)
    }
    const rows = processesFromPs(did.stdout)
    const [row] = rows
    if (rows.length !== 1 || row === undefined || row.pid !== pid) {
      throw new Error(`ps was asked about process ${String(pid)} and answered ${String(rows.length)} line(s) not about it`)
    }
    return row
  }

  return {
    platform: 'darwin',
    commands,
    psRow: one,

    processAt(pid) {
      const row = one(pid)
      if (row === null) return { here: false }
      return { here: true, pid: row.pid, ppid: row.ppid, pgid: row.pgid, state: row.state, startedAt: row.startedAt }
    },

    commandLineOf(pid) {
      const row = one(pid)
      return row === null || THE_ARGUMENTS_COULD_NOT_BE_READ.test(row.command) ? null : row.command
    },

    // `ucomm` is the name the kernel keeps for accounting, as `comm` is on Linux.
    nameOf(pid) {
      const did = commands.ps(['-o', 'ucomm=', '-p', String(pid)])
      if (nothingMatched(did)) return null
      if (!did.ran || did.status !== 0) throw new Error(`The name of process ${String(pid)} is unknown: ${whyItDidNotAnswer(did)}`)
      const name = did.stdout.trim()
      return name === '' ? null : name
    },

    // NULL ONLY WHEN lsof SAYS IT MATCHED NOTHING. An lsof that could not be run, timed out, was killed,
    // or exited non-zero with words on its error stream did not look, and that throws, as `nameOf` does:
    // a null here would let `isTheClaudeProgram` call a process nobody could see "not the claude program".
    executableOf(pid) {
      const did = commands.lsof(['-a', '-p', String(pid), '-d', 'txt', '-Fn'])
      if (nothingMatched(did)) return null
      if (!did.ran || did.status !== 0) {
        throw new Error(`The program file of process ${String(pid)} is unknown: ${whyItDidNotAnswer(did)}`)
      }
      return namesByProcess(did.stdout).get(pid)?.[0] ?? null
    },

    parentOf(pid) {
      return one(pid)?.ppid ?? null
    },

    startTimeOf(pid) {
      return one(pid)?.startedAt ?? null
    },

    everyProcess() {
      const did = commands.ps(['-axo', PS_COLUMNS])
      if (!did.ran || did.status !== 0) {
        throw new Error(`the processes on this machine could not be listed: ${whyItDidNotAnswer(did)}`)
      }
      return processesFromPs(did.stdout)
    },

    everyCommandLine() {
      const did = commands.ps(['-axo', PS_COLUMNS])
      if (!did.ran || did.status !== 0) {
        throw new Error(`the processes on this machine could not be listed: ${whyItDidNotAnswer(did)}`)
      }
      return processesFromPs(did.stdout)
        .filter((row) => !THE_ARGUMENTS_COULD_NOT_BE_READ.test(row.command))
        .map((row) => ({ pid: row.pid, command: row.command }))
    },
  }
}

// ============================================================================ the terminal of one process

/**
 * THE TERMINAL ONE PROCESS RUNS ON, from `ps -o tty= -p <pid>`, which Linux and macOS both answer. An agent's
 * page asks this to find the agent's tmux pane (src/server/lib/agent-pane.ts). It answers:
 *   - `{ ok: true, terminal: null }`: ps named no terminal (`?` or nothing);
 *   - `{ ok: true, terminal, device }`: the name ps gave, such as `pts/9`, and its path, such as `/dev/pts/9`,
 *     which is how tmux names a pane's terminal;
 *   - `{ ok: false, out }`: ps could not be run, or refused, as when no process has the number, in its own words.
 * ps runs without blocking, so the server answers other requests while it waits.
 * @param {number} pid
 * @returns {Promise<{ ok: true; terminal: null } | { ok: true; terminal: string; device: string } | { ok: false; out: string }>}
 */
export function theTerminalOfAProcess(pid) {
  return new Promise((done) => {
    execFile('ps', ['-o', 'tty=', '-p', String(pid)], { timeout: 3_000, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err !== null) {
        done({ ok: false, out: String(stderr || err.message).trim() })
        return
      }
      const terminal = stdout.trim()
      done(terminal === '' || terminal === '?' ? { ok: true, terminal: null } : { ok: true, terminal, device: `/dev/${terminal}` })
    })
  })
}

// ============================================================================ the one choice

/**
 * THE READER FOR ONE PLATFORM. macOS gets the reader over `ps` and `lsof`, and Windows the reader over
 * PowerShell, which ran on a Windows 11 machine in wave 13t, round W9. Every other platform gets the reader over /proc, whose
 * reads throw where there is no /proc.
 * @param {string} platform a value of `process.platform`
 * @returns {ProcessReader}
 */
export function theProcessReaderFor(platform) {
  if (platform === 'win32') return windowsProcessReader()
  return platform === 'darwin' ? darwinProcessReader() : linuxProcessReader()
}

/** @type {ProcessReader | null} */
let chosen = null

/**
 * The reader for the platform this process runs on, chosen the first time it is asked for.
 * @returns {ProcessReader}
 */
export function theProcessReader() {
  chosen ??= theProcessReaderFor(process.platform)
  return chosen
}

// ============================================================================ is the row about the process running under that pid

/**
 * IS THIS LEDGER ROW ABOUT THE PROCESS RUNNING UNDER THAT PID? ASKED IN ONE PLACE.
 *
 * A pid alone is not an identity, because pids come round again. The recorded start time is what
 * makes it one, so this comparison decides whether a row is alive, whether a port has changed
 * hands, and whether a release may signal a process group. It used to be written out at eight call
 * sites as `live.startedAt !== entry.osStartedAt`; it is here once because a ninth spelling of it
 * would be free to disagree with the other eight.
 *
 * WHY IT IS HERE AND NOT IN src/server/lib/resources.ts. The data-folder move asks it too, in
 * tools/stable/move-the-data-folder.mjs, of the office's row for its supervisor before it stops anything,
 * and a tool cannot import resources.ts, which opens the database. The move once wrote its own `===`
 * between that row and an ISO reading of the same moment, and the two strings are never equal.
 * resources.ts imports it from here.
 *
 * BOTH SIDES ARE WRITTEN THE SAME WAY. `recorded` is a row's `osStartedAt`, which the office wrote
 * from `processById` in resources.ts. `live.startedAt` is written as `processById` writes it: the
 * reader's moment through `localStamp` in src/shared/time.ts, the local time to the second.
 *
 * THE ONE COMPLICATION, AND IT HAS AN END DATE. Until 3 September 2026 `processById` read the
 * `/proc/<pid>` directory's modification time and called it the start time. It is not one, and it
 * drifts — a supervisor up for 39.6 hours read as three minutes old. Every row written before the
 * fix therefore holds that number in `os_started_at`. Comparing those rows against the corrected
 * reading would report every registered process on this machine as a recycled pid, including the
 * owner's own server and browser app, and "recycled pid" is the sentence this product uses for
 * something it must not touch.
 *
 * So a row whose recorded time does not match the real start time is compared once more against
 * the old reading. Matching THAT is not a guess: it is the same process, described by the method
 * that wrote the row. The row is then re-stamped with the real start time, so the correction
 * happens once and every later read is a plain comparison. `says` carries the sentence explaining
 * it, because a stored value changing itself while somebody reads it has to be visible.
 *
 * @typedef {{ same: true, stampedTheOldWay: false }
 *   | { same: true, stampedTheOldWay: true, says: string }
 *   | { same: false }
 *   | { same: 'nothing recorded' }} RowAndProcess
 */

/**
 * @param {string | null} recorded the row's `osStartedAt`
 * @param {{ startedAt: string, directoryChangedAt?: string | null }} live the process under the row's pid now
 * @returns {RowAndProcess}
 */
export function theRowIsAboutThisProcess(recorded, live) {
  if (recorded === null) return { same: 'nothing recorded' }
  if (recorded === live.startedAt) return { same: true, stampedTheOldWay: false }
  const oldReading = live.directoryChangedAt ?? null
  if (oldReading !== null && recorded === oldReading) {
    return {
      same: true,
      stampedTheOldWay: true,
      says:
        `this row's start time, ${recorded}, was written by the reading Mole Office used before 3 September 2026, ` +
        `which read the modification time of the /proc directory rather than the start time. The process really ` +
        `started at ${live.startedAt}, and the row has been re-stamped with that.`,
    }
  }
  return { same: false }
}
