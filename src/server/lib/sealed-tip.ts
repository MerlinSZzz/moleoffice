// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { inspectionBase, inspectionTrunk, theNewerTrunk } from '../../config/inspection-base.mjs'
import { A_RECORDED_COMMIT_SAYS, aBaseThatDidNotResolve, THE_TRUNK_CANNOT_BE_TOLD } from './check-tip.ts'
import { theRowNamesTheFolder } from '../../config/sandbox-folder.mjs'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { gitsNameForABlob, inGroups, theNamesIn, whatIsOutsideTheCommit } from '../../config/outside-the-commit.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { sealHash, THE_COLUMNS_A_LINK_IS_HASHED_BY, theHashOfARow } from './the-hash-a-seal-pins-a-row-by.ts'
import { readGit, whyGitDidNotAnswer } from './resources.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { readMergeEntry } from './merge-queue.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readSync, readlinkSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { FilesSubmission, GitSubmission, LinkSeal, RecordRevisionSeal, RecordSubmission, SealedFile, SealedOrigin, SealedTip } from '@shared/sealed-tip.ts'
import { nowStamp } from '@shared/time.ts'
import { isAStandardKind, STANDARD_KINDS } from '@shared/standard-change.ts'
import { aRunSaysItIsFinished, THE_SWEEPS_CLOSE } from '@shared/releasing.ts'
import { sqlite } from '../db/client.ts'
import { THE_CREATE_REVISIONS_BY_SESSION_INDEX } from '../db/schema.ts'
import { createRecord, createLink, getRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import type { PanelRecord } from '@shared/types.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { resolveCheckEligibilityFacts, theCheckAgainsEntry, theMergeEntryACheckAgainIsFor, theSealsReadingOfARunsAgent, whyAWorkersSupervisorIsNotTold } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theRowNamesAnotherMachine } from './machines.ts'
import { writeASystemLineToOne } from './groups.ts'
import { whoIsToldOfASealOnceAPackageMoves } from './delegation.ts'
import { theSealEmptiesTheAreaSetForItsRun, type RegisteredAgent } from './participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { sayTheCommitsWereNotChecked, theCommitsPastTheCutAtTheWrite, theGitOfASealAtTheWrite, theRunsOwnCommitsAtTheWrite } from './a-finish-reads-git-apart.ts'
import { CARRIED_COMMITS, END_HEAD } from '@shared/kinds.ts'
import { theEndHeadAtTheSeal, theOwnCommitsAskOf, theOwnCommitsJudged, theRunsOwnCommitsRead, type AHeadRead, type TheRunsOwnCommits } from './a-runs-own-commits.ts'
import type { ASealGitAsk, TheCommitsPastTheCut } from './the-seal-read-apart-thread.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { theRecordedBaseOfRun } from '@shared/next-round.ts'
import { A_CUT_FROM_COMMIT_IS } from '@shared/kind-fields/session-wave-13n.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { LANDED_KEEP_PREFIX, retainedLandings } from '../../shared/merge/landed-history.mjs'
import { whoIsToldOfASeal, whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { theSandboxFolderOf } from './the-sandbox-folder-of.ts'

let writingSeal = false
export const officeIsWritingSeal = (): boolean => writingSeal

/**
 * THE AREA A SEAL TAKES IN PLACE OF ITS AGENT'S WORK AREA, WHILE THE OFFICE FILES A SECRETARY'S RUN.
 *
 * A secretary has no registered work area, so `sealFinishedRun` would refuse its run. The office files
 * that run itself, already finished, for a secretary's design/-only merge entry, as a decision
 * says; `submitASecretarysDesignEntry` in ./merge-queue.ts does it, and the record
 * door seals it
 * in the same write. This is the one way to name the area for that seal. It is set only for the length
 * of `write`, and nothing else sets it.
 */
let theAreaTheOfficeNames: string[] | null = null
export function sealingTheArea<T>(area: string[], write: () => T): T {
  theAreaTheOfficeNames = [...area]
  try { return write() } finally { theAreaTheOfficeNames = null }
}

export { sealHash }
const CANNOT_BE_SEALED = 'The submitted Git work cannot be sealed: '
function gitRead(directory: string, args: string[], options?: { input?: string; maxBuffer?: number; workTree?: string }): Buffer {
  try { return readGit(directory, args, options) }
  catch (error) { throw new PanelError(`${CANNOT_BE_SEALED}${String(error)}`, 409) }
}
const git = (directory: string, ...args: string[]): Buffer => gitRead(directory, args)
const line = (directory: string, ...args: string[]): string => git(directory, ...args).toString('utf8').trim()

const MAX_BLOB_BYTES = 64 * 1024 * 1024
const OBJECT_HEADER_BYTES = 128
interface TreeBlob { path: string; mode: string; oid: string }
interface SizedBlob extends TreeBlob { size: number }
function malformedGit(what: string): never { throw new PanelError(CANNOT_BE_SEALED + what, 409) }
/** A refusal of the shared reading (../../config/outside-the-commit.mjs) is a refusal to seal, in the seal's words. */
function sealing<T>(work: () => T): T {
  try { return work() }
  catch (error) {
    if (error instanceof PanelError) throw error
    throw new PanelError(CANNOT_BE_SEALED + (error instanceof Error ? error.message : String(error)), 409)
  }
}
/**
 * WHY THE GIT WORK COULD NOT BE READ, without the seal's words in front, for a reader that is not a seal: the
 * hand-over of a merge entry's resolution (`handOverAResolution`) says it in its own words. Null for anything this
 * file did not refuse in the seal's words.
 */
export function whyTheGitWorkCouldNotBeRead(error: unknown): string | null {
  if (!(error instanceof PanelError) || error.status !== 409 || !error.message.startsWith(CANNOT_BE_SEALED)) return null
  return error.message.slice(CANNOT_BE_SEALED.length).trim()
}
const nulNames = (bytes: Buffer): string[] => sealing(() => theNamesIn(bytes))

function treeBlobs(directory: string, commit: string, changed: string[], deleted: Set<string>): Map<string, TreeBlob> {
  const entries = new Map<string, TreeBlob>()
  const wanted = new Set(changed)
  // Asking for a directory and its child together suppresses the directory entry in ls-tree.
  // Deleted paths were files in the base, so none can be an ancestor of another deleted path.
  // Literal path arguments are bounded, including paths containing spaces, tabs or LF.
  const groups = [...inGroups([...deleted]), ...inGroups(changed.filter(path => !deleted.has(path)))]
  for (const names of groups) {
    for (const entry of nulNames(git(directory, 'ls-tree', '-z', commit, '--', ...names))) {
      const tab = entry.indexOf('\t')
      const header = /^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40}(?:[a-f0-9]{24})?)$/.exec(entry.slice(0, tab))
      const path = entry.slice(tab + 1)
      if (tab < 0 || !header || !wanted.has(path) || entries.has(path)) malformedGit('an invalid or repeated tree entry for ' + path + '.')
      const [, mode, type, oid] = header
      if (mode === '160000') throw new PanelError(CANNOT_BE_SEALED + `${path} is a submodule, which this reader does not read.`, 409)
      // A deleted file may now name a directory. The old per-path blob read refused it.
      if (type !== 'blob' || !['100644', '100755', '120000'].includes(mode!)) malformedGit('tree entry ' + path + ' is not a supported blob (' + type + ', ' + mode + ').')
      entries.set(path, { path, mode: mode!, oid: oid! })
    }
  }
  for (const path of changed) {
    if (entries.has(path) === deleted.has(path)) malformedGit('the tree entry and deletion list disagree for ' + path + '.')
  }
  return entries
}

function objectHeader(header: string): { oid: string; type: string; size: number } {
  const match = /^([a-f0-9]{40}(?:[a-f0-9]{24})?) (blob|tree|commit|tag) (0|[1-9][0-9]*)$/.exec(header)
  if (!match || !Number.isSafeInteger(Number(match[3]))) malformedGit('an invalid object header.')
  return { oid: match[1]!, type: match[2]!, size: Number(match[3]) }
}

/**
 * Check sizes first so 64 MiB stays a limit on one batch read, not on the whole commit. A blob over
 * it is not read through git at all: see `largeBlobHash` below.
 *
 * `onDisk` true (a seal): each file on disk must also hold the blob's bytes. False (a seal read again from its commit,
 * whose checkout is somewhere else): git's objects alone are hashed, a large blob too.
 */
function blobHashes(directory: string, blobs: TreeBlob[], onDisk = true): Map<string, string> {
  const sized: SizedBlob[] = []
  const large: SizedBlob[] = []
  for (let at = 0; at < blobs.length; at += 512) {
    const group = blobs.slice(at, at + 512)
    const bytes = gitRead(directory, ['cat-file', '--batch-check'], { input: group.map(one => one.oid + '\n').join('') })
    if (bytes[bytes.length - 1] !== 10) malformedGit('an incomplete object size list.')
    const headers = bytes.toString('latin1').slice(0, -1).split('\n')
    if (headers.length !== group.length) malformedGit('the object size list has a different number of entries.')
    group.forEach((one, index) => {
      const header = objectHeader(headers[index]!)
      if (header.oid !== one.oid || header.type !== 'blob') malformedGit('the object size entry does not match ' + one.path + '.')
      if (header.size > MAX_BLOB_BYTES) large.push({ ...one, size: header.size })
      else sized.push({ ...one, size: header.size })
    })
  }
  const hashes = new Map<string, string>()
  for (let at = 0; at < sized.length;) {
    const group: SizedBlob[] = []; let bodyBytes = 0
    while (at < sized.length && group.length < 512) {
      const one = sized[at]!
      if (group.length && bodyBytes + one.size > MAX_BLOB_BYTES) break
      group.push(one); bodyBytes += one.size; at++
    }
    const bytes = gitRead(directory, ['cat-file', '--batch'], {
      input: group.map(one => one.oid + '\n').join(''),
      maxBuffer: bodyBytes + group.length * OBJECT_HEADER_BYTES,
    })
    let offset = 0
    for (const one of group) {
      const end = bytes.indexOf(10, offset)
      if (end < offset || end - offset >= OBJECT_HEADER_BYTES) malformedGit('an incomplete object header for ' + one.path + '.')
      const header = objectHeader(bytes.toString('latin1', offset, end))
      if (header.oid !== one.oid || header.type !== 'blob' || header.size !== one.size) malformedGit('the object body header does not match ' + one.path + '.')
      offset = end + 1
      const after = offset + one.size
      if (after >= bytes.length || bytes[after] !== 10) malformedGit('an incomplete object body for ' + one.path + '.')
      const hash = sealHash(bytes.subarray(offset, after))
      if (onDisk && fileHash(directory, one.path) !== hash) throw new PanelError(`The content of ${one.path} differs from the submitted commit.`, 409)
      hashes.set(one.path, hash); offset = after + 1
    }
    if (offset !== bytes.length) malformedGit('unexpected bytes after the final object body.')
  }
  for (const one of large) {
    hashes.set(one.path, onDisk ? largeBlobHash(directory, one) : sealHash(gitRead(directory, ['cat-file', 'blob', one.oid], { maxBuffer: one.size + 1 })))
  }
  return hashes
}

const LARGE_READ_BYTES = 8 * 1024 * 1024

/**
 * A BLOB OVER 64 MiB, SEALED WITHOUT HOLDING IT IN MEMORY (acceptance finding 23, 22 September 2026).
 *
 * Until then the seal refused any blob over 64 MiB, because every blob came through one buffered
 * `git cat-file --batch` read. So the files lane could not carry an agent's recovered recordings
 * (75.7 MB and 83.5 MB), and a large data file could never be sealed at all.
 *
 * A large blob is not read through git. The file on disk is read once, in 8 MiB pieces, and two
 * hashes are taken in that one pass. The first is its SHA-256, which is what the seal holds. The
 * second is git's own name for those bytes as a blob: "blob <size>", a NUL, then the bytes, hashed
 * with the repository's object hash. That name must equal the committed tree entry. This is the same
 * promise the batch path makes: the seal holds the hash of the committed bytes, and the file on disk
 * is exactly those bytes. A symlink, a missing file, another size or other bytes are refused in the
 * batch path's own words.
 */
