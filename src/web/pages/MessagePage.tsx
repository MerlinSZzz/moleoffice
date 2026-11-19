// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/message/<id>` — ONE MESSAGE'S OWN PAGE. Criterion E2.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A MESSAGE HAS A PAGE, AND THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * A message gets a separate entry and interface. A report had named the
 * record kinds still without a page of their own. `message` is the commonest of them: 6,422 records
 * on 16 September 2026. A decision settles it, following the pattern for reports, which is another
 * decision, merged as `c8119690`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE DRAWS THAT THE RECORD PAGE DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The record page at `#/r/<id>` still opens a message, plainly, and that is the fallback the design
 * keeps for a caller that holds only an id. This page is what a list that KNOWS the kind links to,
 * and it draws one message as the thing it is:
 *
 *   · who sent it, and when;
 *   · who it reached — people, agents or a group;
 *   · the letter itself, drawn by the chat's own body reader, so Markdown renders and a picture is
 *     shown the way the chat shows it (criterion M64 and M103);
 *   · how far it got with each recipient, from the delivery rows, with the mark and the time the
 *     mark was set, or the sentence saying it reached nobody;
 *   · one press that opens the conversation or the group it belongs to in the chat panel;
 *   · what it is about — the run (`aboutRun`), a message it is a notice about (`aboutMessage`), and
 *     the place a comment was left on (`target`) — each as a link.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOORS ARE THE ONES THAT EXIST
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/messages/:id` answers one message and its delivery rows; the page adds no server door.
 * The body is `Body`, the chat's own reader of Markdown and record ids, now exported rather than
 * copied. The pictures are `MessagePictures`, the component every place that draws a message
 * already uses. The press onto a conversation is `openTheChatAt`, and a group needed the one new
 * door, `openTheChatAtGroup`, because no page could open the chat at a group before. The place a
 * comment was left on opens through `pageHolding`, the one map from a stored context to an address.
 *
 * NOTHING HERE WRITES. The page reads and draws; the marks a reader sets stay on the pool page and
 * in the chat, where the mark door already lives.
 */

import { useMemo } from 'react'
import {
  CHAT_WORDS,
  DELIVERY,
  MESSAGE_OWN_PAGE,
  MESSAGES_PAGE,
  isDeliveryMark,
  participantKey,
  recordIsAComment,
  theAgentAStoredSenderNames,
  theWritersName,
  unregisteredName,
  unregisteredWriterOf,
  type KnownParticipant,
  type MessageOnTheWire,
  type UnregisteredWriter,
} from '@shared/messages.ts'
import { isMoleOffice, type ParticipantKind } from '@shared/participants.ts'
import type { GroupOnTheWire } from '@shared/groups.ts'
import { recordNamedByTarget, type Context } from '@shared/targets.ts'
import {
  api,
  type ParticipantOnTheWire,
  type ParticipantsReply,
} from '../api.ts'
import { Absence, ErrorNote, Loading, Panel, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { Avatar } from '../components/Avatar.tsx'
import { MessagePictures } from '../components/MessagePictures.tsx'
import { Body, openTheChatAt, openTheChatAtUnregistered } from '../components/Chat.tsx'
import { MarkedPartsFoot, thePartsToDraw } from '../components/chat/marks-on-markdown.tsx'
import { theFlagsOf } from '@shared/intent-mark.ts'
import { RoutedLine } from '../components/RoutedLine.tsx'
import { openTheChatAtGroup } from '../lib/open-chat.ts'
import { RouteLink, messagePath, recordPath } from '../components/router.tsx'
import { Crumbs } from './RecordPage.tsx'
import { titleOrSentence, useRecordTitles } from '../lib/titles.ts'
import { pageHolding, rememberTheCardACommentWasOn } from '../components/agent/ReviewBar.tsx'
import { content, t } from '@shared/i18n.ts'
import { theWordsOfAnOfficeLine, whoTheLineWasSentTo } from '@shared/dead-letter-lines.ts'

/** Everything the page reads, in one request group so the page cannot draw half of it. */
interface TheMessage {
  message: MessageOnTheWire
  participants: ParticipantsReply
  /** The reader, from the contacts read, or null because nothing answered for who is asking. */
  me: { kind: ParticipantKind; id: string } | null
  groups: readonly GroupOnTheWire[]
}

/**
 * THE PAGE. One message by id, with the registries that turn an id into a name.
 *
 * A read that fails is drawn as the failure it is, with the reason on it, rather than as an empty
 * message; criteria E4 and E5 hold that on every page.
 */
export function MessagePage({ id }: { id: string }) {
  const [state] = useProjectAsync<TheMessage>(async () => {
    const [detail, participants, contacts, groups] = await Promise.all([
      api.getMessage(id),
      api.participants(),
      api.messageContacts(),
      api.groups(),
    ])
    return { message: detail.message, participants, me: contacts.me, groups: groups.groups }
  }, [id])
  return (
    <div className="page mp">
      <style href="mole-office-message" precedence="default">
        {MESSAGE_CSS}
      </style>
      {state.status === 'loading' ? <Loading what={t('unrowedPages.message.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheMessageView key={id} said={state.value} /> : null}
    </div>
  )
}

/**
 * THE MESSAGE, GIVEN WHAT WAS READ.
 *
 * Exported so a test can hold the drawing still without a server, the way `TheSceneView` is.
 */
export function TheMessageView({ said }: { said: TheMessage }) {
  const { message } = said

  /** Everybody the registries hold, keyed the one way a participant is ever keyed. */
  const everybody = useMemo(() => {
    const out = new Map<string, ParticipantOnTheWire>()
    for (const one of said.participants.people) out.set(participantKey({ kind: 'person', id: one.id }), one)
    for (const one of said.participants.agents) out.set(participantKey({ kind: 'agent', id: one.id }), one)
    return out
  }, [said.participants])

  /** The same set in the shape the rule about who wrote a message reads. */
  const everyone: readonly KnownParticipant[] = useMemo(
    () => [
      ...said.participants.people.map((one) => ({
        who: { kind: 'person' as const, id: one.id },
        name: one.name,
        handle: one.handle,
      })),
      ...said.participants.agents.map((one) => ({
        who: { kind: 'agent' as const, id: one.id },
        name: one.name,
        handle: one.handle,
        record: one.record,
      })),
    ],
    [said.participants],
  )

  // THE READER'S OWN FLAGS, read as the chat reads them, so a marked part is drawn here in the colours it has there.
  const myself = said.me === null ? undefined : everybody.get(participantKey(said.me))
  const flags = theFlagsOf(myself?.shippedFlags ?? null, myself?.chatLabels ?? [])

  const named = message.sentBy === null ? null : theAgentAStoredSenderNames(message.sentBy, everyone)
  const sender = named === null ? undefined : everybody.get(participantKey(named))
  const writer = theWritersName(message, everyone)

  const comment = recordIsAComment({ kind: 'message', data: { target: message.target } })
  const place = message.target === null || typeof message.target !== 'object' ? null : (message.target as Context)
  const about = place === null ? null : recordNamedByTarget(place.target)
  // The two optional ids read as one absent value, so a row written before the field existed and a
  // row that carries none are the same thing to this page: nothing to link to.
  const aboutRun = message.aboutRun ?? null
  const aboutMessage = message.aboutMessage ?? null
  const titles = useRecordTitles(
    [aboutRun, aboutMessage, about].filter((one): one is string => one !== null),
  )

  // A LINE OF MOLE OFFICE'S IS DRAWN BY THE SAME READER THE CHAT USES, and a narrowed group line says once who it was
  // sent to and why. Both null for every message a person or an agent wrote, and the sentence null where nothing narrowed it.
  // The line's sentence leaves out who it was sent to where `sentTo` says it, so the page says it once.
  const sentTo = whoTheLineWasSentTo(t, message)
  const officeWords = message.sentBy !== null && isMoleOffice(message.sentBy) ? theWordsOfAnOfficeLine(t, message, undefined, sentTo !== null) : null
  // A LINE OF MOLE OFFICE'S IS HEADED BY ITS FEW WORDS, in the page's language. Its stored title is the sender's name,
  // "Mole Office", which the From line already says; the heading named the sender and not the subject (row 57 of
  // report rFBoQG6mAEI0). Every other message is headed by its own title.
  const heading = officeWords === null ? message.title : officeWords.line

  const other = theOtherSide(message, said.me, everyone)
  const groupName =
    message.toGroup === null
      ? null
      : (said.groups.find((one) => one.id === message.toGroup)?.name ?? message.toGroup)

  return (
    <>
      <header className="mp-head">
        {/* THE MESSAGE'S OWN TITLE IS THE HEADING, the way a record's is, and not a typed name. */}
        <h1 className="mp-title wrap-anywhere">{heading}</h1>
        <Crumbs record={{ kind: 'message', title: heading }} />
      </header>

      {/* WHAT IT SAYS: the letter, who wrote it, who it reached, and when. */}
      <Panel titleIs="label" declares={{ surface: 'message.says' }} title={MESSAGE_OWN_PAGE.saysTitle}>
        <dl className="mp-facts">
          <div className="mp-fact">
            <dt>{MESSAGE_OWN_PAGE.fromLabel}</dt>
            <dd>
              {sender === undefined ? null : (
                <Avatar
                  kind={sender.kind as ParticipantKind}
                  id={sender.id}
                  name={writer}
                  url={sender.avatarUrl}
                  size={20}
                />
              )}
              <span className="mp-writer">{writer}</span>
            </dd>
          </div>
          <div className="mp-fact">
            <dt>{MESSAGE_OWN_PAGE.toLabel}</dt>
            <dd>
              {message.toGroup !== null ? (
                <span className="mp-to-group">
                  {/* A GROUP LINE MOLE OFFICE DELIVERED TO SOME MEMBERS ONLY, OR TO NONE, names the group here, and
                      says who it was sent to and why once, under "Where it went" (problem 0WUuvB0IhRfb). */}
                  {message.deliveredOnlyTo === undefined
                    ? MESSAGES_PAGE.toAGroup(groupName ?? message.toGroup)
                    : t('deadLetterLines.toTheGroup', { group: content(groupName ?? message.toGroup) })}
                </span>
              ) : message.deliveries.length === 0 ? (
                <span className="mp-to-none">{MESSAGES_PAGE.reachedNobodyAtAll}</span>
              ) : (
                <span className="mp-to-list">
                  {message.deliveries.map((one) => theWritersName({ sentBy: one.to, from: null }, everyone)).join(', ')}
                </span>
              )}
            </dd>
          </div>
          <div className="mp-fact">
            <dt>{MESSAGE_OWN_PAGE.sentLabel}</dt>
            <dd>
              <Stamp at={message.sentAt} />
              {message.notSentYet ? <span className="mp-unsent">{CHAT_WORDS.notSentYet}</span> : null}
            </dd>
          </div>
        </dl>

        {/* THE LINE SAYING THIS WAS ROUTED, AND TO WHOM, above the words. By a decision, the office
            stores the finished line on the message and this prints it word for
            word. An entry written to the sender is drawn only when the
            reader IS the sender; a third-person entry is drawn for every reader. */}
        <RoutedLine routed={message.routed} viewer={said.me} sentBy={message.sentBy} />

        {message.body.trim() === '' ? (
          <p className="mp-none">{MESSAGE_OWN_PAGE.noBody}</p>
        ) : officeWords !== null ? (
          // A LINE OF MOLE OFFICE'S: its few words and its whole sentence, in the page's language where the line is
          // a dead-letter line (`theWordsOfAnOfficeLine`), so its own page says what happened and not only the few words.
          <div className="mp-body wrap-anywhere">
            <Body text={officeWords.line} />
            {officeWords.said === null ? null : <p className="mp-said">{officeWords.said}</p>}
          </div>
        ) : (
          <div className="mp-body wrap-anywhere">
            <Body text={message.body} markedParts={thePartsToDraw(message)} flags={flags} />
            {/* AND THE COUNT OF ITS MARKED PARTS, with how many are not shown in the words. This page draws the body
                as one run and draws no quotes, so the count is of the words as drawn here. */}
            {(message.markedParts ?? []).length === 0 ? null : (
              <p className="mp-marked">
                <MarkedPartsFoot entry={{ body: message.body, quotes: [], quotePositions: null, markedParts: message.markedParts }} />
              </p>
            )}
          </div>
        )}

        {/* AND THE PICTURES IT CARRIES, criterion M64, through the one component every place that
            draws a message uses, so this page cannot disagree with the chat about them. */}
        <MessagePictures pictures={message.pictures} inProject={message.workspaceId} />
      </Panel>

      {/* WHERE IT WENT: one row per recipient, with the mark and the time, or the sentence saying it
          reached nobody. The words are the shared reading of the stored mark, never the token. */}
      <Panel titleIs="label" declares={{ surface: 'message.went' }} title={MESSAGE_OWN_PAGE.wentTitle}>
        {/* WHO A NARROWED GROUP LINE WAS SENT TO, AND WHY, said here once (`whoTheLineWasSentTo`). */}
        {sentTo === null ? null : <p className="mp-sent-to">{sentTo}</p>}
        {sentTo !== null && message.deliveries.length === 0 ? null : message.deliveries.length === 0 ? (
          <p className="mp-none">{MESSAGES_PAGE.reachedNobodyAtAll}</p>
        ) : (
          <ul className="mp-went">
            {message.deliveries.map((one) => {
              const mark = isDeliveryMark(one.mark) ? DELIVERY[one.mark] : null
              return (
                <li key={participantKey(one.to)} className="mp-went-one">
                  <span className="mp-who">{theWritersName({ sentBy: one.to, from: null }, everyone)}</span>
                  <span className="mp-mark">{mark === null ? MESSAGES_PAGE.markNobodyCanRead : mark.word}</span>
                  <Stamp at={one.at} />
                  {one.because === null ? null : <span className="mp-because">{one.because}</span>}
                  {one.run === null ? null : (
                    <RouteLink className="mp-run" to={recordPath(one.run)}>
                      {MESSAGES_PAGE.theRunThatTookIt}
                    </RouteLink>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ONE PRESS THAT OPENS THE CHAT THERE, on the conversation or on the group this message
            belongs to. It is not drawn when there is no other side to open with. */}
        {message.toGroup !== null ? (
          <p className="mp-open-line">
            <button
              type="button"
              className="mp-open"
              onClick={() => {
                if (message.toGroup !== null) openTheChatAtGroup(message.toGroup)
              }}
            >
              {MESSAGE_OWN_PAGE.openTheGroup(groupName ?? message.toGroup)}
            </button>
          </p>
        ) : other === null ? null : (
          <p className="mp-open-line">
            <button
              type="button"
              className="mp-open"
              onClick={() => {
                if (other.what === 'participant') openTheChatAt(other.who)
                else openTheChatAtUnregistered(other.writer)
              }}
            >
              {MESSAGES_PAGE.openItWhereItIsRead(
                other.what === 'unregistered'
                  ? unregisteredName(other.writer, 'inASentence')
                  : theWritersName({ sentBy: other.who, from: null }, everyone, 'inASentence'),
              )}
            </button>
          </p>
        )}
      </Panel>

      {/* WHAT IT IS ABOUT: the run, a message it is a notice about, and the place a comment was left
          on, each as a link, or the sentence saying it points at nothing else. */}
      <Panel titleIs="label" declares={{ surface: 'message.about' }} title={MESSAGE_OWN_PAGE.aboutTitle}>
        {aboutRun === null && aboutMessage === null && place === null ? (
          // ORDINARY EMPTINESS IS THE SHORT MARK, with the reason on hover and read out to a screen
          // reader (plan 7FEOshq3mBGG, block b-6, check 4).
          <p className="mp-none">
            <Absence tier="ordinary" title={MESSAGE_OWN_PAGE.aboutNothing} />
          </p>
        ) : (
          <ul className="mp-about">
            {aboutRun === null ? null : (
              <li>
                <RouteLink to={recordPath(aboutRun)}>{titleOrSentence(titles, aboutRun)}</RouteLink>
                <span className="mp-about-what"> — {MESSAGE_OWN_PAGE.theRunItIsAbout}</span>
              </li>
            )}
            {aboutMessage === null ? null : (
              <li>
                <RouteLink to={messagePath(aboutMessage)}>
                  {titleOrSentence(titles, aboutMessage)}
                </RouteLink>
                <span className="mp-about-what"> — {MESSAGE_OWN_PAGE.theMessageItIsAbout}</span>
              </li>
            )}
            {place === null || about === null ? null : (
              <li>
                <span>{CHAT_WORDS.aboutThePlace(titleOrSentence(titles, about))} </span>
                <OpenWhereTheCommentWas context={place} fallback={recordPath(about)} />
              </li>
            )}
            {comment && place !== null && about === null ? (
              <li>
                <Absence tier="ordinary" title={MESSAGE_OWN_PAGE.placeNotHeld} />
              </li>
            ) : null}
          </ul>
        )}
      </Panel>
    </>
  )
}

/**
 * THE LINK THAT OPENS WHAT A COMMENT IS ABOUT, the same one the pool page draws.
 *
 * A comment written on a card opens that drawing, at that card; `pageHolding` is the one map from a
 * stored context to an address, and the press is what remembers the card, because an address cannot
 * carry one.
 */
function OpenWhereTheCommentWas({ context, fallback }: { context: Context; fallback: string }) {
  const where = pageHolding(context)
  const to = 'path' in where ? where.path : fallback
  return (
    <a
      href={`#${to}`}
      onClick={() => {
        rememberTheCardACommentWasOn(context)
      }}
    >
      {MESSAGES_PAGE.openTheRecord}
    </a>
  )
}

