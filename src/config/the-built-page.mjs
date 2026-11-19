// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE BUILT BROWSER APP A SERVER IN PRODUCTION SERVES, AND THE SENTENCE FOR WHEN IT IS NOT THERE.
 *
 * Two programs ask whether there is a page to serve before they start anything: `start()` in
 * src/server/index.ts, and the `mole-office start` command in src/config/the-service-command.mjs, which must
 * refuse before it starts a server that would refuse. The command is plain JavaScript run by `node`
 * and cannot import the server's TypeScript, so the folder and the sentence are written here once and
 * src/server/index.ts imports them. Two copies of the sentence could drift apart with nothing failing.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { THE_BUILT_PAGE_FOLDER } from './settings.mjs'

/**
 * The folder `npm run build` writes the browser app into, in this checkout, absolute.
 *
 * It is this checkout's own `dist/web`, so a test or a copy of the tree serves its own build.
 */
export const THE_BUILT_PAGE = THE_BUILT_PAGE_FOLDER

/**
 * THE LIST OF EVERY FILE THE BUILT PAGE WAS MADE FROM, written by `vite build` (the plugin
 * listThePagesModules in vite.config.ts). scripts/bundle.mjs reads it to name the packages the page
 * carries in the third-party notices, as it reads esbuild's own list for the server, the worker, the
 * command and the window. It sits beside the built page and not in it, so it is never served.
 */
export const THE_PAGES_MODULES = join(dirname(THE_BUILT_PAGE), 'web-modules.json')

/**
 * Why there is nothing to serve, or `null` when there is.
 *
 * One sentence with three callers: `start()` asks before it opens anything, `buildApp` asks before
 * it mounts the static files, and `mole-office start` asks before it starts a server. A fresh clone
 * meets this on its very first `npm start`, so the answer has to be the same wording whichever of
 * them got there first. `dist/` is gitignored, so "no built app" is the NORMAL state of a clone, not
 * a broken one.
 *
 * @param {string} webDir
 * @returns {string | null}
 */
export function missingWebBuild(webDir) {
  if (existsSync(`${webDir}/index.html`)) return null
  return (
    `NODE_ENV=production but there is no built browser app at ${webDir}. Run "npm run build" first. ` +
    `(dist/ is not in git, so a fresh clone never has one; the build takes a couple of seconds.)`
  )
}
