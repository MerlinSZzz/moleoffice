// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE DEVELOPMENT SUPERVISOR: it starts the API server, watches the code the server and its message
 * worker are built from, and starts the server again when that code changes.
 *
 * `npm run dev:server` runs this. It is what `tsx watch src/server/index.ts` used to be.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `7XK5_FQcvEjl`. `tsx watch` puts ONE WATCH ON EACH FILE the server loaded. A watch on a
 * file follows the file's inode, not its name, and several ordinary things replace a file rather
 * than write into it: `git checkout`, `git merge`, `git stash pop`, and every editor that saves by
 * writing a temporary file and renaming it over the target.
 *
 * Measured on this machine on 4 September 2026, on a scratch stack under `tsx watch`:
 *
 *   - fresh start: 714 inotify watches, `src/shared/product.ts` among them;
 *   - `git checkout -- src/shared/product.ts`: the server restarted, and afterwards there were 713
 *     watches and `src/shared/product.ts` was NOT among them;
 *   - from then on nothing about that file restarted the server. An append: no restart. A rename
 *     over it: no restart. A rewrite in place: no restart. For the life of that supervisor.
 *
 * The server was then really running old code, said so, `GET /api/health` answered ok false, the
 * red banner blocked the browser app, and the four measuring instruments refused to measure. Every
 * word of that was true and no restart was ever coming. It lands where builders work: every merge
 * onto a checkout a live server watches rewrites files.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX: WATCH THE FOLDERS, NOT THE FILES
 * ---------------------------------------------------------------------------------------
 *
 * A DIRECTORY's inode is not replaced when a file inside it is unlinked and written again — that is
 * what unlinking a file inside a directory MEANS. So a watch on the directory keeps working across
 * every one of those saves, and it is the same watch that reports the file appearing again.
 *
 * So this watches `THE_SERVER_FOLDERS` (each one recursively, so a new sub-folder is covered too)
 * plus the directory of every file in the set that lies outside them, including the worker's
 * files and two files under `src/web/lib`, which `lib/records.ts` imports.
 *
 * IT STILL RESTARTS ONLY FOR FILES THE SERVER OR ITS WORKER IS BUILT FROM. Watching a folder is how
 * the change is NOTICED; the set from `src/config/import-graph.mjs` decides whether it MATTERS. Problem
 * `TMy3C0ydoYYR` is what happens when those two are the same list: seven files under `src/shared`
 * belong to the browser app, and judging the server by the folder made it report itself stale about
 * code it never loaded.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER TWO THINGS TSX WATCH DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * 1. **It does not restart a server that CRASHED.** Measured the same day: `kill -KILL` on the
 *    child, and twenty-five seconds later nothing was listening on the port and `tsx watch` was
 *    still sitting there waiting for a file to change. The port was dead and silent. This restarts
 *    it, with a backoff that grows, so a server that cannot start prints a line every time instead
 *    of spinning invisibly.
 * 2. **It does not tell the server anything.** A server under `tsx watch` cannot say why it just
 *    started. This sets `MOLE_OFFICE_RESTART_REASON` on every child, and `GET /api/runtime` reports
 *    it under `supervisor`, beside a reading of what is watching — taken from the parent process's
 *    command line rather than from anything this file claims.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT KEEP TSX WATCH AND TURN POLLING ON
 * ---------------------------------------------------------------------------------------
 *
 * That was measured too, and it works: `tsx` bundles `chokidar`, `chokidar` reads
 * `CHOKIDAR_USEPOLLING` out of the environment, and with it set the `git checkout` and the rename
 * both survived. It was not chosen for three measured reasons.
 *
 *   - `tsx watch --help` names five flags and none of them is about polling. The variable belongs
 *     to a library `tsx` does not declare as a dependency, does not document, and bundles privately.
 *     An upgrade of `tsx` that changed watcher would turn the fix off silently, and silent is the
 *     whole complaint: the watch would simply go back to being lost.
 *   - It costs 0.51 CPU-seconds every 20 seconds — 2.6% of a core, for ever, growing with the file
 *     count — because polling stats all 714 files ten times a second.
 *   - It fixes only the watch. The crash and the silence about why a server restarted are still
 *     there, and both are the same complaint: nobody can tell a restart that is coming from one
 *     that is not.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, watch } from 'node:fs'
import { createServer } from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { getSystemErrorName } from 'node:util'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { REPO_ROOT, SHUTDOWN_LIMIT_MS, gateDefaultHere, gateNumber, readTheBuildStamp, settings, settingValue, theStableCheckoutNamedIn, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { whyAnUpgradeKeepsTheOfficeClosed } from '../src/config/the-upgrade-mark.mjs'
import { spoolAGateMet } from '../src/config/gate-count-spool.mjs'
import { gateNamed } from '../src/config/gates.mjs'
import { withTheWayForThisJob } from '../src/config/the-office-tool-environment.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { THE_PAGES_ENTRY, THE_SERVER_ENTRY, THE_SERVER_FOLDERS, newestSourceBuiltFrom } from '../src/config/newest-source.mjs'
import { forgetTheWalks, theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import {
  THE_STABLE_TAG_PUT_BACK,
  THE_STABLE_TAG_REFUSAL,
  THE_STABLE_TAG_REFUSAL_BEGINS,
  THE_STABLE_TAG_REFUSAL_EXIT_CODE,
} from '../src/config/stable-tag.mjs'
import { buildThePage as buildThePageForReal } from './build-the-page.mjs'
import { diagnosticReportDirectory, recordInspectorAddress, requestDiagnosticReport } from './office-diagnostic-report.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { theSupervisorsStartupIsDone } from '../src/config/supervisor-startup-done.mjs'
import { REFUSING_TO_SERVE, theGuardsRefusalIn } from '../src/config/guard-refusal.mjs'
import { theMigrationMarkerIn } from '../src/config/migration-markers.mjs'
import { theDatabaseBehindTheCode } from '../src/config/migration-look.mjs'
import {
  THE_SERVICE_LOCK_REFUSAL_EXIT_CODE,
  readTheServiceLock,
  theLockIsHeldSentence,
  theProcessReading,
  whoHoldsTheLock,
} from '../src/config/the-service-lock.mjs'
import {
  HOW_MANY_LINES_ARE_KEPT,
  THE_REFUSAL_FILE,
  forgetTheRefusal,
  forgetTheTrouble,
  whatTheTroubleSays,
  writeTheRefusal,
  writeTheTrouble,
} from '../src/config/supervisor-trouble.mjs'
import { THE_PROGRAMS_RESTARTED_WITH_THE_SERVER, theFilesThatRestartTheServer } from './files-that-restart-the-server.mjs'

export { theFilesThatRestartTheServer }

/**
 * RUN ONE GIT COMMAND FOR THE PREPARED CHECK, WITH ITS OWN ENVIRONMENT AND A TIME LIMIT.
 *
 * The check must read THIS checkout. An inherited GIT_DIR, GIT_WORK_TREE or GIT_CONFIG variable
 * would point Git somewhere else and make another repository's HEAD answer for this one, so the
 * environment is an allowlist of the few non-secret variables Git needs and no inherited Git
 * variable reaches it. Replacement objects are off, the pager is off, hooks, the fsmonitor,
 * automatic gc and automatic maintenance are off, and optional index writes are disabled. Git may
 * still run filters it is configured with, so this does not promise that nothing at all runs; it
 * promises that nothing here asks Git to write. A command that fails, is interrupted, takes longer
 * than the limit or prints more than the buffer allows is a refusal, never a fallback.
 *
 * @param {string} root the checkout
 * @param {string[]} args
 * @returns {{ failed: false, out: string } | { failed: true, why: string }}
 */
function runGitForThePreparedCheck(root, args) {
  const path = process.env.PATH
  if (typeof path !== 'string' || path === '') return { failed: true, why: 'PATH is not set' }
  const ran = spawnSync(
    'git',
    [
      '--no-pager',
      '-c', 'core.hooksPath=/dev/null',
      '-c', 'core.fsmonitor=false',
      '-c', 'core.untrackedCache=false',
      '-c', 'gc.auto=0',
      '-c', 'maintenance.auto=false',
      '-C', root,
      ...args,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
      maxBuffer: 512 * 1024,
      // AN ALLOWLIST, NOT A COPY OF THE CALLER'S ENVIRONMENT. See the header comment.
      env: {
        PATH: path,
        HOME: '/nonexistent',
        LANG: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        // THE PAGE'S PATHS ARE READ LITERALLY, so wildcard characters in a filename cannot
        // select another file. This was requested in oTNT9eHqGbPV and forwarded in
        // yqDBE5TVuC8R. The criterion observes this setting reaching Git.
        GIT_LITERAL_PATHSPECS: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
      },
    },
  )
  if (ran.error !== undefined) {
    const code = 'code' in ran.error ? String(ran.error.code) : 'an unknown error'
    return { failed: true, why: `it could not run (${code})` }
  }
  if (ran.signal !== null && ran.signal !== undefined) {
    return { failed: true, why: `it was interrupted by ${String(ran.signal)}` }
  }
  if (ran.status === null) return { failed: true, why: 'it ended without an exit status' }
  if (ran.status !== 0) {
    const said = `${ran.stderr ?? ''}`
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '')
    return { failed: true, why: said === undefined ? `it exited ${String(ran.status)}` : said }
  }
  return { failed: false, out: `${ran.stdout ?? ''}` }
}

/**
 * A full commit or tree hash, or null because Git printed something that is not one.
 *
 * @param {string} out what Git printed
 * @returns {string | null}
 */
function theHashGitPrinted(out) {
  const hash = out.trim()
  return /^[0-9a-f]{40}$/.test(hash) ? hash : null
}

/**
 * WHY THE PAGE IN `dist/web` IS NOT THE PAGE THIS CHECKOUT WOULD BUILD, or null when it is.
 *
 * A `--prepared` start skips the build before the first start, so the page it serves is whatever
 * `dist/web` already holds. Skipping a build is safe only when that page really was built from
 * this checkout, so each of these is asked before anything listens:
 *
 *   - the built page and its stamp must be there, the stamp must be readable, and it must name a
 *     full commit;
 *   - Git must resolve that commit, and its tree must be this checkout's tree at this checkout's
 *     commit — the same commit and the same tree, not a newer one and not an ancestor;
 *   - the files the page is built from must all be readable imports of `src/web/index.html`, and
 *     Git must report no uncommitted change and no untracked addition among them.
 *
 * A Git failure refuses and names what Git said; nothing falls back to a file's modification time,
 * which says when something was touched and never what it holds. Git is asked with its own
 * environment and with optional index writes disabled, so no inherited Git variable and no lock
 * file moves which repository answers; Git may still run filters it is configured with, so what
 * this proves is what Git reports now plus commit and tree identity, not a byte fingerprint of
 * every file on disk.
 *
 * @param {string} root the checkout
 * @returns {string | null} one sentence saying why not, or null when the page may be served
 */
function whyThePreparedPageIsNotFromHere(root) {
  const web = join(root, 'dist', 'web')
  if (!existsSync(join(web, 'index.html'))) {
    return (
      'Prepared start refused: dist/web/index.html is not there, so there is no built page to serve; ' +
      'run node tools/serve-dev.mjs --built to build one.'
    )
  }
  const stamp = readTheBuildStamp(web)
  if (stamp.state === 'none') {
    return (
      'Prepared start refused: there is no build stamp beside dist/web/index.html, so this page cannot ' +
      'be checked against this checkout; run node tools/serve-dev.mjs --built to build one.'
    )
  }
  if (stamp.state === 'unreadable') {
    return (
      `Prepared start refused: the build stamp cannot be read (${stamp.why}); ` +
      'run node tools/serve-dev.mjs --built to build the page again.'
    )
  }
  if (stamp.commit === null) {
    return (
      'Prepared start refused: the build stamp names no commit, so this page cannot be matched to this ' +
      'checkout; run node tools/serve-dev.mjs --built to build the page again.'
    )
  }
  if (!/^[0-9a-f]{40}$/.test(stamp.commit)) {
    return (
      `Prepared start refused: the build stamp does not name a commit in full (it holds "${stamp.commit}"); ` +
      'run node tools/serve-dev.mjs --built to build the page again.'
    )
  }
  // WHICH REPOSITORY GIT IS READING IS ASKED FIRST. Git is told to work in `root` and is given its
  // own environment, so this must name `root` itself; a checkout that lives inside another
  // repository would otherwise be judged against that repository's commits.
  const top = runGitForThePreparedCheck(root, ['rev-parse', '--show-toplevel'])
  if (top.failed) {
    return `Prepared start refused: git could not name the top level of this checkout (${top.why}).`
  }
  let theTop = ''
  let here = ''
  try {
    theTop = realpathSync(top.out.trim())
    here = realpathSync(root)
  } catch {
    return `Prepared start refused: the top level git named (${top.out.trim()}) cannot be resolved.`
  }
  if (theTop !== here) {
    return (
      `Prepared start refused: git's top level is ${theTop}, not this checkout at ${here}; this prepared ` +
      'page cannot be checked against a directory that is not the top of its own repository.'
    )
  }
  const head = runGitForThePreparedCheck(root, ['rev-parse', 'HEAD'])
  if (head.failed) {
    return `Prepared start refused: git could not read the commit of this checkout (${head.why}).`
  }
  const headCommit = theHashGitPrinted(head.out)
  if (headCommit === null) {
    return `Prepared start refused: git gave "${head.out.trim()}" where this checkout's commit should be.`
  }
  const stamped = runGitForThePreparedCheck(root, ['rev-parse', '--verify', `${stamp.commit}^{commit}`])
  if (stamped.failed) {
    return `Prepared start refused: git could not read commit ${stamp.commit} named by the build stamp (${stamped.why}).`
  }
  const stampedCommit = theHashGitPrinted(stamped.out)
  if (stampedCommit === null) {
    return `Prepared start refused: git gave "${stamped.out.trim()}" where the stamped commit should be.`
  }
  const headTree = runGitForThePreparedCheck(root, ['rev-parse', 'HEAD^{tree}'])
  if (headTree.failed) {
    return `Prepared start refused: git could not read the tree of this checkout (${headTree.why}).`
  }
  const thisTree = theHashGitPrinted(headTree.out)
  if (thisTree === null) {
    return `Prepared start refused: git gave "${headTree.out.trim()}" where this checkout's tree should be.`
  }
  const stampedTree = runGitForThePreparedCheck(root, ['rev-parse', `${stampedCommit}^{tree}`])
  if (stampedTree.failed) {
    return `Prepared start refused: git could not read the tree of commit ${stampedCommit} (${stampedTree.why}).`
  }
  const thatTree = theHashGitPrinted(stampedTree.out)
  if (thatTree === null) {
    return `Prepared start refused: git gave "${stampedTree.out.trim()}" where the stamped tree should be.`
  }
  if (headCommit !== stampedCommit || thisTree !== thatTree) {
    return (
      `Prepared start refused: the build stamp names commit ${stampedCommit} (tree ${thatTree}), and this ` +
      `checkout is at ${headCommit} (tree ${thisTree}); the page was not built from this checkout.`
    )
  }
  const page = theFilesBuiltFrom(THE_PAGES_ENTRY, root)
  if (page.unresolved.length > 0 || page.couldNotRead.length > 0) {
    return (
      `Prepared start refused: the files the page is built from could not all be read (${String(page.unresolved.length)} ` +
      `import(s) unresolved, ${String(page.couldNotRead.length)} file(s) unreadable), so their state cannot be ` +
      'checked; run node tools/serve-dev.mjs --built to build the page again.'
    )
  }
  const state = runGitForThePreparedCheck(root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--no-renames',
    '--',
    ...page.files,
  ])
  if (state.failed) {
    return `Prepared start refused: git could not read the state of the files the page is built from (${state.why}).`
  }
  const changes = state.out.split('\0').filter((one) => one !== '')
  if (changes.length > 0) {
    const first = changes[0] === undefined || changes[0].length <= 3 ? changes[0] ?? '' : changes[0].slice(3)
    return (
      `Prepared start refused: ${String(changes.length)} file(s) the page is built from are not clean in git, ` +
      `starting with ${first}; run node tools/serve-dev.mjs --built to build the page again.`
    )
  }
  return null
}

/**
 * THE OFFICE'S OWN KEY, AS THE ONE HEADER IT TRAVELS ON. Criterion P83, point 5.
 *
 * The supervisor, the ledger writes it files and the notes it leaves are all this office's own
 * process talking to this office, so they carry the office's own key and stop being header-only
 * claims. It is read fresh on each request so a key file the office makes while the supervisor is
 * running is picked up. With no key file the object is empty and every request is exactly what it
 * was before — nothing here throws, and an office that could not start because its key file was
 * missing would be worse than one with no keys.
 *
 * @returns {Record<string, string>}
 */
function theOfficeKeyHeader() {
  const held = theOfficeKey()
  return held.key === null ? {} : { [KEY_HEADER]: held.key }
}

/**
 * HOW LONG CHANGES ARE COLLECTED BEFORE ONE RESTART, in milliseconds.
 *
 * A `git checkout` of an older commit and back rewrites every file that differs, one after another,
 * in a few milliseconds. Restarting once per file would be ten restarts for one act, and the server
 * would spend the whole time starting. Everything that arrives inside this window is one change.
 */
export const COLLECT_CHANGES_FOR = 250

/**
 * HOW LONG A RUN IS GIVEN BEFORE THE SUPERVISOR ASKS WHETHER IT IS ANSWERING, in milliseconds.
 *
 * It used to mean *a run that lasts this long worked*, and the supervisor read it from a clock
 * while the child was still alive. That is false for a server that is still starting: on 12
 * September 2026 the start guard reached its refusal after 14.9 seconds, so every run crossed this
 * line, the failure was counted from zero again, and fifty starts each printed "1 in a row". A run
 * is now answered for: the supervisor asks `GET /api/health` after this long and clears the run of
 * failures only when the server answers. See `seeWhetherThisRunAnswered`.
 */
export const A_GOOD_RUN_LASTS = 10_000

/**
 * HOW MANY SERVERS IN A ROW serve-dev stops for not answering before it starts no more until a
 * file changes (message DXXb8QZ_9EfG). A constant and not a setting, because nobody has
 * needed another number.
 */
export const THE_STOPS_BEFORE_GIVING_UP = 3

/** The longest wait between attempts at a server that will not start, in milliseconds. */
export const THE_LONGEST_BACKOFF = 30_000

/** How long to wait for a stopped child to go before signalling its group again, in milliseconds. */
export const A_CHILD_HAS_TO_STOP_WITHIN = 5_000

/**
 * HOW LONG THIS SUPERVISOR WAITS FOR ITS OWN OFFICE, in milliseconds: each request it makes of the
 * server it started, including the ledger POSTs and their body reads, and its stop's wait for a
 * ledger write already on its way.
 */
const AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN = 5_000

/**
 * HOW LONG A SERVER IS GIVEN TO STOP BEFORE ITS GROUP IS KILLED, in milliseconds: the server's own
 * limit for its whole stop, which holds its drain (SHUTDOWN_CONNECTION_GRACE_MS in
 * src/config/settings.mjs), and 5 s more (message n5g0uTda98in). A kill before the server's
 * own limit resets the reads it is still answering. Until round 6f of wave 13x a server had the 5 s
 * every other child has, and at load 46-75 serve-dev's kill reset reads in 3 of 3 runs of case 4 of
 * tests/the-office-answers-while-it-restarts.test.ts, some of them sent 6.5 and 16.9 s before it.
 * Now 45 s: the 30 s drain, the 10 s for the stop's other steps, and 5 s for the process to exit.
 * In 8 restarts at load 36-87 the real server's drain took at most 1016 ms. The stand-in answers new
 * reads from the first 5 s on, so a long drain delays the next server and leaves no read unanswered.
 */
