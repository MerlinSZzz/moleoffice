// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY'S NOTEBOOK: what an entry is, what the numbers on the card are, and the block a
 * run reads before anything else.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE NOTEBOOK IS FOR, AND WHERE ITS KINDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Every secretary has a notebook of its own, kept under that secretary's name. It records how the
 * person behaves and prefers to work, how they want to be answered, and what the secretary may do
 * alone and what is the person's to do. The person can review and change it, and the role card counts it.
 *
 * It also records the secretary's own feelings at work, its character and how it replies, like a
 * soul.md, and a secretary on another model takes up its ways of working and its character at once.
 *
 * The sentences these come from are kept in `design/flows/ACCEPTANCE.md`, because the eight kinds
 * of entry below are a reading of those two sentences and a reader has to be able to check the
 * reading against the words.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TEXT OF THE OPENING IS WRITTEN HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Three surfaces hand this to a starting run: `GET /api/brief`, the Claude Code start hook, and the
 * prompt the office worker builds for a run it starts. If each wrote its own sentences, a run on
 * one runtime would recover a different secretary from a run on another — which is the exact thing
 * the notebook exists to prevent, even when the model changes. So `theNotebookOpening` below is the only
 * writer of those words, and every surface prints what it hands back.
 *
 * NOTHING HERE IS MODEL-SPECIFIC, and that is a property to keep rather than a coincidence: this
 * file names no runtime, no model and no framework, and `tests/the-secretary-reads-its-notebook-
 * first.test.ts` reads the block for two runtimes and requires the same text.
 */

import { NOTEBOOK_KINDS_RENAMED, nowSaid } from './renamed-words.ts'

/**
 * THE KIND WORD, IN ONE PLACE. Everything that looks a notebook up by kind reads this rather than
 * typing the word, for the reason `BLOCK_KIND` in shared/blocks.ts gives: a kind spelt in fifteen
 * places is fifteen things that can drift from the declaration.
 */
export const NOTEBOOK_KIND = 'notebook'

/**
 * THE LAST SEGMENT OF THE NOTEBOOK'S ADDRESS: `#/who/agent/<handle>/notebook`.
 *
 * Under the citizen page's address rather than beside it, because a notebook belongs to exactly one
 * agent and is reached from that agent's page: it is kept under the secretary's name.
 */
export const NOTEBOOK_SEGMENT = 'notebook'

/**
 * THE MARK A WRITE FROM THE NOTEBOOK DOORS CARRIES. Criterion N2.
 *
 * A word rather than a symbol so it survives the JSON the patch path already logs, and one constant
 * so the doors and the guard cannot spell it differently. It is declared HERE rather than beside the
 * guard in server/lib/records.ts because that file opens the database when it is imported, and a
 * test that wants only this word must not open one.
 */
export const THE_NOTEBOOK_DOOR = 'writtenByTheNotebookDoor'

/** Who wrote an entry, or who changed one. Two words, because Mole Office has two kinds of writer. */
export type NotebookWriter = 'person' | 'agent'

/**
 * ONE KIND OF ENTRY, with the words it is drawn under and the sentence of their it comes from.
 *
 * The list is closed: an entry whose kind is not one of these is refused by `validateData`, because
 * a notebook with a free-text kind is one nobody can count and the card's numbers are counts.
 */
export interface NotebookEntryKind {
  /** The stored word. Lowercase, dashes, and it never changes once an entry carries it. */
  readonly key: string
  /** What a person reads on the page. A name, not a sentence. */
  readonly label: string
  /** What belongs under it, in one sentence, shown beside the form. */
  readonly what: string
  /** Who this kind is usually about: the person, or the secretary itself. */
  readonly about: 'the person' | 'the secretary'
  /** The person's own words this kind was read out of, kept as they wrote them. */
  readonly fromThePersonsWords: string
}

/**
 * THE EIGHT KINDS, IN THEIR ORDER: five about the person first, then three about the secretary.
 *
 * How to answer the person and how the secretary replies are two different things and are two kinds
 * here: the first is how THE PERSON wants to be answered, the second is how the SECRETARY replies. Folding
 * them together would lose one of the two things the notebook records.
 */
