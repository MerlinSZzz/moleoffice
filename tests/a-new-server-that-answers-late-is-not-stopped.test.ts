// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW SERVER THAT ANSWERS LATE IS NOT STOPPED. A SERVER THAT REFUSES, OR THAT NEVER ANSWERS, STILL IS.
 *
 * tools/serve-dev.mjs gives each new server `MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN` to answer `GET /api/health`,
 * and stops a server that has not answered by then. Until wave 13t it gave each read only `healthRequest`, 2 s in the
 * shipped clocks, and sent another. A server that took longer than that over every read was stopped at the end of its
 * time although it was answering, and started again into the same wait. Now `theServerAnswers` waits for each read until
 * the server's time is up. A read that is answered at all within that time, however late, counts as an answer. A read
 * that is refused, reset or answered with a 5xx is asked again. So a server is stopped only when its port refused
 * every read for the whole time, or when no read had been answered by its end.
 *
 * WHAT EACH CASE HOLDS. serve-dev runs in this process on a made-up checkout, as in
 * tests/the-office-answers-while-it-restarts.test.ts, with short clocks. Its server is a small HTTP server that does
 * what the file `.how` says when it starts. The server that serve-dev starts first answers at once, and the test writes
 * `.how` before the server it is about starts:
 *   1. At a restart after a file change, a server that answers each read 8 s after it takes it, in a 15 s time, is not
 *      stopped. serve-dev's read is answered at least 7.9 s after the server took it, no line says the server did not
 *      answer, no restart follows, and the server is still running after the 15 s are over.
 *   2. At the same restart, a server that resets every read it takes is stopped at the end of a 3 s time.
 *   3. At the same restart, a server that takes a read and never answers it is stopped at the end of a 3 s time.
 *   4. A first server that never listens is stopped at the end of a 3 s time. Before any server has listened, serve-dev's
 *      port is bound and not listening, so every read is refused by the port itself.
 *   5 to 7. Cases 1 to 3 again, at the restart after the first server stopped on its own.
 *
 * By the code before the change, case 1 and case 5 fail there, because each read was given up after `healthRequest`,
 * and cases 2, 3, 4, 6 and 7 hold there too. Nobody ran them before the change.
 *
 * WHAT IT DOES NOT CATCH. A time longer than 300 s: Node's own fetch gives up on a reply after 300 s, so a server
 * that answers later than that is asked again, and is stopped if it never answers within 300 s. And the first start's
 * wait for the ledger, which serve-dev runs only when it writes itself down, which these cases turn off.
 *
 * Nothing here starts a real office, reads port 28787 or writes in the home folder. Each case removes its checkout and
 * stops every server group its made-up servers recorded, and the settings it sets are taken back.
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer as aNetServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { serveDev } from '../tools/serve-dev.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
/** Short clocks, so no case waits for the shipped ones. */
const THE_TEST_CLOCKS = { goodRun: 250, healthRequest: 100, healthRetry: 50, firstBackoff: 100 }
/** How late the late server answers each read, and the time it is given: longer than that. */
const LATE_MS = 8_000
const THE_LONG_TIME = '15'
/** The time a server that refuses, resets or never answers is given. */
const THE_SHORT_TIME = '3'

/** What the made-up server wrote down: one line for each thing it did. */
type Mark = { pid: number; group: number; how: string; what: string; read?: number; at: number }

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

/**
 * The made-up server. `.how`, read once when it starts: `late <ms>` answers each read that long after it takes it,
 * `reset` ends each read's connection at once, `silent` takes each read and never answers, `never-listens` never
 * listens, and anything else answers at once. `.crash`: the server running removes it and exits with code 1.
 */
function fixtureSource(): string {
  return `
    import { createServer } from 'node:http'
    import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
    import { aWatchOnTheStarter } from ${JSON.stringify(join(REPO, 'src/config/session-process.mjs'))}
    const stat = readFileSync('/proc/self/stat', 'utf8')
    const group = Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\\s+/)[2])
    const how = existsSync('.how') ? readFileSync('.how', 'utf8').trim() : 'at once'
    const mark = (what, read) => appendFileSync('.marks', JSON.stringify({ pid: process.pid, group, how, what, read, at: Date.now() }) + '\\n')
    mark('started')
    const named = process.argv.find((one) => one.startsWith('--stop-with-pid='))
    if (named !== undefined) {
      const theStarter = aWatchOnTheStarter(Number(named.slice('--stop-with-pid='.length)))
      setInterval(() => { if (theStarter().state === 'gone') process.exit(0) }, 250).unref()
    }
    const alive = setInterval(() => {
      if (!existsSync('.crash')) return
      rmSync('.crash')
      mark('crashed')
      process.exit(1)
    }, 50)
    let reads = 0
    const server = createServer((req, res) => {
      const read = ++reads
      mark('took a read', read)
      if (how === 'reset') return req.socket.destroy()
      if (how === 'silent') return
      const late = how.startsWith('late ') ? Number(how.slice('late '.length)) : 0
      setTimeout(() => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ pid: process.pid }))
        mark('answered a read', read)
      }, late)
    })
    if (process.env.MOLE_OFFICE_LISTEN_FD === undefined) {
      console.error('the made-up server was given no socket to listen on')
      process.exit(2)
    }
    if (how !== 'never-listens') server.listen({ fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) }, () => mark('listening'))
    process.on('SIGTERM', () => {
      clearInterval(alive)
      server.closeAllConnections()
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 200).unref()
    })
  `
}

