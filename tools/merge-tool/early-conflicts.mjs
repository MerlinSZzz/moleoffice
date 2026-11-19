// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import './a-library-is-not-a-program.mjs'
import { aResolutionPassedItsCheck } from '../../src/shared/merge-queue.ts'
import { howAFileJoins, joinTheListTexts } from './list-join.mjs'
import { replayMain } from '../../src/shared/merge/landed-history.mjs'
import { theWholeFileKinds, thePathsOf, whatTheKindSays } from './whole-file-conflicts.mjs'

/**
 * Replay each commit into unreferenced git objects. No branch or working tree moves.
 *
 * A COMMIT WHOSE PATCH MAIN ALREADY HOLDS IS NOT REPLAYED (wave 13v round 20), as `git rebase <main>` and `git cherry`
 * decide it: by patch id, over main...tip. A round built on its predecessor's queued commits carries copies of them, and
 * once the predecessor lands those copies are on main under other hashes; replaying them again stopped on lines a later
 * landed commit had changed. A copy whose patch differs from what landed is still replayed, and still stops.
 *
 * EACH REPLAYED COMMIT CARRIES THE DATE OF THE COMMIT IT REPLAYS (wave 13u round 178), as replayMain's upstream does, and
 * `probe(root, args, variables)` runs git with `variables` added. A probe with nothing new then makes the same commits,
 * which git already holds; at the current time, every probe in a later second wrote new ones.
 */
