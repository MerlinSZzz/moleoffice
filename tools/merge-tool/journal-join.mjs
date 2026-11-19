// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MIGRATION JOURNAL IS JOINED BY ITSELF (wave 13v round 17d). Every branch that brings a
 * migration appends its rows to the end of drizzle/meta/_journal.json, so after the first one lands each of the others
 * conflicts on that file when the queue replays it, though the rows do not disagree. This joins them.
 *
 * HOW: a git merge driver, written into the entry's integration clone alone (its .git/config and .git/info/attributes),
 * never into the owner's repository. git calls it for each replayed commit that changed the journal on both sides, so a later
 * commit's rows join as well, and a conflict in any other file still stops the rebase and bounces the entry as before.
 * Joining after the rebase had stopped would mean driving git's stop and continue by hand for every commit.
 *
 * THE JOIN: each row is found by its tag. A row both sides kept is taken once; a row one side added is taken; a row one
 * side removed and the other left alone is removed. The rows main already holds keep their order, because the real
 * journal is not in idx order (0177 is listed before 0175) and main's rows are not this join's to rewrite; the rows the
 * entry adds follow them, sorted by idx. Nothing is decided by that order: a database applies by index what it is missing
 * (src/config/migration-look.mjs). It refuses, with a sentence
 * naming them, when both sides hold one tag with a different idx, "when" or other field, when one side removed a row the
 * other changed, when two rows share an idx with different tags, or when the journal's other fields differ. A refusal
 * leaves the conflict to git, and the queue then tries its renumbering (migrations.mjs) or bounces the entry.
 *
 * Usage, by git: node journal-join.mjs <ancestor> <ours, written over> <theirs> <the clone's .git>
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const JOURNAL_JOIN_DRIVER = 'mole-office-journal-join'
/** Where the driver says, in the clone's .git, what it joined and what it refused. */
export const JOURNAL_JOINS_SAID = 'mole-office-journal-joins.log'
export const JOURNAL_JOIN_REFUSED = 'mole-office-journal-join.refused'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const quoted = (word) => `'${word.replaceAll("'", `'\\''`)}'`

/**
 * The join of two sides of the journal over their common ancestor, as text, or the sentence saying why it was refused.
 * @param {string} ancestor @param {string} ours @param {string} theirs
 * @returns {{ text: string, added: string[] } | { refused: string }}
 */
export function joinTheJournals(ancestor, ours, theirs) {
  let base, mine, other
  try {
    ;[base, mine, other] = [ancestor, ours, theirs].map((text) => JSON.parse(text))
  } catch (error) {
    return { refused: `One side of the migration journal is not JSON (${error instanceof Error ? error.message : String(error)}), so it was not joined.` }
  }
  for (const side of [base, mine, other]) {
    if (!Array.isArray(side?.entries) || side.entries.some((row) => typeof row?.tag !== 'string' || !Number.isSafeInteger(row.idx))) {
      return { refused: 'One side of the migration journal has no list of entries each with a tag and a whole-number idx, so it was not joined.' }
    }
  }
  const rest = (side) => ({ ...side, entries: undefined })
  if (!same(rest(mine), rest(other))) return { refused: 'The two sides of the migration journal differ outside its entries, so it was not joined.' }

  const byTag = (side) => new Map(side.entries.map((row) => [row.tag, row]))
  const [inBase, inMine, inOther] = [base, mine, other].map(byTag)
  const rows = []
  for (const tag of new Set([...inMine.keys(), ...inOther.keys(), ...inBase.keys()])) {
    const was = inBase.get(tag), a = inMine.get(tag), b = inOther.get(tag)
    if (a !== undefined && b !== undefined) {
      if (!same(a, b)) return { refused: `Both sides of the migration journal hold ${tag}, one as index ${a.idx} with when ${a.when} and the other as index ${b.idx} with when ${b.when}, so it was not joined.` }
      rows.push(a)
    } else if (a !== undefined || b !== undefined) {
      const kept = a ?? b
      if (was === undefined) rows.push(kept)
      else if (!same(was, kept)) return { refused: `One side of the migration journal removed ${tag} and the other changed it, so it was not joined.` }
    }
  }
  const kept = rows.filter((row) => inMine.has(row.tag))
  const added = rows.filter((row) => !inMine.has(row.tag)).sort((x, y) => x.idx - y.idx)
  const byIndex = new Map()
  for (const row of [...kept, ...added]) {
    const holder = byIndex.get(row.idx)
    if (holder !== undefined) return { refused: `The joined migration journal would give one index to two migrations: ${holder.tag} and ${row.tag} are both index ${row.idx}, so it was not joined.` }
    byIndex.set(row.idx, row)
  }
  return { text: JSON.stringify({ ...mine, entries: [...kept, ...added] }, null, 2) + (ours.endsWith('\n') ? '\n' : ''), added: added.map((row) => row.tag) }
}

/** The path of the journal in a repository. */
export const THE_JOURNAL = 'drizzle/meta/_journal.json'
/** What the merge tool records as the check that decided a joined journal (design/merge/SPEC.md, R4). */
export const THE_JOURNAL_JOIN_CHECK = 'joins'

/**
 * WHETHER A JOINED JOURNAL HOLDS BOTH SIDES, judged again on the joined file's own content (wave 13v round 18). R2 says a
 * verdict follows a file's content: the entry was judged with its journal, not with the journal it lands as. So the file
 * that lands is checked by a program, which R4 allows to decide what it can. It holds when every row of the entry's journal
 * and every row of the journal it lands on is in it unchanged, it holds no row that neither has, no tag and no idx is
 * there twice, and its other fields are those of the journal it lands on. Anything else is not decided here, and the
 * file goes to the inspector as any changed file does.
 * @param {{ entry: string, onto: string, joined: string }} sides the three journals, as text
 * @returns {{ holds: true, says: string } | { holds: false, why: string }}
 */
export function whetherTheJournalHoldsBothSides({ entry, onto, joined }) {
  let mine, under, result
  try {
    ;[mine, under, result] = [entry, onto, joined].map((text) => JSON.parse(text))
  } catch (error) {
    return { holds: false, why: `a journal is not JSON (${error instanceof Error ? error.message : String(error)})` }
  }
  for (const side of [mine, under, result]) {
    if (!Array.isArray(side?.entries) || side.entries.some((row) => typeof row?.tag !== 'string' || !Number.isSafeInteger(row.idx))) {
      return { holds: false, why: 'a journal has no list of entries each with a tag and a whole-number idx' }
    }
  }
  if (!same({ ...result, entries: undefined }, { ...under, entries: undefined })) return { holds: false, why: 'the joined journal differs outside its entries from the journal it lands on' }
  const held = new Map()
  const indexes = new Set()
  for (const row of result.entries) {
    if (held.has(row.tag)) return { holds: false, why: `the joined journal holds ${row.tag} twice` }
    if (indexes.has(row.idx)) return { holds: false, why: `the joined journal gives index ${row.idx} to two migrations` }
    held.set(row.tag, row)
    indexes.add(row.idx)
  }
  for (const [side, rows] of [['the entry', mine.entries], ['the journal it lands on', under.entries]]) {
    for (const row of rows) {
      if (!held.has(row.tag)) return { holds: false, why: `the joined journal lacks ${row.tag}, which ${side} holds` }
      if (!same(held.get(row.tag), row)) return { holds: false, why: `the joined journal holds ${row.tag} otherwise than ${side} does` }
    }
  }
  const fromEither = new Set([...mine.entries, ...under.entries].map((row) => row.tag))
  const neither = result.entries.find((row) => !fromEither.has(row.tag))
  if (neither !== undefined) return { holds: false, why: `the joined journal holds ${neither.tag}, which neither side holds` }
  const added = mine.entries.filter((row) => !under.entries.some((other) => other.tag === row.tag)).map((row) => row.tag)
  return {
    holds: true,
    says: `The joined journal holds all ${under.entries.length} rows it lands on and all ${mine.entries.length} of the entry's, adding ${added.join(', ') || 'no row'}, with no row changed, no row from neither side, and no tag or index twice.`,
  }
}

