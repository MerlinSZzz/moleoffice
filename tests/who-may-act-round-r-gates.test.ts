// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FIVE WHO-MAY-ACT GATES AT NINE DOORS. Wave 13r round R.
 *
 * Each of these doors lets only some callers through: the person, a secretary proved by its own key, a secretary the
 * person's grant carries, or an agent with a live grant to restart and pause the office. Round R gives each rule a gate
 * the person may switch off:
 *   1. the pause and the resume of the office's work (a restart is not under it, at either position);
 *   2. the change and the restore of a page word, and of the sidebar;
 *   3. the naming of the agent who takes the dead letters;
 *   4. the choice of who is reminded about a project's modules;
 *   5. the merges-only switch and how many checks run at once, the related tests first, and the office's load ranges.
 * The stale fork bases door asks the gate through the same function as the merges-only door, `whoMayChangeIt` in
 * src/server/api/checks-in-merges-only.ts, so the merges-only row asks that wiring for both and it has no row here.
 *
 * AT OFF, AN AGENT PROVED BY ITS OWN KEY MAY ALSO ACT, and what it wrote names it. The gate counts it as a request it
 * would have stopped. A caller that no key proves to be a registered agent is still refused, is not counted, and is
 * refused in words of its own, because the words of the block say only certain callers may, and at off that is not
 * true.
 *
 * AT BLOCK EACH DOOR ANSWERS AS IT DID BEFORE THE ROUND. The person, and the secretary each door already let through,
 * go through and are not counted. An agent with its own key and no card for the door is refused in the words a caller
 * with no key gets, and the gate counts the stop. Where the door asks the person's grant, a request the grant carries
 * goes through under the grant and is not counted, and a request it does not carry is refused by the grant's own
 * check. The cases that ask only this run green on the code before round R, and they are its control run.
 *
 * No refusal's words are copied here, because another line may reword one while the behaviour stays right. A case
 * tells two refusals apart by asking for both and comparing what the office said.
 *
 * MUTATIONS, after a control run. Let a caller with no key through at off, and each door's case for that caller goes
 * red. Leave out the count at off, and each door's first case goes red. Ask the gate before the secretary or the grant
 * at block, so that the secretary is counted, and the cases for block go red. Put the restart under the gate, and the
 * restart case goes red.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, and a worker are made-up agents, each holding the key the office answered. The pause and restart
 * managers only count. Every record and reason is made up.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so the setup below builds a warm one.
buildTheFirstOfficeInAHook()

const SECRETARY = 'round-r-secretary'
const RAISED = 'round-r-raised-secretary'
const WORKER = 'round-r-worker'
const BECAUSE = 'A made-up reason for this test.'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
const switched = new Set<string>()
const seam = { stopped: 0, started: 0, restarts: 0 }
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
  expect(row, `the gate list has no row "${gate}"`).toMatchObject({ group: 'who-may-act', whoMayChange: 'the-person' })
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
function underTheGrantSince(changes: number, pressed: number): { changes: unknown[]; presses: { grant_id: string; operation: string }[] } {
  return {
    changes: t.client.sqlite.prepare('SELECT record_id, actor_id, elevation FROM changes WHERE rowid > ? AND elevation IS NOT NULL').all(changes),
    presses: t.client.sqlite.prepare('SELECT grant_id, operation FROM presses_for_the_person WHERE rowid > ?').all(pressed) as { grant_id: string; operation: string }[],
  }
}

/** One press of a door, made fresh so that one case's press does not settle what the next case asks. */
interface APress {
  method: 'POST' | 'PUT'
  url: string
  body: Record<string, unknown>
  /** The setting whose change rows a press that goes through writes. */
  writes: { setting: string }
}

interface ADoor {
  gate: string
  /** The door's operation, as this office's list of what the grant carries names it. */
  door: string
  /** Whether the door asks the person's grant, so the grant's cases are asked here. */
  asksTheGrant: boolean
  /** Whether the person may press it today. */
  thePerson: boolean
  /** Whether a secretary proved by its own key, with no grant, may press it today. */
  aSecretary: boolean
  make: () => Promise<APress>
}

