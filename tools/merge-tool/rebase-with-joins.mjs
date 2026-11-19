// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUEUE'S REBASE WITH ITS JOINS, in one place (wave 13v round 25). The entry's turn (integrate.mjs) runs it in the
 * entry's integration clone, and the early trial below runs it on a scratch copy while the entry waits, so a conflict the
 * early trial reports is the one the turn would stop on, in the same words. The trial replay (trial-replay.mjs) runs it on
 * a scratch copy for a supervisor. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { MergerFailure, fail, log } from './log-and-state.mjs'
import { git, gitIn, probeGit, tryGit } from './git.mjs'
import { renumberMigrationCollision, theFilesRenamed, whatTheQueueSaid } from './migrations.mjs'
import { JOURNAL_JOIN_REFUSED } from './journal-join.mjs'
import { LIST_JOIN_REFUSED } from './list-join.mjs'
import { giveTheCloneTheJoins, saidInTheClone } from './the-joins.mjs'
import { replayArguments, replayMain } from '../../src/shared/merge/landed-history.mjs'
import { theWholeFileKinds, whatTheKindSays } from './whole-file-conflicts.mjs'

/**
 * What git printed, stdout and then stderr. A stopped rebase names the conflict ("CONFLICT (content): ...") on stdout and
 * the commit it could not apply on stderr, so keeping one of the two lost the other (tier 1 of the replay rule, Q5).
 */
const bothStreams = (run) => [run.stdout, run.stderr].filter((said) => said !== '').join('\n')

/**
 * Put the commits of `commit` on top of `main` in `clone`, which has `commit` checked out: the journal join and the list
 * join, `git rebase <main>`, which drops each commit whose patch main already holds, and, when that stops, renumbering a
 * migration collision. `{ ok: true, renumbered }`, with `renumbered` null when nothing was renumbered; or
 * `{ ok: false, files, says, output, stoppedAt }`, where `says` is the bounce's words, `output` what git printed and
 * `stoppedAt` the commit of `commit`'s own that the rebase stopped at. `stoppedAt` is null when the files are from the
 * migration renumbering's replay, which stops at a rebuilt copy of a commit and not at the commit itself.
 *
 * MAIN IS THE UPSTREAM, not the merge-base (wave 13v round 20): the same commits are replayed, upstream..commit, but git
 * drops each one whose patch main already holds, as a plain `git rebase origin/main` does.
 *
 * `queued` is what theMigrationsQueued read of the other queued entries, or null when they were not read; a collision is
 * renumbered above every number in it, as integrate.mjs renumbers a migration behind main (wave 13v round 27).
 */
