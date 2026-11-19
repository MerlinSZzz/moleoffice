// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY THE PERSON HAS RAISED MAY ANSWER A NEW NAME THAT WAITS FOR THE PERSON. Item 43 of wave 13s, from the
 * owner's decision that a raise carries the person's acts but three: closing the key window, changing the regulations
 * and changing who the owner is. Answering an agent's new name is not one of them.
 *
 * Every case drives the real doors in one test office. A secretary proposes its own new name, which waits for the
 * person, and each later case has a secretary of its own propose one. What is measured:
 *
 *   (a) a secretary the person has not raised is refused, at the door and on the reading, and nothing is written;
 *   (b) the agent being renamed is refused even when it is raised, at the door and on the reading;
 *   (c) a raised secretary that gives no reason for the press is refused 400, and nothing is written;
 *   (d) where this office's list keeps the door for the person, a raised secretary is refused in the check's own words,
 *       and the reading says the same words, so the raise is read from the office's one check and no list of its own;
 *   (e) a raised secretary approves by its own key, the agent bears the new name, the row names the secretary and keeps
 *       the grant, and the press is written down with its reason; the refuse door does the same for a refusal;
 *   (f) the grant is kept only where the raise was what let the secretary answer: the person's answer keeps none, and
 *       neither does a raised secretary's answer in its own right, as the approver kept on the row;
 *   (g) naming the owner, one of the three acts a raise never carries, is still refused to the raised secretary, and
 *       nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. In `whyTheCallerMayNotAnswer` (src/server/lib/agent-renames.ts), answer the person's sentence without asking the
 *      raise → (e) goes red: the raised secretary is refused at both doors and on the reading. (c) and (d) go red too,
 *      because the refusal is the door's own and not the check's.
 *   2. In `whyTheCallerMayNotAnswer`, ask the raise before the line that refuses the agent itself → (b) goes red: the
 *      reading tells the raised agent it may answer its own new name.
 *   3. In `answerARename`, store null in place of the grant → (e) goes red on the row and on the reply.
 *   4. In `whyTheCallerMayNotAnswer`, ask the raise for the approver's answer in its own right too → (f) goes red on
 *      that answer, which needs no raise and gives no reason for one.
 *   5. In `onTheReading`, return null whatever the check says → (d) goes red on the reading.
 *
 * THE PRODUCT'S SENTENCES ARE READ FROM WHERE IT DEFINES THEM, never written out here: the two rename refusals from
 * src/shared/agent-renames.ts and the owner refusal from src/shared/owner.ts, each imported inside its case, after
 * freshDb. A door is named by its operation, as the grant list names it.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent, started by the person or by an agent already registered here, and keep its id and key. */
async function started(handle: string, role: string, by: string | null = null): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', by === null ? AS_THE_PERSON : as(by), { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
}
const as = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': agents.get(handle)!.key,
})
const idOf = (handle: string): string => agents.get(handle)!.id

