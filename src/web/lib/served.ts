// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW OLD THE CODE THIS PAGE IS RUNNING IS, AND WHO CAN READ IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G6 of design/ground/ACCEPTANCE.md: the server and the browser app each report the
 * newest source they have loaded. Section 2 of the same document says what it cost not to have it:
 * two whole gate runs were invalidated by a browser serving a seven-hour-old transform of
 * `src/shared`, and nothing said the code was old. On 2 September the owner's own page failed to
 * start twice on the same cause.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * `servedAt` is the newest modification time among THE FILES THIS PAGE IS BUILT FROM, at the moment
 * Vite served this page's modules, or the moment of the build for a built page. Those files are
 * walked from `src/web/index.html` by src/config/import-graph.mjs, following the imports. It is not
 * the time the page was opened and it is not the time of the last request; those two are always now
 * and say nothing.
 *
 * THE PAGE DRAWS NONE OF THIS IN NORMAL USE. That is answer F2: nothing on screen normally, and a red
 * banner nobody can miss
 * when something is wrong, because a page that always shows its state teaches people to ignore it.
 * Drawing the banner is criterion G4 and is not this file's business. This file makes the fact
 * READABLE: by a test, by a tool driving a browser, and by the banner when somebody builds it.
 */

// Vite serves this module and stamps it as it does. `vite.config.ts` holds the plugin and the
// reason; the walk it uses is the same one the API server reports from.
import { contentDigest, fromABuild, newestSourceFile, servedAt } from 'virtual:mole-office-served'

/** What this page knows about the age of the code it is running. */
export interface ServedCode {
  /** The newest of the files this page is built from when its modules were served, local wall-clock. */
  servedAt: string
  /** Which file that was, relative to the checkout. Null for a built page. */
  newestSourceFile: string | null
  /** True when this came out of `vite build` rather than a dev server. */
  fromABuild: boolean
  /**
   * What the files this page is built from held when it was built, as the digest
   * src/config/content-digest.mjs makes. Null for a page from a dev server.
   */
  contentDigest: string | null
}

export const servedCode: ServedCode = { servedAt, newestSourceFile, fromABuild, contentDigest }

/**
 * THE NAME A READER OUTSIDE THE APP LOOKS FOR.
 *
 * A test or a tool driving a browser reads `window.moleOfficeServedCode`. It is on `window` rather
 * than in the DOM because it is not for a person to look at — F2 above — and a hidden element
 * carrying it would be a thing on the page that says something, which F2 says must not
 * exist.
 */
declare global {
  interface Window {
    moleOfficeServedCode?: ServedCode
  }
}

if (typeof window !== 'undefined') window.moleOfficeServedCode = servedCode

/**
 * AND IT MOVES WHEN THE PAGE'S CODE MOVES, WITHOUT A RELOAD.
 *
 * `vite.config.ts` throws the stamp away on every change to a file the page is built from, and
 * sends the hot update. This is what takes it: the new values replace what is on `window`, so an
 * open page's idea of its own age is as new as the code it is running.
 *
 * WITHOUT THIS the stamp on an open page would be whatever it was when the page opened, and hot
 * module replacement would give the page new code while leaving it claiming the old time — which is
 * the fault problem `2hadqssN_rc4` is about, arriving from the other side.
 *
 * `import.meta.hot` is undefined in a build and under Node, so nothing here runs outside a dev
 * server.
 */
declare global {
  interface ImportMeta {
    /**
     * The two lines of Vite's hot API this file uses, declared here rather than by pulling in
     * `vite/client`. That package's types also declare every asset import in the project, and this
     * file needs one method.
     */
    readonly hot?: {
      accept(dependency: string, whenItChanges: (fresh: unknown) => void): void
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.accept('virtual:mole-office-served', (fresh) => {
    if (fresh === undefined || fresh === null) return
    const moved = fresh as ServedCode
    if (typeof window !== 'undefined') {
      window.moleOfficeServedCode = {
        servedAt: moved.servedAt,
        newestSourceFile: moved.newestSourceFile,
        fromABuild: moved.fromABuild,
        contentDigest: moved.contentDigest,
      }
    }
  })
}
