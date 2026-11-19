// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Agents may inject` — ONE SWITCH FOR EVERY AGENT, ON THE SETTINGS PAGE. Criterion M91.
 *
 * ---------------------------------------------------------------------------------------
 * ONE SWITCH, ON THE SETTINGS PAGE
 * ---------------------------------------------------------------------------------------
 *
 * M91: one setting, on the Settings page, as a toggle.
 * A decision says: one switch for all agents, and the function first; the later work on the
 * interface will reorganise the page. So this is one panel placed among the
 * office's other settings, and nothing else on the page moved.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * A button with `role="switch"` and `aria-checked`, drawn as a track and a knob in the product's own
 * tokens: the accent when on, the panel and the strong border when off. Beside it the word On or
 * Off, so the state is never carried by colour alone. Under it the server's sentence saying the
 * state and whether anybody chose it, and one sentence saying what injecting is.
 *
 * THE STATE DRAWN IS THE STORED ONE. After a press the panel reads the door's answer, so the switch
 * moves only once the office has stored the change. A refused press leaves the switch where it was
 * and draws the refusal under it.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import type { MayInject } from '@shared/profile.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { SettingChangedLine } from './SettingChangedLine.tsx'

export function InjectSwitchPanel() {
  useLanguage()
  const [state] = useAsync(() => api.agentsMayInject(), [])
  if (state.status === 'loading') return <Loading what={t('settingsPanel.inject.loading')} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault} />
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.inject' }} title={t('settingsPanel.title.inject')}>
      <style href="mole-office-inject-switch" precedence="default">
        {INJECT_SWITCH_CSS}
      </style>
      <InjectSwitch first={state.value} />
    </Panel>
  )
}

function InjectSwitch({ first }: { first: MayInject }) {
  useLanguage()
  const [reading, setReading] = useState(first)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const [changeNumber, setChangeNumber] = useState(0)

  const press = (): void => {
    setBusy(true)
    setFault(null)
    api
      .agentsMayInject(!reading.may)
      .then((now) => {
        setReading(now)
        setChangeNumber((number) => number + 1)
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="injs">
      <div className="injs-row">
        <button
          type="button"
          role="switch"
          aria-checked={reading.may}
          aria-label={t(settingsControlWord('settings.inject', 'settingsPanel.inject.agentsMayInject'))}
          className="injs-switch"
          disabled={busy}
          onClick={press}
        >
          <span className="injs-knob" aria-hidden="true" />
        </button>
        <span className="injs-word" aria-hidden="true">
          {t(settingsControlWord('settings.inject', reading.may ? 'settingsPanel.inject.on' : 'settingsPanel.inject.off'))}
        </span>
      </div>
      {/* THE SERVER'S STATE SENTENCE IS ONE OF THREE FROM INJECT_WORDS, picked by the two fields beside it, so the
          page draws the same one in its own language. */}
      <p className="injs-state">
        {t(reading.nobodyChose ? 'settingsPanel.inject.nobodyChose' : reading.may ? 'settingsPanel.inject.switchedOn' : 'settingsPanel.inject.switchedOff')}
      </p>
      <p className="injs-what">{t('settingsPanel.inject.whatItIs')}</p>
      {fault === null ? null : <p className="injs-refuse">{fault}</p>}
      <SettingChangedLine setting="agents-may-inject" refreshKey={changeNumber} />
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it. No backtick inside. */
const INJECT_SWITCH_CSS = `
.injs { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.injs-row { display: flex; align-items: center; gap: var(--pad); }
.injs-switch {
  position: relative; flex: none; width: 44px; height: 24px; padding: 0;
  border: var(--border-w) solid var(--border-strong); border-radius: 12px;
  background: var(--panel); cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
.injs-switch[aria-checked='true'] { background: var(--accent); border-color: var(--accent); }
.injs-switch:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.injs-switch:disabled { cursor: default; opacity: .6; }
.injs-knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--text-2); transition: left .15s ease, background-color .15s ease;
}
.injs-switch[aria-checked='true'] .injs-knob { left: 22px; background: var(--panel); }
.injs-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); }
.injs-state { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-2); }
.injs-what { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3); }
.injs-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (prefers-reduced-motion: reduce) {
  .injs-switch, .injs-knob { transition: none; }
}
`
