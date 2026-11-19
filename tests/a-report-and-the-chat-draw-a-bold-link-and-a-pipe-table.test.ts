// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT AND THE CHAT DRAW ONE BOLD LINK, AND ONE PIPE TABLE, THE SAME WAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * On a report page, `**heading ([report](#/r/<id>))**` drew its brackets and address, while the
 * same text in the chat reached the address by another path. And a table cell holding `$|A-B|$`
 * was cut into extra cells, so the table printed as typed. Both faults are in the drawing of one
 * stored line, and this file holds the two surfaces to one answer.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS DRAWN, AND WHY A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The chat and the report both go through `renderMarkdown`, but the chat also makes record ids and
 * page addresses in plain words pressable. That second walk is where the chat's link came from, so
 * only a real page shows whether the two now agree. A made-up report and a made-up message carry
 * the same words: a bold heading with a link inside it, and a table with maths, a pipe in back
 * ticks and an escaped pipe.
 *
 * Set REPORT_DRAWING_SHOTS to a folder to photograph both surfaces at 1440, 990, 660 and 390 in
 * light and dark. The ordinary run and the mutation runs take no picture.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let db: TestDb
let targetId = ''
let reportId = ''

const BODY = [
  '**Heading with a [report](#/r/TARGET) inside it**',
  '',
  '| quantity | value |',
  '| --- | --- |',
  '| absolute | $|A-B|$ |',
  '| display | $$|A-B|$$ |',
  '| code | `a|b` |',
  '| escaped | left \\| right |',
].join('\n')

