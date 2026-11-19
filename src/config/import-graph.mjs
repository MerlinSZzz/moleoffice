// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE FILES ONE PROGRAM IN THIS CHECKOUT IS REALLY BUILT FROM, FOUND BY FOLLOWING ITS IMPORTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `TMy3C0ydoYYR`, found by the fourth GROUND verifier on 4 September 2026.
 *
 * This checkout holds three programs — the API server, the browser app and the message worker —
 * and each of them has to be told whether it is running the code that is on the disk. Until now
 * each was judged against A LIST OF FOLDERS. `src/shared` was on all three lists, because all three
 * import from it.
 *
 * A folder is not what a program is built from. `src/shared` holds sixty files and the API server
 * imports most of them, but seven are outside what the API server loads: `colourroles.ts`,
 * `detail-readers.generated.ts`, `inline.ts`, `mode.ts`, `pictures.ts`, `planwrite.ts` and
 * `reviewmarks.ts`. Six of the seven belong to the browser app. The seventh, `colourroles.ts`, is
 * imported by no file under `src/` at all: it is the colour role register, and one test file and
 * one tool, tools/colour-role-census.mjs, are the only things that import it. Saving one of the seven made the API
 * report itself older than the checkout, and
 * `tsx watch` never restarted it — it restarts on the files a process loaded, and the API never
 * loaded any of those seven. So the reading never cleared: `GET /api/health` answered ok false for
 * as long as the stack was left alone, and the red banner blocked the browser app, about a server
 * that was running exactly the right code.
 *
 * The same fault, one level up, was problem `aI9V57-ZTyv0` a day earlier: the server was judged
 * against every file under `src/`, `src/web` included. Narrowing to folders fixed most of it. This
 * file finishes it, by judging each program against the set of files it can actually load.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WALKS
 * ---------------------------------------------------------------------------------------
 *
 * From one entry file, everything reachable by an import: static `import`/`export … from`, an HTML
 * page's `src` and `href` attributes, and a stylesheet's `@import`. A specifier that names a package
 * rather than a path is ignored. Imports pointing outside `src/` are listed but not followed. The
 * entry itself is read wherever it lives, and nothing under `node_modules` is followed.
 *
 * TWO KINDS OF IMPORT ARE NOT FOLLOWED BY THE SERVER'S WALK:
 *
 * 1. **A type-only import.** `import type { X } from './y.ts'` is erased before the program runs,
 *    so the program never loads `y.ts` and `tsx watch` never restarts on it.
 * 2. **A dynamic `import('…')` anywhere but the entry.** The entry's own are the program starting
 *    up — `src/server/index.ts` pulls almost the whole server in that way, deliberately, so that it
 *    can read its settings first. One inside a route handler is a file the program MAY load, when
 *    somebody calls that route, and has not loaded yet. An outside path is still listed.
 *
 * Counting either would put the server back in the permanent stale state this file exists to end.
 *
 * An HTML entry chooses the page's build walk. Vite bundles literal dynamic imports wherever they
 * appear, so that walk follows them in every file it reads. Type-only imports are still left out.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS JAVASCRIPT, FOR THE REASON `settings.mjs` IS
 * ---------------------------------------------------------------------------------------
 *
 * Everything in `src/config` is read by callers this repository does not choose the Node version
 * of: `tools/session-hook.mjs` is spawned by Claude Code with the bare word `node`, measured as
 * v18.19.1 on this machine, which cannot read TypeScript. `// @ts-check` and JSDoc mean it is type
 * checked as strictly as the rest.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * THE IMPORT PREFIXES THAT MEAN A PATH IN THIS CHECKOUT, DECLARED ONCE.
 *
 * `@shared/time.ts` and `../../shared/time.ts` are the same file. Both spellings are in the source,
 * so a walk that knew only the second would miss most of what the browser app imports.
 *
 * THIS IS THE ONE DECLARATION. `vite.config.ts` reads it rather than spelling the alias again, and
 * `tests/a-program-is-judged-on-the-files-it-is-built-from.test.ts` fails when `tsconfig.json` or
 * `vitest.config.ts` stops agreeing with it. Three spellings of one fact are free to drift, and the
 * only thing that makes them agree is a test that goes red when they do not.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const THE_ALIASES = Object.freeze({ '@shared': 'src/shared' })

