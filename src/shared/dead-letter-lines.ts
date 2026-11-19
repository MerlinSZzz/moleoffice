// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEAD-LETTER LINES OF THE SECRETARIAT GROUP: WHAT EACH ONE IS, AND ITS WORDS IN A LANGUAGE.
 *
 * Problem 0WUuvB0IhRfb. Mole Office has written three kinds of line about dead letters into the
 * Secretariat group:
 *   - until 2 October 2026, the old sweep's lines: "Dead letters to claim", and one line
 *     "<handle>: <n> dead letters" for each addressee;
 *   - since then, one line "Dead letters" per sweep, with the sweep's facts stored beside it;
 *   - the fold line "Old dead-letter lines folded here", which holds the old lines folded under it.
 *
 * ONE RECOGNISER, `whatThisOldDeadLetterLineSays`. scripts/fold-the-old-dead-letter-lines.ts asks it
 * which lines to fold, and the group asks it how to draw a folded line, so the two cannot come to
 * disagree about what an old line is (invariant 9). It reads only what the old sweep stored: who sent
 * the line and its body, and the counts in its sentence where the sentence is the sweep's.
 *
 * THE STORED BODIES STAY AS THEY ARE. A page draws an old line from the facts the recogniser reads in
 * it (the addressee and the count), in the page's language and with the right plural, so a stored
 * "retired-b: 1 dead letters" is drawn "retired-b: 1 dead letter".
 *
 * Every composer here takes a `Say`: the server hands it `sayInEnglish`, so what it stores is the
 * English list's words, and a page hands it `t`, so it draws the same facts in its own language.
 */

import type { ANameAndACount, TheDeadLetterSweepSaid, WhyTheSweepLineWentToNobody } from './groups.ts'
import type { Say } from './i18n.ts'
import { theWordsOfAFixedOfficeLine } from './office-lines.ts'
import { isMoleOffice, type ParticipantRef } from './participants.ts'

/** A line as the recogniser reads it: who sent it, its few words, and its whole sentence. */
export interface ALineToRead {
  sentBy: ParticipantRef | null
  body: string
  saidInFull?: string | null
}

/** The body of the old sweep's line that opened each sweep. */
export const THE_OLD_CLAIM_BODY = 'Dead letters to claim'
/** The sentence behind it, as the old sweep built it: how many letters, and for how many addressees. */
const THE_OLD_CLAIM_SAID = /^(\d+) dead letters?, for (\d+) addressees?, past the threshold\.$/
/**
 * One addressee's old line. The handle is what the old sweep's `handleOf` gave: a handle, or a registry
 * id where no handle answered. The old sweep wrote "dead letters" even for one letter.
 */
const THE_OLD_ADDRESSEE_BODY = /^([A-Za-z0-9_-]+): (\d+) dead letters?$/
/** The body of the fold line. */
export const THE_FOLD_BODY = 'Old dead-letter lines folded here'
/** The body of the sweep's one line, since 2 October 2026. */
export const THE_SWEEP_BODY = 'Dead letters'

/** What one old dead-letter line says, read from its stored words. */
export type WhatAnOldDeadLetterLineSays =
  /** The line that opened a sweep. The counts are null where its sentence is not the sweep's. */
  | { kind: 'to claim'; letters: number | null; addressees: number | null }
  /** One addressee's line. */
  | { kind: 'one addressee'; handle: string; count: number }

/** Whether Mole Office sent this line. A person's or an agent's words are never one of these lines. */
function sentByTheOffice(line: ALineToRead): boolean {
  return line.sentBy !== null && isMoleOffice(line.sentBy)
}

/**
 * WHAT THIS OLD DEAD-LETTER LINE SAYS, or null because it is not one.
 *
 * A line is an old dead-letter line when Mole Office sent it and its body is "Dead letters to claim"
 * or "<handle>: <n> dead letter(s)". Its title and its sentence do not decide it: the old sweep wrote
 * these under more than one title and sentence. Where the sentence is the sweep's count sentence, its
 * counts are read too.
 */
