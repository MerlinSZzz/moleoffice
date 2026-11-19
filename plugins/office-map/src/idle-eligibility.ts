// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { coherentFacts, type Occupant, type WorkRow } from './model.ts'
import type { Whereabouts } from './ownership.ts'

export type IdleSubject = Pick<Occupant, 'facts' | 'work'>

const settledStanding = new Set(['closed', 'closed unchecked', 'superseded'])

const settled = (row: WorkRow): boolean =>
  !row.executing && typeof row.runStanding === 'string' && settledStanding.has(row.runStanding)

/** True when the facts can say whether the work is settled. */
function readable(subject: IdleSubject, workAvailable: boolean): boolean {
  if (!workAvailable || !subject.facts) return false
  if (!coherentFacts(subject as Occupant)) return false
  const revision = subject.facts.people.revision
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1
}

export function onlineIdleEligible(subject: IdleSubject, workAvailable: boolean): boolean {
  return readable(subject, workAvailable) && subject.work.every(settled)
}

/** True when the facts say the work is not settled: a mole at work. Unreadable facts say neither. */
export function onlineAtWork(subject: IdleSubject, workAvailable: boolean): boolean {
  return readable(subject, workAvailable) && !subject.work.every(settled)
}

export function idleEligible(subject: IdleSubject, at: Whereabouts, workAvailable: boolean): boolean {
  if (at.where === 'play') return true
  if (at.where !== 'desk') return false
  return onlineIdleEligible(subject, workAvailable)
}
