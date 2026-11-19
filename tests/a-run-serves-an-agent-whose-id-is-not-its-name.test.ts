// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN SERVES AN AGENT WHOSE ID IS NOT ITS NAME, AND EVERY READER OF THE RUN STILL FINDS THE AGENT.
 *
 * Since criterion I1 a new agent is given a registry id of its own, and its handle is only the name
 * it goes by. A run's session record names the agent twice: `servingAgent` is the handle and
 * `servingAgentId` is the registry id (amendment of 23 September 2026 in
 * design/agents/IDENTITY-ACCEPTANCE.md). A record written before `servingAgentId` existed has only
 * `servingAgent`. Every reader here used to take `servingAgent` for the registry id, so with a minted
 * id none of them matched and the message worker stopped handing a new agent's messages to its runs.
 *
 * Each case below is about one reader, and each is asked of a run naming its agent in each of three
 * ways: by handle and registry id, by handle alone, and by the id of the agent's own record.
 *
 * THE MUTATIONS THAT TURN EACH CASE RED, one at a time, the rest of the change left in place:
 *   - picked up: in lib/worker.ts runsToPickUp, read `said(data['servingAgent'])` again.
 *   - the record spelling: in lib/worker.ts theAgentARunServes, return null instead of asking
 *     `agentForRecord` (only the third way of naming goes red).
 *   - already going: in lib/worker.ts theRunRowServing, compare `said(data['servingAgent'])`.
 *   - not refused: in lib/worker.ts whyThisReplyIsRefused, compare `said(data['servingAgent'])`.
 *   - presence: in lib/presence.ts liveProcessesFor, drop the filter by `theAgentARunServes` and
 *     bind `id` to the old `servingAgent = ?` statement.
 *   - run key: in api/records.ts, read `readParticipant({ kind: 'agent', id: serving })` from the raw
 *     `servingAgent` again.
 *   - branch press: in lib/worker.ts startANewAgentFor, address each moved message to `old.id`.
 *     Addressing the new agent as `{ id: handle }` no longer turns it red, because the record door
 *     stores an agent named by its handle under its registry id (criterion I2, lib/records.ts).
 *   - superseded: in lib/inspection.ts whereARunStands, call `howARunStands(data)` with no reader.
 *   - the office's sentences: in shared/releasing.ts, make `nameIn` return `who.id` always.
 *   - the run's page: in web/components/TheCheckOnARun.tsx, make its `nameOf` answer null always.
 *   - idle: in lib/reminders.ts activityPerAgent, key a run's activity by `row.handle` again.
 *   - overdue: in lib/reminders.ts runsCarryingAnExpectedTime, set `agentId` from `said['servingAgent']`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { ParticipantsReply } from '../src/web/api.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

type WorkerLib = typeof import('../src/server/lib/worker.ts')
type InspectionLib = typeof import('../src/server/lib/inspection.ts')

let t: TestDb
let app: FastifyInstance
let worker: WorkerLib
let inspection: InspectionLib
let transcripts = ''

const WORKSPACE = 'default'

/** The office's own key file, made up so a request carrying it is read as the office's. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

/** The three ways a run's record may name its agent. */
const HOW_A_RUN_NAMES_IT = [
  { named: 'by handle and by registry id', handle: 'served-both-ways', how: 'both' },
  { named: 'by handle alone, as a record from before servingAgentId', handle: 'served-by-handle', how: 'handle' },
  { named: "by the id of the agent's own record, as run o2RjuOUEIwpf did", handle: 'served-by-record', how: 'record' },
] as const

type How = (typeof HOW_A_RUN_NAMES_IT)[number]['how']

interface Served {
  handle: string
  id: string
  messageId: string
  run: string
}

const served = new Map<string, Served>()

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: (body ?? {}) as object })
  return { status: reply.statusCode, body: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_PERSON })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

