// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKERS AND THE GIT ADAPTER: pinning a git entry, and putting it on top of main (rebase, the git checker, the
 * mutation markers, and the files the change makes stale, regenerated). Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { readMutationMarkers } from '../../tests/applied-mutations.ts'
import { PROTECTED_AREAS_FILE, pathMatches, readProtectedAreas } from '../checks/protected-areas.mjs'
import {
  ABSENT,
  API,
  GIT_IDENTITY,
  PINNED_REF_PREFIX,
  SCRIPT_TIMEOUT_MS,
  THIS_CHECKOUT,
  WORKDIR,
  WORKSPACE,
  chosen,
  theOwnerContentPatterns,
  withThePairing,
} from './arguments.mjs'
import { fail, log, stamp, writeState } from './log-and-state.mjs'
import { ONLY_A_FOLDER, changedBetween, checkBeforeATool, cleanEnvironment, contentAt, contentListedAt, git, gitBytes, gitIn, hashAt, linkNodeModules, packageScripts, probeGit, tryGit } from './git.mjs'
import { canItJoin } from './early-conflicts.mjs'
import { landingMessage, landingProvenance, landingTitle, replayMain } from '../../src/shared/merge/landed-history.mjs'
import { theDocumentsOf, theRecordOfMain } from './documents.mjs'
import { ownLinesOn } from './lines.mjs'
import { aResolutionPassedItsCheck, isALineFile, resolvedRefOf } from '../../src/shared/merge-queue.ts'
import { whatTheRunSaid, whyARunGaveNoResult } from './red-files.mjs'
import { renumberMigrationsBehindMain, theFilesRenamed, whatTheQueueSaid } from './migrations.mjs'
import { JOURNAL_JOINS_SAID, THE_JOURNAL, theJournalDecided } from './journal-join.mjs'
import { LIST_JOINS_SAID } from './list-join.mjs'
import { rebaseWithTheJoins, tryTheRebaseEarly } from './rebase-with-joins.mjs'
import { saidInTheClone } from './the-joins.mjs'

/** What pinGit and integrateGit need from their caller, said in the sentence each refuses with. */
export const THE_INTEGRATION_NEEDS = Object.freeze({
  pinGit: "pinGit needs pinnedCommitPosition from its caller, as the-merger.mjs passes arguments.mjs's THE_INTEGRATION_READS, so that integrate.mjs reads no setting itself.",
  integrateGit: "integrateGit needs resolutionRefPosition, ownerContentPosition, placeholderAddressesPosition, integratedBuildPosition and commitAddressFallback from its caller, as the-merger.mjs passes arguments.mjs's THE_INTEGRATION_READS, so that integrate.mjs reads no setting itself.",
})

/** What pinGit, integrateGit and regenerateOnTop need from their caller, said in the sentence each refuses with. */
export const THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS = "pinGit needs theSeal, countAGateMet and step, integrateGit needs ask, countAGateMet, runInSandbox, step, theSandbox and theSeal, and regenerateOnTop needs runInSandbox, from their caller, as the-merger.mjs passes office-keeper.mjs's and pairs.mjs passes the runInSandbox its own caller gave it, so that integrate.mjs reaches no office module itself."

// ============================================================================ the checkers

/**
 * Run one of this checkout's checker tools and read its verdict. Exit 2 is this tool's failure, never a
 * verdict. What it printed is kept at <workdir>/checks/<name>.json, which is the log a step names.
 */
