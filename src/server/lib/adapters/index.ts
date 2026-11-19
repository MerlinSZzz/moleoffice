// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADAPTER LIST, AND THE REAL MACHINE.
 *
 * Adding support for a second agent tool means writing one file next to claude-code.ts and adding
 * it to ADAPTERS below. Nothing in sessions.ts or api/sessions.ts mentions Claude Code by name,
 * so nothing there has to change.
 *
 * This file is also where the real machine is assembled into an AdapterEnv -- the home directory,
 * the clock, the process table. Everything else takes that AdapterEnv, which is why the tests can
 * describe a whole machine (a directory of transcripts, a fixed clock, a process list with
 * nothing in it) and get an answer that does not depend on what happens to be running.
 *
 * IT NO LONGER READS THE OPERATING SYSTEM ITSELF. This file used to walk /proc on every
 * `GET /api/sessions`, which made Mole Office's process table a second interface to the machine
 * standing beside `OsProbe` in lib/resources.ts. It now asks the installed probe, through
 * `currentProcessTable` in os.ts, so `useOsProbe` swaps the machine for the session list as well
 * as for the resource ledger. `homedir()` below is the one machine fact still read here, and the
 * note on `defaultEnv` says why that one is not worth a method on the probe.
 */

// OS BOUNDARY EXCEPTION: homedir() is the one machine fact read outside OsProbe, because it says
// where the tools keep their files rather than what the machine is doing, and Node answers it the
// same way on every operating system — so a method on the probe would cost a porter a method and
// buy nobody anything. Tests override it through `AdapterEnv.homeDir`, never by faking the module.
// The full argument is on `defaultEnv` at the foot of this file.
import { homedir } from 'node:os'
import { isMainThread } from 'node:worker_threads'
import { settingNamed, settingValue, settingWasSet } from '../../../config/settings.mjs'
import type { AdapterEnv, SessionAdapter } from './types.ts'
import { currentProcessTable } from './os.ts'
import { claudeCodeAdapter } from './claude-code.ts'

export * from './types.ts'
export { claudeCodeAdapter, CLAUDE_CODE_TOOL, resumeCommandFor, toLocalStamp } from './claude-code.ts'
// The process table, re-exported so `adapters/index.ts` stays the one front door to this directory.
// `readLinuxProcessTable` is the body of `LINUX_PROBE.processTable()`; call it through the probe.
export {
  currentProcessTable,
  readLinuxProcessTable,
  useProcessTableSource,
  type ProcessTableSource,
} from './os.ts'

/** Every tool Mole Office can read sessions of. One entry per adapter file. */
export const ADAPTERS: readonly SessionAdapter[] = [claudeCodeAdapter]

/** The adapter for a tool name, or null when nothing here can read that tool's sessions. */
export function adapterFor(tool: string): SessionAdapter | null {
  return ADAPTERS.find((a) => a.tool === tool) ?? null
}

// ---------------------------------------------------------------------------- the thresholds

/**
 * THE TWO NUMBERS THE SESSIONS PAGE IS BUILT ON, AND WHY THEY ARE CONFIGURATION.
 *
 * Both are judgements, not measurements, so they are named, written down in .env.example, and
 * settable per machine rather than compiled in. They live here — next to nothing else — because
 * every state the page shows is derived from them, and a reader who wants to argue with the
 * words on that page should have exactly one place to argue with.
 *
 *   MOLE_OFFICE_IDLE_AFTER    quiet this long and a session with a live process reads as `idle`
 *   MOLE_OFFICE_ORPHAN_AFTER  quiet this long with NO process and it reads as `orphaned`
 *
 * Five minutes is longer than a slow tool call and shorter than a person's attention: a session
 * quiet for six minutes is one worth glancing at.
 *
 * Two hours replaced six. Six was chosen on the argument that `unknown` in the meantime is an
 * honest answer, so being late costs nothing — but that is only true of the WORD. An orphan
 * holding a GPU, a port or a database file for six hours is six hours of a contended resource
 * that nobody knew was gone, which is the incident this project keeps having. See explore.md.
 */
/** The variables, named once so every message below spells them the same way. */
export const IDLE_AFTER_VAR = 'MOLE_OFFICE_IDLE_AFTER'
export const ORPHAN_AFTER_VAR = 'MOLE_OFFICE_ORPHAN_AFTER'

/** The default the declaration states for a setting, refusing to invent one if it states none. */
function declaredFallback(name: string): string {
  const declared = settingNamed(name).fallback
  if (declared === null) {
    throw new Error(`src/config/settings.mjs declares no default for ${name}, and this reader needs one.`)
  }
  return declared
}

// The two defaults are the declaration's, not a second opinion about them. They were written out
// here as '5m' and '2h' while src/config/settings.mjs said the same two things, and .env.example
// said them a third time: three places that had to agree with nothing making them agree.
export const DEFAULT_IDLE_AFTER = declaredFallback(IDLE_AFTER_VAR)
export const DEFAULT_ORPHAN_AFTER = declaredFallback(ORPHAN_AFTER_VAR)

