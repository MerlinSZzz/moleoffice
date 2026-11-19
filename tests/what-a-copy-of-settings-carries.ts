// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COPY OF src/config/settings.mjs MUST CARRY: the file itself and every file of this repository it
 * imports, found by the walk the office already uses, `walkFrom` in src/config/import-graph.mjs.
 *
 * Three tests copy settings.mjs into a folder of their own and import it there. Each listed the files it
 * copied by hand. When settings.mjs began to import src/config/the-suite-workers.mjs, all three failed with
 * ERR_MODULE_NOT_FOUND, and wave 13j's round 39 bounced at the merge (entry u7zMzTD6L870). Reading the
 * imports means that a module settings.mjs starts to import is copied without anybody listing it.
 *
 * An import the walk cannot place, or a file it cannot read, throws and names it: a copy that left a file
 * out would fail later and say less.
 */

import { walkFrom } from '../src/config/import-graph.mjs'

export const SETTINGS_MODULE = 'src/config/settings.mjs'

/** The paths from the repository's root that a copy of settings.mjs needs, settings.mjs among them. */
export function whatACopyOfSettingsCarries(repo: string): string[] {
  const walked = walkFrom(SETTINGS_MODULE, repo)
  const missed = [
    ...walked.unresolved.map((one) => `${one.from} imports ${one.specifier}, which the walk cannot place`),
    ...walked.couldNotRead.map((one) => `${one.file} could not be read: ${one.why}`),
  ]
  if (missed.length > 0) throw new Error(`a copy of ${SETTINGS_MODULE} would leave a file out: ${missed.join('; ')}`)
  return walked.files
}
