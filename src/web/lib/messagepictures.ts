// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW THIS BROWSER DRAWS A PICTURE INSIDE A MESSAGE, remembered between visits.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS AND WHERE THE WORDS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M64: three answers to choose from, which draw a picture at once, after a press, or only
 * as its path. The three answers, their stored words and their names on screen are in
 * `@shared/messagepictures.ts`, because the conversation, the pool page and the settings panel all
 * name the same three and two lists would drift. This file is where the answer is KEPT.
 *
 * ---------------------------------------------------------------------------------------
 * IT FOLLOWS THE PERSON, NOT THIS BROWSER, SINCE 7 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * It was built as a setting of the browser, in localStorage, because M64's own words say "this
 * browser". Decision rJphPkCG3l7X settled the other way: it follows the person, like every other
 * choice about how their chat is drawn — `messageLinkLevel`, `messageLinkLayout` and the project mark
 * are all on their registry row. Their reason is that they read the same chat from two machines and do
 * not want to set it twice.
 *
 * SO THIS FILE IS NO LONGER WHERE THE ANSWER IS KEPT. It is where the answer this browser has been
 * TOLD is held, so that everything drawing a picture can read it without each of them fetching the
 * person's row. The registry row is the durable one, `saySomebodyChose` is how a read of that row
 * reaches this, and `chooseMessagePictures` writes it back through the participant door.
 *
 * NOTHING A BROWSER ALREADY REMEMBERED IS COPIED UP. A stored answer under the old key is left
 * where it is and is not read: copying it would say they had chosen on this machine what they may have
 * chosen differently on another, and this product does not invent an answer for somebody.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT BROADCASTS WHEN QUEUEVIEW DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The Waiting-on-you page reads its setting once when it is drawn, which is enough, because the
 * control is on another page and getting back to the page re-draws it. The chat panel is not
 * another page: it floats over every one of them, INCLUDING the Settings page where this control
 * is. A person moving this control would watch the conversation behind it not change, which reads
 * as a control that does nothing. So the answer is announced and the panel re-draws.
 */

import { useSyncExternalStore } from 'react'

import { MESSAGE_PICTURE_BY_DEFAULT, type MessagePictureChoice } from '@shared/messagepictures.ts'
import { THE_PERSON } from '@shared/person.ts'
import { api, errorMessage } from '../api.ts'
import { makeBroadcast } from './store.ts'

const broadcast = makeBroadcast()

/**
 * WHAT THIS BROWSER HAS BEEN TOLD THEY CHOSE, or the default because nobody has read their row yet.
 *
 * The default rather than nothing, because something has to be drawn before the first read comes
 * back, and `MESSAGE_PICTURE_BY_DEFAULT` is the answer M64 set for somebody who has never chosen.
 */
let chosen: MessagePictureChoice = MESSAGE_PICTURE_BY_DEFAULT
let fault: string | null = null

/** How this person last asked for a picture in a message to be drawn. */
export function messagePictureChoice(): MessagePictureChoice {
  return chosen
}

/** What went wrong writing it down, or null because nothing did. */
export function messagePictureFault(): string | null {
  return fault
}

/**
 * A READ OF THE PERSON'S REGISTRY ROW SAYS WHAT THEY CHOSE, and this holds it for everything that draws.
 *
 * Null is what the row holds when they have never chosen, and it is read as the default rather than
 * kept as a third answer — the same shape every other setting on that row has.
 */
export function saySomebodyChose(said: MessagePictureChoice | null): void {
  const next = said ?? MESSAGE_PICTURE_BY_DEFAULT
  if (next === chosen) return
  chosen = next
  broadcast.announce()
}

/**
 * Choose, and say when the write was refused.
 *
 * IT APPLIES FIRST AND IS WRITTEN SECOND, so what is on the screen never depends on the round trip.
 * When the write fails the panel says so in the server's own words, and the choice on the screen is
 * the one that will be gone after a reload.
 */
export function chooseMessagePictures(next: MessagePictureChoice): void {
  chosen = next
  fault = null
  broadcast.announce()
  void api.changeParticipant('person', THE_PERSON, { messagePictures: next }).catch((err: unknown) => {
    fault = errorMessage(err)
    broadcast.announce()
  })
}

/** How a picture in a message is drawn, re-drawing the component when somebody changes it. */
export function useMessagePictures(): MessagePictureChoice {
  return useSyncExternalStore(broadcast.subscribe, messagePictureChoice, messagePictureChoice)
}

/** The same, with whatever went wrong remembering it — what the settings panel draws. */
export function useMessagePicturesWithFault(): { choice: MessagePictureChoice; fault: string | null } {
  const choice = useSyncExternalStore(broadcast.subscribe, messagePictureChoice, messagePictureChoice)
  const said = useSyncExternalStore(broadcast.subscribe, messagePictureFault, messagePictureFault)
  return { choice, fault: said }
}
