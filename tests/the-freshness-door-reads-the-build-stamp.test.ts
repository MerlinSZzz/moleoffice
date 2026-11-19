// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FRESHNESS DOOR READS THE BUILT PAGE AGAINST THE BUILD'S OWN STAMP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * S2 of design/ground/ACCEPTANCE.md section 9. A built page is a bundle and has no process to ask,
 * so `vite build` writes a stamp into `dist/web` — the newest source file it took in and the commit
 * — and `GET /api/runtime/freshness` compares that with the source on disk now. After a page file
 * changes and before the page is built again, the door says the page is behind the checkout; after
 * the rebuild it says the page is as new as the checkout.
 *
 * WHAT THE FILES HOLD DECIDES, when the build recorded it (wave 13y round 91, item 11c). The build
 * also writes down the digest of what the page's files held (src/config/content-digest.mjs), and the
 * door compares that with what they hold now, as the page itself has since round 87. A file touched
 * without being changed leaves the page as new as the checkout. Live after an upgrade on 27 October
 * 2026, the door said "older than the checkout" for that reason while the page rightly said nothing.
 * Only a build that recorded no digest is judged by the files' times, and the door then says so.
 *
 * ---------------------------------------------------------------------------------------
 * IT MAKES ITS OWN CHECKOUT
 * ---------------------------------------------------------------------------------------
 *
 * A build writes `dist/`, and moving the mtime of a file in this checkout would make every other
 * server in the same run report itself stale. So the parts a server and a build need are copied
 * into a temporary directory and everything happens there.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY READING IS ITS OWN SERVER'S
 * ---------------------------------------------------------------------------------------
 *
 * A reading from another server proves nothing about this checkout. In one queue run every reading
 * after the first was the same build of some other server: the port this test chose was free when
 * it was chosen and was taken before the scratch server listened on it. So,
 * after the port is chosen and before the server is started, another server tries to take that
 * port and answers every request with a reading of another database. The test then asks that each
 * reading names the database of the server it started. Since wave 13y round 115 the port is held by
 * a listening socket from the moment it is chosen, and the server listens on that socket
 * (`aHeldPort`), so the other server never gets the port.
 */

import { apiServerArguments } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, readFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import net, { type Server } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { buildThePage } from '../tools/build-the-page.mjs'
import { readTheBuildStamp } from '../src/config/build-stamp.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A scratch checkout is not a git repository, and the stamp records a commit. Make one. */
function makeItACheckout(root: string): void {
  const run = (args: string[]): void => {
    const ran = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    if (ran.status !== 0) throw new Error(`git ${args.join(' ')} failed in the scratch: ${ran.stderr}`)
  }
  run(['init', '-q'])
  run(['add', '-A'])
  run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'the scratch checkout'])
}

/** The socket the scratch server listens on, with the descriptor `spawn`'s `stdio` takes, and the port the kernel gave it. */
interface AHeldPort { handle: { fd: number; close: () => void }; port: number }

/**
 * A LISTENING SOCKET ON A PORT THE KERNEL PICKS, held from the moment the port is chosen. It is handed to the scratch
 * server as descriptor 3, and the server listens on it (MOLE_OFFICE_LISTEN_FD, src/server/index.ts). The port is never
 * let go between the choice and the server's start, so no other server can take it. Until wave 13y round 115 the port
 * was found free by a socket that was closed at once, and a port found so could be taken before the server listened.
 *
 * IT LISTENS HERE, and is not only bound. A socket that is only bound does not keep another server off the port, because
 * the bind lets another socket bind the same address until one of them listens. `net._createServerHandle` is the
 * function `net.Server` itself calls; tools/serve-dev.mjs holds its port with it too.
 */
function aHeldPort(): AHeldPort {
  const handle = (net as unknown as { _createServerHandle: (host: string, port: number, family: number) => number | (AHeldPort['handle'] & { getsockname: (out: { port?: number }) => number; listen: (backlog: number) => number }) })._createServerHandle('127.0.0.1', 0, 4)
  if (typeof handle === 'number') throw new Error(`No socket could be bound on 127.0.0.1 (error ${String(handle)}).`)
  const bound: { port?: number } = {}
  const notRead = handle.getsockname(bound)
  const notListening = notRead === 0 ? handle.listen(511) : notRead
  if (notListening !== 0 || bound.port === undefined) {
    handle.close()
    throw new Error(`The socket for the scratch server could not be held (error ${String(notListening)}, port ${String(bound.port)}).`)
  }
  return { handle, port: bound.port }
}

interface Reading {
  world?: { database?: string }
  freshness: {
    contentForThePage: string | null
    builtPage: {
      verdict: string
      says: string
      builtAt: string | null
      builtFromCommit: string | null
      builtFromSourceFile: string | null
    }
  }
}

