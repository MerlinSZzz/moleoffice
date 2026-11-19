// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STOPPING THE OFFICE ON THE OWNER'S WRITTEN WORDS. Wave 13s, round 84, piece B.
 *
 * The shutdown door, POST /api/office/shut-down, was the proved owner's, or a secretary holding the owner's grant where
 * this office's list of what the grant carries says the grant presses it. A later decision lets a
 * secretary carrying the owner's written words for this act press it too, whatever the list says. The grant still
 * presses it where the list says so.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office; made-up agents, a real
 * grant and this office's own answers about the door. The shutdown's way out is a stand-in that records what it was
 * asked and stops nothing, and the runs at work are a stand-in operating-system reading, so no process on this
 * computer is signalled. Every record here is synthetic.
 *
 * THE CASES, EACH THROUGH THE ROUTE:
 *   1. a secretary with no words and no grant, even with this office's list at may-press, hears the door's old refusal
 *      with its code, and nothing is stopped and no change row is written;
 *   2. a secretary with the owner's words for office.shut-down, with the list at kept, passes: the run at work is
 *      paused, its record names the secretary and keeps the words, and one change row on setting:office-shut-down names
 *      the secretary and keeps the words;
 *   3. words for another act are refused with shutDownBadWarrant, and nothing is stopped;
 *   4. a worker carrying the right words is refused in the door's old words, and nothing is stopped;
 *   5. a secretary holding the grant, with the list at may-press and no words, presses as today: one press row, no
 *      change row;
 *   6. a secretary carrying the right words with no key is refused in the door's old words, and nothing is stopped.
 *
 * MUTATIONS, each alone after the green run, 23 October 2026, from the logs of the runs:
 *   1. `aSecretaryWithItsOwnKey` taken out of the words path: case 6 red only, because a keyless secretary carrying the
 *      right words then pressed the shutdown.
 *   2. the act string changed to `office.another-act`: case 2 red, because the right words were then refused, and case 3
 *      red, because its refusal named `office.another-act` rather than the act the door asks about.
 *   3. the words path passing `actorFrom(req)` to `pauseTheRunsAtWork` instead of the words actor: case 2 red only,
 *      because the paused run's change row no longer kept the words.
 *   4. the change row taken out: case 2 red only, because no row on setting:office-shut-down was written.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'shut-grant-secretary'
const UNRAISED = 'shut-plain-secretary'
const WORKER = 'shut-worker'
const DOOR = 'office.shut-down'

/** The door's refusal to anybody it does not let in, which a caller with no grant still hears. */
const THE_DOORS_REFUSAL =
  "Only the owner may shut the office down, or a secretary holding the owner's grant where this office's list of what " +
  'the grant carries says so. Any other agent is refused.'

let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const keys = new Map<string, string>()
const ids = new Map<string, string>()
let grant = ''
const shouted: string[] = []
const answered = new Set<string>()