export const NOTEBOOK_ENTRY_KINDS: readonly NotebookEntryKind[] = [
  {
    key: 'the-persons-preferences',
    label: 'How the person works',
    what: 'What the person prefers and how they habitually work.',
    about: 'the person',
    fromThePersonsWords: '用于记录human行为偏好',
  },
  {
    key: 'how-they-want-answers',
    label: 'How to answer the person',
    what: 'How the person wants to be answered: the language, the length, the order.',
    about: 'the person',
    fromThePersonsWords: '回答方式',
  },
  {
    key: 'the-secretary-may',
    label: 'What the secretary may do alone',
    what: 'What the secretary may settle by itself without asking the person.',
    about: 'the person',
    fromThePersonsWords: '哪些可以自己做',
  },
  {
    key: 'the-persons-to-do',
    label: 'What is the person\'s to do',
    what: 'What only the person may do, and what has to go back to them.',
    about: 'the person',
    fromThePersonsWords: '哪些人类做',
  },
  {
    key: 'a-summary',
    label: 'A summary of the work',
    what: 'What lasts as the project goes on: lessons learned and ways of working, not what happened on a given day.',
    about: 'the person',
    fromThePersonsWords: '后续随着项目发展跟进秘书记录preference什么的（比较总结性质的）',
  },
  {
    key: 'a-feeling-at-work',
    label: 'A feeling at work',
    what: 'What the secretary felt while working: what was hard, what went well, what it minds.',
    about: 'the secretary',
    fromThePersonsWords: '记录秘书的工作过程中的感受',
  },
  {
    key: 'its-character',
    label: 'Its character',
    what: 'What the secretary is like: what it cares about, what it will not do.',
    about: 'the secretary',
    fromThePersonsWords: '秘书自己的性格',
  },
  {
    key: 'how-it-replies',
    label: 'How it replies',
    what: 'How the secretary answers the person, and why it answers that way.',
    about: 'the secretary',
    fromThePersonsWords: '回复方式',
  },
] as const

/** Every stored kind word, for the validator and for a refusal that has to list them. */
export const NOTEBOOK_ENTRY_KIND_KEYS: readonly string[] = NOTEBOOK_ENTRY_KINDS.map((one) => one.key)

/** The three kinds that are the secretary's own. Criterion N4. */
export const THE_SECRETARYS_OWN_KINDS: readonly string[] = NOTEBOOK_ENTRY_KINDS.filter(
  (one) => one.about === 'the secretary',
).map((one) => one.key)

/** The kind by its stored word, or null when nothing answers to it. A word renamed since is read as the new one. */
export function theEntryKind(key: string): NotebookEntryKind | null {
  const now = nowSaid(NOTEBOOK_KINDS_RENAMED, key)
  return NOTEBOOK_ENTRY_KINDS.find((one) => one.key === now) ?? null
}

/** What a reader sees for a stored kind word. The stored word itself when nothing answers to it. */
export function entryKindLabel(key: string): string {
  return theEntryKind(key)?.label ?? key
}

/**
 * ONE ENTRY, as it is stored inside the notebook record's `entries`.
 *
 * `writtenByKind` and `writtenById` are the ORIGINAL writer and are never rewritten, including by
 * an edit — criterion N2 asks for exactly that. What an edit by the person adds is
 * `changedByThePerson`, and nothing else about the entry moves.
 */
export interface NotebookEntry {
  /** This entry's id, unique inside this notebook. It is what an edit and a removal address. */
  id: string
  /** Who wrote it: the person, or an agent. */
  writtenByKind: NotebookWriter
  /** The person's name, or the agent's handle. */
  writtenById: string
  /** When it was written, in local wall clock. */
  at: string
  /** Which of the eight kinds it is. */
  entryKind: string
  /** The words. */
  text: string
  /** Set when the person edited this entry, with when. Absent means the person never changed it. */
  changedByThePerson?: { at: string }
}

/**
 * WHAT THE FOUR DOORS HAND BACK, and what the page draws. One shape, declared here, so the server
 * and the page cannot come apart about what a notebook read carries.
 */
export interface TheNotebookRead {
  /** The handle whose notebook this is. */
  agent: string
  /** Whether a notebook has been written for this agent at all. */
  isThere: boolean
  /** The record, when there is one. */
  recordId: string | null
  /** The record's title, when there is one. */
  title?: string
  /** The entries, newest first. Empty when nobody has written one, which `isThere` tells apart. */
  entries: NotebookEntry[]
  /** The numbers, or null when there is no notebook to count. */
  statistics: NotebookStatistics | null
  /** The sentence to draw when nobody has written one. */
  note?: string
  /** Where an entry is written. */
  write: string
  /** The eight kinds, so a page's picker is drawn from the declaration and not from a second list. */
  kinds: readonly string[]
}

/** The numbers the role card shows. Criterion N3, worked out here and stored nowhere. */
export interface NotebookStatistics {
  /** How many entries the notebook holds. */
  entries: number
  /** How many of them the person wrote. */
  byThePerson: number
  /** How many of them the secretary wrote. */
  byTheSecretary: number
  /** The newest entry's date and writer, or null when the notebook is empty. */
  lastWritten: { at: string; byKind: NotebookWriter; byId: string } | null
  /** How many entries the person has changed since they were written. */
  changedByThePerson: number
}

