// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE KEEPER: every function of the merge tool whose own body sends a request to the office, and the entry's
 * sandbox, which tools/sandbox.mjs registers in the office's ledger. That is the step and tool doors, the entry and
 * its records, the seal, the lane, the full-suite seat, the office's health, and the read-back of a landed file.
 * Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { cpus, freemem, loadavg, totalmem } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { MIGRATION_JOURNAL, probeWaitingEntries } from './early-conflicts.mjs'
import { tryTheRebaseEarly } from './rebase-with-joins.mjs'
import { startCleanup, keepForCleanup, AN_OFFICE_ANSWER_DURING_A_SUITE_MS } from './cleanup.mjs'

import { REQUEST_TIMEOUT_MS, SANDBOX_DISK_FLOOR } from '../sandbox-common.mjs'
import { TEST_BATCH_POOL } from '../test-batch-seat.mjs'

import { KEY_HEADER } from '../../src/config/key-header.mjs'
import { STAND_IN_HEADER } from '../../src/config/stand-in-header.mjs'
import { theOfficeKey } from '../../src/config/office-key.mjs'
import { startTimeOf, theProcessAt } from '../../src/config/session-process.mjs'
import { MERGE_STATES, MERGE_STATE_SPECS, askTheMergeList, inTheLanesOrder } from '../../src/shared/merge-queue.ts'
import { localStamp } from '../../src/shared/time.ts'
import { readAFullList } from '../a-full-list-read.mjs'
import { API, LOG, RERUN_LIMITS, STATE_FILE, STEPS_FILE, THIS_CHECKOUT, WORKDIR, WORKSPACE, chosen, withThePairing } from './arguments.mjs'
import { MergerFailure, fail, log, readState, readStateAt, stamp, writeState, writeStateAt } from './log-and-state.mjs'
import { cleanEnvironment, git, hashOfPath, probeGit, run, sha256, tryGit } from './git.mjs'
import { theOfficeRunsFrom } from './the-stable-office.mjs'
import { theEntriesTheQueueCouldNotRead } from './unreadable-entries.mjs'
import { removeTheResolution, whetherTheResolutionGoes } from './ended-resolutions.mjs'
import { theCommandInTheSandbox } from './plain-logs.mjs'
import { officeHealthPosition } from '../../src/config/integration-guards.mjs'

// ============================================================================ the office

/** THE OFFICE'S OWN KEY ON THE ONE HEADER IT TRAVELS ON, read per request, as the inspector does. */
function theOfficeKeyHeader() {
  const held = theOfficeKey()
  return held.key === null ? {} : { [KEY_HEADER]: held.key }
}

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': chosen.as,
  ...(chosen.session === null ? {} : { 'x-mole-office-session': chosen.session }),
  'x-mole-office-purpose': 'module-work',
}

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** The words written beside an error's message when the error gave no cause, such as a request that ran out of time. */
export const NO_CAUSE_GIVEN = 'the error gave no cause'

/**
 * WHAT A REQUEST WITH NO ANSWER SAYS. Node's fetch says only "fetch failed"; why is in the error's cause, which has a
 * code, such as UND_ERR_SOCKET, and its own words. Both are written beside the message, so a kept log says why the
 * office did not answer. A cause with no code says so, and so does an error with no cause.
 */
function whatTheRequestSaid(err) {
  if (!(err instanceof Error)) return String(err)
  const cause = /** @type {any} */ (err).cause
  if (cause === undefined || cause === null) return `${err.message}; ${NO_CAUSE_GIVEN}`
  const code = typeof cause.code === 'string' ? cause.code : 'no code'
  const words = cause instanceof Error ? cause.message : String(cause)
  return `${err.message}; its cause: ${code}, ${words}`
}

/** How often the office's health is asked while a suite runs. How long one answer may take is AN_OFFICE_ANSWER_DURING_A_SUITE_MS. */
const OFFICE_HEALTH_EVERY_MS = 15_000
/** Bytes in a mebibyte, for the machine's memory as the office's health keeps it. */
const MIB = 1024 * 1024

/**
 * HOW FAST THE OFFICE ANSWERS WHILE A SUITE RUNS (acceptance finding 64). At 04:14 on 24
 * September 2026 the office took over 10 seconds to answer its health while the queue's suite ran at 8 workers beside
 * another wave's and two checks, and a sandbox's down gave up on it. The suite's worker count and the office's own
 * responsiveness may pull against each other, so the time is recorded on the entry before anything is decided: GET
 * /api/health once as the suite starts and every 15 seconds after, each answer timed. `stop` waits for the asks in
 * flight and answers the counts, the median and the slowest; an ask with no answer within AN_OFFICE_ANSWER_DURING_A_SUITE_MS
 * (cleanup.mjs) counts as none.
 *
 * AND THE MACHINE BESIDE IT, read at the same moments (the rule to scale the office up step by step until the machine
 * itself is the bottleneck): the 1-minute
 * load average, and the memory the kernel says new work can have without swapping (MemAvailable, which is what
 * os.freemem() reads on Linux; MemFree is far smaller and is not it). The lowest available memory is what the secretary asked
 * for above all. The machine's CPU count and total memory are kept with them, so a load or a floor can be read against
 * what the machine has. This tool runs on the host, so these are the host's figures, whatever the suite's sandbox sees.
 */
export function theOfficeHealthWhile() {
  const times = []
  let unanswered = 0
  const loads = []
  const availableMiB = []
  const inFlight = new Set()
  const once = () => {
    loads.push(Math.round(loadavg()[0] * 100) / 100)
    availableMiB.push(Math.round(freemem() / MIB))
    const started = Date.now()
    const asked = fetch(`${API}/api/health`, { signal: AbortSignal.timeout(AN_OFFICE_ANSWER_DURING_A_SUITE_MS) })
      .then(async (res) => {
        await res.arrayBuffer()
        times.push(Date.now() - started)
      })
      .catch(() => {
        unanswered += 1
      })
      .finally(() => inFlight.delete(asked))
    inFlight.add(asked)
  }
  once()
  const timer = setInterval(once, OFFICE_HEALTH_EVERY_MS)
  return {
    stop: async () => {
      clearInterval(timer)
      await Promise.allSettled([...inFlight])
      const sorted = [...times].sort((a, b) => a - b)
      const byLoad = [...loads].sort((a, b) => a - b)
      const byMemory = [...availableMiB].sort((a, b) => a - b)
      return {
        samples: times.length + unanswered,
        answered: times.length,
        unanswered,
        medianMs: sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)],
        maxMs: sorted.length === 0 ? null : sorted[sorted.length - 1],
        over10s: times.filter((ms) => ms > 10_000).length,
        everySeconds: OFFICE_HEALTH_EVERY_MS / 1000,
        // The machine is read at every sample, the first as the suite starts, so neither list is ever empty. The median
        // is taken as the office's answer time's is, the upper of the two middle values.
        load1Median: byLoad[Math.floor(byLoad.length / 2)],
        load1Max: byLoad[byLoad.length - 1],
        availableMemoryMiBMedian: byMemory[Math.floor(byMemory.length / 2)],
        availableMemoryMiBLowest: byMemory[0],
        cpus: cpus().length,
        memoryMiB: Math.round(totalmem() / MIB),
      }
    },
  }
}

/**
 * One request to the office. The office restarts on every landed merge, so a connection nobody
 * answers is waited out — every few seconds, up to --office-for — and only then is a failure.
 *
 * THE STAND-IN'S 503 IS WAITED OUT THE SAME WAY. The dev supervisor's stand-in answers while no server
 * runs, during every restart after a landing too, and says nothing was read or written (wave 13x,
 * round 8). A cleanup read waits for it only until its own `until`.
 *
 * A WRITE IS ASKED AGAIN ONLY WHEN THE CONNECTION WAS REFUSED, because then it never reached the
 * office. A write whose connection broke after it went out may have been written, and a step or a
 * slot asked for twice is not known to be safe, so that is a failure. A read is asked again
 * whatever went wrong.
 */
export async function ask(method, path, body = undefined, { raw = false, retry = true, until = Date.now() + REQUEST_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + chosen.officeFor * 1000
  let saidNothing = null
  for (;;) {
    if (!retry && Date.now() >= until) fail(`The sandbox cleanup wait ended before asking ${method} ${path}.`)
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        ...(!retry ? { signal: AbortSignal.timeout(Math.max(1, until - Date.now())) } : {}),
        headers: { ...HEADERS, ...theOfficeKeyHeader() },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (res.status === 503 && res.headers.has(STAND_IN_HEADER)) {
        await res.arrayBuffer()
        if (Date.now() + 2000 < (retry ? deadline : until)) {
          log(`the dev supervisor answered ${method} ${path} for the office: no server is running, and nothing was written; asking again in 2 seconds`)
          await sleep(2000)
          continue
        }
        if (!retry) fail(`The office was restarting and did not come back before the cleanup wait ended (${method} ${path}).`)
        fail(`The office at ${API} was not running a server for ${String(chosen.officeFor)} seconds: the dev supervisor answered ${method} ${path} for it.`)
      }
      if (raw) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers }
      const text = await res.text()
      let parsed = null
      try {
        parsed = text === '' ? null : JSON.parse(text)
      } catch {
        parsed = { error: text }
      }
      return { status: res.status, body: parsed }
    } catch (err) {
      saidNothing = whatTheRequestSaid(err)
      if (!retry) fail(`The office did not answer cleanup read ${method} ${path} (${saidNothing}).`)
      const refused = /** @type {any} */ (err)?.cause?.code === 'ECONNREFUSED' || /** @type {any} */ (err)?.cause?.cause?.code === 'ECONNREFUSED'
      if (method !== 'GET' && !refused) {
        fail(`The office did not answer ${method} ${path} (${saidNothing}). The request may have reached it and been written, so it was not asked again.`)
      }
      if (Date.now() >= deadline) fail(`The office at ${API} did not answer ${method} ${path} for ${String(chosen.officeFor)} seconds (${saidNothing}).`)
      log(`the office did not answer ${method} ${path} (${saidNothing}); asking again in 2 seconds`)
      await sleep(2000)
    }
  }
}

