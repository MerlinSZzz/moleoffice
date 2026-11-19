// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * THE MESSAGE CENTRE HANDLES A RETIRED ADDRESSEE'S DEAD LETTERS ITSELF, AND A SWEEP WRITES ONE LINE.
 *
 * Problem 0WUuvB0IhRfb. The sweep wrote one group line per addressee and every line woke every
 * secretary. The message centre should gather and handle these dead letters itself. The secretary's answers
 * I24sT059xQlk and UEmOvQ6-ptyJ settle the build, and this file holds it:
 *
 *   · the setting "The secretary who takes the dead letters": only the person may set it, an agent
 *     that is retired or does not hold the dead-letter act is refused, each change is kept, and the
 *     reader checks the agent again every time and never falls back to every secretary;
 *   · one sweep writes ONE line, delivered only to the named secretary, or to nobody, said so;
 *   · rule (a): an office notice to a retired addressee is archived and nobody is woken; an office
 *     notice to a grey addressee that is not retired is left alone;
 *   · rule (b): an agent's letter to a retired agent is routed to the first reachable starter, with
 *     `data.routed` stored; where the walk ends at the person it is routed to the named secretary. The
 *     receiver gets one message per sweep that lists its letters, and no delivery row on each letter
 *     (problem wN3CEhHxRKO3; tests/a-sweep-tells-each-receiver-once.test.ts holds that at 500 letters);
 *   · rule (c): a letter from the person reaches the named secretary; with nobody named it waits,
 *     and the line and the Settings door both say so;
 *   · the archived mark cannot be set through the mark door.
 *
 * A REACHABLE STARTER IS A RUNNING SESSION RECORD SERVING IT PLUS A LIVE CHILD PROCESS REGISTERED AS
 * ITS RESOURCE, as in tests/a-message-nobody-can-take-goes-up-the-chain-of-starters.test.ts. The
 * children are killed by their process group in afterAll.
 *
 * The three-run proof of each case, and the mutation that turns it red, is in the commit that made
 * the change this file holds.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []

// ============================================================ fixtures

/** Register an agent and give back its registry id, which is minted and is not the handle. */
function anAgent(handle: string, role: string | null = null): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  if (role !== null) t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(role, idOf(handle))
  return idOf(handle)
}

