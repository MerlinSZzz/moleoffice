// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STYLESHEET A PAGE MODULE IMPORTS LEAVES EACH TEST'S BUNDLE OF PAGE CODE AS IT WAS.
 *
 * On 14 November 2026 a module under src/web began to import a stylesheet. Six tests that bundle page
 * code for a browser had no loader for it, and the main line was red for over four hours. Eleven such
 * tests had none. tests/a-bundle-of-page-code.ts reads an imported stylesheet as empty, in one place.
 *
 * THE FIRST CASE reads every code file under tests/ and finds each one that bundles for a browser with
 * esbuild. Each must bundle through that file, or name an empty `.css` loader of its own. The list is
 * read from the files, so a test written later is held to it too.
 *
 * THE OTHER CASES take each file that bundles through it, one case a file. The modules that file names
 * as `./src/...` or `./tests/...` are the ones its page imports. They are bundled twice: as they are,
 * and with a made-up stylesheet imported at the top of every module under src/web. That stylesheet
 * names a font file, as KaTeX's does, and esbuild refuses both when it has no loader for them. The
 * two bundles must be the same bytes. A control bundles the second through esbuild's own `build`,
 * and that must fail, so the import added is one that would have broken the test.
 *
 * A FILE THAT NAMES NO PAGE MODULE has no page module for a stylesheet to reach, so it is not bundled
 * twice. It gets one case of its own instead, and that case passes only when every `bundlePageCode`
 * call in its code is a bundle of a script written in place. The call is code; its options are an
 * object written in place, and every entry of that object and of its stdin is written as a plain name
 * and a value, with no shorthand, quoted, computed or spread entry. The options name only stdin,
 * bundle, write, platform and format, and stdin names only contents, resolveDir and loader. A string
 * or template in the object holds no import, export or require, and every template placeholder is a
 * whole JSON.stringify call. Every mention of `bundlePageCode` is a call, apart from the name in the
 * import line. A script written in place that imports nothing cannot reach a module under src/web, so
 * a stylesheet a page module imports cannot change it. A call the guard cannot read that way fails,
 * so the guard still catches a file whose bundle it cannot see.
 *
 * The tests themselves are not run from here. Each opens its own page, and some their own office, and
 * the bundle is the only part of them an imported stylesheet can reach.
 */
import { build, type BuildOptions, type Plugin } from 'esbuild'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { piecesOf } from './the-pieces-of-a-source.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const THIS_FILE = relative(ROOT, fileURLToPath(import.meta.url))
const THE_SET_UP = relative(ROOT, fileURLToPath(new URL('./a-bundle-of-page-code.ts', import.meta.url)))

