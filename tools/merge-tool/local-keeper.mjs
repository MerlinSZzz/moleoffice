// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOCAL KEEPER: one project's merge queue in a file, with no office.
 *
 * A project that runs the merge tool alone has no office to hold its queue, its step decisions or its
 * full-suite seat. This module keeps that queue under ~/.cache/merge-tool/<repository hash>/, takes the
 * seat with a lock file, and moves an entry with the same `theMoveAStepMakes` table the office's state
 * machine calls. It is a library: the command line imports it, and node run on it refuses through
 * a-library-is-not-a-program.mjs before anything else is loaded. It sends no request and makes no
 * folder until a caller asks it to.
 *
 * The office never uses this keeper: it has its own queue in its database. The seam is the one the
 * measurement of the merge queue as a tool calls the queue keeper (section 2a): read an entry, report a
 * step and read the next state, say a run started and ended, and take the one suite seat.
 */

import './a-library-is-not-a-program.mjs'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  A_TOOL_RUN_ENDED,
  MERGE_STATES,
  MERGE_STATE_SPECS,
  MERGE_STEPS,
  theMoveAStepMakes,
} from '../../src/shared/merge-queue.ts'
import { localStamp } from '../../src/shared/time.ts'
import { startTimeOf } from '../../src/config/session-process.mjs'

const QUEUE_FILE = 'queue.json'
const SEAT_FILE = 'the-suite-seat.lock'
const TOOL_RUNS_FILE = 'tool-runs.jsonl'
/** How many times a stale seat lock may be cleared and tried again before the keeper gives up. */
const SEAT_TRIES = 5

/** The steps whose move needs records the local keeper does not have. Used only to word a refusal better. */
const RECORD_RESTING_STEPS = Object.freeze(['pinned', 'integrating', 'integrated', 'moved-past-documents', 'resolution-checked', 'fix-round-looked'])

/**
 * WHERE ONE REPOSITORY'S QUEUE LIVES. The folder is named by the first 16 hexadecimal digits of the
 * sha256 of the resolved repository path, so two checkouts never share a queue by accident.
 *
 * @param {string} repository
 * @param {{ home?: string }} [options]
 * @returns {{ folder: string, queueFile: string, seatFile: string, toolRunsFile: string }}
 */
export function theLocalKeepersPlace(repository, { home = homedir() } = {}) {
  const folder = join(home, '.cache', 'merge-tool', createHash('sha256').update(resolve(repository)).digest('hex').slice(0, 16))
  return {
    folder,
    queueFile: join(folder, QUEUE_FILE),
    seatFile: join(folder, SEAT_FILE),
    toolRunsFile: join(folder, TOOL_RUNS_FILE),
  }
}

/**
 * OPEN THE KEEPER FOR ONE REPOSITORY. This is the call that makes the folder; asking for the place or
 * loading the module makes nothing.
 *
 * @param {{ repository: string, home?: string }} options
 */
