// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DETAIL OF A RUN READS ONLY THAT RUN, AND GIVES WHAT THE SWEEP GAVE.
 *
 * Round 136 of wave 13y, item 77. GET /api/sessions/:id found the one run it shows through the sweep of every session
 * (`sweepSessions` in src/server/lib/sessions.ts): every run of the project, and every transcript on the computer read
 * in full. On the made-up office at the 4 November scale, with a made-up home folder of the live server's transcript
 * sizes, one detail asked 17,576 statements so; the times before and after are on `theSessionAnIdNames`.
 *
 * WHAT IS HELD HERE:
 *   1. The door gives the run the sweep gives first for the id, scoped to the project as before, byte for byte, and a
 *      404 where the sweep finds none. The ids: a run with no stamp; a stamped run whose transcript is on disk, by its
 *      record and by its tool and conversation; a stamped run whose transcript is not, both ways; two runs with one
 *      stamp, each by its record and both by their tool and conversation; one conversation in two folders, both ways; a
 *      run of a tool this build cannot read, both ways; a conversation on disk that no record holds, in the project's
 *      folder and in no project's folder; and, answered 404, a deleted run, a run of another project, a record that is
 *      not a run and two ids that nothing has.
 *   2. The door reads only the run it is asked about: it builds no more rows than the sweep has rows of that id (the
 *      process table is asked once for each row built), and no statement gives back a run that no id here names.
 *   3. With a folder of transcripts that would not open, a 404 says so as the list does, and a run is found as the sweep
 *      finds it.
 *
 * Every run, transcript and record here is made up.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aRealFolderNamed, freshDb, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'made-up-elsewhere'
const NOW = new Date('2026-11-05T09:00:00Z')
const hoursAgo = (hours: number): string => new Date(NOW.getTime() - hours * 60 * 60_000).toISOString()
/** The doing line of a run that no id here names, which only a read of the project's runs gives back. */
const NOBODY_NAMES_IT = 'A made-up doing line of a run that no id here names'
const HUMAN = { type: 'human' as const, id: THE_PERSON }
const headers = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let S: typeof import('../src/server/lib/sessions.ts')
const home = mkdtempSync(join(tmpdir(), 'mole-office-detail-reads-'))
const projects = join(home, '.claude', 'projects')
const FOLDER = join(projects, '-made-up-project')
const SECOND_FOLDER = join(projects, '-made-up-project-again')
const LOCKED_FOLDER = join(projects, '-made-up-locked')
const OWN = aRealFolderNamed('the-detail-door-own-folder')

/** How many times the process table was asked: once for each row a transcript or a stamp was built into. */
let scans = 0
const env = (): AdapterEnv => ({
  homeDir: home,
  now: NOW,
  scanProcesses: () => {
    scans += 1
    return { ok: true, processes: [] }
  },
  runningWithinSeconds: 5 * 60,
  orphanAfterSeconds: 6 * 60 * 60,
})

