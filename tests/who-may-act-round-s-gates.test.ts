// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SIX WHO-MAY-ACT GATES AT THIRTEEN DOORS OF THE SETTINGS. Wave 13r round S.
 *
 * Each of these doors lets only some callers through: the person, a secretary proved by its own key, or a secretary the
 * person's grant carries. Round S gives each rule a gate the person may switch off:
 *   1. the four writes of the Casting table, which share one check, so the add is asked here;
 *   2. the naming of the agent who watches the GPU;
 *   3. six of the owner's settings: what is kept, the goal spans, the price table, the entry and its half for the
 *      other runtimes, the models runs get and one agent's own model, and the plugin switches;
 *   4. whether agents may send a person an urgent message, which the office calls an inject;
 *   5. the list of quick inputs;
 *   6. the address browsers are sent to.
 *
 * AT OFF, AN AGENT PROVED BY ITS OWN KEY MAY ALSO ACT, and what it wrote names it, also at a door that wrote a change row
 * only under the grant before. The gate counts it as a request it would have stopped. A caller that no key proves to be
 * a registered agent is still refused, is not counted, and is refused in words of its own, because the words of the
 * block say only certain callers may, and at off that is not true. At the GPU watcher an agent the gate lets through
 * gives a reason, as a secretary does.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The person, and the secretary each door already let through,
 * go through and are not counted. An agent with its own key and no card for the door is refused, and the gate counts
 * the stop. Where the door asks the person's grant, a request the grant carries goes through under the grant and is not
 * counted, and a request it does not carry is refused by the grant's own check. The cases that ask only this run green
 * on the code before round S, and they are its control run. At most of these doors the words of the block are built
 * from what the request showed, so a caller with a key and one without are told apart there already; a case asks the
 * two for the same words only at a door that has one refusal.
 *
 * THE ENTRY MAY BE REFUSED AFTER THE CHECK. Putting the entry in place from a linked worktree is refused, for the person
 * too. Where that happens the case asks only that the caller was not refused by the check, and that it got what the
 * person's own press gets.
 *
 * TWO DOORS SHOW THE REFUSAL ON THEIR READ, the price table and the quick inputs. The read shows each caller the words
 * its press would get, and a read counts nothing. At block this is the control; at off a keyed caller's read shows no
 * refusal and a caller with no key reads the words of the off.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's case for that caller goes
 * red. Leave out the count at off, and each door's first case goes red. At a door that wrote only under the grant, keep
 * writing only under the grant at off, and that door's first case goes red. Count the read, and the read cases go red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, a worker, and an agent whose model is set are made-up agents, each holding the key the office answered.
 * The entry is written into a scratch home under the system's temporary folder. This machine's list of its own
 * addresses gets one more, made up, from the range kept for documentation. Every model, price, input and reason is
 * made up.
 */

import type { FastifyInstance } from 'fastify'
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { RUN_MODEL_PLACES } from '../src/shared/run-models.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { theRuntimesTheAdaptersGive } from './the-runtimes-the-adapters-give.ts'

const SECRETARY = 'round-s-secretary'
const RAISED = 'round-s-raised-secretary'
const WORKER = 'round-s-worker'
const MODELLED = 'round-s-modelled'
const BECAUSE = 'A made-up reason for this test.'
/** One more address of this machine, made up, from the range kept for documentation. */
const AN_ADDRESS_OF_THIS_MACHINE = '192.0.2.61'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let resources: typeof import('../src/server/lib/resources.ts')
let probeBefore: import('../src/server/lib/resources.ts').OsProbe | null = null
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const switched = new Set<string>()
const homeBefore = { HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME }
let scratchHome = ''
let modelledRecord = ''
let grantId = ''
let presses = 0

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
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

const marker = (table: 'changes' | 'presses_for_the_person' | 'casting_row_changes'): number =>
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

