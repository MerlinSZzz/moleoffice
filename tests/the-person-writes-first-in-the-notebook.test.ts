// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION N2: the first entry is the person's, and the person can always read and change it.
 *
 * A person can review and change this notebook too. The idea: at the start a person puts some content in
 * it (or tells the secretary their preferences), and as the project grows the secretary records preferences.
 *
 * WHAT THIS FILE HOLDS UP, and the mutation that proves it:
 *
 *   - the person adds an entry, and Mole Office writes who and when — not the body;
 *   - the secretary adds one in its own name;
 *   - any other agent is refused, and the refusal says whose notebook it is;
 *   - the person may change any entry: the original writer is KEPT and the change is recorded
 *     with when;
 *   - the secretary may NOT change the person's entries
 *     — MUTATION: let the secretary edit the person's entries;
 *   - the secretary may change its own;
 *   - the person may remove any entry, including the secretary's;
 *   - the secretary may remove its own — CRITERION N5, a decision: the secretary may remove and
 *     change its own entries
 *     — MUTATION: let the DELETE door narrow only by handle and not by who wrote the entry, so the
 *       secretary can remove the person's words too;
 *   - the secretary may NOT remove the person's entries;
 *   - a stranger agent is refused removing anything, and the refusal says whose notebook it is;
 *   - the read hands them back newest first with the numbers already counted.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

interface Entry {
  id: string
  writtenByKind: string
  writtenById: string
  at: string
  entryKind: string
  text: string
  changedByThePerson?: { at: string }
}
interface Read {
  agent: string
  isThere: boolean
  entries: Entry[]
  statistics: { entries: number; byThePerson: number; byTheSecretary: number; changedByThePerson: number } | null
}

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function add(
  headers: Record<string, string>,
  handle: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string; read: Read | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/agents/${handle}/notebook/entries`,
    headers,
    payload: body,
  })
  return {
    status: reply.statusCode,
    body: reply.body,
    read: reply.statusCode === 201 ? (reply.json() as Read) : null,
  }
}

async function change(
  headers: Record<string, string>,
  handle: string,
  entryId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string; read: Read | null }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/agents/${handle}/notebook/entries/${entryId}`,
    headers,
    payload: body,
  })
  return {
    status: reply.statusCode,
    body: reply.body,
    read: reply.statusCode === 200 ? (reply.json() as Read) : null,
  }
}

async function remove(
  headers: Record<string, string>,
  handle: string,
  entryId: string,
): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'DELETE',
    url: `/api/agents/${handle}/notebook/entries/${entryId}`,
    headers,
  })
  return { status: reply.statusCode, body: reply.body }
}

async function read(headers: Record<string, string>, handle: string): Promise<Read> {
  const reply = await app.inject({ method: 'GET', url: `/api/agents/${handle}/notebook`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Read
}

/** The person's entry, written first, and the one the secretary wrote after it. */
let theirs = ''
let its = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard() })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the person writes first

describe('the person writes first', () => {
  it('writes who wrote it and when, and does not read either from the body', async () => {
    const said = await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, {
      entryKind: 'how-they-want-answers',
      text: 'Conclusion first. Chinese in the terminal when the answer is long.',
    })
    expect(said.status, said.body).toBe(201)
    const entry = said.read?.entries[0]
    expect(entry?.writtenByKind).toBe('person')
    expect(entry?.writtenById).toBe(THE_PERSON)
    expect(entry?.at, 'Mole Office stamped it').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    theirs = String(entry?.id)
  })

  it('refuses a body that tries to send the writer or the time', async () => {
    const said = await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, {
      entryKind: 'a-summary',
      text: 'Anything.',
      writtenByKind: 'agent',
      at: '2020-01-01 00:00:00',
    })
    expect(said.status, said.body).toBe(400)
  })
})

// ============================================================ 2. the secretary writes its own

describe('the secretary writes in its own name', () => {
  it('files an entry of its own, marked as the agent’s', async () => {
    const said = await add(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, {
      entryKind: 'its-character',
      text: 'I would rather say I could not do a thing than describe what would probably have happened.',
    })
    expect(said.status, said.body).toBe(201)
    const mine = said.read?.entries.find((one) => one.entryKind === 'its-character')
    expect(mine?.writtenByKind).toBe('agent')
    expect(mine?.writtenById).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    its = String(mine?.id)
  })

  it('refuses every other agent, and says whose notebook it is', async () => {
    const said = await add(asAgent('builder-one'), THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'a-summary', text: 'I was here.' })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.body).toContain('not the person')
  })
})

