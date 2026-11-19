// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE THAT FAILS WHILE IT IS BEING DRAWN SAYS SO, IN WORDS, WHERE THE PAGE WAS. Criterion E4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * After a press on Retire, the agent was still there when the page was opened again. Retire was pressed on an
 * agent's page and the page went white. Nothing anywhere under src/ caught a fault while a page was
 * being drawn — no boundary, no `componentDidCatch`, no `window.onerror` — so React unmounted the
 * whole tree and the reader was left with a white rectangle and no way to find out why except the
 * browser's own console.
 *
 * A blank page is one form of failing loudly, and failing loudly is the point. The blankness is
 * not the fault. What E4 asks is that the loud failure carries its words.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · in a real browser: a page that cannot draw what it was sent is not blank. The fault's own
 *     message, the page's name and a press that loads the page again are all on the screen;
 *   · the words name the press that led there when one was made;
 *   · and they say plainly that nothing was pressed when nothing was, rather than leaving a gap;
 *   · a press whose handler stops is caught and its message kept, rather than thrown on.
 *
 * THE FAULT IS MADE BY THE TEST AND NOT BY THE PRODUCT. The Embassy's own reply is answered with an
 * empty object, which is a shape the page cannot draw. That is a real drawing fault of exactly the
 * kind E4 is about, and it does not need the product to keep a bug for the test to point at.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   take `<TheFaultBoundary>` out of src/web/App.tsx → the browser case goes red: the page is blank
 *     again and none of the words are there.
 *   drop `press: theLastPress()` from `getDerivedStateFromError` → the press case goes red.
 *   let the fault out of `whatThePressDid` instead of returning its message → the press-handler
 *     case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import {
  FAULT_WORDS,
  TheFault,
  TheFaultBoundary,
  forgetPresses,
  notePress,
  whatThePressDid,
} from '../src/web/components/TheFault.tsx'

// ============================================================ 1. a real page, in a real browser

describe('a page that cannot draw what it was sent', () => {
  let app: LiveApp
  let page: Page

  beforeAll(async () => {
    app = await liveApp({ name: 'fails-while-drawing', viewport: { width: 1440, height: 1000 } })
    page = app.page
    // THE EMBASSY'S OWN REPLY, ANSWERED WITH A SHAPE THE PAGE CANNOT DRAW. The page reads a list off
    // it at once, so an empty object is a fault while drawing and not a fault while fetching.
    // THE REAL REPLY'S HEADERS, WITH A BODY THE PAGE CANNOT DRAW. The headers say which office answered;
    // a reply that names none is refused once the page has heard from its office, and the page's
    // language is read from the office before this page asks for anything.
    await page.route('**/api/office/embassy*', async (route) =>
      route.fulfill({ response: await route.fetch(), status: 200, contentType: 'application/json', body: '{}' }),
    )
    await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('is not blank', async () => {
    const said = await page.evaluate(() => ({
      faults: document.querySelectorAll('.fault').length,
      words: (document.querySelector('main')?.textContent ?? '').trim().length,
    }))
    expect(said.faults, 'the fault is drawn where the page was').toBe(1)
    expect(said.words, 'and the page carries words rather than nothing').toBeGreaterThan(0)
  })

  it('says what stopped, in the fault’s own words', async () => {
    const said = await page.evaluate(() => ({
      what: document.querySelector('.fault-what')?.textContent ?? '',
      message: (document.querySelector('.fault-message')?.textContent ?? '').trim(),
    }))
    expect(said.what).toBe(FAULT_WORDS.whileDrawing)
    // THE MESSAGE IS THE BROWSER'S OWN AND IS NOT SPELLED OUT HERE: the wording of a TypeError
    // belongs to the engine and a test that quoted it would fail on the next Chromium. What is
    // measured is that the fault's own words reached the screen instead of being swallowed.
    expect(said.message.length, 'the fault carries its own message').toBeGreaterThan(0)
  })

  it('names the page and offers the way on', async () => {
    const said = await page.evaluate(() => ({
      text: document.querySelector('.fault')?.textContent ?? '',
      again: document.querySelector('.fault-again')?.textContent ?? '',
    }))
    expect(said.text, 'the page it happened on').toContain('Embassy')
    expect(said.again).toBe(FAULT_WORDS.again)
  })

  it('says nothing was pressed, because the reader arrived by an address', async () => {
    const text = await page.evaluate(() => document.querySelector('.fault')?.textContent ?? '')
    expect(text).toContain(FAULT_WORDS.nothingPressed)
  })
})

// ============================================================ 2. the words, and the press

describe('the words a caught fault carries', () => {
  it('names the press that led there', () => {
    forgetPresses()
    notePress('Retire')
    const said = TheFaultBoundary.getDerivedStateFromError(new Error('the store said no')).fault
    expect(said?.press, 'the press that led here').toBe('Retire')
    const drawn = renderToStaticMarkup(
      h(TheFault, { said: { ...said!, page: 'Citizens' }, what: FAULT_WORDS.whileDrawing }),
    )
    expect(drawn, 'the fault’s own message').toContain('the store said no')
    expect(drawn, 'the page').toContain('Citizens')
    expect(drawn, 'and the press').toContain('Retire')
  })

  it('says nothing was pressed where nothing was, rather than leaving a gap', () => {
    forgetPresses()
    const said = TheFaultBoundary.getDerivedStateFromError(new Error('the store said no')).fault
    expect(said?.press).toBeNull()
    const drawn = renderToStaticMarkup(
      h(TheFault, { said: { ...said!, page: 'Citizens' }, what: FAULT_WORDS.whileDrawing }),
    )
    expect(drawn).toContain(FAULT_WORDS.nothingPressed)
    expect(drawn, 'and no label with nothing beside it').not.toContain(`>${FAULT_WORDS.press}<`)
  })

  it('keeps a fault thrown by a press instead of throwing it on', () => {
    expect(whatThePressDid(() => {})).toBeNull()
    expect(
      whatThePressDid(() => {
        throw new Error('the handle was not there')
      }),
    ).toBe('the handle was not there')
  })
})
