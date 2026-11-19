// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE READER OF WINDOWS PROCESSES, OVER `Get-CimInstance Win32_Process`, RUN THROUGH POWERSHELL.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * One process is read by one PowerShell script, run once for each question. The script asks
 * Windows for the process with that number and prints a list holding one row, or an empty list
 * when no process has the number. The answer is JSON, so the reading is a check of the JSON and
 * then a plain field of the row.
 *
 * The reader has the same shape as the Mac one in ../process-reader.mjs. `processAt` answers three
 * ways: no such process, a process whose start time could not be read, and a process that was
 * read. Every other question answers a field or null. A failure to look throws, because a null
 * would call a live process gone and a made-up value would be worse.
 *
 * Windows has no process groups and no state letter. So `pgid` is 0 and `state` is the empty
 * string, and neither is invented from something else.
 *
 * `processWithItsCommandLine` answers what `processAt`, `commandLineOf` and `nameOf` answer, from the
 * one row of one script. The Windows probe reads a process that way, so one reading starts one
 * PowerShell and not two or three.
 *
 * THIS PROCESS ITSELF IS READ ONCE. Its number, its parent, its start, its name, its program and its
 * command line do not change while it runs. Windows does not give a process a new parent when its
 * parent ends. A question about it is asked from inside it, so it is running. So the first row about
 * `process.pid` that has a start answers every later question about it. A failed look, and a row
 * with no start, are not kept.
 *
 * EVERY OTHER CALL RUNS POWERSHELL, and the caller waits for it. It ran on a Windows 11 machine in
 * wave 13t, round W9. There a server read its own process five times at each start, with nine
 * PowerShells of about 1.2 seconds each. It is read on Linux, with stand-ins for PowerShell, in
 * tests/the-windows-side-of-the-system-layer.test.ts.
 *
 * A ROW ABOUT ANOTHER PROCESS ANSWERS THE REST OF ITS RUN OF THE THREAD. A question asked the way that
 * holds the thread keeps the row it read, and a microtask queued at the first such row forgets them
 * all. So the later questions about that process in the same run run no script. The look at whether a
 * conversation's recorded process runs (`theRecordedProcess` in ../session-process.mjs) asks four. On a
 * Windows 11 machine on 7 November 2026, those looks held the server's thread for 31 of the 84 seconds
 * that readings of processes held it (wave 13t, round W45). No row is used after a group is ended
 * (`aGroupIsBeingEnded`, which ./windows-groups.mjs says first), so a process that was ended is not
 * answered as running. An answer that no process has the number is not kept, nor is a failed look.
 * This process's own row is kept as said above, and not this way. It is read on Linux in cases 23, 25
 * and 26 of tests/the-windows-side-of-the-system-layer.test.ts.
 *
 * ONE READING OF EVERY PROCESS, FOR AN ACT THAT ASKS MANY QUESTIONS. `readEveryProcessFirst(act)` runs
 * one script that prints a row for every process, by the way that waits for PowerShell. Then it runs
 * the act, and every question the act asks about one process is answered from that reading, with no
 * script of its own. A reading that failed is thrown at each question, so it is never read as "no
 * process has that number". The reading answers only while the act runs, so an act that returns a
 * promise is refused. On a Windows 11 machine on 7 November 2026, the session hook ran 13 scripts of
 * about a second each, one after another, before its first request. Its walk up its parent chain is
 * the only reading of a process there (wave 13t, round W45). It is read on Linux in
 * tests/the-hooks-walk-on-windows-reads-the-processes-once.test.ts.
 *
 * WHO HOLDS ONE CONNECTION TO THIS SERVER. `readWhoHoldsAConnection` reads, in one script, the rows
 * Get-NetTCPConnection lists from one port to another, the process that owns each row and that
 * process's parent, this server's own process, and the rows again. Each process is read with its
 * program, its start and the SID of the user it runs as. The Windows probe decides from those facts
 * whether the installed app's own window sent a request (lib/windows-probe.ts). It is read only by
 * the way that waits for PowerShell, so it never holds the server's thread. This script has not
 * been run on Windows. It is read on Linux, with stand-ins for PowerShell, in
 * tests/the-windows-window-is-the-person.test.ts.
 * The script runs in the PowerShell that stays (./windows-commands.mjs), so a reading after the first
 * starts no PowerShell. The script also says how long each of its four readings took, and the reading
 * answers that with the time the PowerShell that stays gave it. The Windows probe writes both to the log.
 */

