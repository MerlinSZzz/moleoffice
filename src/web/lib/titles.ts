// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD IS CALLED, FOR A SCREEN THAT HAS AN ID AND NEEDS A NAME.
 *
 * Two screens now need this: the offer to take somebody to a record, and the line under a comment
 * in the messages panel saying which record it is on. Both hold a record id and neither may draw
 * one — an id is a machine word, and a machine word where a name belongs is the thing
 * `tests/the-machine-word-gate.test.ts` exists to stop.
 *
 * ONE TITLE IS READ ONCE AND KEPT FOR THE LIFE OF THE PAGE. A title changes rarely and a screen
 * that asked again on every render would ask a hundred times for one line of text. What that costs
 * is that a title changed in another tab is drawn as it was until this page is loaded again.
 *
 * A RECORD THIS PROJECT DOES NOT HOLD GETS A SENTENCE AND NOT AN ID. That is a real answer: the
 * record was deleted, or it is in another project, and either way the reader is better served by
 * being told so than by being shown twelve characters.
 *
 * A RECORD WHOSE TITLE HAS NOT BEEN READ IS CALLED A RECORD. While the read is out, and after a read
 * that failed, nobody has seen whether this project holds the record, so the sentence would say
 * something nobody saw. Only the door's answer that this project holds no such record gets it.
 *
 * ---------------------------------------------------------------------------------------
 * TWO QUESTIONS ARE ANSWERED HERE AND THEY ARE NOT THE SAME QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * `useRecordTitles` answers *what is this record's title*, which is the line the offer and the
 * comment line need. `useRecordNames` answers *what short name does a reader see in front of this
 * record's id*, which is the label somebody wrote or, where nobody wrote one, the title standing in
 * and said to be standing in. Both read the same stored words from the server and neither works
 * anything out, so they cannot come to disagree about what a record is called. Both now ask for a
 * screen's worth of records in one request through `POST /api/short-forms/rows`: this file used to
 * read one record at a time, which is how the front page's claims band came to make 31 requests for
 * 31 titles (problem dfi72F0VtyK5).
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { LEADING } from '@shared/messages.ts'
import {
  MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
  isMessageLinkLevel,
  type MessageLinkLevel,
} from '@shared/participants.ts'
import type { RecordKind } from '@shared/types.ts'
import { api, errorMessage } from '../api.ts'

/** Every title read so far in this page, so two screens asking for one record ask once. */
const known = new Map<string, string>()

/**
 * THE MARK KEPT FOR A RECORD NOTHING ANSWERS TO, never drawn itself.
 *
 * `known` lives for the page, across a change of page language. It used to keep the sentence
 * itself, LEADING.somewhereUnknown, and that was one fixed English string. Since the lead pane's
 * words moved into the word lists (problem t_ox8XMOvu7a), the sentence is read in the page language,
 * so a sentence kept in `known` stayed in the language of the moment it was read: a page switched to
 * Chinese drew "somewhere this project does not hold", and ui.tsx's comparison with the sentence of
 * the moment stopped recognising it (a test of the unlisted words caught
 * it). So `known` keeps this mark, and the sentence is read when a title is handed out.
 */
const NOTHING_ANSWERS = '\u0000nothing-answers'

/**
 * THE MARK KEPT FOR A RECORD WHOSE TITLE READ FAILED, never drawn itself.
 *
 * A read that did not come back says nothing about the record, so it is kept apart from the mark
 * above. It is kept for the life of the page, as that one is, and nothing asks again.
 */
const READ_FAILED = '\u0000read-failed'

/**
 * The title as a screen draws it, in the page language now: the sentence for a record nothing
 * answers to, and the record word for one whose read failed.
 */
function drawn(title: string): string {
  if (title === NOTHING_ANSWERS) return LEADING.somewhereUnknown
  if (title === READ_FAILED) return LEADING.aRecord
  return title
}

/** Every title known so far, with the sentence read in the page language now. */
function knownNow(): Record<string, string> {
  return Object.fromEntries([...known].map(([id, title]) => [id, drawn(title)]))
}
/** The records being asked about right now, so two screens asking at once ask once. */
const asking = new Set<string>()

