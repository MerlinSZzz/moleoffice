// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The types for what `tools/the-page-is-ready.mjs` exports.
 *
 * The wait is plain JavaScript because the photographing tools are plain JavaScript and cannot
 * import TypeScript. This file is how `tests/helpers.ts` re-exports the one copy of it instead of
 * keeping a second.
 */

import type { Page } from 'playwright'

/** The attribute on the `<html>` element that says which address the page has finished drawing. */
export const READY_ATTRIBUTE: string

/** How long the wait allows by default, in milliseconds. */
export const READY_TIMEOUT_MS: number

/** Wait until this page has finished drawing the address it is at. Throws when it does not. */
export function waitForThePage(page: Page, timeoutMs?: number): Promise<void>
