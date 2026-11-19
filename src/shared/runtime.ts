// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RUNNING MOLE OFFICE IS: the shape both halves of the product read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G2 of design/ground/ACCEPTANCE.md, from the owner's problem 21:
 *
 *     Mole Office must be able to identify the canonical current runtime: server; PID/PGID; port;
 *     repository; database path; current HEAD/build identity; who started it; safe-to-manage
 *     state; scratch vs canonical; stale/live state.
 *
 * The state to prevent: a real API and a scratch API side by side, a browser still pointing at the
 * scratch database, and health checks that appear green. Every one of those is a fact about a
 * running process that nothing could ask for.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULES THIS SHAPE FOLLOWS
 * ---------------------------------------------------------------------------------------
 *
 * 1. **Nothing here is cached.** Every field is read when the request arrives. A remembered pid or
 *    a remembered database is a fact that goes stale silently, which is the whole subject.
 * 2. **What could not be read is named, with the reason.** `couldNotRead` is part of the reply and
 *    not an error path. An empty list means everything was read; it never means "nothing to say".
 *    A field that could not be read is `null`, and `null` here always has a matching entry.
 * 3. **It is types only.** The browser imports this file, so nothing in it may touch the disk. The
 *    reading lives in `src/server/lib/runtime.ts` and G3 and G4 draw what this describes.
 */

import type { DevSaying } from './dev-sayings.ts'
import type { StartCostPanel } from './start-cost.ts'

/** One thing this read could not answer, and why. Absence beats a guess. */
export interface Unreadable {
  /** What was being asked, in plain words: "the checkout's HEAD". */
  what: string
  /** Why it could not be answered, in the words the machine used where there were any. */
  why: string
}

/** The operating-system process answering the request. */
export interface RuntimeProcess {
  pid: number
  /** The process group. A release signals the group, so this is what makes one possible. */
  pgid: number | null
  /** When it started, local wall-clock. Null when the process table could not be read. */
  startedAt: string | null
  /** How long it has been up, in words. Null when the start time is unknown. */
  upFor: string | null
  /** How long it has run, as a code with the count. Null exactly when `upFor` is. */
  upForSaid: DevSaying | null
  /** True when this process is running under a test runner. */
  underTestRunner: boolean
}

/**
 * WHAT IS WATCHING THIS SERVER FOR CHANGES AND WILL RESTART IT, AND WHY IT LAST STARTED.
 *
 * A development server is started by something that watches its code and restarts it. That
 * something is a fact about the running world and nothing could ask for it. Problem `7XK5_FQcvEjl`
 * is what happens when it goes wrong: the watcher quietly stopped watching one file, the server
 * never picked that file up again, and the only reading anybody had was "the server is behind" —
 * with no way to tell a restart that is coming from one that will never come.
 *
 * IT IS READ FROM THE MACHINE, NOT CLAIMED. `kind` and `commandLine` come from the parent process's
 * command line, so a supervisor that has died — leaving the server running with nobody watching it
 * — reads as `nothing that restarts it` rather than as whatever started the server hours ago. The
 * one thing the machine cannot know is WHY this run was started, and that is the one field a
 * supervisor has to say out loud.
 */
/**
 * A RUN OF STARTS THAT ALL FAILED, as the supervisor wrote it down.
 *
 * A supervisor that cannot start a server has nothing to write to — the ledger lives in the
 * database a server holds open — so it writes a file, and this is that file read back. Problem
 * `5ZHmJ4_C26Y8`: on 4 September 2026 a supervisor failed to start a server ninety-six times in a
 * row over forty-seven minutes, and the only trace was one line per failure in a log file nobody
 * had open, while an older server went on answering as though nothing were wrong.
 */
export interface SupervisorFailedStarts {
  /** How many starts in a row have failed. */
  count: number
  /** What the last one ended with, in the supervisor's words: "exit code 1", "signal SIGKILL". */
  lastExit: string
  /** When the run of failures started, local wall-clock. */
  since: string
  /** When the supervisor last wrote this down, local wall-clock. */
  at: string
  /** The last lines the server printed before it went, so the reason is on the same screen. */
  lastOutput: readonly string[]
  /** The supervisor that is failing, and the process group that stopping it signals. */
  supervisor: { pid: number; pgid: number }
  /** The whole reading in one plain sentence, written once in src/config/supervisor-trouble.mjs. */
  says: string
}

