// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Recover only append-only migration collisions. All other entry changes still pass a real rebase. */
import './a-library-is-not-a-program.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cleanEnvironment, git, gitBytes, tryGit } from './git.mjs'
import { GIT_IDENTITY } from './arguments.mjs'
import { MIGRATION_CASES as CASES, MIGRATION_JOURNAL as JOURNAL, onlyInMigrationFiles } from './early-conflicts.mjs'
import { THE_LINES_ADDED, aLineItCannotRename, sqlPath, theLinesAddedIn, withTheNewNumbers } from './new-numbers.mjs'

// The rule itself is in new-numbers.mjs, which the clean copy and the check of a resolution read too (wave 13u round 132).
export { withTheNewNumbers }
const bytesAt = (repo, tip, path) => gitBytes(repo, ['show', `${tip}:${path}`])
const textAt = (repo, tip, path) => bytesAt(repo, tip, path).toString('utf8')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function appended(base, next) {
  if (!same({ ...base, entries: [] }, { ...next, entries: [] }) || !Array.isArray(next.entries)
      || !same(base.entries, next.entries.slice(0, base.entries.length))) throw Error('The migration journal is not append-only.')
  const rows = next.entries.slice(base.entries.length)
  // RISING, NOT NEXT TO EACH OTHER (wave 13v round 23): main went from 0213 to 0227 on 11 October 2026, because branches
  // in flight held the numbers between, and a gap is not a reason to refuse.
  let idx = Math.max(-1, ...base.entries.map((row) => row.idx))
  for (const row of rows) {
    if (row.idx <= idx || !Number.isSafeInteger(row.when) || !new RegExp(`^${String(row.idx).padStart(4, '0')}_[A-Za-z0-9_-]+$`).test(row.tag)) throw Error('An added migration has an invalid number, tag or time.')
    idx = row.idx
  }
  return rows
}

/** SQLite comments are ignored; quoted strings and identifiers remain executable input. */
function withoutComments(sql) {
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g, (word) => word.startsWith('--') || word.startsWith('/*') ? ' ' : word)
}

/** Null when a migration's SQL may move to another number, or the sentence saying why it may not. */
function whyItsSQLCannotMove(sql, row) {
  if (new RegExp(`${row.tag}|(?<![0-9])(?:${row.tag.slice(0, 4)}|${row.idx})(?![0-9])|__drizzle_migrations`, 'i').test(withoutComments(sql))) return `Migration ${row.tag} SQL mentions its number or the migration ledger; its independence cannot be proved, so it was not renumbered.`
  return null
}

/**
 * THE NEWEST MIGRATION A JOURNAL HOLDS: its greatest index and its greatest `when`. They are read off every row, not the
 * last one, because the journal is not in index order (0177 is listed before 0175).
 */
export function theNewestOf(journal) {
  return {
    idx: Math.max(-1, ...journal.entries.map((row) => row.idx)),
    when: Math.max(-Infinity, ...journal.entries.map((row) => row.when)),
  }
}

function rewriteOwnCases(repo, base, tip, mappings) {
  const patch = git(repo, ['diff', '--no-ext-diff', '--unified=0', base, tip, '--', CASES])
  const lines = textAt(repo, tip, CASES).split('\n')
  for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]) - 1, count = Number(match[2] ?? 1)
    for (let i = start; i < start + count; i++) {
      lines[i] = lines[i].replace(/\b\d{4}(?=_|\b)/g, (number) => mappings.find((one) => one.from.slice(0, 4) === number)?.to.slice(0, 4) ?? number)
    }
  }
  return lines.join('\n')
}

/**
 * IN THE WORKING TREE, AFTER A COLLISION RENUMBERING: each tests/what-each-migration-adds/<old tag>.json becomes <new tag>.json
 * with its words following (the old one is removed with `git rm`), in the other given paths the lines `at` holds and
 * `main` does not have the old numbers replaced, and a file `at` adds whose name carries an old number is moved to its new
 * name with `git mv`, as theFilesNamedFor says (wave 13u round 130). Returns `{ written, renamed }`: the paths it wrote,
 * under their new names, for `git add`, and the files it moved.
 */
