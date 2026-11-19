// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "I COULD NOT LOOK" IS NOT "THERE IS NOTHING THERE".
 *
 * The adapter used to catch every error reading ~/.claude/projects and return an empty list. A
 * permission bit, a mount that had gone away and a machine where Claude Code has genuinely never
 * run all arrived at the sessions page as the same cheerful "no sessions", and nothing about that
 * page looked wrong. It is the exact success-shaped silence the orphan sweep upstairs was built to
 * refuse, sitting in the layer that feeds it.
 *
 * So these tests describe a machine where Mole Office is REFUSED, and assert that the answer says so.
 * The directories are made genuinely unreadable with chmod rather than mocked, because the failure
 * being tested is one the operating system produces and a hand-thrown Error would only prove that
 * the catch block catches.
 *
 * The one arrangement that must stay quiet is also here: a directory that is not there is not a
 * failure, it is a tool that has never run, and warning about it on every machine that has never
 * used Claude Code would train people to ignore the warning that matters.
 */

import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import { claudeCodeAdapter } from '../src/server/lib/adapters/claude-code.ts'
import { describeReadFailure } from '../src/server/lib/adapters/types.ts'
import type { AdapterEnv, ProcessInfo } from '../src/server/lib/adapters/types.ts'

/** Every "how long ago" here is measured against this moment. */
const NOW = new Date('2026-08-08T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const REAL_CWD = aRealFolderNamed('adapter-honesty-cwd')
afterAll(() => rmSync(dirname(REAL_CWD), { recursive: true, force: true }))

let home: string
let db: TestDb
type SessionsLib = typeof import('../src/server/lib/sessions.ts')
let sessions: SessionsLib

/** Directories this test locked, so they can be unlocked before the temp tree is removed. */
let locked: string[] = []

beforeAll(async () => {
  db = await freshDb()
  await theProjectHoldsThisFolder('default', REAL_CWD)
  sessions = await import('../src/server/lib/sessions.ts')
}, 60_000)

afterAll(() => db.close())

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-home-'))
  locked = []
})

afterEach(() => {
  // Unlocked first: `rm -r` cannot walk into a directory it is not allowed to read either, so
  // leaving one at 000 would leak the whole temp tree.
  for (const dir of locked) chmodSync(dir, 0o700)
  rmSync(home, { recursive: true, force: true })
})

const projectsRoot = () => join(home, '.claude', 'projects')

/** Write one transcript exactly where Claude Code puts them, and hand back its directory. */
function writeLog(project: string, id: string, text: string, at: string): string {
  const dir = join(projectsRoot(), project)
  mkdirSync(dir, { recursive: true })
  const lines = [
    {
      type: 'user',
      message: { role: 'user', content: text },
      timestamp: at,
      cwd: REAL_CWD,
      entrypoint: 'cli',
    },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, timestamp: at, cwd: REAL_CWD },
  ]
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  return dir
}

/** A project directory with a transcript in it, ready to be locked. */
function lockableDir(project: string): string {
  writeLog(project, 'ffffffff-0000-0000-0000-00000000000f', 'hidden', hoursAgo(3))
  return join(projectsRoot(), project)
}

/**
 * Take away every permission on a directory, and PROVE it took effect.
 *
 * chmod does nothing to root, so under a root test runner every assertion below would pass while
 * testing nothing at all. That is worth failing loudly for rather than skipping quietly: a green
 * test that proves nothing is how this whole class of bug survives.
 */
function lock(dir: string): string {
  chmodSync(dir, 0o000)
  locked.push(dir)
  let refused = false
  try {
    readdirSync(dir)
  } catch {
    refused = true
  }
  if (!refused) {
    throw new Error(
      `${dir} is still readable after chmod 000, which means this test is running as root. It cannot ` +
        'prove anything about unreadable directories in that case — run the suite as an ordinary user.',
    )
  }
  return dir
}

