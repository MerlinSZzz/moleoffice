// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROWS THAT HOLD A PATH OR A NAME, each beside its label, so that no sentence holds one.
 *
 * Each value is drawn as it came, in a code element, the office's code style. A row may end with a short state word
 * after its value. The data folder panel, the storage destinations panel and the gates panel's spool block draw their
 * paths with these rows.
 */
import { content, t, type WordKey } from '@shared/i18n.ts'
import { Fragment } from 'react'

export interface CodeRow {
  label: WordKey
  value: string
  state?: WordKey
}

export function CodeRows({ rows }: { rows: ReadonlyArray<CodeRow> }): React.ReactElement {
  return (
    <>
      <style href="mole-office-code-rows" precedence="default">
        {CODE_ROWS_CSS}
      </style>
      <dl className="code-rows">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{t(row.label)}</dt>
            <dd>
              <code className="wrap-anywhere">{content(row.value)}</code>
              {row.state === undefined ? null : <span className="code-rows-state">{t(row.state)}</span>}
            </dd>
          </Fragment>
        ))}
      </dl>
    </>
  )
}

const CODE_ROWS_CSS = `
.code-rows {
  display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.25rem var(--pad);
  margin: 0; max-width: var(--measure-in-box);
}
.code-rows dt, .code-rows dd { margin: 0; min-width: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.code-rows dt { color: var(--text-2); }
.code-rows dd { color: var(--text); }
.code-rows-state { margin-left: 0.5em; color: var(--text-2); }
`
