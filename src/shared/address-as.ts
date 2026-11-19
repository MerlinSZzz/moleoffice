// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PERSON OR AN AGENT WISHES TO BE ADDRESSED.
 *
 * Agents addressed the person in different ways, so every person and every agent carries how it wishes to be
 * addressed: a name, a second-person form, a third-person form and a title. Agents then address
 * people as they wish, and an agent's own identity is more complete.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The one declaration of the field. The four parts, their words for a reader, the length limit, the
 * reading of what a caller sent, and the words that show a set field back. The registry rows on the
 * server, the door that sets the field, the profile door, the hand-over of a message and the brief
 * all read it from here (invariant 9).
 *
 * THE KEY NAMES SAY PLAINLY WHAT EACH PART IS. `name`, `secondPerson`, `thirdPerson` and `title`
 * are a name, a second-person form, a third-person form and a title. A shorter or cleverer key would
 * need a comment to explain it.
 *
 * ---------------------------------------------------------------------------------------
 * THE VALUES ARE CONTENT
 * ---------------------------------------------------------------------------------------
 *
 * Content is never translated. A value is shown exactly as it was
 * written, after trimming. Nothing here translates, rewords or fills one in.
 *
 * ABSENT IS NOBODY HAVING SAID. Each part may be absent, and an absent part is never filled in with
 * a guess. An empty string is stored as absent, because a blank is nobody having written one.
 */

/** The four parts, in the order every reader shows them. */
export const ADDRESS_AS_PARTS = ['name', 'secondPerson', 'thirdPerson', 'title'] as const

export type AddressAsPart = (typeof ADDRESS_AS_PARTS)[number]

/**
 * THE FIELD EACH PART IS STORED AND EXPORTED UNDER on a `people` or `agents` row: `addressName`,
 * `addressSecondPerson`, `addressThirdPerson`, `addressTitle` (migration 0181). Worked out from the parts
 * so the importer's list of columns an older archive may leave out cannot drift from them.
 */
/**
 * WHO LAST SET THE ADDRESS, AND WHEN, stored beside the parts on `people` and `agents` by migration 0182 and a
 * decision. Null when nobody recorded it.
 */
export type AddressAsSetBy = { kind: 'person' | 'agent'; id: string; at: string } | null

/**
 * WHAT `addressAs` MEANS, said once for every door that carries it: the participants' doors and the brief.
 * Problem eRdNhJ9j9AY2: since a decision, somebody else may have set the parts, so the words are not always the
 * participant's own, and `addressAsSetBy` says who set them.
 */
export const WHAT_ADDRESS_AS_MEANS =
  'how this participant wishes to be addressed: name, secondPerson, thirdPerson and title. They are set by the ' +
  'participant itself, by a secretary, or, for an agent, by the owner, and `addressAsSetBy` says which: {kind, id, ' +
  'at} of who last set them, or null because nobody recorded it. A part that is left out has not been set, and ' +
  'nothing stands in for it. Use each value as written; never translate it.'

/** The fields the setter is stored and exported under. The importer lets an archive before 0182 leave them out. */
export const ADDRESS_AS_SETTER_FIELDS: readonly string[] = ['addressSetByKind', 'addressSetById', 'addressSetAt']

export const ADDRESS_AS_FIELDS: readonly string[] = ADDRESS_AS_PARTS.map((part) => `address${part[0]!.toUpperCase()}${part.slice(1)}`)

/** How one person or agent wishes to be addressed. A part left out is a part nobody has set. */
export type AddressAs = { [part in AddressAsPart]?: string }

/** Each part in words, for a sentence a reader reads. */
export const ADDRESS_AS_PART_WORDS: Readonly<Record<AddressAsPart, string>> = {
  name: 'name',
  secondPerson: 'second person',
  thirdPerson: 'third person',
  title: 'title',
}

/**
 * THE LONGEST ONE PART MAY BE, IN CHARACTERS. A name, a pronoun or a title is a few words; 80
 * characters leaves room for a long name in any script, and it keeps the hand-over line short.
 */
export const ADDRESS_AS_PART_MAX_CHARACTERS = 80

/**
 * A LINE BREAK OR ANOTHER CONTROL CHARACTER IS REFUSED. Every part is printed on one line of a
 * hand-over and of the brief, and a line break inside a value would start a line that the office did
 * not write.
 */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u

/** What a caller sent, read: the field to store, or the sentence saying why it is refused. */
export type AddressAsAsRead = { ok: true; addressAs: AddressAs } | { ok: false; why: string }

/**
 * READ WHAT A CALLER SENT FOR THE WHOLE FIELD.
 *
 * `sent` has one entry per part the caller named. A string is trimmed and an empty one is absent.
 * Null is absent too. A part left out is absent: the field is replaced whole, so leaving a part out
 * clears it. Every part is checked before the answer is given, so a refusal names every part that is
 * wrong and nothing is stored from a request that has one.
 */
export function readTheAddressAsSent(sent: { [part in AddressAsPart]?: string | null }): AddressAsAsRead {
  const addressAs: AddressAs = {}
  const wrong: string[] = []
  for (const part of ADDRESS_AS_PARTS) {
    const value = sent[part]
    if (value === undefined || value === null) continue
    const trimmed = value.trim()
    if (trimmed === '') continue
    if (CONTROL_CHARACTER.test(trimmed)) {
      wrong.push(`the ${ADDRESS_AS_PART_WORDS[part]} holds a line break or another control character`)
      continue
    }
    const length = [...trimmed].length
    if (length > ADDRESS_AS_PART_MAX_CHARACTERS) {
      wrong.push(
        `the ${ADDRESS_AS_PART_WORDS[part]} is ${String(length)} characters long, and a part may be at most ` +
          `${String(ADDRESS_AS_PART_MAX_CHARACTERS)}`,
      )
      continue
    }
    addressAs[part] = trimmed
  }
  if (wrong.length > 0) return { ok: false, why: `${sentenceCase(wrong.join('; '))}. Nothing was written.` }
  return { ok: true, addressAs }
}

/**
 * READ THE FIELD OFF ONE STORED ROW, one stored value per part. A value that is not a string, or is
 * blank, is a part nobody has set.
 */
export function theAddressAsStored(stored: { [part in AddressAsPart]: unknown }): AddressAs {
  const addressAs: AddressAs = {}
  for (const part of ADDRESS_AS_PARTS) {
    const value = stored[part]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed !== '') addressAs[part] = trimmed
  }
  return addressAs
}

/**
 * THE PARTS THAT ARE SET, IN WORDS, or null because no part is set.
 *
 * Each value is shown as written, in double quotes, after the word for its part:
 * `name "Rowan"; second person "you"; title "lead"`. A part nobody set is left out, and nothing
 * stands in for it. Null is for a caller to say nothing at all, which is what the hand-over and the
 * brief do when nobody has set a part.
 */
export function theAddressAsInWords(addressAs: AddressAs): string | null {
  const said = ADDRESS_AS_PARTS.filter((part) => addressAs[part] !== undefined).map(
    (part) => `${ADDRESS_AS_PART_WORDS[part]} "${addressAs[part] ?? ''}"`,
  )
  return said.length === 0 ? null : said.join('; ')
}

function sentenceCase(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1)
}
