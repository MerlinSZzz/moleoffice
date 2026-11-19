// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONFLICT ABOUT A WHOLE FILE, TOLD BY ITS KIND (wave 13u round 131, item 51 (b); the decision on conflicts,
 * two tiers, as this line reads it). Git can stop on a commit about a file as a whole, and not only about its lines.
 * Such a stop is not a cannot by its kind:
 *   - the same file renamed differently on each side is resolvable: main's name stands, and the entry's changes go into
 *     main's file;
 *   - a file deleted on one side and changed or renamed on the other is a cannot, because keeping both would change what
 *     one side meant, so the entry is cut again from current main;
 *   - a file renamed on one side and changed on the other is resolvable in the renamed file, where git leaves its lines;
 *   - a file added on both sides is an ordinary conflict of lines in that file.
 * The queue's rebase (rebase-with-joins.mjs) and its early replay (early-conflicts.mjs) say the kind, the clean copy a
 * supervisor resolves in (resolve-a-conflict.mjs) acts on it, and the merge tool's check of the resolution
 * (check-a-resolution.mjs) holds the resolution to it, so all four read it here.
 *
 * IT READS NONE OF THE MERGE TOOL'S ARGUMENTS, so the clean copy can import it. Git is run by the caller's
 * `runGit(args)`, which answers `{ status, stdout, stderr }` and does not throw.
 */
import './a-library-is-not-a-program.mjs'

const A_CANNOT = 'and keeping both would change what one side meant, so the entry has to be cut again from current main.'

/**
 * THE WHOLE-FILE CONFLICTS OF ONE COMMIT'S REPLAY. `git merge-tree` merges `entry` onto `main` with `ancestor` as the
 * base, as the rebase's stop at `entry` did, and its messages say which paths git disagreed about as files. Each merge
 * driver is set to keep main's side, so no join runs a second time or writes to its log; the files a driver joins are
 * conflicts of lines anyway. The kinds, each one of:
 *   `{ kind: 'renamed', ancestor, main, entry }`, the same file renamed differently on each side;
 *   `{ kind: 'deleted', path, deletedOn, renamedTo }`, deleted on `deletedOn` ('main' or 'the entry') and changed on the
 *     other side, or renamed there to `renamedTo`, which is otherwise null;
 *   `{ kind: 'renamed-and-changed', path, renamedOn }`, renamed to `path` on `renamedOn` and changed on the other side;
 *   `{ kind: 'added', path }`, added on both sides.
 * A conflict of lines in a file both sides hold under the ancestor's name has no kind. Git that does not answer throws.
 */
export function theWholeFileKinds(runGit, { ancestor, main, entry }) {
  const drivers = runGit(['config', '--get-regexp', '^merge\\..+\\.driver$'])
  const names = drivers.status === 0 ? drivers.stdout.split('\n').map((row) => /^merge\.(.+)\.driver /su.exec(row)?.[1]).filter((name) => name !== undefined) : []
  const args = [...names.flatMap((name) => ['-c', `merge.${name}.driver=true`]), 'merge-tree', '--write-tree', '-z', `--merge-base=${ancestor}`, main, entry]
  const merged = runGit(args)
  if (merged.status === 0) return []
  if (merged.status !== 1) throw Error(`git ${args.join(' ')} exited ${String(merged.status)}: ${String(merged.stderr ?? '').trim() || 'it said nothing'}`)
  // THE TREE, then one `mode object stage<TAB>path` field for each stage left in conflict, an empty field, and then the
  // messages, each its count of paths, the paths, its type and its words.
  const fields = merged.stdout.split('\0')
  const stages = new Map()
  let at = 1
  for (; at < fields.length && fields[at] !== ''; at += 1) {
    const row = /^[0-7]{6} [0-9a-f]+ ([123])\t(.*)$/su.exec(fields[at])
    if (row === null) throw Error(`git merge-tree wrote ${JSON.stringify(fields[at])} where a stage left in conflict belongs.`)
    stages.set(row[2], new Set([...(stages.get(row[2]) ?? []), row[1]]))
  }
  const messages = []
  for (at += 1; at < fields.length && fields[at] !== ''; ) {
    const count = Number(fields[at])
    messages.push({ paths: fields.slice(at + 1, at + 1 + count), type: fields[at + 1 + count] })
    at += count + 3
  }
  const holds = (commit, path) => runGit(['cat-file', '-e', `${commit}:${path}`]).status === 0
  const atStage = (path, stage) => stages.get(path)?.has(stage) === true
  const kinds = []
  for (const { paths, type } of messages) {
    if (type === 'CONFLICT (rename/rename)' && paths.length === 3) {
      const [from, one, other] = paths
      const mains = atStage(one, '2') ? one : other
      kinds.push({ kind: 'renamed', ancestor: from, main: mains, entry: mains === one ? other : one })
    } else if (type === 'CONFLICT (modify/delete)' && paths.length === 1) {
      kinds.push({ kind: 'deleted', path: paths[0], deletedOn: atStage(paths[0], '2') ? 'the entry' : 'main', renamedTo: null })
    } else if (type === 'CONFLICT (rename/delete)' && paths.length === 2) {
      const renamedTo = paths.find((path) => stages.has(path)) ?? paths[0]
      kinds.push({ kind: 'deleted', path: paths.find((path) => path !== renamedTo), deletedOn: atStage(renamedTo, '2') ? 'the entry' : 'main', renamedTo })
    } else if (type === 'CONFLICT (contents)' && paths.length === 1) {
      const [path] = paths
      if (!atStage(path, '1')) kinds.push({ kind: 'added', path })
      else if (!holds(ancestor, path) && holds(main, path) !== holds(entry, path)) kinds.push({ kind: 'renamed-and-changed', path, renamedOn: holds(main, path) ? 'main' : 'the entry' })
    }
  }
  return kinds
}

/** The paths a kind is about. */
export const thePathsOf = (kind) => (kind.kind === 'renamed' ? [kind.ancestor, kind.main, kind.entry] : [kind.path, ...(kind.renamedTo ? [kind.renamedTo] : [])])

/** Whether keeping both sides of this kind would change what one side meant. */
export const isACannot = (kind) => kind.kind === 'deleted'

/** The sentence that says the kind, and what is done with it. */
export function whatTheKindSays(kind) {
  const other = (side) => (side === 'main' ? 'by the entry' : 'on main')
  const on = (side) => (side === 'main' ? 'on main' : 'by the entry')
  if (kind.kind === 'renamed') return `${kind.ancestor} was renamed to ${kind.main} on main and to ${kind.entry} by the entry. Main's name stands, so the entry's changes go into ${kind.main}, and ${kind.entry} is not kept.`
  if (kind.kind === 'deleted') return `${kind.path} was deleted ${on(kind.deletedOn)} and ${kind.renamedTo === null ? 'changed' : `renamed to ${kind.renamedTo}`} ${other(kind.deletedOn)}, ${A_CANNOT}`
  if (kind.kind === 'renamed-and-changed') {
    return `${kind.path} was renamed ${on(kind.renamedOn)} and changed ${other(kind.renamedOn)}, so ${kind.renamedOn === 'main' ? "the entry's" : "main's"} change goes into ${kind.path}, where git left its lines in conflict.`
  }
  return `${kind.path} was added on both sides with different contents, so it is a conflict of lines in that one file.`
}
