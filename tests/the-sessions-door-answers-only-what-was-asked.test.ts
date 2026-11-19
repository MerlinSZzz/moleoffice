// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSIONS DOOR ANSWERS ONLY WHAT WAS ASKED, AND THE SESSIONS PAGE ASKS FOR EVERYTHING.
 *
 * MEASURED FIRST, 11 September 2026, on an isolated world over a copy of the owner's database (problem
 * RcrvxsbgqWqr): `GET /api/sessions` answered 1,945 rows and 3.1 MB in 0.9 to 1.1 s, and Home's
 * "Running now" band called it every 30 seconds to draw about twenty of those rows. The door now
 * takes `?only=running`, which narrows the reply to the rows in that state and, in the same
 * request, skips the placement evidence read — the no-kind read of every record, the read of every
 * link, and the whole change log — which was the most expensive thing the door did. The tally is
 * read the cheap way, from the end of each transcript; the rows the caller will draw are read in
 * full, exactly as an unnarrowed call reads them.
 *
 * WHO ASKS THE NARROWED DOOR NOW. Home's band and its 30-second poll were removed in wave 13y round
 * 32. The session hook, tools/session-hook.mjs, asks `?only=running`. The sessions page reads once,
 * on a press, and asks for everything.
 *
 * HOW IT IS PROVED. The door is mounted over a machine the test describes — three transcripts, a
 * fixed clock, a process list with one live session in it — the way tests/sessions.test.ts does it.
 * One call is narrowed, one is not, and the two are compared: the narrowed call ships one row, the
 * unnarrowed one ships three, and the tally is identical in both because it is counted over every
 * session the sweep found, never over the narrowed subset.
 *
 * THE STATEMENT COUNT. The statements are counted at the database, as
 * tests/the-groups-door-reads-the-pool-once.test.ts does, by wrapping `sqlite.prepare` for the
 * length of one call. The counted statements are the evidence reads: a `records` read that filters
 * no `kind`, a `links` read, and a `changes` read. None of their texts varies per call, and the
 * warning in the cluster's common brief about constant SQL applies — but this driver has no
 * statement cache: drizzle's `prepareQuery` calls `client.prepare` on every execution, so every
 * execution is visible to the patch. That visibility is proved inside this file, not assumed: the
 * unnarrowed call in the same test sees all three prepared, so their absence from the narrowed
 * call is a fact about the path and not about the patch.
 *
 * MUTATIONS, one per claim, each run control-red-restore-green:
 *   - narrow the reply and not the sweep: ship every row under `?only=running` (the filter in
 *     api/sessions.ts), and the narrowed-row test is red.
 *   - count the tally over the narrowed subset instead of every session, and the counts test is red.
 *   - make the sweep read the evidence whatever the caller asked, and the statement test is red.
 *   - skip the full re-read of the rows the caller will draw, and the drawn-row test is red —
 *     the row arrives without its opening request, because only the end of its log was read.
 *   - make the sessions page narrow (`fetchSessionsPage` asking for `?only=running`), and the URL
 *     test is red.
 *
 * WHAT EVERY ROW SAYS ALIKE IS SAID ONCE (wave 13y round 30). Measured on two copies of the office in
 * round 29, the narrowed answer repeated two values on every row: `placement`, 279 bytes, and
 * `stateReason`, 193 bytes, 42 to 44% of its 1.6 MB. The answer now carries `saidOnce`, and a row
 * leaves out either field when its value is the one `saidOnce` holds. A row whose value differs keeps
 * its own. The machine below has three hand-filed runs that say they are running, so three rows give
 * one sentence and the run with a log gives another. A reader puts the value back for every row that
 * left it out, and the page's reader must then read every row with no problem line.
 */

import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import { OBSERVED_SESSION_STATES, type AdapterEnv, type ProcessInfo } from '../src/server/lib/adapters/types.ts'

// -------------------------------------------------------------------------------- the machine

/** Every "how long ago" in this file is measured against this moment. */
const NOW = new Date('2026-08-08T12:00:00Z')

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const hoursAgo = (h: number) => minutesAgo(h * 60)

const PROJECT_SLUG = `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-test-claude`
const REAL_CWD = aRealFolderNamed('sessions-door-test-clone')
afterAll(() => rmSync(dirname(REAL_CWD), { recursive: true, force: true }))

let home: string
let db: TestDb
let sessionRoutes: typeof import('../src/server/api/sessions.ts').sessionRoutes
let installErrorHandling: typeof import('../src/server/lib/http.ts').installErrorHandling
let readSessionsPayload: typeof import('../src/web/components/SessionPanel.tsx').readSessionsPayload
let fetchSessions: typeof import('../src/web/components/SessionPanel.tsx').fetchSessions
let fetchSessionsPage: typeof import('../src/web/components/SessionPanel.tsx').fetchSessionsPage
/** The session records the case filed, so the next case does not read them. */
let filedThisCase: string[] = []

