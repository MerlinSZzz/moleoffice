// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE TOOL'S CHECK OF A RESOLUTION A SUPERVISOR HANDED OVER (tier 2 of the resolution rule, round B;
 * answer 1). A `--check-resolution` run calls it for a resolving entry whose resolution waits for it
 * (`aResolutionWaitsForItsCheck`, src/shared/merge-queue.ts). It runs no model and decides nothing: it reports the step
 * `resolution-checked`, passed or refused, and the office moves the entry.
 *
 * WHAT IT PROVES. It replays the entry's commit, or an earlier checked fix, onto the main the replay met, as the clean copy did
 * (resolve-a-conflict.mjs), in a clone of its own at <workdir>/resolution/clone, with the same joins (the-joins.mjs).
 * At each stop it pairs the entry's commit the replay stopped on (REBASE_HEAD) with the resolution's commit that carries
 * its message, and takes from that commit only the paths git left in conflict, and nothing else:
 *   - at the first stop every path is one the conflict step named; later stops of the same replay may hold further
 *     paths, which are checked in the same way and whose places are carried too;
 *   - each resolved file keeps the conflicted text outside its places, line for line (conflicted-file.mjs), and keeps
 *     the mode one of the two sides had;
 *   - a stop about a whole file is held to its kind (whole-file-conflicts.mjs): a file deleted on one side and changed
 *     on the other is refused with the cannot, and a file each side renamed differently is resolved in main's file
 *     alone, which is checked against the three-way merge of the ancestor's, main's and the entry's files;
 *   - with those paths taken, the tree is the resolution's commit's tree, so every other path is git's own result, and
 *     it is not the tree the replay had before that commit, which git's own replay would drop;
 *   - where the stop renamed a migration differently on each side, a file git merged with no conflict may differ from
 *     git's own result in one way only: the lines the entry wrote take main's number, by the queue's renumbering
 *     (new-numbers.mjs). Any other change there, or a line that rule cannot read, is refused (wave 13u round 132, item 51).
 * Where the resolution holds no commit with that message, the supervisor took main's side and git dropped the commit,
 * which was then empty: the check takes main's side in those paths, refuses when the commit still changes anything,
 * and lets its own replay drop the commit too. Those places name no commit of the resolution. Two commits of the entry,
 * or of the resolution, with the message of the commit stopped on leave the pairing unknown, and are refused.
 * At the end the replay has as many commits as the resolution, each with the same message and the same tree, and the
 * files the resolution changes against that main have the hashes and modes the hand-over door recorded. A test run the
 * supervisor declared with the hand-over must have run at the resolution's commit; nothing else of it is read.
 * For a red test, the replay must not stop. The resolution keeps every replayed message and tree in order, then adds
 * commits that change at least one path against that replay's tip. The step carries those paths, sorted and unique,
 * as fixed, with no places. In either mode an earlier checked fix named by resolving.replays replaces the pinned base.
 *
 * WHAT IT READS. The resolution is fetched from the supervisor's folder into the lane's repository, as the pin fetches
 * a sealed commit, once that folder's HEAD is still the commit the door read. Nothing of the resolution's tree runs:
 * the clone is checked out and replayed by git alone, so no sandbox is started. Every git command of this run carries
 * `-c gc.auto=0` (git.mjs), because another entry's run may be working in the lane's repository.
 *
 * WHAT IT HANDS ON for the scoped check (part 6): each place, with the ancestor's, main's and the entry's lines and the
 * resolution's, and main's commits that wrote main's lines there, found by `git blame` of main's lines on the commit
 * the replay stopped on. Where main's side has no line, or its lines cannot be found in main's file, the commits are
 * those that changed the file on main, and `mainBy` says which of the two was read. The office names the merge entry
 * that landed each of those commits.
 */

import './a-library-is-not-a-program.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import { replayArguments, replayMain } from '../../src/shared/merge/landed-history.mjs'
import { join } from 'node:path'

