// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER OF WHAT A DECISION GOVERNS.
 *
 * The server's lookup and check (src/server/lib/governs.ts) and the record page's Governs section both read stored
 * entries through `theGovernedPlaces`, so the page draws exactly the places the lookup matches.
 *
 * A decision names what it governs in two parts: the records part, `governs`, and the files part, `governsFiles`
 * (src/shared/what-a-record-names.ts). A decision stored before the files part may hold a path in `governs`. The
 * reader reads such a path as a file, so a stored decision is never rewritten.
 */

import { GOVERNS_FILES_FIELD, NOTHING_FITS_FIELD, theFilesNamed, theNothingFitsEntries, tidyAPath } from './what-a-record-names.ts'

/** One place as the lookup matches it: a page by its id, or a repository path. */
export type GovernedPlace = { record: string } | { path: string }

/** The field, and the kind that has it. */
export const GOVERNS_FIELD = 'governs'

/** A path as the lookup compares it: no leading `./`, no trailing slash. */
export function tidyGovernedPath(path: string): string {
  return tidyAPath(path)
}

/** What one decision governs, read as two parts, with what could not be read. */
export interface TheGovernedParts {
  /** The pages named by id, in the order stored. */
  records: string[]
  /** True when `governs` names the whole project. */
  wholeProject: boolean
  /** The files: paths stored in `governs` before the files part, then `governsFiles`, tidied, each once. */
  files: string[]
  /** The records and then the files, as the lookup matches them. */
  places: GovernedPlace[]
  /** Each entry that could not be read: where it is, and why. Empty means every entry was read. */
  skipped: ASkippedEntry[]
}

/**
 * ONE ENTRY THAT COULD NOT BE READ. `at` is the stored field path, for a log or an agent. A page draws `part` and
 * `entry` instead, so a reader sees "entry 3 of what it governs" and never a field path. `entry` is counted from 1,
 * and it is null when the whole field is not a list.
 */
export interface ASkippedEntry {
  at: string
  part: typeof GOVERNS_FIELD | typeof GOVERNS_FILES_FIELD
  entry: number | null
  why: string
}

/**
 * THE TWO PARTS ONE DECISION NAMES. `governs` is the stored records part; `governsFiles` the stored files part.
 * An entry that names nothing readable is not dropped silently: it is listed in `skipped`, and each reader says
 * so.
 */
export function theGovernedPlaces(governs: unknown, governsFiles?: unknown): TheGovernedParts {
  const records: string[] = []
  const files: string[] = []
  const skipped: ASkippedEntry[] = []
  let wholeProject = false
  if (Array.isArray(governs)) {
    ;(governs as unknown[]).forEach((place, at) => {
      const where = { at: `${GOVERNS_FIELD}[${String(at)}]`, part: GOVERNS_FIELD, entry: at + 1 } as const
      if (place === null || typeof place !== 'object' || Array.isArray(place)) {
        skipped.push({ ...where, why: 'is not an entry' })
        return
      }
      const entry = place as { record?: unknown; path?: unknown; wholeProject?: unknown }
      const { record, path, wholeProject: whole } = entry
      if (typeof record === 'string' && record.trim() !== '') records.push(record.trim())
      else if (whole === true) wholeProject = true
      else if (typeof path === 'string' && path.trim() !== '') files.push(tidyAPath(path))
      else skipped.push({ ...where, why: 'names no page, no whole project and no file' })
    })
  } else if (governs !== undefined && governs !== null) {
    skipped.push({ at: GOVERNS_FIELD, part: GOVERNS_FIELD, entry: null, why: 'is not a list' })
  }
  if (Array.isArray(governsFiles)) {
    ;(governsFiles as unknown[]).forEach((one, at) => {
      if (typeof one === 'string' && one.trim() !== '') return
      skipped.push({ at: `${GOVERNS_FILES_FIELD}[${String(at)}]`, part: GOVERNS_FILES_FIELD, entry: at + 1, why: 'is not a path' })
    })
    files.push(...theFilesNamed(governsFiles))
  } else if (governsFiles !== undefined && governsFiles !== null) {
    skipped.push({ at: GOVERNS_FILES_FIELD, part: GOVERNS_FILES_FIELD, entry: null, why: 'is not a list' })
  }
  const once = [...new Set(files)]
  return {
    records,
    wholeProject,
    files: once,
    places: [...records.map((record) => ({ record })), ...once.map((path) => ({ path }))],
    skipped,
  }
}

/** Whether the parts name anything a reader can draw: a page, the whole project, a file, or an entry not read. */
export function theGovernedPartsNameSomething(parts: TheGovernedParts): boolean {
  return parts.records.length > 0 || parts.wholeProject || parts.files.length > 0 || parts.skipped.length > 0
}

/**
 * THE FIELDS A DECISION'S GOVERNS SECTION DRAWS BESIDE `governs`: the files part and what no page fits. The record
 * page draws them inside that one section, so the body draws neither as a section of its own.
 */
export const DRAWN_IN_THE_GOVERNS_SECTION: readonly string[] = [GOVERNS_FILES_FIELD, NOTHING_FITS_FIELD]

/**
 * Whether a decision's Governs section has anything to draw: a page, the whole project, a file, an entry not read, or
 * what no page fits. The section list (src/shared/sections.ts) and the region tree (src/shared/regions.ts) both ask
 * this, so the two agree on when the section is there.
 */
export function theGovernsSectionIsFilled(data: Readonly<Record<string, unknown>>): boolean {
  return (
    theGovernedPartsNameSomething(theGovernedPlaces(data[GOVERNS_FIELD], data[GOVERNS_FILES_FIELD])) ||
    theNothingFitsEntries(data[NOTHING_FITS_FIELD]).length > 0
  )
}