export function runChecker(name, args, env = {}) {
  const tool = join(THIS_CHECKOUT, 'tools', 'checks', name)
  // A checker runs from this checkout and git-changeset.mjs reads the office's key, so it is handed the pairing.
  const result = spawnSync(process.execPath, [tool, ...args], { env: withThePairing(cleanEnvironment(env)), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  mkdirSync(join(WORKDIR, 'checks'), { recursive: true })
  const saved = join(WORKDIR, 'checks', `${basename(name, '.mjs')}.json`)
  writeFileSync(saved, result.stdout ?? '')
  let verdict = null
  try {
    verdict = JSON.parse(result.stdout)
  } catch {
    verdict = null
  }
  if (result.status === 2 || verdict === null || result.status === null) {
    fail(`tools/checks/${name} could not run (exit ${String(result.status)}): ${(result.stderr || result.stdout || '').trim().slice(-1500)}`)
  }
  const failed = (verdict.decided ?? []).filter((one) => one.ok === false)
  if (result.status === 1 && failed.length === 0) fail(`tools/checks/${name} exited 1 and named no failed check; its output was not usable.`)
  return { verdict, failed, needsJudgment: verdict.needsJudgment ?? [], checked: verdict.checked ?? null, saved }
}

/**
 * THE CHECKER'S REPORT AS THE STEP DOOR READS IT: {tool, decided, needsJudgment}, each decided item with
 * exactly path, check, ok and detail. `extra` adds what this tool itself decided (a file it regenerated,
 * a keep-both name it found free), and `drop` leaves out decided items another step answers.
 */
export function reportOf(checker, { extra = [], drop = () => false } = {}) {
  const decided = (checker.verdict.decided ?? [])
    .filter((one) => !drop(one))
    .map((one) => ({ path: String(one.path), check: String(one.check), ok: one.ok === true, ...(typeof one.detail === 'string' ? { detail: one.detail } : {}) }))
  return {
    ...(typeof checker.verdict.tool === 'string' ? { tool: checker.verdict.tool } : {}),
    decided: [...decided, ...extra],
    needsJudgment: checker.needsJudgment.map((one) => ({ path: String(one.path), why: String(one.why) })),
  }
}

/** The decided failures of a checker, in one line a person reads. */
export function failuresSaid(failed) {
  return failed.map((one) => `${one.path} (${one.check}${typeof one.detail === 'string' ? `: ${one.detail}` : ''})`).join('; ')
}

// ============================================================================ the git adapter

function pinnedRef() {
  return `${PINNED_REF_PREFIX}${chosen.entry}`
}

/**
 * {path: sha256 | "absent"} for what the inspector judged: the entry's `judged` as the state machine
 * wrote it, else the seal's files. Only for the log: which paths need judging again is the office's to
 * work out, from the content the integrate step reports (SPEC 5.5, decision R2).
 */
function whatWasJudged(entry, seal) {
  const held = entry.machine?.judged
  if (held && typeof held === 'object') return { judged: { ...held }, from: 'entry.machine.judged' }
  const files = seal.git && Array.isArray(seal.git.files) ? seal.git.files : null
  if (files === null) fail(`Seal ${entry.seal.id} holds no git files, so nothing says what was judged.`)
  return { judged: Object.fromEntries(files.map((one) => [one.path, one.hash ?? ABSENT])), from: 'the seal' }
}

/** Pin a git entry, taking pinnedCommitPosition from the caller, which reads the gate when the pin would refuse. */
export async function pinGit(entry, { pinnedCommitPosition, theSeal, countAGateMet, step } = {}) {
  if (typeof pinnedCommitPosition !== 'function') throw new Error(THE_INTEGRATION_NEEDS.pinGit)
  if (typeof theSeal !== 'function' || typeof countAGateMet !== 'function' || typeof step !== 'function') throw new Error(THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS)
  const { root, commit, base } = entry.changeset
  const seal = await theSeal(entry)
  if (!seal.git || seal.git.commit !== commit) fail(`Seal ${entry.seal.id} names commit ${String(seal.git && seal.git.commit)}, and the entry names ${commit}.`)
  if (!tryGit(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) {
    const from = seal.git.directory
    if (typeof from !== 'string' || !existsSync(from)) fail(`Commit ${commit} is not in ${root}, and the sealed directory ${String(from)} is not there to fetch it from.`)
    log(`fetching ${commit} from ${from} into ${root}`)
    git(root, ['fetch', '--no-tags', '--no-write-fetch-head', from, commit])
    if (!tryGit(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) fail(`After fetching from ${from}, commit ${commit} is still not in ${root}.`)
  }
  if (!tryGit(root, ['merge-base', '--is-ancestor', base, commit]).ok) fail(`The base ${base} is not an ancestor of the sealed commit ${commit}.`)
  // THE COMMIT OBJECT IS WHAT WAS SEALED, file for file (SPEC 5.4, pinned): the seal's hash is sha256
  // of the blob, and a deleted path (hash null) must be absent from the commit.
  const differing = []
  for (const file of seal.git.files) {
    const found = hashAt(root, commit, file.path)
    if (found !== file.hash) differing.push({ path: file.path, sealed: file.hash, found })
  }
  if (differing.length > 0) {
    // Block only: the row is read so that a value it does not allow stops the tool by name, and the refusal is counted.
    await countAGateMet('pinned-commit-is-what-was-sealed', pinnedCommitPosition())
    fail(`Commit ${commit} is not what seal ${entry.seal.id} sealed: ${differing.map((one) => `${one.path} (sealed ${String(one.sealed)}, found ${String(one.found)})`).join(', ')}.`)
  }
  git(root, ['update-ref', pinnedRef(), commit])
  log(`pinned ${commit} at ${pinnedRef()} in ${root}`)
  writeState({ adapter: 'git', pinned: { ref: pinnedRef(), commit, base, at: stamp() } })
  // A DOCUMENTATION ENTRY IS DECIDED HERE, against the record of what the suite reads on main's tree, by the
  // documentation-entry rule and its addendum.
  const documents = theDocumentsOf(entry)
  log(documents.documents === undefined ? `an ordinary entry: ${documents.none}` : `a documentation entry: no test reads ${documents.documents.files.join(', ')}, by main's record on tree ${documents.documents.tree}`)
  // THE JOIN IS TRIED BEFORE THE WAIT (wave 13v round 15): the entry's commits are replayed onto main as it is now, the
  // way the rebase will replay them, so an entry that cannot join is sent back before an inspector or a suite spends
  // time on it. A conflict only in migration files is left to the rebase, which may renumber it, and so is one the merge
  // driver joins at the stopping commit, by a rule it names (list-join.mjs).
  const mainAt = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  // MAIN'S CONTENT AT THE PIN, for exactly the paths the seal names (wave 13u round 96): the office asks for a press only
  // for a path whose content differs from main's. What cannot be read of main stops the pin here and says so, and is never
  // read as a path main does not have.
  const main = { at: mainAt, files: contentListedAt(root, mainAt, seal.git.files.map((one) => one.path)) }
  const joining = canItJoin(root, mainAt, commit, probeGit)
  const cannotJoin = joining.joins === false && !joining.mayRenumber && !joining.mayJoin ? { mainAt, commit: joining.commit, files: joining.files, lines: joining.lines } : undefined
  log(
    joining.joins === true ? `the entry joins main ${mainAt} by replay`
    : joining.joins === null ? `whether the entry joins main ${mainAt} is not known: ${joining.why}; the rebase decides`
    : joining.mayRenumber ? `the entry conflicts with main ${mainAt} only in migration files (${joining.files.join(', ')}); the rebase may renumber them`
    : joining.mayJoin ? `the entry conflicts with main ${mainAt} at its commit ${joining.commit} only where the rebase may join it: ${joining.joinsBy.join(', ')}`
    : `the entry cannot join main ${mainAt}: its commit ${joining.commit} conflicts in ${joining.files.join(', ')}`,
  )
  // THAT REBASE IS TRIED NOW, on a scratch copy (wave 13v round 25): a conflict its joins do not resolve sends the entry back
  // at the pin, in the words its turn would have used.
  const tried = joining.joins === false && cannotJoin === undefined ? tryTheRebaseEarly(root, mainAt, commit, join(WORKDIR, 'early-trial')) : undefined
  const rebaseStopped = tried?.resolved === false ? { mainAt, files: tried.files, log: tried.log, says: tried.says } : undefined
  return step(
    'pinned',
    { files: contentAt(root, commit, seal.git.files.map((one) => one.path)), main, ...(documents.documents === undefined ? {} : { documents: documents.documents }), ...(cannotJoin === undefined ? {} : { cannotJoin }), ...(rebaseStopped === undefined ? {} : { rebaseStopped }) },
    { ref: pinnedRef(), commit, base, verified: 'every sealed path hashes as the seal says, read from the commit object', documents: documents.documents ?? documents.none },
  )
}

/** Every path `git status` reports as changed or untracked in a tree, NUL-separated so no leading space is lost. */
function pathsInStatus(tree) {
  const fields = gitBytes(tree, ['status', '--porcelain', '-z', '--untracked-files=all']).toString('utf8').split('\0')
  const paths = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? ''
    if (field === '') continue
    paths.push(field.slice(3))
    // A rename entry ("R  new") is followed by the old name as a field of its own.
    if (field.startsWith('R') || field.startsWith('C')) index += 1
  }
  return paths
}

/** The paths a change touches between two commits, with rename detection on, each rename under both names. */
export function touchedBetween(repo, from, to) {
  const fields = git(repo, ['diff', '--name-status', '-z', '-M', from, to]).split('\0')
  const touched = []
  for (let index = 0; index < fields.length && fields[index] !== ''; ) {
    const status = fields[index] ?? ''
    if (status.startsWith('R') || status.startsWith('C')) {
      touched.push(fields[index + 1] ?? '', fields[index + 2] ?? '')
      index += 3
    } else {
      touched.push(fields[index + 1] ?? '')
      index += 2
    }
  }
  return touched.filter((one) => one !== '')
}

/** The generated files whose `regenerateWhen` patterns a touched path matches, read from the declaration at `commit`. */
function regenerationsDue(repo, commit, touched) {
  const shown = tryGit(repo, ['show', `${commit}:${PROTECTED_AREAS_FILE}`])
  if (!shown.ok) return []
  let areas
  try {
    areas = readProtectedAreas(shown.stdout, `${commit.slice(0, 12)}:${PROTECTED_AREAS_FILE}`)
  } catch (err) {
    fail(`The declaration ${PROTECTED_AREAS_FILE} at ${commit.slice(0, 12)} cannot be read: ${err instanceof Error ? err.message : String(err)}`)
  }
  return areas.generated.filter((entry) => entry.regenerateWhen.length > 0 && touched.some((path) => entry.regenerateWhen.some((pattern) => pathMatches(pattern, path))))
}

/**
 * REGENERATE WHAT A CHANGE MAKES STALE, as the merger's own commit on top of `head` in `clone`, for
 * the entry named. One function for an entry's own integrate step and for the second entry of a pair, so the pair's
 * tree is built as that entry's own integrate step will build it (step 4 of the integrate rule).
 *
 * `landingAt` is a date in git's own format. An entry's own integrate step gives it when the entry lands as one commit
 * on `base`, and dates the landing commit with it too. Each generator then reads the history main will hold: HEAD is
 * put at a commit of the tree on `base` dated `landingAt`, and back at the tree's own commit before the output is
 * committed, or before the generator's error goes on. The audit table dates a test by its first commit, so a test new
 * to main is dated by the landing's day, and a test main holds keeps its own day. The replay
 * keeps each commit's own day, and a table written on it was a day out on main.
 *
 * A pair gives the instant it started at (pairs.mjs), so a rider that integrates on the pair's day has the tree the
 * pair tested. A rider that integrates on a later day has another tree, and runs its own suite.
 */
export async function regenerateOnTop(clone, base, head, touched, sandbox, forEntry, { landingAt = null, runInSandbox } = {}) {
  if (typeof runInSandbox !== 'function') throw new Error(THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS)
  let Cfinal = head
  let regenerated = null
  for (const due of regenerationsDue(clone, base, touched)) {
    // THE GENERATOR IS THE TREE'S OWN CODE, so it runs in the sandbox, with no office address: it
    // writes a file from the tree (finding 17).
    const [word, ...rest] = due.command
    if (landingAt !== null) {
      log(`${due.command.join(' ')} reads the history as the entry lands: one commit on ${base} dated ${landingAt}`)
      git(clone, ['reset', '--quiet', '--soft', asItLands(clone, base, Cfinal, landingAt)])
    }
    let result
    try {
      result = await runInSandbox(sandbox, `regenerate-${basename(due.paths[0] ?? 'file')}`, word, rest, { cwd: clone, timeoutMs: SCRIPT_TIMEOUT_MS })
    } finally {
      // HEAD COMES BACK whatever the generator did, before its result or its error goes on.
      if (landingAt !== null) git(clone, ['reset', '--quiet', '--soft', Cfinal])
    }
    if (result.code !== 0) fail(`The generator ${due.command.join(' ')} exited ${String(result.code)}${result.timedOut ? ' (stopped at the time limit)' : ''} in ${clone}:\n${result.tail}`)
    const dirty = pathsInStatus(clone)
    const outside = dirty.filter((path) => !due.paths.includes(path))
    if (outside.length > 0) fail(`The generator ${due.command.join(' ')} changed ${outside.join(', ')}, which it does not declare under ${PROTECTED_AREAS_FILE}.`)
    if (dirty.length > 0) {
      git(clone, ['add', '--', ...due.paths])
      git(clone, ['commit', '--quiet', '-m', `Regenerate ${due.paths.join(', ')} for merge entry ${forEntry}\n\nThe change touched a path ${PROTECTED_AREAS_FILE} names under regenerateWhen, so the merge queue ran ${due.command.join(' ')} and committed its output.`])
      Cfinal = git(clone, ['rev-parse', '--verify', 'HEAD^{commit}'])
      regenerated = { paths: due.paths, command: due.command, commit: Cfinal }
      log(`regenerated ${due.paths.join(', ')} and committed ${Cfinal}`)
    } else {
      regenerated = { paths: due.paths, command: due.command, commit: null, says: 'the generator ran and its output was already what the change committed' }
    }
  }
  return { Cfinal, regenerated }
}

/**
 * A commit of `head`'s tree on `base`, dated `at`: the history main holds once the entry lands as one commit. No ref
 * names it. A bus stacks each next rider on one, with a `message` of its own (pairs.mjs).
 */
export function asItLands(clone, base, head, at, message = 'Unreferenced landing the generators read') {
  return git(clone, ['-c', 'commit.gpgSign=false', 'commit-tree', `${head}^{tree}`, '-p', base, '-m', message], { env: datedAt(at) })
}

/**
 * A commit's environment under the tool's own identity, dated `at` as author and as committer. It keeps the two guards
 * git() adds in a clone a sandbox can write, so nothing it runs ever fetches.
 */
function datedAt(at) {
  return cleanEnvironment({ ...GIT_IDENTITY, ...ONLY_A_FOLDER, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at })
}

/** `ms` in git's own date format, `<seconds> <offset>`, in this machine's zone, as git dates a commit made at that moment. */
export function inGitsOwnFormat(ms) {
  const minutes = -new Date(ms).getTimezoneOffset()
  const whole = Math.abs(minutes)
  return `${Math.floor(ms / 1000)} ${minutes < 0 ? '-' : '+'}${String(Math.floor(whole / 60)).padStart(2, '0')}${String(whole % 60).padStart(2, '0')}`
}

/**
 * WHAT THE OFFICE IS TOLD OF EACH LINE FILE whose content is not what the verdict read (the line rule): whether
 * the entry's own lines stand unchanged on the joined tree with no line of anybody else meeting them. The office keeps
 * the verdict of such a file only when this says they held. Every other changed path is judged by file (decision R2),
 * and the log says which rule judged which path.
 */
function linesOfTheLineFiles(clone, { base, commit, M, Cfinal, judged, files }) {
  const lines = []
  for (const path of Object.keys(files).sort()) {
    if (!Object.hasOwn(judged, path) || judged[path] === files[path]) continue
    if (!isALineFile(path)) {
      log(`${path} is not what the verdict read; it is judged by file (decision R2)`)
      continue
    }
    const found = ownLinesOn(clone, { base, commit, path, onto: M, joined: Cfinal })
    lines.push({ path, held: found.held, ...(found.held ? { ranges: found.ranges } : { why: found.why }) })
    log(
      found.held
        ? `${path} is not what the verdict read, and its own lines (${found.ranges}) stand unchanged with no other line meeting them; it keeps its verdict by line`
        : `${path} is not what the verdict read, and by line it does not hold: ${found.why}`,
    )
  }
  return lines
}

/**
 * THE RESOLUTION AN ENTRY'S CHECK PASSED, as the check left it at resolvedRefOf(entry) in the lane's repository
 * (check-a-resolution.mjs). The ref must point at the commit the office recorded, or nothing is rebased.
 */
async function theResolutionItsCheckPassed(root, entry, resolutionRefPosition, countAGateMet) {
  const { commit } = entry.machine.resolution
  const ref = resolvedRefOf(entry.id)
  const at = tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  if (!at.ok || at.stdout !== commit) {
    // Block only, read and counted as the pinned commit's guard is.
    await countAGateMet('resolution-replayed-from-its-own-ref', resolutionRefPosition())
    fail(`The resolution of merge entry ${entry.id} that its check passed is commit ${commit}, and ${ref} in ${root} ${at.ok ? `points at ${at.stdout}` : 'is not there'}; nothing was rebased.`)
  }
  log(`replaying the resolution its check passed, commit ${commit} (${ref}), and not the entry's own commit ${entry.changeset.commit}`)
  return commit
}

/** Read the existing whole-record door, including its older answer shape, before any landing mutation. */
async function theLandingSource(entry, ask) {
  const p = landingProvenance({ entry: entry.id, run: entry.run, seal: entry.seal?.id, hash: entry.seal?.hash, tip: entry.changeset?.commit })
  if (p.entry !== chosen.entry) fail(`The landing entry ${p.entry} is not this tool's entry ${chosen.entry}.`)
  const reply = await ask('GET', `/api/records/${encodeURIComponent(p.run)}`)
  if (reply.status !== 200) fail(`The run ${p.run} is unreadable (${reply.status}): ${reply.body?.error ?? 'no whole record answer'}. Nothing can land.`)
  const run = reply.body?.record
  if (run?.id !== p.run || run.kind !== 'session') fail(`The answer for run ${p.run} is not its whole session record. Nothing can land.`)
  const title = landingTitle(run.title, p.run)
  if (run.data?.sealedTip !== p.seal) fail(`Run ${p.run} does not name seal ${p.seal}; its landing provenance is unreadable. Nothing can land.`)
  return { ...p, title }
}

/**
 * `queued` is what theMigrationsQueued read of the other queued entries of the lane, or null when it was not read; a
 * migration renumbered here takes a number above every number in it (wave 13v round 26). The five reads come from the
 * caller, as the-merger.mjs passes arguments.mjs's THE_INTEGRATION_READS.
 * @param {any} entry
 * @param {{ queued?: { rows: { idx: number, when: number, tag: string, entry: string }[], read: string[], unread: { entry: string, why: string }[], lane: string | null } | null, landing?: boolean, resolutionRefPosition?: unknown, ownerContentPosition?: unknown, placeholderAddressesPosition?: unknown, integratedBuildPosition?: unknown, commitAddressFallback?: unknown, ask?: unknown, countAGateMet?: unknown, runInSandbox?: unknown, step?: unknown, theSandbox?: unknown, theSeal?: unknown }} [options]
 */
export async function integrateGit(entry, { queued = null, landing = true, resolutionRefPosition, ownerContentPosition, placeholderAddressesPosition, integratedBuildPosition, commitAddressFallback, ask, countAGateMet, runInSandbox, step, theSandbox, theSeal } = {}) {
  if (typeof resolutionRefPosition !== 'function' || typeof ownerContentPosition !== 'function' || typeof placeholderAddressesPosition !== 'function' || typeof integratedBuildPosition !== 'function' || typeof commitAddressFallback !== 'function') throw new Error(THE_INTEGRATION_NEEDS.integrateGit)
  if (typeof ask !== 'function' || typeof countAGateMet !== 'function' || typeof runInSandbox !== 'function' || typeof step !== 'function' || typeof theSandbox !== 'function' || typeof theSeal !== 'function') throw new Error(THE_INTEGRATION_NEEDS_THE_OFFICE_FUNCTIONS)
  const { root, commit, base } = entry.changeset
  // The driver requests a landing commit; callers that only exercise replay can still read the intermediate history.
  const source = landing ? await theLandingSource(entry, ask) : null
  const seal = await theSeal(entry)
  const { judged, from: judgedFrom } = whatWasJudged(entry, seal)
  const mainBranch = tryGit(root, ['symbolic-ref', '--short', 'HEAD'])
  const M = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
  // AN ENTRY WHOSE RESOLUTION ITS CHECK PASSED IS REPLAYED FROM THAT RESOLUTION, which stands on the main its conflict
  // met, and not from its own commit. The lines and the journal below are still judged against its own commit.
  const from = aResolutionPassedItsCheck(entry.machine?.resolution) ? await theResolutionItsCheckPassed(root, entry, resolutionRefPosition, countAGateMet) : commit
  if (!tryGit(root, ['cat-file', '-e', `${from}^{commit}`]).ok) fail(`Commit ${from} is not in ${root}; the entry was not pinned here.`)
  const upstream = git(root, ['merge-base', from, replayMain(gitIn(root), M)])
  if (!tryGit(root, ['merge-base', '--is-ancestor', base, upstream]).ok) {
    fail(`The sealed fork base ${base} is not an ancestor of merge-base ${upstream} of ${from === commit ? 'entry tip' : 'the resolution'} ${from} and main ${M}; nothing was rebased.`)
  }
  log(`rebase upstream ${upstream}: ${upstream === base ? 'it is the sealed fork base' : `the sealed fork base ${base} is its ancestor; main's commits already in the entry are not replayed`}. The sealed fork base stays ${base} for content checks.`)
  // A DOCUMENTATION ENTRY IS ASKED AGAIN AGAINST MAIN AS IT IS NOW: a test that reads one of its files may have landed
  // since it was pinned, and then it bounces, to be submitted again and tested as any entry.
  if (entry.machine?.documents !== undefined) {
    const again = theDocumentsOf(entry)
    if (again.documents === undefined) {
      return step(
        'guard-failed',
        {
          guard: 'documents',
          files: [...entry.machine.documents.files].sort(),
          detail: `This was a documentation entry when it was pinned, and it is not now: ${again.none}. Submit it again, and it is tested as any entry (the documentation-entry rule).`,
        },
        { was: entry.machine.documents, now: again.none },
      )
    }
  }
  const mainsRecord = theRecordOfMain(root)
  // THE CLONE IS MADE INSIDE THE ENTRY'S SANDBOX, the one place that sandbox may write (finding 17).
  const sandbox = await theSandbox(root)
  const clone = join(sandbox.folder, 'work', 'clone')
  rmSync(clone, { recursive: true, force: true })
  mkdirSync(dirname(clone), { recursive: true })
  git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, clone])
  git(clone, ['checkout', '--quiet', '--detach', from])
  linkNodeModules(root, clone)
  const journalSaid = (name) => saidInTheClone(clone, name)

  // THE REBASE AND ITS JOINS are rebase-with-joins.mjs, which the early trial runs as well (wave 13v round 25).
  const rebased = rebaseWithTheJoins(clone, { main: M, upstream, commit: from, queued })
  const renumbered = rebased.renumbered ?? null
  if (!rebased.ok) {
    const conflictLog = join(WORKDIR, 'conflict.log')
    writeFileSync(conflictLog, `git rebase ${M} in ${clone}:\n${rebased.output}\n`)
    return step(
      'conflict',
      { files: rebased.files, mainAt: M, log: conflictLog, says: rebased.says },
      { base: M, branch: mainBranch.ok ? mainBranch.stdout : null, said: rebased.output.slice(-1500) },
    )
  }
  // A MIGRATION THAT SITS BEHIND MAIN'S NEWEST IS RENUMBERED NOW (wave 13v round 23). The journal join puts its row after
  // main's and nothing conflicts, but a database that applies by date skips it: on 11 October 2026 an entry
  // carried 0214 onto a main whose newest was 0227, and three test files went red. It gets the next number above main's
  // newest and above every number the other queued entries carry, and its journal row goes last (wave 13v round 26).
  const behind = renumberMigrationsBehindMain(clone, M, git(clone, ['rev-parse', '--verify', 'HEAD^{commit}']), queued?.rows ?? [])
  if (!behind.ok) {
    log(`a migration behind main's newest was not renumbered: ${behind.why}`)
    return step(
      'guard-failed',
      { ...(renumbered?.ok ? {renumberedMigrations: renumbered.mappings.map(({from, to}) => ({from, to}))} : {}), guard: 'migration-order', files: behind.files, detail: behind.why },
      { base: M },
    )
  }
  if (behind.mappings.length > 0) log(`Migrations behind main's newest renumbered in the commits that add them, because ${behind.because}, and their journal rows put last: ${behind.says}${theFilesRenamed(behind.renamed)}. Of the other queued entries: ${whatTheQueueSaid(queued)}${behind.touched.length > 0 ? `; the old numbers were replaced in ${behind.touched.map(({path, count}) => `${path} (${count})`).join(', ')}` : ''}`)
  const Cprime = git(clone, ['rev-parse', '--verify', 'HEAD^{commit}'])
  const journalJoins = journalSaid(JOURNAL_JOINS_SAID)
  if (journalJoins !== '') log(`the migration journal was joined by itself: ${journalJoins.split('\n').join('; ')}`)
  const listJoins = journalSaid(LIST_JOINS_SAID)
  if (listJoins !== '') log(`list files were joined by themselves, and the joined tree is checked and tested as any other: ${listJoins.split('\n').join('; ')}`)
  const touched = touchedBetween(clone, M, Cprime)
  const renumberMappings = [...(renumbered?.ok ? renumbered.mappings : []), ...behind.mappings]
  const renumberings = renumberMappings.map(({from, to}) => ({from, to}))
  const renumberingFacts = renumberings.length > 0 ? {renumberedMigrations: renumberings} : {}

  // WHAT CHANGED SINCE THE VERDICT, for the log only: the office works it out from the content reported
  // below (R2, SPEC 5.5), and a judged path whose blob at C' is not the judged blob is what it will find.
  const changedSinceJudged = Object.entries(judged)
    .filter(([path, hash]) => (hashAt(clone, Cprime, path) ?? ABSENT) !== hash)
    .map(([path]) => path)
    .sort()

  // GUARD 1: the git checker, run from this checkout's own tools (R4).
  checkBeforeATool(clone)
  const checker = runChecker('git-changeset.mjs', ['--repo', clone, '--base', M, '--head', Cprime, '--scratch', join(WORKDIR, 'checks')], {
    MOLE_OFFICE_API: API,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
  })
  if (checker.failed.length > 0) {
    return step(
      'guard-failed',
      { ...renumberingFacts, guard: 'git-changeset', files: [...new Set(checker.failed.map((one) => one.path))].sort(), detail: failuresSaid(checker.failed).slice(0, 4000), log: checker.saved },
      { base: M, result: Cprime, decided: checker.failed },
    )
  }
  // GUARD 2: no mutation marker is left anywhere in the rebased tree (flow item 30).
  const markers = readMutationMarkers(clone)
  if (markers.length > 0) {
    return step(
      'guard-failed',
      {
        ...renumberingFacts, guard: 'mutation-markers',
        files: [...new Set(markers.map((one) => one.file))].sort(),
        detail: `An applied mutation marker is left in ${[...new Set(markers.map((one) => one.file))].sort().join(', ')} (flow item 30).`,
      },
      { base: M, result: Cprime, markers },
    )
  }
  // GUARD 3: no NEW owner content in what ships (wave 13v round 30). It reads only the lines the
  // entry adds, M...C', in the paths that ship; tools/merge-tool/owner-content.mjs says what it refuses and what it only
  // names. Every hit is kept at <workdir>/checks/owner-content.json, which is the log the step names. It is loaded here
  // and not at the top, because it reads comments with tests/the-pieces-of-a-source.ts, and its patterns come from
  // theOwnerContentPatterns in arguments.mjs, which loads the names, about 0.2 s that every other step of this tool
  // would pay at its start. The gate reads no office setting itself; arguments.mjs makes the patterns from the file the
  // setting names. Its reminders go on the integrated step as facts of their own (round 31), which the office keeps
  // through to `data.integrated`; the sentence also goes on the tested step.
  // THE GUARD HAS A ROW OF ITS OWN, owner-content-in-what-ships (wave 13r round L). Its position is read and counted only
  // when it would refuse. At off, each hit it let through is said in the log and, after the reminders, on the tested
  // step; it ships when the entry lands. The integrated step's own facts stay the reminders alone.
  const { screenTheAddedLines, theLetThroughAtOffSaid, theRefusalSaid, theRemindersFacts, theScreenSaid } = await import('./owner-content.mjs')
  const screen = screenTheAddedLines({ repo: clone, base: M, head: Cprime, patterns: await theOwnerContentPatterns() })
  mkdirSync(join(WORKDIR, 'checks'), { recursive: true })
  const screenLog = join(WORKDIR, 'checks', 'owner-content.json')
  writeFileSync(screenLog, `${JSON.stringify(screen, null, 2)}\n`)
  log(theScreenSaid(screen))
  const reminders = theRemindersFacts(screen, screenLog)
  let ownerContent = reminders.says ?? null
  if (ownerContent !== null) log(ownerContent)
  const refusal = theRefusalSaid(screen)
  const ownerContentAt = refusal === null ? null : ownerContentPosition()
  if (ownerContentAt !== null) await countAGateMet('owner-content-in-what-ships', ownerContentAt)
  if (ownerContentAt === 'off') {
    const through = String(theLetThroughAtOffSaid(screen)).slice(0, 4000)
    log(through)
    ownerContent = ownerContent === null ? through : `${ownerContent} ${through}`
  } else if (refusal !== null) {
    return step(
      'guard-failed',
      { ...renumberingFacts, guard: 'owner-content', files: [...new Set([...screen.refused.map((one) => one.file), ...screen.newFiles.refused])].sort(), detail: refusal.slice(0, 4000), log: screenLog },
      { base: M, result: Cprime, refused: screen.refused, newFiles: screen.newFiles.refused },
    )
  }
  // GUARD 4: no NEW IPv4 address outside loopback, the unspecified address and the documentation ranges, in ANY path
  // (the tool maintainer, 18 October 2026). It reads only the lines the entry adds, M...C';
  // tools/merge-tool/addresses.mjs says what it refuses and what its allow-list lets through. Its refusal names the file,
  // the line, the column and the kind of range, never the address, and so does <workdir>/checks/addresses.json, the log
  // the step names. Loaded here, after the owner-content gate whose git reader it uses.
  const addresses = await import('./addresses.mjs')
  const addressScreen = addresses.screenTheAddedLines({ repo: clone, base: M, head: Cprime })
  const addressLog = join(WORKDIR, 'checks', 'addresses.json')
  writeFileSync(addressLog, `${JSON.stringify(addressScreen, null, 2)}\n`)
  log(addresses.theScreenSaid(addressScreen))
  const addressRefusal = addresses.theRefusalSaid(addressScreen)
  if (addressRefusal !== null) {
    return step(
      'guard-failed',
      { ...renumberingFacts, guard: 'addresses', files: [...new Set(addressScreen.refused.map((one) => one.file))].sort(), detail: addressRefusal.slice(0, 4000), log: addressLog },
      { base: M, result: Cprime, refused: addressScreen.refused },
    )
  }

  // REGENERATE WHAT THE CHANGE MAKES STALE, as the merger's own commit on top. A LANDING HAS ONE INSTANT, read from the
  // clock once: the generators read the history as it lands at that instant, and the landing commit carries it, so a
  // table written before midnight and a landing commit made after it name the same day.
  const landingAt = source === null ? null : inGitsOwnFormat(Date.now())
  let { Cfinal, regenerated } = await regenerateOnTop(clone, M, Cprime, touched, sandbox, chosen.entry, { landingAt, runInSandbox })
  const replayed = Cfinal
  if (source !== null) {
    source.replayed = replayed
    Cfinal = git(clone, ['-c', 'commit.gpgSign=false', 'commit-tree', git(clone, ['rev-parse', `${replayed}^{tree}`]), '-p', M, '-m', landingMessage(source.title, source)], { env: datedAt(landingAt) })
    git(clone, ['reset', '--hard', Cfinal])
    // Facts name the commit that the office will test and land. The intermediate replay remains kept separately.
    if (regenerated?.commit != null) regenerated = { ...regenerated, commit: Cfinal }
  }

  // GUARD 4, THE WHOLE TREE: no IPv4 address outside loopback, the unspecified address and the documentation ranges in
  // ANY file of the landing commit's tree, whichever change wrote it (wave 13u round 167). Guard 4 above reads only the
  // lines the entry adds, so an address main already held never stopped anything. This reads every file of Cfinal, after
  // the regeneration, so an address a generator writes bounces the entry that made it be written, and not the next one.
  // tools/merge-tool/addresses.mjs's screenTheTree says what it reads, with the same allow-list. Its refusal and
  // <workdir>/checks/addresses-in-the-tree.json name the file, the line and column or the byte, and the kind of range,
  // never the address.
  const treeScreen = addresses.screenTheTree({ repo: clone, commit: Cfinal })
  const treeLog = join(WORKDIR, 'checks', 'addresses-in-the-tree.json')
  writeFileSync(treeLog, `${JSON.stringify(treeScreen, null, 2)}\n`)
  log(addresses.theTreeSaid(treeScreen))
  const treeRefusal = addresses.theTreeRefusalSaid(treeScreen)
  if (treeRefusal !== null) {
    return step(
      'guard-failed',
      { ...renumberingFacts, guard: 'addresses', files: [...new Set(treeScreen.refused.map((one) => one.file))].sort(), detail: treeRefusal.slice(0, 4000), log: treeLog },
      { base: M, result: Cfinal, refused: treeScreen.refused },
    )
  }

  // GUARD 5: no commit the landing publishes or retains is at the placeholder domain of MOLE_OFFICE_COMMIT_EMAIL's
  // declared default, as its author or committer. It reads the effective replay, including generation, and the single
  // final commit; tools/merge-tool/commit-addresses.mjs
  // says what it finds. Its refusal and <workdir>/checks/commit-addresses.json write no address but the placeholder's.
  // The screen and its file come first, so they are kept at every position. THE GATE'S POSITION IS READ ONLY WHEN THE
  // SCREEN FOUND A COMMIT, where the gate would act, and the gate is counted there at that position, as the owner-content
  // guard above and the build guard below read and count theirs (wave 13r round L). The position says what is done with
  // what was found: block refuses the entry, remind carries each commit on the integrated step, off only says so. A count
  // the office does not take is said in the log and never stops the entry.
  const commitAddresses = await import('./commit-addresses.mjs')
  const placeholderDomain = commitAddresses.thePlaceholderDomainOf(commitAddressFallback())
  const commitScreen = commitAddresses.screenTheCommits({ repo: clone, base: M, head: Cfinal, domain: placeholderDomain })
  const replayScreen = source === null ? null : commitAddresses.screenTheCommits({ repo: clone, base: M, head: replayed, domain: placeholderDomain })
  const commitLog = join(WORKDIR, 'checks', 'commit-addresses.json')
  writeFileSync(commitLog, `${JSON.stringify(replayScreen === null ? commitScreen : { replay: replayScreen, landing: commitScreen }, null, 2)}\n`)
  log(commitAddresses.theScreenSaid(commitScreen))
  if (replayScreen !== null) {
    log(commitAddresses.theScreenSaid(replayScreen))
    // The evidence above keeps each real range. The decision below needs only their refused commit lists.
    commitScreen.refused = [...commitScreen.refused, ...replayScreen.refused]
  }
  const placeholderAt = commitScreen.refused.length === 0 ? null : placeholderAddressesPosition()
  const commitGate = placeholderAt === null ? null : commitAddresses.whatTheGateDoes(commitScreen, placeholderAt)
  if (commitGate !== null && commitGate.said !== null) log(commitGate.said)
  if (placeholderAt !== null) await countAGateMet('placeholder-addresses', placeholderAt)
  if (commitGate !== null && commitGate.refusal !== null) {
    return step(
      'guard-failed',
      { ...renumberingFacts, guard: 'commit-addresses', files: [], detail: commitGate.refusal.slice(0, 4000), log: commitLog },
      { base: M, result: Cfinal, refused: commitScreen.refused },
    )
  }
  const placeholderCommits = commitGate === null || commitGate.carried === null ? null : { ...commitGate.carried, log: commitLog }

  // Build before reporting integrated: a broken joined tree must not reach a scoped reinspection.
  // THE BUILD GUARD HAS A ROW OF ITS OWN, integrated-tree-builds (wave 13r round L). Its position is read and counted only
  // when the build failed. At off the entry goes on: the state keeps the failed build, and the test step reports it red
  // without building again (tools/merge-tool/testing.mjs).
  let integratedBuild
  if (typeof packageScripts(clone).build === 'string') {
    const built = await runInSandbox(sandbox, 'integrate-build', 'npm', ['run', 'build'], { cwd: clone, timeoutMs: SCRIPT_TIMEOUT_MS })
    const noResult = whyARunGaveNoResult(built)
    if (noResult !== null) fail(`The integrated tree's build gave no result: ${noResult}; ${whatTheRunSaid(built)} (log ${built.outFile}). Nothing says whether it builds.`)
    const buildAt = built.code === 0 ? null : integratedBuildPosition()
    if (buildAt !== null) await countAGateMet('integrated-tree-builds', buildAt)
    if (buildAt === 'off') {
      log(`The integrated tree's npm run build exited ${String(built.code)} in sandbox ${sandbox.name} (log ${built.outFile}). The integrated-tree-builds gate is at off, so the entry was not sent back here; its test step reports the failed build as red.`)
      integratedBuild = { passed: false, exit: built.code, log: built.outFile }
    } else if (built.code !== 0) {
      const output = readFileSync(built.outFile, 'utf8').split('\n').filter((line) => line.trim() !== '' && !line.startsWith('sandbox-start: '))
      const errors = output.filter((line) => /\berror\b|\bTS\d{4}\b|\bfailed\b/iu.test(line))
      const first = (errors.length > 0 ? errors : output).slice(0, 12).join('\n').slice(0, 3000)
      return step('guard-failed', {
        ...renumberingFacts, guard: 'build', files: touched,
        detail: `The integrated tree's npm run build exited ${String(built.code)} in sandbox ${sandbox.name}. First ${errors.length > 0 ? 'errors' : 'output'}:\n${first}`,
        log: built.outFile,
      }, { base: M, result: Cfinal, build: { exit: built.code, log: built.outFile } })
    }
  } else {
    log('The integrated tree has no build script in package.json; no build was verified.')
  }

  // The failed build the integrated-tree-builds gate let on at off, kept for the test step; nothing when it built.
  const theFailedBuild = integratedBuild === undefined ? {} : { build: integratedBuild }
  // A bus can fetch the squash without walking its original replay. Cache both objects in the root before the
  // integrated step publishes their hashes, so every shared copy can read the complete provenance. No ref or main moves.
  if (source !== null) git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', clone, Cfinal, replayed])
  writeState({ adapter: 'git', integrated: { M, base, Cprime, Cfinal, replayed, ...(source === null ? {} : { landingSource: source }), clone, sandbox: sandbox.name, at: stamp(), ...theFailedBuild, ownerContent }, landing: null })
  // A FILE THIS TOOL REGENERATED IS DECIDED, NOT JUDGED (R4): the generator the project declares wrote
  // it on the integrated tree, so the checker's report carries it as a decided pass and the office does
  // not send it to the inspector.
  const regeneratedDecided = [regenerated]
    .filter((one) => one !== null && one.commit !== null)
    .flatMap((one) => one.paths.map((path) => ({
          path,
          check: 'regenerates',
          ok: true,
          detail: one.detail ?? `The merge queue ran \`${one.command.join(' ')}\` on the integrated tree and committed its output as ${one.commit}.`,
        })))
  // THE CONTENT REPORTED IS EVERY PATH THAT DIFFERS FROM THE MAIN WORLD in the commit that would land,
  // at its sha256 — the result the tests run on and the office's scoped check would read.
  const files = contentAt(clone, Cfinal, changedBetween(clone, M, Cfinal))
  const lines = linesOfTheLineFiles(clone, { base, commit, M, Cfinal, judged, files })
  // A JOURNAL THAT JOINED IS JUDGED AGAIN BY A PROGRAM (wave 13v round 18): R2 still holds, since the joined file's own
  // content is checked, and R4 lets a program decide it. It holds when the result keeps every row of the entry's journal
  // and of main's and adds none. Otherwise nothing is added, and the journal goes to the inspector as before.
  const journalDecided = []
  if (THE_JOURNAL in files && files[THE_JOURNAL] !== judged[THE_JOURNAL]) {
    const journalAt = (at) => (hashAt(clone, at, THE_JOURNAL) === null ? null : git(clone, ['show', `${at}:${THE_JOURNAL}`]))
    const { decided, why } = theJournalDecided(journalAt, { entry: commit, onto: M, result: Cfinal, renumbered: renumberMappings })
    if (decided === null) log(`the joined migration journal is not decided by its check, so the inspector reads it: ${why}.`)
    else {
      log(`the joined migration journal is decided by its check: ${decided.detail}`)
      journalDecided.push(decided)
    }
  }
  return step(
    'integrated',
    {
      result: Cfinal,
      mainAt: M,
      clone,
      files,
      checker: reportOf(checker, { extra: [...regeneratedDecided, ...journalDecided] }),
      ...(mainsRecord.record === null
        ? {}
        : { reads: { tree: mainsRecord.tree, files: mainsRecord.record.files.length, folders: mainsRecord.record.folders.length, record: mainsRecord.file } }),
      ...(lines.length === 0 ? {} : { lines }),
      ...renumberingFacts,
      ownerContent: reminders,
      ...(placeholderCommits === null ? {} : { placeholderCommits }),
    },
    { base: M, branch: mainBranch.ok ? mainBranch.stdout : null, rebased: Cprime, final: Cfinal, touched, changedSinceJudged, judgedFrom, regenerated, checkerSaved: checker.saved },
  )
}
