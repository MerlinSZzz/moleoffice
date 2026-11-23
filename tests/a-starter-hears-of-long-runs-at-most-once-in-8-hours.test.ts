// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STARTER HEARS OF ITS LONG SANDBOX RUNS AT MOST ONCE IN 8 HOURS (decision ul-4jmPj6PK8, wave 13y round 141).
 *
 * Until now the office wrote one line for each sandbox run still running 8 hours after it was filed. On 5 November 2026
 * one supervisor got 104 such lines in one night (112 lines to all starters, one per run). The decision: the first
 * long-run line to an addressee goes at once; after it, at most one line in any 8 hours, naming every run that passed 8
 * hours since that addressee's last such line. Each run is named once, and the line stops nothing.
 *
 * WHAT THIS FILE PROVES, through the office's reminder tick at moments it chooses on a fixed clock:
 * 1. Many runs of one starter passing 8 hours in one night give that starter two lines. The first names the first run, at
 *    once. Nothing more is written for 8 hours. The second names the rest, and none of them twice.
 * 2. A second starter gets its own first line at once, while the first starter is still inside its 8 hours.
 * 3. A run its starter has closed is not named, though it still says running: closing a run leaves its work state as it
 *    was. A run of the same starter, filed at the same moment and left open, is named.
 *
 * WHERE THE RULE LIVES: `sendTheLongSandboxRunRemindersThatAreDue` in src/server/lib/reminders.ts. Every key, agent and
 * run here is made up, in this file's own empty office.
 *
 * Both cases were red before the change. The old code wrote one line for each run as soon as it was due, so the first
 * starter got four lines, and the tick at 9 hours named the first starter's second run beside the second starter's run.
 *
 * Case 3 was red before its change: the step read every sandbox run that said running, closed or not, so the tick at 19
 * hours named the closed run beside the open one.
 *
 * MUTATIONS, each proved red after a control run and restored:
 *   1. the wait of 8 hours taken out (every due run told at once): cases 1 and 2 red.
 *   2. the wait read from the last long-run line to anyone, not to this starter: cases 1 and 2 red.
 *   3. a line naming every due run, the ones already named too: cases 1 and 2 red.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const HOUR = 3_600_000
const MINUTE = 60_000
/** The moment the first run is filed, on a fixed clock. */
const T0 = new Date('2030-03-04T18:00:00Z').getTime()

let t: TestDb
let app: FastifyInstance
let reminders: typeof import('../src/server/lib/reminders.ts')
let resources: typeof import('../src/server/lib/resources.ts')
const directories: string[] = []
const starters: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' }
const runs: Record<string, string> = {}
const reminded: Record<string, string[]> = {}

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** A running sandbox run serving `handle`, filed by the office's worker `ms` after T0. Its folder is a made-up empty one. */
async function aRunFiledAt(ms: number, handle: string): Promise<string> {
  vi.setSystemTime(T0 + ms)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-long-runs-'))
  directories.push(dir)
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic long sandbox run',
      data: {
        state: 'running', runtime: 'codex', startedByMoleOffice: true, servingAgent: handle, doing: 'a made-up round', workingDirectory: dir,
        sandbox: { template: 'test-template', container: 'test-row', folder: dir },
      },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  return (filed.json() as { record: PanelRecord }).record.id
}

/** One tick of the office's reminder watcher `ms` after T0, keeping what it says it reminded. */
function tickAt(name: string, ms: number): string[] {
  vi.setSystemTime(T0 + ms)
  const now = new Date(T0 + ms)
  const done = reminders.sendTheRemindersThatAreDue('default', now, new Date(now.getTime() - MINUTE))
  reminded[name] = done.longSandboxRunsReminded
  return done.longSandboxRunsReminded
}

