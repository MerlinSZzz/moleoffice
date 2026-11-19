// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TREE INSIDE A PLAN, WORKED OUT FROM THE WORDS EVERY TIME AND NEVER STORED.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TREE COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * A person writing a plan already types their breakdown: Markdown headings for the levels, and
 * bullets, tick boxes and numbered items for the pieces. That IS the tree. This file reads it back
 * out of the blocks `src/shared/plandoc.ts` made, and nothing anywhere stores a level or a parent
 * for a plan line.
 *
 * That is decision 1 of design/ROUND-FOUR-BUILD.md, and the reason is the defect this repository
 * keeps producing: a stored level and the hashes in the line would be the same fact in two places,
 * so editing `## Clamp` to `### Clamp` would leave a stored number wrong with nothing failing.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR RULES, AND THE AWKWARD CASES THEY ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * 1. A heading of level N is an item at depth N - 1. The depth is the number of hashes the person
 *    typed and nothing else. **A document that jumps from `#` to `####` gives an item at depth 3
 *    whose parent is the `#` heading.** Its depth is what was written; its parent is the nearest
 *    heading above it that is shallower. Those are two different facts and this file keeps both,
 *    because renumbering the jump away would hide what the document says.
 *
 * 2. A bullet, a tick box or a numbered item belongs to the nearest heading above it, one deeper
 *    than that heading. **A bullet under `##### levle5` is at depth 5.** There is no cap: the depth
 *    follows the writing.
 *
 * 3. A list item nests under an earlier list item written with fewer leading spaces, and is then one
 *    deeper than that one. Leading spaces on their own are not a level: an indented item with no
 *    shallower item above it in the same section still belongs to the heading. You cannot nest
 *    under nothing.
 *
 * 4. **A list item with no heading anywhere above it is at depth 0.** A plan that opens with a
 *    bullet list is a flat list of top-level items, not a list hidden under an invented heading.
 *
 * Anything else a plan holds — a paragraph, a blank line, a table, a run of lines Mole Office could not
 * read — is the writing between the items. It is not an item and it is not dropped: it stays in the
 * blocks, which are the whole document. This file only says which of them are items.
 *
 * NOTHING HERE READS A DATABASE and nothing here changes a line. It is a pure function of the
 * blocks it is given.
 */

import type { PlanBlock } from './plandoc.ts'

/**
 * The block kinds that are items. Everything else is the writing between them.
 *
 * This list is the only place the answer is written. The type below is read off it, and the loop
 * below narrows to it, so a kind added here that cannot be an item fails the type check rather than
 * being quietly skipped.
 */
const ITEM_KINDS = ['heading', 'bullet', 'tickbox', 'numbered'] as const

export type OutlineItemKind = (typeof ITEM_KINDS)[number]

type ItemBlock = Extract<PlanBlock, { kind: OutlineItemKind }>

function isItemBlock(block: PlanBlock): block is ItemBlock {
  return (ITEM_KINDS as readonly string[]).includes(block.kind)
}

/** One item of a plan's tree. */
export interface OutlineItem {
  /** Which kind of line it was written as. The markers themselves stay in the blocks. */
  kind: OutlineItemKind
  /** How deep it sits. A top-level item is 0. See the four rules above. */
  depth: number
  /** The words, with the hashes, the bullet or the number taken off. */
  text: string
  /** The plan lines this item was made from, in the order they are stored. */
  lineIds: readonly string[]
  /** The items written under it. */
  children: OutlineItem[]
}

/** What an item was made from, kept while the tree is being built. */
interface OpenItem {
  item: OutlineItem
  /** How many leading spaces a list item was written with. A heading is not measured this way. */
  indent: number
  isHeading: boolean
}

/**
 * The plan as a tree of items.
 *
 * Called with the blocks of a whole plan, in the order they are written. The returned items are the
 * top-level ones; each holds its own children.
 */
export function outlineOf(blocks: readonly PlanBlock[]): OutlineItem[] {
  const roots: OutlineItem[] = []
  // The items still open above the line being read, outermost first. The last one is the parent of
  // whatever comes next, once the rules below have closed the ones that cannot be.
  const open: OpenItem[] = []
  const top = (): OpenItem | null => (open.length === 0 ? null : open[open.length - 1]!)

  const attach = (item: OutlineItem): void => {
    const parent = top()
    if (parent === null) roots.push(item)
    else parent.item.children.push(item)
  }

  for (const block of blocks) {
    // A paragraph, a blank line, a table and a run Mole Office could not read are the writing between
    // the items. They stay in the blocks; they are not items.
    if (!isItemBlock(block)) continue

    if (block.kind === 'heading') {
      // A heading closes everything at its own depth or deeper, whether that is another heading or
      // a list item written under one.
      const depth = block.level - 1
      while (open.length > 0 && top()!.item.depth >= depth) open.pop()
      const item: OutlineItem = { kind: 'heading', depth, text: block.text, lineIds: idsOf(block), children: [] }
      attach(item)
      open.push({ item, indent: 0, isHeading: true })
      continue
    }

    // Everything left is a list item: a bullet, a tick box or a numbered item. Close every list item
    // written with as many leading spaces as this one, or more. A heading stops the closing, because
    // a list item never closes the heading it belongs to.
    while (open.length > 0 && !top()!.isHeading && top()!.indent >= block.indent) open.pop()
    const parent = top()
    const depth = parent === null ? 0 : parent.item.depth + 1
    const item: OutlineItem = { kind: block.kind, depth, text: block.text, lineIds: idsOf(block), children: [] }
    attach(item)
    open.push({ item, indent: block.indent, isHeading: false })
  }

  return roots
}

function idsOf(block: PlanBlock): string[] {
  return block.lines.map((line) => line.id)
}

/** One item of a flattened tree, with the items it sits under. */
export interface FlatOutlineItem {
  item: OutlineItem
  /**
   * The items above this one, outermost first, not including it.
   *
   * The depth is not repeated here — it is `item.depth`, and saying it twice would be one fact in
   * two places.
   */
  path: readonly OutlineItem[]
}

/**
 * The same tree as one list, in the order the plan is written.
 *
 * The dense table and the schedule both show many levels at once, so they need the tree laid flat
 * with each item still knowing how deep it is and what it sits under.
 */
export function flattenOutline(items: readonly OutlineItem[]): FlatOutlineItem[] {
  const flat: FlatOutlineItem[] = []
  const walk = (list: readonly OutlineItem[], path: readonly OutlineItem[]): void => {
    for (const item of list) {
      flat.push({ item, path })
      walk(item.children, [...path, item])
    }
  }
  walk(items, [])
  return flat
}
