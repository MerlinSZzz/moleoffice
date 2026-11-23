// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF THE ROLE CARDS, AS THIS OFFICE HOLDS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A role card is its powers and its words. The powers, and what decides them, are the declaration in
 * src/config/roles.json, read once when the server starts (./roles.ts). The words are one
 * `role_card_words` record per card, which the person may change on the record's page. Every place
 * that shows a card's words to a reader asks `theCardInTheOfficesWords` for the card, so a change to
 * the record reaches all of them. `theCardInTheseWords` in @shared/roles.ts is what moves the words
 * onto the card, and it moves only text: no write to the record can give a card a power.
 *
 * ---------------------------------------------------------------------------------------
 * FILED BY THE OFFICE, ONCE PER CARD
 * ---------------------------------------------------------------------------------------
 *
 * Every start calls `fileTheCardWordsOnce` after the cards are read. It files a record for each
 * declared card that has NEVER had one, counting deleted ones, copied from the declaration, and
 * prints one line saying what it did. So:
 *   - a fresh office gets a record of each card's words at its first start;
 *   - a second start finds them and files nothing;
 *   - a record somebody deleted is not filed again, and the card shows the declaration's words;
 *   - a card added to the declaration later gets its record at the next start.
 * The records go in the `default` project, the one every office has, and all of one start's records
 * are one transaction. Each says where its words came from: the file, the commit of the checkout
 * when one can be read, and when.
 *
 * ---------------------------------------------------------------------------------------
 * ONE LIVE RECORD PER CARD
 * ---------------------------------------------------------------------------------------
 *
 * Two live records for one card would be two accounts of its words with nothing saying which one is
 * shown. `checkTheCardWords` refuses a create or a patch that would make a second one, or one for a
 * card the declaration does not hold, and `refuseARestoreThatGivesACardTwoWordRecords` refuses the
 * restore that would. A reader that still finds two says so and fails rather than picking one.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT CHANGES THEM ONLY ON THE OWNER'S WORDS, WHERE A DECISION OF THEIRS RESTS ON THEM
 * ---------------------------------------------------------------------------------------
 *
 * The owner changes a card's words freely. An agent's create, change, delete or restore of a words record carries a
 * warrant citing the owner's message, and a live decision of the owner's must rest on that message.
 * `refuseACardWordsActOffTheOwnersDecision` asks it; `whichDecisionOfTheOwnersTheseWordsStandOn` in ./warrants.ts
 * is the check. A write of short forms changes nothing a card says and needs neither. While the gate
 * "who-changes-a-cards-words" is off, an agent its own key proves may also act with no warrant, and the gate counts it;
 * a warrant that is sent is still checked, and every check below holds at both positions.
 *
 * ---------------------------------------------------------------------------------------
 * A CARD ADDED ON THE ROLES PAGE
 * ---------------------------------------------------------------------------------------
 *
 * Its row (./added-roles.ts) keeps the powers and the structure, and this record keeps its words. The
 * Roles page writes the two in one transaction and removes them together. Such a card has no
 * declaration to fall back on. So a write here that would leave it without a part it needs is refused,
 * and so is taking its record away while the card is in use. After any write to a words record the
 * added cards are read again, so the card the office acts on is the one its record now says.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHIPPED WORDS, COPIED AGAIN BY A PRESS
 * ---------------------------------------------------------------------------------------
 *
 * The filing copies a card's words once, so a later change of roles.json reaches no record. So the Role cards page
 * shows each field where the shipped file and the record differ, and a press copies the shipped words onto the
 * record. `theShippedWordsBesideTheOffices` names each such field, both texts, and
 * where the record's text came from in its history: the office's copy, somebody's change after it, or a history that
 * cannot say. `copyTheShippedWords` writes the shipped text of exactly those fields through the record door, and only
 * when the record is still at the version the caller read, so a change made after the read is never written over
 * unseen. The person presses it, or the secretary under the person's grant.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { whenStored } from '../db/told-when-stored.ts'
