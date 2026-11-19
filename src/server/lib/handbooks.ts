// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBOOK'S WRITES, AND HOW IT IS SENT. A handbook is guidance for whoever starts a flow or takes a role card;
 * src/shared/handbooks.ts holds its lists, how its stored fields are read and the one rule for which languages are sent.
 *
 * WHAT ONE WRITE MAY DO, asked by `checkAHandbookWrite` from the record door's create and patch paths, against the
 * version the write replaces:
 *   - a write that changes the text adds exactly one entry at the end of `text_changes`, naming exactly the languages it
 *     changed, and a write that changes no text adds none. Earlier entries stay as they were. A restore of an earlier
 *     version is the one write that may shorten the record, because the ledger names the version it put back;
 *   - a place the write adds to `hangs_on` is there: a live flow, a step that flow has, a role card the office holds, or a
 *     project;
 *   - an agent's write that puts a role card into `hangs_on`, or that changes the text of an in-use handbook on a card,
 *     or that puts one in use, meets the rule for a card's words (`refuseACardWordsActOffTheOwnersDecision`): it needs
 *     the person's message and a live decision made on it. The same handbook on a flow or a project needs neither.
 * Each refusal is a shape refusal, with the path it is about, as every other field of a record is refused.
 *
 * WHO WROTE EACH VERSION, AND WHEN, IS THE LEDGER'S. Every version is a revision of the record, with who wrote it and
 * when, and the newest `text_changes` entry of a version says why its text changed. Nothing here stores them again.
 *
 * HOW IT IS SENT. An in-use handbook on a flow, or on one of its steps, goes to the agent that starts that flow, in one
 * message from the office, inside the write that files the flow run (`sendTheHandbooksOfAFlowStart`). An in-use
 * handbook on a role card goes in the card message (lib/cardmessage.ts). Each is sent in the reader's language by
 * `theLanguagesToSend`, with who wrote its text, why, and the opening; the rest is read with GET /api/records/<id>.
 * One with no text is sent saying it holds none, and one whose "for" is blank as nobody having recorded whom it is for.
 * A flow or a card with no in-use handbook gets nothing new. A project's handbook and the planning flow's are not sent
 * in this first version.
 *
 * EVERY SENTENCE IS BUILT IN HANDBOOK_SAYS below, the refusals and the lines of a message alike, so a test reads it
 * from there.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { stepsOf } from '@shared/flow-steps.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import {
  HANDBOOK_KIND,
  IN_USE,
  theCardsOf,
  theForOf,
  theLanguagesToSend,
  theNewestWhyOf,
  thePlacesOf,
  theStateOf,
  theTextChangesOf,
  theTextOf,
  type FlowHandbookRead,
  type HandbookListBucket,
  type HandbookPlace,
  type HandbookRead,
  type WhyTheseLanguages,
} from '@shared/handbooks.ts'
import type { NarrowedByPermission } from '@shared/disclosure.ts'
import { isLanguage, sayInEnglish, type Language } from '@shared/i18n.ts'
import type { ValidationError } from '@shared/kinds.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import type { RecordOrigin } from '@shared/types.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { countWords } from '@shared/zoom.ts'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { theProjectsAReaderMayRead } from '../db/the-projects-a-reader-may-read.ts'
import { refuseACardWordsActOffTheOwnersDecision, type AnActOnACardsWords } from './card-words.ts'
import { theLanguageOfTheAgent } from './cardmessage.ts'
import { fileTheProblem } from './flow-runs.ts'
import { nameOf, writeASystemLineToOne } from './groups.ts'
import type { AMessageReader } from './messages.ts'
import { participantForActor } from './participant-for-actor.ts'
import { type Actor } from './records.ts'
import { sameJson } from '@shared/same-json.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCards } from './roles.ts'
import { formatValidationErrors } from '@shared/validation-errors.ts'
import { getWorkspace } from '../db/get-workspace.ts'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Where a place is said in words, for a refusal and for a message. */
function thePlaceInWords(place: HandbookPlace): string {
  if ('card' in place) return `the role card "${place.card}"`
  if ('project' in place) return `the project ${place.project}`
  return place.step === undefined ? `the flow ${place.flow}` : `step ${place.step} of the flow ${place.flow}`
}

