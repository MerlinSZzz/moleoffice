// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A LINE, AND EVERY LINE INDENTED UNDER IT, INSIDE ONE DOCUMENT.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE ONLY KEY MOLE OFFICE ANSWERS IN A PLAN, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A plan is written in one ordinary text box. Selection, undo, redo, caret placement, select all,
 * cut, copy and paste are the BROWSER'S, and nothing in this product touches them — an earlier
 * build gave every line its own box, had to reimplement all of that, and got an editor worse than
 * a text file. See design/PLANNING-WORKSPACE.md section 1.
 *
 * One thing a text box cannot do is move a bullet together with the lines nested under it. That is
 * worth a key, so it has one, and it is the only key this file knows about.
 *
 * ---------------------------------------------------------------------------------------
 * IT RETURNS A REPLACEMENT, NOT A NEW DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * The answer is "replace the characters from here to here with this text". The caller hands that to
 * the browser's own insert command, so the move goes onto the browser's undo history and Ctrl+Z
 * walks it back like any other edit. Handing back a whole new document would mean setting the box's
 * value, which throws that history away.
 *
 * NOTHING IS EATEN AND NOTHING IS NORMALISED. The lines are reordered and not one character of them
 * is changed: no trimming, no re-indenting, no renumbering. The only characters this file looks at
 * are the leading spaces, and only to work out what is nested under what.
 *
 * A refusal is a sentence, never a dropped press. Moving the top bullet up has nowhere to go, and a
 * press that quietly did nothing reads as broken.
 */

import { linesOfBody } from './plandoc.ts'

/** How many spaces a line starts with. This is the only thing nesting is read from. */
export function leadingSpaces(text: string): number {
  const match = /^ */.exec(text)
  return match === null ? 0 : match[0].length
}

/**
 * Where the run of lines indented under this one ends.
 *
 * A line is under this one when it starts with MORE spaces, and the run stops at the first line
 * that does not. A blank line stops it too, because a blank line starts with no spaces — so moving
 * a bullet moves what is nested under it and not the paragraph after the gap. That is a rule about
 * the shape somebody typed and it is deliberately not clever.
 */
export function subtreeEnd(lines: readonly string[], at: number): number {
  const mine = leadingSpaces(lines[at]!)
  let end = at + 1
  while (end < lines.length && leadingSpaces(lines[end]!) > mine) end += 1
  return end
}

/** What a move press did. `moved` false means nothing changed and `refused` says why. */
export type Moved =
  | {
      moved: true
      /** The first character of the document to replace. */
      from: number
      /** One past the last character to replace. */
      to: number
      /** What goes in their place. */
      text: string
      /** Where the caret sits afterwards, counted in the document as it will then be. */
      caret: number
      refused: null
    }
  | { moved: false; refused: string }

/** Where each line of a document starts, counted in characters from the top. */
function startsOf(lines: readonly string[]): number[] {
  const starts: number[] = []
  let at = 0
  for (const line of lines) {
    starts.push(at)
    at += line.length + 1
  }
  return starts
}

/** Which line a character offset is in. */
function lineAt(starts: readonly number[], lines: readonly string[], offset: number): number {
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    if (offset >= starts[at]!) return at
  }
  return 0
}

/**
 * MOVE THE LINE THE CARET IS IN, AND EVERY LINE INDENTED UNDER IT, PAST THE ONE BESIDE IT.
 *
 * "Beside it" is the nearest line above or below at the same indentation, taken with its own nested
 * lines. When there is none, the press is refused and the sentence says so.
 *
 * The caret keeps its place in its own line, so pressing the key twice moves the same lines twice.
 */
export function moveSubtree(body: string, caret: number, way: 'up' | 'down'): Moved {
  const lines = linesOfBody(body)
  const starts = startsOf(lines)
  const at = lineAt(starts, lines, caret)
  const column = caret - starts[at]!
  const mine = leadingSpaces(lines[at]!)
  const end = subtreeEnd(lines, at)
  const block = lines.slice(at, end)

  if (way === 'up') {
    let start = at - 1
    while (start > 0 && leadingSpaces(lines[start]!) > mine) start -= 1
    if (start < 0 || leadingSpaces(lines[start]!) !== mine) {
      return {
        moved: false,
        refused: 'There is nothing above this line at the same indentation for it to move past.',
      }
    }
    const above = lines.slice(start, at)
    const from = starts[start]!
    const to = starts[end - 1]! + lines[end - 1]!.length
    return {
      moved: true,
      from,
      to,
      text: [...block, ...above].join('\n'),
      caret: from + column,
      refused: null,
    }
  }

  if (end >= lines.length || leadingSpaces(lines[end]!) !== mine) {
    return {
      moved: false,
      refused: 'There is nothing below this line at the same indentation for it to move past.',
    }
  }
  const nextEnd = subtreeEnd(lines, end)
  const below = lines.slice(end, nextEnd)
  const from = starts[at]!
  const to = starts[nextEnd - 1]! + lines[nextEnd - 1]!.length
  const belowText = below.join('\n')
  return {
    moved: true,
    from,
    to,
    text: [...below, ...block].join('\n'),
    caret: from + belowText.length + 1 + column,
    refused: null,
  }
}
