#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLEAN COPY A SUPERVISOR RESOLVES A MERGE ENTRY'S CONFLICT IN (tier 2 of the resolution rule, round B).
 *
 *     node tools/merge-tool/resolve-a-conflict.mjs --entry <id> --repository <the entry's repository> \
 *         --ref <the entry's pinned ref> --commit <the pinned commit> --main-at <the main the conflict met> \
 *         --files <path,path> --into <a new folder>
 *     For a red test, use --red <test,test> in place of --files. Commit its fix on top of the replayed tip.
 *     node tools/merge-tool/resolve-a-conflict.mjs --continue --into <the same folder>
 *
 * The queue writes the first command, filled in from the entry, into the brief it gives the entry's supervisor.
 *
 * WHAT IT DOES. It makes a git repository at --into that holds the entry's pinned commit and the main the conflict met,
 * both fetched from the entry's repository. It checks out the pinned commit and replays it onto that main with the
 * queue's own joins (the-joins.mjs), as the queue's rebase did. Where the replay stops, it writes each path git left in
 * conflict as the three-way merge of its three sides, with the ancestor's lines between main's and the entry's
 * (conflicted-file.mjs). That is the text the merge tool's check reads the resolution against. The supervisor resolves
 * the places, runs `git add` on the files and runs this again with --continue, until the replay ends. The commit the
 * replay ends on is the resolution. The folder is what the supervisor hands over, and its HEAD must stay at that commit
 * until the entry ends, because the merge tool fetches it from there.
 *
 * A STOP ABOUT A WHOLE FILE is met by its kind (whole-file-conflicts.mjs). A file deleted on one side and changed on
 * the other is refused, with the cannot to send. A file each side renamed differently keeps main's name: the copy
 * removes the ancestor's name and the entry's, and writes main's file as the three-way merge of the three files. The
 * other kinds are conflicts of lines in one file.
 *
 * A MIGRATION RENAMED DIFFERENTLY ON EACH SIDE is one main numbers otherwise than the entry. In each file git merged
 * with no conflict at that stop, the copy gives the lines the entry wrote main's number, by the rule the merge tool's
 * renumber at integration follows (new-numbers.mjs), adds the file and says so. That is the one change a file outside
 * the places may take, and the merge tool's check accepts exactly it (wave 13u round 132, item 51). A line the rule
 * cannot read is refused, with the cannot to send.
 *
 * THE FIRST STOP must hold only paths the conflict step named. Later stops of the same replay may hold further paths;
 * each is written as its three-way text and resolved in the same way, in the same hour and with one final hand-over.
 * The tool neither reads nor starts an hour. It refuses an unnamed path at the first stop and a replay that does not
 * stop at all. Each refusal says why on stderr.
 * A red copy must replay without stopping. It aborts a stopped replay and refuses it; a completed replay is kept
 * unchanged, with the fix committed on top, so the check can compare every replayed message and tree with its own.
 *
 * IT READS NONE OF THE MERGE TOOL'S ARGUMENTS and imports none of the modules that do, because a supervisor runs it,
 * not the queue.
 *
 * Exit 0: the folder stands at a stop to resolve, or at the end of the replay. Exit 1: refused. Exit 2: a usage error.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANDED_KEEP_PREFIX, REPLAY_KEEP_PREFIX, replayArguments } from '../../src/shared/merge/landed-history.mjs'

import { theConflictedText, theConflictedTextOfARename } from './conflicted-file.mjs'
import { BASE, CLOSE, OPEN, SPLIT } from './list-join.mjs'
import { giveTheCloneTheJoins, whatTheJoinsSaid } from './the-joins.mjs'
import { isACannot, thePathsOf, theWholeFileKinds, whatTheKindSays } from './whole-file-conflicts.mjs'
import { THE_FILES_A_STOP_CHANGES, THE_LINES_ADDED, aLineItCannotRename, aMergedFileWithMainsNumbers, theLinesAddedIn, theRenumberingAtAStop } from './new-numbers.mjs'
import { THE_DOORS_OF_THE_WHOLE_APP, theChangedNodes, theGraph, theRelatedTests } from '../related-tests.mjs'

