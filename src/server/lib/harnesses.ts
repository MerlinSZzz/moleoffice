// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT TOOLS THE OFFICE RUNS, HOW EACH IS INSTALLED, AND WHICH VERSION IS NEWEST. Wave 13u, round 3.
 *
 * The office offers ready-made harness work at point 2 of a decision, such as installing the chosen harnesses
 * with one press and checking for upgrades. A harness here is one agent tool the
 * office starts work in: Claude Code, Codex, OpenCode, Kimi, and dsh.
 *
 * WHAT THE OFFICE DOES AND DOES NOT DO (design report 6NVaDzG7tyUB, block b-5). The office ships none of these
 * programs. It runs each vendor's own installer, unchanged, in a terminal the person can see, in the person's
 * home. It never collects or stores a login: each person signs in to the unmodified program with their own
 * account. Nothing here reads a key, passes a key or runs a login command. Since wave 13u round 242 the person may
 * also type a key that the office gives to the tool's own login on standard input and drops, or press a sign-in that
 * starts the tool's own: both are in ./setting-up-an-agent-tool.ts, with the reading of whether a tool is signed in.
 *
 * THIS FILE IS THE ONE DECLARATION. Each entry names its program, its official install command with the
 * vendor's page that states it, and where its newest version is read. Every install command was read on the
 * vendor's own page on 4 October 2026, and the line it was read from is quoted beside it. A harness whose
 * vendor names no installer the office can run has `install: null` and the reason, and the page says so.
 * No install command here was written from memory.
 *
 * A PROGRAM IS FOUND IN THE WHOLE ENVIRONMENT IT RUNS WITH. Its search path is read by `theSearchPathIn` of this
 * system (src/config/systems/the-system.mjs): on Windows the one name that is PATH in any case, and elsewhere `PATH`
 * alone. The key a kept version is held under is made from the same reading.
 */

import { realpathSync, statSync } from 'node:fs'
import type { HarnessListing, HarnessReading, NewestVersion, Newer, NoInstallCode, ProgramVersion } from '@shared/harnesses.ts'
import { THE_PROGRAM_FOR_RUNTIME, whereIsThisTool } from '../../config/runtimes.mjs'
import { thisSystem } from '../../config/systems/the-system.mjs'
import { FULL_PERMISSIONS } from '../../config/run-permissions.mjs'
import { settingValue } from '../../config/settings.mjs'
import { osProbe } from './resources.ts'
import type { AgentToolSetupRefusalCode, HarnessRefusalCode } from '@shared/refusal-codes.ts'
import { theHomeNamedIn, theHomeVariable } from '../../config/the-paths-of-a-system.mjs'
import { THE_FIRST_SIZE } from '../../config/the-terminal-holder.mjs'
import { PanelError } from './panel-error.ts'
import { askTheHolderFor, theEnvironmentATerminalGets, theHolder, type TerminalReading } from './terminals.ts'

/** The program the office starts dsh as, from src/config/run-permissions.mjs, which starts it. */
function theProgramDshIsStartedAs(): string {
  const dsh = FULL_PERMISSIONS['dsh']
  if (dsh === undefined) throw new Error('src/config/run-permissions.mjs no longer names the program dsh is started as, so the harness list cannot name it.')
  return dsh.program
}


/** Where a harness's newest version is read: the version its vendor publishes as the newest of one package. */
export type NewestFrom = { registry: 'npm'; package: string } | { registry: 'pypi'; package: string }

export interface Harness {
  /** The runtime word the office uses for it. */
  id: string
  /** Its name, as its vendor writes it. A name, so it is not translated. */
  name: string
  /** The program it installs, which the office starts. */
  program: string
  /** The vendor's own install command for macOS and Linux, and the page that states it; or null and why. */
  install: { command: string; source: string; read: string } | null
  noInstall: { code: NoInstallCode; says: string } | null
  newest: NewestFrom
  /**
   * WHERE ITS ACCOUNT SIGN-IN SENDS THE PERSON, and the page that states it with the day it was read there: a device
   * page the office answers itself, or the one host an address the tool prints must have
   * (./setting-up-an-agent-tool.ts). Null for a tool the office starts no account sign-in for.
   */
  signIn: { devicePage: string; source: string; read: string } | { host: string; source: string; read: string } | null
}

