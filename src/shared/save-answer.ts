// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createI18n, type WordKey, type WordValues } from './i18n.ts'

/**
 * WHAT A SAVE DID, AS A SENTENCE A PERSON READS, in whichever language reads it (wave 13k round 43).
 *
 * The server answers every merge with this sentence in English, for agents (`note` on
 * `DataPatchOutcome`, src/server/lib/records/merge-data.ts). The record page draws it under the box somebody
 * just saved, and a Chinese page drew that English as it came. Both now build it here, from the
 * same four lists of paths the reply carries: the server with the English words and its own names
 * for fields, the page with the page's words and the names its labels use. The sentences are the
 * `saveAnswer.*` words, so the two cannot come to say different things about one save.
 *
 * Never a path and never a count of paths: a field is named by its last key, and a path that does
 * not end in a key is counted as "other fields", which is the honest answer.
 */
export interface SavedLists {
  changed: readonly string[]
  deleted: readonly string[]
  unchanged: readonly string[]
  alreadyAbsent: readonly string[]
}

type Reader = (key: WordKey, values?: WordValues) => string

/**
 * THE LAST KEY OF A STORED PATH, as stored: `data.effort_hours` -> `effort_hours`.
 *
 * THE LAST KEY AND NOT THE FIRST, because `patchChecklistItem` merges into one checklist line and
 * reports `data.parts[#mount].items[#mount-1].state`. The thing that changed there is that line's
 * state, and "parts" would be the wrong word for it. Null when the path ends in something that is
 * not a key.
 */
export function lastKeyOf(path: string): string | null {
  const found = /(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[("(?:[^"\\]|\\.)*")\])$/.exec(path)
  if (found === null) return null
  const bracketed = found[2]
  if (bracketed !== undefined) {
    try {
      const key = JSON.parse(bracketed) as unknown
      return typeof key === 'string' ? key : null
    } catch {
      return null
    }
  }
  return found[1] ?? null
}

/** "a", "a and b", "a, b and c", in the reader's language. */
function inAList(words: readonly string[], read: Reader): string {
  if (words.length <= 1) return words[0] ?? ''
  return read('saveAnswer.listAnd', { list: words.slice(0, -1).join(read('saveAnswer.listComma')), last: words[words.length - 1] ?? '' })
}

/**
 * THE SENTENCE. `nameOf` gives a field's name from its key; `read` gives the words.
 *
 * One sentence per list, and each one names the fields when their names can be read and says how
 * many there were when they cannot.
 */
export function saveAnswer(lists: SavedLists, nameOf: (key: string) => string, read: Reader): string {
  const parts: string[] = []
  const say = (paths: readonly string[], key: WordKey) => {
    if (paths.length === 0) return
    const named: string[] = []
    let unnamed = 0
    for (const path of paths) {
      const key = lastKeyOf(path)
      const name = key === null ? '' : nameOf(key)
      if (name === '') unnamed += 1
      else named.push(name)
    }
    if (named.length > 0) parts.push(read(key, { fields: inAList(named, read), n: named.length }))
    if (unnamed > 0) parts.push(read(key, { fields: read('saveAnswer.otherFields', { n: unnamed }), n: unnamed }))
  }
  say(lists.changed, 'saveAnswer.changed')
  say(lists.deleted, 'saveAnswer.emptied')
  say(lists.unchanged, 'saveAnswer.unchanged')
  say(lists.alreadyAbsent, 'saveAnswer.nothingToClear')
  if (parts.length === 0) return read('saveAnswer.namedNoFields')
  return parts.join(read('saveAnswer.sentenceGap'))
}

const english = createI18n('en')

/** The server's sentence, for agents: the English words, with `nameOf` naming each field. */
export function saveAnswerInEnglish(lists: SavedLists, nameOf: (key: string) => string): string {
  return saveAnswer(lists, nameOf, english.t)
}
