// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION IN THE PERSON'S NAME STANDS ON THE PERSON'S OWN WORDS. Option C on
 * problem bXW3UpEsrsoZ.
 *
 * Until now `assertMayDecide` let an agent write a decision with `decided_by` "the owner" when its
 * `authority_reference` named any live record, so a secretary could cite a note it wrote itself. Now the record must be
 * the person's own: a message they sent, a report holding an answer they gave, a proposal they settled by pressing, or
 * a record they wrote, which includes a note filed by their own press on "File as my words". Old decisions are not
 * changed; each one in the person's name whose reference is not theirs carries a mark.
 *
 * WHAT THIS FILE PROVES, over the real doors, with agents registered on real cards:
 *   1. citing a note an agent wrote is refused, and nothing is written;
 *   2. citing a message the person sent passes;
 *   3. citing a proposal the person settled by pressing passes;
 *   4. an old decision that cites a note an agent wrote carries the mark, on its own page and on the Decisions list;
 *   5. the person-only door refuses an agent, and the person's press files the words as a note of their own, which a
 *      decision may then cite.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
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

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind, title, data })
  expect(made.status, made.said).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String((made.body['record'] as { id: string }).id)
}

/** What a secretary sends to write a decision in the person's name, citing `reference`. */
function inTheirName(reference: string): Record<string, unknown> {
  return {
    kind: 'decision',
    title: 'The kiln fires on Friday',
    data: {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: reference,
      option_taken: 'Friday.',
      because: 'The person said Friday.',
    },
  }
}

const decisionCount = (): number =>
  (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'decision' AND deleted_at IS NULL").get() as { n: number }).n

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  expect(started.status, started.said).toBe(201)
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('a new decision in the person\'s name cites the person\'s own words', () => {
  it('refuses one citing a note an agent wrote, and writes nothing', async () => {
    const note = await file(asAgent('quill'), 'note', 'What the person said about the kiln', { body: 'Friday, said the person.' })
    const before = decisionCount()
    const refused = await ask('POST', '/api/records', asAgent('quill'), inTheirName(note))
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('somebody other than them wrote')
    expect(refused.said).toContain('File as my words')
    expect(decisionCount()).toBe(before)
  })

  it('passes one citing a message the person sent', async () => {
    const message = await file(AS_THE_PERSON, 'message', 'About the kiln', {
      body: 'Fire the kiln on Friday.',
      to: [{ kind: 'agent', id: 'quill' }],
    })
    const made = await ask('POST', '/api/records', asAgent('quill'), inTheirName(message))
    expect(made.status, made.said).toBe(201)
  })

  it('passes one citing a proposal the person settled by pressing', async () => {
    const fork = await file(asAgent('quill'), 'proposal', 'Which day for the kiln?', {
      question: 'Which day does the kiln fire?',
      options: ['Friday', 'Monday'],
      because: 'The kiln is booked twice.',
      who_settles_it: 'the owner',
    })
    const pressed = await ask('POST', `/api/records/${fork}/promote`, AS_THE_PERSON, {
      title: 'Friday',
      data: { replaces: [], option_taken: 'Friday', because: 'Friday suits.' },
    })
    expect(pressed.status, pressed.said).toBe(201)
    const made = await ask('POST', '/api/records', asAgent('quill'), inTheirName(fork))
    expect(made.status, made.said).toBe(201)
  })
})

describe('an old decision that does not stand on the person\'s own words carries the mark', () => {
  it('marks one citing a note an agent wrote, on its own page and on the Decisions list', async () => {
    // AN OLD DECISION, made as one was made before this rule: written by an agent, then given a reference an agent's
    // note holds. The database is changed directly because the door now refuses that write.
    const message = await file(AS_THE_PERSON, 'message', 'About the glaze', { body: 'Use the celadon.', to: [{ kind: 'agent', id: 'quill' }] })
    const decision = String(((await ask('POST', '/api/records', asAgent('quill'), inTheirName(message))).body['record'] as { id: string }).id)
    const note = await file(asAgent('quill'), 'note', 'The glaze, as the secretary wrote it down', { body: 'Celadon.' })
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.authority_reference', ?) WHERE id = ?").run(note, decision)

    const page = await ask('GET', `/api/records/${decision}`, AS_THE_PERSON)
    expect(page.status, page.said).toBe(200)
    expect(page.body['notOnThePersonsOwnWords']).toEqual({
      reference: note,
      because: 'notTheirs',
      kind: 'note',
      referenceTitle: 'The glaze, as the secretary wrote it down',
      writer: 'agent',
      writerName: 'Quill',
    })

    const listed = await ask('GET', '/api/forks', AS_THE_PERSON)
    const row = (listed.body['decisions'] as { recordId: string; notOnThePersonsOwnWords: unknown }[]).find((one) => one.recordId === decision)
    expect(row?.notOnThePersonsOwnWords).toEqual({
      reference: note,
      because: 'notTheirs',
      kind: 'note',
      referenceTitle: 'The glaze, as the secretary wrote it down',
      writer: 'agent',
      writerName: 'Quill',
    })

    // A DECISION STANDING ON THE PERSON'S MESSAGE CARRIES NO MARK.
    const fine = String(((await ask('POST', '/api/records', asAgent('quill'), inTheirName(message))).body['record'] as { id: string }).id)
    expect((await ask('GET', `/api/records/${fine}`, AS_THE_PERSON)).body['notOnThePersonsOwnWords']).toBeNull()
  })
})

describe('words said elsewhere go in through a door only the person can use', () => {
  it('refuses an agent, files the words as the person\'s own on the person\'s press, and a decision may cite them', async () => {
    const prepared = await file(asAgent('quill'), 'note', 'The person, in the terminal, about the kiln', {
      body: 'Fire it on Friday, not Monday.',
      for_the_person_to_file: true,
    })
    const byTheAgent = await ask('POST', `/api/records/${prepared}/file-as-my-words`, asAgent('quill'))
    expect(byTheAgent.status, byTheAgent.said).toBe(403)
    expect((await ask('GET', `/api/records/${prepared}`, AS_THE_PERSON)).body['filedAsThePersonsWords']).toBeNull()

    const pressed = await ask('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)
    expect(pressed.status, pressed.said).toBe(200)
    const theirs = pressed.body['note'] as { id: string; data: Record<string, unknown> }
    expect(theirs.data['body']).toBe('Fire it on Friday, not Monday.')
    expect(theirs.data['filed_from']).toBe(prepared)
    expect((await ask('GET', `/api/records/${prepared}`, AS_THE_PERSON)).body['filedAsThePersonsWords']).toMatchObject({ id: theirs.id })

    // ONCE ONLY.
    expect((await ask('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)).status).toBe(409)

    // THE PREPARED NOTE IS STILL THE SECRETARY'S AND IS REFUSED; THE FILED ONE IS THE PERSON'S AND PASSES.
    expect((await ask('POST', '/api/records', asAgent('quill'), inTheirName(prepared))).status).toBe(403)
    const made = await ask('POST', '/api/records', asAgent('quill'), inTheirName(theirs.id))
    expect(made.status, made.said).toBe(201)
  })
})
