// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NEWEST SOURCE FILE EACH PROGRAM IN THIS CHECKOUT IS BUILT FROM, WORKED OUT IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G6 of design/ground/ACCEPTANCE.md asks the server and the browser app to each report
 * the newest source they have loaded, and asks a check to compare either of them with the checkout.
 * Three places need the same number: `src/server/lib/runtime.ts`, which reports it for the API;
 * `vite.config.ts`, which stamps it into the module the browser app reads; and the check itself.
 *
 * Three readings would be three answers — one counting a file the others skip — and nothing would
 * fail when they disagreed. That is the defect CLAUDE.md names at the top of the file.
 *
 * It is JavaScript for the same reason `settings.mjs` is: everything in `src/config` is read by
 * callers this repository does not control the Node version of.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MEASURES, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * The modification time of every file a program is built from, and the newest of them, with the
 * file's name. Not `git status` and not a content hash: the question is whether a running process
 * took in the bytes that are on the disk now, and a process reads a file when the file's mtime says
 * it changed. A file edited and edited back has a new mtime and reads as newer, which is the safe
 * direction to be wrong in — it reports a restart that was not needed rather than missing one that
 * was.
 *
 * ---------------------------------------------------------------------------------------
 * A PROGRAM IS THE FILES IT IMPORTS, NOT THE FOLDERS THEY SIT IN
 * ---------------------------------------------------------------------------------------
 *
 * This used to be lists of folders, and a folder is one level too coarse. Both directions of that
 * were measured as defects. `2hadqssN_rc4`: the page judged against all of `src/` went red after a
 * server-only merge. `aI9V57-ZTyv0`: the server judged against all of `src/` went red, for ever,
 * after one page-file edit. Narrowing to folders fixed both — and left `TMy3C0ydoYYR`, which is the
 * same fault inside `src/shared`: seven files there are outside what the API server loads — six the
 * browser app imports and one that no file under `src/` imports at all — so saving one of them made
 * the API report itself stale about code the API never had and could never pick up.
 *
 * So each program is now judged against THE SET OF FILES IT IMPORTS, walked from its entry by
 * `src/config/import-graph.mjs`. The server's set follows dynamic imports only in its entry, to
 * match what it loads at startup. The page's HTML entry chooses a build walk that follows literal
 * dynamic imports in every reached file, because Vite bundles lazy components too.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REPO_ROOT, THE_SERVER_ENTRY, THE_WORKER_ENTRY } from './settings.mjs'
import { newestOfWhatIsBuiltFrom } from './import-graph.mjs'

/**
 * WHERE EACH PROGRAM STARTS. Everything it is built from is reached from here by an import.
 *
 * The browser app's entry is its HTML page and not `main.tsx`, because the page is what Vite is
 * given and what names the rest: `index.html` links `styles.css` and loads `main.tsx`, and
 * `styles.css` pulls in `tokens.css`. Starting at `main.tsx` would leave both stylesheets and the
 * page itself out of the set, and an edit to a stylesheet would then move nothing.
 */
// The server's and the worker's entries are declared in src/config/settings.mjs, which starts them.
export { THE_SERVER_ENTRY, THE_WORKER_ENTRY }
export const THE_PAGES_ENTRY = 'src/web/index.html'

/**
 * THE FOLDERS THE BROWSER APP'S CODE COMES OUT OF.
 *
 * These lists no longer decide any program's freshness — the import graph does. They are kept for
 * three jobs. The first is the coverage rule in
 * `tests/the-server-is-judged-on-the-code-it-is-built-from.test.ts`: every folder under `src/` has
 * to be named by at least one of them, so a NEW folder nobody wired up fails a test instead of
 * being code that no reading covers. The second is `vite.config.ts`, which adds the folders outside
 * its own root to the dev server's watcher. The third is
 * `tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts`, which checks that imports
 * crossing these folder boundaries remain in each program's import closure.
 *
 * `src/web` is the app; `src/shared` and `src/config` are the two folders outside Vite's root that
 * it imports from.
 */
