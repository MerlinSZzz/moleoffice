// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BATCH OF NAMED TEST FILES TAKES A SEAT FROM THE OFFICE BEFORE ITS FIRST FILE, AND GIVES IT BACK AFTER ITS LAST.
 *
 * The office keeps the pool `test-batches` (src/server/lib/slots.ts): three seats by default, and no new seat while the
 * machine's load or its free disk space is past a gate row's limit. tools/run-named-tests.mjs asks here before it
 * starts vitest, waits in line while it is told to, and gives the seat back when its last part has ended, whether the
 * files passed or failed.
 *
 * WHO HOLDS THE SEAT. A process group, as for every seat. tools/run-named-tests.mjs runs in a group of its own
 * (tools/a-group-of-its-own.mjs), and passes in the ledger row it wrote for its own process. Outside a sandbox it names
 * its own pid, so the seat is held by its own group. Inside a sandbox the tool's pid is numbered in the container and
 * means another process on this machine, so it names its own row, which the office has placed on this machine. It never
 * names the row it inherited in SANDBOX_PROCESS_ROW: that row is the agent's that started the batch, and the seat would
 * stay held until the agent ended. A sandbox batch whose own row was not written stops, and says why. Another tool,
 * which passes in no row, names SANDBOX_PROCESS_ROW inside a sandbox, as tools/sandbox-start.mjs does, and its own pid
 * elsewhere. The office gives back a seat whose group has ended.
 *
 * ONE GROUP, ONE ROW. The office answers a second ask from the same process group with the row that group already
 * has. A batch whose first ask is answered that way was started beside another batch of the same group: it is
 * refused. It says so, starts nothing, leaves the row to the batch that asked for it, and ends with exit code 1.
 *
 * NO OFFICE NAMED permits an unseated batch, with a sentence. When an office is named, a refusal, missing identity,
 * missing key or unanswered request stops the batch with its reason. A queued row is never a granted seat.
 *
 * THE SEAT IS GIVEN BACK ON EVERY WAY THE TOOL ENDS: after the last part, at any exit, and on SIGTERM, SIGINT and
 * SIGHUP. A signal then ends the tool by that signal, unless the tool has a handler of its own that ends it (the tool's
 * own process row). The give-back is tools/slot.mjs release, started with spawnSync, so it also runs inside an exit
 * handler. It is asked once. A kill -9 of the batch gives nothing back: the office gives the seat back when the holding
 * group has ended. Once the seat is given back its exit and signal listeners are taken off, so a tool that asks for
 * many seats in turn keeps none of them.
 *
 * ANOTHER TOOL TAKES A SEAT THE SAME WAY. The check tool (tools/the-inspector.mjs) holds one while its model runs, and
 * gives its own words, the process whose group holds the seat, and the key its asks go with.
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aDetailOfAFewKilobytes, askTheOffice, officeHeaders } from './sandbox-common.mjs'
import { theKeyForAWriteOnTheRun } from './use-line.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'
import { clockStamp } from '../src/shared/time.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The pool a batch of named test files sits in. */
export const TEST_BATCH_POOL = 'test-batches'

/** How long a batch at the front of the line waits before asking again. */
export const A_WAITING_BATCH_ASKS_EVERY_MS = 5_000

/** The longest a waiting batch waits between asks, however far back it is. */
export const A_WAITING_BATCH_ASKS_AT_MOST_EVERY_MS = 60_000

/**
 * HOW LONG TO WAIT BEFORE ASKING AGAIN, set by the place the office gave: five seconds at place 1, five seconds times
 * the place further back, and no more than a minute. A granted answer returns before this is asked. A queued answer
 * with no place (an older office, or one that did not place it) waits five seconds, the pace before this change, so it
 * never asks in a loop with no pause.
 */
export function waitBeforeAskingAgain(place) {
  if (typeof place !== 'number' || !Number.isFinite(place) || place < 1) return A_WAITING_BATCH_ASKS_EVERY_MS
  return Math.min(A_WAITING_BATCH_ASKS_EVERY_MS * place, A_WAITING_BATCH_ASKS_AT_MOST_EVERY_MS)
}

/** The words that open each line a batch says about its seat. */
const RUN_NAMED_TESTS = 'run-named-tests:'

/** The note a seat is given back with when the batch has ended. */
export const THE_BATCH_ENDED = 'the batch ended'

/** The note a seat is given back with when the batch was stopped by `signal`. */
export const stoppedBy = (signal) => `the batch was stopped by ${signal}`

/** The words that open the line a batch says when it runs without a seat. Why follows. */
export const WITHOUT_A_SEAT = `${RUN_NAMED_TESTS} this batch runs without a ${TEST_BATCH_POOL} seat: `