/** Every long-run line the office wrote to `to`, oldest first, with every run it names and its whole sentence. */
function theLongRunLinesTo(to: string): { runs: string[]; said: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT json_extract(data, '$.aboutRun') AS about, json_extract(data, '$.extra.longRuns') AS runs, json_extract(data, '$.saidInFull') AS said " +
          "FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.notice') = 'aSandboxRunHasRunLong' AND json_extract(data, '$.to[0].id') = ? ORDER BY created_at, rowid",
      )
      .all(to) as { about: string | null; runs: string | null; said: string }[]
  ).map((one) => ({ runs: one.runs === null ? (one.about === null ? [] : [one.about]) : (JSON.parse(one.runs) as string[]), said: one.said }))
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  reminders = await import('../src/server/lib/reminders.ts')
  resources = await import('../src/server/lib/resources.ts')
  // THE MADE-UP CONTAINER IS SAID TO BE RUNNING, so the tick's closer of runs whose container stopped leaves these runs as they are.
  resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers: () => ({ available: true, containers: [{ id: 'made-up', name: 'test-row', image: 'made-up', status: 'Up' }] }),
  }))
  for (const side of ['a', 'b', 'c'] as const) {
    const starter = `a-long-run-starter-${side}`
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: starter, name: starter, role: 'secretary', runtime: 'claude-code' } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(starter), payload: { handle: `a-long-round-${side}`, name: `a-long-round-${side}`, role: 'worker', runtime: 'codex', workArea: ['work'] } })
    expect(worker.statusCode, worker.body.slice(0, 300)).toBe(201)
  }
  const agents = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  starters.a = agents.agents.find((one) => one.handle === 'a-long-run-starter-a')!.id
  starters.b = agents.agents.find((one) => one.handle === 'a-long-run-starter-b')!.id
  starters.c = agents.agents.find((one) => one.handle === 'a-long-run-starter-c')!.id
  vi.useFakeTimers({ toFake: ['Date'] })
  // FOUR RUNS OF THE FIRST STARTER, filed an hour apart and then later, and one of the second's.
  runs.a1 = await aRunFiledAt(0, 'a-long-round-a')
  runs.a2 = await aRunFiledAt(1 * HOUR, 'a-long-round-a')
  runs.b1 = await aRunFiledAt(1 * HOUR + MINUTE, 'a-long-round-b')
  runs.a3 = await aRunFiledAt(2 * HOUR, 'a-long-round-a')
  runs.a4 = await aRunFiledAt(9 * HOUR, 'a-long-round-a')
  // TWO RUNS OF A THIRD STARTER, filed together after the first starter's last run. Its starter closes the first, and
  // closing leaves the work state as it was, so both still say running.
  runs.c1 = await aRunFiledAt(10 * HOUR, 'a-long-round-c')
  runs.c2 = await aRunFiledAt(10 * HOUR, 'a-long-round-c')
  vi.setSystemTime(T0 + 10 * HOUR + 30 * MINUTE)
  const closed = await app.inject({
    method: 'POST',
    url: `/api/attachments/${runs.c1}/close`,
    headers: asAgent('a-long-run-starter-c'),
    payload: { how: 'starter-said', because: 'The made-up round was finished and its starter closed it.' },
  })
  expect(closed.statusCode, closed.body.slice(0, 300)).toBe(200)
  // THE NIGHT, tick by tick: each run passes 8 hours, and the first starter's 8 hours end at 16 hours 2 minutes.
  tickAt('8h', 8 * HOUR + 2 * MINUTE)
  tickAt('9h', 9 * HOUR + 2 * MINUTE)
  tickAt('10h', 10 * HOUR + 2 * MINUTE)
  tickAt('16h', 16 * HOUR + MINUTE)
  tickAt('16h+', 16 * HOUR + 3 * MINUTE)
  tickAt('17h', 17 * HOUR + 2 * MINUTE)
  // THE THIRD STARTER'S TWO RUNS PASS 8 HOURS at 18 hours, while the first starter is still inside its 8 hours.
  tickAt('19h', 19 * HOUR + 2 * MINUTE)
}, 120_000)

afterAll(async () => {
  vi.useRealTimers()
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe("a starter's long sandbox runs", () => {
  it('1. many runs passing 8 hours in one night give their starter two lines, the second naming the rest', () => {
    const lines = theLongRunLinesTo(starters.a)
    expect(lines.map((one) => one.runs)).toEqual([[runs.a1], [runs.a2, runs.a3]])
    expect(reminded['8h']).toEqual([runs.a1])
    expect(reminded['9h']).not.toContain(runs.a2)
    expect(reminded['10h']).toEqual([])
    expect(reminded['16h']).toEqual([])
    expect(reminded['16h+']).toEqual([runs.a2, runs.a3])
    expect(reminded['17h']).toEqual([])
    expect(lines[0]!.said).toContain(`Run ${runs.a1} still says running more than 8 hours after it was filed.`)
    expect(lines[1]!.said).toContain(`2 runs still say running more than 8 hours after they were filed: ${runs.a2}, ${runs.a3}.`)
    for (const one of lines) {
      expect(one.said).toContain('Mole Office writes you at most one such line in 8 hours, and names each run once.')
    }
    for (const run of [runs.a1, runs.a2, runs.a3, runs.a4]) expect(t.api.getRecord(run!)!.data['state']).toBe('running')
  })

  it('2. a second starter gets its own first line at once, while the first is still inside its 8 hours', () => {
    expect(reminded['9h']).toEqual([runs.b1])
    expect(theLongRunLinesTo(starters.b).map((one) => one.runs)).toEqual([[runs.b1]])
  })

  it('3. a run its starter closed is not named, though it still says running; its open twin is', () => {
    const closed = t.api.getRecord(runs.c1!)!.data
    expect(closed['closedHow']).toBe('starter-said')
    expect(closed['state']).toBe('running')
    expect(reminded['19h']).toEqual([runs.c2])
    expect(theLongRunLinesTo(starters.c).map((one) => one.runs)).toEqual([[runs.c2]])
  })
})
