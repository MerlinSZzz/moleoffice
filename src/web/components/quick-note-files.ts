// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PICTURE OR A FILM COMES INTO A QUICK NOTE: pasted, dropped on the sheet, or chosen with Add a picture.
 *
 * EACH FILE IS CHECKED BEFORE ANYTHING IS STORED. A picture is a file the browser says is an image. A film is one it
 * says is a video, and it is kept only under one of the film endings the office plays (MEDIA_FORMATS in
 * src/shared/reportmedia.ts), because the kind refuses a film part whose path ends in another
 * (src/shared/kinds/quick-note.ts). A file larger than the file door serves back is refused, and so is one this browser
 * cannot open, because the size it is drawn at could not be read from it.
 *
 * A FILE IS DRAWN AT ITS OWN SIZE, OR SMALLER IN ITS OWN SHAPE: at most 480 pixels wide, and no wider than the room it
 * is given, so a picture pasted in the small note window does not run past the window's edge. Its bytes go to POST
 * /api/report-files, and the part keeps the path, name, size and hash the door hands back, never the bytes.
 */
import { t } from '@shared/i18n.ts'
import { sizeSaid } from '@shared/fileblocks.ts'
import type { QuickNotePicture, QuickNoteVideo } from '@shared/kinds/quick-note.ts'
import { MAX_PREVIEW_BYTES } from '@shared/preview-limit.ts'
import { extensionsSaid, mediaFormatOf } from '@shared/reportmedia.ts'
import { api, errorMessage } from '../api.ts'
import { asBase64 } from './PictureToSend.tsx'

/** How wide a picture or a film is drawn at most, in pixels of the sheet, so a line of them stays easy to take in. */
const A_FILE_IS_AT_MOST = 480

/** A picture or a film for the note, before it is given its id and its place. */
export type AFilePart = Omit<QuickNotePicture, 'id' | 'x' | 'y'> | Omit<QuickNoteVideo, 'id' | 'x' | 'y'>

/** What came of one file: the part it makes, or the reason it was not added. */
export type WhatAFileGave = { part: AFilePart } | { refused: string }

/** The size a file is drawn at: its own, or narrower in its own shape when it is wider than the room or the most. */
export function fitted(width: number, height: number, room: number): { width: number; height: number } {
  const most = Math.max(1, Math.min(A_FILE_IS_AT_MOST, room))
  if (width <= most) return { width, height }
  return { width: most, height: Math.max(1, Math.round((height * most) / width)) }
}

/** Whether a file is a picture or a film a note keeps, or why it is not. */
function whatItIs(file: File): { type: 'picture' | 'video' } | { refused: string } {
  if (file.type.startsWith('image/')) return { type: 'picture' }
  if (!file.type.startsWith('video/')) return { refused: t('quickNote.picture.notAPictureOrFilm') }
  if (mediaFormatOf(file.name)?.block === 'video') return { type: 'video' }
  return { refused: t('quickNote.picture.notAFilmFormat', { endings: extensionsSaid('video') }) }
}

/** How big a picture or a film is, as this browser opens it, or null when this browser cannot open it. */
async function sizeOf(file: File, type: 'picture' | 'video'): Promise<{ width: number; height: number } | null> {
  const address = URL.createObjectURL(file)
  try {
    if (type === 'picture') {
      const picture = new Image()
      picture.src = address
      await picture.decode()
      return picture.naturalWidth > 0 && picture.naturalHeight > 0 ? { width: picture.naturalWidth, height: picture.naturalHeight } : null
    }
    const film = document.createElement('video')
    film.preload = 'metadata'
    film.muted = true
    const opened = await new Promise<boolean>((done) => {
      film.onloadedmetadata = () => done(true)
      film.onerror = () => done(false)
      film.src = address
    })
    return opened && film.videoWidth > 0 && film.videoHeight > 0 ? { width: film.videoWidth, height: film.videoHeight } : null
  } catch {
    // A PICTURE THAT DOES NOT DECODE is one this browser cannot open, and the caller says so.
    return null
  } finally {
    URL.revokeObjectURL(address)
  }
}

/**
 * CHECK ONE FILE, READ ITS SIZE AND STORE ITS BYTES, and hand back the part it makes, drawn no wider than `room`, or
 * the reason it was not added. A refusal from the office is said in the office's own words.
 */
export async function aPartFrom(file: File, room: number): Promise<WhatAFileGave> {
  const what = whatItIs(file)
  if ('refused' in what) return what
  if (file.size > MAX_PREVIEW_BYTES) {
    return { refused: t('quickNote.picture.tooBig', { size: sizeSaid(file.size), most: sizeSaid(MAX_PREVIEW_BYTES) }) }
  }
  const size = await sizeOf(file, what.type)
  if (size === null) return { refused: t('quickNote.picture.unreadable') }
  try {
    const stored = await api.storeANoteFile(await asBase64(file), file.name)
    const drawn = fitted(size.width, size.height, room)
    return { part: what.type === 'picture' ? { type: 'picture', ...drawn, ...stored } : { type: 'video', ...drawn, ...stored } }
  } catch (err) {
    return { refused: errorMessage(err) }
  }
}
