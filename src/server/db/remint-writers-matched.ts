// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS THE STORE RECORDS, MATCHED WITH THE PROCESSES THE HOST LISTS. Wave 13s round 166, item 30c part 3.
 *
 * The re-mint's writer register has one entry for each writer to hold or stop in the window (section 8 of the re-mint
 * plan). src/server/db/remint-writers.ts reads the part of it the store records. The host's census lists each process.
 * This matches the two, so each process on the host is said to be one the store records, or said not to be, and why. It
 * reads what it is handed and writes nothing. tools/match-the-writers.mjs runs it on a database file and a host census.
 *
 * THE HOST'S CENSUS, in the form its maker declared for it: JSON lines, one for each process, and last a line holding only
 * `summary`. This reads from a process line only what the match needs or shows, and refuses a line whose fields are not
 * as declared:
 *   writer      the register entry's key, or null;
 *   runId       the run the process says it serves, or null;
 *   pids        `hostPid`, the host's pid, and `containerPid`, the pid inside its container, or null;
 *   start       `startLocal`, the local time it started to the second, as the office writes a stamp, and `startTicks`;
 *   kind        one of HOST_PROCESS_KINDS;
 *   name        what the host calls it;
 *   window      one of HOST_WINDOWS, or null for a process no register entry has;
 *   holdsStore  whether it holds the store open: true, false, or null because it could not be told.
 *
 * HOW THEY ARE MATCHED. A process row the ledger still holds, and the process an office part's record says it is, are
 * matched by pid and start: the host's `hostPid` against the row's pid, and `startLocal` against the start the row
 * recorded, compared by theRowIsAboutThisProcess in src/config/process-reader.mjs. A row that recorded no start is not
 * matched by its pid alone. The ledger records no start ticks, so `startTicks` cannot tell two processes apart here: a
 * row two processes match is matched to neither, and each of those processes is listed with why; so is a process the
 * rows of two runs match. Every other process is matched by the run it names, against the runs that have not ended.
 *
 * NOTHING IS DROPPED. Each process is in `processes`: under the run the store records it under, or under none with why.
 * `runId` is the run the host line names and `run` the run the store records the process under, each as given, so
 * where the two differ both are shown. A run that has not ended and that no process is matched to is in
 * `runsWithNoProcess`. A held process row and a recorded office process no process is matched to are in
 * `rowsWithNoProcess`. A row of another type, a port, a lock or a container's name, is not matched to a process here,
 * and stays under its run in the store's census.
 *
 * It is complete only when nothing is in `unread`: the store's census read every row, every host line was read, and
 * the summary line came last.
 */
import { theRowIsAboutThisProcess } from '../../config/process-reader.mjs'
import type { TheWritersOnRecord } from './remint-writers.ts'

/** The kinds of process the host's census names. */
export const HOST_PROCESS_KINDS = ['timer', 'session-watch', 'waiter', 'watcher', 'sandbox-run', 'terminal-holder', 'api-server', 'message-worker', 'other'] as const
/** What a register entry says the window does with its writer. */
export const HOST_WINDOWS = ['stop-and-restart', 'hold', 'keep-running'] as const

/** Why a process, a run or a row is matched to nothing, in the words the match gives. */
export const THE_MATCH_SAYS = {
  namesNoRun: 'It names no run, and the store holds no process row with its pid and start, so the store does not record it.',
  runNotGoing: 'The run it names is not one the store lists as going: it has ended, was deleted, is not a run, or no record has its id.',
  rowsOfTwoRuns: 'Process rows of more than one run have its pid and start, so it is matched to none of them.',
  noProcessForTheRun: 'No host process names this run, and none has the pid and start of a process row it holds.',
  noProcessForTheRow: 'No host process has its pid and start.',
  noStartRecorded: 'It recorded no start, so its pid alone is not matched to a process.',
  keyIsNotAPid: 'Its key is not a pid.',
  twoProcesses: 'More than one host process has its pid and start, and the ledger records no start ticks to tell them apart.',
  oneOfTwoProcesses: 'A held process row has its pid and start, and more than one host process has that pid and start, so the ledger cannot tell which of them the row records.',
  twoRuns: 'A host process with its pid and start is also matched by a process row of another run, so it is matched to none.',
  noSummary: 'The census has no summary line last, so it may have been cut short.',
} as const

const A_STAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/u