export const THE_PAGES_FOLDERS = ['src/web', 'src/shared', 'src/config']

/**
 * THE FOLDERS THE API SERVER'S CODE COMES OUT OF.
 *
 * `src/server` is the server; `src/shared` and `src/config` are folders it imports from. `src/web`
 * is not named here, and the import graph shows why a list of folders was never the whole answer:
 * the server really does load a file out of `src/web` — `lib/attention.ts`, imported by seven server
 * files, `lib/records.ts` and `lib/waiting.ts` among them. The set the server is judged against holds it, because
 * `tsx watch` restarts on it.
 */
export const THE_SERVER_FOLDERS = ['src/server', 'src/shared', 'src/config']

/**
 * THE FOLDERS THE MESSAGE WORKER'S CODE COMES OUT OF. The worker is its own process
 * (`src/worker`), started by the API server on boot, and it imports the shared and config folders
 * like the other two programs.
 */
export const THE_WORKER_FOLDERS = ['src/worker', 'src/shared', 'src/config']

/**
 * THE FOLDERS THE STANDALONE WINDOW'S CODE COMES OUT OF. The window (`src/desktop`, run by Electron
 * through `npm run window`) is a fourth program, and its main process imports from `src/config`.
 *
 * No freshness reading covers the window yet. It has no entry above, nothing reports how new its
 * code is, and a running window keeps the code it started with until it is started again. This list
 * is here for the coverage rule only, so the folder is named and that gap is written down here.
 */
export const THE_WINDOW_FOLDERS = ['src/desktop', 'src/config']

/**
 * THE FOLDERS THE TERMINAL HOLDER'S CODE COMES OUT OF. The holder (`src/holder`, started by the service
 * command) is a fifth program, plain JavaScript run by `node`, and it imports from `src/config` only.
 *
 * No freshness reading covers the holder, on purpose: replacing it ends every terminal it holds, so a
 * running holder keeps the code it started with until somebody stops it through the ledger's door. This
 * list is here for the coverage rule only.
 */
export const THE_HOLDER_FOLDERS = ['src/holder', 'src/config']

/**
 * THE NEWEST FILE THE PROGRAM AT `entry` IS BUILT FROM, AND HOW MANY FILES THAT IS.
 *
 * Null when not one file of the set could be read a time from, which for an entry that exists
 * cannot happen and for an entry that does not is the honest answer.
 *
 * @param {string} entry one of the three entries above.
 * @param {string} [root] The checkout to read. Defaults to the one this file is in.
 * @returns {{ at: Date, file: string, files: number } | null}
 */
export function newestSourceBuiltFrom(entry, root = REPO_ROOT) {
  const reading = newestOfWhatIsBuiltFrom(entry, root)
  return reading === null ? null : { at: reading.at, file: reading.file, files: reading.files }
}

/**
 * The newest file under any of these folders, or null when they hold no files at all.
 *
 * THIS IS NOT WHAT ANY PROGRAM IS JUDGED BY any more; `newestSourceBuiltFrom` above is. It walks a
 * folder, and it is kept because a test compares the two: the files a program imports all have to
 * lie under the folders that program's code comes out of, and a folder walk is how that is checked.
 *
 * A folder that is not there is skipped rather than refused: `newestSourceIn` is asked about a list
 * that describes a program, and a program without one of them is a reading of what is there.
 *
 * @param {readonly string[]} folders Paths relative to the checkout.
 * @param {string} [root] The checkout to walk. Defaults to the one this file is in.
 * @returns {{ at: Date, file: string } | null}
 */
export function newestSourceIn(folders, root = REPO_ROOT) {
  /** @type {{ at: Date, file: string } | null} */
  let newest = null
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const at = statSync(full).mtime
      if (newest === null || at > newest.at) newest = { at, file: relative(root, full) }
    }
  }
  for (const folder of folders) {
    const dir = join(root, folder)
    if (!existsSync(dir)) continue
    walk(dir)
  }
  return newest
}
