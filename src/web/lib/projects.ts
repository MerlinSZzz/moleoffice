// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROJECT IS CALLED ON SCREEN. One function, and nothing else in the browser names a project.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * `projectName` used to live in src/web/components/projects.tsx, beside the panel that moves a
 * record between projects. That file imports src/web/api.ts, which imports src/web/lib/workspace.ts,
 * which reads `window.localStorage` while it is still loading. So importing `projectName` from a
 * plain Node test threw "ReferenceError: window is not defined" before a single assertion ran, and
 * src/web/lib/words.ts wrote down that it wanted to re-export it and could not.
 *
 * It is here instead. THIS FILE IMPORTS NOTHING THAT TOUCHES A BROWSER — no React, no HTTP client,
 * no storage. It imports `t` from `@shared/i18n.ts`, which a plain Node process can call as well: it
 * reads a module-level language variable and nothing else. So anything may still import this file: a
 * test, a component, or a module like words.ts that has no browser under it. components/projects.tsx
 * re-exports both names below, so every caller that imported them from there still works.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, AND WHAT IT STOPPED DOING ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * IT PRINTS THE TITLE THE SERVER STORES, FOR EVERY PROJECT, AND CHANGES NONE OF THEM.
 *
 * IT USED TO RENAME ONE. `unassigned` stores the title "Unassigned" and this file replaced that
 * with "Not in a project" at the last moment, from a table of one entry. So a project had one name
 * on the server and another on the screen, which is this repository's recurring defect — one fact
 * worked out in two places — and it had already gone wrong: four places drew a project's name
 * without coming through here, so "Unassigned" and "Not in a project" were both on screen at once.
 * Filed as problem `YP_OaLwgMk-j`.
 *
 * THE OWNER SETTLED IT IN DECISION `AtiSHfG00BVV`, on 16 August 2026: the project keeps the name
 * Unassigned, that title is stored plainly, and `General` is a second, empty project beside it for
 * work that is deliberately miscellaneous. The two mean different things and both exist. So the
 * renaming table is deleted and the name comes from one place, which is the registry the server
 * serves from `GET /api/workspaces`. src/server/db/workspace-migration.ts is where General is
 * established and where the pair is explained.
 *
 * WHY THIS FUNCTION IS STILL HERE WITH NOTHING TO DECIDE. It is the one place that answers "what do
 * I print for this project", and it answers it the same way for every caller: the stored title, or
 * the id when nobody handed one over. A caller that wrote `title ?? id` for itself would be the
 * second place, and the next naming rule would reach one of them.
 *
 * ---------------------------------------------------------------------------------------
 * A NAME AFTER A PREPOSITION IS QUOTED
 * ---------------------------------------------------------------------------------------
 *
 * The rule for every caller: in a sentence, put the name in quotation marks —
 * `in “{projectName(id, title)}”`. It reads for every project this installation can hold, and it
 * says the words inside it are a name rather than part of the sentence. The other way out is to put
 * the name first and never after a preposition, which is what HomePage's day rows and the plan
 * graph's rows do. Both are fine.
 *
 * This mattered more when the catch-all was drawn as the phrase "Not in a project", which made a
 * chip read "in Not in a project". The names are all ordinary nouns now, so the rule costs nothing
 * and still holds for whatever somebody calls their next project.
 */

import { t } from '@shared/i18n.ts'

/**
 * What this project is called on screen.
 *
 * `title` is the server's stored title, when the caller has it. WITHOUT IT THE ID IS PRINTED,
 * which is honest in both directions: it is the true name of what the browser is asking about, and
 * it is never some other project's title.
 */
export function projectName(id: string, title?: string | null): string {
  if (title !== undefined && title !== null && title !== '') return title
  return id
}

/**
 * What being in Unassigned means, for the one screen that has to say it.
 *
 * IT IS THE SENTENCE THAT TELLS UNASSIGNED FROM GENERAL, which is why it is worth having now that
 * both projects exist. Unassigned is where Mole Office knows the item exists and nobody has decided
 * where it belongs; General is where somebody deliberately put work that does not deserve a project
 * of its own. The move panel says this one because that is the screen where the difference decides
 * what somebody does next.
 *
 * Not a general "note per project": the server already serves a note for every project, and this is
 * the single sentence that has to be in the reader's words rather than the migration's.
 *
 * A FUNCTION, NOT A CONSTANT, so the one caller reads it at render time in the page's own language.
 * `t()` answers whichever language is current when it is called; a module-level `const` would have
 * frozen it at whatever language was active the moment this file first loaded.
 */
export function unassignedMeans(): string {
  return t('g2d.projects.unassignedMeans')
}
