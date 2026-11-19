// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A BUNDLE CARRIES NONE OF THE OWNER'S CONTENT, read in its built bytes (wave 13v round 35).
 * scripts/bundle.mjs asks this after scripts/no-development-material.mjs and before the stamp, and refuses a bundle
 * it names anything in, so a refused folder holds no bundle.
 *
 * It reads every file of the made folder as it was built, never the sources, because the sources are not what ships:
 * a comment esbuild keeps is in the built bytes, and a comment Vite drops is not. A file whose first 8 KB hold a NUL
 * byte is not text and is not read; the count of them is said. A brotli or gzip copy beside the file it unpacks to is
 * not read either, because that file is (isACopyOfTheFileBesideIt). Every file's path is read as well.
 *
 * THE FOUR CLASSES are those of the read-only inventory of 12 October 2026, and the patterns are the merge gate's
 * (tools/merge-tool/owner-content.mjs), so the two never disagree about what a name or a research word is:
 *
 *   1. a word of the owner's research: P7;
 *   2. the owner's project data: a 12-character id that design/ also cites (P10), and a session id (P11). The clean
 *      version has no design/, so there this part of P10 does not run, and the pass says so beside it;
 *   3. the owner's words or decisions: Chinese where it is somebody's words (P8), a quotation or citation of them (P9),
 *      and an id right after a citing word such as "decision" (P10);
 *   4. a name, home folder, email address, machine, address, port or agent handle of the owner: P1 to P6.
 *
 * Here every pattern refuses. The merge gate only reminds of P6 and P8 to P11 on an added line, because there they
 * fire falsely in comments and in development text; a built byte is neither, and each true exception is a named
 * entry below with its reason.
 *
 * WHERE P8 READS CHINESE. In a Markdown file and any other text copied as written, every run. In a JSON file, a value
 * that is not on a `"zh":` line. In built code, a comment and a CSS comment inside a string. A string of built code is
 * the product's own Chinese, its words in the zh word file, and is not read.
 *
 * WHERE A LINE CAME FROM. esbuild writes `// <path>` before each module it bundles. A line after a path under
 * node_modules/ is another package's code; a line after any other path is from that file of the checkout, and an
 * entry may name it. A line of any other file is from the file itself.
 *
 *   node scripts/no-owner-content.mjs <bundle folder>     reads a made bundle and says what it found
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { ALLOWED } from '../tools/merge-tool/owner-content-allowed.mjs'
import { theUncheckedIn, theUncheckedSaid } from '../tools/merge-tool/owner-content.mjs'
import { THE_PATTERNS } from '../tests/the-owners-content-patterns.ts'
import { isTheCleanVersion, whyThisIsNotTheCleanVersion } from './the-clean-version-mark.mjs'
import { LEAK_SHAPES } from '../tools/screen-leaks.mjs'
import { piecesOf } from '../tests/sentences.ts'

/** What each class is, as the refusal says it. */
export const THE_FOUR_CLASSES = Object.freeze({
  1: "a word of the owner's research",
  2: "the owner's project data",
  3: "the owner's words or decisions",
  4: 'a name, home folder, email address, machine, address, port or agent handle of the owner',
})

/** The class each pattern finds. P10 is decided hit by hit: a citation is class 3, any other id class 2. */
const THE_CLASS_OF = Object.freeze({ P1: 4, P2: 4, P3: 4, P4: 4, P5: 4, P6: 4, P7: 1, P8: 3, P9: 3, P11: 2 })

/**
 * The words before an id that make it a citation: "decision X", "decisions X and Y", "message `X`". Said once here,
 * for the check and for its test.
 */
export const THE_CITING_WORDS = Object.freeze([
  'agreement', 'amendment', 'answer', 'brief', 'decision', 'entry', 'finding', 'list', 'message', 'plan', 'precedent',
  'problem', 'proposal', 'question', 'record', 'report', 'request', 'review', 'ruling',
])

