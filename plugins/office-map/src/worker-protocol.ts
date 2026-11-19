// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { LayoutCache } from './geometry.ts'
import { VillageGeometryCache } from './village-geometry.ts'
import { GeometryRuntime } from './geometry-runtime.ts'
export * from './geometry-runtime.ts'

/** Compatibility for geometry studies predating the roster. The page always
 * supplies ownership; its production worker has no legacy allocator. */
export class GeometryEngine extends GeometryRuntime {
  readonly cache: LayoutCache
  readonly villages: VillageGeometryCache
  constructor(compact = false) {
    const cache = new LayoutCache(compact), villages = new VillageGeometryCache()
    super({ build: input => input.roster ? villages.build(input) : cache.build(input) })
    this.cache = cache; this.villages = villages
  }
}
