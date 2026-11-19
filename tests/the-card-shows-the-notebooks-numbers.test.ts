// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION N3: the role card shows the notebook's statistics, drawn from the record.
 *
 * The notebook's statistics are to be seen on the role card.
 *
 * The five numbers are: how many entries, how many by the person, how many by the secretary,
 * when last written and by whom, how many the person changed. They are on the secretary's card in
 * both places a card is drawn: its own citizen page (GET /api/participants/agent/<handle>/profile)
 * and the Role cards page (GET /api/roles).
 *
 * WHAT THE MUTATION IS, and it is the one the brief names: make the card draw from a SECOND COPY
 * instead of counting the record. A stored count and the entries are two accounts of one fact, and
 * the moment they disagree the card is the one a reader believes. So the case that matters is not
 * "the numbers are right once" — it is "the numbers move when the notebook does", and a second copy
 * fails exactly that.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theNotebookNumbersSay, type NotebookOnACard, type NotebookStatistics } from '../src/shared/notebook.ts'
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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The notebook block on the citizen page's card, or null when the card carries none. */
async function onTheCitizenPage(handle: string): Promise<NotebookOnACard | null> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}/profile`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { theCardTheyHold: { notebook: NotebookOnACard | null } | null }
  return said.theCardTheyHold === null ? null : said.theCardTheyHold.notebook
}

/** The notebook block for one agent on the Role cards page, or null when it carries none. */
async function onTheRoleCardsPage(handle: string): Promise<NotebookOnACard | null> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { notebooks: NotebookOnACard[] }
  return said.notebooks.find((one) => one.agent === handle) ?? null
}

async function add(headers: Record<string, string>, handle: string, body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/agents/${handle}/notebook/entries`,
    headers,
    payload: body,
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const said = reply.json() as { entries: { id: string; text: string }[] }
  return String(said.entries.find((one) => one.text === body['text'])?.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard() })
  await register(AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. on both cards

describe('the notebook’s numbers are on the secretary’s card in both places', () => {
  it('says nobody has written one rather than showing zeroes', async () => {
    const here = await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle)
    const there = await onTheRoleCardsPage(THE_TEST_OFFICES_SECRETARY.handle)
    expect(here?.isThere, 'the card knows there is no notebook').toBe(false)
    expect(here?.statistics, 'no notebook means no numbers, not zeroes').toBeNull()
    expect(there?.isThere).toBe(false)
    expect(there?.statistics).toBeNull()
  })

  it('carries the owner\'s five numbers once a notebook exists', async () => {
    await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'how-they-want-answers', text: 'Conclusion first.' })
    await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'the-persons-preferences', text: 'The person reads Chinese first.' })
    await add(asAgent(THE_TEST_OFFICES_SECRETARY.handle), THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'its-character', text: 'I say what stopped me.' })

    const here = await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle)
    expect(here?.isThere).toBe(true)
    const stats = here?.statistics as NotebookStatistics
    expect(stats.entries).toBe(3)
    expect(stats.byThePerson).toBe(2)
    expect(stats.byTheSecretary).toBe(1)
    expect(stats.lastWritten?.byId).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(stats.changedByThePerson).toBe(0)

    // THE FIVE LINES A CARD DRAWS, from the one place they are written.
    const drawn = theNotebookNumbersSay(here as NotebookOnACard).map((one) => one.says)
    expect(drawn).toEqual(['Entries', 'By the person', `By ${THE_TEST_OFFICES_SECRETARY.handle}`, 'Last written', 'Changed by the person'])
  })

  it('says the same thing on the Role cards page, for every agent holding the card', async () => {
    const here = await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle)
    const there = await onTheRoleCardsPage(THE_TEST_OFFICES_SECRETARY.handle)
    expect(there?.statistics).toEqual(here?.statistics)

    // AND EVERY HOLDER IS ON IT, not only the one with a notebook: the owner may have more than one secretary.
    const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
    const said = reply.json() as { notebooks: NotebookOnACard[]; elevation: { couldHoldIt: string[] } }
    expect(said.notebooks.map((one) => one.agent).sort()).toEqual([...said.elevation.couldHoldIt].sort())
    expect(said.notebooks.find((one) => one.agent === 'quill')?.isThere, 'Quill holds the card and has none').toBe(false)
  })

  it('carries no notebook at all on a card that is not the secretary’s', async () => {
    expect(await onTheCitizenPage('builder-one'), 'a worker’s card has no notebook block').toBeNull()
    expect(await onTheRoleCardsPage('builder-one')).toBeNull()
  })
})

// ============================================================ 2. drawn from the record

describe('the numbers are counted from the record and not from a second copy', () => {
  it('moves on both cards when an entry is added', async () => {
    const before = (await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics
    await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'a-summary', text: 'The notebook was built today.' })

    const after = (await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics
    expect(after.entries, 'the citizen page’s card did not move').toBe(before.entries + 1)
    expect(after.byThePerson).toBe(before.byThePerson + 1)

    const there = (await onTheRoleCardsPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics
    expect(there.entries, 'the Role cards page did not move').toBe(after.entries)
    expect(there, 'the two cards disagree about one notebook').toEqual(after)
  })

  it('moves when the person changes an entry, and when one is taken out', async () => {
    const id = await add(AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, { entryKind: 'the-persons-to-do', text: 'Appointing a secretary is mine.' })
    const before = (await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics

    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${THE_TEST_OFFICES_SECRETARY.handle}/notebook/entries/${id}`,
      headers: AS_THE_PERSON,
      payload: { text: 'Appointing a secretary is mine alone.' },
    })
    expect(changed.statusCode, changed.body).toBe(200)
    const afterChange = (await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics
    expect(afterChange.changedByThePerson, 'the changed count did not move').toBe(before.changedByThePerson + 1)
    expect(afterChange.entries, 'a change is not a new entry').toBe(before.entries)

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${THE_TEST_OFFICES_SECRETARY.handle}/notebook/entries/${id}`,
      headers: AS_THE_PERSON,
    })
    expect(removed.statusCode, removed.body).toBe(200)
    const afterRemove = (await onTheCitizenPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics as NotebookStatistics
    expect(afterRemove.entries, 'the entry count did not come back down').toBe(before.entries - 1)
    expect(afterRemove.changedByThePerson).toBe(before.changedByThePerson)

    // AND THE OTHER CARD FOLLOWED, because both are counting the same record.
    expect((await onTheRoleCardsPage(THE_TEST_OFFICES_SECRETARY.handle))?.statistics).toEqual(afterRemove)
  })

  it('keeps no count anywhere on the record itself', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/records?kind=notebook&shape=full', headers: AS_THE_PERSON })
    const rows = (reply.json() as { records: { data: Record<string, unknown> }[] }).records
    const mine = rows.find((row) => row.data['agentHandle'] === THE_TEST_OFFICES_SECRETARY.handle)
    expect(mine, 'the notebook is there').toBeDefined()
    // WHAT IS STORED IS THE ENTRIES AND THE HANDLE, and nothing that would have to be kept in step.
    expect(Object.keys(mine?.data ?? {}).sort()).toEqual(['agentHandle', 'entries'])
  })
})
