// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ID WORKED OUT FROM A HASH, beginning with a letter or a digit (decision cvQAUoJTDYbB, wave 13y round 6).
 *
 * The decision says every id the office makes begins with a letter or a digit, never a dash: an id that began with -p
 * had the shape of a password glued to -p, and an id that begins with a dash is read as an option by a command-line
 * tool. Most ids are drawn at random. The import's revision ids are not: each is the hash of what makes the row what it
 * is, so the same database and the same archive name the same row (`keepTheLedgerTrue` in src/server/lib/import.ts).
 *
 * So the id is the hash's first 12 characters in base64url, as it was. Only when the first of them is a dash or an
 * underscore is it replaced, by one of the 62 letters and digits chosen from four later bytes of the same hash, which the
 * 12 characters do not use. The same hash therefore always gives the same id, and an id that already began with a letter
 * or a digit is unchanged. Which characters an id may begin with is said once, in src/server/lib/ids.ts, for both kinds
 * of id (wave 13w round 7).
 */
import { AN_IDS_FIRST_CHARACTERS, beginsAsAnOfficeId } from './ids.ts'

/** The 12-character id of `digest`, a hash of at least 13 bytes, beginning with a letter or a digit. */
export function anIdFromAHash(digest: Buffer): string {
  if (digest.length < 13) throw new Error(`An id from a hash needs at least 13 bytes of hash; this one has ${String(digest.length)}.`)
  const id = digest.toString('base64url').slice(0, 12)
  if (beginsAsAnOfficeId(id)) return id
  // 12 base64url characters are the first 9 bytes, so bytes 9 to 12 are not in the id.
  return AN_IDS_FIRST_CHARACTERS.charAt(digest.readUInt32BE(9) % AN_IDS_FIRST_CHARACTERS.length) + id.slice(1)
}