/**
 * THE FOLDER VITE SERVES AS IT IS, BESIDE THE PAGE, DECLARED ONCE. `vite.config.ts` reads it as its `publicDir`.
 *
 * A path the page's HTML names that is not under `src/web` is looked for here, as Vite looks for it. A file found
 * here is outside `src/`, so it is no part of what the page is built from, as a package is not.
 */
export const THE_PUBLIC_FOLDER = 'public'

/** The extensions this walk reads import statements out of. */
const CODE = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'])

/**
 * The extensions tried, in order, when a specifier names no file directly.
 *
 * Nearly every import in this checkout writes the extension out, because `tsconfig.json` sets
 * `allowImportingTsExtensions`. Three do not — `'../../shared/surfaces'` — so the list is here.
 */
const TRIED = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json']

/**
 * What kind of file this is, by its name.
 * @param {string} file
 * @returns {string}
 */
function extensionOf(file) {
  const dot = file.lastIndexOf('.')
  const slash = file.lastIndexOf(sep)
  return dot > slash ? file.slice(dot) : ''
}

/**
 * Can a slash straight after this character only be the start of a regular expression?
 *
 * A slash is either a divide or the start of a pattern, and the character before it is what says
 * which: after a name, a number or a closing bracket it divides; after an operator, a comma or the
 * start of a statement it opens a pattern. `<` is deliberately not on the list — it opens a tag in
 * every `.tsx` file here, and `</div>` is not a pattern.
 * @param {string} lastCode
 * @returns {boolean}
 */
function startsAPattern(lastCode) {
  if (lastCode === '') return true
  return '(,=:[!&|?{};+-*%~^>'.includes(lastCode)
}

/**
 * THE SAME TEXT WITH EVERY COMMENT BLANKED OUT, AND EVERY STRING LEFT ALONE.
 *
 * The strings have to survive: the thing being looked for IS a string. The comments have to go: a
 * commented-out import is not an import, and following one would put a file in the set that the
 * program never loads — which is the defect this whole file is fixing, arriving from the other side.
 *
 * It is a character scanner and not a set of patterns, because `//` inside `'http://…'` is not a
 * comment and `/*` inside a pattern is not one either. Each of those is a state here.
 *
 * Each comment becomes one space, so two tokens either side of one cannot be glued into a third.
 * The text does not keep its length and nothing here needs it to: every position this file works
 * with is a position in the text this returns.
 *
 * @param {string} text
 * @returns {string} the same text with each comment replaced by a single space
 */
export function withoutComments(text) {
  /** @type {string[]} */
  const kept = []
  let copiedTo = 0
  /** @param {number} from @param {number} to */
  const drop = (from, to) => {
    kept.push(text.slice(copiedTo, from), ' ')
    copiedTo = to
  }
  /** The last character that was code, so a slash can be told from a divide. */
  let lastCode = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    // A COMMENT IS CHECKED FOR FIRST, and that is right rather than a shortcut: `//` is not a
    // legal empty pattern and `/*` is not a legal pattern either, so a slash pair is always a
    // comment wherever a pattern could also have started.
    if (c === '/' && next === '/') {
      let j = i + 2
      while (j < text.length && text[j] !== '\n') j += 1
      drop(i, j)
      i = j
      continue
    }
    if (c === '/' && next === '*') {
      let j = i + 2
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j += 1
      j = Math.min(j + 2, text.length)
      drop(i, j)
      i = j
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === c) break
        // A template literal's ${…} holds code, and that code can hold a quote of another kind.
        // The scanner steps over the hole rather than reading it, which is enough for this job: an
        // import written inside a template literal is not an import.
        if (c === '`' && text[j] === '$' && text[j + 1] === '{') {
          let depth = 1
          j += 2
          while (j < text.length && depth > 0) {
            if (text[j] === '{') depth += 1
            else if (text[j] === '}') depth -= 1
            j += 1
          }
          continue
        }
        j += 1
      }
      i = Math.min(j + 1, text.length)
      lastCode = c
      continue
    }
    if (c === '/' && startsAPattern(lastCode)) {
      let j = i + 1
      let insideAClass = false
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === '\n') break
        if (text[j] === '[') insideAClass = true
        else if (text[j] === ']') insideAClass = false
        else if (text[j] === '/' && !insideAClass) break
        j += 1
      }
      i = Math.min(j + 1, text.length)
      lastCode = '/'
      continue
    }
    if (c !== undefined && c.trim() !== '') lastCode = c
    i += 1
  }
  kept.push(text.slice(copiedTo))
  return kept.join('')
}

