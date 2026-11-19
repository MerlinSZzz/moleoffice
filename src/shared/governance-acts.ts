// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOUR ACTS THAT LOOK LIKE DECIDING, WRITTEN ONCE. Criterion P90.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A TABLE
 * ---------------------------------------------------------------------------------------
 *
 * Deciding is the person's act. But three other doors let an agent do something that looks the
 * same from the outside:
 *
 *   · recording a decision on the person's own words, copied exactly (a warrant);
 *   · acting for the person under the person's grant (chapter 8, rule 4);
 *   · being raised for a while by the person's press (elevation).
 *
 * A flat rule that agents cannot create decisions once stopped agents from recording decisions the
 * person had made aloud, because they could not tell the four apart. The wording had drifted into
 * five places, and three of them named only some of the four.
 *
 * ---------------------------------------------------------------------------------------
 * THE PATTERN, COPIED FROM P16
 * ---------------------------------------------------------------------------------------
 *
 * `THE_LIMIT_ON_A_GOVERNANCE_ACT` in `src/shared/person.ts` is one exported sentence, imported by
 * every place that must say it. This is the same shape one level up: a table of
 * four acts, each with its name, who may do it, what it carries and the clause a refusal gives. The
 * code places import it and cannot drift. The two prose places — chapter 4 rule 4 and the skill —
 * cannot import it. The test that read them as text was deleted on 12 November 2026.
 *
 * THE SENTENCES ARE PIECES OF CHAPTER 4 RULE 4 OF THE DEFAULT SET, word for word: that is the rule a
 * new office copies (src/config/rules/default-regulations.json), so it is the text the readers of a
 * refusal are given. Changing a sentence here on purpose is fine; changing it by accident is what
 * the test exists to catch.
 */

export const GOVERNANCE_ACT_KEYS = ['deciding', 'recording', 'acting-for-the-person', 'being-raised'] as const
export type GovernanceActKey = (typeof GOVERNANCE_ACT_KEYS)[number]

export interface GovernanceAct {
  key: GovernanceActKey
  /** The act's plain name, the words a reader meets it by. */
  name: string
  /** Who may do it. */
  who: string
  /** What the act carries — the evidence or the press that says it is that act and not another. */
  carries: string
  /**
   * The clause a refusal gives for this act. It is an exact substring of the default set's
   * chapter 4 rule 4, so a prose place that carries the rule carries this, and a code place embeds
   * it through `theFourActs()`.
   */
  sentence: string
}

export const GOVERNANCE_ACTS: readonly GovernanceAct[] = [
  {
    key: 'deciding',
    name: 'deciding',
    who: 'the person alone, by their own press, from any surface',
    carries: 'their own press, and nothing an agent can carry for them',
    sentence: "Deciding is the person's own act, from any surface, by the person's own press",
  },
  {
    key: 'recording',
    name: 'recording a decision the person made in words',
    who: 'any agent',
    carries:
      "a warrant: who said it, the person's words copied exactly, where and when they were said, and the records they cover",
    sentence: 'recording a decision the person made in words is open to any agent',
  },
  {
    key: 'acting-for-the-person',
    name: 'acting for the person',
    who: "the secretary, under the person's grant",
    carries: "the person's grant, and every such write names the grant",
    sentence: "acting for the person belongs to the secretary under the person's grant",
  },
  {
    key: 'being-raised',
    name: 'being raised for a while',
    who: 'the person, by their own press',
    carries: 'a card the person gave for a period, and it ends by its own marker',
    sentence: 'being raised for a while is a card the person gave for a period',
  },
]

/**
 * The four acts as one paragraph, for a refusal or a kind's note.
 *
 * Every clause above appears in the answer, so a place built from this names all four and the test
 * that reads the place finds all four.
 */
export function theFourActs(): string {
  return GOVERNANCE_ACTS.map((act) => `${act.sentence} — ${act.who}, carrying ${act.carries}.`).join(' ')
}
