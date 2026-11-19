// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S SIDE LIST IS ONE LIST, MARKED AND FILTERED BY PROJECT. A decision: one list, each conversation marked with
 * its projects, and a filter by project. Messages belong to no project.
 * The chat works across projects. So every conversation is in the one list, and each row names
 * the projects its messages were written in or are marked about.
 *
 * The server works out each row's projects, latest first (`theProjectsOfAConversation` in src/shared/messages.ts). What
 * is here is only what the page does with them: how many names a row draws, which rows the chosen project keeps, and
 * where the viewer's choice is kept.
 */

import type { WorkspaceReading } from '@shared/workspaces.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { readStored, writeStored } from './store.ts'
import { projectName } from './projects.ts'

/** How many project names a row draws before the rest become "+N". */
export const PROJECT_NAMES_ON_A_ROW = 2

/**
 * WHAT ONE ROW'S MARK DRAWS: the first names, latest first, and how many more there are.
 *
 * NOTHING UNTIL THE PROJECTS HAVE BEEN READ. A row's projects are ids, and an id is a key and not a name, so a page that
 * has not read the list of projects draws no mark rather than a key. A project the list does not hold is named by
 * `projectName`, which prints its id, because that is the true name of what the row says.
 */
export function theMarkToDraw(
  projects: readonly string[],
  known: readonly WorkspaceReading[],
): { names: string[]; more: number; all: string[] } {
  if (known.length === 0 || projects.length === 0) return { names: [], more: 0, all: [] }
  const all = projects.map((id) => {
    const found = known.find((one) => one.id === id)
    return projectName(id, found?.title)
  })
  return { names: all.slice(0, PROJECT_NAMES_ON_A_ROW), more: Math.max(0, all.length - PROJECT_NAMES_ON_A_ROW), all }
}

/** WHETHER A ROW IS SHOWN UNDER THE CHOSEN PROJECT: any of its messages belongs to it. Null is every project. */
export function inTheChosenProject(row: { projects: readonly string[] }, chosen: string | null): boolean {
  return chosen === null || row.projects.includes(chosen)
}

/** The projects the filter offers, in the order the office lists them. The message centre is no project. */
export function theProjectsToChooseFrom(known: readonly WorkspaceReading[]): WorkspaceReading[] {
  return known.filter((one) => isAProjectOnAList(one.id))
}

/**
 * THE CHOICE THE LIST APPLIES. A stored choice naming a project the office no longer lists is not applied once the list
 * of projects has been read, and the control then reads "All projects", which is what the list shows. Before that read
 * the stored choice is applied as it is.
 */
export function theChoiceInForce(chosen: string | null, known: readonly WorkspaceReading[]): string | null {
  if (chosen === null || known.length === 0) return chosen
  return theProjectsToChooseFrom(known).some((one) => one.id === chosen) ? chosen : null
}

const CHOSEN_PROJECT_KEY = 'mole-office.chat.project'

/**
 * THE VIEWER'S CHOICE, AS THIS BROWSER KEPT IT. A browser that keeps nothing, or refuses to be asked, gives every project:
 * the choice is a convenience, and the list works without it. `readStored` catches what the browser throws.
 */
export function rememberedProjectChoice(): string | null {
  const held = readStored(CHOSEN_PROJECT_KEY)
  return held.ok && held.value !== null && held.value !== '' ? held.value : null
}

/** Keep the viewer's choice in this browser. Every project is kept as nothing. A browser that refuses is not an error. */
export function rememberProjectChoice(chosen: string | null): void {
  writeStored(CHOSEN_PROJECT_KEY, chosen ?? '')
}
