// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL THAT RUNS TESTS UNDER A RUN'S KEY REGISTERS ITS OWN PROCESS ON THE LEDGER, AND RELEASES IT ON EVERY WAY IT ENDS.
 *
 * Chapter 2 asks that anything which outlives its command be registered on the run that started it, and released when
 * it ends. tools/run-named-tests.mjs does both here (theToolsOwnRow) whenever it is about to run tests and holds a
 * run's key, whether or not it was started with --background.
 *
 * THE DOOR IS THE LEDGER'S OWN, AS THE LIVE OFFICE HAS IT. The row is POST /api/resources with type `process`, the
 * tool's own pid as the key and its start time, as the process reader reads it, in `osStartedAt`. The door checks that
 * time against the machine, so the row cannot name a later process with the same pid, and it records the command line
 * itself. The request goes on the run in MOLE_OFFICE_SESSION, with the same headers and key the tool's use line goes
 * with (theKeyForAWriteOnTheRun in tools/use-line.mjs).
 *
 * THE RELEASE SIGNALS NOTHING. It is POST /api/resources/<row>/release with {"signalNothing":true}: the door closes the
 * row and leaves the process alone, because the process the row names is the one sending the request. A release by
 * process group would stop the tool itself. It is asked once, after the use line, on a normal end, on a failure, on
 * SIGTERM, SIGINT and SIGHUP, and when the process that started the batch has ended (tools/a-group-of-its-own.mjs). A
 * signal then ends the tool by that same signal. When the release fails, the tool says so on stderr and leaves the row
 * to the ledger, which reads the process as gone once it has ended. It is not asked again.
 *
 * THE ROW IS THE BATCH'S OWN GROUP'S. The tool runs as the leader of a process group of its own, so the row names that
 * group's leader. Inside a sandbox the key is the pid the tool sees in its container, and the office reads it there
 * (whatTheDoorMakesOfTheCaller in src/server/api/resources.ts). The seat ask names this row as the holder inside a
 * sandbox, in place of the sandbox's row for the agent that started the batch, so it is answered with the row's `id`,
 * or with why there is none.
 *
 * A REFUSED REGISTRATION IS SAID. No office, no run, no project, no agent, no key, a refusal, or no answer: the
 * tool says once on stderr that it is not registered, and why. The separate seat ask decides whether tests can run.
 *
 * WHAT IT DOES NOT COVER. An uncaught error in the tool itself ends it without the release. Node prints the error, and
 * the row is left to the ledger as above. A kill -9 of the batch itself releases nothing; the ledger reads the process
 * as gone.
 */

import { askTheOffice, officeHeaders } from './sandbox-common.mjs'
import { theKeyForAWriteOnTheRun } from './use-line.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'
import { clockStamp } from '../src/shared/time.ts'

