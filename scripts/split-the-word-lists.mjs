// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORD LISTS, SPLIT INTO ONE FILE PER WAVE (decision O_pTmlZJwVJT).
 *
 *     node scripts/split-the-word-lists.mjs                # splits src/shared/words/en.ts and zh.ts where they are
 *     node scripts/split-the-word-lists.mjs --into <dir>   # writes the split into <dir> and leaves the lists alone
 *
 * Each list is cut at its anchor lines, `// wave 13x: add new sections above this line`. Every anchor
 * line becomes the last line of its own file, `en-wave-13x.ts`, which holds the lines between the
 * anchor before it and that anchor. That is the place the wave adds its words; it is not a claim
 * about who wrote each word in it. The lines above the paragraph that begins `ONE ANCHOR PER WAVE`,
 * with that paragraph, go to `en-no-wave.ts`. `en.ts` and `zh.ts` are left as the readers that join
 * the parts, in the same order, with `joinWordLists` in `join-word-lists.ts`, which this copies from
 * the committed src/shared/words/join-word-lists.ts.
 *
 * `joinWordLists` copies each key's property as it is, so a getter stays a getter and is read when it
 * is asked for, and a getter that reads `this[...]` reads the joined list. It throws when a key is in
 * two parts.
 *
 * It refuses, and writes nothing, when a list is already split, when it cannot find the start or end
 * of a list, when the two languages do not have the same anchors in the same order, or when anything
 * but blank lines follows the last anchor. Since wave 13j's round 41 it also refuses to split in place,
 * because src/shared/words/joined.ts already joins en.ts with every wave's part, and it refuses to write
 * over a wave file that holds words.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const THE_WORDS = resolve(HERE, '..', 'src', 'shared', 'words')
