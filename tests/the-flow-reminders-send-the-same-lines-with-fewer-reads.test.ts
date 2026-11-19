// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS SEND THE SAME LINES WITH FEWER READS.
 *
 * Two steps of the minute's flow reminders (src/server/lib/reminders.ts) held the server longest. The idle reminder read
 * the agent of every run it looked at with a statement of its own, beside the run's newest use, and every agent of the
 * registry whole. The long-run reminder read every message the office ever sent, and parsed each, to find the few long-run lines
 * among them. On a made-up office shaped like the live one the two took about 140 ms and 65 ms of every minute.
 *
 * WHAT IS PROVED
 *   1. The idle reminder goes to the agents it went to before, in the registry's order, and a run's newest stamp is
 *      taken in SQLite's order of the stored words, as the grouped reading took it.
 *   2. A run that changed adds one statement to the idle step, the read of its newest use, and no read of its agent.
 *   3. A run named second in an older long-run line, whose first run has ended, is not named again.
 *   4. The long-run lines are read by the records the index of the records' text keeps, by their keys, and not through
 *      every message the office sent.
 *   5. When that index keeps too many records, every office line is read as before, and no run is named twice.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a run's newest stamp taken in time order and not in SQLite's order          → case 1
 *   the agents asked in the order their activity was read                        → case 1
 *   each run's agent read again with a statement of its own                      → case 2
 *   a line's runs taken only from the run it is about first                      → case 3
 *   the long-run lines read through the index of who sent a message              → case 4
 *   nothing read when the index of the records' text cannot narrow               → case 5
 *
 * WHAT THIS DOES NOT PROVE. The time a step takes. A fresh test office has a few records, so it shows the reads and the
 * lines, and the times are measured on a made-up office of the live size outside the suite.
 *
 * Every key, agent, run and record here is made up, in this file's own empty office.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const HOUR = 3_600_000
const MINUTE = 60_000
/** The first moment of this file's office, early in the UTC day, so a local stamp two hours on bears this date or an earlier one in every zone. */
const T0 = new Date('2030-03-04T06:00:00Z').getTime()
/** The long-run runs are filed from here, after the idle cases. */
const L0 = T0 + 6 * HOUR
/** The words every long-run line's reading names, and the steps its plan may hold. */
const THE_RUNS_OF_A_LINE = "'$.extra.longRuns'"
const BY_ITS_KEY = /^SEARCH records USING INDEX sqlite_autoindex_records_1 \(id=\?\)$/
const BY_ITS_SENDER = /records_message_sent_by_idx/
const A_WHOLE_READ = /^SCAN records\b/

let t: TestDb
let app: FastifyInstance
let reminders: typeof import('../src/server/lib/reminders.ts')
let resources: typeof import('../src/server/lib/resources.ts')
let textIndex: typeof import('../src/server/lib/record-text-index.ts')
let hours: number
const directories: string[] = []
const agents: Record<string, string> = {}
const runs: Record<string, string> = {}
const reminded: Record<string, string[]> = {}
const idleStatements: Record<string, number> = {}
const lineReadings: Record<string, { text: string; args: unknown[] }[]> = {}

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** A secretary started by the person, or a worker started by `starter`, kept by its handle. */
async function anAgent(handle: string, starter?: string): Promise<void> {
  const payload = starter === undefined ? { handle, name: handle, role: 'secretary', runtime: 'claude-code' } : { handle, name: handle, role: 'worker', runtime: 'codex', workArea: ['work'] }
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter === undefined ? AS_THE_PERSON : asAgent(starter), payload })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  agents[handle] = listed.agents.find((one) => one.handle === handle)!.id
}

/** A finished run of `agent`, filed now, naming it by `storedHandle` and its id, with any newest output given. */
function aFinishedRun(agent: string, storedHandle: string, lastOutputAt?: string): string {
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up run', actor: t.api.HUMAN, data: { state: 'finished' } })
  const data: Record<string, unknown> = { state: 'finished', servingAgent: storedHandle, servingAgentId: agents[agent] }
  if (lastOutputAt !== undefined) data['lastOutputAt'] = lastOutputAt
  t.client.sqlite.prepare('UPDATE records SET data = json_patch(data, ?) WHERE id = ?').run(JSON.stringify(data), run.id)
  return run.id
}