const THIS_CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const THIS_TOOL = fileURLToPath(import.meta.url)

/** What the first run read from its words, kept in the copy's git folder for each --continue. */
const KEPT = 'mole-office-clean-copy.json'

class Refused extends Error {}

/** @returns {never} */
function refuse(said) {
  throw new Refused(said)
}

function run(cwd, args, encoding = 'utf8', variables = {}) {
  const ran = spawnSync('git', ['-C', cwd, ...args], { encoding, maxBuffer: 1 << 30, env: { ...process.env, ...variables } })
  if (ran.error) refuse(`git could not be started: ${ran.error.message}`)
  return ran
}

/** git's stdout, trimmed, with `variables` added to its environment; a failure refuses with git's own words. */
function git(cwd, args, variables) {
  const ran = run(cwd, args, 'utf8', variables)
  if (ran.status !== 0) refuse(`git ${args.join(' ')} failed in ${cwd}: ${(ran.stderr.trim() || ran.stdout.trim()) || `exit ${String(ran.status)}`}`)
  return ran.stdout.trim()
}

/** git's stdout as bytes, for conflicted-file.mjs; a failure throws with git's own words. */
const gitBytesIn = (cwd) => (args) => {
  const ran = run(cwd, args, 'buffer')
  if (ran.status !== 0) refuse(`git ${args.join(' ')} failed in ${cwd}: ${ran.stderr.toString('utf8').trim() || `exit ${String(ran.status)}`}`)
  return ran.stdout
}

const nul = (said) => said.split('\0').filter((one) => one !== '')

/** The paths git left in conflict where the replay stands. */
const leftInConflict = (into) => nul(run(into, ['diff', '--name-only', '-z', '--diff-filter=U']).stdout)

function start(words) {
  const { entry, repository, ref, commit, mainAt, files, red, into } = words
  if (existsSync(into) && readdirSync(into).length > 0) refuse(`${into} is not empty. The clean copy is made in a new or empty folder, so that nothing in it is left from other work.`)
  mkdirSync(into, { recursive: true })
  git(into, ['init', '--quiet'])
  // THE PINNED REF, as the queue pinned it, and the commit the conflict step named must be the one it points at.
  git(into, ['fetch', '--quiet', '--no-tags', repository, `+${ref}:${ref}`])
  const pinned = git(into, ['rev-parse', '--verify', `${ref}^{commit}`])
  if (pinned !== commit) refuse(`${ref} in ${repository} points at ${pinned}, not at ${commit}, so the entry was pinned again after this command was written. Ask for the entry again.`)
  git(into, ['fetch', '--quiet', '--no-tags', repository, mainAt])
  git(into, ['fetch', '--quiet', '--no-tags', repository, `+${LANDED_KEEP_PREFIX}*:${LANDED_KEEP_PREFIX}*`, `+${REPLAY_KEEP_PREFIX}*:${REPLAY_KEEP_PREFIX}*`])
  git(into, ['cat-file', '-e', `${mainAt}^{commit}`])
  if (run(into, ['var', 'GIT_COMMITTER_IDENT']).status !== 0) refuse(`git has no committer name in this shell, so the replay cannot make its commits. Set user.name and user.email, or GIT_COMMITTER_NAME and GIT_COMMITTER_EMAIL, and start again in a new folder.`)
  // No editor opens on --continue, and no resolution git recorded elsewhere is reused without the supervisor seeing it.
  for (const pair of [['core.editor', 'true'], ['rerere.enabled', 'false'], ['advice.detachedHead', 'false']]) git(into, ['config', ...pair])
  writeFileSync(join(into, '.git', KEPT), `${JSON.stringify({ ...words, stops: [] }, null, 2)}\n`)
  git(into, ['checkout', '--quiet', '--detach', commit])
  giveTheCloneTheJoins(into, (pair) => git(into, ['config', ...pair]))
  // The tests of the resolution run here, on the modules of the checkout this tool runs from.
  if (existsSync(join(THIS_CHECKOUT, 'node_modules'))) symlinkSync(realpathSync(join(THIS_CHECKOUT, 'node_modules')), join(into, 'node_modules'))
  const rebase = run(into, replayArguments((args, variables) => git(into, args, variables), mainAt))
  if (red !== undefined) {
    if (rebase.status !== 0) {
      const left = leftInConflict(into)
      git(into, ['rebase', '--abort'])
      refuse(`The replay of the entry stopped on a conflict in ${left.join(', ') || '(no paths left in conflict)'}, which the queue's own replay onto this main did not meet; nothing can be fixed in this copy; tell the queue with POST /api/merge-queue/${entry}/resolution {"cannot": "<one sentence>"}.`)
    }
    return atTheRedEnd(into, words)
  }
  if (rebase.status === 0) {
    refuse(`The pinned commit ${commit} replays onto main ${mainAt} with the joins and does not stop, so there is no conflict to resolve here. The conflict step named ${files.join(', ')}. Report this to whoever runs the merge queue.`)
  }
  return atTheStop(into, rebase)
}

