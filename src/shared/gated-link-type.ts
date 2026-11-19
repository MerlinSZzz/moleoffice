// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GATED_LINK_TYPE` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { LinkType } from '@shared/types.ts'

/**
 * THE LINK TYPE A GATE MAY RIDE ON, and the only one.
 *
 * A gate says how hard a dependency is, and `blocks` is the only type that states a dependency at
 * all. `consumes` says what a thing is made of, `part_of` says where it sits; neither can be
 * half-blocking. Taken from LINK_TYPES rather than typed as a bare string so that a rename of the
 * type stops this file compiling.
 */
export const GATED_LINK_TYPE: LinkType = 'blocks'
