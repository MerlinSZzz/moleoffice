// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE FIRST BYTES OF A FILE SAY IT IS, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHO ASKS
 * ---------------------------------------------------------------------------------------
 *
 * Three readers ask this question, and before this file each one held its own list:
 *
 *   1. The avatar and message-picture doors (`pictureTypeOf` in src/server/lib/avatars.ts), which
 *      take a png, a jpeg or a webp and nothing else.
 *   2. The returned-file door (src/server/lib/returnedfiles.ts), which takes a zip and nothing else.
 *   3. The checker a changeset of files passes before it lands in the main world
 *      (tools/checks/files-changeset.mjs), which compares what the bytes say with what the name
 *      says.
 *
 * One list here means a signature learned for one reader is learned for all three (invariant 9 of
 * USER.md: one fact is worked out in one place).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * It reads the first bytes and nothing else. It does not decode a picture or parse a document; the
 * checker does that separately, and only for the types it has a reader for.
 *
 * A zip is recognised by its four-byte signature and is never opened. That is the promise
 * src/server/lib/returnedfiles.ts makes and that nothing in Mole Office breaks: no reader, no
 * preview, no route and no test reads what is inside a returned zip.
 *
 * Nothing here touches node. It takes a `Uint8Array`, which a node `Buffer` is, so the server, the
 * tools and the browser can all import it.
 */

/**
 * EVERY TYPE THIS FILE CAN RECOGNISE, WITH THE FILE-NAME EXTENSIONS THAT CLAIM IT.
 *
 * The extensions are lower case and have no dot. The first one is the one Mole Office writes when
 * it names a file itself (`UPLOADABLE_AVATAR_TYPES` in src/shared/participants.ts writes `jpg`).
 */
export const SIGNED_TYPES = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** A type the first bytes of a file can be recognised as. */
export type SignedType = keyof typeof SIGNED_TYPES

/** Whether `bytes` holds exactly `expected` starting at `at`. */
function holdsAt(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (bytes.length < at + expected.length) return false
  return expected.every((value, index) => bytes[at + index] === value)
}

/** The character codes of a plain ASCII word, for the signatures that are words. */
function ascii(word: string): number[] {
  return [...word].map((character) => character.charCodeAt(0))
}

/**
 * THE THREE SIGNATURES A ZIP MAY BEGIN WITH, in the order a reader meets them.
 *
 * Three and not one, because all three really are zip, and a door that called an empty archive or
 * a spanned one "not a zip" would be refusing a zip while saying it is not one. `PK\x03\x04` is the
 * local file header an archive with at least one entry starts with, which is nearly every file;
 * `PK\x05\x06` is the end-of-central-directory record an archive with no entries starts with;
 * `PK\x07\x08` is the data descriptor a spanned archive starts with.
 */
const ZIP_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
]

/**
 * What the first bytes of a file say it is, or null when they say none of the types above.
 *
 * Null is an answer, not a failure: most files (text, source code, data) carry no signature at all.
 */
export function typeOfBytes(bytes: Uint8Array): SignedType | null {
  if (holdsAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (holdsAt(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (holdsAt(bytes, 0, ascii('RIFF')) && holdsAt(bytes, 8, ascii('WEBP'))) return 'image/webp'
  if (holdsAt(bytes, 0, ascii('GIF87a')) || holdsAt(bytes, 0, ascii('GIF89a'))) return 'image/gif'
  if (holdsAt(bytes, 0, ascii('%PDF-'))) return 'application/pdf'
  if (ZIP_SIGNATURES.some((signature) => holdsAt(bytes, 0, signature))) return 'application/zip'
  return null
}

/**
 * Which type a file-name extension claims, or null when it claims none of the types above.
 *
 * `extension` may carry its dot or not, in any case: `.JPG`, `jpg` and `jpeg` all claim a jpeg.
 */
export function typeOfExtension(extension: string): SignedType | null {
  const bare = extension.replace(/^\./u, '').toLowerCase()
  for (const [type, extensions] of Object.entries(SIGNED_TYPES) as [SignedType, readonly string[]][]) {
    if (extensions.includes(bare)) return type
  }
  return null
}