/** One process the host lists, and what the store records it as. */
export interface AProcessMatched {
  /** Its line in the host's census, counted from 1. */
  line: number
  writer: string | null
  hostPid: number
  startLocal: string
  kind: string
  name: string
  window: string | null
  holdsStore: boolean | null
  /** The run the host line names, as given. */
  runId: string | null
  /** The run the store records this process under, or null when it records it under none. */
  run: string | null
  /** How it was matched: by the pid and start of a row, by the run it names, or not at all. */
  by: 'pid-and-start' | 'run' | null
  /** The held process rows with its pid and start, by row id. */
  rows: string[]
  /** Whether it is the process an office part's record says it is. */
  recorded: boolean
  /** The state of the run it is matched to when that run has ended, as stored, or null. */
  runState: string | null
  /** Why it is matched to no run, or null when it is matched to one. */
  why: string | null
}

/** A run that has not ended, with no host process matched to it. */
export interface ARunWithNoProcess {
  run: string
  title: string
  state: string | null
  ownPart: string | null
  why: string
}

/** A held process row, or the process an office part's record says it is, with no host process matched to it. */
export interface ARowWithNoProcess {
  /** The ledger row's id, or null for the process an office part's record names. */
  row: string | null
  run: string
  pid: string
  startedAt: string | null
  /** The state of its run when that run has ended, as stored, or null. */
  runState: string | null
  why: string
}