export const A_SERVER_HAS_TO_STOP_WITHIN = SHUTDOWN_LIMIT_MS + 5_000

/** The stand-in that answers on the held socket while no server runs on it. */
const THE_STAND_IN = fileURLToPath(new URL('./serve-dev-stand-in.mjs', import.meta.url))

/**
 * HOW OFTEN TO LOOK WHETHER A MIGRATION HAS LANDED AFTER A `REFUSING TO SERVE`, in milliseconds.
 *
 * ---------------------------------------------------------------------------------------
 * WHY, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `nxDRPQ0IZcOU`, 13 September 2026. The guard refused because the database was behind the
 * code, and the supervisor stopped starting the server — correctly, because restarting into the
 * same refusal is not a fix. The migration was run by hand a minute later, but a migration changes
 * no source file, so nothing the supervisor watched moved and the API stayed down until a person
 * touched a server file. The office was down for two minutes.
 *
 * `theDatabaseBehindTheCode` reads the one fact that changes when the migration lands, so this clock
 * can start the server again with nobody touching anything. It is deliberately five seconds and not
 * the `MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES` clock: that setting is about a watch having missed a
 * source change and keeps its own meaning. This one runs only after a refusal of the serve kind.
 */
export const HOW_OFTEN_TO_LOOK_FOR_THE_MIGRATION = 5_000

/** g_icMYOZxkQZ, wave 13t: look for the other server letting its database go. */
export const HOW_OFTEN_TO_LOOK_FOR_THE_SERVICE_LOCK = 5_000

/** @typedef {{ goodRun: number, firstBackoff: number, longestBackoff: number, childStop: number, serverStop: number, migrationLook: number, serviceLockLook: number, healthRequest: number, healthRetry: number }} SupervisorClocks */

/** The shipped clocks remain the defaults; tests may shorten selected waits. */
const THE_SUPERVISOR_CLOCKS = Object.freeze({
  goodRun: A_GOOD_RUN_LASTS,
  firstBackoff: 500,
  longestBackoff: THE_LONGEST_BACKOFF,
  childStop: A_CHILD_HAS_TO_STOP_WITHIN,
  serverStop: A_SERVER_HAS_TO_STOP_WITHIN,
  migrationLook: HOW_OFTEN_TO_LOOK_FOR_THE_MIGRATION,
  serviceLockLook: HOW_OFTEN_TO_LOOK_FOR_THE_SERVICE_LOCK,
  healthRequest: 2000,
  healthRetry: 500,
})

/**
 * @param {Partial<SupervisorClocks>} [overrides] clocks passed by an in-process test
 * @returns {SupervisorClocks}
 */
function theSupervisorClocks(overrides) {
  const name = 'MOLE_OFFICE_TEST_SUPERVISOR_CLOCKS'
  let selected = overrides
  if (selected === undefined) {
    const raw = settingValue(name)
    if (raw === null) return { ...THE_SUPERVISOR_CLOCKS }
    try {
      selected = JSON.parse(String(raw))
    } catch {
      throw new Error(`${name} must be a JSON object of timer names and whole milliseconds; serve-dev did not start.`)
    }
  }
  if (selected === null || typeof selected !== 'object' || Array.isArray(selected)) {
    throw new Error(`${name} must be a JSON object of timer names and whole milliseconds; serve-dev did not start.`)
  }
  for (const [timer, milliseconds] of Object.entries(selected)) {
    if (!Object.hasOwn(THE_SUPERVISOR_CLOCKS, timer)) {
      throw new Error(`${name} names an unknown timer "${timer}"; serve-dev did not start.`)
    }
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
      throw new Error(`${name}.${timer} must be a whole number of milliseconds above zero; serve-dev did not start.`)
    }
  }
  return { ...THE_SUPERVISOR_CLOCKS, ...selected }
}

/**
 * HOW LONG TO WAIT AFTER A CHILD THAT FAILED, GIVEN HOW MANY HAVE FAILED IN A ROW.
 *
 * It doubles, so a server with a syntax error in it prints eight lines in the first minute rather
 * than eight hundred, and it stops at half a minute, so a fix is picked up while somebody is still
 * looking. A change to a watched file restarts immediately whatever the backoff says: the backoff
 * is about a server that keeps dying, and somebody editing a file has just done something about it.
 *
 * @param {number} failures how many runs in a row have ended too soon. 1 is the first.
 * @param {{ firstBackoff?: number, longestBackoff?: number }} [clocks] the test's clock overrides
 * @returns {number} milliseconds
 */
export function theBackoffAfter(failures, clocks = {}) {
  if (failures <= 0) return 0
  return Math.min(clocks.longestBackoff ?? THE_LONGEST_BACKOFF, (clocks.firstBackoff ?? 500) * 2 ** (failures - 1))
}

/**
 * HOW OFTEN TO LOOK FOR A CHANGE THE WATCHES MISSED, in milliseconds.
 *
 * Declared in src/config/settings.mjs like every other setting. A value that is not a positive
 * number turns the check OFF and says so, rather than falling back to the default: a person who
 * wrote something in that box meant something by it, and quietly using 60 would be this
 * repository's second rule broken by a clock.
 *
 * @returns {{ every: number } | { off: string }}
 */
export function theSlowCheckEvery() {
  const raw = settingValue('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES')
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {
      off: `MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES is "${String(raw)}", which is not a number of seconds, so the ` +
        'supervisor will not look for changes its watches missed. Set it to a number of seconds to turn that on.',
    }
  }
  return { every: seconds * 1000 }
}

/**
 * HOW LONG A SERVER THIS SUPERVISOR HAS JUST STARTED HAS TO ANSWER, in milliseconds.
 *
 * Problem `xGeC_iM6jxYl`, check `qCP4OR2YDwvZ`. This supervisor holds the port, so a server that
 * stays alive and never answers leaves every request waiting on the socket's queue with no reply.
 * After this long, `seeWhetherThisRunAnswered` stops that server by its group, starts the stand-in
 * and starts the server again as after a crash. The first start's wait for the ledger reads it too.
 * The time the server spends on its migrations is added to it (`migration-markers.mjs`), and after
 * `THE_STOPS_BEFORE_GIVING_UP` such stops in a row no new server starts until a file changes.
 *
 * It is the gate row a-new-server-has-to-answer-within (src/config/gates.mjs), read with gateNumber.
 * A value the row does not allow, a whole number of seconds from 1 to 86400, is refused, not
 * replaced by 60: this limit decides when a server is stopped, and a person who wrote something
 * there meant something by it.
 *
 * @returns {number} milliseconds
 */
export function aNewServerHasToAnswerWithin() {
  try {
    return gateNumber('a-new-server-has-to-answer-within') * 1000
  } catch (why) {
    throw aLimitItCannotRead(why, gateNamed('a-new-server-has-to-answer-within'))
  }
}

/**
 * A LIMIT OF SECONDS SERVE-DEV CANNOT READ, said with what to do.
 * @param {unknown} why what gateNumber threw
 * @param {import('../src/config/gates.mjs').Gate} row
 * @returns {Error}
 */
function aLimitItCannotRead(why, row) {
  return new Error(
    `${why instanceof Error ? why.message : String(why)} serve-dev did not start. Set it to a whole number of ` +
      `seconds, or remove it for ${gateDefaultHere(row)}.`,
  )
}

/**
 * HOW LONG A SERVER'S MIGRATIONS MAY RUN, in milliseconds, counted from the line that says they
 * began (`migration-markers.mjs`) and added up over the run.
 *
 * Check `m5X4lu3B2F7L`: a server that printed that line and never the line that says they finished
 * was never stopped, because the time spent migrating is left out of the limit to answer. The
 * stand-in now answers while the migrations run, so no read waits on them. This bound is what ends
 * them: past it serve-dev stops that server by its group and starts no new one until a file
 * changes, because a new one would run the same migrations.
 *
 * WHY 900 SECONDS BY DEFAULT. A start that finds the owner's database (2.5 GB on 6 October 2026)
 * does not migrate it in place: `prepareToServe` checks its integrity and measures the migrations
 * on a copy. On a 2.16 GB copy of the live database that took 6 s and 17 s warm, side by side,
 * and the integrity check alone 43 s cold (wave 13p round 15, `startTheIntegrityCheckBeside`).
 * The longest wait the code itself allows is that check's worker, 10 minutes, after which the
 * check runs once more on the server's own connection. 900 s is above both.
 *
 * It is the gate row migrations-have-to-finish-within, and a value the row does not allow is
 * refused, as for the limit to answer.
 *
 * @returns {number} milliseconds
 */
export function theMigrationsHaveToFinishWithin() {
  try {
    return gateNumber('migrations-have-to-finish-within') * 1000
  } catch (why) {
    throw aLimitItCannotRead(why, gateNamed('migrations-have-to-finish-within'))
  }
}

/**
 * HOW MANY STARTS IN A ROW MAY FAIL BEFORE IT IS WRITTEN WHERE THE PRODUCT CAN READ IT.
 *
 * @returns {number} the count, or 3 when the declaration's own default could not be read as a number
 */
export function theFailedStartsBeforeSaying() {
  const raw = settingValue('MOLE_OFFICE_FAILED_STARTS_BEFORE_SAYING')
  const count = Number(raw)
  return Number.isInteger(count) && count > 0 ? count : 3
}

/**
 * A CHANGE NOBODY SAW: the reason for a restart, or null because the running server is current.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`. A supervisor whose only way of noticing a change is a watch cannot notice
 * that a watch missed one. Whatever the reason — an event the kernel dropped, a restart that never
 * landed, a directory that could not be watched — the state is the same and it is readable off the
 * disk: a file the running server was built from is newer than the moment that server started.
 *
 * THE COMPARISON IS AGAINST WHEN THE SERVER WAS STARTED, not against when the file was last seen.
 * A server started at 10:26:00 has loaded whatever was on disk at 10:26:00; a file written at
 * 10:26:29 is one it has not got. Restarting is the safe direction to be wrong in — a restart
 * nobody needed rather than a change nobody saw.
 *
 * @param {{ at: Date, file: string } | null} newest the newest file of the set, from the disk
 * @param {number} theServerStartedAt milliseconds since the epoch
 * @returns {string | null}
 */
export function aChangeNobodySaw(newest, theServerStartedAt) {
  if (newest === null) return null
  if (newest.at.getTime() <= theServerStartedAt) return null
  return `a change nobody saw: ${newest.file}`
}

/**
 * MAY THIS SUPERVISOR TAKE OVER A PORT ITS OWN PREVIOUS LIFE LEFT A SERVER ON?
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`. The child is started in a process group of its own, so that stopping it
 * stops the esbuild service and everything else it started. That also means it is NOT in the
 * supervisor's group, so `kill -TERM -<the supervisor's group>` does not reach it. A supervisor
 * stopped that way leaves its child running: systemd adopts the child, the child keeps the live
 * office's port, and every new supervisor refuses the port and exits. The API is then off the air
 * until somebody works out the child's group by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAY BE STOPPED, AND WHAT MAY NOT
 * ---------------------------------------------------------------------------------------
 *
 * The answer to F1 of design/ground/ACCEPTANCE.md is *named only*: the product never stops a process
 * it did not start. So every one of these has to be true, each of them READ rather than assumed,
 * and the first one that is not is the reason it refuses:
 *
 *   1. what is answering is a Mole Office serving THIS checkout;
 *   2. nothing is watching it — it says so itself, off its own parent process;
 *   3. it says which process group it is in, which is what would be signalled;
 *   4. a LIVE ledger row owns that process, so it is a process the product knows it started;
 *   5. that row's command line names `--stop-with-pid=<a supervisor>`, so a supervisor started it;
 *   6. that supervisor is gone.
 *
 * Anything else refuses, and the refusal is `whyItMayNotStart`'s, unchanged.
 *
 * @param {any} runtime the runtime record the port answered with
 * @param {readonly any[]} rows the ledger rows that server listed
 * @param {string} root this checkout
 * @param {(pid: number) => boolean} isRunning asks the machine whether a pid is still there
 * @returns {{ takeOver: { pid: number, pgid: number }, why: string } | { no: string }}
 */
export function theOrphanOnThePort(runtime, rows, root, isRunning) {
  const here = resolve(root).replace(/\/$/, '')
  if (runtime === null || typeof runtime !== 'object') return { no: 'what answered is not a Mole Office runtime record' }
  const servedFrom = typeof runtime.repository?.path === 'string' ? runtime.repository.path.replace(/\/$/, '') : null
  if (servedFrom !== here) {
    return { no: `it is serving ${servedFrom ?? 'a checkout it did not name'}, and this checkout is ${here}` }
  }
  if (runtime.supervisor?.watching !== false) return { no: 'something is watching it, so it is not an orphan' }
  const pid = typeof runtime.process?.pid === 'number' ? runtime.process.pid : null
  const pgid = typeof runtime.process?.pgid === 'number' ? runtime.process.pgid : null
  if (pid === null || pgid === null) return { no: 'it did not say which process and process group it is' }
  const owned = rows.find(
    (row) => row?.type === 'process' && row?.key === String(pid) && (row?.releasedAt ?? null) === null,
  )
  if (owned === undefined) {
    return { no: `nothing on that server's own ledger owns process ${String(pid)}, and what the product did not start it does not stop` }
  }
  const command = `${String(owned.liveness?.detail ?? '')} ${String(owned.detail ?? '')}`
  const named = /--stop-with-pid=(\d+)/.exec(command)
  if (named === null) {
    return { no: `the ledger row for process ${String(pid)} does not say a supervisor started it` }
  }
  const startedBy = Number(named[1])
  if (isRunning(startedBy)) {
    return { no: `the supervisor that started it, process ${String(startedBy)}, is still running` }
  }
  return {
    takeOver: { pid, pgid },
    why:
      `Port is held by a Mole Office serving this checkout that nothing is watching. Its ledger row says the ` +
      `supervisor that started it was process ${String(startedBy)}, and that process is gone, so it is this ` +
      `supervisor's own orphan. Stopping process group ${String(pgid)} and taking the port over.`,
  }
}

/**
 * THE DIRECTORIES TO WATCH so that every file the server is built from is inside one of them.
 *
 * The folders come first and are watched recursively; a file of the set that is not under any of
 * them contributes its own directory. The result holds no directory twice and none that is inside
 * another one already listed as recursive.
 *
 * @param {readonly string[]} filesInTheSet paths relative to the checkout
 * @param {string} root the checkout
 * @param {readonly string[]} [folders] defaults to the folders the server's code comes out of
 * @returns {{ path: string, recursive: boolean }[]} absolute paths
 */
export function theDirectoriesToWatch(filesInTheSet, root, folders = THE_SERVER_FOLDERS) {
  /** @type {{ path: string, recursive: boolean }[]} */
  const watched = []
  for (const folder of folders) {
    const full = resolve(root, folder)
    if (existsSync(full)) watched.push({ path: full, recursive: true })
  }
  const covered = (/** @type {string} */ path) =>
    watched.some((one) => one.recursive && (path === one.path || path.startsWith(one.path + sep)))
  for (const file of filesInTheSet) {
    const dir = dirname(resolve(root, file))
    if (covered(dir)) continue
    if (watched.some((one) => one.path === dir)) continue
    if (!existsSync(dir)) continue
    watched.push({ path: dir, recursive: false })
  }
  return watched
}

/**
 * The file a watch event is about, as a path relative to the checkout, or null when the machine did
 * not name one.
 *
 * @param {string} watchedDirectory absolute
 * @param {string | Buffer | null} filename what fs.watch reported, relative to that directory
 * @param {string} root the checkout
 * @returns {string | null}
 */
export function whatChanged(watchedDirectory, filename, root) {
  if (filename === null) return null
  const name = typeof filename === 'string' ? filename : filename.toString('utf8')
  if (name === '') return null
  return relative(resolve(root), join(watchedDirectory, name))
}

/**
 * THE ONE LINE PRINTED PER RESTART.
 *
 * One idea per line: what changed, and how many others changed with it. Ten files rewritten by a
 * checkout are one restart and one line that says ten.
 *
 * @param {readonly string[]} files the files of the set that changed, in the order they arrived
 * @returns {string}
 */
export function theRestartLine(files) {
  if (files.length === 0) return 'something changed'
  const [first, ...rest] = files
  if (rest.length === 0) return `${String(first)} changed`
  return `${String(first)} changed, and ${String(rest.length)} other file${rest.length === 1 ? '' : 's'} with it`
}

// --------------------------------------------------------------------- one supervisor per port

/**
 * WHAT IS ALREADY ON THIS PORT, ASKED OF THE PORT ITSELF.
 *
 * Criterion G5 of design/ground/ACCEPTANCE.md: one supervisor per port. Four `tsx watch`
 * supervisors raced for one port on 2 September 2026 and it changed hands three times.
 *
 * THE PORT IS ASKED, NOT THE LEDGER, and the reason is that a supervisor is not a ledger row. What
 * supervises a running server is read off that server's parent process by `GET /api/runtime`, which
 * is a reading of the machine taken now. A row saying "pid 123 supervises port 29800" would be the
 * same fact written down a second time, and it would go on saying it after pid 123 died.
 *
 * A REPLY FROM ANOTHER SUPERVISOR'S STAND-IN is told apart by `STAND_IN_HEADER`, whose value is that
 * supervisor's pid. It is a Mole Office supervisor with no server running, which is not the same
 * fact as "something that is not a Mole Office API", and the refusal says which.
 *
 * @param {string} apiAddress e.g. http://127.0.0.1:29800
 * @returns {Promise<OnThePort>}
 */
export async function whatIsOnThePort(apiAddress) {
  try {
    const reply = await fetch(`${apiAddress}/api/runtime`, { signal: AbortSignal.timeout(4000) })
    const standIn = reply.headers.get(STAND_IN_HEADER)
    if (standIn !== null) {
      const said = /** @type {any} */ (await reply.json().catch(() => null))
      return { answered: true, runtime: null, standIn: { supervisor: standIn, says: String(said?.error ?? 'it gave no reason') } }
    }
    if (!reply.ok) return { answered: true, runtime: null }
    const body = /** @type {any} */ (await reply.json())
    return { answered: true, runtime: body.runtime ?? body }
  } catch {
    return { answered: false }
  }
}

/**
 * @typedef {{ answered: false } | { answered: true, runtime: any, standIn?: { supervisor: string, says: string } }} OnThePort
 */

/**
 * WHY THIS SUPERVISOR MAY NOT START, in a sentence, or null when it may.
 *
 * @param {OnThePort} onThePort
 * @param {number} port
 * @param {string} apiAddress
 * @returns {string | null}
 */
export function whyItMayNotStart(onThePort, port, apiAddress) {
  if (!onThePort.answered) return null
  if (onThePort.standIn !== undefined) {
    return (
      `Port ${String(port)} is held by the dev supervisor process ${onThePort.standIn.supervisor}, whose server is not ` +
      `running now. Its stand-in said: ${onThePort.standIn.says}\n\nOne supervisor per port, so this one did not start ` +
      `and has changed nothing.\n\n  Stop it by GROUP:   kill -TERM -<its process group>\n` +
      `  Or use another:     MOLE_OFFICE_PORT=<other> npm run dev:server`
    )
  }
  const runtime = onThePort.runtime
  if (runtime === null || typeof runtime !== 'object') {
    return (
      `Something is already answering on port ${String(port)} and it is not a Mole Office API, so this ` +
      `supervisor did not start and has changed nothing.\n\n  See what holds it:  ss -ltnp | grep :${String(port)}`
    )
  }
  const supervisor = runtime.supervisor ?? null
  const pid = runtime.process?.pid ?? null
  const repository = runtime.repository?.path ?? 'a checkout it did not name'
  const held =
    supervisor === null
      ? `a Mole Office API (process ${String(pid)}) that does not say what supervises it`
      : supervisor.watching === true
        ? `${String(supervisor.kind)} as process ${String(supervisor.pid)}, supervising the API on process ${String(pid)}`
        : `a Mole Office API (process ${String(pid)}) that nothing is watching — ${String(supervisor.says)}`
  return (
    `Port ${String(port)} is already held by ${held}, serving ${repository}. One supervisor per port, so ` +
    `this one did not start and has changed nothing.\n\n` +
    `  Ask it what it is:  curl -s ${apiAddress}/api/runtime\n` +
    `  Stop it by GROUP:   kill -TERM -<its process group>   (an orphan survives killing the pid)\n` +
    `  Or use another:     MOLE_OFFICE_PORT=<other> npm run dev:server`
  )
}

