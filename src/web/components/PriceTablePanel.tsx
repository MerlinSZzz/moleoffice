// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Price table` — THE PRICES THE USAGE PAGE ESTIMATES A COST FROM. Criterion U3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS RECORDED AND WHERE THE TABLE LIVES
 * ---------------------------------------------------------------------------------------
 *
 * The usage count records tokens, the model and the agent framework, so that a price can be
 * estimated. The table is one row in the office's database, read and written through
 * `GET/POST /api/office/price-table`. Only the person may set it.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL NAMES ARE THE RECEIPTS' OWN
 * ---------------------------------------------------------------------------------------
 *
 * A price is matched to a run by the exact model name its usage receipt carries. So the models
 * the receipts name and the table does not price are listed here by that exact name, each with
 * empty boxes, read from the same usage door and the same by-model grouping the Usage page draws.
 * The person sees the strings the match will use, rather than a name the office rewrote.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER CHECKS THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * The one shape check is `readPriceTable`, on the server. This panel only leaves out a model
 * whose three boxes are all empty, which means "no price for it". Anything else is sent as typed
 * and a refusal is drawn in the server's own words.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t, type WordKey } from '@shared/i18n.ts'
import type { PriceTable as StoredPriceTable } from '@shared/price-table.ts'
import type { ReceiptUsage } from '@shared/usage-receipts.ts'
import type { WhatThePriceTableDoorSays } from '../../server/lib/price-table.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { TieredPress } from './TieredPress.tsx'
import { SETTINGS_NARROW } from './SettingsFolds.tsx'
import { api, errorMessage, faultOf } from '../api.ts'
import { useLanguage } from '../lib/language.ts'

/** The part of the usage door's answer this panel reads: the receipts' by-model grouping. */
interface UsageReply {
  receipts: ReceiptUsage
}

/** The three boxes of one model, as typed. An empty string is an empty box. */
interface PriceBoxes {
  input: string
  output: string
  cachedInput: string
}

const BOX_NAMES: ReadonlyArray<readonly [keyof PriceBoxes, WordKey]> = [
  ['input', 'settingsPanel.prices.input'],
  ['output', 'settingsPanel.prices.output'],
  ['cachedInput', 'settingsPanel.prices.cachedInput'],
]

/**
 * THE TABLE BEING REMOVED, AS THE PANEL DRAWS IT: its currency, and each model's three rates. The question
 * before a removal quotes this, so the person sees exactly what goes.
 */
function theTableInWords(table: StoredPriceTable): string {
  return [
    t('settingsPanel.prices.quoteCurrency', { currency: table.currency }),
    ...Object.entries(table.prices).map(([model, price]) =>
      t('settingsPanel.prices.quoteRow', {
        model,
        input: String(price.input),
        output: String(price.output),
        cachedInput: String(price.cachedInput),
      }),
    ),
  ].join('\n')
}

export function PriceTablePanel() {
  useLanguage()
  const [table, readAgain] = useAsync(() => api.priceTable(), [])
  const [usage] = useProjectAsync(() => api.usageAgents() as Promise<UsageReply>, [])
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.prices' }} title={t('settingsPanel.title.prices')}>
      <style href="mole-office-price-table" precedence="default">
        {PRICE_TABLE_CSS}
      </style>
      {table.status === 'loading' ? <Loading what={t('settingsPanel.prices.loading')} /> : null}
      {table.status === 'error' ? <ErrorNote message={table.message} fault={table.fault} /> : null}
      {table.status === 'ready' ? (
        <PriceTable
          // A FRESH FORM FOR EACH STORED TABLE, so the boxes show what is stored after a save.
          key={`${table.value.setAt ?? 'none'}:${JSON.stringify(table.value.reading)}`}
          said={table.value}
          receiptModels={
            usage.status === 'ready'
              ? usage.value.receipts.byModel.map((row) => row.name)
              : usage.status === 'error'
                ? { error: usage.message, fault: usage.fault ?? null }
                : null
          }
          onChanged={readAgain}
        />
      ) : null}
    </Panel>
  )
}