type Fixture = { root: string; port: number; entry: string }

function aFixtureCheckout(port: number): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-answers-late-'))
  mkdirSync(join(root, 'src/server'), { recursive: true })
  mkdirSync(join(root, 'src/worker'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"type":"module"}')
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  const entry = join(root, 'src/server/index.ts')
  writeFileSync(entry, fixtureSource())
  writeFileSync(join(root, 'src/worker/index.ts'), '// made-up worker entry\n')
  return { root, port, entry }
}

function marksIn(root: string): Mark[] {
  const file = join(root, '.marks')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Mark)
}

function theGroupOfThisProcess(): number {
  const stat = readFileSync('/proc/self/stat', 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[2])
}

/** serve-dev on the made-up checkout, with the given time to answer, its lines kept, and everything taken back after. */
async function withServeDev(time: string, how: { first?: string }, body: (fixture: Fixture, lines: string[], owner: Awaited<ReturnType<typeof serveDev>>) => Promise<void>): Promise<void> {
  const fixture = aFixtureCheckout(await freePort())
  if (how.first !== undefined) writeFileSync(join(fixture.root, '.how'), `${how.first}\n`)
  const lines: string[] = []
  let owner: Awaited<ReturnType<typeof serveDev>> | null = null
  try {
    vi.stubEnv('MOLE_OFFICE_PORT', String(fixture.port))
    vi.stubEnv('MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES', '0')
    vi.stubEnv('MOLE_OFFICE_A_NEW_SERVER_HAS_TO_ANSWER_WITHIN', time)
    owner = await serveDev({ clocks: THE_TEST_CLOCKS, root: fixture.root, writeItDown: false, say: (line) => lines.push(line) })
    await body(fixture, lines, owner)
  } finally {
    await owner?.stop()
    // Each made-up server leads the group serve-dev started it in, and wrote that group down. This process's own group
    // is never one of them, and is never stopped here.
    const ours = theGroupOfThisProcess()
    for (const group of new Set(marksIn(fixture.root).map((one) => one.group))) {
      if (!Number.isInteger(group) || group <= 1 || group === ours) continue
      try { process.kill(-group, 'SIGKILL') } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    vi.unstubAllEnvs()
    rmSync(fixture.root, { recursive: true, force: true })
  }
}

/** Waits until the first server has answered serve-dev's read, so the server the case is about is the next one. */
async function untilTheFirstServerAnswered(fixture: Fixture, lines: string[]): Promise<Mark> {
  await until(() => marksIn(fixture.root).some((one) => one.what === 'answered a read'), () => lines.join('\n'), 30_000)
  return marksIn(fixture.root).find((one) => one.what === 'answered a read')!
}

/** Starts the next server as the case says, and answers its mark of starting. */
async function theNextServer(fixture: Fixture, lines: string[], how: string, by: 'a file change' | 'a crash'): Promise<Mark> {
  const first = await untilTheFirstServerAnswered(fixture, lines)
  writeFileSync(join(fixture.root, '.how'), `${how}\n`)
  if (by === 'a file change') appendFileSync(fixture.entry, '\n// a change, so serve-dev starts the server again\n')
  else writeFileSync(join(fixture.root, '.crash'), 'crash\n')
  const isNext = (one: Mark) => one.what === 'started' && one.pid !== first.pid && one.how === how
  await until(() => marksIn(fixture.root).some(isNext), () => lines.join('\n'), 30_000)
  if (by === 'a crash') {
    expect(marksIn(fixture.root).some((one) => one.pid === first.pid && one.what === 'crashed'), lines.join('\n')).toBe(true)
    expect(lines.some((line) => line.includes('restarting the server: the previous run stopped on its own')), lines.join('\n')).toBe(true)
  }
  return marksIn(fixture.root).find(isNext)!
}

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
}

const theStopOf = (server: Mark, time: string) => `The server in process group ${String(server.group)} did not answer within ${time}s of its start`