/** The registry id of the one agent bearing this handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

const agentRef = (handle: string): { kind: 'agent'; id: string } => ({ kind: 'agent', id: idOf(handle) })

function setStartedBy(handle: string, by: { kind: string; id: string }): void {
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(by.kind, by.id, idOf(handle))
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, by.kind === 'agent' ? by.id : null, idOf(handle), 'id')
  }
}

function retire(handle: string): void {
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the piece of work is done' WHERE id = ?").run(idOf(handle))
}

/** A running session record serving the agent, and a live process of this test's own registered against it. */
async function makeReachable(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `a run of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', servingAgent: idOf(handle) },
    actor: t.api.HUMAN,
  }).id
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: WORKSPACE, sessionRecordId: session, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

/** The `data` of one record, read straight off the row. */
function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** Delivery rows of one message, as the table holds them. */
function deliveriesOf(messageId: string): { recipientId: string; mark: string; because: string | null; inferredBy: string | null }[] {
  return t.client.sqlite
    .prepare(
      'SELECT recipient_id AS recipientId, mark, because, inferred_by AS inferredBy FROM message_delivery ' +
        'WHERE message_id = ? ORDER BY recipient_id',
    )
    .all(messageId) as { recipientId: string; mark: string; because: string | null; inferredBy: string | null }[]
}

function markOf(messageId: string, handle: string): string | undefined {
  return deliveriesOf(messageId).find((one) => one.recipientId === idOf(handle))?.mark
}

async function send(headers: Record<string, string>, to: string, body: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as { record?: { id: string } }
  expect(said.record?.id, `the letter was not stored: ${reply.body.slice(0, 400)}`).toBeTruthy()
  return said.record!.id
}

/** An office notice to one agent, written the way the office writes one. */
function anOfficeNotice(handle: string, line: string): string {
  return groups.writeASystemLineToOne(agentRef(handle), WORKSPACE, { line, said: null, notice: 'aCounterFired' }, { type: 'agent', id: 'mole-office/worker' }).id
}

interface Swept {
  groupId: string | null
  lineId: string | null
  addressees: string[]
  deliveredTo: { kind: string; id: string } | null
  archived: number
  routed: number
  givenToTheSecretary: number
  waiting: { fromThePerson: number; fromAgents: number }
  because: string
}

async function sweep(): Promise<Swept> {
  const reply = await app.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Swept
}

interface Reading {
  named: { id: string; handle: string } | null
  nobodyBecause: string | null
  stored: string | null
  mayBeNamed: { id: string; handle: string }[]
  lettersFromThePersonWaiting: number
  says: string
}

async function theSetting(): Promise<Reading> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/dead-letter-secretary', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Reading
}

async function nameTheSecretary(agent: string | null, headers: Record<string, string> = AS_THE_PERSON): Promise<{ code: number; body: string }> {
  const reply = await app.inject({ method: 'POST', url: '/api/office/dead-letter-secretary', headers, payload: { agent } })
  return { code: reply.statusCode, body: reply.body }
}

/**
 * Every sweep notice, oldest first. Receiver summaries carry `summary` rather than the sweep's `said` facts.
 */
function theSweepLines(): { id: string; data: Record<string, unknown> }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep.said') IS NOT NULL " +
          'ORDER BY created_at, rowid',
      )
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
}

/** The routed entries this letter carries for one addressee. */
function routedFor(messageId: string, handle: string): { to: { kind: string; id: string } | null; said?: Record<string, unknown>; line: string; inSummary?: string }[] {
  const routed = (dataOf(messageId)['routed'] ?? []) as { for: { id: string }; to: { kind: string; id: string } | null; said?: Record<string, unknown>; line: string; inSummary?: string }[]
  return routed.filter((one) => one.for.id === idOf(handle))
}

// ============================================================ the world

let officeToTheRetired = ''
let officeToTheGrey = ''
let agentToARetiredWithAStarter = ''
let agentToARetiredStartedByThePerson = ''
let thePersonToARetired = ''

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()

  anAgent('sec-a', 'secretary')
  anAgent('sec-b', 'secretary')
  anAgent('sec-old', 'secretary')
  retire('sec-old')
  anAgent('x-sender', 'worker')
  anAgent('w-grey', 'worker')
  anAgent('w-old', 'worker')
  anAgent('w-starter', 'worker')
  anAgent('w-one', 'worker')
  anAgent('w-two', 'worker')
  anAgent('w-three', 'worker')
  setStartedBy('w-one', agentRef('w-starter'))
  setStartedBy('w-two', { kind: 'person', id: THE_PERSON })
  setStartedBy('w-three', { kind: 'person', id: THE_PERSON })

  // AN AGENT'S LETTERS ARE SENT WHILE THEIR ADDRESSEES ARE REACHABLE, so the send door routes nothing and the sweep
  // is the first to look. Then the addressees are retired.
  await makeReachable('w-one')
  await makeReachable('w-two')
  agentToARetiredWithAStarter = await send(asAgent('x-sender'), idOf('w-one'), 'A letter for w-one')
  agentToARetiredStartedByThePerson = await send(asAgent('x-sender'), idOf('w-two'), 'A letter for w-two')
  expect(dataOf(agentToARetiredWithAStarter)['routed']).toBeUndefined()
  expect(dataOf(agentToARetiredStartedByThePerson)['routed']).toBeUndefined()
  // THE PERSON'S LETTER is sent before its addressee is retired; its chain ends at the person, who is the sender,
  // so the send door made no copy.
  thePersonToARetired = await send(AS_THE_PERSON, idOf('w-three'), 'A letter from the person for w-three')
  retire('w-one')
  retire('w-two')
  retire('w-three')
  retire('w-old')
  await makeReachable('w-starter')
  officeToTheRetired = anOfficeNotice('w-old', 'Your session finished.')
  officeToTheGrey = anOfficeNotice('w-grey', 'Your check came back.')
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app.close()
  t.close()
})

// ============================================================ the setting

describe('the secretary who takes the dead letters is the person\'s setting', () => {
  it('names nobody until the person names one, and offers only the secretaries who qualify', async () => {
    const reading = await theSetting()
    expect(reading.named).toBeNull()
    expect(reading.nobodyBecause).toBe('nobody chose')
    expect(reading.says).toBe('No secretary named.')
    expect(reading.mayBeNamed.map((one) => one.handle).sort()).toEqual(['sec-a', 'sec-b'])
  })

  it('refuses an agent that asks to set it, and changes nothing', async () => {
    const asked = await nameTheSecretary('sec-a', asAgent('sec-a'))
    expect(asked.code, asked.body).toBe(403)
    expect(asked.body).toContain("Who takes the dead letters is the owner's own setting")
    expect((JSON.parse(asked.body) as { code?: string }).code).toBe('deadLetterSecretaryOwnerNotProved')
    expect((await theSetting()).stored).toBeNull()
  })

  it('refuses a retired secretary and an agent whose card does not hold the act', async () => {
    // A RETIRED AGENT IS NAMED BY ITS ID: the one resolver follows a handle to a retired agent only on a read.
    const retired = await nameTheSecretary(idOf('sec-old'))
    expect(retired.code, retired.body).toBe(400)
    expect(retired.body).toContain('is retired, so it cannot take the dead letters')
    expect((JSON.parse(retired.body) as { code?: string }).code).toBe('deadLetterSecretaryRetired')
    const worker = await nameTheSecretary('x-sender')
    expect(worker.code, worker.body).toBe(400)
    expect(worker.body).toContain('does not hold the act')
    expect((JSON.parse(worker.body) as { code?: string }).code).toBe('deadLetterSecretaryNoAct')
    const nobody = await nameTheSecretary('nobody-bears-this-name')
    expect(nobody.code, nobody.body).toBe(400)
    expect((JSON.parse(nobody.body) as { code?: string }).code).toBe('deadLetterSecretaryNoSuchAgent')
    expect((await theSetting()).stored).toBeNull()
  })
})

// ============================================================ nobody named

describe('with nobody named, a sweep handles what it can and says what waits', () => {
  let swept: Swept

  it('rule (a): archives an office notice to a retired agent, and wakes nobody', async () => {
    const rowsBefore = deliveriesOf(officeToTheRetired).length
    swept = await sweep()
    expect(markOf(officeToTheRetired, 'w-old')).toBe('archived')
    expect(deliveriesOf(officeToTheRetired).find((one) => one.recipientId === idOf('w-old'))?.because).toContain('w-old is retired')
    // NOBODY WOKEN: archiving wrote no new delivery row.
    expect(deliveriesOf(officeToTheRetired)).toHaveLength(rowsBefore)
    expect(swept.archived).toBe(1)
  })

  it('rule (a) leaves an office notice to a grey agent that is not retired alone', () => {
    expect(markOf(officeToTheGrey, 'w-grey')).toBe('queued')
  })

  it('rule (b): an agent\'s letter is routed to the first starter who can be reached, with the routing stored, and the starter is told in one message', () => {
    const entries = routedFor(agentToARetiredWithAStarter, 'w-one')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.to).toEqual(agentRef('w-starter'))
    expect(typeof entries[0]!.said?.['sweptAt']).toBe('string')
    expect(entries[0]!.line).toContain('could not be reached when Mole Office looked again at')
    // NO DELIVERY ROW FOR THE STARTER ON THE LETTER: the one message of this sweep tells it (problem wN3CEhHxRKO3).
    expect(deliveriesOf(agentToARetiredWithAStarter).map((one) => one.recipientId)).toEqual([idOf('w-one')])
    expect(entries[0]!.inSummary).toBeDefined()
    expect(deliveriesOf(entries[0]!.inSummary!).map((one) => one.recipientId)).toEqual([idOf('w-starter')])
    // THE ADDRESSEE KEEPS ITS OWN ROW.
    expect(markOf(agentToARetiredWithAStarter, 'w-one')).toBe('queued')
  })

  it('rule (b) and (c) leave a letter waiting where it would go to the person and nobody is named', () => {
    expect(routedFor(agentToARetiredStartedByThePerson, 'w-two').filter((one) => one.to !== null)).toEqual([])
    expect(deliveriesOf(agentToARetiredStartedByThePerson).map((one) => one.recipientId)).toEqual([idOf('w-two')])
    expect(routedFor(thePersonToARetired, 'w-three').filter((one) => one.to !== null)).toEqual([])
    expect(markOf(thePersonToARetired, 'w-three')).toBe('queued')
    expect(swept.waiting).toEqual({ fromThePerson: 1, fromAgents: 1 })
  })

  it('writes one line, delivered to nobody, that says nobody is named and that a letter from the person waits', () => {
    const lines = theSweepLines()
    expect(lines).toHaveLength(1)
    expect(swept.lineId).toBe(lines[0]!.id)
    expect(swept.deliveredTo).toBeNull()
    expect(lines[0]!.data['toGroup']).toBeUndefined()
    expect(lines[0]!.data['to']).toEqual([])
    // NEVER TO EVERY SECRETARY: no delivery row at all.
    expect(deliveriesOf(lines[0]!.id)).toEqual([])
    const said = String(lines[0]!.data['saidInFull'])
    expect(said).toContain('This line is delivered to no member. No secretary named.')
    expect(said).toContain('Archived 1 notice from Mole Office to retired agents')
    expect(String(lines[0]!.data['body'])).toBe('Dead letters')
  })

  it('the Settings door says a letter from the person waits', async () => {
    expect((await theSetting()).lettersFromThePersonWaiting).toBe(0)
  })

  it('a second sweep with nothing new writes no second line', async () => {
    const again = await sweep()
    expect(again.lineId).toBeNull()
    expect(theSweepLines()).toHaveLength(1)
  })

  it('also recognises waiting letters recorded by an older group sweep with no said facts or notice kind', async () => {
    const line = theSweepLines()[0]!
    const before = (t.client.sqlite.prepare('SELECT data FROM records WHERE id=?').get(line.id) as {data:string}).data
    const older = JSON.parse(before)
    older.toGroup = swept.groupId
    older.deliveredOnlyTo = []
    delete older.to
    delete older.notice
    delete older.deadLetterSweep.said
    t.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(older),line.id)
    try {
      expect((await sweep()).lineId).toBeNull()
      // The modern notice-kind collection excludes the retained legacy line.
      expect(theSweepLines()).toEqual([])
      expect(t.api.getRecord(line.id)?.data).toEqual(older)
    } finally {
      t.client.sqlite.prepare('UPDATE records SET data=? WHERE id=?').run(before,line.id)
    }
  })
})

// ============================================================ a secretary named

describe('once the person names a secretary', () => {
  let swept: Swept

  it('stores the choice and keeps the change', async () => {
    const named = await nameTheSecretary('sec-a')
    expect(named.code, named.body).toBe(200)
    expect((await theSetting()).named?.id).toBe(idOf('sec-a'))
    const changes = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_THE_PERSON })
    const last = (changes.json() as { settings: Record<string, { to: unknown } | null> }).settings['dead-letter-secretary']
    expect(last, changes.body).not.toBeNull()
    expect(String(last!.to)).toContain(idOf('sec-a'))
    expect((await theSetting()).lettersFromThePersonWaiting).toBe(0)
  })

  it('leaves a person’s letter at its ownerless addressee after a secretary is named', async () => {
    swept = await sweep()
    expect(routedFor(thePersonToARetired, 'w-three').filter((one) => one.to !== null)).toEqual([])
    expect(deliveriesOf(thePersonToARetired).map((one) => one.recipientId)).toEqual([idOf('w-three')])
    expect(swept.givenToTheSecretary).toBe(0)
  })

  it('leaves an agent’s letter at its ownerless addressee after a secretary is named', () => {
    expect(routedFor(agentToARetiredStartedByThePerson, 'w-two').filter((one) => one.to !== null)).toEqual([])
    expect(deliveriesOf(agentToARetiredStartedByThePerson).map((one) => one.recipientId)).toEqual([idOf('w-two')])
  })

  it('does not write another sweep notice just because a secretary was named', () => {
    expect(theSweepLines()).toHaveLength(1)
    expect(swept.lineId).toBeNull()
  })

  it('the threshold still names grey addressees for a claim, in the same one line to the one secretary', async () => {
    for (let n = 1; n <= 21; n++) await send(AS_THE_PERSON, idOf('w-grey'), `A letter for w-grey ${String(n)}`)
    const crossed = await sweep()
    expect(crossed.addressees).toContain(idOf('w-grey'))
    const lines = theSweepLines()
    expect(lines).toHaveLength(2)
    expect(lines[1]!.data['toGroup']).toBeUndefined()
    expect(lines[1]!.data['to']).toEqual([agentRef('sec-a')])
    expect(deliveriesOf(lines[1]!.id).map((one) => one.recipientId)).toEqual([idOf('sec-a')])
    expect(String(lines[1]!.data['saidInFull'])).toContain('w-grey')
    expect(deliveriesOf(thePersonToARetired).map((one) => one.recipientId)).toEqual([idOf('w-three')])
    expect(deliveriesOf(agentToARetiredStartedByThePerson).map((one) => one.recipientId)).toEqual([idOf('w-two')])
    expect(markOf(officeToTheGrey, 'w-grey')).toBe('queued')
  })

  it('delivers directly even when the named secretary is absent from the group', async () => {
    const secretariat = await import('../src/server/lib/secretariat.ts')
    const sync = secretariat.syncTheSecretariatGroup
    const absent = vi.spyOn(secretariat, 'syncTheSecretariatGroup').mockImplementationOnce(() => {
      const group = sync()
      t.client.sqlite.prepare('DELETE FROM group_members WHERE group_id = ?').run(group.id)
      return group
    })
    try {
      anOfficeNotice('w-old', 'Another made-up notice for the retired agent.')
      const direct = await sweep()
      expect((await theSetting()).named?.id).toBe(idOf('sec-a'))
      expect(direct.lineId).not.toBeNull()
      expect(direct.deliveredTo).toEqual(agentRef('sec-a'))
      expect(dataOf(direct.lineId!)['toGroup']).toBeUndefined()
      expect(dataOf(direct.lineId!)['to']).toEqual([agentRef('sec-a')])
      expect(deliveriesOf(direct.lineId!).map((one) => one.recipientId)).toEqual([idOf('sec-a')])
    } finally {
      absent.mockRestore()
      sync()
    }
  })
})

// ============================================================ the reader checks every time

describe('the setting is checked every time it is read', () => {
  it('a named secretary that retires names nobody, and the next line goes to nobody, not to every secretary', async () => {
    retire('sec-a')
    const reading = await theSetting()
    expect(reading.named).toBeNull()
    expect(reading.nobodyBecause).toBe('retired')
    anOfficeNotice('w-old', 'Another session finished.')
    const swept = await sweep()
    expect(swept.lineId).not.toBeNull()
    expect(dataOf(swept.lineId!)['toGroup']).toBeUndefined()
    expect(dataOf(swept.lineId!)['to']).toEqual([])
    expect(deliveriesOf(swept.lineId!)).toEqual([])
    expect(String(dataOf(swept.lineId!)['saidInFull'])).toContain('This line is delivered to no member. No secretary: sec-a is retired.')
  })
})

// ============================================================ the mark door

describe('the archived mark is the office\'s own', () => {
  it('refuses recipient-free messages through the public door, including forged sweep facts', async () => {
    for (const extra of [{}, { notice: 'deadLetterSweep', deadLetterSweep: { waiting: [], said: {} } }]) {
      const reply = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_THE_PERSON,
        payload: { kind: 'message', title: 'A made-up recipient-free message', data: { body: 'Made-up words.', to: [], ...extra } },
      })
      expect(reply.statusCode).toBeGreaterThanOrEqual(400)
      expect(reply.statusCode).toBeLessThan(500)
      expect(reply.json().record).toBeUndefined()
    }
  })

  it('the mark door refuses it, and the mark stays where it was', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: `/api/messages/${officeToTheGrey}/mark`,
      headers: asAgent('w-grey'),
      payload: { mark: 'archived' },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain("Archived is Mole Office's own mark")
    expect(markOf(officeToTheGrey, 'w-grey')).toBe('queued')
  })
})