const BUNDLES_FOR_A_BROWSER = /platform:\s*['"]browser['"]/
/** An import of a value from esbuild. One import may run over several lines, but never into the next import: a file with no semicolons would join an import of node:http to a type-only import of esbuild. */
const IMPORTS_ESBUILD = /^\s*import\s+(?!type\b)(?:(?!^\s*import\b)[^;])*?from\s*['"]esbuild['"]|import\(\s*['"]esbuild['"]\s*\)|require\(\s*['"]esbuild['"]\s*\)/m
const IMPORTS_THE_SET_UP = /from\s*['"]\.\/a-bundle-of-page-code\.ts['"]/
const AN_EMPTY_CSS_LOADER = /['"]\.css['"]\s*:\s*['"]empty['"]/
const A_PAGE_MODULE = /['"](\.\/(?:src|tests)\/[^'"\s]+)['"]/g
const A_MODULE_UNDER_SRC_WEB = /[\\/]src[\\/]web[\\/].*\.tsx?$/

const testFiles = readdirSync(join(ROOT, 'tests'), { recursive: true, encoding: 'utf8' })
  .filter((name) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(name))
  .map((name) => join('tests', name))
  .filter((file) => file !== THIS_FILE && file !== THE_SET_UP)
  .map((file) => ({ file, source: readFileSync(join(ROOT, file), 'utf8') }))
const pageBundlers = testFiles.filter(({ source }) => BUNDLES_FOR_A_BROWSER.test(source) && (IMPORTS_ESBUILD.test(source) || IMPORTS_THE_SET_UP.test(source)))
const throughTheSetUp = pageBundlers.filter(({ source }) => IMPORTS_THE_SET_UP.test(source))
/** Each file through the set-up with the page modules it names. */
const withPageModules = throughTheSetUp
  .map(({ file, source }) => ({ file, modules: thePageModulesOf(source) }))
  .filter(({ modules }) => modules.length > 0)
/** The files through the set-up that name no page module, so no stylesheet can reach what they bundle. */
const withoutPageModules = throughTheSetUp.filter(({ source }) => thePageModulesOf(source).length === 0)

let sheet = ''
let folder = ''

beforeAll(() => {
  folder = aTestDatabaseFolder('a-page-stylesheet')
  sheet = join(folder, 'a-made-up-sheet.css')
  writeFileSync(sheet, '@font-face { font-family: A made up font; src: url(a-made-up-font.woff2) format("woff2") }\n.a-made-up-rule { color: red }\n')
  writeFileSync(join(folder, 'a-made-up-font.woff2'), 'not a font')
})

afterAll(() => { if (folder !== '') removeThisTestFolder(folder) })

/** The options for a bundle of these modules, and a count of the modules the stylesheet was added to. */
function aBundleOf(modules: readonly string[], withTheSheet: boolean): { options: BuildOptions; added: () => number } {
  let added = 0
  const addTheSheet: Plugin = {
    name: 'a-stylesheet-at-the-top-of-each-page-module',
    setup(bundler) {
      bundler.onLoad({ filter: A_MODULE_UNDER_SRC_WEB }, (args) => {
        added += 1
        return { contents: `import ${JSON.stringify(sheet)};\n` + readFileSync(args.path, 'utf8'), loader: args.path.endsWith('x') ? 'tsx' : 'ts' }
      })
    },
  }
  const options: BuildOptions = {
    stdin: { contents: modules.map((module) => `import ${JSON.stringify(module)};`).join('\n'), resolveDir: ROOT, sourcefile: 'page-modules.tsx', loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: withTheSheet ? [addTheSheet] : [],
  }
  return { options, added: () => added }
}

function thePageModulesOf(source: string): string[] {
  return [...new Set([...source.matchAll(A_PAGE_MODULE)].map((match) => match[1]!))].sort()
}

describe('a stylesheet a page module imports', () => {
  it('is read as empty by every test that bundles page code for a browser', () => {
    expect(pageBundlers.length).toBeGreaterThan(0)
    const unready = pageBundlers
      .filter(({ source }) => !AN_EMPTY_CSS_LOADER.test(source) && !(IMPORTS_THE_SET_UP.test(source) && !IMPORTS_ESBUILD.test(source)))
      .map(({ file }) => file)
    expect(unready, 'These bundle page code for a browser with no loader for a stylesheet. Bundle through tests/a-bundle-of-page-code.ts.').toEqual([])
    expect(throughTheSetUp.length).toBeGreaterThan(0)
  })

  it('stops a bundle that has no loader for it', { timeout: 60_000 }, async () => {
    const first = withPageModules[0]
    if (first === undefined) throw new Error('No test through tests/a-bundle-of-page-code.ts names a page module.')
    const modules = first.modules
    const injected = aBundleOf(modules, true)
    const errors = await build(injected.options).then(
      () => { throw new Error('The bundle with the made-up stylesheet did not fail.') },
      (error: unknown) => (error as { errors: { text: string; location: { file: string } | null }[] }).errors,
    )
    const theMadeUpSheet = /a-made-up-sheet\.css|a-made-up-font\.woff2/
    expect(errors.some((error) => theMadeUpSheet.test(error.text) || theMadeUpSheet.test(error.location?.file ?? ''))).toBe(true)
    expect(injected.added()).toBeGreaterThan(0)
  })

  it.each(withPageModules.map(({ file, modules }) => [file, modules] as const))(
    'leaves the bundle of %s the same bytes', { timeout: 60_000 }, async (_file, modules) => {
      expect(modules.length).toBeGreaterThan(0)
      const plain = await bundlePageCode(aBundleOf(modules, false).options)
      const injected = aBundleOf(modules, true)
      const withTheSheet = await bundlePageCode(injected.options)
      expect(injected.added()).toBeGreaterThan(0)
      expect(withTheSheet.outputFiles!.length).toBe(plain.outputFiles!.length)
      plain.outputFiles!.forEach((output, at) => {
        expect(whereTheyDiffer(withTheSheet.outputFiles![at]!.text, output.text), `The bundle ${output.path} changed.`).toBe('the same')
      })
    })

  it.each(withoutPageModules.map(({ file, source }) => [file, whatTheBundlesOf(file, source)] as const))(
    'reads every bundle it makes as a script written in place that imports nothing: %s', (_file, trouble) => {
      expect(trouble, trouble).toBe('')
    })
})

/** A bundle is about 20 MB, so a difference is said by where it starts rather than as a diff of the two. */
function whereTheyDiffer(a: string, b: string): string {
  if (a === b) return 'the same'
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1
  return `${a.length} and ${b.length} characters, first differing at ${at}: ${JSON.stringify(a.slice(at, at + 120))} against ${JSON.stringify(b.slice(at, at + 120))}`
}

/** The text of a file with its comments, its quoted strings and the placeholders of its templates replaced by spaces. */
function theCodeOf(text: string): string {
  const characters = text.split('')
  for (const piece of piecesOf(text)) {
    for (let at = piece.at; at < piece.end; at += 1) characters[at] = ' '
  }
  return characters.join('')
}

/** Whether the character at `at` of code is a space, which is also what a comment or a quoted string became. */
function isSpaceIn(code: string, at: number): boolean {
  return /\s/.test(code[at] ?? '')
}

/** The first character of code at or after `from` that is not a space, or -1. */
function theFirstCodeFrom(code: string, from: number): number {
  let at = from
  while (at < code.length && isSpaceIn(code, at)) at += 1
  return at < code.length ? at : -1
}

/** The bracket of the pair `opening`/`closing` that closes the one at `at`, or -1 when it does not close. */
function theBracketThatCloses(code: string, at: number, opening: string, closing: string): number {
  let depth = 0
  for (let here = at; here < code.length; here += 1) {
    if (code[here] === opening) depth += 1
    else if (code[here] === closing) {
      depth -= 1
      if (depth === 0) return here
    }
  }
  return -1
}

/** The first character written at or after `from` and before `before`, stepping over white space and comments, or -1. */
function theFirstWrittenCharacter(source: string, code: string, from: number, before: number): number {
  let at = from
  while (at < before) {
    const character = source[at] ?? ''
    if (/\s/.test(character)) { at += 1; continue }
    if (character === '"' || character === "'" || character === '`') return at
    if (!isSpaceIn(code, at)) return at
    while (at < before && isSpaceIn(code, at)) at += 1
  }
  return -1
}

/** Whether the mention at `at` is the name in an import line of tests/a-bundle-of-page-code.ts, the one mention that is not a call. */
function isTheNameInTheSetUpImport(source: string, at: number): boolean {
  const from = source.lastIndexOf('\n', at) + 1
  const after = source.indexOf('\n', at)
  const line = source.slice(from, after === -1 ? source.length : after)
  return /^\s*import\b[^;]*\bbundlePageCode\b[^;]*from\s*['"]\.\/a-bundle-of-page-code\.ts['"]\s*;?\s*$/.test(line)
}

/** A property written at the top level of an object: its name, the character after its colon, and the character after its value. */
interface AProperty {
  name: string
  from: number
  to: number
}

/** The names the guard allows at the top level of a bundle's options object and of its stdin. */
const OPTION_NAMES = ['stdin', 'bundle', 'write', 'platform', 'format']
const STDIN_NAMES = ['contents', 'resolveDir', 'loader']

/**
 * THE TOP-LEVEL ENTRIES OF AN OBJECT, or the first entry not written as a plain name and a value.
 *
 * `object` is the code of the object, which begins with `{`. A quoted name and a comment were turned into spaces by
 * theCodeOf, so a quoted name leaves no name where its entry begins, and the entry fails as one the guard cannot read.
 * A shorthand name, a computed name, a spread and any other entry the guard cannot read come back as `trouble`, in a
 * few words, and no entries.
 */
function theEntriesOf(object: string): { properties: AProperty[]; trouble: string } {
  const properties: AProperty[] = []
  let at = 1
  while (at < object.length) {
    while (at < object.length) {
      const character = object[at]
      if (character === undefined) break
      if (/^\s$/.test(character)) { at += 1; continue }
      break
    }
    if (at >= object.length || object[at] === '}') return { properties, trouble: '' }
    if (object[at] === ',') { at += 1; continue }
    if (object[at] === '[') return { properties, trouble: 'a computed name' }
    if (object[at] === '.') return { properties, trouble: 'a spread' }
    const name = /^[A-Za-z_$][\w$]*/.exec(object.slice(at))
    if (name === null) return { properties, trouble: 'an entry the guard cannot read' }
    const afterName = at + (name[0] ?? '').length
    const colon = theFirstCodeFrom(object, afterName)
    if (colon === -1 || object[colon] !== ':') {
      return { properties, trouble: object[colon] === ',' || object[colon] === '}' ? 'a shorthand name' : 'an entry that is not a plain name and a value' }
    }
    const to = theEndOfAProperty(object, colon + 1)
    properties.push({ name: name[0] ?? '', from: colon + 1, to })
    at = to
  }
  return { properties, trouble: '' }
}

/** The first name among these entries that the guard does not allow, or the empty string when it allows them all. */
function theNameNotAllowed(properties: readonly AProperty[], allowed: readonly string[]): string {
  return properties.find((property) => !allowed.includes(property.name))?.name ?? ''
}

/** The character after the value that starts at `from`: a comma at the object's top level, or its closing brace. */
function theEndOfAProperty(code: string, from: number): number {
  let depth = 0
  let at = from
  while (at < code.length) {
    const character = code[at]
    if (character === '{' || character === '[' || character === '(') depth += 1
    else if (character === '}' || character === ']' || character === ')') {
      if (depth === 0) return at
      depth -= 1
    } else if (character === ',' && depth === 0) return at
    at += 1
  }
  return code.length
}

/**
 * EVERY BUNDLE CALL IN A FILE READ AS A SCRIPT WRITTEN IN PLACE, or the first thing that stops it, said with the file's name.
 *
 * A file that names no page module has no page module for a stylesheet to reach, so it is not bundled twice. Its bundle
 * can still be read: every mention of `bundlePageCode` must be a call, apart from the name in the import line, and
 * every call must pass an options object written in place. Every entry of that object and of its stdin is a plain
 * name and a value, and the names are the few esbuild needs for a written-in-place script. A string that names an
 * import, an export or a require would let the script reach a module under src/web, and a template placeholder that
 * is not a whole JSON.stringify call would hide text the guard cannot read. The empty string means every call could
 * be read.
 */
function whatTheBundlesOf(file: string, source: string): string {
  const code = theCodeOf(source)
  const pieces = piecesOf(source)
  for (const call of code.matchAll(/\bbundlePageCode\b/g)) {
    const open = theFirstCodeFrom(code, call.index + 'bundlePageCode'.length)
    if (open === -1 || code[open] !== '(') {
      if (isTheNameInTheSetUpImport(source, call.index)) continue
      return `${file}: a bundlePageCode mention is not a call and is not the name in the import line, so the guard cannot tell what it bundles`
    }
    const close = theBracketThatCloses(code, open, '(', ')')
    if (close === -1) return `${file}: a bundlePageCode call is not closed, so the guard cannot tell what it bundles`
    const argument = theFirstWrittenCharacter(source, code, open + 1, close)
    if (argument === -1) return `${file}: a bundlePageCode call passes no options, so the guard cannot tell what it bundles`
    const first = source[argument] ?? ''
    if (code[argument] !== '{') {
      if (/[A-Za-z_$]/.test(first)) return `${file}: a bundlePageCode call passes its options as a name, so the guard cannot tell what it bundles`
      if (first === '"' || first === "'" || first === '`') return `${file}: a bundlePageCode call passes its options as text, so the guard cannot tell what it bundles`
      return `${file}: a bundlePageCode call passes no object written in place, so the guard cannot tell what it bundles`
    }
    const objectEnd = theBracketThatCloses(code, argument, '{', '}')
    if (objectEnd === -1 || objectEnd > close) return `${file}: a bundlePageCode call's options are not closed, so the guard cannot tell what it bundles`
    const object = code.slice(argument, objectEnd + 1)
    const entries = theEntriesOf(object)
    if (entries.trouble !== '') return `${file}: a bundlePageCode call writes an option as ${entries.trouble}, so the guard cannot tell what it bundles`
    if (object.includes('...')) return `${file}: a bundlePageCode call holds a spread, so the guard cannot tell what it bundles`
    const notAllowed = theNameNotAllowed(entries.properties, OPTION_NAMES)
    if (notAllowed !== '') return `${file}: a bundlePageCode call names ${notAllowed}, so the guard cannot tell what it bundles`
    const stdin = entries.properties.find((property) => property.name === 'stdin')
    if (stdin === undefined) return `${file}: a bundlePageCode call names no stdin, so the guard cannot tell what it bundles`
    const stdinStart = theFirstCodeFrom(code, argument + stdin.from)
    if (stdinStart === -1 || stdinStart >= objectEnd || code[stdinStart] !== '{') return `${file}: a bundlePageCode call passes its stdin as a name, so the guard cannot tell what it bundles`
    const stdinEnd = theBracketThatCloses(code, stdinStart, '{', '}')
    if (stdinEnd === -1 || stdinEnd > objectEnd) return `${file}: a bundlePageCode call's stdin is not closed, so the guard cannot tell what it bundles`
    const stdinEntries = theEntriesOf(code.slice(stdinStart, stdinEnd + 1))
    if (stdinEntries.trouble !== '') return `${file}: a bundlePageCode call's stdin writes an entry as ${stdinEntries.trouble}, so the guard cannot tell what it bundles`
    const stdinNotAllowed = theNameNotAllowed(stdinEntries.properties, STDIN_NAMES)
    if (stdinNotAllowed !== '') return `${file}: a bundlePageCode call's stdin names ${stdinNotAllowed}, so the guard cannot tell what it bundles`
    const contents = stdinEntries.properties.find((property) => property.name === 'contents')
    if (contents === undefined) return `${file}: a bundlePageCode call's stdin names no contents, so the guard cannot tell what it bundles`
    const contentsAt = theFirstWrittenCharacter(source, code, stdinStart + contents.from, stdinStart + contents.to)
    const contentsPiece = pieces.find((piece) => piece.what === 'string' && piece.at === contentsAt)
    let contentsEnd = stdinStart + contents.to - 1
    while (contentsEnd >= contentsAt && /\s/.test(source[contentsEnd] ?? '')) contentsEnd -= 1
    if (contentsAt === -1 || contentsPiece === undefined || contentsPiece.end !== contentsEnd + 1) {
      return `${file}: a bundlePageCode call's stdin names no contents written in place, so the guard cannot tell what it bundles`
    }
    for (const piece of pieces) {
      if (piece.what !== 'string' || piece.at < argument || piece.end > objectEnd) continue
      if (/\bimport\b/.test(piece.body)) return `${file}: a string in a bundlePageCode call holds the word import, so the script can import a module`
      if (/\bexport\b/.test(piece.body)) return `${file}: a string in a bundlePageCode call holds the word export, so the script can export a module`
      if (piece.body.includes('require(')) return `${file}: a string in a bundlePageCode call holds require(, so the script can load a module`
      if (source[piece.at] === '`') {
        const trouble = whatThePlaceholdersOf(piece.body, file)
        if (trouble !== '') return trouble
      }
    }
  }
  return ''
}

/** What stops every placeholder of a template from being a whole JSON.stringify call, with the file's name, or the empty string. */
function whatThePlaceholdersOf(template: string, file: string): string {
  let at = 0
  while (at < template.length) {
    if (template[at] === '\\') { at += 2; continue }
    if (template[at] !== '$' || template[at + 1] !== '{') { at += 1; continue }
    const end = theEndOfAPlaceholder(template, at)
    if (end === -1) return `${file}: a placeholder in a bundlePageCode call is not closed, so the guard cannot tell what it bundles`
    if (!aWholeJsonStringify(template.slice(at + 2, end))) return `${file}: a placeholder in a bundlePageCode call is not a whole JSON.stringify call, so the guard cannot tell what it bundles`
    at = end + 1
  }
  return ''
}

/** Where the placeholder whose `${` is at `at` closes, counting braces in code, or -1 when it does not close. */
function theEndOfAPlaceholder(template: string, at: number): number {
  const from = at + 2
  const code = theCodeOf(template.slice(from))
  let depth = 1
  for (let here = 0; here < code.length; here += 1) {
    if (code[here] === '{') depth += 1
    else if (code[here] === '}') {
      depth -= 1
      if (depth === 0) return from + here
    }
  }
  return -1
}

/** Whether the text is exactly one JSON.stringify(...) call with nothing else around it. */
function aWholeJsonStringify(text: string): boolean {
  const trimmed = text.trim()
  const opening = /^JSON\s*\.\s*stringify\s*\(/.exec(trimmed)
  if (opening === null) return false
  const code = theCodeOf(trimmed)
  const open = (opening[0] ?? '').length - 1
  if (code[open] !== '(') return false
  return theBracketThatCloses(code, open, '(', ')') === trimmed.length - 1
}
