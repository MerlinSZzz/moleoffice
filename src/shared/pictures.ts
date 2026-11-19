// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A REPORT DRAWS ITS PICTURES, FOR THIS VISIT ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT DECIDES WHETHER MEDIA LOAD, AND WHAT DECIDES WHETHER THEY ARE DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * TWO DIFFERENT FACTS, AND THEY WERE BRIEFLY TWO SETTINGS FOR ONE OF THEM.
 *
 * WHETHER MEDIA ARE FETCHED AT ALL is the person's own setting, criterion U5, declared in
 * `./mediaload.ts` and kept on their registry row: with the page, never, or on a press. It is the
 * one that decides whether Mole Office asks for the bytes, and it follows the person.
 *
 * WHETHER PICTURES ALREADY LOADED ARE DRAWN IN THIS REPORT is this file, and it is a way of reading
 * one report rather than a setting: the report's own control turns the pictures off for this visit
 * and the next visit starts drawn. That is why the only key here is a `sessionStorage` one.
 *
 * THERE USED TO BE A SECOND, DURABLE KEY — `mole-office.pictures`, in `localStorage` — and NOTHING
 * WROTE IT: no control anywhere called `setPictures`, and the Settings page had no panel for it. So
 * it was a setting the code read and could not be set, which is the ninth invariant sitting in this
 * file: two answers to one question, one of them dead. It is gone. The person's media-load setting
 * is the one that decides whether media load, and the per-visit key below is the only one this file
 * keeps.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHY IT IS NOT A SEAT IN THE DETAIL SYSTEM
 * ---------------------------------------------------------------------------------------
 *
 * A reader reading a report decides two separate things: HOW MUCH of it is drawn, and whether the
 * pictures are drawn with it. The first is the six-position ladder in `./detail.ts`. The second is
 * this file, and it is two words rather than six positions, because a picture is either there or
 * it is not.
 *
 * IT COULD NOT RIDE THE DETAIL KEY AND HERE IS WHY, MEASURED. `DETAIL_DEFAULTS` is declared
 * `as const satisfies Record<DetailSurface, Rung>`, and `DetailSurface` is a closed list of ten
 * RENDERING SURFACES whose own docblock says they are not dimensions. Storing `drawn` under a
 * detail key would either fail the typecheck or widen `Rung` so that any surface's detail could be
 * set to the word "drawn" — and inventing an eleventh surface called `reportPictures` would put a
 * dimension into `DETAIL_SURFACES`, into the settings grid's rows, and into the test in
 * `surfaces.ts` that every detail surface is claimed by a `uiSurface` entry.
 *
 * SO THE RULE IS SHARED AND THE VOCABULARY IS NOT. `readWithPrecedence` in `./detail.ts` walks
 * `DETAIL_PRECEDENCE` and takes a check on the value, so "here beats this surface beats everywhere
 * beats the default" is written once and read by both. The two vocabularies never meet.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT COUNTS AS A PICTURE, AND WHY A TABLE DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * A picture is a block whose whole content is an image somebody looks at: a `chart`, an `image`
 * and a `video`. A TABLE IS NOT ONE. The reports in this corpus carry their evidence sentences inside
 * tables, so leaving tables out of "Words only" would leave out the words. That is a judgement and
 * it is written down here so it can be overruled in one line rather than hunted for.
 */
import type { SummaryBlockType } from './types.ts'

/** The two answers. There is no third, because a picture is either drawn or it is not. */
export const PICTURES = ['drawn', 'left out'] as const

export type Pictures = (typeof PICTURES)[number]

/** What a reader who has said nothing gets. A report is drawn as it was written. */
export const PICTURES_DEFAULT: Pictures = 'drawn'

/** True when this value, which came out of storage and could be anything, is one of the two. */
export function isPictures(word: unknown): word is Pictures {
  return typeof word === 'string' && (PICTURES as readonly string[]).includes(word)
}

/**
 * Where a choice made for this visit only is kept. The only key this file has.
 *
 * THERE IS NO DURABLE KEY BESIDE IT ANY MORE, and that is the point of the section above: whether
 * media load is the person's setting in `./mediaload.ts`, and this is a way of reading one report.
 */
export const PICTURES_KEY_HERE = 'mole-office.pictures.local'

/**
 * THE BLOCK TYPES THAT ARE A PICTURE. See the note above for why a table is not one.
 *
 * A list of types rather than a flag on each block: whether a chart is a picture is a fact about
 * charts, not about one author's chart, so nothing stored can disagree with it.
 */
// A `video` BLOCK IS ONE: a film is looked at, as a video in an image block
// already is. An `audio` block is not: nothing in it is looked at.
export const IS_A_PICTURE: readonly SummaryBlockType[] = ['chart', 'image', 'video']

/** True when a block of this type is one of the pictures "left out" leaves out. */
export function isAPicture(type: SummaryBlockType): boolean {
  return IS_A_PICTURE.includes(type)
}