import { createRecord, deleteRecord, getRecord, patchRecord, versionOf, type Actor } from './records.ts'
import { theWordsAllowThis } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { getRevisionRow } from './get-revision-row.ts'
import { whoWroteTheValue } from '../db/who-wrote-the-value.ts'
import { whichDecisionOfTheOwnersTheseWordsStandOn } from './warrants.ts'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { ADDED_ROLE_PREFIX, addedRoles, lockedRoleProblem, loadAddedRoles, problemsWordsWouldGiveAnAddedCard, storedAddedRow } from './added-roles.ts'
import { ROLE_CARDS_FILE, theRoleCards, theRoleCardsAreRead, theShippedRoleCards } from './roles.ts'
import {
  THE_WORDS_OF_A_CARD,
  theCardInTheseWords,
  theCardWithoutItsWords,
  theWordsOf,
  theWordsTheRecordDoesNotHold,
  type ACardWord,
  type RoleCard,
  type RolesDeclaration,
} from '@shared/roles.ts'
import { moleOffice } from '@shared/participants.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { THE_PERSON } from '@shared/person.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import { nowStamp } from '@shared/time.ts'
import type { ACardsShippedWords, AWordThatDiffers, TheCommit, TheShippedWords, WhereTheOfficesWordCameFrom } from '@shared/the-shipped-words.ts'
import { gatePosition } from '../../config/settings.mjs'
import { theWordsRecordsOfEachCard } from '../db/the-words-records-of-each-card.ts'
import { ROLE_CARD_WORDS_KIND } from '../db/the-words-records-of-each-card.ts'
import { roleNameOf } from '../db/the-words-records-of-each-card.ts'
import { everyCard } from './check-the-card-words.ts'
import { theWordsRecords } from './the-card-in-the-offices-words.ts'
import type { TheWordsRecord } from '../db/types/card-words.ts'

export { ROLE_CARD_WORDS_KIND } from '../db/the-words-records-of-each-card.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
export type { TheWordsRecord } from '../db/types/card-words.ts'

/** What one start did, in words. */
export interface WhatTheFilingDid {
  /** The cards a record was filed for, by name. */
  filed: string[]
  /** The line the start prints. */
  line: string
}

/** The commit the words are copied from, or why there is none. It lives in @shared/the-shipped-words.ts, which the page reads. */
export type { TheCommit } from '@shared/the-shipped-words.ts'

export { roleNameOf } from '../db/the-words-records-of-each-card.ts'

export { everyCard } from './check-the-card-words.ts'

export { theWordsRecordsOfEachCard } from '../db/the-words-records-of-each-card.ts'

export { theWordsRecords } from './the-card-in-the-offices-words.ts'

export { theCardInTheOfficesWords } from './the-card-in-the-offices-words.ts'

/**
 * WHERE ONE CARD'S WORDS CAME FROM, for a reply that shows the card: the record that holds them, or
 * null where the office holds none, and the parts still read from the declaration.
 */
export function whereTheWordsCameFrom(
  card: RoleCard,
  held: ReadonlyMap<string, TheWordsRecord> = theWordsRecords(),
): { record: string | null; fromTheDeclaration: ACardWord[] } {
  const one = held.get(card.name) ?? null
  return { record: one?.id ?? null, fromTheDeclaration: theWordsTheRecordDoesNotHold(card, one?.data ?? null) }
}

/** Every card name that has ever had a words record, deleted ones included. */
function cardsThatEverHadWords(): Set<string> {
  const names = new Set<string>()
  for (const row of db.select({ data: records.data }).from(records).where(eq(records.kind, ROLE_CARD_WORDS_KIND)).all()) {
    const name = roleNameOf(row.data)
    if (name !== null) names.add(name)
  }
  return names
}

/**
 * THE COMMIT THIS START READ, as the start handed it to `fileTheCardWordsOnce`. A press copies the shipped words of the
 * declaration this start read, so the record it writes names this commit. Null until the start has filed.
 */
let theCommitThisStartRead: TheCommit | null = null

/** The commit this start read, or why there is none. */
function theCommitOfThisStart(): TheCommit {
  return theCommitThisStartRead ?? { full: null, why: 'this start has not read the checkout’s commit' }
}

/**
 * FILE A WORDS RECORD FOR EACH CARD THAT HAS NEVER HAD ONE. Called once by every start
 * (src/server/index.ts), after the cards are read and before anything is served. `commit` is the
 * checkout's commit, read by the caller, or why it could not be read.
 */
