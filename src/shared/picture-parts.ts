// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PLAIN SHAPE FOR THE PICTURE PARTS ON HOME. A figure's read answers in its own shape. A small function turns the
 * answer into one of these, and a part in src/web/components/picture-parts/ draws it. A part takes this shape and
 * nothing else, so a new figure on home is a data entry and a choice of part, with no new part code.
 *
 * FOUR STATES, AND A PART DRAWS EACH ONE DIFFERENTLY:
 *
 *   ready         the data. It may hold a zero, and a zero is a count somebody made, so it is drawn as the number 0.
 *   loading       the read has not answered yet.
 *   missing       the read did not answer, or it answered without this figure. The reason says which.
 *   not-recorded  the read answered, and nobody has recorded this figure. It is not a zero and is never drawn as one.
 *
 * THE LABEL IS GIVEN BESIDE THE STATE, NOT INSIDE THE DATA, so a part that is still loading or could not be read still
 * says which figure it is.
 */

export type PartState<D> =
  | { status: 'ready'; data: D }
  | { status: 'loading' }
  | { status: 'missing'; reason: string }
  | { status: 'not-recorded' }

/** What every part takes: the figure's label, in the reader's words, and its state. */
export interface PartInput<D> {
  label: string
  state: PartState<D>
}

/** One number and its unit, already in the reader's words, or no unit. */
export interface BigNumberData {
  value: number
  unit: string | null
}

/** Rows of a label and a value, one bar each, drawn in the order given. */
export interface BarsData {
  rows: readonly { label: string; value: number }[]
}

/** How many are done out of how many in all. */
export interface ProgressData {
  done: number
  total: number
}

/** A cell is words or a number, or null where nobody recorded it. */
export type TableCell = string | number | null

/** Column titles, and rows of cells in the same order as the columns. */
export interface TableData {
  columns: readonly string[]
  rows: readonly (readonly TableCell[])[]
}

/**
 * One value for each day, in the order the days are drawn, with each day as a `YYYY-MM-DD` key. Give every day of the
 * range: the days are drawn evenly apart, and a day whose value is null is one nobody recorded, which breaks the line.
 */
export interface PointsByDayData {
  points: readonly { day: string; value: number | null }[]
}

/** A title and a text, both in the reader's words. */
export interface TextCardData {
  title: string
  text: string
}

/** Each part by its name, with the data it draws. src/web/components/picture-parts/parts.tsx draws one for each name. */
export interface PartDataByName {
  'big-number': BigNumberData
  bars: BarsData
  progress: ProgressData
  table: TableData
  'line-over-days': PointsByDayData
  'text-card': TextCardData
}

export type PartName = keyof PartDataByName
