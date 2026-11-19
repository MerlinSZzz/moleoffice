// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE macOS PROBE: the OsProbe chosen when this server runs on macOS.
 *
 * `theProbeForThisPlatform` in lib/resources.ts builds it, and only for the platform 'darwin'. On
 * Linux nothing here runs.
 *
 * NOT YET RUN ON A MAC. Every reader below was written from the documented output of macOS `ps` and
 * `lsof`. Its tests (tests/darwin-probe.test.ts) feed it the fixtures in tests/fixtures/macos/, which
 * are written in the documented formats, each with its source. Until a Mac joins and those fixtures
 * are replaced by a recording, nobody has seen it read a real Mac.
 *
 * WHAT IT READS ITSELF, AND WHAT IT BORROWS.
 *
 * macOS has no /proc. So the questions about processes and sockets are answered here from `ps` and
 * `lsof`: one process, a process group, the whole process table, one process's facts, and the
 * listening ports. Every other method answers the same way on macOS as on Linux (git, docker, the
 * GPU, lock files, the machine's name and addresses, the agent tools' keys, starting the message
 * worker and the overdue hand-back reader's helper, signalling a process group, stopping a container), so it is handed to the Linux probe's
 * own method rather than copied. `theProbeForThisPlatform` passes in a Linux probe that is allowed
 * to run on macOS for that purpose; this class hands it only the methods named in `BorrowedByTheMac`.
 * The checkout reading is handed on with one difference: git is not started when the only git is
 * Apple's stand-in with no developer tools behind it (`whyGitWouldAskToBeInstalled`).
 *
 * WHAT IT LEAVES OUT, ON PURPOSE. The interface lets a probe leave a method out, and a caller then
 * refuses in words naming the probe. This probe leaves out:
 *   - `pidNamespaceOf` and `containerFirstProcess`: macOS has no Linux pid namespaces, and a docker
 *     container on a Mac runs inside a Linux virtual machine whose pids are not this machine's;
 *   - `senderOfAConnection` outside the installed Mac app. Inside that app it recognises only its
 *     own window's network helper: the exact socket, its uid, its executable and its parent's
 *     executable must all match. A Docker proxy or another local program is never inferred to be
 *     the person. This lets the first-run name and the pairing press work in the installed window
 *     without opening the keyless route to containers (lib/from-a-sandbox.ts). It then says
 *     `findsOnlyTheAppsOwnWindow`, so the sentence about pairing names the window and not a browser.
 *   - `sweepCheckWorktrees`: tools/live-processes.mjs, which it relies on, reads /proc. Left out,
 *     the server keeps every check worktree and says so.
 *
 * NO COMMAND IS STARTED IN THIS FILE, AND NO `ps` LINE IS READ HERE. The macOS process reader in
 * src/config/process-reader.mjs runs `ps` and `lsof` and reads their lines; the service lock, the
 * worker and the session hook read processes through the same reader. lib/resources.ts hands it in.
 * A test hands in a reader over its own commands, which is what lets it drive every method here.
 */

import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { localStamp } from '@shared/time.ts'
import { THE_INSTALL } from '../../config/settings.mjs'
import type { TheSystem } from '../../config/runtimes.mjs'
import {
  type darwinProcessReader,
  lsofFields,
  namesByProcess,
  nothingMatched,
  type PsProcess,
  whyItDidNotAnswer,
  type WhatACommandDid,
} from '../../config/process-reader.mjs'
import { PanelError } from './panel-error.ts'
// Type-only, and so erased: this file takes nothing from lib/resources.ts at run time, because
// lib/resources.ts imports this file to build the probe.
import type { OsCheckout, OsPort, OsProbe, OsProcess, OsSender, ProcessFacts } from './resources.ts'
import type { ProcessInfo } from './adapters/types.ts'
import type { ProcessScan } from './adapters/types.ts'

export type { WhatACommandDid }

/** The macOS process reader this probe reads through: src/config/process-reader.mjs. */
export type DarwinProcessReader = ReturnType<typeof darwinProcessReader>

/**
 * The methods this probe hands to the Linux probe, because they do not read /proc. The checkout
 * reading is handed a reason not to start git when this Mac's only git would ask to be installed.
 */
export type SharedWithLinux = Pick<OsProbe, 'startTheRestartCommand' | 'startTheDataFolderMover' | 'runAvatarCodec'> & {
  checkout(root: string, options?: { gitCannotRun?: string }): OsCheckout
} & Pick<
  Required<OsProbe>,
  | 'gpu'
  | 'containers'
  | 'locks'
  | 'machineName'
  | 'ownAddresses'
  | 'whatAnAgentToolSaysAboutItsKey'
  | 'startTheMessageWorker'
  | 'tmuxPanes'
  | 'killProcessGroup'
  | 'stopContainer'
  | 'theVersionOfAProgram'
>

/**
 * What this probe borrows: the methods above, and the overdue hand-back reader's helper. The helper is the Mac's alone,
 * because on Windows the merges read takes the synchronous reader and starts no helper.
 */
export type BorrowedByTheMac = SharedWithLinux & Pick<Required<OsProbe>, 'startTheOverdueHandBackHelper'>

/** What the check for Apple's stand-in git reads: the environment and the file system. */
export interface TheMacsGit {
  /** PATH and DEVELOPER_DIR, read when asked. */
  environment(): { PATH?: string | undefined; DEVELOPER_DIR?: string | undefined }
  isFile(path: string): boolean
  /** The path with every link followed, or null when it does not exist. */
  realPath(path: string): string | null
}

/** This Mac's own environment and files. */
export const THIS_MACS_GIT: TheMacsGit = {
  environment: () => ({ PATH: process.env['PATH'], DEVELOPER_DIR: process.env['DEVELOPER_DIR'] }),
  isFile: (path) => {
    try {
      return statSync(path).isFile()
    } catch {
      return false
    }
  },
  realPath: (path) => {
    try {
      return realpathSync(path)
    } catch {
      return null
    }
  },
}

/** Apple's stand-in. It runs the git of the developer folder, and asks to install one when there is none. */
export const APPLES_STAND_IN_GIT = '/usr/bin/git'

/**
 * WHY GIT WOULD ASK TO BE INSTALLED, in words, or null when git may be started.
 *
 * On a Mac without Apple's command-line developer tools, `/usr/bin/git` is a stand-in: started, it
 * puts up a system prompt asking the person to install the tools. The server reads whether the
 * checkout has changes nobody committed with `git status` on every reply's world, so on such a Mac
 * every reply would raise that prompt again. So the probe looks first, starting nothing:
 *
 *   - the first `git` on PATH is the one a start would run. If there is none, or it is not Apple's
 *     stand-in once its links are followed (Homebrew's, say), git may be started;
 *   - the stand-in runs the git in the developer folder: DEVELOPER_DIR when it is set, and otherwise
 *     the folder `xcode-select` chose (/var/db/xcode_select_link), the command-line tools' folder or
 *     Xcode's. If one of those holds `usr/bin/git`, git may be started;
 *   - otherwise git is needed and is not there, and the words say so and how to install it.
 *
 * NOT YET SEEN ON A MAC. This follows Apple's documented `xcode-select` layout; the round's report
 * gives the Mac agent the steps to try it on a Mac without the tools.
 */
export function whyGitWouldAskToBeInstalled(root: string, mac: TheMacsGit = THIS_MACS_GIT): string | null {
  const { PATH, DEVELOPER_DIR } = mac.environment()
  const found = (PATH ?? '').split(':').filter((dir) => dir !== '').map((dir) => join(dir, 'git')).find((path) => mac.isFile(path))
  if (found === undefined || mac.realPath(found) !== APPLES_STAND_IN_GIT) return null
  const chosen = DEVELOPER_DIR !== undefined && DEVELOPER_DIR !== '' ? [DEVELOPER_DIR] : [
    mac.realPath('/var/db/xcode_select_link'),
    '/Library/Developer/CommandLineTools',
    '/Applications/Xcode.app/Contents/Developer',
  ].filter((dir): dir is string => dir !== null)
  if (chosen.some((dir) => mac.isFile(join(dir, 'usr', 'bin', 'git')))) return null
  return (
    `git is needed to say whether ${root} has changes nobody committed, and it was not started: the only git on PATH is ` +
    `${found}, Apple's stand-in, which would ask you to install the command-line developer tools, because no developer ` +
    `folder holds a git (looked in ${chosen.join(', ')}). Install them with xcode-select --install, or put another git ` +
    'first on PATH; the next reply reads the checkout again.'
  )
}

/**
 * ONE PROCESS AS THE PROBE REPORTS IT, from one line the macOS reader read.
 *
 * THE START TIME IS GOOD TO ONE SECOND ON macOS, because `lstart` carries whole seconds. It is written
 * through `localStamp`, the helper the Linux probe writes with, which also keeps whole seconds. Two
 * reads of one process therefore give the same string, which the ledger needs: it compares start
 * stamps as exact strings to tell a process from a later one given the same pid.
 *
 * `directoryChangedAt` is left out. It exists only to recognise ledger rows stamped by an old Linux
 * reader, and no such row was ever written on a Mac.
 */
export function anOsProcess(row: PsProcess): OsProcess {
  return { pid: row.pid, ppid: row.ppid, pgid: row.pgid, command: row.command, startedAt: localStamp(row.startedAt) }
}

/**
 * THE LISTENING SOCKETS IN `lsof -nP -iTCP -sTCP:LISTEN -Fptn` OUTPUT.
 *
 * The name is `address:port`. lsof writes an IPv6 address in square brackets and an address bound to
 * every interface as `*`, which is read as 0.0.0.0 or ::, the words the Linux probe uses. Whether
 * `*` is IPv4 or IPv6 is in the type field (`t`), which is why `t` is asked for.
 *
 * ONE ROW PER SOCKET. A socket held by several processes (a server that forked) is listed once per
 * process; it is kept once, with the lowest pid, which is usually the one that opened it.
 */
export function listenersFromLsof(text: string): OsPort[] {
  const found = new Map<string, OsPort>()
  for (const proc of lsofFields(text)) {
    for (const file of proc.files) {
      if (file.name === undefined) continue
      const protocol = file.type === 'IPv4' ? 'tcp' : file.type === 'IPv6' ? 'tcp6' : null
      if (protocol === null) {
        throw new Error(`lsof listed ${JSON.stringify(file.name)} with the type ${JSON.stringify(file.type ?? null)}, not IPv4 or IPv6`)
      }
      const at = file.name.lastIndexOf(':')
      const portText = file.name.slice(at + 1)
      if (at === -1 || !/^\d+$/.test(portText)) {
        throw new Error(`lsof listed a listening socket this reader cannot read: ${JSON.stringify(file.name)}`)
      }
      const host = file.name.slice(0, at)
      const address = host === '*' ? (protocol === 'tcp' ? '0.0.0.0' : '::') : host.replace(/^\[(.*)\]$/, '$1')
      const port = Number(portText)
      const key = `${protocol} ${address} ${port}`
      const held = found.get(key)
      if (held === undefined || (held.pid !== null && proc.pid < held.pid)) found.set(key, { port, address, protocol, pid: proc.pid })
    }
  }
  return [...found.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol))
}

