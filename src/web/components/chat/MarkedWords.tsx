// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MARKED WORDS, DRAWN WHERE THEY WERE WRITTEN AND WHERE THE MESSAGE IS READ (wave 14d, DB-2).
 *
 * The one reading of a part's flag and colour lives here, so the writing box's paint and the sent bubble cannot draw
 * the same part in two different colours. A part carries an asking mark (whose colour is on the person's list) or a
 * label of their own (which carries its colour on the message).
 */

import { Fragment } from 'react'

import { t } from '@shared/i18n.ts'
import { theFlagFor, theFlagForLabel, type AMarkedPart, type AnIntentThatAsks, type TheFlagsOfAPerson } from '@shared/intent-mark.ts'
import { type MessageLabel } from '@shared/message-label.ts'

import { runsOfMarkedWords } from '../../lib/marking-the-words.ts'

/** What a part must carry to be drawn: the stored run, its flag, and the flag's name when the hand-over gave one. */
export interface AMarkedPartToDraw {
  from: number
  to: number
  quote: string
  intent?: AnIntentThatAsks
  label?: MessageLabel
  name?: string
}

/** The flag of a part, as the person's list holds it today, or null when the flag has left the list. */
export function theFlagOfAPart(part: AMarkedPartToDraw, flags: TheFlagsOfAPerson) {
  if (part.intent !== undefined) return theFlagFor(part.intent, flags)
  if (part.label !== undefined) return theFlagForLabel(part.label, flags)
  return null
}

/** The colours and name the part is drawn with, from its flag or from the label it stored. */
export function theDrawingOfAPart(part: AMarkedPartToDraw, flags: TheFlagsOfAPerson): {
  name: string
  flagColour: string
  wordsColour: string
} {
  const flag = theFlagOfAPart(part, flags)
  const stored = part.label?.colour ?? 'blue'
  return {
    name: part.name ?? flag?.name ?? part.label?.text ?? '',
    flagColour: flag?.colour ?? stored,
    wordsColour: flag?.wordsColour ?? stored,
  }
}

/**
 * THE BODY WITH EACH MARKED RUN IN ITS FLAG'S WORDS COLOUR and the flag's own colour beneath it, and every other
 * character exactly as it was written. It is a plain run and not Markdown: a part names characters in the stored body,
 * and Markdown changes which characters are drawn where, so drawing a marked body through the Markdown renderer would
 * put the colour on words nobody marked. Line breaks are kept as written.
 */
export function MarkedWords({ body, parts, flags }: {
  body: string
  parts: readonly AMarkedPartToDraw[]
  flags: TheFlagsOfAPerson
}): React.JSX.Element {
  return (
    <div className="px-chat-marked-words" data-marked-words="yes">
      {runsOfMarkedWords(body, parts as readonly AMarkedPart[]).map((run, at) => {
        if (run.part === null) return <Fragment key={at}>{run.quote}</Fragment>
        const drawing = theDrawingOfAPart(run.part, flags)
        return (
          <span
            key={at}
            className="px-chat-marked px-label-ink"
            data-words-colour={drawing.wordsColour}
            data-flag-colour={drawing.flagColour}
            data-flag-name={drawing.name}
            data-from={run.from}
            data-to={run.to}
            title={drawing.name === '' ? undefined : drawing.name}
          >
            {run.quote}
          </span>
        )
      })}
    </div>
  )
}

/**
 * THE BUBBLE'S FOOT: how many parts the message has, or nothing when it has none, and beside it how many of them are
 * not shown in the words, when any are not.
 */
export function MarkedPartCount({ parts, notShown = 0 }: { parts: readonly AMarkedPartToDraw[]; notShown?: number }): React.JSX.Element | null {
  if (parts.length === 0) return null
  return (
    <>
      <span className="px-chat-marked-count" data-marked-parts={parts.length}>
        {t('chat.markedPartsCount', { n: parts.length })}
      </span>
      {notShown > 0 ? (
        <span className="px-chat-marked-not-shown" data-not-shown={notShown}>
          {t('chat.markedPartsNotShown', { n: notShown })}
        </span>
      ) : null}
    </>
  )
}

/**
 * THE SAME MARKS OVER THE WORDS BEING TYPED. The plain box cannot colour a run inside itself, so a layer with the same
 * font, padding and wrapping sits over it: every character is drawn there, the unmarked ones in transparent ink and
 * the marked ones in their flag's words colour. It takes no pointer, because the person is typing into the box beneath.
 */
export function MarkedWordsPaint({ body, parts, flags }: {
  body: string
  parts: readonly AMarkedPartToDraw[]
  flags: TheFlagsOfAPerson
}): React.JSX.Element | null {
  if (parts.length === 0) return null
  return (
    <div className="px-chat-box px-chat-mark-paint" aria-hidden="true">
      {runsOfMarkedWords(body, parts as readonly AMarkedPart[]).map((run, at) => {
        if (run.part === null) return <span key={at}>{run.quote}</span>
        const drawing = theDrawingOfAPart(run.part, flags)
        return (
          <span
            key={at}
            className="px-chat-marked px-label-ink"
            data-words-colour={drawing.wordsColour}
            data-flag-colour={drawing.flagColour}
            data-flag-name={drawing.name}
            data-from={run.from}
            data-to={run.to}
          >
            {run.quote}
          </span>
        )
      })}
    </div>
  )
}
