// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DECISION GOVERNS AND WHAT A REPORT IS ABOUT, AS TWO PARTS: the records part and the files part.
 *
 * A decision names the pages it governs in `governs`, the files in `governsFiles`, and what no page fits in
 * `nothingFits`. A report names its pages by `about` links, its files in `aboutFiles`, and what no page fits in
 * `nothingFits`. The fields are declared in src/shared/kind-fields/decision-wave-13s.ts and report-wave-13s.ts. The
 * server's checks and reminder are in src/server/lib/what-a-record-names.ts.
 *
 * This file imports nothing, so a line's field file, the shape list and the pages may all read it.
 */

/** The decision's files part: repository paths, a file, a folder or a pattern. */
export const GOVERNS_FILES_FIELD = 'governsFiles'

/** The report's files part. */
export const ABOUT_FILES_FIELD = 'aboutFiles'

/** What no page fits, on a decision or a report. */
export const NOTHING_FITS_FIELD = 'nothingFits'

/** The key of the whole-project entry of `governs`. It stands alone in the list. */
export const WHOLE_PROJECT_KEY = 'wholeProject'

/**
 * THE KINDS OF PAGE A DECISION GOVERNS AND A REPORT IS ABOUT. Each is a record with a page of its own. A decision names
 * one of these in `governs[].record`, or the whole project alone.
 */
export const PAGE_KINDS = ['module', 'pipeline', 'block', 'flow', 'regulation', 'role_card', 'tool', 'tool_category', 'department'] as const

export type PageKind = (typeof PAGE_KINDS)[number]

/** Whether a stored kind is one of the page kinds. */
export function isAPageKind(kind: string): kind is PageKind {
  return (PAGE_KINDS as readonly string[]).includes(kind)
}

/** The word a nothingFits entry sends as its missing kind when no kind of record would fit at all. */
export const NO_KIND_FITS = 'other'

/** The word the office's own writers send as the missing kind when nobody said what the decision governs. */
export const MISSING_KIND_NOT_SAID = 'not said'

/** One nothingFits entry, as stored: the kind of page that is missing, a few words, and the nearest live page. */
export interface ANothingFitsEntry {
  missing: string
  what: string
  nearest?: string
}

/** The entries of one stored nothingFits value that have their shape. The shape check refuses the rest at the door. */
export function theNothingFitsEntries(stored: unknown): ANothingFitsEntry[] {
  if (!Array.isArray(stored)) return []
  const out: ANothingFitsEntry[] = []
  for (const one of stored as unknown[]) {
    if (one === null || typeof one !== 'object' || Array.isArray(one)) continue
    const { missing, what, nearest } = one as Record<string, unknown>
    if (typeof missing !== 'string' || missing.trim() === '' || typeof what !== 'string' || what.trim() === '') continue
    out.push({ missing: missing.trim(), what: what.trim(), ...(typeof nearest === 'string' && nearest.trim() !== '' ? { nearest: nearest.trim() } : {}) })
  }
  return out
}

/** The paths of a stored files part, tidied as the governs lookup compares them, the blank ones left out. */
export function theFilesNamed(stored: unknown): string[] {
  if (!Array.isArray(stored)) return []
  return (stored as unknown[]).flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [tidyAPath(one)] : []))
}

/** A path as the lookup compares it: no leading `./`, no trailing slash. */
export function tidyAPath(path: string): string {
  return path.trim().replace(/^\.\//, '').replace(/\/+$/, '')
}
