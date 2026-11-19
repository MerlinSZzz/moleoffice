// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `ACROSS_WORKSPACES` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/**
 * The sentinel that asks for EVERY workspace at once, spelled so nobody reaches it by accident.
 *
 * `workspaceId` on the reads below is REQUIRED — no default — because a caller that does not say
 * which project it means has not decided, and the old default answered about one particular project
 * while looking like it answered about all of them. There are honest callers that really do want
 * the whole installation: the export, the migration proof, the seed. They say so with this, and
 * `workspaceIdFault` refuses `*` as an id, so it can never arrive from a header and be mistaken for
 * a project.
 */
export const ACROSS_WORKSPACES = '*'
