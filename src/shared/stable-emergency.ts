// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMERGENCY RULE, in one place. An emergency release goes into the stable version without a test receipt: the owner
 * threw the emergency switch to 1 with an end time, and a holder of the secretary card told the owner alone in chat
 * which commit goes in. The release tool and the notice door each read the facts themselves and judge them here, so the
 * two cannot drift. After it went in, the release owes a follow-up receipt and a report, and while either is owed no
 * second emergency release goes in.
 *
 * An emergency release follows the case of its target, as any release does. One whose target changes no file under
 * drizzle/ goes down case 1, and one whose target changes a file there goes down case 2.
 */
import { z } from 'zod'
import type { StableEmergencyFollowUp, StableEmergencyReport } from './stable-upgrade-notices.ts'

export const STABLE_EMERGENCY_GATE = 'stable-emergency'
/** The longest a throw may stay at 1. The design proposed it, and the report times one emergency release against it. */
export const STABLE_EMERGENCY_MOST_MINUTES = 120
/** The refusal when the end time is more than that many real minutes after the throw. */
export const STABLE_EMERGENCY_TOO_LONG = `The emergency switch ends more than ${STABLE_EMERGENCY_MOST_MINUTES} minutes after it was thrown.`
/**
 * The refusal when the throw's time or the end time names no one moment. A time in the hour the clocks go back names
 * two, one in the hour they go forward names none, and so does a stamp or a zone that cannot be read.
 */
export const STABLE_EMERGENCY_NOT_ONE_MOMENT = "The time the emergency switch was thrown, or its end time, is not one moment on the office's clock. A time in the hour the clocks go back comes twice, and a time in the hour they go forward never comes. Throw the switch again with an end time after that hour. If it was thrown in that hour, throw it again once the hour has passed."

/** The parts of the emergency switch's row in the office's gate list that the rule reads. */
export const stableEmergencySwitchRowSchema = z.object({
  value: z.string().nullable(),
  unreadable: z.string().nullable(),
  chosen: z.object({ value: z.string(), until: z.string().nullable() }).nullable(),
  ranOut: z.object({ value: z.string(), until: z.string() }).nullable(),
  lastChange: z.object({
    id: z.string(), appendOrder: z.number().int().nullable(), at: z.string(),
    to: z.string().nullable(), until: z.string().nullable(), ranOut: z.boolean(),
  }).nullable(),
})
export type StableEmergencySwitchRow = z.infer<typeof stableEmergencySwitchRowSchema>
export interface StableEmergencyThrow { change: string; appendOrder: number }

const NO_THROW = 'The office has no recorded throw of the emergency switch to 1 with this end time.'

/**
 * Why the switch lets no emergency release in, or null when it does. `pin` is the throw a release already named, when the
 * door checks its BEFORE. `newestCompleted` is the order the newest completed release's AFTER was written in, or null
 * when no release has completed. `momentOf` reads a stored stamp as one moment, or null.
 */
export function theEmergencySwitchRefusal(row: StableEmergencySwitchRow, facts: {
  pin?: StableEmergencyThrow
  newestCompleted: number | null
  spent: (change: string) => boolean
  momentOf: (stamp: string) => number | null
}): string | null {
  if (row.unreadable !== null) return `The office could not read the emergency switch: ${row.unreadable}`
  const last = row.lastChange
  if (row.chosen === null && (row.ranOut !== null || last?.ranOut === true)) return 'The emergency switch has run out.'
  if (row.value !== '1') return 'The emergency switch is at 0.'
  if (row.chosen === null || row.chosen.value !== '1') return NO_THROW
  if (row.chosen.until === null) return 'The emergency switch has no end time.'
  if (last === null || last.ranOut || last.to !== '1' || last.until !== row.chosen.until) return NO_THROW
  if (last.appendOrder === null) return "The emergency switch's throw has no place in the office's order, so it cannot be compared with the newest completed release."
  const thrown = facts.momentOf(last.at), ends = facts.momentOf(row.chosen.until)
  if (thrown === null || ends === null) return STABLE_EMERGENCY_NOT_ONE_MOMENT
  if (ends - thrown > STABLE_EMERGENCY_MOST_MINUTES * 60_000) return STABLE_EMERGENCY_TOO_LONG
  if (facts.pin !== undefined && (facts.pin.change !== last.id || facts.pin.appendOrder !== last.appendOrder)) {
    return "The throw this release names is not the emergency switch's latest throw."
  }
  if (facts.newestCompleted !== null && last.appendOrder < facts.newestCompleted) return 'The emergency switch was thrown before the newest completed release.'
  if (facts.spent(last.id)) return 'An earlier release already used this throw of the emergency switch.'
  return null
}