/** Register an agent through the door, and give back its registry id. */
async function register(handle: string): Promise<string> {
  const made = await post('/api/agents/started', { handle, name: handle, runtime: 'claude-code' })
  expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** What a run's record says about the agent it serves, in one of the three ways. */
function servingFields(handle: string, id: string, how: How): Record<string, string> {
  if (how === 'both') return { servingAgent: handle, servingAgentId: id }
  if (how === 'handle') return { servingAgent: handle }
  const record = t.client.sqlite.prepare('SELECT record_id AS record FROM agent_records WHERE agent_id = ?').get(id) as { record: string }
  return { servingAgent: record.record }
}

/** A transcript written now, so presence reads the run's process as a run that is really there. */
function aTranscriptWrittenNow(handle: string): string {
  const path = join(transcripts, `${handle}.jsonl`)
  writeFileSync(
    path,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  return path
}

beforeAll(async () => {
  t = await freshDb()
  // THE OFFICE'S KEY FILE IS WRITTEN BEFORE THE SERVER IS BUILT, so a request carrying the made-up
  // office value is read as the office's, which is the only caller a run key is minted for.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  transcripts = mkdtempSync(join(tmpdir(), 'mole-office-serving-'))

  for (const way of HOW_A_RUN_NAMES_IT) {
    const id = await register(way.handle)
    const filed = await post('/api/records', {
      kind: 'message',
      title: `A question for ${way.handle}`,
      data: { body: `A question for ${way.handle}.`, to: [{ kind: 'agent', id }] },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, JSON.stringify(filed.body).slice(0, 300)).toBe(409)
    const messageId = (filed.body['record'] as { id: string }).id
    // A RUN THE OFFICE STARTED FOR THAT MESSAGE, with a live process row the PERSON wrote down, so
    // the only thing that makes it this agent's is what its own record says about the agent.
    const run = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: `${way.handle} answering a message`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        deliveringMessage: messageId,
        ...servingFields(way.handle, id, way.how),
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId: `serving-${way.handle}`,
            logPath: aTranscriptWrittenNow(way.handle),
            resumeCommand: null,
            startedAt: null,
            entryPoint: null,
          },
        },
      },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    const row = await post('/api/resources', { sessionRecordId: run, type: 'process', key: String(process.pid), detail: `this test process, for ${way.handle}`, startedByTheProduct: true, adopting: 'this test process started before the session the test filed for it' })
    expect((row.body['resource'] as { id?: string } | undefined)?.id, JSON.stringify(row.body).slice(0, 300)).toBeDefined()
    served.set(way.handle, { handle: way.handle, id, messageId, run })
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (transcripts !== '') rmSync(transcripts, { recursive: true, force: true })
})

describe('the agent is registered with an id that is not its handle', () => {
  it('holds a minted id for each agent, which is what every case below depends on', () => {
    for (const way of HOW_A_RUN_NAMES_IT) {
      const one = served.get(way.handle)!
      expect(one.id).not.toBe(one.handle)
    }
  })
})

describe.each(HOW_A_RUN_NAMES_IT)('a run that names its agent $named', (way) => {
  it('is picked up for the message to that agent after a restart', () => {
    const one = served.get(way.handle)!
    const found = worker.runsToPickUp(WORKSPACE).filter((run) => run.session === one.run)
    expect(found.map((run) => ({ agentId: run.agentId, handle: run.handle, messageId: run.messageId }))).toEqual([
      { agentId: one.id, handle: one.handle, messageId: one.messageId },
    ])
  })

  it('is the run that agent already has going, so no second run is started beside it', () => {
    const one = served.get(way.handle)!
    expect(worker.runServing(one.id, WORKSPACE)).toBe(one.run)
  })

  it('may file a reply from that agent', () => {
    const one = served.get(way.handle)!
    const refused = worker.whyThisReplyIsRefused(
      { inReplyTo: one.messageId, agent: { kind: 'agent', id: one.id }, fromRun: one.run, body: 'The answer.', to: [], toGroup: null },
      WORKSPACE,
    )
    expect(refused).toBeNull()
  })

  it('counts toward that agent being online', async () => {
    const one = served.get(way.handle)!
    const read = (await get('/api/presence')) as { presence?: { who: { kind: string; id: string }; colour: string; from: string | null }[] }
    const row = (read.presence ?? []).find((p) => p.who.kind === 'agent' && p.who.id === one.id)
    expect(row, `no presence row for ${one.id}`).toBeDefined()
    expect(row?.colour).toBe('green')
    expect(row?.from).toBe('a run answering as it')
  })

  it('is minted a run key for that agent when the office files it', async () => {
    const one = served.get(way.handle)!
    const filed = await post(
      '/api/records',
      {
        kind: 'session',
        title: `${way.handle} answering again`,
        data: {
          state: 'running',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          deliveringMessage: one.messageId,
          ...servingFields(one.handle, one.id, way.how),
        },
      },
      AS_THE_OFFICE_WORKER,
    )
    expect(filed.status, JSON.stringify(filed.body).slice(0, 300)).toBe(201)
    const runKey = filed.body['runKey'] as { handle?: string; key?: string } | undefined
    expect(runKey?.handle, 'the office minted this run no key').toBe(one.handle)
    expect(String(runKey?.key)).toMatch(/^[0-9a-f]{64}$/)
    const held = t.client.sqlite
      .prepare("SELECT whose_id AS whose FROM held_keys WHERE id = json_extract((SELECT data FROM records WHERE id = ?), '$.extra.runKeyId')")
      .get((filed.body['record'] as { id: string }).id) as { whose: string } | undefined
    expect(held?.whose, 'the run key is kept under the agent’s registry id').toBe(one.id)
  })
})

describe('the branch press', () => {
  let id = ''
  let filed: { status: number; body: Record<string, unknown> }
  let held: { messageId: string; nobodyIsAnsweringAsIt: string | null } | undefined

  // THE REGISTRATION AND THE HELD MESSAGE ARE MADE IN A HOOK, which gets sixty seconds in this file,
  // so the case's five seconds are left for the press itself. On 1 November 2026, in a related run of
  // 1,153 files with eight workers, the whole case took 6.2 s and no assertion failed. The case still
  // asserts what the hook was answered.
  beforeAll(async () => {
    id = await register('branch-from-me')
    filed = await post('/api/records', {
      kind: 'message',
      title: 'Are you there?',
      data: { body: 'Are you there?', to: [{ kind: 'agent', id }] },
    })
    const queue = (await get('/api/worker/queue')) as { queue?: { messageId: string; nobodyIsAnsweringAsIt: string | null }[] }
    held = (queue.queue ?? []).find((x) => x.messageId === (filed.body['record'] as { id: string } | undefined)?.id)
  })

  it('addresses the new agent by its registry id, not by its handle', async () => {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, JSON.stringify(filed.body).slice(0, 300)).toBe(409)
    // THE CONTROL: the message is held because nothing is answering as that agent.
    expect(held?.nobodyIsAnsweringAsIt, 'the message was not held for a press, so the press would move nothing').not.toBeNull()

    const pressed = await post(`/api/agents/${id}/start-a-new-agent`, {})
    expect(pressed.status, JSON.stringify(pressed.body).slice(0, 300)).toBe(200)
    expect(pressed.body['handle']).toBe('branch-from-me-2')
    const newId = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'branch-from-me-2'").get() as { id: string }).id
    expect(newId).not.toBe('branch-from-me-2')

    // EVERY MESSAGE THE PRESS MOVED, which includes the question above and may include what the
    // registration itself left waiting for the old agent.
    const moved = pressed.body['moved'] as string[]
    expect(moved.length, 'the press moved nothing').toBeGreaterThan(0)
    const bodies: unknown[] = []
    for (const messageId of moved) {
      const record = (await get(`/api/records/${messageId}`)) as { record?: { data: Record<string, unknown> } }
      expect(record.record?.data['to']).toEqual([{ kind: 'agent', id: newId }])
      bodies.push(record.record?.data['body'])
    }
    expect(bodies).toContain('Are you there?')
  })
})