/**
 * WHETHER AN OPEN FILE IS A DATABASE FILE, for both probes. This is the one place the rule is
 * written: the Linux probe in resources.ts imports it, so the two probes cannot name different
 * files as databases.
 *
 * The write-ahead log (-wal) and the shared-memory file (-shm) are the same database as the file
 * beside them, so only the database file itself counts. Listing all three would read as three
 * databases.
 */
export function isADatabaseFile(name: string): boolean {
  return /\.(db|sqlite3?)$/.test(name)
}

/** The database files a list of open file names holds, each once, in order. */
function databasesAmong(names: readonly string[]): string[] {
  const out: string[] = []
  for (const name of names) {
    if (!isADatabaseFile(name)) continue
    if (!out.includes(name)) out.push(name)
  }
  return out.sort()
}

// ============================================================================ the probe

export class DarwinProbe implements OsProbe {
  readonly platform = 'darwin'

  readonly senderOfAConnection?: OsProbe['senderOfAConnection']
  readonly findsOnlyTheAppsOwnWindow?: true

  /** The `lsof` the reader runs, for the questions about files and sockets. */
  private readonly lsof: (args: readonly string[]) => WhatACommandDid

  constructor(
    private readonly shared: BorrowedByTheMac,
    private readonly reader: DarwinProcessReader,
    install: Pick<typeof THE_INSTALL, 'from' | 'root'> = THE_INSTALL,
    private readonly macsGit: TheMacsGit = THIS_MACS_GIT,
  ) {
    this.lsof = reader.commands.lsof
    const contents = resolve(install.root, '../..')
    // Only the Mac app layout supplies a window we can identify. A checkout or a loose bundle
    // keeps the previous refusal; an arbitrary same-user process is not proof of the person.
    if (install.from === 'bundle' && basename(contents) === 'Contents' && basename(dirname(contents)).endsWith('.app') &&
        resolve(install.root) === join(contents, 'Resources', 'office')) {
      this.senderOfAConnection = (peer, ours) => this.senderInTheWindow(peer, ours, contents)
      this.findsOnlyTheAppsOwnWindow = true
    }
  }

