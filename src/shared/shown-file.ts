// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILE TYPES THE OFFICE DRAWS AS WORDS IN ITS OWN PAGE, AND THE SHAPE THE DOOR SENDS THEM IN.
 *
 * The file door answers one of these types with its words as data when the page asks with words=1;
 * the report's file block and the office's page for one file draw those words themselves. The two
 * sides must agree on the type strings and on the shape, and the web bundle must not import the
 * reader that reads a Word document (it imports node:zlib), so both live here.
 *
 * A Word document is one exact type. Markdown is its own kind, so the page draws it as Markdown with
 * the office's one Markdown reader. JSON, CSV and logs are text. Nothing here decides that a file is
 * safe; it only names what the office knows how to draw safely. The shape is an answer, not a stored
 * one: nothing writes it anywhere.
 */
export const WORD_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The bare media types shown as their own text. Parameters are dropped before the comparison. */
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'application/json'])
const MARKDOWN_TYPE = 'text/markdown'

export type ShownFileKind = 'word' | 'text' | 'markdown'

/** How a shown type is drawn, or null when the type is not drawn this way. */
export function theShownFileKind(type: string | null): ShownFileKind | null {
  const bare = (type ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (bare === WORD_CONTENT_TYPE) return 'word'
  if (bare === MARKDOWN_TYPE) return 'markdown'
  if (TEXT_TYPES.has(bare)) return 'text'
  return null
}

/** One run of a Word paragraph's text. A tab and a line break are in `text` as `\t` and `\n`. */
export interface ShownRun {
  text: string
  bold: boolean
  italic: boolean
}

/** One block of a Word document, as the page draws it. A table cell holds blocks of its own. */
export type ShownBlock =
  | { kind: 'heading'; level: number; runs: ShownRun[] }
  | { kind: 'paragraph'; runs: ShownRun[] }
  | { kind: 'list'; ordered: boolean; items: { level: number; runs: ShownRun[] }[] }
  | { kind: 'table'; rows: { cells: { span: number; blocks: ShownBlock[] }[] }[] }

/** What the file door sends on words=1. `name` is the name the record gives the file. */
export type ShownFile = { name: string } & (
  | { kind: 'word'; blocks: ShownBlock[]; picturesLeftOut: boolean }
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; text: string }
)

/** The first segment of the office's page for one file, #/file/<record>/<path>. */
export const SHOWN_FILE_SEGMENT = 'file'
