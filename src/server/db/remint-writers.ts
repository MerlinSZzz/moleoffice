// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS A STORE HAS ON RECORD, FOR THE RE-MINT'S WRITER REGISTER. Wave 13s round 164, item 30c part 3.
 *
 * Before the window the re-mint needs a register of every writer to hold or stop, one entry for each instance, and the
 * host's census fills it (section 8 of the re-mint plan). This is the part of it the office's own store can give. It
 * only reads: tools/the-writers-on-record.mjs opens the database file read-only and immutable, and this reads it.
 *
 *   runs   every session record not deleted whose state does not end a run (RUN_IS_OVER_STATES, read from
 *          src/config/the-session-note.mjs, which a test holds equal to the list in lib/keys.ts). That is running, idle,
 *          unknown, no state, or a word the office does not use. Each run is its own entry. The office's own parts are
 *          runs too, named by their title in `ownPart`, with the process their record says they are. The terminal
 *          holder is marked `keepRunning`, because the window never stops it;
 *   held   under each run, every row the process ledger (session_resources) still holds for it: a row with no release;
 *   apart  every row the ledger still holds whose run is not one of `runs`, with why: its run has ended, was deleted, is
 *          not a run, could not be read, or no record has its id. An ended run's state is in `runState`, and the kind
 *          of a record that is not a run is in `recordKind`, each as stored and never written into the why. An ended
 *          run's process the ledger never saw go is here, because it may still be running;
 *   unread what could not be read, each by its table and row. A census with anything here is incomplete.
 *
 * A run's agent is given as the record stores it, `servingAgentId` and `servingAgent`, and by the canonical id the
 * stored id names through the filed aliases. Its handle is the handle of that id's row in agents, or null when no row
 * has the id. A run that stores only a name is not resolved by that name, because two agents can answer to one.
 *
 * What a store does not record is not here: a process no run registered, the host's timers and watches, and the
 * server's own timers, which run inside the API server's process. `THE_WRITERS_NOT_ON_RECORD` says so in the words the
 * tool prints.
 */
import type Database from 'better-sqlite3'
import { RUN_IS_OVER_STATES } from '../../config/the-session-note.mjs'
import { THE_TERMINAL_HOLDER, theOwnPartOf, theRecordedProcessOf } from '../../config/own-rows.mjs'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'

/** What this census leaves to the host, said beside every census the tool prints. */
export const THE_WRITERS_NOT_ON_RECORD =
  'This lists only what the store records. A process no run registered in the process ledger, the host\'s timers and ' +
  'watches, and the server\'s own timers, which run inside the API server\'s process, are not in it.'

/** One row the process ledger still holds: a process, port, gpu, container, lock or slot that has no release. */
export interface AHeldRow {
  /** The ledger row's id. */
  row: string
  /** What it is, as stored. */
  type: string
  /** What names it, as stored: a process's pid, a port, a container's name, a lock's path. */
  key: string
  /** The process group its release signals, or null when the row records none. */
  pgid: number | null
  /** When the process started, as the row recorded it, or null when it recorded none. */
  startedAt: string | null
  /** What it is, in the words written when it was registered. */
  detail: string
  /** Whether Mole Office started it: true, false, or null because nobody recorded it. */
  startedByTheOffice: boolean | null
}

/** One run that has not ended. */
export interface ARunOnRecord {
  run: string
  title: string
  /** The state as stored, or null when the record holds no state word. */
  state: string | null
  /** The office's own part the run stands for, by its title, or null for every other run. */
  ownPart: string | null
  /** True for the terminal holder alone: the window never stops it. */
  keepRunning: boolean
  /** The agent the run serves, or null when the record names none. */
  agent: { storedId: string | null; storedName: string | null; id: string | null; handle: string | null } | null
  /** The process the record says it is, which the office's own parts record, or null when it records none. */
  recordedProcess: { pid: number; startedAt: string | null } | null
  /** Whether the record says Mole Office started the run. */
  startedByTheOffice: boolean
  /** Every row the process ledger still holds for this run. */
  held: AHeldRow[]
}

export interface TheWritersOnRecord {
  runs: ARunOnRecord[]
  /** `runState` is the state of a run that has ended, and `recordKind` the kind of a record that is not a run, as stored. */
  apart: (AHeldRow & { run: string; why: string; runState: string | null; recordKind: string | null })[]
  unread: { table: string; row: string; why: string }[]
}

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const aWord = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

