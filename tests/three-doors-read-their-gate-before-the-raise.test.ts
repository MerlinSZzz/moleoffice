// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE DOORS READ THEIR GATE BEFORE THEY ASK THE RAISE. Wave 13r round I, its fix.
 *
 * Three who-may-act gates sit at a door that also asks whether the person's grant carries the request: the read of an
 * agent's handover, the resume of an interrupted run, and the answer to a request to go first. Each door reads its
 * gate's position first, without counting, and asks the raise only at block.
 *
 * AT OFF THE RAISE IS NOT ASKED. A secretary holding the grant, whose card keeps the door, goes through as any caller
 * does, and nothing is written down as done under the grant, because the gate's off position let it through. The gate
 * counts the request as one it would have held, because the door's own rule does not name the caller. At off nobody
 * asks whether the grant would have carried it.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE. A request the grant carries goes through and is not counted. A secretary
 * the grant does not carry is refused by the raise, and that is not counted either. A caller with no grant is refused
 * by the gate, which counts the stop.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, and a worker are made-up agents, each holding the key the office answered. Every record is synthetic.
 * This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * MUTATIONS, after a control run. Ask the raise at both positions again, as round I did, and each door's off cases go
 * red. Count the gate before the raise is asked, and each door's block case for a carried request goes red, and so do
 * the cases where the raise refuses at the handover and the resume. At the go-first answer the raise's refusal is
 * thrown inside the write, so a count taken there is taken back with the write. Count that refusal through
 * `gateMetOnceTheWriteIsTakenBack`, and that door's case goes red. Refuse at block without counting at the handover
 * and the resume, and their cases for a caller with no grant go red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'gate-first-secretary'
