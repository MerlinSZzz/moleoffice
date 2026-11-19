// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SOUND AND FILM FORMATS A REPORT PLAYS IN THE PAGE.
 *
 * A report is to carry voice samples of about twenty seconds, in Chinese and in English, and the
 * studio will have sample films. So a report has an `audio` block and a `video` block, and each
 * plays a file the office keeps.
 *
 * THIS FILE IS THE ONE LIST OF THOSE FORMATS. Four places read it:
 *
 *   - the upload door (src/server/lib/reportfiles.ts) checks that a file NAMED as one of these
 *     really begins with that format's bytes;
 *   - the record door (src/server/lib/summary.ts) refuses an audio or video block whose file is
 *     not one of these;
 *   - the file door (src/server/api/files.ts) says what type the bytes are from the extension;
 *   - the page (src/web/components/ReportMedia.tsx) knows which player the door's type means.
 *
 * A second list anywhere would be free to disagree with this one, and a block accepted by the record
 * door would then be a file the file door serves as bytes of no known type.
 *
 * THE FORMAT IS READ FROM THE FILE'S EXTENSION. The record door may not read the disk, so the
 * extension is what it can check. The upload door is what makes the extension true: it reads the
 * first bytes of a file with one of these names, and refuses the file when they are not that format.
 */

/** The block types that play a file. */
export const MEDIA_BLOCK_TYPES = ['audio', 'video'] as const
export type MediaBlockType = (typeof MEDIA_BLOCK_TYPES)[number]

export interface MediaFormat {
  /** The file name's ending, lower case, with its dot. */
  extension: string
  /** The format as a person names it. */
  name: string
  /** Which block plays it. */
  block: MediaBlockType
  /** The type the file door serves it as. */
  contentType: string
  /** What every file of this format begins with, as a sentence ends: "begins with ...". */
  firstBytes: string
  /** Whether these bytes begin as a file of this format does. The upload door asks it. */
  beginsAsItShould: (bytes: Uint8Array) => boolean
}

/** Whether `bytes` holds `word`, in ASCII, starting at `at`. */
function holds(bytes: Uint8Array, at: number, word: string): boolean {
  if (bytes.length < at + word.length) return false
  for (let i = 0; i < word.length; i++) if (bytes[at + i] !== word.charCodeAt(i)) return false
  return true
}

/** An MP4 container, whether it holds sound (m4a) or film (mp4): a box of type "ftyp" comes first. */
const anMp4Container = (bytes: Uint8Array): boolean => holds(bytes, 4, 'ftyp')
const AN_MP4_CONTAINER = 'has "ftyp" at byte 4'

/**
 * WAV, MP3 AND M4A ARE SOUND; MP4 AND WEBM ARE FILM. The five the decision's brief names.
 *
 * An m4a file and an mp4 file are the same container. The extension is what says which one somebody
 * meant, so m4a is played as sound and mp4 as film.
 */
export const MEDIA_FORMATS: readonly MediaFormat[] = [
  {
    extension: '.wav', name: 'WAV', block: 'audio', contentType: 'audio/wav',
    firstBytes: 'begins with "RIFF" and has "WAVE" at byte 8',
    beginsAsItShould: (bytes) => holds(bytes, 0, 'RIFF') && holds(bytes, 8, 'WAVE'),
  },
  {
    // An MP3 file begins with its ID3 tag when it has one, and with an MPEG audio frame when it has
    // none: eleven bits set, the frame's sync word.
    extension: '.mp3', name: 'MP3', block: 'audio', contentType: 'audio/mpeg',
    firstBytes: 'begins with an ID3 tag or an MPEG audio frame',
    beginsAsItShould: (bytes) =>
      holds(bytes, 0, 'ID3') || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0),
  },
  {
    extension: '.m4a', name: 'M4A', block: 'audio', contentType: 'audio/mp4',
    firstBytes: AN_MP4_CONTAINER, beginsAsItShould: anMp4Container,
  },
  {
    extension: '.mp4', name: 'MP4', block: 'video', contentType: 'video/mp4',
    firstBytes: AN_MP4_CONTAINER, beginsAsItShould: anMp4Container,
  },
  {
    extension: '.webm', name: 'WebM', block: 'video', contentType: 'video/webm',
    firstBytes: 'begins with the four bytes 1A 45 DF A3',
    beginsAsItShould: (bytes) =>
      bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
  },
]

/** The format a file name or path ends in, or null when it ends in none of the five. */
export function mediaFormatOf(nameOrPath: string): MediaFormat | null {
  const lower = nameOrPath.toLowerCase()
  return MEDIA_FORMATS.find((format) => lower.endsWith(format.extension)) ?? null
}

/** The extensions one block type plays, as a person reads a list: ".wav, .mp3 or .m4a". */
export function extensionsSaid(block: MediaBlockType): string {
  const ends = MEDIA_FORMATS.filter((format) => format.block === block).map((format) => format.extension)
  return ends.length === 1 ? ends[0]! : `${ends.slice(0, -1).join(', ')} or ${ends[ends.length - 1]!}`
}

/**
 * Which player the file door's content type asks for, or null when it asks for neither.
 *
 * Read from what the door said, as `isAVideo` in SummaryBlocks.tsx reads it, and never from the name.
 */
export function playerForType(type: string | null): MediaBlockType | null {
  if (type === null) return null
  const said = type.trim().toLowerCase()
  if (said.startsWith('audio/')) return 'audio'
  if (said.startsWith('video/')) return 'video'
  return null
}