const DURATION = /^(\d+)(s|m|h|d)$/

/** Seconds in one unit, or null for a letter this reader does not know. */
function unitSeconds(unit: string): number | null {
  switch (unit) {
    case 's':
      return 1
    case 'm':
      return 60
    case 'h':
      return 60 * 60
    case 'd':
      return 24 * 60 * 60
    default:
      return null
  }
}

/**
 * "30s", "5m", "2h", "1d" as a number of seconds.
 *
 * A bare number is REFUSED rather than read as seconds. `MOLE_OFFICE_ORPHAN_AFTER=2` is far more
 * likely to mean two hours than two seconds, and a wrong guess here does not look wrong: it
 * quietly relabels every session on the page. Where the value is ambiguous, so is the answer,
 * and the honest response is to stop and ask.
 *
 * Throws a plain Error rather than a PanelError: nothing here has an HTTP status, because this
 * runs at startup where there is no request to fail.
 */
export function parseDuration(raw: string, variable: string): number {
  const text = raw.trim()
  const match = DURATION.exec(text)
  if (!match) {
    throw new Error(
      `${variable} is "${raw}", which is not a duration. Write a whole number and one of ` +
        `s, m, h or d — for example ${variable}=5m (also valid: 30s, 2h, 1d). Mole Office will not ` +
        'start on a value it would have to guess at, because a threshold that quietly reverted to ' +
        'its default would make every state on the sessions page wrong without anything looking wrong.',
    )
  }
  const [, digits, unit] = match
  // The regex matched, so both groups are there and the unit is one of the four. Checked rather
  // than asserted: noUncheckedIndexedAccess is on, and a cast here would be the one place in this
  // file where the type system was told something instead of shown it.
  const per = unit === undefined ? null : unitSeconds(unit)
  if (digits === undefined || per === null) {
    throw new Error(`${variable} could not be read from "${raw}", which the duration pattern should have caught.`)
  }
  const amount = Number(digits)
  if (amount === 0) {
    throw new Error(
      `${variable} is "${raw}", which is zero. A threshold of zero is crossed the instant a session ` +
        'stops writing, so every session would sit on the far side of it permanently and the state ' +
        `would carry no information. Set a real duration, for example ${variable}=5m.`,
    )
  }
  return amount * per
}

/** The effective thresholds, and where each of them came from. */
export interface Thresholds {
  idleAfterSeconds: number
  orphanAfterSeconds: number
  /** The duration as it was written, e.g. "5m". Kept for the startup line. */
  idleAfter: string
  orphanAfter: string
  /** False means nothing was set and the built-in default above is in use. */
  idleConfigured: boolean
  orphanConfigured: boolean
}

/**
 * Read both thresholds out of an environment, or refuse to run.
 *
 * Takes the environment as an argument rather than reaching for `process.env`, so the failures
 * can be tested without a malformed variable taking the test runner down with it.
 */
export function readThresholds(env: Record<string, string | undefined>): Thresholds {
  const rawIdle = env[IDLE_AFTER_VAR]
  const rawOrphan = env[ORPHAN_AFTER_VAR]
  const idleAfter = rawIdle ?? DEFAULT_IDLE_AFTER
  const orphanAfter = rawOrphan ?? DEFAULT_ORPHAN_AFTER

  const idleAfterSeconds = parseDuration(idleAfter, IDLE_AFTER_VAR)
  const orphanAfterSeconds = parseDuration(orphanAfter, ORPHAN_AFTER_VAR)

  // The ladder in claude-code.ts asks "still recent?" before it asks "quiet long enough to be
  // abandoned?", so an orphan threshold at or below the idle one deletes the middle band — the
  // one that answers `unknown` because it is too long to call running and too soon to call
  // abandoned. The states would still be produced, so nothing would look broken; the page would
  // just stop ever saying "cannot tell yet". That is worth stopping for.
  if (orphanAfterSeconds <= idleAfterSeconds) {
    throw new Error(
      `${ORPHAN_AFTER_VAR} is "${orphanAfter}" (${orphanAfterSeconds}s) and ${IDLE_AFTER_VAR} is ` +
        `"${idleAfter}" (${idleAfterSeconds}s). The orphan threshold must be longer than the idle one: ` +
        'a session has to be able to be quiet-but-not-yet-abandoned, and with these two values it ' +
        'never can be.',
    )
  }

  return {
    idleAfterSeconds,
    orphanAfterSeconds,
    idleAfter,
    orphanAfter,
    idleConfigured: rawIdle !== undefined,
    orphanConfigured: rawOrphan !== undefined,
  }
}

/** The startup line. One sentence, both numbers, and whether either was set on this machine. */
export function describeThresholds(t: Thresholds): string {
  const where = (configured: boolean, variable: string) =>
    configured ? `set by ${variable}` : `built-in default, override with ${variable}`
  return (
    `session thresholds: idle after ${t.idleAfter} (${t.idleAfterSeconds}s, ${where(t.idleConfigured, IDLE_AFTER_VAR)}); ` +
    `orphaned after ${t.orphanAfter} (${t.orphanAfterSeconds}s, ${where(t.orphanConfigured, ORPHAN_AFTER_VAR)})`
  )
}

