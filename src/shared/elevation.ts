// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF THE PRESS THAT LETS A SECRETARY ACT FOR THE PERSON. Criterion P59.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORDS ARE HERE AND NOT ON THE BUTTON
 * ---------------------------------------------------------------------------------------
 *
 * Three places say them: the button on the card, the refusal an un-elevated secretary gets — *the
 * refusal names the press*, which is criterion P59's own sentence — and the reply the route sends
 * back. A refusal that tells somebody to press a thing called something else is a refusal that sends
 * them looking for a button that is not there, so the three read one declaration.
 *
 * THE PERSON'S NAME IS NOT IN THEM. `THE_PERSON` in @shared/person.ts is the one place that says who
 * the owner is, and a screen that wants "Acting for <name>" builds it from that. A name typed here
 * would be a second answer to a question that already has one.
 */

/**
 * The press itself, on the secretary's card. What a person reads on the button.
 *
 * IT NAMES THE SECRETARY, by `{name}`. Item 3 of a decision took the agent page's drawing, which
 * read "Let Wren act for you". Until then it read "Let this secretary act for you". `{name}`
 * is the agent's registry name, filled in by `thePress` in @shared/the-press.ts, which the button and
 * every refusal read. This is the agent's name and not the person's, so the paragraph above about the person's name
 * still holds.
 */
export const THE_PRESS = 'Let {name} act for you'

/** What the card says while it holds, before the end it was given. */
export const ACTING_FOR = 'Acting for'

/** What is said between the standing and its end: `Acting for <name> until …`. */
export const UNTIL = 'until'

/** The words for a grant that has ended, on a card that held one. */
export const NO_LONGER_ACTING = 'not acting for anybody'

/** The press that ends one early. Only the person sees it, and only while one holds. */
export const END_IT = 'End it now'

/** What a person picks between when they press. The kinds come from the declaration. */
export const HOW_LONG = 'How long'

/**
 * THE BOX THE PERSON'S REASON GOES IN, beside the press, and the label their reason is read under while it holds. The
 * press asks for a reason, and the page shows the raise while it lasts.
 */
export const WHY = 'Why'

/** What the empty reason box says. */
export const WHY_ASKS = 'What it is for, in your words'

/** Why the press is off while the reason box is empty. */
export const WHY_FIRST = 'Write why first: the press asks for your reason'

/** What the empty time box says: a raise with no time lasts a day. */
export const A_DAY_IF_EMPTY = 'Empty: a day from now'
