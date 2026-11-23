// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER ANYTHING IN AN OFFICE WOULD START A CHECK THE OFFICE QUEUED, AND WHAT A RUN IS TOLD WHEN NOTHING WOULD. Wave 13n
 * round DP.
 *
 * WHY. In merges-only mode the message worker starts a queued check only when the office's checks switch is on for the
 * check's project (src/worker/index.ts). With the switch off, never set, or on only for other projects, the check stayed
 * queued, while the run's stored sentence said "Its run and log will appear here when it starts", and nobody was told.
 *
 * ONE READING, HERE, with no Node import, so the office (`whetherThisOfficeWouldStartACheck` in
 * src/server/lib/checks-in-merges-only.ts) and the worker's gate (src/worker/index.ts) cannot answer differently. It
 * reads the message worker's mode and the switch only. The 5-hour hold is not read: a held check starts by itself
 * when the hold ends, and the hold says so in its own words.
 *
 * The bound before the starter is told, and the mark a run keeps of an ask nothing would start, are here too, so the
 * record door's check of the mark (src/shared/kind-fields/session-wave-13n.ts) reads the same shape.
 */

/** The three modes `MOLE_OFFICE_MESSAGE_WORKER` may hold (`MESSAGE_WORKER_MODES` in src/config/settings.mjs). */
export type AMessageWorkerMode = 'on' | 'off' | 'merges-only'

/** What the checks switch says, as `whetherChecksRunInMergesOnly` and its door GET /api/office/checks-in-merges-only give it. */
export interface TheChecksSwitch {
  on: boolean
  nobodyChose: boolean
  /** The projects it is on for, or null for every project. */
  projects: readonly string[] | null
}

export type WhetherACheckWouldStart = { starts: true } | { starts: false; because: string; whoCanStartIt: string }

export const NOBODY_CHOSE_TO_RUN_CHECKS = 'the message worker runs in merges-only mode, and nobody has switched checks on in that mode.'
export const CHECKS_ARE_SWITCHED_OFF = 'the message worker runs in merges-only mode, and checks in that mode are switched off.'
export const THE_MESSAGE_WORKER_IS_OFF = 'the message worker is off (MOLE_OFFICE_MESSAGE_WORKER=off), so this office starts no worker and no check.'
export const THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON =
  'The owner, or a secretary with a reason, can switch checks on for this project (POST /api/office/checks-in-merges-only), or somebody can check the run by hand.'
export const WHOEVER_RUNS_THE_OFFICE_CAN_TURN_THE_WORKER_ON =
  'Whoever runs this office can set MOLE_OFFICE_MESSAGE_WORKER to on or merges-only and restart it, or somebody can check the run by hand.'

/** Why nothing starts a check of `project` when the switch is on for other projects only. */
export function checksAreOnForOtherProjects(projects: readonly string[], project: string): string {
  const named = projects.length === 0 ? 'no project' : projects.length === 1 ? projects[0]! : `${projects.slice(0, -1).join(', ')} and ${projects.at(-1)!}`
  return `the message worker runs in merges-only mode, and checks in that mode are on for ${named} only, not for ${project}.`
}

/** The office deliberately switched checks off for this project in merges-only mode. */
export function whetherAnOfficesChecksAreSwitchedOff(mode: AMessageWorkerMode, theSwitch: () => TheChecksSwitch, project: string): boolean {
  if (mode !== 'merges-only') return false
  const checks = theSwitch()
  return !checks.nobodyChose && (!checks.on || (checks.projects !== null && !checks.projects.includes(project)))
}

/**
 * Whether an office in `mode`, with the checks switch as `theSwitch` reads it, would start a check queued in `project`.
 * The switch is read only in merges-only mode, the one mode it decides anything in.
 */
export function whetherAnOfficeWouldStartACheck(mode: AMessageWorkerMode, theSwitch: () => TheChecksSwitch, project: string): WhetherACheckWouldStart {
  if (mode === 'on') return { starts: true }
  if (mode === 'off') return { starts: false, because: THE_MESSAGE_WORKER_IS_OFF, whoCanStartIt: WHOEVER_RUNS_THE_OFFICE_CAN_TURN_THE_WORKER_ON }
  const checks = theSwitch()
  if (!checks.on) return { starts: false, because: checks.nobodyChose ? NOBODY_CHOSE_TO_RUN_CHECKS : CHECKS_ARE_SWITCHED_OFF, whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }
  if (checks.projects !== null && !checks.projects.includes(project)) {
    return { starts: false, because: checksAreOnForOtherProjects(checks.projects, project), whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }
  }
  return { starts: true }
}

