// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { WordKey } from './i18n.ts'

// The person's words for these pictures are in the comment in messages.ts.
/**
 * THE NAME AND THE FILE ARE DECLARED TOGETHER because a name with no file is a picture that 404s
 * and a file with no name is a picture nobody can pick. The browser reads the name and builds an
 * address; the server reads the file and serves its bytes; neither can be added without the other.
 */
export interface CirclePicture {
  /** What it is called, which is also what the address says. */
  name: string
  /** The file under `design/avatars/circle` that draws it. */
  file: string
  /** The accessible name travels with the picture declaration. */
  word: WordKey
}

/**
 * THE FOUR THE PERSON KEPT, in the order they wrote them.
 *
 * WHY TWO ARE DRAWINGS AND TWO ARE PHOTOGRAPHS. The person kept six files: four pictures, and hand-drawn
 * copies of two of them. The button is 48 pixels across, and a drawing made at that size is crisp
 * where a picture made at 512 is not — so each of these takes the drawing where there is one. The
 * person chose the pictures; which file draws each of them at this size is an engineering answer.
 */
export const CIRCLE_PICTURES: readonly CirclePicture[] = [
  { name: 'mole-at-the-sill', file: 'mole-at-the-sill.svg', word: 'chat.picture.moleAtTheSill' },
  { name: 'three-moles-at-the-sill', file: 'three-moles-at-the-sill.png', word: 'chat.picture.threeMolesAtTheSill' },
  { name: 'mole-in-a-porthole', file: 'mole-in-a-porthole.svg', word: 'chat.picture.moleInAPorthole' },
  { name: 'two-moles-talking', file: 'two-moles-talking.png', word: 'chat.picture.twoMolesTalking' },
]

