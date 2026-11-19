// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON CONFIRMS THEIR OWN WORDS ON ONE PAGE: the doors under look A.
 *
 * WHAT THIS FILE PROVES, over the real doors, with a secretary registered on its real card:
 *   1. GET /api/the-persons-words lists the notes still waiting, from every project, oldest first, with the words
 *      exactly as stored, the project's name and who prepared each; a note filed, a note marked and an ordinary note
 *      are not on it; `limit` and `offset` page it without a note shown twice or skipped;
 *   2. "Not what I said" is the person's alone: an agent is refused and nothing is written; the person's press keeps
 *      the note with its words and marks it, and the note then cannot be filed or marked again;
 *   3. only the person may write, change or take off that mark, through a create, a merge patch or a whole `data`;
 *   4. "Confirm all" is the person's alone, checks every note before filing any, and files each one as the press on one
 *      note does.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
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
const IN_KILNS = { 'x-mole-office-workspace': 'kilns' }
const IN_GARDEN = { 'x-mole-office-workspace': 'garden' }

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

async function file(headers: Record<string, string>, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind: 'note', title, data })
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

/** A note the secretary prepares for the person, in one project. */
const prepare = (where: Record<string, string>, title: string, body: string): Promise<string> =>
  file({ ...AS_QUILL, ...where }, title, { body, for_the_person_to_file: true })

interface Waiting {
  notes: Array<{ id: string; workspaceId: string; project: string | null; body: string | null; preparedBy: { type: string; name: string | null } | null }>
  total: number
}

async function waiting(query = ''): Promise<Waiting> {
  const read = await ask('GET', `/api/the-persons-words${query}`, AS_QUILL)
  expect(read.status, read.said).toBe(200)
  return read.body as unknown as Waiting
}

const rowCount = (): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n
const changeCount = (): number => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
const dataOf = (id: string): Record<string, unknown> =>
  JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
const deletedAt = (id: string): unknown =>
  (t.client.sqlite.prepare('SELECT deleted_at AS d FROM records WHERE id = ?').get(id) as { d: unknown }).d

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  for (const [id, title] of [
    ['kilns', 'Kilns'],
    ['garden', 'Garden'],
  ]) {
    const made = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id, title })
    expect(made.status, made.said).toBe(201)
  }
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  expect(started.status, started.said).toBe(201)
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the page of words waiting for the person', () => {
  it('lists every waiting note across projects, words as stored, and pages them', async () => {
    const before = (await waiting()).total
    const words = '  Fire it on Friday,\n  not Thursday.  '
    const a = await prepare(IN_KILNS, 'About the kiln', words)
    const b = await prepare(IN_GARDEN, 'About the beans', 'Plant the beans in May.')
    const c = await prepare(IN_KILNS, 'About the glaze', 'Use the blue glaze.')
    await file({ ...AS_QUILL, ...IN_KILNS }, 'An ordinary note', { body: 'Not prepared for anybody.' })
    const filedAlready = await prepare(IN_GARDEN, 'About the shed', 'Paint the shed.')
    const pressed = await ask('POST', `/api/records/${filedAlready}/file-as-my-words`, { ...AS_THE_PERSON, ...IN_GARDEN })
    expect(pressed.status, pressed.said).toBe(200)

    const all = await waiting()
    expect(all.total).toBe(before + 3)
    const ours = all.notes.filter((one) => [a, b, c].includes(one.id))
    expect(ours.map((one) => one.id).sort()).toEqual([a, b, c].sort())
    // OLDEST FIRST, AND BY ID WITHIN ONE SECOND, which is what keeps a page from showing a note twice.
    const order = all.notes.map((one) => `${(one as unknown as { createdAt: string }).createdAt} ${one.id}`)
    expect(order).toEqual([...order].sort())
    const kiln = ours.find((one) => one.id === a)
    expect(all.notes.some((one) => one.id === filedAlready)).toBe(false)
    expect(kiln?.body).toBe(words)
    expect(kiln?.project).toBe('Kilns')
    expect(ours.find((one) => one.id === b)?.workspaceId).toBe('garden')
    expect(kiln?.preparedBy?.type).toBe('agent')
    expect(kiln?.preparedBy?.name).toBe('Quill')

    const first = await waiting('?limit=2&offset=0')
    const rest = await waiting(`?limit=25&offset=2`)
    expect(first.notes).toHaveLength(2)
    expect([...first.notes, ...rest.notes].map((one) => one.id)).toEqual(all.notes.map((one) => one.id))
    expect((await ask('GET', '/api/the-persons-words?limit=26', AS_QUILL)).status).toBe(400)
  })
})