/**
 * THE NUMBERS, WORKED OUT FROM THE ENTRIES AND FROM NOTHING ELSE. Criterion N3: "drawn from the
 * record, not a second copy."
 *
 * Nothing here is stored back onto the record. A stored count is a second account of the same fact
 * and the two come apart the first time an entry is added by a path that forgot to update it —
 * which is invariant 9, and the reason the card asks this function rather than reading a field.
 *
 * `byTheSecretary` counts every entry an agent wrote, not only the agent whose notebook it is. In
 * practice they are the same set, because the doors refuse an entry from any other agent; counting
 * by writer kind rather than by handle means the number stays true if that ever changes.
 */
export function notebookStatistics(entries: readonly NotebookEntry[]): NotebookStatistics {
  let byThePerson = 0
  let byTheSecretary = 0
  let changedByThePerson = 0
  let newest: NotebookEntry | null = null
  for (const entry of entries) {
    if (entry.writtenByKind === 'person') byThePerson += 1
    else byTheSecretary += 1
    if (entry.changedByThePerson !== undefined) changedByThePerson += 1
    // WHEN TWO ENTRIES SHARE A SECOND, THE LATER ONE IN THE LIST IS THE LATER ONE WRITTEN.
    //
    // `nowStamp` counts in whole seconds and a person writing two entries in one press-and-press
    // does produce two with the same stamp — measured 11 September 2026, where three entries written
    // in one second left the card naming the first as the last written. The list is append-only and
    // the doors append, so its order IS the order they were written, and `>=` reads that rather than
    // inventing a finer clock nothing else in this product has.
    if (newest === null || entry.at >= newest.at) newest = entry
  }
  return {
    entries: entries.length,
    byThePerson,
    byTheSecretary,
    lastWritten:
      newest === null ? null : { at: newest.at, byKind: newest.writtenByKind, byId: newest.writtenById },
    changedByThePerson,
  }
}

/**
 * THE NOTEBOOK AS A CARD SHOWS IT. Criterion N3: the role card shows the notebook's numbers.
 *
 * ONE SHAPE FOR BOTH CARDS. The secretary's card is drawn in two places — its own citizen page and
 * the Role cards page — by two different components, and they do not share one. What they do share
 * is this shape and `theNotebookNumbersSay` below, so the two cannot come to say different numbers
 * about one notebook or draw them under different words.
 */
export interface NotebookOnACard {
  /** The handle whose notebook this is. */
  agent: string
  /** Whether anybody has written one. False is a real answer and the card says so. */
  isThere: boolean
  /** The record, so the card can lead to it. Null when there is none. */
  recordId: string | null
  /** The numbers, counted from that record on this read. Null when there is no notebook. */
  statistics: NotebookStatistics | null
}

/** One number on a card: what it counts, and the count. */
export interface ANotebookNumber {
  /** What it counts, in the words a reader meets. */
  says: string
  /** The count, or a date and a name for the last entry. */
  value: string
}

/**
 * THE NUMBERS A CARD DRAWS, IN ORDER, WRITTEN ONCE.
 *
 * The person's four: how many entries, how many by the person and how many by the secretary, when last
 * written and by whom, how many the person changed. They are worked out from the entries by
 * `notebookStatistics` and stored nowhere — criterion N3's own words, "drawn from the record, not a
 * second copy".
 */
export function theNotebookNumbersSay(said: NotebookOnACard): ANotebookNumber[] {
  if (said.statistics === null) return []
  const stats = said.statistics
  return [
    { says: 'Entries', value: String(stats.entries) },
    { says: 'By the person', value: String(stats.byThePerson) },
    { says: `By ${said.agent}`, value: String(stats.byTheSecretary) },
    {
      says: 'Last written',
      value:
        stats.lastWritten === null
          ? 'nothing is written in it yet'
          : `${stats.lastWritten.at}, by ${stats.lastWritten.byKind === 'person' ? 'the person' : stats.lastWritten.byId}`,
    },
    { says: 'Changed by the person', value: String(stats.changedByThePerson) },
  ]
}

/** What a card says where the agent holds the card but nobody has written a notebook for it. */
export const NO_NOTEBOOK_ON_THIS_CARD = 'Nobody has written a notebook for this agent'

/**
 * THE SENTENCES BESIDE AN EMPTINESS, DECLARED HERE AND NOT IN THE PAGES.
 *
 * Two reasons, and the second is a rule of this repository. A notebook nobody has written is the
 * same absence wherever it is met — on the page, on the citizen card, on the Role cards page — so
 * one sentence is right. And `tests/absence-weight.test.ts` counts absence sentences written in a
 * `.tsx` outside an `<Absence>` element and refuses a file that grows one, because a sentence about
 * emptiness that did not go through that component is one nobody chose a weight for.
 */
