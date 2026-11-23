// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SEVEN WHO-MAY-ACT GATES AT DOORS ON RECORDS, DRAWINGS AND LISTS, AND A GATE ON THE HOLD FOR READINESS SIGNATURES.
 * Wave 13r round U.
 *
 * Each of these doors lets only some callers act. Round U gives each rule a gate the person may switch off:
 *   1. naming a module's planner;
 *   2. closing a record that asks the person something, or taking the question off it;
 *   3. deleting a row of the implementation map that a person stated;
 *   4. pointing a repository that has been scanned at another folder;
 *   5. confirming a packaged task finished;
 *   6. arranging the whole-project drawing of modules;
 *   7. switching a reminder on another owner's checklist.
 * And installing the agent tools, which waits for every secretary's readiness signature, gets a gate on that hold.
 *
 * AT OFF, AN AGENT PROVED BY ITS OWN KEY MAY ALSO ACT, and what it wrote names it. The gate counts it as a request it
 * would have stopped. A caller that no key proves to be a registered agent is still refused, is not counted, and is
 * refused in words of its own, because the words of the block say only certain callers may, and at off that is not
 * true. Where a door asks the person's grant, the grant is asked only at block, so at off a raised secretary goes
 * through as any keyed agent does, and nothing is written under the grant.
 *
 * SOME THINGS STAY AS THEY ARE AT OFF. Deleting a record that asks the person something is refused to every agent at
 * both positions, in the same words, and is not counted. The maker of a module and a secretary still name its planner,
 * the agent responsible for a task still confirms it, and the owner of a checklist still switches its reminders, each
 * uncounted. An item's reminder still names whoever switched it on.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The person, and the secretary a door already let through, go
 * through and are not counted. An agent with its own key and no card for the door is refused, and the gate counts the
 * stop. Where the door asks the person's grant, a request the grant carries goes through under the grant and is not
 * counted, and a request it does not carry is refused by the grant's own check. The cases that ask only this run green
 * on the code before round U, and they are its control run. Where today's words of the block are the same for a caller
 * with a key and one without, a case asks for that.
 *
 * THE HOLD. At block, the person's press of the install waits for the signatures, and the gate counts the wait. At off,
 * the person's press opens the terminal at once, with no readiness checklist and no signature, and the reply says so.
 * A raised secretary's press at off is refused 409, and nothing is installed: it would run as the person, and the
 * person did not press. A checklist already waiting when the gate is switched off stays waiting.
 *
 * THE QUESTION WITHOUT THE RAISE. A gate at off asks whether an agent acts for the person without asking the raise. A
 * case asks that question and the whole question of each kind of caller, at both positions: the two agree for the test
 * world, a signed item, a warrant, an agent with no card and a caller no registry holds, and differ only for the raise.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said. Where the words name the record,
 * both are asked of the same record, or the record is taken out of the words before they are compared.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's case for that caller goes
 * red. Give that caller at off the words it gets at block, and each door's case of the words goes red. Leave out the
 * count at off, and each door's first case goes red. Leave out the count at block, and each door's case at block goes
 * red. Ask the grant at off too, and the case of the raised secretary at off goes red at each door that asks the grant.
 * Gate a delete of a record that asks the person something, and the case of the delete goes red. Count the maker of a
 * module, and the maker's case goes red. Name the owner on a reminder another agent switched on, and that case goes
 * red. At off, raise a checklist for the install as at block, and the person's case at off goes red. Run the install
 * as the person at off when a secretary pressed, and the secretary's case goes red. Close a waiting checklist at off,
 * and the case of the waiting checklist goes red. Let the question without the raise ask the raise, and the case of
 * the question goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, and two workers are made-up agents, each holding the key the office answered. Every module, problem,
 * task, checklist, repository, folder, pattern and reason is made up. A repository is made a scanned one by writing a
 * made-up scan straight into the scratch database, because scanning a folder is not what these cases ask. NO TERMINAL
 * OPENS: the function that would open the install's terminal is replaced here by one that writes down what it was
 * asked and answers a made-up terminal.
 */

