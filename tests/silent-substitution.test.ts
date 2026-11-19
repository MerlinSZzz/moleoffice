// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SIX PLACES THAT ANSWERED A DIFFERENT QUESTION FROM THE ONE THEY WERE ASKED.
 *
 * Each test below pins ONE defect found by the read-only audits in `design/invariants/`, and each
 * one fails if that defect is put back. They are here together because they are one pass over the
 * codebase rather than one area of it; they are NOT a framework, and nothing here is generic. Six
 * named lines, six assertions.
 *
 * What the six have in common is the shape the fallback audit named: a bound that was applied and
 * never declared. A row cap, a directory that could not be walked, a docker column that was not
 * there, a ledger row whose anti-reuse anchor an import had deliberately dropped, a sweep that
 * wrote to every record it had just called unchanged. In each case the operation ran, produced
 * fewer or different facts than the caller asked about, and answered in a shape with nowhere to
 * say so.
 *
 * Every one of them has a POSITIVE CONTROL beside it — the same call in the arrangement where the
 * cheerful answer is the true one — because a test that only ever sees the refusal would pass just
 * as well if the code had been changed to refuse everything.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, one, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

type SessionsLib = typeof import('../src/server/lib/sessions.ts')
type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type ExportLib = typeof import('../src/server/lib/export.ts')

let db: TestDb
let app: FastifyInstance
let sessions: SessionsLib
let resources: ResourcesLib
let exporter: ExportLib
let home: string
let scratch: string[]
/** Directories this file made unreadable, unlocked before the tree is removed. */
let locked: string[]
let savedPath: string | undefined
/** The probe the office had before this file put a fake machine in its place. */
let savedProbe: ReturnType<ResourcesLib['osProbe']>
/** The session records this case started with, so the ones it made can be removed afterwards. */
let sessionsAtStart: Set<string>

const NOW = new Date('2026-08-08T12:00:00Z')
const PROJECT_SLUG = `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-test-claude`
/**
 * THE FOLDER THE CONVERSATIONS IN THIS FILE RAN IN: a real one, which the test project holds. Discovery files a
 * conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a project holds only a
 * folder that exists, so it is registered as a repository root of `default` after each fresh database. Its last name
 * is still test_claude.
 */
const REAL_CWD = aRealFolderNamed('test_claude')
afterAll(() => { rmSync(dirname(REAL_CWD), { recursive: true, force: true }) })

/** The machine's clock, as the routes see it. Movable, because one test needs two moments. */
let clock: Date

function env(now: Date = clock): AdapterEnv {
  return {
    homeDir: home,
    now,
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 300,
    orphanAfterSeconds: 7200,
  }
}

beforeAll(async () => {
  db = await freshDb()
  await theProjectHoldsThisFolder('default', REAL_CWD)

  sessions = await import('../src/server/lib/sessions.ts')
  resources = await import('../src/server/lib/resources.ts')
  exporter = await import('../src/server/lib/export.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { queryRoutes } = await import('../src/server/api/queries.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(queryRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api', env: () => env() })
  await app.ready()
  savedProbe = resources.osProbe()
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(() => {
  home = tempDir()
  locked = []
  clock = NOW
  savedPath = process.env.PATH
  sessionsAtStart = new Set(db.api.listRecords({ workspaceId: 'default', kind: 'session' }).map((one) => one.id))
})

afterEach(() => {
  // Unlocked first: `rm -r` cannot walk into a directory it may not read either.
  for (const dir of locked) chmodSync(dir, 0o700)
  if (savedPath === undefined) delete process.env.PATH
  else process.env.PATH = savedPath
  resources.useOsProbe(savedProbe)
  // A sweep files a session record, and two cases below count the sessions in the office. Removing
  // the records this case made gives the next case the same office this one found.
  for (const one of db.api.listRecords({ workspaceId: 'default', kind: 'session' })) {
    if (sessionsAtStart.has(one.id)) continue
    db.client.sqlite.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(one.id, one.id)
    db.client.sqlite.prepare('DELETE FROM session_resources WHERE session_record_id = ?').run(one.id)
    db.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(one.id)
    db.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(one.id)
  }
  for (const d of scratch) rmSync(d, { recursive: true, force: true })
  scratch = []
})

// -------------------------------------------------------------------------------- small helpers

function tempDir(): string {
  scratch ??= []
  const d = mkdtempSync(join(tmpdir(), 'mole-office-silent-'))
  scratch.push(d)
  return d
}
scratch = []

const AS = (session: string) => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': session,
})

const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, any>

/** POST a note as the named run, and hand back its id. */
async function post(session: string, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS(session),
    payload: { kind: 'note', title, data: { body: 'x' } },
  })
  if (res.statusCode !== 201) throw new Error(`POST ${title} answered ${res.statusCode}: ${res.body}`)
  return String(body(res)['record'].id)
}