/** Every file and link in the scratch home, with what it holds, for a door that writes there. */
function whatTheHomeHolds(): string[] {
  return (readdirSync(scratchHome, { recursive: true }) as string[])
    .sort()
    .map((name) => {
      const path = join(scratchHome, name)
      const kind = lstatSync(path)
      if (kind.isSymbolicLink()) return `${name} -> ${readlinkSync(path)}`
      return kind.isFile() ? `${name}: ${readFileSync(path, 'utf8')}` : name
    })
}

/** The door's own reading as the person gets it, beside how many change rows one record has. */
const readingAnd = (url: string, record: string) => async (): Promise<string> => {
  const read = await call('GET', url, PERSON)
  expect(read.status, read.raw).toBe(200)
  return JSON.stringify([read.body, rowsOn(record)])
}

/** One press of a door, made fresh so that one case's press does not settle what the next case asks. */
interface APress {
  method: 'POST' | 'PUT' | 'PATCH'
  url: string
  body: Record<string, unknown>
}

interface ADoor {
  gate: string
  /** The door's operation, as this office's list of what the grant carries names it. */
  door: string
  /** Whether the door asks the person's grant, so the grant's cases are asked here. */
  asksTheGrant: boolean
  /** Whether a press the grant carries writes a change row naming the grant. One door writes no change row at all. */
  writesUnderTheGrant: boolean
  /** Whether the person may press it today. */
  thePerson: boolean
  /** Whether a secretary proved by its own key, with no grant, may press it today. */
  aSecretary: boolean
  /** Whether today an agent with its own key and one with none get the same refusal at block. */
  oneRefusalAtBlock: boolean
  /**
   * Whether the act may be refused after the check, for the person too. The entry is refused wherever the checkout is a
   * linked worktree, as the one these tests run in may be, and then a press the check lets through writes nothing.
   */
  mayBeRefusedAfterTheCheck: boolean
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

/**
 * Whether a press the check let through did what it asked. Where the door may refuse after the check, a press refused
 * there was let through when the person's own press of the door now is refused in the same words, and it wrote nothing.
 */
async function wentThrough(one: ADoor, reply: Awaited<ReturnType<typeof call>>): Promise<boolean> {
  if (!one.mayBeRefusedAfterTheCheck || reply.status < 300) {
    expect(reply.status, reply.raw).toBeLessThan(300)
    return true
  }
  expect(reply.status, `the check refused it: ${reply.raw}`).not.toBe(403)
  const theirs = await press(await one.make(), PERSON)
  expect([reply.status, reply.error], 'the press was refused where the person\'s own is not').toEqual([theirs.status, theirs.error])
  return false
}

async function press(one: APress, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Awaited<ReturnType<typeof call>>> {
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
      if (await wentThrough(one, done)) namesTheAgent(written(), WORKER)
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
      const asked = await one.make()
      const before = counted(one.gate)
      const state = await one.state()
      const refused = await press(asked, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(await one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
      // At off an agent with a key may, so the words that say only certain callers may are not true there.
      expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
    })

    // The control run: nothing in this case switches the gate, so it reads the door as it stands before round S.
    it('at block, the callers the door let through before still go through uncounted, and an agent with or without its own key is refused', async () => {
      for (const [who, headers, may] of [['the person', PERSON, one.thePerson], [SECRETARY, as(SECRETARY), one.aSecretary]] as const) {
        const asked = await one.make()
        const state = await one.state()
        const before = counted(one.gate)
        const reply = await press(asked, headers)
        if (may) {
          const through = reply.status < 300 || (one.mayBeRefusedAfterTheCheck && reply.status !== 403)
          expect(through, `${who}: ${reply.raw}`).toBe(true)
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
        const wrote = await wentThrough(one, done)
        expect(underTheGrantSince(changes, pressed), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
        if (wrote) namesTheAgent(written(), RAISED)
        expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
      })

      it('at block, a press the grant carries goes through under the grant as before, and the gate does not count it', async () => {
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const done = await press(asked, as(RAISED), FOR_THE_PERSON)
        const written = underTheGrantSince(changes, pressed)
        if (await wentThrough(one, done)) {
          expect(written.presses, 'the press the grant carried wrote no press row naming the grant').toContainEqual({ grant_id: grantId, operation: one.door })
          if (one.writesUnderTheGrant) expect(written.changes.length, 'the press the grant carried wrote no change row naming the grant').toBeGreaterThan(0)
          else expect(written.changes, 'a door that wrote no change row under the grant began to write one at block').toEqual([])
        }
        expect(counted(one.gate), 'a press the grant carried was counted').toEqual(before)
      })

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

/** The cases of a door whose read shows the caller the refusal its press would get. */
function theReadCases(gate: string, url: string, make: () => Promise<APress>): void {
  /** What the read shows each caller, beside what its press gets, and whether the gate counted any of it. */
  async function readAndPress(): Promise<{ keyed: unknown; keyless: unknown; keyedPress: string; keylessPress: string; counted: boolean }> {
    const before = counted(gate)
    const keyed = await call('GET', url, as(WORKER))
    const keyless = await call('GET', url, withNoKey(WORKER))
    expect([keyed.status, keyless.status], keyed.raw).toEqual([200, 200])
    const readsCounted = JSON.stringify(counted(gate)) !== JSON.stringify(before)
    const keylessPress = await press(await make(), withNoKey(WORKER))
    expect(keylessPress.status, keylessPress.raw).toBe(403)
    const keyedPress = await press(await make(), as(WORKER))
    return { keyed: keyed.body.refusal, keyless: keyless.body.refusal, keyedPress: keyedPress.error, keylessPress: keylessPress.error, counted: readsCounted }
  }

  // The control run: nothing in this case switches the gate.
  it(`${gate}: at block, the read at ${url} shows each caller the words its press gets, and counts nothing`, async () => {
    const seen = await readAndPress()
    expect(seen.counted, 'a read was counted').toBe(false)
    expect(seen.keyless, 'the read showed a caller with no key other words than its press got').toBe(seen.keylessPress)
    expect(seen.keyed, 'the read showed an agent with its own key other words than its press got').toBe(seen.keyedPress)
  })

  it(`${gate}: at off, the read at ${url} tells an agent with its own key that it may, shows a caller with no key the words of off, and counts nothing`, async () => {
    await setTheGate(gate, 'off')
    const seen = await readAndPress()
    expect(seen.counted, 'a read was counted').toBe(false)
    expect(seen.keyless, 'the read showed a caller with no key other words than its press got').toBe(seen.keylessPress)
    expect(seen.keyed, 'at off the read told an agent with its own key that it may not').toBeNull()
    expect(seen.keyedPress, 'at off the press of an agent with its own key was refused').toBe('')
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  scratchHome = mkdtempSync(join(tmpdir(), 'round-s-home-'))
  mkdirSync(join(scratchHome, '.codex'))
  process.env.HOME = scratchHome
  delete process.env.CODEX_HOME
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  resources = await import('../src/server/lib/resources.ts')
  probeBefore = resources.osProbe()
  const probe = Object.create(probeBefore) as typeof probeBefore
  const theRealOnes = probeBefore.ownAddresses?.() ?? []
  probe.ownAddresses = () => [...theRealOnes, AN_ADDRESS_OF_THIS_MACHINE]
  resources.useOsProbe(probe)
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [WORKER, 'worker'], [MODELLED, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role, ...(handle === MODELLED ? { runtime: theRuntimesTheAdaptersGive().aModelTo[0] } : {}) })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  // The record the office keeps the agent's model on, as the office finds it.
  modelledRecord = (await import('../src/server/lib/participants.ts')).theModelOnTheAgentRecord(ids.get(MODELLED) ?? '')?.record ?? ''
  expect(modelledRecord, 'the agent whose model is set has no record').not.toBe('')
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
}, 60_000)

afterEach(async () => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
})

afterAll(async () => {
  if (probeBefore !== null) resources.useOsProbe(probeBefore)
  await app?.close()
  t?.close()
  for (const [name, value] of Object.entries(homeBefore)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (scratchHome !== '') rmSync(scratchHome, { recursive: true, force: true })
})

theCases({
  gate: 'who-changes-the-casting-table',
  door: 'office.add-casting',
  asksTheGrant: false,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: true,
  // Today the refusal names the card of an agent its key proves, and says no key proved one for a caller with none.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => {
    const read = await call('GET', '/api/casting', PERSON)
    expect(read.status, read.raw).toBe(200)
    const role = String(read.body.roles?.[0]?.role ?? '')
    expect(role, 'the Casting table lists no role card').not.toBe('')
    return { method: 'POST', url: `/api/casting/${encodeURIComponent(role)}`, body: { why: { value: `${BECAUSE} ${String(++presses)}` } } }
  },
  state: async () => {
    const read = await call('GET', '/api/casting', PERSON)
    expect(read.status, read.raw).toBe(200)
    return JSON.stringify([read.body, marker('casting_row_changes')])
  },
  watch: () => {
    const from = marker('casting_row_changes')
    return () => (t.client.sqlite.prepare('SELECT by_id FROM casting_row_changes WHERE rowid > ?').all(from) as { by_id: string }[]).map((row) => row.by_id)
  },
})

theCases({
  gate: 'who-names-the-gpu-watcher',
  door: 'office.set-gpu-watcher',
  asksTheGrant: false,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: true,
  oneRefusalAtBlock: true,
  mayBeRefusedAfterTheCheck: false,
  make: async () => {
    const read = await call('GET', '/api/office/gpu-watcher', PERSON)
    expect(read.status, read.raw).toBe(200)
    // The secretary, or nobody where an agent is named already, so a press that goes through always changes it.
    return { method: 'POST', url: '/api/office/gpu-watcher', body: { agent: read.body.stored === null ? SECRETARY : null, because: `${BECAUSE} ${String(++presses)}` } }
  },
  state: async () => String(rowsOn('setting:gpu-watcher')),
  watch: changeRowsOn('setting:gpu-watcher'),
})

it('who-names-the-gpu-watcher: at off, an agent the gate lets through gives a reason, as a secretary does', async () => {
  await setTheGate('who-names-the-gpu-watcher', 'off')
  const rows = rowsOn('setting:gpu-watcher')
  const unreasoned = await call('POST', '/api/office/gpu-watcher', as(WORKER), { agent: null })
  expect(unreasoned.status, unreasoned.raw).toBe(400)
  expect(rowsOn('setting:gpu-watcher'), 'a press with no reason changed the watcher').toBe(rows)
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.set-what-is-kept',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => ({ method: 'POST', url: '/api/office/what-is-kept', body: { keepBackups: 10 + (++presses % 2) } }),
  state: readingAnd('/api/office/what-is-kept', 'setting:what-is-kept'),
  watch: changeRowsOn('setting:what-is-kept'),
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.set-goal-spans',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => ({ method: 'POST', url: '/api/office/goal-spans', body: { shortGoalDays: 20 + (++presses % 2) } }),
  state: readingAnd('/api/office/goal-spans', 'setting:goal-spans'),
  watch: changeRowsOn('setting:goal-spans'),
})

/** A made-up price table, a little different at each press. */
const aPriceTable = async (): Promise<APress> => ({
  method: 'POST',
  url: '/api/office/price-table',
  body: { table: { currency: 'GBP', prices: { 'a-made-up-model': { input: 3 + (++presses % 2), output: 15, cachedInput: 0.3 } } } },
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.set-price-table',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: aPriceTable,
  state: readingAnd('/api/office/price-table', 'setting:price-table'),
  watch: changeRowsOn('setting:price-table'),
})

theReadCases('who-changes-the-owners-settings', '/api/office/price-table', aPriceTable)

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.install-entry',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: true,
  make: async () => ({ method: 'POST', url: '/api/office/install-the-entry', body: {} }),
  state: async () => JSON.stringify([whatTheHomeHolds(), rowsOn('setting:the-entry')]),
  watch: changeRowsOn('setting:the-entry'),
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.install-entry.other-runtimes.write',
  asksTheGrant: true,
  // This door writes no change row, even under the grant; at off it writes one that names the agent.
  writesUnderTheGrant: false,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => ({ method: 'POST', url: '/api/office/install-the-entry/other-runtimes', body: { runtimes: ['codex'] } }),
  state: readingAnd('/api/office/install-the-entry/other-runtimes', 'setting:the-other-runtimes-entry'),
  watch: changeRowsOn('setting:the-other-runtimes-entry'),
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.set-run-models',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => ({
    method: 'POST',
    url: '/api/office/run-models',
    body: { places: { [RUN_MODEL_PLACES[0]]: { runtime: theRuntimesTheAdaptersGive().aModelTo[0], model: `a-made-up-model-${String(++presses % 2)}` } } },
  }),
  state: readingAnd('/api/office/run-models', 'setting:run-models'),
  watch: changeRowsOn('setting:run-models'),
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'office.set-agent-run-model',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => ({ method: 'POST', url: `/api/office/run-models/agent/${ids.get(MODELLED) ?? ''}`, body: { model: `a-made-up-model-${String(++presses % 2)}` } }),
  state: async () => readingAnd(`/api/office/run-models/agent/${ids.get(MODELLED) ?? ''}`, modelledRecord)(),
  watch: () => changeRowsOn(modelledRecord)(),
})

theCases({
  gate: 'who-changes-the-owners-settings',
  door: 'plugins.switch',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  mayBeRefusedAfterTheCheck: false,
  make: async () => {
    const read = await call('GET', '/api/plugins', PERSON)
    expect(read.status, read.raw).toBe(200)
    const plugin = read.body.plugins?.[0] as { id: string; nobodyChose: boolean } | undefined
    expect(plugin, 'this office lists no plugin to switch').toBeDefined()
    // Off, or nobody's choice again where off is chosen already: either may be pressed for any plugin, so a press that
    // goes through always changes what was chosen.
    return { method: 'POST', url: `/api/plugins/${encodeURIComponent(plugin!.id)}/switch`, body: { on: plugin!.nobodyChose ? false : null } }
  },
  state: readingAnd('/api/plugins', 'setting:plugin-switches'),
  watch: changeRowsOn('setting:plugin-switches'),
})

theCases({
  gate: 'who-switches-whether-agents-may-inject',
  door: 'office.set-agents-may-inject',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  mayBeRefusedAfterTheCheck: false,
  make: async () => {
    const read = await call('GET', '/api/office/agents-may-inject', PERSON)
    expect(read.status, read.raw).toBe(200)
    return { method: 'POST', url: '/api/office/agents-may-inject', body: { may: read.body.may !== true } }
  },
  state: readingAnd('/api/office/agents-may-inject', 'setting:agents-may-inject'),
  watch: changeRowsOn('setting:agents-may-inject'),
})

/** A made-up list of quick inputs, different at each press. */
const aQuickInputList = async (): Promise<APress> => ({ method: 'POST', url: '/api/office/quick-inputs', body: { inputs: [`/a-made-up-input-${String(++presses % 2)}`] } })

theCases({
  gate: 'who-changes-the-quick-input-list',
  door: 'office.set-quick-inputs',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: aQuickInputList,
  state: readingAnd('/api/office/quick-inputs', 'setting:quick-inputs'),
  watch: changeRowsOn('setting:quick-inputs'),
})

theReadCases('who-changes-the-quick-input-list', '/api/office/quick-inputs', aQuickInputList)

theCases({
  gate: 'who-chooses-the-address-for-browsers',
  door: 'office.set-address-for-browsers',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  thePerson: true,
  aSecretary: false,
  // Today the refusal says what the request showed, and a key is part of that.
  oneRefusalAtBlock: false,
  mayBeRefusedAfterTheCheck: false,
  make: async () => {
    const read = await call('GET', '/api/office/address-for-browsers', PERSON)
    expect(read.status, read.raw).toBe(200)
    return { method: 'POST', url: '/api/office/address-for-browsers', body: { address: read.body.chosen === null ? AN_ADDRESS_OF_THIS_MACHINE : null } }
  },
  state: readingAnd('/api/office/address-for-browsers', 'setting:address-for-browsers'),
  watch: changeRowsOn('setting:address-for-browsers'),
})