// ------------------------------------------------------------- the port held across restarts

/**
 * THE LISTENING SOCKET, OPENED ONCE BY THIS SUPERVISOR AND HANDED TO EVERY SERVER IT STARTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `xGeC_iM6jxYl`. A count found 15 short silences of the live office on 6 October 2026,
 * eleven of them in the minute a merge landed: a landing changes a watched file, this restarts the
 * server, and the old server's socket closed with it. On a test office on 6 October, reading
 * `GET /api/health` every 100 ms across three restarts, 16, 19 and 18 reads were refused and 3 were
 * reset, over 1.6 to 2.1 seconds each time. Nothing was listening between the old server's exit
 * and the new server's listen, so the kernel refused.
 *
 * Now this process opens the socket and keeps it. Each server gets it as file descriptor 3, with
 * `MOLE_OFFICE_LISTEN_FD=3`, and listens on it. When a server exits the socket is still open here and
 * still listening, so the kernel queues each new connection until the next server takes it. A read
 * during a restart waits for the new server instead of being refused. The order of a restart is
 * unchanged: the old server, and the message worker it started, have stopped before the new server
 * starts, so there are never two workers.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN UNDOCUMENTED CALL, AND WHAT CATCHES IT IF NODE CHANGES IT
 * ---------------------------------------------------------------------------------------
 *
 * A documented call was asked for first (message xYZ87Hn-y4yl). The documented ways were tried
 * and each loses the thing this is for:
 *
 *   - `subprocess.send('server', server)` needs a `net.Server` listening in THIS process. A
 *     listening server here accepts connections itself, so between two servers this process would
 *     take requests it cannot answer, and while a server runs the two would split them.
 *   - Closing that server here after sending it closes this process's copy of the socket, and the
 *     socket then dies with the server that holds the last copy, so the gap is refused again.
 *   - A proxy here, passing every connection on to the server, would work, but every request of
 *     the office would then go through this process, and its failures would be the office's.
 *
 * `net._createServerHandle` binds and does not listen and does not accept: the socket is held and
 * nothing in this process reads it. It is the function `net.Server` itself calls, and it has been
 * there since Node 0.x. `tests/the-office-answers-while-it-restarts.test.ts` fails on the Node this
 * repository runs if it stops working.
 *
 * A BIND THAT FAILS IS REFUSED HERE, in words, before any server is started. Something holds the port
 * and did not answer `GET /api/runtime`, so nothing can be said about what it is.
 *
 * @param {number} port
 * @returns {{ fd: number, close: () => void }} the handle, as `spawn`'s `stdio` takes it
 */
export function holdThePort(port) {
  const handle = /** @type {any} */ (net)._createServerHandle('127.0.0.1', port, 4)
  // A BUSY PORT IS NOT REFUSED BY THE BIND ITSELF. libuv keeps EADDRINUSE until the listen, which
  // happens in the server, where a socket that was never bound would listen on a port the kernel
  // picks. So the address is read back here, and anything but this port is refused before a server
  // is started on it. Measured on Node 22.23: a busy port gives -98 here and nothing at the bind.
  const bound = /** @type {{ port?: number }} */ ({})
  const failed = typeof handle === 'number' ? handle : handle.getsockname(bound)
  if (failed !== 0 || bound.port !== port) {
    if (typeof handle !== 'number') handle.close()
    const why = failed !== 0 ? getSystemErrorName(failed) : `it was bound to port ${String(bound.port)}`
    throw new Error(
      `Port ${String(port)} on 127.0.0.1 could not be held (${why}). Something holds it and did not ` +
        `answer GET /api/runtime, so this supervisor did not start and has changed nothing.\n\n` +
        `  See what holds it:  ss -ltnp | grep :${String(port)}`,
    )
  }
  return handle
}

/**
 * ASK THE SERVER ON THE PORT WHETHER IT IS THIS CHECKOUT'S OWN ORPHAN.
 *
 * The ledger is asked of THAT server, because the ledger lives in the database that server has
 * open. A server that will not list its resources is one nothing can be shown to own, and it is
 * left alone.
 *
 * @param {any} runtime
 * @param {string} apiAddress
 * @param {string} root
 * @param {string} workspace
 * @returns {Promise<{ takeOver: { pid: number, pgid: number }, why: string } | { no: string }>}
 */
export async function theOrphanThisCheckoutLeft(runtime, apiAddress, root, workspace) {
  /** @type {any[]} */
  let rows = []
  try {
    const answered = await fetch(`${apiAddress}/api/resources`, {
      headers: { 'x-mole-office-workspace': workspace, ...theOfficeKeyHeader() },
      signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
    })
    if (!answered.ok) return { no: `that server answered ${String(answered.status)} when asked what it owns` }
    const body = /** @type {any} */ (await answered.json())
    rows = Array.isArray(body?.resources) ? body.resources : []
  } catch (err) {
    return { no: `that server could not be asked what it owns (${err instanceof Error ? err.message : String(err)})` }
  }
  return theOrphanOnThePort(runtime, rows, root, (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      // EPERM means it is there and belongs to somebody else, which is still there.
      return /** @type {NodeJS.ErrnoException} */ (err).code === 'EPERM'
    }
  })
}

/**
 * STOP THE ORPHAN BY ITS GROUP AND WAIT FOR THE GROUP TO BE GONE.
 *
 * By the group, because a server is several processes and signalling only the leader leaves them
 * holding the port. The group id is the one the answering server reported about itself, not one
 * found by searching the process table for a command line that looks right — chapter 2 rule 1 of
 * the office regulations.
 *
 * g_icMYOZxkQZ, wave 13t: the server lets its service lock go last as it exits.
 * A quiet port does not mean the lock is free; every process in the orphan's group must be gone.
 *
 * @param {number} pgid
 * @param {string} apiAddress
 * @param {(line: string) => void} say
 * @param {number} [within] how long each stop attempt may take
 * @returns {Promise<void>}
 */
export async function stopTheOrphan(pgid, apiAddress, say, within = A_CHILD_HAS_TO_STOP_WITHIN) {
  const groupIsThere = () => {
    try {
      process.kill(-pgid, 0)
      return true
    } catch (err) {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code
      if (code === 'ESRCH') return false
      if (code === 'EPERM') return true
      throw err
    }
  }
  const quiet = async () => !(await whatIsOnThePort(apiAddress)).answered && !groupIsThere()
  process.kill(-pgid, 'SIGTERM')
  const until = Date.now() + within
  while (Date.now() < until) {
    if (await quiet()) {
      say(`[dev] the orphan in group ${String(pgid)} has stopped and the port is free.`)
      return
    }
    await wait(250)
  }
  say(`[dev] the orphan in group ${String(pgid)} did not stop within ${String(within / 1000)}s; killing it.`)
  try {
    process.kill(-pgid, 'SIGKILL')
  } catch {
    // Gone between the two signals, which is the outcome that was wanted.
  }
  const harder = Date.now() + within
  while (Date.now() < harder) {
    if (await quiet()) return
    await wait(250)
  }
  if (groupIsThere()) {
    throw new Error(
      `Process group ${String(pgid)} is still there after ${String(2 * within / 1000)}s, ` +
        'so this supervisor did not start and has changed nothing.',
    )
  }
  throw new Error(
    `Port is still held after process group ${String(pgid)} was killed, so this supervisor did not start and has ` +
      `changed nothing.\n\n  See what holds it:  ss -ltnp | grep :${apiAddress.split(':').pop() ?? ''}`,
  )
}

// -------------------------------------------------------------------- writing itself down

/**
 * THE FIRST WAIT BEFORE A LEDGER CALL IS TRIED AGAIN, AND THE LONGEST, in milliseconds. The wait
 * doubles after each try that has no certain answer. Nothing bounds how many tries there are: the
 * server is serving all the while, and an office that is slow to answer is no reason to stop it.
 */
export const A_LEDGER_CALL_IS_TRIED_AGAIN_AFTER = 1_000
export const A_LEDGER_CALL_WAITS_AT_MOST = 30_000

/**
 * ONE CALL TO THE OFFICE THE LEDGER IS IN, AND WHICH OF FOUR KINDS ITS ANSWER IS.
 *
 * `answered` is a 2xx with its JSON body. `refused` is the office saying no, with a 4xx other than
 * 408, 409 and 429, and that ends startup. `conflict` is a 409, which only the caller can read.
 * `uncertain` is everything else: no answer within the deadline, a connection that failed, a body
 * that did not arrive or is not JSON, a 408, a 429 and a 5xx. A stand-in answers 503 while no
 * server is there, so it is among them. A write with an uncertain answer may have landed. The
 * deadline bounds the body as well as the headers.
 *
 * @param {string} apiAddress
 * @param {string} path
 * @param {RequestInit} init
 * @param {string} what the call, for the sentences
 * @returns {Promise<{ answered: any } | { refused: string } | { conflict: string } | { uncertain: string }>}
 */
async function oneLedgerCall(apiAddress, path, init, what) {
  try {
    const reply = await fetch(`${apiAddress}${path}`, { ...init, signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN) })
    /** @type {any} */
    const body = await reply.json()
    // Each caller ends the sentence itself, so the office's own full stop is left off.
    const says = typeof body?.error === 'string' ? `: ${body.error.replace(/\.$/, '')}` : ''
    if (reply.ok) return { answered: body }
    if (reply.status === 409) return { conflict: `${what} answered 409${says}` }
    if (reply.status >= 400 && reply.status < 500 && reply.status !== 408 && reply.status !== 429) {
      return { refused: `${what} was refused with ${String(reply.status)}${says}` }
    }
    return { uncertain: `${what} answered ${String(reply.status)}${says}` }
  } catch (err) {
    return { uncertain: `${what} had no certain answer (${err instanceof Error ? err.message : String(err)})` }
  }
}

/**
 * WRITE THIS SUPERVISOR INTO THE LEDGER OF WHAT IS RUNNING.
 *
 * Criterion G5: every process a person or an agent starts is registered with its owner session,
 * before it is used. A supervisor is such a process — it outlives every server it starts — and
 * until now nothing on any list said it was here.
 *
 * IT REGISTERS THROUGH THE SERVER IT JUST STARTED, on that server's own port, because the ledger
 * lives in that server's database. Four calls: the health read, for the world the server names;
 * the session record; the row; and the session's detail, which says how the row was written. Each
 * call has the same deadline, and it bounds the body as well.
 *
 * A CALL WITH NO CERTAIN ANSWER IS TRIED AGAIN, AND THE SERVER GOES ON SERVING. Until 14 November
 * 2026 any failure here ended startup and stopped the server. That day a stable upgrade's new
 * server was slow while every client came back to it, the row's POST passed its deadline, and the
 * office was down for three and a half minutes until it was started again by hand. The write had
 * landed late. So a row whose write had no certain answer is looked for in the ledger before it is
 * written again, and is written once. A 409 for this supervisor's own row counts as written.
 *
 * WHAT STILL ENDS STARTUP is the office refusing a call, as `oneLedgerCall` says, and a 409 for a
 * row the ledger then does not hold as this supervisor's own. The caller stops the server then, as
 * it always did.
 *
 * A SESSION RECORD WHOSE POST HAD NO CERTAIN ANSWER IS FILED AGAIN. Nothing finds a session record
 * whose answer was lost, so the earlier one, if it landed, is left saying running with no row. The
 * log says so, and so does the next filing's detail.
 *
 * @param {object} input
 * @param {string} input.apiAddress
 * @param {string} input.workspace
 * @param {number} input.port
 * @param {string} input.root
 * @param {(line: string) => void} input.say each step goes to the log
 * @param {(id: string) => void} input.whenSessionIsFiled keeps the acknowledged session, for a stop
 * @param {(detail: string) => void} input.whenTheRowIsWritten keeps how the row was written, for a stop
 * @param {() => void} input.whenRefused says startup is ending, before the write has returned
 * @param {() => boolean} input.stillWanted false once the supervisor is stopping
 * @param {(ms: number) => Promise<void>} input.pause the wait between tries, which a stop ends early
 * @returns {Promise<{ sessionRecordId: string, resourceId: string } | { refused: string } | { stopped: string }>}
 */
export async function writeThisSupervisorIntoTheLedger({ apiAddress, workspace, port, root, say, whenSessionIsFiled, whenTheRowIsWritten, whenRefused, stillWanted, pause }) {
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
    ...theOfficeKeyHeader(),
  }
  const key = String(process.pid)
  const stopped = { stopped: 'the stop came before this supervisor had finished writing itself into the ledger, so it stopped trying.' }
  let waitFor = A_LEDGER_CALL_IS_TRIED_AGAIN_AFTER
  /** @param {string} why @param {string} next */
  const tryAgain = async (why, next) => {
    say(`[dev] ${why}. serve-dev keeps its server running and ${next} in ${String(waitFor / 1000)}s.`)
    await pause(waitFor)
    waitFor = Math.min(2 * waitFor, A_LEDGER_CALL_WAITS_AT_MOST)
  }
  /** @param {string} why */
  const refuse = (why) => {
    whenRefused()
    return { refused: why }
  }

  /** @type {string | null | undefined} undefined until the health read has had an answer */
  let world
  while (world === undefined) {
    if (!stillWanted()) return stopped
    try {
      const answered = await fetch(`${apiAddress}/api/health`, { signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN) })
      await answered.text()
      world = answered.headers.get(WORLD_HEADER)
    } catch (err) {
      await tryAgain(`the health read before the ledger write had no certain answer (${err instanceof Error ? err.message : String(err)})`, 'reads it again')
    }
  }

  /** @type {string | null} */
  let sessionRecordId = null
  let uncertainFilings = 0
  while (sessionRecordId === null) {
    if (!stillWanted()) return stopped
    const filed = await oneLedgerCall(apiAddress, '/api/records', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'session',
        title: 'The dev supervisor',
        data: {
          state: 'running',
          runtime: 'mole-office',
          doing: `watching the code the API server is built from and restarting it on port ${String(port)}`,
          workingDirectory: root.replace(/\/$/, ''),
          detail: 'Resource registration is pending; its write completion is unknown until its reply is read.' +
            (uncertainFilings === 0 ? '' : ` This supervisor filed its session ${String(uncertainFilings)} time(s) before with no certain answer, so another session record of it may say running with no row.`),
        },
      }),
    }, 'filing the session record')
    if ('answered' in filed) {
      const id = filed.answered?.record?.id
      if (typeof id !== 'string') return refuse('filing the session record was answered with no record id')
      sessionRecordId = id
      whenSessionIsFiled(id)
    } else if ('uncertain' in filed) {
      uncertainFilings += 1
      await tryAgain(`${filed.uncertain}. If that filing landed, its session record will say running with no ledger row`, 'files the session again')
    } else {
      return refuse('refused' in filed ? filed.refused : filed.conflict)
    }
  }
  const session = sessionRecordId

  /** @type {string | null} */
  let resourceId = null
  /** Why the row may be in the ledger already, so it is read before it is written again; null when it cannot be. */
  /** @type {string | null} */
  let mayBeThere = null
  let afterAConflict = false
  let how = 'Resource registration completed and its reply was read.'
  while (resourceId === null) {
    if (!stillWanted()) return stopped
    if (mayBeThere === null) {
      const written = await oneLedgerCall(apiAddress, '/api/resources', {
        method: 'POST',
        headers: { ...headers, 'x-mole-office-session': session },
        body: JSON.stringify({
          type: 'process',
          key,
          detail: `the dev supervisor of port ${String(port)}, watching ${root.replace(/\/$/, '')}`,
          adopting: 'the dev supervisor registers itself under the session it filed once its server answered',
          ...(world === null ? {} : { world }),
        }),
      }, `writing process ${key} into the ledger`)
      if ('answered' in written) {
        const id = written.answered?.resource?.id
        if (typeof id !== 'string') return refuse(`writing process ${key} into the ledger was answered with no row id`)
        resourceId = id
        whenTheRowIsWritten(how)
      } else if ('conflict' in written) {
        say(`[dev] ${written.conflict}. serve-dev reads the ledger now, to see whether that row is its own.`)
        mayBeThere = written.conflict
        afterAConflict = true
      } else if ('uncertain' in written) {
        mayBeThere = written.uncertain
        await tryAgain(`${written.uncertain}. The row may have been written, so serve-dev reads the ledger before it writes again`, 'reads the ledger')
      } else {
        return refuse(written.refused)
      }
      continue
    }
    const read = await oneLedgerCall(apiAddress, `/api/resources?sessionRecordId=${encodeURIComponent(session)}`, {
      headers: { 'x-mole-office-workspace': workspace, ...theOfficeKeyHeader() },
    }, `reading the ledger for process ${key}`)
    if ('answered' in read && Array.isArray(read.answered?.resources)) {
      /** @type {{ id?: unknown } | undefined} */
      const row = read.answered.resources.find((/** @type {any} */ one) =>
        one?.type === 'process' && one?.key === key && one?.sessionRecordId === session && one?.releasedAt === null && typeof one?.id === 'string')
      if (row !== undefined) {
        resourceId = String(row.id)
        how = afterAConflict
          ? 'Resource registration completed: the office answered 409 for this supervisor\'s own row, and the ledger was read and holds it.'
          : 'Resource registration completed: its write had no certain answer, and the ledger was read and holds it.'
        whenTheRowIsWritten(how)
        say(`[dev] the ledger holds process ${key} under session ${session} as ${resourceId}, so the earlier write landed and counts as written.`)
      } else if (afterAConflict) {
        return refuse(`${mayBeThere}, and the ledger holds no live row of process ${key} under session ${session}`)
      } else {
        mayBeThere = null
        await tryAgain(`the ledger holds no row of process ${key} under session ${session}, so the earlier write did not land`, 'writes the row again')
      }
    } else if ('refused' in read) {
      return refuse(read.refused)
    } else {
      const why = 'uncertain' in read ? read.uncertain
        : 'conflict' in read ? read.conflict : `reading the ledger for process ${key} was answered with no list of rows`
      await tryAgain(why, 'reads the ledger again')
    }
  }

  // THE SESSION SAYS HOW THE ROW WAS WRITTEN. It is the same update each time, so sending it again is safe.
  for (;;) {
    if (!stillWanted()) return stopped
    const patched = await oneLedgerCall(apiAddress, `/api/records/${session}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ dataPatch: { detail: how } }),
    }, 'updating the session detail')
    if ('answered' in patched) return stillWanted() ? { sessionRecordId: session, resourceId } : stopped
    if ('refused' in patched) return refuse(patched.refused)
    await tryAgain('uncertain' in patched ? patched.uncertain : patched.conflict, 'sends the same update again')
  }
}

/**
 * Keep registration's outcome on the session. The deadline includes consuming the PATCH reply;
 * a lost reply says nothing about whether the server applied the write, and is never retried.
 * @param {string} apiAddress
 * @param {string} workspace
 * @param {string} sessionRecordId
 * @param {{ detail: string, state?: string }} dataPatch
 */
async function patchThisSupervisorsSession(apiAddress, workspace, sessionRecordId, dataPatch) {
  const reply = await fetch(`${apiAddress}/api/records/${sessionRecordId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspace,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
      ...theOfficeKeyHeader(),
    },
    body: JSON.stringify({ dataPatch }),
    signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
  })
  await reply.text()
  if (!reply.ok) throw new Error(`the session update answered ${String(reply.status)}`)
}

