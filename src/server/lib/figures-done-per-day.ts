// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PACKAGES DONE PER DAY: the second of the four figures (src/shared/figures.ts). A package counts on the day its state
 * turned done, read from its own acts: the day the acceptance that made every point accepted was written, or the day its
 * task was confirmed complete, whichever came first. A package done and later returned is not done, and counts on no day.
 *
 * A DAY COUNTS 0 ONLY WHERE THE RECORDS COVER IT. They cover a day from the day the first package of the projects asked
 * was made, up to today. A day before that, or after today, is not recorded and says why.
 *
 * Only the tasks with an acceptance or a confirmation inside the span are read, by their stamps, so a span reads its own
 * packages and not every package.
 */
import { sql } from 'drizzle-orm'

import { theDaysOfASpan, type PackagesDonePerDay } from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { records } from '../db/schema.ts'
import { theFirstPackageMadeIn, thePackagesCounted } from './delegation.ts'
import type { TheSpan } from './figures-span.ts'

export function packagesDonePerDay(projects: readonly string[], span: TheSpan): PackagesDonePerDay {
  const doneOn = new Map<string, number>()
  let firstMade: string | null = null
  for (const workspaceId of projects) {
    const made = theFirstPackageMadeIn(workspaceId)
    if (made !== null && (firstMade === null || made.localeCompare(firstMade) < 0)) firstMade = made
    const inTheSpan = sql`(json_extract(${records.data}, '$.completed.at') >= ${span.from} and json_extract(${records.data}, '$.completed.at') < ${span.until})
      or exists (select 1 from json_each(${records.data}, '$.package.acceptances') as accepted
        where json_extract(accepted.value, '$.at') >= ${span.from} and json_extract(accepted.value, '$.at') < ${span.until})`
    for (const counted of thePackagesCounted(workspaceId, inTheSpan).packages) {
      const day = counted.doneAt?.slice(0, 10) ?? null
      if (day === null || day < span.from || day > span.to) continue
      doneOn.set(day, (doneOn.get(day) ?? 0) + 1)
    }
  }
  const recordedFrom = firstMade === null ? null : firstMade.slice(0, 10)
  const days = theDaysOfASpan(span.from, span.to).map((day) => {
    if (recordedFrom === null) return { day, done: null, notRecorded: sayInEnglish('figures.done.noPackages') }
    if (day < recordedFrom) return { day, done: null, notRecorded: sayInEnglish('figures.done.beforeTheRecords', { day: recordedFrom }) }
    if (day > span.today) return { day, done: null, notRecorded: sayInEnglish('figures.done.afterToday') }
    return { day, done: doneOn.get(day) ?? 0, notRecorded: null }
  })
  return {
    projects: [...projects],
    from: span.from,
    to: span.to,
    timeZone: span.timeZone,
    recordedFrom,
    days,
    total: days.reduce((sum, one) => sum + (one.done ?? 0), 0),
    says: sayInEnglish('figures.done.says'),
  }
}
