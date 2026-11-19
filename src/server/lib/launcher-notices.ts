// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE WRITES A SANDBOX LAUNCHER'S NOTICES ITSELF, AS OFFICE LINES (problem Grbb87VX3pND; way (c),
 * XFbDHl9vZzu6, agreed in LEg_tnVeIjIB).
 *
 * WHY. Until 18 October 2026 the launcher in a sandbox sent "Run X ended with its report" and its notices of a Codex stop as
 * messages under the run's own key, in the run's own session. The office reads the newest message written in the run's
 * session to its starter as the run's last word (`theRunsOwnMessageTo`), so it held the run's check on the launcher's words.
 * A count found 68 checks held for that on the live office on 18 October 2026 (k0CfEnhvxD89).
 *
 * WHAT. The launcher's finishing write carries `tellTheStarter`, one kind from THE_LAUNCHERS_NOTICES, and no words. A Codex
 * stop's kind comes with `theModelItRanOn`, the one name the write may add. The record door asks `whyTheNoticeDoesNotFit`
 * before it writes anything, and refuses a kind that does not fit the write. After the write it asks
 * `tellTheStarterOfTheNotice`, which writes the office's own sentence from facts the office holds: the run, its seal and the
 * reports linked to it, or the sentence of a Codex stop (`aCodexStopNotice`), built from the kind, the name and the office's
 * own table of where to ask again. An office line is written in no session, so it is never the run's last word. The run's
 * key can make the same write, so a sentence never says the launcher did a thing; it says what the write that ended the
 * run says. The notices of a write the office refused stay with the launcher. The two kinds a launcher older than the Codex
 * stops for every model sends, 'luna-limit' and 'sol-capacity', are no longer taken.
 */
import { A_LONG_WAIT, aCodexStopNotice, aLongWaitNotice, THE_KEYS_A_WAIT_NAMES, THE_LAUNCHERS_NOTICES, theLimitGoNamed, theNextTryToShow } from '../../config/launcher-notices.mjs'
import { theWaitOnALimitOf } from '../../config/a-runs-stop-and-wait.mjs'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { clockStamp } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theAgentOfARunForItsSeal } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { theGoSlots } from './keyrouter/key-slots.ts'
import { readRunSeal, theReportsLinkedTo } from './sealed-tip.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { whoTakesTheNextUsageNotice } from './usage-notices.ts'

/** One kind a launcher's finishing write may carry. */
export type ALaunchersNotice = (typeof THE_LAUNCHERS_NOTICES)[number]

/** Every kind the record door takes in `tellTheStarter`. */
export const THE_KINDS_THE_DOOR_TAKES: readonly ALaunchersNotice[] = Object.freeze([...THE_LAUNCHERS_NOTICES])

/** What the office did with a notice: the line it wrote, or why it wrote none. */
type WhatOneWasTold = { told: string } | { notTold: string }

/** What the office did with a notice. A long wait says as well what the secretary who takes the usage notices was told. */
export type WhatTheStarterWasTold = WhatOneWasTold & { theUsageNoticeSecretary?: WhatOneWasTold }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a kind is a Codex stop, the only kinds that name a model. */
const aCodexStop = (notice: ALaunchersNotice): notice is 'codex-capacity' | 'codex-usage-limit' =>
  notice === 'codex-capacity' || notice === 'codex-usage-limit'

/** How far away a mark's next try is from `nowMs`, or null when the mark holds no time the office can read. */
function theNextTryOf(mark: unknown, nowMs: number): number | null {
  if (!isObject(mark) || typeof mark['resetsAt'] !== 'string') return null
  const at = Date.parse(mark['resetsAt'])
  return Number.isFinite(at) ? at - nowMs : null
}

/** Whether a next try that far away is a long wait: more than an hour. One past any limit Go names is told without its time. */
const aLongWait = (inMs: number | null): inMs is number => inMs !== null && inMs > A_LONG_WAIT.moreThanMs

/** Whether a mark names its key by one of the names a wait may give. */
const itsKey = (mark: Record<string, unknown>): (typeof THE_KEYS_A_WAIT_NAMES)[number] | null =>
  THE_KEYS_A_WAIT_NAMES.find((one) => one === mark['key']) ?? null

/**
 * WHY A LONG WAIT DOES NOT FIT ITS WRITE, or null. It fits only the write that marks a running run as waiting on a usage
 * limit whose next try is more than an hour away, with its key named from THE_KEYS_A_WAIT_NAMES, while the run held no
 * long wait before. So a wait tells once, and a next try in the past, or within the hour, tells nobody. Whether the line
 * may show the next try's time is `theNextTryToShow`'s answer.
 */