/** Raise a secretary for the person, pressed with the person's key, and answer the grant's id. */
async function raise(handle: string): Promise<string> {
  const raised = await inject('POST', `/api/roles/elevation/${handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.text).toBe(201)
  return String(raised.json['elevation'].id)
}

function nameOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT name FROM agents WHERE id = ?').get(idOf(handle)) as { name: string }).name
}

function theRow(renameId: string): Record<string, unknown> {
  return t.client.sqlite.prepare('SELECT * FROM agent_renames WHERE id = ?').get(renameId) as Record<string, unknown>
}

const thePresses = (grantId: string): { operation: string; reason: string | null }[] =>
  t.client.sqlite.prepare('SELECT operation, reason FROM presses_for_the_person WHERE grant_id = ? ORDER BY rowid').all(grantId) as {
    operation: string
    reason: string | null
  }[]

async function propose(handle: string, name: string): Promise<string> {
  const proposed = await inject('POST', `/api/participants/agent/${idOf(handle)}/renames`, as(handle), { name, because: 'A made-up reason for the new name.' })
  expect(proposed.status, proposed.text).toBe(201)
  return String(proposed.json['rename'].id)
}

async function answer(renameId: string, how: 'approve' | 'refuse', by: Record<string, string>, extra: Record<string, unknown> = {}): Promise<Reply> {
  return inject('POST', `/api/renames/${renameId}/${how}`, by, { because: 'A made-up reason for the answer.', ...extra })
}

/** Why this caller may not answer the new name that waits for the agent, as the agent's reading of its renames says. */
async function whyNot(handle: string, by: Record<string, string>): Promise<unknown> {
  const read = await inject('GET', `/api/participants/agent/${idOf(handle)}/renames`, by)
  expect(read.status, read.text).toBe(200)
  return read.json['waiting'].whyTheCallerMayNotAnswer
}

let grantOfTheRaised = ''
let firstName = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // SECRETARIES STARTED BY THE PERSON: one whose new name waits for the person, one the person raises, one the person
  // never raises, and two more whose new names wait for the person, so that each answer has a new name of its own. A
  // worker the raised secretary started, whose new name waits for that secretary.
  await started('sec-asking', 'secretary')
  await started('sec-raised', 'secretary')
  await started('sec-plain', 'secretary')
  await started('sec-refused', 'secretary')
  await started('sec-person', 'secretary')
  await started('wkr-under-raised', 'worker', 'sec-raised')
  firstName = await propose('sec-asking', 'A made-up new name')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('(a) to (d): who is refused a new name that waits for the person', () => {
  it('(a) a secretary the person has not raised is refused, at the door and on the reading', async () => {
    const { A_NEW_NAME_THE_PERSON_ANSWERS } = await import('../src/shared/agent-renames.ts')
    expect(await whyNot('sec-asking', as('sec-plain'))).toBe(A_NEW_NAME_THE_PERSON_ANSWERS)
    for (const how of ['approve', 'refuse'] as const) {
      const refused = await answer(firstName, how, as('sec-plain'))
      expect(refused.status, refused.text).toBe(403)
      expect(String(refused.json['error'])).toContain(A_NEW_NAME_THE_PERSON_ANSWERS)
    }
    expect(nameOf('sec-asking')).toBe('sec-asking')
    expect(theRow(firstName)).toMatchObject({ answer: null, answered_by_id: null, answered_under_grant: null })
  })

  it('(b) the agent being renamed is refused even when it is raised, at the door and on the reading', async () => {
    const { AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME } = await import('../src/shared/agent-renames.ts')
    await raise('sec-asking')
    expect(await whyNot('sec-asking', as('sec-asking'))).toBe(AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME)
    for (const how of ['approve', 'refuse'] as const) {
      const itself = await answer(firstName, how, as('sec-asking'), FOR_THE_PERSON)
      expect(itself.status, itself.text).toBe(403)
      expect(String(itself.json['error'])).toContain(AN_AGENT_NEVER_ANSWERS_ITS_OWN_NEW_NAME)
    }
    expect(nameOf('sec-asking')).toBe('sec-asking')
    expect(theRow(firstName)).toMatchObject({ answer: null, answered_by_id: null })
  })

  it('(c) a raised secretary that gives no reason for the press is refused 400, and nothing is written', async () => {
    grantOfTheRaised = await raise('sec-raised')
    const unexplained = await answer(firstName, 'approve', as('sec-raised'))
    expect(unexplained.status, unexplained.text).toBe(400)
    expect(String(unexplained.json['error'])).toContain('forThePerson')
    expect(nameOf('sec-asking')).toBe('sec-asking')
    expect(theRow(firstName)).toMatchObject({ answer: null, answered_by_id: null, answered_under_grant: null })
    expect(thePresses(grantOfTheRaised)).toEqual([])
  })

  it("(d) where this office's list keeps the door, the raised secretary is refused in the check's words, and the reading says them", async () => {
    const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
    const { A_NEW_NAME_THE_PERSON_ANSWERS } = await import('../src/shared/agent-renames.ts')
    const thePerson = { type: 'human', id: THE_PERSON } as never
    setThisOfficesAnswer('agent-rename.approve', 'kept', thePerson)
    try {
      const said = await whyNot('sec-asking', as('sec-raised'))
      expect(typeof said).toBe('string')
      expect(said).not.toBe(A_NEW_NAME_THE_PERSON_ANSWERS)
      expect(String(said)).toContain('agent-rename.approve')
      const kept = await answer(firstName, 'approve', as('sec-raised'), FOR_THE_PERSON)
      expect(kept.status, kept.text).toBe(403)
      expect(String(kept.json['error'])).toContain(String(said))
      expect(nameOf('sec-asking')).toBe('sec-asking')
      expect(thePresses(grantOfTheRaised)).toEqual([])
    } finally {
      setThisOfficesAnswer('agent-rename.approve', 'default', thePerson)
    }
  })
})

describe('(e) and (f): a raised secretary answers, and the row keeps the grant only then', () => {
  it('(e) a raised secretary approves by its own key, and the row and the reply keep the grant', async () => {
    expect(await whyNot('sec-asking', as('sec-raised'))).toBeNull()
    const approved = await answer(firstName, 'approve', as('sec-raised'), FOR_THE_PERSON)
    expect(approved.status, approved.text).toBe(200)
    expect(nameOf('sec-asking')).toBe('A made-up new name')
    expect(theRow(firstName)).toMatchObject({
      answer: 'approved',
      answered_by_kind: 'agent',
      answered_by_id: idOf('sec-raised'),
      answered_under_grant: grantOfTheRaised,
    })
    expect(approved.json['rename']).toMatchObject({ answer: 'approved', answeredBy: { kind: 'agent', id: idOf('sec-raised') }, answeredUnderTheGrant: grantOfTheRaised })
    expect(thePresses(grantOfTheRaised)).toEqual([{ operation: 'agent-rename.approve', reason: A_TESTS_REASON_FOR_THE_PERSON }])
  })

  it('(e) the refuse door does the same for a refusal, and the name stays as it is', async () => {
    const second = await propose('sec-refused', 'A made-up name refused')
    const refused = await answer(second, 'refuse', as('sec-raised'), FOR_THE_PERSON)
    expect(refused.status, refused.text).toBe(200)
    expect(nameOf('sec-refused')).toBe('sec-refused')
    expect(theRow(second)).toMatchObject({ answer: 'refused', answered_by_id: idOf('sec-raised'), answered_under_grant: grantOfTheRaised })
    expect(refused.json['rename'].answeredUnderTheGrant).toBe(grantOfTheRaised)
    const refusals = thePresses(grantOfTheRaised).filter((press) => press.operation === 'agent-rename.refuse')
    expect(refusals).toEqual([{ operation: 'agent-rename.refuse', reason: A_TESTS_REASON_FOR_THE_PERSON }])
  })

  it("(f) the person's answer keeps no grant", async () => {
    const third = await propose('sec-person', 'A name the person approves')
    const byThePerson = await answer(third, 'approve', AS_THE_PERSON)
    expect(byThePerson.status, byThePerson.text).toBe(200)
    expect(theRow(third)).toMatchObject({ answer: 'approved', answered_by_kind: 'person', answered_under_grant: null })
    expect(byThePerson.json['rename'].answeredUnderTheGrant).toBeNull()
  })

  it("(f) a raised secretary's answer in its own right, as the approver kept on the row, keeps no grant", async () => {
    const own = await propose('wkr-under-raised', 'A made-up worker name')
    expect(theRow(own)).toMatchObject({ approver_kind: 'agent', approver_id: idOf('sec-raised') })
    expect(await whyNot('wkr-under-raised', as('sec-raised'))).toBeNull()
    const presses = thePresses(grantOfTheRaised).length
    const approved = await answer(own, 'approve', as('sec-raised'))
    expect(approved.status, approved.text).toBe(200)
    expect(nameOf('wkr-under-raised')).toBe('A made-up worker name')
    expect(theRow(own)).toMatchObject({ answer: 'approved', answered_by_id: idOf('sec-raised'), answered_under_grant: null })
    expect(approved.json['rename'].answeredUnderTheGrant).toBeNull()
    expect(thePresses(grantOfTheRaised)).toHaveLength(presses)
  })
})

describe('(g) the acts a raise never carries stay kept', () => {
  it('naming the owner is still refused to the raised secretary, and nothing is written', async () => {
    const { ONLY_THE_PERSON_NAMES_THEMSELVES } = await import('../src/shared/owner.ts')
    const before = JSON.stringify(t.client.sqlite.prepare('SELECT * FROM installation').all())
    const presses = thePresses(grantOfTheRaised).length
    const named = await inject('POST', '/api/office/owner', as('sec-raised'), { name: 'A made-up owner', ...FOR_THE_PERSON })
    expect(named.status, named.text).toBe(403)
    expect(String(named.json['error'])).toContain(ONLY_THE_PERSON_NAMES_THEMSELVES)
    expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM installation').all())).toBe(before)
    expect(thePresses(grantOfTheRaised)).toHaveLength(presses)
  })
})
