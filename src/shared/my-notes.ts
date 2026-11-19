// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MY NOTES, WORKED OUT IN ONE PLACE: which notes hold a drawing, which words of a note a search looks in, which notes
 * each choice above the list keeps, and the week a note was started in. `GET /api/records/my-notes`
 * (src/server/lib/my-notes.ts) lists and counts with these, and the page (src/web/pages/MyNotesPage.tsx) draws with the
 * same ones, so the counts and the cards cannot disagree.
 */
import { stampInZone } from './time.ts'
import type { QuickNotePage, QuickNotePart } from './kinds/quick-note.ts'
import type { PanelRecord } from './types.ts'

/** The most notes one reading answers. */
export const MY_NOTES_PAGE_SIZE = 25

/** The choices above the list, in the order the page draws them. `all` keeps every note the search keeps. */
export const MY_NOTES_CHOICES = ['all', 'from-a-page', 'from-no-page', 'drawn'] as const
export type MyNotesChoice = (typeof MY_NOTES_CHOICES)[number]

/** How many notes each choice keeps, counted by the office over every note the search keeps. */
export type MyNotesCounts = Record<MyNotesChoice, number>

/** One week the listed notes were started in: the Monday it starts on, on the reader's calendar, and how many. */
export interface MyNotesWeek {
  starts: string
  count: number
}

/**
 * One note of the list, whole, with the Monday of the week it was started in on the reader's calendar. The office works
 * the week out, because a note's stamp is on the office's clock and the page cannot tell that clock from its own.
 */
export type MyNotesNote = PanelRecord & { week: string }

/** What `GET /api/records/my-notes` answers. */
export interface MyNotesReply {
  /** One page of notes, the newest started first. */
  notes: MyNotesNote[]
  /** The search the notes were kept by, or null when every note was asked for. */
  q: string | null
  choice: MyNotesChoice
  counts: MyNotesCounts
  /** Every week the chosen notes were started in, the newest first, over all of them and not only this page. */
  weeks: MyNotesWeek[]
  /** The Monday the reader's week starts on today, so the page can say which week is this one. */
  thisWeek: string
  /** The time zone the weeks were counted in. */
  zone: string
  matched: number
  returned: number
  offset: number
  limit: number
  left: number
}

/**
 * What `GET /api/records/my-notes/last-written-in` answers: the note the reader last wrote in, among the notes My notes
 * lists for them, whole, and when they wrote in it, on the office's clock. Both are null when they have written in none
 * of those notes, which is an answer and not a failure to read.
 */
export type NoteLastWrittenIn = { note: PanelRecord; writtenAt: string } | { note: null; writtenAt: null }

/** A note's parts as stored. The kind refuses a note whose parts are not a list of parts. */
export function theParts(note: Pick<PanelRecord, 'data'>): QuickNotePart[] {
  const parts = note.data['parts']
  return Array.isArray(parts) ? (parts as QuickNotePart[]) : []
}

/** The page a note was started on, or null when it was started from no page. */
export function thePageItWasStartedOn(note: Pick<PanelRecord, 'data'>): QuickNotePage | null {
  const page = note.data['from_page']
  return page !== null && typeof page === 'object' ? (page as QuickNotePage) : null
}

/** Whether a note holds a drawing: a stroke or a box. A line joins two boxes, so a note with a line holds boxes. */
export function holdsADrawing(parts: readonly QuickNotePart[]): boolean {
  return parts.some((part) => (part.type === 'stroke' && part.points.length >= 2) || part.type === 'box')
}

/** Whether a choice above the list keeps this note. */
export function theChoiceKeeps(choice: MyNotesChoice, note: Pick<PanelRecord, 'data'>): boolean {
  if (choice === 'all') return true
  if (choice === 'drawn') return holdsADrawing(theParts(note))
  const started = thePageItWasStartedOn(note) !== null
  return choice === 'from-a-page' ? started : !started
}

/**
 * THE WORDS OF A NOTE A SEARCH LOOKS IN: what the person wrote, in words and in boxes, the names of the pages the note
 * shows, and what was copied in from a page. Never the note's part types, colours, ids or file paths, which a search of
 * the whole record would also find. A copied report block is given whole, so it is searched as a search finds it in its
 * report.
 */
export function theWordsOfANote(note: Pick<PanelRecord, 'data'>): unknown[] {
  const words: unknown[] = []
  const started = thePageItWasStartedOn(note)
  if (started !== null) words.push(started.name)
  for (const part of theParts(note)) {
    if (part.type === 'words' || part.type === 'box') words.push(part.text ?? '')
    else if (part.type === 'picture') words.push(part.alt ?? '')
    else if (part.type === 'added') {
      words.push(part.from.name)
      if (part.copy.type === 'card') words.push(part.copy.title, part.copy.summary ?? '')
      else if (part.copy.type === 'blocks') words.push(part.copy.blocks)
    }
  }
  return words
}

/** One day after another on the calendar, as `YYYY-MM-DD`, with no clock and no zone in it. */
function aDayOn(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

/** The Monday the week holding this moment starts on, on the calendar of this time zone. */
export function theWeekOf(ms: number, zone: string): string {
  const day = stampInZone(ms, zone).slice(0, 10)
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const sinceMonday = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7
  return aDayOn(day, -sinceMonday)
}

/** The Monday of the week before a week, for the page's "Last week". */
export function theWeekBefore(week: string): string {
  return aDayOn(week, -7)
}
