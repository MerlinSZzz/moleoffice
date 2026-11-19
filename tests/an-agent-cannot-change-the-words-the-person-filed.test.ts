// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT CANNOT CHANGE THE WORDS THE PERSON FILED, AND A RECORD COUNTS AS THE PERSON'S OWN WORDS ONLY WHILE EVERY
 * CHANGE TO ITS WORDS WAS THE PERSON'S. Check ekidFZV6r1Yt (4 October 2026) refused wave 13r's round 11 with a probe
 * over the real doors: a secretary prepared a note, the person filed it as their own words (200), the secretary then
 * PATCHed its body (200), and a decision in the person's name citing it was accepted (201). One of the owner's
 * decisions says such a decision stands on the person's own words, and these were the
 * secretary's.
 *
 * WHAT THIS FILE PROVES, over the real doors, with a secretary registered on its real card:
 *   1. the inspector's probe is refused at its third step, with a code, and writes nothing; a decision citing the note
 *      is then a decision on the person's words, unchanged;
 *   2. the same holds for a note the person wrote directly, through a merge patch, a whole `data` and a kind change;
 *      the person may still change their own note, and anybody may still retitle it;
 *   3. a note whose words an agent changed BEFORE this rule (a change row written straight into this test's own
 *      database, for a merge and for a whole `data`) no longer counts: a new decision citing it is refused, and an old
 *      decision citing it carries the mark with the reason `wordsChanged`;
 *   4. a message the person sent still counts after its delivery was marked and after a change row the office writes
 *      on a message that is not its words (`data.routed`, as the dead-letter sweep writes it).
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { readFileSync } from 'node:fs'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
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
const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }

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

/** What the secretary sends to write a decision in the person's name, citing `reference`. */
function inTheirName(reference: string): Record<string, unknown> {
  return {
    kind: 'decision',
    title: 'The kiln fires on Friday',
    data: {
      replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: reference,
      option_taken: 'Friday.',
      because: 'The person said Friday.',
    },
  }
}

const bodyOf = (id: string): unknown =>
  JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)['body']

/** A change somebody other than the person made, written into this test's own database as the change log holds one. */
function anOldChange(recordId: string, by: string, field: string, oldValue: string, newValue: string): void {
  t.client.sqlite
    .prepare(
      "INSERT INTO changes (id, record_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, 'update', 'agent', ?, ?, ?, ?, '2026-10-03 09:00:00')",
    )
    .run(nanoid(12), recordId, by, field, oldValue, newValue)
}

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