import { theConflictedText, theConflictedTextOfARename, theResolvedPlaces } from './conflicted-file.mjs'
import { WORKDIR, chosen } from './arguments.mjs'
import { git, gitBytes, gitIn, hashAt, probeGit, tryGit } from './git.mjs'
import { isACannot, thePathsOf, theWholeFileKinds, whatTheKindSays } from './whole-file-conflicts.mjs'
import { THE_FILES_A_STOP_CHANGES, THE_LINES_ADDED, aLineItCannotRename, aMergedFileWithMainsNumbers, theLinesAddedIn, theRenumberingAtAStop } from './new-numbers.mjs'
import { fail, log } from './log-and-state.mjs'
import { giveTheCloneTheJoins } from './the-joins.mjs'
import { HOW_MUCH_A_RESOLUTION_CHECK_REPORTS, resolvedRefOf } from '../../src/shared/merge-queue.ts'

/** How much of the places the step carries (src/shared/merge-queue.ts). The rest is counted. */
const { lines: MOST_LINES, characters: MOST_CHARACTERS, mainCommits: MOST_MAIN_COMMITS, places: MOST_PLACES, fixed: MOST_FIXED, bytes: MOST_BYTES, says: MOST_SAID } = HOW_MUCH_A_RESOLUTION_CHECK_REPORTS

/** What the check says when its caller gives it no step. */
export const THE_RESOLUTION_CHECK_NEEDS_STEP = 'checkTheResolution needs step from its caller, as the-merger.mjs passes office-keeper.mjs\'s, so that check-a-resolution.mjs reaches no office module itself.'

class Refused extends Error {}

/** @returns {never} */
function refuse(said) {
  throw new Refused(said)
}

const nul = (said) => said.split('\0').filter((one) => one !== '')

/** One side of a place as the step carries it: at most MOST_LINES lines, each cut at MOST_CHARACTERS, and how many more. */
function aSide(lines) {
  const cut = (line) => (line.length <= MOST_CHARACTERS ? line : `${line.slice(0, MOST_CHARACTERS)} …(${String(line.length - MOST_CHARACTERS)} more characters)`)
  return { lines: lines.slice(0, MOST_LINES).map(cut), more: Math.max(0, lines.length - MOST_LINES) }
}

/** The mode of `path` in `commit`, or null when the commit has no such path. */
function modeAt(repo, commit, path) {
  const row = git(repo, ['ls-tree', '-z', commit, '--', path]).split('\0')[0] ?? ''
  return row === '' ? null : row.split(' ')[0]
}

/** The text of `path` in `commit`. */
const textAt = (repo, commit, path) => gitBytes(repo, ['cat-file', 'blob', `${commit}:${path}`]).toString('utf8')

/** The whole message of `commit`. */
const messageOf = (repo, commit) => git(repo, ['log', '-1', '--format=%B', commit])

/** Commits as a sentence names them, twelve characters each: "A and B", or "A, B and C". */
function named(commits) {
  const short = commits.map((one) => one.slice(0, 12))
  return short.length < 2 ? short.join('') : `${short.slice(0, -1).join(', ')} and ${short.at(-1)}`
}

/** Paths as a sentence names them: the first 20, and how many more. */
const pathsNamed = (paths) => `${paths.slice(0, 20).join(', ')}${paths.length > 20 ? ` and ${String(paths.length - 20)} more` : ''}`

/**
 * THE POINT WHERE THE ENTRY LEFT MAIN: the first commit main holds on the first parents of `base`. The first parents
 * are the branch's own commits, because a merge of main on the branch takes main as its second parent. The merge base
 * of `base` and main is not this point for a branch that merged main: it is then the last commit of main the branch
 * merged, which is later.
 */
function whereTheEntryLeftMain(root, base, mainAt) {
  const notOnMain = new Set(git(root, ['rev-list', `${mainAt}..${base}`]).split('\n').filter((one) => one !== ''))
  // Each first parent before the point is a commit main does not hold, so the point is within one more than their count.
  const firstParents = git(root, ['rev-list', '--first-parent', `--max-count=${String(notOnMain.size + 1)}`, base]).split('\n')
  const left = firstParents.find((one) => !notOnMain.has(one))
  if (left === undefined) fail(`The first parents of ${base} reach no commit that main ${mainAt} holds, so the check cannot tell where the entry left main.`)
  return left
}