/**
 * WHAT THE OFFICE SAYS ABOUT A HANDBOOK, each sentence built here and nowhere else: the refusals of a write, why a place
 * is not there, how the card rule's refusal names the act, and the lines of a handbook as a message sends it. Whom it
 * is for when nobody recorded it, and that it holds no text, are the handbook page's own words, so both say the same.
 */
export const HANDBOOK_SAYS = {
  anEarlierEntryChanged: (held: number): string =>
    `data.text_changes changes or removes an earlier entry. Earlier entries stay as they were: send the ${held} ` +
    'it holds unchanged, and add one entry at the end for this write.',
  anEntryWithNoTextChange: (): string =>
    'data.text_changes gains an entry, and this write changes no language\'s text. Add an entry only with a change to data.text.',
  notExactlyOneEntry: (changed: readonly string[], gained: number): string =>
    `This write changes the text in ${changed.join(', ')}, so data.text_changes must gain exactly one entry at its end, ` +
    `{"languages": ${JSON.stringify(changed)}, "why": "<why the text changed>"}. It gains ${gained}.`,
  otherLanguagesNamed: (at: number, named: readonly string[], changed: readonly string[]): string =>
    `data.text_changes[${at}].languages names ${JSON.stringify(named)}, and this write changes the text in ` +
    `${JSON.stringify(changed)}. Name exactly the languages whose text changed.`,
  aPlaceNotThere: (at: number, place: HandbookPlace, why: string): string => `data.hangs_on[${at}] names ${thePlaceInWords(place)}, and ${why}.`,
  noRoleCard: (card: string): string => `the office holds no role card "${card}"`,
  noProject: (project: string): string => `no project has the id ${project}`,
  noLiveFlow: (flow: string): string => `no live flow has the id ${flow}`,
  noStep: (flow: string, step: number): string => `the flow ${flow} has no step ${step}`,
  /** The card rule's words for a write of a handbook, in the place its refusal names the act. */
  theActOnACard: (act: AnActOnACardsWords, subject: string, cards: readonly string[]): string => {
    const on = `on the role card${cards.length === 1 ? '' : 's'} ${cards.map((card) => `"${card}"`).join(' and ')}`
    return act === 'create' ? `filing a handbook, "${subject}", ${on},` : `this ${act} of ${subject}, a handbook ${on},`
  },
  heading: (title: string, id: string, version: number | null): string => `"${title}" (handbook ${id}${version === null ? '' : `, version ${version}`})`,
  forWhom: (who: string | null): string => (who === null ? sayInEnglish('handbookPage.forNotSaid') : `It is for ${who}.`),
  youHaveIt: (because: string): string => `You have it because ${because}.`,
  onTheCard: (card: string): string => `it hangs on the ${card} card you hold`,
  /** Where on the flow just started a handbook hangs: the whole flow, some of its steps, or both. */
  onTheFlowStarted: (onTheFlow: boolean, steps: readonly number[]): string => {
    const where = [
      ...(onTheFlow ? ['the flow you started'] : []),
      ...(steps.length === 0 ? [] : [`step${steps.length === 1 ? '' : 's'} ${steps.join(' and ')} of ${onTheFlow ? 'it' : 'the flow you started'}`]),
    ].join(' and on ')
    return `it hangs on ${where}`
  },
  writerNotKnown: (): string => 'The office holds no version of it, so who wrote its text is not known.',
  wrote: (who: string, at: string): string => `${who} wrote this text on ${at}.`,
  aWriterNotKnown: (recordedAs: string): string => `Somebody the office does not know, recorded as "${recordedAs}",`,
  why: (why: string | null): string => (why === null ? 'Its change record says no reason.' : `The newest change said why: "${why}".`),
  noText: (): string => sayInEnglish('handbookPage.noText'),
  /** Why the languages sent were sent, in a sentence. */
  theLanguages: (sent: { languages: readonly Language[]; why: WhyTheseLanguages }, reads: Language | null): string => {
    const all = sent.languages.join(', ')
    if (sent.why === 'theirs') return `It is sent in ${all}, the language your agent record names.`
    if (sent.why === 'english') return `It is not written in ${reads ?? ''}, the language your agent record names, so it is sent in English.`
    if (sent.why === 'unknown') return `Nobody told the office which language you read, so it is sent in every language it is written in: ${all}.`
    return `It is written in neither ${reads ?? ''}, the language your agent record names, nor English, so it is sent in every language it is written in: ${all}.`
  },
  inALanguage: (language: Language): string => `In ${language}:`,
  theRest: (words: number, id: string): string => `The rest is ${words} words long. Read it with GET /api/records/${id}.`,
} as const