export function openTheLocalKeeper({ repository, home = homedir() } = {}) {
  const resolved = resolve(repository)
  const place = theLocalKeepersPlace(resolved, { home })
  mkdirSync(place.folder, { recursive: true })

  /** The queue as stored, or an empty one before the first write. Every caller reads the file afresh. */
  function readQueue() {
    if (!existsSync(place.queueFile)) return { version: 1, repository: resolved, entries: [] }
    try {
      const queue = JSON.parse(readFileSync(place.queueFile, 'utf8'))
      if (queue === null || typeof queue !== 'object' || !Array.isArray(queue.entries)) {
        throw new Error('it is not a queue object with an entries list')
      }
      return queue
    } catch (error) {
      throw new Error(`The local keeper's queue file ${place.queueFile} could not be read: ${error instanceof Error ? error.message : String(error)}. Nothing was written.`)
    }
  }

  /** Write the queue whole under a temporary name, then rename it over, so a reader never sees half of it. */
  let writes = 0
  function writeQueue(queue) {
    writes += 1
    const temporary = `${place.queueFile}.tmp-${String(process.pid)}-${String(writes)}`
    writeFileSync(temporary, `${JSON.stringify(queue, null, 2)}\n`)
    renameSync(temporary, place.queueFile)
  }

  /** The entry with this id, from the queue already read, or a sentence naming it. */
  function theEntryIn(queue, id) {
    const entry = queue.entries.find((one) => one !== null && typeof one === 'object' && one.id === id)
    if (entry === undefined) {
      throw new Error(`The local keeper has no merge entry ${id} in ${place.queueFile}. Nothing was written.`)
    }
    return entry
  }

  /** The same moment in one form, kept in one place so a move's history and its fields agree. */
  const now = () => localStamp(new Date())

  /**
   * Add an entry to the queue. The command line's `submit` calls this; a duplicate id or a state the
   * queue does not know is refused before anything is written.
   * @param {Record<string, unknown>} entry
   * @returns {Record<string, unknown>}
   */
  function addAnEntry(entry) {
    if (entry === null || typeof entry !== 'object') throw new Error('A merge entry must be an object. Nothing was written.')
    if (typeof entry.id !== 'string' || entry.id === '') throw new Error('A merge entry needs an id, and none was given. Nothing was written.')
    const queue = readQueue()
    if (queue.entries.some((one) => one !== null && typeof one === 'object' && one.id === entry.id)) {
      throw new Error(`The local keeper already has a merge entry ${entry.id}, so it was not added again. Nothing was written.`)
    }
    const state = entry.state ?? 'submitted'
    if (!MERGE_STATES.includes(state)) {
      throw new Error(`The local keeper does not know the state "${String(state)}" for merge entry ${entry.id}; its states are ${MERGE_STATES.join(', ')}. Nothing was written.`)
    }
    const stored = { id: entry.id, state }
    for (const field of ['title', 'branch', 'commit', 'base']) {
      if (entry[field] !== undefined) stored[field] = entry[field]
    }
    stored.lane = entry.lane ?? resolved
    stored.submittedAt = entry.submittedAt ?? now()
    queue.entries.push(stored)
    writeQueue(queue)
    return structuredClone(stored)
  }

  /** One entry, read afresh. */
  function readEntry(id) {
    return structuredClone(theEntryIn(readQueue(), id))
  }

  /** Every entry, in the order the queue added them. */
  function entries() {
    return structuredClone(readQueue().entries)
  }

  /**
   * One lane's entries, in queue order, narrowed to the states asked for when any are.
   * @param {string} [lane]
   * @param {string[] | null} [states]
   */
  function theLane(lane = resolved, states = null) {
    return structuredClone(
      readQueue().entries.filter((entry) => entry.lane === lane && (states === null || states.includes(entry.state))),
    )
  }

  /**
   * REPORT ONE STEP AND APPLY THE MOVE THE SHARED TABLE MAKES.
   *
   * The table is `theMoveAStepMakes` in src/shared/merge-queue.ts: the office's state machine calls it
   * first and this keeper calls the same function, so each evidence-free move is written once and the
   * two keepers cannot drift apart there.
   *
   * THE TWO RECORD-RESTING MOVES A PROJECT ALONE CAN MAKE (measurement 2e): `pinned` from `submitted`
   * goes straight to `judged`, because a project running the tool alone has no inspector's release to
   * wait for; and `integrated` from `integrating` goes straight to `testing`, because there is no
   * verdict to re-check. Every other record-resting step is refused: this keeper has no records.
   */
  function step(id, name, facts = {}) {
    if (!MERGE_STEPS.includes(name)) {
      throw new Error(`The local keeper does not know the step "${String(name)}"; a merge tool reports one of ${MERGE_STEPS.join(', ')}. Nothing was written.`)
    }
    const queue = readQueue()
    const entry = theEntryIn(queue, id)

    // The lane takes one entry at a time. The table does not know about lanes, so the keeper checks it
    // before the move from judged, and writes nothing when another entry in this queue holds the lane.
    if (name === 'integrating') {
      const lane = entry.lane ?? resolved
      const holder = queue.entries.find(
        (other) => other !== entry && other.lane === lane && MERGE_STATE_SPECS[other.state]?.occupiesTheLane === true,
      )
      if (holder !== undefined) {
        throw new Error(`The lane "${lane}" is held by merge entry ${holder.id} in state ${holder.state}, so merge entry ${id} cannot take it. Nothing was written.`)
      }
    }

    const happened = { ...facts, step: name }
    if (name === 'main-moved' || name === 'main-moved-while-testing') {
      happened.attempts = typeof entry.attempts === 'number' ? entry.attempts : 0
    }
    const move = theMoveAStepMakes(entry.state, happened)
    const from = entry.state
    const at = now()

    if (move.move === 'refused') {
      const noRecords = RECORD_RESTING_STEPS.includes(name) ? ' The local keeper has no records for this step, so it cannot take it from any state.' : ''
      throw new Error(`The step "${name}" is taken from ${move.takenFrom}, and merge entry ${id} is in ${from}; the entry is ${move.final ? 'final' : 'not final'}.${noRecords} Nothing was written.`)
    }
    if (move.move === 'needs') {
      throw new Error(`The step "${name}" needs the fact "${move.fact}", and none was given. Nothing was written.`)
    }
    if (move.move === 'to') {
      entry.state = move.state
      if (move.attempts !== undefined) entry.attempts = move.attempts
      if (move.runs !== undefined) entry.runs = move.runs
      // THE OFFICE DROPS THE TESTED EVIDENCE when main moved under the entry: the tree it tested is no
      // longer the tree that will land, so its tests are evidence for nothing.
      if (name === 'main-moved' || name === 'main-moved-while-testing') delete entry.tested
    } else if (move.move === 'bounce') {
      entry.state = 'bounced'
      entry.bounced = { reason: move.reason, at, facts }
      if (move.attempts !== undefined) entry.attempts = move.attempts
      if (move.runs !== undefined) entry.runs = move.runs
    } else if (move.move === 'stays') {
      entry.state = from
      entry.stayed = { because: move.because, at }
      if (move.runs !== undefined) entry.runs = move.runs
    } else {
      if (name === 'pinned' && from === 'submitted') entry.state = 'judged'
      // TAKING THE LANE IS THE PROJECT'S OWN MOVE (measurement 2e). The office checks a judged entry's
      // release and lane before the move; the local keeper checked the lane above, and it has no release
      // to read, so the move itself is written here and nowhere else.
      else if (name === 'integrating' && from === 'judged') entry.state = 'integrating'
      else if (name === 'integrated' && from === 'integrating') entry.state = 'testing'
      else throw new Error(`The step "${name}" rests on records, and the local keeper has no records for it. Nothing was written.`)
    }

    entry.history = [...(entry.history ?? []), { at, step: name, from, how: move.move, to: entry.state }]
    writeQueue(queue)
    return structuredClone(entry)
  }

  /** Record that a merge tool run started on this entry. It moves nothing. */
  function toolStarted(id, { session } = {}) {
    const queue = readQueue()
    const entry = theEntryIn(queue, id)
    entry.tool = { session, startedAt: now() }
    writeQueue(queue)
    return structuredClone(entry)
  }

  /**
   * RECORD THAT A MERGE TOOL RUN ENDED, THEN APPLY THE TOOL-RUN-ENDED MOVE.
   *
   * A run that ended where the tool does not act, or on a final entry, leaves only the record of its
   * end. Everywhere else the table decides: below the tool-runs limit the entry is asked for again (it
   * moves to the state it is in), at the limit a testing entry bounces as stalled and a landing entry
   * stays for a person to look at. The local keeper has no resolution checks, so a resolution never
   * waits for the tool here.
   */
  function toolEnded(id, { session, reason } = {}) {
    const queue = readQueue()
    const entry = theEntryIn(queue, id)
    const at = now()
    entry.tool = {
      ...(entry.tool ?? {}),
      ...(session === undefined ? {} : { session }),
      endedAt: at,
      reason,
    }

    // A JUDGED ENTRY WHOSE LANE ANOTHER ENTRY HOLDS IS NOT A STALL. The tool's move from judged is to
    // take the lane, and the keeper refuses that while another entry holds it, so a run that ended there
    // had nothing it could do. It counts no run and leaves the entry judged for when the lane is free.
    if (entry.state === 'judged') {
      const lane = entry.lane ?? resolved
      const holder = queue.entries.find(
        (other) => other !== entry && other.lane === lane && MERGE_STATE_SPECS[other.state]?.occupiesTheLane === true,
      )
      if (holder !== undefined) {
        const runs = typeof entry.runs === 'number' ? entry.runs : 0
        entry.stalls = {
          runs,
          says: `Merge entry ${id} stays judged: the lane "${lane}" is held by merge entry ${holder.id} in state ${holder.state}, so this run counted no tool run toward the limit (${String(runs)} counted on this arrival).`,
        }
        entry.history = [...(entry.history ?? []), { at, step: A_TOOL_RUN_ENDED, from: entry.state, how: 'stays', to: entry.state }]
        writeQueue(queue)
        return structuredClone(entry)
      }
    }

    const first = theMoveAStepMakes(entry.state, { step: A_TOOL_RUN_ENDED, aResolutionWaits: false })
    if (first.move === 'stays' && (first.because === 'final' || first.because === 'the-tool-does-not-act-here')) {
      writeQueue(queue)
      return structuredClone(entry)
    }

    const from = entry.state
    const move = theMoveAStepMakes(entry.state, {
      step: A_TOOL_RUN_ENDED,
      aResolutionWaits: false,
      runs: typeof entry.runs === 'number' ? entry.runs : 0,
    })
    if (move.move === 'to') {
      entry.state = move.state
      if (move.runs !== undefined) entry.runs = move.runs
    } else if (move.move === 'bounce') {
      entry.state = 'bounced'
      entry.bounced = { reason: move.reason, at, facts: { session, reason } }
      if (move.runs !== undefined) entry.runs = move.runs
    } else if (move.move === 'stays') {
      entry.state = from
      entry.stayed = { because: move.because, at }
      if (move.runs !== undefined) entry.runs = move.runs
    } else {
      throw new Error(`The local keeper could not apply the tool-run-ended move in state ${from}. Nothing was written.`)
    }

    entry.history = [...(entry.history ?? []), { at, step: A_TOOL_RUN_ENDED, from, how: move.move, to: entry.state }]
    writeQueue(queue)
    return structuredClone(entry)
  }

  /** The seat lock as it is on disk: absent, readable with its holder, or unreadable. */
  function theSeatOnDisk() {
    if (!existsSync(place.seatFile)) return null
    try {
      const holder = JSON.parse(readFileSync(place.seatFile, 'utf8'))
      if (holder !== null && typeof holder === 'object' && Number.isInteger(holder.pid) && typeof holder.startedAt === 'string') {
        return { holder }
      }
      return { unreadable: true }
    } catch {
      return { unreadable: true }
    }
  }

  /** Whether the process a lock names is still the one that wrote it: the pid runs and began when the lock says. */
  function aLiveProcessHoldsIt(holder) {
    const began = startTimeOf(holder.pid)
    return began !== null && localStamp(began) === holder.startedAt
  }

  /**
   * TAKE THE ONE FULL-SUITE SEAT. The lock is created with the exclusive flag, so two starts cannot both
   * make it. A lock whose process is gone, or now has another start time, is stale and is cleared; a lock
   * that cannot be read is a refusal, because the keeper does not guess whether somebody holds it.
   */
  function takeTheSeat({ session } = {}) {
    const began = startTimeOf(process.pid)
    if (began === null) {
      return { seat: false, says: `The local keeper could not read when its own process ${String(process.pid)} began, so it cannot write a seat lock another run can check.` }
    }
    const mine = { session, pid: process.pid, startedAt: localStamp(began), at: now() }
    for (let tries = 0; tries < SEAT_TRIES; tries += 1) {
      try {
        writeFileSync(place.seatFile, `${JSON.stringify(mine, null, 2)}\n`, { flag: 'wx' })
        return { seat: true, file: place.seatFile }
      } catch (error) {
        if (error?.code !== 'EEXIST') {
          return { seat: false, says: `The local keeper could not write the seat lock ${place.seatFile}: ${error instanceof Error ? error.message : String(error)}.` }
        }
      }
      const held = theSeatOnDisk()
      if (held === null) continue
      if (held.unreadable === true) {
        return { seat: false, says: `The seat lock ${place.seatFile} could not be read, so the local keeper cannot tell whether another run holds the seat.` }
      }
      if (aLiveProcessHoldsIt(held.holder)) {
        return { seat: false, says: `The suite seat is held by run ${held.holder.session ?? 'a run that gave no session'} (process ${String(held.holder.pid)}), which is still running at ${held.holder.startedAt}.` }
      }
      try {
        rmSync(place.seatFile)
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          return { seat: false, says: `The local keeper could not clear the stale seat lock ${place.seatFile}: ${error instanceof Error ? error.message : String(error)}.` }
        }
      }
    }
    return { seat: false, says: `The seat lock ${place.seatFile} did not settle after ${String(SEAT_TRIES)} tries, so the local keeper left it alone.` }
  }

  /** Release the seat only when the lock is this process's own; anything else is left exactly where it is. */
  function releaseTheSeat() {
    const held = theSeatOnDisk()
    if (held === null) return { released: false, says: `There is no seat lock at ${place.seatFile} to release.` }
    if (held.unreadable === true) {
      return { released: false, says: `The seat lock ${place.seatFile} could not be read, so this run cannot tell whether it wrote it; nothing was removed.` }
    }
    const began = startTimeOf(process.pid)
    if (began === null) {
      return { released: false, says: `The local keeper could not read when its own process ${String(process.pid)} began, so it cannot tell whether the lock at ${place.seatFile} is its own; nothing was removed.` }
    }
    if (held.holder.pid !== process.pid || held.holder.startedAt !== localStamp(began)) {
      return { released: false, says: `The seat lock ${place.seatFile} belongs to run ${held.holder.session ?? 'a run that gave no session'} (process ${String(held.holder.pid)}), not to this run; nothing was removed.` }
    }
    rmSync(place.seatFile, { force: true })
    return { released: true }
  }

  /** The lock's holder and file, or null when there is none or it cannot be read. */
  function seatHolder() {
    const held = theSeatOnDisk()
    return held === null || held.unreadable === true ? null : { holder: structuredClone(held.holder), file: place.seatFile }
  }

  return { place, readEntry, entries, theLane, addAnEntry, step, toolStarted, toolEnded, takeTheSeat, releaseTheSeat, seatHolder }
}
