// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Sweep this container's run scratch at its next start (gkeiJ4Dbxmi8 and 8NQcjkI_mUP-). */
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { localStampOf, theMomentOfALocalStamp } from '../src/config/stopped-run-cause.mjs'
import { notTheFolderMade, theProcessesNotRead, theProcessesUsing, theScratchFolderIsStillFree, whyAWorktreeKeepsIt } from './scratch-folder-checks.mjs'
import { isTheNamedInsideAnswer, whatNamesFilesInside } from './what-names-files-inside.mjs'

const ended = ['finished', 'sealed', 'crashed', 'stopped', 'failed', 'closed', 'orphaned']
/**
 * HOW LONG AN ENDED RUN'S FOLDER WAITS, AND WHAT KEEPS IT. A finished run's folder waits an hour from its record's last
 * change: the finish removes it itself (tools/sandbox-start.mjs), and the sweep takes the ones the finish left, such as a
 * run that said finished before its command ended. A crashed run's folder waits 24 hours, for whoever looks into the
 * crash, counted from the end of its command (data.commandEnded.at) and from its record's last change when no end is
 * recorded. A record that names a finished or crashed run's folder does not keep it, so the two record checks are not
 * asked for them. A sealed, stopped, failed, closed or orphaned run's folder waits 48 hours from its record's last
 * change, and is kept while a live record names it or a path inside it. For every run, the folder must still be the one
 * the run had, no process may work in it or hold a file in it, and no git worktree in it may hold changes or files nobody
 * committed, or a commit that no ref of its repository holds.
 */
export const A_FINISHED_RUNS_SCRATCH_WAITS_MS = 3_600_000
export const A_CRASHED_RUNS_SCRATCH_WAITS_MS = 24 * 3_600_000
export const AN_ENDED_RUNS_SCRATCH_WAITS_MS = 48 * 3_600_000
/** A wait in the words the lines say it in. */
const theWait = ms => ms === 3_600_000 ? 'an hour' : `${String(ms / 3_600_000)} hours`
export const SCRATCH_SWEEP_RULE = `A folder goes only when its name begins with a known 12-character run id followed by "-", the run has ended (${ended.join(', ')}), its own merge entry merged or its wait has passed, no process uses it, and no git worktree in it holds uncommitted changes or files, or a commit that no ref of its repository holds. The wait is ${theWait(A_FINISHED_RUNS_SCRATCH_WAITS_MS)} from the record's last change for a finished run, ${theWait(A_CRASHED_RUNS_SCRATCH_WAITS_MS)} from the end of its command for a crashed run (from the record's last change when no end is recorded), and ${theWait(AN_ENDED_RUNS_SCRATCH_WAITS_MS)} from the record's last change for any other. A record that names a finished or crashed run's folder does not keep it; any other run's folder is kept while a live record names it or a path inside it. Unknown checks keep it.`
function bytesOnDisk(path) {
  const info = lstatSync(path)
  return info.blocks * 512 + (info.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + bytesOnDisk(join(path, name)), 0) : 0)
}
/**
 * THE SWEEP IS GENTLE ON THE OFFICE, however long the office takes to answer. The named-inside check and the search each
 * held the live office for about 5 s, and one start once walked 45 folders, asking both back to back for each folder that
 * reached them. So no ask goes sooner than BETWEEN_SWEEP_ASKS_MS after the answer before it, and those two are asked
 * about SLOW_CHECKS_PER_START folders at most; any other folder that reaches them waits for a later start, with one line
 * saying so. Folders are taken in the order of their last check (lastChecked), never checked first, so a folder kept at
 * every start cannot hold the others back.
 */
export const BETWEEN_SWEEP_ASKS_MS = 2_000
export const SLOW_CHECKS_PER_START = 5
/**
 * A SHORTER PAUSE, FOR A TEST ONLY: SWEEP_PAUSE_MS_FOR_A_TEST in this process's own environment, in milliseconds, never
 * below THE_SHORTEST_SWEEP_PAUSE_MS. A test of the launcher sets it (tests/sandbox-launcher.test.ts), and tools/sandbox.mjs
 * passes it into the container only when its own environment has it; nothing else sets it. Unset, or not a number above
 * 0, the pause is BETWEEN_SWEEP_ASKS_MS. The inspector's view sweep keeps BETWEEN_SWEEP_ASKS_MS whatever it says.
 */
