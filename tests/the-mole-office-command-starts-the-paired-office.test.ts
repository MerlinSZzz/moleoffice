// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run mole-office` FROM A PAIRED DEVELOPMENT CHECKOUT STARTS THE STABLE OFFICE, AND RESTART BRINGS IT BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS HOLDS SHUT
 * ---------------------------------------------------------------------------------------
 *
 * After the first handoff the person works in the development checkout, and the stable office serves
 * its database. The bootstrap writes `MOLE_OFFICE_STABLE_CHECKOUT=<stable>` into the development
 * checkout's `.env`. Round 12 Part B: when that line is set and nothing answers, `start` starts
 * `node tools/serve-dev.mjs --built --prepared` in the stable checkout, detached, with
 * MOLE_OFFICE_DEVELOPMENT_CHECKOUT (this checkout's real path), MOLE_OFFICE_DB (absolute, canonical),
 * MOLE_OFFICE_PORT and NODE_ENV=production. It never starts a server from this checkout on that
 * database. A stand-in holding the port means serve-dev is already there, so no second supervisor
 * starts. No terminal holder is started from the development checkout, because the runtime choice
 * cannot be read from the database the stable office serves.
 *
 * AND A STOP ENDS THE SERVER TOO, WHENEVER IT COMES. The stop signals serve-dev's process group.
 * serve-dev starts its server in a group of its own, so only serve-dev's own handler stops the server.
 * Until wave 13q item 7 that handler was installed only after serve-dev's start had finished: after
 * its server answered and after its two writes into the ledger. A stop in that window ended serve-dev
 * and left its server running (problem PxkI-3Fv2cIw, where the server was still running 45 seconds
 * after the stop). Three cases hold it shut: a signal while serve-dev waits for its server, two
 * signals in a row, and a stop once the office is fully up, which must still run the stop it ran
 * before. Why that server was still there after 45 seconds is not explained; a stop that fails here
 * shows the last 40 lines of the service log it names, so the next failure carries its evidence.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORLDS AND WHAT EACH CASE USES
 * ---------------------------------------------------------------------------------------
 *
 * The development checkout is a fixture: `src`, `package.json` and `tsconfig.json` copied into a
 * temporary folder, `node_modules` symlinked, and a `.env` naming the port, the temporary database
 * and the fixture's stable checkout. The stable checkout is a fixture too, because the server refuses
 * to start anywhere but its own clone on branch `stable` at a dated tag (src/config/stable-tag.mjs):
 * a clone of this worktree's commit that shares its objects, on branch `stable`, with a dated tag of
 * its own, `node_modules` symlinked and a copy of the `dist/web` this file builds for that commit
 * (the same requirement the other command tests carry).
 *
 * These cases need the shared self-check to accept a stable office for its development checkout
 * (the wire world's `developmentCheckout` and the self-check's excuse, another worker's commits). The
 * stand-in, holder and inspector cases are in tests/the-mole-office-command-starts-the-stable-office.
 *
 * ONLY THE PROCESSES THIS FILE STARTED OR WAS TOLD ABOUT ARE READ AND SIGNALLED: the supervisor the
 * command names, and the server and starter its service lock names. Each is kept with the time it
 * began, so a number given out again to another program is not read as it. Nothing here lists the
 * machine's processes.
 *
 * MUTATIONS, each run after the control and then restored:
 *   - start in this checkout (drop the paired branch, so the ordinary start runs);
 *   - accept any checkout in restart (drop the pairing from the allowed set);
 *   - install serve-dev's signal handlers after its start has finished, as before (the signal cases
 *     fail: serve-dev ends by the signal, says nothing, and its server is left);
 *   - drop serve-dev's guard that makes one stop of many signals (the two-signal case fails);
 *   - skip the mark serve-dev's stop makes on its own session (the fully-up case fails).
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer as aTcpProbe } from 'node:net'
import { homedir, hostname, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { theProcessAt } from '../src/config/session-process.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX, theCheckoutsPageBuiltAtThisCommit } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** The line serve-dev prints when a signal starts its stop. */
const THE_STOP_BEGINS = '[dev] SIGTERM received. Stopping the server it started, by its group, and then this.'

/** Every folder this file made, and every child it started. */
const folders = new Set<string>()
const children: ChildProcess[] = []
const groups = new Set<number>()

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = aTcpProbe()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

interface Paired {
  root: string
  dev: string
  stable: string
  home: string
  database: string
  port: number
  env: NodeJS.ProcessEnv
}

/** A development checkout that pairs with a stable checkout cloned from this worktree's commit. */
async function aPairedDevelopmentCheckout(name: string): Promise<Paired> {
  const root = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(root)
  const dev = join(root, 'development')
  mkdirSync(dev)
  for (const entry of ['src', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, entry), join(dev, entry), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dev, 'node_modules'))
  // A DEVELOPMENT CHECKOUT IS A CHECKOUT: settings refuses a folder with no .git entry.
  const made = spawnSync('git', ['init', '--quiet', dev], { encoding: 'utf8' })
  if (made.status !== 0) throw new Error(`the fixture development checkout could not be a git checkout: ${made.stderr}`)
  // THE STABLE CHECKOUT IS ITS OWN CLONE ON BRANCH `stable`, AT A DATED TAG THAT NAMES ITS COMMIT.
  // It is this worktree's commit, so the page the first beforeAll built for that commit is its page.
  const stable = join(root, 'stable')
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim()
  for (const args of [
    ['clone', '--quiet', '--shared', '--no-checkout', REPO, stable],
    ['-C', stable, 'checkout', '--quiet', '-B', 'stable', head],
    ['-C', stable, 'tag', 'stable-2026-10-19-paired-office'],
  ]) {
    const done = spawnSync('git', args, { encoding: 'utf8' })
    if (done.status !== 0) throw new Error(`the fixture stable checkout could not be made (git ${args.join(' ')}): ${done.stderr}`)
  }
  symlinkSync(join(REPO, 'node_modules'), join(stable, 'node_modules'))
  cpSync(join(REPO, 'dist', 'web'), join(stable, 'dist', 'web'), { recursive: true })
  const home = join(root, 'home')
  mkdirSync(home)
  const database = join(root, 'office.db')
  const port = await aFreePort()
  writeFileSync(
    join(dev, '.env'),
    `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${database}\nMOLE_OFFICE_STABLE_CHECKOUT=${stable}\n`,
  )
  return { root, dev, stable, home, database, port, env: theCommandEnvironment(home) }
}

