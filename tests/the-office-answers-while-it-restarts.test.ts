// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE OFFICE ANSWERS WHILE IT RESTARTS, AND NEVER RUNS TWO MESSAGE WORKERS AT ONCE.
 *
 * Problem `xGeC_iM6jxYl`. 15 short silences of the live office were counted on 6 October 2026,
 * eleven of them in the minute a merge landed. The live office ran from the main checkout then, so a
 * landing changed a watched file and tools/serve-dev.mjs restarted the server. An office restarts
 * when it is upgraded or started again, and an office run from the main checkout also restarts at
 * every landing. Until 6 October nothing listened on the port between the old server's exit and the
 * new server's listen. On a test office, reading `GET /api/health` every 100 ms across three
 * restarts, 16, 19 and 18 reads were refused and 3 were reset.
 *
 * Now serve-dev opens the listening socket once and hands it to every server it starts as file
 * descriptor 3 (`holdThePort`). Between two servers the kernel queues each new connection until the
 * next server takes it. While no server runs at all, after a failed start, in the backoff or after a
 * refusal, tools/serve-dev-stand-in.mjs answers on the same socket with 503 and the reason.
 *
 * WHAT EACH PART PROVES, AND THE MUTATION THAT TURNS IT RED:
 *
 *   1. `holdThePort` refuses a port something else listens on, in words. Mutation: drop the
 *      address read-back in `holdThePort`. The bind then succeeds on a busy port.
 *   2. A read sent every 50 ms across two restarts of a server slow to start is answered every
 *      time. Mutation: serve-dev holds no socket (`theSocket = null` where it is opened), which is
 *      the restart before 6 October. Reads are refused.
 *   3. A server that fails to start leaves the port answering 503 with the reason, and the next
 *      good start answers 200 with the stand-in gone. The stand-in and a server are never seen
 *      running at the same moment. Mutation: `startTheStandIn` returns at once. Reads then wait
 *      on the queue and time out.
 *   4. On a copy of the real office, with MOLE_OFFICE_MESSAGE_WORKER=merges-only as the live
 *      office runs, across two restarts: no read is refused, never two workers are running, and
 *      each old server's worker has gone before the new server's process exists. Mutation: the
 *      server's shutdown no longer signals its worker's group (src/server/index.ts). Two workers
 *      are then seen at once. A second mutation, serve-dev's `restart` starting the new server
 *      without waiting for the old one, turns this red too, but by a wait running out: the new
 *      server refuses to start while the old one holds the service lock of the database, so the
 *      lock is a second guard on the same thing. Both measured on 6 October 2026.
 *   5. The waiter (for-agents/hold-the-handle.mjs) reads a 5xx on its hold as "the office cannot
 *      answer now", which the kit tries again, not as a refusal, which stops the kit for good.
 *      Mutation: remove the two `>= 500` checks.
 *   6. Path 1 of check `qCP4OR2YDwvZ`: an old server that closes its listener on SIGTERM and is still
 *      alive after SIGKILL. The stand-in answers from the end of the first five-second wait, and
 *      after the second it says the server could not be stopped and names its group. No second
 *      server starts until that one has gone. Mutation: `restart` no longer calls
 *      `theChildCouldNotBeStopped`. Reads then wait on the queue and time out.
 *   7. Path 2 of the same check: a new server that stays alive and never listens. With the limit
 *      set to 3 s, every read is answered, by the stand-in within the limit and a little more, and
 *      the server's group is stopped and started again after the backoff. Mutation: drop the
 *      limit's branch in `seeWhetherThisRunAnswered`. Reads then wait on the queue and time out.
 *      The case waits up to THE_STAND_IN_COMES_WITHIN for the stand-in rather than looking once.
 *      Mutation: `stopAServerThatDoesNotAnswer` starts no stand-in, and the wait runs out.
 *   8. The limit, MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN, refuses a value that is not a
 *      positive number of seconds. Mutation: return 60 seconds instead. The case goes red.
 *   9. A new server that prints the line for its migrations beginning and migrates for twice
 *      the limit is not stopped. Every read meanwhile meets the stand-in, which says the server is
 *      migrating, and once the migrations end the stand-in goes and the server answers. Mutations:
 *      `theTimeLeftToAnswer` leaves out the time spent migrating, and the server is stopped at the
 *      limit; `theMigrationsBegan` starts no stand-in, and reads time out; `theMigrationsEnded`
 *      leaves the stand-in running.
 *  10. After three servers in a row are stopped for not answering, serve-dev starts none until a
 *      file changes, and the stand-in says so and names the operations secretary. Mutation:
 *      `stopAServerThatDoesNotAnswer` arms the backoff restart whatever the count. A fourth
 *      server then starts.
 *  11. Check `m5X4lu3B2F7L`: a server that prints the line for its migrations beginning and never
 *      the line for their end. Every read meets the stand-in, and at the bound,
 *      MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN (3 s here), the server's group is stopped, no
 *      new server starts until a file changes, and the stand-in names the operations secretary.
 *      Mutations: no stand-in at the beginning (reads time out), no bound (the server is never
 *      stopped), and the stand-in keeping its first reason (the port still says it is migrating).
 *      Case 8 has a twin for this bound's setting: return 900 s for a bad value.
 *  12. Check `SJFYLt5k4wwi`: the stand-in, told to stop, answers with 503 every read whose
 *      connection it has already taken, and ends a connection that never asks at
 *      THE_STAND_IN_GRACE_MS. Mutation: `leave` calls `closeAllConnections()` at once, as
 *      it did until 7 October 2026. The reads then end unanswered, and the stand-in exits at once.
 *  13. The same check: serve-dev stops a stand-in only once it has said `listening`, and the
 *      stand-in says it only once no connection has come for 50 ms, so a stand-in that is slow to
 *      start, or held up just after it listens, still takes the reads queued behind a server that
 *      never answers. Mutations: `stopOneStandIn` does not wait for `listening`, the stand-in says
 *      it at once, or it says it on its timer's quiet without looking again after node has taken
 *      what was waiting. Each way a read queued behind the first server that never answers is
 *      answered by a later stand-in. Its own first server never answers, so a stop comes before
 *      the edit, and the stop the reads are compared with is the first after the edit's restart.
 *      Mutation: take the first stop of the whole run, as it did at a55005fbb.
 *  14. The same check: when the migrations end, serve-dev stops their stand-in at once and does
 *      not wait for its `listening`, so no read after the new server's first 200 is answered by
 *      the stand-in. Mutation: the migrations' end waits for `listening` as a restart does. A
 *      stand-in held 1.5 s before it listens then answers 503 beside a server that is ready.
 *  15. "3 servers in a row" is said only when no restart replaced a server between the stops.
 *      Mutation: `restart` does not count the server it replaced.
 *  16. A restart lets the old server answer a read it took 8 s before, longer than the 5 s serve-dev
 *      gave a server until round 6f of wave 13x (message n5g0uTda98in). Mutation: serve-dev
 *      gives a server A_CHILD_HAS_TO_STOP_WITHIN, as before; it kills the server and the read is reset.
 *
 * WHAT CHANGED ON 7 OCTOBER 2026, OPENLY. The fixture server leaves as the real server does: it
 * answers what it has taken and ends the rest after the grace. Case 4 gives a read 60 s, not 15 s.
 * Cases 4, 7, 9 and 11 take a server to be the leader of its process group, where they took any
 * process whose command line runs src/server/index.ts. Each is explained where it is.
 *
 * AND IN ROUND 6F OF WAVE 13X, A STOP DRAINS (message n5g0uTda98in). serve-dev gives a server
 * A_SERVER_HAS_TO_STOP_WITHIN before it kills it, not 5 s, and the stand-in answers from the first 5 s
 * on. So case 6 waits that long for the old server it cannot stop, and case 16 is new. The claims
 * are unchanged: no read is reset, every read meets an answer, never two workers.
 *
 * EACH READ CLOSES ITS CONNECTION (`connection: close`). A read on a kept-alive connection the old
 * server is closing can be reset whatever the port does; that race is the client's and is not what
 * this file measures.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { connect as aConnection, createServer as aNetServer } from 'node:net'
import { createServer as anHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { A_CHILD_HAS_TO_STOP_WITHIN, A_SERVER_HAS_TO_STOP_WITHIN, aNewServerHasToAnswerWithin, holdThePort, serveDev, theBackoffAfter, theMigrationsHaveToFinishWithin } from '../tools/serve-dev.mjs'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { SHUTDOWN_CONNECTION_GRACE_MS, THE_STAND_IN_GRACE_MS } from '../src/config/settings.mjs'
import { apiApp, commandThatStopsWithItsOwner, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const THE_TEST_CLOCKS = { goodRun: 250, healthRequest: 100, healthRetry: 50 }
const A_SHORT_CHILD_STOP = 500

async function freePort(): Promise<number> {
  return await new Promise((done, fail) => {
    const probe = aNetServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => done(port))
    })
  })
}

async function until(what: () => boolean, says: () => string, within: number): Promise<void> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return
    await sleep(50)
  }
  throw new Error(`waited ${String(within)} ms and it did not happen: ${says()}`)
}

// ------------------------------------------------------------------ what a read meets

type ReadResult = { status: number; standIn: string | null; body: string } | { failed: string }

async function readOnce(url: string, within: number): Promise<ReadResult> {
  try {
    const reply = await fetch(url, { headers: { connection: 'close' }, signal: AbortSignal.timeout(within) })
    return { status: reply.status, standIn: reply.headers.get(STAND_IN_HEADER), body: await reply.text() }
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause
    return { failed: cause?.code ?? (err as Error).name ?? String(err) }
  }
}

/** Reads `url` every `every` ms until `stop` is called, and keeps every result. */
function keepReading(url: string, every: number, within: number): { stop: () => Promise<ReadResult[]> } {
  const pending: Promise<ReadResult>[] = []
  let reading = true
  const loop = (async () => {
    while (reading) {
      pending.push(readOnce(url, within))
      await sleep(every)
    }
  })()
  return {
    stop: async () => {
      reading = false
      await loop
      return await Promise.all(pending)
    },
  }
}

const deadReads = (results: readonly ReadResult[]): string[] =>
  results.flatMap((one) => ('failed' in one ? [one.failed] : []))

// ------------------------------------------------------------------ what is running, from /proc

type Seen = { pid: number; pgid: number; cmdline: string[] }

/** Every process whose working directory is `root` and whose command line matches `match`. */
function processesIn(root: string, match: (cmdline: string[]) => boolean): Seen[] {
  const found: Seen[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    let cmdline: string[]
    try {
      cmdline = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter((part) => part !== '')
    } catch {
      continue // gone between the listing and the read
    }
    if (!match(cmdline)) continue
    let pgid: number
    try {
      if (readlinkSync(`/proc/${name}/cwd`) !== root) continue
      // The fifth field of stat, counted after the name in brackets, which may itself hold spaces.
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
    } catch {
      continue
    }
    found.push({ pid: Number(name), pgid, cmdline })
  }
  return found
}

