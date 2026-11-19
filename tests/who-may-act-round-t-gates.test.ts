// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR WHO-MAY-ACT GATES AT THE DOORS THAT ACT ON ANOTHER AGENT. Wave 13r round T.
 *
 * Each of these doors lets only some callers act on an agent other than themselves. Round T gives each rule a gate the
 * person may switch off:
 *   1. ending another agent's raise early, at the person's door and at the door a raised agent ends its own raise at;
 *   2. retiring an agent, at the retire door and where a write of the agent's record retires it;
 *   3. saying whether another agent reads a release from the check;
 *   4. setting how another agent is addressed.
 *
 * AT OFF, AN AGENT PROVED BY ITS OWN KEY MAY ALSO ACT, and what it wrote names it, also at the release door, which wrote
 * a change row only under the grant before. The gate counts it as a request it would have stopped. A caller that no key
 * proves to be a registered agent is still refused, is not counted, and is refused in words of its own, because the
 * words of the block say only certain callers may, and at off that is not true. An agent whose raise another agent ended
 * is told who ended it, at both doors.
 *
 * SOME THINGS STAY AS THEY ARE AT OFF. Mole Office's own row is not retired or addressed through the gate. A person's
 * address keeps its own rule. A retire the card rules already allow, such as a secretary's of a worker, or an agent's of
 * a worker it started, goes through as before and is not counted, because the gate would not have stopped it. Since
 * round X nobody retires Mole Office's own row at either position. A secretary with its own key is refused it in the
 * words a worker is refused, and the refusal is not counted.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The person, and the secretary each door already let through, go
 * through and are not counted. An agent with its own key and no card for the door is refused, and the gate counts the
 * stop. Where the door asks the person's grant, a request the grant carries goes through under the grant and is not
 * counted, and a request it does not carry is refused by the grant's own check. The raised agent still ends its own
 * raise, uncounted. The cases that ask only this run green on the code before round T, and they are its control run.
 * Where today's words of the block are the same for a caller with a key and one without, a case asks for that.
 *
 * A RETIRE ASKED BY A RECORD WRITE IS COUNTED ONCE. A PATCH asks it before its write begins. Putting back a revision
 * asks it inside its write, which the refusal takes back with the stop it counted, so the count is made again once the
 * write is taken back.
 *
 * THE PROFILE SAYS WHETHER THE READER MAY RETIRE THE AGENT. The read shows each caller what its press would get, and a
 * read counts nothing. At block this is the control; at off a keyed caller's read says it may, and a caller with no key
 * reads the words of off.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's case for that caller goes
 * red, but at the raise's own door, which refuses a caller no key proves before it asks whose raise it is. At that
 * door, give that caller at off the words it gets at block, and the case of the words there goes red. Leave out the
 * count at off, and each door's first case goes red. At the person's door for a raise, write the end only under the
 * grant at off, and the case of the line at that door goes red. At the release door, write the change row only under
 * the grant at off, and that door's two cases at off go red. Ask the grant at off too, and the case of the raised
 * secretary at off goes red at each door that asks the grant. Count the profile read, and the read cases go red. Count
 * a retire the card rules allow, and the case of the secretary retiring a worker goes red. Ask the gate for Mole
 * Office's own row and for a person's address, and the cases of those rows go red. Leave out the card rule that lets an
 * agent retire a worker it started, and the starter's cases go red. Let the card rules decide Mole Office's own row
 * again, and the cases of the secretary on that row go red. Leave out the line to the agent
 * whose raise was ended at the raise's own door, and the case of the line goes red. Leave out the count made again once
 * a write is taken back, and the case of the revision put back goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, a third secretary whose raise is given and ended again and again, two workers, a permanent resident and
 * every agent that is retired are made-up agents, each holding the key the office answered. A worker starts some of
 * them itself. The resident is made one by writing the moment it was confirmed straight into the scratch database,
 * because confirming one through its door is not what these cases ask. The last two cases ask to retire Mole Office's
 * own row in the scratch office. If the office lets one through, the case puts the row back the same way, straight into
 * the scratch database. Every name, address and reason is made up.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, FOR_THE_PERSON_IN_THE_QUERY, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const SECRETARY = 'round-t-secretary'
const RAISED = 'round-t-raised-secretary'
const TARGET = 'round-t-raised-target'
const WORKER = 'round-t-worker'
const OTHER = 'round-t-other-worker'
const RESIDENT = 'round-t-resident'
const BECAUSE = 'A made-up reason for this test.'