function largeBlobHash(directory: string, one: SizedBlob): string {
  const differs = (): PanelError => new PanelError(`The content of ${one.path} differs from the submitted commit.`, 409)
  const full = join(directory, one.path)
  let fd: number
  try {
    if (lstatSync(full).isSymbolicLink()) throw differs()
    fd = openSync(full, 'r')
  } catch (error) {
    if (error instanceof PanelError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw differs()
    throw new PanelError(`Cannot read sealed file ${one.path}: ${String(error)}`, 409)
  }
  try {
    if (fstatSync(fd).size !== one.size) throw differs()
    const content = createHash('sha256')
    const asGit = gitsNameForABlob(one.oid, one.size)
    const piece = Buffer.allocUnsafe(LARGE_READ_BYTES)
    let total = 0
    for (let read = readSync(fd, piece, 0, piece.length, null); read > 0; read = readSync(fd, piece, 0, piece.length, null)) {
      content.update(piece.subarray(0, read))
      asGit.update(piece.subarray(0, read))
      total += read
    }
    if (total !== one.size || asGit.digest('hex') !== one.oid) throw differs()
    return content.digest('hex')
  } finally {
    closeSync(fd)
  }
}

/**
 * Hash bytes, including symlink targets. A missing sealed file is reported by name.
 *
 * A PATH THAT PASSES THROUGH A LINK IS ABSENT, as it is to git (problem XH1db0-pOuVy). Git never
 * follows a link inside a path. So when a branch moves tools/kit/README.md away and makes tools/kit a
 * link, git records the file as deleted, and opening the joined path would find it through the link.
 * Every folder on the way is read with lstat, and a link among them answers null, as a missing file does.
 *
 * AND SO IS A PATH THAT PASSES THROUGH A FILE (wave 13n's round 39). When a branch deletes work/kit/a.md
 * and puts a file named work/kit where the folder was, git records a.md as deleted. lstat on the joined
 * path failed with ENOTDIR and the seal was refused with a 409. A folder on the way that is not a folder
 * answers null, as a link does.
 */
function fileHash(directory: string, path: string): string | null {
  try {
    let folder = directory
    for (const part of path.split('/').slice(0, -1)) {
      folder = join(folder, part)
      if (!lstatSync(folder).isDirectory()) return null
    }
    const full = join(directory, path)
    return sealHash(lstatSync(full).isSymbolicLink() ? readlinkSync(full, { encoding: 'buffer' }) : readFileSync(full))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new PanelError(`Cannot read sealed file ${path}: ${String(error)}`, 409)
  }
}
/**
 * WHAT THE TIP MUST HAVE COMMITTED BEFORE IT CAN BE SEALED.
 *
 * Two questions are asked: does any tracked file differ from the commit, and are there untracked files that git does
 * not ignore. Either is work that is not in the commit and would be lost, so either refuses.
 *
 * THE OFFICE COMPARES THE TRACKED FILES ITSELF, AND GIT DOES NOT. A run can write its repository's config and its
 * attributes, and git runs a filter the repository names whenever it compares a file in the work tree with a commit or
 * the index. So git is asked only for lists, and the office reads each tracked file on disk: `whatIsOutsideTheCommit` in
 * ../../config/outside-the-commit.mjs, which says what it checks and what it cannot see. A path the commit changed is
 * compared by `theFilesOfACommit`, which reads its bytes for the seal anyway, so there only its kind and its executable
 * bit are checked. A submodule the commit changed is refused by `theFilesOfACommit`.
 *
 * A FILE THE OFFICE COULD NOT COMPARE REFUSES THE SEAL TOO. Git converts some files on checkout, by an attribute that
 * names a filter, eol=crlf, ident or a working-tree-encoding. When such a file holds other bytes than the committed
 * blob, whether it holds work that is not in the commit cannot be told without running that conversion, and a filter is
 * a program the run may have chosen. So the seal does not take it as the commit's: it refuses and names the file. A
 * path the commit changed is held to the committed bytes by `theFilesOfACommit`, with no conversion, as before.
 *
 * AN IGNORED FILE IS NOT ASKED ABOUT, even one inside the submitted area. Git will never track it,
 * so it can never reach main, and it is therefore not work outside the commit. A run whose own
 * suite writes pictures or tool scratch into its tree must still be able to finish; problem
 * `mc79LcXbasOE` is that case. The seal still records the submitted area, but the area is no longer
 * a question this reader asks of git.
 *
 * AND A RUN'S OWN LOG IS NOT ASKED ABOUT EITHER. The office's procedure writes a worker's run log
 * under `<workingDirectory>/.logs/`, so every worker leaves an untracked `.logs/` directory behind.
 * A log is the record of the run, not work the run submitted, and refusing the seal over it stopped
 * every finish in a repository whose .gitignore does not name `.logs/` (the CFC repository's does
 * not; problem `zhjORdd3zYyr`). Untracked files under `.logs/` at the root of the working directory
 * therefore have the same standing as an ignored file. Nothing else is widened: a tracked file that
 * differs and any other untracked file still refuse.
 */

/** The branch a run with no cutFrom is read against, read from the repository (inspectionTrunk). */
function trunkOf(directory: string, commitOf: (name: string) => string | null) {
  return inspectionTrunk({
    remoteHead: () => {
      try { return line(directory, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD') }
      catch { return null }
    },
    localExists: (name: string) => commitOf(name) !== null,
  })
}

/** The commit a ref resolves to, or null where it does not. A missing ref is an answer, not a failure to seal. */
function theCommitNamed(directory: string, name: string): string | null {
  try { return gitRead(directory, ['rev-parse', '--verify', '--quiet', name + '^{commit}']).toString('utf8').trim() }
  catch { return null }
}

/** The commit a named base resolves to, or an office-worded refusal that names the base it tried. */
function baseCommit(directory: string, base: string): string {
  try { return gitRead(directory, ['rev-parse', '--verify', base + '^{commit}']).toString('utf8').trim() }
  catch (error) {
    throw new PanelError(
      `The submitted Git work cannot be sealed: the office read the base ${base} and git could not resolve it to a commit: ${String(error)}`,
      409,
    )
  }
}

/** The base named by a run, including a commit recorded for the name still on the run. */
export function theBaseARunNames(data: Record<string, unknown>): string | null {
  const read = theRecordedBaseOfRun(data)
  if ('fails' in read) throw new PanelError(A_CUT_FROM_COMMIT_IS, 409)
  return read.base
}

/**
 * THE BRANCH A FIRST SEAL READS ITS FORK BASE OFF, for a run that names `base` as its cutFrom, or none, asked for each
 * HEAD it is read for. `captureGit` asks it for the worktree it seals. The reminder before the seal asks it for another
 * worktree's HEAD (item 2x, ./before-the-seal.ts), so that worktree's commits are read against the fork base the seal
 * would read. The refs are read once; a HEAD changes only whether a cutFrom that resolves to it falls back to the trunk.
 */
export function theBranchASealReadsOff(directory: string, base: string | null): (commit: string) => string {
  const chosenFor = theBaseASealReadsOff(directory, base)
  return (commit) => chosenFor(commit).branch
}

/** What the seal's refusal tells a repository that has no local branch to choose as the base. */
export const A_REPOSITORY_WITH_NO_LOCAL_BRANCH_IS_TOLD =
  'It has no local branches. To make the base exact, register or start the run with --cut-from and a full commit hash.'

/**
 * Why the seal refuses where the base a run names did not resolve and the trunk of the repository at `clone` cannot be
 * told, with the local branches to choose from.
 */
export function aSealWithNoBaseAndNoTrunkIsRefused(clone: string, base: string, branches: readonly string[]): string {
  const choose = branches.length === 0 ? A_REPOSITORY_WITH_NO_LOCAL_BRANCH_IS_TOLD
    : `Its local branches are ${branches.join(', ')}. To make the base exact, register or start the run with --cut-from and one of those branches, or with a full commit hash.`
  return `The submitted Git work cannot be sealed: the repository at ${clone} has no branch or commit named ${base}, and its trunk cannot be told, because ${THE_TRUNK_CANNOT_BE_TOLD}. ${choose}`
}

/** What a seal stores of the fork base it read off `branch`, and why it read that branch. */
export function theForkBaseSays(branch: string, says: string): string {
  return `The fork base is the merge base of the tip and ${branch}. ${says}`
}

/**
 * THE SAME BRANCH, AND THE SENTENCE THAT SAYS WHY IT WAS CHOSEN. `captureGit` stores the sentence in the seal. Where the
 * named base did not resolve, it is made by the check's own maker (`aBaseThatDidNotResolve`, ./check-tip.ts), so the
 * seal and the check say one thing about one run, each with its own name. The seal's words name the branch and commit
 * theNewerTrunk chose, because that is what the seal read.
 */
export function theBaseASealReadsOff(directory: string, base: string | null): (commit: string) => { branch: string; says: string } {
  // EACH NAME IS READ ONCE, by this call and the answer it returns: the trunk's branches, the named base and
  // theNewerTrunk's refs. A name that resolved is not asked again, so `main` is one git process where it was three. A
  // name that did not resolve and is needed as the base is still read by baseCommit, whose refusal holds git's own words.
  const commits = new Map<string, string | null>()
  const commitOf = (name: string): string | null => {
    if (!commits.has(name)) commits.set(name, theCommitNamed(directory, name))
    return commits.get(name) ?? null
  }
  // NO CUT-FROM AND NO EARLIER SEAL: the trunk is a fact about the repository and is read from
  // it, never assumed. An unresolved name falls back to that trunk. inspectionTrunk is the one
  // function, so the check and the seal cannot disagree about what the trunk is.
  // THE TRUNK IS READ EVEN WHEN A cutFrom IS NAMED, because a cutFrom that resolves to the
  // run's own HEAD falls back to the trunk (inspectionBase), and that fallback was the word
  // main until a supervisor hit it in a master repository. Its ambiguity refuses the seal only
  // when nothing else names a base.
  const trunk = trunkOf(directory, commitOf)
  let effective = base
  let unresolved: string | null = null
  if (base !== null && !/^[0-9a-f]{40}$/i.test(base) && commitOf(base) === null) {
    if (trunk.branch === null) {
      const clone = dirname(realpathSync(resolve(directory, line(directory, 'rev-parse', '--git-common-dir'))))
      const branches = line(directory, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').split('\n').filter(Boolean)
      throw new PanelError(aSealWithNoBaseAndNoTrunkIsRefused(clone, base, branches), 409)
    }
    effective = null
    unresolved = base
  }
  if (effective === null && trunk.branch === null) throw new PanelError(trunk.says, 409)
  const resolvedName = effective ?? (trunk.branch as string)
  const resolved = commits.get(resolvedName) ?? baseCommit(directory, resolvedName)
  const chosenFor = new Map<string | null, { branch: string; says: string }>()
  return (commit) => {
    const named = effective !== null && /^[0-9a-f]{40}$/i.test(effective)
      ? { branch: effective, says: A_RECORDED_COMMIT_SAYS }
      : inspectionBase(effective, commit, resolved, trunk)
    const known = chosenFor.get(named.branch)
    if (known !== undefined) return known
    // THE TRUNK IS THE NEWER OF THE LOCAL BRANCH AND origin's (theNewerTrunk, in ../../config/inspection-base.mjs):
    // a sandbox's local main that nobody pulled made round 26's seal hold 23 paths for its 2.
    const chosen = theNewerTrunk(named, trunk.branch, {
      commitOf,
      contains: (newer, older) => theCommitIsUnder(directory, older, newer),
    })
    if (chosen.branch === null) throw new PanelError(`The submitted Git work cannot be sealed: ${chosen.says}`, 409)
    // A BASE THAT DID NOT RESOLVE IS NAMED WITH THE BRANCH AND COMMIT READ IN ITS PLACE, which is the chosen branch.
    const says = unresolved === null ? chosen.says : aBaseThatDidNotResolve('seal', directory, unresolved, chosen.branch,
      chosen.branch === named.branch ? resolved : baseCommit(directory, chosen.branch))
    const answer = { branch: chosen.branch, says }
    chosenFor.set(named.branch, answer)
    return answer
  }
}

export function captureGit(directory: string, base: string | null, area: string[], fixedBase = false): GitSubmission {
  if (!isAbsolute(directory)) throw new PanelError('The submitted working directory must be an absolute path.', 409)
  const repository = realpathSync(resolve(directory, line(directory, 'rev-parse', '--git-common-dir')))
  const commit = line(directory, 'rev-parse', '--verify', 'HEAD^{commit}')
  // AN EARLIER SEAL RECORDED A COMMIT, and nothing here reads it off a branch again.
  const chosen = fixedBase ? null : theBaseASealReadsOff(directory, base)(commit)
  const forkBase = chosen === null ? (base as string) : line(directory, 'merge-base', commit, chosen.branch)
  line(directory, 'merge-base', '--is-ancestor', forkBase, commit)
  const files = theFilesOfACommit(directory, forkBase, commit)
  const outside = sealing(() => whatIsOutsideTheCommit(directory, commit, (args, options) => gitRead(directory, args, options), new Set(files.map((one) => one.path))))
  // A RUN'S OWN LOG IS NOT SUBMITTED WORK. This is the one exemption besides git's own ignore rules,
  // and it is exactly `.logs/` at the root of the working directory.
  const untracked = outside.untracked.filter((path) => !path.startsWith('.logs/'))
  if (outside.dirty.length || untracked.length) throw new PanelError(
    `The tip cannot be sealed while files are outside its commit: ${[...new Set([...outside.dirty, ...untracked])].join(', ')}. Commit them, or have git ignore them by adding them to .gitignore or .git/info/exclude.`, 409)
  if (outside.notCompared.length) throw new PanelError(
    `The tip cannot be sealed while files could not be compared with its commit: ${outside.notCompared.join(', ')}. ` +
      'Git converts them on checkout, by an attribute that names a filter, eol=crlf, ident or a working-tree-encoding, and their bytes are not the committed ones. ' +
      'The office does not run that conversion, so it cannot tell whether they hold work that is not in the commit. Seal again once each holds the bytes its commit holds.', 409)
  return { repository, directory, forkBase, commit, files,
    ...(chosen === null ? {} : { forkBaseSays: theForkBaseSays(chosen.branch, chosen.says) }) }
}

/**
 * THE GIT PART OF A SEAL, FIRST OR AGAIN.
 *
 * A first seal reads its fork base off the branch. A run sealed again (its first seal was refused, and it went on) keeps
 * its first seal's fork base, so the second seal is read against the same commit as the first: the check compares the
 * two by patch-id (`whatALaterSealHolds`), and a branch that merely moved on is not read against a new base.
 *
 * BUT A RUN REBASED ONTO A NEWER TRUNK BETWEEN THE TWO SEALS took the trunk's newer work into its branch, and the old
 * fork base then holds that work as if it were the run's (decision hgWHD-oVVVRk, part a). So the fork base is
 * read again, and where the first fork base is an ancestor of the new one, the new one is the base. Where it is not,
 * or the new one is the tip itself (the tip is already in the trunk, so its changes against it would read as none),
 * the first fork base is kept, as before.
 */
export function theGitOfASeal(directory: string, prior: GitSubmission | null, named: string | null, area: string[], capture: typeof captureGit = captureGit): GitSubmission {
  if (prior === null) return capture(directory, named, area)
  const again = capture(directory, named, area)
  if (aRebasedRunReadsTheNewBase(directory, prior.forkBase, again.forkBase, again.commit)) return again
  return { ...capture(directory, prior.forkBase, area, true),
    forkBaseSays: `An earlier seal of this run read the fork base ${prior.forkBase}. The run was not rebased onto a newer base, so this seal keeps it.` }
}

/**
 * WHETHER A RUN SEALED AGAIN READS ITS NEW FORK BASE: the new one is not the first, nor the tip itself, and the first is
 * under it. Otherwise the run keeps its first seal's fork base. `theGitOfASeal` and the reading of a run's own commits
 * (./a-runs-own-commits.ts) both ask it, so the two read one fork base.
 */
export function aRebasedRunReadsTheNewBase(directory: string, prior: string, again: string, tip: string): boolean {
  return again !== prior && again !== tip && theCommitIsUnder(directory, prior, again)
}

/**
 * EVERY PATH A COMMIT CHANGED SINCE A FORK BASE, WITH THE HASH AND MODE OF ITS CONTENT AT THAT COMMIT, read from
 * git's own objects. With `onDisk` (a seal), each file on disk must also hold those bytes; without it (a seal read
 * again from its commit), git's objects alone are read. A deleted path has a null hash and mode. `directory` is anything
 * git reads in: a worktree or a repository's checkout. `captureGit` seals with it, and `verifyRunSeal` reads a seal
 * again with it from the commit when the seal's worktree or repository is gone, and for a check's verdict, so the two
 * cannot disagree. The hand-over of a merge entry's resolution records the files of its commit with it too
 * (`handOverAResolution`).
 */
export function theFilesOfACommit(directory: string, forkBase: string, commit: string, onDisk = true): GitSubmission['files'] {
  const changed = nulNames(git(directory, 'diff', '--no-renames', '--name-only', '-z', forkBase, commit, '--')).sort()
  if (new Set(changed).size !== changed.length) malformedGit('a repeated changed path.')
  const deleted = new Set(nulNames(git(directory, 'diff', '--no-renames', '--diff-filter=D', '--name-only', '-z', forkBase, commit, '--')))
  if ([...deleted].some(path => !changed.includes(path))) malformedGit('the deletion list names an unchanged path.')
  const entries = treeBlobs(directory, commit, changed, deleted)
  const hashes = blobHashes(directory, [...entries.values()], onDisk)
  return changed.map((path) => {
    const entry = entries.get(path)
    if (!entry) return { path, hash: null, mode: null }
    const hash = hashes.get(path)
    if (hash === undefined) malformedGit('no complete object body was read for ' + path + '.')
    return { path, hash, mode: entry.mode }
  })
}

/** One commit of an earlier seal, and the commit of the later seal that holds it. */
export interface HeldCommit { commit: string; as: string }

/**
 * EACH FILE A COMMIT CHANGED, WITH THE COMMIT'S OWN ADDED AND REMOVED LINES IN IT: its diff against its first parent
 * with no context lines (-U0), without the hunk headers, so the same lines at other line numbers read the same. The
 * fourth proof compares a worker's commit with the commit a released statement says it became this way.
 */
export function theOwnLinesOf(repository: string, commit: string): Map<string, string[]> {
  let out: string
  try {
    out = readGit(repository, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', `${commit}^`, commit]).toString('utf8')
  } catch (error) {
    throw new PanelError(`Git could not read commit ${commit} in ${repository}: ${String(error)}. Nothing was written.`, 409)
  }
  const files = new Map<string, string[]>()
  let current: string[] | null = null
  for (const row of out.split('\n')) {
    if (row.startsWith('diff --git ')) {
      const path = row.slice(row.indexOf(' b/') + 3)
      current = []
      files.set(path, current)
    } else if (current !== null && !row.startsWith('+++') && !row.startsWith('---') && (row.startsWith('+') || row.startsWith('-'))) {
      current.push(row)
    }
  }
  return files
}

/** The newest revision of a record, sealed the way a records submission seals it, or null because it has none. */
export function theNewestRevisionOf(recordId: string): RecordRevisionSeal | null {
  const row = sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(recordId) as Record<string, unknown> | undefined
  return row === undefined ? null : revision(row)
}

/** One commit of an earlier seal that the later seal was not found to hold, with its subject line. */
export interface CommitNotHeld { commit: string; subject: string }

/** A git read in one repository, as the comparison of two seals makes it. A failure is the 409 that names the repository. */
export type ARead = (args: string[], input?: string) => string

/** Patches with git's default context lines, or with none (`-U0`), the third proof's kind. */
export type PatchKind = 'default' | 'none'

function aReaderOf(repository: string): { read: ARead; unreadable: (error: unknown) => never } {
  const unreadable = (error: unknown): never => { throw new PanelError(`Git could not read the repository ${repository}: ${String(error)}. Nothing was written.`, 409) }
  const read = (args: string[], input?: string): string => {
    try { return readGit(repository, args, input === undefined ? {} : { input }).toString('utf8') }
    catch (error) { return unreadable(error) }
  }
  return { read, unreadable }
}

/**
 * HOW A PATCH LOG REACHES `git patch-id --stable` WITHOUT BEING HELD WHOLE: it is given the `git log` arguments
 * `thePatchIdsOf` built and the range they read, and answers what patch-id printed.
 */
export type APatchLogReader = (log: string[], range: string) => string

/**
 * THE PATCH-ID OF EACH COMMIT IN A RANGE. The same flags are used on both ranges, so the same change gives the same id
 * on both sides. `context` adds -U0 for the third proof.
 *
 * Left out, `throughAFile` makes it two reads through `read`: the log is read whole and then handed to patch-id, so a
 * log larger than one git read may hold fails. Given, the log goes to patch-id the way it says, and `read` is not used.
 */
export function thePatchIdsOf(read: ARead, range: string, context: PatchKind = 'default', throughAFile?: APatchLogReader): Map<string, string> {
  const log = ['log', '-p', ...(context === 'none' ? ['-U0'] : []), '--no-color', '--no-ext-diff', '--no-renames', '--format=commit %H', range]
  const byCommit = new Map<string, string>()
  let thePatchIds: string
  if (throughAFile === undefined) {
    const patches = read(log)
    if (patches.trim() === '') return byCommit
    thePatchIds = read(['patch-id', '--stable'], patches)
  } else {
    thePatchIds = throughAFile(log, range)
  }
  for (const row of thePatchIds.split('\n').filter(Boolean)) {
    const [patch, commit] = row.split(' ')
    if (patch !== undefined && commit !== undefined) byCommit.set(commit, patch)
  }
  return byCommit
}

/** A landing on main, as `retainedLandings` reads it. */
export type ALanding = ReturnType<typeof retainedLandings>[number]

/**
 * THE PATCHES OF ONE LANDING'S RETAINED REPLAY: each commit from where the replay left main to the replay itself. A
 * squash retains the actual replay that produced it. Original archives alone never prove content: a checked resolution
 * may have changed their patches. These are still the same patch proofs, read from retained objects.
 */
export function theReplayPatchesOf(read: ARead, landing: Pick<ALanding, 'parent' | 'replayed'>, context: PatchKind): Map<string, string> {
  const before = read(['merge-base', landing.parent, landing.replayed]).trim()
  return thePatchIdsOf(read, `${before}..${landing.replayed}`, context)
}

/**
 * THE LATER SEAL'S SIDE OF THE COMPARISON: the landings main keeps below its commit, and each patch of its own range and
 * of those landings' replays with the first commit that has it. It does not depend on the earlier seal, so one caller
 * that compares many earlier seals with one later seal reads it once (wave 13u round 146: a submission read every
 * landing again for each entry waiting). Each part is read the first time it is asked for, and what it gave, or the
 * failure it met, is given again to every later ask.
 */
export interface TheLaterSide {
  readonly repository: string
  readonly later: Pick<GitSubmission, 'forkBase' | 'commit'>
  /** The landings below the later commit. Throws the 409 that names the repository when they cannot be read. */
  landings(): ALanding[]
  /** Each patch of the later range, then of each landing's replay, with the first commit that has it. */
  byPatch(context: PatchKind): Map<string, string>
}

/**
 * THE LATER SIDE OF `whatALaterSealHolds`, read in `repository`. `how` changes how the landings and a replay's patches
 * are read, never what they are: the merge queue keeps each landing's patches between submissions
 * (./merge-queue-same-work.ts).
 */
export function theLaterSideOf(
  repository: string,
  later: Pick<GitSubmission, 'forkBase' | 'commit'>,
  how: { landings?: (read: ARead, at: string) => ALanding[]; replayPatches?: (read: ARead, landing: ALanding, context: PatchKind) => Map<string, string> } = {},
): TheLaterSide {
  const { read, unreadable } = aReaderOf(repository)
  const readTheLandings = how.landings ?? retainedLandings
  const replayPatches = how.replayPatches ?? theReplayPatchesOf
  let landings: { read: ALanding[] } | { failed: unknown } | null = null
  const byPatch = new Map<PatchKind, { read: Map<string, string> } | { failed: unknown }>()
  const side: TheLaterSide = {
    repository,
    later,
    landings: () => {
      if (landings === null) {
        try { landings = { read: readTheLandings(read, later.commit) } }
        catch (error) {
          try { unreadable(error) } catch (said) { landings = { failed: said } }
        }
      }
      if ('failed' in landings!) throw landings.failed
      return landings!.read
    },
    byPatch: (context) => {
      let known = byPatch.get(context)
      if (known === undefined) {
        try {
          const laterByPatch = new Map<string, string>()
          for (const [commit, patch] of thePatchIdsOf(read, `${later.forkBase}..${later.commit}`, context)) if (!laterByPatch.has(patch)) laterByPatch.set(patch, commit)
          for (const landing of side.landings()) {
            for (const [commit, patch] of replayPatches(read, landing, context)) if (!laterByPatch.has(patch)) laterByPatch.set(patch, commit)
          }
          known = { read: laterByPatch }
        } catch (error) {
          known = { failed: error }
        }
        byPatch.set(context, known)
      }
      if ('failed' in known) throw known.failed
      return known.read
    },
  }
  return side
}

/**
 * WHETHER A LATER SEAL HOLDS AN EARLIER SEAL'S COMMITS. A decision; the answer
 * F4KyroEu2Pp3, choice (b).
 *
 * A worker's commits reach a wave by cherry-pick, and the wave is rebased before it is sealed, so
 * the worker's sealed commit is usually not in the wave's history. Three proofs are read, in order:
 *
 *   1. `ancestor`: the earlier sealed commit is an ancestor of the later sealed commit.
 *   2. `same patches`: every commit from the earlier seal's fork base to its sealed commit has a
 *      commit with the same patch-id between the later seal's fork base and its sealed commit.
 *   3. `same changed lines`: the same, with the patches made with no lines of context (`-U0`), so a
 *      commit whose own added and removed lines are unchanged is found although the lines around it
 *      moved. Decision MHMyFLGfSGLY, on a worker's measurement (report aUYFiA68BGIz):
 *      13f's commit 73c67688a reached the wave with main's changed import lines beside it. It also
 *      accepts a block of the commit's lines moved elsewhere in the same file, which that measurement
 *      named and 13f never met. Each commit is paired by the second proof where it can be, and by the
 *      third only where it cannot; `how` names the third whenever any commit needed it.
 *
 * A commit whose own lines were changed by hand has a different patch-id under both, so it is not
 * found, and it is named in `missing` with its subject line. Merges and empty commits have no patch of
 * their own, so they are never found by the second or third proof.
 *
 * Git runs in `repository`, the common git folder both seals name, because the earlier run's
 * worktree may be gone. A repository git cannot read is a 409 that names it.
 */
export function whatALaterSealHolds(
  repository: string,
  earlier: Pick<GitSubmission, 'forkBase' | 'commit'>,
  later: Pick<GitSubmission, 'forkBase' | 'commit'>,
  laterSide: TheLaterSide = theLaterSideOf(repository, later),
): { holds: true; how: 'ancestor' | 'same patches' | 'same changed lines'; commits: HeldCommit[] } | { holds: false; missing: CommitNotHeld[]; held: HeldCommit[] } {
  if (laterSide.repository !== repository || laterSide.later.commit !== later.commit || laterSide.later.forkBase !== later.forkBase) {
    throw new Error(`The later side read for ${laterSide.later.commit} in ${laterSide.repository} was given for ${later.commit} in ${repository}.`)
  }
  const { read } = aReaderOf(repository)
  // EACH EARLIER COMMIT, oldest first, with its subject line for a refusal to name.
  const earlierCommits = read(['log', '--reverse', '--format=%H%x09%s', `${earlier.forkBase}..${earlier.commit}`])
    .split('\n')
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf('\t')
      return { commit: row.slice(0, tab), subject: row.slice(tab + 1) }
    })

  // `merge-base --is-ancestor` answers with its exit code: 0 yes, 1 no, anything else a failure.
  let isAncestor: boolean
  try {
    readGit(repository, ['merge-base', '--is-ancestor', earlier.commit, later.commit])
    isAncestor = true
  } catch (error) {
    if ((error as { status?: unknown }).status !== 1) {
      throw new PanelError(`Git could not read the repository ${repository}: ${String(error)}. Nothing was written.`, 409)
    }
    isAncestor = false
  }
  if (isAncestor) return { holds: true, how: 'ancestor', commits: earlierCommits.map((one) => ({ commit: one.commit, as: one.commit })) }

  // The landings main keeps below the later commit are read here, after the ancestry, as they always were.
  laterSide.landings()
  /** Each earlier commit's pair in the later range under one kind of patch, or undefined where there is none. */
  const pairsBy = (context: PatchKind): Map<string, string | undefined> => {
    const earlierPatches = thePatchIdsOf(read, `${earlier.forkBase}..${earlier.commit}`, context)
    const laterByPatch = laterSide.byPatch(context)
    const pairs = new Map<string, string | undefined>()
    for (const one of earlierCommits) {
      const patch = earlierPatches.get(one.commit)
      pairs.set(one.commit, patch === undefined ? undefined : laterByPatch.get(patch))
    }
    return pairs
  }
  const samePatches = pairsBy('default')
  // THE THIRD PROOF IS READ ONLY WHEN THE SECOND LEFT A COMMIT UNPAIRED, and only for those commits.
  const sameChangedLines = [...samePatches.values()].some((as) => as === undefined) ? pairsBy('none') : null

  const commits: HeldCommit[] = []
  const missing: CommitNotHeld[] = []
  let neededTheThird = false
  for (const one of earlierCommits) {
    let as = samePatches.get(one.commit)
    if (as === undefined && sameChangedLines !== null) {
      as = sameChangedLines.get(one.commit)
      if (as !== undefined) neededTheThird = true
    }
    if (as === undefined) missing.push(one)
    else commits.push({ commit: one.commit, as })
  }
  if (missing.length > 0) return { holds: false, missing, held: commits }
  return { holds: true, how: neededTheThird ? 'same changed lines' : 'same patches', commits }
}

/**
 * ONE STAGED FILE'S SHA-256 AND MODE, READ WITHOUT FOLLOWING A LINK. Null when the file is not there.
 *
 * THE FILE IS OPENED WITH O_NOFOLLOW AND LOOKED AT WITH fstat AFTER IT IS OPEN, not before. Looking
 * first and opening second leaves a moment in which a file can be swapped for a link to anywhere on
 * the machine, and what was then hashed would not be what was looked at. Opened this way, a link is
 * refused by the kernel itself, and the checks are made on the very file that is read.
 *
 * It is read in pieces of at most 8 MiB, so a large recording is never held whole in memory.
 */
export function hashAStagedFile(full: string, path: string): Pick<SealedFile, 'hash' | 'mode'> | null {
  let fd: number
  try {
    fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'ELOOP') throw new PanelError(theLinkRefusal(path), 409)
    throw new PanelError(`Cannot read staged file ${path}: ${String(error)}`, 409)
  }
  try {
    const found = fstatSync(fd)
    if (!found.isFile()) throw new PanelError(`The staged folder holds something at ${path} that is neither a file nor a folder.`, 409)
    const content = createHash('sha256')
    const piece = Buffer.allocUnsafe(Math.max(1, Math.min(LARGE_READ_BYTES, found.size)))
    for (let read = readSync(fd, piece, 0, piece.length, null); read > 0; read = readSync(fd, piece, 0, piece.length, null)) {
      content.update(piece.subarray(0, read))
    }
    // THE MODE GIT WOULD GIVE IT: executable when any execute bit is set, a plain file otherwise.
    return { hash: content.digest('hex'), mode: (found.mode & 0o111) !== 0 ? '100755' : '100644' }
  } finally {
    closeSync(fd)
  }
}

const theLinkRefusal = (path: string): string =>
  `The staged folder holds a symbolic link at ${path}. A files seal follows no link, because a link can point ` +
  'anywhere on the machine and the seal would then hold bytes from outside the folder. Copy the file itself into the folder.'

/** The repairs of an original that office code recomputes from the bytes: tools/checks/files-changeset.mjs. */
const ORIGIN_TRANSFORMS: readonly string[] = ['trailing-nul-trim']

/** One original's sha256, read in pieces through a descriptor that follows no link, or a sentence why not. */
function hashAnOriginal(real: string, named: string, path: string): string {
  let fd: number
  try {
    fd = openSync(real, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    throw new PanelError(`The original named for ${path}, ${named}, cannot be read: ${String(error)}.`, 409)
  }
  try {
    const found = fstatSync(fd)
    if (!found.isFile()) throw new PanelError(`The original named for ${path}, ${named}, is not a file.`, 409)
    const content = createHash('sha256')
    const piece = Buffer.allocUnsafe(Math.max(1, Math.min(LARGE_READ_BYTES, found.size)))
    for (let read = readSync(fd, piece, 0, piece.length, null); read > 0; read = readSync(fd, piece, 0, piece.length, null)) content.update(piece.subarray(0, read))
    return content.digest('hex')
  } finally {
    closeSync(fd)
  }
}

/**
 * THE ORIGINALS A FILES RUN NAMED, READ AT FINISH. A decision, A2: "the
 * origin is sealed,
 * not guessed". `sources` maps a staged path to its original, an absolute path, or
 * `{ path, transform }` for the one repair office code can recompute. Each is resolved to its real
 * path, read without following a link, and hashed, so a later change to it is seen by name.
 *
 * WHETHER THE RUN COULD HAVE WRITTEN IT (a review's rule): an original counts as one only if it lies
 * where the run could not have written. That is judged from the one thing the office itself recorded
 * when the run started, its sandbox's folder, and never from a file the run could edit. No folder
 * recorded: null, and the checker hands such a file on rather than deciding it.
 *
 * A named original that is missing, or is not a file, refuses the finish by name. The seal does not
 * ask that the original equal the staged bytes: a converted copy is still worth saying where it came
 * from, and the checker then hands it on.
 */
function theOrigins(sources: unknown, files: readonly SealedFile[], sandboxFolder: string | null): Map<string, SealedOrigin> {
  const found = new Map<string, SealedOrigin>()
  if (sources === undefined || sources === null) return found
  const shape = 'submission.sources maps a staged path to its original: an absolute path, or {"path": <absolute path>, "transform": "trailing-nul-trim"}'
  if (typeof sources !== 'object' || Array.isArray(sources)) throw new PanelError(`${shape}; it gave ${JSON.stringify(sources)}.`, 409)
  const sealed = new Set(files.map((one) => one.path))
  let folder: string | null = null
  if (sandboxFolder !== null) {
    try {
      folder = realpathSync(sandboxFolder)
    } catch {
      folder = null
    }
  }
  for (const [path, named] of Object.entries(sources as Record<string, unknown>)) {
    if (!sealed.has(path)) throw new PanelError(`submission.sources names ${path}, which is not a file in the staged folder.`, 409)
    const said = typeof named === 'string' ? { path: named } : typeof named === 'object' && named !== null && !Array.isArray(named) ? (named as Record<string, unknown>) : null
    const unknown = said === null ? [] : Object.keys(said).filter((key) => key !== 'path' && key !== 'transform')
    if (said === null || typeof said['path'] !== 'string' || !isAbsolute(said['path']) || unknown.length > 0) {
      throw new PanelError(`${shape}; for ${path} it gave ${JSON.stringify(named)}.`, 409)
    }
    const transform = said['transform']
    if (transform !== undefined && (typeof transform !== 'string' || !ORIGIN_TRANSFORMS.includes(transform))) {
      throw new PanelError(`submission.sources names the repair ${JSON.stringify(transform)} for ${path}; the one office code can recompute is ${ORIGIN_TRANSFORMS.join(', ')}.`, 409)
    }
    let real: string
    try {
      real = realpathSync(said['path'])
    } catch {
      throw new PanelError(`The original named for ${path}, ${said['path']}, is not on this machine.`, 409)
    }
    found.set(path, {
      path: real,
      sha256: hashAnOriginal(real, said['path'], path),
      ...(transform === undefined ? {} : { transform: transform as 'trailing-nul-trim' }),
      couldWrite: folder === null ? null : real === folder || real.startsWith(folder + sep),
    })
  }
  return found
}

export { theSandboxFolderOf } from './the-sandbox-folder-of.ts'

export { aRunNamesASandbox } from './a-refusal-for-an-unvouched-sandbox.ts'

export { aRefusalForAnUnvouchedSandbox } from './a-refusal-for-an-unvouched-sandbox.ts'

export { theFolderTheSandboxFieldNames } from '../db/the-folder-the-sandbox-field-names.ts'

/**
 * A RUN WHOSE WORK IS A FOLDER OF FILES THAT WERE NEVER IN ANY REPOSITORY. A decision,
 * option A (proposal yTg28XxSOqdE), with the proposal's recommendation of one more read path. The
 * sandbox v1 handback left this open as P12.
 *
 * UNTIL THEN a seal was git work or records, so a recovery of carved bytes had to invent a git
 * history to be sealed at all: it committed its files into a staging repository whose paths were not
 * the lane's, and its finish refused because the files were "outside its commit" (acceptance finding
 * 43). This reads the folder itself and NEVER CALLS GIT: every regular file's path relative to
 * `stagedAt`, its sha256 and its mode, sorted by path. `root` is where the files will land, so the
 * queue can bind an entry to this seal by path and hash together.
 *
 * WHAT IT REFUSES, each by name: a folder given as a relative path, a folder that does not exist, is
 * not a folder or is itself a link; a symbolic link anywhere inside it; anything inside it named
 * `.git`, because a repository is sealed as git work and must not be passed off as a folder; anything
 * that is neither a file nor a folder; and a folder with no files in it.
 *
 * WITH `sources` IT ALSO SEALS WHERE EACH FILE CAME FROM, as theOrigins and A2 of a decision
 * say: each
 * named original's real path, its sha256 then, and whether the run could have written where it lies,
 * judged from the sandbox folder the office recorded and vouched for (theSandboxFolderOf). It refuses,
 * by name, a source for a path that is not a staged file, one not given as an absolute path, a repair
 * office code cannot recompute, and an original that is not a readable file on this machine.
 */
export function captureFiles(stagedAt: unknown, root: unknown, sources: unknown = undefined, sandboxFolder: string | null = null): FilesSubmission {
  if (typeof stagedAt !== 'string' || !isAbsolute(stagedAt)) {
    throw new PanelError(`A files submission names the folder its files are staged in, as an absolute path, in submission.stagedAt; it gave ${JSON.stringify(stagedAt)}.`, 409)
  }
  if (typeof root !== 'string' || !isAbsolute(root)) {
    throw new PanelError(`A files submission names the folder its files will land in, as an absolute path, in submission.root; it gave ${JSON.stringify(root)}.`, 409)
  }
  let top
  try {
    top = lstatSync(stagedAt)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new PanelError(`The staged folder ${stagedAt} does not exist.`, 409)
    throw new PanelError(`Cannot read the staged folder ${stagedAt}: ${String(error)}`, 409)
  }
  if (top.isSymbolicLink()) throw new PanelError(`The staged folder ${stagedAt} is itself a link. A files seal follows no link, so name the real folder.`, 409)
  if (!top.isDirectory()) throw new PanelError(`The staged folder ${stagedAt} is not a folder.`, 409)
  const files: SealedFile[] = []
  const walk = (inside: string): void => {
    for (const name of readdirSync(inside === '' ? stagedAt : join(stagedAt, inside)).sort()) {
      const path = inside === '' ? name : `${inside}/${name}`
      if (name === '.git') {
        throw new PanelError(`The staged folder holds a .git at ${path}. A files seal is for work that was never in a repository; a repository is sealed as git work instead.`, 409)
      }
      const one = lstatSync(join(stagedAt, path))
      if (one.isSymbolicLink()) throw new PanelError(theLinkRefusal(path), 409)
      if (one.isDirectory()) { walk(path); continue }
      if (!one.isFile()) throw new PanelError(`The staged folder holds something at ${path} that is neither a file nor a folder.`, 409)
      const read = hashAStagedFile(join(stagedAt, path), path)
      if (read === null) throw new PanelError(`Staged file ${path} went away while the folder was being sealed.`, 409)
      files.push({ path, ...read })
    }
  }
  walk('')
  if (files.length === 0) throw new PanelError(`The staged folder ${stagedAt} holds no files, so there is nothing to seal.`, 409)
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  // AN ORIGIN IS ADDED ONLY TO A FILE THE RUN NAMED ONE FOR, so a seal that names none hashes as before.
  const origins = theOrigins(sources, files, sandboxFolder)
  return { stagedAt, root, files: files.map((one) => (origins.has(one.path) ? { ...one, origin: origins.get(one.path)! } : one)) }
}

/**
 * ONE REVISION AS THE SEAL NAMES IT: a pointer and a hash, never the row. Criterion C34.
 *
 * THE HASH IS UNCHANGED — sha256 of the whole row as JSON, exactly as it was before 11 September
 * 2026 — so every hash an older seal holds still means the same thing and can still be checked
 * against the row it names. What went is the `snapshot` field beside it, which was the row again.
 */
function revision(row: Record<string, unknown>): RecordRevisionSeal {
  return {
    record: String(row['record_id']),
    id: String(row['id']),
    seq: Number(row['seq']),
    hash: theHashOfARow(row),
  }
}

export { THE_COLUMNS_A_LINK_IS_HASHED_BY }

/** A link's row in the columns the seal hashes, or undefined because the office no longer holds it. The seal and the check both read it here. */
export function aLinkRowAsTheSealHashesIt(id: string): Record<string, unknown> | undefined {
  return sqlite.prepare(`SELECT ${THE_COLUMNS_A_LINK_IS_HASHED_BY} FROM links WHERE id = ?`).get(id) as Record<string, unknown> | undefined
}

/** The hash a seal pins a link's row by: sha256 of the row as JSON, as a revision's is. */
export const theHashOfALinkRow = theHashOfARow

/** Where the revisions ledger stands now. Revisions are only ever inserted, so this only grows. */
function theRevisionsLedgerNow(): number {
  return (sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM revisions').get() as { n: number }).n
}

const NO_BASELINE_SAYS =
  'This run has no recoverable ledger position, so nothing can say what these records held before it ran. ' +
  'Every "before" is absent for that reason, which is nobody being able to look rather than nothing having ' +
  'been there. Its finish is sealed all the same: the seal blocks nobody.'

/**
 * WHAT THIS RUN SUBMITTED, AS POINTERS AND HASHES. Criterion C34.
 *
 * Four things are named and none is copied: each submitted record with the revision it was at
 * before this run and the revision it is at now, every record those depend on at its current
 * revision, and every link with one of those records at either end, by its id and the hash of its
 * row. The check reads a revision from the `revisions` table, and a link from the `links` table,
 * when it needs the content.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS USED TO HOLD, AND WHAT IT COST
 * ---------------------------------------------------------------------------------------
 *
 * Until 11 September 2026 it carried, inside the seal record: the whole revision row for every
 * submitted record before and after, the whole row for every dependency, every link row of the
 * workspace before and after, and every ledger event of the run with its payload parsed. Measured on
 * the live database that day: `submission_events` held 17,432 rows and 27,710,429 bytes of payload,
 * of which 4,829 whole revision copies were 20,441,040 bytes and the largest single copy was
 * 1,663,972 bytes. Problem `JRY5OEjnrAPu` is what it cost downstream: an inspector's check died on a
 * prompt of 2,964,703 bytes against a one-million-token limit, and wrote no verdict.
 *
 * LINKS ARE PINNED AS POINTERS, AND LEDGER OPERATIONS ARE STILL NOT HERE. A link is named as a
 * revision is: by its id and the sha256 of its row, read in the columns of
 * THE_COLUMNS_A_LINK_IS_HASHED_BY, with whether it was inferred. No link row is copied. Without them
 * a check of a records seal had no link evidence, and refused a run whose report's about links it
 * could not see. What a seal still does not prove: which links stood before the run, what a link
 * said if it changed after the seal, and the per-event hashes of the change and link rows the run
 * wrote.
 */
function captureRecords(runId: string, workspace: string, ids: string[], kind: 'records' | 'mixed'): RecordSubmission {
  const start = sqlite.prepare('SELECT watermark FROM submission_baselines WHERE run_id = ?').get(runId) as
    | { watermark: number | null }
    | undefined
  if (!start) throw new PanelError('This run has no baseline ledger position. Its historical work cannot be sealed as a new record submission.', 409)
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || !ids.length || new Set(ids).size !== ids.length) {
    throw new PanelError(
      `A ${kind} submission needs data.submission.records, a list of distinct record ids with at least one in it: ` +
        `PATCH /api/records/${runId} ${theFinishingWrite(aSubmissionOfRecords(kind))}.`,
      409,
    )
  }
  // NULL IS A ROW MIGRATION 0154 COULD NOT CONVERT, and it is carried rather than guessed at. A
  // number invented here would be indistinguishable from a converted one for whoever reads the seal.
  const baseline = start.watermark
  const through = theRevisionsLedgerNow()
  const beforeOf = sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? AND rowid <= ? ORDER BY seq DESC LIMIT 1')
  const newestOf = sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
  const records = [...ids].sort().map((id) => {
    const record = getRecord(id)
    if (!record || record.workspaceId !== workspace) throw new PanelError(`Submitted record ${id} is not in workspace ${workspace}.`, 409)
    const after = newestOf.get(id) as Record<string, unknown> | undefined
    if (!after) throw new PanelError(`Submitted record ${id} has no revision.`, 409)
    // WHAT IT WAS WHEN THIS RUN STARTED, read off the revisions ledger by position. Null where the
    // record did not exist yet, and null where this run's position could not be recovered at all.
    const old = baseline === null ? undefined : (beforeOf.get(id, baseline) as Record<string, unknown> | undefined)
    return { id, before: old ? revision(old) : null, after: revision(after) }
  })
  const selected = new Set(ids)
  const dependencies: RecordRevisionSeal[] = []
  const pending = [...ids]
  while (pending.length) {
    const id = pending.shift()!
    const record = getRecord(id)!
    const blocks = Array.isArray(record.data['blockIds']) ? record.data['blockIds'] as string[] : []
    // derived_from in its general sense: a record this one was made from is one it depends on.
    const linked = sqlite.prepare("SELECT to_id AS id FROM links WHERE from_id = ? AND type IN ('consumes','derived_from') UNION SELECT from_id AS id FROM links WHERE to_id = ? AND type = 'blocks'").all(id, id) as { id: string }[]
    for (const next of [...blocks, ...linked.map((one) => one.id)]) {
      if (selected.has(next)) continue
      const dependency = getRecord(next)
      if (!dependency || dependency.workspaceId !== workspace || dependency.deletedAt) throw new PanelError('Cannot pin dependency ' + next + ' of ' + id + '.', 409)
      const snapshot = newestOf.get(next) as Record<string, unknown> | undefined
      if (!snapshot) throw new PanelError('Dependency ' + next + ' has no revision.', 409)
      selected.add(next); pending.push(next); dependencies.push(revision(snapshot))
      if (selected.size > 10_000) throw new PanelError('The dependency closure exceeds ten thousand records.', 409)
    }
  }
  dependencies.sort((a, b) => a.record.localeCompare(b.record))
  // EVERY LINK WITH A SEALED RECORD AT EITHER END, each pinned once, as a pointer and the hash of its row.
  const linksOf = sqlite.prepare('SELECT id FROM links WHERE from_id = ? UNION SELECT id FROM links WHERE to_id = ?')
  const linkIds = new Set<string>()
  for (const id of selected) for (const one of linksOf.all(id, id) as { id: string }[]) linkIds.add(one.id)
  const links: LinkSeal[] = [...linkIds].sort().map((id) => {
    const row = aLinkRowAsTheSealHashesIt(id)!
    return { id, hash: theHashOfALinkRow(row), inferred: row['inferred'] === 1 }
  })
  const missing = records.filter((one) => one.before === null).length
  const says =
    baseline === null
      ? NO_BASELINE_SAYS
      : missing === 0
        ? 'Every submitted record names the revision it was at when this run was filed and the revision it is at now.'
        : `${String(missing)} of ${String(records.length)} submitted records name no earlier revision, because they did not exist when this run was filed.`
  return { workspace, baseline, through, records, dependencies, links, says }
}

/**
 * WHETHER A FINISH IS SEALED AT ALL. Compute-only and inspector sessions can end without submitting
 * engineering work.
 *
 * AND A RUN THAT CHANGED ONLY RECORDS IS NOT SEALED AT `none` OR `light`. Criterion C35, the owner's
 * decision: at `full` such a run is sealed as C34 and checked; at `none` and `light`
 * it finishes on the secretary's word. A seal of a records-only run is a manifest of revisions the
 * database already holds, made for a check that is not going to happen, so at those two levels it is
 * work nobody asked for.
 *
 * CODE WORK IS STILL SEALED AT EVERY LEVEL, and that is the difference C35 turns on. The seal stays and
 * blocks nobody. A git or mixed submission names a commit and file
 * hashes, which is the only record anywhere of what was on disk at the moment the run finished;
 * nothing else in the database holds it, so dropping it would lose evidence rather than save work.
 */
export function runSubmitsWork(runId: string, data: Record<string, unknown>): boolean {
  const run = getRecord(runId)
  // A ROW THE OFFICE CLOSED FOR A FACT IT OBSERVED SUBMITS NO WORK. THE_SWEEPS_CLOSE is the close
  // word the sweep writes when a row's process or working directory is gone (src/config/own-rows.mjs):
  // nobody said the work was finished, so there is nothing to seal. Measured on 16 September 2026:
  // once the directory-gone closer reached every project, its close of a run's row was read as a
  // finish, the seal ran against a worktree that no longer existed, and the whole reminder tick
  // failed every minute from 09:40 with "The submitted Git work cannot be sealed".
  if (data['closedHow'] === THE_SWEEPS_CLOSE) return false
  // A ROW THAT DOES NOT SAY ITS RUN FINISHED SUBMITS NO WORK, read on the data the write leaves. Problem zv-Z5SMF_bst.
  // The record door reads only the write for its finish, so a close that alone says `agent-said`, on a row that already
  // says the run crashed, was read as a finish and sealed the folder's HEAD. `aRunSaysItIsFinished` says why it is not one.
  if (!aRunSaysItIsFinished(data)) return false
  if (isLegacyUnsealed(runId)) return false
  if (!run || (data['servingAgent'] === undefined && data['ranAs'] === undefined && data['submission'] === undefined)) return false
  const submission = data['submission']
  const recordsOnly =
    typeof submission === 'object' && submission !== null && !Array.isArray(submission) &&
    (submission as Record<string, unknown>)['kind'] === 'records'
  if (recordsOnly && theReviewLevel(run.workspaceId) !== 'full') return false
  return resolveCheckEligibilityFacts({ ...run, data }, true).noInspector !== false
}

/** Who the office tells of a seal, or why it tells nobody. It is stored on the seal as `starterNotice`. */
export type TheStarterNotice = { to: ParticipantRef } | { because: string }

export { whoIsToldOfASeal } from './who-is-told-of-a-seal.ts'

/**
 * THE ROWS READ, WHEN EACH HAS A PLACE IN THE ORDER WRITTEN (`theOrderWritten` in ./merge-queue.ts, read as `written`),
 * or a 500 naming those that have none. The seal and the round's end put a run's messages and reports in the order they
 * were written. A record with no create row in the change log was written past the records door, and its place is not
 * guessed from its time in words.
 */
export function eachWasWrittenInPlace<T extends { readonly id: string; readonly written: number | null }>(rows: T[]): T[] {
  const unplaced = rows.filter((row) => row.written === null).map((row) => row.id)
  if (unplaced.length === 0) return rows
  const which = unplaced.length === 1 ? `Record ${unplaced.join('')} has` : `Records ${unplaced.join(', ')} have`
  throw new PanelError(
    `${which} no create row in the change log, so the order ${unplaced.length === 1 ? 'it was' : 'they were'} written in is not recorded. ` +
      "The seal and the round's end do not order a run's messages and reports by the time in words instead, because that " +
      'time repeats when the clocks go back.',
    500,
  )
}

/**
 * THE NEWEST MESSAGE THIS RUN WROTE THAT WAS DELIVERED TO ITS STARTER, or null when there is none.
 *
 * The seal's notice is then one line with a link, because the run's own message already told the
 * starter what it did, because one notice per fact is a decision. A message
 * is the run's own when
 * it was written in the run's session; it went to the starter when a delivery row names the starter.
 * Newest is the last written, not the latest time in words: when the clocks go back, a message
 * written at 01:10 winter time follows one written at 01:50 summer time.
 *
 * It starts from the run's own create revisions, by the index of migration 0315, and asks of each
 * message whether a delivery names the starter. Started from the deliveries, it read every one to
 * the starter, thousands for a secretary. INDEXED BY makes a missing index an error, not a slow
 * read, and `v.op = 'create'` is the index's WHERE in its own words.
 */
export function theRunsOwnMessageTo(runId: string, starter: ParticipantRef): string | null {
  const rows = sqlite
    .prepare(
      `SELECT r.id AS id, ${theOrderWritten('r')} AS written FROM revisions v INDEXED BY ${THE_CREATE_REVISIONS_BY_SESSION_INDEX} ` +
        "JOIN records r ON r.id = v.record_id WHERE v.session_id = ? AND v.op = 'create' AND r.kind = 'message' AND r.deleted_at IS NULL " +
        'AND EXISTS (SELECT 1 FROM message_delivery d WHERE d.message_id = r.id AND d.recipient_kind = ? AND d.recipient_id = ?) ' +
        'ORDER BY written DESC NULLS FIRST, r.rowid DESC LIMIT 1',
    )
    .all(runId, starter.kind, starter.id) as { id: string; written: number | null }[]
  return eachWasWrittenInPlace(rows)[0]?.id ?? null
}

/**
 * THE REPORTS LINKED TO A RUN, either way and by any link, oldest first. The refusal of a run with no submission names them,
 * and so does the office's line that a sandbox run ended with its report (./launcher-notices.ts). They are put in the
 * order they were written, which two reports filed in one second also have, and not by their times in words.
 */
export function theReportsLinkedTo(runId: string): string[] {
  const rows = sqlite
    .prepare(
      `SELECT DISTINCT r.id AS id, ${theOrderWritten('r')} AS written FROM links l ` +
        'JOIN records r ON r.id = CASE WHEN l.to_id = ? THEN l.from_id ELSE l.to_id END ' +
        "WHERE (l.to_id = ? OR l.from_id = ?) AND r.kind = 'report' AND r.deleted_at IS NULL ORDER BY written NULLS FIRST, r.id",
    )
    .all(runId, runId, runId) as { id: string; written: number | null }[]
  return eachWasWrittenInPlace(rows).map((row) => row.id)
}

/** THE BODY OF THE PATCH OF A RUN THAT FINISHES IT, with the submission in its place in the run's data. */
function theFinishingWrite(submission: string): string {
  return `{"dataPatch":{"state":"finished","submission":${submission}}}`
}

/** A records or mixed submission as it is written, with the place for the id of a record the run filed. */
function aSubmissionOfRecords(kind: 'records' | 'mixed'): string {
  return JSON.stringify({ kind, records: ['<the id of a record the run filed>'] })
}

/**
 * WHAT A RUN WITH NO SUBMISSION AND NO WORK AREA IS TOLD: that the submission is missing, the reports linked to the run,
 * and the exact write that finishes it with them. A file-only worker's output is in out/ and its report says so, so its
 * report is what it submits; files that are to land in the repository are a files submission.
 */
function whatARunWithNoSubmissionMustDeclare(runId: string): string {
  const reports = theReportsLinkedTo(runId)
  const records = reports.length > 0 ? JSON.stringify({ kind: 'records', records: reports }) : aSubmissionOfRecords('records')
  return (
    'The run cannot finish: it declares no submission (data.submission), and its agent is registered with no work area, ' +
    'so there is no git work to seal. Nothing was written. Say what the run submits in the same write: ' +
    `${theFinishingWrite(records)}. ` +
    (reports.length > 0
      ? `The report${reports.length === 1 ? '' : 's'} linked to this run: ${reports.join(', ')}. `
      : 'No report is linked to this run yet: file one about the run, link it to the run, and name it there. ') +
    'Files that are to land in the repository are a files submission instead: {"kind":"files","stagedAt":"<absolute ' +
    'folder>","root":"<absolute folder>"}.'
  )
}

/**
 * WHAT A RUN WITH NO WORK AREA IS TOLD: the area is missing, the exact write that gives its agent a work area for this
 * run, and the records submission that finishes a run which made no commits, with the reports linked to the run. The
 * work-area write is for the owner, the run's starter or a holder of the secretary card, and its `forRun` names the run
 * whose seal empties the area again.
 */
function whatARunWithNoWorkAreaCanDo(runId: string, agent: string): string {
  const reports = theReportsLinkedTo(runId)
  const records = reports.length > 0 ? JSON.stringify({ kind: 'records', records: reports }) : aSubmissionOfRecords('records')
  return (
    'The run cannot finish: no registered work area can be sealed. Nothing was written. ' +
    "The owner, the run's starter or a holder of the secretary card can give the agent a work area for this run with " +
    `POST /api/participants/agent/${agent}/work-area and the body {"workArea":["<repository-relative path>"],` +
    `"because":"<why>","forRun":"${runId}"}. ` +
    'A run that made no commits finishes with a records submission instead: ' +
    `PATCH /api/records/${runId} ${theFinishingWrite(records)}. ` +
    (reports.length > 0
      ? `The report${reports.length === 1 ? '' : 's'} linked to this run: ${reports.join(', ')}.`
      : 'No report is linked to this run yet: file one about the run, link it to the run, and name it there.')
  )
}

/**
 * WHY A RUN ON ANOTHER COMPUTER IS NOT SEALED HERE, in the words the finishing write is refused with. It names the
 * computer, why its code cannot be read here, and the two ways on.
 */
export function whyARunElsewhereIsNotSealedHere(runId: string, data: Record<string, unknown>): string {
  return (
    `Run ${runId} works on another computer, ${String(data['machine'])}, so this office cannot seal its code: ` +
    "its worktree and its files are on that computer, and this one can read neither. Its code comes in as a branch that " +
    'a run on this computer takes in, and that run is sealed and checked. To finish this run, send a records ' +
    `submission, which is read from the office itself: PATCH /api/records/${runId} ${theFinishingWrite(aSubmissionOfRecords('records'))}. ` +
    'Nothing was written.'
  )
}

/**
 * A RECORDS SEAL REFUSES A RUN WHOSE WORKING DIRECTORY HOLDS COMMITS PAST ITS CUT. A records seal holds no git, so the
 * check and the merge queue would never see those commits. The refusal names each commit and the write that seals them
 * with the records. Nothing is written.
 *
 * WHERE THE OFFICE CANNOT READ THE WORKING DIRECTORY, the run is sealed as it was before this check, and the finishing
 * write's answer says that the commits were not checked, and why. That sentence is stored nowhere: not on the seal, whose
 * content is hashed, and not on the run.
 *
 * INSIDE A FINISHING WRITE THE COMMITS ARE READ ON THE SEAL-READ THREAD (./a-finish-reads-git-apart.ts). Outside one
 * they are not read. No write outside a finishing write's pass seals a records run, and such a write has no answer to say
 * it in.
 */
function refuseARecordsSealOverCommitsPastTheCut(runId: string, data: Record<string, unknown>, cut: string | null, records: unknown): void {
  const notChecked = (why: string): void => sayTheCommitsWereNotChecked(`The office did not check this run's working directory for commits past its cut, because ${why}.`)
  const directory = typeof data['workingDirectory'] === 'string' ? data['workingDirectory'] : ''
  if (theRowNamesAnotherMachine({ data })) return notChecked(`the run works on another computer, ${String(data['machine'])}, and its working directory is on that one`)
  if (directory === '') return notChecked('the run names no working directory')
  if (cut === null) return notChecked('the run names no cut: it has no cutFrom')
  const read = theCommitsPastTheCutAtTheWrite({ directory, cut })
  if (read === null) return
  if ('couldNotRead' in read) return notChecked(read.couldNotRead)
  const n = read.commits.length
  if (n === 0) return
  const submission = Array.isArray(records) && records.length > 0 ? JSON.stringify({ kind: 'mixed', records }) : aSubmissionOfRecords('mixed')
  throw new PanelError(
    `Run ${runId} declared a records submission, but its working directory ${directory} holds ${n === 1 ? 'a commit' : `${String(n)} commits`} ` +
      `past its cut ${cut}, so a records seal would leave ${n === 1 ? 'it' : 'them'} out. ` +
      `${n === 1 ? 'The commit' : 'The commits'}: ${read.commits.map((one) => `${one.hash} "${one.subject}"`).join(', ')}. ` +
      `Nothing was written. To seal ${n === 1 ? 'it' : 'them'} with the records, declare the submission mixed: ` +
      `PATCH /api/records/${runId} ${theFinishingWrite(submission)}`,
    409,
  )
}

/**
 * THE COMMITS A WORKING DIRECTORY HOLDS PAST A RUN'S CUT, each by its short hash and the first line of its message, or why
 * git could not say. The same range the launcher counts before it sends a records finish (`hasCommitsBeyondTheCut` in
 * tools/sandbox-start.mjs). Read on the seal-read thread.
 */
export function theCommitsPastTheCut(directory: string, cut: string): TheCommitsPastTheCut {
  if (!isAbsolute(directory)) return { couldNotRead: `${directory} is not an absolute path` }
  if (!existsSync(directory)) return { couldNotRead: `${directory} does not exist on this computer` }
  if (cut.startsWith('-')) return { couldNotRead: `the cut ${cut} begins with a dash, which git would read as an option` }
  try {
    readGit(directory, ['rev-parse', '--verify', 'HEAD'])
  } catch (error) {
    return { couldNotRead: `git could not read a commit at HEAD in ${directory} (${whyGitDidNotAnswer(error)})` }
  }
  let base: string
  try {
    base = readGit(directory, ['rev-parse', '--verify', `${cut}^{commit}`]).toString('utf8').trim()
  } catch (error) {
    return { couldNotRead: `git could not find the cut ${cut} in ${directory} (${whyGitDidNotAnswer(error)})` }
  }
  const log = readGit(directory, ['log', '-z', '--format=%h%n%B', `${base}..HEAD`]).toString('utf8')
  const commits = log.split('\0').filter((one) => one !== '').map((one) => {
    const [hash = '', subject = ''] = one.split('\n')
    return { hash, subject }
  })
  return { commits }
}

/** The commits a refusal names: each by its full hash and the first line of its message. */
function theCommitsSaid(commits: { commit: string; subject: string }[]): string {
  return commits.map((one) => `${one.commit} "${one.subject}"`).join(', ')
}

/**
 * A GIT OR MIXED SEAL REFUSES COMMITS THE RUN DID NOT MAKE: commits between the fork base and HEAD that were not there
 * when the run was filed, that no run it continues made, and whose change is on main or in no seal that judged it. The
 * refusal names each commit and the write that finishes the run. Nothing is written.
 */
function aSealOverCommitsNotTheRunsOwn(runId: string, read: Extract<TheRunsOwnCommits, { own: unknown }>, submitted: { kind?: string; records?: string[] } | undefined): PanelError {
  const n = read.foreign.length
  const records = Array.isArray(submitted?.records) && submitted.records.length > 0 ? submitted.records : null
  const next = read.own.length === 0
    ? 'This run made no commits of its own since it was filed. To finish it with the records it wrote, send: ' +
      `PATCH /api/records/${runId} ${theFinishingWrite(records === null ? aSubmissionOfRecords('records') : JSON.stringify({ kind: 'records', records }))}`
    : `Take ${n === 1 ? 'it' : 'them'} off the run's branch, then send the finishing write again: ` +
      `PATCH /api/records/${runId} ${theFinishingWrite(JSON.stringify({ kind: submitted?.kind ?? 'git', ...(records === null ? {} : { records }) }))}`
  return new PanelError(
    `The seal of run ${runId} would hold ${n === 1 ? 'a commit' : `${String(n)} commits`} the run did not make: ${theCommitsSaid(read.foreign)}. ` +
      `${n === 1 ? 'It is' : 'They are'} between the fork base ${read.forkBase} and HEAD ${read.head}, ${n === 1 ? 'was' : 'were'} not there ` +
      `when the run was filed, and no run it continues made ${n === 1 ? 'it' : 'them'}. Nothing was written. ${next}`,
    409, undefined, undefined, undefined, { code: 'sealHoldsCommitsNotTheRunsOwn', values: {} },
  )
}

/**
 * A RECORDS SEAL REFUSES A RUN THAT MADE COMMITS OF ITS OWN that no seal holds yet: a records seal holds no git, so the
 * check and the merge queue would never see them. The refusal names each and the mixed write. Nothing is written.
 */
function aRecordsSealThatLeavesOutTheRunsOwnCommits(runId: string, judged: { commit: string; subject: string }[], records: unknown): PanelError {
  const n = judged.length
  const submission = Array.isArray(records) && records.length > 0 ? JSON.stringify({ kind: 'mixed', records }) : aSubmissionOfRecords('mixed')
  return new PanelError(
    `Run ${runId} declared a records submission, but it made ${n === 1 ? 'a commit' : `${String(n)} commits`} of its own since it was filed ` +
      `that no seal holds, so a records seal would leave ${n === 1 ? 'it' : 'them'} out: ${theCommitsSaid(judged)}. Nothing was written. ` +
      `To seal ${n === 1 ? 'it' : 'them'} with the records, declare the submission mixed: PATCH /api/records/${runId} ${theFinishingWrite(submission)}`,
    409, undefined, undefined, undefined, { code: 'sealLeavesOutTheRunsOwnCommits', values: {} },
  )
}

/**
 * A GIT OR MIXED SEAL REFUSES A WORKING DIRECTORY GIT CANNOT READ. Nothing is written. A working directory git reads in
 * another repository than the run was filed in is sealed as a run with no filing commit is (choice 6).
 */
function aWorkingDirectoryUnread(runId: string, why: string): PanelError {
  return new PanelError(
    `Run ${runId} cannot be sealed, because ${why}. Nothing was written. Seal it from the working directory it was filed in, ` +
      `or finish it with the records it wrote: PATCH /api/records/${runId} ${theFinishingWrite(aSubmissionOfRecords('records'))}`,
    409, undefined, undefined, undefined, { code: 'sealWorkingDirectoryUnread', values: {} },
  )
}

/**
 * WHY A SUBMISSION OF A KIND THERE IS NOT IS REFUSED, in the words the seal is refused with. It is here once, and
 * tests/a-finish-reads-its-git-apart.test.ts reads it from here.
 */
export function whyASubmissionKindIsRefused(kind: unknown): string {
  return `data.submission.kind must be "git", "records", "mixed" or "files", or left out for git; it is ${JSON.stringify(kind)}. Nothing was sealed.`
}

/**
 * Called inside the run write transaction. The returned fields belong on the finished run.
 *
 * AND THE RUN'S STARTER IS SENT ONE MESSAGE saying what the seal holds, in the same write, or the seal says
 * why nobody was told. See `whoIsToldOfASeal`.
 */
export function sealFinishedRun(runId: string, data: Record<string, unknown>, actor: Actor, submittedTip: unknown): { sealedTip: string; tip?: string; endHead?: AHeadRead } {
  const run = getRecord(runId)
  if (!run) throw new PanelError(`No run ${runId}.`, 404)
  const submitted = data['submission'] as { kind?: string; records?: string[]; stagedAt?: unknown; root?: unknown; sources?: unknown; standard?: unknown } | undefined
  const kind = submitted?.kind ?? 'git'
  if (!['git', 'records', 'mixed', 'files'].includes(kind)) {
    throw new PanelError(whyASubmissionKindIsRefused(kind), 409)
  }
  // A STANDARD CHANGE IS DECLARED HERE, on a git seal only (src/shared/standard-change.ts). The declaration is kept as
  // the line wrote it; the release door checks it against the files changed. A word that is not a kind is refused
  // rather than kept, because a seal holds only what it can defend.
  const standard = submitted?.standard
  if (standard !== undefined) {
    if (kind !== 'git') throw new PanelError(`submission.standard declares a standard change, and only a git seal may declare one; this one is ${kind}. Nothing was sealed.`, 409)
    if (!isAStandardKind(standard)) throw new PanelError(`submission.standard is ${JSON.stringify(standard)}, which is not one of the standard kinds ${STANDARD_KINDS.join(', ')}. Nothing was sealed.`, 409)
  }
  // A RUN ON ANOTHER COMPUTER SEALS NO CODE HERE. Its worktree and its files are on the computer its row names, and this
  // office can read neither, so a git, mixed or files seal would be a reading of this computer's disk passed off as that
  // one's. Its code comes in as a branch that a run on this computer takes in, and that run is sealed and checked. What it
  // wrote into the office is in the office's own database, so a records seal is taken as for any run.
  if (kind !== 'records' && theRowNamesAnotherMachine({ data })) throw new PanelError(whyARunElsewhereIsNotSealedHere(runId, data), 409)
  // THE SEAL READS THE RUN'S AGENT BY ITS ROW, WHATEVER THAT ROW'S RETIRED FLAG SAYS. Retirement is
  // a fact about being given work, not about identity: a run finished after its agent was retired
  // still names a registered agent with its work area, so its seal is taken like any other. A run no
  // row answers for is refused with the words that say which case it is: no name at all, more than
  // one binding, or a name nothing answers to.
  const reading = theSealsReadingOfARunsAgent({ ...run, data })
  if ('refusal' in reading) throw new PanelError(reading.refusal, 409)
  const agent = reading.agent
  // A records submission is bounded by the record revisions captured below. A later code
  // assignment to this durable agent must not become this run's claimed code work.
  const area = kind === 'records' ? [] : (theAreaTheOfficeNames ?? agent.workArea)
  // A RUN THAT DECLARED NO SUBMISSION IS READ AS A GIT ONE, and git needs a work area. When there is none, what is
  // missing is the submission, not the area, so the refusal names it and the write that finishes the run (problems
  // o8rBHt9RtUUJ and JF9q5cqiOPCS). A run that declared git and has no area is still told the area is missing.
  if (submitted?.kind === undefined && (!area || !area.length)) throw new PanelError(whatARunWithNoSubmissionMustDeclare(runId), 409)
  if (!area || (kind !== 'records' && !area.length)) throw new PanelError(whatARunWithNoWorkAreaCanDo(runId, agent.id), 409)
  const prior = readRunSeal(runId)?.seal.git
  // A RUN THAT NAMED NO cutFrom AND HAS NO EARLIER SEAL NAMES NO BASE HERE; the seal reads the
  // repository's trunk. `null` is that absence, and it is not the string `main`.
  const named = theBaseARunNames(data)
  // A FILES RUN NEVER REACHES GIT, which is what lets a recovery of never-versioned bytes finish:
  // captureGit refuses any file outside a commit, and outside any commit is exactly where they are.
  // INSIDE A FINISHING WRITE THE GIT WAS READ ON THE SEAL-READ THREAD, with the same function and arguments
  // (./a-finish-reads-git-apart.ts); anywhere else it is read here, as it always was.
  const git: ASealGitAsk | null = kind === 'records' || kind === 'files' ? null : { directory: String(data['workingDirectory'] ?? ''), prior: prior ?? null, named, area }
  // A RUN WHOSE FILING COMMIT THE OFFICE READ IS SEALED WITH ITS OWN COMMITS ALONE (./a-runs-own-commits.ts). Any other
  // run, a run whose working directory is now in another repository, and a records run whose working directory git
  // cannot read, is read as before. The seal's git is asked with the own commits, so a finishing write reads both in one
  // read apart.
  const counted = kind === 'files' || theRowNamesAnotherMachine({ data }) ? null : theOwnCommitsAskOf(runId, data, named)
  const ownRead = counted === null ? null : theRunsOwnCommitsAtTheWrite(counted, git) ?? theRunsOwnCommitsRead(counted)
  const owned = ownRead !== null && 'own' in ownRead ? ownRead : null
  if (kind === 'records') {
    // A CUT GIT CANNOT FIND IS READ AS BEFORE: the commits past it are not checked, and the answer says why.
    if (owned === null || !owned.cutFound) refuseARecordsSealOverCommitsPastTheCut(runId, data, named, submitted?.records)
    else if (theOwnCommitsJudged(owned).length > 0) throw aRecordsSealThatLeavesOutTheRunsOwnCommits(runId, theOwnCommitsJudged(owned), submitted?.records)
  } else if (ownRead !== null && 'unread' in ownRead) throw aWorkingDirectoryUnread(runId, ownRead.unread)
  else if (owned !== null && owned.foreign.length > 0) throw aSealOverCommitsNotTheRunsOwn(runId, owned, submitted)
  const code = git === null ? null : theGitOfASealAtTheWrite(git) ?? theGitOfASeal(git.directory, git.prior, git.named, git.area)
  // THE OWN COMMITS WERE READ OFF THE FORK BASE AND HEAD THE SEAL READ, by the same functions. Where they were not, the
  // assumption is broken and nothing is sealed.
  if (code !== null && ownRead !== null && 'noBase' in ownRead) throw new Error(`The seal of run ${runId} read a fork base where reading the run's own commits could not: ${ownRead.noBase}`)
  if (code !== null && owned !== null && (code.forkBase !== owned.forkBase || code.commit !== owned.head)) {
    throw new Error(`The working directory of run ${runId} changed while its own commits were read: they were read at fork base ${owned.forkBase} and HEAD ${owned.head}, and the seal read ${code.forkBase} and ${code.commit}. Nothing was written. Send the finishing write again.`)
  }
  const filesPart = kind === 'files' ? captureFiles(submitted?.stagedAt, submitted?.root, submitted?.sources, theSandboxFolderOf(data)) : null
  if (code && submittedTip !== undefined && submittedTip !== code.commit) throw new PanelError(`The submitted tip ${String(submittedTip)} differs from HEAD ${code.commit}.`, 409)
  const recordPart = kind === 'git' || kind === 'files' ? null : captureRecords(runId, run.workspaceId, submitted?.records ?? [], kind === 'mixed' ? 'mixed' : 'records')
  const execution = typeof data['executionId'] === 'string' && data['executionId'].trim() ? data['executionId'] : runId
  const attempt = typeof data['attemptId'] === 'string' && data['attemptId'].trim() ? data['attemptId'] : randomUUID()
  // `files` IS ADDED ONLY TO A FILES SEAL, and `standard` only to a seal that declares one, so every other seal's
  // content — and therefore its hash — is exactly what it was before either existed.
  // `carriedCommits` IS ADDED ONLY TO A SEAL OF A RUN WHOSE OWN COMMITS WERE READ AND THAT CARRIES A COMMIT, so every other
  // seal's content is exactly what it was before it existed.
  const content = { version: 1 as const, run: runId, execution, attempt, area: [...area], sealedAt: nowStamp(), kind: kind as SealedTip['kind'], git: code, records: recordPart, ...(filesPart === null ? {} : { files: filesPart }), ...(standard === undefined ? {} : { standard }), ...(owned === null || owned.carried.length === 0 ? {} : { [CARRIED_COMMITS]: owned.carried }) }
  const seal: SealedTip = { ...content, hash: sealHash(JSON.stringify(content)) }
  // The owner's decision of 12 November 2026 leaves only the worker's supervisor out of this notice.
  const recipient = whoIsToldOfASealOnceAPackageMoves(runId, agent, whoIsToldOfTheRun(agent))
  const because = 'to' in recipient ? whyAWorkersSupervisorIsNotTold(run, recipient.to) : null
  const told: TheStarterNotice = because === null ? recipient : { because }
  let id: string
  writingSeal = true
  try {
    id = createRecord({ kind: 'sealed_tip', title: 'Submitted work for ' + runId, data: { seal, starterNotice: told }, workspaceId: run.workspaceId, actor }).id
    createLink({ fromId: id, toId: runId, type: 'about', actor })
  } finally { writingSeal = false }
  // THE STARTER IS TOLD IN THE SAME WRITE AS THE SEAL, so a finish that is refused or rolled back after
  // this point takes the message back with the seal. Problem VJom2joVhqjM, part 1.
  if ('to' in told) {
    const line = SYSTEM_LINES.aRunWasSealed({
      run: runId,
      agent: agent.handle,
      seal: id,
      kind: seal.kind,
      git: code === null ? null : { commit: code.commit, forkBase: code.forkBase, files: code.files.map((file) => file.path) },
      files: filesPart === null ? null : { root: filesPart.root, files: filesPart.files.map((file) => file.path) },
      records: recordPart === null ? null : recordPart.records.map((one) => one.id),
      toASecretary: holdsTheSecretaryCard(told.to),
      theRunsOwnMessage: theRunsOwnMessageTo(runId, told.to),
    })
    // WRITTEN AS THE OFFICE, because every word of it is a fact the office read itself: the run, the seal, the commit and
    // the files. Written under the finishing agent's name, the key door judged it as the agent's words, and a run id
    // that began with -p failed the whole finish (problem __4iR4FkFAGS).
    const message = writeASystemLineToOne(told.to, run.workspaceId, line, THE_OFFICE, { run: runId })
    createLink({ fromId: message.id, toId: id, type: 'about', actor: THE_OFFICE })
  }
  // AND AN AREA SET FOR THIS RUN GOES WITH IT: one a launcher run by hand set for this run, or one a door set from the
  // declaration of the ask that started it. The seal has stored that area above, and when nobody has changed it since,
  // the agent's area is emptied in this same write.
  theSealEmptiesTheAreaSetForItsRun(agent, runId, run.workspaceId, THE_OFFICE)
  // A seal names its run in immutable content; the ordinary about link is navigation only.
  // The submitted worker area is no longer held by a resource lease: the lease design is
  // withdrawn. What keeps the area available through check,
  // refusal and rebuttal is the area the seal stored, which the check reads once the agent's own area
  // has been emptied above, and the live-process check in tools/live-processes.mjs, which refuses a
  // removal while a process is still in the tree.
  // THE RUN'S END COMMIT, READ AT ITS OWN FINISH, on a run that has none.
  const endHead = counted === null || ownRead === null || data[END_HEAD] !== undefined ? null : theEndHeadAtTheSeal(runId, counted.directory, ownRead)
  return { sealedTip: id, ...(code ? { tip: code.commit } : {}), ...(endHead === null ? {} : { endHead }) }
}

export function readRunSeal(runId: string): { id: string; seal: SealedTip } | null {
  return readTheSealNamed(runId, getRecord(runId)?.data['sealedTip'])
}

/**
 * THE SEAL `id` NAMES, READ AS A SEAL OF RUN `runId`, or null when it names none. `readRunSeal` reads the seal the stored
 * run names. A run's own commits are read against the seal the data they are asked of names (./a-runs-own-commits.ts),
 * and what a seal found is asked of the run as it was before that seal, so the seal is not counted as its own earlier one.
 */
export function readTheSealNamed(runId: string, id: unknown): { id: string; seal: SealedTip } | null {
  if (id === undefined) return null
  if (typeof id !== 'string') throw new PanelError(`Run ${runId} names an unreadable seal.`, 409)
  const run = getRecord(runId)
  const record = getRecord(id)
  const seal = record?.data['seal'] as SealedTip | undefined
  if (record?.kind !== 'sealed_tip' || !seal || seal.run !== runId || record.deletedAt || record.workspaceId !== run?.workspaceId) throw new PanelError(`Seal ${id} does not identify this run.`, 409)
  const { hash, ...content } = seal
  if (sealHash(JSON.stringify(content)) !== hash) throw new PanelError(`Seal ${id} has changed.`, 409)
  return { id, seal }
}
/** A seal read again, and, when it was read from its commit rather than its worktree, the sentence that says so. */
export type AVerifiedSeal = { id: string; seal: SealedTip; readFrom?: string }

/**
 * READ A RUN'S SEAL AGAIN, AND THROW WHERE IT NO LONGER HOLDS. A git seal is read from its worktree: HEAD must still be
 * the sealed commit, every sealed file's bytes must hash as sealed, and the worktree's repository and changed files must
 * be the seal's.
 *
 * `fromTheCommit` (the confirm passes it; problem ubRkOIcdBWnS): when the seal's worktree no longer exists, or the
 * repository the seal names no longer exists, the seal is read instead from the sealed commit in the project's one
 * registered repository, the one the landed-by-hand door reads; a check-again run's seal is read in the repository its
 * merge entry names instead (problem JCSXirDhnzaE), whatever the number of repositories. It holds only when that repository has the sealed
 * commit and its fork base, and the files the commit changed since the fork base, with their hashes and modes read from
 * git's objects the way the seal was made, are exactly the seal's. `readFrom` then says which way was used and why.
 * A worktree that exists is always read first, as before. Where that read refuses (the tip moved, a sealed file differs,
 * files are outside the commit, or the repository or files differ), the folder is still a worktree of the sealed
 * repository, and a branch there still contains the sealed commit, the seal is read from that commit instead
 * (`theSealReadAfterItsWorktreeMovedOn`; wave 13u round 72), and `readFrom` says so. Otherwise the folder's refusal is
 * thrown with its words: a worktree in a different repository, and a commit amended away that no branch keeps, are
 * still refused. The inspector's two readings do not pass it: a check reads a real worktree.
 *
 * `underALaterCommit` (the inspector's two readings pass it; problem Qrcr9t4iT2Id; the confirm passes it too since
 * wave 13s round 21): a worker that commits again after
 * its seal moves HEAD on, and the sealed commit is still there under the later ones. When the worktree's HEAD contains
 * the sealed commit, the seal is read from that commit, in the worktree's own repository, from git's objects, and
 * `readFrom` says so. A HEAD that does not contain the sealed commit is still "the tip moved" (problem ubRkOIcdBWnS),
 * and a sealed file git's objects no longer hold at its sealed hash is still refused.
 *
 * `fromItsRepository` (a check's read just before its verdict passes it, and so does the verdict door): a check takes
 * minutes, and meanwhile the next round may work in the same folder, on another branch or with a sealed file changed.
 * The verdict is about the sealed commit, so the seal is read from that commit, from git's objects, in the repository
 * the seal names, and the run's worktree is not read at all. It holds only when that repository has the sealed commit
 * and its fork base, and the files the commit changed since the fork base are exactly the seal's. `readFrom` says so.
 * A seal made again during the check is not caught here: the verdict door compares this seal with the one the check read.
 */
export function verifyRunSeal(runId: string, options: { fromTheCommit?: boolean; underALaterCommit?: boolean; fromItsRepository?: boolean } = {}): AVerifiedSeal | null {
  const held = readRunSeal(runId)
  if (!held) return null
  const { seal } = held
  if (seal.git && options.fromItsRepository === true) return { ...held, readFrom: theSealReadFromItsRepository(held.id, seal.git) }
  if (seal.git && options.fromTheCommit === true) {
    const worktreeGone = !existsSync(seal.git.directory)
    const repositoryGone = !existsSync(seal.git.repository)
    if (worktreeGone || repositoryGone) {
      const why = worktreeGone
        ? `the run's worktree ${seal.git.directory} no longer exists`
        : `the repository the seal names, ${seal.git.repository}, no longer exists`
      return { ...held, readFrom: theSealReadFromItsCommit(runId, held.id, seal.git, why) }
    }
  }
  if (seal.git) {
    const sealed = seal.git
    const refused = (refusal: PanelError): AVerifiedSeal => {
      const readFrom = options.fromTheCommit === true ? theSealReadAfterItsWorktreeMovedOn(held.id, sealed, refusal.message) : null
      if (readFrom === null) throw refusal
      return { ...held, readFrom }
    }
    const actual = line(seal.git.directory, 'rev-parse', '--verify', 'HEAD^{commit}')
    if (actual !== seal.git.commit) {
      if (options.underALaterCommit === true && theCommitIsUnder(seal.git.directory, seal.git.commit, actual)) {
        return { ...held, readFrom: theSealReadUnderALaterCommit(held.id, seal.git, actual) }
      }
      return refused(new PanelError(`The tip moved after seal ${held.id}: sealed ${seal.git.commit}, found ${actual}.`, 409))
    }
    for (const file of seal.git.files) if (fileHash(seal.git.directory, file.path) !== file.hash) return refused(new PanelError(`Sealed file ${file.path} differs from seal ${held.id}.`, 409))
    let found: GitSubmission
    try {
      found = captureGit(seal.git.directory, seal.git.forkBase, seal.area, true)
    } catch (error) {
      if (error instanceof PanelError) return refused(error)
      throw error
    }
    if (found.repository !== seal.git.repository || JSON.stringify(found.files) !== JSON.stringify(seal.git.files)) return refused(new PanelError(`The repository or files differ from seal ${held.id}.`, 409))
  }
  if (seal.files) {
    // EVERY SEALED FILE IS HASHED AGAIN FROM THE STAGED FOLDER, never taken from the number the seal
    // holds. A file ADDED to the folder after the seal is not looked at: it is not sealed, and the
    // queue binds an entry to sealed paths at sealed hashes, so it can never land as this run's work.
    for (const file of seal.files.files) {
      const found = hashAStagedFile(join(seal.files.stagedAt, file.path), file.path)
      if (found === null) throw new PanelError(`Sealed file ${file.path} is no longer in ${seal.files.stagedAt}, so seal ${held.id} cannot be read again.`, 409)
      if (found.hash !== file.hash) throw new PanelError(`Sealed file ${file.path} differs from seal ${held.id}.`, 409)
      if (found.mode !== file.mode) throw new PanelError(`Sealed file ${file.path} changed its mode after seal ${held.id}: sealed ${String(file.mode)}, found ${String(found.mode)}.`, 409)
    }
  }
  // The check is given judged snapshots below. Current rows never replace them.
  return held
}

/**
 * WHETHER `head` CONTAINS `commit`. `merge-base --is-ancestor` answers with its exit code: 0 yes, 1 no, anything else a
 * failure, which is thrown. A sealed commit git no longer holds is not contained by anything.
 */
function theCommitIsUnder(directory: string, commit: string, head: string): boolean {
  try { readGit(directory, ['cat-file', '-e', `${commit}^{commit}`]) } catch { return false }
  try {
    readGit(directory, ['merge-base', '--is-ancestor', commit, head])
    return true
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return false
    throw new PanelError(`Git could not tell whether ${head} in ${directory} contains ${commit}: ${String(error)}`, 409)
  }
}

/**
 * THE SEAL READ FROM ITS COMMIT UNDER A LATER ONE, in the worktree's own repository, from git's objects as
 * `theSealReadFromItsCommit` reads it. Throws a 409 naming what does not hold; answers the sentence that says so.
 */
function theSealReadUnderALaterCommit(sealId: string, sealed: GitSubmission, head: string): string {
  const why = `the worktree's HEAD moved on to ${head}, which still contains the sealed commit ${sealed.commit}`
  const repository = realpathSync(resolve(sealed.directory, line(sealed.directory, 'rev-parse', '--git-common-dir')))
  if (repository !== sealed.repository) {
    throw new PanelError(`Seal ${sealId} cannot be read: ${why}, but the worktree's repository is ${repository}, not the sealed ${sealed.repository}.`, 409)
  }
  const files = theFilesOfACommit(sealed.directory, sealed.forkBase, sealed.commit, false)
  if (JSON.stringify(files) !== JSON.stringify(sealed.files)) {
    const differ = sealed.files.filter((one) => {
      const found = files.find((other) => other.path === one.path)
      return found === undefined || found.hash !== one.hash || found.mode !== one.mode
    }).map((one) => one.path)
    throw new PanelError(
      `Sealed file ${differ.length ? differ.join(', ') : '(the list of changed files)'} differs from seal ${sealId}: ${why}, and git's objects for that ` +
        `commit no longer hold the sealed files at their sealed hashes.`,
      409,
    )
  }
  return `The seal ${sealId} was read from commit ${sealed.commit} in the repository ${repository}, because ${why}; that commit holds every sealed file at its sealed hash, and the later commits were not read.`
}

/**
 * THE SEAL READ FROM ITS COMMIT AFTER ITS WORKTREE MOVED ON, for the confirm (`fromTheCommit`; wave 13u round 72,
 * option B). The next round may start in the run's folder before the confirm, and then the folder's read refuses. The
 * seal is read from its commit instead only when the folder is still a worktree of the sealed repository and a branch
 * there still contains the sealed commit, because the confirm lets the worktree go, and a commit no branch keeps can then
 * be pruned. Answers null where either does not hold, and the caller throws the folder's refusal; throws a 409 naming
 * what does not hold where the commit is not the seal's; otherwise answers the sentence that says so.
 */
function theSealReadAfterItsWorktreeMovedOn(sealId: string, sealed: GitSubmission, refused: string): string | null {
  let branches: string[]
  try {
    const repository = realpathSync(resolve(sealed.directory, line(sealed.directory, 'rev-parse', '--git-common-dir')))
    if (repository !== sealed.repository) return null
    branches = line(repository, 'for-each-ref', `--contains=${sealed.commit}`, '--format=%(refname:short)', 'refs/heads/', LANDED_KEEP_PREFIX).split('\n').filter((one) => one !== '')
  } catch (error) {
    if (error instanceof PanelError) return null
    throw error
  }
  if (branches.length === 0) return null
  theCommitHoldsTheSeal(sealed.repository, sealed, `Seal ${sealId} cannot be read from its sealed commit after its worktree moved on (${refused})`)
  return `The seal ${sealId} was read from commit ${sealed.commit} in the repository ${sealed.repository}, because its worktree ${sealed.directory} ` +
    `moved on (${refused}), and ${branches.length === 1 ? 'the branch' : 'the branches'} ${branches.join(', ')} still ` +
    `${branches.length === 1 ? 'holds' : 'hold'} the sealed commit; that commit holds every sealed file at its sealed hash, and the worktree was not read.`
}

/**
 * THE CHECKOUT OF THE REPOSITORY A CHECK-AGAIN RUN'S MERGE ENTRY NAMES, or null because the run is not the merge queue's
 * check again (problem JCSXirDhnzaE; way 1). Such a run is sealed in the merge sandbox's clone, which is cleared
 * once its entry is final, and its confirm can come after that. The entry names its repository by id, so the sealed
 * commit is read there, and the count of the project's repositories does not matter. An entry that is not git, or a
 * repository row that is gone or has no checkout here, is refused, naming the entry: it is never a reason to read
 * some other repository instead.
 */
function theRepositoryOfACheckAgain(run: PanelRecord, sealId: string, sealed: GitSubmission, why: string): { root: string; entry: string } | null {
  const entryId = theMergeEntryACheckAgainIsFor(run)
  if (entryId === null) return null
  const entry = readMergeEntry(theCheckAgainsEntry(entryId, run.id, run.workspaceId))
  const cannot = `Seal ${sealId} cannot be read from its worktree, because ${why}, and this run is the merge queue's check again for merge entry ${entry.id}`
  if (entry.changeset.adapter !== 'git') throw new PanelError(`${cannot}, which is not a git entry, so it names no repository to read the sealed commit ${sealed.commit} in.`, 409)
  const named = repositoryById(entry.changeset.repository, run.workspaceId)
  if (named === null || named.root === null) {
    throw new PanelError(
      `${cannot}, whose repository ${entry.changeset.repository} ${named === null ? 'is not registered in this project' : 'has no checkout on this machine'}, ` +
        `so the office cannot read the sealed commit ${sealed.commit}.`,
      409,
    )
  }
  return { root: named.root, entry: entry.id }
}

/**
 * THE REPOSITORY A SEAL IS READ IN WITHOUT ITS WORKTREE: the project's one registered repository with a checkout, or,
 * for the merge queue's check again, the one its merge entry names. Throws a 409 naming why there is none. The seal is
 * read from its commit there, and the named-inside door asks there whether a branch keeps the sealed commit, so the
 * two never choose apart.
 */
export function theRepositoryASealIsReadIn(run: PanelRecord | null, sealId: string, sealed: GitSubmission, why: string): { root: string; entry: string | null } {
  const named = run === null ? null : theRepositoryOfACheckAgain(run, sealId, sealed, why)
  const roots = named !== null ? [named.root] : run === null ? [] : listRepositories(run.workspaceId).flatMap((one) => (one.root === null ? [] : [one.root]))
  if (roots.length !== 1) {
    throw new PanelError(
      `Seal ${sealId} cannot be read from its worktree, because ${why}, and this project has ${String(roots.length)} registered repositories with a ` +
        `checkout rather than one, so the office cannot tell where to read the sealed commit ${sealed.commit}.`,
      409,
    )
  }
  return { root: roots[0]!, entry: named?.entry ?? null }
}

/**
 * WHICH BRANCHES OR LANDED KEEP REFS KEEP A SEALED COMMIT, in the repository the seal is read in, so that removing the
 * run's worktree loses nothing the seal names. The existing branches field also carries landed keep refs. Answers
 * those refs, or why the commit is not shown to be kept: no
 * repository is chosen, git cannot answer, or no branch contains it.
 */
export function theBranchesThatKeepASealedCommit(runId: string, sealId: string, sealed: GitSubmission):
  { kept: true; repository: string; branches: string[] } | { kept: false; why: string } {
  let repository: string
  try {
    repository = theRepositoryASealIsReadIn(getRecord(runId), sealId, sealed, 'its worktree is to be removed').root
  } catch (error) {
    if (error instanceof PanelError) return { kept: false, why: error.message }
    throw error
  }
  let branches: string[]
  try {
    branches = readGit(repository, ['for-each-ref', `--contains=${sealed.commit}`, '--format=%(refname:short)', 'refs/heads/', LANDED_KEEP_PREFIX])
      .toString('utf8').split('\n').filter((one) => one !== '')
  } catch (error) {
    return { kept: false, why: `git could not say which branches of ${repository} contain the sealed commit ${sealed.commit}: ${String(error)}` }
  }
  if (branches.length === 0) return { kept: false, why: `no branch of ${repository} contains the sealed commit ${sealed.commit}` }
  return { kept: true, repository, branches }
}

/**
 * THE SEAL READ FROM ITS COMMIT, in the repository `theRepositoryASealIsReadIn` chooses. Throws a 409 naming what does
 * not hold; answers the one sentence that says the seal was read this way and why.
 */
function theSealReadFromItsCommit(runId: string, sealId: string, sealed: GitSubmission, why: string): string {
  const { root: repository, entry } = theRepositoryASealIsReadIn(getRecord(runId), sealId, sealed, why)
  theCommitHoldsTheSeal(repository, sealed, `Seal ${sealId} cannot be read from its worktree, because ${why}`)
  const where = entry === null ? `the repository ${repository}` : `the repository ${repository}, which its merge entry ${entry} names`
  return `The seal ${sealId} was read from commit ${sealed.commit} in ${where}, because ${why}; that commit holds every sealed file at its sealed hash.`
}

/**
 * THE SEAL READ FROM ITS COMMIT IN THE REPOSITORY THE SEAL NAMES, for a check's verdict (`fromItsRepository`). Throws a
 * 409 naming what does not hold; answers the sentence that says the seal was read this way and why.
 */
function theSealReadFromItsRepository(sealId: string, sealed: GitSubmission): string {
  theCommitHoldsTheSeal(sealed.repository, sealed, `Seal ${sealId} cannot be read from its sealed commit, which is how a check's verdict reads it`)
  return `The seal ${sealId} was read from commit ${sealed.commit} in the repository ${sealed.repository}, because a check's verdict is about its ` +
    `sealed commit; that commit holds every sealed file at its sealed hash, and the run's worktree was not read.`
}

/**
 * WHETHER `repository` HOLDS A SEAL'S COMMIT AS SEALED: the sealed commit and its fork base are there, and the files the
 * commit changed since the fork base, read from git's objects, are exactly the seal's. Throws a 409 that begins with
 * `cannot` and names what does not hold.
 */
function theCommitHoldsTheSeal(repository: string, sealed: GitSubmission, cannot: string): void {
  for (const [what, commit] of [['sealed commit', sealed.commit], ['fork base', sealed.forkBase]] as const) {
    try {
      gitRead(repository, ['cat-file', '-e', `${commit}^{commit}`])
    } catch {
      throw new PanelError(`${cannot}, and the repository ${repository} does not hold its ${what} ${commit}.`, 409)
    }
  }
  const files = theFilesOfACommit(repository, sealed.forkBase, sealed.commit, false)
  if (JSON.stringify(files) !== JSON.stringify(sealed.files)) {
    throw new PanelError(`${cannot}, and the files commit ${sealed.commit} changed since ${sealed.forkBase} in ${repository} are not the seal's.`, 409)
  }
}

/** Activation inventories old finishes without rewriting their records or evidence. */
export function isLegacyUnsealed(runId: string): boolean {
  return Boolean(sqlite.prepare('SELECT run_id FROM legacy_unsealed_runs WHERE run_id = ?').get(runId))
}
export function legacyUnsealedInventory(workspace: string): { run: string; title: string; status: 'legacy-unsealed' }[] {
  return (sqlite.prepare('SELECT records.id, records.title FROM legacy_unsealed_runs JOIN records ON records.id = run_id WHERE records.workspace_id = ? ORDER BY records.id').all(workspace) as { id: string; title: string }[])
    .map((row) => ({ run: row.id, title: row.title, status: 'legacy-unsealed' }))
}
