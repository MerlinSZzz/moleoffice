// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINE SAYING A MESSAGE WAS ROUTED, AND TO WHOM, drawn above the words of the message it is
 * about.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS, AND WHERE THE WORDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Decision `J1Qge4JH87bv` and another decision. When a message cannot be
 * reached, the office also gives it to the first reachable participant up the addressee's chain of
 * starters, and writes on the message one `routed` entry per addressee that could not be reached.
 * Each entry carries the finished `line`, built once at send time in `src/shared/messages.ts`.
 *
 * THIS COMPONENT DRAWS `theRoutedLineToDraw`, which builds the line again, in the page language, from
 * the facts stored beside it (`said`), with the one builder that wrote the stored line. So the screen
 * and the record say one thing in two languages. A message routed before `said` was stored draws its
 * stored English `line` word for word. Problem t_ox8XMOvu7a. After the person's own letter that nobody else
 * was given, it says what the person can do (`whatTheSenderCanDo`, row 49 of report rFBoQG6mAEI0).
 *
 * ---------------------------------------------------------------------------------------
 * WHO SEES WHICH LINE
 * ---------------------------------------------------------------------------------------
 *
 * An entry whose `to` is not null was written in the third person: "A could not be reached when this
 * was sent: ... Mole Office also gave it to R, ...". It is true for every reader, so it is drawn for
 * every viewer of the message.
 *
 * An entry whose `to` is null was written TO THE SENDER: "... You are the first one up its chain of
 * starters who can be reached, so no copy was made when it was sent." or "..., and you are the owner,
 * so no copy was made when it was sent." Its "you" names the sender, so it is drawn only when the
 * viewer IS the sender; everywhere else it is not drawn at all.
 *
 * A message with no routed entries draws nothing here. A group message is never routed.
 */
import { useState } from 'react'
import { useInspect } from '../lib/mode.ts'
import { t } from '@shared/i18n.ts'
import { BROKEN_OWNERS_ROUTING_ENDING, PERSON_OWNER_ROUTING_ENDING, NO_REACHABLE_OWNER_ENDING, OWNERLESS_ROUTING_ENDING, theRoutedLineInTheChat, type RoutedAddressee } from '@shared/messages.ts'

/**
 * One message's routed lines, or nothing when it has none this viewer may read.
 *
 * `viewer` is who is looking (in the chat, the person the panel answers for), and `sentBy` is who
 * wrote the message. Comparing the two is what decides whether a `to: null` entry is drawn.
 */
export function RoutedLine({
  routed,
  viewer,
  sentBy,
}: {
  routed?: readonly RoutedAddressee[]
  viewer: { kind: string; id: string } | null
  sentBy: { kind: string; id: string } | null
}) {
  const lines = theRoutedLinesThisViewerMayRead(routed, viewer, sentBy)
  if (lines.length === 0) return null

  return (
    <div className="px-chat-routed">
      <style href="mole-office-routed-line" precedence="default">
        {ROUTED_LINE_CSS}
      </style>
      {lines.map((line, index) => (
        <p key={index} className="px-chat-routed-line">
          {line}
        </p>
      ))}
    </div>
  )
}

/**
 * THE SHORT MARK A MESSAGE CARRIES WHEN IT WAS NOT DELIVERED, in place of the long notes.
 *
 * The chat used to draw the routed line and the nobody-answering sentence as long paragraphs under a
 * message whose addressee could not be reached. It now draws one short grey mark instead. The mark
 * is drawn for every message the chat used to draw either paragraph on, and only for those: a routed
 * entry this viewer may read, or a nobody-answering sentence handed in by the conversation.
 *
 * WITH DEVELOPER DETAIL CHOSEN the mark is a press. Pressing it draws the same long words the chat
 * used to draw, word for word, from the same builders; nothing is stored differently. In normal mode
 * the mark is a plain span, so there is nothing to press and nothing long on the screen.
 *
 * THE MARK SITS UNDER THE MESSAGE'S FOOT, not above its words: the chat calls it after the foot.
 */