function refusalIn(reply) {
  const body = reply.body
  if (body !== null && typeof body === 'object' && typeof body.error === 'string') return body.error
  return JSON.stringify(body)
}

/** Counts never stop a merge; a failed reply is said without sending the write again.
 * @param {string} id @param {string} position
 * @returns {Promise<{counted:true} | {counted:false, because:string}>}
 */
export async function countAGateMet(id, position) {
  if (theOfficeKey().key === null) {
    const because = `Gate "${id}" was not counted because the merge tool has no office key.`
    log(because)
    return {counted: false, because}
  }
  try {
    const reply = await ask('POST', `/api/office/gates/${encodeURIComponent(id)}/met`, {position}, {retry: false})
    if (reply.status === 200) return {counted: true}
    const because = `The office refused the count for gate "${id}" (${reply.status}): ${refusalIn(reply)}`
    log(because)
    return {counted: false, because}
  } catch (error) {
    const because = `The office did not confirm the count for gate "${id}": ${error instanceof Error ? error.message : String(error)}`
    log(because)
    return {counted: false, because}
  }
}


export async function readEntry() {
  const reply = await ask('GET', `/api/merge-queue/${encodeURIComponent(chosen.entry)}`)
  if (reply.status !== 200) fail(`The office would not give merge entry ${chosen.entry} (${String(reply.status)}): ${refusalIn(reply)}`)
  return reply.body.entry
}

/**
 * WHETHER THE RELATED TESTS RUN FIRST, as the office's setting says (the related-tests setting, part B; round 17c). A 404
 * is an office that has no such setting yet, which has not switched it on, so it is off and `says` names why. Any other
 * refusal stops the tool: an unreadable setting is not read as off.
 */
export async function theRelatedTestsFirstSetting() {
  const reply = await ask('GET', '/api/office/related-tests-first')
  if (reply.status === 404) return { on: false, leaveOutSlowerThanSeconds: null, says: `the office at ${API} has no related-tests-first setting (404), so it has not switched it on` }
  if (reply.status !== 200) fail(`The office would not say whether the related tests run first (${String(reply.status)}): ${refusalIn(reply)}`)
  return reply.body
}

async function readRecord(id) {
  const reply = await ask('GET', `/api/records/${encodeURIComponent(id)}`)
  if (reply.status !== 200) fail(`The office would not give record ${id} (${String(reply.status)}): ${refusalIn(reply)}`)
  return reply.body.record
}

/**
 * REPORT ONE STEP AND READ BACK WHAT THE SERVER MADE OF IT. The step door is the message worker's;
 * a 501 means the state machine is not built, and that is this tool's failure to report, not a
 * state to invent.
 *
 * THE LANE IS HELD (choice (a)). When the office refuses the integrating step with a
 * 409, the tool reads the entry and the lane back. If the entry is still judged and another entry holds the lane, it
 * answers the entry read back with `laneHeldBy`, the holder as the office's list names it, and the caller ends there.
 * Every other refusal fails as before. The refusal's own words decide nothing.
 *
 * AN OFFICE OLDER THAN THE FIELD placeholderCommits (wave 13q) refuses the integrated step that carries them, as a key its
 * step door does not know. Only that refusal, known by the door's own words and status, is answered: the step is sent
 * once more without the field, and the log names each commit and the position (tools/merge-tool/commit-addresses.mjs).
 * Any other refusal, of either send, fails as before. The second send can go once every office the tool talks to has
 * the field.
 *
 * AN OFFICE OLDER THAN THE FIELD failureLines (13u round 180) refuses the tested and red-on-main steps whose files carry
 * a red run's failure lines, as a key its step door does not know on each such file. That refusal alone, known in the
 * same way (tools/merge-tool/the-failure-lines.mjs), is answered by one more send without the lines, and the log says so.
 */
export async function step(name, facts, detail = null) {
  log(`step ${name}: ${JSON.stringify(facts).slice(0, 600)}`)
  appendFileSync(STEPS_FILE, `${JSON.stringify({ at: stamp(), step: name, facts, detail })}\n`)
  let reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/step`, { step: name, facts })
  if (reply.status === 409 && name === 'integrating') {
    const entry = await readEntry()
    const lanes = await theMergeList(entry.lane, MERGE_STATES.filter((one) => MERGE_STATE_SPECS[one].occupiesTheLane))
    const holder = lanes.status === 200 ? (lanes.body?.lanes ?? []).find((one) => one.lane === entry.lane)?.occupiedBy ?? null : null
    if (entry.state === 'judged' && holder !== null && holder.entry !== chosen.entry) {
      log(`the office refused the step integrating: ${refusalIn(reply)}`)
      return { ...entry, laneHeldBy: holder }
    }
  }
  if (reply.status !== 200 && name === 'integrated' && facts.placeholderCommits !== undefined) {
    const commitAddresses = await import('./commit-addresses.mjs')
    if (commitAddresses.theStepDoorDoesNotKnowTheKey({ status: reply.status, words: refusalIn(reply) }, name, 'placeholderCommits')) {
      const { placeholderCommits, ...without } = facts
      log(commitAddresses.theOfficeDidNotTakeThem(placeholderCommits, API, refusalIn(reply)))
      reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/step`, { step: name, facts: without })
    }
  }
  if (reply.status !== 200 && (name === 'tested' || name === 'red-on-main')) {
    const failureLines = await import('./the-failure-lines.mjs')
    if (failureLines.theStepDoorDoesNotKnowTheNestedKey({ status: reply.status, words: refusalIn(reply) }, name, facts, 'failureLines')) {
      log(failureLines.theOfficeDidNotTakeTheFailureLines(API, name, refusalIn(reply)))
      reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/step`, { step: name, facts: failureLines.withoutTheFailureLines(name, facts) })
    }
  }
  if (reply.status !== 200) fail(`The office refused the step "${name}" for merge entry ${chosen.entry} (${String(reply.status)}): ${refusalIn(reply)}`)
  if (typeof reply.body?.decided === 'string') log(`the office decided: ${reply.body.decided.slice(0, 600)}`)
  const entry = await readEntry()
  log(`the office answered: the entry is now ${entry.state}`)
  return entry
}

export async function toolStarted() {
  const reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/tool-started`, { session: chosen.session, log: LOG })
  if (reply.status !== 200) fail(`The office would not record this tool run's start (${String(reply.status)}): ${refusalIn(reply)}`)
}

export async function toolEnded(reason) {
  const reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/tool-ended`, { session: chosen.session, reason })
  if (reply.status !== 200) log(`the office would not record this tool run's end (${String(reply.status)}): ${refusalIn(reply)}`)
}

// ============================================================================ the entry's sandbox

/** The launcher every command of a submitted tree goes through: this checkout's own, unless a test says otherwise. */
const SANDBOX_TOOL = chosen.sandboxTool ?? join(THIS_CHECKOUT, 'tools', 'sandbox.mjs')
/** How much longer than the limit inside the container this process waits before stopping the exec itself. */
const EXEC_GRACE_MS = 2 * 60 * 1000

/**
 * THE ENTRY'S SANDBOX NAME: `merge-`, the entry id in the lower case docker wants, and six hex of its
 * sha256, so two ids that differ only in case stay two sandboxes.
 */
function theSandboxName() {
  const subject = chosen.takeBack === null ? chosen.entry : `take-back-${chosen.takeBack}`
  const slug = subject.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 20)
  return `merge-${slug}-${createHash('sha256').update(subject).digest('hex').slice(0, 6)}`
}

// ============================================================================ the entry's hold

/**
 * ONE MERGE TOOL RUN ACTS ON AN ENTRY AT A TIME (acceptance finding 80). On 25 September 2026 a second run started for
 * another entry while the first was still running its reruns. It found the entry's sandbox running, brought it
 * down and up again, and so killed the first run's rerun and failed the eight after it. Then the first run's ending
 * brought down the sandbox the second had started.
 *
 * So before a run does anything to its entry or its sandbox, it takes the entry's hold: a file in the entry's workdir
 * that names this run's session, its pid and when its process began. A hold whose process is still running, with the
 * same start time, belongs to another live run. The new run then stops, and touches neither the entry nor its sandbox.
 * A hold whose pid is gone, or now belongs to a process that began at another time, is stale, and the new run takes it
 * over.
 *
 * THE HOLDS ARE NUMBERED FILES in <workdir>/holds, and the highest number is the entry's hold. A run takes the hold by
 * making the next number with a hard link, which fails when the file is already there. So of two runs that start
 * together, one makes the file and the other finds it and reads it. A stale hold is replaced by the next number and is
 * kept: the tool deletes no hold (R5 keeps the workdir).
 */