/**
 * What a batch in line says it waits for: the wait it really uses at its place, followed by the office's own words,
 * `says`. A batch at place 2 says 10 s; one at place 1, and one with no place, says 5 s.
 */
export const waitsForASeat = (says, position, opening = RUN_NAMED_TESTS) =>
  `${opening} waits for a ${TEST_BATCH_POOL} seat, asking again every ` +
  `${String(waitBeforeAskingAgain(position) / 1000)} s. ${says}`

/** What a batch says when its process group already has the row `id`, in `state`: it starts nothing. */
export const aSecondBatchIsRefused = (id, state, opening = RUN_NAMED_TESTS) =>
  `${opening} this process group already has the ${TEST_BATCH_POOL} row ${id} (${state}). A second batch in one process group is refused, so nothing was started.`

/** The words that open the line a batch says when the seat `id` was not given back. Why follows. */
export const notGivenBack = (id, opening = RUN_NAMED_TESTS) => `${opening} the ${TEST_BATCH_POOL} seat ${id} was not given back: `

/**
 * WHAT A BATCH SAYS ABOUT ITS SEAT, beside the lines that open with `opening`: why it runs without one, and the notes
 * its seat is given back with. Another tool gives its own.
 */
export const THE_WORDS_OF_A_BATCH = {
  opening: RUN_NAMED_TESTS,
  /** @param {string} why */
  unseated: (why) => `${WITHOUT_A_SEAT}${why} The tests run all the same.`,
  whenItEnds: 'when the batch ends',
  ended: THE_BATCH_ENDED,
  stoppedBy,
}

/** The signals the seat is given back on. */
const THE_SIGNALS = /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])

/**
 * ASK FOR A TEST-BATCH SEAT AND WAIT FOR IT, and answer how it is given back: `giveBack(note)`. Answers a seat with
 * nothing to give back, having said why, when no office is named. A named office that cannot grant a seat, or that
 * answers with a row this process group already has, stops the batch with a sentence saying why.
 *
 * The answer also says when the seat was asked for, granted and given back, as instants (null when that did not
 * happen), `why` there is no seat when there is none, and why a seat was not given back when it was not.
 *
 * @param {{ api: string | undefined, workspace: string | undefined, agent: string | undefined, session: string | undefined, configuration: string | undefined, refused?: string }} office
 *   the office as theOfficeInThisEnvironment in tools/use-line.mjs reads it
 * @param {string} detail what the batch runs, in a few words
 * @param {(words: string) => void} [say]
 * @param {{ words?: typeof THE_WORDS_OF_A_BATCH, pid?: number, key?: () => ({ key: string } | { key: null, why: string }), row?: { id: string } | { id: null, why: string } }} [asked]
 *   from run-named-tests: the ledger row it wrote for its own process, or why there is none, which holds the seat
 *   inside a sandbox. From another tool: its words, the process whose group holds the seat when no sandbox row is
 *   named (this process by default), and the key its asks go with in place of the run's
 * @returns {Promise<{ giveBack: (note: string) => void, id: string | null, askedAt: string | null, grantedAt: string | null, givenBackAt: string | null, why: string | null, whyNotGivenBack: string | null }>}
 */