beforeAll(async () => {
  db = await freshDb()
  await theProjectHoldsThisFolder('default', REAL_CWD)
  ;({ sessionRoutes } = await import('../src/server/api/sessions.ts'))
  ;({ installErrorHandling } = await import('../src/server/lib/http.ts'))
  ;({ readSessionsPayload, fetchSessions, fetchSessionsPage } = await import('../src/web/components/SessionPanel.tsx'))
}, 60_000)

afterAll(() => {
  db.close()
})

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-home-'))
  filedThisCase = []
})

afterEach(() => {
  for (const id of filedThisCase) db.api.deleteRecord(id, db.api.HUMAN)
  filedThisCase = []
  rmSync(home, { recursive: true, force: true })
})

/** Write one transcript, exactly as Claude Code lays them out, and hand back its path. */
function writeLog(id: string, entries: unknown[], opts: { mtime?: Date } = {}): string {
  const dir = join(home, '.claude', 'projects', PROJECT_SLUG)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${id}.jsonl`)
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  if (opts.mtime) utimesSync(path, opts.mtime, opts.mtime)
  return path
}

const prompt = (text: string, at: string) => ({
  type: 'user',
  message: { role: 'user', content: text },
  timestamp: at,
  cwd: REAL_CWD,
})

const said = (text: string, at: string) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text }] },
  timestamp: at,
  cwd: REAL_CWD,
})

const apiError = (text: string, at: string) => ({
  type: 'assistant',
  isApiErrorMessage: true,
  apiErrorStatus: 529,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
  timestamp: at,
  cwd: REAL_CWD,
})

const liveProcess = (pid: number, id: string): ProcessInfo => ({
  pid,
  command: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.223 --session-id ${id}`,
  cwd: REAL_CWD,
})

