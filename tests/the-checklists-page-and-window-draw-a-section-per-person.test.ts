// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS PAGE DRAWS A SECTION PER PERSON, AND THE CHECKLISTS WINDOW ITS NAMES BEHIND BACK. Wave 13y round 175:
 * the owner chose design E, as decided. In a real browser, on this test's own office.
 *
 * The page has one section for each person who owns a checklist: the reader's first, then each secretary's, then each
 * other agent's, each group by name. Each checklist is a card, with its unfinished items, its finished items folded and
 * a row to add an item. The window opens on the reader's checklists as the same cards. Back, at the start of its head,
 * shows a row of names in the cards' place, the reader's first and current, and choosing a name shows that person's
 * checklists as the same cards.
 *
 * Test change (wave 13y round 175, the names behind Back): the window's names are folded behind a Back press, as
 * decided, and they are plain presses, not tabs, the press of the person shown marked with aria-current. Before, a
 * row of names in tabs was drawn across the window's top, above the cards. Case 5 reads the cards first, then presses
 * Back, found by its words, before it reads or chooses a name, and presses Back again to read which name is current;
 * it reads aria-current where it read aria-selected, and asks that the page not scroll sideways on both screens. Case
 * 7 presses Back before it chooses the agent's name. `countsInTheWindow` reads the window's name presses, and
 * `theWindowsCounts` presses Back before it reads them. Case 11 presses Back before it reads the names, and reads
 * aria-current where it read aria-selected. What each case checks is unchanged.
 *
 * The general cases run at 1440 in light and 390 in dark. Cases 9 and 10 retain both looks; case 10 compares
 * the widths within each look. The case's name says which.
 *
 * 1. THE SECTIONS ARE IN ORDER, AND THE RIGHT ONES ARE OPEN. Fails if the reader's section is not first or not open,
 *    if the reader's head has no open count beside the name, if that count is not bold as another owner's is while an
 *    item of the reader's waits on the reader, if the secretary's section does not come before the other agents' or
 *    those are not in name order, if the section with an item waiting on the reader is folded, if a folded section
 *    draws a card or lacks its name and open count, if two of the reader's cards are not side by side at 1440 or not
 *    stacked at 390, or if the page is wider than the window.
 * 2. A CARD'S ADD ROW ADDS AN ITEM. Fails if Enter in a card's add field does not store the item through the door, if
 *    the card does not show it, or if the field is not empty and focused after.
 * 3. "NEW CHECKLIST" MAKES ONE IN THE READER'S SECTION. Fails if the press does not open a title field, if Enter does
 *    not make the checklist with a 201, or if the new card is not in the reader's section.
 * 4. THE DONE BOX MARKS AN ITEM DONE. Fails if the door does not hold the item as done, if the item stays among the
 *    card's unfinished items, or if it is not under the card's folded finished items once they are opened.
 * 5. THE WINDOW OPENS ON THE READER'S NAME. Fails if, after Back, the reader's name is not first and current, if one
 *    of the reader's cards lacks an add row, if adding there does not work as on the page, if a card in the second
 *    project lacks the project's name, if choosing another name does not show that person's checklists or does not make
 *    that name the current one, or if the page scrolls sideways. How the row of names fits the window is case 11's.
 * 6. AN ADDRESS OPENS A FOLDED SECTION. Fails if `#/checklists/<id>` of an agent's checklist in a folded section does
 *    not open that section, mark that card and bring it into view, or if it opens another section.
 *
 * Cases 7 to 11 come from five fixes asked after the pictures of design E, as decided.
 *
 * 7. AN ITEM THAT WAITS ON THE READER SAYS "WAITS ON YOU". Fails if the item in another owner's section, on the page or
 *    in the window, does not draw the words of `checklists.state.waitsOnYou`, or still draws those of
 *    `checklists.state.waiting`, seen or read to a screen reader.
 * 8. WITH NO PROJECT CHOSEN, THE PAGE SHOWS EVERY PROJECT. Fails if a card from the second project is not on the page
 *    with its project's name, or if a person's count on the page, the reader's among them, is not the count beside
 *    their name in the window. With one project chosen on the page, fails if a card of another project is drawn, if
 *    another owner's count is not that project's alone, or if the window's counts changed with the page's choice.
 * 9. AT 390 THE OPEN WINDOW COVERS THE PAGE UNDER IT. The window is a sheet from under its press to the foot of the
 *    screen, from edge to edge, as decided by this round. Fails if a point near the foot of that box, or near the foot
 *    of the window's own box, lands on anything outside the window. Run at 390 only.
 * 10. AT 390 THE PAGE DRAWS ITS ITEM ROWS AS AT 1440. Fails if an unfinished row on the page has another border, ring
 *    or background at 390 than the same row at 1440. At 390 the side bar is not drawn, so the page reads the projects'
 *    names itself, and they can come after the cards; the case holds them back until the cards are drawn, so they
 *    always do. The ring a row has for a second after it moved is drawn as a shadow, so the shadow is compared too.
 *    Run once in each look.
 * 11. THE WINDOW'S ROW OF NAMES WRAPS. Fails if, with four owners, the names Back shows do not take more than one
 *    line, if a name lies outside the row's box or is cut, if the reader's name is not first and current, if the
 *    others are not in their order, or if a name has no count.
 *
 * Every word checked is read from its key with t().
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and the browser is the person. Every
 * agent, project and checklist here is made up, and nothing is asked of the live office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const IN_B = { ...PERSON, 'x-mole-office-workspace': 'sample-project-b' }

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function theItems(list: string): Promise<Record<string, any>[]> {
  return (await send('GET', `/api/checklists/${list}`, undefined))['checklist'].items as Record<string, any>[]
}