export function whatThisOldDeadLetterLineSays(line: ALineToRead): WhatAnOldDeadLetterLineSays | null {
  if (!sentByTheOffice(line)) return null
  if (line.body === THE_OLD_CLAIM_BODY) {
    const counts = typeof line.saidInFull === 'string' ? THE_OLD_CLAIM_SAID.exec(line.saidInFull) : null
    return counts === null
      ? { kind: 'to claim', letters: null, addressees: null }
      : { kind: 'to claim', letters: Number(counts[1]), addressees: Number(counts[2]) }
  }
  const one = THE_OLD_ADDRESSEE_BODY.exec(line.body)
  if (one === null) return null
  return { kind: 'one addressee', handle: one[1] ?? '', count: Number(one[2]) }
}

/** Whether this is the fold line: sent by Mole Office, with the fold line's body. */
export function isTheFoldLine(line: ALineToRead): boolean {
  return sentByTheOffice(line) && line.body === THE_FOLD_BODY
}

/** A line's few words and the whole sentence behind them, or null because the few words are all of it. */
export interface TheWordsOfALine {
  line: string
  said: string | null
}

/** "12 dead letters, for 3 addressees, past the threshold." The old claim line and the sweep both say it. */
export function pastTheThreshold(say: Say, letters: number, addressees: number): string {
  return say('deadLetterLines.pastTheThreshold', {
    letters: say('deadLetterLines.letters', { n: letters }),
    addressees: say('deadLetterLines.addressees', { n: addressees }),
  })
}

/**
 * THE WORDS OF AN OLD LINE, from what the recogniser read in it. Where the opening line's sentence is not
 * the sweep's, its own stored sentence is kept as it is, because nothing here can say it in other words.
 */
export function theWordsOfAnOldLine(say: Say, what: WhatAnOldDeadLetterLineSays, stored: string | null): TheWordsOfALine {
  if (what.kind === 'one addressee') return { line: say('deadLetterLines.oneAddressee', { handle: what.handle, n: what.count }), said: null }
  const said = what.letters === null || what.addressees === null ? stored : pastTheThreshold(say, what.letters, what.addressees)
  return { line: say('deadLetterLines.toClaim'), said }
}

/** One addressee and how many letters the folded lines name for it. */
export interface AnAddresseeAndItsCount {
  handle: string
  count: number
}

/** What the fold line says: how many lines, from when to when, the addressees, and when it was written. */
export interface WhatTheFoldSays {
  lines: number
  from: string
  to: string
  named: readonly AnAddresseeAndItsCount[]
  writtenAt: string
}

/**
 * WHAT A FOLD HOLDS, read from the folded lines themselves with the one recogniser. `folded` is in the
 * order the lines were written. A folded line the recogniser does not read is still counted, and names
 * no addressee.
 */
export function whatTheFoldHolds(
  folded: readonly (ALineToRead & { sentAt: string })[],
  writtenAt: string,
): WhatTheFoldSays | null {
  const first = folded[0]
  const last = folded[folded.length - 1]
  if (first === undefined || last === undefined) return null
  const named: AnAddresseeAndItsCount[] = []
  for (const line of folded) {
    const what = whatThisOldDeadLetterLineSays(line)
    if (what === null || what.kind !== 'one addressee') continue
    const held = named.find((one) => one.handle === what.handle)
    if (held === undefined) named.push({ handle: what.handle, count: what.count })
    else held.count += what.count
  }
  return { lines: folded.length, from: first.sentAt, to: last.sentAt, named, writtenAt }
}