/**
 * Take away read permission and PROVE it took effect.
 *
 * chmod does nothing to root, so under a root runner these tests would pass while testing nothing.
 * Copied in spirit from tests/adapter-honesty.test.ts, which draws the same line for the same
 * reason: a green test that proves nothing is how this class of defect survives.
 */
function unreadable(dir: string, mode: number): string {
  chmodSync(dir, mode)
  locked.push(dir)
  let refused = false
  try {
    readdirSync(dir)
  } catch {
    refused = true
  }
  if (!refused) {
    throw new Error(
      `${dir} is still listable after chmod ${mode.toString(8)}, which means this test is running as root. ` +
        'It cannot prove anything about unreadable directories — run the suite as an ordinary user.',
    )
  }
  return dir
}

/** A fake `docker` first on PATH, printing exactly these lines. */
function fakeDocker(output: string): void {
  const dir = tempDir()
  writeFileSync(join(dir, 'docker'), `#!/bin/sh\nprintf '%s'\n`.replace('%s', output.replace(/'/g, "'\\''")), {
    mode: 0o755,
  })
  process.env.PATH = `${dir}:${process.env.PATH ?? ''}`
}

/** One Claude Code transcript on the fake machine. */
function writeLog(id: string, at: string): void {
  const dir = join(home, '.claude', 'projects', PROJECT_SLUG)
  mkdirSync(dir, { recursive: true })
  const lines = [
    {
      parentUuid: null,
      isSidechain: false,
      type: 'user',
      message: { role: 'user', content: 'make the wrist camera stop dropping frames' },
      timestamp: at,
      userType: 'external',
      entrypoint: 'cli',
      cwd: REAL_CWD,
      version: '2.1.223',
    },
    {
      type: 'assistant',
      isSidechain: false,
      message: { role: 'assistant', content: [{ type: 'text', text: 'reduced the exposure' }] },
      timestamp: at,
      cwd: REAL_CWD,
    },
  ]
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

// ============================================================ 1 · the change log's row cap

describe('GET /api/changes says how much of the answer it is giving', () => {
  it('publishes the true match count and says the list was cut short', async () => {
    for (let i = 0; i < 5; i += 1) await post('a-run', `note ${i}`)
    const everything = db.api.countChangesMatching({ workspaceId: 'default' })
    expect(everything).toBeGreaterThan(3)

    const out = body(await app.inject({ method: 'GET', url: '/api/changes?limit=2' }))
    expect(out['changes']).toHaveLength(2)
    // The defect: this answered with two rows, no total and no marker, so "what happened today"
    // came back as the newest 200 writes of a day that held 499 and nothing said which.
    expect(out['matched']).toBe(everything)
    expect(out['truncated']).toBe(true)
  })

  it('does not cry truncation when the whole answer came back', async () => {
    await post('a-run', 'the only note')
    const out = body(await app.inject({ method: 'GET', url: '/api/changes?limit=1000' }))
    expect(out['truncated']).toBe(false)
    expect(out['matched']).toBe(out['changes'].length)
  })

  it('counts the filter, not the page, so a day is the day', async () => {
    for (let i = 0; i < 4; i += 1) await post('a-run', `dated note ${i}`)
    const today = String(db.api.listChanges({ workspaceId: 'default', limit: 1 })[0]?.at).slice(0, 10)

    const windowed = body(
      await app.inject({ method: 'GET', url: `/api/changes?since=${today}&until=${today} 23:59:59&limit=1` }),
    )
    expect(windowed['changes']).toHaveLength(1)
    expect(windowed['matched']).toBe(db.api.countChangesMatching({ workspaceId: 'default', since: today, until: `${today} 23:59:59` }))
    expect(windowed['matched']).toBeGreaterThan(1)
  })
})

// ============================================================ 2 · the count an action is read off

describe('storedByName counts every matching row, not the ones that fitted on the page', () => {
  it('reports the whole repair a session needs even when the list is capped', async () => {
    const sessionId = await post('mixed', 'first note')
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS('mixed'),
      payload: { kind: 'session', title: 'mixed · run', data: { state: 'running' } },
    })
    for (let i = 0; i < 4; i += 1) await post('mixed', `note ${i}`)
    // Rows written straight into the log under the raw name, the way an unmigrated log holds them.
    db.client.sqlite.prepare("update changes set session_id = 'mixed' where session_id is not null").run()
    expect(sessionId).toBeTruthy()

    const capped = body(await app.inject({ method: 'GET', url: '/api/changes?session=mixed&limit=1' }))
    expect(capped['changes']).toHaveLength(1)
    const whole = body(await app.inject({ method: 'GET', url: '/api/changes?session=mixed&limit=1000' }))

    // The defect: counted over the returned rows, so 60 rows needing a repoint reported as 0 when
    // the caller asked for the newest 10 — and the sentence recommending the repoint went with it.
    expect(capped['session']['storedByName']).toBe(whole['session']['storedByName'])
    expect(capped['session']['storedByName']).toBeGreaterThan(1)
    expect(String(capped['session']['note'])).toContain('POST /api/sessions/discover')
  })

  it('says how many rows a name nobody answers to really holds', async () => {
    for (let i = 0; i < 3; i += 1) await post('never-filed', `orphan work ${i}`)

    const out = body(await app.inject({ method: 'GET', url: '/api/changes?session=never-filed&limit=1' }))
    expect(out['session']['matchedBy']).toBe('unresolved')
    expect(out['session']['storedByName']).toBe(3)
    expect(String(out['session']['note'])).toContain('These 3 rows')
  })
})