/**
 * What an import clause may hold between the keyword and the word `from`.
 *
 * Names, braces, commas, a star and the words `as` and `type`, and nothing else. It is here so that
 * a sentence inside a string — "copied from './somewhere'" — cannot be read as an import: prose has
 * punctuation an import clause never has.
 */
const AN_IMPORT_CLAUSE = /^[\sA-Za-z0-9_$,{}*.]*$/

/**
 * EVERY IMPORT SPECIFIER IN ONE FILE, IN THE ORDER THEY APPEAR.
 *
 * Type-only imports are left out; see the header. Everything else that names a path is here,
 * whether the program reaches it at start or at the moment it needs it: `src/server/index.ts` pulls
 * almost the whole server in with `await import()` after it has read its settings, so a walk that
 * knew only static imports would say the API server is built from four files.
 *
 * @param {string} text the file's text
 * @param {string} extension the file's extension, which says how to read it
 * @returns {string[]}
 */
export function importsIn(text, extension) {
  if (extension === '.html') return htmlImports(text)
  if (extension === '.css') return cssImports(text)
  if (!CODE.has(extension)) return []
  const code = withoutComments(text)
  /** @type {string[]} */
  const found = []
  /**
   * WHERE EVERY `import` AND `export` KEYWORD IS, worked out once for the file.
   *
   * The clause is read BACKWARDS from each `from`, and the other way round does not work: anchoring
   * on `import` and looking forward for `from` swallows the next real import whenever the first
   * keyword turns out not to start one, because the match has already consumed it.
   *
   * Reading backwards needs the nearest keyword before each `from`, and a fixed window of
   * characters is not it: an import list of thirty names is longer than any window worth choosing,
   * and three real imports were missed by a four-hundred-character one. The positions are collected
   * once and each `from` takes the last of them before itself.
   */
  const keywords = [...code.matchAll(/\b(import|export)\b/g)].map((one) => ({
    at: one.index,
    length: (one[1] ?? '').length,
  }))
  let next = 0
  let lastKeyword = null
  for (const match of code.matchAll(/\bfrom\s*['"]([^'"\n]+)['"]/g)) {
    while (next < keywords.length && (keywords[next]?.at ?? Infinity) < match.index) {
      lastKeyword = keywords[next] ?? null
      next += 1
    }
    if (lastKeyword === null) continue
    const between = code.slice(lastKeyword.at + lastKeyword.length, match.index)
    if (!AN_IMPORT_CLAUSE.test(between)) continue
    if (/^\s*type\b/.test(between)) continue
    if (everyNameIsAType(between)) continue
    found.push(match[1] ?? '')
  }
  // `import '…'` on its own, which runs a file for its effect and takes no name from it.
  for (const match of code.matchAll(/\bimport\s*['"]([^'"\n]+)['"]/g)) found.push(match[1] ?? '')
  return found
}

/**
 * EVERY `import('…')` WITH A LITERAL PATH IN ONE FILE — the files it MAY load, later.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE COUNTED APART, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A static import is a file the program loads as soon as the importing file loads. A dynamic one is
 * a file it loads when it gets there, which for a route handler is when somebody calls that route —
 * possibly never.
 *
 * That difference is the whole reason to count them apart, and it was measured on 4 September 2026
 * against `tsx watch`'s own list of watched files, read out of `/proc/<pid>/fdinfo`. Four files were
 * in the walk and not in that list: `src/server/lib/apply.ts`, `src/server/lib/planreview.ts`,
 * `src/shared/deadlines.ts` and `src/shared/delta.ts`. Every one of them is reached only by an
 * `await import()` inside a route handler that had not been called. So the server had not loaded
 * them, `tsx watch` was not watching them, and counting them would have made a save to any of the
 * four report the server stale for ever — which is problem `TMy3C0ydoYYR` again, with four files
 * instead of seven.
 *
 * `typeof import('…')` and `import('…').SomeType` used as types load no file. A following dot
 * can also be a runtime call, as in `import('…').then(...)`. For a typed file with that shape,
 * scan the JavaScript esbuild emits after erasing its types.
 * The compiler runs as one command and exits before this read returns. The supervisor tests
 * expect its server to be the only child left running.
 *
 * @param {string} text
 * @param {string} extension
 * @returns {string[]}
 */