function PriceTable({
  said,
  receiptModels,
  onChanged,
}: {
  said: WhatThePriceTableDoorSays
  /** The model names the receipts carry, null while they load, or the reason they could not be read. */
  receiptModels: (string | null)[] | { error: string; fault: ReturnType<typeof faultOf> } | null
  onChanged: () => void
}) {
  useLanguage()
  const stored = said.reading.state === 'set' ? said.reading.table : null
  const [currency, setCurrency] = useState(stored?.currency ?? '')
  const [boxes, setBoxes] = useState<Record<string, PriceBoxes>>(() => {
    const start: Record<string, PriceBoxes> = {}
    for (const [model, price] of Object.entries(stored?.prices ?? {})) {
      start[model] = { input: String(price.input), output: String(price.output), cachedInput: String(price.cachedInput) }
    }
    return start
  })
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = said.refusal !== null || busy

  const priced = Object.keys(stored?.prices ?? {})
  const named = Array.isArray(receiptModels) ? receiptModels : []
  const unpriced = [...new Set(named.filter((model): model is string => model !== null && !priced.includes(model)))]

  const write = (send: () => Promise<WhatThePriceTableDoorSays>): void => {
    setBusy(true)
    setFault(null)
    send()
      .then(() => {
        onChanged()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const save = (): void => {
    const prices: Record<string, Record<string, number>> = {}
    for (const [model, one] of Object.entries(boxes)) {
      const typed = BOX_NAMES.filter(([key]) => one[key].trim() !== '')
      if (typed.length === 0) continue
      prices[model] = Object.fromEntries(typed.map(([key]) => [key, Number(one[key].trim())]))
    }
    write(() => api.setThePriceTable({ currency: currency.trim(), prices }))
  }

  const row = (model: string) => (
    <tr key={model} data-model={model}>
      <th scope="row" className="ptb-model">
        {content(model)}
      </th>
      {BOX_NAMES.map(([key, name]) => (
        <td key={key} data-label={t(settingsControlWord('settings.prices', name))}>
          <input
            className="ptb-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            aria-label={t('settingsPanel.prices.boxLabel', { name: t(settingsControlWord('settings.prices', name)), model })}
            value={boxes[model]?.[key] ?? ''}
            disabled={locked}
            onChange={(event) => {
              const value = event.target.value
              setBoxes((all) => ({
                ...all,
                [model]: { ...(all[model] ?? { input: '', output: '', cachedInput: '' }), [key]: value },
              }))
            }}
          />
        </td>
      ))}
    </tr>
  )

  return (
    <div className="ptb">
      {/* THE UNIT AND THE NO-TABLE SENTENCE are the shared sentences the door sends, said in the page's language. */}
      <p className="ptb-lead">{t('settingsPanel.prices.unit')}</p>
      {said.says !== null ? <p className="ptb-state">{t('settingsPanel.prices.noTable')}</p> : null}
      {said.setAt !== null && said.setBy !== null ? (
        <p className="ptb-state" data-testid="price-table-set-by">
          {t('settingsPanel.prices.setBy', { id: said.setBy.id, at: said.setAt })}
          {said.authority !== null ? ` ${t('settingsPanel.prices.authority', { authority: said.authority })}` : null}
        </p>
      ) : null}
      {said.refusal !== null ? <p className="ptb-refuse">{said.refusal}</p> : null}

      <label className="ptb-currency">
        <span className="ptb-key">{t(settingsControlWord('settings.prices', 'settingsPanel.prices.currency'))}</span>
        <input
          className="ptb-input"
          type="text"
          value={currency}
          disabled={locked}
          onChange={(event) => {
            setCurrency(event.target.value)
          }}
        />
      </label>

      <div className="ptb-across">
        <table className="ptb-table">
          <thead>
            <tr>
              <th scope="col">{t(settingsControlWord('settings.prices', 'settingsPanel.prices.model'))}</th>
              {BOX_NAMES.map(([key, name]) => (
                <th key={key} scope="col">
                  {t(settingsControlWord('settings.prices', name))}
                </th>
              ))}
            </tr>
          </thead>
          {priced.length === 0 ? null : <tbody data-testid="price-table-priced">{priced.map(row)}</tbody>}
          {unpriced.length === 0 ? null : (
            <tbody data-testid="price-table-unpriced">
              <tr>
                <th colSpan={4} scope="rowgroup" className="ptb-group">
                  {t('settingsPanel.prices.unpriced')}
                </th>
              </tr>
              {unpriced.map(row)}
            </tbody>
          )}
        </table>
      </div>
      {receiptModels === null ? <Loading what={t('settingsPanel.prices.loadingModels')} rows={1} /> : null}
      {receiptModels !== null && !Array.isArray(receiptModels) ? <ErrorNote message={receiptModels.error} fault={receiptModels.fault} /> : null}
      {/* The runs whose receipt names no model, or that carry no receipt, are one row on the Usage
          page, which says why they are not priced. Here there is nothing to price for them. */}
      {Array.isArray(receiptModels) && named.every((model) => model === null) ? (
        <p className="ptb-state">{t('settingsPanel.prices.noModelNamed')}</p>
      ) : null}

      <div className="ptb-presses">
        <button type="button" className="ptb-press" onClick={save} disabled={locked}>
          {t(settingsControlWord('settings.prices', 'settingsPanel.prices.save'))}
        </button>
        {stored === null ? null : (
          // ASK FIRST: removing the table takes every estimate away and cannot be undone
          // except by typing the table again, so the question quotes the table that goes.
          <TieredPress
            tier="confirm"
            press={t(settingsControlWord('settings.prices', 'settingsPanel.prices.remove'))}
            pending={t('settingsPanel.prices.removing')}
            disabled={locked}
            question={t('settingsPanel.prices.removeQuestion')}
            quote={theTableInWords(stored)}
            warning={t('settingsPanel.prices.removeWarning')}
            cancel={t('settingsPanel.prices.keepIt')}
            onPress={async () => {
              await api.clearThePriceTable()
              onChanged()
            }}
          />
        )}
      </div>
      {fault === null ? null : <p className="ptb-refuse">{fault}</p>}
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const PRICE_TABLE_CSS = `
.ptb { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.ptb-lead, .ptb-state { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.ptb-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.ptb-currency { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); }
.ptb-key { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.ptb-input {
  width: 7rem; min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.ptb-input:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
/* A TABLE WIDER THAN ITS CARD SCROLLS ACROSS INSIDE IT, so the page does not, and no column is squeezed. */
.ptb-across { min-width: 0; max-width: 100%; overflow-x: auto; }
.ptb-table { border-collapse: collapse; min-width: 0; font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.ptb-table th, .ptb-table td { padding: 4px var(--pad) 4px 0; text-align: left; vertical-align: middle; }
.ptb-table thead th { font-weight: 600; color: var(--text-2); }
/* A MODEL'S NAME IS ONE WORD, drawn on one line: the column is as wide as the longest name. */
.ptb-model { font-family: var(--font-mono, monospace); font-weight: 400; white-space: nowrap; }
.ptb-group { padding-top: var(--pad); font-weight: 600; color: var(--text-2); border-top: var(--border-w) solid var(--border); }
.ptb-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
.ptb-press {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.ptb-press:hover:not(:disabled) { background: var(--hover); }
.ptb-press:disabled { color: var(--text-3); cursor: default; }
${SETTINGS_NARROW} {
  .ptb-table thead { display: none; }
  .ptb-table, .ptb-table tbody, .ptb-table tr { display: block; }
  .ptb-table tr { padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); }
  .ptb-table th, .ptb-table td { display: flex; align-items: center; justify-content: space-between; gap: var(--pad); padding: 2px 0; }
  .ptb-table td::before { content: attr(data-label); color: var(--text-2); }
  .ptb-input { flex: 0 1 7rem; }
}
`
