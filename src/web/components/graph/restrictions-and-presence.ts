// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT RESTRICTS THE RECORDS OF A DRAWING, AND WHO IS WORKING ON THEM: the two reads a drawing makes for its own
 * records, and the sentences a page says about them.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DRAWINGS READ THEM
 * ---------------------------------------------------------------------------------------
 *
 * The canvas reads both for its cards and draws them as marks on the cards (src/web/components/graph/Canvas.tsx). A
 * drawing that marks no card reads the same two answers, and the page says them in words instead, from
 * `whatADrawingWithNoMarksSays` below. Both read here, so they ask the same question and keep the same three states.
 *
 * ---------------------------------------------------------------------------------------
 * NOBODY LOOKED IS NOT NOTHING IS THERE
 * ---------------------------------------------------------------------------------------
 *
 * Each read has three states, not a boolean: it has not answered yet, it answered, or it failed. A drawing with no
 * restriction mark must not read as one nothing restricts, so while a read runs, when it fails and for each check that
 * could not run, the page says so in the canvas's own words; and once both have answered, a drawing that marks no card
 * names the restricted records and the records with a work domain, and says that it does not mark them.
 */
import { t, type WordKey } from '@shared/i18n.ts'
import { useEffect, useMemo, useState } from 'react'

import { api, type RestrictionReading } from '../../api.ts'
import type { PresenceHere } from './Presence.tsx'

/** A check of the restriction read that could not run, kept in its own words: what, and then because (round 217). */
export interface CheckThatCouldNotRun {
  what: string
  because: string
}

/** What restricts each record of the drawing, in three states. */
export type RestrictionsRead =
  | { at: 'reading' }
  | { at: 'read'; byRecord: Record<string, RestrictionReading[]>; couldNotCheck: readonly CheckThatCouldNotRun[] }
  | { at: 'failed'; problem: string }

/** Who is working on each record of the drawing, in three states. */
export type PresenceRead =
  | { at: 'reading' }
  | { at: 'read'; byRecord: Record<string, PresenceHere[]>; domainsRead: number; couldNotCheck: number }
  | { at: 'failed'; problem: string }

/** A record is restricted while one of its readings is not resolved. The canvas counts its cards by this too. */
export function stillRestricts(readings: readonly RestrictionReading[]): boolean {
  return readings.some((reading) => reading.standing.state !== 'resolved')
}

/**
 * BOTH READS, FOR THE DRAWING'S OWN RECORDS AND NOT THE PROJECT.
 *
 * A canvas showing 19 cards of a 727-record project that read the whole project would do 700 records' work to draw 19
 * marks, and would do it again every time somebody pressed a card. Each read takes this drawing's record ids and answers
 * per record: `GET /api/restrictions?records=`, with `restrictionsReaching` on the server the one batched read behind it,
 * and `GET /api/work-domains/presence?records=`, with `presenceOn` behind it. Round ten wave 11's step 10 asked for the
 * second in its own words: *presence is computed for the nodes on screen, not for a whole project on every draw*.
 *
 * THE SORTED SET OF IDS IS THE QUESTION. The ids are asked once each, sorted, and the joined string decides whether to
 * ask again, so a list rebuilt with the same records does not read again.
 */