function followTheNewNumbers(repo, main, at, paths, mappings) {
  const written = [], gone = []
  const named = theFilesNamedFor(repo, main, at, paths.filter((path) => !mappings.some((one) => path === addsPath(one.from))), mappings)
  if ('why' in named) throw Error(named.why)
  for (const one of mappings) {
    const from = addsPath(one.from)
    if (!paths.includes(from) || !existsSync(join(repo, from))) continue
    writeFileSync(join(repo, addsPath(one.to)), withTheNewNumbers(readFileSync(join(repo, from), 'utf8'), mappings, null).text)
    git(repo, ['rm', '--quiet', '--', from])
    gone.push(from)
    written.push(addsPath(one.to))
  }
  for (const path of paths) {
    if (written.includes(path) || gone.includes(path) || !existsSync(join(repo, path)) || !tryGit(repo, ['grep', '-q', '-I', '-F', ...theLeadingDigits(mappings).flatMap((digits) => ['-e', digits]), '--', path]).ok) continue
    const said = withTheNewNumbers(readFileSync(join(repo, path), 'utf8'), mappings, linesAddedSince(repo, main, at, path))
    if (said.cannot.length > 0) throw Error(aLineItCannotRename(path, said.cannot[0], mappings))
    if (said.changed === 0) continue
    writeFileSync(join(repo, path), said.text)
    written.push(path)
  }
  for (const { from, to } of named.renamed) {
    mkdirSync(dirname(join(repo, to)), { recursive: true })
    git(repo, ['mv', '--', from, to])
  }
  const newName = new Map(named.renamed.map((one) => [one.from, one.to]))
  return { written: [...new Set([...written.map((path) => newName.get(path) ?? path), ...newName.values()])], renamed: named.renamed }
}

/**
 * The caller has aborted its failed rebase. This operates only in that entry's integration clone. The new numbers start
 * above main's newest and above every row of `seen`, the migrations the other queued entries carry, as
 * renumberMigrationsBehindMain's do (wave 13v round 27). `because` says where they start.
 */
