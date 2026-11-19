// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHELVED PAGE, IN A REAL BROWSER. CRITERION S2.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Every claim in S2 is about what a page draws and what a press does. A rendered-markup test can
 * see that a row carries a reason; it cannot see that the reason is on the screen at phone width in
 * both themes, or that a press writes to the server. So this drives a real browser against a real
 * server in a temporary directory, seeds its own records through the API, and then reads the screen
 * and the database.
 *
 * TWO WIDTHS, 1440 AND 390, IN THE LIGHT LOOK. The page is checked at the widest and the narrowest
 * width, because a shelf entry carries a long reason and a list of linked records, which is exactly
 * the shape that breaks at a narrow width. The dark look sets colour and shadow only, so a case
 * about fit and words keeps light.
 *
 * THE EMPTY PAGE IS ITS OWN TEST, and it runs first, before anything is shelved. Empty is a real
 * state and it must say so in a sentence rather than draw an empty frame.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

const BECAUSE =
  'The design was over-built before any real need and nothing was waiting on it, so it was stopped on purpose.'
const RESTART_WHEN = 'a task that needs the design again'

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'shelved-page', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * EACH TEST STARTS WITH AN EMPTY SHELF. The whole file shares one database, so without this a
 * direction shelved by an earlier test would still be on the page and "the shelf is empty" would be
 * a claim about the test order rather than about the product.
 */
