// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: a bar per row, each with its label and its number.
import { count } from '@shared/i18n.ts'
import type { BarsData, PartInput } from '@shared/picture-parts.ts'
import { NoRows, PartFrame } from './PartFrame.tsx'

/**
 * ONE BAR PER ROW, IN THE ORDER GIVEN. The longest bar is the largest value, and every other bar is as long beside it as
 * its value is beside the largest. The number is written at the bar's end, so a bar of 0 is an empty track and the
 * number 0. A list with no row says none.
 */
export function BarPerRow({ label, state }: PartInput<BarsData>) {
  return (
    <PartFrame part="bars" label={label} state={state} css={BAR_PER_ROW_CSS}>
      {({ rows }) => {
        if (rows.length === 0) return <NoRows />
        const largest = Math.max(...rows.map((row) => row.value))
        return (
          <ul className="pp-bars">
            {rows.map((row, index) => (
              <li className="pp-bar-row" key={index}>
                <span className="pp-bar-label">{row.label}</span>
                <span className="pp-bar-track" aria-hidden="true">
                  <span className="pp-bar-fill" style={{ inlineSize: `${largest > 0 ? (row.value / largest) * 100 : 0}%` }} />
                </span>
                <b className="pp-bar-value pp-num" data-bar-value={row.value}>{count(row.value)}</b>
              </li>
            ))}
          </ul>
        )
      }}
    </PartFrame>
  )
}

// The label stands beside its bar while the part is wide enough, and above it when it is not.
export const BAR_PER_ROW_CSS = `
.pp-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: calc(var(--pad) / 2);
  min-inline-size: 0;
}
.pp-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--pad);
  min-inline-size: 0;
}
.pp-bar-label {
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.pp-bar-track {
  display: block;
  block-size: 0.625rem;
  background: var(--panel-2);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.pp-bar-fill {
  display: block;
  block-size: 100%;
  background: var(--accent);
}
.pp-bar-value {
  font-size: var(--fs-2);
  color: var(--text);
  text-align: end;
}
@container (max-width: 20rem) {
  .pp-bar-row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: calc(var(--pad) / 4);
  }
  .pp-bar-label {
    grid-column: 1 / -1;
  }
}
`
