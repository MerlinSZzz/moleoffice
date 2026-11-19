// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MAY TAKE AN ENTRY OUT OF THE NOTEBOOK, ON A DECISION.
 *
 * THE RULING, item 5: the secretary may remove
 * an entry it wrote itself, and no confirmation from the owner is asked.
 *
 * tests/the-person-writes-first-in-the-notebook.test.ts already proves the refusal sides: the
 * secretary may not remove what the person entered, a stranger agent is refused, and the person may
 * take an entry out. What was not proved anywhere yet, and what this file adds:
 *
 *   - THE SECRETARY REMOVES ITS OWN, AND THE PROOF GOES INTO THE RECORD'S HISTORY: the reply says
 *     it (it reads the notebook back and the entry is gone from it), a read afterwards no longer
 *     holds the entry, and the removal has its own revision on the notebook record, with the
 *     entry's leaving named as a removal. There is no confirmation step anywhere in the exchange.
 *   - THE PERSON MAY REMOVE THE SECRETARY'S ENTRY. The two person-removal cases next door both
 *     removed an entry of the person's own; none removed the secretary's.
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
  entryKind: string
  text: string
}
interface Read {
  agent: string
  isThere: boolean
  recordId: string | null
  entries: Entry[]
}

/** The revisions route's answer: newest first, each with the paths that moved from the one before. */
interface Revisions {
  recordId: string
  count: number
  revisions: { seq: number; changed: { path: string; kind: string; before: string | null; after: string | null }[] | null }[]
}
interface OneRevision {
  seq: number
  content: { data: { entries?: Entry[] } | null }
}

async function add(
  headers: Record<string, string>,
  handle: string,
  body: Record<string, unknown>,
): Promise<{ status: number; read: Read | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/agents/${handle}/notebook/entries`,
    headers,
    payload: body,
  })
  return { status: reply.statusCode, read: reply.statusCode === 201 ? (reply.json() as Read) : null }
}

async function remove(
  headers: Record<string, string>,
  handle: string,
  entryId: string,
): Promise<{ status: number; body: string; read: Read | null }> {
  const reply = await app.inject({
    method: 'DELETE',
    url: `/api/agents/${handle}/notebook/entries/${entryId}`,
    headers,
  })
  return { status: reply.statusCode, body: reply.body, read: reply.statusCode === 200 ? (reply.json() as Read) : null }
}

async function read(headers: Record<string, string>, handle: string): Promise<Read> {
  const reply = await app.inject({ method: 'GET', url: `/api/agents/${handle}/notebook`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Read
}

let notebookId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const person = AS_THE_PERSON
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: person,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard() },
  })
  expect(started.statusCode, started.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ================================================ the secretary removes its own, unconfirmed

describe('the secretary removes its own entry', () => {
  it('answers 200 with the notebook already without it, and asks nothing and nobody', async () => {
    const written = await add(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, {
      entryKind: 'its-character',
      text: 'I would rather say I could not do a thing than guess at what would have happened.',
    })
    expect(written.status).toBe(201)
    const mine = written.read?.entries.find((one) => one.writtenByKind === 'agent')
    expect(mine, 'the entry was written as the agent’s own').toBeDefined()
    notebookId = String(written.read?.recordId)

    // ONE REQUEST, ONE REPLY. No confirmation step is asked of anybody: the DELETE itself answers
    // 200 and its own body already reads the notebook back without the entry.
    const said = await remove(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, String(mine?.id))
    expect(said.status, said.body).toBe(200)
    expect(said.read?.entries.some((one) => one.id === mine?.id)).toBe(false)
  })

  it('a read afterwards no longer holds it', async () => {
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(
      after.entries.every((one) => one.entryKind !== 'its-character'),
      'a fresh read still holds the entry the secretary removed',
    ).toBe(true)
  })

  it('the removal is on the notebook record\'s history', async () => {
    const listing = await app.inject({
      method: 'GET',
      url: `/api/records/${notebookId}/revisions`,
      headers: AS_THE_PERSON,
    })
    expect(listing.statusCode, listing.body).toBe(200)
    const said = listing.json() as Revisions
    // A WRITE WAS MADE: the entry POST wrote one revision, this DELETE wrote another, and the
    // newest one names the entries as what moved — the removal left a trace, as the decision's
    // revisit_when asks.
    expect(said.revisions[0]?.changed, 'the newest revision names what moved').not.toBeNull()
    expect(
      (said.revisions[0]?.changed ?? []).some((one) => one.kind === 'removed' && one.path.startsWith('data.entries')),
      'no revision records the entry being removed',
    ).toBe(true)
    const whole = await app.inject({
      method: 'GET',
      url: `/api/records/${notebookId}/revisions/${String(said.revisions[0]?.seq)}`,
      headers: AS_THE_PERSON,
    })
    expect(whole.statusCode, whole.body).toBe(200)
    const revision = whole.json() as OneRevision
    expect(revision.content.data?.entries ?? []).toHaveLength(0)
  })
})

// ================================================ the person may remove the secretary's entry

describe('the person takes the secretary\'s entry out', () => {
  it('and the rest of the notebook keeps what both wrote', async () => {
    const its = await add(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'a-summary', text: 'The notebook held both of us.' })
    expect(its.status).toBe(201)
    const mine = its.read?.entries.find((one) => one.writtenByKind === 'agent')
    expect(mine).toBeDefined()
    const theirs = await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'how-they-want-answers', text: 'Conclusion first.' })
    expect(theirs.status).toBe(201)
    const personEntry = theirs.read?.entries.find((one) => one.writtenByKind === 'person')
    expect(personEntry).toBeDefined()

    const said = await remove(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, String(mine?.id))
    expect(said.status, said.body).toBe(200)
    const after = await read(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.entries.some((one) => one.id === mine?.id), 'the person could not take the secretary\'s out').toBe(false)
    // AND NOTHING ELSE MOVED: the person's own entry is still there.
    expect(after.entries.some((one) => one.id === personEntry?.id)).toBe(true)
  })
})