export const NOTHING_WRITTEN_IN_IT_SAYS =
  'Nobody has recorded how this person works, how they want to be answered, what this agent may settle alone, ' +
  'or what its character is. The first entry starts it.'

/** Beside a card whose agent holds the card and has no notebook. */
export const NO_NOTEBOOK_ON_THIS_CARD_SAYS =
  'This agent holds the card and nobody has written its notebook yet. The person writes the first entries.'

/** Beside a card of a role no registered agent holds, so there is no notebook kept under it. */
export const NOBODY_HOLDS_THIS_CARD = 'Nobody holds this card'
export const NOBODY_HOLDS_THIS_CARD_SAYS =
  'No registered agent holds this card, so there is no notebook kept under it. That is nobody holding it rather ' +
  'than nobody having looked.'

/**
 * Newest first, which is the order the page draws and the order the opening reads in.
 *
 * TWO ENTRIES WITH ONE STAMP ARE PUT BACK-TO-FRONT, for the reason `notebookStatistics` gives: the
 * stored list is append-order, so the later index is the later entry, and a plain stable sort would
 * draw them oldest-first inside a second while everything around them read newest-first.
 */
export function newestFirst(entries: readonly NotebookEntry[]): NotebookEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.at === b.entry.at ? b.index - a.index : a.entry.at > b.entry.at ? -1 : 1))
    .map((one) => one.entry)
}

/** The heading the opening block is printed under, on every surface that prints it. */
export const THE_NOTEBOOK_HEADING = 'YOUR NOTEBOOK — read this before anything else.'

/**
 * WHAT THE OPENING SAYS WHEN THERE IS NO NOTEBOOK. It says nobody has written one, which is not the
 * same as saying there is nothing to know: invariant 5.
 */
export const NOBODY_HAS_WRITTEN_A_NOTEBOOK =
  'No notebook has been written for you yet. Nobody has recorded how this person works, how they want ' +
  'to be answered, what you may settle alone, or what your character is. That is an absence and not ' +
  'an answer: do not invent any of it. The person writes the first entries.'

/** What the opening says to a caller that is not an agent holding a notebook. */
export const THE_BRIEF_WAS_NOT_READ_FOR_AN_AGENT =
  'This brief was not read for an agent, so no notebook was looked for.'

/**
 * THE BLOCK A RUN READS FIRST, as plain lines.
 *
 * It is the whole notebook and not a summary. A run on another model must take up the secretary's
 * ways of working and its character at once, and a summary of a character is not a character.
 * The notebook is short by construction — a person and a secretary writing a few lines each — so
 * handing over all of it costs little and losing part of it costs the whole point.
 *
 * IT IS NOT ON THE BRIEF'S SIZE LADDER. The three things the brief drops when it is too long are
 * the person's words, unranked loops and warrant words. The notebook is not among them
 * and must not be: a brief that quietly dropped the secretary's character would hand back a
 * different secretary with nothing saying so.
 */
export function theNotebookOpening(input: {
  /** The handle of the agent this brief is being read for, or null when the reader is not one. */
  agent: string | null
  /** Its entries, or null when no notebook has been written for it. */
  entries: readonly NotebookEntry[] | null
}): string {
  const lines: string[] = [THE_NOTEBOOK_HEADING]
  if (input.agent === null) {
    lines.push(`  ${THE_BRIEF_WAS_NOT_READ_FOR_AN_AGENT}`)
    return lines.join('\n')
  }
  if (input.entries === null || input.entries.length === 0) {
    lines.push(`  ${NOBODY_HAS_WRITTEN_A_NOTEBOOK}`)
    return lines.join('\n')
  }
  const stats = notebookStatistics(input.entries)
  lines.push(
    `  This is the notebook kept under your name, ${input.agent}. It is how this person works, how they ` +
      'want to be answered, what you may settle alone, and who you are at work. Read it as yours.',
    `  ${String(stats.entries)} entries: ${String(stats.byThePerson)} written by the person, ` +
      `${String(stats.byTheSecretary)} written by you.`,
  )
  for (const entry of newestFirst(input.entries)) {
    const who = entry.writtenByKind === 'person' ? `${entry.writtenById} (the person)` : entry.writtenById
    const changed = entry.changedByThePerson === undefined ? '' : `, changed by the person ${entry.changedByThePerson.at}`
    lines.push(`  - ${entryKindLabel(entry.entryKind)} — ${who}, ${entry.at}${changed}`)
    for (const line of entry.text.split('\n')) lines.push(`      ${line}`)
  }
  return lines.join('\n')
}
