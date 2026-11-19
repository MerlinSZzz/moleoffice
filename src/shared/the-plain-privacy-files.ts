// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAIN PRIVACY FILES: THE ROWS OF tests/house-rules.mjs WITH CLASS P AND NO MARK, NAMED IN ONE PLACE.
 *
 * Each of the three paths that publish something runs these files against the tree it ships: the clean public copy
 * (scripts/clean-version.mjs), the installer build (scripts/package-linux.mjs and scripts/package-mac.mjs) and the
 * plugin-only lane of the merge tool (tools/merge-tool/plugin-lane.mjs). Every one of them reads the list here, from
 * the text of the house-rule list, so no path keeps its own copy of the names (invariant 9).
 *
 * The text is read by the house-rule parser the merge tool classes with, so the two can never disagree about a row.
 * An absent list and a list with no plain privacy file are refused, never answered with an empty list: running
 * nothing would look the same as passing. The caller reads the text; this module reads no file and imports only
 * the parser, so plain node can load it from a script or from the merge tool.
 */

import { HOUSE_RULES_PATH, readHouseRules } from './merge-class.ts'

/** The paths, from the root of a checkout, in path order. `text` is the list's text, or null when there is none. */
export function thePlainPrivacyFiles(text: string | null): string[] {
  if (text === null) throw new Error(`${HOUSE_RULES_PATH} is not there, so the plain privacy files cannot be named.`)
  const files = [...readHouseRules(text)].filter(([, rule]) => rule.class === 'P' && rule.mark === undefined).map(([path]) => path).sort()
  if (files.length === 0) throw new Error(`${HOUSE_RULES_PATH} names no plain privacy file (class P with no mark), so there is nothing to run.`)
  return files
}
