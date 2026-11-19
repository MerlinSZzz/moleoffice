// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { storedFileChanged } from './storage/store.ts'
/**
 * TAKING A PICTURE SOMEBODY SENT IN A MESSAGE, AND PUTTING IT WHERE THIS PRODUCT CAN DRAW IT AGAIN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M65, written whole in design/messages/ACCEPTANCE.md section 38: a screenshot taken on
 * the person's other machine has to reach an
 * agent here through the chat, instead of being copied across by hand first.
 *
 * So: the browser sends the bytes, this writes them to a file, and the message that follows carries
 * an `ImageBlock` pointing at that file — the same shape a report's picture has, drawn by the same
 * code and served by the same door.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE ON DISK AND NOT BYTES IN THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * Because that is what a picture already is in this product. `ImageBlock` says it in one line:
 * *Mole Office points at it; it is never copied into the database.* A second way of holding a
 * picture would be a second set of rules about serving one, and `GET /api/file` — which is the
 * careful one, with the reference set and the roots — would not be the door for half of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE FILE GOES, AND WHY THE UPLOAD IS REFUSED WHEN THAT IS THE WRONG PLACE
 * ---------------------------------------------------------------------------------------
 *
 * It goes BESIDE THE DATABASE, in `message-pictures/`, for the reason `avatarDirectory` in
 * lib/avatars.ts writes its uploads beside the database: a picture belongs to the database that
 * points at it, and a scratch stack running on a temporary copy must not write into the owner's own
 * directory.
 *
 * `GET /api/file` will only read a file inside a preview root. So a picture stored where no preview
 * root reaches would be a picture accepted, stored, pointed at by a message, and impossible to draw
 * — accepted work that silently cannot be done, which is the first invariant. THE UPLOAD IS
 * THEREFORE REFUSED BEFORE ANY BYTES ARE WRITTEN, with a sentence naming the directory, the roots
 * and the variable that sets them. The check asks `previewRoots` and `inside` — the same two things
 * the reading door asks — rather than a second copy of the rule.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The bytes are sniffed for png, jpeg or webp by `pictureTypeOf`, which is the avatar door's own
 * reader: what a file IS is one fact, and this product answers it in one place. An svg is refused
 * there and stays refused here, for the reason written there — it is a document a browser runs.
 *
 * NOTHING HERE SAYS WHO MAY SEND ONE. A message says who wrote it and the record door checks that;
 * this only takes bytes and hands back a path. Splitting the two is what lets the size and type
 * refusals happen before anything about a message is decided.
 *
 * NOTHING HERE WRITES AN `assets` ROW EITHER, and that is deliberate. `GET /api/assets/:id` serves
 * any row it holds to anybody who knows the id, with no record needed and no project checked — that
 * is right for an avatar, which is drawn on every page and belongs to nobody's private words. A
 * picture inside somebody's message is not that. Its confinement is the one M65 asks for: the same
 * as every other file the API serves, which means a live record in this project has to point at it.
 * A file whose message was never sent is therefore readable through no door at all.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { anOfficeId } from './ids.ts'
import { settingValue } from '../../config/settings.mjs'
import { PREVIEW_ROOTS_VAR, previewRoots, rootsSentence, whereAStoreIs, type StoreBesideTheDatabase } from './where-a-file-may-be-read.ts'
import { inside } from '@shared/path-inside.ts'
import { PanelError } from './panel-error.ts'
import { pictureTypeOf } from '@shared/avatar-picture-type.ts'
import { UPLOADABLE_AVATAR_TYPES } from '@shared/participants.ts'
import { storedNameFor } from './stored-name-for.ts'

/** The directory a picture sent in a message is written into: `message-pictures/`, beside the database. */
export const MESSAGE_PICTURE_DIRECTORY = 'message-pictures' satisfies StoreBesideTheDatabase

/** Where those pictures go on this machine, as an absolute path. */
export function messagePictureDirectory(): string {
  return whereAStoreIs(MESSAGE_PICTURE_DIRECTORY)
}

/**
 * The largest picture that may be sent, in bytes, from the one setting that says so.
 *
 * A setting that is there but is not a number is REFUSED rather than read as the default, for the
 * reason `maxAvatarBytes` gives: "use the default" and "use this" are two different statements, and
 * guessing which was meant is how a limit nobody chose comes to be enforced.
 */
export function maxMessagePictureBytes(): number {
  const said = settingValue('MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES')
  const n = Number(said)
  if (!Number.isInteger(n) || n <= 0) {
    throw new PanelError(
      `MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES is ${JSON.stringify(said)}, which is not a whole number of bytes. ` +
        'Set it to one, or take it out to use the built-in limit. Nothing was written.',
      500,
    )
  }
  return n
}