/** THE FOLD LINE'S WORDS. The server stores them in English; the group draws them in its own language. */
export function theWordsOfTheFold(say: Say, fold: WhatTheFoldSays): TheWordsOfALine {
  const when = fold.from === fold.to ? say('deadLetterLines.folded.at', { at: fold.from }) : say('deadLetterLines.folded.fromTo', { from: fold.from, to: fold.to })
  const addressees =
    fold.named.length === 0
      ? say('deadLetterLines.folded.noAddressee')
      : say('deadLetterLines.folded.addressees', {
          n: fold.named.length,
          list: fold.named.map((one) => `${one.handle} (${String(one.count)})`).join(', '),
        })
  return {
    line: say('deadLetterLines.folded'),
    said: [
      say('deadLetterLines.folded.lines', { n: fold.lines, when }),
      say('deadLetterLines.folded.nothingDeleted'),
      addressees,
      say('deadLetterLines.folded.writtenAt', { at: fold.writtenAt }),
    ].join(say('deadLetterLines.between')),
  }
}

// ============================================================================ the sweep's one line

/** "w-one (3), w-two (1)". */
function namesAndCounts(list: readonly ANameAndACount[]): string {
  return list.map((one) => `${one.name} (${String(one.count)})`).join(', ')
}

/** WHY NOBODY WAS SENT THE LINE, in one sentence of the reader's language. */
export function whyTheSweepLineWentToNobody(say: Say, why: WhyTheSweepLineWentToNobody): string {
  if (why.no === 'member') return say('deadLetterSweep.notAMember', { name: why.name })
  switch (why.because) {
    case 'nobody chose':
      return say('deadLetterSecretary.nobody.nobodyChose')
    case 'not registered':
      return say('deadLetterSecretary.nobody.notRegistered', { who: why.storedName })
    case 'retired':
      return say('deadLetterSecretary.nobody.retired', { who: why.storedName })
    case 'no act':
      return say('deadLetterSecretary.nobody.noAct', { who: why.storedName, act: why.act })
  }
}

/**
 * THE WHOLE SENTENCE BEHIND `SYSTEM_LINES.deadLetterSweep`. One sentence per thing the sweep did, in
 * a fixed order, and a part the sweep did not do is left out rather than said as nought. The last
 * sentence says who the line is delivered to, unless `withTheDelivery` is false because the page says that apart,
 * once. `say` is `sayInEnglish` where the line is stored, and the page's `t` where a page draws it.
 */
export function theDeadLetterSweepInWords(said: TheDeadLetterSweepSaid, say: Say, withTheDelivery = true): string {
  const parts: string[] = []
  const archivedCount = said.archived.reduce((sum, one) => sum + one.count, 0)
  if (archivedCount > 0) parts.push(say('deadLetterSweep.archived', { n: archivedCount, list: namesAndCounts(said.archived) }))
  const routedCount = said.routed.reduce((sum, one) => sum + one.count, 0)
  if (routedCount > 0) parts.push(say('deadLetterSweep.routedAnyPath', { n: routedCount, list: namesAndCounts(said.routed) }))
  const summarisedCount = (said.summarised ?? []).reduce((sum, one) => sum + one.count, 0)
  if (summarisedCount > 0) parts.push(say('deadLetterSweep.summarisedAnySender', { n: summarisedCount, list: namesAndCounts(said.summarised ?? []) }))
  if (said.keptBySender > 0) parts.push(say('deadLetterSweep.keptBySenderAnyPath', { n: said.keptBySender }))
  const given = said.givenToTheSecretary
  if (given !== null && given.fromAgents + given.fromThePerson > 0) {
    const fromThePerson = given.fromThePerson > 0 ? say('deadLetterSweep.given.fromThePerson', { n: given.fromThePerson }) : null
    const fromAgents = given.fromAgents > 0 ? say('deadLetterSweep.given.fromAgents', { n: given.fromAgents }) : null
    const from =
      fromThePerson !== null && fromAgents !== null
        ? say('deadLetterSweep.given.both', { fromThePerson, fromAgents })
        : (fromThePerson ?? fromAgents ?? '')
    parts.push(say('deadLetterSweep.given', { from, name: given.name }))
  }
  const person = said.waiting.fromThePerson
  const agents = said.waiting.fromAgents
  if (person > 0) parts.push(person === 1 ? say('deadLetterSweep.ownerWaiting.fromThePerson.one') : say('deadLetterSweep.ownerWaiting.fromThePerson.many', { n: person }))
  if (agents > 0) parts.push(agents === 1 ? say('deadLetterSweep.ownerWaiting.fromAgents.one') : say('deadLetterSweep.ownerWaiting.fromAgents.many', { n: agents }))
  if (said.broadcast !== null) {
    const count =
      said.broadcast.letters === undefined
        ? said.broadcast.countSentence
        : pastTheThreshold(say, said.broadcast.letters, said.broadcast.addressees.length)
    parts.push(say('deadLetterSweep.claimable', { count, list: namesAndCounts(said.broadcast.addressees) }))
  }
  if (withTheDelivery) parts.push(
    'name' in said.deliveredTo
      ? say('deadLetterSweep.deliveredOnlyTo', { name: said.deliveredTo.name })
      : say('deadLetterSweep.deliveredToNobody', {
          because: said.deliveredTo.why === undefined ? said.deliveredTo.nobodyBecause : whyTheSweepLineWentToNobody(say, said.deliveredTo.why),
        }),
  )
  return parts.join(say('deadLetterLines.between'))
}