/** The stored text of a handbook's data, by language, as it is stored, so a change in any part of it is seen. */
const theStoredTextOf = (data: unknown): Record<string, unknown> => (isObject(data) && isObject(data['text']) ? data['text'] : {})

/** The languages whose text differs between two versions: written in one and not the other, or written differently. */
function theLanguagesChanged(before: unknown, after: unknown): string[] {
  const was = theStoredTextOf(before)
  const is = theStoredTextOf(after)
  return [...new Set([...Object.keys(was), ...Object.keys(is)])].filter((language) => !sameJson(was[language], is[language])).sort()
}

/** Why a place a write adds is not there, or null because it is. */
function whyThisPlaceIsNotThere(place: HandbookPlace): string | null {
  if ('card' in place) {
    return theRoleCards().cards.some((card) => card.name === place.card) ? null : HANDBOOK_SAYS.noRoleCard(place.card)
  }
  if ('project' in place) {
    return getWorkspace(place.project) !== null && isAProjectOnAList(place.project) ? null : HANDBOOK_SAYS.noProject(place.project)
  }
  const flow = db
    .select({ data: records.data })
    .from(records)
    .where(and(eq(records.id, place.flow), eq(records.kind, 'flow'), isNull(records.deletedAt)))
    .get()
  if (flow === undefined) return HANDBOOK_SAYS.noLiveFlow(place.flow)
  if (place.step === undefined) return null
  return stepsOf(flow.data).some((step) => step['n'] === place.step) ? null : HANDBOOK_SAYS.noStep(place.flow, place.step)
}

/**
 * CHECK ONE WRITE OF A HANDBOOK, against the version it replaces. `before` is null on a create, and on a write that makes
 * another kind of record a handbook. `subject` is what the card rule's refusal names: the title on a create, the id
 * after. Throws the refusal; returns when the write may be stored.
 */