/** The names are long enough that the window's row of names is wider than the window at 390. */
const SECRETARY = 'Wren Abernethy'
const LARK = 'Lark Fenwick'
const MOSS = 'Moss Halloran'

let kiln = ''
let glaze = ''
let shelf = ''
let tools = ''

const RUNS = [
  { width: 1440, height: 900, theme: 'light' },
  { width: 1440, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
] as const
type Run = (typeof RUNS)[number]
const GENERAL_RUNS = RUNS.filter((run) => (run.width === 1440 && run.theme === 'light') || (run.width === 390 && run.theme === 'dark'))
const named = (run: Run): string => `at ${String(run.width)}, ${run.theme}`

beforeAll(async () => {
  app = await liveApp({ name: 'checklists-section-per-person', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/workspaces', { id: 'sample-project-b', title: 'Sample project B' })
  await send('POST', '/api/agents/started', { handle: 'wren', name: SECRETARY, role: 'secretary' })
  await send('POST', '/api/agents/started', { handle: 'lark', name: LARK, role: 'worker' })
  await send('POST', '/api/agents/started', { handle: 'moss', name: MOSS, role: 'worker' })
  // A DONE ITEM NEEDS EVIDENCE when the checklist is made, so the three done items below name one made-up report.
  const proof = (
    await send('POST', '/api/records', { kind: 'report', title: 'Made-up proof', data: { for: 'The owner', date: '2026-10-09', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } })
  )['record'].id as string
  const DONE = { state: 'done', evidence: [{ kind: 'report', record: proof }] }
  kiln = (
    await send('POST', '/api/checklists', {
      title: 'Kiln checklist',
      items: [{ words: 'Fire the test tiles', ...DONE }, { words: 'Load the kiln' }, { words: 'Write the firing log' }],
    })
  )['checklist'].id as string
  // AN ITEM OF THE READER'S OWN WAITS ON THE READER, so case 1 can see the reader's count drawn bold.
  await send('POST', '/api/checklists', {
    title: 'Studio checklist',
    items: [{ words: 'Sweep the studio floor' }, { words: 'Choose the studio lamp', state: 'waiting on the owner' }],
  })
  glaze = (await send('POST', '/api/checklists', { title: 'Glaze checklist', items: [{ words: 'Mix the blue glaze' }] }, IN_B))['checklist'].id as string
  await send(
    'POST',
    '/api/checklists',
    { title: "Wren's diary list", items: [{ words: 'Book the kiln repair' }, { words: 'Order more clay' }, { words: 'Send the invoices', ...DONE }] },
    AS('wren'),
  )
  shelf = (
    await send(
      'POST',
      '/api/checklists',
      { title: "Lark's shelf list", items: [{ words: 'Clear the top shelf' }, { words: 'Choose the shelf paint', state: 'waiting on the owner' }] },
      AS('lark'),
    )
  )['checklist'].id as string
  tools = (
    await send(
      'POST',
      '/api/checklists',
      {
        title: "Moss's tool list",
        items: [{ words: 'Sharpen the clay knives' }, { words: 'Clean the wheel' }, { words: 'Count the brushes' }, { words: 'Oil the hinges', ...DONE }],
      },
      AS('moss'),
    )
  )['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** A browser window of this run's width and look, at the address, waiting for what it names. Closed by the case. */
async function opened(run: Run, hash: string, waitFor: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: run.width, height: run.height } })
  await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), run.theme)
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
  return { page, close: () => context.close() }
}

const READER = '.ckl-section[data-reader="yes"]'
const openRows = (card: Locator): Locator => card.locator('.cks-items:not(.ckp-folded) > .ckp-item')

async function sideways(page: Page): Promise<{ page: number; window: number }> {
  return page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }))
}

