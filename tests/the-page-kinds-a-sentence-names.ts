// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH KINDS OF PAGE A SENTENCE NAMES, for the tests that hold every list of them to the one list.
 *
 * A decision may govern a page of any kind in PAGE_KINDS (src/shared/what-a-record-names.ts). A sentence that lists
 * some of the kinds by hand tells its reader that only those can be governed. These readers say which kinds a
 * sentence names, each by its English word through kindWord, as a whole word.
 *
 * ONE OR TWO KINDS IS AN EXAMPLE, NOT A LIST. "Such as a module or a flow" and "the module that holds it" are right
 * as they are. Three or more, and not all, is a list written by hand that leaves some out.
 *
 * ONLY THE ENGLISH WORDS. On Node every kind's word is English (readStoredWord in src/shared/i18n.ts), so a Chinese
 * sentence cannot be read for its kinds here. The modules are imported inside each call, so a test that makes an
 * office first still reads them after it.
 */

/** The most kinds a sentence may name and still be an example rather than a list. */
const AN_EXAMPLE_NAMES_AT_MOST = 2

/** Which kinds of page an English sentence names, each by its word as a whole word, in the order of PAGE_KINDS. */
export async function theKindsNamedIn(sentence: string): Promise<string[]> {
  const { PAGE_KINDS } = await import('../src/shared/what-a-record-names.ts')
  const { kindWord } = await import('../src/shared/words.ts')
  return PAGE_KINDS.filter((kind) => new RegExp(`\\b${kindWord(kind).text}\\b`).test(sentence))
}

/** The kinds a sentence names when it lists some of them by hand: more than an example and fewer than all. */
export async function theKindsAPartListNames(sentence: string): Promise<string[]> {
  const { PAGE_KINDS } = await import('../src/shared/what-a-record-names.ts')
  const named = await theKindsNamedIn(sentence)
  return named.length > AN_EXAMPLE_NAMES_AT_MOST && named.length < PAGE_KINDS.length ? named : []
}
