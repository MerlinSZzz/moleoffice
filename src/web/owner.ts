// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO OWNS THIS OFFICE, AS THE BROWSER LEARNS IT: asked of the server before the app draws.
 *
 * The owner is a setting in the office's own database (src/server/lib/owner.ts), so the bundle
 * cannot know it; the browser asks GET /api/office/owner. src/web/main.tsx calls `loadTheOwner`
 * BEFORE it loads any of the app's own modules, and only then loads the app. So there is no moment
 * when a page is on screen and the browser does not know who it is, which is reason THREE in
 * @shared/person.ts: a governance click made then would be refused for naming nobody.
 *
 * WHAT IT HOLDS. The whole answer: id, name (null while nobody gave one), named, the placeholder
 * in the reader's language, and the guide's address. It also tells @shared/person.ts the id, which
 * is what `THE_PERSON` reads everywhere in the app.
 *
 * KEPT ON `globalThis`, under one symbol, for the reason @shared/person.ts gives: a test runner may
 * load this module more than once in one process. A browser tab has one page and one office.
 */

import { theOwnerIsKnown } from '@shared/person.ts'
import type { TheOfficeOwner } from '@shared/owner.ts'
import { theApiUrlFor } from './lib/api-address.ts'
import { noteAnUnprovedIdentity } from './lib/unpaired.ts'

const HELD = Symbol.for('mole-office.the-owner-as-the-server-said')

function held(): TheOfficeOwner | null {
  const value = (globalThis as Record<symbol, unknown>)[HELD]
  return value === undefined ? null : (value as TheOfficeOwner)
}

/**
 * The browser now knows who owns this office. Called by `loadTheOwner` with the server's answer, by
 * `theOwnerWasNamed` after the guide names them, and by the test setup that says whose office a test
 * office is. Nothing else calls it.
 */
export function theOwnerIs(owner: TheOfficeOwner): void {
  ;(globalThis as Record<symbol, unknown>)[HELD] = owner
  theOwnerIsKnown(owner.id)
}

/**
 * The owner as the server last said. Throws when nobody has asked yet, which would mean something ran
 * before src/web/main.tsx asked: a guess here would be the defect @shared/person.ts exists to prevent.
 */
export function theOwner(): TheOfficeOwner {
  const owner = held()
  if (owner === null) {
    throw new Error(
      'The browser app asked who owns this office before it had asked the server. src/web/main.tsx asks first, ' +
        'with loadTheOwner, and loads the app only after the answer.',
    )
  }
  return owner
}

/** The guide named the owner: hold the server's new answer, so every page reads the name at once. */
export function theOwnerWasNamed(answer: TheOfficeOwner): void {
  theOwnerIs(answer)
}

/**
 * THE OFFICE COULD NOT BE REACHED AT ALL: the fetch itself failed, rather than the office answering. The page can say
 * so in its own words (index.html's boot notice) instead of drawing the browser's connection sentence in place of the
 * app. main.tsx asks `theOfficeCouldNotBeReached`; the address is kept so the page can name the office it tried.
 */
export class TheOfficeCouldNotBeReached extends Error {
  readonly theOfficeCouldNotBeReached = true
  constructor(message: string, readonly where: string) { super(message) }
}

export function theOfficeCouldNotBeReached(err: unknown): err is TheOfficeCouldNotBeReached {
  return typeof err === 'object' && err !== null &&
    (err as { theOfficeCouldNotBeReached?: unknown }).theOfficeCouldNotBeReached === true
}

/**
 * Ask the server who owns this office, in the reader's language, and hold the answer. Throws a
 * sentence when the server does not answer with an owner; main.tsx draws that sentence instead of
 * the app.
 */
export async function loadTheOwner(language: string | null): Promise<TheOfficeOwner> {
  const query = language === null ? '' : `?language=${encodeURIComponent(language)}`
  const url = theApiUrlFor(`/api/office/owner${query}`)
  // THE APP'S REQUEST MODULE, LOADED HERE AND NOT AT THE TOP: a test process loads this file in its
  // setup (tests/a-page-of-a-test-office.ts), and loading the request module there would load it before
  // a test has put its stand-in window in place.
  const { askWhoOwnsTheOffice } = await import('./api.ts')
  let reply: Response
  try {
    reply = await askWhoOwnsTheOffice(query)
  } catch (err) {
    throw new TheOfficeCouldNotBeReached(`Mole Office could not ask its server who owns this office, at ${url}: ${err instanceof Error ? err.message : String(err)}`, url)
  }
  if (!reply.ok) {
    const body:unknown = await reply.clone().json().catch(() => null)
    if (typeof body === 'object' && body !== null && 'code' in body) noteAnUnprovedIdentity(body.code)
    throw new Error(`Mole Office asked its server who owns this office, at ${url}, and it answered ${String(reply.status)}.`)
  }
  const answer = (await reply.json()) as Partial<TheOfficeOwner>
  if (typeof answer.id !== 'string' || answer.id === '' || typeof answer.named !== 'boolean' || typeof answer.placeholder !== 'string') {
    throw new Error(`Mole Office asked its server who owns this office, at ${url}, and the answer did not say.`)
  }
  const owner = answer as TheOfficeOwner
  theOwnerIs(owner)
  return owner
}
