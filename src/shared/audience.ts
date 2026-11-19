// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO A PASSAGE IS FOR, AND WHICH OF THREE READERS IS ASKING.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------------
 *
 * Two short lists of words and one function. The function is the ONLY place the rule "does this
 * reader see this passage?" is worked out. Every other file asks it rather than repeating it,
 * because the same rule written twice is this repository's own recurring defect.
 *
 * `design/round-ten/design/projections.md` §6.1 is the design. Wave 1 of
 * `design/ROUND-TEN-BUILD-PLAN.md` builds this much: the two vocabularies and the rule. Two things
 * that belong here arrive with the waves that first need them, and they are named so nobody builds
 * a second home for them:
 *
 *   - `hiddenFromReader` — how many blocks a reader is not being shown — is §8.2 and arrives with
 *     the block filter. It goes in THIS file, beside the rule it depends on, so that the rule and
 *     the count of what the rule removed are not two independent readings of the same field.
 *   - `MACHINERY_WORD` and `isAudience` arrive with the mark a marked block wears (§16) and with
 *     the write-path validator (§4.3). Neither has a caller yet, and a constant with no caller is
 *     a thing to maintain for no behaviour.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS NOT SETTLED
 * ---------------------------------------------------------------------------------------------
 *
 * TWO AUDIENCES, WHERE THE OWNER LISTED FOUR. `design/ROUND-TEN-OWNER-MESSAGE.md:1857-1861` names
 * `normal human`, `developer`, `agent` and `system`. This builds two, on the argument that as a
 * property of CONTENT those four are nested rather than independent: everything a normal reader
 * gets a developer gets, and everything a developer gets an agent gets. So the field is a floor
 * over a ladder, not a set.
 *
 * NARROWING A VOCABULARY THE OWNER STATED IS A PROPOSAL, NOT A DECISION. It is open as proposal
 * `Ys8Oy7Oy5BNg` and it is theirs to settle. If they answer "four", `readerSees` becomes a set test and
 * this file is where that change lands — no call site moves, because no call site holds the rule.
 */

import type { SummaryBlock } from './types.ts'

/**
 * Which of three positions the thing consuming this content is in right now.
 *
 * It is NOT an actor. An actor is who a write is attributed to (`ACTOR_TYPES` in `types.ts`). A
 * person may set the writer to `claude (agent)` in the sidebar and is still reading as a person.
 *
 * It is NOT a permission. There is no content any reader is forbidden. What a caller may HAVE is a
 * different question, decided on the server, and it never asks this.
 */
export const READERS = ['normal', 'developer', 'agent'] as const
export type Reader = (typeof READERS)[number]

/**
 * The least technical reader a passage is for. Absent means everyone.
 *
 * DELIBERATELY NOT THE SAME WORDS AS `READERS`, AND THE PLURAL IS THE POINT. `developer` is a
 * position a reader is in; `developers` is a statement about a paragraph. When the two shared one
 * word, `readerSees(audience, reader)` compiled with its arguments swapped, because the word was a
 * member of both unions. The plural closes that: `'developers'` is not assignable to `Reader`, so a
 * swap is a compile error. Do not tidy these into agreement.
 */
export const AUDIENCES = ['everyone', 'developers'] as const
export type Audience = (typeof AUDIENCES)[number]

/**
 * THE WHOLE DECISION. One table, three readers, two audiences.
 *
 * A normal reader does not see developer content. A developer sees everything. An agent receives
 * everything, and `true` here is what says so — an agent's answer is not a filter that happens to
 * pass, it is a rule that says an agent is never shown less.
 */
export function readerSees(audience: Audience | undefined, reader: Reader): boolean {
  if (audience === undefined || audience === 'everyone') return true
  return reader !== 'normal'
}