describe('"Not what I said"', () => {
  it('is refused to an agent, keeps the note when the person presses, and takes it off the page', async () => {
    const id = await prepare(IN_KILNS, 'About the chimney', 'Raise the chimney.')
    const rows = rowCount()
    const changed = changeCount()
    const byQuill = await ask('POST', `/api/records/${id}/not-what-i-said`, { ...AS_QUILL, ...IN_KILNS })
    expect(byQuill.status, byQuill.said).toBe(403)
    expect([rowCount(), changeCount()]).toEqual([rows, changed])
    expect(dataOf(id)['not_what_the_person_said']).toBeUndefined()

    const pressed = await ask('POST', `/api/records/${id}/not-what-i-said`, { ...AS_THE_PERSON, ...IN_KILNS })
    expect(pressed.status, pressed.said).toBe(200)
    // THE ONE NEW ROW IS THE LINE TO WHOEVER WROTE THE NOTE DOWN (round 46). The note itself is kept, not copied.
    expect(rowCount()).toBe(rows + 1)
    expect(deletedAt(id)).toBeNull()
    expect(dataOf(id)['body']).toBe('Raise the chimney.')
    expect(typeof dataOf(id)['not_what_the_person_said']).toBe('string')
    expect((await waiting()).notes.some((one) => one.id === id)).toBe(false)

    const again = await ask('POST', `/api/records/${id}/not-what-i-said`, { ...AS_THE_PERSON, ...IN_KILNS })
    expect(again.status, again.said).toBe(409)
    const filed = await ask('POST', `/api/records/${id}/file-as-my-words`, { ...AS_THE_PERSON, ...IN_KILNS })
    expect(filed.status, filed.said).toBe(409)
    expect(rowCount()).toBe(rows + 1)
  })

  it('refuses a filed note and an ordinary one, writing nothing', async () => {
    const ordinary = await file({ ...AS_QUILL, ...IN_KILNS }, 'Just a note', { body: 'Nothing to file.' })
    const filedOne = await prepare(IN_KILNS, 'About the door', 'Paint the door red.')
    expect((await ask('POST', `/api/records/${filedOne}/file-as-my-words`, { ...AS_THE_PERSON, ...IN_KILNS })).status).toBe(200)
    const rows = rowCount()
    for (const id of [ordinary, filedOne]) {
      const pressed = await ask('POST', `/api/records/${id}/not-what-i-said`, { ...AS_THE_PERSON, ...IN_KILNS })
      expect(pressed.status, pressed.said).toBe(409)
      expect(dataOf(id)['not_what_the_person_said']).toBeUndefined()
    }
    expect(rowCount()).toBe(rows)
  })

  it('cannot be written, changed or taken off by an agent through any other door', async () => {
    const born = await ask('POST', '/api/records', { ...AS_QUILL, ...IN_KILNS }, {
      kind: 'note',
      title: 'Born marked',
      data: { body: 'x', for_the_person_to_file: true, not_what_the_person_said: '2026-10-10 09:00:00' },
    })
    expect(born.status, born.said).toBe(403)

    const id = await prepare(IN_KILNS, 'About the bricks', 'Order the bricks.')
    const set = await ask('PATCH', `/api/records/${id}`, { ...AS_QUILL, ...IN_KILNS }, { dataPatch: { not_what_the_person_said: '2026-10-10 09:00:00' } })
    expect(set.status, set.said).toBe(403)
    expect((await waiting()).notes.some((one) => one.id === id)).toBe(true)

    expect((await ask('POST', `/api/records/${id}/not-what-i-said`, { ...AS_THE_PERSON, ...IN_KILNS })).status).toBe(200)
    const off = await ask('PATCH', `/api/records/${id}`, { ...AS_QUILL, ...IN_KILNS }, { dataPatch: { not_what_the_person_said: null } })
    expect(off.status, off.said).toBe(403)
    const whole = await ask('PATCH', `/api/records/${id}`, { ...AS_QUILL, ...IN_KILNS }, { data: { body: 'Order the bricks.', for_the_person_to_file: true } })
    expect(whole.status, whole.said).toBe(403)
    expect(typeof dataOf(id)['not_what_the_person_said']).toBe('string')
    // AN AGENT'S ORDINARY EDIT THAT CARRIES THE MARK ACROSS IS NOT A CHANGE TO IT.
    const retitled = await ask('PATCH', `/api/records/${id}`, { ...AS_QUILL, ...IN_KILNS }, { title: 'About the bricks, retitled' })
    expect(retitled.status, retitled.said).toBe(200)
  })
})

