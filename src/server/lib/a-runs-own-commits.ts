// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEAL COUNTS ONLY ITS RUN'S OWN COMMITS (wave 13n).
 *
 * THREE LETTERS. A is the seal's fork base, read as the seal reads it: off the branch `captureGit` chooses, or an
 * earlier seal's fork base the run keeps. B is the commit the run's working directory was at when the run was filed
 * (`filingHead`). C is the commit it was at when the run ended (`endHead`).
 *
 * THE RUN'S OWN COMMITS are `git rev-list C ^B ^A`, and those of each run it continues that has no seal, read the same
 * way. A run with no end commit ends at the filing commit of the first run filed after it in its working directory, or,
 * with none, at HEAD as the seal reads it.
 *
 * A COMMIT IS CARRIED when its change, by `git patch-id`, is already between A and the branch the seal reads, or between
 * the fork base and the tip of a seal of the run, of a run it continues, or of a worker any of these asked for. A carried
 * commit is named in the seal (`carriedCommits`) and is not judged again before the seal.
 *
 * A RUN FILED BEFORE THE OFFICE READ ITS FILING COMMIT has none, and its seal counts its commits as before, by their
 * author times. So does a run that continues one.
 *
 * THE OFFICE ALONE WRITES THE THREE FIELDS. The create and change doors refuse them (`refuseTheHeadsInACreate`,
 * `refuseTheHeadsInAChange` and `refuseACarriedCommitsChange`), and the office writes them at the filing, at the end
 * and at the seal.
 */
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { CARRIED_COMMITS, END_HEAD, FILING_HEAD, THE_HEADS_ONLY_THE_OFFICE_WRITES } from '@shared/kinds.ts'
import { nowStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import { A_GIT_READS_LIMITS, readGit, readGitAsync, readThePatchIdsOfALog, whyGitDidNotAnswer } from './resources.ts'
import { aRebasedRunReadsTheNewBase, readRunSeal, readTheSealNamed, theBaseASealReadsOff, thePatchIdsOf, type APatchLogReader, type ARead } from './sealed-tip.ts'
import { readTheFinishApart } from './the-seal-read-apart.ts'
import { thisWriteEndedTheRun } from './how-a-round-ended.ts'

/** A HEAD the office read: the commit, when and in which directory; or that it did not read one, and why. */
export type AHeadRead = { commit: string; at: string; directory: string } | { notRead: string; at: string; directory: string }

/** What git said of a directory's HEAD. */
export type TheHeadRead = { commit: string } | { couldNotRead: string }

/** One question of the seal-read thread: the HEAD of this directory. */
export type AHeadAsk = { directory: string }

/** The commits of one run: from its filing commit to its end commit, or to HEAD when `end` is null. */
export type ARunsBoundary = { filing: string; end: string | null }

/** A seal whose commits are already judged: its id, its repository and its range. */
export type ASealedRange = { id: string; repository: string; forkBase: string; tip: string }

/**
 * WHAT A RUN'S OWN COMMITS ARE READ FROM, as data the seal-read thread can be handed: the working directory, the folder
 * the run's filing commit was read in, the base the run names, whether the run seals records, the fork base of its own
 * earlier seal, the boundaries of it and of each run it continues that has no seal (oldest first), and the seals whose
 * commits are already judged.
 */
export type AnOwnCommitsAsk = { directory: string; filedIn: string | null; named: string | null; records: boolean; prior: string | null; runs: ARunsBoundary[]; seals: ASealedRange[] }

export type ACommitNamed = { commit: string; subject: string }

/** A commit whose change is already in `where`, `main` or the id of a seal, as the commit `matches`. */
export type ACarriedCommit = { commit: string; matches: string; where: string }

/**
 * WHAT `theRunsOwnCommitsRead` READ: the fork base and HEAD, the run's own commits, the carried ones, and the commits
 * between the fork base and HEAD that are neither the run's nor carried. Or that git could not read the directory
 * (`unread`), or could not choose the fork base (`noBase`), each with why.
 *
 * AN `unread` MADE AFTER HEAD WAS READ HOLDS THAT `head`: a read after the fork base failed, and HEAD is still what git
 * read. One made before HEAD was read, or for a repository git cannot read, holds none.
 *
 * `otherRepository` IS A RUN WHOSE WORKING DIRECTORY IS NOW IN ANOTHER REPOSITORY than the one it was filed in, with why
 * and the HEAD read there. Its filing and end commits are not commits of that repository's history, so it is read and
 * sealed as a run with no filing commit is (choice 6).
 *
 * `cutFound` IS FALSE WHERE THE RUN NAMES A CUT BY A NAME GIT CANNOT FIND. The fork base was then read off the trunk, as
 * the seal reads it, and a records seal is sealed as it was before the run's own commits were counted.
 */
export type TheRunsOwnCommits =
  | { forkBase: string; head: string; own: ACommitNamed[]; carried: ACarriedCommit[]; foreign: ACommitNamed[]; cutFound: boolean }
  | { unread: string; head?: string }
  | { otherRepository: string; head: string }
  | { noBase: string; head: string }

// ================================================================================================== the office's own fields

/** The words each field only the office writes is refused with, and its code. */
const ONLY_THE_OFFICE_WRITES = {
  [FILING_HEAD]: {
    says: 'filingHead is the commit the office read in the run\'s working directory when the run was filed, and only the office writes it. Leave it out. Nothing was written.',
    code: 'onlyTheOfficeWritesTheFilingHead',
  },
  [END_HEAD]: {
    says: 'endHead is the commit the office read in the run\'s working directory when the run ended, and only the office writes it. Leave it out. Nothing was written.',
    code: 'onlyTheOfficeWritesTheEndHead',
  },
} as const

/** The refusal of a write that sets, changes or drops `field`. */
function onlyTheOfficeWrites(field: keyof typeof ONLY_THE_OFFICE_WRITES): PanelError {
  const { says, code } = ONLY_THE_OFFICE_WRITES[field]
  return new PanelError(says, 403, undefined, undefined, undefined, { code, values: {} })
}

/** Refuse a create whose data names a field only the office writes. */
export function refuseTheHeadsInACreate(data: Record<string, unknown> | undefined): void {
  if (data === undefined) return
  for (const field of THE_HEADS_ONLY_THE_OFFICE_WRITES) if (Object.hasOwn(data, field)) throw onlyTheOfficeWrites(field)
}

/** Refuse a change that sets, changes or drops a field only the office writes: in a partial change, or in whole data. */
export function refuseTheHeadsInAChange(before: Record<string, unknown>, dataPatch: Record<string, unknown> | undefined, data: Record<string, unknown> | undefined, same: (a: unknown, b: unknown) => boolean): void {
  for (const field of THE_HEADS_ONLY_THE_OFFICE_WRITES) {
    if ((dataPatch !== undefined && Object.hasOwn(dataPatch, field)) || (data !== undefined && !same(data[field], before[field]))) throw onlyTheOfficeWrites(field)
  }
}

/** Refuse a change to a seal's carried commits. The rest of a seal is refused as immutable after this. */
export function refuseACarriedCommitsChange(before: Record<string, unknown>, dataPatch: Record<string, unknown> | undefined, data: Record<string, unknown> | undefined, same: (a: unknown, b: unknown) => boolean): void {
  const seal = (one: unknown): Record<string, unknown> | null => (one !== null && typeof one === 'object' ? one as Record<string, unknown> : null)
  const stored = seal(before['seal'])?.[CARRIED_COMMITS]
  const patched = dataPatch !== undefined && Object.hasOwn(dataPatch, 'seal') && !same(seal(dataPatch['seal'])?.[CARRIED_COMMITS], stored)
  const replaced = data !== undefined && !same(seal(data['seal'])?.[CARRIED_COMMITS], stored)
  if (patched || replaced) {
    throw new PanelError(
      'carriedCommits names the commits of a seal whose change was already on main or in an earlier seal, and only the office writes it, when it seals. Nothing was written.',
      403, undefined, undefined, undefined, { code: 'onlyTheOfficeWritesTheCarriedCommits', values: {} },
    )
  }
}

/** The commit a stored HEAD reading holds, or null when it holds none. */
export function theCommitOf(read: unknown): string | null {
  if (read === null || typeof read !== 'object') return null
  const commit = (read as Record<string, unknown>)['commit']
  return typeof commit === 'string' && commit !== '' ? commit : null
}

/** The directory a stored HEAD reading was read in, or null when it names none. */
function theDirectoryOf(read: unknown): string | null {
  if (read === null || typeof read !== 'object') return null
  const directory = (read as Record<string, unknown>)['directory']
  return typeof directory === 'string' && directory !== '' ? directory : null
}

// ================================================================================================== the HEAD

/** The git command that reads the commit at a directory's HEAD. */
const THE_HEADS_READ = ['rev-parse', '--verify', 'HEAD^{commit}']

/** Why no git is asked for the HEAD of `directory`, or null when it may be. */
function whyNoHeadIsAsked(directory: string): string | null {
  if (!isAbsolute(directory)) return `${directory} is not an absolute path`
  if (!existsSync(directory)) return `${directory} does not exist on this computer`
  return null
}

/** What a HEAD read holds when git did not answer it. */
function aHeadGitDidNotRead(directory: string, error: unknown): TheHeadRead {
  return { couldNotRead: `git could not read a commit at HEAD in ${directory} (${whyGitDidNotAnswer(error)})` }
}

/** The HEAD of `directory`, as git reads it there. Read on the seal-read thread, with the rest of a seal's reading. */
export function theHeadReadIn(directory: string): TheHeadRead {
  const why = whyNoHeadIsAsked(directory)
  if (why !== null) return { couldNotRead: why }
  try {
    return { commit: readGit(directory, THE_HEADS_READ).toString('utf8').trim() }
  } catch (error) {
    return aHeadGitDidNotRead(directory, error)
  }
}

/**
 * THE HEAD OF `directory` ALONE, read as `theHeadReadIn` reads it, by a git process the request's thread does not wait
 * for. A filing and an end each read one HEAD and nothing else, so they do not ask the seal-read thread. That thread
 * starts at the first ask in a process, and its start took longer than a session hook may wait for its request.
 */
async function theHeadReadAlone(directory: string): Promise<TheHeadRead> {
  const why = whyNoHeadIsAsked(directory)
  if (why !== null) return { couldNotRead: why }
  try {
    return { commit: (await readGitAsync(directory, THE_HEADS_READ)).toString('utf8').trim() }
  } catch (error) {
    return aHeadGitDidNotRead(directory, error)
  }
}

/** A HEAD git read, as the run stores it. */
export function asAHeadRead(directory: string, read: TheHeadRead): AHeadRead {
  return 'commit' in read ? { commit: read.commit, at: nowStamp(), directory } : { notRead: read.couldNotRead, at: nowStamp(), directory }
}

/**
 * THE HEAD OF `directory`, READ ON THE SEAL-READ THREAD, so the request's own thread waits for no git. Where the thread
 * cannot read it, that is the answer, with why.
 */
export async function theHeadReadOnTheThread(directory: string): Promise<TheHeadRead> {
  try {
    return theHeadIn(await readTheFinishApart({ facts: [], seals: [], heads: [{ directory }] }), directory)
  } catch (err) {
    return { couldNotRead: `the office could not read it on its git thread: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** The HEAD of `directory` in an answer of the seal-read thread, or why it holds none. */
export function theHeadIn(reading: { heads: { ask: AHeadAsk; read: TheHeadRead | { failed: string } }[] }, directory: string): TheHeadRead {
  const found = reading.heads.find((one) => one.ask.directory === directory)
  if (found === undefined) return { couldNotRead: 'the git thread gave no answer for it' }
  return 'failed' in found.read ? { couldNotRead: found.read.failed } : found.read
}

/** The HEAD of `directory` read by `theHeadReadAlone`, as a run stores it: a run's filing commit. */
export async function theHeadReadApart(directory: string): Promise<AHeadRead> {
  return asAHeadRead(directory, await theHeadReadAlone(directory))
}

/** The filing commit of the first run filed after `runId` in `directory`, or null when none was, or none was read. */
function theNextRunFiledIn(runId: string, directory: string): { id: string; commit: string | null } | null {
  const next = sqlite.prepare(
    "SELECT id, json_extract(data, '$.filingHead.commit') AS commit_ FROM records WHERE kind = 'session' AND deleted_at IS NULL " +
      "AND rowid > (SELECT rowid FROM records WHERE id = ?) AND json_extract(data, '$.filingHead.directory') = ? ORDER BY rowid LIMIT 1",
  ).get(runId, directory) as { id: string; commit_: unknown } | undefined
  if (next === undefined) return null
  return { id: next.id, commit: typeof next.commit_ === 'string' ? next.commit_ : null }
}

/**
 * WHY AN END IS NOT READ: another run was filed in the run's working directory before it, so HEAD there may hold that
 * run's commits. Null when none was.
 */
export function whyAnEndIsNotRead(runId: string, directory: string): string | null {
  const next = theNextRunFiledIn(runId, directory)
  if (next === null) return null
  return `another run, ${next.id}, was filed in ${directory} before this run's end was read, so HEAD there may hold that run's commits`
}

/** The end commit a run stores from git's reading of its directory, or why it is not read (`whyAnEndIsNotRead`). */
export function theEndHeadToStore(runId: string, directory: string, read: TheHeadRead): AHeadRead {
  const why = whyAnEndIsNotRead(runId, directory)
  return why === null ? asAHeadRead(directory, read) : { notRead: why, at: nowStamp(), directory }
}

/**
 * WHETHER A WRITE ENDS A RUN WHOSE END COMMIT THE OFFICE READS: it ends the run as `thisWriteEndedTheRun` reads an end,
 * and the run holds a filing commit and no end commit. A finish is not such a write: its seal reads the end.
 */
export function thisWriteEndsTheRun(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return after['state'] !== 'finished' && theCommitOf(after[FILING_HEAD]) !== null && after[END_HEAD] === undefined && thisWriteEndedTheRun(before, after)
}

/**
 * THE END COMMIT A REQUEST'S WRITE GIVES A RUN, read by `theHeadReadAlone` before the write, so the request waits for
 * it; null when the write would not end the run. The write is read as its fields over the stored ones, which is enough
 * for `state` and `commandEnded`. `patchRecord` asks `thisWriteEndsTheRun` again of the data it stores.
 */
export async function theEndHeadBeforeAWrite(run: { id: string; kind: string; data: Record<string, unknown> }, patch: { data?: Record<string, unknown> | undefined; dataPatch?: Record<string, unknown> | undefined }): Promise<AHeadRead | null> {
  if (run.kind !== 'session') return null
  const directory = run.data['workingDirectory']
  if (typeof directory !== 'string' || !thisWriteEndsTheRun(run.data, { ...run.data, ...patch.data, ...patch.dataPatch })) return null
  const read = await theHeadReadAlone(directory)
  return theEndHeadToStore(run.id, directory, read)
}

/** What the account of a round that ended with no request reads for the run's end commit, or null when it reads none. */
export function theEndToRead(data: Record<string, unknown>): AHeadAsk | null {
  const directory = data['workingDirectory']
  return typeof directory === 'string' && theCommitOf(data[FILING_HEAD]) !== null && data[END_HEAD] === undefined ? { directory } : null
}

// ================================================================================================== the ask

/**
 * The runs `runId` continues by its derived_from links, every one, nearest first, with no run twice. A removed link is
 * deleted outright, so the links table has no deleted_at column. A deleted run is left out by the records' deleted_at.
 */
function theRunsContinuedBy(runId: string): { id: string; data: Record<string, unknown> }[] {
  const found: { id: string; data: Record<string, unknown> }[] = []
  const seen = new Set([runId])
  const read = sqlite.prepare(
    "SELECT r.id AS id, r.data AS data FROM links l JOIN records r ON r.id = l.to_id WHERE l.from_id = ? AND l.type = 'derived_from' " +
      "AND r.kind = 'session' AND r.deleted_at IS NULL ORDER BY l.rowid",
  )
  for (let next = [runId]; next.length > 0;) {
    const after: string[] = []
    for (const id of next) {
      for (const row of read.all(id) as { id: string; data: string }[]) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        found.push({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> })
        after.push(row.id)
      }
    }
    next = after
  }
  return found
}

/** Where a run's commits end: its end commit, or the filing commit of the run filed next in its directory, or HEAD (null). */
function theEndOf(runId: string, data: Record<string, unknown>): string | null {
  const end = theCommitOf(data[END_HEAD])
  if (end !== null) return end
  const directory = typeof data['workingDirectory'] === 'string' ? data['workingDirectory'] : null
  return directory === null ? null : theNextRunFiledIn(runId, directory)?.commit ?? null
}

/** The git range of a run's seal, when it sealed git. */
function theSealedRangeOf(sealed: ReturnType<typeof readRunSeal>): ASealedRange | null {
  const git = sealed?.seal.git
  if (sealed === null || git === null || git === undefined) return null
  return { id: sealed.id, repository: git.repository, forkBase: git.forkBase, tip: git.commit }
}

/** The runs a run asked to start as workers, by the run each one was started as. */
function theWorkerRunsOf(data: Record<string, unknown>): string[] {
  const asked = data['workerRuns']
  if (asked === null || typeof asked !== 'object') return []
  return Object.values(asked as Record<string, unknown>).flatMap((one) => {
    const started = one !== null && typeof one === 'object' ? (one as Record<string, unknown>)['started'] : null
    const run = started !== null && typeof started === 'object' ? (started as Record<string, unknown>)['run'] : null
    return typeof run === 'string' ? [run] : []
  })
}

/**
 * WHAT `runId`'S OWN COMMITS ARE READ FROM, or null for a run read as before: one with no filing commit or no working
 * directory, or one that continues a run with no seal and no filing commit. `data` is the run as the write would store it.
 */
export function theOwnCommitsAskOf(runId: string, data: Record<string, unknown>, named: string | null): AnOwnCommitsAsk | null {
  const filing = theCommitOf(data[FILING_HEAD])
  const directory = typeof data['workingDirectory'] === 'string' ? data['workingDirectory'] : null
  if (filing === null || directory === null) return null
  const continued = theRunsContinuedBy(runId)
  const runs: ARunsBoundary[] = []
  const seals = new Map<string, ASealedRange>()
  const addTheSeal = (sealed: ReturnType<typeof readRunSeal>): void => {
    const range = theSealedRangeOf(sealed)
    if (range !== null) seals.set(range.id, range)
  }
  for (const one of [...continued].reverse()) {
    const sealed = readRunSeal(one.id)
    if (sealed !== null) addTheSeal(sealed)
    else {
      const theirs = theCommitOf(one.data[FILING_HEAD])
      if (theirs === null) return null
      runs.push({ filing: theirs, end: theEndOf(one.id, one.data) })
    }
    for (const worker of theWorkerRunsOf(one.data)) addTheSeal(readRunSeal(worker))
  }
  runs.push({ filing, end: theEndOf(runId, data) })
  // THE RUN'S OWN EARLIER SEAL IS THE ONE `data` NAMES. After a seal, what it found is asked of the run as it was before
  // it, so the new seal is not read as the run's earlier one and the commits it holds are not carried by it.
  const prior = readTheSealNamed(runId, data['sealedTip'])
  addTheSeal(prior)
  for (const worker of theWorkerRunsOf(data)) addTheSeal(readRunSeal(worker))
  const submission = data['submission']
  const records = submission !== null && typeof submission === 'object' && (submission as Record<string, unknown>)['kind'] === 'records'
  return { directory, filedIn: theDirectoryOf(data[FILING_HEAD]), named, records, prior: prior?.seal.git?.forkBase ?? null, runs, seals: [...seals.values()] }
}

// ================================================================================================== the reading

/**
 * THE FORK BASE THE SEAL WOULD READ, and the branch it read it off, or no branch when the run keeps an earlier seal's
 * fork base. The same choice `theGitOfASeal` makes, through the same functions.
 *
 * A RECORDS SEAL READS NO FORK BASE. It reads the commits past the cut the record names (`theCommitsPastTheCut`,
 * ./sealed-tip.ts), as the launcher counts them, so a cut git finds is read itself. A git seal falls back to the trunk
 * where the cut resolves to HEAD; a records seal does not, so a cut moved to HEAD after filing has no commit past it.
 */
function theForkBaseOf(ask: AnOwnCommitsAsk, head: string, read: ARead): { forkBase: string; branch: string | null } {
  const branch = ask.records && ask.named !== null && theCutIsFound(read, ask.named) ? ask.named : theBaseASealReadsOff(ask.directory, ask.named)(head).branch
  const fresh = read(['merge-base', head, branch]).trim()
  if (ask.prior === null || aRebasedRunReadsTheNewBase(ask.directory, ask.prior, fresh, head)) return { forkBase: fresh, branch }
  return { forkBase: ask.prior, branch: null }
}

/**
 * A GIT READ AFTER THE FORK BASE THAT GIT DID NOT ANSWER. `what` names the read in the words of the `unread` sentence,
 * and `failure` is what the read threw, which `whyGitDidNotAnswer` reads. Only those reads throw it, so anything else
 * the reading throws is thrown on as before.
 */
class AGitReadNotAnswered extends Error {
  constructor(readonly what: string, readonly failure: unknown) {
    super(`git could not ${what}`)
  }
}

/** `read`'s answer, or `AGitReadNotAnswered` with `what` when it throws. */
function aReadNamed<T>(what: string, read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new AGitReadNotAnswered(what, error)
  }
}

/** The limit of one git read that `failure` passed, in words, or nothing when it passed none. */
function theLimitItPassed(failure: unknown): string {
  const code = failure !== null && typeof failure === 'object' ? (failure as NodeJS.ErrnoException).code : undefined
  if (code === 'ENOBUFS') return `: it printed more than the ${A_GIT_READS_LIMITS.bytes / (1024 * 1024)} MiB one git read may hold`
  if (code === 'ETIMEDOUT') return `: it ran longer than the ${A_GIT_READS_LIMITS.ms / 1000} s one git read may take`
  return ''
}

/** The commits `revisions` names, oldest first, each with the first line of its message. */
function theCommitsNamed(read: ARead, revisions: string[]): ACommitNamed[] {
  const listed = aReadNamed(`list the commits of ${revisions.join(' ')}`, () => read(['log', '--reverse', '--topo-order', '--format=%H%x00%s', ...revisions, '--']))
  return listed.split('\n').filter((one) => one !== '').map((one) => {
    const [commit = '', subject = ''] = one.split('\0')
    return { commit, subject }
  })
}

/**
 * THE CARRIED COMMITS AMONG `candidates`: each whose patch-id is the patch-id of a commit between A and the branch the
 * seal reads, or of one in a seal's range in the same repository. Main is asked first. Every patch log goes to patch-id
 * through `throughAFile`, because a run's own commits can make one larger than one git read may hold.
 */
function theCarriedAmong(read: ARead, candidates: ACommitNamed[], head: string, base: { forkBase: string; branch: string | null }, seals: ASealedRange[], repository: string, throughAFile: APatchLogReader): ACarriedCommit[] {
  if (candidates.length === 0) return []
  const theirs = thePatchIdsOf(read, `${base.forkBase}..${head}`, 'default', throughAFile)
  for (const one of candidates) if (!theirs.has(one.commit)) for (const [commit, patch] of thePatchIdsOf(read, `${one.commit}^!`, 'default', throughAFile)) theirs.set(commit, patch)
  const places: { where: string; patches: Map<string, string> }[] = []
  if (base.branch !== null) places.push({ where: 'main', patches: thePatchIdsOf(read, `${base.forkBase}..${base.branch}`, 'default', throughAFile) })
  for (const seal of seals) if (seal.repository === repository) places.push({ where: seal.id, patches: thePatchIdsOf(read, `${seal.forkBase}..${seal.tip}`, 'default', throughAFile) })
  return candidates.flatMap((one) => {
    const patch = theirs.get(one.commit)
    if (patch === undefined) return []
    for (const place of places) {
      const matches = [...place.patches].find(([, other]) => other === patch)?.[0]
      if (matches !== undefined) return [{ commit: one.commit, matches, where: place.where }]
    }
    return []
  })
}

/**
 * A RUN'S OWN COMMITS, READ IN ITS WORKING DIRECTORY. Read on the seal-read thread inside a finishing write, and here
 * anywhere else. A refusal of the fork base's choice is `noBase`, so the seal refuses with its own words. A git read
 * after the fork base that git does not answer is `unread`, with the read, the directory and why, so the seal refuses
 * with those words too.
 */
export function theRunsOwnCommitsRead(ask: AnOwnCommitsAsk): TheRunsOwnCommits {
  const head = theHeadReadIn(ask.directory)
  if ('couldNotRead' in head) return { unread: head.couldNotRead }
  const read: ARead = (args, input) => readGit(ask.directory, args, input === undefined ? {} : { input }).toString('utf8')
  let repository: string
  try {
    repository = realpathSync(resolve(ask.directory, read(['rev-parse', '--git-common-dir']).trim()))
  } catch (error) {
    return { unread: `git could not read the repository of ${ask.directory} (${whyGitDidNotAnswer(error)})` }
  }
  // A RUN MOVED TO ANOTHER REPOSITORY IS READ AS ONE WITH NO FILING COMMIT (choice 6). Two repositories can hold the same
  // commit, so a filing commit found here does not by itself say the run was filed here. The folder it was filed in says
  // so while it is still there; a folder that is gone is told by the commits alone.
  const filedIn = ask.filedIn === null || ask.filedIn === ask.directory ? null : theRepositoryOf(ask.filedIn)
  if (filedIn !== null && filedIn !== repository) {
    return { otherRepository: `the run was filed in ${ask.filedIn}, which is in the repository at ${filedIn}, and its working directory ${ask.directory} is in the repository at ${repository}`, head: head.commit }
  }
  for (const commit of new Set(ask.runs.flatMap((one) => (one.end === null ? [one.filing] : [one.filing, one.end])))) {
    try {
      read(['cat-file', '-e', `${commit}^{commit}`])
    } catch {
      return { otherRepository: `the repository at ${repository}, which holds ${ask.directory}, has no commit ${commit}, which the office read when the run was filed or ended, so it is not the repository the run was filed in`, head: head.commit }
    }
  }
  let base: { forkBase: string; branch: string | null }
  try {
    base = theForkBaseOf(ask, head.commit, read)
  } catch (error) {
    return { noBase: error instanceof Error ? error.message : String(error), head: head.commit }
  }
  const throughAFile: APatchLogReader = (log, range) => aReadNamed(`read the patches of ${range}`, () => readThePatchIdsOfALog(ask.directory, log).toString('utf8'))
  try {
    const own = new Map<string, ACommitNamed>()
    for (const run of ask.runs) for (const one of theCommitsNamed(read, [run.end ?? head.commit, `^${run.filing}`, `^${base.forkBase}`])) own.set(one.commit, one)
    const others = theCommitsNamed(read, [head.commit, `^${base.forkBase}`, ...ask.runs.map((one) => `^${one.filing}`)]).filter((one) => !own.has(one.commit))
    const carried = theCarriedAmong(read, [...own.values(), ...others], head.commit, base, ask.seals, repository, throughAFile)
    const isCarried = new Set(carried.map((one) => one.commit))
    return { forkBase: base.forkBase, head: head.commit, own: [...own.values()], carried, foreign: others.filter((one) => !isCarried.has(one.commit)), cutFound: theCutIsFound(read, ask.named) }
  } catch (error) {
    if (!(error instanceof AGitReadNotAnswered)) throw error
    return { unread: `git could not ${error.what} in ${ask.directory} (${whyGitDidNotAnswer(error.failure)}${theLimitItPassed(error.failure)})`, head: head.commit }
  }
}

/** The repository a folder is in, as git reads it there, or null when the folder is gone or git cannot read it. */
function theRepositoryOf(directory: string): string | null {
  if (!isAbsolute(directory) || !existsSync(directory)) return null
  try {
    return realpathSync(resolve(directory, readGit(directory, ['rev-parse', '--git-common-dir']).toString('utf8').trim()))
  } catch {
    return null
  }
}

/**
 * Whether git finds the cut a run names. A full hash is the base as it is written, as `theBaseASealReadsOff` takes it, and
 * a run that names none reads the trunk.
 */
function theCutIsFound(read: ARead, named: string | null): boolean {
  if (named === null || /^[0-9a-f]{40}$/i.test(named)) return true
  try {
    read(['rev-parse', '--verify', '--quiet', `${named}^{commit}`])
    return true
  } catch {
    return false
  }
}

/**
 * THE END COMMIT A SEAL STORES on a run that has none: HEAD as the seal read it, or why it is not read, when another
 * run was filed in the run's working directory first or git could not read it. An `unread` that holds a head stores
 * that head, because git read it.
 */
export function theEndHeadAtTheSeal(runId: string, directory: string, read: TheRunsOwnCommits): AHeadRead {
  if ('unread' in read) return theEndHeadToStore(runId, directory, read.head === undefined ? { couldNotRead: read.unread } : { commit: read.head })
  return theEndHeadToStore(runId, directory, { commit: read.head })
}

/** The run's own commits that are not carried: the ones judged before the seal. */
export function theOwnCommitsJudged(read: Extract<TheRunsOwnCommits, { own: unknown }>): ACommitNamed[] {
  const carried = new Set(read.carried.map((one) => one.commit))
  return read.own.filter((one) => !carried.has(one.commit))
}
