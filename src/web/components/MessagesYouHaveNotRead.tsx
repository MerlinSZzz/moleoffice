// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
/**
 * THE MESSAGES YOU HAVE NOT READ, AS A SHORT LIST BESIDE THE DECISIONS. Question 10 of report
 * n9Mjk3c_sJRu, answered "yes" by a decision. The width is used side by side
 * under another decision. Only the Decisions page (`#/governance`) draws it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH MESSAGES, AND WHY NOT "THE ONES THAT ASK A QUESTION"
 * ---------------------------------------------------------------------------------------
 *
 * No door records whether a message asks something: the message kind has no such field, and
 * `whose_move` is not on messages. What the office does record is the asked tier of
 * `GET /api/waiting`, which holds one row of kind "message" for each message given to the person,
 * not written by them, that they have not read (src/server/lib/waiting.ts, source 4). This list draws
 * exactly those rows, out of the reply App.tsx already fetched. It works out nothing about which
 * messages wait: the server decides, and `isAMessageRow` below only says which of its rows are
 * messages. So the heading says what the rows are, and never claims each one is a question.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW OPENS THE CHAT AT ITS CONVERSATION
 * ---------------------------------------------------------------------------------------
 *
 * The waiting row names the sender by id only, with no kind and no group. So a press reads the
 * message itself at `GET /api/messages/<id>`, in the project it lives in, and asks `theOtherSide`
 * (src/web/pages/MessagePage.tsx) which conversation it is in. That is the rule the message's own
 * page uses, so the two presses cannot open two different conversations for one message. Then the
 * chat is opened with the chat's own helpers: at the group, at that message, when the message went
 * to a group; at the writer when nobody registered the writer; at the other participant otherwise.
 * The chat spans projects, so the page's project is not changed.
 *
 * WHEN THE MESSAGE IS IN NO CONVERSATION THE READER CAN OPEN, the press opens the message's own
 * page, which says who it went to. When the read fails, the failure is drawn in the list.
 */
import { useState } from 'react'

import { t, content } from '@shared/i18n.ts'
import type { KnownParticipant, MessageOnTheWire } from '@shared/messages.ts'

import { api, errorMessage, faultOf, moleOfficeRequest, type Fault } from '../api.ts'
import { openTheChatAt, openTheChatAtGroup, openTheChatAtUnregistered } from '../lib/open-chat.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import type { WaitingItem, WaitingReply } from '../lib/waiting.ts'
import { theOtherSide } from '../pages/MessagePage.tsx'
import { storedActorName } from './Governance.tsx'
import { messagePath, navigate } from './router.tsx'
import { Absence, ErrorNote, Panel, Stamp } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/**
 * IS THIS WAITING ROW A MESSAGE? The server's own word for the row's kind, the same test
 * `whereAWaitingRowGoes` makes. The asked band on the page leaves out exactly the rows this list
 * draws, so no row is drawn twice and none is lost.
 */
export function isAMessageRow(row: Pick<WaitingItem, 'tier' | 'kind'>): boolean {
  return row.tier === 'asked' && row.kind === 'message'
}

/** The rows this list draws, in the order the server sent them. */
export function messagesYouHaveNotRead(reply: WaitingReply): WaitingItem[] {
  return reply.items.filter(isAMessageRow)
}

/**
 * OPEN ONE WAITING MESSAGE IN THE CHAT, the way a press on its row does. The rule is in this file's
 * head comment. The row's press and the `n` key (src/web/components/ShortcutKeys.tsx) both call it, so
 * the two cannot open two different conversations for one message. A failed read throws.
 */
export async function openAWaitingMessage(row: WaitingItem): Promise<void> {
  const stillHere = stillOnThisPage()
  const inItsProject = { headers: { [WORKSPACE_HEADER]: row.workspaceId } }
  const [said, participants, contacts] = await Promise.all([
    moleOfficeRequest<{ message: MessageOnTheWire }>(`/api/messages/${encodeURIComponent(row.id)}`, inItsProject),
    api.participants(),
    api.messageContacts(),
  ])
  if (!stillHere()) return
  const message = said.message
  if (message.toGroup !== null) {
    openTheChatAtGroup(message.toGroup, message.id)
    return
  }
  const everyone: KnownParticipant[] = [
    ...participants.people.map((one) => ({ who: { kind: 'person' as const, id: one.id }, name: one.name, handle: one.handle })),
    ...participants.agents.map((one) => ({ who: { kind: 'agent' as const, id: one.id }, name: one.name, handle: one.handle })),
  ]
  const other = theOtherSide(message, contacts.me, everyone)
  if (other === null) navigate(messagePath(message.id))
  else if (other.what === 'participant') openTheChatAt(other.who, row.workspaceId)
  else openTheChatAtUnregistered(other.writer)
}

export function MessagesYouHaveNotRead({ rows, inspect }: { rows: readonly WaitingItem[]; inspect: boolean }) {
  const [names] = useProjectAsync(async () => (rows.length === 0 ? null : api.participants()), [rows.length])
  const [failed, setFailed] = useState<{ id: string; message: string; fault: Fault | null } | null>(null)

  const open = async (row: WaitingItem) => {
    setFailed(null)
    try {
      await openAWaitingMessage(row)
    } catch (error) {
      setFailed({ id: row.id, message: errorMessage(error), fault: faultOf(error) })
    }
  }

  return (
    <Panel
      titleIs="label"
      declares={{ surface: 'governance.messages' }}
      title={t('decisionsAsks.title')}
      rank={1}
      // THE COUNT CARRIES ITS MEASURE WORD IN CHINESE, 0 条 (wave 13q's round 34).
      actions={<span className="dq-count">{t('decisionsAsks.count', { n: rows.length })}</span>}
    >
      {rows.length === 0 ? (
        <Absence say title={t('decisionsAsks.none')} />
      ) : (
        <ul className="da-rows">
          {rows.map((row) => {
            const from = row.because.rule === 'the-persons-press' ? row.because.from : null
            const name = from === null ? null : storedActorName(from, names.status === 'ready' ? names.value ?? undefined : undefined)
            return (
              <li key={row.id} className="da-row" data-message={row.id}>
                <button type="button" className="da-open" onClick={() => void open(row)}>
                  {content(row.title)}
                </button>
                <span className="da-cues">
                  {name === null ? <Absence title={t('decisions.actorUnknown')} /> : <span className="da-from">{t('decisionsAsks.from', { name: content(name) })}</span>}
                  {row.since === null ? null : <Stamp at={row.since} />}
                  {inspect ? <code className="gq-raw">{row.id}</code> : null}
                </span>
                {failed !== null && failed.id === row.id ? (
                  <ErrorNote message={failed.message} fault={failed.fault}>
                    <span className="gq-what">{t('decisionsAsks.openFailed')}</span>
                  </ErrorNote>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The list's own rows. The page's frame is in GOVERNANCE_PAGE_CSS.
 *
 * NO BACKTICK ANYWHERE IN THIS STRING: it is a template literal, and one closes it.
 */
export const MESSAGES_YOU_HAVE_NOT_READ_CSS = `
.da-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.da-row {
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
  padding-block: var(--pad);
  border-block-start: var(--border-w) solid var(--border);
}
.da-row:first-child { border-block-start: 0; padding-block-start: 0; }
.da-open {
  align-self: stretch; min-height: 28px; max-width: 100%;
  margin: 0; padding: 0; border: 0; background: none; text-align: start;
  color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
  overflow-wrap: anywhere; cursor: pointer;
}
.da-open:hover { text-decoration: underline; }
.da-open:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.da-cues { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; min-width: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
`
