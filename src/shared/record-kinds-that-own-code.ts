// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `RECORD_KINDS_THAT_OWN_CODE` was moved byte for byte out of src/server/lib/implementation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/**
 * The three kinds a relationship may be about.
 *
 * A RELATIONSHIP IS ABOUT A STRUCTURAL THING; A PROBLEM DOES NOT OWN CODE. A note, a decision or a
 * session naming a pattern would put a statement about ownership on a record that cannot hold one,
 * and every read of that file would then report an owner nobody would recognise.
 */
export const RECORD_KINDS_THAT_OWN_CODE = ['module', 'block', 'pipeline'] as const
