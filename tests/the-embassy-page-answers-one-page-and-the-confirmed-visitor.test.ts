// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY READS ONE PAGE, AND THE CONFIRM ANSWERS ONE VISITOR. Item AT-11 of wave 14c.
 *
 * The Embassy page read the whole roll: every citizen, visitor and credential row, with presence
 * and keys, to draw a list of contacts. The report's before row measures that read on a copy of the
 * made-up office of 13 November, never on a live server; this case holds a small office's version of
 * the same fault.
 *
 * WHAT THIS CASE HOLDS, in an office made up for it:
 *
 *   1. A PAGE OF THE EMBASSY is `?shape=page`: at most `limit` rows, a `rowsTotal`, the counts the
 *      three presses say, and a `next` that carries the reader to the next page and stops at the
 *      last. Every row is one the page draws: live, and a contact or somebody holding a credential.
 *      The pending credentials come with it; the ended ones and the test worlds do not until their
 *      presses are asked for.
 *   2. THE WHOLE ANSWER still holds every row, and the page's rows are exactly the first rows of
 *      it that the page's rule draws. What the page draws is what it drew before.
 *   3. THE CONFIRM ANSWERS THE ONE ROW the confirmed visitor made, and not the whole roll.
 *
 * WHAT THIS FILE DOES NOT HOLD: the owner's own 2,641-row office. That is measured on a copy of it
 * by the wave's measurement, because no test may open it. The small office here is made up.
 */

import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { type EmbassyRow, type WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { TheEmbassy } from '../src/web/pages/EmbassyPage.tsx'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let office: TestDb
let app: FastifyInstance
let person: Record<string, string> = {}
/** The three confirmed credentials' ids, in the order they were confirmed. */
const confirmed: string[] = []
/** The one credential still asking when the page is first read. */
let asking: string
const WORLD = '1111222233334444'

/**
 * THE PAGE'S RULE, STATED HERE AND NOT IMPORTED FROM THE SERVER. A test that reads the same helper
 * the door uses cannot tell a wrong rule from a changed one. It is the rule the page drew by before
 * this change: a live citizen or visitor that is a contact or came in on a credential.
 */
type PageReply = WhatTheEmbassySays & {
  rowsTotal: number
  hidden?: number
  retiredCount?: number
  otherWorlds?: number
  next?: string | null
}
const thePageDrawsThis = (row: EmbassyRow): boolean =>
  (row.standing === 'citizen' || row.standing === 'visitor') &&
  row.retired === null &&
  (row.contact || row.credential !== null)

const THE_WORKER = {
  role: 'worker',
  runtime: 'claude-code',
  conversationPath: '/logs/a-visitor.jsonl',
  startDirectory: '/work/a-visitor',
}

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, any>; text: string }> {
  const answer = await app.inject({ method, url, headers: person, ...(payload === undefined ? {} : { payload }) })
  const text = answer.body
  return { status: answer.statusCode, body: JSON.parse(text) as Record<string, any>, text }
}

/** A visitor asks; the credential is written and the page would draw its card while it waits. */
async function ask(handle: string): Promise<string> {
  const asked = await call('POST', '/api/office/visitors', {
    handle,
    name: `Made-up ${handle}`,
    ...THE_WORKER,
  })
  expect(asked.status, asked.text).toBe(201)
  return String(asked.body.credential.id)
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(dirname(office.file), 'keys.json')),
  }

  for (const handle of ['first-visitor', 'second-visitor', 'third-visitor']) {
    const id = await ask(handle)
    confirmed.push(id)
    const answer = await call('POST', `/api/office/visitors/${id}/confirm`)
    expect(answer.status, answer.text).toBe(200)
  }
  // ONE STILL ASKING, so the page carries a pending credential and the asking block is not empty.
  asking = await ask('still-asking')
  // ONE ENDED BEFORE IT WAS EVER CONFIRMED, so it is a retired row and not a live one.
  const ended = await ask('ended-before-coming-in')
  const refused = await call('POST', `/api/office/visitors/${ended}/end`)
  expect(refused.status, refused.text).toBe(200)

  // ONE TEST WORLD, which the page keeps behind its Show every world press.
  const world = await call('POST', '/api/office/worlds', {
    name: 'A made-up world the page keeps back',
    purpose: 'so the every-world press has one to bring back',
    kind: 'test',
    startedBy: { kind: 'person', id: THE_PERSON },
    databaseIdentity: WORLD,
    standing: 'canonical',
    installation: 'a made-up installation',
  })
  expect(world.status, world.text).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