function envWith(opts: { processes?: ProcessInfo[]; scanFails?: string } = {}): AdapterEnv {
  return {
    homeDir: home,
    now: NOW,
    scanProcesses: () =>
      opts.scanFails !== undefined
        ? { ok: false, reason: opts.scanFails }
        : { ok: true, processes: opts.processes ?? [] },
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

// ================================================================================ the adapter

describe('an adapter reports what it could not read, beside what it found', () => {
  it('still returns the sessions it CAN read, and names the directory it could not', () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-readable`, 'aaaaaaaa-0000-0000-0000-000000000001', 'the one that can be seen', hoursAgo(2))
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'bbbbbbbb-0000-0000-0000-000000000002', 'the one behind the wall', hoursAgo(2))
    const shut = lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))

    const found = claudeCodeAdapter.discover(envWith())

    // A partial answer, not an exception and not a truncated one pretending to be whole.
    expect(found.sessions).toHaveLength(1)
    expect(found.sessions[0]?.purpose).toBe('the one that can be seen')
    expect(found.unreadable).toHaveLength(1)
    expect(found.unreadable[0]?.path).toBe(shut)
    expect(found.unreadable[0]?.reason).toContain('permission denied')
  })

  it('reports the root itself when the whole projects directory is refused', () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-somewhere`, 'cccccccc-0000-0000-0000-000000000003', 'unreachable', hoursAgo(2))
    const shut = lock(projectsRoot())

    const found = claudeCodeAdapter.discover(envWith())

    expect(found.sessions).toEqual([])
    // The whole point: zero sessions AND a reason, rather than zero sessions on its own.
    expect(found.unreadable).toHaveLength(1)
    expect(found.unreadable[0]?.path).toBe(shut)
  })

  it('stays quiet when the directory simply is not there, because that is a real answer', () => {
    const found = claudeCodeAdapter.discover(envWith())

    expect(found.sessions).toEqual([])
    // Claude Code has never run in this home. Warning about it would put a caveat on every machine
    // that has never used the tool, and a caveat that is always there is one nobody reads.
    expect(found.unreadable).toEqual([])
  })

  it('makes the narrow judgement in one place: ENOENT is silence, everything else is reported', () => {
    expect(describeReadFailure({ code: 'ENOENT' }, '/nowhere')).toBeNull()

    const refused = describeReadFailure(
      Object.assign(new Error("EACCES: permission denied, scandir '/somewhere'"), { code: 'EACCES' }),
      '/somewhere',
    )
    expect(refused?.path).toBe('/somewhere')
    // The operating system's own words, code and all: EACCES is what a person searches for, and a
    // friendlier sentence that dropped it would cost them the detail that identifies the problem.
    expect(refused?.reason).toContain('EACCES')

    // A failure that is not an Error object at all is still reported rather than dropped.
    expect(describeReadFailure('the mount went away', '/mnt/agents')?.reason).toBe('the mount went away')
  })
})

// ================================================================================== the sweep

