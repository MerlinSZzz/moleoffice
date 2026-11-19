// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CONFLICTS WHERE BOTH SIDES ONLY ADDED ARE JOINED (wave 13v round 22; tier 1 of the list-join rule, wave 13p). From 8
 * October the office sent 38 "Bounced (conflict)" messages, and many of them name a file that is a list: two rounds each
 * added an entry at the same place, removed nothing and changed nothing, and git stopped because the two additions
 * touch. This joins them, as journal-join.mjs joins the migration journal. On 15 October two more bounced that the list
 * rule did not take: a merge entry where main added a name to an import line of src/server/lib/messages.ts
 * and the entry added an import line above it, and another merge entry where both added a key to
 * src/shared/words/zh-made-from.ts.
 *
 * HOW: a git merge driver, written into the entry's integration clone alone (its .git/config and .git/info/attributes),
 * never into the owner's repository, for the files howAFileJoins names and no other. git calls it for each replayed
 * commit that changed one of them on both sides. It runs git's own three-way merge (`git merge-file --diff3`), so every
 * part git merges by itself is git's. Only a conflicting hunk is looked at, and one of four rules (THE_RULES) joins it:
 *
 * - TWO ADDITIONS AT ONE PLACE, in a list file, when the ancestor's part of the hunk is empty: main's added lines are kept
 *   first and then the entry's; a line both sides added is kept once, when it is a whole entry of the list (at the hunk's
 *   outer indent, with its brackets closed). Two definitions of one name are refused.
 * - THE WHOLE-LINE CHECK, in a list file, when the ancestor had lines there: each side must still hold every one of them,
 *   unchanged and in order, with its new lines only between them. The new lines at each place are joined as above.
 *   In both of these list rules, each side's new lines at one place must close every bracket they open and open every
 *   bracket they close (wave 13u round 62). Git's diff may lay a new block's closing line against an old block's: main
 *   added a column and a new table after it, and its added lines were the column, the old table's closing line and the
 *   new table's head. The entry's column, put after them, landed in main's new table, and nothing went red.
 * - IMPORT WIDENING, in any code file (CODE_FILE_ENDINGS), when every line of the hunk, in all three parts, is a one-line
 *   import. A side's line still counts as the ancestor's when it is that import with names added: the same module, the
 *   same form, and every name still written as it was. When both sides widened one line, the joined line is main's, byte
 *   for byte, with the entry's new names put before its closing brace in the entry's order. A multi-line import, a removed
 *   or renamed name, a changed module and a name the two sides import from different modules are refused.
 * - KEY ORDER, in src/shared/words/zh-made-from.ts, which scripts/chinese-made-from.ts writes with its keys sorted: the
 *   whole-line check, and then the new lines go in key order. A key both added with one value is kept once. Two values,
 *   or a result not strictly in key order, are refused.
 *
 * Anything else is refused: git's conflict stands, the rebase stops, the entry bounces as before, and the refusal
 * sentence names the file, the line and the rule.
 *
 * A join is not a pass. The joined tree is built, checked and tested as every replayed tree is, so a join that breaks
 * the code is red and bounces. The joined file is not what the verdict read, so the office judges it again by file.
 *
 * Usage, by git: node list-join.mjs <ancestor> <ours, written over> <theirs> <the clone's .git> <path>
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * THE LIST FILES, each with why entries there are only added. The code files among them (schema.ts, the two index.ts, the
 * two kinds.ts and kind-fields/parts.ts) are joined only where both sides added whole lines, which in them is a new table,
 * column, route, kind or re-export beside another, and where each side's added lines close their own brackets, so a block
 * of several lines joins whole.
 * A file the tree does not hold yet says which round makes it (comesWith). Git asks the driver only about a file both
 * sides changed, so an entry that makes it lands it as written.
 */