export function replayConflictProbe(root, main, tip, probe) {
  const checked = (args, variables) => {
    const result = probe(root, args, variables)
    if (result.status !== 0) throw Error(`${args[0]} exited ${String(result.status)}: ${result.error?.message ?? result.stderr}`)
    return result.stdout.trim()
  }
  try {
    checked(['merge-base', main, tip])
    const upstream = replayMain(checked, main)
    const commits = checked(['rev-list', '--reverse', '--topo-order', '--cherry-pick', '--right-only', `${upstream}...${tip}`]).split('\n').filter(Boolean)
    let placed = main
    for (const commit of commits) {
      const parents = checked(['rev-list', '--parents', '-n', '1', commit]).split(' ')
      if (parents.length !== 2) throw Error(`Commit ${commit} is not a single-parent commit; its replay is not known.`)
      const result = probe(root, ['merge-tree', `--merge-base=${parents[1]}`, '--write-tree', '--name-only', '-z', placed, commit])
      if (result.status !== 0) return { ...result, commit, parent: parents[1], placed }
      const tree = result.stdout.split('\0')[0]
      const at = checked(['log', '-1', '--format=%cd', '--date=raw', commit])
      placed = checked(['-c', 'user.name=Merge replay probe', '-c', 'user.email=probe@invalid', 'commit-tree', tree, '-p', placed, '-m', 'Unreferenced early conflict replay'], { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at })
    }
    return { status: 0, stdout: '', stderr: '' }
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
}

export const MIGRATION_JOURNAL = 'drizzle/meta/_journal.json'
export const MIGRATION_CASES = 'tests/migration.test.ts'

/**
 * A CONFLICT THE QUEUE MAY STILL RENUMBER: every path is the migration journal, the migration cases or one migration's
 * SQL. The queue's rebase tries renumbering only then (migrations.mjs), so an early probe does not send it back.
 */
export function onlyInMigrationFiles(paths) {
  return paths.every((path) => path === MIGRATION_JOURNAL || path === MIGRATION_CASES || /^drizzle\/\d{4}_[^/]+\.sql$/.test(path))
}

/** The 1-based line ranges of git's conflict markers in one file, "3-9, 20-24", or why there are none to give. */
function conflictLines(root, tree, path, probe) {
  const shown = probe(root, ['cat-file', 'blob', `${tree}:${path}`])
  if (shown.status !== 0) return { path, why: `git wrote no file at this path in the replayed tree: ${String(shown.stderr ?? '').trim() || `exit ${String(shown.status)}`}` }
  const ranges = []
  let start = null
  shown.stdout.split('\n').forEach((line, index) => {
    if (/^<{7,}(?: |$)/.test(line)) start = index + 1
    else if (/^>{7,}(?: |$)/.test(line) && start !== null) { ranges.push(`${String(start)}-${String(index + 1)}`); start = null }
  })
  return ranges.length > 0 ? { path, ranges: ranges.join(', ') } : { path, why: 'git wrote no conflict markers in it: the two sides disagree about the file itself, such as one deleting or renaming it' }
}

/**
 * WHETHER A GIT ENTRY JOINS MAIN THE WAY THE QUEUE'S REBASE WILL PUT IT THERE (integrate.mjs), each commit replayed in
 * turn into unreferenced objects. `{ joins: true }`; `{ joins: false, commit, files, lines, mayRenumber }`, where
 * `commit` is the entry's commit that stopped, with `mayJoin` and `joinsBy` when the rebase's joins may take that stop;
 * or `{ joins: null, why }` when the probe gave no answer.
 */
export function canItJoin(root, main, tip, probe) {
  const result = replayConflictProbe(root, main, tip, probe)
  if (result.status === 0) return { joins: true }
  if (result.status !== 1) return { joins: null, why: `the probe gave no result (exit ${String(result.status)}): ${result.error?.message ?? result.stderr}` }
  // With -z, the tree is followed by conflicting filenames, an empty item, then explanatory messages.
  const fields = result.stdout.split('\0')
  const boundary = fields.indexOf('', 1)
  const files = fields.slice(1, boundary < 0 ? fields.length : boundary).filter(Boolean)
  if (files.length === 0) return { joins: null, why: 'the probe reported a conflict without filenames' }
  const mayRenumber = onlyInMigrationFiles(files)
  const joinsBy = mayRenumber ? null : theListsJoin(root, result, files, probe)
  const lines = files.map((path) => conflictLines(root, fields[0], path, probe))
  // A PATH WITH NO MARKERS IS TOLD BY ITS KIND where git stopped about the whole file (wave 13u round 131, item 51 (b)).
  if (lines.some((line) => line.why !== undefined)) {
    let kinds
    try {
      kinds = theWholeFileKinds((args) => probe(root, args), { ancestor: result.parent, main: result.placed, entry: result.commit })
    } catch (error) {
      return { joins: null, why: `the kinds of the conflict at ${result.commit} could not be read: ${error instanceof Error ? error.message : String(error)}` }
    }
    for (const line of lines) {
      const kind = kinds.find((one) => thePathsOf(one).includes(line.path))
      if (line.why !== undefined && kind !== undefined) line.why = whatTheKindSays(kind)
    }
  }
  return { joins: false, commit: result.commit, files, lines, mayRenumber, ...(joinsBy === null ? {} : { mayJoin: true, joinsBy }) }
}

/**
 * WHETHER THE REBASE'S JOINS TAKE THIS STOP (list-join.mjs, wave 13v round 22; tier 1 of the list-join rule): every
 * conflicted path is a migration file, which the rebase may join or renumber, or one the merge driver joins at the
 * stopping commit, by the rules it names (howAFileJoins).
 * The probe does not go past that commit, so a later commit's conflict is left to the rebase, as a migration conflict
 * is. The paths each with how it may be joined, or null.
 */
function theListsJoin(root, result, files, probe) {
  const joined = files.filter((path) => !onlyInMigrationFiles([path]))
  if (joined.length === 0 || !joined.every((path) => howAFileJoins(path) !== null)) return null
  const blob = (at, path) => {
    const shown = probe(root, ['cat-file', 'blob', `${at}:${path}`])
    return shown.status === 0 ? shown.stdout : null
  }
  const ways = new Map()
  for (const path of joined) {
    const sides = [result.parent, result.placed, result.commit].map((at) => blob(at, path))
    const join = sides.includes(null) ? null : joinTheListTexts(path, ...sides)
    if (join === null || 'refused' in join) return null
    ways.set(path, join.rules.length > 0 ? join.rules.join(', ') : "git's own merge")
  }
  return files.map((path) => `${path} (${ways.get(path) ?? 'a migration file'})`)
}

/**
 * Probe each git entry still waiting for the merge tool, pinned or judged, against main after a landing. The tool never
 * moves the entry or any git ref: the office bounces what cannot join when it hears the landing.
 *
 * A CONFLICT ONLY WHERE THE REBASE MAY JOIN IT IS GIVEN TO THE QUEUE'S REBASE NOW (wave 13v round 25): `tryTheRebase(entry)`
 * runs it with its joins on a scratch copy (rebase-with-joins.mjs). When it stops, the warning carries `rebaseStopped`
 * and the office sends the entry back, found early; when the joins resolve it, nothing is said and the entry keeps its
 * place; when it could not be tried, the warning is what it was before.
 */
export async function probeWaitingEntries({ root, main, entries, probe, notify, remembered, remember, log, tryTheRebase }) {
  for (const entry of entries) {
    if (!['pinned', 'judged'].includes(entry.state) || entry.changeset.adapter !== 'git' || entry.changeset.root !== root) continue
    if (aResolutionPassedItsCheck(entry.machine?.resolution)) {
      log(`early conflict probe for ${entry.id}: not probed, because its turn integrates the resolution its check passed and not its own commit`)
      continue
    }
    const key = `${main}:${entry.id}:${entry.changeset.commit}`
    if (remembered.includes(key)) continue
    const found = canItJoin(root, main, entry.changeset.commit, probe)
    if (found.joins === true) continue
    if (found.joins === null) { log(`early conflict probe for ${entry.id}: ${found.why}`); continue }
    const tried = found.mayRenumber || found.mayJoin ? await tryTheRebase(entry) : undefined
    if (tried?.resolved === true) continue
    if (tried?.resolved === false) {
      await notify({ entry: entry.id, tip: entry.changeset.commit, files: tried.files, commit: found.commit, rebaseStopped: { files: tried.files, log: tried.log, says: tried.says } })
      remember(key)
      remembered.push(key)
      log(`early conflict for ${entry.id}: the queue's rebase, tried on a scratch copy, stops in ${tried.files.join(', ')}, so the office sends it back now`)
      continue
    }
    if (found.mayJoin) { log(`early conflict for ${entry.id} at its commit ${found.commit} only where the rebase may join it (${found.joinsBy.join(', ')}), so it is not sent back`); continue }
    await notify({ entry: entry.id, tip: entry.changeset.commit, files: found.files, commit: found.commit, lines: found.lines, ...(found.mayRenumber ? { mayRenumber: true } : {}) })
    remember(key)
    remembered.push(key)
    log(`early conflict for ${entry.id} at its commit ${found.commit}: ${found.files.join(', ')}${found.mayRenumber ? '; only migration files, which the queue may renumber' : ''}`)
  }
}