/** What a refused press must leave as it was. */
function stateOf(one: APress): string {
  return String((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id = ?').get(`setting:${one.writes.setting}`) as { n: number }).n)
}

/** Who the rows a press wrote since the marker name. */
function namedSince(one: APress, changes: number): string[] {
  return (t.client.sqlite.prepare('SELECT actor_id FROM changes WHERE record_id = ? AND rowid > ?').all(`setting:${one.writes.setting}`, changes) as { actor_id: string }[]).map((row) => row.actor_id)
}

/** A row names an agent by the handle the request used or by the registry id the office gave it. */
function namesTheAgent(named: string[], handle: string): void {
  expect(named.length, `nothing the press wrote names ${handle}`).toBeGreaterThan(0)
  for (const one of named) expect([handle, ids.get(handle)], `a row names "${one}"`).toContain(one)
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
      const changes = marker('changes')
      const done = await press(asked, as(WORKER))
      expect(done.status, done.raw).toBeLessThan(300)
      namesTheAgent(namedSince(asked, changes), WORKER)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
    })

    it('at off, the same agent with no key is refused, nothing changes, and the gate does not count it', async () => {
      await setTheGate(one.gate, 'off')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = stateOf(asked)
      const refused = await press(asked, withNoKey(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(stateOf(asked), 'a refused press changed something').toBe(state)
      expect(counted(one.gate), 'a caller with no key was counted').toEqual(before)
    })

    it('back at block, the agent with its own key is refused, nothing changes, the gate counts the stop, and the refusal at off was in words of its own', async () => {
      await setTheGate(one.gate, 'off')
      const atOff = await press(await one.make(), withNoKey(WORKER))
      expect(atOff.status, atOff.raw).toBe(403)
      await setTheGate(one.gate, 'block')
      const asked = await one.make()
      const before = counted(one.gate)
      const state = stateOf(asked)
      const refused = await press(asked, as(WORKER))
      expect(refused.status, refused.raw).toBe(403)
      expect(stateOf(asked), 'a refused press changed something').toBe(state)
      expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1, stopped: before.stopped + 1 })
      // At off an agent with a key may, so the words that say only certain callers may are not true there.
      expect(atOff.error, 'a caller with no key at off was refused in the words of the block').not.toBe(refused.error)
    })

    // The control run: nothing in this case switches the gate, so it reads the door as it stands before round R.
    it('at block, the callers the door let through before still go through uncounted, and an agent with or without its own key gets the one refusal', async () => {
      for (const [who, headers, may] of [['the person', PERSON, one.thePerson], [SECRETARY, as(SECRETARY), one.aSecretary]] as const) {
        const asked = await one.make()
        const state = stateOf(asked)
        const before = counted(one.gate)
        const reply = await press(asked, headers)
        if (may) {
          expect(reply.status, `${who}: ${reply.raw}`).toBeLessThan(300)
          expect(counted(one.gate), `${who}: a caller the door lets through was counted`).toEqual(before)
        } else {
          expect(reply.status, `${who}: ${reply.raw}`).toBe(403)
          expect(stateOf(asked), `${who}: a refused press changed something`).toBe(state)
        }
      }
      const asked = await one.make()
      const state = stateOf(asked)
      const keyed = await press(asked, as(WORKER))
      const keyless = await press(asked, withNoKey(WORKER))
      expect([keyed.status, keyless.status], keyed.raw).toEqual([403, 403])
      expect(stateOf(asked), 'a refused press changed something').toBe(state)
      expect(keyed.error, 'the agent with its own key was refused in other words than before').toBe(keyless.error)
    })

    if (one.asksTheGrant) {
      it('at off, a raised secretary pressing for the person goes through as any keyed agent does, nothing is written under the grant, and the gate counts it', async () => {
        await setTheGate(one.gate, 'off')
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const done = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect(done.status, done.raw).toBeLessThan(300)
        expect(underTheGrantSince(changes, pressed), 'a press the gate let through was written down under the grant').toEqual({ changes: [], presses: [] })
        expect(counted(one.gate)).toEqual({ ...before, would_stop: before.would_stop + 1 })
      })

      it('at block, a press the grant carries goes through under the grant as before, and the gate does not count it', async () => {
        answer(one.door, 'may-press')
        const asked = await one.make()
        const before = counted(one.gate)
        const [changes, pressed] = [marker('changes'), marker('presses_for_the_person')]
        const done = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect(done.status, done.raw).toBeLessThan(300)
        const written = underTheGrantSince(changes, pressed)
        expect(written.presses, 'the press the grant carried wrote no press row naming the grant').toContainEqual({ grant_id: grantId, operation: one.door })
        expect(written.changes.length, 'the press the grant carried wrote no change row naming the grant').toBeGreaterThan(0)
        expect(counted(one.gate), 'a press the grant carried was counted').toEqual(before)
      })

      it('at block, a secretary the grant does not carry here is refused by the grant\'s own check, and the gate does not count it', async () => {
        answer(one.door, 'kept')
        const asked = await one.make()
        const before = counted(one.gate)
        const state = stateOf(asked)
        const theDoorsOwn = await press(asked, withNoKey(WORKER))
        const refused = await press(asked, as(RAISED), FOR_THE_PERSON)
        expect([theDoorsOwn.status, refused.status], refused.raw).toEqual([403, 403])
        expect(refused.error, 'the door gave its own refusal, so the grant\'s check was not asked').not.toBe(theDoorsOwn.error)
        expect(stateOf(asked), 'a refused press changed something').toBe(state)
        expect(counted(one.gate), 'a press the grant refused was counted').toEqual(before)
      })
    }
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  ;(await import('../src/server/lib/office-pause.ts')).thisOfficePausesWith({
    stopWorker: async () => {
      seam.stopped += 1
      return 'Made-up worker stopped.'
    },
    startWorker: async () => {
      seam.started += 1
      return 'Made-up worker started.'
    },
  })
  ;(await import('../src/server/lib/office-restart.ts')).thisOfficeRestartsWith({
    mode: 'checkout',
    prepare: async () => {
      seam.restarts += 1
      return () => undefined
    },
  })
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
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
  ;(await import('../src/server/lib/office-pause.ts')).thisOfficePausesWith(null)
  ;(await import('../src/server/lib/office-restart.ts')).thisOfficeRestartsWith(null)
  await app?.close()
  t?.close()
})