/**
 * THE PROCESS THIS SERVER'S PROCESS HANGS OFF, whatever it is.
 *
 * A supervisor and a parent are not the same thing, and until 4 September 2026 they were one field.
 * When the owner's supervisor was stopped and its server survived, the server was adopted by
 * systemd, and `GET /api/runtime` reported `supervisor: { pid: 1, commandLine: "/usr/lib/systemd/
 * systemd --user ..." }`. The sentence beside it said correctly that nothing was watching the
 * server; the fields said the supervisor was systemd. Problem `5ZHmJ4_C26Y8`.
 */
export interface RuntimeParent {
  pid: number
  pgid: number
  commandLine: string
  /** What it is, in a word or two a person can read: `systemd`, `a shell`, `a test runner`. */
  what: string
}

export interface RuntimeSupervisor {
  /** Whether anything above this process restarts it when its code changes. */
  watching: boolean | 'unknown'
  /**
   * Which supervisor it is.
   *
   * `the dev supervisor` is `tools/serve-dev.mjs`, what `npm run dev:server` runs. `tsx watch` is
   * what it ran until 4 September 2026 and is still what a person may type. `nothing that restarts
   * it` is a server started straight from a shell, by a test, or one whose supervisor has died.
   */
  kind: 'the dev supervisor' | 'tsx watch' | 'nothing that restarts it' | 'unknown'
  /**
   * The supervisor's process id. NULL WHENEVER THERE IS NO SUPERVISOR, including when the parent is
   * systemd, a shell or a test runner — those are named in `parent` instead, which is what they are.
   */
  pid: number | null
  /** The supervisor's process group, which is what stopping it signals. Null for the same reasons. */
  pgid: number | null
  /** Its whole command line, so the reading above can be checked rather than believed. */
  commandLine: string | null
  /** The process this one hangs off, whatever it is. Null when the process table could not be read. */
  parent: RuntimeParent | null
  /**
   * Why THIS run of the server was started, in the supervisor's own words: "src/shared/product.ts
   * changed", "the previous run exited with code 1", "the first start".
   *
   * Null means nobody recorded it, which is a real state and not a missing value: `tsx watch` says
   * nothing to the process it starts, and a server started by hand had no supervisor to say.
   */
  restartedBecause: string | null
  /**
   * A run of starts that all failed, or null because there is not one.
   *
   * It is about the SUPERVISOR OF THIS CHECKOUT AND THIS PORT, not about the process answering: a
   * server that is answering perfectly well may be one the supervisor lost track of, and the reader
   * needs to be told that the replacement cannot start.
   */
  failedStarts: SupervisorFailedStarts | null
  /**
   * WHAT MANAGES THIS SERVER AS THE MOLE OFFICE SERVICE, or null because nothing does.
   *
   * `mole-office start` when that command started it: the command sets MOLE_OFFICE_STARTED_BY and
   * starts the server in a process group of its own, then lets it go, so its parent is gone or is
   * whatever adopted it. Believed only while the server still leads its own group. Null for a server
   * the dev supervisor, a terminal, a test or a window started (criterion W8: a window is a client of
   * the service, never its parent or its manager).
   */
  serviceManager: 'mole-office start' | null
  /** The whole reading in one plain sentence. */
  says: string
}

/** The checkout this server's code came from. */
export interface RuntimeRepository {
  /** The absolute path of the checkout, found from the code rather than the working directory. */
  path: string
  /** The directory the process was started in, which is not always the checkout. */
  workingDirectory: string
  /** The commit, short and full. Null when git could not answer. */
  head: { short: string; full: string } | null
  /** The branch, or null on a detached HEAD or when git could not answer. */
  branch: string | null
  /** Whether the working tree has uncommitted changes. Null when git could not answer. */
  dirty: boolean | null
  /** True when this checkout is a git worktree rather than the main one. Null when unknown. */
  isWorktree: boolean | null
}

