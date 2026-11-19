// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURE A PARTICIPANT IS DRAWN WITH: one this product makes, or one somebody sends.
 *
 * ---------------------------------------------------------------------------------------
 * THE DRAWING THIS PRODUCT MAKES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M3: *A default avatar is generated from the participant's id, the same every time, and
 * belongs to the product with its licence source written down.* So it is worked out from the id and
 * from nothing else — not from a clock, not from a random source, not from a row that could be
 * edited. The same participant has the same picture on this machine and on any other, and a database
 * copied somewhere else draws the same faces.
 *
 * IT IS AN SVG BUILT HERE, WITH NO LIBRARY. Two colours and a pattern that is symmetrical down the
 * middle, on a disc. Symmetry is what makes a pattern read as a face rather than as noise, and it
 * costs nothing: the left half is drawn and mirrored.
 *
 * NOTHING IS STORED FOR IT. There is no file and no cached string; the `assets` row exists to say
 * where the right to use it comes from, and `path` and `bytes` on that row are NULL because there is
 * nothing on disk to name or to measure.
 *
 * ---------------------------------------------------------------------------------------
 * A PICTURE SOMEBODY SENDS
 * ---------------------------------------------------------------------------------------
 *
 * Three types, as M3 names them: png, jpeg and webp. THE BYTES ARE READ, NOT THE HEADER THE CALLER
 * TYPED. A caller saying `image/png` over a file that is not one would otherwise put whatever it
 * really is under a name the page trusts. An SVG is deliberately not accepted: it is a document a
 * browser executes, and this product serves an uploaded file back to a page.
 *
 * THE FILE GOES BESIDE THE DATABASE, under `avatars/`, and never into this repository. `data/` is
 * where the operator's own work lives and nothing in it is tracked: `tests/avatars.test.ts` fails if
 * anything is, under the heading *an uploaded picture never enters the repository*, and
 * `tools/open-source-gate.mjs` runs the same check before anything is published.
 *
 * IT IS BESIDE THE DATABASE AND NOT AT A FIXED PATH, because a picture belongs to the database that
 * references it. A scratch stack on a temporary copy writes its uploads beside that copy, so nothing
 * a test or a photographing run uploads can land in the operator's own directory.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { anOfficeId } from './ids.ts'
import { sqlite } from '../db/client.ts'
import { nowStamp } from '@shared/time.ts'
// THE FIRST PORTRAIT OF A ROLE CARD, which is what an agent that chose no picture wears. M75.
import { theFirstPortraitOf } from '@shared/portraits.ts'
import { databaseDirectoryFrom, settings, settingValue, whereThePublicFileIs } from '../../config/settings.mjs'
import {
  AVATAR_ASSET_KIND,
  AVATAR_DIRECTORY,
  AVATARS_IN_THE_CHECKOUT,
  GENERATED_AVATAR_LICENCE,
  THE_PICTURE_WAS_GIVEN,
  GENERATED_AVATAR_MIME,
  UPLOADABLE_AVATAR_TYPES,
  avatarUrlFor,
  defaultAvatarAssetId,
  isMoleOffice,
  type ParticipantRef,
  type UploadableAvatarType,
} from '@shared/participants.ts'
import { CIRCLE_PICTURES, circlePicture } from '@shared/messages.ts'
import { PanelError } from './panel-error.ts'
import { storedFileChanged } from './storage/store.ts'
import { AVATAR_DISPOSITIONS, AvatarCodecFailure, compressAvatar, type CompressedAvatar } from './avatar-compression.ts'
// THE DRAWING, AND WHAT ONE ASSET ROW SENDS, are worked out in ./avatar-drawing.ts, which opens no database, so the
// re-mint's read-only check can ask the same question of a store it opened itself. They are exported from here as before.
import { drawDefaultAvatar, participantOfDefault, whatAnAssetRowSends, type AvatarToSend } from './avatar-drawing.ts'
import { pictureTypeOf } from '@shared/avatar-picture-type.ts'
export { drawDefaultAvatar, participantOfDefault, type AvatarToSend }

// ============================================================================ where an upload lives

/** The directory uploaded pictures are written into: `avatars/`, beside the database. */
export function avatarDirectory(): string {
  return join(databaseDirectoryFrom(settings().databasePath), AVATAR_DIRECTORY)
}

/**
 * The largest upload allowed, in bytes, from the one setting that says so.
 *
 * A setting that is there but is not a number is REFUSED rather than read as the default. Those are
 * two different statements — "use the default" and "use this" — and guessing which was meant is how
 * a limit nobody chose ends up enforced.
 */