/** The environment the command runs in: this test's, without any MOLE_ setting or test marker. */
function theCommandEnvironment(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HOME: home }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('MOLE_') || name.startsWith('VITEST') || name === 'NODE_ENV') continue
    env[name] = value
  }
  return env
}

interface Said {
  code: number | null
  out: string
  pid: number
}

/** The command while it runs: what it has said so far, whether it has ended, and its end. */
interface Running {
  said: () => string
  over: () => boolean
  ended: Promise<Said>
}

/** Start the command from the fixture development checkout. */
function aCommandAt(paired: Paired, what: string): Running {
  const child = spawn(process.execPath, [join(paired.dev, 'src', 'config', 'the-service-command.mjs'), what], {
    cwd: paired.dev,
    env: paired.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let out = ''
  let over = false
  child.stdout.on('data', (chunk) => (out += String(chunk)))
  child.stderr.on('data', (chunk) => (out += String(chunk)))
  const ended = new Promise<Said>((done) => {
    child.on('close', (code) => {
      over = true
      const lock = readTheServiceLock(theLockOf(paired))
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      // A supervisor that never brought the office up wrote no lock; the command named its group.
      for (const named of out.matchAll(/in process group (\d+)/g)) groups.add(Number(named[1]))
      done({ code, out, pid: child.pid ?? -1 })
    })
  })
  return { said: () => out, over: () => over, ended }
}

/** Run the command from the fixture development checkout, to its end. */
function theCommandAt(paired: Paired, what: string): Promise<Said> {
  return aCommandAt(paired, what).ended
}

function theLockOf(paired: Paired): string {
  return `${paired.database}.service.json`
}

/** The serve-dev the command says it started, or null when it has not said so. */
function theSupervisorNamedIn(out: string): number | null {
  const named = /under tools\/serve-dev\.mjs in [^\n]*: process (\d+), in process group (\d+)\./.exec(out)
  return named === null ? null : Number(named[1])
}

/** The service log the command says the office's output goes to. */
function theServiceLogNamedIn(out: string): string {
  const named = /^Its output goes to (.+)\.$/m.exec(out)
  if (named === null) throw new Error(`the command named no service log. It said:\n${out}`)
  return named[1]!
}

/** A process this file recorded, with the time it began, so a pid given out again is not read as it. */
interface Recorded {
  pid: number
  startedAt: string | null
}

function recorded(pid: number): Recorded {
  const now = theProcessAt(pid)
  return { pid, startedAt: now.here ? now.startedAt : null }
}

function hasEnded(one: Recorded): boolean {
  const now = theProcessAt(one.pid)
  return !now.here || (one.startedAt !== null && now.startedAt !== null && now.startedAt !== one.startedAt)
}

/** Wait for the serve-dev the command starts, and record its group. */
async function theSupervisorItStarts(running: Running): Promise<number> {
  const deadline = Date.now() + 60_000
  for (;;) {
    const pid = theSupervisorNamedIn(running.said())
    if (pid !== null) {
      groups.add(pid)
      return pid
    }
    if (running.over() || Date.now() >= deadline) throw new Error(`the command named no serve-dev. It said:\n${running.said()}`)
    await sleep(10)
  }
}

/** Wait for the service lock whose starter is this serve-dev, and record its server's group. */
async function theLockItsServerTakes(paired: Paired, supervisor: number, running: Running): Promise<{ server: number; serverGroup: number; starterGroup: number }> {
  const deadline = Date.now() + 120_000
  for (;;) {
    const lock = readTheServiceLock(theLockOf(paired))
    if (lock.state === 'read') {
      const starter = lock.lock.starter
      if (starter !== undefined && !('unread' in starter) && starter.pid === supervisor) {
        groups.add(lock.lock.pgid)
        groups.add(starter.pgid)
        return { server: lock.lock.pid, serverGroup: lock.lock.pgid, starterGroup: starter.pgid }
      }
    }
    if (running.over() || Date.now() >= deadline) {
      throw new Error(`no service lock named process ${String(supervisor)} as its starter. The command said:\n${running.said()}`)
    }
    await sleep(10)
  }
}

/** The service log from the last start the command wrote into it, masked, because a failure prints it. */
function theLogSinceTheLastStart(logPath: string): string {
  const text = readFileSync(logPath, 'utf8')
  const from = text.lastIndexOf('--- mole-office start,')
  return masked(from === -1 ? text : text.slice(from))
}

/** Wait until the service log since the last start shows a line, and say whether it did. */
async function theLogShows(logPath: string, line: string, running: Running | null, within: number): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    if (theLogSinceTheLastStart(logPath).includes(line)) return true
    if (running?.over() === true || Date.now() >= deadline) return theLogSinceTheLastStart(logPath).includes(line)
    await sleep(10)
  }
}