/**
 * THE HARNESSES, IN THE ORDER THE INSTALLER RUNS THEM.
 *
 * The program of each of the first four is THE_PROGRAM_FOR_RUNTIME in src/config/runtimes.mjs, the map the
 * adapters are checked against; dsh's is the one src/config/run-permissions.mjs starts.
 */
export const THE_HARNESSES: readonly Harness[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    program: THE_PROGRAM_FOR_RUNTIME['claude-code'],
    // https://code.claude.com/docs/en/setup, read 2026-10-04, tab "Native Install (Recommended)":
    //   "**macOS, Linux, WSL:**  curl -fsSL https://claude.ai/install.sh | bash"
    install: { command: 'curl -fsSL https://claude.ai/install.sh | bash', source: 'https://code.claude.com/docs/en/setup', read: '2026-10-04' },
    noInstall: null,
    // The same page: "The npm package installs the same native binary as the standalone installer."
    //   npm install -g @anthropic-ai/claude-code
    newest: { registry: 'npm', package: '@anthropic-ai/claude-code' },
    // https://code.claude.com/docs/en/network-config, read 2026-11-22, table "Network access requirements":
    //   "`claude.com` | claude.ai account sign-in opens a `claude.com` page in the browser, which redirects to `claude.ai`"
    signIn: { host: 'claude.com', source: 'https://code.claude.com/docs/en/network-config', read: '2026-11-22' },
  },
  {
    id: 'codex',
    name: 'Codex',
    program: THE_PROGRAM_FOR_RUNTIME.codex,
    // https://github.com/openai/codex README, read 2026-10-04, "Installing and running Codex CLI":
    //   "Run the following on Mac or Linux to install Codex CLI:  curl -fsSL https://chatgpt.com/codex/install.sh | sh"
    install: { command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh', source: 'https://github.com/openai/codex', read: '2026-10-04' },
    noInstall: null,
    // The same README: "Codex CLI can also be installed via the following package managers: ... npm install -g @openai/codex"
    newest: { registry: 'npm', package: '@openai/codex' },
    // Its device sign-in, `codex login --device-auth`. Its page https://learn.chatgpt.com/docs/auth, read 2026-11-22, says
    // "Open the link in your browser, sign in, then enter the one-time code" and gives no address. Its own source gives it,
    // read the same day: codex-rs/login/src/device_code_auth.rs, `verification_url: format!("{base_url}/codex/device")`,
    // where base_url is the issuer, and codex-rs/login/src/server.rs, `DEFAULT_ISSUER: &str = "https://auth.openai.com"`.
    signIn: { devicePage: 'https://auth.openai.com/codex/device', source: 'https://github.com/openai/codex/blob/main/codex-rs/login/src/device_code_auth.rs', read: '2026-11-22' },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    program: THE_PROGRAM_FOR_RUNTIME.opencode,
    // https://opencode.ai/docs/, read 2026-10-04: "The easiest way to install OpenCode is through the install script."
    //   curl -fsSL https://opencode.ai/install | bash
    install: { command: 'curl -fsSL https://opencode.ai/install | bash', source: 'https://opencode.ai/docs/', read: '2026-10-04' },
    noInstall: null,
    // The same page: "Alternatively, you can install it using npm" (npm install -g opencode-ai).
    newest: { registry: 'npm', package: 'opencode-ai' },
    signIn: null,
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    program: THE_PROGRAM_FOR_RUNTIME.kimi,
    // NO INSTALL COMMAND, ON THE VENDOR'S WORD. The office's adapter (src/worker/runtimes/kimi.ts) runs Moonshot's
    // kimi-cli from PyPI. https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html, read 2026-10-04:
    //   "Kimi CLI is archived and should no longer be installed. Install Kimi Code CLI instead:
    //    curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"
    // Kimi Code CLI is a different program that installs a binary of the same name, and the adapter was not
    // measured against it, so its installer is not offered here as Kimi's. Whether the office moves to it is
    // not this file's to decide.
    install: null,
    noInstall: {
      code: 'vendorArchivedIt',
      says:
        'Moonshot has archived Kimi CLI, the program the office runs, and says it should no longer be installed ' +
        '(https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html, read 4 October 2026). Its successor, ' +
        'Kimi Code CLI, is a different program the office has not been checked against, so it is not installed here.',
    },
    newest: { registry: 'pypi', package: 'kimi-cli' },
    signIn: null,
  },
  {
    id: 'dsh',
    name: 'dsh (DeepSeek Harness)',
    program: theProgramDshIsStartedAs(),
    // NO INSTALL COMMAND. https://github.com/deepseek-ai/deepseek-harness, read 2026-10-04, says
    //   "Install `Node.js`, then run: `npx @deepseek-ai/dsh web`"
    // which runs its web page once rather than installing the program, and the office runs dsh through a profile
    // of its own that is installed separately (tools/dsh-hooks/install-profile.mjs).
    install: null,
    noInstall: {
      code: 'installedSeparately',
      says:
        'dsh is installed separately: its vendor names no installer for the program, and the office runs it with a ' +
        'profile of its own (tools/dsh-hooks/install-profile.mjs).',
    },
    newest: { registry: 'npm', package: '@deepseek-ai/dsh' },
    signIn: null,
  },
]