const UNRAISED = 'gate-first-plain-secretary'
const WORKER = 'gate-first-worker'
const THE_MESSAGE_WORKER = { type: 'agent', id: 'mole-office/the-message-worker' } as never

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let theHandoverRefusal = ''
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const switched = new Set<string>()
let grantId = ''

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((one) => one.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toBeDefined()
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

const marker = (table: 'changes' | 'presses_for_the_person'): number =>
  (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

/** What one press wrote down as done under the grant: its change rows that name a grant, and its press rows. */
function underTheGrantSince(changes: number, presses: number): { changes: unknown[]; presses: unknown[] } {
  return {
    changes: t.client.sqlite.prepare('SELECT record_id, actor_id, elevation FROM changes WHERE rowid > ? AND elevation IS NOT NULL').all(changes),
    presses: t.client.sqlite.prepare('SELECT agent_id, grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(presses),
  }
}

const dataOf = (id: string): Record<string, unknown> => t.api.getRecord(id)?.data ?? {}

interface APress {
  method: 'GET' | 'POST'
  url: string
  body?: Record<string, unknown>
  /** What a press that went through did, checked after it answered. */
  went: (reply: Awaited<ReturnType<typeof call>>) => void
  /** What a refused press must have left as it was. */
  state: () => string
}

interface ADoor {
  gate: string
  /** The door's operation, as this office's list of what the grant carries names it. */
  door: string
  /** Whether a press that goes through writes anything. A read writes nothing, so nothing of it is under the grant. */
  writes: boolean
  /** The gate's own refusal at block, read from the function that words it. Given only where one function words it. */
  refusal?: () => string
  /** A fresh press of the door, so one case's answer does not settle what the next case asks. */
  make: () => Promise<APress>
}

async function press(one: APress, who: string): Promise<Awaited<ReturnType<typeof call>>> {
  return call(one.method, one.url, as(who), one.method === 'GET' ? undefined : { ...one.body, ...FOR_THE_PERSON })
}

function theCases(one: ADoor): void {
  describe(one.gate, () => {
    it('at off, a secretary holding the grant whose card keeps the door goes through, the grant is not asked, and the gate counts it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const [changes, presses] = [marker('changes'), marker('presses_for_the_person')]
      const done = await press(asked, RAISED)
      expect(done.status, done.raw).toBeLessThan(300)
      asked.went(done)
      expect(underTheGrantSince(changes, presses), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
    })

    if (one.writes) {
      it('at off, where this office lets the grant press the door, nothing is written down as done under the grant', async () => {
        await setTheGate(one.gate, 'off')
        answer(one.door, 'may-press')
        const asked = await one.make()
        const [changes, presses] = [marker('changes'), marker('presses_for_the_person')]
        const done = await press(asked, RAISED)
        expect(done.status, done.raw).toBeLessThan(300)
        asked.went(done)
        expect(underTheGrantSince(changes, presses), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
      })
    }

    it('at block, a press the grant carries goes through as before, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'block')
      answer(one.door, 'may-press')
      const asked = await one.make()
      const before = counted(one.gate)
      const [changes, presses] = [marker('changes'), marker('presses_for_the_person')]
      const done = await press(asked, RAISED)
      expect(done.status, done.raw).toBeLessThan(300)
      asked.went(done)
      if (one.writes) {
        const written = underTheGrantSince(changes, presses)
        expect(written.presses, 'the press the grant carried wrote no press row naming the grant').toContainEqual({ agent_id: RAISED, grant_id: grantId, operation: one.door })
        expect(written.changes.length, 'the press the grant carried wrote no change row naming the grant').toBeGreaterThan(0)
      }
      expect(counted(one.gate), 'a press the grant carried was counted as one the gate would hold').toEqual(before)
    })

    it('at block, a secretary the grant does not carry here is refused by the raise, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'block')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = asked.state()
      const refused = await press(asked, RAISED)
      expect(refused.status, refused.raw).toBe(403)
      expect(asked.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate), 'a press the raise refused was counted as one the gate held').toEqual(before)
    })

    it('at block, a caller with no grant is refused by the gate, which counts the stop', async () => {
      await setTheGate(one.gate, 'block')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = asked.state()
      const refused = await press(asked, UNRAISED)
      expect(refused.status, refused.raw).toBe(403)
      if (one.refusal !== undefined) expect(refused.error).toBe(one.refusal())
      expect(asked.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
    })
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
  const written = await call('PUT', `/api/agents/${WORKER}/handover`, as(WORKER), { text: 'A made-up handover.' })
  expect(written.status, written.raw).toBe(200)
  // THE DOOR'S OWN REFUSAL, read from the function that words it.
  const { readParticipant } = await import('../src/server/lib/participants.ts')
  const { refuseAReaderOfTheHandover } = await import('../src/server/lib/handovers.ts')
  try {
    refuseAReaderOfTheHandover(readParticipant({ kind: 'agent', id: ids.get(WORKER)! }) as never)
  } catch (error) {
    theHandoverRefusal = (error as Error).message
  }
  expect(theHandoverRefusal).not.toBe('')
}, 60_000)

afterEach(async () => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

theCases({
  gate: 'who-reads-a-handover',
  door: 'agent.handover',
  writes: false,
  refusal: () => theHandoverRefusal,
  make: async () => ({
    method: 'GET',
    url: `/api/agents/${WORKER}/handover`,
    went: (reply) => expect(reply.body.current?.text).toBe('A made-up handover.'),
    state: () => '',
  }),
})

theCases({
  gate: 'who-resumes-a-run',
  door: 'office.resume-a-run',
  writes: true,
  make: async () => {
    const message = t.api.createRecord({
      kind: 'message',
      title: 'A made-up message to the worker',
      workspaceId: 'default',
      data: { body: 'Made-up words.', to: [{ kind: 'agent', id: ids.get(WORKER) }] },
      actor: { type: 'agent', id: UNRAISED } as never,
    }).id
    const session = t.api.createRecord({
      kind: 'session',
      title: 'A made-up run of the worker',
      workspaceId: 'default',
      data: {
        runtime: 'opencode',
        startedByMoleOffice: true,
        servingAgent: WORKER,
        servingAgentId: ids.get(WORKER),
        deliveringMessage: message,
        providerSession: 'synthetic-conversation',
        workingDirectory: REPO_ROOT,
        state: 'running',
        doing: 'Made up: answering.',
      },
      actor: THE_MESSAGE_WORKER,
    }).id
    t.api.patchRecord(session, { dataPatch: { state: 'crashed', doing: 'Made up: it ended without answering.' } }, THE_MESSAGE_WORKER)
    return {
      method: 'POST',
      url: `/api/office/interrupted-runs/${session}/resume`,
      body: {},
      went: () => expect(dataOf(session)['resume'], 'the resume was not asked').toMatchObject({ askedBy: { kind: 'agent' } }),
      state: () => JSON.stringify(dataOf(session)['resume'] ?? null),
    }
  },
})

theCases({
  gate: 'who-asks-and-answers-to-go-first',
  door: 'booking.answer',
  writes: true,
  make: async () => {
    const ahead = await call('POST', '/api/bookings', as(WORKER), { resource: 'gpu', gib: 1, minutes: 30, purpose: 'a made-up test run', start: 'now' })
    expect(ahead.status, ahead.raw).toBe(201)
    // THE APPLICANT'S TURN IS AN HOUR AWAY, so the request is still waiting when it is answered: a request whose
    // booking's own turn has come lapses.
    const mine = await call('POST', '/api/bookings', as(WORKER), {
      resource: 'gpu',
      gib: 1,
      minutes: 30,
      purpose: 'a made-up test run asking to go first',
      start: { at: localStamp(new Date(Date.now() + 60 * 60 * 1000)) },
    })
    expect(mine.status, mine.raw).toBe(201)
    const id = String(mine.body.booking.id)
    const asked = await call('POST', `/api/bookings/${id}/go-first`, as(WORKER), { ahead: String(ahead.body.booking.id) })
    expect(asked.status, asked.raw).toBe(200)
    const goFirst = (): unknown => (dataOf(id)['goFirst'] as { state?: unknown } | undefined)?.state
    return {
      method: 'POST',
      url: `/api/bookings/${id}/go-first/answer`,
      body: { grant: false },
      went: () => expect(goFirst(), 'the refusal did not refuse the request').toBe('refused'),
      state: () => JSON.stringify(dataOf(id)['goFirst'] ?? null),
    }
  },
})