beforeEach(async () => {
  const all = await callApi<{ records: { id: string; data: { shelved?: unknown } }[] }>('/api/records?kind=direction&shape=full')
  for (const record of all.records) {
    if (record.data.shelved !== undefined) {
      await callApi(`/api/records/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        body: { dataPatch: { shelved: null } },
      })
    }
  }
})

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; as?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? AS_PERSON,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

/** File one record as the person and answer with its id. */
async function file(kind: string, title: string, data: Record<string, unknown>, summary?: string): Promise<string> {
  const made = await callApi<{ record: { id: string } }>('/api/records', {
    method: 'POST',
    body: summary === undefined ? { kind, title, data } : { kind, title, data, summary },
  })
  return made.record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  await callApi('/api/links', { method: 'POST', body: { fromId, toId, type } })
}

async function shelve(id: string): Promise<void> {
  await callApi(`/api/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { dataPatch: { shelved: { since: '2026-09-15', because: BECAUSE, restart_when: RESTART_WHEN } } },
  })
}

/** A direction with the three linked records the acceptance names, already on the shelf. */
async function aShelvedDirection(): Promise<{
  id: string
  stoppingPoint: string
  idea: string
  note: string
}> {
  const id = await file(
    'direction',
    'A line of research that was stopped and kept',
    { depth: 'read', depth_reason: 'The design was written and nothing was run.' },
    'A short note on what this line of work was, written before it was put down.',
  )
  const stoppingPoint = await file('problem', 'The gauge went back to the metrology lab', {
    symptom: 'Nothing can be measured until the replacement arrives.',
    state: 'open',
  })
  const idea = await file('idea', 'Try a cheaper tokeniser on the same index', {
    state: 'parked',
    parked_because: 'The index never grew large enough to matter.',
  })
  const note = await file('note', 'What was read before the shelf', { body: 'The three-token comparison, and nothing after it.' })
  await link(id, stoppingPoint, 'about')
  await link(id, idea, 'discusses')
  await link(id, note, 'relates_to')
  await shelve(id)
  return { id, stoppingPoint, idea, note }
}

async function openShelf(): Promise<void> {
  // THE BLANK PAGE FIRST, so the next visit is a fresh document rather than a same-document hash
  // change carrying the previous test's state.
  await page.goto('about:blank')
  await page.goto(`${app.site}/#/shelved`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

// ============================================================================ g. empty

describe('the Shelved page when nothing is on the shelf', () => {
  it('says so in one sentence rather than drawing an empty frame', async () => {
    await openShelf()
    // ORDINARY EMPTINESS IS THE SHORT MARK, not a sentence (report 7FEOshq3mBGG, block b-6), and still no empty frame.
    // Criterion change, wave 13j round 11: the page is a family list (report n9Mjk3c_sJRu block b-17),
    // so the mark is the one line under the list's heading, "On the shelf".
    const empty = page.locator('.flst-group[data-group="shelf"] .flst-quiet')
    expect(await empty.locator('.px-absent').count()).toBe(1)
    expect(await empty.innerText()).not.toContain('Nothing is on the shelf in this project yet.')
    expect(await page.locator('.flst-row').count()).toBe(0)
  }, 120_000)
})

// ============================================================================ d. four widths, both themes

describe('the Shelved page shows a shelved direction at 1440 and 390 in the light look', () => {
  // CRITERION CHANGE, wave 13j round 11. This read "draws its words, date, reason, restart condition
  // and linked records" on the Shelved page. The family lists' design is in report n9Mjk3c_sJRu block b-17 and a
  // decision. It makes a shelf row its title, "Restart when…", the date and a Restore press;
  // the summary and the linked records are on the direction's own page, which the row opens.
  // The reason stays on the row, because the direction's page does not draw it. So the list is held
  // to what it draws, and the direction's page to the linked records.
  it('draws its title, restart condition, reason, date and press, and its page keeps the linked records', async () => {
    const held = await aShelvedDirection()
    for (const width of [1440, 390]) {
      for (const theme of ['light'] as const) {
        await page.setViewportSize({ width, height: 1000 })
        await page.emulateMedia({ colorScheme: theme })
        await openShelf()

        const where = `${String(width)} ${theme}`
        const row = page.locator('.flst-group[data-group="shelf"] .flst-row')
        expect(await row.count(), `no entry at ${where}`).toBe(1)
        expect(await row.locator('.flst-title').innerText(), `the title is missing at ${where}`).toContain(
          'A line of research that was stopped and kept',
        )
        // WHAT WOULD RESTART IT, on the row's one second line.
        expect(await row.locator('.flst-text').innerText(), `the restart condition changed at ${where}`).toContain(RESTART_WHEN)
        // WHY, IN FULL. The stored reason reaches the screen and is not cut.
        expect(await row.locator('.flst-text').innerText(), `the reason changed at ${where}`).toContain(BECAUSE)
        // WHEN: the date it was shelved, as the stored stamp rather than as relative words.
        expect(await row.locator('.flst-state time').getAttribute('datetime')).toBe('2026-09-15')
        // THE ONE PRESS, in reach at every width.
        expect(await row.getByRole('button', { name: 'Restore to open' }).isVisible(), `the press is hidden at ${where}`).toBe(true)
        // AND NOTHING IS HIDDEN OFF THE SIDE AT PHONE WIDTH.
        const box = await row.boundingBox()
        expect(box !== null && box.x + box.width <= width, `the row runs off the side at ${where}`).toBe(true)
      }
    }

    // THE ROW OPENS THE DIRECTION, and its page names the linked records.
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openShelf()
    await page.locator('.flst-group[data-group="shelf"] .flst-open').first().click()
    await page.waitForFunction((id) => window.location.hash.includes(id), held.id, { timeout: 30_000 })
    await waitForThePage(page, 60_000)
    const text = await page.locator('main').innerText()
    expect(text).toContain('The gauge went back to the metrology lab')
    expect(text).toContain('Try a cheaper tokeniser on the same index')
    expect(text).toContain('What was read before the shelf')
  }, 300_000)
})

// ============================================================================ e. the press

describe('the press restores a direction to open, and an agent’s press is refused', () => {
  it('takes it off the shelf as the person, and leaves it on as an agent', async () => {
    const held = await aShelvedDirection()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await openShelf()

    // THE PERSON’S PRESS.
    await page.getByRole('button', { name: 'Restore to open' }).first().click()
    await page.waitForSelector('.flst-group[data-group="shelf"] .flst-quiet', { timeout: 30_000 })
    const after = await callApi<{ record: { data: { shelved?: unknown } } }>(`/api/records/${held.id}`)
    expect(after.record.data.shelved, 'the person’s press did not restore it').toBeUndefined()

    // AND THE SAME PRESS BY AN AGENT IS REFUSED, in the server’s own sentence on the screen.
    await shelve(held.id)
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await page.evaluate(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude-code' }))
    })
    try {
      await openShelf()
      await page.getByRole('button', { name: 'Restore to open' }).first().click()
      // THE REFUSAL IS DRAWN BY ErrorNote, the office's one drawing of a refusal, since wave 13k round 11.
      await page.waitForSelector('.px-error', { timeout: 30_000 })
      expect(await page.locator('.px-error .px-error-msg').innerText()).toContain("a shelf is the person's own act")
      const still = await callApi<{ record: { data: { shelved?: unknown } } }>(`/api/records/${held.id}`)
      expect(still.record.data.shelved, 'an agent’s press restored a shelved direction').toBeDefined()
    } finally {
      await page.evaluate(() => {
        window.localStorage.removeItem('mole-office.actor')
      })
    }
  }, 240_000)
})
