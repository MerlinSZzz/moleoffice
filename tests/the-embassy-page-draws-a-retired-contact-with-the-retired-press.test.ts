// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY PAGE DRAWS A RETIRED CONTACT WHEN THE RETIRED PRESS IS PRESSED. The case the browser
 * test for one handle and two agents presses through the page, read here at the door that answers it.
 *
 * WHAT THIS CASE HOLDS, in an office made up for it: two contacts registered through the ordinary
 * door under one made-up handle, the first retired before the second was made. A page of the
 * Embassy asked with the retired press carries the retired contact and the live one, and the retired
 * contact is marked retired. The same page asked without the press carries no retired row and still
 * carries the live one, and the count the press draws is the number of retired rows the office
 * holds.
 *
 * WHAT WAS WRONG: the door that answers a page asked the page's contact rule with each row's own
 * retirement. That rule refuses every retired row, so a retired contact kept through the retirement
 * check was thrown away by the contact check, and the press brought back nothing.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST: put the row's own retirement back
 * into the page filter in src/server/api/office.ts, so the contact check is handed the row's
 * retirement instead of being told the row is not retired → the retired press carries no retired
 * row and the case goes red.
 *
 * THE STATE IS MADE THROUGH THE DOORS, as the browser test makes it. No browser is started here,
 * and no test world's office is read: the office is made up for this file.
 */

import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PAGE_SHAPE } from '@shared/short-lists.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type EmbassyRow, type WhatTheEmbassyPageSays, type WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let office: TestDb
let app: FastifyInstance
let person: Record<string, string> = {}
/** The two agents of the one made-up handle, by the registry id the door answered. */
let retiredId = ''
let liveId = ''

/** The one made-up handle and name both agents are registered under. */
const THE_HANDLE = 'wren'
const THE_AGENT = { name: 'Wren', runtime: 'claude-code', role: 'worker' }

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, any>; text: string }> {
  const answer = await app.inject({ method, url, headers: person, ...(payload === undefined ? {} : { payload }) })
  const text = answer.body
  return { status: answer.statusCode, body: JSON.parse(text) as Record<string, any>, text }
}

/** One agent registered through the ordinary door, answering the registry id it was filed under. */
async function anAgent(): Promise<string> {
  const started = await call('POST', '/api/agents/started', { handle: THE_HANDLE, ...THE_AGENT })
  expect(started.status, started.text).toBe(201)
  return String((started.body.agent as { id: string }).id)
}

/** The row a reply carries for one registry id, or undefined because it drew none. */
const theRowFor = (said: WhatTheEmbassySays, id: string): EmbassyRow | undefined =>
  said.rows.find((one) => one.who.kind === 'agent' && one.who.id === id)

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

  retiredId = await anAgent()
  const retired = await call('POST', `/api/participants/agent/${retiredId}/retire`, {
    because: 'the first piece of work is done',
  })
  expect(retired.status, retired.text).toBe(200)
  liveId = await anAgent()
  expect(liveId, 'the second agent is a row of its own').not.toBe(retiredId)
}, 60_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

it('draws the retired contact under the retired press, and folds it under the count without it', async () => {
  const withRetired = await call('GET', `/api/office/embassy?shape=${PAGE_SHAPE}&retired=1`)
  expect(withRetired.status, withRetired.text).toBe(200)
  const page = withRetired.body as WhatTheEmbassyPageSays
  const retiredRow = theRowFor(page, retiredId)
  expect(retiredRow, 'the retired contact is drawn by the retired press alone').toBeDefined()
  expect(retiredRow?.retired, 'and the row says it is retired').not.toBeNull()
  const liveRow = theRowFor(page, liveId)
  expect(liveRow, 'the live contact of the same handle is drawn beside it').toBeDefined()
  expect(liveRow?.retired, 'and it does not say it is retired').toBeNull()
  expect(retiredRow?.name, 'the two rows carry the one name').toBe(liveRow?.name)

  const folded = await call('GET', `/api/office/embassy?shape=${PAGE_SHAPE}`)
  expect(folded.status, folded.text).toBe(200)
  const withoutRetired = folded.body as WhatTheEmbassyPageSays
  expect(theRowFor(withoutRetired, retiredId), 'without the press the retired contact is not drawn').toBeUndefined()
  expect(theRowFor(withoutRetired, liveId), 'and the live one still is').toBeDefined()
  expect(withoutRetired.rows.some((one) => one.retired !== null), 'no retired row arrives without the press').toBe(
    false,
  )

  // THE PRESS'S COUNT COMES FROM THE WHOLE LIST, so it is read here from the whole answer's retired
  // rows rather than written as a number this file would have to keep true by hand.
  const whole = await call('GET', '/api/office/embassy')
  expect(whole.status, whole.text).toBe(200)
  const everyRetiredRow = (whole.body as WhatTheEmbassySays).rows.filter((one) => one.retired !== null)
  expect(withoutRetired.retiredCount, 'the press counts the retired rows it folds away').toBe(everyRetiredRow.length)
})