/**
 * SAY, IN THIS SUPERVISOR'S OWN LEDGER ROW, THAT IT CANNOT START A SERVER.
 *
 * The same sentence the file carries, in the place a person looking at what is running will be.
 * It needs a server to answer, and a supervisor that cannot start one may have none — so this is
 * the second reader of the fact and never the only one.
 *
 * @param {string} apiAddress
 * @param {string} workspace
 * @param {string} sessionRecordId
 * @param {import('../src/config/supervisor-trouble.mjs').SupervisorTrouble} trouble
 * @returns {Promise<void>}
 */
export async function sayThisSupervisorCannotStartAServer(apiAddress, workspace, sessionRecordId, trouble) {
  const answered = await fetch(`${apiAddress}/api/records/${sessionRecordId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspace,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
      ...theOfficeKeyHeader(),
    },
    body: JSON.stringify({
      dataPatch: {
        detail: `${whatTheTroubleSays(trouble)} The last lines the server printed: ${trouble.lastOutput.join(' / ')}`,
      },
    }),
    signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
  })
  if (!answered.ok) throw new Error(`the record answered ${String(answered.status)}`)
}

/**
 * SAY THAT THIS SUPERVISOR HAS FINISHED, so its ledger row has an owner whose run has ended.
 *
 * IT DOES NOT RELEASE THE ROW. Releasing signals the process group, and this process is standing in
 * that group with the server it is about to stop. The row is left naming a process that is going,
 * owned by a session that says it finished — which is exactly the state the orphan report is for,
 * and the answer to F1 is that such a thing may be stopped from the product by a press.
 *
 * @param {string} apiAddress
 * @param {string} workspace
 * @param {string} sessionRecordId
 * @param {string | null} [registrationDetail] keep a pending or failed write's uncertainty when finishing
 * @returns {Promise<void>}
 */
export async function sayThisSupervisorHasFinished(apiAddress, workspace, sessionRecordId, registrationDetail = null) {
  await patchThisSupervisorsSession(apiAddress, workspace, sessionRecordId, {
    state: 'finished',
    detail: [registrationDetail, 'the dev supervisor was told to stop, and stopped the server with it'].filter(Boolean).join(' '),
  })
}

/**
 * TELL THE OFFICE THE WORLD THIS SUPERVISOR SERVES HAS ENDED. Criterion C3.
 *
 * *The row closes with a reason when the process ends*, and the supervisor's own stop is the first
 * of the three ways that happens. It is done BEFORE the child is stopped, because the child is the
 * server that answers this call.
 *
 * ONE WORLD: THE ONE THIS SERVER SERVES, AND IT USED TO BE ALL OF THEM. This closed every open row
 * the list came back with. At the office that list is every world there is, so stopping the main
 * world's supervisor wrote `died_at` on to worlds that were still answering — the citizens verifier
 * measured a second world answering HTTP 200 on 29843 at the moment it was marked dead, and going
 * on answering afterwards. Away from the office the list comes from the mirror and carries the
 * OFFICE's ids, which this world's database has never heard of, so every close answered 404 and the
 * supervisor printed *no world could be closed at the office* while leaving both rows open. Problem
 * `u3E5zXnwWqzd`.
 *
 * WHICH WORLD THAT IS COMES OFF THE REPLY THIS ALREADY MADE. Criterion G3 puts the answering
 * world's database identity on every reply, so the row to close is the open one whose
 * `databaseIdentity` matches it. No second call, and no second idea in this file of which world it
 * is talking to.
 *
 * A LIST THAT CAME FROM THE MIRROR IS NOT THIS SERVER'S TO CLOSE, and that is said rather than
 * attempted. Those ids belong to the office's database; this server can only write to its own.
 *
 * IT NEVER STOPS THE STOP. A world left open is a wrong row on a list; a supervisor that would not
 * stop because a list could not be updated is worse. The reason is printed either way.
 *
 * @param {string} apiAddress
 * @param {string} workspace
 * @returns {Promise<string>} one plain line saying what happened
 */
export async function sayThisWorldHasEnded(apiAddress, workspace) {
  const headers = {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
    ...theOfficeKeyHeader(),
  }
  try {
    const listed = await fetch(`${apiAddress}/api/office/worlds`, { headers, signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN) })
    if (!listed.ok) return `the office answered ${String(listed.status)}, so no world was closed`
    const answered = parseWorldHeader(listed.headers.get(WORLD_HEADER))
    if (!answered.ok) return `the server did not say which world it is (${answered.why}), so no world was closed`
    const said =
      /** @type {{ worlds: { id: string, name: string, databaseIdentity: string, diedAt: string | null }[], from: string }} */ (
        await listed.json()
      )
    if (said.from === 'the mirror') {
      return (
        'the list this server can read came from the office\u2019s mirror, whose ids belong to the office\u2019s own ' +
        'database, so this world\u2019s row was not closed here'
      )
    }
    const mine = said.worlds.find((w) => w.diedAt === null && w.databaseIdentity === answered.world.database)
    if (mine === undefined) {
      return `no world open at this server is the one it serves (database ${answered.world.database}), so none was closed`
    }
    const res = await fetch(`${apiAddress}/api/office/worlds/${encodeURIComponent(mine.id)}/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ because: 'the dev supervisor was told to stop, and stopped the server with it' }),
      signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
    })
    if (!res.ok) return `${mine.name} could not be closed at the office (it answered ${String(res.status)})`
    return `closed at the office: ${mine.name}`
  } catch (err) {
    return `the office could not be told this world has ended (${err instanceof Error ? err.message : String(err)})`
  }
}

// -------------------------------------------------------------- the one-line redirect on 5173

/**
 * WHERE THE ONE-LINE REDIRECT SENDS A BROWSER.
 *
 * S4 of design/ground/ACCEPTANCE.md section 9: after the switch to the built page, the development
 * address keeps working for the week their bookmarks on their other machine point at it. The browser is
 * sent to the same path on the API's port, so a bookmark to a record opens that record. The host is
 * whatever the browser asked for — the tailnet name on another machine, 127.0.0.1 here — and only
 * the port comes from the settings.
 *
 * THE QUERY IS KEPT, because a page's address carries state. The fragment is not sent to a server at
 * all, so there is nothing to keep here: a browser carries the original fragment across a redirect
 * whose target has none, which is how `#/records/abc` survives the move.
 *
 * @param {string | null | undefined} hostHeader what the browser asked for, e.g. "laptop:5173"
 * @param {string | null | undefined} url the path it asked for, with any query
 * @param {number} apiPort the port the built office is on
 * @returns {string}
 */
export function theRedirectTarget(hostHeader, url, apiPort) {
  const path = typeof url === 'string' && url !== '' ? url : '/'
  const host = (typeof hostHeader === 'string' && hostHeader !== '' ? hostHeader : '127.0.0.1').replace(/:\d+$/, '')
  return `http://${host}:${String(apiPort)}${path}`
}

/**
 * START THE TINY LISTENER THAT SENDS 5173 TO THE BUILT OFFICE, OR SAY WHY IT DID NOT START.
 *
 * It starts only in the supervisor's `--built` mode. It must NOT be started when the port is in use:
 * the usual holder is the development Vite this whole change is replacing, and a second process
 * fighting for 5173 is the four-supervisors race this project has already paid for. So an occupied
 * port is a refusal that says who has it, never a takeover and never a quiet move to the next port.
 *
 * It signals nothing and stops nothing. It answers every request with one line and a 302.
 *
 * @param {object} input
 * @param {number} input.webPort where the old development address is (5173 by default)
 * @param {number} input.apiPort where the built office answers
 * @param {(line: string) => void} input.say
 * @returns {Promise<{ started: true, port: number, close: () => Promise<void> }
 *   | { started: false, why: string }>}
 */
export function startTheOneLineRedirect({ webPort, apiPort, say }) {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const target = theRedirectTarget(req.headers.host, req.url, apiPort)
      res.statusCode = 302
      res.setHeader('location', target)
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(`Mole Office is at ${target}\n`)
    })
    server.once('error', (err) => {
      const because = err instanceof Error ? err.message : String(err)
      done({
        started: false,
        why:
          `port ${String(webPort)} could not be taken for the redirect (${because}), so nothing is redirecting ` +
          `from the old development address. If a dev server is holding it, stop that first; the built office ` +
          `on ${String(apiPort)} is unaffected.`,
      })
    })
    server.listen(webPort, '127.0.0.1', () => {
      say(`[dev] ${String(webPort)} now redirects to the built office on port ${String(apiPort)}.`)
      done({
        started: true,
        port: webPort,
        close: () =>
          new Promise((closed) => {
            server.close(() => {
              closed()
            })
          }),
      })
    })
  })
}

// ------------------------------------------------------------------------------ the supervisor

/**
 * RUN THE SUPERVISOR until it is told to stop.
 *
 * ---------------------------------------------------------------------------------------
 * THE `--built` MODE
 * ---------------------------------------------------------------------------------------
 *
 * `npm run serve` runs this with `--built`. In that mode one command runs the real office: the page
 * is built first, the API is started to serve that built page on its own port in production, a
 * change to a file the API is built from restarts the API as it always did, and a change to a file
 * the PAGE is built from rebuilds the page and leaves the API alone. A build that fails keeps the
 * last good page serving and files one note in the office naming the file. The watching, the
 * folding of changes into one action, the backoff and the ledger row are the SAME code as the
 * development mode: this is one supervisor with one flag, not a second one free to drift.
 *
 * `--built --prepared` starts from the page already in `dist/web` and skips the build before the
 * first start, and only that build: a later page change still rebuilds as it always did. It is for
 * a checkout handed over or restored with its exact built page, where a build during downtime would
 * replace what was just prepared. The page and its stamp are checked against this checkout before
 * anything listens, and anything that does not match refuses; see whyThePreparedPageIsNotFromHere.
 * `--prepared` without `--built` is refused, because it is `--built` that owns the first build.
 *
 * @param {object} [options]
 * @param {string} [options.root] the checkout. Defaults to this one.
 * @param {(line: string) => void} [options.say] where the plain lines go. Defaults to stdout.
 * @param {boolean} [options.writeItDown] whether to write this supervisor into the ledger. Default
 *   true. A test that never lets a server finish starting has nothing to write to, and says so here
 *   rather than waiting a minute for a fetch that cannot succeed.
 * @param {Partial<SupervisorClocks>} [options.clocks] shorter clocks for an in-process test; defaults
 *   to the shipped clocks, or the declared test setting for a supervisor started in its own process.
 * @param {{now: () => number, pause: (ms: number) => Promise<unknown>}} [options.diagnosticClock] an in-process test's report clock; the shipped clock is real time.
 * @param {boolean} [options.built] whether this is the built office. False (the default) is the
 *   development mode unchanged.
 * @param {boolean} [options.prepared] whether to serve the page already in `dist/web` without a
 *   build before the first start. It needs `built`; a page or stamp that does not match this
 *   checkout is refused before anything listens.
 * @param {typeof buildThePageForReal} [options.buildThePage] how the page is built. Defaults to the
 *   real `vite build`. A test can hand in a fast one and still drive the real watching and routing,
 *   which is what test (1) of S1's list measures.
 * @param {(stop: () => Promise<void>) => void} [options.whenItCanStop] given the same `stop` as the
 *   answer, just before the first server is started. From then on a server runs that only `stop`
 *   ends, and the answer comes only once that server has answered and this has been written into the
 *   ledger. The command below needs `stop` for a signal that comes in between.
 * @returns {Promise<{ stop: () => Promise<void>, restartsSoFar: () => number, watching: () => string[], rebuildsSoFar: () => number, redirect: () => number | null }>}
 *   Resolves once the first server answers and this supervisor has been written into the ledger, or
 *   once the wait for either has ended. `stop` stops the child by group, the watches and the redirect.
 */
