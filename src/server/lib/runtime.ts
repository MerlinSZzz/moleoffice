// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS SERVER IS, READ WHEN ASKED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G2 of design/ground/ACCEPTANCE.md. Section 2 of that document lists what happened
 * while nothing could answer these questions:
 *
 * - Two whole gate runs were invalidated by a browser serving a seven-hour-old transform of
 *   `src/shared`, and nothing said the code was old.
 * - A live API served stale code through an entire gate, reloading only by accident.
 * - Four `tsx watch` supervisors raced for one port, which changed hands three times in a session.
 * - Freshness was never provable from a process start time; every round proved it functionally.
 * - An unregistered test stack held two ports on a temporary database for a day and a half, and
 *   nobody's list had it.
 *
 * Every one of those is a fact about a running process that nothing could be asked for.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE RULES IT FOLLOWS
 * ---------------------------------------------------------------------------------------
 *
 * 1. **Nothing is cached, with two stated exceptions.** Every field is read at the moment of the
 *    request. The first exception is `newestLoaded` below, which is a fact about the PAST — what was
 *    on disk when this process built its module graph — and cannot be read later by definition. It
 *    is captured once, at import, and the reply says in words what it measures. The second is the
 *    newest of the server's own files on disk, which is read from the last look at them for as long
 *    as `theLastLook` below says, because every reply's freshness header asks for it.
 * 2. **What could not be read is named.** A `null` field always has a matching entry in
 *    `couldNotRead`, with the reason. Nothing here guesses, and nothing falls back to a default
 *    that would read as a measurement.
 * 3. **It reads. It never signals, kills, writes or repairs.** Asking a server what it is must be
 *    safe on somebody else's stack.
 */

import { resolve } from 'node:path'
import { theWorldThisProcessIsIn } from './world.ts'
import { localStamp, nowStamp } from '@shared/time.ts'
import { theLoopWatchNow } from './loop-watch.ts'
import type {
  BuiltPageFreshness,
  RuntimeDatabase,
  RuntimeFreshness,
  RuntimeKimi,
  RuntimeOwner,
  RuntimeProcess,
  RuntimeRecord,
  RuntimeRepository,
  RuntimeParent,
  RuntimePlace,
  RuntimeStanding,
  RuntimeSupervisor,
  RuntimeTool,
  RuntimeWorker,
  SupervisorFailedStarts,
  Unreadable,
  World,
} from '@shared/runtime.ts'
import {
  ENV_FILE,
  KIMI_SETTINGS,
  REPO_ROOT,
  STARTED_BY_THE_SERVICE_COMMAND,
  THE_INSTALL,
  canonicalDatabasePath,
  mergedEnvironment,
  readSetting,
  settingValue,
  settings,
  settingsFrom,
} from '../../config/settings.mjs'
import { databaseIdentity } from '../../config/database-identity.mjs'
import { providerKeyFromTheOfficeFile } from '../../config/provider-keys.mjs'
import { readTheTrouble, whatTheTroubleSays } from '../../config/supervisor-trouble.mjs'
import { THE_PAGES_ENTRY, THE_SERVER_ENTRY, newestSourceBuiltFrom } from '../../config/newest-source.mjs'
import { digestOfTheFilesBuiltFrom, readWhatABuildRead } from '../../config/content-digest.mjs'
import { readTheBuildStamp } from '../../config/build-stamp.mjs'
import { THE_BUILT_PAGE } from '../../config/the-built-page.mjs'
import { THE_TEST_MARK, carriesTheTestMark } from '../../config/the-test-mark.mjs'
import { thisSystem } from '../../config/systems/the-system.mjs'
import { databaseFileStatus } from '../db/client.ts'
import { addressText, theAddressThisProcessAnswersOn } from './bound-address.ts'
import { aStartingEnvironmentCanBeRead, osProbe, registrationOfProcess, startingEnvironmentValue, type AProcessToRead, type OsProcess } from './resources.ts'
import { theProcessesTheRunsInFlightRead, theWorkerWeStarted, workerRuns } from './worker.ts'
import { clientsFromOtherMachines } from './usage-reads.ts'
// THE MODEL EVERY RUN THE OFFICE STARTS IS GIVEN, from the one function that answers it.
import { theModelASettingNamed, whereTheModelCameFrom } from '../../config/agent-model.mjs'
// WHICH RUNS GO WHERE: the one reader of the model a run gets (criterion U2), and which agent tools
// are on this machine. The chore variant's own sentence is the one reader of where it came from.
import type { TheModelARunGets } from '@shared/run-models.ts'
import type { AMachinePart } from '@shared/events.ts'
import { THE_WORKER_GIVES, theModelARunGetsWithCodes, whereTheChoreCameFromSaid, whereTheModelCameFromSaid, type TheModelARunGetsSaid } from './run-models.ts'
import { inEnglish, saying, type DevSaying } from '@shared/dev-sayings.ts'
import { BUILDER_ROLES } from '@shared/run-models.ts'
import { installedTools } from '../../config/runtimes.mjs'
import { AGENT_RUNTIMES, whyTheOfficeCannotStartThisRuntime } from '@shared/participants.ts'
// WHAT THE LAST STARTS COST, AGAINST THE OWNER'S CEILING, F15 point 6.
import { recentStartCosts } from './start-cost.ts'
import { howTheMessageDoorIsSet, howTheReplyReminderIsSet } from './env.ts'
import { underATestRunner } from '@shared/under-a-test-runner.ts'