export const THE_SHORTEST_SWEEP_PAUSE_MS = 250
export function theSweepPauseMs() {
  const asked = Number(process.env['SWEEP_PAUSE_MS_FOR_A_TEST'])
  return Number.isFinite(asked) && asked > 0 ? Math.max(asked, THE_SHORTEST_SWEEP_PAUSE_MS) : BETWEEN_SWEEP_ASKS_MS
}
/** When the sweep last checked `path`, from its own "is kept" lines in the run's finish.log; null when it never did. */
function lastChecked(log, run, path) {
  if (!existsSync(log)) return null
  const kept = ` run ${run}: scratch sweep folder ${path} is kept: `
  let last = null
  for (const line of readFileSync(log, 'utf8').split('\n')) {
    const at = line.indexOf(kept) === 19 ? theMomentOfALocalStamp(line.slice(0, 19)) : null
    if (at !== null && (last === null || at > last)) last = at
  }
  return last
}
/** Why the office's answer to a read of `run`'s record gives no state of the run, or null when it gives one. */
function whyTheStateIsNotRead(read, run) {
  if (read.status !== 200) return `the office answered ${String(read.status)}`
  const record = read.body?.record
  if (record?.id !== run) return 'the office answered with no record of it'
  if (record.kind !== 'session') return `its record is a ${String(record.kind)}, not a run`
  if (record.deletedAt != null) return `its record was deleted at ${String(record.deletedAt)}`
  return null
}
/** What stands at `path`, or null when nothing does any more: a folder may go while the sweep waits between asks. */
function whatStandsAt(path) {
  try { return lstatSync(path) } catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}
/**
 * `ask` reads the office as the starter. Process readers, the clock and the sleep are injectable only for synthetic tests.
 * `ownRun` is the run whose start this is: its folder is in use, so it is not swept.
 */
