// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BUS: UP TO EIGHT ENTRIES, ONE SUITE. Which entries ride with this one, a result borrowed from a bus, and whose each
 * file still red in a bus's suite is. Part of the merge tool, tools/the-merger.mjs.
 *
 * The bus rule grew the secretary's pair (item 4) into a bus: a released entry waits for
 * others of its lane, and the whole suite runs once for at most MOLE_OFFICE_BUS_MOST_ENTRIES of them (8, the owner's cap
 * since the bus rule raised the four), or
 * MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS (1800) after the first was released, whichever comes first. The entry whose run
 * holds the lane drives the bus; the others ride in the lane's order, and each borrows on its own turn what the bus
 * decided for it, on exactly the tree it then has. A pair is a bus with one rider, and says what a pair always said.
 * It takes what it needs of the office from its caller, as testing.mjs passes office-keeper.mjs's functions and
 * arguments.mjs's THE_BUS_READS.
 */

import './a-library-is-not-a-program.mjs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { readMutationMarkers } from '../../tests/applied-mutations.ts'
import { replayArguments } from '../../src/shared/merge/landed-history.mjs'
import { MERGE_STATE_SPECS, aResolutionPassedItsCheck, isALineFile } from '../../src/shared/merge-queue.ts'
import { aPluginOnlyChange, PLUGINS_FOLDER } from '../../src/shared/plugin-change.ts'
import { localStamp, momentOfAStoredStamp } from '../../src/shared/time.ts'
import { isTheQueuesOwnCode } from './the-queues-own-code.mjs'
import { ABSENT, API, THIS_CHECKOUT, WORKDIR, WORKSPACE, chosen } from './arguments.mjs'
import { fail, log } from './log-and-state.mjs'
import { changedBetween, checkBeforeATool, git, gitBytes, gitIn, hashAt, linkNodeModules, tryGit } from './git.mjs'
import { whetherTheQueuesOwnCodeMayRide } from './the-stable-office.mjs'
import { asItLands, failuresSaid, inGitsOwnFormat, regenerateOnTop, runChecker, touchedBetween } from './integrate.mjs'
import { generatedPathsOf } from './documents.mjs'
import { whetherTheEntrysVersionStands } from './generated-regions.mjs'
import { linesMeetOn, ownLinesOn } from './lines.mjs'
import { THE_JOURNAL, joinTheJournalInThisClone, theJournalDecided, whereTheJournalsDisagree } from './journal-join.mjs'
import { runAlone, whatTheRunSaid, whyARunGaveNoResult } from './red-files.mjs'
import { theMigrationsBehind } from './migrations.mjs'

/** What the bus functions say when their caller leaves out an office function they need. */
export const THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS = "aBusFor needs theLane, sleep, countAGateMet, theOfficesRuntime and runInSandbox, aResultToBorrow and aCollisionNaming need theLane, and whatTheBusDecides needs runInSandbox and keepTheReport, from their caller, as testing.mjs passes office-keeper.mjs's, so that pairs.mjs reaches no office module itself."

/** What theBusRules and aBusFor say when their caller leaves out one of the bus reads they need. */
export const THE_BUS_NEEDS_THE_SETTING_READS = "theBusRules needs mostEntries, leavesAfterSeconds and bounds, and aBusFor needs those and queueCodeRidesABus, from their caller, as testing.mjs passes arguments.mjs's THE_BUS_READS, so that pairs.mjs reads no setting itself."

// ============================================================================ the bus's two numbers

/** The three bus reads a caller must give, or THE_BUS_NEEDS_THE_SETTING_READS. Shared by theBusRules and aBusFor. */
function theBusReads(reads) {
  const { mostEntries, leavesAfterSeconds, bounds } = reads ?? {}
  const aRead = (one) => typeof one?.given === 'function' && typeof one?.fallback === 'function'
  if (!aRead(mostEntries) || !aRead(leavesAfterSeconds) ||
      bounds === null || typeof bounds !== 'object' || typeof bounds.fewest !== 'number' || typeof bounds.most !== 'number') {
    throw new Error(THE_BUS_NEEDS_THE_SETTING_READS)
  }
}

/**
 * THE BUS'S TWO NUMBERS, read from what its caller gives it: how many entries it may hold, and how long after its first
 * entry was released it leaves. A value the setting cannot use is said in the log, and its default is used.
 */
export function theBusRules({ mostEntries, leavesAfterSeconds, bounds } = {}) {
  theBusReads({ mostEntries, leavesAfterSeconds, bounds })
  const read = (name, one, ok) => {
    const fallback = Number(one.fallback())
    const given = String(one.given() ?? '').trim()
    const value = /^[0-9]+$/u.test(given) ? Number(given) : Number.NaN
    if (ok(value)) return value
    const why = value > bounds.most && name === 'MOLE_OFFICE_BUS_MOST_ENTRIES'
      ? `: the technical limit is ${String(bounds.most)} entries`
      : ''
    log(`${name} is "${given}", which it cannot use${why}, so the bus uses ${String(fallback)}.`)
    return fallback
  }
  return {
    most: read('MOLE_OFFICE_BUS_MOST_ENTRIES', mostEntries, (n) => Number.isInteger(n) && n >= bounds.fewest && n <= bounds.most),
    leavesAfterSeconds: read('MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS', leavesAfterSeconds, (n) => Number.isSafeInteger(n) && n >= 0 && n * 1000 <= 2_147_483_647),
  }
}

/**
 * THE STATES AN ENTRY OF THE LANE CAN STILL BE JUDGED FROM, and so board a bus that is waiting:
 * submitted (the pin slot pins it) and pinned (the check judges it). The bus waits only while an entry it has not seen
 * is in one of them.
 *
 * NOT REINSPECTING (wave 13u, item 53). A check again lets the lane go so other entries may land while it runs, and it
 * can wait more than an hour for somebody to start it. A bus that waited for it would hold the lane on that check. An
 * entry released meanwhile is judged again, and the bus's next look tries it like any judged entry.
 */
const CAN_STILL_BE_JUDGED = ['submitted', 'pinned']

/**
 * WHEN AN ENTRY BOARDED: when its check released it, as a moment, with `released` false when that cannot be read and the
 * bus counts from now instead. It is read from machine.verdict.time, the clock observation the office copied beside
 * machine.verdict.at. The local stamp repeats an hour when the clocks go back: read as it stands, a verdict written at
 * 01:10 GMT reads an hour old, and the bus would leave at once without waiting for riders. A verdict written before
 * `time` was stored has only `at`. It is read as its one moment in the zone of this machine's clock, which is the
 * office's, and it has none in the hour the clocks go back or the hour they skip.
 */
export function whenItBoarded(entry) {
  const verdict = entry.machine?.verdict
  const at = momentOfAStoredStamp(verdict?.at, verdict?.time)
  return at === null ? { at: Date.now(), released: false } : { at, released: true }
}

/** The latest a waiting bus leaves, in words: the time, and what the wait counts from as `whenItBoarded` read it. */
export function theLatestItLeaves(boarded, seconds) {
  const at = localStamp(new Date(boarded.at + seconds * 1000))
  return boarded.released
    ? `at ${at}, ${String(seconds)} s after this entry was released`
    : `at ${at}, ${String(seconds)} s after the bus started to wait, because when this entry was released cannot be read`
}