const HOLDS = 'holds'

/** The latest hold in a workdir, or null when nobody has held that entry. `holder` is null when the file cannot be read. */
function theLatestHold(workdir) {
  const folder = join(workdir, HOLDS)
  if (!existsSync(folder)) return null
  const numbers = readdirSync(folder)
    .map((one) => /^([0-9]+)\.json$/u.exec(one))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]))
  if (numbers.length === 0) return null
  const number = Math.max(...numbers)
  const file = join(folder, `${String(number)}.json`)
  let holder = null
  try {
    const read = JSON.parse(readFileSync(file, 'utf8'))
    if (read !== null && typeof read === 'object' && Number.isInteger(read.pid) && typeof read.startedAt === 'string' && typeof read.session === 'string') holder = read
  } catch {
    holder = null
  }
  return { number, file, holder }
}

/** Whether the process a hold names is still the one that wrote it: the pid is running, and began when the hold says. */
function whatBecameOf(holder) {
  const started = startTimeOf(holder.pid)
  if (started === null) return { running: false, says: `process ${String(holder.pid)} is gone` }
  const began = localStamp(started)
  if (began !== holder.startedAt) return { running: false, says: `process ${String(holder.pid)} is now a process that began at ${began}, not at ${holder.startedAt}` }
  return { running: true, says: `process ${String(holder.pid)} is still running` }
}

/**
 * TAKE THE ENTRY'S HOLD, before anything else the run does. Answers `{ held: true }`, or `{ held: false, says }` when
 * another run holds the entry, or when the hold cannot be read and so nobody can tell whether one does.
 */
export function takeTheEntrysHold() {
  const subject = chosen.takeBack === null ? `merge entry ${chosen.entry}` : `hand-back ${chosen.takeBack}`
  const started = startTimeOf(process.pid)
  if (started === null) {
    fail(`This run could not read when its own process ${String(process.pid)} began, so it could not write a hold that another run can check. It touched neither the entry nor its sandbox.`)
  }
  const mine = { session: chosen.session, pid: process.pid, startedAt: localStamp(started), at: stamp() }
  const folder = join(WORKDIR, HOLDS)
  mkdirSync(folder, { recursive: true })
  // THE HOLD IS WRITTEN WHOLE FIRST, under a name only this process uses, and then linked to its number, so no run
  // ever reads half a hold.
  const written = join(folder, `.taking-${String(process.pid)}`)
  writeFileSync(written, `${JSON.stringify(mine, null, 2)}\n`)
  try {
    for (;;) {
      const latest = theLatestHold(WORKDIR)
      let stale = null
      if (latest !== null) {
        if (latest.holder === null) {
          return {
            held: false,
            says: `The hold ${latest.file} of ${subject} could not be read, so this run cannot tell whether another merge tool run holds the entry. This run touched neither the entry nor its sandbox.`,
          }
        }
        const became = whatBecameOf(latest.holder)
        if (became.running) {
          return {
            held: false,
            says: `Merge tool run ${latest.holder.session} (process ${String(latest.holder.pid)}) holds ${subject} and is still running, so this run touched neither the entry nor its sandbox.`,
          }
        }
        stale = { ...latest, says: became.says }
      }
      const file = join(folder, `${String((latest?.number ?? 0) + 1)}.json`)
      try {
        linkSync(written, file)
      } catch (err) {
        // ANOTHER RUN MADE THIS NUMBER FIRST: read the hold again, which is now that run's.
        if (err && err.code === 'EEXIST') continue
        throw err
      }
      if (stale === null) log(`this run holds ${subject}: ${file}`)
      else log(`this run took over the hold of ${subject} from run ${stale.holder.session}, because its ${stale.says}; the old hold ${stale.file} is kept, and this run's is ${file}`)
      return { held: true }
    }
  } finally {
    rmSync(written, { force: true })
  }
}

/**
 * THE LAUNCHER'S ENVIRONMENT: this process's, with the office's own key as the caller's key, because
 * the launcher knocks on the ledger as this run. It stays on the host: tools/sandbox.mjs passes no
 * office key into a container by any road. The launcher is this checkout's code and reads the office's settings, so it
 * is handed the pairing (arguments.mjs).
 */
export function theLaunchersEnvironment() {
  const held = theOfficeKey()
  return withThePairing(cleanEnvironment(held.key === null ? {} : { MOLE_AGENT_KEY: held.key }))
}

/** The words every launcher call ends with: who asks, for which session, in which project, where. */
function theLaunchersIdentity() {
  return ['--as', chosen.as, '--session', chosen.session, '--workspace', WORKSPACE, '--api', API, '--sandboxes', chosen.sandboxes]
}

