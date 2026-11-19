// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKLIST ITEM MARKED DONE UNDER THE PERSON'S GRANT SHOWS THE PRESS'S REASON WHERE THE MARK IS SHOWN. Wave 13s
 * round 2a.
 *
 * `thePersonsOwnDone` in src/server/lib/checklists.ts lets a secretary holding the grant mark an item done with no
 * evidence, and the mark says only that the raise carried it. The press gave a reason, and the mark did not keep it.
 *
 * THE REASON IS KEPT IN ONE PLACE, the press row (`presses_for_the_person`). The mark keeps the press's id beside
 * `underTheRaise`, and the checklist's reading gives each press a mark names with the reason its row holds. The press
 * row is written by the change log, in the same write as the mark, so there is exactly one.
 *
 * MUTATIONS, each after a control run (the report of the run that added this file):
 *   · the mark written without the press's id → the mark case and the drawn case are red;
 *   · the reading made to give no presses → the reading case and the drawn case are red.
 */

import { Fragment, createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, setWordLanguage } from '../src/shared/i18n.ts'
import type { ChecklistReading, ChecklistRequest } from '../src/shared/checklists.ts'
import { ItemRow } from '../src/web/components/ChecklistParts.tsx'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let grant: string
let list: string
let item: string

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const THE_REASON = 'The person said this one is finished.'
const NO_REASON = { en: 'No reason was written down.', zh: '没有写下原因。' }
/** The words a mark under the raise is drawn with, on each side of the name, escaped as the markup escapes them. */
const UNDER_THE_RAISE = createI18n('en').t('w13j.checklistDone.underRaise').split(/\{\w+\}/).map((piece) => renderToStaticMarkup(h(Fragment, null, piece.trim()))).filter((piece) => piece !== '')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_SECRETARY = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }

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

function thePresses(): { id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT id, grant_id, operation, reason FROM presses_for_the_person ORDER BY rowid').all() as {
    id: string
    grant_id: string
    operation: string
    reason: string | null
  }[]
}

async function theReading(): Promise<ChecklistReading> {
  const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
  expect(read.status, read.said).toBe(200)
  return (read.body['checklist'] ?? read.body) as ChecklistReading
}

function theItemIn(reading: ChecklistReading): ChecklistRequest {
  const found = reading.items.find((one) => one.id === item)
  expect(found, 'the item is not on the checklist').toBeTruthy()
  return found!
}

function drawn(one: ChecklistRequest, reading: ChecklistReading, language: 'en' | 'zh' = 'en'): string {
  setWordLanguage(language)
  try {
    return renderToStaticMarkup(h(ItemRow, { item: one, list: reading }))
  } finally {
    setWordLanguage('en')
  }
}

let before: number
let marked: { status: number; said: string; body: Record<string, unknown> }

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).status).toBe(201)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
  grant = String((pressed.body['elevation'] as { id: string }).id)

  const made = await ask('POST', '/api/checklists', AS_THE_PERSON, { title: 'A checklist of the person' })
  expect(made.status, made.said).toBe(201)
  list = String(((made.body['checklist'] ?? made.body) as { id: string }).id)
  const added = await ask('POST', `/api/checklists/${list}/items`, AS_THE_PERSON, { words: 'Check the kiln' })
  expect(added.status, added.said).toBe(201)
  item = String((added.body['item'] as { id: string }).id)

  before = thePresses().length
  // NO EVIDENCE, so only the person, or the person's grant, marks it done.
  marked = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_SECRETARY, { forThePerson: { reason: THE_REASON }, state: 'done' })
  expect(marked.status, marked.said).toBe(200)
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a checklist mark under the grant keeps its press, and the press keeps its reason', () => {
  it('writes one press row for the mark, with its reason, and the mark names it', () => {
    const presses = thePresses().slice(before)
    expect(presses, 'the mark under the grant is not one press row').toHaveLength(1)
    expect(presses[0]).toMatchObject({ grant_id: grant, operation: 'checklist.changeItem', reason: THE_REASON })

    const mark = (marked.body['item'] as ChecklistRequest).doneByThePerson
    expect(mark).toMatchObject({ underTheRaise: true, press: presses[0]!.id })
  })

  it('keeps the reason only in the press row, not in the checklist', () => {
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(list) as { data: string }
    expect(stored.data).not.toContain(THE_REASON)
  })

  it("gives the press's reason in the checklist's reading", async () => {
    const reading = await theReading()
    const mark = theItemIn(reading).doneByThePerson
    expect(mark?.press).toBeTruthy()
    expect(reading.presses).toEqual([{ id: mark!.press, reason: THE_REASON }])
  })

  it('draws the reason on the line where the mark is drawn', async () => {
    const reading = await theReading()
    const html = drawn(theItemIn(reading), reading)
    for (const piece of UNDER_THE_RAISE) expect(html).toContain(piece)
    expect(html).toContain(THE_REASON)
  })

  it('says no reason was written down on a mark that names no press, in English and in Chinese', async () => {
    // BY HAND, on a copy of the reading: a mark written before the press was kept on it names none.
    const reading = await theReading()
    const one = theItemIn(reading)
    const { press: _press, ...older } = one.doneByThePerson!
    const unnamed = { ...one, doneByThePerson: older }
    expect(drawn(unnamed, reading)).toContain(NO_REASON.en)
    expect(drawn(unnamed, reading, 'zh')).toContain(NO_REASON.zh)
  })
})