/**
 * What each of these records is called.
 *
 * The answer starts empty and fills in as the reads come back. Until then, a caller draws the
 * record word with `titleOrSentence`: nothing here has been read yet, so nothing may say the record
 * is missing.
 */
export function useRecordTitles(ids: readonly string[]): Readonly<Record<string, string>> {
  const [, setTitles] = useState<Record<string, string>>(() => Object.fromEntries(known))
  const key = [...new Set(ids)].sort().join(',')

  useEffect(() => {
    const wanted = [...new Set(ids)].filter((id) => id !== '' && !known.has(id) && !asking.has(id))
    if (wanted.length === 0) {
      setTitles(Object.fromEntries(known))
      return
    }
    for (const id of wanted) asking.add(id)
    // ONE REQUEST FOR THE WHOLE LIST, NOT ONE PER RECORD. `shortFormRows` is the door that answers a
    // whole list at the title length in one request, and it is the same door `useRecordNames` below
    // already uses. It never substitutes another length: a row that asked for a title and has none
    // comes back with null, and this draws the honest sentence for it rather than some longer text.
    void api
      .shortFormRows(wanted, 'title')
      .then((answer) => {
        const answered = new Map(answer.rows.map((row) => [row.recordId, row.text]))
        for (const id of wanted) {
          const written = answered.get(id)
          // THIS PROJECT DOES NOT HOLD IT, or its title is blank: both get the sentence, because
          // the door answered and had no title to give.
          known.set(
            id,
            written === undefined || written === null || written.trim() === '' ? NOTHING_ANSWERS : written,
          )
        }
      })
      .catch(() => {
        // Handled: the read did not come back, so nothing is known about these records, and they
        // are called records and not said to be missing. The whole batch is one request, so the
        // whole batch fails together.
        for (const id of wanted) known.set(id, READ_FAILED)
      })
      .finally(() => {
        for (const id of wanted) asking.delete(id)
        setTitles(Object.fromEntries(known))
      })
    // The list of ids is compared as one string: a new array of the same ids is a new array, and
    // depending on the array itself would read every record again on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Read at every render, so the sentence is the page language's now, whenever it was read.
  return knownNow()
}

/**
 * What one record is called, from what has been read: its title, the sentence for one nothing
 * answers to, or the record word while its title is not read yet or after its read failed.
 */
export function titleOrSentence(titles: Readonly<Record<string, string>>, id: string | null): string {
  if (id === null) return LEADING.somewhereUnknown
  return titles[id] ?? LEADING.aRecord
}

/** Whether this page's read of the record's title failed, for a screen that has its own words for that. */
export function titleReadFailed(id: string): boolean {
  return known.get(id) === READ_FAILED
}

/**
 * THE RECORD'S TITLE, OR NULL BECAUSE NOTHING IS KNOWN ABOUT IT YET.
 *
 * `titleOrSentence` answers with a sentence for a record nothing answers to, which is right where the
 * sentence is what the reader should see. A caller that has another name to draw must not take that
 * sentence as a title: the lead offer used to do exactly that and printed "somewhere this project does
 * not hold" where a record's name belonged (item 113). Nor must it take the record word handed for a
 * record whose read failed.
 */
export function knownTitleOf(titles: Readonly<Record<string, string>>, id: string | null): string | null {
  if (id === null || titleReadFailed(id)) return null
  const held = titles[id]
  return held === undefined || held === LEADING.somewhereUnknown ? null : held
}

// ================================================ what kind of record a page shows, and its title

/** What kind of record one is and what it is called, as `api.whatARecordIs` answers. */
export interface WhatARecordIs {
  kind: RecordKind
  title: string
}

/** One record in one project, as one key. Two projects never share an id, but the key says both. */
export const recordInProject = (id: string, workspaceId: string): string => `${workspaceId}\u0000${id}`

/**
 * EVERY RECORD READ SO FAR IN THIS PAGE, by project and id. `null` means nothing can be said about it:
 * the project holds no such record, or the read failed. Either way nothing is asked again.
 */
const recordsRead = new Map<string, WhatARecordIs | null>()
/** The keys in a read right now, so two screens asking at once ask once. */
const recordsBeingRead = new Set<string>()

/**
 * WHAT KIND OF RECORD EACH OF THESE IS, AND WHAT IT IS CALLED, each read in the project named.
 *
 * A lead to a page names what the page shows (problem 30fVQwjGa3Qb), and the page may be in another
 * project, so each record is read in its own project. A record that is not read yet, that the
 * project does not hold, or whose read failed is not in the answer. The caller then says what the
 * address alone says, and claims no title.
 */
export function useWhatRecordsAre(
  asks: readonly { id: string; workspaceId: string }[],
): ReadonlyMap<string, WhatARecordIs> {
  const key = [...new Set(asks.map((one) => recordInProject(one.id, one.workspaceId)))].sort().join('\u0001')
  const [, redraw] = useState(0)

  useEffect(() => {
    const wanted = asks.filter((one) => {
      const at = recordInProject(one.id, one.workspaceId)
      return one.id !== '' && !recordsRead.has(at) && !recordsBeingRead.has(at)
    })
    if (wanted.length === 0) return
    for (const one of wanted) recordsBeingRead.add(recordInProject(one.id, one.workspaceId))
    void Promise.all(
      wanted.map(async (one) => {
        const at = recordInProject(one.id, one.workspaceId)
        try {
          recordsRead.set(at, await api.whatARecordIs(one.id, { workspaceId: one.workspaceId }))
        } catch {
          // Handled: the record was not found, or the read did not come back. Nothing is known about
          // it, so nothing is stored but that, and the caller names the page without a title.
          recordsRead.set(at, null)
        } finally {
          recordsBeingRead.delete(at)
        }
      }),
    ).then(() => {
      redraw((n) => n + 1)
    })
    // The asks are compared as one string, for the reason `useRecordTitles` gives above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const out = new Map<string, WhatARecordIs>()
  for (const one of asks) {
    const at = recordInProject(one.id, one.workspaceId)
    const held = recordsRead.get(at)
    if (held !== undefined && held !== null) out.set(at, held)
  }
  return out
}

// ================================================ the short name a message draws in front of an id

/**
 * THE SHORT NAME TO DRAW IN FRONT OF A RECORD ID, AND WHERE THOSE WORDS CAME FROM.
 *
 * A label is the short name somebody writes on a record: two to five words, enough to tell it apart
 * from the records listed beside it. It is the first rung of the reading ladder and most records
 * have none. A title is the second rung: the record's own title, and every record has one.
 *
 * WHICH OF THE TWO A READER ASKED FOR IS A SETTING, criterion M47, and it is the `level` every
 * function here takes. `from` says which of the two the words actually are and `standingIn` says
 * whether that is the one that was asked for, because a caller has to be able to say so on screen.
 */
export interface RecordName {
  /** The words to draw. Never shortened here and never made up. */
  text: string
  /** `label` when these words are somebody's label. `title` when they are the record's own title. */
  from: MessageLinkLevel
  /**
   * TRUE WHEN THESE ARE NOT THE WORDS THAT WERE ASKED FOR and something else stood in.
   *
   * It happens one way only: the label was asked for, nobody wrote one, and the title is drawn
   * instead. The other direction cannot happen, because every record has a title.
   */
  standingIn: boolean
}

/**
 * ONE RECORD AT ONE READING LEVEL, AS ONE KEY.
 *
 * The same record read at the two levels is two different answers, so everything below is keyed by
 * both. Without this, changing the setting would redraw the page from the names read for the level
 * the reader had before.
 */
const at = (level: MessageLinkLevel, id: string): string => `${level}\u0000${id}`

/** The two halves of such a key, back again. */
function fromKey(key: string): { level: MessageLinkLevel; id: string } {
  const cut = key.indexOf('\u0000')
  const level = key.slice(0, cut)
  return { level: isMessageLinkLevel(level) ? level : MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES, id: key.slice(cut + 1) }
}

/**
 * EVERY NAME READ SO FAR IN THIS PAGE, by record and reading level. `null` means Mole Office looked
 * and there is nothing to draw: this project holds no record of that id, or the record has neither a
 * label nor a title.
 *
 * A RECORD WHOSE READ FAILED IS NOT IN HERE AT ALL, and that is the point of the third set below.
 * Storing "no name" for a read that never came back would report a network failure as a record with
 * nothing written on it, which is a claim nobody made.
 */
const namesRead = new Map<string, RecordName | null>()
/** Keys waiting for the next read. Everything queued in one tick goes in one request per level. */
const nameQueue = new Set<string>()
/** Keys in a read right now, so a second screen drawing the same one does not ask again. */
const nameBeingRead = new Set<string>()
/** Keys whose read failed. Not asked again, and nothing is claimed about them. */
const nameReadFailed = new Set<string>()
/** The drawings to tell when a read comes back. */
const nameListeners = new Set<() => void>()
/**
 * HOW MANY TIMES A READ HAS COME BACK. A drawing remembers the number it was drawn at, and a drawing
 * that begins to listen after a read came back sees a new number and draws again (problem OsSkG2fDk9aL).
 */
let namesReadBack = 0
let aReadIsScheduled = false

/**
 * ONE REQUEST FOR EVERY LINK ON SCREEN, RATHER THAN ONE REQUEST PER LINK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE QUEUE IS HERE AND NOT IN THE PANEL THAT DRAWS THE MESSAGES
 * ---------------------------------------------------------------------------------------
 *
 * The messages panel draws five lists — a conversation, a group, an agent-to-agent conversation, an
 * unregistered writer's messages, and the lines Mole Office writes about a conversation — and any of
 * them can hold a message that names a record. A panel that gathered the ids at the top would have
 * to gather them from all five, and the gather already there for the record TITLES misses two of
 * them. So the drawing asks for the names of the ids in its own text, and everything asked for in
 * one tick of the browser goes out as one request. A list added next month cannot forget to join in.
 *
 * `POST /api/short-forms/rows` is the route that answers a whole list at one reading length in one
 * request, and it exists for exactly this: asking per row is a request per row, and a list that
 * cannot afford to ask stops asking.
 *
 * ONE REQUEST, NOT ONE PER LINK. Each row the door answers carries the record's title beside its
 * label, so a record with no label written gets its title from the same answer.
 */
function askForNames(ids: readonly string[], level: MessageLinkLevel): void {
  let anythingNew = false
  for (const id of ids) {
    if (id === '') continue
    const key = at(level, id)
    if (namesRead.has(key) || nameBeingRead.has(key) || nameReadFailed.has(key) || nameQueue.has(key)) continue
    nameQueue.add(key)
    anythingNew = true
  }
  if (!anythingNew || aReadIsScheduled) return
  aReadIsScheduled = true
  // A MICROTASK, so every drawing in this render has queued its ids before the request is built.
  queueMicrotask(() => {
    void readTheQueuedNames()
  })
}

async function readTheQueuedNames(): Promise<void> {
  aReadIsScheduled = false
  const asking = [...nameQueue]
  nameQueue.clear()
  if (asking.length === 0) return
  for (const key of asking) nameBeingRead.add(key)
  // ONE REQUEST PER READING LEVEL, because the two levels are two different questions. In practice
  // there is one level on a page and this is one group; a reader who has just changed the setting
  // can have both in flight for a tick.
  const byLevel = new Map<MessageLinkLevel, string[]>()
  for (const key of asking) {
    const { level, id } = fromKey(key)
    const held = byLevel.get(level) ?? []
    held.push(id)
    byLevel.set(level, held)
  }
  for (const [level, ids] of byLevel) {
    try {
      await readOneLevel(level, ids)
    } catch (err) {
      // HANDLED, AND WHAT IS HANDLED IS SAID. The read did not come back, so nothing is known about
      // these records and nothing is stored about them: the id is drawn on its own, which is what a
      // message showed before any of this existed. They are not asked for again, because a drawing
      // that retried on every render would ask forever.
      for (const id of ids) nameReadFailed.add(at(level, id))
      console.warn(
        `Mole Office: the names of ${String(ids.length)} records named in messages could not be read, so their ` +
          `ids are drawn on their own. ${errorMessage(err)}`,
      )
    }
  }
  for (const key of asking) nameBeingRead.delete(key)
  namesReadBack += 1
  for (const tell of [...nameListeners]) tell()
}

/**
 * READ ONE LEVEL'S WORTH OF NAMES AND STORE WHAT CAME BACK.
 *
 * ONE REQUEST AT EITHER LEVEL. At level 2 the title is what was asked for, so it is drawn whether or
 * not a label exists and nothing is standing in. At level 1 the labels are asked for, and a record
 * nobody wrote a label on draws the title its row carries beside the label, where the title stands in
 * and the link says so. The row's title is its own field, so the door never hands one length for another.
 */
async function readOneLevel(level: MessageLinkLevel, ids: readonly string[]): Promise<void> {
  if (level === 'title') {
    const titles = await api.shortFormRows(ids, 'title')
    const answered = new Map(titles.rows.map((row) => [row.recordId, row.text]))
    for (const id of ids) {
      const written = answered.get(id) ?? null
      namesRead.set(
        at(level, id),
        written === null || written.trim() === '' ? null : { text: written, from: 'title', standingIn: false },
      )
    }
    return
  }
  const labels = await api.shortFormRows(ids, 'label')
  const answered = new Map(labels.rows.map((row) => [row.recordId, row]))
  for (const id of ids) {
    const row = answered.get(id)
    // A RECORD THIS PROJECT DOES NOT HOLD IS LEFT OUT OF THE REPLY. It gets no name, its id is
    // drawn on its own, and nothing is invented for it.
    if (row === undefined) {
      namesRead.set(at(level, id), null)
      continue
    }
    const title = row.title ?? null
    namesRead.set(
      at(level, id),
      row.text !== null && row.text.trim() !== ''
        ? { text: row.text, from: 'label', standingIn: false }
        : title === null || title.trim() === ''
          ? null
          : { text: title, from: 'title', standingIn: true },
    )
  }
}

function listenForNames(tell: () => void): () => void {
  nameListeners.add(tell)
  return () => {
    nameListeners.delete(tell)
  }
}

const howManyNamesReadBack = (): number => namesReadBack

/**
 * TRUE WHILE NOTHING IS KNOWN YET ABOUT THIS RECORD'S NAME AT THIS LEVEL: it has not been asked
 * for, or the answer has not come back. False once the answer came, with a name or without one, and
 * false when the read failed. A drawing marks such an id as still being read, because its words may
 * change length when the name comes.
 */
export function aRecordNameIsStillComing(id: string, level: MessageLinkLevel): boolean {
  const key = at(level, id)
  return !namesRead.has(key) && !nameReadFailed.has(key)
}

/**
 * The short name of each of these records, for the ones that have one.
 *
 * AN ID THAT IS NOT IN THE ANSWER HAS NO NAME TO DRAW — nothing has been read yet, this project
 * holds no such record, or the read failed. The caller draws the id on its own in all three cases,
 * which claims nothing.
 */
export function useRecordNames(ids: readonly string[], level: MessageLinkLevel): ReadonlyMap<string, RecordName> {
  const key = [...new Set(ids)].sort().join(',')
  // LISTENING IS CHECKED AGAINST THE DRAWING. The names are read while the page draws, and listening
  // starts only after it has drawn. A read another drawing made can come back in between, and its
  // news goes only to the drawings already listening. React compares the count it drew at with the
  // count when it begins to listen, and draws again when they differ.
  // A PAGE DRAWN ON THE SERVER reads the same count, so it draws the names held there as it did before
  // this hook listened this way. Without it React throws there (merge entry EbeCygQqnVbF).
  useSyncExternalStore(listenForNames, howManyNamesReadBack, howManyNamesReadBack)

  useEffect(() => {
    askForNames(key === '' ? [] : key.split(','), level)
    // The ids are compared as one string, for the reason `useRecordTitles` gives above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, level])

  const out = new Map<string, RecordName>()
  for (const id of new Set(ids)) {
    const held = namesRead.get(at(level, id))
    if (held !== undefined && held !== null) out.set(id, held)
  }
  return out
}