/** Types words into a card's add field and presses Enter, and answers the door's status. */
async function add(page: Page, card: Locator, words: string, list: string): Promise<number> {
  const field = card.locator('.cks-add-field')
  await field.fill(words)
  const answered = page.waitForResponse((reply) => reply.url().includes(`/api/checklists/${list}/items`) && reply.request().method() === 'POST')
  await field.press('Enter')
  return (await answered).status()
}

async function addsAndKeepsTheField(page: Page, card: Locator, words: string, list: string): Promise<void> {
  const field = card.locator('.cks-add-field')
  expect(await field.getAttribute('aria-label')).toBe(t('checklists.addItemTo', { title: 'Kiln checklist' }))
  expect(await add(page, card, words, list), 'the door stores the item').toBe(201)
  await openRows(card).filter({ hasText: words }).waitFor({ timeout: 10_000 })
  await expect.poll(() => field.inputValue(), { timeout: 10_000 }).toBe('')
  expect(await field.evaluate((one) => one === document.activeElement), 'the field keeps focus').toBe(true)
  expect((await theItems(list)).some((one) => one['words'] === words), 'the door holds the item').toBe(true)
}

describe('1. the sections are in order, and the right ones are open', () => {
  for (const run of GENERAL_RUNS) {
    it(`1. the reader's section first and open, the waiting one open, the others folded, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/checklists', `${READER} .cks-card`)
      try {
        const sections = await page.$$eval('.ckl-section', (all) =>
          all.map((one) => {
            const besideTheName = one.querySelector('.ckl-head .ckl-name + .cks-count')
            return {
              reader: one.getAttribute('data-reader'),
              open: one.getAttribute('data-open'),
              name: one.querySelector('.ckl-name')?.textContent ?? '',
              count: one.querySelector('.cks-count')?.textContent ?? null,
              waiting: one.querySelector('.cks-count')?.getAttribute('data-waiting') ?? null,
              besideTheName: besideTheName?.textContent ?? null,
              weight: besideTheName === null ? null : getComputedStyle(besideTheName).fontWeight,
              cards: one.querySelectorAll('.cks-card').length,
            }
          }),
        )
        expect(sections[0]?.reader, "the reader's section is first").toBe('yes')
        expect(sections[0]?.open).toBe('yes')
        expect(sections.filter((one) => one.reader === 'yes')).toHaveLength(1)
        const others = sections.filter((one) => [SECRETARY, LARK, MOSS].includes(one.name))
        expect(others.map((one) => one.name), 'the secretary, then the other agents by name').toEqual([SECRETARY, LARK, MOSS])
        const [wren, lark, moss] = others
        expect(lark?.open, 'the section with an item waiting on the reader opens by itself').toBe('yes')
        expect(lark?.cards).toBe(1)
        expect(lark?.waiting).toBe('yes')
        // THE READER'S OWN COUNT, in the head beside the name. Case 8 checks that it is the window's count.
        expect(sections[0]?.besideTheName ?? 'none', "the reader's head: an open count beside the name").toMatch(/^\d+$/)
        expect(sections[0]?.waiting, "the reader's count, while the studio lamp waits on the reader").toBe('yes')
        expect(sections[0]?.weight, "the reader's count is bold, as Lark's is").toBe(lark?.weight)
        // The secretary's 3: its own list's 2 open items, and the item the office puts on a secretary's own checklist when the card is given.
        for (const [one, count] of [[wren, '3'], [moss, '3']] as const) {
          expect(one?.open, `${one?.name ?? ''}: folded`).toBe('no')
          expect(one?.cards, `${one?.name ?? ''}: no card while folded`).toBe(0)
          expect(one?.count, `${one?.name ?? ''}: the open count`).toBe(count)
        }
        const boxes = await page.locator(`${READER} .cks-card`).evaluateAll((cards) =>
          cards.slice(0, 2).map((card) => {
            const at = card.getBoundingClientRect()
            return { top: Math.round(at.top), left: Math.round(at.left), bottom: Math.round(at.bottom) }
          }),
        )
        expect(boxes, "two of the reader's cards").toHaveLength(2)
        const [first, second] = boxes as [{ top: number; left: number; bottom: number }, { top: number; left: number; bottom: number }]
        if (run.width === 1440) {
          expect(second.top, 'side by side: the same top').toBe(first.top)
          expect(second.left, 'side by side: another left').not.toBe(first.left)
        } else {
          expect(second.left, 'stacked: the same left').toBe(first.left)
          expect(second.top, 'stacked: the second below').toBeGreaterThanOrEqual(first.bottom)
        }
        const wide = await sideways(page)
        expect(wide.page, 'the page is no wider than the window').toBeLessThanOrEqual(wide.window)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe("2. a card's add row adds an item", () => {
  for (const run of GENERAL_RUNS) {
    it(`2. Enter in the kiln card's add field stores the item, shows it and keeps the field, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/checklists', `${READER} .cks-card[data-list="${kiln}"]`)
      try {
        const card = page.locator(`${READER} .cks-card[data-list="${kiln}"]`)
        await addsAndKeepsTheField(page, card, `Sweep the kiln room, ${named(run)}`, kiln)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('3. "New checklist" makes one in the reader\'s section', () => {
  for (const run of GENERAL_RUNS) {
    it(`3. the press opens a title field, and Enter makes the checklist, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/checklists', `${READER} .cks-card`)
      try {
        const title = `Tile trial, ${named(run)}`
        expect(await page.locator('.ckl-section .cks-new').count(), "only the reader's section has the press").toBe(1)
        await page.locator(READER).getByRole('button', { name: t('checklists.newChecklist'), exact: true }).click()
        const field = page.locator(`${READER} .cks-new-field`)
        expect(await field.getAttribute('aria-label')).toBe(t('checklists.newChecklistTitle'))
        await field.fill(title)
        const answered = page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/checklists' && reply.request().method() === 'POST')
        await field.press('Enter')
        expect((await answered).status(), 'the door makes the checklist').toBe(201)
        await page.locator(`${READER} .cks-card .cks-title`, { hasText: title }).waitFor({ timeout: 10_000 })
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('4. the done box marks an item done', () => {
  for (const run of GENERAL_RUNS) {
    it(`4. the box on an unfinished item marks it done, and it goes under the folded finished items, ${named(run)}`, async () => {
      const words = `Wipe the kiln shelves, ${named(run)}`
      await send('POST', `/api/checklists/${kiln}/items`, { words })
      const { page, close } = await opened(run, '/checklists', `${READER} .cks-card[data-list="${kiln}"] .ckp-item`)
      try {
        const card = page.locator(`${READER} .cks-card[data-list="${kiln}"]`)
        const row = openRows(card).filter({ hasText: words })
        await row.getByRole('button', { name: t('w13j.checklistDone.box', { words }), exact: true }).click()
        await expect.poll(async () => (await theItems(kiln)).find((one) => one['words'] === words)?.['state'], { timeout: 10_000 }).toBe('done')
        await expect.poll(() => openRows(card).filter({ hasText: words }).count(), { timeout: 10_000 }).toBe(0)
        const fold = card.locator('.ckp-fold')
        if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
        await card.locator('.cks-items.ckp-folded > .ckp-item', { hasText: words }).waitFor({ timeout: 10_000 })
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe("5. the window opens on the reader's name", () => {
  for (const run of GENERAL_RUNS) {
    it(`5. the reader's name first and chosen, an add row on each card, another name's checklists, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/decisions', '.ckw-press')
      try {
        await page.click('.ckw-press')
        const panel = page.locator('.ckw-panel')
        await panel.locator(`.cks-card[data-list="${kiln}"]`).waitFor({ timeout: 30_000 })
        const back = panel.getByRole('button', { name: t('checklists.window.back'), exact: true })
        const names = panel.locator('.ckw-names .ckw-name')
        const cards = panel.locator('.cks-card')
        const many = await cards.count()
        expect(await panel.locator('.cks-card .cks-add-field').count(), 'every card has its add row').toBe(many)
        await expect
          .poll(() => panel.locator(`.cks-card[data-list="${glaze}"] .cks-project`).innerText(), { timeout: 10_000 })
          .toContain('Sample project B')
        await addsAndKeepsTheField(page, panel.locator(`.cks-card[data-list="${kiln}"]`), `Stack the kiln bricks, ${named(run)}`, kiln)
        const wide = await sideways(page)
        expect(wide.page, 'the page does not scroll sideways').toBeLessThanOrEqual(wide.window)
        await back.click()
        await names.first().waitFor({ timeout: 10_000 })
        expect(await names.first().getAttribute('aria-current'), "the reader's name is first and current").toBe('true')
        expect(await panel.locator('.ckw-names').getAttribute('aria-label')).toBe(t('checklists.whose'))
        const wideWithTheNames = await sideways(page)
        expect(wideWithTheNames.page, 'with the names shown, the page does not scroll sideways').toBeLessThanOrEqual(wideWithTheNames.window)
        const lark = names.filter({ hasText: LARK })
        await lark.click()
        await panel.locator(`.cks-card[data-list="${shelf}"]`).waitFor({ timeout: 10_000 })
        expect(await panel.locator(`.cks-card[data-list="${kiln}"]`).count(), "the reader's checklist is not shown").toBe(0)
        expect(await panel.locator(`.cks-card[data-list="${shelf}"] .cks-add-field`).count()).toBe(1)
        await back.click()
        await lark.waitFor({ timeout: 10_000 })
        expect(await lark.getAttribute('aria-current')).toBe('true')
        expect(await names.first().getAttribute('aria-current')).toBeNull()
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('6. an address opens a folded section', () => {
  for (const run of GENERAL_RUNS) {
    it(`6. the address of an agent's checklist opens its section and marks its card, ${named(run)}`, async () => {
      const { page, close } = await opened(run, `/checklists/${tools}`, '.cks-card[data-marked="yes"]')
      try {
        const marked = page.locator('.cks-card[data-marked="yes"]')
        expect(await marked.count()).toBe(1)
        expect(await marked.getAttribute('data-list')).toBe(tools)
        const section = page.locator('.ckl-section', { has: marked })
        expect(await section.getAttribute('data-open')).toBe('yes')
        expect(await section.locator('.ckl-name').innerText()).toBe(MOSS)
        const wren = page.locator('.ckl-section', { has: page.locator('.ckl-name', { hasText: SECRETARY }) })
        expect(await wren.getAttribute('data-open'), "the secretary's section stays folded").toBe('no')
        await expect
          .poll(() => marked.evaluate((card) => {
            const at = card.getBoundingClientRect()
            return at.top < window.innerHeight && at.bottom > 0
          }), { timeout: 10_000 })
          .toBe(true)
        const wide = await sideways(page)
        expect(wide.page).toBeLessThanOrEqual(wide.window)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('7. an item that waits on the reader says "Waits on you"', () => {
  for (const run of GENERAL_RUNS) {
    it(`7. the page and the window draw the new words under the waiting item, and never the old ones, ${named(run)}`, async () => {
      const waits = t('checklists.state.waitsOnYou')
      const before = t('checklists.state.waiting')
      const { page, close } = await opened(run, '/checklists', `.cks-card[data-list="${shelf}"]`)
      try {
        const onThePage = page.locator(`.ckl .cks-card[data-list="${shelf}"] .ckp-item`, { hasText: 'Choose the shelf paint' })
        expect(await onThePage.locator('.ckp-asks').innerText(), 'on the page').toBe(waits)
        expect(await onThePage.textContent(), 'on the page, seen or read aloud').not.toContain(before)
        await page.click('.ckw-press')
        const panel = page.locator('.ckw-panel')
        await panel.getByRole('button', { name: t('checklists.window.back'), exact: true }).click()
        await panel.locator('.ckw-names button', { hasText: LARK }).click()
        const inTheWindow = panel.locator(`.cks-card[data-list="${shelf}"] .ckp-item`, { hasText: 'Choose the shelf paint' })
        await inTheWindow.waitFor({ timeout: 10_000 })
        expect(await inTheWindow.locator('.ckp-asks').innerText(), 'in the window').toBe(waits)
        expect(await inTheWindow.textContent(), 'in the window, seen or read aloud').not.toContain(before)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

/** Lark's checklist in the second project, made once, for case 8: one item still to do. */
let larkInB: Promise<string> | null = null
const larkInTheSecondProject = (): Promise<string> =>
  (larkInB ??= send(
    'POST',
    '/api/checklists',
    { title: "Lark's glaze shelf", items: [{ words: 'Label the glaze jars' }] },
    { ...AS('lark'), 'x-mole-office-workspace': 'sample-project-b' },
  ).then((made) => made['checklist'].id as string))

/** Each section's name and count on the page, the reader's among them. `sections` can name fewer sections. */
async function countsOnThePage(page: Page, sections = '.ckl-section'): Promise<Record<string, string>> {
  return page.$$eval(sections, (all) =>
    Object.fromEntries(all.map((one) => [one.querySelector('.ckl-name')?.textContent ?? '', one.querySelector('.cks-count')?.textContent ?? 'none'])),
  )
}

/** Each name in the window's row of names, with the count beside it. The names are read after Back shows them. */
async function countsInTheWindow(page: Page): Promise<Record<string, string>> {
  return page.$$eval('.ckw-panel .ckw-names .ckw-name', (all) =>
    Object.fromEntries(all.map((one) => [one.querySelector('.ckw-name-words')?.textContent ?? '', one.querySelector('.cks-count')?.textContent ?? 'none'])),
  )
}

/** The projects of the cards on the page, each once. */
async function projectsOfTheCards(page: Page): Promise<string[]> {
  const all = await page.$$eval('.ckl .cks-card .cks-project .pch-name', (marks) => marks.map((one) => one.getAttribute('data-project') ?? 'none'))
  return [...new Set(all)].sort()
}

/** Opens the window, presses Back, waits until it has read everybody's checklists, answers its counts, and closes it. */
async function theWindowsCounts(page: Page): Promise<Record<string, string>> {
  await page.click('.ckw-press')
  const panel = page.locator('.ckw-panel')
  await panel.locator('.cks-card').first().waitFor({ timeout: 30_000 })
  await panel.getByRole('button', { name: t('checklists.window.back'), exact: true }).click()
  await expect.poll(async () => Object.keys(await countsInTheWindow(page)), { timeout: 10_000 }).toEqual(expect.arrayContaining([SECRETARY, LARK, MOSS]))
  const counts = await countsInTheWindow(page)
  await page.keyboard.press('Escape')
  await expect.poll(() => panel.count(), { timeout: 5_000 }).toBe(0)
  return counts
}

describe('8. with no project chosen, the page shows every project, and its counts are the window\'s', () => {
  for (const run of GENERAL_RUNS) {
    it(`8. every project's cards and the window's counts, then one project's alone, ${named(run)}`, async () => {
      const inB = await larkInTheSecondProject()
      const { page, close } = await opened(run, '/checklists', `${READER} .cks-card[data-list="${kiln}"]`)
      try {
        const second = page.locator(`${READER} .cks-card[data-list="${glaze}"]`)
        await second.waitFor({ timeout: 10_000 })
        await expect.poll(() => second.locator('.cks-project').innerText(), { timeout: 10_000 }).toContain('Sample project B')
        expect(await projectsOfTheCards(page), 'cards of both projects').toEqual(['default', 'sample-project-b'])
        const inTheWindow = await theWindowsCounts(page)
        const everyProject = await countsOnThePage(page)
        expect(Object.keys(everyProject), 'the sections that draw a count').toEqual(expect.arrayContaining([SECRETARY, LARK, MOSS]))
        for (const [name, count] of Object.entries(everyProject)) expect(count, `${name}: the page's count is the window's`).toBe(inTheWindow[name])

        await page.locator('.pch-select').selectOption('sample-project-b')
        await expect.poll(() => projectsOfTheCards(page), { timeout: 10_000 }).toEqual(['sample-project-b'])
        expect(await page.locator(`.cks-card[data-list="${kiln}"]`).count(), "the first project's card is gone").toBe(0)
        await expect.poll(() => countsOnThePage(page, '.ckl-section[data-reader="no"]'), { timeout: 10_000 }).toEqual({ [LARK]: '1' })
        expect(await theWindowsCounts(page), "the window's counts stay").toEqual(inTheWindow)

        await page.locator('.pch-select').selectOption('default')
        await expect.poll(() => projectsOfTheCards(page), { timeout: 10_000 }).toEqual(['default'])
        expect(await page.locator(`.cks-card[data-list="${inB}"]`).count(), "the second project's card is gone").toBe(0)
        await expect.poll(async () => (await countsOnThePage(page))[LARK], { timeout: 10_000 }).not.toBe(inTheWindow[LARK])
        expect(await theWindowsCounts(page), "the window's counts stay").toEqual(inTheWindow)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('9. at 390 the open window covers the page under it', () => {
  for (const run of RUNS.filter((one) => one.width === 390)) {
    it(`9. points near the foot of the window's box land in the window, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/', '.ckw-press')
      try {
        await page.click('.ckw-press')
        const panel = page.locator('.ckw-panel')
        await panel.locator(`.cks-card[data-list="${kiln}"]`).waitFor({ timeout: 30_000 })
        await panel.evaluate((one) => Promise.all(one.getAnimations().map((motion) => motion.finished.catch(() => undefined))))
        const missed = await page.evaluate(() => {
          const box = document.querySelector('.ckw-panel')!.getBoundingClientRect()
          const foot = window.innerHeight - 4
          const points: [number, number][] = [
            [4, foot],
            [window.innerWidth / 2, foot],
            [window.innerWidth - 4, foot],
            [4, (box.top + window.innerHeight) / 2],
            [window.innerWidth - 4, (box.top + window.innerHeight) / 2],
            [box.left + 4, box.bottom - 4],
            [(box.left + box.right) / 2, box.bottom - 4],
            [box.right - 4, box.bottom - 4],
          ]
          return points
            .map(([x, y]) => ({ x: Math.round(x), y: Math.round(y), hit: document.elementFromPoint(x, y) }))
            .filter((one) => one.hit === null || one.hit.closest('.ckw-panel') === null)
            .map((one) => `${String(one.x)},${String(one.y)}: ${one.hit === null ? 'nothing' : `${one.hit.tagName.toLowerCase()} ${String(one.hit.className)}`.slice(0, 80)}`)
        })
        expect(missed, "points in the window's box that land outside the window").toEqual([])
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('10. at 390 the page draws its item rows as at 1440', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`10. an unfinished row has the same border, ring and background at 390 as at 1440, in the ${theme} look`, async () => {
      const ROW = 'Write the firing log'
      const wide = RUNS.find((one) => one.width === 1440 && one.theme === theme)!
      const narrow = RUNS.find((one) => one.width === 390 && one.theme === theme)!
      const first = await opened(wide, '/checklists', `${READER} .cks-card[data-list="${kiln}"] .ckp-item`)
      let at1440: unknown = null
      try {
        const card = first.page.locator(`${READER} .cks-card[data-list="${kiln}"]`)
        await expect.poll(() => card.locator('.ckp-item[data-moved="yes"]').count(), { timeout: 10_000 }).toBe(0)
        at1440 = await openRows(card)
          .filter({ hasText: ROW })
          .evaluate((row) => {
            const style = getComputedStyle(row)
            return {
              border: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft, style.borderRadius],
              background: [style.backgroundColor, style.backgroundImage],
              ring: style.boxShadow,
            }
          })
      } finally {
        await first.close()
      }

      const context = await app.browser.newContext({ viewport: { width: narrow.width, height: narrow.height } })
      let release = (): void => undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      try {
        await context.addInitScript((look) => {
          localStorage.setItem('mole-office.preset.theme', look)
          localStorage.setItem('mole-office.workspace', 'default')
        }, narrow.theme)
        await context.route(
          (url) => url.pathname === '/api/workspaces',
          async (route) => {
            await held
            await route.continue()
          },
        )
        const page = await context.newPage()
        page.setDefaultTimeout(20_000)
        await page.goto(`${app.site}/?lang=en#/checklists`, { timeout: 60_000 })
        await openRows(page.locator(`${READER} .cks-card[data-list="${kiln}"]`)).filter({ hasText: ROW }).waitFor({ timeout: 30_000 })
        release()
        // THE ROW AS IT IS DRAWN WHEN THE PROJECT'S NAME FIRST SHOWS ON ITS CARD, read in the same pass.
        const at390 = await (
          await page.waitForFunction(
            ([list, words, unnamed]) => {
              const card = document.querySelector(`.ckl-section[data-reader="yes"] .cks-card[data-list="${list}"]`)
              const mark = card?.querySelector('.cks-project .pch-name')
              if (card === null || card === undefined || mark === null || mark === undefined || (mark.textContent ?? '').includes(unnamed)) return null
              const row = [...card.querySelectorAll('.cks-items:not(.ckp-folded) > .ckp-item')].find((one) => (one.textContent ?? '').includes(words))
              if (row === undefined) return null
              const style = getComputedStyle(row)
              return {
                border: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft, style.borderRadius],
                background: [style.backgroundColor, style.backgroundImage],
                ring: style.boxShadow,
              }
            },
            [kiln, ROW, t('g7a.records.unnamedProject')] as const,
            { timeout: 15_000 },
          )
        ).jsonValue()
        expect(at390, 'the row at 390, as at 1440').toEqual(at1440)
      } finally {
        release()
        await context.close()
      }
    }, 120_000)
  }
})

describe("11. the window's row of names wraps", () => {
  for (const run of GENERAL_RUNS) {
    it(`11. every name is whole and inside the row, in order and with its count, ${named(run)}`, async () => {
      const { page, close } = await opened(run, '/decisions', '.ckw-press')
      try {
        await page.click('.ckw-press')
        const panel = page.locator('.ckw-panel')
        await panel.locator(`.cks-card[data-list="${kiln}"]`).waitFor({ timeout: 30_000 })
        await panel.getByRole('button', { name: t('checklists.window.back'), exact: true }).click()
        await expect.poll(async () => Object.keys(await countsInTheWindow(page)), { timeout: 10_000 }).toEqual(expect.arrayContaining([SECRETARY, LARK, MOSS]))
        await panel.evaluate((one) => Promise.all(one.getAnimations().map((motion) => motion.finished.catch(() => undefined))))
        const names = await panel.locator('.ckw-names').evaluate((row) => {
          const box = row.getBoundingClientRect()
          return [...row.querySelectorAll<HTMLElement>('.ckw-name')].map((tab) => {
            const at = tab.getBoundingClientRect()
            const words = tab.querySelector<HTMLElement>('.ckw-name-words')
            return {
              name: words?.textContent ?? '',
              chosen: tab.getAttribute('aria-current'),
              count: tab.querySelector('.cks-count')?.textContent ?? null,
              top: Math.round(at.top),
              inside: at.left >= box.left - 0.5 && at.right <= box.right + 0.5 && at.top >= box.top - 0.5 && at.bottom <= box.bottom + 0.5,
              whole:
                words !== null &&
                words.scrollWidth <= words.clientWidth + 1 &&
                tab.scrollWidth <= tab.clientWidth + 1 &&
                getComputedStyle(words).textOverflow !== 'ellipsis',
            }
          })
        })
        expect(names.length, 'four owners at least').toBeGreaterThanOrEqual(4)
        expect(names[0]?.chosen, "the reader's name is first and current").toBe('true')
        expect(names.filter((one) => [SECRETARY, LARK, MOSS].includes(one.name)).map((one) => one.name), 'the secretary, then the other agents by name').toEqual([
          SECRETARY,
          LARK,
          MOSS,
        ])
        expect(new Set(names.map((one) => one.top)).size, 'the names take more than one line').toBeGreaterThan(1)
        for (const one of names) {
          expect(one.inside, `${one.name}: inside the row of names`).toBe(true)
          expect(one.whole, `${one.name}: whole, not cut`).toBe(true)
          expect(one.count, `${one.name}: its count`).not.toBeNull()
        }
      } finally {
        await close()
      }
    }, 120_000)
  }
})