/** One harness by its id, or undefined. */
export function theHarness(id: string): Harness | undefined {
  return THE_HARNESSES.find((one) => one.id === id)
}

// ------------------------------------------------------------------------------ the newest version

/** The vendors' own registries. MOLE_OFFICE_HARNESS_REGISTRY replaces both origins, for a test only. */
const THE_REGISTRIES = { npm: 'https://registry.npmjs.org', pypi: 'https://pypi.org' } as const

/** How long one read of a registry may take before it is called unanswered. */
const A_REGISTRY_MUST_ANSWER_WITHIN_MS = 5_000

/** How long a version read is kept, and how long a failed read is kept before it is tried again. */
const A_READ_IS_KEPT_MS = 60 * 60 * 1000
const A_FAILED_READ_IS_KEPT_MS = 60 * 1000

const kept = new Map<string, { until: number; answer: NewestVersion }>()
const readingNewest = new Map<string, Promise<NewestVersion>>()

/** An answer and the time of an expired read shown while it is being read again. */
type VersionReading<T> = { answer: T; beingReadAgain: string | null }

/** Where the newest version of one package is read. */
function theAddressOf(newest: NewestFrom): string {
  const set = settingValue('MOLE_OFFICE_HARNESS_REGISTRY')
  const origin = (set ?? THE_REGISTRIES[newest.registry]).replace(/\/$/, '')
  // A SCOPED npm NAME KEEPS ITS @ AND HAS ITS SLASH WRITTEN %2F, which is how the npm registry is asked for one.
  if (newest.registry === 'npm') return `${origin}/${newest.package.replace('/', '%2F')}/latest`
  return `${origin}/pypi/${encodeURIComponent(newest.package)}/json`
}

/** The version in a registry's answer, or null when the answer does not hold one where the registry puts it. */
function theVersionInTheAnswer(newest: NewestFrom, body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  if (newest.registry === 'npm') {
    const version = (body as { version?: unknown }).version
    return typeof version === 'string' && version !== '' ? version : null
  }
  const info = (body as { info?: { version?: unknown } }).info
  return typeof info?.version === 'string' && info.version !== '' ? info.version : null
}

/**
 * THE NEWEST VERSION ITS VENDOR PUBLISHES, read from the registry with a short timeout and kept for an hour.
 * Offline, refused, slow or an answer with no version in it is `read: false` with the reason: never a guess,
 * and never a version read earlier and since let go. The first read is waited for. A kept answer past its time
 * is answered at once with its own `readAt` in `beingReadAgain`, and one read of the registry starts behind it.
 */
async function theNewestReading(newest: NewestFrom, now: () => number = Date.now): Promise<VersionReading<NewestVersion>> {
  const from = theAddressOf(newest)
  const was = kept.get(from)
  if (was !== undefined) {
    if (was.until > now()) return { answer: was.answer, beingReadAgain: null }
    if (!readingNewest.has(from)) {
      const reading = readTheNewestVersion(newest, from, now).finally(() => { readingNewest.delete(from) })
      readingNewest.set(from, reading)
    }
    return { answer: was.answer, beingReadAgain: was.answer.readAt }
  }
  return { answer: await readTheNewestVersion(newest, from, now), beingReadAgain: null }
}

