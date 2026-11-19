// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW WRITE FROM AN UNKNOWN AGENT IS REFUSED.
 * Problem 0pQjhpTHp1_f.
 *
 * The panel's sentence said "Nothing here stops any of them", and the office has refused a record
 * write from an unknown agent since 16 September 2026. Criterion M14 of design/messages/ACCEPTANCE.md,
 * as amended on 30 September 2026, says the list shows only the writers that
 * may write without a registration and the unknown agents that wrote before the refusal existed. The
 * sentence is now `homeWords.unregistered.saidNow`, in both word lists.
 *
 * WHAT THIS FILE PROVES, in a real browser:
 *   1. the thing the sentence says is so: a record write over HTTP from an agent id no registry holds
 *      is refused with 403.
 *
 * The rows are one made-up writer added to this test office's own reply, because no new write can
 * come from an unknown agent over HTTP any more, which is case 1.
 *
 * MUTATION, NAMED, AFTER A CONTROL RUN (the proofs file of wave 13k round 20): the old sentence put back
 * as the value of `homeWords.unregistered.saidNow` in src/shared/words/en.ts and zh.ts. Cases 2 and 3
 * go red: the panel no longer says that a new write is refused.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, type LiveApp } from './helpers.ts'

const STRANGER = 'made-up-stranger-52'
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'unregistered-panel-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  // ONE MADE-UP WRITER on the reading the panel is drawn from, the page about who is working.
  await app.page.route('**/api/working*', async (route) => {
    const response = await route.fetch()
    const answer = (await response.json()) as { unregistered?: unknown[] }
    answer.unregistered = [{ id: STRANGER, writes: 2, lastWroteAt: '2026-09-14 09:12:05' }]
    await route.fulfill({ response, json: answer })
  })
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('refuses a record write over HTTP from an agent id no registry holds', async () => {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': STRANGER,
    },
    body: JSON.stringify({ kind: 'note', title: 'A note nobody may file' }),
  })
  expect(reply.status, await reply.text()).toBe(403)
}, 60_000)