function whyALongWaitDoesNotFit(before: Pick<PanelRecord, 'id' | 'data'>, sets: Record<string, unknown>, nowMs: number): string | null {
  const nothingWritten = 'Nothing was written.'
  const mark = sets['waitingOnALimit']
  if (before.data['state'] !== 'running' || (sets['state'] !== undefined && sets['state'] !== 'running') || !isObject(mark)) {
    return `tellTheStarter "a-long-wait" fits only the write that marks running run ${before.id} as waiting on a usage limit, with waitingOnALimit. ${nothingWritten}`
  }
  if (itsKey(mark) === null) {
    return `tellTheStarter "a-long-wait" needs the key the wait is on in waitingOnALimit.key, as one of ${THE_KEYS_A_WAIT_NAMES.join(', ')}. ${nothingWritten}`
  }
  if (!aLongWait(theNextTryOf(mark, nowMs))) {
    return (
      `tellTheStarter "a-long-wait" fits only a wait whose waitingOnALimit.resetsAt is more than an hour from now. ` +
      nothingWritten
    )
  }
  if (aLongWait(theNextTryOf(theWaitOnALimitOf(before.data), nowMs))) {
    return `Run ${before.id} already holds a wait of more than an hour on a usage limit, and tellTheStarter "a-long-wait" tells only of a new one. ${nothingWritten}`
  }
  return null
}

/**
 * WHY A NOTICE DOES NOT FIT THE WRITE IT CAME ON, or null because it fits. Asked before anything is written, so a refused
 * notice leaves the run as it was. A Codex stop's kind comes with `theModelItRanOn`, a name or null, and no other kind
 * does. A notice fits only a run filed in a sandbox. 'codex-capacity' and 'codex-usage-limit' fit only the write that makes
 * the run crashed after a command that did not exit 0. 'ended-with-its-report' fits only the write that finishes the run
 * with a records submission after a command that exited 0. 'a-long-wait' fits only the write that marks a long wait on a
 * usage limit (`whyALongWaitDoesNotFit`).
 */
export function whyTheNoticeDoesNotFit(
  notice: ALaunchersNotice | undefined,
  model: string | null | undefined,
  before: Pick<PanelRecord, 'id' | 'kind' | 'data'>,
  write: { data?: Record<string, unknown> | undefined; dataPatch?: Record<string, unknown> | undefined },
): string | null {
  const nothingWritten = 'Nothing was written.'
  if (notice === undefined || (!aCodexStop(notice) && model !== undefined)) {
    return `theModelItRanOn goes only beside tellTheStarter "codex-capacity" or "codex-usage-limit". ${nothingWritten}`
  }
  if (aCodexStop(notice) && model === undefined) {
    return (
      `tellTheStarter "${notice}" needs theModelItRanOn beside it: the model's name, or null when the run's start named ` +
      `none. ${nothingWritten}`
    )
  }
  if (before.kind !== 'session' || !isObject(before.data['sandbox'])) {
    return `tellTheStarter is only for a run filed in a sandbox, and ${before.id} is not one. ${nothingWritten}`
  }
  const sets = write.dataPatch ?? write.data ?? {}
  if (notice === 'a-long-wait') return whyALongWaitDoesNotFit(before, sets, Date.now())
  const ended = isObject(sets['commandEnded']) ? sets['commandEnded'] : null
  const code = ended === null ? null : ended['code']
  if (notice === 'ended-with-its-report') {
    const submission = sets['submission']
    const fits =
      sets['state'] === 'finished' && before.data['state'] !== 'finished' && isObject(submission) && submission['kind'] === 'records' && code === 0
    return fits
      ? null
      : `tellTheStarter "ended-with-its-report" fits only the write that finishes run ${before.id} with a records submission ` +
          `and a commandEnded whose code is 0. ${nothingWritten}`
  }
  const fits = sets['state'] === 'crashed' && before.data['state'] !== 'crashed' && typeof code === 'number' && code !== 0
  return fits
    ? null
    : `tellTheStarter "${notice}" fits only the write that makes run ${before.id} crashed, with a commandEnded whose code is ` +
        `not 0. ${nothingWritten}`
}

/** The run's starter, the one a seal tells (`whoIsToldOfTheRun`), or why nobody can be named. */
function theStarterOf(run: PanelRecord): { to: ParticipantRef } | { because: string } {
  const agent = theAgentOfARunForItsSeal(run)
  if (agent === null) return { because: `Run ${run.id} names no registered agent, so no starter could be found to tell.` }
  const starter = whoIsToldOfTheRun(agent)
  return 'to' in starter ? starter : { because: starter.because.replace('of this seal', `of run ${run.id}`) }
}

/**
 * THE NAMES OF THE GO SLOTS AS THE OFFICE HOLDS THEM, for a wait on the provider router's slots, or null when the office
 * cannot read them, and the sentence says so. The router refuses a Go request only once every slot is used up, so a run
 * the router carries waits on all of them.
 */
function theGoSlotNames(): string[] | null {
  try {
    return theGoSlots().slots.map((one) => one.label)
  } catch {
    return null
  }
}

/** A time as the office's own clock writes it in a line. */
function onTheOfficesClock(ms: number): string {
  const at = clockStamp(() => new Date(ms))
  return `${at.stamp} ${at.timeZone}`
}