// ============================================================================ the sweep's stored facts

/** A list of names and counts, or null because it is not one. */
function namesAndCountsOf(value: unknown): ANameAndACount[] | null {
  if (!Array.isArray(value)) return null
  const out: ANameAndACount[] = []
  for (const one of value) {
    if (typeof one !== 'object' || one === null) return null
    const { name, count } = one as { name?: unknown; count?: unknown }
    if (typeof name !== 'string' || !isACount(count)) return null
    out.push({ name, count })
  }
  return out
}

function isACount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

const THE_FOUR_REASONS = ['nobody chose', 'not registered', 'retired', 'no act'] as const

/** The stored reason nobody was sent the line, or null because it is not one this build reads. */
function theReasonOf(value: unknown): WhyTheSweepLineWentToNobody | null {
  if (typeof value !== 'object' || value === null) return null
  const why = value as Record<string, unknown>
  const name = why['name']
  if (why['no'] === 'member' && typeof name === 'string') return { no: 'member', name }
  const because = THE_FOUR_REASONS.find((one) => one === why['because'])
  const storedName = why['storedName']
  const act = why['act']
  if (why['no'] === 'nobody named' && because !== undefined && typeof storedName === 'string' && typeof act === 'string') {
    return { no: 'nobody named', because, storedName, act }
  }
  return null
}

/** Who the stored line was sent to, or null because it is not a shape this build reads. */
function theDeliveryOf(value: unknown): TheDeadLetterSweepSaid['deliveredTo'] | null {
  if (typeof value !== 'object' || value === null) return null
  const to = value as Record<string, unknown>
  const name = to['name']
  const nobodyBecause = to['nobodyBecause']
  if (typeof name === 'string') return { name }
  if (typeof nobodyBecause !== 'string') return null
  const why = theReasonOf(to['why'])
  return why === null ? { nobodyBecause } : { nobodyBecause, why }
}

/**
 * THE FACTS A SWEEP'S LINE STORED IN `deadLetterSweep.said`, or null because it stored none (a line
 * written before 3 October 2026) or stored them in a shape this build cannot read. A page draws null as
 * the stored English sentence, never as a guess at the facts.
 */