export function dynamicImportsIn(text, extension) {
  if (!CODE.has(extension)) return []
  const code = withoutComments(text)
  const candidates = [...code.matchAll(/(\btypeof\s+)?\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)]
  if (
    ['.ts', '.tsx', '.mts'].includes(extension) &&
    candidates.some((one) => /^\s*\./.test(code.slice(one.index + one[0].length)))
  ) {
    const compiled = execFileSync(require.resolve('esbuild/bin/esbuild'), [`--loader=${extension === '.tsx' ? 'tsx' : 'ts'}`, '--target=esnext'], { input: text, encoding: 'utf8' })
    return dynamicImportsIn(compiled, '.js')
  }
  /** @type {string[]} */
  const found = []
  for (const match of candidates) {
    if (match[1] !== undefined) continue
    found.push(match[2] ?? '')
  }
  return found
}

/**
 * Is every name this clause brings in a type?
 *
 * `import { type SurfaceId } from './surfaces'` is erased before the program runs;
 * `import { surfaceLabel, type SurfaceId } from './surfaces'` is not, because one of the two names
 * is a value. A default or a namespace import is a value, so anything outside the braces answers no.
 * @param {string} between
 * @returns {boolean}
 */
function everyNameIsAType(between) {
  const braces = /\{([^}]*)\}/.exec(between)
  if (braces === null) return false
  if (between.slice(0, between.indexOf('{')).trim() !== '') return false
  const names = (braces[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  if (names.length === 0) return false
  return names.every((name) => /^type\s/.test(name))
}

/**
 * What an HTML page pulls in: the `src` of its scripts and the `href` of its stylesheets.
 * @param {string} text
 * @returns {string[]}
 */
function htmlImports(text) {
  const withoutHtmlComments = text.replace(/<!--[\s\S]*?-->/g, ' ')
  /** @type {string[]} */
  const found = []
  for (const match of withoutHtmlComments.matchAll(/\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1] ?? '')
  }
  return found
}

/**
 * What a stylesheet pulls in: `@import './tokens.css'`, with or without `url(…)` around it.
 * @param {string} text
 * @returns {string[]}
 */
function cssImports(text) {
  const withoutCssComments = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
  /** @type {string[]} */
  const found = []
  for (const match of withoutCssComments.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1] ?? '')
  }
  return found
}

/**
 * WHERE ONE SPECIFIER POINTS, OR NULL FOR A PACKAGE OR A PUBLIC PAGE REFERENCE.
 *
 * Null is the answer for every package name — `react`, `node:fs`, `virtual:mole-office-served` —
 * and it is the reason nothing under `node_modules` is ever opened.
 *
 * `{ outside: path }` names a path outside `src/`, relative to the checkout.
 * `{ unresolved: true }` is the answer for a path under `src/` that names no file. That is reported
 * rather than dropped: a specifier the walk cannot follow is a hole in the set, and a hole nobody
 * is told about is exactly the state this criterion exists to prevent.
 *
 * @param {string} specifier
 * @param {string} from the absolute path of the file the specifier is written in
 * @param {string} root the checkout
 * @returns {{ resolved: string } | { outside: string } | { unresolved: true } | null}
 */
