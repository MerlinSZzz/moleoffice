// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE SUITE'S MINUTES PER RUN: the fourth of the four figures (src/shared/figures.ts). Each whole-suite receipt that
 * ended inside the span is one run, with its minutes from its start to its end and whether its receipt is green by the one
 * rule (`wholeSuiteReceiptIsGreen`). A receipt whose times name no one moment, or whose end is before its start, is shown
 * with no minutes and the words for why, and is left out of the median.
 *
 * A SPAN WITH NO RUN SAYS SO, AND SAYS WHAT THE RECORDS DO HOLD: how many receipts with an end there are in the projects
 * asked and when the last one ended, or that there are none. Only the receipts that ended inside the span are read; the
 * rest are counted in the database.
 */
import { minutesBetween, theMedianMinutes, type SuiteRunMinutes, type WholeSuiteMinutes } from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { wholeSuiteReceipt } from '@shared/kinds/whole-suite-receipt.ts'
import { uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import { sqlite } from '../db/client.ts'
import type { TheSpan } from './figures-span.ts'

const ENDED = "json_extract(data, '$.endedAt')"

const aStamp = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function wholeSuiteMinutes(projects: readonly string[], span: TheSpan): WholeSuiteMinutes {
  const inTheProjects = `workspace_id IN (${projects.map(() => '?').join(', ')}) AND kind = ? AND deleted_at IS NULL`
  const rows = sqlite
    .prepare(`SELECT workspace_id AS workspaceId, id, data FROM records WHERE ${inTheProjects} AND ${ENDED} >= ? AND ${ENDED} < ? ORDER BY ${ENDED}, id`)
    .all(...projects, wholeSuiteReceipt.kind, span.from, span.until) as { workspaceId: string; id: string; data: string }[]
  const runs: SuiteRunMinutes[] = rows.map((row) => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    const startedAt = aStamp(data['startedAt'])
    const endedAt = aStamp(data['endedAt'])
    const start = startedAt === null ? null : uniqueMomentOfStoredStampInZone(startedAt, span.timeZone)
    const end = endedAt === null ? null : uniqueMomentOfStoredStampInZone(endedAt, span.timeZone)
    const run = { workspaceId: row.workspaceId, recordId: row.id, commit: aStamp(data['commit']), green: wholeSuiteReceiptIsGreen(data), startedAt, endedAt }
    if (start === null || end === null) return { ...run, minutes: null, notRecorded: sayInEnglish('figures.suite.noTimes') }
    if (end < start) return { ...run, minutes: null, notRecorded: sayInEnglish('figures.suite.endsBeforeStart') }
    return { ...run, minutes: minutesBetween(start, end), notRecorded: null }
  })
  const minutes = runs.flatMap((run) => (run.minutes === null ? [] : [run.minutes]))
  let says = sayInEnglish('figures.suite.says')
  if (runs.length === 0) {
    const held = sqlite
      .prepare(`SELECT COUNT(*) AS n, MAX(${ENDED}) AS last FROM records WHERE ${inTheProjects} AND json_type(data, '$.endedAt') = 'text'`)
      .get(...projects, wholeSuiteReceipt.kind) as { n: number; last: string | null }
    says = sayInEnglish('figures.suite.none', {
      from: span.from,
      to: span.to,
      held: held.n === 0 || held.last === null ? sayInEnglish('figures.suite.heldNone') : sayInEnglish('figures.suite.heldLast', { n: held.n, last: held.last }),
    })
  }
  return {
    projects: [...projects],
    from: span.from,
    to: span.to,
    timeZone: span.timeZone,
    runs,
    median: { minutes: theMedianMinutes(minutes), over: minutes.length },
    says,
  }
}
