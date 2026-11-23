// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The picture parts by name, and the one component that draws any of them.
import type { ReactNode } from 'react'
import type { PartDataByName, PartInput, PartName, PartState } from '@shared/picture-parts.ts'
import { BarPerRow, BAR_PER_ROW_CSS } from './BarPerRow.tsx'
import { BigNumber, BIG_NUMBER_CSS } from './BigNumber.tsx'
import { LineOverDays, LINE_OVER_DAYS_CSS } from './LineOverDays.tsx'
import { ProgressBar, PROGRESS_BAR_CSS } from './ProgressBar.tsx'
import { SmallTable, SMALL_TABLE_CSS } from './SmallTable.tsx'
import { TextCard, TEXT_CARD_CSS } from './TextCard.tsx'

type PartTable = { [P in keyof PartDataByName]: { draw: (input: PartInput<PartDataByName[P]>) => ReactNode; css: string } }

/** EVERY PICTURE PART, BY THE NAME A FIGURE CHOOSES IT BY, with its stylesheet. A new part is one more line here. */
export const PARTS: PartTable = {
  'big-number': { draw: BigNumber, css: BIG_NUMBER_CSS },
  bars: { draw: BarPerRow, css: BAR_PER_ROW_CSS },
  progress: { draw: ProgressBar, css: PROGRESS_BAR_CSS },
  table: { draw: SmallTable, css: SMALL_TABLE_CSS },
  'line-over-days': { draw: LineOverDays, css: LINE_OVER_DAYS_CSS },
  'text-card': { draw: TextCard, css: TEXT_CARD_CSS },
}

/** A part's name with its label and a state of the data that part draws, so a name cannot be given another part's data. */
export type NamedPart = { [P in PartName]: { name: P; label: string; state: PartState<PartDataByName[P]> } }[PartName]

/** Draws the part a figure names, with the figure's label and state. */
export function Part({ name, label, state }: NamedPart) {
  return partDrawn(name, label, state)
}

/** The part of this name, drawn with this label and state: the one place a part is chosen by its name. */
export function partDrawn<P extends PartName>(name: P, label: string, state: PartState<PartDataByName[P]>) {
  const Draw = PARTS[name].draw
  return <Draw label={label} state={state} />
}