/** A log as a failure may show it: no home folder, no login, no machine name and no address. */
function masked(text: string): string {
  const asAWord = (word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  let out = text.replaceAll(homedir(), '<home>').replace(/\/(?:home|Users)\/[^/\s"]+/g, '/<home>')
  if (hostname() !== '') out = out.replace(asAWord(hostname()), '<machine>')
  if (userInfo().username !== '') out = out.replace(asAWord(userInfo().username), '<login>')
  return out.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<address>').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<address>')
}

/** The last 40 lines of a service log, masked, or why they cannot be shown. */
function theLastLinesOf(logPath: string): string {
  let text: string
  try {
    text = readFileSync(logPath, 'utf8')
  } catch (err) {
    return `The service log ${logPath} could not be read: ${String(err)}`
  }
  return `The last 40 lines of ${logPath}, masked:\n${masked(text.trimEnd().split('\n').slice(-40).join('\n'))}`
}

/** What a stop said, and when it failed, the last 40 lines of the service log it names. */
function theStopSaid(stopped: Said): string {
  if (stopped.code === 0) return stopped.out
  const named = /^Nothing more was sent to it\. Its output is in (.+)\.$/m.exec(stopped.out)
  return `${stopped.out}\n${named === null ? 'The stop named no service log.' : theLastLinesOf(named[1]!)}`
}

/** One process's own environment, read from /proc, as pairs of name and value. */
function theEnvironmentOf(pid: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const piece of readFileSync(`/proc/${String(pid)}/environ`, 'utf8').split('\0')) {
    const at = piece.indexOf('=')
    if (at > 0) out[piece.slice(0, at)] = piece.slice(at + 1)
  }
  return out
}

beforeAll(async () => {
  await theCheckoutsPageBuiltAtThisCommit()
}, 300_000)

afterAll(async () => {
  const stillThere = (group: number): boolean => {
    try {
      process.kill(-group, 0)
      return true
    } catch {
      return false
    }
  }
  const running = [...groups].filter(stillThere)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 20_000
  while (running.some(stillThere) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter(stillThere)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('the start from a paired development checkout', () => {
  let paired: Paired
  /** Every serve-dev and server these cases were told about, so the stop can be held to all of them. */
  const supervisors: Recorded[] = []
  const servers: Recorded[] = []

  beforeAll(async () => {
    paired = await aPairedDevelopmentCheckout('starts-the-stable-office')
  }, 60_000)

  it('starts serve-dev in the stable checkout with the four variables, and never in this checkout', async () => {
    const said = await theCommandAt(paired, 'start')
    expect(said.code, said.out).toBe(0)
    expect(said.out).toContain(`under tools/serve-dev.mjs in ${paired.stable}`)
    expect([...said.out.matchAll(/under tools\/serve-dev\.mjs in /g)].length, said.out).toBe(1)
    const supervisor = theSupervisorNamedIn(said.out)
    if (supervisor === null) throw new Error(`the start named no serve-dev:\n${said.out}`)
    supervisors.push(recorded(supervisor))
    const lock = readTheServiceLock(theLockOf(paired))
    if (lock.state !== 'read') throw new Error(`the started office has no readable service lock: ${JSON.stringify(lock)}`)
    servers.push(recorded(lock.lock.pid))
    expect(lock.lock.starter?.pid, 'the server was not started by the serve-dev the command named').toBe(supervisor)
    const environment = theEnvironmentOf(supervisor)
    expect(environment['MOLE_OFFICE_DEVELOPMENT_CHECKOUT']).toBe(resolve(paired.dev))
    expect(environment['MOLE_OFFICE_DB']).toBe(paired.database)
    expect(environment['MOLE_OFFICE_PORT']).toBe(String(paired.port))
    expect(environment['NODE_ENV']).toBe('production')
    expect(readlinkSync(`/proc/${String(supervisor)}/cwd`), 'the supervisor did not run from the stable checkout').toBe(paired.stable)
  }, 240_000)

  it('restart brings the stable office back', async () => {
    const restarted = await theCommandAt(paired, 'restart')
    expect(restarted.code, restarted.out).toBe(0)
    expect(restarted.out).toContain(`under tools/serve-dev.mjs in ${paired.stable}`)
    const lock = readTheServiceLock(theLockOf(paired))
    expect(lock.state).toBe('read')
    if (lock.state !== 'read') return
    const starter = lock.lock.starter
    if (starter === undefined || 'unread' in starter) throw new Error(`the restarted office has no readable starter: ${JSON.stringify(starter)}`)
    servers.push(recorded(lock.lock.pid))
    supervisors.push(recorded(starter.pid))
    expect(starter.pid, 'the restarted server was not started by the serve-dev the command named').toBe(theSupervisorNamedIn(restarted.out))
    expect(theEnvironmentOf(starter.pid)['MOLE_OFFICE_DB']).toBe(paired.database)
    expect(readFileSync(`/proc/${String(starter.pid)}/cmdline`, 'utf8')).toContain('tools/serve-dev.mjs')
    const answer = await fetch(`http://127.0.0.1:${String(paired.port)}/api/health`, { signal: AbortSignal.timeout(3_000) })
    const world = parseWorldHeader(answer.headers.get(WORLD_HEADER))
    expect(world.ok && world.world.database).toBe(databaseIdentity(paired.database).id)
  }, 240_000)

  it('stops the stable office from the development checkout', async () => {
    const stopped = await theCommandAt(paired, 'stop')
    expect(stopped.code, theStopSaid(stopped)).toBe(0)
    expect(stopped.out).toContain('Mole Office stopped:')
    expect(supervisors.length).toBe(2)
    expect([...supervisors, ...servers].filter((one) => !hasEnded(one)).map((one) => one.pid)).toEqual([])
  }, 240_000)

  it('a stop once the office is fully up marks its ledger row and stops the server by its group, as before', async () => {
    const started = await theCommandAt(paired, 'start')
    expect(started.code, started.out).toBe(0)
    const supervisor = theSupervisorNamedIn(started.out)
    if (supervisor === null) throw new Error(`the start named no serve-dev:\n${started.out}`)
    const lock = readTheServiceLock(theLockOf(paired))
    if (lock.state !== 'read') throw new Error(`the started office has no readable service lock: ${JSON.stringify(lock)}`)
    const server = recorded(lock.lock.pid)
    const log = theServiceLogNamedIn(started.out)
    // FULLY UP: serve-dev has written itself into the ledger, which is the last step of its start.
    const written = `[dev] written into the ledger as process ${String(supervisor)}`
    expect(await theLogShows(log, written, null, 60_000), theLastLinesOf(log)).toBe(true)
    const filed = /POST \/api\/resources 201 [^\n]* agent=mole-office\/the-dev-supervisor session=([\w-]+)/.exec(theLogSinceTheLastStart(log))
    if (filed === null) throw new Error(`serve-dev's session is not in its log. ${theLastLinesOf(log)}`)

    const stopped = await theCommandAt(paired, 'stop')
    expect(stopped.code, theStopSaid(stopped)).toBe(0)
    expect(stopped.out).toContain('Mole Office stopped:')
    const after = theLogSinceTheLastStart(log)
    expect(after, theLastLinesOf(log)).toContain(THE_STOP_BEGINS)
    // ITS LEDGER ROW IS MARKED: serve-dev says its own session has finished, before the server stops.
    expect(after, theLastLinesOf(log)).toMatch(new RegExp(`PATCH /api/records/${filed[1]!} 200 [^\\n]* agent=mole-office/the-dev-supervisor`))
    // AND THE SERVER IS STOPPED BY ITS GROUP: a signal reached it, not the watch on its starter.
    expect(after, theLastLinesOf(log)).toMatch(new RegExp(`"pid":${String(server.pid)},[^\\n]*"msg":"SIGTERM received, shutting down"`))
    expect([recorded(supervisor), server].filter((one) => !hasEnded(one)).map((one) => one.pid)).toEqual([])
  }, 240_000)
})

/**
 * A STOP WHILE SERVE-DEV IS STILL STARTING. Each case has a fixture of its own: before the fix, a case
 * here left its server running, and a later case on the same port would have found it there.
 */
describe('a stop while serve-dev is still starting', () => {
  it('stops the server serve-dev started, and serve-dev ends with code 0', async () => {
    const paired = await aPairedDevelopmentCheckout('stopped-while-starting')
    const running = aCommandAt(paired, 'start')
    const supervisor = await theSupervisorItStarts(running)
    // THE SAME SIGNAL THE STOP SENDS, at the first moment the server's lock names serve-dev: before
    // the server answers, and before serve-dev has written anything into the ledger.
    const lock = await theLockItsServerTakes(paired, supervisor, running)
    const server = recorded(lock.server)
    process.kill(-lock.starterGroup, 'SIGTERM')
    const said = await running.ended
    const log = theServiceLogNamedIn(said.out)
    expect(theLogSinceTheLastStart(log)).toContain(THE_STOP_BEGINS)
    expect(masked(said.out)).toContain('The server ended before it answered, with exit code 0.')
    expect(masked(said.out)).not.toContain('it was stopped by the signal')
    // serve-dev's stop waits for its server, so the server has ended by the time serve-dev has.
    expect(hasEnded(server), `server ${String(server.pid)} is still running. ${theLastLinesOf(log)}`).toBe(true)
  }, 240_000)

  it('two signals in a row make one stop, and serve-dev still ends with code 0', async () => {
    const paired = await aPairedDevelopmentCheckout('stopped-twice-while-starting')
    const running = aCommandAt(paired, 'start')
    const supervisor = await theSupervisorItStarts(running)
    const lock = await theLockItsServerTakes(paired, supervisor, running)
    const server = recorded(lock.server)
    const log = theServiceLogNamedIn(running.said())
    // THE SERVER IS HELD WHERE IT IS, so serve-dev's stop is still waiting for it when the second signal
    // comes. The server's group is the one its lock names; nothing else is held.
    process.kill(-lock.serverGroup, 'SIGSTOP')
    try {
      process.kill(-lock.starterGroup, 'SIGTERM')
      if (await theLogShows(log, THE_STOP_BEGINS, running, 60_000)) {
        process.kill(-lock.starterGroup, 'SIGTERM')
        await sleep(500)
      }
    } finally {
      process.kill(-lock.serverGroup, 'SIGCONT')
    }
    const said = await running.ended
    const section = theLogSinceTheLastStart(log)
    expect(section.split('\n').filter((line) => line === THE_STOP_BEGINS).length, section).toBe(1)
    expect(masked(said.out)).toContain('The server ended before it answered, with exit code 0.')
    expect(hasEnded(server), `server ${String(server.pid)} is still running. ${theLastLinesOf(log)}`).toBe(true)
  }, 240_000)
})
