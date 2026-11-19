// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE, AN AGENT'S COMMENT CARD AND A COMMENT ON A PAGE, AT A DESK AND ON A PHONE.
 *
 * Wave 13p round 3 changed four things a reader sees. This file opens them in a real browser at
 * 1440 in light and at 390 in dark, reads what is drawn, and, when REVIEW_PANE_SHOTS names a
 * folder, photographs each one there. It writes pictures nowhere else.
 *
 *   - the dot on the Reviews control asks Mole Office: the review here is started through the API,
 *     so this browser never heard of it;
 *   - the review column's head names the thing a review is of;
 *   - an agent's comment card reads oldest first;
 *   - a comment about a page is a circle beside the page's heading.
 *
 * And once more at 1440 with ?lang=zh, which is where a word left in English would show.
 *
 * Everything in it is made up by this test, in a database of its own.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { targetKey } from '../src/shared/targets.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const SHOTS = process.env['REVIEW_PANE_SHOTS']
const TITLE = 'The wrist mount trials'
const FIRST_TURN = 'The second block says three mounts broke. Which load did the fourth take?'
const ANSWER = 'It took 42 newtons before it cracked.'
const SECOND_TURN = 'Then the fourth passed. I will add the load to the table.'
const PAGE_KEY = targetKey({ kind: 'page', route: '/records' })

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mount-bot' }

let app: LiveApp
let reportId = ''
let reviewId = ''

async function write(headers: Record<string, string>, path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await reply.text()
  const aLetterNothingHolds = path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds ? reply.status !== 409 : !reply.ok) throw new Error(`POST ${path} answered ${String(reply.status)}: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  app = await liveApp({ name: 'review-pane-every-width', viewport: { width: 1440, height: 900 } })
  await write(AS_THE_OWNER, '/api/records', {
    kind: 'agent',
    title: 'Mount Bot',
    data: { handle: 'mount-bot', runtime: 'claude-code', state: 'active' },
  })
  const report = await write(AS_THE_OWNER, '/api/records', {
    kind: 'report',
    title: TITLE,
    summary: 'A made-up report for photographing the review pane.',
    data: {
      date: '2026-09-30',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What was tested', text: 'Four printed wrist mounts were loaded until they broke.' },
        { id: 'b-2', type: 'text', heading: 'What broke', text: 'Three of the four mounts broke below the load the trials need.' },
        { id: 'b-3', type: 'text', heading: 'What is next', text: 'The aluminium mount is the one to test next.' },
      ],
    },
  })
  reportId = (report['record'] as { id: string }).id
  const onBlock = { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-2]' }, place: { at: 'surface' } }

  // THE EXCHANGE, A SECOND APART EACH, so the order it was written in is not a tie.
  await write(AS_AN_AGENT, '/api/records', {
    kind: 'message',
    title: FIRST_TURN,
    data: { body: FIRST_TURN, to: [{ kind: 'person', id: THE_PERSON }], target: onBlock },
  })
  await sleep(1100)
  await write(AS_THE_OWNER, '/api/records', {
    kind: 'message',
    title: ANSWER,
    data: { body: ANSWER, to: [{ kind: 'agent', id: 'mount-bot' }], target: onBlock, sentBy: { kind: 'person', id: THE_PERSON } },
  })
  await sleep(1100)
  await write(AS_AN_AGENT, '/api/records', {
    kind: 'message',
    title: SECOND_TURN,
    data: { body: SECOND_TURN, to: [{ kind: 'person', id: THE_PERSON }], target: onBlock },
  })

  // A REVIEW OF THE REPORT, started through the API, with one comment in it.
  const review = await write(AS_THE_OWNER, '/api/reviews', {
    entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } },
  })
  reviewId = (review['review'] as { id: string }).id
  await sleep(1100)
  await write(AS_THE_OWNER, '/api/records', {
    kind: 'annotation',
    title: 'The first block does not say who ran the trials.',
    data: {
      body: 'The first block does not say who ran the trials.',
      context: { target: { kind: 'region', recordId: reportId, regionId: 'data.blocks[#b-1]' }, place: { at: 'surface' } },
    },
  })
  // AND A COMMENT ABOUT A WHOLE PAGE.
  await write(AS_THE_OWNER, '/api/records', {
    kind: 'annotation',
    title: 'This list does not say which project each row is in.',
    data: { body: 'This list does not say which project each row is in.', context: { target: { kind: 'page', route: '/records' } } },
  })
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * GO TO AN ADDRESS, ANSWERING KEEP IF MOLE OFFICE ASKS ABOUT LEAVING (wave 13r round 15). The review collecting on the
 * report holds the owner's comment, which is not sent, so leaving the report's page by its hash asks Send, Keep or
 * Discard and puts the address back. Keep (保留 in Chinese) changes nothing and goes on. The question puts the address back inside the
 * hashchange event, so once a timer has run after it, an address that is not the one asked for means it asked.
 */
async function goKeeping(url: string): Promise<void> {
  const page = app.page
  await page.goto(url, { timeout: 60_000 })
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)))
  const wanted = new URL(url).hash
  if ((await page.evaluate(() => window.location.hash)) === wanted) return
  const question = page.locator('[data-part="leave-question"]')
  await question.waitFor({ timeout: 30_000 })
  // KEEP IS 保留 ON A CHINESE PAGE.
  const keep = new URL(url).search.includes('lang=zh') ? '保留' : 'Keep'
  await question.getByRole('button', { name: keep, exact: true }).click()
  await question.waitFor({ state: 'detached' })
  await page.waitForFunction((hash) => window.location.hash === hash, wanted, { timeout: 30_000 })
}

/** Open one address at one width, in one look and language, with the review column as given. */
async function open(width: number, look: 'light' | 'dark', address: string, column: string, lang: 'en' | 'zh' = 'en') {
  const page = app.page
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: look })
  await goKeeping(`${app.site}/${lang === 'zh' ? '?lang=zh' : ''}#/records`)
  await page.evaluate((stored) => {
    window.localStorage.setItem('mole-office.review', stored)
    window.localStorage.setItem('mole-office.review.width', 'expanded')
  }, column)
  await goKeeping(`${app.site}/${lang === 'zh' ? '?lang=zh' : ''}#${address}`)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate((theme) => {
    document.documentElement.dataset['theme'] = theme
  }, look)
}