/** The database file this process actually has open. */
export interface RuntimeDatabase {
  /** The file the running connection holds, absolute. Read from the connection, not the settings. */
  path: string
  /** The file a server started from this checkout with no environment would open. */
  canonicalPath: string
  /** Whether those two are the same file. */
  canonical: boolean
  /** Why the file at that path is not the file this process opened. Null when it is. */
  problem: string | null
  /** The same sentence, or null when there is no problem, as a code with values, which the page draws in its own language (src/shared/dev-sayings.ts). */
  problemSaid: DevSaying | null
}

/** Who started this process, from the resources ledger, or nobody. */
export interface RuntimeOwner {
  /** True when a live ledger row names this process. */
  registered: boolean
  /** One sentence a person reads. "nobody registered this process" is a real answer. */
  says: string
  /** The same sentence as a code with values, which the page draws in its own language (src/shared/dev-sayings.ts). */
  said: DevSaying
  resourceId: string | null
  sessionRecordId: string | null
  sessionTitle: string | null
  /** Whether the owning session has ended. 'unknown' when its record cannot say. */
  ownerEnded: boolean | 'unknown' | null
  /** When the registration was written, local wall-clock. */
  registeredAt: string | null
  /** Whether the product itself started it, as the row records. Null when unregistered. */
  startedByTheProduct: boolean | null
}

/**
 * THE MESSAGE WORKER THIS SERVER STARTED, or the reason there is not one.
 *
 * The worker is a separate process that delivers a message to an agent by starting a run of that
 * agent's tool. It is the one thing the product starts, on the decision of 3 September
 * 2026. This says whether it was started, whether it is still there, what it has going, and — when
 * runs are being answered by a script instead of a model — that they are not real.
 */
/**
 * WHAT THE WORKER HAS GOING, WAITING AND LAST DONE.
 *
 * ONE LINE PER RUN, AND EVERY LINE IS WRITTEN ON THE SERVER. `workerRuns` in
 * src/server/lib/worker.ts is the only thing that builds these sentences, because the table that
 * reads a stored state word lives there and the page must never work one out for itself
 * (criterion M4). The page draws a label and a sentence and nothing else.
 *
 * IT USED TO BE DECLARED TWICE — here, inside `RuntimeWorker`, and again as `WorkerRuns` in
 * src/server/lib/worker.ts — which is the defect CLAUDE.md names as this codebase's own: the same
 * fact worked out in two places, so the two can disagree. The server now imports this one.
 */
export interface WorkerRuns {
  /** Runs going now: the session record of each, and one line about it. */
  inFlight: { session: string; says: string; said: DevSaying }[]
  /**
   * Runs that have answered and are holding their conversation open for the next message.
   *
   * Criterion M22. The sentence says which agent, which tool and how long is left.
   */
  waitingForTheNextMessage: { session: string; says: string; said: DevSaying }[]
  /** The newest run the worker has ever filed, finished or not. */
  last: { session: string; says: string; said: DevSaying } | null
  /** How many messages to agents are still waiting for a run. */
  waiting: number
}

/**
 * ONE PLACE THE OFFICE STARTS A RUN BY ITSELF, AND WHERE EACH OF THE THREE ANSWERS CAME FROM.
 *
 * Criterion T7. Every part is a name and a sentence rather than a stored word, because the page
 * draws what the server worked out and never works out a setting for itself.
 */
export interface RuntimePlace {
  /** What this place is, in words a person reads. */
  place: string
  placeSaid: DevSaying
  /** The runtime runs here take. `name` is null when nobody can name one, and `from` says why. */
  runtime: { name: string | null; from: string; fromSaid: DevSaying[] | null }
  /** The model runs here take. `name` is null when nobody names one, and `from` says why. */
  model: { name: string | null; from: string; fromSaid: DevSaying[] | null }
  /** The provider's reasoning effort, where the runtime takes one. Null when none applies. */
  variant: { name: string | null; from: string; fromSaid: DevSaying[] | null }
  /** One thing true about this place that would otherwise be guessed at, or null. */
  says: string | null
  /** `says` as codes, one per sentence, or null when `says` is. */
  saysSaid: DevSaying[] | null
}

