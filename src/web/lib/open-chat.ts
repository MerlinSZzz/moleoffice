// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { participantKey, unregisteredKey, type UnregisteredWriter } from '@shared/messages.ts'
import type { ParticipantKind } from '@shared/participants.ts'
export const OPEN_AT = 'mole-office.chat.open-at'
/** The optional project chooses where a new message will be filed, without moving the page. */
export function openTheChatAt(who:{kind:ParticipantKind;id:string},workspaceId?:string):void {
  const key=participantKey(who)
  window.dispatchEvent(new CustomEvent(OPEN_AT,{detail:workspaceId===undefined?key:{key,workspaceId}}))
}

/**
 * OPEN THE PANEL AT ONE WRITER NOBODY REGISTERED, from another page.
 *
 * M25 gave such a writer a conversation of its own, and until now the Messages page could not
 * offer it: `theOtherSide` there answered a participant reference or nothing, and a writer nobody
 * registered is neither. Criterion M27, the gap Builder AZ named.
 *
 * IT IS THE SAME EVENT, carrying the same kind of key. `unregisteredKey` and `participantKey`
 * cannot collide — every unregistered key begins with `unregistered:` — so the panel reads whichever
 * arrived and opens the right conversation.
 *
 * THE RIGHT-CLICK PANEL SENDS ITS READERS HERE TOO. A writer nobody registered is neither a person
 * nor a registered agent, so the contact chooser's row cannot answer in place; the conversation in
 * the chat is where the words wait, and this is the one press into it. Criterion W4.
 */
export function openTheChatAtUnregistered(writer: UnregisteredWriter): void {
  window.dispatchEvent(new CustomEvent(OPEN_AT, { detail: unregisteredKey(writer) }))
}

/**
 * OPEN THE PANEL AT ONE GROUP, from another page. Criterion E2.
 *
 * A MESSAGE'S OWN PAGE SAYS WHICH CONVERSATION OR GROUP IT BELONGS TO AND OFFERS ONE PRESS THAT
 * OPENS THE CHAT THERE. The panel already knows how to show a group; what was missing was a door
 * from another page onto it. `openTheChatAt` above carries a participant key and
 * `openTheChatAtUnregistered` carries a writer's key, and every unregistered key begins
 * `unregistered:` so neither can collide with this prefix. The prefix lives here and is read back
 * here, so the producer and the consumer cannot come to different spellings of it.
 */
export const GROUP_OPEN_PREFIX = 'group:'
export function groupOpenKey(id: string): string {
  return `${GROUP_OPEN_PREFIX}${id}`
}
/** The group id out of an open-at key, or null because it names a participant or a writer instead. */
export function groupFromOpenKey(key: string): string | null {
  return key.startsWith(GROUP_OPEN_PREFIX) ? key.slice(GROUP_OPEN_PREFIX.length) : null
}
/**
 * OPEN THE PANEL AT ONE GROUP, and at one message in it when a message is named.
 *
 * Criterion GM2: the short line saying which group a forwarded reply came from carries one press,
 * and that press opens the group AT that message. The group id travels in the key every other
 * group press already uses; the message id travels beside it, and the panel scrolls to it once the
 * group has been read. Naming no message opens the group at its newest line, as before.
 */
export function openTheChatAtGroup(id: string, messageId?: string): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_AT, {
      detail: messageId === undefined ? groupOpenKey(id) : { key: groupOpenKey(id), message: messageId },
    }),
  )
}
