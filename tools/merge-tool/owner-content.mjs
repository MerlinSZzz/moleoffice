// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GATE AGAINST NEW OWNER CONTENT IN WHAT SHIPS (wave 13v round 30). Part of the merge tool,
 * tools/the-merger.mjs. Integrate runs it as its third guard, on the rebased
 * entry, before the build and the suite.
 *
 * It reads only the lines an entry ADDS (`git diff --unified=0 main...<entry>`, the lines that start with +), and only
 * in the paths that ship. So a line already on main never blocks anything: the cleanup of what is there waits for the
 * owner's review. The patterns are part (d) of the read-only inventory of 12 October 2026, which also says where each
 * one fires falsely:
 *
 *   - REFUSED, because they seldom fire falsely: P1 the owner's names and accounts, P2 home folders and the owner's
 *     folder layout, P3 email addresses, P4 private-network addresses and the owner's machine names, P5 the port of the
 *     owner's own office, and P7 the owner's research words.
 *   - REMINDED, never refused, because they often fire falsely: P6 agent handles, P8 Chinese in comments, P9 the owner's
 *     words or decisions in prose, P10 record ids and P11 session ids. The entry's log and its tested step name them.
 *   - A NEW FILE under public/ or src/config/rules/ is refused unless tools/merge-tool/owner-content-allowed.mjs names
 *     it, because those folders ship as written, comments and all. Without renames, a file moved there is a new file.
 *
 * A hit that an entry of tools/merge-tool/owner-content-allowed.mjs covers passes, and the gate says which entry let it
 * through. No name is written here, and this module reads none. The owner's names, the agent handles, the owner's
 * machine names, the port of the owner's own office, the real name and the research words come in the patterns the
 * caller gives. tests/the-owners-content-patterns.ts makes them from the file of the owner's content, outside the
 * repository, and integrate.mjs gets them through arguments.mjs, because the merge tool reads the office settings only
 * there and in office-keeper.mjs. Where no file was read, or a caller gives no patterns, the gate looks for everything
 * else and says which of those it did not look for, and why. This module imports nothing from the tool but
 * a-library-is-not-a-program.mjs, which does nothing when it is imported, and its allow-list, so a test and a dry run
 * use it without starting a run.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'

import { piecesOf } from '../../tests/the-pieces-of-a-source.ts'
import { LEAK_SHAPES } from '../screen-leaks.mjs'
import { ALLOWED, NEW_FILES_THAT_MAY_SHIP } from './owner-content-allowed.mjs'

/**
 * The paths that ship: src, public, drizzle, for-agents, the mole-office skill, LICENSE, NOTICE and package.json, and
 * also plugins/office-map. The public copy carries the office-map plugin, so a line added there is read here too.
 */
export const THE_PATHS_THAT_SHIP = Object.freeze(['src', 'public', 'drizzle', 'for-agents', '.claude/skills/mole-office', 'LICENSE', 'NOTICE', 'package.json', 'plugins/office-map'])

/** The folders that ship as written, where a new file needs a name on the list. */
export const FOLDERS_THAT_SHIP_AS_WRITTEN = Object.freeze(['public/', 'src/config/rules/'])

/** @typedef {{ at: number, words: string }} AHit */
/** @typedef {{ file: string, inAComment: (at: number) => boolean }} TheLine */
/**
 * What a pattern did not look for, because the list it needs is empty, and why the list is empty.
 * @typedef {{ what: string, why: string }} ANotChecked
 */
/** @typedef {{ id: string, says: string, refuses: boolean, notChecked: readonly ANotChecked[], find: (line: string, where: TheLine) => AHit[] }} APattern */

/** @param {string} text */
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every match of every pattern in one line.
 * @param {readonly RegExp[]} patterns
 * @param {string} line
 * @returns {AHit[]}
 */
function matchesIn(patterns, line) {
  /** @type {AHit[]} */
  const out = []
  for (const pattern of patterns) for (const hit of line.matchAll(pattern)) out.push({ at: hit.index ?? 0, words: hit[0] })
  return out
}

/** A name with no letter touching it on either side, so -home-x-, x_mac and x's are found and a longer word is not. */
function aNamePattern(/** @type {readonly string[]} */ names) {
  const longestFirst = [...names].sort((a, b) => b.length - a.length).map(escaped)
  return new RegExp(`(?<!\\p{L})(?:${longestFirst.join('|')})(?!\\p{L})`, 'giu')
}