const LANGUAGES = /** @type {const} */ (['en', 'zh'])
const ANCHOR = /^\s*\/\/ wave (13[a-z]+): add new sections above this line\s*$/
const NO_WAVE_ENDS = /ONE ANCHOR PER WAVE/
export const JOINED = /\bjoinWordLists\(/

/**
 * THE TESTS THAT READ A WORD LIST AS A FILE, which the round that commits the split changes in the same
 * commit. A test that imports en.ts or zh.ts reads the joined list and is not here; a test that reads
 * the file's text by its path, or cuts it between two lines, is. findTestsThatReadTheListsAsFiles finds
 * them, and the split test fails when it finds one that is not here, or when one here is no longer
 * found. "red" is a test that fails on the split lists. "checks nothing" is a test that passes on them
 * only because what it reads is empty. "unaffected" is one the search finds that passes on them because
 * it does check the lists (wave 13j, round 40b, after check XTlisHKdnQbI found a seventh red test and
 * one that checks nothing, which round 40 had listed by hand and missed). Since wave 13j's round 41 the
 * six that read en.ts's text read every file of the list through tests/word-list-files.ts, which the
 * search finds by THE_WORD_LISTS_FOLDER, and they passed on a split applied over src/shared/words.
 *
 * @type {readonly { file: string, reads: string, afterTheSplit: 'red' | 'checks nothing' | 'unaffected' }[]}
 */
export const TESTS_THAT_READ_THE_LISTS_AS_FILES = [
  { file: 'tests/word-list-files.ts', reads: "the folder, for en.ts or zh.ts and every part beside it by name; since wave 13j's round 41 the tests that read a list's text read it through this", afterTheSplit: 'unaffected' },
  { file: 'tests/merge-carry-rule.test.ts', reads: "the path src/shared/words/en.ts as a name the merge queue judges by line, never the file; en.ts stays at that path as the joiner", afterTheSplit: 'unaffected' },
  { file: 'tests/the-merge-tool-joins-list-files-round-22.test.ts', reads: "the path src/shared/words/en.ts as the name of a list file the merge queue joins, with synthetic text the test writes; it never reads the real list (wave 13v round 22)", afterTheSplit: 'unaffected' },
  { file: 'tests/the-merger.test.ts', reads: "the paths en.ts and zh.ts, with two wave anchors, for synthetic lists it writes into its own scratch repository; it never reads the real lists", afterTheSplit: 'unaffected' },
  { file: 'tests/a-trace-naming-no-record-is-asked-once-round-33.test.ts', reads: "the paths en.ts and zh.ts as two strings in a synthetic check's trace; it never reads the lists (wave 13v round 33)", afterTheSplit: 'unaffected' },
  { file: 'tests/a-standard-change-is-one-of-four-kinds.test.ts', reads: "the paths en.ts and zh.ts as changed paths it hands to the rule for a standard change, which judges a path and never opens it; it never reads the lists (wave 13r round G)", afterTheSplit: 'unaffected' },
]

/** What a line names when it reads a word list as a file: its path, its file name alone, a path built from a language, or an anchor to cut at. */
const NAMES_A_LIST_FILE = [/\bwords\/(en|zh)\.ts\b/, /['"`](en|zh)\.ts['"`]/, /words\/\$\{[^}]+\}\.ts/, /add new sections above this line/, /\bTHE_WORD_LISTS_FOLDER\b/]
/** An import by a written path reads the joined list, so it is taken out of a line before the line is searched. */
const IMPORT_BY_PATH = /\bimport\(\s*(['"`])[^'"`]*\1\s*\)/g

/**
 * Every file under `testsDir` that names a word list as a file, outside an import and a comment, with
 * the lines that do. The split test is left out, because it reads the lists to split them. Paths are
 * relative to the repository, as in TESTS_THAT_READ_THE_LISTS_AS_FILES.
 *
 * @param {string} testsDir
 * @returns {Map<string, string[]>}
 */
export function findTestsThatReadTheListsAsFiles(testsDir) {
  /** @type {Map<string, string[]>} */
  const found = new Map()
  const root = resolve(HERE, '..')
  for (const name of readdirSync(testsDir, { recursive: true, encoding: 'utf8' })) {
    if (!/\.(ts|tsx|mts|js|mjs)$/.test(name)) continue
    const file = relative(root, join(testsDir, name)).split(sep).join('/')
    const lines = readFileSync(join(testsDir, name), 'utf8').split('\n').map((line, i) => /** @type {[number, string]} */ ([i + 1, line]))
    const hits = lines.filter(([, line]) => {
      if (/^\s*(\/\/|\/?\*)/.test(line) || /^\s*import\s[^(]/.test(line) || /^\s*\}?\s*from\s+['"]/.test(line)) return false
      const searched = line.replace(IMPORT_BY_PATH, '')
      return NAMES_A_LIST_FILE.some((pattern) => pattern.test(searched))
    })
    if (hits.length > 0) found.set(file, hits.map(([n, line]) => `${String(n)}: ${line.trim()}`))
  }
  return found
}

/** @param {string} message */
function refuse(message) {
  throw new Error(`split-the-word-lists: ${message} Nothing was written.`)
}

/** @param {string} lang @param {string} wave */
function partName(lang, wave) {
  return wave === 'no-wave' ? `${lang}NoWave` : `${lang}Wave${wave.slice(0, 1).toUpperCase()}${wave.slice(1)}`
}

/**
 * Every import statement of a file, with the local names it brings in.
 * @param {string} text
 * @returns {{ statement: string, names: string[] }[]}
 */
function importsOf(text) {
  const found = []
  for (const match of text.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'[ \t]*;?[ \t]*$/gm)) {
    const names = match[2].split(',').map((one) => one.trim()).filter(Boolean).map((one) => one.replace(/^type\s+/, '').split(/\s+as\s+/).pop() ?? one)
    found.push({ statement: match[0], names })
  }
  if (/^import\s+(?!type\s+\{|\{)/m.test(text)) refuse('A word list has an import of a form this does not read (only `import { … } from` and `import type { … } from`).')
  return found
}

/**
 * The import statements a piece of code needs, from those given, narrowed to the names it uses.
 * @param {string} code
 * @param {{ statement: string, names: string[] }[]} imports
 */
function importsUsedBy(code, imports) {
  const lines = []
  for (const one of imports) {
    const used = one.names.filter((name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code))
    if (used.length === 0) continue
    const head = /^import\s+type\s/.test(one.statement) ? 'import type' : 'import'
    const from = one.statement.match(/from\s+'([^']+)'/)?.[1]
    const specifiers = one.statement.replace(/^import\s+(type\s+)?\{/, '').replace(/\}\s+from[\s\S]*$/, '').split(',').map((s) => s.trim()).filter(Boolean)
    const kept = specifiers.filter((s) => used.includes(s.replace(/^type\s+/, '').split(/\s+as\s+/).pop() ?? s))
    lines.push(`${head} { ${kept.join(', ')} } from '${from}'`)
  }
  return lines
}

/**
 * Point every import of a file that leaves its folder (`../`) at the same module from another folder.
 * An import of a file beside it (`./`) is left alone: that file is written beside it too.
 * @param {string} text @param {string} fromDir @param {string} toDir
 */
export function rewriteRelativeImports(text, fromDir, toDir) {
  return text.replace(/(from\s+')(\.\.\/[^']+)(')/g, (_all, a, path, b) => {
    const target = resolve(fromDir, path)
    const local = relative(toDir, target).split('\\').join('/')
    return `${a}${local.startsWith('.') ? local : `./${local}`}${b}`
  })
}

/**
 * One list cut into its parts.
 * @param {string} lang @param {string} text
 */
function cut(lang, text) {
  if (JOINED.test(text)) refuse(`src/shared/words/${lang}.ts is already split: it joins its parts with joinWordLists.`)
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`export const ${lang} = {`))
  const end = lines.findIndex((line, i) => i > start && line.startsWith('} as const'))
  if (start < 0 || end < 0) refuse(`Cannot find where the list in ${lang}.ts starts (\`export const ${lang} = {\`) or ends (\`} as const\`).`)
  const body = lines.slice(start + 1, end)
  const marker = body.findIndex((line) => NO_WAVE_ENDS.test(line))
  if (marker < 0) refuse(`${lang}.ts has no line saying ONE ANCHOR PER WAVE, so this cannot tell where the words no wave owns end.`)
  let noWaveEnd = marker + 1
  while (noWaveEnd < body.length && /^\s*\/\/(?! ----)/.test(body[noWaveEnd]) && !ANCHOR.test(body[noWaveEnd])) noWaveEnd += 1
  /** @type {{ wave: string, lines: string[] }[]} */
  const parts = [{ wave: 'no-wave', lines: body.slice(0, noWaveEnd) }]
  let from = noWaveEnd
  for (let i = noWaveEnd; i < body.length; i += 1) {
    const anchor = body[i].match(ANCHOR)
    if (anchor === null) continue
    if (parts.some((part) => part.wave === anchor[1])) refuse(`${lang}.ts has wave ${anchor[1]}'s anchor twice.`)
    parts.push({ wave: anchor[1], lines: body.slice(from, i + 1) })
    from = i + 1
  }
  if (body.slice(from).some((line) => line.trim() !== '')) refuse(`${lang}.ts has words after its last anchor, which belong to no wave's place.`)
  if (parts.length === 1) refuse(`${lang}.ts has no anchor line.`)
  // The comment directly above the list's first line stays with the joined list.
  let docStart = start
  if (lines[start - 1]?.trim().endsWith('*/')) {
    docStart = start - 1
    while (docStart > 0 && !lines[docStart].trim().startsWith('/**')) docStart -= 1
  }
  return { head: lines.slice(0, docStart), doc: lines.slice(docStart, start), opening: lines[start], closing: lines[end], tail: lines.slice(end + 1), parts }
}

/**
 * Split both lists.
 * @param {{ read: (lang: string) => string, into: string }} how
 * @returns {Map<string, string>} each file's name and its text
 */
export function split({ read, into }) {
  const cuts = LANGUAGES.map((lang) => ({ lang, ...cut(lang, read(lang)) }))
  const waves = cuts.map((one) => one.parts.map((part) => part.wave).join(' '))
  if (waves[0] !== waves[1]) refuse(`The two lists have different anchors: en.ts has ${waves[0]}, zh.ts has ${waves[1]}.`)
  /** @type {Map<string, string>} */
  const files = new Map()
  const rewrite = (/** @type {string} */ text) => (resolve(into) === THE_WORDS ? text : rewriteRelativeImports(text, THE_WORDS, resolve(into)))
  files.set('join-word-lists.ts', JOIN_WORD_LISTS)
  for (const { lang, head, doc, opening, closing, tail, parts } of cuts) {
    const all = [...head, ...tail].join('\n')
    const imports = importsOf(all)
    // What the head declares besides its imports (in en.ts, `capitalisedNoun`) goes to a file of its own,
    // so a part can use it without importing the list that imports that part.
    const own = head.filter((line) => !imports.some((one) => one.statement.split('\n').includes(line)))
    const ownCode = own.join('\n').trim()
    const ownNames = [...ownCode.matchAll(/^(?:export\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
    if (ownCode !== '' && ownNames.length === 0) refuse(`${lang}.ts has code above its list that this cannot name.`)
    for (const name of ownNames) {
      if (new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(tail.join('\n'))) refuse(`${lang}.ts uses ${name}, from above its list, below its list too.`)
    }
    const tailOwn = [...tail.join('\n').matchAll(/^(?:export\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
    const ownImports = ownNames.length === 0 ? [] : [{ statement: `import { ${ownNames.join(', ')} } from './${lang}-own-helpers.ts'`, names: ownNames }]
    if (ownNames.length > 0) {
      const exported = ownCode.replace(/^(function|const|let|class)\s/gm, 'export $1 ')
      files.set(`${lang}-own-helpers.ts`, rewrite([`// Written by scripts/split-the-word-lists.mjs from the top of src/shared/words/${lang}.ts: what its parts use that it declared itself.`, ...importsUsedBy(exported, imports), '', exported, ''].join('\n')))
    }
    for (const part of parts) {
      const code = part.lines.join('\n')
      for (const name of tailOwn) {
        if (new RegExp(`(?<![\\w$.'"])${name}(?![\\w$'"])`).test(code)) refuse(`A part of ${lang}.ts uses ${name}, which ${lang}.ts declares below its list.`)
      }
      const said = part.wave === 'no-wave'
        ? `// Written by scripts/split-the-word-lists.mjs from src/shared/words/${lang}.ts: the words no wave owns.`
        : `// Written by scripts/split-the-word-lists.mjs from src/shared/words/${lang}.ts: wave ${part.wave}'s place. Its anchor is the last line.`
      files.set(`${lang}-${part.wave === 'no-wave' ? 'no-wave' : `wave-${part.wave}`}.ts`, rewrite([said, ...importsUsedBy(code, [...imports, ...ownImports]), '', `export const ${partName(lang, part.wave)} = {`, code, '} as const', ''].join('\n')))
    }
    const names = parts.map((part) => partName(lang, part.wave))
    const satisfies = closing.replace(/^\} as const\s*/, '')
    const joined = [
      // The imports below the list stay where they are, with the rest of what follows it.
      ...importsUsedBy([...tail, satisfies].join('\n'), importsOf(head.join('\n'))),
      `import { joinWordLists } from './join-word-lists.ts'`,
      ...parts.map((part, i) => `import { ${names[i]} } from './${lang}-${part.wave === 'no-wave' ? 'no-wave' : `wave-${part.wave}`}.ts'`),
      '',
      `// The list is in ${parts.length} files, one for each wave's anchor and one for words no wave owns, written by scripts/split-the-word-lists.mjs.`,
      `// A wave adds its words to its own file, above its anchor. joinWordLists refuses a key that is in two of them.`,
      ...doc,
      `${opening.replace(/=\s*\{\s*$/, '=')} joinWordLists(${names.join(', ')})${satisfies === '' ? '' : ` ${satisfies}`}`,
      ...tail,
    ].join('\n')
    files.set(`${lang}.ts`, rewrite(joined))
  }
  return files
}

/**
 * The joiner the split's en.ts and zh.ts import: the committed src/shared/words/join-word-lists.ts, copied as it is,
 * so the split and joined.ts join the same way (wave 13j, round 41).
 */
const JOIN_WORD_LISTS = readFileSync(join(THE_WORDS, 'join-word-lists.ts'), 'utf8')

/**
 * The wave files in `into` that hold words already. Since wave 13j's round 41 a wave writes its new words into
 * its own en-wave-13x.ts, and a split would write over them.
 * @param {string} into
 * @returns {string[]}
 */
export function partFilesHoldingWords(into) {
  let names
  try {
    names = readdirSync(into)
  } catch {
    return []
  }
  return names.filter((name) => /^(en|zh)-(no-wave|wave-1[34][a-z]+)\.ts$/.test(name)).filter((name) => {
    const text = readFileSync(join(into, name), 'utf8')
    const body = text.slice(text.indexOf('= {') + 3, text.lastIndexOf('}'))
    return body.split('\n').some((line) => line.trim() !== '' && !/^\s*\/\//.test(line))
  })
}

/**
 * Why a split may not be written into `into`, or null when it may.
 *
 * JOINED.TS JOINS EN.TS WITH EVERY WAVE'S PART since wave 13j's round 41. A split in place would make en.ts join
 * the parts as well, and every word would be joined twice. The round that commits a split changes joined.ts or
 * this script so that only one of the two joins.
 * @param {string} into
 * @returns {string | null}
 */
export function whyNotSplitInto(into) {
  if (resolve(into) === THE_WORDS) return "src/shared/words/joined.ts already joins en.ts with every wave's part, so a split in place would join each word twice. Split with --into a folder."
  const holding = partFilesHoldingWords(into)
  if (holding.length > 0) return `These wave files in ${relative(process.cwd(), into) || '.'} hold words, and the split would write over them: ${holding.join(', ')}.`
  return null
}

/** @param {string[]} argv */
function main(argv) {
  const at = argv.indexOf('--into')
  const into = at < 0 ? THE_WORDS : resolve(argv[at + 1] ?? refuse('--into needs a folder.'))
  const why = whyNotSplitInto(into)
  if (why !== null) refuse(why)
  const files = split({ read: (lang) => readFileSync(join(THE_WORDS, `${lang}.ts`), 'utf8'), into })
  mkdirSync(into, { recursive: true })
  for (const [name, text] of files) writeFileSync(join(into, name), text)
  console.log(`split-the-word-lists: wrote ${String(files.size)} files into ${relative(process.cwd(), into) || '.'}: ${[...files.keys()].join(', ')}.`)
  const changing = TESTS_THAT_READ_THE_LISTS_AS_FILES.filter((one) => one.afterTheSplit !== 'unaffected')
  console.log(`split-the-word-lists: ${String(changing.length)} tests read the lists as files and change in the same commit as the split:`)
  for (const one of changing) console.log(`  ${one.file} (${one.afterTheSplit}): ${one.reads}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))