/** A place to collect what a read could not answer, so that null is never bare. */
export class Gaps {
  readonly list: Unreadable[] = []
  note(what: string, why: string): null {
    this.list.push({ what, why })
    return null
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ------------------------------------------------------------------------- the source tree

/** One reading of a set of files: the newest of them, which file that is, and how many there are. */
export type NewestSource = { at: Date; file: string; files: number }

/**
 * THE NEWEST OF THE FILES THIS SERVER IS BUILT FROM.
 *
 * The walk itself is src/config/import-graph.mjs, which vite.config.ts reads too: the server and
 * the browser app have to be measuring the same thing or the comparison means nothing. Each asks it
 * about its OWN program, from its own entry, and follows the imports.
 *
 * IT IS NOT A FOLDER, AND THAT IS MEASURED TWICE. Problem `aI9V57-ZTyv0`: judging the server
 * against every file under `src/` meant a page-only edit made the API report itself stale, health
 * answer ok false, and the red banner block a page the server had nothing to do with. Problem
 * `TMy3C0ydoYYR`: narrowing that to three folders left seven files under `src/shared` that only
 * `src/web` imports, and saving one of those did the same thing. The server cannot pick either kind
 * up — `tsx watch` restarts it only on files it loaded — so neither state ever cleared.
 * `src/config/newest-source.mjs` carries the whole account.
 */
const newestServerSource = (): NewestSource | null =>
  THE_INSTALL.from === 'bundle' ? theNewestSourceTheBundleWasMadeFrom() : newestSourceBuiltFrom(THE_SERVER_ENTRY)

/**
 * FROM A BUNDLE THERE IS NO SOURCE TREE TO WALK, so the freshness check is off and the bundle's build
 * stamp answers instead: the newest source file the server was bundled from, written when
 * `npm run bundle` made it (scripts/bundle.mjs). The same stamp answers before and now, so a bundle
 * never reads as behind itself. Null when the stamp did not record it, which reads as unknown.
 */
function theNewestSourceTheBundleWasMadeFrom(): NewestSource | null {
  if (THE_INSTALL.from !== 'bundle') return null
  const { newestSourceAtMs, newestSourceFile, newestSourceFiles } = THE_INSTALL.build
  if (newestSourceAtMs === null || newestSourceFile === null || newestSourceFiles === null) return null
  return { at: new Date(newestSourceAtMs), file: newestSourceFile, files: newestSourceFiles }
}

/**
 * THE ONE CACHED FACT, AND IT IS A FACT ABOUT THE PAST.
 *
 * The newest source file under the folders this server is built from, at the moment this module was
 * first imported. This module is imported while the server builds its routes, so it is the state of
 * the tree as this process's module graph was being built — which is exactly "the newest source
 * this process has loaded".
 *
 * It cannot be read later: by the time a request arrives, the files have whatever times they have
 * now, and the question is whether those are newer than what this process took in. Under
 * `tsx watch` a change under `src/` restarts the process, so this value moving forward IS the
 * reload, and the process start time beside it in the reply is when that happened.
 *
 * A walk that throws does not stop the server. It leaves the verdict `unknown` and says why.
 */
const LOADED: { newest: NewestSource | null; failed: string | null } = (() => {
  try {
    return { newest: newestServerSource(), failed: null }
  } catch (err) {
    return { newest: null, failed: messageOf(err) }
  }
})()

/**
 * Is the code this process loaded older than the code on disk?
 *
 * Second precision on both sides. A file written in the same second as the startup walk is not
 * evidence of anything, and calling it stale would make every restart report itself stale.
 *
 * Its own function because two callers ask it — the verdict below, and the clock above that — and
 * two spellings of it would be free to disagree about the same pair of times.
 */
export function isBehindTheCheckout(
  loaded: { at: Date } | null,
  onDisk: { at: Date } | null,
): boolean {
  if (loaded === null || onDisk === null) return false
  return Math.floor(onDisk.at.getTime() / 1000) > Math.floor(loaded.at.getTime() / 1000)
}

/**
 * WHEN THIS PROCESS WAS FIRST FOUND BEHIND THE CHECKOUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `PxJuVufHG6A2`. How long a server had been running old code was counted from
 * `staleSince`, and `staleSince` was the modification time of the NEWEST FILE in the checkout. That
 * is the LAST change, not the first one after this process loaded. So a server that had been behind
 * for an hour reported three seconds while somebody was saving files, and each new save restarted
 * the count: the red banner and the ok flag on `GET /api/health` both went quiet in exactly the case
 * where somebody is working.
 *
 * The count now runs from the moment this process was first FOUND behind, which is what "how long
 * it has been stale" means. Editing does not move it.
 *
 * ---------------------------------------------------------------------------------------
 * IN THIS MODULE'S MEMORY, AND THAT IS THE RIGHT PLACE
 * ---------------------------------------------------------------------------------------
 *
 * It belongs to this module graph, exactly as `LOADED` above does, and it dies with a reload —
 * which is what clears it. Under `tsx watch` a change under `src/` restarts the process, so a
 * reloaded server starts with no clock and is fresh again. Under the test runner each test gets a
 * fresh module graph and therefore a fresh clock, which matches `LOADED` being fresh too: the two
 * are read against each other and have to come from the same load.
 *
 * It is not on `globalThis` for that reason. The world in lib/world.ts is, because that IS a fact
 * about the process and outlives the module graph. This one is not.
 */
const FIRST_FOUND_BEHIND: { at: Date | null } = { at: null }

/**
 * Tell the clock what the latest reading says, and get back the moment staleness started.
 *
 * @param behind whether this process is behind the checkout right now
 * @param now the moment of this reading. A parameter so a test can hold the clock still.
 * @returns when it was first found behind, or null when it is not behind
 */
export function whenThisProcessWasFirstFoundBehind(behind: boolean, now: Date = new Date()): Date | null {
  if (!behind) {
    // FRESH CLEARS IT. A server that has picked the change up was never behind, as far as the next
    // reading is concerned, and a clock left running would count a staleness that has ended.
    FIRST_FOUND_BEHIND.at = null
    return null
  }
  FIRST_FOUND_BEHIND.at ??= now
  return FIRST_FOUND_BEHIND.at
}

/** Forget it, so the next reading starts the clock again. For a test, and for nothing else. */
export function forgetWhenThisProcessWentBehind(): void {
  FIRST_FOUND_BEHIND.at = null
}

/**
 * WHERE THE BUILT PAGE IS, read from this file's own location.
 *
 * `src/server/index.ts` computes the same folder for the same reason and from the same kind of
 * path — `<checkout>/dist/web` — so a test or a copy of the tree serves its own build.
 */
const theBuiltPageFolder = THE_BUILT_PAGE

/**
 * THE STAMP OF A BUILD, as `src/config/build-stamp.mjs` writes and reads it.
 *
 * Spelled here rather than imported as a type because that module is plain JavaScript read by a
 * tool that does not go through the TypeScript loader. One shape, written once, in the two places
 * that have to agree about it.
 */
type BuildStampReading =
  | { state: 'none' }
  | { state: 'unreadable'; why: string }
  | {
      state: 'read'
      builtAt: string
      builtAtMs: number
      commit: string | null
      newestSourceAt: string | null
      newestSourceAtMs: number | null
      newestSourceFile: string | null
    }

/** The answer when nobody read a built page's stamp at all. */
function nothingWasReadAboutTheBuiltPage(why: string): BuiltPageFreshness {
  return {
    builtAt: null,
    builtFromCommit: null,
    builtFromSourceAt: null,
    builtFromSourceFile: null,
    verdict: 'unknown',
    says: why,
  }
}

/** What a build recorded that the files it read held (src/config/content-digest.mjs). */
type WhatABuildRead = ReturnType<typeof readWhatABuildRead>

/**
 * WHETHER THE BUILT PAGE ON DISK IS AS NEW AS THE CHECKOUT.
 *
 * WHAT THE FILES HOLD DECIDES, when the build recorded it and the files could be read now: the rule
 * the page judges itself by (`thisPageIsBehind` in src/web/lib/world.ts). Wave 13y round 91, item 11c:
 * until then this went on by the times alone, so after an upgrade touched the files it said "older
 * than the checkout" about a page that held what the checkout holds, while the page rightly said
 * nothing.
 *
 * OTHERWISE THE SAME RULE THE SERVER USES ON ITSELF, through the same `isBehindTheCheckout`: the newest
 * source the build took in, compared with the newest source the page is built from now, to the
 * second. A build and the disk it was made from carry the same second, so building does not leave
 * the page reading as behind. The sentence then says the times decided, and why.
 *
 * `unknown` IS A REAL ANSWER and it is used for every way of not knowing: no stamp, a stamp that
 * cannot be read, one that did not record the source it took in, and a walk of the page's files
 * that failed. Reading any of those as fresh would be the first rule broken.
 *
 * @param stamp what `readTheBuildStamp` returned for the built page's folder
 * @param thePagesNewest the newest of the files the page is built from, read now, or null
 * @param whatTheBuildRead what `readWhatABuildRead` returned for the built page's folder
 * @param thePagesContent what the files the page is built from hold now, as the same digest, or null
 */
export function builtPageFreshness(
  stamp: BuildStampReading,
  thePagesNewest: NewestSource | null,
  whatTheBuildRead: WhatABuildRead = { state: 'none' },
  thePagesContent: string | null = null,
): BuiltPageFreshness {
  if (stamp.state === 'none') {
    return nothingWasReadAboutTheBuiltPage(
      `There is no build stamp in ${theBuiltPageFolder}, so whether the built page is as new as the ` +
        'checkout could not be worked out. A page served by Vite carries its own stamp and this is not it.',
    )
  }
  if (stamp.state === 'unreadable') {
    return nothingWasReadAboutTheBuiltPage(
      `The built page's stamp could not be read (${stamp.why}), so whether it is as new as the checkout ` +
        'could not be worked out.',
    )
  }
  const base = {
    builtAt: stamp.builtAt,
    builtFromCommit: stamp.commit,
    builtFromSourceAt: stamp.newestSourceAt,
    builtFromSourceFile: stamp.newestSourceFile,
  }
  if (whatTheBuildRead.state === 'read' && thePagesContent !== null) {
    const changed = whatTheBuildRead.digest !== thePagesContent
    return {
      ...base,
      verdict: changed ? 'older than the checkout' : 'as new as the checkout',
      says: changed
        ? `The built page was built at ${stamp.builtAt}, and the files it is built from no longer hold what that ` +
          'build read, so the page is older than the checkout until it is built again.'
        : `The built page was built at ${stamp.builtAt}, and the files it is built from hold what that build read.`,
    }
  }
  const byTheTimes =
    " It was judged by the files' times alone, because " +
    (whatTheBuildRead.state === 'none'
      ? 'the build did not record what it read.'
      : whatTheBuildRead.state === 'unreadable'
        ? `the build's record of what it read could not be read: ${whatTheBuildRead.why}.`
        : 'what those files hold now could not be read.')
  if (stamp.newestSourceAtMs === null) {
    return {
      ...base,
      verdict: 'unknown',
      says:
        `The built page says it was built at ${stamp.builtAt}, but its stamp does not record the newest ` +
        'source it took in, so whether it is behind the checkout could not be worked out.',
    }
  }
  if (thePagesNewest === null) {
    return {
      ...base,
      verdict: 'unknown',
      says:
        `The built page says it was built at ${stamp.builtAt}, but the files the page is built from could ` +
        'not be read now, so it could not be compared with the checkout.',
    }
  }
  const behind = isBehindTheCheckout({ at: new Date(stamp.newestSourceAtMs) }, thePagesNewest)
  const from = stamp.newestSourceFile ?? 'a file it did not name'
  const was = stamp.newestSourceAt ?? 'a time it did not record'
  return {
    ...base,
    verdict: behind ? 'older than the checkout' : 'as new as the checkout',
    says: behind
      ? `The built page was built at ${stamp.builtAt} from ${from} as it was at ${was}. The newest of the ` +
        `${String(thePagesNewest.files)} files it is built from is ${thePagesNewest.file}, changed at ` +
        `${localStamp(thePagesNewest.at)}, so the page is older than the checkout until it is built again.` +
        byTheTimes
      : `The built page was built at ${stamp.builtAt} from ${from} as it was at ${was}, and none of the ` +
        `${String(thePagesNewest.files)} files it is built from has changed since (the newest is ` +
        `${thePagesNewest.file} at ${localStamp(thePagesNewest.at)}).` +
        byTheTimes,
  }
}

/**
 * The verdict, from the two readings, with nothing read inside it.
 *
 * Separated from the reading so it can be tested without touching a file in the checkout. A test
 * that proved this by editing `src/shared` would change what every other test file in the same run
 * sees, and the thing it would prove — that a later mtime reads as stale — is arithmetic.
 *
 * @param firstFoundBehind when this process was first found behind the checkout, from the clock
 *   above. Null means nothing has recorded one, and `staleSince` is then null rather than guessed.
 */
export function freshnessBetween(
  loaded: NewestSource | null,
  onDisk: NewestSource | null,
  firstFoundBehind: Date | null = null,
  /**
   * The newest of the files the BROWSER APP is built from, read now.
   *
   * It is here because the page's half of the comparison needs it and only the server can read a
   * disk. Nothing about the server's own verdict turns on it. Null when it was not read.
   */
  thePagesNewest: NewestSource | null = null,
  /**
   * The built page's own reading, against its build stamp. Unknown when nothing read one, which is
   * the ordinary state of a development checkout.
   */
  builtPage: BuiltPageFreshness = nothingWasReadAboutTheBuiltPage(
    'Whether the built page is as new as the checkout was not worked out here.',
  ),
  /**
   * What the files the browser app is built from hold now, as src/config/content-digest.mjs digests
   * them. Like `thePagesNewest`, it is here for the page's half of the comparison, and null when it
   * was not read.
   */
  thePagesContent: string | null = null,
): RuntimeFreshness {
  const loadedAt = loaded === null ? null : localStamp(loaded.at)
  const diskAt = onDisk === null ? null : localStamp(onDisk.at)
  const pageDiskAt = thePagesNewest === null ? null : localStamp(thePagesNewest.at)
  if (loaded === null || onDisk === null) {
    return {
      newestLoaded: loadedAt,
      newestOnDisk: diskAt,
      newestOnDiskFile: onDisk?.file ?? null,
      filesTheServerIsBuiltFrom: onDisk?.files ?? null,
      newestForThePage: pageDiskAt,
      newestFileForThePage: thePagesNewest?.file ?? null,
      filesThePageIsBuiltFrom: thePagesNewest?.files ?? null,
      contentForThePage: thePagesContent,
      verdict: 'unknown',
      says: inEnglish(saying('runtimeFreshnessUnknown', {})),
      said: saying('runtimeFreshnessUnknown', {}),
      staleSince: null,
      builtPage,
    }
  }
  const stale = isBehindTheCheckout(loaded, onDisk)
  const said = saying(stale ? 'runtimeFreshnessOlder' : 'runtimeFreshnessCurrent', {
    loaded: String(loadedAt),
    n: onDisk.files,
    file: onDisk.file,
    changed: String(diskAt),
  })
  return {
    newestLoaded: loadedAt,
    newestOnDisk: diskAt,
    newestOnDiskFile: onDisk.file,
    filesTheServerIsBuiltFrom: onDisk.files,
    newestForThePage: pageDiskAt,
    newestFileForThePage: thePagesNewest?.file ?? null,
    filesThePageIsBuiltFrom: thePagesNewest?.files ?? null,
    contentForThePage: thePagesContent,
    verdict: stale ? 'older than the checkout' : 'as new as the checkout',
    // THE SENTENCE NAMES WHAT IT IS ABOUT, AND THE COUNT IS PART OF THAT. It used to say "src/",
    // which was a claim about the whole checkout, and then three folder names, which was a claim
    // about files the server never loads. Both produced sentences about a server that had nothing
    // to pick up. Problems `aI9V57-ZTyv0` and `TMy3C0ydoYYR`.
    says: inEnglish(said),
    said,
    // WHEN IT WENT BEHIND, not when the newest file changed. Those are different moments and the
    // second one moves every time somebody saves. See the clock above for what that cost.
    staleSince: stale && firstFoundBehind !== null ? localStamp(firstFoundBehind) : null,
    builtPage,
  }
}

/**
 * THE LAST LOOK AT THE SERVER'S OWN FILES, AND HOW LONG IT IS READ AGAIN INSTEAD OF LOOKING.
 *
 * Wave 13y round 86, item 11b. Every reply carries the freshness header, and each header looked at
 * the time of every file the server is built from. Measured in round 85: 822 files, a median of
 * 1.64 ms a look in a warm process, and 141,353 replies in one day of the owner's office. A reply
 * within a second of the last look now reads that look's answer, a failed look included.
 *
 * A save is found up to a second later than before. A page waits for the grace before it draws its
 * banner (MOLE_OFFICE_STALE_CODE_GRACE, 15 seconds unless it is set), so that second is inside it.
 *
 * THIS IS THE ONE PLACE THE RULE IS. The header, the health reply and the runtime record all read
 * the server's half through `theServersHalf` below, so in any one second they read the same look.
 * The first reading of a process looks at the files itself: `LOADED` is what the process took in,
 * not a look at the disk now. Nothing watches the files.
 *
 * `performance.now()` and not the wall clock, because it only goes forward: a wall clock set back
 * would hold one look for as long as it was set back.
 */
const A_LOOK_IS_READ_AGAIN_FOR_MS = 1000
let theLastLook: { atMs: number; onDisk: NewestSource | null; failed: string | null } | null = null

function aLookAtTheServersFiles(): { onDisk: NewestSource | null; failed: string | null } {
  const now = performance.now()
  if (theLastLook !== null && now - theLastLook.atMs < A_LOOK_IS_READ_AGAIN_FOR_MS) return theLastLook
  try {
    theLastLook = { atMs: now, onDisk: newestServerSource(), failed: null }
  } catch (err) {
    theLastLook = { atMs: now, onDisk: null, failed: messageOf(err) }
  }
  return theLastLook
}

/** The server's half of the reading: the newest of its own files on disk at the last look, with the clock told. */
function theServersHalf(gaps: Gaps): { onDisk: NewestSource | null; firstFoundBehind: Date | null } {
  if (LOADED.failed !== null) {
    gaps.note(
      'the newest source this process loaded',
      `The walk from ${THE_SERVER_ENTRY} at startup failed (${LOADED.failed}), so there is nothing ` +
        'to compare against.',
    )
  }
  const { onDisk, failed } = aLookAtTheServersFiles()
  if (failed !== null) {
    gaps.note(
      'the newest source on disk',
      `The files reached from ${THE_SERVER_ENTRY} could not be read at the last look (${failed}).`,
    )
  }
  // THE CLOCK IS TOLD ON EVERY READING, the readings of a held look as well. This runs on the way
  // to the freshness header of every reply, so a server that goes behind is found at the first look
  // after the save.
  const firstFoundBehind = whenThisProcessWasFirstFoundBehind(isBehindTheCheckout(LOADED.newest, onDisk))
  return { onDisk, firstFoundBehind }
}

/**
 * HOW NEW THE SERVER'S OWN CODE IS, AND NOTHING ABOUT THE PAGE. This is what the freshness header on
 * every reply is made from, and the header carries only these two values and the grace.
 *
 * The header used to be made from the whole of `freshness()` below. Its page's half walks the files
 * the browser app is built from and reads the built page's stamp, and the header dropped both.
 * Measured in wave 13y round 33, over 567 such files: the first reply of a process paid 207 to 248 ms
 * for that walk, and every later reply looked at the time of each of those files again. The verdict
 * is still worked out by `freshnessBetween`, so the header and the runtime record cannot say two
 * things about the same server.
 */
export function theServersFreshness(gaps: Gaps): Pick<RuntimeFreshness, 'verdict' | 'staleSince'> {
  const { onDisk, firstFoundBehind } = theServersHalf(gaps)
  const { verdict, staleSince } = freshnessBetween(LOADED.newest, onDisk, firstFoundBehind)
  return { verdict, staleSince }
}

/** Whether the code this process is serving is as new as the code on disk, and the page's code too. */
export function freshness(gaps: Gaps): RuntimeFreshness {
  const { onDisk, firstFoundBehind } = theServersHalf(gaps)
  /**
   * AND THE SAME QUESTION ASKED OF THE FILES THE PAGE IS BUILT FROM.
   *
   * The page cannot read a disk, so the server reads this for it. It is a different number from the
   * one above and it has to be: the two programs load different sets of files, and each is judged
   * against its own. Measuring the page against the whole of `src/` put a red banner over the
   * owner's live page after a server-only merge (problem `2hadqssN_rc4`); measuring the SERVER
   * against the whole of `src/` did the same after a page-only edit (problem `aI9V57-ZTyv0`), and
   * measuring it against three folders did the same again for seven files (`TMy3C0ydoYYR`).
   */
  let thePagesNewest: NewestSource | null = null
  try {
    // From a bundle there is no source to compare the built page with, so its freshness is unknown.
    thePagesNewest = THE_INSTALL.from === 'bundle' ? null : newestSourceBuiltFrom(THE_PAGES_ENTRY)
  } catch (err) {
    gaps.note(
      'the newest source the browser app is built from',
      `The files reached from ${THE_PAGES_ENTRY} could not be read now (${messageOf(err)}).`,
    )
  }
  /**
   * AND WHAT THOSE FILES HOLD, which a built page is judged by when its build recorded the same.
   * src/config/content-digest.mjs says why the contents and not the times, and what it costs: every
   * file is read again for every look.
   */
  let thePagesContent: string | null = null
  try {
    thePagesContent = THE_INSTALL.from === 'bundle' ? null : digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY).digest
  } catch (err) {
    gaps.note('what the files the browser app is built from hold', messageOf(err))
  }
  /**
   * AND THE BUILT PAGE'S OWN STAMP, read from inside `dist/web`. A failure to read it is a reading
   * of its own — `unreadable` — rather than a thrown error, because asking a server what it is must
   * not fail over a missing or damaged little file.
   */
  let theBuildStamp: BuildStampReading
  try {
    theBuildStamp = readTheBuildStamp(theBuiltPageFolder) as BuildStampReading
  } catch (err) {
    theBuildStamp = { state: 'unreadable', why: messageOf(err) }
  }
  /** AND WHAT THE BUILD RECORDED THAT THOSE FILES HELD, beside the stamp, which decides when it is there. */
  let whatTheBuildRead: WhatABuildRead
  try {
    whatTheBuildRead = readWhatABuildRead(theBuiltPageFolder)
  } catch (err) {
    whatTheBuildRead = { state: 'unreadable', why: messageOf(err) }
  }
  const builtPage = builtPageFreshness(theBuildStamp, thePagesNewest, whatTheBuildRead, thePagesContent)
  return freshnessBetween(LOADED.newest, onDisk, firstFoundBehind, thePagesNewest, builtPage, thePagesContent)
}

// ---------------------------------------------------------------------------- the checkout

/**
 * The checkout this server's code came from, and what git says about it.
 *
 * THROUGH THE PROBE, not by spawning git here. `OsProbe` in resources.ts is the one interface that
 * touches the operating system. This file asked git directly at first and was wrong to.
 */
export function repository(gaps: Gaps): RuntimeRepository {
  const path = REPO_ROOT.replace(/\/$/, '')
  /**
   * FROM A BUNDLE THERE IS NO CHECKOUT AND NO GIT. The build stamp names the build: the commit it was
   * bundled from, and when. Branch, dirtiness and worktree are not facts about a bundle, so they are
   * null, and the gap says why.
   */
  if (THE_INSTALL.from === 'bundle') {
    const { commit, builtAt } = THE_INSTALL.build
    gaps.note(
      'what git says about this checkout',
      `This server runs from a bundle in ${path}, not from a checkout, so git is not asked. The bundle's build ` +
        `stamp names the build: ${commit === null ? 'no commit was recorded' : `commit ${commit}`}, bundled at ${builtAt}.`,
    )
    return {
      path,
      workingDirectory: process.cwd(),
      head: commit === null ? null : { short: commit.slice(0, 7), full: commit },
      branch: null,
      dirty: null,
      isWorktree: null,
    }
  }
  const probe = osProbe()
  const bare: RuntimeRepository = {
    path,
    workingDirectory: process.cwd(),
    head: null,
    branch: null,
    dirty: null,
    isWorktree: null,
  }
  if (probe.checkout === undefined) {
    gaps.note(
      'what git says about this checkout',
      `The probe installed for this read (${probe.platform}) does not describe a checkout, so the commit, the ` +
        'branch and whether the tree is dirty are unknown here. This is not a reading of the disk: nothing looked.',
    )
    return bare
  }
  let read
  try {
    read = probe.checkout(path)
  } catch (err) {
    gaps.note('what git says about this checkout', `The probe threw reading ${path} (${messageOf(err)}).`)
    return bare
  }
  for (const why of read.couldNotRead) gaps.note('what git says about this checkout', why)
  return {
    path,
    workingDirectory: process.cwd(),
    head: read.head,
    branch: read.branch,
    dirty: read.dirty,
    isWorktree: read.isWorktree,
  }
}

// ---------------------------------------------------------------------------- the database

/** The database file this process holds open, and whether it is the canonical one. */
export function database(): RuntimeDatabase {
  // Read from the module that opened it, not from the settings. A running SQLite connection holds
  // the file it opened, whatever anything has said since — which is the whole reason a server can
  // go on serving a deleted database and look completely normal.
  const status = databaseFileStatus()
  const path = resolve(status.path)
  // Canonical means: the file a server started from this checkout with NOTHING in its environment
  // would open. `.env` is part of the checkout's settings; the shell is not. `canonicalDatabasePath`
  // in the declaration is the one place that question is answered, so a tool and this route cannot
  // give two answers.
  const fromFileOnly = canonicalDatabasePath(ENV_FILE)
  return {
    path,
    canonicalPath: fromFileOnly,
    canonical: path === fromFileOnly,
    problem: status.ok ? null : status.problem,
    problemSaid: status.ok ? null : status.said,
  }
}

// ---------------------------------------------------------------------------- the process

function processFacts(gaps: Gaps): { facts: RuntimeProcess; listeningOn: number[] } {
  const pid = process.pid
  const probe = osProbe()
  let self = null
  try {
    self = probe.processById(pid)
  } catch (err) {
    gaps.note('this process’s own group and start time', `The process table could not be read (${messageOf(err)}).`)
  }
  if (self === null && gaps.list.length === 0) {
    gaps.note(
      'this process’s own group and start time',
      `The probe installed for this read (${probe.platform}) does not know about pid ${String(pid)}.`,
    )
  }
  let listeningOn: number[] = []
  try {
    // ONE PORT IS ONE PORT, however many sockets are on it. A server told an address for other
    // machines holds two sockets on the same number — one on 127.0.0.1 and one on that address —
    // and the page drew "29800, 29800" until this line deduplicated them. The field is the ports it
    // is listening on; which addresses those are is a different question and `addresses` answers it.
    listeningOn = [
      ...new Set(
        probe
          .listeningPorts()
          .filter((p) => p.pid === pid)
          .map((p) => p.port),
      ),
    ].sort((a, b) => a - b)
  } catch (err) {
    gaps.note('which ports this process is holding', `The listening sockets could not be read (${messageOf(err)}).`)
  }
  const upFor = self === null ? null : ageSaid(self.startedAt)
  return {
    facts: {
      pid,
      pgid: self?.pgid ?? null,
      startedAt: self?.startedAt ?? null,
      upFor: upFor === null ? null : inEnglish(upFor),
      upForSaid: upFor,
      underTestRunner: underATestRunner(),
    },
    listeningOn,
  }
}

// -------------------------------------------------------------------------- the supervisor

/**
 * WHAT IS WATCHING THIS SERVER AND WILL RESTART IT, READ OFF THE PARENT PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS READ AND NOT CLAIMED, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `7XK5_FQcvEjl`. `tsx watch` watches each file the server loaded, one inotify watch per
 * file. `git checkout -- src/shared/product.ts` unlinks the file and writes a new one, and the
 * measurement on this machine on 4 September 2026 was: 714 watches before, 713 after, and
 * `src/shared/product.ts` no longer among them. From then on nothing about that file restarted the
 * server — not an append, not a rename, not a rewrite in place — for the life of that supervisor.
 * The server was really behind, said so, and no restart was ever coming.
 *
 * A server whose supervisor has stopped watching looks exactly like a server whose supervisor is
 * about to restart it. So the record says what is up there, by NAME, read from the parent process's
 * command line. If a supervisor were only asked to introduce itself, a dead one would still be
 * introduced.
 *
 * The one fact the machine cannot supply is WHY this run started. Only the thing that started it
 * knows, so `MOLE_OFFICE_RESTART_REASON` is how it says. Nobody setting it is a real answer.
 */
export function supervisorOf(pid: number, gaps: Gaps, port: number | null = null): RuntimeSupervisor {
  const serviceManager = theServiceManagerOfThisServer()
  const restartedBecause = settingValue('MOLE_OFFICE_RESTART_REASON')
  const failedStarts = theFailedStartsOfThisCheckoutsSupervisor(port)
  const alsoSays = failedStarts === null ? '' : ` ${failedStarts.says}`
  let parent = null
  try {
    parent = osProbe().processById(pid)
  } catch (err) {
    gaps.note('what is watching this server for changes', `The process table could not be read (${messageOf(err)}).`)
    return {
      watching: 'unknown',
      kind: 'unknown',
      pid: null,
      pgid: null,
      commandLine: null,
      parent: null,
      restartedBecause,
      failedStarts,
      serviceManager,
      says: `Nothing could be read about what started this server, because the process table could not be read.${alsoSays}`,
    }
  }
  if (parent === null) {
    return {
      watching: false,
      kind: 'nothing that restarts it',
      pid: null,
      pgid: null,
      commandLine: null,
      parent: null,
      restartedBecause,
      failedStarts,
      serviceManager,
      says:
        serviceManager !== null
          ? `${theServiceSentence(`The process that started it (${String(pid)}) has ended, as it does.`)}${alsoSays}`
          : `Nothing is watching this server: the process that started it (${String(pid)}) has gone, so a ` +
            `change to its code will not restart it.${alsoSays}`,
    }
  }
  const itsParent: RuntimeParent = {
    pid: parent.pid,
    pgid: parent.pgid,
    commandLine: parent.command,
    what: whatTheParentIs(parent.command),
  }
  const because = restartedBecause === null ? '' : ` This run started because ${restartedBecause}.`
  const kind = whichSupervisor(parent.command)
  const notThisCheckout = kind === 'nothing that restarts it' ? null : theCheckoutItIsNotWatching(parent.pid, parent.command)
  /**
   * A SUPERVISOR OF ANOTHER CHECKOUT IS NOT WATCHING THIS SERVER.
   *
   * The reading is what is above this process, and what is above it may be a `tools/serve-dev.mjs`
   * that watches a different worktree — the machine this is built on runs several at once. It would
   * restart a server on ITS files, not on these, so calling it a supervisor of this one would be
   * the first rule broken: a reply that says a thing is being watched must mean it is being watched.
   */
  const watching = kind !== 'nothing that restarts it' && notThisCheckout === null
  if (!watching) {
    return {
      watching: false,
      kind: 'nothing that restarts it',
      pid: null,
      pgid: null,
      commandLine: null,
      parent: itsParent,
      restartedBecause,
      failedStarts,
      serviceManager,
      says:
        (serviceManager !== null && notThisCheckout === null
          ? theServiceSentence(`The process above it now is ${itsParent.what}.`)
          : notThisCheckout === null
          ? `Nothing is watching this server for changes: it was started by ${itsParent.what}, which does not ` +
            'restart it. The Settings page shows whether this office can request a restart.'
          : `Nothing is watching this server for changes: the process above it is a dev supervisor, but it is ` +
            `watching ${notThisCheckout}, not this checkout, so a change here does not restart this server.`) +
        `${because}${alsoSays}`,
    }
  }
  return {
    watching,
    kind,
    pid: parent.pid,
    pgid: parent.pgid,
    commandLine: parent.command,
    parent: itsParent,
    restartedBecause,
    failedStarts,
    serviceManager,
    says:
      `${kind === 'tsx watch' ? 'tsx watch' : "Mole Office's own dev supervisor"} is watching this server ` +
      `as process ${String(parent.pid)}, and restarts it when its code changes.${because}${alsoSays}`,
  }
}

/**
 * WHICH CHECKOUT A SUPERVISOR ABOVE THIS SERVER IS WATCHING, when it is not this one.
 *
 * Null means it is watching this checkout, which is the ordinary answer. It is read from the
 * supervisor's own working directory, because `npm run dev:server` runs `node tools/serve-dev.mjs`
 * with a RELATIVE path and there is nothing else on the command line to tell two checkouts apart.
 * A command line carrying an absolute path is believed as well, for somebody who typed one.
 *
 * WHEN IT CANNOT BE READ, THE ANSWER IS THIS CHECKOUT. The parent is a supervisor and this server
 * is its child; every supervisor this repository starts watches the checkout it starts a server
 * from. Saying "not this checkout" because a working directory could not be read would turn a
 * server that IS being watched into one that reads as abandoned, which is the more damaging way to
 * be wrong here.
 */
function theCheckoutItIsNotWatching(supervisorPid: number, command: string): string | null {
  const here = REPO_ROOT.replace(/\/$/, '')
  if (command.includes(here)) return null
  const probe = osProbe()
  if (probe.processFacts === undefined) return null
  let facts = null
  try {
    facts = probe.processFacts(supervisorPid)
  } catch {
    return null
  }
  const where = facts?.workingDirectory ?? null
  if (where === null) return null
  return where.replace(/\/$/, '') === here ? null : where
}

/**
 * WHAT THE PROCESS ABOVE THIS SERVER IS, in a word or two a person can read.
 *
 * The command line is the evidence and it stays on the record beside this. This is the reading of
 * it, and it exists because `supervisor: { commandLine: "/usr/lib/systemd/systemd --user
 * --deserialize=42" }` is a true fact filed under the wrong name.
 */
export function whatTheParentIs(command: string): string {
  if (/(^|\/)systemd\b/.test(command)) return 'systemd, which adopts a process whose parent has gone'
  // A window of the office runs in Electron. It is a client of the service, never its supervisor, and
  // it does not restart a server; so it is named for what it is (criterion W8).
  if (/(^|\/)electron(\s|$)/.test(command)) return 'an Electron program, such as a window of the office, which does not restart it'
  if (/\bvitest\b/.test(command)) return 'a test runner'
  if (/(^|\/)(ba|z|k|da)?sh\b/.test(command)) return 'a shell'
  if (/(^|\/)npm\b|npm-cli\.js/.test(command)) return 'the npm command'
  if (/(^|\/)init\b/.test(command)) return 'init, which adopts a process whose parent has gone'
  return command
}

/**
 * THE RUN OF FAILED STARTS THIS CHECKOUT'S SUPERVISOR WROTE DOWN, or null because there is none.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SERVER READS A FILE ABOUT A PROCESS THAT IS NOT ITS PARENT
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`. The server that is answering may be exactly the wrong one to ask. The
 * API on the live office's port can answer every request correctly while the supervisor of that
 * same checkout and that same port fails to start its replacement again and again. The answering
 * server's own parent is then systemd and it has nothing to say about any of it. The fact belongs
 * to the port, so it is read by port.
 *
 * THREE THINGS ARE CHECKED, AND A NO TO ANY OF THEM IS NULL:
 *
 *   · the file is about THIS port, so a supervisor of a scratch stack is not reported here;
 *   · the file is about THIS checkout, for the same reason;
 *   · it is still about now — `readTheTrouble` refuses one that nothing has rewritten for two
 *     minutes, because the supervisor rewrites it on every failed start and waits at most half a
 *     minute between attempts.
 *
 * @param port the port this server was configured with, or null to read the file whatever port it names
 * @param root the checkout to read it from. A parameter so a test needs no file in this one.
 */
export function theFailedStartsOfThisCheckoutsSupervisor(
  port: number | null,
  root: string = REPO_ROOT,
): SupervisorFailedStarts | null {
  const trouble = readTheTrouble(root)
  if (trouble === null) return null
  if (port !== null && trouble.port !== port) return null
  if (trouble.repository.replace(/\/$/, '') !== root.replace(/\/$/, '')) return null
  return {
    count: trouble.failedStarts,
    lastExit: trouble.lastExit,
    since: localStamp(new Date(trouble.sinceMs)),
    at: localStamp(new Date(trouble.atMs)),
    lastOutput: trouble.lastOutput,
    supervisor: { pid: trouble.supervisorPid, pgid: trouble.supervisorPgid },
    says: whatTheTroubleSays(trouble),
  }
}

/**
 * THE CLAIM `mole-office start` HANDED THIS SERVER, taken once at start, or null.
 *
 * `mole-office start` (src/config/the-service-command.mjs) sets MOLE_OFFICE_STARTED_BY for the server
 * it starts. Everything that server starts would inherit it: the message worker, agent runs, and what
 * they start. So `takeTheServiceClaim` reads it once, when the server starts, keeps it here, and takes
 * it out of this process's environment, so no child carries the claim on (the review of H3).
 */
let theServiceClaim: string | null = null

/**
 * READ THE SERVICE CLAIM ONCE AND TAKE IT OUT OF THE ENVIRONMENT. src/server/index.ts calls it at the
 * start of `start()`, before anything is spawned. Returns what it read, or null.
 */
export function takeTheServiceClaim(env: NodeJS.ProcessEnv = process.env): string | null {
  theServiceClaim = settingValue('MOLE_OFFICE_STARTED_BY', env)
  delete env['MOLE_OFFICE_STARTED_BY']
  return theServiceClaim
}

/**
 * WHETHER THIS SERVER RUNS AS THE MOLE OFFICE SERVICE, and so what manages it.
 *
 * The claim taken at start is believed only while this server still leads its own process group,
 * which is how `mole-office start` starts it: a server started in somebody else's group is not
 * called the service. When the group cannot be read, nothing is claimed. ON WINDOWS, which has no
 * process groups, it is believed only when the system layer says this server runs in the group its
 * starter made, which is how `mole-office start` starts it there.
 */
export function theServiceManagerOfThisServer(): RuntimeSupervisor['serviceManager'] {
  if (theServiceClaim !== STARTED_BY_THE_SERVICE_COMMAND) return null
  const { jobObjects } = thisSystem().groups
  if (jobObjects !== null) return 'group' in jobObjects.theOneThisProgramWasStartedIn() ? STARTED_BY_THE_SERVICE_COMMAND : null
  let ownGroup: number
  try {
    ownGroup = osProbe().ownProcessGroup()
  } catch {
    return null
  }
  return ownGroup === process.pid ? STARTED_BY_THE_SERVICE_COMMAND : null
}

/**
 * The sentence for a server that runs as the Mole Office service. It says only what was read about
 * what is above the server now, never what is not its parent.
 *
 * @param above what was read about the process above it, as a sentence
 */
function theServiceSentence(above: string): string {
  return (
    'This server runs as the Mole Office service: `mole-office start` started it in a process group of its own ' +
    `and left it running. ${above} Nothing restarts it when its code changes. Open Restart the office on the Settings page and press Restart.`
  )
}

/**
 * Which supervisor a command line is, or that it is not one.
 *
 * Matched on what the command line CONTAINS rather than on an exact string, because both
 * supervisors are run through node with an absolute path that differs per checkout.
 */
export function whichSupervisor(command: string): RuntimeSupervisor['kind'] {
  if (command.includes('tools/serve-dev.mjs')) return 'the dev supervisor'
  if (theTsxLauncher(command)) return /\bwatch\b/.test(command) ? 'tsx watch' : 'nothing that restarts it'
  return 'nothing that restarts it'
}

/** Whether a command line is `tsx` running something, with or without `watch`. */
function theTsxLauncher(command: string): boolean {
  return /(^|[/ ])tsx\b/.test(command) || command.includes('tsx/dist/cli.mjs')
}

export { underATestRunner }

/** Worked out once. It cannot change while a process runs, and it reads files to answer. */
let ancestorAnswer: boolean | null = null

/**
 * WHETHER A TEST RUNNER IS BEHIND THIS PROCESS — its own environment, or a process that started it.
 *
 * NOT A SECOND IDEA OF WHAT A TEST IS. It is `underATestRunner()` and then one more question, and it
 * is the reading to use wherever being wrong means touching something outside this process: writing
 * into the office a declaration names is the case it was written for.
 *
 * Some tests remove VITEST and VITEST_WORKER_ID from the servers they spawn so the servers behave
 * like ordinary production servers. Two things still say a test started them, and either is enough
 * to keep those servers from reporting worlds to the office the declaration names (problem
 * JTdajUUs23_M):
 *   1. THE SUITE'S MARK in this process's own environment, which vitest.config.ts gives every process
 *      the run starts (src/config/the-test-mark.mjs). It is read the same way on every system, and it
 *      is the only one of the two a Mac can read (problem mZdrckWiS8hc).
 *   2. On Linux, a parent worker that was started with VITEST. `whyATestsServerMayNotStart` below
 *      uses this to refuse a server a test started without the mark, so no test can leave a Mac
 *      uncovered while every run on Linux passes.
 *   3. Off Linux, where no parent's starting environment can be read, what the runner hands down in
 *      this process's own environment (WHAT_A_TEST_RUNNER_HANDS_DOWN below). The same function refuses
 *      a server that carries it without the mark.
 *
 * The process and environment readers in resources.ts walk the chain. The answer is cached
 * because worldNow reaches this guard for every reply header.
 *
 * An ancestor counts only when its starting environment carries VITEST, the runner's own mark.
 * A word in its command line is not evidence of a test runner. The worker keeps the mark even
 * when a test removes it from a child server's environment.
 *
 * If a process table cannot be read, the walk stops. If an environment cannot be read, the
 * walk continues to the next parent. Only marks the process can read count as evidence.
 */
export function aTestRunnerIsBehindThisProcess(): boolean {
  if (underATestRunner() || carriesTheTestMark()) return true
  // NO WALK WHERE NO STARTING ENVIRONMENT CAN BE READ. Each step would read two processes and then meet the
  // reader's refusal, so the walk could only answer no. On Windows one read of one process runs PowerShell
  // twice, and the walk took 29 to 31 seconds of each of four starts of the bundled server on a Windows 11
  // machine (wave 13t, round W9). This process's own environment is read instead, which costs nothing.
  if (!aStartingEnvironmentCanBeRead()) return whatATestRunnerHandedDownHere().length > 0
  ancestorAnswer ??= aTestRunnerIsAnAncestor(process.pid)
  return ancestorAnswer
}

/**
 * WHAT A TEST RUNNER HANDS DOWN TO WHAT IT STARTS, besides VITEST, VITEST_WORKER_ID and the suite's mark,
 * which each say outright that a test started this process. vitest 4 starts each worker with VITEST_MODE,
 * and with NODE_ENV set to test unless NODE_ENV was already set, and the worker sets VITEST_POOL_ID in
 * itself. A process a test starts with a copy of its worker's environment carries them, unless the test
 * removed them too.
 *
 * TWO THINGS ARE LEFT OUT. vitest also sets TEST, but the name is too common to say that a test runner set
 * it. The suite's live-office guard sets variables of its own, but their names are in tools/, which no file
 * of src/ imports and the bundle does not carry.
 */
const WHAT_A_TEST_RUNNER_HANDS_DOWN: readonly { readonly name: string; readonly value: string | null }[] = [
  { name: 'VITEST_POOL_ID', value: null },
  { name: 'VITEST_MODE', value: null },
  { name: 'NODE_ENV', value: 'test' },
]

/** Which of WHAT_A_TEST_RUNNER_HANDS_DOWN this process's own environment carries, each as it is named. */
function whatATestRunnerHandedDownHere(): string[] {
  return WHAT_A_TEST_RUNNER_HANDS_DOWN.filter(({ name, value }) => {
    const here = process.env[name]
    return here !== undefined && here !== '' && (value === null || here === value)
  }).map(({ name, value }) => (value === null ? name : `${name}=${value}`))
}

/**
 * WHY A SERVER A TEST STARTED MAY NOT START: it carries neither VITEST nor the suite's mark, yet a
 * parent was started with VITEST, or, off Linux, its own environment carries what a test runner hands
 * down. Null when the server may start.
 *
 * Only Linux can see that parent. That is enough: every test that starts a server runs on Linux, and
 * once it passes the mark there, the mark is what a Mac reads. A test that builds its server's
 * environment from nothing must put the mark in (THE_TEST_MARK in src/config/the-test-mark.mjs). Off
 * Linux a server refuses when its own environment carries what a test runner hands down but not the
 * mark. The server calls this once, at start, and throws the sentence.
 */
export function whyATestsServerMayNotStart(): string | null {
  if (underATestRunner() || carriesTheTestMark()) return null
  if (!aTestRunnerIsBehindThisProcess()) return null
  if (!aStartingEnvironmentCanBeRead()) {
    return (
      `REFUSING TO START: this server's environment carries ${whatATestRunnerHandedDownHere().join(', ')}, which a ` +
      `test runner hands down to what it starts, but neither VITEST nor ${THE_TEST_MARK}. Off Linux, Mole Office ` +
      `cannot read the environment a parent was started with, so it reads this server's own. A test that starts a ` +
      `server must keep ${THE_TEST_MARK} in the environment it passes; src/config/the-test-mark.mjs says why. To ` +
      `start this server by hand, start it without them.`
    )
  }
  return (
    `REFUSING TO START: a test started this server without the suite's mark. A process above it was started ` +
    `with VITEST, but this server's environment carries neither VITEST nor ${THE_TEST_MARK}. Only Linux can ` +
    `read a parent's environment; on a Mac this server would not know a test started it, and could report ` +
    // The Mac's blind spot is problem mZdrckWiS8hc; the sentence says it in words.
    `its world to the office the declaration names. The test that started it must ` +
    `keep ${THE_TEST_MARK} in the environment it passes; src/config/the-test-mark.mjs says why.`
  )
}

function aTestRunnerIsAnAncestor(from: number): boolean {
  let pid = from
  // Twenty is far past any real chain and stops a loop dead if the table ever says something
  // circular. Reparenting to 1 ends the walk: init started nothing this product cares about.
  for (let step = 0; step < 20; step += 1) {
    let parent: OsProcess | null = null
    try {
      const here = osProbe().processById(pid)
      if (here === null || here.ppid <= 1) return false
      parent = osProbe().processById(here.ppid)
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "the process table could not
      // be read", and what is done about it is to stop walking rather than to guess at an answer.
      return false
    }
    if (parent === null) return false
    if (aTestRunnerStarted(parent.pid)) return true
    pid = parent.pid
  }
  return false
}

/**
 * Whether this process was started with the test runner's own mark, `VITEST`.
 *
 * A process whose environment may not be read (another user's) carries no mark this can see, and
 * the walk goes on to its parent.
 */
function aTestRunnerStarted(pid: number): boolean {
  try {
    return startingEnvironmentValue(pid, 'VITEST') !== null
  } catch {
    return false
  }
}

/** "3 hours", "40 minutes", as a code with its count. Null when the stamp does not read as one. */
export function ageSaid(stamp: string, now: number = Date.now()): DevSaying | null {
  const at = Date.parse(stamp.replace(' ', 'T'))
  if (Number.isNaN(at)) return null
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return saying('runtimeAgeSeconds', { n: seconds })
  if (seconds < 3600) return saying('runtimeAgeMinutes', { n: Math.floor(seconds / 60) })
  if (seconds < 86400) return saying('runtimeAgeHours', { n: Math.floor(seconds / 3600) })
  return saying('runtimeAgeDays', { n: Math.floor(seconds / 86400) })
}

// ------------------------------------------------------------------------------ the owner

/** Who started this process, from the resources ledger, or nobody. */
export function startedBy(pid: number, pgid: number | null): RuntimeOwner {
  const found = registrationOfProcess(pid, pgid)
  if (found === null) {
    // The honest answer, and a WORSE one than any registration, because nothing can say whether
    // this process was meant to be left running.
    const said = saying('runtimeNobodyRegistered', {})
    return {
      registered: false,
      says: inEnglish(said),
      said,
      resourceId: null,
      sessionRecordId: null,
      sessionTitle: null,
      ownerEnded: null,
      registeredAt: null,
      startedByTheProduct: null,
    }
  }
  const who = found.session.title ?? found.session.recordId
  const values = { who, at: found.entry.registeredAt }
  const said =
    found.session.ended === true
      ? saying('runtimeRegisteredByEnded', values)
      : found.session.ended === 'unknown'
        ? saying('runtimeRegisteredByMaybeEnded', values)
        : saying('runtimeRegisteredBy', values)
  return {
    registered: true,
    says: inEnglish(said),
    said,
    resourceId: found.entry.id,
    sessionRecordId: found.entry.sessionRecordId,
    sessionTitle: found.session.title,
    ownerEnded: found.session.ended,
    registeredAt: found.entry.registeredAt,
    startedByTheProduct: found.startedByTheProduct,
  }
}

/**
 * THE MESSAGE WORKER THIS SERVER STARTED, and what it is doing.
 *
 * Two halves, kept apart on purpose. What this server DID at boot cannot be worked out again, so it
 * is written down then and read back here. Whether that process is still there, and what runs it
 * has going, are read fresh every time somebody asks, like everything else on this page.
 */
export function theWorker(): RuntimeWorker {
  const wrote = theWorkerWeStarted()
  let alive: boolean | 'unknown' = false
  if (wrote.pid === null) {
    alive = false
  } else {
    const probe = osProbe()
    const live = probe.processById(wrote.pid)
    alive = live === null ? false : true
  }
  return {
    started: wrote.started,
    says: wrote.says,
    said: wrote.said,
    pid: wrote.pid,
    pgid: wrote.pgid,
    sessionRecordId: wrote.sessionRecordId,
    resourceId: wrote.resourceId,
    alive,
    runs: workerRuns(),
    runsAreFaked: wrote.runsAreFaked,
    // WHICH MODEL A RUN THE OFFICE STARTS IS GIVEN, and where that came from. Criterion M85. Read
    // from the same functions the adapter reads, so the page and the command cannot disagree.
    model: { name: theModelASettingNamed(), from: whereTheModelCameFrom(), fromSaid: whereTheModelCameFromSaid() },
  }
}

// ------------------------------------------------------------------- scratch or canonical

/**
 * Whether this is the real stack or a throwaway, and every reason.
 *
 * Four things make a runtime scratch, and any one of them is enough. They are listed rather than
 * summed, because "it is scratch" without the reason is the answer that sent somebody to the wrong
 * server: a page that says scratch and cannot say why is a page you argue with.
 */
export function standing(
  repo: RuntimeRepository,
  db: RuntimeDatabase,
  underTestRunner: boolean,
  port: number | null,
): RuntimeStanding & { becauseSaid: DevSaying[] } {
  const said: DevSaying[] = []
  if (repo.isWorktree === true) said.push(saying('runtimeScratchWorktree', { path: repo.path }))
  if (!db.canonical) said.push(saying('runtimeScratchDatabase', { path: db.path, canonical: db.canonicalPath }))
  if (underTestRunner) said.push(saying('runtimeScratchTestRunner', {}))
  const declared = settings({}, ENV_FILE).apiPort
  if (port !== null && port !== declared) {
    said.push(saying('runtimeScratchPort', { port: String(port), declared: String(declared) }))
  }
  return { kind: said.length === 0 ? 'canonical' : 'scratch', because: said.map(inEnglish), becauseSaid: said }
}

// ----------------------------------------------------------------------------- the addresses

/**
 * WHERE THIS SERVER REALLY ANSWERS, AND WHERE IT WAS TOLD IT WOULD.
 *
 * The first is read off the listening socket and the second off the settings, because they are two
 * facts and they can differ. Problem `ES5fb2_BHsVn`: they used to be one field filled from the
 * settings, so a scratch server started from the live checkout — whose `.env` names the live
 * office's port — said it was answering on that port whatever port it had taken, and the runtime
 * page drew that. A person comparing the page with their address bar then saw a match that was
 * false.
 *
 * A PROCESS THAT HAS BOUND NOTHING SAYS SO. `api` is null and the gap carries the reason, which is
 * the file's second rule. Guessing the declared address for it would put back exactly the sentence
 * this fix removed.
 *
 * `envFile` IS THE CHECKOUT'S SETTINGS FILE AND DEFAULTS TO THE REAL ONE. Two fields below are read
 * from that file alone, ignoring the shell, and the default is what every caller in the product
 * uses. A test names its own so that it can write one and read the answer back, rather than
 * asserting against whatever the checkout it happens to be running in was configured with. Problem
 * `HmFM3B8A7k12`: `canonicalWebForOtherMachines` could be made always null with nothing failing,
 * because no test could put an address in front of it.
 */
/**
 * THE ADDRESS OTHER MACHINES REACH THIS ONE AT, AND IT IS READ HERE AND NOWHERE ELSE.
 *
 * THIS PROCESS'S SETTINGS, not `.env` alone, because the question is what THIS server is serving to
 * another machine. A scratch server started from the live checkout inherits that `.env`, and
 * answering out of it would have a scratch stack name an address it never bound. Null means nobody
 * set an address and every listener this process opened is on 127.0.0.1.
 *
 * WHY IT IS ITS OWN FUNCTION. The Runtime page and the Settings page's "Other computers" panel both
 * answer *can another machine reach this one*, and until 6 September 2026 they worked it out
 * separately: this file read the address, and `lib/access.ts` read `MOLE_OFFICE_REMOTE_PORT` alone
 * and never asked about the address at all. So on the owner's own machine the Runtime page named a
 * tailnet host and listed two machines with 2,414 requests between them, while the Settings panel in
 * the same minute said remote access was off and no other computer had ever opened Mole Office
 * (problem `XLES-b1vFBla`). One fact worked out in two places, which is the defect CLAUDE.md names
 * at the top of the file. Both now call this.
 *
 * WHY THE SETTING IS ENOUGH, AND A BOUND SOCKET IS NOT NEEDED HERE. `src/server/index.ts` refuses to
 * start when the address it names cannot be bound, and says so in its own words rather than
 * carrying on. So there is no state in which this process is answering and that address is not
 * bound, and reading the setting is reading what was bound.
 */
export function addressForOtherMachines(
  resolved: ReturnType<typeof settings>,
): RuntimeRecord['addresses']['forOtherMachines'] {
  return resolved.otherMachines === null
    ? null
    : {
        host: resolved.otherMachines.host,
        api: resolved.otherMachines.apiAddress,
        web: resolved.otherMachines.webAddress,
      }
}

export function addresses(
  gaps: Gaps,
  resolved: ReturnType<typeof settings>,
  envFile: string = ENV_FILE,
): RuntimeRecord['addresses'] {
  const at = theAddressThisProcessAnswersOn()
  const declaredApi = resolved.apiAddress
  const api = at === null ? null : addressText(at)
  if (at === null) {
    gaps.note(
      'the address this server answers on',
      'This process has not bound a socket, so there is no address to read. A server built for a test and driven ' +
        `with inject is in this state; its settings declare ${declaredApi}, which is what it WOULD take.`,
    )
  }
  const said = api === null || api === declaredApi ? null : saying('runtimeAddressDiffers', { api, declared: declaredApi })
  return {
    api,
    declaredApi,
    says: said === null ? null : inEnglish(said),
    saysSaid: said,
    web: resolved.webAddress,
    // Read from `.env` alone, ignoring this shell, exactly as `database.canonicalPath` is. See the
    // field's own note in src/shared/runtime.ts for what a page does with it.
    canonicalWeb: settings({}, envFile).webAddress,
    forOtherMachines: addressForOtherMachines(resolved),
    // FROM `.env` ALONE, ignoring this shell, exactly as `canonicalWeb` above is and for the same
    // reason: the page asks "was I opened on an address of the REAL Mole Office", and only the
    // checkout can answer that. A scratch stack knows its own address perfectly well.
    canonicalWebForOtherMachines: settings({}, envFile).otherMachines?.webAddress ?? null,
  }
}

// ------------------------------------------------------------------------------ the record

/** Everything this server knows about itself, read now. */
/**
 * WHETHER A KIMI CLI RUN STARTED HERE COULD REACH A MODEL, WITHOUT READING A KEY OUT LOUD.
 *
 * Three declared settings have to be there, and the fourth name is the owner's own name for the
 * key. `src/worker/runtimes/kimi.ts` builds a run's environment from the same declaration, so this
 * and the run cannot disagree about which names matter.
 *
 * WHAT IT NEVER DOES IS TOUCH A VALUE. It asks the declaration whether each name was set and keeps
 * the answer, which is a boolean and a name. The record this goes into is served to a page.
 *
 * A NAME SET TO AN EMPTY VALUE IS ITS OWN ANSWER. `readSetting` refuses one, because set-and-empty
 * and never-set are different statements. The refusal is caught here rather than failing the whole
 * read: a person asking what this server is should be told which variable is malformed, not handed
 * a 500.
 *
 * IT TAKES AN ENVIRONMENT SO THAT A TEST CAN BUILD ONE. The default is `.env` under the real
 * environment, which is what this server is running on. A test that deleted a name from
 * `process.env` and asked would still get the value out of `.env` — the trap
 * `src/config/settings.mjs` documents on `readSetting` — so the tests hand in an environment that is
 * empty because it was built empty, and the owner's own key is never read by one.
 */
export function kimiKeys(env: Record<string, string | undefined> = mergedEnvironment()): RuntimeKimi {
  const needed = [KIMI_SETTINGS.key, KIMI_SETTINGS.baseUrl, KIMI_SETTINGS.modelName]
  const missing: string[] = []
  const refused: string[] = []
  /** Was this name set to something? A refusal counts as neither set nor missing. */
  const wasSet = (name: string): boolean => {
    try {
      return readSetting(name, env).value !== null
    } catch {
      refused.push(name)
      return false
    }
  }
  // THE OFFICE'S OWN KEY FILE IS READ FIRST, and the two environment names only when nothing is set
  // there. Criterion U2. The file is where a key set on the Settings page goes; the names are what
  // keep an installation that already had one working. The sentence below says which was used.
  const fromTheFile = providerKeyFromTheOfficeFile('moonshot')
  const keyInTheFile = fromTheFile.value !== null
  const ownKey = wasSet(KIMI_SETTINGS.key)
  const ownersKey = wasSet(KIMI_SETTINGS.ownersKey)
  for (const name of needed) {
    if (name === KIMI_SETTINGS.key) {
      if (!keyInTheFile && !ownKey && !ownersKey) missing.push(name)
      continue
    }
    if (!wasSet(name)) missing.push(name)
  }
  const keyFrom = keyInTheFile
    ? "the office's key file for moonshot"
    : ownKey
      ? KIMI_SETTINGS.key
      : ownersKey
        ? KIMI_SETTINGS.ownersKey
        : null
  const key = keyFrom === null ? ('not set' as const) : ('set' as const)
  const mapped = keyInTheFile
    ? ` The office keeps its own Moonshot key in one file beside its database, so a key set on the Settings page is used first.`
    : keyFrom === KIMI_SETTINGS.ownersKey
      ? ` Kimi CLI does not read ${KIMI_SETTINGS.ownersKey}, so the adapter gives it to a run as ${KIMI_SETTINGS.key}.`
      : ''
  const stillNeeded =
    missing.length === 0
      ? ' It has everything else it needs.'
      : ` It still needs ${missing.join(' and ')}, and without those a run prints "LLM not set" and stops.`
  const malformed =
    refused.length === 0
      ? ''
      : ` ${refused.join(' and ')} ${refused.length === 1 ? 'is' : 'are'} set to an empty value, which is refused: set and empty is a different statement from not set at all.`
  const says =
    key === 'not set'
      ? `No Kimi key is set, under either ${KIMI_SETTINGS.key} or ${KIMI_SETTINGS.ownersKey}, so a Kimi run ` +
        `cannot reach a model.${stillNeeded}${malformed}`
      : keyInTheFile
        ? `A Kimi key is set, in the office's key file for moonshot.${mapped}${stillNeeded}${malformed}`
        : `A Kimi key is set, under ${String(keyFrom)}.${mapped}${stillNeeded}${malformed}`
  return { key, keyFrom, missing, refused, says }
}

/**
 * WHICH RUNS GO WHERE, ONE PLACE AT A TIME, AND WHICH TOOLS ARE ON THIS MACHINE. Criteria T7 and U2.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PAGE NEEDS THIS AND NOT ONE MODEL LINE
 * ---------------------------------------------------------------------------------------
 *
 * One model line for the whole office would say "opus" about a run that went to opencode, which
 * breaks the principle above USER.md's invariants: truth before convenience. Each place carries its
 * runtime, its model and its reasoning effort, and where each answer came from, so a person can
 * tell a thing they set from a thing nobody set.
 *
 * EVERY ANSWER COMES FROM `theModelARunGets`, the one reader the queue and the tools ask as well
 * (criterion U2). So the page cannot say one model while a run is given another.
 *
 * THE PLACES ARE THE ONES THE OFFICE STARTS A RUN FOR, and a builder for each role card. A notice is
 * not one: it starts no run. A check is one, and it always runs on claude-code inside
 * tools/the-inspector.mjs. A builder is drawn once per role card a secretary starts builders with,
 * from the Casting table's every-project row for it, even though the office does not start a builder
 * by itself.
 */
export function whereRunsGo(
  env: NodeJS.ProcessEnv = mergedEnvironment(),
): { places: RuntimePlace[]; installed: RuntimeTool[] } {
  const conversation = theModelARunGetsWithCodes({ place: 'conversation', role: null }, env)
  const check = theModelARunGetsWithCodes({ place: 'check', role: null }, env)
  // WHICH RUNTIMES ARE PASSED AN EFFORT is THE_WORKER_GIVES.aVariantTo, the one table the server refuses a stored effort
  // by. The saying's own words name opencode, and they are coded words of the developer pages.
  const variantFrom = (answered: TheModelARunGets & TheModelARunGetsSaid): DevSaying =>
    answered.runtime === null || !(THE_WORKER_GIVES.aVariantTo as readonly string[]).includes(answered.runtime)
      ? saying('effortOpencodeOnly', {})
      : answered.from === 'the settings file'
        ? whereTheChoreCameFromSaid('variant', env)
        : saying('effortWithTheModel', {})
  /** One answer as the page draws it: a name, the English sentence, and the same sentence as codes. */
  const said = (name: string | null, from: DevSaying[] | null, english: string) => ({ name, from: english, fromSaid: from })
  const effort = (answered: TheModelARunGets & TheModelARunGetsSaid, otherwise: RuntimePlace['variant']) =>
    answered.effort != null && answered.runtime !== 'dsh' ? said(answered.effort, answered.said, answered.says) : otherwise
  const inWords = (from: DevSaying[]) => from.map(inEnglish).join(' ')
  const conversationNote = [saying('placeConversationNote', {}), saying('placeNotices', {})]
  const builderNote = [saying('placeBuilderNote', {})]
  const conversationVariant = [variantFrom(conversation)]
  const checkVariant = check.variant === null ? saying('effortNoCheck', {}) : saying('effortWithTheModel', {})
  return {
    places: [
      {
        place: inEnglish(saying('placeConversation', {})),
        placeSaid: saying('placeConversation', {}),
        runtime: said(conversation.runtime, conversation.runtimeSaid, conversation.runtimeSays),
        model: said(conversation.model, conversation.said, conversation.says),
        variant: effort(conversation, said(conversation.variant, conversationVariant, inWords(conversationVariant))),
        says: inWords(conversationNote),
        saysSaid: conversationNote,
      },
      // ONE BUILDER PER ROLE CARD A SECRETARY STARTS BUILDERS WITH, each asked of its Casting row.
      ...BUILDER_ROLES.map((role) => {
        const one = theModelARunGetsWithCodes({ place: 'builder', role }, env)
        const runtime = one.runtime
        const runtimeFrom = [
          runtime === null ? saying('runtimeBuilderNobodyNames', {}) : saying('runtimeBuilderOnTheCasting', {}),
        ]
        const variant = [saying('effortNoBuilder', {})]
        return {
          place: inEnglish(saying('placeBuilder', { card: role })),
          placeSaid: saying('placeBuilder', { card: role }),
          runtime: said(runtime, runtimeFrom, inWords(runtimeFrom)),
          model: said(one.model, one.said, one.says),
          variant: effort(one, said(null, variant, inWords(variant))),
          says: inWords(builderNote),
          saysSaid: builderNote,
        }
      }),
      {
        place: inEnglish(saying('placeCheck', {})),
        placeSaid: saying('placeCheck', {}),
        runtime: said(check.runtime, check.runtimeSaid, check.runtimeSays),
        model: said(check.model, check.said, check.says),
        // THE CASTING ROW'S EFFORT GOES WITH ITS MODEL TO A CHECK (wave 13v round 27), and with none named the tool passes none.
        variant: said(check.variant, [checkVariant], inEnglish(checkVariant)),
        says: null,
        saysSaid: null,
      },
    ],
    installed: installedTools(env['PATH'], AGENT_RUNTIMES, whyTheOfficeCannotStartThisRuntime),
  }
}

/**
 * The processes `runtimeRecord` reads, for `readFirst` in lib/resources.ts: this server's own, the one above it, the
 * message worker this server started, when it started one, and those of the worker's runs in flight, in every project.
 */
export function theProcessesTheRuntimeRecordReads(): AProcessToRead[] {
  const worker = theWorkerWeStarted().pid
  return [
    ...[process.pid, process.ppid, ...(worker === null ? [] : [worker])].map((pid) => ({ pid, alsoItsStarterIfEnded: false })),
    ...theProcessesTheRunsInFlightRead(),
  ]
}

export function runtimeRecord(): RuntimeRecord {
  const gaps = new Gaps()
  const resolved = settings()
  const { facts, listeningOn } = processFacts(gaps)
  const repo = repository(gaps)
  const db = database()
  const port = resolved.apiPort
  const runsGo = whereRunsGo()
  const developmentCheckout = theWorldThisProcessIsIn().developmentCheckout
  return {
    ...(developmentCheckout === undefined ? {} : { developmentCheckout }),
    readAt: nowStamp(),
    process: facts,
    supervisor: supervisorOf(process.ppid, gaps, port),
    port,
    listeningOn,
    addresses: addresses(gaps, resolved),
    // READ FROM THE CALL LOG, not kept anywhere of its own. An empty list means nobody has called
    // from another machine, which is the ordinary state and is a reading rather than a gap.
    fromOtherMachines: clientsFromOtherMachines(),
    repository: repo,
    database: db,
    startedBy: startedBy(facts.pid, facts.pgid),
    worker: theWorker(),
    places: runsGo.places,
    installed: runsGo.installed,
    standing: standing(repo, db, facts.underTestRunner, port),
    freshness: freshness(gaps),
    settings: {
      envFile: resolved.envFile.path,
      envFileFound: resolved.envFile.found,
      sources: resolved.sources,
    },
    messageDoor: howTheMessageDoorIsSet(),
    replyReminder: howTheReplyReminderIsSet(),
    kimi: kimiKeys(),
    starts: recentStartCosts(),
    loopWatch: theLoopWatchNow(),
    couldNotRead: gaps.list,
  }
}

/**
 * WHAT A PAGE COMPARES OR SHOWS OF THE MACHINE READING, AND NOTHING ELSE, one string for each part.
 *
 * The server's look in src/server/api/events.ts takes this while a page is open and announces `machine.changed`
 * naming the parts whose string moved, wave 13w round 25. The parts are what
 * `compareThisPageWith` in src/web/lib/world.ts compares and what the "This computer" panels draw. Anything that moves
 * on its own, such as a time of reading or a count of requests, is left out, or every look would announce.
 *
 * IT READS LESS THAN `runtimeRecord`, ON PURPOSE: no process table, no git, no call log. What a page draws of those
 * is read when it loads, when its stream reconnects, and when somebody presses the Runtime page's button.
 */
export function whatAPageHoldsOfTheMachine(): Record<AMachinePart, string> {
  const gaps = new Gaps()
  const resolved = settings()
  const at = addresses(gaps, resolved)
  const db = database()
  const fresh = freshness(gaps)
  const failed = theFailedStartsOfThisCheckoutsSupervisor(resolved.apiPort)
  return {
    addresses: JSON.stringify([at.canonicalWeb, at.canonicalWebForOtherMachines, at.forOtherMachines?.web ?? null]),
    database: JSON.stringify([db.path, db.canonicalPath, db.canonical]),
    freshness: JSON.stringify([fresh.newestForThePage, fresh.newestFileForThePage, fresh.contentForThePage]),
    failedStarts: JSON.stringify(failed === null ? null : [failed.count, failed.lastExit, failed.at, failed.supervisor.pgid]),
    settings: JSON.stringify([howTheMessageDoorIsSet(), howTheReplyReminderIsSet()]),
  }
}

/**
 * The short form of this world, for a ledger row.
 *
 * A registered resource carries one of these so a row can say "a scratch API on port 29601 over
 * /tmp/…/gateP.db, checkout X, started by session Y" rather than only that a number was taken. It
 * is read at registration and never updated: it is what the world WAS when the row was written,
 * which is the fact a later reader needs.
 *
 * IT DOES NOT READ THE PROCESS TABLE OR THE OPEN SOCKETS, and that is deliberate rather than an
 * omission. None of the five facts here is about a pid or a port that is held: `standing` needs to
 * know only whether a test runner started this process, which is an environment variable. It used
 * to call `processFacts` and throw away everything but that one boolean, which cost an `ss` and a
 * `ps` — 42 of the 52 milliseconds this function took, measured in this checkout on 3 September
 * 2026. Criterion G3 puts this world on EVERY reply, so what it costs is what a reply costs.
 */
/** A world's standing as a ledger row keeps it: the kind and the English reasons, without the codes. */
function theStandingAlone(read: RuntimeStanding): RuntimeStanding {
  return { kind: read.kind, because: read.because }
}

export function worldNow(): World {
  const gaps = new Gaps()
  const resolved = settings()
  const repo = repository(gaps)
  const db = database()
  return {
    repository: repo.path,
    database: db.path,
    // The identity as well as the path, because a row that carries only a path cannot be compared
    // with a reply's world header, and a copy of a database keeps the path of whatever it is
    // restored over. It is worked out in one place and this reads it from there.
    databaseIdentity: databaseIdentity(db.path).id,
    port: resolved.apiPort,
    head: repo.head?.short ?? null,
    // THE READING THAT INCLUDES THE PROCESS TREE, not the environment alone. A server the suite
    // spawned with `VITEST` unset is still the suite's, and this is the sentence that says so —
    // `whatKindOfWorldThisIs` reads it to decide whether the world is a test's, and the office reads
    // the same question through `aTestRunnerIsBehindThisProcess`. One reading, in one place.
    standing: theStandingAlone(standing(repo, db, aTestRunnerIsBehindThisProcess(), resolved.apiPort)),
    readAt: nowStamp(),
    saidBy: 'the process itself, reading its own checkout, database and commit',
  }
}
