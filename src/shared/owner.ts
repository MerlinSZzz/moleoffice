// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWNER: THE WORDS AND ADDRESSES BOTH SIDES SAY ABOUT THEM, WRITTEN ONCE.
 *
 * A fresh office does not write its owner's identity. It leads its first
 * person to a guide that asks for their name. The name field starts
 * filled with a placeholder that is glaring on purpose, so that whoever sees it knows to change it.
 *
 * WHO the owner is lives in the office's own database (people.office_owner, the owner migration `the_owner_comes_from_the_installer`), and the
 * server reads it in one place, src/server/lib/owner.ts. This file holds only what does not change
 * from one office to the next: the placeholder, the guide's address, the refusal an agent meets, and
 * the limits on a name. The server's door and the browser's guide both read them from here, so the
 * two cannot say different things.
 */

import type { Language } from './i18n.ts'

/**
 * THE PLACEHOLDER NAME, in each language the office speaks. Each one reads plainly as a placeholder,
 * so that whoever sees it knows to change it.
 *
 * WHERE EACH IS USED. The server stores the English one in the owner's row while nobody has given a
 * name, so every place that draws the owner's name shows it and none draws a blank. GET
 * /api/office/owner gives the one in the reader's language, and the guide's name field starts with
 * it. A person who keeps it has it stored exactly as it stands.
 */
export const THE_OWNER_PLACEHOLDER: Readonly<Record<Language, string>> = {
  en: 'default office owner name',
  zh: '默认的办公室管理员名字',
  // The five languages added after Chinese show the English placeholder until their own round writes it; Thai's round
  // wrote its own.
  el: 'default office owner name',
  es: 'default office owner name',
  it: 'default office owner name',
  ko: 'default office owner name',
  pt: 'default office owner name',
  th: 'ชื่อเจ้าของสำนักงานเริ่มต้น',
}

/** The address of the newcomer guide, relative to the page the office serves. */
export const THE_GUIDE_ADDRESS = '#/welcome'

/**
 * THE REFUSAL FOR NAMING WITHOUT THE PERSON'S PRESS OR THEIR WRITTEN WORDS. A secretary may record the name on
 * the person's words for it. Otherwise an agent opens the guide or passes its address on.
 */
export const ONLY_THE_PERSON_NAMES_THEMSELVES =
  `The person names themselves. A secretary carrying the person's written words for this name may record it too; open ${THE_GUIDE_ADDRESS} for them or hand them the link.`

/** The shortest and longest name the office stores for its owner, counted after trimming. */
export const OWNER_NAME_LIMITS = Object.freeze({ shortest: 1, longest: 80 })

/** What GET /api/office/owner answers, to anyone. */
export interface TheOfficeOwner {
  /** The owner's id: MOLE_OFFICE_OWNER_ID at the first migrate, or `owner` when nothing said. */
  id: string
  /** The name the owner gave, or the installer gave for them. Null while nobody has given one. */
  name: string | null
  /** True once a name was given. While false, every other page leads to the guide. */
  named: boolean
  /** The placeholder name in the reader's language. */
  placeholder: string
  /** The guide's address. */
  guide: typeof THE_GUIDE_ADDRESS
}
