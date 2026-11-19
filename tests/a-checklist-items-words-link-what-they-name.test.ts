// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORD IDS AND PAGE ADDRESSES IN A CHECKLIST ITEM'S WORDS ARE LINKS, AND ONLY TO WHAT THE READER MAY OPEN. Item 74
 * of wave 13y, part c (round 138), with the shape settled in JC2_JG3WNjp-
 * point 3, and the secretary's yes for 13n's files (V_hOYrmc2l0v), which asked for the case of a message the reader may not read.
 *
 * The words are split by the one splitter the chat uses, piecesOfBody in src/shared/messages.ts. A press on the item's
 * words still opens the item's facts; a press on a link inside them goes to its page (the browser half of that is in
 * tests/the-first-entry-shows-the-way-in.test.ts).
 *
 * Every case drives the real doors of one test office (every name, title and word is made up):
 *   1. An agent's item names, in its words alone, a report the office holds, an id no record has, a message the agent
 *      may not read, and a page address. The agent's reading lists the report in `linked`, with its title and kind,
 *      and leaves out the id of no record and the message.
 *   2. The person, who reads every message, reads the same checklist, and `linked` lists the message as well.
 *   3. An id in `links` is listed as before, found or not: the words change nothing for what the links name. The person
 *      adds the link, since the item door refuses a link to a message its writer may not read.
 *   4. The row draws the report's id as a link to the report's own page, with its title, inside the item's words, and
 *      the page address as a link to that page. The id of no record and the message's id stay plain words for the
 *      agent. For the person, the message's id is a link too.
 *   5. What the row is said to draw changes when a record named in the words comes or goes from the reading, so a row
 *      whose link appeared is marked as moved like any other change.
 *
 * MUTATIONS, each after a green control run, then restored: listed in round 138's report.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ChecklistReading, ChecklistRequest } from '../src/shared/checklists.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { ItemRow, whatTheRowDraws } from '../src/web/components/ChecklistParts.tsx'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WRITER = 'made-up-list-writer'
const OTHER = 'made-up-other-agent'
const keys = new Map<string, { id: string; key: string }>()
const as = (handle: string): Record<string, string> => ({
  ...PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle)!.key,
})

/** Twelve characters of the id alphabet with a digit in them, so piecesOfBody reads them as an id, and no record has it. */
const NO_RECORD = 'Zq7RmnoPxk2W'
const A_PAGE = '#/settings'

let report = ''
let reportTitle = ''
let message = ''
let checklist = ''

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, json: (reply.body === '' ? {} : reply.json()) as Record<string, any>, text: reply.body }
}

async function aReading(headers: Record<string, string>): Promise<ChecklistReading> {
  const reply = await call('GET', `/api/checklists/${checklist}`, headers)
  expect(reply.status, reply.text).toBe(200)
  return reply.json['checklist'] as ChecklistReading
}

const theWords = (): string => `Read ${report} first. Then ${NO_RECORD}, then ${message}, then ${A_PAGE}.`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [WRITER, OTHER]) {
    const made = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'worker' })
    expect(made.status, made.text).toBe(201)
    keys.set(handle, { id: String(made.json['agent']['id']), key: String(made.json['whatToGiveIt']['key']) })
  }
  reportTitle = 'A made-up report the item names'
  report = t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: reportTitle,
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'Made-up words for a test.' }], for: 'Whoever reads the test', date: '2026-11-05' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  // A MESSAGE FROM THE PERSON TO THE OTHER AGENT ALONE, so the list's writer may not read it and the person may.
  message = t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'A made-up message to the other agent',
    data: { body: 'Made-up words that only the other agent and the person may read.', to: [{ kind: 'agent', id: keys.get(OTHER)!.id }], sentBy: { kind: 'person', id: THE_PERSON } },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const made = await call('POST', '/api/checklists', as(WRITER), { title: 'A made-up checklist with links in its words', items: [{ words: theWords() }] })
  expect(made.status, made.text).toBe(201)
  checklist = String(made.json['checklist']['id'])
}, 60_000)
afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('links inside a checklist item’s words', () => {
  it('1: the agent’s reading lists the held report the words name, and leaves out the id of no record and the message it may not read', async () => {
    const reading = await aReading(as(WRITER))
    expect(reading.items.map((item) => item.words)).toEqual([theWords()])
    expect(reading.linked).toEqual([{ id: report, found: true, kind: 'report', title: reportTitle, blocks: [] }])
  })

  it('2: the person, who reads every message, gets the message in linked too', async () => {
    const reading = await aReading(PERSON)
    expect(reading.linked.map((one) => [one.id, one.found])).toEqual([
      [report, true],
      [message, true],
    ])
  })

  it('3: an id in links is listed as before, found or not, whatever the words say', async () => {
    // The person may read the message, so the item door takes it as a link; the writer still may not read it.
    const added = await call('POST', `/api/checklists/${checklist}/items`, PERSON, { words: 'A made-up item with a link and no ids in its words.', links: [message] })
    expect(added.status, added.text).toBe(201)
    const reading = await aReading(as(WRITER))
    expect(reading.linked).toContainEqual({ id: message, found: false, because: 'no message you may read' })
    expect(reading.linked).toContainEqual(expect.objectContaining({ id: report, found: true }))
    expect(reading.linked.find((one) => one.id === NO_RECORD)).toBeUndefined()
  })

  it('4: the row draws the held ids and the page address as links inside the words, and the rest as plain words', async () => {
    const agents = await aReading(as(WRITER))
    const item = agents.items.find((one) => one.words === theWords()) as ChecklistRequest
    const anchor = (path: string, words: string): RegExp => new RegExp(`<a href="${path}"[^>]*>${words}</a>`)
    const drawn = renderToStaticMarkup(h(ItemRow, { item, list: agents }))
    const words = drawn.slice(drawn.indexOf('<span class="ckp-words">'), drawn.indexOf('</summary>'))
    expect(words).toMatch(anchor(`#/report/${report}`, reportTitle))
    expect(words).toMatch(anchor(A_PAGE, sayInEnglish('chat.openPage')))
    expect(words).toContain(NO_RECORD)
    expect(words).not.toContain(`/${NO_RECORD}"`)
    expect(words).toContain(message)
    expect(words).not.toContain(`/${message}"`)
    expect(words).not.toContain('A made-up message to the other agent')

    const persons = await aReading(PERSON)
    const theirs = renderToStaticMarkup(h(ItemRow, { item, list: persons }))
    const theirWords = theirs.slice(theirs.indexOf('<span class="ckp-words">'), theirs.indexOf('</summary>'))
    expect(theirWords).toMatch(anchor(`#/message/${message}`, 'A made-up message to the other agent'))
    expect(theirWords).not.toContain(`/${NO_RECORD}"`)
  })

  it('5: what the row is said to draw changes when a record named in its words comes or goes', async () => {
    const reading = await aReading(as(WRITER))
    const item = reading.items.find((one) => one.words === theWords()) as ChecklistRequest
    const withIt = whatTheRowDraws(item, reading, false)
    const without = whatTheRowDraws(item, { ...reading, linked: [] }, false)
    expect(withIt).not.toBe(without)
    expect(whatTheRowDraws(item, reading, true)).not.toBe(whatTheRowDraws(item, { ...reading, linked: [] }, true))
  })
})