  /** The kernel's connection owner, only when it is this installation's own window helper. */
  private senderInTheWindow(
    peer: { address: string; port: number },
    ours: { address: string; port: number },
    contents: string,
  ): OsSender | null {
    const address = (one: string): string => one.startsWith('::ffff:') ? one.slice(7) : one
    const host = (one: string): string => one.includes(':') ? `[${one}]` : one
    const peerAddress = address(peer.address)
    const ourAddress = address(ours.address)
    if (![peerAddress, ourAddress].every((one) => one === '127.0.0.1' || one === '::1')) return null
    if (![peer.port, ours.port].every((one) => Number.isInteger(one) && one > 0 && one <= 65535)) return null
    const connection = `${host(peerAddress)}:${peer.port}->${host(ourAddress)}:${ours.port}`
    const did = this.lsof(['-nP', '-a', `-iTCP:${peer.port}`, '-sTCP:ESTABLISHED', '-Fpuftn'])
    if (!did.ran || did.status !== 0) return null
    const owners = new Map<number, number>()
    let pid: number | null = null
    for (const line of did.stdout.split('\n')) {
      if (/^p\d+$/.test(line)) pid = Number(line.slice(1))
      else if (pid !== null && /^u\d+$/.test(line)) owners.set(pid, Number(line.slice(1)))
    }
    const matches = lsofFields(did.stdout).filter((one) => one.files.some((file) => file.name === connection))
    if (matches.length !== 1) return null
    const found = matches[0]!
    const uid = owners.get(found.pid)
    if (uid === undefined || uid !== process.getuid?.()) return null
    const helper = join(contents, 'Frameworks', 'Mole Office Helper.app', 'Contents', 'MacOS', 'Mole Office Helper')
    if (this.reader.executableOf(found.pid) !== helper) return null
    const parent = this.reader.parentOf(found.pid)
    if (parent === null || this.reader.executableOf(parent) !== join(contents, 'MacOS', 'Mole Office')) return null
    // lsof and ps are separate snapshots. Check again after the executable reads: a process
    // that ended or was reparented during them proves nothing on this connection.
    if (this.reader.parentOf(found.pid) !== parent) return null
    const again = this.lsof(['-nP', '-a', '-p', String(found.pid), `-iTCP:${peer.port}`, '-sTCP:ESTABLISHED', '-Fpuftn'])
    if (!again.ran || again.status !== 0 || !again.stdout.split('\n').includes(`u${uid}`) ||
        !lsofFields(again.stdout).some((one) => one.pid === found.pid && one.files.some((file) => file.name === connection))) return null
    return { uid, pid: found.pid, inAnotherContainer: false }
  }