const E = (n: number): string => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A transcript of a made-up conversation in `folder`, last written `hours` ago, run in `cwd`. */
function aTranscript(folder: string, externalId: string, hours: number, cwd = OWN): void {
  mkdirSync(folder, { recursive: true })
  const lines = [
    { type: 'user', message: { role: 'user', content: `made-up purpose of ${externalId}` }, timestamp: hoursAgo(hours + 1), cwd, customTitle: `made-up ${externalId}` },
    { type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text: 'made-up' }] }, timestamp: hoursAgo(hours), cwd },
  ]
  writeFileSync(join(folder, `${externalId}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}

function aStamp(externalId: string, logPath = join(FOLDER, `${externalId}.jsonl`), tool = 'claude-code'): Record<string, unknown> {
  return { extra: { discovered: { tool, externalId, logPath, observedState: 'finished', at: '2026-11-04 11:00:00' } } }
}

/** The ids asked about, by what each is. */
const ids = new Map<string, string>()

/** THE SWEEP'S ANSWER, as the door gave it before: the first row of the id, scoped to the project, placed alone. */
function theSweepsRow(id: string): Record<string, unknown> | null {
  const sweep = S.sweepSessions(HERE, env(), { placement: false })
  const found = S.scopeSessionsToProject(sweep.sessions, HERE).sessions.find((one) => S.isSessionId(one, id)) ?? null
  return found === null ? null : { ...found, placement: S.sessionPlacement(found.id, found.recordId, HERE) }
}

/** How many rows the sweep has of the id, before the project's scope. */
function theSweepsRowsOf(id: string): number {
  return S.sweepSessions(HERE, env(), { placement: false }).sessions.filter((one) => S.isSessionId(one, id)).length
}

const ask = (id: string) => app.inject({ method: 'GET', url: `/api/sessions/${encodeURIComponent(id)}`, headers })

/** Each statement `run` prepares and runs, with what it gave back. */
async function theStatementsOf(run: () => Promise<unknown>): Promise<{ sql: string; gave: string }[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const ran: { sql: string; gave: string }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const gave = call.apply(this, args)
        ran.push({ sql: text, gave: JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '' })
        return gave
      }
    }
    return statement
  }
  try {
    await run()
  } finally {
    sqlite.prepare = prepare
  }
  return ran
}

const THE_CASES = [
  'a run with no stamp',
  'a stamped run whose transcript is on disk, by its record',
  'a stamped run whose transcript is on disk, by its tool and conversation',
  'a stamped run whose transcript is not on disk, by its record',
  'a stamped run whose transcript is not on disk, by its tool and conversation',
  'the first of two runs with one stamp',
  'the second of two runs with one stamp',
  'two runs with one stamp, by their tool and conversation',
  'one conversation in two folders, by its record',
  'one conversation in two folders, by its tool and conversation',
  'a run of a tool this build cannot read, by its record',
  'a run of a tool this build cannot read, by its tool and conversation',
  'a conversation on disk that no record holds, in the project folder',
  "a conversation on disk that no record holds, in no project's folder",
  'a deleted run',
  'a run of another project',
  'a record that is not a run',
  'a tool and conversation that nothing has',
  'a record id that nothing has',
] as const
const ANSWERED_404 = new Set<string>([
  "a conversation on disk that no record holds, in no project's folder",
  'a deleted run',
  'a run of another project',
  'a record that is not a run',
  'a tool and conversation that nothing has',
  'a record id that nothing has',
])

beforeAll(async () => {
  t = await freshDb()
  S = await import('../src/server/lib/sessions.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.ready()
  await theProjectHoldsThisFolder(HERE, OWN)
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'Made-up elsewhere' })

  aTranscript(FOLDER, E(1), 1)
  aTranscript(FOLDER, E(3), 10)
  aTranscript(FOLDER, E(4), 2)
  aTranscript(FOLDER, E(5), 3, '/made-up-nowhere')
  aTranscript(FOLDER, E(6), 12)
  aTranscript(SECOND_FOLDER, E(6), 1)
  aTranscript(LOCKED_FOLDER, E(8), 1)
  const run = (title: string, data: Record<string, unknown>, workspace = HERE) =>
    t.api.createRecord({ workspaceId: workspace, kind: 'session', title, data: { state: 'running', runtime: 'claude-code', doing: 'made-up', ...data }, actor: HUMAN }).id
  ids.set('a run with no stamp', run('A made-up run with no stamp', {}))
  const onDisk = run('A made-up run whose transcript is on disk', aStamp(E(1)))
  ids.set('a stamped run whose transcript is on disk, by its record', onDisk)
  ids.set('a stamped run whose transcript is on disk, by its tool and conversation', `claude-code:${E(1)}`)
  ids.set('a stamped run whose transcript is not on disk, by its record', run('A made-up run whose transcript is gone', aStamp(E(2))))
  ids.set('a stamped run whose transcript is not on disk, by its tool and conversation', `claude-code:${E(2)}`)
  // TWO RUNS WITH ONE STAMP: the transcript is on disk, and the second names a path where none is, so one of them is the
  // transcript's and the other is read from its own path.
  ids.set('the first of two runs with one stamp', run('The first made-up run of one stamp', aStamp(E(3))))
  ids.set('the second of two runs with one stamp', run('The second made-up run of one stamp', aStamp(E(3), join(FOLDER, 'gone', `${E(3)}.jsonl`))))
  ids.set('two runs with one stamp, by their tool and conversation', `claude-code:${E(3)}`)
  ids.set('one conversation in two folders, by its record', run('A made-up run of one conversation in two folders', aStamp(E(6))))
  ids.set('one conversation in two folders, by its tool and conversation', `claude-code:${E(6)}`)
  ids.set('a run of a tool this build cannot read, by its record', run('A made-up run of another tool', aStamp(E(7), '/made-up-elsewhere/run.log', 'made-up-tool')))
  ids.set('a run of a tool this build cannot read, by its tool and conversation', `made-up-tool:${E(7)}`)
  ids.set('a conversation on disk that no record holds, in the project folder', `claude-code:${E(4)}`)
  ids.set("a conversation on disk that no record holds, in no project's folder", `claude-code:${E(5)}`)
  const gone = run('A made-up deleted run', {})
  t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-11-04 11:00:00' WHERE id = ?").run(gone)
  ids.set('a deleted run', gone)
  ids.set('a run of another project', run('A made-up run of another project', aStamp(E(9)), ELSEWHERE))
  ids.set('a record that is not a run', t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'A made-up task', data: { state: 'todo' }, actor: HUMAN }).id)
  ids.set('a tool and conversation that nothing has', `claude-code:${E(99)}`)
  ids.set('a record id that nothing has', 'madeUpNoRec0')
  run('A made-up run that no id here names', { doing: NOBODY_NAMES_IT })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  chmodSync(LOCKED_FOLDER, 0o755)
  rmSync(home, { recursive: true, force: true })
  rmSync(dirname(OWN), { recursive: true, force: true })
})

describe('the detail of a run', () => {
  for (const is of THE_CASES) {
    it(`1. gives the row the sweep gives first for the id, byte for byte: ${is}`, async () => {
      const id = ids.get(is)!
      const before = theSweepsRow(id)
      const reply = await ask(id)
      expect(before === null).toBe(ANSWERED_404.has(is))
      if (before === null) {
        expect(reply.statusCode, reply.body).toBe(404)
      } else {
        expect(reply.statusCode, reply.body).toBe(200)
        expect(JSON.stringify((JSON.parse(reply.body) as { session: unknown }).session)).toBe(JSON.stringify(before))
      }
    })
  }

  for (const is of THE_CASES) {
    it(`2. builds no more rows than the sweep has of the id, and reads no run that no id names: ${is}`, async () => {
      const id = ids.get(is)!
      const rows = theSweepsRowsOf(id)
      scans = 0
      const ran = await theStatementsOf(() => ask(id))
      expect(scans).toBeLessThanOrEqual(rows)
      expect(ran.filter((one) => one.gave.includes(NOBODY_NAMES_IT)).map((one) => one.sql)).toEqual([])
    })
  }

  it('2. control: the sweep builds more rows than any id here has, and reads the run that no id names', async () => {
    const most = Math.max(...THE_CASES.map((is) => theSweepsRowsOf(ids.get(is)!)))
    scans = 0
    const ran = await theStatementsOf(async () => S.sweepSessions(HERE, env(), { placement: false }))
    expect(scans).toBeGreaterThan(most)
    expect(ran.filter((one) => one.gave.includes(NOBODY_NAMES_IT))).not.toEqual([])
  })

  it("3. with a folder that would not open: a 404 says so as the list does, and a run is the sweep's", async () => {
    chmodSync(LOCKED_FOLDER, 0o000)
    try {
      const list = await app.inject({ method: 'GET', url: '/api/sessions', headers })
      const { warning, unreadable } = JSON.parse(list.body) as { warning?: string; unreadable: unknown[] }
      // CONTROL: the folder would not open, so the list names it and says the search was incomplete.
      expect(unreadable).toHaveLength(1)
      expect(warning).toEqual(expect.any(String))
      for (const is of ['a tool and conversation that nothing has', 'a record id that nothing has'] as const) {
        const reply = await ask(ids.get(is)!)
        expect(reply.statusCode).toBe(404)
        expect(reply.body).toContain(JSON.stringify(warning).slice(1, -1))
      }
      const id = ids.get('a stamped run whose transcript is on disk, by its record')!
      const before = theSweepsRow(id)
      const reply = await ask(id)
      expect(reply.statusCode, reply.body).toBe(200)
      expect(JSON.stringify((JSON.parse(reply.body) as { session: unknown }).session)).toBe(JSON.stringify(before))
    } finally {
      chmodSync(LOCKED_FOLDER, 0o755)
    }
  })
})
