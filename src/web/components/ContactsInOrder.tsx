// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO SOMETHING GOES TO, CHOSEN FROM ONE SHORT LIST OF CONTACTS IN ONE ORDER, EACH ROW SAYING WHY IT IS WHERE IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PICKER LOOKS LIKE
 * ---------------------------------------------------------------------------------------
 *
 * By item 5 of a decision, the review pane's recipient picker takes the look of the contacts list in
 * option B of another decision. That is the
 * chat's contacts as one short list with a filter box, one row each, with no group headings and no New or
 * Edit. design/round-ten/design/review.md section 5.4's ranking decides only the order of the rows, and each
 * row says its reason in small words ("started this review", "filed this", "wrote here") where the old
 * picker drew group headings.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER COMES FROM ONE FUNCTION, AND THIS FILE DOES NOT RANK
 * ---------------------------------------------------------------------------------------
 *
 * The ranking is one shared function that the right-click panel uses too (problem Nu0y2IKdzPcw):
 * `rankAgentRecipients` in src/shared/recipient-ranking.ts, wave 13q's. `theRowsInOrder` below is the one
 * place this list reads it. Nothing here guesses a reason. The component draws whatever order and reasons
 * that one function gives, so changing it changes every picker that draws this.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROW IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The name and the dot are the chat's own (`theNameOfAContact`, `theNameBesideItsDate` and `Dot` from
 * ContactChooser.tsx), and the rows wear the right-click panel's classes, so the three lists look alike.
 * The filter narrows by the name a row draws and an agent's handle (`theTypedWordsFindARow`). A writer nobody
 * registered cannot receive, so pressing that row opens the chat where the conversation already lives, as the
 * chat's own contacts do.
 *
 * Used by the review column (src/web/components/agent/ReviewBar.tsx). The right-hand column may draw it
 * too: it takes nothing from the review except what `WhatThePickIsAbout` names.
 */

import { useMemo, useState } from 'react'
import { t, type Say } from '@shared/i18n.ts'
import { AGENT_RECIPIENT_RUNG_WORDS, theAgentToPreselect, type AgentRecipientOnTheWire } from '@shared/recipient-ranking.ts'
import { theCannotReceiveLine, type TheCannotReceiveSaid } from '@shared/cannot-receive.ts'
import { CONTACT_SIDES } from '@shared/contacts.ts'
import { CHAT_WORDS, participantKey, unregisteredName } from '@shared/messages.ts'
import type { Context } from '@shared/targets.ts'
import type { ParticipantForThePage, PresenceOnTheWire, ShortContactLine, ShortContactsReply } from '../api.ts'
import { api } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { readContactsOnce, readParticipantsOnce, readPresenceForAMinute } from '../lib/oneread.ts'
import { openTheChatAtUnregistered } from '../lib/open-chat.ts'
import { Dot, theNameBesideItsDate, theNameOfAContact, theTypedWordsFindARow } from './ContactChooser.tsx'
import { Absence, ErrorNote } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { AGENT_CSS } from './agent/agent-css.ts'
import { inTheChatsOrder, type ContactRef } from './agent/TalkBox.tsx'

/** One row of the list: the contact, why it stands where it does, and whether it can be chosen. */
export interface ARowToPick {
  line: ShortContactLine
  /** A few small words, already in the page's language, or null because nothing says. Never a heading. */
  reason: string | null
  /**
   * WHY THIS CONTACT CANNOT BE CHOSEN, in the message door's own sentence, or null because nothing stops it. A row
   * that carries one is drawn, with the sentence, and cannot be pressed.
   */
  cannotReceive: string | null
  /** The facts the sentence was built from, so the row says it in the page's language. Absent when the door sent none. */
  cannotReceiveSaid?: TheCannotReceiveSaid | null
}

/**
 * WHY THE ROW CANNOT BE CHOSEN, as the reader sees it: the door's English sentence when it sent no facts, and otherwise
 * the one builder's line in the page's language with the person left out of whom to write to, because this picker is
 * drawn for the person.
 */
