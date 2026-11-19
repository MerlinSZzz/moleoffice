// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WAIT UNTIL THE DRAWING HAS STOPPED MOVING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TEST NEEDS THIS, AND WHY THE PAGE CANNOT SAY IT
 * ---------------------------------------------------------------------------------------
 *
 * A press on a drawing changes what a card says, and then the drawing may be laid out again. The
 * page does not say when that new layout is finished. `data-state` on `.gx-canvas-wrap` stays
 * `drawn` while a drawing already on screen is laid out again, and `data-shows` stays `1`
 * (src/web/components/graph/Canvas.tsx, the layout effect). The ready mark of src/web/lib/ready.ts
 * does not come off for a press that sends no request. So the browser tests waited a fixed time
 * after each press, from 0.2 to 5 seconds, whether the drawing needed it or not.
 *
 * What a test needs after a press is the drawing as it will stay. This waits for exactly that: it
 * reads the drawing on every animation frame, and returns once nothing has changed for long enough.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST STOP CHANGING
 * ---------------------------------------------------------------------------------------
 *
 *   - where every card is on the screen, and how big it is (each `.react-flow__node`);
 *   - the words on every card;
 *   - the path of every line (the `d` of each path in a `.react-flow__edge`), because a line is
 *     routed again after the cards it joins have moved;
 *   - the view's transform (`.react-flow__viewport`), which a zoom or a move of the window changes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MUST BE TRUE AS WELL, ON EVERY ONE OF THOSE FRAMES
 * ---------------------------------------------------------------------------------------
 *
 *   - `.gx-canvas-wrap` reads `data-state="drawn"` and `data-shows="1"`. While a drawing is laid
 *     out for the first time it reads `laying-out` and `0`, and its cards sit still at the origin,
 *     so without this the wait could end in that gap.
 *   - no request the page sent is still out, and the ready mark names the address the page is at.
 *     A press can save something: after a drag the page stores the card's place (`putDown` in
 *     Canvas.tsx), and the press is not over while that request is out. Both are read from what
 *     ready.ts leaves: the count from `window.__moleOfficeReady`, the mark from the `<html>` element.
 *
 * A frame on which one of these is false counts as a frame on which something changed.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN IT COUNTS AS SETTLED, AND WHY BOTH HALVES
 * ---------------------------------------------------------------------------------------
 *
 * Nothing has changed for at least 300 milliseconds AND for at least 10 animation frames in a row.
 *
 * TIME ALONE IS NOT ENOUGH. The drawing is laid out by ELK on the page's own thread, two animation
 * frames after the change that asked for it. While ELK works, no frame runs; when it is done, the
 * next frame can find that 300 milliseconds have passed with nothing changed, before React has put
 * the new places on the page. Ten frames in a row cannot pass inside one blocked stretch.
 *
 * FRAMES ALONE ARE NOT ENOUGH EITHER. A frame can come every few milliseconds, and ten of them can
 * pass between the press and the moment the layout starts. A pipeline box that was resized books
 * its layout 100 milliseconds later (`A_BOX_LAYOUT_AT_MOST_EVERY` in Canvas.tsx), which is inside
 * the 300.
 *
 * WHAT IT CANNOT SEE. A change that starts later than 300 milliseconds and 10 frames after the
 * press, with nothing changing before it, is not waited for. In Canvas.tsx as it stands, the
 * layout effect asks for its sizes two animation frames after it runs, and ELK starts then. If a
 * change to the drawing made a layout start later than that, a test using this could stop seeing
 * its fault. That is why each file that uses this has its fault proved again by mutation.
 *
 * It throws after 30 seconds and says which of the things above was still changing or still not
 * true, because a drawing that never holds still is a fault to be named, not a picture to be read
 * anyway.
 */
import type { Page } from 'playwright'

/** How long nothing may change before the drawing counts as settled. */
const QUIET_MS = 300

/** How many animation frames in a row nothing may change. See the header for why both. */
const QUIET_FRAMES = 10

/** How long to wait before saying the drawing never held still. */
const AT_MOST_MS = 30_000