/** The whole-file conflicts of the stop at the entry's commit `stoppedAt`, with main's side at HEAD. */
function theKindsAt(into, stoppedAt) {
  const sides = { ancestor: git(into, ['rev-parse', `${stoppedAt}^`]), main: git(into, ['rev-parse', 'HEAD']), entry: stoppedAt }
  try {
    return theWholeFileKinds((args) => run(into, args), sides)
  } catch (err) {
    if (err instanceof Refused) throw err
    refuse(`The kinds of the stop at ${stoppedAt.slice(0, 12)} could not be read, so it is not known which of them can be resolved: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function kept(into) {
  const path = join(into, '.git', KEPT)
  if (!existsSync(path)) refuse(`${into} is not a clean copy this tool made: it has no ${KEPT} in its git folder.`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Writes each path left in conflict as its three-way merge, and says what is to be done. */
function atTheStop(into, rebase) {
  const words = kept(into)
  const left = leftInConflict(into)
  if (left.length === 0) refuse(`git rebase stopped in ${into} with no path left in conflict, so this is not a conflict to resolve by lines. git said: ${[rebase.stdout, rebase.stderr].join('\n').trim()}`)
  const unnamed = left.filter((path) => !words.files.includes(path))
  if (words.stops.length === 0 && unnamed.length > 0) {
    refuse(`The replay stopped on ${unnamed.join(', ')}, which the conflict step did not name: it named ${words.files.join(', ')}. The clean copy resolves only the conflict the queue met, so it stops here. Report this to whoever runs the merge queue.`)
  }
  const stoppedAt = git(into, ['rev-parse', 'REBASE_HEAD'])
  // A STOP ABOUT A WHOLE FILE IS MET BY ITS KIND (wave 13u round 131, item 51 (b)). A file deleted on one side is a
  // cannot. A file each side renamed differently keeps main's name only: the other two names leave the copy, and
  // main's file holds the three-way merge of the three files.
  const kinds = theKindsAt(into, stoppedAt)
  const cannots = kinds.filter(isACannot).map(whatTheKindSays).join(' ')
  if (cannots !== '') refuse(`${cannots} Say so and stop: POST /api/merge-queue/${words.entry}/resolution {"cannot": ${JSON.stringify(cannots)}, "changesWhatOneSideMeant": true}`)
  const renames = kinds.filter((kind) => kind.kind === 'renamed')
  const texts = left.flatMap((path) => {
    const rename = renames.find((kind) => thePathsOf(kind).includes(path))
    if (rename === undefined) return [{ path, made: theConflictedText(path, gitBytesIn(into)) }]
    return path === rename.main ? [{ path, made: theConflictedTextOfARename(rename, stoppedAt, gitBytesIn(into)) }] : []
  })
  const cannot = texts.filter((one) => 'refused' in one.made)
  if (cannot.length > 0) refuse(`${cannot.map((one) => one.made.refused).join(' ')} Report this to whoever runs the merge queue.`)
  // A FILE GIT MERGED WITH NO CONFLICT FOLLOWS THE QUEUE'S RENUMBERING (wave 13u round 132, item 51). Where the stop
  // renamed a migration differently on each side, the lines the entry wrote in it take main's number, and nothing else in
  // it changes. A line the rule cannot read is a cannot, refused before the copy changes anything.
  const renumbering = theRenumberingAtAStop(kinds)
  const merged = renumbering.length === 0 ? [] : nul(git(into, [...THE_FILES_A_STOP_CHANGES, '--cached', 'HEAD'])).filter((path) => !left.includes(path))
  const renumbered = []
  for (const path of merged) {
    const added = theLinesAddedIn(git(into, [...THE_LINES_ADDED, '--cached', words.mainAt, '--', path]))
    const said = aMergedFileWithMainsNumbers(gitBytesIn(into)(['show', `:${path}`]), renumbering, added)
    if (said === null) continue
    if (said.cannot.length > 0) {
      const why = `${aLineItCannotRename(path, said.cannot[0], renumbering)} A file git merged with no conflict may change in a clean copy only to take main's number for the entry's migration, so this stop cannot be resolved there.`
      refuse(`${why} Say so and stop: POST /api/merge-queue/${words.entry}/resolution {"cannot": ${JSON.stringify(why)}}`)
    }
    if (said.changed > 0) renumbered.push({ path, text: said.text, changed: said.changed })
  }
  for (const rename of renames) git(into, ['rm', '--quiet', '--', rename.ancestor, rename.entry])
  for (const { path, made } of texts) writeFileSync(join(into, path), made.text)
  for (const { path, text } of renumbered) writeFileSync(join(into, path), text)
  if (renumbered.length > 0) git(into, ['add', '--', ...renumbered.map((one) => one.path)])
  // The joins append for the whole replay, so what they refused at this stop is what no earlier stop already said.
  const before = words.stops.flatMap((stop) => stop.refused)
  const refused = whatTheJoinsSaid(into).refused.filter((line) => (before.includes(line) ? (before.splice(before.indexOf(line), 1), false) : true))
  writeFileSync(join(into, '.git', KEPT), `${JSON.stringify({ ...words, stops: [...words.stops, { commit: stoppedAt, paths: left, further: unnamed, refused, renumbered: renumbered.map((one) => one.path) }] }, null, 2)}\n`)
  console.log(
    [
      `The replay of merge entry ${words.entry} stopped at its commit ${stoppedAt.slice(0, 12)} (${git(into, ['log', '-1', '--format=%s', stoppedAt])}).`,
      ...kinds.map(whatTheKindSays),
      ...renames.map((kind) => `This copy removed ${kind.ancestor} and ${kind.entry}, and wrote ${kind.main} as the three-way merge of the ancestor's ${kind.ancestor}, main's ${kind.main} and the entry's ${kind.entry}.`),
      ...(renumbered.length === 0 ? [] : [
        `Main numbers a migration of the entry otherwise: ${renumbering.map((one) => `${one.from} is ${one.to} on main`).join(', ')}.`,
        "In the files git merged with no conflict, this copy gave the lines the entry wrote main's number, as the queue's renumbering at integration does, and added them. Change nothing else in them:",
        ...renumbered.map((one) => `  ${one.path}: ${String(one.changed)} ${one.changed === 1 ? 'number' : 'numbers'} changed`),
      ]),
      ...(unnamed.length === 0 ? [] : [`The queue met only the first stop, so it did not name ${unnamed.join(', ')}. They are in conflict at this later commit of the same entry; resolve them here in the same way. Nothing starts a new hour.`]),
      `Git left ${String(left.length)} ${left.length === 1 ? 'path' : 'paths'} in conflict. ${texts.length === left.length ? 'Each now holds' : texts.length === 1 ? 'The one to resolve now holds' : `The ${String(texts.length)} to resolve now hold`} main's lines, the ancestor's lines and the entry's lines in each place:`,
      ...texts.map(({ path, made }) => (made.places.length === 0
        ? `  ${path}: no place, because the three files merge with no conflict of lines; add it as it stands`
        : `  ${path}: ${String(made.places.length)} ${made.places.length === 1 ? 'place' : 'places'}, at ${made.places.map((place) => `line ${String(place.at)}`).join(', ')}`)),
      ...(refused.length === 0 ? [] : ['What the joins refused at this commit:', ...refused.map((line) => `  ${line}`)]),
      '',
      'Keep both sides in each place. If keeping both would change what one side meant, say so and stop:',
      `  POST /api/merge-queue/${words.entry}/resolution {"cannot": "<one sentence>", "changesWhatOneSideMeant": true}`,
      'If it cannot be resolved for another reason, say why and stop:',
      `  POST /api/merge-queue/${words.entry}/resolution {"cannot": "<one sentence>"}`,
      'Change nothing outside the places. When every place is resolved:',
      `  git -C ${into} add -- ${texts.map(({ path }) => path).join(' ')}`,
      `  node ${THIS_TOOL} --continue --into ${into}`,
    ].join('\n'),
  )
}

