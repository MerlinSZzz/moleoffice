// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { storedFileChanged } from './storage/store.ts'
/**
 * TAKING A ZIP SOMEBODY BROUGHT BACK FROM OUTSIDE, AND PUTTING IT WHERE THIS PRODUCT CAN SERVE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16, point 5, of design/flows/ACCEPTANCE.md, and the ruling recorded there: an outside return may
 * be text, pictures or a zip.
 * Text is a record and pictures already have a door. A zip had nothing: this product has no door
 * that takes a file, and the only file-reading door serves a path some record already holds.
 *
 * So this is that one door and nothing else. It takes the bytes, writes them to a file beside the
 * pictures, and hands back the path. The record that points at the file is written by a later piece,
 * exactly as a message points at a picture — writing that record is not this door's work.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE ON DISK AND NOT BYTES IN THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * Because that is what a picture already is in this product. `ImageBlock` says it in one line:
 * *Mole Office points at it; it is never copied into the database.* A second way of holding bytes
 * would be a second set of rules about serving them, and `GET /api/file` — the careful one, with the
 * reference set and the roots — would not be the door for half of them. The directory is
 * `returned-files/`, a sibling of the picture door's `message-pictures/`, so the two ways in stand
 * side by side under the installation directory and a reader can see both.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE FILE GOES, AND WHY THE UPLOAD IS REFUSED WHEN THAT IS THE WRONG PLACE
 * ---------------------------------------------------------------------------------------
 *
 * It goes BESIDE THE DATABASE, for the reason `messagePictureDirectory` gives: bytes belong to the
 * database that points at them, and a scratch stack running on a temporary copy must not write into
 * the owner's own directory.
 *
 * `GET /api/file` will only read a file inside a preview root. So a returned file stored where no
 * preview root reaches would be a file accepted, stored, pointed at by a record, and impossible to
 * serve — accepted work that silently cannot be done, which is the first invariant. THE UPLOAD IS
 * THEREFORE REFUSED BEFORE ANY BYTES ARE WRITTEN, with a sentence naming the directory, the roots
 * and the variable that sets them. The check asks `previewRoots` and `inside` — the same two things
 * the reading door asks — rather than a second copy of the rule.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A ZIP, AND THE OFFICE NEVER OPENS IT
 * ---------------------------------------------------------------------------------------
 *
 * THE CHECK IS FOUR BYTES AND NOTHING ELSE. The first four bytes are read and compared with the
 * signatures a zip file can begin with — `PK\x03\x04` for an archive that carries entries,
 * `PK\x05\x06` for an archive with none, and `PK\x07\x08` for a spanned one. Anything else is
 * refused, and the refusal names the bytes it found instead. This check is what makes the sender's
 * claim about the file checkable at the door.
 *
 * THE CHECK IS NOT AN OPENING. The archive is never listed, never extracted, and never read past
 * those first four bytes. Nothing in Mole Office opens it, ever: no reader, no preview, no route
 * and no test of this product reads the contents. That sentence is the promise the whole door
 * rests on, and it is written here so a later reader can find it. The file is bytes the office
 * stores and serves back; what is in it is the outside worker's business and not this product's.
 *
 * ---------------------------------------------------------------------------------------
 * KEPT AS LONG AS THE RECORD THAT POINTS AT IT, AND NOTHING PRUNES IT
 * ---------------------------------------------------------------------------------------
 *
 * This is a ruling, and it means there is no setting for how long a returned file is kept. The
 * three numbers in src/shared/what-is-kept.ts are about database copies and request-log rows and
 * they do not move. NOTHING PRUNES THESE FILES, exactly as nothing prunes message pictures today,
 * and a file whose record is deleted stays on disk. Do not build a prune nobody asked for, and do
 * not pretend one exists.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The body arrives as base64, for the reason the picture door gives: there is no multipart parser
 * in this server and no dependency that gives one. `Buffer.from` never throws on bad base64 — it
 * drops what it cannot read — so the shape is checked before it is decoded here, and a body that is
 * not base64 is refused rather than decoded into a smaller file and stored under this door's name.
 *
 * NOTHING HERE SAYS WHO MAY SEND ONE, AND NOTHING HERE WRITES A RECORD. A returned file is served
 * only when a live record in this project points at it, which is `GET /api/file`'s confinement
 * contract; until that record exists the file is readable through no door at all.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { anOfficeId } from './ids.ts'
import { settingValue } from '../../config/settings.mjs'
import { PREVIEW_ROOTS_VAR, previewRoots, rootsSentence, whereAStoreIs, type StoreBesideTheDatabase } from './where-a-file-may-be-read.ts'
import { inside } from '@shared/path-inside.ts'
import { PanelError } from './panel-error.ts'
import { typeOfBytes } from '@shared/file-signatures.ts'

/** The directory a returned file is written into: `returned-files/`, beside the database. */
export const RETURNED_FILE_DIRECTORY = 'returned-files' satisfies StoreBesideTheDatabase

