// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {
  HOME_LAYOUT_A, THE_KEPT_LAYOUT_IS_NOT_JSON, homeLayoutSettingName, problemsWithTheHomeLayout, type HomeLayout,
} from '@shared/home-layout.ts'
import { sqlite } from '../db/client.ts'

/** Whether a person kept a layout, and whether Home could read the one they kept. */
export type HomeLayoutKept = 'nothing-kept' | 'kept' | 'unreadable'
export interface KeptHomeLayout { layout: HomeLayout; kept: HomeLayoutKept; problems: string[] }

/** The row a person's layout is kept in, as it is stored, or undefined when they kept none. */
export function theKeptHomeLayoutRow(personId: string): string | undefined {
  return (sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(homeLayoutSettingName(personId)) as { value: string } | undefined)?.value
}

/**
 * The layout Home draws for one person. With no row it is A. With a row it cannot read it is A as well, and the answer
 * says the row was unreadable and why, so Home can say so. The row is read on each ask and never changed here.
 */
export function keptHomeLayout(personId: string): KeptHomeLayout {
  return theLayoutInTheRow(theKeptHomeLayoutRow(personId))
}

export function theLayoutInTheRow(row: string | undefined): KeptHomeLayout {
  if (row === undefined) return { layout: HOME_LAYOUT_A, kept: 'nothing-kept', problems: [] }
  let stored: unknown
  try { stored = JSON.parse(row) }
  catch { return { layout: HOME_LAYOUT_A, kept: 'unreadable', problems: [THE_KEPT_LAYOUT_IS_NOT_JSON] } }
  const problems = problemsWithTheHomeLayout(stored)
  if (problems.length > 0) return { layout: HOME_LAYOUT_A, kept: 'unreadable', problems }
  const layout = stored as HomeLayout
  return { layout: { band: [...layout.band], first: [...layout.first], second: [...layout.second] }, kept: 'kept', problems: [] }
}