/**
 * THE ENTRY'S JOURNAL WITH THIS TOOL'S RENUMBERING READ IN. Each mapping is applied, one after the
 * other in the order it was done, to the row whose tag is its `from`: that row takes the tag, index and `when` the mapping
 * names. A mapping whose `from` is not a row of the entry's journal changes nothing. Returns the journal as text and one
 * sentence for each row it moved, saying the row's old tag, index and `when` and the ones it took.
 * @param {string} text the entry's journal, as text
 * @param {{ from: string, to: string, idx: number, when: number }[]} renumbered
 * @returns {{ text: string, moved: string[] }}
 */
function theEntrysJournalRenumbered(text, renumbered) {
  let journal
  try {
    journal = JSON.parse(text)
  } catch {
    return { text, moved: [] }
  }
  if (!Array.isArray(journal?.entries)) return { text, moved: [] }
  const rows = journal.entries.map((row) => ({ ...row }))
  const moved = []
  for (const mapping of renumbered) {
    const at = rows.findIndex((row) => row.tag === mapping.from)
    if (at < 0) continue
    const row = rows[at]
    moved.push(`from ${row.tag} to ${mapping.to} (index ${row.idx} to ${mapping.idx}, when ${row.when} to ${mapping.when})`)
    rows[at] = { ...row, tag: mapping.to, idx: mapping.idx, when: mapping.when }
  }
  return { text: JSON.stringify({ ...journal, entries: rows }), moved }
}

