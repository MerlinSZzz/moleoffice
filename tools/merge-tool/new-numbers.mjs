// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE'S RENUMBERING OF A MIGRATION, IN THE LINES THAT NAME IT (wave 13v rounds 23 and 24, wave 13u rounds 130 and
 * 132). The merge tool's renumber at integration (migrations.mjs) gives the lines an entry wrote a migration's new
 * number by withTheNewNumbers. Where a clean copy's stop renamed a migration differently on each side, the clean copy a
 * supervisor resolves in (resolve-a-conflict.mjs) gives a file git merged with no conflict main's number by the same
 * rule, and the merge tool's check of the resolution (check-a-resolution.mjs) accepts exactly that change in such a
 * file and nothing else (item 51, from the decision on conflicts). All three read the rule here, so they cannot
 * drift apart.
 *
 * IT READS NONE OF THE MERGE TOOL'S ARGUMENTS and runs no git, so the clean copy can import it.
 */
import './a-library-is-not-a-program.mjs'

/** Where the SQL of the migration `tag` is. */
export const sqlPath = (tag) => `drizzle/${tag}.sql`

/** The tag of the migration whose SQL is at `path`, or null when `path` is not a migration's SQL. */
const theTagOf = (path) => /^drizzle\/([0-9]{4}_[A-Za-z0-9_-]+)\.sql$/u.exec(path)?.[1] ?? null

/** The arguments of `git diff` whose patch theLinesAddedIn reads, before the two sides and the path. */
export const THE_LINES_ADDED = ['diff', '--no-ext-diff', '--no-renames', '--no-color', '--unified=0']

/** The 1-based lines of the new side that a patch from THE_LINES_ADDED adds: every line when the old side has no such file. */
export function theLinesAddedIn(patch) {
  const lines = new Set()
  for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]), count = Number(match[2] ?? 1)
    for (let i = start; i < start + count; i++) lines.add(i)
  }
  return lines
}

/**
 * ONE TEXT WITH THE OLD NUMBERS GIVEN THEIR NEW ONES, on the given 1-based lines only, or on every line when `lines` is
 * null. Exactly what is renamed (wave 13v round 24, made exact in 24b): an old four-digit number with no letter, digit or
 * underscore before it, and after it one of these, then no letter, digit or underscore:
 * - nothing, or a lone `_`;
 * - `_` and the first one or more of its tag's words, each whole, joined by `_` as in the tag, with or without one `_`
 *   after them. A word ends where the tag has `_` or ends.
 * So `0216`, `'0216_'`, `0216_a`, `0216_a_handover_` and the whole tag `0216_a_handover_for_every_agent` all become 0228,
 * and only the four digits change. It is one pass, so a number that is both one migration's new number and another's old
 * one is changed once.
 *
 * Left alone, because each only looks like the number: `20260216` and `x0216` (something before it), `0216a` (a letter
 * after it), and `0216_branch_a`, `0216_30` and `0216_a_handover_for_every_agent_v2` (what follows `_` is not the start of
 * its tag).
 *
 * `cannot` lists the lines that cannot be renamed safely, and nothing on them is rewritten:
 * - A form that is the start of its tag but stops inside a word, as `0216_a_hand` does in `handover`. It may be the
 *   migration or something else, and the line cannot tell which (wave 13v round 24b).
 * - A line that names a migration by a pattern: the first two or three of its digits with no letter, digit or underscore
 *   before them, then `[`, `\d` or `?`, or after three digits `*` (`021[67]`, `02\d\d`, `021?`, `021*`). Which migrations
 *   such a pattern meant cannot be told. `0216*` and `/^0216_/` are not patterns in this sense: they spell the number.
 * The caller refuses, with the sentence aLineItCannotRename gives.
 */
