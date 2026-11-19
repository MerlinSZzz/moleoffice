// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FOUR MORE PAGES KEEP THEIR FACTS AND PRESSES IN SIGHT AND FOLD THEIR EXPLANATIONS. This is the second sweep of the
 * owner's decision, concise by default and the detail one press away, in wave 13q round 48.
 *
 * WHAT THIS FILE PROVES, in a real browser on a test office of its own, in English, with no fold opened:
 *   1. #/roles: on the secretary's card, the first sentence of what acting for the person is stays in sight, the rest
 *      is in a closed fold, and the press to the Embassy is outside the fold. Under the cards written here, the first
 *      sentence of "the copy grants nothing" stays in sight and the second is in a closed fold.
 *   2. #/notes: "Messages are read in the chat" stays in sight, the whole sentence is in a closed fold, and the
 *      presses to the chat and to the Messages page are outside it.
 *   3. #/resources: the four things not on the page are named in sight, and the reason is in a closed fold.
 * Every folded sentence is still on the page, word for word: it is moved down one step and never deleted.
 *
 * UNTIL WAVE 13Y ROUND 119 there was a case for #/working too: the map's bubbles paragraph in a closed fold. That
 * fold was drawn by the older built-in map, which that round deleted with its words, so the case went with it.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a fold drawn open, or its text drawn outside it again   → the case for that page
 *   a press moved into the fold                              → cases 1 and 2
 *   a folded sentence dropped                                → the case for that page
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

const en = createI18n('en')
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

/** What a fold shows closed, whether it is closed, and all the text it holds. */
async function theFold(fold: Locator): Promise<{ open: boolean; summary: string; whole: string }> {
  return {
    open: await fold.evaluate((node) => (node as HTMLDetailsElement).open),
    summary: (await fold.locator(':scope > summary').innerText()).replace(/\s+/gu, ' '),
    whole: ((await fold.textContent()) ?? '').replace(/\s+/gu, ' '),
  }
}

/** The text of a region drawn on screen, with every closed fold's body left out, as a person sees it. */
async function inSight(region: Locator): Promise<string> {
  return (await region.innerText()).replace(/\s+/gu, ' ')
}

describe('the explanations are one press down', () => {
  it('on #/roles', async () => {
    await open('roles', '.rol-elev')
    const elevation = live.page.locator('.rol-elev')
    const actingFor = await theFold(elevation.locator('details.px-explain'))
    expect(actingFor.open).toBe(false)
    expect(actingFor.summary).toContain('The person can let the secretary act for them for a while.')
    expect(actingFor.whole).toContain('While it holds, that secretary has the person')
    expect(await inSight(elevation)).not.toContain('While it holds')
    expect(await elevation.locator(':scope > a[href="#/embassy"]').isVisible()).toBe(true)

    const copy = live.page.locator('details.px-explain:has(> summary .rol-says)')
    const grants = await theFold(copy)
    expect(grants.open).toBe(false)
    expect(grants.summary).toContain('Nothing reads one of these records to decide a refusal.')
    expect(grants.whole).toContain('What an agent of a role may do is the file named in declaredIn, read when this server started.')
    expect(await inSight(live.page.locator('#main'))).not.toContain('What an agent of a role may do is the file named')
  }, 90_000)

  it('on #/notes', async () => {
    await open('notes', '.rpts-where')
    const where = live.page.locator('.rpts-where')
    const fold = await theFold(where.locator('details.px-explain'))
    expect(fold.open).toBe(false)
    expect(fold.summary).toContain(en.t('w13q.notes.whereMessagesMeaning'))
    expect(fold.whole).toContain(en.t('w13q.notes.whereMessages'))
    expect(await inSight(where)).not.toContain('which can show one project at a time')
    expect(await where.locator('.rpts-where-go a[href="#/chat"]').isVisible()).toBe(true)
    expect(await where.locator('.rpts-where-go a[href="#/messages"]').isVisible()).toBe(true)
  }, 90_000)

  it('on #/resources', async () => {
    await open('resources', '.rs-title')
    const fold = await theFold(live.page.locator('details.px-explain', { hasText: en.t('w13q.resources.othersMeaning') }))
    expect(fold.open).toBe(false)
    expect(fold.summary).toContain(en.t('w13q.resources.othersMeaning'))
    expect(fold.whole).toContain(en.t('resources.others'))
    expect(await inSight(live.page.locator('#main'))).not.toContain(en.t('resources.others'))
  }, 90_000)
})