/** One agent tool on this machine, where it is, and what to say when there is nothing to look for. */
export interface RuntimeTool {
  /** The runtime word, as the agent registry spells it. */
  runtime: string
  /** Where the program is on this machine, or null. */
  where: string | null
  /** Why there is nothing to look for, or null because there is a tool to look for. */
  says: string | null
}

export interface RuntimeWorker {
  /** True when this server started one. False is a real answer and `says` gives the reason. */
  started: boolean
  /** One sentence a person reads. */
  says: string
  /** `says` as a code, or null when this server wrote a sentence that has none (merges-only mode). */
  said: DevSaying | null
  pid: number | null
  pgid: number | null
  sessionRecordId: string | null
  resourceId: string | null
  /** Whether that process is there now, read from the machine. 'unknown' when nothing could look. */
  alive: boolean | 'unknown'
  /**
   * The runs it has going, the runs waiting for the next message, the newest run it filed, and how
   * many messages are still waiting for a run.
   *
   * Each line is written on the server, where the one table of readings is, so the page draws it
   * and never works out what a stored word means.
   */
  runs: WorkerRuns
  /**
   * The script answering every message instead of an agent tool, or null because none is.
   *
   * Never left to be inferred. A reply that came from a script and not from a model must say so
   * wherever it is shown, and this is where the runtime page reads it.
   */
  runsAreFaked: string | null
  /**
   * WHICH MODEL A RUN THE OFFICE STARTS IS GIVEN, and where that answer came from. Criterion M85.
   *
   * A person reading this page is reading what their runs cost, and until 8 September 2026 the page
   * could not say: no --model was passed, so every run took whatever their own tool was configured
   * with. `from` says whether they set it or the settings declaration did, because those are two
   * different things to do something about. `name` is null when nobody named one: the office ships no
   * default model (FLO-05), and `from` then says so.
   */
  model: { name: string | null; from: string; fromSaid: DevSaying }
}

/** Whether this runtime is the real one or a throwaway, and why. */
export interface RuntimeStanding {
  kind: 'canonical' | 'scratch'
  /** Every reason, in plain words. A canonical runtime has an empty list. */
  because: string[]
}

