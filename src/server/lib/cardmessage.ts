// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE MESSAGE MOLE OFFICE SENDS AN AGENT ABOUT THE CARD IT HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * After a role is registered or changed, Mole Office sends the agent a message about it: its duties, what
 * it may do and how to do it. The message is pushed to the agent rather than waiting to be
 * read.
 *
 * Before this, an agent made secretary on 14 September was told nothing. The appointment wrote one word
 * on the record and sent no message, a registration printed its guidance to the STARTER, and the
 * only automatic role message was the idle line, which fires hours later. The agent had to ask what a
 * secretary does.
 *
 * So the office now writes one system message to the agent, once per registration and once per card
 * change, and then never again for the same event.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN IT, AND WHERE THE WORDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Every fact is read out of `design/permissions/roles.json` at the moment the message is written,
 * so a card edited there changes the message with no code change and the two cannot drift. Its words
 * (the duties, whom it reports to, what ends it and the handbook) are the office's words record of the
 * card where it holds them (./card-words.ts), and the declaration's where it does not:
 *
 *   · the role and its duties, from `theRoleAndDutiesOf` beside this function;
 *   · the one sentence about the toolset, THE_TOOLSET_SENTENCE in src/shared/toolset.ts, which is
 *     not in roles.json and is the same for every card;
 *   · what the card lets the agent do, from the card's own powers, with the tree folded in by
 *     `powersFor`;
 *   · the chapters it reads first, each with the card's own reading level and that level's meaning
 *     from the declaration's `readingLevels`;
 *   · what the card says its holder's starter adds, when it says anything;
 *   · who it reports to, and what ends it;
 *   · the card's handbook, the first time this agent is given this card. The section on handbooks
 *     below is about this.
 *
 * THE ONE THING THAT IS NOT IN THE DECLARATION is the door where the first task is. A card has no
 * field for it and this build adds none: there is one role word and one first door, and the four
 * are written here, once. The worker takes from `GET /api/delegation`, the supervisor is briefed by
 * its starter, the secretary reads `GET /api/needs-you` and its inbox, and an inspector is given the
 * work by whoever starts it. A card nobody here answers for gets no door line rather than a guessed
 * one.
 *
 * ---------------------------------------------------------------------------------------
 * ONE MESSAGE PER EVENT, NEVER REPEATED
 * ---------------------------------------------------------------------------------------
 *
 * A registration writes one message; a card change writes one; the idle reminder is separate and
 * untouched. Nothing is written for a name change, a state change or presence, because none of
 * those is the card. A change that names the card the agent already holds writes nothing at all.
 */

import {
  A_ROW_WITH_NO_ROLE_READS_AS,
  cardFor,
  HANDBOOK_LANGUAGES,
  powersFor,
  THE_SECRETARY,
  theHandbookOf,
  type RoleCard,
  type RolesDeclaration,
} from '@shared/roles.ts'
import { SYSTEM_LINES, type AnOfficeLine } from '@shared/groups.ts'
import { createI18n, isLanguage, type Language } from '@shared/i18n.ts'
import { theLanguagesToSend } from '@shared/handbooks.ts'
import { anAgentsChecklistTitle } from '@shared/planning-flow.ts'
import { THE_TOOLSET_SENTENCE } from '@shared/toolset.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { ROLE_CARDS_FILE, theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { theCardInTheOfficesWords } from './the-card-in-the-offices-words.ts'
import { theChaptersOfTheCards } from './chapters.ts'
import { addAnItem, makeAChecklist } from './checklists.ts'
import { theAgentsChecklist } from './entered-flows.ts'
import { HANDBOOKS_SENT_MARK, theHandbooksOnACard } from './handbooks.ts'
import { nameOf, writeASystemLineToOne } from './groups.ts'
import { recordForAgentIn } from '../db/record-for-agent-in.ts'
import type { Actor } from './records.ts'

/**
 * THE ROLE AND DUTIES ONE AGENT IS REMINDED OF, in the words the office registered it under.
 *
 * The message names three things and no more: the role registered at the office, the duties, and the
 * note to read the rules again if forgotten, especially after a compaction. The role word is the
 * registry row's; the duties are the card's own sentence; the rules are whole at GET /api/office-regulations,
 * which answers from the office's chapter records, the same in every project. Until wave 13w this named the full path of
 * src/config/rules/CODE.md, the export of the chapters of the office this repository is developed in.
 *
 * It is read by the idle reminder and by the card message, so both say the role and duties the same
 * way. It takes the role word rather than a registry row so the card message can call it before or
 * after the row is written.
 */