export function withTheNewNumbers(text, mappings, lines) {
  if (mappings.length === 0) return { text, changed: 0, cannot: [] }
  const byNumber = new Map(mappings.map((one) => [one.from.slice(0, 4), one]))
  const prefixes = [...new Set([...byNumber.keys()].flatMap((number) => [number.slice(0, 2), number.slice(0, 3)]))]
  const patterned = new RegExp(`(?<![0-9A-Za-z_])(?:(?:${prefixes.join('|')})(?:\\[|\\\\d|\\?)|(?:${prefixes.filter((one) => one.length === 3).join('|')})\\*)`)
  let changed = 0
  const cannot = []
  const out = text.split('\n').map((line, i) => {
    if (lines !== null && !lines.has(i + 1)) return line
    if (patterned.test(line)) cannot.push({ line: i + 1, text: line.trim(), why: 'pattern' })
    const stops = []
    let here = 0
    const renamed = line.replace(/(?<![0-9A-Za-z_])([0-9]{4})((?:_[0-9A-Za-z_]*)?)(?![0-9A-Za-z_])/g, (found, number, after) => {
      const one = byNumber.get(number)
      if (one === undefined) return found
      const says = whatFollows(one.from, after)
      if (says === 'not its tag') return found
      if (says === 'inside a word') {
        stops.push({ line: i + 1, text: line.trim(), why: 'inside a word', found, tag: one.from })
        return found
      }
      here++
      return `${one.to.slice(0, 4)}${after}`
    })
    if (stops.length === 0) {
      changed += here
      return renamed
    }
    cannot.push(...stops)
    return line
  })
  return { text: out.join('\n'), changed, cannot }
}

/**
 * What `after`, the `_` and word characters that follow an old number, says of the migration `tag`: 'its tag' when it
 * is nothing, a lone `_`, or whole words from the start of the tag with or without one `_` after them; 'inside a word'
 * when it is the start of the tag but stops inside one of its words; 'not its tag' otherwise.
 */
function whatFollows(tag, after) {
  if (after === '' || after === '_') return 'its tag'
  const words = tag.slice(5), said = after.slice(1).replace(/_$/, '')
  if (said === '' || !words.startsWith(said)) return 'not its tag'
  return said.length === words.length || words[said.length] === '_' ? 'its tag' : 'inside a word'
}

/** The sentence a refusal gives for a line `withTheNewNumbers` listed in `cannot`, or for a file's name, `where`. */
export const aLineItCannotRename = (path, one, mappings, where = `Line ${one.line} of ${path}`) => one.why === 'inside a word'
  ? `${where} writes \`${one.found}\`, which stops inside a word of migration ${one.tag}, so whether it names that migration cannot be told, and it was not renumbered.`
  : `${where} names a migration by a pattern, \`${one.text.length > 120 ? `${one.text.slice(0, 117)}...` : one.text}\`, and which of ${mappings.map((each) => each.from).join(', ')} it means cannot be told, so it was not renumbered.`

/**
 * THE QUEUE'S RENUMBERING AS A STOP SHOWS IT (wave 13u round 132, item 51): `{ from, to }` for each migration whose SQL
 * file the stop found renamed differently on each side (whole-file-conflicts.mjs), where the two names differ only in
 * their four digits, as the queue's renumbering makes them. `from` is the entry's tag and `to` is main's, because main's
 * name stands. A stop with no such rename gives none.
 */
export function theRenumberingAtAStop(kinds) {
  const mappings = []
  for (const kind of kinds.filter((one) => one.kind === 'renamed')) {
    const from = theTagOf(kind.entry), to = theTagOf(kind.main)
    if (from === null || to === null || from === to || from.slice(4) !== to.slice(4)) continue
    if (!mappings.some((one) => one.from === from)) mappings.push({ from, to })
  }
  return mappings
}

/**
 * THE FILES GIT MERGED WITH NO CONFLICT AT A STOP: the arguments of `git diff` that name, from the replay before the stop
 * to git's own result at it, each path the stop's commit adds or changes. The caller leaves out the paths left in
 * conflict.
 */
export const THE_FILES_A_STOP_CHANGES = ['diff', '--name-only', '-z', '--no-renames', '--diff-filter=AM']

/**
 * ONE FILE GIT MERGED WITH NO CONFLICT, WITH MAIN'S NUMBERS (wave 13u round 132, item 51): withTheNewNumbers on the lines
 * `added`, those main does not hold, of `bytes` as git merged them; or null when the bytes are not UTF-8 text, which the
 * rule does not read. The clean copy writes the text this gives, and the check of a resolution accepts exactly it.
 */
export function aMergedFileWithMainsNumbers(bytes, mappings, added) {
  const text = bytes.toString('utf8')
  if (text.slice(0, 8000).includes('\0') || !Buffer.from(text, 'utf8').equals(bytes)) return null
  return withTheNewNumbers(text, mappings, added)
}
