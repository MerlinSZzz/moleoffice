// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER ONE PERSON READS HOW MANY REPORTS ARE UNREAD.
 *
 * The count is hidden unless the person turns it on. The choice is one runtime setting row of their own, named for
 * them, as Home's layout and the sidebar's pins are kept. Nothing here decides what a report is or how one is
 * counted: the reports' own reading answers that, and this only says whether the number is drawn.
 */

/** The runtime setting row holding one person's answer, named for that person so nobody reads another's. */
export function reportsCountSettingName(personId: string): string {
  return `reports.count:${personId}`
}

/**
 * The answer a row holds. Nothing kept, and anything that cannot be read, is hidden: a count of nought would say
 * nobody left a report, and hiding it says nothing false.
 */
export function theReportsCountInTheRow(row: string | undefined): boolean {
  if (row === undefined) return false
  try {
    return JSON.parse(row) === true
  } catch {
    return false
  }
}
