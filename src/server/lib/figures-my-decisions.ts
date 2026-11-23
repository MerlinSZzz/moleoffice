// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HIS DECISIONS: how many forks the person settled in a span, and how long each had waited on him, read for home's two
 * figures of them (src/shared/figures.ts, `MyDecisions`).
 *
 * A FORK IS COUNTED WHEN THE PERSON SETTLED IT: a settling link from a decision to the fork, made by a person, that
 * settles it by the one rule every queue reads (`linkSettlesThisFork`). A fork settled twice is counted once, by its
 * first settling link. The span is the day the settling link was made.
 *
 * THE WAIT RUNS FROM WHEN THE FORK WAS FILED TO WHEN HE SETTLED IT, the link's own time. The read asks only for the
 * settling links of the span, at most `MY_DECISIONS_READ_AT_MOST` of them, and then checks each one.
 */
import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'

import { DECISION_KIND } from '@shared/decision-kind.ts'
import { MY_DECISIONS_READ_AT_MOST, minutesBetween, theDaysOfASpan, type MyDecisions } from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { db } from '../db/client.ts'
import { links, records } from '../db/schema.ts'
import { PROPOSAL_KIND } from './records/fork-settled.ts'
import { humanMadeThisLink, linkSettlesThisFork } from './records/fork-settling.ts'
import type { TheSpan } from './figures-span.ts'

const theFork = alias(records, 'the_fork_he_settled')
const theDecision = alias(records, 'the_decision_that_settled_it')

/** The average of some minutes, to one decimal place, or null when there are none. */
function averageOf(minutes: readonly number[]): number | null {
  return minutes.length === 0 ? null : Math.round((minutes.reduce((sum, one) => sum + one, 0) / minutes.length) * 10) / 10
}

export function myDecisions(projects: readonly string[], span: TheSpan): MyDecisions {
  const rows = projects.length === 0 ? [] : db
    .select({ decisionId: links.fromId, forkId: links.toId, settledAt: links.createdAt, filedAt: theFork.createdAt })
    .from(links)
    .innerJoin(theFork, eq(theFork.id, links.toId))
    .innerJoin(theDecision, eq(theDecision.id, links.fromId))
    .where(and(
      eq(links.type, RESOLVES_PROPOSAL),
      eq(theFork.kind, PROPOSAL_KIND),
      eq(theDecision.kind, DECISION_KIND),
      isNull(theFork.deletedAt),
      isNull(theDecision.deletedAt),
      inArray(theFork.workspaceId, [...projects]),
      gte(links.createdAt, span.from),
      lt(links.createdAt, span.until),
    ))
    .orderBy(asc(links.createdAt), asc(links.id))
    .limit(MY_DECISIONS_READ_AT_MOST + 1)
    .all()
  const cut = rows.length > MY_DECISIONS_READ_AT_MOST
  const counted = new Set<string>()
  const byDay = new Map<string, number[]>()
  const settledOn = new Map<string, number>()
  let notTimed = 0
  for (const row of rows.slice(0, MY_DECISIONS_READ_AT_MOST)) {
    if (counted.has(row.forkId)) continue
    if (!humanMadeThisLink(row.decisionId, RESOLVES_PROPOSAL, row.forkId) || !linkSettlesThisFork(row.forkId, row.decisionId)) continue
    counted.add(row.forkId)
    const day = row.settledAt.slice(0, 10)
    settledOn.set(day, (settledOn.get(day) ?? 0) + 1)
    const filed = uniqueMomentOfStoredStampInZone(row.filedAt, span.timeZone)
    const settled = uniqueMomentOfStoredStampInZone(row.settledAt, span.timeZone)
    if (filed === null || settled === null || settled < filed) {
      notTimed += 1
      continue
    }
    byDay.set(day, [...(byDay.get(day) ?? []), minutesBetween(filed, settled)])
  }
  const days = theDaysOfASpan(span.from, span.to).map((day) => ({ day, settled: settledOn.get(day) ?? 0, averageMinutes: averageOf(byDay.get(day) ?? []) }))
  const averageMinutes = averageOf([...byDay.values()].flat())
  return {
    projects: [...projects],
    from: span.from,
    to: span.to,
    timeZone: span.timeZone,
    settled: counted.size,
    averageMinutes,
    notTimed,
    days,
    cut,
    says: sayInEnglish(counted.size === 0 ? 'figures.myDecisions.none' : 'figures.myDecisions.says', { from: span.from, to: span.to }),
  }
}