const isAServer = (cmdline: string[]): boolean => cmdline.some((part) => part.endsWith('src/server/index.ts'))
const isAWorker = (cmdline: string[]): boolean => cmdline.some((part) => part.endsWith('src/worker/index.ts'))
const isTheStandIn = (cmdline: string[]): boolean => cmdline.some((part) => part.endsWith('serve-dev-stand-in.mjs'))

/**
 * A SERVER IS THE LEADER OF ITS PROCESS GROUP. serve-dev starts each one in a group of its own.
 * src/config/process-reader.mjs runs `getconf` once in every process that reads processes, and until
 * `exec` that child carries its parent's command line inside the parent's group (seen 7 October
 * 2026). Case 11 once took process 1119579 for the new server while serve-dev named group 1119620,
 * most likely such a child of the old server.
 */
const leadsItsGroup = (one: Seen): boolean => one.pid === one.pgid

/**
 * ONE WORKER IS ONE PROCESS GROUP. The server starts it through tsx, so it is two processes: tsx's
 * own, which carries the arguments, and the node it starts. The group is the worker; its command
 * lines are put together so `--stop-with-pid=` names the server that started it.
 */
function workerGroups(root: string, seen: readonly Seen[] = processesIn(root, isAWorker)): Seen[] {
  const groups = new Map<number, Seen>()
  for (const one of seen.filter((each) => isAWorker(each.cmdline))) {
    const known = groups.get(one.pgid)
    if (known === undefined) groups.set(one.pgid, { pid: one.pgid, pgid: one.pgid, cmdline: [...one.cmdline] })
    else known.cmdline.push(...one.cmdline)
  }
  return [...groups.values()]
}

/** One sample of the process table every `every` ms, until `stop`. */
function sampleProcesses(root: string, every: number): { stop: () => { at: number; servers: Seen[]; workers: Seen[]; standIns: Seen[] }[] } {
  const samples: { at: number; servers: Seen[]; workers: Seen[]; standIns: Seen[] }[] = []
  const timer = setInterval(() => {
    const all = processesIn(root, (cmdline) => isAServer(cmdline) || isAWorker(cmdline) || isTheStandIn(cmdline))
    samples.push({
      at: Date.now(),
      servers: all.filter((one) => isAServer(one.cmdline)),
      workers: workerGroups(root, all),
      standIns: all.filter((one) => isTheStandIn(one.cmdline)),
    })
  }, every)
  return {
    stop: () => {
      clearInterval(timer)
      return samples
    },
  }
}

// ------------------------------------------------------------------ a checkout whose server is a fixture

/**
 * A FIXTURE SERVER, written into a temp checkout and never into this one. It answers 200 with its
 * pid, listens on descriptor 3 when serve-dev hands it one and on the port otherwise, as
 * src/server/index.ts does, and takes `slowStart` ms before it listens, as the real server takes
 * seconds to load. With a file `.fail` in its checkout it exits 1 at once. With a file `.migrate`
 * it prints the line the real server prints as its migrations begin, waits the number of
 * milliseconds the file holds, prints the line for their end and only then listens. When the file
 * holds `never`, it prints the first line and never the second, and never listens. With `.hang` it
 * stays alive and never listens; `.hang-once` does the same for the next server only, which removes
 * the file. With `.slow` it answers each read the number of milliseconds the file holds after it
 * arrives. Each server writes in `.times` how far it got and when (`whatEachServerTook`).
 */
function fixtureSource(port: number, slowStart: number): string {
  return `
    import { createServer } from 'node:http'
    import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    import { THE_MIGRATIONS_BEGIN, THE_MIGRATIONS_END } from ${JSON.stringify(join(REPO, 'src/config/migration-markers.mjs'))}
    if (existsSync('.fail')) {
      console.error('the fixture was told to fail by .fail')
      process.exit(1)
    }
    // .hang: stay alive and never listen. .hang-once: the same, for the next server only.
    // .stay: on SIGTERM close the listener and stay alive.
    const once = existsSync('.hang-once')
    if (once) rmSync('.hang-once')
    const hang = once || existsSync('.hang')
    const alive = setInterval(() => {}, 1000)
    const named = process.argv.find((one) => one.startsWith('--stop-with-pid='))
    if (named !== undefined) {
      const theStarter = aWatchOnTheStarter(Number(named.slice('--stop-with-pid='.length)))
      setInterval(() => { if (theStarter().state === 'gone') process.exit(0) }, 250).unref()
    }
    // .slow: each read is answered this many ms after it arrives.
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      if (_req.headers.connection !== 'close') appendFileSync('.supervisor-asked', 'asked\\n')
      const slow = existsSync('.slow') ? Number(readFileSync('.slow', 'utf8')) : 0
      setTimeout(() => res.end(JSON.stringify({ pid: process.pid })), slow)
    })
    const where = process.env.MOLE_OFFICE_LISTEN_FD ? { fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) } : { port: ${String(port)}, host: '127.0.0.1' }
    const migrate = existsSync('.migrate') ? readFileSync('.migrate', 'utf8').trim() : ''
    const forever = migrate === 'never'
    const migrating = forever || migrate === '' ? 0 : Number(migrate)
    // .times: how far it got, in ms after its process started. whatEachServerTook reads it.
    const mark = (what) => appendFileSync('.times', JSON.stringify({ pid: process.pid, what, after: Math.round(performance.now()), origin: Math.round(performance.timeOrigin) }) + '\\n')
    mark('loaded')
    if (migrating > 0 || forever) {
      console.log(THE_MIGRATIONS_BEGIN)
      mark('began')
    }
    if (!hang && !forever) setTimeout(() => {
      if (migrating > 0) {
        console.log(THE_MIGRATIONS_END)
        mark('ended')
      }
      server.listen(where, () => mark('listening'))
    }, ${String(slowStart)} + migrating)
    process.on('SIGTERM', () => {
      const stay = existsSync('.stay')
      // As src/server/index.ts's drain: a read already taken is answered, and what is left is
      // ended after SHUTDOWN_CONNECTION_GRACE_MS. Until 7 October this ended every connection at once.
      server.close(() => { if (!stay) process.exit(0) })
      setTimeout(() => server.closeAllConnections(), ${String(SHUTDOWN_CONNECTION_GRACE_MS)}).unref()
      if ((hang || forever) && !stay) process.exit(0)
      if (!stay) clearInterval(alive)
    })
  `
}

