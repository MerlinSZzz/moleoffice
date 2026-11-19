// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE WHERE THE PERSON CONFIRMS THEIR OWN WORDS, IN A BROWSER: look A.
 *
 * WHAT THIS FILE PROVES, in a test office of its own, with a secretary registered on its real card:
 *   1. the sidebar row stands under All projects and counts the notes waiting in every project;
 *   2. the page draws one row per waiting note, with the words exactly as stored, the project's name and who wrote
 *      the note down;
 *   3. Confirm files the words in the note's own project, "Not what I said" keeps the note and marks it, and Confirm
 *      all says how many it will confirm and files them; the count beside the row moves with each press;
 *   4. with nothing waiting, the page says so in words;
 *   5. an agent reading the page sees the notes and no button.
 *
 * PICTURES. With W13Q_YOUR_WORDS_SHOTS naming a folder, a second office is photographed empty and then with notes, at
 * 1440, 990, 660 and 390, in light and dark. Every picture carries a line saying its data is made up.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }
const en = createI18n('en')
const PROJECTS = [
  { id: 'test-kilns', title: 'Kilns' },
  { id: 'test-garden', title: 'Garden' },
]
const shots = process.env['W13Q_YOUR_WORDS_SHOTS']

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function send(app: LiveApp, method: 'GET' | 'POST', path: string, workspace: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, {
    method,
    headers: { ...headers, 'x-mole-office-workspace': workspace },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await reply.text()
  expect(reply.status, `${method} ${path}: ${text.slice(0, 300)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

/** A test office with two projects and a secretary. */
async function anOffice(app: LiveApp): Promise<void> {
  for (const project of PROJECTS) await send(app, 'POST', '/api/workspaces', 'default', AS_THE_PERSON, project)
  await send(app, 'POST', '/api/agents/started', 'default', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
}

/** A note the secretary wrote down for the person, in one project. */
async function prepare(app: LiveApp, workspace: string, title: string, body: string): Promise<string> {
  const made = await send(app, 'POST', '/api/records', workspace, AS_QUILL, { kind: 'note', title, data: { body, for_the_person_to_file: true } })
  return String((made['record'] as { id: string }).id)
}

async function waitingTotal(app: LiveApp): Promise<number> {
  const read = await send(app, 'GET', '/api/the-persons-words?limit=1&offset=0', 'default', AS_QUILL)
  return Number(read['total'])
}

async function open(app: LiveApp, page: Page, query = 'lang=en'): Promise<void> {
  // A FRESH LOAD EVERY TIME: going to the address the page is already on would keep what it read before.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?${query}#/your-words`)
  await waitForThePage(page, 30_000)
  await waitForTheProjects(page)
}

// Test change (wave 13y round 165): the page's row is on the All pages page, with its count, and not in the sidebar.
// On the page itself the All pages entry is lit. So the count is read on All pages, by going there and back.
const ROW = '#main a.ap-page[href="#/your-words"]'

/** The count the page's row on All pages draws, or null when it draws none, once it says `expected`. */
async function theRowsCount(page: Page, expected: string | null): Promise<void> {
  await page.evaluate(() => { location.hash = '#/all-pages' })
  await page.locator(ROW).waitFor()
  await page.waitForFunction(([row, count]) => (document.querySelector(`${row} .shell-badge`)?.textContent ?? null) === count, [ROW, expected] as const)
}

describe('the page of words waiting for the person, in a browser', () => {
  let app: LiveApp
  const notes: Record<'kiln' | 'beans' | 'glaze', string> = { kiln: '', beans: '', glaze: '' }
  const KILN_WORDS = '  Fire it on Friday,\n  not Thursday.  '

  beforeAll(async () => {
    app = await liveApp({ name: 'your-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    await anOffice(app)
    notes.kiln = await prepare(app, 'test-kilns', 'About the kiln', KILN_WORDS)
    notes.beans = await prepare(app, 'test-garden', 'About the beans', 'Plant the beans in May.')
    notes.glaze = await prepare(app, 'test-kilns', 'About the glaze', 'Use the blue glaze.')
    // An ordinary note is not waiting for anybody.
    await send(app, 'POST', '/api/records', 'test-kilns', AS_QUILL, { kind: 'note', title: 'An ordinary note', data: { body: 'Not prepared for anybody.' } })
    await app.page.addInitScript(() => {
      localStorage.setItem('mole-office.workspace', 'test-kilns')
    })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('counts the waiting notes beside the row and draws each one with its words as stored', async () => {
    const page = app.page
    await open(app, page)
    expect(await page.locator('h1.yw-title').textContent()).toBe('Words for you to confirm')
    expect(await page.locator('#shell-side a.shell-link.shell-all-pages').getAttribute('aria-current')).toBe('true')
    const rows = page.locator('.yw-note-row')
    expect(await rows.count()).toBe(3)
    expect(await page.locator(`[data-note="${notes.kiln}"] [data-part="their-words"]`).textContent()).toBe(KILN_WORDS)
    expect(await page.locator(`[data-note="${notes.beans}"] [data-part="their-words"]`).textContent()).toBe('Plant the beans in May.')
    const kilnFacts = await page.locator(`[data-note="${notes.kiln}"] .yw-facts dd`).allTextContents()
    expect(kilnFacts[0]).toBe('Kilns')
    expect(kilnFacts.at(-1)).toBe('Quill')
    expect(await page.locator(`[data-note="${notes.beans}"] .yw-facts dd`).first().textContent()).toBe('Garden')
    expect(await page.locator('[data-part="waiting-count"]').textContent()).toBe('3 notes wait, in every project')
    expect(await page.getByRole('button', { name: 'Confirm all (3)' }).count()).toBe(1)
    expect(await page.locator('[data-part="which-rows"]').textContent()).toBe('Notes 1 to 3 of 3, oldest first.')
    await theRowsCount(page, '3')
  }, 120_000)

  it('confirms one, marks one as not what was said, confirms the rest, and moves the count each time', async () => {
    const page = app.page
    await open(app, page)
    // CONFIRM, in the note's own project, which is not the one in the switcher for the beans.
    await page.locator(`[data-note="${notes.beans}"]`).getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.locator(`[data-note="${notes.beans}"][data-outcome="confirmed"]`).waitFor()
    expect(await page.locator(`[data-note="${notes.beans}"] .yw-done`).textContent()).toContain('Stored as your own words:')
    expect(await waitingTotal(app)).toBe(2)
    await theRowsCount(page, '2')
    await open(app, page)

    // NOT WHAT I SAID keeps the note and marks it.
    await page.locator(`[data-note="${notes.kiln}"]`).getByRole('button', { name: 'Not what I said' }).click()
    await page.locator(`[data-note="${notes.kiln}"][data-outcome="notWhatISaid"]`).waitFor()
    const kept = await send(app, 'GET', `/api/records/${notes.kiln}`, 'test-kilns', AS_THE_PERSON)
    const keptData = (kept['record'] as { data: Record<string, unknown>; deletedAt: unknown }).data
    expect(keptData['body']).toBe(KILN_WORDS)
    expect(typeof keptData['not_what_the_person_said']).toBe('string')
    expect(await waitingTotal(app)).toBe(1)

    // CONFIRM ALL says how many it confirms: the one row still waiting.
    await page.getByRole('button', { name: 'Confirm all (1)' }).click()
    await page.locator(`[data-note="${notes.glaze}"][data-outcome="confirmed"]`).waitFor()
    expect(await waitingTotal(app)).toBe(0)
    expect(await page.locator('[data-part="waiting-count"]').textContent()).toBe('0 notes wait, in every project')
    // The line naming which rows the reading held is gone once a row is pressed: it would contradict the count.
    expect(await page.locator('[data-part="which-rows"]').count()).toBe(0)
    expect(await page.getByRole('button', { name: /^Confirm all/ }).count()).toBe(0)
    await theRowsCount(page, null)
  }, 120_000)

  it('says in words that nothing is waiting', async () => {
    const page = app.page
    await open(app, page)
    await page.getByText(en.t('w13q.yourWords.none')).waitFor()
    expect(await page.locator('.yw-note-row').count()).toBe(0)
  }, 120_000)

  it('shows an agent the notes and no button', async () => {
    const id = await prepare(app, 'test-garden', 'About the hedge', 'Cut the hedge in June.')
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      await context.grantPermissions(['local-network-access'], { origin: app.site })
      await context.addInitScript(`localStorage.setItem('mole-office.workspace', 'test-kilns'); localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'quill' }))`)
      const page = await context.newPage()
      await open(app, page)
      await page.locator(`[data-note="${id}"]`).waitFor()
      expect(await page.locator(`[data-note="${id}"] [data-part="their-words"]`).textContent()).toBe('Cut the hedge in June.')
      expect(await page.locator('.yw-body button').count()).toBe(0)
      expect(await page.getByText('Only the person can confirm these words.').count()).toBe(1)
    } finally {
      await context.close()
    }
  }, 120_000)
})

describe.skipIf(!shots)('pictures of the page, with made-up data', () => {
  let app: LiveApp
  const widths = [1440, 990, 660, 390] as const

  beforeAll(async () => {
    app = await liveApp({ name: 'your-words-pictures', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    await anOffice(app)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  async function photograph(name: string): Promise<void> {
    for (const width of widths) {
      for (const theme of ['light', 'dark'] as const) {
        const context = await app.browser.newContext({ viewport: { width, height: 1100 }, colorScheme: theme })
        try {
          await context.grantPermissions(['local-network-access'], { origin: app.site })
          await context.addInitScript(`localStorage.setItem('mole-office.workspace', 'test-kilns'); localStorage.setItem('mole-office.preset.theme', '${theme}')`)
          const page = await context.newPage()
          await open(app, page)
          const shown = page.locator('.yw-body, .yw .px-mark').first()
          await shown.waitFor()
          await page.waitForTimeout(500)
          // THE LABEL, in the picture itself: nothing on this page is a real note.
          await putTheMadeUpLabelIn(page, 'Made-up data in a test office. Not a real note.', shown, 'the Words for you to confirm page')
          await page.screenshot({ path: join(shots ?? '', `${name}-${String(width)}-${theme}.png`) })
        } finally {
          await context.close()
        }
      }
    }
  }

  it('photographs the page empty, then with notes', async () => {
    mkdirSync(shots ?? '', { recursive: true })
    await photograph('your-words-empty')
    await prepare(app, 'test-kilns', 'About the kiln', 'Fire it on Friday, not Thursday. The new shelves need the slow program.')
    await prepare(app, 'test-garden', 'About the beans', 'Plant the beans in May,\nafter the last frost.')
    await prepare(app, 'test-kilns', 'About the glaze', 'Use the blue glaze on the bowls, and the white one on the plates.')
    await prepare(app, 'test-garden', 'About the shed', 'Paint the shed green.')
    await photograph('your-words-notes')
  }, 900_000)
})