function continueIt(into) {
  const words = kept(into)
  if (words.red !== undefined) refuse('A red copy has no stop to continue from. Commit the fix on top of its replayed tip and hand it over.')
  // A REFUSED FIRST STOP RECORDS NONE, and the replay is left where it stopped (wave 13u round 131, item 51).
  if (words.stops.length === 0) refuse(`The clean copy in ${into} recorded no stop, because it refused the first one, so there is nothing to continue.`)
  if (!existsSync(join(into, '.git', 'rebase-merge'))) refuse(`No replay is stopped in ${into}, so there is nothing to continue.`)
  const left = leftInConflict(into)
  if (left.length > 0) refuse(`${left.join(', ')} ${left.length === 1 ? 'is' : 'are'} still in conflict. Resolve ${left.length === 1 ? 'it' : 'them'}, run git add, and continue.`)
  const markers = [OPEN, BASE, SPLIT, CLOSE]
  for (const path of words.stops.at(-1).paths) {
    const staged = run(into, ['show', `:${path}`])
    const at = staged.status === 0 ? staged.stdout.split('\n').findIndex((line) => markers.some((marker) => line.startsWith(marker))) : -1
    if (at !== -1) refuse(`${path} as added still holds a marker line, at line ${String(at + 1)}. Resolve that place, run git add, and continue.`)
  }
  const rebase = run(into, ['rebase', '--continue'])
  if (rebase.status !== 0) return atTheStop(into, rebase)
  return atTheEnd(into, words)
}

