// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S CONTACT LIST AS THE PAGE HOLDS IT, A PAGE AT A TIME.
 *
 * The chat corner reads the first screen of contacts, and more as the person scrolls, instead of the whole list. A
 * decision chose that. `GET /api/messages/contact-list` answers one page of the list in the
 * order it is drawn (`theRowsOnTopInDrawnOrder` in src/shared/contacts.ts). The page keeps every page it has read in
 * one list of rows, the folded rows among them, because that is the shape the events code moves rows in
 * (src/web/lib/chatdeltas.ts).
 *
 * THE ROWS HELD ARE ALWAYS THE FIRST ROWS OF THE LIST. A page starts where the rows held end, and a read after an
 * event reads again as many rows as are held, from the first, so the person's place in the list is kept.
 */

import { CONTACT_LIST_MOST, CONTACT_LIST_PAGE, theRowsOnTopInDrawnOrder } from '@shared/contacts.ts'
import type { ContactListCounts, ContactListHeld, ContactListPage } from '../api.ts'

/** What narrows the list: the words typed in the filter box, and the project chosen above the list. */
export interface TheNarrowing {
  name: string
  project: string | null
}

/** Whether a page, or the list held, was read under this narrowing. The door trims the words, and none is null. */
export function readUnder(list: Pick<ContactListCounts, 'name' | 'project'>, narrowing: TheNarrowing): boolean {
  return (list.name ?? '') === narrowing.name.trim() && list.project === narrowing.project
}

/** One page read from the first row, as the page holds it. */
export function theContactListAsHeld(page: ContactListPage): ContactListHeld {
  const { folded, returned: _returned, next: _next, ...held } = page
  return { ...held, contacts: [...page.contacts, ...folded] }
}

/**
 * THE ROWS HELD WITH THE NEXT PAGE AFTER THEM. A row already held is replaced by the one just read, where it stands.
 * Everything the page says about the whole list (the counts, the groups, the number on the circle) is the newer page's.
 */
export function withTheNextPage(held: ContactListHeld, page: ContactListPage): ContactListHeld {
  const read = [...page.contacts, ...page.folded]
  const newer = new Map(read.map((one) => [one.key, one]))
  const kept = held.contacts.map((one) => newer.get(one.key) ?? one)
  const had = new Set(held.contacts.map((one) => one.key))
  const { folded: _folded, returned: _returned, next: _next, ...said } = page
  return { ...said, contacts: [...kept, ...read.filter((one) => !had.has(one.key))] }
}

/** How many rows drawn on top are held, which is where the next page starts. */
export function theRowsOnTopHeld(held: ContactListHeld): number {
  return theRowsOnTopInDrawnOrder(held.contacts, held.contactGroups, held.contactSides).length
}

/**
 * HOW MANY ROWS A READ FROM THE FIRST ROW ASKS FOR: as many as are held, so a read after an event keeps the person's
 * place, and never fewer than one page or more than the door answers.
 */
export function howManyToReadAgain(held: ContactListHeld | null): number {
  const onTop = held === null ? 0 : theRowsOnTopHeld(held)
  return Math.min(CONTACT_LIST_MOST, Math.max(CONTACT_LIST_PAGE, onTop))
}

/**
 * THE READ FROM THE FIRST ROW: as many rows as are held when they were read under the same narrowing, and one page when
 * the narrowing has changed, because the rows held then say nothing about how far the person has scrolled.
 */
export function theReadFromTheTop(held: ContactListHeld | null, narrowing: TheNarrowing) {
  const same = held !== null && readUnder(held, narrowing) ? held : null
  return { limit: howManyToReadAgain(same), offset: 0, name: narrowing.name, project: narrowing.project }
}