/** "merge entry X" or "merge entries X, Y and Z". */
function entriesNamed(ids) {
  if (ids.length === 1) return `merge entry ${ids[0]}`
  return `merge entries ${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`
}

// ============================================================================ who rides

/**
 * THE ENTRIES THAT RIDE WITH THIS ONE, AND THE BUS'S TREE, or why none. An entry that changes the queue's own code is
 * tested alone, and waits for nobody, unless the office and the merge tool both run from outside the lane's checkout
 * and the switch MOLE_OFFICE_QUEUE_CODE_RIDES_A_BUS is 1 (13u round 66). Otherwise each judged entry of the lane is tried
 * when the bus first sees it, the ones seen at one look in the lane's order, on the tree the riders before it made,
 * under these conditions: git entries only; none changes the queue's own code, under the same rule; its commits go onto
 * the bus's tree without a conflict; every path its release read holds exactly that
 * content there, except a path an entry already aboard also changes; the git checker passes it; and no marker of a
 * mutation proof is left in it. The tree is built as landing them in order would build it: this entry's result, then
 * each rider's commits and what the queue regenerates for it.
 *
 * THE BUS COUNTS ONLY THE ENTRIES THAT RIDE (wave 13p round 23). It waits until MOLE_OFFICE_BUS_MOST_ENTRIES entries
 * are aboard, or until MOLE_OFFICE_BUS_LEAVES_AFTER_SECONDS have passed since this entry was released, whichever comes
 * first, asking the lane again every --slot-every seconds. It leaves at once when entries of the lane are judged and
 * none of them can ride, or when one stops the boarding: the limit is the longest it waits for riders that can come,
 * never a wait for entries that cannot ride. One run counted two judged entries aboard before trying them,
 * waited the whole 30 minutes, and left alone.
 *
 * IT WAITS ONLY FOR ENTRIES THAT CAN STILL BE JUDGED (agreed with the merge tool's keeper).
 * Those are the entries of the lane it has not seen that are submitted or pinned. The log names them by
 * id, and the bus leaves at once when none is left. The time limit stays the longest it waits.
 *
 * A RIDER THAT LEAVES JUDGED NO LONGER COUNTS (the coordinator's follow-up). At each look a rider that is no
 * longer judged in the lane, because it was withdrawn, superseded or sent to a check again, is taken off. It is passed
 * over from then on: still in the lane, the files its release read keep the riders behind it off them, and gone, it
 * keeps nobody off. The bus's tree is built again from that rider on, the riders behind it boarding again in their
 * order. When no rider is left the bus leaves at once. The time limit still counts from this entry's release.
 *
 * A FILE TWO ENTRIES CHANGE RIDES WHEN GIT MERGES IT (wave 13p round 23). The rebase is git's three-way merge on the
 * bus's own tree, so an entry whose commits go on without a conflict rides though an entry aboard changes the same
 * file; a conflict still keeps it off. Such a file then holds both entries' changes, which is not what the rider's
 * release read, so at the rider's own turn its integrate step asks for a check again of that file (decision R2: the
 * verdict follows file content), and it borrows this bus's result only after that check releases it. It would need
 * that check at its turn without the bus too, because this entry changes the file before it lands.
 *
 * A LINE FILE IS JUDGED BY LINE (the line rule). For a file on the list of line files, what keeps an entry off,
 * whether the other change is a rider's, this entry's result or one passed over ahead, is lines that meet, or a conflict.
 * Its own lines standing unchanged on the bus's tree, with no other line meeting them, hold what its release read, so
 * they need no check here and none at its own turn. Every refusal and log line names the rule that judged each path.
 *
 * AN ENTRY THAT CANNOT BOARD DOES NOT KEEP THE ONES BEHIND IT OFF (wave 13p round 23). It is passed over, and the
 * office then hands the riders the lane before it (`whyTheMergeToolWaits` in src/server/lib/merge-queue.ts), so a
 * rider can land on the tree this bus tested and borrow its result. An entry behind it boards only if it changes none
 * of the files the passed-over one's release read, so the one passed over never meets a conflict at its own turn that
 * an entry submitted after it made. An entry passed over whose files are not known stops the boarding there, as every
 * refusal did before.
 */
/** The words that name decision R2 where it judged a path. */
const BY_FILE = '(by file, decision R2)'
/** The rule a joined migration journal is held or kept off by (wave 13v round 18): its rows, judged again by a program. */
const BY_JOIN = (said) => `(by join, wave 13v round 18: ${said})`

/** Why b is kept off by entries passed over ahead of it, each path with the rule that judged it. */
function keptOffByOneAhead(b, overlaps) {
  return `${b.id} changes ${overlaps.map((one) => `${one.path}, which ${one.entry} also changes ${one.rule}`).join('; ')}, and ${overlaps[0].entry} is ahead of it and not aboard`
}

/**
 * THE LINE FILES WHERE ENTRY b'S OWN LINES MEET THOSE OF AN ENTRY PASSED OVER AHEAD OF IT (the line rule).
 * `overlaps` are the paths both read. Each line file is compared on the bus's tree `tip`; one whose lines do not meet
 * no longer keeps b off. An entry passed over whose commits are not known (a files entry) keeps b off as by file.
 */
function whereLinesMeetOnesAhead(clone, tip, b, overlaps) {
  const met = []
  for (const one of overlaps.filter((each) => isALineFile(each.path))) {
    if (one.one.base === undefined || !tryGit(clone, ['cat-file', '-e', `${one.one.commit}^{commit}`]).ok) {
      met.push({ ...one, rule: `(by line: the lines of ${one.entry} cannot be read here, so it is judged as by file)` })
      continue
    }
    const said = linesMeetOn(clone, one.path, tip, { base: b.changeset.base, commit: b.changeset.commit }, { base: one.one.base, commit: one.one.commit })
    if (said.meet) met.push({ ...one, rule: `(by line: ${said.why})` })
    else log(`${b.id} and ${one.entry}, passed over ahead of it, both change ${one.path}, and their lines do not meet (its own ${said.ranges}; theirs ${said.theirs}): it is not kept off by line`)
  }
  return met
}

/**
 * WHERE ENTRY b'S MIGRATION JOURNAL DISAGREES WITH THAT OF AN ENTRY PASSED OVER AHEAD OF IT (wave 13v round 18). Both
 * journals join when no tag is two rows and no index is two tags, and the joined file is checked again whenever either
 * lands, so a journal both change does not keep b off by file. One whose rows disagree does, and so does one whose
 * commits are not known.
 */
function whereJournalsMeetOnesAhead(clone, b, overlaps) {
  const met = []
  const journalAt = (commit) => git(clone, ['show', `${commit}:${THE_JOURNAL}`])
  for (const one of overlaps.filter((each) => each.path === THE_JOURNAL)) {
    if (one.one.commit === undefined || !tryGit(clone, ['cat-file', '-e', `${one.one.commit}:${THE_JOURNAL}`]).ok || !tryGit(clone, ['cat-file', '-e', `${b.changeset.commit}:${THE_JOURNAL}`]).ok) {
      met.push({ ...one, rule: BY_JOIN(`the journal of ${one.entry} or of ${b.id} cannot be read here, so it is judged as by file`) })
      continue
    }
    const disagree = whereTheJournalsDisagree(journalAt(b.changeset.commit), journalAt(one.one.commit))
    if (disagree !== null) met.push({ ...one, rule: BY_JOIN(`their journals disagree: ${disagree}`) })
    else log(`${b.id} and ${one.entry}, passed over ahead of it, both change ${THE_JOURNAL}, and no row of the two disagrees: it is not kept off by file (by join, wave 13v round 18)`)
  }
  return met
}

