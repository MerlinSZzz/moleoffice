// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE CARD PORTRAITS ON THIS MACHINE: which there are, and the file of one.
 *
 * ---------------------------------------------------------------------------------------
 * TWO ROOTS AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P47. A role's three are `design/portraits/<role>/`, in the checkout, and they are the
 * same three for everybody holding that card. Somebody's own picture is
 * `data/portraits/custom/<who>/`, which `.gitignore` keeps out of the repository: a custom picture is
 * kept in a folder of its own and never uploaded.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A ROUTE OF ITS OWN AND NOT `GET /api/file`
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/file` serves a path a record already points at, and its whole design is that the caller
 * names an absolute path which is then checked five ways. That is the right shape for a file
 * somebody's own record points at somewhere on their disk. It is the wrong shape for a picture that
 * ships with this product: an absolute path stored on a record is a path on ONE machine and on one
 * checkout, so a card copied here and merged there would name a file that is not there.
 *
 * So a portrait is named the way an avatar is: by which folder it is in and what it is called, with
 * no path anywhere. The confinement is stricter than the file route's rather than looser — the
 * caller cannot express a path at all. A name is refused unless it is plain (see
 * `isAPlainPortraitName`), the folder is one of exactly two, and the file is read from a directory
 * this function builds itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing writes a portrait. The pictures are painted outside this product and put in a folder; this
 * lists what is in the folder and names the one file to send. The one thing it writes is a small copy of a
 * picture, in its own folder beside the database (see `smallPortraitToSend`), and never over the
 * picture itself. A missing folder is an empty list and says so — a
 * fresh checkout of this repository has the role folders and no custom one at all, and that is a
 * state rather than a fault.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'

import { DATA_ROOT, settings, whereThePublicFileIs } from '../../config/settings.mjs'
import {
  PORTRAITS_IN_THE_CHECKOUT,
  PORTRAITS_KEPT_HERE,
  SMALL_PORTRAIT_WIDTH,
  isAPlainPortraitName,
  portraitAddress,
  theFirstPortraitOf,
  type PortraitOnOffer,
  type PortraitSet,
} from '@shared/portraits.ts'
import { PanelError } from './panel-error.ts'
import { smallPngOf } from './smallpicture.ts'

/** What a portrait file may be. The three the painter writes, and nothing else is offered or read. */
const WHAT_A_PORTRAIT_IS: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

/** The folder one set's pictures are in. Built here, never taken from a request. */
export function portraitDirectory(set: PortraitSet, of: string): string {
  // The role set ships with the code; the custom set is data, kept under the data root.
  return set === 'role'
    ? join(whereThePublicFileIs(PORTRAITS_IN_THE_CHECKOUT), of)
    : join(DATA_ROOT, ...PORTRAITS_KEPT_HERE.split('/'), of)
}

/**
 * EVERY PORTRAIT IN ONE FOLDER, by name, in the order the disk gives sorted.
 *
 * A folder that is not there is an empty list. That is the ordinary state of the custom folder on a
 * machine where nobody has put a picture in it, and it is not an error.
 */
export function portraitsIn(set: PortraitSet, of: string): PortraitOnOffer[] {
  if (!isAPlainPortraitName(of)) return []
  const dir = portraitDirectory(set, of)
  if (!existsSync(dir)) return []
  let held: string[]
  try {
    held = readdirSync(dir)
  } catch {
    // Handled: the folder cannot be read, so nothing is offered from it. Saying there are none is
    // the honest answer to "what is in it"; inventing a name would offer an address that 404s.
    return []
  }
  return held
    .filter((file) => Object.prototype.hasOwnProperty.call(WHAT_A_PORTRAIT_IS, extname(file).toLowerCase()))
    .map((file) => file.slice(0, file.length - extname(file).length))
    .filter((name) => isAPlainPortraitName(name))
    .sort()
    .map((name) => ({ set, of, name, address: portraitAddress(set, of, name) }))
}

/**
 * THE FIRST OF A ROLE'S DRAWINGS, OR NULL WHEN THAT DRAWING IS NOT ON THIS MACHINE. Problem HeAu5V4oRmjn.
 *
 * `theFirstPortraitOf` builds an address and asks nothing, so a card with no drawings (the mail tool's
 * mailer card) was given an address that answers nothing, and the Embassy drew a broken picture. This
 * asks the folder first. Null is what a row draws the office's own placeholder for.
 */
export function theFirstPortraitThatExists(role: string): string | null {
  const first = theFirstPortraitOf(role)
  return portraitsIn('role', role).some((one) => one.address === first) ? first : null
}

/**
 * The file one portrait is sent from, its type and how long a browser may keep it. The route sends it from the
 * file and does not read it whole first (wave 13y round 34).
 */
export interface PortraitToSend {
  path: string
  mime: string
  cacheControl: string
}

/**
 * THE FILE OF ONE PORTRAIT, or a refusal saying which of the three things was wrong.
 *
 * The name is checked before anything is joined to a path, the folder is one of two this function
 * builds, and a file that is not a picture is refused by its extension rather than by its content —
 * the same rule the listing uses, so nothing can be read that could not have been listed.
 */
export function portraitToSend(set: PortraitSet, of: string, name: string): PortraitToSend {
  const file = portraitFile(set, of, name)
  return { path: file.path, mime: file.mime, cacheControl: PORTRAIT_CACHE }
}

// A YEAR, AND THE ADDRESS IS THE WHOLE OF THE IDENTITY. A portrait is a file somebody put in a
// folder and it does not change under its own name; a repainted one is a new name.
const PORTRAIT_CACHE = 'public, max-age=31536000, immutable'

/** The file one portrait is, found the way `portraitToSend` documents, or the refusal. */
function portraitFile(set: PortraitSet, of: string, name: string): { path: string; mime: string } {
  if (!isAPlainPortraitName(of) || !isAPlainPortraitName(name)) {
    throw new PanelError(
      `"${of}/${name}" is not a portrait this reads. A folder and a picture are each a plain name: letters, ` +
        'digits, dash, dot and underscore, and no slash and no "..". Nothing was read.',
      400,
    )
  }
  const dir = portraitDirectory(set, of)
  for (const extension of Object.keys(WHAT_A_PORTRAIT_IS)) {
    const path = join(dir, `${name}${extension}`)
    if (!existsSync(path)) continue
    if (!statSync(path).isFile()) continue
    return { path, mime: WHAT_A_PORTRAIT_IS[extension] as string }
  }
  throw new PanelError(
    `There is no portrait called "${name}" for ${set === 'role' ? `the ${of} role` : of}. ` +
      `GET /api/portraits names what there is. Looked in ${dir}.`,
    404,
  )
}

/** The folder the small copies are kept in: `portrait-copies/`, beside the database. */
export const PORTRAIT_COPY_DIRECTORY = 'portrait-copies'

export function portraitCopyDirectory(): string {
  return join(dirname(resolve(settings().databasePath)), PORTRAIT_COPY_DIRECTORY)
}

/** One portrait as the small address serves it, and what was served in words. */
export interface SmallPortraitToSend extends PortraitToSend {
  /** "small copy, 320 of 1024 pixels wide", or "the whole picture, because ..." */
  served: string
}

/**
 * A PORTRAIT AT THE SIZE THE PAGES DRAW IT, MADE ONCE AND KEPT. Round 10 of wave 13x.
 *
 * Five portraits of about 1 MB each made the Role cards page's first load 14.0 MB, and the largest is
 * drawn 156 pixels wide. The copy is `SMALL_PORTRAIT_WIDTH` pixels wide and about 100 KB.
 *
 * THE PICTURE ITSELF IS NOT TOUCHED. The copy is a file of its own under `portraitCopyDirectory()`,
 * named by the picture's folder, name, size and time of change, so a picture replaced under its own
 * name gets a new copy instead of an old one. The address a person chose is the picture's own and
 * does not change; a page asks for `?size=small` when it draws it.
 *
 * A PICTURE THIS CANNOT SHRINK IS SERVED WHOLE AND SAYS SO. `smallPngOf` reads 8-bit RGB and RGBA
 * PNGs, which every role portrait is; a JPEG or WebP somebody put in their own folder is sent as it is,
 * and `served` says why, so the reply never claims a copy it did not make.
 */
export function smallPortraitToSend(set: PortraitSet, of: string, name: string): SmallPortraitToSend {
  const file = portraitFile(set, of, name)
  const stat = statSync(file.path)
  const copy = join(
    portraitCopyDirectory(),
    set,
    of,
    `${name}${extname(file.path)}-${String(SMALL_PORTRAIT_WIDTH)}-${String(stat.size)}-${String(Math.floor(stat.mtimeMs))}.png`,
  )
  if (existsSync(copy)) {
    return { path: copy, mime: 'image/png', cacheControl: PORTRAIT_CACHE, served: `the kept small copy, ${String(SMALL_PORTRAIT_WIDTH)} pixels wide` }
  }
  // ONLY A PNG IS READ WHOLE, because shrinking it reads every pixel; any other picture is sent from its file.
  const small = file.mime === 'image/png' ? smallPngOf(readFileSync(file.path), SMALL_PORTRAIT_WIDTH) : { made: false as const, why: `the picture is ${file.mime}, and only a PNG is shrunk` }
  if (!small.made) {
    return { path: file.path, mime: file.mime, cacheControl: PORTRAIT_CACHE, served: `the whole picture, because ${small.why}` }
  }
  mkdirSync(dirname(copy), { recursive: true })
  // Written under another name and renamed, so a reader at the same moment never meets half a file.
  const writing = `${copy}.${String(process.pid)}.writing`
  writeFileSync(writing, small.body)
  renameSync(writing, copy)
  return {
    path: copy,
    mime: 'image/png',
    cacheControl: PORTRAIT_CACHE,
    served: `a small copy made now, ${String(small.width)} of ${String(small.fromWidth)} pixels wide`,
  }
}