// ============================================================ 3. the person may change any of it

describe('the person can change any entry', () => {
  it('keeps who wrote the original and records that the person changed it, with when', async () => {
    const said = await change(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, its, {
      text: 'I would rather say I could not do a thing than guess at what would have happened.',
    })
    expect(said.status, said.body).toBe(200)
    const after = said.read?.entries.find((one) => one.id === its)
    // WHO WROTE IT IS UNTOUCHED. This is the half of the criterion that is easy to get wrong: an
    // edit that moved the writer would make the person the author of the agent's own words.
    expect(after?.writtenByKind).toBe('agent')
    expect(after?.writtenById).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(after?.text).toContain('guess at what would have happened')
    expect(after?.changedByThePerson?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('changes an entry’s kind as well as its words', async () => {
    const said = await change(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, theirs, { entryKind: 'the-persons-preferences' })
    expect(said.status, said.body).toBe(200)
    expect(said.read?.entries.find((one) => one.id === theirs)?.entryKind).toBe('the-persons-preferences')
    await change(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, theirs, { entryKind: 'how-they-want-answers' })
  })
})

// ============================================================ 4. what the secretary may not do

describe('the secretary may not change what the person wrote', () => {
  it('refuses it, and says to write its own entry instead', async () => {
    const said = await change(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, theirs, { text: 'Answer however you like.' })
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain('written by the person')
    expect(said.body).toContain('Write your own entry')

    // AND NOTHING MOVED. A refusal that had already written would be worse than one that had not.
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries.find((one) => one.id === theirs)?.text).toContain('Conclusion first')
  })

  it('may change its own', async () => {
    const said = await change(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, its, { text: 'I say what stopped me.' })
    expect(said.status, said.body).toBe(200)
    const after = said.read?.entries.find((one) => one.id === its)
    expect(after?.text).toBe('I say what stopped me.')
    // AND AN EDIT BY THE AGENT DOES NOT CLAIM THE PERSON MADE IT. The mark stays where the person's
    // own edit put it, and the agent's edit is on the record's revisions.
    expect(after?.changedByThePerson).toBeDefined()
  })
})

// ============================================================ 5. removing: the person's, and the secretary's own

describe('taking an entry out', () => {
  it('refuses a stranger agent, and says whose notebook it is', async () => {
    const said = await remove(asAgent('builder-one'), THE_TEST_OFFICES_SECRETARY.handle, its)
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.body).toContain('not the person')

    // AND NOTHING MOVED.
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries.some((one) => one.id === its)).toBe(true)
  })

  it('refuses the secretary taking out what the person wrote — CRITERION N5', async () => {
    const said = await remove(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, theirs)
    expect(said.status, said.body).toBe(403)
    expect(said.body).toContain('written by the person')

    // AND NOTHING MOVED. The person's entries stay the person's.
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries.some((one) => one.id === theirs)).toBe(true)
  })

  it('lets the secretary remove its own — CRITERION N5, the owner\'s decision of 11 September 2026: 秘书可以删除，可以修改', async () => {
    const said = await remove(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, its)
    expect(said.status, said.body).toBe(200)
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries.some((one) => one.id === its)).toBe(false)
  })

  it('lets the person take one out, and the rest stay', async () => {
    const before = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    const spare = await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'a-summary', text: 'Written to be removed.' })
    const id = String(spare.read?.entries.find((one) => one.text === 'Written to be removed.')?.id)
    const said = await remove(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, id)
    expect(said.status, said.body).toBe(200)
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries).toHaveLength(before.entries.length)
    expect(after.entries.some((one) => one.id === id)).toBe(false)
  })
})

// ============================================================ 6. the read

describe('the notebook reads back newest first with its numbers', () => {
  it('counts what is there and says who wrote last', async () => {
    const said = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.isThere).toBe(true)
    expect(said.statistics?.entries).toBe(said.entries.length)
    expect((said.statistics?.byThePerson ?? 0) + (said.statistics?.byTheSecretary ?? 0)).toBe(said.entries.length)
    expect(said.statistics?.changedByThePerson).toBeGreaterThan(0)
    for (let i = 1; i < said.entries.length; i += 1) {
      expect(String(said.entries[i - 1]?.at) >= String(said.entries[i]?.at), 'newest first').toBe(true)
    }
  })

  it('says nobody has written one for an agent that has none', async () => {
    const said = await read(AS_THE_PERSON, 'builder-one')
    expect(said.isThere).toBe(false)
    expect(said.entries).toHaveLength(0)
    expect(said.statistics).toBeNull()
  })
})
