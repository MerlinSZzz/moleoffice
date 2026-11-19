// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER TWO JSON TREES SAY THE SAME THING.
 * `sameJson` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour. That
 * file imports it back and re-exports it.
 */

/** True when two JSON trees say the same thing, so a stored value resent unchanged is not a hand-written one. */
// Exported because src/server/lib/records/territory.ts reads it too.
export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
