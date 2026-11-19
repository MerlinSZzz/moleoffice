// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW OFFICE FILES ITS GETTING-STARTED REPORT WHEN ITS PERSON GIVES THEIR NAME, AND ITS FIRST ENTRY ENDS ONCE.
 * Item 74 of wave 13y, parts a and b (round 138), with the shape settled in JC2_JG3WNjp-
 * points 1 and 2.
 *
 * Every case drives the real doors of one test office. A case that names the person first makes the office unnamed
 * again with one SQL line, as tests/the-owners-words-name-the-owner-and-change-the-list.test.ts does. That line is a
 * fixture reset only: every act under test goes through its door.
 *
 * WHAT IS PROVED HERE (every name is made up):
 *   1. An office whose person was named before files nothing. The naming door refuses a second name with 409, and
 *      GET /api/getting-started says there is no first entry, with no report, checklist or item.
 *   2. The person names a new office in English. The office files one report, written by the office, for the name
 *      given, in the English words. It holds two pictures, which are files of public/ that GET /api/file serves, each
 *      captioned as a made-up office. Its words name the Embassy and the admitting press by the words those
 *      pages draw. The office puts one standing item on one new checklist of the person's. The item links the report
 *      and names it in its words. GET /api/getting-started says the first entry is on and shows, and names all three.
 *   3. The person names a new office in Chinese. Where Chinese holds every word and picture of the report, the report
 *      is in Chinese: its title and every picture from the Chinese folder. Where it lacks any of them, the report is
 *      in English, block for block the report an English naming files, so no block of it says what language it is
 *      in. The case reads which of the two the checkout holds, so it stands before and after the Chinese words and
 *      pictures arrive (round 139: each branch was proved red by a mutation).
 *   4. An agent cannot end the first entry: 403, and nothing changes.
 *   5. The person ends it with POST /api/getting-started/opened. The reading then says it ended, by the person, and
 *      when, and the change log holds the row. A second press changes nothing and says so. The report stays on the
 *      checklist.
 *   6. With no first entry, the press that ends one is refused with 409, and nothing is written.
 *   7. A first entry whose report was taken away does not show, so it cannot hold the person behind its layer.
 *
 * MUTATIONS, each after a green control run, then restored: listed in round 138's report.
 */

import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_GETTING_STARTED_FOLDER } from '../src/shared/getting-started.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish, WORD_LISTS, type WordKey } from '../src/shared/i18n.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The pictures' folder in this checkout, where the code says it is. */
const PICTURES = join(REPO, THE_GETTING_STARTED_FOLDER)

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const HELPER = 'made-up-newcomers-helper'
let helperKey = ''
const asTheHelper = (): Record<string, string> => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HELPER, 'x-mole-office-key': helperKey })

const NAME = 'A made-up newcomer'

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

function rows(sql: string, ...values: unknown[]): Record<string, unknown>[] {
  return t.client.sqlite.prepare(sql).all(...values) as Record<string, unknown>[]
}

/** Fixture reset only: the office's person has no name again, and no first entry was ever written down. */
function anUnnamedOffice(): void {
  t.client.sqlite.prepare("UPDATE people SET name = 'default office owner name', office_owner = 'unnamed', language = NULL WHERE office_owner IS NOT NULL").run()
  t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = 'setting:first-entry'").run()
}

/** What the office holds that a first entry or its press could change. */
function theOfficeAsItStands() {
  return {
    entry: rows("SELECT actor_type, actor_id, old_value, new_value FROM changes WHERE record_id = 'setting:first-entry' ORDER BY append_order"),
    reports: rows("SELECT id, title, updated_at FROM records WHERE kind = 'report' ORDER BY id"),
    checklists: rows("SELECT id, data, updated_at FROM records WHERE kind = 'checklist' ORDER BY id"),
  }
}

async function theFirstEntry(): Promise<Record<string, any>> {
  const reply = await call('GET', '/api/getting-started', PERSON)
  expect(reply.status, reply.text).toBe(200)
  return reply.json
}

async function aRecord(id: string): Promise<Record<string, any>> {
  const reply = await call('GET', `/api/records/${id}`, PERSON)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['record'] as Record<string, any>
}

async function aChecklist(id: string): Promise<Record<string, any>> {
  const reply = await call('GET', `/api/checklists/${id}`, PERSON)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['checklist'] as Record<string, any>
}

