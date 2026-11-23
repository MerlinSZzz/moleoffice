// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: a line over days, with the last day's value.
import { count, t, writtenDay } from '@shared/i18n.ts'
import { readDayKey } from '@shared/planning.ts'
import type { PartInput, PointsByDayData } from '@shared/picture-parts.ts'
import { Absence } from '../ui.tsx'
import { NoRows, PartFrame } from './PartFrame.tsx'

/** The drawing's own box. The line is stretched to the part's width, and its stroke keeps its width as it stretches. */
const BOX = { width: 100, height: 40 }

/**
 * THE LINE'S PIECES, ONE FOR EACH RUN OF DAYS THAT WERE RECORDED. The days are evenly apart in the order given. A day
 * nobody recorded is a gap in the line, never a fall to 0. The lowest point is 0 or the lowest value, whichever is
 * lower, so a line of small values is not drawn as if it began at nothing. A piece of one day is two equal points,
 * which the round end of the stroke draws as a dot.
 */
export function piecesOfTheLine(points: PointsByDayData['points']): string[] {
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]))
  const low = Math.min(0, ...values)
  const high = Math.max(low + 1, ...values)
  const pieces: string[][] = []
  let piece: string[] | null = null
  points.forEach((point, index) => {
    if (point.value === null) {
      piece = null
      return
    }
    const x = points.length === 1 ? BOX.width / 2 : (index / (points.length - 1)) * BOX.width
    const y = BOX.height - ((point.value - low) / (high - low)) * BOX.height
    const at = `${x.toFixed(2)},${y.toFixed(2)}`
    if (piece === null) {
      piece = []
      pieces.push(piece)
    }
    piece.push(at)
  })
  return pieces.map((one) => (one.length === 1 ? `${one[0]} ${one[0]}` : one.join(' ')))
}

/** A day key in the reader's words, or the key as it is when it is not a day. */
function dayInWords(day: string): string {
  const when = readDayKey(day)
  return when === null ? day : writtenDay(when, { day: 'numeric', month: 'short' })
}

/**
 * A LINE OVER DAYS. Above it, the last day's value, or the quiet dash when nobody recorded that day; under it, the
 * first day and the last. Every day and its value is also a list read out to a screen reader, because the line
 * itself is hidden from one.
 */
export function LineOverDays({ label, state }: PartInput<PointsByDayData>) {
  return (
    <PartFrame part="line-over-days" label={label} state={state} css={LINE_OVER_DAYS_CSS}>
      {({ points }) => {
        const first = points[0]
        const last = points[points.length - 1]
        if (first === undefined || last === undefined) return <NoRows />
        return (
          <div className="pp-line">
            <p className="pp-line-last" aria-hidden="true">
              {last.value === null ? <Absence title={t('pictureParts.notRecordedSays')} /> : <b className="pp-num">{count(last.value)}</b>}
            </p>
            <svg className="pp-line-drawing" viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
              {piecesOfTheLine(points).map((piece, index) => <polyline key={index} points={piece} vectorEffect="non-scaling-stroke" />)}
            </svg>
            <p className="pp-line-days" aria-hidden="true">
              <span>{dayInWords(first.day)}</span>
              {points.length > 1 ? <span>{dayInWords(last.day)}</span> : null}
            </p>
            <ol className="pp-sr">
              {points.map((point, index) => (
                <li key={index}>
                  {t('pictureParts.dayValue', { day: dayInWords(point.day), value: point.value === null ? t('pictureParts.notRecorded') : count(point.value) })}
                </li>
              ))}
            </ol>
          </div>
        )
      }}
    </PartFrame>
  )
}

export const LINE_OVER_DAYS_CSS = `
.pp-line {
  display: grid;
  gap: calc(var(--pad) / 2);
  min-inline-size: 0;
}
.pp-line-last {
  margin: 0;
  font-size: var(--fs-4);
  line-height: var(--lh-tight);
  color: var(--text);
}
.pp-line-drawing {
  display: block;
  inline-size: 100%;
  block-size: 4rem;
  overflow: visible;
}
.pp-line-drawing polyline {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pp-line-days {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: var(--pad);
  font-size: var(--fs-1);
  color: var(--text-3);
}
`