describe('a run closed as superseded', () => {
  it('names who closed it by the handle on its row', async () => {
    const id = await register('closer-with-an-id')
    // THE RUN IS HANDED IN AS IT IS READ, with only the stored mark this case is about. The door that
    // writes the mark is covered by tests/a-run-superseded-by-a-later-run-on-the-same-branch.test.ts.
    const stands = inspection.whereARunStands({
      id: 'a-run-closed-as-superseded',
      data: {
        theCheck: { superseded: { by: 'a-later-run', at: '2026-09-25 03:00:00', byWhom: { kind: 'agent', id }, because: 'The later run did it.' } },
      },
    })
    expect(stands.standing).toBe('superseded')
    expect(stands.says).toContain('agent closer-with-an-id closed it as superseded')
    expect(stands.says).not.toContain(id)
  })
})

describe('the check on a run names the agents it stores by their handles', () => {
  let inspector = ''
  let supervisor = ''
  /** A refused run, and a released one that reported to a supervisor and was then confirmed. */
  let refusedRun: PanelRecord
  let releasedRun: PanelRecord
  let confirmedRun: PanelRecord

  beforeAll(async () => {
    inspector = await register('inspects-with-an-id')
    supervisor = await register('supervises-with-an-id')
    const refusal = {
      by: { kind: 'agent', id: inspector },
      at: '2026-09-25 03:00:00',
      missing: ['The report does not name what it read.'],
      chapter: 5,
      group: 'a-group-for-the-refusal',
      check: 'a-check-message',
    }
    const release = {
      by: { kind: 'agent', id: inspector },
      at: '2026-09-25 03:10:00',
      how: 'an inspector',
      reportedTo: { kind: 'agent', id: supervisor },
    }
    const aRun = (id: string, data: Record<string, unknown>): PanelRecord =>
      ({ id, kind: 'session', title: id, data: { state: 'finished', ...data } }) as unknown as PanelRecord
    refusedRun = aRun('a-refused-run', { refused: refusal })
    releasedRun = aRun('a-released-run', { refused: refusal, released: release })
    confirmedRun = aRun('a-confirmed-run', {
      released: release,
      confirmed: { by: { kind: 'agent', id: supervisor }, at: '2026-09-25 03:20:00', because: 'It is sound.' },
    })
  })

  it('in the sentences the office answers with', () => {
    const refused = inspection.whereARunStands(refusedRun)
    expect(refused.says).toContain('A check refused to release this run: agent inspects-with-an-id at')
    const released = inspection.whereARunStands(releasedRun)
    expect(released.says).toContain('Released by agent inspects-with-an-id at')
    expect(released.waitingFor).toBe('Waiting for agent supervises-with-an-id to confirm the report.')
    const confirmed = inspection.whereARunStands(confirmedRun)
    expect(confirmed.says).toContain('The agent supervises-with-an-id confirmed the report at')
    for (const said of [refused.says, released.says, released.waitingFor, confirmed.says]) {
      expect(said).not.toContain(inspector)
      expect(said).not.toContain(supervisor)
    }
  })

  it('on the run’s page, from the registries the page already read', async () => {
    const { TheCheckOnARun } = await import('../src/web/components/TheCheckOnARun.tsx')
    const participants = (await get('/api/participants')) as unknown as ParticipantsReply
    const drawn = renderToStaticMarkup(h(TheCheckOnARun, { record: releasedRun, participants }))
    expect(drawn).toContain('inspects-with-an-id refused to release this run')
    expect(drawn).toContain('inspects-with-an-id released this run')
    expect(drawn).toContain('It then reported to supervises-with-an-id.')
    expect(drawn).toContain('Waiting for agent supervises-with-an-id to confirm the report.')
    expect(drawn).toContain('This run is waiting for supervises-with-an-id to confirm the report.')
    expect(drawn).not.toContain(inspector)
    expect(drawn).not.toContain(supervisor)
  })

  it('shows the stored id as it is where the page was given no registries', async () => {
    const { TheCheckOnARun } = await import('../src/web/components/TheCheckOnARun.tsx')
    const drawn = renderToStaticMarkup(h(TheCheckOnARun, { record: releasedRun }))
    expect(drawn).toContain(`${inspector} refused to release this run`)
  })
})