/**
 * WHETHER b'S MIGRATION JOURNAL HOLDS BY JOIN on the bus's tree (wave 13v round 18): the journal at Bprime holds every row
 * of b's journal and of the tip's, and no other (journal-join.mjs, the same check the entry's own integration makes).
 */
function byJoinOnTheBus(clone, b, tip, Bprime, unlike) {
  const held = new Set()
  const rule = new Map()
  if (!unlike.includes(THE_JOURNAL)) return { held, rule }
  const journalAt = (at) => (tryGit(clone, ['cat-file', '-e', `${at}:${THE_JOURNAL}`]).ok ? git(clone, ['show', `${at}:${THE_JOURNAL}`]) : null)
  const { decided, why } = theJournalDecided(journalAt, { entry: b.changeset.commit, onto: tip, result: Bprime })
  if (decided === null) rule.set(THE_JOURNAL, BY_JOIN(`not held: ${why}`))
  else {
    held.add(THE_JOURNAL)
    rule.set(THE_JOURNAL, BY_JOIN(decided.detail))
  }
  return { held, rule }
}

/**
 * WHICH OF b'S PATHS THAT WOULD NOT HOLD WHAT ITS RELEASE READ STILL HOLD BY LINE on the bus's tree (the line rule):
 * a line file whose own lines git put on `tip` unchanged, with no other line meeting them. `rule` names,
 * path by path, the rule and the lines, for the refusal and the log.
 */
function byLineOnTheBus(clone, b, tip, Bprime, unlike) {
  const held = new Set()
  const rule = new Map()
  for (const path of unlike.filter((each) => isALineFile(each))) {
    const found = ownLinesOn(clone, { base: b.changeset.base, commit: b.changeset.commit, path, onto: tip, joined: Bprime })
    if (found.held) {
      held.add(path)
      rule.set(path, `(by line: its own lines (${found.ranges}) stand unchanged and no other line meets them)`)
    } else rule.set(path, `(by line: ${found.why})`)
  }
  return { held, rule }
}

/**
 * WHICH OF b'S GENERATED FILES THAT WOULD NOT HOLD WHAT ITS RELEASE READ STILL HOLD BY REGION on the bus's tree (round
 * 29, agreed with the queue owner): a generated file the entry changed only outside its marker
 * pairs, where `tip` changed it only inside them. It is a list of its own, beside the line files', and `rule` names, path
 * by path, why each stands or does not.
 */
function byRegionOnTheBus(clone, b, tip, unlike, generated) {
  const held = new Set()
  const rule = new Map()
  const textAt = (commit, path) => (hashAt(clone, commit, path) === null ? null : gitBytes(clone, ['cat-file', 'blob', `${commit}:${path}`]).toString('utf8'))
  for (const path of unlike.filter((each) => generated.includes(each))) {
    const found = whetherTheEntrysVersionStands({ base: textAt(b.changeset.base, path), entry: textAt(b.changeset.commit, path), main: textAt(tip, path) })
    if (found.stands) {
      held.add(path)
      rule.set(path, '(by region, round 29: the entry changed only lines outside its marker pairs, and the tip changed only lines inside them)')
    } else rule.set(path, `(by region, round 29: ${found.why})`)
  }
  return { held, rule }
}

/**
 * WHETHER AN ENTRY THAT CHANGES THE QUEUE'S OWN CODE MAY RIDE A BUS ON `root`, as the first entry or a rider (13u round
 * 66; the cases are in the-stable-office.mjs). The switch is counted each time such an entry is met. The office is asked
 * where it runs from, as a landing asks it, only when the switch is 1.
 */
async function theQueuesOwnCodeMayRide(root, { countAGateMet, theOfficesRuntime, queueCodeRidesABus }) {
  const { setting, position } = queueCodeRidesABus()
  await countAGateMet('queue-code-rides-a-bus', position)
  const runtime = position === '1' ? await theOfficesRuntime() : null
  return whetherTheQueuesOwnCodeMayRide({ root, position, setting, runtime, tool: THIS_CHECKOUT })
}

