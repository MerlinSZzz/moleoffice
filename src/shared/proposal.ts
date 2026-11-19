// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A FORK: what its options are called, and whether anybody actually picked one.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS SHARED CODE AND NOT A COMPONENT'S PRIVATE HELPER
 * ---------------------------------------------------------------------------------------------
 *
 * Two surfaces answer "did an agent recommend an option?" and they answered it differently. The
 * proposal page read the recommendation and looked for a NAME in it. `GET /api/needs-you` asked
 * whether the field was a non-empty string — so Home badged `acsi4ZoHx6ZB` as having "a
 * recommendation" when what it stores is *"No recommendation. All three are defensible…"*, which is
 * an agent explicitly declining to choose.
 *
 * The one record in the corpus whose agent refused to pick was the one Home made look most decided.
 * That is this codebase's recurring defect exactly — two places that must agree, with nothing making
 * them agree — so the reading lives here, the server imports it, the browser imports it, and there
 * is no second copy to drift.
 */

export interface OptionCard {
  /** What this option is called. One letter, upper case. */
  letter: string
  /** The option as written, minus a leading label that has become the letter. */
  body: string
  /** True when the letter came from the author rather than from the position. */
  authored: boolean
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The name a position gets when the author did not write one. Past Z, its number. */
function letterAt(index: number): string {
  return ALPHABET[index] ?? String(index + 1)
}

/** Every option, lettered. A pure function, so the labelling rule can be tested on its own. */
export function optionCards(options: readonly string[]): OptionCard[] {
  return options.map((option, i) => {
    const text = option.trim()
    // ONE letter, then a dash of any of the three kinds, then the option. Nothing else counts as a
    // label: an option opening "Add actorId to the key." must not lose its first word to a greedy
    // pattern, and an option opening "a decision is…" has no dash and is left alone.
    const labelled = /^([A-Za-z])\s*[—–-]\s*(.+)$/s.exec(text)
    if (labelled === null) return { letter: letterAt(i), body: text, authored: false }
    return { letter: (labelled[1] as string).toUpperCase(), body: labelled[2] as string, authored: true }
  })
}

/**
 * Which option the recommendation names, or null when it names none.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT "IS THE FIELD PRESENT"
 * ---------------------------------------------------------------------------------------
 * `acsi4ZoHx6ZB` stores `recommendation: "No recommendation. All three are defensible…"`, which is
 * an agent DECLINING to pick — and the page printed a bold **Recommended:** in front of it, so the
 * one record in the corpus whose agent refused to choose was the one that looked most decided. A
 * field that is present is not a pick. Having one means the sentence NAMES an option.
 *
 * IT MATCHES ONLY THE FORMS A LABEL TAKES, never a bare letter: `(a)`, `option a`, or a letter that
 * opens the sentence and is followed by a dash or a comma. English is full of the word "a", and a
 * word-boundary match on it would find a pick in every sentence ever written. Two options named is
 * not a pick either — it is a sentence about both — and is answered with null rather than with
 * whichever was found first.
 */
export function pickedOption(recommendation: string | null, cards: readonly OptionCard[]): number | null {
  if (recommendation === null) return null
  const said = recommendation.trim()
  if (said === '') return null
  const found: number[] = []
  cards.forEach((card, i) => {
    const l = card.letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const forms = [
      new RegExp(`\\(${l}\\)`, 'i'),
      new RegExp(`\\boption\\s+${l}\\b`, 'i'),
      new RegExp(`^${l}\\s*[—–,-]`, 'i'),
    ]
    if (forms.some((form) => form.test(said))) found.push(i)
  })
  return found.length === 1 ? (found[0] as number) : null
}

/**
 * WHICH OPTION A DECISION TOOK, read back off the decision that settled the fork.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS READ AS A COMPLEMENT, AND WHY THAT IS NOT A GUESS
 * ---------------------------------------------------------------------------------------
 * `decision` declares no field for the option taken. It declares `alternatives_rejected` — what
 * was turned down — and that is the only structured place the choice can live today. So the
 * choice is recorded NEGATIVELY and completely: taking one option rejects every other one, and
 * taking none of them rejects all of them. Either way exactly one answer is left over, and this
 * function is the one reader of it.
 *
 * IT REFUSES RATHER THAN GUESSES, which is the whole reason it is a function and not an
 * expression. A decision filed by hand may store the schema's other idiom — whole sentences
 * rather than the fork's letters — and a decision filed before this encoding existed stores
 * nothing at all. Neither says which option was taken, and both come back `not-said`. A
 * complement that leaves two options standing is not an answer either.
 *
 * The letters are the fork's own, from `optionCards`, so a fork whose author lettered its options
 * and a fork that got positional letters read the same way.
 */
/**
 * What the picker holds when the person is taking none of the recorded options.
 *
 * It lives beside the two functions that read and write the choice rather than inside the
 * component, because all three have to agree about it and a copy in a `.tsx` file is a copy.
 */
export const TAKE_NONE = 'own'

/**
 * WHAT GETS STORED WHEN SOMEBODY CHOOSES: every option they did not take.
 *
 * The write side of `takenOption`, and the two are asserted to round-trip in
 * tests/record-tiers.test.ts — which is what stops the encoding drifting, since neither function
 * would fail on its own if the other changed.
 *
 * Taking none of the recorded options rejects ALL of them, and that is the fix rather than a
 * detail: it used to store nothing, so a decision that deliberately took none of the options and
 * a decision that never made a choice were the same record.
 */
export function rejectedBy(cards: readonly OptionCard[], taking: string): string[] {
  if (taking === '') return []
  if (taking === TAKE_NONE) return cards.map((card) => card.letter)
  return cards.filter((card) => card.letter !== taking).map((card) => card.letter)
}

export type TakenOption =
  /** Exactly one recorded option is left standing. `index` addresses `cards`. */
  | { at: 'named'; index: number; letter: string }
  /** Every recorded option was turned down: the person wrote their own answer. */
  | { at: 'own' }
  /** Nothing stored on the decision says which option it took. */
  | { at: 'not-said' }

/**
 * Which option a decision took.
 *
 * IT READS TWO FIELDS, AND THE ORDER MATTERS. `option_taken` says the choice directly and is the
 * field to trust. It was added on 2026-08-13, when the owner settled that a decision selects a
 * recorded option or an explicit custom one. Before that the choice could only be written as its
 * opposite, in `alternatives_rejected`, and the complement was worked out from it — so every
 * decision already in this corpus is the older kind and is still read correctly here.
 *
 * The older reading is not a fallback that hides a failure. It is a second, honest encoding of the
 * same fact, and it refuses to answer whenever the stored list does not line up with this fork's
 * own letters.
 */
export function takenOption(cards: readonly OptionCard[], rejected: unknown, said?: unknown): TakenOption {
  // THE DIRECT ANSWER FIRST. A decision that names an option it took is not open to interpretation.
  if (typeof said === 'string' && said.trim() !== '') {
    const wrote = said.trim()
    const at = cards.findIndex(
      (card) => card.body.trim() === wrote || `${card.letter} — ${card.body}`.trim() === wrote || card.letter === wrote.toUpperCase(),
    )
    // Not one of the written options means the person wrote their own answer, which is a real and
    // declared case rather than a mismatch to report.
    return at === -1 ? { at: 'own' } : { at: 'named', index: at, letter: cards[at]?.letter ?? '' }
  }
  if (!Array.isArray(rejected) || rejected.length === 0) return { at: 'not-said' }
  if (cards.length === 0) return { at: 'not-said' }
  const letters = cards.map((card) => card.letter)
  const turned = new Set<string>()
  for (const entry of rejected as unknown[]) {
    if (typeof entry !== 'string') return { at: 'not-said' }
    const letter = entry.trim().toUpperCase()
    // An entry that is not one of this fork's letters means the decision was written in the
    // field's other idiom. The complement is then meaningless and nothing is claimed from it.
    if (!letters.includes(letter)) return { at: 'not-said' }
    turned.add(letter)
  }
  const standing = letters.filter((letter) => !turned.has(letter))
  if (standing.length === 0) return { at: 'own' }
  if (standing.length > 1) return { at: 'not-said' }
  const letter = standing[0] as string
  return { at: 'named', index: letters.indexOf(letter), letter }
}
