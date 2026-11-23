// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP LABEL WAITS FOR AN ENDING WAIT LIGHT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * The wait light is a canvas fixed over the part being waited for. When its wait ends it fades and is
 * taken out of the page. tests/the-made-up-label-above-the-page.ts counted every fixed element at the
 * top of the window as a bar, so a light that was still fading was counted too. On a page that
 * scrolled, the picture showed the part's frame with nothing in it, and when the light was high, a
 * blank band under the heading.
 *
 * So the helper waits, for at most five seconds, until no wait light with a running animation is left,
 * and then reads the bars. A light with no animation is still waiting, and is left where it is: a
 * picture may show it on purpose. A wait light is never a bar.
 *
 * The page here is made up and drawn in a browser on its own: a heading, the block a picture shows,
 * and a light made as src/web/lib/waiting-light.ts makes one.
 *
 * Proved by mutation, each run alone against this file:
 *   - the wait taken out → the first case is red, because the light is still there when the label is put in;
 *   - the wait light counted among the bars again → the second case is red;
 *   - no bound on the wait → the third case is red, because it never answers;
 *   - every fixed element left out → the fourth case is red, because the label is put above the bar.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { drawInABrowser, type Drawn } from './what-the-browser-draws.ts'

/** The words of the label in every case. */
const THE_LABEL = 'Made-up page, drawn for this test only'

/** The page is drawn with no margin round it, so a bar at the top of the page is at the top of the window. */
const NO_MARGIN = '<style>body { margin: 0; font: 16px sans-serif }</style>'

/** The filler that makes a page tall enough to scroll the block to the top of the window. */
const TALL = '<div style="height: 1500px">A long page above the block</div>'

let drawn: Drawn | null = null

afterEach(async () => {
  await drawn?.close()
  drawn = null
})

/** The page every case starts with: a heading and the block the picture shows. */
const THE_PAGE = `${NO_MARGIN}<h1 id="heading" style="margin: 0; height: 40px">A page</h1>` +
  '<p id="shown" style="margin: 0; height: 40px">The block the picture shows</p>'

/**
 * Put a light in the page as src/web/lib/waiting-light.ts makes one: a fixed canvas with data-wait-light.
 * With a duration it fades for that long and takes itself out when the fade ends.
 */
async function putTheWaitLightIn(page: Drawn['page'], duration?: number): Promise<void> {
  await page.evaluate((fadeFor) => {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.waitLight = ''
    Object.assign(canvas.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483646',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      right: 'auto',
      bottom: 'auto',
      left: '860px',
      top: '230px',
      width: '110px',
      height: '40px',
    })
    document.body.append(canvas)
    if (fadeFor === null) return
    const fade = canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fadeFor, fill: 'forwards' })
    void fade.finished.then(() => canvas.remove())
  }, duration ?? null)
}

/** Where the label is after the helper put it in, and how many wait lights are left. */
async function whereTheLabelIs(page: Drawn['page']): Promise<{ top: number; marginTop: string; lights: number }> {
  return page.evaluate(() => {
    const label = document.querySelector('[data-made-up-label]')
    if (label === null) throw new Error('the helper put no label into the page')
    return {
      top: label.getBoundingClientRect().top,
      marginTop: getComputedStyle(label).marginTop,
      lights: document.querySelectorAll('canvas[data-wait-light]').length,
    }
  })
}

describe('the made-up label waits for an ending wait light', () => {
  it('waits for a fading wait light to end, then puts the label under the heading', async () => {
    drawn = await drawInABrowser(THE_PAGE)
    await putTheWaitLightIn(drawn.page, 400)
    await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a page with an ending wait light')
    const label = await whereTheLabelIs(drawn.page)
    expect(label.lights, 'the ending light was still in the page').toBe(0)
    expect(label.marginTop, 'the margin the helper gave the label; a band above it is not drawn by the page').toBe('0px')
    expect(label.top, 'the label sits right under the heading, where the page put the block').toBeCloseTo(40, 0)
  })

  it('leaves a wait light that is still waiting in the page, and does not count it as a bar', async () => {
    drawn = await drawInABrowser(THE_PAGE)
    await putTheWaitLightIn(drawn.page)
    await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a page with a light still waiting')
    const label = await whereTheLabelIs(drawn.page)
    expect(label.lights, 'the light still waiting was taken out of the page').toBe(1)
    expect(label.marginTop, 'the margin the helper gave the label; a band above it is not drawn by the page').toBe('0px')
    expect(label.top, 'the label sits right under the heading, where the page put the block').toBeCloseTo(40, 0)
  })

  it('stops waiting after five seconds when a light does not end', async () => {
    drawn = await drawInABrowser(THE_PAGE)
    await putTheWaitLightIn(drawn.page, 60_000)
    const said = await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a light that does not end').then(
      () => 'the helper answered where it should have refused',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
    expect(said).toContain('putTheMadeUpLabelIn(a light that does not end)')
  }, 15_000)

  it('still puts the label below a bar fixed at the top', async () => {
    drawn = await drawInABrowser(
      `${NO_MARGIN}<header style="position: fixed; top: 0; left: 0; right: 0; height: 50px; background: var(--panel)">A bar</header>` +
        `${TALL}<p id="shown" style="margin: 0; height: 40px">The block the picture shows</p>${TALL}`,
    )
    await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a page with a fixed bar')
    const label = await whereTheLabelIs(drawn.page)
    expect(label.top, 'the label is below the 50-pixel bar and its 8 pixels').toBeGreaterThanOrEqual(57)
  })
})