/**
 * Words design/ writes that have the shape of an id and are not one, so an id design/ cites is never read as one of
 * them. Each is an ordinary word of English, of HTTP or of a program.
 */
export const NOT_AN_ID = Object.freeze(['Content-Type', 'readUInt32BE', 'Many-to-many', 'Second-level', 'Twenty-three', '--maxWorkers', 'sourceSha256'])

/** @typedef {{ file: string, line: number, from: string, class: 1 | 2 | 3 | 4, pattern: string, says: string, words: string }} AFinding */
/**
 * An entry that lets a hit through. It covers a hit when every field it has agrees: `file` with the path in the bundle,
 * `from` with the file of the checkout the line came from, `patterns` with the pattern, and `text` with the words
 * around the hit (one occurrence of it on the line holds the whole hit).
 * @typedef {{ key: string, why: string, file?: RegExp, from?: RegExp, patterns?: readonly string[], text?: string | RegExp }} AnEntry
 */

/** The folders and files of the checkout the rule-file rewrite will change. */
const THE_RULE_FILES = /^(?:src\/config\/rules\/|src\/config\/roles\.json$|\.claude\/skills\/mole-office\/|for-agents\/README\.md$)/

/** @param {string} path */
const exactly = (path) => new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

/**
 * A text of the merge gate's entries, which it reads in a source file, as it is also read in a built one: esbuild writes
 * a string in double quotes where the source has single ones.
 * @param {string} text
 */
const asBuilt = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll("'", `['"]`))

/**
 * THE MERGE GATE'S ENTRY FOR THE COPYRIGHT LINE OF LATO'S LICENCE. Vite copies public/fonts/lato/OFL.txt into the built
 * page, and a copied file's lines are read as its own, so the gate's entry, which names the file in public/, does not
 * cover the copy. The bundle's entry for the copy reads its text from the gate's entry, so the line is written once.
 */
const LATOS_LINE_KEY = "the copyright line of Lato's licence"
const LATOS_LINE = ALLOWED.find((one) => one.key === LATOS_LINE_KEY)
if (LATOS_LINE === undefined) {
  throw new Error(`tools/merge-tool/owner-content-allowed.mjs has no entry "${LATOS_LINE_KEY}", and the bundle's entry for the copy of Lato's licence reads its text from that entry.`)
}