/** What a returned file IS: one zip, and never anything else. The one type this door takes. */
export const RETURNED_FILE_MIME = 'application/zip'

/** The extension a stored returned file is given, which is also how the preview door types it. */
export const RETURNED_FILE_EXTENSION = 'zip'

/** The one type in the words a person reads, for the read that says what may be sent. */
export const RETURNED_FILE_TYPE_READ = 'ZIP'

/** Where those files go on this machine, as an absolute path. */
export function returnedFileDirectory(): string {
  return whereAStoreIs(RETURNED_FILE_DIRECTORY)
}

/**
 * The largest returned file that may be sent, in bytes, from the one setting that says so.
 *
 * A setting that is there but is not a number is REFUSED rather than read as the default, for the
 * reason `maxMessagePictureBytes` gives: "use the default" and "use this" are two different
 * statements, and guessing which was meant is how a limit nobody chose comes to be enforced.
 */
export function maxReturnedFileBytes(): number {
  const said = settingValue('MOLE_OFFICE_RETURNED_FILE_MAX_BYTES')
  const n = Number(said)
  if (!Number.isInteger(n) || n <= 0) {
    throw new PanelError(
      `MOLE_OFFICE_RETURNED_FILE_MAX_BYTES is ${JSON.stringify(said)}, which is not a whole number of bytes. ` +
        'Set it to one, or take it out to use the built-in limit. Nothing was written.',
      500,
    )
  }
  return n
}

/**
 * The first bytes of a refused file, in the two spellings a reader can use: hex, and the printable
 * characters. This is what "naming what it found instead" means — the bytes themselves, not a guess
 * at a format the office never checked.
 */
function firstBytesSaid(bytes: Buffer): string {
  const head = bytes.subarray(0, Math.min(4, bytes.length))
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ')
  const printable = [...head].map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('')
  return `${hex} ("${printable}")`
}

/**
 * WHERE THIS FILE WOULD GO, OR THE REASON IT MAY NOT BE STORED AT ALL.
 *
 * The directory has to sit inside a preview root, because that is the only way the record pointing
 * at it will ever be served. Asked before the bytes are looked at, so a person whose installation
 * cannot hold the file is told that rather than told their file is too big. The project is passed
 * in because the roots are derived per project, and the caller has the workspace on the request.
 */
export function whereReturnedFilesGo(workspaceId: string): string {
  const directory = returnedFileDirectory()
  const roots = previewRoots(workspaceId)
  if (!roots.some((root) => inside(directory, root.configured))) {
    throw new PanelError(
      `A returned file would be stored in ${directory}, and Mole Office may not read anything ` +
        `there, so it could never be served back. Nothing was written. ${rootsSentence(roots)} Either put the ` +
        `database inside one of those directories, or name ${directory} in ${PREVIEW_ROOTS_VAR}.`,
      500,
    )
  }
  return directory
}