/** Whether the code this process is serving is as new as the code on disk. */
export interface RuntimeFreshness {
  /**
   * The newest modification time among THE FILES THE SERVER IS BUILT FROM, at the moment this
   * process built its module graph. That is what "the code it has loaded" means here, and it is
   * stated rather than implied. The set is walked from `THE_SERVER_ENTRY` by
   * src/config/import-graph.mjs.
   */
  newestLoaded: string | null
  /**
   * The newest modification time among the files THE SERVER is built from, on disk, read now.
   *
   * NOT UNDER THE WHOLE OF `src/` AND NOT A LIST OF FOLDERS EITHER, and the difference is two
   * defects this product shipped. A change the server cannot load does not make the server's code
   * old: the server never had that code, and `tsx watch` restarts it only on files it did load.
   * Judging it against every file under `src/` meant one page-file edit made the API report itself
   * stale for ever — health ok false and a red banner over a page nothing was wrong with, problem
   * `aI9V57-ZTyv0`. Judging it against three folders did the same for the seven files under
   * `src/shared` that only `src/web` imports, problem `TMy3C0ydoYYR`.
   */
  newestOnDisk: string | null
  /** The file that carries `newestOnDisk`, relative to the checkout. */
  newestOnDiskFile: string | null
  /**
   * How many files that set holds. Null when it could not be read.
   *
   * It is reported because a time on its own cannot say whether the walk found the program or found
   * one file, and `1` is what a broken entry looks like.
   */
  filesTheServerIsBuiltFrom: number | null
  /**
   * THE NEWEST OF THE FILES THE BROWSER APP IS BUILT FROM, read now. Null when the walk failed, and
   * `couldNotRead` then says why.
   *
   * A page has no disk, so the server reads this for it, and it is a different number from
   * `newestOnDisk` on purpose: the two programs load different sets of files, and each is judged
   * against its own. Measuring the page against the whole of `src/` put a red banner over the
   * owner's live page after a server-only merge. Problem `2hadqssN_rc4`. The set is walked from
   * `THE_PAGES_ENTRY` by src/config/import-graph.mjs.
   */
  newestForThePage: string | null
  /** The file that carries `newestForThePage`, relative to the checkout. */
  newestFileForThePage: string | null
  /** How many files the browser app's set holds. Null when it could not be read. */
  filesThePageIsBuiltFrom: number | null
  /**
   * WHAT THOSE FILES HOLD NOW, as the digest src/config/content-digest.mjs makes of their paths and
   * contents. Null when they could not be read, or when there is no source to read because this is a
   * bundle; the gaps then say which.
   *
   * A BUILT PAGE IS JUDGED BY THIS AND NOT BY `newestForThePage` when its build recorded the same
   * digest. A file touched after the build without being changed is newer than the build and holds
   * the same. Until wave 13y round 87 that made a built page "behind" on every load.
   */
  contentForThePage: string | null
  verdict: 'as new as the checkout' | 'older than the checkout' | 'unknown'
  /** One sentence: the verdict with both times in it. */
  says: string
  /** The same sentence as a code with values, which the page draws in its own language (src/shared/dev-sayings.ts). */
  said: DevSaying
  /**
   * WHEN THIS SERVER WAS FIRST FOUND BEHIND THE CHECKOUT. Null unless the verdict is 'older'.
   *
   * Not the modification time of the newest file, which is what it used to be. That is the LAST
   * change, and counting from it meant that each new save restarted the count: a server an hour
   * behind reported three seconds while somebody was editing, and both readers built on this — the
   * red banner and the ok flag on GET /api/health — went quiet in exactly the case where somebody
   * is working. Problem `PxJuVufHG6A2`.
   */
  staleSince: string | null
  /**
   * WHETHER THE BUILT PAGE ON DISK IS AS NEW AS THE CHECKOUT.
   *
   * A built page has no process to ask: its code is the code that was in the checkout when
   * `vite build` ran, and after that it does not move. So the build writes a stamp — the newest
   * source file it took in and the commit it was made at — and this compares that stamp with the
   * source on disk now. S2 of design/ground/ACCEPTANCE.md section 9.
   *
   * IT IS ABOUT THE PAGE AND NOT THE SERVER. `verdict` above is about the code this process
   * loaded; this is about the bundle being served to a browser, which a running API can be behind
   * on without its own code being old.
   */
  builtPage: BuiltPageFreshness
}

/**
 * WHAT THE BUILT PAGE'S OWN STAMP SAYS, COMPARED WITH THE CHECKOUT NOW.
 *
 * All four fields are null when there is no stamp to read, which is the ordinary state of a
 * development checkout and of one that has never been built. `unknown` is then the verdict and
 * `says` names why: absence is an answer here, and reading it as fresh would be the first rule
 * broken.
 */
export interface BuiltPageFreshness {
  /** When the build ran, local wall-clock, or null because nothing recorded one. */
  builtAt: string | null
  /** The commit the build was made at, or null because git could not say. */
  builtFromCommit: string | null
  /** The newest source the build took in, local wall-clock, or null because it did not record one. */
  builtFromSourceAt: string | null
  /** Which file carried that time. */
  builtFromSourceFile: string | null
  /**
   * Whether the built page is behind the files the page is built from now: by what they hold, when the
   * build recorded it, and otherwise by their times.
   */
  verdict: 'as new as the checkout' | 'older than the checkout' | 'unknown'
  /** The verdict and what decided it, or why it could not be worked out. */
  says: string
}

/**
 * One machine that has called this API from somewhere other than this computer.
 *
 * Read from the call log rather than kept: `src/server/lib/usage-reads.ts` says what that means and
 * why an address nobody could read is a row of its own rather than being left out.
 */
export interface OtherMachineClient {
  /** The address it called from, or null because nothing on the way here said. */
  address: string | null
  /** How many of its requests are still in the call log. */
  requests: number
  /** When the oldest of those was, local wall-clock. */
  firstAt: string
  /** When the newest was, local wall-clock. */
  lastAt: string
}

/** One request open across a stall, apart from streams held open on purpose. */
export interface RuntimeStallRequest {
  method: string
  url: string
  /** The registered route, or null when no route matched. */
  route: string | null
  project: string
  /** When the request arrived, local wall-clock. */
  startedAt: string
  /** Until the request closed, or until the stall ended while it was still open. */
  durationMs: number
}

