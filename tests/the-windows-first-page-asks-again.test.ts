// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW'S FIRST PAGE ASKS AGAIN WHEN WINDOWS DID NOT SAY IN TIME WHO SENT ITS READS. Wave 13t, round W37.
 *
 * In walks on Windows 11 with the beta.2 installer, on one start in four the window's first page was only the
 * server's refusal: the operating system did not say within 10 seconds which program sent the request. The page stayed
 * so. src/web/main.tsx wrote any failure of its first reads as the whole page, and did not ask again. Inside the
 * installed Windows app that refusal now carries the code `senderNotReadInTime` (src/server/lib/from-a-sandbox.ts), and
 * the page asks its first reads again. Since round W40 the page's transport asks every such request again
 * (src/web/api.ts), and src/web/lib/windows-did-not-say.ts says meanwhile that the page waits:
 *
 *   P1 refused once, the page says it is waiting for the operating system, asks again, and then draws;
 *   P2 refused every time, the page asks four times in all, then says what happened and what to do, and is marked drawn;
 *   P3 an uncoded 503 is shown at once, and not asked again;
 *   P4 the waiting sentence and every failed start have the page's margin, at 390 and at 1440 pixels (round W40). Until
 *      W40 the start wrote them as the root's bare text, flush against the window's edge.
 *
 * The refusal is answered by the browser itself (`page.route`) for one of the first reads, the sidebar's, because no
 * server here reads who sent a request by the way that waits. tests/the-windows-window-is-the-person.test.ts T5 holds
 * that the server sends this code.
 *
 * NOTHING HERE RAN ON WINDOWS. The page is the built app in Chromium on Linux. That the window's own menu has Reload
 * under View is read from a picture of the window taken on one of those walks (kept under out/win11/).
 *
 * MUTATIONS, after a control run: src/web/api.ts does not ask a refused request again (red: P1 and P2);
 * src/web/lib/the-start-says.ts draws the sentence without the page's class (red: P4, the sentence has no margin).
 */

import type { Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'windows-first-page', viewport: { width: 1440, height: 972 } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The server's refusal of a request whose sender was not read within 10 seconds, as the server sends it. */
const THE_CODED_REFUSAL = {
  error:
    'This request was refused, and nothing was done. The operating system did not say within 10 seconds which program on ' +
    'this computer sent it, so Mole Office does not know who sent it. Send the request again.',
  code: 'senderNotReadInTime',
  values: { seconds: 10 },
}

/** The same status with a sentence and no code: another 503 the server could send. */
const AN_UNCODED_503 = { error: 'A made-up refusal: the store is not ready.' }

/** Open the app with the sidebar's first reads answered by `answer`, which is told how many times it has been asked. */
async function openWithTheSidebarAnswered(answer: (asked: number, route: Route) => Promise<void>): Promise<{ page: Page; asked: () => number }> {
  const page = await app.browser.newPage({ viewport: { width: 1440, height: 972 } })
  let asked = 0
  await page.route('**/api/sidebar', async (route) => {
    asked += 1
    await answer(asked, route)
  })
  return { page, asked: () => asked }
}

const refuse = (route: Route, body: object): Promise<void> =>
  route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(body) })

const theRootText = (page: Page): Promise<string> => page.evaluate(() => document.getElementById('root')?.innerText ?? '')

describe("the window's first page, when Windows did not say in time who sent its reads", () => {
  it('P1: refused once, it says it is waiting for the operating system, asks again, and then draws', async () => {
    const { page, asked } = await openWithTheSidebarAnswered((n, route) => (n === 1 ? refuse(route, THE_CODED_REFUSAL) : route.fallback()))
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').includes('Waiting for the operating system'), undefined, { timeout: 20_000 })
        .catch(async () => {
          throw new Error(`the page never said it was waiting for the operating system; it said: ${await theRootText(page)}`)
        })
      await waitForThePage(page, 60_000)
      const drawn = await page.evaluate(() => ({ shell: document.querySelector('main.page') !== null, text: document.getElementById('root')?.innerText ?? '' }))
      expect(drawn.text, 'the page still shows the refusal').not.toContain('did not say within')
      expect(drawn.text, 'the page still says it is waiting').not.toContain('Waiting for the operating system')
      expect(drawn.shell, `the page was not drawn: ${drawn.text.slice(0, 300)}`).toBe(true)
      expect(asked(), 'the sidebar was not asked again exactly once').toBe(2)
    } finally {
      await page.close()
    }
  }, 120_000)

  it('P2: refused every time, it asks four times in all, then says what happened and what to do', async () => {
    const { page, asked } = await openWithTheSidebarAnswered((_n, route) => refuse(route, THE_CODED_REFUSAL))
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const text = await theRootText(page)
      expect(asked(), `the sidebar was asked ${String(asked())} times`).toBe(4)
      expect(text, 'the page does not say how many times it asked').toContain('asked 4 times')
      expect(text, 'the page does not say how long Windows was waited for').toContain('within 10 seconds')
      expect(text, 'the page does not say what to do').toContain('choose Reload in the View menu')
      expect(text, 'the page still says it is waiting').not.toContain('Waiting for the operating system')
    } finally {
      await page.close()
    }
  }, 120_000)

  it('P3: an uncoded 503 is shown at once, and not asked again', async () => {
    const { page, asked } = await openWithTheSidebarAnswered((_n, route) => refuse(route, AN_UNCODED_503))
    try {
      await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      expect(await theRootText(page)).toContain(AN_UNCODED_503.error)
      expect(asked(), 'an uncoded refusal was asked again').toBe(1)
    } finally {
      await page.close()
    }
  }, 120_000)

  it.each([390, 1440])("P4: at %i pixels, the waiting sentence and each failed start have the page's margin", async (width) => {
    const states: { name: string; open: (page: Page) => Promise<void> }[] = [
      {
        name: 'the waiting sentence',
        open: async (page) => {
          let asked = 0
          await page.route('**/api/sidebar', async (route) => {
            asked += 1
            await (asked === 1 ? refuse(route, THE_CODED_REFUSAL) : route.fallback())
          })
          await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
          await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').includes('Waiting for the operating system'), undefined, { timeout: 20_000 })
        },
      },
      {
        name: 'the start that Windows never answered',
        open: async (page) => {
          await page.route('**/api/sidebar', (route) => refuse(route, THE_CODED_REFUSAL))
          await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
        },
      },
      {
        name: 'a start whose owner read failed',
        open: async (page) => {
          await page.route('**/api/office/owner**', (route) => refuse(route, AN_UNCODED_503))
          await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
        },
      },
    ]
    for (const state of states) {
      const page = await app.browser.newPage({ viewport: { width, height: 972 } })
      try {
        await state.open(page)
        const seen = await page.evaluate(() => {
          const root = document.getElementById('root')
          const said = root?.firstElementChild ?? null
          const probe = document.createElement('main')
          probe.className = 'page'
          document.body.append(probe)
          const margin = (element: Element) => {
            const style = getComputedStyle(element)
            return { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft }
          }
          const want = margin(probe)
          probe.remove()
          return { text: root?.innerText ?? '', children: root?.children.length ?? 0, said: said === null ? null : margin(said), want }
        })
        expect(seen.text.trim(), `${state.name} drew nothing`).not.toBe('')
        expect(seen.want.left, "the page's margin could not be read from the stylesheet").not.toBe('0px')
        expect(seen.children, `${state.name} is not drawn as one element: ${seen.text.slice(0, 200)}`).toBe(1)
        expect(seen.said, `${state.name} has not the page's margin`).toEqual(seen.want)
      } finally {
        await page.close()
      }
    }
  }, 180_000)
})