/**
 * WHOSE CONVERSATION THIS MESSAGE IS IN, SEEN FROM THE READER, or null because there is none.
 *
 * A message to a group is in that group and in no one-to-one conversation, which is the rule
 * `isBetween` in src/server/lib/messages.ts already follows. The two shapes are a registered
 * participant and a writer nobody registered; the words and the press onto each are the pool page's
 * own, so the two pages cannot send a reader to two different places for one message.
 */
type TheOtherSide =
  | { what: 'participant'; who: { kind: ParticipantKind; id: string } }
  | { what: 'unregistered'; writer: UnregisteredWriter }

export function theOtherSide(
  said: MessageOnTheWire,
  me: { kind: ParticipantKind; id: string } | null,
  everyone: readonly KnownParticipant[],
): TheOtherSide | null {
  if (me === null) return null
  if (said.toGroup !== null) return null
  const writer = unregisteredWriterOf(said, everyone)
  if (writer !== null) return { what: 'unregistered', writer }
  const mine = (who: { kind: string; id: string }): boolean => who.kind === me.kind && who.id === me.id
  const sender = said.sentBy === null ? null : theAgentAStoredSenderNames(said.sentBy, everyone)
  if (sender !== null && !mine(sender)) return { what: 'participant', who: sender }
  const to = said.deliveries.map((one) => theAgentAStoredSenderNames(one.to, everyone) ?? one.to).find((one) => !mine(one))
  return to === undefined ? null : { what: 'participant', who: to }
}

