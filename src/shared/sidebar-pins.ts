// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SHIPPED_SIDEBAR, sidebarName } from './sidebar-arrangement.ts'
/**
 * THE PAGES A PERSON PINS IN FRONT OF THE SIDEBAR. Each person keeps a list of page keys, in the order the sidebar
 * draws them. The chat's entry, All pages and Settings are not pages of the arrangement, so nobody pins them: they
 * stand where they are for everybody. The door that keeps a person's pins and the sidebar that draws them both read
 * this file, so the pages that may be pinned and the check of a kept list are written here once.
 */

/** With nothing kept, these five stand in front, with the chat's entry after Home. */
export const SHIPPED_PINS: readonly string[] = ['home', 'notes', 'myNotes', 'checklists', 'decisions']

/** Every page a person may pin: each page of the shipped sidebar, whatever its group. */
export const PINNABLE_PAGES: readonly string[] = SHIPPED_SIDEBAR.groups.flatMap(group => group.keys)

/** Each person's pins are one runtime setting row of their own, named for that person. */
export function sidebarPinsSettingName(personId: string): string {
  return `sidebar.pins:${personId}`
}

export const THE_KEPT_PINS_ARE_NOT_JSON = 'The kept pages in front are not readable JSON.'

/** The door checks a list of pins with this before it keeps one, and again when it reads a kept one back. */
export function problemsWithThePins(value: unknown): string[] {
  if (!Array.isArray(value)) return ['The pages in front are a list of page keys.']
  const problems: string[] = []
  const seen = new Set<string>()
  for (const key of value) {
    if (typeof key !== 'string' || !PINNABLE_PAGES.includes(key)) {
      problems.push(`${JSON.stringify(key)} is not a page that can be pinned. The chat, All pages and Settings stay where they are.`)
    } else if (seen.has(key)) problems.push(`${sidebarName(key)} is pinned twice. Each page is pinned once.`)
    else seen.add(key)
  }
  return problems
}