export function theSweepFactsOf(data: Record<string, unknown>): TheDeadLetterSweepSaid | null {
  const mark = data['deadLetterSweep']
  if (typeof mark !== 'object' || mark === null) return null
  const said = (mark as Record<string, unknown>)['said']
  if (typeof said !== 'object' || said === null) return null
  const held = said as Record<string, unknown>
  const archived = namesAndCountsOf(held['archived'])
  const routed = namesAndCountsOf(held['routed'])
  // ABSENT ON A LINE FROM BEFORE THE SWEEP SENT ONE MESSAGE PER RECEIVER; a value there that is not a list is not read.
  const summarised = held['summarised'] === undefined ? undefined : namesAndCountsOf(held['summarised'])
  const keptBySender = held['keptBySender']
  const deliveredTo = theDeliveryOf(held['deliveredTo'])
  if (archived === null || routed === null || summarised === null || !isACount(keptBySender) || deliveredTo === null) return null

  const waiting = held['waiting']
  if (typeof waiting !== 'object' || waiting === null) return null
  const fromThePerson = (waiting as Record<string, unknown>)['fromThePerson']
  const fromAgents = (waiting as Record<string, unknown>)['fromAgents']
  if (!isACount(fromThePerson) || !isACount(fromAgents)) return null

  const given = held['givenToTheSecretary']
  let givenToTheSecretary: TheDeadLetterSweepSaid['givenToTheSecretary'] = null
  if (given !== null) {
    if (typeof given !== 'object') return null
    const one = given as Record<string, unknown>
    const name = one['name']
    const agents = one['fromAgents']
    const person = one['fromThePerson']
    if (typeof name !== 'string' || !isACount(agents) || !isACount(person)) return null
    givenToTheSecretary = { name, fromAgents: agents, fromThePerson: person }
  }

  const broadcast = held['broadcast']
  let theBroadcast: TheDeadLetterSweepSaid['broadcast'] = null
  if (broadcast !== null) {
    if (typeof broadcast !== 'object') return null
    const one = broadcast as Record<string, unknown>
    const countSentence = one['countSentence']
    const letters = one['letters']
    const addressees = namesAndCountsOf(one['addressees'])
    if (typeof countSentence !== 'string' || addressees === null) return null
    theBroadcast = isACount(letters) ? { countSentence, letters, addressees } : { countSentence, addressees }
  }

  return {
    archived,
    routed,
    ...(summarised === undefined ? {} : { summarised }),
    keptBySender,
    givenToTheSecretary,
    waiting: { fromThePerson, fromAgents },
    broadcast: theBroadcast,
    deliveredTo,
  }
}

// ============================================================================ the one message to one receiver

/** The body of the one message a sweep sends each receiver of letters for retired agents. */
export const THE_SUMMARY_BODY = 'Letters for retired agents'

/** One retired addressee in a summary: its name, its registry id, and how many of its letters the summary covers. */
export interface ASummarisedAddressee {
  name: string
  id: string
  count: number
}

/**
 * WHAT ONE SUMMARY SAYS, stored in `deadLetterSweep.summary` on the message. Problem wN3CEhHxRKO3.
 * `sweptAt` is when Mole Office looked again; `letters` is how many letters it routed to this receiver then;
 * `addressees` says for whom, sorted by name.
 */
export interface TheDeadLetterSummarySaid {
  sweptAt: string
  letters: number
  addressees: readonly ASummarisedAddressee[]
}

/**
 * THE WORDS OF ONE SUMMARY, in the language `say` speaks. `withTheApi` adds the sentence that names the
 * request an agent reads the letters with; the server stores the English with it, because an agent reads the
 * stored sentence, and a page leaves it out, because the page names its own filter instead.
 */
