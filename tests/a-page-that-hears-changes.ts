// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE OPENED SO THAT A CHANGE MADE NEXT IS HEARD, for the browser tests of pages that follow changes (wave 13y,
 * rounds 145 and 146). A page hears a change only once it holds the server's event stream open. A write made before
 * then is not heard, and a case would pass or fail by its timing, so a case opens its page with `open` and writes after.
 */
import type { Page } from 'playwright'
import { waitForThePage } from './helpers.ts'

/** The test office a page is opened in: its API, its site, and the headers it is asked with. */
export interface HeardOffice {
  api: string
  site: string
  headers: Record<string, string>
}

/** Wait until this many pages hold the event stream open, so a write made next is heard. */
export async function listening(office: HeardOffice, pages: number): Promise<void> {
  const until = Date.now() + 15_000
  for (;;) {
    const state = (await (await fetch(`${office.api}/api/events/state`, { headers: office.headers })).json()) as { pagesOpen: number }
    if (state.pagesOpen === pages) return
    if (Date.now() > until) throw new Error(`the server holds ${String(state.pagesOpen)} open pages, not ${String(pages)}, after 15 seconds`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Open a page afresh, wait for it to draw `waitFor` and listen, and mark the window so a reload would be seen. */
export async function open(office: HeardOffice, page: Page, hash: string, waitFor: string): Promise<void> {
  await page.goto('about:blank')
  await listening(office, 0)
  await page.goto(`${office.site}/?lang=en&mode=normal#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
  await listening(office, 1)
  await page.evaluate(() => {
    ;(window as unknown as { notReloaded: boolean }).notReloaded = true
  })
}

/** Whether the mark `open` put on the window is still there, so the page was not loaded again. */
export async function notReloaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded === true)
}
