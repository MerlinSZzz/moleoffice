// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Language } from '../i18n.ts'

/**
 * THE WORDS OF THE SIX LANGUAGES ADDED AFTER ENGLISH AND CHINESE. The server, the scripts and the tests have every
 * language, but each language's file is loaded the first time its words are read, not when this module loads. The six
 * files are about ten megabytes of source, and a process that reads only English never needs them.
 *
 * A FILE IS LOADED BY A REQUIRE OF IT, which runs at once, so a reader of `wordsIn` waits for nothing. Where this
 * module runs from its file, the require is Node's own. Under Node and tsx an ES module has no `require`, so it is made
 * with `createRequire`. Under vitest it is the one vitest gives each module, which is Node's too, so Node keeps the six
 * and `vi.resetModules()` does not load them again. In a bundle, such as the installed office's server
 * (scripts/bundle.mjs), the written `require('./el.ts')` is what counts: esbuild puts el.ts into the bundle and runs it
 * at its first read, because beside the bundle there is no el.ts to load.
 *
 * THE PAGE DOES NOT RUN THIS TEXT. `vite build` replaces this module with an empty list and the names of six files it
 * writes beside the scripts, one for each language (`bringTheLaterWordsWhenAsked` in vite.config.ts). The page fetches a
 * language's file when it is to be drawn in that language (`bringWordsOf` in src/shared/words/joined.ts). The page vite
 * serves while it is developed is given the six files imported as they are, so it has every language at once.
 */
type LaterLanguage = Exclude<Language, 'en' | 'zh'>

/** Node's require, for a module that has no `require` of its own. */
const fromNode = typeof require === 'undefined' ? process.getBuiltinModule('node:module').createRequire(import.meta.url) : undefined

/** The lists this program holds, each loaded at its first read. Empty on the built page. */
export const LATER_WORDS_ALREADY_HERE: Partial<Record<LaterLanguage, object>> = {
  get el() { return (fromNode === undefined ? require('./el.ts') : fromNode('./el.ts')).el },
  get es() { return (fromNode === undefined ? require('./es.ts') : fromNode('./es.ts')).es },
  get it() { return (fromNode === undefined ? require('./it.ts') : fromNode('./it.ts')).it },
  get ko() { return (fromNode === undefined ? require('./ko.ts') : fromNode('./ko.ts')).ko },
  get pt() { return (fromNode === undefined ? require('./pt.ts') : fromNode('./pt.ts')).pt },
  get th() { return (fromNode === undefined ? require('./th.ts') : fromNode('./th.ts')).th },
}

/** Where each list is, beside the script that reads it, on the built page only. Empty here. */
export const LATER_WORDS_FILES: Partial<Record<LaterLanguage, string>> = {}