/** What a run stores when the office queues its check and something in the office would start it. */
export function aCheckThatWillStartSays(inspector: string): string {
  return `The office queued the check tool for ${inspector}. Its run and log will appear here when it starts.`
}

/** What a run stores when the office queues its check and nothing in the office would start it, at the time asked. */
export function aCheckNothingStartsSays(inspector: string, askedAt: string, reading: { because: string; whoCanStartIt: string }): string {
  return `The office queued the check tool for ${inspector} at ${askedAt}. At that time nothing in this office would start it: ${reading.because} ${reading.whoCanStartIt}`
}

/**
 * HOW LONG AFTER THE ASK THE RUN'S STARTER IS TOLD, an hour. A check that something starts is started at the worker's next
 * pass, within minutes of the ask, so an hour is long past that. It also leaves a secretary time to switch the checks on
 * after the seal before anybody is written to.
 */
export const A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS = 60 * 60_000

/** The title of the one line a run's starter is told. */
export function theOfficeStartedNoCheckOf(run: string): string {
  return `The office has started no check of run ${run}`
}

/** The one line a run's starter is told, with the reason read at `at`. */
export function theOfficeStartedNoCheckSays(run: string, inspector: string, askedAt: string, at: string, reading: { because: string; whoCanStartIt: string }): string {
  return `The office has started no check of run ${run}. It queued the check tool for ${inspector} at ${askedAt}, and at ${at} nothing in this office would start it: ${reading.because} ${reading.whoCanStartIt}`
}

/** The session field that keeps the mark. */
export const A_CHECK_NOTHING_STARTS = 'aCheckNothingStarts'

/**
 * THE MARK A RUN KEEPS WHEN NOTHING WOULD START ITS QUEUED CHECK. Written by the office at the ask; `told` or `notTold` is
 * written once, by the minute pass, after `tellAfterMs`. A run that has no mark was asked before this field existed, or
 * something would have started its check, and its starter is never told by this.
 */
export interface ACheckNothingStarts {
  /** The id of the message that asked the inspector, `theCheck.message` of the ask this mark belongs to. */
  message: string
  /** `theCheck.askedAt` of that ask. */
  askedAt: string
  /** Who the check was queued for, `theCheck.askedOf`. */
  inspector: string
  /** Why nothing would start it, as the reading said at the ask. */
  because: string
  /** When the starter is told, in milliseconds since 1970: the ask plus A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS. */
  tellAfterMs: number
  /** When the starter was told, and the message that told it. */
  told?: { at: string; message: string }
  /** When the minute pass let the mark go without telling anybody, and why. */
  notTold?: { at: string; because: string }
}

/** Why the minute pass let a mark go without telling anybody, as `notTold.because` keeps it. */
export const A_MARK_IS_LET_GO_BECAUSE = {
  aNewerAskReplacedIt: 'a newer ask replaced this one',
  theCheckStarted: 'the check started',
  theRunHasItsVerdict: (verdict: 'released' | 'refused'): string => `the run has its verdict: ${verdict}`,
  theAskWasAnsweredWithoutACheck: (says: string): string => `the ask was answered without a check: ${says}`,
  theOfficeWouldStartItNow: 'the office would start the check now',
  theRunServesNoAgentItCanName: "the office cannot name the agent the run serves, so it cannot name the run's starter",
  theStarterCannotBeNamed: (because: string): string => `the office cannot name the run's starter: ${because}`,
} as const

export const A_MARK_IS =
  "The run's aCheckNothingStarts must hold message, askedAt, inspector and because as text and tellAfterMs as a whole number, " +
  'and at most one of told ({at, message}) and notTold ({at, because}).'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'

/** The mark as stored, or null when `stored` does not have the shape A_MARK_IS says. */
export function theMarkAsStored(stored: unknown): ACheckNothingStarts | null {
  if (!isObject(stored)) return null
  const { message, askedAt, inspector, because, tellAfterMs, told, notTold } = stored
  if (!isText(message) || !isText(askedAt) || !isText(inspector) || !isText(because) || typeof tellAfterMs !== 'number' || !Number.isInteger(tellAfterMs)) return null
  if (told !== undefined && !(isObject(told) && isText(told['at']) && isText(told['message']))) return null
  if (notTold !== undefined && !(isObject(notTold) && isText(notTold['at']) && isText(notTold['because']))) return null
  if (told !== undefined && notTold !== undefined) return null
  return stored as unknown as ACheckNothingStarts
}