export async function aBusFor(entry, integrated, sandbox, { theLane, sleep, countAGateMet, theOfficesRuntime, runInSandbox, reads } = {}) {
  if (typeof theLane !== 'function' || typeof sleep !== 'function' || typeof countAGateMet !== 'function' || typeof theOfficesRuntime !== 'function' || typeof runInSandbox !== 'function') throw new Error(THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS)
  theBusReads(reads)
  if (typeof reads.queueCodeRidesABus !== 'function') throw new Error(THE_BUS_NEEDS_THE_SETTING_READS)
  const root = entry.changeset.root
  // AN ENTRY THAT NAMES ITS OWN SUITE WORKERS IS TESTED ALONE (the suite-workers rule), so a trial of a count measures one entry.
  if (entry.suiteWorkers !== undefined) return { none: `this entry names its own ${String(entry.suiteWorkers.count)} suite workers, so it is tested alone` }
  const own = changedBetween(integrated.clone, integrated.M, integrated.Cfinal)
  if (own.some((path) => isTheQueuesOwnCode(path))) {
    const ride = await theQueuesOwnCodeMayRide(root, { countAGateMet, theOfficesRuntime, queueCodeRidesABus: reads.queueCodeRidesABus })
    if (!ride.rides) return { none: `this entry changes the queue's own code, and ${ride.says}` }
    log(`this entry changes the queue's own code, and ${ride.says}`)
  }
  let rules = theBusRules(reads)
  if (rules.most === 1) return { none: 'MOLE_OFFICE_BUS_MOST_ENTRIES is 1, so every entry is tested alone' }
  const boarded = whenItBoarded(entry)
  let leavesAt = boarded.at + rules.leavesAfterSeconds * 1000
  const clone = join(sandbox.folder, 'work', 'pair')
  const generated = generatedPathsOf(integrated.clone, integrated.Cfinal)
  const changed = new Set(own)
  const riders = []
  const passed = []
  const seen = new Set()
  // THE BUS'S ONE INSTANT, read as it starts, in the format a landing is dated in. What the queue regenerates for each
  // rider reads the history as that rider would land at this instant, so a rider that integrates on the bus's day has
  // the tree the bus tested and borrows its result. Across midnight the trees differ, and that rider runs its
  // own suite.
  const landingAt = inGitsOwnFormat(Date.now())
  let tip = integrated.Cfinal
  let cloned = false
  let linked = false
  let stopped = null
  /** What each look did, in order: a rider boarded (with the bus as it stood before), or an entry passed over. */
  const looked = []
  /** The entries the bus waits for at its last look: unseen, and in a state they can still be judged from. */
  let waitingFor = []
  /** The lane's entries in its own order at the last look, which is the order the office hands the lane on in. */
  let laneOrder = []

  /**
   * Why entry b cannot ride, as `{ why }`, or null once it is aboard. A refusal because files its release read would
   * change on the bus's tree says so as a fact, `needsACheck: true`, which the office reads (the merge tool's keeper);
   * nothing finds that case by its sentence, which is for the log. So does a refusal because b is tested alone,
   * `alone: true`.
   */
  const board = async (b) => {
    const first = riders.length === 0
    const onto = first ? "this entry's result" : "the bus's tree"
    if (b.changeset?.adapter !== 'git') return { why: `${b.id} is a files entry, which has no suite` }
    if (b.repairOf !== undefined) return { why: 'a hand-back repair is tested alone', alone: true }
    if (b.suiteWorkers !== undefined) return { why: `${b.id} names its own ${String(b.suiteWorkers.count)} suite workers, so it is tested alone`, alone: true }
    if (aResolutionPassedItsCheck(b.machine?.resolution)) return { why: `${b.id} carries a resolution its supervisor made, which its own turn integrates, so it is tested alone`, alone: true }
    const judged = b.machine?.judged
    if (judged === undefined || judged === null) return { why: `${b.id} holds no judged content` }
    const theirsPassed = passed.flatMap((one) => one.read.filter((path) => Object.hasOwn(judged, path) && !generated.includes(path)).map((path) => ({ path, entry: one.entry, one })))
    // A FILE THAT IS NOT A LINE FILE KEEPS IT OFF AT ONCE, by file; a line file only once git has compared the lines.
    const byFile = theirsPassed.filter((one) => !isALineFile(one.path) && one.path !== THE_JOURNAL)
    if (byFile.length > 0) return { why: keptOffByOneAhead(b, byFile.map((one) => ({ ...one, rule: BY_FILE }))) }
    if (!cloned) {
      rmSync(clone, { recursive: true, force: true })
      git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, clone])
      git(clone, ['fetch', '--quiet', '--no-tags', integrated.clone, integrated.Cfinal])
      // THE MIGRATION JOURNAL IS JOINED BY ITSELF here as in an entry's own integration clone (journal-join.mjs).
      joinTheJournalInThisClone(clone, (pair) => git(clone, ['config', ...pair]))
      cloned = true
    }
    if (!tryGit(clone, ['cat-file', '-e', `${b.changeset.commit}^{commit}`]).ok) return { why: `the commit of ${b.id} is not in ${root}` }
    const met = [...whereLinesMeetOnesAhead(clone, tip, b, theirsPassed), ...whereJournalsMeetOnesAhead(clone, b, theirsPassed)]
    if (met.length > 0) return { why: keptOffByOneAhead(b, met) }
    git(clone, ['checkout', '--quiet', '--detach', b.changeset.commit])
    // LINKED BEFORE ANYTHING RUNS IN IT, as an entry's own integrate step links its clone: the generator may need it.
    if (!linked) {
      linkNodeModules(root, clone)
      linked = true
    }
    if (!tryGit(clone, replayArguments(gitIn(clone), tip, b.changeset.base)).ok) {
      tryGit(clone, ['rebase', '--abort'])
      return { why: `the commits of ${b.id} do not go onto ${onto} without a conflict` }
    }
    const Bprime = git(clone, ['rev-parse', '--verify', 'HEAD^{commit}'])
    const theirs = changedBetween(clone, tip, Bprime)
    if (theirs.some((path) => isTheQueuesOwnCode(path))) {
      const ride = await theQueuesOwnCodeMayRide(root, { countAGateMet, theOfficesRuntime, queueCodeRidesABus: reads.queueCodeRidesABus })
      if (!ride.rides) return { why: `${b.id} changes the queue's own code, and ${ride.says}`, alone: true }
      log(`${b.id} changes the queue's own code, and ${ride.says}`)
    }
    // A PLUGIN-ONLY CHANGE DOES NOT RIDE (the plugin-lane rule): it would borrow the office suite's result for
    // the bus's tree, and the plugin's own check would never run on it. It is tested by that check at its own turn
    // (plugin-lane.mjs).
    const plugin = aPluginOnlyChange(theirs)
    if (plugin !== null) return { why: `${b.id} changes only ${PLUGINS_FOLDER}/${plugin.id}, which that plugin's own check tests, so it is tested alone`, alone: true }
    // A MIGRATION BEHIND THE BUS'S NEWEST IS NOT RENUMBERED ON THE BUS (wave 13v round 23): the tree the bus tests would
    // not be the tree that lands, because the entry's own integration renumbers it. So it rides alone.
    if (theirs.includes(THE_JOURNAL)) {
      const behind = theMigrationsBehind(JSON.parse(gitBytes(clone, ['show', `${tip}:${THE_JOURNAL}`]).toString('utf8')), JSON.parse(gitBytes(clone, ['show', `${Bprime}:${THE_JOURNAL}`]).toString('utf8')))
      if (behind.length > 0) return { why: `${b.id} adds ${behind.map((row) => row.tag).join(', ')} behind the newest migration on ${onto}, which its own integration renumbers, so it is tested alone`, alone: true }
    }
    const both = theirs.filter((path) => changed.has(path) && !generated.includes(path))
    const unlike = Object.entries(judged)
      .filter(([path, hash]) => (hashAt(clone, Bprime, path) ?? ABSENT) !== hash)
      .map(([path]) => path)
      .sort()
    const lines = byLineOnTheBus(clone, b, tip, Bprime, unlike)
    const regions = byRegionOnTheBus(clone, b, tip, unlike, generated)
    const journal = byJoinOnTheBus(clone, b, tip, Bprime, unlike)
    const ruleOf = (path) => lines.rule.get(path) ?? regions.rule.get(path) ?? journal.rule.get(path) ?? BY_FILE
    const held = (path) => lines.held.has(path) || regions.held.has(path) || journal.held.has(path)
    const elsewhere = unlike.filter((path) => !both.includes(path) && !held(path))
    if (elsewhere.length > 0) {
      return {
        why: `on ${onto}, ${elsewhere.join(', ')} of ${b.id} would not hold what its release read, so it would need a check: ${elsewhere.map((path) => `${path} ${ruleOf(path)}`).join('; ')}`,
        needsACheck: true,
      }
    }
    checkBeforeATool(clone)
    const checker = runChecker('git-changeset.mjs', ['--repo', clone, '--base', tip, '--head', Bprime, '--scratch', join(WORKDIR, 'pair-checks')], {
      MOLE_OFFICE_API: API,
      MOLE_OFFICE_WORKSPACE: WORKSPACE,
    })
    if (checker.failed.length > 0) return { why: `the git checker refuses ${b.id} on ${onto}: ${failuresSaid(checker.failed).slice(0, 300)}` }
    if (readMutationMarkers(clone).length > 0) return { why: `an applied mutation marker is left in the tree ${b.id} makes on ${onto}` }
    const { Cfinal: regenerated } = await regenerateOnTop(clone, tip, Bprime, touchedBetween(clone, tip, Bprime), sandbox, b.id, { landingAt, runInSandbox })
    // THE NEXT RIDER IS STACKED ON ONE COMMIT OF THIS RIDER'S TREE, dated by the bus's instant, as main holds this rider
    // once it lands. Its replay keeps each commit's own day, so a later rider's audit table written on it would date this
    // rider's tests by those days, and that rider's own landing would have another tree.
    const T = asItLands(clone, tip, regenerated, landingAt, `Merge entry ${b.id} as it lands at the bus's instant`)
    looked.push({ rider: b.id, tip, changed: new Set(changed), passedBefore: passed.length })
    riders.push({ b, T, tree: git(clone, ['rev-parse', `${T}^{tree}`]) })
    for (const path of theirs) changed.add(path)
    tip = T
    const byFileStill = unlike.filter((path) => !held(path))
    if (both.length > 0) {
      log(
        `${b.id} rides though an entry aboard also changes ${both.join(', ')}: git put its commits on ${onto} without a conflict. ` +
          `${byFileStill.length === 0 ? "On this bus's tree its files hold what its release read" : `On this bus's tree ${byFileStill.join(', ')} will not hold what its release read, so it borrows this bus's result only after a check of ${byFileStill.length === 1 ? 'that file' : 'those files'} releases it again: ${byFileStill.map((path) => `${path} ${ruleOf(path)}`).join('; ')}`}`,
      )
    }
    for (const path of lines.held) log(`${b.id} rides, and on ${onto} its own lines of ${path} stand unchanged: ${lines.rule.get(path)}`)
    for (const path of regions.held) log(`${b.id} rides, and on ${onto} its version of ${path} stands: ${regions.rule.get(path)}`)
    for (const path of journal.held) log(`${b.id} rides, and on ${onto} ${path} holds every row of each side: ${journal.rule.get(path)}`)
    return null
  }

  /** Passes over entry b for `reason`, or stops the boarding at it when the files its release read are not known. */
  const passOver = (b, { why, needsACheck = false, alone = false }) => {
    const read = b.machine?.judged === undefined || b.machine?.judged === null ? null : Object.keys(b.machine.judged)
    if (read === null) {
      stopped = { entry: b.id, why }
      return
    }
    const one = { entry: b.id, why, read, needsACheck, alone, ...(b.changeset?.adapter === 'git' ? { base: b.changeset.base, commit: b.changeset.commit } : {}) }
    passed.push(one)
    looked.push({ passed: one })
    log(`the bus passes over merge entry ${b.id}: ${why}. While this is the lane's newest bus, the office hands the lane to each of its riders that is judged and marked for the merge tool before ${b.id}`)
  }

  /**
   * Takes off each rider that is no longer judged in the lane, and builds the bus again from the first of them: the
   * looks before it stand, a rider taken off is passed over where it boarded, and the riders after it board again.
   */
  const dropWhoLeftJudged = async (lane) => {
    const judgedNow = new Map(lane.filter((one) => one.state === 'judged').map((one) => [one.id, one]))
    const from = looked.findIndex((one) => one.rider !== undefined && !judgedNow.has(one.rider))
    if (from === -1) return
    const again = looked.splice(from)
    riders.splice(looked.filter((one) => one.rider !== undefined).length)
    tip = again[0].tip
    changed.clear()
    for (const path of again[0].changed) changed.add(path)
    passed.splice(again[0].passedBefore)
    for (const one of again) {
      if (one.passed !== undefined) {
        passed.push(one.passed)
        looked.push(one)
      } else if (judgedNow.has(one.rider)) {
        const said = await board(judgedNow.get(one.rider))
        if (said !== null) passOver(judgedNow.get(one.rider), { ...said, why: `on the bus built again, ${said.why}` })
      } else {
        const still = lane.find((b) => b.id === one.rider)
        const gone = still === undefined || MERGE_STATE_SPECS[still.state]?.final === true
        const why = `${one.rider} left judged after it boarded (${still === undefined ? 'it is no longer in the lane' : `it is ${still.state}`}), so it no longer rides`
        if (gone) {
          const off = { entry: one.rider, why, read: [], needsACheck: false, alone: false }
          passed.push(off)
          looked.push({ passed: off })
          log(`the bus takes merge entry ${one.rider} off: ${why}. It will not land, so it keeps nobody off`)
        } else passOver(still, { why })
      }
      if (stopped !== null) return
    }
  }

  /** One look at the lane: who left judged, then each judged entry the bus has not seen, then who it still waits for. */
  const look = async () => {
    rules = theBusRules(reads)
    leavesAt = boarded.at + rules.leavesAfterSeconds * 1000
    const lane = (await theLane(root)).filter((one) => one.id !== entry.id)
    laneOrder = lane.map((one) => one.id)
    await dropWhoLeftJudged(lane)
    for (const b of lane.filter((one) => one.state === 'judged')) {
      if (riders.length >= rules.most - 1 || stopped !== null) break
      if (seen.has(b.id)) continue
      seen.add(b.id)
      const said = await board(b)
      if (said !== null) passOver(b, said)
    }
    waitingFor = lane.filter((one) => !seen.has(one.id) && CAN_STILL_BE_JUDGED.includes(one.state)).map((one) => one.id)
  }

  const mayWait = () =>
    riders.length < rules.most - 1 && stopped === null && !(seen.size > 0 && riders.length === 0) && waitingFor.length > 0 && Date.now() < leavesAt
  /** The waiting line: how full the bus is, whom it waits for by id, and when it leaves. */
  const waitingLine = () =>
    `the bus waits for more riders: ${String(riders.length + 1)} of ${String(rules.most)} aboard, counting only entries that can ride. ` +
    `It waits for ${entriesNamed(waitingFor)}, which can still be judged. ` +
    `It leaves when it holds ${String(rules.most)}, or ${theLatestItLeaves(boarded, rules.leavesAfterSeconds)}, whichever comes first, ` +
    'and at once when none of those is left to wait for, if entries of the lane are judged and none of them can ride, or if one stops the boarding'
  await look()
  let said = null
  while (mayWait()) {
    rules = theBusRules(reads)
    leavesAt = boarded.at + rules.leavesAfterSeconds * 1000
    if (!mayWait()) break
    const line = waitingLine()
    if (line !== said) log(line)
    said = line
    await sleep(Math.max(0, Math.min(chosen.slotEvery * 1000, leavesAt - Date.now())))
    await look()
  }
  if (riders.length < rules.most - 1 && stopped === null && !(seen.size > 0 && riders.length === 0) && waitingFor.length === 0 && Date.now() < leavesAt) {
    log('the bus leaves now: no entry of the lane that it has not seen can still be judged, so nobody is left to board')
  }
  if (riders.length === 0) {
    if (seen.size === 0) return { none: 'no other entry of this lane is judged' }
    return { none: [...passed.map((one) => one.why), ...(stopped === null ? [] : [stopped.why])].join('; ') }
  }
  // THE BUS'S TREE IS WHERE THE LAST RIDER LEFT IT, whatever the one that could not board did to the clone.
  git(clone, ['checkout', '--quiet', '--detach', tip])
  if (stopped !== null) log(`the bus leaves without merge entry ${stopped.entry} and those behind it: ${stopped.why}`)
  const tree = git(clone, ['rev-parse', `${tip}^{tree}`])
  // THE ENTRIES PASSED OVER BECAUSE THEY WOULD NEED A CHECK, in the lane's order (the coordinator;
  // the merge tool's keeper). The office lets each take the lane ahead of the riders marked after it, so its check
  // starts at once, and the next bus cannot pass it over again.
  const at = (id) => (laneOrder.includes(id) ? laneOrder.indexOf(id) : laneOrder.length)
  const passedForACheck = passed.filter((one) => one.needsACheck).map((one) => one.entry).sort((a, b) => at(a) - at(b))
  // THE ENTRIES PASSED OVER BECAUSE THEY ARE TESTED ALONE, in the lane's order. No bus ever seats
  // one, so the office lets each take the lane ahead of the riders marked after it, or a stream of new buses would pass
  // it over for ever.
  const passedAlone = passed.filter((one) => one.alone).map((one) => one.entry).sort((a, b) => at(a) - at(b))
  return { riders, b: riders[0].b, clone, T: tip, tree, landingAt, passed: passed.map(({ entry, why }) => ({ entry, why })), passedForACheck, passedAlone, stopped }
}