/** @type {readonly AnEntry[]} */
export const THE_ENTRIES = Object.freeze([
  {
    key: 'until the rule-file rewrite lands',
    from: THE_RULE_FILES,
    why:
      'The default regulations, the role cards, the skill an installed agent reads and the agents\' README are rewritten in a round of their ' +
      'own. Until it lands they ship as they are, and this entry goes when it does.',
  },
  {
    key: "other packages' code and notices",
    from: /(?:^|\/)node_modules\/|^THIRD-PARTY-NOTICES\.txt$/,
    why: 'Code and licence texts of the packages the office is built from, as their authors wrote them. Nothing in them is the owner\'s.',
  },
  // The merge gate's own entries: the copyright line in LICENSE and NOTICE, and the private range's definition.
  ...ALLOWED.map((one) => ({ key: one.key, why: one.why, from: exactly(one.file), patterns: one.patterns, text: asBuilt(one.text) })),
  {
    key: 'the comments of the landed migrations judged by their hash',
    from: /^drizzle\/(?:0212|0213|0228|0230|0231|0232|0233|0234|0252|0253|0270)_[a-z_]+\.sql$/,
    patterns: ['P6', 'P9', 'P10'],
    text: /^--.*/,
    why:
      'A comment line of a migration from index 212 on that had landed before this check was written. Such a migration is applied when ' +
      'the hash of its whole file, comments included, is not among those an office holds (src/config/migration-look.mjs), so a word ' +
      'changed in it would run it again on every office that has it, and one that adds a column would then stop the office from ' +
      'starting. Each stays as it landed (tests/a-landed-migration-is-not-taken-again.test.ts).',
  },
  {
    key: 'the stored authority word "the owner said so"',
    patterns: ['P9'],
    text: 'the owner said so',
    why:
      'One of the five authority words a decision record stores and the doors accept. It names who decided, not what was said, and ' +
      'changing it would change the records that hold it.',
  },
  {
    key: 'the uuids that name no session',
    patterns: ['P11'],
    text: /00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff/,
    why: 'The nil and the largest uuid, which a uuid check in the page accepts. No conversation has either.',
  },
  {
    key: 'the English word "Double-click"',
    patterns: ['P10'],
    text: 'Double-click',
    why:
      'An ordinary word with the shape of a record id, twelve letters and a hyphen, which design/ also uses as a word. The chat ' +
      "seam's help line says it (wave 13y, chat.split.seam). It names no record.",
  },
  {
    key: "the namespace of the office's own Claude conversations",
    from: /^src\/worker\/runtimes\/claude-code\.ts$/,
    patterns: ['P11'],
    text: 'c0f1d2e3-5a4b-4c6d-8e7f-90a1b2c3d4e5',
    why:
      'A namespace made for this code, from which the office derives the id of a conversation it starts. No session has it, and ' +
      'changing it would change the id of every conversation started after.',
  },
  {
    key: "the home page's data attributes",
    file: /^dist\/web\/assets\/[^/]+\.js$/,
    patterns: ['P2'],
    text: /data-home-[a-z-]+/,
    why: 'The attributes the home page marks its parts with. P2 reads -word- after "home" as a folder of a person; here it is a word of an attribute\'s name.',
  },
  {
    key: 'the home folder of an invented person',
    patterns: ['P2'],
    text: '/home/you/',
    why: 'The placeholder of a folder field, in the home folder of "you". It is nobody\'s home folder.',
  },
  {
    key: "the tray picture's name",
    from: exactly('src/desktop/mole-office-trayTemplate@2x.png'),
    patterns: ['P3'],
    text: 'mole-office-trayTemplate@2x.png',
    why:
      'The name macOS reads a tray picture for a double-density screen by. P3 reads the part from "@" on as the domain of an ' +
      'address; it is a picture\'s scale and its ending.',
  },
  {
    key: "the copyright line of Lato's licence, where a bundle holds it",
    from: exactly('dist/web/fonts/lato/OFL.txt'),
    patterns: ['P3'],
    text: LATOS_LINE.text,
    why: `The copy of public/fonts/lato/OFL.txt in the built page. ${LATOS_LINE.why}`,
  },
])

/** A file of built code, which may hold comments and strings. */
const BUILT_CODE = /\.(?:js|mjs|cjs)$/

/** The line esbuild writes before each module it bundles, naming the module's path. */
const A_MODULE_MARK = /^\/\/ (\S+\.(?:ts|tsx|mts|cts|js|mjs|cjs|json))$/

/**
 * THE LICENCE NOTICES ESBUILD GATHERS AT THE END OF A BUILT FILE. It opens one comment with this line, and under it each
 * notice follows the path of the package file it came from, ending in a colon. The notices are other packages' words,
 * so a line in the block is from the package file named last above it, and not from the module marked last before it.
 */
const THE_LICENCE_NOTICES = /^\/\*! Bundled license information:$/
const A_LICENSED_FILE = /^(\S+\.(?:js|mjs|cjs|ts|json)):$/

const A_RECORD_ID = LEAK_SHAPES.find((shape) => shape.kind === 'a record id')?.pattern
if (A_RECORD_ID === undefined) throw new Error("tools/screen-leaks.mjs has no shape for 'a record id', which P10 reads.")
const AN_ID = A_RECORD_ID.source