export function theRoleAndDutiesOf(role: string | null): string {
  const word = role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const card = theRoleCardsAreRead() ? cardFor(theRoleCards(), word) : null
  const duties =
    card === null
      ? 'No role card could be read for it, so the office cannot say what its duties are.'
      : theCardInTheOfficesWords(card).duties
  return (
    `You are the ${word} here. Your duties: ${duties} If you have forgotten the rules your duties stand on, ` +
    "read them again — this office's regulations are whole at GET /api/office-regulations. That matters especially after " +
    'a compaction, because what you were told at your start is gone from your context by then.'
  )
}

/**
 * THE DOOR WHERE A CARD'S HOLDER TAKES ITS FIRST TASK, or null because no card here answers for it.
 *
 * A card carries no field for this and this build adds none, so the door is worked out from the
 * card's own `flow`. The flow codes are the design's own numbers, and none of them is a role name:
 * F11 is the flow of an agent whose work is the person and what reaches them, F12 is the flow of an
 * agent that leads work, and F13 is the idle flow every card carries. A card off the tree, carrying
 * its own powers, is one somebody else starts for a named piece of work; a tool's card, refused
 * everything else, is given no first task, since it takes none.
 */
function whereTheFirstTaskIs(card: RoleCard): string | null {
  const flow = card.flow ?? ''
  if (flow.includes('F11')) return 'GET /api/needs-you and your inbox carry what is waiting for you.'
  if (flow.includes('F12')) {
    return 'Your starter briefs you with the work, and the tasks it names are yours to hand out.'
  }
  if (card.refusedEverythingElse === true) return null
  if (card.rung === null) return 'Whoever starts you names the agent and the work you are to check.'
  if (flow.includes('F13')) return 'GET /api/delegation is where the tasks waiting to be taken are listed.'
  return null
}

/** A card change: the word it held, and who moved it. Both are named in the message's first sentence. */
export interface TheCardChange {
  /** The card word before the write, already read as the worker card where the row named none. */
  from: string
  /** Who made the change, as the actor is named: the person, or the agent's handle. */
  by: string
}

/**
 * The chapters a card reads first, each named with the card's own level and that level's meaning. A chapter this office
 * does not hold is said to be missing, not named by another office's name.
 */
function theReadingLine(decl: RolesDeclaration, card: RoleCard): string | null {
  if (card.mustRead.chapters.length === 0) return null
  // THE NAME IS THE OFFICE'S CHAPTER RECORD'S: roles.json holds the number only, so a name cannot drift.
  const named = theChaptersOfTheCards(decl)
  const said = card.mustRead.chapters.map((one) => {
    const name = named.find((held) => held.number === one.chapter)?.name ?? null
    const level = decl.readingLevels.find((held) => held.level === one.level)
    const meaning = level === undefined ? '' : ` — ${level.meaning}`
    return name === null
      ? `chapter ${String(one.chapter)}, which this office does not hold, at ${one.level}${meaning}`
      : `chapter ${String(one.chapter)} ${name} at ${one.level}${meaning}`
  })
  return `Read first: ${said.join(' ')}`
}

/**
 * THE WHOLE SENTENCE THE CARD MESSAGE CARRIES, from the declaration in hand.
 *
 * `decl` is null only where the cards have not been read, which is a state the server does not run
 * in; the role and duties sentence is still written and the rest is left out rather than guessed.
 * `change` is null for a registration and names the old card and who moved it for a change. The chapters are named
 * as the office's chapter records hold them.
 */