export function fileTheCardWordsOnce(commit: TheCommit): WhatTheFilingDid {
  theCommitThisStartRead = commit
  const had = cardsThatEverHadWords()
  const toFile = everyCard(theRoleCards()).filter((card) => !had.has(card.name))
  if (toFile.length === 0) {
    return {
      filed: [],
      line: `No role card words were filed: every card already has, or once had, a words record.`,
    }
  }
  // A CARD ADDED ON THE ROLES PAGE BEFORE ITS WORDS HAD A RECORD holds them in its row. They move into
  // the record, and the row keeps the rest, in the same transaction. The card the office acts on is the
  // same card before and after, so the card's history on the Roles page gets no entry.
  // Only a card in use is filed, and a row under one of the office's own names is never in use.
  const added = new Set(addedRoles().filter((row) => row.problems.length === 0).map((row) => row.name))
  const fromTheFile = toFile.filter((card) => !added.has(card.name))
  const fromARow = toFile.filter((card) => added.has(card.name))
  const copiedAt = nowStamp()
  sqlite.transaction(() => {
    for (const card of fromARow) {
      createRecord({
        kind: ROLE_CARD_WORDS_KIND,
        title: `The words of the ${card.name} card`,
        workspaceId: DEFAULT_WORKSPACE,
        actor: theOffice(),
        data: { roleName: card.name, ...theWordsOf(card), copiedFrom: `runtime_settings ${ADDED_ROLE_PREFIX}${card.name}`, copiedAt },
      })
      sqlite
        .prepare('UPDATE runtime_settings SET value=? WHERE name=?')
        .run(JSON.stringify(theCardWithoutItsWords(storedAddedRow(card.name) as Record<string, unknown>)), ADDED_ROLE_PREFIX + card.name)
    }
    for (const card of fromTheFile) {
      createRecord({
        kind: ROLE_CARD_WORDS_KIND,
        title: `The words of the ${card.name} card`,
        workspaceId: DEFAULT_WORKSPACE,
        actor: theOffice(),
        data: {
          roleName: card.name,
          ...theWordsOf(card),
          copiedFrom: ROLE_CARDS_FILE,
          ...(commit.full === null ? {} : { copiedFromCommit: commit.full }),
          copiedAt,
        },
      })
    }
  })()
  const names = (cards: RoleCard[]): string => cards.map((card) => card.name).join(', ')
  const lines: string[] = []
  if (fromTheFile.length > 0) {
    lines.push(
      `Filed the words of ${String(fromTheFile.length)} role card${fromTheFile.length === 1 ? '' : 's'} (${names(fromTheFile)}) as records in the ` +
        `"${DEFAULT_WORKSPACE}" project, copied from ${ROLE_CARDS_FILE} ` +
        (commit.full === null ? `at a commit that could not be read (${commit.why}).` : `at commit ${commit.full}.`),
    )
  }
  if (fromARow.length > 0) {
    lines.push(
      `Filed the words of ${String(fromARow.length)} card${fromARow.length === 1 ? '' : 's'} added on the Roles page (${names(fromARow)}) as records ` +
        `in the "${DEFAULT_WORKSPACE}" project, moved from ${fromARow.length === 1 ? 'its row, which now keeps' : 'their rows, which now keep'} ` +
        `only the powers and the structure.`,
    )
  }
  return { filed: toFile.map((card) => card.name), line: lines.join(' ') }
}

/**
 * KEEP THE WORDS OF A CARD ADDED ON THE ROLES PAGE IN ITS RECORD. The Roles page calls it inside the
 * transaction that writes the card's row, so the row and the record are one change. It writes through
 * the record door as `actor`, with every check that door asks. A word the card no longer has is taken
 * out of the record, and a record that already says these words is not written.
 */
