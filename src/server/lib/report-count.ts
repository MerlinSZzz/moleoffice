// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { reportsCountSettingName, theReportsCountInTheRow } from '@shared/report-count.ts'
import { sqlite } from '../db/client.ts'

/** Whether one person sees the number of unread reports: false when nothing is kept, or what is kept cannot be read. */
export interface KeptReportsCount { shown: boolean }

/** The row one person's answer is kept in, as it is stored, or undefined when they chose nothing. */
export function theKeptReportsCountRow(personId: string): string | undefined {
  return (sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(reportsCountSettingName(personId)) as { value: string } | undefined)?.value
}

/** One person's answer, read on each ask and never changed here. */
export function keptReportsCount(personId: string): KeptReportsCount {
  return { shown: theReportsCountInTheRow(theKeptReportsCountRow(personId)) }
}