/** Read a registry and replace what was kept, including when the new read fails. */
async function readTheNewestVersion(newest: NewestFrom, from: string, now: () => number): Promise<NewestVersion> {
  const readAt = new Date(now()).toISOString()
  const failed = (why: string): NewestVersion => ({ read: false, version: null, from, why, readAt })
  let answer: NewestVersion
  try {
    const res = await fetch(from, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(A_REGISTRY_MUST_ANSWER_WITHIN_MS) })
    if (!res.ok) {
      answer = failed(`${from} answered ${String(res.status)}.`)
    } else {
      const version = theVersionInTheAnswer(newest, await res.json().catch(() => null))
      answer = version === null ? failed(`${from} answered without a version where the registry puts one.`) : { read: true, version, from, readAt }
    }
  } catch (err) {
    const name = (err as { name?: string }).name
    answer = failed(
      name === 'TimeoutError'
        ? `${from} did not answer within ${String(A_REGISTRY_MUST_ANSWER_WITHIN_MS / 1000)} seconds.`
        : `${from} could not be reached: ${err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err)}.`,
    )
  }
  kept.set(from, { until: now() + (answer.read ? A_READ_IS_KEPT_MS : A_FAILED_READ_IS_KEPT_MS), answer })
  return answer
}

/** Forget every newest version read. For a test. */
export function forgetTheNewestVersions(): void {
  kept.clear()
}

// ------------------------------------------------------------------------------ comparing

/** The first version number in a line a program printed, such as "2.1.211 (Claude Code)" or "codex-cli 0.160.0". */
const A_VERSION = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/


/**
 * WHETHER A NEWER VERSION THAN THE INSTALLED ONE EXISTS. 'yes' only when both were read, both hold a version
 * number, and the newest is the larger. Two pre-releases of one version, such as 1.0.0-rc.1 and 1.0.0-beta.2,
 * are not compared: their order is the vendor's, and the answer is 'unknown'.
 */
export function isANewerOneOut(installed: ProgramVersion, newest: NewestVersion): Newer {
  if (installed.path === null) return { answer: 'unknown', why: 'notInstalled' }
  if (!installed.versionWasRead) return { answer: 'unknown', why: 'installedUnread' }
  if (!newest.read) return { answer: 'unknown', why: 'newestUnread' }
  const a = A_VERSION.exec(installed.version)
  const b = A_VERSION.exec(newest.version)
  if (a === null || b === null) return { answer: 'unknown', why: 'notAVersion' }
  for (const i of [1, 2, 3]) {
    const x = Number(a[i])
    const y = Number(b[i])
    if (y > x) return { answer: 'yes' }
    if (y < x) return { answer: 'no' }
  }
  const pa = a[4] ?? null
  const pb = b[4] ?? null
  if (pa === pb) return { answer: 'no' }
  // A RELEASE COMES AFTER ITS OWN PRE-RELEASES.
  if (pa !== null && pb === null) return { answer: 'yes' }
  if (pa === null && pb !== null) return { answer: 'no' }
  return { answer: 'unknown', why: 'cannotCompare' }
}

// ------------------------------------------------------------------------------ the installed version, kept

/**
 * HOW LONG AN INSTALLED VERSION IS FRESH, even while its program's file has not changed.
 *
 * Asking `opencode --version` took 317 ms on every read of the list, and the Terminals page waited for it. A
 * program's version changes only when its file does, so a read is kept while the file the PATH finds is the same
 * file: the same real path, inode, size, time of change and time of status change. An installer that writes a
 * new file changes at least the inode or the status time. After ten minutes a request returns that read with its
 * time and asks the program again behind the answer. This also checks a launcher whose upgrade changes another
 * file without touching the launcher. A changed or missing file is always probed before answering.
 */
const AN_INSTALLED_VERSION_IS_KEPT_MS = 10 * 60 * 1000

const keptVersions = new Map<string, { until: number; file: string; answer: ProgramVersion; readAt: string }>()
const readingInstalled = new Map<string, Promise<void>>()

/** Which file a program is, as far as a change of version can tell, or null when the search path finds none. */
function theFileOf(program: string, env: Readonly<Record<string, string>>): string | null {
  const where = whereIsThisTool(program, env)
  if (where === null) return null
  try {
    const real = realpathSync(where)
    const stat = statSync(real)
    return [real, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':')
  } catch {
    // Handled: the file went away between finding it and reading it. Nothing is kept; the probe is asked.
    return null
  }
}