export function whyTheRowCannotBeChosen(
  row: Pick<ARowToPick, 'cannotReceive' | 'cannotReceiveSaid'>,
  say: Say,
): string | null {
  const said = row.cannotReceiveSaid
  return said === undefined || said === null ? row.cannotReceive : theCannotReceiveLine(said, say, true)
}

/**
 * ONE AGENT AS A RANKING PLACES IT: who, the small words for why, and the door's sentence if it cannot receive.
 *
 * `agentId` is the agent's registry id, which is what a contact row names it by (`line.who.id`). Wave 13q's rows
 * (`rankAgentRecipients` in src/shared/recipient-ranking.ts, run by GET /api/agent/recipients/agents) are turned into
 * these by the seam, with each rung drawn through AGENT_RECIPIENT_RUNG_WORDS.
 */
export interface APlacedAgent {
  agentId: string
  reason: string
  cannotReceive: string | null
  cannotReceiveSaid?: TheCannotReceiveSaid | null
}

/**
 * WHAT THE CHOICE IS ABOUT, for the ranking to read.
 *
 * `about` is the thing the words are on, or null. `review` is the review the choice is made in, or null
 * outside a review. Only its id is carried: the server reads that review's starter itself (GET
 * /api/agent/recipients/agents with review=<id>), so the starter is worked out in one place, from the
 * review's own row, never from a copy a caller holds.
 */
export interface WhatThePickIsAbout {
  about: Context | null
  review: { id: string } | null
}

/**
 * THE CONTACTS IN THE ORDER A RANKING GAVE, AND THE REST AFTER THEM IN THE LIST'S OWN ORDER.
 *
 * It places and does not rank. The agents `placed` names come first, in its order, each with its words and its
 * sentence; every other contact follows as the list has it, with neither. An agent `placed` names that is not a
 * contact is not added: the list offers the chat's contacts and nobody else.
 */
export function inTheOrderGiven(contacts: readonly ShortContactLine[], placed: readonly APlacedAgent[]): ARowToPick[] {
  const first: ARowToPick[] = []
  const taken = new Set<string>()
  for (const one of placed) {
    const line = contacts.find((row) => row.who !== null && row.who.kind === 'agent' && row.who.id === one.agentId)
    if (line === undefined || taken.has(line.key)) continue
    taken.add(line.key)
    first.push({
      line,
      reason: one.reason,
      cannotReceive: one.cannotReceive,
      ...(one.cannotReceiveSaid === undefined ? {} : { cannotReceiveSaid: one.cannotReceiveSaid }),
    })
  }
  return [...first, ...contacts.filter((row) => !taken.has(row.key)).map((line) => ({ line, reason: null, cannotReceive: null }))]
}

/** The list in its order, and the contact chosen in advance, or nobody. */
export interface TheListInOrder {
  rows: ARowToPick[]
  /** The contact chosen before anybody presses, by 13q's one rule (`theAgentToPreselect`), or null. */
  first: ContactRef | null
}

/**
 * THE RANKING FOR ONE PICK, AS THE SERVER GIVES IT: GET /api/agent/recipients/agents (`api.agentRanking`) ranks the
 * agents that filed or wrote what `asked.about` is on and, when the pick is in a review, the agent that asked for
 * that review, on the rung above them all (review.md section 5.4). Each agent comes with `cannotReceive`, the
 * message door's own sentence or null, the starter included. This file ranks nothing and adds nobody.
 */
async function theRanking(asked: WhatThePickIsAbout): Promise<AgentRecipientOnTheWire[]> {
  const answer = await api.agentRanking(asked.about, asked.review?.id ?? null)
  return answer?.agents ?? []
}

/**
 * WHO IS CHOSEN BEFORE ANYBODY PRESSES, BY THE ONE RULE, `theAgentToPreselect`: the ranking's first agent when it can
 * receive, else nobody. One thing is asked first, because that rule cannot see it: the agent must be the list's own
 * first row. An agent the contacts do not hold is not drawn, and choosing somebody the list does not show would be a
 * choice nobody can see.
 */
function theContactToPreselect(ranking: readonly AgentRecipientOnTheWire[], rows: readonly ARowToPick[]): ContactRef | null {
  const chosen = theAgentToPreselect(ranking)
  const first = rows[0]?.line.who ?? null
  if (chosen === null || first === null || first.kind !== 'agent' || first.id !== chosen.agentId) return null
  return first
}