import type { FastifyInstance } from 'fastify'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, FOR_THE_PERSON_IN_THE_QUERY, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** What the install was asked to open, in order. Nothing is opened. */
const opened = vi.hoisted(() => ({ asked: [] as { harnesses: string[]; person: string }[] }))

vi.mock('../src/server/lib/harnesses.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/harnesses.ts')>()
  return {
    ...real,
    // A MADE-UP TERMINAL. What the install asked for is written down, and no terminal opens in a test.
    openTheInstallTerminal: async (chosen: readonly { id: string }[], personId: string) => {
      opened.asked.push({ harnesses: chosen.map((one) => one.id), person: personId })
      return { terminal: { id: 'a-made-up-terminal' }, installing: chosen.map((one) => one.id) }
    },
  }
})

const SECRETARY = 'round-u-secretary'
const RAISED = 'round-u-raised-secretary'
const WORKER = 'round-u-worker'
const OTHER = 'round-u-other-worker'
const BECAUSE = 'A made-up reason for this test.'

const PLANNER = 'who-names-a-modules-planner'
const ASK = 'who-removes-an-ask-on-the-person'
const ROW = 'who-retires-a-row-the-person-stated'
const REPOINT = 'who-repoints-a-scanned-repository'
const CONFIRM = 'who-confirms-a-packaged-task-finished'
const GRAPH = 'who-arranges-the-module-graph'
const REMINDER = 'who-switches-a-checklist-reminder'
const HOLD = 'held-for-readiness-signatures'
const ROUND_U = [PLANNER, ASK, ROW, REPOINT, CONFIRM, GRAPH, REMINDER, HOLD]
const INSTALL = 'harnesses.install'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const switched = new Set<string>()
const madeDirs: string[] = []
let grantId = ''
let presses = 0
/** The record, row or repository the last press was made for. */
let latest = ''
/** The repository the implementation map's rows are stated against, never scanned. */
let mapRepository = ''
/** The module the whole-project drawing arranges. */
let drawnModule = ''

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

/** The person starts an agent, and the office's answer is kept: its key and its registry id. */
async function start(handle: string, role: 'secretary' | 'worker'): Promise<void> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
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