export function renumberMigrationCollision(repo, base, tip, main, conflicts, seen = []) {
  if (!onlyInMigrationFiles(conflicts)) return { ok: false }
  try {
    const original = JSON.parse(textAt(repo, base, JOURNAL))
    const own = JSON.parse(textAt(repo, tip, JOURNAL)), current = JSON.parse(textAt(repo, main, JOURNAL))
    const added = appended(original, own), mains = appended(original, current)
    if (added.length === 0 || mains.length === 0 || !added.some((row) => row.idx <= theNewestOf(current).idx)) return { ok: false }
    const ownSQL = new Set(added.map((row) => sqlPath(row.tag)))
    if (conflicts.some((path) => path !== JOURNAL && path !== CASES && !ownSQL.has(path))) throw Error('A conflict changes an existing migration, rather than adding one.')
    // Old SQL and journal snapshots must stay unchanged; changing them is not an append.
    const changed = git(repo, ['diff', '--name-only', base, tip]).split('\n')
    if (changed.some((path) => path.startsWith('drizzle/') && path !== JOURNAL && !ownSQL.has(path))) throw Error('The entry changes migration files other than its added SQL and journal rows.')
    for (const row of added) {
      if (tryGit(repo, ['cat-file', '-e', `${base}:${sqlPath(row.tag)}`]).ok) throw Error(`Migration ${row.tag} was already present at the fork base.`)
      const cannot = whyItsSQLCannotMove(textAt(repo, tip, sqlPath(row.tag)), row)
      if (cannot !== null) throw Error(cannot)
    }
    // ABOVE THE OTHER QUEUED ENTRIES' NUMBERS TOO (wave 13v round 27). Round 26 made the renumbering behind main step over
    // them, and this one still numbered from main alone.
    const queued = theNewestQueued(current, own, seen)
    const because = whereTheNumbersStart(current, queued)
    let { idx, when } = theNewestOf(current)
    if (queued !== null) ({ idx, when } = { idx: Math.max(idx, queued.idx), when: Math.max(when, queued.when) })
    const mappings = added.map((row) => ({ from: row.tag, to: `${String(++idx).padStart(4, '0')}${row.tag.slice(4)}`, idx, when: Math.max(++when, row.when) }))
    for (let i = 1; i < mappings.length; i++) mappings[i].when = Math.max(mappings[i].when, mappings[i - 1].when + 1)
    const baseCases = textAt(repo, base, CASES), mainCases = textAt(repo, main, CASES)
    const ownCases = rewriteOwnCases(repo, base, tip, mappings)
    const temporary = join(repo, '.git', 'migration-join')
    mkdirSync(temporary, { recursive: true })
    for (const [name, text] of [['main', mainCases], ['base', baseCases], ['own', ownCases]]) writeFileSync(join(temporary, name), text)
    const merged = spawnSync('git', ['merge-file', '--diff3', '--marker-size=80', '-p', join(temporary, 'main'), join(temporary, 'base'), join(temporary, 'own')], { encoding: 'utf8' })
    let cases
    if (merged.status === 0) cases = merged.stdout
    else if (merged.status > 0 && merged.status < 128) {
      let additions = 0
      cases = merged.stdout.replace(/^<{80}[^\n]*\n([\s\S]*?)^\|{80}[^\n]*\n([\s\S]*?)^={80}\n([\s\S]*?)^>{80}[^\n]*(?:\n|$)/gm, (_block, mains, prior, own) => {
        if (prior.trim() !== '') throw Error('The migration tests conflict on existing code, not just added cases.')
        additions++
        return mains + own
      })
      if (additions === 0 || /^(?:<{80}|\|{80}|={80}|>{80})/m.test(cases)) throw Error('The migration-case conflict could not be read as independent additions.')
    } else throw Error('git merge-file gave no usable migration-case join.')

    // Defer the journal, cases and SQL with a clashing full filename to one queue commit.
    // Keep the entry's other SQL in its own commits; the queue commit renames it afterwards.
    // Rebase the entire projected history, so a later code conflict cannot hide behind the journal conflict.
    let parent = base
    const artifacts = [JOURNAL, CASES, ...ownSQL]
    const projectedArtifacts = [JOURNAL, CASES, ...[...ownSQL].filter((path) => tryGit(repo, ['cat-file', '-e', `${main}:${path}`]).ok)]
    for (const commit of git(repo, ['rev-list', '--reverse', `${base}..${tip}`]).split('\n')) {
      if (git(repo, ['rev-list', '--parents', '-n', '1', commit]).split(' ').length !== 2) throw Error('The entry history is not linear; migration recovery was refused.')
      git(repo, ['read-tree', commit])
      for (const path of projectedArtifacts) {
        if (tryGit(repo, ['cat-file', '-e', `${base}:${path}`]).ok) {
          const line = git(repo, ['ls-tree', base, '--', path])
          const [mode, , hash] = line.split(/\s/)
          git(repo, ['update-index', '--add', '--cacheinfo', mode, hash, path])
        } else git(repo, ['update-index', '--force-remove', '--', path])
      }
      const tree = git(repo, ['write-tree'])
      const [name, email, date] = git(repo, ['show', '-s', '--format=%an%x00%ae%x00%aI', commit]).split('\0')
      parent = execFileSync('git', ['-C', repo, 'commit-tree', tree, '-p', parent], {
        input: gitBytes(repo, ['show', '-s', '--format=%B', commit]), encoding: 'utf8', env: cleanEnvironment({ ...GIT_IDENTITY, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date }),
      }).trim()
    }
    git(repo, ['checkout', '--quiet', '--detach', '-f', parent])
    const replay = tryGit(repo, ['rebase', '--quiet', '--onto', main, base])
    if (!replay.ok) {
      const files = git(repo, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)
      tryGit(repo, ['rebase', '--abort'])
      return { ok: false, files, why: `A conflict besides migration additions remains: ${replay.stderr || replay.stdout}` }
    }
    for (const path of artifacts) {
      // Restore main's versions first, including SQL when both entries chose the same full filename.
      if (tryGit(repo, ['cat-file', '-e', `${main}:${path}`]).ok) git(repo, ['checkout', main, '--', path])
      else tryGit(repo, ['rm', '-f', '--ignore-unmatch', '--', path])
    }
    for (const mapping of mappings) {
      const path = join(repo, sqlPath(mapping.to)); mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytesAt(repo, tip, sqlPath(mapping.from)))
    }
    writeFileSync(join(repo, JOURNAL), JSON.stringify({ ...current, entries: [...current.entries, ...added.map((row, i) => ({ ...row, idx: mappings[i].idx, tag: mappings[i].to, when: mappings[i].when }))] }, null, 2) + '\n')
    writeFileSync(join(repo, CASES), cases)
    // EVERY OTHER FILE THE ENTRY CHANGED THAT NAMES AN OLD NUMBER follows it, on the lines the entry wrote (wave 13v round 23).
    const followed = followTheNewNumbers(repo, main, 'HEAD', git(repo, ['diff', '--name-only', '--no-renames', base, tip]).split('\n').filter((path) => path !== '' && !artifacts.includes(path)), mappings)
    git(repo, ['add', '--', JOURNAL, CASES, ...mappings.map((one) => sqlPath(one.to)), ...followed.written])
    const says = mappings.map((one) => `${one.from} -> ${one.to}`).join(', ')
    git(repo, ['commit', '--quiet', '-m', `Renumber migrations at integration: ${says}`, '-m', `The new numbers are above these: ${because}${theFilesRenamed(followed.renamed)}.`])
    return { ok: true, mappings, commit: git(repo, ['rev-parse', 'HEAD']), says, because, renamed: followed.renamed }
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : String(error) }
  }
}