/** A running sandbox run serving `handle`, filed by the office's worker at `at`. Its folder is a made-up empty one. */
async function aSandboxRunFiledAt(at: number, handle: string): Promise<string> {
  vi.setSystemTime(at)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-fewer-reads-'))
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

/** Every long-run line reading that runs during `work`, with the values it was bound to. */
function theLineReadingsDuring(work: () => void): { text: string; args: unknown[] }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const asked: { text: string; args: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    if (text.includes(THE_RUNS_OF_A_LINE)) {
      const read = statement['all'] as (...args: unknown[]) => unknown
      statement['all'] = function (this: unknown, ...args: unknown[]) {
        asked.push({ text, args })
        return read.apply(this, args)
      }
    }
    return statement
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  return asked
}

/** The plan of one caught reading, one step to a string. */
function thePlanOf(reading: { text: string; args: unknown[] }): string[] {
  return (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${reading.text}`).all(...reading.args) as { detail: string }[]).map((step) => step.detail)
}

/** One pass of the office's reminders at `at`, keeping what it reminded, the idle step's statements and the line readings. */
function aPassAt(name: string, at: number): void {
  vi.setSystemTime(at)
  const steps: import('../src/server/lib/reminders.ts').AStepOfThePass[] = []
  let done: ReturnType<typeof reminders.sendTheRemindersThatAreDue> | null = null
  lineReadings[name] = theLineReadingsDuring(() => {
    done = reminders.sendTheRemindersThatAreDue('default', new Date(at), new Date(T0 - MINUTE), undefined, steps)
  })
  const pass = done as unknown as ReturnType<typeof reminders.sendTheRemindersThatAreDue>
  reminded[`${name} idle`] = pass.idleReminded
  reminded[`${name} long`] = pass.longSandboxRunsReminded
  idleStatements[name] = steps.find((one) => one.name === 'the idle reminder')!.statements
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  reminders = await import('../src/server/lib/reminders.ts')
  resources = await import('../src/server/lib/resources.ts')
  textIndex = await import('../src/server/lib/record-text-index.ts')
  hours = (await import('../src/server/db/env.ts')).idleReminderHours()
  // THE MADE-UP CONTAINER IS SAID TO BE RUNNING, so the tick's closer of runs whose container stopped leaves these runs as they are.
  resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers: () => ({ available: true, containers: [{ id: 'made-up', name: 'test-row', image: 'made-up', status: 'Up' }] }),
  }))
  await anAgent('made-up-starter')
  for (const handle of ['made-up-idle-a', 'made-up-idle-b', 'made-up-idle-c', 'made-up-idle-d']) await anAgent(handle, 'made-up-starter')
  await anAgent('made-up-long-run-starter')
  await anAgent('made-up-long-round', 'made-up-long-run-starter')
  vi.useFakeTimers({ toFake: ['Date'] })

  // THE IDLE CASES. A's run is filed last, under the handle A had before a rename, so A's activity is read after B's and
  // C's, whether the runs are read in the order they changed or grouped by the handle they name. C's newest output is
  // two stamps: a local one two hours on, and an ISO one an hour on, which SQLite's order of the words puts last.
  vi.setSystemTime(T0)
  runs.b = aFinishedRun('made-up-idle-b', 'made-up-idle-b')
  runs.c1 = aFinishedRun('made-up-idle-c', 'made-up-idle-c', localStamp(new Date(T0 + 2 * HOUR)))
  runs.c2 = aFinishedRun('made-up-idle-c', 'made-up-idle-c', new Date(T0 + HOUR).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  runs.a = aFinishedRun('made-up-idle-a', 'zz-made-up-idle-a-before-its-rename')
  aPassAt('idle', T0 + HOUR + hours * HOUR + 30 * MINUTE)
  // THE SAME MOMENT THREE TIMES: the first pass says what is due, the second counts, and the third counts again after
  // six runs of D changed, so the only difference between the counted two is those runs.
  const later = T0 + HOUR + hours * HOUR + 40 * MINUTE
  aPassAt('settle', later)
  aPassAt('before D', later)
  for (let one = 0; one < 6; one++) runs[`d${String(one)}`] = aFinishedRun('made-up-idle-d', 'made-up-idle-d')
  aPassAt('after D', later)

  // THE LONG-RUN CASES. Three runs filed an hour apart: the first is named at once, the other two in one line 8 hours
  // later, and then the second ends, so only the line about the second still names the third.
  runs.r1 = await aSandboxRunFiledAt(L0, 'made-up-long-round')
  runs.r2 = await aSandboxRunFiledAt(L0 + HOUR, 'made-up-long-round')
  runs.r3 = await aSandboxRunFiledAt(L0 + 2 * HOUR, 'made-up-long-round')
  aPassAt('8h', L0 + 8 * HOUR + 2 * MINUTE)
  aPassAt('16h', L0 + 16 * HOUR + 3 * MINUTE)
  vi.setSystemTime(L0 + 16 * HOUR + 10 * MINUTE)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished'), updated_at = ? WHERE id = ?").run(localStamp(new Date()), runs.r2)
  aPassAt('24h', L0 + 24 * HOUR + 5 * MINUTE)
  // MORE RECORDS HOLD THE LINE'S WORDS THAN THE INDEX OF THE RECORDS' TEXT NARROWS TO: notes, so no other step reads them.
  vi.setSystemTime(L0 + 24 * HOUR + 6 * MINUTE)
  const line = 'A sandbox run is still running'
  for (let one = 0; one <= textIndex.AT_MOST_READ_BY_ID; one++) {
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `A made-up note ${String(one)}`, actor: t.api.HUMAN, data: { body: line } })
  }
  expect(textIndex.theRecordsThatMayHoldOneOf([line])).toBeUndefined()
  aPassAt('24h, too many', L0 + 24 * HOUR + 7 * MINUTE)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the flow reminders send the same lines with fewer reads', () => {
  it("1. the idle reminder goes to the same agents, in the registry's order, with a run's stamps in SQLite's order", () => {
    expect(reminded['idle idle']).toEqual(['made-up-idle-a', 'made-up-idle-b', 'made-up-idle-c'])
    expect(reminded['settle idle']).toEqual([])
  })

  it('2. a run that changed adds one statement to the idle step, its newest use, and no read of its agent', () => {
    expect(reminded['before D idle']).toEqual([])
    expect(reminded['after D idle']).toEqual([])
    expect(idleStatements['after D']! - idleStatements['before D']!).toBeLessThanOrEqual(6)
  })

  it('3. a run named second in an older line, whose first run has ended, is not named again', () => {
    expect(reminded['8h long']).toEqual([runs.r1])
    expect(reminded['16h long']).toEqual([runs.r2, runs.r3])
    expect(reminded['24h long']).toEqual([])
  })

  it('4. the long-run lines are read by the keys the index of the records\' text keeps, not through every office message', () => {
    for (const name of ['8h', '16h', '24h']) {
      expect(lineReadings[name], name).toHaveLength(1)
      const plan = thePlanOf(lineReadings[name]![0]!)
      const said = `${name}\n${lineReadings[name]![0]!.text}\n${plan.join(' | ')}`
      expect(plan.some((step) => BY_ITS_KEY.test(step)), said).toBe(true)
      expect(plan.some((step) => BY_ITS_SENDER.test(step)), said).toBe(false)
      expect(plan.some((step) => A_WHOLE_READ.test(step)), said).toBe(false)
    }
  })

  it('5. when that index keeps too many records, every office line is read as before, and no run is named twice', () => {
    expect(reminded['24h, too many long']).toEqual([])
    expect(lineReadings['24h, too many']).toHaveLength(1)
    const plan = thePlanOf(lineReadings['24h, too many']![0]!)
    expect(plan.some((step) => BY_ITS_SENDER.test(step)), plan.join(' | ')).toBe(true)
  })
})