/** The text just before an id that makes it a citation, with any ids listed between the word and it. */
const A_CITATION_BEFORE = new RegExp(
  `\\b(?:${THE_CITING_WORDS.join('|')})s?\\s+(?:[\`'"(]?${AN_ID}[\`'")]?(?:,\\s*|\\s+and\\s+|\\s+or\\s+|\\s*/\\s*))*[\`'"(]?$`,
  'i',
)

/**
 * EVERY 12-CHARACTER ID design/ CITES: design/ is where this project writes about the owner's own records, so an id it
 * names is one of them. Read from the checkout each time, so a new one is known the day it is written there.
 * @param {string} root the checkout
 * @returns {Set<string>}
 */
export function theIdsDesignCites(root) {
  const design = join(root, 'design')
  /** @type {Set<string>} */
  const ids = new Set()
  /** @param {string} at */
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) walk(path)
      else for (const hit of readFileSync(path, 'utf8').matchAll(new RegExp(AN_ID, 'g'))) ids.add(hit[0])
    }
  }
  try {
    walk(design)
  } catch (error) {
    throw new Error(`The ids design/ cites could not be read from ${design}, so no bundle is checked for them: ${error instanceof Error ? error.message : String(error)}`)
  }
  for (const word of NOT_AN_ID) ids.delete(word)
  return ids
}

/** Every file under a folder, by its path inside it, with / between its parts. @param {string} folder */
function everyFileIn(folder) {
  /** @type {string[]} */
  const files = []
  const walk = (/** @type {string} */ at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(relative(folder, path).split(sep).join('/'))
    }
  }
  walk(folder)
  return files.sort()
}

/**
 * A COMPRESSED COPY IS NOT READ, BECAUSE THE FILE IT UNPACKS TO IS. The web build writes a brotli and a gzip copy beside
 * every script and stylesheet (writeTheCompressedCopies in vite.config.ts). A small brotli copy can hold no NUL byte,
 * so the 8 KB rule alone read its packed bytes as text, and on 8 November 2026 it found Chinese in two of them. A copy
 * that unpacks to the file beside it holds nothing that file does not. A copy that unpacks to anything else is refused,
 * because what it holds would go unread.
 * @param {string} folder
 * @param {string} file
 * @param {Buffer} bytes
 */
function isACopyOfTheFileBesideIt(folder, file, bytes) {
  const ending = /\.(br|gz)$/.exec(file)
  if (ending === null) return false
  const plain = join(folder, file.slice(0, -ending[0].length))
  if (!existsSync(plain)) return false
  const unpacked = ending[1] === 'br' ? brotliDecompressSync(bytes) : gunzipSync(bytes)
  if (!unpacked.equals(readFileSync(plain))) throw new Error(`${file} is a compressed copy that does not unpack to the file beside it, so what it holds would not be read.`)
  return true
}

/**
 * The stretches of a built code file P8 reads Chinese in: its comments, and each CSS comment inside one of its strings.
 * @param {string} text
 * @returns {[number, number][]} sorted by where they start
 */
