// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD NAMES EACH CHAPTER AS THE OFFICE'S OWN CHAPTER RECORD DOES, ON EVERY PAGE THAT DRAWS ONE.
 *
 * Wave 13s round 10, problem aObarxX8mTWm (invariant 9). src/config/roles.json used to type each chapter's name, and
 * five chapter names had drifted from the chapter records. It now names a chapter by its number only. Wave 13w round 1:
 * every reader takes the name from the office's chapter records, as GET /api/office-regulations
 * draws them: the server through `theChaptersOfTheCards` (GET /api/roles and the agent's card message), and the pages
 * from GET /api/roles. Until then the server named them from src/config/rules/chapters.json, the export of the office
 * this repository is developed in, so a new office's cards named that office's chapters and not its own. A chapter's
 * Chinese name is the chapter record's current Chinese label, which GET /api/roles carries beside the English.
 *
 * WHAT THIS FILE HOLDS, in a real browser on a fresh test office of its own, whose role cards are mirrored into it:
 *   - GET /api/roles names each chapter as GET /api/office-regulations names it;
 *   - the role card's page draws each chapter of its must-read line by that name, and on a Chinese page by the
 *     Chinese name GET /api/roles gives, each linked to the chapter's record;
 *   - the page that makes a new card names every chapter the same way.
 * With TEST_SHOTS set, both pages are photographed at 1440, 990, 660 and 390, light and dark, in English and Chinese.
 *
 * WHAT IS REAL HERE. The server, its start (which copies the default chapters into this fresh office), the mirror and
 * the pages. The office is a throwaway; nothing reaches the live office.
 *
 * MUTATION (after a green control run, then restored), run on 13 October 2026: `theChaptersOfTheCards` in
 * src/server/lib/chapters.ts names the chapters from the export again. Red at the start, where GET /api/roles no
 * longer names chapter 3 as GET /api/office-regulations does; so is the server case of
 * tests/a-role-card-has-all-its-parts.test.ts.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, one, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let app: LiveApp
let page: Page
let workerCard = ''
let mustRead: number[] = []
let chinese = new Map<number, string | null>()
/** Each chapter by its number, named as GET /api/office-regulations names it in this office. */
let namedHere = new Map<number, string>()

async function open(where: string, lang: 'en' | 'zh', width = 1440, scheme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Every text a selector names on the page, trimmed. */
async function textsOf(selector: string): Promise<string[]> {
  await page.locator(selector).first().waitFor({ state: 'attached', timeout: 30_000 })
  return page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => (el.textContent ?? '').trim()), selector)
}

beforeAll(async () => {
  app = await liveApp({ name: 'chapters-named-by-the-office', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const mirrored = await fetch(`${app.api}/api/roles/mirror`, { method: 'POST', headers: AS_THE_PERSON })
  expect(mirrored.status, await mirrored.clone().text()).toBeLessThan(300)
  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`, { headers: AS_THE_PERSON })).json()) as {
    records: { id: string; data: { roleName?: string; card?: { mustRead?: { chapters?: { chapter: number }[] } } } }[]
  }
  const worker = one(listed.records.filter((r) => r.data.roleName === 'worker'), 'the record copying the worker card')
  workerCard = worker.id
  mustRead = (worker.data.card?.mustRead?.chapters ?? []).map((c) => c.chapter)
  const roles = (await (await fetch(`${app.api}/api/roles`, { headers: AS_THE_PERSON })).json()) as {
    chapters: { number: number; name: string; zh: string | null }[]
  }
  chinese = new Map(roles.chapters.map((c) => [c.number, c.zh]))
  // THE OFFICE'S OWN NAMES, as its regulations page draws them: a chapter's label, or its title where it has none.
  const regulations = (await (await fetch(`${app.api}/api/office-regulations`, { headers: AS_THE_PERSON })).json()) as {
    chapters: { n: number; label: string; title: string }[]
  }
  namedHere = new Map(regulations.chapters.map((c) => [c.n, c.label === '' ? c.title : c.label]))
  expect(namedHere.size, 'the fresh office copied no chapters').toBeGreaterThan(0)
  // GET /api/roles itself names each chapter as the office does.
  expect(roles.chapters.map((c) => [c.number, c.name])).toEqual([...namedHere.entries()])
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("a role card names each chapter as the office's own chapter record does (problem aObarxX8mTWm)", () => {
  it("draws the must-read line on the card's page by the office's name, and by the Chinese name on a Chinese page", async () => {
    expect(mustRead.length).toBeGreaterThan(0)
    await open(`/r/${workerCard}`, 'en')
    expect(await textsOf('.rc-chapter-name')).toEqual(mustRead.map((n) => namedHere.get(n)))
    await open(`/r/${workerCard}`, 'zh')
    expect(await textsOf('.rc-chapter-name')).toEqual(mustRead.map((n) => chinese.get(n) ?? namedHere.get(n)))
    // The fresh office's copied chapters carry Chinese, so the Chinese case is not passing on the English fallback.
    expect(mustRead.every((n) => (chinese.get(n) ?? null) !== null)).toBe(true)
  })

  it('names every chapter the same way on the page that makes a new card', async () => {
    await open('/roles/new', 'en')
    expect(await textsOf('.rnc-chapter span')).toEqual([...namedHere.entries()].map(([n, name]) => `${String(n)}. ${name}`))
    await open('/roles/new', 'zh')
    expect(await textsOf('.rnc-chapter span')).toEqual([...namedHere.entries()].map(([n, name]) => `${String(n)}. ${chinese.get(n) ?? name}`))
  })

  it.skipIf(!process.env['TEST_SHOTS'])('photographs both pages at four widths, light and dark, in English and Chinese', async () => {
    const shots = testShots('a-role-cards-chapters-are-named-by-the-office')
    for (const [name, where] of [['role-card', `/r/${workerCard}`], ['new-role-card', '/roles/new']] as const) {
      for (const lang of ['en', 'zh'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          for (const scheme of ['light', 'dark'] as const) {
            await open(where, lang, width, scheme)
            await page.locator(name === 'role-card' ? '.rc-chapters' : '.rnc-chapters').first().scrollIntoViewIfNeeded()
            await page.screenshot({ path: join(shots, `${name}-${String(width)}-${lang}-${scheme}.png`) })
          }
        }
      }
    }
  }, 600_000)
})