import { theRealWindowsCommands } from './windows-commands.mjs'

/**
 * @typedef {import('../process-reader.mjs').ProcessAt} ProcessAt
 * @typedef {import('../process-reader.mjs').ProcessReader} ProcessReader
 * @typedef {import('../process-reader.mjs').WhatACommandDid} WhatACommandDid
 * @typedef {import('./windows-commands.mjs').WindowsCommands} WindowsCommands
 */

/**
 * One process as `processAt` reads it, with the command line and the name from the same row.
 * @typedef {{ here: false }
 *   | { here: true, unreadable: string }
 *   | { here: true, unreadable?: undefined, pid: number, ppid: number, pgid: number, state: string,
 *       startedAt: Date, commandLine: string | null, name: string | null }} ProcessWithItsCommandLine
 */

/**
 * One process as the script's row gives it.
 * @typedef {{
 *   ProcessId: number,
 *   ParentProcessId: number,
 *   CreationDate: number | null,
 *   Name: string | null,
 *   ExecutablePath: string | null,
 *   CommandLine: string | null,
 * }} WindowsProcess
 */

/**
 * One row of Get-NetTCPConnection, in the fields the connection script prints.
 * @typedef {{
 *   LocalAddress: string,
 *   LocalPort: number,
 *   RemoteAddress: string,
 *   RemotePort: number,
 *   OwningProcess: number,
 * }} AConnectionRow
 */

/**
 * One process as the connection script prints it. `Sid` is the user it runs as, or null when Windows
 * would not say.
 * @typedef {{
 *   ProcessId: number,
 *   ParentProcessId: number,
 *   CreationDate: number | null,
 *   ExecutablePath: string | null,
 *   Sid: string | null,
 * }} AnOwningProcess
 */

/**
 * What the connection script prints: the rows, each owner with its parent, this server, and the rows
 * read again after the processes. A process that has ended is null.
 * @typedef {{
 *   Before: AConnectionRow[],
 *   Holders: { ProcessId: number, Holder: AnOwningProcess | null, Parent: AnOwningProcess | null }[],
 *   Server: AnOwningProcess | null,
 *   After: AConnectionRow[],
 *   Took?: TheTimeOfEachStep,
 * }} WhoHoldsAConnection
 */

/**
 * How long each step of the connection script took, in milliseconds, as PowerShell measured it: the
 * rows, their owners with their parents, this server, and the rows again.
 * @typedef {{ Before: number, Holders: number, Server: number, After: number }} TheTimeOfEachStep
 */

/**
 * What a reading of who holds a connection answers: what the script printed, and the time the
 * PowerShell that stays gave the script. The time is null when the script ran in a PowerShell
 * started for it.
 * @typedef {WhoHoldsAConnection & { took: import('./windows-commands.mjs').TheTimeAScriptTook | null }} WhoHoldsAConnectionAndTheTime
 */

/**
 * How many times a group has been ended from this process. A row kept for one run of the thread answers only while
 * this has not changed since it was read.
 */
let theGroupsEnded = 0

/**
 * Said by the group stop just before it ends a group (./windows-groups.mjs), so no row read before it answers a
 * question after it.
 */
export function aGroupIsBeingEnded() {
  theGroupsEnded += 1
}

/** The name of the installed Windows app's own program, which its window runs as. */
export const THE_WINDOWS_APPS_PROGRAM = 'mole-office.exe'