// ============================================================================ a result borrowed from a bus

/** This entry's place in a bus another entry of the lane ran, as that entry's facts name it, or undefined. */
function myPlaceIn(testedWith, id) {
  if (testedWith === undefined || testedWith === null) return undefined
  const riders = testedWith.bus ?? [{ entry: testedWith.entry, ...(testedWith.forTheOther === undefined ? {} : { forTheOther: testedWith.forTheOther }) }]
  return riders.find((one) => one.entry === id)
}

/**
 * THE RESULT THIS ENTRY BORROWS FROM A BUS'S SUITE, or null: the lane's entry that ran the bus decided something for it,
 * on exactly the tree this entry now is. Anything else, and this entry runs its own suite.
 */
export async function aResultToBorrow(entry, integrated, { theLane } = {}) {
  if (typeof theLane !== 'function') throw new Error(THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS)
  const ran = (await theLane(entry.changeset.root)).filter((one) => one.id !== entry.id && myPlaceIn(one.machine?.tested?.testedWith, entry.id) !== undefined).at(-1)
  const mine = myPlaceIn(ran?.machine?.tested?.testedWith, entry.id)
  if (mine === undefined) return null
  if (mine.forTheOther === undefined) {
    log(`merge entry ${ran.id} tested this entry in one suite and decided nothing for it, so it runs its own suite`)
    return null
  }
  const tree = git(integrated.clone, ['rev-parse', `${integrated.Cfinal}^{tree}`])
  const decided = mine.forTheOther
  if (decided.tree !== tree) {
    log(`merge entry ${ran.id} decided this entry ${decided.green ? 'green' : 'red'} on tree ${decided.tree}, and this entry is tree ${tree}, so it runs its own suite`)
    return null
  }
  log(`borrowing the result merge entry ${ran.id} decided for this entry on tree ${tree}: ${decided.green ? 'green' : `red in ${(decided.redTests ?? []).join(', ')}`}`)
  if (typeof (decided.build ?? ran.machine.tested.build)?.passed !== 'boolean') {
    log('The shared result predates an explicit build fact, so this entry runs its own build and tests.')
    return null
  }
  return {
    facts: { green: decided.green, build: decided.build ?? ran.machine.tested.build, ...(decided.green ? {} : { redTests: decided.redTests ?? [] }), log: ran.machine.tested.log, tip: integrated.Cfinal, says: decided.says, borrowedFrom: { entry: ran.id, tree } },
    detail: { borrowedFrom: ran.id, tree, decided },
  }
}