describe('"Confirm all"', () => {
  it('is refused to an agent, and files none when one note is not waiting', async () => {
    const one = await prepare(IN_KILNS, 'About the shelf', 'Build the shelf.')
    const two = await prepare(IN_GARDEN, 'About the hose', 'Fix the hose.')
    const ordinary = await file({ ...AS_QUILL, ...IN_GARDEN }, 'Plain', { body: 'Plain.' })
    const rows = rowCount()
    const changed = changeCount()
    const byQuill = await ask('POST', '/api/the-persons-words/confirm-all', AS_QUILL, { ids: [one, two] })
    expect(byQuill.status, byQuill.said).toBe(403)
    const mixed = await ask('POST', '/api/the-persons-words/confirm-all', AS_THE_PERSON, { ids: [one, two, ordinary] })
    expect(mixed.status, mixed.said).toBe(409)
    expect(mixed.said).toContain(ordinary)
    const twice = await ask('POST', '/api/the-persons-words/confirm-all', AS_THE_PERSON, { ids: [one, one] })
    expect(twice.status, twice.said).toBe(400)
    expect([rowCount(), changeCount()]).toEqual([rows, changed])
  })

  it('files every named note across projects as the person, each from its own prepared note', async () => {
    const one = await prepare(IN_KILNS, 'About the oven', 'Clean the oven.')
    const two = await prepare(IN_GARDEN, 'About the gate', 'Oil the gate.')
    const left = await prepare(IN_GARDEN, 'About the path', 'Sweep the path.')
    const pressed = await ask('POST', '/api/the-persons-words/confirm-all', AS_THE_PERSON, { ids: [one, two] })
    expect(pressed.status, pressed.said).toBe(200)
    const filed = pressed.body['filed'] as Array<{ note: { id: string; workspaceId: string }; filedFrom: string }>
    expect(filed.map((row) => row.filedFrom)).toEqual([one, two])
    expect(filed.map((row) => row.note.workspaceId)).toEqual(['kilns', 'garden'])
    for (const row of filed) {
      expect(dataOf(row.note.id)['filed_from']).toBe(row.filedFrom)
      const who = t.client.sqlite.prepare("SELECT actor_type AS type FROM changes WHERE record_id = ? AND op = 'create'").get(row.note.id) as { type: string }
      expect(who.type).toBe('human')
    }
    expect(dataOf(filed[0]?.note.id ?? '')['body']).toBe('Clean the oven.')
    const still = (await waiting()).notes.map((row) => row.id)
    expect(still).toContain(left)
    expect(still).not.toContain(one)
    expect(still).not.toContain(two)
  })
})