interface ASessionRow { rowid: number; id: string; title: string; data: string; deletedAt: string | null }
interface ALedgerRow { rowid: number; id: string | null; run: string; type: string; key: string; pgid: number | null; startedAt: string | null; detail: string; byTheOffice: number | null }

/** The census, read from a store opened read-only. It writes nothing. */
export function theWritersOnRecord(db: Database.Database): TheWritersOnRecord {
  const aliases = theFiledAliasesReadOnce(db)
  const handleOf = db.prepare('SELECT handle FROM agents WHERE id = ?')
  const unread: TheWritersOnRecord['unread'] = []
  const runs: ARunOnRecord[] = []
  const notListed = new Map<string, { why: string; runState: string | null }>()

  const sessions = db.prepare("SELECT rowid, id, title, data, deleted_at AS deletedAt FROM records WHERE kind = 'session' ORDER BY rowid").all() as ASessionRow[]
  for (const row of sessions) {
    if (row.deletedAt !== null) {
      notListed.set(row.id, { why: `its run was deleted at ${row.deletedAt}`, runState: null })
      continue
    }
    let data: unknown
    try {
      data = JSON.parse(row.data)
    } catch {
      data = undefined
    }
    if (!isPlain(data)) {
      unread.push({ table: 'records', row: row.id, why: 'the run\'s data is not a JSON object, so whether it has ended cannot be read' })
      notListed.set(row.id, { why: 'its run\'s data could not be read', runState: null })
      continue
    }
    const state = data['state']
    if (typeof state === 'string' && RUN_IS_OVER_STATES.includes(state)) {
      notListed.set(row.id, { why: 'its run has ended', runState: state })
      continue
    }
    if (state !== undefined && typeof state !== 'string') unread.push({ table: 'records', row: row.id, why: 'the run\'s state is not a word, so it is listed as a run that may still be going' })
    const record = { id: row.id, title: row.title, data }
    const ownPart = aWord(theOwnPartOf(record)?.['role'])
    const storedId = aWord(data['servingAgentId'])
    const storedName = aWord(data['servingAgent'])
    const id = storedId === null ? null : aliases.canonicalOf(storedId)
    const handle = id === null ? null : ((handleOf.get(id) as { handle: string } | undefined)?.handle ?? null)
    const recorded = theRecordedProcessOf(record)
    runs.push({
      run: row.id,
      title: row.title,
      state: aWord(state),
      ownPart,
      keepRunning: ownPart === THE_TERMINAL_HOLDER,
      agent: storedId === null && storedName === null ? null : { storedId, storedName, id, handle },
      recordedProcess: recorded.pid === null ? null : { pid: recorded.pid, startedAt: recorded.pidStartedAt },
      startedByTheOffice: data['startedByMoleOffice'] === true,
      held: [],
    })
  }

  const listed = new Map(runs.map((run) => [run.run, run]))
  const apartRows: TheWritersOnRecord['apart'] = []
  const otherRecord = db.prepare('SELECT kind FROM records WHERE id = ?')
  const ledger = db.prepare(
    'SELECT rowid, id, session_record_id AS run, type, key, pgid, os_started_at AS startedAt, detail, started_by_the_product AS byTheOffice FROM session_resources WHERE released_at IS NULL ORDER BY rowid',
  ).all() as ALedgerRow[]
  for (const row of ledger) {
    const held: AHeldRow = {
      row: row.id ?? `rowid ${String(row.rowid)}`,
      type: row.type,
      key: row.key,
      pgid: row.pgid,
      startedAt: row.startedAt,
      detail: row.detail,
      startedByTheOffice: row.byTheOffice === null ? null : row.byTheOffice === 1,
    }
    const run = listed.get(row.run)
    if (run !== undefined) {
      run.held.push(held)
      continue
    }
    const notARun = notListed.get(row.run)
    if (notARun !== undefined) {
      apartRows.push({ ...held, run: row.run, ...notARun, recordKind: null })
      continue
    }
    const kind = (otherRecord.get(row.run) as { kind: string } | undefined)?.kind
    const why = kind === undefined ? 'no record has its run\'s id' : 'its run\'s record is not a run'
    apartRows.push({ ...held, run: row.run, why, runState: null, recordKind: kind ?? null })
  }
  return { runs, apart: apartRows, unread }
}
