// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKLIST ITEM'S WORDS, WITH THE RECORDS AND PAGES THEY NAME AS LINKS (wave 13y round 138, item 74 part c).
 *
 * The words are split as the chat splits a message's body (piecesOfBody in src/shared/messages.ts). An id becomes a link
 * only when the checklist's reading lists it as found: the server lists an id written only in the words when this reader
 * may open what it names (theRecordsTheItemsName in src/server/lib/checklists.ts). Any other id stays the words it is.
 * A page address becomes a link to that page.
 *
 * A PRESS ON THE WORDS AROUND THE LINKS STILL OPENS THE ITEM'S FACTS, as it did. A press on a link goes to its page and
 * does not open them, because a link inside a summary is followed instead of toggling it.
 */
import { Fragment } from 'react'

import type { ChecklistLinked } from '@shared/checklists.ts'
import { content, t } from '@shared/i18n.ts'
import { piecesOfBody } from '@shared/messages.ts'
import type { RecordKind } from '@shared/types.ts'
import { recordPath, RouteLink } from '../components/router.tsx'

type FoundLinked = Extract<ChecklistLinked, { found: true }>

function theFoundOnes(linked: readonly ChecklistLinked[] | undefined): Map<string, FoundLinked> {
  return new Map((linked ?? []).flatMap((one) => (one.found ? [[one.id, one] as const] : [])))
}

/** The item's words, with each held record it names as a link titled by the record, and each page address as a link. */
export function TheItemsWords({ words, linked }: { words: string; linked: readonly ChecklistLinked[] | undefined }) {
  const found = theFoundOnes(linked)
  return (
    <>
      {piecesOfBody(words).map((piece, at) => {
        if (piece.what === 'record') {
          const one = found.get(piece.recordId)
          if (one === undefined) return <Fragment key={at}>{piece.text}</Fragment>
          return (
            <RouteLink key={at} to={recordPath(one.id, one.kind as RecordKind)}>
              {content(one.title)}
            </RouteLink>
          )
        }
        if (piece.what === 'page') {
          return (
            <a key={at} href={piece.path}>
              {t('chat.openPage')}
            </a>
          )
        }
        return <Fragment key={at}>{piece.text}</Fragment>
      })}
    </>
  )
}

/** The entries of a checklist's reading that the item's words draw as links, for what the row is said to draw. */
export function theLinksInTheWords(words: string, linked: readonly ChecklistLinked[]): FoundLinked[] {
  const found = theFoundOnes(linked)
  return piecesOfBody(words).flatMap((piece) => {
    const one = piece.what === 'record' ? found.get(piece.recordId) : undefined
    return one === undefined ? [] : [one]
  })
}