/** Where a migration says what it adds (criterion change, wave 13v round 18): one file per migration, named by its tag. */
export const WHAT_EACH_MIGRATION_ADDS = 'tests/what-each-migration-adds'
const addsPath = (tag) => `${WHAT_EACH_MIGRATION_ADDS}/${tag}.json`

/**
 * THE MIGRATIONS A RESULT ADDS BEHIND THE JOURNAL IT LANDS ON (wave 13v round 23): each row of `result` whose tag `onto`
 * does not hold and whose index or `when` is not after the newest of `onto`, in index order. On 11 October 2026 a merge
 * entry carried 0214 (when 1791368770082) onto a main whose newest was 0227 (when 1791368770095). The
 * journal join put its row after 0227's, nothing conflicted, and three test files went red with it.
 * @param {{ entries: { idx: number, when: number, tag: string }[] }} onto @param {{ entries: { idx: number, when: number, tag: string }[] }} result
 */
export function theMigrationsBehind(onto, result) {
  const held = new Set(onto.entries.map((row) => row.tag))
  const newest = theNewestOf(onto)
  return result.entries.filter((row) => !held.has(row.tag) && (row.idx <= newest.idx || row.when <= newest.when)).sort((a, b) => a.idx - b.idx)
}

/**
 * THE NEWEST NUMBER AND `when` THE OTHER QUEUED ENTRIES CARRY (wave 13v round 26): of the rows in `seen`, those whose tag
 * neither `onto` nor `result` holds. On 11 October 2026 an entry was renumbered from 0215 to 0232, and
 * another entry, ahead of it in the queue, already carried 0232. Null when no such row was seen.
 */
export function theNewestQueued(onto, result, seen) {
  const known = new Set([...onto.entries, ...result.entries].map((row) => row.tag))
  const others = seen.filter((row) => !known.has(row.tag))
  return others.length === 0 ? null : theNewestOf({ entries: others })
}

/** Where the new numbers start, in words: main's newest, and the newest of the other queued entries when one was seen. */
function whereTheNumbersStart(onto, queued) {
  return `main's newest migration was ${String(theNewestOf(onto).idx).padStart(4, '0')}`
    + (queued === null ? '' : ` and the other queued entries carry up to ${String(queued.idx).padStart(4, '0')} (when ${queued.when})`)
}

/**
 * WHAT WAS READ OF THE OTHER QUEUED ENTRIES' MIGRATIONS, for the log of an entry whose migrations were renumbered (wave 13v
 * round 26): the entries read, those that could not be, and what no read can see. `queued` is what theMigrationsQueued in
 * office-keeper.mjs read, or null when it was not read.
 */
export function whatTheQueueSaid(queued) {
  const unseen = 'numbers handed out for branches not yet in the queue cannot be seen'
  if (queued === null) return `the other queued entries' migrations were not read, so the new numbers are above main's only; ${unseen}`
  if (queued.lane !== null) return `the lane could not be read (${queued.lane}), so the new numbers are above main's only; ${unseen}`
  const read = queued.read.length === 0 ? 'no other queued git entry is in the lane' : `read the journals of ${queued.read.join(', ')}`
  const unread = queued.unread.length === 0 ? '' : `; could not read ${queued.unread.map(({ entry, why }) => `${entry} (${why})`).join(', ')}, whose numbers are not known`
  return `${read}${unread}; ${unseen}`
}