/**
 * THIS PAGE'S OWN RULES. Stylesheets for one page live with the page, the way the incident page's
 * do; every value is a token and no colour or type size is written out here.
 */
const MESSAGE_CSS = `
.mp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.mp-head { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.mp-title { margin: 0; font-size: var(--fs-5); overflow-wrap: anywhere; }

.mp-facts { display: flex; flex-direction: column; gap: 0.3rem; margin: 0 0 var(--pad); }
.mp-fact { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.mp-fact dt { color: var(--text-3); font-size: var(--fs-1); min-width: 4rem; }
.mp-fact dd { margin: 0; display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; min-width: 0; }
.mp-writer { font-weight: 600; overflow-wrap: anywhere; }
.mp-to-list, .mp-to-group, .mp-to-none { overflow-wrap: anywhere; }
.mp-unsent {
  border: 1px solid var(--border-strong);
  border-radius: 0.2rem;
  padding: 0 0.3rem;
  color: var(--text-3);
  font-size: var(--fs-1);
}

.mp-body { line-height: var(--lh-body); overflow-wrap: anywhere; }
.mp-marked { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin: 0.4rem 0 0; }
.mp-none { margin: 0; color: var(--text-2); line-height: var(--lh-body); }
.mp-said { margin: 0.4rem 0 0; color: var(--text-2); line-height: var(--lh-body); overflow-wrap: anywhere; text-wrap: pretty; }
.mp-sent-to { margin: 0 0 0.4rem; color: var(--text-2); line-height: var(--lh-body); overflow-wrap: anywhere; text-wrap: pretty; }
/* THE GROUP A LINE WAS WRITTEN TO, kept from leaving its last word alone on a line at a narrow width. */
.mp-to-group { text-wrap: pretty; }

.mp-went { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.mp-went-one { display: flex; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.mp-who { font-weight: 600; overflow-wrap: anywhere; }
.mp-mark, .mp-because, .mp-run { color: var(--text-3); }

.mp-open-line { margin: var(--pad) 0 0; }
.mp-open {
  border: 1px solid var(--border-strong);
  border-radius: 0.25rem;
  background: none;
  color: var(--text);
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  font: inherit;
}

.mp-about { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.mp-about-what { color: var(--text-3); }
`