export async function aTestBatchSeat(office, detail, say = (words) => console.error(words), asked = {}) {
  const { api, workspace, agent, session } = office
  const words = asked.words ?? THE_WORDS_OF_A_BATCH
  const seat = { giveBack: (/** @type {string} */ note) => {}, id: null, askedAt: null, grantedAt: null, givenBackAt: null, why: null, whyNotGivenBack: null }
  const withoutASeat = (why) => {
    if (!unset(api) || typeof office.refused === 'string') throw new Error(`${words.opening} cannot start without a ${TEST_BATCH_POOL} seat: ${why}`)
    say(words.unseated(why))
    seat.why = why
    return seat
  }
  const unset = (value) => value === undefined || value === null || value.trim() === ''
  if (typeof office.refused === 'string') return withoutASeat(office.refused)
  if (unset(api)) return withoutASeat('no office was named, because MOLE_OFFICE_API is not set.')
  if (unset(session)) return withoutASeat('no run was named, because MOLE_OFFICE_SESSION is not set.')
  if (unset(workspace)) return withoutASeat('no project was named, because MOLE_OFFICE_WORKSPACE is not set.')
  if (unset(agent)) return withoutASeat("MOLE_OFFICE_AGENT is not set, and a seat is never asked for in the person's name.")
  const theKey = asked.key === undefined ? theKeyForAWriteOnTheRun(office) : asked.key()
  if (theKey.key === null) {
    if (asked.key !== undefined) return withoutASeat(String(theKey.why))
    return withoutASeat(theKey.why === null
      ? 'this shell holds no key and names no office tool configuration.'
      : `this shell holds no key, and ${theKey.why}.`)
  }

  const inASandbox = !unset(process.env['SANDBOX_DIR'])
  const row = asked.row === undefined ? process.env['SANDBOX_PROCESS_ROW'] : inASandbox ? asked.row.id : null
  const pid = asked.pid ?? process.pid
  if (unset(row) && inASandbox) {
    return withoutASeat(asked.row === undefined
      ? 'SANDBOX_PROCESS_ROW is not set. Start the batch with node tools/sandbox-start.mjs --wait -- node tools/run-named-tests.mjs <files>.'
      : asked.row.why)
  }
  let holder
  if (!unset(row)) {
    holder = { resource: String(row) }
  } else {
    const at = theProcessReader().startTimeOf(pid)
    if (at === null) return withoutASeat(`the start time of ${pid === process.pid ? 'this process' : 'the process that holds the seat'}, pid ${String(pid)}, could not be read.`)
    holder = { pid, startedAt: clockStamp(() => at).instant }
  }
  const address = String(api).replace(/\/+$/, '')
  const headers = officeHeaders({ workspace, agent, session, ...(theKey.key === undefined ? {} : { key: theKey.key }) })
  const body = { pool: TEST_BATCH_POOL, ...holder, detail: aDetailOfAFewKilobytes(detail) }

  /** The row this batch put in line, once the office has answered with one. */
  let id = null
  let given = false
  /** @param {string} note */
  const giveBack = (note) => {
    forget()
    if (id === null || given) return
    given = true
    const back = spawnSync(
      process.execPath,
      [join(HERE, 'slot.mjs'), 'release', id, '--session', String(session), '--as', String(agent), '--workspace', String(workspace), '--api', address, '--note', note],
      { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...(theKey.key === undefined ? {} : { MOLE_AGENT_KEY: theKey.key }) } },
    )
    if (back.status === 0) {
      seat.givenBackAt = clockStamp().instant
      say(`${words.opening} gave the ${TEST_BATCH_POOL} seat ${id} back.`)
      return
    }
    const why = String(back.stderr ?? '').trim() || (back.error === undefined ? `tools/slot.mjs exited ${String(back.status ?? back.signal)}` : back.error.message)
    seat.whyNotGivenBack = why
    say(`${notGivenBack(id, words.opening)}${why} ${'resource' in holder
      ? `It stays held until it is given back with node tools/slot.mjs release ${id}, or the process of the row ${holder.resource} ends.`
      : `The office gives it back once process group ${String(holder.pid)} has ended.`} It is not asked again.`)
  }
  seat.giveBack = giveBack
  /** Takes the exit and signal listeners off, once there is nothing more to give back. */
  const forget = () => {
    process.off('exit', onExit)
    for (const [signal, listener] of onASignal) process.off(signal, listener)
  }
  const onExit = () => giveBack(words.ended)
  const onASignal = THE_SIGNALS.map((signal) => /** @type {const} */ ([signal, () => {
    giveBack(words.stoppedBy(signal))
    // THE SIGNAL ENDS THE TOOL, as it would have with no seat, unless the tool's own handler is there to end it.
    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
  }]))
  process.on('exit', onExit)
  for (const [signal, listener] of onASignal) process.prependOnceListener(signal, listener)

  let lastSaid = null
  let lastWait = null
  seat.askedAt = clockStamp().instant
  for (let first = true; ; first = false) {
    const reply = await askTheOffice(address, '/api/slots/acquire', { method: 'POST', headers, body })
    if (reply.status === null) {
      if (id !== null) giveBack('the seat request could not be completed')
      else forget()
      return withoutASeat(`the office at ${address} did not answer (${String(reply.why)}).`)
    }
    const slot = reply.body?.slot
    if (reply.status !== 200 || typeof slot?.id !== 'string' || (slot.state !== 'granted' && slot.state !== 'queued')) {
      if (id !== null) giveBack('the seat request could not be completed')
      else forget()
      return withoutASeat(`the office answered ${String(reply.status)}: ${String(reply.body?.error ?? JSON.stringify(reply.body)).slice(0, 500).replace(/\.$/, '')}.`)
    }
    if (first && reply.body.asked === 'again') {
      forget()
      throw new Error(aSecondBatchIsRefused(slot.id, String(slot.state), words.opening))
    }
    id = slot.id
    seat.id = id
    const says = String(reply.body.says ?? '')
    if (slot.state === 'granted') {
      seat.grantedAt = clockStamp().instant
      say(`${words.opening} ${says}`)
      return seat
    }
    const wait = waitBeforeAskingAgain(slot.position)
    if (says !== lastSaid || wait !== lastWait) say(waitsForASeat(says, slot.position, words.opening))
    lastSaid = says
    lastWait = wait
    await new Promise((waitFor) => setTimeout(waitFor, wait))
  }
}