export function maxAvatarBytes(): number {
  const said = settingValue('MOLE_OFFICE_AVATAR_MAX_BYTES')
  const n = Number(said)
  if (!Number.isInteger(n) || n <= 0) {
    throw new PanelError(
      `MOLE_OFFICE_AVATAR_MAX_BYTES is ${JSON.stringify(said)}, which is not a whole number of bytes. Set it to ` +
        'one, or take it out to use the built-in limit. Nothing was written.',
      500,
    )
  }
  return n
}

// ============================================================================ reading the bytes

/** What a request for one picture gets back. */
export interface AvatarBytes {
  body: Buffer | string
  mime: string
  /** How long a browser may keep it. A drawing never changes; an uploaded file has its own id. */
  cacheControl: string
}

/** The bytes of one asset, read whole, or the refusal `theAvatarToSend` gives. */
export function avatarBytesFor(assetId: string): AvatarBytes {
  const found = theAvatarToSend(assetId)
  return { body: 'drawing' in found ? found.drawing : readFileSync(found.file), mime: found.mime, cacheControl: found.cacheControl }
}

/**
 * One asset to send, or a refusal saying which of the two things went wrong.
 *
 * A ROW WITH NO FILE BEHIND IT IS REPORTED AS THAT, and nothing stands in for it. Serving the drawn
 * picture in place of an upload whose file is missing would be a stand-in served under the file's
 * own name, which breaks the principle at the top of USER.md, "Never silently substitute semantics"
 * — and a restore from an archive really does produce that state, because an archive carries the
 * row and never the file.
 */
export function theAvatarToSend(assetId: string): AvatarToSend {
  const row = sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as Record<string, unknown> | undefined
  const sent = whatAnAssetRowSends(row, assetId, databaseDirectoryFrom(settings().databasePath))
  if (!('refused' in sent)) return sent
  if (sent.refused === 'no-row') throw new PanelError(`No picture in this installation answers to "${assetId}".`, 404)
  if (sent.refused === 'drawn-for-nobody') {
    throw new PanelError(
      `The picture "${assetId}" says it was drawn by Mole Office, and its id does not say who for. Nothing was drawn.`,
      500,
    )
  }
  if (sent.refused === 'no-file-named') {
    throw new PanelError(`The picture "${assetId}" says somebody uploaded it and no file is named on the row.`, 500)
  }
  const stored = sent.stored
  throw new PanelError(
    `The picture "${assetId}" is a file somebody uploaded, at ${stored}, and it is not there. Nothing was drawn ` +
      'in its place. An archive carries the row and never the file, so a restored copy needs the file brought ' +
      'with it.',
    410,
  )
}

// ============================================================================ taking an upload

export { pictureTypeOf }

/**
 * Store a picture somebody sent and append its upload receipt. Identical results share a file and
 * a provenance row; the receipt still records who uploaded it and when, including repeat uploads.
 *
 * IT DOES NOT POINT ANYBODY AT IT. `setParticipantAvatar` in lib/participants.ts is the act that
 * changes whose picture this is, and it is the one that checks who may. Splitting the two is what
 * lets the refusal for "you may not change that agent's picture" happen before a file is written.
 */
export function storeUploadedAvatar(bytes: Buffer, by: ParticipantRef): string {
  return storeAvatarUpload(bytes, by).assetId
}

export interface AvatarUploadDescription {
  originalHash: string
  storedHash: string
  originalBytes: number
  storedBytes: number
  bytesSaved: number
  disposition: CompressedAvatar['disposition']
  mime: UploadableAvatarType
  path: string
  /** Retained when reading historical manifests; new runtime RSS stays on CompressedAvatar.native. */
  codecPeakRssBytes?: number
}

const CHOSEN_UPLOAD = 'avatar-upload-'

