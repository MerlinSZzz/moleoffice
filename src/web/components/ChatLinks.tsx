// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, content } from '@shared/i18n.ts'
/**
 * HOW A MESSAGE'S LINKS ARE DRAWN, for its bubble and for the line under its conversation's name.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13y round 146. The line under a conversation's name in the chat's lists drew a record link as its raw id, and a
 * page address as it was typed. The bubble draws the same links as the record's name and as the words of the page's
 * press. The contact rows are drawn in src/web/components/ContactChooser.tsx, which Chat.tsx imports, so the choice of
 * name and the words of a link are kept here, where the bubble and both kinds of row read them.
 */

import { createContext, useContext } from 'react'
import { CHAT_WORDS, piecesOfBody, type BodyPiece } from '@shared/messages.ts'
import {
  MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
  type MessageLinkLayout,
  type MessageLinkLevel,
} from '@shared/participants.ts'
import { useInspect } from '../lib/mode.ts'
import { useRecordNames, type RecordName } from '../lib/titles.ts'

/**
 * HOW A LINK IN A MESSAGE IS DRAWN, for every drawing in this panel at once: which of the two names
 * it carries, and where it sits.
 *
 * Criteria M47 and M48. A person chooses whether a link in a message shows its level-1 or
 * its level-2 name, level 1 by default, and whether it sits in the text as ordinary words or on a line
 * of its own, centred, and in the text by default since 7 November 2026. Both settings are one person's own and are stored on
 * their registry row, so the panel reads them once and every message drawing takes them from here. `Body` is drawn in four places — three lists of messages and the
 * system lines — and one of them is a component the panel does not pass props to, so a prop threaded
 * through all four would have been four chances to forget one.
 *
 * THE DEFAULT IS THE ANSWER FOR SOMEBODY WHO HAS NOT CHOSEN, and it is the shared constant rather
 * than a word written here, so this and the control cannot come to different answers about it.
 */
export const HowLinksAreDrawn = createContext<{ level: MessageLinkLevel; layout: MessageLinkLayout }>({
  level: MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
  layout: MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES,
})

/** A piece of a message that a reader presses: a record's id or a page's address. */
type ALink = Exclude<BodyPiece, { what: 'words' }>

/**
 * THE WORDS ONE LINK IS DRAWN WITH. A record is drawn as its name where one has been read, and as the words of a
 * press to open it where none has. A page is drawn as the words of a press to open it. A developer reads the id or
 * the address itself, with the record's name in front of its id where one has been read.
 */
export function theWordsOfALink(link: ALink, named: RecordName | null, inspect: boolean): string {
  if (link.what === 'page') return inspect ? link.text : t('chat.openPage')
  if (inspect) return named === null ? link.text : CHAT_WORDS.recordLink(named.text, link.text)
  return named === null ? t('chat.openRecord') : content(named.text)
}

/**
 * A LINE OF A MESSAGE WITH EACH LINK IN THE WORDS ITS BUBBLE DRAWS, for the line under a conversation's name. The names
 * are read as the bubble reads them, at the level the reader chose. Every other word is left as it is.
 */
export function useTheLineWithItsLinksInWords(line: string): string {
  const inspect = useInspect()
  const { level } = useContext(HowLinksAreDrawn)
  const pieces = piecesOfBody(line)
  const names = useRecordNames(
    pieces.flatMap((piece) => (piece.what === 'record' ? [piece.recordId] : [])),
    level,
  )
  return pieces
    .map((piece) => (piece.what === 'words' ? piece.text : theWordsOfALink(piece, piece.what === 'record' ? (names.get(piece.recordId) ?? null) : null, inspect)))
    .join('')
}

/** The same line drawn as a component, for a row drawn inside a list's map, where a hook cannot be called. */
export function TheLineWithItsLinksInWords({ line }: { line: string }): React.JSX.Element {
  return <>{useTheLineWithItsLinksInWords(line)}</>
}
