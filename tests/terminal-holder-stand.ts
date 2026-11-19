// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE TERMINAL HOLDER'S TESTS SHARE: A PLACE OF THEIR OWN, A HOLDER, A SCRATCH SERVER, AND THE WAY
 * EACH OF THEM IS STOPPED. Wave 13u, round 1.
 *
 * THE FILES THAT USE THIS are the ones that import it, and a search of tests/ for its import line lists them. No
 * list of them is kept here, because a list here goes out of date and nothing fails when it does.
 *
 * A PLACE IS A FOLDER UNDER TEST_DATABASE_PREFIX, made by mkdtemp. It holds the database path and a home
 * folder `h`, and a config folder `c` unless the socket under it would not fit in a Unix socket's 107 bytes,
 * when the config folder is made under /tmp instead, and the place's `everyFolder` names it beside `dir`.
 * Every program started here is given XDG_CONFIG_HOME and HOME in those folders, so the holder's socket
 * (src/config/the-terminal-holder.mjs) is under one of them too, and can never be the live office's.
 *
 * EVERY PROCESS IS STARTED DETACHED, in a process group of its own, and its group id is written into
 * `groups` the moment it is known. A terminal's process leads a group of its own as well (the pty
 * library starts it as a session leader), so every terminal pid a test sees goes into `groups` too.
 * `stopEverything` sends SIGTERM to each group, waits up to fifteen seconds, then sends SIGKILL to any
 * group still there. Nothing is stopped by its name. It removes only the folders made here.
 *
 * A STAND-IN SOCKET is not a process. It listens in the test's own process, in front of a holder, and
 * `stopEverything` closes it before it stops the groups (`startAnOlderHolder`).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, rmSync } from 'node:fs'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import headless from '@xterm/headless'
import { askTheHolder, theLongestSocketPathBytes, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { databasePathFrom } from '../src/config/settings.mjs'
import {
  TEST_DATABASE_PREFIX,
  ThePortWasTaken,
  anotherServerAnswered,
  apiServerArguments,
  devStackEnvironment,
  retryWhenAPortWasTaken,
  saysThePortWasTaken,
} from './helpers.ts'

const { Terminal } = headless

export const REPO = fileURLToPath(new URL('..', import.meta.url))
export const THE_HOLDER = join(REPO, 'src', 'holder', 'index.mjs')

/** Every process group a test started or saw. */
export const groups = new Set<number>()
/** Every folder a test made here. */
export const folders = new Set<string>()

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Whether a process is there, read from /proc. */
export function isAlive(pid: number): boolean {
  return existsSync(`/proc/${String(pid)}`)
}

/** Whether any process of a group is still there: signal 0 to the group asks without sending anything. */
export function groupIsAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/** Ask again and again for up to `ms`, until `ready` says yes; the last answer either way. */
export async function until<T>(what: () => Promise<T> | T, ready: (value: T) => boolean, ms = 15_000): Promise<T> {
  const deadline = Date.now() + ms
  let last = await what()
  while (!ready(last) && Date.now() < deadline) {
    await sleep(100)
    last = await what()
  }
  return last
}

export interface Place {
  dir: string
  database: string
  config: string
  home: string
  /** XDG_CONFIG_HOME and HOME: the config folder, which holds the holder's socket, and the home folder in `dir`. */
  env: { XDG_CONFIG_HOME: string; HOME: string }
  socket: string
  log: string
  /**
   * `dir`, and the config folder as well when it was made under /tmp. The holder's socket and log are in the config
   * folder, so a test that looks at every file the place holds walks each of these and not `dir` alone.
   */
  everyFolder: string[]
}

/**
 * A folder of this test's own, with a database path and a home in it, and a config folder in it unless the
 * socket would not fit there.
 */
export function aPlace(name: string): Place {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'h')
  const database = join(dir, 'office.db')
  let config = join(dir, 'c')
  let env = { XDG_CONFIG_HOME: config, HOME: home }
  let socket = theTerminalHolderSocket(database, env)
  const everyFolder = [dir]
  const longest = theLongestSocketPathBytes()
  // WHY THE CONFIG FOLDER MAY BE UNDER /tmp: the holder's socket is under XDG_CONFIG_HOME, and a Unix
  // socket's path may be at most 107 bytes, so where the temporary folder's path is long the config folder
  // cannot be in the place's own folder. The database stays under TEST_DATABASE_PREFIX, where
  // tools/stray-servers.mjs counts a test's server by its database path, and the socket's name is a hash of
  // the database path, so a shorter database path would not shorten the socket.
  if (Buffer.byteLength(socket) > longest) {
    config = mkdtempSync('/tmp/mo-c-')
    folders.add(config)
    everyFolder.push(config)
    env = { XDG_CONFIG_HOME: config, HOME: home }
    socket = theTerminalHolderSocket(database, env)
  } else {
    mkdirSync(config)
  }
  mkdirSync(home)
  // A UNIX SOCKET'S PATH MAY BE AT MOST 107 BYTES. A longer one is cut short by the kernel, and the
  // holder then fails to chmod a file that is not where it looked. So the names here are kept short,
  // and a place whose socket path is still too long after the config folder moves is refused here with
  // that reason.
  if (Buffer.byteLength(socket) > longest) {
    throw new Error(`The socket path ${socket} is ${String(Buffer.byteLength(socket))} bytes, longer than a Unix socket's ${String(longest)}. Use a shorter name.`)
  }
  return { dir, database, config, home, env, socket, log: theTerminalHolderLog(database, env), everyFolder }
}

