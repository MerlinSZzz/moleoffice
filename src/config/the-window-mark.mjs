// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW A PAGE KNOWS IT IS DRAWN INSIDE THE STANDALONE WINDOW, written once for both sides.
 *
 * The office's pages are the pages a browser draws, and inside the window most of them need not know
 * the difference. The pairing page does: it says "this browser", and inside the window that is not
 * true (the review of round 8 of wave 13t). The window adds this mark to its user agent with
 * `markEveryPageOf`, and the page reads it there with `isTheWindow`.
 *
 * THE MARK IS ON THE WHOLE APP, NOT ON ONE PAGE. Until round 9b of wave 13t it was set on the one
 * window's contents, so any other way into the office from Electron (the window proof in
 * tests/the-window-opens-the-office.test.ts was one) still drew "this browser". `userAgentFallback`
 * is what every page the app opens starts with, so every way reads the one mark.
 *
 * It is the user agent and not the preload because the preload gives the office's pages nothing, and
 * a word on the screen is not a reason to open a bridge into them. A browser could send the mark
 * too, and it would then be told it is a window: the mark changes words and grants nothing.
 *
 * It is JavaScript because the window's main process cannot read TypeScript.
 */

/** The word the window adds to its user agent, with the version of this mark. */
export const THE_WINDOW_MARK = 'MoleOfficeWindow/1'

/** The start of the word that says which system the window stands on. */
export const THE_SYSTEM_MARK = 'MoleOfficeSystem/'

/**
 * Whether a user agent is the standalone window's.
 *
 * @param {string} userAgent
 * @returns {boolean}
 */
export function isTheWindow(userAgent) {
  return userAgent.split(' ').includes(THE_WINDOW_MARK)
}

/**
 * WHICH SYSTEM THE WINDOW STANDS ON, from the same user agent: 'darwin', 'win32', 'linux', or null
 * when the mark is absent or names a system this build does not know. It is a word the window says,
 * not a gate, and it changes words and grants nothing.
 *
 * @param {string} userAgent
 * @returns {'darwin' | 'win32' | 'linux' | null}
 */
export function theSystemOn(userAgent) {
  const mark = userAgent.split(' ').find((word) => word.startsWith(THE_SYSTEM_MARK))
  const system = mark?.slice(THE_SYSTEM_MARK.length)
  return system === 'darwin' || system === 'win32' || system === 'linux' ? system : null
}

/**
 * Give every page this Electron app opens the window's marks: that it is the window, and which
 * system the window stands on. Call it before the first window opens. Calling it twice adds each
 * mark once, and a second call names only the system it is given.
 *
 * The caller names the system, so that this file reads nothing from the operating system and is not
 * one more file a port must check. With no system given, none is named, and the page reads the
 * window as one that names none.
 *
 * @param {{ userAgentFallback: string }} app Electron's `app`
 * @param {NodeJS.Platform} [platform] the system to name
 */
export function markEveryPageOf(app, platform) {
  const words = app.userAgentFallback.split(' ').filter((word) => !word.startsWith(THE_SYSTEM_MARK))
  if (!words.includes(THE_WINDOW_MARK)) words.push(THE_WINDOW_MARK)
  if (platform !== undefined) words.push(`${THE_SYSTEM_MARK}${platform}`)
  app.userAgentFallback = words.join(' ')
}

/**
 * THE SHUTDOWN BETWEEN THE WINDOW AND ITS PAGE (criteria W5 and W6, piece H8), named once for both sides.
 *
 * The tray's Shut down and the page's Shutdown press ask the one question, the page's
 * (src/web/components/ShutDown.tsx). The tray opens it by sending this event into the office page the
 * window shows (src/desktop/main.mjs). Any page could send it to itself; it only opens the question.
 */
export const THE_TRAY_ASKS_TO_SHUT_DOWN = 'mole-office:the-tray-asks-to-shut-down'

/**
 * WHAT THE PAGE TELLS THE WINDOW, as a line on its console, because the office's pages are given no
 * bridge (src/desktop/preload.cjs). A line grants nothing: when the page says the office is shutting
 * down, the window asks the office itself and closes only once it no longer answers, and when the page
 * says to close only the window, the window closes and the service keeps running, as a quit always does.
 * When the page says its office has the note page, the window only offers what opens that page.
 */
export const THE_PAGE_SAYS = {
  /** The office accepted the shutdown press. */
  shuttingDown: 'mole-office:the-office-is-shutting-down',
  /** The person's Shutdown press, with the setting "keep the service, close only the window" on. */
  closeOnlyTheWindow: 'mole-office:close-only-the-window',
  /** A new quick note asked for on the page opens in a note window (round W45). */
  openAQuickNote: 'mole-office:open-a-quick-note',
  /**
   * This office's pages include the quick-note page, which the page knows from its own list of addresses. It is
   * said once as the page starts, and only in the window. Until an office page has said it, the window offers no
   * New quick note and does not take the key (src/desktop/the-quick-note.mjs).
   */
  itHasTheQuickNotePage: 'mole-office:it-has-the-quick-note-page',
}