describe('the sweep carries the blindness up to whoever is reporting', () => {
  it('separates what it found from what it could not look at', () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-readable`, 'dddddddd-0000-0000-0000-000000000004', 'visible work', hoursAgo(2))
    const shut = lock(lockableDir(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))

    const sweep = sessions.sweepSessions('default', envWith())

    expect(sweep.sessions).toHaveLength(1)
    expect(sweep.unreadable.map((p) => p.path)).toEqual([shut])
    // The narrowing view is the same sweep, so the two cannot disagree about what is there.
    expect(sessions.listSessions('default', envWith())).toHaveLength(1)
  })

  it('tells a discovery sweep that filed nothing why it filed nothing', () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'eeeeeeee-0000-0000-0000-000000000005', 'behind the wall', hoursAgo(2))
    lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))

    const report = sessions.syncSessions({ type: 'agent', id: 'test' }, 'default', envWith())

    expect(report.discovered).toBe(0)
    expect(report.created).toBe(0)
    // Without this, "0 discovered" from a refused machine and "0 discovered" from an empty one are
    // the same report, and only one of them means the disk was read.
    expect(report.unreadable).toHaveLength(1)
  })
})

// =================================================================================== over HTTP

describe('the sessions reply says "0 sessions, and I could not look here"', () => {
  let app: FastifyInstance

  async function serve(opts: { scanFails?: string } = {}) {
    const { sessionRoutes } = await import('../src/server/api/sessions.ts')
    const { recordRoutes } = await import('../src/server/api/records.ts')
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    app = Fastify()
    installErrorHandling(app)
    await app.register(recordRoutes, { prefix: '/api' })
    await app.register(sessionRoutes, { prefix: '/api', env: () => envWith(opts) })
    await app.ready()
    return app
  }

  afterEach(async () => {
    if (app) await app.close()
  })

  const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

  it('warns instead of reporting an empty machine, and still answers 200', async () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'a1111111-0000-0000-0000-000000000001', 'the only session there is', hoursAgo(2))
    const shut = lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))
    const server = await serve()

    const res = await server.inject({ method: 'GET', url: '/api/sessions' })

    // A page that will not load is worse than a page that says what it missed.
    expect(res.statusCode).toBe(200)
    const out = body(res)
    expect(out['sessions']).toHaveLength(0)

    // The reply that used to be indistinguishable from "Claude Code has never run here".
    expect(out['warning']).toBeDefined()
    expect(out['warning']).toContain('could not be read')
    expect(out['warning']).toContain(shut)
    expect(out['unreadable']).toHaveLength(1)
    expect(out['unreadable'][0]['path']).toBe(shut)
    expect(out['unreadable'][0]['reason']).toContain('permission denied')
  })

  it('lists the sessions it could read while saying the count is a floor', async () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-readable`, 'a2222222-0000-0000-0000-000000000002', 'seen', hoursAgo(9))
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'a3333333-0000-0000-0000-000000000003', 'unseen', hoursAgo(9))
    lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))
    const server = await serve()

    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))

    expect(out['sessions']).toHaveLength(1)
    expect(out['counts']['orphaned']).toBe(1)
    expect(out['warning']).toContain('floor')
  })

  it('says both when it can neither list the processes nor read a directory', async () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'a4444444-0000-0000-0000-000000000004', 'unseen', hoursAgo(2))
    lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))
    const server = await serve({ scanFails: '/proc is not there' })

    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))

    // Two different blindnesses. Neither one is allowed to hide the other.
    expect(out['warning']).toContain('could not be listed')
    expect(out['warning']).toContain('could not be read')
  })

  it('carries no warning and an empty list of misses when everything was readable', async () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-readable`, 'a5555555-0000-0000-0000-000000000005', 'fine', hoursAgo(2))
    const server = await serve()

    const out = body(await server.inject({ method: 'GET', url: '/api/sessions' }))

    expect(out['sessions']).toHaveLength(1)
    expect(out['warning']).toBeUndefined()
    expect(out['unreadable']).toEqual([])
  })

  it('admits an incomplete search when a session is not found', async () => {
    lock(lockableDir(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))
    const server = await serve()

    const res = await server.inject({ method: 'GET', url: '/api/sessions/claude-code:not-a-session' })

    expect(res.statusCode).toBe(404)
    // "No such session" is a stronger claim than a search that was refused can support.
    expect(body(res)['error']).toContain('This search was incomplete')
  })

  it('says on a discovery sweep that the counts are a floor', async () => {
    writeLog(`${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`, 'a6666666-0000-0000-0000-000000000006', 'unseen', hoursAgo(2))
    const shut = lock(join(projectsRoot(), `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-locked`))
    const server = await serve()

    const out = body(await server.inject({ method: 'POST', url: '/api/sessions/discover', payload: {} }))

    expect(out['report']['created']).toBe(0)
    expect(out['note']).toContain(shut)
  })
})