/**
 * THE SENTENCE THAT NAMES THE OTHER ENTRY OF A COLLISION, as a pair's suite recorded one before the bus: a file this
 * entry's own suite finds red that was red in that suite only with both entries together, and green alone with each.
 * A bus records no collision: a file red only once a later entry lands is that entry's.
 */
export async function aCollisionNaming(entry, stillRed, { theLane } = {}) {
  if (typeof theLane !== 'function') throw new Error(THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS)
  if (stillRed.length === 0) return ''
  const ran = (await theLane(entry.changeset.root)).filter((one) => one.id !== entry.id && one.machine?.tested?.testedWith?.entry === entry.id).at(-1)
  const theirs = ran?.machine?.tested?.testedWith
  const collided = (theirs?.collision ?? []).filter((file) => stillRed.includes(file))
  if (collided.length === 0) return ''
  const were = collided.length === 1 ? 'was' : 'were'
  return ` ${collided.join(', ')} ${were} red only when this entry and merge entry ${ran.id} were tested together, on the pair's tree ${theirs.tree.slice(0, 12)}, and green alone on main plus each of them: the two collide there, and this entry, which lands second, carries it.`
}

/** "is" or "are", and the files named, for a sentence. */
const theFiles = (files) => ({ named: files.join(', '), is: files.length === 1 ? 'is' : 'are', was: files.length === 1 ? 'was' : 'were', it: files.length === 1 ? 'it' : 'they' })

/** "main plus this entry alone", or "main plus X, Y and this entry". */
const onMainPlus = (before) => (before.length === 0 ? 'main plus this entry alone' : `main plus ${before.join(', ')} and this entry`)

// ============================================================================ whose each red file is

/**
 * WHOSE EACH FILE STILL RED IN A BUS'S SUITE IS (the bus rule: a red bus is split to find the entry that broke
 * it). The bus's trees in landing order are: main plus this entry, then each rider's tree in turn; the last is the tree
 * the suite ran on, where every file still red is red. Each file is run alone on those trees, halving the range each
 * time, until the first tree it is red on is found: the entry whose landing makes that tree broke it. A tree that does
 * not build is red for every file. Then:
 *
 *   - this entry, when it broke a file, is red with its own files and goes back;
 *   - a rider before the first entry that broke anything is green on its own tree, once every file still red has been
 *     run alone green there;
 *   - the first rider that broke a file is red on its own tree with its own files, and is told so on its turn;
 *   - the riders after it are put again, in order, on the tree landing would make once every entry that broke a file
 *     has gone back, with what the queue regenerates for each. A later rider that broke a file is run there with its
 *     own files, and is red on that tree when they are red there; one that is not is decided nothing and runs its own
 *     suite. The others are green on their trees there, once every file still red has been run alone green on the last
 *     of them. A rider whose commits do not go onto that tree, and every rider after it, is decided nothing.
 *
 * Each result names the tree it holds for, which is exactly the tree that rider has at its own turn when the entries
 * before it land and the ones that broke a file go back; any other tree, and it runs its own suite. The whole suite ran
 * once, on the bus's last tree, and the sentences say so.
 *
 * WHEN ONLY THE RELATED TESTS RAN (the related-tests rule, part B), `greenMayBeDecided` is false: nothing has run the rest
 * of the suite, so no rider is decided green. Only a rider that broke a file is decided, red, and every other runs its own.
 *
 * @param {{ sandbox?: { name: string, folder: string }, root?: string, integrated?: { clone: string, M: string, Cfinal: string }, reports?: string | null, bus?: { riders: readonly { b: { id: string, changeset: { base: string, commit: string } }, T: string, tree: string }[], tree: string, clone: string, passedForACheck: readonly string[], passedAlone: readonly string[], landingAt: string }, stillRed?: readonly string[], build?: ((dir: string, label: string) => Promise<{ code: number | null, outFile: string }>) | null, meaningful?: boolean, greenMayBeDecided?: boolean, runInSandbox?: (sandbox: { name: string, folder: string }, label: string, command: string, args: string[], options: { cwd: string, timeoutMs: number, singleFile?: null, rerunLimits?: Readonly<{ timeoutMs: number, idleTimeoutMs: number }> }) => Promise<unknown>, keepTheReport?: (written: string, name: string) => string }} given
 */
