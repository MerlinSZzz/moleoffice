// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DEADLINE CHIP ON THE WORK PAGE KEEPS ITS PHRASE WHOLE, AND ONE THING HAS ONE CHINESE WORD.
 *
 * The secretary's review of round 27's pictures (report xCcIuuYOsM67; message voFYfK0IrmuL):
 * - the work page's state chip wrapped mid-phrase at 1440, 990 and 660 ("due in 23 / days") and split Chinese words
 *   ("23 天后到 / 期", "未关 / 闭");
 * - one thing had two Chinese words: 晚了 N 天 on the work page and 逾期 N 天 on Home; 需要你 on the work page and 等你处理
 *   on Home, both under the English heading "Needs you".
 *
 * Held here: every count phrase on the work page's chips draws on one line, every state word on its chip draws
 * unbroken, and neither runs past its chip's edge, at 1440 and 660, in English and in Chinese.
 *
 * MUTATIONS: the work page's state column no longer putting the count on a line of its own (the `.wk-state` selectors
 * taken off the severity column's rule in src/web/components/ui.tsx). It is red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const HEADERS = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const dayFromToday = (days: number): string => {
  const when = new Date()
  when.setDate(when.getDate() + days)
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-deadline-chip-keeps-its-phrase-whole', viewport: { width: 1440, height: 1000 } })
  for (const [title, days] of [
    ['Test return the kite string', -5],
    ['Test return the paper', -1],
    ['Test pay for the glue', 1],
    ['Test repaint the kite tail', 23],
  ] as const) {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ kind: 'obligation', title, data: { state: 'open', due: dayFromToday(days), owedTo: 'Test kite club' } }),
    })
    expect(made.status, await made.text()).toBe(201)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('draws every count phrase on one line and every state word unbroken, at 1440 and 660, in English and Chinese', async () => {
  for (const language of ['en', 'zh'] as const) {
    for (const width of [1440, 660]) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.goto(`${app.site}/?lang=${language}#/work`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.locator('.px-chip-stored .px-chip-count').first().waitFor({ timeout: 20_000 })
      // THE LINES A PIECE OF TEXT DRAWS ON, counted from the boxes of its own text.
      const broken = await app.page.evaluate(() => {
        const linesOf = (el: Element): number => {
          const range = document.createRange()
          range.selectNodeContents(el)
          return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size
        }
        const out: string[] = []
        for (const chip of document.querySelectorAll('.px-chip-stored')) {
          const count = chip.querySelector('.px-chip-count')
          const word = chip.querySelector('.px-chip-word')
          if (count !== null && linesOf(count) > 1) out.push(`count "${(count as HTMLElement).innerText}" on ${String(linesOf(count))} lines`)
          if (word !== null && linesOf(word) > 1) out.push(`word "${(word as HTMLElement).innerText}" on ${String(linesOf(word))} lines`)
          // AND INSIDE ITS CHIP: a phrase kept on one line by running past the chip's edge is not kept whole.
          const edge = chip.getBoundingClientRect().right + 0.5
          for (const part of [count, word]) {
            if (part === null) continue
            const range = document.createRange()
            range.selectNodeContents(part)
            if (range.getBoundingClientRect().right > edge) out.push(`"${(part as HTMLElement).innerText}" runs past its chip`)
          }
        }
        return out
      })
      expect(broken, `${language} at ${String(width)}`).toEqual([])
    }
  }
}, 180_000)

