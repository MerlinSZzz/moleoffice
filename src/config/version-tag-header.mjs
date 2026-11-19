// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE HEADER A READ'S VERSION TAG TRAVELS IN, DECLARED ONCE.
 *
 * `src/server/lib/version-tags.ts` puts it on every successful GET of a declared read, and answers 304 when the caller
 * sends it back in If-None-Match. A plugin's page reads the views of interface v1 through the office's own page, and
 * it is told the tag so it can ask "has this changed?" (wave 13x round 15, block 3nJsBlPlYhcl). A page on another
 * origin can read the tag only when the reply names it as readable, so it is in `HEADERS_A_PAGE_MAY_READ` in
 * `src/config/what-a-page-may-read.mjs`.
 */
export const VERSION_TAG_HEADER = 'etag'
