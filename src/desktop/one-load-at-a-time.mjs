// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE LOAD AT A TIME IN THE WINDOW (wave 13t, round 25).
 *
 * WHAT WENT WRONG. The window loads two pages: the check page, a file, and the office, over http. A load
 * that starts while another is under way stops the first, and the first one's promise is refused with
 * ERR_ABORTED (-3). On a start, the window showed "Opening it" on the check page and asked for the office;
 * but the check page's own load was only scheduled, and it started a moment after the office's. So it
 * stopped the office's load, the window stayed on "Opening it", and nothing caught the refusal. The Mac
 * agent saw exactly that: the warning named both pages, and a later start stayed on "Opening it".
 *
 * WHAT THIS DOES. Every load the window asks for waits here until the one before it has finished, so no
 * load of the window's own stops another. A load that fails anyway is said in words, through `say`, and
 * its caller is handed what failed, so it can show the check page with the reason instead of a busy line.
 *
 * Nothing here needs Electron, so a test drives it with a fake window
 * (tests/the-window-loads-one-page-at-a-time.test.ts).
 */

/**
 * @param {(said: string) => void} say where a failed load is said
 * @returns {(what: string, load: () => unknown) => Promise<string | null>} start `load` once every earlier
 *   one has finished; null when it finished, and what failed, in the words its error gave, when it did not
 */
export function oneLoadAtATime(say) {
  /** @type {Promise<unknown>} */
  let theLastLoad = Promise.resolve()
  return (what, load) => {
    const thisLoad = theLastLoad.then(load).then(
      () => null,
      (err) => {
        const failed = err instanceof Error ? err.message : String(err)
        say(`The window could not load ${what}: ${failed}`)
        return failed
      },
    )
    theLastLoad = thisLoad
    return thisLoad
  }
}