const marker = (table: 'changes' | 'presses_for_the_person' | 'readiness_checklists' | 'readiness_signatures'): number =>
  (t.client.sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) AS n FROM ${table}`).get() as { n: number }).n

/** What one press wrote down as done under the grant: its change rows that name a grant, and its press rows. */
function underTheGrantSince(changes: number, pressed: number): { changes: unknown[]; presses: { grant_id: string; operation: string }[] } {
  return {
    changes: t.client.sqlite.prepare('SELECT record_id, actor_id, elevation FROM changes WHERE rowid > ? AND elevation IS NOT NULL').all(changes),
    presses: t.client.sqlite.prepare('SELECT grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(pressed) as { grant_id: string; operation: string }[],
  }
}

/** How many change rows one record, row or repository has. */
const rowsOn = (id: string): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(id) as { n: number }).n

/** Start watching the change rows of the last press's target; the function it answers lists whom the rows written since name. */
const changeRowsOnTheLatest = (): (() => string[]) => {
  const on = latest
  const from = marker('changes')
  return () => (t.client.sqlite.prepare('SELECT actor_id FROM changes WHERE record_id = ? AND rowid > ?').all(on, from) as { actor_id: string }[]).map((row) => row.actor_id)
}

/** A record as the scratch database holds it, beside how many change rows it has. */
const theRecord = (id: string): string =>
  JSON.stringify([t.client.sqlite.prepare('SELECT data, deleted_at FROM records WHERE id = ?').get(id) ?? null, rowsOn(id)])

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
  /** Whether a secretary proved by its own key, with no grant, may press it today. */
  aSecretary: boolean
  /** Whether today an agent with its own key and one with none get the same refusal at block. */
  oneRefusalAtBlock: boolean
  make: () => Promise<APress>
  /** What a refused press must leave as it was. */
  state: () => string
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
      const written = changeRowsOnTheLatest()
      const done = await press(asked, as(WORKER))
      expect(done.status, done.raw).toBeLessThan(300)
      namesTheAgent(written(), WORKER)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
    })

    it('at off, the same agent with no key is refused, nothing changes, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = one.state()
      const refused = await press(asked, withNoKey(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate), 'a caller with no key was counted').toEqual(before)
    })

    it('back at block, the agent with its own key is refused, nothing changes, the gate counts the stop, and the refusal at off was in words of its own', async () => {
      // ONE PRESS, ASKED THREE TIMES. Most refusals name the record they refuse, so two presses on two records would be
      // refused in different words even where the words say the same thing.
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const state = one.state()
      const atOff = await press(asked, withNoKey(WORKER))
      expect(atOff.status, atOff.raw).toBe(403)
      await setTheGate(one.gate, 'block')
      const keylessAtBlock = await press(asked, withNoKey(WORKER))
      expect(keylessAtBlock.status, keylessAtBlock.raw).toBe(403)
      const before = counted(one.gate)
      const refused = await press(asked, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(one.state(), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
      // At off an agent with a key may, so the words that say only certain callers may are not true there.
      expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
      expect(atOff.error, 'a caller with no key at off was refused in the words it gets at block').not.toBe(keylessAtBlock.error)
    })

    // The control run: nothing in this case switches the gate, so it reads the door as it stands before round U.
    it('at block, the callers the door let through before still go through uncounted, and an agent with or without its own key is refused', async () => {
      for (const [who, headers, may] of [['the person', PERSON, true], [SECRETARY, as(SECRETARY), one.aSecretary]] as const) {
        const asked = await one.make()
        const state = one.state()
        const before = counted(one.gate)
        const reply = await press(asked, headers)
        if (may) {
          expect(reply.status, `${who}: ${reply.raw}`).toBeLessThan(300)
          expect(counted(one.gate), `${who}: a caller the door lets through was counted`).toEqual(before)
        } else {
          expect(reply.status, `${who}: ${reply.raw}`).toBe(403)
          expect(one.state(), `${who}: a refused press changed something`).toBe(state)
        }
      }
      const asked = await one.make()
      const state = one.state()
      const keyed = await press(asked, as(WORKER))
      const keyless = await press(asked, withNoKey(WORKER))
      expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
      expect(one.state(), 'a refused press changed something').toBe(state)
      if (one.oneRefusalAtBlock) expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
    })

    if (one.asksTheGrant) {
      it('at off, a raised secretary pressing for the person goes through as any keyed agent does, nothing is written under the grant, and the gate counts it', async () => {
        await setTheGate(one.gate, 'off')
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const written = changeRowsOnTheLatest()
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
        const state = one.state()
        const theDoorsOwn = await press(asked, withNoKey(WORKER))
        const refused = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect([theDoorsOwn.status, refused.status], refused.raw).toEqual([403, 403])
        expect(refused.error, 'the door gave its own refusal, so the grant\'s check was not asked').not.toBe(theDoorsOwn.error)
        expect(one.state(), 'a refused press changed something').toBe(state)
        expect(counted(one.gate), 'a press the grant refused was counted').toEqual(before)
      })
    }
  })
}

/** A made-up folder, removed when the file ends. */
function aFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'round-u-repository-'))
  madeDirs.push(dir)
  return dir
}

/** The person, or the agent given, files a record, and its id is answered. */
async function aRecord(headers: Record<string, string>, kind: string, data: Record<string, unknown>): Promise<string> {
  const made = await call('POST', '/api/records', headers, { kind, title: `A made-up ${kind} for round U, ${String(++presses)}`, data })
  expect(made.status, made.raw).toBe(201)
  return String(made.body.record?.id ?? '')
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
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [WORKER, 'worker'], [OTHER, 'worker']] as const) {
    await start(handle, role)
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
  const repository = await call('POST', '/api/implementation/repositories', PERSON, { name: 'round-u-map', root: null })
  expect(repository.status, repository.raw).toBeLessThan(300)
  mapRepository = String(repository.body.repository?.id ?? '')
  drawnModule = await aRecord(PERSON, 'module', { state: 'active' })
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
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// ------------------------------------------------------------------ 1. naming a module's planner

/** Another worker makes a module, so neither the worker that presses nor the person is its maker. */
async function aPlannerNamed(): Promise<APress> {
  latest = await aRecord(as(OTHER), 'module', { state: 'active' })
  return { method: 'PATCH', url: `/api/records/${latest}`, body: { dataPatch: { planner: { kind: 'agent', id: ids.get(WORKER) } } } }
}

theCases({
  gate: PLANNER,
  door: 'record.change',
  // The planner's own check never asked the grant: a secretary names a planner by its card.
  asksTheGrant: false,
  writesUnderTheGrant: false,
  aSecretary: true,
  oneRefusalAtBlock: true,
  make: aPlannerNamed,
  state: () => theRecord(latest),
})

describe(`${PLANNER}: what stays as it was`, () => {
  for (const position of ['block', 'off'] as const) {
    // At block a control case.
    it(`at ${position}, the module's maker names its planner, and so does a secretary, and the gate does not count them`, async () => {
      if (position === 'off') await setTheGate(PLANNER, 'off')
      const before = counted(PLANNER)
      await aPlannerNamed()
      const byTheMaker = await call('PATCH', `/api/records/${latest}`, as(OTHER), { dataPatch: { planner: { kind: 'agent', id: ids.get(WORKER) } } })
      expect(byTheMaker.status, byTheMaker.raw).toBeLessThan(300)
      const byASecretary = await call('PATCH', `/api/records/${latest}`, as(SECRETARY), { dataPatch: { planner: { kind: 'agent', id: ids.get(OTHER) } } })
      expect(byASecretary.status, byASecretary.raw).toBeLessThan(300)
      expect(counted(PLANNER), 'a caller the door lets through was counted').toEqual(before)
    })
  }
})