export function theDeadLetterSummaryInWords(say: Say, facts: TheDeadLetterSummarySaid, withTheApi: boolean): TheWordsOfALine {
  const list = facts.addressees.map((one) => `${one.name} (${String(one.count)})`).join(', ')
  // THE TIME IS ONE PIECE ON A PAGE. A narrow page broke "2026-10-04 01:00:43" after a hyphen of the date (row 57 of
  // report rFBoQG6mAEI0), so a page is given non-breaking hyphens and a non-breaking space in it. The stored English
  // keeps the plain characters, because an agent reads it as text.
  const at = withTheApi ? facts.sweptAt : facts.sweptAt.replace(/-/gu, '\u2011').replace(/ /gu, '\u00a0')
  const parts = [
    say('deadLetterSummary.routed', { n: facts.letters, at, list }),
    say('deadLetterSummary.oneMessage', { n: facts.letters }),
    // THE FILTER IS INSIDE A FOLD on the Messages page, so the sentence names the fold too (row 57).
    say('deadLetterSummary.readThem', { fold: say('messages.page.chooseWhatToShow'), filter: say('messages.page.byContact') }),
  ]
  if (withTheApi) parts.push(say('deadLetterSummary.readThemWithTheApi', { ids: facts.addressees.map((one) => `${one.name} = ${one.id}`).join(', ') }))
  return { line: say('deadLetterSummary.line'), said: parts.join(say('deadLetterLines.between')) }
}

/** A summary's stored facts, or null because the message stores none or stores them in a shape this build cannot read. */
export function theSummaryFactsOf(data: Record<string, unknown>): TheDeadLetterSummarySaid | null {
  const mark = data['deadLetterSweep']
  if (typeof mark !== 'object' || mark === null) return null
  const summary = (mark as Record<string, unknown>)['summary']
  if (typeof summary !== 'object' || summary === null) return null
  const held = summary as Record<string, unknown>
  const sweptAt = held['sweptAt']
  const letters = held['letters']
  if (typeof sweptAt !== 'string' || sweptAt === '' || !isACount(letters) || !Array.isArray(held['addressees'])) return null
  const addressees: ASummarisedAddressee[] = []
  for (const one of held['addressees'] as unknown[]) {
    if (typeof one !== 'object' || one === null) return null
    const { name, id, count } = one as { name?: unknown; id?: unknown; count?: unknown }
    if (typeof name !== 'string' || typeof id !== 'string' || id === '' || !isACount(count)) return null
    addressees.push({ name, id, count })
  }
  return { sweptAt, letters, addressees }
}

// ============================================================================ a line of Mole Office's, on a page

/** A message as a page holds it, for the readers below. */
export interface AnOfficeLineOnAPage extends ALineToRead {
  sentAt: string
  toGroup: string | null
  deliveredOnlyTo?: readonly ParticipantRef[]
  deliveries: readonly unknown[]
  deadLetterSweepSaid?: TheDeadLetterSweepSaid | null
  deadLetterSummarySaid?: TheDeadLetterSummarySaid | null
}

/**
 * WHAT `theWordsOfAnOfficeLine` READS OF A LINE: everything but who it was delivered to, which only
 * `whoTheLineWasSentTo` reads. A list row that carries a line's facts and not its deliveries (the between-agents
 * row, `ShortLastMessage` in shared/short-lists.ts) is worded by the same function as the opened conversation.
 */
export type AnOfficeLineToWord = Omit<AnOfficeLineOnAPage, 'deliveredOnlyTo' | 'deliveries'>

/**
 * THE WORDS A PAGE DRAWS FOR A LINE OF MOLE OFFICE'S, in the page's language where the line is one of
 * the dead-letter lines, the restart line or the card line, and as stored for every other line. `folded` is the lines folded under this
 * one, in the order they were written, where the page holds them.
 *
 *   - an old dead-letter line: from what the recogniser reads in it, with the right plural;
 *   - the fold line: from the lines folded under it, and when it was written; with no folded lines at
 *     hand (its own page), its few words, and its stored sentence;
 *   - the sweep's line: its few words, and its sentence from the stored facts; a line written before the
 *     facts were stored keeps its stored sentence. With `deliverySaidApart`, the sentence leaves out who
 *     the line was sent to where `whoTheLineWasSentTo` says it from the same facts, so a page says it once;
 *   - the one message a sweep sends a receiver of letters for retired agents: from its stored facts, without
 *     the sentence about the API, or as stored where it has no facts.
 */
