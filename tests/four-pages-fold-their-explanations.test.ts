// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR MORE PAGES KEEP THEIR FACTS AND PRESSES IN SIGHT AND FOLD THEIR EXPLANATIONS. This is the second sweep of the
 * owner's decision, concise by default and the detail one press away, in wave 13q round 48.
 *
 * WHAT THIS FILE PROVES, in a real browser on a test office of its own, in English, with no fold opened:
 *   1. #/roles: on the secretary's card, the first sentence of what acting for the person is is behind the closed
 *      hint on its label, and the press to the Embassy is in sight. Until November 2026 that sentence was in sight
 *      with the rest in a closed fold, and "the copy grants nothing" was folded under the cards written here; as
 *      decided then, the rest is not drawn and "the copy grants nothing" is drawn for a developer only.
 *   2. #/notes: the presses to the chat and to the Messages page are in sight. Its sentence about where messages are
 *      read is removed, not folded, as decided, so this case holds no fold.
 *   3. #/resources draws no fold. Before, the four things not on the page were named in sight and the reason was in a
 *      closed fold; as decided, explanatory text is removed from a page rather than folded away.
 *
 * UNTIL WAVE 13Y ROUND 119 there was a case for #/working too: the map's bubbles paragraph in a closed fold. That
 * fold was drawn by the older built-in map, which that round deleted with its words, so the case went with it.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the hint drawn open, or its text drawn outside it       → case 1
 *   a press moved into the hint                              → case 1
 *   a press to the chat or the Messages page dropped         → case 2
 *   a fold drawn on #/resources again                        → case 3
 *   the hint's sentence dropped                              → case 1
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'

let live: LiveApp

beforeAll(async () => {
  live = await liveApp({ name: 'four-pages-fold-their-explanations', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => {
  await live?.stop()
}, 60_000)

async function open(path: string, ready: string): Promise<void> {
  await live.page.goto(`${live.site}/#/${path}`, { waitUntil: 'domcontentloaded' })
  await live.page.locator(ready).first().waitFor({ state: 'attached', timeout: 30_000 })
}

/** The text of a region drawn on screen, with every closed fold's body left out, as a person sees it. */
async function inSight(region: Locator): Promise<string> {
  return (await region.innerText()).replace(/\s+/gu, ' ')
}

describe('the explanations are one press down', () => {
  it('on #/roles', async () => {
    await open('roles', '.rol-elev')
    const elevation = live.page.locator('.rol-elev')
    const hint = elevation.locator('.rol-elev-head details.px-hint-mark')
    expect(await hint.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false)
    expect(((await hint.locator('.px-hint-body').textContent()) ?? '').replace(/\s+/gu, ' ').trim()).toBe(
      'The person can let the secretary act for them for a while.',
    )
    expect(await inSight(elevation)).not.toContain('The person can let the secretary')
    expect(await elevation.locator(':scope > a[href="#/embassy"]').isVisible()).toBe(true)
  }, 90_000)

  it('on #/notes', async () => {
    await open('notes', '.rpts-where')
    const where = live.page.locator('.rpts-where')
    expect(await where.locator('.rpts-where-go a[href="#/chat"]').isVisible()).toBe(true)
    expect(await where.locator('.rpts-where-go a[href="#/messages"]').isVisible()).toBe(true)
  }, 90_000)

  it('on #/resources, where nothing is folded because the page draws no explanation', async () => {
    await open('resources', '.rs-title')
    expect(await live.page.locator('#main details.px-explain').count()).toBe(0)
  }, 90_000)
})
