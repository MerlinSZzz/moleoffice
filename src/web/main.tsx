// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Start the browser app.
 *
 * If the one element React mounts into is missing, that is a broken build, and it says so
 * loudly instead of rendering nothing into a blank white page.
 */

// FIRST, AND THE ORDER IS THE WHOLE POINT. This moves settings saved under the keys this product
// used before it was renamed on 28 August 2026. Several modules below read their setting at import
// time rather than in an effect, so a move made anywhere later than here misses them and the
// person's theme, drafts and open sections are gone with no message. The file says the rest.
import './lib/renamedkeys.ts'

// HOW OLD THE CODE THIS PAGE IS RUNNING IS, made readable before anything else runs. It draws
// nothing: the owner's F2 answer of 3 September 2026 is that the page shows nothing about the world
// in normal use. Criterion G6, and src/web/lib/served.ts says what the number means.
import './lib/served.ts'

// WHERE THIS PAGE'S API IS, said before any request can be made. src/web/lib/api-address.ts holds
// the rule — the host out of the address bar, the port out of the module Vite serves — and refuses
// to guess an address when nothing has said, so this import is not optional.
import './lib/api-port.ts'

import { loadTheOwner, theOfficeCouldNotBeReached } from './owner.ts'
import { anAppIsStarting, theStartFailedAndThePageSaysWhy } from './lib/ready.ts'
import { theStartSays } from './lib/the-start-says.ts'
import { thisBrowserNeedsPairing } from './lib/unpaired.ts'

declare global { interface Window { moleBoot?: { finish: () => Promise<void>; cancel: () => void }; moleBootStarted?: () => void; moleBootUnreachable?: (where: string) => void } }

// The stylesheet is linked from index.html rather than imported here. Importing CSS from
// TypeScript needs Vite's ambient type declarations, which this project's tsconfig does not
// pull in; the <link> tag is bundled and hashed by the build just the same.

/** The longest the first drawing waits for what was kept from the last load. */
const PAGE_CACHE_WAIT_MS = 600

const mount = document.getElementById('root')
if (!mount) {
  throw new Error('Mole Office cannot start: index.html has no element with id="root".')
}

/** Draw the pairing page even when the first reads refused before the app could mount. */
async function drawPairing(root:HTMLElement):Promise<void> {
  window.moleBoot?.cancel()
  const [{createElement},{createRoot},{UnpairedPage}]=await Promise.all([
    import('react'),import('react-dom/client'),import('./lib/UnpairedPage.tsx'),
  ])
  createRoot(root).render(createElement(UnpairedPage))
}

/**
 * WHO OWNS THIS OFFICE, ASKED BEFORE ANY OF THE APP'S OWN MODULES LOAD. The owner is a setting in
 * the office's own database, so the browser asks the server (src/web/owner.ts). Every module that
 * works out who this browser writes as reads the answer, and several do it while they load, so the
 * language module, React and the app are loaded only after it. A server that does not answer gets
 * its sentence drawn in place of the app, rather than an app that does not know who it is for.
 */