export function whereItPoints(specifier, from, root) {
  // A ?query asks for a file in a certain way and a #fragment names a place inside it, as in
  // `mole.svg#back`. Neither is part of the file's name.
  const bare = specifier.split(/[?#]/)[0] ?? specifier
  if (bare === '') return null
  let start = null
  if (bare.startsWith('.')) {
    start = resolve(dirname(from), bare)
  } else {
    for (const [alias, folder] of Object.entries(THE_ALIASES)) {
      if (bare === alias) start = join(root, folder)
      else if (bare.startsWith(`${alias}/`)) start = join(root, folder, bare.slice(alias.length + 1))
    }
  }
  if (start === null) return null
  const inside = join(resolve(root), 'src') + sep
  const file = firstFileAt(start)
  if (file === null && from.endsWith('.html') && firstFileAt(join(root, THE_PUBLIC_FOLDER, relative(dirname(from), start))) !== null) return null
  if (file === null) return start.startsWith(inside) ? { unresolved: true } : { outside: relative(root, start) }
  return file.startsWith(inside) ? { resolved: file } : { outside: relative(root, file) }
}

/**
 * The file a path names, trying the extensions and then an index file, or null for none.
 * @param {string} path
 * @returns {string | null}
 */
function firstFileAt(path) {
  /** @param {string} candidate @returns {boolean} */
  const isFile = (candidate) => {
    try {
      return statSync(candidate).isFile()
    } catch {
      return false
    }
  }
  if (isFile(path)) return path
  for (const extension of TRIED) if (isFile(path + extension)) return path + extension
  for (const extension of TRIED) if (isFile(join(path, `index${extension}`))) return join(path, `index${extension}`)
  return null
}

/**
 * EVERY FILE ONE PROGRAM IS BUILT FROM, WALKED FROM ITS ENTRY.
 *
 * The entry is in the set whether or not anything imports it. Everything else is there because
 * something already in the set imports it — so a NEW file that nothing imports yet belongs to no
 * program, which is right: no running process can have loaded it.
 *
 * @param {string} entry the entry file, relative to the checkout
 * @param {string} root the checkout
 * @returns {{ files: string[], unresolved: { from: string, specifier: string }[], couldNotRead: { file: string, why: string }[], leaves: { from: string, specifier: string, outside: string, kind: "static" | "dynamic" }[] }}
 *   `files` and `leaves` are relative to the checkout and sorted, so repeated walks agree.
 */
export function walkFrom(entry, root) {
  const first = resolve(root, entry)
  const followsEveryDynamicImport = extensionOf(first) === '.html'
  /** @type {Set<string>} */
  const seen = new Set([first])
  /** @type {{ from: string, specifier: string }[]} */
  const unresolved = []
  /** @type {{ file: string, why: string }[]} */
  const couldNotRead = []
  /** @type {{ from: string, specifier: string, outside: string, kind: "static" | "dynamic" }[]} */
  const leaves = []
  /** @type {string[]} */
  const queue = [first]
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined) break
    const extension = extensionOf(file)
    if (!CODE.has(extension) && extension !== '.html' && extension !== '.css') continue
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      couldNotRead.push({ file: relative(root, file), why: err instanceof Error ? err.message : String(err) })
      continue
    }
    /**
     * THE SERVER FOLLOWS DYNAMIC IMPORTS ONLY IN ITS ENTRY; THE PAGE FOLLOWS THEM IN EVERY FILE.
     *
     * `src/server/index.ts` pulls almost the whole server in with `await import()`, on purpose and
     * with its own account of why: it has to read its settings before the modules that use them are
     * loaded. Those run every time the program starts, so they are part of what it is built from.
     *
     * A dynamic import anywhere else is a file that program MAY load, when a route is called. Until
     * then it has not loaded it, `tsx watch` is not watching it, and counting it would report the
     * server stale about code it has not got — with nothing able to clear it. And once the route IS
     * called the file is loaded, the watcher restarts on it, and the server is fresh again. So
     * leaving it out is the true answer both before and after.
     *
     * The page is different: Vite bundles the files reached by literal dynamic imports, including
     * lazy components. Those files belong to the build even before the browser loads them.
     */
    const specifiers = [
      ...importsIn(text, extension).map((specifier) => ({ specifier, kind: /** @type {const} */ ('static'), follow: true })),
      ...dynamicImportsIn(text, extension).map((specifier) => ({ specifier, kind: /** @type {const} */ ('dynamic'), follow: followsEveryDynamicImport || file === first })),
    ]
    for (const { specifier, kind, follow } of specifiers) {
      const points = whereItPoints(specifier, file, root)
      if (points === null) continue
      if ('outside' in points) {
        leaves.push({ from: relative(root, file), specifier, outside: points.outside, kind })
        continue
      }
      if (!follow) continue
      if ('unresolved' in points) {
        unresolved.push({ from: relative(root, file), specifier })
        continue
      }
      if (seen.has(points.resolved)) continue
      seen.add(points.resolved)
      queue.push(points.resolved)
    }
  }
  leaves.sort((a, b) => {
    for (const key of /** @type {const} */ (['from', 'specifier', 'outside', 'kind'])) {
      if (a[key] < b[key]) return -1
      if (a[key] > b[key]) return 1
    }
    return 0
  })
  return { files: Array.from(seen, (file) => relative(root, file)).sort(), unresolved, couldNotRead, leaves }
}