export async function whatTheBusDecides({ sandbox, root, integrated, reports, bus, stillRed, build, meaningful, greenMayBeDecided = true, runInSandbox, keepTheReport } = {}) {
  if (typeof runInSandbox !== 'function' || typeof keepTheReport !== 'function') throw new Error(THE_BUS_NEEDS_THE_OFFICE_FUNCTIONS)
  const riders = bus.riders
  const ids = riders.map((one) => one.b.id)
  const testedWithOf = (decided) => ({
    entry: ids[0],
    tree: bus.tree,
    ...(decided[0] === undefined ? {} : { forTheOther: decided[0] }),
    bus: riders.map((one, i) => ({ entry: one.b.id, ...(decided[i] === undefined ? {} : { forTheOther: decided[i] }) })),
    ...(bus.passedForACheck.length === 0 ? {} : { passedForACheck: bus.passedForACheck }),
    ...(bus.passedAlone.length === 0 ? {} : { passedAlone: bus.passedAlone }),
  })
  const shared = `the suite this entry shared with ${entriesNamed(ids)} on the ${riders.length === 1 ? "pair's" : "bus's"} tree ${bus.tree.slice(0, 12)}`
  if (!meaningful) {
    const each = riders.length === 1 ? `merge entry ${ids[0]}` : `${entriesNamed(ids)}, so each runs its own`
    return { theseRed: [], aloneBuilt: true, testedWith: testedWithOf([]), says: `The suite was shared with ${each}, and it decided nothing for ${riders.length === 1 ? 'it, so it runs its own' : 'them'}.`, detail: { still: stillRed } }
  }
  if (stillRed.length === 0) {
    const decided = riders.map((one, i) => ({
      tree: one.tree,
      build: { passed: true },
      green: true,
      says:
        riders.length === 1
          ? `Green in one suite with merge entry ${chosen.entry}, on the pair's tree ${bus.tree.slice(0, 12)}, which is exactly this entry's own tree once that entry has landed.`
          : `Green in one bus suite run by merge entry ${chosen.entry} with ${entriesNamed(ids)}, on the bus's tree ${bus.tree.slice(0, 12)}. This entry's own tree ${one.tree.slice(0, 12)} is exactly what main becomes when ${entriesNamed([chosen.entry, ...ids.slice(0, i)])} and this entry have landed in that order. The whole suite ran once, on the bus's last tree; a bus that is green lands all its entries (the bus rule).`,
    }))
    return { theseRed: [], aloneBuilt: true, testedWith: testedWithOf(decided), says: `${riders.length === 1 ? `Merge entry ${ids[0]} was` : `${entriesNamed(ids).replace(/^m/u, 'M')} were`} tested in the same suite, green with it.`, detail: { still: [] } }
  }

  // ---- the bus's trees, in landing order, built when a file is first run on them
  const commits = [integrated.Cfinal, ...riders.map((one) => one.T)]
  const last = commits.length - 1
  const trees = new Map([[last, { dir: bus.clone, built: true }]])
  const treeAt = async (index) => {
    if (trees.has(index)) return trees.get(index)
    let dir = integrated.clone
    if (index > 0) {
      dir = join(sandbox.folder, 'work', `bus-${String(index)}`)
      rmSync(dir, { recursive: true, force: true })
      git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, dir])
      git(dir, ['fetch', '--quiet', '--no-tags', bus.clone, commits[index]])
      git(dir, ['checkout', '--quiet', '--detach', commits[index]])
      linkNodeModules(root, dir)
    }
    const built = await build(dir, index === 0 ? 'alone-build' : `bus-build-${String(index)}`)
    // A BUILD THAT GAVE NO RESULT DOES NOT MAKE A FILE ANYBODY'S (finding 80): the tool stops instead.
    const why = built.code === 0 ? null : whyARunGaveNoResult(built)
    if (why !== null) {
      const which = index === 0 ? 'Main plus this entry alone' : `The bus's tree after merge entry ${ids[index - 1]}`
      fail(`${which} gave no build result in sandbox ${sandbox.name}, so nothing says whose the files still red in the suite shared with ${entriesNamed(ids)} are: ${why}; ${whatTheRunSaid(built)} (log ${built.outFile}). A run with no result is not counted as red, so nothing was reported as tested.`)
    }
    const tree = { dir, built: built.code === 0 }
    trees.set(index, tree)
    return tree
  }
  const reds = new Map()
  let runs = 0
  const runsAt = new Map()
  const isRedAt = async (index, file) => {
    const key = `${String(index)}|${file}`
    if (reds.has(key)) return reds.get(key)
    let red = true
    if (index !== last) {
      const tree = await treeAt(index)
      runs += 1
      runsAt.set(index, (runsAt.get(index) ?? 0) + 1)
      // MAIN PLUS THIS ENTRY ALONE keeps the label a pair's run always had there.
      const label = index === 0 ? `alone-this-${String(runsAt.get(index))}` : `bus-${String(index)}-${String(runsAt.get(index))}`
      red = tree.built ? (await runAlone(sandbox, tree.dir, file, label, reports, { runInSandbox, keepTheReport })).red : true
    }
    reds.set(key, red)
    return red
  }
  const brokeBy = new Map()
  for (const file of stillRed) {
    let lo = 0
    let hi = last
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (await isRedAt(mid, file)) hi = mid
      else lo = mid + 1
    }
    brokeBy.set(file, lo)
  }
  const filesOf = (index) => stillRed.filter((file) => brokeBy.get(file) === index)
  const breakers = [...new Set(brokeBy.values())].sort((a, b) => a - b)
  const firstBreaker = breakers[0]
  const nameOf = (index) => (index === 0 ? chosen.entry : ids[index - 1])
  const decided = new Array(riders.length).fill(undefined)

  // ---- before the first entry that broke a file: green on its own tree, once every file still red is green there
  for (let index = 1; greenMayBeDecided && index < firstBreaker; index += 1) {
    let green = true
    for (const file of stillRed) if (await isRedAt(index, file)) green = false
    if (green) {
      decided[index - 1] = {
        tree: riders[index - 1].tree,
        build: { passed: (await treeAt(index)).built },
        green: true,
        says: `Green in one bus suite run by merge entry ${chosen.entry} with ${entriesNamed(ids)}: the files still red on the bus's tree ${bus.tree.slice(0, 12)} were broken by ${entriesNamed(breakers.map(nameOf))}, which land${breakers.length === 1 ? 's' : ''} after this entry, and each was run alone green on this entry's own tree ${riders[index - 1].tree.slice(0, 12)}, which is exactly what main becomes when ${entriesNamed([chosen.entry, ...ids.slice(0, index - 1)])} and this entry have landed in that order. The rest of the suite was green on the bus's last tree.`,
      }
    }
  }
  // ---- the first entry that broke a file, when it rides: red on its own tree
  if (firstBreaker >= 1) {
    const mine = filesOf(firstBreaker)
    const f = theFiles(mine)
    const before = [chosen.entry, ...ids.slice(0, firstBreaker - 1)]
    decided[firstBreaker - 1] = {
      tree: riders[firstBreaker - 1].tree,
      build: { passed: (await treeAt(firstBreaker)).built },
      green: false,
      redTests: mine,
      says: `${f.named} ${f.is} red on ${onMainPlus(before)} (tree ${riders[firstBreaker - 1].tree.slice(0, 12)}), and green on main plus ${before.join(', ')} without this entry, so ${f.it} ${f.is} this entry's, not merge entry ${chosen.entry}'s: ${f.it} ${f.was} red in the bus suite merge entry ${chosen.entry} ran on tree ${bus.tree.slice(0, 12)}, and then run alone on the bus's trees in landing order.`,
    }
  }
  // ---- after it: the riders put again on the tree landing makes once every entry that broke a file has gone back
  let without = null
  if (firstBreaker < riders.length) {
    const dir = join(sandbox.folder, 'work', 'without')
    rmSync(dir, { recursive: true, force: true })
    git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, dir])
    let chainTip = firstBreaker === 0 ? integrated.M : commits[firstBreaker - 1]
    if (firstBreaker > 0) git(dir, ['fetch', '--quiet', '--no-tags', bus.clone, chainTip])
    const landed = firstBreaker === 0 ? [] : [chosen.entry, ...ids.slice(0, firstBreaker - 1)]
    const goneBack = breakers.map(nameOf)
    const waiting = []
    let linked = false
    let brokenAt = null
    for (let index = firstBreaker + 1; index <= riders.length; index += 1) {
      const one = riders[index - 1]
      git(dir, ['checkout', '--quiet', '--detach', one.b.changeset.commit])
      if (!linked) {
        linkNodeModules(root, dir)
        linked = true
      }
      if (!tryGit(dir, replayArguments(gitIn(dir), chainTip, one.b.changeset.base)).ok) {
        tryGit(dir, ['rebase', '--abort'])
        brokenAt = { entry: one.b.id, why: `the commits of ${one.b.id} do not go without a conflict onto the tree landing makes once ${entriesNamed(goneBack)} ${goneBack.length === 1 ? 'has' : 'have'} gone back` }
        break
      }
      const head = git(dir, ['rev-parse', '--verify', 'HEAD^{commit}'])
      const { Cfinal: T } = await regenerateOnTop(dir, chainTip, head, touchedBetween(dir, chainTip, head), sandbox, one.b.id, { landingAt: bus.landingAt, runInSandbox })
      const tree = git(dir, ['rev-parse', `${T}^{tree}`])
      if (breakers.includes(index)) {
        // A LATER ENTRY THAT BROKE A FILE: its own files, run on the tree it has at its turn. It goes back either way,
        // so the chain does not take it.
        const mine = filesOf(index)
        const built = await build(dir, `without-build-${String(index)}`)
        const why = built.code === 0 ? null : whyARunGaveNoResult(built)
        if (why !== null) fail(`The tree without ${entriesNamed(goneBack)} gave no build result in sandbox ${sandbox.name}: ${why}; ${whatTheRunSaid(built)} (log ${built.outFile}). A run with no result is not counted as red, so nothing was reported as tested.`)
        let red = built.code !== 0
        if (!red) {
          red = true
          for (const [n, file] of mine.entries()) if (!(await runAlone(sandbox, dir, file, `without-${String(index)}-${String(n + 1)}`, reports, { runInSandbox, keepTheReport })).red) red = false
        }
        if (red) {
          const f = theFiles(mine)
          decided[index - 1] = {
            tree,
            green: false,
            build: { passed: built.code === 0 },
            redTests: mine,
            says: `${f.named} ${f.is} red on ${onMainPlus([...landed])} (tree ${tree.slice(0, 12)}), the tree this entry has once ${entriesNamed(goneBack.filter((id) => id !== one.b.id))} ${goneBack.length === 2 ? 'has' : 'have'} gone back, so ${f.it} ${f.is} this entry's, not merge entry ${chosen.entry}'s: ${f.it} ${f.was} red in the bus suite merge entry ${chosen.entry} ran on tree ${bus.tree.slice(0, 12)}, and then run alone on the bus's trees.`,
          }
        }
        git(dir, ['checkout', '--quiet', '--detach', chainTip])
        continue
      }
      waiting.push({ index, tree })
      landed.push(one.b.id)
      // THE NEXT RIDER IS PUT ON ONE COMMIT OF THIS TREE, dated by the bus's instant, as aBusFor stacks it.
      chainTip = asItLands(dir, chainTip, T, bus.landingAt, `Merge entry ${one.b.id} as it lands at the bus's instant`)
    }
    // THE RIDERS THAT LAND THERE are green once every file still red is green on the last of their trees.
    if (waiting.length > 0 && greenMayBeDecided) {
      git(dir, ['checkout', '--quiet', '--detach', chainTip])
      const built = await build(dir, 'without-build')
      const why = built.code === 0 ? null : whyARunGaveNoResult(built)
      if (why !== null) fail(`The tree without ${entriesNamed(goneBack)} gave no build result in sandbox ${sandbox.name}: ${why}; ${whatTheRunSaid(built)} (log ${built.outFile}). A run with no result is not counted as red, so nothing was reported as tested.`)
      let green = built.code === 0
      if (green) for (const [n, file] of stillRed.entries()) if ((await runAlone(sandbox, dir, file, `without-${String(n + 1)}`, reports, { runInSandbox, keepTheReport })).red) green = false
      if (green) {
        for (const { index, tree } of waiting) {
          decided[index - 1] = {
            tree,
            green: true,
            build: { passed: true },
            says: `Green: merge entry ${chosen.entry} ran this entry in one bus suite on tree ${bus.tree.slice(0, 12)}, where ${entriesNamed(goneBack)} broke ${theFiles(stillRed).named} and ${goneBack.length === 1 ? 'goes' : 'go'} back. This entry's own tree ${tree.slice(0, 12)} is what main becomes when the others land in order without ${goneBack.length === 1 ? 'it' : 'them'}, and every file still red in the bus suite was run alone green on the last of those trees, ${git(dir, ['rev-parse', `${chainTip}^{tree}`]).slice(0, 12)}. The rest of the suite was green on the bus's tree, which held ${entriesNamed(goneBack)} too.`,
          }
        }
      }
      without = { tip: chainTip, green, brokenAt }
    } else without = { tip: chainTip, green: null, brokenAt }
  }

  // ---- this entry's own sentence
  const theseRed = filesOf(0)
  const mine = theFiles(theseRed)
  const parts = [
    theseRed.length > 0
      ? `Of the files still red in ${shared}, ${mine.named} ${mine.is} red on main plus this entry alone, so ${mine.it} ${mine.is} this entry's.`
      : `This entry was tested with ${entriesNamed(ids)} on the ${riders.length === 1 ? "pair's" : "bus's"} tree ${bus.tree.slice(0, 12)}; every file still red there is green on main plus this entry alone.`,
  ]
  for (const [i, one] of riders.entries()) {
    const d = decided[i]
    if (d === undefined) parts.push(`Merge entry ${one.b.id} runs its own suite.`)
    else if (d.green) parts.push(`Merge entry ${one.b.id} is green on its own tree ${d.tree.slice(0, 12)}, and borrows that on its turn.`)
    else parts.push(`${theFiles(d.redTests).named} ${theFiles(d.redTests).is} ${one.b.id}'s, and ${one.b.id} is told so on its turn.`)
  }
  if (without?.brokenAt) parts.push(`${without.brokenAt.why}, so nothing was decided for it or after it.`)
  return {
    theseRed,
    aloneBuilt: (await treeAt(0)).built,
    testedWith: testedWithOf(decided),
    says: parts.join(' '),
    detail: { still: stillRed, brokeBy: Object.fromEntries(brokeBy), runsAlone: runs, without },
  }
}
