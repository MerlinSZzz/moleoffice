// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A STEP IS DRAWN ON THE BIG MAP OF A PROJECT'S ARCHITECTURE.
 *
 * The big map is the upper part of the architecture diagram: five rows from top to bottom and two side columns. A
 * step of a block pipeline that stands for one box of the diagram carries one of these words in `data.tier`
 * (src/shared/kinds.ts, kind `block`). The order of this list is the order the map draws them in: the five rows first,
 * top to bottom, then the left column, then the right one.
 *
 * A STEP WITH NO TIER IS NOT PLACED. The map lists it under its own heading, never in a guessed row.
 */
export const MAP_TIERS = ['ways-in', 'gate', 'services', 'data', 'stores', 'hosting', 'runtime'] as const

export type MapTier = (typeof MAP_TIERS)[number]

/** The two tiers drawn as columns beside the five rows, left and then right. */
export const MAP_SIDE_COLUMNS: readonly MapTier[] = ['hosting', 'runtime']