/** The signals the row is released on, with the exit code a shell gives a process each one ends. */
const THE_SIGNALS = /** @type {const} */ ([['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]])

/**
 * WHAT THE TOOL SAYS WHEN --background IS GIVEN. The flag is still taken, so every caller that passes it keeps working,
 * and it no longer changes what the tool does: the row is written whenever tests run under a run's key. Said once.
 */
export const THE_BACKGROUND_FLAG_IS_STILL_TAKEN =
  "run-named-tests: --background is still taken, and it no longer changes anything: the tool registers its own process while it runs tests under a run's key, whether or not it is given."

/**
 * A run with no row: it ends with its exit code, and asks the ledger nothing.
 * @type {{ end: (code: number) => Promise<never>, release: () => Promise<void> }}
 */
export const NO_ROW = { end: async (code) => process.exit(code), release: async () => {} }

/**
 * REGISTER THIS PROCESS ON THE RUN THE ENVIRONMENT NAMES, and answer how the tool ends: `end(code)` releases the row
 * and exits with the code, or with the signal that stopped the tool. `release()` releases it and goes on. `row` is the
 * row's id, or null and why it was not written. Answers NO_ROW, having said why once, when the row was not written.
 * Never throws on a refusal or on an office that does not answer.
 *
 * @param {{ api: string | undefined, workspace: string | undefined, agent: string | undefined, session: string | undefined, configuration: string | undefined, refused?: string }} office
 *   the office as theOfficeInThisEnvironment in tools/use-line.mjs reads it
 * @param {(words: string) => void} [say]
 * @returns {Promise<{ end: (code: number) => Promise<never>, release: () => Promise<void>, row: { id: string } | { id: null, why: string } }>}
 */
export async function theToolsOwnRow(office, say = (words) => console.error(words)) {
  const { api, workspace, agent, session } = office
  const notRegistered = (why) => {
    say(`run-named-tests: this run of the tests is not registered on the ledger: ${why}`)
    return { ...NO_ROW, row: { id: null, why: `its own process is not registered on the ledger: ${why}` } }
  }
  const unset = (value) => value === undefined || value === null || value.trim() === ''
  if (typeof office.refused === 'string') return notRegistered(office.refused)
  if (unset(api)) return notRegistered('no office was named, because MOLE_OFFICE_API is not set.')
  if (unset(session)) return notRegistered('no run was named, because MOLE_OFFICE_SESSION is not set.')
  if (unset(workspace)) return notRegistered('no project was named, because MOLE_OFFICE_WORKSPACE is not set.')
  if (unset(agent)) return notRegistered("MOLE_OFFICE_AGENT is not set, and a row is never written in the person's name.")
  const theKey = theKeyForAWriteOnTheRun(office)
  if (theKey.key === null) {
    return notRegistered(theKey.why === null
      ? 'this shell holds no key and names no office tool configuration.'
      : `this shell holds no key, and ${theKey.why}.`)
  }
  const address = String(api).replace(/\/+$/, '')
  const headers = officeHeaders({ workspace, agent, session, ...(theKey.key === undefined ? {} : { key: theKey.key }) })
  const startedAt = theProcessReader().startTimeOf(process.pid)
  const body = { type: 'process', key: String(process.pid), ...(startedAt === null ? {} : { osStartedAt: clockStamp(() => startedAt).instant }) }
  const held = await askTheOffice(address, '/api/resources', { method: 'POST', headers, body })
  if (held.status === null) return notRegistered(`the office at ${address} did not answer (${String(held.why)}).`)
  const id = held.body?.resource?.id
  if (held.status !== 201 || typeof id !== 'string' || id === '') {
    return notRegistered(`the office answered ${String(held.status)}: ${String(held.body?.error ?? JSON.stringify(held.body)).slice(0, 500)}.`)
  }
  say(`run-named-tests: registered on the ledger as row ${id}, process ${String(process.pid)}, on the run ${String(session)}. The row is released when the tool ends.`)

  /** @type {Promise<void> | null} */
  let releasing = null
  const release = () => (releasing ??= (async () => {
    const released = await askTheOffice(address, `/api/resources/${encodeURIComponent(id)}/release`, { method: 'POST', headers, body: { signalNothing: true } })
    if (released.status !== null && released.status >= 200 && released.status < 300) return
    const why = released.status === null
      ? `the office at ${address} did not answer (${String(released.why)}).`
      : `the office answered ${String(released.status)}: ${String(released.body?.error ?? JSON.stringify(released.body)).slice(0, 500)}.`
    say(`run-named-tests: the ledger row ${id} was not released: ${why} It is left to the ledger, which reads this process as gone once it has ended. It is not asked again.`)
  })())
  /** @type {NodeJS.Signals | null} */
  let stoppedBy = null
  /** @param {number} code */
  const end = async (code) => {
    await release()
    // THE SIGNAL ENDS THE TOOL, as it would have with no row: its handler was taken off when it ran, so this one is
    // the default and the process ends by it here.
    if (stoppedBy !== null) process.kill(process.pid, stoppedBy)
    return process.exit(code)
  }
  for (const [signal, code] of THE_SIGNALS) {
    process.once(signal, () => {
      stoppedBy ??= signal
      void end(code)
    })
  }
  return { end, release, row: { id } }
}