export function theWordsOfAnOfficeLine(
  say: Say,
  line: AnOfficeLineToWord,
  folded?: readonly AnOfficeLineOnAPage[],
  deliverySaidApart = false,
): TheWordsOfALine {
  const stored: TheWordsOfALine = { line: line.body, said: line.saidInFull ?? null }
  if (!sentByTheOffice(line)) return stored
  if (isTheFoldLine(line)) {
    const fold = folded === undefined ? null : whatTheFoldHolds(folded, line.sentAt)
    return fold === null ? { line: say('deadLetterLines.folded'), said: stored.said } : theWordsOfTheFold(say, fold)
  }
  const old = whatThisOldDeadLetterLineSays(line)
  if (old !== null) return theWordsOfAnOldLine(say, old, stored.said)
  if (line.body === THE_SWEEP_BODY && line.toGroup !== null) {
    const facts = line.deadLetterSweepSaid ?? null
    if (facts === null) return { line: say('deadLetterSweep.line'), said: stored.said }
    // THE DELIVERY IS LEFT OUT only where `whoTheLineWasSentTo` reads it from these facts: a name, or a stored reason.
    const saidApart = deliverySaidApart && ('name' in facts.deliveredTo || facts.deliveredTo.why !== undefined)
    return { line: say('deadLetterSweep.line'), said: theDeadLetterSweepInWords(facts, say, !saidApart) }
  }
  // THE ONE MESSAGE A SWEEP SENDS A RECEIVER OF LETTERS FOR RETIRED AGENTS, from its stored facts. Without them,
  // as stored.
  if (line.body === THE_SUMMARY_BODY && line.toGroup === null) {
    const facts = line.deadLetterSummarySaid ?? null
    return facts === null ? stored : theDeadLetterSummaryInWords(say, facts, false)
  }
  // THE RESTART LINE AND THE CARD LINE, from their own words (shared/office-lines.ts).
  return theWordsOfAFixedOfficeLine(say, line) ?? stored
}

/**
 * WHO A GROUP LINE OF MOLE OFFICE'S WAS SENT TO, AND WHY, in one sentence, or null because this line
 * names nobody it was narrowed to (`deliveredOnlyTo` is absent), so the page's general sentence holds.
 * Said once on the line's own page.
 *
 *   - the sweep's line, with its facts: only to the named secretary; or to nobody, with the reason it
 *     stored (no secretary is named, or the one named is not in the group);
 *   - the fold line: to nobody, because it only holds the old lines folded under it;
 *   - any other narrowed line, or a sweep line written before its facts were stored: to the members
 *     listed, or to nobody, with the line's own sentence pointed to for why where it is the sweep's.
 */
export function whoTheLineWasSentTo(say: Say, line: AnOfficeLineOnAPage): string | null {
  if (line.deliveredOnlyTo === undefined || line.toGroup === null) return null
  if (isTheFoldLine(line) && line.deliveries.length === 0) return say('deadLetterLines.sentTo.theFold')
  const facts = line.body === THE_SWEEP_BODY && sentByTheOffice(line) ? (line.deadLetterSweepSaid ?? null) : null
  if (facts !== null) {
    const to = facts.deliveredTo
    if ('name' in to) return say('deadLetterLines.sentTo.theSecretary', { name: to.name })
    if (to.why?.no === 'member') return say('deadLetterLines.sentTo.nobody.notAMember', { name: to.why.name })
    if (to.why?.no === 'nobody named') return say('deadLetterLines.sentTo.nobody.noSecretary')
  }
  if (line.deliveries.length > 0) return say('deadLetterLines.sentTo.theMembersListed')
  return line.body === THE_SWEEP_BODY && sentByTheOffice(line) ? say('deadLetterLines.sentTo.nobody.seeTheSentence') : say('deadLetterLines.sentTo.nobody')
}