// ============================================================ 3 · the export's stale-file scan

describe('the export says which directory it could not scan for stale files', () => {
  it('names the directory instead of reporting a clean prune', () => {
    db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'a note', data: { body: 'x' }, actor: db.api.HUMAN })
    const root = tempDir()
    exporter.writeExport(root)

    // The control: a file the export does not produce IS found and removed when it can look.
    writeFileSync(join(root, 'records', 'left-behind.md'), 'a deleted record, still on disk\n')
    const seen = exporter.writeExport(root)
    expect(seen.removed).toContain('records/left-behind.md')
    expect(seen.notes.join(' ')).not.toContain('could not be read')

    // And now the same thing, in a directory it may enter but not list. 0o333 rather than 0o000 so
    // the WRITE half of the export still works and this test is only about the scan.
    writeFileSync(join(root, 'records', 'left-behind-again.md'), 'another one\n')
    unreadable(join(root, 'records'), 0o333)

    const blind = exporter.writeExport(root)
    // The defect: `catch { continue }`, so this answered `removed: []` — a successful export with
    // a stale file still in the archive, which `applyImport` reads back as a live row.
    expect(blind.removed).toEqual([])
    expect(existsSync(join(root, 'records', 'left-behind-again.md'))).toBe(true)
    const said = blind.notes.filter((n) => n.includes('could not be read'))
    expect(one(said, 'note about the unreadable directory')).toContain(join(root, 'records'))
    expect(one(said, 'note about the unreadable directory')).toContain('not all the files it no longer')
  })

  it('stays quiet about a managed directory that simply does not exist yet', () => {
    db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'a note', data: { body: 'x' }, actor: db.api.HUMAN })
    const root = tempDir()
    // No layouts have ever been saved, so `layouts/` is absent. That is a first export, not a
    // refusal, and warning about it on every machine is how a warning stops being read.
    const first = exporter.writeExport(root)
    expect(existsSync(join(root, 'layouts'))).toBe(false)
    expect(first.notes.join(' ')).not.toContain('could not be read')
  })
})

// ============================================================ 4 · a docker row with a missing column

describe('the container probe refuses a docker line that is not the shape it asked for', () => {
  it('reads a well-formed line', () => {
    fakeDocker('abc123\tzotero\tlinuxserver/zotero\tUp 3 hours\n')
    const reading = resources.LINUX_PROBE.containers()
    expect(reading.available).toBe(true)
    if (!reading.available) return
    expect(one(reading.containers, 'container').status).toBe('Up 3 hours')
  })

  it('says the shape changed rather than calling the state an empty string', () => {
    fakeDocker('abc123\tzotero\n')
    const reading = resources.LINUX_PROBE.containers()
    // The defect: `status: status ?? ''`, which draws as a blank cell and reads as a fact. An
    // empty string is not a state a container can be in.
    expect(reading.available).toBe(false)
    if (reading.available) return
    expect(reading.reason).toContain('2 tab-separated fields')
    expect(reading.reason).toContain('not the 4')
    expect(reading.reason).toContain('This is not a reading of none')
  })
})

// ============================================================ 5 · a ledger row with no anchor

