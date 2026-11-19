// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The type of the module Vite serves this app so it knows which port its API is on.
 *
 * The module has no file: `vite.config.ts` resolves and loads `virtual:mole-office-api` and writes
 * the port into it as it serves it, out of the same declaration the API server reads. That is the
 * point — a port written down in the browser app would be a second copy of MOLE_OFFICE_PORT, and
 * moving the port would leave it behind. This declaration is what lets TypeScript see it, and
 * `src/web/lib/api-port.ts` is the only importer.
 */
declare module 'virtual:mole-office-api' {
  /**
   * The port the API answers on, or null because this page came out of a build.
   *
   * Null means the server that served this page is the API, so the page's own origin is the answer.
   * A number means Vite served the page on a different port and this is the API's.
   */
  export const apiPortInDevelopment: number | null
}