/** The domains an example may use: example.* and its subdomains, *.example, *.invalid, *.test, *.local and *.localhost. */
function anExampleDomain(/** @type {string} */ address) {
  const labels = address.slice(address.indexOf('@') + 1).toLowerCase().split('.')
  return labels[0] === 'example' || labels.at(-2) === 'example' || ['example', 'invalid', 'test', 'local', 'localhost'].includes(labels.at(-1) ?? '')
}

const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/

/** The characters `\b` counts as a word's own. A word's edge is where none of them stands on that side. */
const A_WORD_CHARACTER = 'A-Za-z0-9_'

/**
 * One case-insensitive pattern, as text, that finds any of `pieces` as a whole word, for RegExp. A piece that starts or
 * ends with a character outside a word, such as `.` or `+`, is found too. It is written here because P7 is built
 * here, and tests/the-names-the-gates-refuse.ts re-exports it.
 * @param {readonly string[]} pieces
 * @returns {string}
 */
export function aResearchWordsPattern(pieces) {
  return `(?<![${A_WORD_CHARACTER}])(${pieces.join('|')})(?![${A_WORD_CHARACTER}])`
}

/**
 * The same words as aResearchWordsPattern, as text for `git grep -Ei`, whose extended expressions have no look-arounds.
 * It matches the character beside each edge, or the line's start or end, so it finds the same lines.
 * @param {readonly string[]} pieces
 * @returns {string}
 */
export function aResearchWordsPatternForGitGrep(pieces) {
  return `(^|[^${A_WORD_CHARACTER}])(${pieces.join('|')})($|[^${A_WORD_CHARACTER}])`
}

/**
 * The patterns, made from the names, handles, machine names, ports and research words they look for, so a test can make
 * them from invented ones. An empty list builds no pattern, because an empty alternation would match everywhere. The
 * part of a pattern that needs that list is not looked for, and the pattern names the part in `notChecked`, with
 * `notReadBecause` as the reason. A list that is not given is empty, so no caller is given a real list it did not ask
 * for. A machine name is found inside a longer word too, as a port and a handle are not.
 * @param {{ names: readonly string[], realName: RegExp | null, handles: readonly string[], machines?: readonly string[], ports?: readonly number[], researchWords?: readonly string[], notReadBecause?: string }} who
 *   `researchWords` are pieces, as aResearchWordsPattern above takes them
 * @returns {readonly APattern[]}
 */