export function useRestrictionsAndPresence(recordIds: readonly string[]): { restrictions: RestrictionsRead; presence: PresenceRead } {
  const idsKey = [...new Set(recordIds)].sort().join(',')
  const asked = useMemo(() => (idsKey === '' ? [] : idsKey.split(',')), [idsKey])
  const [restrictions, setRestrictions] = useState<RestrictionsRead>({ at: 'reading' })
  useEffect(() => {
    if (asked.length === 0) {
      setRestrictions({ at: 'read', byRecord: {}, couldNotCheck: [] })
      return
    }
    let live = true
    setRestrictions({ at: 'reading' })
    api
      .restrictionsOnThese(asked)
      .then((reply) => {
        if (live) setRestrictions({ at: 'read', byRecord: reply.byRecord, couldNotCheck: reply.couldNotCheck })
      })
      .catch((err: unknown) => {
        // NOT swallowed into "nothing is restricted". A read that could not run and a drawing
        // nothing restricts are different answers and only one of them is about the records.
        if (live) setRestrictions({ at: 'failed', problem: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      live = false
    }
  }, [asked])

  const [presence, setPresence] = useState<PresenceRead>({ at: 'reading' })
  useEffect(() => {
    if (asked.length === 0) {
      setPresence({ at: 'read', byRecord: {}, domainsRead: 0, couldNotCheck: 0 })
      return
    }
    let live = true
    setPresence({ at: 'reading' })
    api
      .presenceOnThese(asked)
      .then((reply) => {
        if (live) {
          setPresence({
            at: 'read',
            byRecord: reply.byRecord,
            domainsRead: reply.domainsRead,
            couldNotCheck: reply.couldNotCheck.length,
          })
        }
      })
      .catch((err: unknown) => {
        // NOT swallowed into "nobody is working here". A read that could not run and a drawing
        // nobody is on are different answers and only one of them is about the records.
        if (live) setPresence({ at: 'failed', problem: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      live = false
    }
  }, [asked])

  return { restrictions, presence }
}

/** While the restriction read runs. */
export function restrictionsReadingWords(): string {
  return t('g7b.Canvas.reading_what_restricts_these_records')
}

/** When the restriction read failed, with its problem. */
export function restrictionsFailedWords(problem: string): string {
  return `${t('g7b.Canvas.what_restricts_these_records_could_not_be')}${t('g7b.Canvas.so_no_card_carries_a_restriction_mark')}${problem}`
}

/** The checks of the restriction read that could not run, each in its own words. */
export function checksThatCouldNotRunWords(checks: readonly CheckThatCouldNotRun[]): string {
  return (
    `${String(checks.length)}${t('g7b.Canvas.restriction')} ${checks.length === 1 ? t('g7b.Canvas.check') : t('g7b.Canvas.checks')}` +
    `${t('g7b.Canvas.could_not_run')}: ${checks.map((gap) => `${gap.what} — ${gap.because}`).join('; ')}`
  )
}

/** While the presence read runs. */
export function presenceReadingWords(): string {
  return t('g7b.Canvas.reading_who_is_working_on_these_records')
}

/** When the presence read failed, with its problem. */
export function presenceFailedWords(problem: string): string {
  return `${t('g7b.Canvas.who_is_working_on_these_records_could')}${t('g7b.Canvas.so_no_card_shows_anybody')}${problem}`
}

/** Records named by title, in the order given. */
const byTitle = (records: readonly { title: string }[]): string => records.map((record) => `“${record.title}”`).join(', ')

/** A sentence a page says, with the word key that writes it: the key the developer view names it by. */
export interface ASentenceAndItsWord {
  key: WordKey
  words: string
}

/**
 * WHAT A DRAWING THAT MARKS NO CARD SAYS ABOUT ITS RECORDS, each a whole sentence, and only the ones that are true.
 *
 *   - while a read runs, when it fails and for each check that could not run: the canvas's own words;
 *   - once a read has answered: the restricted records and the records with a work domain, by title in the order
 *     given, and that this drawing does not mark them. Nothing, when none is.
 *
 * `records` are the drawing's records with their titles, the same records the reads were asked about.
 */
export function whatADrawingWithNoMarksSays(
  read: { restrictions: RestrictionsRead; presence: PresenceRead },
  records: readonly { id: string; title: string }[],
): string[] {
  return whatADrawingWithNoMarksSaysByWord(read, records).map((sentence) => sentence.words)
}

/**
 * THE SAME SENTENCES, EACH WITH THE WORD KEY THAT WRITES IT, so a page can say some to every reader and the others in
 * the developer view only (16 November 2026). A sentence written from several words is named by the word that says
 * what happened: `g7b.Canvas.could_not_run` for the checks that could not run, and the opening word for a read that
 * failed.
 */
export function whatADrawingWithNoMarksSaysByWord(
  read: { restrictions: RestrictionsRead; presence: PresenceRead },
  records: readonly { id: string; title: string }[],
): ASentenceAndItsWord[] {
  const out: ASentenceAndItsWord[] = []
  const say = (key: WordKey, words: string): void => {
    out.push({ key, words })
  }
  const { restrictions, presence } = read
  if (restrictions.at === 'reading') say('g7b.Canvas.reading_what_restricts_these_records', restrictionsReadingWords())
  if (restrictions.at === 'failed') say('g7b.Canvas.what_restricts_these_records_could_not_be', restrictionsFailedWords(restrictions.problem))
  if (restrictions.at === 'read') {
    const restricted = records.filter((record) => stillRestricts(restrictions.byRecord[record.id] ?? []))
    if (restricted.length > 0) say('drawingWithNoMarks.restricted', t('drawingWithNoMarks.restricted', { n: restricted.length, titles: byTitle(restricted) }))
    if (restrictions.couldNotCheck.length > 0) say('g7b.Canvas.could_not_run', checksThatCouldNotRunWords(restrictions.couldNotCheck))
  }
  if (presence.at === 'reading') say('g7b.Canvas.reading_who_is_working_on_these_records', presenceReadingWords())
  if (presence.at === 'failed') say('g7b.Canvas.who_is_working_on_these_records_could', presenceFailedWords(presence.problem))
  if (presence.at === 'read') {
    const workedOn = records.filter((record) => (presence.byRecord[record.id] ?? []).length > 0)
    if (workedOn.length > 0) say('drawingWithNoMarks.workDomain', t('drawingWithNoMarks.workDomain', { n: workedOn.length, titles: byTitle(workedOn) }))
  }
  return out
}