/**
 * The three kinds of file that may be sent, in the words a person reads.
 *
 * Read off the declaration rather than spelt again, so the sentence in the composer, the refusal
 * from this door and what the door actually accepts cannot come apart.
 */
export const MESSAGE_PICTURE_TYPES_READ: string = Object.values(UPLOADABLE_AVATAR_TYPES)
  .map((ext) => ext.toUpperCase())
  .join(', ')

/**
 * WHERE THIS PICTURE WOULD GO, OR THE REASON IT MAY NOT BE STORED AT ALL.
 *
 * The directory has to sit inside a preview root, because that is the only way the message pointing
 * at it will ever be drawn. Asked before the bytes are looked at, so a person whose installation
 * cannot hold a picture is told that rather than told their file is too big.
 *
 * THE PROJECT IS PASSED IN because the roots are derived per project: the checkout and the agents'
 * directory are always there, and a registered repository or work area of the project may add more.
 * The caller has the workspace on the request already; handing it down is what lets this door ask
 * exactly the boundary the reading door will apply later.
 */
export function whereMessagePicturesGo(workspaceId: string): string {
  const directory = messagePictureDirectory()
  const roots = previewRoots(workspaceId)
  if (!roots.some((root) => inside(directory, root.configured))) {
    throw new PanelError(
      `A picture or a file sent in a message would be stored in ${directory}, and Mole Office may not read anything ` +
        `there, so it could never be drawn again. Nothing was written. ${rootsSentence(roots)} Either put the ` +
        `database inside one of those directories, or name ${directory} in ${PREVIEW_ROOTS_VAR}.`,
      500,
    )
  }
  return directory
}

/** A picture stored, and everything the message that carries it needs to point at it. */
export interface StoredMessagePicture {
  /** Where the file is, absolutely, on this machine. What the message's `ImageBlock` carries. */
  path: string
  /** What the bytes turned out to be, read from the bytes and not from what the caller called them. */
  mime: string
  /** How many bytes were written. */
  bytes: number
}

/**
 * Store a picture somebody sent, and hand back the path a message points at.
 *
 * The order of the refusals is the order a person meets them: an installation that cannot hold a
 * picture at all, then an empty file, then one too big, then one that is not a picture. Every one of
 * them says "Nothing was written", and every one of them is true when it says it.
 */
export function storeAMessagePicture(bytes: Buffer, workspaceId: string): StoredMessagePicture {
  const directory = whereMessagePicturesGo(workspaceId)
  if (bytes.length === 0) throw new PanelError('That picture is empty. Nothing was written.', 400)
  const limit = maxMessagePictureBytes()
  if (bytes.length > limit) {
    throw new PanelError(
      `That picture is ${String(bytes.length)} bytes and the limit is ${String(limit)}. Nothing was written. ` +
        'The limit is MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES.',
      413,
    )
  }
  const type = pictureTypeOf(bytes)
  if (type === null) {
    throw new PanelError(
      `Those bytes are not a png, a jpeg or a webp, whatever they were sent as. Nothing was written. An SVG is ` +
        'not accepted either: it is a document a browser runs, and this product serves a sent picture back to a ' +
        'page.',
      415,
    )
  }
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  const path = join(directory, `${anOfficeId()}.${UPLOADABLE_AVATAR_TYPES[type]}`)
  writeFileSync(path, bytes)
  storedFileChanged(path)
  return { path, mime: type, bytes: bytes.length }
}

/** A file stored, and the path the message that carries it points at. */
export interface StoredMessageFile {
  /** Where the file is, absolutely, on this machine. What the message's `ImageBlock` carries. */
  path: string
  /** How many bytes were written. */
  bytes: number
}

/**
 * Store a file somebody sent that is not a picture, and hand back the path a message points at.
 *
 * THE SAME FOLDER, THE SAME LIMIT AND THE SAME CONFINEMENT AS A PICTURE. The bytes are not read for
 * a type, because any file may be sent: the reading door describes a file by its extension and
 * serves one it cannot describe as bytes to save. THE STORED NAME is a fresh id and the sent name's
 * extension, by the rule a report's file is named by, so a sent name never chooses where the file
 * goes and two files sent under one name are two files. The sent name travels in the message.
 */
export function storeAMessageFile(bytes: Buffer, name: string, workspaceId: string): StoredMessageFile {
  const directory = whereMessagePicturesGo(workspaceId)
  const limit = maxMessagePictureBytes()
  if (bytes.length > limit) {
    throw new PanelError(
      `That file is ${String(bytes.length)} bytes and the limit is ${String(limit)}. Nothing was written. ` +
        'The limit is MOLE_OFFICE_MESSAGE_PICTURE_MAX_BYTES.',
      413,
    )
  }
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  const path = join(directory, storedNameFor(name))
  writeFileSync(path, bytes, { flag: 'wx' })
  storedFileChanged(path)
  return { path, bytes: bytes.length }
}