const ENDS = 'who-ends-another-agents-raise'
const RETIRES = 'who-retires-an-agent'
const RELEASES = 'who-says-whether-another-agent-reads-releases'
const ADDRESSES = 'who-sets-how-another-agent-is-addressed'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const records = new Map<string, string>()
const answered = new Set<string>()
const switched = new Set<string>()
let grantId = ''
let moleOffice = ''
let presses = 0
/** The agent the last retire press was made for. */
let retiring = { handle: '', id: '', record: '' }

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})
const withNoKey = (handle: string): Record<string, string> => {
  const { 'x-mole-office-key': _key, ...rest } = as(handle)
  return rest
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** The person starts an agent, and the office's answer is kept: its key, its registry id and its record. */
async function start(handle: string, role: 'secretary' | 'worker'): Promise<{ handle: string; id: string; record: string }> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
  records.set(handle, String(started.body.record ?? ''))
  return { handle, id: ids.get(handle) ?? '', record: records.get(handle) ?? '' }
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((one) => one.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

const marker = (table: 'changes' | 'presses_for_the_person' | 'records'): number =>
  (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

/** What one press wrote down as done under the grant: its change rows that name a grant, and its press rows. */
function underTheGrantSince(changes: number, pressed: number): { changes: unknown[]; presses: { grant_id: string; operation: string }[] } {
  return {
    changes: t.client.sqlite.prepare('SELECT record_id, actor_id, elevation FROM changes WHERE rowid > ? AND elevation IS NOT NULL').all(changes),
    presses: t.client.sqlite.prepare('SELECT grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(pressed) as { grant_id: string; operation: string }[],
  }
}

/** How many change rows one record has. */
const rowsOn = (record: string): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(record) as { n: number }).n

/** Start watching one record's change rows; the function it answers lists whom the rows written since name. */
const changeRowsOn = (record: string) => (): (() => string[]) => {
  const from = marker('changes')
  return () => (t.client.sqlite.prepare('SELECT actor_id FROM changes WHERE record_id = ? AND rowid > ?').all(record, from) as { actor_id: string }[]).map((row) => row.actor_id)
}

/** One press of a door, made fresh so that one case's press does not settle what the next case asks. */
interface APress {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body: Record<string, unknown>
}

interface ADoor {
  gate: string
  /** The door's operation, as this office's list of what the grant carries names it. */
  door: string
  /** Whether the door asks the person's grant, so the grant's cases are asked here. */
  asksTheGrant: boolean
  /** Whether a press the grant carries writes a change row naming the grant. */
  writesUnderTheGrant: boolean
  /** Whether the person may press it today. */
  thePerson: boolean
  /** Whether a secretary proved by its own key, with no grant, may press it today. */
  aSecretary: boolean
  /** Whether today an agent with its own key and one with none get the same refusal at block. */
  oneRefusalAtBlock: boolean
  make: () => Promise<APress>
  /** What a refused press must leave as it was. */
  state: () => Promise<string>
  /** Start watching what presses write; the function it answers lists whom the rows written since name. */
  watch: () => () => string[]
}

/** A row names an agent by the handle the request used or by the registry id the office gave it. */
function namesTheAgent(named: string[], handle: string): void {
  expect(named.length, `nothing the press wrote names ${handle}`).toBeGreaterThan(0)
  for (const one of named) expect([handle, ids.get(handle)], `a row names "${one}"`).toContain(one)
}

async function press(one: APress, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Awaited<ReturnType<typeof call>>> {
  // A request with no body gives its reason for the person in the query.
  if (one.method === 'DELETE') return call('DELETE', 'forThePerson' in extra ? `${one.url}?${FOR_THE_PERSON_IN_THE_QUERY}` : one.url, headers)
  return call(one.method, one.url, headers, { ...one.body, ...extra })
}

function theCases(one: ADoor): void {
  describe(`${one.gate} at ${one.door}`, () => {
    it('at off, an agent proved by its own key with no card for the door goes through, what it wrote names it, and the gate counts it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const written = one.watch()
      const done = await press(asked, as(WORKER))
      expect(done.status, done.raw).toBeLessThan(300)
      namesTheAgent(written(), WORKER)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
    })

    it('at off, the same agent with no key is refused, nothing changes, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = await one.state()
      const refused = await press(asked, withNoKey(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(await one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate), 'a caller with no key was counted').toEqual(before)
    })

    it('back at block, the agent with its own key is refused, nothing changes, the gate counts the stop, and the refusal at off was in words of its own', async () => {
      await setTheGate(one.gate, 'off')
      const atOff = await press(await one.make(), withNoKey(WORKER))
      expect(atOff.status, atOff.raw).toBe(403)
      await setTheGate(one.gate, 'block')
      const keylessAtBlock = await press(await one.make(), withNoKey(WORKER))
      expect(keylessAtBlock.status, keylessAtBlock.raw).toBe(403)
      const asked = await one.make()
      const before = counted(one.gate)
      const state = await one.state()
      const refused = await press(asked, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(await one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
      // At off an agent with a key may, so the words that say only certain callers may are not true there. A door
      // may refuse the two callers at block in two sentences, so neither is the words of off.
      expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
      expect(atOff.error, 'a caller with no key at off was refused in the words it gets at block').not.toBe(keylessAtBlock.error)
    })

    // The control run: nothing in this case switches the gate, so it reads the door as it stands before round T.
    it('at block, the callers the door let through before still go through uncounted, and an agent with or without its own key is refused', async () => {
      for (const [who, headers, may] of [['the person', PERSON, one.thePerson], [SECRETARY, as(SECRETARY), one.aSecretary]] as const) {
        const asked = await one.make()
        const state = await one.state()
        const before = counted(one.gate)
        const reply = await press(asked, headers)
        if (may) {
          expect(reply.status, `${who}: ${reply.raw}`).toBeLessThan(300)
          expect(counted(one.gate), `${who}: a caller the door lets through was counted`).toEqual(before)
        } else {
          expect(reply.status, `${who}: ${reply.raw}`).toBe(403)
          expect(await one.state(), `${who}: a refused press changed something`).toBe(state)
        }
      }
      const asked = await one.make()
      const state = await one.state()
      const keyed = await press(asked, as(WORKER))
      const keyless = await press(asked, withNoKey(WORKER))
      expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
      expect(await one.state(), 'a refused press changed something').toBe(state)
      if (one.oneRefusalAtBlock) expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
    })

    if (one.asksTheGrant) {
      it('at off, a raised secretary pressing for the person goes through as any keyed agent does, nothing is written under the grant, and the gate counts it', async () => {
        await setTheGate(one.gate, 'off')
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const written = one.watch()
        const done = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect(done.status, done.raw).toBeLessThan(300)
        expect(underTheGrantSince(changes, pressed), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
        namesTheAgent(written(), RAISED)
        expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
      })

      // A control case.
      it('at block, a press the grant carries goes through under the grant as before, and the gate does not count it', async () => {
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const done = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect(done.status, done.raw).toBeLessThan(300)
        const written = underTheGrantSince(changes, pressed)
        expect(written.presses, 'the press the grant carried wrote no press row naming the grant').toContainEqual({ grant_id: grantId, operation: one.door })
        if (one.writesUnderTheGrant) expect(written.changes.length, 'the press the grant carried wrote no change row naming the grant').toBeGreaterThan(0)
        else expect(written.changes, 'a door that wrote no change row under the grant began to write one at block').toEqual([])
        expect(counted(one.gate), 'a press the grant carried was counted').toEqual(before)
      })

      // A control case.
      it('at block, a secretary the grant does not carry here is refused by the grant\'s own check, and the gate does not count it', async () => {
        answer(one.door, 'kept')
        const asked = await one.make()
        const before = counted(one.gate)
        const state = await one.state()
        const theDoorsOwn = await press(asked, withNoKey(WORKER))
        const refused = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect([theDoorsOwn.status, refused.status], refused.raw).toEqual([403, 403])
        expect(refused.error, 'the door gave its own refusal, so the grant\'s check was not asked').not.toBe(theDoorsOwn.error)
        expect(await one.state(), 'a refused press changed something').toBe(state)
        expect(counted(one.gate), 'a press the grant refused was counted').toEqual(before)
      })
    }
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [TARGET, 'secretary'], [WORKER, 'worker'], [OTHER, 'worker'], [RESIDENT, 'worker']] as const) {
    await start(handle, role)
  }
  // The moment of the person's confirmation, written straight into the scratch database.
  t.client.sqlite.prepare('UPDATE agents SET resident_since = ? WHERE id = ?').run('2026-10-25 04:00:00', ids.get(RESIDENT))
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
  moleOffice = (await import('../src/shared/participants.ts')).moleOfficeId()
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

// ------------------------------------------------------------------ 1. ending another agent's raise

/** The person raises the target again, and the office's id for the raise is answered. */
async function raiseTheTarget(): Promise<string> {
  const raised = await call('POST', `/api/roles/elevation/${TARGET}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  const id = String(raised.body.elevation?.id ?? '')
  expect(id).not.toBe('')
  return id
}

/** Every raise ever given to the target, as its record keeps them, beside how many change rows the record has. */
async function theTargetsRaises(): Promise<string> {
  const read = await call('GET', `/api/records/${records.get(TARGET) ?? ''}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return JSON.stringify([read.body.record?.data?.elevation ?? null, rowsOn(records.get(TARGET) ?? '')])
}

const anEndAtThePersonsDoor = async (): Promise<APress> => {
  await raiseTheTarget()
  return { method: 'DELETE', url: `/api/roles/elevation/${TARGET}`, body: {} }
}
const anEndAtTheRaisesOwnDoor = async (): Promise<APress> => ({ method: 'POST', url: `/api/roles/raises/${await raiseTheTarget()}/end`, body: {} })

theCases({
  gate: ENDS,
  door: 'role.end-a-grant-early',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  make: anEndAtThePersonsDoor,
  state: theTargetsRaises,
  watch: () => changeRowsOn(records.get(TARGET) ?? '')(),
})

theCases({
  gate: ENDS,
  door: 'role.elevate',
  // This door never asked the grant: only the agent the raise was given to ends it here.
  asksTheGrant: false,
  writesUnderTheGrant: false,
  thePerson: false,
  aSecretary: false,
  // Today a caller no key proves is sent to the person's door, and an agent with a key is told the raise is not its own.
  oneRefusalAtBlock: false,
  make: anEndAtTheRaisesOwnDoor,
  state: theTargetsRaises,
  watch: () => changeRowsOn(records.get(TARGET) ?? '')(),
})

describe(`${ENDS}: the agent whose raise ends`, () => {
  // A control case.
  it('at block, the raised agent ends its own raise at its own door, and the gate does not count it', async () => {
    const asked = await anEndAtTheRaisesOwnDoor()
    const before = counted(ENDS)
    const done = await press(asked, as(TARGET))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(counted(ENDS), 'an agent ending its own raise was counted').toEqual(before)
  })

  it('at off, the raised agent ends its own raise as before, and the gate does not count it', async () => {
    await setTheGate(ENDS, 'off')
    const asked = await anEndAtTheRaisesOwnDoor()
    const before = counted(ENDS)
    const done = await press(asked, as(TARGET))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(counted(ENDS), 'an agent ending its own raise was counted').toEqual(before)
  })

  for (const [door, make] of [['the person\'s door', anEndAtThePersonsDoor], ['its own door', anEndAtTheRaisesOwnDoor]] as const) {
    it(`at off, an agent that ends another agent's raise at ${door} is named in the raise's end and in the line the office writes to the raised agent`, async () => {
      await setTheGate(ENDS, 'off')
      const asked = await make()
      const from = marker('records')
      const done = await press(asked, as(WORKER))
      expect(done.status, done.raw).toBeLessThan(300)
      const named = (said: string): boolean => [WORKER, ids.get(WORKER) ?? WORKER].some((one) => said.includes(one))
      const raises = JSON.parse(await theTargetsRaises())[0] as { endedBecause: string | null }[]
      expect(named(String(raises[raises.length - 1]?.endedBecause ?? '')), 'the end of the raise does not name the agent that ended it').toBe(true)
      const lines = (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND rowid > ?").all(from) as { data: string }[])
        .map((row) => JSON.parse(row.data) as { to?: { kind: string; id: string }[]; saidInFull?: string })
        .filter((data) => (data.to ?? []).some((to) => to.kind === 'agent' && to.id === ids.get(TARGET)))
      expect(lines.length, 'the raised agent was not told its raise ended').toBe(1)
      expect(named(String(lines[0]?.saidInFull ?? '')), 'the line to the raised agent does not name the agent that ended it').toBe(true)
    })
  }
})

// ------------------------------------------------------------------ 2. retiring an agent

/** The person starts a fresh agent for one retire press, and the press is answered. */
const aRetire = (role: 'secretary' | 'worker') => async (): Promise<APress> => {
  retiring = await start(`round-t-retired-${String(++presses)}`, role)
  return { method: 'POST', url: `/api/participants/agent/${retiring.id}/retire`, body: { because: `${BECAUSE} ${String(presses)}` } }
}

/** A worker starts a worker of its own for one retire press, and the press is answered. */
async function aRetireOfAWorkerItStarted(): Promise<APress> {
  const handle = `round-t-started-by-a-worker-${String(++presses)}`
  const started = await call('POST', '/api/agents/started', as(WORKER), { handle, name: handle, role: 'worker' })
  expect(started.status, started.raw).toBe(201)
  retiring = { handle, id: String(started.body.agent?.id ?? ''), record: String(started.body.record ?? '') }
  return { method: 'POST', url: `/api/participants/agent/${retiring.id}/retire`, body: { because: `${BECAUSE} ${String(presses)}` } }
}

/** The registry row of the agent the last retire press was made for. */
const theRetiredRow = (): { retired: number; retired_by_id: string | null } =>
  t.client.sqlite.prepare('SELECT retired, retired_by_id FROM agents WHERE id = ?').get(retiring.id) as { retired: number; retired_by_id: string | null }

theCases({
  gate: RETIRES,
  door: 'agent.retire',
  asksTheGrant: true,
  // The retire writes the agent's record as the office's own server, so no change row names the grant.
  writesUnderTheGrant: false,
  thePerson: true,
  // A secretary's card is the person's to retire, or a raised agent's.
  aSecretary: false,
  // Today an agent with a key is told why its card may not, and a caller no key proves is told no agent answers to it.
  oneRefusalAtBlock: false,
  make: aRetire('secretary'),
  state: async () => JSON.stringify(theRetiredRow()),
  watch: () => () => {
    const row = theRetiredRow()
    return row.retired === 1 && row.retired_by_id !== null ? [row.retired_by_id] : []
  },
})

describe(`${RETIRES}: what stays as it was`, () => {
  it('at off, a secretary retires a worker by its card as before, and the gate does not count it', async () => {
    await setTheGate(RETIRES, 'off')
    const asked = await aRetire('worker')()
    const before = counted(RETIRES)
    const done = await press(asked, as(SECRETARY))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(theRetiredRow().retired, 'the worker was not retired').toBe(1)
    expect(counted(RETIRES), 'a retire the cards allow was counted').toEqual(before)
  })

  // A control case: nothing in it switches the gate.
  it('at block, an agent retires a worker it started, by the card rules, where another worker is refused, and the gate does not count the retire', async () => {
    const asked = await aRetireOfAWorkerItStarted()
    const refused = await press(asked, as(OTHER))
    expect(refused.status, refused.raw).toBe(403)
    const before = counted(RETIRES)
    const done = await press(asked, as(WORKER))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(theRetiredRow().retired, 'the worker was not retired').toBe(1)
    namesTheAgent([theRetiredRow().retired_by_id ?? ''], WORKER)
    expect(counted(RETIRES), 'a retire the cards allow was counted').toEqual(before)
  })

  it('at off, an agent retires a worker it started, by the card rules as before, and the gate does not count it', async () => {
    await setTheGate(RETIRES, 'off')
    const asked = await aRetireOfAWorkerItStarted()
    const before = counted(RETIRES)
    const done = await press(asked, as(WORKER))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(theRetiredRow().retired, 'the worker was not retired').toBe(1)
    namesTheAgent([theRetiredRow().retired_by_id ?? ''], WORKER)
    expect(counted(RETIRES), 'a retire the cards allow was counted').toEqual(before)
  })

  it('at off, Mole Office\'s own row is not retired through the gate, and the gate does not count the press', async () => {
    const atBlock = await call('POST', `/api/participants/agent/${moleOffice}/retire`, as(WORKER), { because: BECAUSE })
    await setTheGate(RETIRES, 'off')
    const before = counted(RETIRES)
    const refused = await call('POST', `/api/participants/agent/${moleOffice}/retire`, as(WORKER), { because: BECAUSE })
    expect([atBlock.status, refused.status], refused.raw).toEqual([403, 403])
    expect(refused.error, 'Mole Office\'s own row was refused in other words at off').toBe(atBlock.error)
    expect((t.client.sqlite.prepare('SELECT retired FROM agents WHERE id = ?').get(moleOffice) as { retired: number }).retired).toBe(0)
    expect(counted(RETIRES), 'a press on Mole Office\'s own row was counted').toEqual(before)
  })
})

describe(`${RETIRES} where a write of the agent's record retires it`, () => {
  const retireTheRecord = (headers: Record<string, string>) =>
    call('PATCH', `/api/records/${retiring.record}`, headers, { dataPatch: { state: 'retired', retiredBecause: BECAUSE } })

  // A control case: the refusal itself is as before.
  it('at block, an agent with its own key is refused and nothing changes', async () => {
    await aRetire('secretary')()
    const state = JSON.stringify([theRetiredRow(), rowsOn(retiring.record)])
    const refused = await retireTheRecord(as(WORKER))
    expect(refused.status, refused.raw).toBe(403)
    expect(JSON.stringify([theRetiredRow(), rowsOn(retiring.record)]), 'a refused write changed something').toBe(state)
  })

  it('at block, the stop is counted once', async () => {
    await setTheGate(RETIRES, 'block')
    await aRetire('secretary')()
    const before = counted(RETIRES)
    const refused = await retireTheRecord(as(WORKER))
    expect(refused.status, refused.raw).toBe(403)
    expect(counted(RETIRES)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  })

  it('at block, a revision put back that would retire it is refused, and the stop is counted once, though that write is taken back', async () => {
    await setTheGate(RETIRES, 'block')
    await aRetire('secretary')()
    // The person retires the agent and brings it back, so the record holds a revision at which it was retired.
    const retired = await retireTheRecord(PERSON)
    const back = await call('PATCH', `/api/records/${retiring.record}`, PERSON, { dataPatch: { state: 'active' } })
    expect([retired.status, back.status, theRetiredRow().retired], back.raw).toEqual([200, 200, 0])
    const state = JSON.stringify([theRetiredRow(), rowsOn(retiring.record)])
    const before = counted(RETIRES)
    const refused = await call('POST', `/api/records/${retiring.record}/revisions/${String(retired.body.newSeq)}/restore`, as(WORKER), {})
    expect(refused.status, refused.raw).toBe(403)
    expect(JSON.stringify([theRetiredRow(), rowsOn(retiring.record)]), 'a refused write changed something').toBe(state)
    expect(counted(RETIRES)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  })

  it('at off, an agent with its own key retires it, the change row names the agent, and the gate counts it', async () => {
    await setTheGate(RETIRES, 'off')
    await aRetire('secretary')()
    const before = counted(RETIRES)
    const written = changeRowsOn(retiring.record)()
    const done = await retireTheRecord(as(WORKER))
    expect(done.status, done.raw).toBe(200)
    expect(theRetiredRow().retired, 'the agent was not retired').toBe(1)
    namesTheAgent(written(), WORKER)
    expect(counted(RETIRES)).toEqual({ ...before, would_stop: before.would_stop + 1 })
  })

  it('at off, the same write with no key is refused, nothing changes, and the gate does not count it', async () => {
    await setTheGate(RETIRES, 'off')
    await aRetire('secretary')()
    const state = JSON.stringify([theRetiredRow(), rowsOn(retiring.record)])
    const before = counted(RETIRES)
    const refused = await retireTheRecord(withNoKey(WORKER))
    expect(refused.status, refused.raw).toBe(403)
    expect(JSON.stringify([theRetiredRow(), rowsOn(retiring.record)]), 'a refused write changed something').toBe(state)
    expect(counted(RETIRES), 'a caller with no key was counted').toEqual(before)
  })
})

describe(`${RETIRES}: the profile says whether the reader may retire the agent`, () => {
  /** What the profile tells each caller, beside what its press gets, and whether the gate counted any of the reads. */
  async function readAndPress(): Promise<{ keyed: { may: boolean; whyNot: string | null }; keyless: { may: boolean; whyNot: string | null }; keyedPress: Awaited<ReturnType<typeof call>>; keylessPress: Awaited<ReturnType<typeof call>>; counted: boolean }> {
    const asked = await aRetire('secretary')()
    const before = counted(RETIRES)
    const url = `/api/participants/agent/${retiring.id}/profile`
    const keyed = await call('GET', url, as(WORKER))
    const keyless = await call('GET', url, withNoKey(WORKER))
    expect([keyed.status, keyless.status], keyed.raw).toEqual([200, 200])
    const readsCounted = JSON.stringify(counted(RETIRES)) !== JSON.stringify(before)
    const keylessPress = await press(asked, withNoKey(WORKER))
    expect(keylessPress.status, keylessPress.raw).toBe(403)
    const keyedPress = await press(asked, as(WORKER))
    return { keyed: keyed.body.mayRetire, keyless: keyless.body.mayRetire, keyedPress, keylessPress, counted: readsCounted }
  }

  // A control case.
  it('at block, the profile tells each caller it may not, in the words its press is refused in, and counts nothing', async () => {
    const seen = await readAndPress()
    expect(seen.counted, 'a read was counted').toBe(false)
    expect([seen.keyed.may, seen.keyless.may]).toEqual([false, false])
    expect(seen.keyedPress.status, seen.keyedPress.raw).toBe(403)
    expect(seen.keyedPress.error, 'the profile told an agent with its own key other words than its press got').toContain(String(seen.keyed.whyNot))
    expect(seen.keylessPress.error, 'the profile told a caller with no key other words than its press got').toContain(String(seen.keyless.whyNot))
  })

  it('at off, the profile tells an agent with its own key that it may, tells a caller with no key the words of off, and counts nothing', async () => {
    await setTheGate(RETIRES, 'off')
    const seen = await readAndPress()
    expect(seen.counted, 'a read was counted').toBe(false)
    expect(seen.keyed, 'at off the profile told an agent with its own key that it may not').toEqual({ may: true, whyNot: null })
    expect(seen.keyedPress.status, seen.keyedPress.raw).toBeLessThan(300)
    expect(seen.keyless.may).toBe(false)
    expect(seen.keylessPress.error, 'the profile told a caller with no key other words than its press got').toContain(String(seen.keyless.whyNot))
  })
})

// ------------------------------------------------------------------ 3. whether another agent reads releases

/** What the other worker has said about reading releases, as the registry row holds it. */
const theReleaseReading = (): string | null =>
  (t.client.sqlite.prepare('SELECT reads_releases_from_the_check AS said FROM agents WHERE id = ?').get(ids.get(OTHER)) as { said: string | null }).said

theCases({
  gate: RELEASES,
  door: 'participant.release-reading',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today a caller with a key and one with none, neither of them the agent, are refused in one sentence.
  oneRefusalAtBlock: true,
  // The opposite of what is said now, so a press that goes through always changes it.
  make: async () => ({
    method: 'POST',
    url: `/api/participants/agent/${ids.get(OTHER) ?? ''}/reads-releases-from-the-check`,
    body: { on: (JSON.parse(theReleaseReading() ?? '{"on":false}') as { on: boolean }).on !== true, because: `${BECAUSE} ${String(++presses)}` },
  }),
  state: async () => JSON.stringify([theReleaseReading(), rowsOn('setting:reads-releases-from-the-check')]),
  // What the reading itself says names whoever said it, but it is not the change row, so it is read only beside one.
  watch: () => {
    const rows = changeRowsOn('setting:reads-releases-from-the-check')()
    const before = theReleaseReading()
    return () => {
      const written = rows()
      const now = theReleaseReading()
      if (written.length === 0) return []
      return [...written, ...(now === null || now === before ? [] : [(JSON.parse(now) as { by: { id: string } }).by.id])]
    }
  },
})

it(`${RELEASES}: at off, an agent still says it for itself, and the gate does not count it`, async () => {
  await setTheGate(RELEASES, 'off')
  const before = counted(RELEASES)
  const said = await call('POST', `/api/participants/agent/${ids.get(OTHER) ?? ''}/reads-releases-from-the-check`, as(OTHER), { on: true, because: BECAUSE })
  expect(said.status, said.raw).toBe(200)
  expect(counted(RELEASES), 'an agent saying it for itself was counted').toEqual(before)
})

// ------------------------------------------------------------------ 4. how another agent is addressed

/** How one agent's registry row says it wishes to be addressed, and who set it. */
const theAddressOf = (id: string): string =>
  JSON.stringify(t.client.sqlite.prepare('SELECT address_name, address_second_person, address_third_person, address_title, address_set_by_kind, address_set_by_id FROM agents WHERE id = ?').get(id))
const theAddressSetter = (id: string): string | null =>
  (t.client.sqlite.prepare('SELECT address_set_by_id AS id FROM agents WHERE id = ?').get(id) as { id: string | null }).id
/** Start watching one agent's address; the function it answers names whoever set it since, if anybody did. */
const theAddressWatch = (handle: string) => (): (() => string[]) => {
  const before = theAddressOf(ids.get(handle) ?? '')
  return () => (theAddressOf(ids.get(handle) ?? '') === before ? [] : [theAddressSetter(ids.get(handle) ?? '') ?? ''])
}
const anAddressFor = (handle: string) => async (): Promise<APress> => ({
  method: 'PUT',
  url: `/api/participants/agent/${ids.get(handle) ?? ''}/address-as`,
  body: { name: `A made-up name ${String(++presses)}` },
})

theCases({
  gate: ADDRESSES,
  door: 'participant.address-as',
  // This door never asked the grant.
  asksTheGrant: false,
  writesUnderTheGrant: false,
  thePerson: true,
  aSecretary: true,
  // Today a caller with a key and one with none, neither of them the agent, are refused in one sentence.
  oneRefusalAtBlock: true,
  make: anAddressFor(OTHER),
  state: async () => theAddressOf(ids.get(OTHER) ?? ''),
  watch: theAddressWatch(OTHER),
})

describe(`${ADDRESSES}: a permanent resident is another agent too`, () => {
  // A control case.
  it('at block, a secretary and a worker with their own keys are refused on a resident\'s address, and nothing changes', async () => {
    const state = theAddressOf(ids.get(RESIDENT) ?? '')
    for (const who of [SECRETARY, WORKER]) {
      const refused = await press(await anAddressFor(RESIDENT)(), as(who))
      expect(refused.status, `${who}: ${refused.raw}`).toBe(403)
    }
    expect(theAddressOf(ids.get(RESIDENT) ?? ''), 'a refused press changed the resident\'s address').toBe(state)
  })

  it('at off, a secretary and a worker with their own keys each set a resident\'s address, the row names each, and the gate counts both', async () => {
    await setTheGate(ADDRESSES, 'off')
    const before = counted(ADDRESSES)
    for (const who of [SECRETARY, WORKER]) {
      const written = theAddressWatch(RESIDENT)()
      const done = await press(await anAddressFor(RESIDENT)(), as(who))
      expect(done.status, `${who}: ${done.raw}`).toBe(200)
      namesTheAgent(written(), who)
    }
    expect(counted(ADDRESSES)).toEqual({ ...before, would_stop: before.would_stop + 2 })
  })
})

describe(`${ADDRESSES}: what stays as it was`, () => {
  for (const [whose, url, read] of [
    ['Mole Office\'s own row', () => `/api/participants/agent/${moleOffice}/address-as`, () => theAddressOf(moleOffice)],
    ['a person\'s address', () => `/api/participants/person/${THE_PERSON}/address-as`, () => JSON.stringify(t.client.sqlite.prepare('SELECT address_name, address_set_by_id FROM people WHERE id = ?').get(THE_PERSON))],
  ] as const) {
    it(`at off, ${whose} is refused to an agent with its own key in the words of the block, nothing changes, and the gate does not count it`, async () => {
      const state = read()
      const atBlock = await call('PUT', url(), as(WORKER), { name: 'A made-up name' })
      await setTheGate(ADDRESSES, 'off')
      const before = counted(ADDRESSES)
      const refused = await call('PUT', url(), as(WORKER), { name: 'A made-up name' })
      expect([atBlock.status, refused.status], refused.raw).toEqual([403, 403])
      expect(refused.error, `${whose} was refused in other words at off`).toBe(atBlock.error)
      expect(read(), 'a refused press changed something').toBe(state)
      expect(counted(ADDRESSES), `a press on ${whose} was counted`).toEqual(before)
    })
  }
})

// ------------------------------------------------------------------ nobody retires Mole Office's own row

/** Mole Office's own row as the registry holds it: whether it is retired, and who retired it. */
const moleOfficesRow = (): { retired: number; retired_by_id: string | null } =>
  t.client.sqlite.prepare('SELECT retired, retired_by_id FROM agents WHERE id = ?').get(moleOffice) as { retired: number; retired_by_id: string | null }

// These two cases come last because a wrong answer retires Mole Office's own row in the scratch office. Each puts the
// row back straight into the scratch database, which does not give back the keys the retire ended.
describe(`${RETIRES}: nobody retires Mole Office's own row, a secretary its own key proves included`, () => {
  for (const position of ['block', 'off'] as const) {
    it(`at ${position}, a secretary with its own key is refused Mole Office's own row in the words a worker is refused, and the gate does not count it`, async () => {
      if (position === 'off') await setTheGate(RETIRES, 'off')
      expect(moleOfficesRow().retired, 'Mole Office\'s own row was retired before the press').toBe(0)
      const before = counted(RETIRES)
      try {
        const aWorkers = await call('POST', `/api/participants/agent/${moleOffice}/retire`, as(WORKER), { because: BECAUSE })
        const refused = await call('POST', `/api/participants/agent/${moleOffice}/retire`, as(SECRETARY), { because: BECAUSE })
        expect([aWorkers.status, refused.status], refused.raw).toEqual([403, 403])
        expect(refused.error, 'the secretary was refused Mole Office\'s own row in other words than a worker').toBe(aWorkers.error)
        expect(moleOfficesRow(), 'a refused press changed Mole Office\'s own row').toEqual({ retired: 0, retired_by_id: null })
        expect(counted(RETIRES), 'a press on Mole Office\'s own row was counted').toEqual(before)
      } finally {
        t.client.sqlite.prepare('UPDATE agents SET retired = 0, retired_because = NULL, retired_at = NULL, retired_by_kind = NULL, retired_by_id = NULL WHERE id = ?').run(moleOffice)
      }
    })
  }
})
