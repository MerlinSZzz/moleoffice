// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * INSTALLING THE AGENT TOOLS ASKS WHAT THE GRANT CARRIES. A scratch office in process, with two made-up secretaries
 * and synthetic records. The person gives the grant and changes this office's answers through the real doors.
 *
 * No grant keeps the door's refusal and code. The card's kept answer and this office's kept answer refuse in the
 * check's words. None raises a checklist or writes a press row. May-press raises one checklist as the secretary,
 * signs only as that agent and writes exactly one press row naming the secretary, grant, door and reason, even though
 * the answer is 409 readinessWaits. The person's signature still goes through the person's own door. The secretary
 * cannot use that door, even with this office's answer at may-press. Who must sign is the same as for a person's raise.
 *
 * NO INSTALLER RUNS. The second secretary never signs, so every checklist stays waiting, including after the person
 * signs. No terminal holder, external program, registry or model is asked.
 *
 * MUTATIONS RUN ON 23 October 2026, each alone after all five cases passed, with each file restored before the next:
 *   1. The install door asks onlyThePerson alone again: cases 2, 3, 4 and 5 fail.
 *   2. onlyThePersonRaises refuses a raise under the grant again: cases 4 and 5 fail.
 *   3. A raise under the grant signs as the person: case 4 fails on the person's signature, and case 5 fails because
 *      the secretary has not signed.
 *   4. The waiting install omits writeDownAPressOutsideTheLog: case 4 fails on its missing press row.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AReadinessChecklist } from '../src/server/lib/readiness.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'install-raised-secretary'
const UNRAISED = 'install-other-secretary'
const DOOR = 'harnesses.install'
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
let t: TestDb
let app: FastifyInstance
let grant = ''
let forgetTheWorldsOwnAuthority: () => void = () => undefined
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const saved = new Map<string, string | undefined>()

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function answer(door: string, choice: 'may-press' | 'kept' | 'default'): Promise<void> {
  const reply = await call('POST', '/api/office/what-the-grant-carries', PERSON, { changes: [{ door, answer: choice }] })
  expect(reply.status, reply.raw).toBe(200)
}

function rows(sql: string): unknown[] {
  return t.client.sqlite.prepare(sql).all()
}

function checklists(): unknown[] {
  return rows('SELECT * FROM readiness_checklists ORDER BY id')
}

function signatures(): unknown[] {
  return rows('SELECT * FROM readiness_signatures ORDER BY id')
}

function presses(): unknown[] {
  return rows('SELECT agent_id, grant_id, operation, reason FROM presses_for_the_person ORDER BY rowid')
}

