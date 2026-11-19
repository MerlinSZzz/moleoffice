// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `WORK_DOMAIN_KIND` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/** The stored kind word, in one place, so a string literal cannot drift from `RECORD_KINDS`. */
export const WORK_DOMAIN_KIND = 'work_domain'