export function theCardMessageSaidFor(
  decl: RolesDeclaration | null,
  role: string | null,
  change: TheCardChange | null,
): string {
  const word = role ?? A_ROW_WITH_NO_ROLE_READS_AS
  // THE DUTIES, THEN THE TOOLSET SENTENCE, on every path, by a decision. Every agent's
  // introduction says the toolset exists. The idle reminder reads theRoleAndDutiesOf alone, so it does not
  // carry the sentence.
  const opening = `${theRoleAndDutiesOf(word)} ${THE_TOOLSET_SENTENCE}`
  const card = decl === null ? null : cardFor(decl, word)
  if (decl === null || card === null) return opening

  const parts: string[] = [opening]
  const powers = powersFor(decl, word).map((one) => one.name)
  if (powers.length > 0) parts.push(`What the ${word} card lets you do: ${powers.join(', ')}.`)
  const reading = theReadingLine(decl, card)
  if (reading !== null) parts.push(reading)
  if (card.mustRead.andWhatItsStarterNames !== null) parts.push(card.mustRead.andWhatItsStarterNames)
  // THE WORDS ARE THE OFFICE'S; the first door is still worked out from the flow codes of the card
  // the office holds for the holder: the declaration's on a card it ships, and the words record's on
  // a card a person added.
  const shown = theCardInTheOfficesWords(card)
  parts.push(`You report to: ${shown.reportsTo}`)
  parts.push(`What ends it: ${shown.whatEndsIt}`)
  const door = whereTheFirstTaskIs(card)
  if (door !== null) parts.push(`Where your first task is: ${door}`)
  const body = parts.join(' ')
  if (change === null) return body
  return `Your card changed from the ${change.from} card to the ${word} card, by ${change.by}. ${body}`
}

/**
 * The declared line and sentence for one agent's card, ready for `writeASystemLineToOne`.
 *
 * `handbook` is what `theHandbookPartFor` says about the card's handbook, or null where no card
 * could be read. It goes after everything else the message says.
 */
export function theCardMessageFor(
  role: string | null,
  change: TheCardChange | null = null,
  handbook: string | null = null,
): AnOfficeLine {
  const decl = theRoleCardsAreRead() ? theRoleCards() : null
  const word = role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const said = theCardMessageSaidFor(decl, word, change)
  return SYSTEM_LINES.youHoldACard(word, handbook === null ? said : `${said}\n\n${handbook}`)
}

/*
 * ---------------------------------------------------------------------------------------
 * THE CARD'S HANDBOOK, SENT ONCE, IN THE AGENT'S LANGUAGE
 * ---------------------------------------------------------------------------------------
 *
 * By a decision, when an agent is registered with a card, or given one later, the office sends it that
 * card's working handbook at once, unasked, as one message. It rides in the
 * card message, so the card and its handbook arrive together, and every door that gives a card already
 * writes that one message through `writeTheCardMessageToOne` below.
 *
 * THE TEXT is `theHandbookOf` the card, from `design/permissions/roles.json` as the server read it
 * when it started. A new text there is sent after the next restart, with no code change.
 *
 * THE LANGUAGE is the `language` on the agent's own record in the project the message goes to.
 * POST /api/agents/started writes it when the starter names one, and nothing else in the office says
 * which language an agent reads. An agent whose record names none gets the handbook in every
 * language it is written in, and the message says why, because choosing one would be a guess.
 *
 * ONCE FOR EACH AGENT AND CARD. The message that carried a handbook holds a mark in its `extra` bag
 * naming the card. Before a handbook is sent, the office looks for such a message to this agent in
 * every project, deleted or not. Where it finds one, the card message names that message and sends
 * nothing again. The mark is on the message itself, so no flag kept elsewhere can disagree with what
 * was sent, and a restart changes nothing.
 */

/** The key in a card message's `extra` bag that says it carried a card's handbook. */
export const HANDBOOK_SENT_MARK = 'handbookSent'

/**
 * THE WORDS OF THE ITEM A NEW SECRETARY IS GIVEN, to read its handbook. An agent's "done" needs evidence, so the words
 * say which evidence fits: the session the handbook was read in.
 */
export const THE_HANDBOOK_ITEM_WORDS =
  "Read the secretary's handbook in the card message this item links. The office put this item here when the " +
  'secretary card was given. Once it is read, mark this item done with the session it was read in as its evidence.'

/** What the mark holds: which card's handbook, and in which languages it went. */
export interface HandbookSent {
  card: string
  languages: Language[]
}

/**
 * THE LANGUAGE ON THE AGENT'S OWN RECORD in this project, or null because it names none. A stored
 * word that is not one of the office's languages is read as none, because it names no text to send.
 */
export function theLanguageOfTheAgent(agentId: string, workspaceId: string): Language | null {
  const record = recordForAgentIn(agentId, workspaceId)
  if (record === null) return null
  const row = sqlite.prepare("SELECT json_extract(data, '$.language') AS language FROM records WHERE id = ?").get(record) as
    | { language?: unknown }
    | undefined
  return isLanguage(row?.language) ? row.language : null
}