theCases({
  gate: 'who-pauses-the-office',
  door: 'office.pause',
  asksTheGrant: true,
  thePerson: true,
  aSecretary: false,
  make: async () => ({ method: 'POST', url: '/api/office/pause', body: { why: BECAUSE }, writes: { setting: 'office-pause' } }),
})

it('leaves a restart with the person and a granted agent while the pause gate is off', async () => {
  await setTheGate('who-pauses-the-office', 'off')
  const before = { restarts: seam.restarts, counted: counted('who-pauses-the-office') }
  const refused = await call('POST', '/api/office/restart', as(WORKER), { because: BECAUSE })
  expect(refused.status, refused.raw).toBe(403)
  expect({ restarts: seam.restarts, counted: counted('who-pauses-the-office') }, 'the refused restart started something or was counted').toEqual(before)
})

theCases({
  gate: 'who-changes-the-page-words-and-sidebar',
  door: 'office.restore-word',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => {
    const listed = await call('GET', '/api/words/table?limit=1', PERSON)
    expect(listed.status, listed.raw).toBe(200)
    const key = String(listed.body.words?.[0]?.key ?? '')
    const read = await call('GET', `/api/words/table?key=${encodeURIComponent(key)}`, PERSON)
    expect(read.status, read.raw).toBe(200)
    return { method: 'POST', url: '/api/words/restore', body: { key, version: String(read.body.words?.[0]?.version ?? ''), because: BECAUSE, from: 'shipped' }, writes: { setting: `word:${key}` } }
  },
})

theCases({
  gate: 'who-changes-the-page-words-and-sidebar',
  door: 'office.set-sidebar',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => {
    const read = await call('GET', '/api/sidebar', PERSON)
    expect(read.status, read.raw).toBe(200)
    // The pages of All projects in the other order: a change every time, and one the sidebar's checks take.
    const arrangement = structuredClone(read.body.arrangement) as { groups: { key: string; keys: string[] }[] }
    arrangement.groups.find((group) => group.key === 'all')!.keys.reverse()
    return { method: 'POST', url: '/api/sidebar', body: { version: String(read.body.version), because: BECAUSE, arrangement }, writes: { setting: 'sidebar' } }
  },
})

theCases({
  gate: 'who-names-the-dead-letter-secretary',
  door: 'office.set-dead-letter-secretary',
  asksTheGrant: true,
  thePerson: true,
  aSecretary: false,
  make: async () => {
    const read = await call('GET', '/api/office/dead-letter-secretary', PERSON)
    expect(read.status, read.raw).toBe(200)
    // The secretary, or nobody where the secretary is named already, so a press that goes through always changes it.
    return { method: 'POST', url: '/api/office/dead-letter-secretary', body: { agent: read.body.stored === null ? SECRETARY : null }, writes: { setting: 'dead-letter-secretary' } }
  },
})

theCases({
  gate: 'who-names-the-module-reminder-secretary',
  door: 'office.set-module-reminder-secretary',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => {
    const read = await call('GET', '/api/office/module-reminder-secretaries', PERSON)
    expect(read.status, read.raw).toBe(200)
    const stored = (read.body.projects as { project: string; storedHere: string | null }[]).find((one) => one.project === 'default')?.storedHere ?? null
    return { method: 'POST', url: '/api/office/module-reminder-secretaries/default', body: { secretary: stored === null ? SECRETARY : null, because: BECAUSE }, writes: { setting: 'module-reminder-secretaries' } }
  },
})

theCases({
  gate: 'who-changes-the-merge-and-check-switches',
  door: 'office.set-checks-in-merges-only',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => ({ method: 'POST', url: '/api/office/checks-in-merges-only', body: { checksAtOnce: 2 + (++presses % 2), because: BECAUSE }, writes: { setting: 'checks-at-once' } }),
})

theCases({
  gate: 'who-changes-the-merge-and-check-switches',
  door: 'office.set-related-tests-first',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => ({ method: 'POST', url: '/api/office/related-tests-first', body: { on: ++presses % 2 === 0, because: BECAUSE }, writes: { setting: 'related-tests-first' } }),
})

theCases({
  gate: 'who-changes-the-merge-and-check-switches',
  door: 'office.set-load-ranges',
  asksTheGrant: false,
  thePerson: true,
  aSecretary: true,
  make: async () => ({ method: 'POST', url: '/api/office/load-ranges', body: { readMs: 1_000 + ++presses, because: BECAUSE }, writes: { setting: 'office-load-ranges' } }),
})