/**
 * THE NEW NUMBER AND `when` OF EACH MIGRATION A RESULT ADDS, when one of them is behind the journal it lands on. All the
 * added rows move, in their index order, to the next numbers above main's newest and above every number `seen` holds
 * (the migrations the other queued entries carry, theNewestQueued), each `when` after the one before, so two or more keep
 * their order. Above a seen number the first one leaves a gap after main's newest, which the journal allows. A row that
 * would keep its number and `when` is left out.
 */
export function theRenumbering(onto, result, seen = []) {
  if (theMigrationsBehind(onto, result).length === 0) return []
  const held = new Set(onto.entries.map((row) => row.tag))
  const queued = theNewestQueued(onto, result, seen)
  let { idx, when } = theNewestOf(onto)
  if (queued !== null) ({ idx, when } = { idx: Math.max(idx, queued.idx), when: Math.max(when, queued.when) })
  const mappings = []
  for (const row of result.entries.filter((one) => !held.has(one.tag)).sort((a, b) => a.idx - b.idx)) {
    idx++
    when = Math.max(when + 1, row.when)
    const to = `${String(idx).padStart(4, '0')}${row.tag.slice(4)}`
    if (to !== row.tag || when !== row.when) mappings.push({ from: row.tag, to, fromIdx: row.idx, idx, fromWhen: row.when, when })
  }
  return mappings
}

/** What a file must hold to name one of the migrations at all: the first two digits of an old number (`git grep -F`). */
const theLeadingDigits = (mappings) => [...new Set(mappings.map((one) => one.from.slice(0, 2)))]

/**
 * THE FILES THE ENTRY ADDS THAT ARE NAMED FOR A RENUMBERED MIGRATION (wave 13u round 130): each of `paths` that `at` holds
 * and `main` does not, whose name withTheNewNumbers renames, with its new name. The rule is the one the lines follow, so a
 * line naming such a file and the file's name change together. On 30 October 2026 the queue renumbered a handbook
 * migration from 0306 to 0309. It rewrote the schema comment naming the migration's test file but not the file's name,
 * and the lane check refused the entry, because the comment named a file that did not exist. `{ renamed: [{ from, to }] }`,
 * or `{ why }` when a name is one withTheNewNumbers cannot read or its new name is taken.
 */
function theFilesNamedFor(repo, main, at, paths, mappings) {
  const renamed = []
  for (const path of paths) {
    if (!tryGit(repo, ['cat-file', '-e', `${at}:${path}`]).ok || tryGit(repo, ['cat-file', '-e', `${main}:${path}`]).ok) continue
    const said = withTheNewNumbers(path, mappings, null)
    if (said.cannot.length > 0) return { why: aLineItCannotRename(path, said.cannot[0], mappings, `The name of ${path}`) }
    if (said.changed === 0) continue
    if (tryGit(repo, ['cat-file', '-e', `${main}:${said.text}`]).ok || tryGit(repo, ['cat-file', '-e', `${at}:${said.text}`]).ok) return { why: `${path} is named for a migration it renumbers, but ${said.text} is there already, so it was not renumbered.` }
    renamed.push({ from: path, to: said.text })
  }
  return { renamed }
}

/** What a log line adds for the files theFilesNamedFor renamed: nothing when there were none. */
export const theFilesRenamed = (renamed) => renamed.length === 0 ? '' : `; the files named for them were renamed: ${renamed.map((one) => `${one.from} -> ${one.to}`).join(', ')}`

/** The 1-based lines of `path` at `commit` that are not lines of it on `main`: every line when main has no such file. */
const linesAddedSince = (repo, main, commit, path) => theLinesAddedIn(git(repo, [...THE_LINES_ADDED, main, commit, '--', path]))

/**
 * A MIGRATION THAT SITS BEHIND MAIN'S NEWEST IS RENUMBERED AT INTEGRATION (wave 13v round 23), as a collision is
 * (renumberMigrationCollision above), but in the commits themselves: the entry's replayed commits, main..head in the
 * integration clone, are written again so that the commit that first adds a migration adds it under its new number. In
 * each commit: the SQL file is renamed and its bytes are kept word for word, the journal row takes its new index, tag and
 * `when`, tests/what-each-migration-adds/<tag>.json is renamed and its words follow, and in every other file the entry
 * changed, the lines the entry wrote have the old number replaced as withTheNewNumbers says, and a line it lists in
 * `cannot` refuses the whole renumbering before any commit is written. Lines main already holds are not
 * touched. The commit that first adds a migration says so in its message.
 *
 * The new numbers start above main's newest and above every row of `seen`, the migrations the other queued entries carry
 * (theMigrationsQueued in office-keeper.mjs reads them), and the entry's rows go last in the journal (wave 13v round 26).
 *
 * A file the entry adds whose name carries an old number is added under its new name, as theFilesNamedFor says (wave 13u
 * round 130), and a name it cannot read refuses the whole renumbering, as a line does.
 *
 * Returns `{ ok: true, mappings: [] }` when nothing is behind, `{ ok: true, mappings, head, says, because, touched, renamed }`
 * when the commits were written again and the clone checked out at `head`, or `{ ok: false, why, files }` when it cannot be
 * done safely, and then nothing in the clone moved.
 */