beforeAll(async () => {
  db = await freshDb()

  // A report for the link to point at, then the report that draws the link.
  targetId = db.api.createRecord({
    kind: 'report',
    title: 'A made-up report the link points at',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { date: '2026-10-31', blocks: [] },
  }).id

  const text = BODY.replace('TARGET', targetId)
  reportId = db.api.createRecord({
    kind: 'report',
    title: 'A made-up report with a bold link and pipes in a table',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { date: '2026-10-31', blocks: [{ id: 'b-1', type: 'text', text }] },
  }).id

  db.api.createRecord({
    kind: 'agent',
    title: 'Pipe Agent',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { handle: 'pipe-agent', runtime: 'claude-code', state: 'active' },
  })
  db.api.createRecord({
    kind: 'message',
    title: 'The same words as the report',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { body: text, to: [{ kind: 'agent', id: 'pipe-agent' }] },
  })

  app = await liveApp({
    name: 'report-and-chat-drawing',
    database: db.file,
    workspace: 'default',
    viewport: { width: 1440, height: 1000 },
  })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    // THE THEME THE CAPTURE ASKS FOR, not always light: every page load reads the look in its address.
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

/**
 * CLOSE THE CHAT THE PREVIOUS CAPTURE OPENED. Its open state is remembered across page loads, so the
 * panel would otherwise cover the report block at 390 and the picture would show the chat instead.
 */
async function closeTheChat(): Promise<void> {
  await app.page.evaluate(() => localStorage.setItem('mole-office.chat.open', 'no'))
  const close = app.page.locator('.px-chat-close')
  if (await close.isVisible().catch(() => false)) {
    await close.click()
    await app.page.waitForSelector('.px-chat', { state: 'hidden', timeout: 20_000 })
  }
}

async function openReport(theme: 'light' | 'dark'): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${theme}&mode=normal#/r/${reportId}`)
  await waitForThePage(app.page, 45_000)
  await closeTheChat()
  await app.page.waitForSelector('main.page .sb-block.sb-text', { state: 'visible', timeout: 20_000 })
}

function bubbleWith(words: string): string {
  return `.px-chat-bubble:has(.px-chat-md:has-text("${words}"))`
}

async function openChat(theme: 'light' | 'dark'): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&look=${theme}`)
  await waitForThePage(app.page, 45_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Pipe Agent"))')
  }
  await app.page.waitForSelector(bubbleWith('Heading with a'), { timeout: 20_000 })
}

/** What the bold heading and the table drew, on whichever surface is open. */
async function readDrawing(where: 'report' | 'chat'): Promise<{
  strongWords: string | null
  links: { href: string | null; text: string | null }[]
  rows: string[][]
  maths: number
}> {
  return await app.page.evaluate((place) => {
    const box =
      place === 'report'
        ? document.querySelector('main.page .sb-block.sb-text')
        : [...document.querySelectorAll('.px-chat-bubble')].find((bubble) =>
            (bubble.querySelector('.px-chat-md')?.textContent ?? '').includes('Heading with a'),
          ) ?? null
    if (box === null) throw new Error(`the ${place} drew no box holding the words`)
    const strong = box.querySelector('strong')
    const table = box.querySelector('table')
    return {
      strongWords: strong?.textContent ?? null,
      links:
        strong === null
          ? []
          : [...strong.querySelectorAll('a')].map((one) => ({ href: one.getAttribute('href'), text: one.textContent })),
      rows:
        table === null
          ? []
          : [...table.querySelectorAll('tbody tr')].map((row) =>
              [...row.querySelectorAll('td')].map((cell) => (cell.textContent ?? '').trim()),
            ),
      maths: table === null ? 0 : table.querySelectorAll('tbody [role="math"]').length,
    }
  }, where)
}

async function photograph(): Promise<void> {
  const folder = process.env['REPORT_DRAWING_SHOTS']
  if (!folder) return
  mkdirSync(folder, { recursive: true })
  const lightShots = new Map<string, Buffer>()
  /**
   * TAKE ONE PICTURE, AND REFUSE A DARK ONE THAT REPEATS ITS LIGHT ONE. A dark capture whose bytes
   * equal the light capture of the same surface and width means the page never took the theme the
   * capture asked for, so the picture is not evidence about dark mode at all.
   */
  async function capture(name: string, theme: 'light' | 'dark', take: () => Promise<Buffer>): Promise<void> {
    const bytes = await take()
    if (theme === 'light') {
      lightShots.set(name, bytes)
      return
    }
    const light = lightShots.get(name)
    expect(light, `${name} has no light picture to compare the dark one with`).toBeDefined()
    expect(light?.equals(bytes), `${name} is the same picture in dark as in light`).toBe(false)
  }
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1400 })
      await openReport(theme)
      const block = app.page.locator('main.page .sb-block.sb-text').first()
      await block.scrollIntoViewIfNeeded()
      await app.page.waitForTimeout(300)
      await capture(`report-${String(width)}`, theme, () =>
        block.screenshot({ path: `${folder}/report-${String(width)}-${theme}.png` }),
      )

      await openChat(theme)
      const bubble = app.page.locator(bubbleWith('Heading with a')).first()
      // THE PANEL, NOT THE BUBBLE ALONE: a bubble taller than the chat's scroll box is cut by the
      // box in a screenshot of the bubble. Two views show the whole of it: the heading at its top,
      // then the table under it.
      await bubble.evaluate((one) => one.scrollIntoView({ block: 'start' }))
      await app.page.waitForTimeout(300)
      await capture(`chat-heading-${String(width)}`, theme, () =>
        app.page.locator('.px-chat').first().screenshot({ path: `${folder}/chat-${String(width)}-${theme}-heading.png` }),
      )
      if ((await bubble.locator('table').count()) > 0) {
        await bubble.locator('table').first().evaluate((one) => one.scrollIntoView({ block: 'center' }))
      } else {
        // Before the fix the table prints as typed, so the second view is the bottom of the bubble
        // where those lines are.
        await bubble.evaluate((one) => one.scrollIntoView({ block: 'end' }))
      }
      await app.page.waitForTimeout(300)
      await capture(`chat-table-${String(width)}`, theme, () =>
        app.page.locator('.px-chat').first().screenshot({ path: `${folder}/chat-${String(width)}-${theme}-table.png` }),
      )
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1400 })
}

it('draws the bold link as a link and the pipe table with two cells in every row, on both surfaces', async () => {
  await photograph()

  await openReport('light')
  const report = await readDrawing('report')
  expect(report.strongWords).not.toContain('](#/r/')
  expect(report.links).toEqual([{ href: `#/r/${targetId}`, text: 'report' }])
  expect(report.rows.map((row) => row.length)).toEqual([2, 2, 2, 2])
  expect(report.rows[0]?.[0]).toBe('absolute')
  expect(report.rows[1]?.[0]).toBe('display')
  expect(report.rows[2]).toEqual(['code', 'a|b'])
  expect(report.rows[3]).toEqual(['escaped', 'left | right'])
  expect(report.maths).toBe(2)

  await openChat('light')
  const chat = await readDrawing('chat')
  expect(chat.strongWords).not.toContain('](#/r/')
  expect(chat.links).toEqual([{ href: `#/r/${targetId}`, text: 'report' }])
  expect(chat.rows.map((row) => row.length)).toEqual([2, 2, 2, 2])
  expect(chat.rows[2]).toEqual(['code', 'a|b'])
  expect(chat.rows[3]).toEqual(['escaped', 'left | right'])
  expect(chat.maths).toBe(2)
}, 600_000)
