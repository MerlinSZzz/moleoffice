// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SHIPPED_PINS, THE_KEPT_PINS_ARE_NOT_JSON, problemsWithThePins, sidebarPinsSettingName } from '@shared/sidebar-pins.ts'
import { sqlite } from '../db/client.ts'

/** Whether a person kept pins, and whether the sidebar could read the ones they kept. */
export type SidebarPinsKept = 'nothing-kept' | 'kept' | 'unreadable'
export interface KeptSidebarPins { pins: string[]; kept: SidebarPinsKept; problems: string[] }

/** The row a person's pins are kept in, as it is stored, or undefined when they kept none. */
export function theKeptPinsRow(personId: string): string | undefined {
  return (sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(sidebarPinsSettingName(personId)) as { value: string } | undefined)?.value
}

/**
 * The pages one person has in front. With no row they are the shipped four. With a row it cannot read they are the
 * shipped four as well, and the answer says the row was unreadable and why, so the sidebar can say so. The row is
 * read on each ask and never changed here.
 */
export function keptSidebarPins(personId: string): KeptSidebarPins {
  return thePinsInTheRow(theKeptPinsRow(personId))
}

export function thePinsInTheRow(row: string | undefined): KeptSidebarPins {
  if (row === undefined) return { pins: [...SHIPPED_PINS], kept: 'nothing-kept', problems: [] }
  let stored: unknown
  try { stored = JSON.parse(row) }
  catch { return { pins: [...SHIPPED_PINS], kept: 'unreadable', problems: [THE_KEPT_PINS_ARE_NOT_JSON] } }
  const problems = problemsWithThePins(stored)
  if (problems.length > 0) return { pins: [...SHIPPED_PINS], kept: 'unreadable', problems }
  return { pins: [...(stored as string[])], kept: 'kept', problems: [] }
}