/**
 * Decode the base64 a caller sent, or refuse it before anything is written.
 *
 * THE SHAPE IS CHECKED FIRST, and it has to be. `Buffer.from(said, 'base64')` silently drops every
 * character it does not recognise, so a body of letters and punctuation would decode to whatever
 * happened to survive and be stored under this door's name as if it were the file somebody meant.
 * A standard base64 body is a whole number of four-character groups of the base64 alphabet, with
 * at most two `=` at the end, so that is exactly what is required. A shorter or longer tail, a
 * url-safe `-`/`_` is refused rather than guessed at. Line breaks and spaces are taken out
 * first, because the `base64` command wraps its output at 76 characters and that wrapping can
 * mean one thing only: loose input, strict storage.
 *
 * AN EMPTY BODY IS ITS OWN REFUSAL. "There is no file" and "the base64 cannot be read" are two
 * different facts, and collapsing them would tell a caller to fix an encoding that was never sent.
 */
export function decodeReturnedFileBase64(said: string, what = 'That returned file'): Buffer {
  if (said.trim() === '') {
    throw new PanelError(`${what} is empty. Nothing was written.`, 400)
  }
  // LINE BREAKS AND SPACES COME OUT BEFORE THE SHAPE IS CHECKED, AND THAT IS NOT LENIENCE.
  //
  // The `base64` command every operating system ships wraps its output at 76 characters, so a
  // person who encodes a zip at a terminal and pastes the result has sent exactly the right bytes
  // with newlines through them. Whitespace in base64 can mean one thing only, so refusing it would
  // refuse a correct file for a reason the sender cannot see in their own input, and the eighth
  // invariant is that a person may write what they mean. What stays strict is what gets STORED:
  // after this line the shape is required exactly, and a body carrying any character base64 cannot
  // hold is still refused rather than decoded into something shorter than what was sent.
  const packed = said.replace(/\s+/gu, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packed) || packed.length % 4 !== 0) {
    throw new PanelError(
      `${what} did not arrive as readable base64: it holds a character or a length that base64 ` +
        'cannot have, so decoding it would drop bytes and store something the sender never sent. Nothing was ' +
        'written. Line breaks and spaces are not the problem: those come out before this is checked.',
      400,
    )
  }
  const bytes = Buffer.from(packed, 'base64')
  if (bytes.length === 0) {
    throw new PanelError(`${what} arrived as base64 that decodes to nothing. Nothing was written.`, 400)
  }
  return bytes
}

/** A returned file stored, and everything the record that will point at it needs. */
export interface StoredReturnedFile {
  /** Where the file is, absolutely, on this machine. What the later record's path field carries. */
  path: string
  /** What the bytes are, which for this one door is always a zip. */
  mime: string
  /** How many bytes were written. */
  bytes: number
}

/**
 * Store a zip somebody brought back, and hand back the path a record will point at.
 *
 * The order of the refusals is the order a person meets them: an installation that cannot hold the
 * file at all, then an empty one, then one too big, then bytes that are not a zip. Every one of
 * them says "Nothing was written", and every one of them is true when it says it.
 */
export function storeAReturnedFile(bytes: Buffer, workspaceId: string): StoredReturnedFile {
  const directory = whereReturnedFilesGo(workspaceId)
  if (bytes.length === 0) throw new PanelError('That returned file is empty. Nothing was written.', 400)
  const limit = maxReturnedFileBytes()
  if (bytes.length > limit) {
    throw new PanelError(
      `That returned file is ${String(bytes.length)} bytes and the limit is ${String(limit)}. Nothing was ` +
        'written. The limit is MOLE_OFFICE_RETURNED_FILE_MAX_BYTES.',
      413,
    )
  }
  // FOUR BYTES, AND NOTHING BELOW THIS LINE READS THE ARCHIVE. See the header: the check is that the
  // file starts like a zip, and it is not an opening. The bytes are written exactly as they arrived.
  // The three signatures a zip may begin with are declared in src/shared/file-signatures.ts.
  if (typeOfBytes(bytes) !== 'application/zip') {
    throw new PanelError(
      `Those bytes begin with ${firstBytesSaid(bytes)}, which is not the four-byte signature a zip file ` +
        'starts with. Nothing was written. This door takes a zip and nothing else, and it reads only those ' +
        'four bytes: the archive is never opened here.',
      415,
    )
  }
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  const path = join(directory, `${anOfficeId()}.${RETURNED_FILE_EXTENSION}`)
  writeFileSync(path, bytes)
  storedFileChanged(path)
  return { path, mime: RETURNED_FILE_MIME, bytes: bytes.length }
}