/** One launcher call that returns at once (status, up, down, clear): its exit, stdout and stderr. */
function launcher(args, { bounded = false, until = Date.now() + REQUEST_TIMEOUT_MS } = {}) {
  if (bounded && Date.now() >= until) return { status: null, stdout: '', stderr: 'The sandbox cleanup wait ended before calling the launcher.', error: null }
  const result = spawnSync(process.execPath, [SANDBOX_TOOL, ...args, ...theLaunchersIdentity()], {
    env: theLaunchersEnvironment(),
    ...(bounded ? { timeout: Math.max(1, until - Date.now()) } : {}),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim(), error: result.error ? String(result.error) : null }
}

function lastJsonLine(text) {
  const line = text.split('\n').filter((one) => one.trim().startsWith('{')).pop()
  if (line === undefined) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/**
 * THE ENTRY'S SANDBOX, STARTED NOW FROM `root` WITH NO NETWORK (acceptance finding 77): the tree's code must not reach
 * the live office on the host's loopback. Answers its name and its folder, and writes both into the state, so a later
 * run and the log can find them, and so this run brings it down as it ends.
 *
 * A SANDBOX ALREADY RUNNING IS STARTED AGAIN. The launcher's status says nothing about a container's network, so the
 * tool cannot show that a running one is off the network, and it does not run the tree's code there on a guess. This
 * run holds the entry (`takeTheEntrysHold`), so no other live run is using that sandbox, and `down` keeps the folder,
 * which holds the clone.
 *
 * THE STATE SAYS WHICH SESSION BROUGHT THE SANDBOX UP (`upBy`), so the ending of a run brings down a sandbox that run
 * brought up, and, once the entry has ended, the entry's sandbox whoever brought it up (`bringTheSandboxDown`).
 *
 * EXIT 75 FROM UP MEANS WAIT, as it does for a command (runInSandbox): the launcher refuses a start before anything is
 * made while the machine has not the memory a new container may take (its memory admission). This
 * run says so once, tries again every --room-every seconds, and tells the office once an hour, the entry keeping its place.
 */
export async function theSandbox(root) {
  const name = theSandboxName()
  const status = launcher(['status', name, '--json'])
  const report = (lastJsonLine(status.stdout)?.reports ?? []).find((one) => one.instance === name)
  if (report !== undefined && report.container?.docker === 'running') {
    const down = launcher(['down', name, '--force'])
    log(
      `sandbox ${name} was already running, and the launcher's status does not say which network it has, so the tool asked for it ` +
        `to be brought down, which keeps its folder, and started again with no network. down: exit ${String(down.status)} ${down.stderr.slice(-300)}`,
    )
  } else if (report !== undefined && typeof report.container?.docker === 'string' && report.container.docker !== 'no such container') {
    // A STOPPED CONTAINER from an earlier run is still there; up refuses until it is removed.
    const down = launcher(['down', name, '--force'])
    log(`sandbox ${name} had a container that was ${report.container.docker}; down: exit ${String(down.status)} ${down.stderr.slice(-300)}`)
  }
  log(`starting sandbox ${name} from ${root} with the template ${chosen.sandboxTemplate} and no network`)
  keepForCleanup({ type: 'sandbox', name })
  const start = () => launcher(['up', chosen.sandboxTemplate, '--name', name, '--from', root, '--no-dsh', '--network', 'none', '--label', `mole-office.merge-entry=${chosen.takeBack === null ? chosen.entry : `take-back-${chosen.takeBack}`}`, '--json'])
  let up = start()
  let waitingSince = null
  let reportedAt = null
  while (up.status === 75) {
    const refused = `${up.stderr}\n${up.stdout}`.split('\n').filter((line) => line.startsWith('sandbox: ')).at(-1) ??
      'sandbox: the launcher exited 75, which is its exit for having no room, and said nothing more.'
    if (waitingSince === null) {
      waitingSince = stamp()
      log(`no room to start sandbox ${name}: ${refused} Nothing was started, so nothing is red; the entry keeps its place and this run asks again every ${String(chosen.roomEvery)} s.`)
    }
    if (reportedAt === null || Date.now() - reportedAt >= ONE_HOUR_MS) {
      await theOfficeHearsThereIsNoRoom(refused)
      reportedAt = Date.now()
    }
    await sleep(chosen.roomEvery * 1000)
    up = start()
  }
  if (waitingSince !== null) log(`the sandbox launcher had room again; sandbox ${name} started after waiting since ${waitingSince}`)
  const made = up.status === 0 ? lastJsonLine(up.stdout) : null
  if (made === null || typeof made.folder !== 'string') {
    fail(
      `The entry's sandbox ${name} could not be started, and a git entry's code is never run on the host (acceptance finding 17). ` +
        `tools/sandbox.mjs up exited ${String(up.status)}${up.error === null ? '' : ` (${up.error})`}: ${(up.stderr || up.stdout).slice(-1500)}`,
    )
  }
  writeState({ sandbox: { name, folder: made.folder, template: made.template, container: made.container, resource: made.resource, upAt: stamp(), upBy: chosen.session, clearWhenFinal: true } })
  // THE NETWORK UP SAYS IT GAVE, read from its answer: anything but "none" and nothing of the tree runs in it. The state
  // above already names the sandbox, so the ending of this run brings it down.
  if (made.network !== 'none') {
    const said = 'network' in made ? `came up with the network ${JSON.stringify(made.network)} rather than none` : 'came up, and the launcher did not say which network it has rather than saying none'
    fail(`The entry's sandbox ${name} ${said}, so this run ran none of the tree's code in it. This run stops here and asks the sandbox launcher to bring that sandbox down as it ends; its folder is kept.`)
  }
  log(`sandbox ${name} is up with no network: container ${String(made.container).slice(0, 12)}, ledger row ${String(made.resource)}, folder ${made.folder}`)
  return { name, folder: made.folder }
}

/**
 * BRING THE ENTRY'S SANDBOX DOWN AS THIS RUN ENDS, through the ledger, when this run brought it up. Its folder is kept.
 * A sandbox another session brought up is left as it is, and the log says so. A down that works is written into the
 * state as `downAt`, so the sweep knows it can ask to clear without first stopping the container.
 */
export function bringTheSandboxDown({ entryEndedIn = null } = {}) {
  const subject = chosen.takeBack === null ? `merge entry ${chosen.entry}` : `hand-back ${chosen.takeBack}`
  const held = readState().sandbox
  if (!held || typeof held.name !== 'string') return
  if (typeof held.downAt === 'string') return
  // AN ENTRY THAT HAS ENDED NEEDS ITS SANDBOX NO MORE, WHOEVER BROUGHT IT UP. One entry
  // merged on 3 October 2026 in a later run than the one that brought its sandbox up, and that run left the sandbox
  // up, idle, for 17 hours. This run holds the entry's hold, so no other live run can be using that sandbox.
  if (held.upBy !== chosen.session && entryEndedIn !== null) {
    log(`sandbox ${held.name} was brought up by ${typeof held.upBy === 'string' ? `session ${held.upBy}` : 'a run that did not record its session'}, and ${subject} is ${entryEndedIn}, so this run, which holds the entry, brings it down`)
  } else if (held.upBy !== chosen.session) {
    log(`sandbox ${held.name} was brought up by ${typeof held.upBy === 'string' ? `session ${held.upBy}` : 'a run that did not record its session'}, not by this run, so this run did not bring it down`)
    return
  }
  const down = launcher(['down', held.name, '--force'])
  if (down.status === 0) {
    keepForCleanup({ type: 'sandbox-down' })
    writeState({ sandbox: { ...held, downAt: stamp() } })
    log(`sandbox ${held.name} is down; its folder ${String(held.folder)} is kept`)
  } else {
    log(
      `sandbox ${held.name} could not be brought down (exit ${String(down.status)}): ${(down.stderr || down.stdout).slice(-600)}\n` +
        `A later run of the merge tool, for this entry or another, brings it down once ${subject} has ended ` +
        `(merged, bounced, withdrawn or superseded) and no live run holds it.`,
    )
  }
}

// ============================================================================ sandboxes that ended entries left up

/** One merge entry of this project as the office serves it: the entry, or null with the office's words. */
async function readAnyEntry(id, until) {
  const reply = await ask('GET', `/api/merge-queue/${encodeURIComponent(id)}`, undefined, { retry: false, until })
  if (reply.status !== 200) return { entry: null, says: `the office answered ${String(reply.status)}: ${refusalIn(reply).slice(0, 300)}` }
  return { entry: reply.body.entry, says: null }
}

/** Read the office's complete matching records, never treating an unread or partial list as none. */
async function matchingRecords(kind, text, until) {
  const path = `/api/records?kind=${kind}&q=${encodeURIComponent(text)}&shape=full`
  const reply = await readAFullList((one) => ask('GET', one, undefined, { retry: false, until }), path)
  if (reply.status !== 200 || !Array.isArray(reply.body?.records) || reply.body.truncated !== false || reply.body.left !== 0) {
    fail(`the office could not give all matching ${kind === 'session' ? 'check sessions' : `${kind} records`} (${String(reply.status)}): ${refusalIn(reply)}`)
  }
  // A CUT LIST IS NOT TREATED AS NONE: the session rows below read `data.extra`, which a narrow row does not carry.
  if (reply.body.records.some((one) => typeof one?.incompleteCount !== 'number')) {
    fail(`the office answered the narrow ${kind === 'session' ? 'check sessions' : `${kind} records`} and not the whole ones this cleanup reads`)
  }
  return reply.body.records
}

const matchingSessions = (text, until) => matchingRecords('session', text, until)

/**
 * The office records active checks in theCheck.execution until endedAt. Scoped rechecks are session records
 * whose extra names the mergeEntry. Checkers, including hand-run checks and replaced executions, name their
 * inspectionRun in extra; their observed session state is read from the office rather than inferred from a pid.
 */
async function noCheckOfTheEntryIsGoing(entry, until) {
  const targets = new Set([entry.run, entry.machine?.reinspection?.run, ...(entry.machine?.reinspected ?? []).map((one) => one.run)].filter((one) => typeof one === 'string'))
  for (const record of await matchingSessions(entry.id, until)) {
    if (record.data?.extra?.purpose === 'reinspection' && record.data.extra.mergeEntry === entry.id) targets.add(record.id)
  }
  if (targets.size === 0) return { clear: false, says: 'the entry names no run whose checks can be read' }
  for (const run of targets) {
    const reply = await ask('GET', `/api/checks/${encodeURIComponent(run)}`, undefined, { retry: false, until })
    if (reply.status !== 200 || reply.body?.run !== run || !Object.hasOwn(reply.body, 'theCheck')) {
      return { clear: false, says: `the office could not say whether the check of run ${run} ended (${String(reply.status)}): ${refusalIn(reply)}` }
    }
    const check = reply.body.theCheck
    if (check !== null && (typeof check !== 'object' || Array.isArray(check))) {
      return { clear: false, says: `the office returned an unreadable check of run ${run}` }
    }
    if (check?.execution && (typeof check.execution.endedAt !== 'string' || check.execution.endedAt.trim() === '')) return { clear: false, says: `the check of run ${run} is still going: its execution has no endedAt` }
    for (const checker of await matchingSessions(run, until)) {
      if (checker.data?.extra?.purpose !== 'inspection' || checker.data.extra.inspectionRun !== run) continue
      const observed = await ask('GET', `/api/sessions/${encodeURIComponent(checker.id)}`, undefined, { retry: false, until })
      if (observed.status !== 200 || !['finished', 'crashed'].includes(observed.body?.session?.state)) {
        return { clear: false, says: `the office has not shown checker ${checker.id} ended (${observed.status === 200 ? String(observed.body?.session?.state) : refusalIn(observed)})` }
      }
    }
  }
  return { clear: true, says: 'the office says no check of the entry is going' }
}

/** Clear only this version's final entry, through the launcher's safety checks, with one log line. */
async function clearFinalSandbox(entry, sandbox, stateFile, { bounded = false, until = Date.now() + REQUEST_TIMEOUT_MS } = {}) {
  if (MERGE_STATE_SPECS[entry.state]?.final !== true || sandbox.clearedAt) return
  if (sandbox.clearWhenFinal !== true) {
    log(`sandbox ${sandbox.name} of final merge entry ${entry.id} has no clearWhenFinal mark; its folder is left for the separately decided one-time cleanup`)
    return
  }
  const checks = await noCheckOfTheEntryIsGoing(entry, until)
  if (!checks.clear) {
    log(`sandbox ${sandbox.name} of final merge entry ${entry.id} was not cleared: ${checks.says}; the next run's sweep tries again`)
    return
  }
  const cleared = launcher(['clear', sandbox.name, '--force', '--json'], { bounded, until })
  const answer = cleared.status === 0 ? lastJsonLine(cleared.stdout) : null
  if (typeof answer?.clearedAt !== 'string' || !Number.isFinite(answer?.bytesFreed) || answer.bytesFreed < 0) {
    fail(`sandbox ${sandbox.name} could not be cleared (exit ${String(cleared.status)}): ${(cleared.stderr || cleared.stdout || cleared.error || 'no answer').slice(-600)}`)
  }
  writeStateAt(stateFile, { sandbox: { ...sandbox, downAt: sandbox.downAt ?? stamp(), clearedAt: answer.clearedAt, bytesFreed: answer.bytesFreed } }, entry.id)
  log(`sandbox ${sandbox.name} of final merge entry ${entry.id} was cleared at ${answer.clearedAt}; freed ${String(answer.bytesFreed)} bytes`)
}

/** This run already holds the entry. A failed or unknown cleanup is left for the sweep. */
export async function clearTheFinalSandbox() {
  const sandbox = readState().sandbox
  if (!sandbox || typeof sandbox.name !== 'string' || sandbox.clearedAt) return
  const until = Date.now() + REQUEST_TIMEOUT_MS
  const read = await readAnyEntry(chosen.entry, until)
  if (read.entry === null) fail(`the entry could not be read for sandbox cleanup: ${read.says}`)
  await clearFinalSandbox(read.entry, sandbox, STATE_FILE, { bounded: true, until })
}

/**
 * NO MERGE SANDBOX STAYS UP AFTER ITS ENTRY ENDED, AND ITS CLONE GOES ONCE NOTHING CAN NEED IT.
 *
 * On 25 September 2026 an entry merged, its sandbox's down met a stalled office and gave up, and the container
 * stayed up for 72 minutes until somebody brought it down by hand. So every run, once it holds its own entry and before
 * its own work, looks for such sandboxes. On 3 October 2026, 13 merge containers were still up 12 to 38 hours after their
 * entries merged, and 183 sandbox folders held 69 GiB. Each of those runs' own down had met the office restarting after
 * the landing, and this sweep's down was refused, because the ledger lets only a secretary or the person stop a
 * container whose registering session has ended. Now a run brings its sandbox down before it lands, while the office
 * answers, and this sweep reads only the sandboxes this version started: the state's clearWhenFinal mark.
 *
 * A marked sandbox is brought down, if its container still runs, and its clone parts are cleared when all of these hold:
 *
 *   - no other live run holds that entry, and its hold can be read;
 *   - the office says the entry is in a final state (merged, bounced, withdrawn or superseded);
 *   - the office says no check of the entry is going (`noCheckOfTheEntryIsGoing`).
 *
 * AN UNMARKED SANDBOX IS NEITHER READ NOR TOUCHED, and one line counts them. Its cleanup is a one-time act decided
 * separately, and reading the office about each one cost every run a request per old folder. Cleanup shares one bounded
 * wait and does not retry silence; a failure is logged and left for the next run, and nothing here stops this run's own
 * work.
 */
export async function bringDownWhatEndedEntriesLeftUp() {
  if (basename(WORKDIR) !== chosen.entry) {
    log(`the tool did not look for sandboxes that ended entries left up: this run's workdir ${WORKDIR} is not named after its entry, so the workdirs of other entries cannot be found beside it`)
    return
  }
  const workdirs = dirname(WORKDIR)
  const until = Date.now() + REQUEST_TIMEOUT_MS
  const candidates = []
  let unmarked = 0
  try {
    for (const id of readdirSync(workdirs, { withFileTypes: true }).filter((one) => one.isDirectory()).map((one) => one.name)) {
      if (id === chosen.entry) continue
      if (Date.now() >= until) fail('The sandbox sweep wait ended; the remaining sandboxes were left as they are.')
      try {
        const stateFile = join(workdirs, id, 'state.json')
        const sandbox = readStateAt(stateFile).sandbox
        if (!sandbox || typeof sandbox.name !== 'string' || sandbox.clearedAt) continue
        if (sandbox.clearWhenFinal !== true) {
          unmarked += 1
          continue
        }
        const hold = theLatestHold(join(workdirs, id))
        if (hold !== null && hold.holder === null) {
          log(`sandbox ${sandbox.name} of merge entry ${id} was left as it is: its hold ${hold.file} could not be read, so nobody can tell whether a run holds that entry`)
          continue
        }
        if (hold !== null && whatBecameOf(hold.holder).running) {
          log(`sandbox ${sandbox.name} of merge entry ${id} was left as it is: merge tool run ${hold.holder.session} (process ${String(hold.holder.pid)}) holds that entry and is still running`)
          continue
        }
        const read = await readAnyEntry(id, until)
        if (read.entry === null) fail(`sandbox ${sandbox.name} of merge entry ${id} was left as it is: the entry could not be read (${read.says})`)
        if (MERGE_STATE_SPECS[read.entry.state]?.final !== true) continue
        candidates.push({ id, sandbox, stateFile, entry: read.entry })
      } catch (err) {
        log(`sandbox of merge entry ${id} was left as it is: ${err instanceof Error ? err.message : String(err)}. The next run of the merge tool tries again.`)
      }
    }
    if (unmarked > 0) {
      log(
        `${unmarked === 1 ? '1 merge sandbox' : `${String(unmarked)} merge sandboxes`} with no clearWhenFinal mark, started before ` +
          `the merge tool cleared its sandboxes, ${unmarked === 1 ? 'was' : 'were'} left as found; that cleanup is decided separately`,
      )
    }
    for (const { id, sandbox, stateFile, entry } of candidates) {
      if (Date.now() >= until) fail('The sandbox sweep wait ended; the remaining sandboxes were left as they are.')
      try {
        if (!sandbox.downAt) {
          const status = launcher(['status', sandbox.name, '--json'], { bounded: true, until })
          const report = lastJsonLine(status.stdout)?.reports?.find((one) => one.instance === sandbox.name)
          if (!report) fail(`the launcher's status of ${sandbox.name} could not be read: ${(status.stderr || status.stdout || status.error || 'no answer').slice(-600)}`)
          if (report.container?.docker === 'running') {
            const down = launcher(['down', sandbox.name, '--force'], { bounded: true, until })
            const said = (down.stderr || down.stdout).slice(-600)
            if (down.status !== 0) fail(`sandbox ${sandbox.name} of merge entry ${id}, which is ${entry.state}, was running, and the launcher could not bring it down (exit ${String(down.status)}): ${said}`)
            sandbox.downAt = stamp()
            writeStateAt(stateFile, { sandbox }, id)
            log(`sandbox ${sandbox.name} of merge entry ${id}, which is ${entry.state}, was still running and no live run holds that entry; the launcher brought it down, and its folder is kept. It said: ${said}`)
          }
        }
        await clearFinalSandbox(entry, sandbox, stateFile, { bounded: true, until })
      } catch (err) {
        log(`${err instanceof Error ? err.message : String(err)}. The next run of the merge tool tries again.`)
      }
    }
  } catch (err) {
    log(`sandbox sweep stopped: ${err instanceof Error ? err.message : String(err)}. The next run of the merge tool tries again.`)
  }
  await removeTheResolutionsEndedEntriesLeft(workdirs)
}

/**
 * AN ENDED ENTRY'S RESOLUTION CLONE GOES A DAY AFTER IT WAS LAST WRITTEN, unless an open problem or a current fix brief
 * names the entry (tools/merge-tool/ended-resolutions.mjs says when). A folder an entry's live run holds is left as it
 * is. The pass has its own bounded wait, so a slow sandbox sweep does not take its time; a failure is logged and left
 * for the next run.
 */
async function removeTheResolutionsEndedEntriesLeft(workdirs) {
  const until = Date.now() + REQUEST_TIMEOUT_MS
  const readEntry = async (id) => {
    const read = await readAnyEntry(id, until)
    if (read.entry === null) fail(`the entry could not be read (${read.says})`)
    return read.entry
  }
  const readRunState = async (run) => {
    const reply = await ask('GET', `/api/records/${encodeURIComponent(run)}`, undefined, { retry: false, until })
    if (reply.status !== 200 || reply.body?.record?.id !== run) fail(`the office could not give run ${String(run)} (${String(reply.status)}): ${refusalIn(reply)}`)
    return reply.body.record.data?.state
  }
  const problemsNaming = (id) => matchingRecords('problem', id, until)
  try {
    for (const id of readdirSync(workdirs, { withFileTypes: true }).filter((one) => one.isDirectory()).map((one) => one.name)) {
      if (id === chosen.entry) continue
      if (Date.now() >= until) fail('The wait for removing ended entries\' resolution folders ended; the remaining folders were left as they are.')
      try {
        const verdict = await whetherTheResolutionGoes({
          id,
          workdir: join(workdirs, id),
          nowMs: Date.now(),
          ended: (entry) => MERGE_STATE_SPECS[entry.state]?.final === true,
          readEntry,
          readRunState,
          problemsNaming,
        })
        if (verdict.quiet === true) continue
        if (!verdict.goes) {
          log(verdict.says)
          continue
        }
        const hold = theLatestHold(join(workdirs, id))
        if (hold !== null && hold.holder === null) {
          log(`the resolution folder of merge entry ${id} was left as it is: its hold ${hold.file} could not be read, so nobody can tell whether a run holds that entry`)
          continue
        }
        if (hold !== null && whatBecameOf(hold.holder).running) {
          log(`the resolution folder of merge entry ${id} was left as it is: merge tool run ${hold.holder.session} (process ${String(hold.holder.pid)}) holds that entry and is still running`)
          continue
        }
        removeTheResolution(workdirs, id)
        log(`the resolution folder of merge entry ${id} was removed: ${verdict.says}`)
      } catch (err) {
        log(`the resolution folder of merge entry ${id} was left as it is: ${err instanceof Error ? err.message : String(err)}. The next run of the merge tool tries again.`)
      }
    }
  } catch (err) {
    log(`the removal of ended entries' resolution folders stopped: ${err instanceof Error ? err.message : String(err)}. The next run of the merge tool tries again.`)
  }
}

/**
 * RUN ONE COMMAND OF THE TREE IN THE ENTRY'S SANDBOX, to its end. `tools/sandbox.mjs exec --wait
 * --plain-env --timeout` runs it inside the container at nice 19, with the container's own
 * environment; its output lands in <workdir>/<label>.log on the host as it is written. This process
 * gives builds and full suites two more minutes before stopping their launcher. Single-file
 * re-runs use their own total limit and no-output watchdog. A stop goes to the recorded launcher
 * group, and the launcher passes it to the command's recorded group.
 */
export async function runInSandbox(sandbox, label, command, args, { cwd, timeoutMs, singleFile = null, rerunLimits = RERUN_LIMITS }) {
  // EXIT 75 MEANS WAIT, NEVER RED (wave 13p round 19). The launcher refuses a build or a test
  // with exit 75 before anything is filed or started, for any of four causes: it cannot read the
  // free space where the sandboxes are, there is under 80 GB free, docker cannot list the running GPU sandboxes, or
  // another sandbox already runs with a GPU. Nothing ran, so nothing is red and nothing is a run with no result. This run
  // keeps the entry where it is, writes the launcher's own sentence once, tries again every --room-every seconds, and
  // reports it to the office once an hour, which tells the secretary one line an hour at most.
  let waitingSince = null
  let reportedAt = null
  for (;;) {
    const ran = await runInSandboxOnce(sandbox, label, command, args, { cwd, timeoutMs, singleFile, rerunLimits })
    const refused = theLauncherHadNoRoom(ran)
    if (refused === null) {
      if (waitingSince !== null) log(`the sandbox launcher had room again; ${label} ran after waiting since ${waitingSince}`)
      return ran
    }
    if (waitingSince === null) {
      waitingSince = stamp()
      log(`no room: ${refused} Nothing ran, so nothing is red; the entry keeps its place and this run tries ${label} again every ${String(chosen.roomEvery)} s.`)
    }
    if (reportedAt === null || Date.now() - reportedAt >= ONE_HOUR_MS) {
      await theOfficeHearsThereIsNoRoom(refused)
      reportedAt = Date.now()
    }
    await sleep(chosen.roomEvery * 1000)
  }
}

/** How often, at most, a run that waits for room reports it to the office. */
const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * THE LAUNCHER'S SENTENCE WHEN IT REFUSED WITH EXIT 75 BEFORE ITS COMMAND STARTED, or null when it did not. A command
 * that started prints the helper's "sandbox-start: started {...}" line first; one that exits 75 after that is its own
 * exit, and is read as any other.
 */
export function theLauncherHadNoRoom(ran) {
  if (ran.code !== 75) return null
  const output = existsSync(ran.outFile) ? readFileSync(ran.outFile, 'utf8') : String(ran.tail ?? '')
  if (/^sandbox-start: started \{/mu.test(output)) return null
  const said = output.split('\n').filter((line) => line.startsWith('sandbox: ')).at(-1)
  return said ?? 'sandbox: the launcher exited 75, which is its exit for having no room, and said nothing more.'
}

/** Tell the office the launcher had no room, by the step for the state the entry is in. A refusal is written down, never fatal. */
async function theOfficeHearsThereIsNoRoom(says) {
  try {
    const entry = await readEntry()
    const name = entry.state === 'testing' ? 'no-room-to-test' : entry.state === 'integrating' ? 'no-room-to-integrate' : null
    if (name === null) {
      log(`the office was not told there is no room: the entry is ${entry.state}, from which neither no-room step is taken`)
      return
    }
    appendFileSync(STEPS_FILE, `${JSON.stringify({ at: stamp(), step: name, facts: { says }, detail: null })}\n`)
    const reply = await ask('POST', `/api/merge-queue/${encodeURIComponent(chosen.entry)}/step`, { step: name, facts: { says } })
    if (reply.status !== 200) log(`the office refused the step ${name} (${String(reply.status)}): ${refusalIn(reply)}`)
    else if (typeof reply.body?.decided === 'string') log(`the office decided: ${reply.body.decided.slice(0, 600)}`)
  } catch (err) {
    log(`the office was not told there is no room: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** One command of the tree in the entry's sandbox, once, as runInSandbox describes. */
function runInSandboxOnce(sandbox, label, command, args, { cwd, timeoutMs, singleFile, rerunLimits }) {
  const limit = singleFile === null ? timeoutMs : rerunLimits.timeoutMs
  log(`in sandbox ${sandbox.name}: ${[command, ...args].join(' ')} in ${cwd}`)
  return run(
    label,
    process.execPath,
    [
      SANDBOX_TOOL, 'exec', sandbox.name, '--wait', '--plain-env', '--timeout', String(Math.ceil(limit / 1000)), '--cwd', cwd,
      ...theLaunchersIdentity(),
      '--', ...theCommandInTheSandbox(command, args),
    ],
    { cwd: WORKDIR, env: theLaunchersEnvironment(), timeoutMs: singleFile === null ? limit + EXEC_GRACE_MS : limit, nice: false,
      ...(singleFile === null ? {} : { idleTimeoutMs: rerunLimits.idleTimeoutMs, stoppedFile: singleFile }),
    },
  )
}

/** A report a command in the sandbox wrote in the sandbox's folder, copied to the workdir, where nothing in the sandbox can change it. */
export function keepTheReport(written, name) {
  const kept = join(WORKDIR, name)
  rmSync(kept, { force: true })
  if (existsSync(written)) copyFileSync(written, kept)
  return kept
}

/** The seal record the entry was submitted on, with its git part. */
export async function theSeal(entry) {
  const record = await readRecord(entry.seal.id)
  const seal = record && record.data ? record.data.seal : null
  if (!seal || typeof seal !== 'object') fail(`Record ${entry.seal.id} holds no seal.`)
  return seal
}

// ============================================================================ the full-suite seat

let cleanupPid = null
export function watchMergeCleanup() {
  const owner = theProcessAt(process.pid)
  if (!owner.here || owner.startedAt === null || owner.pgid === null) fail('The merge tool could not read its process group, so it started no cleanup watcher or sandbox.')
  const leader = theProcessAt(owner.pgid)
  if (!leader.here || leader.startedAt === null || leader.pgid !== owner.pgid) fail('The merge tool could not confirm its process group’s leader, so it started no cleanup watcher or sandbox.')
  // The watcher reads the office's key as this tool does, so it is handed the pairing as its environment.
  cleanupPid = startCleanup({ ownerGroup: owner.pgid, ownerGroupStartedAt: leader.startedAt, api: API, entry: chosen.entry, log: LOG, headers: HEADERS, launcher: SANDBOX_TOOL, identity: theLaunchersIdentity(), environment: theLaunchersEnvironment() }, withThePairing(process.env))
}

/** The disk floor stays intact while the suite uses its own space. Decimal GB, as in df and the office gates. */
export const FULL_SUITE_DISK_FLOOR_BYTES = SANDBOX_DISK_FLOOR.bytes
/** A test run's measured peak was about 5 GB, as recorded in the disk-reserve decision of 9 November. */
export const FULL_SUITE_EXPECTED_PEAK_BYTES = 5 * 1e9

function rootFreeBytes() {
  try {
    const disk = statfsSync('/')
    return disk.bavail * disk.bsize
  } catch {
    return null
  }
}

export async function acquireFullSuiteSeat({ rootFreeBytes: freeBytes = rootFreeBytes, wait = sleep } = {}) {
  const pid = cleanupPid ?? process.pid
  const startedAt = startTimeOf(pid)
  const body = { pool: 'full-suite', pid, ...(startedAt === null ? {} : { startedAt }), detail: `the merge queue testing entry ${chosen.entry}` }
  const deadline = Date.now() + chosen.slotFor * 1000
  let toldWaiting = false
  let toldDisk = false
  let held = null
  for (;;) {
    const free = freeBytes()
    if (!Number.isFinite(free) || free < FULL_SUITE_DISK_FLOOR_BYTES + FULL_SUITE_EXPECTED_PEAK_BYTES) {
      if (held !== null) {
        await releaseSeat(held)
        held = null
      }
      if (!toldDisk) {
        log('waiting for disk space: the full suite needs its expected peak above the free-space floor; an unreadable disk also holds the seat back')
        toldDisk = true
      }
      if (Date.now() >= deadline) fail('No full-suite seat was taken: disk space did not reach the floor plus the expected peak before the wait ended.')
      await wait(chosen.slotEvery * 1000)
      continue
    }
    const reply = await ask('POST', '/api/slots/acquire', body)
    if (reply.status !== 200) fail(`The office would not give a full-suite seat (${String(reply.status)}): ${refusalIn(reply)}`)
    const slot = reply.body.slot
    held = slot
    keepForCleanup({ type: 'seat', id: slot.id })
    if (slot.state === 'granted') {
      const freeNow = freeBytes()
      if (!Number.isFinite(freeNow) || freeNow < FULL_SUITE_DISK_FLOOR_BYTES + FULL_SUITE_EXPECTED_PEAK_BYTES) {
        await releaseSeat(slot)
        held = null
        if (Date.now() >= deadline) fail('No full-suite seat was taken: disk space did not reach the floor plus the expected peak before the wait ended.')
        await wait(chosen.slotEvery * 1000)
        continue
      }
      log(`holding the full-suite seat ${slot.id} (${String(slot.seat)})`)
      return slot
    }
    if (!toldWaiting) {
      log(`waiting for the full-suite seat: place ${String(slot.position)} in line (${slot.id})`)
      toldWaiting = true
    }
    if (Date.now() >= deadline) {
      await ask('POST', `/api/slots/${encodeURIComponent(slot.id)}/release`, { note: 'the merge tool waited out its limit' })
      fail(`No full-suite seat was granted within ${String(chosen.slotFor)} seconds; the place in line was given back.`)
    }
    await wait(chosen.slotEvery * 1000)
  }
}

export async function releaseSeat(slot) {
  const reply = await ask('POST', `/api/slots/${encodeURIComponent(slot.id)}/release`, { note: 'the merge tool finished testing' })
  if (reply.status === 200) keepForCleanup({ type: 'seat-returned' })
  if (reply.status !== 200) log(`the office would not take the seat ${slot.id} back (${String(reply.status)}): ${refusalIn(reply)}; it is given back when this process group ends`)
}

// ============================================================================ a test-batches seat

/** The words that open the line saying the tool waits for a test-batches seat for `detail`, as the row `id`. The office's own words follow. */
export const waitingForATestBatchSeat = (detail, id) =>
  `waiting for a ${TEST_BATCH_POOL} seat for ${detail}, as row ${id}, asking again every ${String(chosen.slotEvery)} seconds`

/** The line saying the office has no test-batches pool, only `pools`, so `detail` runs without a seat. */
export const noTestBatchesPool = (detail, pools) =>
  `the office has no ${TEST_BATCH_POOL} pool, only ${pools.join(' and ')}, so it runs older code, and ${detail} runs without a seat, as before`

/**
 * RUN `runs` IN A TEST-BATCHES SEAT, and answer what it answers. The whole suite holds the full-suite seat. The tool's
 * other test runs held no seat: a take-back's files on main, a hand-back repair's files when no full-suite seat is held
 * yet, and a plugin-only entry's own check and privacy gate. Each now asks for a seat in the pool that every batch of
 * test files on this machine sits in. The seat is asked for as the full-suite seat is: held by the cleanup watcher's
 * process group, asked again every --slot-every seconds, and waited for at most --slot-for seconds. It is given back
 * when `runs` has ended, red or not.
 *
 * THE WAIT IS SAID, in the office's own words, when it begins and again when the place in line or the machine's limits
 * holding it change. It is not said at every ask, because the office's words carry the machine's figures.
 *
 * AN OFFICE WITH NO SUCH POOL runs older code. A refusal is read against the office's own list of its pools: when the
 * list has no test-batches pool, the tool says so and `runs` runs without a seat, as it did before that pool. Any other
 * refusal stops the tool, as a refused full-suite seat does.
 *
 * NEVER BESIDE THE FULL-SUITE SEAT. The cleanup watcher keeps one seat, so a caller asks for this one only where no
 * full-suite seat is held.
 *
 * @template T
 * @param {string} detail what runs, in a few words, as the office lists it beside the seat
 * @param {() => Promise<T>} runs
 * @returns {Promise<T>}
 */
export async function inATestBatchSeat(detail, runs) {
  const slot = await aTestBatchSeat(detail)
  try {
    return await runs()
  } finally {
    if (slot !== null) await releaseSeat(slot)
  }
}

/** A granted test-batches seat, or null when the office has no such pool. */
async function aTestBatchSeat(detail) {
  const pid = cleanupPid ?? process.pid
  const startedAt = startTimeOf(pid)
  const body = { pool: TEST_BATCH_POOL, pid, ...(startedAt === null ? {} : { startedAt }), detail }
  const deadline = Date.now() + chosen.slotFor * 1000
  let lastWait = null
  for (;;) {
    const reply = await ask('POST', '/api/slots/acquire', body)
    if (reply.status !== 200) {
      const pools = await thePoolsWithoutTestBatches()
      if (pools === null) fail(`The office would not give a ${TEST_BATCH_POOL} seat for ${detail} (${String(reply.status)}): ${refusalIn(reply)}`)
      log(`${noTestBatchesPool(detail, pools)} (the office answered ${String(reply.status)}: ${refusalIn(reply)})`)
      return null
    }
    const slot = reply.body.slot
    keepForCleanup({ type: 'seat', id: slot.id })
    if (slot.state === 'granted') {
      log(`holding the ${TEST_BATCH_POOL} seat ${slot.id} (${String(slot.seat)}) for ${detail}`)
      return slot
    }
    const holding = (reply.body.pool?.machine ?? []).filter((limit) => limit.state === 'holds').map((limit) => limit.gate)
    const wait = JSON.stringify([slot.position, holding])
    if (wait !== lastWait) log(`${waitingForATestBatchSeat(detail, slot.id)}: ${String(reply.body.says ?? '')}`)
    lastWait = wait
    if (Date.now() >= deadline) {
      await ask('POST', `/api/slots/${encodeURIComponent(slot.id)}/release`, { note: 'the merge tool waited out its limit' })
      fail(`No ${TEST_BATCH_POOL} seat was granted for ${detail} within ${String(chosen.slotFor)} seconds; the place in line was given back.`)
    }
    await sleep(chosen.slotEvery * 1000)
  }
}

/** The names of the office's pools when none of them is test-batches; null when one is, or when the office lists none. */
async function thePoolsWithoutTestBatches() {
  const reply = await ask('GET', '/api/slots')
  const pools = reply.status === 200 && Array.isArray(reply.body?.pools) ? reply.body.pools.map((pool) => String(pool?.name)) : null
  return pools === null || pools.includes(TEST_BATCH_POOL) ? null : pools
}

/**
 * THE MERGE LIST OF ONE LANE, IN ITS NARROW SHAPE (wave 13u round 123): each entry with only the fields this tool reads,
 * and, when `states` are given, only the entries in them. An office older than the shapes is asked once more for the
 * whole list, and the log says so (`askTheMergeList`).
 */
function theMergeList(lane, states = undefined) {
  return askTheMergeList({ lane, states }, 'narrow', (path) => ask('GET', path), log)
}

/**
 * The entries of one lane in this project, in the lane's order as the office reads it: entries moved to the front first,
 * then the rest in the order the office lists them, which is the order they were written (`inTheLanesOrder`, the one
 * rule for it). Only those in `states`, when they are given.
 */
export async function theLane(root, states = undefined) {
  const reply = await theMergeList(root, states)
  if (reply.status !== 200) return []
  const unread = theEntriesTheQueueCouldNotRead(reply.body)
  if (unread !== null) {
    log(`the lane ${root} is taken to hold no entry, as when the office refuses its list: ${unread}`)
    return []
  }
  const lane = (reply.body?.lanes ?? []).find((one) => one.lane === root)
  return inTheLanesOrder(lane?.entries ?? [])
}

/**
 * THE MIGRATIONS THE OTHER QUEUED ENTRIES OF THIS LANE CARRY (wave 13v round 26), so a migration renumbered at integration
 * does not take a number one of them already holds: on 11 October 2026 an entry was renumbered to 0232, which
 * another entry, ahead of it, carried. Each other git entry of the lane that is not final is read: the journal at its
 * commit, fetched from its run's worktree when root does not have it, as conflictsAfterLanding does.
 *
 * AND AT ITS INTEGRATION RESULT, when it has one (wave 13u round 130), fetched from its integration clone when root does
 * not have it. An entry submitted with 0306 was renumbered to 0309 at its integration and waited to land, and the next
 * renumbering read 0306 from its commit and chose 0309 again. An entry whose result cannot be read is unread.
 *
 * Returns `{ rows, read, unread, lane }`: every journal row read, each with the `entry` that carries it; the entries read;
 * the entries that could not be read, each with why; and `lane`, null when the lane was read, or why it could not be.
 * Numbers handed out for branches that are not in the queue yet cannot be seen here, and the caller says so.
 */
export async function theMigrationsQueued(root, entry) {
  const reply = await theMergeList(root, MERGE_STATES.filter((one) => !MERGE_STATE_SPECS[one].final))
  if (reply.status !== 200) return { rows: [], read: [], unread: [], lane: `the office would not give the lane (${String(reply.status)}): ${refusalIn(reply)}` }
  const unreadEntries = theEntriesTheQueueCouldNotRead(reply.body)
  if (unreadEntries !== null) return { rows: [], read: [], unread: [], lane: unreadEntries }
  const lane = (reply.body?.lanes ?? []).find((one) => one.lane === root)
  const others = (lane?.entries ?? []).filter((one) => one.id !== entry.id && MERGE_STATE_SPECS[one.state]?.final !== true && one.changeset?.adapter === 'git' && one.changeset.root === root)
  const rows = [], read = [], unread = []
  /** The journal rows at `commit`, which root has: none when it has no journal; a failure when they cannot be read. */
  const theRowsAt = (commit, entry) => {
    // A COMMIT WITH NO JOURNAL CARRIES NO MIGRATION; any other failure to read it is a failure (git fails loudly).
    if (!tryGit(root, ['cat-file', '-e', `${commit}:${MIGRATION_JOURNAL}`]).ok) return []
    const text = git(root, ['show', `${commit}:${MIGRATION_JOURNAL}`])
    let entries
    try {
      entries = JSON.parse(text).entries
    } catch (err) {
      fail(`its ${MIGRATION_JOURNAL} is not JSON (${err instanceof Error ? err.message : String(err)})`)
    }
    if (!Array.isArray(entries)) fail(`its ${MIGRATION_JOURNAL} has no list of entries`)
    if (!entries.every((row) => Number.isSafeInteger(row?.idx) && Number.isSafeInteger(row?.when) && typeof row?.tag === 'string')) fail(`its ${MIGRATION_JOURNAL} has a row without a whole idx, a whole when and a tag`)
    return entries.map((row) => ({ idx: row.idx, when: row.when, tag: row.tag, entry }))
  }
  for (const other of others) {
    try {
      if (!tryGit(root, ['cat-file', '-e', `${other.changeset.commit}^{commit}`]).ok) {
        const run = await readRecord(other.run)
        if (typeof run.data?.workingDirectory !== 'string') fail(`run ${other.run} has no worktree from which to read its commit`)
        git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', run.data.workingDirectory, other.changeset.commit], { timeout: 15000 })
      }
      git(root, ['cat-file', '-e', `${other.changeset.commit}^{commit}`])
      const own = theRowsAt(other.changeset.commit, other.id)
      const integration = other.machine?.integration
      if (typeof integration?.result === 'string') {
        const result = integration.result
        if (!tryGit(root, ['cat-file', '-e', `${result}^{commit}`]).ok) {
          if (typeof integration.clone !== 'string') fail(`its integration result ${result.slice(0, 12)} is not in ${root}, and no integration clone is recorded`)
          try {
            git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', integration.clone, result], { timeout: 15000 })
          } catch (err) {
            if (!(err instanceof MergerFailure)) throw err
            fail(`its integration result ${result.slice(0, 12)} could not be fetched from its integration clone: ${err.message}`)
          }
        }
        git(root, ['cat-file', '-e', `${result}^{commit}`])
        own.push(...theRowsAt(result, other.id))
      }
      rows.push(...own)
      read.push(other.id)
    } catch (err) {
      if (!(err instanceof MergerFailure)) throw err
      unread.push({ entry: other.id, why: err.message })
    }
  }
  return { rows, read, unread, lane: null }
}

/**
 * Probe the git entries still waiting, pinned or judged, after a landing. Failures are visible but cannot undo a landing.
 *
 * ONLY THIS TOOL'S OWN FAILURES ARE LOGGED AND PASSED OVER: a git command or an office read that failed, which
 * `fail` raises as a MergerFailure. Anything else, such as a ReferenceError or a TypeError, is a fault in this code
 * and is thrown on, so it is not written down as "could not read its commit" (wave 13v round 13d).
 */
export async function conflictsAfterLanding(root, main) {
  const warnings = []
  try {
    const reply = await theMergeList(root, ['pinned', 'judged'])
    if (reply.status !== 200) fail(refusalIn(reply))
    const unread = theEntriesTheQueueCouldNotRead(reply.body)
    if (unread !== null) fail(unread)
    const entries = (reply.body.lanes ?? []).flatMap((lane) => lane.entries)
    for (const entry of entries) {
      if (!['pinned', 'judged'].includes(entry.state) || entry.changeset.adapter !== 'git' || entry.changeset.root !== root) continue
      try {
        if (!tryGit(root, ['cat-file', '-e', `${entry.changeset.commit}^{commit}`]).ok) {
          const run = await readRecord(entry.run)
          if (typeof run.data?.workingDirectory !== 'string') fail(`run ${entry.run} has no worktree from which to read its commit`)
          git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', run.data.workingDirectory, entry.changeset.commit], { timeout: 15000 })
        }
      } catch (err) {
        if (!(err instanceof MergerFailure)) throw err
        log(`early conflict probe for ${entry.id} could not read its commit: ${err.message}`)
      }
    }
    const remembered = []
    await probeWaitingEntries({ root, main, entries, remembered, log, probe: probeGit,
      tryTheRebase: async (entry) => tryTheRebaseEarly(root, main, entry.changeset.commit, join(WORKDIR, 'early-trial', entry.id)),
      notify: async (warning) => warnings.push(warning),
      remember: () => {},
    })
  } catch (err) {
    if (!(err instanceof MergerFailure)) throw err
    log(`early conflict warnings are incomplete: ${err.message}`)
  }
  return warnings
}

/**
 * The office's `GET /api/runtime` answer, or null when it answers with anything but 200. A landing reads it before main
 * moves to tell whether the office runs from another folder on the database the main checkout names (land.mjs). An
 * office nobody answers is waited out as every read is, and then fails the run.
 */
export async function theOfficesRuntime() {
  const reply = await ask('GET', '/api/runtime')
  return reply.status === 200 ? reply.body : null
}

/**
 * The office's health after main moved, waited for until --health-for runs out. An office that is not healthy in time is
 * the office-healthy-after-landing gate's: at block the tool stops, and at remind the answer says why and the landing goes
 * on. Main has already moved either way, and nothing is rolled back.
 */
export async function waitForHealth(root, finalCommit) {
  const started = Date.now()
  const deadline = started + chosen.healthFor * 1000
  let last = null
  let officeRunsFromTheLane = null
  let serving = null
  for (;;) {
    let health = null
    let runtime = null
    try {
      const res = await fetch(`${API}/api/health`, { headers: { ...HEADERS, ...theOfficeKeyHeader() } })
      health = { status: res.status, body: await res.json() }
      if (res.status === 200) {
        const r = await fetch(`${API}/api/runtime`, { headers: { ...HEADERS, ...theOfficeKeyHeader() } })
        runtime = r.status === 200 ? await r.json() : null
      }
    } catch (err) {
      last = `not answering (${err instanceof Error ? err.message : String(err)})`
    }
    if (health !== null && health.status === 200) {
      officeRunsFromTheLane = theOfficeRunsFrom(runtime, root)
      // THE RUNTIME ANSWERS head AS {full, short, branch}, not as a string (acceptance finding 19).
      const served = runtime !== null && runtime.repository ? (typeof runtime.repository.head === 'string' ? runtime.repository.head : (runtime.repository.head?.full ?? null)) : null
      serving = served
      const servesTheLandedCommit = !officeRunsFromTheLane || served === finalCommit
      if (health.body.ok === true && servesTheLandedCommit) {
        return {
          ok: true,
          waitedMs: Date.now() - started,
          officeRunsFromTheLane,
          serving: served,
          says: officeRunsFromTheLane ? `the office is healthy and serves ${finalCommit}` : 'the office is healthy; it does not run from this lane, so no restart was waited for',
        }
      }
      last = health.body.ok === true ? `healthy but serving ${String(served ?? 'unknown')}, not ${finalCommit}` : `not ok: ${JSON.stringify(health.body.wrong ?? health.body).slice(0, 400)}`
    } else if (health !== null) {
      last = `health answered ${String(health.status)}`
    }
    if (Date.now() >= deadline) {
      const sentence = `The office at ${API} was not healthy within ${String(chosen.healthFor)} seconds after main moved: ${String(last)}. Main is at ${git(root, ['rev-parse', 'HEAD'])}; nothing is rolled back.`
      const position = officeHealthPosition()
      await countAGateMet('office-healthy-after-landing', position)
      if (position === 'block') fail(sentence)
      const says = `${sentence} The gate office-healthy-after-landing is at remind, so the landing went on`
      log(says)
      return { ok: false, waitedMs: Date.now() - started, officeRunsFromTheLane, serving, says }
    }
    await sleep(2000)
  }
}

export async function readBackThroughTheOffice(absolute) {
  const reply = await ask('GET', `/api/file?path=${encodeURIComponent(absolute)}`, undefined, { raw: true })
  if (reply.status === 200) return { through: 'the office (GET /api/file)', hash: sha256(reply.bytes), officeSaid: null }
  let said = ''
  try {
    said = JSON.parse(reply.bytes.toString('utf8')).error ?? reply.bytes.toString('utf8')
  } catch {
    said = reply.bytes.toString('utf8')
  }
  return { through: 'the file system, because the office refused the read', hash: hashOfPath(absolute), officeSaid: `${String(reply.status)}: ${String(said).slice(0, 300)}` }
}