// ------------------------------------------------------------------ 2. closing an ask on the person, or taking the question off it

/** The person files a problem that asks the person something, so the question has reached the person. */
const anAsk = (dataPatch: Record<string, unknown>) => async (): Promise<APress> => {
  latest = await aRecord(PERSON, 'problem', { whose_move: 'person', symptom: `A made-up symptom, ${String(presses)}` })
  return { method: 'PATCH', url: `/api/records/${latest}`, body: { dataPatch } }
}

for (const [act, dataPatch] of [['a close', { state: 'fixed' }], ['taking the question off', { whose_move: null }]] as const) {
  describe(`${ASK}: ${act}`, () => {
    theCases({
      gate: ASK,
      door: 'record.change',
      asksTheGrant: true,
      writesUnderTheGrant: true,
      // A secretary closes a problem only as fixed or worked around with what fixed it, and these presses say no fix.
      aSecretary: false,
      oneRefusalAtBlock: true,
      make: anAsk(dataPatch),
      state: () => theRecord(latest),
    })
  })
}

describe(`${ASK}: a delete is not gated`, () => {
  it('at block and at off, an agent with its own key is refused the delete in the same words, nothing changes, and the gate counts nothing', async () => {
    const refusals: string[] = []
    for (const position of ['block', 'off'] as const) {
      await setTheGate(ASK, position)
      await anAsk({})()
      const before = counted(ASK)
      const state = theRecord(latest)
      const refused = await call('DELETE', `/api/records/${latest}`, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(theRecord(latest), 'a refused delete changed something').toBe(state)
      expect(counted(ASK), 'a delete was counted').toEqual(before)
      // The words name the record, and each position deletes a record of its own.
      refusals.push(refused.error.replaceAll(latest, '<record>').replace(/round U, \d+/g, 'round U, <n>').replace(/symptom, \d+/g, 'symptom, <n>'))
    }
    expect(refusals[1], 'at off the delete was refused in other words than at block').toBe(refusals[0])
  })
})

// ------------------------------------------------------------------ 3. deleting a row of the implementation map that a person stated

/** The person states which code a fresh module owns, and the row is answered. */
async function aStatedRow(): Promise<APress> {
  const module = await aRecord(PERSON, 'module', { state: 'active' })
  const declared = await call('POST', '/api/implementation', PERSON, { recordId: module, repositoryId: mapRepository, pattern: `src/round-u-${String(presses)}.ts` })
  expect(declared.status, declared.raw).toBe(201)
  latest = module
  return { method: 'DELETE', url: `/api/implementation/${String(declared.body.row?.id ?? '')}`, body: {} }
}

let statedRow = ''
theCases({
  gate: ROW,
  door: 'implementation.write',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: async () => {
    const asked = await aStatedRow()
    statedRow = asked.url.split('/').pop() ?? ''
    return asked
  },
  state: () => JSON.stringify([t.client.sqlite.prepare('SELECT * FROM implementation_map WHERE id = ?').get(statedRow) ?? null, rowsOn(latest)]),
})

// ------------------------------------------------------------------ 4. pointing a scanned repository at another folder

/** The person registers a repository at a made-up folder, and a made-up scan of it is written straight in. */
async function aRepoint(): Promise<APress> {
  const root = aFolder()
  const registered = await call('POST', '/api/implementation/repositories', PERSON, { name: `round-u-repository-${String(++presses)}`, root })
  expect(registered.status, registered.raw).toBeLessThan(300)
  latest = String(registered.body.repository?.id ?? '')
  t.client.sqlite
    .prepare("INSERT INTO source_index (workspace_id, repository_id, built_at, built_by, root, scan_ms, skipped) VALUES ('default', ?, '2026-10-25 06:00:00', ?, ?, 12, '[]')")
    .run(latest, `human:${THE_PERSON}`, root)
  return { method: 'PATCH', url: `/api/implementation/repositories/${latest}`, body: { root: aFolder() } }
}

theCases({
  gate: REPOINT,
  door: 'implementation.repository-write',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: aRepoint,
  state: () => JSON.stringify([t.client.sqlite.prepare('SELECT root FROM repositories WHERE id = ?').get(latest) ?? null, rowsOn(latest)]),
})

// ------------------------------------------------------------------ 5. confirming a packaged task finished

/** The person files a task, so the person is responsible for it. */
async function aConfirm(): Promise<APress> {
  latest = await aRecord(PERSON, 'task', {})
  return { method: 'POST', url: `/api/delegation/${latest}/confirm`, body: {} }
}

theCases({
  gate: CONFIRM,
  door: 'delegation.confirm',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: aConfirm,
  state: () => theRecord(latest),
})

describe(`${CONFIRM}: what stays as it was`, () => {
  for (const position of ['block', 'off'] as const) {
    // At block a control case.
    it(`at ${position}, the agent responsible for a task confirms it, and the gate does not count it`, async () => {
      if (position === 'off') await setTheGate(CONFIRM, 'off')
      latest = await aRecord(as(WORKER), 'task', {})
      const before = counted(CONFIRM)
      const done = await call('POST', `/api/delegation/${latest}/confirm`, as(WORKER), {})
      expect(done.status, done.raw).toBeLessThan(300)
      expect(counted(CONFIRM), 'the agent responsible was counted').toEqual(before)
    })
  }
})

// ------------------------------------------------------------------ 6. arranging the whole-project drawing of modules

theCases({
  gate: GRAPH,
  door: 'structure.write',
  asksTheGrant: true,
  writesUnderTheGrant: true,
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: async () => {
    latest = drawnModule
    return { method: 'PUT', url: `/api/presentation/structure/nodes/${drawnModule}`, body: { intent: { lane: `round-u-lane-${String(++presses)}` } } }
  },
  state: () => JSON.stringify([t.client.sqlite.prepare("SELECT * FROM presentation_intent WHERE scope = 'structure'").all(), rowsOn(drawnModule)]),
})

// ------------------------------------------------------------------ 7. switching a reminder on another owner's checklist

/** The person makes a checklist with one item, so the person owns it. */
async function aReminder(): Promise<APress> {
  const made = await call('POST', '/api/checklists', PERSON, { title: `A made-up checklist for round U, ${String(++presses)}` })
  expect(made.status, made.raw).toBeLessThan(300)
  latest = String(made.body.checklist?.id ?? '')
  const added = await call('POST', `/api/checklists/${latest}/items`, PERSON, { words: 'A made-up item.' })
  expect(added.status, added.raw).toBe(201)
  const at = localStamp(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
  return { method: 'PUT', url: `/api/checklists/${latest}/items/${String(added.body.item?.id ?? '')}/reminder`, body: { on: true, at } }
}

theCases({
  gate: REMINDER,
  door: 'checklist.reminder',
  asksTheGrant: false,
  writesUnderTheGrant: false,
  aSecretary: false,
  oneRefusalAtBlock: true,
  make: aReminder,
  state: () => theRecord(latest),
})

describe(`${REMINDER}: whom the reminder names`, () => {
  it('at off, the item names the agent that switched the reminder on, and the checklist is still the owner\'s', async () => {
    await setTheGate(REMINDER, 'off')
    const asked = await aReminder()
    const done = await press(asked, as(WORKER))
    expect(done.status, done.raw).toBeLessThan(300)
    expect(done.body.item?.reminder?.switchedOnBy).toEqual({ kind: 'agent', id: ids.get(WORKER) })
    const read = await call('GET', `/api/checklists/${latest}`, PERSON)
    expect(read.status, read.raw).toBe(200)
    expect(read.body.checklist?.owner, 'the checklist changed owner').toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('at off, the owner switches a reminder as before, and the gate does not count it', async () => {
    await setTheGate(REMINDER, 'off')
    const asked = await aReminder()
    const before = counted(REMINDER)
    const done = await press(asked, PERSON)
    expect(done.status, done.raw).toBeLessThan(300)
    expect(counted(REMINDER), 'the owner was counted').toEqual(before)
  })
})

// ------------------------------------------------------------------ 8. the hold on readiness signatures

/** The readiness checklists waiting now, by id. */
const waiting = (): string[] => (t.client.sqlite.prepare("SELECT id FROM readiness_checklists WHERE state = 'waiting' ORDER BY id").all() as { id: string }[]).map((row) => row.id)

describe(`${HOLD} at ${INSTALL}`, () => {
  // NO SANDBOX_DIR WHILE THESE CASES PRESS INSTALL, because the office refuses every install press inside a sandbox,
  // before the gate. A refusal there would also pass the case below that expects any 409 but a wait. It is put back after.
  const sandbox = process.env.SANDBOX_DIR
  beforeAll(() => {
    delete process.env.SANDBOX_DIR
  })
  afterAll(() => {
    if (sandbox !== undefined) process.env.SANDBOX_DIR = sandbox
  })

  // A control case: nothing in it switches the gate.
  it('at block, the person\'s press waits for the secretaries\' signatures, and nothing is opened', async () => {
    const asked = opened.asked.length
    const checklists = marker('readiness_checklists')
    const reply = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex'] })
    expect(reply.status, reply.raw).toBe(409)
    expect(reply.body.code, reply.raw).toBe('readinessWaits')
    expect(marker('readiness_checklists'), 'no checklist was raised').toBeGreaterThan(checklists)
    expect(waiting()).toContain(reply.body.values?.checklist)
    expect(opened.asked.slice(asked), 'the install ran before everyone signed').toEqual([])
  })

  it('at block, the gate counts the wait', async () => {
    await setTheGate(HOLD, 'block')
    const before = counted(HOLD)
    const reply = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['claude-code'] })
    expect(reply.status, reply.raw).toBe(409)
    expect(counted(HOLD)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
  })

  it('at off, the person\'s press opens it at once, with no checklist and no signature, the reply says so, and the gate counts it', async () => {
    await setTheGate(HOLD, 'off')
    const asked = opened.asked.length
    const [checklists, signatures] = [marker('readiness_checklists'), marker('readiness_signatures')]
    const before = counted(HOLD)
    const reply = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['opencode'] })
    expect(reply.status, reply.raw).toBe(201)
    expect(opened.asked.slice(asked)).toEqual([{ harnesses: ['opencode'], person: THE_PERSON }])
    expect([marker('readiness_checklists'), marker('readiness_signatures')], 'a checklist was raised or signed').toEqual([checklists, signatures])
    expect(reply.body.withoutTheSignatures, 'the reply does not say it ran without the signatures').toEqual(expect.any(String))
    expect(reply.body.readinessChecklist).toBeUndefined()
    expect(counted(HOLD)).toEqual({ ...before, would_stop: before.would_stop + 1 })
  })

  it('at off, a raised secretary\'s press is refused, because it would run as the person, and nothing is installed', async () => {
    await setTheGate(HOLD, 'off')
    answer(INSTALL, 'may-press')
    const asked = opened.asked.length
    const [checklists, signatures] = [marker('readiness_checklists'), marker('readiness_signatures')]
    const reply = await call('POST', '/api/harnesses/install', as(RAISED), { harnesses: ['codex', 'opencode'], ...FOR_THE_PERSON })
    expect(reply.status, reply.raw).toBe(409)
    expect(reply.body.code, 'the press waits, as at block').not.toBe('readinessWaits')
    expect(opened.asked.slice(asked), 'the install ran as the person when a secretary pressed').toEqual([])
    expect([marker('readiness_checklists'), marker('readiness_signatures')], 'a checklist was raised or signed').toEqual([checklists, signatures])
  })

  it('a checklist already waiting when the gate is switched off stays waiting, and a press at off does not close it', async () => {
    await setTheGate(HOLD, 'block')
    const waited = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex', 'claude-code'] })
    expect(waited.status, waited.raw).toBe(409)
    const id = String(waited.body.values?.checklist ?? '')
    expect(waiting()).toContain(id)
    await setTheGate(HOLD, 'off')
    const ran = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex', 'claude-code'] })
    expect(ran.status, ran.raw).toBe(201)
    expect(waiting(), 'a press at off closed the checklist that was waiting').toContain(id)
  })
})

// ------------------------------------------------------------------ 9. the question a gate asks at off

describe('the question without the raise', () => {
  it('answers as the whole question does for each kind of caller, at block and at off, and differs only for the raise', async () => {
    const records = (await import('../src/server/lib/records.ts')) as unknown as Record<string, unknown>
    const whole = records['actsForThePerson'] as (actor: Record<string, unknown>, touches?: unknown) => boolean
    const withoutTheRaise = records['actsForThePersonWithoutTheRaise'] as ((actor: Record<string, unknown>) => boolean) | undefined
    expect(withoutTheRaise, 'there is no question without the raise').toBeTypeOf('function')
    // An agent pressing a door for the person, as an actor carries the press once the route has read it.
    const anAgent = (handle: string): Record<string, unknown> => ({
      type: 'agent',
      id: handle,
      sessionId: null,
      stated: true,
      press: { operation: 'record.write', aRead: false, reason: A_TESTS_REASON_FOR_THE_PERSON },
    })
    const kinds: [string, () => Record<string, unknown>, boolean][] = [
      ['the test world', () => ({ ...anAgent(SECRETARY), theOwnersAuthority: { holds: true, because: BECAUSE } }), true],
      ['a signed item', () => ({ ...anAgent(WORKER), signedItem: { item: 'a-made-up-item', because: BECAUSE } }), true],
      ['a warrant', () => ({ ...anAgent(WORKER), warrant: { quote: BECAUSE } }), true],
      ['an agent with no card for it', () => anAgent(WORKER), false],
      ['a caller no registry holds', () => anAgent('round-u-nobody'), false],
    ]
    for (const position of ['block', 'off'] as const) {
      for (const gate of ROUND_U) await setTheGate(gate, position)
      for (const [kind, make, says] of kinds) {
        for (const touches of [{}, { also: ['plan:committing-hours'] }]) {
          expect(whole(make(), touches), `${position}, ${kind}: the whole question`).toBe(says)
        }
        const asked = make()
        expect(withoutTheRaise!(asked), `${position}, ${kind}: the question without the raise`).toBe(says)
        expect(asked['elevationUsed'], `${position}, ${kind}: the question without the raise marked a raise`).toBeUndefined()
      }
      const raised = anAgent(RAISED)
      expect(withoutTheRaise!(raised), `${position}: the question without the raise let the raise through`).toBe(false)
      expect(raised['elevationUsed'], `${position}: the question without the raise marked the raise`).toBeUndefined()
      const pressing = anAgent(RAISED)
      expect(whole(pressing), `${position}: the whole question did not let the raise through`).toBe(true)
      expect(pressing['elevationUsed'], `${position}: the whole question did not mark the raise`).toBe(true)
    }
  })
})