let dir = ''
let api = ''
let child: ChildProcess | null = null
const seen = {
  beforeTheChange: null as Reading['freshness'] | null,
  afterATouch: null as Reading['freshness'] | null,
  afterTheChange: null as Reading['freshness'] | null,
  afterTheRebuild: null as Reading['freshness'] | null,
  withNoRecordOfWhatTheBuildRead: null as Reading['freshness'] | null,
  theStampAfterTheFirstBuild: null as ReturnType<typeof readTheBuildStamp> | null,
  whatTheFirstBuildRecorded: null as unknown,
  theRecordWasThereAfterTheRebuild: false,
  /** The database each answer named, in the order they came. */
  databasesThatAnswered: [] as string[],
}

/** The other server, while it holds the port this test chose. */
let other: Server | null = null

/** What the other server answers to every request: a reading of another database, made up by this test. */
const ANOTHER_SERVERS_READING = {
  world: { database: '/a database of another server, made up by this test.db' },
  freshness: {
    contentForThePage: null,
    builtPage: { verdict: 'as new as the checkout', says: 'Made up by this test for another server.', builtAt: null, builtFromCommit: null, builtFromSourceFile: null },
  },
}

/**
 * ANOTHER SERVER TRIES TO TAKE THE PORT, after it was chosen and before the scratch server is started. It is held when
 * it gets it. A port already in use is the answer that it could not; any other failure stops the test.
 */
function anotherServerTries(port: number): Promise<void> {
  return new Promise((done, fail) => {
    const tries = createHttpServer((_asked, answer) => {
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end(JSON.stringify(ANOTHER_SERVERS_READING))
    })
    tries.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') done()
      else fail(err)
    })
    tries.listen(port, '127.0.0.1', () => {
      other = tries
      done()
    })
  })
}

/** Where a build writes down what the page's files held (vite.config.ts, `serveTheSourceStamp`). */
const THE_RECORD_OF_WHAT_THE_BUILD_READ = 'dist/web/content-digest.json'

async function freshness(): Promise<Reading['freshness'] | null> {
  try {
    const answered = await fetch(`${api}/api/runtime/freshness`, {
      headers: { 'x-mole-office-workspace': 'default' },
      signal: AbortSignal.timeout(4000),
    })
    if (!answered.ok) return null
    const reading = (await answered.json()) as Reading
    seen.databasesThatAnswered.push(reading.world?.database ?? 'an answer that named no database')
    return reading.freshness
  } catch {
    return null
  }
}