export function keepTheWordsOfAnAddedCard(card: RoleCard, actor: Actor, because: string): void {
  const words = theWordsOf(card)
  const [held, other] = theWordsRecordsOfEachCard().get(card.name) ?? []
  if (other !== undefined) {
    throw new PanelError(
      `The words of the ${card.name} card are kept in two live records, ${held!.id} and ${other.id}. Delete one of them on ` +
        `its record page first. Nothing was written.`,
      409,
    )
  }
  if (held === undefined) {
    createRecord({ kind: ROLE_CARD_WORDS_KIND, title: `The words of the ${card.name} card`, workspaceId: DEFAULT_WORKSPACE, actor, data: { roleName: card.name, ...words } })
    return
  }
  const dataPatch = Object.fromEntries(
    THE_WORDS_OF_A_CARD.filter((word) => (words[word] ?? null) !== (held.data[word] ?? null)).map((word) => [word, words[word] ?? null]),
  )
  if (Object.keys(dataPatch).length > 0) patchRecord(held.id, { dataPatch }, actor, { op: 'update', note: because })
}

/** A removed added card's words go with it. A locked name's record holds the office's own card, and stays. */
export function removeTheWordsOfAnAddedCard(name: string, actor: Actor): void {
  if (lockedRoleProblem(name) !== null) return
  for (const one of theWordsRecordsOfEachCard().get(name) ?? []) deleteRecord(one.id, actor)
}

export { readTheAddedCardsAgainWhenStored } from './read-the-added-cards-again-when-stored.ts'

export { checkTheCardWords } from './check-the-card-words.ts'

export { refuseWordsThatTakeAnAddedCardOutOfUse } from './check-the-card-words.ts'

export { refuseAWriteThatTakesTheWordsOfAnAddedCard } from './refuse-a-write-that-takes-the-words-of-an-added-card.ts'

export { refuseARestoreThatGivesACardTwoWordRecords } from './refuse-a-restore-that-gives-a-card-two-word-records.ts'

/** The five acts on a card's words that an agent makes only on the owner's words. */
export type AnActOnACardsWords = 'create' | 'change' | 'delete' | 'restore' | 'move'

/**
 * A RESTORE IS ASKED TWICE IN ONE REQUEST, by its route and again by `restoreRecord`, with the same actor. The gate
 * counts the act it lets through at off once, at the first ask; an ask again of the same act by the same actor passes
 * uncounted.
 */
const askedAlready = new WeakMap<Actor, Set<string>>()
function theFirstAskOf(actor: Actor, act: string): boolean {
  const asked = askedAlready.get(actor) ?? new Set<string>()
  askedAlready.set(actor, asked)
  if (asked.has(act)) return false
  asked.add(act)
  return true
}

/**
 * AN AGENT'S CREATE, CHANGE, DELETE, RESTORE OR MOVE OF A CARD'S WORDS STANDS ON A DECISION OF THE OWNER'S. Asked by
 * `assertMayWrite` of a create, a delete, a restore, a move and a change that hands over no body, and by `patchRecord` of a
 * change that writes more than short forms (src/server/lib/records/may-write.ts and src/server/lib/records.ts). `subject` is the record, or on a create the
 * title it is filed under, which is what a warrant on a create names in `for`.
 *
 * The person and the office pass. In a test world, the agent holding the owner's authority there passes (rule 8.5).
 * Every other agent carries a warrant citing `message:<id>`, and `whichDecisionOfTheOwnersTheseWordsStandOn` finds
 * a live decision of the owner's on that message; then the warrant is marked used, so both ledgers keep it. A raise carries
 * none of this, but for the one press that copies a card's shipped words below. Otherwise the act is refused with 403,
 * saying which part failed, and nothing is written.
 *
 * The act with no warrant is the gate "who-changes-a-cards-words". At block it is refused as above. At off an agent
 * its own key proves, registered and not retired, passes and is counted, and the revision names it; any other caller
 * gets the gate's off words. A warrant that is sent is checked as at block at both positions, and is never counted.
 *
 * `saidAs` names the act in the refusal where the record is not a card's words: a handbook on a role card meets this
 * rule from src/server/lib/handbooks.ts, and its refusal says it is a handbook.
 */