/** Every text block's heading and words, one after another. */
function theWordsOf(report: Record<string, any>): string {
  return (report['data']['blocks'] as Record<string, any>[])
    .filter((block) => block['type'] === 'text')
    .map((block) => `${String(block['heading'] ?? '')}\n${String(block['text'])}`)
    .join('\n')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const made = await call('POST', '/api/agents/started', PERSON, { handle: HELPER, name: HELPER, role: 'worker' })
  expect(made.status, made.text).toBe(201)
  helperKey = String(made.json['whatToGiveIt']['key'])
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the getting-started report and the first entry', () => {
  it('1: an office whose person was named before files nothing, and has no first entry', async () => {
    const before = theOfficeAsItStands()
    const again = await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })
    expect(again.status, again.text).toBe(409)
    expect(theOfficeAsItStands()).toEqual(before)
    const entry = await theFirstEntry()
    expect(entry).toMatchObject({ state: 'none', report: null, checklist: null, item: null, shows: false, ended: null })
    expect(String(entry['says'])).not.toBe('')
  })

  it('2: naming a new office in English files one report and one standing checklist item, and the first entry is on', async () => {
    anUnnamedOffice()
    const reportsBefore = rows("SELECT id FROM records WHERE kind = 'report'").length
    const named = await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })
    expect(named.status, named.text).toBe(200)

    const entry = await theFirstEntry()
    expect(entry).toMatchObject({ state: 'on', shows: true, ended: null })
    for (const field of ['report', 'checklist', 'item']) expect(typeof entry[field], field).toBe('string')
    expect(rows("SELECT id FROM records WHERE kind = 'report'")).toHaveLength(reportsBefore + 1)

    const report = await aRecord(entry['report'])
    expect(report['kind']).toBe('report')
    expect(report['title']).toBe(sayInEnglish('gettingStarted.report.title' as WordKey))
    expect(report['data']['for']).toBe(NAME)
    expect(rows("SELECT actor_type FROM changes WHERE record_id = ? AND op = 'create'", entry['report'])).toEqual([{ actor_type: 'system' }])

    const words = theWordsOf(report)
    expect(words).toContain(sayInEnglish('nav.embassy'))
    expect(words).toContain(sayInEnglish('g6b.ask.admit'))
    expect(words).toContain(sayInEnglish('g6b.ask.refuse'))
    expect(words).toContain(NAME)

    const pictures = (report['data']['blocks'] as Record<string, any>[]).filter((block) => block['type'] === 'image')
    expect(pictures).toHaveLength(2)
    for (const picture of pictures) {
      const path = String(picture['path'])
      expect(path.startsWith(`${join(PICTURES, 'en')}/`), path).toBe(true)
      expect(existsSync(path), path).toBe(true)
      expect(String(picture['alt'])).not.toBe('')
      expect(picture['caption']).toBe(sayInEnglish('gettingStarted.report.madeUp' as WordKey))
      const served = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}`, headers: PERSON })
      expect(served.statusCode, served.body.slice(0, 400)).toBe(200)
      expect(String(served.headers['content-type'])).toMatch(/^image\/png/)
    }

    const list = await aChecklist(entry['checklist'])
    expect(list['owner']).toEqual({ kind: 'person', id: THE_PERSON })
    expect(list['title']).toBe(sayInEnglish('gettingStarted.checklist.title' as WordKey))
    expect(list['items']).toHaveLength(1)
    const item = list['items'][0] as Record<string, any>
    expect(item['id']).toBe(entry['item'])
    expect(item['standing']).toBe(true)
    expect(item['links']).toEqual([entry['report']])
    expect(item['words']).toBe(sayInEnglish('gettingStarted.item.words' as WordKey, { report: entry['report'] }))
    expect(list['linked']).toContainEqual(expect.objectContaining({ id: entry['report'], found: true, kind: 'report', title: report['title'] }))
  })

  it('3: naming a new office in Chinese files the report in Chinese only where Chinese holds all of it, and the English report as it is when not', async () => {
    anUnnamedOffice()
    expect((await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })).status).toBe(200)
    const inEnglish = (await aRecord((await theFirstEntry())['report']))['data']['blocks'] as Record<string, any>[]
    anUnnamedOffice()
    const named = await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'zh' })
    expect(named.status, named.text).toBe(200)
    const entry = await theFirstEntry()
    expect(entry).toMatchObject({ state: 'on', shows: true })
    const report = await aRecord(entry['report'])
    const { THE_GETTING_STARTED_WORDS, THE_GETTING_STARTED_PICTURES } = await import('../src/shared/getting-started.ts')
    const chineseHasIt =
      THE_GETTING_STARTED_WORDS.every((key: WordKey) => WORD_LISTS.zh[key] !== undefined) &&
      THE_GETTING_STARTED_PICTURES.every((file: string) => existsSync(join(PICTURES, 'zh', file)))
    const blocks = report['data']['blocks'] as Record<string, any>[]
    const pictures = blocks.filter((block) => block['type'] === 'image')
    // WHICH BRANCH RUNS IS READ FROM THE CHECKOUT, not assumed: the words and pictures for Chinese come with 13x's round.
    expect(pictures).toHaveLength(THE_GETTING_STARTED_PICTURES.length)
    if (chineseHasIt) {
      expect(report['title']).toBe(WORD_LISTS.zh['gettingStarted.report.title' as WordKey])
      for (const picture of pictures) expect(String(picture['path']).startsWith(`${join(PICTURES, 'zh')}/`), String(picture['path'])).toBe(true)
    } else {
      // THE ENGLISH REPORT AND NOTHING MORE: a block that said what language the report is in would be one block too many.
      expect(blocks).toEqual(inEnglish)
      expect(report['title']).toBe(sayInEnglish('gettingStarted.report.title' as WordKey))
      for (const picture of pictures) expect(String(picture['path']).startsWith(`${join(PICTURES, 'en')}/`), String(picture['path'])).toBe(true)
    }
  })

  it('4: an agent cannot end the first entry, and nothing changes', async () => {
    anUnnamedOffice()
    expect((await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })).status).toBe(200)
    const before = theOfficeAsItStands()
    const refused = await call('POST', '/api/getting-started/opened', asTheHelper(), {})
    expect(refused.status, refused.text).toBe(403)
    expect(String(refused.json['error'])).toContain('Nothing was changed.')
    expect(theOfficeAsItStands()).toEqual(before)
    expect(await theFirstEntry()).toMatchObject({ state: 'on', shows: true })
  })

  it('5: the person ends the first entry once, the change log keeps who and when, and the report stays on the checklist', async () => {
    anUnnamedOffice()
    expect((await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })).status).toBe(200)
    const on = await theFirstEntry()
    const opened = await call('POST', '/api/getting-started/opened', PERSON, {})
    expect(opened.status, opened.text).toBe(200)
    expect(opened.json['changed']).toBe(true)
    const ended = await theFirstEntry()
    expect(ended).toMatchObject({ state: 'ended', shows: false, report: on['report'], checklist: on['checklist'], item: on['item'] })
    expect(ended['ended']['by']).toEqual({ type: 'human', id: THE_PERSON })
    expect(typeof ended['ended']['at']).toBe('string')
    // The reply hook adds narrowedByPermission to every read (lib/http.ts); the press's reply carries the entry alone.
    const { narrowedByPermission, ...asRead } = ended
    expect(narrowedByPermission).toBeNull()
    expect(opened.json['firstEntry']).toEqual(asRead)
    const kept = rows("SELECT actor_type, actor_id FROM changes WHERE record_id = 'setting:first-entry' ORDER BY append_order")
    expect(kept).toEqual([
      { actor_type: 'system', actor_id: expect.any(String) },
      { actor_type: 'human', actor_id: THE_PERSON },
    ])

    const before = theOfficeAsItStands()
    const again = await call('POST', '/api/getting-started/opened', PERSON, {})
    expect(again.status, again.text).toBe(200)
    expect(again.json['changed']).toBe(false)
    expect(theOfficeAsItStands()).toEqual(before)

    const list = await aChecklist(on['checklist'])
    expect(list['items'].map((item: Record<string, any>) => [item['id'], item['state'], item['standing']])).toEqual([[on['item'], 'open', true]])
  })

  it('6: with no first entry, the press that ends one is refused with 409, and nothing is written', async () => {
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = 'setting:first-entry'").run()
    const before = theOfficeAsItStands()
    const refused = await call('POST', '/api/getting-started/opened', PERSON, {})
    expect(refused.status, refused.text).toBe(409)
    expect(String(refused.json['error'])).toContain('Nothing was changed.')
    expect(theOfficeAsItStands()).toEqual(before)
  })

  it('7: a first entry whose report was taken away does not show', async () => {
    anUnnamedOffice()
    expect((await call('POST', '/api/office/owner', PERSON, { name: NAME, language: 'en' })).status).toBe(200)
    const on = await theFirstEntry()
    expect(on).toMatchObject({ state: 'on', shows: true })
    // Fixture only: the report is taken away the way the records table marks it.
    t.client.sqlite.prepare("UPDATE records SET deleted_at = datetime('now') WHERE id = ?").run(on['report'])
    const gone = await theFirstEntry()
    expect(gone).toMatchObject({ state: 'on', shows: false, report: on['report'] })
    expect(String(gone['says'])).not.toBe(String(on['says']))
  })
})
