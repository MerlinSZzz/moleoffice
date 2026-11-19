// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE WHO WROTE A NOTE DOWN FOR THE PERSON IS TOLD WHERE IT STANDS: the end of round
 * 45.
 *
 * WHAT THIS FILE PROVES, over the real doors, with a secretary registered on its real card:
 *   1. a note the secretary prepares for the person brings the secretary one line saying it waits, and an ordinary
 *      note brings none; so does a note a later change makes wait;
 *   2. Confirm, Confirm all and "Not what I said" each bring the secretary one more line saying what the person did;
 *   3. a note the person makes for themselves tells nobody;
 *   4. the line's kind is `aNoteForThePerson`, and that kind wakes no waiter.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'kilns',
}
const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }

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

async function file(headers: Record<string, string>, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind: 'note', title, data })
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

interface ALine {
  title: string
  body: string
  saidInFull: string
  to: Array<{ kind: string; id: string }>
  sentBy: { kind: string; id: string }
}

/** Every line of the kind this round adds that names this note, in the order written. */
function linesAbout(note: string): ALine[] {
  const rows = t.client.sqlite
    .prepare(
      `SELECT title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'aNoteForThePerson'
       AND json_extract(data, '$.saidInFull') LIKE ? ORDER BY rowid`,
    )
    .all(`%${note}%`) as Array<{ title: string; data: string }>
  return rows.map((row) => ({ title: row.title, ...(JSON.parse(row.data) as Omit<ALine, 'title'>) }))
}

/** Quill's id in the registry, which a message stores in place of the handle it was addressed by. */
let quill = ''
const toQuill = (line: ALine): boolean => line.to.length === 1 && line.to[0]?.kind === 'agent' && line.to[0]?.id === quill

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const made = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id: 'kilns', title: 'Kilns' })
  expect(made.status, made.said).toBe(201)
  const card = (JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation
    .onlyThisCardCanHoldIt
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: card })
  expect(started.status, started.said).toBe(201)
  quill = String((started.body['agent'] as { id: string }).id)
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the line that a note waits', () => {
  it('goes to the secretary who prepared the note, once, from Mole Office', async () => {
    const id = await file(AS_QUILL, 'About the kiln', { body: 'Fire it on Friday.', for_the_person_to_file: true })
    const lines = linesAbout(id)
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line?.body).toBe('Your note waits for the person')
    expect(line?.saidInFull).toBe(`Your note ${id} ("About the kiln") waits for the person to confirm, on the page "Words for you to confirm".`)
    expect(line !== undefined && toQuill(line)).toBe(true)
    expect(line?.sentBy).toEqual(moleOffice())
  })

  it('is not sent for an ordinary note, and is sent when a change makes a note wait', async () => {
    const id = await file(AS_QUILL, 'Shelf sizes', { body: 'The shelves are 40 by 50.' })
    expect(linesAbout(id)).toHaveLength(0)
    const changed = await ask('PATCH', `/api/records/${id}`, AS_QUILL, { dataPatch: { for_the_person_to_file: true } })
    expect(changed.status, changed.said).toBe(200)
    expect(linesAbout(id).map((line) => line.body)).toEqual(['Your note waits for the person'])
    const again = await ask('PATCH', `/api/records/${id}`, AS_QUILL, { title: 'Shelf sizes, again' })
    expect(again.status, again.said).toBe(200)
    expect(linesAbout(id)).toHaveLength(1)
  })

  it('is not sent for a note the person writes down for themselves', async () => {
    const id = await file(AS_THE_PERSON, 'My own', { body: 'Buy clay.', for_the_person_to_file: true })
    expect(linesAbout(id)).toHaveLength(0)
  })
})

describe('the line that the person answered', () => {
  it('says the person confirmed, and names their own note', async () => {
    const id = await file(AS_QUILL, 'About the glaze', { body: 'Use the blue glaze.', for_the_person_to_file: true })
    const pressed = await ask('POST', `/api/records/${id}/file-as-my-words`, AS_THE_PERSON)
    expect(pressed.status, pressed.said).toBe(200)
    const theirs = String((pressed.body['note'] as { id: string }).id)
    const lines = linesAbout(id)
    expect(lines.map((line) => line.body)).toEqual(['Your note waits for the person', 'The person confirmed your note'])
    expect(lines[1]?.saidInFull).toBe(
      `The person confirmed your note ${id} ("About the glaze"). Their words are stored as their own note ${theirs}.`,
    )
    expect(lines.every(toQuill)).toBe(true)
  })

  it('says it once for each note Confirm all files', async () => {
    const a = await file(AS_QUILL, 'About the door', { body: 'Fix the latch.', for_the_person_to_file: true })
    const b = await file(AS_QUILL, 'About the shelf', { body: 'Move the shelf.', for_the_person_to_file: true })
    const pressed = await ask('POST', '/api/the-persons-words/confirm-all', AS_THE_PERSON, { ids: [a, b] })
    expect(pressed.status, pressed.said).toBe(200)
    for (const id of [a, b]) expect(linesAbout(id).map((line) => line.body)).toEqual(['Your note waits for the person', 'The person confirmed your note'])
  })

  it('says the person said it is not what they said', async () => {
    const id = await file(AS_QUILL, 'About the chimney', { body: 'Raise the chimney.', for_the_person_to_file: true })
    const pressed = await ask('POST', `/api/records/${id}/not-what-i-said`, AS_THE_PERSON)
    expect(pressed.status, pressed.said).toBe(200)
    const lines = linesAbout(id)
    expect(lines.map((line) => line.body)).toEqual(['Your note waits for the person', 'The person said your note is not what they said'])
    expect(lines[1]?.saidInFull).toBe(
      `The person said your note ${id} ("About the chimney") is not what they said. Your note is kept with that mark, and nothing was stored as their words.`,
    )
  })
})

describe('the kind of the line', () => {
  it('wakes no waiter', async () => {
    // READ AFTER THE TEST'S OWN DATABASE IS OPEN: the notices table imports the server's database client.
    const { NOTICES, whyThisWakesNoWaiter } = await import('../src/server/lib/notices.ts')
    expect(NOTICES.aNoteForThePerson.wakes).toBe(false)
    expect(whyThisWakesNoWaiter(moleOffice(), 'aNoteForThePerson')).not.toBeNull()
  })
})