/** A kept installed version while its file is unchanged, with one read behind it when it has expired. */
async function theInstalledVersion(
  probe: ReturnType<typeof osProbe>,
  program: string,
  env: Readonly<Record<string, string>>,
): Promise<VersionReading<ProgramVersion>> {
  if (probe.theVersionOfAProgram === undefined) {
    return {
      answer: {
        path: null,
        version: `the probe installed for this read (${probe.platform}) cannot read a program's version, so none was read`,
        versionWasRead: false,
      },
      beingReadAgain: null,
    }
  }
  const key = `${program}\n${thisSystem().theSearchPathIn(env) ?? ''}`
  const file = theFileOf(program, env)
  const held = keptVersions.get(key)
  if (held !== undefined && file !== null && held.file === file) {
    if (held.until > Date.now()) return { answer: held.answer, beingReadAgain: null }
    if (!readingInstalled.has(key)) {
      const readAt = new Date().toISOString()
      // Record the read before asking the probe, including a probe that throws before returning a promise.
      const reading = (async () => {
        await Promise.resolve()
        try {
          const answer = await probe.theVersionOfAProgram!(program, env)
          // A request may have found a changed file and replaced or forgotten this read while the probe ran.
          if (keptVersions.get(key) !== held) return
          if (answer.versionWasRead) keptVersions.set(key, { until: Date.now() + AN_INSTALLED_VERSION_IS_KEPT_MS, file, answer, readAt })
          else keptVersions.delete(key)
        } catch (err) {
          if (keptVersions.get(key) === held) keptVersions.delete(key)
          console.warn(`The version of ${program} could not be read again: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          readingInstalled.delete(key)
        }
      })()
      readingInstalled.set(key, reading)
    }
    return { answer: held.answer, beingReadAgain: held.readAt }
  }
  // A different or missing file cannot be answered by the version kept for the old file.
  keptVersions.delete(key)
  const readAt = new Date().toISOString()
  const answer = await probe.theVersionOfAProgram(program, env)
  // ONLY A VERSION THAT WAS READ IS KEPT. A program that did not answer is asked again next time.
  if (file !== null && answer.versionWasRead) keptVersions.set(key, { until: Date.now() + AN_INSTALLED_VERSION_IS_KEPT_MS, file, answer, readAt })
  else keptVersions.delete(key)
  return { answer, beingReadAgain: null }
}

/** Forget every installed version read. For a test. */
export function forgetTheInstalledVersions(): void {
  keptVersions.clear()
}

/** Wait for the reads started behind harness answers. For a test. */
export async function waitForTheHarnessReads(): Promise<void> {
  await Promise.all([...readingNewest.values(), ...readingInstalled.values()])
}

// ------------------------------------------------------------------------------ the list

/**
 * EVERY HARNESS: installed or not and its version, on the PATH of `env`, and the newest version. A version is
 * the kept read while the program's file is unchanged. Expired kept reads answer at once with their read times
 * and are read again behind the answer. First reads and changed files are waited for. Only a request starts a read.
 */
export async function readTheHarnesses(env: Readonly<Record<string, string>>): Promise<HarnessReading[]> {
  const probe = osProbe()
  return Promise.all(
    THE_HARNESSES.map(async (one) => {
      const [installed, newest] = await Promise.all([theInstalledVersion(probe, one.program, env), theNewestReading(one.newest)])
      return {
        ...theListingOf(one), installed: installed.answer, newest: newest.answer,
        newer: isANewerOneOut(installed.answer, newest.answer),
        beingReadAgain: { installed: installed.beingReadAgain, newest: newest.beingReadAgain },
      }
    }),
  )
}

/**
 * EVERY HARNESS AS THE DECLARATION ABOVE STATES IT, and nothing read: no program is asked its version and no
 * registry its newest. Wave 13x round 12: the first whole read after a start took 658 ms, and the Terminals page
 * drew none of its rows until it came back. The page draws these at once and fills in the versions from the whole read.
 */
export function listTheHarnesses(): HarnessListing[] {
  return THE_HARNESSES.map(theListingOf)
}

/** The part of a reading the declaration alone answers. */
function theListingOf(one: Harness): HarnessListing {
  return { id: one.id, name: one.name, program: one.program, install: one.install, noInstall: one.noInstall }
}

// ------------------------------------------------------------------------------ the installer's script

/** A string as one single-quoted word of a POSIX shell. */
function quoted(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/**
 * THE SCRIPT THE INSTALLER'S TERMINAL RUNS, for harnesses already checked to have an install command. Each
 * official command runs in turn, after a line saying which it is; a failure is said and the next one runs.
 * At the end it tells the person to sign in to each program themselves. It runs no login command, reads no
 * key and passes none.
 */
export function theInstallScript(harnesses: readonly Harness[]): string {
  const lines: string[] = ['failed=0']
  harnesses.forEach((one, at) => {
    if (one.install === null) throw new Error(`${one.name} has no install command, and the script was asked to run one.`)
    const n = `${String(at + 1)} of ${String(harnesses.length)}`
    lines.push(
      `printf '\\n%s\\n%s\\n%s\\n\\n' ${quoted(`== Mole Office: installing ${one.name} (${n}) with its vendor's own installer:`)} ${quoted(`   ${one.install.command}`)} ${quoted(`   (stated on ${one.install.source})`)}`,
      one.install.command,
      `code=$?`,
      `if [ "$code" -eq 0 ]; then printf '\\n%s\\n' ${quoted(`== ${one.name}: the installer finished.`)}; else failed=1; printf '\\n%s\\n' ${quoted(`== ${one.name}: the installer ended with exit code`)}" $code."; fi`,
    )
  })
  const programs = harnesses.map((one) => one.program).join(', ')
  lines.push(
    `printf '\\n%s\\n%s\\n%s\\n' ${quoted('== Sign in yourself. Start each program in a terminal, and it asks you to sign in with your own account:')} ${quoted(`   ${programs}`)} ${quoted('   Mole Office does not sign in for you, and it does not see or keep your login. A program installed just now may need a new terminal before it is found.')}`,
    'exit $failed',
  )
  return lines.join('\n')
}

/**
 * A refusal of the install press or of setting up a tool (./setting-up-an-agent-tool.ts), with its code, so the panel
 * draws it in its own language. A refusal whose words take values is built where it is thrown.
 */
export function aHarnessRefusal(
  code: HarnessRefusalCode | Exclude<AgentToolSetupRefusalCode, 'harnessKeyLoginNotThisVersion'>,
  sentence: string,
  status = 400,
  reason?: string,
): PanelError {
  return new PanelError(sentence, status, undefined, undefined, reason, { code, values: {} })
}

/**
 * THE HARNESSES A PRESS NAMED, each checked against the declaration, in the declaration's order and each once,
 * whatever order the press sent them in. Throws in words before anything opens.
 */
export function theHarnessesAsked(names: readonly string[]): Harness[] {
  if (names.length === 0) throw aHarnessRefusal('harnessNoneTicked', 'No agent tool was ticked, so nothing was installed.')
  const asked = new Set<string>()
  for (const name of names) {
    const one = theHarness(name)
    if (one === undefined) {
      throw aHarnessRefusal(
        'harnessUnknown',
        `"${name}" is not an agent tool the office runs; they are ${THE_HARNESSES.map((h) => h.id).join(', ')}. Nothing was installed.`,
      )
    }
    if (one.install === null) throw aHarnessRefusal('harnessHasNoInstaller', `${one.name} has no install command here: ${one.noInstall?.says ?? ''} Nothing was installed.`)
    asked.add(one.id)
  }
  return THE_HARNESSES.filter((one) => asked.has(one.id))
}

/** The shell the installers run in. Every vendor's command here is written for a POSIX shell. */
const THE_SHELL = '/bin/sh'

/**
 * OPEN THE ONE TERMINAL THAT INSTALLS THEM, as the person, in the person's home, through the terminal holder as
 * POST /api/terminals does. Called by the install press once everyone its readiness checklist names has signed.
 */
export async function openTheInstallTerminal(chosen: readonly Harness[], personId: string, workspaceId: string): Promise<{ terminal: TerminalReading; installing: string[] }> {
  const env = theEnvironmentATerminalGets()
  // HOME, and USERPROFILE on Windows, which usually sets no HOME (src/config/the-paths-of-a-system.mjs).
  const home = theHomeNamedIn(env)
  if (home === null) {
    throw aHarnessRefusal('harnessNoHome', `This server has no ${theHomeVariable()}, so there is no home to install in. Nothing was installed.`)
  }
  await theHolder()
  const answer = await askTheHolderFor({
    op: 'open',
    who: { kind: 'person', id: personId },
    agent: null,
    project: workspaceId,
    command: THE_SHELL,
    args: ['-c', theInstallScript(chosen)],
    folder: home,
    env,
    cols: THE_FIRST_SIZE.cols,
    rows: THE_FIRST_SIZE.rows,
    // A TERMINAL THE PERSON OPENS, so what is typed into the installers is kept, as in every other (YLv8grhgilBV, point 1).
    keeping: true,
  })
  return { terminal: answer['terminal'] as TerminalReading, installing: chosen.map((one) => one.id) }
}