export function refuseACardWordsActOffTheOwnersDecision(actor: Actor, act: AnActOnACardsWords, subject: string, saidAs?: string): void {
  if (actor.type !== 'agent') return
  if (actor.theOwnersAuthority?.holds === true) return
  // THE PRESS THAT COPIES A CARD'S SHIPPED WORDS, UNDER THE PERSON'S GRANT. The secretary may press it for the
  // person, so the grant carries this one change, which writes only the text the shipped
  // file holds (`copyTheShippedWords`). The grant carries no other act on a card's words.
  if (act === 'change' && actor.press?.operation === THE_PRESS_OF_THE_SHIPPED_WORDS && actor.press.underTheGrant !== undefined) return
  const theAct = saidAs ?? (act === 'create' ? `filing a new record of a role card's words, "${subject}",` : `this ${act} of ${subject}, a role card's words,`)
  if (actor.warrant === undefined) {
    const position = gatePosition('who-changes-a-cards-words')
    const keyed = anAgentItsOwnKeyProves(actor) !== null
    if (keyed && position !== 'block') {
      if (theFirstAskOf(actor, `${act} ${subject}`)) gateMet('who-changes-a-cards-words', position!)
      return
    }
    if (!keyed && position !== 'block') {
      throw refusedWhileTheGateIsOff(actor.id, 'who-changes-a-cards-words', "file, change, delete, restore or move a role card's words with no warrant")
    }
    const refusal = new PanelError(
      `An agent changes a role card's words only on the person's words, and ${theAct} carries no warrant. Nothing was ` +
        'written. Send {"warrant": {...}} in the body: saidBy ' +
        `"${THE_PERSON}", words copied whole from a message the person wrote, where "message:<its id>", when, and for ` +
        `["${subject}"]. A live decision of the owner's must rest on that message: decided_by "${THE_OWNER}", authority ` +
        '"the owner said so" and authority_reference the message\'s id. A card\'s powers stay in roles.json whatever its ' +
        'words say.',
      403,
      undefined,
      undefined,
      "An agent changes a card's words only on the person's words.",
    )
    if (!keyed) throw refusal
    gateMet('who-changes-a-cards-words', 'block')
    throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-changes-a-cards-words', 'block'))
  }
  const found = whichDecisionOfTheOwnersTheseWordsStandOn(actor.warrant)
  if (found.decision === null) {
    throw new PanelError(
      `An agent changes a role card's words only on the person's words, where a decision of the owner's rests on them, ` +
        `and ${theAct} does not stand on one. ${found.because} Nothing was written.`,
      403,
      undefined,
      undefined,
      "An agent changes a card's words only on a decision of the owner's.",
    )
  }
  theWordsAllowThis(actor)
}

/** The operation of the press that copies a card's shipped words, which the guard above lets the grant carry. */
export const THE_PRESS_OF_THE_SHIPPED_WORDS = 'role.copy-shipped-words'

/**
 * THE NOTE THE PRESS LEAVES ON ITS REVISION. A revision with this note is the office's copy of the shipped file, as the
 * first filing is. No caller of the record door can write a note, so only the press leaves it.
 */
export const THE_NOTE_THE_PRESS_LEAVES = `The shipped words of ${ROLE_CARDS_FILE} were copied onto this card's words.`

/**
 * WHERE THE RECORD'S TEXT OF ONE FIELD CAME FROM: the revision that put the text it holds now there, read from its
 * history (`whoWroteTheValue` in ./revisions.ts). The office's own copy is the first filing from the shipped file or a
 * revision this press wrote. Any other writer changed it after the copy. Where the history cannot say, it is unknown.
 */
function whereTheOfficesWordCameFrom(recordId: string, field: string, value: unknown): WhereTheOfficesWordCameFrom {
  const who = whoWroteTheValue(recordId, field, value)
  if (who === null) return { as: 'unknown' }
  const row = getRevisionRow(recordId, who.seq)
  const theFirstFiling =
    row.op === 'create' && row.actorType === 'system' && row.actorId === moleOffice().id && row.data['copiedFrom'] === ROLE_CARDS_FILE
  if (theFirstFiling || row.note === THE_NOTE_THE_PRESS_LEAVES) return { as: 'copied', at: who.at }
  const by = row.actorType === 'human' ? { kind: 'person' as const, id: row.actorId } : row.actorType === 'agent' ? { kind: 'agent' as const, id: row.actorId } : null
  return { as: 'changed', by, at: who.at, onTheOwnersWords: who.onTheOwnersWords }
}

