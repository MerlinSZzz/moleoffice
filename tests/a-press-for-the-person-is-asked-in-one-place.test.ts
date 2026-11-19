// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE CHECK SAYS WHETHER A SECRETARY MAY PRESS A DOOR FOR THE PERSON UNDER THEIR GRANT. Wave 13s round 1. The flow
 * design (section 7) says that under the grant a secretary may press for the person everything but what the
 * secretary card keeps for them, and each press gives its reason.
 *
 * `mayPressForThePerson` in src/server/lib/records.ts answers, in this order: no grant, a run, no door, kept, ask
 * first, no reason, yes. `aRaiseCarriesIt` asks it for every door a raise carries, and the role gate asks it without
 * the reason. The card's two lists are read there and nowhere else, so a person's own change to them later is one
 * change in one place.
 *
 * THE GRANT IS REAL. The person presses it through the app, so nothing about it is mocked. The card is the shipped one,
 * except in the cases that need a door the shipped card does not list: those read a copy of it with one list changed,
 * through the real reader, and read the shipped card back after.
 *
 * MUTATION, after a control run (the report of the run that added this file):
 *   · the `kept` test taken out of the check → the two `kept` cases and the role gate's case are red;
 *   · the reason asked before the card's lists → "keeps a door the card keeps, before it asks for the reason" and
 *     "says ask first" are red, because both answer `no reason`;
 *   · the role gate's refusal in the check's own words taken out → "says the card keeps it" is red.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let grant: string
// IMPORTED AFTER `freshDb`, which says which database the server's modules open.
let records: typeof import('../src/server/lib/records.ts')
let roles: typeof import('../src/server/lib/roles.ts')
let atStart: typeof import('../src/server/lib/role-cards-at-start.ts')

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** An agent's actor as `actorFrom` makes it for a route that declared this door, with the reason given or not. */
function pressing(handle: string, operation: string | null, reason: string | null, aRead = false, sessionId: string | null = null): Actor {
  return { type: 'agent', id: handle, sessionId, stated: true, press: { operation, aRead, reason } }
}

/** The answer's reason for saying no, or 'yes'. */
function because(actor: Actor, withTheReason = true): string {
  const answer = records.mayPressForThePerson(actor, withTheReason)
  return answer.may ? 'yes' : answer.because
}

/** What `aRaiseCarriesIt` does with the same actor: true, false, or the status of the refusal it throws. */
function carried(actor: Actor): boolean | number {
  try {
    return records.aRaiseCarriesIt(actor)
  } catch (why) {
    if (why instanceof records.PanelError) return why.status
    throw why
  }
}

/** Read the shipped card with one change, through the real reader, until `theShippedCardAgain`. */
let folder: string | null = null
function theCardWith(change: (decl: RolesDeclaration) => void): void {
  const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  change(decl)
  folder = mkdtempSync(join(tmpdir(), 'mole-office-roles-'))
  const file = join(folder, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  roles.forgetTheRoleCards()
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]), file })
}

function theShippedCardAgain(): void {
  roles.forgetTheRoleCards()
  atStart.readTheRoleCardsAtStart()
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  records = await import('../src/server/lib/records.ts')
  roles = await import('../src/server/lib/roles.ts')
  atStart = await import('../src/server/lib/role-cards-at-start.ts')
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).status).toBe(201)
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-worker', name: 'A worker', role: 'worker', workArea: ['src'] })).status).toBe(201)
  // THE PERSON'S OWN PRESS, made as the person with their key.
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
  grant = String((pressed.body['elevation'] as { id: string }).id)
}, 60_000)

