// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CONFIRMING A CREDENTIAL CHANGES THE PAGE WHERE IT STANDS. Criterion P77, problem RAOsLifCHGjW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, AND WHAT IT WAS NOT
 * ---------------------------------------------------------------------------------------
 *
 * After the confirm press the whole page looked as if it had reloaded, which was strange.
 *
 * Nothing reloaded the browser. The confirm press called `onChanged`, which is `useAsync`'s
 * re-read, and that hook puts its state back to `loading` on every re-read — so the whole list
 * unmounted, the page drew the loading state instead, and the list came back a moment later. From a
 * chair it is a page refreshing.
 *
 * TWO FIXES WERE POSSIBLE AND THE DESIGN CHOSE ONE (note IyKUXwTqwOTq, objection 3). Changing the
 * hook to keep the last answer while re-reading touches every page in the product and every one of
 * their pictures; that is criterion E5 and its own round. Having the press answer with the list is a
 * change to one door, and it is what is built here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   · the reply carries the one row the confirmed visitor made, built by the reader the Embassy's own
 *     route uses, and no whole reading;
 *   · pressing Let it in reads the Embassy again NO times: the count of those reads does not move
 *     across the press;
 *   · the citizens list is never taken off the page — the same element is still there afterwards,
 *     so nothing unmounted and nothing blanked;
 *   · the block goes when the last credential in it is answered, and the row is in the list.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `row` from the confirm reply in src/server/api/visitors.ts → the page has nothing to add
 *     and the confirmed visitor's citizen row never appears.
 *   put the whole reading back in the reply → the shape case fails on `embassy` being present, and
 *     the press is the whole reading this case exists to keep gone.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'

let app: LiveApp
let page: Page
/** Every request this browser made, so "the page was read again" is a count and not an impression. */
const asked: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify(body),
  })
  const said = (await reply.json()) as Record<string, unknown>
  expect(reply.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  return said
}

/** How many times this browser has read who the office knows. */
function embassyReads(): number {
  return asked.filter((one) => one.includes('/api/office/embassy')).length
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'confirm-in-place', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  page.on('request', (req) => asked.push(req.url()))
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  // TWO CREDENTIALS: one answered from outside the browser, to measure the reply's shape on its own,
  // and one left waiting for the browser's own press.
  await post('/api/office/visitors', {
    handle: 'codex-shape',
    name: 'Codex whose reply is measured',
    role: 'worker',
    conversationPath: '/tmp/codex-shape.jsonl',
  })
  await post('/api/office/visitors', {
    handle: 'codex-far',
    name: 'Codex on the other machine',
    role: 'supervisor',
    conversationPath: '/tmp/codex-far.jsonl',
  })
  // THE BROWSER STARTS SOMEWHERE ELSE, so the case below opens the Embassy for the first time and
  // the count of how often it reads the list means something.
  await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the press answers with the one row', () => {
  it('carries the confirmed visitor’s row on the confirm reply, and no whole reading', async () => {
    const list = (await (await fetch(`${app.api}/api/office/visitors`, { headers: AS_THE_PERSON })).json()) as {
      credentials: { id: string; handle: string; standing: string }[]
    }
    const waiting = list.credentials.find((one) => one.handle === 'codex-shape')
    expect(waiting?.standing, 'it is waiting before the press').toBe('pending')
    // ASKED FROM HERE AND NOT THROUGH THE BROWSER, so the shape is measured on its own before the
    // page is measured using it. The browser's own press is the case below.
    const said = await post(`/api/office/visitors/${String(waiting?.id)}/confirm`, {})
    const row = said['row'] as { who: { id: string }; standing: string } | null | undefined
    expect(row, 'the reply carries the row the press made').toBeTruthy()
    // EMBASSY ROWS ARE KEYED BY THE REGISTRY ID, which since the mint is not the handle.
    const shape = (await (await fetch(`${app.api}/api/participants/agent/codex-shape`, { headers: AS_THE_PERSON })).json()) as {
      participant: { id: string }
    }
    expect(row?.who.id, 'and it is the confirmed visitor').toBe(shape.participant.id)
    expect(row?.standing, 'no longer asking').not.toBe('asks to come in')
    expect(said['embassy'], 'and the whole reading is not in the reply').toBeUndefined()
  })
})

describe('the page in a browser', () => {
  it('opens with the block above the list and reads the Embassy once', async () => {
    asked.length = 0
    await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const said = await page.evaluate(() => ({
      block: document.querySelectorAll('[data-target$="embassy.asking"]').length,
      list: document.querySelectorAll('[data-target$="embassy.citizens"]').length,
    }))
    expect(said.block, 'the block is drawn while something is waiting').toBe(1)
    expect(said.list).toBe(1)
    // THE NUMBER ON OPENING IS NOT ONE AND IS NOT THE MEASUREMENT. React's StrictMode runs an effect
    // twice in development (src/web/main.tsx), so a page served by Vite reads twice on the way up.
    // What this criterion is about is what the PRESS adds, which the next case counts as a change
    // from here rather than as a total.
    expect(embassyReads(), 'the page read the list to draw itself').toBeGreaterThan(0)
  })

  it('changes the block and the list in place, with no second read and nothing unmounted', async () => {
    // MARK THE LIST ELEMENT ITSELF. If the page re-reads, `useAsync` goes back to loading and this
    // element is taken off the page; that is what looked like the whole page reloading.
    await page.evaluate(() => {
      const held = window as unknown as { theList?: Element | null }
      held.theList = document.querySelector('[data-target$="embassy.citizens"]')
    })
    const before = embassyReads()
    await page.getByRole('button', { name: EMBASSY_WORDS.confirm }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-target$="embassy.asking"]').length === 0, null, {
      timeout: 20_000,
    })
    const said = await page.evaluate(() => {
      const held = window as unknown as { theList?: Element | null }
      return {
        sameList: held.theList !== null && held.theList !== undefined && document.contains(held.theList),
        text: document.querySelector('[data-target$="embassy.citizens"]')?.textContent ?? '',
        faults: document.querySelectorAll('.fault').length,
      }
    })
    expect(said.sameList, 'the list was never taken off the page').toBe(true)
    expect(said.text, 'and the agent the owner let in is in it').toContain('Codex on the other machine')
    expect(said.faults, 'and nothing failed while drawing').toBe(0)
    expect(embassyReads() - before, 'the page did not read the Embassy again').toBe(0)
  })
})