export async function sweepRunScratch({ root = '/tmp', instanceDir, ask: askNow, workspace, now = Date.now(), processes = theProcessesUsing, free = theScratchFolderIsStillFree,
  ownRun = null, clock = Date.now, sleep = ms => new Promise(done => setTimeout(done, ms)) }) {
  let answered = null
  const pause = theSweepPauseMs()
  const ask = async (path, project) => {
    const wait = answered === null ? 0 : answered + pause - clock()
    if (wait > 0) await sleep(wait)
    try { return await askNow(path, project) } finally { answered = clock() }
  }
  const folders = []
  for (const name of readdirSync(root)) {
    const match = /^([A-Za-z0-9_-]{12})-.+$/.exec(name)
    if (match === null || match[1] === ownRun) continue
    const made = whatStandsAt(join(root, name))
    if (made === null || !made.isDirectory() || made.isSymbolicLink()) continue
    folders.push({ name, run: match[1], last: lastChecked(join(instanceDir, 'logs', match[1], 'finish.log'), match[1], join(root, name)) })
  }
  folders.sort((a, b) => (a.last ?? 0) - (b.last ?? 0) || (a.name < b.name ? -1 : 1))
  let slowChecks = 0
  for (const { name, run } of folders) {
    const path = join(root, name), made = whatStandsAt(path)
    if (made === null || !made.isDirectory() || made.isSymbolicLink()) continue
    const snapshot = { real: realpathSync(path), parent: realpathSync(root), dev: made.dev, ino: made.ino }
    let project = workspace
    const start = join(instanceDir, 'logs', run, 'start.json')
    if (existsSync(start)) {
      const recorded = JSON.parse(readFileSync(start, 'utf8'))
      if (typeof recorded.workspace === 'string' && recorded.workspace !== '') project = recorded.workspace
    }
    const log = join(instanceDir, 'logs', run, 'finish.log')
    mkdirSync(join(instanceDir, 'logs', run), { recursive: true })
    const say = words => appendFileSync(log, `${localStampOf(new Date(clock()))} run ${run}: ${words.includes('is removed.') ? 'scratch folder' : 'scratch sweep folder'} ${path} ${words}\n`)
    const read = await ask(`/api/records/${encodeURIComponent(run)}`, project)
    const unread = whyTheStateIsNotRead(read, run)
    if (unread !== null) { say(`is kept: the state of run ${run} could not be read: ${unread}.`); continue }
    const record = read.body.record
    const changed = theMomentOfALocalStamp(record.updatedAt)
    let merged = false
    const entry = record.data?.integrated?.entry
    if (typeof entry === 'string') {
      const readEntry = await ask(`/api/records/${encodeURIComponent(entry)}`, project)
      const own = readEntry.status === 200 ? readEntry.body?.record : null
      merged = own?.kind === 'merge_entry' && own.deletedAt == null && own.data?.run === run && own.data?.state === 'merged'
    }
    const state = record.data?.state
    if (!ended.includes(state)) {
      say(`is kept: the run has not ended; ${state === undefined ? 'its record names no state' : `its record says ${JSON.stringify(state)}`}.`); continue
    }
    const finished = state === 'finished', crashed = state === 'crashed'
    if (crashed) {
      // A CRASHED RUN'S WAIT COUNTS FROM THE END OF ITS COMMAND, and its line says which moment was read.
      const endedAt = record.data?.commandEnded?.at, end = theMomentOfALocalStamp(endedAt)
      const from = end ?? changed
      if (!(merged || from !== null && now - from > A_CRASHED_RUNS_SCRATCH_WAITS_MS)) {
        const counted = end !== null ? `the end of its command, ${endedAt}` : `its record's last change, ${String(record.updatedAt)}, as no end of its command is recorded`
        say(`is kept: run ${run} crashed, and its folder waits ${theWait(A_CRASHED_RUNS_SCRATCH_WAITS_MS)} from ${counted}.`); continue
      }
    } else {
      const waits = finished ? A_FINISHED_RUNS_SCRATCH_WAITS_MS : AN_ENDED_RUNS_SCRATCH_WAITS_MS
      if (!(merged || changed !== null && now - changed > waits)) {
        say(`is kept: the run has not ended with its own merge merged or a record last changed more than ${theWait(waits)} ago${finished ? ', as a finished run' : ''}.`); continue
      }
    }
    if (notTheFolderMade(path, snapshot) !== null) { say('is kept: the folder changed.'); continue }
    const held = processes(snapshot.real)
    if (held.using.length || held.unreadable.length) { say(`is kept: ${held.using.join('; ') || theProcessesNotRead(held.unreadable)}.`); continue }
    const worktree = whyAWorktreeKeepsIt(snapshot.real)
    if (worktree !== null) { say(`is kept: ${worktree}.`); continue }
    // A RECORD THAT NAMES A FINISHED OR CRASHED RUN'S FOLDER DOES NOT KEEP IT, so the two slow record checks are asked, and
    // counted against SLOW_CHECKS_PER_START, only for any other ended run.
    if (!finished && !crashed) {
      if (slowChecks === SLOW_CHECKS_PER_START) {
        say(`is not checked this time: one start asks the two slow record checks about ${SLOW_CHECKS_PER_START} folders at most, so it waits for a later start.`); continue
      }
      slowChecks += 1
      const named = await ask(`/api/report-files/named-inside?folder=${encodeURIComponent(path)}`, project)
      // The answer is judged, and its count said, by the module tools/remove-a-worktree.mjs uses too.
      if (named.status !== 200 || !isTheNamedInsideAnswer(named.body, path)) {
        say('is kept: the complete live-record reference check did not answer.'); continue
      }
      const naming = whatNamesFilesInside(named.body)
      if (naming !== null) { say(`is kept: ${naming}`); continue }
      // Keep readable prose protection beside the complete omitted-record count.
      const prose = await ask(`/api/search?q=${encodeURIComponent(path)}&limit=1`, project)
      if (prose.status !== 200 || typeof prose.body?.counts?.matched !== 'number' || prose.body.counts.matched > 0 ||
        !Array.isArray(prose.body.elsewhere) || prose.body.elsewhere.some(one => one.matched > 0)) {
        say('is kept: readable prose names it, or its reference check was incomplete.'); continue
      }
    }
    const bytes = bytesOnDisk(path)
    // The log must be writable before removal. Repeat identity/process checks immediately before rm, with no await.
    appendFileSync(log, '')
    const last = free(path, snapshot)
    if (last.why !== null || last.unreadable.length > 0) { say(`is kept: ${last.why ?? theProcessesNotRead(last.unreadable)}.`); continue }
    rmSync(snapshot.real, { recursive: true })
    say(`(${bytes} bytes) is removed. Rule: ${SCRATCH_SWEEP_RULE}`)
  }
}