  processById(pid: number): OsProcess | null {
    let row: PsProcess | null
    try {
      row = this.reader.psRow(pid)
    } catch (err) {
      throw new PanelError(
        `${(err as Error).message}. Mole Office will not report process ${pid} as gone, and will not signal a process it cannot read.`,
        500,
      )
    }
    return row === null ? null : anOsProcess(row)
  }

  /** Every process on the machine, from one `ps` call. It throws rather than answer an empty table. */
  private everyProcess(): OsProcess[] {
    return this.reader.everyProcess().map(anOsProcess)
  }

  processesInGroup(pgid: number): OsProcess[] {
    let all: OsProcess[]
    try {
      all = this.everyProcess()
    } catch (err) {
      // An empty list would say the group has no process left, and a release would describe a
      // signal that reaches nothing.
      throw new PanelError(`The processes in group ${pgid} are unknown: ${(err as Error).message}.`, 500)
    }
    return all.filter((one) => one.pgid === pgid).sort((a, b) => a.pid - b.pid)
  }

  /**
   * THE WHOLE PROCESS TABLE, with each process's working directory.
   *
   * The commands come from `ps -axo` and the directories from `lsof -a -d cwd -Fpn`. A process lsof
   * gives no directory for (another user's, as a rule) has `cwd: null`, the partial answer the Linux
   * table gives too. When either command gives no answer at all, the table is `{ok:false, reason}`:
   * without the directories no running agent can be tied to its project.
   */
  processTable(): ProcessScan {
    let all: OsProcess[]
    try {
      all = this.everyProcess()
    } catch (err) {
      return { ok: false, reason: (err as Error).message }
    }
    const did = this.lsof(['-a', '-d', 'cwd', '-Fpn'])
    if (!did.ran || (did.status !== 0 && did.stdout.trim() === '')) {
      return {
        ok: false,
        reason: `the working directories of the processes on this machine could not be read: ${whyItDidNotAnswer(did)}`,
      }
    }
    let cwds: Map<number, string[]>
    try {
      cwds = namesByProcess(did.stdout)
    } catch (err) {
      return { ok: false, reason: `the working directories could not be read: ${(err as Error).message}` }
    }
    const processes: ProcessInfo[] = all.map((one) => ({
      pid: one.pid,
      command: one.command,
      cwd: cwds.get(one.pid)?.[0] ?? null,
    }))
    return { ok: true, processes }
  }