/** One declared card's shipped words beside the words its live record gives it. */
function theShippedWordsOf(card: RoleCard, record: TheWordsRecord | null): ACardsShippedWords {
  if (record === null) return { role: card.name, record: null, copied: { from: null, commit: null, at: null }, differ: [] }
  const row = getRecord(record.id)
  if (row === null) throw new Error(`The words record ${record.id} of the ${card.name} card was read and then could not be found.`)
  // THE CARD AS THE OFFICE SHOWS IT. A field the record does not give leaves the shipped text in place, so it differs
  // in nothing; a field it gives differs where its text is not the shipped one.
  const shipped = theWordsOf(card)
  const office = theWordsOf(theCardInTheseWords(card, record.data))
  const differ: AWordThatDiffers[] = THE_WORDS_OF_A_CARD.filter((field) => (shipped[field] ?? null) !== (office[field] ?? null)).map((field) => ({
    field,
    shipped: shipped[field] ?? null,
    office: office[field] ?? null,
    came: whereTheOfficesWordCameFrom(record.id, field, record.data[field]),
  }))
  const said = (key: string): string | null => (typeof record.data[key] === 'string' ? (record.data[key] as string) : null)
  return {
    role: card.name,
    record: { id: record.id, version: versionOf(row) },
    copied: { from: said('copiedFrom'), commit: said('copiedFromCommit'), at: said('copiedAt') },
    differ,
  }
}

/** The declared card of that name, or a 404 saying the shipped file declares none. */
function theShippedCard(role: string, nothingWas: 'read' | 'written'): RoleCard {
  const card = everyCard(theShippedRoleCards()).find((one) => one.name === role)
  if (card === undefined) throw new PanelError(`${ROLE_CARDS_FILE} declares no role card named "${role}". Nothing was ${nothingWas}.`, 404)
  return card
}

/**
 * EVERY DECLARED CARD'S SHIPPED WORDS BESIDE THE OFFICE'S WORDS, or one card's. Only the cards the shipped file
 * declares: a card added on the Roles page has no shipped words.
 */
export function theShippedWordsBesideTheOffices(role?: string): TheShippedWords {
  const held = theWordsRecords()
  const cards = role === undefined ? everyCard(theShippedRoleCards()) : [theShippedCard(role, 'read')]
  return { file: ROLE_CARDS_FILE, commit: theCommitOfThisStart(), cards: cards.map((card) => theShippedWordsOf(card, held.get(card.name) ?? null)) }
}

/**
 * COPY ONE CARD'S SHIPPED WORDS ONTO ITS WORDS RECORD, through the record door as `actor`, with every check that door
 * asks and its history kept. `ifVersion` is the version the caller read with the difference. The press is refused, and
 * nothing is written, where the record is no longer at that version, even with the record door's own stale-copy gate
 * off, because a press must never write over a change nobody saw. It writes the shipped text of each field
 * that differs, takes off a field the shipped card does not have, and says the copy's file, commit and time. Answers
 * the fields it copied and the card as it is now.
 */
export function copyTheShippedWords(role: string, ifVersion: string, actor: Actor): { copied: ACardWord[]; card: ACardsShippedWords } {
  const card = theShippedCard(role, 'written')
  const record = theWordsRecords().get(role) ?? null
  if (record === null) {
    throw new PanelError(`The ${role} card has no live words record in this office, so there are no office words to copy onto. Nothing was written.`, 409)
  }
  const before = theShippedWordsOf(card, record)
  if (before.record?.version !== ifVersion) {
    throw new PanelError(`This card's words changed after you read them. Read them again before you copy. Nothing was written.`, 409)
  }
  if (before.differ.length === 0) throw new PanelError(`The ${role} card's words in this office are already the shipped words. Nothing was written.`, 409)
  const dataPatch: Record<string, unknown> = {
    ...Object.fromEntries(before.differ.map((one) => [one.field, one.shipped])),
    copiedFrom: ROLE_CARDS_FILE,
    // NULL TAKES THE KEY OFF, so a record copied at a commit nobody could read names none.
    copiedFromCommit: theCommitOfThisStart().full,
    copiedAt: nowStamp(),
  }
  patchRecord(record.id, { dataPatch }, actor, { op: 'update', note: THE_NOTE_THE_PRESS_LEAVES })
  const after = theWordsRecords().get(role)
  if (after === undefined) throw new Error(`The words record ${record.id} of the ${role} card went missing during the press.`)
  return { copied: before.differ.map((one) => one.field), card: theShippedWordsOf(card, after) }
}