/** The last delay above the watch's threshold, measured by node's event-loop histogram. */
export interface RuntimeLoopStall {
  /** The warning, word for word as logged. */
  line: string
  /** The histogram's maximum delay less its own sampling step. */
  heldMs: number
  /** When the watch's tick saw the end, local wall-clock. */
  endedAt: string
  requests: RuntimeStallRequest[]
}

/** No active watch is different from a watch that has seen no stall. */
export type RuntimeLoopWatch = {
  watching: true
  /** When the oldest active watch began, local wall-clock. */
  since: string
  heldOverMs: number
  lastStall: RuntimeLoopStall | null
} | {
  watching: false
  since: null
  heldOverMs: null
  lastStall: RuntimeLoopStall | null
}

/** Everything a running Mole Office knows about itself, read when asked. */
export interface RuntimeRecord {
  /** The paired development checkout, read from this process's held world. */
  developmentCheckout?: string
  /** When this read happened, local wall-clock. */
  readAt: string
  process: RuntimeProcess
  /** What restarts this server when its code changes, and why this run started. */
  supervisor: RuntimeSupervisor
  /** The API port this process was configured with. */
  port: number | null
  /** The ports it is actually listening on, read from the kernel. Empty is a reading. */
  listeningOn: number[]
  /**
   * Where this server really answers, where it was told it would, and where the CANONICAL browser
   * app answers.
   *
   * `api` IS READ OFF THE LISTENING SOCKET: the host and the port this process actually bound. It
   * is null when this process has bound nothing at all, which is what a server built for a test and
   * driven with `inject` is, and `couldNotRead` then carries the reason.
   *
   * `declaredApi` is what this process's settings say — the environment on top of `.env`. The two
   * used to be one field, filled from the declaration, so a scratch server started from a checkout
   * whose `.env` names a MOLE_OFFICE_PORT reported that it was answering on that port whatever port
   * it had really taken. Problem `ES5fb2_BHsVn`. They are two facts and they are now two fields,
   * and `says` below is the sentence for the case where they differ.
   *
   * `web` and `canonicalWeb` are about the BROWSER APP rather than about this process, so both are
   * declarations and neither could be read off a socket here. `web` is where this server was told
   * the browser app lives; `canonicalWeb` is the same question asked of `.env` alone — the address
   * the browser app would be on if nobody had set anything in a shell.
   *
   * THE LAST ONE IS FOR CRITERION G4, and it is not the same fact as `web`. A page has to be able
   * to ask *was I opened on the address of the real Mole Office*, and only the checkout can answer
   * that. A scratch stack knows its own port perfectly well, and a scratch stack answering on its
   * own port is nobody's mistake; it is a scratch database answering on the REAL address that the
   * banner is for. `database.canonicalPath` draws the same distinction for the database and is read
   * the same way.
   */
  addresses: {
    api: string | null
    declaredApi: string
    /**
     * One sentence, when the address this server answers on is not the one its settings declare.
     * Null when they are the same, and null when this process has bound nothing: there is no
     * disagreement between a socket that does not exist and a declaration.
     */
    says: string | null
    /** `says` as a code, or null when `says` is. */
    saysSaid: DevSaying | null
    web: string
    canonicalWeb: string
    /**
     * WHERE ANOTHER MACHINE REACHES THIS ONE, or null because nothing is served to another machine.
     *
     * Null is the ordinary state and it is not a gap: `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` is
     * unset in every installation until somebody sets it, and unset means every listener stays on
     * 127.0.0.1. `couldNotRead` is where a reading that failed goes; this field is a reading that
     * succeeded and found nothing.
     *
     * BOTH ADDRESSES, because they are two different things somebody opens. `api` is where a page on
     * the other machine sends its requests; `web` is what a person types into a browser there. Both
     * are derived in src/config/settings.mjs from the one name and the two ports already declared,
     * so moving a port moves them and there is no second place to update.
     *
     * IT IS A DECLARATION, AND HERE IS WHY THAT IS NOT THE `ES5fb2_BHsVn` FAULT AGAIN. `api` above is
     * read off a listening socket because a server can be told one port and take another. This one
     * cannot differ that way: a server whose door for other machines will not bind stops with a
     * message naming the setting, so there is no state in which this process is answering and this
     * address is not bound. `tests/another-machine-reaches-the-same-world.test.ts` holds that.
     * The one thing this does not read back is which ADDRESS a name resolved to, and the name is the
     * more useful of the two to print.
     */
    forOtherMachines: { host: string; api: string; web: string } | null
    /**
     * THE SAME QUESTION `canonicalWeb` ANSWERS, ASKED ABOUT THE OTHER ADDRESS: where the browser app
     * would be for another machine if nobody had set anything in a shell. Null when the checkout
     * declares no address for other machines.
     *
     * It exists because the page's *a scratch database is answering on the real address* check
     * compares where the page was opened against the canonical web address, and a page opened over
     * the tailnet is on a different one. Measured on 4 September 2026 by the negative control's own
     * remote case: a page served on the address for other machines, answered end to end by a copy of
     * the database, drew nothing at all. Without this field the check is silent for exactly the
     * reader who is furthest from the machine and least able to notice.
     */
    canonicalWebForOtherMachines: string | null
  }
  /**
   * WHO HAS REACHED THIS API FROM OFF THIS MACHINE, one entry per address.
   *
   * An empty list means nobody has, which is the ordinary state and is a reading rather than a gap.
   * It is derived from the call log the API already keeps, so nothing about a person is stored to
   * make it: a machine that has never called is absent, and one stops appearing when its calls age
   * out of that log with everything else.
   */
  fromOtherMachines: OtherMachineClient[]
  repository: RuntimeRepository
  database: RuntimeDatabase
  startedBy: RuntimeOwner
  /** The message worker this server started, or the reason there is not one. */
  worker: RuntimeWorker
  /**
   * WHICH RUNS GO WHERE. Criterion T7.
   *
   * One entry per place the office starts a run: answering a message by itself, a builder a
   * secretary starts, and the check on a finished run. Each carries the runtime, the model and the
   * reasoning effort, and where each of the three answers came from. It exists because one model
   * line for the whole office would say "opus" about a run that went to opencode.
   */
  places: RuntimePlace[]
  /**
   * WHICH AGENT TOOLS ARE ON THIS MACHINE, AND WHERE EACH ONE IS.
   *
   * Every runtime word the registry allows, answered by `whatIsInstalled`'s rule. A word with no
   * adapter is neither left out nor called missing: it comes back with a sentence saying it is
   * started by its own tool and never dispatched from here. Drawn on the page so a person can see
   * which tools this installation can actually run.
   */
  installed: RuntimeTool[]
  standing: RuntimeStanding & { becauseSaid: DevSaying[] }
  freshness: RuntimeFreshness
  /** The settings file this world was read from, and where each value came from. */
  settings: { envFile: string; envFileFound: boolean; sources: Record<string, string> }
  /**
   * HOW THE MESSAGE DOOR IS SET FOR AN AGENT NOTHING IS ANSWERING AS: the variable's name, and
   * whether it is on, off or not set. Not set reads as off. The Settings page's "This computer"
   * panel draws it, read-only. Worked out by `howTheMessageDoorIsSet` in src/server/lib/env.ts.
   */
  messageDoor: { variable: string; state: 'on' | 'off' | 'not set' }
  /**
   * HOW LONG A PERSON'S MESSAGE HANDED TO AN AGENT MAY GO WITHOUT A REPLY before the agent is reminded once (wave 13y
   * round 11). The Settings page's "Reminder when no reply" panel draws it, read-only. Worked out by
   * `howTheReplyReminderIsSet` in src/server/lib/env.ts.
   */
  replyReminder: ReplyReminderSetting
  /** Whether a Kimi CLI run started here could reach a model. Never any part of a key. */
  kimi: RuntimeKimi
  /**
   * WHAT THE LAST STARTS COST, AGAINST THE PERSON'S CEILING. F15 point 6.
   *
   * Read fresh on every request, the same as everything else on this page: each of the most recent
   * session records has its start cost worked out again from its own trace and its own usage, and
   * nothing here is a stored total that could go stale. A start nobody could measure carries no
   * number and says why, which is `StartCostUnmeasured` and not a zero.
   */
  starts: StartCostPanel
  /** Whether the loop is watched, since when and above what delay, with the last stall or null. */
  loopWatch: RuntimeLoopWatch
  couldNotRead: Unreadable[]
}