  /**
   * WHO STARTED ONE PROCESS, WHERE IT RUNS AND WHICH DATABASES IT HOLDS OPEN.
   *
   * As on Linux, each part that could not be read is named in `couldNotRead` and the rest is still
   * answered. Two parts differ from Linux:
   *   - whether the working directory was deleted is read by looking for the directory on disk,
   *     because lsof on macOS does not mark a deleted directory the way Linux does;
   *   - the environment is not read, so `databaseAsked` is null and `couldNotRead` says why. An empty
   *     environment would read as "nothing set MOLE_OFFICE_DB", which nobody looked at.
   */
  processFacts(pid: number): ProcessFacts | null {
    const self = this.processById(pid)
    if (self === null) return null
    const couldNotRead: string[] = []

    let parent: OsProcess | null = null
    try {
      parent = this.processById(self.ppid)
    } catch (err) {
      couldNotRead.push(`the parent, pid ${self.ppid}, could not be read (${(err as Error).message})`)
    }

    let workingDirectory: string | null = null
    let workingDirectoryDeleted = false
    const cwd = this.lsof(['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    let named: string | undefined
    try {
      named = cwd.ran && cwd.status === 0 ? namesByProcess(cwd.stdout).get(pid)?.[0] : undefined
    } catch {
      named = undefined
    }
    if (named === undefined) {
      couldNotRead.push(`the working directory could not be read (${whyItDidNotAnswer(cwd)})`)
    } else {
      workingDirectory = named
      try {
        statSync(named)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') workingDirectoryDeleted = true
        else couldNotRead.push(`whether the working directory still exists could not be read (${String(code)})`)
      }
    }

    let openDatabases: string[] = []
    const files = this.lsof(['-p', String(pid), '-Fn'])
    let names: string[] | undefined
    try {
      names = files.ran && files.status === 0 ? namesByProcess(files.stdout).get(pid) : undefined
    } catch {
      names = undefined
    }
    if (names === undefined) {
      couldNotRead.push(
        `the open files could not be listed (${whyItDidNotAnswer(files)}), so no database can be named`,
      )
    } else {
      openDatabases = databasesAmong(names)
    }

    couldNotRead.push('this probe does not read the environment of a process on macOS, so MOLE_OFFICE_DB is unknown')

    return {
      pid,
      parentPid: self.ppid,
      parent,
      workingDirectory,
      workingDirectoryDeleted,
      openDatabases,
      databaseAsked: null,
      couldNotRead,
    }
  }

  /**
   * EVERY LISTENING TCP SOCKET lsof SHOWS, IPv4 AND IPv6, with the process holding it.
   *
   * lsof run as an ordinary user lists only that user's own processes, so a port another user's
   * process holds is not in this list at all. On Linux it would be, with `pid: null`.
   */
  listeningPorts(): OsPort[] {
    const did = this.lsof(['-nP', '-iTCP', '-sTCP:LISTEN', '-Fptn'])
    if (nothingMatched(did)) return []
    if (!did.ran || did.status !== 0) {
      throw new PanelError(`The listening ports are unknown: ${whyItDidNotAnswer(did)}.`, 500)
    }
    try {
      return listenersFromLsof(did.stdout)
    } catch (err) {
      throw new PanelError(`The listening ports are unknown: ${(err as Error).message}.`, 500)
    }
  }

  ownProcessGroup(): number {
    const self = this.processById(process.pid)
    if (self === null) {
      throw new PanelError('Mole Office could not read its own process group, so it will not signal anything.', 500)
    }
    return self.pgid
  }

  // ---------------------------------------------------------------- handed to the Linux probe

  /** The Linux probe's reading, told not to start git when this Mac's only git would ask to be installed. */
  checkout(root: string) {
    const gitCannotRun = whyGitWouldAskToBeInstalled(root, this.macsGit)
    return this.shared.checkout(root, gitCannotRun === null ? {} : { gitCannotRun })
  }
  gpu() {
    return this.shared.gpu()
  }
  containers() {
    return this.shared.containers()
  }
  locks(paths: readonly string[]) {
    return this.shared.locks(paths)
  }
  machineName() {
    return this.shared.machineName()
  }
  ownAddresses() {
    return this.shared.ownAddresses()
  }
  whatAnAgentToolSaysAboutItsKey(which: 'claude-code' | 'codex' | 'opencode', system?: TheSystem) {
    return this.shared.whatAnAgentToolSaysAboutItsKey(which, system)
  }
  startTheRestartCommand(input: { cwd: string; logPath: string; env: NodeJS.ProcessEnv }) {
    if (!this.shared.startTheRestartCommand) throw new Error('The macOS probe has no service restart command door.')
    return this.shared.startTheRestartCommand(input)
  }

  /** The data folder mover starts as on Linux, in a group of its own and without reading /proc. */
  startTheDataFolderMover(input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }) {
    if (!this.shared.startTheDataFolderMover) throw new Error('The macOS probe has no data folder mover door.')
    return this.shared.startTheDataFolderMover(input)
  }

  runAvatarCodec(input: Parameters<NonNullable<OsProbe['runAvatarCodec']>>[0]) {
    if (this.shared.runAvatarCodec === undefined) throw new Error('The installed OS probe cannot run the avatar codec.')
    return this.shared.runAvatarCodec(input)
  }

  startTheMessageWorker(input: { args: readonly string[]; cwd: string; logPath: string }) {
    return this.shared.startTheMessageWorker(input)
  }
  /**
   * The overdue hand-back reader's helper starts as on Linux: node, detached into a group of its own, with no
   * /proc read. Without it the reader answered unavailable on a Mac, and the merges read answered 503.
   */
  startTheOverdueHandBackHelper(script: string) {
    return this.shared.startTheOverdueHandBackHelper(script)
  }
  tmuxPanes(format: string) {
    return this.shared.tmuxPanes(format)
  }
  killProcessGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    this.shared.killProcessGroup(pgid, signal)
  }
  stopContainer(name: string): void {
    this.shared.stopContainer(name)
  }
  /** Finds the program on the PATH and asks it `--version`; neither step reads /proc. Wave 13t, round 21. */
  theVersionOfAProgram(program: string, env: Readonly<Record<string, string>>) {
    return this.shared.theVersionOfAProgram(program, env)
  }
}
