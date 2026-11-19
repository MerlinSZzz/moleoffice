// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CATEGORY CARD SHOWS A NUMBER ONLY WHEN ITS PAGE HAS A COUNT OF ITS OWN, AND THEN THAT COUNT.
 * Wave 13q, round 13 (R13c), item 4 of a decision.
 *
 * What this file holds the category pages to:
 *   1. The cards with a number are exactly the cards whose page draws one number for its whole
 *      subject. Every other card draws no number and no mark standing for one.
 *   2. The number on a card is the number its page draws: the Shelved page's list, the roster on
 *      Who is working and the count beside Chapters.
 *
 * The list of pages with a count of their own is written out here, apart from the code, so a card
 * that gains or loses a number in CategoryPage.tsx turns this red.
 *
 * It runs in a test office with a made-up project: two modules, one pipeline, two directions (one
 * of them on the shelf) and one agent.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

let app: LiveApp
const PROJECT = { id: 'test-willow', title: 'Willow Mill' }
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const en = createI18n('en')

/**
 * The pages on a category page that draw one number for their whole subject, by their sidebar row's
 * key. Criterion change in wave 13q round 14: Counters and All records were on this list; they stand
 * under All projects now, which has no category page, so no card draws them.
 */
const PAGES_WITH_THEIR_OWN_COUNT = new Set(['working', 'tasksToTake', 'regulations', 'shelved'])

async function post(path: string, workspace: string, body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace },
    body: JSON.stringify(body),
  })
  expect(reply.status, (await reply.text()).slice(0, 300)).toBeLessThan(300)
}

beforeAll(async () => {
  app = await liveApp({ name: 'category-own-count', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/workspaces', 'default', PROJECT)
  await post('/api/records', PROJECT.id, { kind: 'module', title: 'Water wheel', data: {} })
  await post('/api/records', PROJECT.id, { kind: 'module', title: 'Grain hopper', data: {} })
  await post('/api/records', PROJECT.id, { kind: 'pipeline', title: 'From sack to flour', data: {} })
  await post('/api/records', PROJECT.id, { kind: 'direction', title: 'Grind rye as well', data: {} })
  await post('/api/records', PROJECT.id, {
    kind: 'direction',
    title: 'A second wheel downstream',
    data: { shelved: { since: '2026-09-01', because: 'The river is too low this year.' } },
  })
  await post('/api/records', PROJECT.id, {
    kind: 'agent',
    title: 'Miller Bot',
    data: { handle: 'miller-bot', runtime: 'claude-code', state: 'active' },
  })
  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** Open a page and wait until every count on it has answered. */
async function open(address: string, query = 'lang=en'): Promise<void> {
  await app.page.goto(`${app.site}/?${query}${address}`)
  await waitForThePage(app.page, 30_000)
  const reading = en.t('category.glance.reading')
  await app.page.waitForFunction(
    (mark) => [...document.querySelectorAll('.px-category-glance')].every((one) => one.textContent !== mark),
    reading,
    { timeout: 30_000 },
  )
}

/** Each card on the page: its key, what its count part says, and whether its foot holds a digit. */
async function cards(): Promise<{ key: string; glance: string | null; digit: boolean }[]> {
  return app.page.locator('.px-category-card').evaluateAll((all) =>
    all.map((one) => ({
      key: one.getAttribute('data-card') ?? '',
      glance: one.querySelector('.px-category-glance')?.textContent ?? null,
      digit: /\d/.test(one.querySelector('.px-category-card-foot')?.textContent ?? ''),
    })),
  )
}

it('draws a number only on the cards whose page has a count of its own, and nothing on the others', async () => {
  for (const [category, query] of [
    ['project', 'lang=en'],
    ['agents', 'lang=en'],
    ['office', 'lang=en'],
    ['developer', 'lang=en&mode=inspect'],
  ] as const) {
    await open(`#/${category}`, query)
    const drawn = await cards()
    expect(drawn.length, category).toBeGreaterThan(0)
    for (const card of drawn) {
      if (PAGES_WITH_THEIR_OWN_COUNT.has(card.key)) {
        expect(card.glance, `${category}: ${card.key} has a count of its own and shows none`).not.toBe(null)
      } else {
        // No number, and no mark standing for one: the card's foot holds no count part at all.
        expect(card.glance, `${category}: ${card.key} has no count of its own and shows one`).toBe(null)
        expect(card.digit, `${category}: ${card.key} has no count of its own and shows a number`).toBe(false)
      }
    }
  }
}, 240_000)

it('shows on each card exactly the count its page draws', async () => {
  const page = app.page
  const glance = async (key: string): Promise<string> =>
    (await page.locator(`.px-category-card[data-card="${key}"] .px-category-glance`).textContent()) ?? ''
  await open('#/project')
  const project = { shelved: await glance('shelved') }
  // The modules and the pipeline exist, and their pages count only their groups, so no number.
  expect(await page.locator('.px-category-card[data-card="modules"] .px-category-glance').count()).toBe(0)
  expect(await page.locator('.px-category-card[data-card="pipeline"] .px-category-glance').count()).toBe(0)
  await open('#/agents')
  const working = await glance('working')
  await open('#/office')
  const regulations = await glance('regulations')
  const noChapters = await page.locator('.px-category-card[data-card="regulations"] .px-category-glance .px-absent').count()

  await open('#/shelved')
  const shelf = Number(await page.locator('.flst-group[data-group="shelf"] .flst-count').textContent())
  expect(shelf).toBe(1)
  expect(project.shelved).toBe(en.t('frameTriage.glance.shelved', { n: shelf }))

  // Who is working draws its list; its count is beside the roster.
  await open('#/working')
  const roster = page.locator('[data-target="uiSurface/working.roster"] .px-panel-actions .px-tag')
  await roster.waitFor({ timeout: 30_000 })
  const active = Number(await roster.textContent())
  expect(active).toBeGreaterThan(0)
  expect(working).toBe(en.t('category.glance.active', { n: active }))

  // The count beside Chapters is drawn when there is at least one chapter. With none, the card
  // draws the short mark, whose reason on hover is the count.
  await open('#/regulations')
  await page.locator('.ofc-sec').first().waitFor({ timeout: 30_000 })
  const counts = await page.locator('.ofc-count').allTextContents()
  if (noChapters === 1) {
    expect(counts.filter((one) => /chapter/.test(one))).toEqual([])
  } else {
    const chapters = Number(/\d+/.exec(regulations)?.[0])
    expect(counts).toContain(en.t('regulationsPage.chapterCount', { n: chapters }))
  }
}, 240_000)