/** The clean replay a red fix is committed on top of, the tests to rerun, and the hand-over. */
function atTheRedEnd(into, words) {
  const head = git(into, ['rev-parse', 'HEAD'])
  const log = `${into}.tests.log`
  console.log(
    [
      `The replay of merge entry ${words.entry} is done. The replayed tip is commit ${head}, in ${into}.`,
      `The red tests: ${words.red.join(', ')}.`,
      `  cd ${into} && node tools/run-named-tests.mjs ${words.red.join(' ')} > ${log} 2>&1; echo $?`,
      'Commit the fix on top of that tip. Do not change, reorder or squash the replayed commits: the check compares them with its own replay.',
      '',
      'Hand it over, with what the tests did at the commit of the fix:',
      `  POST /api/merge-queue/${words.entry}/resolution {"workingDirectory": "${into}", "tests": {"commit": "<the commit of your fix>", "exit": <exit>, "counts": {"passed": <n>, "failed": <n>}, "log": "${log}"}}`,
      `Keep the HEAD of ${into} at the commit of the fix until the entry ends: the merge tool fetches the resolution from there.`,
    ].join('\n'),
  )
}

/** The resolution, the related tests of the resolved paths only, and how to hand it over. */
function atTheEnd(into, words) {
  const head = git(into, ['rev-parse', 'HEAD'])
  const stops = kept(into).stops
  const atTheQueue = [...new Set(stops[0].paths)].sort()
  const later = [...new Set(stops.slice(1).flatMap((stop) => stop.paths))].sort()
  const resolved = [...new Set(stops.flatMap((stop) => stop.paths))].sort()
  // A stop recorded before wave 13u round 132 renumbered nothing.
  const renumbered = [...new Set(stops.flatMap((stop) => stop.renumbered ?? []))].sort()
  const notStopped = words.files.filter((path) => !resolved.includes(path))
  const joined = whatTheJoinsSaid(into).joined
  const graph = theGraph(into)
  const change = { base: words.mainAt, tip: head, paths: resolved }
  const related = [...theRelatedTests(graph, theChangedNodes(into, change, graph), THE_DOORS_OF_THE_WHOLE_APP).keys()].sort()
  const log = `${into}.tests.log`
  console.log(
    [
      `The replay of merge entry ${words.entry} is done. The resolution is commit ${head}, in ${into}.`,
      `Resolved by hand: ${resolved.join(', ')}.`,
      `Resolved by hand at the queue's stop: ${atTheQueue.join(', ')}.`,
      ...(later.length === 0 ? [] : [`Resolved by hand at later stops: ${later.join(', ')}.`]),
      ...(renumbered.length === 0 ? [] : [`Given main's migration number by this copy: ${renumbered.join(', ')}.`]),
      ...(notStopped.length === 0 ? [] : [`The conflict step also named ${notStopped.join(', ')}, and this replay did not stop on ${notStopped.length === 1 ? 'it' : 'them'}. What the joins joined:`, ...(joined.length === 0 ? ['  nothing'] : joined.map((line) => `  ${line}`))]),
      '',
      related.length === 0 ? 'No test file depends on the resolved paths.' : `The ${String(related.length)} test ${related.length === 1 ? 'file that depends' : 'files that depend'} on the resolved paths:`,
      ...(related.length === 0 ? [] : [`  cd ${into} && node tools/run-named-tests.mjs ${related.join(' ')} > ${log} 2>&1; echo $?`]),
      '',
      'Hand it over, with what the tests did at this commit:',
      `  POST /api/merge-queue/${words.entry}/resolution {"workingDirectory": "${into}", "tests": {"commit": "${head}", "exit": <exit>, "counts": {"passed": <n>, "failed": <n>}, "log": "${log}"}}`,
      `Keep the HEAD of ${into} at ${head} until the entry ends: the merge tool fetches the resolution from there.`,
    ].join('\n'),
  )
}