export function renumberMigrationsBehindMain(repo, main, head, seen = []) {
  if (!tryGit(repo, ['cat-file', '-e', `${main}:${JOURNAL}`]).ok || !tryGit(repo, ['cat-file', '-e', `${head}:${JOURNAL}`]).ok) return { ok: true, mappings: [] }
  const onto = JSON.parse(textAt(repo, main, JOURNAL)), result = JSON.parse(textAt(repo, head, JOURNAL))
  const mappings = theRenumbering(onto, result, seen)
  if (mappings.length === 0) return { ok: true, mappings: [] }
  const because = whereTheNumbersStart(onto, theNewestQueued(onto, result, seen))
  const mainHolds = new Set(onto.entries.map((row) => row.tag))
  const files = [JOURNAL, ...mappings.map((one) => sqlPath(one.from))]
  const refuse = (why) => ({ ok: false, why, files })
  for (const one of mappings) {
    if (!tryGit(repo, ['cat-file', '-e', `${head}:${sqlPath(one.from)}`]).ok) return refuse(`Migration ${one.from} is in the journal, but ${sqlPath(one.from)} is not in the entry, so it was not renumbered.`)
    const cannot = whyItsSQLCannotMove(textAt(repo, head, sqlPath(one.from)), { tag: one.from, idx: one.fromIdx })
    if (cannot !== null) return refuse(cannot)
    for (const path of [sqlPath(one.to), addsPath(one.to)]) {
      if (one.to !== one.from && tryGit(repo, ['cat-file', '-e', `${main}:${path}`]).ok) return refuse(`Migration ${one.from} would become ${one.to}, but main already has ${path}, so it was not renumbered.`)
    }
  }
  const commits = git(repo, ['rev-list', '--reverse', `${main}..${head}`]).split('\n').filter(Boolean)
  for (const commit of commits) {
    if (git(repo, ['rev-list', '--parents', '-n', '1', commit]).split(' ').length !== 2) return refuse('The entry\'s history is not one line of commits, so its migrations were not renumbered.')
  }
  const changedByTheEntry = git(repo, ['diff', '--name-only', '--no-renames', main, head]).split('\n').filter(Boolean)
  const others = changedByTheEntry.filter((path) => path !== JOURNAL && !mappings.some((one) => path === sqlPath(one.from) || path === addsPath(one.from)))
  const digits = theLeadingDigits(mappings)
  const naming = (commit) => others.length === 0 ? [] : tryGit(repo, ['grep', '-l', '-I', '-F', ...digits.flatMap((word) => ['-e', word]), commit, '--', ...others]).stdout.split('\n').filter(Boolean).map((line) => line.slice(commit.length + 1))
  // A FILE NAME OR A LINE THAT CANNOT BE RENAMED SAFELY (wave 13v rounds 24 and 24b, wave 13u round 130) is refused before
  // any commit is written again.
  const named = theFilesNamedFor(repo, main, head, others, mappings)
  if ('why' in named) return refuse(named.why)
  const newName = new Map(named.renamed.map((one) => [one.from, one.to]))
  for (const path of naming(head)) {
    const said = withTheNewNumbers(textAt(repo, head, path), mappings, linesAddedSince(repo, main, head, path))
    if (said.cannot.length > 0) return refuse(aLineItCannotRename(path, said.cannot[0], mappings))
  }
  const blob = (text) => git(repo, ['hash-object', '-w', '--stdin'], { input: text, stdio: ['pipe', 'pipe', 'pipe'] })
  const entryOf = (commit, path) => {
    const line = git(repo, ['ls-tree', commit, '--', path])
    if (line === '') return null
    const [mode, , hash] = line.split(/\s/)
    return { mode, hash }
  }
  const touched = new Map()
  const firstAdded = new Map()
  let parent = main
  for (const commit of commits) {
    git(repo, ['read-tree', commit])
    for (const one of mappings) {
      const sql = entryOf(commit, sqlPath(one.from))
      if (sql !== null && !firstAdded.has(one.from)) firstAdded.set(one.from, commit)
      if (sql !== null && one.to !== one.from) {
        git(repo, ['update-index', '--force-remove', '--', sqlPath(one.from)])
        git(repo, ['update-index', '--add', '--cacheinfo', sql.mode, sql.hash, sqlPath(one.to)])
      }
      const adds = entryOf(commit, addsPath(one.from))
      if (adds !== null) {
        const said = withTheNewNumbers(textAt(repo, commit, addsPath(one.from)), mappings, null)
        git(repo, ['update-index', '--force-remove', '--', addsPath(one.from)])
        git(repo, ['update-index', '--add', '--cacheinfo', adds.mode, blob(said.text), addsPath(one.to)])
      }
    }
    const journal = entryOf(commit, JOURNAL)
    if (journal !== null) {
      const text = textAt(repo, commit, JOURNAL)
      const rows = JSON.parse(text)
      const renamed = rows.entries.map((row) => {
        const one = mappings.find((each) => each.from === row.tag)
        return one === undefined ? row : { ...row, idx: one.idx, tag: one.to, when: one.when }
      })
      // THE ENTRY'S ROWS GO LAST, after main's, in their new index order (wave 13v round 26). Renamed where it sat, 0215
      // of the entry became 0232 between 0213 and 0227, so 0227 was dated before the row above it.
      const entries = [...renamed.filter((row) => mainHolds.has(row.tag)), ...renamed.filter((row) => !mainHolds.has(row.tag)).sort((a, b) => a.idx - b.idx)]
      if (!same(entries, rows.entries)) git(repo, ['update-index', '--cacheinfo', journal.mode, blob(JSON.stringify({ ...rows, entries }, null, 2) + (text.endsWith('\n') ? '\n' : '')), JOURNAL])
    }
    // A FILE NAMED FOR A MIGRATION is added under its new name in every commit that has it (wave 13u round 130).
    for (const { from, to } of named.renamed) {
      const file = entryOf(commit, from)
      if (file === null) continue
      git(repo, ['update-index', '--force-remove', '--', from])
      git(repo, ['update-index', '--add', '--cacheinfo', file.mode, file.hash, to])
    }
    for (const path of naming(commit)) {
      const lines = linesAddedSince(repo, main, commit, path)
      if (lines.size === 0) continue
      const file = entryOf(commit, path)
      const said = withTheNewNumbers(textAt(repo, commit, path), mappings, lines)
      if (said.changed === 0) continue
      const to = newName.get(path) ?? path
      git(repo, ['update-index', '--cacheinfo', file.mode, blob(said.text), to])
      touched.set(to, Math.max(touched.get(to) ?? 0, said.changed))
    }
    const tree = git(repo, ['write-tree'])
    const [name, email, date] = git(repo, ['show', '-s', '--format=%an%x00%ae%x00%aI', commit]).split('\0')
    const added = mappings.filter((one) => firstAdded.get(one.from) === commit)
    const message = gitBytes(repo, ['show', '-s', '--format=%B', commit]).toString('utf8').trimEnd()
      + (added.length === 0 ? '' : `\n\nThe merge queue renumbered at integration, because ${because}: ${added.map((one) => `${one.from} -> ${one.to}`).join(', ')}.`) + '\n'
    parent = git(repo, ['commit-tree', tree, '-p', parent], {
      input: message, stdio: ['pipe', 'pipe', 'pipe'], env: cleanEnvironment({ ...GIT_IDENTITY, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date }),
    })
  }
  // THE INDEX BACK TO HEAD FIRST: it holds the last tree written above, and a checkout from it would leave the old SQL
  // file behind as if it were untracked.
  git(repo, ['read-tree', 'HEAD'])
  git(repo, ['checkout', '--quiet', '--detach', '-f', parent])
  const says = mappings.map((one) => `${one.from} -> ${one.to} (when ${one.fromWhen} -> ${one.when})`).join(', ')
  return { ok: true, mappings, head: parent, says, because, touched: [...touched].map(([path, count]) => ({ path, count })), renamed: named.renamed }
}