/**
 * THE SEAM: the rows of the list, in their order, each with its reason and whether it can be chosen, and the contact
 * chosen in advance.
 *
 * The agents the ranking names come first, in its order, each with its rung in small words in the page's language
 * (AGENT_RECIPIENT_RUNG_WORDS through the word lists) and the message door's sentence where it cannot receive. Every
 * other contact follows in the chat's own order (`inTheChatsOrder` in TalkBox.tsx) with neither. This answers problem
 * Nu0y2IKdzPcw by item 5 of a decision. Nothing here ranks:
 * `rankAgentRecipients` (src/shared/recipient-ranking.ts) is the one ranking, and the server ran it.
 */
export async function theRowsInOrder(book: ShortContactsReply, asked: WhatThePickIsAbout): Promise<TheListInOrder> {
  const ranking = await theRanking(asked)
  const placed: APlacedAgent[] = ranking.map((one) => ({
    agentId: one.agentId,
    reason: t(AGENT_RECIPIENT_RUNG_WORDS[one.rung]),
    cannotReceive: one.cannotReceive,
    ...(one.cannotReceiveSaid === undefined ? {} : { cannotReceiveSaid: one.cannotReceiveSaid }),
  }))
  const rows = inTheOrderGiven(
    inTheChatsOrder(book.contacts, book.contactGroups, book.contactSides ?? CONTACT_SIDES.map((one) => ({ key: one.key }))),
    placed,
  )
  return { rows, first: theContactToPreselect(ranking, rows) }
}

/** The contact chosen in advance for one pick, read the way the list reads its rows. */
export async function theFirstChoiceFor(asked: WhatThePickIsAbout): Promise<ContactRef | null> {
  return (await theRowsInOrder(await readContactsOnce(), asked)).first
}

/** The rules this list adds to the panel's: where a row's reason sits, and a row that cannot be chosen. */
const ORDER_CSS = `
.px-pick-reason {
  margin-left: auto;
  padding-left: 8px;
  color: var(--text-3);
  font-size: var(--fs-1);
  white-space: nowrap;
}
.px-talk-contact[aria-disabled="true"] { cursor: not-allowed; color: var(--text-3); }
.px-pick-cannot { margin: 0 10px 4px; color: var(--text-3); font-size: var(--fs-1); text-wrap: pretty; }
`

/**
 * THE LIST. `chosen` is drawn as selected. A press on a registered contact calls `onChoose` and then
 * `onDecideToLeave`; a press on a writer nobody registered opens the chat there and calls `onDecideToLeave`.
 */