async function checklist(id: string): Promise<AReadinessChecklist> {
  const read = await call('GET', `/api/readiness/${id}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body['checklist'] as AReadinessChecklist
}

async function install(who: string, harnesses = ['codex']) {
  return call('POST', '/api/harnesses/install', asAgent(who), { harnesses, ...FOR_THE_PERSON })
}

async function refused(who: string, words: string) {
  const before = { checklists: checklists(), signatures: signatures(), presses: presses(), changes: rows('SELECT * FROM changes ORDER BY rowid') }
  const reply = await install(who)
  expect(reply.status, reply.raw).toBe(403)
  expect(String(reply.body['error'])).toContain(words)
  expect({ checklists: checklists(), signatures: signatures(), presses: presses(), changes: rows('SELECT * FROM changes ORDER BY rowid') }).toEqual(before)
  return reply
}

beforeAll(async () => {
  for (const name of ['MOLE_OFFICE_WORLD_STARTED_BY', 'MOLE_OFFICE_WORLD_SECRETARIES']) {
    saved.set(name, process.env[name])
    delete process.env[name]
  }
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [RAISED, UNRAISED]) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'secretary' })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, (started.body['whatToGiveIt'] as { key: string }).key)
    ids.set(handle, (started.body['agent'] as { id: string }).id)
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up grant for the install test.' })
  expect(raised.status, raised.raw).toBe(201)
  grant = (raised.body['elevation'] as { id: string }).id
  expect(grant).not.toBe('')
}, 60_000)

afterEach(async () => {
  await answer(DOOR, 'default')
  await answer('readiness.sign-as-the-person', 'default')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  forgetTheWorldsOwnAuthority()
})

describe('installing the agent tools asks the list', () => {
  it('1: no grant keeps the old refusal and code, even with this office at may-press', async () => {
    await answer(DOOR, 'may-press')
    const reply = await refused(UNRAISED, 'Any other agent is refused, and nothing from a sandbox counts as the person.')
    expect(reply.body['code']).toBe('harnessesOnlyThePerson')
    expect(checklists()).toEqual([])
  })

  it('2: the card keeps the door, and the check refuses without raising a checklist', async () => {
    const reply = await refused(RAISED, `The secretary card keeps ${DOOR} for the person`)
    expect(reply.body['code']).not.toBe('harnessesOnlyThePerson')
    expect(checklists()).toEqual([])
  })

  it('3: this office keeps the door, and the check says whose answer it is', async () => {
    await answer(DOOR, 'kept')
    const reply = await refused(RAISED, `keeps ${DOOR} for the person`)
    expect(String(reply.body['error'])).toContain("This office's list of what the grant carries, since")
    expect(checklists()).toEqual([])
  })

  it('4: may-press raises and signs as the secretary, waits for the person, and writes one press row', async () => {
    await answer(DOOR, 'may-press')
    const before = checklists().length
    const written = presses().length
    const reply = await install(RAISED)
    expect(reply.status, reply.raw).toBe(409)
    expect(reply.body['code'], reply.raw).toBe('readinessWaits')
    const id = (reply.body['values'] as { checklist: string }).checklist
    expect(checklists()).toHaveLength(before + 1)
    const raised = await checklist(id)
    expect(raised.raisedBy).toMatchObject({ kind: 'agent', id: ids.get(RAISED) })
    expect(raised.signers.find((one) => one.kind === 'person')?.signedAt, 'the grant must never write the person’s signature').toBeNull()
    expect(raised.signers.find((one) => one.kind === 'agent' && one.id === ids.get(RAISED))?.signedAt).toEqual(expect.any(String))
    expect(raised.level).toBe('everyone')
    expect(raised.state).toBe('waiting')
    expect(raised.outcome).toBeNull()
    expect(raised.notSigned.map((one) => one.id).sort()).toEqual([THE_PERSON, ids.get(UNRAISED)].sort())
    expect(reply.body['terminal']).toBeUndefined()
    expect(presses().slice(written), 'the 409 wait must still record the secretary’s press once').toEqual([
      { agent_id: RAISED, grant_id: grant, operation: DOOR, reason: A_TESTS_REASON_FOR_THE_PERSON },
    ])
  })

  it('5: the person still signs through their own door, and the raised secretary is refused there', async () => {
    await answer(DOOR, 'may-press')
    const raised = await install(RAISED, ['claude-code'])
    expect(raised.body['code'], raised.raw).toBe('readinessWaits')
    const id = (raised.body['values'] as { checklist: string }).checklist
    await answer('readiness.sign-as-the-person', 'may-press')
    const before = signatures()
    const pressCount = presses().length
    const agent = await call('POST', `/api/readiness/${id}/sign-as-the-person`, asAgent(RAISED))
    expect(agent.status, agent.raw).toBe(403)
    expect(String(agent.body['error'])).toContain('The person presses Sign on the checklist')
    expect(signatures()).toEqual(before)
    expect(presses()).toHaveLength(pressCount)

    const signed = await call('POST', `/api/readiness/${id}/sign-as-the-person`, PERSON)
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body['ran']).toBe(false)
    const after = await checklist(id)
    expect(after.signers.find((one) => one.kind === 'person')?.signedAt).toEqual(expect.any(String))
    expect(after.notSigned.map((one) => one.id)).toEqual([ids.get(UNRAISED)])
    expect(after.state).toBe('waiting')
    expect(after.outcome).toBeNull()

    // A CHECKLIST THE PERSON RAISES HAS THE SAME SIGNERS and waits on the same remaining secretary.
    const personsRaise = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['opencode'] })
    expect(personsRaise.body['code'], personsRaise.raw).toBe('readinessWaits')
    const personsId = (personsRaise.body['values'] as { checklist: string }).checklist
    const ownSignature = await call('POST', `/api/readiness/${personsId}/sign`, asAgent(RAISED))
    expect(ownSignature.status, ownSignature.raw).toBe(200)
    expect(ownSignature.body['ran']).toBe(false)
    const personsChecklist = await checklist(personsId)
    expect(personsChecklist.signers.map(({ kind, id, why }) => ({ kind, id, why }))).toEqual(after.signers.map(({ kind, id, why }) => ({ kind, id, why })))
    expect(personsChecklist.notSigned.map((one) => one.id)).toEqual(after.notSigned.map((one) => one.id))
    expect(personsChecklist.state).toBe('waiting')
    expect(personsChecklist.outcome).toBeNull()
  })
})