/**
 * THE DECIDED ITEM FOR A JOINED JOURNAL, as the checker's report carries it ({path, check, ok, detail}), or null with the
 * reason when the check does not hold or cannot be made. `textAt(commit)` reads the journal at a commit, or null where it
 * is absent. `entry` is the entry's own commit, `onto` what it was replayed onto, `result` the commit that would land.
 * `renumbered` is what this tool did to the entry's migrations ({from, to, idx, when}, in the order it was done): when the
 * check does not hold and one of those moved a row of the entry's journal, the check is made again with that row read under
 * the renumbering, and the reason names the renumbering instead of the row. The journal still goes
 * to the inspector after a renumbering: nothing here is decided.
 * @param {(commit: string) => (string | null)} textAt the journal at one commit, or null where it is absent
 * @param {{ entry: string, onto: string, result: string, renumbered?: { from: string, to: string, idx: number, when: number }[] }} sides
 */
export function theJournalDecided(textAt, { entry, onto, result, renumbered = [] }) {
  const [mine, under, joined] = [entry, onto, result].map((commit) => textAt(commit))
  if (mine === null || under === null || joined === null) return { decided: null, why: 'the journal is absent from one of the entry, the commit it lands on, or the result' }
  const check = whetherTheJournalHoldsBothSides({ entry: mine, onto: under, joined })
  if (check.holds) return { decided: { path: THE_JOURNAL, check: THE_JOURNAL_JOIN_CHECK, ok: true, detail: check.says }, why: null }
  const renamed = theEntrysJournalRenumbered(mine, renumbered)
  if (renamed.moved.length === 0) return { decided: null, why: check.why }
  const again = whetherTheJournalHoldsBothSides({ entry: renamed.text, onto: under, joined })
  const said = renamed.moved.join(', ')
  if (again.holds) return { decided: null, why: `this tool renumbered the entry's migrations, ${said}, and that is the only difference from the two sides` }
  return { decided: null, why: `${again.why}, reading the entry's journal with this tool's renumbering, ${said}` }
}

/**
 * WHERE TWO ENTRIES' JOURNALS DISAGREE, as a sentence, or null when they agree: one tag held as two different rows, or one
 * index given to two tags. Rows only one of them holds do not disagree; the join takes them.
 * @param {string} one @param {string} other the two journals, as text
 */
export function whereTheJournalsDisagree(one, other) {
  let a, b
  try {
    ;[a, b] = [one, other].map((text) => JSON.parse(text))
  } catch (error) {
    return `a journal is not JSON (${error instanceof Error ? error.message : String(error)})`
  }
  if (!Array.isArray(a?.entries) || !Array.isArray(b?.entries)) return 'a journal has no list of entries'
  for (const row of a.entries) {
    const sameTag = b.entries.find((other) => other.tag === row.tag)
    if (sameTag !== undefined && !same(sameTag, row)) return `both hold ${row.tag}, as index ${row.idx} with when ${row.when} and as index ${sameTag.idx} with when ${sameTag.when}`
    const sameIndex = b.entries.find((other) => other.idx === row.idx && other.tag !== row.tag)
    if (sameIndex !== undefined) return `both give index ${row.idx} to a migration, ${row.tag} and ${sameIndex.tag}`
  }
  return null
}

/**
 * The command git runs for the driver in `clone`. It is made here alone: the clone is given it below, and the merge tool
 * compares what a clone's config holds with it before it runs git on the clone's files (what-a-clone-names.mjs).
 */
export function theJournalJoinCommand(clone) {
  return [process.execPath, fileURLToPath(import.meta.url), '%O', '%A', '%B', join(clone, '.git')].map((word, i) => (i >= 2 && i <= 4 ? word : quoted(word))).join(' ')
}

/** Gives the integration clone the driver: its own config and attributes, nothing outside the clone. */
export function joinTheJournalInThisClone(clone, setConfig) {
  const gitDir = join(clone, '.git')
  setConfig([`merge.${JOURNAL_JOIN_DRIVER}.name`, 'joins the rows of the migration journal by tag, sorted by idx'])
  setConfig([`merge.${JOURNAL_JOIN_DRIVER}.driver`, theJournalJoinCommand(clone)])
  mkdirSync(join(gitDir, 'info'), { recursive: true })
  appendFileSync(join(gitDir, 'info', 'attributes'), `/drizzle/meta/_journal.json merge=${JOURNAL_JOIN_DRIVER}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ancestor, ours, theirs, gitDir] = process.argv.slice(2)
  const joined = joinTheJournals(...[ancestor, ours, theirs].map((path) => readFileSync(path, 'utf8')))
  if ('refused' in joined) {
    appendFileSync(join(gitDir, JOURNAL_JOIN_REFUSED), joined.refused + '\n')
    process.stderr.write(joined.refused + '\n')
    process.exit(1)
  }
  writeFileSync(ours, joined.text)
  appendFileSync(join(gitDir, JOURNAL_JOINS_SAID), `joined the migration journal, adding ${joined.added.join(', ') || 'no row'}\n`)
}