/**
 * WAIT FOR THE CIRCLES TO STAND, AND SAY WHERE EACH ONE IS FROM ITS BLOCK (wave 13t round 34). Folding the column widens
 * the page, and the circles are measured again a frame or more later. The folded picture was taken before that, so it
 * could show a circle where the open column had put it. The page marks the moment on the html element (round 31).
 * The wait polls once a frame, so a resize the fold caused has been seen by then.
 */
async function circlesPlaced(): Promise<{ on: string; top: number; left: number; blockTop: number; blockBottom: number; blockRight: number }[]> {
  const page = app.page
  await page.waitForFunction(() => document.documentElement.getAttribute('data-comment-circles') === 'placed', undefined, {
    timeout: 20_000,
  })
  return page.evaluate(() =>
    [...document.querySelectorAll('.px-comment-circle')].map((circle) => {
      const on = circle.getAttribute('data-comments-on') ?? ''
      const at = circle.getBoundingClientRect()
      const block = document.querySelector(`[data-target="${CSS.escape(on)}"]`)?.getBoundingClientRect()
      return { on, top: at.top, left: at.left, blockTop: block?.top ?? NaN, blockBottom: block?.bottom ?? NaN, blockRight: block?.right ?? NaN }
    }),
  )
}

/** Every circle is beside its block: level with it or just above its corner, and at its right edge. */
function besideTheirBlocks(circles: Awaited<ReturnType<typeof circlesPlaced>>): void {
  expect(circles.length, 'no comment circle is drawn').toBeGreaterThan(0)
  for (const one of circles) {
    expect(one.top, `the circle on ${one.on} is not level with its block`).toBeGreaterThanOrEqual(one.blockTop - 40)
    expect(one.top, `the circle on ${one.on} is below its block`).toBeLessThanOrEqual(one.blockBottom)
    expect(Math.abs(one.left - one.blockRight), `the circle on ${one.on} is not at its block's right edge`).toBeLessThanOrEqual(40)
  }
}