export interface StartedHolder {
  child: ChildProcess
  pid: number
  /** What the holder printed, when its output was not sent to the log file. */
  output: () => string
  /** Resolves with the exit code, or null with the signal, once it has ended. */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

/**
 * START A HOLDER FOR THE PLACE'S DATABASE, detached, with the place's XDG_CONFIG_HOME and HOME. With
 * `toTheLog` its output goes to the holder's log file, as the service command sends it. With `waitForIt`
 * (the default) this waits until the holder answers hello with its own pid.
 */
export async function startAHolder(place: Place, options: { toTheLog?: boolean; waitForIt?: boolean } = {}): Promise<StartedHolder> {
  let logFd: number | null = null
  if (options.toTheLog === true) {
    mkdirSync(join(place.config, 'mole-office', 'terminals'), { recursive: true, mode: 0o700 })
    logFd = openSync(place.log, 'a', 0o600)
  }
  const child = spawn(process.execPath, [THE_HOLDER, '--database', place.database], {
    cwd: REPO,
    env: { ...process.env, ...place.env },
    detached: true,
    stdio: logFd === null ? ['ignore', 'pipe', 'pipe'] : ['ignore', logFd, logFd],
  })
  if (logFd !== null) closeSync(logFd)
  if (child.pid === undefined) throw new Error('The holder could not be started: no process was made.')
  groups.add(child.pid)
  let out = ''
  child.stdout?.on('data', (chunk) => (out += String(chunk)))
  child.stderr?.on('data', (chunk) => (out += String(chunk)))
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.once('exit', (code, signal) => done({ code, signal }))
  })
  const started: StartedHolder = { child, pid: child.pid, output: () => out, exited }
  if (options.waitForIt === false) return started
  const pid = child.pid
  const hello = await until(
    () => askTheHolder(place.socket, { op: 'hello' }, 1_000).catch(() => null),
    (answer) => answer !== null && answer['pid'] === pid,
    15_000,
  )
  if (hello === null || hello['pid'] !== pid) {
    throw new Error(`The holder, process ${String(pid)}, did not answer within 15 seconds. It printed: ${out}`)
  }
  return started
}

/** Ask the place's holder one thing; throw with its sentence if it refuses. */
export async function holder(place: Place, request: Record<string, unknown>): Promise<Record<string, unknown>> {
  const answer = await askTheHolder(place.socket, request)
  if (!answer.ok) throw new Error(`The holder refused ${JSON.stringify(request['op'])}: ${String(answer['error'])}`)
  return answer
}

/** Every stand-in socket listening now, with the connections it holds, so `stopEverything` closes it. */
const standIns = new Set<{ server: Server; connections: Set<Socket> }>()

export interface AnOlderHolder {
  /** The real holder behind the stand-in: a holder of the place's database whose socket is elsewhere. */
  holder: StartedHolder
  /** Where the real holder listens. */
  behind: string
  /** Close the stand-in now. The real holder is stopped by its group, as every holder here is. */
  close: () => Promise<void>
}

/**
 * A TERMINAL HOLDER OLDER THAN THIS OFFICE, AT THE PLACE'S OWN SOCKET (wave 13s, round 83). An older holder's hello lists
 * no request it understands beyond the first ones, so the office must not ask it to type a line for somebody else.
 *
 * It is a real holder with a stand-in socket in front of it, and nothing in the holder is switched for a test. The real
 * holder is started for the place's database with a config folder and a home of its own inside the place, so it listens
 * elsewhere and its hello still names the place's database. The stand-in listens at the place's socket, which is where a
 * server of the place looks for its holder (theTerminalHolderSocket). It passes every line both ways as it came, and
 * takes `understands` out of each answer to a hello.
 */