export function rebaseWithTheJoins(clone, { main, upstream, commit, queued = null }) {
  giveTheCloneTheJoins(clone, (pair) => git(clone, ['config', ...pair]))
  const rebase = tryGit(clone, replayArguments(gitIn(clone), main))
  if (rebase.ok) return { ok: true, renumbered: null }
  let conflicted = tryGit(clone, ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter((one) => one !== '')
  // THE COMMIT IT STOPPED AT is git's REBASE_HEAD until the abort (wave 13u round 77): the trial replay names it.
  const stoppedAt = tryGit(clone, ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD']).stdout || null
  // A STOP ABOUT A WHOLE FILE says its kind (wave 13u round 131, item 51 (b)), read while the stop still stands.
  const kinds = stoppedAt === null ? [] : wholeFileKindsAt(clone, stoppedAt)
  tryGit(clone, ['rebase', '--abort'])
  const journalRefused = saidInTheClone(clone, JOURNAL_JOIN_REFUSED)
  if (journalRefused !== '') log(`the migration journal was not joined by itself: ${journalRefused}`)
  const listRefused = saidInTheClone(clone, LIST_JOIN_REFUSED)
  if (listRefused !== '') log(`the merge driver did not join a conflict: ${listRefused.split('\n').join(' ')}`)
  if (conflicted.length === 0) fail(`git rebase ${main} failed in ${clone} with no conflicted path: ${bothStreams(rebase)}`)
  // Only independent migration additions may be renumbered after a conflict.
  const renumbered = renumberMigrationCollision(clone, upstream, commit, main, conflicted, queued?.rows ?? [])
  if (renumbered.ok) {
    log(`Migrations renumbered in queue commit ${renumbered.commit}, because ${renumbered.because}: ${renumbered.says}${theFilesRenamed(renumbered.renamed)}. Of the other queued entries: ${whatTheQueueSaid(queued)}`)
    return { ok: true, renumbered }
  }
  if (renumbered.files?.length > 0) conflicted = renumbered.files
  // The renumbering's replay stops at a rebuilt copy of a commit, so the kinds read at the first stop are not its own.
  const told = renumbered.files?.length > 0 ? '' : kinds.map((kind) => ` ${whatTheKindSays(kind)}`).join('')
  return {
    ok: false,
    files: conflicted,
    stoppedAt: renumbered.files?.length > 0 ? null : stoppedAt,
    output: bothStreams(rebase),
    says: `git rebase ${main.slice(0, 12)} stopped on a conflict it does not resolve in ${conflicted.join(', ')}.${told}${journalRefused ? ` The migration journal was not joined: ${journalRefused}` : ''}${listRefused ? ` ${listRefused.split('\n').join(' ')}` : ''}${renumbered.why ? ` Migration recovery refused: ${renumbered.why}` : ''}`,
  }
}

/** The whole-file conflicts of the stop at the entry's commit `stoppedAt`, with main's side at HEAD; git that does not answer stops the tool. */
function wholeFileKindsAt(clone, stoppedAt) {
  try {
    return theWholeFileKinds((args) => probeGit(clone, args), { ancestor: git(clone, ['rev-parse', `${stoppedAt}^`]), main: git(clone, ['rev-parse', 'HEAD']), entry: stoppedAt })
  } catch (err) {
    if (err instanceof MergerFailure) throw err
    fail(`the kinds of the stop at ${stoppedAt} in ${clone} could not be read: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * A SCRATCH COPY OF `root` AT `clone`, standing at `tip`. It borrows root's objects and writes nothing in root. The early
 * trial below and the trial replay (trial-replay.mjs, wave 13u round 77) replay in one. Answers where `tip` forks from
 * `main`.
 */
export function aScratchCopy(root, main, tip, clone) {
  rmSync(clone, { recursive: true, force: true })
  mkdirSync(dirname(clone), { recursive: true })
  const upstream = git(root, ['merge-base', tip, replayMain(gitIn(root), main)])
  git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, clone])
  git(clone, ['checkout', '--quiet', '--detach', tip])
  return upstream
}

/**
 * THE REBASE TRIED EARLY, ON A SCRATCH COPY (wave 13v round 25). The early replay (early-conflicts.mjs)
 * stops at the first conflicting commit and tries no join, so a conflict only in migration or list files waited for the
 * entry's turn. On 11 October 2026 six entries waited between one and two hours after the replay had seen theirs, and then
 * the rebase stopped on it. This runs that rebase now, in `<folder>/clone`, which is removed again; nothing in `root`
 * moves. `{ resolved: true }`; `{ resolved: false, files, says, log }`, with what git printed kept at `<folder>/conflict.log`;
 * or `{ resolved: null, why }` when the trial could not be run, which decides nothing. What it found is logged.
 */
export function tryTheRebaseEarly(root, main, tip, folder) {
  const clone = join(folder, 'clone')
  try {
    const upstream = aScratchCopy(root, main, tip, clone)
    const rebased = rebaseWithTheJoins(clone, { main, upstream, commit: tip })
    if (rebased.ok) {
      log(`the queue's rebase, tried early on a scratch copy, puts ${tip} on main ${main}: its joins resolve the conflict, so the entry keeps its place`)
      return { resolved: true }
    }
    const conflictLog = join(folder, 'conflict.log')
    writeFileSync(conflictLog, `git rebase ${main} in ${clone}, tried early on a scratch copy:\n${rebased.output}\n`)
    log(`the queue's rebase, tried early on a scratch copy of ${tip}, stops: ${rebased.says}`)
    return { resolved: false, files: rebased.files, says: rebased.says, log: conflictLog }
  } catch (err) {
    if (!(err instanceof MergerFailure)) throw err
    log(`the queue's rebase could not be tried early on ${tip}: ${err.message}; the entry's turn decides`)
    return { resolved: null, why: err.message }
  } finally {
    rmSync(clone, { recursive: true, force: true })
  }
}