describe('the office’s reminders count a run for the agent it serves', () => {
  type RemindersLib = typeof import('../src/server/lib/reminders.ts')
  let reminders: RemindersLib

  beforeAll(async () => {
    reminders = await import('../src/server/lib/reminders.ts')
  })

  it('reads a run as its agent’s activity, so an agent whose only activity is a run is reminded when it goes quiet', async () => {
    const id = await register('idle-with-an-id')
    const startedAt = Date.now()
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'idle-with-an-id working',
      data: { state: 'idle', runtime: 'claude-code', servingAgent: 'idle-with-an-id', servingAgentId: id },
      actor: { type: 'human', id: THE_PERSON },
    })
    // A DAY LATER, WITH THE WATCHER STARTED JUST BEFORE THE RUN: the run is the agent's newest activity,
    // it was seen, and it is long past the idle hour.
    const pass = reminders.sendTheRemindersThatAreDue(WORKSPACE, new Date(startedAt + 24 * 3_600_000), new Date(startedAt - 60_000))
    expect(pass.idleReminded).toContain('idle-with-an-id')
  })

  it('reminds the agent a run serves when the run passes its expected time', async () => {
    const id = await register('overdue-with-an-id')
    const startedAt = Date.now()
    const run = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'session',
      title: 'overdue-with-an-id working',
      data: {
        state: 'running',
        runtime: 'claude-code',
        servingAgent: 'overdue-with-an-id',
        servingAgentId: id,
        expectedMinutes: 10,
        startedAt: localStamp(new Date(startedAt)),
      },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    const pass = reminders.sendTheRemindersThatAreDue(WORKSPACE, new Date(startedAt + 15 * 60_000), new Date(startedAt - 60_000))
    expect(pass.expectedTimeReached).toContain(run)
  })
})