/**
 * The thresholds this process is running with, read once.
 *
 * Read at import rather than per request on purpose. A malformed value stops the server here,
 * at startup, with the variable named — which is the only moment anybody is looking. Read
 * lazily, the same mistake would surface as a 500 from whichever page happened to be opened
 * first, hours later.
 */
export const THRESHOLDS: Thresholds = readThresholds({
  // src/config/settings.mjs is the only reader of `.env` and of a MOLE_OFFICE_ variable in this
  // repository, so the values arrive from there. A setting nobody set is passed as undefined rather
  // than as its default, because `readThresholds` reports which of the two somebody chose and
  // handing it the default would make every start say the operator had configured it.
  [IDLE_AFTER_VAR]: settingWasSet(IDLE_AFTER_VAR) ? (settingValue(IDLE_AFTER_VAR) ?? undefined) : undefined,
  [ORPHAN_AFTER_VAR]: settingWasSet(ORPHAN_AFTER_VAR) ? (settingValue(ORPHAN_AFTER_VAR) ?? undefined) : undefined,
})

/** How long a session with a live process may be quiet before it reads as idle. Seconds. */
export const IDLE_AFTER_SECONDS = THRESHOLDS.idleAfterSeconds

/** How long a session with no process may be quiet before it reads as orphaned. Seconds. */
export const ORPHAN_AFTER_SECONDS = THRESHOLDS.orphanAfterSeconds

/**
 * Say the effective values out loud, once per process, from its main thread.
 *
 * They change what the sessions page CLAIMS, so they belong in the record of what this server is
 * doing — "why did it call that orphaned" is answerable from the log or it is not answerable.
 *
 * `console` rather than Fastify's logger because this module is imported before the server object
 * exists, and is also loaded by scripts and tests that have no logger at all. The marker lives on
 * globalThis rather than in a module variable so that "once" survives a module registry reset —
 * the test runner re-imports this file for every test file, and once means once.
 *
 * A THREAD SAYS NOTHING. A worker thread has a globalThis of its own, so the marker does not
 * reach it, and the search thread loads this file too. A thread's line reaches the process's
 * output after whatever the main thread printed meanwhile, so a program whose last line was its
 * answer had the thresholds printed after it.
 */
const ANNOUNCED = Symbol.for('mole-office.thresholds.announced')

function announceThresholds(): void {
  if (!isMainThread) return
  const flags = globalThis as unknown as Record<symbol, boolean | undefined>
  if (flags[ANNOUNCED] === true) return
  flags[ANNOUNCED] = true
  console.info(describeThresholds(THRESHOLDS))
}

announceThresholds()

// ---------------------------------------------------------------------------- the real machine

/**
 * The real machine, with the process table read at most once however many sessions ask for it.
 *
 * The memo is not only about speed. One sweep asks "is this alive?" about every session on the
 * machine, and re-reading the process table between two of those questions would answer them
 * against different moments — so a list could show one session as running under a pid that another
 * line of the same list had already decided was gone.
 *
 * THE PROCESS TABLE COMES FROM THE PROBE, NOT FROM /proc. `currentProcessTable` asks whichever
 * `OsProbe` is installed, so `useOsProbe(fake)` in lib/resources.ts changes what the session list
 * reports. That is what makes session discovery testable against a machine that does not exist,
 * and it is why nothing in this directory reads /proc except os.ts, which IS the probe's Linux
 * implementation of that one method.
 *
 * `homedir()` is the exception and stays here on purpose. It is where the tools keep their state
 * rather than a fact about what the machine is doing, Node answers it the same way on every
 * operating system, and a port would not have to write anything for it — so a method on `OsProbe`
 * would cost a porter a method and buy nobody anything. Tests override it through `homeDir`.
 */
/**
 * WHERE THIS PERSON'S OWN FILES LIVE, for the two callers that need to name a directory under it.
 *
 * IT IS HERE AND NOT WHERE IT IS USED, because this file holds the one permit for `homedir()`. A caller
 * that wants the home directory asks this rather than importing `node:os`, and the boundary stays
 * one file wide.
 *
 * THE SECOND CALLER IS THE PREVIEW BOUNDARY, from 6 September 2026: the built-in preview roots are
 * this product's checkout and `~/.cache/mole-office`, which is where CLAUDE.md tells every agent to
 * put a screenshot. Criterion M54 — a report whose pictures were written by the rules could not be
 * read, because the boundary had never heard of that directory. src/server/api/files.ts has the
 * account.
 */
export function theHomeDirectory(): string {
  return homedir()
}

export function defaultEnv(overrides: Partial<AdapterEnv> = {}): AdapterEnv {
  let cached: ReturnType<typeof currentProcessTable> | null = null
  return {
    homeDir: homedir(),
    now: new Date(),
    scanProcesses: () => (cached ??= currentProcessTable()),
    runningWithinSeconds: IDLE_AFTER_SECONDS,
    orphanAfterSeconds: ORPHAN_AFTER_SECONDS,
    ...overrides,
  }
}
