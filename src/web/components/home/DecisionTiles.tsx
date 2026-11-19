// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FORKS WAITING ON A PERSON, AS A LIST OF CARDS.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE LIST. THE CARD IS `DecisionCard` IN components/Governance.tsx
 * ---------------------------------------------------------------------------------------
 *
 * This file drew the card and that file drew the panel the card opens, so one fork was drawn in two
 * files — and two waves of this campaign each named a third file, `DecisionCard.tsx`, which does not
 * exist. Whichever an implementer edited, the other went on drawing the old card. From round ten
 * `Governance.tsx` owns it and this renders it.
 *
 * WHAT IS LEFT HERE IS THE GRID: the rows, in order, one card each. Three surfaces mount it — Home's
 * band, the governance queue, and the record page through `ProposalGovernance` — and all three get
 * the same card.
 *
 * IT PRESENTS PROPS AND DOES NOTHING ELSE. No fetch, no sort, no count, no threshold, no phrase
 * that is a claim about the data — all of that is in `home/decisions.ts`, shared with the queue, so
 * the two surfaces cannot say different things about the same records.
 */

// THE CARD IS DRAWN IN ONE FILE AND THIS IS NOT IT. `Governance.tsx` owns the decision card from
// round ten: it already held the panel a card opens — the question, the options, the reasoning box
// and the act — so a card drawn here as well was one fork drawn in two files, which is this
// repository's own named defect sitting on the surface it cares most about.
import { DecisionCard } from '../Governance.tsx'
import type { DecisionsViewProps } from './decisions.ts'

/**
 * THE COUNTS ARE NOT DRAWN HERE. The band above prints them once, so that the cards and the head
 * line cannot say different things about the same four records — and the cards ARE the arithmetic:
 * four enclosures are four decisions, counted before a word is read.
 */
export function DecisionTiles({ rows, here, onOpen, onSettled, inspect }: DecisionsViewProps) {
  return (
    <ul className="dq-grid">
      {rows.map((row) => (
        <DecisionCard
          key={row.recordId}
          row={row}
          here={here}
          onOpen={onOpen}
          onSettled={onSettled}
          inspect={inspect}
        />
      ))}
    </ul>
  )
}
