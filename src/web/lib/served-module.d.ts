// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The type of the module Vite serves this app so it can say how old its own code is.
 *
 * The module has no file: `vite.config.ts` resolves and loads `virtual:mole-office-served` and
 * stamps it as it serves it, so the values are read from the disk at that moment rather than
 * written down anywhere. That is the point — a stamp somebody had to remember to update is a stamp
 * that is wrong exactly when it matters. This declaration is what lets TypeScript see it, and
 * `src/web/lib/served.ts` is the only importer.
 */
declare module 'virtual:mole-office-served' {
  /** The newest source under `src/` when these modules were served, local wall-clock. */
  export const servedAt: string
  /** Which file that was, relative to the checkout. Null for a built page. */
  export const newestSourceFile: string | null
  /** True when this came out of `vite build` rather than a dev server. */
  export const fromABuild: boolean
  /** What the files the page is built from held when it was built. Null from a dev server. */
  export const contentDigest: string | null
}
