// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER OF A DECISION'S `governs`.
 *
 * The server's lookup and check (src/server/lib/governs.ts) and the record page's Governs section both read stored
 * entries through `theGovernedPlaces`, so the page draws exactly the places the lookup matches.
 */

/** One entry of `governs`, as stored: a module, flow or pipeline by its id, or a repository path. */
export type GovernedPlace = { record: string } | { path: string }

/** The field, and the kind that has it. */
export const GOVERNS_FIELD = 'governs'

/** A path as the lookup compares it: no leading `./`, no trailing slash. */
export function tidyGovernedPath(path: string): string {
  return path.trim().replace(/^\.\//, '').replace(/\/+$/, '')
}

/** The places one stored `governs` value names, leaving out anything the shape check would have refused. */
export function theGovernedPlaces(stored: unknown): GovernedPlace[] {
  if (!Array.isArray(stored)) return []
  const out: GovernedPlace[] = []
  for (const place of stored as unknown[]) {
    if (place === null || typeof place !== 'object') continue
    const { record, path } = place as { record?: unknown; path?: unknown }
    if (typeof record === 'string' && record.trim() !== '') out.push({ record: record.trim() })
    else if (typeof path === 'string' && path.trim() !== '') out.push({ path: tidyGovernedPath(path) })
  }
  return out
}