export async function startAnOlderHolder(place: Place): Promise<AnOlderHolder> {
  const config = join(place.dir, 'oc')
  const home = join(place.dir, 'oh')
  mkdirSync(config)
  mkdirSync(home)
  const env = { XDG_CONFIG_HOME: config, HOME: home }
  const behind = theTerminalHolderSocket(place.database, env)
  const longest = theLongestSocketPathBytes()
  if (Buffer.byteLength(behind) > longest) {
    throw new Error(`The socket path ${behind} is ${String(Buffer.byteLength(behind))} bytes, longer than a Unix socket's ${String(longest)}. Use a shorter name.`)
  }
  const holder = await startAHolder({ ...place, config, home, env, socket: behind, log: theTerminalHolderLog(place.database, env) })
  const connections = new Set<Socket>()
  const server = createServer((client) => {
    const upstream = createConnection(behind)
    const hellos = new Set<unknown>()
    for (const one of [client, upstream]) {
      connections.add(one)
      one.once('close', () => connections.delete(one))
    }
    const end = (): void => {
      client.destroy()
      upstream.destroy()
    }
    client.once('close', end)
    upstream.once('close', end)
    client.on('error', end)
    upstream.on('error', end)
    lineByLine(client, upstream, (line) => {
      const asked = aLineRead(line)
      if (asked !== null && asked['op'] === 'hello') hellos.add(asked['id'] ?? null)
      return line
    })
    lineByLine(upstream, client, (line) => {
      const answer = aLineRead(line)
      if (answer === null || !hellos.has(answer['id'] ?? null) || !('understands' in answer)) return line
      hellos.delete(answer['id'] ?? null)
      delete answer['understands']
      return JSON.stringify(answer)
    })
  })
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(place.socket, () => done())
  })
  chmodSync(place.socket, 0o600)
  const standIn = { server, connections }
  standIns.add(standIn)
  return { holder, behind, close: () => closeAStandIn(standIn) }
}

export interface ACopyTheHolderNames {
  from: 'bundle'
  root: string
  build: { version: string; commit: string; builtAt: string }
}

export interface AHolderNamingACopy extends AnOlderHolder {
  /** Make every later hello name this copy; null makes it name none. */
  names: (copy: ACopyTheHolderNames | null) => void
}

/** A real holder behind a stand-in that changes only the copy named by its hello. */
export async function startAHolderNamingACopy(place: Place, options: { toTheLog?: boolean } = {}): Promise<AHolderNamingACopy> {
  const config = join(place.dir, 'nc')
  const home = join(place.dir, 'nh')
  mkdirSync(config, { recursive: true })
  mkdirSync(home, { recursive: true })
  const env = { XDG_CONFIG_HOME: config, HOME: home }
  const behind = theTerminalHolderSocket(place.database, env)
  if (options.toTheLog === true) mkdirSync(dirname(place.log), { recursive: true, mode: 0o700 })
  const real = await startAHolder({ ...place, config, home, env, socket: behind }, options)
  let copy: ACopyTheHolderNames | null = null
  const connections = new Set<Socket>()
  const server = createServer((client) => {
    const upstream = createConnection(behind)
    const hellos = new Set<unknown>()
    for (const one of [client, upstream]) {
      connections.add(one)
      one.once('close', () => connections.delete(one))
    }
    const end = (): void => { client.destroy(); upstream.destroy() }
    client.once('close', end)
    upstream.once('close', end)
    client.on('error', end)
    upstream.on('error', end)
    lineByLine(client, upstream, (line) => {
      const asked = aLineRead(line)
      if (asked !== null && asked['op'] === 'hello') hellos.add(asked['id'] ?? null)
      return line
    })
    lineByLine(upstream, client, (line) => {
      const answer = aLineRead(line)
      if (answer === null || !hellos.has(answer['id'] ?? null)) return line
      hellos.delete(answer['id'] ?? null)
      if (copy === null) delete answer['copy']
      else answer['copy'] = copy
      return JSON.stringify(answer)
    })
  })
  mkdirSync(dirname(place.socket), { recursive: true, mode: 0o700 })
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(place.socket, done) })
  chmodSync(place.socket, 0o600)
  const standIn = { server, connections }
  standIns.add(standIn)
  void real.exited.then(() => closeAStandIn(standIn))
  return { holder: real, behind, close: () => closeAStandIn(standIn), names: (named) => { copy = named } }
}

