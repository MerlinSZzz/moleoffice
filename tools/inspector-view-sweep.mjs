#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK VIEWS A SWEEP WOULD REMOVE, AND WHY EVERY OTHER ONE IS KEPT. The sweep is dry: nothing in this file removes,
 * moves or changes a view. It does read files in one: to say what would move, it compares work/ with the check's tip
 * through outsideTheCommit, which opens and hashes every tracked file in work/, synchronously, in the caller's process.
 *
 * A check of the inspector runs in a view, <instance folder>/check-views/<check>/, which holds home/, work/ and tmp/.
 * leaveTheSandbox (tools/inspector-sandbox.mjs) removes a view only after a delivered verdict, so a check that crashed,
 * was stopped or ended without a verdict leaves its view for good. sweepTheCheckViews reads each view against the four
 * conditions of VIEW_SWEEP_RULE and writes one line about it in <instance folder>/logs/view-sweep.log: that it is kept,
 * and why. The inspector cannot read every message that names a check, so no view gets past condition 4; a view every
 * other reading would let go says what would move first (KEPT_ONLY_BY_THE_MESSAGES). The inspector begins one sweep at
 * each check's start (theViewSweepBegins), and never waits for it.
 *
 * It also writes the notes for views that were removed by hand before this sweep existed (theViewRemovedNotes). That
 * part reads only each <check>.REMOVED.txt and one line of the deletion log, never a view.
 *
 *     node tools/inspector-view-sweep.mjs sweep <instance folder> [--api <address>]
 *     node tools/inspector-view-sweep.mjs notes <instance folder> --log <deletion log> --at '<YYYY-MM-DD HH:MM:SS>' --place '<place>' [--write]
 */
import { appendFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { lstat, opendir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { setTimeout as waitFor } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { theCodexRolloutFor } from '../src/config/codex-log.mjs'
import { settingValue } from '../src/config/settings.mjs'
import { localStampOf, theMomentOfALocalStamp } from '../src/config/stopped-run-cause.mjs'
import { theTranscriptOfTheSession } from './dsh-hooks/served.mjs'
import { A_CHECK_ID, THE_LOGIN_FILES_IN_A_CHECK_VIEW, VIEW_REMOVED_NOTE } from './inspector-sandbox.mjs'
import { anAgentsToolHeaders, stillThere, theChecksMarker } from './sandbox-common.mjs'
import { outsideTheCommit } from './sandbox-git.mjs'
import { theProcessesNotRead, theProcessesUsing } from './scratch-folder-checks.mjs'
import { BETWEEN_SWEEP_ASKS_MS, SLOW_CHECKS_PER_START } from './sweep-run-scratch.mjs'
import { isTheNamedInsideAnswer, whatNamesFilesInside } from './what-names-files-inside.mjs'
import { whereIsTheApiForACommand, whichWorkspace } from './where-is-the-api.mjs'
import { readAFullList } from './a-full-list-read.mjs'

/**
 * THE STATES A CHECK'S SESSION ENDS IN. The office files a new session for every start of a check, a retry and an
 * ask-again included, and revokes an ended session's key, so a session in one of these states is never started again.
 * paused is left out: a paused check is to be resumed, in its view.
 */
export const THE_ENDED_CHECK_STATES = Object.freeze(['finished', 'crashed', 'orphaned'])
/** How long nothing in a view may have changed before it would go. A view kept by case 2 of the rule for a check with no verdict (tools/inspector-sandbox.mjs) waits this long. */
export const THE_HOURS_A_VIEW_STAYS = 24
/** The problem states that say a problem is over (src/shared/kinds.ts, PROBLEM_STATES). Any other keeps the view. */
const A_PROBLEM_IS_OVER = new Set(['fixed', 'worked_around', 'accepted'])
/**
 * THE MOST ENTRIES ONE SWEEP READS, over all its views. A view holds some tens of thousands. A view the bound runs out in
 * is kept as not read whole, and the next sweep reads it first.
 */
export const THE_ENTRIES_ONE_SWEEP_READS = 250_000
/** The file of the sweep's lines, in the instance folder's logs. */
export const VIEW_SWEEP_LOG = 'view-sweep.log'
/** The note a check's folder keeps when its view went, as tools/inspector-sandbox.mjs names it. */
export { VIEW_REMOVED_NOTE }
/** The rule a sweep reads each view by, in one sentence. Every sweep writes it first, and the command line prints it. */
export const VIEW_SWEEP_RULE = `A check's view would go only when the office says its check ended (${THE_ENDED_CHECK_STATES.join(', ')}) and so will not be retried, no inspector marker and no process holds it, nothing in it changed for ${String(THE_HOURS_A_VIEW_STAYS)} hours, and no open problem, record or unanswered message names the check or the view's path; a reading that could not be made keeps the view, the messages that name a check are such a reading because the inspector may read only the messages it is a party to, and this sweep removes and moves nothing. A kernel thread the helper cannot read is not counted: the kernel marks it so in /proc/<pid>/stat, which every user can read, and a kernel thread works in / and holds no file open.`
/**
 * WHY A VIEW EVERY OTHER READING WOULD LET GO IS KEPT. The office lets the inspector read only the messages it is a party
 * to, and no door counts the others, so an unanswered message that names the check can never be ruled out here. Such a
 * view still says what would move, and the closing line counts it apart.
 */
export const KEPT_ONLY_BY_THE_MESSAGES = 'condition 4 could not be read: the messages that name the check could not be read, because the inspector may read only the messages it is a party to; every other reading would let it go.'

const theLogOf = (instanceDir) => join(instanceDir, 'logs', VIEW_SWEEP_LOG)
const aLineAbout = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) the view of check (\S+) at /
/** The two reasons that say a view was not judged this time, so its line is no reading of it. */
const NOT_JUDGED = /^\S+ \S+ the view of check \S+ at .* is kept: (?:it was not read whole|it is not checked this time):/

/**
 * When the sweep last judged each check's view, from its own log. A view never judged is absent, so it is read first:
 * a view the bound cut off or the slow asks left over comes before the views judged already.
 */
function whenEachViewWasLastRead(log) {
  const last = new Map()
  let text = ''
  try { text = readFileSync(log, 'utf8') } catch (error) { if (error?.code === 'ENOENT') return last; throw error }
  for (const line of text.split('\n')) {
    const match = NOT_JUDGED.test(line) ? null : aLineAbout.exec(line)
    const at = match === null ? null : theMomentOfALocalStamp(match[1])
    if (at !== null && (last.get(match[2]) ?? -Infinity) < at) last.set(match[2], at)
  }
  return last
}

/** "1 file" or "2 files". */
const files = (count) => `${String(count)} ${count === 1 ? 'file' : 'files'}`

/**
 * THE NEWEST CHANGE IN A VIEW, AND THE FILES OF HOME/ AND TMP/ THAT WOULD MOVE, read with lstat alone: no file is opened
 * and no link is followed. The view folder counts as one entry. `budget.left` is shared by the whole sweep; when it runs
 * out, `whole` is false. Logins and node_modules never move, so they are left out of `elsewhere`, and counted apart.
 */
async function walkTheView(view, budget, signal) {
  const read = { whole: true, entries: 0, newest: 0, newestPath: view, elsewhere: new Map() }
  const logins = new Set(Object.values(THE_LOGIN_FILES_IN_A_CHECK_VIEW).map((file) => join('home', file)))
  const take = (path, info) => {
    read.entries += 1
    budget.left -= 1
    const changed = Math.max(info.mtimeMs, info.ctimeMs)
    if (changed > read.newest) { read.newest = changed; read.newestPath = path }
    const inside = relative(view, path)
    const part = inside.split(sep)[0]
    if (info.isDirectory() || !['home', 'tmp'].includes(part) || logins.has(inside) || inside.split(sep).includes('node_modules')) return
    read.elsewhere.set(inside, info.size)
  }
  take(view, await lstat(view))
  const folders = [view]
  while (folders.length > 0) {
    const folder = folders.pop()
    for await (const entry of await opendir(folder)) {
      if (signal?.aborted) throw signal.reason
      if (budget.left <= 0) { read.whole = false; return read }
      const path = join(folder, entry.name)
      const info = await lstat(path)
      take(path, info)
      if (info.isDirectory()) folders.push(path)
    }
  }
  return read
}

/** The transcript of the check's model, found from model-session.json as the runtime keeps it, or why it is not. */
function theTranscriptOf(session, home) {
  const id = typeof session?.session === 'string' && session.session.trim() !== '' ? session.session : null
  if (id === null) return { path: null, why: 'model-session.json names no session' }
  const path = session.runtime === 'dsh' ? theTranscriptOfTheSession(join(home, '.dsh'), '/work', id)
    : session.runtime === 'codex' ? theCodexRolloutFor(id, join(home, '.codex', 'sessions'))
      : session.runtime === 'opencode' ? join(home, '.local', 'share', 'opencode', 'opencode.db')
        : session.runtime === 'claude-code' ? join(home, '.claude', 'projects', '-work', `${id}.jsonl`)
          : undefined
  if (path === undefined) return { path: null, why: `this sweep does not know where a ${String(session.runtime)} check keeps its transcript` }
  if (path === null) return { path: null, why: `no transcript of ${String(session.runtime)} session ${id} was found under ${home}` }
  try {
    const info = lstatSync(path)
    if (!info.isFile()) return { path: null, why: `${path} is not a file` }
    return { path, bytes: info.size }
  } catch (error) {
    return { path: null, why: `${path} could not be read (${String(error?.code ?? error)})` }
  }
}

/**
 * WHAT WOULD MOVE BEFORE A VIEW WENT, as one sentence: the transcript's path and size, whether work/ has changes and in
 * how many files, and the count and size of everything else in home/ and tmp/. Nothing is copied, but the comparison of
 * work/ with the tip opens and hashes every tracked file there, and the caller's process waits for it.
 */
function whatWouldMove(view, checksFolder, walked) {
  let session = null
  try { session = JSON.parse(readFileSync(join(checksFolder, 'model-session.json'), 'utf8')) } catch (error) {
    session = { unreadable: String(error?.code ?? error?.message ?? error) }
  }
  const transcript = session.unreadable !== undefined ? { path: null, why: `model-session.json could not be read (${session.unreadable})` }
    : theTranscriptOf(session, join(view, 'home'))
  let work
  if (typeof session.tip !== 'string' || session.tip === '') work = { says: 'work/ could not be compared: model-session.json names no tip' }
  else {
    try {
      const outside = outsideTheCommit(join(view, 'work'), session.tip)
      const count = outside.lines.length + outside.notCompared.length
      work = { changed: count, says: count === 0 ? 'work/ has no changes' : `work/ has changes in ${files(count)}` }
    } catch (error) {
      work = { says: `work/ could not be compared with ${session.tip}: ${String(error?.message ?? error).split('\n')[0]}` }
    }
  }
  const rest = [...walked.elsewhere].filter(([inside]) => transcript.path === null || join(view, inside) !== transcript.path)
  const bytes = rest.reduce((sum, [, size]) => sum + size, 0)
  return {
    transcript, work, elsewhere: { files: rest.length, bytes },
    says: `${transcript.path === null ? `no transcript: ${transcript.why}` : `the transcript ${transcript.path}, ${String(transcript.bytes)} bytes`}; ${work.says}; ` +
      `everything else in home/ and tmp/, ${files(rest.length)} of ${String(bytes)} bytes, leaving out the logins and node_modules`,
  }
}

/** The office's answer to a read, as `{ status, body }`, printing nothing. A request nothing answered has status null. */
export function askTheOfficeQuietly({ api, headers }) {
  return async (path, project, signal) => {
    try {
      const reply = await fetch(`${api}${path}`, {
        headers: { ...headers(), 'x-mole-office-workspace': project },
        signal: signal === undefined ? AbortSignal.timeout(30_000) : AbortSignal.any([AbortSignal.timeout(30_000), signal]),
        redirect: 'manual',
      })
      const text = await reply.text()
      let body = null
      try { body = JSON.parse(text) } catch { /* A body that is not JSON is no answer to judge; the status says what came. */ }
      return { status: reply.status, body }
    } catch (error) {
      if (signal?.aborted) throw error
      return { status: null, body: null, why: String(error?.cause?.message ?? error?.message ?? error) }
    }
  }
}

/**
 * SWEEP EVERY VIEW UNDER THE INSTANCE FOLDER, DRY. `ask(path, project, signal)` reads the office as the starter; the
 * process reader, the clock, the sleep and the entry bound are given only by synthetic tests. `ownCheck` is the check
 * whose start this is: its view is in use. Returns one entry per view, `{ check, view, kept, reason, wouldMove }`, in
 * the order read, and writes one line for each to the log, between a line with the rule and a closing line.
 */
export async function sweepTheCheckViews({ instanceDir, sandboxes, instance, ask: askNow, workspace, ownCheck = /** @type {string | null} */ (null), now = Date.now(),
  processes = theProcessesUsing, clock = Date.now, sleep = (ms, signal) => waitFor(ms, undefined, { signal }), signal = /** @type {AbortSignal | undefined} */ (undefined),
  entries = THE_ENTRIES_ONE_SWEEP_READS, lifecycle = null }) {
  const log = theLogOf(instanceDir)
  mkdirSync(dirname(log), { recursive: true })
  const say = (words) => appendFileSync(log, `${localStampOf(new Date(clock()))} ${words}\n`)
  let answered = null
  const ask = async (path, project) => {
    const wait = answered === null ? 0 : answered + BETWEEN_SWEEP_ASKS_MS - clock()
    if (wait > 0) await sleep(wait, signal)
    try { return await askNow(path, project, signal) } finally { answered = clock() }
  }
  const views = join(instanceDir, 'check-views')
  say(`a dry sweep of the check views in ${views} began. Rule: ${VIEW_SWEEP_RULE}`)
  lifecycle?.began(views)
  if (signal?.aborted) throw signal.reason
  let names = []
  try { names = readdirSync(views) } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const last = whenEachViewWasLastRead(log)
  names = names.filter((name) => !(name.endsWith('.REMOVED.txt') && lstatSync(join(views, name)).isFile()))
    .sort((a, b) => (last.get(a) ?? -Infinity) - (last.get(b) ?? -Infinity) || (a < b ? -1 : 1))
  const checks = join(instanceDir, 'checks')
  const budget = { left: entries }
  let slowChecks = 0
  const out = []
  for (const check of names) {
    if (signal?.aborted) throw signal.reason
    const view = join(views, check)
    const kept = (reason, wouldMove = null) => {
      if (signal?.aborted) throw signal.reason
      const one = { check, view, kept: true, reason, wouldMove }
      say(theLineAbout(one))
      out.push(one)
      lifecycle?.read(out.length)
    }
    const made = lstatSync(view, { throwIfNoEntry: false })
    if (made === undefined) continue
    if (made.isSymbolicLink()) { kept('it is a link, and no link is followed.'); continue }
    if (!made.isDirectory()) { kept('it is not a folder.'); continue }
    if (check === ownCheck) { kept('it is the view of the check whose start began this sweep.'); continue }

    let folders
    try { folders = readdirSync(checks).filter((name) => name.startsWith('a-check-of-') && name.endsWith(`-${check}`)) } catch (error) {
      kept(`its checks folder could not be looked for in ${checks} (${String(error?.code ?? error)}).`); continue
    }
    if (folders.length !== 1) {
      kept(folders.length === 0 ? `no checks folder a-check-of-<run>-${check} is in ${checks}.` : `${String(folders.length)} checks folders in ${checks} end in -${check}.`)
      continue
    }
    const checksFolder = join(checks, folders[0])

    // CONDITION 2, THE MARKER: read, never cleared. A check writes itself down there while it uses the container.
    const marker = theChecksMarker(sandboxes, instance, check)
    let holder = null
    try { holder = JSON.parse(readFileSync(marker, 'utf8')) } catch (error) {
      if (error?.code !== 'ENOENT') { kept(`condition 2 could not be read: the marker ${marker} could not be read (${String(error?.code ?? error?.message ?? error)}).`); continue }
    }
    if (holder !== null && stillThere(holder)) { kept(`condition 2: the marker ${marker} names process ${String(holder.pid)}, which is still running.`); continue }

    // CONDITION 1, ENDED: the check's session, in whichever project holds it.
    let read = await ask(`/api/records/${encodeURIComponent(check)}`, workspace)
    const elsewhere = read.status === 404 ? read.body?.elsewhere?.workspaceId : undefined
    if (typeof elsewhere === 'string' && elsewhere !== workspace) read = await ask(`/api/records/${encodeURIComponent(check)}`, elsewhere)
    const record = read.status === 200 ? read.body?.record : null
    if (record === null || record?.id !== check) {
      kept(`condition 1 could not be read: the office gave no record ${check} (${read.status === null ? `nothing answered: ${String(read.why)}` : `status ${String(read.status)}`}).`); continue
    }
    if (record.kind !== 'session') { kept(`condition 1: record ${check} is a ${String(record.kind)}, not a check's session.`); continue }
    if (record.deletedAt != null) { kept(`condition 1: the session ${check} is deleted, so whether its check ended cannot be said.`); continue }
    const state = record.data?.state
    if (!THE_ENDED_CHECK_STATES.includes(state)) {
      kept(`condition 1: its session is ${typeof state === 'string' ? state : 'in no state anybody gave'}, not ended.`); continue
    }

    // CONDITION 3, 48 HOURS: the newest change anywhere in the view, within the sweep's bound.
    let walked
    try { walked = await walkTheView(view, budget, signal) } catch (error) {
      if (signal?.aborted) throw error
      kept(`condition 3 could not be read: ${String(error?.path ?? view)} could not be read (${String(error?.code ?? error?.message ?? error)}).`); continue
    }
    if (!walked.whole) {
      kept(`it was not read whole: this sweep reads ${String(entries)} entries at most over all views, so a later sweep reads it first.`); continue
    }
    if (now - walked.newest < THE_HOURS_A_VIEW_STAYS * 3_600_000) {
      kept(`condition 3: ${walked.newestPath} changed at ${localStampOf(new Date(walked.newest))}, within ${String(THE_HOURS_A_VIEW_STAYS)} hours.`); continue
    }

    // CONDITION 2, PROCESSES: a process that works in the view or holds a file in it. A model inside a container shows
    // the container's paths, which the marker covers.
    const held = processes(realpathSync(view))
    if (held.using.length > 0) { kept(`condition 2: ${held.using.join('; ')}.`); continue }
    if (held.unreadable.length > 0) { kept(`condition 2 could not be read: ${theProcessesNotRead(held.unreadable)}.`); continue }

    // CONDITION 4, THE SLOW ASKS, for a few views per sweep.
    if (slowChecks === SLOW_CHECKS_PER_START) {
      kept(`it is not checked this time: one sweep asks the slow record checks about ${String(SLOW_CHECKS_PER_START)} views at most, so it waits for a later sweep.`); continue
    }
    slowChecks += 1
    const named = await ask(`/api/report-files/named-inside?folder=${encodeURIComponent(view)}`, workspace)
    if (named.status !== 200 || !isTheNamedInsideAnswer(named.body, view)) {
      kept('condition 4 could not be read: the office did not say which records name a file inside the view.'); continue
    }
    const naming = whatNamesFilesInside(named.body)
    if (naming !== null) { kept(`condition 4: ${naming}`); continue }
    const prose = await ask(`/api/search?q=${encodeURIComponent(view)}&limit=1`, workspace)
    if (prose.status !== 200 || typeof prose.body?.counts?.matched !== 'number' || !Array.isArray(prose.body?.elsewhere)) {
      kept('condition 4 could not be read: the search for the view\'s path did not answer.'); continue
    }
    if (prose.body.counts.matched > 0 || prose.body.elsewhere.some((one) => one.matched > 0)) {
      kept('condition 4: a record names the view\'s path.'); continue
    }
    const problems = await readAFullList(
      (path) => ask(path, workspace),
      `/api/records?kind=problem&q=${encodeURIComponent(check)}&shape=full`,
    )
    if (problems.status !== 200 || !Array.isArray(problems.body?.records) || problems.body.truncated !== false || problems.body.left !== 0) {
      kept('condition 4 could not be read: the office could not give every problem that names the check.'); continue
    }
    // A NARROW PAGE IS NOT READ AS A CLEAN ONE: its rows have no state word, so the check would find nothing open.
    if (problems.body.records.some((one) => typeof one?.incompleteCount !== 'number')) {
      kept('condition 4 could not be read: the office answered the narrow problem rows and not their state words.'); continue
    }
    const open = problems.body.records.find((problem) => !A_PROBLEM_IS_OVER.has(problem?.data?.state))
    if (open !== undefined) {
      kept(`condition 4: problem ${String(open.id)} names the check and is ${typeof open.data?.state === 'string' ? open.data.state : 'in no state anybody gave'}.`); continue
    }
    kept(KEPT_ONLY_BY_THE_MESSAGES, whatWouldMove(view, checksFolder, walked))
  }
  if (signal?.aborted) throw signal.reason
  say(theSweepEnded(views, out))
  lifecycle?.ended()
  return out
}

/** The line a sweep writes about one view. */
const theLineAbout = (one) => `the view of check ${one.check} at ${one.view} is kept: ${one.reason}${one.wouldMove === null ? '' : ` What would move: ${one.wouldMove.says}.`}`

/** The closing line of a sweep: how many views it read, how many of them only the messages kept, and that it removed nothing. */
function theSweepEnded(views, out) {
  const onlyTheMessages = out.filter((one) => one.reason === KEPT_ONLY_BY_THE_MESSAGES).length
  return `the dry sweep of ${views} ended: ${String(out.length)} ${out.length === 1 ? 'view' : 'views'} read, ${String(out.length - onlyTheMessages)} kept by another reading, ` +
    `${String(onlyTheMessages)} kept only because the messages could not be read, and nothing was removed or moved.`
}

/**
 * BEGIN A SWEEP AND RETURN AT ONCE: `{ stop, done }`. The sweep starts after the caller's current turn, so the caller's
 * start never waits for it. `stop()` cuts it off, its pending ask and wait included, so it never keeps the process up. A
 * failure is one line in the log and nothing else: it never changes what the caller says or how it exits.
 */
export function theViewSweepBegins(options) {
  const stopping = new AbortController()
  let views = null
  let count = 0
  let closed = false
  const close = (why) => {
    if (closed || views === null) return
    closed = true
    process.removeListener('exit', onExit)
    try {
      appendFileSync(theLogOf(options.instanceDir), `${localStampOf(new Date())} the dry sweep of ${views} stopped ${why}: ${String(count)} ${count === 1 ? 'view' : 'views'} read, and nothing was removed or moved.\n`)
    } catch {
      // A log that cannot be written must not change the check's exit.
    }
  }
  const onExit = () => close('because the inspector exited')
  const lifecycle = {
    began: (path) => {
      views = path
      process.once('exit', onExit)
      if (stopping.signal.aborted) close('because its check ended')
    },
    read: (number) => { count = number },
    ended: () => { closed = true; process.removeListener('exit', onExit) },
  }
  const done = new Promise((begin) => setImmediate(begin))
    .then(() => sweepTheCheckViews({ ...options, signal: stopping.signal, lifecycle }))
    .catch((error) => {
      if (stopping.signal.aborted) return
      close(`because ${String(error?.message ?? error).split('\n')[0]}`)
    })
  return { stop: () => { stopping.abort(); close('because its check ended') }, done }
}

// ============================================================================ the notes for views removed by hand

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
/** The layout of a <check>.REMOVED.txt written for the batch, one line ending in a newline. */
const THE_BATCH_LAYOUT = new RegExp(`^Removed \\d{1,2} (?:${MONTHS}) \\d{4} at \\d{2}:\\d{2} by [^()\\n]+ \\([^()\\n]+\\): ` +
  'the home, tmp and work copy of ended check (\\S+), (\\d+) bytes\\. On the lab NAS as ([^\\n]+)\\. Logged in [^\\n]+\'s [^\\n]+\\.\\n$')

/** The one line of the deletion log the batch wrote at `at`, read into its parts, or why it cannot be used. */
function theBatchLine(log, at, instanceDir) {
  const lines = readFileSync(log, 'utf8').split('\n').filter((line) => line.startsWith(`${at} removed `))
  if (lines.length !== 1) return { why: `${String(lines.length)} lines of ${log} begin "${at} removed "; exactly one must` }
  const match = /^\S+ \S+ removed (\S+) \((\d+) bytes: the views of (\d+) ended inspector checks, renamed there from (.+?)\/check-views\/[^:]*: ([^)]*)\); whole snapshot /.exec(lines[0])
  if (match === null) return { why: `the line of ${log} at ${at} is not in the batch's layout` }
  const ids = match[5].split(/[\s,]+/).filter((id) => id !== '')
  if (!ids.every((id) => A_CHECK_ID.test(id))) return { why: `the line of ${log} at ${at} lists something that is not a check id` }
  if (Number(match[3]) !== ids.length) return { why: `the line of ${log} at ${at} says ${match[3]} checks and lists ${String(ids.length)}` }
  const named = match[4].startsWith('~/') ? join(homedir(), match[4].slice(2)) : match[4]
  if (named !== instanceDir) return { why: `the line of ${log} at ${at} names the instance folder ${match[4]}${named === match[4] ? '' : `, read as ${named}`}, not ${instanceDir}` }
  return { checks: ids }
}

