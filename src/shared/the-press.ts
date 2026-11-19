// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT LETS A SECRETARY ACT FOR THE PERSON, NAMING THAT SECRETARY. Criterion P59. This is at item 3 of
 * a decision, which took the agent page's drawing: "Let Wren act for you", 让 Wren 代你行事.
 *
 * ONE FUNCTION OF THE NAME. The button on the agent page and every refusal that tells a secretary which button to
 * ask for read it. Criterion P59 says the refusal names the press, and a refusal that quoted other words than the
 * button would send its reader looking for a button that is not there. The words are the word list's
 * `g6b.elevation.THE_PRESS`; its English is `THE_PRESS` in elevation.ts.
 *
 * THE NAME IS THE REGISTRY NAME, which the agent page's head shows, and not the handle. An agent registered with
 * no name that can be used as one is stored with its handle as its name (`theNameARecordGives` in
 * src/server/lib/participants.ts). The press then names the handle, which is what the page's head shows too.
 *
 * IT IS NOT IN elevation.ts because the word lists import that file. Reading the word lists from there would be a
 * loop, and the English list would read `THE_PRESS` before it was declared.
 */
import { createI18n, type WordKey, type WordValues } from './i18n.ts'

/** The word lists read in English, which is the language every refusal is written in. */
const inEnglish = createI18n('en').t

/** The press for the agent of this name. A page passes its own `t`, so the press is drawn in the page language. */
export function thePress(name: string, say: (key: WordKey, values: WordValues) => string = inEnglish): string {
  return say('g6b.elevation.THE_PRESS', { name })
}