export function ContactsInOrder({
  open = true,
  chosen,
  asked,
  onChoose,
  onDecideToLeave,
}: {
  open?: boolean
  chosen: ContactRef | null
  asked: WhatThePickIsAbout
  onChoose: (who: ContactRef) => void
  onDecideToLeave: () => void
}) {
  useLanguage()
  // THE SAME THREE READS THE CHAT AND THE RIGHT-CLICK PANEL MAKE, so the three cannot list different people.
  const [book] = useProjectAsync(async () => {
    const [registries, contacts] = await Promise.all([readParticipantsOnce(), readContactsOnce()])
    return { registries, rows: (await theRowsInOrder(contacts, asked)).rows }
  }, [open, JSON.stringify(asked)])
  // WHO IS REACHABLE IS READ BESIDE THE ROWS AND NOT BEFORE THEM, and at most once a minute (lib/oneread.ts). Until it
  // answers a row draws no dot, which says nothing, rather than a grey one, which would say something.
  const [seen] = useProjectAsync(async () => (await readPresenceForAMinute()).presence, [open])
  const [filter, setFilter] = useState('')
  const everybody = useMemo(() => {
    const out = new Map<string, ParticipantForThePage>()
    if (book.status !== 'ready') return out
    for (const one of book.value.registries.people ?? []) out.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of book.value.registries.agents ?? []) out.set(participantKey({ kind: 'agent', id: one.id }), one)
    return out
  }, [book])
  if (!open) return null
  if (book.status === 'error') return <ErrorNote message={book.message} fault={book.fault} />
  if (book.status !== 'ready') return null
  const presence = seen.status === 'ready' ? seen.value : null
  const readingOf = (who: { kind: string; id: string }): PresenceOnTheWire | undefined =>
    presence?.find((one) => one.who.kind === who.kind && one.who.id === who.id)
  const rows = book.value.rows
  const shown = rows.filter((row) => theTypedWordsFindARow(row.line, everybody, filter))
  return (
    <div className="px-talk-chooser" data-part="contacts-in-order">
      {/* THE PANEL'S RULES, BY THE SAME NAME THE PANEL AND THE REVIEW COLUMN EMIT THEM UNDER, so a page drawing
          only this list still draws it the same way, and React keeps one copy. */}
      <style href="mole-office-agent" precedence="default">
        {AGENT_CSS}
      </style>
      <style href="mole-office-contacts-in-order" precedence="default">
        {ORDER_CSS}
      </style>
      <input
        type="search"
        className="px-chat-filter px-talk-filter"
        value={filter}
        autoFocus
        placeholder={t('chat.contact.filterPlaceholder')}
        aria-label={t('chat.contact.filterLabel')}
        onChange={(event) => setFilter(event.target.value)}
      />
      {rows.length === 0 ? (
        <p className="px-talk-contacts-none">
          <Absence title={CHAT_WORDS.noContacts} />
        </p>
      ) : shown.length === 0 ? (
        <p className="px-talk-contacts-none">
          <Absence title={t('talk.contacts.noMatch')} />
        </p>
      ) : (
        <ul className="px-talk-contacts" role="listbox" aria-label={t('talk.contacts')}>
          {shown.map(({ line, reason, cannotReceive: inEnglish, cannotReceiveSaid }) => {
            // THE DOOR'S SENTENCE IN THE PAGE'S LANGUAGE, built again from the facts by the one builder. A door that
            // sent no facts leaves its English sentence, which is drawn as it came. The person is left out of whom to
            // write to, because the picker is drawn for the person.
            const cannotReceive = whyTheRowCannotBeChosen({ cannotReceive: inEnglish, cannotReceiveSaid }, t)
            const them = line.who
            const one = them === null ? undefined : everybody.get(participantKey(them))
            const isChosen = them !== null && chosen !== null && them.kind === chosen.kind && them.id === chosen.id
            return (
              <li key={line.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isChosen}
                  className="px-talk-contact"
                  data-contact={line.key}
                  {...(cannotReceive === null ? {} : { 'aria-disabled': true })}
                  onClick={() => {
                    if (cannotReceive !== null) return
                    if (them !== null) {
                      onChoose(them)
                      onDecideToLeave()
                    } else if (line.unregistered !== null) {
                      openTheChatAtUnregistered(line.unregistered)
                      onDecideToLeave()
                    }
                  }}
                >
                  {them === null || presence === null ? null : <Dot reading={readingOf(them)} />}
                  <span className="px-talk-contact-name">
                    {them === null
                      ? unregisteredName(line.unregistered ?? { typed: null, said: null })
                      : theNameBesideItsDate(theNameOfAContact(line, everybody), one?.retiredAt)}
                  </span>
                  {them === null ? <span className="px-chat-unregistered">{CHAT_WORDS.unregistered}</span> : null}
                  {reason === null ? null : <span className="px-pick-reason">{reason}</span>}
                </button>
                {/* WHY IT CANNOT BE CHOSEN, under the row it is about. */}
                {/* A SHORT STATE IN THE PAGE'S LANGUAGE, WITH THE DOOR'S WHOLE LINE UNDER THE POINTER, in the page's
                    language too (`theCannotReceiveLine`): what is wrong and whom to write to instead. The line leaves
                    the person out of that list, because this picker is drawn for the person and telling the person to
                    write to the person is no help. Drawn whole on the row it pushed every other contact below the
                    fold. */}
                {cannotReceive === null ? null : (
                  <p className="px-pick-cannot" title={cannotReceive}>
                    {t('contactsInOrder.cannotReceive')}
                    <span className="px-sr"> {cannotReceive}</span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
