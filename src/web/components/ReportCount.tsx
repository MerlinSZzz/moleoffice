// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE UNREAD REPORT COUNT IS DRAWN, on the Settings page.
 *
 * The number of reports nobody has read is hidden unless the person turns it on here. One answer serves every
 * browser they read in, because it is kept on the server in their own row, as Home's layout is. The sidebar, the
 * Reports page and All pages read the same answer through src/web/lib/report-count.ts, so pressing this switch
 * changes all of them at once. A failed read draws no number, and no number of nought in its place.
 */

import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { keepReportsCount, useReportsCount } from '../lib/report-count.ts'
import { Panel } from './ui.tsx'

export function ReportCountPanel() {
  useLanguage()
  const shown = useReportsCount()
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const press = (): void => {
    setBusy(true)
    setFault(null)
    void keepReportsCount(!shown)
      .catch((err: unknown) => setFault(errorMessage(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Panel declares={{ surface: 'settings.reportcount' }} titleIs="label" title={t('settingsPanel.title.reportcount')}>
      <style href="mole-office-report-count" precedence="default">
        {REPORT_COUNT_CSS}
      </style>
      <div className="rpc">
        <div className="rpc-row">
          <button
            type="button"
            role="switch"
            aria-checked={shown}
            aria-label={t(settingsControlWord('settings.reportcount', 'settingsPanel.reportcount.show'))}
            className="rpc-switch"
            disabled={busy}
            onClick={press}
          >
            <span className="rpc-knob" aria-hidden="true" />
          </button>
          <span className="rpc-word" aria-hidden="true">
            {t(settingsControlWord('settings.reportcount', shown ? 'settingsPanel.reportcount.on' : 'settingsPanel.reportcount.off'))}
          </span>
        </div>
        {fault === null ? null : <p className="rpc-refuse">{fault}</p>}
      </div>
    </Panel>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const REPORT_COUNT_CSS = `
.rpc { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.rpc-row { display: flex; align-items: center; gap: var(--pad); }
.rpc-switch {
  position: relative; flex: none; width: 44px; height: 24px; padding: 0;
  border: var(--border-w) solid var(--border-strong); border-radius: 12px;
  background: var(--panel); cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
.rpc-switch[aria-checked='true'] { background: var(--accent); border-color: var(--accent); }
.rpc-switch:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.rpc-switch:disabled { cursor: default; opacity: .6; }
.rpc-knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--text-2); transition: left .15s ease, background-color .15s ease;
}
.rpc-switch[aria-checked='true'] .rpc-knob { left: 22px; background: var(--panel); }
.rpc-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.rpc-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (prefers-reduced-motion: reduce) {
  .rpc-switch, .rpc-knob { transition: none; }
}
`