if (process.argv[1] === THIS_TOOL) {
  const args = process.argv.slice(2)
  const at = (word) => (args.includes(word) ? args[args.indexOf(word) + 1] : undefined)
  const into = at('--into')
  if (!args.includes('--continue') && args.includes('--files') === args.includes('--red')) {
    process.stderr.write('resolve-a-conflict: A start takes exactly one of --files <path,...> and --red <test,...>.\n')
    process.exit(2)
  }
  const words = { entry: at('--entry'), repository: at('--repository'), ref: at('--ref'), commit: at('--commit'), mainAt: at('--main-at'), ...(args.includes('--red') ? { red: at('--red')?.split(',').filter((one) => one !== '') } : { files: at('--files')?.split(',').filter((one) => one !== '') }), into: into === undefined ? undefined : resolve(into) }
  if (!args.includes('--continue') && args.includes('--red') && (words.red === undefined || words.red.length === 0)) {
    process.stderr.write('resolve-a-conflict: --red needs at least one test file.\n')
    process.exit(2)
  }
  const missing = args.includes('--continue') ? (into === undefined ? ['--into'] : []) : Object.entries(words).filter(([, value]) => value === undefined || value.length === 0).map(([name]) => `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)
  if (missing.length > 0) {
    process.stderr.write(`resolve-a-conflict: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. The header of ${THIS_TOOL} says how to run it.\n`)
    process.exit(2)
  }
  try {
    if (args.includes('--continue')) continueIt(words.into)
    else start(words)
  } catch (err) {
    if (!(err instanceof Refused)) throw err
    process.stderr.write(`resolve-a-conflict: ${err.message}\n`)
    process.exit(1)
  }
}