export interface TheWritersMatched {
  processes: AProcessMatched[]
  runsWithNoProcess: ARunWithNoProcess[]
  rowsWithNoProcess: ARowWithNoProcess[]
  /** What could not be read: `from` is `store` or `host`, and `at` the row or the line. */
  unread: { from: 'store' | 'host'; at: string; why: string }[]
  complete: boolean
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const aCount = (value: unknown, least: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least

/** One process line, or why it is not one as declared. */
function readAProcess(line: number, value: unknown): AProcessMatched | string {
  if (!isPlain(value)) return 'It is not a JSON object.'
  const { writer, runId, pids, start, kind, name, window, holdsStore } = value
  if (writer !== null && typeof writer !== 'string') return 'Its writer is not a word or null.'
  if (runId !== null && typeof runId !== 'string') return 'Its runId is not a word or null.'
  if (!isPlain(pids) || !aCount(pids['hostPid'], 1)) return 'Its pids.hostPid is not a pid.'
  if (pids['containerPid'] !== null && !aCount(pids['containerPid'], 1)) return 'Its pids.containerPid is not a pid or null.'
  if (!isPlain(start) || typeof start['startLocal'] !== 'string' || !A_STAMP.test(start['startLocal'])) return 'Its start.startLocal is not a local time to the second.'
  if (!aCount(start['startTicks'], 0)) return 'Its start.startTicks is not a whole number.'
  if (typeof kind !== 'string' || !(HOST_PROCESS_KINDS as readonly string[]).includes(kind)) return 'Its kind is not one the census declares.'
  if (typeof name !== 'string' || name === '') return 'Its name is not a word.'
  if (window !== null && (typeof window !== 'string' || !(HOST_WINDOWS as readonly string[]).includes(window))) return 'Its window is not one the census declares, or null.'
  if (holdsStore !== null && typeof holdsStore !== 'boolean') return 'Its holdsStore is not true, false or null.'
  return {
    line,
    writer,
    hostPid: pids['hostPid'],
    startLocal: start['startLocal'],
    kind,
    name,
    window,
    holdsStore,
    runId,
    run: null,
    by: null,
    rows: [],
    recorded: false,
    runState: null,
    why: null,
  }
}

/** The host's census, line by line: the processes it lists, and what could not be read. */
function readTheHostCensus(text: string): { processes: AProcessMatched[]; unread: TheWritersMatched['unread'] } {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const processes: AProcessMatched[] = []
  const unread: TheWritersMatched['unread'] = []
  let summaryAt: number | null = null
  lines.forEach((text, index) => {
    const line = index + 1
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      unread.push({ from: 'host', at: `line ${String(line)}`, why: 'It is not JSON.' })
      return
    }
    if (summaryAt !== null) {
      unread.push({ from: 'host', at: `line ${String(line)}`, why: `It comes after the summary line, line ${String(summaryAt)}.` })
      return
    }
    if (isPlain(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'summary')) {
      if (isPlain(value['summary'])) summaryAt = line
      else unread.push({ from: 'host', at: `line ${String(line)}`, why: 'Its summary is not a JSON object.' })
      return
    }
    const read = readAProcess(line, value)
    if (typeof read === 'string') unread.push({ from: 'host', at: `line ${String(line)}`, why: read })
    else processes.push(read)
  })
  if (summaryAt === null) unread.push({ from: 'host', at: 'the end', why: THE_MATCH_SAYS.noSummary })
  return { processes, unread }
}

/** One process the store records by pid: a held process row, or the process an office part's record names. */
interface AnEntry { row: string | null; run: string; pid: string; startedAt: string | null; runState: string | null; going: boolean }

/** The store's census matched with the host's, as the header says. It writes nothing. */
export function matchTheWriters(store: TheWritersOnRecord, hostCensus: string): TheWritersMatched {
  const { processes, unread } = readTheHostCensus(hostCensus)
  for (const one of store.unread) unread.unshift({ from: 'store', at: `${one.table} ${one.row}`, why: one.why })

  const entries: AnEntry[] = []
  for (const run of store.runs) {
    if (run.recordedProcess !== null) entries.push({ row: null, run: run.run, pid: String(run.recordedProcess.pid), startedAt: run.recordedProcess.startedAt, runState: null, going: true })
    for (const held of run.held) if (held.type === 'process') entries.push({ row: held.row, run: run.run, pid: held.key, startedAt: held.startedAt, runState: null, going: true })
  }
  for (const held of store.apart) if (held.type === 'process') entries.push({ row: held.row, run: held.run, pid: held.key, startedAt: held.startedAt, runState: held.runState, going: false })

  const rowsWithNoProcess: ARowWithNoProcess[] = []
  const noProcess = (entry: AnEntry, why: string) => rowsWithNoProcess.push({ row: entry.row, run: entry.run, pid: entry.pid, startedAt: entry.startedAt, runState: entry.runState, why })
  const entriesOf = new Map<AProcessMatched, AnEntry[]>()
  const tiedTo = new Set<AProcessMatched>()
  for (const entry of entries) {
    if (!/^[1-9][0-9]*$/u.test(entry.pid)) { noProcess(entry, THE_MATCH_SAYS.keyIsNotAPid); continue }
    if (entry.startedAt === null) { noProcess(entry, THE_MATCH_SAYS.noStartRecorded); continue }
    const startedAt = entry.startedAt
    const found = processes.filter((one) => String(one.hostPid) === entry.pid && theRowIsAboutThisProcess(startedAt, { startedAt: one.startLocal }).same === true)
    if (found.length === 0) { noProcess(entry, THE_MATCH_SAYS.noProcessForTheRow); continue }
    if (found.length > 1) {
      noProcess(entry, THE_MATCH_SAYS.twoProcesses)
      for (const one of found) tiedTo.add(one)
      continue
    }
    entriesOf.set(found[0]!, [...(entriesOf.get(found[0]!) ?? []), entry])
  }

  const going = new Set(store.runs.map((run) => run.run))
  const runStateOf = new Map<string, string>()
  for (const held of store.apart) if (held.runState !== null && !runStateOf.has(held.run)) runStateOf.set(held.run, held.runState)
  const matchedRuns = new Set<string>()
  for (const one of processes) {
    const mine = entriesOf.get(one) ?? []
    const theirRuns = new Set(mine.map((entry) => entry.run))
    if (theirRuns.size > 1) {
      one.why = THE_MATCH_SAYS.rowsOfTwoRuns
      for (const entry of mine) noProcess(entry, THE_MATCH_SAYS.twoRuns)
    } else if (theirRuns.size === 1) {
      const entry = mine[0]!
      Object.assign(one, { run: entry.run, by: 'pid-and-start', rows: mine.flatMap((each) => (each.row === null ? [] : [each.row])), recorded: mine.some((each) => each.row === null), runState: entry.runState })
      if (entry.going) matchedRuns.add(entry.run)
    } else if (one.runId !== null && going.has(one.runId)) {
      Object.assign(one, { run: one.runId, by: 'run' })
      matchedRuns.add(one.runId)
    } else if (one.runId !== null) {
      Object.assign(one, { why: THE_MATCH_SAYS.runNotGoing, runState: runStateOf.get(one.runId) ?? null })
    } else if (tiedTo.has(one)) {
      one.why = THE_MATCH_SAYS.oneOfTwoProcesses
    } else {
      one.why = THE_MATCH_SAYS.namesNoRun
    }
  }

  const runsWithNoProcess: ARunWithNoProcess[] = store.runs
    .filter((run) => !matchedRuns.has(run.run))
    .map((run) => ({ run: run.run, title: run.title, state: run.state, ownPart: run.ownPart, why: THE_MATCH_SAYS.noProcessForTheRun }))
  return { processes, runsWithNoProcess, rowsWithNoProcess, unread, complete: unread.length === 0 }
}
