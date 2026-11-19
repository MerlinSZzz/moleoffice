// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANDINGS ON MAIN, AS THE MERGE QUEUE COMPARES THEM, READ ONCE (wave 13u round 146).
 *
 * A submission asks of every entry waiting in its lane whether the new commit holds that entry's commits, and one way
 * it can is through a landing on main (`whatALaterSealHolds`). Each landing's retained replay was read again for each
 * waiting entry, about nine git processes per landing, inside the request: with eight entries waiting and about a
 * hundred landings, one submission held the server for more than two minutes. Measured on a made-up office of the live
 * office's size, the time grew by about twenty seconds with each entry waiting, and almost all of it was these reads.
 *
 * Three things here make it short, and none changes what is compared:
 *
 *   1. One later side per submission (`aLaterSideForTheQueue`): the landings and their patches are read once, however
 *      many entries wait.
 *   2. A landing's patches are kept for the server's life, under the landing's parent and replayed commit and the kind
 *      of patch. A commit never changes, so neither do the patches between two commits; that assumes the repository's
 *      own diff settings do not change while the server runs. The landings themselves are read again for every
 *      submission, so a landing whose kept tip has gone is still met as before.
 *   3. `theLandingsAreReadBelow` reads the patches not yet kept, with git processes the server does not wait for. It
 *      starts at a run's seal and again before a submission is judged, and ONE READ OF A REPOSITORY AT A TIME, however
 *      many asks wait: an ask that comes while a read of the same repository is under way waits for that read to end and
 *      looks again before it starts a read, and only then reads what is still not kept, so no git process is started
 *      twice for the same landing and kind. After a restart none is kept, and that first read still starts every process
 *      the repository needs; it starts at the seal rather than while the submission waits.
 */
import { retainedLandings } from '../../shared/merge/landed-history.mjs'
import { readGitAsync } from './resources.ts'
import { theLaterSideOf, theReplayPatchesOf, type ALanding, type ARead, type PatchKind, type TheLaterSide } from './sealed-tip.ts'
import type { GitSubmission } from '@shared/sealed-tip.ts'

/** Each landing's patches, by repository, the landing's parent and replayed commit, and the kind of patch. */
const REPLAYS = new Map<string, Map<string, string>>()
/** What `rev-list --parents -n 1 <commit>` printed, by repository and commit. A commit's parents never change. */
const PARENTS = new Map<string, string>()

const PATCH_KINDS: readonly PatchKind[] = ['default', 'none']
const replayKey = (repository: string, landing: Pick<ALanding, 'parent' | 'replayed'>, context: PatchKind): string => `${repository}\0${landing.parent}\0${landing.replayed}\0${context}`
const parentsKey = (repository: string, commit: string): string => `${repository}\0${commit}`
/** One line of `cat-file --batch-check` for an object that is a commit. */
const A_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64}) commit \d+$/u

/**
 * THE LANDINGS BELOW `at`, exactly as `retainedLandings` reads them, with fewer processes. That reader starts two git
 * processes per landing beside its one log: the landing's parents, and a check that each kept tip is still a commit.
 * Here the parents are read once in the server's life, all new ones in one process, and every kept tip is checked in one
 * process. When anything is not as it should be, `retainedLandings` itself is read, so a failure says what it always said.
 */
function theLandingsBelow(repository: string, read: ARead, at: string): ALanding[] {
  const readOnce = new Map<string, string>()
  const kept: string[] = []
  const unknownParents: string[] = []
  const quickly: ARead = (args, input) => {
    if (args.length === 3 && args[0] === 'cat-file' && args[1] === '-e') {
      kept.push(args[2]!)
      return ''
    }
    if (args.length === 5 && args[0] === 'rev-list' && args[1] === '--parents' && args[2] === '-n' && args[3] === '1') {
      const known = PARENTS.get(parentsKey(repository, args[4]!))
      if (known !== undefined) return known
      unknownParents.push(args[4]!)
      // Never kept: the landings are read again below once these parents are known.
      return `${args[4]!} ${args[4]!}`
    }
    const key = JSON.stringify([args, input ?? null])
    let said = readOnce.get(key)
    if (said === undefined) {
      said = read(args, input)
      readOnce.set(key, said)
    }
    return said
  }
  try {
    let landings = retainedLandings(quickly, at)
    if (unknownParents.length > 0) {
      const asked = new Set(unknownParents)
      for (const row of read(['rev-list', '--no-walk=unsorted', '--parents', '--stdin'], `${unknownParents.join('\n')}\n`).split('\n')) {
        const commit = row.split(' ')[0]
        if (commit !== undefined && asked.has(commit)) PARENTS.set(parentsKey(repository, commit), `${row}\n`)
      }
      kept.length = 0
      unknownParents.length = 0
      landings = retainedLandings(quickly, at)
    }
    if (unknownParents.length === 0) {
      if (kept.length === 0) return landings
      const rows = read(['cat-file', '--batch-check'], `${kept.join('\n')}\n`).split('\n')
      if (rows.length === kept.length + 1 && rows[kept.length] === '' && rows.slice(0, kept.length).every((row) => A_COMMIT.test(row))) return landings
    }
  } catch {
    // Read below by `retainedLandings` itself, which meets the same failure and says it in its own words.
  }
  return retainedLandings(read, at)
}