async function shot(name: string): Promise<void> {
  if (SHOTS === undefined) return
  await app.page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

/** The desk and the phone: one width in each look, for each scene. */
const KEPT = [[1440, 'light'], [390, 'dark']] as const

describe('the record page with the review column open on the review collecting there', () => {
  for (const [width, look] of KEPT) {
    it(`at ${String(width)} in ${look}: names the thing in the head, lights the dot, and reads the card oldest first`, async () => {
        await open(width, look, `/r/${reportId}`, `open|${reviewId}|default||`)
        const page = app.page
        await page.waitForFunction(
          () => document.querySelector('.px-review-switch .px-review-dot')?.getAttribute('data-on') === '1',
          undefined,
          { timeout: 20_000 },
        )
        // THE TRAY AT THE WINDOW'S FOOT (item 73a): its row is the shut form, and Show comments opens the review
        // upward. The page keeps its whole width either way, so there is no fold to measure.
        const bar = page.locator('[data-part="your-review-bar"]')
        await bar.waitFor({ timeout: 30_000 })
        expect(await bar.locator('.px-b-bar-says').innerText()).toContain('1 comment')
        await shot(`${String(width)}-${look}-review-bar`)
        await bar.getByRole('button', { name: 'Show comments', exact: true }).click()
        await page.waitForSelector('.px-pane[data-sheet="1"] .px-pane-count', { timeout: 30_000 })
        const head = (await page.locator('.px-pane-count').first().textContent()) ?? ''
        expect(head, 'the head does not name the report').toContain(`Report “${TITLE}”`)
        await shot(`${String(width)}-${look}-review-pane`)
        besideTheirBlocks(await circlesPlaced())
        await bar.getByRole('button', { name: 'Hide comments', exact: true }).click()
        await page.waitForSelector('.px-pane[data-sheet="0"]')
        // THE DOT ITSELF, where the rail is drawn beside the page. Below 1024 the rail is a drawer.
        if (SHOTS !== undefined && width >= 1024) {
          const control = page.locator('.px-review-switch')
          await control.scrollIntoViewIfNeeded()
          await control.screenshot({ path: join(SHOTS, `${String(width)}-${look}-reviews-dot.png`) })
        }

        await page.waitForSelector('.px-said', { timeout: 30_000 })
        const rows = await page.locator('.px-said .px-said-words').allInnerTexts()
        expect(rows, 'the card does not read oldest first').toEqual([FIRST_TURN, ANSWER, SECOND_TURN])
        await page.locator('.px-said').first().scrollIntoViewIfNeeded()
        await sleep(400)
        await shot(`${String(width)}-${look}-comment-card`)
      }, 180_000)
  }
})

describe('a list page with a comment about the page', () => {
  for (const [width, look] of KEPT) {
    it(`at ${String(width)} in ${look}: draws the count beside the page's heading`, async () => {
        await open(width, look, '/records', 'shut||||')
        const page = app.page
        await page.waitForSelector(`.px-comment-circle[data-comments-on="${PAGE_KEY}"]`, { timeout: 30_000 })
        const at = await page.evaluate((key) => {
          const circle = document.querySelector(`.px-comment-circle[data-comments-on="${key}"]`)?.getBoundingClientRect()
          const heading = document.querySelector('#main h1')
          if (circle === undefined || heading === null) return null
          const words = document.createRange()
          words.selectNodeContents(heading)
          const said = words.getBoundingClientRect()
          const box = heading.getBoundingClientRect()
          const covered = [...document.querySelectorAll('#main a, #main button')]
            .filter((el) => !el.classList.contains('px-comment-circle'))
            .filter((el) => {
              const b = el.getBoundingClientRect()
              return b.width > 0 && b.left < circle.right && b.right > circle.left && b.top < circle.bottom && b.bottom > circle.top
            })
            .map((el) => (el.textContent ?? '').trim())
          return { circleTop: circle.top, circleLeft: circle.left, headingTop: box.top, headingBottom: box.bottom, wordsRight: said.right, covered }
        }, PAGE_KEY)
        expect(at, 'there is no circle or no heading').not.toBeNull()
        const where = at as NonNullable<typeof at>
        expect(where.circleTop).toBeGreaterThanOrEqual(where.headingTop - 40)
        expect(where.circleTop).toBeLessThanOrEqual(where.headingBottom)
        expect(where.circleLeft).toBeGreaterThanOrEqual(where.wordsRight - 1)
        expect(where.circleLeft).toBeLessThanOrEqual(where.wordsRight + 40)
        expect(where.covered, 'the circle covers a press').toEqual([])
        await shot(`${String(width)}-${look}-page-comment`)
      }, 180_000)
  }
})

describe('in Chinese at 1440', () => {
  it('names the thing in the head and keeps the card and the circle', async () => {
    await open(1440, 'light', `/r/${reportId}`, `open|${reviewId}|default||`, 'zh')
    const page = app.page
    await page.waitForFunction((t) => (document.querySelector('.px-pane-count')?.textContent ?? '').includes(t), TITLE, {
      timeout: 30_000,
    })
    const head = (await page.locator('.px-pane-count').first().textContent()) ?? ''
    expect(head, 'the head names the kind in English on a Chinese page').not.toContain('Report')
    expect(head).toContain(`“${TITLE}”`)
    await shot('1440-light-zh-review-pane')
    // THE TRAY'S ROW IS ALREADY SHUT; Hide comments puts the list away without folding the page.
    const bar = page.locator('[data-part="your-review-bar"]')
    const show = bar.getByRole('button', { name: '显示评论', exact: true })
    if ((await show.count()) > 0) await show.click()
    await page.waitForSelector('.px-pane[data-sheet="1"]', { timeout: 30_000 })
    besideTheirBlocks(await circlesPlaced())
    await bar.getByRole('button', { name: '收起评论', exact: true }).click()
    await page.waitForSelector('.px-pane[data-sheet="0"]')
    await page.waitForSelector('.px-said', { timeout: 30_000 })
    await page.locator('.px-said').first().scrollIntoViewIfNeeded()
    await sleep(400)
    await shot('1440-light-zh-comment-card')
    await open(1440, 'light', '/records', 'shut||||', 'zh')
    await page.waitForSelector(`.px-comment-circle[data-comments-on="${PAGE_KEY}"]`, { timeout: 30_000 })
    await shot('1440-light-zh-page-comment')
  }, 180_000)
})
