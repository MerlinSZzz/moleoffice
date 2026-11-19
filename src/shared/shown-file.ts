// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILE TYPES THE REPORT DRAWS AS A PAGE OF THEIR OWN, AND NOT AS A FILE TO SAVE.
 *
 * The file door turns one of these types into a generated page when the report's press asks for
 * it, on open=1 together with shown=1; the report's file block asks for that page on one press.
 * The two sides must agree on the type strings, and the web bundle
 * must not import the reader that builds the page (it imports node:zlib), so the names live here.
 *
 * A Word document is one exact type. The text files are their own types: Markdown is shown as its
 * text and is not rendered, and JSON, CSV and logs are text too. Nothing here decides that a file is
 * safe; it only names what the office knows how to show safely.
 */
export const WORD_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The bare media types shown as their own text. Parameters are dropped before the comparison. */
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json'])

export type ShownFileKind = 'word' | 'text'

/** The page a shown type asks for, or null when the type is not drawn this way. */
export function theShownFileKind(type: string | null): ShownFileKind | null {
  const bare = (type ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (bare === WORD_CONTENT_TYPE) return 'word'
  if (TEXT_TYPES.has(bare)) return 'text'
  return null
}