/**
 * TELL OF A LONG WAIT, from the mark the write stored: one line to the run's starter, and one to the secretary who takes
 * the usage notices, or the one line when they are the same agent. Each is told or says why not, and neither stops the
 * other. The secretary's line ends with why it went to that secretary when the one chosen cannot take it.
 */
function tellOfALongWait(after: PanelRecord): WhatTheStarterWasTold {
  const mark = theWaitOnALimitOf(after.data)
  const nowMs = Date.now()
  const key = isObject(mark) ? itsKey(mark) : null
  if (!isObject(mark) || theNextTryOf(mark, nowMs) === null || key === null) return { notTold: `Run ${after.id} holds no wait on a usage limit to tell of.` }
  const shown = theNextTryToShow(mark, nowMs)
  const said = aLongWaitNotice({
    run: after.id, provider: typeof mark['provider'] === 'string' ? mark['provider'] : null, limit: theLimitGoNamed(mark['said']),
    nextTry: 'notGiven' in shown ? shown : { at: onTheOfficesClock(shown.atMs), inMs: shown.inMs },
    key, slots: key === 'the-router' ? theGoSlotNames() : null,
  })
  const write = (to: ParticipantRef, words: string): WhatOneWasTold => {
    try {
      return { told: writeASystemLineToOne(to, after.workspaceId, SYSTEM_LINES.aRunWaitsLongOnALimit(words), THE_OFFICE, { run: after.id }).id }
    } catch (err) {
      return { notTold: `The office could not write the line: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
  const starter = theStarterOf(after)
  const toTheStarter = 'to' in starter ? write(starter.to, said) : { notTold: starter.because }
  const secretary = whoTakesTheNextUsageNotice()
  const toTheSecretary: WhatOneWasTold =
    secretary === null ? { notTold: 'This office has no secretary to take the usage notices, so no secretary was told.' }
      : 'to' in starter && starter.to.kind === secretary.secretary.kind && starter.to.id === secretary.secretary.id ? toTheStarter
        : write(secretary.secretary, secretary.whyThisSecretary === null ? said : `${said} ${secretary.whyThisSecretary}`)
  return { ...toTheStarter, theUsageNoticeSecretary: toTheSecretary }
}

/**
 * TELL THE RUN'S STARTER WHAT THE NOTICE SAYS, as one waking office line about the run, after the write that ended it. The
 * starter is the one a seal tells (`whoIsToldOfTheRun`). A Codex stop's sentence names `model`, the name its write carried.
 * Where nobody can be named, or the write did not seal the run it says ended with its report, no line is written and the
 * answer says why. A long wait goes to the secretary who takes the usage notices as well (`tellOfALongWait`). It never
 * throws: the write it follows stands.
 */
export function tellTheStarterOfTheNotice(
  notice: ALaunchersNotice,
  model: string | null,
  before: Pick<PanelRecord, 'data'>,
  after: PanelRecord,
): WhatTheStarterWasTold {
  try {
    if (notice === 'a-long-wait') return tellOfALongWait(after)
    const starter = theStarterOf(after)
    if (!('to' in starter)) return { notTold: starter.because }
    const stop = aCodexStop(notice) ? { notice, model } : null
    if (stop !== null) {
      const said = `Run ${after.id} has crashed. The write that ended it says: ${aCodexStopNotice(stop.notice, stop.model)}`
      const line = stop.notice === 'codex-capacity' ? SYSTEM_LINES.codexAnsweredAtCapacity(said) : SYSTEM_LINES.codexMetAUsageLimit(said)
      return { told: writeASystemLineToOne(starter.to, after.workspaceId, line, THE_OFFICE, { run: after.id }).id }
    }
    const seal = readRunSeal(after.id)
    if (seal === null || seal.id === before.data['sealedTip']) {
      return { notTold: `The write did not seal run ${after.id}, so the office did not say it ended with its report.` }
    }
    // THE SUBMISSION'S OWN ORDER, the run's declared records first, rather than the seal's, which sorts them by id.
    const submission = after.data['submission']
    const records = isObject(submission) && Array.isArray(submission['records']) ? submission['records'].map(String) : null
    if (records === null) return { notTold: `Run ${after.id} holds no records submission to name, so the office did not say it ended with its report.` }
    const earlier = before.data['submission']
    const declared = isObject(earlier) && earlier['kind'] === 'records' && Array.isArray(earlier['records']) ? earlier['records'].map(String) : null
    const sources = declared === null ? '' : ` The run had declared ${declared.join(', ')} itself.`
    const said =
      `Run ${after.id} ended with its report. The write that finished it says the launcher read its command's clean exit; ` +
      `the agent did not say finished itself. It was finished with a records submission naming ${records.join(', ')}, and ` +
      `sealed as ${seal.id}.${sources} Reports linked to it: ${theReportsLinkedTo(after.id).join(', ')}.`
    return { told: writeASystemLineToOne(starter.to, after.workspaceId, SYSTEM_LINES.aRunEndedWithItsReport(said), THE_OFFICE, { run: after.id }).id }
  } catch (err) {
    return { notTold: `The office could not write the line: ${err instanceof Error ? err.message : String(err)}` }
  }
}
