// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { howARunStands } from '@shared/releasing.ts'
import { ENDED_RUN_LOOK_FIELD } from '@shared/ended-run-resources.ts'
/**
 * The resource ledger: what a session leaves running after it has ended.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * It has fired four times during Mole Office's own construction. Orphaned servers holding ports;
 * one of them holding a DELETED database file and serving stale data, which produced a wrong
 * diagnosis that cost an afternoon. On the wider machine a simulation sat idle for
 * eleven days holding the GPU. Every one of those happened with the cleanup rule already
 * written down, because an agent that dies mid-response never reaches its cleanup step.
 *
 * A rule an agent has to survive to obey is not a mechanism. This is the mechanism: a session
 * writes down what it started, and afterwards anyone can ask what is still alive.
 *
 * AND WHEN NOBODY WRITES ANYTHING DOWN. A ledger reports what was registered, so an unregistered
 * process cannot be reported as an orphan — it has no row to be one. That blind spot is not
 * argued away here, it is swept: `unclaimedSweep` below reads the machine itself and names what
 * is alive that no live row claims. "This is running, and no session claims it" is a WORSE
 * sentence than "no orphans", and the two are kept apart on purpose, because the second one is
 * what an empty ledger says on a machine covered in abandoned servers.
 *
 * AND WHEN THE THING THAT DIED IS MOLE OFFICE'S OWN SERVER. The two reads above are both about what a
 * session left behind. `serversOnThisMachine`, at the bottom of this file, answers the question a
 * person asks when the product is behaving strangely: which server am I talking to, which corpus
 * is it serving, and is anything else running that will confuse the answer. It reports a ledger
 * row that has stopped describing what is running as a CLAIM rather than as evidence, which is the
 * distinction the rest of this file rests on.
 *
 * REPORT; DO NOT REAP. Nothing here kills anything on its own. Run endings and
 * timed or requested sweeps close only process rows already found gone. Killing happens only when a person posts to the release
 * endpoint, and it is written to the change log with who asked. An automatic reaper would
 * eventually kill the eleven-day simulation that was deliberately left running, and after that
 * nobody would trust the tool with a kill button again.
 *
 * ---------------------------------------------------------------------------------------
 * THE PLACE THAT IS MEANT TO BE THE ONLY ONE TOUCHING THE OPERATING SYSTEM
 * ---------------------------------------------------------------------------------------
 *
 * The server's reads of /proc, its spawns of nvidia-smi or docker and its signals go through the
 * `OsProbe` interface below, and `LINUX_PROBE` is its single implementation. The design rule is
 * that as little as possible talks to the operating system outside it, because every such file is
 * one more thing a Windows or Mac port has to change. The files that still do are listed in
 * `OTHER_FILES_THAT_TOUCH_THE_SYSTEM` beside the interface, and `assertLinux()` names each of them.
 *
 * THE SESSION ADAPTERS USED TO BE ONE MORE SUCH FILE, AND NOTHING SAID SO. `adapters/index.ts`
 * used to read /proc itself on every `GET /api/sessions` — measured at 352 processes per request —
 * through a function this interface knew nothing about. It was swappable, through
 * `AdapterEnv.scanProcesses`, but it was a SECOND seam for one concern: two interfaces to one
 * operating system, so a port had to find and implement both, and neither file said the other
 * existed. `processTable()` below is the method that closed it, and `defaultEnv` now asks the
 * installed probe.
 *
 * `tests/sessions.test.ts` proves the seam is real rather than tidy. It
 * installs a fake machine through `useOsProbe` and asserts that session discovery — including
 * `GET /api/sessions` with no environment injected at all, the route exactly as the product serves
 * it — reports what the FAKE says. Without that, a boundary that greps clean could still be
 * cosmetic, and every test that looked like it covered session discovery would really be reading
 * whatever happened to be running on the machine that afternoon.
 *
 * WHY ONE PIECE OF THE MACHINE-READING LIVES IN adapters/os.ts RATHER THAN HERE. Importing this
 * file OPENS THE DATABASE: it reaches lib/records.ts and through it db/client.ts, whose module
 * body opens `MOLE_OFFICE_DB`. The session adapters have to stay importable without a database, or the
 * test suite would open the real `./data/panelx.db` every time it ran. So the walk sits in
 * adapters/os.ts, which imports nothing but node:fs, and this file imports it. The header of that
 * file says the same thing from the other end.
 *
 * The interface is also why this file is testable. A fake probe is a plain object, so the
 * ledger's rules — pid reuse, group safety, "unknown is not gone" — are exercised without
 * starting or killing anything real.
 *
 * ---------------------------------------------------------------------------------------
 * "UNKNOWN" IS A THIRD ANSWER, AND IT IS NEVER ROUNDED TO "GONE"
 * ---------------------------------------------------------------------------------------
 *
 * If nvidia-smi is not installed, this reports that it could not look. It does not report zero
 * megabytes, which reads as "nothing is using the GPU" and is exactly the sentence that lets an
 * eleven-day simulation stay invisible. Same for docker being absent or its daemon being down,
 * and same for a lock directory that cannot be read. Every report carries those as `unchecked`
 * alongside the answers, so a caller cannot mistake "we did not look" for "there is nothing
 * there".
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TABLE COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * `session_resources` and its two indexes are declared in src/server/db/schema.ts and created by
 * migration 0003. This file used to create them itself, with a CREATE TABLE IF NOT EXISTS running
 * at import; that function was deleted when the declaration moved, because two definitions of one
 * table fail at runtime on INSERT rather than at compile time. This file now only reads and
 * writes rows.
 *
 * ---------------------------------------------------------------------------------------
 * A PROGRAM IS FOUND IN THE WHOLE ENVIRONMENT
 * ---------------------------------------------------------------------------------------
 *
 * Each program this file looks up is looked up in a whole environment, and its search path is read
 * by `theSearchPathIn` of the system (src/config/systems/the-system.mjs). On Windows that is the one
 * name that is PATH in any case, so a server whose environment holds it as `Path` finds its tools.
 * On Linux and the Mac it is `PATH` alone. The avatar codec's child is given an environment made
 * from nothing, so it holds one search path entry, `PATH`, read the same way.
 */

import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process'
import { AVATAR_CODEC } from '../../config/avatar-codec.mjs'
import { THE_LEDGER_COUNTS_A_SESSION_OVER_IN } from '../../config/the-ledgers-ended-states.mjs'
import { installOsProbe, osProbe as installedOsProbe } from './os-probe.ts'
import { closeSync, constants as fsConstants, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, statfsSync } from 'node:fs'
// WHAT THIS MACHINE CALLS ITSELF AND WHICH ADDRESSES IT HAS, for LINUX_PROBE.machineName and
// LINUX_PROBE.ownAddresses below. This file is the operating system layer, so it is the one place
// under src/ that may ask.
import { hostname, loadavg, networkInterfaces } from 'node:os'
// Where `readThePatchIdsOfALog` writes the patch log it does not hold in memory.
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { anOfficeId } from './ids.ts'
import { SESSION_STATES, type SessionState } from '@shared/types.ts'
import { stateWord } from '@shared/words.ts'
import { databaseFileStatus, db, sqlite } from '../db/client.ts'
// `logChange` comes from here rather than being written again: this file used to hold its own
// copy, and the copy stored the run name an agent sent instead of the session record that name
// resolves to. See the note on logChange in records.ts.
import {
  getRecord,
  getRecordsWithIds,
  clearTheEndedRunLookMark,
  recordInWorkspace,
  sameAgent,
  type Actor,
} from './records.ts'
import { logChange } from './log-change.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import type { PanelRecord } from '@shared/types.ts'
import {
  anInstantNamesItsStamp,
  clockStamp,
  latestMomentOfStampInZone,
  localStamp,
  momentOfAnInstant,
  momentOfAStampAndItsInstant,
  momentOfStampInZone,
  parseAnyStamp,
  parseStoredStamp,
  theClockZone,
} from '@shared/time.ts'
// The process table. The walk itself lives in adapters/os.ts because this file opens the database
// when it is imported and the adapter layer must stay importable without one; the header above
// gives that in full. `ProcessScan` is declared beside the adapters because they are what reads it,
// and it is declared exactly once.
// XcXCy5MM-1q5: starting and watching the worker must name the same entry, or edits load old code.
// A caller cannot choose the entry: that would make startTheMessageWorker a general command runner
// (M9, oaJ-pSntZ3m-). The shared declaration fixes it: `howToStart('worker')` starts THE_WORKER_ENTRY,
// the entry src/config/newest-source.mjs watches, or the bundle made from it.
import { headFromGitDirs, howToStart, RUN_AS_NODE, settingValue, theInstallsNode } from '../../config/settings.mjs'
import { gateMet } from './gate-counts.ts'
import { databaseIdentity } from '../../config/database-identity.mjs'
import { UNKNOWN } from '../../config/world-header.mjs'
import { theVersionItPrinted, theWayToStart, type TheSystem, VERSION_MUST_ANSWER_WITHIN_MS, whereIsThisTool } from '../../config/runtimes.mjs'
import { whatCodexSaysOfItsSignIn } from './what-an-agent-tool-says-of-its-sign-in.ts'
// The one choice of a process reader per platform, which this file's probes share with the service
// lock, the worker and the session hook. See the header of src/config/process-reader.mjs.
import { guardedGitArguments, guardedGitEnvironment } from '../../config/guarded-git.mjs'
import { linuxProcessReader, THE_PORT_OF_THIS_MODULE, thereAreProcessGroups, theRowIsAboutThisProcess, WHAT_WINDOWS_NEEDS_TO_READ_PROCESSES, WINDOWS_HAS_NO_PROCESS_GROUPS, type RowAndProcess } from '../../config/process-reader.mjs'
import { theSystemFor } from '../../config/systems/the-system.mjs'
import { aCommandsProgram } from '../../config/run-permissions.mjs'
import { theEnvironmentACodexGets } from '../../config/the-environment-a-codex-gets.mjs'
import { startedByThatStarter, THE_STOP_ANSWER, WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE } from '../../config/systems/windows-groups.mjs'
import { THE_STARTERS_MARK } from '../../config/systems/windows-starts.mjs'
import type { World } from '@shared/runtime.ts'
import { readLinuxProcessTable, useProcessTableSource } from './adapters/os.ts'
// A WORLD ENDS WHEN THE LAST PROCESS SERVING IT STOPS, and this file is where a process row ends.
// The import goes this way and not the other: lib/office.ts knows nothing about the ledger.
import { closeWorldHere, liveWorldOf } from './office.ts'
import type { ProcessScan } from './adapters/types.ts'
import { DEV_STACK_PARTS, type DevStackPart, moleOfficePartOf } from './mole-office-parts.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { gitDirsOf } from './git-checkout.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { maySpeakForTheSecretary, starterAgentOfARun } from './merge-queue.ts'
import { theAgentASessionAnswersAs } from './messages.ts'
import { type RegisteredAgent } from './participants.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theReadingsForOneSend, theRoutingOfOneAddressee, theRungsOfTheRoutingWalk } from './superiors.ts'
import { theNameOf } from '@shared/participant-name.ts'
import { SYSTEM_LINES, type ResourcesLeftOpen } from '@shared/groups.ts'
import { writeASystemLineToOne } from './groups.ts'
import { DarwinProbe, isADatabaseFile, type DarwinProcessReader } from './darwin-probe.ts'
import { WindowsProbe, type WindowsProcessReader } from './windows-probe.ts'
import { theFreeBytesIn } from '@shared/checks-in-merges-only.ts'
import { named } from './named-timers.ts'
import { theSessionIdsWithALookDue } from './session-fields.ts'
import { toEntry } from '../db/the-processes-a-listing-reads.ts'
import { parseWorld } from '../db/the-processes-a-listing-reads.ts'
import { readRows } from '../db/the-processes-a-listing-reads.ts'
import { theProcessesTheRowsRead } from '../db/the-processes-a-listing-reads.ts'
import { theStarterIsAskedAbout } from '../db/the-processes-a-listing-reads.ts'
import { oneReadingPerListing } from '../db/the-processes-a-listing-reads.ts'
import { ageSince } from '../db/the-processes-a-listing-reads.ts'
import { reportForAReleasedRow } from '../db/the-processes-a-listing-reads.ts'
import { ageOrNull } from '../db/the-processes-a-listing-reads.ts'
import { sessionViewOf } from '../db/the-processes-a-listing-reads.ts'
import { restampRowWrittenByTheOldReading } from '../db/the-processes-a-listing-reads.ts'
import { gpuMemoryFor } from '../db/the-processes-a-listing-reads.ts'
import { processLiveness } from '../db/the-processes-a-listing-reads.ts'
import { orphanedSince } from '../db/the-processes-a-listing-reads.ts'
import { ORPHAN_REPORT_ALSO_COUNTS } from '../db/the-processes-a-listing-reads.ts'
import { theContainerCalled } from '../db/the-processes-a-listing-reads.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'

// ============================================================================ the OS interface

/** One live process, as the operating system describes it. */
export interface OsProcess {
  pid: number
  /**
   * The process GROUP. This is what a release kills, because a server started from a shell is
   * usually a group of several processes and signalling only the leader leaves the children
   * holding the port. Killing the group is the whole point of recording it.
   */
  pgid: number
  /**
   * The process that started this one.
   *
   * WHAT IT IS FOR: walking upwards. A process cannot unset its own ancestry, so "was a test runner
   * behind this?" is answerable from here when the environment has been stripped of the variables
   * that usually say so — which four test files do on purpose, and which had the suite's servers
   * writing into the owner's real office. `aTestRunnerIsBehindThisProcess` in lib/runtime.ts is the
   * one reader; problem `JTdajUUs23_M` is why.
   *
   * 1 means the parent has gone and this process was reparented, which is an answer and not a gap.
   */
  ppid: number
  /** The full command line, arguments included. Kernel threads have none and show as [name]. */
  command: string
  /**
   * When the process started, in local time. This is the anti-reuse anchor: pids are recycled,
   * so "pid 12345" alone is not an identity. A recorded pid whose start time no longer matches
   * is a DIFFERENT process that happens to have the same number, and killing it would be the
   * worst thing this file could do.
   */
  startedAt: string
  /**
   * THE SAME MOMENT AS `startedAt`, AS AN INSTANT WITH ITS OFFSET (`clockStamp`). Wave 13q item 1i.
   *
   * The words in `startedAt` cannot say which 01:30 they mean on the night the clocks go back, when the hour from
   * 01:00 comes twice. A start time sent by a caller is checked against this instant, so a process begun in the second
   * pass is not read an hour early and called another process (`theStartTimeTheCallerSentIsThisProcess`).
   *
   * The Linux probe writes it, because it reads the moment itself (`aLinuxProcess`). Absent when the probe has only
   * the words: the macOS probe, which reads the local time `ps` prints, and a made-up probe in a test. Such a reading
   * is checked as every moment its words name, and never as one of them picked.
   */
  startedInstant?: string
  /**
   * THE MODIFICATION TIME OF THE `/proc/<pid>` DIRECTORY. IT IS NOT THE START TIME.
   *
   * It is carried because until 3 September 2026 this file read it AS the start time, so every
   * ledger row written before then holds this number in `os_started_at`. Without it the corrected
   * reading would disagree with every stored row and the ledger would call every registered
   * process a recycled pid. `theRowIsAboutThisProcess` in src/config/process-reader.mjs is where that is worked out.
   *
   * Null when nothing read it. A probe that does not supply it is not wrong; it only means rows
   * stamped the old way cannot be recognised, and those rows are then reported as gone, which is
   * what they would have been reported as anyway.
   */
  directoryChangedAt?: string | null
}

/**
 * Which program one process runs and its arguments one by one, or which file could not be read and why. `program` is
 * the executable's real path. `arguments` is its argv, argv[0] included, each argument whole.
 */
export type OsProgramAndArguments = { program: string; arguments: string[] } | { unreadable: string }

/** One socket in the LISTEN state. */
export interface OsPort {
  port: number
  /** The local address it is bound to, e.g. 127.0.0.1 or 0.0.0.0. */
  address: string
  protocol: 'tcp' | 'tcp6'
  /**
   * The process holding it, when this user is allowed to see it. `null` means the socket
   * belongs to somebody else's process — NOT that no process holds it.
   */
  pid: number | null
}

/** GPU memory, or a plain sentence saying why it could not be read. */
export type OsGpu =
  | { available: true; processes: { pid: number; usedMib: number; name: string }[] }
  | { available: false; reason: string }

/** Running containers, or a plain sentence saying why they could not be listed. */
export type OsContainers =
  | { available: true; containers: { id: string; name: string; image: string; status: string }[] }
  | { available: false; reason: string }

/**
 * The host pid of a running container's first process, or a plain sentence saying why docker could
 * not give it. The first process is the one the container itself calls pid 1.
 */
export type OsContainerFirstProcess = { ok: true; pid: number } | { ok: false; reason: string }

/** Docker's reading of one container. A failed question says nothing about whether the container exists. */
export type OsContainerState =
  | { ok: true; state: 'running' }
  | { ok: true; state: 'stopped'; exitCode: number; finishedAt: string }
  | { ok: true; state: 'gone' }
  | { ok: false; reason: string }

/**
 * Which pid namespace one process is in, and what it is called in each namespace that can see it.
 *
 * A process inside a container has two pids: the small one the container gives it and the one this
 * machine gives it. The kernel writes both on the `NSpid` line of `/proc/<pid>/status`, the pid this
 * reader sees first and the process's own innermost pid last.
 */
export interface OsPidNamespace {
  /**
   * The kernel's name for the namespace, as the `/proc/<pid>/ns/pid` link reads, e.g.
   * `pid:[4026533021]`. Two processes are in the same pid namespace exactly when these are equal.
   */
  namespace: string
  /** The `NSpid` line: this reader's pid for the process first, the process's own pid last. */
  nspid: number[]
}

export interface OsLockFile {
  path: string
  sizeBytes: number
  modifiedAt: string
}

/**
 * Lock files found, and the configured paths that could not be looked in.
 *
 * The second list is not an implementation detail. A watched directory that has been renamed
 * means locks there are no longer being watched, and reporting an empty `files` without saying
 * so would be a clean bill of health nobody checked.
 */
export interface OsLocks {
  files: OsLockFile[]
  unreadable: { path: string; reason: string }[]
}

/**
 * The rest of what the kernel knows about one process, beyond the four facts `OsProcess` carries.
 *
 * Every field here answers a question that was asked on 27 August 2026 and could not be answered:
 * which database is that server serving, is anybody still waiting for that Vite, and is the
 * directory it is running in still there.
 */
/**
 * THE PROGRAM BEHIND A CONNECTION, as `senderOfAConnection` finds it. `uid` is the socket's owner as the kernel's table
 * gives it. `pid` is the process holding the socket, or null when none this server may read holds it (another user's
 * processes, and a process that has already gone, cannot be read). `inAnotherContainer` is whether that process runs
 * in a container this server is not in, or null when there was no process to ask.
 *
 * ON WINDOWS a user is a SID and not a number, so the Windows probe gives the owner's SID and this server's own, and
 * never a made-up uid (lib/windows-probe.ts).
 */
export type OsSender =
  | { uid: number; pid: number | null; inAnotherContainer: boolean | null }
  | { sid: string; serversSid: string; pid: number; inAnotherContainer: false }

/** One connection in the kernel's table, `/proc/net/tcp` or `/proc/net/tcp6`. */
export interface AConnectionInTheTable {
  local: { address: string; port: number }
  remote: { address: string; port: number }
  uid: number
  inode: string
}

/**
 * EVERY CONNECTION IN ONE OF THE KERNEL'S TABLES, read from its text. An address is written there as hex in the
 * machine's byte order, each 32-bit word reversed, and a port as plain hex. An IPv4 address carried in an IPv6 socket
 * (::ffff:a.b.c.d) is answered in its IPv4 form, so it compares with what a Node socket reports.
 */
export function connectionsInTheTable(text: string): AConnectionInTheTable[] {
  const out: AConnectionInTheTable[] = []
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10) continue
    const local = anEndInTheTable(f[1] ?? '')
    const remote = anEndInTheTable(f[2] ?? '')
    const uid = Number(f[7])
    if (local === null || remote === null || !Number.isInteger(uid)) continue
    out.push({ local, remote, uid, inode: f[9] ?? '' })
  }
  return out
}

function anEndInTheTable(field: string): { address: string; port: number } | null {
  const [hex, portHex] = field.split(':')
  if (hex === undefined || portHex === undefined) return null
  const port = parseInt(portHex, 16)
  if (!Number.isInteger(port)) return null
  const words = hex.match(/.{8}/g) ?? []
  const bytes = words.flatMap((word) => (word.match(/.{2}/g) ?? []).reverse().map((b) => parseInt(b, 16)))
  if (bytes.length === 4) return { address: bytes.join('.'), port }
  if (bytes.length !== 16) return null
  const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff
  if (mapped) return { address: bytes.slice(12).join('.'), port }
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) groups.push((((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0)).toString(16))
  return { address: groups.join(':').replace(/(^|:)0(:0)+(:|$)/, '::'), port }
}

/** An address as a Node socket reports it, in the form `connectionsInTheTable` answers: ::ffff:a.b.c.d is a.b.c.d. */
function oneFormOf(address: string): string {
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
}

/**
 * THE CONTAINER A PROCESS'S CGROUP NAMES, or null when it names none. The names docker, containerd, podman, CRI-O,
 * kubernetes and LXC give their containers' cgroups, in both cgroup versions. A browser in a snap or a flatpak has a
 * scope of its own and no container name, so it is not taken for one. Inside a container whose cgroups are its own
 * the file says only `0::/`, which names none, so a server in a container and a program beside it read alike.
 */
export function theContainerACgroupNames(text: string): string | null {
  const scoped = /(docker|cri-containerd|libpod|crio)-([0-9a-f]{12,64})\.scope/.exec(text)
  if (scoped !== null) return `${scoped[1] ?? ''}:${scoped[2] ?? ''}`
  const pathed = /\/(docker|lxc|kubepods|lxc\.payload)[./]([^/\s]+)/.exec(text)
  if (pathed !== null) return `${pathed[1] ?? ''}:${pathed[2] ?? ''}`
  return null
}

export interface ProcessFacts {
  pid: number
  /** The process that started it. */
  parentPid: number
  /**
   * The parent as it is now, or null when it is no longer running.
   *
   * Null is the interesting answer: a process whose parent has gone is a process nobody is
   * waiting for. It is not the same as "unreadable" — a parent that exists and may not be
   * inspected is named in `couldNotRead` and this stays null only when the parent is really gone.
   */
  parent: OsProcess | null
  /** Where the process is running. Null when this user may not read it. */
  workingDirectory: string | null
  /**
   * True when the directory the process is running in has been DELETED.
   *
   * Linux keeps a deleted directory alive for as long as something is sitting in it, and marks
   * the link with " (deleted)". A dev server whose worktree was removed is still serving, out of
   * a directory that no longer exists, and this is the only sign of it.
   */
  workingDirectoryDeleted: boolean
  /**
   * The database files this process holds open, as absolute paths.
   *
   * This is how Mole Office answers "which corpus is that server serving" about a server that is not
   * this one. SQLite holds its file by descriptor, so this is the file being served whatever any
   * configuration says.
   */
  openDatabases: string[]
  /** What `MOLE_OFFICE_DB` was set to when it started. Null when nothing set it. */
  databaseAsked: string | null
  /**
   * Everything about this process that could not be read, in the kernel's words.
   *
   * Never silently empty. A process whose file descriptors this user may not list has an EMPTY
   * `openDatabases`, and without this list that would read as "it holds no database".
   */
  couldNotRead: string[]
}

/**
 * Everything Mole Office is allowed to ask the operating system.
 *
 * Keep this small. Every method added here is a method a Windows or Mac port has to write.
 */
/** What git says about a checkout. Every field is null when git could not answer, with the reason. */
export interface OsCheckout {
  /** The commit, full and short. Null when git could not answer. */
  head: { full: string; short: string } | null
  /** The branch, or null on a detached HEAD or when git could not answer. */
  branch: string | null
  /** Whether the working tree has uncommitted changes. Null when git could not answer. */
  dirty: boolean | null
  /** Whether this is a git worktree rather than the main clone. Null when git could not answer. */
  isWorktree: boolean | null
  /** What could not be read, in the words the machine used. Empty when everything was. */
  couldNotRead: string[]
}

/**
 * WHAT ONE AGENT TOOL ON THIS MACHINE SAYS ABOUT ITS OWN KEY, ASKED IN THE TOOL'S OWN WAY.
 *
 * `nobody-has-looked` IS A REAL ANSWER and not a failure. A tool whose store this probe does not
 * read, or a tool that is not installed, has not been checked: saying "not set" would be this office
 * reporting the absence of evidence as evidence of absence, which is the fifth invariant.
 */
export interface AgentToolKeyAnswer {
  state: 'set' | 'not-set' | 'nobody-has-looked'
  /** One plain sentence. Never any part of a key. */
  says: string
  /** Which command was run, or why none was, so a reader can check the answer. */
  asked: string
}

/**
 * EVERY OTHER FILE UNDER src/ THAT TOUCHES THE OPERATING SYSTEM, and what each one does with it.
 *
 * A port to another system writes another `OsProbe`, and it has to check each of these files too.
 * `assertLinux()` names them in its refusal, so this list is the one place they are written down.
 *
 * Every file under src/ that touches the operating system belongs here, and every file listed here
 * must exist. A search of PATH counts, so `src/config/runtimes.mjs` is listed. Each `does` finishes a
 * sentence that starts with the file's path.
 */
export const OTHER_FILES_THAT_TOUCH_THE_SYSTEM: readonly { file: string; does: string }[] = [
  { file: 'src/server/lib/adapters/os.ts', does: 'reads the whole process table from /proc' },
  {
    file: 'src/server/lib/adapters/index.ts',
    does: 'asks Node for the home folder, where the agent tools keep their sessions',
  },
  { file: 'src/worker/runtimes/os.ts', does: 'starts the agent tools and stops them by process group' },
  {
    file: 'src/config/runtimes.mjs',
    does: 'searches PATH for the agent tools, splitting it at each colon, and on Windows at each semicolon with each PATHEXT ending tried; and starts a .cmd there through cmd.exe',
  },
  {
    file: 'src/config/runtime-served.mjs',
    does: "reads a Codex run's rollout under CODEX_HOME or the home folder's .codex, and starts `opencode export` to read which model served an OpenCode run",
  },
  { file: 'src/config/sandbox-folder.mjs', does: "reads the user's home folder, under which the launcher makes the sandboxes' instance folders" },
  {
    file: 'src/config/settings.mjs',
    does: "reads a checkout's .git files, without starting git, to find the main checkout's .env file and the commit this checkout serves; asks Node for this user's temporary folder; and branches on the platform to name the per-user data folder, the folders the office looks in for lock files by default, and the worker's start file",
  },
  {
    file: 'src/config/guarded-git.mjs',
    does: "starts git to ask whether a run's folder tracks the rules file the run would read, and names /dev/null to git as the global config and the hooks folder of a command on a repository a sandbox can write, so git reads neither; whether git on Windows reads that path has never been tried",
  },
  {
    file: 'src/config/import-graph.mjs',
    does: 'runs the installed esbuild once for a typed page file whose import() may be a type, to tell a type from a runtime import',
  },
  {
    file: 'src/config/files-area.mjs',
    does: 'finds the homes on this machine from Node and from where this platform keeps them: /home and /root on Linux, /Users and /var/root on macOS, Users on the system drive on Windows',
  },
  {
    file: 'src/config/the-paths-of-a-system.mjs',
    does: "reads which platform this is, and answers from it how a path is written there, where the home and a program's local files are, and whether a file mode says who may read a file",
  },
  { file: 'src/config/start-folder.mjs', does: 'finds the homes on this machine from Node and from where files-area.mjs says this platform keeps them' },
  {
    file: 'src/config/install-the-entry.mjs',
    does: 'asks Node for the home folder, to find where Claude Code keeps its settings',
  },
  {
    file: 'src/config/the-mail-tool.mjs',
    does: 'starts systemctl --user to install the mail tool as a service of the logged-in person and to ask whether it runs, and asks Node for the home folder',
  },
  {
    file: 'src/config/the-service-command.mjs',
    does: 'starts the Mole Office service and the terminal holder, each in a process group of its own, and stops the service by signalling its group',
  },
  {
    file: 'src/config/the-office-tool-environment.mjs',
    does: "starts one tool of the stable checkout with this process's node, in that checkout and paired with this one, for tools/through-the-stable-checkout.mjs and for db:backup and db:prune-backups run in the development checkout, and waits for it to hand back its exit code",
  },
  {
    file: 'src/config/the-terminal-holder.mjs',
    does: 'starts the terminal holder detached, in a process group of its own, for mole-office start and for the start press on Terminal management',
  },
  {
    file: 'src/config/tmux-pane-view.mjs',
    does: "is the program the terminal holder runs to show an agent's tmux pane, and starts tmux to read that pane, attach to it in control mode and type into it",
  },
  {
    file: 'src/config/start-at-login.mjs',
    does: 'starts systemctl --user and loginctl to write, enable, start, stop and read the systemd user unit that starts the office at the login of the person',
  },
  {
    file: 'src/config/env-file-line.mjs',
    does: "asks Node for this user's temporary folder, where it reads the one line back on a scratch copy before it writes the .env file, and compares that file's owner with this process's user id, and on Windows reads this user's home folder instead",
  },
  {
    file: 'src/config/agent-key-reader.mjs',
    does: "compares the key file's owner with this process's user id, and reads which platform this is, to skip the file mode check on Windows and to give an example of a full path in the form that platform writes it",
  },
  {
    file: 'src/config/the-data-folder-move.mjs',
    does: "asks Windows, through PowerShell, for the type of the drive a new data folder would be on, which decides whether the place is on a network, and branches on the system through the path module to give a new folder mode 700 on Linux and the Mac",
  },
  {
    file: 'src/config/sandbox-memory-cap.mjs',
    does: "starts pkexec with systemctl to set or take away the memory limit of the sandboxes' slice, stops it by its process group when no dialog is answered, reads the limit with systemctl show, and reads this computer's total memory",
  },
  {
    file: 'src/holder/index.mjs',
    does: "holds the office's terminals as POSIX ptys, listens on a Unix socket, and ends a terminal through the system layer's group signal on Linux and the Mac; on Windows it holds them in ConPTY, listens on a named pipe, and ends a terminal with pty.kill()",
  },
  {
    file: 'src/desktop/main.mjs',
    does: 'runs the mole-office command with node, to start, restart or stop the service the window shows',
  },
  {
    file: 'src/desktop/starting-the-server-again.mjs',
    does: 'asks with signal 0 whether the server the window watches still runs',
  },
  {
    file: 'src/config/gate-count-spool.mjs',
    does: "asks Node for the home folder, whose sandboxes folder holds the gate-count spool, and makes the spool's folder and day files private with POSIX file modes",
  },
  {
    file: 'src/holder/private-sandbox-login.mjs',
    does: 'checks the Linux platform before offering a private login and reads its process group through the shared process reader; only a verified native adapter may own a child process',
  },
  {
    file: 'src/holder/private-sandbox-login-installed.mjs',
    does: "checks the Linux platform, reads the login press's installation record and the files it names in the home folder, and runs prlimit on the holder's own process to lower its core limit",
  },
  {
    file: 'src/holder/private-sandbox-login-pool-tool.mjs',
    does: "runs the host's pool tool through setpriv and prlimit as a process group of its own, and signals that group through the system layer only while its leader has the start time the shared process reader gave when it was started",
  },
  {
    file: 'src/holder/private-sandbox-login-setup-token.mjs',
    does: 'runs claude setup-token under a pty in a scratch home of its own under the temporary folder, and signals its process group through the system layer only while its leader has the start time the shared process reader gave',
  },
  {
    file: 'src/config/systems/the-system.mjs',
    does: "chooses each system's pieces by the platform: the process reader; the signal to a process group; the terminal holder's address, which is a Unix socket file on Linux and the Mac and a named pipe on Windows; how a key file is made private, by its file mode or by a Windows access list; and how a folder is linked, by a symbolic link or by a Windows directory junction; and which installer made a folder, asked of dpkg on Linux and of this user's Installed apps on Windows",
  },
  {
    file: 'src/config/systems/posix-groups.mjs',
    does: 'signals a process group with a negative pid, for the worker, the terminal holder, the service command and the memory limit press',
  },
  {
    file: 'src/config/systems/windows-commands.mjs',
    does: "runs PowerShell for the Windows process reader, the Windows group signal, the Windows probe's reading of a starter's Job Object, the Windows probe's reading of who holds a connection, the Windows access list of a key file and the Windows question of which installer made a folder",
  },
  {
    file: 'src/config/systems/windows-processes.mjs',
    does: 'reads one Windows process at a time through PowerShell and Get-CimInstance Win32_Process, which has run on a Windows 11 machine, and who holds one connection to this server through calls to Windows itself, compiled with Add-Type, which has not been run on Windows',
  },
  {
    file: 'src/config/systems/windows-groups.mjs',
    does: "ends a Windows group by ending every process in the group's Job Object through PowerShell, which has not been run on Windows",
  },
  {
    file: 'src/config/systems/windows-private-files.mjs',
    does: "sets a key file's access list through PowerShell to this user alone and reads it back, which has not been run on Windows",
  },
  {
    file: 'src/config/systems/the-installer-of-a-folder.mjs',
    does: "asks which installer made a folder: dpkg-query on Linux, after it reads APPIMAGE and APPDIR for an AppImage's mount, and this user's Installed apps in the registry through PowerShell on Windows, which has run on a Windows 11 machine",
  },
]

/** The fixed avatar codec's input and bounds; no executable, command or child program is accepted. */
export interface AvatarCodecRequest {
  bytes: Buffer
  entry: string
  format: string
  side: number
  pixels: number
  dispositions: Readonly<Record<string, string>>
  timeoutMs: number
  maxBufferBytes: number
}

export interface OsProbe {
  /** One synchronous native avatar upload in the server's group, with an owner watchdog. No other program runs. */
  runAvatarCodec?(input: AvatarCodecRequest): { status: number | null; stdout: Buffer; stderr: Buffer; error?: Error }
  /** What this implementation is for, e.g. 'linux'. Reported so a wrong answer is traceable. */
  readonly platform: string
  /** One process by pid, or null when nothing is running under that number. */
  processById(pid: number): OsProcess | null
  /**
   * Every process in a group, leader included.
   *
   * A release kills a process GROUP, so the person confirming it has to be shown every process
   * that will die, not just the one they can see. Without this the release action cannot fill
   * its `alsoAffects` list honestly, and the contract says an action that cannot be described
   * must not be offered at all — so no button appears.
   */
  processesInGroup(pgid: number): OsProcess[]
  /**
   * Every process on the machine at once, with its working directory.
   *
   * This is what the session sweep reads. It asks for the whole table rather than one pid at a
   * time because `GET /api/sessions` decides "is this one still alive?" about every session on the
   * machine in a single request, and it needs the working directory, which `processById` does not
   * carry — a running agent is tied to the project it is working in by its cwd.
   *
   * IT REPORTS A FAILURE RATHER THAN THROWING, and it is the only method here that does.
   * `{ok:false, reason}` is never an empty list: an empty list means every session is dead, and a
   * failure means Mole Office could not look. The caller has somewhere honest to put the difference —
   * the session's state becomes `unknown` with the reason printed beside it — whereas a throw
   * would turn a page that says what it does not know into a page that does not load.
   *
   * OPTIONAL, AND ONE OF TWO OPTIONAL METHODS ON THIS INTERFACE — `processFacts` below is the
   * other, and it is optional for the same reason. It was made optional because three
   * test files owned by another agent built a probe of ports and locks with no process table, and
   * that reason has expired — the tests are all one owner's now. It stays optional on its own
   * merits: a probe is an object chosen at run time, so an incomplete one can arrive whatever the
   * declared type says, and the honest answer to "what is running" then has to be a refusal.
   *
   * A probe that omits it does NOT quietly fall back to the real machine. `currentProcessTable` in
   * adapters/os.ts answers "this probe does not describe a process table", naming the probe, and
   * that reaches the page as a session state of `unknown` with the sentence beside it. The test is
   * "does not round a probe with no process table up to the real machine" in tests/sessions.test.ts,
   * which deletes the method on purpose and asserts the refusal — so the `?` is exercised rather
   * than merely tolerated.
   *
   * A port to another operating system must implement it. Without it the session list cannot say
   * what is running on that machine at all.
   */
  processTable?(): ProcessScan
  /**
   * The rest of what the kernel knows about one process: who started it, where it is running,
   * and which database files it holds open.
   *
   * SEPARATE FROM `processById` BECAUSE IT COSTS MORE. This opens the process's file descriptor
   * directory and its environment block, which `processById` does not, and `processById` is
   * called once per ledger row on every report. Asking for these facts is a deliberate act.
   *
   * OPTIONAL, FOR THE SAME REASON `processTable` IS. A probe is an object chosen at run time, so
   * one that does not implement this can arrive whatever its declared type says. A caller that
   * asks for facts a probe cannot give gets a refusal naming the probe — never a fall-back to
   * the real machine, and never a made-up "no parent, no database, nothing held open", which
   * would read as evidence.
   *
   * A port to another operating system must implement it. Without it Mole Office cannot tell a live
   * dev stack from a supervisor whose server has died, which is the whole of what
   * `serversOnThisMachine` reports.
   */
  processFacts?(pid: number): ProcessFacts | null
  /**
   * WHICH PROGRAM ONE PROCESS RUNS, AND ITS ARGUMENTS ONE BY ONE, so a path with a space in it stays one argument.
   * `processById` joins the arguments with spaces into `command`, and that cannot be split back. orphanReport asks it,
   * to tell this office's own dev supervisor. It answers which file it could not read rather than throwing.
   *
   * OPTIONAL, AND THE MACOS PROBE HAS NONE: ps's command column has no argument boundaries. A caller without it reads
   * the words of `command`, and says that it did wherever the answer is shown.
   */
  programAndArguments?(pid: number): OsProgramAndArguments
  /**
   * THE CGROUP A PROCESS SITS IN, as the "0::" line of /proc/<pid>/cgroup gives it (cgroup v2), or null when it has
   * none or it cannot be read. Asked to tell which GPU booking a process on the card belongs to: a program that
   * starts its workers under setsid gives each a process group of its own, and setsid keeps the cgroup, so the
   * workers sit in the booked group's scope (theBookingThatCounts in lib/bookings.ts).
   *
   * OPTIONAL, for the reason `processTable` is. A probe without it answers no cgroup, and a booking then counts a
   * process by its sandbox or its process group alone, as before.
   */
  cgroupOf?(pid: number): string | null
  /**
   * THE PROGRAMS A STARTER LEFT RUNNING IN ITS JOB OBJECT AFTER IT ENDED, on Windows: the processes in the Job Object
   * named for `starter` (`theJobObjectOf` in src/config/systems/windows-groups.mjs) whose parent is `starter`. An empty
   * list means no such Job Object exists, or it holds no child of the starter. A failure to read is said, never an
   * empty list. `processLiveness` asks it about a row this office started whose pid has ended.
   *
   * On Windows this office starts a program through a starter (src/config/systems/windows-starts.mjs), and a row
   * records the starter's pid. The starter makes the Job Object, starts the program in it and waits for it. It ends
   * when the program that asked for the start ends, and the program goes on.
   *
   * OPTIONAL, AND ONLY THE WINDOWS PROBE HAS IT. On Linux and the Mac a row records the program itself, so a row whose
   * pid has ended is read as gone, as before.
   */
  programsOfAnEndedStarter?(starter: number): { read: true; programs: OsProcess[] } | { read: false; reason: string }
  /**
   * THE SYSTEM LAYER'S GROUPS THIS PROBE STOPS A GROUP THROUGH, where they are its own: the Windows probe's, over the
   * PowerShell it reads with, so that a test which stands Windows in hands in the stop pipe too. OPTIONAL: elsewhere
   * they are the platform's (`theGroupsOf` below).
   */
  readonly groups?: TheGroups
  /**
   * THE SAME READINGS AS `processById` AND `programsOfAnEndedStarter`, MADE WITHOUT HOLDING THE SERVER'S THREAD.
   * OPTIONAL, AND ONLY THE WINDOWS PROBE HAS THEM: there each reading runs PowerShell, which takes about a second, and
   * the server answers nothing else while it waits. `readFirst` below asks them. Where they are absent, the readings
   * above do not wait on another program, and are made when they are asked.
   */
  readProcessById?(pid: number): Promise<OsProcess | null>
  readProgramsOfAnEndedStarter?(starter: number): Promise<{ read: true; programs: OsProcess[] } | { read: false; reason: string }>
  /**
   * ONE READING OF EVERY PROCESS, MADE WITHOUT HOLDING THE SERVER'S THREAD, WHICH ANSWERS EVERY QUESTION ABOUT ONE
   * PROCESS THAT THE ACT ASKS WHILE IT RUNS. A reading that failed is thrown at each question, and an act that returns
   * a promise is refused. OPTIONAL, AND ONLY THE WINDOWS PROBE HAS IT: `readFirst` below asks it when its caller does.
   */
  readEveryProcessFirst?<T>(act: () => T): Promise<T>
  /**
   * WHICH PROGRAM ON THIS COMPUTER SENT A CONNECTION TO THIS SERVER, and whether it runs in a container other than
   * this server's own. A decision, of 26 September 2026, says that nothing that comes from a sandbox is the person,
   * and that the office finds that out itself rather than trusting the sandbox to say it.
   * `peer` is the connection's far end as
   * the server's socket sees it, `ours` the server's own end. Null when no such connection is in the kernel's table.
   *
   * OPTIONAL, for the reason `processFacts` is. A caller that finds it missing, and finds no `readSenderOfAConnection`
   * either, does not guess: it treats the sender as not found, which for the one question it serves means "not the
   * person". Where only `readSenderOfAConnection` is there, a question asked this way refuses in words unless the
   * answer was read first (lib/from-a-sandbox.ts).
   */
  senderOfAConnection?(peer: { address: string; port: number }, ours: { address: string; port: number }): OsSender | null
  /**
   * THE SAME ANSWER, MADE WITHOUT HOLDING THE SERVER'S THREAD. Only the Windows probe has it, inside the installed app,
   * where the answer runs PowerShell, and there it has no `senderOfAConnection`. lib/from-a-sandbox.ts reads it before
   * a request the key window would count, and keeps it.
   */
  readSenderOfAConnection?(peer: { address: string; port: number }, ours: { address: string; port: number }): Promise<OsSender | null>
  /**
   * SET WHEN THE PROBE RECOGNISES ONLY THE INSTALLED APP'S OWN WINDOW as a connection's sender, as the Mac's and
   * Windows' probes do inside the installed app. A browser on this computer is then never one of this computer's own
   * programs. The sentence about pairing is read from this (`whomThisComputerFinds` in lib/from-a-sandbox.ts).
   */
  readonly findsOnlyTheAppsOwnWindow?: true
  /** Every socket in the LISTEN state. */
  listeningPorts(): OsPort[]
  /**
   * THE SOCKETS IN THE LISTEN STATE ON ONE PORT, which is `listeningPorts()` with only that port's entries, in the same
   * order. A port row asks only this. On Linux it walks every /proc/<pid>/fd only when something listens on the port,
   * so a row whose server has exited costs two small reads rather than a walk of every process's descriptors.
   * Optional, because a probe that does not narrow is asked `listeningPorts()` and the entries are picked out of it.
   */
  listeningOn?(port: number): OsPort[]
  gpu(): OsGpu
  containers(): OsContainers
  /**
   * THE SAME LISTS AS `gpu` AND `containers`, MADE WITHOUT HOLDING THE SERVER'S THREAD: nvidia-smi and docker run while it
   * goes on. OPTIONAL. The Linux probe has them, and the Windows probe borrows them from it. `readFirst` below asks them
   * only on Windows, and only when its caller asks for the machine's lists.
   */
  readGpu?(): Promise<OsGpu>
  readContainers?(): Promise<OsContainers>
  /**
   * THE HOST PID OF A RUNNING CONTAINER'S FIRST PROCESS, as docker reports it.
   *
   * A container has its own pid namespace, so a process inside it knows itself by one number and
   * this machine knows it by another. The first process is the fixed point that joins the two
   * numberings: docker says which host pid it is, and `pidNamespaceOf` then reads which namespace
   * the container's processes are in. `theHostPidOfAProcessInAContainer` below is the one caller.
   *
   * `id` is the container's full id, as `containers()` lists it, so the question is asked about a
   * container that was just seen running rather than about a name that could mean something else.
   *
   * IT REPORTS RATHER THAN THROWING, like `containers()`: docker being absent or its daemon being down
   * is a normal state of a machine, and the caller refuses in words.
   *
   * OPTIONAL, like `processTable` above and for the same reason: a probe is an object chosen at run
   * time, and one that cannot look inside a container says so by not having the method. A caller then
   * refuses and names the probe; it never falls back to treating the container's pid as a host pid.
   */
  containerFirstProcess?(id: string): OsContainerFirstProcess
  /**
   * Read whether one named container stopped, with its exit code and finish time. Optional as
   * containerFirstProcess is. An absent method or a failed question never means the container is gone.
   */
  containerState?(name: string): OsContainerState
  /**
   * WHICH PID NAMESPACE ONE PROCESS IS IN, AND WHAT IT IS CALLED IN EACH NAMESPACE THAT CAN SEE IT.
   *
   * Two small reads of `/proc/<pid>`: the `ns/pid` link and the `NSpid` line of `status`. They are
   * what turns "pid 8 in that container" into a host pid: the host process whose namespace is the
   * container's and whose innermost pid is 8. The matching itself is done by
   * `theHostPidOfAProcessInAContainer` below, not here, so a fake probe can drive every case of it.
   *
   * Null when nothing is running under that pid. It THROWS when the process exists and may not be
   * read, as `processById` does: the kernel lets this user read another process's namespace only when
   * the process runs as the same user, and "not readable" must never be read as "not there".
   *
   * OPTIONAL, for the reason `containerFirstProcess` above is.
   */
  pidNamespaceOf?(pid: number): OsPidNamespace | null
  /**
   * THE ONE-MINUTE LOAD AND THE MEMORY NEW WORK CAN HAVE (MemAvailable), IN BYTES, read now. Wave 13j round loop-1: the
   * message worker in merges-only mode starts a further check only while the load is under 16 and 24 GiB is free, and it
   * asks the office for these two numbers rather than touching the machine itself. Each is null where it could not be
   * read, and a null refuses the further check.
   *
   * OPTIONAL, for the reason `containerFirstProcess` above is: a probe without it is answered as two nulls.
   */
  machineNow?(): { loadOneMinute: number | null; freeBytes: number | null }
  /**
   * THE BYTES FREE ON THE ROOT FILE SYSTEM, AS `df -B1 /` COUNTS THEM IN ITS AVAILABLE COLUMN: the blocks a process
   * without special rights may still write, times the block size, read now. The office hands out no new test-batch
   * seat while this is under its gate row's limit (lib/slots.ts). Null where it could not be read.
   *
   * OPTIONAL, for the reason `containerFirstProcess` above is: a probe without it is answered as null.
   */
  rootFreeBytes?(): number | null
  /** Lock files directly under each of `paths`. A path may be a directory or a single file. */
  locks(paths: readonly string[]): OsLocks
  /**
   * What git says about a checkout: its commit, its branch, whether the tree is dirty, and whether
   * it is a worktree rather than the main clone.
   *
   * ONE METHOD RATHER THAN A GENERAL "RUN A COMMAND", for the reason the header of
   * `src/server/api/export.ts` gives: a general escape hatch is the boundary undone. This asks one
   * question with one answer, and a port to another operating system implements it or reports that
   * it cannot.
   *
   * IT REPORTS RATHER THAN THROWING. A machine with no git installed, or a directory that is not a
   * checkout, is a normal state — `GET /api/runtime` still answers, with the commit null and the
   * reason in `couldNotRead`. A throw would turn a reply that says what it does not know into a
   * reply that does not arrive.
   *
   * OPTIONAL, AND THE THIRD OPTIONAL METHOD HERE, for the same reason as `processTable` above: a
   * probe is an object chosen at run time, so an incomplete one can arrive whatever the declared
   * type says. A probe that omits it does NOT quietly fall back to the real machine — the runtime
   * record answers "the probe installed for this read does not describe a checkout", names the
   * probe, and leaves the commit null. Nine test files build probes of processes and ports with no
   * git in them, and a runtime record read through one of those has to say so rather than reaching
   * past the probe to the disk.
   *
   * A port to another operating system implements it. Without it nothing can say which commit a
   * server is running.
   */
  checkout?(root: string): OsCheckout
  /**
   * START THE MESSAGE WORKER, IN ITS OWN PROCESS GROUP. The one thing this product starts.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THERE IS A METHOD HERE AT ALL, AND WHY IT IS THIS NARROW
   * ---------------------------------------------------------------------------------------
   *
   * `OsProbe` has no general "run a command" method, on purpose: a web server that runs arbitrary
   * commands is a different and much more dangerous product, and the header of
   * src/server/api/export.ts is that argument in full. Nothing here weakens it. This method takes
   * no command — it starts the worker the way `howToStart('worker')` in src/config/settings.mjs says, with the arguments it is given,
   * and that file is in this checkout.
   *
   * Mole Office may start processes on this machine
   * (proposal `LVH7c4IrtwIE`, decision `oaJ-pSntZ3m-`). Criterion M9 says what may be started and by what: a worker, which starts agent
   * tools. So the server starts one worker, and the worker starts the tools.
   *
   * Its own process group, so one signal ends the worker and everything it started in turn, and so
   * the ledger row can be stopped by group the way every other row is.
   *
   * OPTIONAL, like `processTable` and `checkout` above, and for the same reason: a probe that
   * cannot start a process says so by not having the method, rather than by having one that throws.
   * The caller writes down that no worker was started and why, and the server serves on without one.
   */
  /** Start this office’s own service restart command with its response handshake. No other command is accepted. */
  startTheRestartCommand?(input: { cwd: string; logPath: string; env: NodeJS.ProcessEnv }): ReturnType<typeof spawn>
  /** Start the data folder mover, `data-folder move <to>` of this office's service command, in a group of its own. */
  startTheDataFolderMover?(input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }): ReturnType<typeof spawn>
  startTheMessageWorker?(input: { args: readonly string[]; cwd: string; logPath: string }): { pid: number; pgid: number }
  /**
   * START THE HOST JOB RUNNER, in a process group of its own, the way `howToStart('host-job-runner')` says, with the
   * arguments it is given, and say when it ends. Like the worker it takes no command: the runner runs only the host
   * tools the office's own file registers, and src/server/lib/host-job-runner.ts is the one caller.
   *
   * OPTIONAL, for the reason `startTheMessageWorker` is. The Mac and Windows probes do not have it yet.
   */
  startTheHostJobRunner?(input: { args: readonly string[]; cwd: string; logPath: string }): {
    pid: number
    pgid: number
    ended: Promise<{ code: number | null; signal: string | null; error: string | null }>
  }
  /**
   * EVERY TMUX PANE ON THIS MACHINE, from `tmux list-panes -a -F <format>`, one pane to a line. An agent's page asks
   * this to find the pane on the agent's terminal (src/server/lib/agent-pane.ts, which owns the format and reads its
   * lines). Only the format is the caller's, so this runs no other tmux command.
   *
   * `missing` is true when tmux is not on this server's PATH, which the page says apart from tmux refusing.
   *
   * OPTIONAL, for the reason `startTheMessageWorker` is: a probe that cannot run tmux says so by not having it.
   */
  tmuxPanes?(format: string): Promise<{ ok: true; out: string } | { ok: false; missing: boolean; out: string }>
  /** Remove idle check worktrees only when the office recorded that their check ended. */
  sweepCheckWorktrees?(checks: { id: string; ended: boolean; state: string }[]): Promise<{ removed: number; kept: number; lines: string[] }>
  /** Mole Office's own process group, so the ledger can refuse to kill itself. */
  /**
   * WHAT THIS MACHINE CALLS ITSELF, or null because this probe cannot say.
   *
   * Criterion M63: a message records where it was written from, and a message written on this
   * machine is written on the one Mole Office is running on. It is here rather than read straight
   * out of `node:os` by whoever wants it because this file's own rule says so — anything describing
   * what the machine IS belongs on this interface.
   *
   * OPTIONAL, for the reason `processTable` above is optional: a probe is an object chosen at run
   * time, so one that does not implement this can arrive whatever the declared type says. A caller
   * that gets nothing here has to say nobody could name the machine, and never guess one.
   */
  machineName?(): string | null
  /**
   * EVERY ADDRESS THIS MACHINE'S NETWORK INTERFACES CARRY, at the moment of asking, loopback left out.
   *
   * LOOPBACK IS LEFT OUT BY THE OPERATING SYSTEM'S OWN WORD: an address Node marks `internal` is on
   * the loopback interface. Loopback has its own door, which stamps every request this machine, so a
   * loopback address never counts at the door other machines reach. The flag is asked rather than the
   * address's first digits, so the one list says both which addresses are this machine's and which of
   * them are loopback.
   *
   * A decision, the owner's, of 25 September 2026, says that a request whose connection comes from one of this
   * machine's own addresses counts as this machine. The door bound to the address other
   * machines reach asks this on every request, through `anAddressOfThisMachine` in
   * src/server/lib/machines.ts. It is asked then and not kept, because an address can appear after the
   * server starts: a tailnet comes up later than the office does.
   *
   * OPTIONAL, for the reason `processTable` above is optional. A probe that does not implement it
   * cannot say which addresses are this machine's, and then no connection is counted as this machine
   * by its address. That is the answer the door gave before the decision, so nothing is granted by
   * an incomplete probe.
   */
  ownAddresses?(): readonly string[]
  /**
   * THIS MACHINE'S OWN NAME IN ITS TAILNET, from `tailscale status --json`: the DNSName of Self, read by
   * `ownTailnetNameIn` below. Null when tailscale is not on this server's PATH, fails, runs past its limit or
   * names no such name.
   *
   * The Host check in src/server/lib/a-host-that-is-not-this-office.ts takes this name at the door other machines
   * reach. It reads it at the server's start and every few minutes, and never because of a request. This is the one
   * place the office starts tailscale.
   *
   * OPTIONAL, for the reason `ownAddresses` above is optional. A probe that does not implement it holds no tailnet
   * name, and then the Host check takes no such name, which is the answer it gave before this was read.
   */
  ownTailnetName?(): Promise<string | null>
  /**
   * WHETHER ONE OF THE AGENT TOOLS ON THIS MACHINE HOLDS A KEY, ASKED THE TOOL'S OWN WAY.
   *
   * Criterion U2's read-only half. The office hands claude-code, codex and opencode no key: each
   * finds its own. So the office asks the tool itself where the tool has a command for it — codex's
   * `login status`, opencode's `auth list` — and answers `nobody-has-looked` where its store is one
   * this office does not read. The command runs HERE rather than in a route, so the one file allowed
   * to start a process stays the one file allowed to start a process.
   *
   * OPTIONAL, FOR THE REASON `processTable` ABOVE IS: a probe built by a test may not describe this,
   * and a caller that asks gets an honest "nobody has looked" rather than a fall-back to the real
   * machine. NEVER A KEY: the answer is one of three words, a sentence and the command it ran.
   *
   * `system` is the one `whereIsThisTool` and `theWayToStart` read, this machine unless a test names another.
   */
  whatAnAgentToolSaysAboutItsKey?(which: 'claude-code' | 'codex' | 'opencode', system?: TheSystem): AgentToolKeyAnswer
  /**
   * WHICH PROGRAM OF A NAME IS ON THE PATH OF `env`, AND WHAT VERSION IT SAYS IT IS: `<program> --version`, run
   * once with `env` as its whole environment. The caller gives the environment a terminal gets, which holds no key.
   *
   * The harness list on Terminal management asks it for each agent tool the office runs
   * (src/server/lib/harnesses.ts). It takes a program's name and runs that program with the one argument
   * `--version` and no shell, so it is not a general "run a command". The answer is read by
   * `theVersionItPrinted` in src/config/runtimes.mjs, the same reading the worker gives the program that
   * ran a run, so the two cannot disagree about what a version is.
   *
   * IT IS ASYNCHRONOUS, unlike the methods above, because the list asks several tools at once from a
   * request, and a tool that hangs must not hold this server for VERSION_MUST_ANSWER_WITHIN_MS. It never
   * throws: a program that is not there, will not start, is stopped or prints nothing is an answer.
   *
   * OPTIONAL, for the reason `processTable` above is. A caller that finds it missing says that the
   * version was not read and why; it never reaches past the probe to the machine.
   */
  theVersionOfAProgram?(program: string, env: Readonly<Record<string, string>>): Promise<{ path: string | null; version: string; versionWasRead: boolean }>
  ownProcessGroup(): number
  /** Signal a whole process group. The caller has already decided this is allowed. */
  killProcessGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): void
  /**
   * START THE DETACHED NODE HELPER THE OVERDUE HAND-BACK READER SPEAKS TO OVER IPC, in a group of its own.
   * Optional, for the reason `processTable` is: a probe a test builds may not start one, and the reader then
   * answers that it is unavailable rather than reaching past the probe to the machine.
   */
  startTheOverdueHandBackHelper?(script: string): ReturnType<typeof spawn>
  /** Stop a container by name. Throws when docker is not usable. */
  stopContainer(name: string): void
}

// ============================================================================ local time

/**
 * `localTime` is `localStamp` from lib/records.ts, under the name this file already used for it.
 *
 * It used to be a copy, for the reason that helper was not exported. It is now, so there is one
 * implementation of "what a Mole Office timestamp looks like" and one place the local-not-UTC
 * decision is written down. The alias is kept because `localTime(info.mtime)` reads well at the
 * call sites below, and renaming forty of them would bury this change in noise.
 */
const localTime = localStamp

export { parseLocalTime } from '../db/the-processes-a-listing-reads.ts'

/** How long something has been going on: the number, and the phrase a person reads. */
export interface Age {
  seconds: number
  /** "11 days", "3 hours", "40 minutes". That idle simulation read "11 days". */
  human: string
}

export { humanAge } from '../db/the-processes-a-listing-reads.ts'

export { ageOrNull } from '../db/the-processes-a-listing-reads.ts'

export { ageSince } from '../db/the-processes-a-listing-reads.ts'

// ============================================================================ the Linux probe

/** Turn "0100007F" into "127.0.0.1". /proc writes each 32-bit word little-endian. */
function hexToIpv4(hex: string): string {
  const bytes: number[] = []
  for (let i = 0; i < 8; i += 2) bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  return bytes.reverse().join('.')
}

/** Turn 32 hex characters into an IPv6 address, with the usual :: compression. */
function hexToIpv6(hex: string): string {
  const bytes: number[] = []
  for (let word = 0; word < 4; word += 1) {
    const chunk = hex.slice(word * 8, word * 8 + 8)
    const wordBytes: number[] = []
    for (let i = 0; i < 8; i += 2) wordBytes.push(Number.parseInt(chunk.slice(i, i + 2), 16))
    bytes.push(...wordBytes.reverse())
  }
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) {
    const hi = bytes[i] ?? 0
    const lo = bytes[i + 1] ?? 0
    groups.push(((hi << 8) | lo).toString(16))
  }
  // Compress the longest run of zero groups, which is what makes ::1 and :: readable.
  let bestStart = -1
  let bestLen = 0
  let runStart = -1
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === '0') {
      if (runStart === -1) runStart = i
    } else if (runStart !== -1) {
      const len = i - runStart
      if (len > bestLen) {
        bestLen = len
        bestStart = runStart
      }
      runStart = -1
    }
  }
  if (bestLen < 2) return groups.join(':')
  const head = groups.slice(0, bestStart).join(':')
  const tail = groups.slice(bestStart + bestLen).join(':')
  return `${head}::${tail}`
}

/**
 * A `/proc/<pid>/cwd` link, split into the directory and whether it has been deleted.
 *
 * Linux keeps a deleted directory alive for as long as a process is sitting in it, and marks the
 * link " (deleted)". That suffix is the ONLY sign of it, and a reader that keeps it in the path
 * reports a directory nobody can go and look at.
 *
 * Its own function so it can be tested. Making a process whose working directory has been deleted
 * means starting a process and removing a directory under it, and the session that wrote this was
 * not permitted to start one. It was checked by hand instead, against pid 2593445 on this machine
 * on 27 August 2026 — a Vite left in a removed worktree under the home folder — which read back
 * its path with `deleted: true`.
 */
export function directoryFromLink(link: string): { path: string; deleted: boolean } {
  const mark = ' (deleted)'
  if (!link.endsWith(mark)) return { path: link, deleted: false }
  return { path: link.slice(0, -mark.length), deleted: true }
}

/** Names that mean "something is holding this". Matched on the file name only. */
const LOCK_NAME = /(^|[.-])lock$|\.lock$|\.lck$|^\.lock/i

/** How long a command run by `runCommand` or `runCommandWaiting` may take, and how much it may print. */
const A_COMMANDS_LIMITS = { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }

/**
 * Run a command and hand back what happened, without ever throwing.
 *
 * Absence of the command and failure of the command are different facts and the callers say
 * different things about them, so they are kept apart here rather than merged into "no data".
 * Git is not run through this: see `readGit`.
 */
function runCommand(command: string, args: string[]): ACommandsEnd {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    ...A_COMMANDS_LIMITS,
    windowsHide: true,
  })
  return theEndOf(command, r.error, r.signal, r.status, r.stdout ?? '', r.stderr ?? '')
}

/** How a command ended, as `runCommand` and `runCommandWaiting` say it. */
type ACommandsEnd = { ok: true; stdout: string } | { ok: false; missing: boolean; reason: string }

/**
 * `runCommand` BY THE WAY THAT WAITS: the command runs while the server's thread goes on, with the same limits, and its
 * end is said in the same words. A command that runs out of time is said to have been ended by its signal here.
 */
function runCommandWaiting(command: string, args: string[]): Promise<ACommandsEnd> {
  return new Promise((done) => {
    execFile(command, args, { encoding: 'utf8', ...A_COMMANDS_LIMITS, windowsHide: true }, (error, stdout, stderr) => {
      // execFile puts an exit status other than 0, a signal and a failure to start all on its error.
      const status = error === null ? 0 : typeof error.code === 'number' ? error.code : null
      const signal = error?.signal ?? null
      done(theEndOf(command, error !== null && status === null && signal === null ? error : undefined, signal, status, stdout, stderr))
    })
  })
}

function theEndOf(
  command: string,
  error: Error | undefined,
  signal: NodeJS.Signals | null,
  status: number | null,
  stdout: string,
  stderr: string,
): ACommandsEnd {
  if (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { ok: false, missing: true, reason: `${command} is not installed on this machine` }
    }
    return { ok: false, missing: false, reason: `${command} could not be run: ${error.message}` }
  }
  if (signal) {
    return { ok: false, missing: false, reason: `${command} did not finish (killed by ${signal})` }
  }
  if (status !== 0) {
    const first = stderr.trim().split('\n')[0] ?? ''
    return { ok: false, missing: false, reason: `${command} exited ${status}${first ? `: ${first}` : ''}` }
  }
  return { ok: true, stdout }
}

/**
 * THIS MACHINE'S TAILNET NAME IN THE TEXT `tailscale status --json` WRITES: the DNSName of Self, with the final dot
 * tailscale writes taken off, in lower case. Null when the text is not JSON, names no Self, or gives Self no DNSName
 * or an empty one. It takes the text, so what is read from it can be proved without running tailscale.
 */
export function ownTailnetNameIn(status: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(status)
  } catch {
    // Text that is not JSON names nothing, whatever wrote it.
    return null
  }
  const self = typeof parsed === 'object' && parsed !== null ? (parsed as { Self?: unknown }).Self : undefined
  if (typeof self !== 'object' || self === null) return null
  const named = (self as { DNSName?: unknown }).DNSName
  if (typeof named !== 'string') return null
  const name = (named.endsWith('.') ? named.slice(0, -1) : named).toLowerCase()
  return name === '' ? null : name
}

/** What nvidia-smi is asked: the GPU's compute processes. */
const THE_GPUS_LIST = ['--query-compute-apps=pid,used_gpu_memory,process_name', '--format=csv,noheader,nounits']

/** The GPU's list, from how nvidia-smi ended. */
function theGpusListIn(r: ACommandsEnd): OsGpu {
  if (!r.ok) {
    return {
      available: false,
      reason:
        `${r.reason}, so GPU memory could not be read. This is NOT a reading of zero — ` +
        'something may well be holding the GPU.',
    }
  }
  const processes: { pid: number; usedMib: number; name: string }[] = []
  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const parts = trimmed.split(',').map((p) => p.trim())
    const [pid, mib] = parts
    if (pid === undefined || mib === undefined || !/^\d+$/.test(pid)) continue
    processes.push({ pid: Number(pid), usedMib: Number(mib), name: parts.slice(2).join(', ') })
  }
  // An empty list here IS a real reading: nvidia-smi answered and named no compute process.
  // That is a different fact from the branch above and the two must not be merged.
  return { available: true, processes }
}

/** What docker is asked: the running containers. */
const THE_RUNNING_CONTAINERS = ['ps', '--no-trunc', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}']

/** The running containers, from how docker ended. */
function theContainersIn(r: ACommandsEnd): OsContainers {
  if (!r.ok) {
    return {
      available: false,
      reason: `${r.reason}, so running containers could not be listed. This is not a reading of none.`,
    }
  }
  const containers: { id: string; name: string; image: string; status: string }[] = []
  for (const line of r.stdout.split('\n')) {
    if (line.trim() === '') continue
    const [id, name, image, status] = line.split('\t')
    // The format string above asks for four fields, so a line with fewer means docker is no
    // longer answering the question that was put to it. This used to drop such a row when the id
    // or the name was missing and fill in `''` for a missing image or status, so a container
    // whose state nobody knows drew as a blank cell and a container nobody could name did not
    // draw at all -- both indistinguishable from a real reading. There is no honest partial
    // answer to give here: what was parsed out of a format that is not being honoured cannot be
    // trusted either, so the whole reading is refused with the line that broke it.
    if (id === undefined || name === undefined || image === undefined || status === undefined) {
      return {
        available: false,
        reason:
          `docker ps answered with a line carrying ${line.split('\t').length} tab-separated field` +
          `${line.split('\t').length === 1 ? '' : 's'} and not the 4 its --format asked for ` +
          `(${JSON.stringify(line.slice(0, 200))}), so what is running could not be read. This is not a ` +
          'reading of none, and it is not a reading of the containers above it either — a status or an ' +
          'image guessed at as "" would draw as a fact.',
      }
    }
    containers.push({ id, name, image, status })
  }
  return { available: true, containers }
}

/**
 * Run a command and hand back BOTH STREAMS AS ONE ANSWER, or say why it could not be run.
 *
 * SOME TOOLS ANSWER ON STANDARD ERROR. Measured on this machine on 13 September 2026: `codex login
 * status` exits 0 with an empty stdout and the words `Logged in using ChatGPT` on stderr. A reader
 * that looked only at stdout would report that as an answer it did not understand, which is not what
 * happened. This is used only by `whatAnAgentToolSaysAboutItsKey`, which is reading what a tool says
 * about its own key and has no use for which stream it chose.
 *
 * THE COMMAND IS FOUND ON THE SERVER'S OWN PATH FIRST, and what was found is started the way `theWayToStart` in
 * src/config/runtimes.mjs gives it. On Windows npm installs codex.cmd and opencode.cmd. Node does not find a .cmd
 * by its bare name, and it will not start one without cmd.exe. A command that is not found is not installed. A
 * start that fails after that, or a word `theWayToStart` refuses, is a command that could not be run.
 */
function runCommandReadingBothStreams(
  command: string,
  args: string[],
  system?: TheSystem,
): { ok: true; stdout: string } | { ok: false; missing: boolean; reason: string } {
  const where = whereIsThisTool(command, process.env, system)
  if (where === null) return { ok: false, missing: true, reason: `${command} is not installed on this machine` }
  let way: ReturnType<typeof theWayToStart>
  try {
    way = theWayToStart(where, args, system)
  } catch (err) {
    // The refusal ends with a full stop of its own, and the caller puts one after this reason.
    return { ok: false, missing: false, reason: `${command} could not be run: ${(err as Error).message.replace(/\.$/u, '')}` }
  }
  const r = spawnSync(way.command, way.args, {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
    // The server's own environment, except that a Codex gets only the names its list keeps
    // (src/config/the-environment-a-codex-gets.mjs). Undefined is the server's own.
    env: aCommandsProgram([command]).isCodex ? theEnvironmentACodexGets(process.env) : undefined,
    windowsVerbatimArguments: way.windowsVerbatimArguments,
    windowsHide: true,
  })
  if (r.error) {
    return { ok: false, missing: false, reason: `${command} could not be run: ${r.error.message}` }
  }
  if (r.signal) {
    return { ok: false, missing: false, reason: `${command} did not finish (killed by ${r.signal})` }
  }
  if (r.status !== 0) {
    const stderr = (r.stderr ?? '').trim().split('\n')[0] ?? ''
    return { ok: false, missing: false, reason: `${command} exited ${r.status}${stderr ? `: ${stderr}` : ''}` }
  }
  return { ok: true, stdout: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// ------------------------------------------------------------- reading a real process start time

/**
 * THE LINUX PROCESS READER, shared with every caller outside this file.
 *
 * `processById` below reads a process's state, parent, group and start time through it, so the start
 * time is worked out once (`whenALinuxProcessBegan` in src/config/process-reader.mjs: field 22 of
 * `/proc/<pid>/stat`, `btime` from `/proc/stat` read once, and the tick rate from `getconf CLK_TCK`
 * asked once). The service lock, the worker and the session hook read the same sum through
 * src/config/session-process.mjs.
 */
const LINUX_PROCESSES = linuxProcessReader()

/**
 * ONE PROCESS AS THE LINUX PROBE REPORTS IT, from what `processById` read of `/proc/<pid>`.
 *
 * The start is written once, from one clock observation of the moment: `startedAt` is its local time in words, which
 * the ledger stores and compares as text, and `startedInstant` is the same moment with its offset. On the night the
 * clocks go back the words are the same for both passes of the repeated hour, and the instant says which pass.
 * Exported so that a test can hold this reading to a made-up process instead of a real one on this machine.
 */
export function aLinuxProcess(read: {
  pid: number
  pgid: number
  ppid: number
  command: string
  startedAt: Date
  directoryChangedAt: Date
}): OsProcess {
  const started = clockStamp(() => read.startedAt)
  return {
    pid: read.pid,
    pgid: read.pgid,
    ppid: read.ppid,
    command: read.command,
    startedAt: started.stamp,
    startedInstant: started.instant,
    directoryChangedAt: localTime(read.directoryChangedAt),
  }
}

// ---------------------------------------------------------------------------- the checkout's git files

// gitDirsOf is in src/config/settings.mjs, which finds a worktree's .env with it without starting git;
// src/server/lib/git-checkout.ts hands it on to the database's opener and the key file's maker.

/**
 * One process's program and arguments, from `<proc>/<pid>/exe` and `<proc>/<pid>/cmdline`. `proc` is '/proc' except in
 * a test, which builds a folder of the same shape. The arguments are separated by NUL and the last one ends with a NUL,
 * so only that last NUL is dropped: an empty argument in the middle keeps its place.
 */
export function theProgramAndArgumentsIn(proc: string, pid: number): OsProgramAndArguments {
  const exe = `${proc}/${pid}/exe`
  const cmdline = `${proc}/${pid}/cmdline`
  let program: string
  try {
    program = realpathSync(exe)
  } catch (err) {
    return { unreadable: `${exe} could not be read (${String((err as NodeJS.ErrnoException).code)})` }
  }
  let raw: string
  try {
    raw = readFileSync(cmdline, 'utf8')
  } catch (err) {
    return { unreadable: `${cmdline} could not be read (${String((err as NodeJS.ErrnoException).code)})` }
  }
  return { program, arguments: raw === '' ? [] : raw.replace(/\0$/, '').split('\0') }
}

/**
 * The words a group stop is refused in when Windows has no signal that asks a whole group to stop.
 * @param pgid The group that was not stopped.
 * @returns The refusal.
 */
export function theGroupWasNotStoppedWords(pgid: number): string {
  return `${WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE} Process group ${String(pgid)} was not stopped.`
}

/**
 * The words the list of processes reads only Linux's /proc refuses another operating system in.
 * @param system The platform the list was asked on.
 * @returns The refusal.
 */
export function theListReadsOnlyLinuxWords(system: string): string {
  return (
    `The “Running on this machine” list reads Linux's /proc, and this machine is ${system}. ` +
    (system === 'win32' ? `${WHAT_WINDOWS_NEEDS_TO_READ_PROCESSES} ${WINDOWS_HAS_NO_PROCESS_GROUPS} ` : '') +
    'A port writes another OsProbe in src/server/lib/resources.ts, ' +
    `and ${THE_PORT_OF_THIS_MODULE} in src/config/process-reader.mjs. ` +
    `${String(OTHER_FILES_THAT_TOUCH_THE_SYSTEM.length)} other files touch the operating system too, ` +
    'and a port has to check each of them. ' +
    OTHER_FILES_THAT_TOUCH_THE_SYSTEM.map((one) => `${one.file} ${one.does}.`).join(' ')
  )
}

/**
 * The one Linux implementation.
 *
 * It reads /proc directly for processes and sockets rather than shelling out to ps and ss.
 * That is not micro-optimisation: `ss -ltnp` is not installed everywhere, its output format has
 * changed between releases, and parsing a human table is how a reader ends up silently missing
 * rows. /proc is a kernel interface with a fixed layout.
 */
class LinuxProbe implements OsProbe {
  readonly platform = 'linux'

  /**
   * 'darwin' or 'win32' only for the copy the macOS or the Windows probe borrows its shared methods from; see
   * theProbeForThisPlatform.
   * `named` is the platform a test named through theProbeForThisPlatform; null reads this process's at each call,
   * as the probe always did, so a test that stands a platform in through process.platform is still answered.
   */
  constructor(
    private readonly alsoOn: 'darwin' | 'win32' | null = null,
    private readonly named: string | null = null,
  ) {}

  /** The platform this probe answers for. */
  private get system(): string {
    return this.named ?? process.platform
  }

  /**
   * Refuse to guess on another operating system.
   *
   * On macOS there is no /proc at all and this would report every process as gone — every
   * orphan would vanish from the report, which is the one failure this feature must not have.
   * A port writes a second OsProbe; it does not relax this check. The one exception is the copy the macOS or the
   * Windows probe borrows from (`alsoOn`), and each of those probes hands on only methods that do not read /proc.
   */
  private assertLinux(): void {
    if (this.system !== 'linux' && this.system !== this.alsoOn) {
      throw new PanelError(theListReadsOnlyLinuxWords(this.system), 501)
    }
  }

  processById(pid: number): OsProcess | null {
    this.assertLinux()
    const dir = `/proc/${pid}`

    /**
     * THE `/proc/<pid>` DIRECTORY'S MODIFICATION TIME, WHICH IS NOT THE START TIME.
     *
     * It used to be read as the start time here, with a comment saying it was one. It is not, and
     * the error is not small: on 3 September 2026 the GROUND verifier measured four processes at
     * once and got 1 second wrong, 48 seconds wrong, 7 minutes wrong and 39.6 hours wrong — a
     * supervisor that had been up since the previous morning read as three minutes old. Three
     * unrelated processes read as having started in the same second.
     *
     * It is still read, and only for one thing: recognising a ledger row that was stamped with it
     * before this was fixed. `theRowIsAboutThisProcess` is where that happens and says why.
     */
    let directoryChangedAt: Date
    try {
      directoryChangedAt = statSync(dir).mtime
    } catch {
      return null
    }

    // ITS STATE, PARENT, GROUP AND REAL START, from `/proc/<pid>/stat` through the shared reader. The
    // start is the sum `ps -o lstart=` computes, and `tests/telling-a-live-process-from-a-claim.test.ts`
    // checks it against `ps` on real pids.
    let at: ReturnType<typeof LINUX_PROCESSES.processAt>
    try {
      at = LINUX_PROCESSES.processAt(pid)
    } catch (err) {
      throw new PanelError(`Whether process ${pid} is running is unknown: ${(err as Error).message}`, 500)
    }
    if (!at.here) return null
    if (at.unreadable !== undefined) {
      // The process exists but may not be inspected — a hidepid mount, or another user's
      // process under a hardened kernel. Reporting it as gone would be a lie in the dangerous
      // direction: the ledger would drop a real orphan off the report. The same answer when its
      // start time cannot be worked out: without it, this process cannot be told from a
      // different one that has been given the same pid.
      throw new PanelError(
        `Process ${pid} exists but ${at.unreadable}, so its process group and its start are unknown. ` +
          'Mole Office will not report it as gone, and will not kill a group it cannot read.',
        500,
      )
    }

    let command: string
    try {
      const raw = readFileSync(`${dir}/cmdline`, 'utf8')
      // Arguments are NUL separated with a trailing NUL. An empty cmdline means a kernel
      // thread, which has no command line at all; ps shows those in square brackets and so
      // does this, because an empty string in the report would read as a failed read.
      const argv = raw.split('\0').filter((a) => a !== '')
      command = argv.length > 0 ? argv.join(' ') : `[${LINUX_PROCESSES.nameOf(pid) ?? ''}]`
    } catch {
      command = `[${LINUX_PROCESSES.nameOf(pid) ?? ''}]`
    }

    return aLinuxProcess({ pid, pgid: at.pgid, ppid: at.ppid, command, startedAt: at.startedAt, directoryChangedAt })
  }

  programAndArguments(pid: number): OsProgramAndArguments {
    this.assertLinux()
    return theProgramAndArgumentsIn('/proc', pid)
  }

  cgroupOf(pid: number): string | null {
    this.assertLinux()
    let text: string
    try {
      text = readFileSync(`/proc/${pid}/cgroup`, 'utf8')
    } catch {
      // Gone, or another user's and unreadable: no cgroup is known, which is what null says.
      return null
    }
    const line = text.split('\n').find((one) => one.startsWith('0::'))
    return line === undefined ? null : line.slice(3)
  }

  /**
   * Walk /proc and keep the entries whose process group matches.
   *
   * There is no cheaper route on Linux without shelling out to `ps`, and a subprocess here
   * would be a second thing that can fail while deciding what to kill. Reading /proc is the
   * same source processById already trusts.
   *
   * A process that vanishes mid-walk is skipped rather than raising: the list is a snapshot of
   * a moving target, and the release path re-reads and compares before it signals anything.
   */
  processesInGroup(pgid: number): OsProcess[] {
    this.assertLinux()
    const out: OsProcess[] = []
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      let proc: OsProcess | null
      try {
        proc = this.processById(Number(entry))
      } catch {
        // Unreadable (hidepid, another user, hardened kernel). processById is deliberately loud
        // about this for a single lookup, but here it would mean one unreadable stranger's
        // process hid the whole group. Skipping is safe because a group member we cannot see is
        // also a group member we could not have killed.
        continue
      }
      if (proc && proc.pgid === pgid) out.push(proc)
    }
    return out.sort((a, b) => a.pid - b.pid)
  }

  /**
   * The whole process table, from adapters/os.ts.
   *
   * One line, and the walk is next door rather than here, for the database reason in this file's
   * header. It is not a second reader: this method is the only route to that function that
   * production code takes.
   *
   * `assertLinux()` is deliberately NOT called. The walk already reports a /proc it cannot list as
   * `{ok:false, reason}`, and that answer reaches the sessions page as "could not look" beside
   * every session it applies to. Throwing a 501 instead would take the page down on a machine
   * where the honest answer is available.
   */
  processTable(): ProcessScan {
    return readLinuxProcessTable()
  }

  /**
   * The parent, the working directory and the open database files of one process.
   *
   * THE FAILURES ARE COLLECTED, NOT THROWN. A process whose environment cannot be read still has
   * a readable parent and a readable working directory, and refusing the whole answer for one
   * unreadable part would leave a caller with nothing at all. Each part that could not be read is
   * named in `couldNotRead`, so an empty list of databases can be told from a list nobody could
   * see.
   */
  senderOfAConnection(peer: { address: string; port: number }, ours: { address: string; port: number }): OsSender | null {
    this.assertLinux()
    // THE SOCKET, IN THE KERNEL'S TABLES: the one whose own end is the peer and whose far end is this server.
    let found: AConnectionInTheTable | undefined
    for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
      let text = ''
      try {
        text = readFileSync(table, 'utf8')
      } catch {
        continue
      }
      found = connectionsInTheTable(text).find(
        (one) =>
          one.local.port === peer.port &&
          one.remote.port === ours.port &&
          one.local.address === oneFormOf(peer.address) &&
          one.remote.address === oneFormOf(ours.address),
      )
      if (found !== undefined) break
    }
    if (found === undefined) return null
    // THE PROCESS HOLDING IT, among the ones this server may read. Another user's processes cannot be read, and a
    // socket another user owns is answered by its uid alone.
    if (found.uid !== process.getuid?.()) return { uid: found.uid, pid: null, inAnotherContainer: null }
    const want = `socket:[${found.inode}]`
    let pid: number | null = null
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      let fds: string[]
      try {
        fds = readdirSync(`/proc/${entry}/fd`)
      } catch {
        continue
      }
      if (fds.some((fd) => {
        try {
          return readlinkSync(`/proc/${entry}/fd/${fd}`) === want
        } catch {
          return false
        }
      })) {
        pid = Number(entry)
        break
      }
    }
    if (pid === null) return { uid: found.uid, pid: null, inAnotherContainer: null }
    // AND WHETHER IT RUNS IN A CONTAINER THIS SERVER IS NOT IN.
    let theirs: string | null = null
    let mine: string | null = null
    try {
      theirs = theContainerACgroupNames(readFileSync(`/proc/${pid}/cgroup`, 'utf8'))
      mine = theContainerACgroupNames(readFileSync('/proc/self/cgroup', 'utf8'))
    } catch {
      return { uid: found.uid, pid, inAnotherContainer: null }
    }
    return { uid: found.uid, pid, inAnotherContainer: theirs !== null && theirs !== mine }
  }

  processFacts(pid: number): ProcessFacts | null {
    this.assertLinux()
    const dir = `/proc/${pid}`
    const couldNotRead: string[] = []

    let stat: string
    try {
      stat = readFileSync(`${dir}/stat`, 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ESRCH') return null
      throw new PanelError(
        `Process ${pid} exists but ${dir}/stat could not be read (${String(code)}), so who started it is unknown.`,
        500,
      )
    }
    // After the bracketed command name the columns are: state, ppid, pgrp, … so ppid is index 1.
    const after = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
    const ppidText = after[1]
    if (ppidText === undefined || !/^\d+$/.test(ppidText)) {
      throw new PanelError(`${dir}/stat did not carry a parent for pid ${pid}`, 500)
    }
    const parentPid = Number(ppidText)

    let parent: OsProcess | null = null
    try {
      parent = this.processById(parentPid)
    } catch (err) {
      // The parent exists and may not be inspected. Reporting it as gone would say "nobody is
      // waiting for this" about a process something IS waiting for, which is the wrong direction.
      couldNotRead.push(`the parent, pid ${parentPid}, could not be read (${messageOf(err)})`)
    }

    let workingDirectory: string | null = null
    let workingDirectoryDeleted = false
    try {
      const where = directoryFromLink(readlinkSync(`${dir}/cwd`))
      workingDirectory = where.path
      workingDirectoryDeleted = where.deleted
    } catch (err) {
      couldNotRead.push(`the working directory could not be read (${messageOf(err)})`)
    }

    const openDatabases: string[] = []
    try {
      for (const fd of readdirSync(`${dir}/fd`)) {
        let target: string
        try {
          target = readlinkSync(`${dir}/fd/${fd}`)
        } catch {
          // Closed between listing and reading. Nothing is holding it now.
          continue
        }
        if (!isADatabaseFile(target)) continue
        if (!openDatabases.includes(target)) openDatabases.push(target)
      }
    } catch (err) {
      couldNotRead.push(`the open files could not be listed (${messageOf(err)}), so no database can be named`)
    }

    let databaseAsked: string | null = null
    try {
      const raw = readFileSync(`${dir}/environ`, 'utf8')
      for (const entry of raw.split('\0')) {
        if (entry.startsWith('MOLE_OFFICE_DB=')) databaseAsked = entry.slice('MOLE_OFFICE_DB='.length)
      }
    } catch (err) {
      couldNotRead.push(`the environment could not be read (${messageOf(err)}), so MOLE_OFFICE_DB is unknown`)
    }

    return {
      pid,
      parentPid,
      parent,
      workingDirectory,
      workingDirectoryDeleted,
      openDatabases: openDatabases.sort(),
      databaseAsked,
      couldNotRead,
    }
  }

  listeningPorts(): OsPort[] {
    this.assertLinux()
    const owners = this.socketOwners()
    return this.listeners().map((one) => ({ port: one.port, address: one.address, protocol: one.protocol, pid: owners.get(one.inode) ?? null }))
  }

  listeningOn(port: number): OsPort[] {
    this.assertLinux()
    const listening = this.listeners().filter((one) => one.port === port)
    // NOTHING LISTENS ON IT, so no socket has an owner to look for.
    if (listening.length === 0) return []
    const owners = this.socketOwners()
    return listening.map((one) => ({ port: one.port, address: one.address, protocol: one.protocol, pid: owners.get(one.inode) ?? null }))
  }

  /** Every socket in the LISTEN state, with its inode and without its owner, sorted as `listeningPorts` answers. */
  private listeners(): (Omit<OsPort, 'pid'> & { inode: string })[] {
    const out: (Omit<OsPort, 'pid'> & { inode: string })[] = []
    for (const [file, protocol] of [
      ['/proc/net/tcp', 'tcp'],
      ['/proc/net/tcp6', 'tcp6'],
    ] as const) {
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        // tcp6 is absent on a kernel built without IPv6. tcp is not: if that one cannot be
        // read there is nothing sensible to say, and an empty list would claim no ports are
        // held at all.
        if (protocol === 'tcp') {
          throw new PanelError(`${file} could not be read, so listening ports are unknown.`, 500)
        }
        continue
      }
      for (const line of text.split('\n').slice(1)) {
        const cols = line.trim().split(/\s+/)
        // sl, local_address, rem_address, st, tx:rx, tr:when, retrnsmt, uid, timeout, inode
        if (cols.length < 10) continue
        const local = cols[1]
        const state = cols[3]
        const inode = cols[9]
        if (local === undefined || state === undefined || inode === undefined) continue
        if (state !== '0A') continue // 0A is LISTEN
        const [addrHex, portHex] = local.split(':')
        if (addrHex === undefined || portHex === undefined) continue
        out.push({
          port: Number.parseInt(portHex, 16),
          address: protocol === 'tcp' ? hexToIpv4(addrHex) : hexToIpv6(addrHex),
          protocol,
          inode,
        })
      }
    }
    return out.sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol))
  }

  /**
   * Which process holds which socket, by walking every /proc/<pid>/fd.
   *
   * Directories belonging to other users cannot be read, and that is not an error: those
   * sockets come back with `pid: null`, which the type documents as "somebody else's", never as
   * "nobody's".
   */
  private socketOwners(): Map<string, number> {
    const owners = new Map<string, number>()
    let pids: string[]
    try {
      pids = readdirSync('/proc').filter((e) => /^\d+$/.test(e))
    } catch {
      return owners
    }
    for (const pid of pids) {
      let fds: string[]
      try {
        fds = readdirSync(`/proc/${pid}/fd`)
      } catch {
        continue
      }
      for (const fd of fds) {
        try {
          const target = readlinkSync(`/proc/${pid}/fd/${fd}`)
          const m = /^socket:\[(\d+)\]$/.exec(target)
          if (m?.[1] !== undefined) owners.set(m[1], Number(pid))
        } catch {
          // The descriptor closed between listing and reading it. Nothing to record.
        }
      }
    }
    return owners
  }

  /**
   * `gitCannotRun`, when given, says in words why git must not be started here; then `git status` is
   * not run, whether the tree is dirty is unknown, and those words say why. The macOS probe gives it
   * when the only git is Apple's stand-in, which would ask the person to install the command-line
   * tools (`whyGitWouldAskToBeInstalled` in lib/darwin-probe.ts).
   */
  checkout(root: string, { gitCannotRun }: { gitCannotRun?: string } = {}): OsCheckout {
    // THE ONE SPAWN THE CHECKOUT READING MAKES, through `readGit` below. `git status --porcelain` walks the whole tree, and
    // nothing but git can answer it. The other four questions this reading used to spawn git for —
    // rev-parse HEAD, rev-parse --short HEAD, rev-parse --abbrev-ref HEAD, and the two git-dir
    // questions — are answered below by reading the same files git reads, at the moment of the
    // request. NOTHING IS CACHED, nothing is held on the process, nothing is refreshed on a timer,
    // and nothing can go stale: every request reads the files again. Six spawns became one, and
    // criterion G2 still says what it has always said: read when asked.
    const couldNotRead: string[] = []
    const status = (() => {
      if (gitCannotRun !== undefined) return { out: '', failed: gitCannotRun }
      try {
        return { out: readGit(root, ['status', '--porcelain'], { maxBuffer: 8 * 1024 * 1024, timeoutMs: 10_000 }).toString('utf8').trim(), failed: null }
      } catch (error) {
        return { out: '', failed: whyGitDidNotAnswer(error) }
      }
    })()
    if (gitCannotRun !== undefined) couldNotRead.push(gitCannotRun)
    else if (status.failed !== null) couldNotRead.push(`git status could not answer in ${root} (${status.failed})`)
    const dirs = gitDirsOf(root)
    if (dirs === null) {
      // The two rev-parse questions that said whether this is a worktree were asked of git together,
      // and both failed together when there was no checkout to ask. One reason covers them here.
      couldNotRead.push(
        `git could not say whether ${root} is a worktree (there is no readable .git in ${root}, ` +
          'so the commit, the branch and whether the tree is dirty are unknown too)',
      )
      return { head: null, branch: null, dirty: status.failed === null ? status.out !== '' : null, isWorktree: null, couldNotRead }
    }
    const head = headFromGitDirs(dirs, root, couldNotRead)
    return {
      head,
      branch: head?.branch ?? null,
      dirty: status.failed === null ? status.out !== '' : null,
      // A worktree's own git directory sits INSIDE the main clone's, so the two differ. A local
      // test: it needs no network and no second checkout to compare against.
      isWorktree: dirs.gitDir !== dirs.commonDir,
      couldNotRead,
    }
  }

  gpu(): OsGpu {
    return theGpusListIn(runCommand('nvidia-smi', THE_GPUS_LIST))
  }

  /** The same list by the way that waits. */
  async readGpu(): Promise<OsGpu> {
    return theGpusListIn(await runCommandWaiting('nvidia-smi', THE_GPUS_LIST))
  }

  containers(): OsContainers {
    return theContainersIn(runCommand('docker', THE_RUNNING_CONTAINERS))
  }

  /** The same list by the way that waits. */
  async readContainers(): Promise<OsContainers> {
    return theContainersIn(await runCommandWaiting('docker', THE_RUNNING_CONTAINERS))
  }

  containerFirstProcess(id: string): OsContainerFirstProcess {
    // `--type container`, so an image or a volume that happens to share the name cannot answer.
    const r = runCommand('docker', ['inspect', '--type', 'container', '--format', '{{.State.Running}}\t{{.State.Pid}}', id])
    if (!r.ok) {
      return { ok: false, reason: `${r.reason}, so the host pid of container ${id}'s first process could not be read` }
    }
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    const [running, pidText] = (lines[0] ?? '').split('\t')
    if (lines.length !== 1 || running === undefined || pidText === undefined || !/^\d+$/.test(pidText.trim())) {
      return {
        ok: false,
        reason:
          `docker inspect answered ${JSON.stringify(r.stdout.slice(0, 200))} and not one "<running>\t<pid>" line ` +
          `for container ${id}, so its first process could not be read`,
      }
    }
    // A stopped container reports pid 0. Both halves are checked because either alone means there is
    // no first process to read a namespace from.
    if (running.trim() !== 'true' || Number(pidText) === 0) {
      return { ok: false, reason: `docker says container ${id} is not running, so it has no first process` }
    }
    return { ok: true, pid: Number(pidText) }
  }

  containerState(name: string): OsContainerState {
    const r = runCommand('docker', ['inspect', '--type', 'container', '--format', '{{.State.Running}}\t{{.State.ExitCode}}\t{{.State.FinishedAt}}', name])
    if (!r.ok) {
      if (/\bNo such container\b/.test(r.reason)) return { ok: true, state: 'gone' }
      return { ok: false, reason: `${r.reason}, so container ${name} could not be inspected` }
    }
    const lines = r.stdout.trim().split('\n')
    const parts = (lines[0] ?? '').split('\t')
    const [running, exitCode, finishedAt] = parts
    if (lines.length !== 1 || parts.length !== 3 || (running !== 'true' && running !== 'false') ||
        exitCode === undefined || !/^\d+$/.test(exitCode) || !Number.isSafeInteger(Number(exitCode)) ||
        finishedAt === undefined || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(finishedAt) ||
        !Number.isFinite(new Date(finishedAt).getTime()) || (running === 'false' && new Date(finishedAt).getUTCFullYear() <= 1)) {
      return { ok: false, reason: `docker inspect answered ${JSON.stringify(r.stdout.slice(0, 200))} instead of one running flag, exit code and finish time for container ${name}` }
    }
    if (running === 'true') return { ok: true, state: 'running' }
    return { ok: true, state: 'stopped', exitCode: Number(exitCode), finishedAt }
  }

  machineNow(): { loadOneMinute: number | null; freeBytes: number | null } {
    let freeBytes: number | null
    try {
      freeBytes = theFreeBytesIn(readFileSync('/proc/meminfo', 'utf8'))
    } catch {
      // No /proc/meminfo, or not readable: the free memory is not known, and the caller refuses on that.
      freeBytes = null
    }
    const load = loadavg()[0]
    return { loadOneMinute: typeof load === 'number' && Number.isFinite(load) ? load : null, freeBytes }
  }

  rootFreeBytes(): number | null {
    try {
      const read = statfsSync('/')
      const free = read.bavail * read.bsize
      return Number.isSafeInteger(free) && free >= 0 ? free : null
    } catch {
      // Not readable: the free space is not known, and the seat's answer says so.
      return null
    }
  }

  pidNamespaceOf(pid: number): OsPidNamespace | null {
    this.assertLinux()
    const dir = `/proc/${pid}`
    let status: string
    try {
      status = readFileSync(`${dir}/status`, 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ESRCH') return null
      throw new PanelError(
        `Process ${pid} exists but ${dir}/status could not be read (${String(code)}), so which pid namespace it is ` +
          'in is unknown.',
        500,
      )
    }
    const line = status.split('\n').find((l) => l.startsWith('NSpid:'))
    if (line === undefined) {
      throw new PanelError(
        `${dir}/status carries no NSpid line, so this kernel does not say what a process is called inside a ` +
          'container. Linux has written that line since version 4.1.',
        500,
      )
    }
    const fields = line.slice('NSpid:'.length).trim().split(/\s+/)
    if (fields.length === 0 || !fields.every((f) => /^\d+$/.test(f))) {
      throw new PanelError(`${dir}/status has an NSpid line this reader cannot read: ${JSON.stringify(line)}`, 500)
    }
    let namespace: string
    try {
      namespace = readlinkSync(`${dir}/ns/pid`)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      // A process that has exited has no namespace left, and that includes one not yet reaped by its parent.
      if (code === 'ENOENT' || code === 'ESRCH') return null
      throw new PanelError(
        `Process ${pid} exists but ${dir}/ns/pid could not be read (${String(code)}), so which pid namespace it is ` +
          'in is unknown. The kernel shows it only for processes running as the same user as this server.',
        500,
      )
    }
    return { namespace, nspid: fields.map(Number) }
  }

  locks(paths: readonly string[]): OsLocks {
    const files: OsLockFile[] = []
    const unreadable: { path: string; reason: string }[] = []
    for (const path of paths) {
      let info: ReturnType<typeof statSync>
      try {
        info = statSync(path)
      } catch (err) {
        unreadable.push({ path, reason: (err as NodeJS.ErrnoException).code ?? String(err) })
        continue
      }
      if (info.isFile()) {
        // A path named directly is watched whatever it is called: the operator chose it.
        files.push({ path, sizeBytes: info.size, modifiedAt: localTime(info.mtime) })
        continue
      }
      if (!info.isDirectory()) {
        unreadable.push({ path, reason: 'not a file or a directory' })
        continue
      }
      let entries: string[]
      try {
        entries = readdirSync(path)
      } catch (err) {
        unreadable.push({ path, reason: (err as NodeJS.ErrnoException).code ?? String(err) })
        continue
      }
      // Deliberately not recursive. A configured path is a directory somebody named on
      // purpose; walking all of it would turn one report into a filesystem crawl, and the
      // paths worth watching hold their locks at the top.
      for (const entry of entries) {
        if (!LOCK_NAME.test(entry)) continue
        const full = join(path, entry)
        try {
          const st = statSync(full)
          if (st.isFile()) files.push({ path: full, sizeBytes: st.size, modifiedAt: localTime(st.mtime) })
        } catch {
          // Removed between listing and stat: it is not holding anything now.
        }
      }
    }
    return { files, unreadable }
  }

  machineName(): string | null {
    // NO `assertLinux` HERE, AND THAT IS THE ONE DIFFERENCE FROM EVERY METHOD BESIDE IT. A hostname
    // is not a Linux fact and Node answers it the same way everywhere, so refusing it off Linux
    // would be this file being strict about something it is not strict about.
    //
    // THE ENVIRONMENT IS ASKED FIRST, because that is what a container or a service manager sets
    // when the kernel's own name is the wrong answer, and it is the same order tools/session-hook.mjs
    // uses when it writes the machine onto a session record.
    const said = process.env['HOSTNAME']
    if (said !== undefined && said.trim() !== '') return said.trim()
    const named = hostname()
    return named === '' ? null : named
  }

  ownAddresses(): readonly string[] {
    // NO `assertLinux` HERE, for the reason `machineName` above has none: Node answers this the same
    // way on every system it runs on. Asked afresh on each call; see the interface for why.
    return Object.values(networkInterfaces()).flatMap((one) => (one ?? []).filter((entry) => !entry.internal).map((entry) => entry.address))
  }

  // NO `assertLinux` HERE, for the reason `tmuxPanes` below has none: tailscale answers the same way where it runs.
  // No shell, and 3 seconds at most, so a stuck daemon costs one late read and holds no request. The whole status of
  // a large tailnet lists every peer, so its text may pass the 1 MB that execFile keeps by default.
  ownTailnetName(): Promise<string | null> {
    return new Promise((done) => {
      const limits = { timeout: 3_000, maxBuffer: 8 * 1024 * 1024 }
      execFile('tailscale', ['status', '--json'], { ...limits, encoding: 'utf8', windowsHide: true }, (err, stdout) => {
        done(err === null ? ownTailnetNameIn(stdout) : null)
      })
    })
  }

  /**
   * WHETHER AN AGENT TOOL HOLDS ITS OWN KEY, ASKED THE TOOL'S OWN WAY. Criterion U2.
   *
   * CLAUDE CODE IS NOT ASKED AND ITS STORE IS NOT READ. Claude Code keeps its credential in its own
   * store under the user's home, and this office does not read that store: the office passes Claude
   * Code no key, and "nobody has looked" is the honest answer rather than a guess. The same is true
   * for a tool that is not installed, or one that answers something this reader does not understand.
   *
   * THE TWO COMMANDS ARE THE TOOLS' OWN. `codex login status` says whether a login is present, and
   * `opencode auth list` lists the providers the tool holds. Neither prints a key to this reader,
   * and nothing here is put on a page except the three words and the sentence.
   */
  whatAnAgentToolSaysAboutItsKey(which: 'claude-code' | 'codex' | 'opencode', system?: TheSystem): AgentToolKeyAnswer {
    if (which === 'claude-code') {
      return {
        state: 'nobody-has-looked',
        says:
          'Not looked at: Claude Code keeps its own credential, and this office does not read that store.',
        asked: 'no command, because the office does not read the Claude Code credential store',
      }
    }
    if (which === 'codex') {
      const ran = runCommandReadingBothStreams('codex', ['login', 'status'], system)
      const asked = 'codex login status'
      if (!ran.ok) {
        return {
          state: 'nobody-has-looked',
          says: `Not looked at: ${ran.reason}.`,
          asked,
        }
      }
      // CODEX'S WORDS ARE READ IN ONE PLACE, which the harness reading on Terminal management reads too.
      const said = whatCodexSaysOfItsSignIn(ran.stdout)
      if (said === 'no') {
        return { state: 'not-set', says: 'Codex says it has no login.', asked }
      }
      if (said === 'yes') {
        return { state: 'set', says: 'Codex says it has a login.', asked }
      }
      return {
        state: 'nobody-has-looked',
        says: 'Not looked at: Codex answered something this office does not understand.',
        asked,
      }
    }
    const ran = runCommandReadingBothStreams('opencode', ['auth', 'list'], system)
    const asked = 'opencode auth list'
    if (!ran.ok) {
      return { state: 'nobody-has-looked', says: `Not looked at: ${ran.reason}.`, asked }
    }
    const holds = /zhipu|glm/i.test(ran.stdout)
    return {
      state: holds ? 'set' : 'not-set',
      says: holds
        ? 'OpenCode says it holds a Zhipu key for GLM.'
        : 'OpenCode says it holds no Zhipu key for GLM.',
      asked,
    }
  }

  theVersionOfAProgram(program: string, env: Readonly<Record<string, string>>): Promise<{ path: string | null; version: string; versionWasRead: boolean }> {
    const where = whereIsThisTool(program, env)
    if (where === null) return Promise.resolve(theVersionItPrinted(null, null))
    return new Promise((done) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (ran: Parameters<typeof theVersionItPrinted>[1]): void => {
        if (settled) return
        settled = true
        done(theVersionItPrinted(where, ran))
      }
      let child: ReturnType<typeof spawn>
      try {
        // NO SHELL, and only the environment the caller gave: the program is asked its version and nothing else. A .cmd
        // on Windows cannot start without cmd.exe, and theWayToStart in src/config/runtimes.mjs quotes it. A Codex gets
        // only the names its list keeps (src/config/the-environment-a-codex-gets.mjs).
        const way = theWayToStart(where, ['--version'])
        child = spawn(way.command, way.args, {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: VERSION_MUST_ANSWER_WITHIN_MS,
          env: aCommandsProgram([program]).isCodex ? theEnvironmentACodexGets(env) : { ...env },
          windowsVerbatimArguments: way.windowsVerbatimArguments,
          windowsHide: true,
        })
      } catch (err) {
        finish({ error: err as Error })
        return
      }
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
      child.once('error', (err) => finish({ error: err }))
      child.once('close', (status, signal) => finish({ status, signal, stdout, stderr }))
    })
  }

  ownProcessGroup(): number {
    this.assertLinux()
    const self = this.processById(process.pid)
    if (!self) {
      throw new PanelError('Mole Office could not read its own process group, so it will not signal anything.', 500)
    }
    return self.pgid
  }

  runAvatarCodec(input: AvatarCodecRequest): { status: number | null; stdout: Buffer; stderr: Buffer; error?: Error } {
    const node = theInstallsNode()
    const options = {
      input: input.bytes, timeout: input.timeoutMs, maxBuffer: input.maxBufferBytes,
      detached: false, windowsHide: true,
      // A codec child needs no office credential, login, database or address.
      // It starts no program of its own, so what the install's Node needs set goes nowhere further.
      env: { PATH: theSystemFor(process.platform).theSearchPathIn(process.env), ...node.environment },
    }
    return spawnSync(node.program, ['-e', AVATAR_CODEC, input.entry, JSON.stringify({
      side: input.side, pixels: input.pixels, format: input.format, dispositions: input.dispositions,
      rssBytesPerUnit: this.alsoOn === 'darwin' || this.system === 'darwin' ? 1 : 1024,
    }), `--stop-with-pid=${String(process.pid)}`], options)
  }

  startTheRestartCommand(input: { cwd: string; logPath: string; env: NodeJS.ProcessEnv }): ReturnType<typeof spawn> {
    if (!thereAreProcessGroups(this.system)) throw new Error('This operating system has no restart process-group door.')
    const command = howToStart('command')
    const log = openSync(input.logPath, 'a')
    try { return spawn(command.command, [...command.args, 'restart', '--after-answer'], { cwd: input.cwd, detached: true, stdio: ['ignore', log, log, 'ipc'], env: { ...input.env, ...command.environment } }) }
    finally { closeSync(log) }
  }

  // ONE SPAWN OF WHAT THE SYSTEM LAYER ANSWERED, for each process started here in a group of its own, so every one is handed
  // every option the answer carries: the message worker and the host job runner.
  private startedInItsOwnGroup(
    how: ReturnType<ReturnType<typeof theSystemFor>['groups']['howToStartInItsOwnGroup']>,
    cwd: string,
    log: number,
  ): ReturnType<typeof spawn> {
    return spawn(how.command, how.args, {
      cwd,
      env: how.env,
      detached: how.detached,
      stdio: ['ignore', log, log],
      windowsHide: how.windowsHide,
      windowsVerbatimArguments: how.windowsVerbatimArguments,
    })
  }

  startTheMessageWorker(input: { args: readonly string[]; cwd: string; logPath: string }): { pid: number; pgid: number } {
    this.assertLinux()
    mkdirSync(dirname(input.logPath), { recursive: true })
    const log = openSync(input.logPath, 'a')
    try {
      // HOW THE WORKER STARTS IS THE DECLARATION'S: tsx from source in a checkout, the bundle in a bundle.
      // On Windows a checkout's worker is tsx.cmd, which starts through cmd.exe (theWayToStart, src/config/runtimes.mjs).
      const worker = howToStart('worker')
      const way = theWayToStart(worker.command, [...worker.args, ...input.args])
      // IN A GROUP OF ITS OWN, AS THE SYSTEM LAYER STARTS ONE: a process group on Linux and the Mac, and on Windows a Job
      // Object named after the process started, which is the number a stop of this group finds it by.
      const how = theSystemFor(this.system).groups.howToStartInItsOwnGroup({ ...way, env: { ...process.env, ...worker.environment } })
      const child = this.startedInItsOwnGroup(how, input.cwd, log)
      if (child.pid === undefined) {
        throw new PanelError('The message worker was asked to start and this process was given no pid for it.', 500)
      }
      child.unref()
      return { pid: child.pid, pgid: child.pid }
    } finally {
      closeSync(log)
    }
  }

  /**
   * START THE DATA FOLDER MOVER, in a process group of its own: `data-folder move <to>` of this office's service
   * command, which stops the office, copies the data folder and switches the `.env` line.
   *
   * NO `assertLinux()` HERE, for the reason `startTheRestartCommand` has none: it reads nothing from /proc. It takes
   * no `--stop-with-pid` either, because the mover must outlive the server it stops.
   *
   * ON WINDOWS the system layer's group start runs it in a Job Object of its own, so it outlives the server there
   * too. The child is returned as it is and is not unref'd: the door listens for its exit while it waits.
   */
  startTheDataFolderMover(input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }): ReturnType<typeof spawn> {
    const command = howToStart('command')
    const way = theWayToStart(command.command, [...command.args, 'data-folder', 'move', input.to])
    // IN A GROUP OF ITS OWN, AS THE SYSTEM LAYER STARTS ONE: a process group on Linux and the Mac, and on Windows a Job
    // Object named after the process started, which is the number a stop of this group finds it by.
    const how = theSystemFor(this.system).groups.howToStartInItsOwnGroup({ ...way, env: { ...input.env, ...command.environment } })
    mkdirSync(dirname(input.logPath), { recursive: true })
    const log = openSync(input.logPath, 'a')
    try {
      const child = this.startedInItsOwnGroup(how, input.cwd, log)
      if (child.pid === undefined) {
        throw new PanelError('The data folder mover was asked to start and this process was given no pid for it.', 500)
      }
      return child
    } finally {
      closeSync(log)
    }
  }

  startTheHostJobRunner(input: { args: readonly string[]; cwd: string; logPath: string }): {
    pid: number
    pgid: number
    ended: Promise<{ code: number | null; signal: string | null; error: string | null }>
  } {
    this.assertLinux()
    // MODE 700: the log is in the runner's own folder, which the runner refuses when others may open it.
    mkdirSync(dirname(input.logPath), { recursive: true, mode: 0o700 })
    const log = openSync(input.logPath, 'a', 0o600)
    try {
      const runner = howToStart('host-job-runner')
      const how = theSystemFor(this.system).groups.howToStartInItsOwnGroup({ ...theWayToStart(runner.command, [...runner.args, ...input.args]), env: { ...process.env, ...runner.environment } })
      const child = this.startedInItsOwnGroup(how, input.cwd, log)
      // HOW IT ENDED, heard from the child itself, so the office can say it in words and start another.
      const ended = new Promise<{ code: number | null; signal: string | null; error: string | null }>((done) => {
        child.once('error', (error) => done({ code: null, signal: null, error: error.message }))
        child.once('exit', (code, signal) => done({ code, signal, error: null }))
      })
      // A PLAIN ERROR AND NOT A REFUSAL: nobody asked through a door, and the one caller says it in words.
      if (child.pid === undefined) {
        throw new Error('The host job runner was asked to start and this process was given no pid for it.')
      }
      child.unref()
      return { pid: child.pid, pgid: child.pid, ended }
    } finally {
      closeSync(log)
    }
  }

  // NO `assertLinux` HERE: tmux and its answer are the same on macOS, and this reads nothing of /proc.
  tmuxPanes(format: string): Promise<{ ok: true; out: string } | { ok: false; missing: boolean; out: string }> {
    return new Promise((done) => {
      execFile('tmux', ['list-panes', '-a', '-F', format], { timeout: 3_000, encoding: 'utf8', windowsHide: true }, (err, stdout, stderr) => {
        if (err === null) done({ ok: true, out: stdout })
        else done({ ok: false, missing: (err as NodeJS.ErrnoException).code === 'ENOENT', out: String(stderr || err.message).trim() })
      })
    })
  }

  async sweepCheckWorktrees(checks: { id: string; ended: boolean; state: string }[]) {
    this.assertLinux()
    const { sweepCheckWorktrees } = await import('../../../tools/check-worktrees.mjs')
    return sweepCheckWorktrees({ checks })
  }

  killProcessGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    refuseAGroupNumberBelowTwo(pgid)
    // A STOP THAT ASKS A GROUP TO STOP IS NEVER MADE INTO ONE THAT ENDS IT AT ONCE. Windows has no signal that asks a
    // group to stop, so SIGTERM is refused there in words and nothing is sent; SIGKILL ends the group's Job Object.
    if (signal === 'SIGTERM' && theSystemFor(this.system).groups.gentleStop === null) {
      throw new PanelError(theGroupWasNotStoppedWords(pgid), 501)
    }
    this.assertLinux()
    // The whole group, through the system layer, which on Linux and the Mac sends process.kill(-pgid, signal)
    // (src/config/systems/posix-groups.mjs). This is the line the whole feature is for: signalling the leader
    // alone leaves its children holding the port.
    theSystemFor(this.system).groups.signal(pgid, signal)
  }

  /**
   * THE DETACHED NODE HELPER THE OVERDUE HAND-BACK READER SPEAKS TO OVER IPC, in a group of its own.
   * The script is the caller's own fixed text and starts only the guarded git it names, with the guarded
   * environment. It lives here because only this file may start a process (the os-boundary rule).
   * The helper runs on the install's own Node, and THE_OVERDUE_HAND_BACK_HELPER takes out what that Node needs set before
   * it starts git.
   */
  startTheOverdueHandBackHelper(script: string): ReturnType<typeof spawn> {
    this.assertLinux()
    const node = theInstallsNode()
    return spawn(node.program, ['-e', script], {
      env: { ...guardedGitEnvironment(), ...node.environment },
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
  }

  stopContainer(name: string): void {
    const r = runCommand('docker', ['stop', name])
    if (!r.ok) throw new PanelError(`The container "${name}" was not stopped: ${r.reason}`, 502)
  }
}

/**
 * THE DETACHED GIT HELPER'S SCRIPT for the overdue hand-back reader. It stays one process-group leader for all
 * sequential guarded Git reads in one call, and its own stop ends its group. It is here, beside the method that
 * starts it, because this is the one file under src/server allowed to start or signal a process.
 */
export const THE_OVERDUE_HAND_BACK_HELPER = `
delete process.env.${RUN_AS_NODE}
const { spawn } = require('node:child_process')
setInterval(() => {}, 60000)
function stop() { try { process.kill(0, 'SIGKILL') } catch {} }
process.on('disconnect', stop)
let busy = false
process.on('message', message => {
  if (message === 'stop') { stop(); return }
  if (!message || !Array.isArray(message.args) || busy) return
  busy = true
  const child = spawn('git', message.args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const out = [], err = []; let size = 0, sent = false
  function answer(value) { if (!sent) { sent = true; busy = false; if (process.send) process.send(value) } }
  function collect(dest) { return chunk => {
    size += chunk.length
    if (size > 64 * 1024 * 1024) answer({ unavailable: true })
    else dest.push(chunk)
  } }
  child.stdout.on('data', collect(out)); child.stderr.on('data', collect(err))
  child.on('error', error => answer({ status: null, error: error.message }))
  child.on('close', code => answer({ status: code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }))
})
`

/** The single Linux implementation. */
export const LINUX_PROBE: OsProbe = new LinuxProbe()

/**
 * A PROCESS GROUP IS A WHOLE NUMBER ABOVE 1 BEFORE ANYTHING IS SENT TO IT. Group 0 is this server's own group, and a
 * signal to -1 reaches every process this user owns. Checked by killProcessGroup and askAProcessGroupToStop, the two
 * doors to the group signal, before either sends anything. The ledger's release refuses the same numbers in the same
 * words.
 */
function refuseAGroupNumberBelowTwo(pgid: number): void {
  if (!Number.isInteger(pgid)) {
    throw new PanelError(`Refusing to signal process group ${String(pgid)}. A process group is a whole number above 1.`)
  }
  if (pgid <= 1) throw new PanelError(`Refusing to signal process group ${String(pgid)}. That is init, or every process there is.`)
}

/**
 * ASK THE PROGRAM AT THE HEAD OF A WHOLE PROCESS GROUP TO STOP, so that it stops itself, through the system layer.
 *
 * On Linux and the Mac this is SIGTERM to the group, the same signal to the same group as
 * killProcessGroup(pgid, 'SIGTERM'). On Windows, which has no SIGTERM, it is a stop request on the group's pipe
 * (src/config/systems/windows-groups.mjs). A refusal is a rejection whose sentence says the group may still be running.
 *
 * It and the listener below are not methods of OsProbe: no probe would answer them differently, and every stand-in
 * probe in the tests would have to grow both. `platform` stands another system in for a test.
 */
export async function askAProcessGroupToStop(pgid: number, platform: string = process.platform): Promise<void> {
  refuseAGroupNumberBelowTwo(pgid)
  await theSystemFor(platform).groups.askToStop(pgid)
}

/**
 * LISTEN FOR THE REQUEST askAProcessGroupToStop SENDS TO THIS PROGRAM ON WINDOWS, and call onStop when it comes. On
 * Linux and the Mac the request is SIGTERM, which the program's own handler hears, so this listens for nothing.
 */
export function listenForAStopRequest(
  onStop: () => void,
  say: (sentence: string) => void,
  platform: string = process.platform,
): void {
  theSystemFor(platform).groups.listenForAStopRequest(onStop, say)
}

/**
 * THE PROBE FOR ONE PLATFORM, on the one choice of process reader, which the system layer holds
 * (src/config/systems/the-system.mjs). macOS gets the macOS probe, which reads processes through the macOS reader's
 * `ps` and `lsof`, and borrows the rest from a Linux probe allowed to run on macOS. Windows gets the Windows probe
 * (lib/windows-probe.ts), which reads one process through the Windows reader and borrows the rest from a Linux probe
 * allowed to run on Windows. Linux and every other platform get LINUX_PROBE, whose readers of /proc refuse in words
 * off Linux.
 */
export function theProbeForThisPlatform(platform: string): OsProbe {
  const reader = theSystemFor(platform).processes
  if (reader.platform === 'win32') return new WindowsProbe(new LinuxProbe('win32', platform), reader as WindowsProcessReader)
  // Any other platform a test names gets a Linux probe that knows it is there and refuses in its words.
  if (reader.platform !== 'darwin') return platform === process.platform ? LINUX_PROBE : new LinuxProbe(null, platform)
  return new DarwinProbe(new LinuxProbe('darwin'), reader as DarwinProcessReader)
}

installOsProbe(theProbeForThisPlatform(process.platform))

// adapters/os.ts starts on the same Linux walk this probe uses, so on a first import on Linux this line
// changes nothing. It is here so the two are equal BY ASSIGNMENT rather than by both naming the
// same default — two places that must agree, with nothing making them agree, is the shape of every
// defect this codebase has produced, and one line is cheaper than trusting a coincidence.
useProcessTableSource(installedOsProbe())

/**
 * Swap the operating system out.
 *
 * This exists for the tests, and for the day a second platform arrives. It is a module-level
 * value rather than an argument on every function because the routes have no business knowing
 * which operating system they are on — that is the point of the seam.
 *
 * IT SWAPS THE SESSION LIST TOO. The session sweep reads the process table through adapters/os.ts,
 * which cannot import this file because this file opens the database. Pointing it at the same
 * probe here is what makes ONE call replace the whole operating system: a caller that had to
 * remember two calls would eventually make one of them, and the sessions page would go on
 * reporting the real machine while every other panel reported the fake one.
 */
export function useOsProbe(probe: OsProbe): void {
  installOsProbe(probe)
  useProcessTableSource(probe)
}

export function osProbe(): OsProbe {
  return answering ?? installedOsProbe()
}

/**
 * A PROCESS AN ACT WILL ASK ABOUT. `alsoItsStarterIfEnded` asks, when the pid has ended, what a starter with that pid
 * left running in its Job Object (`whatAnEndedPidLeftRunning`).
 */
export interface AProcessToRead {
  pid: number
  alsoItsStarterIfEnded: boolean
}

/** The probe that answers the body of `readFirst` from its readings, while that body runs. */
let answering: OsProbe | null = null

/** A reading `readFirst` made: what it answered, or what it threw, which is thrown again where it is asked. */
type AReading<T> = { answered: T } | { threw: unknown }

function theAnswerOf<T>(reading: AReading<T>): T {
  if ('threw' in reading) throw reading.threw
  return reading.answered
}

async function aReading<T>(read: () => Promise<T>): Promise<AReading<T>> {
  try {
    return { answered: await read() }
  } catch (err) {
    return { threw: err }
  }
}

/**
 * READ THE PROCESSES AN ACT WILL ASK ABOUT FIRST, WITHOUT HOLDING THE THREAD, AND THEN DO THE ACT.
 *
 * On Windows one reading of a process runs PowerShell for about a second, and a reading made the way `processById`
 * makes it holds the server's one thread for that second: no other request is answered meanwhile. Many acts read
 * processes deep inside code that writes the database in one transaction, and a transaction cannot wait. So the act
 * names the processes it will ask about, worked out only where they will be read. They are read here first, one
 * after another, by the probe's ways that wait (`readProcessById`, `readProgramsOfAnEndedStarter`). Then the act
 * runs, and every question it asks about one of those processes is answered from the reading. A reading that threw
 * throws again where the act asks it, so the act handles it as it handles a reading it made itself.
 *
 * A question the act did not name is read as it always was, holding the thread. The answer is the same; only the
 * waiting differs. tests/no-windows-process-reading-holds-the-servers-thread.test.ts fails for any such reading in
 * the acts it names.
 *
 * AN ACT THAT ASKS ABOUT PROCESSES NO ROW NAMES, as the sweep of the GPU does, asks `andEveryOtherProcess`. Then,
 * after the named readings, one reading of every process is made by the way that waits, where the probe has one
 * (`readEveryProcessFirst`, Windows). A question about a process the act did not name is answered from it. On a Windows
 * 11 machine on 7 November 2026, the sweep of the GPU in GET /api/resources/orphans held the thread for 47 of the 84
 * seconds that readings of processes held it, one process after another (wave 13t, round W45).
 *
 * AN ACT THAT ASKS FOR THE MACHINE'S LISTS, as the orphans door's sweep does, asks `andTheMachinesLists`. Then the GPU's
 * list (nvidia-smi) and the running containers (docker) are read first too, by the way that waits, where the probe has
 * one (`readGpu` and `readContainers`), and the act's `gpu()` and `containers()` are answered from them. On a Windows 11
 * machine on 8 November 2026, the first GET /api/resources/orphans after a restart held the thread for 6.92 s in the
 * sweep of the containers, in one call of docker that took 7.2 s, and for 0.95 s in the sweep of the GPU.
 *
 * THE ACT MUST NOT WAIT. The readings answer it only while it runs, and an act that waited would be answered from
 * them after they are old, or not at all. One that returns a promise is refused.
 *
 * Where the probe has no way that waits (Linux and the Mac), the act runs at once and reads as it always did.
 */
export async function readFirst<T>(
  processes: () => readonly AProcessToRead[],
  act: () => T,
  { andEveryOtherProcess = false, andTheMachinesLists = false }: { andEveryOtherProcess?: boolean; andTheMachinesLists?: boolean } = {},
): Promise<T> {
  const probe = osProbe()
  const { readProcessById, readProgramsOfAnEndedStarter, readGpu, readContainers } = probe
  if (readProcessById === undefined) return act()
  const asked = new Map<number, boolean>()
  for (const one of processes()) asked.set(one.pid, (asked.get(one.pid) ?? false) || one.alsoItsStarterIfEnded)
  const read = new Map<number, AReading<OsProcess | null>>()
  const left = new Map<number, AReading<{ read: true; programs: OsProcess[] } | { read: false; reason: string }>>()
  for (const [pid, alsoItsStarter] of asked) {
    const reading = await aReading(() => readProcessById.call(probe, pid))
    read.set(pid, reading)
    const ended = 'answered' in reading && reading.answered === null
    if (alsoItsStarter && ended && readProgramsOfAnEndedStarter !== undefined) {
      left.set(pid, await aReading(() => readProgramsOfAnEndedStarter.call(probe, pid)))
    }
  }
  const { programsOfAnEndedStarter } = probe
  const theGpusList = andTheMachinesLists && readGpu !== undefined ? await aReading(() => readGpu.call(probe)) : null
  const theContainers = andTheMachinesLists && readContainers !== undefined ? await aReading(() => readContainers.call(probe)) : null
  const fromTheReadings: Partial<OsProbe> = {
    processById: (pid: number) => {
      const reading = read.get(pid)
      return reading === undefined ? probe.processById(pid) : theAnswerOf(reading)
    },
    ...(programsOfAnEndedStarter === undefined
      ? {}
      : {
          programsOfAnEndedStarter: (starter: number) => {
            const reading = left.get(starter)
            return reading === undefined ? programsOfAnEndedStarter.call(probe, starter) : theAnswerOf(reading)
          },
        }),
    ...(theGpusList === null ? {} : { gpu: () => theAnswerOf(theGpusList) }),
    ...(theContainers === null ? {} : { containers: () => theAnswerOf(theContainers) }),
  }
  const theAct = (): T => {
    const before = answering
    answering = new Proxy(probe, {
      get: (target, name, receiver) =>
        Object.hasOwn(fromTheReadings, name) ? fromTheReadings[name as keyof OsProbe] : Reflect.get(target, name, receiver),
    })
    try {
      const done = act()
      if (typeof (done as { then?: unknown } | null)?.then === 'function') {
        throw new Error('An act read first must not wait: the readings answer it only while it runs. This one returned a promise.')
      }
      return done
    } finally {
      answering = before
    }
  }
  return andEveryOtherProcess && probe.readEveryProcessFirst !== undefined ? await probe.readEveryProcessFirst(theAct) : theAct()
}

/** A system's process groups, as the system layer gives them (src/config/systems/the-system.mjs). */
type TheGroups = ReturnType<typeof theSystemFor>['groups']

/** THE GROUPS A PROBE STOPS A GROUP THROUGH: its own where it has them (Windows), and the platform's elsewhere. */
export function theGroupsOf(probe: OsProbe = osProbe()): TheGroups {
  return probe.groups ?? theSystemFor(process.platform).groups
}

/**
 * ONE PROCESS, READ WITHOUT HOLDING THE THREAD where the probe has a way to (Windows), and as `processById` reads it
 * elsewhere.
 */
export async function readAProcess(pid: number, probe: OsProbe = osProbe()): Promise<OsProcess | null> {
  return probe.readProcessById === undefined ? probe.processById(pid) : await probe.readProcessById(pid)
}

export { oneReadingPerListing } from '../db/the-processes-a-listing-reads.ts'

// ============================================================================ configuration

/**
 * Where Mole Office will look for lock files. Defaults to /tmp and /var/lock, and on a Mac to /tmp and
 * the user's own temporary folder (theDefaultLockFolders in src/config/settings.mjs).
 *
 * Set MOLE_OFFICE_LOCK_PATHS to a list separated as PATH is (`path.delimiter`: a colon on Linux and
 * macOS). Setting it to an empty string
 * means "watch nothing", and that is honoured rather than overridden — an operator who turned
 * it off gets it turned off, and the scan says the list is empty.
 *
 * A configured path is a BOUNDARY, not just a search list: a session may only register a lock
 * file that sits under one of these (enforced in registerResource below). Mole Office should never be
 * pointed at an arbitrary path on someone's disk by an agent that got its own configuration
 * wrong — the ledger is written to by agents, and "here is a path, go and watch it" is a
 * request that must be answerable with no.
 *
 * The rule the boundary protects: Mole Office NEVER DELETES A LOCK FILE. It reports one and stops.
 * A lock is often the only evidence that a job is still running, and removing it lets a second
 * copy start on the same data — a worse outcome than a stale lock, and a silent one. That is why
 * `releaseResource` refuses locks outright rather than offering a confirmation.
 *
 * Each path is normalised, so a trailing slash in the configuration ("/tmp/") means the same
 * directory as "/tmp" rather than a boundary nothing can ever be inside.
 */
// The name and the default live in src/config/settings.mjs with every other setting; the refusals
// below stay here, because what may be registered as a lock is this file's subject.
const LOCK_PATHS_VAR = 'MOLE_OFFICE_LOCK_PATHS'

export function configuredLockPaths(): readonly string[] {
  const raw = settingValue(LOCK_PATHS_VAR)
  // The declaration gives this setting a default, so null here would mean the declaration changed
  // under this reader rather than that nobody configured anything.
  if (raw === null) {
    throw new PanelError(
      `${LOCK_PATHS_VAR} has no value and no default. src/config/settings.mjs declares one; this reader ` +
        'and that declaration have gone out of step.',
      500,
    )
  }
  const paths = raw.split(delimiter).map((p) => p.trim()).filter((p) => p !== '')
  // Absoluteness is checked on the value as written, BEFORE normalising: resolve() would happily
  // turn "tmp/locks" into something absolute against the working directory, which is exactly the
  // guess this refusal exists to prevent.
  for (const p of paths) {
    if (!isAbsolute(p)) {
      throw new PanelError(
        `${LOCK_PATHS_VAR} holds "${p}", which is not an absolute path. A relative path would mean a ` +
          'different directory depending on where the server was started from.',
        500,
      )
    }
  }
  return paths.map((p) => resolvePath(p))
}

/** Is `path` inside one of the configured lock paths? Written once, used by the refusal below. */
function insideLockPath(path: string, allowed: readonly string[]): boolean {
  return allowed.some((base) => {
    if (path === base) return true
    // "/" is its own prefix; every other base needs the separator added, or "/tmpfoo" would
    // count as being inside "/tmp".
    const prefix = base.endsWith('/') ? base : `${base}/`
    return path.startsWith(prefix)
  })
}

// ============================================================================ the ledger table
//
// One row per thing a session started, in `session_resources`, which is declared in
// src/server/db/schema.ts and created by migration 0003. Every column carries its note there.
//
// `key` is the identity that gets checked later: the pid, the port number, the container name,
// the absolute path of the lock file. `os_started_at` is the anti-reuse anchor described on
// OsProcess above — without it, releasing a resource whose pid has been recycled would kill an
// innocent process with a matching number.
//
// Rows are never deleted. A released resource keeps its row with who released it and when,
// because "was that server ever shut down, and by whom" is the question this table is for.

/**
 * The kinds of thing a session can leave behind.
 *
 * `slot` IS A SEAT IN ONE OF THE MACHINE'S SHARED POOLS, not a process: one whole test suite at a
 * time, and a few browser test files at a time (DECISIONS R7(2), 21 September 2026). Its key is the
 * pool's name while it waits in line and `<pool>#<seat>` once it holds a seat; its `pgid` and
 * `os_started_at` name the process group holding it, so the seat ends when that group ends.
 * lib/slots.ts is the only thing that writes one; the pools, the line and the handing-on are there.
 *
 * `client` IS A WINDOW OF THE OFFICE, OR ANOTHER PROGRAM THAT ONLY CONNECTS TO IT (criterion W8 of
 * the standalone window, design/window/ACCEPTANCE.md). Its key is the client's own pid, and like a
 * process row it keeps that process's group and start time. A client is never the service's parent
 * and never owns it: registering one refuses a process whose group holds a Mole Office server, is the
 * answering server's, or holds a port the ledger records a server holding now, in any project, and
 * `rowsNaming` never lets a
 * client row name a running server, so a window's
 * session ending can make an orphan of the window and of nothing it connects to. The service's own
 * rows stay under the service's own session.
 */
export const RESOURCE_TYPES = ['process', 'port', 'gpu', 'container', 'lock', 'slot', 'client'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]

// THE WORKSPACE IS A PARAMETER, and there is no module constant any more.
//
// It was `const WORKSPACE = 'default'`, so every port, pid and lock any project's session
// registered was filed in the default workspace and GET /api/resources listed every project's
// machine state as one. Orphan control is the one place where a wrong list gets something KILLED,
// which is why this is a parameter rather than a filter added to the read.
//
// A resource's project is the project of the SESSION that started it — read off that record, not
// taken from the request — for the same reason a change row's is read off the record it is about:
// they are the same fact, and a second place stating it would be a second place to be wrong.

export interface LedgerRow {
  id: string
  workspace_id: string
  session_record_id: string
  type: string
  key: string
  pgid: number | null
  os_started_at: string | null
  detail: string
  registered_at: string
  registered_by: string
  released_at: string | null
  released_by: string | null
  release_note: string | null
  world: string | null
  started_by_the_product: number | null
}

/** A ledger row as the API hands it out. */
export interface LedgerEntry {
  id: string
  sessionRecordId: string
  type: ResourceType
  key: string
  pgid: number | null
  osStartedAt: string | null
  detail: string
  registeredAt: string
  registeredBy: string
  releasedAt: string | null
  releasedBy: string | null
  releaseNote: string | null
  /**
   * The world this resource serves, read when the row was written: repository, database, port,
   * HEAD, and whether it was scratch or canonical with the reasons. Null on a row written before
   * 3 September 2026, and on one whose world could not be read — which says so in `couldNotRead`
   * at the time rather than here.
   */
  world: World | null
  /**
   * Whether Mole Office itself started this process. Null means nobody recorded this, which is not
   * the same as no, and the release door treats both the same way: it will not stop the process.
   */
  startedByTheProduct: boolean | null
}

export { toEntry } from '../db/the-processes-a-listing-reads.ts'

export { parseWorld } from '../db/the-processes-a-listing-reads.ts'

function readRow(id: string, workspaceId: string): LedgerRow | null {
  const row = sqlite
    .prepare('SELECT * FROM session_resources WHERE workspace_id = ? AND id = ?')
    .get(workspaceId, id) as LedgerRow | undefined
  return row ?? null
}

export { readRows } from '../db/the-processes-a-listing-reads.ts'

// ============================================================================ session state

/**
 * What the owning session is doing, and when it stopped.
 *
 * `ended` has three values on purpose. A session record whose `state` is missing or unreadable
 * cannot be called "still running" — that would hide its orphans from the report — and cannot
 * be called ended either. It is 'unknown', and the caller is told which rows it applies to.
 */
export interface SessionView {
  recordId: string
  title: string | null
  state: SessionState | null
  ended: boolean | 'unknown'
  endedAt: string | null
  /** Where endedAt came from, because the two sources are not equally exact. */
  endedAtSource: 'the change log' | 'the session record was last written then' | null
  /** Why state or ended is unknown. Null when everything was readable. */
  note: string | null
}

export { TERMINAL_STATES } from './terminal-states.ts'

export { ORPHAN_REPORT_ALSO_COUNTS } from '../db/the-processes-a-listing-reads.ts'

export { isSessionState } from '../db/the-processes-a-listing-reads.ts'

export { endTimeFromChangeLog } from '../db/the-processes-a-listing-reads.ts'

export { sessionViewOf } from '../db/the-processes-a-listing-reads.ts'

// ============================================================================ liveness

/**
 * Is it still there?
 *
 * 'unknown' is not a polite way of saying gone. It means Mole Office could not look — nvidia-smi
 * absent, the docker daemon down, a lock directory unreadable — and every report keeps those
 * rows in a separate list so they cannot be read as "nothing there".
 */
export type Liveness =
  | { state: 'alive'; detail: string }
  | { state: 'gone'; detail: string }
  | { state: 'unknown'; reason: string }

// ------------------------------------------- is the row about the process running under that pid

// `theRowIsAboutThisProcess` asks it in one place, in src/config/process-reader.mjs, for this file and for the
// data-folder move, which cannot import this file. Its header says why it is asked once and what it compares.
export { theRowIsAboutThisProcess, type RowAndProcess }

export { restampRowWrittenByTheOldReading } from '../db/the-processes-a-listing-reads.ts'

export { whatAnEndedPidLeftRunning } from '../db/the-processes-a-listing-reads.ts'

export { theStarterIsAskedAbout } from '../db/the-processes-a-listing-reads.ts'

export { theProcessesTheRowsRead } from '../db/the-processes-a-listing-reads.ts'

/**
 * THE STARTERS ANY READING OF THE LIVE ROWS MAY ASK ABOUT, for `readFirst`: the live process rows, in every project,
 * whose liveness asks what their starter left running once its pid has ended. Only these ask a question that one
 * reading of every process cannot answer, and a look that reads many rows asks it again for each.
 */
export function theStartersTheLiveRowsMayAskAbout(): AProcessToRead[] {
  const rows = sqlite
    .prepare(`SELECT * FROM session_resources WHERE type = 'process' AND released_at IS NULL AND started_by_the_product = 1`)
    .all() as LedgerRow[]
  return theProcessesTheRowsRead(rows.map(toEntry)).filter((one) => one.alsoItsStarterIfEnded)
}

export { processLiveness } from '../db/the-processes-a-listing-reads.ts'

/**
 * Nothing here is cached across a request, deliberately.
 *
 * A process row is answered from a reading taken for that row, so a report can never say a process
 * is alive because it was alive when the first row was checked. A port row is answered from the
 * listing's one reading of the listening sockets (`oneReadingPerListing` above) when the caller took
 * one, and from a reading of its own otherwise. A container row and a GPU row are answered the same way
 * from the listing's one `docker ps` and its one `nvidia-smi`.
 */
function livenessOf(entry: LedgerEntry, probe: OsProbe): Liveness {
  switch (entry.type) {
    case 'process':
    case 'gpu':
    case 'client':
      return processLiveness(entry, probe)

    /**
     * A PORT ROW IS ABOUT THE SERVER A SESSION STARTED, NOT ABOUT THE PORT NUMBER.
     *
     * This used to answer `alive` whenever anything at all was listening, including when the
     * listener was a different program that had taken the number over. Seven rows on this machine
     * read "alive" on 27 August 2026 while every process they named was dead — the report was
     * telling a reader that four dev stacks were running when two processes were, and problem
     * `jiu2AP_ZIW-m` records the same thing from the other end. "Something is listening" and "the
     * thing this session started is still running" are different facts, and the ledger is asked
     * for the second one.
     *
     * So the port is treated exactly the way a pid is treated a few lines above: the start time
     * recorded at registration is the identity, a different one means the registered server has
     * exited, and no recorded identity at all means Mole Office cannot tell rather than that it can.
     */
    case 'port': {
      const wanted = Number(entry.key)
      const held = probe.listeningOn === undefined ? probe.listeningPorts().filter((p) => p.port === wanted) : probe.listeningOn(wanted)
      if (held.length === 0) return { state: 'gone', detail: `Nothing is listening on port ${wanted}.` }
      const holder = held.find((p) => p.pid !== null)?.pid ?? null
      const where = held.map((p) => `${p.address}:${p.port}/${p.protocol}`).join(', ')
      if (holder === null) {
        return {
          state: 'unknown',
          reason:
            `Port ${wanted} is held (${where}) by a process this user may not inspect, so Mole Office cannot tell ` +
            'whether it is the server this session started or somebody else’s program on the same number.',
        }
      }
      const proc = probe.processById(holder)
      if (!proc) {
        return {
          state: 'unknown',
          reason:
            `Port ${wanted} is held (${where}) by pid ${holder}, and that process could not be read a moment ` +
            'later, so Mole Office cannot say whose it is.',
        }
      }
      if (entry.osStartedAt === null) {
        return {
          state: 'unknown',
          reason:
            `Port ${wanted} is held (${where}) by pid ${holder}, process group ${proc.pgid} — ${proc.command} — ` +
            'but nothing was listening on it when this row was registered, so the ledger has no identity to ' +
            'compare that with. Mole Office cannot tell whether this is the server that row is about.',
        }
      }
      const match = theRowIsAboutThisProcess(entry.osStartedAt, proc)
      if (match.same === false) {
        return {
          state: 'gone',
          detail:
            `Port ${wanted} is listening again, but the process holding it started at ${proc.startedAt} rather ` +
            `than ${entry.osStartedAt}: pid ${holder}, process group ${proc.pgid} — ${proc.command}. The server ` +
            'this session registered has exited and the port has changed hands.',
        }
      }
      const stillHeld = `Port ${wanted} is held (${where}) by pid ${holder}, process group ${proc.pgid} — ${proc.command}`
      if (match.same === true && match.stampedTheOldWay) {
        restampRowWrittenByTheOldReading(entry.id, proc.startedAt)
        return { state: 'alive', detail: `${stillHeld}. ${match.says}` }
      }
      return { state: 'alive', detail: stillHeld }
    }

    case 'container': {
      const reading = probe.containers()
      if (!reading.available) return { state: 'unknown', reason: reading.reason }
      const found = theContainerCalled(reading.containers, entry.key)
      if (!found) return { state: 'gone', detail: `No running container is called "${entry.key}".` }
      return { state: 'alive', detail: `container ${found.name} (${found.image}) — ${found.status}` }
    }

    case 'lock': {
      const reading = probe.locks([entry.key])
      const found = reading.files.find((f) => f.path === entry.key)
      if (found) {
        return {
          state: 'alive',
          detail: `${found.path} still exists, ${found.sizeBytes} bytes, last written ${found.modifiedAt}`,
        }
      }
      const problem = reading.unreadable.find((u) => u.path === entry.key)
      if (problem && problem.reason !== 'ENOENT') {
        return { state: 'unknown', reason: `${entry.key} could not be checked: ${problem.reason}` }
      }
      return { state: 'gone', detail: `${entry.key} is no longer there.` }
    }

    case 'slot':
      return slotHolderLiveness(entry, probe)
  }
}

// ============================================================================ containers

export { theContainerCalled } from '../db/the-processes-a-listing-reads.ts'

/** What a container reference may look like: docker's own rule for a name, which an id also meets. */
const CONTAINER_REF = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** Which host process a container calls by one pid. */
export interface AProcessInAContainer {
  container: { id: string; name: string }
  /** The pid as the container sees it. */
  pidInContainer: number
  /** The pid of the same process on this machine. */
  hostPid: number
}

/**
 * WHICH PROCESS ON THIS MACHINE A CONTAINER CALLS BY A GIVEN PID.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A process in a sandbox registers itself from inside the container, and all it knows is its own pid
 * there. The ledger has to hold the pid, the process group and the start time as THIS machine counts
 * them, because the release door, the worker's `endGroup` and every liveness reading signal and read
 * host processes. With the host numbers stored, those paths work across the container boundary
 * unchanged, and no container has to share this machine's pid namespace (`--pid=host`), which would
 * let a `pkill` inside it reach the owner's own processes.
 *
 * ---------------------------------------------------------------------------------------
 * HOW, AND THE ONE COMPARISON THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * Docker says which host pid the container's first process has, and that process's `ns/pid` link
 * names the container's pid namespace. The answer is the one host process that is IN that namespace
 * and whose innermost pid is the one asked for. The namespace comparison is what keeps pid 8 in the
 * container from being matched to pid 8 on the host, or to pid 8 in another container: small pids
 * exist in every namespace.
 *
 * A process in a namespace nested inside the container's (a browser's own sandbox, say) is not
 * matched: its innermost pid is in the nested namespace, not the container's. What registers here is
 * a process started in the container itself, which is what `tools/sandbox-start.mjs` is.
 *
 * NOTHING IS GUESSED. No match is a refusal that says how many processes could not be read, so "not
 * there" is told apart from "not looked at". More than one match is a reading the kernel does not
 * allow, and it is refused rather than chosen from.
 */
export function theHostPidOfAProcessInAContainer(
  container: string,
  pidInContainer: number,
  probe: OsProbe = osProbe(),
  /**
   * THE PROGRAM THAT NAMED THE CONTAINER, by its pid on this machine, when it runs in a container (problem ytWensT7blOP).
   * It may name only its own: the named container's pid namespace must be the caller's. Left out for a caller on this
   * computer, which may name any container, as the launcher on the host does.
   */
  callerPid?: number,
): AProcessInAContainer {
  const ref = container.trim()
  if (!CONTAINER_REF.test(ref)) {
    throw new PanelError(
      `"${container}" is not a container name or id: those are letters, digits, "_", "." and "-", starting with a ` +
        'letter or a digit. Send the name or the full id that `docker ps --no-trunc` prints.',
    )
  }
  if (probe.containerFirstProcess === undefined || probe.pidNamespaceOf === undefined || probe.processTable === undefined) {
    throw new PanelError(
      `The operating-system probe installed in this server (${probe.platform}) cannot look inside a container, so ` +
        `pid ${pidInContainer} in "${ref}" cannot be turned into a pid on this machine, and Mole Office will not treat ` +
        'it as one. The Linux probe can.',
      501,
    )
  }

  const reading = probe.containers()
  if (!reading.available) {
    throw new PanelError(`Mole Office could not look for container "${ref}": ${reading.reason}`, 503)
  }
  const found = theContainerCalled(reading.containers, ref)
  if (found === undefined) {
    throw new PanelError(
      `No running container is called "${ref}" — a container is named by its name or its full id, and docker lists ` +
        `${reading.containers.length} running — so there is no pid ${pidInContainer} inside it to register.`,
    )
  }

  const first = probe.containerFirstProcess(found.id)
  // Docker listed it as running a moment ago, so a failure here means it changed state in between.
  if (!first.ok) throw new PanelError(`Container ${found.name} could not be looked inside: ${first.reason}.`, 409)
  // THE FIRST PROCESS MAY RUN AS ANOTHER USER. In an isolated run it is docker-init running as root, and the kernel
  // shows a process's namespace only to its own user, so the read throws. That is a refusal naming the process, not a
  // 500 (problem HqDLmh0yFT4G).
  let home: OsPidNamespace | null
  try {
    home = probe.pidNamespaceOf(first.pid)
  } catch (err) {
    let command: string | null = null
    try {
      command = probe.processById(first.pid)?.command ?? null
    } catch {
      // Its command line is only a name for the sentence below; the pid names the process without it.
    }
    throw new PanelError(
      `Container ${found.name}'s first process, pid ${first.pid} on this machine${command === null ? '' : ` (${command})`}, ` +
        `could not be read: ${(err as Error).message.replace(/\.?\s*$/, '.')} Mole Office finds a process inside a ` +
        `container through the pid namespace of its first process, so pid ${pidInContainer} in it cannot be matched to a ` +
        'pid on this machine, and nothing was written. A container\'s first process often runs as root, as docker-init ' +
        'does in an isolated run. A process can be registered by its pid on this machine instead.',
      409,
    )
  }
  if (home === null) {
    throw new PanelError(
      `Container ${found.name}'s first process, pid ${first.pid} on this machine, is no longer running, so its pid ` +
        'namespace cannot be read and no process inside it can be found.',
      409,
    )
  }

  // A PROGRAM IN A CONTAINER NAMES ONLY ITS OWN CONTAINER (problem ytWensT7blOP): otherwise a program in one sandbox could
  // write a row about another sandbox's process, and a release signals the group a row names.
  if (callerPid !== undefined) {
    let callers: OsPidNamespace | null
    try {
      callers = probe.pidNamespaceOf(callerPid)
    } catch (err) {
      throw new PanelError(
        `This was sent from a program in a container, pid ${callerPid} on this machine, and its pid namespace could not be ` +
          `read: ${(err as Error).message.replace(/\.?\s*$/, '.')} So Mole Office cannot tell whether container ${found.name} ` +
          'is its own, and nothing was written.',
        409,
      )
    }
    if (callers === null) {
      throw new PanelError(
        `This was sent from a program in a container, pid ${callerPid} on this machine, which has gone since, so Mole Office ` +
          `cannot tell whether container ${found.name} is its own, and nothing was written.`,
        409,
      )
    }
    if (callers.namespace !== home.namespace) {
      throw new PanelError(
        `A program in a container may name only its own container, and this was sent from pid ${callerPid} on this machine, ` +
          `which is not in container ${found.name}. Nothing was written. Name your own container, or send the pid as you see ` +
          'it and the office reads it in your own container.',
        403,
      )
    }
  }

  const hostPid = theOneHostPidIn(home, pidInContainer, `container ${found.name}`, probe)
  return { container: { id: found.id, name: found.name }, pidInContainer, hostPid }
}

/**
 * THE ONE HOST PROCESS IN A PID NAMESPACE WHOSE INNERMOST PID IS THE ONE ASKED FOR, or a refusal that says why there is
 * none or more than one. `where` names the namespace in the refusal ("container a-name", "the container this was sent
 * from"). Shared by the container form and a bare pid sent from a container, so the one comparison that matters is
 * written once.
 */
function theOneHostPidIn(home: OsPidNamespace, pidInIt: number, where: string, probe: OsProbe): number {
  if (probe.pidNamespaceOf === undefined || probe.processTable === undefined) {
    throw new PanelError(
      `The operating-system probe installed in this server (${probe.platform}) cannot look inside a container, so pid ` +
        `${pidInIt} in ${where} cannot be turned into a pid on this machine.`,
      501,
    )
  }
  const table = probe.processTable()
  if (!table.ok) {
    throw new PanelError(`The processes on this machine could not be listed, so none can be matched: ${table.reason}`, 500)
  }
  const matches: number[] = []
  let unreadable = 0
  for (const candidate of table.processes) {
    let facts: OsPidNamespace | null
    try {
      facts = probe.pidNamespaceOf(candidate.pid)
    } catch {
      // Another user's process. It is counted, so a refusal can say a match may be among these.
      unreadable += 1
      continue
    }
    if (facts === null) continue
    // THE COMPARISON THIS FUNCTION EXISTS FOR. Without it, pid 8 here would match pid 8 on the host.
    if (facts.namespace !== home.namespace) continue
    if (facts.nspid[facts.nspid.length - 1] === pidInIt) matches.push(candidate.pid)
  }

  const [hostPid] = matches
  if (matches.length === 1 && hostPid !== undefined) return hostPid
  if (matches.length === 0) {
    throw new PanelError(
      `No process in ${where} has pid ${pidInIt}. Mole Office read the pid namespace of ` +
        `${table.processes.length - unreadable} processes on this machine` +
        (unreadable > 0
          ? `, and could not read ${unreadable} more that run as another user, so a match may be among those`
          : '') +
        '. Register the process while it is running, and send its pid as the container sees it.',
    )
  }
  throw new PanelError(
    `${matches.length} processes on this machine (pids ${matches.join(', ')}) all read as pid ${pidInIt} in ` +
      `the pid namespace of ${where}. The kernel does not allow that, so this reading of the machine is wrong, ` +
      'and Mole Office will not choose one of them.',
    500,
  )
}

/**
 * THE HOST PID OF A PROCESS NAMED BY A BARE PID FROM A PROGRAM IN A CONTAINER (problem xnfjNO3w2GCQ). The program the
 * operating system found holding the connection, `callerPid` on this machine, runs in a container; its own pid
 * namespace is the one the pid it sent is read in, so an agent in a sandbox sends the pid it sees and the row holds the
 * host's. The same match as the container form, `theOneHostPidIn`, with the namespace read from the caller rather than
 * from a container it names: the connection already says which one.
 */
export function theHostPidOfAPidItsCallerSees(callerPid: number, pidAsSeen: number, probe: OsProbe = osProbe()): number {
  if (probe.pidNamespaceOf === undefined || probe.processTable === undefined) {
    throw new PanelError(
      `The operating-system probe installed in this server (${probe.platform}) cannot look inside a container, so pid ` +
        `${pidAsSeen}, sent from a program in one, cannot be turned into a pid on this machine, and Mole Office will not ` +
        'treat it as one. The Linux probe can.',
      501,
    )
  }
  let home: OsPidNamespace | null
  try {
    home = probe.pidNamespaceOf(callerPid)
  } catch (err) {
    throw new PanelError(
      `This was sent from a program in a container, pid ${callerPid} on this machine, and its pid namespace could not be ` +
        `read: ${(err as Error).message.replace(/\.?\s*$/, '.')} So pid ${pidAsSeen} cannot be read in it, and nothing ` +
        'was written. Send {"container":…,"pidInContainer":…} instead, naming the container.',
      409,
    )
  }
  if (home === null) {
    throw new PanelError(
      `This was sent from a program in a container, pid ${callerPid} on this machine, which has gone since, so the pid ` +
        `namespace pid ${pidAsSeen} was sent in cannot be read, and nothing was written.`,
      409,
    )
  }
  return theOneHostPidIn(home, pidAsSeen, 'the container this was sent from', probe)
}

/**
 * IS THE PROCESS GROUP HOLDING THIS SLOT STILL THERE?
 *
 * A slot is held by a GROUP, not by one pid, because a test run is a group: `npm test` starts a
 * shell, the shell starts vitest, vitest starts its workers. The row stores the group id and the
 * start time of the group's leader, read when the slot was asked for.
 *
 *   - The leader is running and started when the row says: held.
 *   - A process is running under the leader's pid but started at another time: the number came
 *     back round, so the group that asked has ended. Linux does not hand out a pid that is still
 *     some live group's id, so this cannot be the old group with a new leader.
 *   - The leader has exited but other processes of the group are still running: held. The work is
 *     still going (a shell that exited while its vitest runs on), and calling the seat free would
 *     start a second suite beside it, which is the accident slots exist to prevent.
 *   - Nothing is running in the group: gone, and the seat is handed on at the next acquire or release.
 *
 * NO RECORDED IDENTITY IS `unknown`, never `gone`: a row restored from an archive carries no group
 * and no start time (the export drops both on purpose), and nothing here can say whether anybody
 * is still sitting in that seat.
 */
function slotHolderLiveness(entry: LedgerEntry, probe: OsProbe): Liveness {
  const pgid = entry.pgid
  if (pgid === null || entry.osStartedAt === null) {
    return {
      state: 'unknown',
      reason:
        `This ${entry.key} slot row names no process group and no start time, so Mole Office cannot say whether ` +
        'anybody still holds it. A row without them was restored from an archive, which does not carry them. ' +
        'Give it back by hand if nothing is using it.',
    }
  }
  return theProcessGroupsLiveness({ pgid, leaderStartedAt: entry.osStartedAt }, 'this slot', probe)
}

/**
 * IS THIS PROCESS GROUP STILL RUNNING? The one reading behind a slot and behind a GPU booking
 * (lib/bookings.ts), so the two cannot disagree about when a program has ended. `held` is what the
 * group holds, in words: "this slot", "this booking".
 */
export function theProcessGroupsLiveness(
  group: { pgid: number; leaderStartedAt: string },
  held: string,
  probe: OsProbe = osProbe(),
): Liveness {
  const pgid = group.pgid
  const leader = probe.processById(pgid)
  if (leader !== null) {
    const match = theRowIsAboutThisProcess(group.leaderStartedAt, leader)
    if (match.same === false) {
      return {
        state: 'gone',
        detail:
          `Pid ${pgid} is in use again, by a process that started at ${leader.startedAt} rather than ` +
          `${group.leaderStartedAt}: "${leader.command}". The process group that held ${held} has ended.`,
      }
    }
    return { state: 'alive', detail: `held by process group ${pgid}, led by ${leader.command}` }
  }
  const members = probe.processesInGroup(pgid)
  if (members.length > 0) {
    const first = members[0] as OsProcess
    return {
      state: 'alive',
      detail:
        `held by process group ${pgid}: its leader has exited and ${members.length} of its ` +
        `${members.length === 1 ? 'process is' : 'processes are'} still running, among them ${first.command}`,
    }
  }
  return {
    state: 'gone',
    detail: `Nothing is running in process group ${pgid} any more, so the group that held ${held} has ended.`,
  }
}

/**
 * WHICH PROCESS GROUP WOULD HOLD A SLOT, asked about one pid in it. Refuses when there is no honest
 * answer.
 *
 * The group is what holds the seat (see `slotHolderLiveness` above), and the leader's start time is
 * what tells this group apart from a later one given the same number, so the leader must be running
 * now. `sentStartedAt` is the start time the caller read for `pid`: it is checked the way a process
 * registration checks it, and it is also what catches a pid read inside a container, whose number
 * means a different process in this machine's process table.
 *
 * lib/slots.ts calls this once per request and hands the answer to `registerResource`, so the
 * machine is read once and the row stores exactly what was checked.
 */
export interface SlotHolder {
  /** The pid the caller named, as it reads now. */
  member: OsProcess
  /** The leader of its process group, whose start time the row stores. */
  leader: OsProcess
}

export function theGroupThatWouldHoldASlot(pid: number, sentStartedAt?: string): SlotHolder {
  const probe = osProbe()
  const member = probe.processById(pid)
  if (member === null) {
    throw new PanelError(
      `Nothing is running as pid ${pid} on this machine, so there is no process group to hold a slot. Ask for the ` +
        'slot from the process doing the work, while it is running. A pid read inside a sandbox\'s container is ' +
        'numbered in the container; from inside one, name the holder by its process row: {"resource": "<its id>"}.',
    )
  }
  if (sentStartedAt !== undefined) {
    const check = theStartTimeTheCallerSentIsThisProcess(pid, sentStartedAt, member)
    if (!check.ok) {
      throw new PanelError(
        check.different === true
          ? `Pid ${pid} started at ${theStartInWords(member)}, and the start time you sent was ${sentStartedAt}, ` +
              'so they are not the same process. Either the pid was given to another program after you read it, ' +
              "or it was read inside a sandbox's container, where pids are numbered differently from this machine. " +
              'From inside a container, name the holder by its process row instead: ' +
              '{"resource": "<its process row id>"}. Nothing was written.'
          : check.why,
        409,
      )
    }
  }
  const pgid = member.pgid
  if (pgid <= 1) {
    throw new PanelError(`Pid ${pid} is in process group ${pgid}, which is init's, so it cannot hold a slot.`)
  }
  if (pgid === probe.ownProcessGroup()) {
    throw new PanelError(
      `Pid ${pid} is in Mole Office's own process group, ${pgid}, so the slot would be held until this server ` +
        'stops. Ask from the process doing the work.',
    )
  }
  const leader = member.pid === pgid ? member : probe.processById(pgid)
  if (leader === null) {
    throw new PanelError(
      `Pid ${pid} is in process group ${pgid}, and that group's leader has already exited, so Mole Office has ` +
        'nothing to tell this group apart from a later one given the same number. Start the work as the leader ' +
        'of its own group (setsid, or node tools/slot.mjs run <pool> -- <command>) and ask from there.',
    )
  }
  return { member, leader }
}

// ============================================================================ registering

export interface RegisterInput {
  /** The project the request is working in. The session record must be in it. */
  workspaceId: string
  sessionRecordId: string
  type: ResourceType
  /**
   * The pid, the port number, the container name or the lock file's absolute path, as THIS machine
   * names it. Left out only for a process named by its pid inside a container, below.
   */
  key?: string
  /**
   * A PROCESS NAMED BY ITS PID INSIDE A CONTAINER, in place of `key`: the container's name or full
   * id, and the pid the container gives the process. Both or neither, only for a `process` row.
   *
   * The row stores the HOST pid, process group and start time, found by
   * `theHostPidOfAProcessInAContainer`, so a release and a liveness reading need nothing new. The
   * container and the pid inside it are written into `detail`, where the row shows them.
   */
  container?: string
  pidInContainer?: string | number
  /**
   * A PROCESS ROW SENT FROM A PROGRAM IN A CONTAINER. The door sets it, never the caller: it names the program the
   * operating system found holding the connection, by its pid on this machine. A bare `key` is then the pid as that
   * program's container sees it, read in that program's own pid namespace (problem xnfjNO3w2GCQ), and `detail` says what
   * was made of the number sent. With the container form, the container named must be that program's own (problem
   * ytWensT7blOP). The row stores the host pid, process group and start time either way.
   */
  sentFromAContainerBy?: { callerPid: number }
  /**
   * THE PROCESS THE DOOR READ, when a caller it cannot place sent the bare pid of a run of the message worker this server
   * started (`aRunOfTheWorkerThisServerStarted` in api/resources.ts). The door sets it, never the caller. The process case
   * takes the start time from it and does not read the same pid again, because on Windows each reading runs PowerShell.
   */
  processTheDoorRead?: OsProcess
  /** What it is, in one line. Left out for a process, the real command line is used. */
  detail?: string
  /**
   * The world this resource serves, read by whoever knows it.
   *
   * Only the process itself can honestly answer this — which checkout its code came from, which
   * database file it holds open, which commit it was built at — so it is passed in rather than
   * worked out here. A row registered without one says so: `world` comes back null, which means
   * nobody recorded it, not that there is nothing there.
   */
  world?: World
  /**
   * Whether Mole Office itself started this process. The owner's F1 answer of 3 September 2026
   * turns on this: what the product started, and whose owner session has ended, may be stopped by a
   * press; nothing else may ever be stopped by it. Absent means nobody recorded it.
   */
  startedByTheProduct?: boolean
  /**
   * WHEN THE CALLER READ THE PROCESS AS STARTING, checked and then discarded.
   *
   * A caller that read `/proc`, or ran `ps -o lstart=`, knows when the process started. Reading it
   * again here closes the race between that reading and this call: if the pid was reused in
   * between, the number now belongs to a different program, and storing the machine's current
   * start time would write a row about the stranger. A mismatch is refused.
   *
   * The value is NOT stored. `registerResource` stores the start time the machine reports at this
   * moment, so the ledger keeps one reading and not a caller's claim about it.
   */
  osStartedAt?: string
  /**
   * WHY THIS SESSION IS TAKING ON A PROCESS IT DID NOT START, for a process, gpu or client row (decision AOwsOHMVq6Ce).
   * Without it a pid that started before the session's record was filed is refused; with it the row is written and its
   * `detail` begins with the reason. See `aProcessOlderThanItsSession`.
   */
  adopting?: string
  /**
   * SET BY `POST /api/resources` ONLY, where the pid comes from a caller: the row is then refused when the process
   * started before the session's record was filed and `adopting` is absent. The office's own registrations read
   * their pids themselves (the server, its worker, its terminal holder), so they do not ask.
   */
  sentThroughTheDoor?: true
  /**
   * ONLY FOR A `slot` ROW, and only lib/slots.ts sends it: the process group that will hold the
   * seat, as `theGroupThatWouldHoldASlot` read it. Without it a slot row is refused, which is what
   * keeps `POST /api/resources` from writing one: a slot is asked for at `POST /api/slots/acquire`,
   * where the line and the seats are.
   */
  slotHolder?: SlotHolder
  /**
   * THE GROUP WHOSE JOB OBJECT HOLDS THE PROCESS, on Windows, where the process reader gives every process group 0. The
   * row stores it as its group in place of that 0. Set only by a server caller that has asked Windows (the terminal
   * holder's record in lib/terminals.ts); the door never sets it.
   */
  groupItsJobObjectHolds?: number
  actor: Actor
}

/**
 * The session record that will own this row, or a refusal.
 *
 * IT RETURNS THE RECORD NOW, because the row's workspace is read off it. `recordInWorkspace`
 * carries the "not in this project" refusal, and its own 404 already names the id — the sentence
 * about filing a session first is kept for the case that matters, which is a caller whose session
 * record does not exist at all.
 */
function requireSessionRecord(id: string, workspaceId: string): PanelRecord {
  const record = getRecord(id)
  if (!record) {
    throw new PanelError(
      `No record with id ${id}. A resource is registered against the session record that started it — ` +
        'create one with POST /api/records {"kind":"session","title":"...","data":{"state":"running"}} first, ' +
        'because without it nothing can say whether the session has ended.',
      404,
    )
  }
  if (record.kind !== 'session') {
    throw new PanelError(
      `Record ${id} is a ${record.kind}, not a session. Resources are owned by the session that started them, ` +
        'because "has the owner ended" is the whole question this ledger answers.',
    )
  }
  // In THIS project. A port registered against another project's session would be listed, swept
  // and released by people working on something else.
  return recordInWorkspace(id, workspaceId)
}

function positiveInteger(value: string, what: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new PanelError(`${what} must be a whole number, and it was "${value}".`)
  }
  const n = Number(value.trim())
  if (n < 1) throw new PanelError(`${what} must be 1 or more, and it was ${n}.`)
  return n
}

/**
 * EVERY MOMENT A STAMP IN THE STORED FORM NAMES ON THIS MACHINE'S CLOCK: one on an ordinary day, two in the hour the
 * clocks go back (the earlier first), and none in the hour they skip. Null when the words are not in the stored form,
 * or name a date and time the calendar does not have, such as 30 February.
 *
 * The words are never read as one moment picked from two, and words the clock skipped are never read as the hour
 * after. Either would be a guess.
 */
function theMomentsTheWordsName(stamp: string): number[] | null {
  const words = stamp.trim()
  if (parseStoredStamp(words) === null || momentOfStampInZone(words, 'UTC', 'reject') === null) return null
  const zone = theClockZone()
  const latest = latestMomentOfStampInZone(words, zone)
  if (latest === null) return []
  const earliest = momentOfStampInZone(words, zone)
  return earliest === null || earliest === latest ? [latest] : [earliest, latest]
}

/**
 * THE MOMENTS A START TIME SENT BY A CALLER NAMES. Words in the stored form, which is what `GET /api/resources` gives
 * back, name the moments `theMomentsTheWordsName` finds. A time that states its zone names its one moment. Any other
 * shape is read the way `parseAnyStamp` reads it. Without a zone, that is JavaScript's reading of local words, which in
 * the repeated hour is the first pass. Null when it is not a time.
 */
function theMomentsASentStartTimeNames(sent: string): number[] | null {
  const inWords = theMomentsTheWordsName(sent)
  if (inWords !== null) return inWords
  const read = parseAnyStamp(sent)
  return read === null ? null : [read.getTime()]
}

/**
 * IS THE START TIME THE CALLER SENT THE ONE THE MACHINE REPORTS FOR THAT PID?
 *
 * /proc counts a process's start in clock ticks since the boot. `processById` turns that into local wall-clock time,
 * and into the same moment as an instant with its offset. A caller that read the same process — through `/proc` or
 * `ps -o lstart=` — sends the same moment back as a string, and this checks the two describe one process.
 *
 * EACH SIDE IS READ AS THE MOMENTS IT NAMES (wave 13q item 1i). The machine's reading is its instant
 * (`startedInstant`) when the probe kept one, and otherwise every moment its words name. The start time sent is read by
 * `theMomentsASentStartTimeNames`. The two are one process when a moment of one is within a second of a moment of the
 * other. On 25 October 2026 the merge tool sent the exact start of a process begun at 01:30 winter time, and this check
 * read the machine's words as 01:30 summer time, an hour earlier, so it refused the full-suite seat as another process.
 *
 * WORDS OF THE REPEATED HOUR ARE ONE PROCESS WITH EITHER OF THEIR TWO MOMENTS, when one side has only words. That
 * leaves one case it cannot tell apart: a pid given to a second process exactly an hour after the first, to the second,
 * across that hour. The ledger's own check, `theRowIsAboutThisProcess`, compares words and has the same limit.
 *
 * WORDS THE CLOCK SKIPPED NAME NO MOMENT, and are refused with that reason. They are never read as the hour after.
 *
 * ONE SECOND IS THE TOLERANCE, and it is not slack. `ps -o lstart=` prints whole seconds, and this
 * reader's own stamp holds whole seconds too, so the same process can round to either side of a
 * second. Two different processes cannot land within a second of each other and both hold the same
 * pid — the kernel reuses a number only after the previous holder has gone.
 *
 * AN UNREADABLE VALUE IS REFUSED, not ignored. Ignoring it would let a caller believe a check
 * happened that did not, which is the silence this whole file is built against. An instant the probe kept that cannot
 * be read is refused too: the words beside it are not read in its place.
 */
function theStartTimeTheCallerSentIsThisProcess(
  pid: number,
  sent: string,
  real: OsProcess,
): { ok: true } | { ok: false; why: string; different?: true } {
  const sentMoments = theMomentsASentStartTimeNames(sent)
  if (sentMoments === null) {
    return {
      ok: false,
      why:
        `The start time you sent, "${sent}", is not a time Mole Office can read, so it cannot check that pid ${pid} ` +
        'is still the process you read.',
    }
  }
  if (sentMoments.length === 0) {
    return {
      ok: false,
      why:
        `The start time you sent, "${sent}", is a time this machine's clock (${theClockZone()}) skipped when ` +
        `the clocks went forward, so it names no moment, and Mole Office cannot check that pid ${pid} is still ` +
        'the process you read. Send the start time with its offset, as an ISO 8601 time ending in Z or in +hh:mm.',
    }
  }
  const instant = real.startedInstant === undefined ? undefined : momentOfAnInstant(real.startedInstant)
  const realMoments =
    instant === undefined ? theMomentsTheWordsName(real.startedAt) : instant === null ? null : [instant]
  if (realMoments === null) {
    return {
      ok: false,
      why:
        `Mole Office read "${real.startedInstant ?? real.startedAt}" as the start time of pid ${pid}, and that ` +
        'is not a time, so it cannot check the start time you sent against it.',
    }
  }
  if (realMoments.length === 0) {
    return {
      ok: false,
      why:
        `Mole Office read "${real.startedAt}" as the start time of pid ${pid}, and this machine's clock ` +
        `(${theClockZone()}) skipped that time when the clocks went forward, so it names no moment, and the ` +
        'start time you sent cannot be checked against it.',
    }
  }
  if (!sentMoments.some((s) => realMoments.some((r) => Math.abs(s - r) <= 1000))) {
    return {
      ok: false,
      // Both times were read and they differ, as opposed to one that could not be read. The slot door
      // says the cause differently: there a pid read inside a container is as likely as a reused one.
      different: true,
      why:
        `Pid ${pid} started at ${theStartInWords(real)}, and the start time you sent was ${sent}: these are not the ` +
        'same process, because the pid was reused between your reading and this registration, so Mole Office will ' +
        'not write a row against the process running now.',
    }
  }
  return { ok: true }
}

/** When a process began, in words, with the instant beside them when the probe kept one. */
function theStartInWords(proc: OsProcess): string {
  return proc.startedInstant === undefined ? proc.startedAt : `${proc.startedAt} (${proc.startedInstant})`
}

/**
 * A PROCESS THAT STARTED BEFORE THE SESSION REGISTERING IT, refused unless the request adopts it in words (decision
 * AOwsOHMVq6Ce, problem JmaDkej3InKw). Null when the row may be written.
 *
 * A builder once found a pid by a pattern (pgrep, head -1), registered it, and later killed a three-day-old server it
 * had not started. A process a session started itself cannot be older than the session, so a process that is older was
 * found, not started, and the session has to say that it is taking it on and why.
 *
 * THE SESSION'S START IS ITS RECORD'S `createdAt`, which the office stamped when the record was filed. `data.startedAt`
 * is written by the caller, so it cannot be what the check is made against. Both stamps hold whole seconds, so one
 * second is the tolerance, as in `theStartTimeTheCallerSentIsThisProcess`.
 *
 * THE TWO MOMENTS ARE COMPARED WHEN BOTH NAME THEIR STAMPS: the moment the probe read the process begin at
 * (`startedInstant`, beside `startedAt`) and the moment the record door filed the session at (`data.filedTime`, beside
 * `createdAt`). Each is read by the rule of `momentOfAStampAndItsInstant` in src/shared/time.ts, as a whole second. On
 * the night the clocks go back the words alone read the second pass of the hour from 01:00 as the first, so a process
 * begun after its session could be refused, and one begun before it taken. When either moment is missing or does not
 * name its stamp, as when a stamp was changed alone, the two stamps are compared, as before, so one stamp is never
 * compared with the other's moment. The refusal quotes the stamps either way.
 *
 * A STAMP THAT CANNOT BE READ IS A REFUSAL, because a check that could not be made must not read as passed. So is a
 * moment that names its stamp and cannot be read, and the refusal then quotes the two moments.
 */
function aProcessOlderThanItsSession(
  pid: number,
  proc: OsProcess,
  session: PanelRecord,
  adopting: string | undefined,
): string | null {
  if (adopting !== undefined) return null
  const processStartedAt = proc.startedAt
  const startedInstant = proc.startedInstant
  const filedTime = (session.data['filedTime'] as { instant?: unknown } | null | undefined)?.instant
  const atTheirMoments = anInstantNamesItsStamp(processStartedAt, startedInstant) && anInstantNamesItsStamp(session.createdAt, filedTime)
  const processMs = momentOfAStampAndItsInstant(processStartedAt, atTheirMoments ? startedInstant : undefined, parseStoredStamp)
  const sessionMs = momentOfAStampAndItsInstant(session.createdAt, atTheirMoments ? filedTime : undefined, parseStoredStamp)
  if (processMs === null || sessionMs === null) {
    return (
      `Mole Office could not read when pid ${pid} started ("${atTheirMoments ? startedInstant : processStartedAt}") or when session ${session.id} was ` +
      `filed ("${atTheirMoments ? String(filedTime) : session.createdAt}"), so it cannot tell whether this session started the process. Nothing was ` +
      'recorded. If the session is taking on a process it did not start, send {"adopting":"<why>"}.'
    )
  }
  if (processMs >= sessionMs - 1000) return null
  return (
    `Pid ${pid} started at ${processStartedAt}, before session ${session.id} was filed at ${session.createdAt}, so ` +
    'this session did not start it. Nothing was recorded. A pid found by a pattern can name a process somebody else ' +
    'started, and a row would let it be stopped as this session\'s. Register the pid you read from your own start. ' +
    'If this session is taking on a process it did not start, send {"adopting":"<why>"} with the same request.'
  )
}

/** The words an adopted row's `detail` begins with, so the row says it was taken on and why. Empty when it was not. */
function theAdoption(adopting: string | undefined): string {
  return adopting === undefined ? '' : `adopted, not started by this session: ${adopting}`
}

/**
 * WHAT `registered_by` HOLDS FOR ONE ACTOR: the actor type, a colon, then the actor id.
 *
 * IT IS A FUNCTION SO THAT NOBODY HAS TO SPELL THE SHAPE AGAIN. `src/server/lib/presence.ts` looked
 * for a bare id in that column and so matched nothing, for every agent, always. That is the whole of
 * problem `yyyb4TyGo-6i`: one place built the string and another guessed at it. Now one place builds
 * it and every reader asks here, so a change to the shape cannot leave a reader behind.
 */
export function whoRegisteredIt(actor: { type: string; id: string }): string {
  return `${actor.type}:${actor.id}`
}

/**
 * THE CONTAINER AND THE PID INSIDE IT, when a registration names a process that way, or null.
 *
 * Every rule about the pair is here: both or neither, never beside `key`, and only for a process.
 * Two numbers for one process could disagree, and Mole Office would then have to choose one, so a
 * body carrying both is refused rather than read.
 */
function theContainerHalfOf(input: RegisterInput): { container: string; pid: number } | null {
  const { container, pidInContainer } = input
  if (container === undefined && pidInContainer === undefined) return null
  if (input.type !== 'process') {
    throw new PanelError(
      `container and pidInContainer name a process by the pid a container gives it, and this registration is a ` +
        `${input.type} row. ${input.type === 'gpu' ? 'nvidia-smi already reports pids as this machine numbers them, so send the pid as key.' : 'Send key instead.'}`,
    )
  }
  if (container === undefined || pidInContainer === undefined) {
    throw new PanelError(
      `A process inside a container is named by both its container and its pid there, and this registration sent ` +
        `only ${container === undefined ? 'pidInContainer' : 'container'}. A pid alone says nothing about which ` +
        'container it is in.',
    )
  }
  if (input.key !== undefined) {
    throw new PanelError(
      'Send either key, the pid as this machine numbers it, or container and pidInContainer, not both: two numbers ' +
        'for one process could disagree, and Mole Office would have to choose one.',
    )
  }
  return {
    container,
    pid: positiveInteger(String(pidInContainer), 'pidInContainer (the pid as the container sees it)'),
  }
}

/**
 * EVERY PORT A SERVER HOLDS NOW, AS THE LEDGER RECORDS IT, in every project.
 *
 * Ports are the machine's, not a project's, so a server's port recorded in another project's ledger
 * counts as much as one recorded in this one. A row counts only while it is unreleased and the
 * ledger itself calls it alive (`livenessOf`): a released row, or one whose port has changed hands
 * or whose server has gone, records no server holding it now.
 */
function thePortsServersHoldNow(machine: OsProbe): Set<string> {
  const probe = oneReadingPerListing(machine)
  const rows = sqlite
    .prepare("SELECT * FROM session_resources WHERE type = 'port' AND released_at IS NULL")
    .all() as LedgerRow[]
  const held = new Set<string>()
  for (const row of rows) {
    const entry = toEntry(row)
    if (livenessOf(entry, probe).state === 'alive') held.add(entry.key)
  }
  return held
}

/**
 * WHAT A WOULD-BE CLIENT'S PROCESS GROUP SERVES, in words, or null when it serves nothing.
 *
 * A client may be registered only when its group is not the server answering this request, holds no
 * Mole Office server, and holds no port the ledger records a server holding now, in any project
 * (`thePortsServersHoldNow`).
 * Each of those would let a client row stand where the ledger's owner of a server belongs. A port the
 * client listens on for itself is its own: Electron listens on a debugging port when a test drives it,
 * and that makes it no server. A group whose members or ports cannot be read is refused as well,
 * because "nothing found" would then be a guess.
 */
function whatAClientsGroupServes(proc: OsProcess, probe: OsProbe): string | null {
  if (proc.pgid === probe.ownProcessGroup()) return 'is the group of the server answering this request'
  let members: OsProcess[]
  try {
    members = probe.processesInGroup(proc.pgid)
  } catch (err) {
    return `could not be read (${messageOf(err)}), so whether it holds a server cannot be told`
  }
  const server = members.find((one) => moleOfficePartOf(one.command) !== null)
  if (server !== undefined) {
    return `holds a Mole Office ${moleOfficePartOf(server.command) ?? 'server'}, pid ${server.pid}`
  }
  const registeredPorts = thePortsServersHoldNow(probe)
  if (registeredPorts.size === 0) return null
  const pids = new Set(members.map((one) => one.pid))
  let listening: OsPort[]
  try {
    listening = probe.listeningPorts()
  } catch (err) {
    return `may hold a server's port, because the listening ports could not be read (${messageOf(err)})`
  }
  const held = listening.find((one) => one.pid !== null && pids.has(one.pid) && registeredPorts.has(String(one.port)))
  if (held !== undefined) return `holds port ${held.port}, as pid ${String(held.pid)}, which the ledger records as a server's port`
  return null
}

/**
 * The processes `registerResource` reads for this input, for `readFirst`: the pid a process, gpu or client row names on
 * this machine, unless the door has read it already. A pid named from a container is found by other readings.
 */
export function theProcessesARegistrationReads(input: RegisterInput): AProcessToRead[] {
  if (input.type !== 'process' && input.type !== 'gpu' && input.type !== 'client') return []
  if (theContainerHalfOf(input) !== null || (input.type === 'process' && input.sentFromAContainerBy !== undefined)) return []
  const key = input.key?.trim() ?? ''
  if (!/^\d+$/.test(key) || Number(key) < 1) return []
  const pid = Number(key)
  if (input.type !== 'client' && input.processTheDoorRead?.pid === pid) return []
  return [{ pid, alsoItsStarterIfEnded: false }]
}

/**
 * Write down something this session started.
 *
 * A process or a GPU holder is probed on the way in, for two reasons. It catches the pid that
 * was already wrong when it was sent, and it captures the process group and the start time,
 * which are what makes a later release both possible and safe. A pid that is not running is
 * refused rather than stored: a ledger entry that was never true would be reported as an orphan
 * forever.
 *
 * A process inside a container may be named by `container` and `pidInContainer` instead of `key`.
 * The row is then written about the same process as this machine numbers it, and `detail` says
 * which container and which pid inside it the caller named, so the row shows what was made of the
 * caller's words.
 */
export function registerResource(input: RegisterInput): LedgerEntry {
  const { sessionRecordId, type, actor } = input
  const inside = theContainerHalfOf(input)
  const key = input.key?.trim() ?? ''
  if (inside === null && key === '') {
    throw new PanelError(
      'key must not be empty — it is what identifies the resource later. A process running inside a container ' +
        'may be named by {"container":…,"pidInContainer":…} instead.',
    )
  }
  if (type === 'slot' && input.slotHolder === undefined) {
    throw new PanelError(
      'A slot is not registered here. It is asked for at POST /api/slots/acquire, which puts it in line for one of ' +
        'the machine\'s shared seats and says whether it was granted or where it is in the line.',
    )
  }
  if (input.osStartedAt !== undefined && type !== 'process' && type !== 'gpu' && type !== 'client') {
    throw new PanelError(
      `A start time identifies a process, and this registration is a ${type} row, whose key is not a pid, so there ` +
        'is nothing to check it against. Send osStartedAt only when registering a process, a gpu pid or a client.',
    )
  }
  const adopting = input.adopting?.trim()
  if (adopting !== undefined && type !== 'process' && type !== 'gpu' && type !== 'client') {
    throw new PanelError(
      `adopting says why a session takes on a process it did not start, and this registration is a ${type} row, whose ` +
        'key is not a pid. Send adopting only when registering a process, a gpu pid or a client.',
    )
  }
  if (adopting === '') {
    throw new PanelError('adopting must say why this session is taking on a process it did not start, and it was blank.')
  }
  const owner = requireSessionRecord(sessionRecordId, input.workspaceId)

  const probe = osProbe()
  let pgid: number | null = null
  let osStartedAt: string | null = null
  let detail = input.detail?.trim() ?? ''
  let storedKey = key

  switch (type) {
    case 'process':
    case 'gpu': {
      const found =
        inside === null
          ? null
          : theHostPidOfAProcessInAContainer(inside.container, inside.pid, probe, input.sentFromAContainerBy?.callerPid)
      // A BARE PID FROM A PROGRAM IN A CONTAINER is read in that program's own pid namespace (problem xnfjNO3w2GCQ).
      const seen =
        found !== null || type !== 'process' || input.sentFromAContainerBy === undefined
          ? null
          : { pidAsSeen: positiveInteger(key, 'a process key (the pid)'), callerPid: input.sentFromAContainerBy.callerPid }
      const pid =
        found !== null
          ? found.hostPid
          : seen !== null
            ? theHostPidOfAPidItsCallerSees(seen.callerPid, seen.pidAsSeen, probe)
            : positiveInteger(key, type === 'gpu' ? 'the pid holding GPU memory' : 'a process key (the pid)')
      const proc = input.processTheDoorRead?.pid === pid ? input.processTheDoorRead : probe.processById(pid)
      if (!proc) {
        throw new PanelError(
          `Nothing is running as pid ${pid}, so there is nothing to record. Register the resource while it is ` +
            'alive — the ledger stores its process group and start time at that moment, and it cannot get ' +
            'either of them afterwards.',
        )
      }
      if (input.osStartedAt !== undefined) {
        const check = theStartTimeTheCallerSentIsThisProcess(pid, input.osStartedAt, proc)
        if (!check.ok) throw new PanelError(check.why)
      }
      const older = input.sentThroughTheDoor === true ? aProcessOlderThanItsSession(pid, proc, owner, adopting) : null
      if (older !== null) throw new PanelError(older)
      pgid = input.groupItsJobObjectHolds ?? proc.pgid
      osStartedAt = proc.startedAt
      // The command line is the true detail. Overwriting it with a caller's guess would be the
      // one field the report is read for, wrong. A process named from inside a container also says
      // where it was named, because the key the row shows is not the number the caller sent.
      const where =
        found !== null
          ? `pid ${found.pidInContainer} inside container ${found.container.name} ` +
            `(${found.container.id.slice(0, 12)}), which is pid ${pid} on this machine`
          : seen !== null
            ? `pid ${seen.pidAsSeen} as the container it was sent from sees it (sent by pid ${seen.callerPid} on this ` +
              `machine), which is pid ${pid} on this machine`
            : ''
      detail = [theAdoption(adopting), detail, where, proc.command].filter((part) => part !== '').join(' — ')
      storedKey = String(pid)
      break
    }

    case 'client': {
      const pid = positiveInteger(key, 'a client key (the pid of the window or program that connects)')
      const proc = probe.processById(pid)
      if (!proc) {
        throw new PanelError(
          `Nothing is running as pid ${pid}, so there is no client to record. A client is registered while it is ` +
            'running, so the ledger can keep its process group and start time.',
        )
      }
      if (input.osStartedAt !== undefined) {
        const check = theStartTimeTheCallerSentIsThisProcess(pid, input.osStartedAt, proc)
        if (!check.ok) throw new PanelError(check.why)
      }
      const older = input.sentThroughTheDoor === true ? aProcessOlderThanItsSession(pid, proc, owner, adopting) : null
      if (older !== null) throw new PanelError(older)
      const serves = whatAClientsGroupServes(proc, probe)
      if (serves !== null) {
        throw new PanelError(
          `A client row names a program that only connects to the office, and pid ${pid}'s process group ` +
            `${proc.pgid} ${serves}. A client never owns a server's process group or port, so nothing was recorded. ` +
            'A server is registered under its own session as a process and its ports.',
        )
      }
      pgid = proc.pgid
      osStartedAt = proc.startedAt
      detail = [theAdoption(adopting), detail, proc.command].filter((part) => part !== '').join(' — ')
      storedKey = String(pid)
      break
    }

    case 'port': {
      const port = positiveInteger(key, 'a port key (the port number)')
      if (port > 65535) throw new PanelError(`a port must be 65535 or less, and it was ${port}.`)
      storedKey = String(port)
      // Not required to be listening yet: a server registered the moment it is started has not
      // finished binding, and refusing that would push registration to after the risky part.
      // When it IS listening, the holder is captured so a release has a group to signal and an
      // identity to check against.
      const held = probe.listeningPorts().find((p) => p.port === port && p.pid !== null)
      if (held?.pid != null) {
        const proc = probe.processById(held.pid)
        if (proc) {
          pgid = proc.pgid
          osStartedAt = proc.startedAt
          detail = detail === '' ? `port ${port} — ${proc.command}` : `${detail} — ${proc.command}`
        }
      }
      if (detail === '') detail = `port ${port}, nothing listening on it when it was registered`
      break
    }

    case 'container': {
      if (detail === '') detail = `container ${key}`
      break
    }

    case 'lock': {
      if (!isAbsolute(key)) {
        throw new PanelError(
          `A lock file must be given as an absolute path, and "${key}" is relative. A relative path means a ` +
            'different file depending on where the reader is standing.',
        )
      }
      const resolved = resolvePath(key)
      const allowed = configuredLockPaths()
      if (!insideLockPath(resolved, allowed)) {
        throw new PanelError(
          `"${resolved}" is not under any configured lock path (${allowed.length === 0 ? 'none are configured' : allowed.join(', ')}). ` +
            'Mole Office only looks inside the paths it was pointed at, so a wrong configuration cannot send it ' +
            'wandering across the disk. Open Office controls on the Settings page, find MOLE_OFFICE_LOCK_PATHS, and press Save value to change the list.',
        )
      }
      storedKey = resolved
      if (detail === '') detail = `lock file ${resolved}`
      break
    }

    case 'slot': {
      // Checked above: a slot row always arrives with its holder, read by lib/slots.ts a moment ago.
      const holder = input.slotHolder as SlotHolder
      pgid = holder.member.pgid
      osStartedAt = holder.leader.startedAt
      const held = `process group ${holder.member.pgid}, led by ${holder.leader.command}`
      detail = detail === '' ? `a ${key} slot for ${held}` : `${detail} — ${held}`
      break
    }
  }

  const existing = sqlite
    .prepare(
      `SELECT id FROM session_resources
       WHERE workspace_id = ? AND session_record_id = ? AND type = ? AND key = ? AND released_at IS NULL`,
    )
    .get(owner.workspaceId, sessionRecordId, type, storedKey) as { id: string } | undefined
  if (existing) {
    throw new PanelError(
      `This session already has ${type} "${storedKey}" in the ledger, as ${existing.id}, and it has not been ` +
        'released. Two rows for one thing would be reported as two orphans.',
      409,
    )
  }

  const row: LedgerRow = {
    id: anOfficeId(),
    // The session's project, not the request's. A resource belongs where its session belongs.
    workspace_id: owner.workspaceId,
    session_record_id: sessionRecordId,
    type,
    key: storedKey,
    pgid,
    os_started_at: osStartedAt,
    detail,
    registered_at: now(),
    registered_by: whoRegisteredIt(actor),
    released_at: null,
    released_by: null,
    release_note: null,
    // THE WORLD THIS RESOURCE SERVES, read here and never afterwards. Criterion G5: a row has to be
    // able to say "a scratch API on port 29601 over /tmp/…/gateP.db, checkout X, started by session
    // Y" rather than only that a number was taken. `input.world` is what the process registering
    // itself read about ITSELF; when it is absent this server reads its own, which is the right
    // answer for anything the server started and an honest approximation for nothing else — so it
    // is only used when the caller registered its own pid.
    world: input.world === undefined ? null : JSON.stringify(input.world),
    started_by_the_product: input.startedByTheProduct === true ? 1 : null,
  }
  sqlite
    .prepare(
      `INSERT INTO session_resources
       (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail,
        registered_at, registered_by, released_at, released_by, release_note, world,
        started_by_the_product)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    )
    .run(
      row.id,
      row.workspace_id,
      row.session_record_id,
      row.type,
      row.key,
      row.pgid,
      row.os_started_at,
      row.detail,
      row.registered_at,
      row.registered_by,
      row.world,
      row.started_by_the_product,
    )

  // Registering is written to the change log as well as the kill. One line per resource is a
  // handful per session, and it puts "this session started a server on 8788" on the session's
  // own page, which is where somebody looking for the orphan will be.
  logChange(sessionRecordId, 'create', actor, `resource.${type}`, null, `${storedKey} — ${detail}`)

  return toEntry(row)
}

// ============================================================================ reporting

export interface ResourceReport extends LedgerEntry {
  /**
   * What was found on the machine for this row.
   *
   * On a released row this is `unknown` with the reason that the row is closed, unless the caller
   * asked for the released rows to be checked as well — see `listResources`.
   */
  liveness: Liveness
  /** How long ago this was registered. */
  age: Age
  session: SessionView
  /**
   * How long it has outlived its session.
   *
   * For a session the office marked orphaned, counted from when it was marked so. Null while the
   * session has not ended and is not marked orphaned, or when the change log does not say when. Also null on a released row that was not checked,
   * because its session record was not read, so how long is not a number anybody worked out.
   */
  orphanedFor: Age | null
  /** Only on `gpu` rows: how much memory it is holding, or why that could not be read. */
  gpuMemory: { usedMib: number } | { unknown: string } | null
}

/** A row Mole Office could not get a straight answer about, and why. Never silently dropped. */
export interface UncheckedResource {
  id: string
  type: ResourceType
  key: string
  detail: string
  session: SessionView
  reason: string
}

export { gpuMemoryFor } from '../db/the-processes-a-listing-reads.ts'

export { orphanedSince } from '../db/the-processes-a-listing-reads.ts'

function reportFor(entry: LedgerEntry, probe: OsProbe, sessionRecord?: PanelRecord | null): ResourceReport {
  const session = sessionViewOf(entry.sessionRecordId, sessionRecord)
  const since = orphanedSince(session)
  return {
    ...entry,
    liveness: livenessOf(entry, probe),
    age: ageSince(entry.registeredAt, `resource ${entry.id}`),
    session,
    orphanedFor: since === null ? null : ageSince(since, `session ${session.recordId}`),
    gpuMemory: gpuMemoryFor(entry, probe),
  }
}

export { reportForAReleasedRow } from '../db/the-processes-a-listing-reads.ts'

/** Every ledger row, with what is alive right now. */
/**
 * The live ledger row that registered this process, in any project, or null.
 *
 * ANY PROJECT, not the caller's. A process registered by a session working on the greenhouse corpus
 * is still registered; asking "who started this server" and getting "nobody" because the question
 * was asked from the wrong project would be the worst possible wrong answer, since "nobody" is what
 * makes a process a candidate for being reported as unowned.
 *
 * The pid is matched first and the process GROUP second. A server started by `npm run dev` is
 * several processes and the one that took the port is not always the one somebody registered, so a
 * row naming any pid in this process's group is a row about this process's stack.
 */
export function registrationOfProcess(
  pid: number,
  pgid: number | null,
): { entry: LedgerEntry; session: SessionView; startedByTheProduct: boolean | null } | null {
  const byPid = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE type = 'process' AND key = ? AND released_at IS NULL
       ORDER BY registered_at DESC LIMIT 1`,
    )
    .get(String(pid)) as LedgerRow | undefined
  const row =
    byPid ??
    (pgid === null
      ? undefined
      : (sqlite
          .prepare(
            `SELECT * FROM session_resources
             WHERE type = 'process' AND pgid = ? AND released_at IS NULL
             ORDER BY registered_at DESC LIMIT 1`,
          )
          .get(pgid) as LedgerRow | undefined))
  if (row === undefined) return null
  const entry = toEntry(row)
  return {
    entry,
    session: sessionViewOf(entry.sessionRecordId),
    startedByTheProduct: entry.startedByTheProduct,
  }
}

/**
 * The live ledger row that holds this port, in any project, or null.
 *
 * What "one supervisor per port" is asked with. Vite already refuses a port it cannot have; the API
 * refuses too, and this is what lets the refusal say WHOSE the port is rather than only that it is
 * taken.
 */
export function registrationOfPort(port: number): { entry: LedgerEntry; session: SessionView } | null {
  const row = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE type = 'port' AND key = ? AND released_at IS NULL
       ORDER BY registered_at DESC LIMIT 1`,
    )
    .get(String(port)) as LedgerRow | undefined
  if (row === undefined) return null
  const entry = toEntry(row)
  return { entry, session: sessionViewOf(entry.sessionRecordId) }
}

/** One open ledger row about a port or a database file that a cleanup asked about. */
export interface AHoldingRow {
  resourceId: string
  workspaceId: string
  sessionRecordId: string
  sessionTitle: string | null
  type: ResourceType
  key: string
  /** Which of the things asked about this row is about: `port 5173`, `the database /a/b.db`. */
  holds: string[]
  liveness: Liveness
}

/** The answer to "does a live world hold this", which a cleanup asks before it removes or frees it. */
export interface WhatHoldsIt {
  askedAbout: { ports: number[]; database: string | null }
  /** Rows whose process the machine says is still there, or could not say. A cleanup refuses for each. */
  holders: AHoldingRow[]
  /** Rows still open whose process the machine says has gone. They hold nothing, and they are named. */
  openButGone: AHoldingRow[]
  says: string
}

/**
 * DOES A LIVE WORLD HOLD THIS PORT OR THIS DATABASE FILE? ASKED BEFORE A CLEANUP REMOVES ONE OR FREES ONE.
 *
 * A decision, made when the seven-day leases went, says that a cleanup that
 * would remove a database
 * or free a port first asks the ledger whether a live world holds it, and refuses if so. It is one read,
 * a check and not a hold, and this is that read. It signals nothing
 * and closes no row. Reading a row's liveness may restamp a row written by the old start-time
 * reading, as every read of the ledger does (`theRowIsAboutThisProcess`).
 *
 * A row holds a port when it is a port row for that number, or when the world it records says it
 * serves on that port. A row holds a database file when the world it records names that file by its
 * path, or by its identity: a world read off another server's header carries only the identity
 * (`theWorldThatHeaderDescribes`), worked out here from the same path in src/config/database-identity.mjs.
 * A file that cannot be read has no identity, and then only the path is compared. Every project's rows
 * are read, because a port is one number on one machine and a file is one path on it.
 *
 * THE MACHINE IS ASKED ABOUT EACH ROW FOUND, the way the ledger's own list asks. A row whose process
 * has gone holds nothing, and it is named in `openButGone` rather than dropped. A row the machine
 * could not answer about is a holder: nobody could tell, so the cleanup refuses.
 */
export function whatHoldsIt(asked: { ports: number[]; database: string | null }): WhatHoldsIt {
  const rows = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE released_at IS NULL AND (type = 'port' OR world IS NOT NULL)
       ORDER BY registered_at DESC, id DESC`,
    )
    .all() as LedgerRow[]
  const probe = oneReadingPerListing(osProbe())
  const read = asked.database === null ? null : databaseIdentity(asked.database).id
  const identity = read === UNKNOWN ? null : read
  const holders: AHoldingRow[] = []
  const openButGone: AHoldingRow[] = []
  for (const row of rows) {
    const entry = toEntry(row)
    const holds: string[] = []
    for (const port of asked.ports) {
      if ((entry.type === 'port' && entry.key === String(port)) || entry.world?.port === port) holds.push(`port ${String(port)}`)
    }
    if (
      asked.database !== null &&
      (entry.world?.database === asked.database || (identity !== null && entry.world?.databaseIdentity === identity))
    ) {
      holds.push(`the database ${asked.database}`)
    }
    if (holds.length === 0) continue
    const found: AHoldingRow = {
      resourceId: entry.id,
      workspaceId: row.workspace_id,
      sessionRecordId: entry.sessionRecordId,
      sessionTitle: sessionViewOf(entry.sessionRecordId).title,
      type: entry.type,
      key: entry.key,
      holds,
      liveness: livenessOf(entry, probe),
    }
    if (found.liveness.state === 'gone') openButGone.push(found)
    else holders.push(found)
  }
  const named = [...asked.ports.map((port) => `port ${String(port)}`), ...(asked.database === null ? [] : [`the database ${asked.database}`])]
  const says =
    holders.length === 0
      ? `No live ledger row holds ${named.join(', ')}.` +
        (openButGone.length === 0 ? '' : ` ${String(openButGone.length)} open row${openButGone.length === 1 ? ' names' : 's name'} one of them, but the process each is about has gone.`)
      : holders
          .map(
            (one) =>
              `Ledger row ${one.resourceId} (${one.type} ${one.key}) of the run ${one.sessionTitle ?? one.sessionRecordId} ` +
              `in project ${one.workspaceId} holds ${one.holds.join(' and ')}. ` +
              (one.liveness.state === 'alive'
                ? `${one.liveness.detail.replace(/\.$/, '')}.`
                : `The machine could not say whether it is still there: ${one.liveness.state === 'unknown' ? one.liveness.reason : one.liveness.detail}`),
          )
          .join(' ')
  return { askedAbout: { ports: asked.ports, database: asked.database }, holders, openButGone, says }
}

/**
 * WHETHER THE ENVIRONMENT A PROCESS WAS STARTED WITH CAN BE READ ON THIS PLATFORM. Only on Linux, from
 * /proc/<pid>/environ. `startingEnvironmentValue` below refuses everywhere else, and a caller that would meet
 * only that refusal asks this first.
 */
export function aStartingEnvironmentCanBeRead(platform: string = process.platform): boolean {
  return platform === 'linux'
}

/**
 * One variable from the environment a Linux process was started with.
 * Later changes to its environment are not visible here. A vanished process or an absent
 * variable answers null; an unreadable environment throws so the caller can handle that limit.
 *
 * ON A MAC IT IS UNKNOWN, and it throws saying so. macOS has no /proc/<pid>/environ. `ps -E` prints a
 * process's environment after its arguments with spaces between, so where the arguments end and the
 * environment begins is a guess, and an argument holding `NAME=` would read as the variable. A guess
 * is never answered as null, which would mean "not set". Wave 13t, round 21.
 */
export function startingEnvironmentValue(pid: number, name: string, platform: string = process.platform): string | null {
  if (!aStartingEnvironmentCanBeRead(platform)) {
    throw new Error(
      `${name} in the starting environment of process ${String(pid)} is unknown: on ${platform} Mole Office cannot read ` +
        'the environment a process was started with without guessing where its arguments end.',
    )
  }
  let raw: string
  try {
    raw = readFileSync(`/proc/${pid}/environ`, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ESRCH') return null
    throw err
  }
  const prefix = `${name}=`
  for (const entry of raw.split('\0')) {
    if (entry.startsWith(prefix)) return entry.slice(prefix.length)
  }
  return null
}

/**
 * CLOSE A ROW THAT HAS STOPPED BEING TRUE. It signals nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `releaseResource`, AND WHY IT MUST NOT BE
 * ---------------------------------------------------------------------------------------
 *
 * `releaseResource` means "stop this thing": it signals a process group and reports what died.
 * This means "the thing this row was about has already gone", which is a different act with a
 * different consequence, and running the first when you mean the second KILLS WHATEVER HOLDS THAT
 * PORT NOW — which after a restart is the new server, started a second ago by the same session.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS USED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A server under `tsx watch` restarts on every change under `src/`. Measured on this builder's own
 * stack on 3 September 2026: the stack registered itself, two edits restarted it twice, and its own
 * rows then named a pid that no longer existed — so the listener list called the stack UNOWNED, and
 * registering again was refused because the ledger already had a live row for that port. A stack
 * that cannot re-register after a reload is a stack that becomes unowned by working normally.
 *
 * IT IS NARROW ON PURPOSE. The caller has to have established that the row stopped matching, and
 * the note it writes says so, so the history reads "this was reloaded" and not "somebody tidied up".
 */
/**
 * A WORLD DIES WHEN THE LAST PROCESS SERVING IT STOPS. Criterion C3.
 *
 * Called whenever a `process` row ends — `closeRowThatStoppedMatching`, which is
 * what server starts and ended-run closures use, and `finish`, which every release
 * funnels through. One function called from both, rather than the same rule written at each site,
 * because a world that closed on one path and not the other would be a list that is right only
 * sometimes.
 *
 * IT CLOSES NOTHING WHILE ANYTHING IS STILL SERVING THE WORLD. A `tsx watch` restart is a new pid
 * and the same world: the database has not changed, so the world has not ended. The check is
 * therefore about the WORLD and not about the row — is any live process row still carrying this
 * database identity — and the row being closed is already released by the time this runs.
 *
 * IT IS SILENT WHEN THERE IS NOTHING TO CLOSE. A row with no world says nothing about which world it
 * belonged to, and a world nobody registered has no row to close. Neither is a failure.
 */
function aWorldEndsWhenNothingIsServingIt(row: LedgerEntry, because: string): void {
  if (row.type !== 'process') return
  const identity = row.world?.databaseIdentity ?? null
  if (identity === null || identity === '') return
  const stillServing = (
    sqlite
      .prepare("SELECT world FROM session_resources WHERE type = 'process' AND released_at IS NULL")
      .all() as { world: string | null }[]
  ).some((held) => parseWorld(held.world)?.databaseIdentity === identity)
  if (stillServing) return
  const world = liveWorldOf(identity)
  if (world === null) return
  closeWorldHere(world.id, because)
}

export function closeRowThatStoppedMatching(id: string, workspaceId: string, note: string, actor: Actor): LedgerEntry {
  const row = readRow(id, workspaceId)
  if (row === null) throw new PanelError(`No resource with id ${id} is in the ledger.`, 404)
  if (row.released_at !== null) return toEntry(row)
  sqlite
    .prepare('UPDATE session_resources SET released_at = ?, released_by = ?, release_note = ? WHERE id = ?')
    .run(now(), `${actor.type}:${actor.id}`, note, id)
  logChange(row.session_record_id, 'update', actor, `resource.${row.type}`, `${row.key} — held`, `${row.key} — ${note}`)
  const closed = readRow(id, workspaceId)
  if (closed === null) throw new PanelError(`Resource ${id} vanished while it was being closed.`, 500)
  const entry = toEntry(closed)
  aWorldEndsWhenNothingIsServingIt(entry, note)
  return entry
}

/** Each open row considered at run end or by a later look or sweep, with the reason for its outcome. */
export interface EndedRunRows {
  closed: { resource: LedgerEntry; reason: string }[]
  left: { resource: LedgerEntry; reason: string }[]
}

/**
 * The run has ended; the process may not have. Problem ssE_OrIgHoye.
 * Ask the same liveness reader release asks, including its start-time check and its refusal to
 * call an unknown process gone. This path never reaches a signal. An open row carries the reason
 * it remains open, so a finished run with a real leftover is still visible.
 * An unreadable process must also stay open with its error, without refusing the run's end or
 * stopping the sweep: problem wNjQEfclwxjJ, inspector message lBw2WAGMOKwF, secretary's message UQQeEtGCHiRn.
 * USER.md invariants 2 and 5 forbid calling an unreadable process gone.
 */
function closeAnEndedRunsGoneProcess(row: LedgerRow, state: unknown, actor: Actor, result: EndedRunRows): void {
  const entry = toEntry(row)
  let live: Liveness
  try {
    live = livenessOf(entry, osProbe())
  } catch (err) {
    live = { state: 'unknown', reason: err instanceof Error ? err.message : String(err) }
  }
  const reason = `The run ${entry.sessionRecordId} ended as ${String(state)}. ` +
    (live.state === 'gone'
      ? `${live.detail} The row was closed. Nothing was signalled.`
      : live.state === 'alive'
        ? `Its process has not ended: ${live.detail}. The row stays open. Nothing was signalled.`
        : `Its process could not be checked: ${live.reason} The row stays open. Nothing was signalled.`)
  if (live.state === 'gone') {
    const resource = closeRowThatStoppedMatching(entry.id, row.workspace_id, reason, actor)
    result.closed.push({ resource, reason })
    return
  }
  if (entry.releaseNote !== reason) {
    sqlite.prepare('UPDATE session_resources SET release_note = ? WHERE id = ? AND released_at IS NULL').run(reason, entry.id)
    logChange(entry.sessionRecordId, 'update', actor, 'resource.process.note', entry.releaseNote, reason)
  }
  result.left.push({ resource: { ...entry, releaseNote: reason }, reason })
}

/** Called inside the transaction that records a run end or settlement. */
export function closeTheGoneProcessRowsOfAnEndedRun(runId: string, workspaceId: string, actor: Actor): EndedRunRows {
  const result: EndedRunRows = { closed: [], left: [] }
  const run = getRecord(runId)
  if (run?.kind !== 'session') return result
  const standing = howARunStands(run.data).standing
  const settled = standing === 'superseded' || standing === 'closed unchecked'
  if (!theRunHasEnded(run.data['state']) && !settled) return result
  for (const row of readRows({ workspaceId, sessionRecordId: runId, type: 'process' })) {
    closeAnEndedRunsGoneProcess(row, settled ? standing : run.data['state'], actor, result)
  }
  return result
}

/**
 * Item 3 of a decision, the owner's message, the secretary's pjbYDjfCKF8r, proposal jvFnqONCGikw and problem
 * fqAnXbQFKJeT; USER.md invariant 2: an ended run's open
 * rows are reported, never silently stopped. The later look calls this after gone process rows close, inside
 * the same transaction. Release does not call this. The stored office message's aboutRun and
 * extra.resourcesLeftOpen make a second line impossible, even after running again or deleting the message.
 * The routing's own walk starts above the ended agent; its other sessions cannot make it the recipient. No
 * second chain walk is written here. This notice throws nothing of its own: the run's end must not depend on
 * its notice. Problem wNjQEfclwxjJ taught the same lesson when an unreadable process refused the run-end
 * write. An unreadable run returns a reason; a broken route tells the owner, the walk's own last stop.
 */
export function tellTheSuperiorWhatARunLeftOpen(runId: string, workspaceId: string, actor: Actor): { written: boolean; because: string } {
  const run = getRecord(runId)
  if (run === null) return { written: false, because: `Run ${runId} could not be read, so its open resources could not be reported. Nothing was written.` }
  const open = readRows({ workspaceId, sessionRecordId: runId })
  if (open.length === 0) return { written: false, because: `Run ${runId} has no open resource rows, so nothing was written.` }
  const answering = theAgentASessionAnswersAs(run, workspaceId)
  // An old session with no recorded agent names nobody to route from; do not invent an identity.
  if (answering === null) return { written: false, because: `Nothing records which agent run ${runId} answers as, so its open resources could not be reported. Nothing was written.` }
  const told = sqlite.prepare(
    "SELECT 1 FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? " +
    "AND json_extract(data, '$.sentBy.id') = ? AND json_type(data, '$.extra.resourcesLeftOpen') = 'object' LIMIT 1",
  ).get(runId, moleOffice().id)
  if (told !== undefined) return { written: false, because: `Run ${runId}'s open resources have already been reported, so nothing was written.` }
  const routed = theRoutingOfOneAddressee(
    answering.agent, { was: 'nothing answering', because: `Run ${runId} has ended.` },
    null, theReadingsForOneSend(workspaceId),
  )
  const said: ResourcesLeftOpen = {
    agent: theNameOf(readParticipant(answering.agent), answering.agent.id), run: runId,
    resources: open.slice(0, 5).map((row) => ({ type: row.type, key: row.key })),
    more: Math.max(0, open.length - 5),
  }
  const line = SYSTEM_LINES.resourcesLeftOpen(said)
  let to = routed.to
  let because = line.said ?? line.line
  if (to === null) {
    to = { kind: 'person', id: THE_PERSON }
    because = `Run ${runId}'s resource notice named nobody. The owner was told because the owner is the routing walk's last stop.`
  } else if (to.kind === 'agent' && to.id === answering.agent.id) {
    to = { kind: 'person', id: THE_PERSON }
    because = `Run ${runId}'s resource notice routed back to its ended agent. The owner was told because the owner is the routing walk's last stop.`
  }
  writeASystemLineToOne(to, workspaceId, line, actor, { run: runId }, { resourcesLeftOpen: said })
  return { written: true, because }
}

/**
 * An explicit ledger write, available to the person, a secretary, or the office's own tending.
 * Reads never call this. Each open row is named, including rows outside the process-row scope.
 */
export function sweepTheGoneProcessRowsOfEndedRuns(workspaceId: string, actor: Actor): EndedRunRows {
  const tending = actor.type === 'system' && actor.id === moleOffice().id
  if (!tending && maySpeakForTheSecretary(actor) === null && gateMet('who-sweeps-the-ledger') === 'block') {
    throw new PanelError('Only the person, a secretary, or the ledger’s own tending may sweep ended runs’ process rows. Nothing was done.', 403)
  }
  return sqlite.transaction(() => {
    const result: EndedRunRows = { closed: [], left: [] }
    for (const row of readRows({ workspaceId })) {
      const entry = toEntry(row)
      const run = getRecord(entry.sessionRecordId)
      if (entry.type !== 'process') {
        result.left.push({ resource: entry, reason: 'This is not a process row. The sweep leaves it open and signals nothing.' })
      } else if (run?.kind !== 'session' || !theRunHasEnded(run.data['state'])) {
        result.left.push({ resource: entry, reason: `Run ${entry.sessionRecordId} has not been recorded as ended. The row stays open. Nothing was signalled.` })
      } else {
        closeAnEndedRunsGoneProcess(row, run.data['state'], actor, result)
      }
    }
    return result
  })()
}

/** Read the three delays from their single declaration; refuse an unusable timer setting. */
function endedRunDelay(name: string): number {
  const value = settingValue(name)
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
      Number(value) <= 0 || Number(value) * 1000 > 2_147_483_647) {
    throw new Error(`${name} is ${JSON.stringify(value)}; it must be a positive whole number of seconds within the timer's limit.`)
  }
  return Number(value) * 1000
}

/**
 * yFiC5HsshiTi and d7rEyINY0ENK; the secretary's rV7qitG2AMjm and 29n-Z9NnulJy.
 * A revoked run key stays dead. The office tends the rows under its own identity instead.
 * Item 3 of a decision and the owner's message call for a short notice, and a closer look only
 * if needed.
 * Give the run's own command a few minutes to exit before naming what remains. Its end leaves
 * a durable office-written mark only when rows remain open. Old ends ask for no look. Each look
 * and its mark's removal share one run's transaction; a failure leaves that run due for retry.
 * The stored message is still the once-only notice marker, even across another end transition.
 */
export function lookAgainAtTheEndedRuns(
  workspaceId: string, clock: () => number = Date.now, log: (line: string) => void = console.warn,
): void {
  const delay = endedRunDelay('MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS')
  const at = clock()
  const actor = { type: 'system', id: moleOffice().id } as const
  // ONLY THE ROWS WHOSE KEPT FIELDS SAY A LOOK IS DUE ARE ASKED ABOUT (lib/session-fields.ts), deleted rows with them;
  // the condition below still decides. Until round 21 this parsed every session row twice every thirty seconds. The `+`
  // keeps SQLite off the kind and project indexes, so it finds the rows by their primary key.
  const mayBeDue = theSessionIdsWithALookDue()
  const runs = mayBeDue.length === 0 ? [] : sqlite.prepare(
    "SELECT id FROM records WHERE id IN (SELECT value FROM json_each(?)) AND +workspace_id = ? AND +kind = 'session' " +
    "AND json_type(data, ?) IS NOT NULL ORDER BY rowid",
  ).all(JSON.stringify(mayBeDue), workspaceId, `$.${ENDED_RUN_LOOK_FIELD}`) as { id: string }[]
  for (const run of runs) {
    try {
      sqlite.transaction(() => {
        const session = getRecord(run.id)
        if (session?.kind !== 'session') {
          throw new Error(`Run ${run.id} could not be read as an ended session.`)
        }
        if (!theRunHasEnded(session.data['state'])) {
          // R7aRhbpnKrRO, inspector wK2To2zvH02U: a resumed run is readable but not due.
          // Clear here, before the delay, so one look removes the old end's request through
          // the existing guarded write and its revision. Its next end writes a fresh mark.
          clearTheEndedRunLookMark(run.id)
          return
        }
        const stamp = session.data[ENDED_RUN_LOOK_FIELD]
        const ended = typeof stamp === 'string' ? parseStoredStamp(stamp) : null
        if (ended === null) throw new Error(`Run ${run.id}'s recorded end time could not be read.`)
        if (at - ended < delay) return
        closeTheGoneProcessRowsOfAnEndedRun(run.id, workspaceId, actor)
        tellTheSuperiorWhatARunLeftOpen(run.id, workspaceId, actor)
        clearTheEndedRunLookMark(run.id)
      })()
    } catch (err) {
      log(`Run ${run.id}'s later resource look failed: ${err instanceof Error ? err.message : String(err)} Its later look is still pending.`)
    }
  }
}

/** Start beside the server's other timers. Return their stop so shutdown cannot leave a watcher. */
export function startTheEndedRunResourceTimers(log: (line: string) => void): () => void {
  // R7aRhbpnKrRO, inspector wK2To2zvH02U: refuse all three delays before any tick or timer,
  // including when no marked run exists for the first look to read the grace delay.
  endedRunDelay('MOLE_OFFICE_ENDED_RUN_LOOK_AFTER_SECONDS')
  const everyLook = endedRunDelay('MOLE_OFFICE_ENDED_RUN_LOOK_EVERY_SECONDS')
  const everySweep = endedRunDelay('MOLE_OFFICE_ENDED_RUN_SWEEP_EVERY_SECONDS')
  const tick = (work: () => void): void => {
    try { work() } catch (err) {
      log(`The ended-run resource watcher could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // A server serves several projects. Read their open rows on every tick, including projects
  // added since startup; a timer limited to the configured default would leave the others behind.
  // The marked runs are taken from the kept fields as in `lookAgainAtTheEndedRuns`, and asked about whole.
  const workspaces = (): { id: string }[] => sqlite.prepare(
    'SELECT workspace_id AS id FROM session_resources WHERE released_at IS NULL UNION ' +
    "SELECT workspace_id AS id FROM records WHERE id IN (SELECT value FROM json_each(?)) AND +kind = 'session' " +
    'AND json_type(data, ?) IS NOT NULL',
  ).all(JSON.stringify(theSessionIdsWithALookDue()), `$.${ENDED_RUN_LOOK_FIELD}`) as { id: string }[]
  const look = (): void => tick(() => {
    for (const workspace of workspaces()) lookAgainAtTheEndedRuns(workspace.id, Date.now, log)
  })
  const sweep = (): void => tick(() => {
    for (const workspace of workspaces()) {
      sweepTheGoneProcessRowsOfEndedRuns(workspace.id, { type: 'system', id: moleOffice().id })
    }
  })
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const namedLook = named('the ended-run look', log, look)
  const namedSweep = named('the ended-run sweep', log, sweep)
  // Catch up after downtime immediately; later failures are logged and retried on the next tick.
  namedLook()
  namedSweep()
  const lookTimer = setInterval(namedLook, everyLook)
  const sweepTimer = setInterval(namedSweep, everySweep)
  lookTimer.unref()
  sweepTimer.unref()
  return () => { clearInterval(lookTimer); clearInterval(sweepTimer) }
}

/**
 * THE SESSION IS THE PROCESS, so stopping the process is not interrupting somebody else's work.
 *
 * The session record says `startedByMoleOffice`, which the API server writes on the worker it
 * starts and the worker writes on every run it starts. It means: this session record exists for one
 * process, that process is one Mole Office started, and nothing else is happening inside it. A
 * person stopping such a process is asking for exactly what happens.
 *
 * WHY THIS IS NOT A HOLE IN THE OWNER'S RULE. The F1 answer of 3 September 2026 is that the product names
 * what it did not start and never stops it, and that half is untouched: a row that does not say the
 * product started it is refused before this is asked at all. What this changes is the OTHER
 * condition, which was written when nothing the product started was ever long-lived: a run that
 * could only be stopped after it had ended would not be killable at all, and the decision on
 * proposal `LVH7c4IrtwIE` is that a run Mole Office starts is *killable from the product*.
 *
 * A caller cannot reach this by claiming one thing. The ledger row must say the product started it
 * AND the session record must say this, and the same caller writing both is a caller stopping its
 * own process, which it could do by group anyway.
 *
 * IT LIVES HERE RATHER THAN BESIDE ITS FIRST CALLER because it now has two, and they are in
 * different files: the door that stops a run from the product, in lib/listeners.ts, and the
 * withdrawal below. Written twice it would be the same rule in two places, free to disagree.
 */
export function theSessionIsTheProcess(sessionRecordId: string): boolean {
  const record = getRecord(sessionRecordId)
  if (record === null || record.kind !== 'session') return false
  return record.data['startedByMoleOffice'] === true
}

/** What a withdrawal did, and what it could not check. */
export interface WithdrawnRow {
  resource: LedgerEntry
  /** What happened, in the sentence a person reads. */
  outcome: string
  /** What Mole Office could NOT establish, said rather than left for the reader to assume. */
  notChecked: string
}

/**
 * TAKE BACK A ROW THAT SHOULD NEVER HAVE BEEN WRITTEN. NOTHING ON THE MACHINE IS TOUCHED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LEDGER NEEDED A THIRD DOOR
 * ---------------------------------------------------------------------------------------
 *
 * The ledger had one way in and one way out, and the way out was an act on the machine: `release`
 * kills the process group the row names. So an agent that registered the wrong number had no honest
 * move at all. On 4 September 2026 a verifier registered process group 1121660 as its own; it was a
 * test suite in another agent's worktree, matched by command line before the working directory was
 * checked. Release refused, correctly, because the owning session was still running — and the wrong
 * row stayed live, pointing a later tidy-up at a process nobody owned. Problem `D_Zohu9lS6P0`.
 *
 * "This was never mine" and "I stopped it" are different facts, so this is a different door.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES, AND THE ONE THING IT CANNOT CHECK
 * ---------------------------------------------------------------------------------------
 *
 * Only the session that wrote the row may withdraw it, and only while the row is still live.
 *
 * It also refuses a row Mole Office wrote for itself: one that says the product started the process
 * AND whose session record says the session IS that process. That pair is the only case where the
 * stored data really says this session's own work is what the row names, so it is the only case
 * where "you did start this" can be answered rather than guessed.
 *
 * EVERYTHING ELSE IS THE CALLER'S WORD AND THE REPLY SAYS SO. Nothing stored says who caused a
 * process to exist. `registeredBy` is the actor that typed the number, not the parent of the
 * process; `sessionRecordId` is the owner claimed at registration and nothing checks it; and a
 * session record holds no process id of its own, so there is no ancestry to walk. So a withdrawal
 * is a session taking back its own claim, and `notChecked` says that in the answer rather than
 * letting a 200 imply a check that did not happen.
 *
 * ---------------------------------------------------------------------------------------
 * IT DOES NOT END A WORLD, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * A released process row can be the last one serving a world, and closing it closes the world. A
 * withdrawn row is a row that was never about anything of this session's, so it is not evidence
 * that anything ended. Closing a world on it would be a claim built on a row the caller has just
 * said was wrong.
 */
/**
 * THE WORDS A ROW WITHDRAWN AS A MISTAKE OPENS ITS NOTE WITH. The ledger has no column saying how a row ended (the
 * note below says why), so these words are the only mark of a withdrawal, and `theLedgerReadThisStart` reads them.
 */
export const WITHDRAWN_AS_A_MISTAKE = 'withdrawn as a mistake by the session that registered it'

export function withdrawRowRegisteredByMistake(
  id: string,
  workspaceId: string,
  because: string,
  actor: Actor,
): WithdrawnRow {
  const row = theRowInThisProject(id, workspaceId)
  const entry = toEntry(row)
  if (row.released_at !== null) {
    throw new PanelError(
      `Row ${id} was already ended at ${row.released_at}, so there is nothing to withdraw. It says ` +
        `about itself: ${row.release_note ?? 'nothing was written'}.`,
      409,
    )
  }
  if (!callerIsTheOwningSession(actor, entry, workspaceId)) {
    throw new PanelError(
      `Only the session that registered a row may withdraw it. This row was registered by session ` +
        `${entry.sessionRecordId}, and this request is from somebody else. Send that session in the ` +
        `x-mole-office-session header. If the thing really is yours and you want it stopped, that is ` +
        `POST /api/resources/${id}/release, which signals it.`,
      403,
    )
  }
  if (entry.startedByTheProduct === true && theSessionIsTheProcess(entry.sessionRecordId)) {
    throw new PanelError(
      `Row ${id} is not one somebody typed by mistake. Mole Office wrote it itself when it started ` +
        `${entry.type} "${entry.key}", and session ${entry.sessionRecordId} says it IS that process. ` +
        `Withdrawing it would take something this product started off the only list that has it. ` +
        `POST /api/resources/${id}/release stops it instead.`,
      409,
    )
  }
  const said = because.trim()
  /**
   * THE NOTE OPENS WITH WHAT THIS WAS, and the caller's own words follow it.
   *
   * The ledger has no column saying how a row ended: a kill, a row closed after its process was
   * found gone, and this all write the same three columns. The existing answer is a phrase the
   * product owns at the front of the note — `closed after the process was found gone` is the other
   * one — and this follows it rather than inventing storage. A column would make the difference
   * queryable instead of readable; that costs a migration and a change to the export format, so it
   * is a question for the owner rather than a thing to do quietly. Proposal filed with this work.
   */
  const note = `${WITHDRAWN_AS_A_MISTAKE}, and nothing was signalled — ${said}`
  const releasedAt = now()
  const releasedBy = `${actor.type}:${actor.id}`
  sqlite
    .prepare('UPDATE session_resources SET released_at = ?, released_by = ?, release_note = ? WHERE id = ?')
    .run(releasedAt, releasedBy, note, id)
  // `update` and not `delete`. In this change log `delete` on a resource means something was
  // stopped, and nothing was stopped here. `closeRowThatStoppedMatching` above says the same.
  logChange(
    entry.sessionRecordId,
    'update',
    actor,
    `resource.${entry.type}`,
    `${entry.key} — held`,
    `${entry.key} — ${note}`,
  )
  return {
    resource: { ...entry, releasedAt, releasedBy, releaseNote: note },
    outcome:
      `The row is closed and nothing was signalled. Whatever is at ${entry.type} "${entry.key}" is ` +
      'exactly as it was.',
    notChecked:
      `Mole Office cannot tell whether this session really started ${entry.type} "${entry.key}". ` +
      'Nothing stored says who caused a process to exist, so this row was closed on the word of the ' +
      'session that wrote it. If something really is running there and somebody should stop it, it ' +
      'is still on the machine and GET /api/resources/scan reads it from the machine rather than ' +
      'from this ledger.',
  }
}

/**
 * EVERY LIVE ROW FOR ONE TYPE AND KEY, WHOEVER REGISTERED IT.
 *
 * `liveRowsFor` below asks about ONE session's rows, which is what a session tidying up after
 * itself wants. This asks about the thing: a port is one number on one machine, and a row about it
 * written by a session that has ended is still a claim about that number. A server starting up has
 * to be able to close a row somebody else wrote about the port it has just taken, because the
 * process that row names has gone. Problem `1urksZld8CQQ`.
 */
export function liveRowsOfKey(opts: { workspaceId: string; type: ResourceType; key: string }): LedgerEntry[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE workspace_id = ? AND type = ? AND key = ? AND released_at IS NULL
       ORDER BY registered_at DESC`,
    )
    .all(opts.workspaceId, opts.type, opts.key) as LedgerRow[]
  return rows.map(toEntry)
}

/**
 * WRITE THE WORLD ONTO A ROW THAT HAS NONE, AND NEVER OVER ONE THAT HAS.
 *
 * A row's world is what the world WAS when the row was written, so it is never updated — with one
 * exception, and this is it. A row carrying NO world is not a reading that has aged; it is a row
 * written by something that could not say. When the process that row is about registers itself and
 * can say, filling the blank in is the only way that row ever gets one, and the alternative is a
 * second row for one process. Problem `1urksZld8CQQ`: the canonical API's own row was written by an
 * agent through POST /api/resources before servers could register themselves, and nothing since
 * could give it a world.
 *
 * A row that already has one is left exactly as it is and answered with itself.
 */
export function fillInTheWorldOn(id: string, workspaceId: string, world: World, actor: Actor): LedgerEntry {
  const row = readRow(id, workspaceId)
  if (row === null) throw new PanelError(`No resource with id ${id} is in the ledger.`, 404)
  if (row.world !== null) return toEntry(row)
  sqlite.prepare('UPDATE session_resources SET world = ? WHERE id = ?').run(JSON.stringify(world), id)
  logChange(
    row.session_record_id,
    'update',
    actor,
    `resource.${row.type}`,
    `${row.key} — no world recorded`,
    // The database, the checkout and the commit. Not the standing: that is a word the ledger stores
    // rather than a sentence, the row itself carries the whole world, and every screen that draws
    // one turns the word into English there.
    `${row.key} — serving ${world.database} from ${world.repository}` +
      `${world.head === null ? '' : ` at ${world.head}`}`,
  )
  const filled = readRow(id, workspaceId)
  if (filled === null) throw new PanelError(`Resource ${id} vanished while its world was being written.`, 500)
  return toEntry(filled)
}

/**
 * WRITE DOWN THAT SOMEBODY ELSE ASKED FOR THIS TO BE REGISTERED AGAIN.
 *
 * A live row about this very process is the row for it, whoever wrote it, so a second registration
 * writes nothing new. That leaves a question the ledger should still be able to answer: who else
 * claimed this, and when. It goes in the change log, on the session record that owns the row, which
 * is the page a person looking for it is already on.
 *
 * NOT ON THE ROW. A row's owner is the session that started the thing, and a second registrar did
 * not start it; changing `session_record_id` would move the row to a session that will end at a
 * different time, and the whole question the ledger answers is whether the owner has ended.
 *
 * Problem `LYOhZtHE97Vj`: `POST /api/runtime/register` used to write a second live row for a server
 * that had already registered itself, because the only guard compared the CALLING SESSION.
 */
export function noteASecondRegistrationOf(
  entry: LedgerEntry,
  actor: Actor,
  bySession: string,
): void {
  logChange(
    entry.sessionRecordId,
    'update',
    actor,
    `resource.${entry.type}`,
    `${entry.key} — registered by ${entry.registeredBy}`,
    `${entry.key} — registered again by ${actor.type}:${actor.id} for session ${bySession}; ` +
      'the row that already describes this process was handed back rather than a second one written',
  )
}

/**
 * EVERY LIVE SLOT ROW OF ONE POOL, IN ANY PROJECT, IN THE ORDER THEY ASKED. With what is alive now.
 *
 * Any project, because the pools are the machine's: one suite at a time is one suite on this
 * computer, whichever project's session is running it. Waiting rows (key = the pool's name) and
 * seated rows (key = `<pool>#<seat>`) both come back; lib/slots.ts tells them apart.
 *
 * THE ORDER IS THE LINE. `registered_at` holds whole seconds, so two requests in the same second are
 * put in the order they were written by SQLite's own row number, which only grows as rows are added.
 */
export function liveSlotRowsOfPool(pool: string): { report: ResourceReport; workspaceId: string }[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE type = 'slot' AND released_at IS NULL AND (key = ? OR key LIKE ? ESCAPE '\\')
       ORDER BY registered_at ASC, rowid ASC`,
    )
    .all(pool, `${pool.replace(/[\\%_]/g, (c) => `\\${c}`)}#%`) as LedgerRow[]
  const probe = oneReadingPerListing(osProbe())
  return rows.map((row) => ({ report: reportFor(toEntry(row), probe), workspaceId: row.workspace_id }))
}

/**
 * GIVE A WAITING SLOT ROW ITS SEAT: its key goes from the pool's name to `<pool>#<seat>`.
 *
 * The one write that changes a live row's key, and it is narrow on purpose: only a `slot` row, only
 * while it is live, and only from a key with no seat to one with a seat. lib/slots.ts has already
 * worked out that the seat is free. The change log on the owning session says it was granted, so the
 * session's page shows when its wait ended.
 */
export function seatTheSlotRow(id: string, workspaceId: string, seatKey: string, actor: Actor): LedgerEntry {
  const row = readRow(id, workspaceId)
  if (row === null) throw new PanelError(`No resource with id ${id} is in the ledger.`, 404)
  if (row.type !== 'slot' || row.released_at !== null || row.key.includes('#')) {
    throw new PanelError(
      `Row ${id} is not a slot waiting in line (it is a ${row.type} row, key "${row.key}"` +
        `${row.released_at === null ? '' : `, ended at ${row.released_at}`}), so there is no seat to give it.`,
      409,
    )
  }
  sqlite.prepare('UPDATE session_resources SET key = ? WHERE id = ? AND released_at IS NULL').run(seatKey, id)
  logChange(row.session_record_id, 'update', actor, 'resource.slot', `${row.key} — waiting`, `${seatKey} — granted`)
  const seated = readRow(id, workspaceId)
  if (seated === null) throw new PanelError(`Resource ${id} vanished while it was being given its seat.`, 500)
  return toEntry(seated)
}

/** Every live row this session holds for this type and key, newest first. */
export function liveRowsFor(opts: {
  workspaceId: string
  sessionRecordId: string
  type: ResourceType
  key: string
}): LedgerEntry[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM session_resources
       WHERE workspace_id = ? AND session_record_id = ? AND type = ? AND key = ? AND released_at IS NULL
       ORDER BY registered_at DESC`,
    )
    .all(opts.workspaceId, opts.sessionRecordId, opts.type, opts.key) as LedgerRow[]
  return rows.map(toEntry)
}

/** Every key a live ledger row of this type names, in any project. */
export function liveKeysOfType(type: ResourceType): string[] {
  const rows = sqlite
    .prepare('SELECT key FROM session_resources WHERE type = ? AND released_at IS NULL')
    .all(type) as { key: string }[]
  return rows.map((r) => r.key)
}

/** One ledger row by id, including a released row. Removing a container does not erase its name. */
export function ledgerRowById(id: string, workspaceId: string): LedgerEntry | null {
  const row = readRow(id, workspaceId)
  return row === null ? null : toEntry(row)
}

/** One live row by id, with its session, or null. */
export function liveRowById(id: string, workspaceId: string): { entry: LedgerEntry; session: SessionView } | null {
  const row = sqlite
    .prepare('SELECT * FROM session_resources WHERE workspace_id = ? AND id = ? AND released_at IS NULL')
    .get(workspaceId, id) as LedgerRow | undefined
  if (row === undefined) return null
  const entry = toEntry(row)
  return { entry, session: sessionViewOf(entry.sessionRecordId) }
}

/**
 * IS THE THING A LIVE LEDGER ROW RECORDS STILL THERE? Its own reading, by type: a process row's process,
 * a container row's container, a slot row's group. A row that was given back is `gone`, because whoever
 * gave it back said the thing ended. Lib/bookings.ts asks it for a booking whose program is a row
 * (message L0ZsT2z9ZKQW, point 3).
 */
export function theLedgerRowsLiveness(id: string, workspaceId: string): Liveness {
  const found = liveRowById(id, workspaceId)
  if (found === null) {
    return { state: 'gone', detail: `Ledger row ${id} was given back, so the program it recorded has ended.` }
  }
  return livenessOf(found.entry, osProbe())
}

/**
 * The open process rows behind a run's claims. Only their liveness is read here.
 *
 * Problem wNjQEfclwxjJ, inspector lBw2WAGMOKwF, secretary UQQeEtGCHiRn: an unreadable process
 * must not refuse the run's end. USER.md invariants 2 and 5 require unknown with the error's
 * words, so claims stay held until every process is known to be gone. Row lookup and conversion
 * stay outside the catch. The release door and orphan report keep their own strict reading.
 */
export function processLivenessForRun(runId: string, workspaceId: string): Liveness[] {
  const probe = osProbe()
  return readRows({ workspaceId, sessionRecordId: runId, type: 'process' }).map((row) => {
    const entry = toEntry(row)
    try {
      return livenessOf(entry, probe)
    } catch (err) {
      return { state: 'unknown', reason: err instanceof Error ? err.message : String(err) }
    }
  })
}

/** The same process reading for several runs, with their ledger rows read together. */
export function processLivenessForRuns(runIds: readonly string[], workspaceId: string): Map<string, Liveness[]> {
  const out = new Map<string, Liveness[]>()
  if (runIds.length === 0) return out
  const rows = sqlite.prepare(`SELECT * FROM session_resources WHERE workspace_id = ? AND type = 'process'
    AND released_at IS NULL AND session_record_id IN (SELECT value FROM json_each(?))
    ORDER BY registered_at DESC, id DESC`).all(workspaceId, JSON.stringify(runIds)) as LedgerRow[]
  const probe = osProbe()
  for (const row of rows) {
    const list = out.get(row.session_record_id) ?? []
    const entry = toEntry(row)
    try {
      list.push(livenessOf(entry, probe))
    } catch (err) {
      list.push({ state: 'unknown', reason: err instanceof Error ? err.message : String(err) })
    }
    out.set(row.session_record_id, list)
  }
  return out
}

/**
 * DID THE LEDGER READ THIS START TIME FOR THIS PROCESS, REGISTERED AGAINST THIS RUN? Wave 13y round 35, item 9.8 (c).
 *
 * A process row's start time is this office's own reading of the machine: `registerResource` reads it from the process
 * when the row is filed, whoever files it, and `restampRowWrittenByTheOldReading` writes the live reading over a row the
 * old reading stamped. Nothing else writes it, and an import leaves it empty. A row that was given back still says what
 * was read, so it counts. A row the run withdrew as a mistake does not: the run declared it wrong, and its reading with
 * it (case (iv) of item 9.8 (c), wave 13y round 37).
 */
export function theLedgerReadThisStart(opts: { workspaceId: string; sessionRecordId: string; pid: number; startedAt: string }): boolean {
  return readRows({ workspaceId: opts.workspaceId, sessionRecordId: opts.sessionRecordId, type: 'process', includeReleased: true }).some(
    (row) =>
      row.key === String(opts.pid) &&
      row.os_started_at === opts.startedAt &&
      !(row.released_at !== null && (row.release_note ?? '').startsWith(WITHDRAWN_AS_A_MISTAKE)),
  )
}

/** The processes `listResources` reads with these options, for `readFirst`: those of the rows it checks. */
export function theProcessesAListingReads(opts: Parameters<typeof listResources>[0]): AProcessToRead[] {
  return theProcessesTheRowsRead(readRows(opts).map(toEntry).filter((entry) => entry.releasedAt === null || opts.alsoCheckReleasedRows === true))
}

export function listResources(opts: {
  workspaceId: string
  /** Only the row with this id. The release door reads its one row, and not the machine for every other row. */
  id?: string
  sessionRecordId?: string
  includeReleased?: boolean
  /**
   * Read the machine and the session record for the RELEASED rows as well.
   *
   * Off unless a caller asks, because a released row is closed and reading the machine for
   * thousands of them is what held the office's one thread for 20 to 26 seconds at a time
   * (`reportForAReleasedRow` above has the numbers). Two callers ask for it, each about a single session,
   * so it is a handful of rows rather than the whole ledger: `theRunThatStartedItHasEnded` in worker.ts
   * decides whether a worker has ended from whether every process row it holds is gone, and a row
   * released by a server restart is one of those rows; `whetherARunsProcessHasEnded` in inspection.ts
   * asks the same of the run the superseded door is asked to close.
   */
  alsoCheckReleasedRows?: boolean
  /**
   * Only rows of this kind. The rows of other kinds are not read, so the machine is not asked about
   * them. Presence asks for process rows only, because a port row costs a walk of /proc and presence
   * never reads one (problem FqD2s_8-Ci6A).
   */
  type?: ResourceType
  /** Only the rows of this process group. The data-folder move reads its supervisor's group, not the whole ledger. */
  pgid?: number
}): ResourceReport[] {
  const probe = oneReadingPerListing(osProbe())
  const entries = readRows(opts).map(toEntry)
  // THE SESSION RECORD OF EVERY ROW REPORTED, IN ONE STATEMENT FOR EVERY 500 (wave 13y round 50), where each row read
  // its own: presence reads this listing for every project of the scene, and a ledger with more rows read more statements.
  const sessionRecords = getRecordsWithIds(
    entries.filter((entry) => entry.releasedAt === null || opts.alsoCheckReleasedRows === true).map((entry) => entry.sessionRecordId),
  )
  return entries.map((entry) => {
    if (entry.releasedAt !== null && opts.alsoCheckReleasedRows !== true) {
      return reportForAReleasedRow(entry, entry.releasedAt)
    }
    return reportFor(entry, probe, sessionRecords.get(entry.sessionRecordId) ?? null)
  })
}

export interface OrphanReport {
  checkedAt: string
  platform: string
  /** Alive, and the session that started it has ended or is marked orphaned. */
  orphans: ResourceReport[]
  /** Alive, but the session is still going. Not orphans, and not hidden either. */
  stillOwned: ResourceReport[]
  /**
   * Written down, NOT running any more, and the row was never closed.
   *
   * These are the rows that used to disappear from this report entirely. `orphans` and
   * `stillOwned` both require the thing to be alive, so a row whose server had exited fell out of
   * every list and a reader was never told it existed. Ten of them were open on this machine on
   * 27 August 2026, six naming dead processes and four naming dead ports, and the orphan page
   * showed none of them.
   *
   * Nothing needs killing here and nothing is offered. What is owed is the smaller thing: close
   * the row, so the ledger stops claiming a session left something behind that is not there.
   */
  goneAndNotClosed: ResourceReport[]
  /** Rows Mole Office could not get a straight answer about, with the reason for each. */
  unchecked: UncheckedResource[]
  /**
   * Alive on this machine, and NO ledger row claims it.
   *
   * The three lists above are all answers about rows somebody wrote down. This one is the answer
   * about everything else, and it is a louder statement than "no orphans" — see the sweep below.
   */
  unclaimed: UnclaimedSweep
}

/**
 * What is alive whose owning session has ended.
 *
 * Three lists rather than one, because merging them loses the distinction that matters. An
 * orphan needs a decision. A live session's server needs leaving alone. A row nobody could
 * check needs a human to go and look — and if those were folded into "not an orphan", the GPU
 * on a machine with no nvidia-smi would be invisible, which is the failure this whole feature
 * was built after.
 */
export function orphanReport(
  workspaceId: string,
  // THE ORPHANS DOOR HANDS IN THE PROBE ITS VIEWS READ, so the report, the views and the sweep read the machine once.
  probe: OsProbe = oneReadingPerListing(osProbe()),
): OrphanReport & { officeSupervisors: ResourceReport[] } {
  const orphans: ResourceReport[] = []
  const stillOwned: ResourceReport[] = []
  const goneAndNotClosed: ResourceReport[] = []
  const unchecked: UncheckedResource[] = []
  const officeSupervisors: ResourceReport[] = []
  const supervisorNotes: { what: string; reason: string }[] = []

  const rows = readRows({ workspaceId })
  for (const row of rows) {
    const report = reportFor(toEntry(row), probe)
    // A finished session does not make the live parent supervising this office ownerless.
    // Other checkouts and other processes in that group receive no exception.
    const parent = report.liveness.state === 'alive' && report.type === 'process' && Number(report.key) === process.ppid
      ? processOrNull(process.ppid, probe)
      : null
    const read = parent === null ? null : theParentsProgram(parent, probe)
    if (read !== null && 'unknown' in read) {
      unchecked.push({
        id: report.id,
        type: report.type,
        key: report.key,
        detail: report.detail,
        session: report.session,
        reason: `Ledger row ${report.id}: process ${report.key} is the parent of the server answering you, and whether it is ` +
          `Mole Office's own dev supervisor is unknown, because ${read.unknown}. It is not listed as an orphan, and the ` +
          'words of its command line are not read in place of its arguments.',
      })
      continue
    }
    const script = read?.script ?? ''
    const isSupervisor = read !== null && read.isNode &&
      (script === 'tools/serve-dev.mjs' || script.endsWith('/tools/serve-dev.mjs'))
    let directory: string | null = null
    if (isSupervisor && probe.processFacts !== undefined) {
      try {
        directory = probe.processFacts(process.ppid)?.workingDirectory ?? null
      } catch {
        // The parent relationship still names this office's starter when its directory is unreadable.
      }
    }
    const here = process.cwd().replace(/\/$/, '')
    const sameScript = resolvePath(directory ?? here, script) === join(here, 'tools/serve-dev.mjs')
    if (report.liveness.state === 'alive' && parent !== null && isSupervisor && sameScript) {
      const sessionState = report.session.state === null
        ? 'has no readable recorded state.'
        : `is recorded as ${stateWord(report.session.state).text}.`
      // The session's absence does not erase the measured owner of this process.
      report.session.note = report.session.note
        ?.replace('Whatever it started is unowned either way.', 'The office still owns this live supervisor.')
        .replace('The session record was deleted, so nothing owns what it started.',
          'The session record was deleted. The office still owns this live supervisor.') ?? null
      const sessionTitle = report.session.title === null ? 'Its session' : `Its session "${report.session.title}"`
      const reason = `Ledger row ${report.id}: Mole Office's own dev supervisor is alive as pid ${report.key}, process group ${parent?.pgid}; ` +
        `it is the parent of the server answering you. ${sessionTitle} (${report.sessionRecordId}) ` +
        `${sessionState}` + (report.session.note === null ? '' : ` ${report.session.note}`) +
        (read === null || read.byWords === null ? '' : ` ${read.byWords}`)
      report.liveness.detail += ` ${reason}`
      supervisorNotes.push({ what: `process ${report.key}: Mole Office's own dev supervisor`, reason })
      officeSupervisors.push(report)
      continue
    }
    const unknownLiveness = report.liveness.state === 'unknown'
    const unknownSession = report.session.ended === 'unknown'
    if (unknownLiveness || unknownSession) {
      unchecked.push({
        id: report.id,
        type: report.type,
        key: report.key,
        detail: report.detail,
        session: report.session,
        reason: [
          report.liveness.state === 'unknown' ? report.liveness.reason : null,
          unknownSession ? report.session.note : null,
        ]
          .filter((s): s is string => s !== null && s !== '')
          .join(' '),
      })
      continue
    }
    if (report.liveness.state !== 'alive') {
      goneAndNotClosed.push(report)
      continue
    }
    // An orphaned session's resources are orphans in this report, and still need force to release
    // (decision P-0jFzJuFC19; see TERMINAL_STATES).
    if (report.session.ended === true || report.session.state === ORPHAN_REPORT_ALSO_COUNTS) orphans.push(report)
    else stillOwned.push(report)
  }

  // Oldest orphan first: the eleven-day one is the one to look at.
  orphans.sort((a, b) => (b.orphanedFor?.seconds ?? 0) - (a.orphanedFor?.seconds ?? 0))
  // Oldest first here too, for the same reason: a row open since last week is the one that has
  // been misleading readers for longest.
  goneAndNotClosed.sort((a, b) => b.age.seconds - a.age.seconds)
  const unclaimed = unclaimedSweep(workspaceId, probe)
  // The narrow orphans door sends the sweep, so the supervisor stays visible there too.
  unclaimed.skipped.push(...supervisorNotes)
  if (officeSupervisors.length > 0) {
    unclaimed.summary = sweepSummary(unclaimed.resources, unclaimed.skipped, unclaimed.unchecked, rows.length) +
      ' ' + supervisorNotes.map((one) => one.reason).join(' ')
  }
  return {
    checkedAt: now(),
    platform: probe.platform,
    orphans,
    officeSupervisors,
    stillOwned,
    goneAndNotClosed,
    unchecked,
    // Run on every orphan report, including — especially — the one where the ledger is empty.
    // That is the request where the three lists above are all empty and the honest answer is
    // "Mole Office cannot see anything because nothing wrote anything down".
    unclaimed,
  }
}

// ============================================================================ the unclaimed sweep

/**
 * THE LEDGER ONLY REPORTS WHAT WAS REGISTERED, AND THAT IS ITS ONE BLIND SPOT.
 *
 * An orphan is a ledger row whose session has ended. A process nobody registered has no row, so
 * it cannot be an orphan, so a report of three empty lists reads as "all clear" when it may
 * mean "nobody wrote anything down". Those two sentences have to be told apart on screen, and
 * this is what tells them apart: the machine is read directly and everything alive that no live
 * ledger row claims is named.
 *
 * "This is running, and no session claims it" is a MORE alarming statement than "no orphans",
 * not a lesser one, and the summary sentence below says it in those words.
 *
 * WHAT COUNTS AS CLAIMED. A live ledger row claims:
 *   - the port number it registered,
 *   - the pid it registered,
 *   - anything in the process GROUP it recorded, because the group is the unit this feature
 *     owns and releases — a session that registered its server's pid did register its server's
 *     port, and reporting that port as unclaimed would punish it for registering once.
 *   - the container name or id it registered.
 * That last-but-one rule is what keeps registration to ONE call: register the pid you already
 * have, and the port that pid is listening on is claimed with it.
 *
 * WHAT IS LEFT OUT, AND WHY IT IS STILL COUNTED. Two things would otherwise fill this list with
 * rows nobody can act on: Mole Office's own server, and the system daemons whose sockets this user
 * may not inspect. Both are left out of `resources` and both are counted in `skipped` with the
 * reason — a list nobody reads is the same failure as a list that hides something.
 *
 * THE COST. One reading of the listening sockets, one of the GPU and one of the containers, per
 * report. The socket reading walks /proc; the other two are subprocesses. That is the same order
 * of work `orphanReport` already does per row, and it is worth it on exactly the request where
 * the ledger is empty and there is otherwise nothing to do.
 */
/**
 * What the sweep can find. Fewer kinds than the ledger: a lock file is a path, not a process.
 *
 * A VALUE for the same reason RELEASE_VERBS is one — src/web/components/SessionPanel.tsx keeps a
 * reader for this shape and had its own hand-written copy of these three words, checked against
 * nothing. tests/vocabulary.test.ts pins the two together, so a fourth kind swept here cannot
 * quietly become a row the panel refuses to draw.
 */
export const UNCLAIMED_TYPES = ['port', 'gpu', 'container'] as const
export type UnclaimedType = (typeof UNCLAIMED_TYPES)[number]

export interface UnclaimedResource {
  type: UnclaimedType
  /** The port number, the pid, or the container name — as text, like a ledger key. */
  key: string
  /** What it is, in one line: the command, or the image and status. */
  detail: string
  /** The process holding it, when this user may inspect it. Null for a container. */
  holder: OsProcess | null
  /** How long the holder has been up. Null when there is no start time that reads as one. */
  upFor: Age | null
  /** What Mole Office can and cannot say about who started this. */
  note: string
}

export interface UnclaimedSweep {
  /** The sentence to put in front of a person. Says what is unclaimed AND what was not looked at. */
  summary: string
  /** Where this sweep looked, in plain English. An empty place cannot be told from an unsearched one. */
  searched: string[]
  /** Alive, and no live ledger row claims it. */
  resources: UnclaimedResource[]
  /** Alive, deliberately left out of `resources`, and why. Counted, never dropped in silence. */
  skipped: { what: string; reason: string }[]
  /** Places this sweep could not look at all, in the words the probe used. */
  unchecked: string[]
}

/** Everything the live ledger rows lay claim to on this machine. */
interface Claims {
  ports: Set<number>
  pids: Set<number>
  groups: Set<number>
  containers: Set<string>
}

function claimsFrom(rows: readonly LedgerRow[]): Claims {
  const claims: Claims = { ports: new Set(), pids: new Set(), groups: new Set(), containers: new Set() }
  for (const row of rows) {
    // A row registered before anything was listening has no group, and claims nothing by group. Nor does a row of
    // group 0: Windows has no process groups and gives every process 0, so a 0 would claim every process there.
    if (row.pgid !== null && row.pgid > 0) claims.groups.add(row.pgid)
    const n = Number(row.key)
    if (row.type === 'port' && Number.isInteger(n)) claims.ports.add(n)
    else if ((row.type === 'process' || row.type === 'gpu') && Number.isInteger(n)) claims.pids.add(n)
    else if (row.type === 'container') claims.containers.add(row.key)
    // A lock row claims a path, and nothing in this sweep is a path: the machine reading here is
    // processes, sockets, the GPU and containers. Lock files are covered by scanMachine.
  }
  return claims
}

/**
 * WHAT THE PARENT OF THIS SERVER RUNS, as orphanReport needs it to tell this office's own dev supervisor: whether its
 * program is node, and the script it runs. A probe that gives the arguments one by one (Linux) is read by them, and the
 * program counts when it is the same file as this server's node, by realpath, whatever either is called. A probe that
 * gives only a command line (macOS) is read by its words, split on white space, and `byWords` is the sentence that says
 * so where the supervisor is named. `unknown` says what could not be read; the words are not read in its place.
 *
 * In a Linux bundle this server's node is the app's own program, which the window runs on too, so a window that is the
 * parent reads as node here. It is still not taken for the supervisor, because orphanReport also needs the script, and a
 * window's second argument is never tools/serve-dev.mjs.
 */
function theParentsProgram(
  parent: OsProcess,
  probe: OsProbe,
): { isNode: boolean; script: string; byWords: string | null } | { unknown: string } {
  if (probe.programAndArguments === undefined) {
    const words = parent.command.trim().split(/\s+/)
    return {
      isNode: words[0] === 'node' || words[0]?.endsWith('/node') === true,
      script: words[1] ?? '',
      byWords: `It was recognised by the words of its command line, not by its arguments, because the ${probe.platform} ` +
        'probe gives no list of arguments, so a path with a space in it can be misread.',
    }
  }
  const read = probe.programAndArguments(parent.pid)
  if ('unreadable' in read) return { unknown: read.unreadable }
  let program: string
  try {
    program = realpathSync(read.program)
  } catch (err) {
    return { unknown: `its program ${read.program} could not be resolved (${String((err as NodeJS.ErrnoException).code)})` }
  }
  return { isNode: program === realpathSync(process.execPath), script: read.arguments[1] ?? '', byWords: null }
}

/** Read one process without letting a hardened kernel take the whole report down with it. */
function processOrNull(pid: number, probe: OsProbe): OsProcess | null {
  try {
    return probe.processById(pid)
  } catch {
    // processById is deliberately loud when a process exists but may not be read. Here that
    // would mean one unreadable stranger hid every other unclaimed thing on the machine.
    return null
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * What is alive on this machine that no live ledger row claims.
 *
 * Exported on its own as well as being part of `orphanReport`, because "is anything running that
 * nobody wrote down?" is a question worth asking without asking about orphans at all.
 */
export function unclaimedSweep(
  workspaceId: string,
  // `orphanReport` hands in the probe its report read, so the sweep reads the same sockets, containers and GPU.
  probe: OsProbe = osProbe(),
): UnclaimedSweep {
  // ONE PROJECT'S LEDGER, and this is the read where that matters most. What is "unclaimed" is
  // decided by subtracting the ledger from what is alive on the machine, so a sweep that could not
  // see another project's rows would report ITS servers as unclaimed — and unclaimed is what an
  // operator kills. The whole-machine scan is unchanged; only the claims are scoped.
  const rows = readRows({ workspaceId })
  const claims = claimsFrom(rows)

  const resources: UnclaimedResource[] = []
  const skipped: { what: string; reason: string }[] = []
  const searched: string[] = []
  const unchecked: string[] = []

  // Mole Office's own group is read first, because every branch below needs to know which of these
  // processes is the one answering the request. Failing to read it does not stop the sweep: it
  // means Mole Office's own ports appear as unclaimed, and that is said rather than guessed at.
  let ownGroup: number | null = null
  try {
    ownGroup = probe.ownProcessGroup()
  } catch (err) {
    unchecked.push(
      `Mole Office could not read its own process group (${messageOf(err)}), so its own listening sockets are ` +
        'listed below like anything else rather than being quietly left out.',
    )
  }

  const ctx: SweepContext = { probe, claims, ownGroup, resources, skipped, searched, unchecked }
  sweepPorts(ctx)
  sweepGpu(ctx)
  sweepContainers(ctx)

  // Newest first, and the expensive kinds first. A GPU allocation and a container cost more to
  // leave running than a socket does, and something that started minutes ago is far more likely
  // to be a process an agent walked away from than a daemon that has been up for weeks.
  const order: Record<UnclaimedResource['type'], number> = { gpu: 0, container: 1, port: 2 }
  resources.sort(
    (a, b) =>
      order[a.type] - order[b.type] ||
      (a.upFor?.seconds ?? Number.MAX_SAFE_INTEGER) - (b.upFor?.seconds ?? Number.MAX_SAFE_INTEGER) ||
      a.key.localeCompare(b.key),
  )

  return {
    summary: sweepSummary(resources, skipped, unchecked, rows.length),
    searched,
    resources,
    skipped,
    unchecked,
  }
}

/** The shared bag every sweep step writes into. Passed rather than closed over, so each step is readable alone. */
interface SweepContext {
  probe: OsProbe
  claims: Claims
  ownGroup: number | null
  resources: UnclaimedResource[]
  skipped: { what: string; reason: string }[]
  searched: string[]
  unchecked: string[]
}

function sweepPorts(ctx: SweepContext): void {
  const { probe, claims, ownGroup, resources, skipped, searched, unchecked } = ctx
  let ports: OsPort[]
  try {
    ports = probe.listeningPorts()
  } catch (err) {
    unchecked.push(`The listening sockets could not be read (${messageOf(err)}), so unclaimed ports are unknown.`)
    return
  }
  searched.push(
    `every listening socket on this machine — ${ports.length} ${ports.length === 1 ? 'socket' : 'sockets'}`,
  )

  // One row per port per holder: a server bound to both IPv4 and IPv6 is ONE thing that is
  // running, and listing it twice would double every count a person reads.
  const byHolder = new Map<string, { port: number; where: string[]; pid: number | null }>()
  for (const p of ports) {
    const k = `${p.port}/${p.pid ?? 'unreadable'}`
    const seen = byHolder.get(k)
    const where = `${p.address}:${p.port}/${p.protocol}`
    if (seen) seen.where.push(where)
    else byHolder.set(k, { port: p.port, where: [where], pid: p.pid })
  }

  const notInspectable: number[] = []
  const ownPorts: number[] = []
  for (const entry of byHolder.values()) {
    if (claims.ports.has(entry.port)) continue
    const holder = entry.pid === null ? null : processOrNull(entry.pid, probe)
    if (holder === null) {
      notInspectable.push(entry.port)
      continue
    }
    if (claims.pids.has(holder.pid) || claims.groups.has(holder.pgid)) continue
    if (ownGroup !== null && holder.pgid === ownGroup) {
      ownPorts.push(entry.port)
      continue
    }
    const upFor = ageOrNull(holder.startedAt)
    resources.push({
      type: 'port',
      key: String(entry.port),
      detail: `${holder.command} — ${entry.where.join(', ')}`,
      holder,
      upFor,
      note:
        `Port ${entry.port} is held by pid ${holder.pid}, process group ${holder.pgid}` +
        `${upFor === null ? '' : `, up ${upFor.human}`}, and no session in the ledger claims it. Nothing wrote it ` +
        'down, so nothing can say whether it was left behind. Kill it by hand if it is yours: ' +
        `kill -TERM -${holder.pgid}`,
    })
  }

  if (notInspectable.length > 0) {
    const list = [...new Set(notInspectable)].sort((a, b) => a - b)
    skipped.push({
      what: `${list.length} listening ${list.length === 1 ? 'socket' : 'sockets'} — ${list.join(', ')}`,
      reason:
        'held by a process this user may not inspect, which is what a system daemon or another user’s program ' +
        'looks like from here. Mole Office cannot read what they are, so it will not accuse them of being unclaimed ' +
        'and will not report them as absent either.',
    })
  }
  if (ownPorts.length > 0) {
    const list = [...new Set(ownPorts)].sort((a, b) => a - b)
    skipped.push({
      what: `${list.length} listening ${list.length === 1 ? 'socket' : 'sockets'} — ${list.join(', ')}`,
      reason: `held by Mole Office itself (process group ${ownGroup ?? 'unknown'}), the server answering this request.`,
    })
  }
}

function sweepGpu(ctx: SweepContext): void {
  const { probe, claims, ownGroup, resources, skipped, searched, unchecked } = ctx
  const reading = probe.gpu()
  if (!reading.available) {
    unchecked.push(reading.reason)
    return
  }
  searched.push(
    `GPU compute processes (nvidia-smi) — ${reading.processes.length} ` +
      `${reading.processes.length === 1 ? 'process' : 'processes'}`,
  )
  for (const g of reading.processes) {
    if (claims.pids.has(g.pid)) continue
    const holder = processOrNull(g.pid, probe)
    if (holder !== null && claims.groups.has(holder.pgid)) continue
    if (holder !== null && ownGroup !== null && holder.pgid === ownGroup) {
      skipped.push({
        what: `pid ${g.pid} holding ${g.usedMib} MiB of GPU memory`,
        reason: `it is in Mole Office's own process group (${ownGroup}), the server answering this request.`,
      })
      continue
    }
    const upFor = holder === null ? null : ageOrNull(holder.startedAt)
    resources.push({
      type: 'gpu',
      key: String(g.pid),
      detail: `${holder?.command ?? g.name} — holding ${g.usedMib} MiB of GPU memory`,
      holder,
      upFor,
      note:
        `Pid ${g.pid} is holding ${g.usedMib} MiB of GPU memory${upFor === null ? '' : `, up ${upFor.human}`}, and ` +
        `no session in the ledger claims it. ${NOTHING_WROTE_IT_DOWN}`,
    })
  }
}

/** The last sentence of an unclaimed GPU process's note. */
export const NOTHING_WROTE_IT_DOWN = 'Nothing wrote it down, so nothing can say whether it was left behind.'

function sweepContainers(ctx: SweepContext): void {
  const { probe, claims, resources, searched, unchecked } = ctx
  const reading = probe.containers()
  if (!reading.available) {
    unchecked.push(reading.reason)
    return
  }
  searched.push(
    `running containers (docker) — ${reading.containers.length} ` +
      `${reading.containers.length === 1 ? 'container' : 'containers'}`,
  )
  for (const c of reading.containers) {
    if (claims.containers.has(c.name) || claims.containers.has(c.id)) continue
    resources.push({
      type: 'container',
      key: c.name,
      // A container has no pid Mole Office can read from here and no start time in this reading, so
      // its status string is the age, in docker's words rather than in invented ones.
      detail: `${c.image} — ${c.status}`,
      holder: null,
      upFor: null,
      note:
        `Container ${c.name} (${c.image}) is running and no session in the ledger claims it. Stop it by hand if ` +
        `it is yours: docker stop ${c.name}`,
    })
  }
}

/**
 * The one sentence a person reads first.
 *
 * It always carries the number of places that could not be looked at, because a summary that
 * says "nothing unclaimed" from a sweep that could not read the GPU is the same clean bill of
 * health nobody checked that this whole file exists to refuse.
 */
function sweepSummary(
  resources: readonly UnclaimedResource[],
  skipped: readonly { what: string; reason: string }[],
  unchecked: readonly string[],
  liveLedgerRows: number,
): string {
  const parts: string[] = []
  if (resources.length === 0) {
    parts.push('Nothing is running on this machine that a live ledger row does not claim.')
  } else {
    const n = resources.length
    parts.push(
      `${n} live ${n === 1 ? 'thing is' : 'things are'} running on this machine that no session claims: ` +
        `${resources.map((r) => `${r.type} ${r.key}`).join(', ')}. That is worse than "no orphans": an ` +
        'unregistered process has no row, so it can never be reported as an orphan, and nothing here can say what ' +
        'started it or whether it was meant to be left running.',
    )
  }
  if (liveLedgerRows === 0) {
    parts.push(
      'The ledger has no live rows at all, so no session on this machine has written down anything it started.',
    )
  }
  if (skipped.length > 0) {
    parts.push(
      `${skipped.length} ${skipped.length === 1 ? 'group of live things was' : 'groups of live things were'} left ` +
        `out on purpose, ${skipped.length === 1 ? 'with its reason' : 'each with its reason'} in the list of what the sweep left out.`,
    )
  }
  if (unchecked.length > 0) {
    parts.push(
      `${unchecked.length} ${unchecked.length === 1 ? 'place' : 'places'} could not be looked at at all, so this ` +
        'is not the whole answer.',
    )
  }
  return parts.join(' ')
}

// ============================================================ what is serving this project now

/**
 * TELLING A LIVE PROCESS FROM A CLAIM SOMEBODY WROTE DOWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND ALL OF IT HAPPENED ON 27 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * The ledger above answers "what did a session write down, and is it still there". That is a
 * good question and it is not the question a person asks when the product is behaving strangely.
 * They ask: which server am I talking to, which corpus is it serving, and is anything else
 * running that is going to confuse the answer. Four things happened on one day that the ledger
 * could not have told anybody about, because nobody had written any of them down.
 *
 *   1. `node_modules` was deleted by an npm command inside a worktree and the API server died.
 *      Its watcher stayed up with nothing under it. Nothing in Mole Office recorded that Mole Office's own
 *      server had gone.
 *   2. The server was restarted by hand onto a DIFFERENT database — `data/r11-work.db` instead of
 *      `data/panelx.db`. Nothing recorded which corpus the running server was serving, so a
 *      reader could not tell which of the two answers they had been given.
 *   3. The browser app on 5173 outlived the process that started it, so a port was held by a
 *      program whose supervisor was gone.
 *   4. A Vite from a deleted worktree had been running for two days, holding no port, appearing
 *      in no Mole Office record at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS READ DOES, AND THE ONE THING IT WILL NEVER DO
 * ---------------------------------------------------------------------------------------
 *
 * It reads the machine and reports every process that is part of a Mole Office dev stack, with who
 * owns it: the server answering this request, that server's own group, a session that is still
 * going, a session that has ended, a ledger row that no longer matches what is running, or
 * nobody. The first is certain — this process knows its own pid and its own database. The rest
 * are judged from live evidence and named for what the evidence supports.
 *
 * IT KILLS NOTHING AND IT TIDIES NOTHING. There is no route that acts on what this finds, and
 * there is no verb here. What a person can do is printed as a command for them to run, with
 * every process it would end named first. A row that Mole Office cannot establish ownership of gets
 * no command at all and a sentence saying what it could not establish.
 *
 * AND IT NEVER MARKS A SESSION FINISHED. A session record says what an agent is doing; a
 * resource row says what is running. Closing the first to tidy the second would make the product
 * lie about the one thing it exists to report.
 *
 * ---------------------------------------------------------------------------------------
 * "I LOOKED AND FOUND NOTHING" IS NOT "I COULD NOT LOOK"
 * ---------------------------------------------------------------------------------------
 *
 * `summary` is built so that the words "nothing" and "only" can only appear after a reading that
 * actually happened. When the process table could not be read, the summary says Mole Office could not
 * look and `servers` is empty for that reason rather than for the other one. This is the fifth
 * invariant and it is the point of the whole file.
 */

// What a process is to Mole Office is judged in ./mole-office-parts.ts, which tools/stray-servers.mjs
// imports too. It is exported from here as well, so this file's callers import it as before.
export { DEV_STACK_PARTS, type DevStackPart, moleOfficePartOf }

/**
 * Who owns a running process, in the order Mole Office can be sure of it.
 *
 * The first two are certain: this process knows its own pid and its own process group. The next
 * two rest on a ledger row whose recorded identity still matches what is running. The fifth is a
 * row that has stopped matching, which is a claim rather than evidence. The last is the honest
 * answer when nothing wrote anything down, and it is a WORSE answer than any of the others,
 * because nothing can say whether the process was meant to be left running.
 */
export const SERVER_OWNERS = [
  'the server answering you',
  'the group the server answering you is in',
  'a session that is still going',
  'a session that has ended',
  'a ledger row that no longer matches',
  'nobody wrote it down',
] as const
export type ServerOwner = (typeof SERVER_OWNERS)[number]

export interface ServerOwnership {
  owner: ServerOwner
  /** One sentence a person reads, with the evidence in it. */
  says: string
  /** The ledger row this came from, when it came from one. */
  resourceId: string | null
  sessionRecordId: string | null
  sessionTitle: string | null
}

/** A ledger row that registered a port this process is holding. */
export interface PortClaim {
  resourceId: string
  port: number
  /** True when the row registered THIS process. False means the port has changed hands. */
  sameProcess: boolean
  says: string
}

/** One process on this machine that is part of a Mole Office dev stack. */
export interface ServingProcess {
  part: DevStackPart
  pid: number
  pgid: number
  command: string
  startedAt: string
  /** How long it has been up. Null when the start time does not read as one. */
  upFor: Age | null
  /** Where it is running. Null when this user may not read it. */
  workingDirectory: string | null
  /** True when the directory it is running in has been deleted. Null when it could not be read. */
  workingDirectoryDeleted: boolean | null
  /**
   * Whether it is running in the directory this server is running in. Null when the directory
   * could not be read, which is not the same as no.
   */
  inThisCheckout: boolean | null
  /** The ports it is listening on. Empty is a reading: it holds none. */
  ports: number[]
  /**
   * The database files it holds open. This is the corpus it is serving, read from the kernel.
   *
   * An empty list is a reading: it holds none. NULL means the open files could not be listed, and
   * the two must not be merged — a server whose descriptors this user may not read would
   * otherwise be reported as serving no database at all.
   */
  databases: string[] | null
  /** What `MOLE_OFFICE_DB` was set to when it started. Null when nothing set it. */
  databaseAsked: string | null
  /** The process that started it, as it is now. Null means that process has gone. */
  parent: { pid: number; command: string } | null
  /**
   * True when the process that started it has gone, so nobody is waiting for it. Null when the
   * parent could not be read, which is not the same as the parent being gone.
   */
  nobodyIsWaiting: boolean | null
  /**
   * Only on a watcher: whether an API server is running in its group.
   *
   * False is the shape of a stack whose server died — the watcher is up, the port is free, and
   * every other reading looks normal. Null on anything that is not a watcher.
   */
  hasAServerUnderIt: boolean | null
  ownership: ServerOwnership
  portClaims: PortClaim[]
  /** What a person can run to end it, and everything that command would end. Null when blocked. */
  byHand: { command: string; ends: string[] } | null
  /** Why there is no command. Null exactly when `byHand` is not null. */
  byHandBlockedBecause: string | null
  /** Everything about this process that could not be read, in the kernel's words. */
  couldNotRead: string[]
}

/** The server answering this request, from its own knowledge rather than from a reading. */
export interface AnsweringServer {
  pid: number
  /** Its process group, or null when it could not be read. */
  pgid: number | null
  startedAt: string | null
  upFor: Age | null
  /** The database file it has open, absolute. Every answer this server gives comes out of it. */
  database: string
  /** Why that file is not the file at that path any more. Null when it is. */
  databaseProblem: string | null
  /** The ports this process is listening on. */
  ports: number[]
  workingDirectory: string | null
  couldNotRead: string[]
}

export interface ServerReport {
  checkedAt: string
  platform: string
  answering: AnsweringServer
  /** Every Mole Office dev-stack process found, the API servers first. */
  servers: ServingProcess[]
  /** Facts about the whole picture that no single row can carry. */
  notes: string[]
  /** Where this read looked. An empty place cannot be told from an unsearched one. */
  searched: string[]
  /** Places it could not look at all, in the words the machine used. */
  couldNotLook: string[]
  summary: string
}

/** The ledger rows that are live in this project, each with the liveness the ledger gives it. */
interface RowWithLiveness {
  entry: LedgerEntry
  liveness: Liveness
  session: SessionView
}

/**
 * Which live ledger rows name this process, and whether their claim still holds.
 *
 * WHETHER A CLAIM HOLDS IS `livenessOf`'s ANSWER, NOT A SECOND OPINION. A row is current when the
 * ledger itself calls it alive, and that one function already knows about recycled pids and ports
 * that have changed hands. Working the same judgement out again here is how the two would come to
 * disagree, and a report that contradicted the orphan page would be worse than either.
 */
function rowsNaming(rows: readonly RowWithLiveness[], proc: OsProcess, ports: readonly number[]): RowWithLiveness[] {
  return rows.filter((r) => {
    // A CLIENT ROW NEVER NAMES A SERVER. A window connects to the office; it never owns its
    // process, its group or its ports, whatever numbers happen to match.
    if (r.entry.type === 'client') return false
    const key = Number(r.entry.key)
    if ((r.entry.type === 'process' || r.entry.type === 'gpu') && key === proc.pid) return true
    if (r.entry.type === 'port' && ports.includes(key)) return true
    return r.entry.pgid !== null && r.entry.pgid === proc.pgid
  })
}

function ownershipOf(
  proc: OsProcess,
  ports: readonly number[],
  rows: readonly RowWithLiveness[],
  ownPid: number,
  ownGroup: number | null,
): ServerOwnership {
  const none = { resourceId: null, sessionRecordId: null, sessionTitle: null }
  if (proc.pid === ownPid) {
    return {
      ...none,
      owner: 'the server answering you',
      says: `This is the process answering this request: pid ${proc.pid}, process group ${proc.pgid}.`,
    }
  }
  if (ownGroup !== null && proc.pgid === ownGroup) {
    return {
      ...none,
      owner: 'the group the server answering you is in',
      says: `Pid ${proc.pid} is in process group ${ownGroup}, which is the group the server answering this request is in.`,
    }
  }

  const naming = rowsNaming(rows, proc, ports)
  const current = naming.find((r) => r.liveness.state === 'alive')
  if (current !== undefined) {
    const ended = current.session.ended === true
    return {
      owner: ended ? 'a session that has ended' : 'a session that is still going',
      says:
        `${ended ? 'A session that has ended' : 'A session that is still going'} wrote this down: ` +
        `${current.session.title} registered ${current.entry.type} ${current.entry.key}, and what it registered ` +
        'is what is running now.',
      resourceId: current.entry.id,
      sessionRecordId: current.entry.sessionRecordId,
      sessionTitle: current.session.title,
    }
  }
  const stale = naming[0]
  if (stale !== undefined) {
    const why = stale.liveness.state === 'unknown' ? stale.liveness.reason : stale.liveness.detail
    return {
      owner: 'a ledger row that no longer matches',
      says:
        `A ledger row names this, and the row no longer describes what is running: ${stale.session.title} ` +
        `registered ${stale.entry.type} ${stale.entry.key}. ${why} So the row is a claim, not evidence, and it ` +
        'says nothing about who started the process running now.',
      resourceId: stale.entry.id,
      sessionRecordId: stale.entry.sessionRecordId,
      sessionTitle: stale.session.title,
    }
  }
  return {
    ...none,
    owner: 'nobody wrote it down',
    says:
      `No session in this project registered pid ${proc.pid}, its process group ${proc.pgid}, or any port it ` +
      'holds. Nothing can say who started it or whether they meant to leave it running.',
  }
}

function portClaimsFor(rows: readonly RowWithLiveness[], proc: OsProcess, ports: readonly number[]): PortClaim[] {
  const claims: PortClaim[] = []
  for (const r of rows) {
    if (r.entry.type !== 'port') continue
    const port = Number(r.entry.key)
    if (!ports.includes(port)) continue
    const sameProcess = theRowIsAboutThisProcess(r.entry.osStartedAt, proc).same === true
    claims.push({
      resourceId: r.entry.id,
      port,
      sameProcess,
      says: sameProcess
        ? `Port ${port} was registered by ${r.session.title}, and the process holding it now is the one that row ` +
          'names.'
        : `Port ${port} was registered by ${r.session.title} against a process that started ` +
          `${r.entry.osStartedAt ?? 'at a time nobody recorded'}. The process holding it now started ` +
          `${proc.startedAt}, so the port has changed hands and that row is about something that is gone.`,
    })
  }
  return claims
}

/**
 * What a person could run to end this, and everything that command would end.
 *
 * NOT ADVICE. This says what would happen, in the words of a command, so that somebody who has
 * decided already does not have to work out the process group by hand — killing the pid they can
 * see leaves the rest of the group holding the port, which is the mistake this whole file was
 * built after. Nothing here recommends running it, and nothing in Mole Office runs it.
 */
function byHandFor(
  proc: OsProcess,
  ownership: ServerOwnership,
  inThisCheckout: boolean | null,
  workingDirectory: string | null,
  workingDirectoryDeleted: boolean | null,
  probe: OsProbe,
): { byHand: ServingProcess['byHand']; blocked: string | null } {
  if (ownership.owner === 'the server answering you' || ownership.owner === 'the group the server answering you is in') {
    return {
      byHand: null,
      blocked:
        'This is the server answering you, or a process in its group. Mole Office will not write out a command that ' +
        'ends the thing you are reading this from.',
    }
  }
  if (inThisCheckout === null) {
    return {
      byHand: null,
      blocked:
        `Where pid ${proc.pid} is running could not be read, so Mole Office cannot tell whether it belongs to this ` +
        'checkout or to somebody else. It will not name a command against a process whose owner is unknown.',
    }
  }
  if (!inThisCheckout && workingDirectoryDeleted !== true) {
    return {
      byHand: null,
      blocked:
        `Pid ${proc.pid} is running in ${workingDirectory ?? 'a directory that could not be read'}, which is not ` +
        'the directory this server is running in. It is somebody else’s checkout as far as Mole Office can tell, and ' +
        'Mole Office will not name a command against it.',
    }
  }
  let group: OsProcess[]
  try {
    group = probe.processesInGroup(proc.pgid)
  } catch (err) {
    return {
      byHand: null,
      blocked:
        `Process group ${proc.pgid} could not be read (${messageOf(err)}), so what a group signal would end ` +
        'cannot be named, and Mole Office does not write out a command whose effect it cannot state.',
    }
  }
  return {
    byHand: {
      command: `kill -TERM -${proc.pgid}`,
      ends: group.map((p) => `${p.command} — pid ${p.pid}, started ${p.startedAt}`),
    },
    blocked: null,
  }
}

/** The server answering this request, described from what this process knows about itself. */
function answeringServer(probe: OsProbe, portsByPid: ReadonlyMap<number, number[]>): AnsweringServer {
  const pid = process.pid
  const couldNotRead: string[] = []
  let self: OsProcess | null = null
  try {
    self = probe.processById(pid)
  } catch (err) {
    couldNotRead.push(`This server could not read its own process entry (${messageOf(err)}).`)
  }
  if (self === null && couldNotRead.length === 0) {
    couldNotRead.push(
      `The probe installed for this read (${probe.platform}) does not know about pid ${pid}, which is the ` +
        'process answering you, so its process group and start time are unknown here.',
    )
  }
  // WHICH CORPUS THIS SERVER IS SERVING, from the one place that knows: the module that opened it.
  // It is not worked out again from the environment or from a path in a settings file, because the
  // file a running SQLite connection holds is the file it opened, whatever anything since says.
  const status = databaseFileStatus()
  return {
    pid,
    pgid: self?.pgid ?? null,
    startedAt: self?.startedAt ?? null,
    upFor: self === null ? null : ageOrNull(self.startedAt),
    database: status.path,
    databaseProblem: status.ok ? null : status.problem,
    ports: portsByPid.get(pid) ?? [],
    workingDirectory: process.cwd(),
    couldNotRead,
  }
}

/**
 * Every Mole Office dev-stack process on this machine, with who owns it and what is holding what.
 *
 * Reads the machine when it is asked and never on a timer. Signals nothing, kills nothing, writes
 * nothing, and marks no session finished.
 */
export function serversOnThisMachine(workspaceId: string): ServerReport {
  const probe = oneReadingPerListing(osProbe())
  const searched: string[] = []
  const couldNotLook: string[] = []
  const notes: string[] = []

  const portsByPid = new Map<number, number[]>()
  try {
    const ports = probe.listeningPorts()
    searched.push(
      `every listening socket on this machine — ${ports.length} ${ports.length === 1 ? 'socket' : 'sockets'}`,
    )
    for (const p of ports) {
      if (p.pid === null) continue
      const seen = portsByPid.get(p.pid) ?? []
      if (!seen.includes(p.port)) seen.push(p.port)
      portsByPid.set(p.pid, seen)
    }
  } catch (err) {
    couldNotLook.push(
      `The listening sockets could not be read (${messageOf(err)}), so which port each server is holding is ` +
        'unknown and no row below names one.',
    )
  }

  const answering = answeringServer(probe, portsByPid)

  let ownGroup: number | null = null
  try {
    ownGroup = probe.ownProcessGroup()
  } catch (err) {
    couldNotLook.push(
      `Mole Office could not read its own process group (${messageOf(err)}), so a process that belongs to the server ` +
        'answering you may be reported below as somebody else’s.',
    )
  }

  const rows: RowWithLiveness[] = readRows({ workspaceId }).map((row) => {
    const entry = toEntry(row)
    return { entry, liveness: livenessOf(entry, probe), session: sessionViewOf(entry.sessionRecordId) }
  })
  searched.push(
    `the “Running on this machine” list — ${rows.length} live ${rows.length === 1 ? 'row' : 'rows'} written down by sessions in ` +
      'this project',
  )

  const servers: ServingProcess[] = []
  const table = probe.processTable?.()
  if (table === undefined) {
    couldNotLook.push(
      `The probe installed for this read (${probe.platform}) does not describe a process table, so Mole Office could ` +
        'not look at what is running on this machine. This is not a reading that nothing is running.',
    )
  } else if (!table.ok) {
    couldNotLook.push(`${table.reason}. This is not a reading that nothing is running.`)
  } else {
    searched.push(
      `every process on this machine — ${table.processes.length} ` +
        `${table.processes.length === 1 ? 'process' : 'processes'}`,
    )
    const thisCheckout = process.cwd()
    // Which pids are an API server, worked out before the loop so a watcher can be asked whether
    // one of them is in its group.
    const apiServerGroups = new Set<number>()
    const matched: { info: { pid: number; command: string }; part: DevStackPart; proc: OsProcess }[] = []
    for (const info of table.processes) {
      const part = moleOfficePartOf(info.command)
      if (part === null) continue
      const proc = processOrNull(info.pid, probe)
      if (proc === null) continue
      matched.push({ info, part, proc })
      if (part === 'the API server') apiServerGroups.add(proc.pgid)
    }

    for (const { part, proc } of matched) {
      const ports = portsByPid.get(proc.pid) ?? []
      const couldNotRead: string[] = []
      const facts = probe.processFacts === undefined ? null : probe.processFacts(proc.pid)
      if (probe.processFacts === undefined) {
        couldNotRead.push(
          `The probe installed for this read (${probe.platform}) cannot describe where a process is running, ` +
            'what started it, or which database it holds open.',
        )
      }
      if (facts !== null) couldNotRead.push(...facts.couldNotRead)

      const workingDirectory = facts?.workingDirectory ?? null
      const workingDirectoryDeleted = facts === null ? null : facts.workingDirectoryDeleted
      const inThisCheckout = workingDirectory === null ? null : workingDirectory === thisCheckout
      const ownership = ownershipOf(proc, ports, rows, answering.pid, ownGroup)
      const { byHand, blocked } = byHandFor(
        proc,
        ownership,
        inThisCheckout,
        workingDirectory,
        workingDirectoryDeleted,
        probe,
      )
      servers.push({
        part,
        pid: proc.pid,
        pgid: proc.pgid,
        command: proc.command,
        startedAt: proc.startedAt,
        upFor: ageOrNull(proc.startedAt),
        workingDirectory,
        workingDirectoryDeleted,
        inThisCheckout,
        ports,
        databases: facts === null ? null : facts.openDatabases,
        databaseAsked: facts?.databaseAsked ?? null,
        parent: facts?.parent === undefined || facts.parent === null ? null : { pid: facts.parent.pid, command: facts.parent.command },
        nobodyIsWaiting: facts === null ? null : facts.parent === null,
        hasAServerUnderIt: part === 'the server watcher' ? apiServerGroups.has(proc.pgid) : null,
        ownership,
        portClaims: portClaimsFor(rows, proc, ports),
        byHand,
        byHandBlockedBecause: blocked,
        couldNotRead,
      })
    }

    // The API servers first, then the browser apps, then what supervises them: a reader asking
    // "which server am I talking to" is asking about the first kind.
    const order: Record<DevStackPart, number> = {
      'the API server': 0,
      'the browser app': 1,
      'the server watcher': 2,
      'the dev supervisor': 3,
    }
    servers.sort((a, b) => order[a.part] - order[b.part] || a.pid - b.pid)
    notes.push(...crossRowNotes(servers, answering))
  }

  return {
    checkedAt: now(),
    platform: probe.platform,
    answering,
    servers,
    notes,
    searched,
    couldNotLook,
    summary: serverSummary(servers, couldNotLook, answering),
  }
}

/** A part's name at the start of a sentence. The names read as "the API server" inside one. */
function sentenceStart(part: DevStackPart): string {
  return part.charAt(0).toUpperCase() + part.slice(1)
}

/** What is true of the whole picture and of no single row in it. */
function crossRowNotes(servers: readonly ServingProcess[], answering: AnsweringServer): string[] {
  const notes: string[] = []
  const apis = servers.filter((s) => s.part === 'the API server')
  if (apis.length > 1) {
    const corpora = [...new Set(apis.flatMap((s) => s.databases ?? []))]
    notes.push(
      `${apis.length} API servers are running: ${apis.map((s) => `pid ${s.pid}${s.ports.length > 0 ? ` on port ${s.ports.join(', ')}` : ' holding no port'}`).join('; ')}. ` +
        (corpora.length > 1
          ? `They do not all hold the same database — ${corpora.join(', ')} — so which one answered a question ` +
            'decides which corpus the answer came from.'
          : 'A reader cannot tell which one answered them without looking at the pid.'),
    )
  }
  const outside = apis.filter((s) => (s.databases ?? []).length > 0 && !(s.databases ?? []).includes(answering.database))
  for (const s of outside) {
    notes.push(
      `The API server at pid ${s.pid} holds ${(s.databases ?? []).join(', ')}, and this server holds ` +
        `${answering.database}. They are different files, so the two answer differently about the same question.`,
    )
  }
  for (const s of servers) {
    if (s.hasAServerUnderIt === false) {
      notes.push(
        `The watcher at pid ${s.pid} has no API server in its process group. It is up, and the server it starts ` +
          'and restarts is not running. Nothing here can say why it stopped.',
      )
    }
    if (s.nobodyIsWaiting === true) {
      notes.push(
        `${sentenceStart(s.part)} at pid ${s.pid} has outlived the process that started it, so nothing is waiting ` +
          'for it and nothing will stop it when whatever started the stack is shut down.',
      )
    }
    if (s.workingDirectoryDeleted === true) {
      notes.push(
        `${sentenceStart(s.part)} at pid ${s.pid} is running in ${s.workingDirectory ?? 'a directory'}, which has ` +
          'been DELETED. It is still running out of a directory that is no longer on disk.',
      )
    }
  }
  return notes
}

/**
 * The sentence a person reads first.
 *
 * THE WORD "NOTHING" IS ONLY REACHABLE AFTER A READING THAT HAPPENED. When anything could not be
 * looked at, this says that first and never says the machine is clear. "I looked and found
 * nothing" and "I could not look" are opposite answers and this is the line that keeps them apart.
 */
function serverSummary(
  servers: readonly ServingProcess[],
  couldNotLook: readonly string[],
  answering: AnsweringServer,
): string {
  const parts: string[] = [
    `You are talking to pid ${answering.pid}` +
      `${answering.pgid === null ? '' : `, process group ${answering.pgid}`}` +
      `${answering.ports.length > 0 ? `, on port ${answering.ports.join(', ')}` : ''}, serving ${answering.database}.`,
  ]
  if (answering.databaseProblem !== null) parts.push(answering.databaseProblem)

  if (couldNotLook.length > 0) {
    parts.push(
      `Mole Office could not look everywhere it needed to: ${couldNotLook.length} ` +
        `${couldNotLook.length === 1 ? 'place is' : 'places are'} listed under "could not look", and the ` +
        `${servers.length} ${servers.length === 1 ? 'process' : 'processes'} below are what it managed to see, ` +
        'not what is running.',
    )
    return parts.join(' ')
  }
  if (servers.length === 0) {
    parts.push(
      'Mole Office read every process on this machine and found no Mole Office dev-stack process at all — not even the one ' +
        'answering you, which means the reading disagrees with the fact that you got an answer. Treat it as a ' +
        'fault in this read rather than as a clear machine.',
    )
    return parts.join(' ')
  }
  const byPart = new Map<DevStackPart, number>()
  for (const s of servers) byPart.set(s.part, (byPart.get(s.part) ?? 0) + 1)
  parts.push(
    `Mole Office read every process on this machine and every listening socket. It found ` +
      `${[...byPart].map(([part, n]) => `${n} × ${part}`).join(', ')}.`,
  )
  const unowned = servers.filter((s) => s.ownership.owner === 'nobody wrote it down').length
  const stale = servers.filter((s) => s.ownership.owner === 'a ledger row that no longer matches').length
  if (unowned > 0) {
    parts.push(
      `${unowned} of them ${unowned === 1 ? 'is' : 'are'} claimed by nothing: no session wrote them down, so ` +
        'nothing can say whether they were left behind.',
    )
  }
  if (stale > 0) {
    parts.push(
      `${stale} ${stale === 1 ? 'is' : 'are'} named only by a ledger row that has stopped describing what is ` +
        'running, which is a claim rather than evidence.',
    )
  }
  return parts.join(' ')
}

// ============================================================================ the raw scan

export interface ScanPort extends OsPort {
  /** The process holding it, when it could be read. Null when the socket is another user's. */
  holder: OsProcess | null
}

export interface OsScan {
  at: string
  platform: string
  ports: ScanPort[]
  gpu: OsGpu
  containers: OsContainers
  locks: OsLocks
  /** The paths `locks` was allowed to look in. An empty list means none are configured. */
  lockPaths: readonly string[]
}

/**
 * What the machine looks like right now, whether or not anything registered it.
 *
 * The ledger only knows what a session wrote down, and the incidents that motivated this
 * feature were caused by sessions that died before writing anything. This is the view that
 * catches those: every listening port with the process group holding it, the GPU, the
 * containers, and the lock files under the configured paths.
 */
export function scanMachine(): OsScan {
  const probe = osProbe()
  const ports = probe.listeningPorts().map((p) => ({
    ...p,
    holder: p.pid === null ? null : probe.processById(p.pid),
  }))
  const lockPaths = configuredLockPaths()
  return {
    at: now(),
    platform: probe.platform,
    ports,
    gpu: probe.gpu(),
    containers: probe.containers(),
    locks: probe.locks(lockPaths),
    lockPaths,
  }
}

// ============================================================================ releasing

export interface ReleaseInput {
  signal?: 'SIGTERM' | 'SIGKILL'
  /** Kill it even though the owning session is still running. Explicit, and logged as such. */
  force?: boolean
  /**
   * Close the row and send no signal at all. Only the session that registered the row may ask for
   * this, and the row says that nothing was signalled. See THE ROW IS CLOSED AND NOTHING IS
   * SIGNALLED inside `releaseResource`.
   */
  signalNothing?: boolean
  note?: string
  actor: Actor
}

export interface ReleaseResult {
  resource: LedgerEntry
  /** True when a signal was actually sent, or a container actually stopped. */
  acted: boolean
  /** What happened, in a sentence, for the caller and for the change log. */
  outcome: string
  /**
   * True when the target survived the signal. SIGKILL is never sent automatically, except to a run's Job Object on
   * Windows (`endTheJobObject`). `unknown` when whether the target is gone could not be told: then the row is left open,
   * and `outcome` says why.
   */
  stillAlive: boolean | 'unknown'
}

/** A pause of `ms` milliseconds. The holder's restart waits with it too, so the server has one such timer. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Kill one resource, by process group, and write down who asked.
 *
 * Every refusal below is a case where doing it anyway could destroy something that is not
 * yours:
 *
 *   - the pid has been recycled, so the group now belongs to a stranger
 *   - the port has changed hands since it was registered
 *   - the process moved into a different group, so the recorded group is no longer it
 *   - the group is Mole Office's own, or is init's
 *   - the session is still running and nobody said `force`
 *
 * There is no automatic escalation from SIGTERM to SIGKILL. A process that ignores SIGTERM is
 * reported as still alive with SIGKILL offered, because deciding to SIGKILL something is a
 * second decision and it belongs to the person, not to a timer.
 *
 * A RUN ON WINDOWS IS THE ONE EXCEPTION. Its row records the pid of the starter that started it,
 * and its group is the Job Object that starter made. The run's program has no stop pipe, so there
 * is nothing to ask: the release ends that Job Object at once, with every process in it, whether
 * the starter still runs or has ended (`theJobObjectAReleaseEnds`). Then it looks again, as the
 * listing reads the row, for about five seconds at most (`endTheJobObject`). Only a look that reads
 * the program gone closes the row. A program still alive, or a look that cannot tell, leaves the
 * row open, and the answer says which. A row whose starter has ended is never closed as gone while
 * its reading cannot tell. This is the one place a release reads a run's process, so a shutdown's
 * pause, the office's pause, a run's stop door and a person's stop of the row all do this.
 */
export async function releaseResource(
  id: string,
  input: ReleaseInput,
  workspaceId: string,
): Promise<ReleaseResult> {
  // THE PROCESS A RELEASE READS IS READ FIRST, without holding the thread where the probe can (Windows; `readFirst`
  // above), and every check up to the stop is answered from that reading. Only the stop, and the look after it, wait.
  const checked = await readFirst(() => theProcessesAReleaseReads(id, workspaceId), () => theReleaseUpToItsStop(id, input, workspaceId))
  if (checked instanceof AGroupToStop) return await stopTheGroup(checked, input)
  if (checked instanceof AJobObjectToEnd) return await endTheJobObject(checked, input)
  return checked
}

/**
 * The process `theReleaseUpToItsStop` reads, for `readFirst`: the row's own, where its key is a process, and, once that
 * process has ended, what its starter left running (`whatAnEndedPidLeftRunning`), so that reading waits too.
 */
function theProcessesAReleaseReads(id: string, workspaceId: string): AProcessToRead[] {
  const entry = toEntry(theRowInThisProject(id, workspaceId))
  const pid = Number(entry.key)
  const aProcess = entry.type === 'process' || entry.type === 'gpu'
  return entry.releasedAt === null && aProcess && Number.isSafeInteger(pid) && pid > 0 ? [{ pid, alsoItsStarterIfEnded: theStarterIsAskedAbout(entry) }] : []
}

/** A RELEASE THAT HAS PASSED EVERY CHECK ITS READING ANSWERS, and stops its group next. */
class AGroupToStop {
  constructor(
    readonly entry: LedgerEntry,
    readonly pgid: number,
    readonly osStartedAt: string,
    readonly target: OsProcess,
    readonly signal: 'SIGTERM' | 'SIGKILL',
  ) {}
}

/** A RELEASE OF A STARTER'S ROW ON WINDOWS THAT HAS PASSED EVERY CHECK ITS READING ANSWERS, and ends the Job Object next. */
class AJobObjectToEnd {
  constructor(
    readonly entry: LedgerEntry,
    readonly group: number,
    readonly jobObjects: NonNullable<TheGroups['jobObjects']>,
  ) {}
}

/** Every check of a release that its reading answers, and every release that ends with no stop. */
function theReleaseUpToItsStop(id: string, input: ReleaseInput, workspaceId: string): ReleaseResult | AGroupToStop | AJobObjectToEnd {
  const row = theRowInThisProject(id, workspaceId)
  const entry = toEntry(row)
  if (entry.releasedAt !== null) {
    throw new PanelError(
      `Resource ${id} was already released at ${entry.releasedAt} by ${entry.releasedBy}` +
        `${entry.releaseNote ? ` (${entry.releaseNote})` : ''}.`,
      409,
    )
  }

  const probe = osProbe()
  const signal = input.signal ?? 'SIGTERM'
  const session = sessionViewOf(entry.sessionRecordId)

  // Checked before the session state, because a lock can never be released through this
  // endpoint at all. Telling somebody to mark the session finished first, and then refusing
  // anyway, would waste a step and read as a bug.
  if (entry.type === 'lock' && input.signalNothing !== true) {
    throw new PanelError(
      `Mole Office will not delete lock files, and ${entry.key} is one. A lock is often the only evidence that a job ` +
        'is still running, and removing it lets a second copy start on the same data — a worse outcome than the ' +
        `stale lock. Look at it, then remove it yourself: rm ${entry.key}`,
    )
  }
  // A slot is a seat, not a process, and this door signals process groups. Giving a seat back has
  // its own door, which hands the seat to the next in line; the group holding it is stopped, if it
  // must be, by its own process row.
  if (entry.type === 'slot') {
    throw new PanelError(
      `${entry.id} is a slot (${entry.key}), which this door does not stop: it signals process groups. Give the ` +
        `slot back with POST /api/slots/${entry.id}/release, which hands the seat to the next in line. The slot ` +
        'also gives itself back when the process group holding it ends.',
    )
  }

  /**
   * A ROW WHOSE PROCESS HAS ALREADY STOPPED IS CLOSED WITHOUT A SIGNAL.
   *
   * ---------------------------------------------------------------------------------------
   * WHY, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Problem `EAjKf12JSZCn`. A session that stopped its own servers by process group could not then
   * close their rows: the refusal below names the session and offers `force`, and both of those
   * mean "kill it anyway", which is the wrong description of a process that was already gone.
   * Every builder this week had to mark its own session finished first, or send force. On 4
   * September 2026 five rows one session had registered — two scratch servers, two ports and a
   * review run — all read `liveness: gone` and none could be closed.
   *
   * Problem `KoKwVVg5F8zW` is the same fault stated exactly: force DID close those rows, and what
   * it wrote into the change log was a forced kill of a process that had stopped before the call.
   * That is a false entry in a permanent log, and it is what this removes.
   *
   * Problem `3d1d1pmydN5Y` is the other half. A row can be gone while the session that registered
   * it is still running and has moved on to a new bridge, so requiring the caller to be that
   * session left a maintainer no honest way to close the old row — only a false `finished` on a
   * live session or a `force` that was never sent.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IS CHECKED, AND WHY EACH PART
   * ---------------------------------------------------------------------------------------
   *
   * 1. **The row's own process is gone, verified NOW**, by the same `livenessOf` every report
   *    uses. Not the reading in the caller's hand and not the one a page was built from. `unknown`
   *    is not gone — it means Mole Office could not look — so it keeps the refusal. A pid in use
   *    again by another process and a port that changed hands also read `gone`, because the one
   *    this session started has exited. Those rows are closed here too, and the process now
   *    holding the number is not signalled. Problem `kmdLJ_7HADfN`: five port rows stayed open for
   *    weeks because this path once closed only a free number, and the refusal below told the
   *    caller to tidy the row "by hand", which no door does.
   * 2. **The caller is admitted to this door at all.** The refusal below exists so that a running
   *    process is not killed out from under its session, and it names the session for that reason.
   *    A process already gone has nothing to interrupt, so that guard has nothing to protect, and
   *    any caller the door admits may close the row, whatever session registered it: it stops nothing.
   *    Item 2 of a decision keeps this path open for that reason. The receipt
   *    names who closed it and why.
   *
   * NOTHING IS SIGNALLED on this path, so none of the checks below it — the recycled pid, the
   * process group, Mole Office's own group — has anything to guard. The row is marked released,
   * the note says it was closed after the process was found gone, whether the caller was the
   * session that registered it, and whether a different process now holds its number. The change
   * log says the same.
   */
  const goneNow = livenessOf(entry, probe)
  if (goneNow.state === 'gone') {
    // A GONE ROW WHOSE NUMBER IS IN USE AGAIN IS CLOSED TOO, AND ITS NOTE SAYS SO. The process holding
    // the number now is a different one, and nothing on this path signals it. The note says the
    // number is taken, so a reader of the closed row is not left to think the number is free.
    const theNumberIsTaken =
      entry.type === 'port'
        ? probe.listeningPorts().some((p) => p.port === Number(entry.key))
        : entry.type !== 'container' && probe.processById(Number(entry.key)) !== null
    const byItsOwnSession = callerIsTheOwningSession(input.actor, entry, workspaceId)
    return finish(
      entry,
      input,
      false,
      `Nothing was signalled: ${goneNow.detail} ` +
        (byItsOwnSession
          ? 'The row was closed by the session that registered it.'
          : 'The row was closed by a caller other than the session that registered it.'),
      false,
      [
        byItsOwnSession
          ? 'closed after the process was found gone'
          : 'closed after the process was found gone, by a caller other than the session that registered it',
        theNumberIsTaken
          ? `${entry.type === 'port' ? 'the port' : 'the pid'} is now held by a different process, which was not signalled`
          : null,
      ]
        .filter((s): s is string => s !== null)
        .join('; '),
    )
  }

  /**
   * THE ROW IS CLOSED AND NOTHING IS SIGNALLED, BECAUSE THE SESSION THAT REGISTERED IT ASKED.
   *
   * Problems `OCjvJGIE4M4H` and `L3hKJEp1Z4cG`. Every other way out of this function either signals
   * the process group or finds the process already gone. So a row about a process that is still
   * running could only be closed by killing it. Two cases had no honest move:
   *
   *   - The browser app closes its own row when Vite shuts down. The process sending the request is
   *     the one the row names, and it is still alive, so the release was always refused. Not one of
   *     113 browser app rows on 4 September 2026 had been closed by the browser app itself.
   *   - A row about a process in Mole Office's own group can never be released, because the refusal
   *     below will not kill the server that answers the request.
   *
   * ONLY THE SESSION THAT REGISTERED THE ROW MAY DO THIS. Closing the row leaves the process running
   * with no row on the list, and the list is what somebody tidying up reads. A session taking back
   * its own claim is the same act `withdrawRowRegisteredByMistake` allows. Anybody else must stop
   * the process, or wait for it to go; a gone process is closed above by any caller.
   *
   * The note says that nothing was signalled, who closed the row, and what the machine said about
   * the process at that moment. The change log says the same, as an `update` and not a `delete`,
   * because in this change log `delete` on a resource means something was stopped. A world is not
   * ended here: the process may still be serving it.
   */
  if (input.signalNothing === true) {
    if (!callerIsTheOwningSession(input.actor, entry, workspaceId)) {
      throw new PanelError(
        `Only the session that registered row ${id} may close it without a signal, because that leaves ` +
          `${entry.type} "${entry.key}" as it is with no row on the list. The row was registered by session ` +
          `${entry.sessionRecordId}, and this request did not come from that session. Send that session in the ` +
          'x-mole-office-session header, or release the row without "signalNothing" to stop what it names.',
        403,
      )
    }
    const said = goneNow.state === 'unknown' ? goneNow.reason : goneNow.detail
    const note = [input.note?.trim(), 'closed by the session that registered it, and nothing was signalled']
      .filter((s): s is string => s !== undefined && s !== '')
      .join('; ')
    const outcome = `Nothing was signalled. The row is closed and ${entry.type} "${entry.key}" was left as it is: ${said}`
    const releasedAt = now()
    const releasedBy = `${input.actor.type}:${input.actor.id}`
    sqlite
      .prepare('UPDATE session_resources SET released_at = ?, released_by = ?, release_note = ? WHERE id = ?')
      .run(releasedAt, releasedBy, note, entry.id)
    logChange(
      entry.sessionRecordId,
      'update',
      input.actor,
      `resource.${entry.type}`,
      `${entry.key} — held`,
      `${entry.key} — ${outcome} [${note}]`,
    )
    return {
      resource: { ...entry, releasedAt, releasedBy, releaseNote: note },
      acted: false,
      outcome,
      stillAlive: false,
    }
  }

  if (session.ended !== true && input.force !== true) {
    throw new PanelError(
      `The session that started this is ${session.ended === 'unknown' ? 'in an unreadable state' : `still ${session.state}`}, ` +
        `so killing ${entry.type} "${entry.key}" would interrupt work in progress. Mark the session finished or ` +
        'crashed first (PATCH /api/records/' + entry.sessionRecordId + ' {"dataPatch":{"state":"finished"}}), ' +
        'or send {"force":true} to do it anyway — which is recorded as such in the change log.',
      409,
    )
  }

  if (entry.type === 'container') {
    const reading = probe.containers()
    if (!reading.available) {
      throw new PanelError(`Containers cannot be reached, so "${entry.key}" was not stopped: ${reading.reason}`, 503)
    }
    const found = theContainerCalled(reading.containers, entry.key)
    if (!found) {
      return finish(entry, input, false, `No running container is called "${entry.key}" any more; nothing was stopped.`, false)
    }
    assertMayStopAnEndedRunsResource(entry, session, input.actor, workspaceId)
    probe.stopContainer(found.name)
    const after = probe.containers()
    const survived = after.available && after.containers.some((c) => c.name === found.name)
    return finish(
      entry,
      input,
      true,
      `Stopped container ${found.name} (${found.image}).`,
      survived,
    )
  }

  // Everything left is a process group: a plain process, a GPU holder, or a port's holder.
  const pid = Number(entry.key)
  const target = entry.type === 'port' ? holderOfPort(entry, probe) : probe.processById(pid)

  // A PID THAT HAS ENDED IS NOT CLOSED AS GONE WHILE ITS READING CANNOT TELL whether what it started still runs. That
  // reading is the one the listing takes: on Windows it asks the ended starter's Job Object (`whatAnEndedPidLeftRunning`).
  // Nothing is ended and the row stays open, because the program may still run. A port row is read by its holder, as
  // before.
  if (target === null && goneNow.state === 'unknown' && entry.type !== 'port') {
    return {
      resource: entry,
      acted: false,
      outcome: `Nothing was ended, and the row is left open, because whether its program has stopped cannot be told: ${goneNow.reason}`,
      stillAlive: 'unknown',
    }
  }
  const theStartersJobObject = theJobObjectAReleaseEnds(entry, target, goneNow, probe)
  if (theStartersJobObject !== null) {
    assertMayStopAnEndedRunsResource(entry, session, input.actor, workspaceId)
    return new AJobObjectToEnd(entry, pid, theStartersJobObject)
  }
  if (target === null) {
    return finish(entry, input, false, describeGone(entry), false)
  }
  // NO START TIME, NO SIGNAL. Problem `HfYQOmmx97wT`: the check below only refuses a definite
  // mismatch, so a row with no start time used to pass it. Only the missing process group, which a
  // restore drops at the same time, stopped the signal.
  if (entry.osStartedAt === null) {
    throw new PanelError(whyARowWithNoStartTimeIsNotSignalled(entry, target))
  }
  if (theRowIsAboutThisProcess(entry.osStartedAt, target).same === false) {
    throw new PanelError(
      `Refusing to signal anything. ${entry.type === 'port' ? `Port ${entry.key} is now held by` : `Pid ${target.pid} is now`} ` +
        `a process that started at ${target.startedAt}, not ${entry.osStartedAt}: "${target.command}". The one this ` +
        'session started has already gone and this is a different program with the same number. Send the release ' +
        'again with no "expect": if the machine still reads this way, the row is closed and nothing is signalled.',
      409,
    )
  }
  if (entry.pgid === null) {
    throw new PanelError(
      `No process group was recorded for ${entry.type} "${entry.key}" — nothing was listening on it when it was ` +
        'registered — so there is no group to signal. The current holder is pid ' +
        `${target.pid}, group ${target.pgid}: "${target.command}". Kill it by hand if it is yours.`,
    )
  }
  // ON WINDOWS THE READER GIVES EVERY PROCESS GROUP 0, and a group is the Job Object its starter made. So there the
  // process's group, and this server's, are asked of the Job Object before the stop (`refuseWhatTheJobObjectDoesNotHold`).
  const { jobObjects } = theGroupsOf(probe)
  if (jobObjects === null && target.pgid !== entry.pgid) {
    throw new PanelError(
      `Refusing to signal anything. This was registered in process group ${entry.pgid} and pid ${target.pid} is now ` +
        `in group ${target.pgid}. Signalling the recorded group could hit processes that have nothing to do with ` +
        'this, and signalling the new one could hit its new group-mates. Deal with it by hand.',
      409,
    )
  }
  if (entry.pgid <= 1) {
    throw new PanelError(
      jobObjects === null
        ? `Refusing to signal process group ${entry.pgid}. That is init, or every process there is.`
        : `Refusing to stop group ${entry.pgid}. On Windows a process is in a group only when its starter's Job Object ` +
            `holds it, and no such group was recorded for pid ${target.pid}.`,
    )
  }
  if (jobObjects === null && entry.pgid === probe.ownProcessGroup()) {
    throw new PanelError(
      `Refusing to signal process group ${entry.pgid}: that is Mole Office's own group, so this would kill the server ` +
        'answering the request. To close the row and leave the process running, the session that registered it can ' +
        'release it with {"signalNothing":true}.',
    )
  }

  assertMayStopAnEndedRunsResource(entry, session, input.actor, workspaceId)
  return new AGroupToStop(entry, entry.pgid, entry.osStartedAt, target, signal)
}

/**
 * STOP THE GROUP OF A RELEASE THAT PASSED ITS CHECKS, then give it a moment to go and look.
 *
 * WINDOWS HAS NO SIGTERM. There the stop that asks is the stop request on the group's pipe, which the program at the
 * head of the group hears, and it stops itself (src/config/systems/windows-groups.mjs). SIGKILL ends the group's Job
 * Object, as it did.
 */
async function stopTheGroup({ entry, pgid, osStartedAt, target, signal }: AGroupToStop, input: ReleaseInput): Promise<ReleaseResult> {
  const probe = osProbe()
  const groups = theGroupsOf(probe)
  if (groups.jobObjects !== null) await refuseWhatTheJobObjectDoesNotHold(groups.jobObjects, pgid, target.pid)
  const byRequest = signal === 'SIGTERM' && groups.gentleStop === null
  if (byRequest) {
    try {
      await groups.askToStop(pgid)
    } catch (refused) {
      throw new PanelError(refused instanceof Error ? refused.message : String(refused), 503)
    }
  } else {
    probe.killProcessGroup(pgid, signal)
  }

  // Give it a moment to go, then look. The wait is short and bounded because the answer is
  // reported either way — this is not a retry loop that eventually escalates. A second at most, because on Windows
  // one reading takes about that long.
  const until = Date.now() + 1_000
  let stillAlive = true
  for (let i = 0; i < 10 && Date.now() < until; i += 1) {
    await sleep(100)
    const after = await readAProcess(target.pid, probe)
    if (after === null || theRowIsAboutThisProcess(osStartedAt, after).same === false) {
      stillAlive = false
      break
    }
  }

  const sent = byRequest ? `A stop request was sent to group ${pgid} and answered "${THE_STOP_ANSWER}"` : `${signal} was sent to process group ${pgid}`
  const outcome = !stillAlive
    ? `${sent}; it is gone. (${entry.detail})`
    : byRequest
      ? `${sent}, and pid ${target.pid} is still alive a second later. It may be shutting down — send {"signal":"SIGKILL"} ` +
        'if you want it gone.'
      : `${sent} and pid ${target.pid} is still alive a second later. ` +
        'It may be shutting down, or it may be ignoring the signal — send {"signal":"SIGKILL"} if you want it gone.'

  return finish(entry, input, true, outcome, stillAlive)
}

/**
 * THE JOB OBJECT A RELEASE OF THIS ROW ENDS, ON WINDOWS: the one the row's pid made as a starter, or null for every
 * other row and on every other system.
 *
 * A run on Windows is started through a starter (src/config/systems/windows-starts.mjs), and its row records the
 * starter's pid. The starter makes the Job Object named for its own pid and starts the program in it. So that pid is
 * the run's group, though the row records group 0, as the reader gives every process. Such a row is ended by that Job
 * Object, at once, because a run's program has no stop pipe to ask. These rows are those, and only once the release's
 * reading of the row says it is alive:
 *   - the row's pid has ended, and its Job Object holds a program it started (`whatAnEndedPidLeftRunning`). The
 *     message worker's starter ends when the worker ends, and the run goes on in that Job Object;
 *   - the row's pid still runs, as the same process, and its command line carries the starter's mark.
 * A row that records a group of its own, as the terminal holder's does, is stopped by that group as before.
 */
function theJobObjectAReleaseEnds(entry: LedgerEntry, target: OsProcess | null, now: Liveness, probe: OsProbe): NonNullable<TheGroups['jobObjects']> | null {
  const { jobObjects } = theGroupsOf(probe)
  if (jobObjects === null || entry.type !== 'process' || !theStarterIsAskedAbout(entry)) return null
  if (entry.pgid !== null && entry.pgid > 1) return null
  if (now.state !== 'alive') return null
  return target === null || target.command.includes(THE_STARTERS_MARK) ? jobObjects : null
}

/**
 * END THE JOB OBJECT A RUN WAS STARTED IN, ON WINDOWS, AND LOOK AGAIN UNTIL ITS PROGRAM IS GONE, for a bounded time.
 *
 * The end is SIGKILL to the group, through the system layer, which ends every process in the Job Object
 * (src/config/systems/windows-groups.mjs). There is no ask first. The Job Object must not hold this server, as for any
 * other group.
 *
 * THE LOOK AFTER IT is the reading the listing takes of the row: its pid, and what its starter left in its Job Object
 * (`theRowReadAfterItsEnd`). Only a look that reads the program gone closes the row. A look that reads it alive leaves
 * the row open, and the answer says it is still running. A look that cannot tell leaves the row open too, and the
 * answer says it could not tell. Both are written in the change log, because the end was sent.
 */
async function endTheJobObject({ entry, group, jobObjects }: AJobObjectToEnd, input: ReleaseInput): Promise<ReleaseResult> {
  const probe = osProbe()
  await refuseAJobObjectThatHoldsThisServer(jobObjects, group)
  let refused: string | null = null
  try {
    probe.killProcessGroup(group, 'SIGKILL')
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error)
  }
  const after = await theRowReadAfterItsEnd(entry)
  const ended =
    refused === null
      ? `The Job Object of group ${group} was ended at once, with every process in it`
      : `The Job Object of group ${group} could not be ended: ${refused.replace(/[.\s]+$/u, '')}`
  if (after.state === 'gone') {
    return refused === null
      ? finish(entry, input, true, `${ended}; its program is gone. (${entry.detail})`, false)
      : finish(entry, input, false, `${ended}. Its program is gone all the same: ${after.detail}`, false, 'closed after the program was found gone')
  }
  const outcome =
    after.state === 'alive'
      ? `${ended}, and its program is still running after it: ${after.detail}. The row is left open.`
      : `${ended}, and whether its program has stopped cannot be told: ${after.reason} The row is left open.`
  if (refused === null) {
    const note = [input.note?.trim(), input.force === true ? 'forced while the session was still running' : null]
      .filter((s): s is string => s !== undefined && s !== null && s !== '')
      .join('; ')
    logChange(entry.sessionRecordId, 'update', input.actor, `resource.${entry.type}`, `${entry.key} — held`, `${entry.key} — ${outcome}${note === '' ? '' : ` [${note}]`}`)
  }
  return { resource: entry, acted: refused === null, outcome, stillAlive: after.state === 'alive' ? true : 'unknown' }
}

/**
 * THE ROW READ AGAIN AFTER ITS JOB OBJECT WAS ENDED, as the listing reads it, by the way that waits where the probe has
 * one (`readFirst`).
 *
 * A quarter of a second after the end, and up to three looks in all, a quarter of a second apart, with no new look once
 * three seconds have passed. Windows ends every process in a Job Object when the Job Object is ended, so the first look
 * should read the program gone. The later looks are for a process Windows is still taking down. On Windows one look
 * runs one script while the starter runs, and two once it has ended, and each script takes about a second. So the wait
 * is about five seconds at most. The last look is the answer.
 */
async function theRowReadAfterItsEnd(entry: LedgerEntry): Promise<Liveness> {
  const look = () => readFirst(() => [{ pid: Number(entry.key), alsoItsStarterIfEnded: true }], () => livenessOf(entry, osProbe()))
  const until = Date.now() + 3_000
  await sleep(250)
  let read = await look()
  for (let more = 1; more < 3 && read.state !== 'gone' && Date.now() < until; more += 1) {
    await sleep(250)
    read = await look()
  }
  return read
}

/**
 * WHAT THE JOB OBJECT OF A ROW'S GROUP MUST SAY BEFORE THE GROUP IS STOPPED, on Windows, asked by the way that waits.
 * It must hold the process the row records, as a process's group is checked elsewhere. It must
 * not hold this server, because a stop of the server's own group would stop the server answering the request. That is
 * asked of the Job Object itself, so it is answered for a server that no starter started too. An answer Windows
 * cannot give refuses.
 */
async function refuseWhatTheJobObjectDoesNotHold(jobObjects: NonNullable<TheGroups['jobObjects']>, pgid: number, pid: number): Promise<void> {
  const holding = await jobObjects.readHolds(pgid, pid)
  if ('unknown' in holding) {
    throw new PanelError(
      `Refusing to stop anything. This was registered in group ${pgid}, and whether its Job Object holds pid ${pid} cannot ` +
        `be told: ${holding.unknown}`,
      503,
    )
  }
  if (!holding.holds) {
    throw new PanelError(
      `Refusing to stop anything. This was registered in group ${pgid}, and ${holding.why}. Stopping the recorded group ` +
        'could reach processes that have nothing to do with this. Deal with it by hand.',
      409,
    )
  }
  await refuseAJobObjectThatHoldsThisServer(jobObjects, pgid)
}

/** The half of `refuseWhatTheJobObjectDoesNotHold` that refuses a Job Object holding this server, or one that cannot say. */
async function refuseAJobObjectThatHoldsThisServer(jobObjects: NonNullable<TheGroups['jobObjects']>, pgid: number): Promise<void> {
  const theServer = await jobObjects.readHolds(pgid, process.pid)
  if ('unknown' in theServer) {
    throw new PanelError(
      `Refusing to stop group ${pgid}: whether its Job Object holds this server, process ${process.pid}, cannot be told, ` +
        `and if it does, the stop would stop the server answering the request. ${theServer.unknown}`,
      503,
    )
  }
  if (theServer.holds) {
    throw new PanelError(
      `Refusing to stop group ${pgid}: its Job Object holds this server, process ${process.pid}, so this would stop the ` +
        'server answering the request. To close the row and leave the process running, the session that registered it ' +
        'can release it with {"signalNothing":true}.',
    )
  }
}

/**
 * Item 2 of a decision, the owner's message, the secretary's pjbYDjfCKF8r, proposal jvFnqONCGikw and problem
 * fqAnXbQFKJeT; USER.md invariant 2: force on a live session
 * remains its existing act, and an ended session does not silently give everyone permission to stop it.
 * The registering agent may tidy up in any later session; the agent that started its registering
 * session may act on the notice. Read both identities with the office's existing readers.
 * Problem y9kWUYTAqYsC, inspector's jIUrYZAhxqQD, secretary's KyB-FsT804bq: the owner's
 * answer (a closer look only if needed) means whoever is told may act if needed. Inspector's IzRXmfdDVH_2 and
 * the secretary's sHBreuZqBPad: the routing walk ends at the first secretary, not at the chain's top.
 * USER.md invariant 9: theRungsOfTheRoutingWalk defines those stops for both readers.
 * Admit the registering agent, its walk's rungs and the run's parent starter, in that order.
 */
function assertMayStopAnEndedRunsResource(entry: LedgerEntry, session: SessionView, actor: Actor, workspaceId: string): void {
  if (session.ended !== true || maySpeakForTheSecretary(actor) !== null) return
  const run = getRecord(entry.sessionRecordId)
  const registering = run === null ? null : theAgentASessionAnswersAs(run, workspaceId)?.agent ?? null
  const starter = run === null ? null : starterAgentOfARun(run)
  const registered = registering === null ? null : readParticipant(registering) as RegisteredAgent | null
  const admitted = new Map<string, string>()
  if (registering !== null) admitted.set(registering.id, theNameOf(registered, registering.id))
  const rungs = registering === null ? [] : theRungsOfTheRoutingWalk(registering, theStarterEachStringNames()).rungs
  for (const { who: rung, row } of rungs) {
    if (!admitted.has(rung.id)) admitted.set(rung.id, theNameOf(row, rung.id))
  }
  if (starter !== null && !admitted.has(starter.id)) admitted.set(starter.id, theNameOf(starter, starter.id))
  if ([...admitted.keys()].some(id => sameAgent({ actorType: 'agent', actorId: id }, actor))) return
  const names = [...admitted.values()]
  throw new PanelError(`Only ${names.length === 0 ? '' : `${names.join(', ')}, `}a secretary, or the person may stop ${entry.type} ${entry.key} after its registering session has ended.`, 403)
}

/** The process currently holding a registered port, or null when nothing is. */
function holderOfPort(entry: LedgerEntry, probe: OsProbe): OsProcess | null {
  const port = Number(entry.key)
  const held = probe.listeningPorts().filter((p) => p.port === port)
  if (held.length === 0) return null
  const pid = held.find((p) => p.pid !== null)?.pid ?? null
  if (pid === null) {
    throw new PanelError(
      `Port ${port} is held, but by a process this user may not inspect, so Mole Office cannot tell whether it is the ` +
        'one this session started and will not signal it.',
      403,
    )
  }
  return probe.processById(pid)
}

/**
 * THE ROW WITH THIS ID IN THIS PROJECT, or a refusal that says which project was searched.
 *
 * Problem `TzYBehtBVuNg`. The refusal used to say "No resource with id X is in the ledger." when
 * the row was in the ledger of another project. A request with no project header is answered about
 * the default project, so the caller was told that a live row did not exist. Like
 * `recordInWorkspace` in lib/records.ts, the answer names the project it searched and, when the id
 * is in another project, names that project. There is no access model to hide it behind.
 */
function theRowInThisProject(id: string, workspaceId: string): LedgerRow {
  const row = readRow(id, workspaceId)
  if (row !== null) return row
  const elsewhere = sqlite.prepare('SELECT workspace_id FROM session_resources WHERE id = ?').get(id) as
    | { workspace_id: string }
    | undefined
  if (elsewhere !== undefined) {
    throw new PanelError(
      `Resource ${id} is not in the ledger of project "${workspaceId}", which is the project this request was ` +
        `answered about. It is in project "${elsewhere.workspace_id}". Send x-mole-office-workspace: ` +
        `${elsewhere.workspace_id} to reach it.`,
      404,
    )
  }
  throw new PanelError(`No resource with id ${id} is in the ledger of project "${workspaceId}", or of any other project.`, 404)
}

/**
 * WHY A ROW WITH NO START TIME IS NOT SIGNALLED, in the one sentence the release and the orphan
 * report both give. `holder` is what holds the row's pid or port now.
 */
export function whyARowWithNoStartTimeIsNotSignalled(
  row: { type: string; key: string },
  holder: { pid: number; pgid: number; command: string },
): string {
  const now = `pid ${holder.pid} (process group ${holder.pgid}, "${holder.command}")`
  return (
    `Refusing to signal anything. This row carries no start time, so Mole Office cannot tell whether ` +
    `${row.type === 'port' ? `${now}, which holds port ${row.key},` : now} is the process this session ` +
    'started or a different program that has since been given the same number. A row restored from an archive ' +
    'carries no start time, and neither does a port row that nothing was listening on when it was registered. ' +
    'To close the row and leave that process as it is, the session that registered it can release it with ' +
    '{"signalNothing":true}. If the process should stop, check it yourself and stop it by its process group.'
  )
}

/**
 * IS THE CALLER THE SESSION THAT REGISTERED THIS ROW?
 *
 * `actor.sessionId` is a REFERENCE and not necessarily an id — the caller may send a run name that
 * has been bound to a session record — so it is resolved the same way the change log resolves it,
 * through `resolveSessionRef`, rather than compared as text. A header that resolves to nothing
 * answers false: not knowing who is asking is not the same as knowing it is the owner.
 */
export function callerIsTheOwningSession(actor: Actor, entry: LedgerEntry, workspaceId: string): boolean {
  const ref = actor.sessionId?.trim() ?? ''
  if (ref === '') return false
  return resolveSessionRef(ref, workspaceId).recordId === entry.sessionRecordId
}

function describeGone(entry: LedgerEntry): string {
  if (entry.type === 'port') return `Nothing is listening on port ${entry.key} any more; nothing was signalled.`
  return `Nothing is running as pid ${entry.key} any more; nothing was signalled.`
}

/**
 * Mark the row released and write the change row.
 *
 * Called on every path that ends the resource's life in the ledger, including the ones where
 * nothing had to be killed, so a row can never be left open after a release was answered.
 */
function finish(
  entry: LedgerEntry,
  input: ReleaseInput,
  acted: boolean,
  outcome: string,
  stillAlive: boolean,
  /**
   * What this release was, when it was not a kill, in a few words for the row and the change log.
   * The one caller is the path that closes a row whose process was already gone, and the row has to
   * carry that: "released" alone reads as "something was stopped".
   */
  becauseItWasAlreadyGone?: string,
): ReleaseResult {
  const note = [
    input.note?.trim(),
    becauseItWasAlreadyGone,
    input.force === true ? 'forced while the session was still running' : null,
  ]
    .filter((s): s is string => s !== undefined && s !== null && s !== '')
    .join('; ')
  const releasedAt = now()
  const releasedBy = `${input.actor.type}:${input.actor.id}`
  sqlite
    .prepare('UPDATE session_resources SET released_at = ?, released_by = ?, release_note = ? WHERE id = ?')
    .run(releasedAt, releasedBy, note === '' ? null : note, entry.id)

  logChange(
    entry.sessionRecordId,
    'delete',
    input.actor,
    `resource.${entry.type}`,
    `${entry.key} — ${entry.detail}`,
    `released: ${outcome}${note === '' ? '' : ` [${note}]`}`,
  )

  // AND THE WORLD, when this was the last process serving it. Criterion C3.
  aWorldEndsWhenNothingIsServingIt(entry, note === '' ? outcome : note)

  return {
    resource: { ...entry, releasedAt, releasedBy, releaseNote: note === '' ? null : note },
    acted,
    outcome,
    stillAlive,
  }
}

/**
 * THE GIT COMMANDS THE OFFICE RUNS, and it runs no other. Every one only reads.
 *
 * `status` is the Runtime page's answer to whether the office's own checkout is dirty (criterion G2, `checkout`
 * above). It is the one read that compares files in a work tree, so a filter of that checkout can run, and it is never
 * asked of a sandbox's repository. `for-each-ref` is the worker-run door's answer to whether a branch or tag of a
 * sandbox's repository reaches the commit a worker is to be cut from (worker-runs.ts). `check-attr` reads which files
 * a filter or a line-ending conversion changes, for the seal's own comparison of files. The other eleven are the reads
 * of the seal, the check before it, the merge queue and the inspection, in sealed-tip.ts, before-the-seal.ts,
 * merge-queue.ts, merge-state-machine.ts and inspection.ts, and the worker-run door reads with rev-parse and
 * symbolic-ref too. A command is added here only when a new read needs it, in the same commit.
 */
export const GIT_READS = [
  'cat-file', 'check-attr', 'diff', 'diff-tree', 'for-each-ref', 'log', 'ls-files', 'ls-tree', 'merge-base', 'patch-id',
  'rev-list', 'rev-parse', 'status', 'symbolic-ref',
] as const

/**
 * WHAT ONE GIT READ MAY TAKE, unless its caller asks for other limits: the bytes a pipe of it may hold, and the time it
 * may run. A read that prints more than `bytes` ends with ENOBUFS, and one that runs longer than `ms` with ETIMEDOUT.
 */
export const A_GIT_READS_LIMITS = { bytes: 64 * 1024 * 1024, ms: 30_000 } as const

/**
 * THE OFFICE'S ONE GIT READER. Every git process the server starts is started here, or by `readGitAsync` below, which
 * starts the same process, or by `readThePatchIdsOfALog` below, which starts a `git log` and a `git patch-id` with the
 * same check, the same guard and the same limits.
 *
 * It always runs `git <the guard's options> --literal-pathspecs -C <directory>`, so git reads the checkout it was
 * named and treats a path as a path, never as a pattern. The first argument must be one of `GIT_READS`, and anything
 * else is refused before a process starts. The other arguments are the caller's, because they name commits and paths that change with each
 * read. No shell is involved. It throws when git cannot run or exits with anything but 0, and the caller says what
 * that means for its own question.
 *
 * MOST OF THESE READS ARE OF A REPOSITORY A SANDBOXED RUN CAN WRITE, so every one is started with the guard of
 * src/config/guarded-git.mjs, and starts no program that repository chose. `workTree` pins the work tree to the folder
 * the caller means, whatever core.worktree in the repository says.
 */
export function readGit(directory: string, args: string[], options: GitReadOptions = {}): Buffer {
  const read = aGitRead(directory, args, options)
  return execFileSync('git', read.args, {
    ...read.options,
    ...(options.input === undefined ? {} : { input: options.input }),
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

/**
 * THE SAME READ AS `readGit`, AND THE SERVER ANSWERS OTHER REQUESTS WHILE GIT RUNS. The same check of the command, the
 * same guard and the same limits. It rejects where `readGit` throws, and the error carries `status` and `stderr` as
 * `readGit`'s does, so `whyGitDidNotAnswer` says the same of both.
 */
export async function readGitAsync(directory: string, args: string[], options: GitReadOptions = {}): Promise<Buffer> {
  const read = aGitRead(directory, args, options)
  return await new Promise<Buffer>((resolve, reject) => {
    const child = execFile('git', read.args, { ...read.options, encoding: 'buffer', windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) resolve(stdout)
      else reject(Object.assign(error, { status: typeof error.code === 'number' ? error.code : null, stdout, stderr }))
    })
    // A git that ends before it has read all of its input closes the pipe. `readGit` passes over that too, and how git
    // ended is what the callback above says.
    child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') reject(error)
    })
    child.stdin?.end(options.input)
  })
}

/**
 * THE PATCH-IDS OF A PATCH LOG THAT MAY BE LARGER THAN ONE GIT READ MAY HOLD. It runs the `git log -p` that
 * `thePatchIdsOf` (sealed-tip.ts) builds, with its output going to a file in a new private folder under the operating
 * system's temporary folder. Then it runs `git patch-id --stable` with that file as its input, and answers what
 * patch-id prints. So neither process's output is held whole in memory, and a log of any size is read.
 *
 * It is for this one pair of reads only. Both are checked against `GIT_READS` and started with the guard, as every read
 * of `readGit` is. Each keeps `readGit`'s limits: `A_GIT_READS_LIMITS.ms` to run, and `A_GIT_READS_LIMITS.bytes` for
 * what a pipe still holds, which is patch-id's output and each process's stderr. No shell is involved. It throws as
 * `readGit` does, with `status` and `stderr`, so `whyGitDidNotAnswer` says what went wrong. The folder is removed in
 * every case, also when git fails.
 */
export function readThePatchIdsOfALog(directory: string, log: string[]): Buffer {
  if (log[0] !== 'log') throw new Error(`The patch log reader runs only a git log, and was given ${JSON.stringify(log[0] ?? null)}.`)
  const theLog = aGitRead(directory, log, {})
  const thePatchIds = aGitRead(directory, ['patch-id', '--stable'], {})
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-patch-log-'))
  try {
    const file = join(folder, 'log')
    const written = openSync(file, 'wx', 0o600)
    try {
      execFileSync('git', theLog.args, { ...theLog.options, stdio: ['ignore', written, 'pipe'], windowsHide: true })
    } finally {
      closeSync(written)
    }
    const read = openSync(file, 'r')
    try {
      return execFileSync('git', thePatchIds.args, { ...thePatchIds.options, stdio: [read, 'pipe', 'pipe'], windowsHide: true })
    } finally {
      closeSync(read)
    }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

export type GitReadOptions = { input?: string; maxBuffer?: number; timeoutMs?: number; workTree?: string }

/** One read's arguments and limits, after its command is checked against `GIT_READS`. */
function aGitRead(directory: string, args: string[], options: GitReadOptions): { args: string[]; options: { env: NodeJS.ProcessEnv; maxBuffer: number; timeout: number } } {
  const command = args[0]
  if (command === undefined || !(GIT_READS as readonly string[]).includes(command)) {
    throw new Error(
      `git ${command === undefined ? 'with no command' : JSON.stringify(command)} was not started, because the office's git reader runs only ${GIT_READS.join(', ')}.`,
    )
  }
  return {
    args: guardedGitArguments(directory, args, {
      before: ['--literal-pathspecs'],
      ...(options.workTree === undefined ? {} : { workTree: options.workTree }),
    }),
    options: { env: guardedGitEnvironment(), maxBuffer: options.maxBuffer ?? A_GIT_READS_LIMITS.bytes, timeout: options.timeoutMs ?? A_GIT_READS_LIMITS.ms },
  }
}

export { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'

/**
 * A FOLDER HELD OPEN BELOW `root`, NO LINK FOLLOWED ON THE WAY DOWN, for a caller that acts on a file inside a folder
 * somebody else can change: lib/key-files.ts removes a revoked key's file through it,
 * and lib/the-office-writes-into-a-sandbox.ts creates a brief in a sandbox's briefs folder through it.
 *
 * `root` is the caller's own folder, and may be reached through a link of the machine's own. Below it each part of
 * `parts` is opened inside the folder already held, and a part that is a link or no folder is refused. What `use` is
 * handed then names a file inside the real folder, wherever the folder's path leads by now: a folder swapped for a link
 * after the caller looked cannot turn what it does onto a file anywhere else.
 *
 * HERE, IN THE OPERATING-SYSTEM LAYER, because the way to hold a folder is the machine's own (A7): Linux names a folder
 * held open /proc/self/fd/<n>, and Node has no openat or unlinkat to do it without that. A port holds it with openat.
 *
 * `use` is handed the name of the held folder itself too, so a caller can ask where the folder is by now:
 * lib/the-office-writes-into-a-sandbox.ts writes nothing when its real path is not the one the caller opened.
 *
 * Answers what `use` answers, or `{ notHeld }` with why the folder could not be held: 'a link' when a part is a link or
 * no folder, otherwise the error's code. A name `use` asks for with a slash in it, or `.` or `..`, is refused by throwing.
 */
export function inAFolderHeldOpen<T>(
  root: string,
  parts: readonly string[],
  use: (inside: (name: string) => string, itself: string) => T,
  platform: string = process.platform,
): T | { notHeld: string } {
  // ON A MAC, NOTHING IS HELD AND NOTHING IS DONE. A Mac has no /proc/self/fd, and whether its /dev/fd names a file inside a
  // folder held open has not been measured, so the caller is told why and acts on nothing. Wave 13t, round 21.
  if (platform !== 'linux') return { notHeld: `${platform} has no /proc/self/fd to hold a folder open by, so nothing was done` }
  let held: number
  try {
    held = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY)
  } catch (err) {
    return { notHeld: String((err as NodeJS.ErrnoException).code ?? err) }
  }
  try {
    for (const part of parts) {
      if (part === '' || part === '.' || part === '..' || part.includes('/')) return { notHeld: 'not a part of a path' }
      let next: number
      try {
        next = openSync(`/proc/self/fd/${String(held)}/${part}`, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW)
      } catch (err) {
        const code = String((err as NodeJS.ErrnoException).code ?? err)
        return { notHeld: code === 'ENOTDIR' || code === 'ELOOP' ? 'a link' : code }
      }
      closeSync(held)
      held = next
    }
    const folder = held
    return use((name) => {
      if (name === '' || name === '.' || name === '..' || name.includes('/')) throw new Error(`"${name}" is not the name of a file in a folder.`)
      return `/proc/self/fd/${String(folder)}/${name}`
    }, `/proc/self/fd/${String(folder)}`)
  } finally {
    closeSync(held)
  }
}