/**
 * Wait until the drawing on this page has stopped moving.
 *
 * Throws when there is no drawing on the page, and when the drawing has not held still after 30
 * seconds, naming what was still changing.
 */
export async function theDrawingHasSettled(page: Page): Promise<void> {
  const failed = await page.evaluate(
    ({ quietMs, quietFrames, atMostMs }) =>
      new Promise<string | null>((resolve) => {
        if (document.querySelector('.gx-canvas-wrap') === null) {
          resolve(`there is no drawing on this page (${window.location.hash}): no .gx-canvas-wrap`)
          return
        }
        const reader = (window as unknown as { __moleOfficeReady?: () => { inFlight: number } }).__moleOfficeReady
        const round = (n: number): number => Math.round(n * 2) / 2
        /** What must stop changing, one string for each. */
        const read = (): Record<string, string> => {
          const nodes = [...document.querySelectorAll('.react-flow__node')]
          return {
            'where the cards are and their sizes': nodes
              .map((node) => {
                const at = node.getBoundingClientRect()
                return `${node.getAttribute('data-id') ?? '?'}:${round(at.x)},${round(at.y)},${round(at.width)},${round(at.height)}`
              })
              .join(' '),
            'the words on the cards': nodes.map((node) => node.textContent ?? '').join('\u0000'),
            'the paths of the lines': [...document.querySelectorAll('.react-flow__edge path')]
              .map((path) => path.getAttribute('d') ?? '')
              .join(' '),
            "the view's transform": document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '',
          }
        }
        /** What must be true as well, each one named by what it says when it is not. */
        const notYet = (): string[] => {
          const wrap = document.querySelector('.gx-canvas-wrap')
          const out: string[] = []
          const state = wrap?.getAttribute('data-state') ?? null
          const shows = wrap?.getAttribute('data-shows') ?? null
          if (state !== 'drawn' || shows !== '1') out.push(`the drawing is not drawn (data-state=${state}, data-shows=${shows})`)
          const inFlight = reader === undefined ? null : reader().inFlight
          if (inFlight === null) out.push('the page has no ready reader, so its requests cannot be counted')
          else if (inFlight > 0) out.push(`${inFlight} requests are still out`)
          const mark = document.documentElement.getAttribute('data-mole-office-ready')
          if (mark !== window.location.hash) out.push(`the ready mark reads ${mark} at ${window.location.hash}`)
          return out
        }
        const started = performance.now()
        let last = read()
        let lastChange = started
        let stillFrames = 0
        let frames = 0
        let changing: string[] = []
        let done = false
        const finish = (said: string | null): void => {
          if (done) return
          done = true
          resolve(said)
        }
        const giveUp = (): void =>
          finish(
            frames === 0
              ? `the drawing was not read once in ${atMostMs} ms: no animation frame ran`
              : `the drawing did not hold still for ${quietMs} ms and ${quietFrames} frames in ${atMostMs} ms ` +
                  `(${frames} frames read); on the last frame that moved: ${changing.join('; ')}`,
          )
        // A TIMER AS WELL AS THE FRAMES, so a page that runs no frames at all still gets an answer.
        const limit = window.setTimeout(giveUp, atMostMs)
        const tick = (now: number): void => {
          if (done) return
          frames += 1
          const next = read()
          const moved = [...Object.keys(next).filter((what) => next[what] !== last[what]), ...notYet()]
          last = next
          if (moved.length > 0) {
            changing = moved
            lastChange = now
            stillFrames = 0
          } else {
            stillFrames += 1
          }
          if (stillFrames >= quietFrames && now - lastChange >= quietMs) {
            window.clearTimeout(limit)
            finish(null)
            return
          }
          if (now - started >= atMostMs) {
            window.clearTimeout(limit)
            giveUp()
            return
          }
          window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }),
    { quietMs: QUIET_MS, quietFrames: QUIET_FRAMES, atMostMs: AT_MOST_MS },
  )
  if (failed !== null) throw new Error(failed)
}