export function checkAHandbookWrite(write: { before: unknown; after: unknown; actor: Actor; subject: string; restoring: boolean }): void {
  const { before, after, actor, subject, restoring } = write
  const errors: ValidationError[] = []
  const changed = theLanguagesChanged(before, after)
  const earlier = before === null ? [] : theTextChangesOf(before)
  const now = theTextChangesOf(after)
  if (!restoring) {
    const kept = now.length >= earlier.length && earlier.every((entry, n) => sameJson(entry, now[n]))
    if (!kept) errors.push({ path: 'data.text_changes', message: HANDBOOK_SAYS.anEarlierEntryChanged(earlier.length) })
    const added = kept ? now.slice(earlier.length) : []
    if (kept && changed.length === 0 && added.length > 0) errors.push({ path: 'data.text_changes', message: HANDBOOK_SAYS.anEntryWithNoTextChange() })
    if (kept && changed.length > 0 && added.length !== 1) errors.push({ path: 'data.text_changes', message: HANDBOOK_SAYS.notExactlyOneEntry(changed, added.length) })
    const entry = added.length === 1 ? added[0] : undefined
    const named = isObject(entry) && Array.isArray(entry['languages']) ? entry['languages'].filter((one) => typeof one === 'string').sort() : null
    if (changed.length > 0 && named !== null && !sameJson(named, changed)) {
      errors.push({ path: `data.text_changes[${earlier.length}].languages`, message: HANDBOOK_SAYS.otherLanguagesNamed(earlier.length, named, changed) })
    }
    // A PLACE THIS WRITE ADDS IS THERE. A place the version already named is not asked again, so a flow deleted since
    // does not refuse an unrelated change; nor is a restore, which puts back what an earlier version held.
    const placesBefore = before === null ? [] : thePlacesOf(before)
    thePlacesOf(after).forEach((place, n) => {
      if (placesBefore.some((one) => sameJson(one, place))) return
      const why = whyThisPlaceIsNotThere(place)
      if (why !== null) errors.push({ path: `data.hangs_on[${n}]`, message: HANDBOOK_SAYS.aPlaceNotThere(n, place, why) })
    })
  }
  if (errors.length > 0) throw new PanelError(formatValidationErrors(HANDBOOK_KIND, errors))
  checkTheCardRule({ before, after, actor, subject, restoring, textChanged: changed.length > 0 })
}

/**
 * THE CARD RULE ON A HANDBOOK. A handbook on a role card is sent to every agent that takes the card, so its text is
 * read as the card's own guidance. An agent's write that adds a card, or that leaves an in-use handbook on a card with
 * text it did not have or in use when it was not, needs what a change to a card's words needs.
 */
function checkTheCardRule(write: { before: unknown; after: unknown; actor: Actor; subject: string; restoring: boolean; textChanged: boolean }): void {
  const { before, after, actor, subject, restoring, textChanged } = write
  const cards = theCardsOf(after)
  if (cards.length === 0) return
  const cardsBefore = before === null ? [] : theCardsOf(before)
  const addedCards = cards.filter((card) => !cardsBefore.includes(card))
  const inUse = theStateOf(after) === IN_USE
  const wasInUse = before !== null && theStateOf(before) === IN_USE
  if (addedCards.length === 0 && !(inUse && (textChanged || !wasInUse))) return
  const act: AnActOnACardsWords = before === null ? 'create' : restoring ? 'restore' : 'change'
  refuseACardWordsActOffTheOwnersDecision(actor, act, subject, HANDBOOK_SAYS.theActOnACard(act, subject, addedCards.length > 0 ? addedCards : cards))
}

/**
 * BRINGING BACK A DELETED HANDBOOK, asked by `restoreRecord`. An in-use handbook on a card comes back to every agent that
 * takes the card, so an agent's undelete of one meets the card rule as a restore. A delete is not asked: it sends nothing.
 */
export function checkAHandbookBroughtBack(record: { id: string; data: unknown }, actor: Actor): void {
  const cards = theCardsOf(record.data)
  if (cards.length === 0 || theStateOf(record.data) !== IN_USE) return
  refuseACardWordsActOffTheOwnersDecision(actor, 'restore', record.id, HANDBOOK_SAYS.theActOnACard('restore', record.id, cards))
}

// ================================================================================ how one is sent

/** One handbook as a message carried it: which record, which version, in which languages. */
export interface AHandbookSent {
  id: string
  version: number
  languages: Language[]
}

/** The key in a message's `extra` bag that names the handbook records it carried. */
export const HANDBOOKS_SENT_MARK = 'handbooksSent'

/** An in-use handbook as it is read to be sent. */
interface AHandbookToSend {
  id: string
  title: string
  /** The project it is filed in. */
  project: string
  data: Record<string, unknown>
}

