// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A DECISION IN THE PERSON'S NAME STANDS ON THE PERSON'S OWN WORDS. This is option C on problem
 * bXW3UpEsrsoZ.
 *
 * A decision an agent writes with `decided_by` "the owner" cites, in `authority_reference`, the record that holds
 * the person's words. Until 4 October any live record would do, so an agent could cite a note it wrote itself. Now
 * the record must be the person's own:
 *   - a message the person sent;
 *   - a report holding an answer the person gave;
 *   - a proposal the person settled by pressing;
 *   - a record the person wrote, which includes a note filed by the person's own press on "File as my words"
 *     (the door for words said somewhere else, such as a secretary's terminal).
 * Each counts only while every change to its words was the person's: a note whose body an agent changed afterwards is
 * the agent's words under the person's name (check ekidFZV6r1Yt of 4 October, round 11b).
 *
 * NEW DECISIONS are refused unless their reference is one of those (`assertMayDecide` in src/server/lib/records/the-persons-own-acts.ts).
 * OLD DECISIONS are not changed. Each one an agent wrote in the person's name whose reference is not the person's own
 * record carries a mark, on the Decisions page and on the decision's own page. This file holds the shapes the server
 * sends and the sentence each mark says, in the reader's language, from one place.
 */
import { readStoredWord } from './i18n.ts'
import { kindWord } from './words.ts'

/** Why a cited record is not the person's own. */
export type NotTheirsBecause =
  /** No record in the office answers to the reference, or there is no reference at all. */
  | 'noRecord'
  /** The record was deleted. */
  | 'deleted'
  /** A message an agent sent, not the person. */
  | 'agentsMessage'
  /** A record somebody other than the person wrote: a note an agent wrote, a report with no answer of the person's. */
  | 'notTheirs'
  /**
   * A record the person wrote or sent, whose words somebody other than the person changed afterwards. It counts as the
   * person's own only while every change to its words was the person's (check ekidFZV6r1Yt, round 11b).
   */
  | 'wordsChanged'

/** What a cited record is, to the question "is it the person's own?". */
export type PersonsOwnRecord =
  | { own: true; as: 'message' | 'answer' | 'proposal' | 'record' }
  | { own: false; because: NotTheirsBecause; kind: string | null; title: string | null }

/** The mark on an old decision in the person's name whose reference is not the person's own record. */
export interface NotOnThePersonsOwnWords {
  /** The decision's `authority_reference`, as stored, or null when it holds none. */
  reference: string | null
  because: NotTheirsBecause
  /** The cited record's kind, when there is a record. */
  kind: string | null
  /** The cited record's title, when there is a record, so the page names it rather than printing its id. */
  referenceTitle: string | null
  /** Who wrote the decision: an agent, the office itself, or nobody recorded who. A decision the person wrote carries no mark. */
  writer: 'agent' | 'office' | 'unrecorded'
  /** The name of the agent that wrote it, when one registered agent answers to the stored writer; otherwise null. */
  writerName: string | null
}

/** The mark's one-line heading, in the reader's language. */
export function sayTheMarkHeading(): string {
  return readStoredWord('ownWords.mark.heading')
}

/**
 * The mark's sentence: who recorded the decision, what it cites, and why that is not the reader's own words. It names
 * the agent and the cited record by name, and prints an id only when nothing answers to it.
 */
export function sayTheMark(mark: NotOnThePersonsOwnWords): string {
  const writer =
    mark.writer === 'agent'
      ? mark.writerName === null
        ? readStoredWord('ownWords.mark.byAnAgent')
        : readStoredWord('ownWords.mark.byNamedAgent', { agent: mark.writerName })
      : readStoredWord(mark.writer === 'office' ? 'ownWords.mark.byTheOffice' : 'ownWords.mark.byNobodyRecorded')
  const title = mark.referenceTitle ?? mark.reference ?? ''
  const kind = kindWord(mark.kind).text
  const cites =
    mark.because === 'noRecord'
      ? mark.reference === null
        ? readStoredWord('ownWords.mark.citesNothing')
        : readStoredWord('ownWords.mark.citesNoRecord', { reference: mark.reference })
      : mark.because === 'deleted'
        ? readStoredWord('ownWords.mark.citesDeleted', { title })
        : mark.because === 'agentsMessage'
          ? readStoredWord('ownWords.mark.citesAgentsMessage', { title })
          : mark.because === 'wordsChanged'
            ? readStoredWord('ownWords.mark.citesChangedWords', { kind, title })
            : readStoredWord('ownWords.mark.citesNotTheirs', { kind, title })
  return `${writer}${cites}`
}

/**
 * What the reader can do about a marked decision: on the list, open it; on its own page, change what it cites. Both say
 * which records would be the reader's own words.
 */
export function sayWhatYouCanDo(where: 'list' | 'page'): string {
  return readStoredWord(where === 'list' ? 'ownWords.mark.whatYouCanDoFromTheList' : 'ownWords.mark.whatYouCanDoHere', {
    press: readStoredWord('ownWords.door.press'),
  })
}

/** One note waiting for the person: the secretary's copy of their words, exactly as it is stored. */
export interface AWaitingNote {
  id: string
  workspaceId: string
  /** The project's name, or null when no project row answers to the stored id. */
  project: string | null
  title: string
  /** The words, exactly as stored. Null when the note holds none, which the press refuses. */
  body: string | null
  /** The day the writing is about, when the secretary gave one. */
  date: string | null
  createdAt: string
  /** Who the change log says wrote the note, or null when no row says. */
  preparedBy: { type: string; id: string; name: string | null } | null
}

/**
 * WHO PRESSED ONE OF THE PERSON'S DOORS UNDER THEIR GRANT: the secretary, by its registry id, the grant it held, and the
 * row of the press, which keeps the reason. A door that writes under the grant stores this, and never the person, so
 * nothing it writes reads as the person's own. Worked out in one place, `whoPressedItUnderTheGrant` in
 * src/server/lib/the-persons-own-words.ts.
 */
export interface PressedUnderTheGrant {
  by: { kind: 'agent'; id: string }
  grant: string
  press: string
}

/** What a note filed under the grant holds: the prepared note it was filed from, and who pressed it. */
export interface FiledUnderTheGrant extends PressedUnderTheGrant {
  from: string
}

/** What a prepared note holds when a secretary said under the grant it is not what the person said, and when. */
export interface NotWhatTheySaidUnderTheGrant extends PressedUnderTheGrant {
  at: string
}
