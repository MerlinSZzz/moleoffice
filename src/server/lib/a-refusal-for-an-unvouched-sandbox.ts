// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `aRefusalForAnUnvouchedSandbox` was moved byte for byte out of src/server/lib/sealed-tip.ts, with no change of behaviour.
 * `aRunNamesASandbox` was moved byte for byte out of src/server/lib/sealed-tip.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'

/**
 * A REFUSAL MADE BECAUSE `theSandboxFolderOf` ANSWERED NULL FOR THIS RUN, handed on. Inside a write the refusal takes
 * back the count made above, so it is made again once the write is taken back, and only for a run that names a sandbox.
 */
export function aRefusalForAnUnvouchedSandbox<E extends Error>(data: Record<string, unknown>, refusal: E): E {
  return aRunNamesASandbox(data) ? gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('the-office-vouches-for-a-runs-sandbox')) : refusal
}
export const aRunNamesASandbox = (data: Record<string, unknown>): boolean => data['sandbox'] !== undefined && data['sandbox'] !== null