function envWith(opts: { processes?: ProcessInfo[] } = {}): AdapterEnv {
  return {
    homeDir: home,
    now: NOW,
    scanProcesses: () => ({ ok: true, processes: opts.processes ?? [] }),
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

// Three ids used throughout, so a test failure names which session it is about.
const RUNNING = 'bbbbbbbb-0000-0000-0000-000000000001'
const CRASHED = 'bbbbbbbb-0000-0000-0000-000000000002'
const ORPHANED = 'bbbbbbbb-0000-0000-0000-000000000003'

/** The machine: one session in each of the three states the narrowing has to tell apart. */
beforeEach(() => {
  writeLog(RUNNING, [prompt('fix the gripper calibration', hoursAgo(2)), said('on it', minutesAgo(1))], { mtime: new Date(minutesAgo(1)) })
  writeLog(CRASHED, [prompt('collate the force tables', hoursAgo(9)), apiError('Overloaded', hoursAgo(8))], { mtime: new Date(hoursAgo(8)) })
  writeLog(ORPHANED, [prompt('tidy the drizzle migrations', hoursAgo(30)), said('done', hoursAgo(29))], { mtime: new Date(hoursAgo(30)) })
})



describe('GET /api/sessions narrowed with ?only=running', () => {
  let app: FastifyInstance | null = null

  /** The door over the machine written in the three logs above, over the file's one office. */
  async function serve(): Promise<FastifyInstance> {
    const built = Fastify()
    installErrorHandling(built)
    await built.register(sessionRoutes, { prefix: '/api', env: () => envWith({ processes: [liveProcess(4242, RUNNING)] }) })
    await built.ready()
    return built
  }

  afterEach(async () => {
    if (app) await app.close()
    app = null
  })

  it('ships only the running rows, and reads them in full', async () => {
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?only=running' })
    expect(res.statusCode, res.body).toBe(200)
    const out = JSON.parse(res.body) as Record<string, unknown>
    const rows = out['sessions'] as { externalId: string; purpose: string | null; doing: string | null; placement: { kind: string; reason: { why: string }; sentence: string } }[]

    // ONLY WHAT WAS ASKED. Three sessions are on the machine and one is running; two rows would
    // mean the narrowing filtered nothing.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.externalId).toBe(RUNNING)

    // READ IN FULL, not at states depth. A states-depth row carries no opening request and no
    // doing line, because only the end of its log was read; the drawn row must carry what a
    // drawn row shows.
    expect(rows[0]!.purpose).toBe('fix the gripper calibration')
    expect(rows[0]!.doing).toBe('on it')

    // The narrowing is echoed, and the placement is null in words rather than silently missing:
    // the answer says it once, and the row leaves it out.
    expect(out['only']).toBe('running')
    expect(out['placementRead']).toBeNull()
    const once = out['saidOnce'] as { placement: { kind: string; reason: { why: string }; sentence: string } }
    expect(once.placement.kind).toBe('unassigned')
    expect(once.placement.reason.why).toBe('not-asked-for')
    expect(once.placement.sentence).toContain('asked for less')
    expect(Object.hasOwn(rows[0]!, 'placement')).toBe(false)
  })

  it('counts every state over every session, not over the narrowed subset', async () => {
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?only=running' })
    const out = JSON.parse(res.body) as { counts: Record<string, number> }

    // THE TALLY IS THE TRUE TALLY. Narrowing it would answer "0 crashed" only because the crashed
    // rows were the ones left out — the opposite of what a tally is for.
    for (const state of OBSERVED_SESSION_STATES) {
      expect(out.counts[state], `counts.${state} is present`).toEqual(expect.any(Number))
    }
    expect(out.counts['running']).toBe(1)
    expect(out.counts['crashed']).toBe(1)
    expect(out.counts['orphaned']).toBe(1)
    expect(out.counts['finished']).toBe(0)
  })


  it('answers unnarrowed exactly as before: every row, placements worked out, no narrowing echoed', async () => {
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions' })
    expect(res.statusCode, res.body).toBe(200)
    const out = JSON.parse(res.body) as { sessions: { externalId: string; placement: { reason: { why: string } } }[]; counts: Record<string, number>; placementRead: unknown; only?: string }

    expect(out.sessions).toHaveLength(3)
    expect(new Set(out.sessions.map((s) => s.externalId))).toEqual(new Set([RUNNING, CRASHED, ORPHANED]))
    expect(out.counts['running']).toBe(1)
    expect(out.counts['crashed']).toBe(1)
    expect(out.counts['orphaned']).toBe(1)
    // The evidence was read, so placement is a real reading, not the narrowing's null.
    expect(out.placementRead).not.toBeNull()
    expect(typeof out.placementRead).toBe('object')
    for (const row of out.sessions) {
      // No record files any of these sessions, so the honest reading of an empty corpus is
      // `not-filed` — not `not-asked-for`, which would claim nobody asked.
      expect(row.placement.reason.why).toBe('not-filed')
    }
    expect(out['only']).toBeUndefined()
  })

  /** Three runs filed by hand, each saying it is running, as the session hook's records do when no log is found. */
  function threeHandFiledRuns(): string[] {
    const filed = (title: string, data: Record<string, unknown>) => {
      const id = db.api.createRecord({ workspaceId: 'default', kind: 'session', title, data, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
      filedThisCase.push(id)
      return id
    }
    return [
      filed('calibration rerun', { state: 'running', runtime: 'claude-code' }),
      filed('drawer audit', { state: 'running', runtime: 'claude-code' }),
      filed('force table check', { state: 'running' }),
    ]
  }

  type Row = Record<string, unknown> & { id: string; externalId: string; recordId: string | null }
  /** A row as a reader has it: every value the row left out, put back from `saidOnce`. */
  const whole = (row: Row, once: Record<string, unknown>): Row => ({ ...once, ...row })

  it('says once what every row says alike, and a row whose value differs keeps its own', async () => {
    const handFiled = threeHandFiledRuns()
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?only=running' })
    expect(res.statusCode, res.body).toBe(200)
    const out = JSON.parse(res.body) as { sessions: Row[]; saidOnce: { placement: { reason: { why: string } }; stateReason: string } }

    // Four running rows: the run with a log, and the three filed by hand.
    expect(out.sessions).toHaveLength(4)
    const byHand = out.sessions.filter((row) => row.recordId !== null && handFiled.includes(row.recordId))
    const seen = out.sessions.filter((row) => row.externalId === RUNNING)
    expect(byHand).toHaveLength(3)
    expect(seen).toHaveLength(1)

    // NO ROW CARRIES A PLACEMENT: a narrowed answer works out none, so every row's is the one said once.
    expect(out.saidOnce.placement.reason.why).toBe('not-asked-for')
    for (const row of out.sessions) expect(Object.hasOwn(row, 'placement'), `${row.id} carries a placement`).toBe(false)

    // THE SENTENCE THREE ROWS SHARE IS SAID ONCE, and none of the three repeats it.
    expect(out.saidOnce.stateReason).toContain('this session was filed by hand and says it is "running"')
    for (const row of byHand) expect(Object.hasOwn(row, 'stateReason'), `${row.id} repeats the shared sentence`).toBe(false)
    // THE RUN WITH A LOG SAYS SOMETHING ELSE, so it keeps its own sentence.
    expect(typeof seen[0]!.stateReason).toBe('string')
    expect(seen[0]!.stateReason).not.toBe(out.saidOnce.stateReason)
  })

  it('says once the reading of a process that the runs filed by hand share, and a row with another keeps its own', async () => {
    const handFiled = threeHandFiledRuns()
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?only=running' })
    const out = JSON.parse(res.body) as { sessions: Row[]; saidOnce: { itsProcess?: unknown } }
    const byHand = out.sessions.filter((row) => row.recordId !== null && handFiled.includes(row.recordId))
    const seen = out.sessions.filter((row) => row.externalId === RUNNING)
    // THE THREE RECORDED NO PROCESS, so the office read the same thing of each: said once.
    expect(out.saidOnce.itsProcess).toEqual({ seen: 'none', says: 'no process was recorded for it' })
    for (const row of byHand) expect(Object.hasOwn(row, 'itsProcess'), `${row.id} repeats the shared reading`).toBe(false)
    // THE RUN WITH A LOG HAS NO READING, and says so on its own row.
    expect(Object.hasOwn(seen[0]!, 'itsProcess')).toBe(true)
    expect(seen[0]!['itsProcess']).toBeNull()
    // THE PAGE PUTS IT BACK on each of the three.
    const read = readSessionsPayload(out)
    expect(read.problems).toEqual([])
    for (const one of read.sessions) {
      if (one.recordId !== null && handFiled.includes(one.recordId)) expect(one.itsProcess).toEqual(out.saidOnce.itsProcess)
      else expect(one.itsProcess).toBeNull()
    }
  })

  it('a row made whole again is the row the unnarrowed answer has, apart from where it is filed', async () => {
    threeHandFiledRuns()
    app = await serve()
    const narrowed = JSON.parse((await app.inject({ method: 'GET', url: '/api/sessions?only=running' })).body) as { sessions: Row[]; saidOnce: Record<string, unknown> }
    const unnarrowed = JSON.parse((await app.inject({ method: 'GET', url: '/api/sessions' })).body) as { sessions: Row[] }
    const all = new Map(unnarrowed.sessions.map((row) => [row.id, row]))
    for (const row of narrowed.sessions) {
      const made = whole(row, narrowed.saidOnce)
      const there = all.get(row.id)
      expect(there, `${row.id} is in the unnarrowed answer`).toBeDefined()
      // Where a run is filed is the one thing a narrowed answer does not work out.
      expect({ ...made, placement: null }).toEqual({ ...there, placement: null })
      expect(made['placement']).toEqual(narrowed.saidOnce['placement'])
    }
  })


  it('the page reads the narrowed answer whole, with no problem line, in the words each row had', async () => {
    const handFiled = threeHandFiledRuns()
    app = await serve()
    const raw = JSON.parse((await app.inject({ method: 'GET', url: '/api/sessions?only=running' })).body) as { sessions: Row[]; saidOnce: { placement: unknown; stateReason: string } }
    const read = readSessionsPayload(raw)
    expect(read.problems).toEqual([])
    expect(read.sessions).toHaveLength(4)
    for (const one of read.sessions) {
      // THE PLACEMENT SAID ONCE, read as a placement and not as a gap in the reading.
      expect(one.placement).toEqual(raw.saidOnce.placement)
      if (one.recordId !== null && handFiled.includes(one.recordId)) expect(one.stateReason).toBe(raw.saidOnce.stateReason)
      else expect(one.stateReason).toBe(raw.sessions.find((row) => row.id === one.id)!['stateReason'])
    }
  })

  it('refuses a narrowing it does not know, in words, rather than answering about something else', async () => {
    app = await serve()
    const res = await app.inject({ method: 'GET', url: '/api/sessions?only=finished' })
    expect(res.statusCode).toBe(400)
    const out = JSON.parse(res.body) as { error?: string; message?: string }
    const said = String(out.error ?? out.message)
    expect(said).toContain('The narrowing asked for')
  })
})

describe('the sessions page asks for everything', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('fetchSessionsPage() asks for every session, the orphans and the session records', async () => {
    const seen: string[] = []
    // The three replies of a page read, each in the shape its reader accepts: the sessions reply
    // may be empty, and the other two read as empty without a problem line.
    globalThis.fetch = (async (url: string | URL | Request) => {
      seen.push(String(url))
      const body = String(url).startsWith('/api/records')
        ? { records: [] }
        : String(url).startsWith('/api/resources/orphans')
          ? { orphans: [], searched: [] }
          : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    await fetchSessionsPage()
    expect(seen.filter((u) => u.startsWith('/api/sessions'))).toEqual(['/api/sessions'])
    expect(seen).toContain('/api/resources/orphans')
    expect(seen.some((u) => u.startsWith('/api/records'))).toBe(true)
    // And the sessions read on its own asks for everything: nothing in the browser narrows it.
    seen.length = 0
    await fetchSessions()
    expect(seen).toEqual(['/api/sessions'])
  })
})