export const THE_LIST_FILES = [
  { path: 'src/shared/refusal-codes.ts', why: 'each wave adds its refusal codes as new keys of the code maps' },
  { path: 'src/server/lib/notices.ts', why: 'each new notice is one more entry in the list of notice kinds' },
  { path: 'src/shared/ops.ts', why: 'each new operation is one more entry in the operation vocabulary' },
  { path: 'src/shared/ops-list.ts', why: 'one operation name per line, which a new door only adds' },
  { path: 'src/server/routes-list.ts', why: 'one route group per line, which a new door only adds' },
  { path: 'src/shared/addresses.ts', why: 'each new page is one more address in the list of addresses' },
  { path: 'src/shared/sections.ts', why: 'each new part of a record page is one more declared section' },
  { path: 'src/server/api/kinds.ts', why: 'each new kind or endpoint is one more entry in the discovery lists' },
  { path: 'src/shared/words/en.ts', why: 'each new sentence is one more word key' },
  { path: 'src/shared/words/zh.ts', why: 'each new sentence is one more word key, as in en.ts' },
  { path: 'src/server/db/schema.ts', why: 'each new table or column is added beside the others' },
  { path: 'src/server/db/schema-parts/index.ts', comesWith: 'the change that splits the schema into part files makes it', why: 'one line for each part file of the schema, which a new part only adds' },
  { path: 'src/server/index.ts', why: 'each new route group is one more registration in the route list' },
  { path: 'src/shared/words/zh-made-from.ts', keyOrder: true, why: 'each translation round adds the keys it translated, and scripts/chinese-made-from.ts writes them in key order' },
  { path: 'tests/house-rules.mjs', why: 'each new house-rule test is one more line in the list of house-rule tests' },
  { path: 'src/shared/kinds.ts', why: 'each new kind or shape is one more line in the table of kinds, beside the others' },
  { path: 'src/shared/kind-fields/parts.ts', why: 'each line that adds fields to a shared kind adds one re-export line for its own file' },
  { path: 'src/shared/surfaces.ts', why: 'each new part of the screen a person can point at is one more named surface' },
  { path: 'tests/how-long-a-test-may-take.ts', why: 'each new helper that starts a process or a server is one more line in the list of starters' },
  { path: 'tests/the-test-lists.ts', why: 'each new key form or test that walks the tree is one more entry in its list' },
]

/** The endings of the code files where a hunk made wholly of one-line imports is joined (the import-join rule, Q1). */
export const CODE_FILE_ENDINGS = ['.ts', '.tsx', '.mjs', '.js', '.cjs']

/** The four rules, by the names the refusals and the pin's log give them. */
export const THE_RULES = { added: 'two additions at one place', wholeLine: 'the whole-line check', imports: 'import widening', keyOrder: 'key order' }

export const LIST_JOIN_DRIVER = 'mole-office-list-join'
/** Where the driver says, in the clone's .git, what it joined and what it refused. */
export const LIST_JOINS_SAID = 'mole-office-list-joins.log'
export const LIST_JOIN_REFUSED = 'mole-office-list-join.refused'

/**
 * HOW THE DRIVER MAY JOIN A PATH: 'list' for a list file, 'key order' for the one kept in key order, 'imports' for any
 * other code file, where only a hunk of one-line imports is joined, and null for a path it never joins.
 */
export function howAFileJoins(path) {
  const listed = THE_LIST_FILES.find((one) => one.path === path)
  if (listed !== undefined) return listed.keyOrder === true ? 'key order' : 'list'
  return isCode(path) ? 'imports' : null
}

const isCode = (path) => CODE_FILE_ENDINGS.some((ending) => path.endsWith(ending))

const MARKER = 31
/** The four marker lines of the three-way merge below. The clean copy's places are read by them too (conflicted-file.mjs). */
export const OPEN = '<'.repeat(MARKER), BASE = '|'.repeat(MARKER), SPLIT = '='.repeat(MARKER), CLOSE = '>'.repeat(MARKER)
const quoted = (word) => `'${word.replaceAll("'", `'\\''`)}'`
const shown = (line) => '`' + (line.trim().length > 80 ? line.trim().slice(0, 77) + '...' : line.trim()) + '`'
const counted = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`
const listed = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)
const notJoined = (path, at, rule, why) => ({ refused: `${path} at line ${at} was not joined by ${rule}: ${why}, so it was left to git.` })