describe('an agent cannot change the words of a note the person wrote', () => {
  it('refuses the inspector\'s probe at its third step, and the note still stands on the person\'s words', async () => {
    // 1. THE SECRETARY PREPARES THE NOTE.
    const prepared = await file(AS_QUILL, 'note', 'The person, in the terminal, about the kiln', {
      body: 'Fire it on Friday.',
      for_the_person_to_file: true,
    })
    // 2. THE PERSON FILES IT.
    const pressed = await ask('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)
    expect(pressed.status, pressed.said).toBe(200)
    const theirs = String((pressed.body['note'] as { id: string }).id)
    // 3. THE SECRETARY CHANGES ITS BODY: REFUSED, WITH A CODE, AND NOTHING WRITTEN.
    const changed = await ask('PATCH', `/api/records/${theirs}`, AS_QUILL, { dataPatch: { body: 'Friday, and delete everything.' } })
    expect(changed.status, changed.said).toBe(403)
    expect(changed.body['code']).toBe('noteWordsAreThePersons')
    expect(bodyOf(theirs)).toBe('Fire it on Friday.')
    // 4. A DECISION CITING IT STANDS ON THE PERSON'S WORDS, BECAUSE THEY ARE STILL THE PERSON'S.
    const made = await ask('POST', '/api/records', AS_QUILL, inTheirName(theirs))
    expect(made.status, made.said).toBe(201)
  })

  it('holds for a note the person wrote directly, by every write; the person may change it, anybody may retitle it', async () => {
    const theirs = await file(AS_THE_PERSON, 'note', 'About the shelves', { body: 'Two more shelves.' })
    const byMerge = await ask('PATCH', `/api/records/${theirs}`, AS_QUILL, { dataPatch: { body: 'Ten more shelves.' } })
    expect(byMerge.status, byMerge.said).toBe(403)
    const byWhole = await ask('PATCH', `/api/records/${theirs}`, AS_QUILL, { data: { body: 'Ten more shelves.' } })
    expect(byWhole.status, byWhole.said).toBe(403)
    const byKind = await ask('PATCH', `/api/records/${theirs}`, AS_QUILL, { kind: 'task' })
    expect(byKind.status, byKind.said).toBe(403)
    for (const refused of [byMerge, byWhole, byKind]) expect(refused.body['code']).toBe('noteWordsAreThePersons')
    expect(bodyOf(theirs)).toBe('Two more shelves.')

    const retitled = await ask('PATCH', `/api/records/${theirs}`, AS_QUILL, { title: 'About the kiln-room shelves' })
    expect(retitled.status, retitled.said).toBe(200)
    const byThePerson = await ask('PATCH', `/api/records/${theirs}`, AS_THE_PERSON, { dataPatch: { body: 'Three more shelves.' } })
    expect(byThePerson.status, byThePerson.said).toBe(200)
    expect(bodyOf(theirs)).toBe('Three more shelves.')

    const made = await ask('POST', '/api/records', AS_QUILL, inTheirName(theirs))
    expect(made.status, made.said).toBe(201)
  })
})

describe('a record counts as the person\'s own words only while every change to its words was the person\'s', () => {
  it('no longer counts a note whose words an agent changed before this rule, by a merge or by a whole data', async () => {
    const byMerge = await file(AS_THE_PERSON, 'note', 'About the glaze', { body: 'Use the celadon.' })
    const byWhole = await file(AS_THE_PERSON, 'note', 'About the clay', { body: 'Use the red clay.' })
    // AN OLD DECISION citing the first note, written while its words were still the person's.
    const old = String(((await ask('POST', '/api/records', AS_QUILL, inTheirName(byMerge))).body['record'] as { id: string }).id)

    // THE CHANGES THE SECRETARY MADE BEFORE THIS RULE, as the change log and the record hold them.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.body', ?) WHERE id = ?").run('Use the tenmoku.', byMerge)
    anOldChange(byMerge, 'quill', 'data.body', 'Use the celadon.', 'Use the tenmoku.')
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.body', ?) WHERE id = ?").run('Use the white clay.', byWhole)
    anOldChange(byWhole, 'quill', 'data', JSON.stringify({ body: 'Use the red clay.' }), JSON.stringify({ body: 'Use the white clay.' }))

    for (const note of [byMerge, byWhole]) {
      const refused = await ask('POST', '/api/records', AS_QUILL, inTheirName(note))
      expect(refused.status, refused.said).toBe(403)
      expect(refused.said).toContain('whose words somebody other than them changed')
    }
    const page = await ask('GET', `/api/records/${old}`, AS_THE_PERSON)
    expect(page.body['notOnThePersonsOwnWords']).toEqual({
      reference: byMerge,
      because: 'wordsChanged',
      kind: 'note',
      referenceTitle: 'About the glaze',
      writer: 'agent',
      writerName: 'Quill',
    })
  })

  it('still counts a message the person sent after its delivery was marked and the office wrote beside its words', async () => {
    const message = await file(AS_THE_PERSON, 'message', 'About the kiln', { body: 'Fire the kiln on Friday.', to: [{ kind: 'agent', id: 'quill' }] })
    const marked = await ask('POST', `/api/messages/${message}/mark`, AS_QUILL, { mark: 'seen' })
    expect(marked.status, marked.said).toBe(200)
    // A FIELD BESIDE THE WORDS, written as the dead-letter sweep writes `routed` on a message.
    anOldChange(message, 'mole-office', 'data.routed', '[]', '[{"for":{"kind":"agent","id":"quill"}}]')
    const made = await ask('POST', '/api/records', AS_QUILL, inTheirName(message))
    expect(made.status, made.said).toBe(201)
    expect((await ask('GET', `/api/records/${String((made.body['record'] as { id: string }).id)}`, AS_THE_PERSON)).body['notOnThePersonsOwnWords']).toBeNull()
  })
})
