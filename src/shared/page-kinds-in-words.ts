// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KINDS OF PAGE A DECISION MAY GOVERN, IN WORDS, built from PAGE_KINDS (src/shared/what-a-record-names.ts).
 *
 * The decision kind's two descriptions, the refusal of a record that is not a page and the governs check's nightly
 * message each name the list. Each reads it from here, so a kind added to PAGE_KINDS is named in all of them at once,
 * and none of them names three kinds of nine.
 */
import { PAGE_KINDS } from './what-a-record-names.ts'
import { kindWord } from './words.ts'

/** "a module, pipeline, … or department": every page kind by its word, in the order PAGE_KINDS holds them. */
export function thePageKindsInWords(): string {
  const words = PAGE_KINDS.map((kind) => kindWord(kind).text)
  return `a ${words.slice(0, -1).join(', ')} or ${words[words.length - 1] ?? ''}`
}