/** Pass what comes on one socket to another, one line at a time, each line as `each` gives it back. */
function lineByLine(from: Socket, to: Socket, each: (line: string) => string): void {
  let pending = ''
  from.setEncoding('utf8')
  from.on('data', (chunk: string) => {
    pending += chunk
    let newline = pending.indexOf('\n')
    while (newline >= 0) {
      to.write(`${each(pending.slice(0, newline))}\n`)
      pending = pending.slice(newline + 1)
      newline = pending.indexOf('\n')
    }
  })
}

/** One line of the holder's words as an object, or null when it is not one. */
function aLineRead(line: string): Record<string, unknown> | null {
  try {
    const read: unknown = JSON.parse(line)
    return read !== null && typeof read === 'object' && !Array.isArray(read) ? (read as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Close one stand-in and every connection it holds. Its socket file goes with it. */
async function closeAStandIn(standIn: { server: Server; connections: Set<Socket> }): Promise<void> {
  if (!standIns.delete(standIn)) return
  for (const one of standIn.connections) one.destroy()
  await new Promise<void>((done) => standIn.server.close(() => done()))
}

export interface HeldTerminal {
  id: string
  pid: number
  state: string
  cols: number
  rows: number
  exit: { code: number; signal: number | null } | null
}

/** Open a terminal straight through the holder, and record its process group. */
export async function openThroughTheHolder(
  place: Place,
  options: { command?: string; args?: string[]; cols?: number; rows?: number; keeping?: boolean } = {},
): Promise<HeldTerminal> {
  const answer = await holder(place, {
    op: 'open',
    who: { kind: 'person', id: 'a-test' },
    project: 'default',
    command: options.command ?? '/bin/bash',
    args: options.args ?? ['--noprofile', '--norc'],
    folder: place.dir,
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color', HISTFILE: '/dev/null' },
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    // OFF UNLESS A TEST ASKS: these terminals are opened past the server, which is what takes kept lines.
    keeping: options.keeping ?? false,
  })
  const terminal = answer['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  return terminal
}

export interface Watch {
  /** The holder's answer to the watch: the terminal and its screen. */
  terminal: HeldTerminal
  screen: string
  /** Every event after the answer, in order. */
  events: { event: string; data?: string; exit?: { code: number; signal: number | null } }[]
  /** The output events' data, joined. */
  output: () => string
  /** Whether the holder has closed this connection. */
  gone: () => boolean
  close: () => void
}

/** WATCH A TERMINAL on a connection of the test's own, as the server's watchATerminal does. */
export function watch(place: Place, terminal: string): Promise<Watch> {
  return new Promise((done, fail) => {
    const socket: Socket = createConnection(place.socket)
    const events: Watch['events'] = []
    let pending = ''
    let answered = false
    let gone = false
    const timer = setTimeout(() => {
      if (answered) return
      answered = true
      socket.destroy()
      fail(new Error('The holder did not answer a watch within 5 seconds.'))
    }, 5_000)
    socket.setEncoding('utf8')
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: 1, op: 'watch', terminal })}\n`))
    socket.on('data', (chunk: string) => {
      pending += chunk
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        const message = JSON.parse(line) as Record<string, unknown>
        if (!answered) {
          answered = true
          clearTimeout(timer)
          if (message['ok'] !== true) {
            socket.destroy()
            fail(new Error(String(message['error'])))
            return
          }
          done({
            terminal: message['terminal'] as HeldTerminal,
            screen: String(message['screen']),
            events,
            output: () => events.filter((e) => e.event === 'output').map((e) => e.data ?? '').join(''),
            gone: () => gone,
            close: () => socket.destroy(),
          })
          continue
        }
        events.push(message as Watch['events'][number])
      }
    })
    socket.once('close', () => {
      gone = true
    })
    socket.once('error', (err) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      fail(err)
    })
  })
}

/**
 * REPLAY WHAT A VIEWER WAS GIVEN INTO A FRESH HEADLESS SCREEN, and read back its lines, the trailing
 * spaces of each taken off. This is what a viewer's own terminal would show.
 */
export async function replay(pieces: string[], cols: number, rows: number, scrollback = 20_000): Promise<string[]> {
  const screen = new Terminal({ cols, rows, scrollback, allowProposedApi: true })
  for (const piece of pieces) await new Promise<void>((done) => screen.write(piece, () => done()))
  const buffer = screen.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i += 1) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
  screen.dispose()
  return lines
}

/** The screen a fresh watch gives now, replayed, as text lines. */
export async function theScreenNow(place: Place, terminal: string): Promise<string[]> {
  const seen = await watch(place, terminal)
  seen.close()
  return replay([seen.screen], seen.terminal.cols, seen.terminal.rows)
}

/** Wait until a fresh watch's screen has a line that contains `text`. Answers the last screen. */
export async function untilTheScreenShows(place: Place, terminal: string, text: string, ms = 15_000): Promise<string[]> {
  return until(() => theScreenNow(place, terminal), (lines) => lines.some((line) => line.includes(text)), ms)
}

/** Stop one process group: SIGTERM, a wait of up to `ms`, then SIGKILL. */
export async function stopTheGroup(pgid: number, ms = 15_000): Promise<void> {
  if (!groupIsAlive(pgid)) return
  try {
    process.kill(-pgid, 'SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + ms
  while (groupIsAlive(pgid) && Date.now() < deadline) await sleep(100)
  if (groupIsAlive(pgid)) {
    try {
      process.kill(-pgid, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
}

/** Close every stand-in, stop every group recorded here, and remove every folder made here. For afterAll. */
export async function stopEverything(): Promise<void> {
  for (const standIn of [...standIns]) await closeAStandIn(standIn)
  const running = [...groups].filter((pgid) => groupIsAlive(pgid))
  for (const pgid of running) {
    try {
      process.kill(-pgid, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((pgid) => groupIsAlive(pgid)) && Date.now() < deadline) await sleep(100)
  for (const pgid of running.filter((one) => groupIsAlive(one))) {
    try {
      process.kill(-pgid, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}

export function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/** The person's headers. A local request to a fresh scratch office with these is the person. */
export const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** An agent's headers. */
export const AS_AN_AGENT: Record<string, string> = {
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'some-agent',
}

export interface ScratchServer {
  api: string
  port: number
  pid: number
  /** The server's environment: the place's names on top of devStackEnvironment. */
  env: NodeJS.ProcessEnv
  output: () => string
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

/** The environment a scratch server of a place runs with. */
export async function aServerEnvironment(place: Place, port: number): Promise<NodeJS.ProcessEnv> {
  return { ...devStackEnvironment(place.dir, port, await aFreePort(), { database: place.database }), ...place.env }
}

/**
 * START A SCRATCH SERVER PROCESS on the place's database, detached, and wait until it answers. It
 * watches this test's process (--stop-with-pid), and it is stopped by its group.
 *
 * AN ANSWER IS TAKEN ONLY FROM THIS SERVER (wave 13y round 60). The port is let go just before the
 * server starts, and the server binds it only once it has loaded. A scratch that put another office
 * on that port in the gap made the wait take the other office's answer: one file's first case passed
 * against it, and the rest failed once it stopped. A whole run of the suite on 22 October 2026 failed
 * that file in that pattern. So the wait takes an answer only when it names the place's database
 * (`anotherServerAnswered`). When this function chose the port and the server could not bind it, it
 * starts again on another port in the same place (`retryWhenAPortWasTaken`). A port the caller gave is
 * the port the test is about, so it is never tried again, and the start fails in the server's words.
 */
export async function startAServer(place: Place, port?: number, more: NodeJS.ProcessEnv = {}): Promise<ScratchServer> {
  if (port !== undefined) return oneStartOfAServer(place, port, false, more)
  return retryWhenAPortWasTaken('The scratch server', async () => oneStartOfAServer(place, await aFreePort(), true, more))
}

/** One start of a scratch server on one port, for `startAServer`. `ours` says whether it chose the port. */
async function oneStartOfAServer(place: Place, thePort: number, ours: boolean, more: NodeJS.ProcessEnv): Promise<ScratchServer> {
  const env = { ...(await aServerEnvironment(place, thePort)), ...more }
  // The database is read as the server reads it, through the declaration's own reader.
  const database = databasePathFrom(env)
  const child = spawn(process.execPath, apiServerArguments(['--import', 'tsx']), {
    cwd: REPO,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.pid === undefined) throw new Error('The server could not be started: no process was made.')
  groups.add(child.pid)
  let out = ''
  child.stdout?.on('data', (chunk) => (out += String(chunk)))
  child.stderr?.on('data', (chunk) => (out += String(chunk)))
  let ended = false
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.once('exit', (code, signal) => {
      ended = true
      done({ code, signal })
    })
  })
  // Its streams can still be open when it exits, and the words that say the port was taken come last.
  const closed = new Promise<void>((done) => child.once('close', () => done()))
  const api = `http://127.0.0.1:${String(thePort)}`
  const deadline = Date.now() + 90_000
  let last = 'nothing answered'
  for (;;) {
    if (ended) {
      await Promise.race([closed, sleep(2000)])
      const said = `The scratch server ended before it answered. It printed: ${out.slice(-3000)}`
      if (saysThePortWasTaken(out, thePort)) throw new ThePortWasTaken(thePort, ours, said)
      throw new Error(said)
    }
    const answer = await fetch(`${api}/api/health`).catch(() => null)
    if (answer?.ok === true) {
      const instead = await anotherServerAnswered(answer, database)
      if (instead === null) break
      last = instead
    }
    if (Date.now() > deadline) throw new Error(`The scratch server did not answer within 90 seconds (${last}). It printed: ${out.slice(-3000)}`)
    await sleep(250)
  }
  return { api, port: thePort, pid: child.pid, env, output: () => out, exited }
}

/** Stop a scratch server by its group, and wait for it to end. */
export async function stopTheServer(server: ScratchServer): Promise<void> {
  await stopTheGroup(server.pid)
  await Promise.race([server.exited, sleep(15_000)])
}

/**
 * ASK AN OFFICE ONLY WHEN IT IS THE PLACE'S OWN (wave 13y round 61). A test that starts its office itself, not through
 * `startAServer`, still takes the port from a probe that lets go of it at once, and something else can bind it first.
 * So this asks `/api/health` first, and asks the question only when that answer names the place's database
 * (`anotherServerAnswered`). Otherwise, or when either request fails, it returns null, and a wait asks again.
 * tests/the-restart-press-brings-back-its-own-office.test.ts waits this way, while its office starts and while it
 * starts again after the press.
 */
export async function askThePlacesOffice<T>(api: string, place: Place, question: () => Promise<T>): Promise<T | null> {
  const health = await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (health?.ok !== true || (await anotherServerAnswered(health, place.database)) !== null) return null
  return question().catch(() => null)
}

/** One request to a scratch server. */
export async function ask(
  api: string,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const got = await fetch(`${api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers ?? AS_THE_PERSON,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await got.text()
  let body: Record<string, unknown>
  try {
    body = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
  } catch {
    body = { text }
  }
  return { status: got.status, body }
}

export interface StreamEvent {
  event: string
  data: Record<string, unknown>
}

/**
 * READ GET /api/terminals/:id/stream until `enough` says so, or `ms` has passed, then abort the fetch.
 * Answers the status and the events read. A refusal answers its status and no events.
 */
export async function readTheStream(
  api: string,
  terminal: string,
  headers: Record<string, string>,
  enough: (events: StreamEvent[]) => boolean = (events) => events.some((e) => e.event === 'screen'),
  ms = 10_000,
): Promise<{ status: number; events: StreamEvent[]; refusal: string }> {
  const aborter = new AbortController()
  const timer = setTimeout(() => aborter.abort(), ms)
  const events: StreamEvent[] = []
  try {
    const got = await fetch(`${api}/api/terminals/${encodeURIComponent(terminal)}/stream`, { headers, signal: aborter.signal })
    if (!got.ok || got.body === null) return { status: got.status, events, refusal: await got.text() }
    const reader = got.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      while (!enough(events)) {
        const { value, done } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        let end = pending.indexOf('\n\n')
        while (end >= 0) {
          const block = pending.slice(0, end)
          pending = pending.slice(end + 2)
          end = pending.indexOf('\n\n')
          let name = 'message'
          let data = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) name = line.slice(7)
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (data !== '') events.push({ event: name, data: JSON.parse(data) as Record<string, unknown> })
        }
      }
    } catch (err) {
      if (!aborter.signal.aborted) throw err
    }
    return { status: got.status, events, refusal: '' }
  } finally {
    clearTimeout(timer)
    aborter.abort()
  }
}

/** The screen event's screen, replayed, as text lines. */
export async function theStreamsScreen(api: string, terminal: string): Promise<string[]> {
  const read = await readTheStream(api, terminal, AS_THE_PERSON)
  const screen = read.events.find((e) => e.event === 'screen')
  if (screen === undefined) throw new Error(`The stream gave no screen: status ${String(read.status)} ${read.refusal}`)
  const t = screen.data['terminal'] as HeldTerminal
  return replay([String(screen.data['screen'])], t.cols, t.rows)
}