export async function serveDev(options = {}) {
  const clocks = theSupervisorClocks(options.clocks)
  const root = resolve(options.root ?? REPO_ROOT)
  const say = options.say ?? ((line) => process.stdout.write(`${line}\n`))
  const built = options.built === true
  const prepared = options.prepared === true
  // THE BARE `--prepared` REFUSAL COMES FIRST OF ALL: before the settings are read, before the port
  // is looked at, before an orphan could be stopped and before anything could listen. It is one
  // sentence because a flag that needs another flag is a thing to fix, not a state to explain.
  if (prepared && !built) throw new Error('--prepared requires --built.')
  // THE PREPARED PAGE IS CHECKED BEFORE ANYTHING STARTS, because the whole point of the flag is
  // that no build happens before the first start. A page that is not this checkout's refuses here.
  if (built && prepared) {
    const why = whyThePreparedPageIsNotFromHere(root)
    if (why !== null) throw new Error(why)
  }
  const resolved = settings()
  const port = resolved.apiPort
  const webPort = resolved.webPort
  const apiAddress = `http://127.0.0.1:${String(port)}`
  const buildThePage = options.buildThePage ?? buildThePageForReal
  const reports = diagnosticReportDirectory(root)
  mkdirSync(reports, { recursive: true })
  // Read once, before anything starts, so a value it cannot use stops serve-dev here.
  let theAnswerLimit = aNewServerHasToAnswerWithin()
  let theMigrationLimit = theMigrationsHaveToFinishWithin()

  const onThePort = await whatIsOnThePort(apiAddress)
  const refusal = whyItMayNotStart(onThePort, port, apiAddress)
  if (refusal !== null) {
    const orphan = onThePort.answered
      ? await theOrphanThisCheckoutLeft(onThePort.runtime, apiAddress, root, resolved.workspace)
      : { no: '' }
    if ('takeOver' in orphan) {
      say(`[dev] ${orphan.why}`)
      await stopTheOrphan(orphan.takeOver.pgid, apiAddress, say, clocks.childStop)
    } else {
      throw new Error(refusal)
    }
  }

  /**
   * BUILD THE PAGE BEFORE THE FIRST START, and keep the last good one if this build fails.
   *
   * A first build that failed with nothing on disk is the one case where there is no page to serve,
   * so it is refused here rather than left to the API, which would refuse a moment later with its
   * own sentence. Anything else goes on with the last good build and says so.
   *
   * `--prepared` skips this one call and nothing else: the page it serves was checked against this
   * checkout before anything started, and every later page change still rebuilds through `rebuild`.
   */
  /** @type {{ file: string | null, output: string } | null} */
  let aBuildThatFailedBeforeTheStart = null
  if (built) {
    if (prepared) {
      say('[dev] --prepared: the built page in dist/web is this checkout\u2019s, so the first build is skipped.')
    } else {
      say('[dev] building the page before the first start...')
      const first = await buildThePage({ root, say })
      if (!first.ok) {
        aBuildThatFailedBeforeTheStart = { file: first.file, output: first.output }
        const named = first.file ?? 'a file the build did not name'
        say(`[dev] the page did not build: ${named}.`)
        if (!existsSync(join(root, 'dist', 'web', 'index.html'))) {
          throw new Error(
            `The page did not build and there is no last good build to serve, so there is nothing to serve.\n\n` +
              `The build failed on ${named}.\n\n${first.output}`,
          )
        }
        say('[dev] the last good build at dist/web is still there and will be served.')
      }
    }
  }

  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null
  /** The listening socket, held from the first start to `stop`. See `holdThePort`. */
  /** @type {{ fd: number, close: () => void } | null} */
  let theSocket = null
  /** The stand-in answering on that socket while no server runs on it. See tools/serve-dev-stand-in.mjs. */
  /** @type {import('node:child_process').ChildProcess | null} */
  let standIn = null
  /**
   * EACH STAND-IN'S WORD THAT IT HAS TAKEN WHAT WAS WAITING IN THE QUEUE: settled when it prints `listening`,
   * or when it exits without doing so. `stopOneStandIn` waits for it (check `SJFYLt5k4wwi`).
   * @type {WeakMap<import('node:child_process').ChildProcess, Promise<void>>}
   */
  const theStandInListens = new WeakMap()
  /** The reason the running stand-in was given, so it is replaced only when the reason changes. */
  /** @type {string | null} */
  let theStandInSays = null
  /**
   * TRUE WHILE THE STAND-IN IS ANSWERING FOR A SERVER'S MIGRATIONS. That reason stops being true
   * the moment the migrations end or the server goes, so it is the one reason another replaces.
   */
  let theStandInIsAboutTheMigrations = false
  /** @type {import('node:fs').FSWatcher[]} */
  let watches = []
  /** @type {string[]} */
  let watchedDirectories = []
  /** @type {Set<string>} */
  let theSet = new Set()
  /** The set of files the PAGE is built from. Empty unless this is the built mode. */
  /** @type {Set<string>} */
  let thePageSet = new Set()
  /** Files of the set seen changing since the last restart, in the order they arrived. */
  /** @type {string[]} */
  let changed = []
  /** Files the page is built from seen changing since the last rebuild. */
  /** @type {string[]} */
  let changedForThePage = []
  /** @type {NodeJS.Timeout | null} */
  let collecting = null
  /** @type {NodeJS.Timeout | null} */
  let backingOff = null
  let failuresInARow = 0
  /** When the run of failed starts began, milliseconds since the epoch. Zero while none is running. */
  let failingSince = 0
  /** What the last failed start ended with, in words. */
  let theLastExit = 'nothing has failed yet'
  /** The last lines the child printed, kept so a crash loop can say what the server said. */
  /** @type {string[]} */
  let theChildsLastLines = []
  /**
   * THE GUARD'S REFUSAL IN THIS RUN, CAPTURED AS THE CHILD PRINTS IT.
   *
   * It is not read out of `theChildsLastLines` alone because that window is 25 lines long and the
   * refusal can be longer than that: the first line, which carries the marker, would have been
   * pushed out by the list of what a migration would write. The data handler below looks at every
   * chunk as it arrives, so the marker is caught whatever the refusal's length.
   */
  /** @type {string | null} */
  let theRefusalInThisRun = null
  /**
   * THE GUARD'S REFUSAL THAT HAS STOPPED THIS SUPERVISOR STARTING, once it has.
   *
   * Non-null means the guard refused: it is what the note filed on the next successful start names.
   * Inspector refusal 5DLbHt7Fq3ce, invariant 3: a service lock is not a guard refusal. A
   * lock refusal alone cannot prove who held the database or whether the office was down.
   * The first guard refusal is cleared only when the server answers and the note is filed, never
   * on a restart. Without an intervening lock refusal, the office's down time is measured from the
   * first guard refusal rather than from the last attempt.
   */
  /** @type {string | null} */
  let theRefusal = null
  /** When the first guard refusal came, milliseconds since the epoch. Zero when no note is pending. */
  let theOfficeWentDownAt = 0
  /** The latest guard refusal, restored to the file when a lock refusal is taken back. */
  /** @type {string | null} */
  let theLastGuardRefusal = null
  /** The current lock refusal, kept apart from the guard's pending note (5DLbHt7Fq3ce, invariant 3). */
  /** @type {string | null} */
  let theLockRefusal = null
  /** Lock sentences observed while the guard's note was waiting, in the order they came. */
  /** @type {string[]} */
  let theLocksBetweenRefusalAndAnswer = []
  let restarts = 0
  let startedAt = 0
  /**
   * THE TIME THIS RUN HAS SPENT MIGRATING, which does not count against the limit for a new server
   * to answer (message DXXb8QZ_9EfG). The server prints a line as its migrations begin and
   * another as they end (`migration-markers.mjs`). While they run the stand-in answers beside the
   * server, which takes nothing from the queue until they end, and `theMigrationBound` ends them
   * at `theMigrationLimit` (check `m5X4lu3B2F7L`). Both are reset at each start.
   */
  let migratedFor = 0
  /** When this run's migrations began, milliseconds since the epoch. Zero while none is running. */
  let theMigrationBeganAt = 0
  /** The timer that stops a server whose migrations have run for `theMigrationLimit`. */
  /** @type {NodeJS.Timeout | null} */
  let theMigrationBound = null
  /** The time this run has left to answer: the limit, plus the time spent migrating, from its start. */
  const theTimeLeftToAnswer = () => {
    const migrating = theMigrationBeganAt === 0 ? 0 : Date.now() - theMigrationBeganAt
    return Math.max(0, startedAt + theAnswerLimit + migratedFor + migrating - Date.now())
  }
  /**
   * HOW MANY SERVERS IN A ROW WERE STOPPED FOR NOT ANSWERING. At `THE_STOPS_BEFORE_GIVING_UP`
   * serve-dev starts no new server until a file changes, and a server that answers sets it to zero.
   */
  let stopsForNotAnsweringInARow = 0
  /**
   * HOW MANY SERVERS A RESTART REPLACED BETWEEN THOSE STOPS, before serve-dev had seen whether they
   * answered. Such a server may have answered: an edit can replace it before `seeWhetherThisRunAnswered`
   * asks. It does not change the count above, but the words say it, so "in a row" is never said of
   * stops that had another server between them (round 6e of wave 13x).
   */
  let replacedBeforeAnAnswerWasSeen = 0
  let stopping = false
  /**
   * TRUE WHILE A RESTART IS RUNNING.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `5ZHmJ4_C26Y8`. `restart` is asynchronous — it waits for the child to stop, which took
   * about two seconds on the owner's stack — and it used to be started with `void restart(...)`
   * from a timer that could fire again inside that wait. Two restarts then ran side by side, both
   * waited for the same child, both spawned a server, and the second one's spawn overwrote the
   * reference to the first. One of the two servers then took the configured port and the other
   * died of the address being in use — and its exit handler cleared the supervisor's only reference
   * to the one that was up. From then on the supervisor believed it had no server, started a new
   * one every thirty seconds, and every one of them failed on the port the untracked child was
   * holding. Ninety-six in a row, for forty-seven minutes.
   *
   * A restart that arrives while one is running is now FOLDED INTO IT rather than run beside it:
   * the reason is kept and one more restart happens when the running one finishes.
   */
  let restarting = false
  /** @typedef {'migration' | 'service-lock' | null} StartLook */
  /** The reason and look of a restart asked for while one was running. */
  /** @type {{ reason: string, look: StartLook } | null} */
  let anotherRestartWanted = null
  /** True while this supervisor is the one ending the child, so its exit is not read as a crash. */
  let weAreStoppingTheChild = false
  /** @type {NodeJS.Timeout | null} */
  let theGoodRunTimer = null
  /** @type {NodeJS.Timeout | null} */
  let theSlowCheck = null
  /**
   * THE LOOK FOR A MIGRATION THAT WAS REFUSED, once the guard has made a `REFUSING TO SERVE`.
   *
   * Null when there is none. It is set only after that one kind of refusal, and cleared when it
   * starts the server itself, when the server next answers, and when the supervisor stops. It is
   * not `theSlowCheck`: that clock is about watches missing a source change and is turned by a
   * setting; this one is about a migration landing and is the supervisor's own.
   */
  /** @type {NodeJS.Timeout | null} */
  let theMigrationLook = null
  /**
   * THE ONE UNREADABLE REASON ALREADY SAID OUT LOUD, so a look that keeps failing does not fill the
   * log with the same sentence every five seconds. A different reason is a different fact and is
   * said again.
   */
  /** @type {string | null} */
  let theMigrationLookUnreadable = null
  /** The lock's holder is somebody else's server. This look never signals it. */
  /** @type {NodeJS.Timeout | null} */
  let theServiceLockLook = null
  let theChangeWhileLockedWasSaid = false
  /** @type {string | null} */
  let theServiceLockLookUnreadable = null
  /**
   * The session record this supervisor filed for itself, once it has one.
   *
   * DECLARED HERE RATHER THAN BESIDE THE CODE THAT FILLS IT IN, because the exit handler of the
   * very first child reads it, and a child that dies in the first second dies before the filing has
   * even been attempted.
   */
  /** @type {string | null} */
  let sessionRecordId = null
  /** @type {string | null} */
  let registrationDetail = null
  /**
   * The write of this supervisor into the ledger while it is on its way, so a stop that comes during
   * it can wait for the row it makes, and a restart can wait for the server it goes through. Null
   * before it starts and once it has finished.
   */
  /** @type {Promise<{ sessionRecordId: string, resourceId: string } | { refused: string } | { stopped: string }> | null} */
  let theLedgerWrite = null
  /** Ends the write's wait between two tries, while it is waiting. */
  /** @type {(() => void) | null} */
  let endTheLedgerWait = null
  /** A restart waiting for the write to finish or to start waiting between tries. */
  /** @type {(() => void)[]} */
  let whenTheLedgerWriteWaits = []
  /** True once the office has refused the write, so startup is ending. */
  let theLedgerWriteWasRefused = false
  /** How many page rebuilds this supervisor has run. */
  let rebuilds = 0
  /** True while a rebuild is running, so a second request is folded into it rather than run beside it. */
  let rebuilding = false
  /** The reason of a rebuild asked for while one was running. */
  /** @type {string | null} */
  let anotherRebuildWanted = null
  /** The failing file a note has already been filed about, so a repeated failure is not filed twice. */
  /** @type {string | null} */
  let theFileLastNotedAsFailing = null
  /** The redirect listener on the old development address, once it is started. */
  /** @type {{ close: () => Promise<void> } | null} */
  let redirect = null

  const walkTheSet = () => {
    forgetTheWalks()
    const files = theFilesThatRestartTheServer(root)
    theSet = new Set(files)
    if (built) {
      const page = theFilesBuiltFrom(THE_PAGES_ENTRY, root)
      thePageSet = new Set(page.files)
    }
    return files
  }

  /** Every file either watch set covers, so both are watched through one list of directories. */
  const theFilesToWatch = () => [...new Set([...theSet, ...thePageSet])]

  const armTheWatches = (/** @type {readonly string[]} */ files) => {
    for (const one of watches) one.close()
    watches = []
    watchedDirectories = []
    for (const { path, recursive } of theDirectoriesToWatch(files, root)) {
      let watcher
      try {
        watcher = watch(path, { recursive, persistent: true })
      } catch (err) {
        // A directory that cannot be watched is said out loud, because the alternative is a
        // supervisor that quietly does not see part of the code — which is this whole problem.
        say(`[dev] WARNING: ${path} could not be watched (${String(err)}). Changes there will not restart the server.`)
        continue
      }
      watcher.on('change', (_event, filename) => {
        noticed(whatChanged(path, filename, root), path)
      })
      watcher.on('error', (err) => {
        say(`[dev] WARNING: the watch on ${path} failed (${String(err)}). Changes there will not restart the server.`)
      })
      watches.push(watcher)
      watchedDirectories.push(path)
    }
  }

  const noticed = (/** @type {string | null} */ file, /** @type {string} */ directory) => {
    if (stopping) return
    /**
     * WHICH SET THE FILE BELONGS TO DECIDES WHAT HAPPENS, and a file can belong to both.
     *
     * `src/shared/time.ts` is imported by the API and by the page, so saving it restarts the server
     * AND rebuilds the page; a file only the API imports does the first; a file only the page
     * imports does the second and leaves the API alone. That distinction is the whole of S1's
     * third and fourth clauses, and it is read from the two sets rather than from a folder.
     */
    const unnamed = file === null
    const forTheServer = unnamed || (file !== null && theSet.has(file))
    const forThePage = built && (unnamed || (file !== null && thePageSet.has(file)))
    if (!forTheServer && !forThePage) return
    const name = file ?? `a file the machine did not name, under ${relative(root, directory)}`
    if (forTheServer && !changed.includes(name)) {
      // fs.watch is allowed to report a change without naming the file. Restarting is the safe
      // direction to be wrong in — a restart nobody needed rather than a change nobody saw — and it
      // is said plainly rather than hidden.
      changed.push(name)
    }
    if (forThePage && !changedForThePage.includes(name)) changedForThePage.push(name)
    if (collecting !== null) return
    collecting = setTimeout(() => {
      collecting = null
      const serverFiles = changed
      const pageFiles = changedForThePage
      changed = []
      changedForThePage = []
      if (serverFiles.length > 0) void restart(theRestartLine(serverFiles))
      if (pageFiles.length > 0) void rebuild(theRestartLine(pageFiles))
    }, COLLECT_CHANGES_FOR)
  }

  /**
   * FILE ONE NOTE IN THE OFFICE ABOUT A BUILD THAT FAILED, NAMING THE FILE IT FAILED ON.
   *
   * S1 asks for one note and no more. A build that fails every time a file is saved would fill the
   * office with the same sentence, so the file it failed on is remembered and the same one is not
   * filed twice. A different file IS a different fact and gets its own note. The last lines the
   * build printed go in the body, because the file name alone rarely says what is wrong with it.
   */
  const fileANoteAboutTheFailedBuild = async (/** @type {string | null} */ file, /** @type {string} */ output) => {
    if (file !== null && file === theFileLastNotedAsFailing) return
    if (file !== null) theFileLastNotedAsFailing = file
    const named = file ?? 'a file the build did not name'
    const lastLines = output.split('\n').filter((line) => line.trim() !== '').slice(-12).join('\n')
    try {
      const filed = await fetch(`${apiAddress}/api/records`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mole-office-workspace': resolved.workspace,
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
          ...theOfficeKeyHeader(),
        },
        body: JSON.stringify({
          kind: 'note',
          title: `The built page did not build: ${named}`,
          data: {
            date: localStampOf(new Date()).slice(0, 10),
            body:
              `A page rebuild failed on ${named}. The last good build is still being served, so the office is ` +
              `open and nothing on screen is broken. The build said:\n\n${lastLines}`,
          },
        }),
        signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
      })
      if (!filed.ok) throw new Error(`the office answered ${String(filed.status)}`)
      say('[dev] a note naming the failing file was filed in the office.')
    } catch (err) {
      say(
        `[dev] the failed build could not be filed in the office (${err instanceof Error ? err.message : String(err)}), ` +
          'so this log is the only place it is written.',
      )
    }
  }

  /**
   * STOP THE CHILD BY ITS PROCESS GROUP.
   *
   * The child is started with a group of its own, and a group is what is signalled: a server is a
   * group of several processes — the esbuild service is one of them — and signalling only the
   * leader leaves them holding the port. It is the group id this supervisor recorded when it
   * started the child, never a search of the process table for a command line that looks right.
   * On 4 September 2026 a builder stopping its own scratch stack by command-line pattern killed the
   * owner's live API, which matched (problem `LD9Yor6qIVVC`).
   *
   * g_icMYOZxkQZ, wave 13t: wait for exit, not a quiet port. The server lets its service
   * lock go last as it exits, so a child still alive after both waits must keep its place.
   * @param {boolean} [diagnostic] Only the existing stop for not answering requests a report, and
   *   says the exit code and signal of the server once it has exited.
   * @returns {Promise<boolean>} whether the child has exited
   */
  const stopTheChild = async (diagnostic = false) => {
    const going = child
    if (going === null || going.pid === undefined || going.exitCode !== null || going.signalCode !== null) {
      child = null
      weAreStoppingTheChild = false
      return true
    }
    const group = going.pid
    // A SERVER IS GIVEN ITS DRAIN ONCE. One still alive when a backoff tries again has had it.
    const again = weAreStoppingTheChild
    weAreStoppingTheChild = true
    if (theGoodRunTimer !== null) {
      clearTimeout(theGoodRunTimer)
      theGoodRunTimer = null
    }
    let onExit = () => {}
    const gone = new Promise((done) => {
      onExit = () => done(undefined)
      going.once('exit', onExit)
    })
    if (diagnostic && !again) {
      const hangAt = new Date()
      try {
        const report = await requestDiagnosticReport(group, root, hangAt, options.diagnosticClock)
        say(`[dev] diagnostic report: ${report.path}${report.incomplete.length ? `; ${report.incomplete.join(' ')}` : ''}`)
      } catch (err) {
        say(`[dev] diagnostic report for child ${String(group)} could not be collected (${err instanceof Error ? err.message : String(err)}).`)
      }
    }
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Already gone between the check and the signal. The exit handler has run or is about to.
    }
    const within = again ? clocks.childStop : clocks.serverStop
    let inTime = await Promise.race([gone.then(() => true), wait(Math.min(within, clocks.childStop)).then(() => false)])
    if (!inTime && within > clocks.childStop) {
      // NEW READS ARE ANSWERED WHILE IT DRAINS (message n5g0uTda98in). The stopping server has
      // closed its listener, so after the first wait the stand-in takes what the queue holds, as it
      // did before the drain once the server was killed. A server that stops sooner leaves its
      // queue to the next server, as before.
      const fact =
        `The server in process group ${String(group)} is answering the reads it took before it was told to stop, ` +
        `for at most ${String((within - clocks.childStop) / 1000)}s more. serve-dev starts no new server until it has exited.`
      say(`[dev] ${fact}`)
      startTheStandIn(fact, true)
      inTime = await Promise.race([gone.then(() => true), wait(within - clocks.childStop).then(() => false)])
    }
    if (!inTime) {
      say(`[dev] the server did not stop within ${String(within / 1000)}s; killing group ${String(group)}`)
      // FROM HERE THE PORT ANSWERS WHY (check `qCP4OR2YDwvZ`, path 1). A server that is stopping has
      // closed its listener, and a read queued behind it would otherwise wait for the next wait too.
      startTheStandIn(
        `The server in process group ${String(group)} did not stop within ${String(within / 1000)}s ` +
          'of SIGTERM, so serve-dev is killing it. It starts no new server until that one has exited.',
        true,
      )
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        // Gone in the meantime.
      }
      await Promise.race([gone, wait(clocks.childStop)])
    }
    // A timed-out attempt is retried, so its listener must not accumulate on the retained child.
    going.removeListener('exit', onExit)
    if (going.exitCode === null && going.signalCode === null) {
      // Keep both the child and the stop flag through backoff. Its eventual exit is the shutdown
      // we asked for, not another crash; the retry will clear it only once that exit has happened.
      theLastExit = `the server in group ${String(group)} is still alive after ${String((within + clocks.childStop) / 1000)}s`
      say(`[dev] ${theLastExit}; no replacement was started.`)
      return false
    }
    if (diagnostic) {
      // HOW A SERVER THAT DID NOT ANSWER ENDED. The exit handler says nothing while serve-dev stops a
      // child, so this is the one place its exit code and signal are said.
      const code = going.exitCode === null ? 'no exit code' : `exit code ${String(going.exitCode)}`
      const signal = going.signalCode === null ? 'no signal' : `signal ${going.signalCode}`
      say(`[dev] the server in group ${String(group)} has exited, with ${code} and ${signal}.`)
    }
    weAreStoppingTheChild = false
    child = null
    return true
  }

  /**
   * START THE STAND-IN, which answers every request on the held socket with 503 and `reason` while
   * no server runs on it (tools/serve-dev-stand-in.mjs says why). Called where a server has just
   * exited on its own and none is being started: the backoff, the guard's refusal and the service
   * lock's. NOT DETACHED, so it is in this supervisor's own group and a stop of the group stops it.
   *
   * AND BESIDE A SERVER THAT HAS BEEN TOLD TO STOP, with `besideAServerBeingStopped`. Check
   * `qCP4OR2YDwvZ` found two states where a server is recorded and takes nothing from the queue: an
   * old server still alive after SIGTERM and SIGKILL, and a new one that never answers. Without
   * the stand-in a request waited until its own time ran out. In both, the server takes nothing
   * from the queue: it has closed its listener or never opened one. If one still took a request,
   * that request would be its to answer or not; every request the stand-in takes is answered.
   *
   * @param {string} reason the sentence this supervisor has just said, for every caller to read
   * @param {boolean} [besideAServerBeingStopped] start it although `child` is still recorded: a server
   *   being stopped, or one running its migrations (`theMigrationsBegan`)
   * @param {string | null} [refusal] the fixed name of the refusal this reason is, when it is one the
   *   self-check can tell apart without matching English (`THE_STABLE_TAG_REFUSAL`)
   */
  const startTheStandIn = (reason, besideAServerBeingStopped = false, refusal = null) => {
    if (stopping || theSocket === null) return
    if (standIn !== null) {
      // A STAND-IN SAYING THE SERVER IS MIGRATING is replaced by whatever is true next, such as the
      // server stopping on its own mid-migration. Any other stand-in keeps its first reason.
      if (theStandInIsAboutTheMigrations && theStandInSays !== reason) {
        void stopTheStandIn().then(() => startTheStandIn(reason, besideAServerBeingStopped, refusal))
      }
      return
    }
    if (child !== null && !besideAServerBeingStopped) return
    const started = spawn(
      process.execPath,
      [
        THE_STAND_IN,
        `--supervisor-pid=${String(process.pid)}`,
        `--reason=${reason}`,
        ...(refusal === null ? [] : [`--refusal=${refusal}`]),
      ],
      // The handle is passed as node's own `net.Server` passes one; the types know only streams.
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit', /** @type {any} */ (theSocket)] },
    )
    theStandInListens.set(started, new Promise((done) => {
      let heard = ''
      started.stdout?.on('data', (chunk) => {
        heard += String(chunk)
        if (heard.includes('listening')) done(undefined)
      })
      started.once('exit', () => done(undefined))
      started.once('error', () => done(undefined))
    }))
    standIn = started
    theStandInSays = reason
    theStandInIsAboutTheMigrations = false
    started.on('exit', () => {
      if (standIn === started) {
        standIn = null
        theStandInIsAboutTheMigrations = false
      }
    })
    started.on('error', (err) => {
      say(`[dev] the stand-in could not be started (${String(err)}), so the port answers nothing until a server runs.`)
    })
  }

  /**
   * STOP THE STAND-IN AND WAIT FOR IT TO EXIT, before a server is started on the socket. Two
   * processes taking from one socket's queue would split the requests between them. It goes on
   * until none is recorded, because a stand-in being replaced (`startTheStandIn`) can start
   * another while this waits for the first to exit.
   *
   * A STAND-IN IS STOPPED ONLY ONCE IT LISTENS (check `SJFYLt5k4wwi`). A backoff restart comes
   * about 0.6 s after the stand-in starts. On a loaded machine node had not finished starting it by
   * then in 2 runs of 3, and the SIGTERM ended it before its first line ran. Every read queued behind
   * a server that never answers then waited through the next such server as well, 12.4 and 12.7 s.
   * Waiting for its `listening` lets it take the queue first (tools/serve-dev-stand-in.mjs says how
   * it does). The wait is bounded like the exit.
   *
   * EXCEPT WHEN THE MIGRATIONS END (`untilItListens: false`). The server is listening then and takes
   * the queue itself, so nothing is left behind. Waiting there let the stand-in answer 503 beside a
   * server that had already answered 200: 3 such reads in a traced run of case 14 of
   * tests/the-office-answers-while-it-restarts.test.ts, which was red in 3 runs of 4.
   * @param {{ untilItListens?: boolean }} [how]
   * @returns {Promise<void>}
   */
  const stopTheStandIn = async ({ untilItListens = true } = {}) => {
    while (standIn !== null) await stopOneStandIn(standIn, untilItListens)
  }

  /**
   * @param {import('node:child_process').ChildProcess} going
   * @param {boolean} untilItListens
   */
  const stopOneStandIn = async (going, untilItListens) => {
    if (going.exitCode === null && going.signalCode === null) {
      const gone = new Promise((done) => going.once('exit', () => done(undefined)))
      if (untilItListens) {
        const listens = theStandInListens.get(going) ?? Promise.resolve()
        const listened = await Promise.race([listens.then(() => true), wait(clocks.childStop).then(() => false)])
        if (!listened) {
          say(`[dev] the stand-in (process ${String(going.pid)}) did not say it was listening within ${String(clocks.childStop / 1000)}s; stopping it anyway`)
        }
      }
      going.kill('SIGTERM')
      const inTime = await Promise.race([gone.then(() => true), wait(clocks.childStop).then(() => false)])
      if (!inTime) {
        say(`[dev] the stand-in (process ${String(going.pid)}) did not stop within ${String(clocks.childStop / 1000)}s; killing it`)
        going.kill('SIGKILL')
        await gone
      }
    }
    if (standIn === going) {
      standIn = null
      theStandInIsAboutTheMigrations = false
    }
  }

  // Inspector refusal fB2IAu88rCm0, invariant 1: keep the look on this child, not on a later start.
  // Every other start defaults to no look, including a watched change and a backoff restart.
  const start = (/** @type {string} */ reason, /** @type {StartLook} */ look = null) => {
    startedAt = Date.now()
    /**
     * `node --import tsx <the entry>`, NOT `tsx <the entry>`, AND THE DIFFERENCE MATTERS.
     *
     * The `tsx` command is a launcher: it starts a SECOND node process to run the program, so the
     * server's parent would be `tsx` and this supervisor would be its grandparent. Measured on the
     * first run of this file, 4 September 2026: the runtime record said "nothing is watching this
     * server" about a server that was being watched, because it reads its parent. `--import tsx`
     * loads the same TypeScript loader into one process, so the server's parent is this supervisor
     * and the reading is right without anybody walking a process tree.
     */
    const started = spawn(
      process.execPath,
      [
        '--inspect-port=0',
        '--report-exclude-env',
        '--report-exclude-network',
        '--import',
        'tsx',
        THE_SERVER_ENTRY,
        /**
         * THE CHILD GOES WHEN THIS SUPERVISOR GOES, WHATEVER ENDS THIS SUPERVISOR.
         *
         * The child is `detached`, so it is NOT in this supervisor's process group and a signal to
         * that group does not reach it. `stop` below stops it by its own group on every ordinary
         * way out, but nothing outside a process can cover `kill -KILL` on it: no handler runs.
         * This is the half inside the child. `src/server/index.ts` reads the flag, watches that pid
         * once a second, and shuts down when it is gone — the mechanism this product already has,
         * used by `tests/helpers.ts` and by the message worker for exactly this.
         *
         * Without it, a supervisor stopped by group leaves its child holding the configured port,
         * and every replacement fails. Problem `5ZHmJ4_C26Y8`.
         */
        `--stop-with-pid=${String(process.pid)}`,
      ],
      {
        cwd: root,
        // A GROUP OF ITS OWN, so that stopping it stops everything it started and nothing else.
        detached: true,
        // PIPED RATHER THAN INHERITED, so the last lines the server printed can be written into the
        // crash-loop file. Every line is passed straight through to this supervisor's own output, so
        // the terminal and the log read exactly as they did when the child wrote to them directly.
        // AND THE HELD SOCKET AS DESCRIPTOR 3, which the server listens on (`holdThePort` says why).
        // The handle is passed as node's own `net.Server` passes one; the types know only streams.
        stdio: ['ignore', 'pipe', 'pipe', ...(theSocket === null ? ['ignore'] : [/** @type {any} */ (theSocket)]), 'ipc'],
        // PRODUCTION IN THE BUILT MODE, so the API serves the built page itself on its own port
        // (src/server/index.ts mounts `dist/web` only when NODE_ENV is production).
        env: {
          ...process.env,
          MOLE_OFFICE_RESTART_REASON: reason,
          ...(theSocket === null ? {} : { MOLE_OFFICE_LISTEN_FD: '3' }),
          ...(built ? { NODE_ENV: 'production' } : {}),
        },
      },
    )
    child = started
    started.on('message', (message) => {
      if (started !== child || stopping) return
      if (message !== null && typeof message === 'object' && 'officeControl' in message) {
        if (message.officeControl === 'restart') {
          theAnswerLimit = aNewServerHasToAnswerWithin()
          theMigrationLimit = theMigrationsHaveToFinishWithin()
          void restart('the office restart press was used')
        }
        if (message.officeControl === 'pause') void stop()
      }
    })
    theChildsLastLines = []
    theRefusalInThisRun = null
    migratedFor = 0
    theMigrationBeganAt = 0
    stopTheMigrationBound()
    let pendingStderr = ''
    for (const [stream, out] of /** @type {const} */ ([
      [started.stdout, process.stdout],
      [started.stderr, process.stderr],
    ])) {
      stream?.on('data', (/** @type {Buffer} */ chunk) => {
        const text = chunk.toString('utf8')
        if (stream === started.stderr && started.pid !== undefined) {
          pendingStderr += text
          const complete = pendingStderr.split('\n')
          pendingStderr = complete.pop() ?? ''
          for (const line of complete) {
            try { recordInspectorAddress(root, started.pid, line) }
            catch (err) { say(`[dev] the inspector address could not be recorded (${err instanceof Error ? err.message : String(err)}).`) }
          }
        }
        // STRAIGHT THROUGH, on the same stream the child wrote it to, so `npm run dev:server` reads
        // exactly as it did when the child held the terminal itself.
        out.write(text)
        const lines = text.split('\n').filter((line) => line !== '')
        theChildsLastLines.push(...lines)
        if (theChildsLastLines.length > HOW_MANY_LINES_ARE_KEPT) {
          theChildsLastLines = theChildsLastLines.slice(-HOW_MANY_LINES_ARE_KEPT)
        }
        // THE MARKER IS LOOKED FOR AS THE CHILD PRINTS IT, not only in the 25-line window, because
        // a refusal can be longer than the window and its first line would have been pushed out.
        if (theRefusalInThisRun === null) {
          const refused = theGuardsRefusalIn(lines)
          if (refused !== null) theRefusalInThisRun = refused
        }
        if (started === child) {
          for (const line of lines) {
            const marker = theMigrationMarkerIn(line)
            if (marker === 'began' && theMigrationBeganAt === 0) theMigrationsBegan(started)
            if (marker === 'ended' && theMigrationBeganAt !== 0) theMigrationsEnded()
          }
        }
      })
    }
    /**
     * A RUN THAT IS ANSWERING IS A RUN THAT WORKED, and it clears the count and the file that names
     * the failures.
     *
     * IT ASKS THE SERVER, IT DOES NOT WATCH A CLOCK. The clock this replaced said a run lasting ten
     * seconds had started properly, and it was wrong exactly where it mattered: on 12 September
     * 2026 the start guard reached its refusal after 14.9 seconds, so every attempt was called good,
     * the count restarted at zero, and the same refusal was logged fifty times as "1 in a row" with
     * the back-off never growing. `seeWhetherThisRunAnswered` asks `GET /api/health` instead, and
     * only a server that answers clears the run.
     */
    if (theGoodRunTimer !== null) clearTimeout(theGoodRunTimer)
    theGoodRunTimer = setTimeout(() => {
      theGoodRunTimer = null
      void seeWhetherThisRunAnswered(started)
    }, Math.min(clocks.goodRun, theAnswerLimit))
    theGoodRunTimer.unref?.()
    started.on('exit', (code, signal) => {
      /**
       * ONLY THE SERVER THAT IS UP NOW MAY REPORT ITS OWN DEATH.
       *
       * A child this supervisor has already replaced is not the server anybody is talking to, and
       * its exit says nothing about the one that is. Without this line the exit of an abandoned
       * child cleared `child`, and the supervisor then believed it had no server while one was
       * answering. That is problem `5ZHmJ4_C26Y8`'s ninety-six failed starts. Restarts are now
       * serialized, and stopTheChild keeps a child that outlives both waits (g_icMYOZxkQZ,
       * wave 13t's service lock is released last at exit), so neither route abandons a live child.
       */
      if (started !== child) return
      stopTheMigrationBound()
      /**
       * THE RUN IS OVER, SO THE CLOCK ON IT STOPS. It was armed when this child started and it
       * says "this one lasted"; a child that has gone did not last. Measured on a scratch stack on
       * 4 September 2026: without this the timer went on running through the backoff — which grows
       * to half a minute — and a server that had died after half a second was counted as a good run
       * sixteen seconds later, clearing the count and taking back the file that named the failures.
       */
      if (theGoodRunTimer !== null) {
        clearTimeout(theGoodRunTimer)
        theGoodRunTimer = null
      }
      if (weAreStoppingTheChild || stopping) return
      child = null
      /**
       * A SERVER THAT REFUSED THE STABLE CHECKOUT IS NOT A CRASH AND IS NOT COUNTED.
       *
       * The stable office runs from its own clone at a dated tag, and only its upgrade moves it. A
       * start from anything else refuses with a code of its own, and starting it again cannot change
       * the checkout. So this branch lies before the counter: it leaves `failuresInARow`, `failingSince`,
       * `theLastExit`, `theRefusal` and `theOfficeWentDownAt` exactly as they were, writes the child's
       * own sentence and the two steps that put the copy back (THE_STABLE_TAG_PUT_BACK) where a page
       * with no server can read it, arms no backoff and starts no server
       * again. Nothing is filed and nobody is called, as a guard refusal is not: the trouble file, the
       * ledger row and health's failed restarts read the counter, and none of them hears this.
       */
      if (code === THE_STABLE_TAG_REFUSAL_EXIT_CODE) {
        const said = theChildsLastLines.find((line) => line.startsWith(THE_STABLE_TAG_REFUSAL_BEGINS))
        const why =
          said ??
          `The server did not start from the stable checkout, with exit code ${String(code)}, and its output held ` +
            'no sentence saying why.'
        // The log line, the refusal file and the stand-in's body all come from this one string.
        const fact = `${why} ${THE_STABLE_TAG_PUT_BACK}`
        const written = writeTheRefusal(root, fact)
        const notWritten = 'failed' in written ? ` (${THE_REFUSAL_FILE} could not be written: ${written.failed})` : ''
        say(`[dev] ${fact}${notWritten}`)
        startTheStandIn(fact, false, THE_STABLE_TAG_REFUSAL)
        return
      }
      const ranFor = Date.now() - startedAt
      const ended = signal === null ? `exit code ${String(code)}` : `signal ${String(signal)}`
      failuresInARow += 1
      if (failingSince === 0) failingSince = Date.now()
      theLastExit = ended
      /**
       * g_icMYOZxkQZ, wave 13t's service lock: count the refused start, but never arm
       * backoff or call it a crash loop. Invariant 3: exit 75 proves a lock refusal, not a holder.
       * Name a holder only when the lock was read; otherwise keep the child's own sentence.
       */
      if (code === THE_SERVICE_LOCK_REFUSAL_EXIT_CODE) {
        const reading = readTheServiceLock(resolved.serviceLockPath)
        const refused = reading.state === 'read'
          ? theLockIsHeldSentence(resolved.serviceLockPath, reading.lock)
          : theChildsLastLines.find((line) => line.startsWith('This server did not start')) ??
            `The server refused the service lock ${resolved.serviceLockPath}, but its holder could not be read (${reading.state}).`
        // fB2IAu88rCm0, invariant 1: a free lock cannot prove the child can read its own process.
        // Stop when the lock look and acquisition disagree, rather than repeating that failed start.
        const fact = look === 'service-lock'
          ? `the service lock look found the lock free, but the server refused it again. ` +
            `serve-dev will not start the server again until a file it is built from changes or a person ` +
            `runs the supervisor again. The server said: ${refused}`
          : `${refused} serve-dev started no second server. It will start again on its own when the service lock is free.`
        theLockRefusal = fact
        if (theRefusal !== null) theLocksBetweenRefusalAndAnswer.push(refused)
        const written = writeTheRefusal(root, fact)
        const notWritten = 'failed' in written ? ` (${THE_REFUSAL_FILE} could not be written: ${written.failed})` : ''
        forgetTheTrouble(root)
        stopTheMigrationLook()
        say(`[dev] ${fact}${notWritten}`)
        startTheStandIn(fact)
        if (look !== 'service-lock') startTheServiceLockLook()
        return
      }
      /**
       * THE GUARD'S REFUSAL ALSO STOPS BLIND RETRIES.
       *
       * The refusal is about the database, and starting the server again the moment it exits cannot
       * change that; on 12 September 2026 the supervisor restarted into the same refusal fifty times
       * over fourteen minutes. The marker in the child's own output is the one fact the guard and
       * this file share, and `guard-refusal.mjs` is where it is written once.
       *
       * THE TWO KINDS ARE NOT THE SAME FACT, and 13 September 2026 measured the difference (problem
       * `nxDRPQ0IZcOU`). `REFUSING TO SERVE` can mean the database is behind the code, and a migration
       * landing fixes that without any source file moving — so for that kind a five-second look
       * tries one start when the journal catches up. `REFUSING TO USE` means the database is
       * damaged or is not Mole Office's, which no clock can fix, so that kind is not retried at all.
       *
       * The refusal is still counted as a failed start, because it is one, but nothing waits on the
       * count: no back-off is armed and no restart follows, except the serve-kind look's own. The
       * first line is written where a person or a page can still read it, and the note naming it is
       * filed when a server next answers. `theRefusal` is not cleared on a restart, so the office's
       * down time is measured from the first refusal rather than reset by each attempt.
       */
      const refusal = theRefusalInThisRun ?? theGuardsRefusalIn(theChildsLastLines)
      if (refusal !== null) {
        if (theRefusal === null) {
          theRefusal = refusal
          theOfficeWentDownAt = Date.now()
        }
        // 5DLbHt7Fq3ce, invariant 3: every guard refusal is said and acted on, even while the
        // first refusal's note is waiting. A lock's promise no longer describes this start.
        theLastGuardRefusal = refusal
        // The gate a-start-refusal-stops-the-retries is met once for each server run that ends in a refusal.
        spoolAGateMet('a-start-refusal-stops-the-retries', 'remind')
        const written = writeTheRefusal(root, refusal)
        const notWritten =
          'failed' in written ? ` (${THE_REFUSAL_FILE} could not be written: ${written.failed})` : ''
        if (refusal.startsWith(REFUSING_TO_SERVE)) {
          // Inspector refusal fB2IAu88rCm0, invariant 1: the guard knows more than the journal's
          // numbers. Its check may not finish, or a data step may still write. A disagreement
          // stops here because repeating the journal comparison cannot settle either refusal.
          if (look === 'migration') {
            stopTheMigrationLook()
            say(
              `[dev] the migration look found the database up to date, but the guard refused to serve it again. ` +
                `serve-dev will not start the server again until a file it is built from changes or a person ` +
                `runs the supervisor again. The guard said: ${refusal}${notWritten}`,
            )
            startTheStandIn(`The server refused to start, and serve-dev will not start it again until a file it is built from changes. The guard said: ${refusal}`)
            return
          }
          // SAID FOR THIS START, SO A PERSON IS NOT TOLD TO TOUCH A FILE. The database is behind
          // the code, and the migration landing is the one thing that changes that, so the look watches for
          // it and starts the server again with no file change and no person.
          say(
            `[dev] the server refused to start, and it will not be started again until the migration lands. ` +
              `It will be started again on its own, with no file change and no person, when the migration ` +
              `lands. The guard said: ${refusal}${notWritten}`,
          )
          startTheStandIn(`The server refused to start until a migration lands, and serve-dev starts it again when it does. The guard said: ${refusal}`)
          startTheMigrationLook()
        } else {
          say(
            `[dev] the server refused to start, and it will not be started again until a file it is built from ` +
              `changes or a person runs the supervisor again. The guard said: ${refusal}${notWritten}`,
          )
          startTheStandIn(`The server refused to start, and serve-dev will not start it again until a file it is built from changes. The guard said: ${refusal}`)
        }
        return
      }
      const waitFor = theBackoffAfter(failuresInARow, clocks)
      say(
        `[dev] the server stopped on its own (${ended}) after ${String(Math.round(ranFor / 100) / 10)}s — ` +
          `${String(failuresInARow)} in a row. Starting it again in ${String(Math.round(waitFor / 100) / 10)}s.`,
      )
      sayItOutLoudIfThisIsALoop()
      startTheStandIn(
        `The server stopped on its own (${ended}), ${String(failuresInARow)} in a row, and serve-dev starts it again in ` +
          `${String(Math.round(waitFor / 100) / 10)}s.`,
      )
      backingOff = setTimeout(() => {
        backingOff = null
        void restart(`the previous run stopped on its own (${ended})`)
      }, waitFor)
    })
    started.on('error', (err) => {
      say(`[dev] the server could not be started (${String(err)}).`)
    })
    return started
  }

  /**
   * WRITE A RUN OF FAILED STARTS WHERE THE PRODUCT CAN READ IT.
   *
   * Below the threshold this does nothing: a server that failed once and came back is an ordinary
   * save with a mistake in it. At and above it, the file is written on every further failure, so
   * the count in it is the count now.
   */
  const sayItOutLoudIfThisIsALoop = () => {
    if (theServiceLockLook !== null) return
    if (failuresInARow < theFailedStartsBeforeSaying()) return
    const trouble = {
      atMs: Date.now(),
      sinceMs: failingSince,
      failedStarts: failuresInARow,
      lastExit: theLastExit,
      lastOutput: [...theChildsLastLines],
      supervisorPid: process.pid,
      supervisorPgid: theGroupThisSupervisorIsIn(),
      repository: root.replace(/\/$/, ''),
      port,
    }
    const written = writeTheTrouble(root, trouble)
    if ('failed' in written) {
      say(`[dev] this run of failed starts could not be written down (${written.failed}), so only this log has it.`)
      return
    }
    const first = failuresInARow === theFailedStartsBeforeSaying()
    if (first) say(`[dev] ${whatTheTroubleSays(trouble)}`)
    // AND INTO ITS OWN LEDGER ROW, because that is where somebody looking at what is running will
    // be. It needs a server to answer, which is the thing that is failing, so a failure here is
    // said once and never again: the file above is the reading that works either way.
    if (sessionRecordId !== null) {
      void sayThisSupervisorCannotStartAServer(apiAddress, resolved.workspace, sessionRecordId, trouble).catch((err) => {
        if (!first) return
        say(
          `[dev] the ledger row for this supervisor could not be told about the failed starts ` +
            `(${err instanceof Error ? err.message : String(err)}). ${written.written} has them.`,
        )
      })
    }
  }

  /**
   * FILE ONE NOTE NAMING THE GUARD'S REFUSAL AND THE SUBSEQUENT START.
   *
   * It is filed the moment this supervisor's server answers after a guard refusal.
   * It names the refusal's first line and the time from the refusal to the
   * answer, and it is filed once: on success `theRefusal` and the down time are cleared and the
   * file a page could read is taken back. A filing that fails leaves all three in place and asks to
   * be tried again, because a refusal that nobody hears about is the whole of this problem.
   * 5DLbHt7Fq3ce, invariant 3: an intervening exit 75 proves only that the service lock refused
   * a start. Keep each sentence as read, in order, with the guard and answer times. A holder
   * may not have been read, so the title and success line claim no holder or office down time.
   *
   * @returns {Promise<boolean>} whether the note was filed
   */
  const fileTheNoteAboutTheRefusal = async () => {
    const refusal = theRefusal
    const downSince = theOfficeWentDownAt
    if (refusal === null || downSince === 0) return true
    const downFor = Math.round((Date.now() - downSince) / 100) / 10
    const seconds = `${String(downFor)} second${downFor === 1 ? '' : 's'}`
    const theServiceLockRefusedALaterStart = theLocksBetweenRefusalAndAnswer.length > 0
    try {
      const filed = await fetch(`${apiAddress}/api/records`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mole-office-workspace': resolved.workspace,
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'mole-office/the-dev-supervisor',
          ...theOfficeKeyHeader(),
        },
        body: JSON.stringify({
          kind: 'note',
          title: theServiceLockRefusedALaterStart
            ? 'The guard refused to start the server, the service lock refused a later start, and this server answered again'
            : `The server refused to start, and the office was down for ${seconds}`,
          data: {
            date: localStampOf(new Date()).slice(0, 10),
            body: theServiceLockRefusedALaterStart
              ? `The start guard refused to serve the database at ${localStampOf(new Date(downSince))}. ` +
                `The refusal's first line was:\n\n${refusal}\n\n` +
                `After that:\n\n${theLocksBetweenRefusalAndAnswer.join('\n\n')}\n\n` +
                `serve-dev's own server answered again at ${localStampOf(new Date())}.`
              : `The start guard refused to serve the database, so the supervisor stopped starting the server. ` +
              `The office was down for ${seconds}, from the refusal until the server answered again. ` +
              `The refusal's first line was:\n\n${refusal}`,
          },
        }),
        signal: AbortSignal.timeout(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN),
      })
      if (!filed.ok) throw new Error(`the office answered ${String(filed.status)}`)
      theRefusal = null
      theOfficeWentDownAt = 0
      theLastGuardRefusal = null
      theLocksBetweenRefusalAndAnswer = []
      forgetTheRefusal(root)
      say(theServiceLockRefusedALaterStart
        ? '[dev] the guard refusal, the service-lock refusal after it, and this server’s answer were filed in the office as one note.'
        : '[dev] the refusal, and the time the office was down, were filed in the office as one note.')
      return true
    } catch (err) {
      say(
        `[dev] the refusal could not be filed in the office (${err instanceof Error ? err.message : String(err)}); ` +
          `it is still in ${THE_REFUSAL_FILE} and in this log.`,
      )
      return false
    }
  }

  /**
   * ASK THE SERVER WHETHER IT IS ANSWERING, AND ONLY THEN CLEAR THE RUN OF FAILED STARTS.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `7-lQDWANdVAn`. The supervisor used to call a run good when it had merely stayed alive
   * for ten seconds. A server that is still on its way up is alive too, and on 12 September 2026
   * the start guard reached its refusal after 14.9 seconds: every attempt crossed the ten-second
   * line, the count restarted at zero, and the same refusal printed "1 in a row" fifty times with
   * the back-off never growing. The clock measured the wrong thing; the server answering is the
   * thing that says a start worked.
   *
   * IT ASKS AGAIN WHILE THIS RUN IS STILL THE CURRENT ONE, so a slow but healthy start — a real
   * database check can take seconds — is not held against. The check stops the moment the child it
   * is about is replaced or the supervisor is stopping, so a crash loop spawns no more than one.
   *
   * @param {import('node:child_process').ChildProcess} thisRun the child this check is about
   * @returns {Promise<void>}
   */
  const seeWhetherThisRunAnswered = async (thisRun) => {
    if (stopping || weAreStoppingTheChild || thisRun !== child) return
    // THE ASKING ENDS AT THE LIMIT, so the limit is when the stand-in answers, not a round later.
    const left = theTimeLeftToAnswer
    const answered = await theServerAnswers(apiAddress, Math.max(1, Math.min(clocks.goodRun, left())), clocks)
    if (stopping || weAreStoppingTheChild || thisRun !== child) return
    if (!answered && left() === 0) {
      await stopAServerThatDoesNotAnswer(thisRun)
      return
    }
    if (!answered) {
      theGoodRunTimer = setTimeout(() => {
        theGoodRunTimer = null
        void seeWhetherThisRunAnswered(thisRun)
      }, Math.min(clocks.goodRun, left()))
      theGoodRunTimer.unref?.()
      return
    }
    theGoodRunTimer = null
    // A SERVER THAT IS ANSWERING IS NOT ONE WHOSE MIGRATION IS STILL PENDING: the guard served the
    // database, so the look for a landing has nothing left to do, whichever restart brought this
    // server up. Stopping it here keeps it from starting a healthy server again on its next tick.
    stopTheMigrationLook()
    const wasFailing = failuresInARow >= theFailedStartsBeforeSaying()
    failuresInARow = 0
    stopsForNotAnsweringInARow = 0
    replacedBeforeAnAnswerWasSeen = 0
    failingSince = 0
    if (wasFailing) {
      forgetTheTrouble(root)
      say('[dev] the server is answering, so the run of failed starts is over.')
    }
    takeBackTheLockRefusal()
    if (theRefusal !== null) {
      const filed = await fileTheNoteAboutTheRefusal()
      if (!filed && !stopping && !weAreStoppingTheChild && thisRun === child) {
        theGoodRunTimer = setTimeout(() => {
          theGoodRunTimer = null
          void seeWhetherThisRunAnswered(thisRun)
        }, clocks.goodRun)
        theGoodRunTimer.unref?.()
      }
    }
  }

  /**
   * A SERVER HAS SAID ITS MIGRATIONS BEGAN: THE STAND-IN ANSWERS BESIDE IT, AND THE BOUND IS ARMED.
   *
   * Check `m5X4lu3B2F7L`. A server running its migrations takes nothing from the queue, and before
   * this a read waited there with no answer for as long as they ran, and for ever when they never
   * ended. Now the stand-in answers every read with 503 and says the office is migrating. The
   * server has not opened its listener yet, so the two do not split the queue. If the server opens
   * it before it says the migrations ended, each read is still answered, by one or the other.
   *
   * The bound counts every migration in this run together, so a server that says they began and
   * ended over and over cannot use the line to put off its limit for ever.
   *
   * @param {import('node:child_process').ChildProcess} thisRun
   */
  const theMigrationsBegan = (thisRun) => {
    theMigrationBeganAt = Date.now()
    const group = String(thisRun.pid)
    const bound = Math.round(theMigrationLimit / 100) / 10
    startTheStandIn(
      `The server in process group ${group} is running its migrations and answers nothing until they finish. ` +
        `serve-dev stops it if they have not finished within ${String(bound)}s.`,
      true,
    )
    if (standIn !== null) theStandInIsAboutTheMigrations = true
    stopTheMigrationBound()
    theMigrationBound = setTimeout(() => {
      theMigrationBound = null
      void stopAServerThatDoesNotAnswer(thisRun, 'migrations')
    }, Math.max(0, theMigrationLimit - migratedFor))
    theMigrationBound.unref?.()
  }

  /** The server has said its migrations ended: the bound stops, and so does the stand-in, so the server takes the queue. */
  const theMigrationsEnded = () => {
    migratedFor += Date.now() - theMigrationBeganAt
    theMigrationBeganAt = 0
    stopTheMigrationBound()
    if (theStandInIsAboutTheMigrations) void stopTheStandIn({ untilItListens: false })
  }

  const stopTheMigrationBound = () => {
    if (theMigrationBound === null) return
    clearTimeout(theMigrationBound)
    theMigrationBound = null
  }

  /**
   * THE STOPS SO FAR, IN WORDS THAT SAY WHAT HAPPENED. "In a row" only when no restart replaced a
   * server between them. Otherwise the stops are counted since serve-dev last saw a server answer,
   * and a second sentence says how many servers a restart replaced before serve-dev had seen whether
   * they answered.
   *
   * @returns {{ count: string, between: string }}
   */
  const theStopsSoFar = () => {
    const stops = String(stopsForNotAnsweringInARow)
    const replaced = replacedBeforeAnAnswerWasSeen
    if (replaced === 0) return { count: `That is ${stops} servers in a row stopped for not answering`, between: '' }
    return {
      count: `That is ${stops} servers stopped for not answering since serve-dev last saw a server answer`,
      between: ` Between those stops a restart replaced ${replaced === 1 ? '1 other server' : `${String(replaced)} other servers`} ` +
        `before serve-dev had seen whether ${replaced === 1 ? 'it' : 'they'} answered.`,
    }
  }

  /**
   * A SERVER THAT IS ALIVE AND HAS NOT ANSWERED WITHIN ITS TIME IS TREATED AS A CRASH.
   *
   * Check `qCP4OR2YDwvZ`, path 2: a new server that stayed alive and never listened left the queue
   * with nobody taking from it and no limit, because this check only asked again. Now the stand-in
   * answers first, with the reason, then the server's group is stopped, and the next start waits
   * out the backoff as after any crash. No new server starts until this one has exited, so its
   * worker has gone too. If it will not exit, `restart`'s own refusal to start beside it applies.
   *
   * It runs as a restart does, so a restart asked for meanwhile waits for it and then runs at once.
   *
   * AT THE THIRD STOP IN A ROW IT STARTS NO NEW SERVER (message DXXb8QZ_9EfG). Starting the
   * same server again would only repeat the wait. The stand-in says so and that the operations
   * secretary is to look. A changed file still restarts it, and a server that answers ends the run.
   *
   * A SERVER WHOSE MIGRATIONS RAN PAST `theMigrationLimit` IS STOPPED HERE TOO (check
   * `m5X4lu3B2F7L`), and no new server starts until a file changes, at the first such stop: a new
   * server would run the same migrations. Stopping one is safe for the owner's database, because a
   * start migrates in place only a database that is empty or holds nothing but the seed
   * (`prepareToServe`); on any other it only reads, and measures the migrations on a copy.
   *
   * @param {import('node:child_process').ChildProcess} thisRun
   * @param {'answer' | 'migrations'} [because] what it did not do in time
   * @returns {Promise<void>}
   */
  const stopAServerThatDoesNotAnswer = async (thisRun, because = 'answer') => {
    if (restarting || stopping || thisRun !== child) return
    restarting = true
    try {
      const within = Math.round(theAnswerLimit / 100) / 10
      const group = String(thisRun.pid)
      failuresInARow += 1
      if (failingSince === 0) failingSince = Date.now()
      if (theMigrationBeganAt !== 0) {
        migratedFor += Date.now() - theMigrationBeganAt
        theMigrationBeganAt = 0
      }
      const bound = Math.round(theMigrationLimit / 100) / 10
      theLastExit = because === 'migrations'
        ? `the server in group ${group} did not finish its migrations within ${String(bound)}s`
        : `the server in group ${group} did not answer within ${String(within)}s of its start`
      // Each server stopped here meets one of the two gates, with the whole seconds it was given.
      if (because === 'migrations') spoolAGateMet('migrations-have-to-finish-within', String(theMigrationLimit / 1000))
      else spoolAGateMet('a-new-server-has-to-answer-within', String(theAnswerLimit / 1000))
      stopsForNotAnsweringInARow += 1
      const givingUp = because === 'migrations' || stopsForNotAnsweringInARow >= THE_STOPS_BEFORE_GIVING_UP
      const waitFor = theBackoffAfter(failuresInARow, clocks)
      const fact = because === 'migrations'
        ? `The server in process group ${group} has run its migrations for ${String(bound)}s and has not finished ` +
          'them, so serve-dev is stopping it and starts no new server until a file the server is built from ' +
          'changes, because a new server would run the same migrations. The operations secretary is to look at ' +
          'why the migrations did not finish.'
        : givingUp
        ? `The server in process group ${group} did not answer within ${String(within)}s of its start, not counting ` +
          `its migrations. ${theStopsSoFar().count}, ` +
          'so serve-dev is stopping this one and starts no new server until a file the server is built from ' +
          `changes.${theStopsSoFar().between} The operations secretary is to look at why the server does not answer.`
        : `The server in process group ${group} did not answer within ${String(within)}s of its start, not counting ` +
          `its migrations, so serve-dev is stopping it and starts it again in ` +
          `${String(Math.round(waitFor / 100) / 10)}s, once it has exited.`
      say(`[dev] ${fact}`)
      startTheStandIn(fact, true)
      const stopped = await stopTheChild(true)
      if (stopping) return
      sayItOutLoudIfThisIsALoop()
      if (!stopped) await theChildCouldNotBeStopped()
      if (givingUp) return
      backingOff = setTimeout(() => {
        backingOff = null
        const next = anotherRestartWanted ?? { reason: `the previous run did not answer within ${String(within)}s` }
        anotherRestartWanted = null
        void restart(next.reason)
      }, waitFor)
    } finally {
      restarting = false
    }
    // A change made while this ran is a person's act, and it restarts now whatever the backoff says.
    if (anotherRestartWanted !== null && !stopping) {
      const next = anotherRestartWanted
      anotherRestartWanted = null
      void restart(next.reason, next.look)
    }
  }

  /**
   * SAY THAT A SERVER COULD NOT BE STOPPED, and let the stand-in say it on the port.
   *
   * Check `qCP4OR2YDwvZ`, path 1: an old server still alive after SIGTERM and SIGKILL kept its place,
   * so no stand-in started and a request waited on the queue until its own time ran out. No second
   * server is started beside it, so there is never a second worker. The words say what is true:
   * serve-dev looks again and does not promise that the server will come back. A stand-in already
   * answering with an earlier reason is replaced, so the port says this and not that.
   *
   * @returns {Promise<void>}
   */
  const theChildCouldNotBeStopped = async () => {
    const group = child === null || child.pid === undefined ? 'unknown' : String(child.pid)
    const fact =
      `The server in process group ${group} is still running after SIGTERM, which gave it ` +
      `${String(clocks.serverStop / 1000)}s to stop, and SIGKILL, so serve-dev has started no new server. It looks again at most ` +
      `${String(clocks.longestBackoff / 1000)}s apart, and starts a new server only after that one has exited. ` +
      `If it does not exit, the operations secretary has to stop process group ${group}, and no new server ` +
      'starts until it has exited. A process still running after SIGKILL is usually stuck in the kernel.'
    if (standIn !== null && theStandInSays !== fact) await stopTheStandIn()
    if (stopping) return
    startTheStandIn(fact, true)
  }

  const restart = async (/** @type {string} */ reason, /** @type {StartLook} */ look = null) => {
    if (stopping) return
    const lockStopsAStart = theServiceLockLook !== null ? theServiceLockStillStopsAStart() : false
    if (lockStopsAStart) {
      if (!theChangeWhileLockedWasSaid) {
        theChangeWhileLockedWasSaid = true
        // 5DLbHt7Fq3ce, invariant 3: an unreadable lock or start time is no evidence of a live holder.
        say(lockStopsAStart === 'held'
          ? '[dev] a watched file changed while another server holds the database. serve-dev started no second server and will keep looking for the service lock to be free.'
          : '[dev] a watched file changed while the supervisor cannot tell whether the service lock is free. serve-dev started no second server and will keep looking for the service lock to be free.')
      }
      return
    }
    /**
     * ONE RESTART AT A TIME. A second one asked for while this is running is folded into it: the
     * reason is kept and one more restart follows. Two running side by side spawned two servers.
     */
    if (restarting) {
      anotherRestartWanted = { reason, look }
      return
    }
    restarting = true
    try {
      let now = { reason, look }
      for (;;) {
        if (backingOff !== null) {
          clearTimeout(backingOff)
          backingOff = null
        }
        // A WRITE INTO THE LEDGER STILL ON ITS WAY IS WAITED FOR, because it goes through the server
        // this is about to stop. Stopped in the middle, the rest of the write went to the port, the
        // stand-in answered it 503 while the next server ran its migrations, and the failed write
        // ended startup with this supervisor's own server stopped. Each call has its own deadline,
        // so the wait ends. A WRITE WAITING TO TRY AGAIN IS NOT WAITED FOR: its next try reads the
        // ledger first, through whichever server is there. A write the office refused is ending
        // startup, and the ordinary stop marks the session finished through this same server before
        // it stops it, so then this does nothing.
        if (theLedgerWrite !== null && endTheLedgerWait === null) {
          await Promise.race([theLedgerWrite, new Promise((done) => { whenTheLedgerWriteWaits.push(() => done(undefined)) })])
        }
        if (theLedgerWriteWasRefused) return
        if (stopping) return
        const replacing = child
        const stopped = await stopTheChild()
        if (stopping) return
        if (stopped && replacing !== null && stopsForNotAnsweringInARow > 0) replacedBeforeAnAnswerWasSeen += 1
        if (!stopped) {
          failuresInARow += 1
          if (failingSince === 0) failingSince = Date.now()
          sayItOutLoudIfThisIsALoop()
          await theChildCouldNotBeStopped()
          if (stopping) return
          backingOff = setTimeout(() => {
            backingOff = null
            const next = anotherRestartWanted ?? now
            anotherRestartWanted = null
            // A backoff, rather than a look, made this attempt.
            void restart(next.reason)
          }, theBackoffAfter(failuresInARow, clocks))
          return
        }
        restarts += 1
        say(`[dev] restarting the server: ${now.reason}`)
        // THE SET IS WALKED AGAIN AFTER EVERY RESTART, so a file that has just been imported for the
        // first time is watched from now on. It could not have been in the set before, because the
        // server was not built from it before. THE WATCHES ARE RE-ARMED with it, so a directory that
        // stopped being watched for any reason is watched again from here. The page's set is walked
        // with it, so a file the page has just started importing is watched too.
        walkTheSet()
        armTheWatches(theFilesToWatch())
        await stopTheStandIn()
        if (stopping) return
        start(now.reason, now.look)
        if (anotherRestartWanted === null) return
        now = anotherRestartWanted
        anotherRestartWanted = null
      }
    } finally {
      restarting = false
    }
  }

  /** Stop the look for a landed migration, if this supervisor has one running. */
  const stopTheMigrationLook = () => {
    if (theMigrationLook === null) return
    clearInterval(theMigrationLook)
    theMigrationLook = null
  }

  /**
   * ONE READ OF WHETHER THE MIGRATION HAS LANDED, and the only thing that starts the server after a
   * `REFUSING TO SERVE`.
   *
   * The guard refused because the database is behind the code, and starting the server again cannot
   * change that. `theDatabaseBehindTheCode` reads the fact that DOES change when a migration is run,
   * so this clock is the way out that needs no file change and no person — problem `nxDRPQ0IZcOU`.
   *
   * IT NEVER STARTS THE SERVER ON A GUESS. A database whose file or journal table cannot be read
   * answers `unreadable`, and the look says so once and waits for the next tick. The server is
   * started only when the newest applied migration is at least the newest one the code has.
   * Inspector refusal fB2IAu88rCm0, invariant 1: the guard knows more than these journal numbers,
   * so a refusal from this start stops the look rather than claiming another migration will fix it.
   */
  const lookForTheLandedMigration = () => {
    if (stopping) return
    /** @type {{ behind: boolean, missing: string[] } | { unreadable: string }} */
    let reading
    try {
      reading = theDatabaseBehindTheCode({ database: resolved.databasePath, checkout: root })
    } catch (err) {
      reading = { unreadable: err instanceof Error ? err.message : String(err) }
    }
    if ('unreadable' in reading) {
      if (theMigrationLookUnreadable === reading.unreadable) return
      theMigrationLookUnreadable = reading.unreadable
      say(
        `[dev] the supervisor cannot yet tell whether the migration has landed: ${reading.unreadable}. ` +
          'It will keep looking, and it will not start the server on a guess.',
      )
      return
    }
    if (reading.behind) return
    stopTheMigrationLook()
    say(`[dev] the migration landed at ${localStampOf(new Date())}, starting the server again.`)
    void restart('the migration landed, starting again', 'migration')
  }

  /**
   * BEGIN THE LOOK. Called only when the guard's refusal was `REFUSING TO SERVE`; every other guard
   * refusal is not retried, because waiting cannot change a damaged database or somebody else's.
   */
  const startTheMigrationLook = () => {
    if (theMigrationLook !== null) return
    theMigrationLook = setInterval(lookForTheLandedMigration, clocks.migrationLook)
    theMigrationLook.unref?.()
  }

  const stopTheServiceLockLook = () => {
    if (theServiceLockLook === null) return
    clearInterval(theServiceLockLook)
    theServiceLockLook = null
  }

  /**
   * Invariant 3: a lock read as free or this server's answer takes back the lock's refusal.
   * Neither observation proves the guard's note was filed. Restore its refusal before filing
   * so a failed filing leaves the sentence its log line says is still in the file.
   */
  const takeBackTheLockRefusal = () => {
    if (theLockRefusal === null) return
    theLockRefusal = null
    if (theLastGuardRefusal !== null) {
      const written = writeTheRefusal(root, theLastGuardRefusal)
      if ('failed' in written) say(`[dev] ${THE_REFUSAL_FILE} could not be written: ${written.failed}`)
    } else {
      forgetTheRefusal(root)
    }
  }

  /**
   * A bounded read on each tick, through wave 13t's own process reading. An unreadable lock or
   * start time is unknown, so keep waiting and say why once. Gone and reused processes mean stale
   * locks; the server takes those over itself. No process belonging to the holder is signalled.
   */
  const theServiceLockStillStopsAStart = () => {
    const reading = readTheServiceLock(resolved.serviceLockPath)
    const holder = reading.state === 'read' ? whoHoldsTheLock(reading.lock, theProcessReading) : null
    if (reading.state === 'absent' || holder?.state === 'gone' || holder?.state === 'reused') {
      stopTheServiceLockLook()
      theChangeWhileLockedWasSaid = false
      theServiceLockLookUnreadable = null
      takeBackTheLockRefusal()
      return false
    }
    const unknown = reading.state === 'unreadable' ? reading.why
      : holder?.state === 'cannot-tell' ? 'the holder’s process start time could not be read' : null
    if (unknown !== null && unknown !== theServiceLockLookUnreadable) {
      theServiceLockLookUnreadable = unknown
      say(`[dev] the supervisor cannot yet tell whether the service lock is free: ${unknown}. It will keep looking, and it will not start the server on a guess.`)
    }
    return unknown === null ? 'held' : 'unknown'
  }

  /** g_icMYOZxkQZ: one unref'd look, stopped before the one start and on supervisor stop. */
  const startTheServiceLockLook = () => {
    if (theServiceLockLook !== null) return
    theServiceLockLook = setInterval(() => {
      if (stopping || theServiceLockStillStopsAStart()) return
      say('[dev] the service lock is free, starting the server again.')
      void restart('the service lock is free, starting again', 'service-lock')
    }, clocks.serviceLockLook)
    theServiceLockLook.unref?.()
  }

  /**
   * REBUILD THE PAGE, AND NEVER TOUCH THE API.
   *
   * S1: a change to a file the page is built from rebuilds the page and does not restart the API.
   * This is one action at a time, exactly as `restart` is and for the same measured reason: a
   * `git checkout` rewrites many files in a few milliseconds, and the collecting window folds them
   * into one rebuild. A rebuild asked for while one is running is folded into it.
   */
  const rebuild = async (/** @type {string} */ reason) => {
    if (stopping) return
    if (rebuilding) {
      anotherRebuildWanted = reason
      return
    }
    rebuilding = true
    try {
      let now = reason
      for (;;) {
        rebuilds += 1
        say(`[dev] rebuilding the page: ${now}`)
        const outcome = await buildThePage({ root, say })
        if (outcome.ok) {
          theFileLastNotedAsFailing = null
          say('[dev] the page was rebuilt. The API was not restarted.')
        } else {
          const named = outcome.file ?? 'a file the build did not name'
          say(`[dev] the page build failed on ${named}. The last good build is still being served.`)
          await fileANoteAboutTheFailedBuild(outcome.file, outcome.output)
        }
        if (stopping) return
        if (anotherRebuildWanted === null) return
        now = anotherRebuildWanted
        anotherRebuildWanted = null
      }
    } finally {
      rebuilding = false
    }
  }

  /**
   * THE SLOW CHECK: is a file on disk newer than the server that is running?
   *
   * The watches are how a change is noticed, and a supervisor with nothing but watches cannot
   * notice that a watch missed something. This reads the disk instead. It runs only when there is a
   * server up and nothing else is already in hand — no restart running, no collecting window open,
   * no backoff waiting — so it never speaks over a restart that is already coming.
   */
  const lookForAChangeNobodySaw = () => {
    if (stopping || restarting || child === null || collecting !== null || backingOff !== null) return
    let newest = null
    try {
      for (const entry of THE_PROGRAMS_RESTARTED_WITH_THE_SERVER) {
        const reading = newestSourceBuiltFrom(entry, root)
        if (reading !== null && (newest === null || reading.at > newest.at)) newest = reading
      }
    } catch (err) {
      say(`[dev] WARNING: the files the server is built from could not be read (${String(err)}), so a change that ` +
        'was missed will not be found by the clock. The watches are still running.')
      return
    }
    const reason = aChangeNobodySaw(newest, startedAt)
    if (reason === null) return
    say(`[dev] a change was made that no watch reported, and the minute clock found it: ${reason}`)
    void restart(reason)
  }

  walkTheSet()
  armTheWatches(theFilesToWatch())
  say(
    `[dev] watching ${String(theSet.size)} files the API server and message worker are built from` +
      (built ? ` and ${String(thePageSet.size)} the page is built from` : '') +
      `, through ${String(watchedDirectories.length)} directories, and restarting the server, or rebuilding the ` +
      'page, when one of them changes.',
  )
  /**
   * STOP THE SERVER BY ITS GROUP, AND THE WATCHES, THE REDIRECT, THE STAND-IN AND THE SOCKET.
   *
   * DEFINED BEFORE THE FIRST START, because it is handed over there (`whenItCanStop`): from that start
   * on, a server runs in a process group of its own, and nothing but this ends it.
   */
  // Startup's catch and a signal can arrive together. Both await one cleanup, which writes the
  // session's end and signals the child once.
  /** @type {Promise<void> | null} */
  let theStop = null
  const stop = () => (theStop ??= stopOnce())
  const stopOnce = async () => {
    stopping = true
    if (collecting !== null) clearTimeout(collecting)
    if (backingOff !== null) clearTimeout(backingOff)
    if (theGoodRunTimer !== null) clearTimeout(theGoodRunTimer)
    if (theSlowCheck !== null) clearInterval(theSlowCheck)
    stopTheMigrationLook()
    stopTheServiceLockLook()
    collecting = null
    backingOff = null
    theGoodRunTimer = null
    theSlowCheck = null
    for (const one of watches) one.close()
    watches = []
    if (redirect !== null) {
      await redirect.close()
      redirect = null
    }
    // THE FILE GOES WITH THE SUPERVISOR THAT WROTE IT. It says a supervisor cannot start a server;
    // a supervisor that has stopped is not failing to start one, and a leftover would be read as
    // a fault on a machine where there is none.
    forgetTheTrouble(root)
    // A WRITE INTO THE LEDGER STILL ON ITS WAY IS WAITED FOR, so the row it makes is marked finished
    // below. Each call and body now has its own deadline. Stop also bounds the whole pending write,
    // which may span several calls, and retains any session already acknowledged in the meantime.
    // A WAIT BETWEEN TWO TRIES ENDS NOW, and the write makes no further call once it is stopping.
    endTheLedgerWait?.()
    if (theLedgerWrite !== null) {
      const finished = await Promise.race([theLedgerWrite.then(() => true), wait(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN).then(() => false)])
      if (!finished) {
        say(
          `[dev] the write of this supervisor into the ledger had not finished after ${String(AN_OFFICE_CALL_HAS_TO_ANSWER_WITHIN / 1000)}s, ` +
            'so the stop went on with any session already acknowledged. Write completion is uncertain; a ledger row may already exist.',
        )
      }
    }
    // BEFORE THE SERVER IS STOPPED, because the ledger this writes to is the database that server
    // has open. After it, there is nothing to write to.
    if (sessionRecordId !== null) {
      try {
        await sayThisSupervisorHasFinished(apiAddress, resolved.workspace, sessionRecordId, registrationDetail)
      } catch (err) {
        say(
          `[dev] this supervisor could not mark its own session finished (${String(err)}). Its ledger row ` +
            'will read as owned by a session still said to be running, which it is not.',
        )
      }
      // AND THE WORLD THIS SERVER SERVES, at the office, for the same reason and in the same window:
      // the office is a table in the database the server about to be stopped has open.
      say(`[dev] ${await sayThisWorldHasEnded(apiAddress, resolved.workspace)}`)
    }
    await stopTheChild()
    await stopTheStandIn()
    // AND THE SOCKET LAST, so a request made while the server was stopping waited for an answer
    // rather than being refused. Once this closes, the port is free.
    if (theSocket !== null) {
      theSocket.close()
      theSocket = null
    }
  }

  // A RUN OF FAILED STARTS BELONGS TO THE SUPERVISOR THAT IS FAILING. This one has not failed yet,
  // so a file left by a previous supervisor is not this one's and is taken back before it starts.
  // THE REFUSAL FILE IS THE SAME: it says a supervisor is not starting a server, and this one has
  // not refused anything yet, so a leftover from a previous run is not this one's to show.
  forgetTheTrouble(root)
  forgetTheRefusal(root)
  // THE SOCKET IS HELD FROM HERE TO `stop`, after the orphan check above has had the port to itself
  // and after the last refusal that can end this function. `holdThePort` says why.
  theSocket = holdThePort(port)
  // `stop` IS HANDED OVER BEFORE THE FIRST START, and not only with the answer. The answer comes once
  // the server answers and this has been written into the ledger. Until 27 October 2026 a signal before
  // then ended this process by Node's default action and left the server running (problem `PxkI-3Fv2cIw`).
  options.whenItCanStop?.(stop)
  start('the first start')

  /**
   * THE OLD DEVELOPMENT ADDRESS REDIRECTS TO THE BUILT OFFICE, and only in the built mode.
   *
   * A port already in use is a refusal that says so and nothing else: the usual holder is the dev
   * server this mode replaces, and taking the port from it would be the race this project has
   * already paid for. See `startTheOneLineRedirect`.
   */
  if (built) {
    const started = await startTheOneLineRedirect({ webPort, apiPort: port, say })
    if (started.started) {
      redirect = { close: started.close }
    } else {
      say(`[dev] ${started.why}`)
    }
  }

  const slowCheck = theSlowCheckEvery()
  if ('off' in slowCheck) {
    say(`[dev] ${slowCheck.off}`)
  } else {
    say(
      `[dev] every ${String(slowCheck.every / 1000)}s it also compares the files on disk with the running server, ` +
        'so a change no watch reported is found rather than waited for for ever.',
    )
  }
  let lastCheck = Date.now()
  theSlowCheck = setInterval(() => {
    const now = theSlowCheckEvery()
    if ('off' in now || Date.now() - lastCheck < now.every) return
    lastCheck = Date.now()
    lookForAChangeNobodySaw()
  }, 1000)
  theSlowCheck.unref?.()

  if (options.writeItDown !== false) {
    // THE LEDGER IS IN THE DATABASE THE SERVER HAS OPEN, so there is nothing to write to until the
    // server is answering. The wait is bounded: a server that has not started in a minute is being
    // worked on, and this says so rather than waiting for ever.
    // A MIGRATION EXTENDS THE WAIT as it extends the limit, so a long one does not leave this unwritten.
    while (!(await theServerAnswers(apiAddress, Math.max(1, Math.min(clocks.goodRun, theTimeLeftToAnswer())), clocks))) {
      if (stopping || theTimeLeftToAnswer() === 0) break
    }
  }
  // A STOP THAT CAME DURING THAT WAIT WRITES NOTHING: the rows would say a supervisor runs that is going.
  if (options.writeItDown !== false && !stopping) {
    const writing = writeThisSupervisorIntoTheLedger({
      apiAddress, workspace: resolved.workspace, port, root, say,
      whenSessionIsFiled: (id) => {
        // BEFORE THE RESOURCE POST, so stop can finish this session even while that write is pending.
        sessionRecordId = id
        registrationDetail = 'Resource registration did not finish; its write completion is uncertain and a resource row may already exist.'
      },
      whenTheRowIsWritten: (detail) => { registrationDetail = detail },
      whenRefused: () => { theLedgerWriteWasRefused = true },
      stillWanted: () => !stopping,
      pause: (ms) => new Promise((done) => {
        const over = () => {
          clearTimeout(timer)
          endTheLedgerWait = null
          done(undefined)
        }
        const timer = setTimeout(over, ms)
        endTheLedgerWait = over
        for (const one of whenTheLedgerWriteWaits.splice(0)) one()
      }),
    }).then(async (written) => {
      if (!('refused' in written) || sessionRecordId === null || registrationDetail === null) return written
      registrationDetail += ` ${written.refused}`
      try {
        await patchThisSupervisorsSession(apiAddress, resolved.workspace, sessionRecordId, { detail: registrationDetail })
        return written
      } catch (err) {
        return { refused: `${written.refused}; the session detail could not be updated (${String(err)}), and that update's completion is uncertain` }
      }
    }).finally(() => {
      theLedgerWrite = null
      for (const one of whenTheLedgerWriteWaits.splice(0)) one()
    })
    theLedgerWrite = writing
    const written = await writing
    if ('refused' in written) {
      const failure = `[dev] this supervisor could not write itself into the ledger of what is running (${written.refused}). ` +
        'The office refused it, so startup is ending and its child will be stopped.'
      // Signal stop may already be waiting for this same write and owns the command's exit.
      if (!stopping) throw new Error(failure)
      say(failure)
    } else if ('stopped' in written) {
      say(`[dev] ${written.stopped}`)
    } else {
      say(theSupervisorsStartupIsDone(process.pid, port))
    }
    /**
     * AND A FAILED FIRST BUILD IS FILED NOW, because the office it is filed in did not exist when
     * the build failed. It is the same note a failed rebuild files, from the same function.
     */
    if (aBuildThatFailedBeforeTheStart !== null) {
      await fileANoteAboutTheFailedBuild(aBuildThatFailedBeforeTheStart.file, aBuildThatFailedBeforeTheStart.output)
      aBuildThatFailedBeforeTheStart = null
    }
  }

  return {
    stop,
    restartsSoFar: () => restarts,
    watching: () => [...watchedDirectories],
    rebuildsSoFar: () => rebuilds,
    redirect: () => (redirect === null ? null : webPort),
  }
}