it('1. answers one page with the counts the presses say, and its next page, and no more', async () => {
  const first = await call('GET', '/api/office/embassy?shape=page&limit=2')
  expect(first.status, first.text).toBe(200)
  const page = first.body as PageReply
  expect(page.rowsTotal, 'the view has the three confirmed visitors').toBe(3)
  expect(page.rows.length, 'the page holds what it was asked for').toBe(2)
  expect(page.rows.every(thePageDrawsThis), 'and every row is one the page draws').toBe(true)
  expect(page.next, 'and there is a second page').toBeTypeOf('string')
  expect(page.retiredCount, 'the ended credential is counted under its press').toBe(1)
  expect(page.otherWorlds, 'the test world is counted under its press').toBe(1)
  expect(page.hidden, 'the owner is not a contact and is counted under Show everyone').toBeGreaterThanOrEqual(1)
  expect(page.visitors.map((one) => one.id), 'only the credential still asking').toEqual([asking])
  expect(page.worlds.map((one) => one.world.databaseIdentity), 'and only the live worlds').not.toContain(WORLD)

  const second = await call('GET', page.next!)
  expect(second.status, second.text).toBe(200)
  const rest = second.body as PageReply
  expect(rest.rowsTotal).toBe(3)
  expect(rest.rows.length).toBe(1)
  expect(rest.next, 'the last page says there is no more').toBeNull()
  const seen = [...page.rows, ...rest.rows]
  expect(new Set(seen.map((one) => `${one.who.kind}:${one.who.id}`)).size, 'no row is drawn twice').toBe(3)
  expect(seen.every(thePageDrawsThis)).toBe(true)
  // AND THE TWO PRESSES ARE PAGES OF THE SAME READING, not a second way of deciding what the list is.
  const everybody = await call('GET', '/api/office/embassy?shape=page&everyone=1&limit=50')
  expect((everybody.body as PageReply).rowsTotal, 'everybody adds the owner').toBe(4)
  const withRetired = await call('GET', '/api/office/embassy?shape=page&everyone=1&retired=1&limit=50')
  expect((withRetired.body as PageReply).rowsTotal, 'and the retired one').toBe(5)
  const everyWorld = await call('GET', '/api/office/embassy?shape=page&tests=1')
  expect((everyWorld.body as PageReply).worlds.map((one) => one.world.databaseIdentity)).toContain(WORLD)

  // A PAGE MAY NOT ASK FOR MORE ROWS THAN THE OFFICE ALLOWS, and a row is named as the page names it.
  expect((await call('GET', '/api/office/embassy?shape=page&limit=201')).status).toBe(400)
  expect((await call('GET', '/api/office/embassy?shape=page&row=nonsense')).status).toBe(400)
})

it('2. the whole answer still has every row, and the page is exactly its first drawn rows', async () => {
  const whole = await call('GET', '/api/office/embassy')
  expect(whole.status, whole.text).toBe(200)
  const everything = whole.body as WhatTheEmbassySays
  const drawn = everything.rows.filter(thePageDrawsThis)
  expect(drawn.map((one) => `${one.who.kind}:${one.who.id}`), 'the rule draws the three confirmed visitors').toHaveLength(3)

  const first = await call('GET', '/api/office/embassy?shape=page&limit=2')
  const page = first.body as PageReply
  expect(page.rows.map((one) => `${one.who.kind}:${one.who.id}`)).toEqual(
    drawn.slice(0, 2).map((one) => `${one.who.kind}:${one.who.id}`),
  )

  // WHAT THE PAGE DRAWS IS WHAT IT DREW BEFORE: the whole answer, drawn by the same page component,
  // holds all three; a page reply holds the first two and not the third. The names are made up, so a
  // name can only come from a citizen row.
  const namesOfDrawableRows = drawn.map((one) => one.name ?? '').filter((name) => name !== '')
  const wholePage = renderToStaticMarkup(
    createElement(TheEmbassy, { said: { ...everything, visitors: [] } }),
  )
  for (const name of namesOfDrawableRows) expect(wholePage, `the whole answer draws ${name}`).toContain(name)
  const onePage = renderToStaticMarkup(
    createElement(TheEmbassy, { said: { ...page, visitors: [] } }),
  )
  expect(onePage, 'the first page draws its own rows').toContain(namesOfDrawableRows[0]!)
  expect(onePage, 'and the row after it is not on this page').not.toContain(namesOfDrawableRows[2]!)

  // AND THE REPLY IS UNDER THE 1 MB THE OWNER'S READING IS HELD TO, measured, not assumed.
  expect(Buffer.byteLength(first.text, 'utf8')).toBeLessThan(1_000_000)
})

it('3. the confirm answers the confirmed visitor alone, and the page takes it in place', async () => {
  const before = await call('GET', '/api/office/embassy?shape=page&limit=50')
  expect((before.body as PageReply).visitors.map((one) => one.id)).toEqual([asking])

  const answer = await call('POST', `/api/office/visitors/${asking}/confirm`)
  expect(answer.status, answer.text).toBe(200)
  const row = answer.body['row'] as EmbassyRow | null
  expect(row, 'the reply carries the row the press made').not.toBeNull()
  expect(row?.credential ?? null, 'and it is the confirmed credential\'s row').toBe(asking)
  expect(row?.standing, 'no longer asking').not.toBe('asks to come in')
  expect(answer.body['embassy'], 'and not the whole reading').toBeUndefined()
  expect(Buffer.byteLength(answer.text, 'utf8'), 'the reply is small').toBeLessThan(1_000_000)

  const after = await call('GET', '/api/office/embassy?shape=page&limit=50')
  expect((after.body as PageReply).visitors, 'the asking block is empty').toHaveLength(0)
  expect((after.body as PageReply).rowsTotal, 'and the confirmed visitor is in the list').toBe(4)
})
