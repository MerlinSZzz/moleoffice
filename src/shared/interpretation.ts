// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN WORDS CAN BE READ TWO WAYS, THE AGENT TAKES THE MOST REASONABLE READING AND SAYS SO.
 * Criterion P63, as the owner narrowed it on 11 November 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P63 of `design/permissions/ACCEPTANCE.md`:
 * before the work, where the description is unclear, ask the person, by a message up the chain,
 * and where the secretary cannot settle it, it comes to the person. The mechanism is the P55 path
 * (`confirmed_by`, `src/shared/confirming.ts`); the rule is chapter 7 rule 3 of the office
 * regulations, `When words read two ways, take the most reasonable reading and say so`.
 *
 * ON 11 NOVEMBER 2026 THE OWNER NARROWED IT: agents decide what they can, and report after. An
 * agent takes the reading that best fits the person's other words and the facts, records it as its
 * own decision with the other reading, and says it in its next report. It asks first, up its chain,
 * only where the readings differ on one of the five kinds that stay the person's (chapter 4 rule 4),
 * or where a wrong reading could not be undone.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TRIGGER IS ONE SENTENCE, IN ONE PLACE
 * ---------------------------------------------------------------------------------------
 *
 * The rule had one home an agent did not read: chapter 7 of the code of law. The Mole
 * Office skill, which is the file an agent is handed before it knows what it is doing, did not
 * carry the trigger at all. The sentence below is the whole of the trigger, it is exported here
 * once. A test held the two prose places that cannot import it — the skill and the chapter — to
 * these bytes until it was deleted on 12 November 2026. This is the
 * shape criterion P16 already uses for `THE_LIMIT_ON_A_GOVERNANCE_ACT` in `src/shared/person.ts`:
 * a sentence copied into prose drifts, and only the set of copies says different things at once.
 *
 * IT IS THE SENTENCE CHAPTER 7 RULE 3 ALREADY CARRIES, WORD FOR WORD. The chapter is a record in
 * Mole Office and that record is the only authority for it (decision `JC_raqC0fRCh`), so this
 * file does not rewrite it and does not demand that the whole rule match. It holds the one
 * sentence the chapter and the skill have to share.
 *
 * WHAT IT DOES NOT DO, SAID OUT LOUD. It lets nothing happen silently. The reading an agent takes
 * is its own decision, recorded under its own name and said in its next report, so its superior and
 * the person can see it and undo it. A sentence a person wrote is never presented as a decision
 * they did not make.
 */
export const THE_RULE_WHEN_WORDS_CAN_BE_READ_TWO_WAYS =
  "When a brief, a criterion or a person's words can be read two ways and the readings would lead to " +
  'different work, take the most reasonable reading and say so.'
