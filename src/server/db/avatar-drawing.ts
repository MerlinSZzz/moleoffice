// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE ASSET ROW SENDS, worked out from the row and the folder its database is in, by a module that opens no
 * database. src/server/lib/avatars.ts reads the row from the office's own database, sends what this answers, and says
 * in its own words why when it sends nothing. The re-mint's read-only check (src/server/db/remint-verification.ts)
 * reads the row from a store it opened read-only and immutable, and asks the same question here, so the two cannot
 * answer it differently. It cannot import avatars.ts: that opens the configured database for writing (src/server/db/client.ts),
 * which a verifier may not do.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GENERATED_AVATAR_MIME, defaultAvatarAssetId, type ParticipantRef } from '@shared/participants.ts'

// ============================================================================ the drawing

/**
 * The digest a participant's drawn face is made of, as 64 lowercase hex digits, worked out from its kind and id and
 * from nothing else. The drawing reads it, and so does the re-mint, which keeps it on a face it renames to a new id
 * (src/server/lib/registry-aliases/remint-faces.ts), so the two cannot work it out differently.
 *
 * SHA-256 rather than a hand-rolled hash: it is in the standard library, it spreads two ids that
 * differ by one character across the whole space, and a hand-rolled one would be a second thing to
 * get right for no gain.
 */
export function theDigestADrawingIsMadeOf(who: ParticipantRef): string {
  // Joined rather than interpolated, for the reason `defaultAvatarAssetId` gives: this is a key
  // and never drawn text, and a template literal holding `who.kind` reads to the machine-word gate
  // exactly like a stored word arriving on a screen with nothing turning it into English.
  return createHash('sha256').update([who.kind, who.id].join(':')).digest('hex')
}

/** The numbers a picture is made of: the bytes of its digest, and nothing else. */
function numbersFor(digest: string): number[] {
  return [...Buffer.from(digest, 'hex')]
}

/** A readable colour from one byte: full saturation, fixed lightness, so every one of them reads. */
function hueOf(byte: number, lightness: number): string {
  return `hsl(${String(Math.round((byte / 255) * 360))} 62% ${String(lightness)}%)`
}

/** The picture for one participant, as an SVG document. */
export function drawDefaultAvatar(who: ParticipantRef): string {
  return theDrawingOf(theDigestADrawingIsMadeOf(who))
}

/**
 * The picture a digest gives, as an SVG document.
 *
 * THE SAME DIGEST ALWAYS GIVES THE SAME PICTURE. Everything below reads `numbersFor(digest)` and
 * nothing else, so this function has no state, no clock and no randomness in it at all.
 */
function theDrawingOf(digest: string): string {
  const n = numbersFor(digest)
  const back = hueOf(n[0] ?? 0, 30)
  const front = hueOf(n[1] ?? 0, 78)
  const cells: string[] = []
  // FIVE COLUMNS AND FIVE ROWS, mirrored down the middle: columns 0 and 4 are the same, 1 and 3 are
  // the same, and column 2 stands alone. Fifteen decisions, one byte each, taken from the digest.
  let at = 2
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const on = ((n[at] ?? 0) & 1) === 1
      at += 1
      if (!on) continue
      const columns = column === 2 ? [2] : [column, 4 - column]
      for (const x of columns) {
        cells.push(`<rect x="${String(14 + x * 12)}" y="${String(14 + row * 12)}" width="12" height="12" />`)
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="88" height="88" role="img" ` +
    `aria-label="A pattern drawn for this participant">` +
    `<circle cx="44" cy="44" r="44" fill="${back}" />` +
    `<g fill="${front}">${cells.join('')}</g>` +
    `</svg>`
  )
}

/** Which participant a drawn picture is for, read back out of its id, or null when it is not one. */
export function participantOfDefault(assetId: string): ParticipantRef | null {
  for (const kind of ['person', 'agent'] as const) {
    const prefix = defaultAvatarAssetId({ kind, id: '' })
    if (assetId.startsWith(prefix) && assetId.length > prefix.length) {
      return { kind, id: assetId.slice(prefix.length) }
    }
  }
  return null
}

// ============================================================================ what a row sends

/**
 * One asset as `GET /api/assets/:id` sends it: a drawing, or the file an upload is kept in, which the route sends
 * from the file and does not read whole first (wave 13y round 34).
 */
export type AvatarToSend = { mime: string; cacheControl: string } & ({ drawing: string } | { file: string })

/**
 * Why a row sends nothing: no row, a drawing whose id names nobody, an upload whose row names no file, or one whose file
 * is not there, with the path the row names.
 */
export type NothingIsSent = { refused: 'no-row' } | { refused: 'drawn-for-nobody' } | { refused: 'no-file-named' } | { refused: 'file-not-there'; stored: string }

/** One asset row's drawing or file, or why it sends nothing. Nothing stands in for a file that is not there. */
export function whatAnAssetRowSends(row: Record<string, unknown> | undefined, assetId: string, dataFolder: string): AvatarToSend | NothingIsSent {
  if (row === undefined) return { refused: 'no-row' }
  if (row['origin'] === 'default') {
    const who = participantOfDefault(assetId)
    if (who === null) return { refused: 'drawn-for-nobody' }
    // Drawn from the digest the row keeps when the re-mint renamed it to a new id, and otherwise from the participant
    // its id names (migration 0337).
    const digest = typeof row['drawn_from'] === 'string' ? row['drawn_from'] : theDigestADrawingIsMadeOf(who)
    // A DRAWING IS THE SAME FOREVER under its id, so a browser may keep it for a year. The re-mint renames a face only
    // to an id no row holds, and the face keeps its picture, so an id never comes to send a different one.
    return { drawing: theDrawingOf(digest), mime: GENERATED_AVATAR_MIME, cacheControl: 'public, max-age=31536000, immutable' }
  }
  const stored = typeof row['path'] === 'string' ? row['path'] : ''
  if (stored === '') return { refused: 'no-file-named' }
  const file = join(dataFolder, stored)
  if (!existsSync(file)) return { refused: 'file-not-there', stored }
  return {
    file,
    mime: String(row['mime']),
    // Sharing never changes the bytes behind an existing asset id.
    cacheControl: 'public, max-age=31536000, immutable',
  }
}