/** A receipt is appended even when this original and its resulting picture are already shared. */
export function storeAvatarUpload(bytes: Buffer, by: ParticipantRef, given = false): {
  assetId: string; upload: AvatarUploadDescription; receipt: string
} {
  const limit = maxAvatarBytes()
  if (bytes.length > limit) {
    throw new PanelError(
      `That picture is ${String(bytes.length)} bytes and the limit is ${String(limit)}. An avatar is drawn small, ` +
        'so a bigger file is almost always a photograph nobody meant to send. Nothing was written. The limit is ' +
        'MOLE_OFFICE_AVATAR_MAX_BYTES.',
      413,
    )
  }
  if (bytes.length === 0) throw new PanelError('That picture is empty. Nothing was written.', 400)
  const type = pictureTypeOf(bytes)
  if (type === null) {
    throw new PanelError(
      `Those bytes are not a png, a jpeg or a webp, whatever they were sent as. Nothing was written. An SVG is ` +
        'not accepted either: it is a document a browser runs, and this product serves an uploaded picture back ' +
        'to a page.',
      415,
    )
  }
  const directory = avatarDirectory()
  mkdirSync(directory, { recursive: true })
  const hash = (body: Buffer): string => createHash('sha256').update(body).digest('hex')
  const originalHash = hash(bytes)
  const manifest = join(directory, `${originalHash}.json`)
  const folder = databaseDirectoryFrom(settings().databasePath)
  const blobRefusal = (): never => { throw new PanelError('The existing avatar file does not match its content hash. Nothing was overwritten.', 500) }
  const readDescription = (): AvatarUploadDescription => {
    try {
      const found = JSON.parse(readFileSync(manifest, 'utf8')) as AvatarUploadDescription
      if (found.originalHash !== originalHash || found.originalBytes !== bytes.length || found.mime !== type ||
        !/^[a-f0-9]{64}$/.test(found.storedHash) || !Number.isInteger(found.storedBytes) || found.storedBytes <= 0 ||
        found.storedBytes > bytes.length || found.bytesSaved !== bytes.length - found.storedBytes ||
        !Object.values(AVATAR_DISPOSITIONS).includes(found.disposition) ||
        found.path !== join(AVATAR_DIRECTORY, `sha256-${found.storedHash}.${UPLOADABLE_AVATAR_TYPES[type]}`)) throw new Error()
      return found
    } catch {
      throw new PanelError('The stored avatar upload description is invalid. Nothing was overwritten.', 500)
    }
  }
  let description: AvatarUploadDescription
  if (existsSync(manifest)) description = readDescription()
  else {
    let compressed: CompressedAvatar
    try { compressed = compressAvatar(bytes, type) }
    catch (error) {
      compressed = { bytes, disposition: error instanceof AvatarCodecFailure ? error.disposition : AVATAR_DISPOSITIONS.unknownFailure }
    }
    const storedHash = hash(compressed.bytes)
    description = {
      originalHash, storedHash, originalBytes: bytes.length, storedBytes: compressed.bytes.length,
      bytesSaved: bytes.length - compressed.bytes.length, disposition: compressed.disposition, mime: type,
      path: join(AVATAR_DIRECTORY, `sha256-${storedHash}.${UPLOADABLE_AVATAR_TYPES[type]}`),
    }
    const file = join(folder, description.path)
    try { writeFileSync(file, compressed.bytes, { flag: 'wx' }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!readFileSync(file).equals(compressed.bytes)) blobRefusal()
    }
    storedFileChanged(file)
    // Another server can have recorded this original first. Its immutable description wins;
    // neither its disposition nor its result is silently replaced by this process's codec state.
    try { writeFileSync(manifest, JSON.stringify(description) + '\n', { flag: 'wx' }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      description = readDescription()
    }
  }
  const held = readFileSync(join(folder, description.path))
  if (held.length !== description.storedBytes || hash(held) !== description.storedHash) blobRefusal()
  // Replays also register legacy files; unchanged physical paths keep their category.
  storedFileChanged(join(folder, description.path))
  storedFileChanged(manifest)
  // Provenance belongs to the asset row, not the image file. A deliberate choice must never
  // acquire the given marker merely because its bytes are already used by an unchosen picture.
  const licence = given ? THE_PICTURE_WAS_GIVEN : null
  const shared = sqlite.prepare(
    "SELECT id FROM assets WHERE kind = ? AND origin = 'uploaded' AND path = ? AND mime = ? AND bytes = ? " +
    'AND licence_source IS ? AND id LIKE ? ORDER BY created_at, id LIMIT 1',
  ).get(AVATAR_ASSET_KIND, description.path, type, description.storedBytes, licence, given ? 'avatar-given-%' : `${CHOSEN_UPLOAD}%`) as { id: string } | undefined
  const id = shared?.id ?? [given ? 'avatar-given-' : CHOSEN_UPLOAD, anOfficeId()].join('')
  if (shared === undefined) sqlite.prepare(
    'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
    "VALUES (?, ?, 'uploaded', ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, AVATAR_ASSET_KIND, description.path, type, description.storedBytes, nowStamp(), by.kind, by.id, licence)
  const receipts = join(directory, 'receipts')
  mkdirSync(receipts, { recursive: true })
  // A reset restarts the ID sequence but preserves files, including those of sibling databases.
  // Address the facts once, including their database. Exact replay reuses identical bytes; neither
  // a historical receipt nor a different upload is overwritten or assigned a new ID by retry.
  const uploadId = anOfficeId()
  const facts = JSON.stringify({ ...description, database: resolve(settings().databasePath), assetId: id, by, at: nowStamp() }) + '\n'
  const receipt = `${uploadId}-${hash(Buffer.from(facts))}`
  const receiptFile = join(receipts, `${receipt}.json`)
  try { writeFileSync(receiptFile, facts, { flag: 'wx' }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (readFileSync(receiptFile, 'utf8') !== facts) {
      throw new PanelError('The existing avatar upload receipt does not match its content hash. Nothing was overwritten.', 500)
    }
  }
  storedFileChanged(receiptFile)
  return { assetId: id, upload: description, receipt }
}

/** The licence sentence a drawn picture carries, so a reader of the row is told where it came from. */
export const DRAWN_BY_THIS_PRODUCT = GENERATED_AVATAR_LICENCE

// ============================================================================ the pictures on offer

/**
 * THE PICTURES THIS PRODUCT OFFERS, so a person picks one instead of finding a file.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FILES ARE READ AND NOT LISTED
 * ---------------------------------------------------------------------------------------
 *
 * The set is whatever is in `design/avatars/png/` and `design/avatars/generated/`. A list written
 * into this file would be a second copy of the directory, and the directory is the one that grows:
 * thirty more pictures came in at one time, and forty-one are there now. A copy would have
 * gone stale the same day with nothing failing.
 *
 * ---------------------------------------------------------------------------------------
 * THEY ARE OFFERED, AND THE UPLOAD DOOR IS STILL THE ONLY WAY IN
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here gives anybody a picture. The page fetches the bytes of the one somebody pressed and
 * sends them to `POST /api/participants/:kind/:id/avatar`, which is the same request a file chosen
 * from a disk makes. So every rule about who may change whose picture is enforced in exactly one
 * place, and picking from this set cannot become a second door with rules of its own.
 */

/** The two sets, and the directory each is in under `design/avatars`. */
export const AVATAR_SETS = { drawn: 'png', generated: 'generated' } as const

/** `drawn` — the animals drawn by hand. `generated` — the ones an image model made. */
export type AvatarSetName = keyof typeof AVATAR_SETS

/**
 * THE PICTURE A PARTICIPANT GETS WHEN NOBODY CHOSE ONE: THE BEE.
 *
 * Criterion M53: the chill-bee picture is the default one a fresh installation gives.
 *
 * IT IS A SET AND A FILE NAME, NOT A PATH, because it is offered through the same door as every
 * other picture: `avatarsOnOffer` lists it, `offeredAvatarBytes` reads it and the upload door
 * stores it. Nothing here is a second way for a picture to become somebody's.
 *
 * THE REST OF THE DRAWN SET IS STILL OFFERED. This changes which one is recommended and nothing
 * else; the picker draws all of them and a person picks any.
 */
export const THE_DEFAULT_PICTURE: { set: AvatarSetName; name: string } = { set: 'drawn', name: 'chill-bee' }

/** True when this string, which came off a request, names one of the two sets. */
export function isAvatarSetName(said: string): said is AvatarSetName {
  return Object.prototype.hasOwnProperty.call(AVATAR_SETS, said)
}

/** One picture on offer, as a page draws it. */
export interface AvatarOnOffer {
  /** Which of the two sets it is in. */
  set: AvatarSetName
  /** The file's name with no extension: `sheepdog`, `spring-onion`. */
  name: string
  /** Where its bytes are. */
  url: string
}

/**
 * THE NAMES A FILE MAY HAVE. Lower-case letters, digits and hyphens, starting with a letter or a
 * digit.
 *
 * A NAME THAT DOES NOT MATCH IS LEFT OUT OF THE LIST AND REFUSED ON THE WAY IN. That is what stops
 * `..` and an absolute path reaching `join`, and it is checked on both sides rather than only on
 * the request: a name this cannot spell can never be listed, so nothing offers an address that
 * would then be refused.
 */
const A_PICTURE_NAME = /^[a-z0-9][a-z0-9-]*$/

/** Where one set's files are, in this checkout. */
export function avatarSetDirectory(set: AvatarSetName): string {
  return join(whereThePublicFileIs(AVATARS_IN_THE_CHECKOUT), AVATAR_SETS[set])
}

/**
 * THE BYTES OF ONE PICTURE THE ROUND CHAT BUTTON MAY CARRY. Criterion M38.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A THIRD AVATAR SET
 * ---------------------------------------------------------------------------------------
 *
 * The two sets above are pictures offered TO A PARTICIPANT, and everything that reads them offers
 * them in the picker. These are the product's own button and belong to nobody: putting them in that
 * list would offer a reader a mole as their own face, and a mole is not a face. So they are
 * their own four files with their own address, and the only thing shared is this directory.
 *
 * THE NAME IS NOT TAKEN FROM THE REQUEST AND JOINED TO A PATH. It is looked up in the declaration,
 * and the FILE comes from there — so nothing a caller can type reaches `join`, and a name nobody
 * declared is a 404 rather than a read of some other file.
 */
export function circlePictureBytes(name: string): AvatarBytes {
  const picture = circlePicture(name)
  if (picture === null) {
    throw new PanelError(
      `"${name}" is not one of the pictures the round chat button may carry. They are: ` +
        `${CIRCLE_PICTURES.map((one) => one.name).join(', ')}. Nothing was read.`,
      404,
    )
  }
  const file = join(whereThePublicFileIs(AVATARS_IN_THE_CHECKOUT), 'circle', picture.file)
  if (!existsSync(file)) {
    throw new PanelError(
      `The file "${picture.file}" for the picture "${picture.name}" is not in this checkout. Nothing was served.`,
      500,
    )
  }
  const bytes = readFileSync(file)
  // AN SVG IS SERVED AS ITSELF AND A PNG IS CHECKED. `pictureTypeOf` reads the first bytes of a
  // file to find out what it really is, and it knows nothing about SVG — which is text, and which
  // this product deliberately never accepts as an UPLOAD (it is a document a browser executes).
  // These four are files in this repository rather than anything anybody sent, so the one written
  // down beside the name is what is served.
  if (picture.file.endsWith('.svg')) {
    return { body: bytes.toString('utf8'), mime: 'image/svg+xml', cacheControl: 'public, max-age=3600' }
  }
  const type = pictureTypeOf(bytes)
  if (type === null) {
    throw new PanelError(
      `The file "${picture.file}" is not a png, whatever its name says. Nothing was served.`,
      500,
    )
  }
  return { body: bytes, mime: type, cacheControl: 'public, max-age=3600' }
}

/** Where a page asks for one of these pictures. One place builds it, as `avatarUrlFor` does. */
export function offeredAvatarUrl(set: AvatarSetName, name: string): string {
  return `/api/avatars/${set}/${encodeURIComponent(name)}`
}

/**
 * Every picture on offer, the drawn set first and each set in the order a person reads a list.
 *
 * A MISSING DIRECTORY IS REPORTED AND NOT ANSWERED AS AN EMPTY SET. "Nothing is there" and "nobody
 * could look" are different answers, and a picker drawing no pictures because the directory is gone
 * would look exactly like a picker drawing no pictures because the set is empty.
 */
export function avatarsOnOffer(): AvatarOnOffer[] {
  const out: AvatarOnOffer[] = []
  for (const set of Object.keys(AVATAR_SETS) as AvatarSetName[]) {
    const directory = avatarSetDirectory(set)
    if (!existsSync(directory)) {
      throw new PanelError(
        `The ${set} pictures are kept in ${directory} and that directory is not there, so nothing could be ` +
          'listed. This is a missing directory and not an empty set.',
        500,
      )
    }
    const names = readdirSync(directory)
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.slice(0, -'.png'.length))
      .filter((name) => A_PICTURE_NAME.test(name))
      .sort((a, b) => a.localeCompare(b))
    for (const name of names) out.push({ set, name, url: offeredAvatarUrl(set, name) })
  }
  return out
}

/**
 * THE PICTURE OFFERED TO A PARTICIPANT THAT STILL HAS THE ONE MOLE OFFICE DREW, or null.
 *
 * Criterion M30 asks that an agent with no picture is offered one. Every participant has a picture
 * — Mole Office draws one from the id — so "no picture" means nobody has ever chosen one, and that is
 * exactly the case where the row still points at the drawing. When somebody has chosen, this
 * answers null and the picker offers nothing in particular.
 *
 * IT IS THE SAME PICTURE FOR EVERYBODY, AND THAT IS CRITERION M53. It used to be worked out from
 * the participant's id — the last two bytes of the same digest the drawing is made of — so each
 * agent was offered a different animal. Now one picture is the default
 * for everybody: chill-bee, which is `THE_DEFAULT_PICTURE` above. The rest of the drawn set is
 * still offered; this decides only which one is recommended, and it is the one place that does.
 *
 * IF THAT PICTURE IS NOT IN THIS CHECKOUT, NOTHING IS OFFERED. Recommending another animal in its
 * place would be a stand-in served under the default's name, which breaks the principle at the top
 * of USER.md, "Never silently substitute semantics".
 *
 * IT IS OFFERED AND NEVER GIVEN HERE. Nothing in this function writes. A person presses the picture
 * and the ordinary upload door stores it; `giveTheOfferedPicture` below is the one act that gives.
 */
export function avatarOfferedTo(
  who: ParticipantRef,
  avatarAssetId: string,
  onOffer: readonly AvatarOnOffer[],
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
  assetRowOf?: (id: string) => AnAssetRowsProvenance | undefined,
): AvatarOnOffer | null {
  // MOLE OFFICE IS OFFERED NOTHING. Its picture is nobody's to change, not even the product's: it is
  // what tells a line the product wrote from an agent's words, and criterion M11 calls it fixed.
  // The door has always refused it (`MOLE_OFFICE_IS_NOT_YOURS_TO_CHANGE`), and until this line the
  // picker offered one anyway — a press that could only ever be refused. Said here, once, so the
  // picker, the registration door and the one-off script all get the same answer.
  if (officeTest(who)) return null
  if (avatarAssetId !== defaultAvatarAssetId(who) && !isAnEarlierDrawnDefault(who, avatarAssetId, assetRowOf)) return null
  return (
    onOffer.find((one) => one.set === THE_DEFAULT_PICTURE.set && one.name === THE_DEFAULT_PICTURE.name) ?? null
  )
}

/** The fields of an asset row this file reads to tell a drawn default from a picture somebody chose. */
export interface AnAssetRowsProvenance {
  kind: string
  origin: string
  path: string | null
  mime: string
  bytes: number | null
  licence: string | null
}

/**
 * THE ASSET ROWS FOR MANY PICTURES, IN ONE READING. A roster whose agents still wear an earlier drawn
 * default asked for each agent's row separately; on the 13 November office that was 1,597 statements
 * for one `GET /api/working`. This is the same row, read once, handed to `isAnEarlierDrawnDefault`.
 */
export function theAssetRowsFor(ids: readonly string[]): ReadonlyMap<string, AnAssetRowsProvenance> {
  if (ids.length === 0) return new Map()
  const rows = sqlite
    .prepare('SELECT id, kind, origin, path, mime, bytes, licence_source AS licence FROM assets WHERE id IN (SELECT value FROM json_each(?))')
    .all(JSON.stringify([...new Set(ids)])) as (AnAssetRowsProvenance & { id: string })[]
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * A RE-MINT KEEPS THE DRAWING ITS ROW ALREADY HOLDS. The asset key still
 * names the earlier id, so equality with a key built from the live id no longer identifies it.
 * Read the asset's provenance instead: a generated avatar of this kind, with no uploaded file or
 * bytes. Its participant row already points to it. No handle or earlier-id lookup is guessed.
 */
function isAnEarlierDrawnDefault(
  who: ParticipantRef,
  avatarAssetId: string,
  assetRowOf?: (id: string) => AnAssetRowsProvenance | undefined,
): boolean {
  const drawnFor = participantOfDefault(avatarAssetId)
  if (drawnFor === null || drawnFor.kind !== who.kind) return false
  const row = assetRowOf === undefined ? theAssetRowsFor([avatarAssetId]).get(avatarAssetId) : assetRowOf(avatarAssetId)
  return row !== undefined && row.kind === AVATAR_ASSET_KIND && row.origin === 'default' && row.path === null &&
    row.bytes === null && row.mime === GENERATED_AVATAR_MIME && row.licence === GENERATED_AVATAR_LICENCE
}

/**
 * WHERE A SCREEN ASKS FOR THIS PARTICIPANT'S PICTURE: the one they are offered while nobody has
 * chosen for them, and the picture their row holds once somebody has.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ADDRESS AND NOT THE BYTES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M53 makes chill-bee the picture a person or an agent gets when nobody chose one, in
 * every fresh installation. An agent gets there by taking it at the door: `giveTheOfferedPicture`
 * stores the file when its registry row is written, so its row really holds that picture. A person's
 * row is written by the participants migration and no door gives a person a picture, so the owner's
 * own face in a fresh installation stayed the pattern drawn from their id. Problem `wO9DpHLtXts_`.
 *
 * A MIGRATION MAY NOT CLOSE IT, because storing a picture writes a file beside the database and a
 * migration has to replay onto a restored copy. So the answer is here, on the read: the row is left
 * exactly as it is and the screens are told a different address.
 *
 * THE DRAWN ADDRESS IS NOT REUSED FOR THIS, and that is the point. `avatar-default-person-owner`
 * addresses a picture whose `assets` row says Mole Office generated it and names no file. Serving a
 * png out of this checkout under that row would put a made-up provenance on real bytes, which is
 * invariant 3 of USER.md. The bee is served from its own address, under /api/avatars, where it
 * already lives.
 *
 * `onOffer` IS PASSED IN, as it is to `avatarOfferedTo`, so a caller drawing a list of participants
 * reads the two picture directories once and not once per row.
 */
/**
 * WHETHER A ROW IS STILL WEARING THE PICTURE IT WAS GIVEN, rather than one somebody chose for it.
 *
 * Criterion M75, and the reason it needs asking. An agent takes the offered picture AT THE DOOR:
 * `giveTheOfferedPicture` points that agent's registry row at a stored copy of chill-bee when the
 * row is written, so its row does hold a picture and `avatarOfferedTo` rightly says it is offered nothing.
 * That is why every builder in the owner's chat wore the bee. Being given a picture is not choosing one.
 *
 * IT IS ASKED OF THE BYTES AND NOT OF A NAME. The stored copy is a fresh row with a fresh id, so
 * nothing on the row says where it came from. Its bytes are the bee's bytes, and that is a fact
 * nothing can drift from: the digest of the offered file against the digest of the stored one.
 *
 * IT ONLY EVER HASHES A FILE THAT IS THE RIGHT LENGTH, and it remembers the answer for the life of
 * this process, keyed by the asset id. A list of thirty agents therefore reads the bee once and
 * hashes at most thirty small files once each.
 */
const WHETHER_IT_WAS_GIVEN = new Map<string, boolean>()
function isThePictureItWasGiven(avatarAssetId: string): boolean {
  const remembered = WHETHER_IT_WAS_GIVEN.get(avatarAssetId)
  if (remembered !== undefined) return remembered
  let answer = false
  try {
    const row = sqlite
      .prepare('SELECT path, bytes, licence_source AS licence FROM assets WHERE id = ?')
      .get(avatarAssetId) as { path: string | null; bytes: number | null; licence: string | null } | undefined
    // THE ROW SAYS SO ITSELF, for every picture given since that mark was written. No file is
    // opened, so this is also the answer on a database that has been copied away from its pictures
    // — which is what an isolated instance is, and where the reading below can say nothing.
    if (row?.licence === THE_PICTURE_WAS_GIVEN) {
      WHETHER_IT_WAS_GIVEN.set(avatarAssetId, true)
      return true
    }
    // New chosen rows declare that act through their own namespace, including a chosen copy of
    // the offered default. The byte-equality inference below is only for historical rows.
    if (avatarAssetId.startsWith(CHOSEN_UPLOAD)) {
      WHETHER_IT_WAS_GIVEN.set(avatarAssetId, false)
      return false
    }
    // AND FOR A ROW WRITTEN BEFORE THAT MARK EXISTED, the bytes answer: the digest of the offered
    // file against the digest of the stored one, and only ever for a file of exactly its length.
    const bee = offeredAvatarBytes(THE_DEFAULT_PICTURE.set, THE_DEFAULT_PICTURE.name)
    if (typeof bee.body !== 'string' && row !== undefined && row.path !== null && row.bytes === bee.body.length) {
      const file = join(databaseDirectoryFrom(settings().databasePath), row.path)
      answer =
        existsSync(file) &&
        createHash('sha256').update(readFileSync(file)).digest('hex') ===
          createHash('sha256').update(bee.body).digest('hex')
    }
  } catch {
    // THE ANSWER IS "NOT THE GIVEN ONE" AND IT IS NOT A GUESS. This checkout may hold no chill-bee
    // and an asset row may name a file that is gone; in both, nothing here can say the row is
    // wearing what it was given, so it is left with the picture its row names. Nothing is hidden:
    // the picture still draws, and `avatarOfferedTo` already answers the same way for the same
    // reason.
    answer = false
  }
  WHETHER_IT_WAS_GIVEN.set(avatarAssetId, answer)
  return answer
}

export function pictureShownFor(
  who: ParticipantRef,
  avatarAssetId: string,
  onOffer: readonly AvatarOnOffer[],
  /**
   * WHICH CARD THIS ONE HOLDS, for an agent that has chosen no picture. Criterion M75.
   *
   * Every agent builder in the chat was once wearing the bee, because the bee is what a participant
   * with no chosen picture is offered and no builder had chosen one. So an agent that chose nothing
   * wears the FIRST PORTRAIT OF THE CARD IT HOLDS, and the bee stays the default for a person.
   *
   * Null means one of two things and they are the same answer here: this is a person, or this agent
   * holds no card. Both keep the bee. A caller that does not know the role passes nothing and gets
   * exactly what it got before.
   */
  role: string | null = null,
  officeTest: (who: ParticipantRef) => boolean = isMoleOffice,
  assetRowOf?: (id: string) => AnAssetRowsProvenance | undefined,
): string {
  const offered = avatarOfferedTo(who, avatarAssetId, onOffer, officeTest, assetRowOf)
  // NULL IS A REAL ANSWER THREE TIMES OVER, and all three mean the row's own picture: somebody has
  // chosen one, this participant is Mole Office whose picture is nobody's to change, or this
  // checkout has not got chill-bee. Putting another animal in its place would be a stand-in served
  // under the default's name.
  // AND AN AGENT THAT CHOSE NOTHING WEARS ITS CARD'S FIRST PORTRAIT INSTEAD OF THE BEE. Criterion
  // M75. "Chose nothing" is two cases and both are here: the row still points at the drawing
  // (`offered` is not null), or the row holds the copy of the bee it was handed at the door. A
  // picture somebody really chose is never replaced, and a person is never given a portrait.
  if (who.kind === 'agent' && role !== null && role !== '') {
    if (offered !== null || isThePictureItWasGiven(avatarAssetId)) return theFirstPortraitOf(role)
  }
  if (offered === null) return avatarUrlFor(avatarAssetId)
  return offered.url
}

/**
 * GIVE A PARTICIPANT THE PICTURE IT IS OFFERED, and answer with the asset row, or null because it
 * is offered none.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT CHANGED ON 4 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M30 said an agent with no picture is OFFERED one, and `avatarOfferedTo` above still says
 * so in its own words: it is offered and never given. The rule is now the other way
 * (decision `HnoPsajfgR0A` on proposal `1V9UWM8nrBTD`): an agent that chose no picture when it
 * registered takes the one it is offered, nobody asked. So this is the giving, and it happens at
 * exactly one moment — when a registry row is first written.
 *
 * IT IS THE SAME DOOR A PERSON PRESSING THAT PICTURE GOES THROUGH. The bytes are read from the file
 * and stored by `storeUploadedAvatar`, which is what the picker does; there is no second way for a
 * picture to become somebody's. They are stored once: every later agent given the same bytes points at
 * the copy already stored (`theGivenCopyOf`).
 *
 * WHAT MOLE OFFICE DREW IS NOT DELETED. Its `assets` row stays where it is, so "use the drawn one"
 * still points at something and a person may go back to it. This changes which picture a new row
 * POINTS AT, and nothing else.
 *
 * NULL IS A REAL ANSWER twice over: the participant has already chosen a picture, or this checkout
 * offers none. Neither is a failure, and neither writes anything.
 */
export function giveTheOfferedPicture(
  who: ParticipantRef,
  avatarAssetId: string,
  by: ParticipantRef,
): string | null {
  const offered = avatarOfferedTo(who, avatarAssetId, avatarsOnOffer())
  if (offered === null) return null
  const found = offeredAvatarBytes(offered.set, offered.name)
  if (typeof found.body === 'string') return null
  // ONE STORED COPY FOR EVERY AGENT GIVEN IT. Decided for wave 13y round 30: until then each agent
  // got a copy of its own, 950 of the same 368,618 bytes on the copy of the owner's office made on 5 October 2026,
  // and a browser fetched each one at its own address. The copies already stored are left where they are.
  const shared = theGivenCopyOf(found.body)
  if (shared !== null) return shared
  return storeAvatarUpload(found.body, by, true).assetId
}

/**
 * THE COPY OF THE OFFERED PICTURE ALREADY GIVEN, or null because no stored copy holds these bytes.
 *
 * It is the newest row marked given whose file is there and holds exactly these bytes. A row whose file is gone, as
 * on a database copied away from its pictures, or whose bytes are an older drawing of the picture, would draw
 * something other than what the agent was offered, so it is passed over. Newest first, because if the picture is
 * redrawn every older copy stops matching, and an oldest-first search would read them all at each registration.
 */
function theGivenCopyOf(bytes: Buffer): string | null {
  const rows = sqlite
    .prepare(
      'SELECT id, path FROM assets WHERE licence_source = ? AND bytes = ? AND path IS NOT NULL ' +
        'ORDER BY created_at DESC, id DESC',
    )
    .all(THE_PICTURE_WAS_GIVEN, bytes.length) as { id: string; path: string }[]
  const folder = databaseDirectoryFrom(settings().databasePath)
  for (const row of rows) {
    const file = join(folder, row.path)
    if (existsSync(file) && readFileSync(file).equals(bytes)) return row.id
  }
  return null
}

/**
 * The bytes of one picture on offer.
 *
 * THE BYTES ARE READ TO FIND OUT WHAT THE FILE REALLY IS, exactly as an upload's are. A file in
 * this directory that is not a png is refused rather than served under a type nobody checked.
 */
export function offeredAvatarBytes(set: AvatarSetName, name: string): AvatarBytes {
  if (!A_PICTURE_NAME.test(name)) {
    throw new PanelError(
      `"${name}" is not the name of one of these pictures. A name here is lower-case letters, digits and ` +
        'hyphens. Nothing was read.',
      400,
    )
  }
  const file = join(avatarSetDirectory(set), `${name}.png`)
  if (!existsSync(file)) {
    throw new PanelError(`No picture called "${name}" is in the ${set} set.`, 404)
  }
  const bytes = readFileSync(file)
  const type = pictureTypeOf(bytes)
  if (type === null) {
    throw new PanelError(
      `The file for "${name}" in the ${set} set is not a png, whatever its name says. Nothing was served.`,
      500,
    )
  }
  // THESE FILES CHANGE WHEN SOMEBODY EDITS A DRAWING, so this is not the year an uploaded picture
  // gets. An hour is long enough that a picker drawing fifty pictures asks once.
  return { body: bytes, mime: type, cacheControl: 'public, max-age=3600' }
}