/**
 * MAIN'S COMMITS THAT WROTE THE LINES OF MAIN'S SIDE of each place of one path, at a stop. Main's side is a run of the
 * lines of `HEAD:path`, and the places come in the order of the file, so each is looked for after the one before it.
 * Only commits main made since the entry left main (`sinceTheFork`) are kept; the replayed commits of the entry are not
 * main's. The file's commits, where no line is found, are counted from the same point, `leftMainAt` (wave 13u round
 * 130). From the merge base, on a branch that merged main, they left out main's commits from before the last merge.
 */
function mainsCommitsAt(clone, path, places, sinceTheFork, mainAt, leftMainAt) {
  const lines = textAt(clone, 'HEAD', path).split('\n')
  const byFile = () => git(clone, ['log', '--format=%H', `${leftMainAt}..${mainAt}`, '--', path]).split('\n').filter((one) => one !== '').slice(0, MOST_MAIN_COMMITS)
  let from = 0
  return places.map((place) => {
    const run = place.main
    let at = -1
    if (run.length > 0) {
      for (let start = from; start + run.length <= lines.length && at === -1; start += 1) {
        if (run.every((line, offset) => lines[start + offset] === line)) at = start
      }
    }
    if (at === -1) return { mainCommits: byFile(), mainBy: 'file' }
    from = at + run.length
    const blamed = git(clone, ['blame', '--porcelain', '-L', `${String(at + 1)},${String(at + run.length)}`, 'HEAD', '--', path])
    const commits = []
    for (const row of blamed.split('\n')) {
      const header = /^([0-9a-f]{40,64}) \d+ \d+/u.exec(row)
      if (header !== null && sinceTheFork.has(header[1]) && !commits.includes(header[1])) commits.push(header[1])
    }
    return commits.length === 0 ? { mainCommits: byFile(), mainBy: 'file' } : { mainCommits: commits.slice(0, MOST_MAIN_COMMITS), mainBy: 'lines' }
  })
}