/** One landing's patches of one kind, read once in the server's life. */
function theKeptReplayPatchesOf(repository: string, read: ARead, landing: ALanding, context: PatchKind): Map<string, string> {
  const key = replayKey(repository, landing, context)
  let patches = REPLAYS.get(key)
  if (patches === undefined) {
    patches = theReplayPatchesOf(read, landing, context)
    REPLAYS.set(key, patches)
  }
  return patches
}

/** THE LATER SIDE ONE SUBMISSION COMPARES EVERY WAITING ENTRY WITH: one for the whole submission. */
export function aLaterSideForTheQueue(repository: string, later: Pick<GitSubmission, 'forkBase' | 'commit'>): TheLaterSide {
  return theLaterSideOf(repository, later, {
    landings: (read, at) => theLandingsBelow(repository, read, at),
    replayPatches: (read, landing, context) => theKeptReplayPatchesOf(repository, read, landing, context),
  })
}

/** What the reader of `readApart` throws for a read it has not been given yet. */
const NOT_READ_YET = new Error('This git read has not been read yet.')

/**
 * WHAT `work` WORKS OUT FROM GIT, with every git process started by `readGitAsync`, so the server answers other requests
 * while git runs. `work` is the same code a submission runs, and it is handed a reader that answers only reads already
 * read: the first read it lacks is noted, and the reader throws. That read is then started and waited for, and `work`
 * runs again from the start, until it runs without lacking a read. Only that last run's answer is used, because the code
 * may catch what the reader threw and carry on with something else. A read that fails is answered with its failure, as
 * `readGit` would have thrown it. What `work` keeps must be what git said: `theLandingsBelow` keeps only the parents git
 * printed, and the patches are kept below, from the last run.
 */
async function readApart<T>(repository: string, work: (read: ARead) => T): Promise<T> {
  const answers = new Map<string, { said: string } | { failed: unknown }>()
  for (;;) {
    let lacking: { key: string; args: string[]; input: string | undefined } | undefined
    const read: ARead = (args, input) => {
      const key = JSON.stringify([args, input ?? null])
      const answer = answers.get(key)
      if (answer === undefined) {
        lacking ??= { key, args, input }
        throw NOT_READ_YET
      }
      if ('failed' in answer) throw answer.failed
      return answer.said
    }
    let ran: { answer: T } | { failed: unknown }
    try {
      ran = { answer: work(read) }
    } catch (error) {
      ran = { failed: error }
    }
    if (lacking === undefined) {
      if ('failed' in ran) throw ran.failed
      return ran.answer
    }
    const { key, args, input } = lacking
    try {
      answers.set(key, { said: (await readGitAsync(repository, args, input === undefined ? {} : { input })).toString('utf8') })
    } catch (error) {
      answers.set(key, { failed: error })
    }
  }
}

/** The read of each repository that is under way now, by repository. */
const READS_UNDER_WAY = new Map<string, Promise<void>>()

/**
 * READ THE PATCHES OF EVERY LANDING BELOW `at` THAT ARE NOT KEPT YET, one landing and kind at a time, with git processes
 * the server does not wait for (`readApart`). ONE READ OF A REPOSITORY AT A TIME, however many asks wait: an ask that
 * comes while a read of the same repository is under way waits for that read to end, then looks again before it starts a
 * read, so two asks that wake from one read cannot start a second and third at once. It then reads only what is still
 * not kept, so no git process is started twice for the same landing and kind. The seal starts this read, and the door
 * that takes a submission awaits it before it judges the submission, so the submission finds the patches kept. A
 * failure stops the reading and is not said here: the submission reads the same thing again and says it in its own words.
 */
export async function theLandingsAreReadBelow(repository: string, at: string): Promise<void> {
  let underWay: Promise<void> | undefined
  while ((underWay = READS_UNDER_WAY.get(repository)) !== undefined) await underWay
  const read = thePatchesNotKeptBelow(repository, at)
  READS_UNDER_WAY.set(repository, read)
  try {
    await read
  } finally {
    if (READS_UNDER_WAY.get(repository) === read) READS_UNDER_WAY.delete(repository)
  }
}

/** One read of the patches not kept yet, kept under way for its repository by `theLandingsAreReadBelow`. */
async function thePatchesNotKeptBelow(repository: string, at: string): Promise<void> {
  let landings: ALanding[]
  try {
    landings = await readApart(repository, (read) => theLandingsBelow(repository, read, at))
  } catch {
    return
  }
  for (const landing of landings) {
    for (const context of PATCH_KINDS) {
      const key = replayKey(repository, landing, context)
      if (REPLAYS.has(key)) continue
      try {
        REPLAYS.set(key, await readApart(repository, (read) => theReplayPatchesOf(read, landing, context)))
      } catch {
        return
      }
    }
  }
}