/** Every live handbook, in any state, in the order they were filed. There are few, and every project is read. */
function theLiveHandbooks(): AHandbookToSend[] {
  // ROWID BREAKS A TIE: two handbooks filed in the same second have the same created_at.
  return (
    sqlite
      .prepare('SELECT id, title, workspace_id AS project, data FROM records WHERE kind = ? AND deleted_at IS NULL ORDER BY created_at, rowid')
      .all(HANDBOOK_KIND) as { id: string; title: string; project: string; data: string }[]
  ).flatMap((row) => {
    const data: unknown = JSON.parse(row.data)
    return isObject(data) ? [{ id: row.id, title: row.title, project: row.project, data }] : []
  })
}

/** A list of handbooks as one reader is given it, and what permission took off it, as the reply says it. */
export interface HandbooksAReaderMayRead<List> {
  handbooks: List
  narrowedByPermission: NarrowedByPermission<HandbookListBucket>
}

/**
 * THE LIVE HANDBOOKS ONE READER MAY READ, AND THE ONES IT MAY NOT. A handbook is a record of the project it is filed in,
 * and a reader who may not read that project is told neither the handbook nor its title. Which projects a reader may
 * read is `theProjectsAReaderMayRead`'s one rule, and today it names every project, so nothing is left out yet.
 */
function theLiveHandbooksFor(reader: AMessageReader): { may: AHandbookToSend[]; mayNot: AHandbookToSend[] } {
  const readable = new Set(theProjectsAReaderMayRead(reader).map((project) => project.id))
  const live = theLiveHandbooks()
  return { may: live.filter((one) => readable.has(one.project)), mayNot: live.filter((one) => !readable.has(one.project)) }
}

/** What a list says it left out: null when it left out none, or one group counting them, with no ids. */
function leftOutByPermission(count: number): NarrowedByPermission<HandbookListBucket> {
  return count === 0 ? null : [{ cause: 'permission', bucket: 'in_a_project_you_may_not_read', count, ids: null }]
}

/** Every live in-use handbook, in the order they were filed. */
function theHandbooksInUse(): AHandbookToSend[] {
  return theLiveHandbooks().filter((handbook) => theStateOf(handbook.data) === IN_USE)
}

/** A live handbook as a page lists it. */
function asRead(handbook: AHandbookToSend): HandbookRead {
  return { id: handbook.id, title: handbook.title, state: theStateOf(handbook.data), languages: Object.keys(theTextOf(handbook.data)).filter(isLanguage) }
}

/** The places on one flow, or on one of its steps, that a handbook hangs on. */
const thePlacesOnAFlow = (handbook: AHandbookToSend, flow: string) =>
  thePlacesOf(handbook.data).flatMap((place) => ('flow' in place && place.flow === flow ? [place] : []))

/**
 * EVERY LIVE HANDBOOK ON ONE FLOW OR ON ONE OF ITS STEPS that the reader may read, in any state, for the flow's page. A
 * draft and a retired one are listed too, with their state, because the page is where somebody looks for them. One filed
 * in a project the reader may not read is only counted (theLiveHandbooksFor).
 */
export function theHandbooksOnAFlow(flow: string, reader: AMessageReader): HandbooksAReaderMayRead<FlowHandbookRead[]> {
  const { may, mayNot } = theLiveHandbooksFor(reader)
  return {
    handbooks: may.flatMap((handbook) => {
      const here = thePlacesOnAFlow(handbook, flow)
      if (here.length === 0) return []
      const steps = [...new Set(here.flatMap((place) => (place.step === undefined ? [] : [place.step])))].sort((a, b) => a - b)
      return [{ ...asRead(handbook), onTheFlow: here.some((place) => place.step === undefined), steps }]
    }),
    narrowedByPermission: leftOutByPermission(mayNot.filter((handbook) => thePlacesOnAFlow(handbook, flow).length > 0).length),
  }
}

/**
 * EVERY LIVE HANDBOOK ON EACH ROLE CARD that the reader may read, in any state, by the card's word, for the Role cards
 * page. A card no such handbook hangs on is not a key. One filed in a project the reader may not read is only counted,
 * once however many cards it hangs on. Only the ones in use are sent to an agent that takes the card
 * (theHandbooksOnACard below).
 */