export function thePatterns({ names, realName, handles, machines = [], ports = [], researchWords = [], notReadBecause = 'The patterns were made without a list for it.' }) {
  /** @param {readonly unknown[]} list @param {string} what @returns {ANotChecked[]} */
  const unless = (list, what) => (list.length === 0 ? [{ what, why: notReadBecause }] : [])
  const theNames = names.length === 0 ? [] : [aNamePattern(names)]
  const P1 = realName === null ? theNames : [...theNames, new RegExp(realName.source, 'gi')]
  const theMachines = machines.length === 0 ? [] : [new RegExp(machines.map(escaped).join('|'), 'gi')]
  const thePorts = ports.length === 0 ? [] : [new RegExp(`\\b(?:${ports.map(String).join('|')})\\b`, 'g')]
  const theHandles = handles.length === 0 ? [] : [new RegExp(`\\b(?:${handles.map(escaped).join('|')})\\b`, 'gi')]
  const theResearchWords = researchWords.length === 0 ? [] : [new RegExp(aResearchWordsPattern(researchWords), 'gi')]
  const recordId = LEAK_SHAPES.find((shape) => shape.kind === 'a record id')
  if (recordId === undefined) throw new Error("tools/screen-leaks.mjs has no shape for 'a record id', which P10 reads.")
  const possessive = `(?:his|the owner'?s${names.length === 0 ? '' : `|(?:${names.map(escaped).join('|')})'?s`})`
  return Object.freeze([
    {
      id: 'P1',
      says: 'a name or account of the owner',
      refuses: true,
      notChecked: [...unless(names, "the owner's names"), ...(realName === null ? [{ what: "the owner's real name", why: notReadBecause }] : [])],
      find: (line) => matchesIn(P1, line),
    },
    {
      id: 'P2',
      says: "a home folder or the owner's folder layout",
      refuses: true,
      notChecked: [],
      find: (line) => matchesIn([/(?<![\w.~-])(?:\/home|\/Users)\/[\w.-]+|\b[A-Za-z]:\\Users\\[\w.-]+|(?<!\bdata)-home-[a-z0-9]+-|~\/(?:PROJECTS|test_claude)\b/g], line),
    },
    {
      id: 'P3',
      says: 'an email address outside the example domains',
      refuses: true,
      notChecked: [],
      find: (line) => matchesIn([/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g], line).filter((hit) => !anExampleDomain(hit.words)),
    },
    {
      id: 'P4',
      says: 'a private-network address or a machine name of the owner',
      refuses: true,
      notChecked: unless(machines, "the owner's machine names"),
      find: (line) => matchesIn([/\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b|\b[\w-]+\.ts\.net\b|\btail[0-9a-f]{6}\b/g, ...theMachines], line),
    },
    {
      id: 'P5',
      says: "the port of the owner's own office",
      refuses: true,
      notChecked: unless(ports, "the port of the owner's own office"),
      find: (line) => matchesIn(thePorts, line),
    },
    {
      id: 'P6',
      says: 'an agent handle of the office this product is built in',
      refuses: false,
      notChecked: unless(handles, 'the agent handles'),
      find: (line) => matchesIn(theHandles, line),
    },
    {
      id: 'P7',
      says: "a word of the owner's research",
      refuses: true,
      notChecked: unless(researchWords, "the owner's research words"),
      find: (line) => matchesIn(theResearchWords, line),
    },
    {
      id: 'P8',
      says: 'Chinese in a comment, a Markdown line or a JSON value',
      refuses: false,
      notChecked: [],
      find: (line, where) => {
        const hits = matchesIn([/\p{Script=Han}+/gu], line)
        if (where.file.endsWith('.md')) return hits
        if (where.file.endsWith('.json')) return /^\s*"zh"\s*:/.test(line) ? [] : hits
        if (CODE.test(where.file)) return hits.filter((hit) => where.inAComment(hit.at))
        return []
      },
    },
    {
      id: 'P9',
      says: "the owner's words or decisions, quoted or told",
      refuses: false,
      notChecked: unless(names, "the owner's words or decisions told with the owner's name"),
      find: (line) =>
        matchesIn(
          [
            new RegExp(
              `\\b${possessive}\\s+(?:own\\s+)?(?:words?|decisions?|messages?|rulings?|instructions?|answers?|requests?|choices?)\\b|\\b(?:he|the owner)\\s+(?:said|wrote|asked|decided|chose|refused|answered)\\b`,
              'gi',
            ),
          ],
          line,
        ),
    },
    { id: 'P10', says: 'a record id', refuses: false, notChecked: [], find: (line) => matchesIn([recordId.pattern], line) },
    {
      id: 'P11',
      says: 'a session id',
      refuses: false,
      notChecked: [],
      find: (line) =>
        /session|\.jsonl|claude/i.test(line) ? matchesIn([/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g], line) : [],
    },
  ])
}

/**
 * WHAT THE PATTERNS DID NOT LOOK FOR, each part with the pattern it belongs to and the reason.
 * @param {readonly APattern[]} patterns
 * @returns {{ pattern: string, what: string, why: string }[]}
 */
export const theUncheckedIn = (patterns) => patterns.flatMap((pattern) => pattern.notChecked.map((one) => ({ pattern: pattern.id, ...one })))

/**
 * WHAT WAS NOT LOOKED FOR, one sentence for each reason, or null when everything was. A gate or a scanner says it beside
 * its verdict, so that a pass is never read as covering a pattern that did not run.
 * @param {readonly { pattern: string, what: string, why: string }[]} unchecked
 */
export function theUncheckedSaid(unchecked) {
  if (unchecked.length === 0) return null
  /** @type {Map<string, string[]>} */
  const byWhy = new Map()
  for (const one of unchecked) byWhy.set(one.why, [...(byWhy.get(one.why) ?? []), `${one.what} (${one.pattern})`])
  return [...byWhy]
    .map(([why, parts]) => `Not looked for, so not passed: ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}. ${why}`)
    .join(' ')
}