/**
 * The script that reads one process. `-InputObject` with `@(...)` keeps a list of one as a list,
 * and an empty list prints as `[]`, so the answer always has the same shape.
 * @param {number} pid
 * @returns {string}
 */
function theOneProcessScript(pid) {
  return theProcessesScript(` -Filter "ProcessId = ${pid}"`)
}

/** The script that reads every process, each row with the same fields as a row about one process. */
const THE_EVERY_PROCESS_SCRIPT = theProcessesScript('')

/**
 * The script that prints a row for each process the filter lets through.
 * @param {string} filter the `-Filter` argument with its space before it, or nothing for every process
 * @returns {string}
 */
function theProcessesScript(filter) {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$rows = @(Get-CimInstance -ClassName Win32_Process${filter} | ForEach-Object {`,
    '  [pscustomobject]@{',
    '    ProcessId = [int64]$_.ProcessId',
    '    ParentProcessId = [int64]$_.ParentProcessId',
    '    CreationDate = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }',
    '    Name = $_.Name',
    '    ExecutablePath = $_.ExecutablePath',
    '    CommandLine = $_.CommandLine',
    '  }',
    '})',
    'ConvertTo-Json -InputObject $rows -Compress -Depth 2',
  ].join('\n')
}

/** The script that lists every process and the command line Windows was willing to give. */
const THE_EVERY_COMMAND_LINE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$rows = @(Get-CimInstance -ClassName Win32_Process | ForEach-Object {',
  '  [pscustomobject]@{',
  '    ProcessId = [int64]$_.ProcessId',
  '    CommandLine = $_.CommandLine',
  '  }',
  '})',
  'ConvertTo-Json -InputObject $rows -Compress -Depth 2',
].join('\n')

/**
 * THE SCRIPT THAT READS WHO HOLDS ONE CONNECTION, from the far end's port to this server's port.
 *
 * Get-NetTCPConnection lists each end of a connection on this computer as a row of its own. The row
 * whose local port is the far end's port and whose remote port is this server's is the far end's own
 * row, and its owner is the program that holds that end. Windows reports "no row" as an error whose
 * category is ObjectNotFound. That one is read as an empty list, and any other error stops the script.
 * A process that has ended prints as null. The owner's SID is null when Windows will not give it.
 * @param {number} peerPort
 * @param {number} ourPort
 * @param {number} serverPid
 * @returns {string}
 */
function theConnectionScript(peerPort, ourPort, serverPid) {
  return [
    "$ErrorActionPreference = 'Stop'",
    'function Read-Connection {',
    `  $rows = @(Get-NetTCPConnection -LocalPort ${peerPort} -RemotePort ${ourPort} -State Established -ErrorAction SilentlyContinue -ErrorVariable failed)`,
    "  foreach ($one in $failed) { if ($one.CategoryInfo.Category -ne 'ObjectNotFound') { throw $one } }",
    '  @($rows | ForEach-Object {',
    '    [pscustomobject]@{',
    '      LocalAddress = [string]$_.LocalAddress',
    '      LocalPort = [int64]$_.LocalPort',
    '      RemoteAddress = [string]$_.RemoteAddress',
    '      RemotePort = [int64]$_.RemotePort',
    '      OwningProcess = [int64]$_.OwningProcess',
    '    }',
    '  })',
    '}',
    'function Read-Process([int64]$id) {',
    '  $p = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $id"',
    '  if ($null -eq $p) { return $null }',
    '  $sid = $null',
    '  $owner = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction SilentlyContinue',
    '  if ($null -ne $owner -and $owner.ReturnValue -eq 0) { $sid = [string]$owner.Sid }',
    '  [pscustomobject]@{',
    '    ProcessId = [int64]$p.ProcessId',
    '    ParentProcessId = [int64]$p.ParentProcessId',
    '    CreationDate = if ($p.CreationDate) { ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() } else { $null }',
    '    ExecutablePath = $p.ExecutablePath',
    '    Sid = $sid',
    '  }',
    '}',
    '$watch = [System.Diagnostics.Stopwatch]::StartNew()',
    '$before = @(Read-Connection)',
    '$readBefore = $watch.ElapsedMilliseconds',
    '$holders = @($before | ForEach-Object { [int64]$_.OwningProcess } | Sort-Object -Unique | ForEach-Object {',
    '  $holder = Read-Process $_',
    '  [pscustomobject]@{',
    '    ProcessId = $_',
    '    Holder = $holder',
    '    Parent = if ($null -ne $holder) { Read-Process $holder.ParentProcessId } else { $null }',
    '  }',
    '})',
    '$readHolders = $watch.ElapsedMilliseconds',
    `$server = Read-Process ${serverPid}`,
    '$readServer = $watch.ElapsedMilliseconds',
    '$after = @(Read-Connection)',
    '$readAfter = $watch.ElapsedMilliseconds',
    '$took = [pscustomobject]@{ Before = $readBefore; Holders = $readHolders - $readBefore; Server = $readServer - $readHolders; After = $readAfter - $readServer }',
    '$said = [pscustomobject]@{ Before = $before; Holders = $holders; Server = $server; After = $after; Took = $took }',
    'ConvertTo-Json -InputObject $said -Compress -Depth 5',
  ].join('\n')
}

/**
 * The script's answer about a connection, after its shape is checked. A command that did not run, a
 * failed command, an answer that is not JSON and an answer of another shape all throw; none is read
 * as "nobody holds it".
 * @param {WhatACommandDid} did
 * @param {number} peerPort
 * @param {number} ourPort
 * @returns {WhoHoldsAConnection}
 */
function theHoldersIn(did, peerPort, ourPort) {
  const which = `the connection from port ${String(peerPort)} to port ${String(ourPort)}`
  if (!did.ran) throw new Error(`Who holds ${which} is unknown: ${did.reason}`)
  if (did.status !== 0) throw new Error(`Who holds ${which} is unknown: ${whatItSaid(did)}`)
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error(`The answer about ${which} was not JSON.`)
  }
  const isAList = (/** @type {unknown} */ one) => Array.isArray(one)
  if (
    said === null ||
    typeof said !== 'object' ||
    !isAList(said.Before) ||
    !isAList(said.Holders) ||
    !isAList(said.After) ||
    (said.Server !== null && typeof said.Server !== 'object')
  ) {
    throw new Error(`The answer about ${which} did not list its rows, their owners and this server.`)
  }
  return said
}

/**
 * The two ports of a connection, checked before a script names them.
 * @param {number} peerPort
 * @param {number} ourPort
 * @param {number} serverPid
 */
function checkTheConnection(peerPort, ourPort, serverPid) {
  for (const port of [peerPort, ourPort]) {
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error(`Port ${String(port)} is not a port.`)
  }
  if (!Number.isSafeInteger(serverPid) || serverPid <= 0) {
    throw new Error(`Process number ${String(serverPid)} is not a whole number above 0.`)
  }
}

/**
 * The words a process that is running is said to be unreadable in when Windows did not say when it started.
 * @param {number} pid
 * @returns {string}
 */
export function theStartWasNotSaidWords(pid) {
  return `Process ${String(pid)} is running, but Windows did not say when it started.`
}

/**
 * The words a failure to look is said in. They name the process, because the caller is asking
 * about that one.
 * @param {number} pid
 * @param {string} why
 * @returns {string}
 */
export function whetherItRunsIsUnknownWords(pid, why) {
  return `Whether process ${String(pid)} is running is unknown: ${why}`
}

/**
 * What a failed command said, in one plain sentence.
 * @param {WhatACommandDid & { ran: true }} did
 * @returns {string}
 */
function whatItSaid(did) {
  const onTheErrorStream = did.stderr.trim()
  return onTheErrorStream === '' ? `powershell.exe exited ${String(did.status)}` : onTheErrorStream
}

/**
 * The rows in an answer about one process. A command that did not run, a failed command, an answer
 * that is not JSON and an answer that is not a list all throw; none is read as an absence.
 * @param {WhatACommandDid} did
 * @param {number} pid
 * @returns {WindowsProcess[]}
 */
function theRowsIn(did, pid) {
  if (!did.ran) throw new Error(whetherItRunsIsUnknownWords(pid, did.reason))
  if (did.status !== 0) throw new Error(whetherItRunsIsUnknownWords(pid, whatItSaid(did)))
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error(`The answer about process ${String(pid)} was not JSON.`)
  }
  if (!Array.isArray(said)) {
    throw new Error(`The answer about process ${String(pid)} was not a list of rows.`)
  }
  return said
}

/**
 * The rows in an answer listing the processes on this machine. A command that did not run, a failed command, an answer
 * that is not JSON and an answer that is not a list all throw.
 * @param {WhatACommandDid} did
 * @returns {WindowsProcess[]}
 */
function theListIn(did) {
  if (!did.ran) throw new Error(`The processes on this machine could not be listed: ${did.reason}`)
  if (did.status !== 0) throw new Error(`The processes on this machine could not be listed: ${whatItSaid(did)}`)
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error('The answer listing the processes on this machine was not JSON.')
  }
  if (!Array.isArray(said)) {
    throw new Error('The answer listing the processes on this machine was not a list of rows.')
  }
  return said
}

/**
 * The rows of a reading of every process, by their number. A row whose number is not a whole number throws, because
 * the questions about it would then be answered "no such process". Windows lists the System Idle Process as 0.
 * @param {WindowsProcess[]} rows
 * @returns {Map<number, WindowsProcess[]>}
 */
function theRowsByNumber(rows) {
  /** @type {Map<number, WindowsProcess[]>} */
  const byNumber = new Map()
  for (const row of rows) {
    const pid = row?.ProcessId
    if (!Number.isSafeInteger(pid) || pid < 0) {
      throw new Error(`The answer listing the processes on this machine held a row whose process number is ${JSON.stringify(pid)}.`)
    }
    byNumber.set(pid, [...(byNumber.get(pid) ?? []), row])
  }
  return byNumber
}

/**
 * The moment the process started, or null when Windows gave none. A value that is neither a
 * number nor null throws, because a string would become an invalid Date and be handed on as a
 * start time.
 * @param {number} pid
 * @param {number | null} creation
 * @returns {Date | null}
 */
function theStartTime(pid, creation) {
  if (creation === null) return null
  if (typeof creation !== 'number' || !Number.isFinite(creation)) {
    throw new Error(`The start time of process ${String(pid)} was neither a number nor null.`)
  }
  return new Date(creation)
}

/**
 * THE WINDOWS READER.
 *
 * Every question about one process runs one script for that pid, except while an act runs inside
 * `readEveryProcessFirst`, and except when the same run of the thread has read a row about that pid already, with no
 * group ended since. An empty list is the one answer read as gone. More than one row, or a row
 * about another process, is not an answer about the process asked for, so it throws rather than
 * taking the first row.
 *
 * Each question that reads the process table has a twin whose name begins with "read". The twin runs the
 * same script by the way that waits for PowerShell without holding the thread, and reads its answer the
 * same way.
 *
 * @param {WindowsCommands} [commands] the real PowerShell unless a test hands in its own
 * @returns {ProcessReader & {
 *   readProcessAt: (pid: number) => Promise<ProcessAt>,
 *   processWithItsCommandLine: (pid: number) => ProcessWithItsCommandLine,
 *   readProcessWithItsCommandLine: (pid: number) => Promise<ProcessWithItsCommandLine>,
 *   readWhoHoldsAConnection: (peerPort: number, ourPort: number, serverPid: number) => Promise<WhoHoldsAConnectionAndTheTime>,
 *   readEveryProcessFirst: <T>(act: () => T) => Promise<T>,
 * }}
 */
export function windowsProcessReader(commands = theRealWindowsCommands()) {
  /**
   * This process's own row, once one with a start has been read.
   * @type {WindowsProcess | null}
   */
  let ownRow = null

  /**
   * The reading of every process an act is answered from while it runs inside `readEveryProcessFirst`, or the failure
   * that reading met. Null when no act is running inside one.
   * @type {{ rows: Map<number, WindowsProcess[]> } | { failed: string } | null}
   */
  let lent = null

  /**
   * The rows about other processes read in this run of the thread, and how many groups had been ended when they were
   * read. Null when none has been read since the last microtask that forgot them.
   * @type {{ rows: Map<number, WindowsProcess>, groupsEnded: number } | null}
   */
  let thisRun = null

  /**
   * The one row about the process, or null when the answer says no process has the number.
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const one = (pid) => {
    const kept = theRowKeptFor(pid)
    if (kept !== undefined) return kept
    if (lent !== null) {
      if ('failed' in lent) throw new Error(whetherItRunsIsUnknownWords(pid, lent.failed))
      return theOneRowOf(lent.rows.get(pid) ?? [], pid)
    }
    const keptThisRun = thisRun?.groupsEnded === theGroupsEnded ? thisRun.rows.get(pid) : undefined
    if (keptThisRun !== undefined) return keptThisRun
    const row = theOneRowIn(commands.powershell(theOneProcessScript(pid)), pid)
    if (row !== null && pid !== process.pid) keepForThisRun(pid, row)
    return row
  }

  /**
   * Keep a row about another process for the rest of this run of the thread.
   * @param {number} pid
   * @param {WindowsProcess} row
   */
  const keepForThisRun = (pid, row) => {
    if (thisRun === null) {
      queueMicrotask(() => {
        thisRun = null
      })
    }
    if (thisRun === null || thisRun.groupsEnded !== theGroupsEnded) thisRun = { rows: new Map(), groupsEnded: theGroupsEnded }
    thisRun.rows.set(pid, row)
  }

  /**
   * The same row, read by the way that does not hold the thread while PowerShell runs.
   * @param {number} pid
   * @returns {Promise<WindowsProcess | null>}
   */
  const readOne = async (pid) => {
    const kept = theRowKeptFor(pid)
    if (kept !== undefined) return kept
    return theOneRowIn(await commands.startPowerShell(theOneProcessScript(pid)), pid)
  }

  /**
   * This process's own row when it has been read already, after the number is checked. Undefined means: ask.
   * @param {number} pid
   * @returns {WindowsProcess | undefined}
   */
  const theRowKeptFor = (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error(`Process number ${String(pid)} is not a whole number above 0.`)
    }
    if (pid === process.pid && ownRow !== null) return ownRow
    return undefined
  }

  /**
   * The one row a script's answer holds about the process.
   * @param {WhatACommandDid} did
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const theOneRowIn = (did, pid) => theOneRowOf(theRowsIn(did, pid), pid)

  /**
   * The one row of these rows about the process.
   * @param {WindowsProcess[]} rows
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const theOneRowOf = (rows, pid) => {
    const [row] = rows
    if (row === undefined) return null
    if (rows.length !== 1) {
      throw new Error(`The answer about process ${String(pid)} held ${String(rows.length)} rows rather than one.`)
    }
    if (row.ProcessId !== pid) {
      throw new Error(`The answer about process ${String(pid)} was about process ${String(row.ProcessId)}.`)
    }
    if (pid === process.pid && theStartTime(pid, row.CreationDate) !== null) ownRow = row
    return row
  }

  /**
   * What `processAt` answers, from one row.
   * @param {number} pid
   * @param {WindowsProcess | null} row
   * @returns {ProcessAt}
   */
  const atOf = (pid, row) => {
    if (row === null) return { here: false }
    const startedAt = theStartTime(pid, row.CreationDate)
    if (startedAt === null) {
      return { here: true, unreadable: theStartWasNotSaidWords(pid) }
    }
    return {
      here: true,
      pid: row.ProcessId,
      ppid: row.ParentProcessId,
      pgid: 0,
      state: '',
      startedAt,
    }
  }

  /**
   * What `processWithItsCommandLine` answers, from one row.
   * @param {number} pid
   * @param {WindowsProcess | null} row
   * @returns {ProcessWithItsCommandLine}
   */
  const withItsCommandLineOf = (pid, row) => {
    const at = atOf(pid, row)
    if (!at.here || at.unreadable !== undefined) return at
    return { ...at, commandLine: row?.CommandLine ?? null, name: row?.Name ?? null }
  }

  return {
    platform: 'win32',

    processAt(pid) {
      return atOf(pid, one(pid))
    },

    async readProcessAt(pid) {
      return atOf(pid, await readOne(pid))
    },

    processWithItsCommandLine(pid) {
      return withItsCommandLineOf(pid, one(pid))
    },

    async readProcessWithItsCommandLine(pid) {
      return withItsCommandLineOf(pid, await readOne(pid))
    },

    commandLineOf(pid) {
      return one(pid)?.CommandLine ?? null
    },

    nameOf(pid) {
      return one(pid)?.Name ?? null
    },

    executableOf(pid) {
      return one(pid)?.ExecutablePath ?? null
    },

    parentOf(pid) {
      return one(pid)?.ParentProcessId ?? null
    },

    startTimeOf(pid) {
      const row = one(pid)
      return row === null ? null : theStartTime(pid, row.CreationDate)
    },

    everyCommandLine() {
      const said = theListIn(commands.powershell(THE_EVERY_COMMAND_LINE_SCRIPT))
      /** @type {{ pid: number, command: string }[]} */
      const out = []
      for (const row of said) {
        if (row.CommandLine === null || row.CommandLine === undefined) continue
        out.push({ pid: row.ProcessId, command: row.CommandLine })
      }
      return out
    },

    async readWhoHoldsAConnection(peerPort, ourPort, serverPid) {
      checkTheConnection(peerPort, ourPort, serverPid)
      const script = theConnectionScript(peerPort, ourPort, serverPid)
      if (commands.askThePowerShellThatStays === undefined) {
        return { ...theHoldersIn(await commands.startPowerShell(script), peerPort, ourPort), took: null }
      }
      const did = await commands.askThePowerShellThatStays(script)
      return { ...theHoldersIn(did, peerPort, ourPort), took: did.took }
    },

    readEveryProcessFirst,
  }

  /**
   * Read every process by the way that waits, then run the act, answering each question it asks about one process from
   * that reading. The reading answers only while the act runs.
   * @template T
   * @param {() => T} act
   * @returns {Promise<T>}
   */
  async function readEveryProcessFirst(act) {
    /** @type {{ rows: Map<number, WindowsProcess[]> } | { failed: string }} */
    let reading
    try {
      reading = { rows: theRowsByNumber(theListIn(await commands.startPowerShell(THE_EVERY_PROCESS_SCRIPT))) }
    } catch (failed) {
      // Kept to be thrown at each question the act asks, as a reading of that one process would have thrown.
      reading = { failed: failed instanceof Error ? failed.message : String(failed) }
    }
    const before = lent
    lent = reading
    try {
      const done = act()
      if (typeof (/** @type {{ then?: unknown } | null | undefined} */ (done))?.then === 'function') {
        throw new Error('An act read inside one reading of every process must not wait: the reading answers it only while it runs. This one returned a promise.')
      }
      return done
    } finally {
      lent = before
    }
  }
}