/**
 * HOW MANY BLOCKS THIS READER IS NOT BEING SHOWN BECAUSE OF AUDIENCE, over the WHOLE tree.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS IS THE FUNCTION THAT MAKES THE WHOLE MECHANISM SAFE
 * ---------------------------------------------------------------------------------------------
 *
 * `projections.md` §8, and it is stated there as a property of surfaces rather than of a component:
 * **hiding one block changes a number the reader can see.** Hiding that nobody is told about is
 * classifying away somebody's words; hiding that changes a number on the same page is a fold. The
 * count is what separates the two, so it is unconditional — it is drawn whether or not the reader
 * can press it, and §8.3 says what the unpressable case reads.
 *
 * DISJOINT FROM THE RUNG'S OWN COUNT BY CONSTRUCTION. A top-level block the reading length already
 * left out is SKIPPED here, so it is counted once and counted as "shorter". Only blocks the length
 * WOULD have drawn are counted here. Without that clause a report drawn at `card`, where roughly 50
 * of 61 blocks are already not drawn, would tell the reader 51 blocks were missing when 50 is the
 * truth — two numbers over overlapping sets, which is worse than one.
 *
 * `rungDraws` is the set of TOP-LEVEL positions the length chose, or null when it draws all of them
 * — which is what the module page and a report at its default length both mean.
 *
 * A MARKED CONTAINER TAKES ITS DESCENDANTS WITH IT and they are counted too, because they are not
 * on the page either. It does not recurse into one: they are already counted by `descendantCount`.
 *
 * OVER THE RECORD'S BLOCK TREE, NOT OVER THE DOM, AND `tabs` IS WHY THAT DISTINCTION EXISTS.
 * `TabsFigure` draws the open tab only, so a marked block behind a closed tab is not in the DOM
 * whatever this returns. It is counted anyway: it is a block of this report the reader is not being
 * shown, and the tab is a control they can press. Do not make this depend on tab state — the number
 * would flicker as somebody reads through the tabs, and it would mean lifting every tab's local
 * `open` into the component above it for a number that then said something less useful.
 */
export function hiddenFromReader(
  blocks: readonly SummaryBlock[],
  rungDraws: ReadonlySet<number> | null,
  reader: Reader,
): number {
  let n = 0
  blocks.forEach((block, i) => {
    if (rungDraws !== null && !rungDraws.has(i)) return
    if (!readerSees(block.audience, reader)) {
      n += 1 + descendantCount(block)
      return
    }
    for (const child of childrenOf(block)) n += hiddenFromReader(child, null, reader)
  })
  return n
}

/** How many blocks are under this one, at any depth. A block that holds none answers 0. */
export function descendantCount(block: SummaryBlock): number {
  let n = 0
  for (const child of childrenOf(block)) {
    n += child.length
    for (const one of child) n += descendantCount(one)
  }
  return n
}

/**
 * THE LISTS OF BLOCKS ONE BLOCK HOLDS. Empty for the sixteen that hold none.
 *
 * THE SWITCH IS EXHAUSTIVE OVER THE UNION ON PURPOSE, the same way `proseOfBlocks` is: a container
 * added to `SummaryBlock` without a case here stops this file compiling rather than quietly
 * contributing nothing to a count the reader is trusting.
 */
function childrenOf(block: SummaryBlock): readonly (readonly SummaryBlock[])[] {
  switch (block.type) {
    case 'section':
      return [block.blocks]
    case 'columns':
      return block.columns
    case 'grid':
      return [block.blocks]
    case 'tabs':
      return block.tabs.map((t) => t.blocks)
    // THE FIFTH CONTAINER. Its parts are named lists of blocks, so it holds one list per part.
    //
    // THE SWITCH DID NOT STOP COMPILING WHEN `beside` WAS ADDED TO THE UNION, and the comment below
    // says why: the runtime fallback after the switch answers `[]` for a type this build has never
    // heard of, and that fallback is reached by any type with no case here. Measured on 28 August
    // 2026 — `npx tsc --noEmit` was clean with this arm missing, and a composition's blocks were
    // silently absent from the count. The design said this file was a compile stop. It is not.
    case 'beside':
      return block.parts.map((p) => p.blocks)
    // A BOX OF QUESTIONS holds one list, as a section does.
    case 'box':
      return [block.blocks]
    case 'choice':
    case 'fillin':
    case 'button':
    case 'text':
    case 'heading':
    case 'finding':
    case 'callout':
    case 'metrics':
    case 'keyvalue':
    case 'list':
    case 'checklist':
    case 'code':
    case 'quote':
    case 'path':
    case 'chart':
    case 'math':
    case 'table':
    case 'timeline':
    case 'image':
      return []
  }
  // A TYPE THIS BUILD HAS NEVER HEARD OF. The switch above is exhaustive over the union, so this
  // line is unreachable in TypeScript — and blocks arrive as JSON out of the database, so a row
  // written by a newer version carries a type that is in no case here. Without this the walk
  // returned `undefined` and the whole report failed to render, which is the one thing
  // `SummaryBlocks`' own refusal arm exists to prevent. Found by tests/viz.test.ts.
  //
  // IT ANSWERS `[]` AND THAT IS HONEST RATHER THAN A GUESS: this build cannot read the block's
  // children, it does not draw them either, and the renderer draws the block itself as a visible
  // refusal. The count is over what this build would have drawn.
  return []
}
