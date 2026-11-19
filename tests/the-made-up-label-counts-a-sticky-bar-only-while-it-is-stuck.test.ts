// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP LABEL COUNTS A STICKY ELEMENT AS A BAR AT THE TOP ONLY WHILE IT IS STUCK THERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS GUARDS
 * ---------------------------------------------------------------------------------------
 *
 * tests/the-made-up-label-above-the-page.ts scrolls the label below every bar already at the top of
 * the window. It read every element whose position is sticky or fixed as such a bar. A sticky
 * element is at the top only while it is stuck. On the Checklists page at 1440 with one checklist
 * open, the open checklist is a sticky panel that sits in the page's flow below the label. The
 * helper took that panel's bottom as the bars' bottom. The page could not scroll that far, so the
 * helper pushed the label down by a margin, and the picture had a blank band of about 380 pixels
 * above the label that the page does not draw.
 *
 * So a sticky element counts only while its top is its computed `top`, within a pixel. A fixed
 * element counts as before.
 *
 * The page here is made up and drawn in a browser on its own: a heading, the block a picture shows,
 * and a panel shaped like the Checklists one. The second and third cases keep what the change must
 * not lose: a sticky bar that is stuck, and a fixed bar, still push the label below them.
 *
 * Proved by mutation, each run alone against this file:
 *   - the helper's sticky element counted wherever it is, as before → the first case is red;
 *   - every sticky element left out → the second case is red, since the label is put under the bar;
 *   - every fixed element left out → the third case is red, the same way.
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

/** Where the label is after the helper put it in: its top, and the margin the helper gave it. */
async function whereTheLabelIs(page: Drawn['page']): Promise<{ top: number; marginTop: string }> {
  return page.evaluate(() => {
    const label = document.querySelector('[data-made-up-label]')
    if (label === null) throw new Error('the helper put no label into the page')
    return { top: label.getBoundingClientRect().top, marginTop: getComputedStyle(label).marginTop }
  })
}

describe('the made-up label counts a sticky element as a bar only while it is stuck', () => {
  it('leaves no band above the label for a sticky panel below it that is not stuck', async () => {
    drawn = await drawInABrowser(
      `${NO_MARGIN}<h1 id="heading" style="margin: 0; height: 40px">A page</h1>` +
        '<p id="shown" style="margin: 0; height: 40px">The block the picture shows</p>' +
        '<aside style="position: sticky; top: 16px; height: 200px">An open checklist</aside>',
    )
    await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a page with a sticky panel below the label')
    const label = await whereTheLabelIs(drawn.page)
    expect(label.marginTop, 'the margin the helper gave the label; a band above it is not drawn by the page').toBe('0px')
    expect(label.top, 'the label sits right under the heading, where the page put the block').toBeCloseTo(40, 0)
  })

  it('still puts the label below a sticky bar that is stuck at the top', async () => {
    drawn = await drawInABrowser(
      `${NO_MARGIN}<header style="position: sticky; top: 0; height: 60px; background: var(--panel)">A bar</header>` +
        `${TALL}<p id="shown" style="margin: 0; height: 40px">The block the picture shows</p>${TALL}`,
    )
    await putTheMadeUpLabelIn(drawn.page, THE_LABEL, drawn.page.locator('#shown'), 'a page with a stuck bar')
    const label = await whereTheLabelIs(drawn.page)
    expect(label.top, 'the label is below the 60-pixel bar and its 8 pixels').toBeGreaterThanOrEqual(67)
  })

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