/** @param {number} ms */
function wait(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

/**
 * THE PROCESS GROUP THIS SUPERVISOR IS IN, so the file it writes can say what stopping it signals.
 *
 * Read out of `/proc/self/stat`, field five. Node has no call for it. A machine with no `/proc`
 * answers with this process's own id, which is what its group is whenever it is a group leader —
 * and that is what `setsid node tools/serve-dev.mjs` makes it.
 *
 * @returns {number}
 */
function theGroupThisSupervisorIsIn() {
  try {
    const stat = readFileSync('/proc/self/stat', 'utf8')
    const after = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
    const pgrp = Number(after[2])
    return Number.isInteger(pgrp) && pgrp > 0 ? pgrp : process.pid
  } catch {
    return process.pid
  }
}

/**
 * Wait until the API on this address answers, or until the time is up.
 *
 * @param {string} apiAddress
 * @param {number} within milliseconds
 * @param {Pick<SupervisorClocks, 'healthRequest' | 'healthRetry'>} clocks
 * @returns {Promise<boolean>} whether it answered
 */
async function theServerAnswers(apiAddress, within, clocks) {
  const until = Date.now() + within
  while (Date.now() < until) {
    try {
      const reply = await fetch(`${apiAddress}/api/health`, { signal: AbortSignal.timeout(clocks.healthRequest) })
      if (reply.status < 500) return true
    } catch {
      // Not up yet. The loop's own clock is what ends this, not a count of failures.
    }
    await wait(clocks.healthRetry)
  }
  return false
}

// ------------------------------------------------------------------------------------ the command

// Windows gives this path with `\`. Read as it was given there, it never ended in tools/serve-dev.mjs, so the command
// ended with exit code 0 and had done nothing (wave 13t, round W9, on a Windows 11 machine).
if (process.argv[1] !== undefined && process.argv[1].replaceAll('\\', '/').endsWith('tools/serve-dev.mjs')) {
  /**
   * EVERY WAY OUT STOPS THE SERVER WITH IT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `5ZHmJ4_C26Y8`. The server runs in a process group of its own, which is what makes it
   * stoppable in one signal — and also what stops `kill -TERM -<the supervisor's group>` from
   * reaching it. A supervisor stopped that way leaves the server running: systemd adopts it, it
   * keeps the live office's port, and every replacement supervisor refuses the port and exits. The
   * API is then off the air until somebody finds the child's group by hand.
   *
   * THREE SIGNALS, because all three end this process and all three left a server behind:
   * SIGTERM is what a `kill` sends, SIGINT is Ctrl-C, and SIGHUP is what a terminal sends the
   * things it started when it closes.
   *
   * THE HANDLERS COME BEFORE THE START, not after it. `serveDev` hands its `stop` over before it
   * starts the first server, and answers only once that server answers and this supervisor is in
   * the ledger. Until 27 October 2026 the handlers were installed after that answer, so a stop
   * sent during the start ended this process by Node's default action and left the server running
   * (problem `PxkI-3Fv2cIw`). A signal before the hand-over still ends this process that way, and
   * that is right: nothing outside this process group has been started yet.
   *
   * SIGKILL RUNS NO HANDLER AT ALL, so nothing here can cover it. The half that does is in the
   * child: it is started with `--stop-with-pid=<this process>` and shuts down within a second or
   * two of this process being gone, whatever ended it.
   *
   * ONE STOP, however many signals arrive. A second Ctrl-C used to start a second `stop`, and the
   * two then raced to signal the same group.
   */
  /** @type {(() => Promise<void>) | null} */
  let stopIt = null
  let goingAlready = false
  const bye = (/** @type {NodeJS.Signals} */ signal) => {
    if (goingAlready) return
    goingAlready = true
    if (stopIt === null) {
      process.removeAllListeners(signal)
      process.kill(process.pid, signal)
      return
    }
    process.stdout.write(`[dev] ${signal} received. Stopping the server it started, by its group, and then this.\n`)
    void stopIt().then(() => {
      process.exit(0)
    })
  }
  for (const signal of /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])) {
    process.on(signal, () => {
      bye(signal)
    })
  }
  try {
    // A DEVELOPMENT CHECKOUT WHOSE .env NAMES THE STABLE CHECKOUT does not serve the office's database (wave 13q, part
    // d). npm start, serve and dev:server are refused here, before a build or a server starts, with the way to start it.
    const refusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
    if (refusal !== null) throw new Error(withTheWayForThisJob(refusal))
    // A stable upgrade that closed this database and did not finish leaves a mark beside it (src/config/the-upgrade-mark.mjs).
    const marked = whyAnUpgradeKeepsTheOfficeClosed(settings().databasePath, theStableCheckoutNamedIn(), undefined)
    if (marked !== null) throw new Error(marked)
    // `--built` is what `npm run serve` passes: build the page, serve it from the API in production,
    // rebuild it on a page change and restart the API on a server change. Without the flag this is
    // the development supervisor, unchanged. `--prepared` needs `--built`: it serves the page
    // already in dist/web, checked against this checkout, and skips only the first build.
    await serveDev({
      built: process.argv.includes('--built'),
      prepared: process.argv.includes('--prepared'),
      whenItCanStop: (stop) => {
        stopIt = stop
      },
    })
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    const stop = /** @type {(() => Promise<void>) | null} */ (stopIt)
    if (stop !== null) await stop()
    process.exit(1)
  }
}