/**
 * THE NOTES TO WRITE FOR VIEWS REMOVED BY HAND, AND THE CHECKS PASSED BY. Reads the names in check-views/ and checks/,
 * each <check>.REMOVED.txt, and the one line of `log` that begins with `at`; it opens no view. A leading ~/ in that line
 * is read as the home folder. `place` is where the batch put the views, as each REMOVED.txt names it, with the text
 * <check> standing for the check. A note is planned only when the batch line names the check, its REMOVED.txt has the
 * batch layout, and it names the same place.
 * Returns `{ refused }` when nothing may be written at all, else `{ notes: [{ check, path, note }], passed: [{ check, why }] }`.
 */
export function theViewRemovedNotes({ instanceDir, log, at, place }) {
  const line = theBatchLine(log, at, instanceDir)
  if (line.why !== undefined) return { refused: `${line.why}. Nothing is written.` }
  const views = join(instanceDir, 'check-views')
  const checks = join(instanceDir, 'checks')
  const removed = readdirSync(views).filter((name) => name.endsWith('.REMOVED.txt')).map((name) => name.slice(0, -'.REMOVED.txt'.length))
  const folders = readdirSync(checks)
  const notes = []
  const passed = []
  for (const check of [...new Set([...removed, ...line.checks])].sort()) {
    const pass = (why) => passed.push({ check, why })
    if (!removed.includes(check)) { pass('the batch line names it and no REMOVED.txt is there'); continue }
    const from = join(views, `${check}.REMOVED.txt`)
    const said = THE_BATCH_LAYOUT.exec(readFileSync(from, 'utf8'))
    if (said === null || said[1] !== check) { pass('removed earlier, in another layout; left alone'); continue }
    if (!line.checks.includes(check)) { pass('the batch line does not name it'); continue }
    const wanted = place.replaceAll('<check>', check)
    if (said[3] !== wanted) { pass(`its REMOVED.txt names another place: ${said[3]}`); continue }
    const own = folders.filter((name) => name.startsWith('a-check-of-') && name.endsWith(`-${check}`))
    if (own.length !== 1) { pass(own.length === 0 ? `no checks folder a-check-of-<run>-${check}` : `${String(own.length)} checks folders end in -${check}`); continue }
    const path = join(checks, own[0], VIEW_REMOVED_NOTE)
    if (lstatSync(path, { throwIfNoEntry: false }) !== undefined) { pass(`${VIEW_REMOVED_NOTE} is there already; left as it is`); continue }
    notes.push({
      check, path, note: {
        check, moved: `nothing; the whole view is on the network store at ${wanted}`, bytes: Number(said[2]), removedAt: at,
        resume: 'This check can no longer resume: its view is not on this machine.', from: { note: from, log },
      },
    })
  }
  return { notes, passed }
}