/** The name a line of a list defines, or null when it defines none that this can read. */
export function theNameDefined(line) {
  const text = line.trim()
  const declared = /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(text)
  if (declared !== null) return declared[1]
  const key = /^(['"`])((?:\\.|(?!\1).)*)\1\s*:/.exec(text) ?? /^\[\s*([^\]]+?)\s*\]\s*:()/.exec(text)
  if (key !== null) return key[2] !== '' ? key[2] : key[1]
  const plain = /^([A-Za-z_$][\w$]*)\s*(?::|=(?![=>])|,\s*$)/.exec(text) ?? /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{\s*$/.exec(text)
  if (plain !== null && !['await', 'return', 'if', 'for', 'while', 'switch', 'case', 'default', 'import', 'export', 'new', 'throw'].includes(plain[1])) return plain[1]
  const member = /^(?:\|\s*)?(['"`])((?:\\.|(?!\1).)*)\1\s*,?\s*$/.exec(text)
  return member === null ? null : member[2]
}

/** A line with its strings emptied and its trailing comment cut off, so that only the brackets of its code are counted. */
const bareOf = (line) => line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '')

/** Whether a line opens and closes its own brackets, outside strings and a trailing comment. */
function closedOnItself(line) {
  let depth = 0
  for (const char of bareOf(line)) {
    if ('([{'.includes(char)) depth += 1
    else if (')]}'.includes(char)) depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

const indentOf = (line) => /^[ \t]*/.exec(line)[0].length

/**
 * WHERE A SIDE'S ADDED LINES AT ONE PLACE DO NOT CLOSE THEIR OWN BRACKETS: `{ closes }`, the first line that closes a
 * bracket they did not open; `{ open }`, the line that opened the first bracket they leave open; or null. A line that is
 * wholly a comment is not counted. A regular expression is read as code, so one with a bracket it does not pair is
 * refused here: that costs a join, never a wrong one.
 */
function theBracketLeftOver(lines) {
  let depth = 0, opened = null
  for (const line of lines) {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue
    for (const char of bareOf(line)) {
      if ('([{'.includes(char)) {
        if (depth === 0) opened = line
        depth += 1
      } else if (')]}'.includes(char)) depth -= 1
      if (depth < 0) return { closes: line }
    }
  }
  return depth === 0 ? null : { open: opened }
}

/**
 * A side's lines laid against the ancestor's: for each ancestor line the side's line that `keeps` it, and the side's new
 * lines at each place, before the first ancestor line and after each; or `lost`, the first ancestor line it did not keep.
 */
function laidAgainst(ancestor, side, keeps) {
  const kept = [], places = [[]]
  for (const line of side) {
    if (kept.length < ancestor.length && keeps(ancestor[kept.length], line)) {
      kept.push(line)
      places.push([])
    } else places[kept.length].push(line)
  }
  return kept.length < ancestor.length ? { lost: kept.length } : { kept, places }
}

/** Both sides laid against the ancestor, each line kept only as it was; or the refusal of the whole-line check. */
function bothLaid(path, at, { main, ancestor, entry }) {
  const sides = [['main', main], ['the entry', entry]].map(([who, lines]) => ({ who, ...laidAgainst(ancestor, lines, (was, line) => line === was) }))
  const lost = sides.find((side) => 'lost' in side)
  return lost === undefined ? sides : notJoined(path, at, THE_RULES.wholeLine, `${lost.who} removed or changed the line ${shown(ancestor[lost.lost])}`)
}

/** The lines both sides added at one place, main's first and a whole entry both added once; or two definitions of one name. */
function joinTheAdded(main, entry) {
  const filled = [...main, ...entry].filter((line) => line.trim() !== '')
  const outer = filled.length === 0 ? 0 : Math.min(...filled.map(indentOf))
  const outerAt = (side, i) => side[i].trim() !== '' && indentOf(side[i]) === outer
  // A whole entry is one outer line that closes its own brackets and has no deeper line after it.
  const wholeAt = (side, i) => outerAt(side, i) && closedOnItself(side[i]) && !(i + 1 < side.length && side[i + 1].trim() !== '' && indentOf(side[i + 1]) > outer)
  const mainNames = new Map()
  main.forEach((line, i) => {
    const name = outerAt(main, i) ? theNameDefined(line) : null
    if (name !== null) mainNames.set(name, { line, whole: wholeAt(main, i) })
  })
  const kept = []
  let once = 0
  for (const [i, line] of entry.entries()) {
    const name = outerAt(entry, i) ? theNameDefined(line) : null
    const mains = name === null ? undefined : mainNames.get(name)
    if (mains !== undefined && (mains.line.trimEnd() !== line.trimEnd() || !mains.whole || !wholeAt(entry, i))) return { twice: { name, main: mains.line, entry: line } }
    if (wholeAt(entry, i) && main.some((other, j) => wholeAt(main, j) && other.trimEnd() === line.trimEnd())) {
      once += 1
      continue
    }
    kept.push(line)
  }
  return { lines: [...main, ...kept], kept: kept.length, once }
}

/** A hunk of a list file: two additions at one place, or the whole-line check and then the additions at each place. */
function joinTheList(path, at, parts) {
  const sides = bothLaid(path, at, parts)
  if ('refused' in sides) return sides
  const [mains, entries] = sides
  const { ancestor } = parts
  const rule = ancestor.length === 0 ? THE_RULES.added : THE_RULES.wholeLine
  for (const side of sides) {
    for (const added of side.places) {
      const over = theBracketLeftOver(added)
      if (over === null) continue
      const what = 'closes' in over ? `close a bracket they did not open, at ${shown(over.closes)}` : `leave a bracket open, from ${shown(over.open)}`
      return notJoined(path, at, rule, `${side.who}'s added lines ${what}; a join there could put the other side's lines inside another entry`)
    }
  }
  const lines = []
  let kept = 0, once = 0
  for (let place = 0; place <= ancestor.length; place += 1) {
    const joined = joinTheAdded(mains.places[place], entries.places[place])
    if ('twice' in joined) return notJoined(path, at, rule, `main added ${shown(joined.twice.main)} and the entry added ${shown(joined.twice.entry)}, two definitions of ${shown(joined.twice.name)}`)
    lines.push(...joined.lines, ...(place < ancestor.length ? [ancestor[place]] : []))
    kept += joined.kept
    once += joined.once
  }
  const added = mains.places.flat().length
  const bothOnce = once > 0 ? `, ${once} that both added kept once` : ''
  return {
    lines,
    rule,
    said: ancestor.length === 0
      ? `${path} at line ${at}: main's ${added} added ${added === 1 ? 'line' : 'lines'} and then the entry's ${kept}${bothOnce}`
      : `${path} at line ${at}: both sides only added. Main added ${counted(added, 'line')} and the entry ${entries.places.flat().length}, and both kept the ancestor's ${counted(ancestor.length, 'line')} there as ${ancestor.length === 1 ? 'it was' : 'they were'}. Kept: main's lines before the entry's at each place${bothOnce}.`,
  }
}

const ONE_LINE_IMPORT = /^import\s+(type\s+)?(.+?)\s+from\s*(['"])([^'"]+)\3\s*;?\s*$/
const BARE_IMPORT = /^import\s*(['"])([^'"]+)\1\s*;?\s*$/
const IMPORT_CLAUSE = /^(?:([A-Za-z_$][\w$]*)\s*(?:,\s*|$))?(?:\{([^{}]*)\}|\*\s*as\s+([A-Za-z_$][\w$]*))?$/

/** A one-line import read into its form, its default or namespace part, its names and its module; or null when the line is not one. */
export function theImport(line) {
  const bare = BARE_IMPORT.exec(line)
  if (bare !== null) return { line, form: 'import', head: '', names: null, module: bare[2] }
  const full = ONE_LINE_IMPORT.exec(line)
  const clause = full === null ? null : IMPORT_CLAUSE.exec(full[2].trim())
  if (clause === null || clause[0] === '') return null
  return {
    line,
    form: full[1] === undefined ? 'import' : 'import type',
    head: [clause[1], clause[3] === undefined ? undefined : `* as ${clause[3]}`].filter(Boolean).join(', '),
    names: clause[2] === undefined ? null : clause[2].split(',').map((name) => name.trim().replace(/\s+/g, ' ')).filter((name) => name !== ''),
    module: full[4],
  }
}

/** The local names an import binds: `type X` binds X, and `X as Y` binds Y. */
const theNamesBound = (one) => [...(one.head === '' ? [] : one.head.split(', ')), ...(one.names ?? [])].map((name) => name.replace(/^(?:type|\*)\s+/, '').split(/\s+as\s+/).at(-1))

/** The names `one` adds to the ancestor's import `was`, when it is that import made wider; otherwise null. */
function namesAdded(was, one) {
  if (one.module !== was.module || one.form !== was.form || one.head !== was.head || was.names === null || one.names === null) return null
  if (!was.names.every((name) => one.names.includes(name))) return null
  const added = one.names.filter((name) => !was.names.includes(name))
  return added.length > 0 ? added : null
}

/** Why a side's import lines do not keep the ancestor's import line `was`. */
function whyNotKept(who, was, side) {
  if (side.some((one) => one.line === was.line)) return `${who} moved the import line ${shown(was.line)}`
  const changed = side.find((one) => one.module === was.module) ?? side.find((one) => theNamesBound(one).some((name) => theNamesBound(was).includes(name)))
  if (changed === undefined) return `${who} removed the import line ${shown(was.line)}`
  const missing = was.names === null || changed.names === null ? [] : was.names.filter((name) => !changed.names.includes(name))
  const because = changed.module !== was.module ? `it imports from '${changed.module}', not '${was.module}'`
    : changed.form !== was.form || changed.head !== was.head || (was.names === null) !== (changed.names === null) ? 'it is not the same form of import'
    : missing.length > 0 ? `it no longer has ${listed(missing)}`
    : 'it adds no name'
  return `${who} changed the line ${shown(was.line)} to ${shown(changed.line)}, which is not names added to the same import: ${because}`
}

/** Main's import line, byte for byte, with `names` put before its closing brace (the import-join rule, Q3). */
function withNamesAdded(line, names) {
  const close = line.lastIndexOf('}')
  const before = line.slice(0, close).trimEnd()
  return `${before}${before.endsWith(',') || before.endsWith('{') ? ' ' : ', '}${names.join(', ')}${before.endsWith(',') ? ',' : ''}${line.slice(before.length)}`
}

/** How the import sentence names what was kept, one or several in a row. */
const KEPT_SAID = {
  main: ["main's line", (n) => `main's ${n} lines`],
  entry: ["the entry's line", (n) => `the entry's ${n} lines`],
  kept: ['the line both kept', (n) => `the ${n} lines both kept`],
  mainWider: ["main's wider line", (n) => `main's ${n} wider lines`],
  entryWider: ["the entry's wider line", (n) => `the entry's ${n} wider lines`],
  bothWider: ["main's wider line, which holds the entry's names too", (n) => `main's ${n} wider lines, which hold the entry's names too`],
  joinedWider: ["main's wider line with the entry's names added", (n) => `main's ${n} wider lines with the entry's names added`],
}

/** A hunk made wholly of one-line imports, joined by import widening (the import-join rule, Q1 and Q3). */
function joinTheImports(path, at, parts) {
  const [main, ancestor, entry] = [parts.main, parts.ancestor, parts.entry].map((lines) => lines.map(theImport))
  const keeps = (was, one) => one.line === was.line || namesAdded(was, one) !== null
  const sides = [['main', main], ['the entry', entry]].map(([who, side]) => ({ who, side, ...laidAgainst(ancestor, side, keeps) }))
  const lost = sides.find((one) => 'lost' in one)
  if (lost !== undefined) return notJoined(path, at, THE_RULES.imports, whyNotKept(lost.who, ancestor[lost.lost], lost.side))
  const [mains, entries] = sides
  const out = []
  let once = 0
  for (let place = 0; place <= ancestor.length; place += 1) {
    out.push(...mains.places[place].map((one) => ({ one, from: 'main' })))
    for (const one of entries.places[place]) {
      if (mains.places[place].some((other) => other.line === one.line)) once += 1
      else out.push({ one, from: 'entry' })
    }
    if (place === ancestor.length) break
    const [was, m, e] = [ancestor[place], mains.kept[place], entries.kept[place]]
    const more = e.line === was.line ? [] : e.names.filter((name) => !m.names.includes(name))
    out.push(
      m.line === was.line && e.line === was.line ? { one: was, from: 'kept' }
      : e.line === was.line ? { one: m, from: 'mainWider' }
      : m.line === was.line ? { one: e, from: 'entryWider' }
      : more.length === 0 ? { one: m, from: 'bothWider' }
      : { one: theImport(withNamesAdded(m.line, more)), from: 'joinedWider' },
    )
  }
  const bound = new Map()
  for (const { one } of out) {
    for (const name of theNamesBound(one)) {
      const other = bound.get(name)
      if (other !== undefined && other !== one) return notJoined(path, at, THE_RULES.imports, other.module === one.module ? `the name ${name} would be imported twice from '${one.module}'` : `the name ${name} would be imported from two modules, '${other.module}' and '${one.module}'`)
      bound.set(name, one)
    }
  }
  const named = new Set()
  const whatItDid = ({ kept, places }) => {
    const did = []
    kept.forEach((one, place) => {
      const added = namesAdded(ancestor[place], one)
      if (added === null) return
      did.push(`added the ${added.length === 1 ? 'name' : 'names'} ${listed(added)} to the import from '${ancestor[place].module}'`)
      named.add(place)
    })
    const fresh = places.flat().length
    const where = ancestor.length === 0 ? ''
      : ancestor.length > 1 ? ` among the ${ancestor.length} import lines both kept`
      : ` ${places[0].length > 0 && places[1].length > 0 ? 'above and below' : places[0].length > 0 ? 'above' : 'below'} ${named.has(0) ? 'it' : `the import from '${ancestor[0].module}'`}`
    if (fresh > 0) did.push(`added ${counted(fresh, 'import line')}${where}`)
    return did.length === 0 ? 'kept its lines as they were' : did.join(' and ')
  }
  const runs = []
  for (const { from } of out) {
    if (runs.at(-1)?.from === from) runs.at(-1).n += 1
    else runs.push({ from, n: 1 })
  }
  const kept = runs.map(({ from, n }) => (n === 1 ? KEPT_SAID[from][0] : KEPT_SAID[from][1](n))).join(', then ')
  return {
    lines: out.map(({ one }) => one.line),
    rule: THE_RULES.imports,
    said: `${path} at line ${at}: both sides only added. Main ${whatItDid(mains)}; the entry ${whatItDid(entries)}. Kept: ${kept}${once > 0 ? `, and ${once} that both added kept once` : ''}.`,
  }
}

const KEY_LINE = /^\s*("(?:[^"\\]|\\.)*"): "(?:[^"\\]|\\.)*",$/
/** The key a line of zh-made-from.ts holds, or null when it is not a key and its value. */
const theKey = (line) => {
  const found = line === undefined ? null : KEY_LINE.exec(line)
  return found === null ? null : JSON.parse(found[1])
}

/** A hunk of the file kept in key order: the whole-line check, and then every key in key order, as theRecordAsText writes it. */
function joinInKeyOrder(path, at, parts, { before, after }) {
  const notAKey = [...parts.main, ...parts.ancestor, ...parts.entry].find((line) => theKey(line) === null)
  if (notAKey !== undefined) return notJoined(path, at, THE_RULES.keyOrder, `${notAKey.trim() === '' ? 'a blank line' : shown(notAKey)} is not a key and its value`)
  const sides = bothLaid(path, at, parts)
  if ('refused' in sides) return sides
  const byKey = new Map(parts.ancestor.map((line) => [theKey(line), { line, from: 'ancestor' }]))
  let once = 0
  for (const side of sides) {
    for (const line of side.places.flat()) {
      const there = byKey.get(theKey(line))
      if (there === undefined) byKey.set(theKey(line), { line, from: side.who })
      else if (there.from === 'ancestor') return notJoined(path, at, THE_RULES.keyOrder, `${side.who} added the key ${shown(JSON.stringify(theKey(line)))}, which the ancestor already holds`)
      else if (there.line !== line) return notJoined(path, at, THE_RULES.keyOrder, `both sides added the key ${shown(JSON.stringify(theKey(line)))} with different values`)
      else once += 1
    }
  }
  const lines = [...byKey.keys()].sort().map((key) => byKey.get(key).line)
  // EVERY SIDE'S ORDER IS KEPT: a side whose keys were not in order, or a neighbour out of order, is not sorted into it.
  for (const run of [parts.main, parts.entry, [before, ...lines, after].filter((line) => theKey(line) !== null)]) {
    const wrong = run.find((line, i) => i > 0 && !(theKey(run[i - 1]) < theKey(line)))
    if (wrong !== undefined) return notJoined(path, at, THE_RULES.keyOrder, `the keys would not be strictly in key order at ${shown(wrong)}`)
  }
  const [mains, entries] = sides.map((side) => side.places.flat().length)
  return {
    lines,
    rule: THE_RULES.keyOrder,
    said: `${path} at line ${at}: both sides only added. Main added ${counted(mains, 'key')} and the entry ${entries}${once > 0 ? `, ${once} that both added kept once` : ''}; they are put in key order, as scripts/chinese-made-from.ts writes the file.`,
  }
}

/**
 * One conflicting hunk joined, or the sentence saying why not. `main` and `entry` are the lines each side has where the
 * ancestor had `ancestor`. `at` is the hunk's first line in the merged file, counted from 1; `before` and `after` are the
 * lines around it there, which the key order reads.
 */
export function joinOneHunk(path, at, parts, around = {}) {
  const way = howAFileJoins(path)
  const lines = [...parts.main, ...parts.ancestor, ...parts.entry]
  if (way !== null && isCode(path) && lines.every((line) => theImport(line) !== null)) return joinTheImports(path, at, parts)
  if (way === 'key order') return joinInKeyOrder(path, at, parts, around)
  if (way === 'list') return joinTheList(path, at, parts)
  if (way === 'imports') {
    const other = lines.find((line) => theImport(line) === null)
    const what = other.trim() === '' ? 'a blank line, which is not a one-line import' : `${shown(other)}, which ${/^import\s+(?:type\s+)?\{[^}]*$/.test(other) ? 'begins an import written over more than one line' : 'is not a one-line import'}`
    return notJoined(path, at, THE_RULES.imports, `the hunk holds ${what}, and the file is not a list file`)
  }
  return { refused: `${path} at line ${at} was not joined: the merge driver has no rule for this file, so it was left to git.` }
}

/**
 * A three-way merge as git merge-file --diff3 wrote it, with every conflicting hunk joined, or the sentence of the first
 * hunk that was not. `rules` names the rules that joined them.
 * @returns {{ text: string, joined: string[], rules: string[] } | { refused: string }}
 */
export function joinTheConflicts(path, merged) {
  const lines = merged.split('\n')
  const out = []
  const joined = []
  const rules = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith(OPEN)) {
      out.push(lines[index])
      continue
    }
    const at = out.length + 1
    const parts = { main: [], ancestor: [], entry: [] }
    let part = 'main'
    index += 1
    for (; index < lines.length && !lines[index].startsWith(CLOSE); index += 1) {
      if (lines[index].startsWith(BASE)) part = 'ancestor'
      else if (lines[index] === SPLIT) part = 'entry'
      else parts[part].push(lines[index])
    }
    if (index >= lines.length) return { refused: `In ${path}, git's merge left a hunk at line ${at} with no end, so it was left to git.` }
    const one = joinOneHunk(path, at, parts, { before: out.at(-1), after: lines[index + 1] })
    if ('refused' in one) return one
    out.push(...one.lines)
    joined.push(one.said)
    rules.add(one.rule)
  }
  return { text: out.join('\n'), joined, rules: [...rules] }
}

/**
 * GIT'S THREE-WAY MERGE OF THREE FILES, main's side first, with the ancestor's lines between main's and the entry's in
 * each conflicting hunk. `{ text, conflicts }`, or the sentence of why git could not merge them. The driver joins what it
 * gives, and the clean copy shows the places it leaves (conflicted-file.mjs), so the two read one merge.
 */
export function theThreeWayMerge(path, ancestorFile, oursFile, theirsFile) {
  const merged = spawnSync('git', ['merge-file', '-p', '--diff3', `--marker-size=${MARKER}`, '-L', 'main', '-L', 'ancestor', '-L', 'entry', oursFile, ancestorFile, theirsFile], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (merged.error !== undefined || merged.status === null || merged.status > 127) {
    return { refused: `git merge-file could not merge ${path} (${merged.error?.message ?? (merged.stderr.trim() || `exit ${String(merged.status)}`)}), so it was left to git.` }
  }
  return { text: merged.stdout, conflicts: merged.status !== 0 }
}

/** The same merge of three texts, through files in a folder of its own that it removes. */
export function theThreeWayMergeOfTexts(path, ancestor, ours, theirs) {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-list-join-'))
  try {
    const [a, o, t] = [['ancestor', ancestor], ['main', ours], ['entry', theirs]].map(([name, text]) => {
      const file = join(folder, name)
      writeFileSync(file, text)
      return file
    })
    return theThreeWayMerge(path, a, o, t)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * That merge, then the join of its conflicting hunks. Every part of the file git merges by itself stays git's.
 * @param {ReturnType<typeof theThreeWayMerge>} merged
 * @returns {{ text: string, joined: string[], rules: string[] } | { refused: string }}
 */
function joinWhatItMerged(path, merged) {
  if ('refused' in merged) return merged
  return merged.conflicts ? joinTheConflicts(path, merged.text) : { text: merged.text, joined: [], rules: [] }
}

export function joinTheListFiles(path, ancestorFile, oursFile, theirsFile) {
  return joinWhatItMerged(path, theThreeWayMerge(path, ancestorFile, oursFile, theirsFile))
}

/** The same join of three texts. */
export function joinTheListTexts(path, ancestor, ours, theirs) {
  return joinWhatItMerged(path, theThreeWayMergeOfTexts(path, ancestor, ours, theirs))
}

/**
 * The command git runs for the driver in `clone`. It is made here alone: the clone is given it below, and the merge tool
 * compares what a clone's config holds with it before it runs git on the clone's files (what-a-clone-names.mjs).
 */
export function theListJoinCommand(clone) {
  return [process.execPath, fileURLToPath(import.meta.url), '%O', '%A', '%B', join(clone, '.git'), '%P'].map((word, i) => (i >= 2 && i <= 4 || i === 6 ? word : quoted(word))).join(' ')
}

/** Gives the integration clone the driver for each list file and each code file: its own config and attributes, nothing outside the clone. */
export function joinTheListsInThisClone(clone, setConfig) {
  const gitDir = join(clone, '.git')
  setConfig([`merge.${LIST_JOIN_DRIVER}.name`, 'joins conflicts where both sides only added (list-join.mjs)'])
  setConfig([`merge.${LIST_JOIN_DRIVER}.driver`, theListJoinCommand(clone)])
  mkdirSync(join(gitDir, 'info'), { recursive: true })
  const patterns = [...THE_LIST_FILES.map((one) => `/${one.path}`), ...CODE_FILE_ENDINGS.map((ending) => `*${ending}`)]
  appendFileSync(join(gitDir, 'info', 'attributes'), patterns.map((pattern) => `${pattern} merge=${LIST_JOIN_DRIVER}\n`).join(''))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ancestor, ours, theirs, gitDir, path] = process.argv.slice(2)
  const joined = joinTheListFiles(path, ancestor, ours, theirs)
  if ('refused' in joined) {
    appendFileSync(join(gitDir, LIST_JOIN_REFUSED), joined.refused + '\n')
    process.stderr.write(joined.refused + '\n')
    process.exit(1)
  }
  writeFileSync(ours, joined.text)
  // One line for each hunk joined, which integrate.mjs carries into the run's log.
  if (joined.joined.length > 0) appendFileSync(join(gitDir, LIST_JOINS_SAID), joined.joined.map((said) => `joined ${said}\n`).join(''))
}