/** The headers every request carries, and the person's own among them. */
const BASE: Record<string, string> = { 'x-mole-office-workspace': 'default' }
const PERSON: Record<string, string> = {
  ...BASE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const as = (handle: string): Record<string, string> => ({
  ...BASE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})
const asKeyless = (handle: string): Record<string, string> => ({
  ...BASE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface AReply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  error: string
  raw: string
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<AReply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** This office's answer about the shutdown door, as the person gives it, taken back after each case. */
function answer(said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(DOOR, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(DOOR)
}

/** The owner's written words for one act, as a secretary carries them. */
function theOwnersWords(...acts: string[]): Record<string, unknown> {
  return {
    saidBy: THE_PERSON,
    words: 'Made-up words: shut Mole Office down for me.',
    where: 'terminal',
    when: '2026-10-23 10:00',
    for: acts,
  }
}

const theLast = (table: string): number => (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

interface AChangeRow {
  record_id: string
  actor_type: string
  actor_id: string
  field: string | null
  old_value: string | null
  new_value: string | null
  warrant: string | null
  elevation: string | null
  press_id: string | null
}

function rowsSince(mark: number): AChangeRow[] {
  return t.client.sqlite
    .prepare(
      'SELECT record_id, actor_type, actor_id, field, old_value, new_value, warrant, elevation, press_id FROM changes ' +
        'WHERE rowid > ? ORDER BY rowid',
    )
    .all(mark) as AChangeRow[]
}

interface APressRow {
  id: string
  agent_id: string
  grant_id: string
  operation: string
  reason: string | null
}

function pressesSince(mark: number): APressRow[] {
  return t.client.sqlite
    .prepare('SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark) as APressRow[]
}

/** A session's stored data, as the record door wrote it. */
function theRunsData(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string } | undefined
  if (row === undefined) throw new Error(`No session record answers to ${id}.`)
  return JSON.parse(row.data) as Record<string, unknown>
}

// --------------------------------------------------------------------------------------------- the stand-in machine

type OsProbe = typeof import('../src/server/lib/resources.ts')['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const live = new Map<number, OsProcess>()
let nextPid = 4_200_001

/** The stand-in machine: the processes this test says are at work, and no real signal. */
function standInProbe(): OsProbe {
  return {
    ...res.LINUX_PROBE,
    platform: 'stand-in',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((one) => one.pgid === pgid),
    processTable: () => ({
      ok: true,
      processes: [...live.values()].map((one) => ({ pid: one.pid, command: one.command, cwd: null })),
    }),
    listeningPorts: () => [],
    ownProcessGroup: () => 4_390_001,
    killProcessGroup: (pgid) => {
      for (const one of [...live.values()]) if (one.pgid === pgid) live.delete(one.pid)
    },
  }
}

/** A run of one agent, at work on the stand-in machine, delivering a made-up message. */
async function aRunAtWork(handle: string, answers: 201 | 409): Promise<{ run: string; pid: number }> {
  const message = await call('POST', '/api/records', PERSON, {
    kind: 'message',
    title: `A made-up message to ${handle}`,
    data: { body: 'Please work through the round.', to: [{ kind: 'agent', id: ids.get(handle) }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx). A
  // send to an agent whose run from an earlier case is still going answers 201.
  expect(message.status, message.raw).toBe(answers)
  const messageId = String((message.body['record'] as { id: string }).id)
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'session',
    title: `A made-up run of ${handle}`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgent: handle,
      servingAgentId: ids.get(handle),
      deliveringMessage: messageId,
      providerSession: 'made-up-conversation',
    },
  })
  expect(filed.status, filed.raw).toBe(201)
  const run = String((filed.body['record'] as { id: string }).id)
  // THE PROCESS STARTED WHEN THE RUN WAS FILED, so the ledger reads it as this session's own.
  const createdAt = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(run) as { at: string }).at
  const pid = nextPid++
  live.set(pid, { pid, pgid: pid, ppid: 1, command: 'claude --print a round of work', startedAt: createdAt })
  const registered = await call('POST', '/api/resources', PERSON, {
    sessionRecordId: run,
    type: 'process',
    key: String(pid),
    startedByTheProduct: true,
  })
  expect(registered.status, registered.raw).toBe(201)
  return { run, pid }
}

/** A refused press wrote nothing and stopped nothing. */
async function refusedAndNothingStopped(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  run: string,
  pid: number,
): Promise<AReply> {
  const changes = theLast('changes')
  const presses = theLast('presses_for_the_person')
  try {
    const refused = await call('POST', '/api/office/shut-down', headers, body)
    expect(refused.status, refused.raw).toBe(403)
    expect(live.has(pid), 'a refused press stopped the run at work').toBe(true)
    expect(theRunsData(run)['state'], 'a refused press wrote on the run').toBe('running')
    expect(rowsSince(changes), 'a refused press wrote a change row').toEqual([])
    expect(pressesSince(presses), 'a refused press wrote a press row').toEqual([])
    return refused
  } finally {
    live.delete(pid)
  }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  res = await import('../src/server/lib/resources.ts')
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  // THE WAY OUT IS A STAND-IN: it records what it was asked and shuts nothing down.
  const pausing = await import('../src/server/lib/pausing.ts')
  pausing.thisServerShutsDownWith({
    stopTheWorker: async () => 'The stand-in message worker stopped.',
    shutDown: (because: string) => {
      shouted.push(because)
    },
  })
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))

  for (const [handle, role] of [
    [RAISED, 'secretary'],
    [UNRAISED, 'secretary'],
    [WORKER, 'worker'],
  ] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grant = String(raised.body.elevation?.id ?? '')
  expect(grant).not.toBe('')
}, 60_000)

beforeEach(() => {
  live.clear()
  shouted.length = 0
  res.useOsProbe(standInProbe())
})

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('stopping the office on the owner’s written words', () => {
  it('1: no words and no grant is refused in the door’s old words, even where the list says may-press, and nothing is stopped', async () => {
    answer('may-press')
    const { run, pid } = await aRunAtWork(UNRAISED, 409)
    const refused = await refusedAndNothingStopped(as(UNRAISED), { why: 'A made-up reason.', seen: [run] }, run, pid)
    expect(refused.body['code'], refused.raw).toBe('shutDownOnlyTheOwner')
    expect(refused.error).toContain(THE_DOORS_REFUSAL)
  })

  it('2: on the owner’s words for office.shut-down, with the list at kept, pauses the runs and writes one change row that names the secretary and keeps the words', async () => {
    answer('kept')
    const { run, pid } = await aRunAtWork(UNRAISED, 201)
    const changes = theLast('changes')
    const presses = theLast('presses_for_the_person')
    const words = theOwnersWords(DOOR)
    const done = await call('POST', '/api/office/shut-down', as(UNRAISED), {
      why: 'A made-up shutdown on the owner’s words.',
      seen: [run],
      warrant: words,
    })
    expect(done.status, done.raw).toBe(200)
    expect(done.body['shuttingDown']).toBe(true)
    expect((done.body['paused'] as { session: string }[]).map((one) => one.session)).toEqual([run])
    expect(live.has(pid), 'the run at work was not stopped').toBe(false)
    expect(shouted, 'the stand-in way out was not asked').toHaveLength(1)
    expect(shouted[0]).toContain(`the agent ${UNRAISED}`)
    expect(shouted[0]).toContain('A made-up shutdown on the owner’s words.')

    // THE RUN'S OWN RECORD names the secretary and keeps the words.
    const data = theRunsData(run)
    expect(data['state']).toBe('paused')
    expect(data['paused']).toMatchObject({ by: { kind: 'agent', id: UNRAISED } })
    expect(String((data['paused'] as { because: string }).because)).toContain(`the agent ${UNRAISED}`)
    expect(String(data['doing'])).toContain('Paused by a shutdown of Mole Office')

    // ONE CHANGE ROW ON THE SETTING, naming the secretary and keeping the words, and no row naming the person.
    const rows = rowsSince(changes)
    expect(rows.filter((row) => row.actor_type === 'human' || row.actor_id === THE_PERSON), 'a change row names the person').toEqual([])
    const settingRows = rows.filter((row) => row.record_id === 'setting:office-shut-down')
    expect(settingRows.length, 'one change row for the shutdown on the words').toBe(1)
    expect(settingRows[0]).toMatchObject({
      actor_type: 'agent',
      actor_id: UNRAISED,
      field: 'a shutdown was requested',
      old_value: null,
      elevation: null,
      press_id: null,
    })
    expect(JSON.parse(settingRows[0]!.warrant!)).toEqual(words)

    // THE PAUSED RUN'S CHANGE LOG keeps the words on the act the release wrote.
    const pausedRows = rows.filter((row) => row.record_id === run)
    const theRelease = pausedRows.find((row) => row.actor_id === UNRAISED)
    expect(theRelease, 'the paused run’s record does not name the secretary').toBeDefined()
    expect(JSON.parse(theRelease!.warrant!)).toEqual(words)

    // A press on the words is not a press under the grant, so no press row is written.
    expect(pressesSince(presses), 'a press on the words wrote a press row under the grant').toEqual([])
  })

  it('3: words for another act are refused with shutDownBadWarrant, and nothing is stopped', async () => {
    answer('may-press')
    const { run, pid } = await aRunAtWork(UNRAISED, 201)
    const refused = await refusedAndNothingStopped(
      as(UNRAISED),
      { why: 'A made-up reason.', seen: [run], warrant: theOwnersWords('office.restart') },
      run,
      pid,
    )
    expect(refused.body['code'], refused.raw).toBe('shutDownBadWarrant')
    expect(refused.body['values']).toEqual({ reason: refused.error })
    expect(refused.error).toContain('office.shut-down')
  })

  it('4: a worker carrying the right words is refused in the door’s old words, and nothing is stopped', async () => {
    answer('may-press')
    const { run, pid } = await aRunAtWork(WORKER, 409)
    const refused = await refusedAndNothingStopped(
      as(WORKER),
      { why: 'A made-up reason.', seen: [run], warrant: theOwnersWords(DOOR) },
      run,
      pid,
    )
    expect(refused.body['code'], refused.raw).toBe('shutDownOnlyTheOwner')
    expect(refused.error).toContain(THE_DOORS_REFUSAL)
  })

  it('5: under the grant, with the list at may-press and no words, presses as today and writes no change row', async () => {
    answer('may-press')
    const changes = theLast('changes')
    const presses = theLast('presses_for_the_person')
    const done = await call('POST', '/api/office/shut-down', as(RAISED), { why: 'A made-up granted shutdown.', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    expect(done.body['paused']).toEqual([])
    expect(shouted, 'the stand-in way out was not asked').toHaveLength(1)
    expect(rowsSince(changes), 'a granted shutdown wrote a change row').toEqual([])
    expect(pressesSince(presses)).toMatchObject([
      { agent_id: RAISED, grant_id: grant, operation: DOOR, reason: A_TESTS_REASON_FOR_THE_PERSON },
    ])
  })

  it('6: a secretary carrying the right words with no key is refused in the door’s old words, and nothing is stopped', async () => {
    answer('may-press')
    const { run, pid } = await aRunAtWork(UNRAISED, 201)
    const refused = await refusedAndNothingStopped(
      asKeyless(UNRAISED),
      { why: 'A made-up reason.', seen: [run], warrant: theOwnersWords(DOOR) },
      run,
      pid,
    )
    expect(refused.body['code'], refused.raw).toBe('shutDownOnlyTheOwner')
    expect(refused.error).toContain(THE_DOORS_REFUSAL)
  })
})
