// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A ROLE CARD'S PORTRAIT LIVES, AND THE ADDRESS IT IS SERVED AT. The shape only.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P47 of design/permissions/ACCEPTANCE.md section 8: three portraits per role, in one style,
 * and the person or agent holding the card picks one of their three.
 *
 * ---------------------------------------------------------------------------------------
 * TWO PLACES, AND THE SECOND ONE NEVER LEAVES THIS MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * A ROLE'S THREE are `design/portraits/<role>/<role>-1.png` and -2 and -3, in the checkout, and they
 * are the same three for everybody holding that card.
 *
 * A CUSTOM ONE is `data/portraits/custom/<who>/<name>.png` and it is that person's own. It sits in a
 * folder of its own, and it is not uploaded. `data/` is in
 * .gitignore, so nothing here is ever committed and nothing is ever sent anywhere: the browser asks
 * this machine's own API for the bytes, exactly as it does for an avatar.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ADDRESS IS BUILT HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * The address is stored on a record — the `portrait` field of a `role_card` — and it is drawn by a
 * page, written by a tool and served by a route. Four places, one spelling. If any of them typed it
 * out the four would drift and the picture would 404 on whichever of them was wrong.
 *
 * NOTHING HERE READS A DISK. Which pictures exist is a question about a machine, and the server
 * answers it: `src/server/lib/portraits.ts` lists the folders and reads the bytes. This file holds
 * the vocabulary the browser and the server share, for the reason `src/shared/roles.ts` does.
 */

/** The two places a portrait may come from. There is no third. */
export const PORTRAIT_SETS = ['role', 'custom'] as const

export type PortraitSet = (typeof PORTRAIT_SETS)[number]

export function isAPortraitSet(value: unknown): value is PortraitSet {
  return typeof value === 'string' && (PORTRAIT_SETS as readonly string[]).includes(value)
}

/** Which folder under `public/portraits` holds a role's three. One place, so nothing spells it twice. */
export const PORTRAITS_IN_THE_CHECKOUT = 'public/portraits'

/** Which folder holds the pictures somebody keeps for themselves. Never committed; see the head. */
export const PORTRAITS_KEPT_HERE = 'data/portraits/custom'

/**
 * WHAT A NAME MAY BE: letters, digits, dash, dot and underscore, and nothing else.
 *
 * It is what keeps a request naming a folder or a parent out of the reader. `..` cannot be written
 * without a slash, and a slash is not in this set — so the check is on the shape of the name rather
 * than on normalising a path afterwards, which is the rule src/server/api/files.ts states.
 */
const A_PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/

export function isAPlainPortraitName(value: unknown): value is string {
  return typeof value === 'string' && A_PLAIN_NAME.test(value) && !value.includes('..')
}

/**
 * THE ADDRESS ONE PORTRAIT IS SERVED AT. The one spelling, read by the page, the tool and the route.
 *
 * `of` is the role for a role portrait and the person for a custom one; `name` is the file's own
 * name without its extension, as it is on the disk.
 */
export function portraitAddress(set: PortraitSet, of: string, name: string): string {
  return `/api/portraits/${set}/${encodeURIComponent(of)}/${encodeURIComponent(name)}`
}

/**
 * HOW WIDE A PORTRAIT'S SMALL COPY IS: twice the widest a page draws one, which is the Role cards
 * page's 156 pixels, so it is sharp on a screen of two pixels to the point.
 */
export const SMALL_PORTRAIT_WIDTH = 320

/**
 * THE ADDRESS OF A PORTRAIT'S SMALL COPY, which is what a page draws. The address stored on a card is
 * the picture's own and stays so; this adds `?size=small` when it is drawn, and the server makes the
 * copy (src/server/lib/portraits.ts). An address that is not a portrait's is given back unchanged.
 */
export function smallPortrait(address: string): string {
  return address.startsWith('/api/portraits/') && !address.includes('?') ? `${address}?size=small` : address
}

/**
 * THE PORTRAIT A ROLE HAS UNTIL SOMEBODY CHOOSES ANOTHER: the first of its three.
 *
 * A default is not a choice, and every screen that draws one says which it is drawing. What this
 * gives is a picture on every card from the moment the card is copied, rather than an empty frame
 * that reads as "this role has no portrait".
 */
export function theFirstPortraitOf(role: string): string {
  return portraitAddress('role', role, `${role}-1`)
}

/** One portrait on offer: where it comes from, whose it is, its name and its address. */
export interface PortraitOnOffer {
  set: PortraitSet
  of: string
  name: string
  address: string
}