/**
 * THE MESSAGE THAT ALREADY CARRIED THIS CARD'S HANDBOOK TO THIS AGENT, or null because none did.
 * Every project is searched, and a deleted message still counts, because it was sent.
 *
 * FOUND THROUGH `records_message_handbook_sent_card_idx` (migration 0310), which holds only the messages that carry the
 * mark, by the card it names. The read asks the card in that index's words, `STORED_FIELDS.messageHandbookSentCard` in
 * src/server/db/schema.ts, with `kind = 'message'` written out and the card said to be there: the index's WHERE, term
 * for term. It read every message and each one's data before: 72 ms a call on the made-up office of 22 October, and
 * once in each agent's start (wave 13s round 144, item 39).
 */
export function theHandbookWasSentIn(agentId: string, card: string): string | null {
  const theCard = theWordsOfAStoredField(STORED_FIELDS.messageHandbookSentCard, 'r.data')
  // An unreadable message must not stop an agent's start (23 October 2026).
  const row = sqlite
    .prepare(
      "SELECT r.id AS id FROM records r, json_each(r.data, '$.to') t WHERE r.kind = 'message' " +
        `AND ${theCard} IS NOT NULL AND ${theCard} = ? ` +
        'AND json_valid(r.data) ' +
        "AND json_extract(r.data, '$.sentBy.kind') = ? AND json_extract(r.data, '$.sentBy.id') = ? " +
        "AND json_extract(t.value, '$.kind') = 'agent' AND json_extract(t.value, '$.id') = ? " +
        'ORDER BY r.created_at, r.rowid LIMIT 1',
    )
    .get(card, moleOffice().kind, moleOffice().id, agentId) as { id?: unknown } | undefined
  return typeof row?.id === 'string' ? row.id : null
}

/** The handbook under its heading, in one language. */
function theHandbookIn(card: RoleCard, language: Language, text: string): string {
  return `${createI18n(language).t('cardHandbook.heading', { card: card.name })}\n\n${text}`
}

/**
 * WHAT THE CARD MESSAGE SAYS ABOUT THE CARD'S HANDBOOK, and the mark to put on the message. The mark
 * is null unless a handbook is in the message. There are six answers, and each is said:
 *   · it was sent before: the message that carried it is named, and nothing is sent again;
 *   · the agent's language is known and the handbook is written in it: the handbook in that language;
 *   · the agent's language is known and the handbook is not written in it: the English handbook, with the reason;
 *   · the agent's language is known and the handbook is written neither in it nor in English: the office stops,
 *     because a card always carries English;
 *   · it is not known: the handbook in every language it is written in, with the reason;
 *   · the card has no handbook: said, and nothing is marked, so a later grant can still send one.
 */
export function theHandbookPartFor(input: {
  card: RoleCard
  sentIn: string | null
  language: Language | null
}): { said: string; mark: HandbookSent | null } {
  const { card, sentIn, language } = input
  if (sentIn !== null) {
    return {
      said: `The ${card.name} card's handbook was sent to you before, in message ${sentIn}, and is not sent again.`,
      mark: null,
    }
  }
  // WHICH LANGUAGES GO, by the one rule a handbook record follows too (`theLanguagesToSend`, src/shared/handbooks.ts).
  const written = HANDBOOK_LANGUAGES.flatMap((one) => {
    const text = theHandbookOf(card, one)
    return text === null ? [] : [{ language: one, text }]
  })
  if (written.length === 0) {
    return { said: `The ${card.name} card has no handbook in ${ROLE_CARDS_FILE} yet, so none is sent.`, mark: null }
  }
  const chosen = theLanguagesToSend(written.map((one) => one.language), language)
  const sent = written.filter((one) => chosen.languages.includes(one.language))
  const handbooks = sent.map((one) => theHandbookIn(card, one.language, one.text))
  const writtenIn = written.map((one) => one.language).join(' and ')
  // A CARD'S HANDBOOK IS WRITTEN IN EVERY HANDBOOK LANGUAGE, English among them (`isOneTextInEachLanguage`,
  // src/shared/roles.ts), so the rule never answers "neither" for a card. If it does, the card was read wrong.
  if (chosen.why === 'neither') {
    throw new Error(
      `The ${card.name} card's handbook was found in ${writtenIn} and not in English. A card's handbook is written in ` +
        'every handbook language, English among them, so the card was read wrong.',
    )
  }
  const why =
    chosen.why === 'unknown'
      ? [
          `Nobody told the office which language you read, so the ${card.name} card's handbook follows in each ` +
            `language it is written in: ${sent.map((one) => one.language).join(', ')}.`,
        ]
      : chosen.why === 'english'
        ? [
            `The ${card.name} card's handbook is written in ${writtenIn}, so the English ` +
              `one follows; the office has no handbook in the language you read.`,
          ]
        : []
  return {
    said: [...why, ...handbooks].join('\n\n'),
    mark: { card: card.name, languages: sent.map((one) => one.language) },
  }
}

