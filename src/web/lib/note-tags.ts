// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTE'S TAGS AS THE PAGES TAKE THEM IN AND DRAW THEM. The kind keeps them and the door checks them
 * (src/shared/kinds/quick-note.ts). The note page and My notes both draw each tag in the colour worked out here.
 */
import { A_NOTE_HOLDS_TAGS, A_TAG_HOLDS } from '@shared/kinds/quick-note.ts'
import { LABEL_COLOURS, type LabelColour } from '@shared/message-label.ts'

/** Why typed words make no new tag. */
export type ATagRefused = 'empty' | 'long' | 'twice' | 'full'

/**
 * THE TAG THAT TYPED WORDS MAKE, or why they make none. Spaces at either end are taken off, and a run of spaces inside
 * becomes one space.
 */
export function aTagFrom(typed: string, tags: readonly string[]): { tag: string } | { refused: ATagRefused } {
  const tag = typed.trim().replace(/\s+/gu, ' ')
  if (tag === '') return { refused: 'empty' }
  if (tag.length > A_TAG_HOLDS) return { refused: 'long' }
  if (tags.some((one) => one.toLowerCase() === tag.toLowerCase())) return { refused: 'twice' }
  if (tags.length >= A_NOTE_HOLDS_TAGS) return { refused: 'full' }
  return { tag }
}

/**
 * THE COLOUR A TAG IS DRAWN IN, one of the chat's label colours. It is worked out from the tag's letters, with capitals
 * the same as small letters, so a tag has the same colour in the note, on every card of My notes, and on every note.
 */
export function theColourOfATag(tag: string): LabelColour {
  let sum = 0
  for (const char of tag.toLowerCase()) sum = (sum * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  return LABEL_COLOURS[sum % LABEL_COLOURS.length] ?? 'grey'
}