/** Write each planned note, never over a file already there. Returns the notes written and those found already there. */
export function writeTheViewRemovedNotes(plan) {
  const written = []
  const there = []
  for (const one of plan.notes) {
    try {
      writeFileSync(one.path, `${JSON.stringify(one.note, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
      written.push(one)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      there.push(one)
    }
  }
  return { written, there }
}

// ============================================================================ the command line

async function main(argv) {
  const [verb, instanceDir, ...rest] = argv
  const flag = (name) => { const at = rest.indexOf(name); return at === -1 ? null : rest[at + 1] ?? null }
  if (verb === 'sweep' && typeof instanceDir === 'string' && (rest.length === 0 || (rest.length === 2 && flag('--api') !== null))) {
    const self = settingValue('MOLE_OFFICE_AGENT')
    const headers = () => anAgentsToolHeaders({ self, withoutAKey: self ?? 'inspector-view-sweep' })
    const workspace = whichWorkspace()
    const instance = resolve(instanceDir)
    const swept = await sweepTheCheckViews({ instanceDir: instance, sandboxes: dirname(instance), instance: basename(instance), workspace,
      ask: askTheOfficeQuietly({ api: whereIsTheApiForACommand(flag('--api') ?? undefined), headers }) })
    process.stdout.write(`Rule: ${VIEW_SWEEP_RULE}\n`)
    for (const one of swept) process.stdout.write(`${theLineAbout(one)}\n`)
    process.stdout.write(`${theSweepEnded(join(instance, 'check-views'), swept)} The lines are in ${theLogOf(instance)}.\n`)
    return 0
  }
  const log = flag('--log'), at = flag('--at'), place = flag('--place')
  const write = rest.includes('--write')
  if (verb === 'notes' && typeof instanceDir === 'string' && log !== null && at !== null && place !== null &&
    rest.length === 6 + (write ? 1 : 0) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at) && place.includes('<check>')) {
    const plan = theViewRemovedNotes({ instanceDir, log, at, place })
    if (plan.refused !== undefined) { process.stderr.write(`${plan.refused}\n`); return 1 }
    for (const one of plan.passed) process.stdout.write(`check ${one.check}: ${one.why}.\n`)
    if (!write) {
      for (const one of plan.notes) process.stdout.write(`check ${one.check}: would write ${one.path}:\n${JSON.stringify(one.note, null, 2)}\n`)
      process.stdout.write(`Dry: ${files(plan.notes.length).replace('file', 'note')} would be written and nothing was. Add --write to write them.\n`)
      return 0
    }
    const done = writeTheViewRemovedNotes(plan)
    for (const one of done.written) process.stdout.write(`check ${one.check}: wrote ${one.path}.\n`)
    for (const one of done.there) process.stdout.write(`check ${one.check}: ${VIEW_REMOVED_NOTE} is there already; left as it is.\n`)
    return 0
  }
  process.stderr.write([
    'node tools/inspector-view-sweep.mjs sweep <instance folder> [--api <address>]',
    "node tools/inspector-view-sweep.mjs notes <instance folder> --log <deletion log> --at '<YYYY-MM-DD HH:MM:SS>' --place '<place, with <check> for the check>' [--write]",
    '',
  ].join('\n'))
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