function theCommentsOf(text) {
  /** @type {[number, number][]} */
  const out = []
  for (const piece of piecesOf(text)) {
    if (piece.what === 'comment') out.push([piece.at, piece.end])
    else for (const css of text.slice(piece.at, piece.end).matchAll(/\/\*[\s\S]*?\*\//g)) out.push([piece.at + (css.index ?? 0), piece.at + (css.index ?? 0) + css[0].length])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** @param {[number, number][]} stretches @param {number} at */
function isInside(stretches, at) {
  let low = 0
  let high = stretches.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const [start, end] = /** @type {[number, number]} */ (stretches[middle])
    if (at < start) high = middle - 1
    else if (at >= end) low = middle + 1
    else return true
  }
  return false
}

/** @param {string} line @param {string | RegExp} text @param {{ at: number, words: string }} hit */
function covers(line, text, hit) {
  const occurrences = typeof text === 'string' ? [...line.matchAll(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))] : [...line.matchAll(new RegExp(text.source, 'g'))]
  return occurrences.some((one) => (one.index ?? 0) <= hit.at && hit.at + hit.words.length <= (one.index ?? 0) + one[0].length)
}

/**
 * The entry that lets one hit through, or undefined.
 * @param {readonly AnEntry[]} entries @param {{ file: string, from: string, pattern: string, line: string, hit: { at: number, words: string } }} one
 */
function theEntryFor(entries, { file, from, pattern, line, hit }) {
  return entries.find(
    (entry) =>
      (entry.file === undefined || entry.file.test(file)) &&
      (entry.from === undefined || entry.from.test(from)) &&
      (entry.patterns === undefined || entry.patterns.includes(pattern)) &&
      (entry.text === undefined || covers(line, entry.text, hit)),
  )
}

/**
 * WHAT ONE LINE CARRIES. P8 is read here and not by the merge gate's pattern, because what it reads depends on the kind
 * of file; P10 is read here because it refuses only an id design/ cites or a citation.
 * @param {string} line
 * @param {{ kind: 'code' | 'json' | 'text', inAComment: (at: number) => boolean, patterns: readonly import('../tools/merge-tool/owner-content.mjs').APattern[], cited: Set<string> }} how
 * @returns {{ pattern: string, class: 1 | 2 | 3 | 4, says: string, at: number, words: string }[]}
 */
export function theHitsOnALine(line, { kind, inAComment, patterns, cited }) {
  /** @type {{ pattern: string, class: 1 | 2 | 3 | 4, says: string, at: number, words: string }[]} */
  const out = []
  for (const pattern of patterns) {
    if (pattern.id === 'P8') {
      if (kind === 'json' && /^\s*"zh"\s*:/.test(line)) continue
      for (const hit of line.matchAll(/\p{Script=Han}+/gu)) {
        if (kind === 'code' && !inAComment(hit.index ?? 0)) continue
        out.push({ pattern: 'P8', class: 3, says: 'Chinese in a comment, a copied text or a JSON value', at: hit.index ?? 0, words: hit[0] })
      }
    } else if (pattern.id === 'P10') {
      for (const hit of line.matchAll(new RegExp(AN_ID, 'g'))) {
        const at = hit.index ?? 0
        if (A_CITATION_BEFORE.test(line.slice(Math.max(0, at - 200), at))) out.push({ pattern: 'P10', class: 3, says: 'an id cited after a word such as "decision"', at, words: hit[0] })
        else if (cited.has(hit[0])) out.push({ pattern: 'P10', class: 2, says: 'an id design/ cites', at, words: hit[0] })
      }
    } else {
      const theClass = /** @type {1 | 2 | 3 | 4 | undefined} */ (THE_CLASS_OF[/** @type {keyof typeof THE_CLASS_OF} */ (pattern.id)])
      if (theClass === undefined) throw new Error(`The merge gate has a pattern ${pattern.id} this check gives no class.`)
      for (const hit of pattern.find(line, { file: 'a.md', inAComment })) out.push({ pattern: pattern.id, class: theClass, says: pattern.says, at: hit.at, words: hit.words })
    }
  }
  return out
}

/**
 * WHAT ONE FILE CARRIES, line by line, and what the entries let through. Its path is read as line 0.
 * @param {{ file: string, from?: string, text: string | null, cited: Set<string>, root: string, patterns?: readonly import('../tools/merge-tool/owner-content.mjs').APattern[], entries?: readonly AnEntry[], modulesFrom?: string }} what
 *   `file` is the path in the made folder; `from` the file of the checkout it came from, when that is known and is
 *   not `file`; `text` its text, or null when it is not text; `cited` the ids design/
 *   cites; `root` the checkout; `modulesFrom` the folder esbuild's module paths are relative to (its working folder)
 * @returns {{ found: AFinding[], let: Map<string, number> }}
 */
export function ownerContentInAFile({ file, from: itCameFrom = file, text, cited, root, patterns = THE_PATTERNS, entries = THE_ENTRIES, modulesFrom = process.cwd() }) {
  /** @type {AFinding[]} */
  const found = []
  /** @type {Map<string, number>} */
  const allowed = new Map()
  /** @param {string} from @param {number} n @param {string} line @param {'code' | 'json' | 'text'} kind @param {(at: number) => boolean} inAComment */
  const readALine = (from, n, line, kind, inAComment) => {
    for (const hit of theHitsOnALine(line, { kind, inAComment, patterns, cited })) {
      const entry = theEntryFor(entries, { file, from, pattern: hit.pattern, line, hit })
      if (entry !== undefined) allowed.set(entry.key, (allowed.get(entry.key) ?? 0) + 1)
      else found.push({ file, line: n, from, class: hit.class, pattern: hit.pattern, says: hit.says, words: hit.words })
    }
  }
  readALine(itCameFrom, 0, file, 'text', () => false)
  if (text === null) return { found, let: allowed }
  const kind = BUILT_CODE.test(file) ? 'code' : file.endsWith('.json') ? 'json' : 'text'
  const comments = kind === 'code' ? theCommentsOf(text) : []
  let from = itCameFrom
  let inTheNotices = false
  let lineStart = 0
  const lines = text.split('\n')
  for (let n = 0; n < lines.length; n += 1) {
    const line = /** @type {string} */ (lines[n])
    const mark = kind === 'code' && !inTheNotices ? A_MODULE_MARK.exec(line) : null
    if (mark !== null) {
      const path = /** @type {string} */ (mark[1])
      const inTheCheckout = relative(root, resolve(modulesFrom, path)).split(sep).join('/')
      from = path.includes('node_modules/') || inTheCheckout.startsWith('../') ? path.replace(/^(?:\.\.\/)+/, '') : inTheCheckout
    }
    if (kind === 'code' && !inTheNotices && THE_LICENCE_NOTICES.test(line) && isInside(comments, lineStart)) {
      inTheNotices = true
      from = 'node_modules/'
    } else if (inTheNotices) {
      const licensed = A_LICENSED_FILE.exec(line)
      if (licensed !== null) from = `node_modules/${/** @type {string} */ (licensed[1])}`
    }
    const start = lineStart
    readALine(from, n + 1, line, kind, (at) => isInside(comments, start + at))
    lineStart += line.length + 1
  }
  return { found, let: allowed }
}

/**
 * Said beside the pass in the clean version, which has no design/ to read the owner's record ids from. Its words say
 * what did not run and why.
 */
const NOT_ASKED_IN_THE_CLEAN_VERSION = Object.freeze({
  pattern: 'P10',
  what: "the owner's record ids that design/ cites",
  why: 'This checkout is the clean version: it carries the clean version\'s mark and has no design/ folder to read them from. An id right after a citing word such as "decision" was still looked for.',
})

/**
 * WHAT OWNER CONTENT A MADE FOLDER CARRIES, file by file and line by line, what the entries let through, and what the
 * patterns did not look for.
 *
 * A `root` that carries the clean version's mark and is not the clean version is refused first, in the sentence of
 * scripts/the-clean-version-mark.mjs. In the clean version, with no `cited` given, no id is asked of design/, and the
 * unchecked list says so.
 * @param {{ folder: string, root?: string, cited?: Set<string>, patterns?: readonly import('../tools/merge-tool/owner-content.mjs').APattern[], entries?: readonly AnEntry[], modulesFrom?: string, ownersContent?: { content: unknown } }} what
 *   `folder` is the made folder; `cited` the ids design/ cites, read from `root` when not given; `ownersContent` what
 *   was read of the owner's list, this process's reading when not given
 * @returns {{ found: AFinding[], let: Map<string, number>, read: number, notText: string[], unchecked: { pattern: string, what: string, why: string }[] }}
 */
export function ownerContentIn({ folder, root = resolve(folder), cited, patterns = THE_PATTERNS, entries = THE_ENTRIES, modulesFrom = process.cwd(), ownersContent }) {
  const notTheCleanVersion = whyThisIsNotTheCleanVersion(root, ownersContent)
  if (notTheCleanVersion !== null) throw new Error(notTheCleanVersion)
  const inTheCleanVersion = cited === undefined && isTheCleanVersion(root)
  const ids = cited ?? (inTheCleanVersion ? new Set() : theIdsDesignCites(root))
  /** @type {AFinding[]} */
  const found = []
  /** @type {Map<string, number>} */
  const allowed = new Map()
  /** @type {string[]} */
  const notText = []
  let read = 0
  for (const file of everyFileIn(folder)) {
    const bytes = readFileSync(join(folder, file))
    const isText = !isACopyOfTheFileBesideIt(folder, file, bytes) && !bytes.subarray(0, 8192).includes(0)
    if (isText) read += 1
    else notText.push(file)
    const one = ownerContentInAFile({ file, text: isText ? bytes.toString('utf8') : null, cited: ids, root, patterns, entries, modulesFrom })
    found.push(...one.found)
    for (const [key, n] of one.let) allowed.set(key, (allowed.get(key) ?? 0) + n)
  }
  return { found, let: allowed, read, notText, unchecked: [...theUncheckedIn(patterns), ...(inTheCleanVersion ? [NOT_ASKED_IN_THE_CLEAN_VERSION] : [])] }
}

/** One finding, as the refusal says it. @param {AFinding} one */
export const aFindingSaid = (one) =>
  `${one.file} ${one.line === 0 ? 'in its name' : `line ${String(one.line)}`}${one.from === one.file ? '' : ` (from ${one.from})`}, class ${String(one.class)} ` +
  `(${THE_FOUR_CLASSES[one.class]}), ${one.pattern}: "${one.words}"`

/**
 * The refusal, naming every finding by its file, its line and its class, and how many of each class there are.
 * @param {string} what
 * @param {AFinding[]} found
 */
export function theOwnerContentRefusal(what, found) {
  const byClass = [1, 2, 3, 4].map((n) => `class ${String(n)}: ${String(found.filter((one) => one.class === n).length)}`).join(', ')
  return (
    `${what} carries the owner's own content in its built bytes, and none of it may ship. ${String(found.length)} found (${byClass}):\n` +
    `${found.map((one) => `  ${aFindingSaid(one)}`).join('\n')}\n` +
    'Make the words neutral where they are written. A true exception is an entry of THE_ENTRIES in scripts/no-owner-content.mjs, with its reason.'
  )
}

/** What the patterns did not look for, said beside a pass, or null when they looked for everything. */
export { theUncheckedSaid }

/** What the entries let through, one line. @param {Map<string, number>} allowed */
export const whatTheEntriesLet = (allowed) =>
  allowed.size === 0 ? 'No entry let anything through.' : `Let through by name: ${[...allowed].map(([key, n]) => `${key} (${String(n)})`).join('; ')}.`

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const folder = process.argv[2]
  if (folder === undefined) {
    process.stderr.write('Name the bundle folder: node scripts/no-owner-content.mjs <folder>\n')
    process.exit(2)
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  const { found, let: allowed, read, notText, unchecked } = ownerContentIn({ folder: resolve(folder), root })
  const notLookedFor = theUncheckedSaid(unchecked)
  if (found.length > 0) process.stdout.write(`${theOwnerContentRefusal(folder, found)}\n`)
  else process.stdout.write(`${folder} carries none of the owner's content${notLookedFor === null ? '' : ' that was looked for'}.\n`)
  process.stdout.write(`${String(read)} files read as text; ${String(notText.length)} not text and not read. ${whatTheEntriesLet(allowed)}\n`)
  if (notLookedFor !== null) process.stdout.write(`${notLookedFor}\n`)
  process.exit(found.length > 0 ? 1 : 0)
}
