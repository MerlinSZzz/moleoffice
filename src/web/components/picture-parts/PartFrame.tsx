// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. The frame every picture part draws in: its label, and the words for a state with no data.
import type { ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import type { PartName, PartState } from '@shared/picture-parts.ts'
import { Absence } from '../ui.tsx'

/**
 * THE FRAME OF ONE PICTURE PART. It draws the figure's label, and below it the part's drawing when the data is ready.
 * In place of the drawing it says in a short word that the data is being read, could not be read, or was recorded by
 * nobody. The last two are told apart by shape as well as by word, as `Absence` draws them: not read is a gap
 * somebody can go and close, and not recorded is an answer.
 *
 * Every part draws inside this frame, so the three words are written in one place and no part can draw a state
 * with no data as a zero or as a blank. The frame also draws the part's own stylesheet, in every state.
 */
export function PartFrame<D>({ part, label, state, css, children }: { part: PartName; label: string; state: PartState<D>; css: string; children: (data: D) => ReactNode }) {
  return (
    <figure className="pp-part" data-part={part} data-part-state={state.status}>
      <style href="mole-office-picture-part-frame" precedence="default">{PART_FRAME_CSS}</style>
      <style href={`mole-office-picture-part-${part}`} precedence="default">{css}</style>
      <figcaption className="pp-label">{label}</figcaption>
      {state.status === 'ready' ? children(state.data)
        : state.status === 'loading' ? <p className="pp-state" role="status">{t('pictureParts.reading')}</p>
        : state.status === 'missing' ? (
          <p className="pp-state">
            <Absence tier="told-apart" looked={false} word={t('pictureParts.notRead')} title={state.reason} />
          </p>
        ) : (
          <p className="pp-state">
            <Absence tier="told-apart" looked={true} word={t('pictureParts.notRecorded')} title={t('pictureParts.notRecordedSays')} />
          </p>
        )}
    </figure>
  )
}

/** A list with no row: the short word none, in the place the rows would be. */
export function NoRows() {
  return <p className="pp-state"><Absence word={t('absence.none')} /></p>
}

// Each part is its own container, so a part reads its own width and not the screen's: one placed in a narrow column
// of a wide page lays itself out as on a phone. Nothing here sets a width, so a part is never wider than its column.
export const PART_FRAME_CSS = `
.pp-part {
  container-type: inline-size;
  margin: 0;
  min-inline-size: 0;
  display: grid;
  gap: var(--pad);
  font-family: var(--font-ui);
  color: var(--text);
}
.pp-label {
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.pp-state {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.pp-sr {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.pp-num {
  font-family: var(--font-num);
  font-weight: var(--num-weight);
  font-variant-numeric: tabular-nums;
}
`