export function theHandbooksOnTheCards(reader: AMessageReader): HandbooksAReaderMayRead<Record<string, HandbookRead[]>> {
  const { may, mayNot } = theLiveHandbooksFor(reader)
  const on = new Map<string, HandbookRead[]>()
  for (const handbook of may) {
    for (const card of new Set(theCardsOf(handbook.data))) on.set(card, [...(on.get(card) ?? []), asRead(handbook)])
  }
  return {
    handbooks: Object.fromEntries(on),
    narrowedByPermission: leftOutByPermission(mayNot.filter((handbook) => theCardsOf(handbook.data).length > 0).length),
  }
}

/** Who wrote the text a handbook holds now, and when: the oldest revision of the newest run of versions with this text. */
function whoWroteTheText(handbook: AHandbookToSend): { version: number; who: string; at: string } | null {
  const rows = sqlite
    .prepare('SELECT seq, data, actor_type AS actorType, actor_id AS actorId, at FROM revisions WHERE record_id = ? ORDER BY seq DESC')
    .all(handbook.id) as { seq: number; data: string | null; actorType: string; actorId: string; at: string }[]
  const newest = rows[0]
  if (newest === undefined) return null
  const text = theStoredTextOf(handbook.data)
  let wrote = newest
  for (const row of rows) {
    let data: unknown = null
    try {
      data = row.data === null ? null : JSON.parse(row.data)
    } catch {
      break
    }
    if (!sameJson(theStoredTextOf(data), text)) break
    wrote = row
  }
  const writer = participantForActor({ type: wrote.actorType, id: wrote.actorId })
  return { version: newest.seq, who: writer === null ? HANDBOOK_SAYS.aWriterNotKnown(wrote.actorId) : nameOf(writer), at: wrote.at }
}

/**
 * ONE HANDBOOK, AS A MESSAGE SAYS IT: its title and version, whom it is for, why the reader has it, who wrote its text
 * and why, the languages, and the opening of each. Where there is a rest, how long it is and where to read it. One with
 * no text says it holds none, and nothing about a writer, a reason or languages of a text it does not have.
 */
function theHandbookPart(handbook: AHandbookToSend, because: string, reads: Language | null): { said: string; sent: AHandbookSent } {
  const text = theTextOf(handbook.data)
  const written = Object.keys(text).filter(isLanguage)
  const wrote = whoWroteTheText(handbook)
  const top = [HANDBOOK_SAYS.heading(handbook.title, handbook.id, wrote?.version ?? null), HANDBOOK_SAYS.forWhom(theForOf(handbook.data)), HANDBOOK_SAYS.youHaveIt(because)]
  if (written.length === 0) {
    return { said: [...top, HANDBOOK_SAYS.noText()].join('\n'), sent: { id: handbook.id, version: wrote?.version ?? 0, languages: [] } }
  }
  const chosen = theLanguagesToSend(written, reads)
  const lines = [
    ...top,
    wrote === null ? HANDBOOK_SAYS.writerNotKnown() : HANDBOOK_SAYS.wrote(wrote.who, wrote.at),
    HANDBOOK_SAYS.why(theNewestWhyOf(handbook.data)),
    HANDBOOK_SAYS.theLanguages(chosen, reads),
  ]
  const texts = chosen.languages.map((language) => {
    const one = text[language]!
    const rest = one.rest === undefined ? 0 : countWords(one.rest)
    return [HANDBOOK_SAYS.inALanguage(language), one.opening, ...(rest === 0 ? [] : [HANDBOOK_SAYS.theRest(rest, handbook.id)])].join('\n')
  })
  return {
    said: [lines.join('\n'), ...texts].join('\n\n'),
    sent: { id: handbook.id, version: wrote?.version ?? 0, languages: chosen.languages },
  }
}

