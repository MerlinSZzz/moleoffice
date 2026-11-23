// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTE HOLDS TAGS. THE DOOR CHECKS EACH ONE, AND A SAVE KEEPS THEM.
 *
 * A quick note's data may hold `tags`, a list of words the person sorts the note by. The door checks each tag on the
 * way in: it is 1 to 40 characters with no space at either end, a note holds at most 12, and no two are the same apart
 * from capitals. A bad tag is refused with words that name its place, and nothing is stored.
 *
 * WHAT IS BEING PROVED, through the office's own doors in a test office of its own:
 *   1. A note filed with tags is read back from the office with the same tags, in the order they were given.
 *   2. Each kind of bad tag is refused with 400, the refusal names the tag's place, and the note is not filed.
 *   3. A save of a kept note, with the body the note page sends, keeps the new tags, and a later save that sends no
 *      tags leaves them as they are.
 *
 * Every note and tag here is made up, and its words say so. The database is the test's own.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const WORDS = [{ id: 'w-1', type: 'words', x: 24, y: 16, width: 280, text: 'Made-up words about a made-up kiln.' }]

interface Answer {
  status: number
  body: { record?: { id: string; data: Record<string, unknown> }; version?: string } & Record<string, unknown>
}

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown): Promise<Answer> {
  const res = await app.inject({ method, url, headers: AS_THE_PERSON, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: res.statusCode, body: res.json() }
}

/** File one made-up note with the tags given, as the note page's first save files it. */
const fileANote = (title: string, tags: unknown): Promise<Answer> =>
  ask('POST', '/api/records', { kind: 'quick_note', title, data: { parts: WORDS, tags } })

/** The tags the office holds for a note, read back through the record door. */
async function theStoredTags(id: string): Promise<unknown> {
  const read = await ask('GET', `/api/records/${encodeURIComponent(id)}`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return read.body.record?.data['tags']
}

/** How many notes the office holds with this title, so a refused note can be shown not to be filed. */
async function howManyAreCalled(title: string): Promise<number> {
  const read = await ask('GET', `/api/records?kind=quick_note&limit=25`)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const records = (read.body['records'] ?? []) as { title: string }[]
  return records.filter((record) => record.title === title).length
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a note holds tags', () => {
  it('keeps the tags a note is filed with, in the order they were given', async () => {
    const filed = await fileANote('Made-up note with three made-up tags', ['made-up kiln', 'Made-up glaze', 'made-up clay'])
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(await theStoredTags(filed.body.record!.id)).toEqual(['made-up kiln', 'Made-up glaze', 'made-up clay'])
  })

  const TOO_LONG = `made-up ${'x'.repeat(40)}`
  const THIRTEEN = Array.from({ length: 13 }, (_, at) => `made-up tag ${String(at + 1)}`)
  const BAD: readonly { says: string; tags: unknown; at: string }[] = [
    { says: 'an empty tag', tags: ['made-up kiln', ''], at: 'data.tags[1]' },
    { says: 'a tag with a space at its end', tags: ['made-up kiln '], at: 'data.tags[0]' },
    { says: 'a tag with a space at its start', tags: [' made-up kiln'], at: 'data.tags[0]' },
    { says: 'a tag of more than 40 characters', tags: [TOO_LONG], at: 'data.tags[0]' },
    { says: 'the same tag twice, apart from capitals', tags: ['made-up glaze', 'Made-up Glaze'], at: 'data.tags[1]' },
    { says: 'more than 12 tags', tags: THIRTEEN, at: 'data.tags' },
    { says: 'a tag that is not words', tags: ['made-up kiln', 7], at: 'data.tags' },
  ]
  for (const bad of BAD) {
    it(`refuses ${bad.says}, names its place, and files nothing`, async () => {
      const title = `Made-up note refused for ${bad.says}`
      const refused = await fileANote(title, bad.tags)
      expect(refused.status, JSON.stringify(refused.body)).toBe(400)
      expect(JSON.stringify(refused.body)).toContain(bad.at)
      expect(await howManyAreCalled(title)).toBe(0)
    })
  }

  it('keeps the tags a save of a kept note sends, and keeps them through a save that sends none', async () => {
    const filed = await fileANote('Made-up note whose tags are changed', ['made-up kiln'])
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const id = filed.body.record!.id
    // THE BODY THE NOTE PAGE SENDS when its tags changed: the parts whole, the tags whole, on the version last kept.
    const changed = await ask('PATCH', `/api/records/${encodeURIComponent(id)}`, {
      dataPatch: { parts: WORDS, tags: ['made-up kiln', 'made-up blue'] },
      ifVersion: filed.body.version,
    })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(await theStoredTags(id)).toEqual(['made-up kiln', 'made-up blue'])
    // A SAVE WHEN ONLY THE WORDS CHANGED sends no tags, and the tags stay.
    const wordsOnly = await ask('PATCH', `/api/records/${encodeURIComponent(id)}`, {
      dataPatch: { parts: [{ ...WORDS[0], text: 'Made-up words, changed.' }] },
      ifVersion: changed.body.version,
    })
    expect(wordsOnly.status, JSON.stringify(wordsOnly.body)).toBe(200)
    expect(await theStoredTags(id)).toEqual(['made-up kiln', 'made-up blue'])
  })

  it('refuses a save that would give a kept note a bad tag, and keeps the tags it had', async () => {
    const filed = await fileANote('Made-up note with one made-up tag', ['made-up order'])
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const id = filed.body.record!.id
    const refused = await ask('PATCH', `/api/records/${encodeURIComponent(id)}`, {
      dataPatch: { parts: WORDS, tags: ['made-up order', 'Made-up order'] },
      ifVersion: filed.body.version,
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    expect(JSON.stringify(refused.body)).toContain('data.tags[1]')
    expect(await theStoredTags(id)).toEqual(['made-up order'])
  })
})