export function NotDeliveredLine({
  routed,
  viewer,
  sentBy,
  moreWords = [],
}: {
  routed?: readonly RoutedAddressee[]
  viewer: { kind: string; id: string } | null
  sentBy: { kind: string; id: string } | null
  /** Sentences from the conversation, such as the nobody-answering reading, drawn after the routed lines. */
  moreWords?: readonly string[]
}) {
  const inspect = useInspect()
  const [opened, setOpened] = useState(false)
  const lines = [...theRoutedLinesThisViewerMayRead(routed, viewer, sentBy), ...moreWords]
  if (lines.length === 0) return null

  return (
    <div className="px-chat-not-delivered">
      <style href="mole-office-not-delivered" precedence="default">
        {NOT_DELIVERED_CSS}
      </style>
      {inspect ? (
        <button
          type="button"
          className="px-chat-not-delivered-mark"
          aria-expanded={opened}
          onClick={() => setOpened((was) => !was)}
        >
          {t('chat.notDelivered')}
        </button>
      ) : (
        <span className="px-chat-not-delivered-mark">{t('chat.notDelivered')}</span>
      )}
      {inspect && opened ? (
        <div className="px-chat-not-delivered-words">
          {lines.map((line, index) => (
            <p key={index} className="px-chat-routed-line">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * THE ROUTED LINES ONE VIEWER MAY READ, built the one way both components draw them: the same filter
 * on an entry written to the sender, and the same builder that wrote the stored line.
 */
function theRoutedLinesThisViewerMayRead(
  routed: readonly RoutedAddressee[] | undefined,
  viewer: { kind: string; id: string } | null,
  sentBy: { kind: string; id: string } | null,
): string[] {
  const viewerIsTheSender =
    viewer !== null && sentBy !== null && viewer.kind === sentBy.kind && viewer.id === sentBy.id
  return (routed ?? [])
    .filter((one, index, all) => {
      if (one.to !== null) return true
      if (!viewerIsTheSender) return false
      const waiting = [OWNERLESS_ROUTING_ENDING, NO_REACHABLE_OWNER_ENDING, BROKEN_OWNERS_ROUTING_ENDING, PERSON_OWNER_ROUTING_ENDING].some((how) => how === one.said?.ending.how)
      return !waiting || !all.slice(index + 1).some((later) => later.to !== null && later.for.kind === one.for.kind && later.for.id === one.for.id)
    })
    .map((one) => theRoutedLineInTheChat(one, routed ?? []))
}

/**
 * THE RULES, matching the chat's other secondary line for a message: the from-the-group line is
 * small, grey and sits above the words. This one has no press and no fold, so it is a plain
 * paragraph rather than a button.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const ROUTED_LINE_CSS = `
.px-chat-routed { display: block; margin: 0 0 0.25rem; min-width: 0; }
.px-chat-routed-line {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  overflow-wrap: anywhere;
}
.px-chat-routed-line + .px-chat-routed-line { margin-top: 0.15rem; }
`

/**
 * THE SHORT MARK'S RULES. It is the chat's smallest grey line, sitting under the foot. The long words
 * reuse the routed line's own rules above, so the mark and its opened words read as one thing.
 *
 * NO BACKTICK ANYWHERE IN HERE EITHER.
 */
const NOT_DELIVERED_CSS = `
.px-chat-not-delivered { display: block; margin: 0.15rem 0 0; min-width: 0; }
.px-chat-not-delivered-mark {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-2);
  font: inherit;
  font-size: var(--fs-1);
  line-height: var(--lh-tight);
  text-align: left;
  overflow-wrap: anywhere;
}
button.px-chat-not-delivered-mark {
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 0.15em;
}
.px-chat-not-delivered-words { display: block; margin: 0.2rem 0 0; min-width: 0; }
${ROUTED_LINE_CSS}
`
