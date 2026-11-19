// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE SHAPES OF A BULK LINK READ, AND THE FIELDS EACH ONE KEEPS.
 *
 * `GET /api/links` answers the whole graph by default. A page that draws part of it asks for a
 * shape, and the shape's fields are named once here: the door cuts every row by this list, and a
 * page's type for a shape is `Pick`ed from the same list, so the two cannot say different things.
 *
 * A shape is not a new link model. Every field named is a field the bulk read already answers; a
 * shape only leaves the others out. `LinkAnswered` is the type a page reads, built from `Link` and
 * `LinkGate` in shared/types.ts plus the two fields the bulk read adds (`broken` and `carries`).
 */
import type { Link, LinkGate } from './types.ts'

const LINK_SHAPES = ['draw', 'answer', 'ends'] as const

/** One of the three words `GET /api/links?shape=` accepts. */
export type LinkShape = (typeof LINK_SHAPES)[number]

/**
 * Every field any shape may keep. A field is one of the stored link's own fields, one of the gate
 * fields every bulk row carries, or one of the two the bulk read adds.
 */
export type AFieldOfALink = keyof Link | keyof LinkGate | 'broken' | 'carries'

/**
 * WHAT EACH SHAPE KEEPS. The server cuts by this; a page types its rows by it.
 *
 * `draw`   a drawing: the two ends, the type, whether the office inferred it, whether an end is
 *          gone, and the gate as stored, with its problem when it cannot be read.
 * `answer` the Goals page's answer rows: who wrote the link and when, with its two ends and type.
 * `ends`   a page that joins two kinds and draws only the connection.
 */
export const THE_FIELDS_OF_A_LINK_SHAPE = {
  draw: ['id', 'fromId', 'toId', 'type', 'inferred', 'broken', 'gate', 'gateProblem', 'carries'],
  answer: ['fromId', 'toId', 'type', 'createdAt', 'createdBy', 'createdByType'],
  ends: ['fromId', 'toId'],
} as const satisfies Readonly<Record<LinkShape, readonly AFieldOfALink[]>>

/** The three words, as a tuple zod and every caller can read without a second list. */
export const LINK_SHAPE_NAMES = LINK_SHAPES

/**
 * A LINK AS ONE SHAPE ANSWERS IT. `T` is the row the reader starts from — the bulk door's
 * `WorkspaceLink` on the server and in the browser, or any object with the same fields in a test —
 * and the result keeps only the fields `THE_FIELDS_OF_A_LINK_SHAPE` names for `S`.
 */
export type LinkAnswered<T extends object, S extends LinkShape> = Pick<
  T,
  Extract<(typeof THE_FIELDS_OF_A_LINK_SHAPE)[S][number], keyof T>
>

/** The bulk read's own row: a stored link, its gate fields, and whether an end is gone. */
export type LinkOnTheWire = Link &
  LinkGate & {
    broken: boolean
    carries?: string | null
  }