async function start(root: HTMLElement): Promise<void> {
  // THE PAGE IS NOT READY UNTIL THE SHELL HAS DRAWN: the owner and the page language are read before the
  // app loads, and their requests answering is not the page being drawn (src/web/lib/ready.ts).
  anAppIsStarting()
  // THE FIRST SCRIPT IS HERE: the page can say it is starting rather than loading, and the office's minute of
  // silence begins here, counted from this call rather than from the page's load.
  window.moleBootStarted?.()
  try {
    await loadTheOwner(null)
  } catch (err) {
    if(thisBrowserNeedsPairing()){await drawPairing(root);return}
    if (theOfficeCouldNotBeReached(err)) {
      window.moleBootUnreachable?.(err.where)
      theStartFailedAndThePageSaysWhy()
      throw err
    }
    window.moleBoot?.cancel()
    theStartSays(root, err instanceof Error ? err.message : String(err))
    theStartFailedAndThePageSaysWhy()
    throw err
  }
  const { readPageWords, listenForWordChoices } = await import('./lib/word-settings.ts')
  const { readSidebarArrangement, listenForSidebarChoices } = await import('./lib/sidebar-arrangement.ts')
  const { readSidebarPins, listenForPinsOfWhoeverReads } = await import('./lib/sidebar-pins.ts')
  const { loadMoleOfficeId } = await import('./lib/mole-office.ts')
  const { api } = await import('./api.ts')
  const { MOLE_OFFICE_HANDLE } = await import('@shared/participants.ts')
  const { DEFAULT_WORKSPACE } = await import('@shared/workspaces.ts')
  const { askAgainWhileWindowsIsSlow } = await import('./lib/windows-did-not-say.ts')
  // One existing row read, in parallel with the existing startup reads. No handle is used as an id.
  // The office's row belongs to the installation, not to a project, so the read names the default project. A browser
  // that remembers a project the server no longer holds still starts, and its bar says the project is not listed.
  // Asked again a few times when Windows did not say in time who sent them (src/web/lib/windows-did-not-say.ts).
  try { await askAgainWhileWindowsIsSlow(() => Promise.all([readPageWords(), readSidebarArrangement(), readSidebarPins(), loadMoleOfficeId(() => api.participant('agent', MOLE_OFFICE_HANDLE, DEFAULT_WORKSPACE))]), root) }
  catch (error) {
    if(thisBrowserNeedsPairing()){await drawPairing(root);return}
    window.moleBoot?.cancel()
    theStartSays(root, error instanceof Error ? error.message : String(error))
    theStartFailedAndThePageSaysWhy()
    throw error
  }
  listenForWordChoices()
  listenForSidebarChoices()
  listenForPinsOfWhoeverReads()
  // THE WINDOW'S NEW QUICK NOTE. Said only in the standalone window, and only when this build has the
  // note page, so the window offers the note and its key only for an office that has the page.
  const { parseRoute } = await import('@shared/addresses.ts')
  const { THE_QUICK_NOTE_SEGMENT } = await import('../config/the-quick-note-address.mjs')
  const { THE_PAGE_SAYS, isTheWindow } = await import('../config/the-window-mark.mjs')
  if (isTheWindow(navigator.userAgent) && parseRoute(`#/${THE_QUICK_NOTE_SEGMENT}`).name !== 'unknown') console.info(THE_PAGE_SAYS.itHasTheQuickNotePage)
  // THE WORDS OF THE PAGE'S LANGUAGE ARE HERE BEFORE THE FIRST DRAWING, or are known not to have come. The built page
  // carries English and Chinese and fetches any other language's words (src/web/lib/language.ts), so a page in Greek
  // is drawn in Greek from the start.
  const { theWordsAskedFor } = await import('./lib/language.ts')
  await theWordsAskedFor()
  // WHAT THE PAGES SHOWED LAST TIME, read from the browser's IndexedDB before the first drawing, so a
  // page reopened draws it at once (src/web/lib/pagecache.ts). Who is looking is known only now, after
  // the owner. A browser slow to answer is not waited for longer than this; the pages then read as
  // they always did, and what was kept is there for the next page opened.
  const { loadThePageCache } = await import('./lib/pagecache.ts')
  await Promise.race([loadThePageCache(), new Promise<void>((resolve) => setTimeout(resolve, PAGE_CACHE_WAIT_MS))])
  const [{ StrictMode, createElement }, { createRoot }, { App }, { PairingGate }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App.tsx'),
    import('./lib/UnpairedPage.tsx'),
  ])
  // App's PresetBar has restored the real theme; the early boot-only choice can now leave.
  document.documentElement.removeAttribute('data-boot-theme')
  const { readAttentionHomeOnce } = await import('./lib/oneread.ts')
  // The shell joins an unfinished read or asks again, and shows a failure from that read.
  if (parseRoute(window.location.hash).name === 'home') void readAttentionHomeOnce()
  await window.moleBoot?.finish()
  createRoot(root).render(createElement(StrictMode, null, createElement(PairingGate, null, createElement(App))))
}

void start(mount)