async function untilItAnswers(within = 120_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    const reading = await freshness()
    if (reading !== null && reading.builtPage.verdict !== undefined) return
    await sleep(250)
  }
  throw new Error(`the scratch API never answered within ${String(within / 1000)}s`)
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('build-stamp')
  for (const part of ['src', 'drizzle', 'public', 'package.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs', 'for-agents/a-full-list-read.mjs']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  makeItACheckout(dir)

  // THE FIRST BUILD, by the same function the supervisor runs.
  const built = await buildThePage({ root: dir })
  expect(built.ok, 'the scratch page did not build at all').toBe(true)
  seen.theStampAfterTheFirstBuild = readTheBuildStamp(join(dir, 'dist/web'))
  if (existsSync(join(dir, THE_RECORD_OF_WHAT_THE_BUILD_READ))) {
    seen.whatTheFirstBuildRecorded = JSON.parse(readFileSync(join(dir, THE_RECORD_OF_WHAT_THE_BUILD_READ), 'utf8')) as unknown
  }

  const { handle, port } = aHeldPort()
  api = `http://127.0.0.1:${String(port)}`
  await anotherServerTries(port)
  // NODE ITSELF, WITH TSX AS A LOADER, as the dev supervisor starts its server: the `tsx` command starts a second node
  // and gives it descriptor 3 for its own channel, so the server would not get the socket there.
  child = spawn(process.execPath, apiServerArguments(['--import', 'tsx']), {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', handle.fd],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_LISTEN_FD: '3',
      MOLE_OFFICE_DB: join(dir, 'stamp.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      LOG_LEVEL: 'warn',
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
  // THIS PROCESS'S COPY IS CLOSED once the server has its own. The socket stays open, and listening, in the server.
  handle.close()
  await untilItAnswers()
  seen.beforeTheChange = await freshness()

  // ------------------- A PAGE FILE IS TOUCHED WITHOUT BEING CHANGED, AND THE PAGE IS STILL AS NEW
  // Two seconds on, so the touch is a later second than anything the build read.
  await sleep(2000)
  const when = new Date()
  utimesSync(join(dir, 'src/web/App.tsx'), when, when)
  seen.afterATouch = await freshness()

  // ------------------------------ A PAGE FILE CHANGES, AND THE DOOR SAYS THE PAGE IS BEHIND
  appendFileSync(join(dir, 'src/web/App.tsx'), '// A line the build did not read.\n')
  seen.afterTheChange = await freshness()

  // --------------------------------------------- THE REBUILD, AND THE DOOR SAYS IT IS NEW AGAIN
  const rebuilt = await buildThePage({ root: dir })
  expect(rebuilt.ok, 'the scratch page did not rebuild').toBe(true)
  seen.afterTheRebuild = await freshness()

  // ------------- A BUILD THAT RECORDED NOTHING OF WHAT IT READ IS JUDGED BY THE TIMES, AND SAYS SO
  seen.theRecordWasThereAfterTheRebuild = existsSync(join(dir, THE_RECORD_OF_WHAT_THE_BUILD_READ))
  rmSync(join(dir, THE_RECORD_OF_WHAT_THE_BUILD_READ), { force: true })
  await sleep(2000)
  const later = new Date()
  utimesSync(join(dir, 'src/web/App.tsx'), later, later)
  seen.withNoRecordOfWhatTheBuildRead = await freshness()
}, 300_000)

afterAll(async () => {
  other?.close()
  if (child?.pid !== undefined && child.pid !== null) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone, which is the outcome that was wanted.
    }
    await sleep(1000)
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Gone, as asked.
    }
  }
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

describe('the readings are the scratch server\'s own', () => {
  it('names the database of the server this test started, in every answer', () => {
    expect(seen.databasesThatAnswered.length, 'how many answers named a database').toBeGreaterThanOrEqual(6)
    expect(new Set(seen.databasesThatAnswered), 'the databases the answers named').toEqual(new Set([join(dir, 'stamp.db')]))
  })
})

describe('the built page carries a stamp saying what the build took in', () => {
  it('is a readable stamp with a commit and the newest source file', () => {
    const stamp = seen.theStampAfterTheFirstBuild
    expect(stamp?.state).toBe('read')
    if (stamp?.state !== 'read') return
    expect(stamp.builtAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(stamp.newestSourceAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(stamp.newestSourceFile).toMatch(/^src\//)
    expect(stamp.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('records the digest of what the files held, the same digest the server works out from them', () => {
    expect(seen.whatTheFirstBuildRecorded, `${THE_RECORD_OF_WHAT_THE_BUILD_READ} after the first build`).toEqual({
      contentDigest: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
    expect((seen.whatTheFirstBuildRecorded as { contentDigest: string }).contentDigest).toBe(seen.beforeTheChange?.contentForThePage)
  })
})

describe('the freshness door compares the built page with the checkout', () => {
  it('says as new as the checkout while the page and the tree agree', () => {
    expect(seen.beforeTheChange?.builtPage.verdict).toBe('as new as the checkout')
    expect(seen.beforeTheChange?.builtPage.says).toContain('hold what that build read')
  })

  it('says as new as the checkout after a page file is touched without being changed', () => {
    expect(seen.afterATouch?.builtPage.verdict).toBe('as new as the checkout')
    expect(seen.afterATouch?.builtPage.says).toContain('hold what that build read')
    expect(seen.afterATouch?.builtPage.says).not.toContain('times')
  })

  it('says older than the checkout after a page file changes', () => {
    expect(seen.afterTheChange?.builtPage.verdict).toBe('older than the checkout')
    expect(seen.afterTheChange?.builtPage.says).toContain('no longer hold what that build read')
    expect(seen.afterTheChange?.builtPage.says).toContain('older than the checkout')
    expect(seen.afterTheChange?.builtPage.says).not.toContain('times')
  })

  it('says as new as the checkout again after the page is rebuilt', () => {
    expect(seen.afterTheRebuild?.builtPage.verdict).toBe('as new as the checkout')
    // And the new stamp is a later build, not the same one.
    expect(seen.afterTheRebuild?.builtPage.builtAt).not.toBe(seen.beforeTheChange?.builtPage.builtAt)
  })

  it('judges a build that recorded nothing of what it read by the times, names the file, and says why', () => {
    expect(seen.theRecordWasThereAfterTheRebuild, `${THE_RECORD_OF_WHAT_THE_BUILD_READ} after the rebuild`).toBe(true)
    expect(seen.withNoRecordOfWhatTheBuildRead?.builtPage.verdict).toBe('older than the checkout')
    expect(seen.withNoRecordOfWhatTheBuildRead?.builtPage.says).toContain('src/web/App.tsx')
    expect(seen.withNoRecordOfWhatTheBuildRead?.builtPage.says).toContain("judged by the files' times alone")
    expect(seen.withNoRecordOfWhatTheBuildRead?.builtPage.says).toContain('did not record what it read')
  })
})