/**
 * WHETHER A KIMI CLI RUN STARTED HERE HAS WHAT IT NEEDS, WITHOUT SAYING WHAT ANY OF IT IS.
 *
 * A Kimi run needs three things in its environment and had nowhere to get them until 6 September
 * 2026: a key, an endpoint and a model name. `src/config/settings.mjs` declares all three, and
 * `src/worker/runtimes/kimi.ts` builds the run's environment from that declaration. This is the
 * same reading, for a person who wants to know why a Kimi agent answers nothing. Problem
 * oY8Vs5feaRai.
 *
 * NO VALUE IS HERE AND NONE MAY BE ADDED. `key` is the word `set` or the words `not set`, and every
 * other field holds setting NAMES. A key belongs to an outside service and this record is served to
 * a page.
 */
export interface RuntimeKimi {
  /** Whether a key is there at all, under either name. Never the key. */
  key: 'set' | 'not set'
  /**
   * WHICH SETTING THE KEY WAS FOUND UNDER: `KIMI_API_KEY`, or `MOONSHOT_API_KEY` when only the
   * owner's own name for it is set and the adapter maps it across. Null when no key is set, which
   * is a reading and not a gap — nobody failed to look.
   */
  keyFrom: string | null
  /**
   * THE DECLARED KIMI SETTINGS NOBODY HAS SET, by name, in the order the declaration lists them.
   * Empty means a run has everything it needs. A key on its own is not enough: with no endpoint and
   * no model name Kimi CLI's own default provider is empty and the run prints `LLM not set`.
   */
  missing: string[]
  /**
   * THE DECLARED KIMI SETTINGS SOMEBODY SET TO AN EMPTY VALUE, by name, with the declaration's own
   * refusal for each. Set-and-empty and never-set are different statements, so they are counted
   * apart rather than both read as absent.
   */
  refused: string[]
  /** One plain sentence a person can act on. */
  says: string
}

