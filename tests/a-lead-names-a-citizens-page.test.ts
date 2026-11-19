// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEAD CAN NAME A CITIZEN'S PAGE, AND THE DOOR CHECKS THE ADDRESS. CRITERION M97.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A lead the secretary wrote (problem `6lGc8BlpClOG`) went to a summary of an agent under a report page,
 * and the press it was sent for, Change work area, was not there. Change work area is on the citizen's
 * page, `#/who/agent/<its handle>`; the lead had gone to the agent RECORD, which draws the record's own view.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE ANY OF THIS WAS BUILT, 9 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Seven leads were sent through the write door against a fresh server, and what it did with each was
 * written down:
 *
 *   {kind: page, route: /who/agent/lead-bot}   201, stored
 *   {kind: page, route: /who/person/<owner>}   201, stored
 *   {kind: page, path:  /who/agent/lead-bot}   400  "data.lead.target.route is required" and
 *                                                   "unknown key path — a PageTarget has no field
 *                                                    by that name. It takes: kind, route, workspaceId"
 *   {kind: page, route: /there-is-no-such-page} 201, stored
 *   {kind: page, route: /who/agent}             201, stored
 *   {kind: page, route: not-even-an-address}    201, stored
 *   {kind: page, route: ""}                     400  a blank value is refused
 *
 * TWO FACTS CAME OUT OF THAT, AND ONE OF THEM CORRECTS THE PROBLEM RECORD. A lead could already name
 * a citizen's page: what the door refused on 9 September was the KEY, because the field is called
 * `route` and the lead was written with `path`. The problem's stated cause — that the lead shape
 * accepts a record target only — is wrong, and the record has been corrected. What was genuinely
 * missing is the other half: the door stored every address ever sent to it, including three that no
 * page in this product answers to, so a lead could take a reader to the not-found page and nothing
 * anywhere said the lead had been wrong.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST WOULD CATCH
 * ---------------------------------------------------------------------------------------
 *
 *   1. Stop accepting a citizen's page and the first test fails.
 *   2. Accept any address — the state of the door until 9 September 2026 — and the second fails:
 *      three addresses no page answers to are stored.
 *   3. Refuse an address the app really has, which is what a hand-written list of pages would do
 *      the day a page was added, and the third fails.
 *   4. Break following a page lead and the fourth fails: the reader does not land on the citizen's
 *      page, or the Change work area press is not there when they do.
 *   5. Take the press off the agent's record view and the fifth fails: from a lead to the record
 *      there is no way on to the page where the presses are.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
/** The record id of the agent record, which is NOT the address of its citizen's page. */
let agentRecordId = ''
/** The handle, which IS the address of its citizen's page: the registry keys agents by handle. */
const HANDLE = 'lead-bot'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_GUIDE = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
}

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** Send a lead pointing at this target. Answers what the door said and what it said back. */
async function sendALeadTo(target: unknown): Promise<{ status: number; said: string; id: string }> {
  const res = await write(AS_THE_GUIDE, {
    kind: 'message',
    title: 'Come and look',
    data: {
      body: 'Come and look at this.',
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target },
    },
  })
  const body = (await res.json()) as { record?: { id: string }; error?: string }
  return { status: res.status, said: body.error ?? '', id: body.record?.id ?? '' }
}

/**
 * MARK EVERY OFFER READ, so the browser tests below start with none waiting.
 *
 * The door tests above send eleven leads and every one of them is an offer to this reader. Left
 * waiting they stack up in the corner of the screen, and the point of each browser test below is one
 * offer and where it goes. This is the product's own mark, through the product's own door.
 */
