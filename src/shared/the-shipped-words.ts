// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD'S SHIPPED WORDS BESIDE THE OFFICE'S WORDS, as GET /api/roles/shipped-words answers them and the Role cards
 * page draws them (src/web/components/TheShippedWords.tsx).
 *
 * The office copied each card's words from src/config/roles.json into a `role_card_words` record once, at its first
 * start, and nothing copies a later change of that file. This reply names, for each card, every word field where the
 * shipped file and the office's record differ, and where the office's text came from, so a press that copies the shipped
 * words never writes over a change nobody saw (src/server/lib/card-words.ts).
 */
import type { ACardWord } from './roles.ts'

/** The commit the words are copied from, or why there is none. */
export type TheCommit = { full: string } | { full: null; why: string }

/**
 * WHERE THE OFFICE'S TEXT OF ONE FIELD CAME FROM, as the record's history says.
 *
 *   copied    the office's own copy of the shipped file put it there: the first filing, or a press of this door;
 *   changed   somebody wrote it on the record after the copy: the person, or an agent, and whether the agent stood on
 *             the owner's authority. `by` is null where the office itself wrote it in some other way;
 *   unknown   the history cannot say: it holds no revisions, or its newest revision does not hold this text.
 */
export type WhereTheOfficesWordCameFrom =
  | { as: 'copied'; at: string }
  | { as: 'changed'; by: { kind: 'person' | 'agent'; id: string } | null; at: string; onTheOwnersWords: boolean }
  | { as: 'unknown' }

/** One field where the shipped file and the office differ. A side that has no text for the field is null. */
export interface AWordThatDiffers {
  field: ACardWord
  shipped: string | null
  office: string | null
  came: WhereTheOfficesWordCameFrom
}

/**
 * ONE CARD: its live words record and the version a press names, null where the office holds no live record; what the
 * record says it was copied from, each part null where the record does not say; and every field that differs, in the
 * order of THE_WORDS_OF_A_CARD. A card with no live record differs in nothing, because there are no office words.
 */
export interface ACardsShippedWords {
  role: string
  record: { id: string; version: string } | null
  copied: { from: string | null; commit: string | null; at: string | null }
  differ: AWordThatDiffers[]
}

/** The whole reply: the shipped file, the commit this start read, and every declared card in the declaration's order. */
export interface TheShippedWords {
  file: string
  commit: TheCommit
  cards: ACardsShippedWords[]
}