/**
 * THE IN-USE HANDBOOKS ON A ROLE CARD, as the card message says them after the card's own handbook, or null because no
 * in-use handbook hangs on the card, and the card message is then as it was.
 */
export function theHandbooksOnACard(card: string, reads: Language | null): { said: string; mark: { card: string; handbooks: AHandbookSent[] } } | null {
  const on = theHandbooksInUse().filter((one) => theCardsOf(one.data).includes(card))
  if (on.length === 0) return null
  const parts = on.map((one) => theHandbookPart(one, HANDBOOK_SAYS.onTheCard(card), reads))
  const head = on.length === 1 ? `One handbook in use hangs on the ${card} card.` : `${on.length} handbooks in use hang on the ${card} card.`
  return { said: [head, ...parts.map((part) => part.said)].join('\n\n'), mark: { card, handbooks: parts.map((part) => part.sent) } }
}

/** What a flow start's answer says about its handbooks, when any is in use on the flow. */
export type HandbooksAtAStart =
  | { sent: true; message: string; handbooks: AHandbookSent[] }
  | { sent: false; because: string; problem?: string | null; problemNotFiled?: string }

/**
 * SEND THE IN-USE HANDBOOKS ON A FLOW, AND ON ITS STEPS, TO THE AGENT THAT STARTED IT. One message from the office, once
 * for each start: a start is one flow run, and this runs inside the write that files it. It runs in its own savepoint,
 * so a send that fails is rolled back alone, the start goes on, and the office files a problem.
 *
 * Null when no in-use handbook hangs on the flow or its steps, so a start with none answers as it did before.
 */
export function sendTheHandbooksOfAFlowStart(start: {
  flow: string
  flowRun: string
  run: string
  workspaceId: string
  /** The agent the start is sent to, asked inside the send, so a read that fails is the send's failure alone. */
  to: () => ParticipantRef | null
  origin?: RecordOrigin
}): HandbooksAtAStart | null {
  try {
    return sqlite.transaction((): HandbooksAtAStart | null => {
      const on = theHandbooksInUse().flatMap((one) => {
        const steps = thePlacesOf(one.data).flatMap((place) => ('flow' in place && place.flow === start.flow ? [place.step ?? null] : []))
        return steps.length === 0 ? [] : [{ handbook: one, steps }]
      })
      if (on.length === 0) return null
      const to = start.to()
      if (to === null) {
        return { sent: false, because: `Run ${start.run} names no agent this office knows, so nobody was sent the flow's handbooks.` }
      }
      const flow = db.select({ title: records.title }).from(records).where(eq(records.id, start.flow)).get()
      const reads = theLanguageOfTheAgent(to.id, start.workspaceId)
      const parts = on.map(({ handbook, steps }) => {
        const numbered = steps.filter((step): step is number => step !== null).sort((a, b) => a - b)
        return theHandbookPart(handbook, HANDBOOK_SAYS.onTheFlowStarted(steps.includes(null), numbered), reads)
      })
      const head =
        `You started the flow "${flow?.title ?? start.flow}" (${start.flow}), in flow run ${start.flowRun}. ` +
        (on.length === 1 ? 'One handbook in use hangs on it, and the office sends it once, at the start.' : `${on.length} handbooks in use hang on it, and the office sends them once, at the start.`)
      const handbooks = parts.map((part) => part.sent)
      const written = writeASystemLineToOne(
        to,
        start.workspaceId,
        SYSTEM_LINES.handbooksForAFlowStart([head, ...parts.map((part) => part.said)].join('\n\n')),
        { type: 'system', id: moleOffice().id },
        { run: start.run },
        { [HANDBOOKS_SENT_MARK]: { flowRun: start.flowRun, handbooks } },
      )
      return { sent: true, message: written.id, handbooks }
    })()
  } catch (error) {
    const because = error instanceof Error ? error.message : String(error)
    return { sent: false, because, ...fileTheProblem(start.run, start.workspaceId, "A flow's handbooks were not sent", because, start.origin) }
  }
}