async function aLateServerIsNotStopped(by: 'a file change' | 'a crash'): Promise<void> {
  await withServeDev(THE_LONG_TIME, {}, async (fixture, lines, owner) => {
    const late = await theNextServer(fixture, lines, `late ${String(LATE_MS)}`, by)
    const restarts = owner.restartsSoFar()
    const answered = (one: Mark) => one.pid === late.pid && one.what === 'answered a read'
    await until(() => marksIn(fixture.root).some(answered), () => lines.join('\n'), Number(THE_LONG_TIME) * 1000 + 5_000)
    const marks = marksIn(fixture.root)
    const read = marks.find(answered)!
    const took = marks.find((one) => one.pid === late.pid && one.what === 'took a read' && one.read === read.read)!
    // Node's timers count from the loop's own clock, which can be a little behind the wall clock the marks read.
    expect(read.at - took.at, 'how long after it took the read the server answered it').toBeGreaterThanOrEqual(LATE_MS - 100)
    // Past the end of the server's time, with room for one more turn of serve-dev's check.
    const wait = late.at + Number(THE_LONG_TIME) * 1000 + 2_000 - Date.now()
    if (wait > 0) await sleep(wait)
    expect(lines.filter((line) => line.includes('did not answer within')), lines.join('\n')).toEqual([])
    expect(owner.restartsSoFar(), 'restarts after the late server started').toBe(restarts)
    expect(marksIn(fixture.root).filter((one) => one.what === 'started' && one.at > late.at), 'servers started after the late one').toEqual([])
    expect(isRunning(late.pid), 'the late server is still running').toBe(true)
  })
}

async function aServerThatDoesNotAnswerIsStopped(how: 'reset' | 'silent', by: 'a file change' | 'a crash'): Promise<void> {
  await withServeDev(THE_SHORT_TIME, {}, async (fixture, lines) => {
    const server = await theNextServer(fixture, lines, how, by)
    await until(() => lines.some((line) => line.includes(theStopOf(server, THE_SHORT_TIME))), () => lines.join('\n'), Number(THE_SHORT_TIME) * 1000 + 10_000)
    const marks = marksIn(fixture.root).filter((one) => one.pid === server.pid)
    const taken = marks.filter((one) => one.what === 'took a read').length
    // A reset read is asked again, so the server took several. A read that is never answered is waited for, so it
    // took one, and at most one more sent in the last moment of its time.
    if (how === 'reset') expect(taken, 'the reads the resetting server took').toBeGreaterThan(1)
    else expect(taken, 'the reads the silent server took').toBeGreaterThanOrEqual(1)
    expect(marks.filter((one) => one.what === 'answered a read'), 'the reads it answered').toEqual([])
    await until(() => !isRunning(server.pid), () => lines.join('\n'), 20_000)
  })
}

describe('at a restart after a file change', () => {
  it(`does not stop a server that answers each read ${String(LATE_MS / 1000)} s late, in a time of ${THE_LONG_TIME} s`, async () => {
    await aLateServerIsNotStopped('a file change')
  }, 120_000)

  it(`stops a server that resets every read, at the end of a time of ${THE_SHORT_TIME} s`, async () => {
    await aServerThatDoesNotAnswerIsStopped('reset', 'a file change')
  }, 90_000)

  it(`stops a server that takes a read and never answers it, at the end of a time of ${THE_SHORT_TIME} s`, async () => {
    await aServerThatDoesNotAnswerIsStopped('silent', 'a file change')
  }, 90_000)
})

describe('at the first start', () => {
  it(`stops a server whose port refuses every read, at the end of a time of ${THE_SHORT_TIME} s`, async () => {
    await withServeDev(THE_SHORT_TIME, { first: 'never-listens' }, async (fixture, lines) => {
      await until(() => marksIn(fixture.root).some((one) => one.what === 'started'), () => lines.join('\n'), 30_000)
      const server = marksIn(fixture.root).find((one) => one.what === 'started')!
      await until(() => lines.some((line) => line.includes(theStopOf(server, THE_SHORT_TIME))), () => lines.join('\n'), Number(THE_SHORT_TIME) * 1000 + 10_000)
      expect(marksIn(fixture.root).filter((one) => one.pid === server.pid && one.what !== 'started'), 'what the server that never listens did').toEqual([])
      await until(() => !isRunning(server.pid), () => lines.join('\n'), 20_000)
    })
  }, 90_000)
})

describe('at the restart after the server stopped on its own', () => {
  it(`does not stop a server that answers each read ${String(LATE_MS / 1000)} s late, in a time of ${THE_LONG_TIME} s`, async () => {
    await aLateServerIsNotStopped('a crash')
  }, 120_000)

  it(`stops a server that resets every read, at the end of a time of ${THE_SHORT_TIME} s`, async () => {
    await aServerThatDoesNotAnswerIsStopped('reset', 'a crash')
  }, 90_000)

  it(`stops a server that takes a read and never answers it, at the end of a time of ${THE_SHORT_TIME} s`, async () => {
    await aServerThatDoesNotAnswerIsStopped('silent', 'a crash')
  }, 90_000)
})
