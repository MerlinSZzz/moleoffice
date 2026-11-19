// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CATEGORY PAGES DESIGNED AGAIN: AGENTS, OFFICE AND THIS PROJECT. Wave 13q, round 11 (R11a).
 *
 * Report n9Mjk3c_sJRu block b-17. What this file
 * holds the pages to:
 *   1. Needs you comes first, and holds only what the pages below count as needing the owner. Today only
 *      the Embassy counts such a thing (its visitors asking to come in and its asks at the door), so
 *      only the Office page draws Needs you; Agents and This project draw none (rule R6).
 *   2. Each card shows the page's name, its one line, and its count when its page has a count of its
 *      own, as item 4 of a decision says. The Embassy card shows the count of what
 *      needs the owner.
 *   3. A count that cannot be read is the short mark with its reason on hover, never 0. A card whose
 *      page has no count of its own draws no count at all.
 *   4. The cards stand side by side at 1440 and in one column at 390.
 *
 * It runs in a test office with a made-up project, a made-up visitor and a made-up question.
 * Set W13Q_CATEGORY_AFTER_SHOTS to a folder to also photograph the three pages.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const shots = process.env.W13Q_CATEGORY_AFTER_SHOTS
const PROJECT = { id: 'test-orchard', title: 'Orchard Lane' }
const VISITOR = { handle: 'pip-far', name: 'Pip on the far machine' }
const QUESTION = 'Should the orchard sensors wake every hour or every day?'
const MODULE = 'Soil probe'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const en = createI18n('en')

async function post(path: string, workspace: string, body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace },
    body: JSON.stringify(body),
  })
  expect(reply.status, (await reply.text()).slice(0, 300)).toBeLessThan(300)
}