async function noOffersAreWaiting(): Promise<void> {
  const res = await fetch(`${app.api}/api/messages`, { headers: AS_THE_OWNER })
  const held = (await res.json()) as { messages: { id: string }[] }
  expect(res.status, JSON.stringify(held)).toBe(200)
  for (const one of held.messages) {
    await fetch(`${app.api}/api/messages/${one.id}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
  }
}

/** Take the one offer waiting on the page, and answer with the address the browser landed on. */
async function followTheOffer(): Promise<string> {
  await app.page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
  await app.page.locator('.px-lead-go').first().click()
  await app.page.waitForFunction(() => window.location.hash !== '#/records', undefined, { timeout: 30_000 })
  await waitForThePage(app.page, 60_000)
  return app.page.evaluate(() => window.location.hash)
}

beforeAll(async () => {
  app = await liveApp({ name: 'lead-citizen', viewport: { width: 1440, height: 900 } })
  const agent = await write(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Lead Bot',
    data: { handle: HANDLE, runtime: 'claude-code', state: 'active', workArea: ['src/web'] },
  })
  const made = (await agent.json()) as { record?: { id: string } }
  expect(agent.status, JSON.stringify(made)).toBe(201)
  agentRecordId = made.record?.id ?? ''
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ==================================================================== the door, on its own

describe('the write door and a lead that names a page', () => {
  it('takes a citizen’s page, for an agent and for a person', async () => {
    for (const route of [`/who/agent/${HANDLE}`, `/who/person/${THE_PERSON}`]) {
      const out = await sendALeadTo({ kind: 'page', route })
      expect(out.status, `the door refused ${route}: ${out.said}`).toBe(201)
    }
  }, 120_000)

  it('refuses an address this product has no page at, and names the address', async () => {
    // THE THREE THAT WERE STORED ON 9 SEPTEMBER: a page nobody has, the citizen's address one
    // segment short, and something that is not an address at all.
    for (const route of ['/there-is-no-such-page', '/who/agent', 'not-even-an-address']) {
      const out = await sendALeadTo({ kind: 'page', route })
      expect(out.status, `the door stored a lead to ${route}`).toBe(400)
      expect(out.said, 'the refusal does not name the address it refused').toContain(route)
      expect(out.said, 'the refusal does not say that nothing was stored').toContain('nothing was stored')
    }
  }, 120_000)

  it('takes every address the app really has, including the ones already stored', async () => {
    // A HAND-WRITTEN LIST OF PAGES WOULD PASS THE TEST ABOVE AND FAIL THIS ONE the day somebody
    // added a page. The door reads the app's own parser, so these are not a list kept in step by
    // hand — they are a sample, and the two stored on the owner's own installation are in it.
    for (const route of ['/records', '/messages', '/plan', '/agent-use', '/', `/r/${agentRecordId}`]) {
      const out = await sendALeadTo({ kind: 'page', route })
      expect(out.status, `the door refused ${route}, which is an address this app has: ${out.said}`).toBe(201)
    }
  }, 120_000)

  it('says which key a page target is identified by, when a lead is written with the wrong one', async () => {
    // WHAT THE SECRETARY ACTUALLY HIT on 9 September, kept as a test because the refusal is the fix: a
    // caller that writes `path` is told the field is `route` and told what a page target takes.
    const out = await sendALeadTo({ kind: 'page', path: `/who/agent/${HANDLE}` })
    expect(out.status).toBe(400)
    expect(out.said, 'the refusal does not name the field a page target is identified by').toContain('route')
    expect(out.said, 'the refusal does not say which keys a page target takes').toContain('workspaceId')
  }, 60_000)
})

// ============================================================ following one, in a browser

describe('following a lead to a citizen’s page', () => {
  it('lands on that page, where the Change work area press is', async () => {
    await noOffersAreWaiting()
    const sent = await sendALeadTo({ kind: 'page', route: `/who/agent/${HANDLE}` })
    expect(sent.status, sent.said).toBe(201)

    const landed = await followTheOffer()
    expect(landed, 'following the lead did not land on the citizen’s page').toBe(`#/who/agent/${HANDLE}`)

    // AND THE PRESS THE OWNER WAS SENT TO USE IS ON IT. This is the whole of the owner's complaint: they followed a
    // lead to press something and landed where the press is not.
    const press = app.page.locator('button', { hasText: 'Change work area' }).first()
    await press.waitFor({ state: 'visible', timeout: 30_000 })
  }, 240_000)
})

describe('following a lead to an agent’s record', () => {
  it('opens the record view, and that view leads on to the citizen’s page in one press', async () => {
    await noOffersAreWaiting()
    const sent = await sendALeadTo({ kind: 'record', recordId: agentRecordId, workspaceId: 'default' })
    expect(sent.status, sent.said).toBe(201)

    // THE RECORD VIEW, WHICH IS WHAT A LEAD TO A RECORD HAS ALWAYS OPENED AND STILL DOES. The
    // criterion does not move this lead; it puts a way on at the end of it.
    const landed = await followTheOffer()
    expect(landed, 'a lead to an agent record no longer opens the record').toBe(`#/r/${agentRecordId}`)

    // AND THE PRESS ON THAT VIEW IS REACHABLE, which is a claim about the page and not only about
    // the markup: the pane the lead just opened sits over the same corner, and a press underneath it
    // is a press nobody can make. `click` fails rather than passing if anything is over it, which is
    // how the pane's own height cap came to be measured on 9 September 2026.
    const onward = app.page.locator('.rp-actions a', { hasText: 'Open its page' }).first()
    await onward.waitFor({ state: 'visible', timeout: 30_000 })
    await onward.click()
    // THE PRESS LINKS BY REGISTRY ID, and a new agent's id is minted, so it is read rather than assumed.
    const read = await fetch(`${app.api}/api/participants/agent/${HANDLE}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const agentId = ((await read.json()) as { participant: { id: string } }).participant.id
    await app.page.waitForFunction(
      (hash: string) => window.location.hash === hash,
      `#/who/agent/${agentId}`,
      { timeout: 30_000 },
    )
    await waitForThePage(app.page, 60_000)
    const press = app.page.locator('button', { hasText: 'Change work area' }).first()
    await press.waitFor({ state: 'visible', timeout: 30_000 })
  }, 240_000)
})
