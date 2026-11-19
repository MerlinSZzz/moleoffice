// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The types for `tools/detail-readers.mjs`, which is JavaScript because every other script in
 * `tools/` is. `tests/detail-readers-are-current.test.ts` imports `currentText` to compare a fresh
 * scan against the checked-in file, and TypeScript needs to be told what it gets back.
 */

/** How many places in `src/web` ask each surface how much to say, scanned now. */
export function countReaders(surfaces: readonly string[]): Record<string, number>

/** Count the two literal call forms in one source file after comments have been removed. */
export function countReadersInText(text: string, surfaces: readonly string[]): Record<string, number>

/** The whole text the generated file would hold for those counts. */
export function generatedText(counts: Record<string, number>): string

/** The whole text a fresh scan produces, which is what the checked-in file must equal. */
export function currentText(): string

/** Every `.ts` and `.tsx` under `src/web` except the one file that reaches every surface. */
export function webFiles(): string[]
