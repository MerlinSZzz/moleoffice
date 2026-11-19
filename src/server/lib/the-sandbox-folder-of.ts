// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theSandboxFolderOf` was moved byte for byte out of src/server/lib/sealed-tip.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { gateMet } from './gate-counts.ts'
import { aRunNamesASandbox } from './a-refusal-for-an-unvouched-sandbox.ts'
import { theFolderTheSandboxFieldNames } from '../db/the-folder-the-sandbox-field-names.ts'

/**
 * THE FOLDER OF THE SANDBOX THE OFFICE RECORDED FOR A RUN, or null when it cannot be vouched for.
 *
 * The run's `sandbox` field is written once, by its launcher, never by the run (lib/records/may-write.ts,
 * assertMayWriteASandbox). A launcher can itself be started inside a sandbox, where it writes the
 * folder its caller named. So the folder is also held against the container row that
 * `tools/sandbox.mjs up` registered on the host: that row must be a container named
 * `mole-office-sandbox-<the folder's name>`, and its own words must name exactly this folder. Anything
 * else is null. Null makes the checker hand the file on rather than decide it, which is the loud
 * direction.
 *
 * A NULL FOR A RUN THAT NAMES A SANDBOX IS THE GATE the-office-vouches-for-a-runs-sandbox, counted here, where each of
 * its readers asks (wave 13r round O): the files seal, a next round, a worker run, a resolve brief and a write from the run.
 * A reader that refuses inside a write hands its refusal to `aRefusalForAnUnvouchedSandbox`, so the count stays.
 */
export function theSandboxFolderOf(data: Record<string, unknown>): string | null {
  const folder = theFolderTheSandboxFieldNames(data['sandbox'])
  if (folder === null && aRunNamesASandbox(data)) gateMet('the-office-vouches-for-a-runs-sandbox')
  return folder
}
