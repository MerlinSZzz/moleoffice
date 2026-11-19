// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WAIT UNTIL A MOLE OFFICE PAGE HAS FINISHED DRAWING THE ADDRESS IT IS AT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT REPLACED WHAT
 * ---------------------------------------------------------------------------------------
 *
 * Every browser test and every photographing tool used to navigate with Playwright's
 * `waitUntil: 'networkidle'`, which means "no network connection for half a second". That is a
 * guess about the page made from outside it and it is wrong twice over. It never comes true for a
 * page holding a connection open on purpose — the messages channel is one, and while it was open on
 * every page `tools/review.mjs` timed out on every photograph it took. And it says nothing about
 * whether the page drew anything: a page whose every request failed is network-idle too.
 *
 * So the page says so itself. `src/web/lib/ready.ts` puts `data-mole-office-ready` on the `<html>`
 * element when nothing the app asked for is still in flight and React has run its effects, and the
 * VALUE IS THE ADDRESS the page finished drawing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ADDRESS AND NOT THE WORD YES
 * ---------------------------------------------------------------------------------------
 *
 * Nearly every navigation in this app changes only the part of the address after the `#`, and the
 * browser does not reload the document for one. So the page that has finished drawing `#/records`
 * still carries its mark at the instant a caller asks for `#/plan`. A wait for the word "yes" would
 * pass on the old page's mark. Comparing the mark against `location.hash` closes that: the two
 * agree only when this page has finished drawing the address the browser is at now.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS PLAIN JAVASCRIPT AND THERE IS ONE COPY
 * ---------------------------------------------------------------------------------------
 *
 * The photographing tools are `.mjs` run by whatever node is on the path, so they cannot import
 * `tests/helpers.ts`, and this repository has already paid for the alternative: three tools each
 * kept a copy of one function and all three copies broke on the same day. So the wait lives here,
 * `tests/helpers.ts` re-exports it, and `the-page-says-when-it-is-ready.test.ts` fails if the
 * attribute named here and the attribute the app writes ever stop being the same string.
 */

/** The attribute on the `<html>` element. `src/web/lib/ready.ts` is what writes it. */
export const READY_ATTRIBUTE = 'data-mole-office-ready'

/** How long to wait by default. The same half-minute the navigations used to allow. */
export const READY_TIMEOUT_MS = 30_000

/**
 * Wait until this page has finished drawing the address it is at.
 *
 * Throws when it does not, naming the address asked about, the mark the page was carrying and how
 * long it waited — because a page that never finishes has to fail the run and be named, not be
 * quietly photographed half drawn. `tools/review.mjs` takes the same line about a drawing that
 * never settles.
 *
 * @param {import('playwright').Page} page
 * @param {number} [timeoutMs]
 */
export async function waitForThePage(page, timeoutMs = READY_TIMEOUT_MS) {
  try {
    await page.waitForFunction(
      (attribute) => document.documentElement.getAttribute(attribute) === window.location.hash,
      READY_ATTRIBUTE,
      { timeout: timeoutMs },
    )
  } catch (err) {
    const said = await page
      .evaluate(
        (attribute) => {
          const reader = window.__moleOfficeReady
          return {
            mark: document.documentElement.getAttribute(attribute),
            at: window.location.hash,
            ran: typeof reader === 'function',
            waiting: typeof reader === 'function' ? reader() : null,
          }
        },
        READY_ATTRIBUTE,
      )
      .catch(() => null)
    const where =
      said === null
        ? 'the page could not be asked'
        : `it is at "${said.at}" and its mark says "${String(said.mark)}"`
    throw new Error(
      `A Mole Office page did not finish drawing within ${String(timeoutMs)}ms: ${where}.${whatWasStillInFlight(said)} ` +
        `The page writes ${READY_ATTRIBUTE} when nothing it asked for is still in flight; a page that never ` +
        `writes it is either still asking for something or has failed to draw. Original: ${String(err && err.message)}`,
    )
  }
}

/**
 * WHAT THE PAGE WAS WAITING FOR, as a sentence for the failure above.
 *
 * The three answers are different faults. The app may not have run at all, so the wait was on the
 * page's own bundle. It may have run and still be asking for named things, which names the door
 * that is late. Or it may have run and be asking for nothing, in which case every request answered
 * and the wait was spent drawing.
 *
 * `said` is null when the page could not be asked at all, and that is said rather than guessed.
 *
 * @param {{ ran: boolean, waiting: { inFlight: number, askedForSinceTheAddressChanged: number, requests: { path: string, count: number }[] } | null } | null} said
 */
function whatWasStillInFlight(said) {
  if (said === null) return ' The page could not be asked what it was still waiting for.'
  if (!said.ran) {
    return (
      ' The app has not run at all: the module that writes the mark has not loaded, so this wait was on the ' +
      'page bundle (Vite) rather than on anything the app asked for.'
    )
  }
  const waiting = said.waiting
  if (waiting === null) return ' The app is running but would not say what it was waiting for.'
  const named =
    waiting.requests.length === 0
      ? 'nothing is in flight'
      : waiting.requests
          .map((one) => `${one.path}${one.count > 1 ? ` (x${String(one.count)})` : ''}`)
          .join(', ')
  const asked = `This page had asked for ${String(waiting.askedForSinceTheAddressChanged)} request${
    waiting.askedForSinceTheAddressChanged === 1 ? '' : 's'
  } since the address last changed.`
  if (waiting.inFlight === 0) {
    return ` At the moment the wait ran out, no requests were still in flight. ${asked} Every request this page asked for had answered, so the wait was spent drawing, not on the world.`
  }
  return ` At the moment the wait ran out, ${String(waiting.inFlight)} request${
    waiting.inFlight === 1 ? ' was' : 's were'
  } still in flight: ${named}. ${asked}`
}