async function aFixtureCheckout(slowStart: number): Promise<{ root: string; port: number; entry: string }> {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-answers-while-restarting-'))
  const port = await freePort()
  mkdirSync(join(root, 'src/server'), { recursive: true })
  mkdirSync(join(root, 'src/worker'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  const entry = join(root, 'src/server/index.ts')
  writeFileSync(entry, fixtureSource(port, slowStart))
  writeFileSync(join(root, 'src/worker/index.ts'), '// fixture worker entry\n')
  return { root, port, entry }
}

/** serve-dev, in this process, on a fixture checkout. `using` is a copy loaded with a shorter stop limit. */
async function superviseTheFixture(fixture: { root: string; port: number }, using: typeof serveDev = serveDev, clocks: NonNullable<Parameters<typeof serveDev>[0]>['clocks'] = THE_TEST_CLOCKS): Promise<{ owner: Awaited<ReturnType<typeof serveDev>>; lines: string[]; saidAt: number[] }> {
  const lines: string[] = []
  const saidAt: number[] = []
  vi.stubEnv('MOLE_OFFICE_PORT', String(fixture.port))
  vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
  const owner = await using({ clocks, root: fixture.root, writeItDown: false, say: (line) => {
    lines.push(line)
    saidAt.push(Date.now())
  } })
  return { owner, lines, saidAt }
}

/**
 * THE TIME LIMITS IN THIS FILE ARE CLAIMS ABOUT THE MACHINE'S SPEED, so every case that has one
 * prints what it measured, green or red, on a line beginning `[measured]`. The limits were set from
 * these lines (round 6e of wave 13x), and a red run carries the number that broke it.
 */
function sayWhatWasMeasured(name: string, what: string): void {
  // console.log does not reach the run's output here, so the line is written straight to stdout.
  process.stdout.write(`[measured] ${name}: ${what}\n`)
}

/**
 * WHAT EACH FIXTURE SERVER TOOK, from the `.times` each one writes: ms after its process started
 * that it said its migrations began and ended and that it listened. When serve-dev stopped one for
 * not answering or for its migrations, the ms after the start that it said so. serve-dev starts its
 * own clock when it spawns the process, a few ms before the process's clock starts.
 */
function whatEachServerTook(root: string, supervised: { lines: string[]; saidAt: number[] } | null): string {
  const path = join(root, '.times')
  if (!existsSync(path)) return 'no fixture server wrote its times'
  const servers = new Map<number, { origin: number; marks: string[] }>()
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    const one = JSON.parse(line) as { pid: number; what: string; after: number; origin: number }
    const known = servers.get(one.pid) ?? { origin: one.origin, marks: [] }
    known.marks.push(`${one.what} at ${String(one.after)} ms`)
    servers.set(one.pid, known)
  }
  const said = supervised?.lines ?? []
  for (const [n, line] of said.entries()) {
    const stop = /The server in process group (\d+) (did not answer within|has run its migrations for)/.exec(line)
    const known = stop === null ? undefined : servers.get(Number(stop[1]))
    if (stop !== null && known !== undefined) known.marks.push(`stopped by serve-dev at ${String((supervised?.saidAt[n] ?? 0) - known.origin)} ms`)
  }
  return [...servers].map(([pid, one]) => `${String(pid)} ${one.marks.join(', ')}`).join('; ')
}

/** Wait for the fixture to receive serve-dev's health request, then retain the stop assertion. */
async function untilServeDevHasAskedTheFirstServer(root: string, supervised: { lines: string[]; saidAt: number[] }): Promise<void> {
  await until(() => existsSync(join(root, '.supervisor-asked')), () => supervised.lines.join('\n'), 30_000)
  expect(supervised.lines.join('\n'), `serve-dev stopped the first server before the case began: ${whatEachServerTook(root, supervised)}`)
    .not.toContain('did not answer within')
}

// ================================================================ 1. holding the port

describe('serve-dev holds the port itself', () => {
  it('refuses a port something else listens on, and says how to see what', async () => {
    const other = aNetServer()
    await new Promise<void>((done) => other.listen(0, '127.0.0.1', done))
    const { port } = other.address() as AddressInfo
    try {
      expect(() => holdThePort(port)).toThrow(`Port ${String(port)} on 127.0.0.1 could not be held (EADDRINUSE)`)
    } finally {
      await new Promise<void>((done) => other.close(() => done()))
    }
  })

  it('holds a free port, and frees it when closed', async () => {
    const port = await freePort()
    const held = holdThePort(port)
    held.close()
    await sleep(50)
    expect(await freePort().then(() => true)).toBe(true)
    // The same port can be held again once it was let go.
    holdThePort(port).close()
  })
})

// ================================================================ 2. a read during a restart

describe('a read during a restart waits for the next server instead of being refused', () => {
  /**
   * HOW LONG THE READS GO ON AFTER THE NEW SERVER FIRST ANSWERS. After each restart is seen the reads
   * go on until a server that had not answered before answers one, and then for this long, so the
   * new server answers a run of reads and not only the queued ones. Round 6h of wave 13x measured
   * the first answer in 11 runs of this file beside seven other heavy files under `--maxWorkers=8`,
   * as the merge queue runs them, at a median 1-minute load of 14 to 39: 1611 to 1999 ms after the
   * restart was seen. Before this wait the reads went on a fixed 4000 ms, twice the worst, and about
   * 2.4 s of that came after the new server answered. The old server is stopped before the new one
   * starts, so those reads only met the new server. The wait for the first answer is bounded by a
   * read's own limit, 15 s, as the reads queued in the fixed window were. The claims (no read dead,
   * all 200, three servers) are unchanged.
   */
  const THE_READS_GO_ON_AFTER_THE_NEW_SERVER_ANSWERS = 500
  it('answers every read sent every 50 ms across two restarts of a server that takes 1.5 s to start', async () => {
    const fixture = await aFixtureCheckout(1500)
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    try {
      supervised = await superviseTheFixture(fixture)
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      const lines = supervised.lines
      // The first start answering is not the point; it is waited for before the reads begin.
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const reader = keepReadingTimed(url, 50, 15_000)
      const pidOf = (one: TimedRead): number => ('body' in one.result ? (JSON.parse(one.result.body) as { pid: number }).pid : 0)
      const restartSeenAt: number[] = []
      for (const n of [1, 2]) {
        // READS AT ONE EVERY 50 MS FOR 250 MS, from the server the restart replaces, before the edit.
        await sleep(250)
        const before = supervised.owner.restartsSoFar()
        appendFileSync(fixture.entry, `\n// restart ${String(n)}\n`)
        await until(() => supervised !== null && supervised.owner.restartsSoFar() > before, () => lines.join('\n'), 15_000)
        restartSeenAt.push(Date.now())
        const answeredSoFar = new Set(reader.completed.map(pidOf))
        const aNewServerAnswered = (): boolean => reader.completed.some((one) =>
          'status' in one.result && one.result.status === 200 && !answeredSoFar.has(pidOf(one)))
        await until(aNewServerAnswered, () => lines.join('\n'), 15_000)
        await sleep(THE_READS_GO_ON_AFTER_THE_NEW_SERVER_ANSWERS)
      }
      const timed = await reader.stop()
      const results = timed.map((one) => one.result)
      // HOW LONG AFTER EACH RESTART WAS SEEN THE NEW SERVER FIRST ANSWERED, by the answer's arrival.
      const firstAnswers = restartSeenAt.map((seen, n) => {
        const before = new Set(timed.filter((one) => one.sentAt + one.took < seen).map(pidOf))
        const first = timed.filter((one) => one.sentAt + one.took >= seen && pidOf(one) !== 0 && !before.has(pidOf(one)))
          .map((one) => one.sentAt + one.took - seen).sort((a, b) => a - b)[0]
        return `restart ${String(n + 1)} answered ${first === undefined ? 'never' : `${String(first)} ms`} after it was seen`
      })
      sayWhatWasMeasured('case 2, the reader window', `${firstAnswers.join(', ')}; ${whatEachServerTook(fixture.root, supervised)}`)
      expect(deadReads(results), `serve-dev said:\n${lines.join('\n')}`).toEqual([])
      const statuses = new Set(results.map((one) => ('status' in one ? one.status : 0)))
      expect([...statuses]).toEqual([200])
      // Two servers answered across the reads, so a restart really fell inside them.
      const answeredBy = results.map((one) => ('body' in one ? (JSON.parse(one.body) as { pid: number }).pid : 0))
      const pids = new Set(answeredBy)
      // The failure names which server answered each run of reads, in order, and what serve-dev said.
      const runs = answeredBy.reduce<string[]>((so, pid, at) => (at > 0 && answeredBy[at - 1] === pid ? so : [...so, `${String(pid)} from read ${String(at)}`]), [])
      expect(pids.size, `${runs.join(', ')} of ${String(answeredBy.length)} reads; serve-dev said:\n${lines.join('\n')}`).toBe(3)
    } finally {
      await supervised?.owner.stop()
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 90_000)
})

// ================================================================ 16. the drain

describe('a restart lets the old server answer the reads it took', () => {
  it('answers a read the old server took 8 s before, and kills nothing', async () => {
    const fixture = await aFixtureCheckout(0)
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    try {
      supervised = await superviseTheFixture(fixture)
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const first = await readOnce(url, 3000)
      const firstPid = 'body' in first ? (JSON.parse(first.body) as { pid: number }).pid : 0
      expect(firstPid).toBeGreaterThan(0)
      writeFileSync(join(fixture.root, '.slow'), '8000')
      const sentAt = Date.now()
      const held = readOnce(url, 30_000)
      await sleep(500)
      const before = supervised.owner.restartsSoFar()
      appendFileSync(fixture.entry, '\n// a restart while a read is held\n')
      const answer = await held
      sayWhatWasMeasured('case 16, the held read', `${'failed' in answer ? `failed (${answer.failed})` : `answered ${String(answer.status)}`} ${String(Date.now() - sentAt)} ms after it was sent`)
      expect(answer, lines.join('\n')).toMatchObject({ status: 200, standIn: null, body: JSON.stringify({ pid: firstPid }) })
      rmSync(join(fixture.root, '.slow'))
      await until(() => supervised !== null && supervised.owner.restartsSoFar() > before, () => lines.join('\n'), 30_000)
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      expect(lines.join('\n')).not.toContain('did not stop within')
    } finally {
      await supervised?.owner.stop()
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 90_000)
})

/** Asks `url` until it answers 200, giving each read `eachRead` ms, or throws with the last thing it met. */
async function untilItAnswers(url: string, within: number, says: () => string, eachRead = 2000): Promise<void> {
  const deadline = Date.now() + within
  let last: ReadResult = { failed: 'not asked yet' }
  while (Date.now() < deadline) {
    last = await readOnce(url, Math.min(eachRead, Math.max(1, deadline - Date.now())))
    if ('status' in last && last.status === 200) return
    await sleep(100)
  }
  throw new Error(`nothing answered 200 on ${url} within ${String(within)} ms; the last read: ${JSON.stringify(last)}. ${says()}`)
}

// ================================================================ 3. a failed start is answered for

describe('a server that fails to start leaves the port answering why', () => {
  it('answers 503 with the reason while the server keeps failing, and 200 once it starts, with the stand-in gone', async () => {
    const fixture = await aFixtureCheckout(0)
    writeFileSync(join(fixture.root, '.fail'), 'fail\n')
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 10)
    try {
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      // The first backoff is short, so the stand-in runs only now and then: ask until it answers.
      let said: ReadResult = { failed: 'not asked yet' }
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        said = await readOnce(url, 3000)
        if ('status' in said) break
      }
      expect(said, `serve-dev said:\n${lines.join('\n')}`).toMatchObject({ status: 503, standIn: String(process.pid) })
      const body = 'body' in said ? (JSON.parse(said.body) as { error: string }) : { error: '' }
      expect(body.error).toContain(`The dev supervisor (process ${String(process.pid)}) holds this port, and no Mole Office server is answering on it now`)
      expect(body.error).toContain('The server stopped on its own (exit code 1)')
      expect(theBackoffAfter(1)).toBe(500)
      // Fixed: the next start after the backoff is a good one.
      rmSync(join(fixture.root, '.fail'))
      await untilItAnswers(url, 60_000, () => lines.join('\n'))
      const good = await readOnce(url, 3000)
      expect(good).toMatchObject({ status: 200, standIn: null })
      expect(processesIn(fixture.root, isTheStandIn)).toEqual([])
      // NEVER BOTH AT ONCE: the stand-in and a server would split one queue between them.
      const samples = sampler.stop()
      const both = samples.filter((one) => one.standIns.length > 0 && one.servers.length > 0)
      expect(samples.some((one) => one.standIns.length > 0)).toBe(true)
      expect(both.map((one) => ({ standIns: one.standIns.map((s) => s.pid), servers: one.servers.map((s) => s.pid) }))).toEqual([])
    } finally {
      sampler.stop()
      await supervised?.owner.stop()
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)
})

// ================================================================ 4. the real office, merges-only

describe('the real office across two restarts, with its worker in merges-only mode as the live office runs it', () => {
  let dir = ''
  let port = 0
  let supervisor: ChildProcess | null = null
  let said = ''
  // WHEN EACH LINE WAS SAID, so a dead read can be placed beside what serve-dev and the servers said.
  const saidAt: { at: number; line: string }[] = []
  const keepWhen = (chunk: Buffer): void => {
    for (const line of chunk.toString().split('\n')) if (line.trim() !== '') saidAt.push({ at: Date.now(), line: line.slice(0, 200) })
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-answers-while-restarting-office-'))
    for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
      cpSync(join(REPO, part), join(dir, part), { recursive: true })
    }
    symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
    port = await freePort()
    const env: Record<string, string | undefined> = { ...withoutInheritedEffort() }
    for (const name of Object.keys(env)) {
      if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name === 'MOLE_AGENT_KEY') delete env[name]
    }
    Object.assign(env, {
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'office.db'),
      MOLE_OFFICE_MESSAGE_WORKER: 'merges-only',
      MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
      LOG_LEVEL: 'warn',
    })
    // IT STOPS WITH THIS TEST PROCESS even when nothing here gets to run (problem EcbOPrFc-tCD).
    const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
    supervisor = spawn(watched.command, watched.args, { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    supervisor.stdout?.on('data', (chunk: Buffer) => { said += chunk.toString(); keepWhen(chunk) })
    supervisor.stderr?.on('data', (chunk: Buffer) => { said += chunk.toString(); keepWhen(chunk) })
    await untilItAnswers(`http://127.0.0.1:${String(port)}/api/health`, 120_000, () => said.slice(-3000))
    // ITS WORKER IS UP before the restarts begin, or there is nothing to count.
    await until(() => workerGroups(dir).length === 1, () => said.slice(-3000), 60_000)
  }, 200_000)

  afterAll(async () => {
    if (supervisor?.pid !== undefined) {
      try {
        process.kill(-supervisor.pid, 'SIGTERM')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
      await until(() => processesIn(dir, (cmdline) => isAServer(cmdline) || isAWorker(cmdline)).length === 0, () => said.slice(-2000), 20_000)
        .catch(() => undefined)
    }
    // A WORKER IS IN A GROUP OF ITS OWN, so it is stopped by its own group if the server's stop missed it.
    for (const left of processesIn(dir, (cmdline) => isAServer(cmdline) || isAWorker(cmdline))) {
      try {
        process.kill(-left.pid, 'SIGKILL')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    if (dir !== '') rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('refuses no read, never runs two workers, and stops each old worker before the new server exists', async () => {
    const url = `http://127.0.0.1:${String(port)}/api/health`
    const sampler = sampleProcesses(dir, 10)
    /**
     * A READ MAY WAIT AS LONG AS A NEW SERVER IS GIVEN TO START, 60 SECONDS, the wait below. It waits
     * in the socket's queue while the old server stops and the new one loads. Until 7 October 2026
     * it was given 15 seconds. On a machine loaded to 32 to 39 on 20 cores, 24 and 26 reads in two
     * runs waited longer than that and were then answered 200 by the new server. None was refused
     * or reset by the restart.
     */
    const reader = keepReadingTimed(url, 100, 60_000)
    const servers: number[] = [processesIn(dir, isAServer).find(leadsItsGroup)?.pid ?? 0]
    const seenAt: number[] = []
    const toAnswer: number[] = []
    // A WAIT THAT FAILS IS THROWN AFTER THE MEASUREMENT BELOW IS PRINTED, so a red run carries it.
    let failed: unknown = null
    for (const n of [1, 2]) {
      try {
        await sleep(1000)
        appendFileSync(join(dir, 'src/shared/product.ts'), `\n// restart ${String(n)}\n`)
        const was = servers[servers.length - 1]
        // A SERVER IS THE LEADER OF ITS GROUP (`leadsItsGroup`). A child carrying a server's command line
        // was seen in its group on 7 October 2026 (1038000 in 1037946's group). Until then this took any
        // process with that command line, so a child of the old server could be taken for the new server
        // and the wait for its worker below could never end.
        const aNewServer = (one: Seen): boolean => leadsItsGroup(one) && one.pid !== was
        await until(() => processesIn(dir, isAServer).some(aNewServer), () => said.slice(-3000), 60_000)
        servers.push(processesIn(dir, isAServer).find(aNewServer)?.pid ?? 0)
        seenAt.push(Date.now())
        // EACH OF THESE READS MAY WAIT AS LONG AS THE READER'S, 60 s. Until round 6e each was given 2 s.
        // At load 22-65, case 4 was red in 2 of 3 runs because of that: the real server's
        // /api/health took 3 to 23 s to answer 200 (most of the reader's 200s took over 2 s), so every
        // one of these reads timed out while the reader beside it was being answered 200.
        await untilItAnswers(url, 60_000, () => said.slice(-3000), 60_000)
        toAnswer.push(Date.now() - (seenAt[seenAt.length - 1] ?? 0))
        await until(() => workerGroups(dir).some((one) => one.cmdline.includes(`--stop-with-pid=${String(servers[servers.length - 1])}`)), () => said.slice(-3000), 60_000)
      } catch (err) {
        failed = err
        break
      }
    }
    if (failed === null) await sleep(1000)
    const timed = await reader.stop()
    const results = timed.map((one) => one.result)
    const samples = sampler.stop()
    // THE FIRST 200 THE READER GOT AFTER EACH NEW SERVER WAS SEEN, by its arrival, and how long the
    // reads answered 200 took.
    const firstOk = seenAt.map((seen) => timed.filter((one) => 'status' in one.result && one.result.status === 200 && one.sentAt + one.took >= seen)
      .map((one) => one.sentAt + one.took - seen).sort((a, b) => a - b)[0])
    const oks = timed.filter((one) => 'status' in one.result && one.result.status === 200).map((one) => one.took).sort((a, b) => a - b)
    sayWhatWasMeasured('case 4, the 60 s limit', `the longest read took ${String(Math.max(...timed.map((one) => one.took)))} ms; ` +
      `the reader's first 200 came ${firstOk.map((ms) => (ms === undefined ? 'never' : `${String(ms)} ms`)).join(' and ')} after each new server was seen; ` +
      `untilItAnswers returned ${toAnswer.map((ms) => `${String(ms)} ms`).join(' and ')} after; ` +
      `a read answered 200 took at most ${String(oks[oks.length - 1] ?? 0)} ms, ${String(oks.filter((ms) => ms > 2000).length)} of ${String(oks.length)} over 2000 ms`)
    // WHAT EACH OLD SERVER'S DRAIN TOOK, in its own words (src/server/index.ts, `shutdown`). The
    // server's grace was chosen from these lines (round 6f of wave 13x).
    const drains = said.split('\n').filter((line) => line.includes('shutdown: every read') || line.includes('were ended unanswered'))
    sayWhatWasMeasured('case 4, the drain', drains.length === 0 ? 'no old server said what its drain took' : drains.join(' | '))
    if (failed !== null) throw failed

    // NO DEAD PORT. A 503 from the old server while it closes is an answer, and was there before.
    // The failure places each dead read beside what was said from 2 s before it was sent to 2 s
    // after it ended, in ms after the first restart's new server was seen.
    const zero = seenAt[0] ?? 0
    const dead = timed.filter((one) => 'failed' in one.result).map((one) => {
      const near = saidAt.filter((said) => said.at >= one.sentAt - 2000 && said.at <= one.sentAt + one.took + 2000)
      return `${JSON.stringify(one.result)} sent at ${String(one.sentAt - zero)} ms, ended at ${String(one.sentAt + one.took - zero)} ms; ` +
        `new servers seen at ${seenAt.map((at) => `${String(at - zero)} ms`).join(' and ')}; said near it:\n` +
        near.map((said) => `  ${String(said.at - zero)} ms: ${said.line}`).join('\n')
    })
    expect(deadReads(results), dead.join('\n')).toEqual([])
    expect(results.length).toBeGreaterThan(40)

    // NEVER TWO WORKERS.
    const most = Math.max(...samples.map((one) => one.workers.length))
    expect(most, JSON.stringify(samples.filter((one) => one.workers.length > 1).slice(0, 3))).toBe(1)

    // EACH OLD SERVER'S WORKER WAS GONE BEFORE THE NEXT SERVER'S PROCESS WAS SEEN.
    const firstSeen = (pid: number): number => samples.find((one) => one.servers.some((s) => s.pid === pid))?.at ?? Infinity
    const lastSeenWorkerOf = (server: number): number =>
      Math.max(-Infinity, ...samples.filter((one) => one.workers.some((w) => w.cmdline.includes(`--stop-with-pid=${String(server)}`))).map((one) => one.at))
    expect(new Set(servers).size).toBe(3)
    for (const [older, newer] of [[servers[0], servers[1]], [servers[1], servers[2]]] as const) {
      const workerGone = lastSeenWorkerOf(older ?? 0)
      const serverSeen = firstSeen(newer ?? 0)
      expect(Number.isFinite(workerGone), `no worker of server ${String(older)} was ever seen`).toBe(true)
      expect(workerGone, `the worker of ${String(older)} was still running when ${String(newer)} was seen`).toBeLessThan(serverSeen)
    }
  }, 240_000)
})

// ================================================================ 5. the waiter across a restart

describe('the waiter reads a 5xx as the office not answering now, not as a refusal', () => {
  let t: TestDb
  let app: FastifyInstance
  let door: Server
  let api = ''
  /** While true, every hold answers as the stand-in does and every beat answers 409. */
  let restarting = false
  /** What the door did, counted, so the case waits for each step rather than for a clock. */
  const seen = { holdsRefused: 0, beatsRefused: 0, beatsPassed: 0 }
  const started: ChildProcess[] = []
  const standInReply = JSON.stringify({ error: 'The dev supervisor (process 1) holds this port, and no Mole Office server is answering on it now: a test. Nothing was read or written. Ask again in a few seconds.' })

  beforeAll(async () => {
    // The office tells the waiter how often to beat; a second here, rather than the twenty of the default.
    vi.stubEnv('MOLE_OFFICE_HANDLE_BEAT_SECONDS', '1')
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    const { stampArrival } = await import('../src/server/lib/http.ts')
    door = anHttpServer((raw, res) => {
      const path = (raw.url ?? '').split('?')[0] ?? ''
      if (restarting && raw.method === 'POST' && /^\/api\/handles\/[^/]+\/hold$/.test(path)) {
        seen.holdsRefused += 1
        res.writeHead(503, { 'content-type': 'application/json', [STAND_IN_HEADER]: '1', connection: 'close' })
        res.end(standInReply)
        return
      }
      if (restarting && raw.method === 'POST' && /^\/api\/handles\/[^/]+\/beat$/.test(path)) {
        seen.beatsRefused += 1
        res.writeHead(409, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Nobody holds this handle now.' }))
        return
      }
      if (raw.method === 'POST' && /^\/api\/handles\/[^/]+\/beat$/.test(path)) seen.beatsPassed += 1
      stampArrival(raw, 'this machine', 'the caller')
      app.routing(raw, res)
    })
    await new Promise<void>((go) => door.listen(0, '127.0.0.1', go))
    api = `http://127.0.0.1:${String((door.address() as AddressInfo).port)}`
    const secretary = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' },
      payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
    })
    expect(secretary.statusCode, secretary.body).toBe(201)
  }, 180_000)

  afterAll(async () => {
    for (const child of started) {
      if (child.pid === undefined || child.exitCode !== null) continue
      try {
        process.kill(child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    await new Promise<void>((go) => door.close(() => go()))
    await app.close()
    t.close()
    vi.unstubAllEnvs()
  })

  async function anAgentWithASession(handle: string): Promise<{ session: string; key: string }> {
    const asAgent = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': 'default' }
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...asAgent, 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle },
      payload: { handle, name: `The agent ${handle}`, role: 'worker', workArea: ['src'] },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent,
      payload: { kind: 'session', title: `A terminal answering as ${handle}`, data: { state: 'running', runtime: 'claude-code', doing: `answering as ${handle}` } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    return { session: (filed.json() as { record: { id: string } }).record.id, key }
  }

  function startTheWaiter(handle: string, session: string, key: string): { child: ChildProcess; said: () => string } {
    const env: Record<string, string | undefined> = { ...withoutInheritedEffort(), MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_AGENT_KEY: key }
    delete env.MOLE_OFFICE_AGENT
    const child = spawn(
      process.execPath,
      [join(REPO, 'for-agents/hold-the-handle.mjs'), '--agent', handle, '--session', session, '--api', api, '--workspace', 'default'],
      { env },
    )
    started.push(child)
    let printed = ''
    child.stdout?.on('data', (chunk) => (printed += String(chunk)))
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    return { child, said: () => printed }
  }

  it('ends as an error, which the kit tries again, when the first hold meets the stand-in', async () => {
    const { session, key } = await anAgentWithASession('waiter-first-hold')
    restarting = true
    try {
      const waiter = startTheWaiter('waiter-first-hold', session, key)
      const code = await new Promise<number | null>((done) => waiter.child.once('exit', (exitCode) => done(exitCode)))
      expect(waiter.said()).toContain('exiting: error: The dev supervisor (process 1) holds this port')
      expect(waiter.said()).not.toContain('exiting: refused')
      expect(code).toBe(1)
    } finally {
      restarting = false
    }
  }, 60_000)

  it('keeps running when a hold during a restart meets the stand-in', async () => {
    const { session, key } = await anAgentWithASession('waiter-beat')
    // A NEW AGENT IS SENT ITS CARD, and a waiter wakes on a message by exiting. The first waiter takes
    // that message and exits; the second waits with nothing to wake it.
    const first = startTheWaiter('waiter-beat', session, key)
    await new Promise<void>((done) => first.child.once('exit', () => done()))
    expect(first.said()).toContain('You hold the worker card')
    const waiter = startTheWaiter('waiter-beat', session, key)
    await until(() => /Holding the handle|holds the handle|is holding/i.test(waiter.said()) || waiter.child.exitCode !== null, waiter.said, 30_000)
    expect(waiter.child.exitCode, waiter.said()).toBeNull()
    // THE RESTART: a beat is answered 409, the hold that follows meets the stand-in.
    const before = { ...seen }
    restarting = true
    try {
      await until(() => seen.beatsRefused > before.beatsRefused && seen.holdsRefused > before.holdsRefused, waiter.said, 60_000)
    } finally {
      restarting = false
    }
    // THE NEW SERVER: two beats reach the office after the restart, and the waiter is still there.
    const passed = seen.beatsPassed
    await until(() => seen.beatsPassed >= passed + 2 || waiter.child.exitCode !== null, waiter.said, 60_000)
    expect(waiter.said()).not.toContain('exiting: refused')
    expect(waiter.child.exitCode, waiter.said()).toBeNull()
    process.kill(waiter.child.pid ?? 0, 'SIGKILL')
  }, 150_000)
})



// ================================================================ 6 and 7. a server that takes nothing from the queue

type TimedRead = { sentAt: number; took: number; result: ReadResult }

/** Reads `url` every `every` ms until `stop`, and keeps when each was sent and how long it took. */
function keepReadingTimed(url: string, every: number, within: number): { completed: TimedRead[]; stop: () => Promise<TimedRead[]> } {
  const completed: TimedRead[] = []
  const pending: Promise<TimedRead>[] = []
  let reading = true
  const loop = (async () => {
    while (reading) {
      const sentAt = Date.now()
      pending.push(readOnce(url, within).then((result) => {
        const one = { sentAt, took: Date.now() - sentAt, result }
        completed.push(one)
        return one
      }))
      await sleep(every)
    }
  })()
  return {
    completed,
    stop: async () => {
      reading = false
      await loop
      return await Promise.all(pending)
    },
  }
}

const theErrorIn = (read: ReadResult): string =>
  'body' in read ? String((JSON.parse(read.body) as { error?: string }).error ?? '') : ''

/**
 * SERVERS ARE COUNTED BY PROCESS GROUP, as workers are. A server forks a helper (tsx starts esbuild),
 * and between the fork and the exec the helper carries the server's command line in the server's
 * group. Counted by process, that read as two servers in 2 of 30 runs on 6 October 2026.
 */
const serverGroups = (servers: readonly Seen[]): number => new Set(servers.map((one) => one.pgid)).size

const isGone = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

describe('a server that is alive and takes nothing from the queue leaves the port answering why', () => {
  /**
   * THE START LIMIT OF CASES 9 AND 11, in seconds. Each case's new server must print that its
   * migrations began within it, or serve-dev stops it as not answering. Round 6h of wave 13x
   * measured when they began in 11 runs beside seven other heavy files under `--maxWorkers=8`, at a
   * median load of 14 to 39 (.logs/w6h/m-1..m-11): 124 to 197 ms after the server was started.
   * 2 s is ten times the worst, so it stays. Round 6g saw 2 to 5.8 s, but that load was its own
   * load threads inside the same 8-CPU quota, which the merge queue does not have.
   */
  const THE_MIGRATING_CASES_START_LIMIT = '2'
  /**
   * THE LIMIT IS THE GATE ROW a-new-server-has-to-answer-within (wave 13r round AC), a whole number of seconds from 1
   * to 86400, so a fraction is refused as a word is. MUTATION: return 60 seconds for a value that is not a number.
   * This case goes red.
   */
  it('refuses a limit that is not a whole number of seconds from 1 to 86400, and reads 60 when nothing is set', () => {
    try {
      vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', 'soon')
      expect(() => aNewServerHasToAnswerWithin()).toThrow('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN is "soon", and it has to be a whole number from 1 to 86400. No other number was used in its place. serve-dev did not start. Set it to a whole number of seconds, or remove it for 60.')
      vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '1.5')
      expect(() => aNewServerHasToAnswerWithin()).toThrow('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN is "1.5", and it has to be a whole number from 1 to 86400.')
      vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', undefined)
      expect(aNewServerHasToAnswerWithin()).toBe(60_000)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  /** The gate row migrations-have-to-finish-within, as above. MUTATION: return 900 seconds for a value that is not a number. This case goes red. */
  it('refuses a bound on migrations that is not a whole number of seconds from 1 to 86400, and reads 900 when nothing is set', () => {
    try {
      vi.stubEnv('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN', '-5')
      expect(() => theMigrationsHaveToFinishWithin()).toThrow('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN is "-5", and it has to be a whole number from 1 to 86400. No other number was used in its place. serve-dev did not start. Set it to a whole number of seconds, or remove it for 900.')
      vi.stubEnv('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN', undefined)
      expect(theMigrationsHaveToFinishWithin()).toBe(900_000)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  /**
   * SERVE-DEV LOADED AGAIN, WITH THE SERVER'S OWN STOP LIMIT SHORTENED (SHUTDOWN_LIMIT_MS in
   * src/config/settings.mjs). A_SERVER_HAS_TO_STOP_WITHIN is that limit and 5 s: 45 s in the product. Only
   * the copy changes, and the case below builds every sentence and window from the copy's constants.
   */
  async function serveDevWithTheStopLimit(limitMs: number): Promise<typeof import('../tools/serve-dev.mjs')> {
    vi.resetModules()
    vi.doMock('../src/config/settings.mjs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../src/config/settings.mjs')>()),
      SHUTDOWN_LIMIT_MS: limitMs,
    }))
    try {
      return await import('../tools/serve-dev.mjs')
    } finally {
      vi.doUnmock('../src/config/settings.mjs')
    }
  }
  /**
   * The settings mock leaves a real drain window, with short child waits and reads every 20 ms.
   * THE STOP WAIT ITSELF IS A TEST CLOCK, 2.5 s, not the product's 50 s: the case proves which
   * answer the port gives while a server that will not stop is waited for, and which it gives
   * after, not how long the product waits. The drain window stays 1000 ms, so 20 ms reads give
   * about 50 of them against the 20 the case asks for.
   */
  const PATH_1_STOP_LIMIT = 1_000
  const PATH_1_SERVER_STOP = 2_500

  /**
   * PATH 1. SIGKILL cannot be delayed in user space, so it is suppressed for this one recorded group,
   * as the case in tests/the-dev-supervisor-does-not-lose-its-own-server.test.ts does. Everything
   * else is real: the fixture closes its listener on SIGTERM and stays alive, as the check's probe did.
   */
  it('answers with the stand-in, naming the group, while an old server cannot be stopped', async () => {
    const short = await serveDevWithTheStopLimit(PATH_1_STOP_LIMIT)
    expect(short.A_SERVER_HAS_TO_STOP_WITHIN).toBe(PATH_1_STOP_LIMIT + short.A_CHILD_HAS_TO_STOP_WITHIN)
    const fixture = await aFixtureCheckout(0)
    const realKill = process.kill.bind(process)
    let first = 0
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (first !== 0 && pid === -first && signal === 'SIGKILL') return true
      return realKill(pid, signal)
    })
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 20)
    try {
      supervised = await superviseTheFixture(fixture, short.serveDev, { ...THE_TEST_CLOCKS, childStop: A_SHORT_CHILD_STOP, serverStop: PATH_1_SERVER_STOP })
      const lines = supervised.lines
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const answered = await readOnce(url, 3000)
      first = 'body' in answered ? (JSON.parse(answered.body) as { pid: number }).pid : 0
      expect(first).toBeGreaterThan(0)
      writeFileSync(join(fixture.root, '.stay'), 'stay\n')
      const reader = keepReadingTimed(url, 20, 20_000)
      appendFileSync(fixture.entry, '\n// a restart the old server will not let happen\n')
      // THE DRAIN: from the first wait on, the stand-in answers new reads beside the stopping server.
      await until(() => lines.some((line) => line.includes('is answering the reads it took')), () => lines.join('\n'), 30_000)
      const theDrainBegan = Date.now()
      await until(() => lines.some((line) => line.includes('no replacement was started')), () => lines.join('\n'), short.A_SERVER_HAS_TO_STOP_WITHIN + 30_000)
      const theStateBegan = Date.now()
      // THE STATE THE CHECK FOUND: the old server alive, its listener closed, serve-dev in its backoff.
      await until(() => reader.completed.filter((one) => one.sentAt >= theStateBegan + 500).length > 20, () => lines.join('\n'), 15_000)
      expect(isGone(first)).toBe(false)
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      const inTheDrain = during.filter((one) => one.sentAt >= theDrainBegan + 500 && one.sentAt < theDrainBegan + PATH_1_SERVER_STOP - 2 * A_SHORT_CHILD_STOP)
      expect(inTheDrain.length).toBeGreaterThan(20)
      for (const one of inTheDrain) {
        expect(one.result, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
        expect(theErrorIn(one.result)).toContain(`The server in process group ${String(first)} is answering the reads it took before it was told to stop`)
      }
      const afterTheWaits = during.filter((one) => one.sentAt >= theStateBegan + 500)
      expect(afterTheWaits.length).toBeGreaterThan(20)
      for (const one of afterTheWaits) {
        expect(one.result, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
        expect(one.took).toBeLessThan(1500)
        expect(theErrorIn(one.result)).toContain(`The server in process group ${String(first)} is still running after SIGTERM, which gave it ${String(PATH_1_SERVER_STOP / 1000)}s to stop, and SIGKILL`)
        expect(theErrorIn(one.result)).toContain(
          `the operations secretary has to stop process group ${String(first)}, and no new server starts until it has exited`,
        )
      }
      // A read sent before the first wait ran out waited on the queue for at most that wait, five
      // seconds, and the stand-in's start. From then on the stand-in answered, through the drain too.
      expect(Math.max(...during.map((one) => one.took))).toBeLessThan(7_000)
      // THE OLD SERVER GOES, and only then does a new one start and answer.
      rmSync(join(fixture.root, '.stay'))
      realKill(-first, 'SIGKILL')
      await untilItAnswers(url, 60_000, () => lines.join('\n'))
      const good = await readOnce(url, 3000)
      expect(good).toMatchObject({ status: 200, standIn: null })
      expect(processesIn(fixture.root, isTheStandIn)).toEqual([])
      const samples = sampler.stop()
      // NEVER TWO SERVERS, so never two workers: a worker is started by its server.
      expect(Math.max(...samples.map((one) => serverGroups(one.servers)))).toBe(1)
      expect(samples.some((one) => one.standIns.length > 0 && one.servers.some((s) => s.pid === first))).toBe(true)
    } finally {
      sampler.stop()
      kill.mockRestore()
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, A_SERVER_HAS_TO_STOP_WITHIN + 150_000)

  /**
   * PATH 2, IN A RESTART, which is where the check found it: the socket has been listened on, so a
   * read is queued rather than refused. (Before any server has listened, the socket is only bound and
   * a read is refused at once, which is the other answer the brief allows.)
   */
  /**
   * HOW LONG CASE 7 WAITS FOR THE STAND-IN after it has seen the hung server. serve-dev starts it
   * at the 3 s limit plus its 2.5 s last ask, so about 5.5 s. Round 6h of wave 13x saw it at 5467
   * to 5516 ms in 11 runs beside seven other heavy files under `--maxWorkers=8`, at a median load of
   * 14 to 39 (.logs/w6h/m-1..m-11), and round 6g at 5.5 to 5.7 s at load 51 to 86. 10 000 ms is
   * 4.5 s above the worst. The wait looks every 50 ms, and the stand-in stays about 0.6 s, so it is
   * seen while it is there. Mutation: `stopAServerThatDoesNotAnswer` does not call
   * `startTheStandIn`; the wait runs out and the case is red (.logs/w6h/c7-mutation.log).
   */
  const THE_STAND_IN_COMES_WITHIN = 10_000
  it('stops a new server that never answers within its limit, answering with the stand-in meanwhile', async () => {
    const fixture = await aFixtureCheckout(0)
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '3')
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 20)
    let hungSeenAt = 0
    let standInSeenAt = 0
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const good = processesIn(fixture.root, isAServer).find(leadsItsGroup)?.pid ?? 0
      writeFileSync(join(fixture.root, '.hang'), 'hang\n')
      const reader = keepReadingTimed(url, 100, 20_000)
      appendFileSync(fixture.entry, '\n// a restart into a server that never listens\n')
      await until(() => processesIn(fixture.root, isAServer).some((one) => leadsItsGroup(one) && one.pid !== good), () => lines.join('\n'), 20_000)
      const hung = processesIn(fixture.root, isAServer).find((one) => leadsItsGroup(one) && one.pid !== good)?.pid ?? 0
      hungSeenAt = Date.now()
      expect(hung).toBeGreaterThan(0)
      // THE STAND-IN IS WAITED FOR, AND SEEN WHEN IT COMES. Until round 6h of wave 13x this looked once,
      // at 7500 ms. Under load the stand-in came 5.5 to 5.7 s after the hung server and was stopped
      // about 0.6 s later for the backoff's restart, so that one look found it only by its timing
      // (red in 2 of 11 runs, .logs/r6g). The wait is THE_STAND_IN_COMES_WITHIN; see there for its numbers.
      await until(() => processesIn(fixture.root, isTheStandIn).length > 0,
        () => `no stand-in ${String(Date.now() - hungSeenAt)} ms after the hung server was seen; serve-dev said:\n${lines.join('\n')}`,
        THE_STAND_IN_COMES_WITHIN)
      standInSeenAt = Date.now()
      // The stand-in and the named server’s exit are the states the fixed wait stood in for.
      await until(() => lines.some((line) => line.includes(`the server in group ${String(hung)} has exited`)), () => lines.join('\n'), 20_000)
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      // THE LIMIT IS 3 s, AND THE LAST ASK CAN RUN 2.5 s PAST IT. No read waits longer than that,
      // the restart before it and the stand-in's start.
      const longest = Math.max(...during.map((one) => one.took))
      expect(longest).toBeLessThan(3000 + 2500 + 2000)
      // The reads before the restart met the old server; the rest met the stand-in.
      const said = during.filter((one) => 'status' in one.result && one.result.status !== 200)
      expect(said.length).toBeGreaterThan(20)
      for (const one of said) {
        expect(one.result, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
        expect(theErrorIn(one.result)).toContain('did not answer within 3s of its start, not counting its migrations, so serve-dev is stopping it')
      }
      expect(lines.join('\n')).toContain('did not answer within 3s of its start')
      // THE HUNG SERVER WAS STOPPED BY ITS GROUP, and a fixed one starts after the backoff.
      rmSync(join(fixture.root, '.hang'))
      await until(() => isGone(hung), () => lines.join('\n'), 20_000)
      await untilItAnswers(url, 60_000, () => lines.join('\n'))
      expect(await readOnce(url, 3000)).toMatchObject({ status: 200, standIn: null })
      expect(supervised.owner.restartsSoFar()).toBeGreaterThanOrEqual(1)
      const samples = sampler.stop()
      expect(Math.max(...samples.map((one) => serverGroups(one.servers)))).toBe(1)
    } finally {
      const standInFrom = sampler.stop().find((one) => one.at >= hungSeenAt && one.standIns.length > 0)?.at
      sayWhatWasMeasured('case 7, the 3 s start limit', whatEachServerTook(fixture.root, supervised))
      sayWhatWasMeasured('case 7, the stand-in', hungSeenAt === 0 ? 'the hung server was never seen'
        : standInFrom === undefined ? 'no sample showed a stand-in after the hung server was seen'
        : `first sampled ${String(standInFrom - hungSeenAt)} ms after the hung server was seen, ` +
          `the wait saw it at ${standInSeenAt === 0 ? 'no time' : `${String(standInSeenAt - hungSeenAt)} ms`}; ` +
          `the wait is ${String(THE_STAND_IN_COMES_WITHIN)} ms`)
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 150_000)

  /**
   * THE TIME A SERVER SPENDS ON ITS MIGRATIONS IS NOT COUNTED (message DXXb8QZ_9EfG). A
   * migration of the real database can take longer than any limit, and a server stopped in the
   * middle of one would be started again into the same migration for ever. WHILE IT MIGRATES THE
   * STAND-IN ANSWERS (check `m5X4lu3B2F7L`), and once the migrations end the stand-in goes and the
   * server takes every read.
   *
   * MUTATIONS: `theMigrationsBegan` starts no stand-in, and the reads during the migration time
   * out. `theMigrationsEnded` leaves the stand-in running, and it is still there after the server
   * answers.
   */
  it('answers with the stand-in while a new server migrates past the limit, and the server takes over once they end', async () => {
    const fixture = await aFixtureCheckout(0)
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', THE_MIGRATING_CASES_START_LIMIT)
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 20)
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const good = processesIn(fixture.root, isAServer).find(leadsItsGroup)?.pid ?? 0
      writeFileSync(join(fixture.root, '.migrate'), '4000')
      const reader = keepReadingTimed(url, 100, 4000)
      appendFileSync(fixture.entry, '\n// a restart into a server that migrates for 4 s\n')
      await until(() => processesIn(fixture.root, isAServer).some((one) => leadsItsGroup(one) && one.pid !== good), () => lines.join('\n'), 20_000)
      const migrating = processesIn(fixture.root, isAServer).find((one) => leadsItsGroup(one) && one.pid !== good)?.pid ?? 0
      expect(migrating).toBeGreaterThan(0)
      // Twice the limit migrating, then the server listens and answers. It is the same server.
      await until(() => lines.some((line) => line.includes('restarting the server')), () => lines.join('\n'), 5000)
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      const said = during.filter((one) => 'status' in one.result && one.result.status !== 200)
      expect(said.length, lines.join('\n')).toBeGreaterThan(20)
      for (const one of said) {
        expect(one.result, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
        expect(theErrorIn(one.result)).toContain(`The server in process group ${String(migrating)} is running its migrations and answers nothing until they finish.`)
      }
      // THE STAND-IN HAS GONE, and every read now meets the server that migrated.
      await until(() => processesIn(fixture.root, isTheStandIn).length === 0, () => lines.join('\n'), 5000)
      for (let ask = 0; ask < 5; ask += 1) {
        const answered = await readOnce(url, 3000)
        expect(answered, lines.join('\n')).toMatchObject({ status: 200, standIn: null })
        expect('body' in answered ? (JSON.parse(answered.body) as { pid: number }).pid : 0).toBe(migrating)
      }
      expect(lines.join('\n')).not.toContain('did not answer within')
      expect(lines.join('\n')).not.toContain('has run its migrations for')
      const samples = sampler.stop()
      expect(Math.max(...samples.map((one) => serverGroups(one.servers)))).toBe(1)
    } finally {
      sayWhatWasMeasured('case 9, the 2 s start limit', whatEachServerTook(fixture.root, supervised))
      sampler.stop()
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 90_000)

  /**
   * A SERVER THAT SAYS ITS MIGRATIONS BEGAN AND NEVER SAYS THEY ENDED (check `m5X4lu3B2F7L`). Every
   * read meets the stand-in, which says the office is migrating. At the bound, 3 s here, serve-dev
   * stops the server by its group, starts no new one until a file changes, and the stand-in names
   * the operations secretary. There is never a second server.
   *
   * MUTATIONS: `theMigrationsBegan` starts no stand-in, and reads time out. `theMigrationsBegan`
   * arms no bound, and the server is never stopped. `startTheStandIn` keeps the stand-in's first
   * reason, and the port goes on saying the server is migrating after it was stopped.
   */
  it('answers while a server says it is migrating and never finishes, and stops it at the bound', async () => {
    const fixture = await aFixtureCheckout(0)
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', THE_MIGRATING_CASES_START_LIMIT)
    vi.stubEnv('MOLE_OFFICE_MIGRATIONS_HAVE_TO_FINISH_WITHIN', '3')
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 20)
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const good = processesIn(fixture.root, isAServer).find(leadsItsGroup)?.pid ?? 0
      writeFileSync(join(fixture.root, '.migrate'), 'never\n')
      const reader = keepReadingTimed(url, 50, 4000)
      appendFileSync(fixture.entry, '\n// a restart into a server whose migrations never end\n')
      await until(() => processesIn(fixture.root, isAServer).some((one) => leadsItsGroup(one) && one.pid !== good), () => lines.join('\n'), 20_000)
      const stuck = processesIn(fixture.root, isAServer).find((one) => leadsItsGroup(one) && one.pid !== good)?.pid ?? 0
      expect(stuck).toBeGreaterThan(0)
      await until(() => lines.some((line) => line.includes('has run its migrations for 3s')), () => lines.join('\n'), 20_000)
      await until(() => isGone(stuck), () => lines.join('\n'), 15_000)
      // Longer than the next backoff: a forbidden retry would start in this quiet window.
      const restarts = supervised.owner.restartsSoFar()
      const seen: number[] = []
      const deadline = Date.now() + theBackoffAfter(1) + 500
      while (Date.now() < deadline) {
        seen.push(processesIn(fixture.root, isAServer).length)
        await sleep(100)
      }
      expect(Math.max(...seen), lines.join('\n')).toBe(0)
      expect(supervised.owner.restartsSoFar()).toBe(restarts)
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      const said = during.filter((one) => 'status' in one.result && one.result.status !== 200)
      for (const one of said) expect(one.result, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
      const migratingSaid = said.filter((one) => theErrorIn(one.result).includes(`The server in process group ${String(stuck)} is running its migrations`))
      expect(migratingSaid.length, lines.join('\n')).toBeGreaterThan(20)
      const read = await readOnce(url, 3000)
      expect(read, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
      expect(theErrorIn(read)).toContain(`The server in process group ${String(stuck)} has run its migrations for 3s and has not finished them`)
      expect(theErrorIn(read)).toContain('starts no new server until a file the server is built from changes')
      expect(theErrorIn(read)).toContain('The operations secretary is to look at why the migrations did not finish.')
      // A CHANGED FILE STARTS ONE AGAIN, and its migrations, which end, are not held against it.
      writeFileSync(join(fixture.root, '.migrate'), '1000')
      appendFileSync(fixture.entry, '\n// the fix\n')
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      expect(await readOnce(url, 3000)).toMatchObject({ status: 200, standIn: null })
      const samples = sampler.stop()
      expect(Math.max(...samples.map((one) => serverGroups(one.servers)))).toBe(1)
    } finally {
      sayWhatWasMeasured('case 11, the 2 s start limit', whatEachServerTook(fixture.root, supervised))
      sampler.stop()
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)

  /**
   * AFTER THREE SERVERS IN A ROW ARE STOPPED FOR NOT ANSWERING, NONE IS STARTED until a file changes
   * (message DXXb8QZ_9EfG), and the stand-in says so and names the operations secretary.
   */
  it('starts no new server after the third stop in a row for not answering, until a file changes', async () => {
    const fixture = await aFixtureCheckout(0)
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '1')
    // A FIRST BACKOFF OF 0.1 S rather than serve-dev's 0.5 s, so the stops come 0.1 and 0.2 s apart and
    // the next backoff the quiet time below must outlast is 0.4 s rather than 2 s. The count of stops
    // in a row does not read the clock.
    const clocks = { ...THE_TEST_CLOCKS, firstBackoff: 100 }
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture, serveDev, clocks)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      writeFileSync(join(fixture.root, '.hang'), 'hang\n')
      appendFileSync(fixture.entry, '\n// a restart into servers that never listen\n')
      await until(() => lines.some((line) => line.includes('3 servers in a row stopped for not answering')), () => lines.join('\n'), 60_000)
      await until(() => processesIn(fixture.root, isAServer).length === 0, () => lines.join('\n'), 15_000)
      // Longer than the next 0.4 s backoff and 1 s answer limit: no server starts in that time.
      const restarts = supervised.owner.restartsSoFar()
      const seen: number[] = []
      const deadline = Date.now() + theBackoffAfter(3, clocks) + 1000 + 250
      while (Date.now() < deadline) {
        seen.push(processesIn(fixture.root, isAServer).length)
        await sleep(100)
      }
      expect(Math.max(...seen), lines.join('\n')).toBe(0)
      expect(supervised.owner.restartsSoFar()).toBe(restarts)
      const read = await readOnce(url, 3000)
      expect(read, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
      expect(theErrorIn(read)).toContain('3 servers in a row stopped for not answering')
      expect(theErrorIn(read)).toContain('starts no new server until a file the server is built from changes')
      expect(theErrorIn(read)).toContain('The operations secretary is to look')
      // A CHANGED FILE STARTS ONE AGAIN, and a server that answers ends the run.
      rmSync(join(fixture.root, '.hang'))
      appendFileSync(fixture.entry, '\n// the fix\n')
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      expect(await readOnce(url, 3000)).toMatchObject({ status: 200, standIn: null })
    } finally {
      sayWhatWasMeasured('case 10, the 1 s start limit', whatEachServerTook(fixture.root, supervised))
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)

  /**
   * "IN A ROW" IS SAID ONLY OF STOPS WITH NO OTHER SERVER BETWEEN THEM (round 6e of wave 13x). The
   * count of stops goes back to zero only when serve-dev itself sees a server answer. A server that
   * an edit replaced before serve-dev asked it stood between two stops, and the words still said
   * "3 servers in a row". Here an edit replaces the second hanging server while it starts, and the
   * words name it. The answer limit stays 3 s. The first backoff is 0.1 s rather than 0.5 s, so the
   * two backoffs are 0.1 s and 0.2 s; the count of stops and the replaced-server sentence do not
   * read the clock.
   *
   * MUTATION: `restart` does not count the server it replaced, and the words say "3 servers in a row".
   */
  it('names a server a restart replaced between the stops, and does not call the stops in a row', async () => {
    const fixture = await aFixtureCheckout(0)
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '3')
    const clocks = { ...THE_TEST_CLOCKS, firstBackoff: 100 }
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture, serveDev, clocks)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      await untilServeDevHasAskedTheFirstServer(fixture.root, supervised)
      writeFileSync(join(fixture.root, '.hang'), 'hang\n')
      appendFileSync(fixture.entry, '\n// a restart into servers that never listen\n')
      // THE FIRST STOP, AND THE SERVER ITS BACKOFF STARTS: an edit replaces that one within its limit.
      await until(() => lines.some((line) => line.includes('restarting the server: the previous run did not answer within 3s')), () => lines.join('\n'), 30_000)
      appendFileSync(fixture.entry, '\n// an edit while the second such server starts\n')
      const third = (line: string): boolean => line.includes('That is 3 servers')
      await until(() => lines.some(third), () => lines.join('\n'), 60_000)
      const said = lines.find(third) ?? ''
      expect(said, lines.join('\n')).toContain('That is 3 servers stopped for not answering since serve-dev last saw a server answer, so serve-dev is stopping this one')
      expect(said).toContain('Between those stops a restart replaced 1 other server before serve-dev had seen whether it answered.')
      expect(said).not.toContain('in a row')
      // THE STAND-IN SAYS THE SAME.
      const read = await readOnce(url, 3000)
      expect(read, lines.join('\n')).toMatchObject({ status: 503, standIn: String(process.pid) })
      expect(theErrorIn(read)).toContain('Between those stops a restart replaced 1 other server')
      // THE THIRD SERVER IS GONE BEFORE THE STOP BELOW. A stop that met serve-dev's own stop of that
      // server, while its diagnostic report paused it, waited the 5 s child limit and killed it.
      await until(() => processesIn(fixture.root, isAServer).length === 0, () => lines.join('\n'), 15_000)
    } finally {
      sayWhatWasMeasured('case 15, the 3 s start limit', whatEachServerTook(fixture.root, supervised))
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)

  /**
   * A STAND-IN TAKES THE QUEUE BEFORE IT LEAVES (check `SJFYLt5k4wwi`). On a loaded machine node took
   * longer to start the stand-in than the backoff, and the backoff restart's SIGTERM ended it before
   * it took anything. And a stand-in that did listen took only the first few waiting connections
   * before it closed. Either way the reads queued behind the first server that never answers waited
   * through the next one as well. Here a module loaded before every node child holds only the
   * stand-in for 1.5 s, which is that machine's slow start without the load. It also holds the
   * stand-in for 300 ms just after it listens, before node has taken anything from the queue. Node
   * then runs the stand-in's due timer before it takes the waiting connections, as a stand-in held
   * up by the load did (`ss` showed 13 connections waiting when it said `listening`).
   *
   * ITS FIRST SERVER NEVER ANSWERS (`.hang-once`). At a55005fbb, under load, serve-dev stopped the
   * first server before the edit, and this case compared the reads with that stop's words and not
   * with the first stop after the edit. Now a stop before the edit happens every run.
   *
   * MUTATIONS: `stopOneStandIn` sends SIGTERM without waiting for `listening`, and a queued read is
   * answered in the third stand-in's words. The stand-in says `listening` as soon as it listens,
   * without waiting for the queue to go quiet, and one is answered in the second stand-in's words.
   * The stand-in says it on the timer's quiet alone, without looking again in `setImmediate`, and
   * one is answered in the second stand-in's words.
   */
  it('lets a stand-in that is slow to start take the queue before the backoff restart stops it', async () => {
    const fixture = await aFixtureCheckout(0)
    const slow = join(fixture.root, 'slow-stand-in.mjs')
    const started = join(fixture.root, '.stand-ins-held')
    writeFileSync(slow, [
      "import { appendFileSync } from 'node:fs'",
      "import { Server } from 'node:net'",
      "if (process.argv.some((part) => part.endsWith('serve-dev-stand-in.mjs'))) {",
      `  appendFileSync(${JSON.stringify(started)}, String(process.pid) + '\\n')`,
      '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)',
      '  const listen = Server.prototype.listen',
      '  Server.prototype.listen = function (...args) {',
      '    const listening = listen.apply(this, args)',
      "    this.once('listening', () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300))",
      '    return listening',
      '  }',
      '}',
      '',
    ].join('\n'))
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '3')
    vi.stubEnv('NODE_OPTIONS', `--import=${pathToFileURL(slow).href}`)
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    const sampler = sampleProcesses(fixture.root, 20)
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      // THE FIRST SERVER NEVER ANSWERS, so serve-dev has stopped one server before the edit, as it did
      // under load at a55005fbb, and the stop the reads are compared with has to be chosen after the edit.
      writeFileSync(join(fixture.root, '.hang-once'), 'hang\n')
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      expect(lines.join('\n')).toContain('did not answer within 3s of its start')
      writeFileSync(join(fixture.root, '.hang'), 'hang\n')
      const reader = keepReadingTimed(url, 100, 30_000)
      const appendedAt = Date.now()
      appendFileSync(fixture.entry, '\n// a restart into a server that never listens\n')
      // Stop sending once the first server after the edit is stopped; its stand-in must answer every queued read.
      await until(() => {
        const edited = lines.findIndex((line) => line.includes('restarting the server: src/server/index.ts changed'))
        return edited >= 0 && lines.slice(edited).some((line) => line.includes('did not answer within 3s of its start'))
      }, () => lines.join('\n'), 30_000)
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      expect(readFileSync(started, 'utf8').trim().split('\n').length).toBeGreaterThanOrEqual(1)
      expect(lines.join('\n')).toContain('restarting the server: the previous run did not answer within 3s')
      // EACH STAND-IN IS GIVEN THE SENTENCE SERVE-DEV SAID, which names the server's group. A read sent
      // in the first two seconds and not answered by the old server waited behind the first server
      // that never answers, and is answered in the first stand-in's words, not the second's.
      // THE FIRST STOP AFTER THE EDIT'S RESTART. At a55005fbb this took the first stop in the whole run,
      // and under load that was the first server's, stopped before the edit (round 6e of wave 13x).
      const edited = lines.findIndex((line) => line.includes('restarting the server: src/server/index.ts changed'))
      expect(edited, lines.join('\n')).toBeGreaterThan(-1)
      const first = lines.slice(edited).find((line) => line.includes('did not answer within 3s of its start')) ?? ''
      expect(first, lines.join('\n')).not.toBe('')
      const queued = during.filter((one) => one.sentAt < appendedAt + 2000 && 'status' in one.result && one.result.status !== 200)
      const firstTwoSeconds = during.filter((one) => one.sentAt < appendedAt + 2000)
      const what = firstTwoSeconds.map((one) => `${String(one.sentAt - appendedAt)} ms: ${'status' in one.result ? String(one.result.status) : one.result.failed}`)
      expect(queued.length, `reads sent in the first 2 s after the edit: ${what.join(', ')}\n${lines.join('\n')}`).toBeGreaterThan(5)
      for (const one of queued) expect(theErrorIn(one.result), lines.join('\n')).toContain(first.replace('[dev] ', ''))
      const samples = sampler.stop()
      expect(Math.max(...samples.map((one) => serverGroups(one.servers)))).toBe(1)
    } finally {
      sayWhatWasMeasured('case 13, the 3 s start limit', whatEachServerTook(fixture.root, supervised))
      sampler.stop()
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)

  /**
   * THE MIGRATIONS' STAND-IN GOES AT ONCE WHEN THEY END (check `SJFYLt5k4wwi`). serve-dev waits for a
   * stand-in's `listening` before it stops it on the way to a restart, so the stand-in takes the
   * queue first (case 13). When the migrations end, the server is already listening, and a stand-in
   * that started listening then would take reads beside it and answer 503 for a server that is ready.
   * On a loaded machine case 11 read 200 from such a server and its next read 503 from the stand-in.
   * Here the module from case 13 holds the stand-in for 1.5 s, and the migrations last 1 s.
   *
   * MUTATION: the migrations' end waits for `listening` as a restart does, and reads sent after the
   * server's first 200 are answered 503 by the stand-in.
   */
  it('stops the migrations\' stand-in at once when they end, so no read after the server answers meets it', async () => {
    const fixture = await aFixtureCheckout(0)
    const slow = join(fixture.root, 'slow-stand-in.mjs')
    const started = join(fixture.root, '.stand-ins-held')
    writeFileSync(slow, [
      "import { appendFileSync } from 'node:fs'",
      "if (process.argv.some((part) => part.endsWith('serve-dev-stand-in.mjs'))) {",
      `  appendFileSync(${JSON.stringify(started)}, String(process.pid) + '\\n')`,
      '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)',
      '}',
      '',
    ].join('\n'))
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', '5')
    vi.stubEnv('NODE_OPTIONS', `--import=${pathToFileURL(slow).href}`)
    let supervised: Awaited<ReturnType<typeof superviseTheFixture>> | null = null
    try {
      const url = `http://127.0.0.1:${String(fixture.port)}/api/health`
      supervised = await superviseTheFixture(fixture)
      const lines = supervised.lines
      await untilItAnswers(url, 30_000, () => lines.join('\n'))
      const old = await readOnce(url, 3000)
      const oldPid = 'body' in old ? (JSON.parse(old.body) as { pid: number }).pid : 0
      expect(oldPid).toBeGreaterThan(0)
      writeFileSync(join(fixture.root, '.migrate'), '1000')
      const reader = keepReadingTimed(url, 20, 10_000)
      appendFileSync(fixture.entry, '\n// a restart into a server that migrates for 1 s\n')
      await until(() => lines.some((line) => line.includes('restarting the server')), () => lines.join('\n'), 10_000)
      const deadline = Date.now() + 30_000
      for (;;) {
        const one = await readOnce(url, 3000)
        if ('body' in one && one.status === 200 && (JSON.parse(one.body) as { pid: number }).pid !== oldPid) break
        expect(Date.now(), lines.join('\n')).toBeLessThan(deadline)
        await sleep(100)
      }
      // READ ON UNTIL THE STAND-IN HAS STARTED AND IS GONE, and for more than 20 reads after the new
      // server's first 200. Before this wait the reads went on a fixed 1.5 s for the stand-in's slow
      // start and 2 s more. A stand-in that is gone answers nothing more, so the reads after it are
      // all the new server's, however slow the stand-in was to start.
      const theNewServer = (one: TimedRead): boolean =>
        'body' in one.result && one.result.status === 200 && (JSON.parse(one.result.body) as { pid: number }).pid !== oldPid
      const readsAfterTheFirstNew = (): number => {
        const firstSentAt = Math.min(...reader.completed.filter(theNewServer).map((one) => one.sentAt))
        return reader.completed.filter((one) => one.sentAt > firstSentAt).length
      }
      await until(() => existsSync(started) && processesIn(fixture.root, isTheStandIn).length === 0 && readsAfterTheFirstNew() > 20,
        () => lines.join('\n'), 15_000)
      const during = await reader.stop()
      expect(during.flatMap((one) => ('failed' in one.result ? [one.result.failed] : [])), lines.join('\n')).toEqual([])
      expect(readFileSync(started, 'utf8').trim().split('\n').length, lines.join('\n')).toBeGreaterThanOrEqual(1)
      const firstNew = during.find(theNewServer)
      expect(firstNew, lines.join('\n')).toBeDefined()
      const after = during.filter((one) => one.sentAt > (firstNew?.sentAt ?? 0))
      expect(after.length, lines.join('\n')).toBeGreaterThan(20)
      expect(after.filter((one) => !theNewServer(one)).map((one) => theErrorIn(one.result)), lines.join('\n')).toEqual([])
    } finally {
      sayWhatWasMeasured('case 14, the 5 s start limit', whatEachServerTook(fixture.root, supervised))
      await supervised?.owner.stop()
      for (const left of processesIn(fixture.root, isAServer)) {
        try { process.kill(-left.pgid, 'SIGKILL') } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
      vi.unstubAllEnvs()
      rmSync(fixture.root, { recursive: true, force: true })
    }
  }, 120_000)
})

// ================================================================ 12. the stand-in leaving

describe('the stand-in answers every read it has taken before it leaves', () => {
  /**
   * CHECK `SJFYLt5k4wwi`. Node takes every connection waiting in the queue at once and reads each
   * request after. On a loaded machine the stand-in was stopped between the two, and it closed what
   * it had taken: 4 reads reset and 3 closed unanswered in 16 runs of this file and its cases on
   * 7 October 2026. Here the order is made certain instead of left to load: twenty connections are
   * taken by the stand-in, it is told to stop, and only then are their requests sent.
   *
   * MUTATION: the stand-in's `leave` calls `closeAllConnections()` at once, as it did before. The
   * twenty reads then end without an answer.
   */
  it('answers with 503 a read whose connection it took before it was told to stop, and then exits', async () => {
    const port = await freePort()
    const held = holdThePort(port)
    const standIn = spawn(process.execPath, [join(REPO, 'tools/serve-dev-stand-in.mjs'), `--supervisor-pid=${String(process.pid)}`, '--reason=a test.'], {
      stdio: ['ignore', 'pipe', 'pipe', held as never],
    })
    let said = ''
    standIn.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    standIn.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    const exited = new Promise<number | null>((done) => standIn.once('exit', (code) => done(code)))
    try {
      await until(() => said.includes('listening'), () => said, 20_000)
      const taken = Array.from({ length: 20 }, () => {
        const socket = aConnection(port, '127.0.0.1')
        const read = { got: '', ended: '' }
        socket.on('data', (chunk: Buffer) => (read.got += chunk.toString()))
        socket.on('error', (err: NodeJS.ErrnoException) => (read.ended ||= err.code ?? err.message))
        socket.on('close', () => (read.ended ||= 'closed'))
        return { socket, read }
      })
      // An idle stand-in takes a connection within milliseconds of its arrival.
      await sleep(500)
      standIn.kill('SIGTERM')
      await sleep(100)
      for (const one of taken) one.socket.write(`GET /api/health HTTP/1.1\r\nhost: 127.0.0.1:${String(port)}\r\n\r\n`)
      expect(await exited, said).toBe(0)
      await until(() => taken.every((one) => one.read.ended !== ''), () => JSON.stringify(taken.map((one) => one.read.ended)), 5000)
      for (const one of taken) {
        expect(one.read.got.split('\r\n')[0], JSON.stringify(one.read)).toBe('HTTP/1.1 503 Service Unavailable')
        expect(one.read.got.toLowerCase()).toContain(`${STAND_IN_HEADER}: ${String(process.pid)}`)
      }
    } finally {
      if (standIn.exitCode === null && standIn.signalCode === null) standIn.kill('SIGKILL')
      held.close()
    }
  }, 60_000)

  /** A connection that never asks cannot hold it: it is ended at the grace and the stand-in exits. */
  it('ends a connection that never sends a request at the grace, and exits', async () => {
    const port = await freePort()
    const held = holdThePort(port)
    const standIn = spawn(process.execPath, [join(REPO, 'tools/serve-dev-stand-in.mjs'), `--supervisor-pid=${String(process.pid)}`, '--reason=a test.'], {
      stdio: ['ignore', 'pipe', 'pipe', held as never],
    })
    let said = ''
    standIn.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    const exited = new Promise<number | null>((done) => standIn.once('exit', (code) => done(code)))
    const silent = { socket: null as ReturnType<typeof aConnection> | null }
    try {
      await until(() => said.includes('listening'), () => said, 20_000)
      silent.socket = aConnection(port, '127.0.0.1')
      silent.socket.on('error', () => undefined)
      await sleep(300)
      const stoppedAt = Date.now()
      standIn.kill('SIGTERM')
      expect(await exited).toBe(0)
      const took = Date.now() - stoppedAt
      expect(took).toBeGreaterThanOrEqual(THE_STAND_IN_GRACE_MS - 50)
      expect(took).toBeLessThan(THE_STAND_IN_GRACE_MS + 3000)
    } finally {
      silent.socket?.destroy()
      if (standIn.exitCode === null && standIn.signalCode === null) standIn.kill('SIGKILL')
      held.close()
    }
  }, 60_000)
})