/**
 * The short form of a world, for a row in a list or a header on a reply.
 *
 * A registered resource carries one of these, so that a row can say what it is a resource OF
 * rather than only that a port number was taken. G5 stores it; G3 will put it on a reply.
 */
export interface World {
  /** The development checkout whose settings and data the stable office serves. */
  developmentCheckout?: string
  /** The checkout, absolute. */
  repository: string
  /**
   * The database file, absolute. Null when whoever recorded this could not see a path.
   *
   * A process that reads its OWN world has the path. A process that read the world off another
   * server's reply has only the identity below, because the header carries an identity on purpose —
   * a path is not an identity, and the negative control this product is checked with serves a COPY
   * of the database from a second path.
   */
  database: string | null
  /**
   * The database identity: the same sixteen characters the `x-mole-office-world` header carries,
   * worked out in src/config/database-identity.mjs. Null when nobody could read the file.
   */
  databaseIdentity: string | null
  /** The API port this process was configured with. */
  port: number | null
  /** The commit, short. Null when git could not answer at registration time. */
  head: string | null
  /** Whether it was canonical or scratch when it was registered, and why. */
  standing: RuntimeStanding
  /** When these facts were read. */
  readAt: string
  /**
   * HOW THESE FACTS WERE COME BY, in one plain phrase.
   *
   * A world is a claim about a running process, and there are three honest ways to have one: the
   * process said it about itself, this server asked the Mole Office on that port, or the caller read
   * it off the world header of the Mole Office it serves. They are not equally strong, so a reader
   * is told which it is looking at rather than being left to assume the first.
   */
  saidBy: string
}

/**
 * HOW THE REPLY REMINDER IS SET: the variable's name, the minutes the reminder reads, and whether the variable is set.
 * `minutes` is null and `problem` is the reader's sentence when the value is not a whole number.
 */
export interface ReplyReminderSetting {
  variable: string
  minutes: number | null
  set: boolean
  problem: string | null
}
