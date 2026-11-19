// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW: ONE OFFICE FLOW AS ONE RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPOSAL
 * ---------------------------------------------------------------------------------------
 *
 * Proposal 1LaCQBRYRjls, option A, settled
 * . Until this kind the office could not count its own
 * procedures: the first flow inventory (report jDwkhne4tDWR) was made by reading files and tool
 * code, and eight of the nineteen flows it counted were written nowhere at all. The register is
 * the answer the next inventory reads: one record per flow, saying its name, where it is declared,
 * who runs it, what it produces and whether code governs it.
 *
 * WHY THERE IS NO GATE. The proposal says so in as many words: nothing is blocked and the office
 * checks nothing against a flow in this piece. A flow record says what ACTUALLY happens, which a
 * document written before the thing changed cannot say. The register is an ASOP, grown and tuned
 * from records, as design/REVIEW-2026-09-07.md sets out. So a `flow` is
 * refused nothing an ordinary record is allowed, and filing one blocks nothing.
 */

/** The kind word, in one place, the way `GOAL_KIND` is. */
export const FLOW_KIND = 'flow'

// THE ROLE WORDS COME FROM THE ROLES MODULE, never spelled here. This file may not name a role:
// `tests/one-declaration-decides-what-a-role-may-do.test.ts` refuses a second role word anywhere
// but the one shared shape the declaration is read against, and this list is a vocabulary of who
// runs a flow rather than a permission. So the four words that are roles are imported, and only
// the three that are not roles — a person, a steward and the office itself — are written here.
import { THE_INSPECTOR, THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from './roles.ts'

/**
 * THE WORDS THE OFFICE USES FOR WHO RUNS A FLOW. Open, not closed.
 *
 * `runs` is free text on purpose: a flow can be run by two people at once, the office itself, or
 * "the secretary starts it and the supervisor runs it", and a closed vocabulary would refuse the honest
 * sentence and invite a coded one instead. This list is the words the product writes when it does
 * not know better, and the description of the field on the kind reads it rather than retyping it.
 * The four role words are read from `./roles.ts`; `steward` is not a card here, and `person` and
 * `the office itself` are not roles at all, so the three stay as the words they are.
 */
export const FLOW_RUNNERS = [
  'person',
  THE_SECRETARY,
  THE_SUPERVISOR,
  THE_WORKER,
  THE_INSPECTOR,
  'steward',
  'the office itself',
] as const