/** The whole-file conflicts of the stop at the entry's commit `stoppedAt`, with main's side at HEAD; git that does not answer stops the tool. */
function theKindsAt(clone, stoppedAt) {
  const sides = { ancestor: git(clone, ['rev-parse', `${stoppedAt}^`]), main: git(clone, ['rev-parse', 'HEAD']), entry: stoppedAt }
  try {
    return theWholeFileKinds((args) => probeGit(clone, args), sides)
  } catch (err) {
    fail(`the kinds of the stop at ${stoppedAt} in ${clone} could not be read: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * THE CHECK ITSELF: `{ places }` when the resolution passes, or a Refused naming the first thing that does not hold.
 * Git that cannot run at all stops the tool (git.mjs `fail`), which is no answer about the resolution.
 */
function theCheck(entry, resolution, resolving) {
  const root = entry.changeset.root
  const base = resolving.replays?.commit ?? entry.changeset.commit
  const baseName = resolving.replays === undefined ? `The pinned commit ${base}` : `The earlier checked fix ${base} from ${resolving.replays.ref}`
  const red = resolving.red !== undefined
  const { commit, mainAt, workingDirectory } = resolution
  if (!tryGit(root, ['cat-file', '-e', `${base}^{commit}`]).ok) {
    refuse(`The replay base ${base} from ${resolving.replays?.ref ?? 'the pinned entry'} is not in the lane's repository ${root}, so this resolution cannot be checked.`)
  }
  // THE SUPERVISOR'S OWN TEST RUN, AS DECLARED, IS A RUN OF THIS RESOLUTION (answer 3). The check reads
  // only its commit: what the run found is evidence for the inspector, and decides nothing here.
  const declared = resolution.tests
  if (declared !== undefined && declared !== null && declared.commit !== commit) {
    refuse(`The test run declared with this hand-over ran at commit ${String(declared.commit)}, and the resolution's commit is ${commit}, so it is not a run of this resolution. Hand the resolution over again with a run at its commit, or with none.`)
  }
  // THE FOLDER STILL SHOWS THE COMMIT THE DOOR READ. The supervisor keeps its HEAD there until the entry ends.
  const head = tryGit(root, ['ls-remote', workingDirectory, 'HEAD'])
  const shown = head.ok ? head.stdout.split(/\s/u)[0] : null
  if (shown !== commit) {
    refuse(head.ok
      ? `The HEAD of ${workingDirectory} is ${shown || 'no commit'}, not the resolution's commit ${commit}, which the hand-over door read there. The folder must keep its HEAD at the resolution until the entry ends.`
      : `git could not read the HEAD of ${workingDirectory}, where the resolution was handed over: ${head.stderr || 'it said nothing'}.`)
  }
  if (!tryGit(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) {
    log(`fetching the resolution ${commit} from ${workingDirectory} into ${root}`)
    git(root, ['fetch', '--no-tags', '--no-write-fetch-head', workingDirectory, commit])
  }
  const merges = git(root, ['rev-list', '--merges', `${mainAt}..${commit}`])
  if (merges !== '') refuse(`The resolution's commits on top of main ${mainAt.slice(0, 12)} hold a merge commit, ${merges.split('\n')[0]}, and the replay of the entry makes none.`)
  const leftMainAt = whereTheEntryLeftMain(root, base, mainAt)
  const sinceTheFork = new Set(git(root, ['rev-list', `${leftMainAt}..${mainAt}`]).split('\n').filter((one) => one !== ''))
  const theirs = git(root, ['rev-list', '--reverse', `${mainAt}..${commit}`]).split('\n').filter((one) => one !== '')
  // THE ENTRY'S COMMITS THE REPLAY REPLAYS, which are those `git rebase` takes: on top of main, and no merge.
  const upstream = replayMain(gitIn(root), mainAt)
  const replayed = git(root, ['rev-list', '--reverse', '--no-merges', `${upstream}..${base}`]).split('\n').filter((one) => one !== '')

  const folder = join(WORKDIR, 'resolution')
  const clone = join(folder, 'clone')
  rmSync(clone, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, clone])
  git(clone, ['checkout', '--quiet', '--detach', base])
  giveTheCloneTheJoins(clone, (pair) => git(clone, ['config', ...pair]))
  // A resolution git recorded elsewhere is never reused here: the check reads only what was handed over.
  git(clone, ['config', 'rerere.enabled', 'false'])

  let replay = tryGit(clone, replayArguments(gitIn(clone), mainAt))
  if (red && !replay.ok) {
    const left = nul(git(clone, ['diff', '--name-only', '-z', '--diff-filter=U']))
    refuse(`The replay of ${base} onto main ${mainAt} stopped on ${left.join(', ') || '(no paths left in conflict)'}, so this is not the clean replay the queue tested for a red fix.`)
  }
  if (!red && replay.ok) refuse(`${baseName} replays onto main ${mainAt} with the joins and does not stop, so there is no conflict for this resolution to resolve.`)
  const places = []
  let morePlaces = 0
  let bytes = 0
  for (let stops = 0; !replay.ok; stops += 1) {
    if (stops >= replayed.length) refuse(`The replay stopped ${String(stops + 1)} times, and it replays ${String(replayed.length)} commits of the entry.`)
    const left = nul(git(clone, ['diff', '--name-only', '-z', '--diff-filter=U']))
    const stoppedAt = tryGit(clone, ['rev-parse', '--verify', 'REBASE_HEAD']).stdout
    if (left.length === 0) refuse(`The replay stopped at the entry's commit ${stoppedAt.slice(0, 12) || '(none)'} with no path left in conflict. git said: ${[replay.stdout, replay.stderr].join('\n').trim().slice(-600)}`)
    const unnamed = left.filter((path) => !resolving.files.includes(path))
    if (stops === 0 && unnamed.length > 0) refuse(`The replay stopped on ${unnamed.join(', ')}, which the conflict step did not name: it named ${resolving.files.join(', ')}.`)
    // THE RESOLUTION'S COMMIT FOR THIS STOP carries the message of the entry's commit the replay stopped on. Git drops a
    // commit that the resolution leaves with no change, so a count of commits does not pair them.
    const said = messageOf(clone, stoppedAt)
    const alike = replayed.filter((one) => messageOf(clone, one) === said)
    if (alike.length > 1) refuse(`The entry's commits ${named(alike)} carry the same message, so the check cannot tell which commit of the resolution resolves the stop at ${stoppedAt.slice(0, 12)}.`)
    const held = theirs.filter((one) => messageOf(clone, one) === said)
    if (held.length > 1) refuse(`The resolution's commits ${named(held)} carry the message of the entry's commit ${stoppedAt.slice(0, 12)}, where the replay stopped, so the check cannot tell which of them resolves it.`)
    // With no such commit, the supervisor took main's side, which is HEAD in a rebase.
    const theirsAt = held[0]
    // A STOP ABOUT A WHOLE FILE IS HELD TO ITS KIND (wave 13u round 131, item 51 (b)). A file deleted on one side is a
    // cannot, whatever the resolution holds. A file each side renamed differently is resolved in main's file alone,
    // whose places are checked against the three-way merge of the three files like any other.
    const kinds = theKindsAt(clone, stoppedAt)
    const cannots = kinds.filter(isACannot)
    if (cannots.length > 0) refuse(cannots.map(whatTheKindSays).join(' '))
    const renames = kinds.filter((kind) => kind.kind === 'renamed')
    for (const rename of theirsAt === undefined ? [] : renames) {
      const kept = [rename.ancestor, rename.entry].filter((path) => modeAt(clone, theirsAt, path) !== null)
      if (kept.length > 0) refuse(`${whatTheKindSays(rename)} The resolution's commit ${theirsAt.slice(0, 12)} still holds ${kept.join(' and ')}.`)
    }
    const files = left.flatMap((path) => {
      const rename = renames.find((kind) => thePathsOf(kind).includes(path))
      return rename === undefined || path === rename.main ? [{ path, rename }] : []
    })
    for (const { path, rename } of files) {
      const conflicted = rename === undefined ? theConflictedText(path, (args) => gitBytes(clone, args)) : theConflictedTextOfARename(rename, stoppedAt, (args) => gitBytes(clone, args))
      if ('refused' in conflicted) refuse(conflicted.refused)
      if (theirsAt !== undefined) {
        const modes = rename === undefined
          ? new Set(git(clone, ['ls-files', '-u', '-z', '--', path]).split('\0').filter((row) => / [23]\t/u.test(row)).map((row) => row.split(' ')[0]))
          : new Set([modeAt(clone, 'HEAD', path), modeAt(clone, stoppedAt, rename.entry)])
        const mode = modeAt(clone, theirsAt, path)
        if (mode === null) {
          refuse(rename === undefined
            ? `The resolution's commit ${theirsAt.slice(0, 12)} has no ${path}, and the replay left it in conflict with both sides holding it.`
            : `${whatTheKindSays(rename)} The resolution's commit ${theirsAt.slice(0, 12)} has no ${path}.`)
        }
        if (!modes.has(mode)) refuse(`In the resolution's commit ${theirsAt.slice(0, 12)}, ${path} has mode ${mode}, which neither side had (${[...modes].join(', ')}).`)
      }
      const resolved = theResolvedPlaces(path, conflicted, textAt(clone, theirsAt ?? 'HEAD', path))
      if ('refused' in resolved) refuse(`${resolved.refused} That is a change outside the places git left in conflict.`)
      const mains = mainsCommitsAt(clone, path, conflicted.places, sinceTheFork, mainAt, leftMainAt)
      for (const [n, place] of resolved.places.entries()) {
        const one = {
          path,
          at: place.at,
          entryCommit: stoppedAt,
          resolvedIn: theirsAt ?? null,
          ancestor: aSide(place.ancestor),
          main: aSide(place.main),
          entry: aSide(place.entry),
          resolution: aSide(place.resolution),
          ...mains[n],
          ...(resolved.ambiguous ? { ambiguous: true } : {}),
        }
        const size = Buffer.byteLength(JSON.stringify(one)) + 1
        if (places.length >= MOST_PLACES || bytes + size > MOST_BYTES) {
          morePlaces += 1
          continue
        }
        bytes += size
        places.push(one)
      }
    }
    // Each path left in conflict is taken as the resolution holds it, and one it does not hold leaves the index.
    const source = theirsAt ?? 'HEAD'
    const taken = left.filter((path) => modeAt(clone, source, path) !== null)
    const gone = left.filter((path) => !taken.includes(path))
    if (taken.length > 0) git(clone, ['checkout', source, '--', ...taken])
    if (gone.length > 0) git(clone, ['rm', '--quiet', '--', ...gone])
    const tree = git(clone, ['write-tree'])
    const before = git(clone, ['rev-parse', '--verify', 'HEAD^{tree}'])
    if (theirsAt === undefined) {
      // MAIN'S SIDE MUST EMPTY THE COMMIT, or git's own replay keeps it and the resolution has lost it.
      if (tree !== before) {
        const differ = nul(git(clone, ['diff', '--no-renames', '--name-only', '-z', before, tree]))
        refuse(`The resolution ${commit.slice(0, 12)} holds no commit with the message of the entry's commit ${stoppedAt.slice(0, 12)}, where the replay stopped. With main's side taken in each place, that commit still changes ${pathsNamed(differ)}, so git's own replay keeps it.`)
      }
    } else {
      const wanted = git(clone, ['rev-parse', '--verify', `${theirsAt}^{tree}`])
      if (tree !== wanted) {
        const differ = nul(git(clone, ['diff', '--no-renames', '--name-only', '-z', tree, wanted]))
        // A FILE GIT MERGED WITH NO CONFLICT MAY FOLLOW THE QUEUE'S RENUMBERING, and nothing else (wave 13u round 132,
        // item 51): the resolution holds exactly what the clean copy wrote, the lines the entry wrote with main's number.
        const renumbering = theRenumberingAtAStop(kinds)
        const merged = renumbering.length === 0 ? [] : nul(git(clone, [...THE_FILES_A_STOP_CHANGES, before, tree]))
        const refusing = []
        const followed = differ.filter((path) => {
          if (!merged.includes(path) || modeAt(clone, tree, path) !== modeAt(clone, wanted, path)) return false
          const added = theLinesAddedIn(git(clone, [...THE_LINES_ADDED, mainAt, tree, '--', path]))
          const ours = aMergedFileWithMainsNumbers(gitBytes(clone, ['cat-file', 'blob', `${tree}:${path}`]), renumbering, added)
          if (ours === null) return false
          if (ours.cannot.length > 0) {
            refusing.push(`In ${path} that renumbering refuses: ${aLineItCannotRename(path, ours.cannot[0], renumbering)}`)
            return false
          }
          return ours.changed > 0 && Buffer.from(ours.text, 'utf8').equals(gitBytes(clone, ['cat-file', 'blob', `${wanted}:${path}`]))
        })
        const other = differ.filter((path) => !followed.includes(path))
        if (other.length > 0) {
          refuse([
            `At the entry's commit ${stoppedAt.slice(0, 12)}, the resolution's commit ${theirsAt.slice(0, 12)} differs from git's own result outside the paths left in conflict, in ${pathsNamed(other)}.`,
            ...(renumbering.length === 0 ? [] : [`Outside those paths the only change allowed is the queue's renumbering of the lines the entry wrote: ${renumbering.map((one) => `${one.from} -> ${one.to}`).join(', ')}.`]),
            ...refusing.slice(0, 1),
          ].join(' '))
        }
        git(clone, ['checkout', theirsAt, '--', ...followed])
        log(`at the entry's commit ${stoppedAt.slice(0, 12)}, ${followed.join(', ')} took main's migration number, as the queue's renumbering does`)
      }
      if (wanted === before) refuse(`The resolution keeps the entry's commit ${stoppedAt.slice(0, 12)} as its commit ${theirsAt.slice(0, 12)}, which has the tree the replay had before that commit. Git's own replay drops such a commit, as the clean copy does. Hand the resolution over without it.`)
    }
    replay = tryGit(clone, ['-c', 'core.editor=true', 'rebase', '--continue'])
  }

  const ours = git(clone, ['rev-list', '--reverse', `${mainAt}..HEAD`]).split('\n').filter((one) => one !== '')
  if (red) {
    if (theirs.length <= ours.length) refuse(`The replay made ${String(ours.length)} commits on top of main, and the red resolution has ${String(theirs.length)}; a red fix needs a commit on top of the replay.`)
  } else if (ours.length !== theirs.length) refuse(`The replay made ${String(ours.length)} commits on top of main, and the resolution has ${String(theirs.length)}.`)
  for (const [n, one] of ours.entries()) {
    if (git(clone, ['log', '-1', '--format=%B', one]) !== git(clone, ['log', '-1', '--format=%B', theirs[n]])) {
      refuse(`The resolution's commit ${String(n + 1)}, ${theirs[n].slice(0, 12)}, does not carry the message of the replay's commit ${String(n + 1)}: ${git(clone, ['log', '-1', '--format=%s', one])}.`)
    }
    if (git(clone, ['rev-parse', `${one}^{tree}`]) !== git(clone, ['rev-parse', `${theirs[n]}^{tree}`])) {
      refuse(`The resolution's commit ${String(n + 1)}, ${theirs[n].slice(0, 12)}, does not hold the tree of the replay's commit ${String(n + 1)}.`)
    }
  }
  let fixed
  if (red) {
    const tip = git(clone, ['rev-parse', 'HEAD'])
    fixed = nul(git(clone, ['diff', '--name-only', '--no-renames', '-z', tip, commit])).sort()
    if (fixed.length === 0) refuse(`The red fix changes no paths against the replay's tip ${tip}; commits on top must fix at least one path.`)
    if (fixed.length > MOST_FIXED) refuse(`The red fix changes ${String(fixed.length)} paths, more than the ${String(MOST_FIXED)} paths the resolution check can report.`)
  }
  // THE FILES THE DOOR RECORDED: each path the resolution changes against main, with the same hash and mode.
  const changed = nul(git(root, ['diff', '--no-renames', '--name-only', '-z', mainAt, commit])).sort()
  const recorded = [...resolution.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (changed.length !== recorded.length || changed.some((path, n) => recorded[n].path !== path)) {
    refuse(`The resolution changes ${String(changed.length)} files against main ${mainAt.slice(0, 12)}, and the hand-over door recorded ${String(recorded.length)}, so the commit is not the one the door read.`)
  }
  for (const one of recorded) {
    const hash = hashAt(root, commit, one.path)
    const mode = hash === null ? null : modeAt(root, commit, one.path)
    if (hash !== one.hash || mode !== one.mode) refuse(`${one.path} in the resolution's commit has hash ${String(hash)} and mode ${String(mode)}, and the hand-over door recorded ${String(one.hash)} and ${String(one.mode)}.`)
  }
  return { places, morePlaces, ...(fixed === undefined ? {} : { fixed }) }
}

/**
 * CHECK THE ENTRY'S RESOLUTION AND REPORT IT. A pass points `refs/mole-office/resolved/<entry>` at the resolution in
 * the lane's repository, so its turn integrates from a commit the queue holds, and reports the places; a refusal
 * reports its sentence. Either way the office answers the entry as it now stands. The caller passes the office's step.
 */
export async function checkTheResolution(entry, { step } = {}) {
  if (typeof step !== 'function') throw new Error(THE_RESOLUTION_CHECK_NEEDS_STEP)
  const resolution = entry.machine.resolution
  const resolving = entry.machine.resolving
  let checked
  try {
    checked = theCheck(entry, resolution, resolving)
  } catch (err) {
    if (!(err instanceof Refused)) throw err
    log(`the resolution ${resolution.commit} is refused: ${err.message}`)
    // A REFUSAL LONGER THAN THE DOOR TAKES is cut with a count of the rest, which fits in the 40 characters kept for it.
    const cutAt = MOST_SAID - 40
    const says = err.message.length <= MOST_SAID ? err.message : `${err.message.slice(0, cutAt)} …(${String(err.message.length - cutAt)} more characters)`
    return step('resolution-checked', { commit: resolution.commit, ok: false, says })
  }
  const ref = resolvedRefOf(chosen.entry)
  git(entry.changeset.root, ['update-ref', ref, resolution.commit])
  log(`the resolution ${resolution.commit} passes the check, with ${String(checked.places.length + checked.morePlaces)} places; ${ref} points at it in ${entry.changeset.root}`)
  return step('resolution-checked', { commit: resolution.commit, ok: true, ref, places: checked.places, ...(checked.morePlaces === 0 ? {} : { morePlaces: checked.morePlaces }), ...(checked.fixed === undefined ? {} : { fixed: checked.fixed }) })
}