afterEach(() => {
  if (folder !== null) theShippedCardAgain()
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('the check answers in its order', () => {
  it('says yes to a secretary that holds the grant and gives its reason, and marks nothing', () => {
    const actor = pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON)
    const answer = records.mayPressForThePerson(actor)
    expect(answer.may).toBe(true)
    expect(answer.may && answer.grant.id).toBe(grant)
    expect(actor.elevation).toBeUndefined()
    expect(actor.elevationUsed).toBeUndefined()
  })

  it('says no grant to an agent that holds none, and the door then gives its own refusal', () => {
    const actor = pressing('a-worker', 'record.promote', A_TESTS_REASON_FOR_THE_PERSON)
    expect(because(actor)).toBe('no grant')
    expect(carried(actor)).toBe(false)
    expect(because({ type: 'human', id: THE_PERSON, sessionId: null, stated: true })).toBe('no grant')
  })

  it('says a run to a run the office started for the secretary, and the door gives its own refusal', async () => {
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'session',
      title: `${SECRETARY} answering a message`,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: SECRETARY },
    })
    expect(filed.status, filed.said).toBe(201)
    const run = String((filed.body['record'] as { id: string }).id)
    const actor = pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON, false, run)
    expect(because(actor)).toBe('a run')
    expect(carried(actor)).toBe(false)
  })

  it('says no door where nothing names the door, and refuses rather than guess', () => {
    const noPress: Actor = { type: 'agent', id: SECRETARY, sessionId: null, stated: true }
    expect(because(noPress)).toBe('no door')
    expect(because(pressing(SECRETARY, null, A_TESTS_REASON_FOR_THE_PERSON))).toBe('no door')
    expect(carried(noPress)).toBe(403)
  })

  it('keeps a door the card keeps, before it asks for the reason', () => {
    const kept = theShippedCardsFirstKeptDoor()
    expect(because(pressing(SECRETARY, kept, null))).toBe('kept')
    expect(because(pressing(SECRETARY, kept, A_TESTS_REASON_FOR_THE_PERSON))).toBe('kept')
    expect(because(pressing(SECRETARY, kept, null), false)).toBe('kept')
    expect(carried(pressing(SECRETARY, kept, A_TESTS_REASON_FOR_THE_PERSON))).toBe(403)
  })

  it('keeps a door whose check is gated as a kept door', () => {
    theCardWith((decl) => {
      decl.elevation.neverPresses = ['record.write']
    })
    // `record.check` is gated as `record.write` in src/shared/ops.ts: it asks the same gates the write asks.
    expect(because(pressing(SECRETARY, 'record.check', A_TESTS_REASON_FOR_THE_PERSON, true))).toBe('kept')
    expect(because(pressing(SECRETARY, 'record.write', A_TESTS_REASON_FOR_THE_PERSON))).toBe('kept')
    expect(because(pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON))).toBe('yes')
  })

  it('says ask first for a door the card asks the person about, because nothing records their answer', () => {
    theCardWith((decl) => {
      decl.elevation.askFirst = ['record.promote']
    })
    expect(because(pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON))).toBe('ask first')
    expect(because(pressing(SECRETARY, 'record.promote', null))).toBe('ask first')
    expect(carried(pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON))).toBe(403)
    expect(because(pressing(SECRETARY, 'record.write', A_TESTS_REASON_FOR_THE_PERSON))).toBe('yes')
  })

  it('asks for the reason last, and only of a door that changes something', () => {
    expect(because(pressing(SECRETARY, 'record.promote', null))).toBe('no reason')
    expect(carried(pressing(SECRETARY, 'record.promote', null))).toBe(400)
    // The role gate runs before the body is read, so it asks without the reason.
    expect(because(pressing(SECRETARY, 'record.promote', null), false)).toBe('yes')
    // A read changes nothing, so it gives no reason.
    expect(because(pressing(SECRETARY, 'record.check', null, true))).toBe('yes')
  })

  it('marks the actor only when a raise carries the request', () => {
    const actor = pressing(SECRETARY, 'record.promote', A_TESTS_REASON_FOR_THE_PERSON)
    expect(carried(actor)).toBe(true)
    expect(actor.elevation?.id).toBe(grant)
    expect(actor.elevationUsed).toBe(true)
    const refused = pressing(SECRETARY, 'record.promote', null)
    expect(carried(refused)).toBe(400)
    expect(refused.elevation).toBeUndefined()
    expect(refused.elevationUsed).toBeUndefined()
  })
})

describe('the role gate asks the same check', () => {
  it('says the card keeps it, in the check’s own words, before the door reads the body', async () => {
    // `office.scene-settings.change` is one of the acts the grant hands over, so the role gate asks the check for it.
    theCardWith((decl) => {
      decl.elevation.neverPresses = ['office.scene-settings.change']
    })
    // The body is not a scene. A door that read it would refuse it as one, with a 400.
    const no = await ask('PATCH', '/api/office/scene-settings', asAgent(SECRETARY), { forThePerson: { reason: A_TESTS_REASON_FOR_THE_PERSON } })
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain('The secretary card keeps office.scene-settings.change for the person')
  })
})

/** The first door the shipped card keeps, read from the card so this file holds no list of its own. */
function theShippedCardsFirstKeptDoor(): string {
  const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  const first = decl.elevation.neverPresses[0]
  if (first === undefined) throw new Error('The shipped card keeps no door, so this case has nothing to ask.')
  return first
}
