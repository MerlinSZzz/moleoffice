// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A picture part: a small table of columns and rows.
import { count, t } from '@shared/i18n.ts'
import type { PartInput, TableData } from '@shared/picture-parts.ts'
import { Absence } from '../ui.tsx'
import { NoRows, PartFrame } from './PartFrame.tsx'

/**
 * A SMALL TABLE: the column titles, then one row per entry. A number is drawn in the number type and lined up at the
 * end of its cell. A cell nobody recorded is the quiet dash, and its sentence is read out to a screen reader, so it is
 * never drawn as 0. The columns share the part's width and the words wrap, so the table never scrolls sideways.
 */
export function SmallTable({ label, state }: PartInput<TableData>) {
  return (
    <PartFrame part="table" label={label} state={state} css={SMALL_TABLE_CSS}>
      {({ columns, rows }) => rows.length === 0 ? <NoRows /> : (
        <table className="pp-table">
          <thead>
            <tr>{columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={typeof cell === 'number' ? 'pp-num pp-table-number' : undefined}>
                    {cell === null ? <Absence title={t('pictureParts.notRecordedSays')} /> : typeof cell === 'number' ? count(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PartFrame>
  )
}

export const SMALL_TABLE_CSS = `
.pp-table {
  inline-size: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
}
.pp-table th,
.pp-table td {
  padding: calc(var(--pad) / 2) var(--pad);
  border-block-end: var(--border-w) solid var(--border);
  text-align: start;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.pp-table th {
  font-weight: var(--heading-weight);
  color: var(--text-2);
}
.pp-table td {
  color: var(--text);
}
.pp-table .pp-table-number {
  text-align: end;
}
`
