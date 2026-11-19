// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED WORDS THAT CALLED THE PERSON "HE", AND THE WORDS THAT REPLACED THEM. Decision vONGYRfXV-UF
 * (under the decisions of report X8UHfSEhYLn2): a stored key or API value
 * that says "his" or "he" is renamed to a neutral one, and the office still reads the old one wherever a
 * stored row or an older client sends it.
 *
 * ONE LIST PER FAMILY, old word to new word, read through `nowSaid` wherever a stored row or an arriving
 * request is read, so an old word answers as the new one. Writers write only the new words.
 *
 * NOTHING REWRITES A STORED ROW. The owner's office keeps its history in the words it was written with: an
 * old row keeps its old word, and every reader takes both (wave 13s round 5b; decision vONGYRfXV-UF
 * asked only that the old words stay readable). A fresh office never holds an old word at all.
 *
 * `tests/the-renamed-words-are-read-as-the-new-ones.test.ts` checks that each new word is one its home
 * still declares, so a home that renames a word again without this list fails a test.
 */

/** One stored word and the word that replaced it. */
export interface Renamed {
  readonly from: string
  readonly to: string
}

/**
 * THE WORD A LIST GIVES FOR A STORED OR ARRIVING ONE: the new word where the list renamed it, and the word
 * itself otherwise. The one reader of every list in this file.
 */
export function nowSaid(list: readonly Renamed[], word: string): string {
  return list.find((one) => one.from === word)?.to ?? word
}

/** The notebook's kinds of entry (`entries[].entryKind` on a `notebook` record). Home: src/shared/notebook.ts. */
export const NOTEBOOK_KINDS_RENAMED: readonly Renamed[] = [
  { from: 'his-preferences', to: 'the-persons-preferences' },
  { from: 'how-he-wants-answers', to: 'how-they-want-answers' },
  { from: 'his-to-do', to: 'the-persons-to-do' },
]

/** How the call that made a key was proved (`held_keys.mint_proved_by`). Home: src/server/lib/provedkeys.ts. */
export const KEY_MINT_WORDS_RENAMED: readonly Renamed[] = [
  { from: 'his-press', to: 'the-persons-press' },
  { from: 'his-key', to: 'the-persons-key' },
]

/**
 * The `how` a message stores when its machine is the name the person gave its address. It has no apostrophe,
 * because the message kind declares `how` as a union of quoted words, and that union's reader takes an
 * apostrophe for the end of a word.
 */
export const THE_PERSONS_NAME_FOR_THE_ADDRESS = 'the name the person gave the address'

/** `data.writtenFrom.how` on a stored record. Home: src/server/lib/machines.ts. */
export const ADDRESS_NAME_WORDS_RENAMED: readonly Renamed[] = [
  { from: 'his name for the address', to: THE_PERSONS_NAME_FOR_THE_ADDRESS },
]

/**
 * THE PRODUCT NAME ACCEPTED IN AN ARRIVING SYSTEM ACTOR HEADER. `panelx` was the product's earlier
 * name. http.ts first normalises that name to the office's reserved handle, then reads the live
 * registry id. This table does not translate frozen history. Only the system
 * actor is normalised: an agent may be called `panelx`, and its rows are left alone.
 *
 * `mole-office` is `MOLE_OFFICE_HANDLE` in ./participants.ts, written out here because this file is imported
 * by ./notebook.ts, which the word lists import, and ./participants.ts imports the word lists. The test named
 * above checks the two are the same word.
 */
export const SYSTEM_ACTOR_IDS_RENAMED: readonly Renamed[] = [{ from: 'panelx', to: 'mole-office' }]

/**
 * WHAT ALLOWED A SETTING WRITE MADE UNDER A RAISE, as the `authority` column of `price_table` and
 * `run_models` stores it: the words below, then the raise's id.
 */
export const UNDER_A_RAISE = "the person's raise"

/* A row written before says "his raise <id>". It is kept as written, as the office's history, and shown as it is. */

/** What the `authority` column says for a write made under the raise with this id. */
export function underTheRaise(id: string): string {
  return `${UNDER_A_RAISE} ${id}`
}

/**
 * A RECORD'S DATA WITH ITS RENAMED WORDS IN THE NEW FORM: a notebook entry's kind (`entries[].entryKind`) and the
 * place a record was written from (`writtenFrom.how`). Everything else is returned as it is, and the argument is
 * never changed.
 *
 * READ BY THE RECORD DOOR'S SHAPE CHECK ONLY (src/server/lib/validate.ts). An old row is checked in the new form, so
 * an ordinary edit of a record that still holds an old word is not refused for a word nobody wrote in this edit, and
 * the row keeps its word. No write needs it: a notebook entry is written only by the notebook's own doors, which write
 * the new kind, and `writtenFrom` only by the office, which writes the new word.
 */
export function inTheNewWords(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data
  const held = data as Record<string, unknown>
  let out: Record<string, unknown> | null = null
  const entries = held['entries']
  if (Array.isArray(entries) && entries.some((one) => isAnOldEntry(one))) {
    out = {
      ...held,
      entries: entries.map((one) =>
        isAnOldEntry(one) ? { ...(one as Record<string, unknown>), entryKind: nowSaid(NOTEBOOK_KINDS_RENAMED, String((one as Record<string, unknown>)['entryKind'])) } : one,
      ),
    }
  }
  const from = held['writtenFrom']
  if (typeof from === 'object' && from !== null && !Array.isArray(from)) {
    const how = (from as Record<string, unknown>)['how']
    if (typeof how === 'string' && nowSaid(ADDRESS_NAME_WORDS_RENAMED, how) !== how) {
      out = { ...(out ?? held), writtenFrom: { ...(from as Record<string, unknown>), how: nowSaid(ADDRESS_NAME_WORDS_RENAMED, how) } }
    }
  }
  return out ?? data
}

function isAnOldEntry(one: unknown): boolean {
  if (typeof one !== 'object' || one === null || Array.isArray(one)) return false
  const kind = (one as Record<string, unknown>)['entryKind']
  return typeof kind === 'string' && nowSaid(NOTEBOOK_KINDS_RENAMED, kind) !== kind
}