beforeAll(async () => {
  app = await liveApp({ name: 'category-designed-again', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/workspaces', 'default', PROJECT)
  await post('/api/records', PROJECT.id, { kind: 'module', title: MODULE, data: {} })
  // WHAT NEEDS THE OWNER, FROM TWO PLACES. A visitor asking to come in is the Embassy's; a question only
  // the owner may settle is on the owner's list too, but no page under these three categories counts it.
  await post('/api/office/visitors', 'default', { ...VISITOR, role: 'worker', conversationPath: '/tmp/pip-far.jsonl' })
  await post('/api/records', PROJECT.id, {
    kind: 'proposal',
    title: QUESTION,
    data: { question: QUESTION, options: ['a — every hour', 'b — every day'] },
  })
  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('look') ?? 'light')
  }, PROJECT.id)
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** Open a category page and wait until every count on it has answered. */
async function open(address: string, query = 'lang=en'): Promise<void> {
  await app.page.goto(`${app.site}/?${query}${address}`)
  await waitForThePage(app.page, 30_000)
  const reading = en.t('category.glance.reading')
  await app.page.waitForFunction(
    (mark) =>
      [...document.querySelectorAll('.px-category-glance, .px-category-needs-quiet')].every(
        (one) => one.textContent !== mark && !one.textContent?.includes('⟦…'),
      ),
    reading,
    { timeout: 30_000 },
  )
}

/** The short mark inside one part of a card, and the reason it carries on hover. */
async function markIn(selector: string): Promise<{ mark: string; title: string | null }> {
  return app.page.locator(`${selector} .px-absent`).evaluate((one) => ({
    mark: one.firstChild?.textContent ?? '',
    title: one.getAttribute('title'),
  }))
}

it('draws Needs you first on the Office page, with only what the Embassy counts, and none on the other two', async () => {
  const page = app.page
  await open('#/office')
  // First: the title, its line, then Needs you, then the cards.
  const order = await page.locator('.px-category > *:not(style)').evaluateAll((all) => all.map((one) => one.className))
  expect(order).toEqual(['px-category-title', 'px-category-line', 'px-category-needs', 'px-category-cards'])
  expect(await page.locator('.px-category-needs-title').textContent()).toBe(en.t('categoryPages.needs.heading'))
  const rows = await page.locator('.px-category-needs-row').evaluateAll((all) =>
    all.map((one) => ({ name: one.querySelector('.px-category-needs-name')?.textContent, href: one.getAttribute('href') })),
  )
  // The visitor is there, and opens its own page; the question the owner may settle is not the Embassy's.
  expect(rows.map((row) => row.name)).toEqual([VISITOR.name])
  expect(rows[0]?.href).toMatch(/^#\/visitor\//)
  // The Embassy card carries the same count, and no other card carries one.
  expect(await page.locator('.px-category-card[data-card="embassy"] .px-category-card-needs').textContent()).toBe(
    en.t('categoryPages.card.needs', { n: 1 }),
  )
  expect(await page.locator('.px-category-card-needs').count()).toBe(1)
  // Agents and This project: no page below counts what needs the owner, so neither draws Needs you.
  for (const address of ['#/agents', '#/project']) {
    await open(address)
    expect(await page.locator('.px-category-needs').count(), address).toBe(0)
    expect(await page.locator('.px-category-card-needs').count(), address).toBe(0)
  }
}, 240_000)

it('shows on each card the page’s name, its line, and a count only where the page has its own', async () => {
  const page = app.page
  await open('#/project')
  const cards = await page.locator('.px-category-card').evaluateAll((all) =>
    all.map((one) => ({
      key: one.getAttribute('data-card'),
      title: one.querySelector('.px-category-card-title')?.textContent ?? '',
      what: one.querySelector('.px-category-card-what')?.textContent ?? '',
      count: one.querySelector('.px-category-glance')?.textContent ?? null,
    })),
  )
  // Criterion change (wave 13q round 14): ten cards were six once a decision moved Goals, Counters, Context
  // bundles and All records under All projects, and of the three cards with a count only Shelved is
  // left.
  // Criterion change in wave 13p round 30: seven, with the merge queue page after Pipelines.
  // It draws no count of its own on the card.
  // Criterion change in wave 13q round 44: six, with no Messages card, since
  // Messages stands in no group of the sidebar.
  // Criterion change of 13 November 2026: seven, because package BV added the Board page to the project group in
  // src/shared/sidebar-arrangement.ts. Its card draws no count, since src/web/pages/CategoryPage.tsx counts no board.
  expect(cards.length).toBe(7)
  expect(cards.map((card) => card.key)).not.toContain('messages')
  // Of This project's pages, only Shelved draws one number for its whole subject;
  // tests/a-category-card-shows-its-pages-own-count.test.ts holds the whole list.
  const counted = new Set(['shelved'])
  for (const card of cards) {
    expect(card.title, String(card.key)).not.toBe('')
    expect(card.what, String(card.key)).not.toBe('')
    if (counted.has(String(card.key))) expect(card.count, String(card.key)).not.toBe(null)
    else expect(card.count, String(card.key)).toBe(null)
    // Never a bare zero: an empty count is the short mark.
    expect(card.count ?? '', String(card.key)).not.toMatch(/^0\b/)
  }
  expect(await page.locator('.px-category-line').textContent()).toBe(en.t('categoryPages.line.project'))
}, 120_000)

// THE TWO READINGS MADE TO FAIL, whatever the query after the address.
const REGULATIONS = /\/api\/office-regulations(\?|$)/
const WAITING = /\/api\/waiting(\?|$)/

it('draws a count that could not be read as the short mark with its reason, never as 0', async () => {
  const page = app.page
  await page.route(REGULATIONS, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"made-up failure"}' }))
  await page.route(WAITING, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"made-up failure"}' }))
  try {
    // A COLD LOAD, so the frame reads what waits on the owner again rather than keeping its last reply.
    // Since round 17 of wave 13w a page keeps its last answers in this browser's IndexedDB as well, and
    // draws them at once, so a cold load also deletes that store. It is deleted from a page of the
    // office's own address that runs no script of the office's, so no connection holds it open.
    await page.goto(`${app.site}/manifest.webmanifest`)
    expect(await page.evaluate(() => new Promise<string>((resolve) => {
      const asked = indexedDB.deleteDatabase('mole-office-page-cache')
      asked.onsuccess = () => resolve('deleted')
      asked.onerror = () => resolve('failed')
      asked.onblocked = () => resolve('blocked')
    }))).toBe('deleted')
    await page.goto('about:blank')
    await open('#/office')
    expect(await markIn('.px-category-card[data-card="regulations"] .px-category-glance')).toEqual({
      mark: en.t('absence.mark'),
      title: en.t('categoryPages.card.notRead'),
    })
    // What needs the owner could not be read either: the short mark, never "Nothing needs you".
    expect(await page.locator('.px-category-needs').getAttribute('data-state')).toBe('failed')
    expect(await markIn('.px-category-needs-quiet')).toEqual({ mark: en.t('absence.mark'), title: en.t('categoryPages.needs.notRead') })
    expect(await markIn('.px-category-card[data-card="embassy"] .px-category-card-needs')).toEqual({
      mark: en.t('absence.mark'),
      title: en.t('categoryPages.needs.notRead'),
    })
    expect(await page.locator('.px-category').innerText()).not.toContain(en.t('categoryPages.needs.nothing'))
  } finally {
    await page.unroute(REGULATIONS)
    await page.unroute(WAITING)
  }
}, 120_000)

/** The left edge and the top of every card on the page. */
async function cardBoxes(): Promise<{ x: number; y: number }[]> {
  return app.page.locator('.px-category-card').evaluateAll((all) =>
    all.map((one) => {
      const box = one.getBoundingClientRect()
      return { x: Math.round(box.left), y: Math.round(box.top) }
    }),
  )
}

it('stands the cards side by side at 1440 and in one column at 390', async () => {
  const page = app.page
  try {
    for (const address of ['#/agents', '#/office', '#/project']) {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await open(address)
      const wide = await cardBoxes()
      const firstRow = wide.filter((box) => box.y === wide[0]?.y)
      // Side by side: three to a row at least, or every card in one row where there are fewer.
      // The Office page has two since Settings moved to the sidebar's foot.
      // THIS PROJECT HAS TWO TO A ROW since wave 13k's round 22: the modules panel takes the right
      // column beside the cards, so the cards share the width, as item 3 of a decision says.
      expect(wide.length, `${address} at 1440`).toBeGreaterThanOrEqual(2)
      expect(firstRow.length, `${address} at 1440`).toBeGreaterThanOrEqual(Math.min(address === '#/project' ? 2 : 3, wide.length))
      await page.setViewportSize({ width: 390, height: 900 })
      await open(address)
      const narrow = await cardBoxes()
      expect(new Set(narrow.map((box) => box.x)).size, `${address} at 390`).toBe(1)
      expect(new Set(narrow.map((box) => box.y)).size, `${address} at 390`).toBe(narrow.length)
      const size = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(size, `${address} at 390`).toBeLessThanOrEqual(390)
    }
  } finally {
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
}, 240_000)