/**
 * THE PATTERNS A CALLER GETS WHEN IT GIVES NONE: made from no list, so each part that needs the file of the owner's
 * content is not looked for, and the screen says so beside its verdict. It is never read as a check of those parts.
 */
const WITHOUT_THE_CALLERS_PATTERNS = thePatterns({
  names: [],
  realName: null,
  handles: [],
  notReadBecause:
    "The gate was given no patterns, so none was made from the file of the owner's content; tests/the-owners-content-patterns.ts makes them, and integrate gets them through arguments.mjs.",
})

/**
 * Git's output as text. It never starts git's automatic housekeeping, and a failure is thrown, never read as nothing.
 * @param {string} repo
 * @param {readonly string[]} args
 */
export function gitText(repo, args) {
  const env = { ...process.env }
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY']) delete env[name]
  const result = spawnSync('git', ['-c', 'gc.auto=0', '-C', repo, ...args], { env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${repo} exited ${String(result.status)}: ${String(result.stderr ?? result.error ?? '').trim().slice(-1500)}`)
  return result.stdout
}

/**
 * The lines one file's diff adds, with their numbers in the new file.
 * @param {string} diff the output of `git diff --unified=0` for one file
 * @returns {{ number: number, text: string }[]}
 */
export function theAddedLines(diff) {
  /** @type {{ number: number, text: string }[]} */
  const out = []
  let next = null
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk !== null) {
      next = Number(hunk[1])
      continue
    }
    // Before the first hunk is the file's header, whose +++ line is not an added line.
    if (next === null) continue
    if (line.startsWith('+')) {
      out.push({ number: next, text: line.slice(1) })
      next += 1
    }
  }
  return out
}

/**
 * @typedef {{ file: string, line: number, pattern: string, says: string, words: string }} AFinding
 * @typedef {AFinding & { key: string, why: string }} ALetThrough
 * @typedef {{
 *   base: string, head: string,
 *   read: { files: number, lines: number, notText: string[] },
 *   refused: AFinding[], reminded: AFinding[], letThrough: ALetThrough[],
 *   newFiles: { refused: string[], letThrough: { file: string, why: string }[] },
 *   unchecked: { pattern: string, what: string, why: string }[],
 * }} TheScreen
 */

/**
 * SCREEN THE LINES AN ENTRY ADDS in the paths that ship: `git diff main...entry`, without renames.
 * @param {{ repo: string, base: string, head: string, patterns?: readonly APattern[], allowed?: readonly import('./owner-content-allowed.mjs').AnAllowance[], newFilesThatMayShip?: readonly { file: string, why: string }[] }} what
 * @returns {TheScreen}
 */
export function screenTheAddedLines({ repo, base, head, patterns = WITHOUT_THE_CALLERS_PATTERNS, allowed = ALLOWED, newFilesThatMayShip = NEW_FILES_THAT_MAY_SHIP }) {
  const range = `${base}...${head}`
  const named = gitText(repo, ['diff', '--name-status', '-z', '--no-renames', range, '--', ...THE_PATHS_THAT_SHIP.map((path) => `:(literal)${path}`)])
  const parts = named.split('\0')
  /** @type {{ status: string, file: string }[]} */
  const changed = []
  for (let i = 0; i + 1 < parts.length; i += 2) changed.push({ status: parts[i] ?? '', file: parts[i + 1] ?? '' })

  /** @type {TheScreen} */
  const screen = { base, head, read: { files: 0, lines: 0, notText: [] }, refused: [], reminded: [], letThrough: [], newFiles: { refused: [], letThrough: [] }, unchecked: theUncheckedIn(patterns) }
  for (const { status, file } of changed) {
    if (status === 'A' && FOLDERS_THAT_SHIP_AS_WRITTEN.some((folder) => file.startsWith(folder))) {
      const listed = newFilesThatMayShip.find((one) => one.file === file)
      if (listed === undefined) screen.newFiles.refused.push(file)
      else screen.newFiles.letThrough.push({ file, why: listed.why })
    }
    if (status === 'D') continue
    const diff = gitText(repo, ['diff', '--unified=0', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', range, '--', `:(literal)${file}`])
    const added = theAddedLines(diff)
    screen.read.files += 1
    screen.read.lines += added.length
    if (added.length === 0 && /^Binary files /m.test(diff)) screen.read.notText.push(file)

    // THE COMMENTS OF THE FILE AS THE ENTRY LEAVES IT, read only when an added line of code holds Chinese.
    /** @type {{ starts: number[], comments: { at: number, end: number }[] } | null} */
    let source = null
    const inAComment = (/** @type {number} */ lineNumber) => (/** @type {number} */ at) => {
      if (source === null) {
        const text = gitText(repo, ['show', `${head}:${file}`])
        const starts = [0]
        for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1)
        source = { starts, comments: piecesOf(text).filter((piece) => piece.what === 'comment') }
      }
      const position = (source.starts[lineNumber - 1] ?? 0) + at
      return source.comments.some((piece) => piece.at <= position && position < piece.end)
    }

    for (const { number, text } of added) {
      for (const one of theHitsOn(file, text, { patterns, allowed, inAComment: inAComment(number) })) {
        const finding = { file, line: number, pattern: one.pattern, says: one.says, words: one.words }
        if (one.allowedBy !== null) screen.letThrough.push({ ...finding, ...one.allowedBy })
        else if (one.refuses) screen.refused.push(finding)
        else screen.reminded.push(finding)
      }
    }
  }
  return screen
}

/**
 * WHAT THE PATTERNS FIND ON ONE LINE OF ONE FILE, and which entry of the allow-list, if any, lets each hit through.
 * @param {string} file
 * @param {string} line
 * @param {{ patterns?: readonly APattern[], allowed?: readonly import('./owner-content-allowed.mjs').AnAllowance[], inAComment?: (at: number) => boolean }} [how]
 * @returns {{ pattern: string, says: string, refuses: boolean, words: string, allowedBy: { key: string, why: string } | null }[]}
 */
export function theHitsOn(file, line, { patterns = WITHOUT_THE_CALLERS_PATTERNS, allowed = ALLOWED, inAComment = () => false } = {}) {
  return patterns.flatMap((pattern) =>
    pattern.find(line, { file, inAComment }).map((hit) => {
      const allowance = allowed.find((one) => one.file === file && one.patterns.includes(pattern.id) && covers(line, one.text, hit))
      return { pattern: pattern.id, says: pattern.says, refuses: pattern.refuses, words: hit.words, allowedBy: allowance === undefined ? null : { key: allowance.key, why: allowance.why } }
    }),
  )
}

/**
 * Whether one occurrence of `text` on the line holds the whole hit.
 * @param {string} line
 * @param {string} text
 * @param {AHit} hit
 */
function covers(line, text, hit) {
  if (text === '') return false
  for (let at = line.indexOf(text); at !== -1; at = line.indexOf(text, at + 1)) {
    if (at <= hit.at && hit.at + hit.words.length <= at + text.length) return true
  }
  return false
}

/** @param {AFinding} one */
const aFindingSaid = (one) => `${one.file} line ${String(one.line)}, ${one.pattern} (${one.says}): "${one.words}"`

/**
 * EACH HIT THE GATE REFUSES AT BLOCK, the added lines and then the new files, or null when there is none.
 * @param {TheScreen} screen
 */
function theRefusedHitsSaid(screen) {
  const { refused } = screen
  const newFiles = screen.newFiles.refused
  if (refused.length === 0 && newFiles.length === 0) return null
  const lines =
    refused.length === 0
      ? ''
      : ` ${String(refused.length)} added line hit${refused.length === 1 ? '' : 's'} in files that ship: ${refused.map(aFindingSaid).join('; ')}.`
  const files =
    newFiles.length === 0
      ? ''
      : ` ${String(newFiles.length)} new file${newFiles.length === 1 ? '' : 's'} under ${FOLDERS_THAT_SHIP_AS_WRITTEN.join(' or ')}, which ship as written, not named on the list of new files that may ship: ${newFiles.join(', ')}.`
  return `${lines}${files}`
}

/**
 * WHY THE GATE REFUSES, for the guard's detail, or null when it does not.
 * @param {TheScreen} screen
 */
export function theRefusalSaid(screen) {
  const hits = theRefusedHitsSaid(screen)
  if (hits === null) return null
  return `The entry adds owner content to what ships, and the merge queue refuses it (the owner-content rule).${hits} Only lines the entry adds were read. A true exception goes on tools/merge-tool/owner-content-allowed.mjs with its reason.`
}

/**
 * WHAT THE GATE LET THROUGH AT OFF (wave 13r round L), for the entry's log and its tested step, or null when it found
 * nothing it refuses at block.
 * @param {TheScreen} screen
 */
export function theLetThroughAtOffSaid(screen) {
  const hits = theRefusedHitsSaid(screen)
  if (hits === null) return null
  return `The entry adds owner content to what ships. The owner-content-in-what-ships gate is at off, so the merge queue let the entry go on, and this content ships when it lands.${hits}`
}

/**
 * THE REMINDERS, for the entry's log and its tested step, or null when there are none. Each pattern is counted, with its
 * first three hits; every hit is in the gate's log.
 * @param {TheScreen} screen
 * @param {string} log
 */
export function theRemindersSaid(screen, log) {
  if (screen.reminded.length === 0) return null
  /** @type {Map<string, AFinding[]>} */
  const byPattern = new Map()
  for (const one of screen.reminded) byPattern.set(one.pattern, [...(byPattern.get(one.pattern) ?? []), one])
  const each = [...byPattern.values()].map((hits) => {
    const first = hits[0]
    if (first === undefined) return ''
    const shown = hits.slice(0, 3).map((one) => `${one.file} line ${String(one.line)} "${one.words}"`).join(', ')
    return `${first.pattern} (${first.says}) ${String(hits.length)}: ${shown}${hits.length > 3 ? ', and more' : ''}`
  })
  return `Owner-content reminders, which never refuse: ${String(screen.reminded.length)} on lines this entry adds to what ships. ${each.join('; ')}. Every one is in ${log}.`
}

/**
 * THE REMINDERS AS FACTS, for the integrated step (wave 13v round 31). The office keeps them on the entry's integration
 * and, at landing, on `data.integrated` (`OwnerContentReminders` in src/shared/merge-queue.ts). `reminded` 0 says the
 * gate read the entry and named nothing.
 * @param {TheScreen} screen
 * @param {string} log
 * @returns {{ reminded: number, byPattern: Record<string, number>, says?: string, log: string }}
 */
export function theRemindersFacts(screen, log) {
  /** @type {Record<string, number>} */
  const byPattern = {}
  for (const one of screen.reminded) byPattern[one.pattern] = (byPattern[one.pattern] ?? 0) + 1
  const says = theRemindersSaid(screen, log)
  return { reminded: screen.reminded.length, byPattern, ...(says === null ? {} : { says }), log }
}

/**
 * ONE LINE FOR THE ENTRY'S LOG: what was read, what was let through and by which entry of the allow-list, and what was
 * not looked for.
 * @param {TheScreen} screen
 */
export function theScreenSaid(screen) {
  const read = `the owner-content gate read ${String(screen.read.lines)} added line${screen.read.lines === 1 ? '' : 's'} in ${String(screen.read.files)} file${screen.read.files === 1 ? ' that ships' : 's that ship'}, ${screen.base.slice(0, 12)}...${screen.head.slice(0, 12)}`
  const notText = screen.read.notText.length === 0 ? '' : `; not text, so no line was read: ${screen.read.notText.join(', ')}`
  const through = screen.letThrough.map((one) => `${aFindingSaid(one)} let through by the entry "${one.key}" of tools/merge-tool/owner-content-allowed.mjs: ${one.why}`)
  const files = screen.newFiles.letThrough.map((one) => `new file ${one.file} let through by its entry on the list of new files that may ship: ${one.why}`)
  const verdict = `${String(screen.refused.length + screen.newFiles.refused.length)} refused, ${String(screen.reminded.length)} reminded, ${String(screen.letThrough.length + screen.newFiles.letThrough.length)} let through`
  const unchecked = theUncheckedSaid(screen.unchecked)
  return `${read}${notText}: ${verdict}${[...through, ...files].length === 0 ? '' : `. ${[...through, ...files].join('; ')}`}.${unchecked === null ? '' : ` ${unchecked}`}`
}