describe('a restored ledger row does not report alive about a process it cannot identify', () => {
  it('answers unknown when the anti-reuse anchor is missing', () => {
    const pid = 500
    resources.useOsProbe(fakeProbe(pid, '2026-08-08 09:00:00'))
    const session = db.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'the run that started it',
      data: { state: 'running', runtime: 'claude-code' },
      actor: db.api.HUMAN,
    }).id
    resources.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(pid), actor: db.api.HUMAN })

    // The control: with the anchor beside it, this is a real reading and says so.
    expect(one(resources.listResources({ workspaceId: 'default' }), 'ledger row').liveness.state).toBe('alive')

    // Exactly the row an import produces: FORMAT.md 2.2 drops pgid and os_started_at on purpose,
    // so a restored row is a pid with nothing to compare against.
    db.client.sqlite.prepare('update session_resources set pgid = null, os_started_at = null').run()
    // A different program, now holding that number — which is what the anchor exists to catch.
    resources.useOsProbe(fakeProbe(pid, '2026-08-09 18:00:00', 'vim notes.md'))

    const row = one(resources.listResources({ workspaceId: 'default' }), 'ledger row')
    // The defect: the check was written `osStartedAt !== null && …`, so a null anchor skipped it
    // and the word meaning "checked, and it is the one you started" was returned about a stranger.
    expect(row.liveness.state).toBe('unknown')
    if (row.liveness.state !== 'unknown') return
    expect(row.liveness.reason).toContain('no')
    expect(row.liveness.reason).toContain('start time')
    expect(row.liveness.reason).toContain('vim notes.md')
  })
})

/** An operating system holding exactly one process. */
function fakeProbe(pid: number, startedAt: string, command = 'node server.js'): Parameters<ResourcesLib['useOsProbe']>[0] {
  const live = { pid, pgid: 400, ppid: 1, command, startedAt }
  return {
    platform: 'fake',
    processById: (p: number) => (p === pid ? live : null),
    processesInGroup: (pgid: number) => (pgid === 400 ? [live] : []),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => undefined,
    stopContainer: () => undefined,
  }
}

// ============================================================ 6 · the sweep that said it wrote nothing

describe('POST /api/sessions/discover says how many records it wrote to', () => {
  it('counts the re-stamped records rather than reporting a no-op that did not happen', async () => {
    writeLog('11111111-2222-3333-4444-555555555555', new Date(NOW.getTime() - 19 * 3_600_000).toISOString())
    const AGENT = { type: 'agent', id: 'claude-code' } as const

    const first = sessions.syncSessions(AGENT, 'default', env())
    expect(first.created).toBe(1)
    const record = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    const before = db.api.listChanges({ workspaceId: 'default', recordId: record.id, limit: 1000 }).length

    // A second sweep one minute later. Nothing on the machine has changed; the only thing that has
    // is the clock, and the discovery stamp carries the clock.
    const second = sessions.syncSessions(AGENT, 'default', env(new Date(NOW.getTime() + 60_000)))
    expect(second.updated).toBe(0)
    expect(second.unchanged).toBe(1)

    // The measurement the audit made: the record WAS written to, and `unchanged` said otherwise —
    // "Nothing was written for these". A change row, and `records.updated_at` moved with it, which
    // is what the attention rule falls back to when a session carries no `data.state` row.
    const written = db.api.listChanges({ workspaceId: 'default', recordId: record.id, limit: 1000 })
    expect(written.length).toBe(before + 1)
    expect(one(written.filter((c) => c.field?.endsWith('discovered.at')), 'stamp row').op).toBe('update')
    expect(second.stampOnly).toBe(1)
  })

  it('and says so in the reply a caller reads', async () => {
    writeLog('11111111-2222-3333-4444-555555555555', new Date(NOW.getTime() - 19 * 3_600_000).toISOString())
    await app.inject({ method: 'POST', url: '/api/sessions/discover', headers: AS('sweep'), payload: {} })
    clock = new Date(NOW.getTime() + 60_000)

    const out = body(
      await app.inject({ method: 'POST', url: '/api/sessions/discover', headers: AS('sweep'), payload: {} }),
    )
    expect(out['report']['unchanged']).toBe(1)
    expect(out['report']['stampOnly']).toBe(1)
    // The published sentence used to be "a second run over an unchanged machine writes nothing at
    // all", which was false on every second run there has ever been.
    expect(String(out['note'])).toContain('still written to')
  })

  it('reports nothing written when nothing was: two sweeps in the same second', () => {
    writeLog('11111111-2222-3333-4444-555555555555', new Date(NOW.getTime() - 19 * 3_600_000).toISOString())
    const AGENT = { type: 'agent', id: 'claude-code' } as const

    sessions.syncSessions(AGENT, 'default', env())
    const before = one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record')
    const second = sessions.syncSessions(AGENT, 'default', env())

    // The frozen-clock case, which is the one the existing idempotence test in sessions.test.ts
    // covers. Nothing moved, nothing was written, and the counter says zero rather than always
    // reporting a write so the assertion above can never fail.
    expect(second.unchanged).toBe(1)
    expect(second.stampOnly).toBe(0)
    expect(one(db.api.listRecords({ workspaceId: 'default', kind: 'session' }), 'session record').updatedAt).toBe(before.updatedAt)
  })
})