/**
 * THE WALK, HELD FOR AS LONG AS IT IS STILL TRUE, AND DONE AGAIN THE MOMENT IT IS NOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HELD AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The walk opens and reads every file the program is built from — about 250 of them for the API
 * server. It runs on the way to the freshness header of EVERY reply, so doing it each time would
 * put the cost of reading a quarter of the source tree on every request this server answers.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES IT WRONG, AND WHAT NOTICES
 * ---------------------------------------------------------------------------------------
 *
 * A held set stops being true when a file in it gains or loses an import. That file's modification
 * time moves when it is saved, and the modification times are read on every call anyway — that
 * reading IS the freshness answer. So the walk is done again whenever any file in the set is newer
 * than it was when the set was worked out. Nothing else has to notice; there is no clock and no
 * timer.
 *
 * A file that has been DELETED cannot be read a time from, which is the same signal, so that is
 * also a reason to walk again.
 *
 * @type {Map<string, { files: string[], unresolved: { from: string, specifier: string }[], couldNotRead: { file: string, why: string }[], leaves: { from: string, specifier: string, outside: string, kind: "static" | "dynamic" }[], newest: { at: Date, file: string } | null, walkedAgainst: number }>}
 */
const HELD = new Map()

/** Throw the held walks away. For a test that has just written a file, and for nothing else. */
export function forgetTheWalks() {
  HELD.clear()
}

/**
 * The newest modification time among a list of files, with the name of the file that carries it.
 *
 * @param {readonly string[]} files
 * @param {string} root
 * @returns {{ newest: { at: Date, file: string } | null, missing: string[] }}
 */
function newestOf(files, root) {
  /** @type {{ at: Date, file: string } | null} */
  let newest = null
  /** @type {string[]} */
  const missing = []
  for (const file of files) {
    let at
    try {
      at = statSync(resolve(root, file)).mtime
    } catch {
      missing.push(file)
      continue
    }
    if (newest === null || at > newest.at) newest = { at, file }
  }
  return { newest, missing }
}

/**
 * One reading, from a held or a fresh walk.
 * @param {{ files: string[], unresolved: { from: string, specifier: string }[], newest: { at: Date, file: string } | null }} held
 * @returns {{ at: Date, file: string, files: number, unresolved: { from: string, specifier: string }[] } | null}
 */
function readingFrom(held) {
  if (held.newest === null) return null
  return { at: held.newest.at, file: held.newest.file, files: held.files.length, unresolved: held.unresolved }
}

/**
 * THE NEWEST FILE THE PROGRAM AT `entry` IS BUILT FROM, AND HOW MANY FILES THAT IS.
 *
 * The count travels with the time because the two answer different halves of one question. A time
 * on its own cannot say whether the walk found a program or found one file, and `1 file` is what a
 * broken entry looks like. The runtime record reports the number for that reason.
 *
 * @param {string} entry the entry file, relative to the checkout
 * @param {string} root the checkout
 * @returns {{ at: Date, file: string, files: number, unresolved: { from: string, specifier: string }[] } | null}
 *   Null only when not one file of the set could be read a time from.
 */
export function newestOfWhatIsBuiltFrom(entry, root) {
  const key = `${resolve(root)}::${entry}`
  const held = HELD.get(key)
  if (held !== undefined) {
    const { newest, missing } = newestOf(held.files, root)
    const moved = newest !== null && newest.at.getTime() > held.walkedAgainst
    if (!moved && missing.length === 0) {
      return newest === null
        ? null
        : { at: newest.at, file: newest.file, files: held.files.length, unresolved: held.unresolved }
    }
  }
  const walked = walkFrom(entry, root)
  const { newest } = newestOf(walked.files, root)
  const fresh = { ...walked, newest, walkedAgainst: newest === null ? 0 : newest.at.getTime() }
  HELD.set(key, fresh)
  return readingFrom(fresh)
}

/**
 * The whole set for one program, held or walked.
 *
 * For a test and for anything that asks WHICH files rather than how new they are; the freshness
 * reading itself wants the newest time and the count, which is the function above.
 *
 * @param {string} entry
 * @param {string} root
 * @returns {{ files: string[], unresolved: { from: string, specifier: string }[], couldNotRead: { file: string, why: string }[] }}
 */
export function theFilesBuiltFrom(entry, root) {
  newestOfWhatIsBuiltFrom(entry, root)
  const held = HELD.get(`${resolve(root)}::${entry}`) ?? walkFrom(entry, root)
  return { files: held.files, unresolved: held.unresolved, couldNotRead: held.couldNotRead }
}