/** The original of the emergency message, as the reader found it. `order` is null when its place could not be read. */
export interface StableEmergencyMessage { id: string; bySecretary: boolean; to: unknown; body: unknown; order: number | null }

/** Why the message lets no emergency release in, or null when it does. A missing or deleted message is null. */
export function theEmergencyMessageRefusal(message: StableEmergencyMessage | null, facts: {
  owner: string
  commit: string
  newestCompleted: number | null
  pinned: (id: string) => boolean
}): string | null {
  if (message === null) return 'The emergency message is missing.'
  if (!message.bySecretary) return 'The emergency message was not written by an agent holding the secretary card.'
  const to = message.to
  if (!Array.isArray(to) || to.length !== 1 || to[0]?.kind !== 'person' || to[0]?.id !== facts.owner) return 'The emergency message is not addressed to the owner alone.'
  // The commit is 40 hexadecimal characters; a longer hexadecimal word around it names another object.
  const named = /^[0-9a-f]{40}$/.test(facts.commit) && typeof message.body === 'string' &&
    new RegExp(`(?<![0-9A-Fa-f])${facts.commit}(?![0-9A-Fa-f])`).test(message.body)
  if (!named) return 'The emergency message does not name the full 40-character target commit.'
  if (message.order === null) return "The emergency message's place in the office's order could not be read."
  if (facts.newestCompleted !== null && message.order < facts.newestCompleted) return 'The emergency message was written before the newest completed release.'
  if (facts.pinned(message.id)) return 'An earlier release already pinned this emergency message.'
  return null
}

/** A release that completed, is unfinished, or failed without a verified restore went in or may have gone in. */
export function anEmergencyWentIn(outcome: string): boolean {
  return outcome === 'completed' || outcome === 'unfinished' || outcome === 'not-restored'
}

/** What an earlier emergency release still owes, in the words of a refusal, or null when it owes nothing. */
export function whatAnEmergencyStillOwes(release: { tag: string; outcome: string; followUp: StableEmergencyFollowUp; report: StableEmergencyReport }): string | null {
  if (!anEmergencyWentIn(release.outcome)) return null
  // Only a filed one is paid. A red follow-up counts: the suite ran on the fix.
  const receipt = release.followUp.state !== 'filed', report = release.report.state !== 'filed'
  if (!receipt && !report) return null
  const what = receipt && report ? 'its follow-up receipt and its report' : receipt ? 'its follow-up receipt' : 'its report'
  const unknown = [
    ...(release.followUp.state === 'unknown' ? [` Its follow-up receipt could not be checked, so it counts as owed: ${release.followUp.because}`] : []),
    ...(release.report.state === 'unknown' ? [` Its report could not be checked, so it counts as owed: ${release.report.because}`] : []),
  ].join('')
  return `The emergency release ${release.tag} still owes ${what}.${unknown} No second emergency release goes in while an earlier one owes either.`
}

/** The line the notice of a way back to an emergency release carries, saying which receipt stands for it. */
export function stableEmergencyStandingLine(tag: string, receipt: string, commit: string): string {
  return `The emergency release ${tag} has no receipt of its own. Its follow-up receipt ${receipt}, on later commit ${commit}, stands for it.`
}