function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/**
 * PUT THE ITEM TO READ THE HANDBOOK ON A NEW SECRETARY'S OWN CHECKLIST, linking the card message that carried it, and
 * make that checklist first when the agent has none. The office adds the item;
 * the secretary marks it done.
 *
 * ONLY THE SECRETARY CARD GETS IT. The decision names the secretary, which the person appoints and which keeps the
 * overview for a long time. Workers and supervisors are registered for one piece of work, often one task, so an item
 * and a checklist for each of them would fill the office with checklists nobody keeps.
 */
function putTheHandbookOnTheSecretarysChecklist(agent: ParticipantRef, workspaceId: string, message: string): void {
  const chosen = theAgentsChecklist(agent, workspaceId, theOffice(), undefined, 'the secretary', () => {
    throw new Error('The office named no checklist, so none can be refused as not the secretary\'s.')
  })
  const checklist =
    chosen.checklist ??
    makeAChecklist({ workspaceId, said: { title: anAgentsChecklistTitle(nameOf(agent)) }, actor: theOffice(), forOwner: agent })
  addAnItem({ workspaceId, id: checklist.id, said: { words: THE_HANDBOOK_ITEM_WORDS, links: [message] }, actor: theOffice() })
}

/**
 * WRITE THE CARD MESSAGE TO ONE AGENT, in the project its own record is in.
 *
 * It goes through the office's own one-recipient door, so it is a message from Mole Office, it is
 * addressed to that agent alone, and it is left unseen for the waiter to hand over or for the agent
 * to read at its next start. It carries the card's handbook the first time this agent is given this
 * card, and names the message that carried it every time after.
 */
export function writeTheCardMessageToOne(input: {
  to: ParticipantRef
  workspaceId: string
  role: string | null
  actor: Actor
  change?: TheCardChange | null
}): { id: string } {
  const decl = theRoleCardsAreRead() ? theRoleCards() : null
  const card = decl === null ? null : cardFor(decl, input.role ?? A_ROW_WITH_NO_ROLE_READS_AS)
  const language = card === null ? null : theLanguageOfTheAgent(input.to.id, input.workspaceId)
  const handbook =
    card === null
      ? null
      : theHandbookPartFor({
          card: theCardInTheOfficesWords(card),
          sentIn: theHandbookWasSentIn(input.to.id, card.name),
          language,
        })
  // AND THE IN-USE HANDBOOK RECORDS ON THE CARD, after the card's own, in every card message. None, and nothing is added.
  const onTheCard = card === null ? null : theHandbooksOnACard(card.name, language)
  const handbookSaid = [handbook?.said ?? null, onTheCard?.said ?? null].filter((one): one is string => one !== null)
  const said = theCardMessageFor(input.role, input.change ?? null, handbookSaid.length === 0 ? null : handbookSaid.join('\n\n'))
  const mark = handbook?.mark ?? null
  const extra = {
    ...(mark === null ? {} : { [HANDBOOK_SENT_MARK]: mark }),
    ...(onTheCard === null ? {} : { [HANDBOOKS_SENT_MARK]: onTheCard.mark }),
  }
  const written = writeASystemLineToOne(
    input.to,
    input.workspaceId,
    said,
    input.actor,
    undefined,
    Object.keys(extra).length === 0 ? undefined : extra,
  )
  // ONLY WHEN THIS MESSAGE CARRIED THE HANDBOOK, so the card given again adds no second item.
  if (mark !== null && card?.name === THE_SECRETARY && input.to.kind === 'agent') {
    putTheHandbookOnTheSecretarysChecklist(input.to, input.workspaceId, written.id)
  }
  return written
}
